<?php
require_once __DIR__ . '/config.php';
$authUser = requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$path = $_GET['route'] ?? '';
$body = jsonBody();
$pdo = db();

require_once __DIR__ . '/pedidos_helpers.php';
require_once __DIR__ . '/pedidos_list.php';
require_once __DIR__ . '/pedidos_reports.php';
require_once __DIR__ . '/pedidos_detail.php';
require_once __DIR__ . '/pedidos_crud.php';
require_once __DIR__ . '/pedidos_pay.php';

jsonError('Ruta no encontrada', 404);