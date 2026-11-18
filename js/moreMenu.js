// Header "…" menu (t19u): the account and demo options, collapsed behind one button so the
// header keeps only navigation and Offline mode. When the navbar row has no room, the Offline
// group (toggle + (i)) moves in here too (t21u). WAI-ARIA menu button pattern:
// Enter/Space/↓ open on the first item, ↑ on the last; ↑/↓/Home/End move; Esc closes and returns
// focus; Tab, an outside click, choosing an item, or navigating closes it.
import { esc } from './ui.js';

export function moreMenuHTML(account) {
  const demo = account.isDemo;
  return `<div class="more-wrap"><button type="button" class="more-btn" id="more-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="more-menu" aria-label="More: account${demo ? ' and demo' : ''} options" title="More"><span aria-hidden="true">…</span></button>
<div class="more-menu" id="more-menu" role="menu" aria-labelledby="more-btn" hidden>
<div class="more-who" role="presentation"><span class="more-avatar" aria-hidden="true">${esc((account.displayName || account.username || '?').trim().charAt(0).toUpperCase())}</span><span><b>${esc(account.displayName)}</b><small>Signed in as ${esc(account.username)}</small></span></div>
<div class="more-offline" role="group" aria-label="Offline mode"><p class="more-group" role="presentation">Offline mode</p><button type="button" role="menuitem" tabindex="-1" class="more-offline-toggle" data-offline="panel">Offline mode <b class="more-offline-state">Off</b><span class="more-offline-count" hidden></span><small>Keep records on this device for clinics without internet</small></button><button type="button" role="menuitem" tabindex="-1" class="more-offline-info" data-offline="info"><span class="more-i" aria-hidden="true">i</span>What is Offline mode?</button></div>
${demo ? `<p class="more-group" role="presentation">Demo</p><button type="button" role="menuitem" tabindex="-1" data-action="reset-demo">Reset demo data<small>Restore the sample patient's records</small></button>` : ''}
<hr role="separator"><button type="button" role="menuitem" tabindex="-1" data-action="logout">Sign out</button>
</div></div>`;
}

const btn = () => document.querySelector('#more-btn'), menu = () => document.querySelector('#more-menu');
// Only the items on screen: the Offline items show only while the inline group is collapsed.
const items = () => [...(menu()?.querySelectorAll('[role=menuitem]') || [])].filter(b => b.getClientRects().length);

export function openMenu(focus = 'first') {
  const b = btn(), m = menu(); if (!b || !m) return;
  syncOffline();
  m.hidden = false; b.setAttribute('aria-expanded', 'true');
  // Keep it on screen on narrow phones: shift left or right if it would overflow.
  m.style.transform = '';
  const r = m.getBoundingClientRect(), pad = 8;
  const dx = r.left < pad ? pad - r.left : r.right > innerWidth - pad ? innerWidth - pad - r.right : 0;
  if (dx) m.style.transform = `translateX(${Math.round(dx)}px)`;
  const list = items(); (focus === 'last' ? list[list.length - 1] : list[0])?.focus();
}
export function closeMenu(returnFocus = false) {
  const b = btn(), m = menu(); if (!m || m.hidden) return;
  m.hidden = true; b?.setAttribute('aria-expanded', 'false');
  if (returnFocus) b?.focus();
}

document.addEventListener('click', e => {
  if (e.target.closest('#more-btn')) { return menu()?.hidden ? openMenu() : closeMenu(); }
  const item = e.target.closest('#more-menu [role=menuitem]');
  if (item) { fromMenu = item.hasAttribute('data-offline'); return closeMenu(); }  // the item's own data-action / data-offline still runs
  if (!e.target.closest('#more-menu')) closeMenu();
}, true);
document.addEventListener('keydown', e => {
  if (e.target === btn() && ['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); return openMenu(e.key === 'ArrowUp' ? 'last' : 'first'); }
  if (!e.target.closest?.('#more-menu')) return;
  const list = items(), i = list.indexOf(document.activeElement);
  const go = n => { e.preventDefault(); list[(n + list.length) % list.length]?.focus(); };
  if (e.key === 'ArrowDown') go(i + 1);
  else if (e.key === 'ArrowUp') go(i - 1);
  else if (e.key === 'Home') go(0);
  else if (e.key === 'End') go(list.length - 1);
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
  else if (e.key === 'Tab') closeMenu();
});
window.addEventListener('hashchange', () => closeMenu());

// ---- Offline group: inline at the far left of the navbar, or in this menu when there's no room (t21u)
const header = () => document.querySelector('body > header');
const narrow = matchMedia('(max-width: 640px)');  // fallback: phones always collapse, even before measuring
let fromMenu = false;

/** The menu's Offline items mirror the one real toggle (the inline pill, kept in the DOM while hidden). */
function syncOffline() {
  const pill = document.querySelector('#offline-slot .offline-pill'), item = document.querySelector('.more-offline-toggle');
  if (!pill || !item) return;
  const on = pill.classList.contains('on'), count = pill.querySelector('.offline-count')?.textContent || '';
  item.classList.toggle('on', on);
  item.querySelector('.more-offline-state').textContent = on ? 'On' : 'Off';
  const c = item.querySelector('.more-offline-count'); c.textContent = count; c.hidden = !count;
  item.setAttribute('aria-label', `Offline mode: ${on ? 'on' : 'off'}${count ? `, ${count} changes waiting to sync` : ''}`);
}

/** Inline fits when the Offline group, every main link, and "…" sit on one row. */
function fits(h) {
  const slot = h.querySelector('#offline-slot'), links = h.querySelectorAll('#nav a'), more = h.querySelector('#more-btn');
  if (!slot?.firstElementChild || !links.length || !more) return true;
  const mid = el => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; };
  const rows = [mid(slot), mid(links[0]), mid(links[links.length - 1]), mid(more)];
  return Math.max(...rows) - Math.min(...rows) <= 6 && h.scrollWidth <= h.clientWidth + 1;
}
export function fitHeader() {
  const h = header(); if (!h) return;
  const was = h.classList.contains('offline-collapsed');
  h.classList.remove('offline-collapsed');                 // measure the inline layout (same frame, so no flicker)
  const collapse = narrow.matches || !fits(h);
  h.classList.toggle('offline-collapsed', collapse);
  if (collapse !== was) { document.querySelector('#offline-slot')?.toggleAttribute('inert', collapse); syncOffline(); }
}

let lastWidth = 0, queued = false;
new ResizeObserver(entries => {
  const w = Math.round(entries[0].contentRect.width);
  if (w === lastWidth || queued) return;                    // only width matters; collapsing changes the height
  lastWidth = w; queued = true;
  requestAnimationFrame(() => { queued = false; fitHeader(); });  // after the observer callback: no resize loop
}).observe(header() || document.documentElement);
narrow.addEventListener?.('change', fitHeader);
document.addEventListener('appts-offline-chrome', () => { syncOffline(); fitHeader(); });
// After choosing an Offline item, focus returns to "…" when its dialog closes (the item itself is hidden).
document.querySelector('#offline-dialog')?.addEventListener('close', () => { if (fromMenu) { fromMenu = false; btn()?.focus(); } });
