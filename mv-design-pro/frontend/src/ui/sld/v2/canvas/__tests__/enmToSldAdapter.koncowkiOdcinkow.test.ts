/**
 * KARTA PARTIA-6-FRONT (znalezisko uboczne) — współrzędne wiązań końcówek odcinków pochodzą
 * ze ścieżki TEGO odcinka w ciągu, który go niesie, nigdy z cudzego ciągu.
 *
 * Defekt: `findSegmentEndpointPoint` przy braku ścieżki odcinka w danym ciągu brał ścieżkę
 * całego PIERWSZEGO ciągu z niepustą ścieżką, więc każdy odcinek spoza pierwszego ciągu
 * dostawał jego końce (sieć referencyjna: 108 ze 176 współrzędnych). Iloczyn cech na danych
 * sieci referencyjnej: {odcinek w pierwszym ciągu / w dalszym ciągu} × {koniec A / B}
 * (wszystkie ciągi adaptera niosą dziś ścieżki odcinków — gałąź „ciąg bez ścieżek odcinków"
 * reguły jest zachowana dla ciągów deklarujących wyłącznie `segmentRefs`).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSldDataFromSnapshot } from '../enmToSldAdapter';

const here = dirname(fileURLToPath(import.meta.url));
const enm = (
  JSON.parse(
    readFileSync(resolve(here, '..', '..', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json'), 'utf8'),
  ) as { enm: EnergyNetworkModel }
).enm;

describe('wiązania końcówek odcinków — punkt ze ścieżki ciągu, który niesie odcinek', () => {
  const dane = buildSldDataFromSnapshot(enm);
  const ciagi = dane.cableRuns;
  const wiazania = dane.terminalBindings.filter((b) => b.id.endsWith(':A') || b.id.endsWith(':B'));

  it('sieć referencyjna ma odcinki w pierwszym i w dalszych ciągach (iloczyn niepusty)', () => {
    const wPierwszym = new Set((ciagi[0].segmentPaths ?? []).map((p) => p.segmentRef));
    expect(wiazania.some((b) => wPierwszym.has(b.elementRef))).toBe(true);
    expect(wiazania.some((b) => !wPierwszym.has(b.elementRef))).toBe(true);
    expect(ciagi.length).toBeGreaterThan(1);
  });

  it.each(['A', 'B'] as const)('koniec %s KAŻDEGO odcinka = koniec jego ścieżki w niosącym go ciągu', (strona) => {
    let sprawdzonych = 0;
    for (const wiazanie of wiazania.filter((b) => b.id.endsWith(`:${strona}`))) {
      const ciag = ciagi.find((c) => (c.segmentPaths ?? []).some((p) => p.segmentRef === wiazanie.elementRef));
      expect(ciag, `odcinek ${wiazanie.elementRef} ma ciąg`).toBeTruthy();
      const punkty = ciag!.segmentPaths!.find((p) => p.segmentRef === wiazanie.elementRef)!.pathPoints;
      const oczekiwany = strona === 'A' ? punkty[0] : punkty[punkty.length - 1];
      expect({ x: wiazanie.x, y: wiazanie.y }, wiazanie.id).toEqual({ x: oczekiwany.x, y: oczekiwany.y });
      sprawdzonych += 1;
    }
    expect(sprawdzonych).toBeGreaterThanOrEqual(80);
  });
});
