<?php
/**
 * Plugin Name:       SanchiJawab Chat
 * Description:       Adds your SanchiJawab AI chat assistant to every page of your WordPress site. Paste your Bot ID once; no code editing needed.
 * Version:           1.0.0
 * Requires at least: 5.8
 * Requires PHP:      7.4
 * License:           GPL-2.0-or-later
 * Text Domain:       sanchijawab-chat
 */

if (!defined('ABSPATH')) {
    exit;
}

const SANCHIJAWAB_OPT = 'sanchijawab_chat_settings';

/** Settings with defaults; always returns every key. */
function sanchijawab_settings(): array {
    $saved = get_option(SANCHIJAWAB_OPT, []);
    return array_merge([
        'enabled'    => 1,
        'bot_id'     => '',
        'api_url'    => '',
        'widget_url' => '',
    ], is_array($saved) ? $saved : []);
}

/** A bot id is a UUID; anything else is rejected rather than echoed into a page. */
function sanchijawab_valid_bot_id(string $id): bool {
    return (bool) preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $id);
}

function sanchijawab_clean_url(string $url): string {
    $url = esc_url_raw(trim($url), ['http', 'https']);
    return $url ?: '';
}

/** Settings sanitiser: bad input is dropped, never stored. */
function sanchijawab_sanitize($input): array {
    $input = is_array($input) ? $input : [];
    $bot = trim((string) ($input['bot_id'] ?? ''));
    if ($bot !== '' && !sanchijawab_valid_bot_id($bot)) {
        add_settings_error(SANCHIJAWAB_OPT, 'bad_bot_id', 'That Bot ID doesn\'t look right. Copy it from the Install tab of your SanchiJawab dashboard.');
        $bot = '';
    }
    return [
        'enabled'    => empty($input['enabled']) ? 0 : 1,
        'bot_id'     => $bot,
        'api_url'    => sanchijawab_clean_url((string) ($input['api_url'] ?? '')),
        'widget_url' => sanchijawab_clean_url((string) ($input['widget_url'] ?? '')),
    ];
}

/** The loader that goes in the page footer. Returns '' when not configured. */
function sanchijawab_loader_html(): string {
    $s = sanchijawab_settings();
    if (!$s['enabled'] || !sanchijawab_valid_bot_id($s['bot_id']) || $s['api_url'] === '' || $s['widget_url'] === '') {
        return '';
    }
    // wp_json_encode escapes quotes and "</script>" so a setting can't break out of the tag.
    $bot = wp_json_encode($s['bot_id'], JSON_HEX_TAG | JSON_HEX_AMP);
    $api = wp_json_encode($s['api_url'], JSON_HEX_TAG | JSON_HEX_AMP);
    $src = wp_json_encode($s['widget_url'], JSON_HEX_TAG | JSON_HEX_AMP);
    return "<!-- SanchiJawab Chat -->\n<script>\n"
        . "window.__sj = window.__sj || {}; window.__sj.botId = $bot; window.__sj.api = $api;\n"
        . "(function (w, d) {\n"
        . "  var q = [];\n"
        . "  function stub(m) { return function () { q.push([m, [].slice.call(arguments)]); }; }\n"
        . "  w.SanchiJawab = w.SanchiJawab || { _q: q, open: stub('open'), close: stub('close'), identify: stub('identify') };\n"
        . "  var s = d.createElement('script'); s.async = true; s.src = $src;\n"
        . "  s.setAttribute('data-bot', w.__sj.botId); s.setAttribute('data-api', w.__sj.api); d.head.appendChild(s);\n"
        . "})(window, document);\n"
        . "</script>\n";
}

add_action('wp_footer', function () {
    if (is_admin() || is_feed() || (function_exists('wp_doing_ajax') && wp_doing_ajax())) {
        return;
    }
    echo sanchijawab_loader_html(); // phpcs:ignore WordPress.Security.EscapeOutput -- built from validated values, JSON-encoded above
}, 100);

add_action('admin_menu', function () {
    add_options_page('SanchiJawab Chat', 'SanchiJawab Chat', 'manage_options', 'sanchijawab-chat', 'sanchijawab_settings_page');
});

add_action('admin_init', function () {
    register_setting('sanchijawab_chat_group', SANCHIJAWAB_OPT, ['sanitize_callback' => 'sanchijawab_sanitize']);
});

add_filter('plugin_action_links_' . plugin_basename(__FILE__), function ($links) {
    array_unshift($links, '<a href="' . esc_url(admin_url('options-general.php?page=sanchijawab-chat')) . '">Settings</a>');
    return $links;
});

function sanchijawab_settings_page(): void {
    if (!current_user_can('manage_options')) {
        return;
    }
    $s = sanchijawab_settings();
    $live = sanchijawab_loader_html() !== '';
    ?>
    <div class="wrap">
        <h1>SanchiJawab Chat</h1>
        <?php settings_errors(SANCHIJAWAB_OPT); ?>
        <p>
            <?php if ($live) : ?>
                <strong style="color:#1a7f37;">The chat assistant is on for your visitors.</strong>
            <?php else : ?>
                <strong style="color:#b32d2e;">Not live yet.</strong> Fill in the three boxes below and tick "Show the chat".
            <?php endif; ?>
        </p>
        <p>In your SanchiJawab dashboard open <em>your assistant &rarr; Install</em>. You will find the Bot ID there, and your service addresses.</p>
        <form method="post" action="options.php">
            <?php settings_fields('sanchijawab_chat_group'); ?>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="sj_enabled">Show the chat</label></th>
                    <td><input type="checkbox" id="sj_enabled" name="<?php echo esc_attr(SANCHIJAWAB_OPT); ?>[enabled]" value="1" <?php checked(1, $s['enabled']); ?>></td>
                </tr>
                <tr>
                    <th scope="row"><label for="sj_bot">Bot ID</label></th>
                    <td><input type="text" id="sj_bot" class="regular-text code" name="<?php echo esc_attr(SANCHIJAWAB_OPT); ?>[bot_id]" value="<?php echo esc_attr($s['bot_id']); ?>" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"></td>
                </tr>
                <tr>
                    <th scope="row"><label for="sj_api">API address</label></th>
                    <td><input type="url" id="sj_api" class="regular-text code" name="<?php echo esc_attr(SANCHIJAWAB_OPT); ?>[api_url]" value="<?php echo esc_attr($s['api_url']); ?>" placeholder="https://api.example.com">
                        <p class="description">Where your SanchiJawab backend runs.</p></td>
                </tr>
                <tr>
                    <th scope="row"><label for="sj_widget">Widget address</label></th>
                    <td><input type="url" id="sj_widget" class="regular-text code" name="<?php echo esc_attr(SANCHIJAWAB_OPT); ?>[widget_url]" value="<?php echo esc_attr($s['widget_url']); ?>" placeholder="https://cdn.example.com/widget.js">
                        <p class="description">The full address of <code>widget.js</code>.</p></td>
                </tr>
            </table>
            <?php submit_button(); ?>
        </form>
    </div>
    <?php
}
