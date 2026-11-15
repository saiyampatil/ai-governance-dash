# AI Governance Dashboard — Part 1 prototype notes

All data is **synthetic and illustrative** (a fictional organization, 1,100 employees, 7 teams, 16 AI apps).

## Run
```
cd shadow_ai
python3 -m http.server 8765      # then open http://127.0.0.1:8765/index.html
node check.js                    # consistency checks on the data model (must print "All consistency checks passed")
node audit.js                    # independent recomputation from raw records, all period × team combinations (0 mismatches expected)
```
node audit-series.js             # independent checks of the daily spend series and the per-team AI-use figures
Files: `data.js` (synthetic data model + all calculations) · `app.js` (rendering only) · `styles.css` · `index.html`.

## Screen layout (single page, compact v3)
1. **Header:** Prototype · AI Governance, reporting-period and team filters, *Data coverage* popover (how reliable the dollar figures are, and whether every AI app has been found — kept separate, no combined score).
2. **Briefing:** a headline plus three short sentences generated from `compute()` output only (no invented causes).
3. **KPI strip (5):** spend vs budget · month-end estimate (Estimated) · limits exceeded · apps without approval · employees linked to unapproved AI (Inferred — found by browser and network checks, not confirmed or billable usage). Each change line names its basis (e.g. "vs Oct 1–15", same elapsed days).
4. **Row 1 — chart 1 + chart 2, side by side so limits are in the first screen:**
   - *AI spend vs monthly budget:* running total (solid), *Today* marker, dashed *Estimated* pace to month-end, labelled budget line, endpoint annotation ("Est. $91.1k, +$3.1k (4%) over budget"), previous month as a faint reference. Tooltip on hover/focus only, placed clear of lines and labels.
   - *Limits by application:* dollar, token and credit/request groups; each keeps its own unit and reset period; never ranked across groups.
5. **Row 2 — teams + chart 3:**
   - *Teams: spend and AI use* (a list, not a chart): spend vs budget with status, **share of staff who use AI**, and **share of those on unapproved apps**, so teams are comparable on both money and usage. Unallocated spend is shown separately with no budget.
   - *AI usage by application:* dot plot of employees per app (all apps; hollow dot = inferred; colour = approval status; risk class in its own column). Apps with no activity in the selection are named, not dropped.
6. **Attention needed:** four columns, most urgent first, first 8 rows shown with "Show N more". The Limits / Approval / High-risk tabs overlap (stated on screen).

Compact pass: page height 3,714 px → about 2,600 px; no spend, user or generator logic changed. Data trimmed only where it does not affect spend: three "within limit" rows removed (Gemini dollar and token limits, Copilot premium requests) → 6 limits remain (2 exceeded, 2 on pace to exceed, 2 within). Apps were deliberately **not** removed: that would shift the spend totals and the 4% overrun. Plain-language wording replaces internal terms (e.g. "unmatched accounts", "card/expense", "browser and network checks").

Code: `data.js` additive only (pure `spendSeries` and `teamUsage` selectors, display fields on exception rows, the three limit rows removed). `check.js` and `audit.js` are unchanged.

## One source of truth
Everything on screen comes from `AIGOV.compute(period, team)`, which reads five record sets generated with a fixed seed:

| Records | What it holds | Feeds |
|---|---|---|
| Employees | 1,100 people, each mapped to one team | headcount, team scoping |
| Usage observations | identity × app × day (+ metered units) — identity is a mapped employee, an unresolved account, or a service account | active users, tokens/credits/requests, per-user spend |
| Spend ledger | day × app × team × component × quality (billed / expense-matched / estimated) | KPI 1, chart 1, monetary limits, data-quality strip |
| Limits | 6 org-wide app limits (3 USD, 1 token, 2 credit/request; monthly or weekly reset) + 1 per-user cap | KPI 2, chart 2, table |
| Budgets | explicit monthly budget per team **and** a separate explicit org-level monthly budget | KPI 1, chart 1 |

