import type { FlightTelemetry } from '../aircraft/types.ts';
import type { CameraMode } from '../rendering/CameraRig.ts';
import {
  drawAttitude,
  drawFlightWarnings,
  drawGauge,
  drawStatusBar,
  drawTape,
} from './instruments.ts';

export class InstrumentPanel {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'hud-canvas';
    this.ctx = this.canvas.getContext('2d')!;
    container.appendChild(this.canvas);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    const dpr = window.devicePixelRatio;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(
    telemetry: FlightTelemetry,
    cameraMode: CameraMode,
    courseDeg: number | null = null,
  ): void {
    const ctx = this.ctx;
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);

    drawStatusBar(ctx, telemetry, w);

    drawFlightWarnings(ctx, telemetry, w, h);

    if (cameraMode === 'cockpit') {
      drawAttitude(ctx, w / 2, h / 2, 90, telemetry.pitchDeg, telemetry.rollDeg);
    }

    drawTape(ctx, 80, h / 2, 56, 180, 'IAS', telemetry.airspeedKts, 10, (v) =>
      String(Math.round(v)),
    );
    drawTape(ctx, w - 80, h / 2, 56, 180, 'AGL', telemetry.altitudeFt, 100, (v) =>
      String(Math.round(v)),
    );

    drawGauge(
      ctx,
      w / 2,
      h - 70,
      42,
      'HDG',
      `${Math.round(telemetry.headingDeg).toString().padStart(3, '0')}°`,
      telemetry.headingDeg / 360,
      courseDeg != null ? courseDeg / 360 : null,
    );

    drawGauge(
      ctx,
      w / 2 + 110,
      h - 70,
      38,
      'VSI',
      `${Math.round(telemetry.verticalSpeedFpm)}`,
      Math.max(0, Math.min(1, telemetry.verticalSpeedFpm / 2000 + 0.5)),
    );

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(w - 140, 32, 128, 22);
    ctx.fillStyle = '#c8d8f0';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'right';
    ctx.fillText(`CAM ${cameraMode.toUpperCase()}`, w - 16, 48);
  }
}
