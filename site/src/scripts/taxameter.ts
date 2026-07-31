document.addEventListener('DOMContentLoaded', () => {
  const el = document.querySelector<HTMLElement>('[data-taxameter]');
  if (!el) return;

  const target = parseFloat(el.dataset.taxameter ?? '0');
  const duration = 1100;
  const startTime = performance.now();

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  function easeOutQuart(t: number): number {
    return 1 - Math.pow(1 - t, 4);
  }

  function formatValue(val: number): string {
    if (val >= 1000) {
      const mdkr = val / 1000;
      const nbsp = "\u00A0";
      if (mdkr >= 10) {
        return Math.round(mdkr).toString().replace(/\B(?=(\d{3})+(?!\d))/g, nbsp) + " mdkr";
      }
      return mdkr.toFixed(1).replace(".", ",") + " mdkr";
    }
    return Math.round(val).toLocaleString("sv-SE") + " mkr";
  }

  function tick(now: number) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const current = target * easeOutQuart(progress);
    el.textContent = formatValue(current);
    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      el.textContent = formatValue(target);
    }
  }

  requestAnimationFrame(tick);
});
