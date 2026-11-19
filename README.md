# Voyager 1: One Light-Day

Watch the gameplay trailer:

https://github.com/user-attachments/assets/34d9a56a-3440-4f99-84f4-de070e858394

A single-screen 3D arcade tribute for **18 November 2026**, when NASA announces Voyager 1 reaching one light-day from Earth: **02:16:07 PST / 10:16:07 UTC**, approximately **25.902 billion km** away.

A tribute to Voyager 1 and the spirit of exploration, developed by [Devbrat Anand](https://www.linkedin.com/in/devbrat-anand/). Developer credit is not displayed in About; asset-license notices remain in the release documentation and embedded standalone-file notices.

Fly a modeled Voyager 1 along real NASA/JPL trajectory segments. Collect golden records, intercept moving violet UFOs, use pickup pulses and manage a finite time-warp reserve. Textured planets, Saturn's rings, an illustrative Milky Way and named sky directions surround the route. The previous console tabs and Voyager 2 campaign are no longer in the interface.

The canvas fills the window below a compact chapter bar: about 95% of a 1,000 px-high desktop screen, or 90% of an 844 px-high phone. There is no separate hero, footer or text panel to scroll past. Instructions, the anniversary countdown, science disclosures and credits live under **About & science**. The layout also follows the available viewport inside Google Sites.

The 1979 and 1980 levels include **Io, Europa, Ganymede and Callisto** at Jupiter and **Titan and Enceladus** at Saturn while their encounter windows are being played. Their orbital directions come from downloaded hourly JPL states; moons are hidden outside those data windows. Displayed orbital distances are compressed and moon sizes enlarged; surfaces are procedural illustrations. The illuminated sky adds **15,160 decorative star points** in three lightweight batches: 7,200 faint field stars, 160 brighter blue-white/warm stars, and 7,800 fine stellar-band points, alongside a brighter Milky Way texture and blue/violet haze. Stars are deterministic and steady, without flashing, twinkling or a bloom post-processing pass. Dark space remains between stars for pickup visibility. **Sky names** toggles labels, not the starfield. Occasional rocky **meteoroids** are non-colliding illustrative scenery outside the steering corridor, not tracked debris, fiery atmospheric meteors or a claim that Voyager flies through a dense asteroid field.

## Play

Fly **50 yearly levels, 1977–2026**, with no gaps between their historical date ranges. Most span 1 January to the next 1 January. The launch level begins on **6 September 1977**, the first bundled JPL state after the real 5 September launch. The finale ends at the exact announced milestone time.

| Year | Theme | Unboosted flight |
|---|---|---|
| 1977 | Launch | 80 seconds |
| 1979 | Jupiter slingshot | 95 seconds |
| 1980 | Saturn farewell | 100 seconds |
| 1990 | The Pale Blue Dot | 80 seconds |
| 1998 | Overtaking Pioneer 10 | 80 seconds |
| 2004 | Termination shock | 85 seconds |
| 2012 | Heliopause crossing | 100 seconds |
| 2026 | One light-day from home | 100 seconds |
| Other 42 years | The outward journey | 45 seconds each |

**43 minutes 30 seconds** of unboosted gameplay, plus **3 minutes 16 seconds** for 49 automatic transitions: **46 minutes 46 seconds** total, excluding pauses and retries. Warp shortens the flight; completing levels does not require collecting every pickup.

Each finish announces **year complete**, shows the year and journey scores, and counts down four seconds before **automatically launching the immediate next year**. You can begin the next year immediately. Score carries forward exactly once; each year has a fresh combo, pickups, warp reserve and pulse. The finale stops at 2026 instead of wrapping.

Pause, browser blur/hidden state, About and Look around freeze the countdown until you explicitly resume. Choosing another year or **Replay year** cancels a pending transition and resets the journey score. The final **Start new journey** button begins 1977 again. Best scores are saved per year in `voyager1-years-scores-v1`; earlier four-chapter scores are left untouched. Journey progress and its cumulative score are session-only, not a reload checkpoint.

- **Steer:** arrows or WASD; on touch screens, drag the scene or hold the direction buttons. Forward travel is automatic.
- **Aim:** the cyan **Pickup center** ring marks the actual steering/collision origin on the golden body beneath the dish. The faint outer halo shows gold's collection radius in the flight cross-section when passing a pickup, not a long-distance magnet. Normal gold and UFO radii are **25% wider**: 1.3125 and 1.625 game units respectively. UFOs can therefore be collected slightly beyond the normal halo. The marker and halo turn violet during a pickup pulse, with the halo expanding to the unchanged 2.65-unit pulse radius. Halo scale and collision detection share the same radius constants; antenna tips are not the aiming point.
- **Gold records:** 100 base points, 45 per year. Chain pickups for up to a 5x multiplier; missing gold resets the streak. Patterns vary deterministically by year, with an approachable opening.
- **UFO interceptions:** 750 base points, six per year, also multiplied by the streak. Moving saucers cross the corridor; intercept their centers when you pass them. Each catch restores 20% warp charge. Missing a UFO does not reset the streak.
- **Pickup pulse:** press E or the pulse button for 1.8 seconds of wider collection reach; 14-second cooldown. On-screen readiness is shown.
- **Time warp:** hold Space or the touch Warp button. Charge drains while warping and regenerates when not warping.
- **Pause:** P or Pause. Hiding the page, losing browser focus or opening About & science also pauses. **Look around** pauses and lets you drag to orbit the ship; return to Chase view and resume.

The final chapter ends at NASA's announced epoch with a fictional, celebratory light-day gate. Nothing is sent to Voyager. UFOs and pickups are inventions, not evidence of extraterrestrial encounters. Audio is off until enabled; scores stay in your browser when storage is allowed.

## Gameplay audio

Choose **Sound on** to enable playback. **Mix** provides independent **Music** and **Effects** checkboxes; opening it pauses the flight. Close Mix and explicitly resume when ready. Sound starts off on every page load, and mix choices last for the current page session.

The original, quiet 16-second space-music loop stays below the effects. Record chimes rise with the pickup combo; UFO catches have a distinct ascending reward, pickup pulses swell, and time warp has a restrained hum only while boosting. Jupiter, Saturn, heliopause and light-day encounter windows add a musical accent once per year. Each year ends with a short flourish, with a fuller finale in 2026.

Pause, About, Mix, Look around, switching years, losing focus and hiding the page stop the appropriate music and effects without leaving warp humming. Music resumes from its loop position when flight resumes; completed years stop the background loop while the completion flourish finishes. Master mute also suspends the audio context. If audio is blocked or unavailable, an explicit status message appears and the game remains playable.

All audio is synthesized locally with Web Audio, including in the standalone HTML. There are no audio downloads, external music licenses or audio network requests.

## Local preview and standalone HTML

Clone the repository and run from its root:

```sh
git clone https://github.com/devbrat-anand/voyager-1-one-light-day.git
cd voyager-1-one-light-day
npm ci
npm run build
python3 -m http.server 8765 --bind 127.0.0.1
```

Open <http://127.0.0.1:8765/>. A current **WebGL 2** browser is required. Graphics, texture and flight-data failures are shown explicitly rather than substituting a fake route.

Build the offline deliverable:

```sh
python3 scripts/package.py
```

Generated files:

| File in `dist/` | Purpose |
|---|---|
| `Voyager-1-One-Light-Day.html` | Complete, double-clickable game with renderer, textures, styles, data and notices embedded |
| `voyager-one-light-day-site.zip` | Ready-built static hosting files; extract with `index.html` at the hosting root |
| `Google-Sites-embed.html` | Small iframe snippet; replace its placeholder with your public HTTPS game URL |
| `Voyager-Last-Light.html` | Compatibility copy of the same anniversary release, using the earlier filename |
| `voyager-last-light-site.zip` | Compatibility copy of the anniversary hosting ZIP |

The standalone file works offline. There is **no runtime NASA request, CDN, backend, account, API key or analytics**. NASA/JPL data is bundled, not live telemetry. The source checkout needs its generated `game.js`; packaged files need no build tools.

## Google Sites and GitLab Pages

**Google Sites embeds the game; it is not a static-file upload host.** Host the game on an HTTPS static host, then use **Insert → Embed → By URL**. Alternatively, replace the URL in `Google-Sites-embed.html` and paste that small iframe under **Embed code**. Use full width and about 1,000–1,200 px height.

The standalone HTML is several MB. Directly pasting it into Sites' code editor is not verified against Google's size limits or sanitization. Prefer the hosted URL. Local sandboxed-iframe checks are not a claim of a live Google Sites deployment.

To publish on GitLab Pages:

1. Mirror this repository to GitLab, including `.gitlab-ci.yml`, manifests, source modules, assets and data. Exclude `node_modules/`, `dist/`, `public/` and generated `game.js`.
2. Push to its default branch. The included Node 22 pipeline installs pinned dependencies, runs unit tests, builds the game and publishes `public/`.
3. Find the HTTPS URL under **Deploy → Pages**. Permit public access if anonymous Google Sites visitors should play; access controls depend on your GitLab instance.
4. Open that URL and embed it in Google Sites. The host must allow framing; this app adds no frame-blocking headers.

The pipeline uses modern `pages: publish` syntax. Older self-managed GitLab instances may need legacy Pages syntax. Alternatively, extract the hosting ZIP and upload its contents to Netlify Drop or a dedicated GitHub Pages repository.

Packaging does not create a repository, upload files or deploy anything publicly.

## Science and visual honesty

| Element | What is real / simplified |
|---|---|
| Route | Voyager **1** positions and velocities from NASA/JPL Horizons, covering all 50 calendar-year levels. Four roughly twenty-day windows use three-hour samples merged into the coarser baseline. A cumulative-distance lookup gives approximately uniform forward speed within each year. |
| Milestone | [NASA's announcement](https://science.nasa.gov/mission/voyager/where-are-voyager-1-and-voyager-2-now/), not an independently guaranteed live crossing prediction. The final game epoch is exactly `2026-11-18T10:16:07Z`. Countdown uses the device clock. |
| Light-time readout | Full 3D Earth-relative geometric range divided by 299,792.458 km/s, without operational observer or relativistic corrections. It may differ slightly from NASA's estimate. |
| Historical reconstruction | Early Voyager 1 Horizons states are an approximate mission-design reconstruction, not perfect historical navigation telemetry. Interpolation is not suitable for navigation. |
| Coordinates | Heliocentric ecliptic J2000, UTC dates; positions in au, velocities in au/day. Cubic Hermite interpolation uses endpoint velocities. Exact queries and retrieval dates are stored in `data/ephemeris.json`. |
| Spacecraft and planets | Original procedural spacecraft geometry, representative textured planets at interpolated JPL positions, transparent Saturn rings. Radii, spacecraft scale and time are exaggerated. Sideways steering does not alter the underlying route. |
| Planetary moons | Six real moons use hourly parent-relative ecliptic J2000 states in `data/moons.json`, covering 23 February–15 March 1979 and 2–22 November 1980, not the entire yearly level. Hermite interpolation preserves their historical orbital directions. Orbital separations are logarithmically compressed, sizes enlarged and surfaces illustrated, not photographic. Moons are hidden outside their sample coverage. |
| Meteoroids | Deterministic decorative rocks pass outside the steering corridor. No collisions or score changes. Their locations and abundance are fictional, with no burning trails in vacuum. |
| Sky names | Approximate J2000 RA/Dec for Vega, Altair, Deneb, Antares, Polaris and the Galactic Center, transformed into ecliptic directions. Distant directional references, not close destinations. No proper-motion or parallax model. Reference: [SIMBAD](https://simbad.cds.unistra.fr/simbad/). |
| Background | Milky Way artwork is not registered to the named directions. Extra stars and colored haze are illustrative. No bright nebula or physical light-day wall is claimed near Voyager. |
| Interstellar chapter | Voyager 1 crossed the heliopause on 25 August 2012. This does not mean it left the entire solar system or Oort Cloud; the heliopause is not a fixed spherical shell. |
| Game elements | Gold, UFOs, points, pulse fields, steering and warp are fictional. No live camera feed or alien detection is implied. |

The data archive retains Earth, all four giant planets and both Voyager datasets; **only Voyager 1 supplies playable routes**. Retained pure helpers for earlier training scenarios are not exposed as UI tabs. Retrieval timestamps remain in the data archive for provenance, not as dates displayed in About.

Textures: **Solar System Scope, CC BY 4.0**, based on NASA imagery with enhancements and gap filling; not live imagery. Three.js: MIT. Full attribution is in `THIRD-PARTY-NOTICES.md`, the hosting ZIP and a comment in the standalone HTML. This is an independent tribute, not NASA software or an endorsement.

## Refresh trajectory data

```sh
python3 scripts/refresh-data.py
python3 scripts/refresh-encounters.py
python3 scripts/refresh-moons.py
python3 scripts/package.py
```

Run the trajectory refresh scripts in order: baseline first, dense **Voyager 1** chapters second. The independent moon script refreshes all six satellite datasets. Python standard library only; requests are sequential per JPL guidance, with no API key. Each script replaces its data bundle only after its complete download succeeds. Redeploy after refreshing.

## Verify

```sh
npm test
# After packaging, with the local server running:
python3 tests/browser.py
python3 tests/voyage-browser.py
python3 tests/campaign-browser.py
python3 tests/audio-browser.py
```

Unit coverage includes all 50 ordered, contiguous real 3D V1 routes, approved durations and exact total playtime, every year's completion, deterministic annual pickup variation, pause-safe countdowns with no final wrap, independent JPL reference vectors, light-time, the exact milestone epoch, steering limits, swept gold/UFO crossings, larger UFO rewards, streaks, warp refill, pulse duration/cooldown and sky-coordinate conversion. Historical engine-helper tests are retained.

Scenery checks validate six JPL query targets and parent centers, hourly coverage, physically plausible satellite orbital ranges, display-direction preservation, date-dependent motion and non-extrapolation. Browser layout checks measure actual canvas coverage and control visibility on desktop, small phones and landscape screens, not just the absence of horizontal overflow.

Browser suites require Python Playwright and Chromium. The flight and release suites exercise real WebGL 2, actual keyboard/touch input, UFO collection, pulse, warp, pause, yearly persistence, encounter-window moons, iframe play and a complete unmodified real-time light-day run that stops at the finale. The campaign suite plays consecutive quiet years in real time, checks score carry, countdown pause/resume, automatic launches, and cancellation by selection or replay. They also cover missing/invalid data, blocked storage, no-WebGL failure, reduced motion and `file://` offline HTML. Those flight and campaign runs use no injected game state or fast-forwarded progress.

Screenshots default to `/tmp/voyager-lightday` and `/tmp/voyager-3d`. Override `VOYAGER_ARTIFACTS` or `VOYAGER_URL` as needed. These checks do not authenticate to or publish on Google Sites or GitLab.

The audio suite renders the real synthesizer through `OfflineAudioContext` and checks PCM output for default silence, independent mixing, rising combo pitch, distinct effects, a seamless loop, bounded levels and pause/disposal silence. It also exercises the actual game controls, record/UFO catches, warp, repeated pause/resume, small-screen layout, explicit audio failure and offline playback using a real browser audio context. Its completion, automatic-next-year and one-shot milestone checks advance the browser's animation clock through the real game loop without replacing game state.
