// Offline mode: save this account's records, documents, and the app itself on this device, then
// answer every page and API read from that copy (sw.php). Changes are queued (js/outbox.js) and
// synced with a three-way merge (js/merge.js) after the mode is turned off.
import { api, AuthError } from './api.js';
import { store, notice } from './store.js';
import * as O from './outbox.js';
import { planSync, remapIds } from './merge.js';

export const VERSION = document.querySelector('meta[name="appts-version"]')?.content || '';
const dlg = () => document.querySelector('#offline-dialog');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const abs = u => new URL(u, location.href).href;
let registration = null, busy = false, lastReport = [], plan = null;

export function formatBytes(n) {
  if (!n) return '0 KB';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / 1024 ** 3).toFixed(n < 10 * 1024 ** 3 ? 1 : 0)} GB`;
}
const when = iso => iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'never';

// ---- service worker --------------------------------------------------------------------
export async function registerWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try { registration = await navigator.serviceWorker.register(`sw.php?v=${encodeURIComponent(VERSION)}`, { scope: './', updateViaCache: 'none' }); }
  catch (err) { console.warn('Appts: service worker not registered', err); return null; }
  // A new release's worker takes over at once (its flag comes from Cache Storage, so the mode carries over).
  const promote = w => { if (w) { w.postMessage({ type: 'appts-skip-waiting' }); w.postMessage({ type: 'appts-offline-mode', on: !!O.readState().on }); } };
  promote(registration.waiting);
  registration.addEventListener('updatefound', () => { const w = registration.installing; w?.addEventListener('statechange', () => { if (w.state === 'installed') promote(w); }); });
  tellWorker(O.readState().on);
  return registration;
}
function tellWorker(on) {
  const msg = { type: 'appts-offline-mode', on: !!on };
  new Set([navigator.serviceWorker?.controller, registration?.active, registration?.waiting, registration?.installing].filter(Boolean)).forEach(w => w.postMessage(msg));
}
async function writeFlag(on) {
  const cache = await caches.open(O.STATE_CACHE);
  await cache.put(abs(O.FLAG), new Response(JSON.stringify({ on, at: new Date().toISOString() }), { headers: { 'Content-Type': 'application/json' } }));
  tellWorker(on);
}
/** Straight to the server, past the offline copy (the fill header). */
async function netJSON(action) {
  let r;
  try { r = await fetch(`api.php?action=${encodeURIComponent(action)}`, { cache: 'no-store', credentials: 'same-origin', headers: { 'X-Appts': '1', 'X-Appts-Fill': '1' } }); }
  catch { throw Error('You seem to be offline. Connect to the internet to save an offline copy.'); }
  const body = await r.json().catch(() => ({}));
  if (r.status === 401) throw new AuthError(body.error || 'Please sign in again.');
  if (!r.ok) throw Error(body.error || 'The server could not list what to save.');
  return body;
}

// ---- saving the copy -----------------------------------------------------------------
function chosen(p, selection) {
  const all = selection === 'all';
  const ids = new Set(all ? p.conditions.map(c => c.id) : selection || []);
  const uploads = new Map();
  for (const c of p.conditions) if (ids.has(c.id)) for (const u of c.uploads) uploads.set(u.url, u);
  const jobs = new Map();
  for (const s of p.shell) jobs.set(abs(s.url), { url: s.url, cache: O.SHELL_CACHE, bytes: s.bytes, required: true });
  for (const d of p.data) jobs.set(abs(d.url), { url: d.url, cache: O.accountCache(p.account), bytes: d.bytes, required: true });
  for (const u of uploads.values()) jobs.set(abs(u.url), { url: u.url, cache: O.accountCache(p.account), bytes: u.bytes, required: false });
  const list = [...jobs.values()];
  return { list, bytes: list.reduce((n, j) => n + (j.bytes || 0), 0), uploads: uploads.size };
}
export function isQuotaError(err) { return err && (err.name === 'QuotaExceededError' || err.code === 22 || /quota/i.test(err.message || '')); }

async function fill(p, selection, progress) {
  const { list, bytes: need } = chosen(p, selection);
  const est = await navigator.storage?.estimate?.().catch(() => null);
  if (est && est.quota && est.quota - (est.usage || 0) < need * 1.1) {
    const e = Error(`This needs about ${formatBytes(need)}, but this browser only has ${formatBytes(est.quota - (est.usage || 0))} free for Appts. Choose fewer conditions or free up space.`); e.name = 'QuotaExceededError'; throw e;
  }
  const persisted = await navigator.storage?.persist?.().catch(() => false) || false;
  for (const name of [O.SHELL_CACHE, O.accountCache(p.account)]) await caches.delete(name);
  const caches_ = { [O.SHELL_CACHE]: await caches.open(O.SHELL_CACHE), [O.accountCache(p.account)]: await caches.open(O.accountCache(p.account)) };
  let next = 0, done = 0, bytes = 0, failed = 0, stop = null;
  progress(0, list.length);
  async function worker() {
    while (!stop && next < list.length) {
      const job = list[next++];
      try {
        const r = await fetch(job.url, { cache: 'no-store', credentials: 'same-origin', headers: { 'X-Appts': '1', 'X-Appts-Fill': '1' } });
        if (!r.ok) throw Error(`${job.url} answered ${r.status}`);
        const blob = await r.clone().blob();
        await caches_[job.cache].put(abs(job.url), r);
        bytes += blob.size;
      } catch (err) {
        if (isQuotaError(err)) { stop = err; break; }
        if (job.required) { stop = err; break; }
        failed++;
      }
      progress(++done, list.length);
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  if (stop) {
    for (const name of [O.SHELL_CACHE, O.accountCache(p.account)]) await caches.delete(name).catch(() => {});
    if (isQuotaError(stop)) { const e = Error('This device ran out of space while saving, so Offline mode stayed off. Choose fewer conditions, or free up space and try again.'); e.name = 'QuotaExceededError'; throw e; }
    throw Error(`Saving stopped: ${stop.message}. Offline mode stayed off.`);
  }
  // Documents added offline and not yet synced stay readable.
  for (const f of await O.listFiles(p.account)) { await O.cacheFile(p.account, f, f.blob); bytes += f.blob.size; }
  navigator.serviceWorker?.controller?.postMessage({ type: 'appts-offline-reindex' });
  return { items: list.length - failed, failed, bytes, need, persisted, uploads: chosen(p, selection).uploads };
}

async function turnOn(selection, progress) {
  if (!registration) await registerWorker();
  if (!registration) throw Error('This browser cannot keep an offline copy here (service workers need https or localhost).');
  await navigator.serviceWorker.ready;
  plan = await netJSON('offline-plan');
  const result = await fill(plan, selection, progress);
  O.writeState({ on: true, at: new Date().toISOString(), version: plan.version, account: plan.account, selection, ...result });
  await writeFlag(true);
  document.body.classList.add('offline-on');
}
async function refreshCopy(progress = () => {}) {
  const st = O.readState();
  plan = await netJSON('offline-plan');
  const result = await fill(plan, st.selection || 'all', progress);
  O.writeState({ ...st, on: true, at: new Date().toISOString(), version: plan.version, account: plan.account, ...result });
  await writeFlag(true);
}
async function turnOff() {
  O.writeState({ ...O.readState(), on: false, offAt: new Date().toISOString() });
  await writeFlag(false);
  document.body.classList.remove('offline-on');
}

/** A new release while online: save the new app into the copy, stay in Offline mode, reload. */
export async function checkVersion() {
  const st = O.readState();
  if (!st.on && O.ctx.pending + O.ctx.files) notice(`${O.ctx.pending + O.ctx.files} change${O.ctx.pending + O.ctx.files === 1 ? '' : 's'} made in Offline mode ${O.ctx.pending + O.ctx.files === 1 ? 'is' : 'are'} waiting. Open Offline in the header to sync.`);
  if (!st.on || st.account !== store.account?.username) return false;
  let version;
  try { const r = await fetch('api.php?action=version', { cache: 'no-store' }); if (!r.ok) return false; ({ version } = await r.json()); } catch { return false; }
  if (!version || version === st.version || sessionStorage.getItem('appts-offline-updated') === version) return false;
  sessionStorage.setItem('appts-offline-updated', version);
  try { await refreshCopy(); } catch (err) { notice(`A new version of Appts is available, but the offline copy could not be updated: ${err.message}`); return false; }
  await installWorker(version);
  location.reload();
  return true;
}

/** Install the new release's worker before reloading, so the reloaded page is served by it. */
async function installWorker(version) {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register(`sw.php?v=${encodeURIComponent(version)}`, { scope: './', updateViaCache: 'none' });
    const fresh = () => [reg.installing, reg.waiting, reg.active].find(w => w && w.scriptURL.endsWith(`sw.php?v=${version}`));
    for (let i = 0; i < 50; i++) {
      const w = fresh();
      if (w && w.state === 'activated') break;
      if (w && w.state === 'installed') w.postMessage({ type: 'appts-skip-waiting' });
      await new Promise(r => setTimeout(r, 100));
    }
    tellWorker(true);
  } catch (err) { console.warn('Appts: new service worker not installed yet', err); }
}

// ---- sync ---------------------------------------------------------------------------------
export async function sync() {
  if (O.readState().on) throw Error('Sync waits until Offline mode is off. Turn it off once you are back online.');
  const failures = [], fileMap = {};
  for (const f of await O.listFiles()) {
    const form = new FormData(); form.append('file', f.blob, f.name);
    try { const { file } = await api('upload', { form }); if (file.id !== f.id) fileMap[f.id] = file.id; await O.removeFile(f.key); }
    catch (err) { if (err instanceof AuthError) throw err; failures.push({ key: f.key, note: `document “${f.name}” could not be uploaded yet: ${err.message}` }); }
  }
  let pending = await O.listPending();
  if (Object.keys(fileMap).length) { pending = pending.map(p => ({ ...p, base: p.base, ours: remapIds(p.ours, fileMap) })); await O.updatePending(pending); }
  const { doc: server } = await api('data');
  const { ops, report } = planSync(pending, server);
  const planned = new Set(ops.map(o => o.key));
  const done = new Set(pending.filter(p => !planned.has(p.key)).map(p => p.key));
  for (let i = 0; i < ops.length; i += 200) {
    const chunk = ops.slice(i, i + 200);
    try { await api('ops', { body: { ops: chunk.map(o => o.op) } }); chunk.forEach(o => done.add(o.key)); }
    catch (err) {
      if (err instanceof AuthError) throw err;
      for (const o of chunk) {
        try { await api('ops', { body: { ops: [o.op] } }); done.add(o.key); }
        catch (e) { if (e instanceof AuthError) throw e; failures.push({ key: o.key, note: e.message }); }
      }
    }
  }
  await O.removePending([...done]);
  if (failures.length) await O.updatePending((await O.listPending()).map(p => ({ ...p, lastError: failures.find(f => f.key === p.key)?.note || p.lastError || '' })));
  const fresh = await api('data');
  store.doc = await O.withPending(store.account, fresh.doc); store.render();
  lastReport = [...report.map(r => ({ ...r, label: labelFor(r.kind, r.id) })), ...failures.map(f => ({ ...f, label: f.key.split('|').slice(1).join(' '), failed: true }))];
  const synced = done.size;
  notice(failures.length ? `Synced ${synced} change${synced === 1 ? '' : 's'}; ${failures.length} still waiting (see Offline mode).` : `Synced ${synced} change${synced === 1 ? '' : 's'} from this device.`);
  return { synced, failures, report };
}
function labelFor(kind, id) {
  const col = { condition: 'conditions', type: 'types', entry: 'entries', tag: 'tags', docLabel: 'docLabels', filter: 'filters' }[kind];
  const r = (store.doc?.[col] || []).find(x => x.id === id);
  if (kind === 'filter') return 'Disruptions filter';
  return `${kind === 'entry' ? 'Entry' : kind === 'type' ? 'Type' : kind === 'condition' ? 'Condition' : kind} “${r?.title || r?.name || id}”`;
}

// ---- sign out ------------------------------------------------------------------------------
/** False (and a warning) while changes exist only on this device. */
export async function beforeLogout() {
  await O.refreshCounts();
  const waiting = O.ctx.pending + O.ctx.files;
  if (!waiting) return true;
  openPanel({ warn: `${waiting} change${waiting === 1 ? ' is' : 's are'} saved only on this device. ${O.readState().on ? 'Turn Offline mode off and sync' : 'Sync'} before signing out, or ${waiting === 1 ? 'it' : 'they'} would be lost.` });
  return false;
}
/** After sign-out: remove this account's offline copy and turn the mode off. */
export async function afterLogout(account) {
  const st = O.readState();
  if (st.on) await turnOff().catch(() => {});
  await caches.delete(O.accountCache(account)).catch(() => {});
  await caches.delete(O.SHELL_CACHE).catch(() => {});
  await O.clearAccount(account).catch(() => {});
  localStorage.removeItem(O.STATE_KEY);
  await writeFlag(false).catch(() => {});
  document.body.classList.remove('offline-on');
}

// ---- header pill, panel, explainer --------------------------------------------------------
export function chromeHTML() {
  const on = O.readState().on, waiting = O.ctx.pending + O.ctx.files;
  return `<span class="offline-controls"><button type="button" class="offline-pill${on ? ' on' : ''}" data-offline="panel" aria-haspopup="dialog" title="Offline mode: ${on ? 'on' : 'off'}">Offline <b>${on ? 'On' : 'Off'}</b>${waiting ? `<span class="offline-count" title="Changes waiting to sync">${waiting}</span>` : ''}</button><button type="button" class="offline-info" data-offline="info" aria-label="What is Offline mode?" title="What is Offline mode?">i</button></span>`;
}
function refreshChrome() { const c = document.querySelector('.offline-controls'); if (c) c.outerHTML = chromeHTML(); }

const CLINIC_SVG = `<svg class="offline-art" viewBox="0 0 360 190" role="img" aria-labelledby="offline-art-title"><title id="offline-art-title">A doctor at a clinic with a “No guest Wi-Fi” sign; the patient's phone still shows Appts with records saved on the device.</title>
<rect x="0" y="0" width="360" height="190" fill="#eaf4fb"/><rect x="0" y="160" width="360" height="30" fill="#d7d9d9"/>
<rect x="18" y="36" width="170" height="124" fill="#fffef8" stroke="#172943" stroke-width="3"/><polygon points="10,40 103,8 196,40" fill="#172943"/>
<rect x="88" y="16" width="30" height="20" fill="#fffef8"/><rect x="99" y="19" width="8" height="14" fill="#c33"/><rect x="96" y="22" width="14" height="8" fill="#c33"/>
<text x="103" y="58" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="#172943">CLINIC</text>
<rect x="34" y="70" width="62" height="40" rx="3" fill="#fff" stroke="#172943" stroke-width="2"/>
<g transform="translate(65 84)" fill="none" stroke="#9aa3ad" stroke-width="3" stroke-linecap="round"><path d="M-14 0a20 20 0 0 1 28 0"/><path d="M-8 6a11 11 0 0 1 16 0"/><circle cx="0" cy="12" r="1.5" fill="#9aa3ad"/><path d="M-16 -8L16 18" stroke="#c33"/></g>
<text x="65" y="122" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9" font-weight="700" fill="#172943">No guest Wi-Fi</text>
<rect x="120" y="96" width="44" height="64" fill="#8cc8f2" stroke="#172943" stroke-width="2"/>
<g transform="translate(232 54)"><circle cx="0" cy="0" r="15" fill="#f2c9a0" stroke="#172943" stroke-width="2"/><path d="M-14 -4q14 -16 28 0" fill="#3b2a20"/>
<path d="M-24 106v-64q0-22 24-22t24 22v64z" fill="#fff" stroke="#172943" stroke-width="2"/><path d="M-9 22q-4 26 9 32q13-6 9-32" fill="none" stroke="#172943" stroke-width="2.5"/><circle cx="0" cy="56" r="4" fill="#172943"/>
<rect x="-6" y="20" width="12" height="10" fill="#1f6f5c"/></g>
<g transform="translate(300 70)"><rect x="0" y="0" width="44" height="80" rx="7" fill="#172943"/><rect x="4" y="9" width="36" height="60" rx="2" fill="#fffef8"/>
<rect x="8" y="14" width="28" height="9" fill="#8cc8f2"/><text x="22" y="21.5" text-anchor="middle" font-family="system-ui,sans-serif" font-size="7" font-weight="800" fill="#172943">Appts</text>
<rect x="8" y="28" width="28" height="4" fill="#d7d9d9"/><rect x="8" y="36" width="20" height="4" fill="#d7d9d9"/><rect x="8" y="44" width="24" height="4" fill="#d7d9d9"/>
<circle cx="32" cy="60" r="7" fill="#1f6f5c"/><path d="M28.5 60l2.5 2.5 4.5-5" fill="none" stroke="#fff" stroke-width="2"/></g>
<text x="322" y="166" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9" font-weight="700" fill="#172943">Saved on</text><text x="322" y="177" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9" font-weight="700" fill="#172943">this phone</text></svg>`;

