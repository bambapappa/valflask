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

    // Rättelsenot — synlig rättelse (tyst rättelse är förbjuden).
    if (d.rattelser && d.rattelser.length) {
      var not = el("aside", "rattelsenot");
      not.setAttribute("aria-label", "Rättelse");
      not.appendChild(el("strong", null, "Rättad."));
      var rul = el("ul", null);
      d.rattelser.forEach(function (r) {
        var li = el("li", null, null);
        li.appendChild(el("span", "datum", r.date));
        li.appendChild(document.createTextNode(" " + r.what));
        rul.appendChild(li);
      });
      not.appendChild(rul);
      inner.appendChild(not);
    }

    // Partiernas utslag
    var domrad = el("div", "domrad");
    var partier = Object.keys(d.domar).sort();
    if (partier.length) {
      partier.forEach(function (p) {
        var st = d.domar[p].status;
        var pill = document.createElement("a");
        pill.className = "status " + (STATUSKLASS[st] || "status--avstod");
        pill.href = apiBas + "parti/" + p;
        pill.textContent = p.toUpperCase() + ": " + (STATUSORD[st] || st);
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

  // Filter (SKISS §3): parti, kategori, status, dokumenttyp, motionstyp, riksmöte
  // som URL-parametrar — varje filtrerat läge blir länkbart, delbart, arkiverbart.
  var FALT = ["kategori", "parti", "status", "dokumenttyp", "motionstyp", "rm"];
  var filterRot = document.getElementById("filter");
  var valjare = filterRot ? filterRot.querySelectorAll("select[data-falt]") : [];
  var rensaKnapp = document.getElementById("f-rensa");
  var antalRuta = document.getElementById("f-antal");
  var totalt = filterRot ? Number(filterRot.getAttribute("data-antal-lof")) || 0 : 0;
  var rader = rot.querySelectorAll("table.rutnat tbody tr");

  function aktivaFilter() {
    var f = {};
    Array.prototype.forEach.call(valjare, function (s) { if (s.value) f[s.getAttribute("data-falt")] = s.value; });
    return f;
  }
  function radMatchar(tr, f) {
    for (var falt in f) {
      var attr = (tr.getAttribute("data-" + falt) || "").split(/\s+/);
      if (attr.indexOf(f[falt]) === -1) return false;
    }
    return true;
  }
  function tillampa() {
    var f = aktivaFilter();
    var aktiv = Object.keys(f).length > 0;
    var synliga = 0;
    Array.prototype.forEach.call(rader, function (tr) {
      var visa = radMatchar(tr, f);
      tr.style.display = visa ? "" : "none";
      if (visa) synliga += 1;
    });
    var sp = new URLSearchParams(window.location.search);
    FALT.forEach(function (k) { if (f[k]) sp.set(k, f[k]); else sp.delete(k); });
    var q = sp.toString();
    history.replaceState(null, "", q ? "?" + q : window.location.pathname);
    if (rensaKnapp) rensaKnapp.hidden = !aktiv;
    if (antalRuta) antalRuta.textContent = aktiv ? "Visar " + synliga + " av " + totalt + " vägda löften" : "";
  }
  Array.prototype.forEach.call(valjare, function (s) { s.addEventListener("change", tillampa); });
  if (rensaKnapp) rensaKnapp.addEventListener("click", function () {
    Array.prototype.forEach.call(valjare, function (s) { s.value = ""; });
    tillampa();
  });

  // Läs filtren ur URL:en vid start så ett länkat urval återställs exakt.
  var sp0 = new URLSearchParams(window.location.search);
  Array.prototype.forEach.call(valjare, function (s) {
    var v = sp0.get(s.getAttribute("data-falt"));
    if (v) s.value = v;
  });
  if (Array.prototype.some.call(valjare, function (s) { return !!s.value; })) tillampa();

  // Djuplänk: ?lofte=<id> öppnar panelen (journalister kan länka exakt).
  var lofteParam = sp0.get("lofte");
  if (lofteParam) öppnaLofte(lofteParam);
})();
