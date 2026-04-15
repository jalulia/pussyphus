// ════════════════════════════════════════
// TITLE SCREEN
// ════════════════════════════════════════

let el;

export function init() {
  el = document.getElementById('ts');
}

export function show() { el.classList.remove('off'); }
export function hide() { el.classList.add('off'); }
