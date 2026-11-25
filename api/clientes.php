<?php
declare(strict_types=1);

/**
 * API de clientes.
 * GET    /api/clientes.php          -> listar (admite ?buscar= y ?id=)
 * POST   /api/clientes.php          -> crear
 * PUT    /api/clientes.php          -> actualizar (id en el JSON)
 * DELETE /api/clientes.php?id=3     -> borrar
 */

require __DIR__ . '/db.php';

// Cabeceras para que el navegador pueda llamar a la API
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
        '23505' => responder(['ok' => false, 'error' => 'Ese email ya está registrado'], 409),
        '23503' => responder(['ok' => false, 'error' => 'El cliente tiene facturas asociadas y no se puede borrar'], 409),
        default => responder(['ok' => false, 'error' => 'Error de base de datos: ' . $e->getMessage()], 500),
    };
}

/* ----------------------------- GET ----------------------------- */
function listar(PDO $pdo): never
{
    $id = filter_input(INPUT_GET, 'id', FILTER_VALIDATE_INT);

    if ($id) {
        $stmt = $pdo->prepare('SELECT * FROM clientes WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $cliente = $stmt->fetch();

        if (!$cliente) {
            responder(['ok' => false, 'error' => 'Cliente no encontrado'], 404);
        }

        responder(['ok' => true, 'datos' => $cliente]);
    }

    $buscar = trim((string) ($_GET['buscar'] ?? ''));

    if ($buscar !== '') {
        $stmt = $pdo->prepare(
            'SELECT * FROM clientes
              WHERE nombre ILIKE :q1 OR email ILIKE :q2
              ORDER BY nombre'
        );
        $stmt->execute([':q1' => "%$buscar%", ':q2' => "%$buscar%"]);
    } else {
        $stmt = $pdo->query('SELECT * FROM clientes ORDER BY nombre');
    }

    responder(['ok' => true, 'datos' => $stmt->fetchAll()]);
}

/* ---------------------------- POST ---------------------------- */
function crear(PDO $pdo): never
{
    $c = validar(cuerpoJson());

    $stmt = $pdo->prepare(
        'INSERT INTO clientes (nombre, email, telefono, direccion)
         VALUES (:nombre, :email, :telefono, :direccion)
         RETURNING *'
    );
    $stmt->execute($c);

    responder(['ok' => true, 'datos' => $stmt->fetch()], 201);
}

/* ----------------------------- PUT ---------------------------- */
function actualizar(PDO $pdo): never
{
    $datos = cuerpoJson();
    $id    = filter_var($datos['id'] ?? null, FILTER_VALIDATE_INT);

    if (!$id) {
        responder(['ok' => false, 'error' => 'Falta el id del cliente'], 422);
    }

    $c = validar($datos);

    $stmt = $pdo->prepare(
        'UPDATE clientes
            SET nombre = :nombre,
                email = :email,
                telefono = :telefono,
                direccion = :direccion
          WHERE id = :id
      RETURNING *'
    );
    $stmt->execute($c + [':id' => $id]);

    $cliente = $stmt->fetch();

    if (!$cliente) {
        responder(['ok' => false, 'error' => 'Cliente no encontrado'], 404);
    }

    responder(['ok' => true, 'datos' => $cliente]);
}

/* --------------------------- DELETE --------------------------- */
function eliminar(PDO $pdo): never
{
    $id = filter_input(INPUT_GET, 'id', FILTER_VALIDATE_INT);

    if (!$id) {
        responder(['ok' => false, 'error' => 'Falta el parámetro ?id='], 422);
    }

    // ¿El cliente tiene facturas?
    $consulta = $pdo->prepare('SELECT count(*) FROM facturas WHERE cliente_id = :id');
    $consulta->execute([':id' => $id]);
    $facturas = (int) $consulta->fetchColumn();

    // Solo se borran sus facturas si el cliente lo confirma (?facturas=1)
    $conFacturas = ($_GET['facturas'] ?? '') === '1';

    if ($facturas > 0 && !$conFacturas) {
        responder([
            'ok'       => false,
            'error'    => "El cliente tiene $facturas factura(s) asociada(s)",
            'facturas' => $facturas,
        ], 409);
    }

    $pdo->beginTransaction();

    try {
        if ($facturas > 0) {
            $pdo->prepare('DELETE FROM facturas WHERE cliente_id = :id')->execute([':id' => $id]);
        }

        $stmt = $pdo->prepare('DELETE FROM clientes WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $borrado = $stmt->rowCount();

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    if ($borrado === 0) {
        responder(['ok' => false, 'error' => 'Cliente no encontrado'], 404);
    }

    responder([
        'ok'                 => true,
        'mensaje'            => 'Cliente eliminado',
        'facturas_borradas'  => $facturas,
    ]);
}

/* -------------------------- VALIDAR --------------------------- */
function validar(array $d): array
{
    $nombre    = trim((string) ($d['nombre'] ?? ''));
    $email     = trim((string) ($d['email'] ?? ''));
    $telefono  = trim((string) ($d['telefono'] ?? ''));
    $direccion = trim((string) ($d['direccion'] ?? ''));

    $errores = [];

    if ($nombre === '') {
        $errores[] = 'El nombre es obligatorio';
    } elseif (mb_strlen($nombre) > 120) {
        $errores[] = 'El nombre no puede superar 120 caracteres';
    }

    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $errores[] = 'El email no es válido';
    }

    if ($errores) {
        responder(['ok' => false, 'errores' => $errores], 422);
    }

    return [
        ':nombre'    => $nombre,
        ':email'     => $email     !== '' ? $email     : null,
        ':telefono'  => $telefono  !== '' ? $telefono  : null,
        ':direccion' => $direccion !== '' ? $direccion : null,
    ];
}