# Pussyphus stage

The playable stage: Bo on the escalator in the glazed atrium, drawn in Desktop Bo's grammar (color ramps, Bayer 4×4 dither, one light from the upper right), with a WebGL2 pass for the air.

This branch (`stage`) is where the stage lives. Pages serves `main`, so nothing here is published until it is merged.

## Run it

1. Vendor the Desktop Bo engine. It lives in the private repo `jalulia/bo` and stays out of this public one:
   `sh stage/tools/vendor-bzlite.sh /path/to/bo`
2. Serve the folder and open it:
   `cd stage && python3 -m http.server 8733`, then `http://localhost:8733/index.html`

URL parameters: `hour` (0 to 24), `weather` (`clear`, `fair`, `overcast`, `rain`, `snow`, `mist`), `post=0` (no atmosphere pass), `lens`, `run=0` (paused, for captures), and `camx`, `camy`, `camz`, `yaw`, `pitch`, `f`, `cy` (camera).

## Who owns what

| Path | Owner |
|---|---|
| `src/shared.js`, `src/stage.js`, `src/app.js`, `bo/`, `index.html`, `qa/` | Stage (engine, geometry, Bo's motion, NPC movement, integration, QA, publishing) |
| `sky/`, `src/post.js` parameters, `docs/atmosphere-spec_V0N.json`, color ramps | Art (look, light, sky, materials, NPC character builds) |
| `sound/` | Sound and music |

Departments deliver versioned files (`_V0N`) and a changelog. The stage integrates, renders and publishes.

## Rules

- A new version is a new file. Never overwrite, never delete. Cleanup means moving files to a dated `_quarantine/` folder with a MANIFEST.
- No oxblood anywhere (OKLCH L 0.18 to 0.46, C 0.07 and up, hue 8 to 34). The final shader also guards against it. Check with `python3 qa/oxscan.py <renders>`.
- US English.

## Checks

- `node qa/stills.js <out> clear:10.5 fair:14 clear:22`: stills after 6 s of play. Set `PORT` and `EXTRA` (extra URL parameters) as needed.
- `node qa/census.js 600`: Bo's behavior census (moments, feet off frame).
- `python3 qa/oxscan.py <dir>/*.png`: pixels in the banned band.
- Sound: `sound/tools/render.js` (offline render) and `sound/tools/analyze.py` (BS.1770 loudness).
