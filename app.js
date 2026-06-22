/* ============================================================================
   PORRA MUNDIAL 2026 — App (Alpine + Supabase)
   ========================================================================== */
const SUPA_URL = "https://enzbrjqdxurrwdpoezxr.supabase.co";
const SUPA_KEY = "sb_publishable_TFWre0qvDBGKWvzc5D4Mzg_-FLySJ-w";
const sb = window.supabase.createClient(SUPA_URL, SUPA_KEY);
const D = window.PORRA_DATA;
const Eng = window.PorraEngine;

const ALL_TEAMS = [].concat(...D.GROUP_LETTERS.map((L) => D.GROUPS[L]));
// Sedes del Mundial 2026: zona horaria local + temperatura típica (máx. diurna jun-jul, °C).
// Se busca por ciudad (de ESPN venue.address.city), sin acentos y en minúsculas.
const VENUES = {
  // EE.UU. Este (ET)
  "atlanta": { tz: "America/New_York", temp: 31, lat: 33.755, lon: -84.401 }, "miami": { tz: "America/New_York", temp: 32, lat: 25.958, lon: -80.239 },
  "miami gardens": { tz: "America/New_York", temp: 32, lat: 25.958, lon: -80.239 }, "east rutherford": { tz: "America/New_York", temp: 28, lat: 40.814, lon: -74.074 },
  "new york": { tz: "America/New_York", temp: 28, lat: 40.814, lon: -74.074 }, "philadelphia": { tz: "America/New_York", temp: 30, lat: 39.901, lon: -75.168 },
  "foxborough": { tz: "America/New_York", temp: 26, lat: 42.091, lon: -71.264 }, "boston": { tz: "America/New_York", temp: 26, lat: 42.091, lon: -71.264 },
  // EE.UU. Centro (CT)
  "kansas city": { tz: "America/Chicago", temp: 31, lat: 39.049, lon: -94.484 }, "arlington": { tz: "America/Chicago", temp: 35, lat: 32.747, lon: -97.093 },
  "dallas": { tz: "America/Chicago", temp: 35, lat: 32.747, lon: -97.093 }, "houston": { tz: "America/Chicago", temp: 34, lat: 29.685, lon: -95.411 },
  // EE.UU. Oeste (PT)
  "inglewood": { tz: "America/Los_Angeles", temp: 26, lat: 33.953, lon: -118.339 }, "los angeles": { tz: "America/Los_Angeles", temp: 26, lat: 33.953, lon: -118.339 },
  "santa clara": { tz: "America/Los_Angeles", temp: 26, lat: 37.403, lon: -121.970 }, "san francisco": { tz: "America/Los_Angeles", temp: 26, lat: 37.403, lon: -121.970 },
  "seattle": { tz: "America/Los_Angeles", temp: 23, lat: 47.595, lon: -122.332 },
  // México
  "mexico city": { tz: "America/Mexico_City", temp: 24, lat: 19.303, lon: -99.150 }, "ciudad de mexico": { tz: "America/Mexico_City", temp: 24, lat: 19.303, lon: -99.150 },
  "guadalajara": { tz: "America/Mexico_City", temp: 27, lat: 20.681, lon: -103.463 }, "zapopan": { tz: "America/Mexico_City", temp: 27, lat: 20.681, lon: -103.463 },
  "monterrey": { tz: "America/Monterrey", temp: 34, lat: 25.669, lon: -100.244 }, "guadalupe": { tz: "America/Monterrey", temp: 34, lat: 25.669, lon: -100.244 },
  // Canadá
  "toronto": { tz: "America/Toronto", temp: 26, lat: 43.633, lon: -79.418 }, "vancouver": { tz: "America/Vancouver", temp: 21, lat: 49.277, lon: -123.112 },
};
function venueInfo(city) {
  if (!city) return null;
  const k = String(city).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  return VENUES[k] || null;
}
const TEAM_GROUP = (function () { const m = {}; for (const L of D.GROUP_LETTERS) for (const t of D.GROUPS[L]) m[t] = L; return m; })();
const KO_META = []
  .concat(D.R32.map((m) => ({ match: m.match, round: "1/16", stageKey: "r32" })))
  .concat(D.R16.map((m) => ({ match: m.match, round: "Octavos", stageKey: "r16" })))
  .concat(D.QF.map((m) => ({ match: m.match, round: "Cuartos", stageKey: "qf" })))
  .concat(D.SF.map((m) => ({ match: m.match, round: "Semifinal", stageKey: "sf" })))
  .concat([{ match: 103, round: "3er puesto", stageKey: "thirdplace" }])
  .concat([{ match: D.FINAL.match, round: "FINAL", stageKey: "final" }]);

function emptyGroups() { const g = {}; for (const L of D.GROUP_LETTERS) g[L] = D.GROUPS[L].slice(); return g; }
function defaultREdit() { const re = {}; for (const fx of D.GROUP_FIXTURES) re[fx.code] = { h: null, a: null }; return re; }
function defaultKoEdit() { const ke = {}; for (const m of KO_META) ke[m.match] = { home: "", away: "", h: null, a: null, winner: "" }; return ke; }
const ERRORS = {
  CODE_TAKEN: "Ese código ya está cogido, elige otro.",
  CODE_TOO_SHORT: "El código debe tener al menos 3 caracteres.",
  PIN_TOO_SHORT: "El PIN debe tener al menos 4 caracteres.",
  POOL_NOT_FOUND: "No existe ninguna porra con ese código.",
  POOL_LOCKED: "La porra está cerrada: ya no se pueden cambiar los pronósticos.",
  NAME_REQUIRED: "Pon tu nombre y tu apellido.",
  BAD_PIN: "PIN incorrecto.",
  PARTICIPANT_NOT_FOUND: "No encuentro tu quiniela en esta porra.",
};

