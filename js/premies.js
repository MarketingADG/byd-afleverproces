/* Premielijst: de manager zet per model welke premiesoorten er gelden (inruilpremie, ADG lease
   premie, Unilease, ...), elk met bedrag, premiecode en einddatum. De lijst met premiesoorten
   houdt de manager hier ook bij. In fase 1 van een order kiest de verkoper één premie uit de
   soorten die voor het gekozen model gelden. Een speciale deal legt de verkoper zelf vast in
   fase 1, met eigen dealcode. */

const ik = kopbalk("premies");
const bak = document.getElementById("premies");
let premies = laadPremies();
let soorten = laadPremiesoorten();

function nieuwId() { return "p" + Date.now().toString(36); }

function teken() {
  const rijen = [...premies].sort((a, b) =>
    MODELLEN.indexOf(a.model) - MODELLEN.indexOf(b.model) || soorten.indexOf(a.soort) - soorten.indexOf(b.soort));
  bak.innerHTML = `
    <section class="paneel">
      <h2>Premies per model</h2>
      <p class="toelichting">Een model kan meerdere premiesoorten hebben; de verkoper kiest er bij de order één uit. Wijzig een bedrag, code of datum en het staat meteen goed in nieuwe orders.</p>
      ${rijen.length ? `<table class="tabel premietabel"><thead><tr><th>Model</th><th>Premiesoort</th><th>Premie</th><th>Premiecode</th><th>Geldig tot en met</th><th>Laatst gewijzigd</th><th><span class="vh">Verwijderen</span></th></tr></thead><tbody>
        ${rijen.map((p, i) => {
          const eerste = i === 0 || rijen[i - 1].model !== p.model;
          const naam = esc(`${p.model}, ${p.soort}`);
          return `<tr class="${eerste ? "nieuw-model" : ""} ${p.tot && dagenTot(p.tot) < 0 ? "te-laat" : ""}">
          <td>${eerste ? `<b>${esc(p.model)}</b>` : `<span class="vh">${esc(p.model)}</span>`}</td>
          <td>${esc(p.soort)}</td>
          <td><label class="vh" for="b_${p.id}">Premie ${naam}</label><input id="b_${p.id}" class="invoer" type="number" min="0" step="50" data-id="${p.id}" data-veld="bedrag" value="${p.bedrag}"></td>
          <td><label class="vh" for="c_${p.id}">Premiecode ${naam}</label><input id="c_${p.id}" class="invoer" data-id="${p.id}" data-veld="code" value="${esc(p.code || "")}"></td>
          <td><label class="vh" for="t_${p.id}">Geldig tot ${naam}</label><input id="t_${p.id}" class="invoer" type="date" data-id="${p.id}" data-veld="tot" value="${p.tot || ""}"></td>
          <td>${p.gewijzigd ? `${esc(p.gewijzigd.door)}, ${tijdstip(p.gewijzigd.op)}` : ""}</td>
          <td><button type="button" class="knop link" data-weg="${p.id}">Verwijderen</button></td></tr>`;
        }).join("")}
      </tbody></table>` : `<p class="zij-leeg">Nog geen premies ingevoerd.</p>`}
    </section>
    <form class="paneel" id="f_premie">
      <h2>Premie toevoegen</h2>
      ${soorten.length ? `<div class="form-grid">
        <div class="veld"><label class="veld-lbl" for="n_model">Model</label><select id="n_model" name="model" class="invoer" required>${MODELLEN.map(m => `<option>${esc(m)}</option>`).join("")}</select></div>
        <div class="veld"><label class="veld-lbl" for="n_soort">Premiesoort</label><select id="n_soort" name="soort" class="invoer" required>${soorten.map(s => `<option>${esc(s)}</option>`).join("")}</select></div>
        <div class="veld"><label class="veld-lbl" for="n_bedrag">Premie in euro</label><input id="n_bedrag" name="bedrag" class="invoer" type="number" min="0" step="50" required></div>
        <div class="veld"><label class="veld-lbl" for="n_code">Premiecode</label><input id="n_code" name="code" class="invoer" required></div>
        <div class="veld"><label class="veld-lbl" for="n_tot">Geldig tot en met</label><input id="n_tot" name="tot" class="invoer" type="date" required></div>
        <div class="veld"><span class="veld-lbl">&nbsp;</span><button class="knop donker">Toevoegen</button></div>
      </div>` : `<p class="zij-leeg">Voeg eerst hieronder een premiesoort toe.</p>`}
    </form>
    <form class="paneel" id="f_soort">
      <h2>Premiesoorten</h2>
      <p class="toelichting">De soorten waaruit je per model kiest. Een soort die nog bij een model staat, kun je niet verwijderen.</p>
      <ul class="lijstje">${soorten.map(s => {
        const n = premies.filter(p => p.soort === s).length;
        return `<li><span>${esc(s)} <span class="grijs">· ${n ? `${n} ${n === 1 ? "model" : "modellen"}` : "nog bij geen model"}</span></span>${n ? "" : `<button type="button" class="knop link" data-soortweg="${esc(s)}">Verwijderen</button>`}</li>`;
      }).join("")}</ul>
      <div class="toevoegen"><label class="vh" for="n_soortnaam">Premiesoort toevoegen</label><input id="n_soortnaam" name="soort" class="invoer" placeholder="Bijvoorbeeld: Private lease premie" required><button class="knop">Toevoegen</button></div>
    </form>`;
}

