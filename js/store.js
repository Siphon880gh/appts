// The signed-in account and its document. Every change goes through save(), which sends
// ops to api.php (validated, locked, atomically written) and re-renders from the reply.
import { api } from './api.js';
export const store = { account: null, doc: null, render: () => {} };
let noticeTimer;
export function notice(message) {
  clearTimeout(noticeTimer);
  const el = document.querySelector('#status'); el.textContent = message;
  noticeTimer = setTimeout(() => { el.textContent = ''; }, 6000);
}
export async function save(ops, message = 'Saved.') {
  const { doc } = await api('ops', { body: { ops } });
  store.doc = doc; store.render(); notice(message);
  return doc;
}
export const put = (kind, value) => ({ op: 'put', kind, value });
export const remove = (kind, id) => ({ op: 'delete', kind, id });
