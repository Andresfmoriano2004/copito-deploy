<?php
// ─── Facturación — Comprobante de venta ("Camino A") ────────────────────────
//
// Rutas (todas bajo /api/facturacion):
//   GET  /facturacion                      listado paginado
//   GET  /facturacion/config               datos del emisor + serie de numeración
//   PUT  /facturacion/config               guardar datos del emisor      [admin]
//   POST /facturacion/emitir               emitir pendientes             [admin]
//   GET  /facturacion/{numero}             detalle (p.ej. FEV-000001)
//   POST /facturacion/{numero}/anular      anular                        [admin]
//
// No hay resolución DIAN, ni CUFE, ni TrackID: esto es Camino A (numeración
// propia con prefijo). Ver sql/migracion_v9_facturacion.sql.

require_once __DIR__ . '/../config.php';

$method   = $_SERVER['REQUEST_METHOD'];
$path     = $_GET['route'] ?? '';
$pdo      = db();
$authUser = requireAuth();
$esAdmin  = ($authUser['rol'] ?? '') === 'admin';
// Como todo módulo del router: api/config.php no parsea el cuerpo, lo hace
// cada archivo. Sin esto PUT /config y POST /anular recibirían $body vacío.
$body     = jsonBody();

// ─── GET /api/facturacion/config ─────────────────────
if ($method === 'GET' && $path === 'facturacion/config') {
  $todas = configuraciones($pdo);

  $empresa = [];
  foreach ($todas as $clave => $valor) {
    if (strpos($clave, 'empresa.') === 0) {
      $empresa[substr($clave, strlen('empresa.'))] = $valor;
    }
  }

  $serie = [];
  foreach ($pdo->query('SELECT prefijo, siguiente, numero_hasta, resolucion,
                               vigencia_desde, vigencia_hasta, activo
                        FROM facturacion_consecutivos ORDER BY prefijo') as $r) {
    $serie[] = [
      'prefijo'       => $r['prefijo'],
      'siguiente'     => (int)$r['siguiente'],
      'numeroHasta'   => (int)$r['numero_hasta'],
      'resolucion'    => $r['resolucion'],
      'vigenciaDesde' => $r['vigencia_desde'],
      'vigenciaHasta' => $r['vigencia_hasta'],
      'activo'        => (bool)$r['activo'],
    ];
  }

  jsonResponse([
    'empresa'    => $empresa,
    'serie'      => $serie,
    'activo'     => facturacionActiva($pdo, $todas),
    'porcentaje' => (float)configVal('facturacion.porcentaje_iva', '19', $todas),
  ]);
}

// ─── PUT /api/facturacion/config ─────────────────────
if ($method === 'PUT' && $path === 'facturacion/config') {
  if (!$esAdmin) jsonError('Solo un administrador puede editar la configuración fiscal', 403);

  // Lista blanca: NUNCA se escribe una clave que no esté acá, para que nadie
  // pueda inyectar claves arbitrarias en `configuraciones`.
  $textos = ['nombre_comercial' => 120, 'razon_social' => 160, 'subtitulo' => 120,
             'direccion' => 200, 'ciudad' => 80, 'telefono' => 40,
             'regimen' => 30, 'actividad_economica' => 20,
             'mensaje_pie' => 120, 'pie_secundario' => 120];
  $aGuardar = [];

  foreach ($textos as $k => $max) {
    if (!isset($body[$k])) continue;
    $v = mb_substr((string)$body[$k], 0, $max);
    $aGuardar['empresa.' . $k] = $v;
  }
  if (isset($body['nit']))   $aGuardar['empresa.nit']   = normalizarIdentificacion($body['nit']) ?? '';
  if (isset($body['dv']))    $aGuardar['empresa.dv']    = normalizarIdentificacion($body['dv'], 1) ?? '';

  if (isset($body['activo'])) {
    $aGuardar['facturacion.activo'] = (!empty($body['activo']) && $body['activo'] !== '0') ? '1' : '0';
  }
  if (isset($body['porcentaje'])) {
    $p = (float)$body['porcentaje'];
    if ($p < 0 || $p > 100) jsonError('El porcentaje de IVA debe estar entre 0 y 100');
    $aGuardar['facturacion.porcentaje_iva'] = (string)$p;
  }

  if (!$aGuardar) jsonError('Nada que actualizar');

  $pdo->beginTransaction();
  try {
    $up = $pdo->prepare('INSERT INTO configuraciones (clave, valor) VALUES (?,?)
                         ON DUPLICATE KEY UPDATE valor = VALUES(valor)');
    foreach ($aGuardar as $k => $v) $up->execute([$k, $v]);
    auditLog($authUser, 'ACTUALIZAR_CONFIG_FISCAL', null, null, ['claves' => array_keys($aGuardar)]);
    $pdo->commit();
  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    jsonError('No se pudo guardar la configuración fiscal', 500);
  }

  jsonResponse(['success' => true, 'mensaje' => 'Configuración fiscal actualizada']);
}

// ─── GET /api/facturacion ────────────────────────────
if ($method === 'GET' && ($path === 'facturacion' || $path === 'facturacion/')) {
  $pagina = max(1, (int)($_GET['pagina'] ?? 1));
  $porPagina = min(100, max(1, (int)($_GET['porPagina'] ?? 20)));
  $desde = ($pagina - 1) * $porPagina;

  $filtro = []; $vals = [];
  if (!empty($_GET['estado']) && in_array($_GET['estado'], ['Emitida', 'Anulada'], true)) {
    $filtro[] = 'f.estado = ?';
    $vals[] = $_GET['estado'];
  }
  if (!empty($_GET['desde'])) { $filtro[] = 'f.fecha_emision >= ?'; $vals[] = $_GET['desde'] . ' 00:00:00'; }
  if (!empty($_GET['hasta'])) { $filtro[] = 'f.fecha_emision <= ?'; $vals[] = $_GET['hasta'] . ' 23:59:59'; }
  $where = $filtro ? 'WHERE ' . implode(' AND ', $filtro) : '';

  $cnt = $pdo->prepare("SELECT COUNT(*) FROM facturas f $where");
  $cnt->execute($vals);
  $total = (int)$cnt->fetchColumn();

  $st = $pdo->prepare("SELECT f.numero, f.fecha_emision, f.estado, f.lugar, f.forma_pago,
                               f.cliente_nombre, f.cliente_nit, f.cliente_dv,
                               f.total_base, f.total_iva, f.total, f.id_pedido
                        FROM facturas f $where
                        ORDER BY f.fecha_emision DESC, f.id DESC
                        LIMIT $porPagina OFFSET $desde");
  $st->execute($vals);

  jsonResponse([
    'total' => $total,
    'pagina' => $pagina,
    'porPagina' => $porPagina,
    'facturas' => array_map(fn($r) => [
      'numero'      => $r['numero'],
      'fecha'       => $r['fecha_emision'],
      'estado'      => $r['estado'],
      'lugar'       => $r['lugar'],
      'formaPago'   => $r['forma_pago'],
      'cliente'     => $r['cliente_nombre'] ?? '',
      'nit'         => formatoIdentificacion($r['cliente_nit'], $r['cliente_dv']),
      'base'        => round((float)$r['total_base'], 2),
      'iva'         => round((float)$r['total_iva'], 2),
      'total'       => round((float)$r['total'], 2),
      'pedido'      => $r['id_pedido'],
    ], $st->fetchAll()),
  ]);
}

// ─── POST /api/facturacion/emitir ────────────────────
// Puesta al día: emite los pedidos que quedaron cerrados sin comprobante
// (p.ej. por una caída del servidor justo al cobrar).
if ($method === 'POST' && $path === 'facturacion/emitir') {
  if (!$esAdmin) jsonError('Solo un administrador puede emitir facturas', 403);

  $st = $pdo->query("SELECT id_pedido FROM pedidos
                     WHERE estado='Cerrado' AND numero_factura IS NULL
                     ORDER BY fecha_cierre DESC LIMIT 500");
  $pendientes = array_column($st->fetchAll(), 'id_pedido');
  if (!$pendientes) jsonResponse(['success' => true, 'emitidas' => 0, 'pendientes' => 0, 'fallidas' => []]);

  $emitidas = 0;
  $fallidas = [];
  $pdo->beginTransaction();
  try {
    foreach ($pendientes as $id) {
      $r = emitirFactura($pdo, $id, $authUser['id']);
      if ($r['emitida']) $emitidas++;
      else $fallidas[$id] = $r['motivo'];
    }
    $pdo->commit();
  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    jsonError('No se pudieron emitir las facturas pendientes: ' . $e->getMessage(), 500);
  }

  auditLog($authUser, 'EMITIR_FACTURAS', null, null, ['emitidas' => $emitidas]);
  jsonResponse([
    'success'    => true,
    'emitidas'   => $emitidas,
    'pendientes' => count($pendientes),
    'fallidas'   => $fallidas,
    'mensaje'    => "$emitidas comprobante(s) emitido(s)",
  ]);
}

// ─── POST /api/facturacion/{numero}/anular ───────────
if ($method === 'POST' && preg_match('#^facturacion/([^/]+)/anular$#', $path, $m)) {
  if (!$esAdmin) jsonError('Solo un administrador puede anular facturas', 403);

  $numero = trim($m[1]);
  $motivo = trim((string)($body['motivo'] ?? ''));
  if ($motivo === '') jsonError('El motivo de la anulación es obligatorio');
  if (mb_strlen($motivo) > 255) $motivo = mb_substr($motivo, 0, 255);

  $pdo->beginTransaction();
  try {
    $st = $pdo->prepare('SELECT * FROM facturas WHERE numero=? FOR UPDATE');
    $st->execute([$numero]);
    $f = $st->fetch();
    if (!$f) jsonError('Factura no encontrada', 404);
    if ($f['estado'] !== 'Emitida') jsonError('La factura ya estaba anulada', 409);

    $pdo->prepare("UPDATE facturas SET estado='Anulada', anulada_motivo=?, anulada_en=NOW(), anulada_por=? WHERE id=?")
        ->execute([$motivo, $authUser['id'], $f['id']]);

    auditLog($authUser, 'ANULAR_FACTURA', $f['id_pedido'], null, ['numero' => $numero, 'motivo' => $motivo]);
    $pdo->commit();
  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('facturacion: error anulando ' . $numero . ': ' . $e->getMessage());
    jsonError('No se pudo anular la factura', 500);
  }

  jsonResponse(['success' => true, 'mensaje' => "Factura $numero anulada"]);
}

// ─── GET /api/facturacion/{numero} ───────────────────
if ($method === 'GET' && preg_match('#^facturacion/([^/]+)$#', $path, $m)) {
  $numero = trim($m[1]);
  $st = $pdo->prepare('SELECT * FROM facturas WHERE numero=?');
  $st->execute([$numero]);
  $f = $st->fetch();
  if (!$f) jsonError('Factura no encontrada', 404);

  $det = $pdo->prepare('SELECT * FROM detalle_pedido WHERE id_pedido=? ORDER BY cuenta, id');
  $det->execute([$f['id_pedido']]);
  $lineas = $det->fetchAll();

  jsonResponse([
    'factura' => [
      'numero'      => $f['numero'],
      'fecha'       => $f['fecha_emision'],
      'estado'      => $f['estado'],
      'lugar'       => $f['lugar'],
      'formaPago'   => $f['forma_pago'],
      'pedido'      => $f['id_pedido'],
      'cliente'     => ['nombre' => $f['cliente_nombre'], 'nit' => $f['cliente_nit'],
                        'dv' => $f['cliente_dv'], 'direccion' => $f['cliente_direccion'],
                        'email' => $f['cliente_email'], 'regimen' => $f['cliente_regimen']],
      'totales'     => ['base' => round((float)$f['total_base'], 2),
                        'descuentos' => round((float)$f['total_descuentos'], 2),
                        'iva' => round((float)$f['total_iva'], 2),
                        'total' => round((float)$f['total'], 2)],
      'anuladaMotivo' => $f['anulada_motivo'],
    ],
    'lineas' => array_map(fn($d) => [
      'codigo'     => $d['codigo_producto'],
      'nombre'     => $d['nombre_producto'],
      'cantidad'   => (float)$d['cantidad'],
      'precio'     => (float)$d['precio_unitario'],
      'subtotal'   => (float)$d['subtotal'],
      'unidad'     => $d['unidad'],
      'tipoItem'   => $d['tipo_item'],
      'ivaPct'     => (float)$d['iva_porcentaje'],
      'base'       => (float)$d['base_gravable'],
      'iva'        => (float)$d['iva_valor'],
      'cuenta'     => $d['cuenta'],
      'notas'      => $d['notas'] ?? '',
    ], $lineas),
    'empresa' => empresaFactura($pdo),
  ]);
}
