// Header "…" menu (t19u): the account and demo options, collapsed behind one button so the
// header keeps only navigation and Offline mode. WAI-ARIA menu button pattern:
// Enter/Space/↓ open on the first item, ↑ on the last; ↑/↓/Home/End move; Esc closes and returns
// focus; Tab, an outside click, choosing an item, or navigating closes it.
import { esc } from './ui.js';

export function moreMenuHTML(account) {
  const demo = account.isDemo;
  return `<div class="more-wrap"><button type="button" class="more-btn" id="more-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="more-menu" aria-label="More: account${demo ? ' and demo' : ''} options" title="More"><span aria-hidden="true">…</span></button>
<div class="more-menu" id="more-menu" role="menu" aria-labelledby="more-btn" hidden>
<div class="more-who" role="presentation"><span class="more-avatar" aria-hidden="true">${esc((account.displayName || account.username || '?').trim().charAt(0).toUpperCase())}</span><span><b>${esc(account.displayName)}</b><small>Signed in as ${esc(account.username)}</small></span></div>
${demo ? `<p class="more-group" role="presentation">Demo</p><button type="button" role="menuitem" tabindex="-1" data-action="reset-demo">Reset demo data<small>Restore the sample patient's records</small></button>` : ''}
<hr role="separator"><button type="button" role="menuitem" tabindex="-1" data-action="logout">Sign out</button>
</div></div>`;
}

const btn = () => document.querySelector('#more-btn'), menu = () => document.querySelector('#more-menu');
const items = () => [...(menu()?.querySelectorAll('[role=menuitem]') || [])];

export function openMenu(focus = 'first') {
  const b = btn(), m = menu(); if (!b || !m) return;
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
  if (e.target.closest('#more-menu [role=menuitem]')) return closeMenu();  // the item's own data-action still runs
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
