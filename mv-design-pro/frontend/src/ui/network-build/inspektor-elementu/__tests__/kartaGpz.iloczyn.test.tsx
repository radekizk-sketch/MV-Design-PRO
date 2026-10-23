/**
 * Karta GPZ-H5-SLD etap 2, wymaganie 1 i 7 — karta GPZ prawego inspektora (bilans,
 * przeciążenia, tabela pól), która zastąpiła tabelę „Pola GPZ" i belkę bilansu rysowane
 * w geometrii schematu. Intencja dawnego testu kanwy (`gpzAdnotacjeNaKanwie.test.tsx`:
 * stan wyniku jawny, wartości 1:1 z wierszy backendu, brak ≠ zero) przeniesiona tu bez zmian.
 *
 * Iloczyn cech (część czysta, `stanKartyGpz`):
 *   wynik {brak · aktualny · nieaktualny · z innego biegu niż schemat}
 *   × stan danych pola {z danymi · rezerwowe · bez odpływu · bez aparatu}
 *   × wiersz wyniku pola {komplet · częściowy · brak wiersza}
 *   × plakietki {brak · SPZ · SPZ+SCO}
 *   × wiersz stacji {jest · brak}.
 *
 * Ścieżka natywna (część z DOM): kanwa + inspektor jak w aplikacji, KLIK w nagłówek bloku
 * GPZ (uchwyt trafienia etykiety nazwy) → selekcja GPZ → karta GPZ; wyniki przez magazyn
 * kontekstu wyniku (bieg w rejestrze, `results/v1` wczytany) z fikstury ŻYWEGO biegu
 * rozpływowego (`s92Rozplyw.overlay.json`) i sieci H5 2×2.
 * Predykat parami: wiersze karty i zbiór „opisane w karcie GPZ" rachunku pokrycia wyników
 * (`resultPointsInGpzPanel`) pochodzą z jednej listy `scene.meta.gpzPola`.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../types/enm';
import { useAppStateStore } from '../../../app-state';
import { useSelectionStore } from '../../../selection';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import { useRawResultOverlayStore, type RawMetricValue, type RawOverlayPayload } from '../../../sld-overlay/rawResultOverlayStore';
import { useShellStore } from '../../../../ui2/shell/useShellStore';
import { buildSceneV3 } from '../../../sld/v3/scene/buildScene';
import { SldCanvasV3Workspace } from '../../../sld/v3/canvas/SldCanvasV3Workspace';
import { resultPointsInGpzPanel } from '../../../sld/v3/canvas/resultLabels';
import { useKontekstElementuKanwy } from '../../../sld/shared/kontekstElementuKanwy';
import { useExecutionRunsStore } from '../../../study-cases/runStore';
import { REWIZJA_BIEGU, biegRejestru, wyczyscRejestrBiegow } from '../../../../test/biegNieaktualny';
import { wyczyscKontekstWyniku, zasiejWynikWczytany } from '../../../../test/kontekstBiegu';
import type { GpzWynikiOverlay, WynikiPolaGpz } from '../../../sld/v3/canvas/gpzWyniki';
import type { PoleTabeliGpzWejscie, StanDanychPolaGpz } from '../../../sld/v3/compose/gpzAdnotacje';
import type { GpzStatusFlag } from '../../../sld/v2/canvas/canonicalGpzModel';
import { InspektorKanwyTestowy } from './inspektorKanwyTestowy';
import { stanKartyGpz } from '../stanKartyGpz';

const here = dirname(fileURLToPath(import.meta.url));
const canvasFixture = <T,>(name: string): T =>
  JSON.parse(readFileSync(resolve(here, '..', '..', '..', 'sld', 'v3', 'canvas', '__tests__', 'fixtures', name), 'utf8')) as T;
const sceneFixture = (name: string): EnergyNetworkModel =>
  (JSON.parse(readFileSync(resolve(here, '..', '..', '..', 'sld', 'v3', 'scene', '__tests__', 'fixtures', name), 'utf8')) as { enm: EnergyNetworkModel }).enm;

const S92 = canvasFixture<EnergyNetworkModel>('s92Bieg.enm.json');
const ROZPLYW = canvasFixture<RawOverlayPayload>('s92Rozplyw.overlay.json');
const ZWARCIE = canvasFixture<RawOverlayPayload>('s92Zwarcie.overlay.json');
const H5 = sceneFixture('gpzH5_2x2.enm.json');

/** Zapis liczby wg `format_hint` — wyrocznia niezależna od kodu produktu. */
const zapis = (m: RawMetricValue): string =>
  (m.value as number).toFixed({ fixed0: 0, fixed1: 1, fixed2: 2, fixed4: 4 }[m.format_hint ?? 'fixed2'] ?? 2).replace('.', ',');

