import { safeFileName, inlineDisposition, attachmentDisposition } from './file-disposition';

describe('file-disposition', () => {
  it('keeps a normal filename intact', () => {
    expect(safeFileName('id_front.jpg')).toBe('id_front.jpg');
  });

  it('strips path segments and backslashes', () => {
    expect(safeFileName('..\\..\\etc\\passwd')).toBe('passwd');
    expect(safeFileName('a/b/c.png')).toBe('c.png');
    expect(safeFileName('a\\b\\c.png')).toBe('c.png');
  });

  it('strips control characters, quotes and unsafe characters', () => {
    expect(safeFileName('a"b:c*d?.png')).toBe('abcd.png');
    expect(safeFileName('x\u0000y.png')).toBe('xy.png');
  });

  it('falls back when the result is empty or only dots', () => {
    expect(safeFileName('')).toBe('file');
    expect(safeFileName(null)).toBe('file');
    expect(safeFileName('..')).toBe('file');
    expect(safeFileName('...')).toBe('file');
    expect(safeFileName('///')).toBe('file');
  });

  it('produces an inline disposition', () => {
    expect(inlineDisposition('document.jpg')).toBe('inline; filename="document.jpg"');
  });

  it('produces an attachment disposition with a UTF-8 fallback for Persian names', () => {
    const value = attachmentDisposition('پیش‌فاکتور.pdf');
    expect(value.startsWith('attachment; filename=')).toBe(true);
    expect(value).toContain("filename*=UTF-8''");
  });
});
