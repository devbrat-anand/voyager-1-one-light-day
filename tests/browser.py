"""Verify anniversary UI, offline release and explicit failure states."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("VOYAGER_URL", "http://127.0.0.1:8765")
ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get("VOYAGER_ARTIFACTS", "/tmp/voyager-lightday"))
OUT.mkdir(parents=True, exist_ok=True)


def assert_no_creator_credit(page):
    expect(page.locator("#sources-dialog")).not_to_contain_text("Devbrat Anand")
    expect(page.locator('#sources-dialog a[href*="linkedin.com"]')).to_have_count(0)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    errors, external = [], []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("request", lambda request: external.append(request.url)
            if request.url.startswith("http") and not request.url.startswith(BASE) else None)
    page.goto(BASE)
    page.wait_for_load_state("networkidle")
    expect(page.locator("#voyage-start")).to_be_enabled(timeout=30000)
    expect(page.locator("#app-status")).to_be_empty()
    expect(page.locator("#voyage-canvas")).to_have_attribute("data-sky-stars", "15160")
    assert page.evaluate("scrollY") == 0
    bounds = page.locator("#voyage-canvas").bounding_box()
    assert bounds["width"] == 1440 and bounds["height"] >= 940
    assert bounds["y"] + bounds["height"] == 1000
    assert not page.evaluate("document.documentElement.scrollHeight > innerHeight")
    assert page.locator("footer, .voyage-toolbar, .mission-strip, .voyage-notes").count() == 0
    assert page.locator("[data-tab]").count() == 0
    assert page.locator("#chapter option").count() == 50
    expect(page.locator("#voyage-level")).to_have_text("Level 1 / 50 · 80s · Milestone")
    expect(page.locator("#voyage-date")).to_have_text("6 Sept 1977")
    page.locator("#sources-open").click()
    expect(page.locator("#sources-dialog")).not_to_contain_text("Developed by")
    assert_no_creator_credit(page)
    expect(page.locator("#sources-dialog")).not_to_contain_text("Asset licenses")
    expect(page.locator('#sources-dialog a[href*="simbad"]')).to_have_count(0)
    expect(page.locator("#sources-dialog").get_by_role("heading", name="Credits & privacy")).to_have_count(0)
    expect(page.locator("#data-provenance")).to_contain_text("Voyager 1 chapters")
    for date in ["2026-11-14", "14 November 2026", "14 Nov 2026"]:
        expect(page.locator("#sources-dialog")).not_to_contain_text(date)
    expect(page.locator("#sources-dialog")).to_contain_text("UFOs, coins, pulse fields, scoring and warp are arcade inventions")
    expect(page.locator("#moon-provenance")).to_contain_text("NASA/JPL Horizons")
    expect(page.locator("#sources-dialog")).to_contain_text("non-colliding illustrative scenery")
    page.keyboard.press("Escape")
    page.locator("#sky-toggle").click()
    expect(page.locator("#sky-toggle")).to_have_attribute("aria-pressed", "false")
    expect(page.locator("#voyage-canvas")).to_have_attribute("data-sky-stars", "15160")
    page.locator("#sky-toggle").click()
    expect(page.locator("#sky-toggle")).to_have_attribute("aria-pressed", "true")
    page.locator("#sound").click()
    expect(page.locator("#sound")).to_have_text("Sound on")
    page.locator("#sound").click()
    expect(page.locator("#sound")).to_have_text("Sound off")
    expect(page.locator("#pickup-center")).not_to_be_visible()
    expect(page.locator("#voyage-canvas")).to_have_attribute("data-pickup-halo", "false")
    page.locator("#voyage-start").click()
    marker = page.locator("#pickup-center")
    expect(marker).to_be_visible()
    expect(marker).to_have_text("Pickup center")
    expect(page.locator("#voyage-canvas")).to_have_attribute("data-pickup-halo", "true")
    expect(page.locator("#voyage-canvas")).to_have_attribute("data-pickup-radius", "1.3125")
    assert marker.evaluate("el=>getComputedStyle(el).pointerEvents") == "none"
    initial = marker.bounding_box()
    page.keyboard.down("ArrowRight")
    page.wait_for_timeout(500)
    page.keyboard.up("ArrowRight")
    moved = marker.bounding_box()
    assert abs(moved["x"] - initial["x"]) > .5
    page.keyboard.press("KeyE")
    expect(marker).to_have_class("pickup-center pulse-active")
    expect(page.locator("#voyage-canvas")).to_have_attribute("data-pickup-radius", "2.65")
    page.screenshot(path=str(OUT / "pickup-halo-pulse.png"))
    page.locator("#voyage-look").click()
    expect(marker).not_to_be_visible()
    expect(page.locator("#voyage-canvas")).to_have_attribute("data-pickup-halo", "false")
    page.locator("#voyage-look").click()
    expect(marker).to_be_visible()
    expect(page.locator("#voyage-canvas")).to_have_attribute("data-pickup-halo", "true")
    page.locator("#voyage-start").click()
    expect(marker).to_have_class("pickup-center", timeout=4000)
    expect(page.locator("#voyage-canvas")).to_have_attribute("data-pickup-radius", "1.3125")
    page.screenshot(path=str(OUT / "pickup-center-desktop.png"))
    page.close()

    for width, height in [(390, 844), (320, 568), (844, 390)]:
        mobile = browser.new_page(viewport={"width": width, "height": height}, is_mobile=True, has_touch=True)
        mobile.on("pageerror", lambda error: errors.append(str(error)))
        mobile.goto(BASE)
        mobile.wait_for_load_state("networkidle")
        expect(mobile.locator("#voyage-start")).to_be_enabled(timeout=30000)
        expect(mobile.locator("#voyage-canvas")).to_have_attribute("data-sky-stars", "15160")
        bounds = mobile.locator("#voyage-canvas").bounding_box()
        assert bounds["height"] / height >= .85, (width, height, bounds)
        assert bounds["y"] + bounds["height"] <= height
        assert not mobile.evaluate("document.documentElement.scrollHeight > innerHeight || document.documentElement.scrollWidth > innerWidth")
        mobile.locator("#voyage-start").click()
        expect(mobile.locator("#voyage-overlay")).not_to_be_visible()
        expect(mobile.locator("#pickup-center")).to_be_visible()
        expect(mobile.locator("#voyage-canvas")).to_have_attribute("data-pickup-halo", "true")
        expect(mobile.locator("#voyage-canvas")).to_have_attribute("data-pickup-radius", "1.3125")
        caption = mobile.locator("#encounter-objects").bounding_box()
        if caption:
            score = mobile.locator("#journey-score").bounding_box()
            assert score["y"] + score["height"] + 4 <= caption["y"]
        marker_box = mobile.locator("#pickup-center").bounding_box()
        assert 0 <= marker_box["x"] <= width - marker_box["width"]
        assert 0 <= marker_box["y"] <= height - marker_box["height"]
        for control in ["#voyage-pulse", '[data-steer="up"]', '[data-steer="boost"]']:
            box = mobile.locator(control).bounding_box()
            assert box["y"] >= 0 and box["y"] + box["height"] <= height
        mobile.screenshot(path=str(OUT / f"immersive-{width}x{height}.png"))
        mobile.close()

    # A missing bundle must never substitute a fabricated trajectory.
    broken = browser.new_page()
    broken.route("**/data/ephemeris.json", lambda route: route.abort())
    broken.goto(BASE)
    expect(broken.locator("#app-status")).to_contain_text("Flight data unavailable")
    expect(broken.locator("#voyage-start")).to_be_disabled()
    expect(broken.locator("#voyage-overlay-story")).to_contain_text("No fabricated route")
    broken.close()

    invalid = browser.new_page()
    invalid.route("**/data/ephemeris.json", lambda route: route.fulfill(json={"bodies": {}}))
    invalid.goto(BASE)
    expect(invalid.locator("#app-status")).to_contain_text("Invalid JPL state vectors")
    expect(invalid.locator("#voyage-start")).to_be_disabled()
    invalid.close()

    no_graphics = browser.new_page()
    no_graphics.add_init_script("""(() => {
      const original=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(type,...args) {
        return type.startsWith('webgl') ? null : original.call(this,type,...args);
      };
    })()""")
    no_graphics.goto(BASE)
    expect(no_graphics.locator("#voyage-overlay-title")).to_have_text("3D graphics unavailable")
    expect(no_graphics.locator("#voyage-start")).to_be_disabled()
    expect(no_graphics.locator("#voyage-overlay-story")).to_contain_text("WebGL 2")
    no_graphics.close()

    storage = browser.new_page(reduced_motion="reduce")
    storage.on("pageerror", lambda error: errors.append(str(error)))
    storage.add_init_script("""Object.defineProperty(window,'localStorage',{
      get(){throw new DOMException('Storage blocked','SecurityError')}
    })""")
    storage.goto(BASE)
    expect(storage.locator("#voyage-start")).to_be_enabled(timeout=30000)
    expect(storage.locator("#voyage-canvas")).to_have_attribute("data-sky-stars", "15160")
    expect(storage.locator("#voyage-accessible-status")).to_contain_text("Saved scores unavailable")
    storage.locator("#voyage-start").click()
    expect(storage.locator("#voyage-coins")).not_to_have_text("0 / 45 records", timeout=12000)
    storage.close()

    milestone = browser.new_page()
    milestone.clock.set_fixed_time("2026-11-18T10:16:08Z")
    milestone.goto(BASE)
    expect(milestone.locator("#anniversary-countdown")).to_have_text("One light-day")
    milestone.close()

    # The deliverable is an actual file:// HTML with all network access blocked.
    standalone = ROOT / "dist" / "Voyager-1-One-Light-Day.html"
    assert standalone.exists(), "Run scripts/package.py before the release browser suite"
    offline = browser.new_context(offline=True, viewport={"width": 1200, "height": 1000})
    local = offline.new_page()
    local.on("pageerror", lambda error: errors.append(str(error)))
    local.goto(standalone.as_uri())
    local.wait_for_load_state("networkidle")
    expect(local).to_have_title("Voyager 1: One Light-Day")
    expect(local.locator("#voyage-start")).to_be_enabled(timeout=30000)
    expect(local.locator("#voyage-canvas")).to_have_attribute("data-sky-stars", "15160")
    expect(local.locator("#voyage-canvas")).to_have_attribute("data-moons", "")
    assert local.locator("#chapter option").count() == 50
    local.locator("#sources-open").click()
    expect(local.locator("#sources-dialog")).not_to_contain_text("Developed by")
    assert_no_creator_credit(local)
    expect(local.locator("#sources-dialog")).not_to_contain_text("Asset licenses")
    expect(local.locator('#sources-dialog a[href*="simbad"]')).to_have_count(0)
    for date in ["2026-11-14", "14 November 2026", "14 Nov 2026"]:
        expect(local.locator("#sources-dialog")).not_to_contain_text(date)
    expect(local.locator("#sources-dialog").get_by_role("heading", name="Credits & privacy")).to_have_count(0)
    local.locator("#sources-close").click()
    assert local.locator("#voyage-canvas").evaluate("el=>Boolean(el.getContext('webgl2'))")
    local.locator("#voyage-milestone").click()
    local.locator("#voyage-start").click()
    expect(local.locator("#voyage-canvas")).to_have_attribute("data-pickup-halo", "true")
    expect(local.locator("#voyage-canvas")).to_have_attribute("data-pickup-radius", "1.3125")
    expect(local.locator("#voyage-coins")).not_to_have_text("0 / 45 records", timeout=12000)
    local.screenshot(path=str(OUT / "offline-lightday.png"), full_page=True)
    offline.close()
    assert not errors, errors
    assert not external, external
    browser.close()
    print(f"PASS: single-screen UI, sources, sound, sky labels, missing/invalid data, WebGL failure, blocked storage, reduced motion, milestone date and offline standalone. Screenshots: {OUT}")
