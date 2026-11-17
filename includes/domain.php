<?php
declare(strict_types=1);
require_once __DIR__ . '/sanitize.php';

/*
 * The per-account document:
 *   { version, revision, updatedAt, conditions[], types[], entries[], tags[] }
 * Entry types are data, not code: the seven built-ins are only seeds copied into each
 * account. Changing a type never deletes entry values: fields that disappear from a type
 * are moved to its retiredFields list, and values stay in every entry.
 */
const FIELD_KINDS = ['text', 'longtext', 'date', 'number', 'select', 'checkbox', 'link'];
const CONDITION_STATUSES = ['active', 'resolved', 'archived'];
const ID_PATTERN = '/^[A-Za-z0-9_-]{1,64}$/D';
const IMAGE_TYPES_BY_EXT = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/gif' => 'gif', 'image/webp' => 'webp'];
const DOC_LABEL_SEEDS = ['lab' => 'Lab', 'consultation' => 'Consultation Note', 'pcp' => 'PCP Note', 'progress' => 'Progress Note', 'imaging' => 'Imaging', 'discharge' => 'Discharge Summary', 'insurance' => 'Insurance Letter', 'other' => 'Other'];
const DATE_PATTERN = '/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/D';

function seed_types(): array {
    $types = json_decode((string) file_get_contents(__DIR__ . '/seed-types.json'), true, 64, JSON_THROW_ON_ERROR);
    foreach ($types as $i => &$type) {
        $type += ['builtin' => true, 'archived' => false, 'sortOrder' => $i, 'retiredFields' => []];
        foreach ($type['fields'] as &$field) $field += ['options' => [], 'required' => false, 'target' => ''];
    }
    return $types;
}

function seed_doc_labels(): array {
    $out = [];
    foreach (DOC_LABEL_SEEDS as $id => $label) $out[] = ['id' => $id, 'label' => $label, 'builtin' => true];
    return $out;
}

function new_doc(): array {
    return ['version' => 1, 'revision' => 0, 'updatedAt' => gmdate('c'), 'conditions' => [], 'types' => seed_types(), 'entries' => [], 'tags' => [], 'docLabels' => seed_doc_labels()];
}

/** Fill in collections added after a document was first written. */
function normalize_doc(array $doc): array {
    $doc += ['conditions' => [], 'types' => [], 'entries' => [], 'tags' => [], 'docLabels' => seed_doc_labels()];
    return $doc;
}

function fail(string $message): never { throw new InvalidArgumentException($message); }

function str_field(array $v, string $key, int $max, bool $required = false, string $label = ''): string {
    $s = $v[$key] ?? '';
    if (!is_string($s)) fail(($label ?: $key) . ' must be text.');
    $s = trim($s);
    if ($required && $s === '') fail(($label ?: $key) . ' is required.');
    if (mb_strlen($s) > $max) fail(($label ?: $key) . " must be at most $max characters.");
    return $s;
}

function valid_id(mixed $id): string {
    if (!is_string($id) || !preg_match(ID_PATTERN, $id)) fail('Invalid id.');
    return $id;
}

function valid_color(mixed $c): string {
    return is_string($c) && preg_match('/^#[0-9a-fA-F]{6}$/D', $c) ? strtolower($c) : '#5c6674';
}

function valid_date_or_empty(mixed $d, string $label): string {
    if ($d === null || $d === '') return '';
    if (!is_string($d) || !preg_match(DATE_PATTERN, $d) || !checkdate((int) substr($d, 5, 2), (int) substr($d, 8, 2), (int) substr($d, 0, 4))) fail("$label must be a valid date.");
    return $d;
}

function clean_notes(mixed $notes): array {
    if (!is_array($notes)) return ['html' => '', 'text' => '', 'imageIds' => []];
    $html = sanitize_html(is_string($notes['html'] ?? null) ? $notes['html'] : '');
    if (strlen($html) > 200000) fail('Notes are too long.');
    $text = trim(html_entity_decode(strip_tags(str_replace(['<br>', '</p>', '</div>', '</li>'], "\n", $html)), ENT_QUOTES | ENT_HTML5));
    return ['html' => $html, 'text' => mb_substr($text, 0, 20000), 'imageIds' => image_ids_in($html)];
}

