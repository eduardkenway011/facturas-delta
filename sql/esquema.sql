-- ============================================================
--  Sistema de facturación · Esquema de base de datos
--  PostgreSQL 18
-- ============================================================

-- Permite volver a ejecutar este archivo para reiniciar todo
DROP TABLE IF EXISTS facturas;
DROP TABLE IF EXISTS clientes;

-- ------------------------------------------------------------
--  CLIENTES
-- ------------------------------------------------------------
CREATE TABLE clientes (
    id        SERIAL PRIMARY KEY,
    nombre    VARCHAR(120) NOT NULL,
    email     VARCHAR(150) UNIQUE,
    telefono  VARCHAR(30),
    direccion VARCHAR(200),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT clientes_nombre_no_vacio CHECK (trim(nombre) <> '')
);

-- ------------------------------------------------------------
--  FACTURAS
-- ------------------------------------------------------------
CREATE TABLE facturas (
    id         SERIAL PRIMARY KEY,
    numero     VARCHAR(20) NOT NULL UNIQUE,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
    fecha      DATE NOT NULL DEFAULT CURRENT_DATE,
    concepto   VARCHAR(200) NOT NULL,
    subtotal   NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
    iva        NUMERIC(5,2)  NOT NULL DEFAULT 21 CHECK (iva BETWEEN 0 AND 100),

    -- El total NO se guarda a mano: PostgreSQL lo calcula solo
    total      NUMERIC(12,2) GENERATED ALWAYS AS
               (ROUND(subtotal * (1 + iva / 100), 2)) STORED,

    estado     VARCHAR(10) NOT NULL DEFAULT 'pendiente'
               CHECK (estado IN ('pendiente', 'pagada', 'anulada')),

    creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices: aceleran las búsquedas más frecuentes
CREATE INDEX idx_facturas_cliente ON facturas(cliente_id);
CREATE INDEX idx_facturas_fecha   ON facturas(fecha DESC);

-- ------------------------------------------------------------
--  DATOS DE PRUEBA
-- ------------------------------------------------------------
INSERT INTO clientes (nombre, email, telefono, direccion) VALUES
  ('Ana Torres',      'example@email.com',        '+1 809 555 0101', 'Av. Winston Churchill 12, Santo Domingo'),
  ('Luis Fernández',  'example@email.com',        '+1 829 555 0202', 'Calle del Sol 8, Santiago'),
  ('Marta Ruiz',      'example@email.com',        '+1 849 555 0303', 'Av. 27 de Febrero 3, San Pedro de Macorís');

INSERT INTO facturas (numero, cliente_id, fecha, concepto, subtotal, iva, estado) VALUES
  ('FAC-2026-001', 1, CURRENT_DATE - 20, 'Diseño de logotipo',        450.00, 21, 'pagada'),
  ('FAC-2026-002', 2, CURRENT_DATE - 12, 'Mantenimiento web mensual', 200.00, 21, 'pendiente'),
  ('FAC-2026-003', 1, CURRENT_DATE -  5, 'Campaña de redes sociales', 780.50, 21, 'pendiente'),
  ('FAC-2026-004', 3, CURRENT_DATE -  2, 'Consultoría de marketing',  320.00, 10, 'anulada');