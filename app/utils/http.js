/**
 * Utilidades para controladores HTTP.
 */

// Error con codigo de estado HTTP que el manejador central convierte en respuesta
export class HttpError extends Error {
  constructor(estado, mensaje) {
    super(mensaje);
    this.estado = estado;
  }
}

// Envuelve un controlador async para que sus errores lleguen al manejador central
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Verifica que el cuerpo incluya los campos obligatorios
export const requerir = (cuerpo, campos) => {
  const faltantes = campos.filter((c) => cuerpo[c] === undefined || cuerpo[c] === null || String(cuerpo[c]).trim() === '');
  if (faltantes.length) {
    throw new HttpError(400, `Faltan campos obligatorios: ${faltantes.join(', ')}`);
  }
};

// Conserva solo las columnas permitidas y convierte '' en null
export const limpiar = (cuerpo, permitidas) => {
  const datos = {};
  for (const c of permitidas) {
    if (cuerpo[c] === undefined) continue;
    datos[c] = cuerpo[c] === '' ? null : cuerpo[c];
  }
  return datos;
};

// Convierte un valor a numero positivo o lanza 400
export const numeroPositivo = (valor, campo) => {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) throw new HttpError(400, `El campo ${campo} debe ser un numero mayor que cero`);
  return n;
};

// Valida una fecha AAAA-MM-DD
export const fechaValida = (valor, campo) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor || '')) || Number.isNaN(Date.parse(valor))) {
    throw new HttpError(400, `El campo ${campo} debe ser una fecha valida (AAAA-MM-DD)`);
  }
  return valor;
};
