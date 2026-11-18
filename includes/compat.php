<?php
declare(strict_types=1);
// PHP 7.4 compatibility (MAMP's Apache runs mod_php 7.4). PHP 8 provides these natively.
if (!function_exists('str_contains')) {
    function str_contains(string $haystack, string $needle): bool { return $needle === '' || strpos($haystack, $needle) !== false; }
}
if (!function_exists('str_starts_with')) {
    function str_starts_with(string $haystack, string $needle): bool { return strncmp($haystack, $needle, strlen($needle)) === 0; }
}
if (!function_exists('str_ends_with')) {
    function str_ends_with(string $haystack, string $needle): bool { return $needle === '' || substr($haystack, -strlen($needle)) === $needle; }
}
