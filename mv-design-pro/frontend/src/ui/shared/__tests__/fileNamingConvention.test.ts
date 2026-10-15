import { describe, expect, it } from 'vitest';
import { sanitizeFilenamePart } from '../fileNamingConvention';

describe('sanitizeFilenamePart', () => {
  it('konwertuje polskie znaki', () => {
    expect(sanitizeFilenamePart('GPZ Łódź')).toBe('GPZ_Lodz');
    expect(sanitizeFilenamePart('Ąćęłńóśźż')).toBe('Acelnoszz');
  });

  it('zamienia spacje i specjalne na _', () => {
    expect(sanitizeFilenamePart('Test Project!')).toBe('Test_Project');
    expect(sanitizeFilenamePart('case 1/2/3')).toBe('case_1_2_3');
  });

  it('redukuje multiple underscores', () => {
    expect(sanitizeFilenamePart('a__b___c')).toBe('a_b_c');
  });

  it('strip leading/trailing underscores', () => {
    expect(sanitizeFilenamePart('_test_')).toBe('test');
  });

  it('limit 100 znaków', () => {
    const long = 'a'.repeat(150);
    expect(sanitizeFilenamePart(long)).toHaveLength(100);
  });
});
