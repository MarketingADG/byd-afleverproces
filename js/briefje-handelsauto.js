/* Printbriefje (briefje-handelsauto.html). Draait pas als de gegevens geladen zijn. */

const o = laadOrders().find(x => x.id === new URLSearchParams(location.search).get("id"));
const lang = iso => { const d = naarDatum(iso); return `${d.getDate()} ${["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"][d.getMonth()]} ${d.getFullYear()}`; };

function teken(auto) {
  const ingeleverd = o.vink.afgeleverd?.op.slice(0, 10);
  document.getElementById("vel").innerHTML = `
    <div class="vel">
      <div class="boven"><img src="assets/adg-groep.svg" alt="ADG Groep"><span class="wat">Inruil</span></div>
      <h1>Handelsauto</h1>
      <div class="plaat">${esc(o.inruil.kenteken.toUpperCase())}</div>
      ${auto ? `<div class="auto">${esc(auto.merk)} ${esc(auto.model || "")}</div>` : `<div class="auto leeg">Merk en model niet gevonden bij de RDW.</div>`}
      <div class="onder">
        <div><div class="lbl">Ingeleverd op</div><div class="w">${ingeleverd ? lang(ingeleverd) : "Nog niet afgeleverd"}</div></div>
        <div><div class="lbl">Verkoper</div><div class="w">${esc(o.verkoper)}</div></div>
      </div>
    </div>`;
}

if (!o || !o.heeftInruil || !o.inruil?.kenteken) {
  document.getElementById("vel").innerHTML = `<p style="text-align:center">Geen inruil gevonden bij deze order.</p>`;
} else if (o.inruil.merk) {
  teken({ merk: o.inruil.merk, model: o.inruil.model });
} else {
  /* nog niet opgehaald bij het invullen: nu alsnog bij de RDW */
  document.getElementById("vel").innerHTML = `<p style="text-align:center">Merk en model ophalen bij de RDW...</p>`;
  rdwAuto(o.inruil.kenteken).then(teken);
}

document.getElementById("printen").addEventListener("click", () => print());
