<?php
/**
 * Infraestructura para las suites que mueven dinero y stock.
 *
 * Problema que resuelve: las pruebas no pueden tocar la BD real (`dpcoffee`),
 * porque ahí vive la caja del día y el inventario del local.
 *
 * Solución: una base aislada `dpcoffee_test` servida por un segundo proceso
 * `php -S` con su propio `DB_NAME`, arrancado y detenido por esta misma suite.
 * Se usa `router.php` (el router de pruebas que ya traía el proyecto), que hace
 * el mismo enrutado `/api → api.php` que Apache.
 *
 *   DB creada por primera vez  → se importa `sql/dpcoffee.sql` + migraciones
 *   DB ya existente           → solo se vacían las tablas volátiles (rápido)
 *
 * Ninguna función de aquí escribe en la BD real.
 */

const T_DB    = 'dpcoffee_test';
const T_REAL  = 'dpcoffee';
const T_PUERTO = 8099;
const T_HOST   = '127.0.0.1';

/**
 * Orden real de instalación.
 * OJO: `dpcoffee.sql` ya trae consolidadas la v2 y la v3 (contiene
 * `productos.imagen_url`, `usuarios.codigo_referencia`, `pedidos.cancelado_por`
 * y `mesas.estado_manual`), así que ejecutarlas después de importarlo falla con
 * "Duplicate column name". Las que faltan empiezan en la v4.
 */
function t_archivos_sql() {
  $dir = realpath(__DIR__ . '/../sql');
  if ($dir === false) throw new RuntimeException('No existe el directorio sql/');
  $orden = [
    'dpcoffee.sql',
    'migracion_v4_proveedores.sql',
    'migracion_v5_fks.sql',
    'migracion_v6_split_cuentas.sql',
    'migracion_v7_propinas_recetas_angie.sql',
    'migracion_v7a_materia_prima.sql',
    'migracion_v8_propinas_tabla.sql',
    'migracion_v9_facturacion.sql',
    'migracion_v10_recetas_pasos.sql',
  ];
  $rutas = [];
  foreach ($orden as $n) {
    $p = $dir . DIRECTORY_SEPARATOR . $n;
    if (!is_file($p)) throw new RuntimeException("Falta el archivo de migración: $p");
    $rutas[] = $p;
  }
  return $rutas;
}

function t_bin($tipo) {
  $env = getenv(strtoupper($tipo) . '_BIN');
  if ($env) return $env;
  $ruta = 'C:\\xampp\\mysql\\bin\\' . $tipo . '.exe';
  return is_file($ruta) ? $ruta : $tipo; // si no, confiamos en el PATH
}

function t_args_sql() {
  $u = getenv('MYSQL_USER') ?: 'root';
  $a = '-u ' . escapeshellarg($u);
  $p = getenv('MYSQL_PASS');
  if ($p !== false && $p !== '') $a .= ' -p' . escapeshellarg($p);
  return $a;
}

function t_pdo($db = null) {
  $host = getenv('DB_HOST') ?: 'localhost';
  $port = getenv('DB_PORT') ?: '3306';
  $dsn = "mysql:host=$host;port=$port;dbname=" . ($db ?: 'mysql') . ';charset=utf8mb4';
  $p = getenv('MYSQL_PASS');
  return new PDO($dsn, getenv('MYSQL_USER') ?: 'root', $p === false ? '' : $p, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
  ]);
}

function t_db_existe($nombre) {
  $st = t_pdo()->prepare('SELECT 1 FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?');
  $st->execute([$nombre]);
  return (bool)$st->fetchColumn();
}

function t_importar($archivo) {
  $cmd = escapeshellarg(t_bin('mysql')) . ' ' . t_args_sql()
       . ' --default-character-set=utf8mb4 ' . escapeshellarg(T_DB)
       . ' < ' . escapeshellarg($archivo) . ' 2>&1';
  $out = [];
  $code = 0;
  exec($cmd, $out, $code);
  if ($code !== 0) {
    throw new RuntimeException("Falló la migración " . basename($archivo) . " (exit=$code):\n" . implode("\n", $out));
  }
}

