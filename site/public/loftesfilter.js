"use strict";
// Ett läsfilter, ingen värdering: typ och beloppsunderlag är oberoende.
(() => {
  const KEY_UNDERLAG = "loftesfilter-underlag";
  const KEY_TYP = "loftesfilter-loftestyp";
  const validUnderlag = new Set(["parti", "utlovat", "alla"]);
  const validTyp = new Set(["reform", "inriktning", "alla"]);

  function storageGet(key, fallback, valid) {
    try {
      const value = localStorage.getItem(key);
      return valid.has(value) ? value : fallback;
    } catch (_) { return fallback; }
  }
  function storageSet(key, value) { try { localStorage.setItem(key, value); } catch (_) {} }
  function hasAcceptedEstimates() { return document.documentElement.dataset.estimat === "pa"; }
  function needsEstimates(underlag) { return underlag === "utlovat" || underlag === "alla"; }
  function label(underlag, typ) {
    const source = underlag === "parti" ? "partiernas egna belopp" : underlag === "utlovat" ? "Utlovat.se:s beräkningar" : "båda beloppsunderlagen";
    const kind = typ === "reform" ? "reformlöften" : typ === "inriktning" ? "inriktnings- och policylöften" : "alla löften";
    return `Visar ${source} för ${kind}.`;
  }
  function apply(underlag, typ) {
    const html = document.documentElement;
    html.dataset.loftesfilterUnderlag = underlag;
    html.dataset.loftesfilterTyp = typ;
    let visible = 0;
    document.querySelectorAll("[data-lofte-underlag][data-lofte-typ]").forEach((row) => {
      const show = (underlag === "alla" || row.dataset.lofteUnderlag === underlag) && (typ === "alla" || row.dataset.lofteTyp === typ);
      row.hidden = !show;
      if (show) visible += 1;
    });
    document.querySelectorAll("[data-loftesfilter-status]").forEach((status) => {
      status.firstChild.textContent = `${label(underlag, typ)} `;
    });
    document.querySelectorAll("[data-loftesfilter-count]").forEach((count) => { count.textContent = String(visible); });
    document.dispatchEvent(new CustomEvent("loftesfilter:andrat", { detail: { underlag, typ, visible } }));
  }
  function init() {
    const forms = [...document.querySelectorAll("[data-loftesfilter]")];
    if (!forms.length) return;
    let underlag = storageGet(KEY_UNDERLAG, "parti", validUnderlag);
    let typ = storageGet(KEY_TYP, "reform", validTyp);
    if (needsEstimates(underlag) && !hasAcceptedEstimates()) underlag = "parti";
    for (const form of forms) {
      form.querySelector(`input[name="underlag"][value="${underlag}"]`).checked = true;
      form.querySelector(`input[name="loftestyp"][value="${typ}"]`).checked = true;
      form.addEventListener("change", (event) => {
        const nextUnderlag = form.querySelector('input[name="underlag"]:checked').value;
        const nextTyp = form.querySelector('input[name="loftestyp"]:checked').value;
        if (needsEstimates(nextUnderlag) && !hasAcceptedEstimates()) {
          event.preventDefault();
          form.querySelector(`input[name="underlag"][value="${underlag}"]`).checked = true;
          document.dispatchEvent(new CustomEvent("estimat:oppna", { detail: { underlag: nextUnderlag, typ: nextTyp } }));
          return;
        }
        underlag = nextUnderlag; typ = nextTyp;
        storageSet(KEY_UNDERLAG, underlag); storageSet(KEY_TYP, typ); apply(underlag, typ);
      });
    }
    document.addEventListener("estimat:pa", () => {
      const pending = window.__loftesfilterPending;
      if (!pending) return;
      underlag = pending.underlag; typ = pending.typ;
      storageSet(KEY_UNDERLAG, underlag); storageSet(KEY_TYP, typ);
      forms.forEach((form) => {
        form.querySelector(`input[name="underlag"][value="${underlag}"]`).checked = true;
        form.querySelector(`input[name="loftestyp"][value="${typ}"]`).checked = true;
      });
      delete window.__loftesfilterPending; apply(underlag, typ);
    });
    document.addEventListener("estimat:oppna", (event) => {
      window.__loftesfilterPending = event.detail;
    });
    apply(underlag, typ);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
