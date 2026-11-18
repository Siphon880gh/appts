<?php
declare(strict_types=1);
/*
 * Appts intake helper for AI coding agents (see .agents/skills/log-health-update/SKILL.md).
 * Reads an account's records and adds new ones from a JSON plan. Works directly on storage/ through
 * includes/storage.php: atomic writes, the account lock, and a backup before every write.
 * It never deletes anything and never overwrites a value that is already filled in.
 * PHP 7.4+ (MAMP) and 8.x. No password is needed or read; password hashes are never printed.
 *
 *   php tools/intake.php accounts
 *   php tools/intake.php conditions <account>
 *   php tools/intake.php types <account>
 *   php tools/intake.php entries <account> [--condition=<id>] [--type=<id>] [--query=<text>]
 *   php tools/intake.php apply <account> <plan.json|-> [--dry-run]
 */
require __DIR__ . '/../includes/demo-seed.php';
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

const INTAKE_COLORS = ['#2f5d8a', '#a4541c', '#5b4a99', '#8f2f45', '#3f6b3a', '#9a6a00', '#245e6b', '#b42318', '#7a2e8a', '#6b5b2a', '#172943', '#c2410c', '#0f766e', '#be185d', '#4d7c0f', '#64748b'];

function out_json($data): void { echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), "\n"; }
function die_with(string $msg): void { fwrite(STDERR, "Error: $msg\n"); exit(1); }
function new_id(string $prefix): string { return $prefix . '-' . bin2hex(random_bytes(8)); }
function lower(string $s): string { return mb_strtolower(trim($s)); }

/** Accounts from includes/accounts.php (names only, never hashes). */
function intake_accounts(): array {
    $out = [];
    foreach (require __DIR__ . '/../includes/accounts.php' as $username => $a) {
        $out[] = ['username' => $username, 'displayName' => $a['displayName'] ?? $username, 'demo' => !empty($a['demo']), 'hasRecords' => is_file(doc_path($username))];
    }
    return $out;
}

/** Usable when accounts.php lists it, or it already has a stored document (temporary test accounts). */
function intake_account(string $name): array {
    if (preg_match('/^[a-z0-9_-]{1,64}$/D', $name)) {
        foreach (intake_accounts() as $a) if ($a['username'] === $name) return $a;
        if (is_file(doc_path($name))) return ['username' => $name, 'displayName' => $name, 'demo' => false, 'hasRecords' => true];
    }
    die_with("Unknown account '$name'. Run: php tools/intake.php accounts");
    return [];
}

/** Same as api.php load_doc: migrate a stored document if needed, or create it on first use. */
function intake_load(array $account): array {
    $user = $account['username'];
    $doc = migrate_stored_doc($user);
    if ($doc !== null) return normalize_doc($doc);
    return with_lock($user, function () use ($account, $user) {
        $doc = read_doc($user);
        if ($doc === null) {
            if ($account['demo']) write_demo_files($user);
            $doc = $account['demo'] ? demo_doc() : new_doc();
            write_doc($user, $doc);
        }
        return normalize_doc($doc);
    });
}

function type_of(array $doc, string $id): ?array { foreach ($doc['types'] as $t) if ($t['id'] === $id) return $t; return null; }
function entry_of(array $doc, string $id): ?array { foreach ($doc['entries'] as $e) if ($e['id'] === $id) return $e; return null; }
function primary_date(array $type, array $entry): string { return ($type['primaryDateField'] ?? '') !== '' ? (string) ($entry['values'][$type['primaryDateField']] ?? '') : ''; }

function cmd_conditions(array $doc): array {
    $out = [];
    foreach ($doc['conditions'] as $c) {
        $n = 0;
        foreach ($doc['entries'] as $e) if ($e['conditionId'] === $c['id']) $n++;
        $out[] = ['id' => $c['id'], 'name' => $c['name'], 'status' => $c['status'], 'diagnosedOn' => $c['diagnosedOn'] ?? '', 'entries' => $n, 'documents' => count($c['attachments'] ?? [])];
    }
    return $out;
}

