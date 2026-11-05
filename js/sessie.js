/* ==========================================================================
   Sessie en opslag (v0.1, 2026-11-05).

   Inloggen gaat met het account van de offertemodule (zelfde e-mailadres en wachtwoord).
   Zonder geldige sessie stuurt elke pagina je naar login.html. De pagina zelf bevat geen
   gegevens: alles komt uit de database via functies die eerst de sessie controleren, en
   alleen voor je eigen vestiging. Omzeilt iemand het doorsturen, dan krijgt hij nog niets.

   Niets van de orders wordt in de browser bewaard: alleen het sessietoken staat in
   localStorage, zoals in de offertemodule. De gegevens leven in het geheugen van de pagina.

   Laadvolgorde per pagina: proces.js, sessie.js, ui.js, en dan de paginascripts als
   <script data-start="js/....js">. Die start dit bestand pas als de gegevens binnen zijn,
   zodat laadOrders() en de rest synchroon kunnen blijven.
   ========================================================================== */

const SB_URL = "https://vvdtotcxjjeydnowzksf.supabase.co";
const SB_KEY = "sb_publishable_S96X4kgnlhZN2lzM5ne2rg_-QuN-AwQ"; /* publieke sleutel, zelfde als de offertemodule; geeft zonder sessie nergens toegang toe */
const SESSIE_SLEUTEL = "byd-afleverproces-sessie";

/* Opslag van het oude prototype en de losse koppeling weg, voor het geval die in deze
   browser nog staat (AVG-noodfix 2026-11-04). */
(function oudeOpslagWeg() {
  try {
    Object.keys(localStorage)
      .filter(k => (k.startsWith("byd-afleverproces-") && k !== SESSIE_SLEUTEL) || k === "byd-aflever-koppeling")
      .forEach(k => localStorage.removeItem(k));
  } catch (e) { }
})();

function sessieToken() {
  try { return JSON.parse(localStorage.getItem(SESSIE_SLEUTEL))?.token || null; } catch (e) { return null; }
}
function sessieWeg() { try { localStorage.removeItem(SESSIE_SLEUTEL); sessionStorage.removeItem("byd-ik"); } catch (e) { } }

function naarLogin(melding) {
  const hier = location.pathname.split("/").pop() + location.search + location.hash;
  const q = new URLSearchParams();
  if (hier && !/^login\.html/.test(hier)) q.set("terug", hier);
  if (melding) q.set("melding", melding);
  location.replace(`login.html${q.toString() ? "?" + q : ""}`);
}

const OP_LOGIN = /(^|\/)login\.html$/.test(location.pathname);
if (!OP_LOGIN && !sessieToken()) {
  document.documentElement.style.visibility = "hidden";
  naarLogin();
}

async function rpc(naam, params) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${naam}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    body: JSON.stringify(params)
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(data?.message || `Fout ${r.status}`);
  return data;
}
const sessieFout = e => /sessie verlopen|log opnieuw in/i.test(e?.message || "");

async function uitloggen() {
  const token = sessieToken();
  sessieWeg();
  try { if (token) await rpc("verkoper_logout", { p_token: token }); } catch (e) { }
  location.replace("login.html");
}

/* ---------- gegevens in het geheugen van de pagina ---------- */

let IK = null;
const PERSONEN = [];
const ORDERS = [];
const BEWAARD = new Map();            /* id -> { json, versie }: wat de database nu heeft */
const LIJSTEN = {};                   /* soort -> { data, json, versie } */
const STANDAARD_PREMIESOORTEN = ["Inruilpremie", "ADG lease premie", "Unilease"];

function laadOrders() { return ORDERS; }
function laadImports() { return LIJSTEN.imports.data; }
function laadPremies() { return LIJSTEN.premies.data; }
function laadPremiesoorten() { return LIJSTEN.premiesoorten.data; }
function bewaarImports(lijst) { lijstBewaren("imports", lijst); }
function bewaarPremies(lijst) { lijstBewaren("premies", lijst); }
function bewaarPremiesoorten(lijst) { lijstBewaren("premiesoorten", lijst); }

/* de premies die nu gelden voor een model, in de volgorde van de premiesoorten */
function premiesVoor(model) {
  const soorten = laadPremiesoorten();
  return laadPremies().filter(p => p.model === model && (!p.tot || dagenTot(p.tot) >= 0))
    .sort((a, b) => soorten.indexOf(a.soort) - soorten.indexOf(b.soort));
}

