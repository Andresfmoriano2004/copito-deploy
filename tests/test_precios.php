<?php
/**
 * Suite: precios de venta.
 * Unidad pura — sin BD ni API, por lo que es segura de ejecutar en cualquier entorno.
 * Cubre la política "el catálogo fija el precio; solo un admin puede desviarse".
 * Ejecutar: php tests/test_precios.php
 */
if (!function_exists('jsonError')) {
  function jsonError($msg, $code = 400) { throw new RuntimeException($msg, $code); }
}
require_once __DIR__ . '/../api/shared/stock_helpers.php';

// [descripción, precio del cliente, precio de catálogo, rol, precio actual del ítem (PUT), ¿debe pasar?, valor esperado]
$casos = [
  ['vendedor usa el precio del catálogo',        8000,    8000,    'vendedor', null,    true,  8000],
  ['vendedor envía 0 → usa catálogo',            0,       8000,    'vendedor', null,    true,  8000],
  ['vendedor se desvía → 403',                   1000,    8000,    'vendedor', null,    false, null],
  ['vendedor desvía 1 centavo → 403',            7990.54, 7990.55, 'vendedor', null,    false, null],
  ['vendedor desvía 1 centavo hacia arriba → 403', 8000.01, 8000.00, 'vendedor', null,   false, null],
  ['vendedor mantiene precio que fijó un admin', 5000,    8000,    'vendedor', 5000,    true,  5000],
  ['vendedor cambia el precio de un admin → 403', 7000,   8000,    'vendedor', 5000,    false, null],
  ['PUT con precio actual de la BD ("5000.00")', 5000,    8000,    'vendedor', '5000.00', true, 5000],
  ['admin pone precio libre',                    1000,    8000,    'admin',    null,    true,  1000],
  ['admin envía 0 → usa catálogo',               0,       8000,    'admin',    null,    true,  8000],
  ['catálogo llega como string de la BD',        8000,    '8000.00', 'vendedor', null,   true,  8000],
  ['catálogo y cliente como string',             '7990.55', '7990.55', 'vendedor', null,  true,  7990.55],
  ['decimales del cliente intactos en admin',    8000.01, 8000.00, 'admin',    null,    true,  8000.01],
];

$pass = 0;
$fail = 0;
$errores = [];

foreach ($casos as [$desc, $cli, $cat, $rol, $act, $okEsperado, $esp]) {
  try {
    $r = aplicarPrecioItem($cli, $cat, ['rol' => $rol], $act);
    if (!$okEsperado) {
      $fail++; $errores[] = "$desc: esperaba 403 y devolvió $r";
      echo "  x FAIL: $desc — esperaba 403, devolvió $r\n";
    } elseif (abs($r - $esp) > 0.001) {
      $fail++; $errores[] = "$desc: esperaba $esp, devolvió $r";
      echo "  x FAIL: $desc — esperaba $esp, devolvió $r\n";
    } else {
      $pass++; echo "  v $desc -> $r\n";
    }
  } catch (RuntimeException $e) {
    if ($okEsperado) {
      $fail++; $errores[] = "$desc: no debía fallar — {$e->getMessage()}";
      echo "  x FAIL: $desc — no debía fallar: {$e->getMessage()}\n";
    } elseif ($e->getCode() !== 403) {
      $fail++; $errores[] = "$desc: código {$e->getCode()} no es 403";
      echo "  x FAIL: $desc — código {$e->getCode()} no es 403\n";
    } else {
      $pass++; echo "  v $desc -> 403\n";
    }
  }
}

echo "--- test_precios: pasados=$pass fallidos=$fail ---\n";
foreach ($errores as $e) echo "  - $e\n";
exit($fail ? 1 : 0);
