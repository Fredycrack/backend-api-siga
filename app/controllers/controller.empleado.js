import * as Empleado from '../models/empleado.model.js';

/**
 * CONTROLADOR EMPLEADO
 * Logica del CRUD del modulo de administracion de empleados (RF03).
 * Delega el acceso a datos en el modelo (app/models/empleado.model.js).
 */

// Listar todos los empleados
export const listarEmpleados = async (req, res) => {
  try {
    const empleados = await Empleado.obtenerTodos();
    res.json(empleados);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Obtener un empleado por ID
export const obtenerEmpleado = async (req, res) => {
  try {
    const empleado = await Empleado.obtenerPorId(req.params.id);
    if (!empleado) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }
    res.json(empleado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Crear un nuevo empleado
export const crearEmpleado = async (req, res) => {
  try {
    const id = await Empleado.crear(req.body);
    res.status(201).json({ id_empleado: id, message: 'Empleado creado correctamente' });
  } catch (error) {
    // Manejo de documento o email duplicado (restriccion UNIQUE)
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'El documento o el email ya estan registrados' });
    }
    res.status(500).json({ error: error.message });
  }
};

// Actualizar un empleado
export const actualizarEmpleado = async (req, res) => {
  try {
    await Empleado.actualizar(req.params.id, req.body);
    res.json({ message: 'Empleado actualizado correctamente' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'El documento o el email ya estan registrados' });
    }
    res.status(500).json({ error: error.message });
  }
};

// Eliminar un empleado
export const eliminarEmpleado = async (req, res) => {
  try {
    await Empleado.eliminar(req.params.id);
    res.json({ message: 'Empleado eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
