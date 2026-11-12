/**
 * Ramka bloku zabezpieczeń i jej treść — jedna klasa informacji; oznaczenia zacisków P1/P2 —
 * para (karta UX-04/ROZDZIELNICA-SN-KOREKTA, kryteria K2 i K3, decyzja architekta D3d).
 *
 * Wady z oględzin zrzutów: w kadrze pola TR1 ramka bloku zabezpieczeń była zielonym
 * prostokątem bez treści (kody „50BF 87T 90" ukryte progiem czytelności, ramka zostawała);
 * przy przekładniku TR1 widać było tylko P2 (P1 ukryte planem etykiet).
 *
 * Kontrakty:
 *  K2 — każdy NARYSOWANY blok zabezpieczeń (symbol `protectionRelay` w DOM) ma narysowany co
 *       najmniej jeden wiersz swojej treści (etykieta z `wierszeBlokuPrzekaznika` w warstwie
 *       etykiet), a blok bez narysowanej treści nie ma w DOM ani ramki, ani linii wyłączania
 *       i pomiarowych (`#trip-line`, `#measurement-link…`).
 *  K3 — oznaczenia zacisków pierwotnych tego samego przekładnika są narysowane oba albo żadne.
 * Iloczyn cech: fikstura (GPZ szablonów pól, stacje A–D) × rozmiar kanwy (skala dopasowania
 * od oddalenia do zbliżenia) × kadr {cała sieć, każde pole z blokiem zabezpieczeń (podłoga
 * opisów celu)}. Wyrocznia niepusta: w iloczynie występuje i blok narysowany, i blok ukryty.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { ZNACZNIK_ZACISKU_PRZEKLADNIKA } from '../../compose/zaciskiPrzekladnika';
import { buildSceneV3, sceneObstacleRects } from '../../scene/buildScene';
import { sheetSizeFor } from '../../sheet/outline';
import { planSceneLabels } from '../labelLegibility';
import { SldCanvasV3, symbolTestId } from '../SldCanvasV3';
import { podlogaOpisowCelu, zakresCelu } from '../zakresKadru';

afterEach(() => cleanup());

function wczytaj(nazwa: string): EnergyNetworkModel {
  const plik = JSON.parse(readFileSync(`public/test-fixtures/${nazwa}.enm.json`, 'utf8'));
  return plik.enm ?? plik;
}

const FIKSTURY = ['gpz110kvPolaSzablonow', 'stacjeTypowAbcd'] as const;
const ROZMIARY = [
  { width: 700, height: 450 },
  { width: 1440, height: 900 },
  { width: 3600, height: 2200 },
] as const;

let narysowaneBloki = 0;
let ukryteBloki = 0;
let paryNarysowane = 0;

describe('blok zabezpieczeń: ramka ⇒ treść; zaciski pierwotne przekładnika parą', () => {
  for (const nazwa of FIKSTURY) {
    const enm = wczytaj(nazwa);
    const scena = buildSceneV3(enm, 2);
    const przekazniki = scena.symbols
      .map((symbol, index) => ({ symbol, index }))
      .filter(({ symbol }) => symbol.symbolId === 'protectionRelay');
    const polaZBlokiem = [...new Set(przekazniki.map(({ symbol }) => symbol.meta?.ownerRef).filter((r): r is string => !!r))];
    const kadry: readonly (string | null)[] = [null, ...polaZBlokiem];
    for (const rozmiar of ROZMIARY) {
      for (const pole of kadry) {
        it(`${nazwa} × ${rozmiar.width}×${rozmiar.height} × kadr ${pole ? pole.split('/').slice(-2).join('/') : 'sieci'}`, () => {
          const zakres = pole ? zakresCelu('pole', enm, [pole], scena) : null;
          if (zakres && !zakres.dostepny) throw new Error(zakres.przyczyna);
          const { container } = render(
            <SldCanvasV3
              snapshot={enm}
              width={rozmiar.width}
              height={rozmiar.height}
              lodOverride={2}
              zadanieKadru={zakres?.dostepny ? { zakres: zakres.zakres, seq: 1 } : null}
              refyKadru={zakres?.dostepny ? zakres.zakres.refy : null}
            />,
          );
          const etykiety = new Set(
            [...container.querySelectorAll('[data-testid="sld-v3-labels"] [data-owner-ref]')].map((el) =>
              el.getAttribute('data-owner-ref'),
            ),
          );
          const odcinki = [...container.querySelectorAll('[data-testid="sld-v3-segments"] [data-owner-ref]')].map((el) =>
            el.getAttribute('data-owner-ref') ?? '',
          );
          for (const { symbol, index } of przekazniki) {
            const wezel = container.querySelector(`[data-testid="${CSS.escape(symbolTestId(symbol, index))}"]`);
            const wiersze = (symbol.meta?.wierszeBlokuPrzekaznika ?? []).filter((r) => etykiety.has(r));
            const bay = symbol.meta?.ownerRef ?? '';
            if (wezel) {
              narysowaneBloki += 1;
              expect(wiersze.length, `ramka ${bay} bez narysowanej treści`).toBeGreaterThan(0);
            } else {
              ukryteBloki += 1;
              expect(wiersze, `treść bloku ${bay} bez ramki`).toEqual([]);
              expect(
                odcinki.filter((o) => o === `${bay}#trip-line` || o.startsWith(`${bay}#measurement-link`)),
                `linie bloku ${bay} bez bloku`,
              ).toEqual([]);
            }
          }
          // K3: zaciski pierwotne — para.
          const zaciski = scena.labels.filter((l) => l.ownerRef.includes(ZNACZNIK_ZACISKU_PRZEKLADNIKA));
          const pary = new Map<string, string[]>();
          for (const l of zaciski) {
            const klucz = l.ownerRef.slice(0, l.ownerRef.lastIndexOf('-'));
            pary.set(klucz, [...(pary.get(klucz) ?? []), l.ownerRef]);
          }
          for (const [klucz, refy] of pary) {
            const narysowane = refy.filter((r) => etykiety.has(r)).length;
            expect([0, refy.length], `zaciski ${klucz}: narysowane ${narysowane} z ${refy.length}`).toContain(narysowane);
            if (narysowane === refy.length && refy.length === 2) paryNarysowane += 1;
          }
        });
      }
    }
  }
  it('wyrocznia niepusta: w iloczynie są bloki narysowane, ukryte i pary zacisków narysowane', () => {
    expect(narysowaneBloki).toBeGreaterThan(0);
    expect(ukryteBloki).toBeGreaterThan(0);
    expect(paryNarysowane).toBeGreaterThan(0);
  });
});

/** K3 na planie etykiet: gęsta siatka skal (0,2…3,0) × podłoga celu {brak, każde pole z
 *  przekładnikiem}. Plan jest czystą funkcją skali, więc siatka pokrywa przejścia progów. */
