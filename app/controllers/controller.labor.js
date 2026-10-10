import pool from '../config/db.js';
import * as Labor from '../models/labor.model.js';
import { enTransaccion } from '../models/crud.js';
import { asyncHandler, HttpError, requerir, limpiar, fechaValida } from '../utils/http.js';
import { auditar } from '../utils/auditoria.js';

/**
 * CONTROLADOR DEL MODULO DE SERVICIOS AGRICOLAS
 * CU1.1 Programar labores, CU1.2 Registrar inicio, CU1.3 Capturar evidencia,
 * CU1.4 Registrar finalizacion, CU1.5 Consultar estado, CU1.6 Trabajo offline,
 * CU1.7 Obtener ubicacion GPS.
 */

const RADIO_TOLERANCIA_M = 500;
const TAMANO_MAX_IMAGEN = 3 * 1024 * 1024; // caracteres de la imagen en base64

// Distancia en metros entre dos coordenadas (formula del haversino)
export const distanciaMetros = (lat1, lon1, lat2, lon2) => {
  const r = 6371000;
  const rad = (g) => (Number(g) * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * r * Math.asin(Math.sqrt(a)));
};

const coordenada = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

// Fecha y hora de la accion: la del dispositivo si se registro sin conexion
const fechaAccion = (valor) => {
  if (!valor) return null;
  const f = new Date(valor);
  if (Number.isNaN(f.getTime())) throw new HttpError(400, 'Fecha y hora de la accion no valida');
  if (f.getTime() > Date.now() + 5 * 60 * 1000) throw new HttpError(400, 'La fecha de la accion no puede ser futura');
  // Se expresa en hora de Colombia (UTC-5)
  const local = new Date(f.getTime() - 5 * 3600 * 1000);
  return local.toISOString().slice(0, 19).replace('T', ' ');
};

// Un trabajador de campo solo puede ver y operar sus propias labores
const verificarPropietario = (req, labor) => {
  if (req.usuario.rol === 'Trabajador de Campo' && Number(labor.id_empleado) !== Number(req.usuario.id)) {
    throw new HttpError(403, 'La labor esta asignada a otro trabajador');
  }
};

const cargar = async (req, id, conexion) => {
  const labor = await Labor.obtener(id, conexion);
  if (!labor) throw new HttpError(404, 'Labor no encontrada');
  verificarPropietario(req, labor);
  return labor;
};

// Validaciones de la programacion (CU1.1)
const validarProgramacion = async (datos, idExcluir = null) => {
  if (datos.fecha_programada) fechaValida(datos.fecha_programada, 'fecha_programada');
  if (datos.id_empleado) {
    const [[e]] = await pool.query('SELECT rol, estado FROM empleado WHERE id_empleado = ?', [datos.id_empleado]);
    if (!e) throw new HttpError(400, 'El trabajador asignado no existe');
    if (e.rol !== 'Trabajador de Campo') throw new HttpError(400, 'Solo se pueden asignar labores a trabajadores de campo');
    if (e.estado !== 'Activo') throw new HttpError(400, 'El trabajador asignado esta inactivo');
  }
  if (datos.id_contrato) {
    const [[k]] = await pool.query('SELECT estado, fecha_inicio, fecha_fin FROM contrato WHERE id_contrato = ?', [datos.id_contrato]);
    if (!k) throw new HttpError(400, 'El contrato no existe');
    if (k.estado !== 'Vigente') throw new HttpError(400, 'El contrato no esta vigente');
    if (datos.fecha_programada && (datos.fecha_programada < k.fecha_inicio || datos.fecha_programada > k.fecha_fin)) {
      throw new HttpError(400, `La fecha debe estar dentro de la vigencia del contrato (${k.fecha_inicio} a ${k.fecha_fin})`);
    }
  }
  if (datos.id_servicio) {
    const [[s]] = await pool.query('SELECT tipo_servicio FROM servicio WHERE id_servicio = ?', [datos.id_servicio]);
    if (!s) throw new HttpError(400, 'El servicio no existe');
    if (s.tipo_servicio !== 'Agricola') throw new HttpError(400, 'Las labores deben corresponder a un servicio agricola');
  }
  if (datos.id_empleado && datos.fecha_programada) {
    const choques = await Labor.conflictos({ ...datos, excluir: idExcluir });
    if (choques.length) throw new HttpError(409, 'El trabajador ya tiene una labor programada en esa fecha y hora');
  }
};

