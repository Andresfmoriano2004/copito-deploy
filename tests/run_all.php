<?php
/**
 * Corredor de la suite Copito POS.
 * Ejecutar: php tests/run_all.php
 * Sale con código 1 si alguna suite implementada falla.
 *
 * Las suites aún no escritas se listan como PENDIENTES (no hacen fallar el
 * corredor, pero tampoco se ocultan): el estado real de la cobertura se ve
 * en cada ejecución. Lo que aún no está automatizado está en CHECKLIST.md.
 */
// Orden: primero las unitarias (rápidas), luego las que mueven dinero (crean la
// BD de pruebas y su servidor) y al final la de superficie pública (necesita Apache).
$suites = ['test_precios.php', 'test_pagos.php', 'test_caja.php', 'test_seguridad.php'];
$pendientes = ['test_inventario.php', 'test_auth_ratelimit.php', 'test_split_bill.php'];

$globalFail = 0;
foreach ($suites as $s) {
  echo "\n########################################\n# $s\n########################################\n";
  if (!is_file(__DIR__ . '/' . $s)) {
    echo ">> $s NO EXISTE (declarada en el corredor pero no está escrita)\n";
    $globalFail = 1;
    continue;
  }
  $cmd = PHP_BINARY . ' ' . escapeshellarg(__DIR__ . '/' . $s);
  $out = [];
  $code = 0;
  exec($cmd . ' 2>&1', $out, $code);
  echo implode("\n", $out) . "\n";
  if ($code !== 0) { $globalFail = 1; echo ">> $s FALLÓ (exit=$code)\n"; }
  else { echo ">> $s OK\n"; }
}

if ($pendientes) {
  echo "\n########################################\n# Suites pendientes (sin implementar)\n########################################\n";
  foreach ($pendientes as $s) echo "  - $s\n";
  echo "  Ver CHECKLIST.md para la verificación manual de estos flujos.\n";
}

echo $globalFail ? "\nRESULTADO: FALLÓ\n" : "\nRESULTADO: TODO OK\n";
exit($globalFail);