function show(html, label) {
  const d = dlg(); d.className = 'offline-dialog'; d.setAttribute('aria-labelledby', label); d.innerHTML = html;
  if (!d.open) d.showModal();
  d.querySelector('[data-offline-close]')?.addEventListener('click', () => d.close());
}
export function openInfo() {
  const on = O.readState().on;
  show(`<form method="dialog" class="offline-sheet"><div class="dialog-head"><h2 id="offline-info-title">What is Offline mode?</h2><button class="close" value="close" aria-label="Close">✕ Close</button></div>
    <p class="offline-lead">Want to show clinical information to your doctor?</p>
    ${CLINIC_SVG}
    <p class="offline-intro"><strong>Turn this on first, while you're still online.</strong> Some clinics don't share their internet, and phone signal inside can be weak.</p>
    <ol class="offline-steps"><li>Before you leave, open Appts and turn on <b>Offline mode</b>. Appts saves your records, the documents of the conditions you choose, and the app itself on this device.</li>
    <li>At the appointment, every page opens from that saved copy, even with no connection. Nothing is sent over the network.</li>
    <li>Changes you make there (a note, a new visit, a photo of a letter) stay on this device. When you're back online, turn Offline mode off and sync them.</li></ol>
    <p class="fine">Only your account is saved, and signing out removes the copy from this device.</p>
    <div class="dialog-foot"><button value="close">Close</button>${on ? '' : '<button type="button" class="primary" data-offline="panel">Set up Offline mode</button>'}</div></form>`, 'offline-info-title');
}

