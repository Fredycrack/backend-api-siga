import pool from '../config/db.js';
import { enTransaccion } from '../models/crud.js';
import { Inventario, OrdenCompra, registrarMovimiento, verificarStockMinimo, movimientos } from '../models/inventario.model.js';
import { asyncHandler, HttpError, requerir, limpiar, numeroPositivo } from '../utils/http.js';
import { siguienteNumero } from '../utils/codigos.js';
import { auditar } from '../utils/auditoria.js';

/**
 * CONTROLADOR DEL MODULO DE INVENTARIO
 * CU5.1 Registrar ingreso, CU5.2 Consultar stock, CU5.3 Configurar alertas,
 * CU5.4 Registrar consumo, CU5.5 Generar ordenes, CU5.6 Aprobar ordenes.
 */

export const listar = asyncHandler(async (req, res) => {
  const filtros = { categoria: req.query.categoria, estado: req.query.estado };
  let filas = await Inventario.listar(filtros);
  if (req.query.bajo_minimo === '1') filas = filas.filter((f) => Number(f.bajo_minimo) === 1);
  res.json(filas);
});

export const obtener = asyncHandler(async (req, res) => {
  const p = await Inventario.obtener(req.params.id);
  if (!p) throw new HttpError(404, 'Producto no encontrado');
  res.json({ ...p, movimientos: await movimientos(req.params.id) });
});

// Crear producto; la existencia inicial queda registrada como ingreso
export const crear = asyncHandler(async (req, res) => {
  requerir(req.body, ['codigo_producto', 'nombre_producto', 'categoria', 'unidad']);
  const datos = limpiar(req.body, Inventario.columnas);
  const inicial = Number(req.body.cantidad_disponible) || 0;
  if (inicial < 0) throw new HttpError(400, 'La existencia inicial no puede ser negativa');
  const id = await enTransaccion(async (cx) => {
    const nuevo = await Inventario.crear(datos, cx);
    if (inicial > 0) {
      await registrarMovimiento(cx, { id_inventario: nuevo, tipo: 'Ingreso', cantidad: inicial, referencia: 'Existencia inicial', id_empleado: req.usuario.id });
    }
    return nuevo;
  });
  auditar(req, 'CREAR', 'inventario', id, datos.nombre_producto);
  res.status(201).json({ id, message: 'Producto creado correctamente' });
});

// Actualizar datos del producto y su minimo (RF25); la existencia solo cambia con movimientos
export const actualizar = asyncHandler(async (req, res) => {
  const datos = limpiar(req.body, Inventario.columnas);
  if (datos.cantidad_minima !== undefined && Number(datos.cantidad_minima) < 0) {
    throw new HttpError(400, 'El stock minimo no puede ser negativo');
  }
  const filas = await Inventario.actualizar(req.params.id, datos);
  if (!filas) throw new HttpError(404, 'Producto no encontrado');
  if (datos.cantidad_minima !== undefined) {
    await enTransaccion((cx) => verificarStockMinimo(cx, req.params.id, req.usuario.id));
  }
  auditar(req, 'ACTUALIZAR', 'inventario', req.params.id, Object.keys(datos).join(', '));
  res.json({ message: 'Producto actualizado correctamente' });
});

export const eliminar = asyncHandler(async (req, res) => {
  const filas = await Inventario.eliminar(req.params.id);
  if (!filas) throw new HttpError(404, 'Producto no encontrado');
  auditar(req, 'ELIMINAR', 'inventario', req.params.id);
  res.json({ message: 'Producto eliminado correctamente' });
});

// RF23 - Registrar ingreso de insumos o repuestos
export const ingreso = asyncHandler(async (req, res) => {
  const cantidad = numeroPositivo(req.body.cantidad, 'cantidad');
  await enTransaccion((cx) => registrarMovimiento(cx, {
    id_inventario: req.params.id, tipo: 'Ingreso', cantidad, referencia: req.body.referencia, id_empleado: req.usuario.id
  }));
  auditar(req, 'INGRESO', 'inventario', req.params.id, `+${cantidad}`);
  res.status(201).json({ message: 'Ingreso registrado correctamente' });
});

// RF26 - Registrar consumo de materiales en un servicio
export const consumo = asyncHandler(async (req, res) => {
  const cantidad = numeroPositivo(req.body.cantidad, 'cantidad');
  const r = await enTransaccion((cx) => registrarMovimiento(cx, {
    id_inventario: req.params.id, tipo: 'Consumo', cantidad, referencia: req.body.referencia, id_empleado: req.usuario.id
  }));
  auditar(req, 'CONSUMO', 'inventario', req.params.id, `-${cantidad}`);
  res.status(201).json({ message: 'Consumo registrado correctamente', orden_generada: r.orden_generada });
});

