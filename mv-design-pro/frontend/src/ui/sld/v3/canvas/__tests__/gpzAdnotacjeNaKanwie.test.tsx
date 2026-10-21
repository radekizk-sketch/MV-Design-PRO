/**
 * GPZ-PARYTET — adnotacje bloku GPZ na kanwie v3, ścieżką NATYWNĄ: stan globalny
 * ustawiony tak, jak ustawia go produkcja (`useSnapshotStore` + `useRawResultOverlayStore`
 * zasilany z `/api/execution/runs/{run}/results/v1` — fikstura z ŻYWEGO biegu
 * rozpływowego, `s92Rozplyw.overlay.json`), powiększenie natywnym kółkiem myszy,
 * asercje na realnym DOM kanwy.
 *
 * Iloczyn cech: stan wyniku (brak biegu × rozpływ aktualny × rozpływ nieaktualny ×
 * bieg innej analizy — zwarcie) × motyw (dyspozytorski × techniczny jasny) × czytelność
 * pisma (poniżej progu × powyżej progu) × poziom szczegółu (L0 zwinięty × L2 rozwinięty).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { useSelectionStore } from '../../../../selection';
import { useAppStateStore } from '../../../../app-state';
import { SldCanvasV3Workspace } from '../SldCanvasV3Workspace';
import {
  useRawResultOverlayStore,
  type RawMetricValue,
  type RawOverlayPayload,
} from '../../../../sld-overlay/rawResultOverlayStore';
import { useOverlayStore } from '../../../../sld-overlay/overlayStore';
import { useSldDeltaOverlayStore } from '../../../../sld-overlay/sldDeltaOverlayStore';
import { useThemeModeStore, type ThemeMode } from '../../../../../ui2/theme/themeMode';
import { sldPaletteForTheme } from '../../theme/palette';
import { buildSceneV3 } from '../../scene/buildScene';
import { KRYCIE_TLA_POLA_GPZ } from '../GpzAdnotacjeWarstwa';

const here = dirname(fileURLToPath(import.meta.url));
const readFixture = <T,>(name: string): T =>
  JSON.parse(readFileSync(resolve(here, 'fixtures', name), 'utf8')) as T;

const enm = readFixture<EnergyNetworkModel>('s92Bieg.enm.json');
const rozplyw = readFixture<RawOverlayPayload>('s92Rozplyw.overlay.json');
const zwarcie = readFixture<RawOverlayPayload>('s92Zwarcie.overlay.json');
const gpz = (enm.substations ?? []).find((s) => s.station_type === 'gpz')!;
const wierszPola = Object.values(rozplyw.elements).find((e) => e.kind === 'bay')!;
const wierszStacji = rozplyw.elements[gpz.ref_id];

/** Zapis liczby wg `format_hint` — wyrocznia testu jest niezależna od kodu produktu. */
const zapis = (m: RawMetricValue): string =>
  (m.value as number).toFixed({ fixed0: 0, fixed1: 1, fixed2: 2, fixed4: 4 }[m.format_hint ?? 'fixed2'] ?? 2).replace('.', ',');

const CANVAS_W = 1322;
const CANVAS_H = 696;

beforeEach(() => {
  if (typeof URL.createObjectURL !== 'function') URL.createObjectURL = () => 'blob:shim';
  if (typeof URL.revokeObjectURL !== 'function') URL.revokeObjectURL = () => {};
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
  useRawResultOverlayStore.getState().clear();
  useOverlayStore.getState().clearOverlay();
  useSldDeltaOverlayStore.getState().wyczyscRoznice();
  useAppStateStore.getState().reset();
  useThemeModeStore.getState().setMode('dark_scada');
  useSnapshotStore.setState({ snapshot: enm });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useRawResultOverlayStore.getState().clear();
  useAppStateStore.getState().reset();
  useThemeModeStore.getState().setMode('dark_scada');
});

function renderKanwe(lod: 0 | 1 | 2): HTMLElement {
  const { container } = render(<SldCanvasV3Workspace width={CANVAS_W} height={CANVAS_H} lodOverride={lod} />);
  return container;
}

/** Powiększenie natywnym kółkiem myszy aż pismo adnotacji GPZ przekroczy próg czytelności. */
function powiekszDoCzytelnosci(container: HTMLElement): void {
  const svg = container.querySelector('[data-testid="sld-canvas-v3"]')!;
  for (let i = 0; i < 60; i += 1) {
    if (container.querySelector('[data-testid="sld-v3-gpz-adnotacje"]')?.getAttribute('data-gpz-teksty') === 'widoczne') return;
    fireEvent.wheel(svg, { clientX: 40, clientY: 40, deltaY: -140 });
  }
}

const tekst = (container: HTMLElement, testId: string): string | null =>
  container.querySelector(`[data-testid="${testId}"]`)?.textContent ?? null;

