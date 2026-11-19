#!/usr/bin/env python3
"""Download public JPL states sequentially; no browser proxy or API key needed."""
import csv
import datetime as dt
import io
import json
from pathlib import Path
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
BODIES = [
    ("earth", "399", "1977-08-20", "5 d"),
    ("jupiter", "599", "1977-08-20", "30 d"),
    ("saturn", "699", "1977-08-20", "30 d"),
    ("uranus", "799", "1977-08-20", "30 d"),
    ("neptune", "899", "1977-08-20", "30 d"),
    ("voyager1", "-31", "1977-09-06", "10 d"),
    ("voyager2", "-32", "1977-08-21", "10 d"),
]


def parse_states(text):
    if "$$SOE" not in text or "$$EOE" not in text:
        raise ValueError(f"Horizons did not return ephemerides: {text[-1600:]}")
    rows = csv.reader(io.StringIO(text.split("$$SOE")[1].split("$$EOE")[0].strip()))
    states = []
    for row in rows:
        # JD UTC, heliocentric position (au), velocity (au/day).
        states.append([float(row[0]), *[float(x) for x in row[2:8]]])
    if len(states) < 2:
        raise ValueError("Ephemeris has fewer than two states")
    return states


def main():
    bundle = {
        "source": "NASA/JPL Horizons",
        "retrievedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "frame": "Heliocentric ecliptic J2000",
        "timeScale": "UTC (Horizons UT)",
        "units": {"position": "au", "velocity": "au/day"},
        "note": "Geometric reconstructed/predicted states, not live telemetry. Interpolated with cubic Hermite. Early Voyager 1 trajectory is approximate mission-design reconstruction.",
        "bodies": {},
    }
    for name, command, start, step in BODIES:
        params = {
            "format": "json", "COMMAND": f"'{command}'",
            "EPHEM_TYPE": "'VECTORS'", "CENTER": "'500@10'",
            "START_TIME": f"'{start}'", "STOP_TIME": "'2031-01-01'",
            "STEP_SIZE": f"'{step}'", "OUT_UNITS": "'AU-D'",
            "CSV_FORMAT": "'YES'", "VEC_TABLE": "'2'",
            "TIME_TYPE": "'UT'", "VEC_CORR": "'NONE'",
            "REF_PLANE": "'ECLIPTIC'",
        }
        url = "https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(params)
        print(f"Fetching {name}...", flush=True)
        with urllib.request.urlopen(url, timeout=120) as response:
            data = json.load(response)
        if "error" in data:
            raise RuntimeError(data["error"])
        states = parse_states(data["result"])
        bundle["bodies"][name] = {
            "command": command, "query": url, "step": step, "states": states,
        }
        print(f"  {len(states)} states", flush=True)
        time.sleep(1)
    target = ROOT / "data" / "ephemeris.json"
    target.parent.mkdir(exist_ok=True)
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps(bundle, separators=(",", ":")) + "\n")
    temporary.replace(target)
    print(f"Saved {target} ({target.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
