"use strict";
// Kör i <head> före sidan målas: har läsaren redan kvitterat att beloppen
// är uppskattningar sätts flaggan direkt, så maskade tal inte blinkar till.
// Beslut: DECISION_LOG 2026-07-21 (b-0016). localStorage, aldrig kaka.
try {
  if (localStorage.getItem("estimat-godkant") === "ja") {
    document.documentElement.dataset.estimat = "pa";
  }
} catch (e) {
  /* localStorage kan vara avstängt — då förblir beloppen maskade, vilket är rätt grundläge */
}
