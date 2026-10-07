<?php
/**
 * Harness compartido de la suite Copito POS.
 * Tests e2e contra http://localhost/copito-deploy/api con JWT forjado (admin activo).
 * Ejecutar: php tests/run_all.php
 */
require_once __DIR__ . '/../api/config.php';
require_once __DIR__ . '/../api/shared/jwt.php';

// En las suites que mueven dinero la BD de pruebas sobreescribe TEST_API
// (ver tests/testdb.php); sin eso se usa Apache contra la BD real.
define('TEST_API', getenv('TEST_API') ?: 'http://localhost/copito-deploy/api');
define('TEST_TAG', 'TEST-AUTO');

$__passed = 0;
$__failed = 0;
$__errors = [];

function t_ok($name, $cond, $detail = '') {
  global $__passed, $__failed, $__errors;
  if ($cond) { echo "  \xE2\x9C\x93 $name\n"; $__passed++; }
  else {
    echo "  \xE2\x9C\x97 FAIL: $name" . ($detail ? " \xE2\x80\x94 $detail" : '') . "\n";
    $__failed++;
    $__errors[] = "$name: $detail";
  }
}

function t_summary($suite) {
  global $__passed, $__failed, $__errors;
  echo "--- $suite: pasados=$__passed fallidos=$__failed ---\n";
  foreach ($__errors as $e) echo "  - $e\n";
  return $__failed;
}

function t_admin() {
  $stmt = db()->prepare("SELECT id, username, nombre FROM usuarios WHERE rol='admin' AND activo=TRUE ORDER BY id LIMIT 1");
  $stmt->execute();
  $row = $stmt->fetch();
  if (!$row) { echo "ERROR: sin admin activo para forjar JWT\n"; exit(1); }
  return $row;
}

function t_token() {
  static $tok = null;
  if ($tok === null) {
    $a = t_admin();
    $tok = jwtEncode(['id' => (int)$a['id'], 'username' => $a['username'], 'nombre' => $a['nombre'], 'rol' => 'admin']);
  }
  return $tok;
}

function t_req($method, $path, $body = null) {
  $ch = curl_init(TEST_API . $path);
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
  curl_setopt($ch, CURLOPT_TIMEOUT, 15);
  $headers = ['Authorization: Bearer ' . t_token()];
  if ($body !== null) {
    $headers[] = 'Content-Type: application/json';
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
  }
  curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
  $raw = curl_exec($ch);
  $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $cerr = curl_error($ch);
  curl_close($ch);
  if ($raw === false) return [$code, ['_curl' => $cerr]];
  $data = json_decode($raw, true);
  return [$code, is_array($data) ? $data : ['_raw' => substr((string)$raw, 0, 200)]];
}

function t_code($method, $path, $body = null) {
  [$code] = t_req($method, $path, $body);
  return $code;
}

function t_crear_pedido($lugar) {
  [$code, $res] = t_req('POST', '/pedidos', ['lugar' => $lugar, 'cliente' => TEST_TAG]);
  if ($code !== 200 || empty($res['pedidoId'])) {
    echo "ERROR setup: no se pudo crear pedido ($code " . json_encode($res) . ")\n";
    exit(1);
  }
  return $res['pedidoId'];
}

function t_agregar_item($pedidoId, $codigo, $nombre, $cant, $precio) {
  return t_req('POST', "/pedidos/$pedidoId/items", [
    'codigo' => $codigo, 'nombre' => $nombre, 'cantidad' => $cant,
    'precioUnitario' => $precio, 'notas' => '', 'cuenta' => null
  ]);
}

function t_detalle_id($pedidoId) {
  [$code, $ped] = t_req('GET', "/pedidos/$pedidoId");
  if ($code !== 200 || empty($ped['items'])) return null;
  return $ped['items'][0]['id'];
}

// Limpieza total de un pedido de prueba (incluye caja, stock y su auditoría;
// la auditoría de pedidos reales nunca se toca). Orden FK-seguro.
function t_limpiar_pedido($pedidoId) {
  $pdo = db();
  $pdo->prepare("DELETE FROM auditoria WHERE pedido_id=?")->execute([$pedidoId]);
  $pdo->prepare("DELETE FROM caja_movimientos WHERE id_pedido=?")->execute([$pedidoId]);
  $pdo->prepare("DELETE FROM movimientos WHERE notas LIKE ?")->execute(["%Pedido $pedidoId%"]);
  $pdo->prepare("DELETE FROM pagos WHERE id_pedido=?")->execute([$pedidoId]);
  $pdo->prepare("DELETE FROM detalle_pedido WHERE id_pedido=?")->execute([$pedidoId]);
  $pdo->prepare("DELETE FROM pedidos WHERE id_pedido=?")->execute([$pedidoId]);
}

function t_stock_de($codigo) {
  [$code, $res] = t_req('GET', '/movimientos/stock');
  if ($code !== 200) return null;
  foreach (($res['data'] ?? $res) as $r) {
    if (($r['codigo'] ?? '') === $codigo) return (float)($r['stockActual'] ?? $r['stock'] ?? 0);
  }
  return null;
}
