import pool from '../config/db.js';
import { Cliente, Contrato, Servicio, Solicitud } from '../models/administrativo.model.js';
import { asyncHandler, HttpError, requerir, limpiar, fechaValida } from '../utils/http.js';
import { cifrar, validarPolitica } from '../utils/seguridad.js';
import { auditar } from '../utils/auditoria.js';

/**
 * CONTROLADOR DEL MODULO DE GESTION ADMINISTRATIVA
 * CU3.1 Registrar clientes, CU3.2 Crear contratos, CU3.5 Realizar respaldo,
 * CU3.6 Programar servicios (solicitudes del portal).
 */

// Genera los controladores CRUD de una entidad sencilla
const crud = (Modelo, { nombre, entidad, obligatorios, antesDeGuardar }) => ({
  listar: asyncHandler(async (req, res) => {
    const filtros = {};
    for (const [k, v] of Object.entries(req.query)) if (Modelo.columnas.includes(k)) filtros[k] = v;
    res.json(await Modelo.listar(filtros));
  }),
  obtener: asyncHandler(async (req, res) => {
    const fila = await Modelo.obtener(req.params.id);
    if (!fila) throw new HttpError(404, `${nombre} no encontrado`);
    res.json(fila);
  }),
  crear: asyncHandler(async (req, res) => {
    requerir(req.body, obligatorios);
    const datos = limpiar(req.body, Modelo.columnas);
    if (antesDeGuardar) await antesDeGuardar(datos, req, true);
    const id = await Modelo.crear(datos);
    auditar(req, 'CREAR', entidad, id);
    res.status(201).json({ id, message: `${nombre} creado correctamente` });
  }),
  actualizar: asyncHandler(async (req, res) => {
    const datos = limpiar(req.body, Modelo.columnas);
    if (antesDeGuardar) await antesDeGuardar(datos, req, false);
    const filas = await Modelo.actualizar(req.params.id, datos);
    if (!filas) throw new HttpError(404, `${nombre} no encontrado`);
    auditar(req, 'ACTUALIZAR', entidad, req.params.id, Object.keys(datos).join(', '));
    res.json({ message: `${nombre} actualizado correctamente` });
  }),
  eliminar: asyncHandler(async (req, res) => {
    const filas = await Modelo.eliminar(req.params.id);
    if (!filas) throw new HttpError(404, `${nombre} no encontrado`);
    auditar(req, 'ELIMINAR', entidad, req.params.id);
    res.json({ message: `${nombre} eliminado correctamente` });
  })
});

// ---------- Clientes (RF01) ----------
export const clientes = crud(Cliente, {
  nombre: 'Cliente', entidad: 'cliente',
  obligatorios: ['nombre_cliente', 'tipo_cliente', 'documento', 'email']
});

// Crear cliente con contrasena opcional para el portal
clientes.crear = asyncHandler(async (req, res) => {
  requerir(req.body, ['nombre_cliente', 'tipo_cliente', 'documento', 'email']);
  const datos = limpiar(req.body, Cliente.columnas);
  if (req.body.password) {
    validarPolitica(req.body.password);
    datos.password = await cifrar(req.body.password);
  }
  const id = await Cliente.crear(datos);
  auditar(req, 'CREAR', 'cliente', id, datos.nombre_cliente);
  res.status(201).json({ id, message: 'Cliente creado correctamente' });
});

// Asignar o cambiar la contrasena del portal de un cliente
export const claveCliente = asyncHandler(async (req, res) => {
  requerir(req.body, ['nueva']);
  validarPolitica(req.body.nueva);
  const [r] = await pool.query('UPDATE cliente SET password = ? WHERE id_cliente = ?', [await cifrar(req.body.nueva), req.params.id]);
  if (!r.affectedRows) throw new HttpError(404, 'Cliente no encontrado');
  auditar(req, 'ACCESO_PORTAL', 'cliente', req.params.id);
  res.json({ message: 'Acceso al portal actualizado' });
});

