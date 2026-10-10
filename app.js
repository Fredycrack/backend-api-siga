import express from 'express';
import { config } from './app/config/env.js';
import { manejarErrores, noEncontrado } from './app/middleware/errores.js';
import rutas from './app/routes/index.js';

/**
 * Aplicacion Express de la API REST de SIGA.
 * Se separa de index.js para poder probarla sin abrir un puerto.
 */
const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: config.limiteCuerpo }));

app.get('/', (req, res) => {
  res.json({ message: 'API SIGA - AGROSERVICES P&D SAS funcionando correctamente', version: '2.0.0' });
});

app.use('/api', rutas);

app.use(noEncontrado);
app.use(manejarErrores);

export default app;