/* ---------- opslaan ----------
   bewaar() kijkt per order wat er sinds het laden is veranderd en stuurt alleen dat naar
   de database, één voor één. Heeft een collega de order intussen gewijzigd, dan weigert de
   database en laadt de pagina opnieuw met de nieuwste versie: niemand overschrijft
   andermans werk zonder het te zien. */

let wachtrij = Promise.resolve();
let openstaand = 0;
const ingepland = new Set();

function inplannen(sleutel, taak) {
  if (ingepland.has(sleutel)) return;
  ingepland.add(sleutel);
  openstaand++;
  wachtrij = wachtrij.then(async () => {
    ingepland.delete(sleutel);
    try { await taak(); } catch (e) { opslagFout(e); } finally { openstaand--; }
  });
}
function wachtOpOpslaan() { return wachtrij; }

function bewaar() {
  for (const o of ORDERS) {
    const b = BEWAARD.get(o.id);
    if (!b || b.json !== JSON.stringify(o)) inplannen(`o:${o.id}`, () => orderOpslaan(o.id));
  }
  for (const id of BEWAARD.keys()) {
    if (!ORDERS.some(o => o.id === id)) inplannen(`o:${id}`, () => orderOpslaan(id));
  }
}

async function orderOpslaan(id) {
  const o = ORDERS.find(x => x.id === id);
  const b = BEWAARD.get(id);
  if (!o) {
    if (!b) return;
    await rpc("aflever_dossier_verwijderen", { p_token: sessieToken(), p_id: id });
    BEWAARD.delete(id);
    return;
  }
  const json = JSON.stringify(o);
  if (b && b.json === json) return;
  const versie = await rpc("aflever_dossier_opslaan", { p_token: sessieToken(), p_id: id, p_data: JSON.parse(json), p_versie: b ? b.versie : null });
  BEWAARD.set(id, { json, versie });
}

function lijstBewaren(soort, lijst) {
  LIJSTEN[soort].data = lijst;
  if (JSON.stringify(lijst) === LIJSTEN[soort].json) return;
  inplannen(`l:${soort}`, async () => {
    const l = LIJSTEN[soort];
    const json = JSON.stringify(l.data);
    if (json === l.json) return;
    l.versie = await rpc("aflever_lijst_opslaan", { p_token: sessieToken(), p_soort: soort, p_data: JSON.parse(json), p_versie: l.versie });
    l.json = json;
  });
}

let herladenGepland = false;
function opslagFout(e) {
  if (sessieFout(e)) { sessieWeg(); naarLogin("Je sessie is verlopen. Log opnieuw in; je laatste wijziging is niet opgeslagen."); return; }
  const tekst = /collega/i.test(e.message)
    ? `${e.message}. De pagina laadt opnieuw met de nieuwste versie; doe je laatste wijziging daarna nog een keer.`
    : `Opslaan mislukt: ${/fetch|network/i.test(e.message) ? "geen verbinding" : e.message}. De pagina laadt opnieuw zodat je ziet wat er wel is opgeslagen.`;
  toast(tekst);
  if (!herladenGepland) { herladenGepland = true; setTimeout(() => location.reload(), 4500); }
}

addEventListener("beforeunload", e => { if (openstaand > 0) { e.preventDefault(); e.returnValue = ""; } });

/* ---------- doorgezette offertes uit de offertemodule ----------
   Zet een verkoper in de offertemodule een offerte op verkocht, dan staat hij hier bij het
   volgende openen als concept, grotendeels ingevuld. Contract: docs/koppeling-offertemodule.md. */

function orderVanKoppeling(rij) {
  const p = rij.payload || {};
  const klant = p.klant || {};
  const auto = p.auto || {};
  const nu_ = nu();
  const model = (auto.model || "").replace(" MY26", "");
  const opm = [p.financieringsvoorbehoud ? "Verkocht onder voorbehoud van financiering." : ""].filter(Boolean).join(" ");
  const o = {
    id: rij.offerte_id, ordernummer: rij.offerte_id, concept: true, bron: "offertemodule",
    type: p.type === "gebruikt" ? "gebruikt" : "nieuw",
    voorraad: null,
    verkoper: rij.verkoper,
    aangemaakt: nu_,
    levertijd: rij.levertijd || "",
    mastercare: !!p.mastercare,
    heeftInruil: (p.inruil || []).length > 0,
    klant: { naam: klant.naam || "", email: klant.email || "", tel: klant.tel || "", postcode: klant.postcode || "", huisnr: klant.huisnr || "" },
    auto: { model, uitvoering: auto.uitvoering || "", kleur: auto.kleur || "", chassis: auto.chassis || "", kenteken: auto.kenteken || "", phev: !!auto.phev },
    accessoires: (p.accessoires || []).map(naam => ({ naam })),
    werkplaatsregels: p.werkplaatsregels || [],
    te_betalen: p.te_betalen ?? "",
    opm_verkoop: opm,
    vink: {}, contact: [], opmerkingen: [],
    log: [{ op: nu_, door: rij.verkoper, wat: `Order binnengekomen uit de offertemodule: offerte ${rij.offerte_id} verkocht, verwachte levering ${datumKort(rij.levertijd)}` }]
  };
  if (o.heeftInruil) {
    const [a, b] = p.inruil;
    o.inruil = { kenteken: a.kenteken || "", boekwaarde: a.waarde || "", opm: b ? `Tweede inruilauto: ${[b.model, b.kenteken].filter(Boolean).join(", ")}` : "" };
  }
  return o;
}

