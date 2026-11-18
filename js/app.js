// Appts: condition-organized medical-visit tracker. Hash views (#/, #/c/<id>, #/timeline,
// #/upcoming, #/documents, #/types) keep the current view across reloads; the server has no router.
import { api, AuthError } from './api.js';
import * as S from './schema.js';
import * as D from './documents.js';
import { typeBadge } from './icons.js';
import { noteHTML } from './richText.js';
import { imageURL } from './images.js';
import { DEMO_USERNAME, DEMO_PASSWORD } from './demoAccount.js';
import { store, save, notice, remove, put } from './store.js';
import { esc, condNameHTML, condOptionAttrs, relLabel, eventTime, itemIcons, quickPreviewToggle, setQuickPreview, quickPreviewOn, plural, searchBox, eventRow, entryRow, typeChip, tagFilterChip, tagChip, closeDialog, hhPanel } from './ui.js';
import { highlightsHTML, toggleHighlights, openHighlight, openHighlightForm, deleteHighlight } from './highlights.js';
import { openEntryForm, openEntryDetail, deleteEntry, openConditionForm, openMemo, openViewer, openQuickUpload, attachmentsHTML } from './forms.js';
import { renderTypes, openTypeEditor } from './typesPage.js';
import * as offline from './offline.js';
import { moreMenuHTML, fitHeader } from './moreMenu.js';
import { queueing, withPending } from './outbox.js';

const app = document.querySelector('#app');
const ui = {
  overviewQuery: '',
  condition: { id: '', typeIds: new Set(), tagIds: new Set(), query: '' },
  timeline: { conditionId: '', range: 'all', typeIds: new Set(), tagIds: new Set(), query: '', disruptions: false, disEdit: false },
  docs: { kinds: new Set(), labelIds: new Set(), conditionId: '', query: '', group: 'label' },
};
const toggle = (set, id) => { set.has(id) ? set.delete(id) : set.add(id); };
function route() {
  const [, view = '', id = ''] = (location.hash || '#/').split('/');
  return { view, id: decodeURIComponent(id) };
}
const liveConditions = () => store.doc.conditions.filter(c => c.status !== 'archived').sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

// ---- chrome ---------------------------------------------------------------------------
function renderChrome() {
  const nav = document.querySelector('#nav'), actions = document.querySelector('#account-actions'), slot = document.querySelector('#offline-slot');
  if (!store.account) { nav.innerHTML = ''; actions.innerHTML = ''; slot.innerHTML = ''; return; }
  const { view } = route(), current = v => (view === v || (v === '' && view === 'c')) ? ' aria-current="page"' : '';
  nav.innerHTML = [['', 'Conditions'], ['upcoming', 'Upcoming'], ['timeline', 'Timeline'], ['documents', 'Documents'], ['types', 'Entry types']].map(([v, l]) => `<a href="#/${v}"${current(v)}>${l}</a>`).join('');
  // Offline mode at the far left of the navbar with a thin rule (t21u); account and demo options behind "…" (t19u).
  // When the row has no room, the Offline group moves into the "…" menu (fitHeader).
  slot.innerHTML = `${offline.chromeHTML()}<span class="nav-sep" aria-hidden="true"></span>`;
  actions.innerHTML = moreMenuHTML(store.account);
  fitHeader();
}

// ---- login ----------------------------------------------------------------------------
function renderLogin() {
  renderChrome();
  app.innerHTML = `<section class="login"><div class="eyebrow">Appts · your care, by condition</div><h1>Appointments and insurance getting out of hand?</h1><p class="muted">Some conditions mean many visits, scans, and insurance back-and-forth, for you or someone you care for. Appts keeps the appointments, insurance, and progress for each condition in one place.</p>
    <form id="login-form"><h2>Sign in</h2><label>Username<input name="username" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button class="primary" type="submit">Sign in</button><p class="form-error" role="alert"></p></form>
    <section class="demo-login" aria-label="Demo account"><strong>Demo-only credentials</strong><button type="button" class="demo-row" id="fill-demo"><span><code>${esc(DEMO_USERNAME)}</code> / <code>${esc(DEMO_PASSWORD)}</code></span><small>Synthetic sample patient with three conditions · Click to fill</small></button></section>
    <p class="fine">Records are saved as files on this PHP server (storage/, not reachable from the web). The demo account contains only made-up data.</p></section>`;
  const form = document.querySelector('#login-form');
  document.querySelector('#fill-demo').onclick = () => { form.elements.username.value = DEMO_USERNAME; form.elements.password.value = DEMO_PASSWORD; form.querySelector('.form-error').textContent = ''; form.querySelector('[type=submit]').focus(); };
  form.onsubmit = async e => {
    e.preventDefault(); const submit = form.querySelector('[type=submit]'); submit.disabled = true;
    try {
      await api('login', { body: { username: form.elements.username.value, password: form.elements.password.value } });
      await load();
    } catch (err) { form.querySelector('.form-error').textContent = err.message; submit.disabled = false; }
  };
}

