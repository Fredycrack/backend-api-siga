import crypto from 'crypto';

// Codigo de seguimiento de 8 caracteres sin simbolos ambiguos (RF17)
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const codigoSeguimiento = () => {
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join('');
};

// Siguiente consecutivo del ano: PREFIJO-AAAA-0001
export const siguienteNumero = async (conexion, tabla, columna, prefijo) => {
  const anio = new Date().getFullYear();
  const patron = `${prefijo}-${anio}-%`;
  const [filas] = await conexion.query(
    `SELECT ${columna} AS n FROM ${tabla} WHERE ${columna} LIKE ? ORDER BY ${columna} DESC LIMIT 1`,
    [patron]
  );
  const ultimo = filas.length ? Number(String(filas[0].n).split('-').pop()) : 0;
  return `${prefijo}-${anio}-${String(ultimo + 1).padStart(4, '0')}`;
};
