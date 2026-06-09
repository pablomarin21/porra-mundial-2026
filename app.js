/* ============================================================================
   PORRA MUNDIAL 2026 — App (Alpine + Supabase)
   ========================================================================== */
const SUPA_URL = "https://enzbrjqdxurrwdpoezxr.supabase.co";
const SUPA_KEY = "sb_publishable_TFWre0qvDBGKWvzc5D4Mzg_-FLySJ-w";
const sb = window.supabase.createClient(SUPA_URL, SUPA_KEY);
const D = window.PORRA_DATA;
const Eng = window.PorraEngine;

const ALL_TEAMS = [].concat(...D.GROUP_LETTERS.map((L) => D.GROUPS[L]));
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
    view: "home", tab: "play", step: 1, rTab: "groups", aTab: "groups",
    phase: "welcome", gIdx: 0,
    // estado porra / jugador
    pool: null, me: { first: "", last: "", id: null, saved: false },
    joinCode: "", newPool: { name: "", code: "", pin: "" }, recent: [],
    // ui
    toasts: [], busy: false, probBusy: false, syncBusy: false, syncMsg: "",
    // pronósticos
    groups: emptyGroups(), thirds: [], bracket: {}, _cols: [], _champion: null,
    letters: D.GROUP_LETTERS, allTeams: ALL_TEAMS.slice().sort((a, b) => D.es(a).localeCompare(D.es(b))),
    // datos
    entries: [], ranked: [], results: {}, rEdit: defaultREdit(), koEdit: defaultKoEdit(), liveBr: { teamsByMatch: {}, winnerOf: {}, complete: false },
    // admin
    adminOk: false, adminPin: "", settings: Object.assign({}, D.DEFAULT_SCORING),
    scoreKeys: [
      { key: "g1", label: "Acertar 1º de grupo" }, { key: "g2", label: "Acertar 2º de grupo" },
      { key: "g3", label: "Acertar 3º de grupo" }, { key: "qual", label: "Equipo que clasifica (top 2)" },
      { key: "thirdQual", label: "Tercero que clasifica" }, { key: "octavos", label: "Llega a octavos" },
      { key: "cuartos", label: "Llega a cuartos" }, { key: "semis", label: "Llega a semifinal" },
      { key: "finalists", label: "Llega a la final" }, { key: "champion", label: "Campeón del mundo" },
    ],
    // probabilidades
    lastProb: false, simN: 0, probData: {},
    selectedId: null, det: null,
    koMeta: KO_META,

    // ---------- helpers de presentación ----------
    es: (t) => D.es(t), flag: (t) => D.flag(t),
    rankClass(i) { return i < 2 ? "qual" : i === 2 ? "third" : "out"; },
    pct(x) { if (x == null) return "—"; const v = x * 100; return (v >= 9.95 ? v.toFixed(0) : v.toFixed(1)) + "%"; },
    groupFixtures(L) { return D.GROUP_FIXTURES.filter((f) => f.group === L); },
    scoreTxt(code) { const r = this.results[code]; return r && r.played && r.home_score != null ? `${r.home_score} - ${r.away_score}` : "— : —"; },
    get playedTxt() { const n = Object.values(this.results).filter((r) => r && r.played).length; return n ? `${n} partido${n > 1 ? "s" : ""} con resultado` : "Aún no hay resultados"; },

    // ---------- init ----------
    async init() {
      try { this.recent = JSON.parse(localStorage.getItem("porra_recent") || "[]"); } catch (e) { this.recent = []; }
      this.rebuild();
      const code = new URLSearchParams(location.search).get("porra");
      if (code) await this.loadPool(code);
    },
    goHome() { this.view = "home"; this.pool = null; this.adminOk = false; this.adminPin = ""; history.replaceState(null, "", location.pathname); },

    // ---------- toasts / rpc ----------
    toast(msg, kind = "ok") { const id = Math.random().toString(36).slice(2); this.toasts.push({ id, msg, kind }); setTimeout(() => { this.toasts = this.toasts.filter((t) => t.id !== id); }, 3800); },
    errMsg(e) { const m = (e && e.message) || ""; for (const k in ERRORS) if (m.includes(k)) return ERRORS[k]; return m || "Algo ha fallado, inténtalo de nuevo."; },
    async rpc(name, args) { const { data, error } = await sb.rpc(name, args); if (error) throw new Error(this.errMsg(error)); return data; },

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
        this.phase = this.me.id ? "intro" : "welcome"; this.gIdx = 0;
        await this.loadResults();
        await this.loadEntries();
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
      this.me = { first: "", last: "", id: null, saved: false };
      if (mine) { this.me = { first: mine.first || "", last: mine.last || "", id: mine.id || null, saved: !!mine.id }; }
      else if (draft) { this.me.first = draft.first || ""; this.me.last = draft.last || ""; }
      if (src) {
        const p = src.picks || src;
        if (p.groups && Object.keys(p.groups).length) for (const L of D.GROUP_LETTERS) if (p.groups[L]) this.groups[L] = p.groups[L].slice();
        this.thirds = (p.thirds || []).slice();
        this.bracket = Object.assign({}, p.bracket || {});
      }
      this.reconcileThirds(); this.rebuild();
    },
    persistDraft() {
      if (!this.pool) return;
      localStorage.setItem("porra_draft_" + this.pool.code, JSON.stringify({ groups: this.groups, thirds: this.thirds, bracket: this.bracket, first: this.me.first, last: this.me.last }));
    },

    // ---------- paso 1: grupos ----------
    moveTeam(L, idx, dir) {
      if (this.pool && this.pool.locked) return;
      const j = idx + dir; if (j < 0 || j > 3) return;
      const a = this.groups[L]; const t = a[idx]; a[idx] = a[j]; a[j] = t;
      this.groups[L] = a.slice();
      this.reconcileThirds(); this.rebuild(); this.persistDraft();
    },
    // ---------- paso 2: terceros ----------
    toggleThird(team) {
      if (this.pool && this.pool.locked) return;
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
      this._cols = defs.map((d) => ({ key: d.key, title: d.title, matches: d.list.map((m) => ({ match: m.match, a: tbm[m.match].a, b: tbm[m.match].b })) }));
      this._champion = winnerOf[D.FINAL.match] || null;
    },
    pickWinner(match, team) { if (!team || (this.pool && this.pool.locked)) return; this.bracket[match] = team; this.rebuild(); this.persistDraft(); },
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
      if (this.pool && this.pool.locked) { if (!quiet) this.toast(ERRORS.POOL_LOCKED, "err"); return false; }
      if (!this.me.first.trim() || !this.me.last.trim()) { if (!quiet) this.toast(ERRORS.NAME_REQUIRED, "err"); return false; }
      this.busy = true;
      try {
        const picks = { groups: this.groups, thirds: this.thirds, bracket: this.bracket };
        const res = await this.rpc("porra_save_entry", { p_code: this.pool.code, p_first: this.me.first, p_last: this.me.last, p_picks: picks, p_participant_id: this.me.id });
        this.me.id = res.participant_id; this.me.saved = true;
        localStorage.setItem("porra_me_" + this.pool.code, JSON.stringify({ id: this.me.id, first: this.me.first, last: this.me.last, picks }));
        await this.loadEntries();
        return true;
      } catch (e) { this.toast(this.errMsg(e), "err"); return false; }
      finally { this.busy = false; }
    },
    async register() {
      if (this.pool && this.pool.locked) return this.toast(ERRORS.POOL_LOCKED, "err");
      if (!this.me.first.trim() || !this.me.last.trim()) return this.toast("Pon tu nombre y tu apellido.", "warn");
      const ok = await this._save(true);
      if (ok) { this.phase = "intro"; this.toast("¡Estás dentro, " + this.me.first + "! Ya apareces en la clasificación. 🎉"); }
    },
    startGroups() { this.phase = "groups"; this.gIdx = 0; this.rebuild(); },
    nextGroup() { if (this.gIdx < 11) { this.gIdx++; this.persistDraft(); } else { this.phase = "thirds"; this._save(true); } },
    prevGroup() { if (this.gIdx > 0) this.gIdx--; else this.phase = "intro"; },
    goBracketPhase() {
      if (this.thirds.length !== 8) return this.toast("Elige tus 8 mejores terceros.", "warn");
      this.rebuild(); this.phase = "bracket"; this._save(true);
    },
    async finishPorra() {
      const ok = await this._save(false);
      if (ok) { this.phase = "done"; this.toast("💾 ¡Quiniela guardada!"); }
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
      this.recomputeRanking();
    },
    async loadEntries() {
      let entries;
      if (this.adminOk && this.adminPin) {
        try { const r = await this.rpc("porra_list_entries_admin", { p_code: this.pool.code, p_pin: this.adminPin }); entries = r.entries; }
        catch (e) { const res = await this.rpc("porra_list_entries", { p_code: this.pool.code }); entries = res.entries; }
      } else {
        const res = await this.rpc("porra_list_entries", { p_code: this.pool.code }); entries = res.entries;
      }
      this.entries = entries || [];
      this.recomputeRanking();
    },

    // ---------- ver la quiniela de un participante ----------
    get canViewPicks() { return !!(this.pool && (this.pool.locked || this.adminOk)); },
    toggleDetail(id) {
      const e = this.entries.find((x) => x.id === id);
      if (!e) return;
      if (!e.picks) { this.toast("Las quinielas se revelan cuando se cierra la porra (para que nadie copie).", "warn"); return; }
      if (this.selectedId === id) { this.selectedId = null; this.det = null; }
      else { this.selectedId = id; this.det = this._computeDetail(id); }
    },
    _computeDetail(id) {
      const e = this.entries.find((x) => x.id === id);
      if (!e || !e.picks) return null;
      const dp = Eng.derivePicks(e.picks);
      const live = Eng.liveOutcome(this.results);
      const bd = Eng.scoreBreakdown(dp, live, this.settings);
      const ord = (set) => [...set].sort((a, b) => D.es(a).localeCompare(D.es(b)));
      return {
        name: e.first_name + " " + e.last_name,
        champion: dp.champion, finalists: ord(dp.final), semis: ord(dp.semis),
        cuartos: ord(dp.cuartos), octavos: ord(dp.octavos),
        groups: e.picks.groups || {}, thirds: e.picks.thirds || [], bd,
      };
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

    liveTable(L) { return Eng.groupStandings(L, this.results, false, null); },

    // ---------- clasificación + probabilidades ----------
    openLeaderboard() { this.tab = "leaderboard"; this.selectedId = null; this.det = null; this.refreshBoard(); },
    openResults() { this.tab = "results"; this.refreshLiveBracket(); },
    async refreshBoard() { await this.loadResults(); await this.loadEntries(); },
    recomputeRanking() {
      const live = Eng.liveOutcome(this.results); const S = this.settings;
      const arr = this.entries.map((e) => {
        let points = 0; if (e.picks) { try { points = Eng.scoreEntry(Eng.derivePicks(e.picks), live, S); } catch (x) {} }
        const pr = this.probData[e.id];
        return Object.assign({}, e, { points, win: pr ? pr.win : null, podium: pr ? pr.podium : null, avg: pr ? pr.avg : null });
      });
      arr.sort((a, b) => (b.points - a.points) || ((b.win || 0) - (a.win || 0)) || a.last_name.localeCompare(b.last_name));
      this.ranked = arr;
      if (this.selectedId) this.det = this._computeDetail(this.selectedId);
    },
    runProbabilities() {
      const mcEntries = this.entries.filter((e) => e.picks).map((e) => ({ id: e.id, picks: Eng.derivePicks(e.picks) }));
      if (!mcEntries.length) return this.toast("No hay quinielas guardadas todavía.", "warn");
      this.simN = mcEntries.length > 60 ? 1500 : mcEntries.length > 30 ? 2500 : 4000;
      this.probBusy = true;
      setTimeout(() => {
        try {
          const mc = Eng.monteCarlo(mcEntries, this.results, this.simN, this.settings, Math.random);
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
