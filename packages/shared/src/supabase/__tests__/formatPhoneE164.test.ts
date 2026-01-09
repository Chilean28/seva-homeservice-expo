import { formatPhoneE164 } from '../auth';

describe('formatPhoneE164', () => {
  describe('Bug Fix: Properly clean formatted numbers starting with +', () => {
    it('should clean dashes from numbers starting with +', () => {
      expect(formatPhoneE164('+1-333-444-5555')).toBe('+13334445555');
    });

    it('should clean spaces from numbers starting with +', () => {
      expect(formatPhoneE164('+1 333 444 5555')).toBe('+13334445555');
    });

    it('should clean parentheses from numbers starting with +', () => {
      expect(formatPhoneE164('+1 (333) 444-5555')).toBe('+13334445555');
    });

    it('should handle international numbers with formatting', () => {
      expect(formatPhoneE164('+63-917-123-4567')).toBe('+639171234567');
      expect(formatPhoneE164('+44 7911 123456')).toBe('+447911123456');
    });
  });

  describe('Original functionality: Format unformatted numbers', () => {
    it('should add +1 to 10-digit US numbers', () => {
      expect(formatPhoneE164('3334445555')).toBe('+13334445555');
    });

    it('should add + to 11-digit numbers starting with 1', () => {
      expect(formatPhoneE164('13334445555')).toBe('+13334445555');
    });

    it('should handle formatted US numbers without +', () => {
      expect(formatPhoneE164('(333) 444-5555')).toBe('+13334445555');
      expect(formatPhoneE164('333-444-5555')).toBe('+13334445555');
    });

    it('should preserve already clean E.164 numbers', () => {
      expect(formatPhoneE164('+13334445555')).toBe('+13334445555');
      expect(formatPhoneE164('+639171234567')).toBe('+639171234567');
    });
  });

  describe('Edge cases', () => {
    it('should handle numbers with extra whitespace', () => {
      expect(formatPhoneE164('  +1 333 444 5555  ')).toBe('+13334445555');
    });

    it('should handle mixed formatting', () => {
      expect(formatPhoneE164('+1-(333).444.5555')).toBe('+13334445555');
    });
  });
});

