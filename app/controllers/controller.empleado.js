import QRCode from 'qrcode';
import * as Empleado from '../models/empleado.model.js';
import { asyncHandler, HttpError, requerir, limpiar } from '../utils/http.js';
import { cifrar, validarPolitica } from '../utils/seguridad.js';
import { auditar } from '../utils/auditoria.js';

/**
 * CONTROLADOR EMPLEADO
 * Logica del CRUD del modulo de administracion de empleados (RF03, CU3.3).
 * Delega el acceso a datos en el modelo (app/models/empleado.model.js).
 */

const duplicado = (e) => {
  if (e.code === 'ER_DUP_ENTRY') {
    throw new HttpError(409, 'El documento, el email o el codigo QR ya estan registrados');
  }
  throw e;
};

// Listar todos los empleados (filtros opcionales ?rol=&estado=)
export const listarEmpleados = asyncHandler(async (req, res) => {
  res.json(await Empleado.obtenerTodos({ rol: req.query.rol, estado: req.query.estado }));
});

// Obtener un empleado por ID
export const obtenerEmpleado = asyncHandler(async (req, res) => {
  const empleado = await Empleado.obtenerPorId(req.params.id);
  if (!empleado) throw new HttpError(404, 'Empleado no encontrado');
  res.json(empleado);
});

// Crear un nuevo empleado: la contrasena se guarda cifrada
export const crearEmpleado = asyncHandler(async (req, res) => {
  requerir(req.body, ['nombre', 'documento', 'email', 'password', 'rol']);
  validarPolitica(req.body.password);
  const datos = limpiar(req.body, Empleado.CAMPOS_EDITABLES);
  datos.password = await cifrar(req.body.password);
  datos.estado = datos.estado || 'Activo';
  datos.codigo_qr = datos.codigo_qr || await Empleado.siguienteCodigoQR();
  const id = await Empleado.crear(datos).catch(duplicado);
  auditar(req, 'CREAR', 'empleado', id, `${datos.nombre} (${datos.rol})`);
  res.status(201).json({ id_empleado: id, message: 'Empleado creado correctamente' });
});

// Actualizar un empleado: solo los campos recibidos; 404 si no existe
export const actualizarEmpleado = asyncHandler(async (req, res) => {
  const datos = limpiar(req.body, Empleado.CAMPOS_EDITABLES);
  const filas = await Empleado.actualizar(req.params.id, datos).catch(duplicado);
  if (!filas) throw new HttpError(404, 'Empleado no encontrado');
  auditar(req, 'ACTUALIZAR', 'empleado', req.params.id, Object.keys(datos).join(', '));
  res.json({ message: 'Empleado actualizado correctamente' });
});

// Eliminar un empleado: 404 si no existe; 409 si tiene registros asociados
export const eliminarEmpleado = asyncHandler(async (req, res) => {
  if (Number(req.params.id) === Number(req.usuario.id)) {
    throw new HttpError(409, 'No puede eliminar su propia cuenta');
  }
  const filas = await Empleado.eliminar(req.params.id);
  if (!filas) throw new HttpError(404, 'Empleado no encontrado');
  auditar(req, 'ELIMINAR', 'empleado', req.params.id);
  res.json({ message: 'Empleado eliminado correctamente' });
});

// Restablecer la contrasena de un empleado (Administrador)
export const restablecerPassword = asyncHandler(async (req, res) => {
  requerir(req.body, ['nueva']);
  validarPolitica(req.body.nueva);
  const filas = await Empleado.actualizarPassword(req.params.id, await cifrar(req.body.nueva));
  if (!filas) throw new HttpError(404, 'Empleado no encontrado');
  auditar(req, 'RESTABLECER_CLAVE', 'empleado', req.params.id);
  res.json({ message: 'Contrasena restablecida correctamente' });
});

// Codigo QR personal del empleado como imagen (CU4.7)
export const codigoQR = asyncHandler(async (req, res) => {
  const id = req.params.id || req.usuario.id;
  if (req.params.id && req.usuario.rol !== 'Administrador' && Number(id) !== Number(req.usuario.id)) {
    throw new HttpError(403, 'Solo puede consultar su propio codigo QR');
  }
  const empleado = await Empleado.obtenerPorId(id);
  if (!empleado) throw new HttpError(404, 'Empleado no encontrado');
  if (!empleado.codigo_qr) throw new HttpError(404, 'El empleado no tiene codigo QR asignado');
  const imagen = await QRCode.toDataURL(empleado.codigo_qr, { width: 320, margin: 1 });
  res.json({ id_empleado: empleado.id_empleado, nombre: empleado.nombre, codigo_qr: empleado.codigo_qr, imagen });
});
