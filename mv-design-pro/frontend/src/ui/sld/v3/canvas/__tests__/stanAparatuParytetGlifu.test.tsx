/**
 * UI-02b JEDEN-INSPEKTOR × GPZ-PARYTET cz. 2 — położenie łącznika w prawym inspektorze jest
 * TYM SAMYM stanem, który rysuje glif klikniętego symbolu na kanwie.
 *
 * Defekt (e2e `stan-ruchowy-pola-brak-telemetrii` na realnym backendzie): symbol łącznika
 * stosu z KONWENCJI (pole bez refu pojedynczego aparatu — `ownerRef` = ref pola, bez
 * `deviceRef`) rysuje agregat roli pola (`cbState`/`dsState`/`esState`), a inspektor
 * pokazywał „brak stanu w modelu", bo szukał aparatu o refie pola. Ten sam rozjazd miał
 * łącznik TORU ciągu SN (gałąź łączeniowa poza polem): glif ze `status` gałęzi, inspektor
 * bez sekcji stanu. Naprawa: rola symbolu z JEDNEJ tabeli (`rolaSymboluLacznika`), którą
 * kompozycja wybiera agregat glifu, jedzie w meta kliku do inspektora; łącznik toru —
 * `stanLacznikaToruZModelu` na tym samym zbiorze typów gałęzi co scena.
 *
 * Iloczyn cech: blok {stacja SN/nN, GPZ, tor ciągu} × rola symbolu {wyłącznik, odłącznik /
 * rozłącznik, uziemnik, łącznik toru} × stan modelu {zamknięty, otwarty, nieustalony} ×
 * sieć {52 stacje, macierz, koordynacja} × wariant statusów gałęzi {jak w sieci,
 * odwrócone}. Ścieżka natywna: klik w uchwyt trafienia (`data-hit-for`), jak mysz.
 * Wyrocznia: `state` symbolu sceny (to, co rysuje glif).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3 } from '../../scene/buildScene';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { useSelectionStore } from '../../../../selection';
import { SldCanvasV3Workspace } from '../SldCanvasV3Workspace';
import { useRawResultOverlayStore } from '../../../../sld-overlay/rawResultOverlayStore';
import { useKontekstElementuKanwy } from '../../../shared/kontekstElementuKanwy';
import { InspektorKanwyTestowy } from '../../../../network-build/inspektor-elementu/__tests__/inspektorKanwyTestowy';
import { POLOZENIE_LACZNIKA_PL } from '../../../../network-build/inspektor-elementu/PanelElementuKanwy';
import { rolaSymboluLacznika } from '../../../v2/model/stanAparatowPola';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '..', '..', '..', '..', '..');

function wczytaj(sciezka: string): EnergyNetworkModel {
  const surowy = JSON.parse(readFileSync(resolve(src, sciezka), 'utf8')) as
    | { readonly enm: EnergyNetworkModel }
    | EnergyNetworkModel;
  return 'enm' in surowy ? surowy.enm : surowy;
}

const SIECI: readonly (readonly [string, string])[] = [
  ['52 stacje', 'ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json'],
  ['macierz', 'harness-fixtures/generated/macierz_scena_migawka.json'],
  ['koordynacja', 'harness-fixtures/generated/koordynacja_scena_migawka.json'],
];

const TYPY_LACZNIKOW = new Set(['breaker', 'disconnector', 'switch', 'bus_coupler']);

/** Wariant „odwrócone": każda gałąź łączeniowa zmienia położenie (brak statusu → otwarta). */
function odwroconeStatusy(enm: EnergyNetworkModel): EnergyNetworkModel {
  return {
    ...enm,
    branches: enm.branches.map((galaz) =>
      TYPY_LACZNIKOW.has(galaz.type)
        ? ({ ...galaz, status: galaz.status === 'open' ? 'closed' : 'open' } as typeof galaz)
        : galaz,
    ),
  };
}

type Blok = 'stacja' | 'gpz' | 'tor';

function blokSymbolu(testId: string, ownerRef: string): Blok {
  if (testId.startsWith('sld-v3-lacznik-toru-')) return 'tor';
  return ownerRef.startsWith('gpz/') ? 'gpz' : 'stacja';
}

