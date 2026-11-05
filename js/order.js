/* Orderdetail: één auto, één fase tegelijk. Kies de fase in de stappenbalk; elke fase is
   één checklist met dezelfde regel per punt. Rechts staan open punten, klantcontact en logboek.
   Een afgeronde fase blijft te herstellen door wie hem mag invullen; elke wijziging komt in
   het logboek. Een nieuwe order is een concept tot de verkoper fase 1 heeft ingevuld en op
   Opslaan klikt. */

const ik = kopbalk("");
const orders = laadOrders();
const params = new URLSearchParams(location.search);
const hoofd = document.getElementById("order");


/* ---------- nieuwe order ---------- */
if (params.get("nieuw")) {
  /* intern nummer; het echte ordernummer vult de verkoper in fase 1 in */
  const nummer = `N${Date.now()}`;
  const verkoper = ik.rol === "verkoper" ? ik.naam : (PERSONEN.find(p => p.rol === "verkoper")?.naam || ik.naam);
  orders.push({
    id: nummer, ordernummer: "", type: "nieuw", voorraad: "winkel", verkoper, aangemaakt: nu(), concept: true,
    klant: {}, auto: {}, accessoires: [], vink: {}, contact: [], opmerkingen: [],
    log: [{ op: nu(), door: ik.naam, wat: "Order aangemaakt" }]
  });
  bewaar(orders);
  history.replaceState(null, "", `order.html?id=${nummer}`);
}

const o = orders.find(x => x.id === (params.get("id") || orders[orders.length - 1].id));
if (!o) hoofd.innerHTML = `<p>Deze order bestaat niet (meer). <a href="${startpagina(ik.rol)}">Terug</a></p>`;

function nrUit(s) { return s === "ott" ? "ott" : Number(s); }
const lopend = s => s === "oranje" || s === "rood";

/* Welke fase staat open: uit de link (#fase-3), anders de lopende fase die jij mag doen
   (te laat eerst), anders de eerste lopende, anders de laatst afgeronde. */
