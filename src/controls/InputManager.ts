const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE',
  'KeyF', 'KeyG', 'KeyB', 'KeyC', 'KeyT', 'KeyM',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
  'Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract',
]);

/** Ctrl/Meta combos that match browser shortcuts and overlap with flight keys */
const MODIFIER_BROWSER_SHORTCUTS = new Set([
  'KeyW', // close tab
  'KeyT', // new tab
  'KeyN', // new window
  'KeyR', // reload
  'KeyP', // print
  'KeyS', // save page
  'KeyF', // find
  'KeyL', // location bar
  'KeyH', // history
  'KeyJ', // downloads
  'KeyK', // search bar
  'Tab',
]);

function isModifierBrowserShortcut(e: KeyboardEvent): boolean {
  return (e.ctrlKey || e.metaKey) && MODIFIER_BROWSER_SHORTCUTS.has(e.code);
}

export class InputManager {
  private readonly keys = new Set<string>();
  private readonly pressedThisFrame = new Set<string>();
  private flying = false;
  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', 'Flight simulator view');

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typingInField =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;
      if (typingInField) return;

      if (this.flying) {
        if (isModifierBrowserShortcut(e) || GAME_KEYS.has(e.code)) {
          e.preventDefault();
          e.stopPropagation();
        }
      }

      if (!GAME_KEYS.has(e.code)) return;
      if (!this.keys.has(e.code)) {
        this.pressedThisFrame.add(e.code);
      }
      this.keys.add(e.code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      this.keys.delete(e.code);
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', () => this.clear());

    this.canvas.addEventListener('pointerdown', () => this.focus());
  }

  setFlying(on: boolean): void {
    this.flying = on;
    if (on) {
      this.focus();
    } else {
      this.clear();
    }
  }

  focus(): void {
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.canvas.focus({ preventScroll: true });
  }

  clear(): void {
    this.keys.clear();
    this.pressedThisFrame.clear();
  }

  endFrame(): void {
    this.pressedThisFrame.clear();
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressedThisFrame.has(code);
  }
}
