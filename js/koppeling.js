/* ==========================================================================
   Koppeling met de offertemodule (2026-11-04).

   Zet een verkoper in de offertemodule een offerte op verkocht ("Print definitief
   contract"), dan schrijft die module de order in de database (schema aflever, tabel
   orders). Dit bestand haalt die orders op en zet ze hier als concept neer, grotendeels
   ingevuld: klant, auto, bedrag, inruil, accessoires, werkplaatsregels en de verwachte
   leverdatum die de verkoper bij het verkopen invult.

   Ophalen kan alleen met een geldige login van de offertemodule (zelfde account). Het
   token staat in localStorage; verbinden gaat via het blokje onderin het menu. Zodra deze
   module echte logins heeft (v0.1), vervalt dat losse verbinden en loopt dit mee met de
   sessie. Contract van de koppeling: docs/koppeling-offertemodule.md in de werkmap.
   ========================================================================== */

const KOPPELING_URL = "https://vvdtotcxjjeydnowzksf.supabase.co";
const KOPPELING_KEY = "sb_publishable_S96X4kgnlhZN2lzM5ne2rg_-QuN-AwQ"; /* publieke anon-key, zelfde als de offertemodule */
const KOPPELING_OPSLAG = "byd-aflever-koppeling";

function koppelingAuth() {
  try { return JSON.parse(localStorage.getItem(KOPPELING_OPSLAG)); } catch (e) { return null; }
}
function koppelingBewaar(auth) {
  try {
    if (auth) localStorage.setItem(KOPPELING_OPSLAG, JSON.stringify(auth));
    else localStorage.removeItem(KOPPELING_OPSLAG);
  } catch (e) { }
}