export const listar = asyncHandler(async (req, res) => {
  const filtros = { ...req.query };
  if (req.usuario.rol === 'Trabajador de Campo') filtros.id_empleado = req.usuario.id;
  res.json(await Labor.listar(filtros));
});

export const obtener = asyncHandler(async (req, res) => {
  const labor = await cargar(req, req.params.id);
  res.json({ ...labor, lista_evidencias: await Labor.evidencias(req.params.id, false) });
});

// RF07 - Programar labor asignando personal, fecha y ubicacion
export const crear = asyncHandler(async (req, res) => {
  requerir(req.body, ['id_contrato', 'id_servicio', 'id_empleado', 'tipo_labor', 'ubicacion', 'fecha_programada']);
  const datos = limpiar(req.body, Labor.CAMPOS);
  delete datos.estado;
  await validarProgramacion(datos);
  const id = await Labor.crear(datos);
  auditar(req, 'PROGRAMAR', 'labor', id, `${datos.tipo_labor} ${datos.fecha_programada}`);
  res.status(201).json({ id, message: 'Labor programada correctamente' });
});

export const actualizar = asyncHandler(async (req, res) => {
  const actual = await Labor.obtener(req.params.id);
  if (!actual) throw new HttpError(404, 'Labor no encontrada');
  const datos = limpiar(req.body, Labor.CAMPOS);
  if (datos.estado && !['Programada', 'Cancelada'].includes(datos.estado)) {
    throw new HttpError(400, 'Desde aqui solo se puede reprogramar o cancelar; el inicio y el cierre los registra el trabajador');
  }
  if (actual.estado === 'Finalizada') throw new HttpError(409, 'No se puede modificar una labor finalizada');
  const soloCancela = Object.keys(datos).length === 1 && datos.estado === 'Cancelada';
  if (!soloCancela) await validarProgramacion({
    id_empleado: datos.id_empleado ?? actual.id_empleado,
    fecha_programada: datos.fecha_programada ?? actual.fecha_programada,
    hora_programada: datos.hora_programada !== undefined ? datos.hora_programada : actual.hora_programada,
    id_contrato: datos.id_contrato ?? actual.id_contrato,
    id_servicio: datos.id_servicio
  }, req.params.id);
  await Labor.actualizar(req.params.id, datos);
  auditar(req, 'ACTUALIZAR', 'labor', req.params.id, Object.keys(datos).join(', '));
  res.json({ message: 'Labor actualizada correctamente' });
});

export const eliminar = asyncHandler(async (req, res) => {
  const actual = await Labor.obtener(req.params.id);
  if (!actual) throw new HttpError(404, 'Labor no encontrada');
  if (actual.estado !== 'Programada') throw new HttpError(409, 'Solo se pueden eliminar labores que no han iniciado; las demas se cancelan');
  await Labor.eliminar(req.params.id);
  auditar(req, 'ELIMINAR', 'labor', req.params.id);
  res.json({ message: 'Labor eliminada correctamente' });
});

// ---------- Operaciones del trabajador de campo ----------

// RF08 - Registrar inicio con geolocalizacion GPS
const iniciarLabor = async (req, id, cuerpo, offline = false, conexion) => {
  const labor = await cargar(req, id, conexion);
  if (labor.estado !== 'Programada') throw new HttpError(409, `La labor no se puede iniciar porque esta ${labor.estado.toLowerCase()}`);
  const lat = coordenada(cuerpo.latitud);
  const lon = coordenada(cuerpo.longitud);
  let advertencia = null;
  if (lat === null || lon === null) {
    advertencia = 'Inicio registrado sin ubicacion GPS: queda pendiente de validacion';
  } else if (labor.latitud !== null && labor.longitud !== null) {
    const d = distanciaMetros(lat, lon, labor.latitud, labor.longitud);
    if (d > RADIO_TOLERANCIA_M) advertencia = `El inicio se registro a ${d} m del lugar programado`;
  }
  const hora = fechaAccion(cuerpo.fecha_hora);
  await (conexion || pool).query(
    `UPDATE labor SET estado = 'En proceso', hora_inicio = COALESCE(?, NOW()), lat_inicio = ?, lon_inicio = ?,
            registrada_offline = registrada_offline OR ? WHERE id_labor = ?`,
    [hora, lat, lon, offline ? 1 : 0, id]
  );
  return { message: 'Inicio de la labor registrado', advertencia };
};

