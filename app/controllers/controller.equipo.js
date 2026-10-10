import pool from '../config/db.js';
import * as Equipo from '../models/equipo.model.js';
import { registrarMovimiento } from '../models/inventario.model.js';
import { enTransaccion } from '../models/crud.js';
import { asyncHandler, HttpError, requerir, limpiar, numeroPositivo, fechaAccion } from '../utils/http.js';
import { codigoSeguimiento } from '../utils/codigos.js';
import { auditar } from '../utils/auditoria.js';

/**
 * CONTROLADOR DEL MODULO DE SERVICIOS TECNOLOGICOS
 * CU2.1 Registrar equipos, CU2.2 Realizar diagnostico, CU2.3 Registrar repuestos,
 * CU2.4 Actualizar estado, CU2.5 Consultar estado del equipo, CU2.7 Generar cotizacion.
 */

const cargar = async (id, conexion) => {
  const equipo = await Equipo.obtener(id, conexion);
  if (!equipo) throw new HttpError(404, 'Equipo no encontrado');
  return equipo;
};

export const listar = asyncHandler(async (req, res) => {
  res.json(await Equipo.listar(req.query));
});

export const obtener = asyncHandler(async (req, res) => {
  const equipo = await cargar(req.params.id);
  res.json({ ...equipo, repuestos: await Equipo.repuestos(req.params.id) });
});

// RF13 - Registrar equipo recibido con la descripcion del problema
export const crear = asyncHandler(async (req, res) => {
  requerir(req.body, ['id_cliente', 'tipo_equipo', 'problema_reportado']);
  const datos = limpiar(req.body, Equipo.CAMPOS);
  if (!datos.id_tecnico && req.usuario.rol === 'Tecnico Electronico') datos.id_tecnico = req.usuario.id;
  // Codigo unico de seguimiento para el cliente (RF17)
  let id;
  for (let intento = 0; intento < 5 && !id; intento++) {
    datos.codigo_seguimiento = codigoSeguimiento();
    try {
      const [r] = await pool.query('INSERT INTO equipo SET ?', [datos]);
      id = r.insertId;
    } catch (e) {
      if (e.code !== 'ER_DUP_ENTRY' || !String(e.sqlMessage).includes(datos.codigo_seguimiento)) throw e;
    }
  }
  auditar(req, 'RECIBIR', 'equipo', id, datos.codigo_seguimiento);
  res.status(201).json({ id, codigo_seguimiento: datos.codigo_seguimiento, message: 'Equipo registrado correctamente' });
});

export const actualizar = asyncHandler(async (req, res) => {
  await cargar(req.params.id);
  const datos = limpiar(req.body, Equipo.CAMPOS);
  if (Object.keys(datos).length) await pool.query('UPDATE equipo SET ? WHERE id_equipo = ?', [datos, req.params.id]);
  auditar(req, 'ACTUALIZAR', 'equipo', req.params.id, Object.keys(datos).join(', '));
  res.json({ message: 'Equipo actualizado correctamente' });
});

export const eliminar = asyncHandler(async (req, res) => {
  const equipo = await cargar(req.params.id);
  if (equipo.estado !== 'Recibido') throw new HttpError(409, 'Solo se pueden eliminar equipos que aun no se han diagnosticado');
  await pool.query('DELETE FROM equipo WHERE id_equipo = ?', [req.params.id]);
  auditar(req, 'ELIMINAR', 'equipo', req.params.id);
  res.json({ message: 'Equipo eliminado correctamente' });
});

// ---------- Operaciones del tecnico (en linea o sincronizadas, RF18) ----------
// Cada operacion recibe la conexion para poder ejecutarse dentro de una transaccion.

// RF14 - Diagnostico y cotizacion de la reparacion
const diagnosticar = async (req, id, cuerpo, cx = pool) => {
  requerir(cuerpo, ['diagnostico', 'valor_cotizacion']);
  const valor = Number(cuerpo.valor_cotizacion);
  if (!Number.isFinite(valor) || valor < 0) throw new HttpError(400, 'El valor de la cotizacion no es valido');
  const equipo = await cargar(id, cx);
  if (['Completado', 'Entregado'].includes(equipo.estado)) throw new HttpError(409, 'El equipo ya fue reparado');
  await cx.query(
    "UPDATE equipo SET diagnostico = ?, valor_cotizacion = ?, estado = IF(estado = 'Recibido', 'En diagnostico', estado) WHERE id_equipo = ?",
    [cuerpo.diagnostico, valor, id]
  );
  return { message: 'Diagnostico y cotizacion registrados', detalle: `cotizacion ${valor}` };
};

// Aprobacion de la cotizacion (el cliente desde el portal o el tecnico al recibir la aprobacion)
const aprobar = async (req, id, cuerpo, cx = pool) => {
  const equipo = await cargar(id, cx);
  if (req.usuario.tipo === 'cliente' && Number(equipo.id_cliente) !== Number(req.usuario.id)) {
    throw new HttpError(404, 'Equipo no encontrado');
  }
  if (equipo.valor_cotizacion === null) throw new HttpError(409, 'El equipo aun no tiene cotizacion');
  await cx.query('UPDATE equipo SET cotizacion_aprobada = 1 WHERE id_equipo = ?', [id]);
  return { message: 'Cotizacion aprobada' };
};

