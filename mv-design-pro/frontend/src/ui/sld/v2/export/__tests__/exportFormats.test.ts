/**
 * Generator DXF (`exportDxf.ts`) — jedyny żywy generator z `v2/export/`
 * (woła go `v3/export/exportDxfV3.ts`).
 *
 * Karta KASACJA-SCL-I-CIM-KLIENT (decyzja K-14/D-41): sekcje
 * generatorów SCL/SCD i CIM usunięte razem z klientowymi eksporterami
 * modelu sieci. Intencja (plik modelu sieci deterministyczny, z
 * parametrami modelu, bez pustych referencji) jest przypięta po stronie
 * JEDYNEGO eksportu modelu — backendowego CGMES (`backend/tests/cgmes/`,
 * `backend/tests/api/test_enm_eksport_cgmes.py`).
 */
import { describe, expect, it } from 'vitest';
import { generateDxf } from '../exportDxf';

describe('generateDxf', () => {
  it('generuje pusty DXF gdy brak entities', () => {
    const dxf = generateDxf({ title: 'Test', lines: [], texts: [] });
    expect(dxf).toContain('SECTION');
    expect(dxf).toContain('HEADER');
    expect(dxf).toContain('ENTITIES');
    expect(dxf).toContain('EOF');
  });

  it('zawiera AutoCAD 2010 (AC1024) marker', () => {
    const dxf = generateDxf({ title: 'Test', lines: [], texts: [] });
    expect(dxf).toContain('AC1024');
  });

  it('LINE entities z X/Y koordynatami (Y odwrócone dla DXF)', () => {
    const dxf = generateDxf({
      title: 'Test',
      lines: [{ x1: 0, y1: 100, x2: 200, y2: 100 }],
      texts: [],
    });
    expect(dxf).toContain('LINE');
    expect(dxf).toMatch(/0\n[^]+?20\n-100/);
  });

  it('TEXT entities z opisem', () => {
    const dxf = generateDxf({
      title: 'Test',
      lines: [],
      texts: [{ x: 50, y: 50, text: 'GPZ' }],
    });
    expect(dxf).toContain('TEXT');
    expect(dxf).toContain('GPZ');
  });
});
