/** Regression tests: skip start screen and open editor directly. */
export async function addBypassStart(page) {
  await page.addInitScript(() => {
    try { localStorage.setItem('utalis_start_choice_v1', 'guest'); } catch (_) { /* ignore */ }
  });
}