window.porraApp = function () {
  return {
    // navegación
    view: "home", tab: "play", step: 1, rTab: "cal", aTab: "groups", calFilter: "all", brRound: 0, avatarMap: {}, avatarBusy: false, lightbox: null, photoCache: {},
    teamProbs: {}, teamProbsSims: 0, scorers: [], assisters: [], porteros: [], _matchCache: {}, assistsLoading: false, assistsLoaded: false, porteroDraft: "", porteroSaving: false,
    phase: "welcome", gIdx: 0, chosenNew: false, confirmClaim: null, claimFromName: false,
    wmode: "choose", entriesLoaded: false,
    // estado porra / jugador
    pool: null, me: { first: "", last: "", id: null, saved: false },
    joinCode: "", newPool: { name: "", code: "", pin: "" }, recent: [],
    // ui
    toasts: [], busy: false, probBusy: false, syncBusy: false, syncMsg: "",
    showInstall: false, deferredPrompt: null,
    // pronósticos
    groups: emptyGroups(), thirds: [], bracket: {}, _cols: [], _champion: null,
    extras: { revelacion: "", decepcion: "", pichichi: "", asistente: "", portero: "", sidebets: {} },
    letters: D.GROUP_LETTERS, allTeams: ALL_TEAMS.slice().sort((a, b) => D.es(a).localeCompare(D.es(b))),
    sideBets: D.SIDE_BETS,
    // en vivo (ESPN) + cierre automático
    espnEvents: [], espnAt: 0, liveBusy: false, nowTs: 0, outcome: null, extrasActual: {}, _espnTimer: null, explain: null, scoringStatus: null, forecasts: {}, forecastsAt: 0, pathAnalysis: null, pathLoading: false, cmpA: "", cmpB: "", cmpGroup: "",
    extrasActualEdit: { revelacion: "", decepcion: "", pichichi: "", asistente: "", portero: "", sidebets: {} },
    // datos
    entries: [], ranked: [], results: {}, rEdit: defaultREdit(), koEdit: defaultKoEdit(), liveBr: { teamsByMatch: {}, winnerOf: {}, complete: false },
    koPreview: null, koPreviewShow: false, ko27: null, ko27Round: "r32",
    bracket2: {}, _cols2: [], _champion2: null, ko27Busy: false, ko27Saved: false,
    // admin
    adminOk: false, adminPin: "", settings: Object.assign({}, D.DEFAULT_SCORING),
    scoreKeys: [
      { key: "g1", label: "Acertar 1º de grupo" }, { key: "g2", label: "Acertar 2º de grupo" },
      { key: "g3", label: "Acertar 3º de grupo" }, { key: "g4", label: "Acertar 4º / último de grupo" },
      { key: "qual", label: "Equipo que clasifica (top 2)" },
      { key: "thirdQual", label: "Tercero que clasifica" }, { key: "octavos", label: "Llega a octavos" },
      { key: "cuartos", label: "Llega a cuartos" }, { key: "semis", label: "Llega a semifinal" },
      { key: "finalists", label: "Llega a la final" }, { key: "champion", label: "Campeón del mundo" },
    ],
    // probabilidades
    lastProb: false, simN: 0, probData: {}, briefing: null, _briefBaseline: undefined,
    boardLocked: false, usingServerBoard: false, boardIncomplete: 0,
    selectedId: null, det: null,
    koMeta: KO_META,

    // ---------- helpers de presentación ----------
    es: (t) => D.es(t), flag: (t) => D.flag(t),
    rankClass(i) { return i < 2 ? "qual" : i === 2 ? "third" : "out"; },
    pct(x) { if (x == null) return "—"; const v = x * 100; return (v >= 9.95 ? v.toFixed(0) : v.toFixed(1)) + "%"; },
    // Invitados (fuera de concurso): no ocupan número de posición ni podio. Solo familiares se numeran.
    isGuest(e) { const n = (e && e.first_name) || ""; return n.startsWith("🤖") || n.startsWith("🎙"); },
    get podium3() { return (this.ranked || []).filter((e) => !this.isGuest(e)).slice(0, 3); },
    famPos(i) { const e = (this.ranked || [])[i]; if (!e || this.isGuest(e)) return null; let c = 0; for (let k = 0; k <= i; k++) { if (!this.isGuest(this.ranked[k])) c++; } return c; },
    // ---------- pronósticos de la gente (Bota de Oro / máximo asistente) para la pestaña Goleadores ----------
    _shortName(e) { const n = (e.first_name || "").trim(); if (n.startsWith("🤖")) return "🤖 IA"; if (n.startsWith("🎙")) return "🎙️ Maldini"; return n.split(/\s+/)[0] || n; },
    _norm(s) { return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.\-'`]/g, "").trim(); },
    _surKey(s) { const n = this._norm(s); return n ? n.split(/\s+/).pop() : ""; },   // apellido (\u00faltimo token) para agrupar/casar
    _matchLiveKey(key, list) {
      if (!key || key.length < 3 || !list) return null;
      for (let i = 0; i < list.length; i++) { if (this._surKey(list[i].name) === key) return { rank: i + 1, n: list[i].n, name: list[i].name }; }
      return null;
    },
    _betSummary(field, list) {
      const groups = {};
      for (const e of (this.entries || [])) {
        const raw = e.picks && e.picks.extras && (e.picks.extras[field] || "").trim(); if (!raw) continue;
        const key = this._surKey(raw); if (!key) continue;
        if (!groups[key]) groups[key] = { key, variants: {}, players: [] };
        groups[key].variants[raw] = (groups[key].variants[raw] || 0) + 1;
        groups[key].players.push(this._shortName(e));
      }
      return Object.values(groups).map((g) => {
        const live = this._matchLiveKey(g.key, list);
        const raw = Object.keys(g.variants).sort((a, b) => b.length - a.length)[0];
        const label = live ? live.name : raw.replace(/(^|\s)\S/g, (c) => c.toUpperCase());
        return { pick: label, players: g.players, live: live ? { rank: live.rank, n: live.n } : null };
      }).sort((a, b) => ((b.live ? 1 : 0) - (a.live ? 1 : 0)) || (a.live && b.live ? a.live.rank - b.live.rank : 0) || (b.players.length - a.players.length) || a.pick.localeCompare(b.pick));
    },
    get goleadorBets() { return this._betSummary("pichichi", this.scorers); },
    get asistenteBets() { return this._betSummary("asistente", this.assisters); },
    // ---------- comparar dos porras ----------
    get compareOptions() {
      const order = {}; (this.ranked || []).forEach((r, i) => (order[r.id] = i));
      return (this.entries || []).filter((e) => e.picks).map((e) => ({ id: e.id, name: (e.first_name + " " + e.last_name).trim() })).sort((a, b) => (order[a.id] != null ? order[a.id] : 99) - (order[b.id] != null ? order[b.id] : 99));
    },
    ensureCompareDefaults() {
      const opts = this.compareOptions; if (!opts.length) return;
      if (!this.cmpA || !opts.some((o) => o.id === this.cmpA)) this.cmpA = (this.me && this.me.id && opts.some((o) => o.id === this.me.id)) ? this.me.id : opts[0].id;
      if (!this.cmpB || this.cmpB === this.cmpA || !opts.some((o) => o.id === this.cmpB)) { const o = opts.find((x) => x.id !== this.cmpA); this.cmpB = o ? o.id : ""; }
    },
    _groupPts(picks, L, oc, S) {
      const act = oc.groupOrder[L]; const pred = picks.groups && picks.groups[L];
      if (!act || !pred || pred.length !== 4) return 0;
      const ri = oc.groupRank[L]; const firm = (i) => !ri || (ri[i] && ri[i].firm);
      const dT = (t) => { const idx = act.indexOf(t); return idx < 0 ? false : (ri ? !!(ri[idx] && ri[idx].worstRank <= 1) : idx <= 1); };
      const gk = [S.g1, S.g2, S.g3, (S.g4 || 0)]; let pts = 0;
      for (let i = 0; i < 4; i++) if (pred[i] && pred[i] === act[i] && firm(i)) pts += gk[i];
      if (pred[0] && dT(pred[0])) pts += S.qual;
      if (pred[1] && dT(pred[1])) pts += S.qual;
      return pts;
    },
    _groupRows(picks, L, oc, S) {   // pronóstico de un jugador en un grupo (con aciertos y +pts)
      const act = oc.groupOrder[L]; const pred = picks.groups && picks.groups[L];
      if (!act || !pred || pred.length !== 4) return null;
      const ri = oc.groupRank[L]; const firm = (i) => !ri || (ri[i] && ri[i].firm);
      const dT = (t) => { const idx = act.indexOf(t); return idx < 0 ? false : (ri ? !!(ri[idx] && ri[idx].worstRank <= 1) : idx <= 1); };
      const gk = [S.g1, S.g2, S.g3, (S.g4 || 0)];
      const rows = pred.map((t, i) => { const hit = (t === act[i] && firm(i)); return { es: D.es(t), flag: D.flag(t), hit, pts: hit ? gk[i] : 0 }; });
      const qualNames = []; if (pred[0] && dT(pred[0])) qualNames.push(D.es(pred[0])); if (pred[1] && dT(pred[1])) qualNames.push(D.es(pred[1]));
      return { rows, qualNames };
    },
    _groupActual(L, oc) {
      const act = oc.groupOrder[L]; if (!act) return null;
      const ri = oc.groupRank[L]; const firm = (i) => !ri || (ri[i] && ri[i].firm);
      return act.map((t, i) => ({ es: D.es(t), flag: D.flag(t), firm: firm(i) }));
    },
    get cmpGroupData() { const cr = this.compareResult; if (!cr || !this.cmpGroup) return null; return cr.groups.find((g) => g.L === this.cmpGroup) || null; },
    _cmpOne(id, oc, S) {
      const e = (this.entries || []).find((x) => x.id === id); if (!e || !e.picks) return null;
      const dp = Eng.derivePicks(e.picks);
      const bd = Eng.scoreBreakdown(dp, oc, S);
      const ex = Eng.scoreExtras(e.picks.extras, this.extrasActual, S);
      const champTeam = e.picks.bracket && (e.picks.bracket[D.FINAL.match] || e.picks.bracket[String(D.FINAL.match)]);
      return { id, name: (e.first_name + " " + e.last_name).trim(), picks: e.picks, bd, ex, cuadro: bd.octavos + bd.cuartos + bd.semis + bd.final + bd.campeon, total: bd.total + ex.total, champ: champTeam ? D.es(champTeam) : null, champFlag: champTeam ? D.flag(champTeam) : "" };
    },
    get compareResult() {
      if (!this.cmpA || !this.cmpB || this.cmpA === this.cmpB) return null;
      const oc = this.outcome || Eng.liveOutcome(this.results); const S = this.settings;
      const A = this._cmpOne(this.cmpA, oc, S), B = this._cmpOne(this.cmpB, oc, S);
      if (!A || !B) return null;
      const cats = [
        { key: "Grupos", a: A.bd.grupos, b: B.bd.grupos },
        { key: "Terceros", a: A.bd.terceros, b: B.bd.terceros },
        { key: "Cuadro (eliminatorias)", a: A.cuadro, b: B.cuadro },
        { key: "Especiales", a: A.ex.total, b: B.ex.total },
      ].filter((c) => c.a || c.b);
      const groups = [];
      for (const L of D.GROUP_LETTERS) {
        const pa = this._groupPts(A.picks, L, oc, S), pb = this._groupPts(B.picks, L, oc, S);
        if (pa <= 0 && pb <= 0) continue;
        const dA = this._groupRows(A.picks, L, oc, S), dB = this._groupRows(B.picks, L, oc, S);
        groups.push({ L, a: pa, b: pb, rowsA: dA ? dA.rows : [], qualA: dA ? dA.qualNames : [], rowsB: dB ? dB.rows : [], qualB: dB ? dB.qualNames : [], actual: this._groupActual(L, oc) });
      }
      const leaderName = A.total === B.total ? "" : this._shortName({ first_name: (A.total > B.total ? A : B).name });
      return { A, B, gap: A.total - B.total, leaderName, cats, groups };
    },
    // ---------- resumen de la jornada (auto, se actualiza cada ronda completa) ----------
    tournamentMatchday() {   // nº de jornadas completas en TODOS los grupos (jornada del torneo)
      const gm = (this.outcome && this.outcome.groupMap) || this.results || {};
      let minK = 3;
      for (const L of D.GROUP_LETTERS) {
        const fx = D.GROUP_FIXTURES.filter((f) => f.group === L);
        let k = 0;
        for (let m = 1; m <= 3; m++) { const games = fx.filter((f) => f.md === m); const done = games.length > 0 && games.every((f) => { const r = gm[f.code]; return r && r.played && r.home_score != null; }); if (done) k = m; else break; }
        minK = Math.min(minK, k);
      }
      return minK;
    },
    get matchdaySummary() {
      if (!this.boardLocked || !this.ranked || this.ranked.length < 2) return null;
      const jornada = this.tournamentMatchday();
      if (jornada < 1) return null;
      const real = this.ranked.filter((r) => !this.isGuest(r));
      if (real.length < 2) return null;
      const leader = real[0], second = real[1];
      const a = this.extrasActual || {}, asb = a.sidebets || {};
      const esp = [];
      if (asb.hattrick) esp.push("hat-trick");
      if (asb.dobleRoja) esp.push("doble roja");
      if (a.revelacion) esp.push("revelación");
      if (a.decepcion) esp.push("decepción");
      if (a.pichichi) esp.push("Bota de Oro");
      if (a.asistente) esp.push("máximo asistente");
      if (a.portero) esp.push("mejor portero");
      return { jornada, leader: this._shortName(leader), leaderPts: leader.points, gap: leader.points - second.points, second: this._shortName(second), podio: this.podium3.map((p) => this._shortName(p)), esp };
    },
    get porteroBets() { return this._betSummary("portero", this.porteros); },
    // ---------- predicción "mejor portero" (campo nuevo): aviso en pantalla principal + guardar ----------
    get myEntry() { const id = this.me && this.me.id; return id ? (this.entries || []).find((e) => e.id === id) : null; },
    get myPortero() { const e = this.myEntry; const v = (e && e.picks && e.picks.extras && e.picks.extras.portero) || (this.extras && this.extras.portero) || ""; return (v || "").trim(); },
    async savePortero() {
      const v = (this.porteroDraft || "").trim();
      if (!v || !this.me.id || !this.pool || this.porteroSaving) return;
      this.porteroSaving = true;
      try {
        await this.rpc("porra_set_portero", { p_code: this.pool.code, p_participant_id: this.me.id, p_portero: v });
        if (this.extras) this.extras.portero = v;
        const e = this.myEntry; if (e) { e.picks = e.picks || {}; e.picks.extras = Object.assign({}, e.picks.extras || {}, { portero: v }); }
        this.porteroDraft = "";
        this.toast("🧤 ¡Guardado! Tu mejor portero: " + v);
      } catch (err) { this.toast(this.errMsg ? this.errMsg(err) : "No se pudo guardar", "err"); }
      finally { this.porteroSaving = false; }
    },
    groupFixtures(L) { return D.GROUP_FIXTURES.filter((f) => f.group === L); },
    scoreTxt(code) {
      const g = this.outcome && this.outcome.groupMap && this.outcome.groupMap[code];
      const r = g || this.results[code];
      return r && r.played && r.home_score != null ? `${r.home_score} - ${r.away_score}` : "— : —";
    },
    get playedTxt() {
      const done = (this.espnEvents || []).filter((ev) => ev.status && ev.status.type && ev.status.type.completed).length;
      const dbDone = Object.values(this.results).filter((r) => r && r.played).length;
      const n = Math.max(done, dbDone);
      return n ? `${n} partido${n > 1 ? "s" : ""} jugado${n > 1 ? "s" : ""}` : "Aún no hay partidos jugados";
    },
    koLabel(name) {
      return (name || "").replace("Group ", "Grupo ").replace(" Winner", " (ganador)").replace(" 2nd Place", " (2º)")
        .replace("Round of 32", "1/16").replace("Round of 16", "Octavos").replace("Quarterfinal", "Cuartos")
        .replace("Semifinal", "Semis").replace(/Third Place.*/, "3º clasificado").replace(" Loser", " (perdedor)");
    },
    // --- fechas/horas en hora de España (Madrid) ---
    _d(iso) { if (!iso) return null; let s = String(iso); if (/T\d\d:\d\dZ$/.test(s)) s = s.replace("Z", ":00Z"); const d = new Date(s); return isNaN(d.getTime()) ? null : d; },
    madridTime(iso) { const d = this._d(iso); if (!d) return ""; try { return new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hour12: false }).format(d); } catch (e) { return ""; } },
    localTimeAt(iso, tz) { const d = this._d(iso); if (!d || !tz) return ""; try { return new Intl.DateTimeFormat("es-ES", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(d); } catch (e) { return ""; } },
    // temperatura estimada de un partido: máx. típica de la sede ajustada por la hora local de saque
    estTempC(iso, vi) {
      if (!vi) return null;
      const lt = this.localTimeAt(iso, vi.tz); const h = lt ? parseInt(lt.slice(0, 2), 10) : 15;
      let adj = 0;
      if (h >= 12 && h <= 16) adj = 0;                                 // mediodía/tarde: máxima
      else if ((h >= 9 && h < 12) || (h >= 17 && h < 19)) adj = -3;     // mañana / atardecer
      else if (h >= 19 && h < 22) adj = -6;                            // noche
      else adj = -8;                                                   // madrugada
      return vi.temp + adj;
    },
    // clave "YYYY-MM-DDTHH" de un partido en la hora LOCAL de la sede (para cruzar con Open-Meteo)
    localHourKey(iso, tz) {
      const d = this._d(iso); if (!d || !tz) return "";
      try {
        const g = {}; new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(d).forEach((p) => (g[p.type] = p.value));
        const hh = g.hour === "24" ? "00" : g.hour;
        return `${g.year}-${g.month}-${g.day}T${hh}`;
      } catch (e) { return ""; }
    },
    // Previsión REAL gratis (Open-Meteo, sin clave) para las sedes con partidos en los próximos ~16 días
    async loadForecasts() {
      if (this.forecastsAt && Date.now() - this.forecastsAt < 2 * 3600 * 1000) return;   // cache 2 h
      const need = {};
      for (const m of this.liveMatches) {
        if (m.done || m.live || !m.venue) continue;
        const vi = venueInfo(m.venue);
        if (vi && vi.lat != null && !need[m.venue]) need[m.venue] = vi;
      }
      const cities = Object.keys(need); if (!cities.length) return;
      const out = {};
      await Promise.all(cities.map(async (city) => {
        const vi = need[city];
        try {
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${vi.lat}&longitude=${vi.lon}&hourly=temperature_2m&timezone=auto&forecast_days=16`;
          const j = await (await fetch(url)).json();
          const t = j.hourly && j.hourly.time, tp = j.hourly && j.hourly.temperature_2m;
          if (t && tp) { const map = {}; for (let i = 0; i < t.length; i++) map[String(t[i]).slice(0, 13)] = tp[i]; out[city] = map; }
        } catch (e) { /* sigue con estimación */ }
      }));
      if (Object.keys(out).length) { this.forecasts = Object.assign({}, this.forecasts, out); this.forecastsAt = Date.now(); }
    },
    madridDayLong(iso) { const d = this._d(iso); if (!d) return ""; try { const s = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", weekday: "long", day: "numeric", month: "long" }).format(d); return s.charAt(0).toUpperCase() + s.slice(1); } catch (e) { return ""; } },
    madridDayShort(iso) { const d = this._d(iso); if (!d) return ""; try { return new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", weekday: "short", day: "numeric", month: "short" }).format(d); } catch (e) { return ""; } },
    _dayKey(iso) { const d = this._d(iso); if (!d) return (iso || "").slice(0, 10); try { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(d); } catch (e) { return (iso || "").slice(0, 10); } },

    get liveMatches() {
      const out = [];
      for (const ev of (this.espnEvents || [])) {
        const comp = ev.competitions && ev.competitions[0]; if (!comp) continue;
        const cs = comp.competitors || []; if (cs.length !== 2) continue;
        const H = cs.find((c) => c.homeAway === "home") || cs[0], A = cs.find((c) => c.homeAway === "away") || cs[1];
        const st = (ev.status && ev.status.type) || {};
        const cH = D.espnCanon(H.team.displayName), cA = D.espnCanon(A.team.displayName);
        const venue = (comp.venue && comp.venue.address && comp.venue.address.city) ? String(comp.venue.address.city).split(",")[0].trim() : ((comp.venue && comp.venue.fullName) || "");
        const vi = venueInfo(venue);
        let tempC = vi ? this.estTempC(ev.date, vi) : null, tempReal = false;
        if (vi) {
          const fc = this.forecasts && this.forecasts[venue];
          if (fc) { const k = this.localHourKey(ev.date, vi.tz); if (k && fc[k] != null) { tempC = Math.round(fc[k]); tempReal = true; } }
        }
        out.push({
          id: ev.id, ts: this._d(ev.date) ? this._d(ev.date).getTime() : 0, venue,
          localTime: vi ? this.localTimeAt(ev.date, vi.tz) : "", tempC, tempReal,
          time: this.madridTime(ev.date), dayShort: this.madridDayShort(ev.date), dayLong: this.madridDayLong(ev.date), dayKey: this._dayKey(ev.date),
          hCanon: cH, aCanon: cA,
          hName: cH ? D.es(cH) : this.koLabel(H.team.displayName), hFlag: cH ? D.flag(cH) : "🏳️",
          aName: cA ? D.es(cA) : this.koLabel(A.team.displayName), aFlag: cA ? D.flag(cA) : "🏳️",
          hs: H.score, as: A.score, live: st.state === "in", done: !!st.completed, pre: st.state === "pre",
          status: st.shortDetail || st.detail || st.description || "",
        });
      }
      out.sort((a, b) => a.ts - b.ts);
      return out;
    },
    get liveGroups() {
      const seen = {}, out = [];
      for (const m of this.liveMatches) {
        if (!m.live) continue;
        const g = m.hCanon && TEAM_GROUP[m.hCanon];
        if (g && g === (m.aCanon && TEAM_GROUP[m.aCanon]) && !seen[g]) { seen[g] = true; out.push({ letter: g, match: m }); }
      }
      return out.sort((a, b) => a.letter.localeCompare(b.letter));
    },
    groupPredictions(L) {
      return (this.entries || [])
        .filter((e) => e.picks && e.picks.groups && e.picks.groups[L] && e.picks.groups[L].length === 4)
        .map((e) => ({ id: e.id, name: e.first_name + " " + e.last_name, me: e.id === this.me.id, bot: (e.first_name || "").startsWith("🤖"), order: e.picks.groups[L] }));
    },
    get liveToday() {
      const live = this.liveMatches.filter((m) => m.live);
      if (live.length) return live;
      const upcoming = this.liveMatches.filter((m) => m.ts >= this.nowTs - 6 * 3600000);
      return (upcoming.length ? upcoming : this.liveMatches).slice(0, 10);
    },
    get todayKey() { return this._dayKey(new Date(this.nowTs || Date.now()).toISOString()); },
    get schedule() {
      const f = this.calFilter, today = this.todayKey, byDay = {};
      for (const m of this.liveMatches) {
        if (f === "spain" && m.hCanon !== "Spain" && m.aCanon !== "Spain") continue;
        if (f === "today" && m.dayKey !== today) continue;
        const k = m.dayKey || "?";
        if (!byDay[k]) byDay[k] = { key: k, label: m.dayLong, matches: [] };
        byDay[k].matches.push(m);
      }
      return Object.values(byDay).sort((a, b) => a.key.localeCompare(b.key));
    },

    // ---------- init ----------
    async init() {
      try { this.recent = JSON.parse(localStorage.getItem("porra_recent") || "[]"); } catch (e) { this.recent = []; }
      try { this._matchCache = JSON.parse(localStorage.getItem("porra_matchdata") || "{}"); } catch (e) { this._matchCache = {}; }
      this.rebuild();
      this.nowTs = Date.now();
      setInterval(() => { this.nowTs = Date.now(); }, 20000);
      window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); this.deferredPrompt = e; });
      window.addEventListener("appinstalled", () => { this.deferredPrompt = null; this.showInstall = false; });
      // Mostrar el tutorial de instalación una sola vez (primera visita, si no es ya una app)
      try { if (!this.isStandalone && !localStorage.getItem("porra_install_seen")) setTimeout(() => { if (!this.isStandalone) this.showInstall = true; }, 1800); } catch (e) {}
      this._espnTimer = setInterval(() => { if (!this.pool) return; if (this.tab === "leaderboard") this.loadBoard(); else if (this.tab === "results" || this.tab === "goals") this.fetchEspn(false); }, 60000);
      // Al volver a la pestaña/app, refresca al instante (clasificación siempre al día con lo que se está jugando).
      document.addEventListener("visibilitychange", () => { if (!document.hidden && this.pool) { if (this.tab === "leaderboard") this.loadBoard(); else if (this.tab === "results" || this.tab === "goals") this.fetchEspn(false); } });
      const code = new URLSearchParams(location.search).get("porra");
      if (code) await this.loadPool(code);
    },

    // ---------- cierre automático ----------
    get isLocked() { return !!(this.pool && (this.pool.locked || (this.pool.lock_at && this.nowTs >= Date.parse(this.pool.lock_at)))); },
    get lockCountdown() {
      if (!this.pool || !this.pool.lock_at) return null;
      const ms = Date.parse(this.pool.lock_at) - this.nowTs;
      if (ms <= 0) return null;
      if (ms < 3600000) return Math.max(1, Math.floor(ms / 60000)) + " min";
      return Math.floor(ms / 3600000) + " h"; // solo horas
    },

    // ---------- datos en vivo (ESPN, sin clave, CORS abierto) ----------
    async fetchEspn(force) {
      if (!force && Date.now() - this.espnAt < 40000 && this.espnEvents.length) { this.computeLive(); return; }
      this.liveBusy = true;
      try {
        const r = await fetch("https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719&limit=200");
        const j = await r.json();
        if (j && j.events) { this.espnEvents = j.events; this.espnAt = Date.now(); }
      } catch (e) { /* mantener datos previos si falla */ }
      finally { this.liveBusy = false; this.computeLive(); }
    },
    computeLive() {
      this.outcome = Eng.outcomeFromEspn(this.espnEvents, this.results, this.extrasActual);
      this.computeScorers();
      if (this.tab === "results") {
        const mc = Eng.monteCarloTeams((this.outcome && this.outcome.groupMap) || {}, 3000, Math.random);
        this.teamProbs = mc.byTeam; this.teamProbsSims = mc.sims;
      }
      if (this.tab === "goals") this.loadMatchData();
      this.recomputeRanking();
      this.refreshLiveBracket();
      this.explain = this.buildExplain();
      this.scoringStatus = this.computeScoringStatus();
    },
    // ---------- estado de puntuación por jornadas (para el aviso de la clasificación) ----------
    computeScoringStatus() {
      const oc = this.outcome; if (!oc || !oc.groupScored) return null;
      const gm = oc.groupMap || {};
      const scoring = [], waiting = [];
      for (const L of D.GROUP_LETTERS) {
        const s = oc.standingsByGroup && oc.standingsByGroup[L];
        const played = s ? Math.round(s.reduce((a, t) => a + (t.pj || 0), 0) / 2) : 0;
        if (played === 0) continue;
        const K = oc.groupScored[L] || 0;
        if (K >= 1 || (s && s._complete)) { scoring.push(L); continue; }
        // jornada incompleta: el partido que falta de la jornada más baja sin cerrar
        const fx = D.GROUP_FIXTURES.filter((f) => f.group === L).slice().sort((a, b) => a.md - b.md);
        let pending = null;
        for (const f of fx) { const r = gm[f.code]; if (!(r && r.played)) { pending = D.es(f.home) + "–" + D.es(f.away); break; } }
        waiting.push({ L, pending });
      }
      return (scoring.length || waiting.length) ? { scoring, waiting } : null;
    },
    // ---------- explicación de la puntuación (por qué cada uno tiene sus puntos) ----------
    buildExplain() {
      const oc = this.outcome || Eng.liveOutcome(this.results);
      const S = this.settings;
      if (!oc || !this.entries || !this.entries.length) return null;
      const es = (t) => D.es(t);
      const groups = D.GROUP_LETTERS.map((L) => {
        const s = oc.standingsByGroup && oc.standingsByGroup[L];
        const order = oc.groupOrder && oc.groupOrder[L];
        const K = (oc.groupScored && oc.groupScored[L]) || 0;   // jornadas completas que puntúan
        const played = s ? Math.round(s.reduce((a, t) => a + (t.pj || 0), 0) / 2) : 0;
        let estado = "⏳ sin empezar", detalle = "", started = false;
        if (s && s._complete) {
          estado = "✅ terminado"; started = true;
          detalle = order.map((t, i) => (i + 1) + "º " + es(t)).join(" · ");
        } else if (K >= 1 && order) {
          estado = "🔴 puntúa jornada " + K + (K > 1 ? "s 1-" + K : "") + " (" + played + "/6)"; started = true;
          const ri = oc.groupRank[L];
          detalle = order.map((t, i) => (i + 1) + "º " + es(t) + (ri && ri[i] && ri[i].firm ? "" : "?")).join(" · ");
        } else if (played > 0) {
          estado = "⏳ jornada 1 incompleta (" + played + "/6) — aún no puntúa (faltan equipos por jugar)";
        }
        return { L, estado, detalle, started };
      });
      const byId = {}; this.entries.forEach((e) => { byId[e.id] = e; });
      const people = (this.ranked || []).map((r) => {
        const e = byId[r.id]; if (!e || !e.picks) return null;
        const dp = Eng.derivePicks(e.picks);
        const bd = Eng.scoreBreakdown(dp, oc, S);
        const ex = Eng.scoreExtras(e.picks.extras, this.extrasActual, S);
        const cuadro = bd.octavos + bd.cuartos + bd.semis + bd.final + bd.campeon;
        const cats = [];
        if (bd.grupos) cats.push("Grupos " + bd.grupos);
        if (bd.terceros) cats.push("Terceros " + bd.terceros);
        if (cuadro) cats.push("Cuadro " + cuadro);
        if (ex.total) cats.push("Especiales " + ex.total);
        return { id: r.id, name: (e.first_name + " " + e.last_name).trim(), total: bd.total + ex.total, summary: cats.join("  ·  ") || "Aún sin puntos", bits: this._explainBits(e.picks, oc, S, bd, ex) };
      }).filter(Boolean);
      return { groups, people };
    },
    _explainBits(picks, oc, S, bd, ex) {
      const es = (t) => D.es(t); const bits = [];
      for (const L of D.GROUP_LETTERS) {
        const act = oc.groupOrder[L]; const pred = picks.groups && picks.groups[L]; if (!act || !pred) continue;
        const ri = oc.groupRank && oc.groupRank[L]; const firm = (i) => !ri || (ri[i] && ri[i].firm);
        const dT = (t) => { const idx = act.indexOf(t); return idx < 0 ? false : (ri ? !!(ri[idx] && ri[idx].worstRank <= 1) : idx <= 1); };
        let g = 0, parts = [];
        if (pred[0] && pred[0] === act[0] && firm(0)) { g += S.g1; parts.push("1º " + es(pred[0]) + " +" + S.g1); }
        if (pred[1] && pred[1] === act[1] && firm(1)) { g += S.g2; parts.push("2º " + es(pred[1]) + " +" + S.g2); }
        if (pred[2] && pred[2] === act[2] && firm(2)) { g += S.g3; parts.push("3º " + es(pred[2]) + " +" + S.g3); }
        if (pred[3] && pred[3] === act[3] && firm(3)) { g += (S.g4 || 0); parts.push("4º/último " + es(pred[3]) + " +" + (S.g4 || 0)); }
        if (pred[0] && dT(pred[0])) { g += S.qual; parts.push(es(pred[0]) + " clasifica +" + S.qual); }
        if (pred[1] && dT(pred[1])) { g += S.qual; parts.push(es(pred[1]) + " clasifica +" + S.qual); }
        if (g > 0) bits.push({ icon: "📊", text: "Grupo " + L + ": " + parts.join(", ") + "  = +" + g });
      }
      if (bd.terceros) bits.push({ icon: "🥉", text: "Mejores terceros que clasifican: +" + bd.terceros });
      [["octavos", "octavos"], ["cuartos", "cuartos"], ["semis", "semifinales"], ["final", "la final"]].forEach(([k, label]) => { if (bd[k]) bits.push({ icon: "🏆", text: "Equipos tuyos en " + label + ": +" + bd[k] }); });
      if (bd.campeon) bits.push({ icon: "👑", text: "¡Campeón acertado! +" + bd.campeon });
      if (ex.revelacion) bits.push({ icon: "✨", text: "Revelación acertada +" + ex.revelacion });
      if (ex.decepcion) bits.push({ icon: "💀", text: "Decepción acertada +" + ex.decepcion });
      if (ex.pichichi) bits.push({ icon: "⚽", text: "Pichichi acertado +" + ex.pichichi });
      if (ex.asistente) bits.push({ icon: "🅰️", text: "Asistente acertado +" + ex.asistente });
      if (ex.portero) bits.push({ icon: "🧤", text: "Mejor portero acertado +" + ex.portero });
      if (ex.hattrick) bits.push({ icon: "🎩", text: "Hat-trick (apostó sí, y lo hubo) +" + ex.hattrick });
      if (ex.dobleRoja) bits.push({ icon: "🟥", text: "Doble roja (apostó sí, y la hubo) +" + ex.dobleRoja });
      return bits;
    },
    teamQ(team) { const p = this.teamProbs[team]; return p ? p.qualify : null; },
    // ---------- "Tu camino al podio": qué tendría que pasar para subir (justifica el %) ----------
    // Monte Carlo personalizado: simula miles de finales del Mundial, puntúa la porra de TODOS en
    // cada una, y mide en qué escenarios (sobre todo, quién es campeón) quedas 1º / en podio.
    async computePath() {
      const meId = this.me && this.me.id;
      if (this.pathLoading) return;
      this.pathLoading = true; this.pathAnalysis = null;
      await new Promise((r) => setTimeout(r, 40));   // deja pintar el "calculando…"
      try {
        if (!meId) { this.pathAnalysis = { none: true }; return; }
        const S = this.settings;
        const oc0 = this.outcome || Eng.liveOutcome(this.results);
        const simMap = Object.assign({}, this.results, (oc0 && oc0.groupMap) || {});
        const entries = (this.entries || []).filter((e) => e.picks).map((e) => ({
          id: e.id, name: (e.first_name + " " + e.last_name).trim(),
          dp: Eng.derivePicks(e.picks),
          groups: e.picks.groups || {},
          champ: (e.picks.bracket && (e.picks.bracket[D.FINAL.match] || e.picks.bracket[String(D.FINAL.match)])) || null,
          extra: Eng.scoreExtras(e.picks.extras, this.extrasActual, S).total,
        }));
        const me = entries.find((e) => e.id === meId);
        if (!me || entries.length < 2) { this.pathAnalysis = { none: true }; return; }
        const N = 3000;
        let meFirst = 0, mePod = 0;
        const cN = {}, cF = {}, cP = {};
        for (let s = 0; s < N; s++) {
          const oc = Eng.simulateOutcome(simMap, Math.random);
          const champ = oc.reached.champion;
          let myP = 0; const ps = [];
          for (const e of entries) { const p = Eng.scoreEntry(e.dp, oc, S) + e.extra; ps.push({ id: e.id, p }); if (e.id === meId) myP = p; }
          let above = 0;
          for (const x of ps) { if (x.p > myP) above++; }
          const rank = above + 1;
          if (rank === 1) meFirst++;
          if (rank <= 3) mePod++;
          if (champ) { cN[champ] = (cN[champ] || 0) + 1; if (rank === 1) cF[champ] = (cF[champ] || 0) + 1; if (rank <= 3) cP[champ] = (cP[champ] || 0) + 1; }
        }
        const byId = {}; entries.forEach((e) => (byId[e.id] = e));
        const rankedList = (this.ranked && this.ranked.length) ? this.ranked : [];
        const myRank = rankedList.length ? (rankedList.findIndex((r) => r.id === meId) + 1) : null;
        const myRow = rankedList.find((r) => r.id === meId);
        const myPoints = myRow ? myRow.points : null;
        const champs = Object.keys(cN).map((c) => ({ team: c, es: D.es(c), flag: D.flag(c), n: cN[c], freq: cN[c] / N, pFirst: (cF[c] || 0) / cN[c], pPod: (cP[c] || 0) / cN[c], mine: c === me.champ }));
        const scenarios = champs.filter((c) => c.freq >= 0.02 && c.pPod >= 0.05).sort((a, b) => b.pFirst - a.pFirst || b.pPod - a.pPod).slice(0, 4);
        const myChampC = me.champ ? champs.find((c) => c.team === me.champ) : null;
        const myChampAlive = !!(myChampC && myChampC.n > 0);
        // rival a batir = el que vas justo por detrás en la clasificación actual (al que hay que adelantar para subir)
        let rival = null, groupDiffs = [];
        if (myRank && myRank > 1 && rankedList[myRank - 2]) {
          const rRow = rankedList[myRank - 2]; const rEnt = byId[rRow.id];
          rival = { name: rEnt ? rEnt.name : ((rRow.first_name || "") + " " + (rRow.last_name || "")).trim(), champ: rEnt && rEnt.champ ? D.es(rEnt.champ) : null, points: rRow.points, gap: myPoints != null ? (rRow.points - myPoints) : null };
          // diferencias en GRUPOS sin decidir vs el rival: qué te conviene en cada uno
          const sbg = oc0 && oc0.standingsByGroup;
          if (rEnt) {
            for (const L of D.GROUP_LETTERS) {
              const myG = me.groups && me.groups[L], rvG = rEnt.groups && rEnt.groups[L];
              if (!myG || !rvG || myG.length < 4 || rvG.length < 4) continue;
              const s = sbg && sbg[L];
              if (s && s._complete) continue;                 // grupo ya cerrado: no se puede cambiar
              const myPos = {}, rvPos = {}; myG.forEach((t, i) => (myPos[t] = i)); rvG.forEach((t, i) => (rvPos[t] = i));
              let up = null, down = null, maxD = 0, minD = 0;
              for (const t of myG) { const d = ((rvPos[t] != null ? rvPos[t] : 3) - (myPos[t] != null ? myPos[t] : 3)); if (d > maxD) { maxD = d; up = t; } if (d < minD) { minD = d; down = t; } }
              if (up && down && up !== down) groupDiffs.push({ L, up: D.es(up), upFlag: D.flag(up), down: D.es(down), downFlag: D.flag(down), started: !!(s && s.some && s.some((x) => x.pj > 0)) });
            }
          }
        }
        groupDiffs = groupDiffs.slice(0, 6);
        const win = (myRow && typeof myRow.win === "number") ? myRow.win : meFirst / N;       // % oficial (servidor) si está
        const podium = (myRow && typeof myRow.podium === "number") ? myRow.podium : mePod / N;
        this.pathAnalysis = {
          rank: myRank, points: myPoints, win, podium, sims: N,
          isLeader: myRank === 1,
          myChamp: me.champ ? D.es(me.champ) : null, myChampFlag: me.champ ? D.flag(me.champ) : "",
          myChampAlive, myChampFirst: myChampAlive ? (cF[me.champ] || 0) / myChampC.n : null, myChampPod: myChampAlive ? (cP[me.champ] || 0) / myChampC.n : null,
          scenarios, rival, groupDiffs,
        };
      } finally { this.pathLoading = false; }
    },
    // Goleadores: instantáneo desde el scoreboard (con equipo + penaltis). El scoreboard NO trae
    // asistencias → esas se cargan aparte de los summaries (loadMatchData).
    computeScorers() {
      const goals = {};
      for (const ev of (this.espnEvents || [])) {
        const comp = ev.competitions && ev.competitions[0]; if (!comp) continue;
        const flagBy = {}, nameBy = {};
        for (const c of (comp.competitors || [])) { const canon = D.espnCanon(c.team && c.team.displayName); const id = c.team && c.team.id; flagBy[id] = canon ? D.flag(canon) : "🏳️"; nameBy[id] = canon ? D.es(canon) : ((c.team && c.team.displayName) || ""); }
        for (const dd of (comp.details || [])) {
          if (!dd.scoringPlay || dd.ownGoal || dd.shootout) continue;
          const inv = dd.athletesInvolved || [];
          if (inv[0] && inv[0].displayName) {
            const a = inv[0], k = a.id || a.displayName, tid = a.team && a.team.id;
            if (!goals[k]) goals[k] = { name: a.displayName, flag: flagBy[tid] || "🏳️", team: nameBy[tid] || "", n: 0, pen: 0 };
            goals[k].n++; if (dd.penaltyKick) goals[k].pen++;
          }
        }
      }
      this.scorers = Object.values(goals).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).slice(0, 30);
    },
    // Asistencias + porteros: ESPN solo los da en el endpoint summary por partido
    // (keyEvents[].participants[1] = asistente; rosters[].roster con el portero titular).
    // Goles encajados = marcador del rival (del scoreboard). Caché memoria + localStorage.
    async loadMatchData() {
      if (this.assistsLoading) return;
      this.assistsLoading = true;
      try {
        const base = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=";
        const events = this.espnEvents || [];
        const scoreById = {};
        for (const ev of events) {
          const comp = ev.competitions && ev.competitions[0]; if (!comp) continue;
          const cs = comp.competitors || [];
          const h = cs.find((c) => c.homeAway === "home"), a = cs.find((c) => c.homeAway === "away");
          scoreById[ev.id] = { home: h && h.score != null ? Number(h.score) : null, away: a && a.score != null ? Number(a.score) : null };
        }
        const targets = events.filter((ev) => {
          const st = (ev.status && ev.status.type) || {};
          if (st.state === "pre") return false;                        // sin empezar
          if (this._matchCache[ev.id] && st.completed) return false;   // ya cacheado y final
          return true;                                                 // en vivo o sin cachear
        });
        const CONC = 6;
        for (let i = 0; i < targets.length; i += CONC) {
          await Promise.all(targets.slice(i, i + CONC).map(async (ev) => {
            try {
              const s = await (await fetch(base + ev.id)).json();
              const a = [];
              for (const k of (s.keyEvents || [])) {
                if (!k.scoringPlay || k.shootout) continue;
                const tt = ((k.type && (k.type.type || k.type.text)) || "") + "";
                if (/own/i.test(tt) || /own goal/i.test(k.text || "")) continue;
                const p = k.participants || [];
                if (p[1] && p[1].athlete && p[1].athlete.displayName) a.push({ id: p[1].athlete.id, name: p[1].athlete.displayName, team: (k.team && k.team.displayName) || "" });
              }
              const gk = [], sc = scoreById[ev.id] || {};
              for (const r of (s.rosters || [])) {
                const keeper = (r.roster || []).find((pl) => { const pos = (pl.position && (pl.position.abbreviation || pl.position.name)) || ""; return /^g/i.test(pos) && pl.starter === true; });
                if (!keeper || !keeper.athlete) continue;
                const conceded = r.homeAway === "home" ? sc.away : (r.homeAway === "away" ? sc.home : null);
                if (conceded == null) continue;
                gk.push({ id: keeper.athlete.id, name: keeper.athlete.displayName, team: (r.team && r.team.displayName) || "", conceded });
              }
              this._matchCache[ev.id] = { a, gk };
            } catch (e) { /* salta este partido */ }
          }));
        }
        try {
          const persist = {};
          for (const ev of events) { const st = (ev.status && ev.status.type) || {}; if (st.completed && this._matchCache[ev.id]) persist[ev.id] = this._matchCache[ev.id]; }
          localStorage.setItem("porra_matchdata", JSON.stringify(persist));
        } catch (e) {}
        const assists = {}, gks = {};
        for (const id in this._matchCache) {
          const md = this._matchCache[id] || {};
          for (const a of (md.a || [])) {
            const k = a.id || a.name; const canon = D.espnCanon(a.team);
            if (!assists[k]) assists[k] = { name: a.name, flag: canon ? D.flag(canon) : "🏳️", team: canon ? D.es(canon) : (a.team || ""), n: 0 };
            assists[k].n++;
          }
          for (const g of (md.gk || [])) {
            const k = g.id || g.name; const canon = D.espnCanon(g.team);
            if (!gks[k]) gks[k] = { name: g.name, flag: canon ? D.flag(canon) : "🏳️", team: canon ? D.es(canon) : (g.team || ""), gc: 0, pj: 0, cs: 0 };
            gks[k].gc += g.conceded; gks[k].pj++; if (g.conceded === 0) gks[k].cs++;
          }
        }
        this.assisters = Object.values(assists).sort((x, y) => y.n - x.n || x.name.localeCompare(y.name)).slice(0, 30);
        this.porteros = Object.values(gks).filter((p) => p.pj >= 1).sort((a, b) => a.gc - b.gc || b.pj - a.pj || b.cs - a.cs || a.name.localeCompare(b.name)).slice(0, 30);
        this.assistsLoaded = true;
      } finally { this.assistsLoading = false; }
    },
    get liveAgo() {
      if (!this.espnAt) return "";
      const s = Math.round((this.nowTs - this.espnAt) / 1000);
      return s < 60 ? "hace " + Math.max(1, s) + "s" : "hace " + Math.round(s / 60) + " min";
    },
    goHome() { this.view = "home"; this.pool = null; this.adminOk = false; this.adminPin = ""; history.replaceState(null, "", location.pathname); },

    // ---------- instalar en el móvil (PWA) ----------
    get isStandalone() { try { return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true; } catch (e) { return false; } },
    get isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent || ""); },
    async installApp() {
      if (!this.deferredPrompt) return;
      this.deferredPrompt.prompt();
      try { await this.deferredPrompt.userChoice; } catch (e) {}
      this.deferredPrompt = null; this.showInstall = false;
    },
    closeInstall() { this.showInstall = false; try { localStorage.setItem("porra_install_seen", "1"); } catch (e) {} },

    // ---------- toasts / rpc ----------
    toast(msg, kind = "ok") { const id = Math.random().toString(36).slice(2); this.toasts.push({ id, msg, kind }); setTimeout(() => { this.toasts = this.toasts.filter((t) => t.id !== id); }, 3800); },
    errMsg(e) { const m = (e && e.message) || ""; for (const k in ERRORS) if (m.includes(k)) return ERRORS[k]; return m || "Algo ha fallado, inténtalo de nuevo."; },
    async rpc(name, args) { const { data, error } = await sb.rpc(name, args); if (error) { const e = new Error(this.errMsg(error)); e.raw = (error && error.message) || ""; throw e; } return data; },

    // ---------- crear / unirse ----------
    async createPool() {
      const n = this.newPool;
      if (!n.code || n.code.trim().length < 3) return this.toast("Pon un código de al menos 3 letras.", "err");
      if (!n.pin || n.pin.trim().length < 4) return this.toast("El PIN debe tener 4+ caracteres.", "err");
      this.busy = true;
      try {
        await this.rpc("porra_create_pool", { p_name: n.name, p_code: n.code, p_admin_pin: n.pin });
        this.adminPin = n.pin.trim(); this.adminOk = true;
        this.toast("¡Porra creada! 🎉 Comparte el código con la familia.");
        await this.loadPool(n.code);
      } catch (e) { this.toast(this.errMsg(e), "err"); } finally { this.busy = false; }
    },
    async joinPool() { if (!this.joinCode.trim()) return this.toast("Escribe el código de la porra.", "err"); await this.loadPool(this.joinCode); },

    async loadPool(code) {
      this.busy = true;
      try {
        const pool = await this.rpc("porra_get_pool", { p_code: code });
        if (!pool) { this.toast(ERRORS.POOL_NOT_FOUND, "err"); return; }
        this.pool = pool;
        this.settings = Object.assign({}, D.DEFAULT_SCORING, pool.settings || {});
        this.view = "pool"; this.tab = "play"; this.step = 1;
        this.adminOk = this.adminOk && this.adminPin ? this.adminOk : false;
        history.replaceState(null, "", location.pathname + "?porra=" + pool.code);
        this.rememberPool(pool);
        this.loadMine(pool.code);
        this.phase = this.me.id ? "hub" : "welcome"; this.gIdx = 0; this.chosenNew = false; this.confirmClaim = null; this.wmode = "choose"; this.entriesLoaded = false;
        if (this.me.id) this.tab = "leaderboard";   // quien ya juega entra directo a la Clasificación en directo
        await this.loadExtrasActual();
        await this.loadResults();
        await this.loadEntries();
        this.loadAvatars();
        this.fetchEspn(true);
        if (this.tab === "leaderboard") this.loadBoard();
      } catch (e) { this.toast(this.errMsg(e), "err"); } finally { this.busy = false; }
    },
    // ---------- fotos de perfil (avatares) ----------
    async loadAvatars() {
      try {
        const r = await this.rpc("porra_list_avatars", { p_code: this.pool.code });
        const m = {}; (r.avatars || []).forEach((a) => { m[a.id] = a.avatar; });
        this.avatarMap = m;
      } catch (e) { /* sin avatares no pasa nada */ }
    },
    avatarOf(id) { return (id && this.avatarMap[id]) || null; },
    initials(name) {
      const n = (name || "").trim();
      if (n.startsWith("🤖")) return "🤖";
      if (n.startsWith("🎙")) return "🎙️";
      const p = n.split(/\s+/).filter(Boolean);
      return (((p[0] && p[0][0]) || "") + ((p[1] && p[1][0]) || "") || "?").toUpperCase();
    },
    avatarHue(name) {
      let h = 0; const s = name || "";
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
      return "hsl(" + h + ",52%,52%)";
    },
    avatarHtml(id, name) {
      const a = this.avatarOf(id);
      if (a && /^data:image\//.test(a)) return '<img class="av-i" src="' + a.replace(/"/g, "") + '" alt="">';
      return '<span class="av-ini" style="background:' + this.avatarHue(name) + '">' + this.initials(name) + "</span>";
    },
    // Tocar una foto → abrir la foto COMPLETA (se pide al servidor solo en ese momento).
    async openPhoto(id, name) {
      if (!id || !this.avatarOf(id)) return;   // sin foto (iniciales) no abre nada
      this.lightbox = { name: name || "", src: this.photoCache[id] || null, loading: !this.photoCache[id] };
      if (!this.photoCache[id]) {
        try { const r = await this.rpc("porra_get_photo", { p_participant_id: id }); this.photoCache[id] = (r && r.photo) || this.avatarOf(id); }
        catch (e) { this.photoCache[id] = this.avatarOf(id); }
        if (this.lightbox) { this.lightbox.src = this.photoCache[id]; this.lightbox.loading = false; }
      }
    },
    closePhoto() { this.lightbox = null; },
    async setAvatarFile(ev) {
      const file = ev.target && ev.target.files && ev.target.files[0];
      if (ev.target) ev.target.value = "";
      if (!file || !this.me.id) return;
      if (!/^image\//.test(file.type || "")) return this.toast("Elige una imagen (foto).", "warn");
      this.avatarBusy = true;
      try {
        const dataUrl = await this._resizeImage(file, 200);
        await this.rpc("porra_set_avatar", { p_participant_id: this.me.id, p_avatar: dataUrl });
        await this.loadAvatars();
        this.toast("¡Foto actualizada! 📸");
      } catch (e) { this.toast("No se pudo subir la foto. Prueba con otra.", "err"); }
      finally { this.avatarBusy = false; }
    },
    _resizeImage(file, size) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          const s = Math.min(img.width, img.height);
          const c = document.createElement("canvas"); c.width = size; c.height = size;
          c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
          URL.revokeObjectURL(url);
          try { resolve(c.toDataURL("image/jpeg", 0.72)); } catch (e) { reject(e); }
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("img")); };
        img.src = url;
      });
    },
    async loadExtrasActual() {
      try { this.extrasActual = (await this.rpc("porra_get_extras", {})) || {}; } catch (e) { this.extrasActual = {}; }
      this.extrasActualEdit = Object.assign({ revelacion: "", decepcion: "", pichichi: "", asistente: "", portero: "", sidebets: {} }, this.extrasActual, { sidebets: Object.assign({}, this.extrasActual.sidebets || {}) });
    },
    async saveExtrasActual() {
      this.busy = true;
      try {
        await this.rpc("porra_set_extras", { p_pin: this.adminPin, p_extras: this.extrasActualEdit });
        this.extrasActual = JSON.parse(JSON.stringify(this.extrasActualEdit));
        this.toast("Respuestas de las especiales guardadas.");
        this.computeLive();
      } catch (e) { this.toast(this.errMsg(e), "err"); } finally { this.busy = false; }
    },
    rememberPool(pool) {
      this.recent = [{ code: pool.code, name: pool.name }].concat(this.recent.filter((r) => r.code !== pool.code)).slice(0, 6);
      localStorage.setItem("porra_recent", JSON.stringify(this.recent));
    },
    copyShare() {
      const url = location.origin + location.pathname + "?porra=" + this.pool.code;
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject())
        .then(() => this.toast("🔗 Enlace copiado. Pásalo a la familia por WhatsApp."))
        .catch(() => this.toast("Comparte este enlace: " + url));
    },

    // ---------- carga local de mi quiniela ----------
    loadMine(code) {
      let mine = null, draft = null;
      try { mine = JSON.parse(localStorage.getItem("porra_me_" + code) || "null"); } catch (e) {}
      try { draft = JSON.parse(localStorage.getItem("porra_draft_" + code) || "null"); } catch (e) {}
      const src = mine || draft;
      this.groups = emptyGroups(); this.thirds = []; this.bracket = {};
      this.extras = { revelacion: "", decepcion: "", pichichi: "", asistente: "", portero: "", sidebets: {} };
      this.me = { first: "", last: "", id: null, saved: false };
      if (mine) { this.me = { first: mine.first || "", last: mine.last || "", id: mine.id || null, saved: !!mine.id }; }
      else if (draft) { this.me.first = draft.first || ""; this.me.last = draft.last || ""; }
      if (src) {
        const p = src.picks || src;
        if (p.groups && Object.keys(p.groups).length) for (const L of D.GROUP_LETTERS) if (p.groups[L]) this.groups[L] = p.groups[L].slice();
        this.thirds = (p.thirds || []).slice();
        this.bracket = Object.assign({}, p.bracket || {});
        if (p.extras) this.extras = Object.assign({ revelacion: "", decepcion: "", pichichi: "", asistente: "", portero: "", sidebets: {} }, p.extras, { sidebets: Object.assign({}, p.extras.sidebets || {}) });
      }
      this.reconcileThirds(); this.rebuild();
    },
    persistDraft() {
      if (!this.pool) return;
      localStorage.setItem("porra_draft_" + this.pool.code, JSON.stringify({ groups: this.groups, thirds: this.thirds, bracket: this.bracket, extras: this.extras, first: this.me.first, last: this.me.last }));
    },

    // ---------- paso 1: grupos ----------
    moveTeam(L, idx, dir) {
      if (this.isLocked) return;
      const j = idx + dir; if (j < 0 || j > 3) return;
      const a = this.groups[L]; const t = a[idx]; a[idx] = a[j]; a[j] = t;
      this.groups[L] = a.slice();
      this.reconcileThirds(); this.rebuild(); this.persistDraft();
    },
    // ---------- paso 2: terceros ----------
    toggleThird(team) {
      if (this.isLocked) return;
      const i = this.thirds.indexOf(team);
      if (i >= 0) this.thirds.splice(i, 1);
      else if (this.thirds.length < 8) this.thirds.push(team);
      else return this.toast("Ya has elegido 8 terceros. Quita uno para cambiar.", "warn");
      this.rebuild(); this.persistDraft();
    },
    reconcileThirds() { this.thirds = this.thirds.filter((t) => D.GROUP_LETTERS.some((L) => this.groups[L][2] === t)); },

    // ---------- bracket ----------
    qualFromPicks() {
      const winners = {}, runnersUp = {}, thirdByGroup = {};
      for (const L of D.GROUP_LETTERS) { winners[L] = this.groups[L][0]; runnersUp[L] = this.groups[L][1]; thirdByGroup[L] = this.groups[L][2]; }
      const qualifiedThirdGroups = D.GROUP_LETTERS.filter((L) => this.thirds.includes(this.groups[L][2]));
      return { winners, runnersUp, thirdByGroup, qualifiedThirdGroups };
    },
    rebuild() {
      const q = this.qualFromPicks();
      const built = Eng.buildR32Teams(q);
      const tbm = {}; for (const m of D.R32) tbm[m.match] = built.teams[m.match];
      const b = this.bracket; const winnerOf = {};
      const valid = (mNum) => { const pair = tbm[mNum]; const w = b[mNum]; if (w && pair && (w === pair.a || w === pair.b)) return w; if (w !== undefined) delete b[mNum]; return null; };
      for (const m of D.R32) winnerOf[m.match] = valid(m.match);
      for (const list of [D.R16, D.QF, D.SF, [D.FINAL]]) for (const m of list) { tbm[m.match] = { a: winnerOf[m.a] || null, b: winnerOf[m.b] || null }; winnerOf[m.match] = valid(m.match); }
      const defs = [{ key: "r32", title: "1/16", list: D.R32 }, { key: "r16", title: "Octavos", list: D.R16 }, { key: "qf", title: "Cuartos", list: D.QF }, { key: "sf", title: "Semis", list: D.SF }, { key: "final", title: "Final", list: [D.FINAL] }];
      this._cols = defs.map((d) => ({ key: d.key, title: d.title, matches: d.list.map((m) => ({ match: m.match, a: tbm[m.match].a, b: tbm[m.match].b, aLabel: this.slotLabel(m.a), bLabel: this.slotLabel(m.b) })) }));
      this._champion = winnerOf[D.FINAL.match] || null;
    },
    // Qué le toca a un hueco vacío del cuadro (para que NUNCA salga "—" sin explicación).
    slotLabel(code) {
      if (code === "3rd") return "🥉 Mejor 3º";
      const s = String(code), i = s.indexOf("-");
      if (i < 0) return "Ganador";   // ronda posterior: depende de tu pick anterior
      const t = s.slice(0, i), g = s.slice(i + 1);
      return (t === "W" ? "1º Grupo " : t === "RU" ? "2º Grupo " : "") + g;
    },
    pickWinner(match, team) {
      if (!team || this.isLocked) return;
      this.bracket[match] = team; this.rebuild(); this.persistDraft();
      const c = this._cols[this.brRound];
      if (c && this.brRound < this._cols.length - 1 && c.matches.every((m) => this.bracket[m.match])) this.brRound++;
    },
    roundPicked(i) { const c = this._cols[i]; return c ? c.matches.filter((m) => this.bracket[m.match]).length : 0; },
    roundReady(i) { const c = this._cols[i]; return c ? c.matches.every((m) => m.a && m.b) : false; },
    brNext() { if (this.brRound < this._cols.length - 1) this.brRound++; },
    brPrev() { if (this.brRound > 0) this.brRound--; },
    get bracketCols() { return this._cols; },
    get myChampion() { return this._champion; },
    get bracketPicked() { let n = 0; for (const m of [...D.R32, ...D.R16, ...D.QF, ...D.SF, D.FINAL]) if (this.bracket[m.match]) n++; return n; },
    get bracketDone() { return this.bracketPicked === 31; },
    get prog() { return { groups: true, thirds: this.thirds.length === 8, bracket: this.bracketDone }; },

    goStep(n) {
      if (n >= 3 && this.thirds.length !== 8) { this.toast("Primero elige tus 8 mejores terceros.", "warn"); this.step = 2; return; }
      this.step = n; if (n === 3) this.rebuild(); this.persistDraft();
    },

    // ---------- asistente: guardar / navegación ----------
    get currentLetter() { return this.letters[this.gIdx]; },
    async _save(quiet) {
      if (this.isLocked) { if (!quiet) this.toast(ERRORS.POOL_LOCKED, "err"); return false; }
      if (!this.me.first.trim() || !this.me.last.trim()) { if (!quiet) this.toast(ERRORS.NAME_REQUIRED, "err"); return false; }
      this.busy = true;
      try {
        return await this._doSave();
      } catch (e) {
        if (((e && e.raw) || "").includes("PARTICIPANT_NOT_FOUND")) {
          try {
            const r = await this.rpc("porra_register", { p_code: this.pool.code, p_first: this.me.first, p_last: this.me.last });
            this.me.id = r.participant_id;
            return await this._doSave();
          } catch (e2) { if (!quiet) this.toast(this.errMsg(e2), "err"); return false; }
        }
        if (!quiet) this.toast(this.errMsg(e), "err");
        return false;
      } finally { this.busy = false; }
    },
    async _doSave() {
      const picks = { groups: this.groups, thirds: this.thirds, bracket: this.bracket, extras: this.extras };
      const res = await this.rpc("porra_save_entry", { p_code: this.pool.code, p_first: this.me.first, p_last: this.me.last, p_picks: picks, p_participant_id: this.me.id });
      this.me.id = res.participant_id; this.me.saved = true;
      this._persistMe();
      await this.loadEntries({ recompute: false });
      return true;
    },
    chooseNew() { this.chosenNew = true; },
    askClaim(e) { this.claimFromName = false; this.confirmClaim = e; },
    cancelClaim() { this.confirmClaim = null; this.claimFromName = false; },
    rejectClaim() { const fromName = this.claimFromName; this.confirmClaim = null; this.claimFromName = false; if (fromName) this.createNew(); },
    _sameName(e) { const n = (s) => (s || "").trim().toLowerCase(); return n(e.first_name) === n(this.me.first) && n(e.last_name) === n(this.me.last); },
    // Botón de la pantalla de nombre: reconoce SIEMPRE si ya existe (espera a que cargue la lista; el servidor también revisa)
    async submitName() {
      if (!this.me.first.trim() || !this.me.last.trim()) return this.toast("Pon tu nombre y tu apellido.", "warn");
      if (!this.entries.length) { try { await this.loadEntries({ recompute: false }); } catch (e) {} }
      const m = (this.entries || []).find((e) => this._sameName(e));
      if (m) { this.claimFromName = true; this.confirmClaim = m; return; }   // ya existe ese nombre → confirmar y recuperar
      await this.registerOrClaim();                                          // sin match → crear (el servidor reclama si lo hubiera)
    },
    async registerOrClaim() {
      if (!this.me.first.trim() || !this.me.last.trim()) return this.toast("Pon tu nombre y tu apellido.", "warn");
      this.busy = true;
      try {
        const res = await this.rpc("porra_register", { p_code: this.pool.code, p_first: this.me.first, p_last: this.me.last });
        this.me.id = res.participant_id; this.me.saved = true;
        if (res.claimed && res.picks && Object.keys(res.picks).length) this.applyPicks(res.picks);
        this._persistMe();
        this.chosenNew = false; this.phase = "hub";
        this.toast(res.claimed ? ("¡Hola de nuevo, " + this.me.first + "! He recuperado tu porra. 👌") : ("¡Estás dentro, " + this.me.first + "! Ya apareces en la clasificación. 🎉"));
      } catch (e) { this.toast(this.errMsg(e), "err"); }
      finally { this.busy = false; }
    },
    async createNew() {
      if (!this.me.first.trim() || !this.me.last.trim()) return this.toast("Pon tu nombre y tu apellido.", "warn");
      this.busy = true;
      try {
        const res = await this.rpc("porra_register", { p_code: this.pool.code, p_first: this.me.first, p_last: this.me.last, p_force_new: true });
        this.me.id = res.participant_id; this.me.saved = true;
        this._persistMe();
        this.chosenNew = false; this.phase = "hub";
        this.toast("¡Estás dentro, " + this.me.first + "! Ya apareces en la clasificación. 🎉");
      } catch (e) { this.toast(this.errMsg(e), "err"); }
      finally { this.busy = false; }
    },
    async doClaim() {
      const sel = this.confirmClaim; if (!sel) return;
      this.busy = true;
      try {
        const res = await this.rpc("porra_claim", { p_code: this.pool.code, p_participant_id: sel.id });
        this.me.id = res.participant_id; this.me.first = res.first_name; this.me.last = res.last_name; this.me.saved = true;
        if (res.picks && Object.keys(res.picks).length) this.applyPicks(res.picks);
        this._persistMe();
        this.confirmClaim = null; this.claimFromName = false; this.chosenNew = false; this.phase = "hub";
        this.toast("¡Hola de nuevo, " + this.me.first + "! He recuperado tu porra. 👌");
      } catch (e) { this.toast(this.errMsg(e), "err"); }
      finally { this.busy = false; }
    },
    applyPicks(p) {
      this.groups = emptyGroups();
      if (p.groups && Object.keys(p.groups).length) for (const L of D.GROUP_LETTERS) if (p.groups[L]) this.groups[L] = p.groups[L].slice();
      this.thirds = (p.thirds || []).slice();
      this.bracket = Object.assign({}, p.bracket || {});
      this.extras = Object.assign({ revelacion: "", decepcion: "", pichichi: "", asistente: "", portero: "", sidebets: {} }, p.extras || {}, { sidebets: Object.assign({}, (p.extras && p.extras.sidebets) || {}) });
      this.reconcileThirds(); this.rebuild();
    },
    _persistMe() {
      if (!this.pool) return;
      const picks = { groups: this.groups, thirds: this.thirds, bracket: this.bracket, extras: this.extras };
      try { localStorage.setItem("porra_me_" + this.pool.code, JSON.stringify({ id: this.me.id, first: this.me.first, last: this.me.last, picks })); } catch (e) {}
    },
    // panel "Mi porra" (resumen): navegación fácil + estado
    editSection(name) { this.rebuild(); if (name === "groups") this.gIdx = 0; if (name === "bracket") this.brRound = 0; this.phase = name; },
    goHub() { if (!this.isLocked) { this._save(true); this.toast("Guardado ✓"); } this.phase = "hub"; },
    get extrasFilled() { const e = this.extras, sb = e.sidebets || {}; return !!(e.revelacion || e.decepcion || e.pichichi || e.asistente || sb.hattrick || sb.dobleRoja); },
    get status() {
      const t = this.thirds.length, b = this.bracketPicked, e = this.extras, sb = e.sidebets || {}, missing = [];
      const exCount = ["revelacion", "decepcion", "pichichi", "asistente"].filter((k) => e[k]).length + ["hattrick", "dobleRoja"].filter((k) => sb[k]).length;
      const extrasDone = exCount === 6;
      const generalDone = t === 8 && b === 31;
      if (t !== 8) missing.push(t < 8 ? "elegir " + (8 - t) + " tercero" + (8 - t > 1 ? "s" : "") + " más" : "ajustar los terceros");
      if (b !== 31) missing.push("completar el cuadro (" + b + "/31)");
      if (!extrasDone) missing.push("las predicciones especiales (" + exCount + "/6)");
      return {
        thirds: t === 8, thirdsTxt: t + "/8", bracket: b === 31, bracketTxt: b + "/31",
        extras: extrasDone, extrasTxt: exCount + "/6", generalDone, complete: generalDone && extrasDone, missing,
      };
    },
    startGroups() { this.phase = "groups"; this.gIdx = 0; this.rebuild(); },
    nextGroup() { if (this.gIdx < 11) { this.gIdx++; this.persistDraft(); } else { this.phase = "thirds"; this._save(true); } },
    prevGroup() { if (this.gIdx > 0) this.gIdx--; else this.goHub(); },
    goBracketPhase() {
      if (this.thirds.length !== 8) return this.toast("Elige tus 8 mejores terceros.", "warn");
      this.rebuild(); this.brRound = 0; this.phase = "bracket"; this._save(true);
    },
    goExtras() { this.phase = "extras"; this._save(true); },
    toggleSideBet(key, val) { if (this.isLocked) return; this.extras.sidebets[key] = this.extras.sidebets[key] === val ? "" : val; this.persistDraft(); },
    async finishPorra() {
      const ok = await this._save(false);
      if (ok) { this.phase = "hub"; this.toast("💾 ¡Porra guardada!"); }
    },

    // ---------- cargar resultados / participantes ----------
    async loadResults() {
      const rows = await this.rpc("porra_get_results", {});
      const map = {}; (rows || []).forEach((r) => { map[r.match_code] = r; });
      this.results = map;
      // rEdit (grupos)
      const re = {}; for (const fx of D.GROUP_FIXTURES) { const r = map[fx.code]; re[fx.code] = { h: r ? r.home_score : null, a: r ? r.away_score : null }; }
      this.rEdit = re;
      this.refreshLiveBracket();
      // koEdit (eliminatorias) prefill
      const ke = {};
      for (const m of KO_META) {
        const r = map[String(m.match)];
        const pred = this.liveBr.teamsByMatch[m.match] || {};
        ke[m.match] = { home: r ? r.home_team || "" : (pred.a || ""), away: r ? r.away_team || "" : (pred.b || ""), h: r ? r.home_score : null, a: r ? r.away_score : null, winner: r ? r.winner || "" : "" };
      }
      this.koEdit = ke;
      this.computeLive();
    },
    async loadEntries(opts) {
      let entries;
      if (this.adminOk && this.adminPin) {
        try { const r = await this.rpc("porra_list_entries_admin", { p_code: this.pool.code, p_pin: this.adminPin }); entries = r.entries; }
        catch (e) { const res = await this.rpc("porra_list_entries", { p_code: this.pool.code }); entries = res.entries; }
      } else {
        const res = await this.rpc("porra_list_entries", { p_code: this.pool.code }); entries = res.entries;
      }
      this.entries = entries || [];
      this.entriesLoaded = true;
      if (!opts || opts.recompute !== false) this.recomputeRanking();
    },

    // ---------- ver la quiniela de un participante ----------
    get canViewPicks() { return !!this.pool; },   // quinielas públicas: todos ven la de todos
    get detRank() { return (this.ranked || []).find((r) => r.id === this.selectedId) || null; },
    toggleDetail(id) {
      const e = this.entries.find((x) => x.id === id);
      if (!e) return;
      if (!e.picks) { this.toast("Este participante aún no ha guardado su porra.", "warn"); return; }
      if (this.selectedId === id) { this.selectedId = null; this.det = null; }
      else { this.selectedId = id; this.det = this._computeDetail(id); this._ensurePhoto(id); }
    },
    async _ensurePhoto(id) {
      if (!id || this.photoCache[id] || !this.avatarOf(id)) return;
      try { const r = await this.rpc("porra_get_photo", { p_participant_id: id }); this.photoCache[id] = (r && r.photo) || this.avatarOf(id); } catch (e) {}
    },
    get detPhoto() { const id = this.selectedId; return id ? (this.photoCache[id] || this.avatarOf(id)) : null; },
    _computeDetail(id) {
      const e = this.entries.find((x) => x.id === id);
      if (!e || !e.picks) return null;
      const dp = Eng.derivePicks(e.picks);
      const oc = this.outcome || Eng.liveOutcome(this.results);
      const bd = Eng.scoreBreakdown(dp, oc, this.settings);
      const ex = Eng.scoreExtras(e.picks.extras, this.extrasActual, this.settings);
      const ord = (set) => [...set].sort((a, b) => D.es(a).localeCompare(D.es(b)));
      return {
        name: e.first_name + " " + e.last_name,
        champion: dp.champion, finalists: ord(dp.final), semis: ord(dp.semis),
        cuartos: ord(dp.cuartos), octavos: ord(dp.octavos),
        groups: e.picks.groups || {}, thirds: e.picks.thirds || [], bd,
        extras: e.picks.extras || {}, ex, total: bd.total + ex.total,
        bits: this._explainBits(e.picks, oc, this.settings, bd, ex),   // justificación punto a punto
        groupDetail: this._groupDetail(e.picks, oc, this.settings),    // grupos en directo (pred vs real + pts + riesgo)
      };
    },
    // Grupos en directo para el detalle: por grupo, su pronóstico vs la tabla real, puntos y riesgo.
    _groupDetail(picks, oc, S) {
      const es = (t) => D.es(t), flag = (t) => D.flag(t);
      const out = []; let seguro = 0, provisional = 0;
      for (const L of D.GROUP_LETTERS) {
        const act = oc.groupOrder[L]; const pred = picks.groups && picks.groups[L];
        const s = oc.standingsByGroup && oc.standingsByGroup[L];
        const played = s ? Math.round(s.reduce((a, t) => a + (t.pj || 0), 0) / 2) : 0;
        if (!act) { if (played > 0 && pred && pred.length === 4) out.push({ L, state: "waiting", played, pred: pred.map((t) => ({ es: es(t), flag: flag(t) })) }); continue; }
        if (!pred || pred.length !== 4) continue;
        const ri = oc.groupRank[L]; const firm = (i) => !ri || (ri[i] && ri[i].firm);
        const dT = (t) => { const idx = act.indexOf(t); return idx < 0 ? false : (ri ? !!(ri[idx] && ri[idx].worstRank <= 1) : idx <= 1); };
        const complete = !!(s && s._complete);
        const gk = [S.g1, S.g2, S.g3, (S.g4 || 0)]; let pts = 0;
        const rows = pred.map((t, i) => { const hit = (t === act[i] && firm(i)); if (hit) pts += gk[i]; return { es: es(t), flag: flag(t), hit, pts: hit ? gk[i] : 0 }; });
        let qual = 0; const qualNames = [];
        if (pred[0] && dT(pred[0])) { qual += S.qual; qualNames.push(es(pred[0])); }
        if (pred[1] && dT(pred[1])) { qual += S.qual; qualNames.push(es(pred[1])); }
        pts += qual;
        const actual = act.map((t, i) => ({ es: es(t), flag: flag(t), firm: firm(i) }));
        if (complete) seguro += pts; else provisional += pts;
        out.push({ L, state: complete ? "done" : "live", played, pts, qual, qualNames, rows, actual, complete });
      }
      return { groups: out, seguro, provisional };
    },
    refreshLiveBracket() {
      const standings = {}; let complete = true;
      for (const L of D.GROUP_LETTERS) { const s = Eng.groupStandings(L, this.results, false, null); standings[L] = s; if (!s._complete) complete = false; }
      const wOf = (n) => { const r = this.results[n] || this.results[String(n)]; return r && r.played && r.winner ? r.winner : null; };
      const tbm = {};
      let built = null;
      if (complete) { try { built = Eng.buildR32Teams(Eng.computeQualifiers(standings)); } catch (e) {} }
      const stored = (n) => this.results[String(n)];
      for (const m of D.R32) { const r = stored(m.match); tbm[m.match] = r && r.home_team ? { a: r.home_team, b: r.away_team } : (built ? built.teams[m.match] : { a: null, b: null }); }
      const winnerOf = {}; for (const m of D.R32) winnerOf[m.match] = wOf(m.match);
      for (const list of [D.R16, D.QF, D.SF, [D.FINAL]]) for (const m of list) {
        const r = stored(m.match);
        tbm[m.match] = { a: r && r.home_team ? r.home_team : (winnerOf[m.a] || null), b: r && r.away_team ? r.away_team : (winnerOf[m.b] || null) };
        winnerOf[m.match] = wOf(m.match);
      }
      this.liveBr = { teamsByMatch: tbm, winnerOf, complete };
    },
    get koReady() { return this.liveBr.complete; },
    get liveBracketCols() {
      const defs = [{ key: "r32", title: "1/16", list: D.R32 }, { key: "r16", title: "Octavos", list: D.R16 }, { key: "qf", title: "Cuartos", list: D.QF }, { key: "sf", title: "Semis", list: D.SF }, { key: "final", title: "Final", list: [D.FINAL] }];
      return defs.map((d) => ({ key: d.key, title: d.title, matches: d.list.map((m) => ({ match: m.match, a: this.liveBr.teamsByMatch[m.match] ? this.liveBr.teamsByMatch[m.match].a : null, b: this.liveBr.teamsByMatch[m.match] ? this.liveBr.teamsByMatch[m.match].b : null })) }));
    },
    koWinner(match) { return this.liveBr.winnerOf[match] || null; },
    get koAdminList() { return KO_META; },

    liveTable(L) { return (this.outcome && this.outcome.standingsByGroup && this.outcome.standingsByGroup[L]) || Eng.groupStandings(L, this.results, false, null); },

    // ---------- Vista previa del cuadro post-grupos (BONUS) — SOLO admin, SOLO lectura ----------
    buildKoPreview() {
      const standings = {};
      for (const L of D.GROUP_LETTERS) standings[L] = Eng.groupStandings(L, this.results, false, null);
      const complete = D.GROUP_LETTERS.filter((L) => standings[L]._complete).length;
      let teams = null;
      try { teams = Eng.buildR32Teams(Eng.computeQualifiers(standings)).teams; } catch (e) { teams = null; }
      let chances = {};
      try { chances = Eng.monteCarloTeams(this.results, 3000).byTeam; } catch (e) { chances = {}; }
      const statusOf = (t) => {
        if (!t) return null;
        const c = chances[t]; if (!c) return { k: "maybe", q: null };
        if (c.qualify >= 0.9999) return { k: "in", q: c.qualify };
        if (c.qualify <= 0.0001) return { k: "out", q: c.qualify };
        return { k: "maybe", q: c.qualify };
      };
      const cell = (t) => ({ team: t, es: t ? D.es(t) : "?", flag: t ? D.flag(t) : "", st: statusOf(t) });
      const cruces = D.R32.map((m, i) => { const tm = teams ? teams[m.match] : { a: null, b: null }; return { n: i + 1, a: cell(tm.a), b: cell(tm.b) }; });
      let nIn = 0, nOut = 0, nMaybe = 0;
      for (const t of [].concat(...D.GROUP_LETTERS.map((L) => D.GROUPS[L]))) { const s = statusOf(t); if (s.k === "in") nIn++; else if (s.k === "out") nOut++; else nMaybe++; }
      this.koPreview = { cruces, complete, total: D.GROUP_LETTERS.length, nIn, nOut, nMaybe, ready: complete === D.GROUP_LETTERS.length };
    },
    openKoPreview() {
      if (!this.adminOk) return;
      this.buildKoPreview();
      this.koPreviewShow = !this.koPreviewShow;
    },

    // ---------- Pestaña "27 de junio": camino a la final (1/16 → campeón) ----------
    get ko27DaysLeft() {
      try { const now = new Date(); const t = new Date("2026-06-27T00:00:00"); return Math.ceil((t - now) / 86400000); } catch (e) { return 0; }
    },
    buildKo27() {
      this.buildKoPreview();
      const kp = this.koPreview || { cruces: [], ready: false, complete: 0, total: 12, nIn: 0, nOut: 0, nMaybe: 48 };
      const pos = (list) => { const o = {}; list.forEach((m, i) => (o[m.match] = i + 1)); return o; };
      const i32 = pos(D.R32), i16 = pos(D.R16), iQF = pos(D.QF), iSF = pos(D.SF);
      const rounds = [
        { key: "r32", title: "1/16", sub: "dieciseisavos", seeded: true,
          matches: kp.cruces.map((c) => ({ n: c.n, a: c.a, b: c.b })) },
        { key: "r16", title: "Octavos", sub: "16 → 8", seeded: false,
          matches: D.R16.map((m, i) => ({ n: i + 1, fa: "Gd. 1/16 #" + i32[m.a], fb: "Gd. 1/16 #" + i32[m.b] })) },
        { key: "qf", title: "Cuartos", sub: "8 → 4", seeded: false,
          matches: D.QF.map((m, i) => ({ n: i + 1, fa: "Gd. Octavos #" + i16[m.a], fb: "Gd. Octavos #" + i16[m.b] })) },
        { key: "sf", title: "Semis", sub: "4 → 2", seeded: false,
          matches: D.SF.map((m, i) => ({ n: i + 1, fa: "Gd. Cuartos #" + iQF[m.a], fb: "Gd. Cuartos #" + iQF[m.b] })) },
        { key: "final", title: "Final", sub: "2 → 🏆", seeded: false,
          matches: [{ n: 1, fa: "Gd. Semis #" + iSF[D.FINAL.a], fb: "Gd. Semis #" + iSF[D.FINAL.b] }] },
      ];
      this.ko27 = { rounds, ready: kp.ready, complete: kp.complete, total: kp.total, nIn: kp.nIn, nOut: kp.nOut, nMaybe: kp.nMaybe };
    },
    openKo27() { this.tab = "ko27"; this.selectedId = null; this.det = null; this.buildKo27(); this.loadBracket2(); },

    // ¿se puede rellenar ya? grupos terminados + dentro de plazo + estás dentro de la porra
    get ko27Editable() {
      if (!this.me || !this.me.id) return false;
      if (!this.ko27 || !this.ko27.ready) return false;
      try { return new Date() < new Date("2026-06-28T16:00:00"); } catch (e) { return true; }
    },
    loadBracket2() {
      const e = this.myEntry;
      this.bracket2 = (e && e.picks && e.picks.bracket2) ? Object.assign({}, e.picks.bracket2) : (this.bracket2 || {});
      this.rebuild2();
    },
    // Reconstruye el 2º cuadro SEMBRADO desde los clasificados REALES (no desde tu predicción de grupos).
    rebuild2() {
      const standings = {};
      for (const L of D.GROUP_LETTERS) standings[L] = Eng.groupStandings(L, this.results, false, null);
      let teams = null;
      try { teams = Eng.buildR32Teams(Eng.computeQualifiers(standings)).teams; } catch (e) { teams = null; }
      const tbm = {}; for (const m of D.R32) tbm[m.match] = teams ? teams[m.match] : { a: null, b: null };
      const b = this.bracket2; const winnerOf = {};
      const valid = (mNum) => { const pair = tbm[mNum]; const w = b[mNum]; if (w && pair && (w === pair.a || w === pair.b)) return w; if (w !== undefined) delete b[mNum]; return null; };
      for (const m of D.R32) winnerOf[m.match] = valid(m.match);
      for (const list of [D.R16, D.QF, D.SF, [D.FINAL]]) for (const m of list) { tbm[m.match] = { a: winnerOf[m.a] || null, b: winnerOf[m.b] || null }; winnerOf[m.match] = valid(m.match); }
      const cell = (t) => ({ team: t, es: t ? D.es(t) : null, flag: t ? D.flag(t) : "" });
      const defs = [{ key: "r32", title: "1/16", list: D.R32 }, { key: "r16", title: "Octavos", list: D.R16 }, { key: "qf", title: "Cuartos", list: D.QF }, { key: "sf", title: "Semis", list: D.SF }, { key: "final", title: "Final", list: [D.FINAL] }];
      this._cols2 = defs.map((d) => ({ key: d.key, title: d.title, matches: d.list.map((m, i) => ({ n: i + 1, match: m.match, a: cell(tbm[m.match].a), b: cell(tbm[m.match].b), pick: this.bracket2[m.match] || null })) }));
      this._champion2 = winnerOf[D.FINAL.match] || null;
    },
    get bracketCols2() { return this._cols2; },
    get activeCol2() { return (this._cols2 || []).find((c) => c.key === this.ko27Round) || null; },
    get myChampion2() { return this._champion2; },
    get bracket2Picked() { let n = 0; for (const m of [...D.R32, ...D.R16, ...D.QF, ...D.SF, D.FINAL]) if (this.bracket2[m.match]) n++; return n; },
    get bracket2Done() { return this.bracket2Picked === 31; },
    pickWinner2(match, team) {
      if (!team || !this.ko27Editable) return;
      this.bracket2[match] = team; this.ko27Saved = false; this.rebuild2();
      const order = ["r32", "r16", "qf", "sf", "final"]; const idx = order.indexOf(this.ko27Round);
      const col = this._cols2[idx];
      if (col && idx < order.length - 1 && col.matches.every((m) => this.bracket2[m.match])) this.ko27Round = order[idx + 1];
    },
    async saveBracket2() {
      if (!this.ko27Editable || !this.me.id || this.ko27Busy) return;
      this.ko27Busy = true;
      try {
        await this.rpc("porra_set_bracket2", { p_code: this.pool.code, p_participant_id: this.me.id, p_bracket2: this.bracket2 });
        const e = this.myEntry; if (e) { e.picks = e.picks || {}; e.picks.bracket2 = Object.assign({}, this.bracket2); }
        this.ko27Saved = true;
        this.toast("✅ ¡Camino guardado! Sumarás los puntos bonus según avance el cuadro.");
        if (this.recomputeRanking) this.recomputeRanking();
      } catch (err) { this.toast(this.errMsg ? this.errMsg(err) : "No se pudo guardar", "err"); }
      finally { this.ko27Busy = false; }
    },

    // ---------- clasificación + probabilidades ----------
    openLeaderboard() { this.tab = "leaderboard"; this.selectedId = null; this.det = null; this.loadBoard(); },
    openQuinielas() { this.tab = "quinielas"; this.selectedId = null; this.det = null; this.loadEntries({ recompute: false }); if (!this.ranked.length) this.loadBoard(); },
    // tarjetas para el apartado Quinielas (campeón + estado de cada participante)
    get quinielaCards() {
      const rankMap = {}; (this.ranked || []).forEach((r) => { rankMap[r.id] = r; });
      const arr = (this.entries || []).map((e) => {
        let champion = null;
        if (e.picks) { try { champion = Eng.derivePicks(e.picks).champion; } catch (x) {} }
        const rr = rankMap[e.id];
        return { id: e.id, name: (e.first_name + " " + e.last_name).trim(), first_name: e.first_name, complete: rr ? rr.complete !== false : !!e.picks, hasPicks: !!e.picks, champion, isMe: e.id === this.me.id };
      });
      arr.sort((a, b) => (b.hasPicks - a.hasPicks) || a.name.localeCompare(b.name));
      return arr;
    },
    async loadBoard() {
      if (!this.pool) return;
      this.probBusy = true;
      let ok = false;
      try {
        const { data, error } = await sb.functions.invoke("porra-prob", { body: { code: this.pool.code } });
        if (!error && data && !data.error && Array.isArray(data.rows)) {
          this.usingServerBoard = true;
          this.boardLocked = !!data.locked;
          this.simN = data.sims || 4000; this.lastProb = true;
          this.ranked = data.rows.map((r) => ({ id: r.id, first_name: r.first_name, last_name: r.last_name, points: r.points, win: r.win, podium: r.podium, avg: r.avg, complete: r.complete }));
          this.boardIncomplete = data.incomplete || 0;
          ok = true;
        }
      } catch (e) { /* fallback abajo */ }
      // marcadores en vivo + picks (no deben afectar a la tabla del servidor)
      try { await this.loadResults(); if (ok) await this.loadEntries({ recompute: false }); } catch (e) {}
      if (!ok) { this.usingServerBoard = false; try { await this.refreshBoard(); } catch (e) {} }
      try { await this.fetchEspn(false); } catch (e) {}   // refresca outcome + la explicación de puntos
      this.explain = this.buildExplain();
      this.scoringStatus = this.computeScoringStatus();
      this.applyTiebreak();   // reordena empates por el sistema de puntuación
      this.probBusy = false;
    },
    openResults() { this.tab = "results"; this.fetchEspn(false).then(() => this.loadForecasts()).catch(() => {}); this.loadEntries({ recompute: false }); },
    openGoals() { this.tab = "goals"; this.fetchEspn(false).then(() => this.loadMatchData()).catch(() => {}); this.loadEntries({ recompute: false }).catch(() => {}); },
    async refreshBoard() { await this.loadResults(); await this.loadEntries(); },
    recomputeRanking() {
      if (this.usingServerBoard) { if (this.selectedId) this.det = this._computeDetail(this.selectedId); return; }
      const oc = this.outcome || Eng.liveOutcome(this.results); const S = this.settings;
      const arr = this.entries.map((e) => {
        let base = 0, extra = 0;
        if (e.picks) {
          try { base = Eng.scoreEntry(Eng.derivePicks(e.picks), oc, S); } catch (x) {}
          try { extra = Eng.scoreExtras(e.picks.extras, this.extrasActual, S).total; } catch (x) {}
        }
        const pr = this.probData[e.id];
        return Object.assign({}, e, { points: base + extra, basePoints: base, extraPts: extra, win: pr ? pr.win : null, podium: pr ? pr.podium : null, avg: pr ? pr.avg : null });
      });
      this.ranked = arr;
      this.applyTiebreak();
      if (this.selectedId) this.det = this._computeDetail(this.selectedId);
    },
    // Desempate basado en el SISTEMA DE PUNTUACIÓN: empate a puntos -> más en eliminatorias
    // (el cuadro), luego más en especiales, luego más en grupos (y al final, alfabético).
    _tbKeys(r) {
      const e = (this.entries || []).find((x) => x.id === r.id);
      if (!e || !e.picks) return { cuadro: 0, especiales: 0, grupos: 0 };
      const oc = this.outcome || Eng.liveOutcome(this.results); const S = this.settings;
      try {
        const bd = Eng.scoreBreakdown(Eng.derivePicks(e.picks), oc, S);
        const ex = Eng.scoreExtras(e.picks.extras, this.extrasActual, S);
        return { cuadro: bd.octavos + bd.cuartos + bd.semis + bd.final + bd.campeon, especiales: ex.total, grupos: bd.grupos };
      } catch (x) { return { cuadro: 0, especiales: 0, grupos: 0 }; }
    },
    applyTiebreak() {
      if (!this.ranked || !this.ranked.length) return;
      this.ranked.forEach((r) => { r._tb = this._tbKeys(r); });
      this.ranked.sort((a, b) => (b.points - a.points) || (b._tb.cuadro - a._tb.cuadro) || (b._tb.especiales - a._tb.especiales) || (b._tb.grupos - a._tb.grupos) || ((b.win || 0) - (a.win || 0)) || String(a.last_name || "").localeCompare(String(b.last_name || "")));
      const reason = (u, m) => (u.cuadro !== m.cuadro ? "eliminatorias" : u.especiales !== m.especiales ? "especiales" : u.grupos !== m.grupos ? "grupos" : "orden alfabético");
      for (let i = 0; i < this.ranked.length; i++) {
        const r = this.ranked[i], up = this.ranked[i - 1], dn = this.ranked[i + 1];
        r._tied = !!((up && up.points === r.points) || (dn && dn.points === r.points));
        r._tieReason = (up && up.points === r.points) ? reason(up._tb, r._tb) : (dn && dn.points === r.points ? reason(r._tb, dn._tb) : "");
      }
      this.computeBriefing();
    },
    // Briefing "qué ha cambiado desde tu última visita": posiciones y puntos (sobre participantes reales).
    computeBriefing() {
      const code = this.pool && this.pool.code; if (!code) return;
      const real = (this.ranked || []).filter((r) => !this.isGuest(r));
      if (!real.length) return;
      if (this._briefBaseline === undefined) {
        try { this._briefBaseline = JSON.parse(localStorage.getItem("porra_brief_" + code) || "null"); } catch (e) { this._briefBaseline = null; }
      }
      const base = this._briefBaseline;
      const nm = (r) => ((r.first_name || "") + " " + (r.last_name || "")).trim();
      const curById = {}; real.forEach((r, i) => { curById[r.id] = { pos: i + 1, points: r.points, name: nm(r) }; });
      try { localStorage.setItem("porra_brief_" + code, JSON.stringify({ ts: Date.now(), byId: curById })); } catch (e) {}
      if (!base || !base.byId) { this.briefing = null; return; }   // primera vez: sin referencia
      const moves = [], gains = [];
      real.forEach((r, i) => {
        const o = base.byId[r.id]; if (!o) return;
        const np = i + 1, posDelta = o.pos - np, ptsDelta = r.points - o.points;
        const isMe = !!(this.me && r.id === this.me.id);
        if (posDelta !== 0) moves.push({ id: r.id, name: nm(r), isMe, from: o.pos, to: np, up: posDelta > 0, n: Math.abs(posDelta) });
        if (ptsDelta !== 0) gains.push({ id: r.id, name: nm(r), isMe, d: ptsDelta });
      });
      let leader = null;
      const oldLeaderId = Object.keys(base.byId).find((k) => base.byId[k].pos === 1);
      if (oldLeaderId && real[0] && oldLeaderId !== real[0].id && base.byId[real[0].id]) leader = { name: nm(real[0]) };
      const newcomers = real.filter((r) => !base.byId[r.id]).map((r) => nm(r));
      moves.sort((a, b) => b.n - a.n);
      gains.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
      let mine = null;
      const meRow = real.find((r) => this.me && r.id === this.me.id);
      if (meRow && base.byId[meRow.id]) { const o = base.byId[meRow.id]; const np = real.indexOf(meRow) + 1; mine = { posDelta: o.pos - np, ptsDelta: meRow.points - o.points, from: o.pos, to: np, name: nm(meRow) }; }
      const ms = Date.now() - (base.ts || Date.now()); const mins = Math.round(ms / 60000);
      const ago = mins < 1 ? "hace un momento" : mins < 60 ? ("hace " + mins + " min") : mins < 1440 ? ("hace " + Math.round(mins / 60) + " h") : ("hace " + Math.round(mins / 1440) + " día" + (Math.round(mins / 1440) === 1 ? "" : "s"));
      const changed = !!(moves.length || gains.length || leader || newcomers.length);
      this.briefing = { ago, changed, leader, moves: moves.slice(0, 6), gains: gains.slice(0, 6), mine, newcomers: newcomers.slice(0, 4), nMoves: moves.length, nGains: gains.length };
    },
    runProbabilities() {
      const S = this.settings;
      const mcEntries = this.entries.filter((e) => e.picks).map((e) => ({ id: e.id, picks: Eng.derivePicks(e.picks), extraPts: Eng.scoreExtras(e.picks.extras, this.extrasActual, S).total }));
      if (!mcEntries.length) return this.toast("No hay quinielas guardadas todavía.", "warn");
      this.simN = mcEntries.length > 60 ? 1500 : mcEntries.length > 30 ? 2500 : 4000;
      const simResults = (this.outcome && this.outcome.groupMap) ? this.outcome.groupMap : this.results;
      this.probBusy = true;
      setTimeout(() => {
        try {
          const mc = Eng.monteCarlo(mcEntries, simResults, this.simN, S, Math.random);
          this.probData = mc.byId; this.lastProb = true; this.recomputeRanking();
          this.toast("🎲 Probabilidades actualizadas (" + this.simN.toLocaleString("es") + " simulaciones).");
        } catch (e) { this.toast("Error simulando: " + e.message, "err"); }
        finally { this.probBusy = false; }
      }, 60);
    },

    // ---------- admin ----------
    async checkAdmin() {
      if (!this.adminPin) return;
      this.busy = true;
      try { const ok = await this.rpc("porra_check_master", { p_pin: this.adminPin }); if (ok) { this.adminOk = true; this.toast("🔓 Acceso admin concedido."); } else this.toast(ERRORS.BAD_PIN, "err"); }
      catch (e) { this.toast(this.errMsg(e), "err"); } finally { this.busy = false; }
    },
    async toggleLock() {
      this.busy = true;
      try {
        await this.rpc("porra_lock_pool", { p_code: this.pool.code, p_pin: this.adminPin, p_locked: !this.pool.locked, p_lock_at: null });
        const pool = await this.rpc("porra_get_pool", { p_code: this.pool.code }); this.pool = pool;
        this.toast(pool.locked ? "🔒 Porra cerrada. ¡Que empiece el Mundial!" : "🔓 Porra reabierta.");
        await this.loadEntries();
      } catch (e) { this.toast(this.errMsg(e), "err"); } finally { this.busy = false; }
    },
    async saveSettings() {
      this.busy = true;
      try { await this.rpc("porra_set_settings", { p_code: this.pool.code, p_pin: this.adminPin, p_settings: this.settings }); this.pool.settings = Object.assign({}, this.settings); this.toast("Puntuación guardada."); this.recomputeRanking(); }
      catch (e) { this.toast(this.errMsg(e), "err"); } finally { this.busy = false; }
    },
    async saveGroupResult(fx) {
      const e = this.rEdit[fx.code];
      if (e.h == null || e.a == null || e.h === "" || e.a === "") return this.toast("Pon el marcador completo.", "warn");
      this.busy = true;
      try {
        await this.rpc("porra_set_result", { p_pin: this.adminPin, p_match_code: fx.code, p_stage: "group", p_home_team: fx.home, p_away_team: fx.away, p_home_score: Number(e.h), p_away_score: Number(e.a), p_winner: null, p_played: true });
        this.toast(`Guardado: ${D.es(fx.home)} ${e.h}-${e.a} ${D.es(fx.away)}`);
        await this.loadResults();
      } catch (er) { this.toast(this.errMsg(er), "err"); } finally { this.busy = false; }
    },
    async saveKoResult(m) {
      const e = this.koEdit[m.match];
      if (!e.home || !e.away) return this.toast("Indica los dos equipos del cruce.", "warn");
      if (!e.winner) return this.toast("Indica quién pasa de ronda.", "warn");
      this.busy = true;
      try {
        await this.rpc("porra_set_result", { p_pin: this.adminPin, p_match_code: String(m.match), p_stage: m.stageKey, p_home_team: e.home, p_away_team: e.away, p_home_score: e.h == null || e.h === "" ? null : Number(e.h), p_away_score: e.a == null || e.a === "" ? null : Number(e.a), p_winner: e.winner, p_played: true });
        this.toast(`M${m.match} guardado · pasa ${D.es(e.winner)}`);
        await this.loadResults();
      } catch (er) { this.toast(this.errMsg(er), "err"); } finally { this.busy = false; }
    },
    async deleteEntry(e) {
      if (!confirm(`¿Borrar la quiniela de ${e.first_name} ${e.last_name}?`)) return;
      this.busy = true;
      try { await this.rpc("porra_delete_entry", { p_code: this.pool.code, p_pin: this.adminPin, p_participant_id: e.id }); this.toast("Quiniela borrada."); await this.loadEntries(); }
      catch (er) { this.toast(this.errMsg(er), "err"); } finally { this.busy = false; }
    },
    async autoSync() {
      this.syncBusy = true; this.syncMsg = "";
      try {
        const { data, error } = await sb.functions.invoke("porra-sync", { body: { pin: this.adminPin } });
        if (error) throw error;
        this.syncMsg = (data && data.message) || "Sincronizado.";
        await this.loadResults();
      } catch (e) {
        this.syncMsg = "Sincronizador automático no configurado todavía — mete los resultados a mano aquí abajo (siempre funciona).";
      } finally { this.syncBusy = false; }
    },
  };
};
