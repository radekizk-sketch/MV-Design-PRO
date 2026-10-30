/**
 * TOŻSAMOŚĆ APARATU POLA — od symbolu sceny do refu operacji.
 *
 * Dawna ścieżka „Wyprowadź ciąg główny z głowicy" czekała na identyfikator `…#cable_head`,
 * którego kanwa v3 nigdy nie emitowała (scena rysuje głowicę jako `SymbolId` `cableHead`,
 * a meta symbolu niesie ref POLA). Ten kontrakt składa wejście tematu DOKŁADNIE tak, jak
 * robi to render (`SldCanvasV3.klikMeta` + klasa trafienia z `buildCanvasHitAreas`) na
 * sieciach referencyjnych × LOD i pilnuje, że:
 *  A. każdy symbol rozstrzygnięty na kotwicę `pole` daje ref operacji, którego JEDYNY parser
 *     (`rozbierzIdentyfikatorAparatu`) oddaje ⟨ref pola, SymbolId tego symbolu⟩;
 *  B. temat innej kotwicy nigdy nie niesie rodzaju aparatu (ref operacji = ref modelu);
 *  C. głowica kablowa jest na scenie wtedy i tylko wtedy, gdy pole niesie jej rekord, i każda
 *     rozstrzyga się na pole (scena z generatora backendu ma takie rekordy — zapadka na pusty
 *     zbiór).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, type SceneLod } from '../../scene/buildScene';
import { buildCanvasHitAreas } from '../hitAreas';
import {
  buildCanvasModelIndex,
  refOperacjiTematu,
  resolveCanvasMenuSubject,
} from '../canvasMenuSubject';
import { rozbierzIdentyfikatorAparatu } from '../../../shared/identyfikatorAparatu';

const here = dirname(fileURLToPath(import.meta.url));
function loadEnm(relative: string): EnergyNetworkModel {
  return (JSON.parse(readFileSync(resolve(here, relative), 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;
}

/** Scena głowicy kablowej z generatora backendu: pola liniowe GPZ wyposażone operacją
 *  `set_bay_equipment` z szablonu pola odpływowego (`glowice_kablowe_pol_gpz`). */
const GLOWICE = (
  JSON.parse(
    readFileSync(
      resolve(here, '../../../../../harness-fixtures/generated/glowice_kablowe_pol_gpz.json'),
      'utf8',
    ),
  ) as { readonly snapshot: EnergyNetworkModel }
).snapshot;

/** Liczba rekordów głowicy kablowej w polach modelu (`primary_devices`, `CABLE_HEAD`). */
function rekordyGlowic(enm: EnergyNetworkModel): number {
  return (enm.bays ?? []).reduce(
    (suma, pole) => suma + (pole.primary_devices ?? []).filter((d) => d.kind === 'CABLE_HEAD').length,
    0,
  );
}

const SIECI: readonly { readonly nazwa: string; readonly enm: EnergyNetworkModel }[] = [
  { nazwa: 'sldSubstrate52s', enm: loadEnm('../../../v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json') },
  { nazwa: 'gpzFeeder', enm: loadEnm('../../scene/__tests__/fixtures/gpzFeeder.enm.json') },
  { nazwa: 'glowiceKablowePolGpz', enm: GLOWICE },
];
const LODY: readonly SceneLod[] = [0, 1, 2];

interface Trafienie {
  readonly symbolId: string;
  readonly ownerRef: string;
  readonly kotwica: string | null;
  readonly refOperacji: string | null;
  readonly modelRef: string | null;
  readonly symbolAparatu: string | undefined;
}

function trafieniaSymboli(enm: EnergyNetworkModel, lod: SceneLod): readonly Trafienie[] {
  const scene = buildSceneV3(enm, lod);
  const index = buildCanvasModelIndex(enm);
  // Klasa trafienia — ta sama, którą render wpisuje w `data-hit-klasa`.
  const klasy = new Map(
    buildCanvasHitAreas({ symbols: scene.symbols, segments: [], labels: [], resultMarkers: [], scale: 1 }).map(
      (a) => [a.testId, a.klasa] as const,
    ),
  );
  return scene.symbols.flatMap((symbol, i) => {
    const ownerRef = symbol.meta?.ownerRef;
    if (!ownerRef) return [];
    const wynik = resolveCanvasMenuSubject(
      {
        klasa: klasy.get(symbol.meta?.testId ?? `sld-v3-symbol-${i}`),
        ownerRef,
        elementKind: symbol.meta?.elementKind,
        derKind: symbol.meta?.derKind,
        symbolId: symbol.symbolId,
      },
      index,
    );
    if (wynik.stan !== 'temat') {
      return [{ symbolId: symbol.symbolId, ownerRef, kotwica: null, refOperacji: null, modelRef: null, symbolAparatu: undefined }];
    }
    return [
      {
        symbolId: symbol.symbolId,
        ownerRef,
        kotwica: wynik.temat.kotwica,
        refOperacji: refOperacjiTematu(wynik.temat),
        modelRef: wynik.temat.modelRef,
        symbolAparatu: wynik.temat.symbolAparatu,
      },
    ];
  });
}

describe('tożsamość aparatu pola — scena → temat → ref operacji', () => {
  for (const { nazwa, enm } of SIECI) {
    for (const lod of LODY) {
      it(`${nazwa} LOD ${lod}: A — aparat pola wraca z refu operacji jako ⟨pole, SymbolId⟩`, () => {
        const pola = trafieniaSymboli(enm, lod).filter((t) => t.kotwica === 'pole');
        for (const t of pola) {
          expect(t.symbolAparatu).toBe(t.symbolId);
          expect(rozbierzIdentyfikatorAparatu(t.refOperacji)).toEqual({ bayRef: t.modelRef, symbolId: t.symbolId });
        }
      });

      it(`${nazwa} LOD ${lod}: B — temat poza polem nie niesie rodzaju aparatu`, () => {
        const inne = trafieniaSymboli(enm, lod).filter((t) => t.kotwica !== null && t.kotwica !== 'pole');
        for (const t of inne) {
          expect(t.symbolAparatu).toBeUndefined();
          expect(t.refOperacji).toBe(t.modelRef);
        }
      });
    }

    // Iloczyn {sieć z rekordami głowicy, sieć bez} — głowica na kanwie wyłącznie z rekordu
    // aparatu pola (GEOMETRIA-STACJI §0 pkt 4: zero symboli z domysłu gramatyki ról).
    it(`${nazwa} LOD 2: C — głowica na scenie ⇔ rekord głowicy w polu; każda kotwiczy się na polu`, () => {
      const glowice = trafieniaSymboli(enm, 2).filter((t) => t.symbolId === 'cableHead');
      expect(glowice.length > 0).toBe(rekordyGlowic(enm) > 0);
      for (const t of glowice) {
        expect(t.kotwica).toBe('pole');
        expect(rozbierzIdentyfikatorAparatu(t.refOperacji)).toEqual({ bayRef: t.modelRef, symbolId: 'cableHead' });
      }
    });
  }
});
