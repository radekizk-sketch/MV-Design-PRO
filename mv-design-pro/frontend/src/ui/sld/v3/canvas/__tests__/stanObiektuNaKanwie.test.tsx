/**
 * Karta UX-04/POLE-LINIOWE-WZORZEC, korekta stanu obiektu — stan istniejący / projektowany
 * aparatu pola DYSKRETNIE na żywej kanwie (`SldCanvasV3`): atrybut `data-stan-obiektu` na grupie
 * symbolu i podpowiedź `<title>` na kształcie trafienia (warstwa `sld-v3-trafienia` leży nad
 * rysunkiem, więc to ona odbiera wskazanie kursorem). Bez znaku na rysunku.
 *
 * Źródła stanu (jedno na pochodzenie aparatu): rekord aparatu pola
 * (`BayPrimaryDevice.stan_obiektu`) i — dla aparatu z gałęzi łączeniowej pola — reguła
 * `stanObiektuLacznika` (`ui/shared/stanObiektu.ts`, lustro backendu przypięte fiksturą
 * z wyniku backendu).
 *
 * ILOCZYN CECH: kompozycja {stacja SN/nN, GPZ} × pochodzenie aparatu {rekord pola, gałąź pola}
 * × stan {istniejący, projektowany, nieustalony}; dodatkowo rozjazd źródeł (rekord projektowany,
 * gałąź bez stanu w polu istniejącym — aparat z gałęzi dziedziczy stan pola) i symbole bez
 * rekordu (bez atrybutu, bez podpowiedzi). Model z operacji backendu (fikstury generatora).
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { EnergyNetworkModel, StanObiektu } from '../../../../../types/enm';
import fxStacja from '../../../../../harness-fixtures/generated/geometria_stacji_zamkniete.json';
import fxGpz from '../../../../../harness-fixtures/generated/geometria_stacji_gpz_110kv.json';
import { nazwaStanuObiektuPl } from '../../../../shared/stanObiektu';
import { buildSceneV3 } from '../../scene/buildScene';
import { SldCanvasV3 } from '../SldCanvasV3';
import { bezWezlaPrzegladu, stacjePrzegladu } from '../hitAreas';
import { wnetrzePolRysowane } from '../oknoRenderu';
import { hierarchiaCelowTrafienia } from '../zakresKadru';
import { kameraNadSrodkiemSceny } from './kameraTestowa';

afterEach(cleanup);

type Pochodzenie = 'rekord_pola' | 'galaz_pola';
type Kompozycja = 'stacja' | 'gpz';

const PRZELACZNIKI = new Set(['switch', 'breaker', 'disconnector', 'bus_coupler']);

/** Model kompozycji: jedno pole bez rekordów aparatów (aparat z gałęzi pola) — fikstury niosą
 *  wyłącznie pola z rekordami, a gałąź jest drugą drogą danych. */
function model(kompozycja: Kompozycja): EnergyNetworkModel {
  const fx = kompozycja === 'stacja' ? fxStacja : fxGpz;
  const enm = structuredClone((fx as unknown as { snapshot: EnergyNetworkModel }).snapshot);
  // Druga droga danych (aparat z gałęzi łączeniowej pola) w KAŻDEJ kompozycji: jedno pole ze
  // stacji/GPZ traci rekordy aparatów. Generator fikstur stacji niesie dziś rekordy aparatów we
  // WSZYSTKICH polach (pomiar 2026-11-12: 0 symboli `galaz_pola` w `geometria_stacji_zamkniete`),
  // więc bez tego iloczyn stacja × gałąź pola byłby pusty — przypadek bez dowodu.
  const pole = (enm.bays ?? []).find(
    (b) => (b.primary_devices ?? []).length > 0 && (b.equipment_refs ?? []).length > 0 && (kompozycja === 'gpz' || b.ref_id.startsWith('stn/')),
  )!;
  pole.primary_devices = [];
  return enm;
}

/** Ten sam stan na każdym nośniku (pole, rekord aparatu, gałąź łączeniowa); `null` = bez stanu. */
function zeStanem(enm: EnergyNetworkModel, stan: StanObiektu | null): EnergyNetworkModel {
  const kopia = structuredClone(enm);
  for (const bay of kopia.bays ?? []) {
    bay.stan_obiektu = stan;
    for (const d of bay.primary_devices ?? []) d.stan_obiektu = stan;
  }
  for (const g of kopia.branches ?? []) {
    if (PRZELACZNIKI.has(g.type)) (g as { stan_obiektu?: StanObiektu | null }).stan_obiektu = stan;
  }
  return kopia;
}

const WIDOK = { width: 1600, height: 1000 } as const;

/** Karta SLD-SKALA-I-NAWIGACJA, R6: podpowiedź stanu leży na kształcie trafienia APARATU, a aparat
 *  jest własnym celem kliku dopiero na kadrze roboczym (na kadrze całej sieci trafia stację).
 *  Kanwa staje więc przy skali czytania — tam, gdzie projektant wskazuje aparat kursorem. */
function kanwa(enm: EnergyNetworkModel) {
  const kamera = kameraNadSrodkiemSceny(buildSceneV3(enm), 1, WIDOK);
  return render(<SldCanvasV3 snapshot={enm} width={WIDOK.width} height={WIDOK.height} cameraOverride={kamera} />).container;
}

function symboleAparatow(enm: EnergyNetworkModel, pochodzenie: Pochodzenie) {
  return buildSceneV3(enm).symbols.filter((s) => s.meta?.apparatusOrigin === pochodzenie && s.meta.testId);
}

