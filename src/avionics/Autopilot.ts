/** Route-following lateral autopilot — banks toward the nav course. */

export interface AutopilotInput {
  enabled: boolean;
  /** Desired heading from route (deg true), or null if no route. */
  courseDeg: number | null;
  headingDeg: number;
  rollDeg: number;
  pitchDeg: number;
  onGround: boolean;
  /** AGL metres */
  aglM: number;
  /** Manual roll keys held — disconnect AP. */
  manualRoll: boolean;
  dt: number;
}

export interface AutopilotOutput {
  /** Whether AP is still armed after this step. */
  enabled: boolean;
  /** Aileron command −1…1 (same sign as keyboard: + = roll left). */
  aileron: number | null;
  /** Elevator command −1…1 when pitch hold is active (same sign: − = pitch up). */
  elevator: number | null;
  reason: 'ok' | 'no-route' | 'ground' | 'manual' | 'off';
}

const MAX_BANK_DEG = 25;
/** Disengage when too close to the ground. */
const MIN_AGL_M = 12;
const BANK_KP = 0.055;
const HEADING_TO_BANK = 1.15;
const PITCH_HOLD_KP = 0.045;

export function headingErrorDeg(fromDeg: number, toDeg: number): number {
  let err = toDeg - fromDeg;
  while (err > 180) err -= 360;
  while (err < -180) err += 360;
  return err;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export class Autopilot {
  private enabled = false;
  /** Pitch captured when AP engaged (deg, nose-up positive). */
  private holdPitchDeg = 0;

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Toggle; returns new state. Refuses to arm when `canArm` is false. */
  toggle(canArm: boolean, pitchDeg: number): boolean {
    if (this.enabled) {
      this.enabled = false;
      return false;
    }
    if (!canArm) return false;
    this.enabled = true;
    this.holdPitchDeg = pitchDeg;
    return true;
  }

  setEnabled(on: boolean, pitchDeg = 0): void {
    this.enabled = on;
    if (on) this.holdPitchDeg = pitchDeg;
  }

  update(input: AutopilotInput): AutopilotOutput {
    if (!this.enabled) {
      return { enabled: false, aileron: null, elevator: null, reason: 'off' };
    }

    if (input.manualRoll) {
      this.enabled = false;
      return { enabled: false, aileron: null, elevator: null, reason: 'manual' };
    }

    if (input.onGround || input.aglM < MIN_AGL_M) {
      this.enabled = false;
      return { enabled: false, aileron: null, elevator: null, reason: 'ground' };
    }

    if (input.courseDeg == null || !Number.isFinite(input.courseDeg)) {
      this.enabled = false;
      return { enabled: false, aileron: null, elevator: null, reason: 'no-route' };
    }

    const hdgErr = headingErrorDeg(input.headingDeg, input.courseDeg);
    // Need left (neg hdgErr) → positive bank (left wing down) → +aileron.
    let targetBank = clamp(-hdgErr * HEADING_TO_BANK, -MAX_BANK_DEG, MAX_BANK_DEG);
    if (Math.abs(hdgErr) < 1.5) targetBank *= Math.abs(hdgErr) / 1.5;

    const aileron = clamp((targetBank - input.rollDeg) * BANK_KP, -0.85, 0.85);

    const pitchErr = this.holdPitchDeg - input.pitchDeg;
    const elevator = clamp(-pitchErr * PITCH_HOLD_KP, -0.55, 0.55);

    void input.dt;
    return { enabled: true, aileron, elevator, reason: 'ok' };
  }
}
