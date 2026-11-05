/* ROUTER-WRAP: dit paginascript draait opnieuw bij navigatie in het geheugen (zie js/ui.js).
   Daarom staat alles in een eigen functiebereik: zo botsen de const-namen niet met die van
   een vorige pagina en kan het script zonder herlading opnieuw. */
(() => {
/* Dashboard voor de manager. Alle cijfers worden uit de orders berekend. NPS per maand
   volgt zodra de bron van de NPS bekend is (open vraag 3 in docs/plan.md). */

const ik = kopbalk("dashboard");
const orders = laadOrders();
const bak = document.getElementById("dashboard");
let periode = "maand";

const MAAND_LANG = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

function balken(rijen, max, eenheid, kleur = () => "") {
  return rijen.map(([lbl, n]) => `<div class="balk-rij"><span>${esc(lbl)}</span>
    <div class="baan" title="${esc(lbl)}: ${n}${eenheid}"><div class="balk ${kleur(lbl, n)}" style="width:${max ? Math.round(n / max * 100) : 0}%"></div></div>
    <span class="n">${Number(n).toLocaleString("nl-NL")}${eenheid}</span></div>`).join("");
}

const afgeleverdOp = o => o.vink.afgeleverd?.op.slice(0, 10);
const logOp = (o, wat) => o.log.find(l => l.wat === wat)?.op.slice(0, 10);

/* Periodes: deze en vorige maand, of dit en vorig kwartaal, plus de vier of zes ervoor voor de balken. */
function periodes() {
  const v = vandaag();
  const lijst = [];
  for (let n = 0; n < (periode === "maand" ? 6 : 4); n++) {
    const begin = periode === "maand" ? new Date(v.getFullYear(), v.getMonth() - n, 1) : new Date(v.getFullYear(), Math.floor(v.getMonth() / 3) * 3 - n * 3, 1);
    const eind = periode === "maand" ? new Date(begin.getFullYear(), begin.getMonth() + 1, 0) : new Date(begin.getFullYear(), begin.getMonth() + 3, 0);
    const naam = periode === "maand" ? `${MAAND_LANG[begin.getMonth()]} ${begin.getFullYear()}` : `Q${Math.floor(begin.getMonth() / 3) + 1} ${begin.getFullYear()}`;
    lijst.push({ naam, kort: periode === "maand" ? MAAND_LANG[begin.getMonth()].slice(0, 3) : naam, van: naarIso(begin), tot: naarIso(eind) });
  }
  return lijst;
}

/* Doorlooptijd van een fase: van het moment dat hij kon starten tot hij is afgerond. */
function doorlooptijden() {
  const som = {}, aantal = {};
  for (const o of orders) {
    const eind = {};
    for (const f of BORD_FASES) eind[f.nr] = logOp(o, `Fase ${f.nr} afgerond`);
    for (const f of BORD_FASES) {
      if (!eind[f.nr]) continue;
      const starts = f.nr === 1 ? [o.aangemaakt.slice(0, 10)] : vereist(o, f.nr).filter(v => v !== "ott").map(v => eind[v]);
      if (f.nr === 4 && o.vink.binnen) starts.push(o.vink.binnen.op.slice(0, 10));
      if (starts.some(s => !s)) continue;
      const start = starts.sort().pop();
      som[f.nr] = (som[f.nr] || 0) + Math.max(0, dagenTot(eind[f.nr]) - dagenTot(start));
      aantal[f.nr] = (aantal[f.nr] || 0) + 1;
    }
  }
  return BORD_FASES.map(f => [`${f.nr} · ${f.naam}`, aantal[f.nr] ? Math.round(som[f.nr] / aantal[f.nr] * 10) / 10 : 0, aantal[f.nr] || 0]);
}

function teken() {
  const lopend = orders.filter(o => !o.concept && huidigeFase(o) !== "klaar");
  const onderweg = lopend.filter(o => !o.vink.binnen);
  const ingepland = lopend.filter(o => o.afleverdatum && dagenTot(o.afleverdatum) >= 0);
  const komendeWeek = lopend.filter(o => o.afleverdatum && dagenTot(o.afleverdatum) >= 0 && dagenTot(o.afleverdatum) <= 7);
  const over = lopend.filter(o => verwachteDatum(o) && dagenTot(verwachteDatum(o)) < 0);
  const nietGeladen = lopend.filter(o => o.geladen === "nee" && !o.vink.volgeladen);
  const rood = lopend.filter(o => kaartStatus(o) === "rood");

  const per = periodes();
  const nieuwAf = p => orders.filter(o => o.type === "nieuw" && afgeleverdOp(o) && afgeleverdOp(o) >= p.van && afgeleverdOp(o) <= p.tot).length;
  const telling = per.map(p => [p.kort, nieuwAf(p)]).reverse();
  const nu_ = nieuwAf(per[0]), vorig = nieuwAf(per[1]);

  const perFase = BORD_FASES.map(f => {
    const hier = lopend.filter(o => huidigeFase(o) === f.nr);
    return [`${f.nr} · ${f.naam}`, hier.length, hier.filter(o => kaartStatus(o) === "rood").length];
  });
  const doorloop = doorlooptijden();

  const perVerkoper = PERSONEN.filter(p => p.rol === "verkoper").map(p => {
    const van = lopend.filter(o => o.verkoper === p.naam);
    return { naam: p.naam, lopend: van.length, rood: van.filter(o => kaartStatus(o) === "rood").length,
      contact: van.filter(o => contactTimer(o) || levertijdVoorbij(o)).length };
  });

  const redenen = rood.map(o => {
    const f = FASES.find(x => faseStatus(o, x.nr) === "rood");
    return `<a class="taak" href="order.html?id=${o.id}#fase-${f.nr}"><span class="stip st-rood"></span>
      <div><div class="wie">${esc(klantNaam(o))}</div><div class="sub">${esc(o.auto.model)} · ${esc(o.verkoper)}</div></div>
      <div class="wat"><div class="kop">Fase ${faseLabel(f.nr)} · ${f.naam}</div><div class="sub">${esc(waaromTeLaat(o, f.nr))}</div></div>
      <div class="wanneer">${o.afleverdatum ? "Aflevering " + relatief(o.afleverdatum) : "Levertijd " + relatief(o.levertijd)}</div></a>`;
  }).join("");

  const tegel = (n, lbl, kleur = "") => `<div><div class="getal ${kleur}">${n}</div><div class="lbl">${lbl}</div></div>`;

  bak.innerHTML = `
    <div class="kpi drie-rijen">
      ${tegel(onderweg.length, "Auto's onderweg")}
      ${tegel(ingepland.length, "Afleveringen ingepland")}
      ${tegel(komendeWeek.length, "Afleveringen komende 7 dagen")}
      ${tegel(over.length, "Over de verwachte leverdatum", over.length ? "rood" : "")}
      ${tegel(nietGeladen.length, "Niet geladen door de werkplaats, verkoop moet nog laden", nietGeladen.length ? "oranje" : "")}
      ${tegel(lopend.length, "Lopend in totaal")}
    </div>
    <section class="paneel afgeleverd">
      <div class="paneel-kop"><h2>BYD nieuw afgeleverd</h2>
        <div class="segment" role="group" aria-label="Periode">${[["maand", "Per maand"], ["kwartaal", "Per kwartaal"]].map(([k, t]) => `<button type="button" data-periode="${k}" class="${periode === k ? "aan" : ""}" aria-pressed="${periode === k}">${t}</button>`).join("")}</div>
      </div>
      <div class="afl-cijfers">
        <div><div class="getal">${nu_}</div><div class="lbl">${periode === "maand" ? "Deze maand" : "Dit kwartaal"}, ${per[0].naam}, tot vandaag</div></div>
        <div><div class="getal">${vorig}</div><div class="lbl">${periode === "maand" ? "Vorige maand" : "Vorig kwartaal"}, ${per[1].naam}</div></div>
      </div>
      ${balken(telling, Math.max(...telling.map(r => r[1]), 1), "")}
    </section>
    <div class="dash-grid">
      <section class="paneel"><h2>Auto's per fase</h2>
        <p class="toelichting">Rode balk: in die fase loopt minstens één auto achter.</p>
        ${balken(perFase.map(([l, n]) => [l, n]), Math.max(...perFase.map(r => r[1]), 1), "", l => perFase.find(r => r[0] === l)[2] ? "rood" : "")}
      </section>
      <section class="paneel"><h2>Gemiddelde doorlooptijd per fase</h2>
        <p class="toelichting">In dagen, van het moment dat een fase kon starten tot hij rond was. Over ${Math.max(...doorloop.map(r => r[2]))} orders.</p>
        ${balken(doorloop.map(([l, n]) => [l, n]), Math.max(...doorloop.map(r => r[1]), 1), " d")}
      </section>
      <section class="paneel"><h2>Per verkoper</h2>
        <table class="tabel"><thead><tr><th>Verkoper</th><th class="nr">Lopend</th><th class="nr">Achter</th><th class="nr">Contact nodig</th></tr></thead><tbody>
        ${perVerkoper.map(v => `<tr><td>${esc(v.naam)}</td><td class="nr">${v.lopend}</td><td class="nr ${v.rood ? "rood" : ""}">${v.rood}</td><td class="nr">${v.contact}</td></tr>`).join("")}
        </tbody></table>
      </section>
      <section class="paneel"><h2>NPS per maand</h2>
        <p class="toelichting">Volgt zodra bekend is waar de NPS-score vandaan komt.</p>
      </section>
    </div>
    <section class="taken-groep dash-sectie"><h2>Wat loopt er achter <span class="n ${rood.length ? "rood" : ""}">${rood.length}</span></h2>${redenen ? `<div class="rijen">${redenen}</div>` : `<div class="leeg-staat"><h2>Niets loopt achter</h2></div>`}</section>`;
}

bak.addEventListener("click", e => {
  const b = e.target.closest("[data-periode]"); if (!b) return;
  periode = b.dataset.periode; teken();
});
teken();

})();
