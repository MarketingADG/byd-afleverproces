/* Mijn taken: alles wat bij één persoon openstaat, over alle auto's heen. De vijf delen van
   verkoop en aflevering verschijnen pas als ze aan de beurt zijn en staan op naam van de
   verkoper van die auto. Een verkoper of afleverspecialist kan een taak van een collega
   overnemen; die staat dan op zijn naam. */

const ik = kopbalk("taken");
const orders = laadOrders();
const kies = document.getElementById("f_persoon");

/* de afleverspecialist ziet de taken van de serviceadviseur niet (feedback Mark, punt 5) */
const zonderSa = ik.rol === "afleverspecialist";
kies.innerHTML = `<option value="">Iedereen</option>` +
  PERSONEN.filter(p => !(zonderSa && p.rol === "serviceadviseur"))
    .map(p => `<option value="${esc(p.naam)}">${esc(p.naam)} · ${ROLLEN[p.rol]}</option>`).join("");
kies.value = ik.rol === "manager" ? "" : ik.naam;

const VERKOOP = ["verkoper", "afleverspecialist"];
const lopend = s => s === "oranje" || s === "rood";

/* Elke taak: sleutel, wie, welke auto, wat er moet, uiterste datum en kleur. */
function alleTaken() {
  const lijst = [];
  for (const o of orders) {
    if (huidigeFase(o) === "klaar") continue;
    const taak = (sleutel, rol, t) => {
      const naam = o.opgepakt?.[sleutel] || persoonVanRol(o, rol);
      lijst.push({ o, sleutel, rol, naam, opgepakt: !!o.opgepakt?.[sleutel], ...t });
    };

    /* fases zonder delen: verkoop, onderdelen, werkplaats, OTT */
    for (const nr of [1, 2, 4, "ott"]) {
      const s = faseStatus(o, nr);
      if (!lopend(s)) continue;
      const open = openPunten(o, nr);
      const f = faseInfo(nr);
      taak(`fase-${nr}`, f.eigenaar, { kleur: s, deadline: s === "rood" ? naarIso(vandaag()) : nr === 4 ? wpDeadline(o) : o.afleverdatum || o.levertijd,
        kop: o.concept && nr === 1 ? "Concept afmaken en opslaan" : `Fase ${faseLabel(nr)} · ${f.naam}`, wat: open.length ? `${open.slice(0, 2).map(p => p.label).join(", ")}${open.length > 2 ? ` en nog ${open.length - 2}` : ""}` : "Fase opnieuw afronden na heropenen", anker: nr });
    }

    /* de vijf delen, elk pas als hij aan de beurt is */
    const datum = { 1: o.afleverdatum || o.levertijd, 2: o.afleverdatum || o.levertijd, 3: wpDeadline(o), 4: o.afleverdatum && plusDagen(o.afleverdatum, -1), 5: o.afleverdatum };
    for (const d of verkoopDelen(o)) {
      if (!d.open || d.klaar || (d.nr === 1 && o.type === "import")) continue;
      const fase = d.nr <= 2 ? 3 : 5;
      const open = d.nr === 2 ? openPunten(o, 3).filter(p => p.key !== "factuur").map(p => p.label) : [];
      taak(`deel-${d.nr}`, "verkoper", { kleur: faseStatus(o, fase) === "rood" ? "rood" : "oranje", deadline: datum[d.nr],
        kop: `Deel ${d.nr} van 5 · ${d.label}`, wat: open.length ? `Nog open: ${open.slice(0, 3).map(eersteKlein).join(", ")}` : TYPES[o.type], anker: fase });
    }
    if (verkoopDelen(o)[4].klaar && lopend(faseStatus(o, 5))) {
      const open = openPunten(o, 5);
      taak("aflevering", "verkoper", { kleur: faseStatus(o, 5), deadline: o.afleverdatum,
        kop: "Aflevering afronden", wat: open.map(p => p.label).slice(0, 3).join(", "), anker: 5 });
    }

    /* klant bijpraten over de levertijd; de kleur is die van de auto onderweg */
    const t = contactTimer(o);
    if (levertijdVoorbij(o))
      taak("levertijd", "verkoper", { kleur: "rood", deadline: naarIso(vandaag()), kop: "Nieuwe leverdatum afspreken", wat: `Verwacht was ${datumKort(o.levertijd)}` });
    else if (t)
      taak(`contact-${t.soort}`, t.wie, { kleur: o.vink.binnen ? "oranje" : onderwegKleur(o) === "grijs" ? "oranje" : onderwegKleur(o), deadline: naarIso(vandaag()), kop: "Contact met de klant", wat: t.tekst });

    if (o.vink.factuur && !o.vink.afgeleverd)
      taak("factuur", "administratie", { kleur: "oranje", deadline: o.afleverdatum,
        kop: "Factuur maken", wat: `Aangevraagd door ${o.vink.factuur.door}, kenteken ${o.auto.kenteken || ""}, te betalen ${bedrag(o.te_betalen) || "onbekend"}` });

    /* opmerking van de werkplaats: blijft staan tot de verkoper reageert of hem oplost */
    for (const m of wachtOpVerkoper(o))
      taak(`vraag-${m.id}`, "verkoper", { kleur: "oranje", deadline: naarIso(vandaag()),
        kop: "Reageren op de werkplaats", wat: `"${m.tekst}" — de werkplaats kan pas verder na jouw reactie`, anker: m.fase });

    /* toevoeging past niet vóór de huidige afleverdatum: verkoper kiest een nieuwe */
    const tp = toevoegingProbleem(o);
    if (tp) taak("toevoeging-datum", "verkoper", { kleur: "rood", deadline: naarIso(vandaag()),
      kop: "Nieuwe afleverdatum kiezen", wat: `Door de toevoeging is de auto pas ${datumKort(tp.gereed)} klaar; vroegste aflevering ${datumKort(vroegsteNaGereed(tp.gereed))}`, anker: 3 });

    /* uitgestelde aflevering: melding voor de administratie tot ze hem verwerkt heeft */
    if (o.uitgesteld && !o.uitgesteld.verwerkt)
      taak("uitstel", "administratie", { kleur: "oranje", deadline: naarIso(vandaag()),
        kop: "Aflevering uitgesteld", wat: `Was ${datumKort(o.uitgesteld.van)}, wordt ${datumKort(o.afleverdatum)}${o.aflevertijd ? ", " + o.aflevertijd.replace(":", ".") : ""}${o.uitgesteld.reden ? `. Reden: ${o.uitgesteld.reden}` : ""}`,
        doe: "uitstel-verwerkt", doeLabel: "Verwerkt" });
  }
  return lijst;
}

