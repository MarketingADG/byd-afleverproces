/* ROUTER-WRAP: dit paginascript draait opnieuw bij navigatie in het geheugen (zie js/ui.js).
   Daarom staat alles in een eigen functiebereik: zo botsen de const-namen niet met die van
   een vorige pagina en kan het script zonder herlading opnieuw. */
(() => {
/* Poetsplanning: alleen ter informatie. Toont de afleveringen van vandaag tot en met
   overmorgen, zodat je ziet welke auto's nog gepoetst moeten worden. Gemaakt voor de
   telefoon van de poetser. Gepoetst = "Gepoetst in de showroom" afgevinkt in de order. */

const ik = kopbalk("poetsen");
const orders = laadOrders();
const bak = document.getElementById("poetsen");

const vorm = o => o.poets?.vorm || (o.mastercare ? "Mastercare" : "Standaard");

function teken() {
  const lijst = orders.filter(teZienInPoetsplanning)
    .sort((a, b) => a.afleverdatum.localeCompare(b.afleverdatum) || (a.aflevertijd || "").localeCompare(b.aflevertijd || ""));
  const dagen = [0, 1, 2].map(n => plusDagen(naarIso(vandaag()), n));

  bak.innerHTML = dagen.map(d => {
    const hier = lijst.filter(o => o.afleverdatum === d);
    const nog = hier.filter(o => !gepoetst(o)).length;
    return `<section class="poets-dag"><h2>${relatief(d) === "vandaag" ? "Vandaag" : relatief(d) === "morgen" ? "Morgen" : "Overmorgen"}, ${datumKort(d)}${hier.length ? ` · ${nog ? `${nog} nog poetsen` : "alles gepoetst"}` : ""}</h2>
      ${hier.map(o => `
        <div class="poets-kaart ${gepoetst(o) ? "gedaan" : ""}">
          <div class="boven">
            <div><div class="auto">${esc(autoNaam(o))}</div><div class="kent">${esc(o.auto.kenteken || "Nog geen kenteken")} · meldcode ${esc(meldcode(o))}</div></div>
            <span class="mc ${vorm(o) === "Mastercare" ? "ja" : "nee"}">${vorm(o)}</span>
          </div>
          <div class="feit">Aflevering ${o.aflevertijd ? blokTekst(o.aflevertijd) : "tijd nog niet gepland"} · ${esc(klantNaam(o))}</div>
          <div class="feit"><b>${gepoetst(o) ? "Gepoetst" : "Nog poetsen"}</b>${!gepoetst(o) && o.poets?.datum ? `, ingepland ${datumKort(o.poets.datum)}` : ""}</div>
        </div>`).join("") || `<p class="dag-leeg">Geen afleveringen</p>`}
    </section>`;
  }).join("");
}

teken();

})();