function cmd_types(array $doc): array {
    $types = $doc['types'];
    usort($types, function ($a, $b) { return ($a['sortOrder'] ?? 0) <=> ($b['sortOrder'] ?? 0); });
    $out = [];
    foreach ($types as $t) {
        $fields = [];
        foreach ($t['fields'] as $f) {
            $x = ['id' => $f['id'], 'label' => $f['label'], 'kind' => $f['kind']];
            if (!empty($f['required'])) $x['required'] = true;
            if ($f['kind'] === 'select') { $x['options'] = $f['options']; $x['allowCustom'] = !empty($f['allowCustom']); }
            if ($f['kind'] === 'link') $x['target'] = $f['target'];
            $fields[] = $x;
        }
        $out[] = ['id' => $t['id'], 'name' => $t['name'], 'singular' => $t['singular'], 'builtin' => !empty($t['builtin']), 'archived' => !empty($t['archived']), 'titleLabel' => $t['titleLabel'] ?? 'Title', 'primaryDateField' => $t['primaryDateField'] ?? '', 'fields' => $fields];
    }
    return ['types' => $out, 'tags' => array_column($doc['tags'], 'label'), 'documentLabels' => array_column($doc['docLabels'], 'label')];
}

function cmd_entries(array $doc, array $opts): array {
    $out = [];
    $q = lower((string) ($opts['query'] ?? ''));
    $tagLabels = array_column($doc['tags'], 'label', 'id');
    foreach ($doc['entries'] as $e) {
        if (!empty($opts['condition']) && $e['conditionId'] !== $opts['condition']) continue;
        if (!empty($opts['type']) && $e['typeId'] !== $opts['type']) continue;
        if ($q !== '' && strpos(lower($e['title'] . ' ' . json_encode($e['values'], JSON_UNESCAPED_UNICODE) . ' ' . ($e['notes']['text'] ?? '')), $q) === false) continue;
        $type = type_of($doc, $e['typeId']);
        $tags = [];
        foreach ($e['tagIds'] ?? [] as $id) if (isset($tagLabels[$id])) $tags[] = $tagLabels[$id];
        $out[] = ['id' => $e['id'], 'conditionId' => $e['conditionId'], 'typeId' => $e['typeId'], 'type' => $type['singular'] ?? $e['typeId'], 'title' => $e['title'], 'date' => $type ? primary_date($type, $e) : '', 'values' => $e['values'], 'tags' => $tags, 'documents' => count($e['attachments'] ?? [])];
    }
    return $out;
}

/** Plain text -> safe paragraphs (blank line = new paragraph, newline = <br>). */
function text_to_html(string $text): string {
    $html = '';
    foreach (preg_split('/\n\s*\n/', str_replace("\r", '', trim($text))) as $p) {
        if (trim($p) !== '') $html .= '<p>' . str_replace("\n", '<br>', htmlspecialchars(trim($p), ENT_QUOTES | ENT_HTML5)) . '</p>';
    }
    return $html;
}

/** Turns a plan into validated app ops plus a readable preview. Throws InvalidArgumentException. */
final class Planner {
    public $doc; public $ops = []; public $preview = []; public $warnings = []; public $files = []; public $conditionId = '';
    private $refs = []; private $newTags = []; private $newLabels = [];
    public function __construct(array $doc) { $this->doc = $doc; }

    private function fail(string $where, string $msg): void { throw new InvalidArgumentException("$where: $msg"); }

    private function resolveType(string $where, $want): array {
        if (!is_string($want) || trim($want) === '') $this->fail($where, 'give "type" (an entry type id or name; see: php tools/intake.php types <account>)');
        foreach ($this->doc['types'] as $t) {
            if ($t['id'] === $want || lower($t['name']) === lower($want) || lower($t['singular']) === lower($want)) {
                if (!empty($t['archived'])) $this->fail($where, "the type \"{$t['name']}\" is archived; restore it on the Entry types page first");
                return $t;
            }
        }
        $this->fail($where, "no entry type \"$want\" in this account");
        return [];
    }

