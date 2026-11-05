/* Premierapport voor BYD (BYD Rebate Monthly Report). De manager kiest op de premielijst een
   periode en downloadt alle nieuwe BYD's met een premie in het Excel-template van BYD.

   Selectie op tenaamstellingsdatum: die komt per kenteken uit de open data van de RDW
   (datum eerste tenaamstelling in Nederland). Vindt de RDW het kenteken niet, of is de RDW
   niet bereikbaar, dan telt de afleverdatum. Kiezen op afleverdatum mag ook.

   Wat de tool niet weet (MSRP, klantkorting, bonusrecht) blijft leeg in het template; dat
   vult de manager in Excel aan. Het template in assets/ is leeg: geen klantgegevens in site/. */

const REBATE_TEMPLATE = "assets/byd-rebate-template.xlsx?v=20261104";
const EURO_BYD = '_ [$€-2]\\ * #,##0.00_ ;_ [$€-2]\\ * \\-#,##0.00_ ;_ [$€-2]\\ * "-"??_ ;_ @_ ';
const EURO_NL = '_ [$€-413]\\ * #,##0.00_ ;_ [$€-413]\\ * \\-#,##0.00_ ;_ [$€-413]\\ * "-"??_ ;_ @_ ';
const rdwCache = new Map();

function kentekenKaal(k) { return String(k || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function isVin(c) { return /^[A-HJ-NPR-Z0-9]{17}$/i.test(c || ""); }
function heeftPremie(o) { return (!!o.premie?.id && o.premie.id !== "geen") || (!!o.heeftDeal && !!(o.deal?.code || o.deal?.bedrag)); }
function afleverDag(o) { return o.vink?.afgeleverd?.op?.slice(0, 10) || o.afleverdatum || ""; }

/* Tenaamstellingsdatum per kenteken, 50 kentekens per vraag aan de RDW. Geeft false terug
   als de RDW niet bereikbaar was. Hoort het kenteken bij de RDW niet bij een BYD (tikfout),
   dan telt de datum niet: in de cache staat dan "geen-byd". */
async function rdwTenaamstellingen(kentekens) {
  const nieuw = [...new Set(kentekens)].filter(k => k.length === 6 && !rdwCache.has(k));
  let gelukt = true;
  for (let i = 0; i < nieuw.length; i += 50) {
    const deel = nieuw.slice(i, i + 50);
    const waar = `kenteken in(${deel.map(k => `'${k}'`).join(",")})`;
    try {
      const r = await fetch(`https://opendata.rdw.nl/resource/m9d7-ebf2.json?$select=kenteken,merk,datum_eerste_tenaamstelling_in_nederland_dt,datum_tenaamstelling_dt&$where=${encodeURIComponent(waar)}`);
      if (!r.ok) throw new Error(r.status);
      const gevonden = await r.json();
      deel.forEach(k => rdwCache.set(k, ""));
      gevonden.forEach(a => rdwCache.set(a.kenteken, a.merk !== "BYD" ? "geen-byd"
        : (a.datum_eerste_tenaamstelling_in_nederland_dt || a.datum_tenaamstelling_dt || "").slice(0, 10)));
    } catch (e) { gelukt = false; }
  }
  return gelukt;
}

/* De auto's voor het rapport, met per auto wat er in het template komt en wat er ontbreekt. */
async function rebateRijen({ van, tot, op, ookZonder }) {
  const kandidaten = laadOrders().filter(o => !o.concept && o.type === "nieuw" && (ookZonder || heeftPremie(o)));
  const rdwGelukt = op === "tenaamstelling" ? await rdwTenaamstellingen(kandidaten.map(o => kentekenKaal(o.auto?.kenteken))) : true;
  const rijen = [];
  for (const o of kandidaten) {
    const kenteken = kentekenKaal(o.auto?.kenteken);
    const rdwWaarde = rdwCache.get(kenteken) || "";
    const rdw = rdwWaarde === "geen-byd" ? "" : rdwWaarde;
    const aflevering = afleverDag(o);
    const gepland = !o.vink?.afgeleverd;
    const datum = op === "tenaamstelling" && rdw ? rdw : aflevering;
    if (!datum || datum < van || datum > tot) continue;

    const premie = o.premie?.id && o.premie.id !== "geen" ? o.premie : null;
    const deal = o.heeftDeal ? o.deal || {} : null;
    const steun = premie ? Number(premie.bedrag) || 0 : deal ? Number(deal.bedrag) || 0 : 0;
    const vin = isVin(o.auto?.chassis) ? o.auto.chassis.toUpperCase() : "";
    const ontbreekt = [];
    if (o.gewist) ontbreekt.push("klantnaam gewist");
    if (!kenteken) ontbreekt.push("kenteken");
    if (!vin) ontbreekt.push("VIN");
    if (!o.auto?.uitvoering) ontbreekt.push("uitvoering");
    if (!o.kanaal) ontbreekt.push("verkoopkanaal");
    if (!o.verkoopprijs) ontbreekt.push("verkoopprijs");
    if (kenteken && rdwWaarde === "geen-byd" && op === "tenaamstelling") ontbreekt.push("kenteken is bij de RDW geen BYD, afleverdatum gebruikt");
    else if (kenteken && !rdw && op === "tenaamstelling") ontbreekt.push("tenaamstelling niet bij de RDW, afleverdatum gebruikt");

    rijen.push({
      o, kenteken, vin, steun, premie, deal, datum, ontbreekt,
      bron: op === "tenaamstelling" && rdw ? "RDW" : gepland ? "geplande aflevering" : "aflevering",
      klant: o.gewist ? "" : klantNaam(o),
      orderDatum: o.vink?.bgpc?.op?.slice(0, 10) || (o.aangemaakt || "").slice(0, 10),
      regDatum: rdw || aflevering,
      dealcode: deal?.code || premie?.code || "",
      comment: [premie && `${premie.soort} ${bedrag(premie.bedrag)}`, deal && [`Speciale deal`, deal.omschrijving].filter(Boolean).join(": ")].filter(Boolean).join(". ")
    });
  }
  rijen.sort((a, b) => a.datum.localeCompare(b.datum) || a.kenteken.localeCompare(b.kenteken));
  return { rijen, rdwGelukt };
}

/* ---------- Excel ---------- */

async function laadExcelJS() {
  if (window.ExcelJS) return;
  await new Promise((ok, fout) => {
    const s = document.createElement("script");
    s.src = "js/vendor/exceljs.min.js?v=4.4.0";
    s.onload = ok; s.onerror = () => fout(new Error("ExcelJS laadt niet"));
    document.head.append(s);
  });
}

/* Excel rekent datums in UTC; zo schuift een datum niet een dag op door de tijdzone. */
function xlDatum(iso) { if (!iso) return null; const [j, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(j, m - 1, d)); }

async function rebateExcel(rijen) {
  await laadExcelJS();
  const r = await fetch(REBATE_TEMPLATE);
  if (!r.ok) throw new Error("Template niet gevonden");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await r.arrayBuffer());
  const ws = wb.getWorksheet("Data Template_Dealer");

  ws.getCell("T1").value = "Verkoopprijs incl. btw";
  ws.getCell("T1").style = { ...ws.getCell("S1").style };
  ws.getColumn(20).width = 20;

  rijen.forEach((x, i) => {
    const n = i + 2;
    const zet = (kol, waarde, fmt) => { const c = ws.getCell(`${kol}${n}`); c.value = waarde; if (fmt) c.numFmt = fmt; };
    zet("A", x.klant); zet("B", x.kenteken); zet("C", x.o.auto?.model || ""); zet("D", x.o.auto?.uitvoering || "");
    zet("E", x.o.auto?.kleur || ""); zet("F", x.vin); zet("G", KANAAL_BYD[x.o.kanaal] || ""); zet("H", x.dealcode);
    zet("I", xlDatum(x.orderDatum), "dd/mm/yyyy"); zet("J", xlDatum(x.regDatum), "dd/mm/yyyy");
    zet("K", null, EURO_BYD); zet("L", null, "0.00%"); zet("M", null, EURO_NL); zet("N", null, EURO_NL);
    zet("O", { formula: `IF(K${n}>0,P${n}/K${n},"")`, result: "" }, "0.00%");
    zet("P", { formula: `Q${n}/1.21`, result: x.steun / 1.21 }, EURO_BYD);
    zet("Q", x.steun, EURO_BYD);
    zet("R", null); zet("S", x.comment);
    zet("T", x.o.verkoopprijs ? Number(x.o.verkoopprijs) : null, EURO_BYD);
  });
  const laatste = rijen.length + 1;
  const som = laatste + 2;
  const totaal = rijen.reduce((s, x) => s + x.steun, 0);
  ws.getCell(`O${som}`).value = "Totaal";
  ws.getCell(`P${som}`).value = { formula: `SUM(P2:P${laatste})`, result: totaal / 1.21 };
  ws.getCell(`Q${som}`).value = { formula: `SUM(Q2:Q${laatste})`, result: totaal };
  [`P${som}`, `Q${som}`].forEach(a => { ws.getCell(a).numFmt = EURO_BYD; ws.getCell(a).font = { bold: true }; });
  ws.getCell(`O${som}`).font = { bold: true };
  ws.autoFilter = `A1:T${laatste}`;

  /* Tweede tabblad voor de eigen controle: waar komt elke datum vandaan en wat mist er. */
  const ctl = wb.addWorksheet("ADG controle");
  ctl.columns = [
    ["Ordernummer", 14], ["Verkoper", 20], ["Klant", 24], ["Kenteken", 11], ["VIN", 21], ["Model", 16], ["Uitvoering", 14],
    ["Verkoopprijs incl. btw", 18], ["Premiesoort", 18], ["Premiecode", 14], ["Premie incl. btw", 15],
    ["Afleverdatum", 13], ["Tenaamstelling RDW", 18], ["Datum voor selectie", 18], ["Datum komt uit", 18], ["Ontbreekt", 60]
  ].map(([header, width]) => ({ header, width }));
  ctl.getRow(1).font = { bold: true };
  ctl.views = [{ state: "frozen", ySplit: 1 }];
  rijen.forEach(x => {
    const rij = ctl.addRow([x.o.ordernummer || x.o.id, x.o.verkoper, x.klant, x.kenteken, x.vin, x.o.auto?.model || "", x.o.auto?.uitvoering || "",
      x.o.verkoopprijs ? Number(x.o.verkoopprijs) : null, x.premie?.soort || (x.deal ? "Speciale deal" : "Geen premie"), x.dealcode, x.steun,
      xlDatum(afleverDag(x.o)), xlDatum(x.bron === "RDW" ? x.regDatum : ""), xlDatum(x.datum), x.bron, x.ontbreekt.join(", ")]);
    [8, 11].forEach(k => rij.getCell(k).numFmt = EURO_BYD);
    [12, 13, 14].forEach(k => rij.getCell(k).numFmt = "dd/mm/yyyy");
  });
  return wb.xlsx.writeBuffer();
}

function downloaden(buffer, naam) {
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: naam });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---------- scherm ---------- */

