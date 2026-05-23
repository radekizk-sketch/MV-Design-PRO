import { describe, expect, it } from 'vitest';
import {
  sanitizeFilenamePart,
  buildFilename,
  NAMING_PRESETS,
  isValidFilename,
} from '../fileNamingConvention';

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

describe('buildFilename', () => {
  it('full naming: project_case_profile_date.ext', () => {
    const name = buildFilename({
      projectName: 'GPZ Test',
      caseName: 'Wariant 1',
      profile: 'OSD',
      date: new Date('2026-05-23'),
      extension: 'pdf',
    });
    expect(name).toBe('GPZ_Test_Wariant_1_OSD_2026-05-23.pdf');
  });

  it('z prefiksem', () => {
    const name = buildFilename({
      prefix: 'Wniosek',
      projectName: 'GPZ',
      date: new Date('2026-05-23'),
      extension: 'pdf',
    });
    expect(name).toMatch(/^Wniosek_GPZ_2026-05-23\.pdf$/);
  });

  it('extension bez kropki też działa', () => {
    const a = buildFilename({ projectName: 'P', extension: 'pdf' });
    const b = buildFilename({ projectName: 'P', extension: '.pdf' });
    expect(a).toMatch(/\.pdf$/);
    expect(b).toMatch(/\.pdf$/);
  });

  it('default date = today', () => {
    const name = buildFilename({ projectName: 'P', extension: 'pdf' });
    expect(name).toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe('NAMING_PRESETS', () => {
  const date = new Date('2026-05-23');

  it('osd_application', () => {
    const name = NAMING_PRESETS.osd_application('GPZ Test', date);
    expect(name).toMatch(/^Wniosek_GPZ_Test_OSD_2026-05-23\.pdf$/);
  });

  it('proof_pack per format', () => {
    expect(NAMING_PRESETS.proof_pack('P', 'C', 'pdf', date)).toMatch(/\.pdf$/);
    expect(NAMING_PRESETS.proof_pack('P', 'C', 'json', date)).toMatch(/\.json$/);
    expect(NAMING_PRESETS.proof_pack('P', 'C', 'tex', date)).toMatch(/\.tex$/);
  });

  it('sld_export per format', () => {
    expect(NAMING_PRESETS.sld_export('P', 'svg', date)).toMatch(/SLD_P_SVG_.*\.svg$/);
    expect(NAMING_PRESETS.sld_export('P', 'dxf', date)).toMatch(/SLD_P_DXF_.*\.dxf$/);
    expect(NAMING_PRESETS.sld_export('P', 'scd', date)).toMatch(/SLD_P_SCD_.*\.scd$/);
  });

  it('archive_zip', () => {
    expect(NAMING_PRESETS.archive_zip('P', date)).toMatch(/Archive_P_.*\.zip$/);
  });
});

describe('isValidFilename', () => {
  it('valid simple names', () => {
    expect(isValidFilename('test.pdf')).toBe(true);
    expect(isValidFilename('GPZ_2026-05-23.json')).toBe(true);
  });

  it('invalid: spacja, special chars', () => {
    expect(isValidFilename('test file.pdf')).toBe(false);
    expect(isValidFilename('plik+specjalny.pdf')).toBe(false);
  });

  it('invalid: reserved Windows names', () => {
    expect(isValidFilename('CON.txt')).toBe(false);
    expect(isValidFilename('LPT1.pdf')).toBe(false);
    expect(isValidFilename('AUX')).toBe(false);
  });

  it('invalid: zbyt długie', () => {
    expect(isValidFilename('a'.repeat(201) + '.pdf')).toBe(false);
  });

  it('invalid: puste', () => {
    expect(isValidFilename('')).toBe(false);
  });
});
