# Medicare Drug Price Explorer

Pick a drug and see what Medicare pays, what the list price is, and how the negotiated prices that took effect on January 1, 2026 (and the second cycle coming in 2027) change it. Everything runs on public CMS data; there is no backend and no build step beyond one Python script.

## Run it

```bash
./serve.sh            # http://localhost:8765
./serve.sh 9000       # any other port
```

Any static file server works. The page fetches `site/data/*.json`, so it has to be served over HTTP rather than opened as a file.

## What you can do

Each drug page leads with **four numbers**, each with a one-line explanation of why it matters:

1. **Medicare spent** in the latest year, with its rank among all drugs, its share of program spending, and the change from the prior year.
2. **People who filled it**, expressed as "about 1 in N" of everyone with Part D.
3. **Cost per person, per year**, with the monthly equivalent.
4. **Negotiated price** (percent off list, with the two 30-day prices) for the 25 negotiated drugs, or the **price-per-unit change** for everything else.

A short plain-English summary follows, generated from the data: whether spending moved because of price or because of use, and for negotiated drugs what the new price would do to gross spending and why the real saving is smaller.

Everything else sits in collapsed sections so the page stays readable:

- **Five-year trend** (2020–2024) with a metric switcher, hover and keyboard tooltips, and a table view.
- **Negotiated price and savings model**: list vs negotiated price, a year of therapy at each, and a four-step estimate of what the price changes for Medicare. A rebate slider moves from gross terms to a net view; a chip applies the rebate CMS's own savings estimate implies (about 51% for the first cycle, 36% for the second).
- **All figures**: every published metric with its definition, manufacturers, and for Part B the ASP payment basis.

"Expand all details" opens every section and is remembered between visits. A "How to read this page" primer at the top explains gross vs net spending, list price, the negotiated price ceiling, and why percent-off-list overstates savings.

The **Negotiated prices** tab summarizes both cycles in four numbers each (spending on the drugs, average cut from list, CMS's net saving estimate, patient out-of-pocket saving), charts every drug's discount, and gives a sortable table that links back to each drug.

You can **search** 3,600+ Part D brand rows and ~800 Part B HCPCS rows by brand, generic or code, filter to either negotiation cycle, and sort by spending, beneficiaries, per-beneficiary cost, per-unit cost, or last year's per-unit change. The URL hash (`#drug=…`, `#view=overview`) makes any view shareable.

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