/* ---------- opstarten ---------- */

function laadScript(src) {
  return new Promise((ok, fout) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = ok;
    s.onerror = () => fout(new Error(`${src} niet geladen`));
    document.body.append(s);
  });
}

function startFout(tekst) {
  document.body.classList.remove("laden");
  document.body.insertAdjacentHTML("afterbegin",
    `<div class="melding rood" style="margin:24px">${esc(tekst)} <a href="${esc(location.href)}">Opnieuw proberen</a></div>`);
}

async function opstarten() {
  const token = sessieToken();
  if (!token) return;
  if (typeof vroegeKopbalk === "function") vroegeKopbalk();
  let d;
  try {
    d = await rpc("aflever_start", { p_token: token });
  } catch (e) {
    if (sessieFout(e)) { sessieWeg(); naarLogin("Je sessie is verlopen. Log opnieuw in."); return; }
    if (/geen toegang/i.test(e.message)) {
      sessieWeg();
      try { await rpc("verkoper_logout", { p_token: token }); } catch (e2) { }
      naarLogin(e.message);
      return;
    }
    startFout(`De gegevens konden niet worden geladen (${/fetch|network/i.test(e.message) ? "geen verbinding" : e.message}).`);
    return;
  }

  IK = d.ik;
  try { sessionStorage.setItem("byd-ik", JSON.stringify(IK)); } catch (e) { }
  PERSONEN.push(...d.personen);
  if (!PERSONEN.some(p => p.naam === IK.naam)) PERSONEN.push({ naam: IK.naam, rol: IK.rol });
  for (const r of d.dossiers) {
    ORDERS.push(r.data);
    BEWAARD.set(r.data.id, { json: JSON.stringify(r.data), versie: r.versie });
  }
  for (const soort of ["imports", "premies", "premiesoorten"]) {
    const l = d.lijsten[soort];
    LIJSTEN[soort] = l
      ? { data: l.data, json: JSON.stringify(l.data), versie: l.versie }
      : { data: soort === "premiesoorten" ? [...STANDAARD_PREMIESOORTEN] : [], json: null, versie: null };
  }

  /* verkochte offertes die nog geen order zijn: nu als concept aanmaken */
  let binnen = 0;
  if (["verkoper", "afleverspecialist", "manager"].includes(IK.rol)) {
    for (const rij of d.binnengekomen) {
      if (ORDERS.some(o => o.id === rij.offerte_id || o.ordernummer === rij.offerte_id)) continue;
      const o = orderVanKoppeling(rij);
      try {
        await rpc("aflever_dossier_opslaan", { p_token: token, p_id: o.id, p_data: o, p_versie: null });
        ORDERS.push(o);
        BEWAARD.set(o.id, { json: JSON.stringify(o), versie: 1 });
        binnen++;
      } catch (e) { /* een collega was net eerder; staat er bij het volgende openen */ }
    }
  }

  /* orders en importlijst op chassisnummer gelijktrekken */
  if (koppelImports(ORDERS, LIJSTEN.imports.data)) { bewaar(); bewaarImports(LIJSTEN.imports.data); }

  document.documentElement.style.visibility = "";
  try {
    for (const el of document.querySelectorAll("script[data-start]")) await laadScript(el.dataset.start);
  } catch (e) {
    if (e.message !== "andere startpagina") startFout(e.message);
    return;
  }
  document.body.classList.remove("laden");
  if (binnen) toast(`${binnen} ${binnen === 1 ? "verkochte offerte" : "verkochte offertes"} uit de offertemodule binnengekomen als concept.`, "groen");
}

if (!OP_LOGIN) document.addEventListener("DOMContentLoaded", opstarten);
