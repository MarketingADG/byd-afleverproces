/* ==========================================================================
   Gedeeld door alle pagina's: menu, wie er kijkt, meldingen in beeld, opmaak.
   Wie er kijkt komt uit de sessie (js/sessie.js), met de rol uit de database.
   ========================================================================== */

const MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const DAGEN = ["zo", "ma", "di", "wo", "do", "vr", "za"];

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function datumKort(iso) { if (!iso) return ""; const d = naarDatum(iso); return `${DAGEN[d.getDay()]} ${d.getDate()} ${MAANDEN[d.getMonth()]}`; }
function datumLang(iso) { if (!iso) return ""; const d = naarDatum(iso); return `${d.getDate()}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`; }
function tijdstip(ts) { return ts ? `${datumKort(ts.slice(0, 10))}, ${ts.slice(11, 16).replace(":", ".")}` : ""; }
function bedrag(n) { return n == null || n === "" ? "" : "€ " + Number(n).toLocaleString("nl-NL"); }
function relatief(iso) {
  const n = dagenTot(iso);
  if (n === 0) return "vandaag"; if (n === 1) return "morgen"; if (n === -1) return "gisteren";
  return n > 0 ? `over ${n} dagen` : `${-n} dagen geleden`;
}
function initialen(naam) { return naam.split(" ").filter(w => /^\p{Lu}/u.test(w)).map(w => w[0]).join(""); }
function eersteKlein(s) { return s ? s[0].toLowerCase() + s.slice(1) : ""; }
function faseLabel(nr) { return nr === "ott" ? "5.1" : String(nr); }

/* ---------- wie kijkt er ---------- */

function huidigePersoon() { return IK; }
/* Wie bij deze order die rol heeft. Is er (nog) niemand met die rol, dan de rolnaam. */
function persoonVanRol(o, rol) {
  if (rol === "verkoper") return o.verkoper;
  return PERSONEN.find(p => p.rol === rol)?.naam || `de ${ROLLEN[rol].toLowerCase()}`;
}

/* Wie mag een fase bewerken: de eigenaar, en de manager overal. Verkopers mogen ook
   taken van de afleverspecialist doen (systeemuitleg, scherm Mijn taken); de
   afleverspecialist neemt fase 3 en 5 over van de verkoper. */
function magBewerken(persoon, o, nr) {
  const rol = faseInfo(nr).eigenaar;
  if (persoon.rol === "manager") return true;
  if (faseInfo(nr).overname === persoon.rol) return true;
  if (rol === "verkoper") return persoon.rol === "verkoper";
  if (rol === "afleverspecialist") return persoon.rol === "afleverspecialist" || persoon.rol === "verkoper";
  return persoon.rol === rol;
}

/* ---------- iconen ---------- */

const ICOON = {
  bord: `<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/>`,
  taken: `<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/>`,
  poetsen: `<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="3"/>`,
  dashboard: `<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  vink: `<path d="m5 12.5 4.5 4.5L19 7.5"/>`,
  "pijl-links": `<path d="M19 12H5M11 18l-6-6 6-6"/>`,
  info: `<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>`,
  bubbel: `<path d="M5 19V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8.5z"/>`,
  auto: `<path d="M5 17h14M5 17a2 2 0 1 0 4 0M15 17a2 2 0 1 0 4 0M3 17v-4l2-5h14l2 5v4"/><path d="M3 13h18"/>`,
  werkplaats: `<path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.6 2.6-2.4-.6-.6-2.4z"/>`,
  onderdelen: `<path d="M12 3 4 7v10l8 4 8-4V7z"/><path d="m4 7 8 4 8-4M12 11v10"/>`,
  import: `<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>`,
  premie: `<path d="M17 6.5A6 6 0 1 0 17 17.5M4 10h9M4 14h9"/>`,
  archief: `<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5M12 8v4l3 2"/>`,
  oog: `<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>`,
  slot: `<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>`,
  bellen: `<path d="M5 4h3.5l2 5-2.5 1.5a11 11 0 0 0 5.5 5.5l1.5-2.5 5 2V19a2 2 0 0 1-2 2A17 17 0 0 1 3 6a2 2 0 0 1 2-2"/>`
};
function icoon(naam, maat = 18) {
  return `<svg viewBox="0 0 24 24" width="${maat}" height="${maat}" fill="none" stroke="currentColor" stroke-width="${maat < 16 ? 2.2 : 1.75}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICOON[naam]}</svg>`;
}

