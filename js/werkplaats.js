/* Werkplaats: weekagenda van maandag tot en met vrijdag. Elke auto staat op de dag waarop
   hij klaar moet zijn, met de tijd: 48 uur voor de aflevering. Niet op de afleverdatum.
   Daaronder twee takenlijsten: onderdelen bestellen en auto's inplannen. */

const ik = kopbalk("werkplaats");
const orders = laadOrders();
const venster = document.getElementById("venster");
let weekVerschil = 0;
let openId = null;

const WP_STATUS_TEKST = { rood: "Nog niet ingepland", oranje: "Ingepland", groen: "WP-klaar" };
const KORT = { w_gecontroleerd: "accessoires invoeren", onderdelen: "bestellen", werkorder: "werkordernummer" };
const lopendeOrders = () => orders.filter(o => !o.concept && huidigeFase(o) !== "klaar");
const om = o => o.aflevertijd ? `, ${o.aflevertijd.replace(":", ".")}` : "";

function maandag(verschil) {
  const d = vandaag();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + verschil * 7);
  return naarIso(d);
}
function weeknummer(iso) {
  const d = naarDatum(iso); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const jan4 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - jan4) / 864e5 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
}

function wpBlok(o, dagIso) {
  const st = werkplaatsStatus(o);
  const telaat = wpDeadline(o) < dagIso;
  return `<button type="button" class="wp-blok ${st}" data-open="${o.id}">
    <span class="wb1"><span class="stip st-${st}"></span>${esc(klantNaam(o))}</span>
    <span class="wb2">${esc(autoNaam(o))}</span>
    <span class="wb3">${esc(o.auto.kenteken || "Geen kenteken")} · meldcode ${esc(meldcode(o))}${o.werkorder ? " · " + esc(o.werkorder) : ""}</span>
    <span class="wb3">Klaar uiterlijk ${telaat ? wpKlaarTekst(o) : o.aflevertijd ? o.aflevertijd.replace(":", ".") : "einde dag"}</span>
    <span class="wb4">${o.vink.wp_klaar && st !== "groen" ? `WP-klaar, nog open: ${openPunten(o, 4).map(p => p.label.toLowerCase()).join(", ")}` : WP_STATUS_TEKST[st]}${telaat ? ", te laat" : ""}</span>
  </button>`;
}

function tekenWeek() {
  const ma = maandag(weekVerschil);
  const dagen = [0, 1, 2, 3, 4].map(n => plusDagen(ma, n));
  const vandaagIso = naarIso(vandaag());
  document.getElementById("weektitel").textContent = `Week ${weeknummer(ma)} · ${datumKort(dagen[0])} tot en met ${datumKort(dagen[4])}. Elke auto staat op het moment dat hij klaar moet zijn: 48 uur voor de aflevering.`;

  const metDeadline = lopendeOrders().filter(o => wpDeadline(o));
  document.getElementById("week").innerHTML = dagen.map(d => {
    /* wat te laat is en nog niet klaar, schuift mee naar vandaag */
    const hier = metDeadline.filter(o => wpDeadline(o) === d || (d === vandaagIso && wpDeadline(o) < d && werkplaatsStatus(o) !== "groen"))
      .sort((a, b) => wpMoment(a).localeCompare(wpMoment(b)));
    return `<section class="week-dag ${d === vandaagIso ? "vandaag" : ""}">
      <h2>${datumKort(d)}${d === vandaagIso ? " · vandaag" : ""}</h2>
      ${hier.map(o => wpBlok(o, d)).join("") || `<p class="dag-leeg">Niets klaar te maken</p>`}
    </section>`;
  }).join("");
}

