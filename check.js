// Consistency checks + calibration report for the synthetic data model.
// Run:  node check.js          (exit code 1 if any invariant fails)
const D = require('./data.js');
const { fmt } = D;
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('  FAIL ✗', msg); } else console.log('  ok   ✓', msg); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));

for (const period of ['nov', 'oct']) {
  const m = D.compute(period, 'all');
  console.log('\n=== ' + m.w.label + ' — all teams ===');
  const k = m.kpi;
  console.log('Spend', fmt.usd(k.spend.spend), 'of budget', fmt.usd(k.spend.budget), fmt.pct(k.spend.pctBudget),
    '| projected', fmt.usd(k.spend.projected), fmt.pct(k.spend.projPct), '| Δ', k.spend.deltaPct == null ? '-' : fmt.pct(k.spend.deltaPct, 1),
    '| quality B/E/Est', fmt.usd(k.spend.byQ.billed), fmt.usd(k.spend.byQ.expense), fmt.usd(k.spend.byQ.estimated));
  console.log('Teams:');
  m.chart1.teams.forEach(t => console.log('  ', t.name.padEnd(22), fmt.usd(t.spend).padStart(8), '/', fmt.usd(t.budget).padStart(7), fmt.pct(t.pct).padStart(5), ' proj', fmt.pct(t.projPct).padStart(5), t.status));
  console.log('   Unallocated'.padEnd(25), fmt.usd(m.chart1.unallocated.spend).padStart(8), '(' + fmt.pct(m.unallocShare, 1) + ' of total)');
  console.log('Limits:');
  m.chart2.groups.forEach(g => g.rows.forEach(e => console.log('  ', g.kind.padEnd(8), (e.app.name + ' ' + e.L.label).padEnd(40), fmt.unitsFull(e.used, e.L.unit).padStart(18), '/', fmt.unitsFull(e.L.limit, e.L.unit).padStart(18), fmt.pct(e.pct).padStart(5), 'proj', fmt.pct(e.projPct).padStart(5), e.status)));
  console.log('  user cap over:', m.chart2.userCap.over, 'of', m.chart2.userCap.users, 'max', fmt.usd(m.chart2.userCap.max));
  console.log('Limits KPI: exceeded', k.limits.exceeded, 'projected', k.limits.projected, 'usersOver', k.limits.usersOver, '(prev', k.limits.prevExceeded, k.limits.prevProjected, k.limits.prevUsersOver + ')');
  console.log('Inventory:', JSON.stringify({ total: k.inventory.total, new: k.inventory.newApps, approval: k.inventory.approval, risk: k.inventory.risk }), 'unapproved spend', fmt.usd(k.inventory.unapprovedSpend));
  console.log('Unapproved employees:', k.unapproved.employees, 'of active', k.unapproved.activeEmployees, '(' + fmt.pct(k.unapproved.share) + ')', 'headcount', k.unapproved.headcount, 'unresolved', k.unapproved.unresolved, 'prev', k.unapproved.prevEmployees);
  console.log('Apps by observed users:', m.chart3.rows.map(r => r.app.name + ' ' + r.users).join(' | '));
  console.log('Table:', m.table.rows.map(r => r.issueLabel + ' :: ' + r.item).join('\n       '));

  console.log('\nInvariants (' + period + '):');
  const tot = m.chart1.teams.reduce((s, t) => s + t.spend, 0) + m.chart1.unallocated.spend;
  ok(near(tot, k.spend.spend), 'KPI spend = Σ team spend + unallocated');
  ok(near(k.spend.byQ.billed + k.spend.byQ.expense + k.spend.byQ.estimated, k.spend.spend), 'spend-quality split sums to total');
  ok(k.spend.budget >= m.chart1.teams.reduce((s, t) => s + t.budget, 0), 'explicit org budget ≥ Σ explicit team allocations (no proration)');
  ok(near(k.spend.remaining, k.spend.budget - k.spend.spend), 'remaining budget = budget − spend');
  const sumAppUsers = m.chart3.rows.reduce((s, r) => s + r.mapped, 0);
  ok(k.unapproved.activeEmployees < sumAppUsers, `deduped employees (${k.unapproved.activeEmployees}) < Σ app-level users (${sumAppUsers})`);
  ok(k.unapproved.activeEmployees <= k.unapproved.headcount, 'active employees ≤ headcount');
  ok(m.table.rows.filter(r => r.issues.includes('exceeded')).length === k.limits.exceeded, 'table exceeded rows = KPI exceeded');
  ok(m.table.rows.filter(r => r.issues.includes('projected')).length === k.limits.projected, 'table projected rows = KPI projected');
  const ki = k.inventory;
  ok(ki.approval.approved + ki.approval.unreviewed + ki.approval.not_approved === ki.total, 'approval split sums to inventory total');
  ok(ki.risk.low + ki.risk.medium + ki.risk.high + ki.risk.not_assessed === ki.total, 'risk split sums to inventory total');
  const R = D._raw;
  const nonExpenseOnUnapproved = R.ledger.filter(r => D.APPS[r.a].approval !== 'approved' && r.q !== 'expense');
  ok(nonExpenseOnUnapproved.length === 0, 'unapproved apps carry only expense-matched spend (no inferred spend)');
  const noSpendApps = D.APPS.filter(a => a.billing === 'none').map(a => a.id);
  ok(R.ledger.filter(r => noSpendApps.includes(D.APPS[r.a].id)).length === 0, 'activity-only apps have no spend rows');
  m.chart2.groups.forEach(g => g.rows.forEach(e => {
    if (e.L.basis === 'spend') {
      const w = m.w; const sum = R.ledger.filter(r => D.APPS[r.a].id === e.L.app && r.c === e.L.comp && r.d >= w.monthStart && r.d <= w.end).reduce((s, r) => s + r.usd, 0);
      ok(near(sum, e.used), `limit ${e.L.id} used equals ledger sum`);
    }
  }));
  const proj = m.chart2.groups.flatMap(g => g.rows).filter(e => e.status === 'projected').every(e => e.pct < 1 && e.projPct > 1);
  ok(proj, 'projected rows are below limit now and above at pace');
  // consistency across team filters
  D.TEAMS.forEach(t => {
    const mt = D.compute(period, t.id);
    const row = m.chart1.teams.find(x => x.id === t.id);
    if (!near(mt.kpi.spend.spend, row.spend)) { fails++; console.log('  FAIL ✗ team filter spend mismatch', t.id); }
  });
  console.log('  ok   ✓ every team filter: KPI spend = chart-1 team spend');
}
console.log(fails ? `\n${fails} check(s) FAILED` : '\nAll consistency checks passed');
process.exit(fails ? 1 : 0);