function opslaan(melding) { bewaarPremies(premies); bewaarPremiesoorten(soorten); toast(melding); teken(); }

if (ik.rol !== "manager") {
  bak.innerHTML = `<div class="melding">De premielijst wordt bijgehouden door de manager.</div>`;
} else {
  bak.addEventListener("change", e => {
    const d = e.target.dataset; if (!d.id) return;
    const p = premies.find(x => x.id === d.id);
    p[d.veld] = d.veld === "bedrag" ? Number(e.target.value) : e.target.value;
    p.gewijzigd = { door: ik.naam, op: nu() };
    opslaan(`${p.model}, ${p.soort}: ${{ bedrag: bedrag(p.bedrag), code: "premiecode " + p.code, tot: "geldig tot en met " + datumKort(p.tot) }[d.veld]}.`);
  });
  bak.addEventListener("click", e => {
    const d = e.target.dataset;
    if (d.weg) {
      const p = premies.find(x => x.id === d.weg);
      if (!confirm(`${p.soort} voor de ${p.model} verwijderen?`)) return;
      premies = premies.filter(x => x !== p);
      opslaan(`${p.soort} voor de ${p.model} verwijderd.`);
    }
    if (d.soortweg) {
      soorten = soorten.filter(s => s !== d.soortweg);
      opslaan(`Premiesoort ${d.soortweg} verwijderd.`);
    }
  });
  bak.addEventListener("submit", e => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target));
    if (e.target.id === "f_soort") {
      const s = v.soort.trim();
      if (soorten.some(x => x.toLowerCase() === s.toLowerCase())) { toast(`${s} staat al in de lijst.`); return; }
      soorten.push(s);
      opslaan(`Premiesoort ${s} toegevoegd. Je kunt hem nu bij een model zetten.`);
      return;
    }
    if (premies.some(p => p.model === v.model && p.soort === v.soort)) {
      toast(`De ${v.model} heeft al een ${v.soort.toLowerCase()}. Pas het bedrag in de tabel aan.`); return;
    }
    premies.push({ id: nieuwId(), model: v.model, soort: v.soort, bedrag: Number(v.bedrag), code: v.code.trim(), tot: v.tot, gewijzigd: { door: ik.naam, op: nu() } });
    opslaan(`${v.soort} voor de ${v.model} toegevoegd.`);
  });
  teken();
}