/** Documents attached to an entry or condition: {id, name, mime, kind, bytes, label, addedAt}. */
function clean_attachments(mixed $list, array $doc): array {
    $labels = array_column($doc['docLabels'] ?? [], 'id');
    $out = [];
    $seen = [];
    foreach (is_array($list) ? $list : [] as $a) {
        if (is_string($a)) $a = ['id' => $a];
        if (!is_array($a) || !is_string($a['id'] ?? null) || !preg_match(FILE_ID_PATTERN, $a['id']) || isset($seen[$a['id']])) continue;
        $seen[$a['id']] = true;
        $ext = substr($a['id'], strrpos($a['id'], '.') + 1);
        $name = is_string($a['name'] ?? null) && trim($a['name']) !== '' ? mb_substr(trim($a['name']), 0, 200) : ($ext === 'pdf' ? 'Document.pdf' : 'Image.' . $ext);
        $label = is_string($a['label'] ?? null) && in_array($a['label'], $labels, true) ? $a['label'] : 'other';
        $added = is_string($a['addedAt'] ?? null) && preg_match('/^\d{4}-\d{2}-\d{2}/', $a['addedAt']) ? substr($a['addedAt'], 0, 25) : gmdate('c');
        $out[] = ['id' => $a['id'], 'name' => $name, 'mime' => $ext === 'pdf' ? 'application/pdf' : (array_search($ext, IMAGE_TYPES_BY_EXT, true) ?: 'image/' . $ext), 'kind' => $ext === 'pdf' ? 'pdf' : 'image', 'bytes' => is_int($a['bytes'] ?? null) ? $a['bytes'] : 0, 'label' => $label, 'addedAt' => $added];
    }
    if (count($out) > 100) fail('Attach at most 100 documents to one record.');
    return $out;
}

function clean_field(mixed $f): array {
    if (!is_array($f)) fail('Invalid field.');
    $kind = $f['kind'] ?? '';
    if (!in_array($kind, FIELD_KINDS, true)) fail('Unknown field kind.');
    $field = ['id' => valid_id($f['id'] ?? null), 'label' => str_field($f, 'label', 60, true, 'Field label'), 'kind' => $kind, 'options' => [], 'required' => !empty($f['required']), 'target' => ''];
    if ($kind === 'select') {
        foreach (is_array($f['options'] ?? null) ? $f['options'] : [] as $o) {
            if (is_string($o) && trim($o) !== '' && !in_array(trim($o), $field['options'], true)) $field['options'][] = mb_substr(trim($o), 0, 60);
        }
        if (count($field['options']) > 40) fail('A select field can have at most 40 options.');
    }
    if ($kind === 'link') $field['target'] = ($f['target'] ?? '') === 'any' ? 'any' : valid_id($f['target'] ?? 'doctor');
    return $field;
}

