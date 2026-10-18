import bcrypt from 'bcryptjs';
import { HttpError } from './http.js';

/**
 * Manejo de contrasenas (RNF06).
 * Las contrasenas se almacenan como resumen bcrypt. Las cuentas creadas con la
 * version 1.0, que guardaba texto plano, se convierten al primer inicio de sesion.
 */
export const esHash = (valor) => typeof valor === 'string' && /^\$2[aby]\$\d{2}\$/.test(valor);

export const cifrar = (clave) => bcrypt.hash(String(clave), 10);

// Devuelve { valida, requiereMigracion }
export const comparar = async (clave, guardada) => {
  if (!guardada) return { valida: false, requiereMigracion: false };
  if (esHash(guardada)) return { valida: await bcrypt.compare(String(clave), guardada), requiereMigracion: false };
  const valida = String(clave) === guardada;
  return { valida, requiereMigracion: valida };
};

// Politica de contrasenas: 8 o mas caracteres, mayuscula, minuscula y numero
export const validarPolitica = (clave) => {
  const c = String(clave || '');
  if (c.length < 8 || !/[A-Z]/.test(c) || !/[a-z]/.test(c) || !/\d/.test(c)) {
    throw new HttpError(400, 'La contrasena debe tener al menos 8 caracteres, una mayuscula, una minuscula y un numero');
  }
};
