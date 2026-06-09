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

  // -------- matching de terceros a slots del bracket --------
  // qualGroups: array de 8 letras (grupos cuyo 3º clasifica). -> {matchNum: letra}
  function thirdMatching(qualGroups) {
    const slots = THIRD_SLOT_NUMS;
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
  function liveOutcome(resultsMap) {
    const groupOrder = {}; let allComplete = true;
    const standingsByGroup = {};
    for (const L of LETTERS) {
      const s = groupStandings(L, resultsMap, false, null);
      standingsByGroup[L] = s;
      if (s._complete) groupOrder[L] = s.map((x) => x.team); else allComplete = false;
    }
    let qualifiedThirdTeams = null;
    if (allComplete) qualifiedThirdTeams = new Set(computeQualifiers(standingsByGroup).qualifiedThirdTeams);

    // reached: directamente de los ganadores registrados en eliminatorias
    const wOf = (n) => { const r = resultsMap[n] || resultsMap[String(n)]; return r && r.played && r.winner ? r.winner : null; };
    const octavos = new Set(DATA.R32.map((m) => wOf(m.match)).filter(Boolean));
    const cuartos = new Set(DATA.R16.map((m) => wOf(m.match)).filter(Boolean));
    const semis = new Set(DATA.QF.map((m) => wOf(m.match)).filter(Boolean));
    const finalists = new Set(DATA.SF.map((m) => wOf(m.match)).filter(Boolean));
    const champion = wOf(DATA.FINAL.match);

    return {
      complete: false, allGroupsComplete: allComplete, groupOrder, standingsByGroup,
      qualifiedThirdTeams,
      reached: { octavos, cuartos, semis, final: finalists, champion },
    };
  }

  // -------- derivar de una quiniela los conjuntos "llega a la ronda X" --------
  // picks = { groups:{L:[4]}, thirds:[...], bracket:{matchNum: team} }
  function derivePicks(picks) {
    const b = picks.bracket || {};
    const win = (nums) => nums.map((n) => b[n] || b[String(n)]).filter(Boolean);
    return {
      groups: picks.groups || {},
      thirds: picks.thirds || [],
      octavos: new Set(win(DATA.R32.map((m) => m.match))),
      cuartos: new Set(win(DATA.R16.map((m) => m.match))),
      semis: new Set(win(DATA.QF.map((m) => m.match))),
      final: new Set(win(DATA.SF.map((m) => m.match))),
      champion: b[DATA.FINAL.match] || b[String(DATA.FINAL.match)] || null,
    };
  }

  // -------- puntuación de una quiniela frente a un outcome --------
  function scoreEntry(P, oc, S) {
    let total = 0;
    for (const L of LETTERS) {
      const act = oc.groupOrder[L];
      const pred = P.groups[L];
      if (!act || !pred) continue;
      if (pred[0] && pred[0] === act[0]) total += S.g1;
      if (pred[1] && pred[1] === act[1]) total += S.g2;
      if (pred[2] && pred[2] === act[2]) total += S.g3;
      const top2 = new Set([act[0], act[1]]);
      if (pred[0] && top2.has(pred[0])) total += S.qual;
      if (pred[1] && top2.has(pred[1])) total += S.qual;
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
    return total;
  }

  // -------- desglose de puntos por categoría (para mostrar en la app) --------
  function scoreBreakdown(P, oc, S) {
    const bd = { grupos: 0, terceros: 0, octavos: 0, cuartos: 0, semis: 0, final: 0, campeon: 0 };
    for (const L of LETTERS) {
      const act = oc.groupOrder[L]; const pred = P.groups[L];
      if (!act || !pred) continue;
      if (pred[0] && pred[0] === act[0]) bd.grupos += S.g1;
      if (pred[1] && pred[1] === act[1]) bd.grupos += S.g2;
      if (pred[2] && pred[2] === act[2]) bd.grupos += S.g3;
      const top2 = new Set([act[0], act[1]]);
      if (pred[0] && top2.has(pred[0])) bd.grupos += S.qual;
      if (pred[1] && top2.has(pred[1])) bd.grupos += S.qual;
    }
    if (oc.qualifiedThirdTeams) for (const t of P.thirds) if (oc.qualifiedThirdTeams.has(t)) bd.terceros += S.thirdQual;
    const stages = [["octavos", S.octavos, "octavos"], ["cuartos", S.cuartos, "cuartos"], ["semis", S.semis, "semis"], ["final", S.finalists, "final"]];
    for (const [stage, pts, key] of stages) {
      const actSet = oc.reached[stage]; const predSet = P[stage];
      if (!actSet || !predSet) continue;
      predSet.forEach((t) => { if (actSet.has(t)) bd[key] += pts; });
    }
    if (oc.reached.champion && P.champion && P.champion === oc.reached.champion) bd.campeon += S.champion;
    bd.total = bd.grupos + bd.terceros + bd.octavos + bd.cuartos + bd.semis + bd.final + bd.campeon;
    return bd;
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
        const p = scoreEntry(e.picks, oc, S);
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

  return {
    poisson, simGoals, simKnockoutWinner,
    groupStandings, thirdMatching, buildR32Teams, computeQualifiers,
    simulateOutcome, liveOutcome, derivePicks, scoreEntry, scoreBreakdown, monteCarlo,
    THIRD_SLOT_NUMS,
  };
});
