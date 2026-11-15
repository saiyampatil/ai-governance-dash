// Independent QA audit: recomputes every headline number straight from the raw records
// (ledger / usage observations) with separate code, then compares to AIGOV.compute() for all period x team combos.
// Run: node audit.js   (exit code 1 on any mismatch)
const D = require('./data.js');
const R = D._raw;
let fails = 0, passes = 0;
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e * Math.max(1, Math.abs(a), Math.abs(b));
const eq = (cond, msg) => { if (cond) passes++; else { fails++; console.log('  MISMATCH ✗', msg); } };

// calendar facts, derived independently with real Date objects (day 0 = 1 Sep 2026)
const date = d => new Date(Date.UTC(2026, 8, 1 + d));
const PERIOD = { nov: { start: 61, end: 75, D: 30, elapsed: 15, prev: { start: 30, end: 44, D: 31, elapsed: 15 } },
                 oct: { start: 30, end: 60, D: 31, elapsed: 31, prev: { start: 0, end: 29, D: 30, elapsed: 30 } } };
const lastSundayOnOrBefore = d => { while (date(d).getUTCDay() !== 0) d--; return d; };
eq(date(75).getUTCDate() === 15 && date(75).getUTCMonth() === 10, 'day 75 = 15 Nov');
eq(date(75).getUTCDay() === 0, '15 Nov 2026 is a Sunday (weekly window ends there)');
eq(D.dayLabel(69) === 'Nov 9' && date(69).getUTCDay() === 1, 'week window starts Monday 9 Nov');

const appOf = r => D.APPS[r.a];
const sum = (rows, f) => rows.reduce((s, r) => s + f(r), 0);
const inRange = (d, s, e) => d >= s && d <= e;