// ---------- Contratos (RF02) ----------
export const contratos = crud(Contrato, {
  nombre: 'Contrato', entidad: 'contrato',
  obligatorios: ['numero_contrato', 'id_cliente', 'tipo_contrato', 'fecha_inicio', 'fecha_fin'],
  antesDeGuardar: async (datos, req, nuevo) => {
    if (datos.fecha_inicio) fechaValida(datos.fecha_inicio, 'fecha_inicio');
    if (datos.fecha_fin) fechaValida(datos.fecha_fin, 'fecha_fin');
    let inicio = datos.fecha_inicio;
    let fin = datos.fecha_fin;
    if (!nuevo && (!inicio || !fin)) {
      const actual = await Contrato.obtener(req.params.id);
      if (!actual) throw new HttpError(404, 'Contrato no encontrado');
      inicio = inicio || actual.fecha_inicio;
      fin = fin || actual.fecha_fin;
    }
    if (inicio && fin && fin < inicio) throw new HttpError(400, 'La fecha de fin no puede ser anterior a la de inicio');
    if (datos.valor_total !== undefined && datos.valor_total !== null && Number(datos.valor_total) < 0) {
      throw new HttpError(400, 'El valor del contrato no puede ser negativo');
    }
  }
});

// ---------- Servicios ----------
export const servicios = crud(Servicio, {
  nombre: 'Servicio', entidad: 'servicio',
  obligatorios: ['nombre_servicio', 'tipo_servicio', 'unidad_medida', 'tarifa_base']
});

// ---------- Solicitudes de servicio (RF06) ----------
export const solicitudes = {
  listar: asyncHandler(async (req, res) => {
    res.json(await Solicitud.listar({ 'so.estado': req.query.estado }));
  }),
  responder: asyncHandler(async (req, res) => {
    requerir(req.body, ['estado']);
    if (!['Aprobada', 'Rechazada', 'Pendiente'].includes(req.body.estado)) {
      throw new HttpError(400, 'Estado no valido');
    }
    const filas = await Solicitud.actualizar(req.params.id, limpiar(req.body, ['estado', 'respuesta']));
    if (!filas) throw new HttpError(404, 'Solicitud no encontrada');
    auditar(req, 'RESPONDER', 'solicitud_servicio', req.params.id, req.body.estado);
    res.json({ message: 'Solicitud actualizada' });
  })
};

// ---------- Auditoria (RNF07) ----------
export const auditoria = asyncHandler(async (req, res) => {
  const limite = Math.min(Number(req.query.limite) || 200, 1000);
  const [filas] = await pool.query(
    `SELECT a.*, CASE WHEN a.tipo_usuario = 'empleado' THEN e.nombre WHEN a.tipo_usuario = 'cliente' THEN c.nombre_cliente ELSE 'Sistema' END AS usuario
     FROM auditoria a
     LEFT JOIN empleado e ON a.tipo_usuario = 'empleado' AND e.id_empleado = a.id_usuario
     LEFT JOIN cliente c ON a.tipo_usuario = 'cliente' AND c.id_cliente = a.id_usuario
     ORDER BY a.id_auditoria DESC LIMIT ?`,
    [limite]
  );
  res.json(filas);
});

// ---------- Respaldo manual (RF05, CU3.5) ----------
const TABLAS = ['empleado', 'cliente', 'contrato', 'servicio', 'solicitud_servicio', 'labor', 'evidencia_labor',
  'equipo', 'repuesto_equipo', 'inventario', 'movimiento_inventario', 'orden_compra', 'asistencia', 'tarea',
  'nomina', 'capacitacion_sst', 'participante_capacitacion', 'entrega_epp', 'incidente', 'factura',
  'detalle_factura', 'pago', 'auditoria'];

export const respaldo = asyncHandler(async (req, res) => {
  const inicio = Date.now();
  const datos = { sistema: 'SIGA', version: '2.0.0', fecha: new Date().toISOString(), tablas: {} };
  for (const t of TABLAS) {
    const [filas] = await pool.query(`SELECT * FROM ${t}`);
    datos.tablas[t] = filas;
  }
  datos.duracion_ms = Date.now() - inicio;
  auditar(req, 'RESPALDO', 'sistema', null, `${TABLAS.length} tablas`);
  const nombre = `respaldo-siga-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
  res.json(datos);
});