describe('GPZ-PARYTET — kontrola wejścia fikstury z żywego biegu', () => {
  it('rozpływ niesie wiersz pola GPZ i wiersz bilansu GPZ (kind bay / substation) z kompletem metryk', () => {
    expect(wierszPola.metrics.P_MW).toBeDefined();
    expect(wierszPola.metrics.U_kV).toBeDefined();
    expect(wierszStacji.kind).toBe('substation');
    expect(wierszStacji.metrics.P_SUPPLY_MW).toBeDefined();
    expect(wierszStacji.metrics.ALARM_COUNT).toBeDefined();
  });
});

describe('GPZ-PARYTET — adnotacje bloku GPZ na kanwie (ścieżka natywna)', () => {
  it('pismo poniżej progu czytelności (kadr całej sieci): teksty nie są rysowane, tła pól i próbki ról zostają', () => {
    const container = renderKanwe(2);
    const warstwa = container.querySelector('[data-testid="sld-v3-gpz-adnotacje"]')!;
    expect(warstwa).not.toBeNull();
    expect(warstwa.getAttribute('data-gpz-teksty')).toBe('ponizej-progu-czytelnosci');
    expect(container.querySelector('[data-testid="sld-v3-gpz-bilans-zasilania"]')).toBeNull();
    expect(container.querySelectorAll('[data-testid^="sld-v3-gpz-panel-"]').length).toBeGreaterThan(0);
    powiekszDoCzytelnosci(container);
    expect(warstwa.getAttribute('data-gpz-teksty')).toBe('widoczne');
    expect(container.querySelector('[data-testid="sld-v3-gpz-bilans-zasilania"]')).not.toBeNull();
  });

  it('BRAK BIEGU: belka i tabela mówią jawnie „brak wyniku rozpływu mocy", wartości pól „brak" (nie zero)', () => {
    const container = renderKanwe(2);
    powiekszDoCzytelnosci(container);
    const warstwa = container.querySelector('[data-testid="sld-v3-gpz-adnotacje"]')!;
    expect(warstwa.getAttribute('data-gpz-wynik')).toBe('brak');
    expect(tekst(container, 'sld-v3-gpz-bilans-zasilania')).toBe('Zasilanie GPZ: brak wyniku rozpływu mocy');
    expect(tekst(container, 'sld-v3-gpz-bilans-odplywow')).toBe('Odpływy GPZ: brak wyniku rozpływu mocy');
    expect(tekst(container, 'sld-v3-gpz-alarmy')).toBe('Przeciążenia w GPZ: brak wyniku rozpływu mocy');
    expect(tekst(container, 'sld-v3-gpz-tabela-tytul')).toBe('Pola GPZ — brak wyniku rozpływu mocy');
    const wartosci = [...container.querySelectorAll('[data-testid^="sld-v3-gpz-wartosc-"]')].map((n) => n.textContent);
    expect(wartosci.length).toBeGreaterThan(0);
    expect(wartosci.every((w) => w === 'brak')).toBe(true);
  });

  it('ROZPŁYW AKTUALNY: bilans, alarmy i pomiary pola to wartości wierszy backendu (1:1, tylko formatowanie)', () => {
    useRawResultOverlayStore.getState().setPayload(rozplyw);
    const container = renderKanwe(2);
    powiekszDoCzytelnosci(container);
    expect(container.querySelector('[data-testid="sld-v3-gpz-adnotacje"]')!.getAttribute('data-gpz-wynik')).toBe('aktualny');
    const m = wierszStacji.metrics;
    expect(tekst(container, 'sld-v3-gpz-bilans-zasilania')).toBe(
      `Zasilanie GPZ: P = ${zapis(m.P_SUPPLY_MW)} MW, Q = ${zapis(m.Q_SUPPLY_Mvar)} Mvar`,
    );
    expect(tekst(container, 'sld-v3-gpz-bilans-odplywow')).toBe(
      `Odpływy GPZ: P = ${zapis(m.P_FEEDERS_MW)} MW, Q = ${zapis(m.Q_FEEDERS_Mvar)} Mvar`,
    );
    expect(tekst(container, 'sld-v3-gpz-alarmy')).toBe(`Przeciążenia w GPZ: ${zapis(m.ALARM_COUNT)}`);
    expect(tekst(container, 'sld-v3-gpz-tabela-tytul')).toBe('Pola GPZ — wynik rozpływu mocy');
    const ref = wierszPola.ref_id;
    expect(tekst(container, `sld-v3-gpz-wartosc-${ref}-p`)).toBe(zapis(wierszPola.metrics.P_MW));
    expect(tekst(container, `sld-v3-gpz-wartosc-${ref}-q`)).toBe(zapis(wierszPola.metrics.Q_Mvar));
    expect(tekst(container, `sld-v3-gpz-wartosc-${ref}-i`)).toBe(zapis(wierszPola.metrics.I_A));
    expect(tekst(container, `sld-v3-gpz-wartosc-${ref}-u`)).toBe(zapis(wierszPola.metrics.U_kV));
  });

  it('ROZPŁYW NIEAKTUALNY (OUTDATED): wartości zostają, ale belka i tytuł niosą „wynik nieaktualny", kolor wyniku nieaktualnego', () => {
    useRawResultOverlayStore.getState().setPayload(rozplyw);
    useAppStateStore.setState({ activeCaseResultStatus: 'OUTDATED' });
    const container = renderKanwe(2);
    powiekszDoCzytelnosci(container);
    expect(container.querySelector('[data-testid="sld-v3-gpz-adnotacje"]')!.getAttribute('data-gpz-wynik')).toBe('nieaktualny');
    expect(tekst(container, 'sld-v3-gpz-alarmy')).toBe(`Przeciążenia w GPZ: ${zapis(wierszStacji.metrics.ALARM_COUNT)} · wynik nieaktualny`);
    expect(tekst(container, 'sld-v3-gpz-tabela-tytul')).toBe('Pola GPZ — wynik rozpływu mocy · wynik nieaktualny');
    const p = container.querySelector(`[data-testid="sld-v3-gpz-wartosc-${wierszPola.ref_id}-p"]`)!;
    expect(p.textContent).toBe(zapis(wierszPola.metrics.P_MW));
    expect(p.getAttribute('fill')).toBe(sldPaletteForTheme('dark_scada').highlight.resultStale);
  });

  it('BIEG INNEJ ANALIZY (zwarcie): GPZ nie udaje bilansu — „brak wyniku rozpływu mocy"', () => {
    useRawResultOverlayStore.getState().setPayload(zwarcie);
    const container = renderKanwe(2);
    powiekszDoCzytelnosci(container);
    expect(container.querySelector('[data-testid="sld-v3-gpz-adnotacje"]')!.getAttribute('data-gpz-wynik')).toBe('brak');
    expect(tekst(container, 'sld-v3-gpz-bilans-zasilania')).toBe('Zasilanie GPZ: brak wyniku rozpływu mocy');
  });

  for (const motyw of ['dark_scada', 'light_technical'] as const satisfies readonly ThemeMode[]) {
    it(`TŁA PÓL × motyw ${motyw}: kolor każdego tła = token roli palety motywu, legenda tylko z ról obecnych`, () => {
      useThemeModeStore.getState().setMode(motyw);
      const container = renderKanwe(2);
      const paleta = sldPaletteForTheme(motyw);
      const panele = [...container.querySelectorAll('[data-testid^="sld-v3-gpz-panel-"]')];
      const scena = buildSceneV3(enm, 2);
      expect(panele.length).toBe(scena.meta.gpzAdnotacje!.panele.length);
      expect(panele.length).toBeGreaterThan(0);
      for (const panel of panele) {
        const rola = panel.getAttribute('data-gpz-rola') as keyof typeof paleta.rolaPola;
        expect(panel.getAttribute('fill')).toBe(paleta.rolaPola[rola]);
        expect(panel.getAttribute('fill-opacity')).toBe(String(KRYCIE_TLA_POLA_GPZ));
      }
      const roleLegendy = [...container.querySelectorAll('[data-testid^="sld-v3-gpz-legenda-"]')]
        .map((n) => n.getAttribute('data-testid')!)
        .filter((id) => !id.includes('-tekst-'))
        .map((id) => id.replace('sld-v3-gpz-legenda-', ''));
      const roleKart = new Set(scena.meta.gpzAdnotacje!.tabela!.karty.map((k) => k.rola));
      expect(new Set(roleLegendy)).toEqual(roleKart);
    });
  }

  it('L0 (blok zwinięty): brak adnotacji pól — nie ma pól, których by dotyczyły; dane glifu bloku docierają do DOM', () => {
    const container = renderKanwe(0);
    expect(container.querySelector('[data-testid="sld-v3-gpz-adnotacje"]')).toBeNull();
    const blok = container.querySelector('[data-gpz-sections]');
    expect(blok, 'glif zwiniętego GPZ dostaje liczbę sekcji z kompozycji').not.toBeNull();
  });

  it('L2: oznaczenie uzwojeń transformatora GPZ dociera do DOM kanwy (stan z grupy połączeń modelu)', () => {
    const container = renderKanwe(2);
    const stany = [...container.querySelectorAll('[data-uzwojenia-stan]')].map((n) => n.getAttribute('data-uzwojenia-stan'));
    expect(stany.length).toBeGreaterThan(0);
    const scena = buildSceneV3(enm, 2);
    const oczekiwane = scena.symbols.filter((s) => s.uzwojenia).map((s) => s.uzwojenia!.stan);
    expect(stany.slice(0, oczekiwane.length).sort()).toEqual([...oczekiwane].sort());
  });
});
