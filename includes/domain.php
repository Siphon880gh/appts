<?php
declare(strict_types=1);
require_once __DIR__ . '/sanitize.php';
require_once __DIR__ . '/storage.php';

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
/** Document format version. 2 = select fields may allow free text; disruption type renamed (t11u). */
const DOC_VERSION = 3;
const HOME_HEALTH_TYPE_IDS = ['hh_auth', 'hh_visit', 'hh_event'];
const DATE_PATTERN = '/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/D';

function seed_types(): array {
    $types = json_decode((string) file_get_contents(__DIR__ . '/seed-types.json'), true, 64, JSON_THROW_ON_ERROR);
    foreach ($types as $i => &$type) {
        $type += ['builtin' => true, 'archived' => false, 'sortOrder' => $i, 'retiredFields' => []];
        foreach ($type['fields'] as &$field) {
            $field += ['options' => [], 'required' => false, 'target' => ''];
            if ($field['kind'] === 'select') $field += ['allowCustom' => false];
        }
        unset($field);
    }
    return $types;
}

function seed_doc_labels(): array {
    $out = [];
    foreach (DOC_LABEL_SEEDS as $id => $label) $out[] = ['id' => $id, 'label' => $label, 'builtin' => true];
    return $out;
}

function new_doc(): array {
    return ['version' => DOC_VERSION, 'revision' => 0, 'updatedAt' => gmdate('c'), 'conditions' => [], 'types' => seed_types(), 'entries' => [], 'tags' => [], 'docLabels' => seed_doc_labels(), 'filters' => [], 'highlights' => []];
}

/** Fill in collections added after a document was first written. */
function normalize_doc(array $doc): array {
    $doc += ['conditions' => [], 'types' => [], 'entries' => [], 'tags' => [], 'docLabels' => seed_doc_labels(), 'filters' => [], 'highlights' => []];
    return migrate_doc($doc);
}

function doc_needs_migration(array $doc): bool { return (int) ($doc['version'] ?? 1) < DOC_VERSION; }

/**
 * Upgrade an older account document. Idempotent, and it only touches type definitions (plus `version`):
 *  - v2: the built-in "Care disruptions" type becomes "Other care disruptions", but only while its
 *    name/singular still equal the old defaults (a user's own rename is kept); built-in select fields
 *    that the seed marks allowCustom (the Status fields) get allowCustom=true unless already set.
 *  - v3: the home health built-ins (authorizations, visits, events) are appended when missing.
 *  Each step runs only for documents older than that step, so a later user rename is never undone.
 * Conditions, entries, tags, labels, and attachments are never read or changed.
 */
function migrate_doc(array $doc): array {
    if (!doc_needs_migration($doc)) return $doc;
    $from = (int) ($doc['version'] ?? 1);
    $seed = [];
    foreach (seed_types() as $t) $seed[$t['id']] = $t;
    if (!is_array($doc['types'] ?? null)) $doc['types'] = [];
    if ($from < 2) {
        foreach ($doc['types'] as &$type) {
            if (!is_array($type) || empty($type['builtin']) || !isset($seed[$type['id'] ?? ''])) continue;
            if ($type['id'] === 'disruption') {
                if (($type['name'] ?? '') === 'Care disruptions') $type['name'] = 'Other care disruptions';
                if (($type['singular'] ?? '') === 'Care disruption') $type['singular'] = 'Other care disruption';
            }
            $seedFields = [];
            foreach ($seed[$type['id']]['fields'] as $f) $seedFields[$f['id']] = $f;
            foreach ($type['fields'] ?? [] as $i => $f) {
                if (is_array($f) && ($f['kind'] ?? '') === 'select' && !array_key_exists('allowCustom', $f) && !empty($seedFields[$f['id'] ?? '']['allowCustom'])) {
                    $type['fields'][$i]['allowCustom'] = true;
                }
            }
        }
        unset($type);
    }
    if ($from < 3) {
        // v3: add the home health built-ins. Only types whose id is missing are appended, after the
        // account's own ordering; an existing type with the same id is left exactly as it is.
        $have = [];
        $maxOrder = -1;
        foreach ($doc['types'] as $type) {
            if (!is_array($type)) continue;
            $have[$type['id'] ?? ''] = true;
            $maxOrder = max($maxOrder, (int) ($type['sortOrder'] ?? 0));
        }
        foreach (HOME_HEALTH_TYPE_IDS as $id) {
            if (isset($have[$id]) || !isset($seed[$id])) continue;
            $type = $seed[$id];
            $type['sortOrder'] = ++$maxOrder;
            $doc['types'][] = $type;
        }
    }
    $doc['version'] = DOC_VERSION;
    return $doc;
}

