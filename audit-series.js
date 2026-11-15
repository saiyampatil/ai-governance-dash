// Independent check of the daily spend series used by the hero chart (additive selector, separate from audit.js).
// Run: node audit-series.js
const D = require('./data.js');
const R = D._raw;
let pass = 0, fail = 0;
const near = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
const eq = (c, m) => { if (c) pass++; else { fail++; console.log('  MISMATCH ✗', m); } };
const MONTH = { nov: { start: 61, days: 30, elapsed: 15, prevStart: 30, prevDays: 31 }, oct: { start: 30, days: 31, elapsed: 31, prevStart: 0, prevDays: 30 } };

for (const pk of ['nov', 'oct']) for (const team of ['all', ...D.TEAMS.map(t => t.id)]) {
  const M = MONTH[pk], m = D.compute(pk, team), s = m.series, tag = `[${pk}/${team}]`;
  const ok = t => team === 'all' || t === team;
  const day = (i, start = M.start) => R.ledger.filter(r => r.d === start + i && ok(r.t)).reduce((a, r) => a + r.usd, 0);
  eq(s.D === M.days && s.elapsed === M.elapsed && s.cum.length === M.elapsed, `${tag} series length (${s.cum.length}) = days elapsed`);
  let run = 0;
  for (let i = 0; i < M.elapsed; i++) {
    const d = day(i); run += d;
    eq(near(s.daily[i], d), `${tag} day ${i + 1} daily spend`);
    eq(near(s.cum[i], run), `${tag} day ${i + 1} cumulative`);
    eq(near(s.cumQ[i].billed + s.cumQ[i].expense + s.cumQ[i].estimated, run), `${tag} day ${i + 1} quality split sums to cumulative`);
  }
  eq(near(s.cum[s.cum.length - 1], m.kpi.spend.spend), `${tag} last cumulative point = KPI spend to date`);
  eq(near(s.projected, m.kpi.spend.projected) && near(s.budget, m.kpi.spend.budget), `${tag} series projected/budget = KPI`);
  eq(near(s.projected, s.cum[s.cum.length - 1] * M.days / M.elapsed), `${tag} projection = spend x days / elapsed`);
  eq(s.cum.every((v, i) => i === 0 || v >= s.cum[i - 1]), `${tag} cumulative never decreases`);
  eq(s.prev && s.prev.D === M.prevDays && s.prev.cum.length === M.prevDays, `${tag} previous-period series covers the full prior month`);
  const prevTotal = R.ledger.filter(r => r.d >= M.prevStart && r.d < M.prevStart + M.prevDays && ok(r.t)).reduce((a, r) => a + r.usd, 0);
  eq(near(s.prev.cum[s.prev.cum.length - 1], prevTotal), `${tag} previous month total`);
  eq(s.labels.length === M.days, `${tag} one label per calendar day`);
}

// ---- per-team AI use (teamUsage): recomputed independently from raw observations ----
for (const pk of ['nov', 'oct']) {
  const M = MONTH[pk], m = D.compute(pk, 'all'), tag = `[${pk}/teamUsage]`;
  D.TEAMS.forEach(t => {
    const act = new Set(), uns = new Set();
    R.obs.forEach(o => { if (o.type === 'employee' && o.t === t.id && o.d >= M.start && o.d < M.start + (pk === 'nov' ? 15 : 31)) { act.add(o.id); if (D.APPS[o.a].approval !== 'approved') uns.add(o.id); } });
    const u = m.teamUsage.find(x => x.id === t.id);
    eq(u.active === act.size && u.headcount === t.headcount, `${tag} ${t.id} active ${act.size}/${t.headcount} vs ${u.active}/${u.headcount}`);
    eq(u.unapproved === uns.size && near(u.share, act.size / t.headcount), `${tag} ${t.id} unapproved-linked and adoption share`);
    eq(u.active <= u.headcount && u.unapproved <= u.active, `${tag} ${t.id} counts are bounded`);
  });
  // the per-team counts are subsets of the organization-level deduplicated count
  eq(m.teamUsage.reduce((a, u) => a + u.active, 0) === m.kpi.unapproved.activeEmployees, `${tag} team actives add up to the deduplicated org count`);
  eq(m.teamUsage.reduce((a, u) => a + u.unapproved, 0) === m.kpi.unapproved.employees, `${tag} team unapproved-linked add up to the org count`);
}
console.log(`audit-series: ${pass} checks passed, ${fail} mismatches`);
process.exit(fail ? 1 : 0);
