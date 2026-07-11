import airports from '../data/airports.json';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface GeoPoint {
  lat: number;
  lon: number;
  label?: string;
}

interface RunwayInfo {
  id: string;
  hdg: number;
  lat?: number;
  lon?: number;
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
  /** Primary runway low-end true heading (degrees), from OurAirports. */
  rwyHdg?: number;
  /** Primary runway ends, e.g. "16R/34L". */
  rwy?: string;
  /** All open runways (preferred). */
  rwys?: RunwayInfo[];
}

function airportRunways(ap: AirportRecord): RunwayInfo[] {
  if (ap.rwys?.length) return ap.rwys;
  if (ap.rwyHdg != null && Number.isFinite(ap.rwyHdg)) {
    return [{ id: ap.rwy ?? `${Math.round(ap.rwyHdg)}`, hdg: ap.rwyHdg }];
  }
  return [];
}

export type AirportCodeMode = 'icao' | 'iata';
type AirportField = 'dep' | 'dest' | 'find';

const airportList = airports as AirportRecord[];

/** Great-circle initial bearing from A to B, degrees true (0–360). */
export function bearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Destination point given start, true bearing, and distance in km. */
export function destinationPoint(
  lat: number,
  lon: number,
  bearingDegValue: number,
  distKm: number,
): GeoPoint {
  const R = 6371;
  const δ = distKm / R;
  const θ = (bearingDegValue * Math.PI) / 180;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lon * Math.PI) / 180;
  const sinφ2 =
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ);
  const φ2 = Math.asin(Math.max(-1, Math.min(1, sinφ2)));
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
    );
  return {
    lat: (φ2 * 180) / Math.PI,
    lon: (((λ2 * 180) / Math.PI + 540) % 360) - 180,
  };
}

function headingErrorDeg(fromDeg: number, toDeg: number): number {
  let err = toDeg - fromDeg;
  while (err > 180) err -= 360;
  while (err < -180) err += 360;
  return err;
}

/** Pick the runway end whose heading best matches an inbound course. */
function approachHeadingDeg(rwyHdg: number, inboundDeg: number): number {
  const a = ((rwyHdg % 360) + 360) % 360;
  const b = (a + 180) % 360;
  return Math.abs(headingErrorDeg(inboundDeg, a)) <=
    Math.abs(headingErrorDeg(inboundDeg, b))
    ? a
    : b;
}

function toCartesian(lat: number, lon: number): [number, number, number] {
  const φ = (lat * Math.PI) / 180;
  const λ = (lon * Math.PI) / 180;
  return [Math.cos(φ) * Math.cos(λ), Math.cos(φ) * Math.sin(λ), Math.sin(φ)];
}

