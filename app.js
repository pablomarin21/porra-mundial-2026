/* ============================================================================
   PORRA MUNDIAL 2026 — App (Alpine + Supabase)
   ========================================================================== */
const SUPA_URL = "https://enzbrjqdxurrwdpoezxr.supabase.co";
const SUPA_KEY = "sb_publishable_TFWre0qvDBGKWvzc5D4Mzg_-FLySJ-w";
const sb = window.supabase.createClient(SUPA_URL, SUPA_KEY);
const D = window.PORRA_DATA;
const Eng = window.PorraEngine;

// Notificaciones push (clave pública VAPID — segura de exponer)
const VAPID_PUBLIC = "BC3GZiF1s-TvML2SMYI20INg-qpugMyGZVWjtMzIrVvSmt6o-s4MNE2UA8blaB3RPEq3xmZ0OZPaNyWxQ9ATpZU";
function urlB64ToUint8Array(b) {
  const pad = "=".repeat((4 - (b.length % 4)) % 4);
  const base64 = (b + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64); const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const ALL_TEAMS = [].concat(...D.GROUP_LETTERS.map((L) => D.GROUPS[L]));

// ---- Rendimiento (móvil): caches a nivel de MÓDULO, fuera del proxy reactivo ----
// Intl.DateTimeFormat es muy caro de construir: con ~104 partidos × varios getters
// por render se creaban cientos por actualización. Un formatter por (locale+opts).
const _DTF = {};
function dtf(locale, opts) {
  const k = locale + JSON.stringify(opts);
  return _DTF[k] || (_DTF[k] = new Intl.DateTimeFormat(locale, opts));
}
// Memo de getters pesados (liveMatches/koToday). Vive fuera de Alpine a propósito:
// escribir un caché DENTRO del objeto reactivo desde un getter crea dependencias
// sobre el propio caché y puede provocar bucles de re-render.
const _MEMO = { lmKey: null, lmVal: null, ktKey: null, ktVal: null };
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
    teamProbs: {}, teamProbsSims: 0, thirdSlotProbs: {}, scorers: [], assisters: [], porteros: [], _matchCache: {}, assistsLoading: false, assistsLoaded: false, porteroDraft: "", porteroSaving: false,
    phase: "welcome", gIdx: 0, chosenNew: false, confirmClaim: null, claimFromName: false,
    wmode: "choose", entriesLoaded: false,
    // estado porra / jugador
    pool: null, me: { first: "", last: "", id: null, saved: false },
    joinCode: "", newPool: { name: "", code: "", pin: "" }, recent: [],
    // ui
    toasts: [], busy: false, probBusy: false, syncBusy: false, syncMsg: "",
    showInstall: false, deferredPrompt: null,
    pushSupported: false, pushOn: false, pushBusy: false, notifBusy: false, notifTitle: "", notifBody: "", showNotifModal: false,
    // pronósticos
    groups: emptyGroups(), thirds: [], bracket: {}, _cols: [], _champion: null,
    extras: { revelacion: "", decepcion: "", pichichi: "", asistente: "", portero: "", sidebets: {} },
    letters: D.GROUP_LETTERS, allTeams: ALL_TEAMS.slice().sort((a, b) => D.es(a).localeCompare(D.es(b))),
    sideBets: D.SIDE_BETS,
    // en vivo (ESPN) + cierre automático
    espnEvents: [], espnAt: 0, liveBusy: false, nowTs: 0, outcome: null, extrasActual: {}, _espnTimer: null, explain: null, scoringStatus: null, forecasts: {}, forecastsAt: 0, pathAnalysis: null, pathLoading: false, top3Analysis: null, top3Loading: false, top3Who: "", cmpA: "", cmpB: "", cmpGroup: "",
    // Solo display: marcas de tiempo "acaba de marcar" / "acaba de terminar" para animar marcadores.
    scoreFlash: {}, finFlash: {}, _scoreCache: null,
    extrasActualEdit: { revelacion: "", decepcion: "", pichichi: "", asistente: "", portero: "", sidebets: {} },
    // datos
    entries: [], ranked: [], results: {}, rEdit: defaultREdit(), koEdit: defaultKoEdit(), liveBr: { teamsByMatch: {}, winnerOf: {}, complete: false },
    koPreview: null, koPreviewShow: false, ko27: null, ko27Round: "r32",
    bracket2: {}, _cols2: [], _mirror2: null, _champion2: null, ko27Busy: false, ko27Saved: false, viewId2: null,
    ko27Mode: "mine", _mirrorReal: null, _realChampion: null, _realCols: null,
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
    lastProb: false, simN: 0, probData: {}, briefing: null, _briefBaseline: undefined, parte: null,
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
    // ---- ¿por qué sube/baja cada uno? grupos (ya fijos) vs eliminatorias (donde se decide ahora) ----
    get movements() {
      if (!this.entries || !this.entries.length) return [];
      // Memo: re-puntuaba a toda la familia por jornada en CADA binding (2 efectos x refresco).
      const memoKey = "mv|" + this.espnAt + "|" + this.entries.length + "|" + (this.ranked || []).map((r) => r.id + ":" + r.points).join(",");
      if (_MEMO.mvKey === memoKey && _MEMO.mvVal) return _MEMO.mvVal;
      const oc = this.outcome || Eng.liveOutcome(this.results); const S = this.settings;
      let H = { traj: {} }; try { H = this.buildParteHistory(oc, S); } catch (e) {}
      const real = this.entries.filter((e) => e.picks && !this.isGuest(e));
      const rows = real.map((e) => {
        let bd = { grupos: 0, terceros: 0, octavos: 0, cuartos: 0, semis: 0, final: 0, campeon: 0, bonus: 0 }, ex = 0;
        try { const dp = Eng.derivePicks(e.picks); bd = Eng.scoreBreakdown(dp, oc, S); ex = Eng.scoreExtras(e.picks.extras, this.extrasActual, S).total; } catch (x) {}
        const grupos = bd.grupos + bd.terceros;
        const ko = bd.octavos + bd.cuartos + bd.semis + bd.final + bd.campeon + bd.bonus;
        const t = (H.traj && H.traj[e.id]) || [];
        const peak = t.length ? Math.min.apply(null, t.map((x) => x.pos)) : null;
        return { id: e.id, name: this._shortName(e), isMe: !!(this.me && e.id === this.me.id), grupos, ko, ex, total: grupos + ko + ex, peak };
      });
      const n = rows.length;
      const rankBy = (key) => { const s = rows.slice().sort((a, b) => b[key] - a[key] || a.name.localeCompare(b.name)); const m = {}; s.forEach((r, i) => (m[r.id] = i + 1)); return m; };
      const posG = rankBy("grupos"), posT = rankBy("total"), posKO = rankBy("ko");
      const out = rows.map((r) => {
        const posGroups = posG[r.id], posNow = posT[r.id], koRank = posKO[r.id], delta = posGroups - posNow;
        const dir = delta > 0 ? "up" : (delta < 0 ? "down" : "flat");
        const koStrong = koRank <= 2, koWeak = koRank >= n - 1;
        const peakTxt = (r.peak && r.peak <= 2 && posNow >= 3) ? ("Llegaste a ir " + r.peak + "º. ") : "";
        let reason;
        if (dir === "down") {
          reason = peakTxt + "Clavaste los grupos (" + r.grupos + " pts), pero en las ELIMINATORIAS " + (koWeak ? "eres de los que MENOS suma" : "sumas poco") + " (" + r.ko + " pts)" + (r.ex === 0 ? " y no has pillado ninguna especial" : "") + ". Los que iban por detrás están remontando por el cuadro y te adelantan.";
        } else if (dir === "up") {
          reason = "Estás " + (koStrong ? "de los que MÁS suma" : "sumando bien") + " en las ELIMINATORIAS (" + r.ko + " pts)" + (r.ex ? " y pillaste especiales (+" + r.ex + ")" : "") + " → remontas puestos.";
        } else if (posNow === 1) {
          reason = "Aguantas el 1º: tu ventaja en grupos (" + r.grupos + " pts) todavía nadie la alcanza. Ojo, en el KO se puede recortar.";
        } else if (posNow === n) {
          reason = "Sigues último: tus grupos (" + r.grupos + " pts) te dejaron lejos; aunque sumes en el KO (" + r.ko + ")" + (r.ex ? " y especiales (+" + r.ex + ")" : "") + " no alcanzas... de momento.";
        } else {
          reason = "Te mantienes " + posNow + "º: " + (koStrong ? "sigues sumando en el cuadro (" + r.ko + ")" : "grupos sólidos (" + r.grupos + "), KO discreto (" + r.ko + ")") + ".";
        }
        return { id: r.id, name: r.name, isMe: r.isMe, grupos: r.grupos, ko: r.ko, ex: r.ex, total: r.total, posGroups, posNow, koRank, delta, dir, reason };
      }).sort((a, b) => a.posNow - b.posNow);
      _MEMO.mvKey = memoKey; _MEMO.mvVal = out;
      return out;
    },
    // "la gracia": cuánto queda por jugar (por jugador) vs lo que separa al 1º del último de la familia
    get cenaInfo() {
      const S = this.settings || {};
      const mainKO = 16 * (S.octavos || 0) + 8 * (S.cuartos || 0) + 4 * (S.semis || 0) + 2 * (S.finalists || 0) + (S.champion || 0);
      const bonus = 16 * 2 + 8 * 4 + 4 * 5 + 2 * 8 + 13;   // 2º cuadro (valores fijos): 113
      const a = this.extrasActual || {};
      let esp = 0;
      for (const k of ["revelacion", "decepcion", "pichichi", "asistente", "portero"]) if (!a[k]) esp += (S[k] || 0);
      const fam = (this.ranked || []).filter((e) => !this.isGuest(e)).map((e) => e.points).filter((p) => p != null);
      const gap = fam.length >= 2 ? (Math.max(...fam) - Math.min(...fam)) : null;
      return { remaining: mainKO + bonus + esp, mainKO, bonus, esp, gap, champion: S.champion || 0 };
    },
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
        for (let m = 1; m <= 3; m++) { const games = fx.filter((f) => f.md === m); const done = games.length > 0 && games.every((f) => { const r = gm[f.code]; return r && r.played && r.home_score != null && r.away_score != null; }); if (done) k = m; else break; }
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
    // ---------- Notificaciones push ----------
    async initPush() {
      this.pushSupported = ("serviceWorker" in navigator) && ("PushManager" in window) && ("Notification" in window);
      if (!this.pushSupported) return;
      try {
        const reg = await navigator.serviceWorker.register("sw.js?v=111");
        const sub = await reg.pushManager.getSubscription();
        this.pushOn = !!sub;
        // pide los avisos SOLA y de forma PERSISTENTE con un modal: si no los tiene,
        // salta en cada visita ("Ahora no" solo lo calla esta sesión) hasta que los active.
        // Si el tutorial de instalación está abierto, no se pisa: ya saltará la próxima vez.
        if (!this.pushOn && !sessionStorage.getItem("porra_notif_dismissed")) {
          setTimeout(() => { if (!this.pushOn && !this.showInstall) this.showNotifModal = true; }, 2600);
        }
      } catch (e) { this.pushSupported = false; }
    },
    dismissNotifModal() { this.showNotifModal = false; try { sessionStorage.setItem("porra_notif_dismissed", "1"); } catch (e) {} },
    async acceptNotifModal() { await this.togglePush(); if (this.pushOn) this.showNotifModal = false; },
    async togglePush() {
      if (!this.pushSupported || this.pushBusy) return;
      this.pushBusy = true;
      try {
        if (this.pushOn) await this._unsubscribePush();
        else await this._subscribePush();
      } catch (e) { this.toast(this.errMsg ? this.errMsg(e) : "No se pudo cambiar las notificaciones", "err"); }
      finally { this.pushBusy = false; }
    },
    async _subscribePush() {
      if (!this.pool) return this.toast("Entra en una porra primero.", "warn");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { this.toast("Permiso de notificaciones denegado. Actívalo en los ajustes del navegador.", "warn"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC) });
      const raw = sub.toJSON();
      await this.rpc("porra_push_subscribe", { p_code: this.pool.code, p_participant_id: (this.me && this.me.id) || null, p_endpoint: sub.endpoint, p_p256dh: raw.keys.p256dh, p_auth: raw.keys.auth, p_ua: navigator.userAgent });
      this.pushOn = true;
      this.toast("🔔 ¡Notificaciones activadas!");
    },
    async _unsubscribePush() {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { try { await this.rpc("porra_push_unsubscribe", { p_endpoint: sub.endpoint }); } catch (e) {} try { await sub.unsubscribe(); } catch (e) {} }
      this.pushOn = false;
      this.toast("🔕 Notificaciones desactivadas.");
    },
    // Admin: enviar una notificación de prueba (activa los avisos si hace falta)
    async sendTestPush() {
      if (this.notifBusy) return;
      this.notifBusy = true;
      try {
        if (!this.pushSupported) { this.toast("Este navegador no soporta notificaciones push.", "warn"); return; }
        if (!this.pushOn) { await this._subscribePush(); }   // activa primero si no lo está
        if (!this.pushOn) return;                             // permiso denegado
        if (!this.adminOk || !this.adminPin) { this.toast("Entra como admin para enviar la prueba.", "warn"); return; }
        const { data, error } = await sb.functions.invoke("porra-notify", { body: { code: this.pool.code, pin: this.adminPin, title: "🔔 Prueba de la porra", body: "¡Las notificaciones funcionan! ⚽" } });
        if (error || (data && data.error)) throw new Error((data && data.error) || (error && error.message) || "error");
        if (!data.sent) this.toast("Avisos activados pero no llegó a ningún dispositivo (¿permiso bloqueado?).", "warn");
        else this.toast("✅ Enviada a " + data.sent + " dispositivo(s). Debería llegarte ya.");
      } catch (e) { this.toast("Error: " + (e && e.message ? e.message : e), "err"); }
      finally { this.notifBusy = false; }
    },
    // Admin: avisar a TODA la porra
    async notifyAll(title, body) {
      if (!this.adminOk || !this.adminPin || this.notifBusy) return;
      this.notifBusy = true;
      try {
        const { data, error } = await sb.functions.invoke("porra-notify", { body: { code: this.pool.code, pin: this.adminPin, title, body } });
        if (error || (data && data.error)) throw new Error((data && data.error) || "error");
        this.toast("Enviada a " + (data.sent || 0) + " dispositivos.");
      } catch (e) { this.toast("No se pudo enviar.", "err"); }
      finally { this.notifBusy = false; }
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
    madridTime(iso) { const d = this._d(iso); if (!d) return ""; try { return dtf("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hour12: false }).format(d); } catch (e) { return ""; } },
    localTimeAt(iso, tz) { const d = this._d(iso); if (!d || !tz) return ""; try { return dtf("es-ES", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(d); } catch (e) { return ""; } },
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
        const g = {}; dtf("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(d).forEach((p) => (g[p.type] = p.value));
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
    madridDayLong(iso) { const d = this._d(iso); if (!d) return ""; try { const s = dtf("es-ES", { timeZone: "Europe/Madrid", weekday: "long", day: "numeric", month: "long" }).format(d); return s.charAt(0).toUpperCase() + s.slice(1); } catch (e) { return ""; } },
    madridDayShort(iso) { const d = this._d(iso); if (!d) return ""; try { return dtf("es-ES", { timeZone: "Europe/Madrid", weekday: "short", day: "numeric", month: "short" }).format(d); } catch (e) { return ""; } },
    _dayKey(iso) { const d = this._d(iso); if (!d) return (iso || "").slice(0, 10); try { return dtf("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(d); } catch (e) { return (iso || "").slice(0, 10); } },

    get liveMatches() {
      // Memo (móvil): reconstruir ~104 partidos con formatos de fecha en CADA evaluación
      // de binding era el mayor coste de CPU. Clave por fetch + tick de 20s; computeLive
      // también invalida (goles/finales) para que el flash no llegue tarde.
      const memoKey = "lm|" + this.espnAt + "|" + this.forecastsAt + "|" + Math.floor((this.nowTs || 0) / 20000);
      if (_MEMO.lmKey === memoKey && _MEMO.lmVal) return _MEMO.lmVal;
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
          // Solo display: gol reciente (<90s) / final reciente (<3 min) para animar.
          flash: !!(this.scoreFlash[ev.id] && this.nowTs - this.scoreFlash[ev.id] < 90000),
          justDone: !!(this.finFlash[ev.id] && this.nowTs - this.finFlash[ev.id] < 180000),
        });
      }
      out.sort((a, b) => a.ts - b.ts);
      _MEMO.lmKey = memoKey; _MEMO.lmVal = out;
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
    // ---- ⚡ PARTIDOS DE HOY (eliminatorias): qué puede sumar cada uno según el resultado ----
    _koStage(match) {
      if (match >= 73 && match <= 88) return { key: "octavos", pts: this.settings.octavos, bonus: 2, round: "Octavos" };
      if (match >= 89 && match <= 96) return { key: "cuartos", pts: this.settings.cuartos, bonus: 4, round: "Cuartos" };
      if (match >= 97 && match <= 100) return { key: "semis", pts: this.settings.semis, bonus: 5, round: "Semis" };
      if (match === 101 || match === 102) return { key: "final", pts: this.settings.finalists, bonus: 8, round: "Final" };
      if (match === 104) return { key: "champion", pts: this.settings.champion, bonus: 13, round: "Campeón" };
      return null;
    },
    // Jornada futbolística en hora de España: [hoy 06:00, mañana 06:00). Así la MADRUGADA del día
    // siguiente cuenta como hoy. CEST = UTC+2 (jun/jul 2026, sin cambio de hora).
    get _footballDayWindow() {
      const OFF = 2 * 3600000;
      const now = this.nowTs || Date.now();
      const madrid = now + OFF;
      const dayStartMadrid = Math.floor((madrid - 6 * 3600000) / 86400000) * 86400000 + 6 * 3600000;
      const fromUtc = dayStartMadrid - OFF;
      return { from: fromUtc, to: fromUtc + 86400000 };
    },
    get koToday() {
      // Memo (móvil): derivePicks de TODOS los jugadores en cada evaluación era caro.
      // Clave por fetch + tick 20s + nº de entradas + usuario; computeLive invalida.
      const memoKey = "kt|" + this.espnAt + "|" + Math.floor((this.nowTs || 0) / 20000) + "|" + ((this.entries || []).length) + "|" + ((this.me && this.me.id) || "");
      if (_MEMO.ktKey === memoKey && _MEMO.ktVal) return _MEMO.ktVal;
      const w = this._footballDayWindow;
      const tbm = (this.liveBr && this.liveBr.teamsByMatch) || {};
      const meId = this.me && this.me.id;
      const players = (this.entries || []).filter((e) => e.picks && !this.isGuest(e))
        .map((e) => { let dp = null; try { dp = Eng.derivePicks(e.picks); } catch (x) {} return { id: e.id, name: this._shortName(e), isMe: e.id === meId, dp, b2: (e.picks && e.picks.bracket2) || {} }; })
        .filter((p) => p.dp);
      const out = [];
      for (const mk of Object.keys(D.KO_KICKOFF || {})) {
        const iso = D.KO_KICKOFF[mk]; const d = this._d(iso); if (!d) continue;
        const ts = d.getTime(); if (ts < w.from || ts >= w.to) continue;          // fuera de la jornada de hoy
        const st = this._koStage(Number(mk)); if (!st) continue;
        const pair = tbm[mk] || {}; const teamA = pair.a, teamB = pair.b;
        if (!teamA || !teamB) continue;                                            // solo con ambos equipos decididos
        const champ = st.key === "champion";
        const hasMain = (P, t) => champ ? (P.champion === t) : !!(P[st.key] && P[st.key].has && P[st.key].has(t));
        const hasBon = (P, t) => champ ? (P.b2 && P.b2.champion === t) : !!(P.b2 && P.b2[st.key] && P.b2[st.key].has && P.b2[st.key].has(t));
        const rows = players.map((p) => {
          // QUÉ PUSO cada uno para ESTE partido: el equipo que tiene avanzando en cada cuadro
          const iniT = hasMain(p.dp, teamA) ? teamA : (hasMain(p.dp, teamB) ? teamB : null);     // cuadro de antes del Mundial
          const bonT = (p.b2[mk] === teamA || p.b2[mk] === teamB) ? p.b2[mk] : null;              // su pick del 28-jun para este cruce
          const same = !!(iniT && bonT && iniT === bonT);
          const picks = [];
          if (iniT) picks.push({ k: "cuadro", ic: "🏆", t: iniT, es: D.es(iniT), flag: D.flag(iniT), pts: st.pts });
          if (bonT) picks.push({ k: "bonus", ic: "🗓️", t: bonT, es: D.es(bonT), flag: D.flag(bonT), pts: st.bonus });
          const total = (iniT ? st.pts : 0) + (bonT ? st.bonus : 0);
          return { id: p.id, name: p.name, isMe: p.isMe, picks, same, sameT: same ? iniT : null,
            sameEs: same ? D.es(iniT) : null, sameFlag: same ? D.flag(iniT) : null, total, max: total };
        }).sort((a, b) => (b.isMe - a.isMe) || (b.max - a.max) || a.name.localeCompare(b.name));
        out.push({ match: Number(mk), kickoffSpain: this.madridTime(iso), ts, round: st.round, stageKey: st.key,
          pts: st.pts, bonus: st.bonus,
          teamA, teamAes: D.es(teamA), teamAflag: D.flag(teamA), teamB, teamBes: D.es(teamB), teamBflag: D.flag(teamB),
          live: false, done: false, hs: null, as: null, players: rows });
      }
      for (const card of out) {
        const lm = (this.liveMatches || []).find((m) => (m.hCanon === card.teamA && m.aCanon === card.teamB) || (m.hCanon === card.teamB && m.aCanon === card.teamA));
        if (lm) { card.live = lm.live; card.done = lm.done; card.flash = lm.flash; card.justDone = lm.justDone; if (lm.live || lm.done) { card.hs = lm.hs; card.as = lm.as; } }
        // Solo display: con el marcador actual, quién pasa y quién sumaría cuántos puntos.
        card.leader = null; card.nowWho = "";
        if ((card.live || card.done) && card.hs != null && card.as != null && Number(card.hs) !== Number(card.as)) {
          card.leader = Number(card.hs) > Number(card.as) ? card.teamA : card.teamB;
          const gains = card.players
            .map((p) => { const g = p.picks.filter((pk) => pk.t === card.leader).reduce((s, pk) => s + pk.pts, 0); return g > 0 ? p.name + " +" + g : null; })
            .filter(Boolean);
          card.nowWho = gains.length ? gains.join(" · ") : "nadie";
        }
      }
      out.sort((a, b) => a.ts - b.ts);
      _MEMO.ktKey = memoKey; _MEMO.ktVal = out;
      return out;
    },
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
      try { const c = JSON.parse(localStorage.getItem("porra_espn_v1") || "null"); if (c && Array.isArray(c.events) && c.events.length) this.espnEvents = c.events; } catch (e) {}
      this.rebuild();
      this.nowTs = Date.now();
      // Carril de pestañas móvil: centrar la pestaña activa al cambiar (si no, queda cortada).
      try { this.$watch("tab", () => setTimeout(() => { const b = document.querySelector(".tabs button.active"); if (b && b.scrollIntoView) b.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }); }, 60)); } catch (e) {}
      setInterval(() => { if (document.hidden) return; this.nowTs = Date.now(); }, 20000);
      window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); this.deferredPrompt = e; });
      window.addEventListener("appinstalled", () => { this.deferredPrompt = null; this.showInstall = false; });
      this.initPush();
      // Mostrar el tutorial de instalación una sola vez (primera visita, si no es ya una app)
      try { if (!this.isStandalone && !localStorage.getItem("porra_install_seen")) setTimeout(() => { if (!this.isStandalone) this.showInstall = true; }, 1800); } catch (e) {}
      this._espnTimer = setInterval(() => { if (!this.pool) return; if (this.tab === "leaderboard") this.loadBoard(); else if (this.tab === "results" || this.tab === "goals") this.fetchEspn(false); }, 60000);
      // Al volver a la pestaña/app, refresca al instante (clasificación siempre al día con lo que se está jugando).
      document.addEventListener("visibilitychange", () => { if (!document.hidden && this.pool) { if (this.tab === "leaderboard") this.loadBoard(); else if (this.tab === "results" || this.tab === "goals") this.fetchEspn(false); } });
      const params = new URLSearchParams(location.search);
      const code = params.get("porra");
      const go = params.get("go");                       // deep-link (p.ej. desde una notificación)
      if (code) {
        await this.loadPool(code);
        if (go === "ko27" && this.view === "pool") {      // abrir directo el apartado 28 de junio
          try { await this.fetchEspn(true); } catch (e) {}
          try { this.openKo27(); } catch (e) {}
        }
      }
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
      if (this._espnInFlight) return this._espnInFlight;   // ya hay una petición en curso: reutilízala (no dupliques)
      this.liveBusy = true;
      this._espnInFlight = (async () => {
        try {
          const r = await fetch("https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719&limit=200");
          const j = await r.json();
          if (j && j.events) {
            this.espnEvents = j.events; this.espnAt = Date.now();
            // caché de arranque: ~1MB, guardado como mucho cada 5 min (quota-safe)
            if (!_MEMO.espnSavedAt || Date.now() - _MEMO.espnSavedAt > 300000) {
              try { localStorage.setItem("porra_espn_v1", JSON.stringify({ at: Date.now(), events: j.events })); _MEMO.espnSavedAt = Date.now(); } catch (e) {}
            }
          }
        } catch (e) { /* mantener datos previos si falla */ }
        finally { this.liveBusy = false; this._espnInFlight = null; this.computeLive(); }
      })();
      return this._espnInFlight;
    },
    computeLive() {
      // Solo display: detectar cambio de marcador (gol) y fin de partido para animarlos.
      // No toca nada de puntuación; usa el tick de nowTs (20s) para caducar solo.
      try {
        const prev = this._scoreCache, next = {};
        for (const ev of (this.espnEvents || [])) {
          const c = ev.competitions && ev.competitions[0]; if (!c) continue;
          const st = (ev.status && ev.status.type) || {};
          const key = (c.competitors || []).map((x) => x.score).join("-") + "|" + (st.completed ? 1 : 0);
          next[ev.id] = key;
          if (prev && prev[ev.id] != null && prev[ev.id] !== key) {
            const wasDone = prev[ev.id].endsWith("|1");
            if (st.completed && !wasDone) this.finFlash[ev.id] = Date.now();
            else if (!st.completed) this.scoreFlash[ev.id] = Date.now();
          }
        }
        this._scoreCache = next;
      } catch (e) { /* decorativo: nunca debe romper el cálculo real */ }
      // Datos nuevos de ESPN → invalidar los memos de los getters pesados.
      _MEMO.lmKey = null; _MEMO.ktKey = null;
      this.outcome = Eng.outcomeFromEspn(this.espnEvents, this.results, this.extrasActual);
      this.computeScorers();
      if (this.tab === "results") {
        // Memo: 3000 sims solo cuando CAMBIA algún resultado de grupo, no cada 60s.
        const gm = (this.outcome && this.outcome.groupMap) || {};
        const sig = Object.keys(gm).sort().map((c) => c + ":" + gm[c].home_score + "-" + gm[c].away_score + ":" + (gm[c].played ? 1 : 0)).join("|");
        if (_MEMO.mcSig !== sig || !_MEMO.mcVal) {
          const mc = Eng.monteCarloTeams(gm, 3000, Math.random);
          _MEMO.mcSig = sig; _MEMO.mcVal = { byTeam: mc.byTeam, sims: mc.sims };
        }
        this.teamProbs = _MEMO.mcVal.byTeam; this.teamProbsSims = _MEMO.mcVal.sims;
      }
      if (this.tab === "goals") this.loadMatchData();
      this.recomputeRanking();
      this.refreshLiveBracket();
      if (this.tab === "ko27") this.rebuildReal();   // cuadro real en vivo con cada partido
      // Solo se pintan en Clasificación/Puntuación: no pagar su coste desde otras pestañas.
      if (this.tab === "leaderboard" || this.tab === "scoring") {
        this.explain = this.buildExplain();
        this.scoringStatus = this.computeScoringStatus();
      }
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
          estado = (K > 1 ? "🔴 puntúan jornadas 1-" + K : "🔴 puntúa jornada 1") + " (" + played + "/6)"; started = true;
          const ri = oc.groupRank[L];
          detalle = order.map((t, i) => (i + 1) + "º " + es(t) + (ri && ri[i] && ri[i].firm ? "" : "?")).join(" · ");
        } else if (played > 0) {
          estado = "⏳ jornada 1 incompleta (" + played + "/6) — aún no puntúa (faltan equipos por jugar)";
        }
        // capa EN DIRECTO: tabla que incluye los partidos en juego (solo para mostrar; no puntúa aún)
        let live = null;
        const ls = oc.liveStandingsByGroup && oc.liveStandingsByGroup[L];
        if (ls) {
          const games = D.GROUP_FIXTURES.filter((f) => f.group === L && oc.liveByCode && oc.liveByCode[f.code]).map((f) => {
            const r = oc.liveByCode[f.code];
            return { txt: es(f.home) + " " + r.home_score + "–" + r.away_score + " " + es(f.away), min: r.status || "" };
          });
          live = { table: ls.map((x, i) => ({ pos: i + 1, es: es(x.team), flag: D.flag(x.team), pts: x.pts, gd: x.gd, pj: x.pj })), games };
        }
        return { L, estado, detalle, started, live };
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
      return { groups, people, hasLive: groups.some((g) => g.live) };
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
    // Jugadores elegibles para el análisis TOP 3, en orden de clasificación actual.
    get top3Options() {
      const withPicks = new Set((this.entries || []).filter((e) => e.picks && !this.isGuest(e)).map((e) => e.id));
      const fam = (this.ranked || []).filter((r) => !this.isGuest(r) && withPicks.has(r.id));
      return fam.map((r, i) => ({ id: r.id, name: (i + 1) + "º · " + ((r.first_name || "").trim()) }));
    },
    // ---------- "Qué tiene que pasar para el TOP 3": condicionales cruce a cruce ----------
    // Para cada eliminatoria PENDIENTE mide, con miles de simulaciones, tus opciones de acabar
    // en el podio según quién pase. Los KO YA JUGADOS se fijan (no se re-simulan): la realidad
    // viene de oc.reached (ESPN) propagada por el cuadro, con la DB (admin) por encima.
    async computeTop3() {
      const meId = this.me && this.me.id;
      if (!this.top3Who && meId) this.top3Who = meId;
      const whoId = this.top3Who || meId;
      if (this.top3Loading) return;
      this.top3Loading = true; this.top3Analysis = null;
      await new Promise((r) => setTimeout(r, 40));
      try {
        if (!whoId) { this.top3Analysis = { none: true }; return; }
        const S = this.settings;
        const oc0 = this.outcome || Eng.liveOutcome(this.results);
        const simMap = Object.assign({}, this.results, (oc0 && oc0.groupMap) || {});
        const entries = (this.entries || []).filter((e) => e.picks && !this.isGuest(e)).map((e) => ({
          id: e.id, name: (e.first_name || "").trim(), dp: Eng.derivePicks(e.picks),
          extra: Eng.scoreExtras(e.picks.extras, this.extrasActual, S).total,
        }));
        const who = entries.find((e) => e.id === whoId);
        if (!who || entries.length < 4) { this.top3Analysis = { none: true }; return; }
        const nameOf = {}; entries.forEach((e) => (nameOf[e.id] = e.name));

        // Clasificación ACTUAL (para saber a quién caza / quién le amenaza).
        const fam = (this.ranked || []).filter((r) => !this.isGuest(r));
        const myIdx = fam.findIndex((r) => r.id === whoId);
        const myPos = myIdx >= 0 ? myIdx + 1 : null;
        const inTop3Now = !!(myPos && myPos <= 3);
        const top3Ids = fam.slice(0, 3).map((r) => r.id).filter((id) => id !== whoId);
        const outsideIds = fam.slice(3).map((r) => r.id).filter((id) => id !== whoId);

        // Cuadro real: ronda de cada partido + ganador si ya se decidió (DB > ESPN reached).
        const stageOf = {};
        D.R32.forEach((m) => (stageOf[m.match] = "octavos")); D.R16.forEach((m) => (stageOf[m.match] = "cuartos"));
        D.QF.forEach((m) => (stageOf[m.match] = "semis")); D.SF.forEach((m) => (stageOf[m.match] = "final"));
        stageOf[D.FINAL.match] = "champion";
        const reach = (k) => k === "champion"
          ? (oc0.reached && oc0.reached.champion ? new Set([oc0.reached.champion]) : new Set())
          : ((oc0.reached && oc0.reached[k]) || new Set());
        const dbWin = (mk) => (this.liveBr && this.liveBr.winnerOf && this.liveBr.winnerOf[mk]) || null;
        const decided = (mk, a, b) => {
          if (!a || !b) return null;
          const w = dbWin(mk); if (w) return w;
          const R = reach(stageOf[mk]); const wa = R.has(a), wb = R.has(b);
          return wa && !wb ? a : (wb && !wa ? b : null);
        };
        const teams = {}, win = {};
        for (const m of D.R32) { const t = (this.liveBr.teamsByMatch || {})[m.match] || {}; teams[m.match] = { a: t.a || null, b: t.b || null }; win[m.match] = decided(m.match, t.a, t.b); }
        for (const list of [D.R16, D.QF, D.SF, [D.FINAL]]) for (const m of list) {
          const a = win[m.a] || null, b = win[m.b] || null;
          teams[m.match] = { a, b }; win[m.match] = decided(m.match, a, b);
        }
        const pend = [];
        for (const mk of Object.keys(stageOf)) {
          const n = Number(mk), t = teams[n];
          if (win[n]) { if (!simMap[n] && !simMap[String(n)]) simMap[n] = { played: true, winner: win[n] }; continue; }
          if (t && t.a && t.b) pend.push({ mk: n, key: stageOf[n], a: t.a, b: t.b });
        }
        pend.sort((x, y) => x.mk - y.mk);

        // Simulación: además del podio de "who", registramos qué rivales entran/caen,
        // qué campeón le conviene, y cuántos puntos saca CADA jugador según quién pase cada cruce.
        const N = 3000;
        let mePod = 0, whoPodN = 0, whoOutN = 0;
        const outCount = {}, inCount = {}, chN = {}, chPod = {};
        const agg = {}; pend.forEach((p) => (agg[p.mk] = { a: { n: 0, pod: 0, sum: {} }, b: { n: 0, pod: 0, sum: {} } }));
        for (let s = 0; s < N; s++) {
          const oc = Eng.simulateOutcome(simMap, Math.random);
          const pts = [];
          for (const e of entries) pts.push({ id: e.id, p: Eng.scoreEntry(e.dp, oc, S) + e.extra });
          const podSet = new Set();
          for (const x of pts) { let above = 0; for (const y of pts) { if (y.p > x.p) above++; } if (above < 3) podSet.add(x.id); }
          const pod = podSet.has(whoId);
          if (pod) { mePod++; whoPodN++; for (const r of top3Ids) { if (!podSet.has(r)) outCount[r] = (outCount[r] || 0) + 1; } }
          else { whoOutN++; for (const p of outsideIds) { if (podSet.has(p)) inCount[p] = (inCount[p] || 0) + 1; } }
          const ch = oc.reached.champion;
          if (ch) { chN[ch] = (chN[ch] || 0) + 1; if (pod) chPod[ch] = (chPod[ch] || 0) + 1; }
          for (const pm of pend) {
            const R = pm.key === "champion" ? (oc.reached.champion ? new Set([oc.reached.champion]) : new Set()) : (oc.reached[pm.key] || new Set());
            const slot = R.has(pm.a) ? agg[pm.mk].a : (R.has(pm.b) ? agg[pm.mk].b : null);
            if (slot) { slot.n++; if (pod) slot.pod++; for (const x of pts) slot.sum[x.id] = (slot.sum[x.id] || 0) + x.p; }
          }
        }

        const mine = (key, t) => key === "champion" ? who.dp.champion === t : !!(who.dp[key] && who.dp[key].has && who.dp[key].has(t));
        const ROUND = { octavos: "Octavos", cuartos: "Cuartos", semis: "Semis", final: "Final", champion: "Campeón" };
        const isMe = whoId === meId;
        const whoName = who.name || "—";
        const P = (x) => Math.round(x * 100) + "%";
        // Cada cruce, en UNA frase: a quién necesita, qué pasa si no, y POR QUÉ (rivales afectados).
        const rows = pend.map((pm) => {
          const A = agg[pm.mk].a, B = agg[pm.mk].b;
          const pA = A.n ? A.pod / A.n : null, pB = B.n ? B.pod / B.n : null;
          const aMine = mine(pm.key, pm.a), bMine = mine(pm.key, pm.b);
          const delta = pA != null && pB != null ? Math.abs(pA - pB) : 0;
          const need = pA == null || pB == null ? null : (pA - pB > 0.005 ? "a" : (pB - pA > 0.005 ? "b" : null));
          const imp = delta >= 0.15 ? "clave" : (delta >= 0.04 ? "media" : "igual");
          const title = D.flag(pm.a) + " " + D.es(pm.a) + (aMine ? " 🏆" : "") + "  vs  " + D.flag(pm.b) + " " + D.es(pm.b) + (bMine ? " 🏆" : "");
          let txt = "";
          if (need) {
            const nEs = need === "a" ? D.es(pm.a) : D.es(pm.b), nFlag = need === "a" ? D.flag(pm.a) : D.flag(pm.b);
            const oEs = need === "a" ? D.es(pm.b) : D.es(pm.a);
            const nPct = need === "a" ? pA : pB, oPct = need === "a" ? pB : pA;
            const nMine = need === "a" ? aMine : bMine, oMine = need === "a" ? bMine : aMine;
            txt = (isMe ? "Te conviene " : "Le conviene ") + nFlag + " " + nEs.toUpperCase() + ": si pasa, el top 3 se pone en " + P(nPct) + "; si pasa " + oEs + ", " + (oPct < 0.1 ? "se hunde a " : "baja a ") + P(oPct) + ".";
            // ¿Por qué? Qué rivales suman más de media con el equipo que NO le conviene.
            const nSlot = need === "a" ? A : B, oSlot = need === "a" ? B : A;
            if (nSlot.n && oSlot.n) {
              const gains = entries.filter((e) => e.id !== whoId).map((e) => ({
                name: nameOf[e.id], g: (oSlot.sum[e.id] || 0) / oSlot.n - (nSlot.sum[e.id] || 0) / nSlot.n,
              })).filter((x) => x.g >= 3).sort((x, y) => y.g - x.g).slice(0, 2);
              if (gains.length) txt += " ¿Por qué? Con " + oEs + " " + gains.map((x) => x.name + " suma +" + Math.round(x.g)).join(" y ") + " de media.";
              else if (oMine && !nMine) txt += " (Lleva a " + oEs + " en su cuadro, pero con ella los rivales recortan más.)";
            }
          } else {
            txt = "Da casi igual quién pase (" + (pA != null ? P(pA) : "—") + " / " + (pB != null ? P(pB) : "—") + ").";
          }
          return { round: ROUND[pm.key] || pm.key, title, txt, imp,
            impTxt: imp === "clave" ? "🔥 CLAVE" : (imp === "media" ? "importa" : ""),
            aEs: D.es(pm.a), bEs: D.es(pm.b), delta,
            needEs: need ? (need === "a" ? D.es(pm.a) : D.es(pm.b)) : null,
            needFlag: need ? (need === "a" ? D.flag(pm.a) : D.flag(pm.b)) : "",
            elsePod: need ? (need === "a" ? pB : pA) : null };
        }).sort((x, y) => y.delta - x.delta);
        const bigRows = rows.filter((r) => r.imp !== "igual");
        const mehTxt = rows.filter((r) => r.imp === "igual").map((r) => r.aEs + "–" + r.bEs).join(" · ");

        // 🎯 Presa / 🛡️ Amenaza (nominal, sobre la clasificación actual)
        let huntTxt = "", threatTxt = "", huntName = "", threatName = "";
        if (!inTop3Now && whoPodN > 0) {
          const best = Object.keys(outCount).sort((a, b) => outCount[b] - outCount[a])[0];
          if (best) { huntName = nameOf[best] || ""; huntTxt = "🎯 " + (isMe ? "Tu presa: en los finales donde entras al podio, el que suele caerse es " : "Su presa: en los finales donde entra al podio, el que suele caerse es ") + huntName + " (" + P(outCount[best] / whoPodN) + " de esos finales)."; }
        }
        if (inTop3Now && whoOutN > 0) {
          const best = Object.keys(inCount).sort((a, b) => inCount[b] - inCount[a])[0];
          if (best) { threatName = nameOf[best] || ""; threatTxt = "🛡️ " + (isMe ? "Tu amenaza: cuando te caes del podio, quien te quita el sitio suele ser " : "Su amenaza: cuando se cae del podio, quien le quita el sitio suele ser ") + threatName + " (" + P(inCount[best] / whoOutN) + " de esas veces)."; }
        }
        // 👑 Campeones que le convienen (podio % según quién gane el Mundial)
        const champs = Object.keys(chN).filter((c) => chN[c] >= N * 0.02)
          .map((c) => ({ es: D.es(c), flag: D.flag(c), pPod: (chPod[c] || 0) / chN[c] }))
          .sort((a, b) => b.pPod - a.pPod);
        const champsTxt = champs.length
          ? "👑 " + (isMe ? "Según quién gane el Mundial, tu podio: " : "Según quién gane el Mundial, su podio: ") + champs.slice(0, 3).map((c) => c.flag + " " + c.es + " → " + P(c.pPod)).join(" · ") + (champs.length > 3 ? " · peor: " + champs[champs.length - 1].flag + " " + champs[champs.length - 1].es + " → " + P(champs[champs.length - 1].pPod) : "") + "."
          : "";

        // 🎁 ESPECIALES por decidir (pichichi/asistente/portero/revelación/decepción/sidebets).
        // Suman MUCHO y aún no están resueltos: para "qué tiene que pasar" son puntos en juego.
        const EA = this.extrasActual || {};
        const SPECIALS = [
          { key: "pichichi", label: "⚽ Máximo goleador", pts: S.pichichi, kind: "player" },
          { key: "asistente", label: "🅰️ Máximo asistente", pts: S.asistente, kind: "player" },
          { key: "portero", label: "🧤 Mejor portero", pts: S.portero || 0, kind: "player" },
          { key: "revelacion", label: "✨ Revelación", pts: S.revelacion, kind: "team" },
          { key: "decepcion", label: "💀 Decepción", pts: S.decepcion, kind: "team" },
          { key: "hattrick", label: "🎩 Hat-trick", pts: S.hattrick, kind: "sidebet" },
          { key: "dobleRoja", label: "🟥 Doble roja", pts: S.dobleRoja, kind: "sidebet" },
        ];
        const rawExtras = (id) => { const e = (this.entries || []).find((x) => x.id === id); return (e && e.picks && e.picks.extras) || {}; };
        const pickOf = (ex, sp) => sp.kind === "sidebet" ? ((ex.sidebets || {})[sp.key] || "") : (ex[sp.key] || "");
        const keyOf = (val, sp) => { const v = (val || "").toString().trim(); if (!v) return ""; return sp.kind === "player" ? this._surKey(v) : this._norm(v); };
        const actOf = (sp) => sp.kind === "sidebet" ? ((EA.sidebets || {})[sp.key] || "") : (EA[sp.key] || "");
        const teamEsF = (t) => { try { return D.flag(t) + " " + D.es(t); } catch (e) { return t; } };
        const sbLabel = (v) => v === "si" ? "Sí" : (v === "no" ? "No" : v);
        const dispOf = (v, sp) => sp.kind === "team" ? teamEsF(v) : (sp.kind === "sidebet" ? sbLabel(v) : v);
        const myExtras = rawExtras(whoId);
        let pendMax = 0, exclPts = 0;
        const especiales = [];
        for (const sp of SPECIALS) {
          const myVal = pickOf(myExtras, sp);
          const act = actOf(sp);
          const resolved = !!(act && act.toString().trim());
          if (!myVal && !resolved) continue;
          const myKey = keyOf(myVal, sp);
          const row = { label: sp.label, pts: sp.pts, myPick: myVal ? dispOf(myVal, sp) : "", resolved };
          if (resolved) {
            row.hit = !!(myKey && myKey === keyOf(act, sp));
            row.actual = dispOf(act, sp);
          } else {
            const share = [], diff = [];
            for (const e of entries) {
              if (e.id === whoId) continue;
              const ev = pickOf(rawExtras(e.id), sp); const ek = keyOf(ev, sp);
              if (!ek) continue;
              if (myKey && ek === myKey) share.push(e.name);
              else diff.push(e.name + " (" + dispOf(ev, sp) + ")");
            }
            row.share = share; row.diff = diff;
            row.exclusive = !!(myKey && share.length === 0);
            if (myKey) { pendMax += sp.pts; if (row.exclusive) exclPts += sp.pts; }
          }
          especiales.push(row);
        }
        const espTxt = pendMax > 0
          ? "🎁 En especiales por decidir " + (isMe ? "te quedan" : "le quedan") + " hasta +" + pendMax + " en juego" + (exclPts > 0 ? " (+" + exclPts + " que nadie más tiene → ventaja directa si acierta" + (isMe ? "s" : "") + ")" : "") + "."
          : "";

        const third = fam[2] || null;
        const myRow = myIdx >= 0 ? fam[myIdx] : null;
        const gap = myPos && myPos > 3 && third && myRow ? third.points - myRow.points : 0;
        const pod = myRow && typeof myRow.podium === "number" ? myRow.podium : mePod / N;
        const posTxt = myPos ? myPos + "º" : "—";
        let line1;
        if (inTop3Now) line1 = (isMe ? "Ahora vas " : "Ahora " + whoName + " va ") + posTxt + " — ¡dentro! Se trata de aguantar.";
        else line1 = (isMe ? "Ahora vas " : "Ahora " + whoName + " va ") + posTxt + (gap > 0 ? " — " + (isMe ? "te separan " : "le separan ") + gap + " pts del 3º (" + (third ? (third.first_name || "").trim() : "") + ")." : ".");
        const line2 = "Traducción: de cada 100 finales posibles del Mundial, " + (isMe ? "acabas" : whoName + " acaba") + " en el top 3 en " + Math.round(pod * 100) + ". Abajo: qué resultado de cada cruce " + (isMe ? "te" : "le") + " sube o baja esas opciones.";
        // 📋 EL PACK: todo lo que necesita para el top 3, en una lista accionable y priorizada.
        const plan = [];
        if (!inTop3Now && huntName) plan.push({ ic: "🎯", txt: (isMe ? "Adelantar a " : "Que adelante a ") + huntName + " (al que más veces le quita el sitio)" });
        if (inTop3Now && threatName) plan.push({ ic: "🛡️", txt: "Aguantar por delante de " + threatName + " (su rival directo)" });
        if (champs.length && champs[0].pPod >= (pod + 0.03)) plan.push({ ic: "🏆", txt: "Que gane el Mundial " + champs[0].flag + " " + champs[0].es + " → su mejor escenario (top 3 al " + P(champs[0].pPod) + ")" });
        for (const r of bigRows.slice(0, 3)) {
          if (!r.needEs) continue;
          plan.push({ ic: "⚔️", txt: "Que en " + r.round.toLowerCase() + " pase " + r.needFlag + " " + r.needEs + (r.elsePod != null ? " (si no, top 3 baja a " + P(r.elsePod) + ")" : "") });
        }
        const pendEsp = especiales.filter((sp) => !sp.resolved && sp.myPick);
        if (pendEsp.length) {
          const lista = pendEsp.map((sp) => sp.label.replace(/^\S+\s/, "") + " " + sp.myPick + " (+" + sp.pts + (sp.exclusive ? ", exclusivo" : "") + ")").join(" · ");
          plan.push({ ic: "🎁", txt: "Acertar especiales pendientes — hasta +" + pendMax + ": " + lista });
        }

        this.top3Analysis = { pod, sims: N, rows, bigRows, mehTxt, myPos, inTop3: inTop3Now, gap,
          isMe, whoName, line1, line2, huntTxt, threatTxt, champsTxt, especiales, espTxt, plan,
          thirdName: third ? (third.first_name || "").trim() : null };
      } finally { this.top3Loading = false; }
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
        await Promise.all([this.loadExtrasActual(), this.loadResults(), this.loadEntries()]);
        if (this.espnEvents.length) { try { this.computeLive(); } catch (e) {} }
        this.loadAvatars();
        // Si el CUADRO DEL 28-JUN está abierto y aún NO lo has empezado, entras DIRECTO ahí
        // (para que nadie se lo pierda). Si ya lo empezaste, entras a la Clasificación.
        if (this.me.id) { try {
          const e = this.myEntry; const n = (e && e.picks && e.picks.bracket2) ? Object.keys(e.picks.bracket2).length : 0;
          let finOpen = true; try { finOpen = Date.now() < new Date(D.KO_KICKOFF[104]).getTime() - 3600000; } catch (x) {}
          if (n === 0 && finOpen) this.tab = "ko27";
        } catch (x) {} }
        this.fetchEspn(true);
        if (this.tab === "leaderboard") this.loadBoard();
        else if (this.tab === "ko27") { try { await this.fetchEspn(true); this.openKo27(); } catch (e) {} }
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
        ko1: this._koView(dp, oc, this.settings, false),               // cuadro de antes del Mundial (rondas + estado)
        ko2: this._koView(dp, oc, this.settings, true),                // cuadro del 28-jun (rondas + estado)
        ko2Filled: !!(dp.b2 && dp.b2.octavos && dp.b2.octavos.size),   // ¿rellenó el 28-jun?
      };
    },
    // ---- vista compacta de un cuadro KO (de cualquier jugador), por rondas, con estado en vivo ----
    _koEliminated() {   // equipos que YA perdieron un partido de eliminatorias (de los emparejamientos reales)
      const elim = new Set(); const br = this.liveBr || {}; const tbm = br.teamsByMatch || {}, won = br.winnerOf || {};
      for (const list of [D.R32, D.R16, D.QF, D.SF, [D.FINAL]]) for (const m of list) {
        const w = won[m.match], pair = tbm[m.match];
        if (w && pair) { const loser = pair.a === w ? pair.b : pair.a; if (loser) elim.add(loser); }
      }
      return elim;
    },
    _koQualifiedSet() {   // los 32 equipos que SÍ están en la fase KO real (1/16)
      const s = new Set(); const tbm = (this.liveBr && this.liveBr.teamsByMatch) || {};
      for (const m of D.R32) { const p = tbm[m.match]; if (p) { if (p.a) s.add(p.a); if (p.b) s.add(p.b); } }
      return s;
    },
    _koPickStatus(team, stage, oc, elim, inKo, koKnown) {   // 'adv' | 'out' | 'pend'
      if (!team) return "pend";
      const r = (oc && oc.reached) || {};
      if (stage === "champion") {
        if (r.champion == null) return (elim.has(team) || (koKnown && inKo.size && !inKo.has(team))) ? "out" : "pend";
        return r.champion === team ? "adv" : "out";
      }
      const set = r[stage];
      if (set && set.has && set.has(team)) return "adv";
      if (elim.has(team)) return "out";
      if (koKnown && inKo.size && !inKo.has(team)) return "out";   // ni siquiera se clasificó a la fase KO
      return "pend";
    },
    _koView(dp, oc, S, isBonus) {
      if (!this.liveBr || !this.liveBr.teamsByMatch || !Object.keys(this.liveBr.teamsByMatch).length) { try { this.refreshLiveBracket(); } catch (e) {} }
      const elim = this._koEliminated(), inKo = this._koQualifiedSet(), koKnown = !!this.groupStageOver;
      const pts = isBonus ? { octavos: 2, cuartos: 4, semis: 5, final: 8, champion: 13 }
                          : { octavos: S.octavos, cuartos: S.cuartos, semis: S.semis, final: S.finalists, champion: S.champion };
      const src = isBonus ? (dp.b2 || {}) : dp;
      const ROUNDS = [["octavos", "Octavos"], ["cuartos", "Cuartos"], ["semis", "Semis"], ["final", "Final"], ["champion", "Campeón"]];
      let total = 0;
      const rounds = ROUNDS.map(([key, label]) => {
        let teams = [];
        if (key === "champion") { const c = src.champion; teams = c ? [c] : []; }
        else { const set = src[key]; teams = set ? [...set] : []; }
        const cells = teams.map((t) => {
          const status = this._koPickStatus(t, key, oc, elim, inKo, koKnown);
          const p = status === "adv" ? pts[key] : 0; total += p;
          return { es: D.es(t), flag: D.flag(t), status, pts: p };
        }).sort((a, b) => a.es.localeCompare(b.es));
        return { key, label, ppts: pts[key], cells, n: cells.length, adv: cells.filter((c) => c.status === "adv").length };
      });
      return { rounds, total };
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
        out.push({ L, state: complete ? "done" : "live", played, pts, qual, qualNames, rows, actual, complete, live: this.liveGroupGames(L) });
      }
      return { groups: out, seguro, provisional };
    },
    refreshLiveBracket() {
      const RES = this._resMap;
      const standings = {}; let complete = true;
      for (const L of D.GROUP_LETTERS) { const s = Eng.groupStandings(L, RES, false, null); standings[L] = s; if (!s._complete) complete = false; }
      const wOf = (n) => { const r = RES[n] || RES[String(n)]; return r && r.played && r.winner ? r.winner : null; };
      const tbm = {};
      let built = null;
      if (complete) { try { built = Eng.buildR32Teams(Eng.computeQualifiers(standings)); } catch (e) {} }
      const stored = (n) => RES[String(n)];
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

    // Tabla de grupo para MOSTRAR: prioriza la versión EN DIRECTO (incluye partidos en juego);
    // si no, la de jornadas completas. (La puntuación NO usa esto — sigue por groupOrder.)
    liveTable(L) {
      const oc = this.outcome;
      return (oc && oc.liveStandingsByGroup && oc.liveStandingsByGroup[L])
          || (oc && oc.standingsByGroup && oc.standingsByGroup[L])
          || Eng.groupStandings(L, this._resMap, false, null);
    },
    isLiveGroup(L) { const oc = this.outcome; return !!(oc && oc.liveGroups && oc.liveGroups[L]); },
    liveGroupGames(L) {
      const oc = this.outcome; if (!oc || !oc.liveByCode) return [];
      return D.GROUP_FIXTURES.filter((f) => f.group === L && oc.liveByCode[f.code]).map((f) => {
        const r = oc.liveByCode[f.code];
        return { home: D.es(f.home), away: D.es(f.away), hFlag: D.flag(f.home), aFlag: D.flag(f.away), hs: r.home_score, as: r.away_score, status: r.status || "" };
      });
    },

    // Resultados REALES para los cálculos: grupos vienen de oc.groupMap (ESPN); KO de this.results.
    // OJO: this.results (DB) suele venir VACÍO con el board del servidor — usar SIEMPRE esto.
    get _resMap() { const gm = (this.outcome && this.outcome.groupMap) || {}; return Object.assign({}, this.results || {}, gm); },

    // Solo confirmamos lo que es 100% (en la simulación, 1.0 = todos los escenarios coinciden).
    _almostCertain(code, t) {
      const p = t && this.teamProbs && this.teamProbs[t]; if (!p || p.first == null || p.top2 == null) return false;
      if (code[0] === "W") return p.first >= 1;
      if (code[0] === "R") return (p.top2 - p.first) >= 1;
      return false;
    },
    // EXCEPCIÓN manual (decisión del admin): el ganador de estos grupos se adelanta aunque no sea
    // 100% matemático. Ahora: grupo J = Argentina (~99,97%, prácticamente hecho).
    _forceWinner(g) { return ["J"].indexOf(g) >= 0; },
    // ¿está ya decidido el hueco de "mejor 3º" del partido `mn`? Sí cuando un grupo YA CERRADO
    // cae en ese hueco al 100% (su 3º es definitivo y el reparto oficial ahí es invariable).
    _thirdSlotConfirmed(mn, standings) {
      const sp = this.thirdSlotProbs && this.thirdSlotProbs[mn];
      return !!(sp && sp.p >= 1 && sp.group && standings[sp.group] && standings[sp.group]._complete);
    },
    // ---------- Vista previa del cuadro post-grupos (BONUS) — SOLO admin, SOLO lectura ----------
    buildKoPreview() {
      const RES = this._resMap;
      const standings = {};
      for (const L of D.GROUP_LETTERS) standings[L] = Eng.groupStandings(L, RES, false, null);
      const complete = D.GROUP_LETTERS.filter((L) => standings[L]._complete).length;
      let teams = null;
      try { teams = Eng.buildR32Teams(Eng.computeQualifiers(standings)).teams; } catch (e) { teams = null; }
      // Monte Carlo: probabilidades por equipo (qualify/first/top2) + reparto de los huecos de 3º
      // (con qué grupo cae cada hueco, según la tabla oficial). Para confirmar lo prácticamente seguro.
      let chances = {}, thirdSlotProbs = {};
      try {
        const teamsAll = [].concat(...D.GROUP_LETTERS.map((L) => D.GROUPS[L]));
        const acc = {}; teamsAll.forEach((t) => (acc[t] = { qualify: 0, first: 0, top2: 0 }));
        const SL = [74, 77, 79, 80, 81, 82, 85, 87]; const tly = {}; SL.forEach((s) => (tly[s] = {}));
        const N = 3000;
        for (let i = 0; i < N; i++) {
          const std2 = {}; for (const L of D.GROUP_LETTERS) std2[L] = Eng.groupStandings(L, RES, true, Math.random);
          const q2 = Eng.computeQualifiers(std2);
          for (const L of D.GROUP_LETTERS) { const s = std2[L]; acc[s[0].team].first++; acc[s[0].team].top2++; acc[s[1].team].top2++; }
          const qset = new Set([].concat(Object.values(q2.winners), Object.values(q2.runnersUp), q2.qualifiedThirdTeams));
          qset.forEach((t) => { if (acc[t]) acc[t].qualify++; });
          const a2 = Eng.thirdMatching((q2.qualifiedThirdGroups || []).slice());
          for (const s of SL) { const g = a2[s]; if (g) tly[s][g] = (tly[s][g] || 0) + 1; }
        }
        teamsAll.forEach((t) => (chances[t] = { qualify: acc[t].qualify / N, first: acc[t].first / N, top2: acc[t].top2 / N }));
        for (const s of SL) { let bg = null, bn = 0; for (const g in tly[s]) if (tly[s][g] > bn) { bn = tly[s][g]; bg = g; } thirdSlotProbs[s] = { group: bg, p: bn / N }; }
      } catch (e) { chances = {}; thirdSlotProbs = {}; }
      this.teamProbs = chances; this.teamProbsSims = 3000; this.thirdSlotProbs = thirdSlotProbs;
      const statusOf = (t) => {
        if (!t) return null;
        const c = chances[t]; if (!c) return { k: "maybe", q: null };
        if (c.qualify >= 0.9999) return { k: "in", q: c.qualify };
        if (c.qualify <= 0.0001) return { k: "out", q: c.qualify };
        return { k: "maybe", q: c.qualify };
      };
      const allComplete = complete === D.GROUP_LETTERS.length;
      // Un equipo SOLO se coloca en su hueco del cuadro cuando está CONFIRMADO ahí:
      //  - 1º (W-X) y 2º (RU-X): en cuanto su grupo CIERRA (posición definitiva).
      //  - mejor 3º (3rd): cuando han cerrado TODOS los grupos (el reparto de terceros depende
      //    de QUÉ 8 grupos aportan tercero, y eso no se fija hasta el final).
      const confirmedTeam = (code, t, mn) => {
        if (!t) return null;
        if (code === "3rd") return (allComplete || this._thirdSlotConfirmed(mn, standings)) ? t : null;
        const g = code.split("-")[1];
        if (standings[g] && standings[g]._complete) return t;     // grupo cerrado (100%)
        if (code[0] === "W" && this._forceWinner(g)) return t;     // excepción admin (Argentina, grupo J)
        return this._almostCertain(code, t) ? t : null;           // o 100% en la simulación
      };
      const slotLabel = (code) => code === "3rd" ? "Mejor 3º" : ((code[0] === "W" ? "1º " : "2º ") + code.split("-")[1]);
      const cell = (code, t0, mn) => {
        const t = confirmedTeam(code, t0, mn);
        if (t) return { team: t, es: D.es(t), flag: D.flag(t), st: statusOf(t), pending: false };
        return { team: null, es: slotLabel(code), flag: "", st: null, pending: true };   // hueco a la espera
      };
      const cruces = D.R32.map((m, i) => { const tm = teams ? teams[m.match] : { a: null, b: null }; return { n: i + 1, a: cell(m.a, tm.a, m.match), b: cell(m.b, tm.b, m.match) }; });
      let nIn = 0, nOut = 0, nMaybe = 0;
      for (const t of [].concat(...D.GROUP_LETTERS.map((L) => D.GROUPS[L]))) { const s = statusOf(t); if (s.k === "in") nIn++; else if (s.k === "out") nOut++; else nMaybe++; }
      this.koPreview = { cruces, complete, total: D.GROUP_LETTERS.length, nIn, nOut, nMaybe, ready: complete === D.GROUP_LETTERS.length };
    },
    openKoPreview() {
      if (!this.adminOk) return;
      this.buildKoPreview();
      this.koPreviewShow = !this.koPreviewShow;
    },

    // ---------- Pestaña "28 de junio": camino a la final (1/16 → campeón) ----------
    get ko27DaysLeft() {
      try { const now = new Date(); const t = new Date("2026-06-28T00:00:00"); return Math.ceil((t - now) / 86400000); } catch (e) { return 0; }
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
      // --- estructura ESPEJO (dos mitades reales del cuadro convergiendo al trofeo) ---
      const byN = {}; rounds.forEach((r) => { byN[r.key] = {}; r.matches.forEach((m) => (byN[r.key][m.n] = m)); });
      const pick = (key, ns) => ns.map((n) => byN[key][n]).filter(Boolean);
      // orden visual (de cruces) verificado contra el bracket FIFA: izquierda alimenta SF1, derecha SF2
      const left = {
        r32: pick("r32", [2, 5, 1, 3, 11, 12, 9, 10]),   // 74,77,73,75,83,84,81,82
        r16: pick("r16", [1, 2, 5, 6]),                  // 89,90,93,94
        qf: pick("qf", [1, 2]),                          // 97,98
        sf: pick("sf", [1]),                             // 101
      };
      const right = {
        r32: pick("r32", [4, 6, 7, 8, 14, 16, 13, 15]),  // 76,78,79,80,86,88,85,87
        r16: pick("r16", [3, 4, 7, 8]),                  // 91,92,95,96
        qf: pick("qf", [3, 4]),                          // 99,100
        sf: pick("sf", [2]),                             // 102
      };
      const meta = { r32: { title: "1/16", seeded: true }, r16: { title: "Octavos", seeded: false }, qf: { title: "Cuartos", seeded: false }, sf: { title: "Semis", seeded: false } };
      const cols = (side) => ["r32", "r16", "qf", "sf"].map((k) => ({ key: k, title: meta[k].title, seeded: meta[k].seeded, matches: side[k] }));
      const bracket = { leftCols: cols(left), rightCols: cols(right), finalCol: { key: "final", title: "Final", seeded: false, matches: byN.final[1] ? [byN.final[1]] : [] } };
      this.ko27 = { rounds, bracket, ready: kp.ready, complete: kp.complete, total: kp.total, nIn: kp.nIn, nOut: kp.nOut, nMaybe: kp.nMaybe };
    },
    openKo27() { this.tab = "ko27"; this.selectedId = null; this.det = null; this.buildKo27(); this.loadBracket2(); },

    // ¿está abierto el 2º cuadro? estás identificado + aún no ha empezado la final (cada cruce
    // tiene además su propio candado: 1h antes de SU partido).
    // El cuadro del 28-jun se CONGELA en cuanto lo completas (31 cruces): a partir de ahí queda fijo y
    // no se toca. Quien aún NO lo terminó puede seguir rellenándolo, con candado por partido (no puede
    // tocar cruces ya jugados, para que nadie acierte sobre seguro).
    get ko27Frozen() { const e = this.myEntry; const b2 = e && e.picks && e.picks.bracket2; return (b2 ? Object.keys(b2).length : 0) >= 31; },
    get ko27Editable() {
      if (this.ko27Frozen) return false;
      if (!this.me || !this.me.id || !this.ko27) return false;
      try { const fin = D.KO_KICKOFF[104]; if (fin && Date.now() >= new Date(fin).getTime() - 3600000) return false; } catch (e) {}
      return true;
    },
    matchKickoff(match) { const t = D.KO_KICKOFF && D.KO_KICKOFF[match]; return t ? new Date(t).getTime() : null; },
    // un cruce se puede tocar hasta 1 HORA antes de su partido (y NUNCA si tu cuadro ya está completo).
    // FILL-ONLY: lo que ya pusiste NO se puede cambiar; solo se pueden RELLENAR los cruces vacíos.
    // (Quien terminó los 31 queda congelado; quien no, sigue rellenando.)
    matchEditable(match) {
      if (this.ko27Frozen) return false;
      return !(this.bracket2 && this.bracket2[match]);            // vacío → editable; con pick → bloqueado
    },
    // ¿se puede elegir este cruce? identificado + ambos equipos decididos + cruce vacío (y NUNCA en modo "cuadro real")
    canPick2(m) { return !this.realMode && this.viewingSelf2 && !!(this.me && this.me.id) && !!(m && m.a && m.a.team && m.b && m.b.team) && this.matchEditable(m.match); },
    // texto del candado de un cruce (cuándo se cierra, hora de España)
    matchLockTxt(match) { const k = this.matchKickoff(match); if (k == null) return ""; try { return this.madridTime(new Date(k - 3600000).toISOString()); } catch (e) { return ""; } },
    // 1/16 YA JUGADOS que dejaste vacíos → se auto-rellenan con el ganador REAL, para que el cuadro
    // fluya y nadie se atasque esperando un partido que ya pasó. Solo el tuyo, si aún no lo cerraste.
    _autoSeedPlayed() {
      if (this.ko27Frozen || !this.viewingSelf2 || !this.me || !this.me.id) return false;
      let oc = this.outcome;
      if (!oc) { try { oc = Eng.outcomeFromEspn(this.espnEvents || [], this.dbResults || {}, this.extrasActual || {}); } catch (e) { oc = null; } }
      const reached = oc && oc.reached && oc.reached.octavos;          // ganadores REALES de 1/16 (de ESPN)
      if (!reached || !reached.size) return false;
      const RES = this._resMap; const standings = {};
      for (const L of D.GROUP_LETTERS) standings[L] = Eng.groupStandings(L, RES, false, null);
      let teams = null; try { teams = Eng.buildR32Teams(Eng.computeQualifiers(standings)).teams; } catch (e) { return false; }
      let changed = false;
      for (const m of D.R32) {
        if (this.bracket2[m.match]) continue;                         // ya tiene pick: no tocar
        const pair = teams[m.match]; if (!pair) continue;
        const w = (pair.a && reached.has(pair.a)) ? pair.a : ((pair.b && reached.has(pair.b)) ? pair.b : null);   // el ganador REAL
        if (w) { this.bracket2[m.match] = w; changed = true; }
      }
      return changed;
    },
    loadBracket2() {
      const e = this.myEntry;
      this.bracket2 = (e && e.picks && e.picks.bracket2) ? Object.assign({}, e.picks.bracket2) : (this.bracket2 || {});
      const seeded = this._autoSeedPlayed();   // rellena los 1/16 ya jugados que falten
      this.rebuild2();
      if (seeded) this._autoSave2();            // persiste el auto-relleno
    },
    // Reconstruye el 2º cuadro SEMBRADO desde los clasificados REALES (no desde tu predicción de grupos).
    rebuild2() {
      const RES = this._resMap;
      const standings = {};
      for (const L of D.GROUP_LETTERS) standings[L] = Eng.groupStandings(L, RES, false, null);
      const allComplete = D.GROUP_LETTERS.every((L) => standings[L]._complete);
      let teams = null;
      try { teams = Eng.buildR32Teams(Eng.computeQualifiers(standings)).teams; } catch (e) { teams = null; }
      // Solo se puede elegir un cruce de 1/16 cuando AMBOS equipos están CONFIRMADOS:
      // 1º/2º cuando su grupo cierra; mejor 3º cuando cierran TODOS los grupos.
      const conf = (code, t, mn) => { if (!t) return null; if (code === "3rd") return (allComplete || this._thirdSlotConfirmed(mn, standings)) ? t : null; const g = code.split("-")[1]; if (standings[g] && standings[g]._complete) return t; if (code[0] === "W" && this._forceWinner(g)) return t; return this._almostCertain(code, t) ? t : null; };
      const slotLabel = (code) => code === "3rd" ? "Mejor 3º" : ((code[0] === "W" ? "1º " : "2º ") + code.split("-")[1]);
      const tbm = {}, labelOf = {};
      for (const m of D.R32) { const tm = teams ? teams[m.match] : { a: null, b: null }; tbm[m.match] = { a: conf(m.a, tm.a, m.match), b: conf(m.b, tm.b, m.match) }; labelOf[m.match] = { a: slotLabel(m.a), b: slotLabel(m.b) }; }
      // fuente de los picks: el tuyo (editable) o el de otro jugador (copia, solo lectura)
      const b = this.viewingSelf2 ? this.bracket2 : Object.assign({}, this._viewedBracket2());
      const winnerOf = {};
      const valid = (mNum) => { const pair = tbm[mNum]; const w = b[mNum]; if (w && pair && (w === pair.a || w === pair.b)) return w; if (w !== undefined) delete b[mNum]; return null; };
      for (const m of D.R32) winnerOf[m.match] = valid(m.match);
      for (const list of [D.R16, D.QF, D.SF, [D.FINAL]]) for (const m of list) { tbm[m.match] = { a: winnerOf[m.a] || null, b: winnerOf[m.b] || null }; winnerOf[m.match] = valid(m.match); }
      const cell = (t, label) => ({ team: t, es: t ? D.es(t) : null, flag: t ? D.flag(t) : "", label: label || null });
      const defs = [{ key: "r32", title: "1/16", list: D.R32 }, { key: "r16", title: "Octavos", list: D.R16 }, { key: "qf", title: "Cuartos", list: D.QF }, { key: "sf", title: "Semis", list: D.SF }, { key: "final", title: "Final", list: [D.FINAL] }];
      this._cols2 = defs.map((d) => ({ key: d.key, title: d.title, matches: d.list.map((m, i) => ({ n: i + 1, match: m.match, a: cell(tbm[m.match].a, d.key === "r32" ? labelOf[m.match].a : null), b: cell(tbm[m.match].b, d.key === "r32" ? labelOf[m.match].b : null), pick: b[m.match] || null })) }));
      this._champion2 = winnerOf[D.FINAL.match] || null;
      this._mirror2 = this._buildMirror2(this._cols2);          // cuadro visual interactivo (estable)
      this.rebuildReal();                                        // y el espejo REAL (cómo va de verdad)
    },
    // ---- CUADRO REAL: cómo va quedando de verdad (ganadores REALES de ESPN), para comparar con lo que pusiste ----
    get realMode() { return this.ko27Mode === "real"; },
    get wcbView() { return this.realMode ? this.mirrorReal : this.mirror2; },
    get wcbChampion() { return this.realMode ? (this._realChampion || null) : this._champion2; },
    setKo27Mode(mode) { this.ko27Mode = mode === "real" ? "real" : "mine"; if (this.realMode) this.rebuildReal(); },
    get mirrorReal() { return this._mirrorReal || { leftCols: [], rightCols: [], finalMatch: null }; },
    // aciertos del jugador en los 1/16 ya jugados (lo que pusiste vs lo que pasó)
    get realHits() {
      const r32 = ((this._realCols || []).find((c) => c.key === "r32") || {}).matches || [];
      let hit = 0, played = 0;
      for (const m of r32) { if (m.status === "hit") { hit++; played++; } else if (m.status === "miss") played++; }
      return { hit, played };
    },
    _reachedKeyFor(match) {
      if (match >= 73 && match <= 88) return "octavos";
      if (match >= 89 && match <= 96) return "cuartos";
      if (match >= 97 && match <= 100) return "semis";
      if (match === 101 || match === 102) return "final";
      if (match === D.FINAL.match) return "champion";
      return null;
    },
    rebuildReal() {
      let oc = this.outcome;
      if (!oc) { try { oc = Eng.outcomeFromEspn(this.espnEvents || [], this.dbResults || {}, this.extrasActual || {}); } catch (e) { oc = null; } }
      const reached = (oc && oc.reached) || { octavos: new Set(), cuartos: new Set(), semis: new Set(), final: new Set(), champion: null };
      const has = (key, t) => { if (!t) return false; if (key === "champion") return reached.champion === t; const s = reached[key]; return !!(s && s.has && s.has(t)); };
      const RES = this._resMap, standings = {};
      for (const L of D.GROUP_LETTERS) standings[L] = Eng.groupStandings(L, RES, false, null);
      let teams = null; try { teams = Eng.buildR32Teams(Eng.computeQualifiers(standings)).teams; } catch (e) { teams = null; }
      const picks = this.viewingSelf2 ? this.bracket2 : this._viewedBracket2();
      const tbm = {}, winnerOf = {};
      const realWinner = (mNum, pair) => { const key = this._reachedKeyFor(mNum); if (!key || !pair) return null; if (pair.a && has(key, pair.a)) return pair.a; if (pair.b && has(key, pair.b)) return pair.b; return null; };
      for (const m of D.R32) { tbm[m.match] = (teams && teams[m.match]) ? teams[m.match] : { a: null, b: null }; winnerOf[m.match] = realWinner(m.match, tbm[m.match]); }
      for (const list of [D.R16, D.QF, D.SF, [D.FINAL]]) for (const m of list) { tbm[m.match] = { a: winnerOf[m.a] || null, b: winnerOf[m.b] || null }; winnerOf[m.match] = realWinner(m.match, tbm[m.match]); }
      const sideOf = (mNum, t) => { const w = winnerOf[mNum]; if (!t || !w) return "plain"; return t === w ? "in" : "out"; };
      const cell = (mNum, t) => ({ team: t, es: t ? D.es(t) : null, flag: t ? D.flag(t) : "", label: null, side: sideOf(mNum, t) });
      const r32set = new Set(D.R32.map((m) => m.match));
      const pickStatus = (mNum) => { if (!r32set.has(mNum)) return null; const w = winnerOf[mNum], p = picks[mNum]; if (!p) return null; if (!w) return "pending"; return p === w ? "hit" : "miss"; };
      const defs = [{ key: "r32", list: D.R32 }, { key: "r16", list: D.R16 }, { key: "qf", list: D.QF }, { key: "sf", list: D.SF }, { key: "final", list: [D.FINAL] }];
      const cols = defs.map((d) => ({ key: d.key, matches: d.list.map((m, i) => ({ n: i + 1, match: m.match, a: cell(m.match, tbm[m.match].a), b: cell(m.match, tbm[m.match].b), pick: winnerOf[m.match] || null, status: pickStatus(m.match) })) }));
      this._realChampion = reached.champion || winnerOf[D.FINAL.match] || null;
      this._realCols = cols;                                    // para la vista móvil (ronda a ronda)
      this._mirrorReal = this._buildMirror2(cols);
    },
    // ---- ver el cuadro de otros jugadores (al acabar la fase de grupos) ----
    get groupStageOver() { return !!(this.outcome && this.outcome.allGroupsComplete) || !!(this.ko27 && this.ko27.complete === this.ko27.total); },
    get viewingSelf2() { return !this.viewId2 || !!(this.me && this.viewId2 === this.me.id); },
    _viewedBracket2() { const e = (this.entries || []).find((x) => x.id === this.viewId2); return (e && e.picks && e.picks.bracket2) || {}; },
    viewPlayer2(id) {
      // solo puedes ver el de OTROS si ya cerraste el tuyo (anti-copia); el tuyo siempre
      if (id && (!this.me || id !== this.me.id) && !this.ko27Frozen) { this.toast("🔒 Cierra tu cuadro (complétalo) para ver el de los demás.", "warn"); return; }
      this.viewId2 = (id && (!this.me || id !== this.me.id)) ? id : null; this.rebuild2();
    },
    get ko27Players() {
      const real = (this.ranked || []).filter((r) => !this.isGuest(r));
      const byId = {}; (this.entries || []).forEach((e) => (byId[e.id] = e));
      return real.map((r) => { const e = byId[r.id]; const n = e && e.picks && e.picks.bracket2 ? Object.keys(e.picks.bracket2).length : 0;
        return { id: r.id, name: this._shortName(r), me: !!(this.me && r.id === this.me.id), picks: n }; });
    },
    // nº de cruces de 1/16 con AMBOS equipos ya decididos (listos para predecir)
    get ko27PlayableCount() { const r = (this._cols2 || []).find((c) => c.key === "r32"); return r ? r.matches.filter((m) => m.a.team && m.b.team).length : 0; },
    get bracketCols2() { return this._cols2; },
    // Espejo (izquierda/derecha → trofeo) — propiedad ESTABLE recomputada en rebuild2.
    // (Un getter que devuelve objetos nuevos en cada acceso rompe la reactividad de Alpine.)
    get mirror2() { return this._mirror2 || { leftCols: [], rightCols: [], finalMatch: null }; },
    _buildMirror2(cols) {
      const byN = {}; (cols || []).forEach((c) => { byN[c.key] = {}; c.matches.forEach((m) => (byN[c.key][m.n] = m)); });
      const pick = (key, ns) => ns.map((n) => (byN[key] || {})[n]).filter(Boolean);
      const L = { r32: pick("r32", [2, 5, 1, 3, 11, 12, 9, 10]), r16: pick("r16", [1, 2, 5, 6]), qf: pick("qf", [1, 2]), sf: pick("sf", [1]) };
      const R = { r32: pick("r32", [4, 6, 7, 8, 14, 16, 13, 15]), r16: pick("r16", [3, 4, 7, 8]), qf: pick("qf", [3, 4]), sf: pick("sf", [2]) };
      const meta = { r32: "1/16", r16: "Octavos", qf: "Cuartos", sf: "Semis" };
      const colsOf = (side) => ["r32", "r16", "qf", "sf"].map((k) => ({ key: k, title: meta[k], matches: side[k] }));
      const fin = (byN.final || {})[1];
      return { leftCols: colsOf(L), rightCols: colsOf(R), finalMatch: fin || null };
    },
    get activeCol2() { const cols = this.realMode ? this._realCols : this._cols2; return (cols || []).find((c) => c.key === this.ko27Round) || null; },
    get myChampion2() { return this._champion2; },
    get bracket2Picked() { let n = 0; for (const m of [...D.R32, ...D.R16, ...D.QF, ...D.SF, D.FINAL]) if (this.bracket2[m.match]) n++; return n; },
    get bracket2Done() { return this.bracket2Picked === 31; },
    pickWinner2(match, team) {
      if (!team || !this.ko27Editable) return;
      this.bracket2[match] = team; this.ko27Saved = false; this.rebuild2();
      this._autoSave2();                                  // guarda solo en cuanto tocas algo
    },
    _autoSave2() {
      clearTimeout(this._save2Timer);
      this._save2Timer = setTimeout(() => { this.saveBracket2(true); }, 700);   // debounce → 1 guardado
    },
    async saveBracket2(silent) {
      if (!this.ko27Editable || !this.me.id || this.ko27Busy) return;
      this.ko27Busy = true;
      try {
        await this.rpc("porra_set_bracket2", { p_code: this.pool.code, p_participant_id: this.me.id, p_bracket2: this.bracket2 });
        const e = this.myEntry; if (e) { e.picks = e.picks || {}; e.picks.bracket2 = Object.assign({}, this.bracket2); }
        _MEMO.ktKey = null;   // el memo de koToday depende del contenido de bracket2
        this.ko27Saved = true;
        if (this.bracket2Picked === 31) this.toast("🎉 ¡Cuadro del 28-jun COMPLETO! Queda cerrado y sumará solo. Ya puedes ver el de los demás. 👀");
        else if (!silent) this.toast("✅ ¡Camino guardado! Sumarás los puntos bonus según avance el cuadro.");
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
      // CACHE-FIRST: la edge puede tardar varios segundos; pintamos la última
      // clasificación conocida al instante y la refrescamos por detrás (shimmer activo).
      if (!this.ranked.length) {
        try {
          const c = JSON.parse(localStorage.getItem("porra_board_v1") || "null");
          if (c && Array.isArray(c.rows) && c.rows.length) {
            this.usingServerBoard = true; this.boardLocked = !!c.locked;
            this.ranked = c.rows; this.boardIncomplete = c.incomplete || 0;
            this.applyTiebreak();
          }
        } catch (e) {}
      }
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
          try { localStorage.setItem("porra_board_v1", JSON.stringify({ at: Date.now(), locked: this.boardLocked, incomplete: this.boardIncomplete, rows: this.ranked })); } catch (e) {}
        }
      } catch (e) { /* fallback abajo */ }
      // marcadores en vivo + picks (no deben afectar a la tabla del servidor)
      try { await this.loadResults(); if (ok) await this.loadEntries({ recompute: false }); } catch (e) {}
      if (!ok) { this.usingServerBoard = false; try { await this.refreshBoard(); } catch (e) {} }
      try { await this.fetchEspn(false); } catch (e) {}   // refresca outcome + explicación (computeLive)
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
      this.computeParte();
    },
    // EL PARTE: panorama + riesgos/bazas de cada jugador según lo que puso (forward-looking).
    computeParte() {
      if (!this.boardLocked) { this.parte = null; return; }
      // Memo: el parte (1500 sims + historia por jornadas) solo se rehace si cambia algo real.
      const _gm = (this.outcome && this.outcome.groupMap) || {};
      const _sig = "pt|" + Object.keys(_gm).sort().map((c) => c + ":" + _gm[c].home_score + "-" + _gm[c].away_score).join("|") + "#" + (this.ranked || []).map((r) => r.id + ":" + r.points).join(",");
      if (_MEMO.ptSig === _sig && this.parte) return;
      _MEMO.ptSig = _sig;
      const real = (this.ranked || []).filter((r) => !this.isGuest(r));
      if (!real.length) { this.parte = null; return; }
      const oc = this.outcome || Eng.liveOutcome(this.results); const S = this.settings;
      let chances = {};
      try { chances = Eng.monteCarloTeams(oc.groupMap || this.results, 1500).byTeam; } catch (e) {}
      const qp = (t) => { const c = chances[t]; return c ? c.qualify : null; };
      const byId = {}; (this.entries || []).forEach((e) => (byId[e.id] = e));
      const H = this.buildParteHistory(oc, S);
      const JC = this.buildJornadaChanges(oc, S);
      const players = real.map((r, i) => {
        const e = byId[r.id]; const picks = e && e.picks;
        let gd = { seguro: 0, provisional: 0, groups: [] }, dp = null, ex = { total: 0 };
        if (picks) {
          try { gd = this._groupDetail(picks, oc, S); } catch (x) {}
          try { dp = Eng.derivePicks(picks); } catch (x) {}
          try { ex = Eng.scoreExtras(picks.extras, this.extrasActual, S); } catch (x) {}
        }
        const champ = dp ? dp.champion : null;
        const champQ = champ ? qp(champ) : null;
        // su mejor grupo hasta ahora
        let best = null;
        for (const g of (gd.groups || [])) { if (g.pts > 0 && (!best || g.pts > best.pts)) best = g; }
        const bestGroup = best ? { L: best.L, pts: best.pts, complete: !!best.complete } : null;
        const finalists = dp ? [...dp.final].map((t) => D.es(t)) : [];
        // sus apuestas especiales
        const ext = (picks && picks.extras) || {}; const bets = [];
        if (ext.pichichi) bets.push({ t: "⚽ " + ext.pichichi, ok: ex.pichichi > 0 });
        if (ext.asistente) bets.push({ t: "🅰️ " + ext.asistente, ok: ex.asistente > 0 });
        if (ext.portero) bets.push({ t: "🧤 " + ext.portero, ok: ex.portero > 0 });
        if (ext.revelacion) bets.push({ t: "✨ " + D.es(ext.revelacion), ok: ex.revelacion > 0 });
        if (ext.decepcion) bets.push({ t: "💀 " + D.es(ext.decepcion), ok: ex.decepcion > 0 });
        // ===== VA BIEN / VA MAL — auditoría COMPLETA según sus predicciones =====
        const bienA = [], malA = [];
        const addB = (w, t) => bienA.push({ w, t });
        const addM = (w, t) => malA.push({ w, t });
        const P = this.pct.bind(this);
        const sbg = oc.standingsByGroup || {};
        const lbl = ["1º", "2º", "3º", "4º"];
        // campeón
        if (champ && champQ != null) {
          if (champQ >= 0.85) addB(95, "Su campeón " + D.es(champ) + " va lanzado (" + P(champQ) + " de clasificar)");
          else if (champQ >= 0.6) addB(80, "Su campeón " + D.es(champ) + " va bien (" + P(champQ) + ")");
          else if (champQ <= 0.02) addM(100, "Su campeón " + D.es(champ) + " ya está ELIMINADO — pierde su mayor baza");
          else if (champQ <= 0.5) addM(92, "Su campeón " + D.es(champ) + " en apuros (solo " + P(champQ) + " de clasificar)");
          else addM(40, "Su campeón " + D.es(champ) + " no lo tiene claro (" + P(champQ) + ")");
        }
        // grupos: los 4 puestos de cada grupo, acierto a acierto
        if (picks && picks.groups) for (const L of D.GROUP_LETTERS) {
          const pr = picks.groups[L]; if (!pr || pr.length !== 4) continue;
          const s = sbg[L]; if (!s) continue;
          const order = s.map((x) => x.team); const cmpl = !!s._complete;
          for (let i = 0; i < 4; i++) {
            const t = pr[i]; const rp = order.indexOf(t); if (rp < 0) continue;
            const wB = i === 0 ? 72 : i === 1 ? 64 : i === 2 ? 46 : 42;
            if (rp === i) addB(wB - 6, D.es(t) + " va " + lbl[i] + " del grupo " + L + (cmpl ? " (clavado, fijo)" : " (como pusiste)"));
            else addM(wB - (cmpl ? 0 : 4), D.es(t) + ": lo pusiste " + lbl[i] + " y va " + lbl[rp] + " del grupo " + L + (cmpl ? " (ya cerrado)" : ""));
          }
          for (const idx of [0, 1]) { const t = pr[idx], q = qp(t); if (q != null && q <= 0.5) addM(idx === 0 ? 75 : 66, D.es(t) + " (tu " + lbl[idx] + " del grupo " + L + ") peligra: " + P(q) + " de clasificar"); }
        }
        // terceros
        if (picks && picks.thirds && picks.thirds.length) {
          const out = picks.thirds.filter((t) => { const q = qp(t); return q != null && q < 0.4; });
          if (out.length) addM(50, out.length + " de sus 8 terceros van flojos (" + out.slice(0, 3).map((t) => D.es(t)).join(", ") + (out.length > 3 ? "…" : "") + ")");
          const alive = picks.thirds.length - out.length;
          if (alive >= 6) addB(45, alive + "/8 de sus terceros siguen con opciones");
        }
        // bracket
        if (dp) {
          const semis = [...dp.semis], fin = [...dp.final], cuar = [...dp.cuartos];
          const finDead = fin.filter((t) => { const q = qp(t); return q != null && q <= 0.1; });
          if (finDead.length) addM(86, "Su finalista " + finDead.map((t) => D.es(t)).join(" y ") + " se va fuera");
          const semDead = semis.filter((t) => { const q = qp(t); return q != null && q <= 0.05; });
          if (semDead.length) addM(58, semDead.length + " de sus semifinalistas ya cayeron (" + semDead.slice(0, 2).map((t) => D.es(t)).join(", ") + ")");
          const cuarDead = cuar.filter((t) => { const q = qp(t); return q != null && q <= 0.05; }).length;
          if (cuarDead >= 2) addM(48, cuarDead + " de sus cuartofinalistas ya están eliminados");
          const finAlive = fin.filter((t) => { const q = qp(t); return q != null && q >= 0.7; });
          if (finAlive.length === 2) addB(70, "Sus 2 finalistas (" + finAlive.map((t) => D.es(t)).join(", ") + ") siguen fuertes");
        }
        // especiales resueltas
        if (ex.hattrick > 0) addB(55, "Acertó el hat-trick (+" + ex.hattrick + ")");
        if (ex.dobleRoja > 0) addB(55, "Acertó la doble roja (+" + ex.dobleRoja + ")");
        // meta: racha, colchón/amenaza, puntos
        const tt = (H.traj && H.traj[r.id]) || [];
        const cl = tt.length >= 2 ? (tt[0].pos - tt[tt.length - 1].pos) : 0;
        if (cl > 0) addB(35, "En racha: ha subido " + cl + " puesto" + (cl > 1 ? "s" : "") + " desde la J1");
        else if (cl < 0) addM(35, "De capa caída: ha bajado " + (-cl) + " puesto" + (-cl > 1 ? "s" : "") + " desde la J1");
        if (i < real.length - 1) { const cush = r.points - real[i + 1].points; if (cush > 0 && cush <= 3) addM(30, this._shortName(real[i + 1]) + " le aprieta (a " + cush + " pts)"); else if (cush >= 8) addB(30, "Colchón de " + cush + " sobre el de detrás"); }
        if (i > 0) { const ahead = real[i - 1].points - r.points; if (ahead > 0 && ahead <= 4) addB(38, "El " + i + "º (" + this._shortName(real[i - 1]) + ") a tiro: " + ahead + " pts"); }
        if (gd.provisional > 0) addM(25, gd.provisional + " pts provisionales que pueden bajar");
        if (gd.seguro > 0) addB(25, gd.seguro + " pts ya fijos");
        // ordenar por relevancia y deduplicar
        const _dedup = (arr) => { const seen = new Set(); return arr.sort((a, b) => b.w - a.w).filter((o) => { if (seen.has(o.t)) return false; seen.add(o.t); return true; }).map((o) => o.t); };
        const bien = _dedup(bienA), mal = _dedup(malA);
        let gapTxt = "";
        if (i === 0) gapTxt = real.length > 1 ? ("👑 Líder · +" + (r.points - real[1].points) + " sobre el 2º") : "👑 Líder";
        else gapTxt = "a " + (real[i - 1].points - r.points) + " pts de " + this._shortName(real[i - 1]);
        // historia: trayectoria + tendencia
        const t = (H.traj && H.traj[r.id]) || [];
        const trajTxt = t.slice(-3).map((x) => x.j + " " + x.pos + "º (" + x.pts + ")").join(" → ");
        let trend = "=";
        if (t.length >= 2) { const a = t[t.length - 2], b = t[t.length - 1]; trend = b.pos < a.pos ? "up" : b.pos > a.pos ? "down" : (b.pts > a.pts ? "up" : b.pts < a.pts ? "down" : "="); }
        const best24 = t.length >= 2 ? (t[0].pos - t[t.length - 1].pos) : 0;
        // cambios de la última jornada cerrada (qué sumó / qué restó)
        const jc = (JC.byId && JC.byId[r.id]) || { net: 0, ups: [], downs: [], upSum: 0, downSum: 0 };
        const jcUps = jc.ups.slice(0, 8).map((x) => "+" + x.pts + "  " + x.txt);
        const jcDowns = jc.downs.map((x) => x.pts + "  " + x.txt);
        return { pos: i + 1, name: this._shortName(r), pts: r.points, prov: gd.provisional, seguro: gd.seguro,
          isMe: !!(this.me && r.id === this.me.id), champ: champ ? D.es(champ) : null, champQ,
          gapTxt, bestGroup, finalists, bets, exTotal: ex.total, trajTxt, trend, climb: best24,
          _hat: ex.hattrick > 0, _doble: ex.dobleRoja > 0,
          jcNet: jc.net, jcUpSum: jc.upSum, jcDownSum: jc.downSum, jcUps, jcDowns,
          jcUpMore: Math.max(0, jc.ups.length - 8), jcUpN: jc.ups.length, jcDownN: jc.downs.length,
          bien: bien, mal: mal, nBien: bien.length, nMal: mal.length };
      });
      const leader = real[0], second = real[1], last = real[real.length - 1];
      const totalProv = players.reduce((a, p) => a + (p.prov || 0), 0);
      let gPlayed = 0;
      if (oc.standingsByGroup) for (const L of D.GROUP_LETTERS) { const s = oc.standingsByGroup[L]; if (s) gPlayed += s.reduce((a, t) => a + (t.pj || 0), 0); }
      gPlayed = Math.round(gPlayed / 2);
      // --- estadísticas del RESUMEN ---
      const top3 = players.slice(0, 3).map((p) => ({ name: p.name, pts: p.pts, behind: leader.points - p.pts }));
      const champCount = {}; players.forEach((p) => { if (p.champ) champCount[p.champ] = (champCount[p.champ] || 0) + 1; });
      let champPop = null; for (const k in champCount) if (!champPop || champCount[k] > champPop.n) champPop = { team: k, n: champCount[k] };
      const spread = real.length > 1 ? (leader.points - last.points) : 0;
      const aSb = (this.extrasActual || {}).sidebets || {};
      const specials = [];
      if (aSb.hattrick) specials.push({ k: "🎩 Hat-trick", n: players.filter((p) => p._hat).length });
      if (aSb.dobleRoja) specials.push({ k: "🟥 Doble roja", n: players.filter((p) => p._doble).length });
      const gap = second ? (leader.points - second.points) : 0;
      let head = "";
      if (second) head = gap === 0 ? (this._shortName(leader) + " y " + this._shortName(second) + " comparten el liderato")
        : gap <= 3 ? (this._shortName(leader) + " manda por los pelos: solo " + gap + " pts sobre " + this._shortName(second))
        : (this._shortName(leader) + " lidera con renta de " + gap + " pts sobre " + this._shortName(second));
      else head = this._shortName(leader) + " va primero";
      const inPodio = players.filter((p) => p.pos > 3 && (top3[2] ? p.pts >= top3[2].pts - 10 : false)).length;
      this.parte = {
        jornada: this.tournamentMatchday(), gPlayed, gTotal: D.GROUP_FIXTURES.length,
        total: real.length, second: second ? this._shortName(second) : null, totalProv, players,
        head, top3, champPop, spread, specials, inPodio,
        leaders: H.leaders, mover: H.mover, faller: H.faller,
        jcHas: JC.has, jcFrom: JC.prev, jcTo: JC.J,
        ko: this.buildKoChronicle(oc, S),
      };
    },
    // HISTORIA: re-puntúa la clasificación al final de cada jornada (reconstruida de los resultados).
    buildParteHistory(oc, S) {
      const gm = (oc && oc.groupMap) || this.results || {};
      const J = this.tournamentMatchday();
      const real = (this.ranked || []).filter((r) => !this.isGuest(r));
      const byId = {}; (this.entries || []).forEach((e) => (byId[e.id] = e));
      const traj = {}; real.forEach((r) => (traj[r.id] = []));
      const leaders = [];
      for (let j = 1; j <= J; j++) {
        const sub = {};
        for (const fx of D.GROUP_FIXTURES) { if (fx.md <= j) { const x = gm[fx.code]; if (x && x.played && x.home_score != null && x.away_score != null) sub[fx.code] = x; } }
        let hoc; try { hoc = Eng.liveOutcome(sub); } catch (e) { continue; }
        const sc = real.map((r) => { const e = byId[r.id]; let p = 0; if (e && e.picks) { try { p = Eng.scoreEntry(Eng.derivePicks(e.picks), hoc, S) + Eng.scoreExtras(e.picks.extras, this.extrasActual, S).total; } catch (x) {} } return { id: r.id, pts: p }; });
        sc.sort((a, b) => b.pts - a.pts);
        sc.forEach((s, idx) => traj[s.id].push({ j: "J" + j, pts: s.pts, pos: idx + 1 }));
        if (byId[sc[0].id]) leaders.push({ j: "J" + j, name: this._shortName(byId[sc[0].id]) });
      }
      real.forEach((r, idx) => traj[r.id].push({ j: "ahora", pts: r.points, pos: idx + 1 }));
      let mover = null, bestClimb = 0, faller = null, worstDrop = 0;
      real.forEach((r) => { const t = traj[r.id]; if (t.length >= 2) {
        const d = t[0].pos - t[t.length - 1].pos;
        if (d > bestClimb) { bestClimb = d; mover = { name: this._shortName(r), from: t[0].pos, to: t[t.length - 1].pos }; }
        if (-d > worstDrop) { worstDrop = -d; faller = { name: this._shortName(r), from: t[0].pos, to: t[t.length - 1].pos }; }
      } });
      return { traj, leaders, J, mover, faller };
    },
    // CAMBIOS de la última jornada cerrada (J-1 → J): qué SUMÓ y qué RESTÓ cada jugador, con el motivo
    // concreto (qué equipo se confirmó o se movió). Mismo modelo de puntuación que _groupDetail.
    buildJornadaChanges(oc, S) {
      const J = this.tournamentMatchday();
      const res = { J, prev: J - 1, has: J >= 2, byId: {} };
      if (J < 2) return res;
      const gm = (oc && oc.groupMap) || this.results || {};
      const subUpTo = (j) => { const s = {}; for (const fx of D.GROUP_FIXTURES) { if (fx.md <= j) { const x = gm[fx.code]; if (x && x.played && x.home_score != null && x.away_score != null) s[fx.code] = x; } } return s; };
      let oa, ob;
      try { oa = Eng.liveOutcome(subUpTo(J - 1)); ob = Eng.liveOutcome(subUpTo(J)); } catch (e) { return res; }
      const gk = [S.g1, S.g2, S.g3, (S.g4 || 0)]; const lbl = ["1º", "2º", "3º", "4º"];
      const real = (this.ranked || []).filter((r) => !this.isGuest(r));
      const byId = {}; (this.entries || []).forEach((e) => (byId[e.id] = e));
      for (const r of real) {
        const e = byId[r.id]; const picks = e && e.picks;
        const ups = [], downs = [];
        if (picks && picks.groups) for (const L of D.GROUP_LETTERS) {
          const pred = picks.groups[L]; if (!pred || pred.length !== 4) continue;
          const a1 = oa.groupOrder[L], a2 = ob.groupOrder[L]; if (!a2) continue;
          const ri1 = oa.groupRank && oa.groupRank[L], ri2 = ob.groupRank && ob.groupRank[L];
          const f1 = (i) => !ri1 || (ri1[i] && ri1[i].firm), f2 = (i) => !ri2 || (ri2[i] && ri2[i].firm);
          const dT = (act, ri, t) => { const idx = act ? act.indexOf(t) : -1; return idx < 0 ? false : (ri ? !!(ri[idx] && ri[idx].worstRank <= 1) : idx <= 1); };
          for (let i = 0; i < 4; i++) { const t = pred[i];
            const s1 = !!(a1 && t === a1[i] && f1(i)), s2 = !!(t === a2[i] && f2(i));
            if (s2 && !s1) ups.push({ pts: gk[i], txt: D.es(t) + " confirmó el " + lbl[i] + " del grupo " + L });
            else if (s1 && !s2) { const rp = a2.indexOf(t); downs.push({ pts: -gk[i], txt: D.es(t) + " ya no va " + lbl[i] + " del grupo " + L + (rp >= 0 ? " (ahora " + lbl[rp] + ")" : "") }); }
          }
          for (const k of [0, 1]) { const t = pred[k];
            const q1 = dT(a1, ri1, t), q2 = dT(a2, ri2, t);
            if (q2 && !q1) ups.push({ pts: S.qual, txt: D.es(t) + " clasifica (grupo " + L + ")" });
            else if (q1 && !q2) downs.push({ pts: -S.qual, txt: D.es(t) + " deja de clasificar (grupo " + L + ")" });
          }
        }
        ups.sort((a, b) => b.pts - a.pts);
        const net = ups.reduce((a, x) => a + x.pts, 0) + downs.reduce((a, x) => a + x.pts, 0);
        res.byId[r.id] = { net, ups, downs, upSum: ups.reduce((a, x) => a + x.pts, 0), downSum: downs.reduce((a, x) => a + x.pts, 0) };
      }
      return res;
    },
    // CRÓNICA DE LAS ELIMINATORIAS: tras cada ronda KO, quién SUMA y quién no (y con qué equipos).
    // Cada ronda = el premio por SUPERARLA (entrar en oc.reached[stage]). Cuenta cuadro inicial + bonus 28-jun.
    buildKoChronicle(oc, S) {
      const reached = oc && oc.reached; if (!reached) return null;
      const sz = (x) => (x && x.size) || 0;
      const ROUNDS = [
        { key: "octavos",  name: "Octavos de final", verb: "pasó a octavos",   main: S.octavos,   bonus: 2,  total: 16 },
        { key: "cuartos",  name: "Cuartos de final", verb: "pasó a cuartos",   main: S.cuartos,   bonus: 4,  total: 8 },
        { key: "semis",    name: "Semifinales",      verb: "llegó a semis",    main: S.semis,     bonus: 5,  total: 4 },
        { key: "final",    name: "La final",         verb: "llegó a la final", main: S.finalists, bonus: 8,  total: 2 },
        { key: "champion", name: "El campeón",       verb: "ganó el Mundial",  main: S.champion,  bonus: 13, total: 1 },
      ];
      // ronda activa = la más profunda con algún equipo ya clasificado
      let r = null;
      for (let i = ROUNDS.length - 1; i >= 0; i--) {
        const k = ROUNDS[i].key;
        const has = k === "champion" ? !!reached.champion : sz(reached[k]) > 0;
        if (has) { r = ROUNDS[i]; break; }
      }
      if (!r) return null;   // todavía no se ha jugado ninguna eliminatoria
      const champ = r.key === "champion";
      const advancedTeams = champ ? (reached.champion ? [reached.champion] : []) : [...reached[r.key]];
      const played = advancedTeams.length;
      const real = (this.ranked || []).filter((x) => !this.isGuest(x));
      const byId = {}; (this.entries || []).forEach((e) => (byId[e.id] = e));
      const players = real.map((row, i) => {
        const e = byId[row.id]; let dp = null;
        if (e && e.picks) { try { dp = Eng.derivePicks(e.picks); } catch (x) {} }
        const hits = []; let mainPts = 0, bonusPts = 0;
        if (dp) {
          const b2 = dp.b2 || {};
          const mainSet = champ ? new Set(dp.champion ? [dp.champion] : []) : (dp[r.key] || new Set());
          const bonusHas = (t) => champ ? (b2.champion === t) : !!(b2[r.key] && b2[r.key].has && b2[r.key].has(t));
          const mainHas = (t) => champ ? (mainSet.has && mainSet.has(t)) : !!(mainSet && mainSet.has && mainSet.has(t));
          for (const t of advancedTeams) {
            const inM = mainHas(t), inB = bonusHas(t);
            if (inM || inB) hits.push({ es: D.es(t), flag: D.flag(t), main: inM, bonus: inB, pts: (inM ? r.main : 0) + (inB ? r.bonus : 0) });
            if (inM) mainPts += r.main;
            if (inB) bonusPts += r.bonus;
          }
        }
        hits.sort((a, b) => b.pts - a.pts);
        const pts = mainPts + bonusPts;
        return { id: row.id, pos: i + 1, name: this._shortName(row), isMe: !!(this.me && row.id === this.me.id), pts, mainPts, bonusPts, hits, n: hits.length };
      });
      const scorers = players.filter((p) => p.pts > 0).sort((a, b) => b.pts - a.pts);
      const zero = players.filter((p) => p.pts === 0);
      const ordered = players.slice().sort((a, b) => b.pts - a.pts || a.pos - b.pos);
      return {
        key: r.key, name: r.name, verb: r.verb, mainPts: r.main, bonusPts: r.bonus,
        played, total: r.total, complete: played >= r.total,
        advanced: advancedTeams.map((t) => ({ es: D.es(t), flag: D.flag(t) })),
        players: ordered, nScored: scorers.length, nZero: zero.length, top: scorers[0] || null,
      };
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
      const simResults = this._resMap;   // grupos (ESPN) + ganadores KO ya jugados → no re-aleatorizar lo decidido
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
      try { await this.rpc("porra_set_settings", { p_code: this.pool.code, p_pin: this.adminPin, p_settings: this.settings }); this.pool.settings = Object.assign({}, this.settings); _MEMO.ktKey = null; this.toast("Puntuación guardada."); this.recomputeRanking(); }
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
