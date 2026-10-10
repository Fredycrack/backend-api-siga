import pool from '../config/db.js';
import { crearModelo, enTransaccion } from '../models/crud.js';
import { registrarMovimiento } from '../models/inventario.model.js';
import { asyncHandler, HttpError, requerir, limpiar, fechaValida, numeroPositivo } from '../utils/http.js';
import { auditar } from '../utils/auditoria.js';

/**
 * CONTROLADOR DEL MODULO DE SEGURIDAD Y SALUD EN EL TRABAJO
 * CU6.1 Registrar capacitaciones, CU6.2 Controlar EPP, CU6.3 Registrar incidentes,
 * CU6.4 Hacer seguimiento, CU6.5/CU6.6 Informes para ARL y Ministerio de Trabajo.
 */

// ---------- Capacitaciones (RF29) ----------
const Capacitacion = crearModelo({
  tabla: 'capacitacion_sst',
  id: 'id_capacitacion',
  columnas: ['tema', 'descripcion', 'fecha_capacitacion', 'hora_inicio', 'hora_fin', 'ubicacion', 'instructor', 'estado']
});

// La consulta agrupa por capacitacion
const listarCapacitacionesSQL = async (where = '', val = []) => {
  const [filas] = await pool.query(
    `SELECT c.id_capacitacion, c.tema, c.descripcion, c.fecha_capacitacion, c.hora_inicio, c.hora_fin, c.ubicacion,
            c.instructor, c.estado, c.fecha_registro,
            COUNT(p.id_participante) AS convocados, COALESCE(SUM(p.asistio), 0) AS asistentes
     FROM capacitacion_sst c LEFT JOIN participante_capacitacion p ON p.id_capacitacion = c.id_capacitacion
     ${where}
     GROUP BY c.id_capacitacion, c.tema, c.descripcion, c.fecha_capacitacion, c.hora_inicio, c.hora_fin, c.ubicacion,
              c.instructor, c.estado, c.fecha_registro
     ORDER BY c.fecha_capacitacion DESC`, val
  );
  return filas;
};

export const listarCapacitaciones = asyncHandler(async (req, res) => {
  const where = req.query.estado ? 'WHERE c.estado = ?' : '';
  res.json(await listarCapacitacionesSQL(where, req.query.estado ? [req.query.estado] : []));
});

const participantes = async (id) => {
  const [filas] = await pool.query(
    `SELECT p.*, e.nombre, e.rol FROM participante_capacitacion p JOIN empleado e ON e.id_empleado = p.id_empleado
     WHERE p.id_capacitacion = ? ORDER BY e.nombre`, [id]
  );
  return filas;
};

export const obtenerCapacitacion = asyncHandler(async (req, res) => {
  const [c] = await listarCapacitacionesSQL('WHERE c.id_capacitacion = ?', [req.params.id]);
  if (!c) throw new HttpError(404, 'Capacitacion no encontrada');
  res.json({ ...c, participantes: await participantes(req.params.id) });
});

export const crearCapacitacion = asyncHandler(async (req, res) => {
  requerir(req.body, ['tema', 'fecha_capacitacion']);
  fechaValida(req.body.fecha_capacitacion, 'fecha_capacitacion');
  const datos = limpiar(req.body, Capacitacion.columnas);
  const id = await enTransaccion(async (cx) => {
    const nuevo = await Capacitacion.crear(datos, cx);
    const ids = Array.isArray(req.body.participantes) ? req.body.participantes : [];
    for (const idEmp of ids) {
      await cx.query('INSERT INTO participante_capacitacion (id_capacitacion, id_empleado) VALUES (?, ?)', [nuevo, idEmp]);
    }
    return nuevo;
  });
  auditar(req, 'CREAR', 'capacitacion_sst', id, datos.tema);
  res.status(201).json({ id, message: 'Capacitacion registrada correctamente' });
});

export const actualizarCapacitacion = asyncHandler(async (req, res) => {
  const datos = limpiar(req.body, Capacitacion.columnas);
  if (datos.fecha_capacitacion) fechaValida(datos.fecha_capacitacion, 'fecha_capacitacion');
  const filas = await Capacitacion.actualizar(req.params.id, datos);
  if (!filas) throw new HttpError(404, 'Capacitacion no encontrada');
  auditar(req, 'ACTUALIZAR', 'capacitacion_sst', req.params.id);
  res.json({ message: 'Capacitacion actualizada correctamente' });
});

