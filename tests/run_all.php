<?php
/**
 * Corredor de la suite Copito POS.
 * Ejecutar: php tests/run_all.php
 * Sale con código 1 si alguna suite falla.
 */
$suites = ['test_pagos.php', 'test_caja.php', 'test_inventario.php', 'test_auth_ratelimit.php', 'test_split_bill.php'];
$globalFail = 0;
foreach ($suites as $s) {
  echo "\n########################################\n# $s\n########################################\n";
  $cmd = PHP_BINARY . ' ' . escapeshellarg(__DIR__ . '/' . $s);
  $out = [];
  $code = 0;
  exec($cmd . ' 2>&1', $out, $code);
  echo implode("\n", $out) . "\n";
  if ($code !== 0) { $globalFail = 1; echo ">> $s FALLÓ (exit=$code)\n"; }
  else { echo ">> $s OK\n"; }
}
echo $globalFail ? "\nRESULTADO: FALLÓ\n" : "\nRESULTADO: TODO OK\n";
exit($globalFail);
