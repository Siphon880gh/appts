// The signed-in account and its document. Every change goes through save(), which sends
// ops to api.php (validated, locked, atomically written) and re-renders from the reply.
// In Offline mode the ops are applied locally and queued (js/outbox.js) until sync.
import { api } from './api.js';
import { queueing, queueOps, readState } from './outbox.js';
export const store = { account: null, doc: null, render: () => {} };
let noticeTimer;
export function notice(message) {
  clearTimeout(noticeTimer);
  const el = document.querySelector('#status'); el.textContent = message;
  noticeTimer = setTimeout(() => { el.textContent = ''; }, 6000);
}
export async function save(ops, message = 'Saved.') {
  if (queueing()) {
    // Offline mode (or changes still waiting to sync): keep it on this device until sync.
    store.doc = await queueOps(store.doc, ops); store.render();
    notice(readState().on ? `${message} Kept on this device; it syncs after you turn Offline mode off.` : `${message} Kept on this device with your other offline changes. Open Offline in the header to sync.`);
    document.dispatchEvent(new CustomEvent('appts-queued'));
    return store.doc;
  }
  const { doc } = await api('ops', { body: { ops } });
  store.doc = doc; store.render(); notice(message);
  return doc;
}
export const put = (kind, value) => ({ op: 'put', kind, value });
export const remove = (kind, id) => ({ op: 'delete', kind, id });
