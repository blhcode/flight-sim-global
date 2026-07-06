export class LoadingScreen {
  private readonly el: HTMLElement;

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'loading-screen';
    this.el.innerHTML = `
      <div class="loading-card">
        <h1>Flight Sim Global</h1>
        <p class="loading-message">Loading…</p>
        <div class="loading-bar"><div class="loading-bar-fill"></div></div>
      </div>
    `;
    container.appendChild(this.el);
  }

  setMessage(msg: string): void {
    const p = this.el.querySelector('.loading-message');
    if (p) p.textContent = msg;
  }

  setProgress(p: number): void {
    const fill = this.el.querySelector('.loading-bar-fill') as HTMLElement | null;
    if (fill) fill.style.width = `${Math.round(p * 100)}%`;
  }

  hide(): void {
    this.el.classList.add('hidden');
    setTimeout(() => this.el.remove(), 400);
  }

  show(): void {
    this.el.classList.remove('hidden');
    if (!this.el.parentElement) {
      document.querySelector('.game-root')?.appendChild(this.el);
    }
  }
}
