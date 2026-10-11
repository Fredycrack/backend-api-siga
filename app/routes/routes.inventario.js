import { Router } from 'express';
import * as c from '../controllers/controller.inventario.js';
import { verificarToken, permitir } from '../middleware/auth.middleware.js';

const router = Router();
const jefe = permitir('Jefe de Inventario');
const consultan = permitir('Jefe de Inventario', 'Tecnico Electronico', 'Supervisor', 'Responsable SST', 'Gerente');
router.use(['/inventario', '/ordenes'], verificarToken);

router.get('/inventario', consultan, c.listar);                               // RF24
router.get('/inventario/alertas', consultan, c.alertas);                      // RF25
router.get('/inventario/:id', consultan, c.obtener);
router.post('/inventario', jefe, c.crear);
router.put('/inventario/:id', jefe, c.actualizar);
router.delete('/inventario/:id', jefe, c.eliminar);
router.post('/inventario/:id/ingreso', jefe, c.ingreso);                     // RF23
router.post('/inventario/:id/consumo', permitir('Jefe de Inventario', 'Tecnico Electronico', 'Trabajador de Campo', 'Supervisor'), c.consumo); // RF26

router.get('/ordenes', permitir('Jefe de Inventario', 'Gerente'), c.listarOrdenes);
router.post('/ordenes', jefe, c.crearOrden);
router.post('/ordenes/generar', jefe, c.generarOrdenes);                     // RF27
router.put('/ordenes/:id/aprobar', permitir(), c.aprobarOrden);              // RF28
router.put('/ordenes/:id/rechazar', permitir(), c.rechazarOrden);
router.put('/ordenes/:id/recibir', jefe, c.recibirOrden);

export default router;