function startFase() {
  const m = location.hash.match(/^#fase-(.+)$/);
  if (m) { const nr = nrUit(m[1]); if (FASES.some(f => f.nr === nr) && faseStatus(o, nr) !== "nvt") return nr; }
  const actief = FASES.filter(f => lopend(faseStatus(o, f.nr)));
  const mijn = actief.filter(f => magBewerken(ik, o, f.nr));
  const rood = l => l.find(f => faseStatus(o, f.nr) === "rood");
  const keuze = rood(mijn) || mijn[0] || rood(actief) || actief[0];
  if (keuze) return keuze.nr;
  const groen = FASES.filter(f => faseStatus(o, f.nr) === "groen");
  return (groen[groen.length - 1] || FASES[0]).nr;
}

let gekozen = o ? startFase() : null;
let vorigeGekozen = null;
let heelLogboek = false;

/* ---------- wijzigen: bewaren, loggen en melden wat er groen werd ---------- */

function alleStatussen() { return Object.fromEntries(FASES.map(f => [f.nr, faseStatus(o, f.nr)])); }

function wijzig(fn, logtekst) {
  const voor = alleStatussen();
  fn();
  if (logtekst) o.log.push({ op: nu(), door: ik.naam, wat: logtekst });
  const imports = laadImports();
  if (koppelImports(orders, imports)) bewaarImports(imports);
  const na = alleStatussen();
  for (const f of FASES) {
    if (voor[f.nr] !== "groen" && na[f.nr] === "groen") {
      o.log.push({ op: nu(), door: ik.naam, wat: `Fase ${faseLabel(f.nr)} afgerond` });
      const volgende = FASES.find(v => voor[v.nr] === "grijs" && na[v.nr] !== "grijs");
      toast(volgende
        ? `Fase ${faseLabel(f.nr)} is groen. ${ROLLEN[volgende.eigenaar]} krijgt een melding: fase ${faseLabel(volgende.nr)} kan starten.`
        : `Fase ${faseLabel(f.nr)} is groen.`, "groen");
    }
  }
  bewaar(orders);
  /* opnieuw tekenen na de focusverplaatsing, zodat Tab naar het volgende veld blijft werken */
  setTimeout(() => { const id = document.activeElement?.id; teken(); if (id) document.getElementById(id)?.focus(); });
}

/* ---------- één punt: bolletje, label met uitleg, invoer rechts ---------- */

function waardeTekst(p, w) {
  if (w === undefined || w === null || w === "") return "Nog niet ingevuld";
  if (p.soort === "datum") return datumKort(w);
  if (p.soort === "tijd") return w.replace(":", ".");
  if (p.soort === "blok") return blokTekst(w);
  if (p.eenheid === "€") return bedrag(w);
  if (p.eenheid) return `${Number(w).toLocaleString("nl-NL")} ${p.eenheid}`;
  if (p.soort === "keuze") return p.opties[w] || w;
  return w;
}

function puntHtml(p, mag) {
  /* na de factuuraanvraag ligt de afleverdatum vast; wijzigen gaat via de administratie */
  const vast = !!o.vink.factuur && ["afleverdatum", "aflevertijd"].includes(p.key);
  const magWijzigen = mag && vast;
  if (vast) mag = false;
  const klaar = puntKlaar(o, p);
  const id = `p_${p.key}`;
  const v = o.vink[p.key];
  const lbl = esc(p.label);
  const dl = `data-label="${lbl}"`;
  const wieWanneer = v ? `${v.door}, ${tijdstip(v.op)}${v.bestand ? " · " + v.bestand : ""}` : "";
  const neutraal = p.soort === "info" || p.soort === "lijst";

  let meta = !p.verplicht ? `Optioneel${p.hint ? ". " + p.hint : ""}` : (!klaar && p.hint ? p.hint : "");
  let metaRood = "", ctl = "", onder = "", breed = false, labelFor = true;

  switch (p.soort) {
    case "tekst": case "getal": case "datum": case "tijd": {
      const w = lees(o, p.pad);
      const euro = p.eenheid === "€";
      const type = euro ? "text" : ({ getal: "number", datum: "date", tijd: "time" }[p.soort] || "text");
      const val = euro ? (w === "" || w == null ? "" : "€ " + Number(w).toLocaleString("nl-NL")) : (w ?? "");
      ctl = mag
        ? `<input id="${id}" class="invoer ${p.soort === "tekst" ? "" : "half"}" type="${type}" ${euro ? 'inputmode="numeric"' : ""} data-pad="${p.pad}" data-soort="${euro ? "bedrag" : p.soort}" ${dl} value="${esc(val)}">`
        : `<span class="waarde">${esc(waardeTekst(p, w))}</span>`;
      break;
    }
    case "blok": {
      const w = lees(o, p.pad) ?? "";
      ctl = mag
        ? `<select id="${id}" class="invoer" data-pad="${p.pad}" ${dl}><option value="">Kies een blok</option>${Object.keys(AFLEVERBLOKKEN).map(k => `<option value="${k}" ${k === w ? "selected" : ""}>${blokTekst(k)}</option>`).join("")}</select>`
        : `<span class="waarde">${esc(waardeTekst(p, w))}</span>`;
      break;
    }
    case "keuze": {
      const w = lees(o, p.pad) ?? "";
      ctl = mag
        ? `<select id="${id}" class="invoer" data-pad="${p.pad}" ${dl}><option value="">Kies</option>${Object.entries(p.opties).map(([k, t]) => `<option value="${esc(k)}" ${k === w ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`
        : `<span class="waarde">${esc(waardeTekst(p, w))}</span>`;
      break;
    }
    case "janee": {
      const w = lees(o, p.pad);
      labelFor = false;
      ctl = mag
        ? `<div class="janee" role="group" aria-labelledby="l_${p.key}">${[["1", "Ja", true], ["0", "Nee", false]].map(([k, t, b]) =>
          `<button type="button" id="${id}_${k}" data-janee="${p.pad}" data-w="${k}" ${dl} class="${w === b ? "aan" : ""}" aria-pressed="${w === b}">${t}</button>`).join("")}</div>`
        : `<span class="waarde">${w === true ? "Ja" : w === false ? "Nee" : "Nog niet gekozen"}</span>`;
      break;
    }
    case "vink":
      labelFor = false;
      if (klaar) { meta = wieWanneer; if (mag) ctl = `<button type="button" class="knop" id="${id}" data-terug="${p.key}" ${dl}>Terugzetten</button>`; }
      else if (mag) {
        const geblokt = actieGeblokt(p.key);
        if (geblokt) meta = geblokt;
        ctl = `<button type="button" class="knop ${p.key === "wp_klaar" ? "donker" : ""} ${geblokt ? "uit" : ""}" id="${id}" data-vink="${p.key}" ${dl} ${geblokt ? 'aria-disabled="true"' : ""}>${p.key === "wp_klaar" ? "Werkplaatsklaar" : "Afvinken"}</button>`;
      }
      break;
    case "actie":
      labelFor = false;
      if (klaar) { meta = wieWanneer; if (mag) ctl = `<button type="button" class="knop" id="${id}" data-terug="${p.key}" ${dl}>Terugzetten</button>`; }
      else if (mag) {
        const geblokt = actieGeblokt(p.key);
        if (geblokt) meta = geblokt;
        ctl = `<button type="button" class="knop donker ${geblokt ? "uit" : ""}" id="${id}" data-actie="${p.key}" ${dl} ${geblokt ? 'aria-disabled="true"' : ""}>${esc(p.knop)}</button>`;
      }
      break;
    case "upload":
      if (klaar) meta = wieWanneer;
      if (mag) ctl = `<label class="knop" for="${id}">${klaar ? "Vervangen" : "Uploaden"}</label><input type="file" id="${id}" class="vh" data-upload="${p.key}" ${dl}>`;
      labelFor = false;
      break;
    case "tekstvak": {
      breed = true;
      const w = lees(o, p.pad);
      onder = mag
        ? `<textarea id="${id}" class="invoer" data-pad="${p.pad}" ${dl}>${esc(w)}</textarea>`
        : `<p>${esc(w || "Nog niets ingevuld")}</p>`;
      if (!mag) labelFor = false;
      break;
    }
    case "info":
      labelFor = false;
      meta = p.tekst;
      break;
    case "lijst": {
      breed = true; labelFor = false;
      meta = o.accessoires.length ? "" : "Geen accessoires.";
      onder = (o.accessoires.length ? `<ul class="lijstje">${o.accessoires.map((a, i) => `<li><span>${esc(a.naam)}</span>${mag ? `<button type="button" class="knop link" data-weg="${i}">Verwijderen</button>` : ""}</li>`).join("")}</ul>` : "")
        + (mag ? `<div class="toevoegen"><label class="vh" for="nieuw_acc">Accessoire toevoegen</label><input id="nieuw_acc" class="invoer" placeholder="Bijvoorbeeld: trekhaak, inclusief montage"><button type="button" class="knop" id="acc_toevoegen">Toevoegen</button></div>` : "");
      if (!onder) breed = false;
      break;
    }
    case "regels": {
      breed = true; labelFor = false;
      const regels = o.werkplaatsregels || [];
      const magRegels = mag && !p.alleenLezen;
      if (!regels.length && p.alleenLezen) meta = "Geen regels voor de werkplaats.";
      onder = (regels.length ? `<ul class="lijstje">${regels.map((r, i) => `<li><span>${esc(r)}</span>${magRegels ? `<button type="button" class="knop link" data-regel-weg="${i}">Verwijderen</button>` : ""}</li>`).join("")}</ul>` : "")
        + (magRegels ? `<div class="toevoegen"><label class="vh" for="nieuwe_regel">Regel toevoegen</label><input id="nieuwe_regel" class="invoer" placeholder="Bijvoorbeeld: krasje linksvoor bijlakken"><button type="button" class="knop" id="regel_toevoegen">Toevoegen</button></div>` : "");
      if (!onder) breed = false;
      break;
    }
    case "onderdelen": {
      labelFor = false;
      if (!o.accessoires.length) { meta = "Geen accessoires in de order, niets te bestellen."; break; }
      breed = true;
      const grens = wpDeadline(o) || (o.levertijd && plusDagen(o.levertijd, -2));
      if (grens && o.accessoires.some(a => a.verwacht > grens))
        metaRood = `Een onderdeel komt pas na ${datumKort(grens)} binnen, de dag dat de werkplaats klaar moet zijn. Serviceadviseur en afleverspecialist krijgen een melding.`;
      const vak = (a, i, veld, naam) => mag
        ? `<label><input type="checkbox" data-acc="${i}" data-veld="${veld}" ${a[veld] ? "checked" : ""}><span class="vh">${naam}: ${esc(a.naam)}</span></label>`
        : (a[veld] ? "Ja" : "Nee");
      onder = `<table class="tabel"><thead><tr><th>Onderdeel</th><th>Besteld</th><th>Verwacht binnen</th><th>Binnen</th></tr></thead><tbody>
        ${o.accessoires.map((a, i) => `<tr class="${grens && a.verwacht > grens ? "te-laat" : ""}"><td>${esc(a.naam)}</td>
          <td>${vak(a, i, "besteld", "Besteld")}</td>
          <td>${mag ? `<label class="vh" for="acc_${i}_verwacht">Verwacht binnen: ${esc(a.naam)}</label><input id="acc_${i}_verwacht" class="invoer" type="date" data-acc="${i}" data-veld="verwacht" value="${a.verwacht || ""}">` : esc(a.verwacht ? datumKort(a.verwacht) : "Onbekend")}</td>
          <td>${vak(a, i, "binnen", "Binnen")}</td></tr>`).join("")}
        </tbody></table>`;
      break;
    }
    case "importkeuze": {
      const imports = laadImports();
      const vrij = imports.filter(i => i.chassis === o.auto.chassis || !orders.some(x => x !== o && x.auto.chassis === i.chassis));
      const imp = imports.find(i => i.chassis === o.auto.chassis);
      if (imp) meta = `${imp.merk} ${imp.model} ${imp.uitvoering}, ${imp.kleur_ext}, ${imp.bouwjaar}. Meldcode ${meldcode(o)}.`;
      ctl = mag
        ? `<select id="${id}" class="invoer" data-importkeuze="1" ${dl}><option value="">Kies een auto</option>${vrij.map(i => `<option value="${esc(i.chassis)}" ${i.chassis === o.auto.chassis ? "selected" : ""}>${esc(`${i.merk} ${i.model}, ${i.kleur_ext} · ${i.chassis.slice(-6)}`)}</option>`).join("")}</select>`
        : `<span class="waarde">${esc(o.auto.chassis || "Nog niet gekozen")}</span>`;
      if (mag) onder = `<a class="knop link" href="import.html">Staat hij er niet tussen? Voeg hem toe aan de importlijst</a>`;
      breed = mag;
      break;
    }
    case "premiekeuze": {
      /* de gekozen premie wordt met bedrag en code in de order vastgelegd, zodat een latere
         wijziging in de premielijst een verkochte auto niet meer raakt */
      const keus = o.premie;
      const lijst = o.auto.model ? premiesVoor(o.auto.model) : [];
      const tekst = x => `${x.soort}, ${bedrag(x.bedrag)}`;
      if (!o.auto.model) { meta = "Kies eerst een model."; labelFor = false; break; }
      if (keus?.id === "geen") meta = "De klant krijgt geen premie uit de premielijst.";
      else if (keus) meta = `Premiecode ${keus.code}${keus.tot ? `, geldig tot en met ${datumKort(keus.tot)}` : ""}.`;
      else meta = lijst.length ? `Optioneel. ${lijst.length} ${lijst.length === 1 ? "premie" : "premies"} voor de ${o.auto.model} in de premielijst van de manager.` : `Geen premie voor de ${o.auto.model} in de premielijst.`;
      if (!mag) { ctl = `<span class="waarde">${esc(keus?.id === "geen" ? "Geen premie" : keus ? tekst(keus) : "Nog niet gekozen")}</span>`; break; }
      if (!lijst.length && !keus) { labelFor = false; break; }
      const opties = [...lijst];
      if (keus && keus.id !== "geen" && !opties.some(x => x.id === keus.id)) opties.unshift(keus);
      ctl = `<select id="${id}" class="invoer" data-premie="1" ${dl}><option value="">Kies een premie</option>${opties.map(x => `<option value="${esc(x.id)}" ${x.id === keus?.id ? "selected" : ""}>${esc(tekst(x))}</option>`).join("")}<option value="geen" ${keus?.id === "geen" ? "selected" : ""}>Geen premie</option></select>`;
      break;
    }
    case "import": {
      labelFor = false;
      const imp = laadImports().find(i => i.chassis === o.auto.chassis);
      const stand = importStand(imp);
      meta = o.auto.kenteken ? "Uit de importlijst." : imp ? `Importlijst: ${eersteKlein(IMPORT_STAPPEN[stand])}, stap ${stand} van 6.` : "Deze auto staat niet in de importlijst.";
      ctl = o.auto.kenteken ? `<span class="waarde">${esc(o.auto.kenteken)}</span>` : `<a class="knop" href="import.html#${esc(o.auto.chassis || "")}">Naar de importlijst</a>`;
      break;
    }
    case "poets": {
      labelFor = false;
      const pt = o.poets || {};
      const vorm = pt.vorm || (o.mastercare ? "Mastercare" : "Standaard");
      if (pt.gedaan) meta = `Gepoetst. ${vorm}, ${datumKort(pt.datum)}.`;
      else if (pt.datum && o.afleverdatum && pt.datum > o.afleverdatum) metaRood = `De poetsbeurt staat na de aflevering van ${datumKort(o.afleverdatum)}. Plan hem eerder in.`;
      else if (pt.datum && dagenTot(pt.datum) < 1) metaRood = "Minder dan 24 uur van tevoren ingepland. Dat kost extra.";
      ctl = mag
        ? `<label class="vh" for="${id}">Poetsdatum</label><input id="${id}" class="invoer half" type="date" data-poets="datum" value="${pt.datum || ""}">
           <label class="vh" for="${id}_vorm">Poetsvorm</label><select id="${id}_vorm" class="invoer half" data-poets="vorm">${["Mastercare", "Standaard"].map(x => `<option ${x === vorm ? "selected" : ""}>${x}</option>`).join("")}</select>`
        : `<span class="waarde">${pt.datum ? `${datumKort(pt.datum)} · ${vorm}` : "Nog niet ingepland"}</span>`;
      break;
    }
  }

  /* uitleg die van de rest van de order afhangt */
  if (p.key === "afleverdatum" && !vast && !o.vink.binnen) meta = `Vroegst ${datumKort(vroegsteAflevering(o))}: binnen plus 6 werkdagen klaarmaken plus 2 dagen.`;
  if (p.key === "afleverdatum" && vast) {
    meta = `Bevestigd bij de factuuraanvraag. Wijzigen gaat via de administratie.`;
    if (magWijzigen) {
      breed = true;
      onder = `<div class="wijziging">
        <label class="vh" for="wijz_datum">Nieuwe afleverdatum</label><input id="wijz_datum" class="invoer half" type="date" value="${o.afleverdatum}">
        <label class="vh" for="wijz_blok">Nieuw tijdsblok</label><select id="wijz_blok" class="invoer half">${Object.keys(AFLEVERBLOKKEN).map(k => `<option value="${k}" ${k === o.aflevertijd ? "selected" : ""}>${blokTekst(k)}</option>`).join("")}</select>
        <button type="button" class="knop" id="wijz_sturen">Wijziging naar administratie</button></div>`;
    }
  }
  if (p.key === "wp_deadline") {
    const weekend = o.afleverdatum && wpDeadline(o) !== plusDagen(o.afleverdatum, -2);
    meta = o.afleverdatum ? `${wpKlaarTekst(o)}, 48 uur voor de aflevering${weekend ? ". Dat valt in het weekend, dus de vrijdag ervoor" : ""}. Dit ziet de serviceadviseur in zijn agenda.` : "Volgt uit de afleverdatum.";
  }
  if (p.key === "i_kenteken" && o.inruil?.kenteken) {
    if (o.inruil.merk) meta = `RDW: ${o.inruil.merk} ${o.inruil.model || ""}`.trim();
    else if (o.inruil.rdw === false) metaRood = "Niet gevonden bij de RDW. Controleer het kenteken.";
  }
  if (p.key === "kenteken" && o.vink.kent_aangevraagd && !o.auto.kenteken) {
    const d = -dagenTot(o.vink.kent_aangevraagd.op.slice(0, 10));
    const t = `Aangevraagd ${relatief(o.vink.kent_aangevraagd.op.slice(0, 10))}.`;
    if (d > 4) metaRood = `${t} Normaal duurt het 1 tot 4 dagen.`; else meta = t;
  }

  /* een lege waarde is geen inhoud: rustiger dan een ingevulde waarde */
  ctl = ctl.replace('<span class="waarde">Nog ', '<span class="waarde leeg">Nog ');
  const labelTag = labelFor && ctl + onder ? `<label class="lbl" id="l_${p.key}" for="${id}">${lbl}</label>` : `<span class="lbl" id="l_${p.key}">${lbl}</span>`;
  return `<div class="punt ${klaar && !neutraal ? "klaar" : ""} ${p.verplicht ? "" : "optioneel"} ${neutraal ? "info" : ""} ${breed ? "breed" : ""}">
    <span class="bol">${neutraal ? icoon("info", 18) : klaar ? icoon("vink", 12) : ""}</span>
    <div>${labelTag}${meta ? `<div class="meta">${esc(meta)}</div>` : ""}${metaRood ? `<div class="meta rood">${esc(metaRood)}</div>` : ""}</div>
    <div class="ctl">${ctl}</div>
    ${onder ? `<div class="onder">${onder}</div>` : ""}
  </div>`;
}

function actieGeblokt(key) {
  if (key === "binnen" && !(o.afleverdatum && o.aflevertijd)) return "Plan eerst de afleverdatum en het tijdsblok. Die leg je vast bij binnenkomst.";
  if (key === "factuur" && !(o.auto.kenteken && o.afleverdatum && o.aflevertijd)) return "Kan pas als kenteken, afleverdatum en tijdsblok er zijn.";
  if (key === "afgeleverd" && faseStatus(o, 3) !== "groen") return "Kan pas als fase 3 rond is: kenteken, afspraak en factuur.";
  /* werkplaatsklaar is de afsluiting van fase 4: eerst inplannen, laden en tanken */
  if (key === "wp_klaar") {
    const open = openPunten(o, 4).filter(p => p.key !== "wp_klaar");
    if (open.length) return `Kan pas als de rest van de werkplaats klaar is: ${open.map(p => p.label.toLowerCase()).join(", ")}.`;
    if (wachtOpVerkoper(o).length) return `Kan pas na de reactie van ${o.verkoper} op de opmerking van de werkplaats.`;
  }
  return "";
}

/* ---------- de gekozen fase ---------- */

function faseHtml(f) {
  const status = faseStatus(o, f.nr);
  const punten = puntenVoor(o, f.nr);
  const verplicht = punten.filter(p => p.verplicht);
  const gedaan = verplicht.filter(p => puntKlaar(o, p)).length;
  const magRol = magBewerken(ik, o, f.nr);
  const mag = magRol && (lopend(status) || status === "groen");
  const eigenaar = persoonVanRol(o, f.eigenaar);
  const wie = lopend(status) ? (eigenaar === ik.naam ? "Jij bent aan zet" : `${eigenaar} is aan zet`) : `${eigenaar}, ${ROLLEN[f.eigenaar].toLowerCase()}`;
  const pct = verplicht.length ? Math.round(gedaan / verplicht.length * 100) : 100;

  const m = [];
  if (f.nr === 1 && o.concept) m.push(`<div class="melding oranje"><b>Concept.</b> Deze order staat nog niet in het overzicht. Vul alles in en klik onderaan op Opslaan.</div>`);
  if (status === "rood") m.push(`<div class="melding rood"><b>Te laat.</b> ${esc(waaromTeLaat(o, f.nr))}.</div>`);
  if (!magRol && status !== "grijs") m.push(`<div class="melding met-icoon">${icoon("oog", 20)}<div><b>Alleen meelezen.</b> Deze fase is van ${esc(eigenaar)} (${ROLLEN[f.eigenaar].toLowerCase()}).${lopend(status) ? " Mist er iets? Plaats rechts een open punt." : ""}</div></div>`);
  if (o.heropend?.[f.nr]) m.push(`<div class="melding oranje">Heropend door ${esc(o.heropend[f.nr].door)}, ${tijdstip(o.heropend[f.nr].op)}.${magRol ? `<button type="button" class="knop" data-afronden="${f.nr}">Opnieuw afronden</button>` : ""}</div>`);
  if (status === "groen") {
    const af = [...o.log].reverse().find(l => l.wat === `Fase ${faseLabel(f.nr)} afgerond`);
    m.push(`<div class="melding groen">Afgerond${af ? ` door ${esc(af.door)}, ${tijdstip(af.op)}` : ""}.${magRol ? " Iets verkeerd ingevuld? Je kunt het hieronder herstellen; elke wijziging komt in het logboek." : ""}${ik.rol === "manager" ? `<button type="button" class="knop" data-heropen="${f.nr}">Fase heropenen</button>` : ""}</div>`);
  }
  if (status === "grijs") {
    const kop = f.nr === 5 ? "Je kunt de aflevering nog niet voorbereiden." : `Fase ${faseLabel(f.nr)} is nog niet begonnen.`;
    m.push(`<div class="melding slot">${icoon("slot", 20)}<div><b>${kop}</b> ${waaromOpSlot(o, f.nr).map(esc).join(" ")}</div></div>`);
  }
  if (f.nr === 5) {
    const wp = o.opmerkingen.filter(x => x.open && [2, 4].includes(x.fase));
    if (wp.length) m.push(`<div class="melding oranje"><b>Open punten van de werkplaats</b><br>${wp.map(x => esc(x.tekst)).join("<br>")}</div>`);
  }
  if (f.nr === 3 || f.nr === 5) {
    const d = verkoopDelen(o);
    m.push(`<div class="balk-blok"><div class="veld-lbl">Voortgang verkoop en aflevering</div>${delenBalk(d, "Verkoop en aflevering")}<div class="delen-labels">${d.map(x => `<span class="${x.klaar ? "af" : x.open ? "nu" : ""}">${x.nr}. ${esc(x.label)}</span>`).join("")}</div></div>`);
  }
  if (f.nr === "ott") m.push(`<div class="melding">Loopt tegelijk met fase 4. Aflevering kan pas groen als de OTT-code er is.</div>`);

  const groepen = [...new Set(punten.map(p => p.groep))];
  let voet = "";
  if (f.nr === 2 && mag) voet = `<div class="fase-voet stapel">
      <label class="veld-lbl" for="afwijking">Afwijking melden</label>
      <textarea id="afwijking" class="invoer" placeholder="Bijvoorbeeld: trekhaak niet leverbaar, komt over drie weken"></textarea>
      <button type="button" class="knop" id="afwijking_melden">Melden aan verkoper en afleverspecialist</button></div>`;
  if (f.nr === 1 && o.concept && mag) {
    const open = openPunten(o, 1).length;
    voet = `<div class="fase-voet">
      <button type="button" class="knop donker ${open ? "uit" : ""}" id="opslaan" ${open ? 'aria-disabled="true"' : ""}>Opslaan</button>
      <span>${open ? `Nog ${open} ${open === 1 ? "punt" : "punten"} open. Tot die tijd blijft de order een concept.` : "Alles ingevuld."}</span></div>`;
  }
  if (f.nr === 5 && o.vink.afgeleverd && o.heeftInruil) voet = `<div class="fase-voet">
      <a class="knop" href="briefje-handelsauto.html?id=${o.id}" target="_blank">Briefje handelsauto (A4)</a>
      <span>Voor achter de ruit van de inruil ${esc(o.inruil?.kenteken || "")}.</span></div>`;
  /* aflevering uitstellen: kan niet doorgaan (betaling, klant wil later), administratie krijgt direct een melding */
  else if (f.nr === 5 && !o.vink.afgeleverd && o.afleverdatum && mag) voet = `<div class="fase-voet stapel">
      <button type="button" class="knop" id="uitstel_toon" aria-expanded="false">Aflevering uitstellen</button>
      <div class="wijziging" id="uitstel_form" hidden>
        <label class="vh" for="uitstel_datum">Nieuwe afleverdatum</label><input id="uitstel_datum" class="invoer half" type="date" min="${plusDagen(o.afleverdatum, 1)}">
        <label class="vh" for="uitstel_blok">Nieuw tijdsblok</label><select id="uitstel_blok" class="invoer half">${Object.keys(AFLEVERBLOKKEN).map(k => `<option value="${k}" ${k === o.aflevertijd ? "selected" : ""}>${blokTekst(k)}</option>`).join("")}</select>
        <label class="vh" for="uitstel_reden">Reden</label><input id="uitstel_reden" class="invoer" placeholder="Bijvoorbeeld: betaling nog niet rond">
        <button type="button" class="knop donker" id="uitstel_sturen">Uitstellen, administratie krijgt melding</button>
      </div></div>`;
  if (f.nr === 3) voet = `<div class="fase-voet">
      <button type="button" class="knop" id="agenda" ${o.afleverdatum && o.aflevertijd ? "" : "disabled"}>Zet in agenda</button>
      <button type="button" class="knop" id="mailca" ${o.afleverdatum && o.aflevertijd ? "" : "disabled"}>Stuur naar CA</button>
      <a class="knop" href="briefje.html?id=${o.id}" target="_blank">Print briefje voorruit</a></div>`;

  return `<section class="fase ${status === "grijs" ? "op-slot" : magRol ? "" : "alleen-lezen"}" id="fase-${f.nr}" aria-labelledby="fase-titel">
    <div class="fase-kop">
      <div class="boven"><div><h2 id="fase-titel">Fase ${faseLabel(f.nr)} · ${f.naam}</h2><p>${esc(wie)} · ${gedaan} van ${verplicht.length} klaar</p></div>${pil(status)}</div>
      <div class="voortgang"><i class="st-${status}" style="width:${pct}%"></i></div>
    </div>
    ${m.length ? `<div class="fase-meldingen">${m.join("")}</div>` : ""}
    ${groepen.map(g => `<div class="groep"><h3>${esc(g)}</h3>${punten.filter(p => p.groep === g).map(p => puntHtml(p, mag)).join("")}</div>`).join("")}
    ${voet}
  </section>`;
}

/* ---------- zijkolom ---------- */

function zijHtml() {
  const open = o.opmerkingen.filter(m => m.open);
  const opgelost = o.opmerkingen.filter(m => !m.open);
  const timer = contactTimer(o);
  const keuzeNodig = !!timer || levertijdVoorbij(o);
  const docs = Object.values(o.vink).filter(v => v.bestand);
  const log = [...o.log].sort((a, b) => b.op.localeCompare(a.op));
  const fase = faseInfo(gekozen);
  /* een opmerking van de serviceadviseur is een vraag aan de verkoper: reactie verplicht,
     wie aan zet is wisselt per reactie, en de werkplaats kan intussen niet verder */
  const item = m => {
    const aanZet = vraagAanZet(m);
    const reacties = (m.reacties || []).map(r => `<div class="reactie"><div class="tekst">${esc(r.tekst)}</div><div class="meta"><span>${esc(r.door)}, ${tijdstip(r.op)}</span></div></div>`).join("");
    let voet = "";
    if (m.open && !aanZet) voet = `<div class="meta"><button type="button" class="knop link" data-opgelost="${m.id}">Opgelost</button></div>`;
    if (aanZet) {
      const magNu = aanZet === "verkoper" ? ["verkoper", "afleverspecialist", "manager"].includes(ik.rol) : ["serviceadviseur", "manager"].includes(ik.rol);
      const status = aanZet === "verkoper"
        ? `De werkplaats kan pas verder na een reactie van ${esc(o.verkoper)}.`
        : `${esc(persoonVanRol(o, "serviceadviseur"))} zet dit op opgelost als het echt is opgelost.`;
      voet = `<div class="meta rood">${status}</div>` + (magNu ? `
        <form class="zij-form reactie-form" data-reactie="${m.id}">
          <label class="vh" for="re_${m.id}">Reactie</label>
          <textarea id="re_${m.id}" name="tekst" class="invoer" placeholder="${aanZet === "verkoper" ? "Je reactie komt direct in de takenlijst van de serviceadviseur" : "Antwoord aan de verkoper"}"></textarea>
          <div class="rij-knoppen"><button class="knop">Reageren</button><button type="button" class="knop" data-opgelost="${m.id}">Opgelost</button></div>
        </form>` : "");
    }
    return `<div class="item ${m.open ? "" : "af"}"><div class="tekst">${esc(m.tekst)}</div>
      <div class="meta"><span>Fase ${faseLabel(m.fase)} · ${esc(m.auteur)}, ${tijdstip(m.op)}${m.auteurRol === "serviceadviseur" ? " · werkplaats" : ""}</span></div>
      ${reacties}${voet}</div>`;
  };

  /* toevoegingen: de klant wil er na de verkoop nog iets bij (feedback Mark, punt 4) */
  const toevoegingen = o.toevoegingen || [];
  const magToevoegen = ["verkoper", "afleverspecialist", "manager"].includes(ik.rol) && !o.concept && !o.vink.afgeleverd;
  const toevoegingItem = t => {
    let st = "";
    if (t.status === "nieuw") st = `<div class="meta">Wacht op ${esc(persoonVanRol(o, "serviceadviseur"))}: past dit vóór de aflevering?</div>`;
    if (t.status === "past") st = `<div class="meta">Past vóór de aflevering. Bevestigd door ${esc(t.beoordeeldDoor)}, ${tijdstip(t.beoordeeldOp)}.</div>`;
    if (t.status === "past-niet") {
      const vroegst = vroegsteNaGereed(t.gereed);
      const knelt = o.afleverdatum && o.afleverdatum < vroegst && !o.vink.afgeleverd;
      st = `<div class="meta ${knelt ? "rood" : ""}">Past niet: auto klaar op ${datumKort(t.gereed)}, vroegste aflevering ${datumKort(vroegst)} (48 uur later).${knelt ? ` Kies een nieuwe afleverdatum, de huidige (${datumKort(o.afleverdatum)}) is te vroeg.` : ""}</div>`;
    }
    return `<div class="item ${t.status === "nieuw" ? "" : "af"}"><div class="tekst">${esc(t.tekst)}</div>
      <div class="meta"><span>${esc(t.door)}, ${tijdstip(t.op)}</span></div>${st}</div>`;
  };
  const toevoegingenBlok = `<section class="zij-blok"><h2>Toevoegingen${toevoegingen.length ? ` <span class="n">${toevoegingen.length}</span>` : ""}</h2>
      ${toevoegingen.length ? `<div class="items">${[...toevoegingen].reverse().map(toevoegingItem).join("")}</div>` : `<p class="zij-leeg">Niets bijgekomen na de verkoop.</p>`}
      ${magToevoegen ? `<form class="zij-form" id="f_toevoeging">
        <label class="veld-lbl" for="toe_tekst">De klant wil er iets bij</label>
        <textarea id="toe_tekst" name="tekst" class="invoer" required placeholder="Bijvoorbeeld: all-season banden"></textarea>
        <button class="knop">Naar de serviceadviseur</button>
      </form>` : ""}
    </section>`;

  return `
    <section class="zij-blok"><h2>Open punten${open.length ? ` <span class="n">${open.length}</span>` : ""}</h2>
      ${open.length ? `<div class="items">${open.map(item).join("")}</div>` : `<p class="zij-leeg">Geen open punten.</p>`}
      ${opgelost.length ? `<details class="opgelost"><summary>${opgelost.length} opgelost</summary><div class="items">${opgelost.map(item).join("")}</div></details>` : ""}
      <form class="zij-form" id="f_opmerking">
        <label class="veld-lbl" for="opm_tekst">Open punt bij fase ${faseLabel(fase.nr)} · ${fase.naam}</label>
        <textarea id="opm_tekst" name="tekst" class="invoer" required placeholder="${ik.rol === "serviceadviseur" ? `Jouw opmerking komt direct in de takenlijst van ${esc(o.verkoper)}` : "Wat moet er nog gebeuren?"}"></textarea>
        <button class="knop">Plaatsen</button>
      </form>
    </section>
    ${toevoegingenBlok}
    <section class="zij-blok"><h2>Klantcontact</h2>
      ${timer ? `<div class="melding oranje">${esc(timer.tekst)}. Taak voor ${esc(persoonVanRol(o, timer.wie))}. Leg na het gesprek vast of de datum blijft of welke nieuwe datum is afgesproken.</div>` : ""}
      ${levertijdVoorbij(o) ? `<div class="melding rood"><b>Verwachte leverdatum ${-dagenTot(o.levertijd)} dagen voorbij.</b> Spreek een nieuwe datum af met de klant.</div>` : ""}
      ${o.contact.length ? `<div class="items">${[...o.contact].reverse().map(c => `<div class="item"><div class="tekst">${esc(c.tekst)}</div><div class="meta">${esc(c.door)}, ${tijdstip(c.op)}</div></div>`).join("")}</div>` : `<p class="zij-leeg">Nog geen contact vastgelegd.</p>`}
      <form class="zij-form" id="f_contact">
        <label class="veld-lbl" for="contact_tekst">Contactmoment vastleggen</label>
        <textarea id="contact_tekst" name="tekst" class="invoer" required placeholder="Wat is er besproken?"></textarea>
        ${keuzeNodig ? `<fieldset class="keuze-datum"><legend class="veld-lbl">Verwachte levering na dit gesprek</legend>
          ${verwachteDatum(o) && !levertijdVoorbij(o) ? `<label><input type="radio" name="datum_keuze" value="blijft" required> Blijft ${datumKort(verwachteDatum(o))}</label>` : ""}
          <label><input type="radio" name="datum_keuze" value="nieuw" required> Nieuwe datum afgesproken</label>
          <label class="vh" for="nieuwe_datum">Nieuwe datum</label><input id="nieuwe_datum" name="nieuwe_datum" type="date" class="invoer">
        </fieldset>` : ""}
        <button class="knop">Vastleggen</button>
      </form>
    </section>
    ${docs.length ? `<section class="zij-blok"><h2>Documenten</h2><div class="items">${docs.map(d => `<div class="item"><div class="tekst">${esc(d.bestand)}</div><div class="meta">${esc(d.door)}, ${tijdstip(d.op)}</div></div>`).join("")}</div></section>` : ""}
    <section class="zij-blok"><h2>Logboek</h2>
      <div class="items">${(heelLogboek ? log : log.slice(0, 5)).map(l => `<div class="item"><div class="tekst">${esc(l.wat)}</div><div class="meta">${esc(l.door)}, ${tijdstip(l.op)}</div></div>`).join("")}</div>
      ${log.length > 5 && !heelLogboek ? `<button type="button" class="knop link meer" id="log_meer">Toon alles (${log.length})</button>` : ""}
    </section>`;
}

/* ---------- alles ---------- */

function teken() {
  if (faseStatus(o, gekozen) === "nvt") gekozen = startFase();
  const klaar = huidigeFase(o) === "klaar";
  const status = klaar ? "groen" : kaartStatus(o);
  const wis = wisDatum(o);
  const scroll = window.scrollY;
  const nieuweFase = vorigeGekozen !== gekozen;
  vorigeGekozen = gekozen;
  const magVerwijderen = ik.rol === "manager" || (o.concept && ik.naam === o.verkoper);
  const feit = (dt, dd) => `<div><dt>${dt}</dt><dd>${dd}</dd></div>`;
  const stappen = FASES.filter(f => faseVanToepassing(o, f.nr));

  hoofd.innerHTML = `
    <div class="order-kop">
      <a class="terug" href="${startpagina(ik.rol)}">${icoon("pijl-links", 16)}${MENU[MENU_PER_ROL[ik.rol][0]][1]}</a>
      <div class="order-titel"><h1>${esc(klantNaam(o))}</h1>${o.concept ? pil("grijs", "Concept") : pil(status, klaar ? "Afgeleverd" : STATUS_TEKST[status])}
        ${magVerwijderen ? `<button type="button" class="knop link verwijder" id="verwijderen">${o.concept ? "Concept" : "Order"} verwijderen</button>` : ""}</div>
      <p class="order-sub">${esc([autoNaam(o) || "Model nog kiezen", o.auto.kenteken || (meldcode(o) ? "meldcode " + meldcode(o) : ""), o.type === "nieuw" ? "" : TYPES[o.type]].filter(Boolean).join(" · "))}</p>
      <dl class="feiten">
        ${feit("Verkoper", esc(o.verkoper))}
        ${feit("Order", esc(o.ordernummer || "Nog geen nummer"))}
        ${feit("Levertijd", o.levertijd ? datumKort(o.levertijd) : "Nog invullen")}
        ${feit("Aflevering", o.afleverdatum ? datumKort(o.afleverdatum) + (o.aflevertijd ? ", " + o.aflevertijd.replace(":", ".") : "") : "Nog niet gepland")}
        ${feit("Te betalen", o.te_betalen != null && o.te_betalen !== "" ? bedrag(o.te_betalen) : "Nog invullen")}
        ${feit("Mastercare", o.mastercare === true ? "Ja" : o.mastercare === false ? "Nee" : "Nog kiezen")}
      </dl>
      ${wachtOpVerkoper(o).length ? `<div class="melding rood"><b>De werkplaats kan niet verder.</b> ${wachtOpVerkoper(o).length === 1 ? "Een opmerking van de werkplaats wacht" : wachtOpVerkoper(o).length + " opmerkingen van de werkplaats wachten"} op een reactie van ${esc(o.verkoper)}, zie Open punten.</div>` : ""}
      ${toevoegingProbleem(o) ? `<div class="melding rood"><b>De afleverdatum past niet meer.</b> Door de toevoeging is de auto pas ${datumKort(toevoegingProbleem(o).gereed)} klaar; vroegste aflevering ${datumKort(vroegsteNaGereed(toevoegingProbleem(o).gereed))}. Wijzig de datum in fase 3 of stel de aflevering uit in fase 5.</div>` : ""}
      ${o.uitgesteld && !o.uitgesteld.verwerkt ? `<div class="melding oranje">Aflevering uitgesteld door ${esc(o.uitgesteld.door)}: was ${datumKort(o.uitgesteld.van)}, wordt ${datumKort(o.afleverdatum)}${o.uitgesteld.reden ? `. Reden: ${esc(o.uitgesteld.reden)}` : ""}. De administratie heeft een melding.</div>` : ""}
      ${wis ? `<div class="melding">Klantgegevens gaan er op ${datumKort(wis)} uit, 30 dagen na aflevering. ${o.nps != null ? `NPS ${o.nps}, review ${o.review} van 5.` : `NPS en review komen vanaf ${datumKort(npsDatum(o))} binnen.`}</div>` : ""}
    </div>
    <nav class="stappen" aria-label="Fases">${stappen.map((f, i) => {
      const s = faseStatus(o, f.nr);
      const vorige = i ? faseStatus(o, stappen[i - 1].nr) : "";
      return `<button type="button" class="stap ${s} ${f.nr === gekozen ? "gekozen" : ""} ${vorige === "groen" ? "na-groen" : ""}" data-naar="${f.nr}" ${f.nr === gekozen ? 'aria-current="step"' : ""}>
        <span class="bol">${s === "groen" ? icoon("vink", 14) : s === "grijs" ? icoon("slot", 14) : faseLabel(f.nr)}</span><span class="nm">${f.naam}</span><span class="st">${STATUS_TEKST[s]}</span></button>`;
    }).join("")}</nav>
    <div class="order-grid">
      <div class="${nieuweFase ? "vervaag-in" : ""}">${faseHtml(faseInfo(gekozen))}</div>
      <aside class="zij">${zijHtml()}</aside>
    </div>`;
  window.scrollTo(0, scroll);
}

/* ---------- agenda-afspraak als .ics, tot de Graph-koppeling er is ---------- */
function agendaBestand() {
  const meldcode = o.auto.meldcode || (o.auto.chassis || "").slice(-4);
  const start = `${o.afleverdatum.replaceAll("-", "")}T${o.aflevertijd.replace(":", "")}00`;
  const eind = `${o.afleverdatum.replaceAll("-", "")}T${(AFLEVERBLOKKEN[o.aflevertijd] || o.aflevertijd).replace(":", "")}00`;
  const titel = `Afl. ${klantNaam(o)} BYD ${o.auto.model} #${meldcode}${o.type !== "nieuw" ? " (" + TYPES[o.type].toLowerCase() + ")" : ""}`;
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ADG Groep//Afleverproces BYD//NL", "METHOD:PUBLISH", "BEGIN:VEVENT",
    `UID:aflevering-${o.id}@adggroep.nl`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART:${start}`, `DTEND:${eind}`, `SUMMARY:${titel}`, "CATEGORIES:Oranje categorie",
    `DESCRIPTION:Verkoper: ${o.verkoper}\\nMastercare: ${o.mastercare ? "ja" : "nee"}\\nOrder: ${o.ordernummer}`,
    "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  a.download = `${titel}.ics`;
  a.click();
  toast("Afspraak gedownload. Open hem en sla hem op in de agenda van bydgroningen@.");
}

/* ---------- aflevergegevens als klaargezette mail naar de administratie (CA) ----------
   mailto kan alleen platte tekst, geen tabel. Daarom een .eml-bestand (message/rfc822) met
   X-Unsent: 1: Outlook opent dat als concept met de HTML-tabel erin, gericht aan ca@adggroep.nl.
   De verkoper controleert en verstuurt zelf. Blob-download blijft binnen de CSP (geen fetch),
   net als agendaBestand(). Dit is het webequivalent van de Excel-macro (zie docs/bron). */
function mailNaarCa() {
  const k = o.klant || {}, a = o.auto || {};
  const adres = [k.postcode, k.huisnr].filter(Boolean).join(" ");
  const aflevering = o.afleverdatum
    ? `${datumKort(o.afleverdatum)}${o.aflevertijd ? ", " + blokTekst(o.aflevertijd) : ""}`
    : "Nog niet gepland";
  const jaNee = v => v === true ? "Ja" : v === false ? "Nee" : "Nog niet gekozen";
  const leeg = "Nog niet ingevuld";

  const rijen = [
    ["kop", "Order"],
    ["Ordernummer", o.ordernummer || "Nog geen nummer"],
    ["Soort", TYPES[o.type] || leeg],
    ["Verkoper", o.verkoper || leeg],
    ["kop", "Klant"],
    ["Naam", klantNaam(o)],
    ["Postcode en huisnummer", adres || leeg],
    ["E-mail", k.email || leeg],
    ["Telefoon", k.tel || leeg],
    ["kop", "Auto"],
    ["Model", autoNaam(o) || leeg],
    ["Uitvoering", a.uitvoering || leeg],
    ["Kleur", a.kleur || leeg],
    ["Kenteken", a.kenteken || leeg],
    ["Chassisnummer (VIN)", a.chassis || leeg],
    ["Meldcode", meldcode(o) || leeg],
    ["kop", "Aflevering en financieel"],
    ["Afleverdatum", aflevering],
    ["Mastercare", jaNee(o.mastercare)],
    ["OTT-tenaamstelling", jaNee(o.ott)],
    ["Toe te betalen", o.te_betalen != null && o.te_betalen !== "" ? bedrag(o.te_betalen) : leeg]
  ];

  const body = rijen.map(([label, val]) =>
    label === "kop"
      ? `<tr><th colspan="2" style="background:#f0f0f0;border:1px solid #cccccc;padding:6px 10px;text-align:left;font-size:14px;">${esc(val)}</th></tr>`
      : `<tr><td style="border:1px solid #cccccc;padding:6px 10px;font-weight:bold;width:40%;">${esc(label)}</td><td style="border:1px solid #cccccc;padding:6px 10px;">${esc(val)}</td></tr>`
  ).join("");

  const html = `<!DOCTYPE html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222222;">
<p>Hierbij de aflevergegevens voor ${esc(klantNaam(o))}.</p>
<table style="border-collapse:collapse;border:1px solid #cccccc;">${body}</table>
<p>Met vriendelijke groet,<br>${esc(o.verkoper || "")}</p>
</body></html>`;

  /* niet-ASCII in het onderwerp (accenten in een naam) RFC 2047-geldig coderen voor Outlook */
  const naarUtf8B64 = s => { let bin = ""; new TextEncoder().encode(s).forEach(b => bin += String.fromCharCode(b)); return btoa(bin); };
  const onderwerp = `Afleverformulier ${o.ordernummer || meldcode(o) || o.id} - ${klantNaam(o)}`;
  const onderwerpHeader = /[^\x00-\x7F]/.test(onderwerp) ? `=?UTF-8?B?${naarUtf8B64(onderwerp)}?=` : onderwerp;

  const eml = [
    "To: ca@adggroep.nl",
    `Subject: ${onderwerpHeader}`,
    "X-Unsent: 1",
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "",
    html
  ].join("\r\n");

  const el = document.createElement("a");
  el.href = URL.createObjectURL(new Blob([eml], { type: "message/rfc822" }));
  el.download = `Afleverformulier ${o.ordernummer || meldcode(o) || o.id}.eml`;
  el.click();
  toast("Mail klaargezet. Open het gedownloade bestand; Outlook opent een concept aan ca@adggroep.nl. Controleer en verstuur.");
}

/* ---------- invoer ---------- */

const ACTIE_MELDING = {
  team_info: () => `Melding met chassisnummer ${o.auto.chassis || "(nog leeg)"} naar het team in Groningen en Meppel.`,
  binnen: () => `Auto staat als binnen gemeld. De werkplaats kan ingepland worden.${o.type === "import" ? " De importlijst is bijgewerkt." : ""}`,
  kent_aangevraagd: () => "Kenteken-timer gestart. Verwacht binnen 1 tot 4 dagen.",
  factuur: () => `Factuuraanvraag naar de administratie, te betalen ${bedrag(o.te_betalen)}. De afleverdatum ligt nu vast.`,
  afgeleverd: () => "Aflevering afgerond. NPS volgt na 28 dagen, klantgegevens gaan er na 30 dagen uit."
};

hoofd.addEventListener("change", e => {
  const t = e.target, d = t.dataset;
  if (d.pad) {
    let w = t.value;
    if (d.soort === "getal") w = w === "" ? "" : Number(w);
    else if (d.soort === "bedrag") { const c = String(t.value).replace(/[^\d,]/g, "").replace(",", "."); w = c === "" ? "" : Number(c); }
    wijzig(() => {
      zet(o, d.pad, w);
      if (d.pad === "type" && w !== "nieuw") o.voorraad = null;
      if (d.pad === "type" && w === "nieuw") o.voorraad ||= "winkel";
      if (d.pad === "inruil.kenteken") { delete o.inruil.merk; delete o.inruil.model; delete o.inruil.rdw; }
      if (d.pad === "auto.model" && o.premie && o.premie.model !== w) delete o.premie;
    }, `${d.label} gewijzigd`);
    if (d.pad === "auto.kenteken" && t.value && heeftTrekhaak(o) && !o.vink.witteplaat)
      toast(`Trekhaak op de order: ${persoonVanRol(o, "serviceadviseur")} krijgt direct de taak om de witte kentekenplaat te bestellen.`);
    /* merk en model van de inruil komen uit de open data van de RDW */
    if (d.pad === "inruil.kenteken" && w) rdwAuto(w).then(auto => {
      if (o.inruil.kenteken !== w) return;
      wijzig(() => { if (auto) Object.assign(o.inruil, auto, { rdw: true }); else o.inruil.rdw = false; },
        auto ? `RDW: inruil is een ${auto.merk} ${auto.model}` : "");
    });
  } else if (d.premie) {
    const pr = laadPremies().find(x => x.id === t.value);
    wijzig(() => {
      if (pr) o.premie = { id: pr.id, model: pr.model, soort: pr.soort, bedrag: pr.bedrag, code: pr.code, tot: pr.tot };
      else if (t.value === "geen") o.premie = { id: "geen", model: o.auto.model };
      else delete o.premie;
    }, pr ? `Premie gekozen: ${pr.soort}, ${bedrag(pr.bedrag)}, premiecode ${pr.code}` : t.value === "geen" ? "Premie: geen premie" : "Premie leeggemaakt");
  } else if (d.importkeuze) {
    const imp = laadImports().find(i => i.chassis === t.value);
    wijzig(() => {
      o.auto.chassis = t.value;
      if (imp) o.auto.model = `${imp.merk === "BYD" ? "" : imp.merk + " "}${imp.model}`;
    }, imp ? `Gekoppeld aan importauto ${imp.merk} ${imp.model} (${imp.chassis})` : "Importauto losgekoppeld");
  } else if (d.upload) {
    const naam = t.files[0]?.name; if (!naam) return;
    wijzig(() => { o.vink[d.upload] = { door: ik.naam, op: nu(), bestand: naam }; }, `${naam} geüpload`);
  } else if (d.acc) {
    const a = o.accessoires[d.acc];
    wijzig(() => { a[d.veld] = t.type === "checkbox" ? t.checked : t.value; }, `Onderdeel ${a.naam}: ${d.veld} bijgewerkt`);
  } else if (d.poets) {
    wijzig(() => { o.poets = { ...(o.poets || {}), [d.poets]: t.value }; }, "Poetser ingepland");
    if (d.poets === "datum" && t.value && o.afleverdatum && t.value > o.afleverdatum) toast(`Let op: de poetsbeurt (${datumKort(t.value)}) staat na de aflevering (${datumKort(o.afleverdatum)}). Plan hem eerder in.`, "rood");
    else if (d.poets === "datum" && t.value && dagenTot(t.value) < 1) toast("Minder dan 24 uur vooraf ingepland bij de poetser. Dat kost extra.");
  }
});

hoofd.addEventListener("click", e => {
  const t = e.target.closest("button");
  if (!t) return;
  const d = t.dataset;
  if (d.naar) {
    gekozen = nrUit(d.naar);
    history.replaceState(null, "", `#fase-${d.naar}`);
    teken(); return;
  }
  if (d.janee) { wijzig(() => zet(o, d.janee, d.w === "1"), `${d.label}: ${d.w === "1" ? "ja" : "nee"}`); return; }
  if (d.vink) {
    if (actieGeblokt(d.vink)) { toast(actieGeblokt(d.vink)); return; }
    wijzig(() => { o.vink[d.vink] = { door: ik.naam, op: nu() }; }, `${d.label} afgevinkt`);
    if (d.vink === "wp_klaar") toast("WP-klaar. Zet dit ook bij de afspraak in de agenda van bydgroningen@.");
    return;
  }
  if (d.actie) {
    if (actieGeblokt(d.actie)) { toast(actieGeblokt(d.actie)); return; }
    if (d.actie === "factuur" && !confirm(`Klopt de afleverdatum: ${datumKort(o.afleverdatum)}, ${blokTekst(o.aflevertijd)}?\n\nNa de factuuraanvraag kun je hem alleen nog wijzigen via de administratie.`)) return;
    wijzig(() => { o.vink[d.actie] = { door: ik.naam, op: nu() }; },
      d.actie === "factuur" ? `Afleverdatum bevestigd (${datumKort(o.afleverdatum)}, ${blokTekst(o.aflevertijd)}) en factuur aangevraagd` : t.textContent);
    toast(ACTIE_MELDING[d.actie]?.() || `${t.textContent}.`);
    return;
  }
  if (d.terug) { wijzig(() => delete o.vink[d.terug], `${d.label} teruggezet`); o.log[o.log.length - 1].terug = true; bewaar(orders); return; }
  if (d.weg) { wijzig(() => o.accessoires.splice(Number(d.weg), 1), "Accessoire verwijderd"); return; }
  if (d.regelWeg != null) { wijzig(() => o.werkplaatsregels.splice(Number(d.regelWeg), 1), "Regel voor de werkplaats verwijderd"); return; }
  if (d.opgelost) {
    const m = o.opmerkingen.find(x => x.id == d.opgelost);
    wijzig(() => { m.open = false; }, m.auteurRol === "serviceadviseur" ? "Opmerking van de werkplaats opgelost" : "Open punt opgelost");
    if (m.auteurRol === "serviceadviseur") toast("Opgelost. De werkplaats kan weer verder.", "groen");
    return;
  }
  if (d.heropen) { wijzig(() => { (o.heropend ??= {})[nrUit(d.heropen)] = { door: ik.naam, op: nu() }; }, `Fase ${faseLabel(nrUit(d.heropen))} heropend`); return; }
  if (d.afronden) { wijzig(() => { delete o.heropend[d.afronden]; }, `Fase ${faseLabel(nrUit(d.afronden))} opnieuw afgerond`); return; }
  if (t.id === "acc_toevoegen") {
    const naam = document.getElementById("nieuw_acc").value.trim(); if (!naam) return;
    wijzig(() => o.accessoires.push({ naam }), `Accessoire ${naam} toegevoegd`); return;
  }
  if (t.id === "regel_toevoegen") {
    const regel = document.getElementById("nieuwe_regel").value.trim(); if (!regel) return;
    wijzig(() => (o.werkplaatsregels ??= []).push(regel), `Regel voor de werkplaats: ${regel}`);
    toast("De serviceadviseur ziet de regel bij fase 2 en in zijn werkplaatsscherm.");
    return;
  }
  if (t.id === "uitstel_toon") {
    const vorm = document.getElementById("uitstel_form");
    vorm.hidden = !vorm.hidden;
    t.setAttribute("aria-expanded", String(!vorm.hidden));
    return;
  }
  if (t.id === "uitstel_sturen") {
    const datum = document.getElementById("uitstel_datum").value, blok = document.getElementById("uitstel_blok").value;
    const reden = document.getElementById("uitstel_reden").value.trim();
    if (!datum) { toast("Kies de nieuwe afleverdatum."); return; }
    if (datum <= o.afleverdatum) { toast(`Uitstellen kan alleen naar later: kies een dag na ${datumKort(o.afleverdatum)}.`); return; }
    const van = `${datumKort(o.afleverdatum)}, ${blokTekst(o.aflevertijd)}`;
    wijzig(() => {
      o.uitgesteld = { van: o.afleverdatum, vanTijd: o.aflevertijd, naar: datum, reden, door: ik.naam, op: nu() };
      o.afleverdatum = datum; o.aflevertijd = blok;
    }, `Aflevering uitgesteld: ${van} wordt ${datumKort(datum)}, ${blokTekst(blok)}${reden ? `. Reden: ${reden}` : ""}. Melding naar de administratie`);
    toast(`Uitgesteld naar ${datumKort(datum)}. De administratie ziet de melding en de nieuwe datum direct in haar taken. Zet de nieuwe datum ook in de agenda.`);
    return;
  }
  if (t.id === "afwijking_melden") {
    const tekst = document.getElementById("afwijking").value.trim(); if (!tekst) return;
    wijzig(() => o.opmerkingen.push({ id: Date.now(), fase: 2, tekst, open: true, auteur: ik.naam, auteurRol: ik.rol, op: nu() }), "Afwijking gemeld");
    toast(`Staat direct in de takenlijst van ${o.verkoper}; de afleverspecialist ziet hem ook. De werkplaats kan verder na zijn reactie.`); return;
  }
  if (t.id === "agenda") agendaBestand();
  if (t.id === "mailca") mailNaarCa();
  if (t.id === "wijz_sturen") {
    const datum = document.getElementById("wijz_datum").value, blok = document.getElementById("wijz_blok").value;
    if (!datum) { toast("Kies de nieuwe afleverdatum."); return; }
    if (datum === o.afleverdatum && blok === o.aflevertijd) { toast("Datum en tijdsblok zijn niet veranderd."); return; }
    const van = `${datumKort(o.afleverdatum)}, ${blokTekst(o.aflevertijd)}`, naar = `${datumKort(datum)}, ${blokTekst(blok)}`;
    wijzig(() => { o.afleverdatum = datum; o.aflevertijd = blok; }, `Wijziging afleverdatum naar de administratie: ${van} wordt ${naar}`);
    toast(`Wijziging naar de administratie: ${naar}. De werkplaats schuift mee.`);
  }
  if (t.id === "opslaan") {
    const open = openPunten(o, 1);
    if (open.length) { toast(`Nog open: ${open.slice(0, 3).map(p => eersteKlein(p.label)).join(", ")}${open.length > 3 ? ` en nog ${open.length - 3}` : ""}.`); return; }
    wijzig(() => { delete o.concept; }, "Order opgeslagen");
    toast("Opgeslagen. De order staat nu in het overzicht.", "groen");
  }
  if (t.id === "verwijderen") {
    const wat = o.concept ? "het concept" : "de order";
    if (!confirm(`Weet je zeker dat je ${wat} van ${klantNaam(o)} (${o.auto.model || "geen model"}) wilt verwijderen?${o.concept ? "" : " Doe dit alleen als de order is geannuleerd."}`)) return;
    if (!confirm(`Echt verwijderen? ${o.concept ? "Het concept" : "De order"} en het logboek verdwijnen. Dit kun je niet terugdraaien.`)) return;
    orders.splice(orders.indexOf(o), 1);
    bewaar(orders);
    wachtOpOpslaan().then(() => { location.href = startpagina(ik.rol); });
  }
  if (t.id === "log_meer") { heelLogboek = true; teken(); }
});

hoofd.addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.id === "nieuw_acc") { e.preventDefault(); document.getElementById("acc_toevoegen").click(); }
  if (e.key === "Enter" && e.target.id === "nieuwe_regel") { e.preventDefault(); document.getElementById("regel_toevoegen").click(); }
});

