"""Play consecutive quiet years in real time; never inject or fast-forward game state."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("VOYAGER_URL", "http://127.0.0.1:8765")
OUT = Path(os.environ.get("VOYAGER_ARTIFACTS", "/tmp/voyager-campaign"))
OUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(BASE)
    page.wait_for_load_state("networkidle")
    expect(page.locator("#voyage-start")).to_be_enabled(timeout=30000)
    canvas = page.locator("#voyage-canvas")
    page.locator("#chapter").select_option("4")
    expect(page.locator("#voyage-level")).to_have_text("Level 5 / 50 · 45s")
    page.locator("#voyage-start").click()
    expect(page.locator("#voyage-overlay-title")).to_have_text("1981 complete.", timeout=70000)
    expect(page.locator("#level-transition")).to_contain_text("1982 begins in")
    first_score = int(page.locator("#voyage-score").inner_text().replace(",", ""))
    assert first_score > 0
    expect(canvas).to_have_attribute("data-journey-score", str(first_score))
    page.screenshot(path=str(OUT / "year-complete.png"))

    # P must freeze a completion countdown, not restart the just-finished year.
    page.keyboard.press("KeyP")
    expect(page.locator("#level-transition")).to_have_text("Countdown paused · 1982 is next")
    page.wait_for_timeout(150)
    remaining = canvas.get_attribute("data-transition-remaining")
    page.wait_for_timeout(4500)
    assert canvas.get_attribute("data-transition-remaining") == remaining
    expect(page.locator("#chapter")).to_have_value("4")
    page.locator("#voyage-start").click()
    expect(page.locator("#level-transition")).to_contain_text("1982 begins in")

    # About and look-around must each preserve the completion result and remaining time.
    page.locator("#sources-open").click()
    page.wait_for_timeout(150)
    remaining = canvas.get_attribute("data-transition-remaining")
    page.wait_for_timeout(4500)
    assert canvas.get_attribute("data-transition-remaining") == remaining
    page.locator("#sources-close").click()
    expect(page.locator("#voyage-start")).to_have_text("Continue countdown")
    page.locator("#voyage-look").click()
    expect(page.locator("#voyage-overlay")).not_to_be_visible()
    page.wait_for_timeout(4500)
    assert canvas.get_attribute("data-transition-remaining") == remaining
    page.locator("#voyage-look").click()
    expect(page.locator("#voyage-overlay-title")).to_have_text("1981 complete.")
    expect(page.locator("#voyage-result")).to_contain_text(f"Journey {first_score:,}")
    page.locator("#voyage-start").click()
    expect(page.locator("#chapter")).to_have_value("5", timeout=8000)
    expect(page.locator("#voyage-overlay")).not_to_be_visible()
    expect(canvas).to_have_attribute("data-duration", "45")
    page.wait_for_function("Number(document.querySelector('#voyage-canvas').dataset.progress) > 0")
    expect(canvas).to_have_attribute("data-journey-score", str(first_score))
    page.screenshot(path=str(OUT / "next-year-launched.png"))

    expect(page.locator("#voyage-overlay-title")).to_have_text("1982 complete.", timeout=70000)
    second_score = int(page.locator("#voyage-score").inner_text().replace(",", ""))
    assert second_score > 0
    expect(canvas).to_have_attribute("data-journey-score", str(first_score + second_score))
    # Let the second transition happen without any click.
    expect(page.locator("#chapter")).to_have_value("6", timeout=8000)
    expect(page.locator("#voyage-overlay")).not_to_be_visible()
    expect(canvas).to_have_attribute("data-journey-score", str(first_score + second_score))
    expect(page.locator("#voyage-overlay-title")).to_have_text("1983 complete.", timeout=70000)

    # Changing years cancels a pending transition and starts a fresh score chain.
    page.locator("#chapter").select_option("10")
    expect(page.locator("#voyage-start")).to_have_text("Launch 1987")
    expect(canvas).to_have_attribute("data-journey-score", "0")
    expect(page.locator("#level-transition")).not_to_be_visible()
    page.wait_for_timeout(4500)
    expect(page.locator("#chapter")).to_have_value("10")
    expect(canvas).to_have_attribute("data-progress", "0.00000")
    page.locator("#voyage-start").click()
    expect(page.locator("#voyage-overlay-title")).to_have_text("1987 complete.", timeout=70000)
    expect(page.locator("#voyage-next")).to_have_text("Replay 1987")
    page.locator("#voyage-next").click()
    expect(page.locator("#chapter")).to_have_value("10")
    expect(canvas).to_have_attribute("data-journey-score", "0")
    expect(page.locator("#voyage-overlay")).not_to_be_visible()
    expect(page.locator("#level-transition")).not_to_be_visible()
    page.wait_for_timeout(4500)
    expect(page.locator("#chapter")).to_have_value("10")
    assert 0 < float(canvas.get_attribute("data-progress")) < .2
    assert not errors, errors
    browser.close()
    print(f"PASS: 45-second years, completion countdown, P/About/look-around pause, consecutive automatic launches, exact score carry, selection/replay cancellation. Screenshots: {OUT}")