// ---- overview -------------------------------------------------------------------------
function conditionCard(c) {
  const stats = S.conditionStats(store.doc, c.id), next = stats.next, doc = store.doc;
  const hls = S.highlightsFor(doc, c.id), files = [...(c.attachments || []), ...doc.entries.filter(e => e.conditionId === c.id).flatMap(e => e.attachments || [])];
  const ic = itemIcons({ highlight: hls.length ? `${hls[0].title}: ${hls[0].summary}${hls.length > 1 ? ` (+${hls.length - 1} more)` : ''}` : '', heading: 'Clinical significance', gallery: `condition:${c.id}`, attachments: [...new Map(files.map(a => [a.id, a])).values()] });
  return `<article class="condition-card" data-open-condition="${esc(c.id)}" style="--cond-color:${esc(c.color)}"><div><span class="badge ${esc(c.status)}">${esc(c.status)}</span>${c.diagnosedOn ? ` <small class="muted">since ${esc(S.formatDate(c.diagnosedOn, { month: 'short', year: 'numeric' }))}</small>` : ''}</div><h2><a href="#/c/${esc(c.id)}"${ic.ids.length ? ` aria-describedby="${ic.ids.join(' ')}"` : ''}>${condNameHTML(c)}</a>${ic.html}</h2>${c.summary ? `<p class="summary">${esc(c.summary)}</p>` : ''}
    <ul class="type-counts" aria-label="Records">${stats.counts.map(x => `<li>${typeBadge(x.type, 'sm')}<span>${x.count} ${esc(x.count === 1 ? x.type.singular : x.type.name)}</span></li>`).join('') || '<li class="muted">No entries yet</li>'}</ul>
    <div class="card-next"><strong>Next up</strong>${next ? `${esc(next.primary ? S.typeById(store.doc, next.typeId).singular : next.label)}: ${esc(next.title)} ${relLabel(next.date, { time: eventTime((store.doc.entries || []).find(e => e.id === next.entryId), next) })}` : '<span class="muted">Nothing scheduled</span>'}</div></article>`;
}
function renderOverview() {
  const doc = store.doc, conds = liveConditions(), q = ui.overviewQuery;
  const next = S.upcoming(doc, { limit: 6, onePerEntry: true });
  const others = doc.conditions.filter(c => c.status === 'archived');
  let body;
  if (q.trim()) {
    const hits = S.filterEntries(doc, { query: q });
    body = `<h2>${plural(hits.length, 'match', 'matches')} for “${esc(q)}”</h2><ul class="entry-list">${hits.map(entryRow).join('') || '<li class="muted" style="padding:14px 0">Nothing matches. Try a doctor, a reference number, or a word from your notes.</li>'}</ul>`;
  } else if (!conds.length) {
    body = `<div class="empty"><h2>Start with a condition</h2><p class="muted">Add a diagnosis you're being seen for, like “Left knee osteoarthritis”. Then add its doctors, visits, referrals, appeals, supplies, care, treatments, and documents under it.</p><button class="primary" type="button" data-action="add-condition">+ Add your first condition</button></div>`;
  } else {
    const hh = S.homeHealthAuths(doc);
    const hhHTML = hh.length ? `<section class="hh-overview" aria-labelledby="hh-h"><h2 id="hh-h">Home health visits</h2><div class="hh-grid">${hh.map(a => hhPanel(a.entry, { compact: true })).join('')}</div></section>` : '';
    body = `${hhHTML}${next.length ? `<section class="next-up" aria-labelledby="next-up-h"><h2 id="next-up-h">Next up across your conditions</h2><ul class="event-list">${next.map(ev => eventRow(ev)).join('')}</ul><p class="fine" style="margin:10px 0 0"><a href="#/upcoming">See everything upcoming →</a></p></section>` : ''}
      <div class="section-heading"><h2>Your conditions</h2><span class="muted">${plural(conds.length, 'active condition')}</span></div><div class="condition-grid">${conds.map(conditionCard).join('')}</div>
      ${others.length ? `<p class="fine" style="margin-top:20px">Archived: ${others.map(c => `<a href="#/c/${esc(c.id)}">${condNameHTML(c)}</a>`).join(', ')}</p>` : ''}`;
  }
  app.innerHTML = `<div class="page-heading"><div><p class="eyebrow">Your care, by condition</p><h1>Every condition. Every visit. One clear record.</h1><p class="muted tagline"><b>Appointments and insurance getting out of hand?</b> Appts keeps the appointments, insurance, and progress for each condition in one place.</p></div><div class="actions"><button class="primary" type="button" data-action="add-condition">+ Add condition</button></div></div>
    <div style="margin:0 0 26px">${searchBox('overview-search', q, 'Search all records', 'Search doctors, visits, reference numbers, notes…')}</div><div id="overview-body">${body}</div>`;
  bindSearch('overview-search', v => { ui.overviewQuery = v; });
}

