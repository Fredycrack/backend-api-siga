import { Router } from 'express';
import * as c from '../controllers/controller.reportes.js';
import { verificarToken, permitir } from '../middleware/auth.middleware.js';

const router = Router();
router.use('/reportes', verificarToken);

// Roles que pueden ver cada reporte
const ACCESO = {
  rentabilidad: ['Gerente'],
  cartera: ['Gerente'],
  productividad: ['Gerente', 'Supervisor'],
  sst: ['Gerente', 'Responsable SST'],
  inventario: ['Gerente', 'Jefe de Inventario']
};
const segunReporte = (req, res, next) => permitir(...(ACCESO[req.params.reporte] || []))(req, res, next);

router.get('/reportes/dashboard', permitir('Gerente'), c.dashboard);                       // RF37
router.get('/reportes/rentabilidad', permitir('Gerente'), c.rentabilidad);                 // RF38
router.get('/reportes/productividad', permitir('Gerente', 'Supervisor'), c.productividad); // RF40
router.get('/reportes/sst', permitir('Gerente', 'Responsable SST'), c.sst);                // RF32
router.get('/reportes/:reporte/:formato', segunReporte, c.exportar);                       // RF39

export default router;
