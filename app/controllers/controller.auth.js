import jwt from 'jsonwebtoken';
import * as Empleado from '../models/empleado.model.js';

// Clave secreta (en produccion usar process.env.JWT_SECRET)
const SECRET = 'siga_clave_secreta_123';

/**
 * CU3.7 - Gestionar Autenticacion
 * Valida las credenciales del empleado contra la base de datos
 * y genera un token JWT que incluye su rol (RF03).
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Buscar al empleado por email
    const empleado = await Empleado.buscarPorEmail(email);

    // Validar credenciales
    if (!empleado || empleado.password !== password) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    // Validar que el empleado este activo
    if (empleado.estado !== 'Activo') {
      return res.status(403).json({ error: 'El empleado se encuentra inactivo' });
    }

    // Generar token (el payload nunca incluye la contrasena)
    const token = jwt.sign(
      {
        id_empleado: empleado.id_empleado,
        email: empleado.email,
        rol: empleado.rol
      },
      SECRET,
      { expiresIn: '2h' }
    );

    // Devolver token y datos basicos del empleado autenticado
    res.json({
      token,
      empleado: {
        id_empleado: empleado.id_empleado,
        nombre: empleado.nombre,
        email: empleado.email,
        rol: empleado.rol
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
