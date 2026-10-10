import { Router } from 'express';
import { clientes, claveCliente, contratos, servicios, solicitudes, auditoria, respaldo } from '../controllers/controller.administrativo.js';
import { verificarToken, permitir, soloEmpleados } from '../middleware/auth.middleware.js';

const router = Router();
router.use(['/clientes', '/contratos', '/servicios', '/solicitudes', '/auditoria', '/respaldo'], verificarToken);

// RF01 - Clientes
router.get('/clientes', permitir('Supervisor', 'Gerente', 'Tecnico Electronico'), clientes.listar);
router.get('/clientes/:id', permitir('Supervisor', 'Gerente', 'Tecnico Electronico'), clientes.obtener);
router.post('/clientes', permitir(), clientes.crear);
router.put('/clientes/:id', permitir(), clientes.actualizar);
router.delete('/clientes/:id', permitir(), clientes.eliminar);
router.put('/clientes/:id/password', permitir(), claveCliente);

// RF02 - Contratos
router.get('/contratos', permitir('Supervisor', 'Gerente'), contratos.listar);
router.get('/contratos/:id', permitir('Supervisor', 'Gerente'), contratos.obtener);
router.post('/contratos', permitir(), contratos.crear);
router.put('/contratos/:id', permitir(), contratos.actualizar);
router.delete('/contratos/:id', permitir(), contratos.eliminar);

// Catalogo de servicios
router.get('/servicios', soloEmpleados, servicios.listar);
router.get('/servicios/:id', soloEmpleados, servicios.obtener);
router.post('/servicios', permitir(), servicios.crear);
router.put('/servicios/:id', permitir(), servicios.actualizar);
router.delete('/servicios/:id', permitir(), servicios.eliminar);

// RF06 - Solicitudes de servicio recibidas desde el portal
router.get('/solicitudes', permitir('Supervisor', 'Gerente'), solicitudes.listar);
router.put('/solicitudes/:id', permitir('Supervisor'), solicitudes.responder);

// RNF07 - Auditoria y RF05 - Respaldo manual
router.get('/auditoria', permitir(), auditoria);
router.get('/respaldo', permitir(), respaldo);

export default router;
