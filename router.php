<?php
// Router para php -S (testing local)
$uri = $_SERVER['REQUEST_URI'];
$uri = strtok($uri, '?');

// Redirigir /api/* a api.php
if (preg_match('#^/api/(.+)$#', $uri, $m)) {
  $_GET['route'] = $m[1];
  require __DIR__ . '/api.php';
  return true;
}

// Archivos estáticos
$file = __DIR__ . $uri;
if ($uri !== '/' && file_exists($file)) {
  return false; // servir archivo estático
}

// SPA fallback
if ($uri === '/' || !file_exists($file)) {
  require __DIR__ . '/index.html';
  return true;
}