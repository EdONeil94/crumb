import { colors } from '@/theme/colors';

describe('theme', () => {
  it('matches the web palette anchors', () => {
    expect(colors.parchment).toBe('#F5ECD7');
    expect(colors.espresso).toBe('#2C1810');
    expect(colors.honey).toBe('#D4A574');
  });
});
