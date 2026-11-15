# AI Governance Dashboard (prototype)

A one-screen prototype for a product-management take-home. It shows how a company could see AI tool usage, spend against a monthly budget, and usage limits in one place.

**All data is synthetic and illustrative.** No real company, employee or vendor data is used.

## Open it

Open `index.html` in a browser. There is nothing to install and no internet connection is needed.

Live version: https://saiyampatil.github.io/ai-governance-dash/

## What is on the screen

- A short briefing generated from the numbers (headline plus three sentences)
- Five KPIs: spend vs budget, month-end estimate, limits exceeded, apps without approval, employees linked to unapproved AI
- Three charts: **AI spend vs monthly budget**, **Limits by application**, **AI usage by application**
- A team list comparing spend and AI use, and an "Attention needed" list
- Filters for reporting period and team, plus a Data coverage panel

## How the numbers work

Every figure comes from one calculation layer (`data.js`) built on synthetic records for 1,100 employees, 7 teams and 16 AI apps. Each number is labelled **Actual**, **Estimated** or **Inferred**. Dollars, tokens, credits and requests are never mixed, and approval status and risk class are kept separate. Details and assumptions are in `NOTES.md`.

## Checks

The calculation layer has automated checks that recompute the numbers independently. You need Node.js (no packages to install):

```
node check.js
node audit.js
node audit-series.js
```

## Files

| File | Purpose |
|---|---|
| `index.html`, `styles.css`, `app.js` | The page, its styling and the rendering code |
| `data.js` | Synthetic data and all calculations |
| `check.js`, `audit.js`, `audit-series.js` | Consistency and independent-recomputation checks |
| `NOTES.md` | Data model, definitions and assumptions |
