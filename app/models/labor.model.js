import pool from '../config/db.js';

/**
 * MODELO DEL MODULO DE SERVICIOS AGRICOLAS
 * Labores de cultivo (RF07 a RF12) y sus evidencias fotograficas (RF09).
 */
export const CAMPOS = ['id_contrato', 'id_servicio', 'id_empleado', 'tipo_labor', 'descripcion', 'ubicacion',
  'latitud', 'longitud', 'fecha_programada', 'hora_programada', 'cantidad', 'estado'];

const CONSULTA = `
  SELECT l.*, k.numero_contrato, c.id_cliente, c.nombre_cliente, s.nombre_servicio, s.unidad_medida,
         e.nombre AS empleado,
         (SELECT COUNT(*) FROM evidencia_labor v WHERE v.id_labor = l.id_labor) AS evidencias
  FROM labor l
  JOIN contrato k ON k.id_contrato = l.id_contrato
  JOIN cliente c ON c.id_cliente = k.id_cliente
  JOIN servicio s ON s.id_servicio = l.id_servicio
  JOIN empleado e ON e.id_empleado = l.id_empleado`;

export const listar = async ({ estado, id_empleado, id_contrato, desde, hasta, fecha } = {}) => {
  const cond = [];
  const val = [];
  if (estado) { cond.push('l.estado = ?'); val.push(estado); }
  if (id_empleado) { cond.push('l.id_empleado = ?'); val.push(id_empleado); }
  if (id_contrato) { cond.push('l.id_contrato = ?'); val.push(id_contrato); }
  if (fecha) { cond.push('l.fecha_programada = ?'); val.push(fecha); }
  if (desde) { cond.push('l.fecha_programada >= ?'); val.push(desde); }
  if (hasta) { cond.push('l.fecha_programada <= ?'); val.push(hasta); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const [filas] = await pool.query(`${CONSULTA} ${where} ORDER BY l.fecha_programada DESC, l.hora_programada`, val);
  return filas;
};

export const obtener = async (id, conexion = pool) => {
  const [filas] = await conexion.query(`${CONSULTA} WHERE l.id_labor = ?`, [id]);
  return filas[0];
};

export const crear = async (datos) => {
  const [r] = await pool.query('INSERT INTO labor SET ?', [datos]);
  return r.insertId;
};

export const actualizar = async (id, datos, conexion = pool) => {
  const [r] = await conexion.query('UPDATE labor SET ? WHERE id_labor = ?', [datos, id]);
  return r.affectedRows;
};

export const eliminar = async (id) => {
  const [r] = await pool.query('DELETE FROM labor WHERE id_labor = ?', [id]);
  return r.affectedRows;
};

// Labores activas del mismo trabajador en la misma fecha y hora (validacion de disponibilidad)
export const conflictos = async ({ id_empleado, fecha_programada, hora_programada, excluir }) => {
  const [filas] = await pool.query(
    `SELECT id_labor FROM labor
     WHERE id_empleado = ? AND fecha_programada = ? AND estado IN ('Programada','En proceso')
       AND (hora_programada <=> ?) AND id_labor <> ?`,
    [id_empleado, fecha_programada, hora_programada || null, excluir || 0]
  );
  return filas;
};

export const evidencias = async (idLabor, conImagen = true) => {
  const columnas = conImagen ? 'v.*' : 'v.id_evidencia, v.id_labor, v.comentario, v.latitud, v.longitud, v.fecha_captura';
  const [filas] = await pool.query(`SELECT ${columnas} FROM evidencia_labor v WHERE v.id_labor = ? ORDER BY v.fecha_captura`, [idLabor]);
  return filas;
};

export const agregarEvidencia = async (datos, conexion = pool) => {
  const [r] = await conexion.query('INSERT INTO evidencia_labor SET ?', [datos]);
  return r.insertId;
};

// Avance de las labores por contrato y por estado (RF11)
export const resumen = async ({ desde, hasta } = {}) => {
  const cond = [];
  const val = [];
  if (desde) { cond.push('l.fecha_programada >= ?'); val.push(desde); }
  if (hasta) { cond.push('l.fecha_programada <= ?'); val.push(hasta); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const [porEstado] = await pool.query(`SELECT l.estado, COUNT(*) AS total FROM labor l ${where} GROUP BY l.estado`, val);
  const [porContrato] = await pool.query(
    `SELECT k.numero_contrato, c.nombre_cliente,
            COUNT(*) AS total,
            SUM(l.estado = 'Finalizada') AS finalizadas,
            SUM(l.estado = 'En proceso') AS en_proceso,
            SUM(l.estado = 'Programada') AS programadas,
            ROUND(AVG(CASE WHEN l.estado = 'Finalizada' THEN l.porcentaje_cumplimiento END), 1) AS cumplimiento_promedio
     FROM labor l JOIN contrato k ON k.id_contrato = l.id_contrato JOIN cliente c ON c.id_cliente = k.id_cliente
     ${where}
     GROUP BY k.numero_contrato, c.nombre_cliente
     ORDER BY k.numero_contrato`, val
  );
  return { por_estado: porEstado, por_contrato: porContrato };
};
