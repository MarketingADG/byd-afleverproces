/* Inloggen met het offertemodule-account (verkoper_login). Na het inloggen terug naar de
   pagina waar je vandaan kwam, of naar het overzicht; de kopbalk stuurt je daarna door
   naar de startpagina van je rol. Wie geen rol in het afleverproces heeft, komt hier terug
   met een melding (zie opstarten() in sessie.js). */

const loginFout = document.getElementById("login_error");
const wwFout = document.getElementById("ww_error");
const params = new URLSearchParams(location.search);

/* alleen een pagina van deze site, nooit een ander adres */
function bestemming() {
  const t = params.get("terug") || "";
  return /^[a-z-]+\.html(\?[\w=&%.-]*)?(#[\w-]*)?$/.test(t) && !t.startsWith("login.html") ? t : "index.html";
}

if (sessieToken() && !params.get("melding")) location.replace(bestemming());
if (params.get("melding")) loginFout.textContent = params.get("melding");

let wachtwoord = "";

document.getElementById("login_form").addEventListener("submit", async e => {
  e.preventDefault();
  const knop = document.getElementById("login_btn");
  const user = document.getElementById("login_user").value.trim();
  wachtwoord = document.getElementById("login_pw").value;
  loginFout.textContent = "";
  if (!user || !wachtwoord) { loginFout.textContent = "Vul je e-mailadres en wachtwoord in."; return; }
  knop.disabled = true;
  try {
    const data = await rpc("verkoper_login", { p_username: user, p_password: wachtwoord });
    const rij = Array.isArray(data) ? data[0] : data;
    if (!rij?.token) throw new Error("E-mailadres of wachtwoord klopt niet.");
    localStorage.setItem(SESSIE_SLEUTEL, JSON.stringify({ token: rij.token, naam: rij.verkoper }));
    if (rij.moet_wachtwoord_wijzigen) {
      document.getElementById("login_form").hidden = true;
      document.getElementById("ww_form").hidden = false;
      document.getElementById("ww_nieuw").focus();
      return;
    }
    location.replace(bestemming());
  } catch (err) {
    loginFout.textContent = /fetch|network/i.test(err.message) ? "Geen verbinding. Probeer het opnieuw." : err.message;
  } finally {
    knop.disabled = false;
  }
});

document.getElementById("ww_form").addEventListener("submit", async e => {
  e.preventDefault();
  const nieuw = document.getElementById("ww_nieuw").value;
  wwFout.textContent = "";
  if (nieuw.length < 8) { wwFout.textContent = "Kies een wachtwoord van minstens 8 tekens."; return; }
  if (nieuw !== document.getElementById("ww_herhaal").value) { wwFout.textContent = "De twee wachtwoorden zijn niet gelijk."; return; }
  const knop = document.getElementById("ww_btn");
  knop.disabled = true;
  try {
    await rpc("verkoper_wachtwoord_wijzigen", { p_token: sessieToken(), p_huidig: wachtwoord, p_nieuw: nieuw });
    wachtwoord = "";
    location.replace(bestemming());
  } catch (err) {
    wwFout.textContent = err.message;
  } finally {
    knop.disabled = false;
  }
});