    private function fieldFor(string $where, array $type, string $key): array {
        foreach ($type['fields'] as $f) if ($f['id'] === $key || lower($f['label']) === lower($key)) return $f;
        $this->fail($where, "\"{$type['singular']}\" has no field \"$key\" (fields: " . implode(', ', array_column($type['fields'], 'id')) . ')');
        return [];
    }

    /** Check one value against its field definition; returns the value to store. */
    private function value(string $where, array $f, $v, string $conditionId) {
        $label = $f['label'];
        if ($v === null || $v === '') return '';
        switch ($f['kind']) {
            case 'date':
                if (!is_string($v) || !preg_match(DATE_PATTERN, $v)) $this->fail($where, "$label must be a date as YYYY-MM-DD");
                return $v;
            case 'number':
                if (!is_numeric($v)) $this->fail($where, "$label must be a number");
                return $v + 0;
            case 'checkbox':
                return is_string($v) ? !in_array(lower($v), ['0', 'false', 'no', 'off'], true) : (bool) $v;
            case 'select':
                if (!is_string($v)) $this->fail($where, "$label must be text");
                foreach ($f['options'] as $o) if (lower($o) === lower($v)) return $o;
                if (empty($f['allowCustom'])) $this->fail($where, "$label must be one of: " . implode(' | ', $f['options']) . ' (this field does not allow free text)');
                if (mb_strlen(trim($v)) > 500) $this->fail($where, "$label must be under 500 characters");
                return trim($v);
            case 'link':
                if (!is_string($v)) $this->fail($where, "$label must be an entry id or @ref");
                if ($v[0] === '@') {
                    $ref = substr($v, 1);
                    if (!isset($this->refs[$ref])) $this->fail($where, "$label points at unknown ref \"$v\" (define it earlier in \"create\")");
                    list($id, $typeId) = $this->refs[$ref];
                } else {
                    $target = entry_of($this->doc, $v);
                    if (!$target) $this->fail($where, "$label points at entry \"$v\", which does not exist");
                    list($id, $typeId) = [$target['id'], $target['typeId']];
                    if ($target['conditionId'] !== $conditionId) $this->warnings[] = "$where: $label links to \"{$target['title']}\" in another condition";
                }
                if ($f['target'] !== 'any' && $typeId !== $f['target']) $this->fail($where, "$label must link to a {$f['target']} entry, not $typeId");
                return $id;
            case 'longtext':
                if (!is_string($v) || mb_strlen($v) > 20000) $this->fail($where, "$label must be text under 20,000 characters");
                return $v;
            default:
                if (!is_string($v) && !is_numeric($v)) $this->fail($where, "$label must be text");
                $v = trim((string) $v);
                if (mb_strlen($v) > 500) $this->fail($where, "$label must be under 500 characters");
                return $v;
        }
    }

    private function allTags(): array { return array_merge($this->doc['tags'], array_values($this->newTags)); }
    private function allLabels(): array { return array_merge($this->doc['docLabels'], array_values($this->newLabels)); }

    /** Existing tags are matched by label (any case); new labels become tags. */
    private function tagIds($labels): array {
        $ids = [];
        foreach (is_array($labels) ? $labels : [] as $label) {
            $clean = mb_substr((string) preg_replace('/\s+/', ' ', trim((string) $label)), 0, 40);
            if ($clean === '') continue;
            $found = null;
            foreach ($this->allTags() as $t) if (lower($t['label']) === lower($clean) || $t['id'] === $clean) { $found = $t; break; }
            if (!$found) {
                $found = ['id' => new_id('tag'), 'label' => $clean, 'color' => INTAKE_COLORS[count($this->allTags()) % count(INTAKE_COLORS)]];
                $this->newTags[$found['id']] = $found;
                $this->ops[] = ['op' => 'put', 'kind' => 'tag', 'value' => $found];
                $this->preview[] = "+ new tag \"$clean\"";
            }
            if (!in_array($found['id'], $ids, true)) $ids[] = $found['id'];
        }
        return $ids;
    }

