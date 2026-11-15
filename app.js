/* AI Governance Dashboard — rendering only.
   Every number comes from AIGOV.compute() (see data.js); this file never calculates business metrics. */
(function () {
  'use strict';
  const { compute, fmt, TEAMS, APPS } = window.AIGOV;

  const state = { period: 'nov', team: 'all', tab: 'all', tblAll: false, view: { hero: 'chart', c2: 'chart', c3: 'chart' } };
  let model = null;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = fmt.pct, money = fmt.usdK;
  const moneyK = n => n >= 1000 ? '$' + (n / 1000).toFixed(1) + 'k' : '$' + Math.round(n);
  const MONTH_FULL = { '2026-09': 'September', '2026-10': 'October', '2026-11': 'November' };

  // ---------- tooltips (all content is our own strings, escaped) ----------
  let tips = [];
  const tipId = html => { tips.push(html); return tips.length - 1; };
  const trow = (k, v) => `<div class="tr"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
  const tipBox = (title, rows, note) => `<div class="tt">${esc(title)}</div>${rows.join('')}${note ? `<div class="tnote">${esc(note)}</div>` : ''}`;
  const tipEl = $('tip');
  function showTipHtml(html, x, y) {
    tipEl.innerHTML = html; tipEl.classList.add('on');
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    let left = x + 16, top = y + 16;
    if (left + w > innerWidth - 8) left = x - w - 16;
    if (top + h > innerHeight - 8) top = y - h - 16;
    tipEl.style.left = Math.max(8, left) + 'px'; tipEl.style.top = Math.max(8, top) + 'px';
  }
  const hideTip = () => tipEl.classList.remove('on');

  // ---------- icons & small components ----------
  const circ = inner => `<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor"/>${inner}</svg>`;
  const ICON = {
    exceeded: circ('<path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/>'),
    projected: circ('<path d="M5.5 10.5l5-5M6.3 5.5h4.2v4.2" stroke="#161615" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'),
    ok: circ('<path d="M5 8.4l2.2 2.2L11 6" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'),
  };
  ICON.over = ICON.exceeded;
  const RISK_ICON = {
    high: '<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1l5.5 10h-11z" fill="currentColor"/></svg>',
    medium: '<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 .8L11.2 6 6 11.2.8 6z" fill="currentColor"/></svg>',
    low: '<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="currentColor"/></svg>',
    not_assessed: '<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 1.6"/></svg>',
  };
  const RISK_LABEL = { high: 'High risk', medium: 'Medium risk', low: 'Low risk', not_assessed: 'Risk not assessed' };
  const APPR_LABEL = { approved: 'Approved', unreviewed: 'Unreviewed', not_approved: 'Not approved' };
  const APPR_CLASS = { approved: 'appr', unreviewed: 'unrev', not_approved: 'notappr' };
  const BUDGET_LABEL = { ok: 'On track', projected: 'Heading over', over: 'Over budget' };
  const LIMIT_SHORT = { ok: 'Within limit', projected: 'On pace to exceed', exceeded: 'Exceeded' };
  const statusChip = (key, label) => `<span class="chip st-${key}">${ICON[key]}${esc(label)}</span>`;
  const riskChip = (r, short) => `<span class="rk ${r}">${RISK_ICON[r]}${short ? RISK_LABEL[r].replace(/ risk$/, '').replace('Risk n', 'N') : RISK_LABEL[r]}</span>`;
  const apprChip = a => `<span class="ap"><i class="sw ${APPR_CLASS[a]}"></i>${APPR_LABEL[a]}</span>`;
  const tag = k => k === 'Estimated' || k === 'est' ? '<span class="tag tag-est">Estimated</span>'
    : k === 'Inferred' || k === 'inf' ? '<span class="tag tag-inf">Inferred</span>' : '<span class="tag tag-act">Actual</span>';
  const arrow = n => (n > 0 ? '▲' : n < 0 ? '▼' : '▬');
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const list = a => a.length <= 2 ? a.join(' and ') : a.slice(0, 2).join(', ') + ` and ${a.length - 2} other${a.length - 2 === 1 ? '' : 's'}`;
  const initials = n => n.replace(/&/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const cardHead = (id, title, sub, key) => `<div class="card-h"><div><h2 id="${id}-t">${title}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}</div>
    ${key ? `<button type="button" class="linkbtn" data-view="${key}">${state.view[key] === 'chart' ? 'View as table' : 'View as chart'}</button>` : ''}</div>`;
  const table = (cols, rows) => `<div class="tw"><table><thead><tr>${cols.map(c => `<th class="${c.num ? 'num' : ''}">${esc(c.h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td class="${cols[i].num ? 'num' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

  function niceTicks(max, n) {
    const raw = max / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), norm = raw / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
    const out = []; for (let v = 0; ; v += step) { out.push(+v.toFixed(6)); if (v >= max) break; }
    return out;
  }
  const axisMoney = v => v >= 1000 ? '$' + String(+(v / 1000).toFixed(1)) + 'k' : '$' + Math.round(v);

  // ---------- 1. executive briefing (short plain sentences, filled only from engine output) ----------
  function buildBriefing(m) {
    const s = m.kpi.spend, l = m.kpi.limits, inv = m.kpi.inventory;
    const month = MONTH_FULL[m.w.monthKey], all = m.team === 'all', live = m.w.partial;
    const who = all ? 'AI spend' : `${m.teamName}’s AI spend`, bud = all ? 'budget' : 'allocation';
    const gap = s.projected - s.budget, be = n => (live ? (n === 1 ? 'is' : 'are') : (n === 1 ? 'was' : 'were'));
    let headline, s1;
    if (live) {
      headline = s.status === 'over' ? `${who} has already exceeded the ${month} ${bud}.`
        : s.status === 'projected' ? `${who} is on pace to finish ${Math.round(s.projPct * 100) - 100}% over the ${month} ${bud}.`
        : `${who} is on track to finish within the ${month} ${bud}.`;
      s1 = `${all ? '' : esc(m.teamName) + ' has spent '}<b>${money(s.spend)}</b>${all ? ' spent so far' : ' so far'}, ${pct(s.pctBudget)} of ${all ? 'the' : 'its'} ${money(s.budget)} ${bud}. At this pace ${all ? 'the month' : 'it'} ends near <b>${money(s.projected)}</b>, about ${moneyK(Math.abs(gap))} ${gap > 0 ? 'over' : 'under'} (estimated).`;
    } else {
      headline = s.status === 'over' ? `${who} closed ${Math.round(s.pctBudget * 100) - 100}% over the ${month} ${bud}.` : `${who} closed at ${pct(s.pctBudget)} of the ${month} ${bud}.`;
      s1 = `<b>${money(s.spend)}</b> was spent against a ${money(s.budget)} ${bud}, leaving ${s.remaining >= 0 ? money(s.remaining) + ' unspent' : money(-s.remaining) + ' over'}.`;
    }
    let s2 = '';
    if (all) {
      const over = m.chart1.teams.filter(t => t.status === 'over').map(t => t.name), proj = m.chart1.teams.filter(t => t.status === 'projected').map(t => t.name), bits = [];
      if (over.length) bits.push(`${list(over)} ${live ? (over.length === 1 ? 'is' : 'are') + ' already' : (over.length === 1 ? 'was' : 'were')} over budget`);
      if (proj.length && live) bits.push(`${list(proj)} ${proj.length === 1 ? 'is' : 'are'} heading over`);
      if (bits.length) s2 = bits.join('; ') + '.';
    }
    const n = inv.unapprovedCount;
    const lim = l.exceeded ? `${plural(l.exceeded, 'limit')} ${be(l.exceeded)} exceeded` : `no limits ${be(2)} exceeded`;
    const more = live && l.projected ? `, and ${l.projected} more ${be(l.projected)} on pace to exceed` : '';
    const s3 = `${all ? lim.replace(/^./, c => c.toUpperCase()) : 'Company-wide, ' + lim}${more}; ${plural(n, 'app')} ${be(n)} used without approval.`;
    return { headline, text: [s1, s2, s3].filter(Boolean).join(' ') };
  }
  function renderBrief(m) {
    const b = buildBriefing(m);
    $('brief').innerHTML = `<p class="eyebrow">${esc(m.w.label)} · ${esc(m.teamName)} · data as of ${esc(m.asOf)}</p>
      <h1 class="headline">${esc(b.headline)}</h1><p class="narr">${b.text}</p>`;
  }

  // ---------- 2. KPI strip: one number, one plain line, one comparison line ----------
  const shortBase = b => b.replace(/ 2026 \((?:days )?(\d+)–(\d+)\)/, ' $1–$2').replace(' 2026', '');
  const isLive = m => m.w.partial;
  function renderKpis(m) {
    const k = m.kpi, s = k.spend, l = k.limits, inv = k.inventory, u = k.unapproved, all = m.team === 'all', bw = all ? 'budget' : 'allocation', live = isLive(m);
    const card = c => {
      const tip = tipId(tipBox(c.label, c.rows, c.note));
      return `<div class="kpi" tabindex="0" data-t="${tip}"><div class="k-l"><span>${c.label}</span>${c.tag ? tag(c.tag) : ''}</div>
        <div class="k-n">${c.value}</div><div class="k-s">${c.support}</div>${c.delta ? `<div class="k-d">${c.delta}</div>` : ''}</div>`;
    };
    const base = shortBase(s.deltaBase), lBase = shortBase(l.deltaBase), uBase = shortBase(u.deltaBase);
    const prevSpend = s.deltaPct == null ? null : s.spend / (1 + s.deltaPct);
    const cards = [
      { label: all ? 'Spend vs budget' : 'Spend vs allocation', value: money(s.spend),
        support: `${pct(s.pctBudget)} of ${money(s.budget)} · ${s.remaining >= 0 ? money(s.remaining) + ' left' : money(-s.remaining) + ' over'}`,
        delta: s.deltaPct == null ? '' : `<b>${arrow(s.deltaPct)} ${pct(Math.abs(s.deltaPct), 1)}</b> vs ${esc(base)}`,
        rows: [trow('Spend to date', fmt.usd(s.spend)), trow('Monthly ' + bw, fmt.usd(s.budget)), trow(s.remaining >= 0 ? 'Remaining' : 'Over by', fmt.usd(Math.abs(s.remaining))),
          ...(prevSpend == null ? [] : [trow('Same days, ' + base.split(' ')[0], fmt.usd(prevSpend))]), trow('Billed / card / estimated', `${money(s.byQ.billed)} / ${money(s.byQ.expense)} / ${money(s.byQ.estimated)}`)],
        note: all ? `Includes ${fmt.usd(s.unallocatedSpend)} that can’t be tied to a team. The company budget is set separately from team budgets.` : 'Spend that can’t be tied to a team is not included.' },
      { label: live ? 'Month-end estimate' : 'Month-end spend', tag: live ? 'est' : '', value: money(s.projected),
        support: live ? `${pct(s.projPct)} of ${bw}` : `Final · ${pct(s.pctBudget)} of ${bw}`, delta: '',
        rows: [trow(live ? 'Estimated month-end' : 'Final spend', fmt.usd(s.projected)), trow('vs ' + bw, pct(s.projPct)), trow('Status', BUDGET_LABEL[s.status])],
        note: live ? 'Estimate = spend so far ÷ days elapsed × days in the month. A straight-line pace, not a forecasting model.' : 'Month closed; no estimate needed.' },
      { label: 'Limits exceeded', value: String(l.exceeded),
        support: live ? (l.projected ? `${l.projected} more on pace to exceed` : 'None on pace to exceed') : 'Month closed',
        delta: l.exceeded !== l.prevExceeded ? `<b>${arrow(l.exceeded - l.prevExceeded)} ${Math.abs(l.exceeded - l.prevExceeded)}</b> vs ${esc(lBase)}` : `Same as ${esc(lBase)}`,
        rows: [trow('Exceeded', String(l.exceeded)), trow('On pace to exceed', live ? String(l.projected) : '—'), trow('Within limit', `${l.ok} of ${l.total}`), trow('People over a personal cap', String(l.usersOver))],
        note: `Company-wide limits on each app. Dollar, token and credit limits are counted here but never compared with each other. Previously ${l.prevExceeded} (${l.deltaBase}).` },
      { label: 'Apps without approval', value: String(inv.unapprovedCount),
        support: `${inv.approval.unreviewed} unreviewed · ${inv.approval.not_approved} not approved`, delta: '',
        rows: [trow('AI apps found', String(inv.total)), trow('Approved', String(inv.approval.approved)), trow('Unreviewed', String(inv.approval.unreviewed)), trow('Not approved', String(inv.approval.not_approved))],
        note: 'Approval is a decision the company makes. It is separate from how risky an app is.' },
      { label: 'Employees linked to unapproved AI', tag: 'inf', value: fmt.int(u.employees),
        support: `${pct(u.share)} of staff who use AI · found by browser and network checks`,
        delta: u.employees !== u.prevEmployees ? `<b>${arrow(u.employees - u.prevEmployees)} ${fmt.int(Math.abs(u.employees - u.prevEmployees))}</b> vs ${esc(uBase)}` : `Same as ${esc(uBase)}`,
        rows: [trow('Linked to unapproved apps', fmt.int(u.employees)), trow('Staff who use AI', fmt.int(u.activeEmployees)), trow('All staff', fmt.int(u.headcount)), trow('Accounts we can’t match to a person', all ? String(u.unresolved) : 'n/a for a team'), trow('Previously', `${fmt.int(u.prevEmployees)} (${u.deltaBase})`)],
        note: 'These people were linked to an unreviewed or not-approved app by browser and network checks. That is a strong hint, not proof of confirmed or paid usage. Each person is counted once.' },
    ];
    $('kpis').innerHTML = cards.map(card).join('');
  }

  // ---------- 3. hero chart: cumulative spend trajectory vs monthly budget ----------
  function heroLegend(s, budWord) {
    return `<div class="legend hero-legend"><span><i class="k-line"></i>Spend so far</span>${s.partial ? '<span><i class="k-dash"></i>Estimated pace to month-end</span>' : ''}
      <span><i class="k-bud"></i>Monthly ${budWord}</span>${s.partial ? '<span><i class="k-today"></i>Today</span>' : ''}${s.prev ? `<span class="muted"><i class="k-prev"></i>${esc(s.prev.name.split(' ')[0])} for comparison</span>` : ''}</div>
      ${s.partial ? '<p class="hero-note">Estimate = spend so far ÷ days elapsed × days in the month. Spend so far includes usage not yet invoiced.</p>' : ''}`;
  }
  function renderHero(m) {
    const s = m.series, scopeBud = m.team === 'all' ? 'budget' : 'allocation';
    const sub = `Running total for ${MONTH_FULL[m.w.monthKey]}`;
    let body;
    if (state.view.hero === 'table') {
      const rows = s.cum.map((c, i) => [esc(s.labels[i]), fmt.usd(s.daily[i]), fmt.usd(c), fmt.usd(s.cumQ[i].billed + s.cumQ[i].expense), fmt.usd(s.cumQ[i].estimated), fmt.usd(s.budget - c)]);
      if (s.partial) rows.push([esc(s.labels[s.D - 1]) + ' <span class="tag tag-est">Estimated</span>', '—', fmt.usd(s.projected), '—', '—', fmt.usd(s.budget - s.projected)]);
      body = table([{ h: 'Date' }, { h: 'Day’s spend', num: 1 }, { h: 'Total so far', num: 1 }, { h: 'Billed + card', num: 1 }, { h: 'Not yet invoiced (est.)', num: 1 }, { h: 'Left in ' + scopeBud, num: 1 }], rows);
    } else {
      body = `<div class="hero-wrap" id="hero-chart"></div>${heroLegend(s, scopeBud)}`;
    }
    $('hero').innerHTML = cardHead('hero', 'AI spend vs monthly ' + scopeBud, sub, 'hero') + body;
    if (state.view.hero === 'chart') drawHero(m);
  }
  function drawHero(m) {
    const host = $('hero-chart'); if (!host) return;
    const s = m.series, bw = m.team === 'all' ? 'budget' : 'allocation';
    const W = Math.max(320, host.clientWidth || 640), narrow = W < 560, H = narrow ? 320 : 440;
    const ml = 46, mr = narrow ? 108 : 176, mt = 36, mb = 32, pw = W - ml - mr, ph = H - mt - mb, D = s.D, n = s.elapsed;
    const cumLast = s.cum[n - 1] || 0, endVal = s.partial ? s.projected : cumLast;
    const prevMax = s.prev ? Math.max(...s.prev.cum.slice(0, Math.min(D, s.prev.D))) : 0;
    const ticks = niceTicks(Math.max(s.budget, endVal, cumLast, prevMax) * 1.08, 4), ymax = ticks[ticks.length - 1];
    const X = d => ml + (d / D) * pw, Y = v => mt + ph * (1 - v / ymax);
    const yb = Y(s.budget), ye = Y(endVal), yl = Y(cumLast), xn = X(n), xe = X(D);
    const gap = endVal - s.budget, gapPct = Math.round(Math.abs(gap) / s.budget * 100);
    const uid = 'g' + Math.random().toString(36).slice(2, 7);
    let g = `<defs><linearGradient id="${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--blue)" stop-opacity="0.18"/><stop offset="1" stop-color="var(--blue)" stop-opacity="0"/></linearGradient></defs>`;
    if (s.partial) g += `<rect x="${xn}" y="${mt}" width="${xe - xn}" height="${ph}" fill="var(--wash)"/>`;
    ticks.forEach(t => {
      g += `<line x1="${ml}" x2="${ml + pw}" y1="${Y(t)}" y2="${Y(t)}" stroke="${t === 0 ? 'var(--axis)' : 'var(--grid)'}" stroke-width="1" ${t === 0 ? '' : 'stroke-dasharray="2 5"'}/>`;
      g += `<text x="${ml - 10}" y="${Y(t) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${axisMoney(t)}</text>`;
    });
    [1, 8, 15, 22, 29].filter(d => d <= D).forEach(d => { g += `<text x="${X(d)}" y="${H - 9}" text-anchor="middle" font-size="11.5" fill="var(--muted)">${esc(s.labels[d - 1])}</text>`; });
    const prevPts = s.prev ? s.prev.cum.slice(0, Math.min(D, s.prev.D)).map((v, i) => [X(i + 1), Y(v)]) : [];
    if (prevPts.length) g += `<polyline class="ln-prev" points="${X(0)},${Y(0)} ${prevPts.map(p => p.join(',')).join(' ')}" fill="none" stroke="var(--axis)" stroke-opacity="0.75" stroke-width="1.25" stroke-linejoin="round"/>`;
    const actPts = s.cum.map((v, i) => [X(i + 1), Y(v)]);
    g += `<path d="M${X(0)},${Y(0)} L${actPts.map(p => p.join(',')).join(' L')} L${xn},${Y(0)} Z" fill="url(#${uid})"/>`;
    g += `<polyline class="ln-actual" points="${X(0)},${Y(0)} ${actPts.map(p => p.join(',')).join(' ')}" fill="none" stroke="var(--blue)" stroke-width="2.75" stroke-linejoin="round" stroke-linecap="round"/>`;
    // monthly budget: subtle reference with a direct label
    g += `<line x1="${ml}" x2="${ml + pw}" y1="${yb}" y2="${yb}" stroke="var(--ink2)" stroke-opacity="0.55" stroke-width="1.5"/>`;
    g += `<text x="${ml + 8}" y="${yb - 8}" font-size="11.5" font-weight="600" fill="var(--ink2)">${narrow ? '' : 'Monthly '}${bw} · ${money(s.budget)}</text>`;
    if (s.partial) {
      // today marker + explicit actual / estimated regions
      g += `<line x1="${xn}" x2="${xn}" y1="${mt - 6}" y2="${mt + ph}" stroke="var(--ink2)" stroke-width="1.25"/>`;
      g += `<text x="${xn}" y="${mt - 13}" text-anchor="middle" font-size="11" font-weight="650" fill="var(--ink2)">Today · ${esc(s.labels[n - 1])}</text>`;
      if (!narrow) g += `<text x="${xn - 8}" y="${mt + 15}" text-anchor="end" font-size="10" font-weight="650" letter-spacing="0.08em" fill="var(--muted)">ACTUAL</text><text x="${xn + 8}" y="${mt + 15}" font-size="10" font-weight="650" letter-spacing="0.08em" fill="var(--muted)">ESTIMATED</text>`;
      g += `<line class="ln-fc" x1="${xn}" y1="${yl}" x2="${xe}" y2="${ye}" stroke="var(--blue)" stroke-width="2.5" stroke-dasharray="6 5" stroke-linecap="round"/>`;
    }
    // distance between the endpoint and the budget line, annotated directly
    const bx = xe + 14, over = gap > 0;
    if (Math.abs(yb - ye) > 3) g += `<path d="M${bx - 4},${yb} H${bx} V${ye} H${bx - 4}" fill="none" stroke="${over ? 'var(--crit)' : 'var(--ink2)'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    if (s.partial) g += `<rect x="${xe - 5.5}" y="${ye - 5.5}" width="11" height="11" transform="rotate(45 ${xe} ${ye})" fill="var(--card)" stroke="${over ? 'var(--crit)' : 'var(--ink)'}" stroke-width="2.25"/>`;
    const yc = Math.min(mt + ph - 30, Math.max(mt + 22, (yb + ye) / 2)), lx = bx + 11;
    const gapTxt = gap > 0 ? `+${moneyK(gap)} (${gapPct}%) over ${bw}` : gap < 0 ? `${moneyK(-gap)} (${gapPct}%) under ${bw}` : `exactly on ${bw}`;
    g += `<text x="${lx}" y="${yc - 3}" font-size="13" font-weight="650" fill="var(--ink)">${s.partial ? 'Est. ' : 'Final '}${money(endVal)}</text>`;
    if (narrow) { const [a, b2] = gapTxt.split(` ${gap > 0 ? 'over' : 'under'} `); g += `<text x="${lx}" y="${yc + 12}" font-size="11.5" fill="var(--ink2)">${esc(a)}</text><text x="${lx}" y="${yc + 25}" font-size="11.5" fill="var(--ink2)">${gap > 0 ? 'over' : 'under'} ${esc(b2)}</text>`; }
    else g += `<text x="${lx}" y="${yc + 13}" font-size="11.5" fill="var(--ink2)">${esc(gapTxt)}</text>`;
    // latest actual point with a direct value label
    g += `<circle cx="${xn}" cy="${yl}" r="5.5" fill="var(--blue)" stroke="var(--card)" stroke-width="2.5"/>`;
    if (s.partial) g += `<text x="${xn - 12}" y="${yl - 22}" text-anchor="end" font-size="13" font-weight="650" fill="var(--ink)">${money(cumLast)}</text><text x="${xn - 12}" y="${yl - 8}" text-anchor="end" font-size="11" fill="var(--muted)">actual to date</text>`;
    g += `<g id="hx" style="display:none"><line id="hx-l" y1="${mt}" y2="${mt + ph}" stroke="var(--ink2)" stroke-width="1" stroke-dasharray="2 3"/><circle id="hx-d" r="5" fill="var(--card)" stroke="var(--blue)" stroke-width="2.5"/></g>`;
    g += `<rect id="hx-hit" x="${ml}" y="${mt}" width="${pw}" height="${ph}" fill="transparent"/>`;
    host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" tabindex="0" aria-label="Cumulative AI spend for ${esc(s.monthName)}: ${money(cumLast)} to date against a ${money(s.budget)} ${bw}${s.partial ? '; estimated ' + money(s.projected) + ' by month-end, ' + gapTxt : ', final ' + gapTxt}. Use arrow keys to inspect days, or switch to table view.">${g}</svg>`;

    // tooltip: hover / keyboard focus only, placed where it does not cover the data lines
    const svg = host.querySelector('svg'), hit = $('hx-hit'); let active = n;
    const obstacles = [[X(0), Y(0)], ...actPts, ...prevPts];
    if (s.partial) for (let k = 0; k <= 30; k++) obstacles.push([xn + (xe - xn) * k / 30, yl + (ye - yl) * k / 30]);
    // text labels drawn inside the plot are obstacles too (budget label, endpoint annotation, actual-to-date label)
    const labelRects = [[ml + 8, yb - 20, ml + 8 + (narrow ? 120 : 175), yb + 2], [lx - 2, yc - 18, lx + (narrow ? 104 : 175), yc + (narrow ? 30 : 20)]];
    if (s.partial) labelRects.push([xn - 12 - 96, yl - 38, xn - 8, yl - 4]);
    if (s.partial && !narrow) labelRects.push([xn - 70, mt + 3, xn + 92, mt + 21]);   // ACTUAL / ESTIMATED region labels
    function placeTip(html, d, v) {
      tipEl.innerHTML = html; tipEl.classList.add('on');
      const r = svg.getBoundingClientRect(), sc = r.width / W, tw = tipEl.offsetWidth / sc, th = tipEl.offsetHeight / sc, cx = X(d), cy = Y(v);
      const area = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
      // search a grid of positions inside the plot; score = data lines covered + labels covered + distance from the pointed day
      const cands = [];
      for (let x = ml + 2; x <= ml + pw - tw + 40; x += 12) for (let y = mt + 2; y <= mt + ph - th - 2; y += 12) cands.push({ x, y });
      cands.push({ x: Math.max(ml, Math.min(cx - tw / 2, W - tw)), y: H + 2, below: true });   // fallback: under the x-axis
      let best = null;
      cands.forEach(c => {
        const rect = [c.x, c.y, c.x + tw, c.y + th];
        const sx = r.left + c.x * sc, sy = r.top + c.y * sc;
        let score = 0;
        if (sx < 8 || sx + tw * sc > innerWidth - 8 || sy + th * sc > innerHeight - 8) score += 1000;
        if (c.below) score += 40;
        else {
          score += obstacles.filter(([px, py]) => px >= rect[0] - 8 && px <= rect[2] + 8 && py >= rect[1] - 8 && py <= rect[3] + 8).length * 100;
          score += labelRects.reduce((a, b) => a + area(rect, b), 0) / 20;
          score += Math.max(0, rect[2] - (ml + pw + 40)) * 2;
          if (cx >= rect[0] - 6 && cx <= rect[2] + 6) score += 30;                 // do not sit on the crosshair itself
          if (s.partial && xn >= rect[0] && xn <= rect[2]) score += 6;             // avoid the Today line when possible
        }
        score += 0.06 * Math.hypot((rect[0] + rect[2]) / 2 - cx, (rect[1] + rect[3]) / 2 - cy);
        if (!best || score < best.score) best = { x: c.x, y: c.y, score };
      });
      tipEl.style.left = (r.left + best.x * sc) + 'px'; tipEl.style.top = (r.top + best.y * sc) + 'px';
    }
    function show(d) {
      active = d; const est = d > n;
      const v = est ? cumLast + (s.projected - cumLast) * (d - n) / (D - n) : s.cum[d - 1];
      $('hx').style.display = ''; $('hx-l').setAttribute('x1', X(d)); $('hx-l').setAttribute('x2', X(d));
      $('hx-d').setAttribute('cx', X(d)); $('hx-d').setAttribute('cy', Y(v)); $('hx-d').setAttribute('stroke', est ? 'var(--ink)' : 'var(--blue)');
      const rows = [];
      if (!est) {
        const q = s.cumQ[d - 1];
        rows.push(trow('Spend to date', fmt.usd(v)), trow('Day’s spend', fmt.usd(s.daily[d - 1])), trow('Not yet invoiced (est.)', fmt.usd(q.estimated)), trow('Remaining ' + bw, fmt.usd(s.budget - v)));
      } else rows.push(trow('Estimated pace', fmt.usd(v)), trow('vs monthly ' + bw, (v >= s.budget ? '+' : '−') + fmt.usd(Math.abs(v - s.budget))));
      if (s.prev && d <= s.prev.D) rows.push(trow(s.prev.name.split(' ')[0] + ', same day', fmt.usd(s.prev.cum[d - 1])));
      placeTip(tipBox(s.labels[d - 1] + (est ? ' · Estimated' : ' · Actual to date'), rows), d, v);
    }
    const dayAt = e => { const r = svg.getBoundingClientRect(); const x = (e.clientX - r.left) * (W / r.width); return Math.min(D, Math.max(1, Math.round(((x - ml) / pw) * D))); };
    const hide = () => { $('hx').style.display = 'none'; hideTip(); };
    hit.addEventListener('pointermove', e => show(dayAt(e)));
    hit.addEventListener('pointerleave', hide);
    svg.addEventListener('keydown', e => { if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; e.preventDefault(); show(Math.min(D, Math.max(1, active + (e.key === 'ArrowRight' ? 1 : -1)))); });
    svg.addEventListener('focus', () => { if (svg.matches(':focus-visible')) show(n); });
    svg.addEventListener('blur', hide);
  }

  // ---------- 4. teams: spend and AI use side by side (a list, not a chart) ----------
  function renderTeams(m) {
    const c = m.chart1, bud = m.team === 'all' ? 'budget' : 'allocation', use = {}; m.teamUsage.forEach(t => (use[t.id] = t));
    const rows = c.teams.map(t => {
      const u = use[t.id];
      const tip = tipId(tipBox(t.name, [trow('Spend so far', fmt.usd(t.spend)), trow('Monthly ' + bud, fmt.usd(t.budget)), trow(t.remaining >= 0 ? 'Left' : 'Over by', fmt.usd(Math.abs(t.remaining))),
        ...(c.partial ? [trow('Estimated month-end', `${fmt.usd(t.projected)} (${pct(t.projPct)})`)] : []),
        trow('Staff who used AI', `${u.active} of ${u.headcount} (${pct(u.share)})`), trow('…of those, on unapproved apps', `${u.unapproved} (${pct(u.unapprovedShare)})`)],
        c.partial ? 'The month-end figure is an estimate (straight-line pace). Unapproved-app use is found by browser and network checks.' : 'Closed month.'));
      return `<div class="rank-row ${t.dim ? 'dim' : ''}" tabindex="0" data-t="${tip}">
        <span class="av" aria-hidden="true">${esc(initials(t.name))}</span>
        <span class="rk-main"><span class="rk-n">${esc(t.name)}</span><span class="rk-s">${statusChip(t.status === 'over' ? 'over' : t.status, BUDGET_LABEL[t.status])}${c.partial ? `<span class="tn">est. ${pct(t.projPct)}</span>` : ''}</span></span>
        <span class="rk-c tn"><b>${money(t.spend)}</b><small>${pct(t.pct)} of ${money(t.budget)}</small></span>
        <span class="rk-c tn"><b>${pct(u.share)}</b><small>${u.active} of ${u.headcount}</small></span>
        <span class="rk-c tn"><b>${pct(u.unapprovedShare)}</b><small>of AI users</small></span></div>`;
    }).join('');
    const u = c.unallocated;
    const utip = tipId(tipBox('Unallocated spend', [trow('Spend so far', fmt.usd(u.spend)), trow('Billed / card / estimated', `${money(u.byQ.billed)} / ${money(u.byQ.expense)} / ${money(u.byQ.estimated)}`)],
      'Spend that can’t be tied to a team (shared API keys, cards without a cost center). It is not a team and has no budget; it counts toward the company budget, which keeps ' + fmt.usd(c.unassignedBudget) + ' not assigned to any team.'));
    $('teams').innerHTML = cardHead('teams', 'Teams: spend and AI use', 'Compare teams on money and on how many people use AI', null)
      + `<div class="rank-head"><span></span><span>Team</span><span>Spend so far</span><span>Use AI</span><span>On unapproved apps</span></div><div class="rank">${rows}</div>
      <div class="rank rank-un"><div class="rank-row ${u.dim ? 'dim' : ''}" tabindex="0" data-t="${utip}"><span class="av" aria-hidden="true">–</span>
        <span class="rk-main"><span class="rk-n">Unallocated</span><span class="rk-s">No team · no ${bud}</span></span>
        <span class="rk-c tn"><b>${money(u.spend)}</b><small>${m.unallocShare != null ? pct(m.unallocShare, 1) + ' of total' : ''}</small></span><span class="rk-c">—</span><span class="rk-c">—</span></div></div>`;
  }

  // ---------- 5. chart 2: limits by application (separate unit groups, never ranked across) ----------
  function limRow(e, m) {
    const L = e.L, ax = p => Math.min(p, 1.3) / 1.3 * 100, team = m.team !== 'all', showProj = e.estimatedProjection;
    const teamPct = e.teamUsed / L.limit, faint = team ? 'faint' : '';
    const tip = tipId(tipBox(e.app.name + ' — ' + L.label, [trow('Used', fmt.unitsFull(e.used, L.unit)), trow('Limit', fmt.unitsFull(L.limit, L.unit)), trow('Share of limit used', pct(e.pct)),
      ...(showProj ? [trow('On pace for (estimate)', `${fmt.unitsFull(e.projected, L.unit)} (${pct(e.projPct)})`)] : []),
      trow('Resets', L.reset === 'weekly' ? 'Every Monday' : `Monthly (${showProj ? 'next' : 'last'} reset ${e.resetsOn})`), trow('Period shown', e.windowLabel),
      ...(e.topTeam ? [trow('Biggest user', `${e.topTeam.name} ${pct(e.topTeam.share)}`)] : []), ...(team ? [trow(m.teamName + ' share', pct(e.teamShare))] : []), trow('Data label', e.quality)],
      L.kind === 'monetary' ? 'Dollar limit. ' + (e.quality === 'Estimated' ? 'Spend is estimated (usage × list price, not yet invoiced).' : 'Spend is billed.')
        : `Measured in ${L.unit}. It can’t be converted to dollars or compared with other kinds of limit.`));
    return `<div class="lim-row" tabindex="0" data-t="${tip}" aria-label="${esc(e.app.name + ' ' + L.label)}: ${pct(e.pct)} of limit used, ${LIMIT_SHORT[e.status]}">
      <div class="lr-top"><div class="lr-n"><b>${esc(e.app.name)}</b><small>${esc(L.label)}${L.reset === 'weekly' ? ' · weekly' : ''}</small></div>${statusChip(e.status, LIMIT_SHORT[e.status])}</div>
      <div class="lr-bar"><div class="meter" aria-hidden="true"><i class="tr" style="width:${ax(1)}%"></i>
        <i class="fl ${faint}" style="width:${ax(Math.min(e.pct, 1))}%;${e.pct <= 1 ? 'border-radius:0 3px 3px 0' : ''}"></i>
        ${e.pct > 1 ? `<i class="ov ${faint}" style="left:${ax(1)}%;width:${ax(e.pct) - ax(1)}%"></i>` : ''}
        ${team ? `<i class="fl" style="width:${ax(Math.min(teamPct, 1))}%;${teamPct <= 1 ? 'border-radius:0 3px 3px 0' : ''}"></i>` : ''}
        <i class="bl" style="left:${ax(1)}%"></i>${showProj ? `<i class="pj ${e.projPct > 1 ? 'over' : ''}" style="left:${Math.min(ax(e.projPct), 97)}%"></i>` : ''}</div>
      <div class="lr-v tn"><b>${L.unit === 'USD' ? fmt.usd(e.used) : fmt.units(e.used, L.unit)}</b> of ${L.unit === 'USD' ? fmt.usd(L.limit) : fmt.units(L.limit, L.unit) + ' ' + L.unit} · ${pct(e.pct)}${team ? `<br><span class="tshare">${esc(m.teamName)}: ${pct(e.teamShare)} of it</span>` : ''}</div></div></div></div>`;
  }
  function renderC2(m) {
    const c = m.chart2;
    const GROUP = { monetary: ['Dollar limits', 'USD · resets monthly'], token: ['Token limits', '1 token ≈ ¾ of a word · resets monthly'], credit: ['Credit & request limits', 'vendor units · resets vary'] };
    let body;
    if (state.view.c2 === 'table') {
      body = table([{ h: 'Kind' }, { h: 'App' }, { h: 'Limit' }, { h: 'Unit' }, { h: 'Resets' }, { h: 'Used', num: 1 }, { h: 'Limit', num: 1 }, { h: '% used', num: 1 }, { h: 'On pace for', num: 1 }, { h: 'Status' }, { h: 'Data label' }],
        c.groups.flatMap(g => g.rows.map(e => [GROUP[g.kind][0], esc(e.app.name), esc(e.L.label), esc(e.L.unit), e.L.reset === 'weekly' ? 'Weekly (Mon)' : 'Monthly', fmt.unitsFull(e.used, e.L.unit), fmt.unitsFull(e.L.limit, e.L.unit), pct(e.pct),
          e.estimatedProjection ? `${fmt.unitsFull(e.projected, e.L.unit)} (${pct(e.projPct)})` : '—', LIMIT_SHORT[e.status], e.quality])));
    } else {
      body = c.groups.filter(g => g.rows.length).map(g => `<div class="lim-group"><div class="lg-h"><span class="lg-t">${GROUP[g.kind][0]}</span><span class="lg-s">${GROUP[g.kind][1]}</span></div>${g.rows.map(e => limRow(e, m)).join('')}</div>`).join('')
        + (c.groups.every(g => !g.rows.length) ? '<div class="empty">No limits apply to this selection.</div>' : '')
        + `<div class="legend" style="margin-top:12px"><span><i class="k-bud"></i>The limit</span>${c.partial ? '<span><i class="sw" style="background:var(--card);border:2px solid var(--ink);transform:rotate(45deg);width:8px;height:8px;border-radius:1px"></i>Where this month is heading (estimate)</span>' : ''}${m.team !== 'all' ? `<span>Faint = whole company, solid = ${esc(m.teamName)}</span>` : ''}</div>`;
    }
    $('c2').innerHTML = cardHead('c2', 'Limits by application', 'How much of each cap is used. Each limit keeps its own unit.', 'c2') + body;
  }

  // ---------- 6. chart 3: usage by application (dot plot, all apps) ----------
  function renderC3(m) {
    const rows = m.chart3.rows, inv = m.kpi.inventory, max = rows.length ? rows[0].users : 1;
    const sub = `Employees who used each AI tool this period · ${rows.length} tools`;
    let body;
    if (state.view.c3 === 'table') {
      body = table([{ h: 'Application' }, { h: 'Approval' }, { h: 'Risk class' }, { h: 'Employees', num: 1 }, { h: 'Unresolved', num: 1 }, { h: 'Unique observed', num: 1 }, { h: 'Activity source' }, { h: 'Spend in period', num: 1 }],
        rows.map(r => [esc(r.app.name), APPR_LABEL[r.app.approval], RISK_LABEL[r.app.risk], fmt.int(r.mapped), fmt.int(r.unresolved), fmt.int(r.users), (r.app.src === 'inferred' ? 'Inferred · ' : 'Confirmed · ') + esc(r.app.via), r.spend && r.spend.total > 0 ? fmt.usd(r.spend.total) : 'no spend record']));
    } else {
      const ticks = niceTicks(max * 1.04, 4), xmax = ticks[ticks.length - 1], pos = v => v / xmax * 100;
      const grid = ticks.map(t => `<i class="gl" style="left:${pos(t)}%"></i>`).join('');
      body = `<div class="dp-axis"><span></span><div class="ax">${ticks.map(t => `<span style="left:${pos(t)}%">${t}</span>`).join('')}</div><span></span><span class="muted-h">Risk</span></div>`
        + rows.map(r => {
          const a = r.app, inf = a.src === 'inferred', cls = `c-${a.approval === 'approved' ? 'appr' : a.approval}-bg`;
          const tip = tipId(tipBox(a.name, [trow('People seen using it', fmt.int(r.users)), trow('Matched to employees', fmt.int(r.mapped)), ...(r.unresolved ? [trow('Accounts we can’t match to a person', fmt.int(r.unresolved))] : []),
            trow('Approval status', APPR_LABEL[a.approval]), trow('Risk class', RISK_LABEL[a.risk].replace(' risk', '')), trow('How we know', (inf ? 'Inferred · ' : 'Confirmed · ') + a.via),
            trow('Spend in period', r.spend && r.spend.total > 0 ? fmt.usd(r.spend.total) : 'no spend record')],
            inf ? 'Found by browser and network checks. Seeing activity does not prove anyone paid for it.' : 'People with at least one session this period.'));
          return `<div class="dp-row" tabindex="0" data-t="${tip}" aria-label="${esc(a.name)}: ${r.users} users, ${APPR_LABEL[a.approval]}, ${RISK_LABEL[a.risk]}${inf ? ', inferred' : ''}">
            <span class="dp-name" title="${esc(a.name)}">${esc(a.name)}</span>
            <div class="dp-rail">${grid}<i class="base"></i><i class="dp-stem ${cls}" style="width:${pos(r.users)}%"></i><i class="dp-dot ${cls} ${inf ? 'hollow' : ''}" style="left:${pos(r.users)}%"></i></div>
            <span class="dp-val tn">${fmt.int(r.users)}</span>${riskChip(a.risk, true)}</div>`;
        }).join('') + (rows.length ? '' : '<div class="empty">No AI app activity observed for this selection.</div>')
        + (() => { const miss = APPS.filter(a => !rows.some(r => r.app.id === a.id)).map(a => a.name);
          return miss.length ? `<p class="empty" style="margin-top:10px">No observed activity in this selection (${miss.length} of ${APPS.length} cataloged apps): ${esc(miss.join(', '))}.</p>` : ''; })()
        + `<div class="legend dp-leg"><span><i class="dotk" style="background:var(--c-appr)"></i>Approved</span><span><i class="dotk" style="background:var(--c-unrev)"></i>Unreviewed</span><span><i class="dotk" style="background:var(--c-notappr)"></i>Not approved</span>
          <span><i class="ring"></i>Hollow = found by browser and network checks (inferred)</span></div>`;
    }
    $('c3').innerHTML = cardHead('c3', 'AI usage by application', sub, 'c3') + body;
  }

  // ---------- 7. attention table ----------
  const TABS = [['all', 'All', r => true], ['limits', 'Limits', r => r.issues.some(i => ['exceeded', 'projected', 'usercap'].includes(i))],
    ['approval', 'Approval', r => r.issues.includes('approval')], ['highrisk', 'High risk', r => r.issues.includes('highrisk')]];
  const ROW_CAP = 8;
  function renderTable(m) {
    const all = m.table.rows, counts = {}; TABS.forEach(([k, , f]) => (counts[k] = all.filter(f).length));
    if (!counts[state.tab]) state.tab = 'all';
    const f = TABS.find(t => t[0] === state.tab)[2], rows = all.filter(f), shown = state.tblAll ? rows : rows.slice(0, ROW_CAP);
    const tabs = `<div class="tabs-row"><div class="tabs" role="tablist" aria-label="Filter by issue type">${TABS.map(([k, l]) => `<button type="button" class="tab" role="tab" data-tab="${k}" aria-selected="${state.tab === k}"${k !== 'all' && !counts[k] ? ' disabled' : ''}>${l}<span class="n tn">${counts[k]}</span></button>`).join('')}</div>
      <span class="tab-hint">Tabs overlap: one item can sit under several, so they don’t add up to All.</span></div>`;
    const body = shown.map(r => {
      const isLimit = r.status !== 'gov';
      const issue = (r.status === 'exceeded' || r.status === 'projected') ? statusChip(r.status, r.issueLabel) : `<span class="chip plain">${esc(r.issueLabel)}</span>`;
      const tip = tipId(tipBox(r.item, [], r.detail + ' · ' + r.scope));
      return `<tr tabindex="0" data-t="${tip}">
        <td><div class="a-n">${esc(r.app.name)}</div><div class="a-m">${isLimit ? esc(r.sublabel) : `${apprChip(r.app.approval)}<span class="dotsep">·</span>${riskChip(r.app.risk)}`}</div></td>
        <td>${issue}</td>
        <td><div class="u-m">${esc(r.main)}</div><div class="u-s">${esc(r.sub)}${r.topConsumer ? ' · biggest user ' + esc(r.topConsumer) : ''}</div></td>
        <td class="nx">${esc(r.next)} ${tag(r.evidence)}</td></tr>`;
    }).join('');
    const more = rows.length > ROW_CAP ? `<div class="more-row"><button type="button" class="linkbtn strong" data-more>${state.tblAll ? 'Show fewer' : `Show ${rows.length - ROW_CAP} more`}</button></div>` : '';
    $('tbl').innerHTML = `<div class="card-h"><div><h2 id="tbl-t">Attention needed</h2><p class="sub">Most urgent first: limits, then approval and risk gaps</p></div></div>${tabs}
      <div class="tw"><table><thead><tr><th>App</th><th>Issue</th><th>Usage / spend</th><th>Next step</th></tr></thead>
      <tbody>${body || '<tr><td colspan="4" class="empty">Nothing needs attention for this selection.</td></tr>'}</tbody></table></div>${more}
      <p class="tcap">Hover or focus a row for more detail. Next steps are suggestions only; nothing is wired to an action in this prototype.</p>`;
  }

  // ---------- 8. data coverage popover (spend quality and discovery coverage kept separate) ----------
  function renderCoverage(m) {
    const s = m.trust.spend, t = s.total || 1, q = s.byQ, d = m.trust.discovery;
    const parts = [['billed', 'bill', 'Billed', 'from invoices and billing data'], ['expense', 'exp', 'Card & expense', 'matched to an app'], ['estimated', 'est', 'Estimated', 'usage not yet invoiced']];
    $('cov-panel').innerHTML = `
      <section><h3>How reliable are the dollar figures? · ${esc(m.teamName)}</h3>
        <div class="pbar" role="img" aria-label="Spend by data quality">${parts.map(p => q[p[0]] > 0 ? `<i class="sw ${p[1]}" style="flex:${q[p[0]]};height:8px;border-radius:0"></i>` : '').join('')}</div>
        <div class="pleg">${parts.map(p => `<div><i class="sw ${p[1]}"></i><span><b>${p[2]}</b> <span style="color:var(--muted)">· ${p[3]}</span></span><span class="v tn">${pct(q[p[0]] / t)} · ${money(q[p[0]])}</span></div>`).join('')}</div></section>
      <section><h3>Have we found every AI app?</h3>
        <ul class="srcs">${d.sources.map(x => `<li><span>${esc(x.name)}</span><span>${esc(x.cover)}</span></li>`).join('')}</ul>
        <p class="note"><b>${d.confirmedApps}</b> of ${d.total} apps are confirmed by sign-in or admin data. <b>${d.inferredApps}</b> are only inferred from browser or network checks. Blind spots: personal devices off the company VPN, and mobile apps. Coverage is partial, so there is no single completeness score.</p></section>
      <section><h3>What the labels mean</h3><dl class="labdefs"><dt>${tag('Actual')}</dt><dd>Billed, paid by card or expense, or counted by the app itself.</dd><dt>${tag('Estimated')}</dt><dd>Worked out by us: usage × price, or this month’s pace.</dd><dt>${tag('Inferred')}</dt><dd>Spotted by browser or network checks. Never counted as spend.</dd></dl></section>`;
  }

  // ---------- orchestration ----------
  function render() {
    tips = []; hideTip();
    model = compute(state.period, state.team);
    renderBrief(model); renderKpis(model); renderHero(model); renderTeams(model); renderC2(model); renderC3(model); renderTable(model); renderCoverage(model);
  }
  function refresh() {
    const page = $('page'); page.classList.add('loading');
    requestAnimationFrame(() => { render(); requestAnimationFrame(() => page.classList.remove('loading')); });
  }

  $('f-team').innerHTML = '<option value="all">All teams</option>' + TEAMS.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  $('f-period').addEventListener('change', e => { state.period = e.target.value; refresh(); });
  $('f-team').addEventListener('change', e => { state.team = e.target.value; refresh(); });

  const covBtn = $('cov-btn'), covPanel = $('cov-panel');
  const setCov = open => { covPanel.hidden = !open; covBtn.setAttribute('aria-expanded', String(open)); if (open) covPanel.focus(); };
  covBtn.addEventListener('click', e => { e.stopPropagation(); setCov(covPanel.hidden); });
  document.addEventListener('click', e => { if (!covPanel.hidden && !covPanel.contains(e.target) && !covBtn.contains(e.target)) setCov(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !covPanel.hidden) { setCov(false); covBtn.focus(); } });

  document.addEventListener('click', e => {
    const v = e.target.closest('[data-view]');
    if (v) { const k = v.dataset.view; state.view[k] = state.view[k] === 'chart' ? 'table' : 'chart'; ({ hero: renderHero, c2: renderC2, c3: renderC3 })[k](model); return; }
    const t = e.target.closest('[data-tab]');
    if (t && !t.disabled) { state.tab = t.dataset.tab; state.tblAll = false; renderTable(model); return; }
    if (e.target.closest('[data-more]')) { state.tblAll = !state.tblAll; renderTable(model); }
  });
  document.addEventListener('pointermove', e => {
    const el = e.target.closest && e.target.closest('[data-t]');
    if (el) showTipHtml(tips[+el.dataset.t] || '', e.clientX, e.clientY); else if (!e.target.closest || !e.target.closest('#hero-chart')) hideTip();
  });
  document.addEventListener('focusin', e => { const el = e.target.closest && e.target.closest('[data-t]'); if (el) { const r = el.getBoundingClientRect(); showTipHtml(tips[+el.dataset.t] || '', r.left + r.width / 3, r.bottom - 8); } });
  document.addEventListener('focusout', e => { if (!e.target.closest || !e.target.closest('#hero-chart')) hideTip(); });
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (state.view.hero === 'chart' && model) drawHero(model); }, 120); });

  render();
})();
