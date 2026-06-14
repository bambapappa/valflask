// Laddar Pagefind-UI:t. Extern fil (inte inline) för att respektera CSP script-src 'self'.
(function () {
  var el = document.getElementById("search");
  if (!el) return;
  var s = document.createElement("script");
  s.src = "/pagefind/pagefind-ui.js";
  s.onload = function () {
    new PagefindUI({ element: "#search", showSubResults: true, showImages: false });
  };
  s.onerror = function () {
    el.innerHTML =
      '<p>Sökfunktionen kunde inte laddas. Se <a href="/topplistor">topplistor</a>.</p>';
  };
  document.body.appendChild(s);
})();