// ---------------------------------------------------------------------------
// Część czysta — iloczyn cech
// ---------------------------------------------------------------------------

type Wynik = 'brak' | 'aktualny' | 'nieaktualny' | 'innyBieg';
type WierszPola = 'komplet' | 'czesciowy' | 'brak';
const WYNIKI: readonly Wynik[] = ['brak', 'aktualny', 'nieaktualny', 'innyBieg'];
const STANY: readonly (StanDanychPolaGpz | null)[] = [null, 'rezerwowe', 'bez_odplywu', 'bez_aparatu'];
const WIERSZE: readonly WierszPola[] = ['komplet', 'czesciowy', 'brak'];
const PLAKIETKI: readonly (readonly GpzStatusFlag[])[] = [[], ['SPZ'], ['SPZ', 'SCO']];
const KOMPLET: WynikiPolaGpz = { p: '1,20', q: '0,30', i: '48,0', u: '15,10' };
const CZESCIOWY: WynikiPolaGpz = { p: '1,20', q: null, i: null, u: null };

function wyniki(wynik: Wynik, wiersz: WierszPola, zWierszemStacji: boolean): GpzWynikiOverlay | null {
  if (wynik === 'brak') return null;
  return {
    pola: wiersz === 'brak' ? {} : { 'bay-x': wiersz === 'komplet' ? KOMPLET : CZESCIOWY },
    stacje: zWierszemStacji
      ? { gpz: { bilans: { pZasilaniaMw: '5,00', qZasilaniaMvar: '1,00', pOdplywowMw: '4,90', qOdplywowMvar: '0,90' }, liczbaPrzeciazen: '2' } }
      : {},
    zBieguSpozaWidoku: wynik === 'innyBieg',
    nieaktualny: wynik === 'nieaktualny',
  };
}