/**
 * Persist the migration for a stored account document (under the account lock; write_doc backs up
 * the current file first). Returns the up-to-date document, or null when the account has none yet.
 */
function migrate_stored_doc(string $account): ?array {
    $doc = read_doc($account);
    if ($doc === null || !doc_needs_migration($doc)) return $doc;
    return with_lock($account, function () use ($account) {
        $doc = read_doc($account);
        if ($doc === null || !doc_needs_migration($doc)) return $doc;
        $doc = migrate_doc($doc);
        write_doc($account, $doc);
        return $doc;
    });
}

/** Throws; never returns. */
function fail(string $message): void { throw new InvalidArgumentException($message); }

function str_field(array $v, string $key, int $max, bool $required = false, string $label = ''): string {
    $s = $v[$key] ?? '';
    if (!is_string($s)) fail(($label ?: $key) . ' must be text.');
    $s = trim($s);
    if ($required && $s === '') fail(($label ?: $key) . ' is required.');
    if (mb_strlen($s) > $max) fail(($label ?: $key) . " must be at most $max characters.");
    return $s;
}

function valid_id($id): string {
    if (!is_string($id) || !preg_match(ID_PATTERN, $id)) fail('Invalid id.');
    return $id;
}

function valid_color($c): string {
    return is_string($c) && preg_match('/^#[0-9a-fA-F]{6}$/D', $c) ? strtolower($c) : '#5c6674';
}

function valid_date_or_empty($d, string $label): string {
    if ($d === null || $d === '') return '';
    if (!is_string($d) || !preg_match(DATE_PATTERN, $d) || !checkdate((int) substr($d, 5, 2), (int) substr($d, 8, 2), (int) substr($d, 0, 4))) fail("$label must be a valid date.");
    return $d;
}

function clean_notes($notes): array {
    if (!is_array($notes)) return ['html' => '', 'text' => '', 'imageIds' => []];
    $html = sanitize_html(is_string($notes['html'] ?? null) ? $notes['html'] : '');
    if (strlen($html) > 200000) fail('Notes are too long.');
    $text = trim(html_entity_decode(strip_tags(str_replace(['<br>', '</p>', '</div>', '</li>'], "\n", $html)), ENT_QUOTES | ENT_HTML5));
    return ['html' => $html, 'text' => mb_substr($text, 0, 20000), 'imageIds' => image_ids_in($html)];
}

/** Documents attached to an entry or condition: {id, name, mime, kind, bytes, label, addedAt}. */
function clean_attachments($list, array $doc): array {
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

function clean_field($f): array {
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
    if ($kind === 'select') $field['allowCustom'] = !empty($f['allowCustom']);
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
        // Optional longer description (t30u): shown on hover wherever the short name is listed,
        // and at the top of the edit form. Older records simply have none.
        'description' => trim((string) preg_replace('/[\x00-\x1F\x7F]+/', ' ', str_field($v, 'description', 1000))),
        'status' => $status,
        'diagnosedOn' => valid_date_or_empty($v['diagnosedOn'] ?? '', 'Diagnosed date'),
        'color' => valid_color($v['color'] ?? ''),
        'summary' => str_field($v, 'summary', 400),
        'notes' => clean_notes($v['notes'] ?? null),
        // Memo (t61u): plain-text notes to self (documents to add, to-dos). A client that does not
        // send it keeps the stored memo.
        'memo' => array_key_exists('memo', $v) ? plain_field($v, 'memo', 20000, false, 'Memo') : (string) ($old['memo'] ?? ''),
        'attachments' => clean_attachments($v['attachments'] ?? [], $doc),
        'sortOrder' => is_int($v['sortOrder'] ?? null) ? $v['sortOrder'] : (int) ($old['sortOrder'] ?? 0),
        'createdAt' => $old['createdAt'] ?? gmdate('c'),
        'updatedAt' => gmdate('c'),
    ];
}

