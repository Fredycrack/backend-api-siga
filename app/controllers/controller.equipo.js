import pool from '../config/db.js';
import * as Equipo from '../models/equipo.model.js';
import { registrarMovimiento } from '../models/inventario.model.js';
import { enTransaccion } from '../models/crud.js';
import { asyncHandler, HttpError, requerir, limpiar, numeroPositivo } from '../utils/http.js';
import { codigoSeguimiento } from '../utils/codigos.js';
import { auditar } from '../utils/auditoria.js';

/**
 * CONTROLADOR DEL MODULO DE SERVICIOS TECNOLOGICOS
 * CU2.1 Registrar equipos, CU2.2 Realizar diagnostico, CU2.3 Registrar repuestos,
 * CU2.4 Actualizar estado, CU2.5 Consultar estado del equipo, CU2.7 Generar cotizacion.
 */

const cargar = async (id, conexion) => {
  const equipo = await Equipo.obtener(id, conexion);
  if (!equipo) throw new HttpError(404, 'Equipo no encontrado');
  return equipo;
};

export const listar = asyncHandler(async (req, res) => {
  res.json(await Equipo.listar(req.query));
});

export const obtener = asyncHandler(async (req, res) => {
  const equipo = await cargar(req.params.id);
  res.json({ ...equipo, repuestos: await Equipo.repuestos(req.params.id) });
});

// RF13 - Registrar equipo recibido con la descripcion del problema
export const crear = asyncHandler(async (req, res) => {
  requerir(req.body, ['id_cliente', 'tipo_equipo', 'problema_reportado']);
  const datos = limpiar(req.body, Equipo.CAMPOS);
  if (!datos.id_tecnico && req.usuario.rol === 'Tecnico Electronico') datos.id_tecnico = req.usuario.id;
  // Codigo unico de seguimiento para el cliente (RF17)
  let id;
  for (let intento = 0; intento < 5 && !id; intento++) {
    datos.codigo_seguimiento = codigoSeguimiento();
    try {
      const [r] = await pool.query('INSERT INTO equipo SET ?', [datos]);
      id = r.insertId;
    } catch (e) {
      if (e.code !== 'ER_DUP_ENTRY' || !String(e.sqlMessage).includes(datos.codigo_seguimiento)) throw e;
    }
  }
  auditar(req, 'RECIBIR', 'equipo', id, datos.codigo_seguimiento);
  res.status(201).json({ id, codigo_seguimiento: datos.codigo_seguimiento, message: 'Equipo registrado correctamente' });
});

export const actualizar = asyncHandler(async (req, res) => {
  await cargar(req.params.id);
  const datos = limpiar(req.body, Equipo.CAMPOS);
  if (Object.keys(datos).length) await pool.query('UPDATE equipo SET ? WHERE id_equipo = ?', [datos, req.params.id]);
  auditar(req, 'ACTUALIZAR', 'equipo', req.params.id, Object.keys(datos).join(', '));
  res.json({ message: 'Equipo actualizado correctamente' });
});

export const eliminar = asyncHandler(async (req, res) => {
  const equipo = await cargar(req.params.id);
  if (equipo.estado !== 'Recibido') throw new HttpError(409, 'Solo se pueden eliminar equipos que aun no se han diagnosticado');
  await pool.query('DELETE FROM equipo WHERE id_equipo = ?', [req.params.id]);
  auditar(req, 'ELIMINAR', 'equipo', req.params.id);
  res.json({ message: 'Equipo eliminado correctamente' });
});

// RF14 - Diagnostico y cotizacion de la reparacion
export const diagnostico = asyncHandler(async (req, res) => {
  requerir(req.body, ['diagnostico', 'valor_cotizacion']);
  const valor = Number(req.body.valor_cotizacion);
  if (!Number.isFinite(valor) || valor < 0) throw new HttpError(400, 'El valor de la cotizacion no es valido');
  const equipo = await cargar(req.params.id);
  if (['Completado', 'Entregado'].includes(equipo.estado)) throw new HttpError(409, 'El equipo ya fue reparado');
  await pool.query(
    "UPDATE equipo SET diagnostico = ?, valor_cotizacion = ?, estado = IF(estado = 'Recibido', 'En diagnostico', estado) WHERE id_equipo = ?",
    [req.body.diagnostico, valor, req.params.id]
  );
  auditar(req, 'DIAGNOSTICAR', 'equipo', req.params.id, `cotizacion ${valor}`);
  res.json({ message: 'Diagnostico y cotizacion registrados' });
});

