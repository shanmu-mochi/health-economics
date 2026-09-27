# Medicare Drug Price Explorer

Pick a drug and see what Medicare pays, what the list price is, and how the negotiated prices that took effect on January 1, 2026 (and the second cycle coming in 2027) change it. Everything runs on public CMS data; there is no backend and no build step beyond one Python script.

## Run it

```bash
./serve.sh            # http://localhost:8765
./serve.sh 9000       # any other port
```

Any static file server works. The page fetches `site/data/*.json`, so it has to be served over HTTP rather than opened as a file.

## What you can do

- **Search** 3,600+ Part D brand rows and ~800 Part B HCPCS rows by brand, generic or code. Sort by spending, beneficiaries, per-beneficiary cost, per-unit cost, or last year's per-unit change.
- **See what Medicare paid** for 2020–2024: total gross spending, beneficiaries, claims, and spending per claim, per beneficiary and per dosage unit, with year-over-year deltas and a five-year trend chart (with a table view).
- **Compare list price to the negotiated price** for the 10 drugs whose maximum fair prices took effect in 2026 and the 15 whose prices take effect in 2027: 30-day list price vs negotiated price, the discount, and a year of therapy at each.
- **Model what changes for Medicare.** A rebate slider lets you move from gross terms (what the CMS file reports) to a net view. CMS's own aggregate savings estimate implies pre-negotiation rebates averaging about 51% across the first cycle and 36% across the second; a chip applies that value.
- **Negotiated prices view** summarizes both cycles, charts every drug's discount, and gives a sortable table that links back to each drug's page.

The URL hash (`#drug=…`, `#view=overview`) makes any view shareable.

## Data

| File | Source | Notes |
|---|---|---|
| `site/data/partd.json` | [CMS Medicare Part D Spending by Drug](https://data.cms.gov/summary-statistics-on-use-and-payments/medicare-medicaid-spending-by-drug/medicare-part-d-spending-by-drug) | Gross drug cost (Medicare + plan + beneficiary payments), before manufacturer rebates. Brand × generic rows, 2020–2024, with a manufacturer breakdown. |
| `site/data/partb.json` | [CMS Medicare Part B Spending by Drug](https://data.cms.gov/summary-statistics-on-use-and-payments/medicare-medicaid-spending-by-drug/medicare-part-b-spending-by-drug) | Medicare payment plus beneficiary liability at the HCPCS level, 2020–2024, plus the average 2024 ASP-based price. |
| `negotiated_prices.json` | CMS fact sheets for [initial price applicability year 2026](https://www.cms.gov/files/document/fact-sheet-negotiated-prices-initial-price-applicability-year-2026.pdf) and [2027](https://www.cms.gov/files/document/fact-sheet-negotiated-prices-ipay-2027.pdf) | Hand-transcribed: list price (WAC) and maximum fair price per 30-day supply, discount, gross Part D spending and enrollees in the reference year, plus cohort totals and CMS's savings estimates. Each drug carries a `match` rule mapping it to brand rows in the Part D file. |

`build_data.py` reads the raw CSVs, compacts them into the JSON files above, attaches the negotiated-price matches, and writes `meta.json` with program totals and release metadata.

```bash
python3 build_data.py            # rebuild from raw/*.csv (downloads them if missing)
python3 build_data.py --refresh  # pull the latest release from data.cms.gov, then rebuild
```

The script finds the newest CSV for each dataset through the data.cms.gov catalog, so a new CMS release only needs `--refresh`. When a new negotiation cycle is announced, add its drugs and cohort block to `negotiated_prices.json` and rebuild.

## Caveats worth knowing

- Part D "spending" is gross. CMS cannot publish rebates, so for heavily rebated drugs the net cost is far lower than these numbers.
- The 30-day list and negotiated prices are CMS's summary figures; the binding maximum fair price is set per NDC.
- The savings model is an illustration: it scales gross spending by the negotiated-to-list ratio and ignores utilization shifts, the 2025 Part D redesign and the manufacturer discount program.
- Part B drugs are shown for context; negotiated prices reach Part B only from the 2028 price year.

## Layout

```
build_data.py            data pipeline
negotiated_prices.json   curated negotiated-price data (source of truth)
serve.sh                 local static server
raw/                     cached CMS CSVs (ignored by git) + release metadata
site/                    the static app: index.html, styles.css, app.js, data/
```

No dependencies: Python 3 standard library for the build, vanilla JS and inline SVG for the app.
