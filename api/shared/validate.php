<?php
// ─── Validation + payment method helpers ────────────────────────────────────

function validate($data, $rules) {
  if (!is_array($data)) $data = [];
  $out = [];
  foreach ($rules as $field => $ruleStr) {
    $ruleset = explode('|', (string)$ruleStr);
    $exists = array_key_exists($field, $data);
    $val = $exists ? $data[$field] : null;
    if (is_string($val)) $val = trim($val);
    if (!$exists || $val === '' || $val === null) {
      if (in_array('required', $ruleset, true)) jsonError("$field requerido", 422);
      $out[$field] = null;
      continue;
    }
    foreach ($ruleset as $r) {
      if ($r === 'required') continue;
      $parts = explode(':', $r, 2);
      $name = $parts[0]; $arg = $parts[1] ?? null;
      $isNum = is_numeric($val);
      if ($name === 'string' && !is_string($data[$field]) && !$isNum) jsonError("$field debe ser texto", 422);
      elseif ($name === 'numeric' && !$isNum) jsonError("$field debe ser numérico", 422);
      elseif ($name === 'integer' && filter_var($val, FILTER_VALIDATE_INT) === false) jsonError("$field debe ser entero", 422);
      elseif ($name === 'email' && !filter_var($val, FILTER_VALIDATE_EMAIL)) jsonError("$field inválido", 422);
      elseif ($name === 'in' && !in_array((string)$val, explode(',', (string)$arg), true)) jsonError("$field inválido", 422);
      elseif ($name === 'max' && ($isNum ? $val > $arg : mb_strlen((string)$val) > (int)$arg)) jsonError("$field excede el máximo ($arg)", 422);
      elseif ($name === 'min' && ($isNum ? $val < $arg : mb_strlen((string)$val) < (int)$arg)) jsonError("$field por debajo del mínimo ($arg)", 422);
    }
    $out[$field] = $val;
  }
  return $out;
}

function validarMetodoPago($metodo) {
  return in_array($metodo, ['Efectivo', 'Transferencia'], true);
}

function normalizarMetodoPago($metodo) {
  $m = trim((string)$metodo);
  $aliasBancario = ['QR', 'QR / Transferencia', 'Llave Bancaria', 'Transferencia bancaria', 'Transferencia Bancaria'];
  if (in_array($m, $aliasBancario, true)) return 'Transferencia';
  return $m;
}

function tipoPago($metodo) {
  $m = normalizarMetodoPago($metodo);
  return $m === 'Efectivo' ? 'FISICO' : 'BANCARIO';
}
