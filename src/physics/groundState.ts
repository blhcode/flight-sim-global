/** ~38 kt — pitch locked on ground below this; allowed above on takeoff roll */
export const TAXI_PITCH_LOCK_KTS = 38;
export const TAXI_PITCH_LOCK_MS = TAXI_PITCH_LOCK_KTS / 1.94384;

/** Gear on pavement: very low AGL and not climbing/dropping fast */
export const WEIGHT_ON_WHEELS_AGL_M = 0.12;
export const WEIGHT_ON_WHEELS_VS_MS = 1.2;

export function weightOnWheels(aglM: number, verticalSpeedMs: number): boolean {
  return (
    aglM < WEIGHT_ON_WHEELS_AGL_M &&
    Math.abs(verticalSpeedMs) < WEIGHT_ON_WHEELS_VS_MS
  );
}

export function pitchLockedOnGround(aglM: number, verticalSpeedMs: number, iasKts: number): boolean {
  return weightOnWheels(aglM, verticalSpeedMs) && iasKts < TAXI_PITCH_LOCK_KTS;
}