Seat spend is derived from observed users per team; usage spend = metered units × price; so spend, users and limits cannot contradict each other. `check.js` asserts this (e.g. KPI spend = Σ team spend + unallocated; table rows = KPI counts; unapproved apps carry no non-expense spend).

## Definitions (these map to your five refinements)
1. **Chart 1** is strictly team spend vs *monthly budget*. Bars are % of each team's own budget. Unallocated spend is shown separately, with no budget and no status.
2. **Budgets are explicit monthly amounts** (not prorated from annual). The org budget is its own number ($88.0k in Nov); team allocations ($84.0k) are a subset, and the $4.0k difference is held centrally and absorbs unallocated spend. *Remaining* = budget − spend to date. The only projection is the labelled *Estimated* month-end pace = spend to date × days in month ÷ days elapsed (linear run-rate).
3. **Chart 2** is split into three panels — USD limits, token limits, credit/request limits — each keeping its own unit and reset period. Panels are ordered by status; USD and token panels then by % used (one unit, one reset period each); the credit/request panel mixes units and resets, so it is ordered by name, not %. Token spend shown in USD is *Estimated* (tokens × list price); tokens themselves are *Actual* metered usage.
4. **Approval status** (Approved / Unreviewed / Not approved) and **risk class** (Low / Medium / High / Not assessed) are separate fields: Fireflies.ai = Approved + High; ChatPDF = Unreviewed + High; Perplexity = Unreviewed + Low; Bolt.new = Unreviewed + Not assessed.
5. **Active users per app** = unique identities observed in the period. **Org-level employees** are deduplicated across apps (e.g. 757 unique vs 2,682 summed app-level users); unresolved accounts are counted separately and never added to employees.

Also: spend-data quality (billed / expense-matched / estimated) and discovery coverage (SSO, browser, network, expense feed; confirmed vs inferred apps) are separate strips. Inferred activity never creates spend — activity-only apps show "no spend record".

## Scenario baked into the data (Nov 2026, day 15 of 30)
- Engineering and Marketing projected over budget; org projected ~104% of its $88.0k budget (Oct closed at 94% of $82.0k).
- 2 limits exceeded (ChatGPT Enterprise credits after a 6 Nov rollout; Jasper credits after a 4 Nov campaign), 2 projected (Cursor spend, Claude tokens). Claude's *dollar* limit is fine while its *token* limit is not — the reason limits aren't merged.
- 13 users over Cursor's per-user cap (aggregated, never named).
- 7 unapproved apps incl. 2 not approved but still used; 4 have no spend record.

## Known simplifications (state these if asked)
- Org-wide app limits are not team-scoped; with a team filter the team's share is overlaid and status stays org-level.
- Seat fees are accrued evenly across the month; projections are linear run-rate.
- Capabilities such as per-team limits, token visibility by user and discovery sources come from CloudEagle's public marketing pages (vendor claims, not verified in the product).
- Next steps in the table are text only; nothing is wired to actions.

## Assumptions that Part 2 (APIs & data sources) must document separately
These are things the prototype *assumes* a data source can provide. None is verified against a live integration.
- **Approval status and risk class** are CloudEagle-side governance attributes (set by admins / assessments), not data pulled from vendors.
- **Budgets** (team and org, monthly) come from Finance — ERP / FP&A export or manual entry. Cost-center → team mapping comes from HRIS / identity provider.
- **Per-vendor metered consumption** (tokens, credits, premium requests, per-user spend) requires a vendor admin / usage API for each app. The model assumes it exists for ChatGPT Enterprise, Claude, Gemini, GitHub Copilot, Cursor and Jasper; other apps (e.g. Midjourney, Notion AI, Fireflies) would only have SSO/seat or expense data. **Verify per vendor.**
- **Unresolved accounts** come from network-proxy / endpoint signals that cannot be tied to an employee; coverage gaps (personal devices off VPN, mobile) are blind spots, not zeros.
- **Spend quality:** seat fees are treated as billed and accrued evenly; usage spend is estimated mid-month and treated as billed once the month closes; card charges are matched to apps by merchant (attribution can be wrong or missing → "unallocated").
- **Limit enforcement** is not modelled; limits are read as configured thresholds.
