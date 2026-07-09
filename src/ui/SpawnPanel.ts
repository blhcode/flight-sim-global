import airports from '../data/airports.json';
import { geocode } from '../world/Geocoder.ts';
import { parseCoordinate } from '../world/parseCoordinate.ts';
import { listAircraft, getAircraftDefinition } from '../aircraft/registry.ts';

export interface SpawnRequest {
  lat: number;
  lon: number;
  altM: number;
  headingDeg: number;
  label: string;
  aircraftId: string;
  weightProfileId?: string;
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

function lookupAirport(code: string): AirportRecord | undefined {
  const q = code.trim().toUpperCase();
  if (!q) return undefined;
  return (
    airportList.find((a) => a.iata === q) ??
    airportList.find((a) => a.icao === q)
  );
}

export class SpawnPanel {
  readonly element: HTMLElement;
  private onSpawn: ((req: SpawnRequest) => void) | null = null;
  private visible = true;
  private errorEl: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'spawn-panel';
    this.element.innerHTML = `
      <div class="spawn-card">
        <h2>Flight Sim Global</h2>
        <p class="spawn-sub">Real-world terrain · pick your aircraft</p>
        <label>Aircraft
          <select id="spawn-aircraft">
            ${listAircraft()
              .map(
                (a) =>
                  `<option value="${a.id}"${a.id === 'cessna172' ? ' selected' : ''}>${a.displayName}</option>`,
              )
              .join('')}
          </select>
        </label>
        <label id="spawn-weight-wrap" class="spawn-weight-wrap hidden">Weight
          <select id="spawn-weight"></select>
        </label>
        <label>Airport ICAO / IATA
          <input type="text" id="spawn-icao" placeholder="YSSY or YWVA" value="YSSY" maxlength="4" autocapitalize="characters" />
        </label>
        <label>Or search place
          <input type="text" id="spawn-search" placeholder="Sydney Airport" />
        </label>
        <div class="spawn-row">
          <label>Lat <input type="text" id="spawn-lat" placeholder="-33.87 or 33°15'20.6&quot;S" spellcheck="false" /></label>
          <label>Lon <input type="text" id="spawn-lon" placeholder="151.43 or 151°25'54.6&quot;E" spellcheck="false" /></label>
        </div>
        <label>Heading ° <input type="number" id="spawn-hdg" value="160" min="0" max="359" /></label>
        <p id="spawn-error" class="spawn-error hidden" role="alert"></p>
        <button type="button" id="spawn-go" class="primary">Load terrain & fly</button>
        <p class="spawn-hint">ICAO/IATA or lat/lon — clear the airport code to spawn by coordinates. W/S pitch · A/D roll · Q/E yaw · ↑/↓ throttle · M map</p>
      </div>
    `;
    container.appendChild(this.element);
    this.errorEl = this.element.querySelector('#spawn-error');

    const icaoInput = this.element.querySelector('#spawn-icao') as HTMLInputElement;
    const latInput = this.element.querySelector('#spawn-lat') as HTMLInputElement;
    const lonInput = this.element.querySelector('#spawn-lon') as HTMLInputElement;

