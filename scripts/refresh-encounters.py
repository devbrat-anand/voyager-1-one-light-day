#!/usr/bin/env python3
"""Densify Voyager 1's anniversary chapters with sequential three-hour JPL queries."""
import datetime as dt
import json
from pathlib import Path
import time
import urllib.parse
import urllib.request
from importlib.util import module_from_spec, spec_from_file_location

ROOT = Path(__file__).resolve().parents[1]
spec = spec_from_file_location("refresh_data", ROOT / "scripts" / "refresh-data.py")
module = module_from_spec(spec)
spec.loader.exec_module(module)
WINDOWS = [
    ("1979-02-23", "1979-03-15"),
    ("1980-11-02", "1980-11-22"),
    ("2012-08-15", "2012-09-04"),
    ("2026-10-29", "2026-11-18 10:16:07"),
]


def main():
    path = ROOT / "data" / "ephemeris.json"
    bundle = json.loads(path.read_text())
    body = bundle["bodies"]["voyager1"]
    merged = {row[0]: row for row in body["states"]}
    queries = []
    for start, stop in WINDOWS:
        params = {
            "format": "json", "COMMAND": "'-31'", "EPHEM_TYPE": "'VECTORS'",
            "CENTER": "'500@10'", "START_TIME": f"'{start}'", "STOP_TIME": f"'{stop}'",
            "STEP_SIZE": "'3 h'", "OUT_UNITS": "'AU-D'", "CSV_FORMAT": "'YES'",
            "VEC_TABLE": "'2'", "TIME_TYPE": "'UT'", "VEC_CORR": "'NONE'",
            "REF_PLANE": "'ECLIPTIC'",
            "TIME_DIGITS": "'SECONDS'",
        }
        url = "https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(params)
        with urllib.request.urlopen(url, timeout=120) as response:
            data = json.load(response)
        if "error" in data:
            raise RuntimeError(data["error"])
        rows = module.parse_states(data["result"])
        for row in rows:
            merged[row[0]] = row
        queries.append(url)
        print(f"{start}: {len(rows)} real three-hour states", flush=True)
        time.sleep(1)
    body["states"] = sorted(merged.values(), key=lambda row: row[0])
    body["encounterQueries"] = queries
    body["encounterStep"] = "3 hours; 4 twenty-day windows"
    body["encountersRetrievedAt"] = dt.datetime.now(dt.timezone.utc).isoformat()
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(bundle, separators=(",", ":")) + "\n")
    temporary.replace(path)
    print(f"Saved {len(body['states'])} Voyager 1 states.")


if __name__ == "__main__":
    main()
