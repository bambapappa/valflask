"use strict";
// Godkännandegrind för kostnadsestimat (DECISION_LOG 2026-07-21, b-0016).
// Beloppen är maskade tills läsaren kvitterat att de är uppskattningar.
// Ingen kaka: valet minns i localStorage. CSP script-src 'self' — egen fil.
(() => {
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(() => {
    const html = document.documentElement;
    const modal = document.querySelector("[data-grind]");
    if (!modal) return;

    let lastFocus = null;

    const paPa = () => html.dataset.estimat === "pa";

    function onKey(e) {
      if (e.key === "Escape") stang();
    }

    function oppna(e) {
      if (paPa()) return; // redan upplåst — inget att kvittera
      if (e) e.preventDefault();
      lastFocus = document.activeElement;
      modal.hidden = false;
      const ja = modal.querySelector("[data-grind-ja]");
      if (ja) ja.focus();
      document.addEventListener("keydown", onKey);
    }

    function stang() {
      modal.hidden = true;
      document.removeEventListener("keydown", onKey);
      if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
    }

    function acceptera() {
      try {
        localStorage.setItem("estimat-godkant", "ja");
      } catch (e) {
        /* lagring nekad — flaggan gäller ändå denna session */
      }
      html.dataset.estimat = "pa";
      stang();
      document.dispatchEvent(new CustomEvent("estimat:pa"));
    }

    function stangAv() {
      try {
        localStorage.removeItem("estimat-godkant");
      } catch (e) {
        /* strunt samma */
      }
      delete html.dataset.estimat;
    }

    document.addEventListener("click", (e) => {
      const el = e.target;
      if (!el || !el.closest) return;

      if (el.closest("[data-grind-ja]")) return acceptera();
      if (el.closest("[data-grind-nej]") || el.closest("[data-grind-stang]")) return stang();

      const toggle = el.closest("[data-grind-toggle]");
      if (toggle) {
        e.preventDefault();
        if (paPa()) stangAv();
        else oppna(e);
        return;
      }

      if (el.closest("[data-grind-oppna]")) return oppna(e);

      // Klick på ett maskat belopp öppnar grinden
      if (!paPa() && el.closest(".belopp")) return oppna(e);
    });
  });
})();
