<?php
declare(strict_types=1);

/**
 * API de facturas.
 * GET    /api/facturas.php            -> listar (admite ?buscar=, ?estado=, ?id=)
 * POST   /api/facturas.php            -> crear
 * PUT    /api/facturas.php            -> actualizar (id en el JSON)
 * DELETE /api/facturas.php?id=5       -> borrar
 */

require __DIR__ . '/db.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$pdo = conexion();

try {
    match ($_SERVER['REQUEST_METHOD']) {
        'GET'    => listar($pdo),
        'POST'   => crear($pdo),
        'PUT'    => actualizar($pdo),
        'DELETE' => eliminar($pdo),
        default  => responder(['ok' => false, 'error' => 'Método no permitido'], 405),
    };
} catch (PDOException $e) {
    match ($e->getCode()) {
        '23505' => responder(['ok' => false, 'error' => 'Ese número de factura ya existe'], 409),
        '23503' => responder(['ok' => false, 'error' => 'El cliente indicado no existe'], 409),
        default => responder(['ok' => false, 'error' => 'Error de base de datos: ' . $e->getMessage()], 500),
    };
}

/* ----------------------------- GET ----------------------------- */
function listar(PDO $pdo): never
{
    $id = filter_input(INPUT_GET, 'id', FILTER_VALIDATE_INT);

    $sql = 'SELECT f.*, c.nombre AS cliente_nombre
              FROM facturas f
              JOIN clientes c ON c.id = f.cliente_id';

    $condiciones = [];
    $params = [];

    if ($id) {
        $condiciones[] = 'f.id = :id';
        $params[':id'] = $id;
    }

    $buscar = trim((string) ($_GET['buscar'] ?? ''));
    if ($buscar !== '') {
        $condiciones[] = '(f.numero ILIKE :b1 OR f.concepto ILIKE :b2 OR c.nombre ILIKE :b3)';
        $params[':b1'] = "%$buscar%";
        $params[':b2'] = "%$buscar%";
        $params[':b3'] = "%$buscar%";
    }

    $estado = (string) ($_GET['estado'] ?? '');
    if (in_array($estado, ['pendiente', 'pagada', 'anulada'], true)) {
        $condiciones[] = 'f.estado = :estado';
        $params[':estado'] = $estado;
    }

    if ($condiciones) {
        $sql .= ' WHERE ' . implode(' AND ', $condiciones);
    }

    $sql .= ' ORDER BY f.fecha DESC, f.id DESC';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $facturas = $stmt->fetchAll();

    if ($id) {
        if (!$facturas) {
            responder(['ok' => false, 'error' => 'Factura no encontrada'], 404);
        }
        responder(['ok' => true, 'datos' => $facturas[0]]);
    }

    responder(['ok' => true, 'datos' => $facturas]);
}

/* ---------------------------- POST ---------------------------- */
function crear(PDO $pdo): never
{
    $f = validar(cuerpoJson());

    if ($f[':numero'] === null) {
        $f[':numero'] = siguienteNumero($pdo);
    }

    // Ojo: "total" NO aparece. Lo calcula PostgreSQL (columna generada).
    $stmt = $pdo->prepare(
        'INSERT INTO facturas (numero, cliente_id, fecha, concepto, subtotal, iva, estado)
         VALUES (:numero, :cliente_id, :fecha, :concepto, :subtotal, :iva, :estado)
         RETURNING *'
    );
    $stmt->execute($f);

    responder(['ok' => true, 'datos' => $stmt->fetch()], 201);
}

/* ----------------------------- PUT ---------------------------- */
function actualizar(PDO $pdo): never
{
    $datos = cuerpoJson();
    $id    = filter_var($datos['id'] ?? null, FILTER_VALIDATE_INT);

    if (!$id) {
        responder(['ok' => false, 'error' => 'Falta el id de la factura'], 422);
    }

    $f = validar($datos);

    if ($f[':numero'] === null) {
        $f[':numero'] = siguienteNumero($pdo);
    }

    $stmt = $pdo->prepare(
        'UPDATE facturas
            SET numero     = :numero,
                cliente_id = :cliente_id,
                fecha      = :fecha,
                concepto   = :concepto,
                subtotal   = :subtotal,
                iva        = :iva,
                estado     = :estado
          WHERE id = :id
      RETURNING *'
    );
    $stmt->execute($f + [':id' => $id]);

    $factura = $stmt->fetch();

    if (!$factura) {
        responder(['ok' => false, 'error' => 'Factura no encontrada'], 404);
    }

    responder(['ok' => true, 'datos' => $factura]);
}

