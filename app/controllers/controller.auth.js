import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import { config } from '../config/env.js';
import * as Empleado from '../models/empleado.model.js';
import { asyncHandler, HttpError, requerir } from '../utils/http.js';
import { comparar, cifrar, validarPolitica } from '../utils/seguridad.js';
import { auditar } from '../utils/auditoria.js';

/**
 * CU3.7 - Gestionar Autenticacion
 * Valida las credenciales contra la base de datos y genera un token JWT
 * que incluye el tipo de usuario y su rol (RF03).
 */
const firmar = (datos) => jwt.sign(datos, config.jwtSecret, { expiresIn: config.jwtExpira });

// Inicio de sesion de empleados
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const empleado = email ? await Empleado.buscarPorEmail(email) : null;
  const { valida, requiereMigracion } = await comparar(password, empleado?.password);

  // Mismo mensaje para correo inexistente o clave errada: no revela que dato fallo
  if (!empleado || !valida) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }
  if (empleado.estado !== 'Activo') {
    return res.status(403).json({ error: 'El empleado se encuentra inactivo' });
  }
  // Las cuentas de la version 1.0 guardaban la clave en texto plano: se cifra ahora
  if (requiereMigracion) {
    await Empleado.actualizarPassword(empleado.id_empleado, await cifrar(password));
  }

  // El payload nunca incluye la contrasena
  const token = firmar({
    id: empleado.id_empleado, id_empleado: empleado.id_empleado, tipo: 'empleado',
    nombre: empleado.nombre, email: empleado.email, rol: empleado.rol
  });
  req.usuario = { id: empleado.id_empleado, tipo: 'empleado' };
  auditar(req, 'LOGIN', 'empleado', empleado.id_empleado);
  res.json({
    token,
    empleado: { id_empleado: empleado.id_empleado, nombre: empleado.nombre, email: empleado.email, rol: empleado.rol }
  });
});

// Inicio de sesion de clientes en el portal (RF06, RF17, RF36)
export const loginCliente = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const [filas] = email ? await pool.query('SELECT * FROM cliente WHERE email = ?', [email]) : [[]];
  const cliente = filas[0];
  const { valida, requiereMigracion } = await comparar(password, cliente?.password);
  if (!cliente || !valida) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }
  if (cliente.estado !== 'Activo') {
    return res.status(403).json({ error: 'El cliente se encuentra inactivo' });
  }
  if (requiereMigracion) {
    await pool.query('UPDATE cliente SET password = ? WHERE id_cliente = ?', [await cifrar(password), cliente.id_cliente]);
  }
  const token = firmar({ id: cliente.id_cliente, tipo: 'cliente', nombre: cliente.nombre_cliente, email: cliente.email, rol: 'Cliente' });
  req.usuario = { id: cliente.id_cliente, tipo: 'cliente' };
  auditar(req, 'LOGIN', 'cliente', cliente.id_cliente);
  res.json({ token, cliente: { id_cliente: cliente.id_cliente, nombre: cliente.nombre_cliente, email: cliente.email } });
});

// Datos del usuario autenticado
export const perfil = asyncHandler(async (req, res) => {
  if (req.usuario.tipo === 'cliente') {
    const [f] = await pool.query(
      'SELECT id_cliente, nombre_cliente, tipo_cliente, documento, email, telefono, direccion, ciudad, representante FROM cliente WHERE id_cliente = ?',
      [req.usuario.id]
    );
    if (!f[0]) throw new HttpError(404, 'Cliente no encontrado');
    return res.json({ tipo: 'cliente', ...f[0] });
  }
  const empleado = await Empleado.obtenerPorId(req.usuario.id);
  if (!empleado) throw new HttpError(404, 'Empleado no encontrado');
  res.json({ tipo: 'empleado', ...empleado });
});

// RF04 - Cambiar la contrasena propia (empleados y clientes)
export const cambiarPassword = asyncHandler(async (req, res) => {
  requerir(req.body, ['actual', 'nueva']);
  validarPolitica(req.body.nueva);
  if (req.body.actual === req.body.nueva) throw new HttpError(400, 'La nueva contrasena debe ser distinta de la actual');

  const esCliente = req.usuario.tipo === 'cliente';
  const tabla = esCliente ? 'cliente' : 'empleado';
  const campoId = esCliente ? 'id_cliente' : 'id_empleado';
  const [f] = await pool.query(`SELECT password FROM ${tabla} WHERE ${campoId} = ?`, [req.usuario.id]);
  const { valida } = await comparar(req.body.actual, f[0]?.password);
  if (!valida) throw new HttpError(400, 'La contrasena actual no es correcta');

  await pool.query(`UPDATE ${tabla} SET password = ? WHERE ${campoId} = ?`, [await cifrar(req.body.nueva), req.usuario.id]);
  auditar(req, 'CAMBIAR_CLAVE', tabla, req.usuario.id);
  res.json({ message: 'Contrasena actualizada correctamente' });
});
