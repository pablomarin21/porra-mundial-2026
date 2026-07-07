/* ============================================================================
   PORRA MUNDIAL 2026 — Motor de cálculo (puro, sin dependencias)
   - Tablas de grupos con desempates (pts > dif.goles > goles a favor)
   - 8 mejores terceros + asignación a slots del bracket (matching bipartito
     que respeta la elegibilidad oficial de cada slot)
   - Resolución de eliminatorias (real + simulada)
   - Puntuación de cada quiniela
   - Simulación Monte Carlo -> probabilidad de ganar la porra en vivo
   Funciona en navegador (window.PorraEngine) y en Node (module.exports) para tests.
   ========================================================================== */
(function (root, factory) {
  const D = (typeof window !== "undefined" && window.PORRA_DATA) ||
            (typeof require !== "undefined" && require("./data-node.js"));
  const eng = factory(D);
  if (typeof module !== "undefined" && module.exports) module.exports = eng;
  if (typeof window !== "undefined") window.PorraEngine = eng;
})(this, function (DATA) {
  "use strict";

  const ELO = DATA.ELO;
  const LETTERS = DATA.GROUP_LETTERS;
  const THIRD_SLOT_NUMS = [74, 77, 79, 80, 81, 82, 85, 87];

  // -------- SELECCIÓN DECEPCIÓN: fallo (admin) de qué favoritos "decepcionan" --------
  // Regla de la porra (jul-2026): una selección decepción SOLO puntúa si era un GRAN
  // favorito que cayó ANTES de cuartos. No es una regla por ronda (Alemania fuera en
  // 1/16 SÍ es decepción; Croacia fuera en 1/16 NO; Chequia fuera en grupos NO), sino
  // una lista curada por el admin. Cada equipo puntúa AUTOMÁTICAMENTE en cuanto queda
  // eliminado sin llegar a cuartos (p.ej. Argentina: solo si pierde su octavos).
  // Cerrado tras octavos: quien llega a cuartos ya no es decepción.
  const DECEPCION_TEAMS = ["Portugal", "Germany", "Argentina"];

  // -------- utilidades aleatorias / partidos --------
  function poisson(lambda, rng) {
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= rng(); } while (p > L);
    return k - 1;
  }

  // Marcador simulado a partir de la diferencia de Elo (modelo Poisson).
  function simGoals(home, away, rng) {
    const diff = (ELO[home] || 1500) - (ELO[away] || 1500);
    const exp = 2.6;                 // media de goles por partido (Mundial)
    const gd = diff / 170;           // ventaja esperada de goles
    const muA = Math.max(0.12, (exp + gd) / 2);
    const muB = Math.max(0.12, (exp - gd) / 2);
    return [poisson(muA, rng), poisson(muB, rng)];
  }

  // Ganador de un cruce de eliminatoria simulado (prórroga -> penaltis por Elo).
  function simKnockoutWinner(a, b, rng) {
    const g = simGoals(a, b, rng);
    if (g[0] > g[1]) return a;
    if (g[1] > g[0]) return b;
    const pa = 1 / (1 + Math.pow(10, ((ELO[b] || 1500) - (ELO[a] || 1500)) / 400));
    return rng() < pa ? a : b;
  }

  function fixturesOf(letter) {
    return DATA.GROUP_FIXTURES.filter((f) => f.group === letter);
  }

  // -------- tabla de un grupo --------
  // resultsMap: { match_code|matchNum : {home_score, away_score, winner, played} }
  // Devuelve [{team,pts,gd,gf,ga,pj}] ordenado, o null si !simulate y faltan partidos.
  function groupStandings(letter, resultsMap, simulate, rng) {
    const teams = DATA.GROUPS[letter];
    const st = {};
    teams.forEach((t) => (st[t] = { team: t, pts: 0, gd: 0, gf: 0, ga: 0, pj: 0 }));
    let played = 0;
    for (const fx of fixturesOf(letter)) {
      const r = resultsMap[fx.code];
      let hs, as;
      if (r && r.played && r.home_score != null && r.away_score != null) {
        hs = r.home_score; as = r.away_score; played++;
      } else if (simulate) {
        const g = simGoals(fx.home, fx.away, rng); hs = g[0]; as = g[1];
      } else {
        continue;
      }
      const H = st[fx.home], A = st[fx.away];
      H.pj++; A.pj++;
      H.gf += hs; H.ga += as; A.gf += as; A.ga += hs;
      H.gd = H.gf - H.ga; A.gd = A.gf - A.ga;
      if (hs > as) { H.pts += 3; }
      else if (as > hs) { A.pts += 3; }
      else { H.pts += 1; A.pts += 1; }
    }
    const arr = teams.map((t) => st[t]);
    arr.sort((x, y) => {
      if (y.pts !== x.pts) return y.pts - x.pts;
      if (y.gd !== x.gd) return y.gd - x.gd;
      if (y.gf !== x.gf) return y.gf - x.gf;
      if (simulate) return rng() - 0.5;                 // desempate aleatorio en simulación
      return (ELO[y.team] || 0) - (ELO[x.team] || 0);   // estable para tabla real
    });
    arr._complete = simulate || played === 6;
    return arr;
  }

  // Tabla OFICIAL FIFA (Annexe C, Reglamento Mundial 2026) — asignación de los 8 mejores terceros.
  // Clave = los 8 grupos con 3º clasificado (orden alfabético). Valor = grupo del 3º para los slots
  // 74,77,79,80,81,82,85,87 (en ese orden). Verificada vs FIFA PDF + Wikipedia (495/495, 0 auto-cruces).
  const THIRD_TABLE = {
    ABCDEFGH:"CFHEBAGD",ABCDEFGI:"DFCIBAGE",ABCDEFGJ:"DFCJBAGE",ABCDEFGK:"DFCKBAGE",ABCDEFGL:"DFCEBAGL",ABCDEFHI:"CFHIBAED",
    ABCDEFHJ:"CFHEBAJD",ABCDEFHK:"CFHKBAED",ABCDEFHL:"CDHEBAFL",ABCDEFIJ:"DFCIBAJE",ABCDEFIK:"DFCKBAEI",ABCDEFIL:"DFCIBAEL",
    ABCDEFJK:"DFCKBAJE",ABCDEFJL:"DFCEBAJL",ABCDEFKL:"DFCKBAEL",ABCDEGHI:"CDHIBAGE",ABCDEGHJ:"CDHJBAGE",ABCDEGHK:"CDHKBAGE",
    ABCDEGHL:"CDHEBAGL",ABCDEGIJ:"CDEJBAGI",ABCDEGIK:"CDEKBAGI",ABCDEGIL:"CDEIBAGL",ABCDEGJK:"CDEKBAGJ",ABCDEGJL:"CDEJBAGL",
    ABCDEGKL:"CDEKBAGL",ABCDEHIJ:"CDHIBAJE",ABCDEHIK:"CDHKBAEI",ABCDEHIL:"CDHIBAEL",ABCDEHJK:"CDHKBAJE",ABCDEHJL:"CDHEBAJL",
    ABCDEHKL:"CDHKBAEL",ABCDEIJK:"CDEKBAJI",ABCDEIJL:"CDEIBAJL",ABCDEIKL:"CDEKBAIL",ABCDEJKL:"CDEKBAJL",ABCDFGHI:"CFHIBAGD",
    ABCDFGHJ:"CFHJBAGD",ABCDFGHK:"CFHKBAGD",ABCDFGHL:"DFCHBAGL",ABCDFGIJ:"DFCJBAGI",ABCDFGIK:"DFCKBAGI",ABCDFGIL:"DFCIBAGL",
    ABCDFGJK:"DFCKBAGJ",ABCDFGJL:"DFCJBAGL",ABCDFGKL:"DFCKBAGL",ABCDFHIJ:"CFHIBAJD",ABCDFHIK:"CDHKBAFI",ABCDFHIL:"CDHIBAFL",
    ABCDFHJK:"CFHKBAJD",ABCDFHJL:"DFCHBAJL",ABCDFHKL:"CDHKBAFL",ABCDFIJK:"DFCKBAJI",ABCDFIJL:"DFCIBAJL",ABCDFIKL:"DFCKBAIL",
    ABCDFJKL:"DFCKBAJL",ABCDGHIJ:"CDHJBAGI",ABCDGHIK:"CDHKBAGI",ABCDGHIL:"CDHIBAGL",ABCDGHJK:"CDHKBAGJ",ABCDGHJL:"CDHJBAGL",
    ABCDGHKL:"CDHKBAGL",ABCDGIJK:"DGCKBAJI",ABCDGIJL:"DGCIBAJL",ABCDGIKL:"CDIKBAGL",ABCDGJKL:"DGCKBAJL",ABCDHIJK:"CDHKBAJI",
    ABCDHIJL:"CDHIBAJL",ABCDHIKL:"CDHKBAIL",ABCDHJKL:"CDHKBAJL",ABCDIJKL:"CDIKBAJL",ABCEFGHI:"CFHIBAGE",ABCEFGHJ:"CFHJBAGE",
    ABCEFGHK:"CFHKBAGE",ABCEFGHL:"CFHEBAGL",ABCEFGIJ:"CFEJBAGI",ABCEFGIK:"CFEKBAGI",ABCEFGIL:"CFEIBAGL",ABCEFGJK:"CFEKBAGJ",
    ABCEFGJL:"CFEJBAGL",ABCEFGKL:"CFEKBAGL",ABCEFHIJ:"CFHIBAJE",ABCEFHIK:"CFHKBAEI",ABCEFHIL:"CFHIBAEL",ABCEFHJK:"CFHKBAJE",
    ABCEFHJL:"CFHEBAJL",ABCEFHKL:"CFHKBAEL",ABCEFIJK:"CFEKBAJI",ABCEFIJL:"CFEIBAJL",ABCEFIKL:"CFEKBAIL",ABCEFJKL:"CFEKBAJL",
    ABCEGHIJ:"CGHIBAJE",ABCEGHIK:"CHEKBAGI",ABCEGHIL:"CHEIBAGL",ABCEGHJK:"CGHKBAJE",ABCEGHJL:"CGHEBAJL",ABCEGHKL:"CHEKBAGL",
    ABCEGIJK:"CGEKBAJI",ABCEGIJL:"CGEIBAJL",ABCEGIKL:"ACEKBIGL",ABCEGJKL:"CGEKBAJL",ABCEHIJK:"CHEKBAJI",ABCEHIJL:"CHEIBAJL",
    ABCEHIKL:"CHEKBAIL",ABCEHJKL:"CHEKBAJL",ABCEIJKL:"ACEKBIJL",ABCFGHIJ:"CFHJBAGI",ABCFGHIK:"CFHKBAGI",ABCFGHIL:"CFHIBAGL",
    ABCFGHJK:"CFHKBAGJ",ABCFGHJL:"CFHJBAGL",ABCFGHKL:"CFHKBAGL",ABCFGIJK:"FGCKBAJI",ABCFGIJL:"FGCIBAJL",ABCFGIKL:"CFIKBAGL",
    ABCFGJKL:"FGCKBAJL",ABCFHIJK:"CFHKBAJI",ABCFHIJL:"CFHIBAJL",ABCFHIKL:"CFHKBAIL",ABCFHJKL:"CFHKBAJL",ABCFIJKL:"CFIKBAJL",
    ABCGHIJK:"CGHKBAJI",ABCGHIJL:"CGHIBAJL",ABCGHIKL:"CHIKBAGL",ABCGHJKL:"CGHKBAJL",ABCGIJKL:"CGIKBAJL",ABCHIJKL:"CHIKBAJL",
    ABDEFGHI:"DFHIBAGE",ABDEFGHJ:"DFHJBAGE",ABDEFGHK:"DFHKBAGE",ABDEFGHL:"DFHEBAGL",ABDEFGIJ:"DFEJBAGI",ABDEFGIK:"DFEKBAGI",
    ABDEFGIL:"DFEIBAGL",ABDEFGJK:"DFEKBAGJ",ABDEFGJL:"DFEJBAGL",ABDEFGKL:"DFEKBAGL",ABDEFHIJ:"DFHIBAJE",ABDEFHIK:"DFHKBAEI",
    ABDEFHIL:"DFHIBAEL",ABDEFHJK:"DFHKBAJE",ABDEFHJL:"DFHEBAJL",ABDEFHKL:"DFHKBAEL",ABDEFIJK:"DFEKBAJI",ABDEFIJL:"DFEIBAJL",
    ABDEFIKL:"DFEKBAIL",ABDEFJKL:"DFEKBAJL",ABDEGHIJ:"DGHIBAJE",ABDEGHIK:"DHEKBAGI",ABDEGHIL:"DHEIBAGL",ABDEGHJK:"DGHKBAJE",
    ABDEGHJL:"DGHEBAJL",ABDEGHKL:"DHEKBAGL",ABDEGIJK:"DGEKBAJI",ABDEGIJL:"DGEIBAJL",ABDEGIKL:"ADEKBIGL",ABDEGJKL:"DGEKBAJL",
    ABDEHIJK:"DHEKBAJI",ABDEHIJL:"DHEIBAJL",ABDEHIKL:"DHEKBAIL",ABDEHJKL:"DHEKBAJL",ABDEIJKL:"ADEKBIJL",ABDFGHIJ:"DFHJBAGI",
    ABDFGHIK:"DFHKBAGI",ABDFGHIL:"DFHIBAGL",ABDFGHJK:"DFHKBAGJ",ABDFGHJL:"DFHJBAGL",ABDFGHKL:"DFHKBAGL",ABDFGIJK:"DGFKBAJI",
    ABDFGIJL:"DGFIBAJL",ABDFGIKL:"DFIKBAGL",ABDFGJKL:"DGFKBAJL",ABDFHIJK:"DFHKBAJI",ABDFHIJL:"DFHIBAJL",ABDFHIKL:"DFHKBAIL",
    ABDFHJKL:"DFHKBAJL",ABDFIJKL:"DFIKBAJL",ABDGHIJK:"DGHKBAJI",ABDGHIJL:"DGHIBAJL",ABDGHIKL:"DHIKBAGL",ABDGHJKL:"DGHKBAJL",
    ABDGIJKL:"DGIKBAJL",ABDHIJKL:"DHIKBAJL",ABEFGHIJ:"FGHIBAJE",ABEFGHIK:"FHEKBAGI",ABEFGHIL:"FHEIBAGL",ABEFGHJK:"FGHKBAJE",
    ABEFGHJL:"FGHEBAJL",ABEFGHKL:"FHEKBAGL",ABEFGIJK:"FGEKBAJI",ABEFGIJL:"FGEIBAJL",ABEFGIKL:"AFEKBIGL",ABEFGJKL:"FGEKBAJL",
    ABEFHIJK:"FHEKBAJI",ABEFHIJL:"FHEIBAJL",ABEFHIKL:"FHEKBAIL",ABEFHJKL:"FHEKBAJL",ABEFIJKL:"AFEKBIJL",ABEGHIJK:"AGEKBHJI",
    ABEGHIJL:"AGEIBHJL",ABEGHIKL:"AHEKBIGL",ABEGHJKL:"AGEKBHJL",ABEGIJKL:"AGEKBIJL",ABEHIJKL:"AHEKBIJL",ABFGHIJK:"FGHKBAJI",
    ABFGHIJL:"FGHIBAJL",ABFGHIKL:"AFHKBIGL",ABFGHJKL:"FGHKBAJL",ABFGIJKL:"FGIKBAJL",ABFHIJKL:"AFHKBIJL",ABGHIJKL:"AGHKBIJL",
    ACDEFGHI:"CFHIEAGD",ACDEFGHJ:"CFHEJAGD",ACDEFGHK:"CFHKEAGD",ACDEFGHL:"CDHEFAGL",ACDEFGIJ:"DFCIJAGE",ACDEFGIK:"DFCKEAGI",
    ACDEFGIL:"DFCIEAGL",ACDEFGJK:"DFCKJAGE",ACDEFGJL:"DFCEJAGL",ACDEFGKL:"DFCKEAGL",ACDEFHIJ:"CFHIEAJD",ACDEFHIK:"CDHKFAEI",
    ACDEFHIL:"CDHIFAEL",ACDEFHJK:"CFHKEAJD",ACDEFHJL:"CDHEFAJL",ACDEFHKL:"CDHKFAEL",ACDEFIJK:"DFCKEAJI",ACDEFIJL:"DFCIEAJL",
    ACDEFIKL:"DFCKIAEL",ACDEFJKL:"DFCKEAJL",ACDEGHIJ:"CDHIJAGE",ACDEGHIK:"CDHKEAGI",ACDEGHIL:"CDHIEAGL",ACDEGHJK:"CDHKJAGE",
    ACDEGHJL:"CDHEJAGL",ACDEGHKL:"CDHKEAGL",ACDEGIJK:"CDEKJAGI",ACDEGIJL:"CDEIJAGL",ACDEGIKL:"CDEKIAGL",ACDEGJKL:"CDEKJAGL",
    ACDEHIJK:"CDHKEAJI",ACDEHIJL:"CDHIEAJL",ACDEHIKL:"CDHKIAEL",ACDEHJKL:"CDHKEAJL",ACDEIJKL:"CDEKIAJL",ACDFGHIJ:"CFHIJAGD",
    ACDFGHIK:"CDHKFAGI",ACDFGHIL:"CDHIFAGL",ACDFGHJK:"CFHKJAGD",ACDFGHJL:"DFCHJAGL",ACDFGHKL:"CDHKFAGL",ACDFGIJK:"DFCKJAGI",
    ACDFGIJL:"DFCIJAGL",ACDFGIKL:"DFCKIAGL",ACDFGJKL:"DFCKJAGL",ACDFHIJK:"CDHKFAJI",ACDFHIJL:"CDHIFAJL",ACDFHIKL:"CDHKIAFL",
    ACDFHJKL:"CDHKFAJL",ACDFIJKL:"DFCKIAJL",ACDGHIJK:"CDHKJAGI",ACDGHIJL:"CDHIJAGL",ACDGHIKL:"CDHKIAGL",ACDGHJKL:"CDHKJAGL",
    ACDGIJKL:"CDIKJAGL",ACDHIJKL:"CDHKIAJL",ACEFGHIJ:"CFHIJAGE",ACEFGHIK:"CFHKEAGI",ACEFGHIL:"CFHIEAGL",ACEFGHJK:"CFHKJAGE",
    ACEFGHJL:"CFHEJAGL",ACEFGHKL:"CFHKEAGL",ACEFGIJK:"CFEKJAGI",ACEFGIJL:"CFEIJAGL",ACEFGIKL:"CFEKIAGL",ACEFGJKL:"CFEKJAGL",
    ACEFHIJK:"CFHKEAJI",ACEFHIJL:"CFHIEAJL",ACEFHIKL:"CFHKIAEL",ACEFHJKL:"CFHKEAJL",ACEFIJKL:"CFEKIAJL",ACEGHIJK:"CHEKJAGI",
    ACEGHIJL:"CHEIJAGL",ACEGHIKL:"CHEKIAGL",ACEGHJKL:"CHEKJAGL",ACEGIJKL:"CGEKIAJL",ACEHIJKL:"CHEKIAJL",ACFGHIJK:"CFHKJAGI",
    ACFGHIJL:"CFHIJAGL",ACFGHIKL:"CFHKIAGL",ACFGHJKL:"CFHKJAGL",ACFGIJKL:"CFIKJAGL",ACFHIJKL:"CFHKIAJL",ACGHIJKL:"CGHKIAJL",
    ADEFGHIJ:"DFHIJAGE",ADEFGHIK:"DFHKEAGI",ADEFGHIL:"DFHIEAGL",ADEFGHJK:"DFHKJAGE",ADEFGHJL:"DFHEJAGL",ADEFGHKL:"DFHKEAGL",
    ADEFGIJK:"DFEKJAGI",ADEFGIJL:"DFEIJAGL",ADEFGIKL:"DFEKIAGL",ADEFGJKL:"DFEKJAGL",ADEFHIJK:"DFHKEAJI",ADEFHIJL:"DFHIEAJL",
    ADEFHIKL:"DFHKIAEL",ADEFHJKL:"DFHKEAJL",ADEFIJKL:"DFEKIAJL",ADEGHIJK:"DHEKJAGI",ADEGHIJL:"DHEIJAGL",ADEGHIKL:"DHEKIAGL",
    ADEGHJKL:"DHEKJAGL",ADEGIJKL:"DGEKIAJL",ADEHIJKL:"DHEKIAJL",ADFGHIJK:"DFHKJAGI",ADFGHIJL:"DFHIJAGL",ADFGHIKL:"DFHKIAGL",
    ADFGHJKL:"DFHKJAGL",ADFGIJKL:"DFIKJAGL",ADFHIJKL:"DFHKIAJL",ADGHIJKL:"DGHKIAJL",AEFGHIJK:"FHEKJAGI",AEFGHIJL:"FHEIJAGL",
    AEFGHIKL:"FHEKIAGL",AEFGHJKL:"FHEKJAGL",AEFGIJKL:"FGEKIAJL",AEFHIJKL:"FHEKIAJL",AEGHIJKL:"AGEKIHJL",AFGHIJKL:"FGHKIAJL",
    BCDEFGHI:"DFCIBHGE",BCDEFGHJ:"CFHEBJGD",BCDEFGHK:"DFCKBHGE",BCDEFGHL:"DFCEBHGL",BCDEFGIJ:"DFCIBJGE",BCDEFGIK:"DFCKBEGI",
    BCDEFGIL:"DFCIBEGL",BCDEFGJK:"DFCKBJGE",BCDEFGJL:"DFCEBJGL",BCDEFGKL:"DFCKBEGL",BCDEFHIJ:"DFCIBHJE",BCDEFHIK:"DFCKBHEI",
    BCDEFHIL:"DFCIBHEL",BCDEFHJK:"DFCKBHJE",BCDEFHJL:"DFCEBHJL",BCDEFHKL:"DFCKBHEL",BCDEFIJK:"DFCKBEJI",BCDEFIJL:"DFCIBEJL",
    BCDEFIKL:"DFCKBIEL",BCDEFJKL:"DFCKBEJL",BCDEGHIJ:"CDHIBJGE",BCDEGHIK:"CDEKBHGI",BCDEGHIL:"CDEIBHGL",BCDEGHJK:"CDHKBJGE",
    BCDEGHJL:"CDHEBJGL",BCDEGHKL:"CDEKBHGL",BCDEGIJK:"CDEKBJGI",BCDEGIJL:"CDEIBJGL",BCDEGIKL:"CDEKBIGL",BCDEGJKL:"CDEKBJGL",
    BCDEHIJK:"CDEKBHJI",BCDEHIJL:"CDEIBHJL",BCDEHIKL:"CDEKBHIL",BCDEHJKL:"CDEKBHJL",BCDEIJKL:"CDEKBIJL",BCDFGHIJ:"CFHIBJGD",
    BCDFGHIK:"DFCKBHGI",BCDFGHIL:"DFCIBHGL",BCDFGHJK:"CFHKBJGD",BCDFGHJL:"DFCJBHGL",BCDFGHKL:"DFCKBHGL",BCDFGIJK:"DFCKBJGI",
    BCDFGIJL:"DFCIBJGL",BCDFGIKL:"DFCKBIGL",BCDFGJKL:"DFCKBJGL",BCDFHIJK:"DFCKBHJI",BCDFHIJL:"DFCIBHJL",BCDFHIKL:"DFCKBHIL",
    BCDFHJKL:"DFCKBHJL",BCDFIJKL:"DFCKBIJL",BCDGHIJK:"CDHKBJGI",BCDGHIJL:"CDHIBJGL",BCDGHIKL:"CDHKBIGL",BCDGHJKL:"CDHKBJGL",
    BCDGIJKL:"CDIKBJGL",BCDHIJKL:"CDHKBIJL",BCEFGHIJ:"CFHIBJGE",BCEFGHIK:"CFEKBHGI",BCEFGHIL:"CFEIBHGL",BCEFGHJK:"CFHKBJGE",
    BCEFGHJL:"CFHEBJGL",BCEFGHKL:"CFEKBHGL",BCEFGIJK:"CFEKBJGI",BCEFGIJL:"CFEIBJGL",BCEFGIKL:"CFEKBIGL",BCEFGJKL:"CFEKBJGL",
    BCEFHIJK:"CFEKBHJI",BCEFHIJL:"CFEIBHJL",BCEFHIKL:"CFEKBHIL",BCEFHJKL:"CFEKBHJL",BCEFIJKL:"CFEKBIJL",BCEGHIJK:"CGEKBHJI",
    BCEGHIJL:"CGEIBHJL",BCEGHIKL:"CHEKBIGL",BCEGHJKL:"CGEKBHJL",BCEGIJKL:"CGEKBIJL",BCEHIJKL:"CHEKBIJL",BCFGHIJK:"CFHKBJGI",
    BCFGHIJL:"CFHIBJGL",BCFGHIKL:"CFHKBIGL",BCFGHJKL:"CFHKBJGL",BCFGIJKL:"CFIKBJGL",BCFHIJKL:"CFHKBIJL",BCGHIJKL:"CGHKBIJL",
    BDEFGHIJ:"DFHIBJGE",BDEFGHIK:"DFEKBHGI",BDEFGHIL:"DFEIBHGL",BDEFGHJK:"DFHKBJGE",BDEFGHJL:"DFHEBJGL",BDEFGHKL:"DFEKBHGL",
    BDEFGIJK:"DFEKBJGI",BDEFGIJL:"DFEIBJGL",BDEFGIKL:"DFEKBIGL",BDEFGJKL:"DFEKBJGL",BDEFHIJK:"DFEKBHJI",BDEFHIJL:"DFEIBHJL",
    BDEFHIKL:"DFEKBHIL",BDEFHJKL:"DFEKBHJL",BDEFIJKL:"DFEKBIJL",BDEGHIJK:"DGEKBHJI",BDEGHIJL:"DGEIBHJL",BDEGHIKL:"DHEKBIGL",
    BDEGHJKL:"DGEKBHJL",BDEGIJKL:"DGEKBIJL",BDEHIJKL:"DHEKBIJL",BDFGHIJK:"DFHKBJGI",BDFGHIJL:"DFHIBJGL",BDFGHIKL:"DFHKBIGL",
    BDFGHJKL:"DFHKBJGL",BDFGIJKL:"DFIKBJGL",BDFHIJKL:"DFHKBIJL",BDGHIJKL:"DGHKBIJL",BEFGHIJK:"FGEKBHJI",BEFGHIJL:"FGEIBHJL",
    BEFGHIKL:"FHEKBIGL",BEFGHJKL:"FGEKBHJL",BEFGIJKL:"FGEKBIJL",BEFHIJKL:"FHEKBIJL",BEGHIJKL:"BGEKIHJL",BFGHIJKL:"FGHKBIJL",
    CDEFGHIJ:"DFCIJHGE",CDEFGHIK:"DFCKEHGI",CDEFGHIL:"DFCIEHGL",CDEFGHJK:"DFCKJHGE",CDEFGHJL:"DFCEJHGL",CDEFGHKL:"DFCKEHGL",
    CDEFGIJK:"DFCKEJGI",CDEFGIJL:"DFCIEJGL",CDEFGIKL:"DFCKEIGL",CDEFGJKL:"DFCKEJGL",CDEFHIJK:"DFCKEHJI",CDEFHIJL:"DFCIEHJL",
    CDEFHIKL:"DFCKIHEL",CDEFHJKL:"DFCKEHJL",CDEFIJKL:"DFCKEIJL",CDEGHIJK:"CDEKJHGI",CDEGHIJL:"CDEIJHGL",CDEGHIKL:"CDEKIHGL",
    CDEGHJKL:"CDEKJHGL",CDEGIJKL:"CDEKIJGL",CDEHIJKL:"CDEKIHJL",CDFGHIJK:"DFCKJHGI",CDFGHIJL:"DFCIJHGL",CDFGHIKL:"DFCKIHGL",
    CDFGHJKL:"DFCKJHGL",CDFGIJKL:"DFCKIJGL",CDFHIJKL:"DFCKIHJL",CDGHIJKL:"CDHKIJGL",CEFGHIJK:"CFEKJHGI",CEFGHIJL:"CFEIJHGL",
    CEFGHIKL:"CFEKIHGL",CEFGHJKL:"CFEKJHGL",CEFGIJKL:"CFEKIJGL",CEFHIJKL:"CFEKIHJL",CEGHIJKL:"CGEKIHJL",CFGHIJKL:"CFHKIJGL",
    DEFGHIJK:"DFEKJHGI",DEFGHIJL:"DFEIJHGL",DEFGHIKL:"DFEKIHGL",DEFGHJKL:"DFEKJHGL",DEFGIJKL:"DFEKIJGL",DEFHIJKL:"DFEKIHJL",
    DEGHIJKL:"DGEKIHJL",DFGHIJKL:"DFHKIJGL",EFGHIJKL:"FGEKIHJL"
  };

  // -------- matching de terceros a slots del bracket --------
  // qualGroups: array de 8 letras (grupos cuyo 3º clasifica). -> {matchNum: letra}
  function thirdMatching(qualGroups) {
    const slots = THIRD_SLOT_NUMS;
    // 1) TABLA OFICIAL FIFA (Annexe C): asignación exacta cuando los 8 terceros están decididos.
    if (qualGroups && qualGroups.length === 8) {
      const row = THIRD_TABLE[qualGroups.slice().sort().join("")];
      if (row) { const res = {}; for (let i = 0; i < slots.length; i++) res[slots[i]] = row[i]; return res; }
    }
    // 2) Fallback (datos incompletos / vista previa): emparejamiento por elegibilidad.
    const elig = slots.map((s) => DATA.THIRD_SLOTS[s].filter((g) => qualGroups.includes(g)));
    const slotToGroup = {};   // índice de slot -> letra
    const groupToSlot = {};   // letra -> índice de slot
    function aug(si, visited) {
      for (const g of elig[si]) {
        if (visited.has(g)) continue;
        visited.add(g);
        if (groupToSlot[g] === undefined || aug(groupToSlot[g], visited)) {
          groupToSlot[g] = si; slotToGroup[si] = g; return true;
        }
      }
      return false;
    }
    let ok = true;
    for (let si = 0; si < slots.length; si++) if (!aug(si, new Set())) ok = false;
    const res = {};
    for (let si = 0; si < slots.length; si++) res[slots[si]] = slotToGroup[si] || null;
    if (!ok) { // red de seguridad: nunca dejar un slot sin equipo
      const used = new Set(Object.values(res).filter(Boolean));
      const left = qualGroups.filter((g) => !used.has(g));
      let li = 0;
      for (let si = 0; si < slots.length; si++) if (!res[slots[si]]) res[slots[si]] = left[li++];
    }
    return res;
  }

  // Resuelve un código de slot ("W-A","RU-B","3rd") a un equipo concreto.
  function resolveSlot(matchNum, code, q, thirdAssign) {
    if (code === "3rd") { const g = thirdAssign[matchNum]; return g ? q.thirdByGroup[g] : null; }
    const i = code.indexOf("-");
    const type = code.slice(0, i), grp = code.slice(i + 1);
    if (type === "W") return q.winners[grp];
    if (type === "RU") return q.runnersUp[grp];
    return null;
  }

  // Construye los 16 cruces de 1/16 (matchNum -> {a,b}) a partir de los clasificados.
  function buildR32Teams(q) {
    const thirdAssign = thirdMatching(q.qualifiedThirdGroups);
    const res = {};
    for (const m of DATA.R32) {
      res[m.match] = {
        a: resolveSlot(m.match, m.a, q, thirdAssign),
        b: resolveSlot(m.match, m.b, q, thirdAssign),
      };
    }
    return { teams: res, thirdAssign };
  }

  // qualifiers a partir de las tablas de los 12 grupos
  function computeQualifiers(standingsByGroup) {
    const winners = {}, runnersUp = {}, thirdByGroup = {};
    const thirds = [];
    for (const L of LETTERS) {
      const s = standingsByGroup[L];
      winners[L] = s[0].team; runnersUp[L] = s[1].team; thirdByGroup[L] = s[2].team;
      thirds.push({ group: L, team: s[2].team, pts: s[2].pts, gd: s[2].gd, gf: s[2].gf });
    }
    thirds.sort((x, y) => (y.pts - x.pts) || (y.gd - x.gd) || (y.gf - x.gf) ||
                          ((ELO[y.team] || 0) - (ELO[x.team] || 0)));
    const qualifiedThirdGroups = thirds.slice(0, 8).map((t) => t.group);
    const qualifiedThirdTeams = thirds.slice(0, 8).map((t) => t.team);
    return { winners, runnersUp, thirdByGroup, qualifiedThirdGroups, qualifiedThirdTeams, thirdsRanked: thirds };
  }

  // -------- outcome completo (simulado) --------
  function simulateOutcome(resultsMap, rng) {
    const standingsByGroup = {}, groupOrder = {};
    for (const L of LETTERS) {
      const s = groupStandings(L, resultsMap, true, rng);
      standingsByGroup[L] = s;
      groupOrder[L] = s.map((x) => x.team);
    }
    const q = computeQualifiers(standingsByGroup);
    const built = buildR32Teams(q);
    const teamsByMatch = {}, winnerOf = {};
    function decide(matchNum, a, b) {
      if (!a || !b) return null;
      const r = resultsMap[matchNum] || resultsMap[String(matchNum)];
      if (r && r.played && r.winner) return r.winner;
      return simKnockoutWinner(a, b, rng);
    }
    for (const m of DATA.R32) { teamsByMatch[m.match] = built.teams[m.match]; winnerOf[m.match] = decide(m.match, built.teams[m.match].a, built.teams[m.match].b); }
    function round(list) {
      for (const m of list) {
        const a = winnerOf[m.a], b = winnerOf[m.b];
        teamsByMatch[m.match] = { a, b };
        winnerOf[m.match] = decide(m.match, a, b);
      }
    }
    round(DATA.R16); round(DATA.QF); round(DATA.SF);
    { const m = DATA.FINAL; const a = winnerOf[m.a], b = winnerOf[m.b]; teamsByMatch[m.match] = { a, b }; winnerOf[m.match] = decide(m.match, a, b); }

    const r32set = new Set();
    for (const m of DATA.R32) { r32set.add(built.teams[m.match].a); r32set.add(built.teams[m.match].b); }
    const octavos = new Set(DATA.R32.map((m) => winnerOf[m.match]).filter(Boolean));
    const cuartos = new Set(DATA.R16.map((m) => winnerOf[m.match]).filter(Boolean));
    const semis = new Set(DATA.QF.map((m) => winnerOf[m.match]).filter(Boolean));
    const finalists = new Set(DATA.SF.map((m) => winnerOf[m.match]).filter(Boolean));
    const champion = winnerOf[DATA.FINAL.match];

    return {
      complete: true, allGroupsComplete: true, groupOrder,
      qualifiedThirdTeams: new Set(q.qualifiedThirdTeams),
      reached: { r32: r32set, octavos, cuartos, semis, final: finalists, champion },
      qualifiers: q, teamsByMatch, winnerOf,
    };
  }

  // -------- outcome real (parcial, sin simular) para la clasificación en vivo --------
  // Bandas de empate de una tabla: posiciones DECIDIDAS por resultados reales (pts/dg/gf).
  // Equipos empatados a pts/dg/gf (p.ej. los que aún no han jugado) comparten banda → su
  // posición exacta NO está decidida y no debe puntuar hasta que un resultado los separe.
  function rankBands(s) {
    const key = (t) => t.pts + "|" + t.gd + "|" + t.gf;
    const info = new Array(s.length); let i = 0;
    while (i < s.length) {
      let j = i; while (j + 1 < s.length && key(s[j + 1]) === key(s[i])) j++;
      for (let k = i; k <= j; k++) info[k] = { firm: i === j, worstRank: j };
      i = j + 1;
    }
    return info;
  }
  // -------- jornadas COMPLETAS de un grupo (justicia: "partidos en mano") --------
  // Una jornada cuenta para puntuar SOLO cuando los 4 equipos la han jugado (mismo nº de
  // partidos = comparación justa). Así no se paga "1º" a un equipo cuyos rivales aún no han
  // jugado. Devuelve { K = jornadas consecutivas completas desde la 1, sub = sus resultados }.
  function completedMatchdays(letter, resultsMap) {
    const fx = fixturesOf(letter);
    const byMd = {};
    fx.forEach((f) => { (byMd[f.md] || (byMd[f.md] = [])).push(f); });
    let K = 0;
    for (let m = 1; m <= 3; m++) {
      const games = byMd[m] || [];
      const done = games.length > 0 && games.every((f) => { const r = resultsMap[f.code]; return r && r.played && r.home_score != null && r.away_score != null; });
      if (done) K = m; else break;
    }
    if (K === 0) return { K: 0, sub: null };
    const sub = {};
    fx.forEach((f) => { if (f.md <= K) { const r = resultsMap[f.code]; if (r) sub[f.code] = r; } });
    return { K, sub };
  }
  function liveOutcome(resultsMap) {
    const groupOrder = {}, groupRank = {}, groupScored = {}; let allComplete = true;
    const standingsByGroup = {};
    for (const L of LETTERS) {
      const s = groupStandings(L, resultsMap, false, null);
      standingsByGroup[L] = s;                       // tabla REAL (para mostrar)
      if (s._complete) {
        // Grupo terminado: el orden es definitivo (todas las posiciones cuentan).
        groupOrder[L] = s.map((x) => x.team);
        groupRank[L] = s.map((x, i) => ({ firm: true, worstRank: i }));
        groupScored[L] = 3;
      } else {
        allComplete = false;
        // EN DIRECTO con JUSTICIA MÁXIMA: el orden solo puntúa por JORNADAS COMPLETAS (todos
        // los equipos han jugado lo mismo) — evita el sesgo de partidos en mano. Dentro de esas
        // jornadas, rankBands marca empatados como "no decididos" (no puntúan hasta separarse).
        const cm = completedMatchdays(L, resultsMap);
        groupScored[L] = cm.K;
        if (cm.K >= 1) {
          const ss = groupStandings(L, cm.sub, false, null);   // tabla de las jornadas completas
          groupOrder[L] = ss.map((x) => x.team);
          groupRank[L] = rankBands(ss);
        }
      }
    }
    // TERCEROS EN DIRECTO: en cuanto TODOS los grupos llevan ≥2 jornadas completas, se evalúan los
    // 8 mejores terceros de forma PROVISIONAL (con la tabla de ahora). Firmes al cerrarse todos.
    let qualifiedThirdTeams = null;
    const enoughForThirds = LETTERS.every((L) => (groupScored[L] || 0) >= 2);
    if (allComplete || enoughForThirds) qualifiedThirdTeams = new Set(computeQualifiers(standingsByGroup).qualifiedThirdTeams);

    // reached: directamente de los ganadores registrados en eliminatorias
    const wOf = (n) => { const r = resultsMap[n] || resultsMap[String(n)]; return r && r.played && r.winner ? r.winner : null; };
    const octavos = new Set(DATA.R32.map((m) => wOf(m.match)).filter(Boolean));
    const cuartos = new Set(DATA.R16.map((m) => wOf(m.match)).filter(Boolean));
    const semis = new Set(DATA.QF.map((m) => wOf(m.match)).filter(Boolean));
    const finalists = new Set(DATA.SF.map((m) => wOf(m.match)).filter(Boolean));
    const champion = wOf(DATA.FINAL.match);

    return {
      complete: false, allGroupsComplete: allComplete, groupOrder, groupRank, groupScored, standingsByGroup,
      qualifiedThirdTeams, qualifiedThirdsFirm: allComplete,
      reached: { octavos, cuartos, semis, final: finalists, champion },
    };
  }

  // -------- derivar de una quiniela los conjuntos "llega a la ronda X" --------
  // picks = { groups:{L:[4]}, thirds:[...], bracket:{matchNum: team} }
  function bracketSets(b) {
    b = b || {};
    const win = (nums) => nums.map((n) => b[n] || b[String(n)]).filter(Boolean);
    return {
      octavos: new Set(win(DATA.R32.map((m) => m.match))),
      cuartos: new Set(win(DATA.R16.map((m) => m.match))),
      semis: new Set(win(DATA.QF.map((m) => m.match))),
      final: new Set(win(DATA.SF.map((m) => m.match))),
      champion: b[DATA.FINAL.match] || b[String(DATA.FINAL.match)] || null,
    };
  }
  function derivePicks(picks) {
    const s = bracketSets(picks.bracket);
    return {
      groups: picks.groups || {},
      thirds: picks.thirds || [],
      octavos: s.octavos, cuartos: s.cuartos, semis: s.semis, final: s.final, champion: s.champion,
      b2: bracketSets(picks.bracket2),   // segundo cuadro (BONUS post-grupos)
    };
  }
  // Puntos BONUS del 2º cuadro: mismo modelo (lo lejos que llega tu equipo), la mitad.
  var BONUS2 = { octavos: 2, cuartos: 4, semis: 5, final: 8, champion: 13 };
  function scoreBonus(P, oc) {
    if (!P || !P.b2 || !oc || !oc.reached) return 0;
    let n = 0;
    const stages = [["octavos", BONUS2.octavos], ["cuartos", BONUS2.cuartos], ["semis", BONUS2.semis], ["final", BONUS2.final]];
    for (const [stage, pts] of stages) { const a = oc.reached[stage], p = P.b2[stage]; if (a && p) p.forEach((t) => { if (a.has(t)) n += pts; }); }
    if (oc.reached.champion && P.b2.champion && P.b2.champion === oc.reached.champion) n += BONUS2.champion;
    return n;
  }

  // -------- puntuación de una quiniela frente a un outcome --------
  function scoreEntry(P, oc, S) {
    let total = 0;
    for (const L of LETTERS) {
      const act = oc.groupOrder[L];
      const pred = P.groups[L];
      if (!act || !pred) continue;
      const ri = oc.groupRank && oc.groupRank[L];
      const firm = (i) => !ri || (ri[i] && ri[i].firm);                                   // posición decidida por resultados
      const defTop2 = (team) => { const idx = act.indexOf(team); return idx < 0 ? false : (ri ? !!(ri[idx] && ri[idx].worstRank <= 1) : idx <= 1); };
      if (pred[0] && pred[0] === act[0] && firm(0)) total += S.g1;
      if (pred[1] && pred[1] === act[1] && firm(1)) total += S.g2;
      if (pred[2] && pred[2] === act[2] && firm(2)) total += S.g3;
      if (pred[3] && pred[3] === act[3] && firm(3)) total += (S.g4 || 0);   // acertar el 4º / último del grupo
      if (pred[0] && defTop2(pred[0])) total += S.qual;
      if (pred[1] && defTop2(pred[1])) total += S.qual;
    }
    if (oc.qualifiedThirdTeams) {
      for (const t of P.thirds) if (oc.qualifiedThirdTeams.has(t)) total += S.thirdQual;
    }
    const stages = [["octavos", S.octavos], ["cuartos", S.cuartos], ["semis", S.semis], ["final", S.finalists]];
    for (const [stage, pts] of stages) {
      const actSet = oc.reached[stage]; const predSet = P[stage];
      if (!actSet || !predSet) continue;
      predSet.forEach((t) => { if (actSet.has(t)) total += pts; });
    }
    if (oc.reached.champion && P.champion && P.champion === oc.reached.champion) total += S.champion;
    total += scoreBonus(P, oc);   // BONUS 2º cuadro (cuenta para el total)
    return total;
  }

  // -------- desglose de puntos por categoría (para mostrar en la app) --------
  function scoreBreakdown(P, oc, S) {
    const bd = { grupos: 0, terceros: 0, octavos: 0, cuartos: 0, semis: 0, final: 0, campeon: 0, bonus: 0 };
    for (const L of LETTERS) {
      const act = oc.groupOrder[L]; const pred = P.groups[L];
      if (!act || !pred) continue;
      const ri = oc.groupRank && oc.groupRank[L];
      const firm = (i) => !ri || (ri[i] && ri[i].firm);
      const defTop2 = (team) => { const idx = act.indexOf(team); return idx < 0 ? false : (ri ? !!(ri[idx] && ri[idx].worstRank <= 1) : idx <= 1); };
      if (pred[0] && pred[0] === act[0] && firm(0)) bd.grupos += S.g1;
      if (pred[1] && pred[1] === act[1] && firm(1)) bd.grupos += S.g2;
      if (pred[2] && pred[2] === act[2] && firm(2)) bd.grupos += S.g3;
      if (pred[3] && pred[3] === act[3] && firm(3)) bd.grupos += (S.g4 || 0);   // acertar el 4º / último del grupo
      if (pred[0] && defTop2(pred[0])) bd.grupos += S.qual;
      if (pred[1] && defTop2(pred[1])) bd.grupos += S.qual;
    }
    if (oc.qualifiedThirdTeams) for (const t of P.thirds) if (oc.qualifiedThirdTeams.has(t)) bd.terceros += S.thirdQual;
    const stages = [["octavos", S.octavos, "octavos"], ["cuartos", S.cuartos, "cuartos"], ["semis", S.semis, "semis"], ["final", S.finalists, "final"]];
    for (const [stage, pts, key] of stages) {
      const actSet = oc.reached[stage]; const predSet = P[stage];
      if (!actSet || !predSet) continue;
      predSet.forEach((t) => { if (actSet.has(t)) bd[key] += pts; });
    }
    if (oc.reached.champion && P.champion && P.champion === oc.reached.champion) bd.campeon += S.champion;
    bd.bonus = scoreBonus(P, oc);   // BONUS 2º cuadro (columna aparte, suma al total)
    bd.total = bd.grupos + bd.terceros + bd.octavos + bd.cuartos + bd.semis + bd.final + bd.campeon + bd.bonus;
    return bd;
  }

  // -------- puntos de las predicciones especiales --------
  function scoreExtras(extras, actuals, S, oc) {
    const e = extras || {}, a = actuals || {};
    const bd = { revelacion: 0, decepcion: 0, pichichi: 0, asistente: 0, portero: 0, hattrick: 0, dobleRoja: 0 };
    const norm = (s) => (s || "").toString().trim().toLowerCase();
    // REVELACIÓN: equipo humilde que llega a CUARTOS+ (espejo de la decepción). Compat: fallo del admin.
    const revCuartos = oc && oc.reached && oc.reached.cuartos;
    if ((revCuartos && e.revelacion && revCuartos.has(e.revelacion)) || (a.revelacion && e.revelacion === a.revelacion)) bd.revelacion += S.revelacion;
    // DECEPCIÓN: puntúa si tu selección está en el set CONFIRMADO (favoritos caídos antes de
    // cuartos + fallo manual del admin). Si no llega 'oc' (compat), cae al modelo viejo de 1 solo.
    const decSet = oc && oc.decepcionConfirmed;
    if (decSet ? (e.decepcion && decSet.has(e.decepcion))
               : (a.decepcion && e.decepcion === a.decepcion)) bd.decepcion += S.decepcion;
    if (a.pichichi && norm(e.pichichi) && norm(e.pichichi) === norm(a.pichichi)) bd.pichichi += S.pichichi;
    if (a.asistente && norm(e.asistente) && norm(e.asistente) === norm(a.asistente)) bd.asistente += S.asistente;
    if (a.portero && norm(e.portero) && norm(e.portero) === norm(a.portero)) bd.portero += (S.portero || 0);
    const sb = e.sidebets || {}, asb = a.sidebets || {};
    if (asb.hattrick && sb.hattrick === asb.hattrick) bd.hattrick += S.hattrick;
    if (asb.dobleRoja && sb.dobleRoja === asb.dobleRoja) bd.dobleRoja += S.dobleRoja;
    bd.total = bd.revelacion + bd.decepcion + bd.pichichi + bd.asistente + bd.portero + bd.hattrick + bd.dobleRoja;
    return bd;
  }

  // -------- outcome en vivo a partir de los datos de ESPN (+ correcciones manuales) --------
  // Ronda KO a partir del slug oficial de ESPN (ev.season.slug). Robusto: sobrevive a
  // penaltis y NO depende de fechas (las ventanas por día se solapan en los cambios de ronda).
  // Devuelve la ronda a la que ENTRA el ganador (reached), null si no es KO puntuable.
  function koReachedKey(slug) {
    const s = (slug || "").toLowerCase();
    if (s.indexOf("round-of-32") >= 0) return "octavos";  // gana 1/16 → llega a octavos
    if (s.indexOf("round-of-16") >= 0) return "cuartos";  // gana octavos → llega a cuartos
    if (s.indexOf("quarter") >= 0) return "semis";        // gana cuartos → llega a semis
    if (s.indexOf("semi") >= 0) return "final";           // gana semis → llega a la final
    if (s.indexOf("third") >= 0 || s.indexOf("3rd") >= 0) return null; // 3er puesto: no puntúa
    if (s.indexOf("final") >= 0) return "champion";       // gana la final → campeón
    return null;
  }

  function outcomeFromEspn(events, dbResults, extrasActual) {
    dbResults = dbResults || {};
    const pairToFx = {};
    for (const fx of DATA.GROUP_FIXTURES) pairToFx[[fx.home, fx.away].slice().sort().join("|")] = fx;
    const groupMap = {};
    const liveExtra = {};   // partidos de grupo EN JUEGO (solo para mostrar; no puntúan)
    const ko = { octavos: new Set(), cuartos: new Set(), semis: new Set(), final: new Set(), champion: null };
    const koLosers = new Set();   // equipos que PERDIERON una eliminatoria ya jugada (para 'decepción')
    for (const ev of (events || [])) {
      const comp = ev.competitions && ev.competitions[0]; if (!comp) continue;
      const cs = comp.competitors || []; if (cs.length !== 2) continue;
      const A = cs.find((c) => c.homeAway === "home") || cs[0];
      const B = cs.find((c) => c.homeAway === "away") || cs[1];
      const tA = DATA.espnCanon(A.team && A.team.displayName), tB = DATA.espnCanon(B.team && B.team.displayName);
      if (!tA || !tB) continue; // placeholder / payload incompleto: equipos sin decidir todavía
      const stype = (ev.status && ev.status.type) || {};
      const completed = !!stype.completed;
      const inPlay = stype.state === "in";
      const date = (ev.date || "").slice(0, 10);
      const sA = parseInt(A.score, 10), sB = parseInt(B.score, 10);
      const slug = ((ev.season && ev.season.slug) || "").toLowerCase();
      const reachedKey = koReachedKey(slug);   // ronda KO según ESPN (null si grupo/3er/otro)
      const fx = pairToFx[[tA, tB].slice().sort().join("|")];
      // GRUPO: par de un cruce de grupo, aún no registrado, y ESPN NO lo marca como ronda KO.
      if (fx && !groupMap[fx.code] && !reachedKey) {
        if (completed && !isNaN(sA) && !isNaN(sB)) {
          const home = fx.home === tA ? sA : sB, away = fx.home === tA ? sB : sA;
          groupMap[fx.code] = { played: true, home_score: home, away_score: away };
        } else if (inPlay && !isNaN(sA) && !isNaN(sB)) {
          const home = fx.home === tA ? sA : sB, away = fx.home === tA ? sB : sA;
          liveExtra[fx.code] = { played: true, home_score: home, away_score: away, _live: true, status: stype.shortDetail || stype.detail || stype.description || "" };
        }
      } else if (completed) {
        // ELIMINATORIA: la ronda la da ESPN (season.slug), no la fecha. Si por lo que sea no
        // viniera slug, caemos a la ventana por fecha como último recurso.
        let rk = reachedKey;
        if (!rk && !slug) { const koWin = DATA.KO_WINDOWS.find((w) => date >= w.from && date <= w.to); rk = koWin ? koWin.reached : null; }
        if (rk) {
          let w = A.winner ? tA : (B.winner ? tB : (!isNaN(sA) && !isNaN(sB) ? (sA > sB ? tA : (sB > sA ? tB : null)) : null));
          if (w) {
            if (rk === "champion") ko.champion = w; else ko[rk].add(w);
            const loser = w === tA ? tB : tA; if (loser) koLosers.add(loser);   // el que cae, eliminado
          }
        }
      }
    }
    // correcciones manuales (DB) de grupos
    for (const fx of DATA.GROUP_FIXTURES) {
      const r = dbResults[fx.code];
      if (r && r.played && r.home_score != null) groupMap[fx.code] = { played: true, home_score: r.home_score, away_score: r.away_score };
    }
    const oc = liveOutcome(groupMap);
    // correcciones manuales (DB) de eliminatorias por nº de partido → ronda
    const roundOf = {};
    for (const m of DATA.R32) roundOf[m.match] = "octavos";
    for (const m of DATA.R16) roundOf[m.match] = "cuartos";
    for (const m of DATA.QF) roundOf[m.match] = "semis";
    for (const m of DATA.SF) roundOf[m.match] = "final";
    roundOf[DATA.FINAL.match] = "champion";
    for (const k in dbResults) {
      const r = dbResults[k]; if (!r || !r.played || !r.winner) continue;
      const rr = roundOf[k] || roundOf[Number(k)]; if (!rr) continue;
      if (rr === "champion") ko.champion = r.winner; else ko[rr].add(r.winner);
      // el perdedor de una corrección KO también cuenta como eliminado (para 'decepción')
      const loser = r.winner === r.home_team ? r.away_team : (r.winner === r.away_team ? r.home_team : null);
      if (loser) koLosers.add(loser);
    }
    oc.reached = {
      octavos: ko.octavos, cuartos: ko.cuartos, semis: ko.semis, final: ko.final, champion: ko.champion,
    };
    oc.extrasActual = extrasActual || {};
    oc.koLosers = koLosers;
    // Selección decepción CONFIRMADA: favoritos curados (DECEPCION_TEAMS) que ya cayeron
    // ANTES de cuartos — cada uno se activa solo al quedar eliminado (p.ej. Argentina solo
    // si pierde su octavos; si llega a cuartos, nunca cuenta). Se une (compat) al fallo
    // manual del admin en extrasActual.decepcion (string o array), que puntúa sin condición.
    const decSet = new Set();
    const adm = (extrasActual || {}).decepcion;
    if (Array.isArray(adm)) adm.forEach((t) => t && decSet.add(t));
    else if (adm) decSet.add(adm);
    for (const t of DECEPCION_TEAMS) { if (!oc.reached.cuartos.has(t) && koLosers.has(t)) decSet.add(t); }
    oc.decepcionConfirmed = decSet;
    // Decepción AÚN EN JUEGO: favoritos vivos que todavía podrían decepcionar (p.ej. Argentina
    // antes de su octavos). Para "qué falta para el TOP 3": son puntos pendientes, no resueltos.
    const decPending = new Set();
    for (const t of DECEPCION_TEAMS) { if (!decSet.has(t) && !oc.reached.cuartos.has(t) && !koLosers.has(t)) decPending.add(t); }
    oc.decepcionPending = decPending;
    oc.groupMap = groupMap;
    // ---- capa EN DIRECTO (solo para MOSTRAR): tabla que incluye los partidos en juego.
    //      NO afecta a la puntuación (eso sigue por jornadas COMPLETAS via groupOrder). ----
    oc.liveByCode = liveExtra;
    oc.liveStandingsByGroup = {};
    oc.liveGroups = {};
    if (Object.keys(liveExtra).length) {
      const liveMap = Object.assign({}, groupMap, liveExtra);
      for (const L of LETTERS) {
        if (fixturesOf(L).some((f) => liveExtra[f.code])) {
          oc.liveStandingsByGroup[L] = groupStandings(L, liveMap, false, null);
          oc.liveStandingsByGroup[L]._complete = false;   // tabla SOLO display: nunca "grupo cerrado" (blindaje)
          oc.liveGroups[L] = true;
        }
      }
    }
    return oc;
  }

  // -------- Monte Carlo: probabilidad de ganar la porra en vivo --------
  // entries: [{id, picks(derivados)}].  Devuelve {byId:{id:{win,podium,avg}}, sims}
  function monteCarlo(entries, resultsMap, N, S, rng) {
    rng = rng || Math.random;
    const ids = entries.map((e) => e.id);
    const win = {}, pod = {}, sum = {};
    ids.forEach((id) => { win[id] = 0; pod[id] = 0; sum[id] = 0; });
    const n = Math.max(1, N | 0);
    for (let s = 0; s < n; s++) {
      const oc = simulateOutcome(resultsMap, rng);
      let best = -Infinity;
      const scored = entries.map((e) => {
        const p = scoreEntry(e.picks, oc, S) + (e.extraPts || 0);
        sum[e.id] += p;
        if (p > best) best = p;
        return { id: e.id, p };
      });
      const winners = scored.filter((x) => x.p === best);
      const share = 1 / winners.length;
      winners.forEach((w) => (win[w.id] += share));
      // podio: top 3 puestos (con empates por puntuación contados)
      const sorted = scored.slice().sort((a, b) => b.p - a.p);
      const cutoff = sorted.length >= 3 ? sorted[2].p : (sorted.length ? sorted[sorted.length - 1].p : -Infinity);
      scored.forEach((x) => { if (x.p >= cutoff) pod[x.id] += 1; });
    }
    const byId = {};
    ids.forEach((id) => { byId[id] = { win: win[id] / n, podium: pod[id] / n, avg: sum[id] / n }; });
    return { byId, sims: n };
  }

  // -------- Monte Carlo por SELECCIÓN: prob. de clasificar / 1º / top2 (solo fase de grupos) --------
  function monteCarloTeams(resultsMap, N, rng) {
    rng = rng || Math.random;
    const teams = [].concat(...LETTERS.map((L) => DATA.GROUPS[L]));
    const acc = {}; teams.forEach((t) => (acc[t] = { qualify: 0, first: 0, top2: 0 }));
    const n = Math.max(1, N | 0);
    for (let s = 0; s < n; s++) {
      const standingsByGroup = {};
      for (const L of LETTERS) standingsByGroup[L] = groupStandings(L, resultsMap, true, rng);
      const q = computeQualifiers(standingsByGroup);
      for (const L of LETTERS) {
        const st = standingsByGroup[L];
        acc[st[0].team].first++;
        acc[st[0].team].top2++; acc[st[1].team].top2++;
      }
      const qset = new Set([].concat(Object.values(q.winners), Object.values(q.runnersUp), q.qualifiedThirdTeams));
      qset.forEach((t) => { if (acc[t]) acc[t].qualify++; });
    }
    const out = {};
    teams.forEach((t) => (out[t] = { qualify: acc[t].qualify / n, first: acc[t].first / n, top2: acc[t].top2 / n }));
    return { byTeam: out, sims: n };
  }

  return {
    poisson, simGoals, simKnockoutWinner,
    groupStandings, thirdMatching, buildR32Teams, computeQualifiers,
    simulateOutcome, liveOutcome, derivePicks, scoreEntry, scoreBreakdown, monteCarlo, monteCarloTeams,
    scoreExtras, outcomeFromEspn, THIRD_SLOT_NUMS,
  };
});
