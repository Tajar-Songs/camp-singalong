// lib/notify.js
//
// One shared way for any page to show a message (success, error, info).
// Pages call notify.success('Saved'), notify.error('Could not save - ...'),
// or notify.info('...'). The messages themselves are drawn once, by the app
// shell (_app.js), always just below the nav bar - so no page can end up
// with a message hidden underneath it, and every message looks the same.
//
// Style guide notes this follows:
//   - Never color alone: every message type also has its own icon and a
//     screen-reader label.
//   - Errors say why: pass the real reason whenever the page knows it.
//     Errors stay up longer than successes, and can be dismissed.

let counter = 0;

function send(text, type) {
  if (typeof window === 'undefined' || !text) return;
  counter += 1;
  window.dispatchEvent(new CustomEvent('app-notify', {
    detail: { id: `${Date.now()}-${counter}`, text: String(text), type }
  }));
}

export function notify(text, type = 'info') { send(text, type); }
notify.success = (text) => send(text, 'success');
notify.error = (text) => send(text, 'error');
notify.info = (text) => send(text, 'info');

// For pages not yet moved over: accepts the old "✅ ..." / "❌ ..." strings
// and turns them into the right message type, so a page can switch to the
// shared messages by changing one line (its showMessage function).
export function notifyLegacy(message) {
  if (!message) return;
  const text = String(message);
  if (text.startsWith('✅')) return send(text.replace(/^✅\s*/, ''), 'success');
  if (text.startsWith('❌')) return send(text.replace(/^❌\s*/, ''), 'error');
  return send(text, 'info');
}

export default notify;
