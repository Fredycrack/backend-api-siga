import { Router } from 'express';
import * as c from '../controllers/controller.personal.js';
import { verificarToken, permitir, soloEmpleados } from '../middleware/auth.middleware.js';

const router = Router();
router.use(['/asistencia', '/tareas', '/nomina'], verificarToken, soloEmpleados);

// RF19 - Asistencia con codigo QR (punto de registro operado por el supervisor)
router.post('/asistencia/registrar', permitir('Supervisor'), c.registrarAsistencia);
router.post('/asistencia/manual', permitir('Supervisor'), c.registroManual);
router.get('/asistencia', permitir('Supervisor', 'Gerente'), c.listarAsistencia);
router.get('/asistencia/hoy', permitir('Supervisor', 'Gerente'), c.asistenciaHoy);
router.get('/asistencia/mia', c.miAsistencia);

// RF20 y RF21 - Tareas
router.get('/tareas', permitir('Supervisor', 'Gerente'), c.listarTareas);
router.get('/tareas/mias', c.misTareas);
router.post('/tareas', permitir('Supervisor'), c.crearTarea);
router.put('/tareas/:id', permitir('Supervisor'), c.actualizarTarea);
router.put('/tareas/:id/avance', c.avanceTarea);
router.delete('/tareas/:id', permitir('Supervisor'), c.eliminarTarea);

// RF22 - Nomina
router.post('/nomina/calcular', permitir(), c.calcularNomina);
router.get('/nomina', permitir('Gerente'), c.listarNomina);
router.get('/nomina/periodos', permitir('Gerente'), c.periodosNomina);
router.get('/nomina/mia', c.miNomina);

export default router;
