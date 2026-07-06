/** Light CPU sharpen for satellite tiles (no upscale — keeps loading fast). */
export function sharpenImageData(
  image: ImageData,
  amount = 0.3,
  contrast = 1.06,
): ImageData {
  const { width, height, data: px } = image;
  const src = new Uint8ClampedArray(px);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const ci = i + c;
        const center = src[ci];
        const blur =
          (src[ci - 4] + src[ci + 4] + src[ci - width * 4] + src[ci + width * 4]) *
          0.25;
        let v = center + amount * (center - blur);
        v = (v - 128) * contrast + 128;
        px[ci] = Math.max(0, Math.min(255, v));
      }
    }
  }
  return image;
}

/** Mild sharpen pass on loaded tiles. */
export function enhanceTileBitmap(
  source: CanvasImageSource,
  width: number,
  height: number,
  tileZoom: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  ctx.drawImage(source, 0, 0, width, height);
  if (tileZoom >= 14) {
    const imageData = ctx.getImageData(0, 0, width, height);
    sharpenImageData(imageData, 0.28);
    ctx.putImageData(imageData, 0, 0);
  }
  return canvas;
}
