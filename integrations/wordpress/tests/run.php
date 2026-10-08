<?php
// Runs the plugin's real code against a minimal stand-in for the WordPress functions it uses.
//   php integrations/wordpress/tests/run.php
define('ABSPATH', __DIR__);
$GLOBALS['opts'] = [];
$GLOBALS['hooks'] = [];
$GLOBALS['errors'] = [];

function add_action($h, $cb, $p = 10) { $GLOBALS['hooks'][$h][] = $cb; }
function add_filter($h, $cb, $p = 10) { $GLOBALS['hooks'][$h][] = $cb; }
function get_option($k, $d = false) { return $GLOBALS['opts'][$k] ?? $d; }
function add_settings_error($setting, $code, $msg) { $GLOBALS['errors'][] = $code; }
function plugin_basename($f) { return basename(dirname($f)) . '/' . basename($f); }
function esc_url_raw($url, $protocols = null) {
    $p = parse_url($url);
    if (!$p || empty($p['scheme']) || empty($p['host']) || !in_array($p['scheme'], $protocols ?: ['http', 'https'], true)) return '';
    return $url;
}
function wp_json_encode($v, $flags = 0) { return json_encode($v, $flags); }
function is_admin() { return $GLOBALS['is_admin'] ?? false; }
function is_feed() { return false; }
function wp_doing_ajax() { return false; }

require __DIR__ . '/../sanchijawab-chat/sanchijawab-chat.php';

$fails = 0;
function check($name, $ok) { global $fails; echo ($ok ? "  ok    " : "  FAIL  ") . $name . "\n"; if (!$ok) $fails++; }

$BOT = '8b8d41a4-b2b6-4dc2-8fea-4b1ba33df735';
$good = ['enabled' => 1, 'bot_id' => $BOT, 'api_url' => 'https://api.example.com', 'widget_url' => 'https://cdn.example.com/widget.js'];

check('nothing is output until configured', sanchijawab_loader_html() === '');

$GLOBALS['opts'][SANCHIJAWAB_OPT] = $good;
$html = sanchijawab_loader_html();
check('configured: loader is output', str_contains($html, '<script>') && str_contains($html, "\"$BOT\""));
check('configured: points at the widget and API', str_contains($html, '"https:\/\/cdn.example.com\/widget.js"') && str_contains($html, '"https:\/\/api.example.com"'));
check('configured: queues SanchiJawab.open() before load', str_contains($html, "open: stub('open')"));

$GLOBALS['opts'][SANCHIJAWAB_OPT] = ['enabled' => 0] + $good;
check('"Show the chat" off: nothing is output', sanchijawab_loader_html() === '');

$GLOBALS['opts'][SANCHIJAWAB_OPT] = ['bot_id' => 'not-a-uuid'] + $good;
check('invalid bot id is never output', sanchijawab_loader_html() === '');

// Even if a hostile value reached the database, it cannot close the script tag.
$GLOBALS['opts'][SANCHIJAWAB_OPT] = ['widget_url' => 'https://x.example/a"</script><script>alert(1)</script>'] + $good;
$html = sanchijawab_loader_html();
check('hostile URL cannot break out of the <script> tag', substr_count($html, '</script>') === 1);

$clean = sanchijawab_sanitize(['enabled' => '1', 'bot_id' => " $BOT ", 'api_url' => 'javascript:alert(1)', 'widget_url' => 'https://cdn.example.com/widget.js']);
check('sanitize: trims the bot id, keeps good values', $clean['bot_id'] === $BOT && $clean['widget_url'] === 'https://cdn.example.com/widget.js');
check('sanitize: drops a javascript: URL', $clean['api_url'] === '');

$GLOBALS['errors'] = [];
$bad = sanchijawab_sanitize(['bot_id' => '<script>']);
check('sanitize: rejects a bad bot id and tells the admin', $bad['bot_id'] === '' && in_array('bad_bot_id', $GLOBALS['errors'], true));
check('sanitize: unchecked box means disabled', sanchijawab_sanitize([])['enabled'] === 0);

$GLOBALS['opts'][SANCHIJAWAB_OPT] = $good;
ob_start();
foreach ($GLOBALS['hooks']['wp_footer'] as $cb) $cb();
$footer = ob_get_clean();
check('footer hook prints the loader on a normal page', str_contains($footer, 'SanchiJawab Chat'));
$GLOBALS['is_admin'] = true;
ob_start();
foreach ($GLOBALS['hooks']['wp_footer'] as $cb) $cb();
check('footer hook prints nothing inside wp-admin', ob_get_clean() === '');

echo $fails ? "\n$fails check(s) FAILED\n" : "\nall checks passed\n";
exit($fails ? 1 : 0);
