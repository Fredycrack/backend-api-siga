import { HttpError } from '../utils/http.js';

/**
 * Manejador central de errores: traduce los errores de MySQL a respuestas
 * HTTP comprensibles para el usuario.
 */
export const manejarErrores = (err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.estado).json({ error: err.message });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'La informacion enviada supera el tamano permitido' });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'El cuerpo de la peticion no es un JSON valido' });
  }
  switch (err.code) {
    case 'ER_DUP_ENTRY': {
      const valor = (err.sqlMessage || '').match(/entry '(.*?)'/)?.[1];
      return res.status(409).json({ error: `Ya existe un registro con el valor ${valor ? `"${valor}"` : 'indicado'}` });
    }
    case 'ER_NO_REFERENCED_ROW':
    case 'ER_NO_REFERENCED_ROW_2':
      return res.status(400).json({ error: 'El registro relacionado no existe' });
    case 'ER_ROW_IS_REFERENCED':
    case 'ER_ROW_IS_REFERENCED_2':
      return res.status(409).json({ error: 'No se puede eliminar porque tiene registros asociados' });
    case 'ER_BAD_NULL_ERROR':
    case 'ER_NO_DEFAULT_FOR_FIELD': {
      const campo = (err.sqlMessage || '').match(/'(.*?)'/)?.[1];
      return res.status(400).json({ error: `Falta el campo obligatorio ${campo || ''}`.trim() });
    }
    case 'WARN_DATA_TRUNCATED':
    case 'ER_WARN_DATA_TRUNCATED':
    case 'ER_TRUNCATED_WRONG_VALUE':
    case 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD':
    case 'ER_DATA_TOO_LONG':
    case 'ER_WARN_DATA_OUT_OF_RANGE': {
      const campo = (err.sqlMessage || '').match(/column '(.*?)'/)?.[1];
      return res.status(400).json({ error: `Valor no valido${campo ? ` en el campo ${campo}` : ''}` });
    }
    default:
      console.error('[error]', err);
      return res.status(500).json({ error: err.message || 'Error interno del servidor' });
  }
};

export const noEncontrado = (req, res) => res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
