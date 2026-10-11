import pool from '../config/db.js';
import * as Factura from '../models/factura.model.js';
import { enTransaccion } from '../models/crud.js';
import { asyncHandler, HttpError, requerir, fechaValida, numeroPositivo } from '../utils/http.js';
import { siguienteNumero } from '../utils/codigos.js';
import { facturaPDF } from '../utils/documentos.js';
import { enviarCorreo, correoConfigurado } from '../utils/correo.js';
import { auditar } from '../utils/auditoria.js';

/**
 * CONTROLADOR DEL MODULO DE FACTURACION
 * CU7.1 Generar facturas, CU7.2 Enviar facturas, CU7.3 Registrar pagos,
 * CU7.4 Actualizar cartera, CU7.5 Consultar facturas (portal), CU7.6 Validar facturacion.
 */
const DIAS_PLAZO = { 'Contado': 0, 'Credito 30 dias': 30, 'Credito 60 dias': 60 };
const redondear = (v) => Math.round(v * 100) / 100;

const sumarDias = (fecha, dias) => {
  const d = new Date(`${fecha}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
};

const hoy = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);

// Valida los items y calcula los totales
const calcular = (detalles, porcentajeIva) => {
  if (!Array.isArray(detalles) || !detalles.length) throw new HttpError(400, 'La factura debe tener al menos un item');
  const items = detalles.map((d, i) => {
    if (!d.descripcion) throw new HttpError(400, `El item ${i + 1} no tiene descripcion`);
    const cantidad = numeroPositivo(d.cantidad, `cantidad del item ${i + 1}`);
    const valor = Number(d.valor_unitario);
    if (!Number.isFinite(valor) || valor < 0) throw new HttpError(400, `El valor unitario del item ${i + 1} no es valido`);
    return { descripcion: d.descripcion, cantidad, valor_unitario: valor, subtotal: redondear(cantidad * valor), id_servicio: d.id_servicio || null };
  });
  const subtotal = redondear(items.reduce((s, it) => s + it.subtotal, 0));
  const iva = redondear(subtotal * (porcentajeIva / 100));
  return { items, subtotal, iva, total: redondear(subtotal + iva) };
};

const cargarCompleta = async (id) => {
  const f = await Factura.obtener(id);
  if (!f) throw new HttpError(404, 'Factura no encontrada');
  return { ...f, detalles: await Factura.detalles(id), pagos: await Factura.pagos(id) };
};

// Envio por correo con la factura en PDF adjunta (RF34)
const enviar = async (req, id) => {
  const f = await cargarCompleta(id);
  if (!f.email) throw new HttpError(400, 'El cliente no tiene correo registrado');
  const pdf = await facturaPDF(f, f.detalles, f.pagos);
  await enviarCorreo({
    para: f.email,
    asunto: `Factura ${f.numero_factura} - AGROSERVICES P&D S.A.S.`,
    texto: `Estimado cliente ${f.nombre_cliente}:\n\nAdjuntamos la factura ${f.numero_factura} por valor de $ ${Number(f.total).toLocaleString('es-CO')}, con vencimiento el ${f.fecha_vencimiento}.\n\nAGROSERVICES P&D S.A.S.`,
    adjuntos: [{ filename: `${f.numero_factura}.pdf`, content: pdf }]
  });
  await pool.query('UPDATE factura SET enviada = 1, fecha_envio = NOW() WHERE id_factura = ?', [id]);
  auditar(req, 'ENVIAR', 'factura', id, f.email);
};

const crearFactura = async (req, { id_cliente, id_contrato, fecha_emision, forma_pago, porcentaje_iva, observaciones, detalles }, labores = []) => {
  const fecha = fecha_emision || hoy();
  fechaValida(fecha, 'fecha_emision');
  const forma = forma_pago || 'Credito 30 dias';
  if (!(forma in DIAS_PLAZO)) throw new HttpError(400, 'Forma de pago no valida');
  const iva = porcentaje_iva === undefined || porcentaje_iva === '' ? 19 : Number(porcentaje_iva);
  if (!Number.isFinite(iva) || iva < 0 || iva > 100) throw new HttpError(400, 'Porcentaje de IVA no valido');
  const { items, subtotal, iva: valorIva, total } = calcular(detalles, iva);

  return enTransaccion(async (cx) => {
    const [[cliente]] = await cx.query('SELECT estado FROM cliente WHERE id_cliente = ?', [id_cliente]);
    if (!cliente) throw new HttpError(400, 'El cliente no existe');
    if (id_contrato) {
      const [[k]] = await cx.query('SELECT id_cliente FROM contrato WHERE id_contrato = ?', [id_contrato]);
      if (!k) throw new HttpError(400, 'El contrato no existe');
      if (Number(k.id_cliente) !== Number(id_cliente)) throw new HttpError(400, 'El contrato no pertenece al cliente');
    }
    const numero = await siguienteNumero(cx, 'factura', 'numero_factura', 'FV');
    const [r] = await cx.query('INSERT INTO factura SET ?', [{
      numero_factura: numero, id_cliente, id_contrato: id_contrato || null, fecha_emision: fecha,
      fecha_vencimiento: sumarDias(fecha, DIAS_PLAZO[forma]), subtotal, porcentaje_iva: iva, impuesto_iva: valorIva,
      total, saldo: total, estado: 'Pendiente', forma_pago: forma, observaciones: observaciones || null
    }]);
    for (const it of items) await cx.query('INSERT INTO detalle_factura SET ?', [{ ...it, id_factura: r.insertId }]);
    if (labores.length) {
      await cx.query(`UPDATE labor SET id_factura = ? WHERE id_labor IN (${labores.map(() => '?').join(',')})`, [r.insertId, ...labores]);
    }
    return { id: r.insertId, numero_factura: numero, total };
  });
};

const responderCreacion = async (req, res, resultado) => {
  auditar(req, 'FACTURAR', 'factura', resultado.id, `${resultado.numero_factura} ${resultado.total}`);
  // RF34: si hay correo configurado, la factura se envia automaticamente
  let envio = 'El envio por correo no esta configurado';
  if (correoConfigurado()) {
    try { await enviar(req, resultado.id); envio = 'Factura enviada por correo al cliente'; } catch (e) { envio = `No se pudo enviar: ${e.message}`; }
  }
  res.status(201).json({ ...resultado, envio, message: `Factura ${resultado.numero_factura} generada` });
};

export const listar = asyncHandler(async (req, res) => res.json(await Factura.listar(req.query)));

export const obtener = asyncHandler(async (req, res) => res.json(await cargarCompleta(req.params.id)));

// RF33 - Generar factura con items
export const crear = asyncHandler(async (req, res) => {
  requerir(req.body, ['id_cliente']);
  await responderCreacion(req, res, await crearFactura(req, req.body));
});

// Labores finalizadas de un contrato que aun no se han facturado
const laboresPendientes = async (idContrato, desde, hasta) => {
  const cond = ["l.id_contrato = ?", "l.estado = 'Finalizada'", 'l.id_factura IS NULL'];
  const val = [idContrato];
  if (desde) { cond.push('l.fecha_programada >= ?'); val.push(desde); }
  if (hasta) { cond.push('l.fecha_programada <= ?'); val.push(hasta); }
  const [filas] = await pool.query(
    `SELECT l.id_labor, l.tipo_labor, l.ubicacion, l.fecha_programada, l.cantidad, l.porcentaje_cumplimiento,
            s.id_servicio, s.nombre_servicio, s.unidad_medida, s.tarifa_base
     FROM labor l JOIN servicio s ON s.id_servicio = l.id_servicio
     WHERE ${cond.join(' AND ')} ORDER BY l.fecha_programada`, val
  );
  return filas;
};

export const pendientesPorFacturar = asyncHandler(async (req, res) => {
  requerir(req.query, ['id_contrato']);
  res.json(await laboresPendientes(req.query.id_contrato, req.query.desde, req.query.hasta));
});

// Factura automatica a partir de las labores finalizadas del contrato
export const desdeLabores = asyncHandler(async (req, res) => {
  requerir(req.body, ['id_contrato']);
  const [[k]] = await pool.query('SELECT id_contrato, id_cliente, numero_contrato FROM contrato WHERE id_contrato = ?', [req.body.id_contrato]);
  if (!k) throw new HttpError(404, 'Contrato no encontrado');
  const labores = await laboresPendientes(k.id_contrato, req.body.desde, req.body.hasta);
  if (!labores.length) throw new HttpError(409, 'El contrato no tiene labores finalizadas pendientes por facturar');
  const detalles = labores.map((l) => ({
    descripcion: `${l.nombre_servicio} - ${l.ubicacion} (${l.fecha_programada})`,
    cantidad: Number(l.cantidad) || 1, valor_unitario: Number(l.tarifa_base), id_servicio: l.id_servicio
  }));
  const resultado = await crearFactura(req, {
    id_cliente: k.id_cliente, id_contrato: k.id_contrato, fecha_emision: req.body.fecha_emision,
    forma_pago: req.body.forma_pago, porcentaje_iva: req.body.porcentaje_iva,
    observaciones: req.body.observaciones || `Servicios del contrato ${k.numero_contrato}`, detalles
  }, labores.map((l) => l.id_labor));
  await responderCreacion(req, res, { ...resultado, labores_facturadas: labores.length });
});

// RF34 - Envio manual por correo
export const enviarFactura = asyncHandler(async (req, res) => {
  try {
    await enviar(req, req.params.id);
  } catch (e) {
    if (e.estado === 503) throw new HttpError(503, e.message);
    throw e;
  }
  res.json({ message: 'Factura enviada por correo' });
});

export const pdf = asyncHandler(async (req, res) => {
  const f = await cargarCompleta(req.params.id);
  if (req.usuario.tipo === 'cliente' && Number(f.id_cliente) !== Number(req.usuario.id)) throw new HttpError(404, 'Factura no encontrada');
  const buffer = await facturaPDF(f, f.detalles, f.pagos);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${f.numero_factura}.pdf"`);
  res.send(buffer);
});

