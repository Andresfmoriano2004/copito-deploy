<?php
// ─── Date formatting (America/Bogota) ──────────────────────────────────────

function fmtFechaBogota($mysqlDatetime) {
  if (empty($mysqlDatetime)) return '';
  $ts = strtotime($mysqlDatetime);
  if ($ts === false) return '';
  return date('d/m/Y', $ts);
}

function fmtHoraBogota($mysqlDatetime) {
  if (empty($mysqlDatetime)) return '';
  $ts = strtotime($mysqlDatetime);
  if ($ts === false) return '';
  return date('h:i A', $ts);
}

function fmtFechaHoraBogota($mysqlDatetime) {
  if (empty($mysqlDatetime)) return '';
  $ts = strtotime($mysqlDatetime);
  if ($ts === false) return '';
  return date('d/m/Y h:i A', $ts);
}

function fechaBogota($mysqlDatetime) {
  if (empty($mysqlDatetime)) return ['iso' => null, 'fecha' => '', 'hora' => '', 'fechaHora' => ''];
  $ts = strtotime($mysqlDatetime);
  if ($ts === false) return ['iso' => null, 'fecha' => '', 'hora' => '', 'fechaHora' => ''];
  return [
    'iso' => date('Y-m-d H:i:s', $ts),
    'fecha' => date('d/m/Y', $ts),
    'hora' => date('h:i A', $ts),
    'fechaHora' => date('d/m/Y h:i A', $ts)
  ];
}