// RF16 - Actualizar el estado de la reparacion, en orden
const avanzarEstado = async (req, id, cuerpo, cx = pool) => {
  requerir(cuerpo, ['estado']);
  const nuevo = cuerpo.estado;
  const iNuevo = Equipo.ESTADOS.indexOf(nuevo);
  if (iNuevo < 0) throw new HttpError(400, `Estado no valido. Opciones: ${Equipo.ESTADOS.join(', ')}`);
  const equipo = await cargar(id, cx);
  const iActual = Equipo.ESTADOS.indexOf(equipo.estado);
  if (iNuevo <= iActual) throw new HttpError(409, `El equipo ya esta ${equipo.estado.toLowerCase()}`);
  if (iNuevo >= 2 && !equipo.diagnostico) throw new HttpError(409, 'Registre el diagnostico antes de iniciar la reparacion');
  if (iNuevo >= 2 && !equipo.cotizacion_aprobada) throw new HttpError(409, 'La cotizacion debe estar aprobada antes de iniciar la reparacion');
  await cx.query(
    "UPDATE equipo SET estado = ?, fecha_entrega = IF(? = 'Entregado', COALESCE(?, NOW()), fecha_entrega) WHERE id_equipo = ?",
    [nuevo, nuevo, fechaAccion(cuerpo.fecha_hora), id]
  );
  return { message: `Estado actualizado a ${nuevo}`, detalle: nuevo };
};

// RF15 y RF26 - Registrar repuesto utilizado: descuenta el inventario
const registrarRepuesto = async (req, id, cuerpo, cx) => {
  requerir(cuerpo, ['id_inventario', 'cantidad']);
  const cantidad = numeroPositivo(cuerpo.cantidad, 'cantidad');
  const equipo = await cargar(id, cx);
  if (['Completado', 'Entregado'].includes(equipo.estado)) throw new HttpError(409, 'El equipo ya fue reparado');
  const mov = await registrarMovimiento(cx, {
    id_inventario: cuerpo.id_inventario, tipo: 'Consumo', cantidad,
    referencia: `Equipo ${equipo.codigo_seguimiento}`, id_empleado: req.usuario.id
  });
  const [ins] = await cx.query(
    'INSERT INTO repuesto_equipo (id_equipo, id_inventario, cantidad, costo_unitario) VALUES (?, ?, ?, ?)',
    [id, cuerpo.id_inventario, cantidad, mov.producto.precio_unitario]
  );
  return {
    message: 'Repuesto registrado y descontado del inventario', id: ins.insertId,
    orden_generada: mov.orden_generada, detalle: `producto ${cuerpo.id_inventario} x ${cantidad}`
  };
};

const OPERACIONES = {
  diagnostico: { fn: diagnosticar, accion: 'DIAGNOSTICAR', transaccion: false },
  aprobar: { fn: aprobar, accion: 'APROBAR_COTIZACION', transaccion: false },
  estado: { fn: avanzarEstado, accion: 'ESTADO', transaccion: false },
  repuesto: { fn: registrarRepuesto, accion: 'REPUESTO', transaccion: true }
};

const responder = (tipo, codigo = 200) => asyncHandler(async (req, res) => {
  const op = OPERACIONES[tipo];
  const r = op.transaccion
    ? await enTransaccion((cx) => op.fn(req, req.params.id, req.body, cx))
    : await op.fn(req, req.params.id, req.body);
  auditar(req, op.accion, 'equipo', req.params.id, r.detalle);
  const { detalle, ...cuerpo } = r;
  res.status(codigo).json(cuerpo);
});

export const diagnostico = responder('diagnostico');
export const aprobarCotizacion = responder('aprobar');
export const cambiarEstado = responder('estado');
export const agregarRepuesto = responder('repuesto', 201);

// RF18 - Sincronizar el trabajo del tecnico registrado sin conexion
export const sincronizar = asyncHandler(async (req, res) => {
  const acciones = Array.isArray(req.body.acciones) ? req.body.acciones : [];
  if (!acciones.length) throw new HttpError(400, 'No hay acciones para sincronizar');
  const ordenadas = [...acciones].sort((a, b) => new Date(a.fecha_hora || 0) - new Date(b.fecha_hora || 0));
  const resultados = [];
  for (const a of ordenadas) {
    try {
      const op = OPERACIONES[a.tipo];
      if (!op) throw new HttpError(400, `Accion desconocida: ${a.tipo}`);
      const cuerpo = { ...(a.datos || {}), fecha_hora: a.fecha_hora };
      const r = await enTransaccion((cx) => op.fn(req, a.id_equipo, cuerpo, cx));
      auditar(req, op.accion, 'equipo', a.id_equipo, `${r.detalle || ''} (sin conexion)`.trim());
      const { detalle, ...cuerpoRespuesta } = r;
      resultados.push({ id_local: a.id_local, ok: true, ...cuerpoRespuesta });
    } catch (e) {
      resultados.push({ id_local: a.id_local, ok: false, error: e.message });
    }
  }
  res.json({ resultados });
});

// RF17 - Consulta publica del estado por codigo de seguimiento
export const seguimiento = asyncHandler(async (req, res) => {
  const codigo = String(req.params.codigo || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6,20}$/.test(codigo)) throw new HttpError(400, 'Codigo de seguimiento no valido');
  const equipo = await Equipo.porCodigo(codigo);
  if (!equipo) throw new HttpError(404, 'No existe un equipo con ese codigo de seguimiento');
  res.json(equipo);
});
