# Backend API - Sistema Integrado de Gestion AGROSERVICES (SIGA) v2.0

API REST del **Sistema Integrado de Gestion AGROSERVICES (SIGA)** de AGROSERVICES P&D S.A.S.
(Madrid, Cundinamarca), construida con **Node.js + Express + MySQL/TiDB + JWT**.

La version 2.0 implementa los **ocho modulos** del sistema y los **40 requerimientos funcionales**
del documento de requisitos. La interfaz web esta en el repositorio
[`frontend-ejs-siga`](https://github.com/Fredycrack/frontend-ejs-siga).

| Modulo | Requerimientos | Funcionalidad |
|---|---|---|
| 1. Servicios agricolas | RF07 a RF12 | Programacion de labores, inicio y fin con GPS, evidencia fotografica, avance por contrato y sincronizacion sin conexion |
| 2. Servicios tecnologicos | RF13 a RF17 | Recepcion de equipos con codigo de seguimiento, diagnostico, cotizacion, repuestos y consulta publica del estado |
| 3. Gestion administrativa | RF01 a RF06 | Clientes, contratos, usuarios y roles, cambio de contrasena, respaldo y solicitudes de los clientes |
| 4. Gestion de personal | RF18 a RF22 | Asistencia con codigo QR, tareas y liquidacion de nomina con productividad |
| 5. Inventario | RF23 a RF28 | Existencias, movimientos, alertas de stock minimo y ordenes de compra automaticas con aprobacion |
| 6. Seguridad y salud en el trabajo | RF29 a RF32 | Capacitaciones, entrega de EPP, incidentes e indicadores de la Resolucion 0312 de 2019 |
| 7. Facturacion | RF33 a RF36 | Facturas desde labores o manuales con IVA, PDF, envio por correo, pagos parciales y cartera |
| 8. Reportes | RF37 a RF40 | Tablero gerencial, rentabilidad, productividad y exportacion a PDF y Excel |

## Tecnologia

- Node.js 22, Express 4 y modulos ES.
- MySQL 8, MariaDB 10.6+ o TiDB Cloud (MySQL compatible) con `mysql2`.
- Autenticacion con JWT (2 horas) y contrasenas cifradas con **bcrypt** (RNF06).
- Autorizacion por rol en cada ruta; auditoria de las operaciones criticas (RNF07).
- `pdfkit` y `exceljs` para facturas y reportes; `qrcode` para los carnes; `nodemailer` para el envio de facturas.

## Estructura

```
backend-api-siga/
├── app/
│   ├── config/        env.js (variables de entorno) y db.js (pool MySQL/TiDB)
│   ├── controllers/   un controlador por modulo (controller.labor.js, controller.factura.js, ...)
│   ├── models/        acceso a datos; crud.js genera el CRUD basico de cada tabla
│   ├── middleware/    verificacion del token, roles y manejo central de errores
│   ├── routes/        rutas por modulo; index.js las agrupa bajo /api
│   ├── db/migrate.js  crea las tablas que falten y carga los datos de demostracion
│   └── utils/         seguridad, auditoria, PDF/Excel, codigos y correo
├── database/
│   ├── schema.sql     23 tablas (compatible con la base de la version 1.0)
│   └── seed.sql       datos de demostracion
├── tests/api.test.js  47 pruebas de integracion (node:test)
├── app.js             aplicacion Express
├── index.js           punto de entrada: migra la base y abre el puerto
├── Dockerfile, docker-compose.yml, apache/   despliegue en contenedores
└── render.yaml        despliegue en Render
```

## Instalacion local

1. Instale las dependencias: `npm install`
2. Cree la base vacia `siga_db` en MySQL (por ejemplo con XAMPP). **No hace falta ejecutar scripts**:
   al iniciar, la API crea las 23 tablas y carga los datos de demostracion si la base esta vacia.
3. Copie `.env.example` como `.env` y ajuste la conexion (por defecto `root` sin contrasena en `localhost:3306`).
4. Inicie la API: `npm run dev` (puerto 3000). Verifique en `http://localhost:3000/`.

### Usuarios de demostracion

Los datos de demostracion crean un usuario por rol, todos con la misma contrasena de demostracion
(la que defina en `DEMO_PASSWORD` o, si no la define, la del archivo `database/seed.sql`):

| Rol | Correo |
|---|---|
| Administrador | admin@agroservices.com |
| Supervisor | supervisor@agroservices.com |
| Trabajador de Campo | campo@agroservices.com, campo2@..., campo3@... |
| Tecnico Electronico | tecnico@agroservices.com |
| Jefe de Inventario | inventario@agroservices.com |
| Responsable SST | sst@agroservices.com |
| Gerente | gerente@agroservices.com |
| Cliente (portal) | compras@bellarosa.com.co |

En un servidor publico defina siempre `DEMO_PASSWORD` antes del primer despliegue.

## Pruebas

```bash
# Requiere un MySQL o MariaDB de pruebas; la base siga_test se crea y se borra sola
DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root DB_PASSWORD=... npm test
```

Las 47 pruebas recorren los ocho modulos: autenticacion y roles, validaciones de negocio
(cruces de horario, estados de las reparaciones, stock, IVA, pagos), sincronizacion sin conexion,
exportaciones y el aislamiento de datos del portal de clientes.

## Endpoints principales

Todas las rutas usan el prefijo `/api` y, salvo las publicas, el encabezado
`Authorization: Bearer <token>`. El Administrador tiene acceso a todas.

| Modulo | Rutas |
|---|---|
| Acceso | `POST /login`, `POST /portal/login`, `GET /perfil`, `PUT /perfil/password`, `GET /perfil/qr` |
| Empleados | `GET/POST /empleados`, `GET/PUT/DELETE /empleados/:id`, `PUT /empleados/:id/password`, `GET /empleados/:id/qr` |
| Administrativo | `/clientes`, `/contratos`, `/servicios` (CRUD), `GET /solicitudes`, `PUT /solicitudes/:id`, `GET /auditoria`, `GET /respaldo` |
| Labores | `GET/POST /labores`, `GET /labores/resumen`, `POST /labores/:id/iniciar`, `POST /labores/:id/evidencias`, `POST /labores/:id/finalizar`, `POST /labores/sincronizar` |
| Equipos | `GET/POST /equipos`, `PUT /equipos/:id/diagnostico`, `PUT /equipos/:id/aprobar-cotizacion`, `PUT /equipos/:id/estado`, `POST /equipos/:id/repuestos`, `GET /seguimiento/:codigo` (publica) |
| Personal | `POST /asistencia/registrar`, `POST /asistencia/manual`, `GET /asistencia`, `/tareas`, `PUT /tareas/:id/avance`, `POST /nomina/calcular`, `GET /nomina` |
| Inventario | `/inventario` (CRUD), `POST /inventario/:id/ingreso`, `POST /inventario/:id/consumo`, `GET /inventario/alertas`, `/ordenes`, `POST /ordenes/generar`, `PUT /ordenes/:id/aprobar` |
| SST | `/capacitaciones`, `PUT /capacitaciones/:id/asistencia`, `/epp`, `/incidentes` |
| Facturacion | `GET/POST /facturas`, `POST /facturas/desde-labores`, `GET /facturas/:id/pdf`, `POST /facturas/:id/enviar`, `POST /facturas/:id/pagos`, `GET /cartera` |
| Reportes | `GET /reportes/dashboard`, `/reportes/rentabilidad`, `/reportes/productividad`, `/reportes/sst`, `GET /reportes/:reporte/:formato` (pdf o excel) |
| Portal | `GET /portal/resumen`, `/portal/solicitudes`, `/portal/equipos`, `/portal/facturas`, `/portal/labores` |

Errores: 400 datos no validos, 401 sin token o token vencido, 403 rol sin permiso,
404 registro inexistente, 409 regla de negocio o registro duplicado.

## Despliegue

- **Render + TiDB Cloud**: ver [DESPLIEGUE.md](DESPLIEGUE.md).
- **Docker** (con los dos repositorios clonados uno al lado del otro):
  `docker compose up -d --build` y abra `http://localhost:8080`.

## Variables de entorno

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Cadena de conexion `mysql://usuario:clave@host:puerto/base`. Con TiDB Cloud activa TLS automaticamente |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL` | Conexion por partes (si no hay `DATABASE_URL`) |
| `JWT_SECRET`, `JWT_EXPIRA` | Firma y duracion de los tokens |
| `AUTO_MIGRATE`, `SEED_DEMO`, `DEMO_PASSWORD` | Migracion al iniciar y datos de demostracion |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Envio de facturas por correo (opcional) |

Autor: Fredy Alexander Vargas Suarez - SENA, Analisis y Desarrollo de Software (ficha 3186583).
