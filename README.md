# Flight Sim Global

Fly anywhere on Earth in your browser — real satellite terrain, multiple aircraft, and a simple navigation map for planning routes.

**[Play now → blhcode.github.io/flight-sim-global](https://blhcode.github.io/flight-sim-global/)**

## Features

- **Global terrain** — ArcGIS elevation and satellite imagery streamed via [three-tile](https://github.com/sxguojf/three-tile)
- **Five flyable aircraft** — Cessna 172SP, DHC-6 Twin Otter, Dash 8 Q400, Boeing 737-800, Boeing 747-400
- **Real 3D models** — GLB aircraft with procedural fallbacks if a model fails to load
- **Flight physics** — 120 Hz simulation with stall warnings, flares, coordinated turns, and weight-aware braking
- **Navigation map** — Press **M** to see your position, nearby airports, and click to build a route
- **7,600+ airports** — Spawn by ICAO/IATA code (e.g. `YSSY`, `TNCS`) or lat/lon

## Quick start

```bash
git clone https://github.com/blhcode/flight-sim-global.git
cd flight-sim-global
npm install
npm run dev
```

Open **http://localhost:5173**, pick an aircraft and airport, then click **Load terrain & fly**.

## Controls

| Key | Action |
|-----|--------|
| W / S | Pitch up / down |
| A / D | Roll left / right |
| Q / E | Yaw left / right |
| ↑ / ↓ | Throttle up / down |
| F | Toggle flaps |
| G | Toggle gear |
| B | Wheel brakes (hold) |
| C | Cycle camera (cockpit → gear → outside → chase) |
| T | Cycle terrain texture (satellite / roadmap) |
| M | Toggle navigation map |

Click the 3D view after loading so keyboard input is focused.

### Twin Otter weight

When the **DHC-6 Twin Otter** is selected, a **Weight** option appears on the spawn screen:

- **Standard** — typical commuter load
- **STOL** — lighter weight for short runways (e.g. Saba TNCS); auto-selected when spawning at `TNCS` / `SAB`

### Navigation map

1. Press **M** in flight
2. Your position is the green arrow; yellow dots are airports
3. Type **Departure** and **Destination** (ICAO/IATA/name), then **Set route** — or click airports on the map
4. Long-haul routes draw as curved great-circle paths; a pink course bug on the HDG gauge shows the heading to fly
5. Drag to pan, scroll or **+/−** to zoom, **Clear route** to reset

The spawn screen also shows each aircraft’s approximate **rotate / liftoff** speed.

## Aircraft

| Aircraft | Type | Notes |
|----------|------|--------|
| Cessna 172SP | Prop | Light trainer |
| DHC-6 Twin Otter | Turboprop | Standard / STOL weight profiles |
| Dash 8 Q400 | Turboprop | Regional turboprop |
| Boeing 737-800 | Jet | Narrow-body airliner |
| Boeing 747-400 | Jet | Heavy wide-body; realistic long takeoff roll |

Model sources and licenses are listed in [CREDITS.md](CREDITS.md).

## Deploy

Pushes to `main` can deploy to GitHub Pages if you install the workflow from [`docs/deploy-workflow.yml`](docs/deploy-workflow.yml) into `.github/workflows/deploy.yml` (requires `workflow` OAuth scope when pushing via HTTPS).

Manual deploy:

```bash
npm run build
npm run preview   # test production build locally
```

## Development

```bash
npm run build:airports   # regenerate airport database from OpenFlights
npm run build            # production build
```

Optional browser checks (requires Playwright): `npm run check:brakes`, `check:map`, `check:physics`, etc.

## Tech stack

- **Vite + TypeScript**
- **Three.js** — rendering, atmosphere, PBR
- **three-tile** — global DEM + imagery tiles
- Custom flight model — per-aircraft mass, thrust, V-speeds, and aero tables

## Credits

Terrain, imagery, airport data, aircraft models, and libraries — see [CREDITS.md](CREDITS.md).

## License

Source code in this repository is provided as-is for personal and educational use. Third-party assets (aircraft models, terrain services) remain under their respective licenses listed in CREDITS.md.