function clean_type(array $v, ?array $old): array {
    $fields = [];
    $seen = [];
    foreach (is_array($v['fields'] ?? null) ? $v['fields'] : [] as $f) {
        $field = clean_field($f);
        if (isset($seen[$field['id']])) fail('Field ids must be unique.');
        $seen[$field['id']] = true;
        $fields[] = $field;
    }
    if (count($fields) > 40) fail('A type can have at most 40 fields.');
    $retired = [];
    foreach (is_array($v['retiredFields'] ?? null) ? $v['retiredFields'] : [] as $f) {
        $field = clean_field($f);
        if (!isset($seen[$field['id']])) { $retired[$field['id']] = $field; }
    }
    // Never lose a field definition: anything dropped from the old type becomes retired.
    foreach (array_merge($old['fields'] ?? [], $old['retiredFields'] ?? []) as $f) {
        if (!isset($seen[$f['id']]) && !isset($retired[$f['id']])) $retired[$f['id']] = $f;
    }
    $primary = is_string($v['primaryDateField'] ?? null) ? $v['primaryDateField'] : '';
    $dateIds = array_column(array_filter($fields, fn($f) => $f['kind'] === 'date'), 'id');
    if ($primary !== '' && !in_array($primary, $dateIds, true)) $primary = $dateIds[0] ?? '';
    return [
        'id' => valid_id($v['id'] ?? null),
        'name' => str_field($v, 'name', 60, true, 'Type name'),
        'singular' => str_field($v, 'singular', 40) ?: str_field($v, 'name', 60),
        'icon' => is_string($v['icon'] ?? null) && preg_match('/^[a-z0-9-]{0,32}$/D', $v['icon']) ? $v['icon'] : '',
        'color' => valid_color($v['color'] ?? ''),
        'titleLabel' => str_field($v, 'titleLabel', 40) ?: 'Title',
        'primaryDateField' => $primary,
        'fields' => $fields,
        'retiredFields' => array_values($retired),
        'builtin' => (bool) ($old['builtin'] ?? false),
        'archived' => !empty($v['archived']),
        'sortOrder' => is_int($v['sortOrder'] ?? null) ? $v['sortOrder'] : (int) ($old['sortOrder'] ?? 999),
    ];
}

function clean_condition(array $v, ?array $old, array $doc): array {
    $status = in_array($v['status'] ?? 'active', CONDITION_STATUSES, true) ? $v['status'] ?? 'active' : 'active';
    return [
        'id' => valid_id($v['id'] ?? null),
        'name' => str_field($v, 'name', 120, true, 'Condition name'),
        'status' => $status,
        'diagnosedOn' => valid_date_or_empty($v['diagnosedOn'] ?? '', 'Diagnosed date'),
        'color' => valid_color($v['color'] ?? ''),
        'summary' => str_field($v, 'summary', 400),
        'notes' => clean_notes($v['notes'] ?? null),
        'attachments' => clean_attachments($v['attachments'] ?? [], $doc),
        'sortOrder' => is_int($v['sortOrder'] ?? null) ? $v['sortOrder'] : (int) ($old['sortOrder'] ?? 0),
        'createdAt' => $old['createdAt'] ?? gmdate('c'),
        'updatedAt' => gmdate('c'),
    ];
}

function clean_doc_label(array $v, ?array $old): array {
    return ['id' => valid_id($v['id'] ?? null), 'label' => str_field($v, 'label', 40, true, 'Document label'), 'builtin' => (bool) ($old['builtin'] ?? false)];
}

function clean_tag(array $v): array {
    return ['id' => valid_id($v['id'] ?? null), 'label' => str_field($v, 'label', 40, true, 'Tag'), 'color' => valid_color($v['color'] ?? '')];
}

function find_index(array $list, string $id): ?int {
    foreach ($list as $i => $item) if (($item['id'] ?? null) === $id) return $i;
    return null;
}

