/* ROUTER-WRAP: dit paginascript draait opnieuw bij navigatie in het geheugen (zie js/ui.js).
   Daarom staat alles in een eigen functiebereik: zo botsen de const-namen niet met die van
   een vorige pagina en kan het script zonder herlading opnieuw. */
(() => {
/* Behandeld: alles wat de werkplaats heeft afgevinkt, nieuwste bovenaan. Terugzetten kan,
   en komt met naam en tijd in het logboek van de order. */

const ik = kopbalk("behandeld");
const orders = laadOrders();
const bak = document.getElementById("behandeld");

const WP_TAKEN = {
  w_gecontroleerd: "Onderdelen gecontroleerd en ingevoerd",
  wp_ingepland: "Ingepland in de werkplaats",
  wp_klaar: "WP-klaar gemeld",
  getankt: "Getankt"
};
const werkplaats = new Set(PERSONEN.filter(p => p.rol === "serviceadviseur").map(p => p.naam));

function teken() {
  const gedaan = orders.filter(o => !o.vink.afgeleverd).flatMap(o =>
    Object.entries(WP_TAKEN).filter(([k]) => o.vink[k] && werkplaats.has(o.vink[k].door)).map(([k, label]) => ({ o, k, label, ...o.vink[k] })))
    .sort((a, b) => b.op.localeCompare(a.op));
  const terug = orders.flatMap(o => o.log.filter(l => l.terug).map(l => ({ o, ...l }))).sort((a, b) => b.op.localeCompare(a.op));

  bak.innerHTML = `
    <section class="taken-groep"><h2>Afgevinkt <span class="n">${gedaan.length}</span></h2>
      ${gedaan.length ? `<div class="rijen">${gedaan.map(t => `<div class="taak met-knop">
        <span class="stip st-groen"></span>
        <div><a class="wie" href="order.html?id=${t.o.id}">${esc(klantNaam(t.o))}</a><div class="sub">${esc(autoNaam(t.o))} · ${esc(t.o.auto.kenteken || "meldcode " + meldcode(t.o))}</div></div>
        <div class="wat"><div class="kop">${t.label}</div><div class="sub">${esc(t.door)}, ${tijdstip(t.op)}</div></div>
        <button type="button" class="knop" data-terug="${t.o.id}:${t.k}">Terugzetten</button></div>`).join("")}</div>`
      : `<div class="leeg-staat klein"><h2>Nog niets afgevinkt</h2></div>`}
    </section>
    <section class="taken-groep"><h2>Logboek teruggezet <span class="n">${terug.length}</span></h2>
      ${terug.length ? `<div class="rijen">${terug.map(l => `<div class="taak">
        <span class="stip st-oranje"></span>
        <div><a class="wie" href="order.html?id=${l.o.id}">${esc(klantNaam(l.o))}</a><div class="sub">${esc(autoNaam(l.o))}</div></div>
        <div class="wat"><div class="kop">${esc(l.wat)}</div>${l.reden ? `<div class="sub">${esc(l.reden)}</div>` : ""}</div>
        <div class="wanneer">${esc(l.door)}, ${tijdstip(l.op)}</div></div>`).join("")}</div>`
      : `<p class="zij-leeg">Nog niets teruggezet.</p>`}
    </section>`;
}

bak.addEventListener("click", e => {
  const b = e.target.closest("[data-terug]"); if (!b) return;
  const [id, k] = b.dataset.terug.split(":");
  const o = orders.find(x => x.id === id);
  const reden = prompt(`${WP_TAKEN[k]} terugzetten voor ${klantNaam(o)}. Waarom? (komt in het logboek)`);
  if (reden === null) return;
  delete o.vink[k];
  o.log.push({ op: nu(), door: ik.naam, wat: `${WP_TAKEN[k]} teruggezet`, reden: reden.trim(), terug: true });
  bewaar(orders);
  toast(`${WP_TAKEN[k]} teruggezet. De taak staat weer open.`);
  teken();
});

teken();

})();