afterEach(() => {
  cleanup();
  useRawResultOverlayStore.getState().clear();
  useKontekstElementuKanwy.getState().wyczysc();
});

beforeEach(() => {
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
  useRawResultOverlayStore.getState().clear();
});

describe('Inspektor obiektu kanwy — położenie łącznika = stan glifu klikniętego symbolu', () => {
  const pokryte = new Set<string>();

  for (const [nazwa, sciezka] of SIECI) {
    for (const wariant of ['jak w sieci', 'odwrócone'] as const) {
      it(`${nazwa} · statusy gałęzi ${wariant}: każda kombinacja blok × symbol × stan`, () => {
        const bazowa = wczytaj(sciezka);
        const enm = wariant === 'odwrócone' ? odwroconeStatusy(bazowa) : bazowa;
        useSnapshotStore.setState({ snapshot: enm });
        const scene = buildSceneV3(enm, 2);
        // Po jednym reprezentancie każdej kombinacji (blok, symbol, stan glifu, ścieżka).
        const reprezentanci = new Map<string, number>();
        scene.symbols.forEach((symbol, index) => {
          const meta = symbol.meta;
          if (meta?.elementKind !== 'apparatus' || !meta.ownerRef || symbol.state === undefined) return;
          const testId = meta.testId ?? `sld-v3-symbol-${index}`;
          const blok = blokSymbolu(testId, meta.ownerRef);
          if (blok !== 'tor' && (meta.deviceRef || !rolaSymboluLacznika(symbol.symbolId))) return;
          const klucz = `${blok}|${symbol.symbolId}|${symbol.state}`;
          if (!reprezentanci.has(klucz)) reprezentanci.set(klucz, index);
        });
        expect(reprezentanci.size, 'sieć ma łączniki ze stanem glifu').toBeGreaterThan(0);

        const { container } = render(
          <>
            <SldCanvasV3Workspace width={1600} height={1000} lodOverride={2} />
            <InspektorKanwyTestowy />
          </>,
        );
        for (const [klucz, index] of [...reprezentanci].sort(([a], [b]) => a.localeCompare(b))) {
          const symbol = scene.symbols[index];
          const testId = symbol.meta?.testId ?? `sld-v3-symbol-${index}`;
          const uchwyt = container.querySelector(`[data-hit-for="${testId}"][data-hit-role="obrys"]`);
          expect(uchwyt, `uchwyt trafienia ${klucz}`).not.toBeNull();
          fireEvent.click(uchwyt!);
          expect(
            useSelectionStore.getState().selectedElements.map((e) => e.id),
            `selekcja ${klucz}`,
          ).toEqual([symbol.meta!.ownerRef]);
          expect(screen.getByTestId('inspektor-aparat-stan').textContent, klucz).toBe(
            POLOZENIE_LACZNIKA_PL[symbol.state!],
          );
          pokryte.add(klucz.split('|')[0] + '|' + (rolaSymboluLacznika(symbol.symbolId) ?? 'tor') + '|' + symbol.state);
          fireEvent.keyDown(window, { key: 'Escape' });
        }
      });
    }
  }

  it('pokrycie iloczynu: każdy blok i każda rola wystąpiły, a stany zamknięty/otwarty/nieustalony — każdy', () => {
    const bloki = new Set([...pokryte].map((k) => k.split('|')[0]));
    const role = new Set([...pokryte].map((k) => `${k.split('|')[0]}|${k.split('|')[1]}`));
    const stany = new Set([...pokryte].map((k) => k.split('|')[2]));
    expect([...bloki].sort()).toEqual(['gpz', 'stacja', 'tor']);
    for (const rola of ['stacja|cb', 'stacja|ds', 'stacja|es', 'gpz|cb', 'gpz|ds', 'gpz|es', 'tor|tor']) {
      expect(role.has(rola), `kombinacja ${rola} w iloczynie`).toBe(true);
    }
    expect([...stany].sort()).toEqual(['closed', 'open', 'unknown']);
  });
});