for (const pk of ['nov', 'oct']) {
  const P = PERIOD[pk];
  for (const team of ['all', ...D.TEAMS.map(t => t.id)]) {
    const tag = `[${pk}/${team}]`;
    const m = D.compute(pk, team);
    const teamOk = t => team === 'all' || t === team;

    // ---- 1. spend, quality split, budget, remaining, projection ----
    const rows = R.ledger.filter(r => inRange(r.d, P.start, P.end) && teamOk(r.t));
    const spend = sum(rows, r => r.usd);
    eq(near(spend, m.kpi.spend.spend), `${tag} spend ${spend} vs ${m.kpi.spend.spend}`);
    for (const q of ['billed', 'expense', 'estimated'])
      eq(near(sum(rows.filter(r => r.q === q), r => r.usd), m.kpi.spend.byQ[q]), `${tag} quality ${q}`);
    const monthKey = pk === 'nov' ? '2026-11' : '2026-10';
    const teamBud = D.BUDGETS[monthKey];
    const budget = team === 'all' ? D.ORG_BUDGET[monthKey] : teamBud[team];
    eq(near(budget, m.kpi.spend.budget), `${tag} budget ${budget} vs ${m.kpi.spend.budget}`);
    eq(near(spend / budget, m.kpi.spend.pctBudget), `${tag} % used`);
    eq(near(budget - spend, m.kpi.spend.remaining), `${tag} remaining = budget - spend`);
    const proj = spend * P.D / P.elapsed;
    eq(near(proj, m.kpi.spend.projected), `${tag} projected = spend x D/elapsed (${P.D}/${P.elapsed})`);
    const expectStatus = spend >= budget ? 'over' : proj > budget ? 'projected' : 'ok';
    eq(expectStatus === m.kpi.spend.status, `${tag} budget status ${expectStatus} vs ${m.kpi.spend.status}`);
    const prevSpend = sum(R.ledger.filter(r => inRange(r.d, P.prev.start, P.prev.end) && teamOk(r.t)), r => r.usd);
    eq(near(spend / prevSpend - 1, m.kpi.spend.deltaPct), `${tag} spend delta vs comparable prior window`);

    // ---- 2. team bars reconcile to the organization ----
    if (team === 'all') {
      const byTeam = {}; D.TEAMS.forEach(t => (byTeam[t.id] = 0)); let un = 0;
      rows.forEach(r => { if (r.t) byTeam[r.t] += r.usd; else un += r.usd; });
      m.chart1.teams.forEach(t => {
        eq(near(byTeam[t.id], t.spend), `${tag} team ${t.id} spend`);
        eq(near(teamBud[t.id] - byTeam[t.id], t.remaining), `${tag} team ${t.id} remaining`);
        const st = byTeam[t.id] >= teamBud[t.id] ? 'over' : byTeam[t.id] * P.D / P.elapsed > teamBud[t.id] ? 'projected' : 'ok';
        eq(st === t.status, `${tag} team ${t.id} status`);
      });
      eq(near(un, m.chart1.unallocated.spend), `${tag} unallocated spend`);
      eq(near(Object.values(byTeam).reduce((a, b) => a + b, 0) + un, spend), `${tag} teams + unallocated = org spend`);
      const alloc = D.TEAMS.reduce((s, t) => s + teamBud[t.id], 0);
      eq(D.ORG_BUDGET[monthKey] >= alloc, `${tag} org budget >= sum of team allocations`);
    }

    // ---- 3. limits: separate bases, correct reset windows, correct status ----
    const evals = m.chart2.groups.flatMap(g => g.rows);
    D.LIMITS.forEach(L => {
      let ws = P.start, we = P.end, factor = P.D / P.elapsed;
      if (L.reset === 'weekly') { we = lastSundayOnOrBefore(P.end); ws = we - 6; factor = 1; }
      let used = 0, teamUsed = 0;
      if (L.basis === 'spend') R.ledger.forEach(r => { if (appOf(r).id === L.app && r.c === L.comp && inRange(r.d, ws, we)) { used += r.usd; if (teamOk(r.t)) teamUsed += r.usd; } });
      else R.obs.forEach(o => { if (APPS_ID(o) === L.app && inRange(o.d, ws, we)) { used += o.u; if (teamOk(o.t)) teamUsed += o.u; } });
      const e = evals.find(x => x.L.id === L.id);
      if (team !== 'all' && teamUsed === 0) { eq(!e, `${tag} ${L.id} hidden when team has no consumption`); return; }
      eq(!!e, `${tag} ${L.id} present`); if (!e) return;
      eq(near(used, e.used), `${tag} ${L.id} used ${used} vs ${e.used}`);
      const status = used >= L.limit ? 'exceeded' : used * factor > L.limit ? 'projected' : 'ok';
      eq(status === e.status, `${tag} ${L.id} status ${status} vs ${e.status}`);
      eq(L.kind === 'monetary' ? e.L.unit === 'USD' : e.L.unit !== 'USD', `${tag} ${L.id} unit class`);
    });
    const groupKinds = m.chart2.groups.map(g => g.rows.every(r => r.L.kind === g.kind));
    eq(groupKinds.every(Boolean), `${tag} each chart-2 panel holds one limit kind`);
    // per-user cap
    const per = {}; const cur = D.APP.cursor, ci = D.APPS.indexOf(cur);
    R.obs.forEach(o => { if (o.a === ci && o.type === 'employee' && inRange(o.d, P.start, P.end) && teamOk(o.t)) per[o.id] = (per[o.id] || 0) + o.u * cur.usagePrice; });
    eq(Object.values(per).filter(x => x > D.USER_CAP.limit).length === m.chart2.userCap.over, `${tag} per-user cap breaches`);

    // ---- 4. users: app-level vs organization-level dedupe ----
    const byApp = {}; const empAll = new Set(), empUn = new Set(); let unresolvedUn = 0; const unresSeen = new Set();
    R.obs.forEach(o => {
      if (!inRange(o.d, P.start, P.end) || o.type === 'service' || !teamOk(o.t)) return;
      const id = APPS_ID(o); (byApp[id] = byApp[id] || new Set()).add(o.id);
      if (o.type === 'employee') { empAll.add(o.id); if (D.APP[id].approval !== 'approved') empUn.add(o.id); }
      else if (D.APP[id].approval !== 'approved' && !unresSeen.has(o.id)) { unresSeen.add(o.id); unresolvedUn++; }
    });
    m.chart3.rows.forEach(r => eq(byApp[r.app.id].size === r.users, `${tag} app users ${r.app.id}`));
    eq(Object.keys(byApp).length === m.chart3.rows.length, `${tag} every active app listed in chart 3`);
    eq(empAll.size === m.kpi.unapproved.activeEmployees, `${tag} deduped active employees ${empAll.size} vs ${m.kpi.unapproved.activeEmployees}`);
    eq(empUn.size === m.kpi.unapproved.employees, `${tag} deduped unapproved employees`);
    eq(unresolvedUn === m.kpi.unapproved.unresolved, `${tag} unresolved unapproved accounts`);
    const summed = Object.values(byApp).reduce((s, x) => s + x.size, 0);
    eq(empAll.size <= summed, `${tag} dedupe never exceeds the app-level sum`);
    if (team === 'all') eq(empAll.size < summed, `${tag} dedupe is strictly lower than summed app counts (${empAll.size} < ${summed})`);

    // ---- 5. governance fields are independent attributes ----
    const inv = m.kpi.inventory;
    eq(inv.approval.approved + inv.approval.unreviewed + inv.approval.not_approved === inv.total, `${tag} approval split sums`);
    eq(inv.risk.low + inv.risk.medium + inv.risk.high + inv.risk.not_assessed === inv.total, `${tag} risk split sums`);

    // ---- 6. table rows == KPI counts; evidence labels ----
    const tr = m.table.rows;
    eq(tr.filter(r => r.issues.includes('exceeded')).length === m.kpi.limits.exceeded, `${tag} table exceeded == KPI`);
    eq(tr.filter(r => r.issues.includes('projected')).length === m.kpi.limits.projected, `${tag} table projected == KPI`);
    tr.forEach(r => {
      if (r.status === 'projected') eq(r.evidence === 'Estimated', `${tag} ${r.key} projected rows are Estimated`);
      if (r.status === 'gov') eq(r.evidence === (r.app.src === 'inferred' ? 'Inferred' : 'Actual'), `${tag} ${r.key} governance evidence label`);
      if (r.status === 'exceeded' && r.key !== 'U1') {
        const L = D.LIMITS.find(x => x.id === r.key);
        const estimated = L.basis === 'spend' && pk === 'nov';
        eq(r.evidence === (estimated ? 'Estimated' : 'Actual'), `${tag} ${r.key} exceeded evidence label`);
      }
    });
    // ordering rule: tier never decreases
    for (let i = 1; i < tr.length; i++) eq(tr[i - 1].tier <= tr[i].tier, `${tag} table order by tier`);

    // ---- 7. inferred activity never becomes spend ----
    const ledgerApps = new Set(rows.map(r => appOf(r).id));
    m.chart3.rows.filter(r => r.app.billing === 'none').forEach(r => eq(!ledgerApps.has(r.app.id), `${tag} ${r.app.id} activity-only app has no spend`));
    R.ledger.filter(r => appOf(r).approval !== 'approved').forEach(r => { if (r.q !== 'expense') eq(false, `${tag} non-expense spend on unapproved app`); });

    // ---- 8. no NaN / Infinity anywhere in the model ----
    (function walk(o, p) { if (o && typeof o === 'object') { if (o === D.APP || o.L && o.L.id && p === 'x') return; for (const k in o) { if (k === 'app' || k === 'L') continue; walk(o[k], p + '.' + k); } } else if (typeof o === 'number') eq(Number.isFinite(o), `${tag} non-finite number at ${p}`); })(m, 'm');
  }
}
function APPS_ID(o) { return D.APPS[o.a].id; }
console.log(`audit: ${passes} checks passed, ${fails} mismatches`);
process.exit(fails ? 1 : 0);