    /** Existing document labels are matched by label (any case); a new label is saved for reuse. */
    private function labelId($label): string {
        $clean = mb_substr(trim((string) ($label ?? '')), 0, 40);
        if ($clean === '') return 'other';
        foreach ($this->allLabels() as $l) if (lower($l['label']) === lower($clean) || $l['id'] === $clean) return $l['id'];
        $l = ['id' => new_id('label'), 'label' => $clean];
        $this->newLabels[$l['id']] = $l;
        $this->ops[] = ['op' => 'put', 'kind' => 'docLabel', 'value' => $l];
        $this->preview[] = "+ new document label \"$clean\"";
        return $l['id'];
    }

    private function labelText(string $id): string {
        foreach ($this->allLabels() as $l) if ($l['id'] === $id) return $l['label'];
        return $id;
    }

    private function docList(array $list): string {
        return implode(', ', array_map(function ($a) { return $a['name'] . ' [' . $this->labelText($a['label']) . ']'; }, $list));
    }

    /** Files are checked with the app's upload rules (PDF up to 20 MB; PNG/JPEG/GIF/WebP up to 8 MB). */
    private function attachments(string $where, $list, array $existing): array {
        $out = [];
        $have = array_column($existing, 'id');
        foreach (is_array($list) ? $list : [] as $a) {
            if (is_string($a)) $a = ['path' => $a];
            $path = is_array($a) ? (string) ($a['path'] ?? '') : '';
            if ($path === '' || !is_file($path) || !is_readable($path)) $this->fail($where, "file not found: $path");
            $bytes = (string) file_get_contents($path);
            try { $info = inspect_file_bytes($bytes); }
            catch (InvalidArgumentException $e) { $this->fail($where . ' (' . basename($path) . ')', $e->getMessage()); return []; }
            if (in_array($info['id'], $have, true)) { $this->warnings[] = "$where: " . basename($path) . ' is already attached; skipped'; continue; }
            $have[] = $info['id'];
            $this->files[$info['id']] = $bytes;
            $name = trim((string) ($a['name'] ?? '')) !== '' ? (string) $a['name'] : basename($path);
            $out[] = ['id' => $info['id'], 'name' => mb_substr($name, 0, 200), 'mime' => $info['mime'], 'kind' => $info['kind'], 'bytes' => $info['bytes'], 'label' => $this->labelId($a['label'] ?? ''), 'addedAt' => gmdate('c')];
        }
        return $out;
    }

