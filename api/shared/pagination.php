<?php
// ─── Pagination helpers ────────────────────────────────────────────────────

function pageParams($defaultLimit = 50, $maxLimit = 500) {
  $hasPaging = isset($_GET['page']);
  $page = max(1, (int)($_GET['page'] ?? 1));
  $limit = min($maxLimit, max(1, (int)($_GET['limit'] ?? $defaultLimit)));
  return ['page' => $page, 'limit' => $limit, 'hasPaging' => $hasPaging,
          'offset' => ($page - 1) * $limit];
}

function pagedResponse($data, $total, $page, $limit) {
  jsonResponse(['data' => array_values($data), 'total' => (int)$total,
                'page' => (int)$page, 'limit' => (int)$limit]);
}
