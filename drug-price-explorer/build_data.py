#!/usr/bin/env python3
"""Build the explorer's data files from public CMS data.

Sources
  * Medicare Part D Spending by Drug  (data.cms.gov)
  * Medicare Part B Spending by Drug  (data.cms.gov)
  * negotiated_prices.json  (hand-transcribed from CMS Drug Price Negotiation
    Program fact sheets; see the source_url on each cohort)

Usage
  python3 build_data.py            # use cached raw/*.csv if present, else download
  python3 build_data.py --refresh  # re-download the latest CSVs from data.cms.gov

Outputs site/data/{partd,partb,negotiated,meta}.json
"""
import csv
import datetime as dt
import json
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
OUT = os.path.join(HERE, "site", "data")
CATALOG_URL = "https://data.cms.gov/data.json"
DATASETS = {
    "partd": "Medicare Part D Spending by Drug",
    "partb": "Medicare Part B Spending by Drug",
}
LANDING = {
    "partd": "https://data.cms.gov/summary-statistics-on-use-and-payments/medicare-medicaid-spending-by-drug/medicare-part-d-spending-by-drug",
    "partb": "https://data.cms.gov/summary-statistics-on-use-and-payments/medicare-medicaid-spending-by-drug/medicare-part-b-spending-by-drug",
}
# per-year metric order used in the compact JSON
FIELDS = ["spend", "units", "claims", "benes", "per_unit", "per_claim", "per_bene", "outlier"]


def log(*a):
    print(*a, file=sys.stderr)


def fetch_catalog():
    with urllib.request.urlopen(CATALOG_URL, timeout=60) as r:
        return json.load(r)


def latest_csv_distribution(catalog, title):
    for ds in catalog["dataset"]:
        if ds.get("title") == title:
            csvs = [d for d in ds.get("distribution", []) if d.get("format") == "CSV"]
            if not csvs:
                raise RuntimeError(f"no CSV distribution for {title}")

            def key(d):
                m = re.search(r"(\d{4}-\d{2}-\d{2})", d.get("title", ""))
                return m.group(1) if m else ""

            best = max(csvs, key=key)
            return best.get("downloadURL"), key(best), ds.get("modified")
    raise RuntimeError(f"dataset not found in catalog: {title}")