hoofd.addEventListener("submit", e => {
  e.preventDefault();
  const tekst = (new FormData(e.target).get("tekst") || "").trim();
  if (e.target.dataset.reactie) {
    const m = o.opmerkingen.find(x => x.id == e.target.dataset.reactie);
    if (!tekst) { toast("Schrijf eerst een reactie."); return; }
    const kant = vraagAanZet(m);
    wijzig(() => (m.reacties ??= []).push({ door: ik.naam, rol: kant, op: nu(), tekst }),
      kant === "verkoper" ? `Reactie aan de werkplaats: ${tekst}` : `Reactie van de werkplaats: ${tekst}`);
    toast(kant === "verkoper"
      ? `Je reactie staat in de takenlijst van ${persoonVanRol(o, "serviceadviseur")}. Hij zet het punt op opgelost als het echt is opgelost.`
      : `Reactie staat in de takenlijst van ${o.verkoper}.`);
    return;
  }
  if (e.target.id === "f_toevoeging") {
    if (!tekst) return;
    wijzig(() => (o.toevoegingen ??= []).push({ id: Date.now(), tekst, door: ik.naam, op: nu(), status: "nieuw" }), `Toevoeging aan de order: ${tekst}`);
    toast(`${persoonVanRol(o, "serviceadviseur")} ziet de toevoeging direct bij zijn taken en beoordeelt of hij vóór de aflevering past.`);
    return;
  }
  if (e.target.id === "f_opmerking") {
    wijzig(() => o.opmerkingen.push({ id: Date.now(), fase: gekozen, tekst, open: true, auteur: ik.naam, auteurRol: ik.rol, op: nu() }), "Open punt geplaatst");
    if (ik.rol === "serviceadviseur") toast(`Staat direct in de takenlijst van ${o.verkoper}. Hij ziet erbij dat de werkplaats wacht op zijn reactie.`);
  }
  if (e.target.id === "f_contact") {
    const fd = new FormData(e.target);
    const keuze = fd.get("datum_keuze");
    const nieuw = fd.get("nieuwe_datum");
    if (keuze === "nieuw" && !nieuw) { toast("Vul de nieuwe datum in die je met de klant hebt afgesproken."); document.getElementById("nieuwe_datum").focus(); return; }
    const timer = contactTimer(o);
    const veld = o.afleverdatum ? "afleverdatum" : "levertijd";
    const oud = o[veld];
    const viaAdministratie = veld === "afleverdatum" && keuze === "nieuw" && !!o.vink.factuur;
    wijzig(() => {
      o.contact.push({ op: nu(), door: ik.naam, tekst, momenten: timer ? [timer.soort, ...(timer.soort === "drieweken" ? ["helft"] : [])] : [] });
      if (keuze === "nieuw") {
        o[veld] = nieuw;
        o.log.push({ op: nu(), door: ik.naam, wat: `${veld === "afleverdatum" ? "Afleverdatum" : "Verwachte leverdatum"} na klantcontact: ${datumKort(oud)} wordt ${datumKort(nieuw)}${viaAdministratie ? ". Wijziging naar de administratie" : ""}` });
      } else if (keuze === "blijft") {
        o.log.push({ op: nu(), door: ik.naam, wat: `Na klantcontact: ${datumKort(oud)} blijft staan` });
      }
    }, "Contactmoment vastgelegd");
    toast(keuze === "nieuw" ? `Vastgelegd. Nieuwe verwachte datum: ${datumKort(nieuw)}.${viaAdministratie ? " De factuur was al aangevraagd, dus de wijziging gaat naar de administratie." : ""}` : "Contactmoment vastgelegd.");
  }
});

if (o) teken();
