import app from './app.js';
import { config } from './app/config/env.js';
import { migrar } from './app/db/migrate.js';

/**
 * Punto de entrada de la API REST de SIGA.
 * Antes de abrir el puerto crea las tablas que falten en la base de datos.
 */
const iniciar = async () => {
  if (config.migrarAlIniciar) {
    try {
      await migrar({ demo: config.cargarDemo });
    } catch (e) {
      console.error('[SIGA] No fue posible preparar la base de datos:', e.message);
    }
  }
  app.listen(config.puerto, () => {
    console.log(`Servidor SIGA (backend) corriendo en el puerto ${config.puerto}`);
  });
};

iniciar();