    public function build(array $plan): void {
        $c = $plan['condition'] ?? null;
        $isNew = is_array($c) && isset($c['new']);
        if ($isNew) {
            $n = is_array($c['new']) ? $c['new'] : ['name' => (string) $c['new']];
            $name = trim((string) ($n['name'] ?? ''));
            if ($name === '') $this->fail('condition.new', 'give a name');
            foreach ($this->doc['conditions'] as $old) if (lower($old['name']) === lower($name)) $this->fail('condition.new', "\"{$old['name']}\" already exists (id {$old['id']}); use \"condition\": \"{$old['id']}\" instead");
            $this->conditionId = new_id('cond');
            $cond = ['id' => $this->conditionId, 'name' => $name, 'status' => 'active', 'diagnosedOn' => (string) ($n['diagnosedOn'] ?? ''), 'color' => (string) ($n['color'] ?? INTAKE_COLORS[count($this->doc['conditions']) % count(INTAKE_COLORS)]), 'summary' => (string) ($n['summary'] ?? ''), 'notes' => ['html' => text_to_html((string) ($n['notes'] ?? ''))], 'attachments' => [], 'sortOrder' => count($this->doc['conditions'])];
            $cond['attachments'] = $this->attachments('condition.new', $n['attachments'] ?? [], []);
            $this->ops[] = ['op' => 'put', 'kind' => 'condition', 'value' => $cond];
            $this->preview[] = "+ new condition \"$name\"" . ($cond['attachments'] ? "\n      documents: " . $this->docList($cond['attachments']) : '');
        } else {
            $want = is_array($c) ? (string) ($c['id'] ?? '') : (string) $c;
            $cond = null;
            foreach ($this->doc['conditions'] as $old) if ($want !== '' && ($old['id'] === $want || lower($old['name']) === lower($want))) $cond = $old;
            if (!$cond) $this->fail('condition', $want === '' ? 'give "condition": an existing condition id, or {"new": {"name": ...}}' : "no condition \"$want\" (see: php tools/intake.php conditions <account>)");
            $this->conditionId = $cond['id'];
            $this->preview[] = "= condition \"{$cond['name']}\"";
        }
        $cid = $this->conditionId;

        // Create. A "ref" lets later entries in the same plan link to this one ("@ref").
        foreach (is_array($plan['create'] ?? null) ? $plan['create'] : [] as $i => $p) {
            $where = 'create[' . ($i + 1) . ']';
            if (!is_array($p)) $this->fail($where, 'must be an object');
            $type = $this->resolveType($where, $p['type'] ?? ($p['typeId'] ?? null));
            $title = trim((string) ($p['title'] ?? ''));
            if ($title === '') $this->fail($where, "give a title ({$type['titleLabel']})");
            if (mb_strlen($title) > 200) $this->fail($where, 'title must be under 200 characters');
            $where .= " {$type['singular']} \"$title\"";
            $id = new_id('entry');
            if (isset($p['ref'])) {
                if (!is_string($p['ref']) || $p['ref'] === '' || isset($this->refs[$p['ref']])) $this->fail($where, 'ref must be a unique, non-empty string');
                $this->refs[$p['ref']] = [$id, $type['id'], $title];
            }
            $values = [];
            foreach (is_array($p['values'] ?? null) ? $p['values'] : [] as $k => $v) {
                $f = $this->fieldFor($where, $type, (string) $k);
                $values[$f['id']] = $this->value($where, $f, $v, $cid);
            }
            foreach ($type['fields'] as $f) if (!empty($f['required']) && ($values[$f['id']] ?? '') === '') $this->fail($where, "{$f['label']} is required");
            $date = ($type['primaryDateField'] ?? '') !== '' ? (string) ($values[$type['primaryDateField']] ?? '') : '';
            foreach ($this->doc['entries'] as $e) {
                if ($e['conditionId'] === $cid && $e['typeId'] === $type['id'] && lower($e['title']) === lower($title) && primary_date($type, $e) === $date) $this->warnings[] = "$where looks like existing entry {$e['id']} (same type, title" . ($date !== '' ? ', and date' : '') . '); use "update" if it is the same record';
            }
            $entry = ['id' => $id, 'conditionId' => $cid, 'typeId' => $type['id'], 'title' => $title, 'values' => $values, 'tagIds' => $this->tagIds($p['tags'] ?? []), 'notes' => ['html' => text_to_html((string) ($p['notes'] ?? ''))], 'attachments' => $this->attachments($where, $p['attachments'] ?? [], [])];
            $this->ops[] = ['op' => 'put', 'kind' => 'entry', 'value' => $entry];
            $this->preview[] = $this->describe('+ new', $type, $entry, null, []);
        }

        // Update: fill empty fields only, add tags, append notes, add documents.
        foreach (is_array($plan['update'] ?? null) ? $plan['update'] : [] as $i => $p) {
            $where = 'update[' . ($i + 1) . ']';
            $old = is_array($p) ? entry_of($this->doc, (string) ($p['id'] ?? '')) : null;
            if (!$old) $this->fail($where, 'give the "id" of an existing entry (see: php tools/intake.php entries <account> --condition=<id>)');
            $type = type_of($this->doc, $old['typeId']);
            $where .= " {$type['singular']} \"{$old['title']}\"";
            if (isset($p['title']) && $p['title'] !== $old['title']) $this->fail($where, 'titles are not changed by intake; edit it in the app');
            $entry = $old;
            $changed = [];
            foreach (is_array($p['values'] ?? null) ? $p['values'] : [] as $k => $v) {
                $f = $this->fieldFor($where, $type, (string) $k);
                $new = $this->value($where, $f, $v, $old['conditionId']);
                $cur = $old['values'][$f['id']] ?? '';
                if ($new === '' || $new === $cur) continue;
                if ($cur !== '' && $cur !== null && $cur !== false) {
                    $shown = is_bool($cur) ? ($cur ? 'yes' : 'no') : (string) $cur;
                    $this->fail($where, "{$f['label']} already has \"$shown\". Intake never overwrites a value: add the news as notes or as a new entry (for example an insurance event), or change it in the app");
                }
                $entry['values'][$f['id']] = $new;
                $changed[] = $f['id'];
            }
            $entry['tagIds'] = array_values(array_unique(array_merge($old['tagIds'] ?? [], $this->tagIds($p['tags'] ?? []))));
            if (trim((string) ($p['notes'] ?? '')) !== '') $entry['notes'] = ['html' => ($old['notes']['html'] ?? '') . text_to_html((string) $p['notes'])];
            $entry['attachments'] = array_merge($old['attachments'] ?? [], $this->attachments($where, $p['attachments'] ?? [], $old['attachments'] ?? []));
            if ($entry == $old) { $this->warnings[] = "$where: nothing new to add; skipped"; continue; }
            $this->ops[] = ['op' => 'put', 'kind' => 'entry', 'value' => $entry];
            $this->preview[] = $this->describe('~ update', $type, $entry, $old, $changed);
        }

        // Condition notes and documents (append only; a new condition takes them under "new").
        $cu = is_array($plan['conditionUpdate'] ?? null) ? $plan['conditionUpdate'] : [];
        if ($cu && !$isNew) {
            $value = $cond;
            if (trim((string) ($cu['notes'] ?? '')) !== '') $value['notes'] = ['html' => ($cond['notes']['html'] ?? '') . text_to_html((string) $cu['notes'])];
            $added = $this->attachments('conditionUpdate', $cu['attachments'] ?? [], $cond['attachments'] ?? []);
            $value['attachments'] = array_merge($cond['attachments'] ?? [], $added);
            if ($value != $cond) {
                $this->ops[] = ['op' => 'put', 'kind' => 'condition', 'value' => $value];
                $this->preview[] = "~ condition \"{$cond['name']}\"" . ($value['notes'] != $cond['notes'] ? "\n      notes: appended" : '') . ($added ? "\n      documents: " . $this->docList($added) : '');
            }
        }
        if (count($this->ops) === 0) $this->fail('plan', 'nothing to create or update');
    }