describe('karta GPZ — iloczyn: wynik × stan danych pola × wiersz wyniku × plakietki × wiersz stacji', () => {
  for (const wynik of WYNIKI) {
    for (const stanDanych of STANY) {
      for (const wiersz of WIERSZE) {
        for (const plakietki of PLAKIETKI) {
          for (const zWierszemStacji of [true, false]) {
            const nazwa = `${wynik} × ${stanDanych ?? 'z danymi'} × wiersz ${wiersz} × [${plakietki.join('+')}] × stacja ${zWierszemStacji ? 'jest' : 'brak'}`;
            it(nazwa, () => {
              const pole: PoleTabeliGpzWejscie = { bayRef: 'bay-x', oznaczenie: 'Pole liniowe A1', rola: 'liniowe', plakietki, stanDanych };
              const karta = stanKartyGpz('gpz', [pole], wyniki(wynik, wiersz, zWierszemStacji), 'run-1');
              const [w] = karta.wiersze;
              expect(karta.wynik).toBe(wynik === 'brak' ? 'brak' : wynik === 'nieaktualny' ? 'nieaktualny' : 'aktualny');
              expect(karta.runId).toBe(wynik === 'brak' ? null : 'run-1');
              // Plakietki 1:1 z modelu, każda z rozwinięciem.
              expect(w.plakietki.map((p) => p.kod)).toEqual(plakietki);
              for (const p of w.plakietki) expect(p.opisPl.startsWith(p.kod)).toBe(true);
              // Wymaganie 7: „bez aparatu" raz zbiorczo, nigdy w wierszu.
              expect(karta.polaBezAparatu).toBe(
                stanDanych === 'bez_aparatu' ? 'Pola bez aparatu w modelu: 1 z 1 — znak „?” przy oznaczeniu pola na schemacie' : null,
              );
              expect(w.napisStanu).not.toBe('pole bez aparatu w modelu');
              const maWartosci = wynik !== 'brak' && wiersz !== 'brak';
              if (maWartosci) {
                // Wynik backendu ma pierwszeństwo przed stanem danych pola.
                expect(w.napisStanu).toBeNull();
                expect(w.wartosci).toEqual(wiersz === 'komplet' ? KOMPLET : { p: '1,20', q: 'brak', i: 'brak', u: 'brak' });
              } else if (stanDanych === 'rezerwowe' || stanDanych === 'bez_odplywu') {
                expect(w.napisStanu).toBe(stanDanych === 'rezerwowe' ? 'pole rezerwowe' : 'pole bez odpływu');
                expect(w.wartosci).toBeNull();
              } else if (wynik === 'brak') {
                expect(w.napisStanu).toBe('obliczenie niewykonane');
                expect(w.wartosci).toBeNull();
              } else {
                // Bieg jest, pole bez wiersza: cztery „brak", nigdy zero.
                expect(w.napisStanu).toBeNull();
                expect(w.wartosci).toEqual({ p: 'brak', q: 'brak', i: 'brak', u: 'brak' });
              }
              // Bilans i przeciążenia: brak biegu ≠ brak wiersza stacji ≠ wartość.
              if (wynik === 'brak') {
                expect(karta.zasilanie).toBe('Zasilanie GPZ: brak wyniku rozpływu mocy');
                expect(karta.alarmy).toBe('Przeciążenia w GPZ: brak wyniku rozpływu mocy');
                expect(karta.tytul).toBe('Pola GPZ — brak wyniku rozpływu mocy');
              } else {
                const suf = wynik === 'nieaktualny' ? ' · wynik nieaktualny' : '';
                expect(karta.zasilanie).toBe(zWierszemStacji ? 'Zasilanie GPZ: P = 5,00 MW, Q = 1,00 Mvar' : 'Zasilanie GPZ: brak wyniku źródła');
                expect(karta.odplywy).toBe(zWierszemStacji ? 'Odpływy GPZ: P = 4,90 MW, Q = 0,90 Mvar' : 'Odpływy GPZ: brak kompletu wyników pól');
                expect(karta.alarmy).toBe(zWierszemStacji ? `Przeciążenia w GPZ: 2${suf}` : `Przeciążenia w GPZ: brak wyniku${suf}`);
                expect(karta.tytul).toBe(
                  wynik === 'innyBieg' ? 'Pola GPZ — rozpływ z innego biegu niż schemat' : `Pola GPZ — wynik rozpływu mocy${suf}`,
                );
              }
            });
          }
        }
      }
    }
  }

  it('zbiorcza informacja liczy WSZYSTKIE pola bez aparatu raz (N z M), kolejność wierszy = kolejność kompozycji', () => {
    const pola: PoleTabeliGpzWejscie[] = (['bez_aparatu', null, 'bez_aparatu', 'rezerwowe'] as const).map((stanDanych, i) => ({
      bayRef: `b-${i}`,
      oznaczenie: i === 1 ? null : `P${i}`,
      rola: 'liniowe',
      plakietki: [],
      stanDanych,
    }));
    const karta = stanKartyGpz('gpz', pola, null);
    expect(karta.polaBezAparatu).toBe('Pola bez aparatu w modelu: 2 z 4 — znak „?” przy oznaczeniu pola na schemacie');
    expect(karta.wiersze.map((w) => w.bayRef)).toEqual(['b-0', 'b-1', 'b-2', 'b-3']);
    expect(karta.wiersze[1].oznaczenie).toBe('bez oznaczenia');
  });
});

// ---------------------------------------------------------------------------
// Ścieżka natywna — klik w nagłówek GPZ na kanwie
// ---------------------------------------------------------------------------

type StanBiegu = 'brak' | 'aktualny' | 'nieaktualny' | 'zwarcie';

function ustawBieg(stan: StanBiegu): void {
  act(() => {
    if (stan === 'brak') {
      wyczyscRejestrBiegow();
      wyczyscKontekstWyniku();
      useRawResultOverlayStore.getState().setPayload(null);
      return;
    }
    const payload = stan === 'zwarcie' ? ZWARCIE : ROZPLYW;
    useExecutionRunsStore.setState({ runs: [biegRejestru(payload.run_id, stan === 'zwarcie' ? 'SC_3F' : 'LOAD_FLOW')] });
    useSnapshotStore.setState({ rewizjaBiezacegoModelu: stan === 'nieaktualny' ? REWIZJA_BIEGU + 1 : REWIZJA_BIEGU });
    zasiejWynikWczytany({
      runId: payload.run_id,
      analysisType: payload.analysis_type,
      elementy: payload.elements,
      qualityStatus: null,
      proofStatus: null,
      runFinishedAt: null,
      szynyBezNapiecia: payload.bez_napiecia_refs ?? [],
    });
    useRawResultOverlayStore.getState().setPayload(payload);
  });
}

