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

/* Werkdagen tussen twee datums: maandag tot en met vrijdag, zaterdag en zondag tellen niet. */
function werkdagen(van, tot) {
  let n = 0;
  for (let d = naarDatum(van); naarIso(d) < tot;) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) n++; }
  return n;
}

/* Doorlooptijd in vijf stukken (feedback Mark 2026-11-09). Elk stuk telt alleen orders
   waarvan begin en eind bekend zijn. */
function doorlooptijden() {
  const dag = op => op && op.slice(0, 10);
  const opgeslagen = o => logOp(o, "Order opgeslagen") || logOp(o, "Fase 1 afgerond");
  const stukken = [
    { lbl: "Concept aangevuld", eenheid: " d", van: o => dag(o.aangemaakt), tot: o => opgeslagen(o) },
    { lbl: "Onderdelen besteld", eenheid: " wd", werk: true, van: o => logOp(o, "Fase 1 afgerond"), tot: o => dag(o.vink.f2_klaar?.op) || logOp(o, "Fase 2 afgerond") },
    { lbl: "Wachten tot de auto binnen is", eenheid: " d", van: o => opgeslagen(o), tot: o => dag(o.vink.binnen?.op) },
    { lbl: "Werkplaats, binnen tot WP-klaar", eenheid: " wd", werk: true, van: o => dag(o.vink.binnen?.op), tot: o => dag(o.vink.wp_klaar?.op) },
    { lbl: "Binnen tot aflevering", eenheid: " d", van: o => dag(o.vink.binnen?.op), tot: o => afgeleverdOp(o) }
  ];
  return stukken.map(st => {
    const duur = orders.map(o => [st.van(o), st.tot(o)]).filter(([v, t]) => v && t && t >= v)
      .map(([v, t]) => st.werk ? werkdagen(v, t) : dagenTot(t) - dagenTot(v));
    const gem = duur.length ? Math.round(duur.reduce((x, y) => x + y, 0) / duur.length * 10) / 10 : 0;
    return { ...st, gem, n: duur.length, zelfdeDag: duur.filter(x => x === 0).length };
  });
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
  const besteld = doorloop[1];
  /* verkocht en waar staat de auto (feedback Mark) */
  const voorraad = [
    ["Verkocht, nog niet op de vestiging", lopend.filter(o => o.type !== "import" && !o.vink.binnen).length],
    ["Verkocht, wel op de vestiging", lopend.filter(o => o.vink.binnen).length],
    ["Import verkocht, nog zonder kenteken", lopend.filter(o => o.type === "import" && !o.auto.kenteken).length],
    ["Nog te importeren", lopend.filter(o => o.type === "import" && !o.vink.binnen).length]
  ];

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
        <table class="tabel voorraad"><tbody>${voorraad.map(([l, n]) => `<tr><td>${l}</td><td class="nr">${n}</td></tr>`).join("")}</tbody></table>
      </section>
      <section class="paneel"><h2>Gemiddelde doorlooptijd</h2>
        <p class="toelichting">d is dagen, wd is werkdagen (maandag tot en met vrijdag, zaterdag telt niet mee). Onderdelen ${besteld.n ? `op dezelfde werkdag besteld: ${besteld.zelfdeDag} van ${besteld.n}` : "besteld: nog geen orders"}.</p>
        ${doorloop.map(st => `<div class="balk-rij"><span>${esc(st.lbl)}</span>
          <div class="baan" title="${esc(st.lbl)}: ${st.gem}${st.eenheid}, over ${st.n} orders"><div class="balk" style="width:${Math.round(st.gem / Math.max(...doorloop.map(x => x.gem), 1) * 100)}%"></div></div>
          <span class="n">${st.n ? st.gem.toLocaleString("nl-NL") + st.eenheid : "geen"}</span></div>`).join("")}
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