// ---- condition workspace --------------------------------------------------------------
function renderCondition(id) {
  const doc = store.doc, c = doc.conditions.find(x => x.id === id);
  if (!c) { app.innerHTML = '<div class="empty"><h2>Condition not found</h2><p><a href="#/">Back to all conditions</a></p></div>'; return; }
  const f = ui.condition;
  if (f.id !== id) Object.assign(f, { id, typeIds: new Set(), tagIds: new Set(), query: '' });
  const all = doc.entries.filter(e => e.conditionId === id);
  const presentTypes = S.sortTypes(doc.types.filter(t => all.some(e => e.typeId === t.id)));
  const presentTags = doc.tags.filter(t => all.some(e => (e.tagIds || []).includes(t.id)));
  const shown = S.filterEntries(doc, { conditionId: id, typeIds: [...f.typeIds], tagIds: [...f.tagIds], query: f.query });
  const filtered = f.typeIds.size || f.tagIds.size || f.query.trim();
  const sections = S.sortTypes(doc.types).map(t => {
    const list = shown.filter(e => e.typeId === t.id);
    if (!list.length) return '';
    list.sort((a, b) => (S.primaryDate(t, b) || '').localeCompare(S.primaryDate(t, a) || '') || a.title.localeCompare(b.title));
    return `<section class="type-section" id="sec-${esc(t.id)}"><div class="section-heading"><h2>${typeBadge(t)} ${esc(t.name)} <small>${list.length}</small></h2>${t.archived ? '<span class="badge archived">Archived type</span>' : `<button type="button" data-action="add-entry" data-id="${esc(t.id)}">+ Add ${esc(t.singular.toLowerCase())}</button>`}</div><ul class="entry-list">${list.map(entryRow).join('')}</ul></section>`;
  }).join('');
  const unused = S.activeTypes(doc).filter(t => !all.some(e => e.typeId === t.id));
  const next = S.upcoming(doc, { conditionId: id, limit: 5, onePerEntry: true });
  const hhCond = S.homeHealthAuths(doc, { conditionId: id });
  app.innerHTML = `<nav class="breadcrumb" aria-label="Breadcrumb"><a href="#/">← All conditions</a></nav>
    <div class="condition-head" style="border-bottom-color:${esc(c.color)}"><div><p class="eyebrow"><span class="badge ${esc(c.status)}">${esc(c.status)}</span>${c.diagnosedOn ? ` · Diagnosed ${esc(S.formatDate(c.diagnosedOn))}` : ''}</p><h1>${condNameHTML(c)}</h1>${c.summary ? `<p class="muted" style="margin:0">${esc(c.summary)}</p>` : ''}</div>
    <div class="actions"><label class="skip" for="add-type">Add entry of type</label><select id="add-type" style="width:auto;margin:0"><option value="">+ Add entry…</option>${S.activeTypes(doc).map(t => `<option value="${esc(t.id)}">${esc(t.singular)}</option>`).join('')}</select><button type="button" class="memo-btn" data-action="open-memo" data-id="${esc(c.id)}" title="Notes to yourself: documents to add, to-dos">Memo${String(c.memo || '').trim() ? '<span class="memo-dot" aria-label=" (has notes)"></span>' : ''}</button>${S.highlightsFor(doc, c.id).length ? '' : `<button type="button" data-action="add-highlight" data-id="${esc(c.id)}" title="Add a clinical significance highlight">+ Highlight</button>`}<button type="button" data-action="edit-condition" data-id="${esc(c.id)}">Edit condition</button><a class="button" href="#/timeline" data-action="timeline-for" data-id="${esc(c.id)}">Timeline</a></div></div>
    <div class="workspace"><div>
      ${S.conditionDescription(c) ? `<section class="cond-desc-block" aria-label="Condition description"><p class="eyebrow">About this condition</p><p class="cond-desc-text">${esc(S.conditionDescription(c))}</p></section>` : ''}
      ${highlightsHTML(doc, c)}
      <div class="filters" aria-label="Filter this condition"><div class="row">${searchBox('cond-search', f.query, 'Search this condition', 'Search this condition…')}<span class="filter-summary">${filtered ? `Showing ${shown.length} of ${all.length}` : plural(all.length, 'entry', 'entries')}</span>${filtered ? '<button type="button" class="link" data-action="clear-cond-filters">Clear filters</button>' : ''}<span class="fp-spacer"></span>${quickPreviewToggle()}</div>
      ${presentTypes.length > 1 ? `<div class="row chips"><span class="chip-label">Types</span>${presentTypes.map(t => typeChip(t, all.filter(e => e.typeId === t.id).length, f.typeIds.has(t.id), 'cond-type')).join('')}</div>` : ''}
      ${presentTags.length ? `<div class="row chips"><span class="chip-label">Tags</span>${presentTags.map(t => tagFilterChip(t, all.filter(e => (e.tagIds || []).includes(t.id)).length, f.tagIds.has(t.id), 'cond-tag')).join('')}</div>` : ''}</div>
      ${sections || (all.length ? '<div class="empty"><p>No entries match these filters.</p></div>' : `<div class="empty"><h2>Nothing recorded yet</h2><p class="muted">Start with the doctor you see for this condition, or your next visit.</p></div>`)}
      ${unused.length ? `<div class="rule"><h3>Add another kind of record</h3><div class="add-more">${unused.map(t => `<button type="button" data-action="add-entry" data-id="${esc(t.id)}">${typeBadge(t, 'sm')} ${esc(t.singular)}</button>`).join('')}</div></div>` : ''}
    </div><aside>
      ${hhCond.length ? `<section aria-labelledby="cond-hh"><h2 id="cond-hh">Home health</h2>${hhCond.map(a => hhPanel(a.entry, { compact: true, showCondition: false })).join('')}</section>` : ''}
      <section aria-labelledby="cond-next"><h2 id="cond-next">Next up</h2>${next.length ? `<ul class="event-list">${next.map(ev => eventRow(ev, { compact: true })).join('')}</ul>` : '<p class="muted">Nothing upcoming.</p>'}</section>
      <section aria-labelledby="cond-notes"><div class="section-heading"><h2 id="cond-notes">Condition notes</h2><button type="button" data-action="edit-condition" data-id="${esc(c.id)}">Edit</button></div>${c.notes?.html || c.notes?.text ? `<div class="note-content">${noteHTML(c.notes)}</div>` : '<p class="muted">No notes yet.</p>'}${c.attachments?.length ? `<h2 style="margin-top:14px">Documents</h2>${attachmentsHTML(c.attachments)}` : ''}</section>
      ${all.length === 0 ? `<section><button type="button" class="danger" data-action="delete-condition" data-id="${esc(c.id)}">Delete this empty condition</button></section>` : ''}
    </aside></div>`;
  bindSearch('cond-search', v => { f.query = v; });
  document.querySelector('#add-type').onchange = e => { const t = e.target.value; e.target.value = ''; if (t) openEntryForm(null, { typeId: t, conditionId: id }); };
}

