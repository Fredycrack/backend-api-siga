import pool from '../config/db.js';

/**
 * MODELO DEL MODULO DE SERVICIOS TECNOLOGICOS
 * Equipos recibidos para reparacion (RF13 a RF17) y repuestos utilizados (RF15).
 */
export const CAMPOS = ['id_cliente', 'id_tecnico', 'tipo_equipo', 'marca', 'modelo', 'serial', 'problema_reportado'];

export const ESTADOS = ['Recibido', 'En diagnostico', 'En proceso', 'Completado', 'Entregado'];

const CONSULTA = `
  SELECT q.*, c.nombre_cliente, c.email AS email_cliente, c.telefono AS telefono_cliente, e.nombre AS tecnico,
         (SELECT COALESCE(SUM(r.cantidad * r.costo_unitario), 0) FROM repuesto_equipo r WHERE r.id_equipo = q.id_equipo) AS costo_repuestos
  FROM equipo q
  JOIN cliente c ON c.id_cliente = q.id_cliente
  LEFT JOIN empleado e ON e.id_empleado = q.id_tecnico`;

export const listar = async ({ estado, id_cliente, id_tecnico } = {}) => {
  const cond = [];
  const val = [];
  if (estado) { cond.push('q.estado = ?'); val.push(estado); }
  if (id_cliente) { cond.push('q.id_cliente = ?'); val.push(id_cliente); }
  if (id_tecnico) { cond.push('q.id_tecnico = ?'); val.push(id_tecnico); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const [filas] = await pool.query(`${CONSULTA} ${where} ORDER BY q.fecha_recepcion DESC`, val);
  return filas;
};

export const obtener = async (id, conexion = pool) => {
  const [filas] = await conexion.query(`${CONSULTA} WHERE q.id_equipo = ?`, [id]);
  return filas[0];
};

export const repuestos = async (id) => {
  const [filas] = await pool.query(
    `SELECT r.*, i.codigo_producto, i.nombre_producto, i.unidad, (r.cantidad * r.costo_unitario) AS subtotal
     FROM repuesto_equipo r JOIN inventario i ON i.id_inventario = r.id_inventario
     WHERE r.id_equipo = ? ORDER BY r.id_repuesto`, [id]
  );
  return filas;
};

// Consulta publica por codigo de seguimiento: sin datos personales del cliente
export const porCodigo = async (codigo) => {
  const [filas] = await pool.query(
    `SELECT codigo_seguimiento, tipo_equipo, marca, modelo, estado, diagnostico, valor_cotizacion,
            cotizacion_aprobada, fecha_recepcion, fecha_entrega
     FROM equipo WHERE codigo_seguimiento = ?`, [codigo]
  );
  return filas[0];
};
