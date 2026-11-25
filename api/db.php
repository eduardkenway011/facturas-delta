<?php
declare(strict_types=1);

/**
 * Conexión a PostgreSQL mediante PDO.
 * Lee los datos de variables de entorno (ideal para despliegue en la nube).
 * En localhost puede usar valores por defecto.
 */

const DB_HOST = getenv('DB_HOST') ?: 'localhost';
const DB_PORT = getenv('DB_PORT') ?: '5432';
const DB_NAME = getenv('DB_NAME') ?: 'facturacion';
const DB_USER = getenv('DB_USER') ?: 'Daniel';
const DB_PASS = getenv('DB_PASS') ?: '';

function conexion(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dsn = sprintf('pgsql:host=%s;port=%s;dbname=%s', DB_HOST, DB_PORT, DB_NAME);

    try {
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    } catch (PDOException $e) {
        responder(['ok' => false, 'error' => 'No se pudo conectar a la base de datos'], 500);
    }

    return $pdo;
}

function responder(mixed $datos, int $codigo = 200): never
{
    http_response_code($codigo);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($datos, JSON_UNESCAPED_UNICODE);
    exit;
}

function cuerpoJson(): array
{
    $crudo = file_get_contents('php://input');
    $datos = json_decode($crudo ?: '', true);

    if (!is_array($datos)) {
        responder(['ok' => false, 'error' => 'El cuerpo debe ser JSON válido'], 400);
    }

    return $datos;
}
