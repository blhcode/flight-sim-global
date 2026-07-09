import type { AircraftDefinition } from './types.ts';
import { cessna172Definition } from './definitions/cessna172.ts';
import { twinOtterDefinition } from './definitions/twinOtter.ts';
import { dash8400Definition } from './definitions/dash8400.ts';
import { b737Definition } from './definitions/b737.ts';
import { b747Definition } from './definitions/b747.ts';

const registry = new Map<string, AircraftDefinition>([
  [cessna172Definition.id, cessna172Definition],
  [twinOtterDefinition.id, twinOtterDefinition],
  [dash8400Definition.id, dash8400Definition],
  [b737Definition.id, b737Definition],
  [b747Definition.id, b747Definition],
]);

export function getAircraftDefinition(id: string): AircraftDefinition {
  const def = registry.get(id);
  if (!def) throw new Error(`Unknown aircraft: ${id}`);
  return def;
}

export function listAircraft(): AircraftDefinition[] {
  return [...registry.values()];
}

export function registerAircraft(def: AircraftDefinition): void {
  registry.set(def.id, def);
}