function t_db_crear() {
  $base = t_pdo();
  $base->exec('DROP DATABASE IF EXISTS `' . T_DB . '`');
  $base->exec('CREATE DATABASE `' . T_DB . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci');
  foreach (t_archivos_sql() as $f) t_importar($f);
}

/** Tablas que las pruebas rellenan: se vacían, no se destruye el esquema. */
function t_tablas_volatiles() {
  // Se vacían con FOREIGN_KEY_CHECKS=0, así que el orden no es crítico.
  // `facturacion_consecutivos` NO va aquí: borrarla apagaría la numeración.
  return ['propina_distribucion', 'propinas', 'consumos_internos', 'caja_movimientos',
          'caja', 'pagos', 'movimientos', 'facturas', 'detalle_pedido', 'pedidos',
          'receta_pasos', 'recetas', 'auditoria', 'productos'];
}

function t_db_limpiar() {
  $pdo = t_pdo(T_DB);
  $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
  foreach (t_tablas_volatiles() as $t) {
    // Tablas que pueden no existir si una migración falló en una corrida previa.
    $st = $pdo->prepare('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?');
    $st->execute([T_DB, $t]);
    if ($st->fetchColumn()) $pdo->exec('DELETE FROM `' . $t . '`');
  }
  $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
}

/**
 * Prepara la BD de pruebas. Devuelve 'creada' o 'limpiada'.
 * Nunca toca T_REAL.
 */
function t_db_preparar() {
  if (!t_db_existe(T_DB)) { t_db_crear(); return 'creada'; }
  t_db_limpiar();
  return 'limpiada';
}

// ─── Servidor de pruebas ────────────────────────────────────────────────────

/** Log del servidor de pruebas (se vacía en cada arranque). */
function t_log_servidor() {
  return rtrim(sys_get_temp_dir(), '\\/') . DIRECTORY_SEPARATOR . 'copito_test_server.log';
}

/**
 * ¿Ya hay un servidor respondiendo en nuestro puerto?
 *
 * OJO: `php -S` NO envía nada por el socket hasta que recibe una petición,
 * así que un `fread()` a ciegas devuelve cadena vacía y da un falso negativo.
 * Hay que hablarle HTTP de verdad y leer la línea de estado.
 */
function t_puerto_nuestro() {
  $f = @fsockopen(T_HOST, T_PUERTO, $errno, $errstr, 0.3);
  if (!$f) return false;
  stream_set_timeout($f, 0, 500000); // 0.5 s
  @fwrite($f, "GET /api/caja/activa HTTP/1.0\r\nHost: " . T_HOST . ':' . T_PUERTO . "\r\n\r\n");
  $status = '';
  for ($i = 0; $i < 40; $i++) {
    $line = fgets($f, 512);
    if ($line === false) break;
    $line = trim($line);
    if ($line !== '') { $status = $line; break; }   // "HTTP/1.1 401 Unauthorized"
  }
  @fclose($f);
  return (bool)preg_match('#^HTTP/\d#', $status);
}

/** Últimas líneas del log del servidor, para mensajes de error accionables. */
function t_log_tail($n = 8) {
  $log = t_log_servidor();
  if (!is_file($log)) return '(sin log en ' . $log . ')';
  $lines = array_values(array_filter(explode("\n", (string)@file_get_contents($log)), 'strlen'));
  if (!$lines) return '(log vacío en ' . $log . ')';
  return implode("\n", array_slice($lines, -$n));
}

function t_servidor_arrancar() {
  if (t_puerto_nuestro()) return null; // ya corre (corrida anterior que no lo cerró)

  $log = t_log_servidor();
  @file_put_contents($log, '');        // vacío: así el banner que aparezca es del arranque ACTUAL
  $desc = [0 => ['pipe', 'r'], 1 => ['file', $log, 'ab'], 2 => ['file', $log, 'ab']];

  $env = getenv();                       // copia el entorno completo (incluye DB_USER…)
  $env['DB_NAME'] = T_DB;                // ← el cambio clave: la API usa la BD de pruebas
  $env['APP_ENV']  = 'testing';

  $cmd = [PHP_BINARY, '-S', T_HOST . ':' . T_PUERTO, realpath(__DIR__ . '/../router.php')];
  $h = @proc_open($cmd, $desc, $pipes, realpath(__DIR__ . '/..'), $env);
  if (!is_resource($h)) return false;

  // Dos señales: el banner del propio proceso ("… Development Server (…) started")
  // y una petición HTTP real. Cualquiera de las dos basta.
  $fin = microtime(true) + 10;
  while (microtime(true) < $fin) {
    $banner = (string)@file_get_contents($log);
    if (stripos($banner, 'Development Server') !== false && t_puerto_nuestro()) return $h;
    usleep(100000);
  }

  // No levantó: devuelve el error del servidor para que el mensaje sea accionable.
  proc_terminate($h);
  proc_close($h);
  return false;
}

function t_servidor_parar($h) {
  if (!is_resource($h)) return;
  proc_terminate($h);
  for ($i = 0; $i < 30; $i++) {
    $st = proc_get_status($h);
    if (!$st['running']) break;
    usleep(100000);
  }
  if (proc_get_status($h)['running']) proc_terminate($h, 9);
  proc_close($h);
}

// ─── Utilidades de aserción sobre la BD de pruebas ──────────────────────────

function t_stock($codigo, $pdo = null) {
  $pdo = $pdo ?: t_pdo(T_DB);
  $st = $pdo->prepare("SELECT COALESCE(ROUND(SUM(CASE WHEN tipo='INGRESO' THEN cantidad ELSE -cantidad END),2),0)
                       FROM movimientos WHERE codigo_producto=?");
  $st->execute([$codigo]);
  return round((float)$st->fetchColumn(), 2);
}

/**
 * Crea un producto de prueba con stock conocido.
 * Solo escribe en la BD de pruebas.
 */
function t_producto_con_stock($stock = 100, $precio = 8000, $pdo = null) {
  $pdo = $pdo ?: t_pdo(T_DB);
  $codigo = 'TST' . strtoupper(substr(md5(uniqid('', true)), 0, 8));
  $pdo->prepare('INSERT INTO productos (codigo, nombre, unidad, grupo, stock_minimo, precio, costo) VALUES (?,?,?,?,?,?,?)')
      ->execute([$codigo, 'Producto de prueba ' . $codigo, 'Und', 'General', 0, $precio, 2000]);
  $pdo->prepare("INSERT INTO movimientos (codigo_producto, tipo, cantidad, notas, usuario_id) VALUES (?, 'INGRESO', ?, 'Stock inicial de prueba', 1)")
      ->execute([$codigo, $stock]);
  return ['codigo' => $codigo, 'precio' => $precio, 'stockInicial' => round((float)$stock, 2)];
}

/** Estado de un ítem de pedido (pagado / no pagado) en la BD de pruebas. */
function t_items($pedidoId, $pdo = null) {
  $pdo = $pdo ?: t_pdo(T_DB);
  $st = $pdo->prepare('SELECT id, codigo_producto, cantidad, precio_unitario, subtotal, pagado
                       FROM detalle_pedido WHERE id_pedido=? ORDER BY id');
  $st->execute([$pedidoId]);
  return $st->fetchAll(PDO::FETCH_ASSOC);
}