// ---- timeline + upcoming -----------------------------------------------------------------
function timelineEvents() {
  const t = ui.timeline, today = S.today();
  let events = S.allEvents(store.doc, { conditionId: t.conditionId });
  if (t.range === 'past') events = events.filter(e => e.date < today);
  if (t.range === 'upcoming') events = events.filter(e => e.date >= today);
  return events;
}
function renderTimeline() {
  const doc = store.doc, t = ui.timeline, today = S.today();
  const all = timelineEvents(), dis = S.disruptionFilter(doc);
  const disOf = ev => S.isDisruption(doc, S.entryById(doc, ev.entryId), dis);
  if (!t.disruptions) t.disEdit = false;
  // Disruptions preset narrows the timeline; Edit Disruption mode shows everything, grayed unless in it.
  const base = t.disruptions && !t.disEdit ? all.filter(disOf) : all;
  // Chips come only from what is on this timeline (t4u-appts); drop stale selections.
  const types = S.timelineTypes(doc, base), tags = S.timelineTags(doc, base);
  for (const id of t.typeIds) if (!types.some(x => x.type.id === id)) t.typeIds.delete(id);
  for (const id of t.tagIds) if (!tags.some(x => x.tag.id === id)) t.tagIds.delete(id);
  const events = S.filterEvents(doc, base, { typeIds: [...t.typeIds], tagIds: [...t.tagIds], query: t.query });
  const asc = t.range === 'upcoming', ordered = asc ? events : [...events].reverse();
  const months = new Map();
  for (const ev of ordered) { const m = ev.date.slice(0, 7); if (!months.has(m)) months.set(m, []); months.get(m).push(ev); }
  let markerPlaced = t.range !== 'all';
  const monthHTML = [...months].map(([m, list]) => {
    const rows = list.map(ev => {
      let marker = '';
      if (!markerPlaced && ev.date < today) { markerPlaced = true; marker = '<li class="today-marker" aria-label="Today">Today</li>'; }
      if (!t.disEdit) return marker + eventRow(ev);
      const inIt = disOf(ev), title = esc(ev.title);
      return marker + eventRow(ev).replace('<li>', `<li class="dis-row ${inIt ? 'dis-in' : 'dis-out'}">`)
        .replace('data-action="open-entry"', `data-action="dis-toggle" aria-pressed="${inIt}" title="${inIt ? `Remove “${title}” from Disruptions` : `Add “${title}” to Disruptions`}"`)
        .replace(/<\/button><\/li>$/, `<span class="dis-mark" aria-hidden="true">${inIt ? '✓ In Disruptions' : '+ Add'}</span></button></li>`);
    }).join('');
    return `<section class="month"><h3><span>${esc(new Date(`${m}-15T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))}</span><span>${plural(list.length, 'item')}</span></h3><ul class="event-list">${rows}</ul></section>`;
  }).join('');
  const filtered = t.typeIds.size || t.tagIds.size || t.query.trim();
  const disCount = all.filter(disOf).length;
  // Filter panel (t50u): Views / Filter / Types / Tags rows with one label column, then a result line.
  const views = S.savedViews(doc), activeView = views.find(v => S.viewIsActive(doc, v, t));
  const changed = t.typeIds.size || t.tagIds.size || t.disruptions || t.conditionId || t.range !== 'all';
  const viewChip = v => { const on = S.viewIsActive(doc, v, t); return `<span class="view-chip-wrap${on ? ' on' : ''}"><button type="button" class="view-chip" data-action="tl-view" data-id="${esc(v.id)}" aria-pressed="${on}" title="Show the saved view “${esc(v.name)}”">★ ${esc(v.name)}</button><button type="button" class="view-del" data-action="tl-view-del" data-id="${esc(v.id)}" aria-label="Delete saved view “${esc(v.name)}”" title="Delete this saved view">×</button></span>`; };
  const fpRow = (label, body, attrs = '') => `<div class="fp-row"${attrs}><span class="fp-label">${label}</span><div class="fp-body">${body}</div></div>`;
  const viewsRow = fpRow('Views', `<span class="view-group" id="tl-presets"><button type="button" class="view-chip all-chip" data-action="tl-all" aria-pressed="${S.timelineIsDefault(t)}" title="Turn off every view and filter">All entries</button><button type="button" class="view-chip dis-chip" data-action="tl-disruptions" aria-pressed="${t.disruptions}" title="Insurance denials, missed and cancelled visits, delays, appeals, and other disruptions">⚠ Disruptions <span class="count">${disCount}</span></button></span>${views.map(viewChip).join('')}${changed && !activeView ? '<button type="button" class="link fp-save" data-action="tl-view-save">+ Save current view</button>' : ''}${t.disruptions ? `<button type="button" class="dis-edit" data-action="tl-dis-edit" aria-pressed="${t.disEdit}">${t.disEdit ? 'Done editing' : 'Edit Disruption mode'}</button>` : ''}`, ' id="tl-views"');
  const filterRow = fpRow('<label for="tl-cond">Filter</label>', `<select id="tl-cond"><option value="">All conditions</option>${liveConditions().map(c => `<option value="${esc(c.id)}"${condOptionAttrs(c)}${c.id === t.conditionId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <div class="segmented" role="group" aria-label="Range">${[['all', 'All'], ['upcoming', 'Upcoming'], ['past', 'Past']].map(([v, l]) => `<button type="button" data-action="tl-range" data-id="${v}" aria-pressed="${t.range === v}">${l}</button>`).join('')}</div>
      ${searchBox('tl-search', t.query, 'Search the timeline', 'Search the timeline…')}`, ' id="tl-filter"');
  const typesRow = fpRow('Types', `<div class="fp-chips" id="tl-types">${types.map(x => typeChip(x.type, x.count, t.typeIds.has(x.type.id), 'tl-type')).join('') || '<span class="muted">No dated entries yet.</span>'}</div>`);
  const tagsRow = tags.length ? fpRow('Tags', `<div class="fp-chips" id="tl-tags">${tags.map(x => tagFilterChip(x.tag, x.count, t.tagIds.has(x.tag.id), 'tl-tag')).join('')}</div>${t.tagIds.size > 1 ? '<span class="filter-summary">Showing items with all selected tags</span>' : ''}`) : '';
  // Result line: how many, and what is narrowing it, with one way out.
  const cond = t.conditionId && doc.conditions.find(c => c.id === t.conditionId);
  const by = [activeView ? `view “${activeView.name}”` : t.disruptions ? 'disruptions' : '', cond ? `condition ${cond.name}` : '', t.range !== 'all' ? t.range : '',
    ...[...t.typeIds].map(id => `type ${S.typeById(doc, id)?.name || id}`), ...[...t.tagIds].map(id => `tag ${S.tagDisplayLabel(doc, doc.tags.find(x => x.id === id))}`), t.query.trim() ? `search “${t.query.trim()}”` : ''].filter(Boolean);
  const count = t.disEdit ? `${disCount} of ${plural(all.length, 'entry', 'entries')} in disruptions` : `${events.length === all.length ? plural(all.length, 'entry', 'entries') : `${events.length} of ${plural(all.length, 'entry', 'entries')}`}${by.length ? ` · filtered by ${by.map(esc).join(', ')}` : ''}`;
  const result = `<div class="fp-result"><span class="filter-summary" id="tl-count">${count}</span>${filtered ? '<button type="button" class="link" data-action="tl-clear">Clear filters</button>' : by.length ? '<button type="button" class="link" data-action="tl-all">Show all entries</button>' : ''}<span class="fp-spacer"></span>${quickPreviewToggle()}</div>`;
  app.innerHTML = `<div class="page-heading"><div><p class="eyebrow">Everything, in order</p><h1>Timeline</h1><p class="muted">Every dated field becomes an event: visits, follow-ups, authorization expirations, appeal deadlines, reorder dates, treatment courses.</p></div></div>
    <div class="filters fp" aria-label="Timeline filters">${viewsRow}${t.disEdit ? '<p class="dis-banner" role="status"><b>Edit Disruption mode.</b> Grayed-out items are not in the Disruptions filter. Click one to add it, or click an item that is in to take it out. Changes save right away.</p>' : ''}${filterRow}${typesRow}${tagsRow}${result}</div>
    ${monthHTML || '<div class="empty"><p>No timeline items match.</p></div>'}`;
  document.querySelector('#tl-cond').onchange = e => { t.conditionId = e.target.value; renderTimeline(); };
  bindSearch('tl-search', v => { t.query = v; });
}
// Saved views (t27u): named filter sets on the Timeline. One click restores types, tags, the
// Disruptions toggle, condition, and range; clicking the active one again turns it off (t45u).
function renderUpcoming() {
  const doc = store.doc, today = S.today(), events = S.upcoming(doc);
  const groups = [['Today', e => e.date === today], ['Next 7 days', e => e.date > today && e.date <= S.addDays(today, 7)], ['Next 30 days', e => e.date > S.addDays(today, 7) && e.date <= S.addDays(today, 30)], ['Later', e => e.date > S.addDays(today, 30)]];
  app.innerHTML = `<div class="page-heading"><div><p class="eyebrow">What's coming</p><h1>Upcoming</h1><p class="muted">Appointments, follow-ups, care due, authorizations expiring, appeal deadlines, and reorders, soonest first.</p></div></div>
    ${events.length ? groups.map(([title, test]) => { const list = events.filter(test); return list.length ? `<section class="month"><h3><span>${title}</span><span>${plural(list.length, 'item')}</span></h3><ul class="event-list">${list.map(ev => eventRow(ev)).join('')}</ul></section>` : ''; }).join('') : '<div class="empty"><h2>Nothing upcoming</h2><p class="muted">Add a visit with a date, or a follow-up date, and it shows here.</p></div>'}`;
}

