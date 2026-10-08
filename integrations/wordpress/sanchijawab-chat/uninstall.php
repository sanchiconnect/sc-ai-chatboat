<?php
// Runs when the plugin is deleted from the WordPress admin: remove its stored settings.
if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}
delete_option('sanchijawab_chat_settings');
