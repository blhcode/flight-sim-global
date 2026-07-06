# Flight Sim Global

Browser-based global flight simulator with real-world satellite terrain, Cessna 172SP flight physics, and instrument HUD.

## Quick start

```bash
npm install
npm run build:airports   # optional — regenerates airport database
npm run dev
```

Open the URL shown in the terminal (default `http://localhost:5173`). Enter an airport code (e.g. `YSSY`), click **Load terrain & fly**, then use the keyboard controls below.

**Live demo:** [blhcode.github.io/flight-sim-global](https://blhcode.github.io/flight-sim-global/)

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
| C | Cycle camera (cockpit → gear → outside) |
| T | Cycle terrain texture (satellite / roadmap) |

Click the 3D view after loading to focus keyboard controls.

## Deploy (GitHub Pages)

Pushes to `main` build and deploy automatically via GitHub Actions. The repo contains **source only** (`src/`, `public/`, etc.) — not `dist/` or `node_modules/`.

## Architecture

- **Vite + TypeScript** frontend
- **Three.js** rendering with PBR tone mapping and sky atmosphere
- **three-tile** global terrain (ArcGIS elevation + imagery)
- **6DOF rigid-body physics** at 120 Hz with RK4 integration
- **Extensible aircraft registry** — v1 ships Cessna 172; add definitions in `src/aircraft/definitions/`

## Aircraft model

The [Cessna 172SP (NLM, Sketchfab)](https://sketchfab.com/3d-models/free-cessna-172sp-c9cadc2f026946da8cf9715a683739e9) is included at `public/models/cessna-172sp/scene.glb`. If that file is missing, a procedural Cessna 172 is used automatically.

## Build for production

```bash
npm run build
npm run preview
```

## Credits

See [CREDITS.md](CREDITS.md) for data sources and attributions.
