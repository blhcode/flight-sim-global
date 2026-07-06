import type { AircraftDefinition } from './types.ts';
import { cessna172Definition } from './definitions/cessna172.ts';

const registry = new Map<string, AircraftDefinition>([
  [cessna172Definition.id, cessna172Definition],
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