// Aprobacion de la cotizacion por parte del cliente (extension de CU2.7)
export const aprobarCotizacion = asyncHandler(async (req, res) => {
  const equipo = await cargar(req.params.id);
  if (req.usuario.tipo === 'cliente' && Number(equipo.id_cliente) !== Number(req.usuario.id)) {
    throw new HttpError(404, 'Equipo no encontrado');
  }
  if (equipo.valor_cotizacion === null) throw new HttpError(409, 'El equipo aun no tiene cotizacion');
  await pool.query('UPDATE equipo SET cotizacion_aprobada = 1 WHERE id_equipo = ?', [req.params.id]);
  auditar(req, 'APROBAR_COTIZACION', 'equipo', req.params.id);
  res.json({ message: 'Cotizacion aprobada' });
});

// RF16 - Actualizar el estado de la reparacion, en orden
export const cambiarEstado = asyncHandler(async (req, res) => {
  requerir(req.body, ['estado']);
  const nuevo = req.body.estado;
  const iNuevo = Equipo.ESTADOS.indexOf(nuevo);
  if (iNuevo < 0) throw new HttpError(400, `Estado no valido. Opciones: ${Equipo.ESTADOS.join(', ')}`);
  const equipo = await cargar(req.params.id);
  const iActual = Equipo.ESTADOS.indexOf(equipo.estado);
  if (iNuevo <= iActual) throw new HttpError(409, `El equipo ya esta ${equipo.estado.toLowerCase()}`);
  if (iNuevo >= 2 && !equipo.diagnostico) throw new HttpError(409, 'Registre el diagnostico antes de iniciar la reparacion');
  if (iNuevo >= 2 && !equipo.cotizacion_aprobada) throw new HttpError(409, 'La cotizacion debe estar aprobada antes de iniciar la reparacion');
  await pool.query(
    'UPDATE equipo SET estado = ?, fecha_entrega = IF(? = \'Entregado\', NOW(), fecha_entrega) WHERE id_equipo = ?',
    [nuevo, nuevo, req.params.id]
  );
  auditar(req, 'ESTADO', 'equipo', req.params.id, nuevo);
  res.json({ message: `Estado actualizado a ${nuevo}` });
});

// RF15 y RF26 - Registrar repuesto utilizado: descuenta el inventario
export const agregarRepuesto = asyncHandler(async (req, res) => {
  requerir(req.body, ['id_inventario', 'cantidad']);
  const cantidad = numeroPositivo(req.body.cantidad, 'cantidad');
  const r = await enTransaccion(async (cx) => {
    const equipo = await cargar(req.params.id, cx);
    if (['Completado', 'Entregado'].includes(equipo.estado)) throw new HttpError(409, 'El equipo ya fue reparado');
    const mov = await registrarMovimiento(cx, {
      id_inventario: req.body.id_inventario, tipo: 'Consumo', cantidad,
      referencia: `Equipo ${equipo.codigo_seguimiento}`, id_empleado: req.usuario.id
    });
    const [ins] = await cx.query(
      'INSERT INTO repuesto_equipo (id_equipo, id_inventario, cantidad, costo_unitario) VALUES (?, ?, ?, ?)',
      [req.params.id, req.body.id_inventario, cantidad, mov.producto.precio_unitario]
    );
    return { id: ins.insertId, orden_generada: mov.orden_generada };
  });
  auditar(req, 'REPUESTO', 'equipo', req.params.id, `producto ${req.body.id_inventario} x ${cantidad}`);
  res.status(201).json({ message: 'Repuesto registrado y descontado del inventario', ...r });
});

// RF17 - Consulta publica del estado por codigo de seguimiento
export const seguimiento = asyncHandler(async (req, res) => {
  const codigo = String(req.params.codigo || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6,20}$/.test(codigo)) throw new HttpError(400, 'Codigo de seguimiento no valido');
  const equipo = await Equipo.porCodigo(codigo);
  if (!equipo) throw new HttpError(404, 'No existe un equipo con ese codigo de seguimiento');
  res.json(equipo);
});
