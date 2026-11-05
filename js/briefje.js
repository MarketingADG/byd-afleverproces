/* Printbriefje (briefje.html). Draait pas als de gegevens geladen zijn. */

const o = laadOrders().find(x => x.id === new URLSearchParams(location.search).get("id"));
const lang = iso => { const d = naarDatum(iso); return `${["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"][d.getDay()]} ${d.getDate()} ${["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"][d.getMonth()]}`; };
document.getElementById("vel").outerHTML = o ? `
  <div class="vel">
    <div class="boven"><img src="assets/adg-groep.svg" alt="ADG Groep"><span class="wat">Aflevering</span></div>
    <div class="midden">
      <div>
        <div class="datum">${o.afleverdatum ? lang(o.afleverdatum) : "Datum nog niet gepland"}</div>
        ${o.aflevertijd ? `<div class="tijd">${blokTekst(o.aflevertijd)} uur</div>` : ""}
      </div>
      <div class="meldcode"><div class="lbl">Meldcode</div><div class="code">${esc(meldcode(o) || "----")}</div></div>
    </div>
    <div class="klant">${esc(klantNaam(o))}</div>
    <div class="auto">${esc(autoNaam(o))}${o.auto.kenteken ? " · " + esc(o.auto.kenteken) : ""}</div>
    <div class="onder">
      <div><div class="lbl">Mastercare</div><div class="w ${o.mastercare ? "mc" : ""}">${o.mastercare ? "Ja" : "Nee"}</div></div>
      <div><div class="lbl">Verkoper</div><div class="w">${esc(o.verkoper)}</div></div>
    </div>
  </div>` : `<p style="text-align:center">Order niet gevonden.</p>`;

document.getElementById("printen").addEventListener("click", () => print());
