/*
 * Rutnätets klientlager. Ren vanilla, buntad i bygget och serverad från egen
 * host (CSP script-src 'self', inga CDN-skript). Rutnätet renderas redan i
 * HTML:en — det här lägger bara till detaljpanel, filter och sök ovanpå.
 */
(function () {
  "use strict";
  var rot = document.getElementById("rutnat-rot");
  if (!rot) return;
  var apiBas = rot.getAttribute("data-api-base") || "/";
  var dialog = document.getElementById("detalj");

  function el(tag, klass, text) {
    var n = document.createElement(tag);
    if (klass) n.className = klass;
    if (text != null) n.textContent = text;
    return n;
  }

  var KIND = {
    votering: "votering",
    motion: "motion",
    proposition: "proposition",
    interpellation: "interpellation",
    skriftlig_fraga: "skriftlig fråga",
  };
  var MOTIONSTYP = {
    parti: "partimotion",
    kommitte: "kommittémotion",
    enskild: "enskild motion (binder inte partiet)",
  };
  var STATUSORD = {
    agerat_i_linje: "i linje",
    agerat_emot: "emot",
    bade_och: "både och",
    ingen_handling_annu: "ingen ren koppling ännu",
  };
  var STATUSKLASS = {
    agerat_i_linje: "status--linje",
    agerat_emot: "status--emot",
    bade_och: "status--bade",
    ingen_handling_annu: "status--avstod",
  };

  function riktningsText(r) {
    return r === "motverkar" ? "ett bifall motverkar löftet" : "ett bifall stödjer löftet";
  }

  function renderaKoppling(k) {
    var box = el("div", "koppling");
    var h = k.handling;
    var kh = el("div", "kh");
    kh.appendChild(el("span", "kind", KIND[h.kind] || h.kind));
    kh.appendChild(el("span", null, riktningsText(k.riktning)));
    if (k.motionstyp) kh.appendChild(el("span", null, MOTIONSTYP[k.motionstyp] || k.motionstyp));
    if (typeof k.confidence === "number") kh.appendChild(el("span", null, "säkerhet " + Math.round(k.confidence * 100) + "%"));
    if (k.granskad_av_manniska) kh.appendChild(el("span", null, "godkänd av en människa"));
    box.appendChild(kh);

    if (h.titel) {
      var ht = el("div", null, null);
      ht.appendChild(el("strong", null, h.titel));
      if (h.datum) ht.appendChild(document.createTextNode(" · " + h.datum));
      if (h.organ) ht.appendChild(document.createTextNode(" · " + h.organ));
      box.appendChild(ht);
    }

    if (k.citat) {
      var q = el("blockquote", null, "”" + k.citat + "”");
      box.appendChild(q);
    }
    if (k.method_note) box.appendChild(el("p", "metodnot", k.method_note));

    var lankar = el("div", "lankar");
    if (h.url) {
      var a = el("a", null, "Läs handlingen hos riksdagen");
      a.href = h.url; a.rel = "noopener"; a.target = "_blank";
      lankar.appendChild(a);
    }
    if (h.arkiv_url) {
      var ar = el("a", null, "Arkivkopia");
      ar.href = h.arkiv_url; ar.rel = "noopener"; ar.target = "_blank";
      lankar.appendChild(ar);
    } else {
      lankar.appendChild(el("span", "saknas", "arkivkopia saknas ännu"));
    }
    box.appendChild(lankar);
    return box;
  }

  function renderaDetalj(d) {
    dialog.textContent = "";
    var inner = el("div", "panel-inner");

    var huvud = el("div", "panel-huvud");
    var vänster = el("div", null, null);
    vänster.appendChild(el("div", "lofte-kat", d.kategori + (d.parties && d.parties.length ? " · löfte av " + d.parties.join(", ") : "")));
    vänster.appendChild(el("h2", null, d.titel));
    huvud.appendChild(vänster);
    var stäng = el("button", "stang", "Stäng");
    stäng.setAttribute("type", "button");
    stäng.addEventListener("click", function () { dialog.close(); });
    huvud.appendChild(stäng);
    inner.appendChild(huvud);

    if (d.citat) inner.appendChild(el("blockquote", "lofte-citat", "”" + d.citat + "”"));

    var meta = el("p", "meta", null);
    if (d.kalla_url) {
      var kl = el("a", null, "källa"); kl.href = d.kalla_url; kl.rel = "noopener"; kl.target = "_blank";
      meta.appendChild(document.createTextNode("Löftet: "));
      meta.appendChild(kl);
    }
    if (d.arkiv_url) {
      meta.appendChild(document.createTextNode(" · "));
      var akl = el("a", null, "arkivkopia"); akl.href = d.arkiv_url; akl.rel = "noopener"; akl.target = "_blank";
      meta.appendChild(akl);
    }
    if (d.datum) meta.appendChild(document.createTextNode(" · sagt " + d.datum));
    inner.appendChild(meta);

    // Partiernas utslag
    var domrad = el("div", "domrad");
    var partier = Object.keys(d.domar).sort();
    if (partier.length) {
      partier.forEach(function (p) {
        var st = d.domar[p].status;
        var pill = el("span", "status " + (STATUSKLASS[st] || "status--avstod"), p.toUpperCase() + ": " + (STATUSORD[st] || st));
        domrad.appendChild(pill);
      });
      inner.appendChild(el("h3", null, "Partiernas utslag"));
      inner.appendChild(domrad);
    }

    inner.appendChild(el("h3", null, d.kopplingar.length + (d.kopplingar.length === 1 ? " koppling" : " kopplingar")));
    d.kopplingar.forEach(function (k) { inner.appendChild(renderaKoppling(k)); });

    dialog.appendChild(inner);
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    stäng.focus();
  }

  var cache = {};
  function öppnaLofte(id) {
    if (cache[id]) { renderaDetalj(cache[id]); return; }
    dialog.textContent = "";
    var laddar = el("div", "panel-inner");
    laddar.appendChild(el("p", "laddar", "Hämtar bevis…"));
    dialog.appendChild(laddar);
    if (typeof dialog.showModal === "function") dialog.showModal();
    fetch(apiBas + "api/hv/lofte/" + encodeURIComponent(id) + ".json")
      .then(function (r) { if (!r.ok) throw new Error("kunde inte hämta"); return r.json(); })
      .then(function (d) { cache[id] = d; renderaDetalj(d); })
      .catch(function () {
        dialog.textContent = "";
        var f = el("div", "panel-inner");
        f.appendChild(el("p", "laddar", "Kunde inte hämta bevisen just nu."));
        var s = el("button", "stang", "Stäng"); s.setAttribute("type", "button");
        s.addEventListener("click", function () { dialog.close(); });
        f.appendChild(s);
        dialog.appendChild(f);
      });
  }

  // Klick på löfte eller cell öppnar panelen.
  rot.addEventListener("click", function (e) {
    var t = e.target.closest("[data-lofte]");
    if (t) { e.preventDefault(); öppnaLofte(t.getAttribute("data-lofte")); }
  });
  if (dialog) {
    dialog.addEventListener("click", function (e) { if (e.target === dialog) dialog.close(); });
  }

  // Kategorifilter — döljer rader.
  var katFilter = document.getElementById("kat-filter");
  if (katFilter) {
    katFilter.addEventListener("change", function () {
      var val = katFilter.value;
      var rader = rot.querySelectorAll("table.rutnat tbody tr");
      Array.prototype.forEach.call(rader, function (tr) {
        tr.style.display = !val || tr.getAttribute("data-kategori") === val ? "" : "none";
      });
    });
  }

  // Eget sökindex — laddas först när fältet fokuseras (F3).
  var sokFalt = document.getElementById("sok-falt");
  var traffar = document.getElementById("sok-traffar");
  var index = null;
  function laddaIndex() {
    if (index) return Promise.resolve(index);
    return fetch(apiBas + "api/hv/sok-index.json")
      .then(function (r) { return r.json(); })
      .then(function (poster) { index = poster; return index; })
      .catch(function () { index = []; return index; });
  }
  function normalisera(s) { return (s || "").toLowerCase().trim(); }
  function sok(q) {
    var nq = normalisera(q);
    if (!nq || !index) { traffar.textContent = ""; return; }
    var ord = nq.split(/\s+/);
    var res = index.filter(function (p) {
      var text = normalisera(p.text);
      return ord.every(function (o) {
        // exakt delordsmatch eller prefix på ett ord i texten
        return text.indexOf(o) !== -1 || text.split(/\s+/).some(function (w) { return w.indexOf(o) === 0; });
      });
    }).slice(0, 12);
    traffar.textContent = "";
    res.forEach(function (p) {
      var li = document.createElement("li");
      var b = el("button", null, null);
      b.setAttribute("type", "button");
      b.appendChild(el("span", "taggen", p.typ === "kategori" ? "Kategori · " : "Löfte · "));
      b.appendChild(document.createTextNode(p.text));
      b.addEventListener("click", function () {
        if (p.typ === "lofte") { öppnaLofte(p.id); }
        else if (p.typ === "kategori" && katFilter) { katFilter.value = p.id; katFilter.dispatchEvent(new Event("change")); }
        traffar.textContent = "";
        sokFalt.value = "";
      });
      li.appendChild(b);
      traffar.appendChild(li);
    });
  }
  if (sokFalt) {
    sokFalt.addEventListener("focus", laddaIndex, { once: true });
    sokFalt.addEventListener("input", function () { laddaIndex().then(function () { sok(sokFalt.value); }); });
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".sok")) traffar.textContent = "";
    });
  }
})();