export const eliminarCapacitacion = asyncHandler(async (req, res) => {
  const filas = await Capacitacion.eliminar(req.params.id);
  if (!filas) throw new HttpError(404, 'Capacitacion no encontrada');
  auditar(req, 'ELIMINAR', 'capacitacion_sst', req.params.id);
  res.json({ message: 'Capacitacion eliminada correctamente' });
});

// Convocar participantes (reemplaza la lista, conserva la asistencia ya registrada)
export const convocar = asyncHandler(async (req, res) => {
  const ids = (Array.isArray(req.body.empleados) ? req.body.empleados : []).map(Number).filter(Boolean);
  const [[c]] = await pool.query('SELECT id_capacitacion FROM capacitacion_sst WHERE id_capacitacion = ?', [req.params.id]);
  if (!c) throw new HttpError(404, 'Capacitacion no encontrada');
  await enTransaccion(async (cx) => {
    if (ids.length) {
      await cx.query(`DELETE FROM participante_capacitacion WHERE id_capacitacion = ? AND id_empleado NOT IN (${ids.map(() => '?').join(',')})`, [req.params.id, ...ids]);
    } else {
      await cx.query('DELETE FROM participante_capacitacion WHERE id_capacitacion = ?', [req.params.id]);
    }
    for (const idEmp of ids) {
      await cx.query('INSERT IGNORE INTO participante_capacitacion (id_capacitacion, id_empleado) VALUES (?, ?)', [req.params.id, idEmp]);
    }
  });
  auditar(req, 'CONVOCAR', 'capacitacion_sst', req.params.id, `${ids.length} participantes`);
  res.json({ message: `${ids.length} participantes convocados` });
});

// Registrar asistencia a la capacitacion; genera el codigo del certificado
export const asistenciaCapacitacion = asyncHandler(async (req, res) => {
  requerir(req.body, ['id_empleado']);
  const asistio = req.body.asistio === false || req.body.asistio === 0 || req.body.asistio === '0' ? 0 : 1;
  const [r] = await pool.query(
    `UPDATE participante_capacitacion SET asistio = ?, certificado = IF(? = 1, CONCAT('CERT-', id_capacitacion, '-', id_empleado), NULL)
     WHERE id_capacitacion = ? AND id_empleado = ?`,
    [asistio, asistio, req.params.id, req.body.id_empleado]
  );
  if (!r.affectedRows) throw new HttpError(404, 'El empleado no esta convocado a esta capacitacion');
  res.json({ message: asistio ? 'Asistencia registrada' : 'Asistencia retirada' });
});

export const misCapacitaciones = asyncHandler(async (req, res) => {
  const [filas] = await pool.query(
    `SELECT c.*, p.asistio, p.certificado FROM participante_capacitacion p
     JOIN capacitacion_sst c ON c.id_capacitacion = p.id_capacitacion
     WHERE p.id_empleado = ? ORDER BY c.fecha_capacitacion DESC`, [req.usuario.id]
  );
  res.json(filas);
});

// ---------- Elementos de proteccion personal (RF30) ----------
const CONSULTA_EPP = `
  SELECT x.*, e.nombre AS empleado, r.nombre AS responsable,
         (x.fecha_reposicion IS NOT NULL AND x.fecha_reposicion <= DATE_ADD(CURDATE(), INTERVAL 15 DAY)) AS reposicion_proxima
  FROM entrega_epp x JOIN empleado e ON e.id_empleado = x.id_empleado
  LEFT JOIN empleado r ON r.id_empleado = x.id_responsable`;

export const listarEPP = asyncHandler(async (req, res) => {
  const where = req.query.id_empleado ? 'WHERE x.id_empleado = ?' : '';
  const [filas] = await pool.query(`${CONSULTA_EPP} ${where} ORDER BY x.fecha_entrega DESC`, req.query.id_empleado ? [req.query.id_empleado] : []);
  res.json(filas);
});

export const misEPP = asyncHandler(async (req, res) => {
  const [filas] = await pool.query(`${CONSULTA_EPP} WHERE x.id_empleado = ? ORDER BY x.fecha_entrega DESC`, [req.usuario.id]);
  res.json(filas);
});