def download(url, path):
    log(f"downloading {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "drug-price-explorer/1.0"})
    with urllib.request.urlopen(req, timeout=300) as r, open(path, "wb") as f:
        f.write(r.read())


def num(s):
    if s is None or s == "":
        return None
    try:
        v = float(s)
    except ValueError:
        return None
    return int(v) if v.is_integer() and abs(v) < 1e15 else round(v, 4)


def years_in_header(header, prefix):
    ys = sorted({int(m.group(1)) for h in header for m in [re.match(prefix + r"_(\d{4})$", h)] if m})
    return ys


def year_block(row, y, spend_key, units_key, clms_key, benes_key, per_unit_key, per_clm_key, per_bene_key, outlier_key):
    vals = [
        num(row.get(f"{spend_key}_{y}")),
        num(row.get(f"{units_key}_{y}")),
        num(row.get(f"{clms_key}_{y}")),
        num(row.get(f"{benes_key}_{y}")),
        num(row.get(f"{per_unit_key}_{y}")),
        num(row.get(f"{per_clm_key}_{y}")),
        num(row.get(f"{per_bene_key}_{y}")),
        num(row.get(f"{outlier_key}_{y}")),
    ]
    return None if all(v is None for v in vals[:4]) else vals


def build_partd(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        header = reader.fieldnames
        years = years_in_header(header, "Tot_Spndng")
        drugs = {}
        for row in reader:
            key = (row["Brnd_Name"], row["Gnrc_Name"])
            d = drugs.setdefault(key, {
                "id": f"d:{row['Brnd_Name']}|{row['Gnrc_Name']}",
                "b": row["Brnd_Name"],
                "g": row["Gnrc_Name"],
                "nm": num(row["Tot_Mftr"]),
                "m": [],
                "y": {},
            })
            if row["Mftr_Name"] == "Overall":
                for y in years:
                    blk = year_block(row, y, "Tot_Spndng", "Tot_Dsg_Unts", "Tot_Clms", "Tot_Benes",
                                     "Avg_Spnd_Per_Dsg_Unt_Wghtd", "Avg_Spnd_Per_Clm", "Avg_Spnd_Per_Bene", "Outlier_Flag")
                    if blk:
                        d["y"][str(y)] = blk
                d["chg"] = num(row.get(f"Chg_Avg_Spnd_Per_Dsg_Unt_{str(years[-2])[2:]}_{str(years[-1])[2:]}"))
                d["cagr"] = num(row.get(f"CAGR_Avg_Spnd_Per_Dsg_Unt_{str(years[0])[2:]}_{str(years[-1])[2:]}"))
            else:
                d["m"].append({"n": row["Mftr_Name"], "s": num(row.get(f"Tot_Spndng_{years[-1]}"))})
    out = []
    for d in drugs.values():
        if not d["y"]:
            continue  # no Overall row (should not happen)
        # single-manufacturer brands: the Overall row duplicates the manufacturer row
        d["m"].sort(key=lambda m: -(m["s"] or 0))
        out.append(d)
    out.sort(key=lambda d: -(d["y"].get(str(years[-1]), [0])[0] or 0))
    return years, out


def build_partb(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        header = reader.fieldnames
        years = years_in_header(header, "Tot_Spndng")
        asp_key = next((h for h in header if h.startswith("Avg_DY") and h.endswith("_ASP_Price")), None)
        out = []
        for row in reader:
            d = {
                "id": f"b:{row['HCPCS_Cd']}",
                "hcpcs": row["HCPCS_Cd"],
                "desc": row["HCPCS_Desc"],
                "b": row["Brnd_Name"],
                "g": row["Gnrc_Name"],
                "y": {},
                "asp": num(row.get(asp_key)) if asp_key else None,
            }
            for y in years:
                blk = year_block(row, y, "Tot_Spndng", "Tot_Dsg_Unts", "Tot_Clms", "Tot_Benes",
                                 "Avg_Spndng_Per_Dsg_Unt", "Avg_Spndng_Per_Clm", "Avg_Spndng_Per_Bene", "Outlier_Flag")
                if blk:
                    d["y"][str(y)] = blk
            d["chg"] = num(row.get(f"Chg_Avg_Spndng_Per_Dsg_Unt_{str(years[-2])[2:]}_{str(years[-1])[2:]}"))
            d["cagr"] = num(row.get(f"CAGR_Avg_Spnd_Per_Dsg_Unt_{str(years[0])[2:]}_{str(years[-1])[2:]}"))
            if d["y"]:
                out.append(d)
    out.sort(key=lambda d: -(d["y"].get(str(years[-1]), [0])[0] or 0))
    return years, out, asp_key


def attach_negotiated(partd, years):
    with open(os.path.join(HERE, "negotiated_prices.json"), encoding="utf-8") as f:
        neg = json.load(f)
    latest = str(years[-1])
    by_key = {}
    for nd in neg["drugs"]:
        rule = nd["match"]
        exact = {s.lower() for s in rule.get("exact", [])}
        prefix = [s.lower() for s in rule.get("prefix", [])]
        matched = []
        for d in partd:
            b = d["b"].lower()
            if b in exact or any(b.startswith(p) for p in prefix):
                matched.append(d)
        if not matched:
            log(f"WARNING: no Part D rows matched negotiated drug {nd['key']}")
        nd["partd_ids"] = [d["id"] for d in matched]
        nd["partd_brands"] = [d["b"] for d in matched]
        # aggregate the matched brand rows per year
        agg = {}
        for y in years:
            ys = str(y)
            s = c = be = 0.0
            seen = False
            for d in matched:
                blk = d["y"].get(ys)
                if blk:
                    seen = True
                    s += blk[0] or 0
                    c += blk[2] or 0
                    be += blk[3] or 0
            if seen:
                agg[ys] = {"spend": round(s, 2), "claims": int(c), "benes": int(be)}
        nd["partd_agg"] = agg
        for d in matched:
            d["neg"] = nd["key"]
        by_key[nd["key"]] = nd
    return neg


def totals(rows, years):
    t = {}
    for y in years:
        ys = str(y)
        s = sum((d["y"].get(ys) or [0])[0] or 0 for d in rows)
        b = sum((d["y"].get(ys) or [0, 0, 0, 0])[3] or 0 for d in rows)
        c = sum((d["y"].get(ys) or [0, 0, 0])[2] or 0 for d in rows)
        t[ys] = {"spend": round(s, 2), "claims": int(c), "benes_sum": int(b)}
    return t


def main():
    refresh = "--refresh" in sys.argv
    os.makedirs(RAW, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)

    release = {}
    catalog = None
    for key, title in DATASETS.items():
        path = os.path.join(RAW, f"{key}.csv")
        if refresh or not os.path.exists(path):
            catalog = catalog or fetch_catalog()
            url, data_year, modified = latest_csv_distribution(catalog, title)
            download(url, path)
            release[key] = {"download_url": url, "data_through": data_year, "catalog_modified": modified}
            with open(os.path.join(RAW, f"{key}.release.json"), "w") as f:
                json.dump(release[key], f, indent=2)
        else:
            rp = os.path.join(RAW, f"{key}.release.json")
            release[key] = json.load(open(rp)) if os.path.exists(rp) else {}
        release[key]["title"] = title
        release[key]["landing_page"] = LANDING[key]

    d_years, partd = build_partd(os.path.join(RAW, "partd.csv"))
    b_years, partb, asp_key = build_partb(os.path.join(RAW, "partb.csv"))
    neg = attach_negotiated(partd, d_years)

    meta = {
        "generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "fields": FIELDS,
        "partd": {"years": d_years, "n_drugs": len(partd), "totals": totals(partd, d_years), **release["partd"]},
        "partb": {"years": b_years, "n_drugs": len(partb), "asp_field": asp_key, "totals": totals(partb, b_years), **release["partb"]},
    }

    def dump(name, obj):
        p = os.path.join(OUT, name)
        with open(p, "w", encoding="utf-8") as f:
            json.dump(obj, f, separators=(",", ":"), ensure_ascii=False)
        log(f"wrote {p} ({os.path.getsize(p)/1024:.0f} KB)")

    dump("partd.json", {"years": d_years, "fields": FIELDS, "drugs": partd})
    dump("partb.json", {"years": b_years, "fields": FIELDS, "drugs": partb})
    dump("negotiated.json", neg)
    dump("meta.json", meta)
    log(f"Part D: {len(partd)} brand rows, years {d_years[0]}-{d_years[-1]}; Part B: {len(partb)} HCPCS rows")


if __name__ == "__main__":
    main()
