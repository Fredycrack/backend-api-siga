import jwt from 'jsonwebtoken';

// Misma clave secreta usada en controller.auth.js
const SECRET = 'siga_clave_secreta_123';

/**
 * Middleware de proteccion de rutas.
 * Verifica que la peticion incluya un token JWT valido.
 */
export const verificarToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'Token no proporcionado' });
    }

    // Separar el token del prefijo "Bearer"
    const token = authHeader.split(' ')[1];

    // Verificar el token
    const decoded = jwt.verify(token, SECRET);

    // Adjuntar los datos del empleado autenticado a la peticion
    req.empleado = decoded;

    next();
  } catch (error) {
    res.status(401).json({ error: 'Token invalido o expirado' });
  }
};
