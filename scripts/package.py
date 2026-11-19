#!/usr/bin/env python3
"""Package a static site and a self-contained, double-clickable HTML demo."""
import argparse
from pathlib import Path
import shutil
import subprocess
from urllib.parse import quote
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=ROOT / "dist")
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    html = (ROOT / "index.html").read_text()
    css = (ROOT / "style.css").read_text()
    subprocess.run(["npm", "run", "build"], cwd=ROOT, check=True)
    app = (ROOT / "game.js").read_text()
    ephemeris = (ROOT / "data" / "ephemeris.json").read_text()
    html = html.replace('<link rel="stylesheet" href="style.css">', f"<style>{css}</style>")
    icon = (ROOT / "icon.svg").read_text().strip()
    html = html.replace('href="icon.svg"', f'href="data:image/svg+xml,{quote(icon, safe="")}"')
    html = html.replace('href="./"', 'href="#voyage"')
    safe_ephemeris = ephemeris.replace("<", r"\u003c")
    safe_app = app.replace("</script", r"<\/script")
    html = html.replace(
        '<script defer src="game.js"></script>',
        f'<script type="application/json" id="bundled-ephemeris">{safe_ephemeris}</script>\n'
        f'<script>\n{safe_app}\n</script>',
    )
    notices = (ROOT / "THIRD-PARTY-NOTICES.md").read_text().replace("--", "- -")
    html = html.replace("</body>", f"<!--\n{notices}\n-->\n</body>")
    standalone = args.out / "Voyager-1-One-Light-Day.html"
    standalone.write_text(html)
    # Preserve the filename used by the earlier local release.
    (args.out / "Voyager-Last-Light.html").write_text(html)
    files = ["index.html", "style.css", "icon.svg", "game.js", "data/ephemeris.json", "data/moons.json", "THIRD-PARTY-NOTICES.md"]
    archive_path = args.out / "voyager-one-light-day-site.zip"
    with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for name in files:
            archive.write(ROOT / name, name)
        archive.write(ROOT / "README.md", "README.md")
    shutil.copyfile(archive_path, args.out / "voyager-last-light-site.zip")
    embed = args.out / "Google-Sites-embed.html"
    embed.write_text(
        '<!-- Replace YOUR-PAGES-URL with your public HTTPS GitLab Pages URL. -->\n'
        '<iframe src="https://YOUR-PAGES-URL/" title="Voyager 1: One Light-Day" '
        'width="100%" height="1000" style="border:0" '
        'allow="fullscreen" allowfullscreen></iframe>\n'
    )
    print(f"Standalone demo: {standalone}")
    print(f"Static hosting ZIP: {archive_path}")


if __name__ == "__main__":
    main()
