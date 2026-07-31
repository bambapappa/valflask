/*
 * Global sökruta i sidhuvudet (alla sidor). Eget index, inga beroenden, laddas
 * först vid fokus (F3). CSP: egen host, ingen inline-JS.
 */
(function () {
  "use strict";
  var box = document.querySelector(".sok[data-api-base]");
  if (!box) return;
  var bas = box.getAttribute("data-api-base") || "/";
  var falt = document.getElementById("sok-falt");
  var traffar = document.getElementById("sok-traffar");
  if (!falt || !traffar) return;

  var index = null;
  function ladda() {
    if (index) return Promise.resolve(index);
    return fetch(bas + "api/hv/sok-index.json")
      .then(function (r) { return r.json(); })
      .then(function (p) { index = p; return index; })
      .catch(function () { index = []; return index; });
  }
  function norm(s) { return (s || "").toLowerCase().trim(); }
  var TAG = { lofte: "Löfte", kategori: "Kategori", parti: "Parti", ledamot: "Ledamot" };

  function gaTill(p) {
    if (p.url) { window.location.href = bas + p.url; return; }
    if (p.typ === "lofte") { window.location.href = bas + "?lofte=" + encodeURIComponent(p.id); return; }
    if (p.typ === "kategori") { window.location.href = bas + "?kategori=" + encodeURIComponent(p.id); return; }
  }

  function sok(q) {
    var nq = norm(q);
    if (!nq || !index) { traffar.textContent = ""; return; }
    var ord = nq.split(/\s+/);
    var res = index.filter(function (p) {
      var text = norm(p.text);
      return ord.every(function (o) {
        return text.indexOf(o) !== -1 || text.split(/\s+/).some(function (w) { return w.indexOf(o) === 0; });
      });
    }).slice(0, 12);
    traffar.textContent = "";
    res.forEach(function (p) {
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button";
      var tag = document.createElement("span");
      tag.className = "taggen";
      tag.textContent = (TAG[p.typ] || "") + " · ";
      b.appendChild(tag);
      b.appendChild(document.createTextNode(p.text));
      b.addEventListener("click", function () { gaTill(p); });
      li.appendChild(b);
      traffar.appendChild(li);
    });
  }

  falt.addEventListener("focus", ladda, { once: true });
  falt.addEventListener("input", function () { ladda().then(function () { sok(falt.value); }); });
  falt.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      var första = traffar.querySelector("button");
      if (första) första.click();
    }
  });
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".sok")) traffar.textContent = "";
  });
})();
