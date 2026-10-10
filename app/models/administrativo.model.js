import { crearModelo } from './crud.js';

/**
 * MODELOS DEL MODULO DE GESTION ADMINISTRATIVA
 * Clientes (RF01), contratos (RF02), catalogo de servicios y solicitudes
 * de servicio del portal (RF06).
 */
export const Cliente = crearModelo({
  tabla: 'cliente',
  id: 'id_cliente',
  columnas: ['nombre_cliente', 'tipo_cliente', 'documento', 'email', 'telefono', 'direccion', 'ciudad', 'representante', 'estado'],
  consulta: `SELECT id_cliente, nombre_cliente, tipo_cliente, documento, email, telefono, direccion, ciudad,
                    representante, estado, fecha_registro, (password IS NOT NULL) AS acceso_portal
             FROM cliente`,
  orden: 'nombre_cliente'
});

export const Contrato = crearModelo({
  tabla: 'contrato',
  id: 'id_contrato',
  columnas: ['numero_contrato', 'id_cliente', 'tipo_contrato', 'descripcion', 'fecha_inicio', 'fecha_fin', 'valor_total', 'estado'],
  consulta: `SELECT k.*, c.nombre_cliente FROM contrato k JOIN cliente c ON c.id_cliente = k.id_cliente`,
  campoId: 'k.id_contrato',
  prefijo: 'k.',
  orden: 'k.fecha_inicio DESC'
});

export const Servicio = crearModelo({
  tabla: 'servicio',
  id: 'id_servicio',
  columnas: ['nombre_servicio', 'tipo_servicio', 'descripcion', 'unidad_medida', 'tarifa_base', 'estado'],
  orden: 'tipo_servicio, nombre_servicio'
});

export const Solicitud = crearModelo({
  tabla: 'solicitud_servicio',
  id: 'id_solicitud',
  columnas: ['id_cliente', 'id_servicio', 'fecha_deseada', 'ubicacion', 'descripcion', 'estado', 'respuesta'],
  consulta: `SELECT so.*, c.nombre_cliente, s.nombre_servicio, s.tipo_servicio
             FROM solicitud_servicio so
             JOIN cliente c ON c.id_cliente = so.id_cliente
             JOIN servicio s ON s.id_servicio = so.id_servicio`,
  campoId: 'so.id_solicitud',
  prefijo: 'so.',
  orden: 'so.fecha_registro DESC'
});
