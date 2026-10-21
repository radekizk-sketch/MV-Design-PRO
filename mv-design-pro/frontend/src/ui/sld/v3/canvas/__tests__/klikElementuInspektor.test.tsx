/**
 * UI-02b JEDEN-INSPEKTOR — klik obiektu kanwy v3 zaznacza go i pokazuje w PRAWYM
 * INSPEKTORZE; kanwa nie otwiera żadnego własnego panelu (dawna szuflada szczegółów
 * skasowana). Ścieżka natywna: klik w uchwyt trafienia (`data-hit-for`), jak mysz.
 *
 * Iloczyn cech: rodzaj obiektu {stacja · transformator · aparat · źródło OZE · odcinek ·
 * szyna} × montaż {sama kanwa · kanwa + inspektor} × stan inspektora powłoki {zwinięty ·
 * rozwinięty} × wyjście {Escape · klik w tło}.
 * Wzorzec fixture/setup identyczny jak `sldCanvasV3Workspace.test.tsx` (F8a).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3 } from '../../scene/buildScene';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { useSelectionStore } from '../../../../selection';
import { SldCanvasV3Workspace } from '../SldCanvasV3Workspace';
import { useRawResultOverlayStore } from '../../../../sld-overlay/rawResultOverlayStore';
import { useKontekstElementuKanwy } from '../../../shared/kontekstElementuKanwy';
import { useShellStore } from '../../../../../ui2/shell/useShellStore';
import { InspektorKanwyTestowy } from '../../../../network-build/inspektor-elementu/__tests__/inspektorKanwyTestowy';
import { POLOZENIE_LACZNIKA_PL } from '../../../../network-build/inspektor-elementu/PanelElementuKanwy';

afterEach(() => {
  cleanup();
  useRawResultOverlayStore.getState().clear();
  useKontekstElementuKanwy.getState().wyczysc();
});

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

beforeEach(() => {
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
  useRawResultOverlayStore.getState().clear();
  useSnapshotStore.setState({ snapshot: enm });
});

/** Karta S9-4: uchwyt trafienia obiektu sceny — węzeł warstwy
 *  `sld-v3-trafienia`, który w przeglądarce faktycznie łapie zdarzenie
 *  (rysunek kanwy jest bierny, `pointer-events="none"`). Adresowany tym samym
 *  `testId`, co węzeł rysunku, więc intencja testów zostaje bez zmian. */
function uchwytTrafienia(container: HTMLElement, testId: string): Element | null {
  return container.querySelector(`[data-hit-for="${testId}"][data-hit-role="obrys"]`);
}

/** Uchwyt symbolu po indeksie sceny (testId ze sceny albo fallback indeksowy). */
function uchwytSymbolu(
  container: HTMLElement,
  scene: { readonly symbols: readonly { readonly meta?: { readonly testId?: string } }[] },
  index: number,
): Element | null {
  return uchwytTrafienia(container, scene.symbols[index]?.meta?.testId ?? `sld-v3-symbol-${index}`);
}

const zaznaczone = () => useSelectionStore.getState().selectedElements.map((e) => e.id);

function renderZInspektorem() {
  return render(
    <>
      <SldCanvasV3Workspace width={800} height={600} lodOverride={2} />
      <InspektorKanwyTestowy />
    </>,
  );
}

function pierwszySymbol(lod: 0 | 1 | 2, predykat: (s: ReturnType<typeof buildSceneV3>['symbols'][number]) => boolean) {
  const scene = buildSceneV3(enm, lod);
  const index = scene.symbols.findIndex(predykat);
  expect(index, 'symbol obecny w scenie').toBeGreaterThanOrEqual(0);
  return { scene, index, symbol: scene.symbols[index] };
}