describe('stan obiektu na kanwie — iloczyn kompozycja × pochodzenie × stan', () => {
  for (const kompozycja of ['stacja', 'gpz'] as const) {
    for (const pochodzenie of ['rekord_pola', 'galaz_pola'] as const) {
      for (const stan of ['ISTNIEJACY', 'PROJEKTOWANY', null] as const) {
        it(`${kompozycja} × ${pochodzenie} × ${stan ?? 'nieustalony'}: atrybut symbolu i podpowiedź na kształcie trafienia`, () => {
          const enm = zeStanem(model(kompozycja), stan);
          const symbole = symboleAparatow(enm, pochodzenie);
          expect(symbole.length, 'iloczyn bez przypadku').toBeGreaterThan(0);
          const dom = kanwa(enm);
          for (const s of symbole) {
            expect(s.meta?.stanObiektu, s.meta?.testId).toBe(stan);
            const grupa = dom.querySelector(`[data-testid="${s.meta!.testId}"]`);
            expect(grupa, s.meta?.testId).not.toBeNull();
            expect(grupa!.getAttribute('data-stan-obiektu')).toBe(stan ?? 'NIEUSTALONY');
            const tytul = dom.querySelector(`[data-hit-for="${s.meta!.testId}"] title`);
            expect(tytul?.textContent, s.meta?.testId).toBe(`Stan obiektu: ${nazwaStanuObiektuPl(stan)}`);
          }
        });
      }
    }
  }

  it('rozjazd źródeł: rekord aparatu niesie własny stan, aparat z gałęzi bez stanu dziedziczy stan pola', () => {
    const enm = zeStanem(model('stacja'), 'ISTNIEJACY');
    for (const bay of enm.bays ?? []) for (const d of bay.primary_devices ?? []) d.stan_obiektu = 'PROJEKTOWANY';
    for (const g of enm.branches ?? []) delete (g as { stan_obiektu?: StanObiektu | null }).stan_obiektu;
    const scena = buildSceneV3(enm);
    const wgPochodzenia = (p: Pochodzenie) => new Set(scena.symbols.filter((s) => s.meta?.apparatusOrigin === p).map((s) => s.meta?.stanObiektu));
    expect(wgPochodzenia('rekord_pola')).toEqual(new Set(['PROJEKTOWANY']));
    expect(wgPochodzenia('galaz_pola')).toEqual(new Set(['ISTNIEJACY']));
  });

  it('symbol bez rekordu aparatu (stacja, szyna, transformator, sylwetka) — bez atrybutu i bez podpowiedzi stanu', () => {
    const enm = zeStanem(model('stacja'), 'ISTNIEJACY');
    const bezRekordu = buildSceneV3(enm).symbols.filter((s) => s.meta?.apparatusOrigin == null && s.meta?.testId);
    expect(bezRekordu.length).toBeGreaterThan(0);
    // Kadr całego rysunku (kamera początkowa kanwy): okno renderu R8 obejmuje każdy symbol, więc
    // KAŻDY symbol bez rekordu ma węzeł — przy skali czytania nad środkiem sceny część z nich
    // leży poza oknem i nie ma czego sprawdzić. Symbol z obrysem bez wnętrza niesie te same
    // atrybuty co glif (`SceneSymbolNode`). Obiekt stacji rysowanej symbolem stacji w kadrze
    // przeglądowym (R8, `hitAreas.bezWezlaPrzegladu`) nie ma węzła własnego — sprawdza się symbol
    // jego stacji (bez atrybutu stanu).
    const dom = render(<SldCanvasV3 snapshot={enm} width={WIDOK.width} height={WIDOK.height} />).container;
    const scena = buildSceneV3(enm);
    const skala = Number(dom.querySelector('[data-testid="sld-canvas-v3"]')!.getAttribute('data-skala-kamery'));
    const h = hierarchiaCelowTrafienia(enm, scena);
    const glifSymbolu = new Map<string, string>();
    for (const [i, stacja] of bezWezlaPrzegladu(scena.symbols, scena.segments, h, stacjePrzegladu(scena.symbols, h, skala)).symbole) {
      glifSymbolu.set(scena.symbols[i].meta?.testId ?? '', stacja);
    }
    for (const s of bezRekordu) {
      expect(s.meta?.stanObiektu).toBeUndefined();
      // R8 reguła 3 (B-02 2026-11-13): poniżej progu wnętrza pól blok zabezpieczeń pola nie jest
      // rysowany — nie ma węzła, a więc ani atrybutu stanu, ani podpowiedzi.
      if (s.meta?.elementKind === 'protectionAnnotation' && !wnetrzePolRysowane(skala)) {
        expect(dom.querySelector(`[data-testid="${s.meta!.testId}"]`), s.meta?.testId).toBeNull();
        expect(dom.querySelector(`[data-hit-for="${s.meta!.testId}"]`), s.meta?.testId).toBeNull();
        continue;
      }
      const stacjaGlifu = glifSymbolu.get(s.meta!.testId!);
      const wezel =
        stacjaGlifu === undefined
          ? dom.querySelector(`[data-testid="${s.meta!.testId}"]`)
          : [...dom.querySelectorAll('[data-symbol-stacji="true"]')].find((g) => g.getAttribute('data-owner-ref') === stacjaGlifu) ?? null;
      expect(wezel, s.meta?.testId).not.toBeNull();
      expect(wezel!.hasAttribute('data-stan-obiektu'), s.meta?.testId).toBe(false);
      expect(dom.querySelector(`[data-hit-for="${s.meta!.testId}"] title`)?.textContent ?? '').not.toContain('Stan obiektu');
    }
  });
});