describe('zaciski pierwotne przekładnika — para w planie etykiet przy każdej skali', () => {
  for (const nazwa of FIKSTURY) {
    it(nazwa, () => {
      const enm = wczytaj(nazwa);
      const scena = buildSceneV3(enm, 2);
      const przeszkody = sceneObstacleRects(scena);
      const arkusz = sheetSizeFor(scena);
      const zaciski = scena.labels.filter((l) => l.ownerRef.includes(ZNACZNIK_ZACISKU_PRZEKLADNIKA));
      expect(zaciski.length).toBeGreaterThan(1);
      const pola = [...new Set(zaciski.map((l) => l.ownerRef.slice(0, l.ownerRef.indexOf('#'))))];
      const podlogi = [undefined, ...pola.map((p) => podlogaOpisowCelu(new Set([p])))];
      let pelne = 0;
      for (let k = 4; k <= 60; k += 1) {
        const skala = k / 20;
        for (const podloga of podlogi) {
          const plan = planSceneLabels(scena.labels, przeszkody, skala, arkusz, podloga);
          const narysowane = new Set(plan.drawn.map((p) => p.label.ownerRef));
          const pary = new Map<string, number[]>();
          for (const l of zaciski) {
            const klucz = l.ownerRef.slice(0, l.ownerRef.lastIndexOf('-'));
            const [n, w] = pary.get(klucz) ?? [0, 0];
            pary.set(klucz, [n + 1, w + (narysowane.has(l.ownerRef) ? 1 : 0)]);
          }
          for (const [klucz, [n, w]] of pary) {
            expect([0, n], `zaciski ${klucz} przy skali ${skala}: ${w} z ${n}`).toContain(w);
            if (w === n) pelne += 1;
          }
        }
      }
      expect(pelne).toBeGreaterThan(0);
    });
  }
});