/* ---------- menu links ----------
   Elke afdeling heeft een eigen omgeving: verkoop en afleverspecialist het overzicht in drie
   rijen, de serviceadviseur een weekagenda, de manager het dashboard. Kom je op een pagina
   die niet bij jouw rol hoort, dan ga je naar je eigen startpagina. */

const MENU = {
  overzicht: ["index.html", "Overzicht", "auto"],
  taken: ["taken.html", "Mijn taken", "taken"],
  import: ["import.html", "Importlijst", "import"],
  poetsen: ["poetsen.html", "Poetsplanning", "poetsen"],
  werkplaats: ["werkplaats.html", "Werkplaats", "werkplaats"],
  behandeld: ["behandeld.html", "Behandeld", "archief"],
  dashboard: ["dashboard.html", "Dashboard", "dashboard"],
  premies: ["premies.html", "Premielijst", "premie"]
};
const MENU_PER_ROL = {
  verkoper: ["overzicht", "taken", "import", "poetsen"],
  afleverspecialist: ["overzicht", "taken", "import", "poetsen"],
  serviceadviseur: ["werkplaats", "behandeld"],
  poetser: ["poetsen"],
  administratie: ["taken"],
  manager: ["dashboard", "overzicht", "werkplaats", "taken", "import", "premies", "poetsen"]
};
function startpagina(rol) { return MENU[MENU_PER_ROL[rol][0]][0]; }

function zijmenuEl(ik, actief, tellers) {
  const links = MENU_PER_ROL[ik.rol].map(k => [...MENU[k], k, tellers[k] || ""]);
  const zij = document.createElement("aside");
  zij.className = "zijmenu";
  zij.innerHTML = `
    <a class="zij-merk" href="${startpagina(ik.rol)}"><img src="assets/cobranding-byd.svg" alt="BYD en ADG Groep"></a>
    <div class="zij-titel">Afleverproces ${esc(ik.vestiging)}</div>
    ${["verkoper", "afleverspecialist", "manager"].includes(ik.rol) ? `<a class="knop-nieuw" href="order.html?nieuw=1">${icoon("plus", 16)}Nieuwe order</a>` : ""}
    <nav class="zij-nav">${links.map(([h, t, ic, k, n]) => `<a href="${h}" class="${k === actief ? "actief" : ""}" ${k === actief ? 'aria-current="page"' : ""}>${icoon(ic)}<span>${t}</span>${n}</a>`).join("")}</nav>
    <div class="zij-onder">
      <div class="ik"><span class="avatar">${initialen(ik.naam)}</span><div><div class="nm">${esc(ik.naam)}</div><div class="rl">${ROLLEN[ik.rol]}</div></div></div>
      <button type="button" class="knop" id="uitloggen">Uitloggen</button>
    </div>`;
  zij.querySelector("#uitloggen").addEventListener("click", uitloggen);
  return zij;
}

/* welke menukeuze hoort bij de pagina die nu openstaat */
function actiefVanPagina() {
  const f = location.pathname.split("/").pop() || "index.html";
  for (const k in MENU) if (MENU[k][0] === f) return k;
  return null;
}

/* Zet het menu meteen neer uit de onthouden eigen rol (naam, rol, vestiging; geen
   klantgegevens), nog voordat de database antwoordt. Zo staat de pagina er direct in
   plaats van een seconde leeg; kopbalk() vervangt dit zodra de echte gegevens binnen zijn.
   Is er nog geen onthouden rol (eerste keer na inloggen), dan gebeurt er niets. */
function vroegeKopbalk() {
  try {
    if (document.querySelector(".zijmenu")) return;
    const ik = JSON.parse(sessionStorage.getItem("byd-ik") || "null");
    if (!ik || !MENU_PER_ROL[ik.rol]) return;
    const actief = actiefVanPagina();
    if (actief && !MENU_PER_ROL[ik.rol].includes(actief)) return;
    document.body.prepend(zijmenuEl(ik, actief, {}));
    document.body.classList.add("laden");
  } catch (e) { }
}

