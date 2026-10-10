import { Router } from 'express';
import * as c from '../controllers/controller.labor.js';
import { verificarToken, permitir } from '../middleware/auth.middleware.js';

const router = Router();
const consultan = permitir('Supervisor', 'Gerente', 'Trabajador de Campo');
const operan = permitir('Supervisor', 'Trabajador de Campo');
router.use('/labores', verificarToken);

router.get('/labores', consultan, c.listar);
router.get('/labores/resumen', permitir('Supervisor', 'Gerente'), c.resumen);       // RF11
router.post('/labores/sincronizar', operan, c.sincronizar);                         // RF12
router.get('/labores/:id', consultan, c.obtener);
router.post('/labores', permitir('Supervisor'), c.crear);                           // RF07
router.put('/labores/:id', permitir('Supervisor'), c.actualizar);
router.delete('/labores/:id', permitir('Supervisor'), c.eliminar);
router.post('/labores/:id/iniciar', operan, c.iniciar);                             // RF08
router.get('/labores/:id/evidencias', consultan, c.listarEvidencias);
router.post('/labores/:id/evidencias', operan, c.evidencia);                        // RF09
router.post('/labores/:id/finalizar', operan, c.finalizar);                         // RF10

export default router;