function vorigeMaand() {
  const d = vandaag();
  const eind = new Date(d.getFullYear(), d.getMonth(), 0);
  return { van: naarIso(new Date(eind.getFullYear(), eind.getMonth(), 1)), tot: naarIso(eind) };
}

function rebatePaneel(bak) {
  const { van, tot } = vorigeMaand();
  bak.innerHTML = `
    <section class="paneel" id="rebate-paneel">
      <h2>Premierapport voor BYD</h2>
      <p class="toelichting">Alle nieuwe BYD's met een premie in de gekozen periode, in het Rebate-template van BYD. MSRP, klantkorting en bonusrecht staan niet in de tool; die vul je in Excel aan. Het tabblad ADG controle laat per auto zien waar de datum vandaan komt.</p>
      <form id="f_rebate" class="form-grid">
        <div class="veld"><label class="veld-lbl" for="r_van">Van</label><input id="r_van" name="van" class="invoer" type="date" value="${van}" required></div>
        <div class="veld"><label class="veld-lbl" for="r_tot">Tot en met</label><input id="r_tot" name="tot" class="invoer" type="date" value="${tot}" required></div>
        <div class="veld"><label class="veld-lbl" for="r_op">Kies op</label><select id="r_op" name="op" class="invoer">
          <option value="tenaamstelling">Tenaamstelling (RDW)</option><option value="aflevering">Afleverdatum</option></select></div>
        <div class="veld"><span class="veld-lbl">&nbsp;</span><label class="vinkje"><input type="checkbox" name="ookZonder"> Ook auto's zonder premie</label></div>
      </form>
      <div id="rebate-uitkomst" aria-live="polite"></div>
    </section>`;

  const form = bak.querySelector("#f_rebate");
  const uit = bak.querySelector("#rebate-uitkomst");
  let laatste = null, beurt = 0;

  async function zoek() {
    const v = Object.fromEntries(new FormData(form));
    const keuze = { van: v.van, tot: v.tot, op: v.op, ookZonder: !!v.ookZonder };
    if (!keuze.van || !keuze.tot || keuze.van > keuze.tot) { uit.innerHTML = `<p class="zij-leeg">Kies een begindatum die vóór de einddatum ligt.</p>`; return; }
    const mijn = ++beurt;
    uit.innerHTML = `<p class="zij-leeg">${keuze.op === "tenaamstelling" ? "Tenaamstellingsdatums ophalen bij de RDW..." : "Auto's zoeken..."}</p>`;
    const { rijen, rdwGelukt } = await rebateRijen(keuze);
    if (mijn !== beurt) return;
    laatste = { rijen, keuze };
    const totaal = rijen.reduce((s, x) => s + x.steun, 0);
    const incompleet = rijen.filter(x => x.ontbreekt.length).length;
    uit.innerHTML = `
      ${rdwGelukt ? "" : `<div class="melding">De RDW was niet bereikbaar. Voor auto's zonder RDW-datum telt nu de afleverdatum.</div>`}
      <div class="rebate-kop">
        <p><b>${rijen.length} ${rijen.length === 1 ? "auto" : "auto's"}</b>, ${bedrag(totaal)} premie inclusief btw${incompleet ? `. Bij ${incompleet} ${incompleet === 1 ? "auto mist" : "auto's missen"} nog gegevens.` : "."}</p>
        <button type="button" class="knop donker" id="r_download" ${rijen.length ? "" : "disabled"}>Download Excel</button>
      </div>
      ${rijen.length ? `<div class="rebate-scroll"><table class="tabel rebate-tabel"><thead><tr><th>Datum</th><th>Kenteken</th><th>Auto</th><th>Klant</th><th class="nr">Premie</th><th class="nr">Verkoopprijs</th><th>Ontbreekt</th></tr></thead><tbody>
        ${rijen.map(x => `<tr>
          <td>${esc(datumKort(x.datum))}<div class="sub">${esc(x.bron)}</div></td>
          <td><a href="order.html?id=${encodeURIComponent(x.o.id)}">${esc(x.kenteken || "Geen kenteken")}</a></td>
          <td>${esc([x.o.auto?.model, x.o.auto?.uitvoering].filter(Boolean).join(" "))}<div class="sub">${esc(x.premie?.soort || (x.deal ? "Speciale deal" : "Geen premie"))}${x.dealcode ? ` · ${esc(x.dealcode)}` : ""}</div></td>
          <td>${esc(x.klant || "Gewist")}</td>
          <td class="nr">${esc(bedrag(x.steun))}</td>
          <td class="nr">${esc(bedrag(x.o.verkoopprijs))}</td>
          <td class="mist">${esc(x.ontbreekt.join(", "))}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="zij-leeg">Geen auto's met een premie in deze periode.</p>`}`;
  }

  form.addEventListener("change", zoek);
  form.addEventListener("submit", e => { e.preventDefault(); zoek(); });
  uit.addEventListener("click", async e => {
    if (e.target.id !== "r_download" || !laatste) return;
    const knop = e.target; knop.disabled = true; knop.textContent = "Excel maken...";
    try {
      const { van, tot } = laatste.keuze;
      downloaden(await rebateExcel(laatste.rijen), `BYD_Rebate_Monthly_Report_ADG_Groningen_${van}_tm_${tot}.xlsx`);
      toast(`Premierapport gedownload: ${laatste.rijen.length} auto's.`);
    } catch (fout) {
      toast("Het Excel-bestand kon niet gemaakt worden. Probeer het opnieuw.", "rood");
    }
    knop.disabled = false; knop.textContent = "Download Excel";
  });
  zoek();
}

const rebateBak = document.getElementById("rebate");
if (rebateBak && huidigePersoon().rol === "manager") rebatePaneel(rebateBak);
