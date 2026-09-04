# Russell & Annie 110 Year Sicilian Birthday Extravaganza

The schedule site for the Palermo trip — flat HTML/CSS/JS, no build step, no login,
no framework. All content is driven by two CSV files so anyone comfortable
editing a spreadsheet-like file can update it.

## Updating the schedule

1. Open [`data/schedule.csv`](data/schedule.csv) in a spreadsheet app or text editor.
2. Edit/add a row. Columns:
   - `date` — `YYYY-MM-DD`
   - `day_label` — heading shown at the top of that day, e.g. `Friday — Arrivals & Birthday Dinner`
   - `start_time` / `end_time` — 24h `HH:MM`, leave blank if there's no fixed time
   - `type` — `event` (a normal timed card), `task` (a checklist-style item, e.g. prep errands), or `tbc` (visibly flagged as "needs planning")
   - `track` — leave blank / `Everyone` for the main timeline. Anything else (e.g. `Optional: Cefalù`) becomes its own grouped sub-section for that day. Rows whose `track` starts with `Return option` are automatically grouped into a single "choose your return train" card.
   - `optional` — `yes`/`no`, shows an "Optional" badge
   - `highlight` — `yes`/`no`, gives the card special hero styling (used for the birthday dinner)
   - `title`, `location`, `description`, `link`, `contact_name`, `contact_phone`, `emoji`
3. General trip info (guest arrivals, transport tips, money, key contacts) lives in [`data/info.csv`](data/info.csv), grouped by `category`.
4. Commit and push. Vercel redeploys automatically and the CSVs are served with no-cache headers, so changes show up on next reload — no code changes needed.

**Please don't add personal phone numbers to the CSVs** — the page is public
(even though it's not search-indexed). Business/vendor contacts (restaurants,
tour guides) are fine.

## Running it locally

This is a fetch()-based site, so it won't work by double-clicking `index.html`
(`file://` URLs block `fetch`). Serve it with any static file server, e.g.:

```
python3 -m http.server 8000
# or
npx serve .
```

Then open `http://localhost:8000`.

## Structure

```
index.html          page shell
css/styles.css       design system + layout
js/app.js            CSV loading/parsing/rendering (no external dependencies)
data/schedule.csv    the day-by-day schedule
data/info.csv        "Good to Know" info (guests, transport, money, contacts)
vercel.json          no-cache headers for the CSV data
robots.txt           blocks search indexing
```