// RF09 - Capturar evidencia fotografica
const agregarEvidencia = async (req, id, cuerpo, offline = false, conexion) => {
  const labor = await cargar(req, id, conexion);
  if (labor.estado !== 'En proceso') throw new HttpError(409, 'Solo se registran evidencias de labores en proceso');
  const imagen = String(cuerpo.imagen || '');
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(imagen)) throw new HttpError(400, 'La evidencia debe ser una imagen JPEG, PNG o WEBP');
  if (imagen.length > TAMANO_MAX_IMAGEN) throw new HttpError(413, 'La imagen supera el tamano permitido');
  const idEvidencia = await Labor.agregarEvidencia({
    id_labor: id, imagen, comentario: cuerpo.comentario || null,
    latitud: coordenada(cuerpo.latitud), longitud: coordenada(cuerpo.longitud),
    fecha_captura: fechaAccion(cuerpo.fecha_hora) || fechaAccion(new Date().toISOString())
  }, conexion);
  if (offline) await (conexion || pool).query('UPDATE labor SET registrada_offline = 1 WHERE id_labor = ?', [id]);
  return { id: idEvidencia, message: 'Evidencia registrada' };
};

// RF10 - Registrar finalizacion con reporte de cumplimiento
const finalizarLabor = async (req, id, cuerpo, offline = false, conexion) => {
  const labor = await cargar(req, id, conexion);
  if (labor.estado !== 'En proceso') throw new HttpError(409, 'Solo se pueden finalizar labores en proceso');
  requerir(cuerpo, ['resultado', 'porcentaje_cumplimiento']);
  const porcentaje = Number(cuerpo.porcentaje_cumplimiento);
  if (!Number.isInteger(porcentaje) || porcentaje < 0 || porcentaje > 100) {
    throw new HttpError(400, 'El porcentaje de cumplimiento debe ser un entero entre 0 y 100');
  }
  const hora = fechaAccion(cuerpo.fecha_hora);
  await (conexion || pool).query(
    `UPDATE labor SET estado = 'Finalizada', hora_fin = COALESCE(?, NOW()), lat_fin = ?, lon_fin = ?, resultado = ?,
            porcentaje_cumplimiento = ?, registrada_offline = registrada_offline OR ? WHERE id_labor = ?`,
    [hora, coordenada(cuerpo.latitud), coordenada(cuerpo.longitud), cuerpo.resultado, porcentaje, offline ? 1 : 0, id]
  );
  return { message: 'Labor finalizada' };
};

export const iniciar = asyncHandler(async (req, res) => {
  const r = await iniciarLabor(req, req.params.id, req.body);
  auditar(req, 'INICIAR', 'labor', req.params.id);
  res.json(r);
});

export const evidencia = asyncHandler(async (req, res) => {
  const r = await agregarEvidencia(req, req.params.id, req.body);
  res.status(201).json(r);
});

export const listarEvidencias = asyncHandler(async (req, res) => {
  await cargar(req, req.params.id);
  res.json(await Labor.evidencias(req.params.id, true));
});

export const finalizar = asyncHandler(async (req, res) => {
  const r = await finalizarLabor(req, req.params.id, req.body);
  auditar(req, 'FINALIZAR', 'labor', req.params.id);
  res.json(r);
});

// RF12 - Sincronizar las acciones registradas sin conexion (RNF10)
export const sincronizar = asyncHandler(async (req, res) => {
  const acciones = Array.isArray(req.body.acciones) ? req.body.acciones : [];
  if (!acciones.length) throw new HttpError(400, 'No hay acciones para sincronizar');
  const ordenadas = [...acciones].sort((a, b) => new Date(a.fecha_hora || 0) - new Date(b.fecha_hora || 0));
  const resultados = [];
  for (const a of ordenadas) {
    try {
      const cuerpo = { ...(a.datos || {}), fecha_hora: a.fecha_hora };
      const fn = { iniciar: iniciarLabor, evidencia: agregarEvidencia, finalizar: finalizarLabor }[a.tipo];
      if (!fn) throw new HttpError(400, `Accion desconocida: ${a.tipo}`);
      const r = await enTransaccion((cx) => fn(req, a.id_labor, cuerpo, true, cx));
      resultados.push({ id_local: a.id_local, ok: true, ...r });
    } catch (e) {
      resultados.push({ id_local: a.id_local, ok: false, error: e.message });
    }
  }
  auditar(req, 'SINCRONIZAR', 'labor', null, `${resultados.filter((r) => r.ok).length}/${resultados.length} acciones`);
  res.json({ resultados });
});

// RF11 - Consultar el avance de las labores
export const resumen = asyncHandler(async (req, res) => {
  res.json(await Labor.resumen(req.query));
});