export async function openPanel({ warn = '' } = {}) {
  await O.refreshCounts();
  const st = O.readState(), waiting = O.ctx.pending + O.ctx.files, pending = await O.listPending().catch(() => []);
  const failed = pending.filter(p => p.lastError);
  const status = `<dl class="offline-status"><div><dt>Offline mode</dt><dd class="offline-onoff ${st.on ? 'on' : 'off'}">${st.on ? 'On' : 'Off'}</dd></div><div><dt>Last saved</dt><dd>${esc(when(st.at))}</dd></div><div><dt>Saved items</dt><dd>${st.at ? `${st.items || 0}${st.failed ? ` (${st.failed} could not be saved)` : ''}` : '0'}</dd></div><div><dt>Size</dt><dd>${st.at ? formatBytes(st.bytes) : '—'}</dd></div><div><dt>Waiting to sync</dt><dd>${waiting ? `${waiting} change${waiting === 1 ? '' : 's'}` : 'Nothing'}</dd></div></dl>`;
  const report = lastReport.length ? `<section class="offline-report" aria-label="Last sync"><h3>Last sync</h3><ul>${lastReport.map(r => `<li${r.failed ? ' class="failed"' : ''}>${esc(r.label)}: ${esc(r.note)}</li>`).join('')}</ul></section>` : '';
  const stuck = failed.length ? `<section class="offline-report" aria-label="Not synced yet"><h3>Not synced yet</h3><ul>${failed.map(p => `<li class="failed">${esc(labelFor(p.kind, p.id))}: ${esc(p.lastError)} <button type="button" class="link" data-offline="discard" data-key="${esc(p.key)}">Discard this change</button></li>`).join('')}</ul></section>` : '';
  let body;
  if (st.on) {
    body = `<p class="offline-intro">Every page and document opens from the copy on this device. ${waiting ? 'Your changes are kept here; ' : ''}Sync waits until you turn Offline mode off.</p>${status}${report}
      <div class="dialog-foot"><button type="button" data-offline="refresh">Update saved copy</button><button type="button" class="primary" data-offline="off">Turn off Offline mode</button></div>`;
  } else {
    body = `<p class="offline-intro">Save your records on this device before you go somewhere without internet, like a clinic that doesn't share its Wi-Fi.</p>${status}${report}${stuck}
      ${waiting ? `<div class="offline-sync"><p><strong>${waiting} change${waiting === 1 ? '' : 's'} made offline ${waiting === 1 ? 'is' : 'are'} ready to sync.</strong> Appts merges them with anything changed on the server meanwhile; nothing is overwritten.</p><button type="button" class="primary" data-offline="sync">Sync ${waiting} change${waiting === 1 ? '' : 's'} now</button></div>` : ''}
      <fieldset class="offline-pick"><legend>Documents to save</legend><p class="fine">Your records and the app are always saved. Choose which conditions' documents (PDFs and images) to include.</p><div class="offline-conditions"><p class="muted">Checking what to save…</p></div><p class="offline-estimate" aria-live="polite"></p></fieldset>
      <div class="offline-progress" hidden><progress max="1" value="0"></progress><p role="status" class="offline-progress-text"></p></div>
      <div class="dialog-foot"><button type="button" data-offline-close>Close</button><button type="button" class="primary" data-offline="on" disabled>Turn on Offline mode</button></div>`;
  }
  show(`<div class="offline-sheet"><div class="dialog-head"><h2 id="offline-panel-title">Offline mode</h2><button type="button" class="close" data-offline-close aria-label="Close">✕ Close</button></div>${warn ? `<p class="offline-warn" role="alert">${esc(warn)}</p>` : ''}<p class="offline-error" role="alert"></p>${body}</div>`, 'offline-panel-title');
  if (!st.on) loadPlanInto(dlg());
}
async function loadPlanInto(d) {
  const box = d.querySelector('.offline-conditions'), est = d.querySelector('.offline-estimate'), go = d.querySelector('[data-offline="on"]');
  try { plan = await netJSON('offline-plan'); }
  catch (err) { box.innerHTML = `<p class="form-error">${esc(err.message)}</p>`; return; }
  if (!d.open || !d.contains(box)) return;
  const prev = O.readState().selection;
  box.innerHTML = plan.conditions.map(c => `<label class="check"><input type="checkbox" name="offline-cond" value="${esc(c.id)}"${!prev || prev === 'all' || prev.includes(c.id) ? ' checked' : ''}> <span>${esc(c.name)}</span> <small class="muted">${c.uploads.length} document${c.uploads.length === 1 ? '' : 's'} · ${formatBytes(c.bytes)}</small></label>`).join('') || '<p class="muted">No conditions yet.</p>';
  const storage = await navigator.storage?.estimate?.().catch(() => null);
  const update = () => {
    const ids = [...box.querySelectorAll('input:checked')].map(i => i.value);
    const { list, bytes } = chosen(plan, ids.length === plan.conditions.length ? 'all' : ids);
    est.textContent = `About ${formatBytes(bytes)} · ${list.length} items${storage?.quota ? ` · ${formatBytes(Math.max(0, storage.quota - (storage.usage || 0)))} free on this device` : ''}`;
  };
  box.onchange = update; update(); go.disabled = false;
}

