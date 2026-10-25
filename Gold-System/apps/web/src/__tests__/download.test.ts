import { saveBlob } from '@/lib/download';

describe('saveBlob', () => {
  let createObjectURL: jest.Mock;
  let revokeObjectURL: jest.Mock;
  let clickSpy: jest.SpyInstance;

  beforeEach(() => {
    createObjectURL = jest.fn(() => 'blob:mock-url');
    revokeObjectURL = jest.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      writable: true,
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      writable: true,
      configurable: true,
      value: revokeObjectURL,
    });
    clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  afterEach(() => {
    clickSpy.mockRestore();
  });

  it('creates an anchor with the requested download filename and clicks it', () => {
    const blob = new Blob(['{"ok":true}'], { type: 'application/json' });
    saveBlob(blob, 'QT-1-v1.json');

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('QT-1-v1.json');
    expect(anchor.href).toBe('blob:mock-url');
  });

  it('is a no-op when object URLs are unsupported', () => {
    const original = URL.createObjectURL;
    // @ts-expect-error simulate environments without createObjectURL
    URL.createObjectURL = undefined;
    expect(() => saveBlob(new Blob(['x']), 'x.txt')).not.toThrow();
    URL.createObjectURL = original;
    expect(clickSpy).not.toHaveBeenCalled();
  });
});
