// Thin client for api.php. Session cookie is HttpOnly + SameSite=Strict; writes add X-Appts.
export class AuthError extends Error {}
export async function api(action, { body, method, form } = {}) {
  const init = { method: method || (body || form ? 'POST' : 'GET'), credentials: 'same-origin', headers: { 'X-Appts': '1' } };
  if (form) init.body = form;
  else if (body !== undefined) { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
  let response;
  try { response = await fetch(`api.php?action=${encodeURIComponent(action)}`, init); }
  catch { throw Error('Could not reach the Appts server. Check that PHP is running.'); }
  let result;
  try { result = await response.json(); } catch { throw Error('The server did not answer with JSON. Serve Appts with PHP (php -S) and try again.'); }
  if (response.status === 401 && action !== 'login') throw new AuthError(result.error || 'Please sign in again.');
  if (!response.ok) throw Error(result.error || 'The request failed.');
  return result;
}
