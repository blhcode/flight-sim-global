import airports from '../data/airports.json';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface GeoPoint {
  lat: number;
  lon: number;
  label?: string;
}

interface AirportRecord {
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  elevM: number;
}

const airportList = airports as AirportRecord[];

export class NavigationMap {
  readonly element: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly routeList: HTMLElement;
  private readonly hintEl: HTMLElement;
  private visible = false;
  private zoomDeg = 1.4;
  private readonly route: GeoPoint[] = [];
  private player: GeoPoint & { headingDeg: number } = { lat: 0, lon: 0, headingDeg: 0 };
  private onRouteChange: ((route: GeoPoint[]) => void) | null = null;

  constructor(container: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'nav-map hidden';
    this.element.innerHTML = `
      <div class="nav-map-header">
        <span>Map</span>
        <button type="button" class="nav-map-close" title="Close (M)">×</button>
      </div>
      <canvas class="nav-map-canvas" width="360" height="280"></canvas>
      <div class="nav-map-toolbar">
        <button type="button" data-action="zoom-in">+</button>
        <button type="button" data-action="zoom-out">−</button>
        <button type="button" data-action="clear-route">Clear route</button>
      </div>
      <p class="nav-map-hint"></p>
      <ol class="nav-map-route"></ol>
    `;
    container.appendChild(this.element);

    this.canvas = this.element.querySelector('.nav-map-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.routeList = this.element.querySelector('.nav-map-route') as HTMLElement;
    this.hintEl = this.element.querySelector('.nav-map-hint') as HTMLElement;
    this.hintEl.textContent =
      'Click map to add waypoint · Click airport to add · Scroll to zoom · M to close';

    this.element.querySelector('.nav-map-close')?.addEventListener('click', () => this.hide());
    this.element.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = (btn as HTMLElement).dataset.action;
        if (action === 'zoom-in') this.zoomDeg = Math.max(0.25, this.zoomDeg * 0.72);
        if (action === 'zoom-out') this.zoomDeg = Math.min(12, this.zoomDeg / 0.72);
        if (action === 'clear-route') this.clearRoute();
        this.draw();
      });
    });

    this.canvas.addEventListener('click', (e) => this.onMapClick(e));
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.12 : 0.88;
      this.zoomDeg = clamp(this.zoomDeg * factor, 0.25, 12);
      this.draw();
    }, { passive: false });
  }

  setOnRouteChange(cb: (route: GeoPoint[]) => void): void {
    this.onRouteChange = cb;
  }

  show(): void {
    this.visible = true;
    this.element.classList.remove('hidden');
    this.draw();
  }

  hide(): void {
    this.visible = false;
    this.element.classList.add('hidden');
  }

  toggle(): boolean {
    if (this.visible) this.hide();
    else this.show();
    return this.visible;
  }

  isVisible(): boolean {
    return this.visible;
  }

  updatePlayer(lat: number, lon: number, headingDeg: number): void {
    this.player = { lat, lon, headingDeg };
    if (this.visible) this.draw();
  }

  getRoute(): readonly GeoPoint[] {
    return this.route;
  }

  clearRoute(): void {
    this.route.length = 0;
    this.syncRouteList();
    this.onRouteChange?.(this.route);
    this.draw();
  }

  private syncRouteList(): void {
    this.routeList.innerHTML = this.route
      .map(
        (p, i) =>
          `<li>${i + 1}. ${p.label ?? `${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}`}</li>`,
      )
      .join('');
  }

  private onMapClick(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * this.canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * this.canvas.height;
    const hit = this.hitTestAirport(x, y);
    if (hit) {
      this.addWaypoint({
        lat: hit.lat,
        lon: hit.lon,
        label: hit.icao || hit.iata || hit.name.slice(0, 24),
      });
      return;
    }
    const geo = this.screenToGeo(x, y);
    this.addWaypoint(geo);
  }

  private addWaypoint(point: GeoPoint): void {
    this.route.push(point);
    this.syncRouteList();
    this.onRouteChange?.(this.route);
    this.draw();
  }

  private airportsInView(): AirportRecord[] {
    const latSpan = this.zoomDeg;
    const lonSpan = this.zoomDeg * Math.max(0.4, Math.cos((this.player.lat * Math.PI) / 180));
    return airportList.filter((a) => {
      if (!a.icao && !a.iata) return false;
      if (a.name.startsWith('(Duplicate)') || a.name.startsWith('[Duplicate]')) return false;
      return (
        Math.abs(a.lat - this.player.lat) < latSpan &&
        Math.abs(a.lon - this.player.lon) < lonSpan
      );
    });
  }

  private geoToScreen(lat: number, lon: number): { x: number; y: number } {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const lonSpan = this.zoomDeg * Math.max(0.4, Math.cos((this.player.lat * Math.PI) / 180));
    const dx = (lon - this.player.lon) / lonSpan;
    const dy = (this.player.lat - lat) / this.zoomDeg;
    return { x: w * 0.5 + dx * w * 0.48, y: h * 0.5 + dy * h * 0.48 };
  }

  private screenToGeo(x: number, y: number): GeoPoint {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const lonSpan = this.zoomDeg * Math.max(0.4, Math.cos((this.player.lat * Math.PI) / 180));
    const dx = (x - w * 0.5) / (w * 0.48);
    const dy = (y - h * 0.5) / (h * 0.48);
    return {
      lat: this.player.lat - dy * this.zoomDeg,
      lon: this.player.lon + dx * lonSpan,
    };
  }

  private hitTestAirport(x: number, y: number): AirportRecord | null {
    let best: AirportRecord | null = null;
    let bestD = 14;
    for (const ap of this.airportsInView()) {
      const p = this.geoToScreen(ap.lat, ap.lon);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) {
        bestD = d;
        best = ap;
      }
    }
    return best;
  }

  private draw(): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.fillStyle = '#0c1420';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(80, 120, 180, 0.2)';
    ctx.lineWidth = 1;
    const center = this.geoToScreen(this.player.lat, this.player.lon);
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(0, center.y + (i * h * 0.48) / 3);
      ctx.lineTo(w, center.y + (i * h * 0.48) / 3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(center.x + (i * w * 0.48) / 3, 0);
      ctx.lineTo(center.x + (i * w * 0.48) / 3, h);
      ctx.stroke();
    }

    if (this.route.length > 0) {
      ctx.strokeStyle = '#5ab0ff';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      const start = this.geoToScreen(this.player.lat, this.player.lon);
      ctx.moveTo(start.x, start.y);
      for (const wp of this.route) {
        const p = this.geoToScreen(wp.lat, wp.lon);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#5ab0ff';
      for (const wp of this.route) {
        const p = this.geoToScreen(wp.lat, wp.lon);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const showLabels = this.zoomDeg < 2.5;
    for (const ap of this.airportsInView()) {
      const p = this.geoToScreen(ap.lat, ap.lon);
      if (p.x < -8 || p.x > w + 8 || p.y < -8 || p.y > h + 8) continue;
      ctx.fillStyle = '#f0c060';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
      if (showLabels && (ap.icao || ap.iata)) {
        ctx.fillStyle = 'rgba(220, 230, 245, 0.85)';
        ctx.font = '9px system-ui';
        ctx.textAlign = 'left';
        ctx.fillText(ap.icao || ap.iata, p.x + 5, p.y + 3);
      }
    }

    const nose = (this.player.headingDeg * Math.PI) / 180;
    const px = center.x;
    const py = center.y;
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.moveTo(px + Math.sin(nose) * 10, py - Math.cos(nose) * 10);
    ctx.lineTo(px + Math.sin(nose + 2.4) * 7, py - Math.cos(nose + 2.4) * 7);
    ctx.lineTo(px + Math.sin(nose - 2.4) * 7, py - Math.cos(nose - 2.4) * 7);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(200, 220, 240, 0.9)';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(
      `${this.player.lat.toFixed(4)}°, ${this.player.lon.toFixed(4)}° · HDG ${Math.round(this.player.headingDeg)}°`,
      8,
      h - 8,
    );
    if (this.route.length > 0) {
      ctx.textAlign = 'right';
      ctx.fillText(`${this.route.length} WP`, w - 8, h - 8);
    }
  }
}