function kliknijNaglowekGpz(enm: EnergyNetworkModel): HTMLElement {
  useSnapshotStore.setState({ snapshot: enm });
  const { container } = render(
    <>
      <SldCanvasV3Workspace width={1400} height={800} lodOverride={2} />
      <InspektorKanwyTestowy />
    </>,
  );
  const scena = buildSceneV3(enm, 2);
  const gpzId = scena.meta.gpzId!;
  const indeks = scena.labels.findIndex((l) => l.ownerKind === 'station-name' && l.ownerRef.replace(/#.*$/, '') === gpzId);
  expect(indeks, 'etykieta nazwy GPZ w nagłówku bloku').toBeGreaterThanOrEqual(0);
  const uchwyt = container.querySelector(`[data-hit-for="sld-v3-label-${indeks}"]`);
  expect(uchwyt, 'uchwyt trafienia nagłówka GPZ').not.toBeNull();
  fireEvent.click(uchwyt!, { detail: 1 });
  return screen.getByTestId('inspektor-karta-gpz');
}

beforeEach(() => {
  if (typeof URL.createObjectURL !== 'function') URL.createObjectURL = () => 'blob:shim';
  if (typeof URL.revokeObjectURL !== 'function') URL.revokeObjectURL = () => {};
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
  useRawResultOverlayStore.getState().clear();
  useAppStateStore.setState({ activeCaseId: 'case-gpz', activeCaseResultStatus: 'NONE' });
  wyczyscRejestrBiegow();
  wyczyscKontekstWyniku();
  act(() => useShellStore.getState().setActiveSpace('model'));
});
afterEach(() => {
  cleanup();
  useKontekstElementuKanwy.getState().wyczysc();
  useRawResultOverlayStore.getState().clear();
  useAppStateStore.setState({ activeCaseId: null, activeCaseResultStatus: 'NONE' });
});

describe('karta GPZ w inspektorze — klik w nagłówek GPZ na kanwie (ścieżka natywna)', () => {
  it('schemat nie niesie już tabeli pól, bilansu ani teł ról (wymaganie 1) — dane są w karcie inspektora', () => {
    kliknijNaglowekGpz(S92);
    expect(document.querySelector('[data-testid="sld-v3-gpz-adnotacje"]')).toBeNull();
    const naSchemacie = [...document.querySelectorAll('[data-testid="sld-canvas-v3"] [data-parity-key]')]
      .flatMap((n) => (n.getAttribute('data-parity-key') ?? '').split(' '));
    for (const klucz of ['gpz.header.balance', 'gpz.header.alarms', 'gpz.measurements', 'gpz.status_flags', 'gpz.bay.panel']) {
      expect(naSchemacie, klucz).not.toContain(klucz);
    }
    const karta = screen.getByTestId('inspektor-karta-gpz');
    expect(karta.querySelector('[data-parity-key="gpz.header.balance"]')).not.toBeNull();
    expect(karta.querySelector('[data-parity-key="gpz.header.alarms"]')).not.toBeNull();
    expect(karta.querySelector('[data-parity-key="gpz.measurements"]')).not.toBeNull();
  });

  for (const stan of ['brak', 'aktualny', 'nieaktualny', 'zwarcie'] as const) {
    it(`bieg ${stan}: bilans, przeciążenia i wartości pól z wierszy backendu (1:1), stan wyniku jawny`, () => {
      const karta = kliknijNaglowekGpz(S92);
      ustawBieg(stan);
      const gpz = (S92.substations ?? []).find((s) => s.station_type === 'gpz')!;
      const wierszStacji = ROZPLYW.elements[gpz.ref_id];
      const wierszPola = Object.values(ROZPLYW.elements).find((e) => e.kind === 'bay')!;
      const tekst = (id: string) => within(karta).getByTestId(id).textContent;
      if (stan === 'brak' || stan === 'zwarcie') {
        // Bieg zwarciowy bez biegu rozpływu: GPZ nie udaje bilansu.
        expect(karta).toHaveAttribute('data-gpz-wynik', 'brak');
        expect(tekst('inspektor-gpz-zasilanie')).toBe('Zasilanie GPZ: brak wyniku rozpływu mocy');
        expect(tekst('inspektor-gpz-alarmy')).toBe('Przeciążenia w GPZ: brak wyniku rozpływu mocy');
        expect(tekst('inspektor-gpz-tytul')).toBe('Pola GPZ — brak wyniku rozpływu mocy');
        expect(within(karta).queryAllByTestId(/^inspektor-gpz-wartosc-/)).toHaveLength(0);
        return;
      }
      const m = wierszStacji.metrics;
      expect(karta).toHaveAttribute('data-gpz-wynik', stan);
      expect(karta).toHaveAttribute('data-run-id', ROZPLYW.run_id);
      expect(tekst('inspektor-gpz-zasilanie')).toBe(`Zasilanie GPZ: P = ${zapis(m.P_SUPPLY_MW)} MW, Q = ${zapis(m.Q_SUPPLY_Mvar)} Mvar`);
      expect(tekst('inspektor-gpz-odplywy')).toBe(`Odpływy GPZ: P = ${zapis(m.P_FEEDERS_MW)} MW, Q = ${zapis(m.Q_FEEDERS_Mvar)} Mvar`);
      const suf = stan === 'nieaktualny' ? ' · wynik nieaktualny' : '';
      expect(tekst('inspektor-gpz-alarmy')).toBe(`Przeciążenia w GPZ: ${zapis(m.ALARM_COUNT)}${suf}`);
      expect(within(karta).queryByTestId('inspektor-gpz-nieaktualne') !== null).toBe(stan === 'nieaktualny');
      const ref = wierszPola.ref_id;
      expect(tekst(`inspektor-gpz-wartosc-${ref}-p`)).toBe(zapis(wierszPola.metrics.P_MW));
      expect(tekst(`inspektor-gpz-wartosc-${ref}-q`)).toBe(zapis(wierszPola.metrics.Q_Mvar));
      expect(tekst(`inspektor-gpz-wartosc-${ref}-i`)).toBe(zapis(wierszPola.metrics.I_A));
      expect(tekst(`inspektor-gpz-wartosc-${ref}-u`)).toBe(zapis(wierszPola.metrics.U_kV));
    });
  }

  it('H5 2×2: wiersz na KAŻDE pole kompozycji, w jej kolejności; te same refy liczy rachunek pokrycia „w karcie GPZ”', () => {
    const karta = kliknijNaglowekGpz(H5);
    const scena = buildSceneV3(H5, 2);
    const pola = scena.meta.gpzPola!;
    expect(pola.length).toBeGreaterThan(0);
    const wiersze = within(karta).getAllByTestId(/^inspektor-gpz-pole-/).map((w) => w.getAttribute('data-testid')!.replace('inspektor-gpz-pole-', ''));
    expect(wiersze).toEqual(pola.map((p) => p.bayRef));
    // Każde pole modelu stacji GPZ ma wiersz (nic nie ginie między modelem a kartą).
    const gpz = (H5.substations ?? []).find((s) => s.ref_id === scena.meta.gpzId)!;
    const bayRefyModelu = (H5.bays ?? []).filter((b) => b.substation_ref === gpz.ref_id).map((b) => b.ref_id).sort();
    expect([...wiersze].sort()).toEqual(bayRefyModelu);
    // Predykat parami: rachunek pokrycia = wiersze karty + wiersz stacji.
    expect([...resultPointsInGpzPanel(scena)].sort()).toEqual([scena.meta.gpzId!, ...wiersze].sort());
    // Nazwy pól z modelu, nie zastępcze: pole liniowe 110 kV pierwszej sekcji 110 kV i pierwsze
    // pole liniowe sekcji SN — nazwy z REKORDÓW pól (fikstura z generatora, nie zaszyte w teście).
    const [sekcjaWn] = [...(gpz.gpz_hv_sections ?? [])].sort((a, b) => a.order - b.order);
    const [sekcjaSn] = [...(gpz.gpz_sections ?? [])].sort((a, b) => a.order - b.order);
    const polaGpz = (H5.bays ?? []).filter((b) => b.substation_ref === gpz.ref_id);
    const poleWn = polaGpz.find((b) => b.bus_ref === sekcjaWn.bus_ref && b.bay_role === 'IN');
    const poleSn = polaGpz.find((b) => b.bus_ref === sekcjaSn.bus_ref && b.bay_role === 'OUT');
    expect(poleWn?.name, 'pole liniowe 110 kV sekcji 1 w modelu').toBeTruthy();
    expect(poleSn?.name, 'pole liniowe sekcji SN 1 w modelu').toBeTruthy();
    expect(within(karta).getByText(poleWn!.name!)).toBeTruthy();
    expect(within(karta).getByText(poleSn!.name!)).toBeTruthy();
  });
});
