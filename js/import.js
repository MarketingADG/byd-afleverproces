/* ROUTER-WRAP: dit paginascript draait opnieuw bij navigatie in het geheugen (zie js/ui.js).
   Daarom staat alles in een eigen functiebereik: zo botsen de const-namen niet met die van
   een vorige pagina en kan het script zonder herlading opnieuw. */
(() => {
/* Importlijst: elke auto die geïmporteerd wordt, verkocht of niet. Verkopers voegen een auto
   toe bij de inkoop. Elke auto loopt door zeven stappen (0 tot en met 6). Staat er een order
   met hetzelfde chassisnummer, dan werkt die automatisch mee: binnen gemeld, en bij stap 6
   het kenteken. */

const ik = kopbalk("import");
const orders = laadOrders();
const imports = laadImports();
const form = document.getElementById("f_import");
let weergave = "lopend";

const orderVan = imp => orders.find(o => o.auto.chassis === imp.chassis);

function rij(imp, i) {
  const o = orderVan(imp);
  const stand = importStand(imp);
  const klaar = stand === IMPORT_STAPPEN.length;
  const volgende = IMPORT_STAPPEN[stand];
  return `<div class="imp-rij in-beeld" style="--i:${i}" id="${esc(imp.chassis)}">
    <div><div class="wie">${esc(imp.merk)} ${esc(imp.model)}</div><div class="sub">${esc(imp.uitvoering)} · ${esc(imp.kleur_ext)}, interieur ${esc(imp.kleur_int.toLowerCase())} · ${imp.bouwjaar} · ${Number(imp.km).toLocaleString("nl-NL")} km</div></div>
    <div><div class="mono">${esc(imp.chassis)}</div><div class="sub">Meldcode ${esc(meldcode(imp))}${imp.kenteken ? " · " + esc(imp.kenteken) : ""}</div></div>
    <div>${o ? `<a class="wie" href="order.html?id=${o.id}">Verkocht aan ${esc(klantNaam(o))}</a><div class="sub">${esc(o.verkoper)}</div>` : `<div class="wie">Onverkocht</div><div class="sub">Toegevoegd door ${esc(imp.toegevoegd.door)}</div>`}</div>
    <div class="imp-voortgang">${delenBalk(importDelen(imp), "Import")}
      <div class="sub">${klaar ? "Klaar: kenteken bekend" : `Stap ${stand} van 6 · ${esc(volgende)}`}</div>
      <div class="imp-stap">
        ${klaar ? "" : stand === 6
          ? `<label class="vh" for="kent_${i}">Kenteken</label><input id="kent_${i}" class="invoer" placeholder="Kenteken" data-kenteken="${esc(imp.chassis)}"><button type="button" class="knop donker" data-volgende="${esc(imp.chassis)}">Kenteken opslaan</button>`
          : `<button type="button" class="knop donker" data-volgende="${esc(imp.chassis)}">${esc(volgende)}${stand === 1 ? " gestart" : ""}</button>`}
        ${stand ? `<button type="button" class="knop link" data-terug="${esc(imp.chassis)}">Stap terugzetten</button>` : ""}
      </div>
    </div>
  </div>`;
}

function teken() {
  const zoek = document.getElementById("zoek").value.trim().toLowerCase();
  const tel = { lopend: 0, klaar: 0, onverkocht: 0, alles: imports.length };
  imports.forEach(i => { if (i.kenteken) tel.klaar++; else tel.lopend++; if (!orderVan(i)) tel.onverkocht++; });
  document.getElementById("weergave").innerHTML = [["lopend", "Lopend"], ["onverkocht", "Onverkocht"], ["klaar", "Kenteken bekend"], ["alles", "Alles"]]
    .map(([k, t]) => `<button type="button" data-weergave="${k}" class="${weergave === k ? "aan" : ""}" aria-pressed="${weergave === k}">${t} <span class="n">${tel[k]}</span></button>`).join("");

  const zichtbaar = imports.filter(i =>
    (weergave === "alles" || (weergave === "lopend" && !i.kenteken) || (weergave === "klaar" && i.kenteken) || (weergave === "onverkocht" && !orderVan(i))) &&
    (!zoek || [i.merk, i.model, i.uitvoering, i.chassis, orderVan(i) && klantNaam(orderVan(i))].join(" ").toLowerCase().includes(zoek)))
    .sort((a, b) => importStand(b) - importStand(a) || b.toegevoegd.op.localeCompare(a.toegevoegd.op));

  document.getElementById("lijst").innerHTML = zichtbaar.length
    ? `<div class="rijen">${zichtbaar.map(rij).join("")}</div>`
    : `<div class="leeg-staat"><h2>Geen auto's in deze lijst</h2></div>`;
  const doel = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (doel) { doel.classList.add("gemarkeerd"); doel.scrollIntoView({ block: "center" }); }
}

function bijwerken(imp, wat) {
  const o = orderVan(imp);
  (imp.log ??= []).push({ op: nu(), door: ik.naam, wat });
  if (o) o.log.push({ op: nu(), door: ik.naam, wat: `Importlijst: ${eersteKlein(wat)}` });
  koppelImports(orders, imports);
  bewaarImports(imports); bewaar(orders);
  return o;
}

opDocument("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  const d = b.dataset;
  if (d.weergave) { weergave = d.weergave; history.replaceState(null, "", location.pathname); teken(); return; }
  if (b.id === "toevoegen_open") { form.hidden = false; document.getElementById("i_merk").focus(); return; }
  if (b.id === "toevoegen_dicht") { form.reset(); form.hidden = true; return; }
  if (d.volgende) {
    const imp = imports.find(i => i.chassis === d.volgende);
    const stand = importStand(imp);
    if (stand === 6) {
      const kent = document.querySelector(`[data-kenteken="${CSS.escape(imp.chassis)}"]`).value.trim().toUpperCase();
      if (!kent) { toast("Vul eerst het kenteken in."); return; }
      imp.kenteken = kent;
    }
    imp.stappen[stand] = { door: ik.naam, op: nu() };
    const o = bijwerken(imp, `${IMPORT_STAPPEN[stand]}${stand === 6 ? ": " + imp.kenteken : ""}`);
    toast(o
      ? stand === 6 ? `Kenteken staat ook in de order van ${klantNaam(o)}. De auto schuift in het overzicht naar het afleverproces.`
        : stand === 0 ? `${klantNaam(o)}: auto staat ook in de order als binnen gemeld.` : `Bijgewerkt, ook in de order van ${klantNaam(o)}.`
      : `${IMPORT_STAPPEN[stand]} vastgelegd.`, stand === 6 ? "groen" : "");
    teken();
  }
  if (d.terug) {
    const imp = imports.find(i => i.chassis === d.terug);
    const stand = importStand(imp) - 1;
    if (!confirm(`"${IMPORT_STAPPEN[stand]}" terugzetten voor ${imp.merk} ${imp.model}?`)) return;
    delete imp.stappen[stand];
    if (stand === 6) delete imp.kenteken;
    const o = orderVan(imp);
    if (stand === 0 && o) delete o.vink.binnen;
    bijwerken(imp, `${IMPORT_STAPPEN[stand]} teruggezet`);
    toast("Teruggezet. Dat staat in het logboek.");
    teken();
  }
});

form.addEventListener("submit", e => {
  e.preventDefault();
  const v = Object.fromEntries(new FormData(form));
  v.chassis = v.chassis.trim().toUpperCase();
  if (imports.some(i => i.chassis === v.chassis)) { toast("Dit chassisnummer staat al in de importlijst."); return; }
  imports.unshift({ ...v, bouwjaar: Number(v.bouwjaar), km: Number(v.km), toegevoegd: { door: ik.naam, op: nu() }, stappen: {}, log: [{ op: nu(), door: ik.naam, wat: "Toegevoegd aan de importlijst" }] });
  koppelImports(orders, imports);
  bewaarImports(imports);
  form.reset(); form.hidden = true;
  weergave = "lopend";
  toast(`${v.merk} ${v.model} staat in de importlijst. Verkoop je hem, kies hem dan bij fase 1 van de order.`);
  teken();
});

document.getElementById("zoek").addEventListener("input", teken);
teken();

})();