function clean_entry(array $v, ?array $old, array $doc): array {
    $conditionId = valid_id($v['conditionId'] ?? null);
    $typeId = valid_id($v['typeId'] ?? null);
    if (find_index($doc['conditions'], $conditionId) === null) fail('Choose an existing condition.');
    $typeIndex = find_index($doc['types'], $typeId);
    if ($typeIndex === null) fail('Choose an existing entry type.');
    $type = $doc['types'][$typeIndex];
    $kinds = [];
    foreach (array_merge($type['fields'], $type['retiredFields']) as $f) $kinds[$f['id']] = $f;
    // Start from the old values so values of retired or unknown fields are never dropped.
    $values = is_array($old['values'] ?? null) ? $old['values'] : [];
    foreach (is_array($v['values'] ?? null) ? $v['values'] : [] as $key => $value) {
        if (!is_string($key) || !preg_match(ID_PATTERN, $key)) continue;
        $kind = $kinds[$key]['kind'] ?? 'text';
        $label = $kinds[$key]['label'] ?? $key;
        if ($value === null || $value === '') { $values[$key] = ''; continue; }
        $values[$key] = match ($kind) {
            'checkbox' => (bool) $value,
            'number' => is_numeric($value) ? $value + 0 : fail("$label must be a number."),
            'date' => valid_date_or_empty($value, $label),
            'link' => valid_id($value),
            'longtext' => is_string($value) && mb_strlen($value) <= 20000 ? $value : fail("$label is too long."),
            default => is_string($value) && mb_strlen($value) <= 500 ? trim($value) : fail("$label must be text under 500 characters."),
        };
    }
    foreach ($type['fields'] as $f) {
        if ($f['required'] && ($values[$f['id']] ?? '') === '') fail($f['label'] . ' is required.');
    }
    $tagIds = [];
    foreach (is_array($v['tagIds'] ?? null) ? $v['tagIds'] : [] as $id) {
        if (is_string($id) && find_index($doc['tags'], $id) !== null && !in_array($id, $tagIds, true)) $tagIds[] = $id;
    }
    return [
        'id' => valid_id($v['id'] ?? null),
        'conditionId' => $conditionId,
        'typeId' => $typeId,
        'title' => str_field($v, 'title', 200, true, $type['titleLabel'] ?? 'Title'),
        'values' => $values,
        'tagIds' => $tagIds,
        'notes' => clean_notes($v['notes'] ?? null),
        'attachments' => clean_attachments($v['attachments'] ?? [], $doc),
        'createdAt' => $old['createdAt'] ?? gmdate('c'),
        'updatedAt' => gmdate('c'),
    ];
}

/** Apply a batch of operations. Order matters: tags and types before the entries that use them. */
function apply_ops(array $doc, mixed $ops): array {
    if (!is_array($ops) || !$ops || count($ops) > 200) fail('Send between 1 and 200 changes.');
    $doc = normalize_doc($doc);
    $collections = ['condition' => 'conditions', 'type' => 'types', 'entry' => 'entries', 'tag' => 'tags', 'docLabel' => 'docLabels'];
    foreach ($ops as $op) {
        if (!is_array($op)) fail('Invalid change.');
        $kind = $op['kind'] ?? '';
        if (!isset($collections[$kind])) fail('Unknown record kind.');
        $col = $collections[$kind];
        if (($op['op'] ?? '') === 'put') {
            $value = $op['value'] ?? null;
            if (!is_array($value)) fail('Invalid record.');
            $index = find_index($doc[$col], valid_id($value['id'] ?? null));
            $old = $index === null ? null : $doc[$col][$index];
            $clean = match ($kind) {
                'condition' => clean_condition($value, $old, $doc),
                'docLabel' => clean_doc_label($value, $old),
                'type' => clean_type($value, $old),
                'tag' => clean_tag($value),
                'entry' => clean_entry($value, $old, $doc),
            };
            if ($index === null) $doc[$col][] = $clean; else $doc[$col][$index] = $clean;
        } elseif (($op['op'] ?? '') === 'delete') {
            $id = valid_id($op['id'] ?? null);
            $index = find_index($doc[$col], $id);
            if ($index === null) fail('That record no longer exists.');
            if ($kind === 'type') fail('Entry types cannot be deleted. Archive the type instead; its entries stay.');
            if ($kind === 'docLabel') fail('Document labels stay so older uploads keep their label. Rename it instead.');
            if ($kind === 'condition') {
                foreach ($doc['entries'] as $e) if ($e['conditionId'] === $id) fail('Move or delete this condition’s entries first, or archive the condition.');
            }
            if ($kind === 'tag') {
                foreach ($doc['entries'] as &$e) $e['tagIds'] = array_values(array_filter($e['tagIds'] ?? [], fn($t) => $t !== $id));
                unset($e);
            }
            array_splice($doc[$col], $index, 1);
        } else fail('Unknown change.');
    }
    $doc['revision'] = (int) ($doc['revision'] ?? 0) + 1;
    $doc['updatedAt'] = gmdate('c');
    return $doc;
}
