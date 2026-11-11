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
import { wyczyscRejestrBiegow, zasiejBiegiNieaktualne } from '../../../../../test/biegNieaktualny';
import fxPolGpz from '../../../../../harness-fixtures/generated/pole_liniowe_z11_gpz_odgalezienie.json';

const here = dirname(fileURLToPath(import.meta.url));
const readFixture = <T,>(name: string): T =>
  JSON.parse(readFileSync(resolve(here, 'fixtures', name), 'utf8')) as T;

const enm = readFixture<EnergyNetworkModel>('s92Bieg.enm.json');
const enmPolGpz = (fxPolGpz as unknown as { readonly snapshot: EnergyNetworkModel }).snapshot;
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
  wyczyscRejestrBiegow();
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

/** Oddalenie natywnym kółkiem myszy aż pismo adnotacji GPZ spadnie poniżej progu czytelności. */
function oddalPonizejCzytelnosci(container: HTMLElement): void {
  const svg = container.querySelector('[data-testid="sld-canvas-v3"]')!;
  for (let i = 0; i < 60; i += 1) {
    if (container.querySelector('[data-testid="sld-v3-gpz-adnotacje"]')?.getAttribute('data-gpz-teksty') === 'ponizej-progu-czytelnosci') return;
    fireEvent.wheel(svg, { clientX: 40, clientY: 40, deltaY: 140 });
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
  // GEOMETRIA-STACJI: kadr całej sieci tej fikstury mieści się dziś w progu czytelności (stosy
  // pól bez rekordów są niższe i węższe — sylwetka braku danych zamiast stosu z konwencji),
  // więc stan „poniżej progu" osiągamy natywnym oddaleniem kółkiem, nie samym kadrem startowym.
  it('pismo poniżej progu czytelności (oddalony kadr): teksty nie są rysowane, tła pól i próbki ról zostają', () => {
    const container = renderKanwe(2);
    const warstwa = container.querySelector('[data-testid="sld-v3-gpz-adnotacje"]')!;
    expect(warstwa).not.toBeNull();
    oddalPonizejCzytelnosci(container);
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
    // Karta K8: model zmieniony po biegu — rewizja biegu ≠ rewizja modelu (jeden predykat).
    zasiejBiegiNieaktualne([{ id: rozplyw.run_id, analysisType: 'LOAD_FLOW' }]);
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

  // Rozszerzenie 5 karty UX-04: plakietki automatyki z kodów funkcji pola (SPZ⇔79, SCO⇔SCO,
  // LRW⇔50BF, NZ⇔NZ, OWG⇔OWG) × motyw; stan funkcji należy do nastaw (ADR-022), których
  // model nie niesie — obrys kreskowany i zdanie w podpowiedzi, nigdy domyślne „aktywna".
  // Kody wpisane do rekordów pól migawki tak, jak zapisuje je operacja pola (`protection_codes`).
  // Migawka: rozdzielnica GPZ z czterema polami liniowymi z generatora backendu (fikstura
  // `pole_liniowe_z11_gpz_odgalezienie`) — migawka biegu `s92Bieg` ma jedno pole liniowe GPZ
  // (rola FEEDER), a jej pola `OUT` należą do stacji SN/nN, więc nie mają kart „Pola GPZ".
  for (const motyw of ['dark_scada', 'light_technical'] as const) {
    it(`PLAKIETKI × motyw ${motyw}: alfabet z kodów pola, stan funkcji nieustalony i nazwany`, () => {
      useThemeModeStore.getState().setMode(motyw as ThemeMode);
      const zKodami = structuredClone(enmPolGpz);
      const liniowe = (zKodami.bays ?? [])
        .filter((b) => (b.tags ?? []).includes('gpz_line_field'))
        .sort((a, b) => a.ref_id.localeCompare(b.ref_id));
      expect(liniowe.length).toBeGreaterThan(1);
      for (const pole of liniowe) pole.protection_codes = [];
      // Zestaw szablonu Z.10 (backend `bay_templates`, każda funkcja raz — decyzja architekta
      // 2026-10-30: dawny kod złożony „SPZ/SCO" obok 79 i SCO skasowany).
      liniowe[0].protection_codes = ['51', '50', '51N', '67N', 'ZS', '50BF', '79', 'SCO'];
      liniowe[1].protection_codes = ['51', '50', '81U', '50BF', '79', 'SPZE', 'OWG', 'NZ'];
      useSnapshotStore.setState({ snapshot: zKodami });
      const container = renderKanwe(2);
      powiekszDoCzytelnosci(container);
      const flagiPola = (ref: string): string[] =>
        [...container.querySelectorAll(`[data-testid^="sld-v3-gpz-plakietka-${ref}-"]`)].map(
          (n) => n.getAttribute('data-gpz-plakietka') ?? '',
        );
      expect(flagiPola(liniowe[0].ref_id)).toEqual(['SPZ', 'SCO', 'LRW']);
      // 81U (f<) nie jest SCO — plakietki SCO nie ma.
      expect(flagiPola(liniowe[1].ref_id)).toEqual(['SPZ', 'LRW', 'NZ', 'OWG']);
      // Pole pomiaru napięcia szyn (ENEA Z.17, szablon `…_pomiar_napiecia_enea_z17`) niesie
      // automatykę SCO sekcji z rysunku i §26.9.8 / §26.10.6 Zeszytu 1 („przekaźnik zabudowany
      // w polu pomiaru napięcia") — plakietka SCO z JEGO kodów; poza tym polem i dwoma polami
      // liniowymi żaden kod nie daje plakietki (intencja: plakietki wyłącznie z kodów pól).
      const polaPomiaru = (zKodami.bays ?? []).filter((b) => b.bay_role === 'MEASUREMENT' && (b.protection_codes ?? []).length > 0);
      expect(polaPomiaru).toHaveLength(1);
      expect(polaPomiaru[0].protection_codes).toContain('SCO');
      expect(flagiPola(polaPomiaru[0].ref_id)).toEqual(['SCO']);
      const plakietki = [...container.querySelectorAll('[data-gpz-plakietka]')];
      expect(plakietki.length).toBe(3 + 4 + 1);
      for (const p of plakietki) {
        expect(p.getAttribute('data-gpz-plakietka-stan')).toBe('nieustalony');
        expect(p.querySelector('rect')!.getAttribute('stroke-dasharray')).toBe('3 2');
        expect(p.querySelector('title')!.textContent).toContain('należy do nastaw zabezpieczeń pola');
      }
    });
  }

  // Karta UX-04/POLE-LINIOWE-WZORZEC (zrzut pola Z.10 2026-10-29): wiersze bloku przekaźnika
  // pola GPZ rozjeżdżały się, bo render wyśrodkowywał tekst w prostokącie SZACOWANEJ szerokości.
  // Ścieżka natywna: migawka z generatora backendu (pola liniowe Z.11.1/Z.11 z powiązaniami
  // obwodów), powiększenie kółkiem do czytelności pisma, asercje na realnym DOM kanwy × motyw.
  for (const motyw of ['dark_scada', 'light_technical'] as const) {
    it(`BLOK PRZEKAŹNIKA × motyw ${motyw}: wiersze tekstu zaczepione we wspólnej lewej krawędzi prostokątów sceny`, () => {
      useThemeModeStore.getState().setMode(motyw as ThemeMode);
      useSnapshotStore.setState({ snapshot: enmPolGpz });
      const container = renderKanwe(2);
      // Pismo adnotacji zabezpieczeń (klasa t4, rola „dane") przekracza próg czytelności przy
      // większym powiększeniu niż teksty warstwy GPZ — kółko w środku kanwy aż do pierwszego
      // narysowanego wiersza bloku.
      const svg = container.querySelector('[data-testid="sld-canvas-v3"]')!;
      for (let i = 0; i < 60 && !container.querySelector('g[data-owner-kind="protection"] text'); i += 1) {
        fireEvent.wheel(svg, { clientX: CANVAS_W / 2, clientY: CANVAS_H / 2, deltaY: -140 });
      }
      const scena = buildSceneV3(enmPolGpz, 2);
      const wierszeSceny = scena.labels.filter(
        (l) => l.ownerKind === 'protection' && l.placement === 'right' && /#(protection-codes-full|zrodlo-u0)(-\d+)?$/.test(l.ownerRef ?? ''),
      );
      expect(wierszeSceny.length).toBeGreaterThan(2);
      let narysowane = 0;
      for (const l of wierszeSceny) {
        const t = container.querySelector(`g[data-owner-ref="${l.ownerRef}"] text`);
        if (!t) continue;
        narysowane += 1;
        expect(t.getAttribute('text-anchor'), l.ownerRef).toBe('start');
        expect(Number(t.getAttribute('x')), l.ownerRef).toBe(l.rect.x);
      }
      expect(narysowane, 'wiersze bloku narysowane po powiększeniu do czytelności').toBeGreaterThan(1);
      // Podpisy aparatów: zaczep w krawędzi od strony symbolu dla strony wybranej przez plan
      // (decyzja architekta §11.7 pkt 8 — strona lewa → `end`, prawa → `start`, nad/pod →
      // środek); intencja testu z 2026-10-29 (wyrównanie bloku nie przecieka na etykiety
      // bez reguły krawędzi) zostaje dla stron nad/pod.
      let podpisy = 0;
      for (const inne of scena.labels.filter((l) => l.ownerKind === 'apparatus' && l.rotated !== true)) {
        const g = container.querySelector(`g[data-owner-ref="${inne.ownerRef}"]`);
        const tInne = g?.querySelector('text');
        if (!g || !tInne) continue;
        podpisy += 1;
        const strona = g.getAttribute('data-label-strona');
        const oczekiwane = strona === 'left' ? 'end' : strona === 'right' ? 'start' : 'middle';
        expect(tInne.getAttribute('text-anchor'), `${inne.ownerRef} (${strona})`).toBe(oczekiwane);
      }
      expect(podpisy, 'podpisy aparatów narysowane').toBeGreaterThan(0);
    });
  }

  it('L2: oznaczenie uzwojeń transformatora GPZ dociera do DOM kanwy (stan z grupy połączeń modelu)', () => {
    const container = renderKanwe(2);
    const stany = [...container.querySelectorAll('[data-uzwojenia-stan]')].map((n) => n.getAttribute('data-uzwojenia-stan'));
    expect(stany.length).toBeGreaterThan(0);
    const scena = buildSceneV3(enm, 2);
    const oczekiwane = scena.symbols.filter((s) => s.uzwojenia).map((s) => s.uzwojenia!.stan);
    expect(stany.slice(0, oczekiwane.length).sort()).toEqual([...oczekiwane].sort());
  });
});