// ---- documents ---------------------------------------------------------------------------
function renderDocuments() {
  const doc = store.doc, d = ui.docs, all = D.documentList(doc);
  const inCondition = D.filterDocuments(all, { conditionId: d.conditionId });
  const kinds = D.documentKinds(inCondition), labels = D.documentLabels(doc, inCondition);
  for (const k of d.kinds) if (!kinds.some(x => x.kind === k)) d.kinds.delete(k);
  for (const l of d.labelIds) if (!labels.some(x => x.label.id === l)) d.labelIds.delete(l);
  const shown = D.filterDocuments(all, { kinds: [...d.kinds], labelIds: [...d.labelIds], conditionId: d.conditionId, query: d.query });
  const card = x => `<li class="doc-card" data-doc-kind="${x.kind}" data-doc-label="${esc(x.labelId)}"><button type="button" class="preview" data-action="view-file" data-id="${esc(x.file.id)}" data-name="${esc(x.file.name)}" data-kind="${x.kind}" aria-label="View ${esc(x.file.name)}">${x.kind === 'pdf' ? '<span class="pdf-tile" aria-hidden="true">PDF</span>' : `<img src="${esc(imageURL(x.file.id))}" alt="" loading="lazy">`}</button><div class="info"><strong>${esc(x.file.name)}</strong><span><span class="badge">${esc(D.labelById(doc, x.labelId).label)}</span> <small class="muted">${D.KIND_NAMES[x.kind]}${x.file.bytes ? ` · ${D.formatBytes(x.file.bytes)}` : ''}</small></span><span class="owner">${x.owner.kind === 'entry' ? `<button type="button" class="link" data-action="open-entry" data-id="${esc(x.owner.id)}">${esc(S.typeById(doc, x.owner.typeId)?.singular || 'Entry')}: ${esc(x.owner.title)}</button>${(() => { const ic = itemIcons({ highlight: S.entryById(doc, x.owner.id)?.highlight }); return ic.html; })()}` : `<a href="#/c/${esc(x.owner.id)}">Condition record</a>`}<br>${esc(x.conditionName)}${x.file.addedAt ? ` · Added ${relLabel(String(x.file.addedAt).slice(0, 10))}` : ''}</span></div></li>`;
  const groups = D.groupDocuments(doc, shown, d.group);
  const filtered = d.kinds.size || d.labelIds.size || d.query.trim();
  app.innerHTML = `<div class="page-heading"><div><p class="eyebrow">Lab results, notes, letters, photos</p><h1>Documents</h1><p class="muted">Every PDF and image you've attached, across all conditions. Filter by file type and by label, then open one to view it or jump to the record it belongs to.</p></div><div class="actions"><button class="primary" type="button" data-action="quick-upload">+ Upload documents</button></div></div>
    <div class="filters" aria-label="Document filters"><div class="row"><label class="skip" for="doc-cond">Condition</label><select id="doc-cond"><option value="">All conditions</option>${liveConditions().map(c => `<option value="${esc(c.id)}"${condOptionAttrs(c)}${c.id === d.conditionId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>${searchBox('doc-search', d.query, 'Search documents', 'Search file names…')}<div class="segmented" role="group" aria-label="Group by">${[['label', 'Group by label'], ['kind', 'Group by file type']].map(([v, l]) => `<button type="button" data-action="doc-group" data-id="${v}" aria-pressed="${d.group === v}">${l}</button>`).join('')}</div></div>
      <div class="row chips" id="doc-kinds"><span class="chip-label">File type</span>${kinds.map(k => `<button type="button" class="chip text-only" data-action="doc-kind" data-id="${k.kind}" aria-pressed="${d.kinds.has(k.kind)}">${k.label}<span class="count">${k.count}</span></button>`).join('') || '<span class="muted">No uploads yet.</span>'}</div>
      ${labels.length ? `<div class="row chips" id="doc-labels"><span class="chip-label">Label</span>${labels.map(x => `<button type="button" class="chip text-only" data-action="doc-label" data-id="${esc(x.label.id)}" aria-pressed="${d.labelIds.has(x.label.id)}">${esc(x.label.label)}<span class="count">${x.count}</span></button>`).join('')}</div>` : ''}
      <div class="row"><span class="filter-summary" id="doc-count">${filtered ? `Showing ${shown.length} of ${inCondition.length}` : plural(inCondition.length, 'document')}</span>${filtered ? '<button type="button" class="link" data-action="doc-clear">Clear filters</button>' : ''}</div></div>
    ${groups.map(g => `<section><div class="section-heading"><h2>${esc(g.title)}</h2><span class="muted">${plural(g.items.length, 'file')}</span></div><ul class="doc-grid">${g.items.map(card).join('')}</ul></section>`).join('') || `<div class="empty"><h2>${all.length ? 'No documents match' : 'No documents yet'}</h2><p class="muted">Upload lab results, consultation notes, referral letters, or photos. You can also paste or drop them into any entry.</p></div>`}`;
  document.querySelector('#doc-cond').onchange = e => { d.conditionId = e.target.value; renderDocuments(); };
  bindSearch('doc-search', v => { d.query = v; });
}

// ---- render + actions ------------------------------------------------------------------
function bindSearch(id, set) {
  const input = document.querySelector(`#${id}`); if (!input) return;
  let timer;
  input.oninput = () => { clearTimeout(timer); timer = setTimeout(() => { set(input.value); render(); const again = document.querySelector(`#${id}`); again.focus(); again.setSelectionRange(again.value.length, again.value.length); }, 180); };
}
function render() {
  if (!store.account) return renderLogin();
  renderChrome();
  const { view, id } = route();
  if (view === 'c') renderCondition(id);
  else if (view === 'timeline') renderTimeline();
  else if (view === 'upcoming') renderUpcoming();
  else if (view === 'documents') renderDocuments();
  else if (view === 'types') app.innerHTML = renderTypes();
  else renderOverview();
}
store.render = render;

async function action(name, id, el) {
  const doc = store.doc;
  switch (name) {
    case 'open-entry': return openEntryDetail(id);
    case 'open-mention': {
      // @mention chip in a note: open the document, entry, or condition it points at.
      const kind = el.dataset.mention, doc = store.doc;
      if (kind === 'file') { const f = D.documentList(doc).find(d => d.file.id === id); return f ? openViewer(id, f.file.name, f.kind) : notice('That document is no longer attached to anything.'); }
      if (kind === 'entry') return S.entryById(doc, id) ? openEntryDetail(id) : notice('That entry was deleted.');
      if (kind === 'condition') { if (!doc.conditions.some(c => c.id === id)) return notice('That condition was deleted.'); closeDialog(); location.hash = `#/c/${id}`; return; }
      return;
    }
    case 'open-highlight': return openHighlight(id);
    case 'add-highlight': return openHighlightForm(null, id);
    case 'edit-highlight': return openHighlightForm((doc.highlights || []).find(h => h.id === id));
    case 'delete-highlight': return deleteHighlight(id);
    case 'cs-toggle': toggleHighlights(id); return render();
    case 'edit-entry': return openEntryForm(S.entryById(doc, id));
    case 'delete-entry': return deleteEntry(id);
    case 'add-entry': return openEntryForm(null, { typeId: id, conditionId: route().id });
    case 'goto-condition': closeDialog(); location.hash = `#/c/${id}`; return;
    case 'add-condition': return openConditionForm(null);
    case 'edit-condition': return openConditionForm(doc.conditions.find(c => c.id === id));
    case 'open-memo': return openMemo(id);
    case 'delete-condition': if (confirm('Delete this empty condition?')) { await save([remove('condition', id)], 'Condition deleted.'); location.hash = '#/'; } return;
    case 'cond-type': toggle(ui.condition.typeIds, id); return render();
    case 'cond-tag': toggle(ui.condition.tagIds, id); return render();
    case 'clear-cond-filters': Object.assign(ui.condition, { typeIds: new Set(), tagIds: new Set(), query: '' }); return render();
    case 'timeline-for': ui.timeline.conditionId = id; return;
    case 'tl-range': ui.timeline.range = id; return render();
    case 'tl-type': toggle(ui.timeline.typeIds, id); return render();
    case 'tl-tag': toggle(ui.timeline.tagIds, id); return render();
    case 'tl-disruptions': ui.timeline.disruptions = !ui.timeline.disruptions; ui.timeline.disEdit = false; return render();
    case 'tl-dis-edit': if (ui.timeline.disruptions) ui.timeline.disEdit = !ui.timeline.disEdit; return render();
    case 'dis-toggle': {
      const f = S.toggleDisruption(store.doc, id), added = f.include.includes(id) || !f.exclude.includes(id) && S.disruptionByRule(store.doc, S.entryById(store.doc, id));
      await save([put('filter', f)], added ? 'Added to Disruptions.' : 'Removed from Disruptions.');
      document.querySelector(`[data-action="dis-toggle"][data-id="${CSS.escape(id)}"]`)?.focus();
      return;
    }
    case 'tl-view': {
      // Clicking the view that is on turns it off again (t45u), back to everything.
      const v = S.savedViews(store.doc).find(x => x.id === id); if (!v) return;
      Object.assign(ui.timeline, S.viewIsActive(store.doc, v, ui.timeline) ? S.defaultTimelineState() : { ...S.stateFromView(store.doc, v), query: '', disEdit: false }); return render();
    }
    case 'tl-all': Object.assign(ui.timeline, S.defaultTimelineState()); return render();
    case 'tl-view-save': {
      const name = (prompt('Name this view (for example “Blocked / hiccups”):') || '').trim(); if (!name) return;
      const v = S.viewFromState(store.doc, name, ui.timeline);
      await save([put('filter', v)], `Saved view “${v.name}”.`); return;
    }
    case 'tl-view-del': {
      const v = S.savedViews(store.doc).find(x => x.id === id); if (!v || !confirm(`Delete the saved view “${v.name}”? Entries are not affected.`)) return;
      await save([remove('filter', id)], 'Saved view deleted.'); return;
    }
    case 'toggle-quick-preview': return setQuickPreview(!quickPreviewOn());
    case 'tl-clear': Object.assign(ui.timeline, { typeIds: new Set(), tagIds: new Set(), query: '' }); return render();
    case 'doc-kind': toggle(ui.docs.kinds, id); return render();
    case 'doc-label': toggle(ui.docs.labelIds, id); return render();
    case 'doc-group': ui.docs.group = id; return render();
    case 'doc-clear': Object.assign(ui.docs, { kinds: new Set(), labelIds: new Set(), query: '' }); return render();
    case 'quick-upload': return openQuickUpload(ui.docs.conditionId);
    case 'view-file': return openViewer(id, el.dataset.name, el.dataset.kind);
    case 'new-type': return openTypeEditor(null);
    case 'edit-type': return openTypeEditor(id);
    case 'reset-demo':
      if (queueing()) return notice('Turn Offline mode off and sync your changes before restoring the demo records.');
      if (!confirm('Restore the synthetic demo records? Changes made in the demo account are replaced.')) return;
      store.doc = (await api('reset-demo', { body: {} })).doc; render(); return notice('Demo records restored.');
    case 'logout': {
      if (!(await offline.beforeLogout())) return;
      const username = store.account.username;
      await api('logout', { body: {} }); await offline.afterLogout(username);
      store.account = null; store.doc = null; closeDialog(); location.hash = '#/'; return render();
    }
  }
}
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.mention[data-action]')) { e.preventDefault(); e.target.click(); } });
document.addEventListener('click', e => {
  const t = e.target.closest('[data-action]');
  if (t) {
    if (t.tagName === 'A' && t.dataset.action !== 'timeline-for') e.preventDefault();
    action(t.dataset.action, t.dataset.id, t).catch(handleError);
    return;
  }
  const card = e.target.closest('[data-open-condition]');
  if (card && !e.target.closest('a,button') && !getSelection()?.toString()) location.hash = `#/c/${card.dataset.openCondition}`;
});
function handleError(err) {
  if (err instanceof AuthError) { store.account = null; closeDialog(); renderLogin(); return notice(err.message); }
  notice(`Could not save: ${err.message}`);
}
window.addEventListener('hashchange', () => { if (store.account) { closeDialog(); closeDialog(document.querySelector('#viewer')); render(); app.focus({ preventScroll: true }); window.scrollTo(0, 0); } });
window.addEventListener('focus', () => { if (store.account && !document.querySelector('dialog[open]') && !document.activeElement?.matches('input,textarea,select,[contenteditable=true]')) load().catch(() => {}); });

async function load() {
  const result = await api('data');
  // Changes kept on this device (Offline mode) sit on top of the server or saved copy until sync.
  store.account = result.account; store.doc = await withPending(result.account, result.doc); render();
}
async function boot() {
  try {
    const { account } = await api('session');
    if (account) { await load(); offline.checkVersion(); } else renderLogin();
  } catch (err) {
    if (err instanceof AuthError) return renderLogin();
    app.innerHTML = `<section class="login"><h1>Could not open your records</h1><p>${esc(err.message)}</p><button id="retry" class="primary">Retry</button></section>`;
    document.querySelector('#retry').onclick = boot;
  }
}
offline.initOffline().finally(boot);
