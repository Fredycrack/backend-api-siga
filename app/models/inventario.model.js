import pool from '../config/db.js';
import { crearModelo } from './crud.js';
import { HttpError } from '../utils/http.js';
import { siguienteNumero } from '../utils/codigos.js';

/**
 * MODELO DEL MODULO DE INVENTARIO
 * Productos (RF23 a RF25), movimientos (RF26) y ordenes de compra (RF27, RF28).
 */
export const Inventario = crearModelo({
  tabla: 'inventario',
  id: 'id_inventario',
  columnas: ['codigo_producto', 'nombre_producto', 'categoria', 'unidad', 'cantidad_minima',
    'precio_unitario', 'proveedor', 'ubicacion_almacen', 'estado'],
  consulta: `SELECT i.*, (i.cantidad_disponible <= i.cantidad_minima) AS bajo_minimo FROM inventario i`,
  campoId: 'i.id_inventario',
  prefijo: 'i.',
  orden: 'i.categoria, i.nombre_producto'
});

export const OrdenCompra = crearModelo({
  tabla: 'orden_compra',
  id: 'id_orden',
  columnas: ['id_inventario', 'cantidad', 'valor_estimado', 'estado', 'observaciones'],
  consulta: `SELECT o.*, i.codigo_producto, i.nombre_producto, i.unidad, i.cantidad_disponible, i.cantidad_minima,
                    s.nombre AS solicitante, a.nombre AS aprobador
             FROM orden_compra o
             JOIN inventario i ON i.id_inventario = o.id_inventario
             LEFT JOIN empleado s ON s.id_empleado = o.id_solicitante
             LEFT JOIN empleado a ON a.id_empleado = o.id_aprobador`,
  campoId: 'o.id_orden',
  prefijo: 'o.',
  orden: 'o.fecha_creacion DESC'
});

/**
 * Genera una orden de compra automatica si el producto quedo en o por debajo
 * del minimo y no tiene otra orden pendiente o aprobada (RF27).
 * Cantidad sugerida: lo necesario para llegar al doble del minimo.
 */
export const verificarStockMinimo = async (conexion, idInventario, idEmpleado = null) => {
  const [[p]] = await conexion.query('SELECT * FROM inventario WHERE id_inventario = ?', [idInventario]);
  if (!p || Number(p.cantidad_minima) <= 0 || Number(p.cantidad_disponible) > Number(p.cantidad_minima)) return null;
  const [[abierta]] = await conexion.query(
    "SELECT COUNT(*) AS n FROM orden_compra WHERE id_inventario = ? AND estado IN ('Pendiente','Aprobada')", [idInventario]
  );
  if (abierta.n > 0) return null;
  const cantidad = Math.max(Number(p.cantidad_minima) * 2 - Number(p.cantidad_disponible), Number(p.cantidad_minima));
  const numero = await siguienteNumero(conexion, 'orden_compra', 'numero_orden', 'OC');
  const [r] = await conexion.query(
    'INSERT INTO orden_compra (numero_orden, id_inventario, cantidad, valor_estimado, automatica, id_solicitante) VALUES (?, ?, ?, ?, 1, ?)',
    [numero, idInventario, cantidad, cantidad * Number(p.precio_unitario), idEmpleado]
  );
  return { id_orden: r.insertId, numero_orden: numero };
};

/**
 * Registra un movimiento y actualiza la existencia dentro de la transaccion recibida.
 * Los consumos validan que haya existencia suficiente.
 */
export const registrarMovimiento = async (conexion, { id_inventario, tipo, cantidad, referencia, id_empleado }) => {
  const [[p]] = await conexion.query('SELECT * FROM inventario WHERE id_inventario = ? FOR UPDATE', [id_inventario]);
  if (!p) throw new HttpError(404, 'Producto no encontrado');
  if (p.estado !== 'Activo') throw new HttpError(409, 'El producto esta inactivo');
  const delta = tipo === 'Consumo' ? -Number(cantidad) : Number(cantidad);
  if (tipo === 'Consumo' && Number(p.cantidad_disponible) < Number(cantidad)) {
    throw new HttpError(409, `Existencia insuficiente de ${p.nombre_producto}: hay ${p.cantidad_disponible} ${p.unidad}`);
  }
  await conexion.query('UPDATE inventario SET cantidad_disponible = cantidad_disponible + ? WHERE id_inventario = ?', [delta, id_inventario]);
  await conexion.query(
    'INSERT INTO movimiento_inventario (id_inventario, tipo, cantidad, referencia, id_empleado) VALUES (?, ?, ?, ?, ?)',
    [id_inventario, tipo, cantidad, referencia || null, id_empleado || null]
  );
  let orden = null;
  if (tipo === 'Consumo') orden = await verificarStockMinimo(conexion, id_inventario, id_empleado);
  return { producto: p, orden_generada: orden };
};

export const movimientos = async (idInventario) => {
  const [filas] = await pool.query(
    `SELECT m.*, e.nombre AS empleado FROM movimiento_inventario m
     LEFT JOIN empleado e ON e.id_empleado = m.id_empleado
     WHERE m.id_inventario = ? ORDER BY m.id_movimiento DESC`, [idInventario]
  );
  return filas;
};
