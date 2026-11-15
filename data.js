/* ==========================================================================
   AI Governance Dashboard — SYNTHETIC DATA MODEL  (illustrative data only)

   Everything on the dashboard is derived from five record sets generated
   here with a fixed seed, so every KPI, chart and exception agrees:

     EMPLOYEES  1,100 synthetic people, each mapped to exactly one team
     OBS        usage observations: one row per identity x app x day
                (identity = mapped employee | unresolved account | service account)
                u = consumption units (tokens / credits / requests) where metered
     LEDGER     spend rows: one per day x app x team x component x quality
                derived from OBS (usage) + seats (derived from observed users)
                + expense-matched card charges
     LIMITS     app-level limits (USD, tokens, credits/requests) + one per-user cap
     BUDGETS    EXPLICIT monthly budget per team per month (never prorated)

   Day index 0 = 1 Sep 2026. "Today" in the scenario = 15 Nov 2026 (day 75).
   ========================================================================== */
(function (root) {
  'use strict';

  // ---------- deterministic randomness ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let rng = mulberry32(20261115);
  const rand = () => rng();
  const useSeed = n => { rng = mulberry32(20261115 + n * 7919); };
  const randInt = (a, b) => a + Math.floor(rand() * (b - a + 1));
  function normal() { // Box-Muller
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  const logn = s => Math.exp(s * normal() - (s * s) / 2); // mean = 1
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ---------- calendar ----------
  const ASOF = 75; // 15 Nov 2026
  const MONTHS = [
    { key: '2026-09', label: 'Sep 2026', start: 0, days: 30 },
    { key: '2026-10', label: 'Oct 2026', start: 30, days: 31 },
    { key: '2026-11', label: 'Nov 2026', start: 61, days: 30 },
  ];
  MONTHS.forEach(m => {
    m.end = m.start + m.days - 1;
    m.last = Math.min(m.end, ASOF);          // last day with data
    m.availDays = m.last - m.start + 1;      // days elapsed with data
    m.closed = m.end <= ASOF;
  });
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dayDate(d) { return new Date(Date.UTC(2026, 8, 1 + d)); }
  function dayLabel(d) { const x = dayDate(d); return MONTH_NAMES[x.getUTCMonth()] + ' ' + x.getUTCDate(); }

  // ---------- teams & explicit monthly budgets (USD) ----------
  const TEAMS = [
    { id: 'eng', name: 'Engineering', headcount: 360 },
    { id: 'sales', name: 'Sales', headcount: 240 },
    { id: 'support', name: 'Customer Support', headcount: 170 },
    { id: 'mkt', name: 'Marketing', headcount: 105 },
    { id: 'prod', name: 'Product & Design', headcount: 90 },
    { id: 'fin', name: 'Finance & Legal', headcount: 70 },
    { id: 'ppl', name: 'People & Operations', headcount: 65 },
  ];
  const TEAM_IDS = TEAMS.map(t => t.id);
  const TEAM = {}; TEAMS.forEach(t => (TEAM[t.id] = t));

  // Explicit monthly allocations set by Finance (assumption: NOT derived from an annual figure).
  // Org budget = sum of team allocations. Unallocated spend has no budget line.
  const BUDGETS = {
    '2026-10': { eng: 38000, sales: 12500, support: 8500, mkt: 7800, prod: 7000, fin: 3000, ppl: 2500 },
    '2026-11': { eng: 40000, sales: 13500, support: 9500, mkt: 7500, prod: 8000, fin: 3000, ppl: 2500 },
  };
  BUDGETS['2026-09'] = BUDGETS['2026-10'];
  // Organization-level monthly budget is its OWN number, set by Finance — not the sum of team allocations.
  // Anything above the team allocations is held centrally (covers spend that cannot be mapped to a team).
  const ORG_BUDGET = { '2026-09': 82000, '2026-10': 82000, '2026-11': 88000 };

  // ---------- employees ----------
  const EMP = [];
  { let n = 1; TEAMS.forEach(t => { for (let i = 0; i < t.headcount; i++) EMP.push({ id: 'E' + String(n++).padStart(4, '0'), team: t.id }); }); }
  // ~72% of employees are AI-active at all; app adoption is concentrated in that group (so users overlap across apps)
  const AI_SHARE = 0.72;
  useSeed(1);
  EMP.forEach(e => { e.ai = rand() < AI_SHARE; });

  // ---------- applications ----------
  //  approval : approved | unreviewed | not_approved   (governance decision)
  //  risk     : low | medium | high | not_assessed      (independent classification)
  //  src      : confirmed (SSO / admin API)  |  inferred (browser / network signals only)
  //  billing  : seat | usage | expense | none  (what kind of spend record exists)
  //  adopt    : final adoption probability per team, order = TEAM_IDS
  const A = (o) => Object.assign({ pre: 0.7, launchDay: 0, intensity: {}, sigma: 0.7, base: 0, svcShare: 0, unresolved: 0 }, o);
  const APPS = [
    A({ id: 'chatgpt_ent', name: 'ChatGPT Enterprise', vendor: 'OpenAI', approval: 'approved', risk: 'low', src: 'confirmed', via: 'SSO + admin API',
        billing: 'seat+usage', seatPrice: 30, usagePrice: 0.05, metric: { unit: 'credits' }, base: 215,
        spike: { from: 66, mult: 2.3 }, // agent-mode rollout on 6 Nov
        intensity: { eng: 0.7, sales: 1.4, support: 1.3, mkt: 1.0, prod: 0.9, fin: 0.5, ppl: 0.4 },
        growth: [0.7, 0.88, 1.0],
        adopt: [0.5, 0.55, 0.5, 0.6, 0.55, 0.4, 0.35] }),
    A({ id: 'chatgpt_personal', name: 'ChatGPT (personal accounts)', vendor: 'OpenAI', approval: 'not_approved', risk: 'high', src: 'inferred', via: 'Browser extension + network proxy',
        billing: 'expense', expenseAmt: 20, expenseProb: 0.08, unresolved: 14,
        adopt: [0.12, 0.12, 0.09, 0.15, 0.12, 0.07, 0.06] }),
    A({ id: 'claude', name: 'Claude', vendor: 'Anthropic', approval: 'approved', risk: 'low', src: 'confirmed', via: 'SSO + admin API',
        billing: 'seat+usage', seatPrice: 25, usagePrice: 7.5 / 1e6, metric: { unit: 'tokens' }, base: 4.6e6, svcShare: 0.12,
        intensity: { eng: 1.6, sales: 0.35, support: 0.3, mkt: 0.5, prod: 1.0, fin: 0.25, ppl: 0.2 },
        growth: [0.8, 1.0, 1.12],
        adopt: [0.5, 0.12, 0.1, 0.28, 0.5, 0.15, 0.08] }),
    A({ id: 'gh_copilot', name: 'GitHub Copilot', vendor: 'GitHub', approval: 'approved', risk: 'low', src: 'confirmed', via: 'SSO + admin API',
        billing: 'seat', seatPrice: 19, metric: { unit: 'premium requests' }, base: 540,
        intensity: { eng: 1.0, prod: 0.6 }, growth: [0.9, 1.0, 1.05],
        adopt: [0.8, 0, 0, 0, 0.12, 0, 0] }),
    A({ id: 'cursor', name: 'Cursor', vendor: 'Anysphere', approval: 'approved', risk: 'medium', src: 'confirmed', via: 'SSO + admin API',
        billing: 'seat+usage', seatPrice: 24, usagePrice: 0.1, metric: { unit: 'requests' }, base: 345, sigma: 1.15,
        intensity: { eng: 1.0, prod: 0.6 }, growth: [0.8, 1.0, 1.1],
        adopt: [0.55, 0, 0, 0, 0.2, 0, 0] }),
    A({ id: 'gemini', name: 'Gemini', vendor: 'Google', approval: 'approved', risk: 'low', src: 'confirmed', via: 'SSO + admin API',
        billing: 'seat+usage', seatPrice: 12, usagePrice: 3.3 / 1e6, metric: { unit: 'tokens' }, base: 2.25e6, svcShare: 0.2,
        intensity: { eng: 1.5, sales: 0.5, support: 0.5, mkt: 0.7, prod: 1.0, fin: 0.6, ppl: 0.4 },
        growth: [0.85, 1.0, 1.1],
        adopt: [0.24, 0.24, 0.24, 0.25, 0.25, 0.28, 0.24] }),
    A({ id: 'ms_copilot', name: 'Microsoft Copilot', vendor: 'Microsoft', approval: 'approved', risk: 'low', src: 'confirmed', via: 'SSO',
        billing: 'seat', seatPrice: 22,
        adopt: [0.2, 0.34, 0.4, 0.3, 0.25, 0.5, 0.5] }),
    A({ id: 'midjourney', name: 'Midjourney', vendor: 'Midjourney', approval: 'unreviewed', risk: 'medium', src: 'inferred', via: 'Browser extension',
        billing: 'expense', expenseAmt: 30, expenseProb: 0.5,
        adopt: [0, 0, 0, 0.35, 0.25, 0, 0] }),
    A({ id: 'perplexity', name: 'Perplexity', vendor: 'Perplexity AI', approval: 'unreviewed', risk: 'low', src: 'inferred', via: 'Browser extension',
        billing: 'expense', expenseAmt: 20, expenseProb: 0.3,
        adopt: [0.09, 0.07, 0.07, 0.11, 0.14, 0.1, 0.06] }),
    A({ id: 'jasper', name: 'Jasper', vendor: 'Jasper', approval: 'approved', risk: 'medium', src: 'confirmed', via: 'SSO + admin API',
        billing: 'seat', seatPrice: 49, metric: { unit: 'credits' }, base: 1480,
        spike: { from: 64, mult: 2.0 }, // campaign launch on 4 Nov
        intensity: { mkt: 1.0, sales: 0.8, prod: 0.8 }, growth: [0.85, 0.97, 1.05],
        adopt: [0, 0.02, 0, 0.55, 0.05, 0, 0] }),
    A({ id: 'notion_ai', name: 'Notion AI', vendor: 'Notion', approval: 'approved', risk: 'low', src: 'confirmed', via: 'SSO',
        billing: 'seat', seatPrice: 8,
        adopt: [0.25, 0.08, 0.08, 0.3, 0.4, 0.12, 0.3] }),
    A({ id: 'grammarly', name: 'Grammarly', vendor: 'Grammarly', approval: 'unreviewed', risk: 'medium', src: 'inferred', via: 'Browser extension',
        billing: 'none',
        adopt: [0.09, 0.19, 0.19, 0.22, 0.13, 0.16, 0.13] }),
    A({ id: 'deepseek', name: 'DeepSeek (consumer chat)', vendor: 'DeepSeek', approval: 'not_approved', risk: 'high', src: 'inferred', via: 'Network proxy',
        billing: 'none', launchDay: 27, unresolved: 9,
        adopt: [0.06, 0, 0, 0, 0.04, 0, 0] }),
    A({ id: 'chatpdf', name: 'ChatPDF', vendor: 'ChatPDF', approval: 'unreviewed', risk: 'high', src: 'inferred', via: 'Browser extension + network proxy',
        billing: 'none', launchDay: 63, unresolved: 6,
        adopt: [0.02, 0.03, 0.05, 0.08, 0.04, 0.07, 0.05] }),
    A({ id: 'fireflies', name: 'Fireflies.ai', vendor: 'Fireflies', approval: 'approved', risk: 'high', src: 'confirmed', via: 'SSO',
        billing: 'seat', seatPrice: 19,
        adopt: [0.03, 0.35, 0.3, 0.06, 0.1, 0.06, 0.06] }),
    A({ id: 'bolt', name: 'Bolt.new', vendor: 'StackBlitz', approval: 'unreviewed', risk: 'not_assessed', src: 'inferred', via: 'Browser extension',
        billing: 'expense', expenseAmt: 25, expenseProb: 0.4, launchDay: 49,
        adopt: [0.06, 0, 0, 0, 0.1, 0, 0] }),
  ];
  const APP = {}; APPS.forEach(a => (APP[a.id] = a));
  const APPIDX = {}; APPS.forEach((a, i) => (APPIDX[a.id] = i));

  // ---------- limits ----------
  //  kind: monetary (USD) | token | credit.  basis: spend (ledger USD) | units (metered consumption)
  const LIMITS = [
    { id: 'L1', app: 'chatgpt_ent', label: 'Usage credits (spend)', kind: 'monetary', basis: 'spend', comp: 'usage', limit: 4500, unit: 'USD', reset: 'monthly' },
    { id: 'L2', app: 'cursor', label: 'Usage-based spend', kind: 'monetary', basis: 'spend', comp: 'usage', limit: 6000, unit: 'USD', reset: 'monthly' },
    { id: 'L3', app: 'claude', label: 'API & Claude Code spend', kind: 'monetary', basis: 'spend', comp: 'usage', limit: 16000, unit: 'USD', reset: 'monthly' },
    { id: 'T1', app: 'claude', label: 'Token consumption', kind: 'token', basis: 'units', limit: 1.8e9, unit: 'tokens', reset: 'monthly' },
    { id: 'C1', app: 'jasper', label: 'AI credits', kind: 'credit', basis: 'units', limit: 50000, unit: 'credits', reset: 'monthly' },
    { id: 'C3', app: 'cursor', label: 'Agent requests', kind: 'credit', basis: 'units', limit: 18000, unit: 'requests', reset: 'weekly' },
  ];
  const USER_CAP = { id: 'U1', app: 'cursor', label: 'Per-user usage cap', limit: 60, unit: 'USD', reset: 'monthly' };

  // ---------- generate usage observations ----------
  const obs = [];          // {d,id,t,type,a,u}
  const activeMonths = []; // {emp,a,m,days[]}  one per employee x app x month with activity

  APPS.forEach(app => {
    const aIdx = APPIDX[app.id];
    useSeed(100 + aIdx);
    EMP.forEach(emp => {
      if (!emp.ai) return;
      const p = Math.min(0.97, (app.adopt[TEAM_IDS.indexOf(emp.team)] || 0) / AI_SHARE);
      if (rand() >= p) return;
      let adoptDay;
      if (app.launchDay > 0) adoptDay = app.launchDay + Math.floor((ASOF - app.launchDay) * Math.pow(rand(), 1.3));
      else adoptDay = rand() < app.pre ? -1 : Math.floor(ASOF * Math.pow(rand(), 1.1));
      const factor = logn(app.sigma) * (app.intensity[emp.team] != null ? app.intensity[emp.team] : 1);
      MONTHS.forEach((m, mi) => {
        const aStart = Math.max(m.start, adoptDay), aEnd = m.last;
        if (aStart > aEnd) return;
        if (rand() > 0.9) return; // not every adopter is active every month
        const avail = aEnd - aStart + 1;
        let k = randInt(3, 10);
        if (!m.closed) k = Math.max(2, Math.round(k * m.availDays / m.days));
        k = Math.min(k, avail);
        const pool = []; for (let d = aStart; d <= aEnd; d++) pool.push(d);
        const days = shuffle(pool).slice(0, k).sort((x, y) => x - y);
        const growth = app.growth ? app.growth[mi] : 1;
        const monthUnits = app.base * factor * growth * (avail / m.availDays) * (m.availDays / m.days);
        const w = days.map(() => 0.4 + rand() * 1.2); const ws = w.reduce((s, x) => s + x, 0);
        days.forEach((d, i) => {
          const spike = app.spike && d >= app.spike.from ? app.spike.mult : 1;
          obs.push({ d, id: emp.id, t: emp.team, type: 'employee', a: aIdx, u: app.base ? monthUnits * spike * w[i] / ws : 0 });
        });
        activeMonths.push({ emp, a: aIdx, m: mi, days });
      });
    });
    // unresolved identities (network-proxy sessions that cannot be mapped to an employee)
    for (let i = 0; i < app.unresolved; i++) {
      const id = 'X-' + app.id + '-' + String(i + 1).padStart(2, '0');
      const adoptDay = app.launchDay > 0 ? app.launchDay + Math.floor((ASOF - app.launchDay) * rand()) : Math.floor(rand() * 40);
      MONTHS.forEach(m => {
        const aStart = Math.max(m.start, adoptDay), aEnd = m.last;
        if (aStart > aEnd || rand() > 0.85) return;
        const pool = []; for (let d = aStart; d <= aEnd; d++) pool.push(d);
        shuffle(pool).slice(0, Math.min(pool.length, randInt(2, 6))).forEach(d => obs.push({ d, id, t: null, type: 'unresolved', a: aIdx, u: 0 }));
      });
    }
  });

  // service accounts (shared API keys, no team tag) for metered API apps
  APPS.filter(a => a.svcShare > 0).forEach(app => {
    const aIdx = APPIDX[app.id];
    useSeed(200 + aIdx);
    const perDay = {};
    obs.forEach(o => { if (o.a === aIdx && o.type === 'employee') perDay[o.d] = (perDay[o.d] || 0) + o.u; });
    Object.keys(perDay).forEach(d => {
      obs.push({ d: +d, id: 'SVC-' + app.id, t: null, type: 'service', a: aIdx, u: perDay[d] * app.svcShare / (1 - app.svcShare) * (0.85 + rand() * 0.3) });
    });
  });

  // ---------- generate spend ledger ----------
  //  q: billed (invoice / billing API) | expense (card or expense line matched to app) | estimated (usage x list price, not yet invoiced)
  const ledger = []; // {d,a,t,c,usd,q}
  // seats: derived from observed users per team per month (10% buffer), accrued evenly per day
  APPS.filter(a => a.seatPrice).forEach(app => {
    const aIdx = APPIDX[app.id];
    MONTHS.forEach((m, mi) => {
      const byTeam = {};
      activeMonths.forEach(x => { if (x.a === aIdx && x.m === mi) (byTeam[x.emp.team] = byTeam[x.emp.team] || new Set()).add(x.emp.id); });
      Object.keys(byTeam).forEach(t => {
        const seats = Math.ceil(byTeam[t].size * 1.1);
        for (let d = m.start; d <= m.last; d++) ledger.push({ d, a: aIdx, t, c: 'seat', usd: seats * app.seatPrice / m.days, q: 'billed' });
      });
    });
  });
  // usage: units x unit price, aggregated by day x app x team
  {
    const agg = new Map();
    obs.forEach(o => {
      const app = APPS[o.a];
      if (!app.usagePrice || !o.u) return;
      const key = o.d + '|' + o.a + '|' + (o.t || '');
      agg.set(key, (agg.get(key) || 0) + o.u * app.usagePrice);
    });
    agg.forEach((usd, key) => {
      const [d, a, t] = key.split('|'); const dd = +d;
      const m = MONTHS.find(x => dd >= x.start && dd <= x.end);
      ledger.push({ d: dd, a: +a, t: t || null, c: 'usage', usd, q: m.closed ? 'billed' : 'estimated' });
    });
  }
  // expense-matched card charges (actual money, attribution by merchant match)
  useSeed(300);
  activeMonths.forEach(x => {
    const app = APPS[x.a];
    if (!app.expenseAmt || rand() > app.expenseProb) return;
    const d = x.days[Math.floor(rand() * x.days.length)];
    ledger.push({ d, a: x.a, t: rand() < 0.35 ? null : x.emp.team, c: 'subscription', usd: app.expenseAmt, q: 'expense' });
  });

  // ==========================================================================
  //  SELECTORS  (everything the UI shows comes from compute())
  // ==========================================================================
  const PERIODS = {
    nov: { monthIdx: 2, label: 'Nov 2026 · month to date' },
    oct: { monthIdx: 1, label: 'Oct 2026 · closed' },
  };
  function windowOf(pKey) {
    const p = PERIODS[pKey], m = MONTHS[p.monthIdx];
    return { key: pKey, label: p.label, monthIdx: p.monthIdx, monthKey: m.key, monthName: m.label, monthStart: m.start, start: m.start, end: m.last, D: m.days, elapsed: m.availDays, partial: m.availDays < m.days };
  }
  function prevWindowOf(w) {
    const pm = MONTHS[w.monthIdx - 1];
    const elapsed = Math.min(w.elapsed, pm.days);
    return { monthIdx: w.monthIdx - 1, monthKey: pm.key, monthName: pm.label, monthStart: pm.start, start: pm.start, end: pm.start + elapsed - 1, D: pm.days, elapsed, partial: elapsed < pm.days };
  }
  const inTeam = (t, team) => team === 'all' || t === team;

  // latest complete Mon-Sun week ending on or before `end`; day 0 (1 Sep 2026) is a Tuesday
  function weekWindow(end) {
    const back = (((end + 1) % 7) - 6 + 7) % 7; // days since last Sunday
    const sun = end - back;
    return [sun - 6, sun];
  }

  function spendOf(w, team, filterFn) {
    const out = { total: 0, byQ: { billed: 0, expense: 0, estimated: 0 } };
    ledger.forEach(r => {
      if (r.d < w.start || r.d > w.end || !inTeam(r.t, team)) return;
      if (filterFn && !filterFn(r)) return;
      out.total += r.usd; out.byQ[r.q] += r.usd;
    });
    return out;
  }
  function spendByTeam(w) {
    const by = {}; TEAM_IDS.forEach(t => (by[t] = { total: 0, byQ: { billed: 0, expense: 0, estimated: 0 } }));
    by.unallocated = { total: 0, byQ: { billed: 0, expense: 0, estimated: 0 } };
    ledger.forEach(r => {
      if (r.d < w.start || r.d > w.end) return;
      const b = by[r.t || 'unallocated']; b.total += r.usd; b.byQ[r.q] += r.usd;
    });
    return by;
  }
  const projectFactor = w => (w.partial ? w.D / w.elapsed : 1);

  // observed users in a window: Map appId -> {mapped:Set, unresolved:Set}
  function usersOf(w, team) {
    const m = new Map(); APPS.forEach(a => m.set(a.id, { mapped: new Set(), unresolved: new Set() }));
    obs.forEach(o => {
      if (o.d < w.start || o.d > w.end || o.type === 'service' || !inTeam(o.t, team)) return;
      const e = m.get(APPS[o.a].id);
      (o.type === 'employee' ? e.mapped : e.unresolved).add(o.id);
    });
    return m;
  }
  function usageSum(L, ws, we, team, byTeam) {
    const aIdx = APPIDX[L.app]; let q = 'billed'; const by = {};
    let total = 0;
    if (L.basis === 'spend') {
      ledger.forEach(r => {
        if (r.a !== aIdx || r.c !== L.comp || r.d < ws || r.d > we) return;
        by[r.t || 'unallocated'] = (by[r.t || 'unallocated'] || 0) + r.usd;
        if (inTeam(r.t, team)) { total += r.usd; if (r.q === 'estimated') q = 'estimated'; }
      });
    } else {
      obs.forEach(o => {
        if (o.a !== aIdx || o.d < ws || o.d > we || !o.u) return;
        by[o.t || 'unallocated'] = (by[o.t || 'unallocated'] || 0) + o.u;
        if (inTeam(o.t, team)) total += o.u;
      });
    }
    return byTeam ? { total, by, q } : { total, q };
  }
  function evalLimit(L, w, team) {
    let ws, we, factor = 1, label;
    if (L.reset === 'weekly') { [ws, we] = weekWindow(w.end); label = 'Latest full week ' + dayLabel(ws) + ' – ' + dayLabel(we); }
    else { ws = w.monthStart; we = w.end; factor = projectFactor(w); label = w.partial ? w.monthName + ' to date' : w.monthName; }
    const all = usageSum(L, ws, we, 'all', true);
    const used = all.total, projected = used * factor;
    const teamUsed = team === 'all' ? used : (all.by[team] || 0);
    const rank = Object.keys(all.by).sort((a, b) => all.by[b] - all.by[a])[0];
    const status = used >= L.limit ? 'exceeded' : projected > L.limit ? 'projected' : 'ok';
    const resetsOn = L.reset === 'weekly' ? 'Mondays'
      : (w.partial ? dayLabel(MONTHS[w.monthIdx].end + 1) : dayLabel(MONTHS[w.monthIdx].end + 1));
    return {
      L, app: APP[L.app], used, projected, pct: used / L.limit, projPct: projected / L.limit, teamUsed, teamShare: used ? teamUsed / used : 0,
      status, windowLabel: label, resetsOn, estimatedProjection: factor !== 1,
      quality: L.basis === 'spend' && all.q === 'estimated' ? 'Estimated' : 'Actual',
      topTeam: rank ? { id: rank, name: rank === 'unallocated' ? 'Unallocated (shared keys / unmapped)' : TEAM[rank].name, share: used ? all.by[rank] / used : 0 } : null,
    };
  }
  function userCap(w, team) {
    const cap = USER_CAP, aIdx = APPIDX[cap.app], price = APP[cap.app].usagePrice;
    const per = {};
    obs.forEach(o => { if (o.a === aIdx && o.type === 'employee' && o.d >= w.monthStart && o.d <= w.end && inTeam(o.t, team)) { (per[o.id] = per[o.id] || { t: o.t, usd: 0 }).usd += o.u * price; } });
    const over = Object.values(per).filter(x => x.usd > cap.limit);
    const byTeam = {}; over.forEach(x => (byTeam[x.t] = (byTeam[x.t] || 0) + 1));
    return { cap, users: Object.keys(per).length, over: over.length, max: over.reduce((m, x) => Math.max(m, x.usd), 0), byTeam };
  }

  // ---------- daily series (pure, additive): cumulative spend per day of a month, from the ledger ----------
  function dayBuckets(monthIdx, team) {
    const m = MONTHS[monthIdx], daily = new Array(m.days).fill(0);
    const q = { billed: new Array(m.days).fill(0), expense: new Array(m.days).fill(0), estimated: new Array(m.days).fill(0) };
    ledger.forEach(r => {
      if (r.d < m.start || r.d > m.end || !inTeam(r.t, team)) return;
      const i = r.d - m.start; daily[i] += r.usd; q[r.q][i] += r.usd;
    });
    return { m, daily, q };
  }
  function spendSeries(w, team, budget, projected) {
    const cur = dayBuckets(w.monthIdx, team), n = w.elapsed;
    const cum = [], cumQ = [], daily = []; let c = 0; const cq = { billed: 0, expense: 0, estimated: 0 };
    for (let i = 0; i < n; i++) {
      c += cur.daily[i]; daily.push(cur.daily[i]); cum.push(c);
      for (const k in cq) cq[k] += cur.q[k][i];
      cumQ.push({ billed: cq.billed, expense: cq.expense, estimated: cq.estimated });
    }
    let prev = null;
    if (w.monthIdx > 0) {
      const p = dayBuckets(w.monthIdx - 1, team), pc = []; let t = 0;
      p.daily.forEach(v => { t += v; pc.push(t); });
      prev = { name: p.m.label, D: p.m.days, cum: pc };
    }
    const labels = []; for (let i = 0; i < w.D; i++) labels.push(dayLabel(w.monthStart + i));
    return { monthName: w.monthName, monthStart: w.monthStart, D: w.D, elapsed: n, partial: w.partial, labels, daily, cum, cumQ, budget, projected, prev };
  }

  // ---------- team usage (pure, additive): how many people on each team used AI in the window ----------
  function teamUsage(w) {
    const act = {}, uns = {}; TEAM_IDS.forEach(t => { act[t] = new Set(); uns[t] = new Set(); });
    obs.forEach(o => {
      if (o.d < w.start || o.d > w.end || o.type !== 'employee') return;
      act[o.t].add(o.id); if (APPS[o.a].approval !== 'approved') uns[o.t].add(o.id);
    });
    return TEAMS.map(t => ({ id: t.id, headcount: t.headcount, active: act[t.id].size, share: act[t.id].size / t.headcount,
      unapproved: uns[t.id].size, unapprovedShare: act[t.id].size ? uns[t.id].size / act[t.id].size : 0 }));
  }

  // ---------- formatting helpers ----------
  const fmt = {
    usd: n => '$' + Math.round(n).toLocaleString('en-US'),
    usdK: n => (Math.abs(n) >= 10000 ? '$' + (n / 1000).toFixed(1) + 'k' : '$' + Math.round(n).toLocaleString('en-US')),
    int: n => Math.round(n).toLocaleString('en-US'),
    pct: (n, d) => (n * 100).toFixed(d == null ? 0 : d) + '%',
    units: (n, unit) => {
      if (unit === 'tokens') return n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : (n / 1e6).toFixed(0) + 'M';
      if (unit === 'USD') return fmt.usd(n);
      return Math.round(n).toLocaleString('en-US');
    },
    unitsFull: (n, unit) => unit === 'USD' ? fmt.usd(n) : (fmt.units(n, unit) + ' ' + unit),
    signed: n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n),
  };

  const DISCOVERY_SOURCES = [
    { name: 'SSO / identity provider', cover: '100% of employees' },
    { name: 'Browser extension', cover: '78% of managed devices' },
    { name: 'Network proxy', cover: 'Office + VPN traffic only' },
    { name: 'Expense & card feed', cover: '3 of 4 card programs' },
  ];

  // ==========================================================================
  //  compute(): the single model the UI renders
  // ==========================================================================
  function compute(periodKey, team) {
    team = team || 'all';
    const w = windowOf(periodKey), pw = prevWindowOf(w);
    const teamName = team === 'all' ? 'All teams' : TEAM[team].name;

    // ----- spend & budget -----
    const sp = spendOf(w, team), spPrev = spendOf(pw, team);
    const budgetMap = BUDGETS[w.monthKey];
    const orgBudget = ORG_BUDGET[w.monthKey];
    const teamAllocTotal = TEAM_IDS.reduce((s, t) => s + budgetMap[t], 0);
    const byTeam = spendByTeam(w);
    const budget = team === 'all' ? orgBudget : budgetMap[team];
    const projSpend = sp.total * projectFactor(w);
    const kpiSpend = {
      spend: sp.total, byQ: sp.byQ, budget, remaining: budget - sp.total, scope: team === 'all' ? 'Organization' : teamName,
      unassignedBudget: team === 'all' ? orgBudget - teamAllocTotal : null, unallocatedSpend: team === 'all' ? byTeam.unallocated.total : null,
      pctBudget: sp.total / budget, projected: projSpend, projPct: projSpend / budget,
      estimatedProjection: w.partial, deltaPct: spPrev.total ? sp.total / spPrev.total - 1 : null,
      deltaBase: pw.monthName + (pw.partial ? ' (days 1–' + pw.elapsed + ')' : ''),
      status: sp.total >= budget ? 'over' : projSpend > budget ? 'projected' : 'ok',
      day: w.elapsed, days: w.D,
    };

    // ----- chart 1: team spend vs monthly budget -----
    const chart1 = {
      teams: TEAMS.map(t => {
        const s = byTeam[t.id], b = budgetMap[t.id], pr = s.total * projectFactor(w);
        return { id: t.id, name: t.name, spend: s.total, byQ: s.byQ, budget: b, remaining: b - s.total, projected: pr, pct: s.total / b, projPct: pr / b,
          status: s.total >= b ? 'over' : pr > b ? 'projected' : 'ok', dim: team !== 'all' && team !== t.id };
      }),
      unallocated: { spend: byTeam.unallocated.total, byQ: byTeam.unallocated.byQ, projected: byTeam.unallocated.total * projectFactor(w), dim: team !== 'all' },
      partial: w.partial, day: w.elapsed, days: w.D, monthName: w.monthName, orgBudget, teamAllocTotal, unassignedBudget: orgBudget - teamAllocTotal,
    };
    chart1.teams.sort((a, b) => b.spend - a.spend);
    const unallocTotalShare = sp.total && team === 'all' ? byTeam.unallocated.total / sp.total : null;

    // ----- limits -----
    const limitEvals = LIMITS.map(L => evalLimit(L, w, team)).filter(e => team === 'all' || e.teamUsed > 0);
    const prevEvals = LIMITS.map(L => evalLimit(L, pw, team)).filter(e => team === 'all' || e.teamUsed > 0);
    const uc = userCap(w, team), ucPrev = userCap(pw, team);
    const cnt = (arr, s) => arr.filter(e => e.status === s).length;
    const kpiLimits = {
      exceeded: cnt(limitEvals, 'exceeded'), projected: cnt(limitEvals, 'projected'), ok: cnt(limitEvals, 'ok'), total: limitEvals.length,
      byKind: s => ['monetary', 'token', 'credit'].map(k => ({ kind: k, n: limitEvals.filter(e => e.status === s && e.L.kind === k).length })).filter(x => x.n),
      usersOver: uc.over, prevExceeded: cnt(prevEvals, 'exceeded'), prevProjected: cnt(prevEvals, 'projected'), prevUsersOver: ucPrev.over,
      deltaBase: pw.monthName + (pw.partial ? ' (days 1–' + pw.elapsed + ')' : ''), partial: w.partial,
    };
    const chart2 = {
      groups: [
        { kind: 'monetary', title: 'Monetary spend limits', sub: 'USD · all reset monthly · ordered by status, then % used', rows: limitEvals.filter(e => e.L.kind === 'monetary') },
        { kind: 'token', title: 'Token consumption limits', sub: 'Tokens · all reset monthly · ordered by status, then % used', rows: limitEvals.filter(e => e.L.kind === 'token') },
        { kind: 'credit', title: 'Credit & request limits', sub: 'Credits and requests differ by vendor; reset period varies · ordered by status, then name — not ranked by %', rows: limitEvals.filter(e => e.L.kind === 'credit') },
      ],
      userCap: uc, team, teamName, partial: w.partial,
    };
    // ordered by status first; % ranking only inside panels whose rows share one unit and reset period.
    // The credit/request panel mixes units (credits, requests, premium requests; monthly + weekly), so it is NOT ranked by %.
    const sev = { exceeded: 0, projected: 1, ok: 2 };
    chart2.groups.forEach(g => g.rows.sort((a, b) => sev[a.status] - sev[b.status] || (g.kind === 'credit' ? a.app.name.localeCompare(b.app.name) : b.pct - a.pct)));

    // ----- app usage & governance -----
    const users = usersOf(w, team), usersPrev = usersOf(pw, team);
    const spendByApp = {}; ledger.forEach(r => {
      if (r.d < w.start || r.d > w.end || !inTeam(r.t, team)) return;
      const k = APPS[r.a].id; (spendByApp[k] = spendByApp[k] || { total: 0, byQ: { billed: 0, expense: 0, estimated: 0 } });
      spendByApp[k].total += r.usd; spendByApp[k].byQ[r.q] += r.usd;
    });
    const appRows = APPS.map(a => {
      const u = users.get(a.id), up = usersPrev.get(a.id);
      const n = u.mapped.size + u.unresolved.size;
      return { app: a, users: n, mapped: u.mapped.size, unresolved: u.unresolved.size, prevUsers: up.mapped.size + up.unresolved.size,
        spend: spendByApp[a.id] || null };
    }).filter(r => r.users > 0).sort((a, b) => b.users - a.users);

    // org-level unique employees (deduplicated across apps) — NOT a sum of app counts
    const empAll = new Set(), empUnapproved = new Set(); let unresolvedAccts = 0, unresolvedUnapproved = 0;
    appRows.forEach(r => {
      const u = users.get(r.app.id);
      u.mapped.forEach(id => { empAll.add(id); if (r.app.approval !== 'approved') empUnapproved.add(id); });
      unresolvedAccts += u.unresolved.size; if (r.app.approval !== 'approved') unresolvedUnapproved += u.unresolved.size;
    });
    const empAllPrev = new Set(), empUnapprovedPrev = new Set();
    usersPrev.forEach((u, id) => u.mapped.forEach(e => { empAllPrev.add(e); if (APP[id].approval !== 'approved') empUnapprovedPrev.add(e); }));
    const headcount = team === 'all' ? EMP.length : TEAM[team].headcount;

    const count = (key, val) => appRows.filter(r => r.app[key] === val).length;
    const firstSeen = new Map(); // appId -> first observed day (all time)
    obs.forEach(o => { const id = APPS[o.a].id; if (o.type !== 'service' && (!firstSeen.has(id) || o.d < firstSeen.get(id))) firstSeen.set(id, o.d); });
    const newApps = appRows.filter(r => firstSeen.get(r.app.id) >= w.start).length;
    const unapprovedSpend = appRows.filter(r => r.app.approval !== 'approved').reduce((s, r) => s + (r.spend ? r.spend.total : 0), 0);
    const unapprovedNoSpend = appRows.filter(r => r.app.approval !== 'approved' && !(r.spend && r.spend.total > 0)).length;
    const unapprovedCount = appRows.filter(r => r.app.approval !== 'approved').length;
    const kpiInventory = {
      total: appRows.length, newApps,
      approval: { approved: count('approval', 'approved'), unreviewed: count('approval', 'unreviewed'), not_approved: count('approval', 'not_approved') },
      risk: { low: count('risk', 'low'), medium: count('risk', 'medium'), high: count('risk', 'high'), not_assessed: count('risk', 'not_assessed') },
      unapprovedSpend, unapprovedNoSpend, unapprovedCount,
      confirmedApps: appRows.filter(r => r.app.src === 'confirmed').length, inferredApps: appRows.filter(r => r.app.src === 'inferred').length,
    };
    const kpiUnapproved = {
      employees: empUnapproved.size, activeEmployees: empAll.size, share: empAll.size ? empUnapproved.size / empAll.size : 0,
      prevEmployees: empUnapprovedPrev.size, unresolved: unresolvedUnapproved, headcount, activeShare: empAll.size / headcount,
      prevActive: empAllPrev.size,
      deltaBase: pw.monthName + (pw.partial ? ' (days 1–' + pw.elapsed + ')' : ''),
    };

    // ----- attention table -----
    const rows = [];
    limitEvals.filter(e => e.status !== 'ok').forEach(e => {
      const L = e.L, U = L.unit;
      const scopeTxt = team === 'all' ? '' : ' · ' + teamName + ' share ' + fmt.pct(e.teamShare);
      const top = e.topTeam ? ' · Top consumer: ' + e.topTeam.name + ' (' + fmt.pct(e.topTeam.share) + ')' : '';
      const isEx = e.status === 'exceeded';
      const kindTag = L.kind === 'monetary' ? 'spend' : L.kind === 'token' ? 'token' : 'credit';
      rows.push({
        key: L.id, tier: isEx ? 0 : 1, typeOrder: { monetary: 0, token: 1, credit: 2 }[L.kind], sort: L.kind === 'credit' ? 0 : e.pct,
        issues: [isEx ? 'exceeded' : 'projected'], issueLabel: isEx ? ({ spend: 'Spend', token: 'Token', credit: 'Credit' }[kindTag]) + ' limit exceeded' : 'On pace to exceed ' + kindTag + ' limit',
        status: e.status, item: e.app.name + ' — ' + L.label, sublabel: L.label + ' · ' + (L.reset === 'weekly' ? 'weekly reset' : 'monthly reset'),
        topConsumer: e.topTeam ? e.topTeam.name + ' ' + fmt.pct(e.topTeam.share) : '',
        main: fmt.unitsFull(e.used, U) + ' of ' + fmt.unitsFull(L.limit, U),
        sub: fmt.pct(e.pct) + ' used' + (isEx || !e.estimatedProjection ? '' : ' · on pace for ' + fmt.pct(e.projPct)),
        detail: fmt.unitsFull(e.used, U) + ' of ' + fmt.unitsFull(L.limit, U) + ' (' + fmt.pct(e.pct) + ')'
          + (isEx ? '' : ' · pace points to ~' + fmt.unitsFull(e.projected, U) + ' (' + fmt.pct(e.projPct) + ')')
          + ' · ' + (L.reset === 'weekly' ? 'weekly reset' : 'monthly reset') + top + scopeTxt,
        scope: 'Org-wide app limit', app: e.app, evidence: isEx ? e.quality : 'Estimated',
        next: isEx
          ? (L.kind === 'monetary' ? 'Decide: raise the cap or slow usage' : 'Check overage terms; decide on a top-up')
          : 'Review usage before the limit is hit',
      });
    });
    if (uc.over > 0) {
      const teamsTxt = Object.keys(uc.byTeam).sort((a, b) => uc.byTeam[b] - uc.byTeam[a]).map(t => TEAM[t].name + ' ' + uc.byTeam[t]).join(', ');
      rows.push({
        key: 'U1', tier: 2, typeOrder: 0, sort: uc.over, issues: ['usercap'], issueLabel: 'Per-user cap exceeded', status: 'exceeded',
        item: APP[uc.cap.app].name + ' — ' + uc.cap.label, sublabel: uc.cap.label + ' · ' + fmt.usd(uc.cap.limit) + ' per user, monthly',
        main: uc.over + ' of ' + uc.users + ' users over cap', sub: 'highest ' + fmt.usd(uc.max) + ' (' + fmt.pct(uc.max / uc.cap.limit) + ' of cap)',
        detail: uc.over + ' of ' + uc.users + ' users over the ' + fmt.usd(uc.cap.limit) + ' monthly cap · highest ' + fmt.usd(uc.max) + ' (' + fmt.pct(uc.max / uc.cap.limit) + ') · ' + teamsTxt,
        scope: 'Per-user limit (individuals not named here)', app: APP[uc.cap.app], evidence: w.partial ? 'Estimated' : 'Actual',
        next: 'Review heavy users with their team lead',
      });
    }
    appRows.forEach(r => {
      const a = r.app, issues = [];
      if (a.approval === 'unreviewed' || a.approval === 'not_approved') issues.push('approval');
      if (a.risk === 'high') issues.push('highrisk');
      if (!issues.length) return;
      const qn = { billed: 'billed', expense: 'card/expense', estimated: 'estimated' };
      const spendTxt = r.spend && r.spend.total > 0
        ? fmt.usd(r.spend.total) + ' ' + Object.keys(qn).filter(k => r.spend.byQ[k] > 0).map(k => qn[k]).join(' + ') + ' spend'
        : 'no spend record';
      const labels = [];
      if (a.approval === 'not_approved') labels.push('Not approved, still in use');
      if (a.approval === 'unreviewed') labels.push('Unreviewed, in use');
      if (a.risk === 'high') labels.push(a.approval === 'approved' ? 'Approved, high risk' : 'High risk');
      const next = a.approval === 'not_approved' ? 'Confirm the block works; follow up with users'
        : a.approval === 'unreviewed' && a.risk === 'high' ? 'Run the security review first, then decide'
        : a.approval === 'unreviewed' ? 'Review, then approve or block'
        : 'Check the required controls are in place';
      rows.push({
        key: 'G-' + a.id, tier: a.approval === 'not_approved' ? 3 : a.approval === 'unreviewed' && a.risk === 'high' ? 4 : a.risk === 'high' ? 5 : 6, typeOrder: 0, sort: r.users, issues, issueLabel: labels.join(' · '), status: 'gov',
        item: a.name, sublabel: a.via,
        main: fmt.int(r.mapped) + ' employees' + (r.unresolved ? ' + ' + r.unresolved + ' unmatched accounts' : ''), sub: spendTxt,
        detail: fmt.int(r.mapped) + ' employees' + (r.unresolved ? ' + ' + r.unresolved + ' unmatched accounts' : '') + ' observed · ' + spendTxt,
        scope: a.via, app: a, evidence: a.src === 'inferred' ? 'Inferred' : 'Actual', next,
      });
    });
    rows.sort((x, y) => x.tier - y.tier || x.typeOrder - y.typeOrder || y.sort - x.sort || x.item.localeCompare(y.item));
    const chipCounts = { all: rows.length, exceeded: 0, projected: 0, usercap: 0, approval: 0, highrisk: 0 };
    rows.forEach(r => r.issues.forEach(i => chipCounts[i]++));

    // ----- data-trust strip (spend-data quality vs. discovery coverage are separate) -----
    const trust = {
      spend: { total: sp.total, byQ: sp.byQ },
      discovery: { sources: DISCOVERY_SOURCES, confirmedApps: kpiInventory.confirmedApps, inferredApps: kpiInventory.inferredApps, total: appRows.length },
    };

    return {
      team, teamName, periodKey, w, pw, asOf: dayLabel(ASOF) + ', 2026',
      kpi: { spend: kpiSpend, limits: kpiLimits, inventory: kpiInventory, unapproved: kpiUnapproved },
      chart1, chart2, chart3: { rows: appRows, teamName }, table: { rows, chipCounts }, trust, unallocShare: unallocTotalShare,
      series: spendSeries(w, team, budget, projSpend), teamUsage: teamUsage(w),
    };
  }

  const api = { compute, fmt, TEAMS, TEAM, APPS, APP, LIMITS, USER_CAP, BUDGETS, ORG_BUDGET, EMP, MONTHS, PERIODS, dayLabel,
    _raw: { obs, ledger, activeMonths, windowOf, prevWindowOf, spendOf, usersOf, evalLimit, userCap, spendByTeam } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AIGOV = api;
})(typeof window !== 'undefined' ? window : globalThis);