/* Eén RPC-aanroep naar Supabase, zonder bibliotheek: het prototype heeft er geen. */
async function koppelingRpc(naam, params) {
  const r = await fetch(`${KOPPELING_URL}/rest/v1/rpc/${naam}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: KOPPELING_KEY, Authorization: `Bearer ${KOPPELING_KEY}` },
    body: JSON.stringify(params)
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(data?.message || `Fout ${r.status}`);
  return data;
}

/* ---------- payload uit de offertemodule omzetten naar een order hier ----------
   Alles wat de offerte niet weet (aanhef, voorraadherkomst, OTT, BNP) blijft open en
   vult de verkoper in fase 1 in; daarom komt de order binnen als concept. */
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
    aangemaakt: (rij.aangemaakt || "").slice(0, 16) || nu_,
    levertijd: rij.levertijd || "",
    mastercare: !!p.mastercare,
    heeftInruil: (p.inruil || []).length > 0,
    klant: { naam: klant.naam || "", email: klant.email || "", tel: klant.tel || "", postcode: klant.postcode || "", huisnr: klant.huisnr || "" },
    auto: { model, chassis: auto.chassis || "", kenteken: auto.kenteken || "", phev: !!auto.phev },
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

/* Orders ophalen en als concept neerzetten. Idempotent: een ordernummer dat hier al
   bestaat wordt overgeslagen, zodat elke browser dezelfde lijst kan opbouwen zonder
   dubbelen en zonder werk van een collega te overschrijven. */
async function koppelingOphalen(stil = true) {
  const auth = koppelingAuth();
  if (!auth?.token) return;
  let rijen;
  try {
    rijen = await koppelingRpc("aflever_concepten_ophalen", { p_token: auth.token });
  } catch (e) {
    if (/sessie verlopen/i.test(e.message)) {
      koppelingBewaar(null);
      koppelingBlok();
      if (!stil) toast("De koppeling met de offertemodule is verlopen. Verbind opnieuw via het menu.");
    } else if (!stil) toast(`Ophalen uit de offertemodule mislukt: ${e.message}`);
    return;
  }
  const orders = laadOrders();
  const nieuw = [];
  for (const rij of rijen || []) {
    if (orders.some(o => o.id === rij.offerte_id || o.ordernummer === rij.offerte_id)) continue;
    nieuw.push(orderVanKoppeling(rij));
  }
  if (!nieuw.length) { if (!stil) toast("Geen nieuwe verkochte offertes."); return; }
  orders.push(...nieuw);
  bewaar(orders);
  toast(`${nieuw.length} ${nieuw.length === 1 ? "verkochte offerte" : "verkochte offertes"} uit de offertemodule binnengekomen als concept.`, "groen");
  setTimeout(() => location.reload(), 1600);
}

/* ---------- verbinden: klein blokje onderin het zijmenu ---------- */

function koppelingBlok() {
  const onder = document.querySelector(".zij-onder");
  if (!onder) return;
  let blok = document.getElementById("koppeling_blok");
  if (!blok) {
    blok = document.createElement("div");
    blok.id = "koppeling_blok";
    blok.className = "bekijk";
    onder.insertBefore(blok, onder.querySelector(".proto"));
  }
  const auth = koppelingAuth();
  blok.innerHTML = auth
    ? `<span class="veld-lbl">Offertemodule</span>
       <p class="proto" style="margin:0">Verbonden als ${esc(auth.verkoper)}. Verkochte offertes komen hier binnen als concept.</p>
       <button type="button" class="knop" id="koppeling_uit">Verbinding verbreken</button>`
    : `<span class="veld-lbl">Offertemodule</span>
       <p class="proto" style="margin:0">Niet verbonden. Verbind met je offertemodule-account om verkochte offertes op te halen.</p>
       <button type="button" class="knop" id="koppeling_aan">Verbinden</button>`;
  blok.querySelector("#koppeling_uit")?.addEventListener("click", () => { koppelingBewaar(null); koppelingBlok(); });
  blok.querySelector("#koppeling_aan")?.addEventListener("click", koppelingDialoog);
}

function koppelingDialoog() {
  let dlg = document.getElementById("koppeling_dlg");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = "koppeling_dlg";
    dlg.className = "venster";
    dlg.innerHTML = `
      <form method="dialog" class="venster-kop">
        <div><h2>Verbinden met de offertemodule</h2><p>Zelfde e-mailadres en wachtwoord als in de offertemodule.</p></div>
        <button class="knop" aria-label="Sluiten">Sluiten</button>
      </form>
      <form class="zij-form" id="koppeling_form" style="margin:0 20px 20px;border-top:none;padding-top:0">
        <label class="veld-lbl" for="koppeling_mail">E-mailadres</label>
        <input id="koppeling_mail" class="invoer" type="email" autocomplete="username" required>
        <label class="veld-lbl" for="koppeling_ww">Wachtwoord</label>
        <input id="koppeling_ww" class="invoer" type="password" autocomplete="current-password" required>
        <p class="meta rood" id="koppeling_fout"></p>
        <button class="knop donker">Verbinden en ophalen</button>
      </form>`;
    document.body.append(dlg);
    dlg.querySelector("#koppeling_form").addEventListener("submit", async e => {
      e.preventDefault();
      const fout = document.getElementById("koppeling_fout");
      fout.textContent = "";
      try {
        const data = await koppelingRpc("verkoper_login", {
          p_username: document.getElementById("koppeling_mail").value.trim(),
          p_password: document.getElementById("koppeling_ww").value
        });
        const rij = Array.isArray(data) ? data[0] : data;
        if (!rij?.token) throw new Error("Inloggen mislukt.");
        koppelingBewaar({ token: rij.token, verkoper: rij.verkoper });
        dlg.close();
        koppelingBlok();
        toast(`Verbonden als ${rij.verkoper}.`, "groen");
        koppelingOphalen(false);
      } catch (err) {
        fout.textContent = err.message || "Inloggen mislukt.";
      }
    });
  }
  document.getElementById("koppeling_fout").textContent = "";
  dlg.showModal();
}

koppelingBlok();
koppelingOphalen();
