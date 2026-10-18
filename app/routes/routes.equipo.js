import { Router } from 'express';
import * as c from '../controllers/controller.equipo.js';
import { verificarToken, permitir } from '../middleware/auth.middleware.js';

const router = Router();
const tecnico = permitir('Tecnico Electronico');

// RF17 - Consulta publica por codigo de seguimiento (no requiere token)
router.get('/seguimiento/:codigo', c.seguimiento);

router.use('/equipos', verificarToken);
router.get('/equipos', permitir('Tecnico Electronico', 'Gerente'), c.listar);
router.post('/equipos/sincronizar', tecnico, c.sincronizar);                 // RF18
router.get('/equipos/:id', permitir('Tecnico Electronico', 'Gerente'), c.obtener);
router.post('/equipos', tecnico, c.crear);                                    // RF13
router.put('/equipos/:id', tecnico, c.actualizar);
router.delete('/equipos/:id', permitir(), c.eliminar);
router.put('/equipos/:id/diagnostico', tecnico, c.diagnostico);              // RF14
router.put('/equipos/:id/aprobar-cotizacion', tecnico, c.aprobarCotizacion);
router.put('/equipos/:id/estado', tecnico, c.cambiarEstado);                 // RF16
router.post('/equipos/:id/repuestos', tecnico, c.agregarRepuesto);            // RF15

export default router;
