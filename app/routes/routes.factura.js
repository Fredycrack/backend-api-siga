import { Router } from 'express';
import * as c from '../controllers/controller.factura.js';
import { verificarToken, permitir } from '../middleware/auth.middleware.js';

const router = Router();
const admin = permitir();
router.use(['/facturas', '/cartera'], verificarToken);

router.get('/facturas', permitir('Gerente'), c.listar);
router.get('/facturas/pendientes-labores', admin, c.pendientesPorFacturar);
router.get('/facturas/:id', permitir('Gerente'), c.obtener);
router.get('/facturas/:id/pdf', permitir('Gerente'), c.pdf);
router.post('/facturas', admin, c.crear);                          // RF33
router.post('/facturas/desde-labores', admin, c.desdeLabores);
router.post('/facturas/:id/enviar', admin, c.enviarFactura);       // RF34
router.post('/facturas/:id/pagos', admin, c.registrarPago);        // RF35
router.put('/facturas/:id/anular', admin, c.anular);
router.get('/cartera', permitir('Gerente'), c.cartera);

export default router;