    private function describe(string $verb, array $type, array $entry, ?array $old, array $changed): string {
        $bits = [];
        foreach ($type['fields'] as $f) {
            $v = $entry['values'][$f['id']] ?? '';
            if ($v === '' || $v === null || ($old !== null && !in_array($f['id'], $changed, true))) continue;
            if ($f['kind'] === 'link') {
                $t = entry_of($this->doc, (string) $v);
                $title = $t ? $t['title'] : null;
                foreach ($this->refs as $r) if ($r[0] === $v) $title = $r[2];
                $v = $title ?? $v;
            }
            if (is_bool($v)) $v = $v ? 'yes' : 'no';
            $v = str_replace("\n", ' ', (string) $v);
            $bits[] = $f['label'] . ': ' . (mb_strlen($v) > 70 ? mb_substr($v, 0, 67) . '...' : $v);
        }
        $tagLabels = array_column($this->allTags(), 'label', 'id');
        $tags = [];
        foreach (array_diff($entry['tagIds'], $old['tagIds'] ?? []) as $id) $tags[] = $tagLabels[$id] ?? $id;
        $docs = array_slice($entry['attachments'], count($old['attachments'] ?? []));
        $line = "$verb {$type['singular']}: \"{$entry['title']}\"";
        if ($bits) $line .= "\n      " . implode("\n      ", $bits);
        if ($tags) $line .= "\n      tags: " . implode(', ', $tags);
        if (($entry['notes']['html'] ?? '') !== ($old['notes']['html'] ?? '')) $line .= "\n      notes: " . ($old !== null ? 'appended' : 'added');
        if ($docs) $line .= "\n      documents: " . $this->docList($docs);
        return $line;
    }
}

