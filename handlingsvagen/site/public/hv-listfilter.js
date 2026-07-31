/*
 * Liten generisk listfiltrering för entitetssidorna (t.ex. partisidans löften).
 * En <select data-listfilter="mål-id" data-nyckel="status"> döljer poster i
 * målcontainern vars data-<nyckel> inte matchar valet. CSP: egen host.
 */
(function () {
  "use strict";
  var valjare = document.querySelectorAll("select[data-listfilter]");
  Array.prototype.forEach.call(valjare, function (sel) {
    var mal = document.getElementById(sel.getAttribute("data-listfilter"));
    var nyckel = sel.getAttribute("data-nyckel");
    if (!mal || !nyckel) return;
    var poster = mal.querySelectorAll("[data-" + nyckel + "]");
    sel.addEventListener("change", function () {
      var v = sel.value;
      Array.prototype.forEach.call(poster, function (item) {
        var attr = (item.getAttribute("data-" + nyckel) || "").split(/\s+/);
        item.style.display = !v || attr.indexOf(v) !== -1 ? "" : "none";
      });
    });
  });
})();