// Anular: solo si no tiene pagos; libera las labores facturadas
export const anular = asyncHandler(async (req, res) => {
  await enTransaccion(async (cx) => {
    const [[f]] = await cx.query('SELECT estado, total, saldo FROM factura WHERE id_factura = ? FOR UPDATE', [req.params.id]);
    if (!f) throw new HttpError(404, 'Factura no encontrada');
    if (f.estado === 'Anulada') throw new HttpError(409, 'La factura ya esta anulada');
    if (Number(f.saldo) < Number(f.total)) throw new HttpError(409, 'No se puede anular una factura con pagos registrados');
    await cx.query("UPDATE factura SET estado = 'Anulada', saldo = 0 WHERE id_factura = ?", [req.params.id]);
    await cx.query('UPDATE labor SET id_factura = NULL WHERE id_factura = ?', [req.params.id]);
  });
  auditar(req, 'ANULAR', 'factura', req.params.id, req.body?.motivo || '');
  res.json({ message: 'Factura anulada' });
});

// RF35 - Registrar pago y actualizar la cartera
export const registrarPago = asyncHandler(async (req, res) => {
  requerir(req.body, ['valor']);
  const valor = numeroPositivo(req.body.valor, 'valor');
  const fecha = req.body.fecha_pago || hoy();
  fechaValida(fecha, 'fecha_pago');
  const resultado = await enTransaccion(async (cx) => {
    const [[f]] = await cx.query('SELECT * FROM factura WHERE id_factura = ? FOR UPDATE', [req.params.id]);
    if (!f) throw new HttpError(404, 'Factura no encontrada');
    if (['Anulada', 'Pagada'].includes(f.estado)) throw new HttpError(409, `La factura esta ${f.estado.toLowerCase()}`);
    if (valor > Number(f.saldo) + 0.001) throw new HttpError(400, `El pago supera el saldo pendiente (${f.saldo})`);
    const [r] = await cx.query('INSERT INTO pago SET ?', [{
      id_factura: f.id_factura, fecha_pago: fecha, valor, medio_pago: req.body.medio_pago || 'Transferencia',
      referencia: req.body.referencia || null, id_empleado: req.usuario.id
    }]);
    const saldo = redondear(Number(f.saldo) - valor);
    const estado = saldo <= 0 ? 'Pagada' : 'Pagada parcialmente';
    await cx.query('UPDATE factura SET saldo = ?, estado = ? WHERE id_factura = ?', [Math.max(saldo, 0), estado, f.id_factura]);
    return { id: r.insertId, saldo: Math.max(saldo, 0), estado };
  });
  auditar(req, 'PAGO', 'factura', req.params.id, `${valor}`);
  res.status(201).json({ message: 'Pago registrado', ...resultado });
});

export const cartera = asyncHandler(async (req, res) => res.json(await Factura.cartera()));