// RF25 - Productos en o por debajo del minimo
export const alertas = asyncHandler(async (req, res) => {
  const [filas] = await pool.query(
    `SELECT i.*, (SELECT o.numero_orden FROM orden_compra o WHERE o.id_inventario = i.id_inventario
                   AND o.estado IN ('Pendiente','Aprobada') ORDER BY o.id_orden DESC LIMIT 1) AS orden_abierta
     FROM inventario i
     WHERE i.estado = 'Activo' AND i.cantidad_disponible <= i.cantidad_minima
     ORDER BY i.nombre_producto`
  );
  res.json(filas);
});

// ---------- Ordenes de compra ----------
export const listarOrdenes = asyncHandler(async (req, res) => {
  res.json(await OrdenCompra.listar({ estado: req.query.estado }));
});

// RF27 - Generar ordenes automaticas para todos los productos bajo el minimo
export const generarOrdenes = asyncHandler(async (req, res) => {
  const generadas = await enTransaccion(async (cx) => {
    const [bajos] = await cx.query("SELECT id_inventario FROM inventario WHERE estado = 'Activo' AND cantidad_disponible <= cantidad_minima");
    const lista = [];
    for (const b of bajos) {
      const o = await verificarStockMinimo(cx, b.id_inventario, req.usuario.id);
      if (o) lista.push(o);
    }
    return lista;
  });
  auditar(req, 'GENERAR', 'orden_compra', null, `${generadas.length} ordenes`);
  res.status(201).json({ message: `${generadas.length} ordenes generadas`, ordenes: generadas });
});

// Orden manual
export const crearOrden = asyncHandler(async (req, res) => {
  requerir(req.body, ['id_inventario', 'cantidad']);
  const cantidad = numeroPositivo(req.body.cantidad, 'cantidad');
  const id = await enTransaccion(async (cx) => {
    const [[p]] = await cx.query('SELECT precio_unitario FROM inventario WHERE id_inventario = ?', [req.body.id_inventario]);
    if (!p) throw new HttpError(404, 'Producto no encontrado');
    const numero = await siguienteNumero(cx, 'orden_compra', 'numero_orden', 'OC');
    const [r] = await cx.query(
      'INSERT INTO orden_compra (numero_orden, id_inventario, cantidad, valor_estimado, automatica, id_solicitante, observaciones) VALUES (?, ?, ?, ?, 0, ?, ?)',
      [numero, req.body.id_inventario, cantidad, cantidad * Number(p.precio_unitario), req.usuario.id, req.body.observaciones || null]
    );
    return r.insertId;
  });
  auditar(req, 'CREAR', 'orden_compra', id);
  res.status(201).json({ id, message: 'Orden de compra creada' });
});

// RF28 - Aprobar o rechazar ordenes (Administrador)
const decidir = (estado) => asyncHandler(async (req, res) => {
  const [r] = await pool.query(
    "UPDATE orden_compra SET estado = ?, id_aprobador = ?, fecha_aprobacion = NOW(), observaciones = COALESCE(?, observaciones) WHERE id_orden = ? AND estado = 'Pendiente'",
    [estado, req.usuario.id, req.body?.observaciones || null, req.params.id]
  );
  if (!r.affectedRows) {
    const o = await OrdenCompra.obtener(req.params.id);
    if (!o) throw new HttpError(404, 'Orden de compra no encontrada');
    throw new HttpError(409, `La orden ya se encuentra ${o.estado.toLowerCase()}`);
  }
  auditar(req, estado === 'Aprobada' ? 'APROBAR' : 'RECHAZAR', 'orden_compra', req.params.id);
  res.json({ message: `Orden ${estado.toLowerCase()}` });
});
export const aprobarOrden = decidir('Aprobada');
export const rechazarOrden = decidir('Rechazada');

// Recepcion de una orden aprobada: suma la cantidad al inventario
export const recibirOrden = asyncHandler(async (req, res) => {
  await enTransaccion(async (cx) => {
    const [[o]] = await cx.query('SELECT * FROM orden_compra WHERE id_orden = ? FOR UPDATE', [req.params.id]);
    if (!o) throw new HttpError(404, 'Orden de compra no encontrada');
    if (o.estado !== 'Aprobada') throw new HttpError(409, 'Solo se pueden recibir ordenes aprobadas');
    await registrarMovimiento(cx, { id_inventario: o.id_inventario, tipo: 'Ingreso', cantidad: o.cantidad, referencia: `Orden ${o.numero_orden}`, id_empleado: req.usuario.id });
    await cx.query("UPDATE orden_compra SET estado = 'Recibida' WHERE id_orden = ?", [o.id_orden]);
  });
  auditar(req, 'RECIBIR', 'orden_compra', req.params.id);
  res.json({ message: 'Orden recibida y existencia actualizada' });
});
