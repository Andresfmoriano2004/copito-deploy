<?php
// ─── Audit log ─────────────────────────────────────────────────────────────

function auditLog($user, $operacion, $pedidoId = null, $mesa = null, $detalle = null) {
  $stmt = db()->prepare('INSERT INTO auditoria (usuario_id, codigo_referencia, operacion, pedido_id, mesa, detalle) VALUES (?,?,?,?,?,?)');
  $stmt->execute([(int)$user['id'], $user['codigo_referencia'] ?? null, $operacion, $pedidoId, $mesa, $detalle ? json_encode($detalle, JSON_UNESCAPED_UNICODE) : null]);
}
