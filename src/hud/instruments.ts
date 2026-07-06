import type { FlightTelemetry } from '../aircraft/types.ts';

export function drawAttitude(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  pitchDeg: number,
  rollDeg: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((-rollDeg * Math.PI) / 180);

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();

  const pitchPx = (pitchDeg / 60) * r;
  ctx.fillStyle = 'rgba(90, 140, 210, 0.9)';
  ctx.fillRect(-r * 2, pitchPx, r * 4, r * 2);
  ctx.fillStyle = 'rgba(120, 90, 50, 0.9)';
  ctx.fillRect(-r * 2, pitchPx - r * 4, r * 4, r * 4);

  ctx.strokeStyle = '#f0f4ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r * 0.6, 0);
  ctx.lineTo(r * 0.6, 0);
  ctx.moveTo(0, -8);
  ctx.lineTo(0, 8);
  ctx.stroke();

  ctx.restore();

  ctx.strokeStyle = 'rgba(180, 200, 230, 0.75)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

export function drawGauge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  label: string,
  value: string,
  needleNorm: number,
): void {
  ctx.fillStyle = 'rgba(10, 16, 28, 0.82)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(180, 200, 230, 0.6)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const start = Math.PI * 0.75;
  const end = Math.PI * 2.25;
  const angle = start + (end - start) * needleNorm;
  ctx.strokeStyle = '#ff6b4a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(angle) * (r - 8), y + Math.sin(angle) * (r - 8));
  ctx.stroke();

  ctx.fillStyle = '#dce8f8';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, x, y + r + 14);
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText(value, x, y + 5);
}

export function drawTape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: number,
  step: number,
  format: (v: number) => string,
): void {
  ctx.fillStyle = 'rgba(10, 16, 28, 0.82)';
  ctx.fillRect(x - w / 2, y - h / 2, w, h);
  ctx.strokeStyle = 'rgba(180, 200, 230, 0.5)';
  ctx.strokeRect(x - w / 2, y - h / 2, w, h);

  ctx.fillStyle = '#dce8f8';
  ctx.font = '10px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(label, x, y - h / 2 + 12);

  const center = Math.round(value / step) * step;
  for (let v = center - step * 4; v <= center + step * 4; v += step) {
    const dy = ((v - value) / step) * 14;
    if (Math.abs(dy) > h / 2 - 8) continue;
    ctx.fillStyle = v === center ? '#ff6b4a' : '#9ab0cc';
    ctx.font = v === center ? 'bold 12px system-ui' : '10px system-ui';
    ctx.fillText(format(v), x, y + dy);
  }
}

export function drawStatusBar(ctx: CanvasRenderingContext2D, t: FlightTelemetry, w: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, w, 28);
  ctx.fillStyle = '#e8f0ff';
  ctx.font = '12px system-ui';
  ctx.textAlign = 'left';
  const gear = t.gearDown ? 'DN' : 'UP';
  const flaps = t.flaps > 0 ? 'FULL' : 'UP';
  ctx.fillText(
    `THR ${(t.throttle * 100).toFixed(0)}%  IAS ${t.airspeedKts.toFixed(0)}kt  FLAPS ${flaps}  GEAR ${gear}  ${t.onGround ? 'GND' : 'AIR'}  α ${t.alphaDeg.toFixed(0)}°`,
    12,
    18,
  );
}

export function drawFlightWarnings(
  ctx: CanvasRenderingContext2D,
  t: FlightTelemetry,
  w: number,
  h: number,
): void {
  if (t.isStalled) {
    ctx.fillStyle = 'rgba(180, 20, 30, 0.85)';
    ctx.fillRect(w / 2 - 90, h / 2 - 22, 180, 44);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('STALL', w / 2, h / 2 + 8);
    return;
  }
  if (t.stallWarning) {
    ctx.fillStyle = 'rgba(220, 120, 20, 0.9)';
    ctx.font = 'bold 16px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('STALL WARNING', w / 2, 52);
  } else if (t.highAlphaWarning) {
    ctx.fillStyle = 'rgba(220, 180, 40, 0.95)';
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('HIGH AOA', w / 2, 52);
  }
}
