import { api } from './api.js';
export const IMAGE_ID = /^[a-f0-9]{64}\.(png|jpg|gif|webp)$/;
export const FILE_ID = /^[a-f0-9]{64}\.(png|jpg|gif|webp|pdf)$/;
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
export const DOCUMENT_TYPES = [...IMAGE_TYPES, 'application/pdf'];
export const DOCUMENT_ACCEPT = DOCUMENT_TYPES.join(',');
export function imageURL(id) { return IMAGE_ID.test(id || '') ? `api.php?action=image&id=${encodeURIComponent(id)}` : ''; }
export function fileURL(id, { name = '', download = false } = {}) {
  if (!FILE_ID.test(id || '')) return '';
  return `api.php?action=file&id=${encodeURIComponent(id)}${name ? `&name=${encodeURIComponent(name)}` : ''}${download ? '&download=1' : ''}`;
}
function check(file, allowed) {
  if (!allowed.includes(file.type)) throw Error(allowed.includes('application/pdf') ? 'Use a PDF, or a PNG, JPEG, GIF, or WebP image.' : 'Use a PNG, JPEG, GIF, or WebP image.');
  const max = file.type === 'application/pdf' ? 20 : 8;
  if (file.size > max * 1024 * 1024) throw Error(`Choose a ${file.type === 'application/pdf' ? 'PDF' : 'image'} smaller than ${max} MB.`);
}
async function send(file) {
  const form = new FormData(); form.append('file', file, file.name || (file.type === 'application/pdf' ? 'document.pdf' : 'pasted-image.png'));
  return (await api('upload', { form })).file;
}
export async function uploadImage(file) { check(file, IMAGE_TYPES); return send(file); }
export async function uploadFile(file) { check(file, DOCUMENT_TYPES); const stored = await send(file); return { ...stored, name: file.name || stored.name }; }
export async function listImages() { return (await api('images')).images; }
function filesFrom(transfer, accept) {
  if (!transfer) return [];
  const items = [...(transfer.items || [])].filter(i => i.kind === 'file' && accept(i.type)).map(i => i.getAsFile()).filter(Boolean);
  return items.length ? items : [...(transfer.files || [])].filter(f => accept(f.type));
}
/** Image files from a paste or drop event (clipboard screenshots arrive as items, drops as files). */
export const imageFiles = transfer => filesFrom(transfer, t => t.startsWith('image/'));
export const documentFiles = transfer => filesFrom(transfer, t => t.startsWith('image/') || t === 'application/pdf');
