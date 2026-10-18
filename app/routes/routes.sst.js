import { Router } from 'express';
import * as c from '../controllers/controller.sst.js';
import { verificarToken, permitir, soloEmpleados } from '../middleware/auth.middleware.js';

const router = Router();
const sst = permitir('Responsable SST');
const consultan = permitir('Responsable SST', 'Supervisor', 'Gerente');
router.use(['/capacitaciones', '/epp', '/incidentes'], verificarToken, soloEmpleados);

// RF29 - Capacitaciones
router.get('/capacitaciones', consultan, c.listarCapacitaciones);
router.get('/capacitaciones/mias', c.misCapacitaciones);
router.get('/capacitaciones/:id', consultan, c.obtenerCapacitacion);
router.post('/capacitaciones', sst, c.crearCapacitacion);
router.put('/capacitaciones/:id', sst, c.actualizarCapacitacion);
router.delete('/capacitaciones/:id', sst, c.eliminarCapacitacion);
router.put('/capacitaciones/:id/participantes', sst, c.convocar);
router.put('/capacitaciones/:id/asistencia', sst, c.asistenciaCapacitacion);

// RF30 - Elementos de proteccion personal
router.get('/epp', consultan, c.listarEPP);
router.get('/epp/mias', c.misEPP);
router.post('/epp', sst, c.entregarEPP);
router.delete('/epp/:id', sst, c.eliminarEPP);

// RF31 - Incidentes y accidentes
router.get('/incidentes', consultan, c.listarIncidentes);
router.get('/incidentes/:id', consultan, c.obtenerIncidente);
router.post('/incidentes', permitir('Responsable SST', 'Supervisor'), c.crearIncidente);
router.put('/incidentes/:id', sst, c.actualizarIncidente);
router.delete('/incidentes/:id', sst, c.eliminarIncidente);

export default router;
