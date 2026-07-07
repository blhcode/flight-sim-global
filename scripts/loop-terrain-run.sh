#!/usr/bin/env bash
# Self-paced terrain fix loop — wakes agent on failure.
set -euo pipefail
cd "$(dirname "$0")/.."
if node scripts/loop-terrain-check.mjs; then
  echo 'AGENT_LOOP_WAKE_terrain {"pass":true,"prompt":"Terrain loop check passed (YSSY + DMS outside cam). Quick visual sanity only if needed; otherwise report stable."}'
else
  echo 'AGENT_LOOP_WAKE_terrain {"pass":false,"prompt":"Terrain loop check FAILED. Run node scripts/loop-terrain-check.mjs, inspect /tmp/flightsim-loop-*.png, read console errors, apply minimal fix to src/world/TerrainManager.ts or configureTileRendering.ts, re-run until pass."}'
fi
