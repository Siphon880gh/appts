<?php
declare(strict_types=1);
require_once __DIR__ . '/compat.php';

const IMAGE_ID_PATTERN = '/^[a-f0-9]{64}\.(png|jpg|gif|webp)$/D';
const FILE_ID_PATTERN = '/^[a-f0-9]{64}\.(png|jpg|gif|webp|pdf)$/D';

/** Allowlist sanitizer for rich notes; mirrors cleanHTML() in js/richText.js. */
function sanitize_html(string $html): string {
    if (trim($html) === '') return '';
    $allowed = ['p','br','div','strong','b','em','i','u','s','ul','ol','li','blockquote','h3','a','img'];
    $drop = ['script','style','iframe','object','svg','math','form','input','button','template','embed','link','meta'];
    $source = new DOMDocument();
    $previous = libxml_use_internal_errors(true);
    $source->loadHTML('<?xml encoding="utf-8"?><div id="appts-root">' . $html . '</div>', LIBXML_NONET | LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
    libxml_clear_errors();
    libxml_use_internal_errors($previous);
    $out = new DOMDocument();
    $wrapper = $out->createElement('div');
    $out->appendChild($wrapper);
    $copy = function (DOMNode $node, DOMNode $parent) use (&$copy, $out, $allowed, $drop): void {
        if ($node instanceof DOMText) { $parent->appendChild($out->createTextNode($node->textContent)); return; }
        if (!$node instanceof DOMElement) return;
        $tag = strtolower($node->tagName);
        if (in_array($tag, $drop, true)) return;
        if ($tag === 'img') {
            $id = $node->getAttribute('data-image-id');
            if (!preg_match(IMAGE_ID_PATTERN, $id)) return;
            $img = $out->createElement('img');
            $img->setAttribute('data-image-id', $id);
            $img->setAttribute('alt', mb_substr($node->getAttribute('alt') ?: 'Uploaded image', 0, 200));
            $parent->appendChild($img);
            return;
        }
        if (!in_array($tag, $allowed, true)) { foreach (iterator_to_array($node->childNodes) as $child) $copy($child, $parent); return; }
        $element = $out->createElement($tag);
        if ($tag === 'a') {
            $href = trim($node->getAttribute('href'));
            if (preg_match('#^(https?://|mailto:)#i', $href)) {
                $element->setAttribute('href', $href);
                $element->setAttribute('target', '_blank');
                $element->setAttribute('rel', 'noopener noreferrer');
            }
        }
        $parent->appendChild($element);
        foreach (iterator_to_array($node->childNodes) as $child) $copy($child, $element);
    };
    $root = $source->getElementById('appts-root') ?? $source->documentElement;
    if ($root) foreach (iterator_to_array($root->childNodes) as $child) $copy($child, $wrapper);
    $html = '';
    foreach ($wrapper->childNodes as $child) $html .= $out->saveHTML($child);
    return $html;
}

function image_ids_in(string $html): array {
    preg_match_all('/data-image-id="([a-f0-9]{64}\.(?:png|jpg|gif|webp))"/', $html, $m);
    return array_values(array_unique($m[1]));
}
