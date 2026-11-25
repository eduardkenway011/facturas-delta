# Facturas DELTA

Sistema de facturación responsivo con **HTML, CSS, JavaScript, PHP y PostgreSQL**.
Incluye CRUD de clientes y facturas, impresión de documentos, envío por correo,
moneda en pesos dominicanos (RD$), tema oscuro y diseño responsivo.

## Estructura

```
proyecto facturacion/
├── index.html              # Interfaz principal
├── css/estilos.css         # Diseño, animaciones y responsividad
├── js/app.js               # Lógica frontend y consumo de API
├── api/
│   ├── db.php              # Conexión PDO a PostgreSQL
│   ├── clientes.php        # CRUD de clientes
│   └── facturas.php        # CRUD de facturas
├── sql/
│   └── esquema.sql         # Tablas y datos de prueba
├── favicon.svg
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── .gitignore
```

## Características

- ✅ CRUD de clientes y facturas (crear, leer, actualizar, eliminar)
- ✅ Total calculado automáticamente en PostgreSQL (columna generada)
- ✅ Moneda en pesos dominicanos (RD$)
- ✅ Envío de factura electrónica por correo (`mailto`)
- ✅ Impresión de facturas y fichas de cliente (A4)
- ✅ Diseño responsivo: tabla → tarjetas en móvil
- ✅ Tema claro / oscuro
- ✅ Validación en cliente y servidor
- ✅ Sentencias preparadas (protegido contra inyección SQL)
- ✅ Código fuente reservado a Daniel García

## Requisitos

- PHP 8.2+
- PostgreSQL 14+
- Servidor web (Apache/Nginx) o Docker

## Despliegue rápido con Docker

```bash
# 1. Clona el repositorio
git clone https://github.com/TU_USUARIO/facturas-delta.git
cd facturas-delta

# 2. Levanta PostgreSQL y PHP con Docker Compose
docker compose up -d

# 3. Abre en tu navegador
# http://localhost:8000
```

## Despliegue manual (sin Docker)

1. Sube los archivos a tu servidor web.
2. Copia `.env.example` a `.env` y configura los datos de tu base de datos PostgreSQL.
3. Crea la base de datos y ejecuta:
   ```bash
   psql -d facturacion -f sql/esquema.sql
   ```
4. Asegúrate de que `api/db.php` lea las variables de entorno correctamente.
5. Abre `index.html` en tu navegador.

## Variables de entorno (.env)

| Variable | Valor por defecto | Descripción |
|----------|------------------|-------------|
| DB_HOST | localhost | Servidor de PostgreSQL |
| DB_PORT | 5432 | Puerto de PostgreSQL |
| DB_NAME | facturacion | Nombre de la base de datos |
| DB_USER | Daniel | Usuario de PostgreSQL |
| DB_PASS | | Contraseña de PostgreSQL |

## Endpoints de la API

- `GET /api/clientes.php` — Listar clientes
- `POST /api/clientes.php` — Crear cliente
- `PUT /api/clientes.php` — Actualizar cliente (envía `id`)
- `DELETE /api/clientes.php?id=X` — Borrar cliente
- `GET /api/facturas.php` — Listar facturas
- `POST /api/facturas.php` — Crear factura
- `PUT /api/facturas.php` — Actualizar factura (envía `id`)
- `DELETE /api/facturas.php?id=X` — Borrar factura

## Autor

Todos los derechos y código fuente reservados a **Daniel García**.