function zichtbareTaken() {
  const alles = alleTaken();
  return zonderSa ? alles.filter(t => t.rol !== "serviceadviseur") : alles;
}

function rij(t, wie) {
  const href = t.link || `order.html?id=${t.o.id}${t.anker ? "#fase-" + t.anker : ""}`;
  const kanOppakken = VERKOOP.includes(ik.rol) && VERKOOP.includes(t.rol) && t.naam !== ik.naam;
  return `<div class="taak met-actie">
    <span class="stip st-${t.kleur}"></span>
    <div><a class="wie" href="${href}">${esc(klantNaam(t.o))}</a><div class="sub">${esc(t.o.auto.model || "")}${t.o.auto.kenteken ? " · " + esc(t.o.auto.kenteken) : ""}${wie ? "" : " · " + esc(t.naam)}${t.opgepakt ? " (overgenomen)" : ""}</div></div>
    <div class="wat"><div class="kop">${esc(t.kop)}</div><div class="sub">${esc(t.wat)}</div></div>
    <div class="wanneer">${t.deadline ? (t.o.afleverdatum && t.deadline === t.o.afleverdatum ? "Aflevering " : "") + relatief(t.deadline) : ""}</div>
    <div class="actie">${t.doe ? `<button type="button" class="knop" data-doe="${t.o.id}|${t.doe}">${esc(t.doeLabel)}</button>`
      : kanOppakken ? `<button type="button" class="knop" data-oppakken="${t.o.id}|${t.sleutel}">Overnemen</button>` : ""}</div>
  </div>`;
}

function teken() {
  const wie = kies.value;
  const taken = zichtbareTaken().filter(t => !wie || t.naam === wie)
    .sort((a, b) => (a.kleur === "rood" ? 0 : 1) - (b.kleur === "rood" ? 0 : 1) || (a.deadline || "9").localeCompare(b.deadline || "9"));

  const groepen = [
    ["Te laat", taken.filter(t => t.kleur === "rood")],
    ["Vandaag en morgen", taken.filter(t => t.kleur !== "rood" && t.deadline && dagenTot(t.deadline) <= 1)],
    ["Later", taken.filter(t => t.kleur !== "rood" && !(t.deadline && dagenTot(t.deadline) <= 1))]
  ];

  const rood = groepen[0][1].length;
  const collega = VERKOOP.includes(ik.rol) && wie === ik.naam
    ? zichtbareTaken().filter(t => VERKOOP.includes(t.rol) && t.naam !== ik.naam).length : 0;
  document.getElementById("samenvatting").innerHTML = (taken.length
    ? `${taken.length} ${taken.length === 1 ? "taak" : "taken"} open${rood ? `, ${rood} te laat` : ""}.`
    : "") + (collega ? ` <button type="button" class="knop link" id="team">Bekijk ${collega} ${collega === 1 ? "taak" : "taken"} van collega's om over te nemen</button>` : "");

  document.getElementById("taken").innerHTML = taken.length ? groepen.filter(([, l]) => l.length).map(([titel, l]) => `
    <section class="taken-groep"><h2>${titel} <span class="n ${titel === "Te laat" ? "rood" : ""}">${l.length}</span></h2>
      <div class="rijen">${l.map(t => rij(t, wie)).join("")}</div>
    </section>`).join("")
    : `<div class="leeg-staat"><span class="rondje">${icoon("vink", 22)}</span><h2>Niets open voor ${esc(wie || "het team")}</h2><p>Nieuwe taken verschijnen hier zodra ze aan de beurt zijn.</p></div>`;
}

document.addEventListener("click", e => {
  if (e.target.id === "team") { kies.value = ""; teken(); return; }
  const doe = e.target.closest("[data-doe]");
  if (doe) {
    const [id, wat] = doe.dataset.doe.split("|");
    const o = orders.find(x => x.id === id);
    if (wat === "uitstel-verwerkt") {
      o.uitgesteld.verwerkt = { door: ik.naam, op: nu() };
      o.log.push({ op: nu(), door: ik.naam, wat: "Uitstel verwerkt door de administratie" });
      bewaar(orders);
      toast("Verwerkt. De nieuwe datum staat in de order.");
    }
    teken(); return;
  }
  const b = e.target.closest("[data-oppakken]"); if (!b) return;
  const [id, sleutel] = b.dataset.oppakken.split("|");
  const o = orders.find(x => x.id === id);
  const taak = alleTaken().find(t => t.o === o && t.sleutel === sleutel);
  (o.opgepakt ??= {})[sleutel] = ik.naam;
  o.log.push({ op: nu(), door: ik.naam, wat: `Taak overgenomen van ${taak.naam}: ${taak.kop}` });
  bewaar(orders);
  toast(`Overgenomen. ${taak.naam} ziet in het logboek dat jij dit doet.`);
  teken();
});

kies.addEventListener("input", teken);
teken();
