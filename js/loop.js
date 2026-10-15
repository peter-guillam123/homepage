// One loop for the board and the map. It advances on a timer and pauses only for a reason
// a reader can see: the mouse resting on the panel, keyboard focus inside it, the page in
// a background tab, or the panel scrolled out of view. A pause says "paused" next to the
// count, so it never looks random. Touch never pauses it; a tap is a choice, not a rest.
export function makeLoop({ root, restEls, period, bar, tick, reduced }) {
  let timer = null;
  let allowed = true;
  const why = new Set();
  const restartBar = () => { if (!bar) return; bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; };
  const sync = () => {
    const run = allowed && !reduced && why.size === 0;
    root.classList.toggle('is-paused', !run && allowed && !reduced);
    if (run && !timer) { timer = setInterval(tick, period); restartBar(); }
    if (!run && timer) { clearInterval(timer); timer = null; }
  };
  const pause = (k) => { why.add(k); sync(); };
  const resume = (k) => { why.delete(k); sync(); };

  for (const el of restEls) {
    el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') pause('rest'); });
    el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') resume('rest'); });
  }
  root.addEventListener('focusin', (e) => { if (e.target.matches(':focus-visible')) pause('focus'); });
  root.addEventListener('focusout', () => resume('focus'));
  const onVisible = () => (document.hidden ? pause('hidden') : resume('hidden'));
  document.addEventListener('visibilitychange', onVisible);
  let seen = null;
  if ('IntersectionObserver' in window) {
    seen = new IntersectionObserver(([en]) => (en.isIntersecting ? resume('away') : pause('away')), { threshold: 0.25 });
    seen.observe(root);
  }

  return {
    // After a reader's own move: the slide has changed, so the clock starts again from nought.
    restart() { if (timer) { clearInterval(timer); timer = null; } sync(); restartBar(); },
    allow(v) { allowed = v; sync(); },
    // When the component is drawn again, the old loop must let go of its timer and watchers.
    destroy() { allowed = false; sync(); document.removeEventListener('visibilitychange', onVisible); seen?.disconnect(); },
    sync,
  };
}
