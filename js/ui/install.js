/* SubSDJ · «Install as an app»: a button of our own for what Chrome and Edge hide in the address bar.
   When the browser finds the page installable (manifest.webmanifest) it fires `beforeinstallprompt`;
   holding on to that event is what lets a button of the page open the browser's own dialog later,
   with prompt() — it must come from a gesture, and each event serves once. So the buttons
   ([data-install]: one in the welcome window, one in the File menu) exist only while there is an
   event in hand: a browser that doesn't install (Firefox, Safari), an app already installed or the
   installed window itself never fire it, and there the buttons never show. */
let deferred = null;
let refresh = () => {};

export const canInstall = () => !!deferred;

// Opens the browser's dialog; resolves 'accepted', 'dismissed', or null when there was nothing to ask
export async function install() {
  const ev = deferred;
  if (!ev) return null;
  deferred = null; refresh();          // one use per event: accepted or not, this one is spent
  try { ev.prompt(); return (await ev.userChoice)?.outcome ?? null; } catch (err) { return null; }
}

export function initInstall() {
  const els = [...document.querySelectorAll('[data-install]')];
  refresh = () => { for (const el of els) el.hidden = !deferred; };
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; refresh(); });   // preventDefault: no banner of the browser's own, ours is the button
  addEventListener('appinstalled', () => { deferred = null; refresh(); });
  for (const el of els) el.addEventListener('click', () => { el.blur(); install(); });
  refresh();
}
