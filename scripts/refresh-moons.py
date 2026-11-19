#!/usr/bin/env python3
"""Download real parent-relative moon states for Voyager 1's two planet chapters."""
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
MOONS = [
    ("io", "Io", "501", "jupiter", "599", 1821.6),
    ("europa", "Europa", "502", "jupiter", "599", 1560.8),
    ("ganymede", "Ganymede", "503", "jupiter", "599", 2634.1),
    ("callisto", "Callisto", "504", "jupiter", "599", 2410.3),
    ("titan", "Titan", "606", "saturn", "699", 2574.7),
    ("enceladus", "Enceladus", "602", "saturn", "699", 252.1),
]


def main():
    bundle = {
        "source": "NASA/JPL Horizons",
        "retrievedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "frame": "Parent-relative ecliptic J2000",
        "timeScale": "UTC (Horizons UT)",
        "units": {"position": "au", "velocity": "au/day"},
        "radiusSource": "https://ssd.jpl.nasa.gov/sats/phys_par/",
        "bodies": {},
    }
    for key, name, command, parent, center, radius in MOONS:
        start, stop = ("1979-02-23", "1979-03-15") if parent == "jupiter" else ("1980-11-02", "1980-11-22")
        params = {
            "format": "json", "COMMAND": f"'{command}'", "CENTER": f"'500@{center}'",
            "EPHEM_TYPE": "'VECTORS'", "START_TIME": f"'{start}'", "STOP_TIME": f"'{stop}'",
            "STEP_SIZE": "'1 h'", "OUT_UNITS": "'AU-D'", "CSV_FORMAT": "'YES'",
            "VEC_TABLE": "'2'", "TIME_TYPE": "'UT'", "VEC_CORR": "'NONE'",
            "REF_PLANE": "'ECLIPTIC'",
        }
        url = "https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(params)
        print(f"Fetching {name} relative to {parent}...", flush=True)
        with urllib.request.urlopen(url, timeout=120) as response:
            result = json.load(response)
        if "error" in result:
            raise RuntimeError(result["error"])
        rows = module.parse_states(result["result"])
        bundle["bodies"][key] = {
            "name": name, "command": command, "parent": parent,
            "radiusKm": radius, "query": url, "step": "1 hour", "states": rows,
        }
        print(f"  {len(rows)} real states", flush=True)
        time.sleep(1)
    target = ROOT / "data" / "moons.json"
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps(bundle, separators=(",", ":")) + "\n")
    temporary.replace(target)
    print(f"Saved {target}")


if __name__ == "__main__":
    main()
