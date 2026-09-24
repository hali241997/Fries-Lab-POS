# Fries Lab POS

Offline desktop billing app for Fries Lab. No login, no internet required.

## Data storage

Menu items and sales history are stored as CSV files on the laptop, under the app's user data folder:

- macOS: `~/Library/Application Support/Fries Lab POS/data/`
- Windows: `%APPDATA%/Fries Lab POS/data/`

Files:
- `menu.csv` — menu items (name, cost price, sale price, icon emoji)
- `sales_log_YYYY_MM.csv` — one file per month, every item sold that month (used to compute the Daily and Monthly reports)

## Tech stack

TypeScript + React + Electron, styled with Tailwind CSS (brand colors/fonts configured in `tailwind.config.js`), charts via `recharts` (donut chart on Daily Report, bar chart on Monthly Report), icons via `lucide-react`. Everything is bundled at build time — no CDN dependency, so the app works fully offline except for optionally loading the Google Fonts used for headings (falls back to system fonts without internet).

## Development

```bash
npm install
npm run electron:dev
```

This starts the Vite dev server and opens the app in an Electron window with hot reload.

## Building an installable app

```bash
npm run electron:build
```

Produces a distributable app under `release/` (`.dmg` on macOS, installer `.exe` on Windows — build on the matching OS, or set up cross-platform build tooling separately).

## Printing

Receipts are formatted for 80mm thermal paper. "Complete Order & Print" opens the OS print dialog — select the receipt printer there (set it as the default printer on the shop laptop to skip that step each time).
