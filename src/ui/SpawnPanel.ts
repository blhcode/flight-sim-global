import airports from '../data/airports.json';
import { geocode } from '../world/Geocoder.ts';

export interface SpawnRequest {
  lat: number;
  lon: number;
  altM: number;
  headingDeg: number;
  label: string;
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

export class SpawnPanel {
  readonly element: HTMLElement;
  private onSpawn: ((req: SpawnRequest) => void) | null = null;
  private visible = true;

  constructor(container: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'spawn-panel';
    this.element.innerHTML = `
      <div class="spawn-card">
        <h2>Flight Sim Global</h2>
        <p class="spawn-sub">Real-world terrain · Cessna 172SP</p>
        <label>Airport ICAO / IATA
          <input type="text" id="spawn-icao" placeholder="YSSY" value="YSSY" maxlength="4" />
        </label>
        <label>Or search place
          <input type="text" id="spawn-search" placeholder="Sydney Airport" />
        </label>
        <div class="spawn-row">
          <label>Lat <input type="number" id="spawn-lat" step="0.0001" /></label>
          <label>Lon <input type="number" id="spawn-lon" step="0.0001" /></label>
        </div>
        <label>Heading ° <input type="number" id="spawn-hdg" value="160" min="0" max="359" /></label>
        <button type="button" id="spawn-go" class="primary">Load terrain & fly</button>
        <p class="spawn-hint">Click the view after loading to focus controls. W/S pitch · A/D roll · Q/E yaw · ↑/↓ throttle · C camera · T texture</p>
      </div>
    `;
    container.appendChild(this.element);

    const icaoInput = this.element.querySelector('#spawn-icao') as HTMLInputElement;
    icaoInput.addEventListener('change', () => this.fillFromIcao(icaoInput.value));

    this.element.querySelector('#spawn-go')?.addEventListener('click', () => void this.submit());
    this.element.querySelector('#spawn-search')?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') void this.searchPlace();
    });
    this.element.querySelector('#spawn-icao')?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') this.fillFromIcao((e.target as HTMLInputElement).value);
    });

    this.fillFromIcao('YSSY');
  }

  setOnSpawn(cb: (req: SpawnRequest) => void): void {
    this.onSpawn = cb;
  }

  hide(): void {
    this.visible = false;
    this.element.classList.add('hidden');
    this.element.querySelectorAll('input').forEach((el) => {
      (el as HTMLElement).blur();
    });
  }

  show(): void {
    this.visible = true;
    this.element.classList.remove('hidden');
  }

  isVisible(): boolean {
    return this.visible;
  }

  private fillFromIcao(code: string): void {
    const q = code.trim().toUpperCase();
    const ap =
      airportList.find((a) => a.iata === q) ??
      airportList.find((a) => a.icao === q);
    if (!ap) return;
    (this.element.querySelector('#spawn-lat') as HTMLInputElement).value = String(ap.lat);
    (this.element.querySelector('#spawn-lon') as HTMLInputElement).value = String(ap.lon);
    (this.element.querySelector('#spawn-search') as HTMLInputElement).value =
      `${ap.name}, ${ap.city}`;
  }

  private async searchPlace(): Promise<void> {
    const q = (this.element.querySelector('#spawn-search') as HTMLInputElement).value;
    if (!q.trim()) return;
    const result = await geocode(q);
    if (!result) return;
    (this.element.querySelector('#spawn-lat') as HTMLInputElement).value = String(result.lat);
    (this.element.querySelector('#spawn-lon') as HTMLInputElement).value = String(result.lon);
  }

  private async submit(): Promise<void> {
    const icaoInput = this.element.querySelector('#spawn-icao') as HTMLInputElement;
    if (icaoInput.value.trim()) this.fillFromIcao(icaoInput.value);

    const lat = parseFloat((this.element.querySelector('#spawn-lat') as HTMLInputElement).value);
    const lon = parseFloat((this.element.querySelector('#spawn-lon') as HTMLInputElement).value);
    const headingDeg = parseFloat((this.element.querySelector('#spawn-hdg') as HTMLInputElement).value) || 0;
    const label =
      (this.element.querySelector('#spawn-search') as HTMLInputElement).value ||
      `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const ap = airportList.find(
      (a) => Math.abs(a.lat - lat) < 0.01 && Math.abs(a.lon - lon) < 0.01,
    );
    const altM = (ap?.elevM ?? 0) + 3;

    this.onSpawn?.({ lat, lon, altM, headingDeg, label });
  }
}
