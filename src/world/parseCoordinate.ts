/**
 * Parse latitude or longitude from decimal or DMS strings.
 * Examples: -33.8688, 33°15'20.6"S, 151°25'54.6"E, 33 15 20.6 S
 */
export function parseCoordinate(raw: string, kind: 'lat' | 'lon'): number | null {
  const text = raw.trim();
  if (!text) return null;

  // Plain decimal (including leading minus)
  if (/^-?\d+(\.\d+)?$/.test(text)) {
    return parseFloat(text);
  }

  const normalized = text
    .replace(/[º°˚]/g, '°')
    .replace(/['′’]/g, "'")
    .replace(/["″""]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

  const hemMatch = normalized.match(/\s*([NSEW])\s*$/i);
  const hem = hemMatch?.[1]?.toUpperCase() as 'N' | 'S' | 'E' | 'W' | undefined;
  const core = hemMatch ? normalized.slice(0, hemMatch.index).trim() : normalized;

  let deg = 0;
  let min = 0;
  let sec = 0;

  const dms =
    core.match(/^(-?\d+(?:\.\d+)?)\s*°\s*(\d+(?:\.\d+)?)?\s*'?\s*(\d+(?:\.\d+)?)?\s*"?\s*$/i) ??
    core.match(/^(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*$/);

  if (dms) {
    deg = Math.abs(parseFloat(dms[1]));
    min = dms[2] ? parseFloat(dms[2]) : 0;
    sec = dms[3] ? parseFloat(dms[3]) : 0;
  } else {
    const dm = core.match(/^(-?\d+(?:\.\d+)?)\s*°\s*(\d+(?:\.\d+)?)\s*'?$/i);
    if (dm) {
      deg = Math.abs(parseFloat(dm[1]));
      min = parseFloat(dm[2]);
    } else {
      return null;
    }
  }

  if (min >= 60 || sec >= 60) return null;

  let value = deg + min / 60 + sec / 3600;
  if (hem === 'S' || hem === 'W') value = -value;
  else if (core.startsWith('-')) value = -value;

  const limit = kind === 'lat' ? 90 : 180;
  if (!Number.isFinite(value) || Math.abs(value) > limit) return null;
  return value;
}