function kopbalk(actief) {
  const ik = huidigePersoon();
  if (actief && !MENU_PER_ROL[ik.rol].includes(actief)) { location.replace(startpagina(ik.rol)); throw new Error("andere startpagina"); }
  const orders = laadOrders();
  const lopend = orders.filter(o => !o.concept && huidigeFase(o) !== "klaar");
  const rood = lopend.filter(o => kaartStatus(o) === "rood").length;
  const poetsOpen = orders.filter(o => teZienInPoetsplanning(o) && !gepoetst(o)).length;
  const tellers = {
    overzicht: rood ? `<span class="teller rood" title="${rood} te laat">${rood}</span>` : "",
    poetsen: poetsOpen ? `<span class="teller">${poetsOpen}</span>` : ""
  };
  const zij = zijmenuEl(ik, actief, tellers);
  const bestaand = document.querySelector(".zijmenu");
  if (bestaand) bestaand.replaceWith(zij); else document.body.prepend(zij);
  document.body.classList.remove("laden");
  return ik;
}

/* ---------- merk en model bij de RDW ----------
   Open data, geen sleutel nodig. Geeft { merk, model } terug, of null als het kenteken
   niet bestaat of de RDW niet bereikbaar is. */
async function rdwAuto(kenteken) {
  const k = String(kenteken || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (k.length < 6) return null;
  try {
    const r = await fetch(`https://opendata.rdw.nl/resource/m9d7-ebf2.json?kenteken=${k}&$select=merk,handelsbenaming`);
    const [auto] = await r.json();
    /* de handelsbenaming herhaalt soms het merk: "TOYOTA COROLLA" */
    return auto ? { merk: auto.merk, model: (auto.handelsbenaming || "").replace(new RegExp(`^${auto.merk} `), "") } : null;
  } catch (e) { return null; }
}

/* ---------- melding rechtsonder ---------- */

function toast(tekst, soort = "") {
  let bak = document.querySelector(".toasts");
  if (!bak) { bak = document.createElement("div"); bak.className = "toasts"; bak.setAttribute("role", "status"); document.body.append(bak); }
  const t = document.createElement("div");
  t.className = `toast ${soort}`;
  t.textContent = tekst;
  bak.append(t);
  setTimeout(() => t.classList.add("weg"), 4200);
  setTimeout(() => t.remove(), 4600);
}

/* ---------- kleine bouwstenen ---------- */

const STATUS_TEKST = { grijs: "Wacht", oranje: "Loopt", rood: "Te laat", groen: "Afgerond", nvt: "Niet van toepassing" };

function pil(status, tekst = STATUS_TEKST[status]) { return `<span class="pil ${status}"><span class="stip st-${status}"></span>${esc(tekst)}</span>`; }

function nu() { const d = new Date(); return `${naarIso(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }

/* Voortgangsbalk in delen: elk deel groen zodra het klaar is. */
function delenBalk(delen, wat) {
  const klaar = delen.filter(d => d.klaar).length;
  return `<div class="delen" role="img" aria-label="${wat}: ${klaar} van ${delen.length} klaar">${delen.map(d =>
    `<i class="${d.klaar ? "af" : d.open ? "open" : ""}" title="${esc(d.label)}: ${d.klaar ? "klaar" : d.open ? "nu aan de beurt" : "nog niet"}"></i>`).join("")}</div>`;
}
function importDelen(imp) {
  const stand = importStand(imp);
  return IMPORT_STAPPEN.map((label, i) => ({ label: `${i}. ${label}`, klaar: !!imp?.stappen?.[i], open: i === stand }));
}

/* Gekleurd icoon in een autoblokje. */
const ICOON_TEKST = {
  onderdelen: { grijs: "Werkplaats heeft de onderdelen nog niet bekeken", rood: "Er ontbreekt een onderdeel", oranje: "Onderdelen nog onderweg", groen: "Alle onderdelen binnen" },
  werkplaats: { rood: "Nog niet ingepland in de werkplaats", oranje: "Ingepland in de werkplaats", groen: "Werkplaatsklaar" }
};
function statusIcoon(soort, status, extra = "") {
  return `<span class="sico ${status}" title="${ICOON_TEKST[soort][status]}" ${extra}>${icoon(soort, 15)}<span class="vh">${ICOON_TEKST[soort][status]}</span></span>`;
}