describe('SldCanvasV3Workspace — UI-02b: klik obiektu → selekcja i prawy inspektor', () => {
  it('kanwa sama NIE renderuje panelu szczegółów: klik w stację zaznacza ją, a w drzewie kanwy nie ma żadnego panelu elementu', () => {
    const { scene, index, symbol } = pierwszySymbol(0, (s) => s.meta?.elementKind === 'station' && s.symbolId !== 'gpzCollapsed');
    const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
    fireEvent.click(uchwytSymbolu(container, scene, index)!);
    expect(zaznaczone()).toEqual([symbol.meta!.ownerRef]);
    expect(container.querySelector('[data-testid="inspektor-element-kanwy"]')).toBeNull();
    expect(container.querySelector('[data-testid^="sld-v2-detail-drawer"]')).toBeNull();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('klik w stację: inspektor pokazuje stację (nazwa, rodzaj) z paskiem działań i sekcją wyników', () => {
    const { scene, index, symbol } = pierwszySymbol(0, (s) => s.meta?.elementKind === 'station' && s.symbolId !== 'gpzCollapsed');
    const { container } = render(
      <>
        <SldCanvasV3Workspace width={800} height={600} />
        <InspektorKanwyTestowy />
      </>,
    );
    fireEvent.click(uchwytSymbolu(container, scene, index)!);
    const panel = screen.getByTestId('inspektor-element-kanwy');
    expect(panel).toHaveAttribute('data-rodzaj', 'station');
    expect(panel).toHaveAttribute('data-element-id', symbol.meta!.ownerRef!);
    const stacja = enm.substations.find((s) => s.ref_id === symbol.meta!.ownerRef)!;
    expect(screen.getByTestId('inspektor-element-etykieta').textContent).toBe(stacja.name);
    expect(screen.getByTestId('inspektor-dzialania')).toBeInTheDocument();
    expect(screen.getByTestId('inspektor-wyniki')).toHaveAttribute('data-stan', 'brak');
  });

  it('Escape i klik w tło zdejmują wskazanie — inspektor wraca do stanu „bez zaznaczenia"', () => {
    const { scene, index } = pierwszySymbol(0, (s) => s.meta?.elementKind === 'station' && s.symbolId !== 'gpzCollapsed');
    const { container } = render(
      <>
        <SldCanvasV3Workspace width={800} height={600} />
        <InspektorKanwyTestowy />
      </>,
    );
    fireEvent.click(uchwytSymbolu(container, scene, index)!);
    expect(screen.getByTestId('inspektor-element-kanwy')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(zaznaczone()).toEqual([]);
    expect(screen.queryByTestId('inspektor-element-kanwy')).toBeNull();

    fireEvent.click(uchwytSymbolu(container, scene, index)!);
    expect(screen.getByTestId('inspektor-element-kanwy')).toBeInTheDocument();
    fireEvent.click(container.querySelector('[data-testid="sld-canvas-v3"]')!);
    expect(zaznaczone()).toEqual([]);
    expect(screen.queryByTestId('inspektor-element-kanwy')).toBeNull();
  });

  it('klik ODSŁANIA zwinięty inspektor aktywnej przestrzeni — także przy ponownym kliku tego samego obiektu', () => {
    const { scene, index } = pierwszySymbol(0, (s) => s.meta?.elementKind === 'station' && s.symbolId !== 'gpzCollapsed');
    const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
    const przestrzen = useShellStore.getState().activeSpace;
    const zwiniety = () => useShellStore.getState().layoutBySpace[przestrzen]?.rightCollapsed ?? true;
    act(() => useShellStore.getState().setRightCollapsed(przestrzen, true));
    expect(zwiniety()).toBe(true);
    fireEvent.click(uchwytSymbolu(container, scene, index)!);
    expect(zwiniety()).toBe(false);
    act(() => useShellStore.getState().setRightCollapsed(przestrzen, true));
    fireEvent.click(uchwytSymbolu(container, scene, index)!, { detail: 1 });
    expect(zwiniety()).toBe(false);
  });

  it('klik w transformator: selekcja niesie REALNY ref transformatora, inspektor pokazuje transformator', () => {
    // KD-5: symbol transformatora istnieje od L1 (na L0 stacje są zwinięte).
    const { scene, index } = pierwszySymbol(2, (s) => s.meta?.elementKind === 'transformer');
    const { container } = renderZInspektorem();
    fireEvent.click(uchwytSymbolu(container, scene, index)!);
    const ref = zaznaczone()[0];
    expect(enm.transformers.some((t) => t.ref_id === ref)).toBe(true);
    expect(screen.getByTestId('inspektor-element-kanwy')).toHaveAttribute('data-rodzaj', 'transformer');
    expect(screen.getByTestId('inspektor-element-etykieta').textContent).toBeTruthy();
  });

  it('klik w aparat: inspektor pokazuje aparat ze ścieżką stacji › pola i sekcją stanu (brak telemetrii bez rekordu źródła)', () => {
    const { scene, index, symbol } = pierwszySymbol(2, (s) => s.meta?.elementKind === 'apparatus');
    const { container } = renderZInspektorem();
    fireEvent.click(uchwytSymbolu(container, scene, index)!);
    expect(screen.getByTestId('inspektor-element-kanwy')).toHaveAttribute('data-rodzaj', 'apparatus');
    expect(screen.getByTestId('inspektor-element-sciezka').textContent).toContain('›');
    // Telemetria (tryb, komunikacja) — wyłącznie z rekordu źródła runtime: bez rekordu
    // „brak telemetrii". Położenie łącznika — z modelu, TEN SAM stan co glif klikniętego
    // symbolu (symbol stosu bez aparatu pierwotnego: agregat roli pola; pełny iloczyn —
    // `stanAparatuParytetGlifu.test.tsx`).
    expect(screen.getByTestId('inspektor-aparat-komunikacja').textContent).toBe('brak telemetrii');
    expect(symbol.state, 'pierwszy aparat sceny to łącznik ze stanem glifu').toBeDefined();
    expect(screen.getByTestId('inspektor-aparat-stan').textContent).toBe(POLOZENIE_LACZNIKA_PL[symbol.state!]);
  });

  it('klik w źródło OZE: brak danych panelu, ale inspektor pokazuje działania z menu źródła i sekcję wyników', () => {
    const { scene, index } = pierwszySymbol(2, (s) => s.meta?.elementKind === 'der');
    const { container } = renderZInspektorem();
    expect(() => fireEvent.click(uchwytSymbolu(container, scene, index)!)).not.toThrow();
    const panel = screen.getByTestId('inspektor-element-kanwy');
    expect(panel).toHaveAttribute('data-rodzaj', '');
    expect(screen.getByTestId('inspektor-dzialania')).toBeInTheDocument();
    expect(screen.getByTestId('inspektor-wyniki')).toBeInTheDocument();
    expect(screen.queryByTestId('inspektor-element-etykieta')).toBeNull();
  });

  it('klik w odcinek SN: inspektor ma wejście do konfiguratora odcinka (E-12, karta trasy) i wyniki odcinka', () => {
    const scene = buildSceneV3(enm, 2);
    const index = scene.segments.findIndex(
      (s) => s.meta?.elementKind === 'segment' && s.meta.ownerRef && !s.meta.ownerRef.includes('#'),
    );
    expect(index).toBeGreaterThanOrEqual(0);
    const testId = scene.segments[index].meta?.testId ?? `sld-v3-segment-${index}`;
    const { container } = renderZInspektorem();
    const hit = container.querySelector(`[data-hit-for="${testId}"]`);
    expect(hit, 'odcinek ma uchwyt trafienia').not.toBeNull();
    fireEvent.click(hit!);
    expect(screen.getByTestId('inspektor-element-kanwy')).toHaveAttribute('data-rodzaj', 'cable_run');
    expect(screen.getByTestId('inspektor-otworz-konfiguracje').textContent).toBe('Otwórz konfigurację odcinka (trasa)');
    expect(screen.getByTestId('inspektor-wyniki')).toBeInTheDocument();
  });

  it('klik w KAŻDY odcinek sieci (także połówki `_L`/`_R` po cięciu) zaznacza REALNĄ gałąź modelu', () => {
    // Przyrostki `_L`/`_R` to realne gałęzie ENM po cięciu łącznikiem albo stacją. Dawne
    // obcinanie ich w selekcji dawało ref nieistniejący w modelu (71 z 88 odcinków tej
    // sieci) — synchronizacja selekcji go czyściła i klik był martwy w żywej aplikacji.
    const refyGalezi = new Set((enm.branches ?? []).map((b) => b.ref_id));
    const scene = buildSceneV3(enm, 2);
    const odcinki = scene.segments
      .map((s, i) => ({ ref: s.meta?.ownerRef ?? '', kind: s.meta?.elementKind, testId: s.meta?.testId ?? `sld-v3-segment-${i}` }))
      .filter((s) => s.kind === 'segment' && s.ref !== '' && !s.ref.includes('#'));
    const zPrzyrostkiem = odcinki.filter((s) => /_[LR]$/.test(s.ref));
    expect(zPrzyrostkiem.length, 'sieć ma połówki odcinków po cięciu').toBeGreaterThan(0);
    const { container } = render(<SldCanvasV3Workspace width={1322} height={696} lodOverride={2} />);
    let klikniete = 0;
    for (const odcinek of odcinki) {
      const hit = container.querySelector(`[data-hit-for="${odcinek.testId}"]`);
      if (!hit) continue;
      fireEvent.click(hit, { detail: 1 });
      klikniete += 1;
      expect(zaznaczone(), `klik w ${odcinek.ref}`).toEqual([odcinek.ref]);
      expect(refyGalezi.has(odcinek.ref), `${odcinek.ref} istnieje w modelu`).toBe(true);
    }
    expect(klikniete, 'kliknięto odcinki z uchwytem trafienia').toBeGreaterThan(zPrzyrostkiem.length / 2);
  });

  it('klik w szynę: inspektor pokazuje szynę z działaniami szyny (ref kompozytowy rysunku → kotwica modelu)', () => {
    const scene = buildSceneV3(enm, 2);
    const index = scene.segments.findIndex((s) => s.meta?.elementKind === 'bus' && s.meta?.ownerRef);
    expect(index).toBeGreaterThanOrEqual(0);
    const testId = scene.segments[index].meta?.testId ?? `sld-v3-segment-${index}`;
    const { container } = renderZInspektorem();
    fireEvent.click(container.querySelector(`[data-hit-for="${testId}"]`)!);
    expect(zaznaczone().length).toBe(1);
    expect(screen.getByTestId('inspektor-dzialania')).toBeInTheDocument();
  });
});

describe('SldCanvasV3Workspace — UI-02b: klik w węzeł SN (punkt odgałęźny) → karta węzła w inspektorze', () => {
  const sciezkaZksn = resolve(here, '..', '..', 'scene', '__tests__', 'fixtures', 'elementyCiagu-zksn.enm.json');
  const enmZksn = (JSON.parse(readFileSync(sciezkaZksn, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

  it('punkt odgałęźny ZK SN: sekcja węzła z rodzajem z rekordu modelu i wejście do karty ZK SN (E-14)', () => {
    useSnapshotStore.setState({ snapshot: enmZksn });
    const scene = buildSceneV3(enmZksn, 2);
    const index = scene.symbols.findIndex((s) => s.meta?.elementKind === 'branchPoint');
    expect(index, 'scena ma punkt odgałęźny').toBeGreaterThanOrEqual(0);
    const { container } = renderZInspektorem();
    fireEvent.click(uchwytSymbolu(container, scene, index)!);
    expect(screen.getByTestId('inspektor-element-kanwy')).toHaveAttribute('data-rodzaj', 'node');
    expect(screen.getByTestId('inspektor-wezel-rodzaj').textContent).toBe('Złącze kablowe SN');
    expect(screen.getByTestId('inspektor-otworz-konfiguracje').textContent).toBe('Otwórz kartę złącza kablowego SN');
  });
});