async function onAction(kind, el) {
  const d = dlg(), err = d.querySelector('.offline-error');
  if (kind === 'info') return openInfo();
  if (kind === 'panel') return openPanel();
  if (busy) return;
  busy = true;
  try {
    if (kind === 'on') {
      const ids = [...d.querySelectorAll('input[name=offline-cond]:checked')].map(i => i.value);
      const selection = plan && ids.length === plan.conditions.length ? 'all' : ids;
      const prog = d.querySelector('.offline-progress'), bar = prog.querySelector('progress'), text = prog.querySelector('.offline-progress-text');
      prog.hidden = false; d.querySelectorAll('.dialog-foot button, input').forEach(b => { b.disabled = true; });
      await turnOn(selection, (n, total) => { bar.max = total || 1; bar.value = n; text.textContent = `Saving ${n} of ${total}…`; });
      notice('Offline mode is on. Appts now opens from the copy on this device.');
      refreshChrome(); return openPanel();
    }
    if (kind === 'off') {
      await turnOff(); refreshChrome(); await openPanel();
      if (O.ctx.pending + O.ctx.files) dlg().querySelector('[data-offline="sync"]')?.focus();
      return notice('Offline mode is off.');
    }
    if (kind === 'refresh') { el.disabled = true; el.textContent = 'Saving…'; await refreshCopy((n, t) => { el.textContent = `Saving ${n} of ${t}…`; }); notice('Offline copy updated.'); return openPanel(); }
    if (kind === 'sync') { el.disabled = true; el.textContent = 'Syncing…'; await sync(); refreshChrome(); return openPanel(); }
    if (kind === 'discard' && confirm('Discard this change made offline? The server version stays.')) { await O.removePending([el.dataset.key]); store.doc = await O.withPending(store.account, (await api('data')).doc); store.render(); refreshChrome(); return openPanel(); }
  } catch (e) {
    if (err) err.textContent = e.message; else notice(e.message);
    d.querySelectorAll('.dialog-foot button, input').forEach(b => { b.disabled = false; });
    const prog = d.querySelector('.offline-progress'); if (prog) prog.hidden = true;
    if (e instanceof AuthError) notice(e.message);
  } finally { busy = false; refreshChrome(); }
}
document.addEventListener('click', e => { const t = e.target.closest('[data-offline]'); if (t) { e.preventDefault(); onAction(t.dataset.offline, t); } });
document.addEventListener('appts-queued', refreshChrome);

export async function initOffline() {
  if (O.readState().on) document.body.classList.add('offline-on');
  await registerWorker();
}
