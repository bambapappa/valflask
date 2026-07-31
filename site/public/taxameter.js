"use strict";
// Taxameter: räknar upp totalsiffran vid load. Kör bara när kostnadsestimaten
// är upplåsta (data-estimat="pa") — annars är siffran maskad och ska stå still.
// Lyssnar även på "estimat:pa" så uppräkningen startar i samma stund läsaren
// kvitterar grinden (DECISION_LOG 2026-07-21).
(() => {
  const nbsp = " ";

  function formatValue(val) {
    if (val >= 1000) {
      const mdkr = val / 1000;
      if (mdkr >= 10) {
        return Math.round(mdkr).toString().replace(/\B(?=(\d{3})+(?!\d))/g, nbsp) + " mdkr";
      }
      return mdkr.toFixed(1).replace(".", ",") + " mdkr";
    }
    return Math.round(val).toLocaleString("sv-SE") + " mkr";
  }

  function easeOutQuart(t) {
    return 1 - Math.pow(1 - t, 4);
  }

  function run() {
    const el = document.querySelector("[data-taxameter]");
    if (!el) return;
    if (document.documentElement.dataset.estimat !== "pa") return; // maskad — animera inte
    if (el.dataset.kord === "ja") return;
    el.dataset.kord = "ja";

    const target = parseFloat(el.dataset.taxameter ?? "0");

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = formatValue(target);
      return;
    }

    const duration = 1100;
    const startTime = performance.now();

    function tick(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      el.textContent = formatValue(target * easeOutQuart(progress));
      if (progress < 1) requestAnimationFrame(tick);
      else el.textContent = formatValue(target);
    }

    requestAnimationFrame(tick);
  }

  document.addEventListener("DOMContentLoaded", run);
  document.addEventListener("estimat:pa", run);
})();
