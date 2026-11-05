/* ROUTER-WRAP: dit paginascript draait opnieuw bij navigatie in het geheugen (zie js/ui.js).
   Daarom staat alles in een eigen functiebereik: zo botsen de const-namen niet met die van
   een vorige pagina en kan het script zonder herlading opnieuw. */
(() => {
/* Overzicht voor verkoop en afleverspecialist: drie kolommen naast elkaar in plaats van alle
   fases. In de uitleg van de vestiging heten ze "rijen"; elke rij is een lijst met de
   eerstvolgende bovenaan.
   1. Auto's onderweg: andere vestiging of nog besteld, op verwachte leverdatum.
   2. Auto's in het afleverproces: binnen, op afleverdatum, met een scheiding per dag.
   3. Importauto's binnen zonder kenteken, op verwachte leverdatum.
   Concepten (fase 1 nog niet opgeslagen) staan erboven in een eigen strook. */

const ik = kopbalk("overzicht");
const orders = laadOrders();
const imports = laadImports();

const fVerkoper = document.getElementById("f_verkoper");
PERSONEN.filter(p => p.rol === "verkoper").forEach(p => fVerkoper.insertAdjacentHTML("beforeend", `<option>${esc(p.naam)}</option>`));
if (ik.rol === "verkoper") fVerkoper.value = ik.naam;

const HERKOMST = { "andere-locatie": "Andere vestiging", bestelling: "Bestelling", winkel: "Op voorraad" };
const importVan = o => imports.find(i => i.chassis === o.auto.chassis);
const uur = t => t ? ", " + blokTekst(t) : "";

function rijVan(o) {
  if (o.concept || huidigeFase(o) === "klaar") return null;
  if (!o.vink.binnen) return 1;
  if (o.type === "import" && !o.auto.kenteken) return 3;
  return 2;
}

function verwachtTekst(iso) {
  if (!iso) return "Levertijd nog invullen";
  const n = dagenTot(iso);
  return `Verwacht ${datumKort(iso)} · ${n < 0 ? `${-n} ${n === -1 ? "dag" : "dagen"} te laat` : relatief(iso)}`;
}

function onderdelenLijst(o) {
  if (!o.vink.w_gecontroleerd) return `<p>De werkplaats heeft de onderdelen nog niet bekeken.</p>`;
  if (!o.accessoires.length) return `<p>Geen onderdelen nodig.</p>`;
  const grens = wpDeadline(o);
  return `<ul>${o.accessoires.map(a => {
    const st = a.binnen ? "groen" : !a.besteld || (grens && a.verwacht > grens) ? "rood" : "oranje";
    const tekst = a.binnen ? "binnen" : !a.besteld ? "niet besteld" : a.verwacht ? `verwacht ${datumKort(a.verwacht)}` : "besteld, datum onbekend";
    return `<li><span class="stip st-${st}"></span>${esc(a.naam)}: ${tekst}</li>`;
  }).join("")}</ul>`;
}

function iconen(o) {
  const od = onderdelenStatus(o);
  return `<button type="button" class="sico-knop" data-onderdelen="${o.id}" aria-expanded="false" aria-controls="od_${o.id}">${statusIcoon("onderdelen", od)}</button>${statusIcoon("werkplaats", werkplaatsStatus(o))}`;
}

function blok(o, rij, i) {
  const timer = contactTimer(o);
  const kleur = rij === 1 ? onderwegKleur(o) : kaartStatus(o);
  const kop = `<div class="b1"><span class="stip st-${kleur}" title="${{ grijs: "Op schema", oranje: "Let op", rood: "Te laat", groen: "Klaar" }[kleur]}"></span>
    <a class="naam" href="order.html?id=${o.id}">${esc(klantNaam(o))}</a>${o.ott ? `<span class="label">OTT</span>` : ""}
    <span class="avatar klein" title="Verkoper: ${esc(o.verkoper)}">${initialen(o.verkoper)}</span></div>`;
  const bel = timer ? `<span class="ico" title="${esc(timer.tekst)}">${icoon("bellen", 14)}<span class="vh">${esc(timer.tekst)}</span></span>` : "";
  let midden = "", onder = "";

  if (rij === 1) {
    const soort = o.type === "import" ? "Import" : o.type === "gebruikt" ? "Gebruikt" : HERKOMST[o.voorraad] || "";
    midden = `<div class="b2">${esc(o.auto.model || "Model nog kiezen")}${soort ? " · " + soort : ""}</div>
      ${kleur === "rood" ? `<div class="reden">Verwachte leverdatum 4 dagen of meer voorbij</div>` : ""}
      <div class="b3"><span class="datum">${verwachtTekst(o.levertijd)}</span>${bel}</div>`;
  }
  if (rij === 2) {
    const delen = verkoopDelen(o);
    const volgende = delen.find(d => !d.klaar);
    const nuTekst = !volgende ? "Klaar voor aflevering" : volgende.open ? `Nu: ${eersteKlein(volgende.label)}` : volgende.nr === 3 ? "Wacht op de werkplaats" : "Wacht op het kenteken";
    midden = `<div class="b2">${esc(o.auto.model)}${o.auto.kenteken ? " · " + esc(o.auto.kenteken) : ""}${o.type !== "nieuw" ? " · " + TYPES[o.type] : ""}</div>
      ${kleur === "rood" ? `<div class="reden">${esc(waaromTeLaat(o, FASES.find(f => faseStatus(o, f.nr) === "rood").nr))}</div>` : ""}
      ${wachtOpVerkoper(o).length ? `<div class="reden">Werkplaats wacht op reactie van ${esc(o.verkoper.split(" ")[0])}</div>` : ""}
      ${toevoegingProbleem(o) ? `<div class="reden">Toevoeging: nieuwe afleverdatum nodig, vroegst ${datumKort(vroegsteNaGereed(toevoegingProbleem(o).gereed))}</div>` : ""}
      <div class="b3"><span class="datum">${o.afleverdatum ? `Aflevering ${datumKort(o.afleverdatum)}${uur(o.aflevertijd)}` : "Afleverdatum nog vastleggen"}</span>${bel}${iconen(o)}</div>`;
    onder = `${delenBalk(delen, "Verkoop en aflevering")}<div class="b4">${esc(nuTekst)}</div>`;
  }
  if (rij === 3) {
    const imp = importVan(o);
    const stand = importStand(imp);
    midden = `<div class="b2">${esc(o.auto.model)} · meldcode ${esc(meldcode(o))}</div>
      <div class="b3"><span class="datum">${verwachtTekst(o.afleverdatum || o.levertijd)}</span>${bel}${iconen(o)}</div>`;
    onder = imp
      ? `${delenBalk(importDelen(imp), "Import")}<div class="b4">Nu: ${esc(eersteKlein(IMPORT_STAPPEN[stand]) || "kenteken bekend")}</div>`
      : `<div class="b4">Niet gevonden in de importlijst. Controleer het chassisnummer.</div>`;
  }
  const lijst = rij === 1 ? "" : `<div class="od-lijst" id="od_${o.id}" hidden>${onderdelenLijst(o)}</div>`;
  return `<article class="blok in-beeld" style="--i:${i}">${kop}${midden}${lijst}${onder}</article>`;
}

function teken() {
  const zoek = document.getElementById("zoek").value.trim().toLowerCase();
  const verkoper = fVerkoper.value;
  const zichtbaar = orders.filter(o =>
    (!verkoper || o.verkoper === verkoper) &&
    (!zoek || [klantNaam(o), o.auto.model, o.auto.kenteken, meldcode(o), o.ordernummer].join(" ").toLowerCase().includes(zoek)));
  const per = n => zichtbaar.filter(o => rijVan(o) === n);
  const opDatum = (a, b) => (a || "9999").localeCompare(b || "9999");

  const r1 = per(1).sort((a, b) => opDatum(a.levertijd, b.levertijd));
  const r2 = per(2).sort((a, b) => opDatum(a.afleverdatum, b.afleverdatum) || (a.aflevertijd || "").localeCompare(b.aflevertijd || ""));
  const r3 = per(3).sort((a, b) => opDatum(a.afleverdatum || a.levertijd, b.afleverdatum || b.levertijd));
  const concepten = zichtbaar.filter(o => o.concept).sort((a, b) => b.aangemaakt.localeCompare(a.aangemaakt));

  document.getElementById("concepten").innerHTML = concepten.length ? `<section class="taken-groep concepten">
    <h2>Concepten <span class="n">${concepten.length}</span></h2>
    <div class="rijen">${concepten.map(o => {
      const open = openPunten(o, 1).length;
      return `<a class="taak" href="order.html?id=${o.id}#fase-1"><span class="stip st-grijs"></span>
        <div><div class="wie">${esc(klantNaam(o))}</div><div class="sub">${esc(o.auto.model || "Model nog kiezen")} · ${esc(o.verkoper)}</div></div>
        <div class="wat"><div class="kop">${open ? `Nog ${open} ${open === 1 ? "punt" : "punten"} open` : "Klaar om op te slaan"}</div><div class="sub">Staat pas in het overzicht na Opslaan</div></div>
        <div class="wanneer">Begonnen ${relatief(o.aangemaakt.slice(0, 10))}</div></a>`;
    }).join("")}</div></section>` : "";

  let i = 0;
  const leeg = t => `<div class="kolom-leeg">${t}</div>`;
  /* rij 2: scheidingslijn per afleverdag */
  let vorige = null;
  const r2html = r2.map(o => {
    const d = o.afleverdatum || "";
    let kop = "";
    if (d !== vorige) {
      const lijn = vorige !== null;
      vorige = d;
      const n = r2.filter(x => (x.afleverdatum || "") === d).length;
      kop = `<div class="dag-kop ${lijn ? "lijn" : ""}"><span>${d ? `${relatief(d) === "vandaag" ? "Vandaag" : relatief(d) === "morgen" ? "Morgen" : datumKort(d)}${["vandaag", "morgen"].includes(relatief(d)) ? ", " + datumKort(d) : ""}` : "Nog geen afleverdatum"}</span><span class="n">${n}</span></div>`;
    }
    return kop + blok(o, 2, i++);
  }).join("");

  const sectie = (titel, uitleg, lijst, html, leegTekst) => `<section class="kolom">
    <div class="kolom-kop"><div><h2>${titel}</h2><p>${uitleg}</p></div><span class="aantal">${lijst.length}</span></div>
    ${html || leeg(leegTekst)}</section>`;

  document.getElementById("rijen").innerHTML =
    sectie("Auto's onderweg", "Op een andere vestiging of nog besteld. Eerstvolgende bovenaan.", r1, r1.map(o => blok(o, 1, i++)).join(""), "Geen auto's onderweg.") +
    sectie("Auto's in het afleverproces", "Binnen, op volgorde van aflevering.", r2, r2html, "Geen auto's in het afleverproces.") +
    sectie("Import binnen, nog geen kenteken", "De werkplaats kan al beginnen. Met kenteken schuift de auto naar het afleverproces.", r3, r3.map(o => blok(o, 3, i++)).join(""), "Geen importauto's die op een kenteken wachten.");

  const lopend = zichtbaar.filter(o => rijVan(o));
  const rood = lopend.filter(o => (rijVan(o) === 1 ? onderwegKleur(o) : kaartStatus(o)) === "rood").length;
  document.getElementById("samenvatting").textContent =
    `${r1.length} onderweg, ${r2.length} in het afleverproces, ${r3.length} import zonder kenteken. ${rood} ${rood === 1 ? "loopt" : "lopen"} achter.`;
}

document.getElementById("rijen").addEventListener("click", e => {
  const b = e.target.closest("[data-onderdelen]"); if (!b) return;
  const lijst = document.getElementById(`od_${b.dataset.onderdelen}`);
  lijst.hidden = !lijst.hidden;
  b.setAttribute("aria-expanded", String(!lijst.hidden));
});
["zoek", "f_verkoper"].forEach(id => document.getElementById(id).addEventListener("input", teken));
teken();

})();
