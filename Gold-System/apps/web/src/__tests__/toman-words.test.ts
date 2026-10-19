import { tomanAmountToPersianWords, tomanAmountWordsLabel } from '@/lib/toman-words';

describe('tomanAmountToPersianWords', () => {
  it('converts common deposit amounts', () => {
    expect(tomanAmountToPersianWords('100000000')).toBe('صد میلیون');
    expect(tomanAmountToPersianWords('1000000')).toBe('یک میلیون');
    expect(tomanAmountToPersianWords('125000')).toBe('صد و بیست و پنج هزار');
    expect(tomanAmountToPersianWords('0')).toBe('صفر');
    expect(tomanAmountToPersianWords('')).toBe('');
  });

  it('builds the UI label', () => {
    expect(tomanAmountWordsLabel('100000000')).toBe('معادل: صد میلیون تومان');
    expect(tomanAmountWordsLabel('')).toBeNull();
  });
});
