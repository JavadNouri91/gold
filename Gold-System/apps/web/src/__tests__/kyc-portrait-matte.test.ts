import { applyPortraitMatte, assessPortraitMatte, type Raster } from '@/lib/kyc-portrait-matte';

function raster(width: number, height: number, paint: (x: number, y: number) => [number, number, number]): Raster {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

describe('portrait background matte', () => {
  it('clears a uniform studio background and keeps the centered subject', () => {
    const source = raster(80, 100, (x, y) => {
      const inSubject = x >= 24 && x <= 55 && y >= 18 && y <= 78;
      return inSubject ? [40, 28, 22] : [248, 248, 248];
    });
    const result = applyPortraitMatte(source);
    const center = ((50 * 80 + 40) * 4) + 3;
    const corner = 3;
    expect(result.data[center]).toBeGreaterThan(200);
    expect(result.data[corner]).toBeLessThan(40);
  });

  it('keeps the original image when there is no isolatable background', () => {
    const source = raster(48, 48, (x, y) => [
      (x * 37 + y * 11) % 255,
      (x * 19 + y * 29) % 255,
      (x * y) % 255,
    ]);
    expect(() => applyPortraitMatte(source)).toThrow(/بدون تغییر ماند/);
  });

  it('rejects a matte that would erase the face region', () => {
    const empty = new Uint8Array(40 * 50);
    const quality = assessPortraitMatte(empty, 40, 50);
    expect(quality.ok).toBe(false);
  });
});
