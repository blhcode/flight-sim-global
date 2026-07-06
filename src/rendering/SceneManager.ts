import * as THREE from 'three';
import type { QualityPreset } from '../app/config.ts';
import { qualitySettings } from '../app/config.ts';
import { setTileAnisotropy } from '../world/configureTileRendering.ts';

export class SceneManager {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.5, 500_000);
  readonly renderer: THREE.WebGLRenderer;
  readonly sun = new THREE.DirectionalLight(0xffffff, 2.2);
  readonly ambient = new THREE.AmbientLight(0xb8c8e8, 0.45);

  private resizeObserver?: ResizeObserver;

  constructor(canvas: HTMLCanvasElement, quality: QualityPreset) {
    const settings = qualitySettings(quality);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: quality !== 'low',
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 2 : 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = settings.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    setTileAnisotropy(this.renderer);

    this.sun.position.set(80_000, 120_000, 40_000);
    this.sun.castShadow = settings.shadows;
    if (settings.shadows) {
      this.sun.shadow.mapSize.set(2048, 2048);
      this.sun.shadow.camera.near = 1;
      this.sun.shadow.camera.far = 500_000;
      this.sun.shadow.camera.left = -200;
      this.sun.shadow.camera.right = 200;
      this.sun.shadow.camera.top = 200;
      this.sun.shadow.camera.bottom = -200;
    }

    this.scene.add(this.ambient, this.sun);
    this.scene.background = null;
    this.camera.position.set(0, 500, 800);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
  }

  resize(): void {
    const parent = this.renderer.domElement.parentElement;
    const w = parent?.clientWidth ?? window.innerWidth;
    const h = parent?.clientHeight ?? window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.resizeObserver?.disconnect();
    this.renderer.dispose();
  }
}
