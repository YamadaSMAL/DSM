import { expect, it } from 'vitest';
import { cellText } from '../../src/ui/MatrixCanvas';
it('セル表示で桁や指数を落とさない', () => {
  expect(cellText(0)).toBe('0'); expect(cellText(0.5)).toBe('0.5'); expect(cellText(1234567)).toBe('1234567');
  expect(cellText(12345678)).toBe('1.2e7'); expect(cellText(1.2345e-7)).toBe('1.2e-7'); expect(cellText(1e300)).toBe('1e+300'); expect(cellText(1.5e300)).toBe('1.5e300');
  expect(cellText(0.123456789)).toBe('0.12346'); expect(cellText(123456.789)).toBe('123460');
});
