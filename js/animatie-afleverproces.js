/* Tijdlijn van de inlog-animatie (animatie-afleverproces.html).

   Links verschijnen de losse vragen van de oude werkwijze, de teller loopt op tot 6 open
   vragen. Rechts gaat elke fase van grijs naar oranje naar groen, met eronder wie de auto
   daarna heeft. Daarna het premierapport, dan de eindkaart, en dan opnieuw. Bij "minder
   beweging" (prefers-reduced-motion) staat alleen de eindkaart. */

const DUUR = 15;        /* s tot de eindkaart */
const EIND_HOLD = 6;    /* s dat de eindkaart blijft staan */
const LOOP = DUUR + 1 + EIND_HOLD;

/* [tekst, kanaal, tijdstip in s] */
const VRAGEN = [
  ["Contract doorsturen naar de werkplaats", "mail", 1.4],
  ["Zijn de onderdelen al besteld?", "bellen", 3.6],
  ["Kenteken bekend? Administratie laten weten", "mail", 5.8],
  ["Afleverafspraak zelf in de agenda zetten", "Outlook", 8.0],
  ["Collega vrij: waar staat deze auto?", "rondvragen", 10.2],
  ["Premies voor BYD bij elkaar zoeken", "Excel", 12.4]
];

/* [nr, fase, eigenaar, volgende eigenaar] */
const FASES = [
  [1, "Verkoop", "verkoper", "serviceadviseur"],
  [2, "Onderdelen", "serviceadviseur", "verkoper"],
  [3, "Auto binnen", "verkoper", "serviceadviseur"],
  [4, "Werkplaats", "serviceadviseur", "verkoper"],
  [5, "Aflevering", "verkoper", ""]
];
const FASE_START = 0.9, FASE_STAP = 2.3, FASE_DUUR = 1.6; /* oranje op start, groen na FASE_DUUR */
const RAPPORT_OP = FASE_START + 4 * FASE_STAP + FASE_DUUR + 0.9;

function el(tag, klasse, tekst) {
  const d = document.createElement(tag);
  if (klasse) d.className = klasse;
  if (tekst != null) d.textContent = tekst;
  return d;
}

const elVragen = VRAGEN.map(v => {
  const d = el("div", "vraag");
  d.append(el("span", "vt", "?"), el("span", "", v[0]), el("span", "kanaal", v[1]));
  document.getElementById("vragen").appendChild(d);
  return d;
});
const elFases = FASES.map(f => {
  const d = el("div", "fase");
  d.append(el("span", "nr", String(f[0])), el("span", "", f[1]), el("span", "wie", f[2]), el("span", "stip"));
  document.getElementById("fases").appendChild(d);
  return d;
});

const tellerOud = document.getElementById("teller_oud");
const tellerTool = document.getElementById("teller_tool");
const overdracht = document.getElementById("overdracht");
const rapport = document.getElementById("rapport");
const statusOud = document.getElementById("status_oud");
const statusTool = document.getElementById("status_tool");

function schaal() {
  const k = Math.min(innerWidth / 1600, innerHeight / 900);
  document.getElementById("stage").style.transform = `scale(${k})`;
}
addEventListener("resize", schaal); schaal();

const rustig = matchMedia("(prefers-reduced-motion: reduce)").matches;
let start = performance.now();

function frame(nu) {
  let t = (nu - start) / 1000;
  if (rustig) t = DUUR + 0.5;
  if (t > LOOP && !rustig) { start = nu; t = 0; }
  document.body.classList.toggle("start", t > 0.15);

  /* links */
  let open = 0;
  VRAGEN.forEach((v, i) => {
    const aan = t >= v[2];
    elVragen[i].classList.toggle("zichtbaar", aan);
    if (aan) open++;
  });
  tellerOud.firstChild.textContent = String(open);
  statusOud.classList.toggle("zichtbaar", t >= 9);

  /* rechts */
  let groen = 0, laatsteOver = "";
  FASES.forEach((f, i) => {
    const op = FASE_START + i * FASE_STAP;
    const af = t >= op + FASE_DUUR;
    elFases[i].classList.toggle("bezig", t >= op && !af);
    elFases[i].classList.toggle("af", af);
    if (af) { groen++; if (f[3]) laatsteOver = f[3]; }
  });
  tellerTool.firstChild.textContent = `${groen}/5`;
  tellerTool.classList.toggle("klaar", groen === 5);

  const toonOver = groen > 0 && groen < 5;
  const tekst = toonOver ? `Fase ${groen} groen. Staat nu bij de ${laatsteOver} in Mijn taken.` : "";
  if (overdracht.dataset.t !== tekst) { overdracht.dataset.t = tekst; if (tekst) overdracht.textContent = tekst; }
  overdracht.classList.toggle("zichtbaar", toonOver);

  rapport.classList.toggle("zichtbaar", t >= RAPPORT_OP);
  statusTool.classList.toggle("zichtbaar", t >= RAPPORT_OP + 0.8);

  document.body.classList.toggle("einde", t >= DUUR + 0.6);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
