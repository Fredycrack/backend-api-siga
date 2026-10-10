import pool from '../config/db.js';
import * as Factura from '../models/factura.model.js';
import * as Equipo from '../models/equipo.model.js';
import { asyncHandler, HttpError, requerir, fechaValida } from '../utils/http.js';
import { auditar } from '../utils/auditoria.js';

/**
 * CONTROLADOR DEL PORTAL DE CLIENTES
 * RF06 Programar servicios, RF17 Consultar el estado de los equipos,
 * RF36 Consultar facturas pendientes.
 */

export const resumen = asyncHandler(async (req, res) => {
  const id = req.usuario.id;
  const [[f]] = await pool.query(
    `SELECT COUNT(*) AS pendientes, COALESCE(SUM(saldo), 0) AS saldo,
            COALESCE(SUM(CASE WHEN fecha_vencimiento < CURDATE() THEN saldo ELSE 0 END), 0) AS vencido
     FROM factura WHERE id_cliente = ? AND estado IN ('Pendiente','Pagada parcialmente')`, [id]
  );
  const [[e]] = await pool.query("SELECT COUNT(*) AS en_taller FROM equipo WHERE id_cliente = ? AND estado <> 'Entregado'", [id]);
  const [[s]] = await pool.query("SELECT COUNT(*) AS pendientes FROM solicitud_servicio WHERE id_cliente = ? AND estado = 'Pendiente'", [id]);
  const [[l]] = await pool.query(
    `SELECT COUNT(*) AS programadas FROM labor l JOIN contrato k ON k.id_contrato = l.id_contrato
     WHERE k.id_cliente = ? AND l.estado IN ('Programada','En proceso') AND l.fecha_programada >= CURDATE()`, [id]
  );
  res.json({ facturas: f, equipos: e, solicitudes: s, labores: l });
});

export const servicios = asyncHandler(async (req, res) => {
  const [filas] = await pool.query("SELECT id_servicio, nombre_servicio, tipo_servicio, descripcion, unidad_medida, tarifa_base FROM servicio WHERE estado = 'Activo' ORDER BY tipo_servicio, nombre_servicio");
  res.json(filas);
});

// RF06 - Programar un nuevo servicio mediante formulario web
export const crearSolicitud = asyncHandler(async (req, res) => {
  requerir(req.body, ['id_servicio', 'fecha_deseada']);
  fechaValida(req.body.fecha_deseada, 'fecha_deseada');
  const [[s]] = await pool.query('SELECT (? >= CURDATE()) AS futura', [req.body.fecha_deseada]);
  if (!s.futura) throw new HttpError(400, 'La fecha deseada no puede ser anterior a hoy');
  const [[serv]] = await pool.query("SELECT id_servicio FROM servicio WHERE id_servicio = ? AND estado = 'Activo'", [req.body.id_servicio]);
  if (!serv) throw new HttpError(400, 'El servicio no existe o no esta disponible');
  const [r] = await pool.query(
    'INSERT INTO solicitud_servicio (id_cliente, id_servicio, fecha_deseada, ubicacion, descripcion) VALUES (?, ?, ?, ?, ?)',
    [req.usuario.id, req.body.id_servicio, req.body.fecha_deseada, req.body.ubicacion || null, req.body.descripcion || null]
  );
  auditar(req, 'SOLICITAR', 'solicitud_servicio', r.insertId);
  res.status(201).json({ id: r.insertId, message: 'Solicitud registrada; la empresa le confirmara la programacion' });
});

export const misSolicitudes = asyncHandler(async (req, res) => {
  const [filas] = await pool.query(
    `SELECT so.*, s.nombre_servicio, s.tipo_servicio FROM solicitud_servicio so JOIN servicio s ON s.id_servicio = so.id_servicio
     WHERE so.id_cliente = ? ORDER BY so.fecha_registro DESC`, [req.usuario.id]
  );
  res.json(filas);
});

export const misEquipos = asyncHandler(async (req, res) => {
  const filas = await Equipo.listar({ id_cliente: req.usuario.id });
  res.json(filas.map(({ email_cliente, telefono_cliente, costo_repuestos, ...resto }) => resto));
});

export const misFacturas = asyncHandler(async (req, res) => {
  res.json(await Factura.listar({ id_cliente: req.usuario.id, estado: req.query.estado }));
});

export const miFactura = asyncHandler(async (req, res) => {
  const f = await Factura.obtener(req.params.id);
  if (!f || Number(f.id_cliente) !== Number(req.usuario.id)) throw new HttpError(404, 'Factura no encontrada');
  res.json({ ...f, detalles: await Factura.detalles(req.params.id), pagos: await Factura.pagos(req.params.id) });
});

export const misLabores = asyncHandler(async (req, res) => {
  const [filas] = await pool.query(
    `SELECT l.id_labor, l.tipo_labor, l.ubicacion, l.fecha_programada, l.hora_programada, l.estado, l.porcentaje_cumplimiento,
            k.numero_contrato, s.nombre_servicio
     FROM labor l JOIN contrato k ON k.id_contrato = l.id_contrato JOIN servicio s ON s.id_servicio = l.id_servicio
     WHERE k.id_cliente = ? ORDER BY l.fecha_programada DESC LIMIT 100`, [req.usuario.id]
  );
  res.json(filas);
});
