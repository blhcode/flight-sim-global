import type { InputManager } from './InputManager.ts';
import type { AircraftInstance } from '../aircraft/AircraftInstance.ts';
import {
  pitchLockedOnGround,
  TAXI_PITCH_LOCK_KTS,
  weightOnWheels,
} from '../physics/groundState.ts';

const MS_TO_KTS = 1.94384;

export class FlightControls {
  private readonly input: InputManager;
  private readonly aircraft: AircraftInstance;
  private readonly onCameraCycle: () => void;
  private readonly onTextureCycle: () => void;
  /** When true, skip keyboard pitch/roll so AP can drive those axes. */
  autopilotAxes = false;

  constructor(
    input: InputManager,
    aircraft: AircraftInstance,
    onCameraCycle: () => void,
    onTextureCycle: () => void,
  ) {
    this.input = input;
    this.aircraft = aircraft;
    this.onCameraCycle = onCameraCycle;
    this.onTextureCycle = onTextureCycle;
  }

  update(dt: number): void {
    const c = this.aircraft.controls;
    const apAxes = this.autopilotAxes;
    const agl = this.aircraft.body?.aglM ?? 0;
    const vs = this.aircraft.body?.verticalSpeed ?? 0;
    const kts = (this.aircraft.body?.indicatedAirspeed ?? 0) * MS_TO_KTS;
    const pitchLocked = pitchLockedOnGround(agl, vs, kts);
    const onTakeoffRoll = weightOnWheels(agl, vs) && kts >= TAXI_PITCH_LOCK_KTS;
    const onFinal = !pitchLocked && agl < 20 && kts > 38 && kts < 85;
    const onLowAlt = !weightOnWheels(agl, vs) && agl < 50;

    const pitchUp = !apAxes && this.input.isDown('KeyW');
    const pitchDown = !apAxes && this.input.isDown('KeyS');

    if (pitchLocked) {
      c.elevator *= 0.5;
    } else if (!apAxes) {
      let rate = 0.34 * dt;
      if (onFinal && pitchUp) rate = 2.6 * dt;
      else if (onFinal) rate = 1.3 * dt;
      else if ((onTakeoffRoll || onLowAlt) && pitchUp) rate = 0.44 * dt;
      else if (onTakeoffRoll || onLowAlt) rate = 0.38 * dt;

      if (pitchUp) {
        c.elevator = Math.max(-1, c.elevator - rate);
        if (onFinal && c.elevator > -0.3) {
          c.elevator = Math.min(c.elevator, -0.3);
        }
      } else if (pitchDown) c.elevator = Math.min(1, c.elevator + rate);
      else c.elevator *= onFinal ? 0.9 : 0.85;
    }

    const rollRate = pitchLocked ? 0.95 * dt : onFinal ? 4 * dt : 0.95 * dt;
    const rollLeft = !apAxes && this.input.isDown('KeyA');
    const rollRight = !apAxes && this.input.isDown('KeyD');

    if (!apAxes) {
      if (rollLeft) c.aileron = Math.min(1, c.aileron + rollRate);
      else if (rollRight) c.aileron = Math.max(-1, c.aileron - rollRate);
      else c.aileron *= 0.72;
    }

    if (this.input.isDown('KeyQ')) c.rudder = Math.min(1, c.rudder + rollRate);
    else if (this.input.isDown('KeyE')) c.rudder = Math.max(-1, c.rudder - rollRate);
    else c.rudder *= 0.72;

    const throttleUp = this.input.isDown('ArrowUp');
    const throttleDown = this.input.isDown('ArrowDown');

    if (throttleUp) c.throttle = Math.min(1, c.throttle + 0.14 * dt);
    if (throttleDown) c.throttle = Math.max(0, c.throttle - 0.14 * dt);

    c.brakes = this.input.isDown('KeyB') ? 1 : 0;

    if (this.input.wasPressed('KeyF')) {
      this.aircraft.flapsDeployed = !this.aircraft.flapsDeployed;
    }
    if (this.input.wasPressed('KeyG')) {
      this.aircraft.gearDown = !this.aircraft.gearDown;
      this.aircraft.controls.gearDown = this.aircraft.gearDown;
    }
    if (this.input.wasPressed('KeyC')) {
      this.onCameraCycle();
    }
    if (this.input.wasPressed('KeyT')) {
      this.onTextureCycle();
    }
  }
}
