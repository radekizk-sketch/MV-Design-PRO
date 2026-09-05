/**
 * FE-HIGIENA (karta „dwa zastane długi frontendu", 2026-09-05, część A) —
 * test przypinający dla ostrzeżenia React „Encountered two children with the
 * same key" znalezionego przy renderze warstwy odznaki SWZ na sieci
 * referencyjnej `sldSubstrate52s` (`swzBadge.test.tsx`).
 *
 * PRZYCZYNA ŹRÓDŁOWA: `ownerRef` symbolu sceny jest CELOWO tożsamością POLA
 * (bay), nie pojedynczej instancji aparatu — `scene/buildScene.ts` (komentarz
 * przy konwersji symboli stacji: „ownerRef NIEZMIENIONE, nadal bayRef,
 * nakładka energizacji kluczuje po refie POLA, nie per-aparat") i
 * analogicznie `compose/gpz.ts::buildFieldStack` (`metaExtra` niesie TEN SAM
 * `bayRef`/`transformerRef` do KAŻDEJ instancji stosu pola). Pole z DWOMA
 * aparatami (odłącznik + wyłącznik — norma, nie przypadek brzegowy) niesie
 * więc DWA symbole `elementKind==='apparatus'` o JEDNEJ tożsamości sceny —
 * ZAMIERZONE dla nakładki energizacji (`energizedByOwnerRef`), która już
 * traktuje ten współdzielony ref jako jedną jednostkę.
 * `computeSwzBadgePlacements`/`computeOltcBadgePlacements` (`SldCanvasV3.tsx`)
 * tej spójności NIE MIAŁY: iterowały `scene.symbols` i tworzyły JEDEN placement PER
 * PASUJĄCY SYMBOL, więc jeden wpis nakładki dawał dwa placementy o TEJ SAMEJ
 * tożsamości ⇒ zduplikowany klucz React. Próba naprawy „u źródła" (nadanie
 * każdej instancji stosu pola osobnego `ownerRef`, wzorem `unikalnyTestId`
 * z S9-4/S9-10) została ODRZUCONA po weryfikacji: złamałaby WŁAŚNIE
 * `energizedByOwnerRef` dla 2. i kolejnego aparatu w polu (backend wysyła
 * energizację per POLE, nie per instancję — po zmianie ownerRef 2. aparat
 * przestałby dostawać kolor). Naprawa właściwa: DEDUPLIKACJA w obu funkcjach
 * placementów — jeden wpis nakładki ⇒ najwyżej jedna odznaka (pierwsze
 * trafienie w kolejności sceny wygrywa, ta sama reguła co
 * `computeFaultPointMarkerPlacement`) — spójne z tym, jak `ownerRef` już
 * działa wszędzie indziej, zero zmiany w budowie sceny/`bayRef`/
 * `transformerRef`/energizacji.
 *
 * ILOCZYN CECH (nie przykład z karty): test nie odtwarza wąsko JEDNEGO
 * pola/refu z odbioru — buduje nakładkę SWZ/OLTC dla KAŻDEGO `ownerRef`
 * aparatu/transformatora obecnego na CAŁEJ sieci referencyjnej (52 stacje +
 * GPZ wielosekcyjny, STACJE i GPZ razem), więc DOWOLNA para symboli
 * dzieląca tożsamość w DOWOLNYM miejscu sceny zostanie złapana — nie tylko
 * ta jedna, którą ujawnił `.find()` w `swzBadge.test.tsx` (empirycznie:
 * kolizje znalezione zarówno na polu GPZ, jak i na polu SN stacji).
 *
 * WERYFIKACJA CZERWIENIENIA (wymóg karty): plik przechodzi po naprawie;
 * cofnięcie dedupu (`umieszczoneOwnerRefy`) w `computeSwzBadgePlacements`/
 * `computeOltcBadgePlacements` (`SldCanvasV3.tsx`) przywraca zarówno
 * ostrzeżenie konsoli, jak i niezgodność liczby odznak poniżej —
 * zweryfikowane lokalnie (git stash), wynik w meldunku.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3 } from '../../scene/buildScene';
import { SldCanvasV3 } from '../SldCanvasV3';
import { buildSwzOverlayFromResponses, type SldV3Overlay, type SwzApiResponse, type TransformerOltcOverlay } from '../overlay';

afterEach(() => cleanup());

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 800;

/** Wszystkie `ownerRef` DYSTYNKTYWNE symboli danego `elementKind` na scenie —
 *  jeden na pole/transformator, niezależnie od tego, ile INSTANCJI sceny
 *  faktycznie ten sam ref niesie (z konstrukcji, patrz nagłówek pliku) — to
 *  właśnie ten zbiór zasila nakładkę poniżej, więc KAŻDY wpis nakładki trafia
 *  we WSZYSTKIE symbole niosące jego ref, a placement-buildery mają
 *  wyprodukować NAJWYŻEJ jedną odznakę na wpis (dedup, nie „tyle ile
 *  symboli"). */