    icaoInput.addEventListener('change', () => this.applyIcao(icaoInput.value));
    icaoInput.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') this.applyIcao(icaoInput.value);
    });

    const markManualCoords = () => {
      icaoInput.value = '';
      (this.element.querySelector('#spawn-search') as HTMLInputElement).value = '';
      this.clearError();
    };
    latInput.addEventListener('input', markManualCoords);
    lonInput.addEventListener('input', markManualCoords);

    this.element.querySelector('#spawn-go')?.addEventListener('click', () => void this.submit());
    this.element.querySelector('#spawn-search')?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') void this.searchPlace();
    });

    this.applyIcao('YSSY');

    const aircraftSelect = this.element.querySelector('#spawn-aircraft') as HTMLSelectElement;
    aircraftSelect.addEventListener('change', () => this.syncWeightOptions());
    this.syncWeightOptions();
  }

  private syncWeightOptions(): void {
    const aircraftId =
      (this.element.querySelector('#spawn-aircraft') as HTMLSelectElement).value || 'cessna172';
    const wrap = this.element.querySelector('#spawn-weight-wrap') as HTMLElement;
    const select = this.element.querySelector('#spawn-weight') as HTMLSelectElement;
    const def = getAircraftDefinition(aircraftId);

    if (aircraftId !== 'twinOtter' || !def.weightProfiles?.length) {
      wrap.classList.add('hidden');
      select.innerHTML = '';
      return;
    }

    wrap.classList.remove('hidden');
    const prev = select.value;
    const profiles = def.weightProfiles;
    select.innerHTML = profiles
      .map((p) => `<option value="${p.id}">${p.label}</option>`)
      .join('');

    const stolAtSaba =
      ['TNCS', 'SAB'].includes(
        (this.element.querySelector('#spawn-icao') as HTMLInputElement).value.trim().toUpperCase(),
      );
    const preferred = profiles.find((p) => p.id === prev)?.id
      ?? (stolAtSaba ? 'stol' : profiles[0]?.id);
    if (preferred) select.value = preferred;
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

  private showError(msg: string): void {
    if (!this.errorEl) return;
    this.errorEl.textContent = msg;
    this.errorEl.classList.remove('hidden');
  }

  private clearError(): void {
    this.errorEl?.classList.add('hidden');
  }

  /** Fill lat/lon from airport code (live preview). */
  private applyIcao(code: string): boolean {
    const ap = lookupAirport(code);
    if (!ap) {
      if (code.trim()) {
        this.showError(`Unknown airport code: ${code.trim().toUpperCase()}`);
      }
      return false;
    }
    this.clearError();
    (this.element.querySelector('#spawn-lat') as HTMLInputElement).value = String(ap.lat);
    (this.element.querySelector('#spawn-lon') as HTMLInputElement).value = String(ap.lon);
    (this.element.querySelector('#spawn-search') as HTMLInputElement).value =
      `${ap.name}${ap.city ? `, ${ap.city}` : ''}`;
    this.syncWeightOptions();
    return true;
  }

  private async searchPlace(): Promise<void> {
    const q = (this.element.querySelector('#spawn-search') as HTMLInputElement).value;
    if (!q.trim()) return;
    const result = await geocode(q);
    if (!result) {
      this.showError(`Could not find: ${q}`);
      return;
    }
    this.clearError();
    (this.element.querySelector('#spawn-icao') as HTMLInputElement).value = '';
    (this.element.querySelector('#spawn-lat') as HTMLInputElement).value = String(result.lat);
    (this.element.querySelector('#spawn-lon') as HTMLInputElement).value = String(result.lon);
    (this.element.querySelector('#spawn-search') as HTMLInputElement).value = result.displayName;
  }

  private readWeightProfileId(aircraftId: string): string | undefined {
    if (aircraftId !== 'twinOtter') return undefined;
    const def = getAircraftDefinition(aircraftId);
    if (!def.weightProfiles?.length) return undefined;
    const select = this.element.querySelector('#spawn-weight') as HTMLSelectElement;
    return select.value || def.weightProfiles[0]?.id;
  }

  private resolveSpawn(): SpawnRequest | null {
    const icaoInput = this.element.querySelector('#spawn-icao') as HTMLInputElement;
    const code = icaoInput.value.trim();

    if (code) {
      const ap = lookupAirport(code);
      if (!ap) {
        this.showError(`Unknown airport code: ${code.toUpperCase()}`);
        return null;
      }
      const headingDeg =
        parseFloat((this.element.querySelector('#spawn-hdg') as HTMLInputElement).value) || 0;
      const aircraftId =
        (this.element.querySelector('#spawn-aircraft') as HTMLSelectElement).value || 'cessna172';
      return {
        lat: ap.lat,
        lon: ap.lon,
        altM: ap.elevM + 3,
        headingDeg,
        label: `${ap.name}${ap.city ? `, ${ap.city}` : ''}`,
        aircraftId,
        weightProfileId: this.readWeightProfileId(aircraftId),
      };
    }

    const latRaw = (this.element.querySelector('#spawn-lat') as HTMLInputElement).value;
    const lonRaw = (this.element.querySelector('#spawn-lon') as HTMLInputElement).value;
    const lat = parseCoordinate(latRaw, 'lat');
    const lon = parseCoordinate(lonRaw, 'lon');
    const headingDeg =
      parseFloat((this.element.querySelector('#spawn-hdg') as HTMLInputElement).value) || 0;
    const aircraftId =
      (this.element.querySelector('#spawn-aircraft') as HTMLSelectElement).value || 'cessna172';
    const label =
      (this.element.querySelector('#spawn-search') as HTMLInputElement).value ||
      (lat != null && lon != null
        ? `${lat.toFixed(4)}, ${lon.toFixed(4)}`
        : `${latRaw}, ${lonRaw}`);

    if (lat == null) {
      this.showError('Enter a valid latitude (decimal or DMS, e.g. 33°15\'20.6"S).');
      return null;
    }
    if (lon == null) {
      this.showError('Enter a valid longitude (decimal or DMS, e.g. 151°25\'54.6"E).');
      return null;
    }

    this.clearError();
    const ap = airportList.find(
      (a) => Math.abs(a.lat - lat) < 0.01 && Math.abs(a.lon - lon) < 0.01,
    );
    const altM = (ap?.elevM ?? 0) + 3;

    return {
      lat,
      lon,
      altM,
      headingDeg,
      label,
      aircraftId,
      weightProfileId: this.readWeightProfileId(aircraftId),
    };
  }

  private async submit(): Promise<void> {
    const req = this.resolveSpawn();
    if (!req) return;
    this.onSpawn?.(req);
  }
}
