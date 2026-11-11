/* Shared helpers. */
export const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
/* Portable own-property check (the newer built-in needs Safari 15.4 / Firefox 92). */
export const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