/** Plain text, control characters (except newlines) removed; for highlight text that is shown escaped. */
function plain_field(array $v, string $key, int $max, bool $required = false, string $label = ''): string {
    $s = str_field($v, $key, $max, $required, $label);
    return trim((string) preg_replace('/[\x00-\x09\x0B-\x1F\x7F]+/', ' ', str_replace("\r\n", "\n", $s)));
}

/** Clinical Significance highlights (one record per highlight, per condition). Written by an AI from
 *  the condition's reports (tools/intake.php "highlights") or by hand in the app. All text is plain
 *  and always shown escaped. sourceEntryId / sourceFileId point at the record and document the
 *  highlight is drawn from; ones that no longer exist are kept harmlessly and shown as missing. */
const HIGHLIGHT_CERTAINTY = ['documented', 'uncertain', 'reported'];
const HIGHLIGHT_ORIGINS = ['ai', 'manual'];
function clean_highlight(array $v, ?array $old, array $doc): array {
    $conditionId = valid_id($v['conditionId'] ?? null);
    if (find_index($doc['conditions'], $conditionId) === null) fail('Choose an existing condition for this highlight.');
    $entryId = $v['sourceEntryId'] ?? '';
    if ($entryId !== '' && (!is_string($entryId) || !preg_match(ID_PATTERN, $entryId))) fail('Invalid source entry.');
    $fileId = $v['sourceFileId'] ?? '';
    if ($fileId !== '' && (!is_string($fileId) || !preg_match(FILE_ID_PATTERN, $fileId))) fail('Invalid source document.');
    return [
        'id' => valid_id($v['id'] ?? null),
        'conditionId' => $conditionId,
        'title' => plain_field($v, 'title', 160, true, 'Highlight title'),
        'summary' => plain_field($v, 'summary', 600, true, 'Highlight summary'),
        'detail' => plain_field($v, 'detail', 8000),
        'quote' => plain_field($v, 'quote', 3000),
        'date' => valid_date_or_empty($v['date'] ?? '', 'Highlight date'),
        'sourceEntryId' => (string) $entryId,
        'sourceFileId' => (string) $fileId,
        'certainty' => in_array($v['certainty'] ?? '', HIGHLIGHT_CERTAINTY, true) ? $v['certainty'] : 'documented',
        'caveat' => plain_field($v, 'caveat', 2000),
        'origin' => in_array($v['origin'] ?? '', HIGHLIGHT_ORIGINS, true) ? $v['origin'] : 'manual',
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

/** Saved filters. "disruptions" is the built-in one: the entries added to or removed from its rule.
 *  "view-…" records are Saved views (named Timeline filter sets; t27u): a name plus the type ids,
 *  tag ids, Disruptions toggle, condition, and range to restore. Ids that no longer exist are kept
 *  harmlessly; the Timeline ignores them. */
const FILTER_IDS = ['disruptions'];
const VIEW_ID_PATTERN = '/^view-[A-Za-z0-9_-]{1,59}$/D';
const VIEW_RANGES = ['all', 'upcoming', 'past'];
function is_view_id(string $id): bool { return (bool) preg_match(VIEW_ID_PATTERN, $id); }
function clean_filter(array $v): array {
    $id = valid_id($v['id'] ?? null);
    $ids = function ($list, int $max = 5000): array {
        $out = [];
        foreach (is_array($list) ? $list : [] as $x) if (is_string($x) && preg_match(ID_PATTERN, $x)) $out[$x] = true;
        if (count($out) > $max) fail('Too many entries in one filter.');
        return array_keys($out);
    };
    if (is_view_id($id)) {
        $range = in_array($v['range'] ?? 'all', VIEW_RANGES, true) ? $v['range'] ?? 'all' : 'all';
        $cond = $v['conditionId'] ?? '';
        if (!is_string($cond) || ($cond !== '' && !preg_match(ID_PATTERN, $cond))) $cond = '';
        return ['id' => $id, 'kind' => 'view', 'name' => str_field($v, 'name', 60, true, 'View name'),
            'typeIds' => $ids($v['typeIds'] ?? [], 100), 'tagIds' => $ids($v['tagIds'] ?? [], 100),
            'disruptions' => !empty($v['disruptions']), 'conditionId' => $cond, 'range' => $range,
            'sortOrder' => is_int($v['sortOrder'] ?? null) ? $v['sortOrder'] : 0, 'updatedAt' => gmdate('c')];
    }
    if (!in_array($id, FILTER_IDS, true)) fail('Unknown filter.');
    $include = $ids($v['include'] ?? []);
    $exclude = array_values(array_diff($ids($v['exclude'] ?? []), $include));
    return ['id' => $id, 'include' => $include, 'exclude' => $exclude, 'updatedAt' => gmdate('c')];
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
        switch ($kind) {
            case 'checkbox': $values[$key] = (bool) $value; break;
            case 'number':
                if (!is_numeric($value)) fail("$label must be a number.");
                $values[$key] = $value + 0; break;
            case 'date': $values[$key] = valid_date_or_empty($value, $label); break;
            case 'link': $values[$key] = valid_id($value); break;
            case 'longtext':
                if (!is_string($value) || mb_strlen($value) > 20000) fail("$label is too long.");
                $values[$key] = $value; break;
            default:
                if (!is_string($value) || mb_strlen($value) > 500) fail("$label must be text under 500 characters.");
                $values[$key] = trim($value);
        }
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
        // Key highlight: one plain-text line that stands out in every list (hover/focus the ★ icon).
        // An edit that does not send it keeps the old one, so older clients never erase it.
        'highlight' => array_key_exists('highlight', $v) ? plain_field($v, 'highlight', 2000, false, 'Key highlight') : (string) ($old['highlight'] ?? ''),
        'attachments' => clean_attachments($v['attachments'] ?? [], $doc),
        'createdAt' => $old['createdAt'] ?? gmdate('c'),
        'updatedAt' => gmdate('c'),
    ];
}

/** Apply a batch of operations. Order matters: tags and types before the entries that use them. */
function apply_ops(array $doc, $ops): array {
    if (!is_array($ops) || !$ops || count($ops) > 200) fail('Send between 1 and 200 changes.');
    $doc = normalize_doc($doc);
    $collections = ['condition' => 'conditions', 'type' => 'types', 'entry' => 'entries', 'tag' => 'tags', 'docLabel' => 'docLabels', 'filter' => 'filters', 'highlight' => 'highlights'];
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
            switch ($kind) {
                case 'condition': $clean = clean_condition($value, $old, $doc); break;
                case 'docLabel': $clean = clean_doc_label($value, $old); break;
                case 'type': $clean = clean_type($value, $old); break;
                case 'tag': $clean = clean_tag($value); break;
                case 'filter': $clean = clean_filter($value); break;
                case 'highlight': $clean = clean_highlight($value, $old, $doc); break;
                default: $clean = clean_entry($value, $old, $doc);
            }
            if ($index === null) $doc[$col][] = $clean; else $doc[$col][$index] = $clean;
        } elseif (($op['op'] ?? '') === 'delete') {
            $id = valid_id($op['id'] ?? null);
            $index = find_index($doc[$col], $id);
            if ($index === null) fail('That record no longer exists.');
            if ($kind === 'type') fail('Entry types cannot be deleted. Archive the type instead; its entries stay.');
            if ($kind === 'docLabel') fail('Document labels stay so older uploads keep their label. Rename it instead.');
            if ($kind === 'filter' && !is_view_id($id)) fail('The built-in Disruptions filter cannot be deleted.');
            if ($kind === 'condition') {
                foreach ($doc['entries'] as $e) if ($e['conditionId'] === $id) fail('Move or delete this condition’s entries first, or archive the condition.');
                // Its Clinical Significance highlights go with it.
                $doc['highlights'] = array_values(array_filter($doc['highlights'], function ($h) use ($id) { return ($h['conditionId'] ?? '') !== $id; }));
            }
            if ($kind === 'tag') {
                foreach ($doc['entries'] as &$e) $e['tagIds'] = array_values(array_filter($e['tagIds'] ?? [], fn($t) => $t !== $id));
                unset($e);
                foreach ($doc['filters'] as &$f) if (isset($f['tagIds'])) $f['tagIds'] = array_values(array_filter($f['tagIds'], fn($t) => $t !== $id));
                unset($f);
            }
            array_splice($doc[$col], $index, 1);
        } else fail('Unknown change.');
    }
    $doc['revision'] = (int) ($doc['revision'] ?? 0) + 1;
    $doc['updatedAt'] = gmdate('c');
    return $doc;
}
