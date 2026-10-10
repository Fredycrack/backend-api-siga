import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

/**
 * Verifica que la peticion incluya un token JWT valido y adjunta el usuario.
 * El token identifica si quien llama es un empleado o un cliente del portal.
 */
export const verificarToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const datos = jwt.verify(token, config.jwtSecret);
    // Compatibilidad con los tokens de la version 1.0
    if (!datos.tipo) {
      datos.tipo = 'empleado';
      datos.id = datos.id_empleado;
    }
    req.usuario = datos;
    req.empleado = datos;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token invalido o expirado' });
  }
};

/**
 * Autorizacion por rol. El Administrador tiene acceso a todo.
 * Uso: router.get('/ruta', verificarToken, permitir('Supervisor', 'Gerente'), controlador)
 */
export const permitir = (...roles) => (req, res, next) => {
  const u = req.usuario;
  if (!u || u.tipo !== 'empleado') {
    return res.status(403).json({ error: 'Acceso exclusivo para empleados' });
  }
  if (u.rol === 'Administrador' || roles.includes(u.rol)) return next();
  return res.status(403).json({ error: `El rol ${u.rol} no tiene permiso para esta operacion` });
};

// Cualquier empleado autenticado
export const soloEmpleados = (req, res, next) => {
  if (req.usuario?.tipo === 'empleado') return next();
  return res.status(403).json({ error: 'Acceso exclusivo para empleados' });
};

// Clientes autenticados en el portal
export const soloClientes = (req, res, next) => {
  if (req.usuario?.tipo === 'cliente') return next();
  return res.status(403).json({ error: 'Acceso exclusivo para clientes' });
};

// Roles que pueden consultar catalogos y listados generales
export const ROLES_INTERNOS = ['Supervisor', 'Gerente', 'Responsable SST', 'Jefe de Inventario', 'Tecnico Electronico'];
