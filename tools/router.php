<?php
// Router for `php -S` (tools/serve.sh, tests): refuses dotfiles such as .env, .example.env,
// .htaccess, and .git/ (Apache blocks them through .htaccess); everything else is served as usual.
$path = (string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if (preg_match('#(^|/)\.[^/]#', rawurldecode($path))) { http_response_code(403); header('Content-Type: text/plain'); echo "Forbidden\n"; return true; }
return false;