// Entrega de EPP; si el elemento sale del inventario, se descuenta
export const entregarEPP = asyncHandler(async (req, res) => {
  requerir(req.body, ['id_empleado', 'fecha_entrega']);
  fechaValida(req.body.fecha_entrega, 'fecha_entrega');
  if (req.body.fecha_reposicion) fechaValida(req.body.fecha_reposicion, 'fecha_reposicion');
  const cantidad = numeroPositivo(req.body.cantidad || 1, 'cantidad');
  const resultado = await enTransaccion(async (cx) => {
    let elemento = req.body.elemento;
    let orden = null;
    if (req.body.id_inventario) {
      const mov = await registrarMovimiento(cx, {
        id_inventario: req.body.id_inventario, tipo: 'Consumo', cantidad,
        referencia: `Entrega de EPP al empleado ${req.body.id_empleado}`, id_empleado: req.usuario.id
      });
      elemento = elemento || mov.producto.nombre_producto;
      orden = mov.orden_generada;
    }
    if (!elemento) throw new HttpError(400, 'Indique el elemento entregado');
    const [r] = await cx.query('INSERT INTO entrega_epp SET ?', [{
      id_empleado: req.body.id_empleado, id_inventario: req.body.id_inventario || null, elemento, cantidad,
      fecha_entrega: req.body.fecha_entrega, fecha_reposicion: req.body.fecha_reposicion || null,
      observaciones: req.body.observaciones || null, id_responsable: req.usuario.id
    }]);
    return { id: r.insertId, orden_generada: orden };
  });
  auditar(req, 'ENTREGAR', 'entrega_epp', resultado.id);
  res.status(201).json({ message: 'Entrega de EPP registrada', ...resultado });
});

export const eliminarEPP = asyncHandler(async (req, res) => {
  const [r] = await pool.query('DELETE FROM entrega_epp WHERE id_entrega = ?', [req.params.id]);
  if (!r.affectedRows) throw new HttpError(404, 'Entrega no encontrada');
  auditar(req, 'ELIMINAR', 'entrega_epp', req.params.id);
  res.json({ message: 'Entrega eliminada' });
});

// ---------- Incidentes y accidentes (RF31) ----------
const Incidente = crearModelo({
  tabla: 'incidente',
  id: 'id_incidente',
  columnas: ['tipo', 'fecha_evento', 'lugar', 'id_empleado', 'descripcion', 'gravedad', 'dias_incapacidad',
    'causas', 'acciones_correctivas', 'estado', 'reportado_arl'],
  consulta: `SELECT i.*, e.nombre AS empleado FROM incidente i LEFT JOIN empleado e ON e.id_empleado = i.id_empleado`,
  campoId: 'i.id_incidente',
  prefijo: 'i.',
  orden: 'i.fecha_evento DESC'
});

export const listarIncidentes = asyncHandler(async (req, res) => {
  res.json(await Incidente.listar({ estado: req.query.estado, tipo: req.query.tipo }));
});

export const obtenerIncidente = asyncHandler(async (req, res) => {
  const i = await Incidente.obtener(req.params.id);
  if (!i) throw new HttpError(404, 'Incidente no encontrado');
  res.json(i);
});

export const crearIncidente = asyncHandler(async (req, res) => {
  requerir(req.body, ['tipo', 'fecha_evento', 'lugar', 'descripcion']);
  const datos = limpiar(req.body, Incidente.columnas);
  if (Number(datos.dias_incapacidad) < 0) throw new HttpError(400, 'Los dias de incapacidad no pueden ser negativos');
  const id = await Incidente.crear(datos);
  auditar(req, 'REPORTAR', 'incidente', id, datos.tipo);
  res.status(201).json({ id, message: `${datos.tipo} registrado correctamente` });
});

// Seguimiento: causas, acciones correctivas, estado y reporte a la ARL
export const actualizarIncidente = asyncHandler(async (req, res) => {
  const datos = limpiar(req.body, Incidente.columnas);
  if (datos.estado === 'Cerrado') {
    const actual = await Incidente.obtener(req.params.id);
    if (!actual) throw new HttpError(404, 'Incidente no encontrado');
    if (!(datos.acciones_correctivas || actual.acciones_correctivas)) {
      throw new HttpError(400, 'Registre las acciones correctivas antes de cerrar el caso');
    }
  }
  const filas = await Incidente.actualizar(req.params.id, datos);
  if (!filas) throw new HttpError(404, 'Incidente no encontrado');
  auditar(req, 'SEGUIMIENTO', 'incidente', req.params.id, datos.estado || '');
  res.json({ message: 'Seguimiento registrado' });
});

export const eliminarIncidente = asyncHandler(async (req, res) => {
  const filas = await Incidente.eliminar(req.params.id);
  if (!filas) throw new HttpError(404, 'Incidente no encontrado');
  auditar(req, 'ELIMINAR', 'incidente', req.params.id);
  res.json({ message: 'Incidente eliminado' });
});
