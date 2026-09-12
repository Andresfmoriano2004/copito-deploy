<?php
// ─── Interceptar TODOS los errores y devolverlos como JSON ──────────────────
ob_start();
set_error_handler(function($errno, $errstr, $errfile, $errline) {
    ob_end_clean();
    error_log("Copito API error [$errno]: $errstr in " . basename($errfile) . ":$errline");
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    $appOrigin = getenv('APP_ORIGIN');
    if ($appOrigin) header('Access-Control-Allow-Origin: ' . $appOrigin);
    echo json_encode([
        'error' => 'Error interno del servidor',
        'message' => 'Error interno del servidor'
    ]);
    exit;
});
set_exception_handler(function($e) {
    ob_end_clean();
    error_log("Copito API exception: " . $e->getMessage() . " in " . basename($e->getFile()) . ":" . $e->getLine());
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    $appOrigin = getenv('APP_ORIGIN');
    if ($appOrigin) header('Access-Control-Allow-Origin: ' . $appOrigin);
    echo json_encode([
        'error' => 'Error interno del servidor',
        'message' => 'Error interno del servidor'
    ]);
    exit;
});

require_once __DIR__ . '/api/config.php';

// ─── Detectar ruta ─────────────────────────────────────────────────────────
$route = '';

if (isset($_GET['route']) && $_GET['route'] !== '') {
    // Método principal: .htaccess pasa route=$1 (incluye slash inicial)
    $route = trim($_GET['route'], '/');
}
elseif (!empty($_SERVER['PATH_INFO'])) {
    // Fallback: PATH_INFO
    $route = trim($_SERVER['PATH_INFO'], '/');
}
else {
    // Último recurso: parsear REQUEST_URI
    $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    $uri = preg_replace('#^/?(?:.*?/)?api(?:\.php)?/?#i', '', $uri);
    $route = trim($uri, '/');
}

// ─── Módulos ────────────────────────────────────────────────────────────────
$modules = [
    'auth'        => __DIR__ . '/api/auth.php',
    'dashboard'   => __DIR__ . '/api/dashboard.php',
    'productos'   => __DIR__ . '/api/productos.php',
    'movimientos' => __DIR__ . '/api/movimientos.php',
    'pedidos'     => __DIR__ . '/api/pedidos.php',
    'caja'        => __DIR__ . '/api/caja.php',
    'usuarios'    => __DIR__ . '/api/usuarios.php',
    'grupos'      => __DIR__ . '/api/grupos.php',
    'unidades'    => __DIR__ . '/api/unidades.php',
    'proveedores' => __DIR__ . '/api/proveedores.php',
    'mesas'       => __DIR__ . '/api/mesas.php',
    'auditoria'   => __DIR__ . '/api/auditoria.php',
    'mantenimiento' => __DIR__ . '/api/mantenimiento.php',
    'reportes'    => __DIR__ . '/api/reportes.php',
];

// ─── Health check ───────────────────────────────────────────────────────────
if ($route === '' || $route === 'health') {
    try {
        db()->query('SELECT 1');
        jsonResponse(['status' => 'ok']);
    } catch (Exception $e) {
        jsonResponse(['status' => 'error'], 500);
    }
}

// ─── Dispatch al módulo ─────────────────────────────────────────────────────
$matched = '';
$matchedLen = 0;
foreach ($modules as $prefix => $file) {
    if ($route === $prefix || strpos($route, $prefix . '/') === 0) {
        if (strlen($prefix) > $matchedLen) {
            $matched = $prefix;
            $matchedLen = strlen($prefix);
        }
    }
}
if ($matched !== '') {
    $_GET['route'] = $route;
    ob_end_clean();
    require $modules[$matched];
    exit;
}

jsonError('Ruta API no encontrada: /' . $route, 404);