function distinctOwnerRefs(
  scene: ReturnType<typeof buildSceneV3>,
  elementKind: 'apparatus' | 'transformer',
): readonly string[] {
  const refs = new Set<string>();
  for (const symbol of scene.symbols) {
    if (symbol.meta?.elementKind !== elementKind) continue;
    if (symbol.meta.ownerRef) refs.add(symbol.meta.ownerRef);
  }
  return [...refs].sort();
}

describe('SldCanvasV3 — tożsamość ownerRef bez duplikatów (regresja S9-4/S9-10 rozszerzona na scenę)', () => {
  for (const lod of [1, 2] as const) {
    it(`L${lod}: sieć referencyjna (52 stacje + GPZ) + nakładka SWZ na KAŻDYM aparacie ⇒ zero ostrzeżeń "same key", jedna odznaka na ref`, () => {
      const scene = buildSceneV3(enm, lod);
      const apparatusRefs = distinctOwnerRefs(scene, 'apparatus');
      // Zapadka na fixturę: sieć referencyjna GPZ ma pola wielo-aparatowe
      // (linowe: odłącznik + wyłącznik) — jeśli kiedyś przestała je mieć,
      // ten test przestałby cokolwiek dowodzić, więc mierzymy realny rozmiar
      // sceny, nie zgadujemy.
      expect(apparatusRefs.length).toBeGreaterThan(0);

      const swzByOwnerRef = buildSwzOverlayFromResponses(
        apparatusRefs.map(
          (breakerRef): SwzApiResponse => ({
            status: 'OK',
            breaker_ref: breakerRef,
            swz: {
              status: 'spełnia',
              przyczyna_pl: 'Ik1_min ≥ Ia wymagane',
              ik1_min_a: 250,
              ia_wymagane_a: 160,
              t_wymagany_s: 0.4,
              margines: 1.5625,
            },
          }),
        ),
      );
      const overlay: SldV3Overlay = { energizedByTestId: {}, swzByOwnerRef };

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const { container } = render(
          <SldCanvasV3
            snapshot={enm}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            lodOverride={lod}
            overlay={overlay}
          />,
        );

        const sameKeyWarnings = errorSpy.mock.calls.filter((args) =>
          args.some((arg) => typeof arg === 'string' && arg.includes('same key')),
        );
        expect(sameKeyWarnings).toEqual([]);

        // Jedna odznaka PER dystynktywny ref — duplikat tożsamości sceny
        // wyprodukowałby WIĘCEJ odznak niż refów (dwie instancje = dwie
        // odznaki na JEDEN wpis nakładki), więc ta liczba jest dowodem
        // niezależnym od tego, czy React akurat wypisał ostrzeżenie.
        const badges = container.querySelectorAll('[data-testid^="sld-v3-swz-badge-"]');
        expect(badges.length).toBe(apparatusRefs.length);
      } finally {
        errorSpy.mockRestore();
      }
    });

    it(`L${lod}: sieć referencyjna + nakładka OLTC na KAŻDYM transformatorze ⇒ zero ostrzeżeń "same key", jedna odznaka na ref`, () => {
      const scene = buildSceneV3(enm, lod);
      const transformerRefs = distinctOwnerRefs(scene, 'transformer');
      expect(transformerRefs.length).toBeGreaterThan(0);

      const oltcByOwnerRef: Record<string, TransformerOltcOverlay> = {};
      transformerRefs.forEach((ownerRef, i) => {
        oltcByOwnerRef[ownerRef] = { ownerRef, tapPosition: (i % 5) - 2, switchCount: i };
      });
      const overlay: SldV3Overlay = { energizedByTestId: {}, oltcByOwnerRef };

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const { container } = render(
          <SldCanvasV3
            snapshot={enm}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            lodOverride={lod}
            overlay={overlay}
          />,
        );

        const sameKeyWarnings = errorSpy.mock.calls.filter((args) =>
          args.some((arg) => typeof arg === 'string' && arg.includes('same key')),
        );
        expect(sameKeyWarnings).toEqual([]);

        const badges = container.querySelectorAll('[data-testid^="sld-v3-oltc-badge-"]');
        expect(badges.length).toBe(transformerRefs.length);
      } finally {
        errorSpy.mockRestore();
      }
    });
  }
});
