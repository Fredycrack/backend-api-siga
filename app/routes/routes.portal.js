import { Router } from 'express';
import * as c from '../controllers/controller.portal.js';
import { aprobarCotizacion } from '../controllers/controller.equipo.js';
import { pdf } from '../controllers/controller.factura.js';
import { verificarToken, soloClientes } from '../middleware/auth.middleware.js';

const router = Router();
const cliente = [verificarToken, soloClientes];

router.get('/portal/resumen', cliente, c.resumen);
router.get('/portal/servicios', cliente, c.servicios);
router.get('/portal/solicitudes', cliente, c.misSolicitudes);
router.post('/portal/solicitudes', cliente, c.crearSolicitud);                 // RF06
router.get('/portal/equipos', cliente, c.misEquipos);                          // RF17
router.put('/portal/equipos/:id/aprobar-cotizacion', cliente, aprobarCotizacion);
router.get('/portal/facturas', cliente, c.misFacturas);                        // RF36
router.get('/portal/facturas/:id', cliente, c.miFactura);
router.get('/portal/facturas/:id/pdf', cliente, pdf);
router.get('/portal/labores', cliente, c.misLabores);

export default router;
