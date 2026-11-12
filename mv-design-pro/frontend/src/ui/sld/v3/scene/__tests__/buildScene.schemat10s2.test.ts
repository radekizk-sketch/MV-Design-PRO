// @vitest-environment node
/**
 * SLD V3 — WYROCZNIE SCHEMAT-10 S2 (V12K-135; audyt
 * `docs/sld/AUDYT_SCHEMATOW_OD_ZERA_2026-07.md` §1 D2/D4/D5 + §3 wiersz
 * „Etykiety"). BRAMKA FAZY S2, zostaje w suicie na zawsze:
 *
 *  - D2 zero-kolizji: `noLabelCollisions` (tekst↔tekst i tekst↔symbol,
 *    tolerancja 0) na sieci referencyjnej 52+ stacji, wszystkie LOD.
 *  - D4 słownik PL: `noRawEnumTokensInLabels` — zero surowych enumów
 *    (`OVERHEAD`/…) w treści etykiet.
 *  - D5 manhattanizacja: `allSegmentsOrthogonal` — zero ukośnych odcinków.
 *
 * Testy NEGATYWNE (kontrola, że wyrocznia FAKTYCZNIE łapie): syntetyczna scena
 * z surowym enumem / ukośnym odcinkiem / nachodzącymi etykietami MUSI oblać
 * odpowiednią wyrocznię (inaczej byłaby martwa).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import {
  buildSceneV3,
  labelCollisions,
  noLabelCollisions,
  noRawEnumTokensInLabels,
  rawEnumTokenLabels,
  allSegmentsOrthogonal,
  nonOrthogonalSegmentIndices,
  type SceneV3,
} from '../buildScene';
import { LABEL_ROLE_BY_OWNER_KIND } from '../../layout/labels';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  'v2',
  'geometry',
  '__tests__',
  'fixtures',
  'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;


describe('SCHEMAT-10 S2 — wyrocznia ZERO-KOLIZJI (D2, sieć 52+ stacji)', () => {
  it(`zero kolizji etykieta↔etykieta i etykieta↔symbol`, () => {
    const scene = buildSceneV3(enm);
    const cols = labelCollisions(scene);
    // Diagnostyka czytelna przy regresji (pierwsze 5 par).
    expect(cols.slice(0, 5), JSON.stringify(cols.slice(0, 5))).toEqual([]);
    expect(noLabelCollisions(scene)).toBe(true);
  });
});

describe('SCHEMAT-10 S2 — słownik PL enumów (D4, brak surowych enumów)', () => {
  it(`zero surowych enumów (OVERHEAD/…) w treści etykiet`, () => {
    const scene = buildSceneV3(enm);
    expect(rawEnumTokenLabels(scene).map((l) => l.text)).toEqual([]);
    expect(noRawEnumTokensInLabels(scene)).toBe(true);
  });
});

describe('SCHEMAT-10 S2 — manhattanizacja (D5, zero ukośnych odcinków)', () => {
  it(`wszystkie segmenty ortogonalne`, () => {
    const scene = buildSceneV3(enm);
    expect(nonOrthogonalSegmentIndices(scene)).toEqual([]);
    expect(allSegmentsOrthogonal(scene)).toBe(true);
  });
});

describe('SCHEMAT-10 S2 — kontrola negatywna (wyrocznie nie są martwe)', () => {
  it('surowy enum w treści etykiety OBLEWA D4', () => {
    const scene: SceneV3 = {
      symbols: [],
      segments: [],
      labels: [
        {
          ownerRef: 'x',
          ownerKind: 'segment-span',
          labelClass: 't2',
          labelRole: LABEL_ROLE_BY_OWNER_KIND['segment-span'],
          text: 'OVERHEAD Al 70 mm²',
          slotIndex: 1,
          rect: { x: 0, y: 0, width: 40, height: 16 },
        },
      ],
      junctions: [],
      crossings: [],
      bbox: { x: 0, y: 0, width: 0, height: 0 },
      meta: buildSceneV3(enm).meta,
    };
    expect(noRawEnumTokensInLabels(scene)).toBe(false);
  });

  it('ukośny odcinek OBLEWA D5', () => {
    const base = buildSceneV3(enm);
    const scene: SceneV3 = {
      ...base,
      segments: [{ points: [{ x: 0, y: 0 }, { x: 40, y: 40 }] }],
    };
    expect(allSegmentsOrthogonal(scene)).toBe(false);
  });

  it('nachodzące etykiety OBLEWAJĄ D2', () => {
    const base = buildSceneV3(enm);
    const scene: SceneV3 = {
      ...base,
      symbols: [],
      labels: [
        { ownerRef: 'a', ownerKind: 'der', labelClass: 't2', labelRole: LABEL_ROLE_BY_OWNER_KIND.der, text: 'A', slotIndex: 1, rect: { x: 0, y: 0, width: 40, height: 16 } },
        { ownerRef: 'b', ownerKind: 'der', labelClass: 't2', labelRole: LABEL_ROLE_BY_OWNER_KIND.der, text: 'B', slotIndex: 1, rect: { x: 10, y: 4, width: 40, height: 16 } },
      ],
    };
    expect(noLabelCollisions(scene)).toBe(false);
  });
});

// Reguła D3 (pełne podpisy przęseł tylko na poziomie pełnego szczegółu) przeszła z SCENY do
// GĘSTOŚCI INFORMACJI kanwy: jedna scena (karta SLD-SKALA-I-NAWIGACJA R1/R3) niesie podpis każdego
// przęsła zawsze, a kanwa rysuje go wtedy, gdy jego pismo jest czytelne na ekranie
// (`canvas/gestoscInformacji.ts`). Dawne przypadki „L0/L1: zero podpisów przęseł" przypinały
// zależność sceny od poziomu — tej już nie ma.
describe('SCHEMAT-10 S2 — podpisy przęseł w jednej scenie', () => {
  const spanCount = (scene: SceneV3): number =>
    scene.labels.filter((l) => l.ownerKind === 'segment-span' || l.ownerKind === 'segment-lateral').length;

  it('pełne podpisy per przęsło OBECNE w scenie', () => {
    expect(spanCount(buildSceneV3(enm))).toBeGreaterThan(0);
  });
});

describe('SCHEMAT-10 S2 — silnik declutter jest TOŻSAMOŚCIĄ na czystej fixturze', () => {
  it(`brak notatki label.declutter (0 odrzuconych)`, () => {
    const scene = buildSceneV3(enm);
    const declutterNotes = scene.meta.stopNotes.filter((n) => n.startsWith('label.declutter'));
    expect(declutterNotes).toEqual([]);
  });
});