function tekenTaken() {
  const bestellen = lopendeOrders().filter(o => ["oranje", "rood"].includes(faseStatus(o, 2)))
    .sort((a, b) => (wpDeadline(a) || a.levertijd || "9").localeCompare(wpDeadline(b) || b.levertijd || "9"));
  const inplannen = lopendeOrders().filter(o => o.vink.binnen && !o.vink.wp_ingepland)
    .sort((a, b) => (wpDeadline(a) || "9").localeCompare(wpDeadline(b) || "9"));
  const reacties = lopendeOrders().flatMap(o => wachtOpServiceadviseur(o).map(m => ({ o, m })));
  const wachtend = lopendeOrders().flatMap(o => wachtOpVerkoper(o).map(m => ({ o, m })));
  const toevoegingen = lopendeOrders().flatMap(o => openToevoegingen(o).map(t => ({ o, t })));
  const platen = lopendeOrders().filter(o => wittePlaatNodig(o));

  const uiterst = o => wpDeadline(o) ? `Klaar ${relatief(wpDeadline(o))}${om(o)}` : o.levertijd ? `Levertijd ${relatief(o.levertijd)}` : "";

  /* reacties van de verkoop op jouw opmerkingen: jij zet ze op opgelost (feedback Mark, punt 1) */
  const reactiesHtml = reacties.length || wachtend.length ? `
    <section class="taken-groep"><h2>Opmerkingen aan de verkoop <span class="n">${reacties.length + wachtend.length}</span></h2>
      <div class="rijen">${reacties.map(({ o, m }) => {
        const re = m.reacties[m.reacties.length - 1];
        return `<div class="taak met-knop"><span class="stip st-oranje"></span>
          <div><a class="wie" href="order.html?id=${o.id}#fase-${m.fase}">${esc(klantNaam(o))}</a><div class="sub">Jouw opmerking: ${esc(m.tekst)}</div></div>
          <div class="wat"><div class="kop">${esc(re.door)}: ${esc(re.tekst)}</div><div class="sub">Echt opgelost? Zet hem dan op opgelost, of reageer in de order</div></div>
          <button type="button" class="knop" data-opgelost-vraag="${o.id}|${m.id}">${icoon("vink", 14)}Opgelost</button></div>`;
      }).join("")}${wachtend.map(({ o, m }) => `
        <div class="taak met-knop"><span class="stip st-grijs"></span>
          <div><a class="wie" href="order.html?id=${o.id}#fase-${m.fase}">${esc(klantNaam(o))}</a><div class="sub">Jouw opmerking: ${esc(m.tekst)}</div></div>
          <div class="wat"><div class="kop">Wacht op reactie van ${esc(o.verkoper)}</div><div class="sub">Staat in zijn takenlijst; verder werken kan daarna</div></div>
          <span></span></div>`).join("")}</div>
    </section>` : "";

  /* toevoegingen van de verkoop: past het vóór de afleverdatum, of wordt de auto later klaar? */
  const toevoegingenHtml = toevoegingen.length ? `
    <section class="taken-groep"><h2>Toevoegingen beoordelen <span class="n">${toevoegingen.length}</span></h2>
      <div class="rijen">${toevoegingen.map(({ o, t }) => `
        <div class="taak beoordeel-rij"><span class="stip st-oranje"></span>
          <div><a class="wie" href="order.html?id=${o.id}">${esc(klantNaam(o))}</a><div class="sub">${esc(autoNaam(o))}${o.afleverdatum ? ` · aflevering ${datumKort(o.afleverdatum)}` : " · nog geen afleverdatum"}</div></div>
          <div class="wat"><div class="kop">${esc(t.tekst)}</div><div class="sub">${esc(t.door)}, ${tijdstip(t.op)} · past dit er nog bij vóór de aflevering?</div></div>
          <div class="actie beoordeel">
            <button type="button" class="knop" data-past="${o.id}|${t.id}">${icoon("vink", 14)}Past</button>
            <span class="of">of klaar op</span>
            <label class="vh" for="gereed_${t.id}">Auto klaar op</label><input id="gereed_${t.id}" type="date" class="invoer" min="${naarIso(vandaag())}">
            <button type="button" class="knop" data-past-niet="${o.id}|${t.id}">Past niet</button>
          </div></div>`).join("")}</div>
    </section>` : "";

  /* witte kentekenplaat: kon pas besteld worden toen het kenteken er was (punt 3) */
  const platenHtml = platen.length ? `
    <section class="taken-groep"><h2>Witte kentekenplaat bestellen <span class="n">${platen.length}</span></h2>
      <div class="rijen">${platen.map(o => `
        <div class="taak met-knop"><span class="stip st-oranje"></span>
          <div><a class="wie" href="order.html?id=${o.id}">${esc(klantNaam(o))}</a><div class="sub">${esc(autoNaam(o))} · trekhaak op de order</div></div>
          <div class="wat"><div class="kop">Witte plaat voor ${esc(o.auto.kenteken)}</div><div class="sub">Het kenteken is er; de plaat kon nu pas besteld worden</div></div>
          <button type="button" class="knop" data-witteplaat="${o.id}">${icoon("vink", 14)}Uitgevoerd</button></div>`).join("")}</div>
    </section>` : "";

  document.getElementById("wp_meldingen").innerHTML = reactiesHtml + toevoegingenHtml + platenHtml;

  document.getElementById("wp_taken").innerHTML = `
    <section class="taken-groep"><h2>Onderdelen bestellen <span class="n">${bestellen.length}</span></h2>
      ${bestellen.length ? `<div class="rijen">${bestellen.map(o => `<a class="taak" href="order.html?id=${o.id}#fase-2">
        <span class="stip st-${faseStatus(o, 2)}"></span>
        <div><div class="wie">${esc(klantNaam(o))}</div><div class="sub">${esc(autoNaam(o))}${o.vink.binnen ? " · binnen" : " · nog niet binnen"}</div></div>
        <div class="wat"><div class="kop">${eersteKlein(openPunten(o, 2).map(p => KORT[p.key] || p.label).join(", ")).replace(/^./, c => c.toUpperCase()) || "Fase 2 afronden"}</div><div class="sub">${o.accessoires.length} ${o.accessoires.length === 1 ? "onderdeel" : "onderdelen"} in de order</div></div>
        <div class="wanneer">${uiterst(o)}</div></a>`).join("")}</div>`
      : `<div class="leeg-staat klein"><h2>Alles besteld</h2><p>Nieuwe orders verschijnen hier zodra de verkoop fase 1 afrondt.</p></div>`}
    </section>
    <section class="taken-groep"><h2>Inplannen <span class="n">${inplannen.length}</span></h2>
      ${inplannen.length ? `<div class="rijen">${inplannen.map(o => `<div class="taak met-knop">
        <span class="stip st-rood"></span>
        <div><a class="wie" href="order.html?id=${o.id}#fase-4">${esc(klantNaam(o))}</a><div class="sub">${esc(autoNaam(o))} · ${esc(o.auto.kenteken || "meldcode " + meldcode(o))}${o.werkorder ? " · " + esc(o.werkorder) : ""}</div></div>
        <div class="wanneer">${uiterst(o) || "Nog geen afleverdatum"}</div>
        <button type="button" class="knop" data-ingepland="${o.id}">${icoon("vink", 14)}Ingepland</button></div>`).join("")}</div>`
      : `<div class="leeg-staat klein"><h2>Alles ingepland</h2><p>Auto's verschijnen hier zodra ze binnen zijn.</p></div>`}
    </section>`;
}

/* ---------- venster met de checklist van één auto ---------- */

function vensterHtml(o) {
  const v = o.vink;
  const regel = (key, label, mag = true, uitleg = "") => {
    const klaar = !!v[key];
    return `<div class="punt ${klaar ? "klaar" : ""}"><span class="bol">${klaar ? icoon("vink", 12) : ""}</span>
      <div><span class="lbl">${label}</span><div class="meta">${klaar ? `${esc(v[key].door)}, ${tijdstip(v[key].op)}` : esc(uitleg)}</div></div>
      <div class="ctl">${klaar ? `<button type="button" class="knop" data-terug="${key}">Terugzetten</button>`
        : `<button type="button" class="knop donker ${mag ? "" : "uit"}" data-vink="${key}" ${mag ? "" : 'aria-disabled="true"'}>Afvinken</button>`}</div></div>`;
  };
  const open = o.opmerkingen.filter(m => m.open);
  const blokkade = wachtOpVerkoper(o);
  /* werkplaatsklaar sluit de fase af: kan pas als de rest is ingevuld en er geen vraag openstaat */
  const klaarOpen = [];
  if (!v.wp_ingepland) klaarOpen.push("eerst inplannen");
  if (!o.geladen) klaarOpen.push("laden invullen");
  if (o.auto.phev && !v.getankt) klaarOpen.push("tanken");
  if (blokkade.length) klaarOpen.push(`reactie van ${o.verkoper} afwachten`);
  return `<form method="dialog" class="venster-kop">
      <div><h2 id="venster_titel">${esc(klantNaam(o))}</h2><p>${esc(autoNaam(o))} · ${esc(o.auto.kenteken || "geen kenteken")} · meldcode ${esc(meldcode(o))}${o.werkorder ? " · " + esc(o.werkorder) : ""}</p></div>
      <button class="knop" aria-label="Sluiten">Sluiten</button></form>
    <div class="melding ${werkplaatsStatus(o)}">Klaar uiterlijk ${wpKlaarTekst(o)}, 48 uur voor de aflevering. ${WP_STATUS_TEKST[werkplaatsStatus(o)]}.</div>
    ${blokkade.length ? `<div class="melding rood"><b>Wacht op ${esc(o.verkoper)}.</b> Verder werken kan na zijn reactie op: ${blokkade.map(m => esc(m.tekst)).join(" · ")}</div>` : ""}
    <div class="venster-lijst">
      ${regel("wp_ingepland", "Ingepland in de werkplaats")}
      <div class="punt ${o.geladen ? "klaar" : ""}"><span class="bol">${o.geladen ? icoon("vink", 12) : ""}</span>
        <div><span class="lbl" id="l_laden">Laden</span><div class="meta">${o.geladen ? LADEN[o.geladen] : "Laadpaal vrij: laden. Zit hij vol, kies dan niet geladen; de verkoop laadt de auto dan."}</div></div>
        <div class="ctl"><div class="janee" role="group" aria-labelledby="l_laden">${[["ja", "Geladen"], ["nee", "Niet geladen"]].map(([k, t]) =>
          `<button type="button" data-laden="${k}" class="${o.geladen === k ? "aan" : ""}" aria-pressed="${o.geladen === k}">${t}</button>`).join("")}</div></div></div>
      ${o.auto.phev ? regel("getankt", "Getankt", true, "Plug-in hybride") : ""}
      ${heeftTrekhaak(o) && o.auto.kenteken ? regel("witteplaat", "Witte kentekenplaat besteld", true, "Trekhaak op de order; bestellen kon pas toen het kenteken er was") : ""}
      ${regel("wp_klaar", "Auto werkplaatsklaar", !klaarOpen.length, klaarOpen.length ? `Sluit de werkplaats af. Kan pas na: ${klaarOpen.join(", ")}` : "Sluit de werkplaats af en zet WP-klaar in de Outlook-agenda")}
    </div>
    ${(o.werkplaatsregels || []).length ? `<h3>Regels van de verkoop</h3><ul class="od-ul">${o.werkplaatsregels.map(r => `<li><span class="stip st-grijs"></span>${esc(r)}</li>`).join("")}</ul>` : ""}
    <h3>Onderdelen</h3>
    ${o.accessoires.length ? `<ul class="od-ul">${o.accessoires.map(a => `<li><span class="stip st-${a.binnen ? "groen" : a.besteld ? "oranje" : "rood"}"></span>${esc(a.naam)}: ${a.binnen ? "binnen" : a.besteld ? `besteld${a.verwacht ? ", verwacht " + datumKort(a.verwacht) : ""}` : "niet besteld"}</li>`).join("")}</ul>` : `<p class="zij-leeg">Geen onderdelen in de order.</p>`}
    ${open.length ? `<h3>Open punten</h3><ul class="od-ul">${open.map(m => `<li>${esc(m.tekst)}${vraagAanZet(m) === "verkoper" ? ` — wacht op ${esc(o.verkoper)}` : ""}</li>`).join("")}</ul>` : ""}
    <form class="zij-form wp-opmerking" id="wp_opmerking">
      <label class="veld-lbl" for="wp_opm_tekst">Opmerking aan de verkoper</label>
      <textarea id="wp_opm_tekst" class="invoer" placeholder="Bijvoorbeeld: op de order staat beschadiging bijlakken, welke plek?"></textarea>
      <button class="knop">Naar de takenlijst van ${esc(o.verkoper)}</button>
    </form>
    <div class="venster-voet"><a class="knop" href="order.html?id=${o.id}#fase-4">Hele order openen</a></div>`;
}

function openVenster(id) {
  openId = id;
  venster.innerHTML = vensterHtml(orders.find(o => o.id === id));
  if (!venster.open) venster.showModal();
}

const WP_LABEL = { wp_ingepland: "Ingepland in de werkplaats", wp_klaar: "Auto werkplaatsklaar", getankt: "Getankt", witteplaat: "Witte kentekenplaat besteld" };

function zetVink(o, key, aan) {
  if (aan) o.vink[key] = { door: ik.naam, op: nu() };
  else delete o.vink[key];
  o.log.push({ op: nu(), door: ik.naam, wat: `${WP_LABEL[key]} ${aan ? "afgevinkt" : "teruggezet"}`, ...(aan ? {} : { terug: true }) });
  if (aan && faseStatus(o, 4) === "groen") o.log.push({ op: nu(), door: ik.naam, wat: "Fase 4 afgerond" });
  bewaar(orders);
  if (aan && key === "wp_klaar") toast("WP-klaar. De afspraak in de Outlook-agenda van bydgroningen@ gaat straks vanzelf naar WP-klaar.", "groen");
  else if (aan && key === "wp_ingepland") toast(`${klantNaam(o)} staat ingepland. Terugzetten kan via Behandeld.`);
  tekenWeek(); tekenTaken();
}

/* opmerking aan de verkoper vanuit het venster: komt direct in zijn takenlijst (punt 1) */
venster.addEventListener("submit", e => {
  if (e.target.id !== "wp_opmerking") return;
  e.preventDefault();
  const o = orders.find(x => x.id === openId);
  const tekst = document.getElementById("wp_opm_tekst").value.trim();
  if (!tekst) { toast("Schrijf eerst de opmerking."); return; }
  o.opmerkingen.push({ id: Date.now(), fase: o.vink.binnen ? 4 : 2, tekst, open: true, auteur: ik.naam, auteurRol: "serviceadviseur", op: nu() });
  o.log.push({ op: nu(), door: ik.naam, wat: `Opmerking aan ${o.verkoper}: ${tekst}` });
  bewaar(orders);
  toast(`Staat direct in de takenlijst van ${o.verkoper}. Hij ziet erbij dat de werkplaats wacht op zijn reactie.`);
  openVenster(o.id); tekenTaken();
});

venster.addEventListener("click", e => {
  if (e.target === venster) { venster.close(); return; }
  const b = e.target.closest("button"); if (!b) return;
  const o = orders.find(x => x.id === openId);
  if (b.dataset.vink && b.getAttribute("aria-disabled") !== "true") { zetVink(o, b.dataset.vink, true); openVenster(o.id); }
  if (b.dataset.terug) { zetVink(o, b.dataset.terug, false); openVenster(o.id); }
  if (b.dataset.laden) {
    const was = faseStatus(o, 4);
    o.geladen = b.dataset.laden;
    o.log.push({ op: nu(), door: ik.naam, wat: `Laden: ${LADEN[o.geladen]}` });
    if (was !== "groen" && faseStatus(o, 4) === "groen") o.log.push({ op: nu(), door: ik.naam, wat: "Fase 4 afgerond" });
    bewaar(orders);
    toast(o.geladen === "nee" ? `Niet geladen. ${o.verkoper} krijgt de taak om de auto vol te laden.` : "Geladen. Volladen hoeft de verkoop niet meer te doen.");
    openVenster(o.id); tekenWeek(); tekenTaken();
  }
});

/* de serviceadviseur beoordeelt een toevoeging: past hij, of is de auto later klaar (punt 4) */
function beoordeelToevoeging(id, tid, gereed) {
  const o = orders.find(x => x.id === id);
  const t = o.toevoegingen.find(x => x.id == tid);
  t.status = gereed ? "past-niet" : "past";
  t.beoordeeldDoor = ik.naam; t.beoordeeldOp = nu();
  if (gereed) t.gereed = gereed;
  /* de toevoeging wordt ook een onderdeel, zodat de bestelling in fase 2 wordt bijgehouden */
  o.accessoires.push({ naam: t.tekst });
  o.log.push({ op: nu(), door: ik.naam, wat: gereed
    ? `Toevoeging past niet vóór de aflevering: auto klaar op ${datumKort(gereed)}, vroegste aflevering ${datumKort(vroegsteNaGereed(gereed))}. ${o.verkoper} kiest een nieuwe datum`
    : `Toevoeging past vóór de aflevering: ${t.tekst}. Bevestiging naar ${o.verkoper}` });
  o.log.push({ op: nu(), door: ik.naam, wat: `${t.tekst} bij de onderdelen gezet` });
  bewaar(orders);
  toast(gereed
    ? `${o.verkoper} ziet de vroegst mogelijke afleverdatum: ${datumKort(vroegsteNaGereed(gereed))} (48 uur na gereed).`
    : `Bevestiging naar ${o.verkoper}. ${t.tekst} staat nu bij de onderdelen om te bestellen.`);
  tekenWeek(); tekenTaken();
}

document.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b || venster.contains(b)) return;
  if (b.dataset.open) openVenster(b.dataset.open);
  if (b.dataset.ingepland) zetVink(orders.find(o => o.id === b.dataset.ingepland), "wp_ingepland", true);
  if (b.dataset.week) { weekVerschil = b.dataset.week === "0" ? 0 : weekVerschil + Number(b.dataset.week); tekenWeek(); }
  if (b.dataset.past) { const [id, tid] = b.dataset.past.split("|"); beoordeelToevoeging(id, tid, null); }
  if (b.dataset.pastNiet) {
    const [id, tid] = b.dataset.pastNiet.split("|");
    const gereed = document.getElementById(`gereed_${tid}`).value;
    if (!gereed) { toast("Vul eerst in op welke datum de auto klaar is."); return; }
    beoordeelToevoeging(id, tid, gereed);
  }
  if (b.dataset.witteplaat) {
    const o = orders.find(x => x.id === b.dataset.witteplaat);
    zetVink(o, "witteplaat", true);
    toast(`Witte kentekenplaat voor ${o.auto.kenteken} staat op uitgevoerd.`, "groen");
  }
  if (b.dataset.opgelostVraag) {
    const [id, mid] = b.dataset.opgelostVraag.split("|");
    const o = orders.find(x => x.id === id);
    o.opmerkingen.find(m => m.id == mid).open = false;
    o.log.push({ op: nu(), door: ik.naam, wat: "Opmerking van de werkplaats opgelost" });
    bewaar(orders);
    toast("Opgelost.", "groen");
    tekenWeek(); tekenTaken();
  }
});

tekenWeek();
tekenTaken();