function cmd_apply(array $account, array $plan, bool $dry): int {
    $user = $account['username'];
    $doc = intake_load($account);
    try {
        $p = new Planner($doc);
        $p->build($plan);
        apply_ops($doc, $p->ops); // the app's own validation, before anything is written
    } catch (InvalidArgumentException $e) { die_with($e->getMessage()); return 1; }
    echo ($dry ? 'DRY RUN (nothing written)' : 'Applying') . " for account '$user':\n";
    foreach ($p->preview as $line) echo "  $line\n";
    foreach ($p->warnings as $w) echo "  ! $w\n";
    if ($dry) return 0;
    foreach ($p->files as $bytes) store_bytes($user, $bytes); // content-addressed; re-storing is a no-op
    try {
        $saved = with_lock($user, function () use ($user, $plan, $doc, $p) {
            $current = normalize_doc(read_doc($user) ?? new_doc());
            $planner = $p;
            if ((int) ($current['revision'] ?? 0) !== (int) ($doc['revision'] ?? 0)) {
                // The app saved in between: rebuild the plan against the newest document.
                $planner = new Planner($current);
                $planner->build($plan);
            }
            $next = apply_ops($current, $planner->ops);
            write_doc($user, $next); // backs up the current file first
            return ['doc' => $next, 'planner' => $planner];
        });
    } catch (InvalidArgumentException $e) { die_with($e->getMessage()); return 1; }
    $made = 0; $changed = 0;
    foreach ($saved['planner']->ops as $op) {
        if ($op['kind'] !== 'entry') continue;
        if (entry_of($doc, $op['value']['id'])) $changed++; else $made++;
    }
    echo "Saved: $made new, $changed updated (revision {$saved['doc']['revision']}; backup taken first). Reload Appts and open #/c/{$saved['planner']->conditionId}\n";
    return 0;
}

// ---- main -----------------------------------------------------------------------------------
$opts = [];
$pos = [];
foreach (array_slice($argv, 1) as $a) {
    if (preg_match('/^--([a-z-]+)(?:=(.*))?$/s', $a, $m)) $opts[$m[1]] = $m[2] ?? true; else $pos[] = $a;
}
$cmd = $pos[0] ?? '';
$usage = "Usage:\n  php tools/intake.php accounts\n  php tools/intake.php conditions <account>\n  php tools/intake.php types <account>\n  php tools/intake.php entries <account> [--condition=<id>] [--type=<id>] [--query=<text>]\n  php tools/intake.php apply <account> <plan.json|-> [--dry-run]\n";
try {
    switch ($cmd) {
        case 'accounts': out_json(intake_accounts()); break;
        case 'conditions': out_json(cmd_conditions(intake_load(intake_account($pos[1] ?? '')))); break;
        case 'types': out_json(cmd_types(intake_load(intake_account($pos[1] ?? '')))); break;
        case 'entries': out_json(cmd_entries(intake_load(intake_account($pos[1] ?? '')), $opts)); break;
        case 'apply':
            if (!isset($pos[2])) die_with('Usage: php tools/intake.php apply <account> <plan.json|-> [--dry-run]');
            $account = intake_account($pos[1]);
            $raw = $pos[2] === '-' ? stream_get_contents(STDIN) : (is_file($pos[2]) ? file_get_contents($pos[2]) : false);
            if ($raw === false) die_with("Plan file not found: {$pos[2]}");
            $plan = json_decode((string) $raw, true);
            if (!is_array($plan)) die_with('The plan is not valid JSON: ' . json_last_error_msg());
            exit(cmd_apply($account, $plan, !empty($opts['dry-run'])));
        case '': case 'help': echo $usage; break;
        default: fwrite(STDERR, $usage); exit(1);
    }
} catch (InvalidArgumentException $e) { die_with($e->getMessage()); }