function fromCartesian(x: number, y: number, z: number): GeoPoint {
  const hyp = Math.hypot(x, y);
  return {
    lat: (Math.atan2(z, hyp) * 180) / Math.PI,
    lon: (Math.atan2(y, x) * 180) / Math.PI,
  };
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function greatCirclePath(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  segments = 32,
): GeoPoint[] {
  const a = toCartesian(lat1, lon1);
  const b = toCartesian(lat2, lon2);
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  dot = Math.max(-1, Math.min(1, dot));
  const omega = Math.acos(dot);
  if (omega < 1e-6) return [{ lat: lat1, lon: lon1 }, { lat: lat2, lon: lon2 }];

  const points: GeoPoint[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const s0 = Math.sin((1 - t) * omega) / Math.sin(omega);
    const s1 = Math.sin(t * omega) / Math.sin(omega);
    points.push(
      fromCartesian(s0 * a[0] + s1 * b[0], s0 * a[1] + s1 * b[1], s0 * a[2] + s1 * b[2]),
    );
  }
  return points;
}

function pathSegmentCount(distKm: number): number {
  if (distKm < 400) return 8;
  if (distKm < 1500) return 20;
  if (distKm < 4000) return 40;
  return 64;
}

export class NavigationMap {
  readonly element: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly routeList: HTMLElement;
  private readonly hintEl: HTMLElement;
  private readonly depInput: HTMLInputElement;
  private readonly destInput: HTMLInputElement;
  private readonly findInput: HTMLInputElement;
  private readonly depResults: HTMLElement;
  private readonly destResults: HTMLElement;
  private readonly findResults: HTMLElement;
  private visible = false;
  private zoomDeg = 1.4;
  private codeMode: AirportCodeMode = 'icao';
  private followPlayer = true;
  private viewLat = 0;
  private viewLon = 0;
  private readonly route: GeoPoint[] = [];
  private player: GeoPoint & { headingDeg: number } = { lat: 0, lon: 0, headingDeg: 0 };
  private onRouteChange: ((route: GeoPoint[]) => void) | null = null;
  private activeField: AirportField | null = null;
  private searchHits: AirportRecord[] = [];
  private departure: AirportRecord | null = null;
  private destination: AirportRecord | null = null;
  private highlightedAirport: AirportRecord | null = null;

  private dragging = false;
  private dragMoved = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragOriginLat = 0;
  private dragOriginLon = 0;

  constructor(container: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'nav-map hidden';
    this.element.innerHTML = `
      <div class="nav-map-header">
        <span>Map</span>
        <button type="button" class="nav-map-close" title="Close (M)">×</button>
      </div>
      <div class="nav-map-od">
        <div class="nav-map-search" data-field="dep">
          <label for="nav-map-dep">Departure</label>
          <input type="search" id="nav-map-dep" placeholder="From (ICAO / IATA / name)" autocomplete="off" spellcheck="false" />
          <ul class="nav-map-search-results hidden" role="listbox"></ul>
        </div>
        <div class="nav-map-search" data-field="dest">
          <label for="nav-map-dest">Destination</label>
          <input type="search" id="nav-map-dest" placeholder="To (ICAO / IATA / name)" autocomplete="off" spellcheck="false" />
          <ul class="nav-map-search-results hidden" role="listbox"></ul>
        </div>
        <button type="button" class="nav-map-set-route" data-action="set-route">Set route</button>
      </div>
      <div class="nav-map-search" data-field="find">
        <label for="nav-map-find">Find on map</label>
        <input type="search" id="nav-map-find" placeholder="Look up airport without routing" autocomplete="off" spellcheck="false" />
        <ul class="nav-map-search-results hidden" role="listbox"></ul>
      </div>
      <canvas class="nav-map-canvas" width="360" height="280"></canvas>
      <div class="nav-map-toolbar">
        <button type="button" data-action="zoom-in">+</button>
        <button type="button" data-action="zoom-out">−</button>
        <button type="button" data-action="recenter">Recenter</button>
        <button type="button" data-action="clear-route">Clear route</button>
      </div>
      <div class="nav-map-code-mode" role="group" aria-label="Airport code labels">
        <button type="button" data-code="icao" class="active">ICAO</button>
        <button type="button" data-code="iata">IATA</button>
      </div>
      <p class="nav-map-hint"></p>
      <ol class="nav-map-route"></ol>
    `;
    container.appendChild(this.element);

    this.canvas = this.element.querySelector('.nav-map-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.routeList = this.element.querySelector('.nav-map-route') as HTMLElement;
    this.hintEl = this.element.querySelector('.nav-map-hint') as HTMLElement;
    this.depInput = this.element.querySelector('#nav-map-dep') as HTMLInputElement;
    this.destInput = this.element.querySelector('#nav-map-dest') as HTMLInputElement;
    this.findInput = this.element.querySelector('#nav-map-find') as HTMLInputElement;
    this.depResults = this.element.querySelector('[data-field="dep"] .nav-map-search-results') as HTMLElement;
    this.destResults = this.element.querySelector('[data-field="dest"] .nav-map-search-results') as HTMLElement;
    this.findResults = this.element.querySelector('[data-field="find"] .nav-map-search-results') as HTMLElement;
    this.hintEl.textContent =
      'Gold lines = every nearby runway · Pink = route destination · Zoom in for labels';

    this.element.querySelector('.nav-map-close')?.addEventListener('click', () => this.hide());
    this.element.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = (btn as HTMLElement).dataset.action;
        if (action === 'zoom-in') this.zoomDeg = Math.max(0.25, this.zoomDeg * 0.72);
        if (action === 'zoom-out') this.zoomDeg = Math.min(12, this.zoomDeg / 0.72);
        if (action === 'clear-route') this.clearRoute();
        if (action === 'recenter') this.recenterOnPlayer();
        if (action === 'set-route') this.applyTypedRoute();
        this.draw();
      });
    });

    this.element.querySelectorAll('[data-code]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = (btn as HTMLElement).dataset.code as AirportCodeMode;
        if (mode !== 'icao' && mode !== 'iata') return;
        this.codeMode = mode;
        this.element.querySelectorAll('[data-code]').forEach((el) => {
          el.classList.toggle('active', (el as HTMLElement).dataset.code === mode);
        });
        this.draw();
      });
    });

    this.bindAirportField('dep', this.depInput, this.depResults);
    this.bindAirportField('dest', this.destInput, this.destResults);
    this.bindAirportField('find', this.findInput, this.findResults);

    this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    this.canvas.addEventListener('pointercancel', (e) => this.onPointerUp(e));
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.12 : 0.88;
      this.zoomDeg = clamp(this.zoomDeg * factor, 0.25, 12);
      this.draw();
    }, { passive: false });
  }

  private bindAirportField(
    field: AirportField,
    input: HTMLInputElement,
    results: HTMLElement,
  ): void {
    input.addEventListener('input', () => {
      if (field === 'dep') this.departure = null;
      if (field === 'dest') this.destination = null;
      this.onFieldInput(field, input, results);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (this.activeField === field && this.searchHits[0]) {
          this.selectFieldHit(field, this.searchHits[0], input);
        } else {
          this.applyTypedRoute();
        }
      } else if (e.key === 'Escape') {
        this.clearFieldResults(results);
        input.blur();
      }
      e.stopPropagation();
    });
    input.addEventListener('keyup', (e) => e.stopPropagation());
    results.addEventListener('mousedown', (e) => {
      const li = (e.target as HTMLElement).closest('li[data-idx]');
      if (!li) return;
      e.preventDefault();
      const idx = Number((li as HTMLElement).dataset.idx);
      const hit = this.searchHits[idx];
      if (hit) this.selectFieldHit(field, hit, input);
    });
  }

  setOnRouteChange(cb: (route: GeoPoint[]) => void): void {
    this.onRouteChange = cb;
  }

  show(): void {
    this.visible = true;
    this.element.classList.remove('hidden');
    if (this.followPlayer) this.recenterOnPlayer();
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
    if (this.followPlayer) {
      this.viewLat = lat;
      this.viewLon = lon;
    }
    if (this.visible) this.draw();
  }

  getRoute(): readonly GeoPoint[] {
    return this.route;
  }

  /** Bearing to the next route waypoint, or null if no route. */
  getDesiredHeading(): number | null {
    const next = this.route[0];
    if (!next) return null;
    return bearingDeg(this.player.lat, this.player.lon, next.lat, next.lon);
  }

  /** Test / automation — inspect runway lineup state. */
  getRunwayAidDebug() {
    const yssy = airportList.find((x) => x.icao === 'YSSY');
    return {
      departure: this.departure
        ? {
            icao: this.departure.icao,
            rwy: this.departure.rwy ?? null,
            rwyHdg: this.departure.rwyHdg ?? null,
          }
        : null,
      destination: this.destination
        ? {
            icao: this.destination.icao,
            rwy: this.destination.rwy ?? null,
            rwyHdg: this.destination.rwyHdg ?? null,
          }
        : null,
      zoomDeg: this.zoomDeg,
      viewLat: this.viewLat,
      viewLon: this.viewLon,
      followPlayer: this.followPlayer,
      sampleYssy: yssy
        ? { rwy: yssy.rwy ?? null, rwyHdg: yssy.rwyHdg ?? null }
        : null,
    };
  }

  /**
   * Drop intermediate waypoints once close enough (keeps the final destination).
   * Returns true if the active waypoint changed.
   */
  advanceRoute(lat: number, lon: number, passKm = 4): boolean {
    if (this.route.length <= 1) return false;
    let changed = false;
    while (
      this.route.length > 1 &&
      haversineKm(lat, lon, this.route[0].lat, this.route[0].lon) < passKm
    ) {
      this.route.shift();
      changed = true;
    }
    if (changed) {
      this.syncRouteList();
      this.onRouteChange?.(this.route);
      if (this.visible) this.draw();
    }
    return changed;
  }

  clearRoute(): void {
    this.route.length = 0;
    this.departure = null;
    this.destination = null;
    this.depInput.value = '';
    this.destInput.value = '';
    this.syncRouteList();
    this.onRouteChange?.(this.route);
    this.draw();
  }

  private recenterOnPlayer(): void {
    this.followPlayer = true;
    this.viewLat = this.player.lat;
    this.viewLon = this.player.lon;
  }

  private airportLabel(ap: AirportRecord): string {
    if (this.codeMode === 'iata') {
      return ap.iata || ap.icao || ap.name.slice(0, 12);
    }
    return ap.icao || ap.iata || ap.name.slice(0, 12);
  }

  private formatAirport(ap: AirportRecord): string {
    return `${this.airportLabel(ap)} — ${ap.name}`;
  }

  private isUsableAirport(a: AirportRecord): boolean {
    if (!a.icao && !a.iata) return false;
    if (a.name.startsWith('(Duplicate)') || a.name.startsWith('[Duplicate]')) return false;
    return true;
  }

  private resultsEl(field: AirportField): HTMLElement {
    if (field === 'dep') return this.depResults;
    if (field === 'dest') return this.destResults;
    return this.findResults;
  }

  private onFieldInput(
    field: AirportField,
    input: HTMLInputElement,
    results: HTMLElement,
  ): void {
    this.activeField = field;
    this.clearOtherResults(field);
    const q = input.value.trim();
    if (q.length < 2) {
      this.clearFieldResults(results);
      return;
    }
    this.searchHits = this.searchAirports(q).slice(0, 8);
    if (this.searchHits.length === 0) {
      results.innerHTML = '<li class="nav-map-search-empty">No airports found</li>';
      results.classList.remove('hidden');
      return;
    }
    results.innerHTML = this.searchHits
      .map((ap, i) => {
        const code = [ap.icao, ap.iata].filter(Boolean).join(' / ');
        const place = [ap.city, ap.country].filter(Boolean).join(', ');
        return `<li data-idx="${i}" role="option"><strong>${code}</strong> ${ap.name}${place ? ` · ${place}` : ''}</li>`;
      })
      .join('');
    results.classList.remove('hidden');
  }

  private searchAirports(query: string): AirportRecord[] {
    const q = query.trim().toUpperCase();
    const qLower = query.trim().toLowerCase();
    const exact: AirportRecord[] = [];
    const starts: AirportRecord[] = [];
    const contains: AirportRecord[] = [];

    for (const a of airportList) {
      if (!this.isUsableAirport(a)) continue;
      const icao = a.icao.toUpperCase();
      const iata = a.iata.toUpperCase();
      const name = a.name.toLowerCase();
      const city = a.city.toLowerCase();

      if (icao === q || iata === q) {
        exact.push(a);
      } else if (icao.startsWith(q) || iata.startsWith(q)) {
        starts.push(a);
      } else if (
        name.includes(qLower) ||
        city.includes(qLower) ||
        icao.includes(q) ||
        iata.includes(q)
      ) {
        contains.push(a);
      }
    }

    return [...exact, ...starts, ...contains];
  }

  private resolveAirport(query: string): AirportRecord | null {
    const hits = this.searchAirports(query);
    if (!hits.length) return null;
    const q = query.trim().toUpperCase();
    return hits.find((a) => a.icao.toUpperCase() === q || a.iata.toUpperCase() === q) ?? hits[0];
  }

  private selectFieldHit(
    field: AirportField,
    ap: AirportRecord,
    input: HTMLInputElement,
  ): void {
    input.value = this.formatAirport(ap);
    this.clearFieldResults(this.resultsEl(field));
    this.activeField = null;

    if (field === 'find') {
      this.panToAirport(ap);
      this.highlightedAirport = ap;
      this.draw();
      return;
    }

    if (field === 'dep') this.departure = ap;
    if (field === 'dest') this.destination = ap;

    if (this.departure && this.destination) {
      this.setOdRoute(this.departure, this.destination);
    } else {
      this.panToAirport(ap);
      this.highlightedAirport = ap;
      this.draw();
    }
  }

  private applyTypedRoute(): void {
    const dep =
      this.departure ??
      (this.depInput.value.trim() ? this.resolveAirport(this.depInput.value) : null);
    const dest =
      this.destination ??
      (this.destInput.value.trim() ? this.resolveAirport(this.destInput.value) : null);

    if (!dep || !dest) {
      this.hintEl.textContent = !dep && !dest
        ? 'Enter both departure and destination airports'
        : !dep
          ? 'Enter a departure airport'
          : 'Enter a destination airport';
      return;
    }

    this.departure = dep;
    this.destination = dest;
    this.depInput.value = this.formatAirport(dep);
    this.destInput.value = this.formatAirport(dest);
    this.setOdRoute(dep, dest);
    this.hintEl.textContent =
      'Pink = destination runway · Green = departure · Gold = nearby runways';
  }

  private setOdRoute(dep: AirportRecord, dest: AirportRecord): void {
    this.route.length = 0;
    this.route.push({
      lat: dest.lat,
      lon: dest.lon,
      label: this.airportLabel(dest),
    });
    this.highlightedAirport = dest;
    this.fitToAirports(dep, dest);
    this.syncRouteList();
    this.onRouteChange?.(this.route);
    this.draw();
  }

  private panToAirport(ap: AirportRecord): void {
    this.followPlayer = false;
    this.viewLat = ap.lat;
    this.viewLon = ap.lon;
    this.zoomDeg = Math.min(this.zoomDeg, 0.9);
  }

  private fitToAirports(a: AirportRecord, b: AirportRecord): void {
    this.followPlayer = false;
    this.viewLat = (a.lat + b.lat) / 2;
    let lonA = a.lon;
    let lonB = b.lon;
    // unwrap across antimeridian for a sensible midpoint
    if (Math.abs(lonB - lonA) > 180) {
      if (lonB > lonA) lonA += 360;
      else lonB += 360;
    }
    let midLon = (lonA + lonB) / 2;
    if (midLon > 180) midLon -= 360;
    if (midLon < -180) midLon += 360;
    this.viewLon = midLon;

    const distKm = haversineKm(a.lat, a.lon, b.lat, b.lon);
    // Rough zoom so both ends fit; long-haul needs a wide view
    if (distKm > 8000) this.zoomDeg = 55;
    else if (distKm > 4000) this.zoomDeg = 35;
    else if (distKm > 1500) this.zoomDeg = 18;
    else if (distKm > 500) this.zoomDeg = 6;
    else this.zoomDeg = 2.2;
  }

  private clearOtherResults(except: AirportField): void {
    if (except !== 'dep') this.clearFieldResults(this.depResults);
    if (except !== 'dest') this.clearFieldResults(this.destResults);
    if (except !== 'find') this.clearFieldResults(this.findResults);
  }

  private clearFieldResults(results: HTMLElement): void {
    results.innerHTML = '';
    results.classList.add('hidden');
    if (this.resultsEl(this.activeField ?? 'find') === results) {
      this.searchHits = [];
    }
  }

  private syncRouteList(): void {
    const lines: string[] = [];
    if (this.departure && this.destination) {
      lines.push(
        `1. ${this.airportLabel(this.departure)} → ${this.airportLabel(this.destination)}`,
      );
    } else {
      for (let i = 0; i < this.route.length; i++) {
        const p = this.route[i];
        lines.push(`${i + 1}. ${p.label ?? `${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}`}`);
      }
    }
    this.routeList.innerHTML = lines.map((t) => `<li>${t}</li>`).join('');
  }

  private onPointerDown(e: PointerEvent): void {
    this.dragging = true;
    this.dragMoved = false;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.dragOriginLat = this.viewLat;
    this.dragOriginLon = this.viewLon;
    this.canvas.setPointerCapture(e.pointerId);
    this.canvas.classList.add('dragging');
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.dragging) return;
    const dxPx = e.clientX - this.dragStartX;
    const dyPx = e.clientY - this.dragStartY;
    if (Math.hypot(dxPx, dyPx) > 4) this.dragMoved = true;

    const rect = this.canvas.getBoundingClientRect();
    const lonSpan =
      this.zoomDeg * Math.max(0.4, Math.cos((this.viewLat * Math.PI) / 180));
    const dx = (dxPx / rect.width) * lonSpan * 2;
    const dy = (dyPx / rect.height) * this.zoomDeg * 2;
    this.followPlayer = false;
    this.viewLon = this.dragOriginLon - dx;
    this.viewLat = this.dragOriginLat + dy;
    this.draw();
  }

  private onPointerUp(e: PointerEvent): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.canvas.classList.remove('dragging');
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (!this.dragMoved) {
      this.onMapClick(e);
    }
  }

  private onMapClick(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * this.canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * this.canvas.height;
    const hit = this.hitTestAirport(x, y);
    if (hit) {
      this.addWaypoint({
        lat: hit.lat,
        lon: hit.lon,
        label: this.airportLabel(hit),
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
    const lonSpan =
      this.zoomDeg * Math.max(0.4, Math.cos((this.viewLat * Math.PI) / 180));
    return airportList.filter((a) => {
      if (!this.isUsableAirport(a)) return false;
      if (this.codeMode === 'iata' && !a.iata) return false;
      if (this.codeMode === 'icao' && !a.icao) return false;
      return (
        Math.abs(a.lat - this.viewLat) < latSpan &&
        Math.abs(a.lon - this.viewLon) < lonSpan
      );
    });
  }

  private geoToScreen(lat: number, lon: number): { x: number; y: number } {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const lonSpan =
      this.zoomDeg * Math.max(0.4, Math.cos((this.viewLat * Math.PI) / 180));
    let dLon = lon - this.viewLon;
    if (dLon > 180) dLon -= 360;
    if (dLon < -180) dLon += 360;
    const dx = dLon / lonSpan;
    const dy = (this.viewLat - lat) / this.zoomDeg;
    return { x: w * 0.5 + dx * w * 0.48, y: h * 0.5 + dy * h * 0.48 };
  }

  private screenToGeo(x: number, y: number): GeoPoint {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const lonSpan =
      this.zoomDeg * Math.max(0.4, Math.cos((this.viewLat * Math.PI) / 180));
    const dx = (x - w * 0.5) / (w * 0.48);
    const dy = (y - h * 0.5) / (h * 0.48);
    return {
      lat: this.viewLat - dy * this.zoomDeg,
      lon: this.viewLon + dx * lonSpan,
    };
  }

  private hitTestAirport(x: number, y: number): AirportRecord | null {
    let best: AirportRecord | null = null;
    let bestD = 14;
    const candidates = this.airportsInView();
    for (const extra of [this.highlightedAirport, this.departure, this.destination]) {
      if (
        extra &&
        !candidates.some((a) => a.icao === extra.icao && a.lat === extra.lat)
      ) {
        candidates.push(extra);
      }
    }
    for (const ap of candidates) {
      const p = this.geoToScreen(ap.lat, ap.lon);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) {
        bestD = d;
        best = ap;
      }
    }
    return best;
  }

  private strokeGreatCircle(
    ctx: CanvasRenderingContext2D,
    a: GeoPoint,
    b: GeoPoint,
    color: string,
    dashed: boolean,
    lineWidth = 2,
  ): void {
    const distKm = haversineKm(a.lat, a.lon, b.lat, b.lon);
    const samples = greatCirclePath(
      a.lat,
      a.lon,
      b.lat,
      b.lon,
      pathSegmentCount(distKm),
    );
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(dashed ? [6, 4] : []);
    ctx.beginPath();
    let started = false;
    let prevScreen: { x: number; y: number } | null = null;
    for (const pt of samples) {
      const p = this.geoToScreen(pt.lat, pt.lon);
      if (
        prevScreen &&
        (Math.abs(p.x - prevScreen.x) > this.canvas.width * 0.45 ||
          Math.abs(p.y - prevScreen.y) > this.canvas.height * 0.45)
      ) {
        ctx.stroke();
        ctx.beginPath();
        started = false;
      }
      if (!started) {
        ctx.moveTo(p.x, p.y);
        started = true;
      } else {
        ctx.lineTo(p.x, p.y);
      }
      prevScreen = p;
    }
    if (started) ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawGreatCircleRoute(ctx: CanvasRenderingContext2D): void {
    if (this.departure && this.destination) {
      this.strokeGreatCircle(
        ctx,
        { lat: this.departure.lat, lon: this.departure.lon },
        { lat: this.destination.lat, lon: this.destination.lon },
        '#5ab0ff',
        true,
      );
    }

    const legs: GeoPoint[] = [
      { lat: this.player.lat, lon: this.player.lon },
      ...this.route,
    ];
    for (let i = 0; i < legs.length - 1; i++) {
      // Avoid double-drawing the OD leg when player is still near departure
      if (
        this.departure &&
        this.destination &&
        i === 0 &&
        this.route.length === 1 &&
        haversineKm(this.player.lat, this.player.lon, this.departure.lat, this.departure.lon) < 80
      ) {
        continue;
      }
      this.strokeGreatCircle(ctx, legs[i], legs[i + 1], '#7dd3fc', true);
    }
  }

  private runwayEndLabel(rwy: RunwayInfo, approachHdg: number): string {
    const [le, he] = rwy.id.split('/');
    if (le && he) {
      const leHdg = ((rwy.hdg % 360) + 360) % 360;
      const heHdg = (leHdg + 180) % 360;
      const useLe =
        Math.abs(headingErrorDeg(approachHdg, leHdg)) <=
        Math.abs(headingErrorDeg(approachHdg, heHdg));
      return `RWY ${useLe ? le : he}`;
    }
    const num = Math.round(approachHdg / 10) % 36 || 36;
    return `RWY ${String(num).padStart(2, '0')}`;
  }

  /**
   * Extended centerline for one runway.
   * Uses runway midpoints when available so parallel strips don't overlap.
   */
  private drawOneRunway(
    ctx: CanvasRenderingContext2D,
    ap: AirportRecord,
    rwy: RunwayInfo,
    opts: {
      approach?: boolean;
      label?: boolean;
      color: string;
      emphasize?: boolean;
    },
  ): void {
    if (!Number.isFinite(rwy.hdg)) return;
    const lat = rwy.lat ?? ap.lat;
    const lon = rwy.lon ?? ap.lon;

    let axisHdg = ((rwy.hdg % 360) + 360) % 360;
    if (opts.approach) {
      const inbound = bearingDeg(this.player.lat, this.player.lon, lat, lon);
      axisHdg = approachHeadingDeg(rwy.hdg, inbound);
    }

    const recip = (axisHdg + 180) % 360;
    const kmPerPx = (this.zoomDeg * 111) / Math.max(this.canvas.height, 1);
    const approachKm = clamp(this.canvas.height * 0.38 * kmPerPx, 6, 420);
    const beyondKm = clamp(this.canvas.height * 0.1 * kmPerPx, 2, 120);
    const stubKm = clamp(this.canvas.height * 0.025 * kmPerPx, 0.7, 25);
    const finalKm = opts.approach ? approachKm : Math.max(beyondKm, approachKm * 0.55);
    const outKm = opts.approach ? beyondKm : finalKm;
    const width = opts.emphasize ? 3.5 : opts.approach ? 3 : 2.2;

    const finalStart = destinationPoint(lat, lon, recip, finalKm);
    const beyond = destinationPoint(lat, lon, axisHdg, outKm);
    this.strokeGreatCircle(ctx, finalStart, beyond, opts.color, true, width);

    const stubA = destinationPoint(lat, lon, recip, stubKm);
    const stubB = destinationPoint(lat, lon, axisHdg, stubKm);
    ctx.strokeStyle = opts.color;
    ctx.lineWidth = width + 0.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    const a = this.geoToScreen(stubA.lat, stubA.lon);
    const b = this.geoToScreen(stubB.lat, stubB.lon);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    if (opts.label) {
      const labelDist = Math.min(finalKm * 0.35, Math.max(4, stubKm * 4));
      const labelAt = destinationPoint(lat, lon, recip, labelDist);
      const p = this.geoToScreen(labelAt.lat, labelAt.lon);
      if (p.x > 4 && p.x < this.canvas.width - 4 && p.y > 10 && p.y < this.canvas.height - 4) {
        ctx.fillStyle = opts.color;
        ctx.font = opts.emphasize ? 'bold 10px system-ui' : '9px system-ui';
        ctx.textAlign = 'center';
        const text = opts.approach
          ? this.runwayEndLabel(rwy, axisHdg)
          : `RWY ${rwy.id}`;
        ctx.fillText(text, p.x, p.y - 5);
      }
    }
  }

  /** Draw every runway at an airport. */
  private drawAirportRunways(
    ctx: CanvasRenderingContext2D,
    ap: AirportRecord,
    opts: {
      approach?: boolean;
      label?: boolean;
      color: string;
      /** When approaching, boost the runway that best matches inbound. */
      preferInbound?: boolean;
    },
  ): void {
    const rwys = airportRunways(ap);
    if (!rwys.length) return;

    let preferredIdx = 0;
    if (opts.preferInbound || opts.approach) {
      const inbound = bearingDeg(this.player.lat, this.player.lon, ap.lat, ap.lon);
      let best = Infinity;
      rwys.forEach((r, i) => {
        const chosen = approachHeadingDeg(r.hdg, inbound);
        const err = Math.abs(headingErrorDeg(inbound, chosen));
        if (err < best) {
          best = err;
          preferredIdx = i;
        }
      });
    }

    rwys.forEach((rwy, i) => {
      const emphasize = i === preferredIdx;
      this.drawOneRunway(ctx, ap, rwy, {
        approach: opts.approach,
        // Label every strip when on-field / zoomed in; otherwise only the preferred one
        label:
          !!opts.label &&
          (rwys.length === 1 ||
            emphasize ||
            !opts.approach ||
            this.zoomDeg <= 1.3),
        color: emphasize
          ? opts.color
          : opts.color.replace(/[\d.]+\)$/, (m) => {
              const a = parseFloat(m);
              return `${Math.max(0.35, a * 0.55)})`;
            }),
        emphasize,
      });
    });
  }

  private airportKey(ap: AirportRecord): string {
    return `${ap.icao}|${ap.lat}|${ap.lon}`;
  }

  private drawRunwayAids(ctx: CanvasRenderingContext2D): void {
    const drawn = new Set<string>();

    if (this.departure && airportRunways(this.departure).length) {
      this.drawAirportRunways(ctx, this.departure, {
        approach: false,
        label: true,
        color: 'rgba(74, 222, 128, 0.75)',
      });
      drawn.add(this.airportKey(this.departure));
    }

    if (this.destination && airportRunways(this.destination).length) {
      this.drawAirportRunways(ctx, this.destination, {
        approach: true,
        label: true,
        preferInbound: true,
        color: 'rgba(255, 107, 203, 0.9)',
      });
      drawn.add(this.airportKey(this.destination));
    } else if (this.route.length > 0) {
      const last = this.route[this.route.length - 1];
      const hit = airportList.find(
        (a) =>
          airportRunways(a).length > 0 &&
          haversineKm(a.lat, a.lon, last.lat, last.lon) < 2.5,
      );
      if (hit && !drawn.has(this.airportKey(hit))) {
        this.drawAirportRunways(ctx, hit, {
          approach: true,
          label: true,
          preferInbound: true,
          color: 'rgba(255, 107, 203, 0.9)',
        });
        drawn.add(this.airportKey(hit));
      }
    }

    // Nearby airports when zoomed in (no route needed)
    if (this.zoomDeg <= 4) {
      const nearLimitKm = clamp(this.zoomDeg * 80, 25, 120);
      const withDist = this.airportsInView()
        .filter((a) => airportRunways(a).length > 0)
        .map((a) => ({
          ap: a,
          dist: haversineKm(this.player.lat, this.player.lon, a.lat, a.lon),
        }))
        .filter((x) => x.dist < nearLimitKm)
        .sort((a, b) => a.dist - b.dist);

      if (withDist.length === 0 || withDist[0].dist > 15) {
        const latPad = Math.max(this.zoomDeg * 1.5, 0.35);
        const lonPad =
          latPad / Math.max(0.35, Math.cos((this.player.lat * Math.PI) / 180));
        let best: { ap: AirportRecord; dist: number } | null = null;
        for (const a of airportList) {
          if (!airportRunways(a).length) continue;
          if (Math.abs(a.lat - this.player.lat) > latPad) continue;
          if (Math.abs(a.lon - this.player.lon) > lonPad) continue;
          const dist = haversineKm(this.player.lat, this.player.lon, a.lat, a.lon);
          if (dist >= nearLimitKm) continue;
          if (!best || dist < best.dist) best = { ap: a, dist };
        }
        if (best && !withDist.some((x) => this.airportKey(x.ap) === this.airportKey(best!.ap))) {
          withDist.unshift(best);
        }
      }

      const nearest = withDist[0] ?? null;
      let shown = 0;
      for (const { ap, dist } of withDist) {
        if (shown >= 5) break;
        if (drawn.has(this.airportKey(ap))) continue;
        const isNearest =
          nearest != null && this.airportKey(ap) === this.airportKey(nearest.ap);
        const onField = dist < 12;
        this.drawAirportRunways(ctx, ap, {
          approach: !onField,
          label: isNearest || this.zoomDeg <= 1.8,
          preferInbound: !onField,
          color: isNearest
            ? 'rgba(255, 196, 77, 0.95)'
            : 'rgba(255, 196, 77, 0.5)',
        });
        drawn.add(this.airportKey(ap));
        shown++;
      }
    }

    if (
      this.highlightedAirport &&
      airportRunways(this.highlightedAirport).length &&
      !drawn.has(this.airportKey(this.highlightedAirport))
    ) {
      this.drawAirportRunways(ctx, this.highlightedAirport, {
        approach: true,
        label: true,
        preferInbound: true,
        color: 'rgba(255, 196, 77, 0.9)',
      });
    }
  }

  private draw(): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.fillStyle = '#0c1420';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(80, 120, 180, 0.2)';
    ctx.lineWidth = 1;
    const viewCenter = this.geoToScreen(this.viewLat, this.viewLon);
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(0, viewCenter.y + (i * h * 0.48) / 3);
      ctx.lineTo(w, viewCenter.y + (i * h * 0.48) / 3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(viewCenter.x + (i * w * 0.48) / 3, 0);
      ctx.lineTo(viewCenter.x + (i * w * 0.48) / 3, h);
      ctx.stroke();
    }

    this.drawRunwayAids(ctx);

    if (this.route.length > 0 || (this.departure && this.destination)) {
      this.drawGreatCircleRoute(ctx);
      ctx.fillStyle = '#5ab0ff';
      for (const wp of this.route) {
        const p = this.geoToScreen(wp.lat, wp.lon);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const showLabels = this.zoomDeg < 2.5;
    const drawn = this.airportsInView();
    for (const extra of [this.highlightedAirport, this.departure, this.destination]) {
      if (
        extra &&
        !drawn.some((a) => a.icao === extra.icao && a.lat === extra.lat)
      ) {
        drawn.push(extra);
      }
    }
    for (const ap of drawn) {
      const p = this.geoToScreen(ap.lat, ap.lon);
      if (p.x < -8 || p.x > w + 8 || p.y < -8 || p.y > h + 8) continue;
      const isDep = this.departure?.icao === ap.icao && this.departure.lat === ap.lat;
      const isDest =
        this.destination?.icao === ap.icao && this.destination.lat === ap.lat;
      const highlighted =
        this.highlightedAirport != null &&
        this.highlightedAirport.lat === ap.lat &&
        this.highlightedAirport.lon === ap.lon &&
        this.highlightedAirport.icao === ap.icao;
      ctx.fillStyle = isDest ? '#ff6bcb' : isDep ? '#4ade80' : highlighted ? '#ff6bcb' : '#f0c060';
      ctx.beginPath();
      ctx.arc(p.x, p.y, isDep || isDest || highlighted ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
      const label = this.airportLabel(ap);
      if ((showLabels || isDep || isDest || highlighted) && label) {
        ctx.fillStyle = 'rgba(220, 230, 245, 0.85)';
        ctx.font = isDep || isDest || highlighted ? 'bold 10px system-ui' : '9px system-ui';
        ctx.textAlign = 'left';
        ctx.fillText(label, p.x + 5, p.y + 3);
      }
    }

    const plane = this.geoToScreen(this.player.lat, this.player.lon);
    const nose = (this.player.headingDeg * Math.PI) / 180;
    const tip = 11;
    const wing = 8;
    ctx.beginPath();
    ctx.moveTo(plane.x + Math.sin(nose) * tip, plane.y - Math.cos(nose) * tip);
    ctx.lineTo(plane.x + Math.sin(nose + 2.4) * wing, plane.y - Math.cos(nose + 2.4) * wing);
    ctx.lineTo(plane.x + Math.sin(nose - 2.4) * wing, plane.y - Math.cos(nose - 2.4) * wing);
    ctx.closePath();
    ctx.fillStyle = '#3ddc84';
    ctx.fill();
    ctx.strokeStyle = 'rgba(6, 10, 16, 0.9)';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.fillStyle = 'rgba(200, 220, 240, 0.9)';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(
      `${this.player.lat.toFixed(4)}°, ${this.player.lon.toFixed(4)}° · HDG ${Math.round(this.player.headingDeg)}°`,
      8,
      h - 8,
    );
    if (this.route.length > 0) {
      const course = this.getDesiredHeading();
      ctx.textAlign = 'right';
      ctx.fillText(
        course != null
          ? `CRS ${Math.round(course).toString().padStart(3, '0')}°`
          : `${this.route.length} WP`,
        w - 8,
        h - 8,
      );
    }
  }
}
