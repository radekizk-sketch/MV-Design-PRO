/**
 * Karta GPZ-H5-SLD etap 2 — pasmo oznaczenia pola GPZ jest OBRYSEM swojej etykiety
 * w świecie kompozycji (predykat parami: etykieta `#designation` i pasmo
 * `pasmaOznaczenPol` przesuwane razem).
 *
 * Przyczyna (pomiar 2026-10-22, sonda kompozycji sieci referencyjnej): translacja końcowa
 * kompozycji (`translateGpzComposition`, rama strefy ponad treścią) przesuwała etykietę
 * oznaczenia, ale nie pasmo — pasmo „Pole liniowe GPZ 1.1" leżało 40 j.św. WYŻEJ niż jego
 * napis (y 232 zamiast 272, nad szyną SN 256), więc objazd tras i odsuwanie podpisów
 * omijały miejsce, w którym napisu nie było, a tam, gdzie był, nie widziały przeszkody.
 *
 * Iloczyn cech: sieć {H5 2×2, sieć referencyjna z rekordami aparatów} × origin
 * {(0, 0) — translacja końcowa > 0, (0, 400), (160, 96)}. Wyrocznia: liczba pasm = liczba
 * obróconych etykiet `#designation` pól sekcji; prostokąt rozwiązanej etykiety (`resolveLabels`) leży
 * w całości w swoim paśmie; pasmo zaczyna się pod szyną swojej sekcji.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildCanonicalGpzProps } from '../../../v2/canvas/enmToCanonicalGpzAdapter';
import { resolveLabels } from '../../layout/labels';
import { zRekordamiAparatowPol } from '../../scene/__tests__/fixtures/rekordyAparatowPola';
import { composeGpz } from '../gpz';

const SCENA = resolve(__dirname, '..', '..', 'scene', '__tests__', 'fixtures');
const SIECI: Readonly<Record<string, string>> = {
  gpzH5_2x2: resolve(SCENA, 'gpzH5_2x2.enm.json'),
  sldSubstrate52s: resolve(__dirname, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json'),
};
const ORIGINY = [
  { x: 0, y: 0 },
  { x: 0, y: 400 },
  { x: 160, y: 96 },
] as const;

function wczytaj(sciezka: string): EnergyNetworkModel {
  return zRekordamiAparatowPol((JSON.parse(readFileSync(sciezka, 'utf8')) as { enm: EnergyNetworkModel }).enm);
}

describe('pasmo oznaczenia pola GPZ = obrys etykiety (iloczyn sieć × origin)', () => {
  for (const [nazwa, sciezka] of Object.entries(SIECI)) {
    const enm = wczytaj(sciezka);
    const gpz = (enm.substations ?? []).find((s) => (s.gpz_sections ?? []).length > 0)!;
    for (const origin of ORIGINY) {
      it(`${nazwa} · origin (${origin.x}, ${origin.y})`, () => {
        const props = buildCanonicalGpzProps(enm, gpz.ref_id);
        expect(props).not.toBeNull();
        const c = composeGpz(props!, origin, [], 'full');
        // Pasmo niesie oznaczenie POLA SEKCJI (napis obrócony wzdłuż toru); łączniki szyn,
        // pola 110 kV i tor TR mają oznaczenia poziome bez pasma.
        const oznaczenia = c.labels.fieldDesignations.filter(
          (l) => l.ownerRef.endsWith('#designation') && l.pasmoObrocone !== undefined,
        );
        expect(oznaczenia.length, 'kompozycja ma oznaczenia pól').toBeGreaterThan(0);
        expect(c.pasmaOznaczenPol).toHaveLength(oznaczenia.length);
        const rozwiazane = resolveLabels({ simpleAnchored: oznaczenia });
        const szyny = c.segments.filter((s) => s.ownerRef.endsWith('#bus-primary'));
        rozwiazane.forEach((etykieta, i) => {
          const pasmo = c.pasmaOznaczenPol[i];
          const r = etykieta.rect;
          expect(r.x, `${etykieta.text}: lewa krawędź w paśmie`).toBeGreaterThanOrEqual(pasmo.x);
          expect(r.x + r.width, `${etykieta.text}: prawa krawędź w paśmie`).toBeLessThanOrEqual(pasmo.x + pasmo.width);
          expect(r.y, `${etykieta.text}: góra w paśmie`).toBeGreaterThanOrEqual(pasmo.y);
          expect(r.y + r.height, `${etykieta.text}: dół w paśmie`).toBeLessThanOrEqual(pasmo.y + pasmo.height);
          const szynaNad = szyny.find((s) => {
            const [a, b] = [s.points[0], s.points[s.points.length - 1]];
            return a.y === b.y && Math.min(a.x, b.x) <= pasmo.x + pasmo.width && Math.max(a.x, b.x) >= pasmo.x;
          });
          expect(szynaNad, `${etykieta.text}: pasmo pod szyną sekcji`).toBeDefined();
          expect(pasmo.y, `${etykieta.text}: pasmo zaczyna się pod szyną`).toBeGreaterThan(szynaNad!.points[0].y);
        });
      });
    }
  }
});