/* --------------------------- DELETE --------------------------- */
function eliminar(PDO $pdo): never
{
    $id = filter_input(INPUT_GET, 'id', FILTER_VALIDATE_INT);

    if (!$id) {
        responder(['ok' => false, 'error' => 'Falta el parámetro ?id='], 422);
    }

    $stmt = $pdo->prepare('DELETE FROM facturas WHERE id = :id');
    $stmt->execute([':id' => $id]);

    if ($stmt->rowCount() === 0) {
        responder(['ok' => false, 'error' => 'Factura no encontrada'], 404);
    }

    responder(['ok' => true, 'mensaje' => 'Factura eliminada']);
}

/* -------------------------- VALIDAR --------------------------- */
function validar(array $d): array
{
    $errores = [];

    $numero = trim((string) ($d['numero'] ?? ''));
    if (mb_strlen($numero) > 20) {
        $errores[] = 'El número no puede superar 20 caracteres';
    }

    $clienteId = filter_var($d['cliente_id'] ?? null, FILTER_VALIDATE_INT);
    if (!$clienteId) {
        $errores[] = 'Selecciona un cliente';
    }

    $fecha = trim((string) ($d['fecha'] ?? date('Y-m-d')));
    $fechaOk = DateTime::createFromFormat('Y-m-d', $fecha);
    if (!$fechaOk || $fechaOk->format('Y-m-d') !== $fecha) {
        $errores[] = 'La fecha debe tener formato AAAA-MM-DD';
    }

    $concepto = trim((string) ($d['concepto'] ?? ''));
    if ($concepto === '') {
        $errores[] = 'El concepto es obligatorio';
    } elseif (mb_strlen($concepto) > 200) {
        $errores[] = 'El concepto no puede superar 200 caracteres';
    }

    $subtotal = filter_var($d['subtotal'] ?? null, FILTER_VALIDATE_FLOAT);
    if ($subtotal === false || $subtotal < 0) {
        $errores[] = 'El subtotal debe ser un número mayor o igual a 0';
    }

    $iva = filter_var($d['iva'] ?? 21, FILTER_VALIDATE_FLOAT);
    if ($iva === false || $iva < 0 || $iva > 100) {
        $errores[] = 'El IVA debe estar entre 0 y 100';
    }

    $estado = (string) ($d['estado'] ?? 'pendiente');
    if (!in_array($estado, ['pendiente', 'pagada', 'anulada'], true)) {
        $errores[] = 'Estado no válido';
    }

    if ($errores) {
        responder(['ok' => false, 'errores' => $errores], 422);
    }

    return [
        ':numero'     => $numero !== '' ? $numero : null,
        ':cliente_id' => $clienteId,
        ':fecha'      => $fecha,
        ':concepto'   => $concepto,
        ':subtotal'   => round((float) $subtotal, 2),
        ':iva'        => round((float) $iva, 2),
        ':estado'     => $estado,
    ];
}

/* ----------------- NÚMERO AUTOMÁTICO (FAC-2026-005) ----------------- */
function siguienteNumero(PDO $pdo): string
{
    $anio = date('Y');

    $stmt = $pdo->prepare(
        "SELECT numero FROM facturas WHERE numero LIKE :patron ORDER BY numero DESC LIMIT 1"
    );
    $stmt->execute([':patron' => "FAC-$anio-%"]);
    $ultimo = $stmt->fetchColumn();

    $siguiente = $ultimo ? ((int) substr($ultimo, -3)) + 1 : 1;

    return sprintf('FAC-%s-%03d', $anio, $siguiente);
}