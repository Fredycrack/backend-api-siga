import pool from '../config/db.js';

/**
 * MODELO DEL MODULO DE FACTURACION
 * Facturas (RF33), detalles, pagos y cartera (RF35).
 */
const CONSULTA = `
  SELECT f.*, c.nombre_cliente, c.documento, c.email, c.telefono, c.direccion, c.ciudad, k.numero_contrato,
         (f.estado IN ('Pendiente','Pagada parcialmente') AND f.fecha_vencimiento < CURDATE()) AS vencida
  FROM factura f
  JOIN cliente c ON c.id_cliente = f.id_cliente
  LEFT JOIN contrato k ON k.id_contrato = f.id_contrato`;

export const listar = async ({ estado, id_cliente, desde, hasta } = {}) => {
  const cond = [];
  const val = [];
  if (estado) { cond.push('f.estado = ?'); val.push(estado); }
  if (id_cliente) { cond.push('f.id_cliente = ?'); val.push(id_cliente); }
  if (desde) { cond.push('f.fecha_emision >= ?'); val.push(desde); }
  if (hasta) { cond.push('f.fecha_emision <= ?'); val.push(hasta); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const [filas] = await pool.query(`${CONSULTA} ${where} ORDER BY f.fecha_emision DESC, f.id_factura DESC`, val);
  return filas;
};

export const obtener = async (id, conexion = pool) => {
  const [filas] = await conexion.query(`${CONSULTA} WHERE f.id_factura = ?`, [id]);
  return filas[0];
};

export const detalles = async (id) => {
  const [filas] = await pool.query(
    `SELECT d.*, s.nombre_servicio FROM detalle_factura d LEFT JOIN servicio s ON s.id_servicio = d.id_servicio
     WHERE d.id_factura = ? ORDER BY d.id_detalle`, [id]
  );
  return filas;
};

export const pagos = async (id) => {
  const [filas] = await pool.query(
    `SELECT p.*, e.nombre AS registrado_por FROM pago p LEFT JOIN empleado e ON e.id_empleado = p.id_empleado
     WHERE p.id_factura = ? ORDER BY p.fecha_pago, p.id_pago`, [id]
  );
  return filas;
};

// Estado de cartera por cliente
export const cartera = async () => {
  const [filas] = await pool.query(
    `SELECT c.id_cliente, c.nombre_cliente, c.documento,
            COUNT(f.id_factura) AS facturas,
            COALESCE(SUM(f.total), 0) AS facturado,
            COALESCE(SUM(f.total - f.saldo), 0) AS pagado,
            COALESCE(SUM(f.saldo), 0) AS saldo,
            COALESCE(SUM(CASE WHEN f.fecha_vencimiento < CURDATE() THEN f.saldo ELSE 0 END), 0) AS vencido
     FROM cliente c
     JOIN factura f ON f.id_cliente = c.id_cliente AND f.estado <> 'Anulada'
     GROUP BY c.id_cliente, c.nombre_cliente, c.documento
     ORDER BY saldo DESC`
  );
  return filas;
};
