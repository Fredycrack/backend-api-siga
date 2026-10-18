/**
 * Configuracion leida de variables de entorno.
 * En produccion las claves deben definirse en el panel del proveedor;
 * los valores por defecto solo sirven para el ambiente de desarrollo.
 */
const enProduccion = process.env.NODE_ENV === 'production';

export const config = {
  puerto: Number(process.env.PORT) || 3000,
  jwtSecret: process.env.JWT_SECRET || 'siga_clave_secreta_123',
  jwtExpira: process.env.JWT_EXPIRA || '2h',
  zonaHoraria: process.env.DB_TIMEZONE || '-05:00',
  migrarAlIniciar: process.env.AUTO_MIGRATE !== 'false',
  cargarDemo: process.env.SEED_DEMO !== 'false',
  limiteCuerpo: process.env.LIMITE_CUERPO || '8mb',
  smtp: {
    host: process.env.SMTP_HOST || '',
    puerto: Number(process.env.SMTP_PORT) || 587,
    usuario: process.env.SMTP_USER || '',
    clave: process.env.SMTP_PASS || '',
    remitente: process.env.SMTP_FROM || process.env.SMTP_USER || ''
  },
  // Reglas de liquidacion de nomina (RF22), parametrizables por ambiente
  nomina: {
    bonoPorLabor: Number(process.env.NOMINA_BONO_LABOR) || 0.01,      // 1 % del salario por labor con cumplimiento >= 90 %
    bonoPorTarea: Number(process.env.NOMINA_BONO_TAREA) || 0.005,     // 0,5 % por tarea completada a tiempo
    topeBonificacion: Number(process.env.NOMINA_TOPE_BONO) || 0.10,   // tope del 10 % del salario
    aporteSalud: 0.04,
    aportePension: 0.04
  }
};

if (enProduccion && !process.env.JWT_SECRET) {
  console.warn('[SIGA] Advertencia: JWT_SECRET no esta definida; se usa la clave de desarrollo.');
}
