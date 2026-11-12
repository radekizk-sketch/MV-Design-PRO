/**
 * F8c pkt 3 — testy menu kontekstowego na kanwie v3 (checklista bramkująca
 * §F8c, pozycja 3 „Context-menu"). Wzorzec fixture/setup identyczny jak
 * `sldCanvasV3Workspace.test.tsx` (F8a) — TA SAMA sieć testowa.
 *
 * Karta S9-5 (Zero-Debt pkt 5): kliki przeniesione z `fireEvent.contextMenu`
 * (pojedyncze zdarzenie syntetyczne) na `userEvent` — PEŁNĄ sekwencję
 * pointerdown → mousedown → contextmenu, czyli tę, którą wysyła przeglądarka.
 * Pojedynczy `contextmenu` omijał `onPointerDown` kanwy, więc nie wykryłby
 * regresji klasy „gest kamery kradnie prawy klik" (dokładny odpowiednik
 * martwego lewego kliku z karty S9-4).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3 } from '../../scene/buildScene';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { useSelectionStore } from '../../../../selection';
import { useNetworkBuildStore } from '../../../../network-build/networkBuildStore';
import { SldCanvasV3Workspace } from '../SldCanvasV3Workspace';
import { pierwszyObszarStacji } from './uchwytStacji';
import { powiekszKolkiemDoSkali } from './kameraTestowa';
import { useRawResultOverlayStore } from '../../../../sld-overlay/rawResultOverlayStore';

afterEach(() => {
  cleanup();
  useRawResultOverlayStore.getState().clear();
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
  useNetworkBuildStore.setState({ activeSurface: null, surfaceStack: [] });
  useSnapshotStore.setState({ snapshot: enm });
});

/** DER-MENU-V3: głęboka kopia fixtury z nadpisanym `gen_type` (kanał realny —
 *  `Generator.gen_type`; fixtura referencyjna nie niesie DER typu
 *  `synchronous`/nierozpoznanego, potrzebnego dla toru degradacji). */
function withGenType(genIndex: number, genType: unknown): { snapshot: EnergyNetworkModel; genRef: string } {
  const snapshot: EnergyNetworkModel = JSON.parse(JSON.stringify(enm));
  const gen = snapshot.generators?.[genIndex];
  expect(gen).toBeTruthy();
  (gen as { gen_type?: unknown }).gen_type = genType;
  return { snapshot, genRef: gen!.ref_id };
}

/** Karta S9-4: uchwyt trafienia symbolu o zadanym indeksie sceny — węzeł warstwy
 *  `sld-v3-trafienia`, w który w przeglądarce faktycznie trafia (także prawy)
 *  przycisk myszy; rysunek kanwy jest bierny (`pointer-events="none"`). */
function uchwytSymbolu(
  container: HTMLElement,
  scene: { readonly symbols: readonly { readonly meta?: { readonly testId?: string } }[] },
  index: number,
): Element | null {
  const testId = scene.symbols[index]?.meta?.testId ?? `sld-v3-symbol-${index}`;
  return container.querySelector(`[data-hit-for="${testId}"][data-hit-role="obrys"]`);
}

/** Węzeł RYSUNKU tego samego symbolu — nosi diagnostyczne `data-*` sceny
 *  (`data-der-kind`, `data-element-kind`, `data-owner-ref`). Karta S9-4
 *  rozdzieliła kanały: rysunek niesie tożsamość i diagnostykę, warstwa trafień
 *  niesie geometrię celu (`data-hit-*`). */
function wezelRysunku(
  container: HTMLElement,
  scene: { readonly symbols: readonly { readonly meta?: { readonly testId?: string } }[] },
  index: number,
): Element | null {
  const testId = scene.symbols[index]?.meta?.testId ?? `sld-v3-symbol-${index}`;
  return container.querySelector(`[data-testid="${testId}"]`);
}

describe('SldCanvasV3Workspace — F8c pkt 3: menu kontekstowe', () => {
  // Karta SLD-SKALA-I-NAWIGACJA (R1, R6): jedna scena nie ma symbolu stacji; z przeglądu sieci
  // celem trafienia jest OBSZAR stacji (najmniejszy rozpoznawalny obiekt hierarchii
  // aparat → pole → stacja). Intencja bez zmian: prawy klik w stację otwiera menu stacji.
  it('(a) prawy klik w obszar stacji (przegląd sieci) otwiera menu z akcjami dla stacji (SLD_MENU_REGISTRY.station)', async () => {
    const scene = buildSceneV3(enm);
    const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
    const { el } = pierwszyObszarStacji(container, scene);

    await userEvent.pointer({ keys: '[MouseRight]', target: el });

    expect(screen.getByRole('menu')).toBeTruthy();
    expect(screen.getByTestId('sld-menu-open-station-config')).toBeTruthy();
  });

  it('(b) prawy klik w tło (svg, poza symbolem/odcinkiem) otwiera menu tła (SLD_MENU_REGISTRY.background)', async () => {
    const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
    const svg = container.querySelector('[data-testid="sld-canvas-v3"]');
    expect(svg).toBeTruthy();

    await userEvent.pointer({ keys: '[MouseRight]', target: svg! });

    expect(screen.getByRole('menu')).toBeTruthy();
    expect(screen.getByTestId('sld-menu-insert-gpz')).toBeTruthy();
  });

  // DER-MENU-V3 (Karta SLD-P, GAP P-1 ZAMKNIĘTY): scena v3 niesie TERAZ
  // `meta.derKind` (realny rodzaj), więc menu kontekstowe wybiera kategorię
  // PODTYPU (der_pv/der_bess/der_fw) dla rodzajów rozpoznanych, a generyczne
  // `der` WYŁĄCZNIE dla generator/unknown (uczciwa degradacja). Scena jest jedna
  // (karta SLD-SKALA-I-NAWIGACJA, R1), więc symbole DER są na niej zawsze; celem kliku jest
  // jednak najmniejszy ROZPOZNAWALNY obiekt (R6) — z przeglądu sieci stacja, więc test
  // przybliża kółkiem (ścieżka użytkownika) do skali, przy której symbol DER jest celem.

  it('(a) DER-MENU-V3: prawy klik w symbol PV otwiera menu PODTYPU der_pv (open-pv-config + show-frt-hvrt + delete-pv + show-ncrfg)', async () => {
    const scene = buildSceneV3(enm);
    const pvIndex = scene.symbols.findIndex((s) => s.meta?.elementKind === 'der' && s.meta?.derKind === 'pv');
    expect(pvIndex).toBeGreaterThanOrEqual(0);

    const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
    powiekszKolkiemDoSkali(container, 1);
    const pvGroup = uchwytSymbolu(container, scene, pvIndex);
    expect(pvGroup).toBeTruthy();
    // Sanity: atrybut DOM diagnostyczny niesie realny rodzaj (nie zgadywany) —
    // po karcie S9-4 mieszka na węźle RYSUNKU, uchwyt niesie geometrię celu.
    expect(wezelRysunku(container, scene, pvIndex)!.getAttribute('data-der-kind')).toBe('pv');

    await userEvent.pointer({ keys: '[MouseRight]', target: pvGroup! });

    expect(screen.getByRole('menu')).toBeTruthy();
    // Pełne pozycje podtypu PV (SLD_MENU_REGISTRY.der_pv).
    expect(screen.getByTestId('sld-menu-open-pv-config')).toBeTruthy();
    expect(screen.getByTestId('sld-menu-show-frt-hvrt')).toBeTruthy();
    expect(screen.getByTestId('sld-menu-delete-pv')).toBeTruthy();
    expect(screen.getByTestId('sld-menu-show-ncrfg')).toBeTruthy();
    // NIE pozycje innych podtypów (rozłączność kategorii).
    expect(screen.queryByTestId('sld-menu-open-bess-config')).toBeNull();
    expect(screen.queryByTestId('sld-menu-open-fw-config')).toBeNull();
  });

  it('(b) DER-MENU-V3: prawy klik w DER typu generator (synchronous) otwiera menu GENERYCZNE (show-ncrfg + show-results, BEZ pozycji podtypu — uczciwa degradacja, zero zgadywania)', async () => {
    const { snapshot, genRef } = withGenType(0, 'synchronous');
    useSnapshotStore.setState({ snapshot });
    const scene = buildSceneV3(snapshot);
    const genIndex = scene.symbols.findIndex(
      (s) => s.meta?.elementKind === 'der' && s.meta?.ownerRef === genRef,
    );
    expect(genIndex).toBeGreaterThanOrEqual(0);
    expect(scene.symbols[genIndex].meta?.derKind).toBe('generator');

    const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
    powiekszKolkiemDoSkali(container, 1);
    const genGroup = uchwytSymbolu(container, scene, genIndex);
    expect(genGroup).toBeTruthy();
    expect(wezelRysunku(container, scene, genIndex)!.getAttribute('data-der-kind')).toBe('generator');

    await userEvent.pointer({ keys: '[MouseRight]', target: genGroup! });

    expect(screen.getByRole('menu')).toBeTruthy();
    expect(screen.getByTestId('sld-menu-show-ncrfg')).toBeTruthy();
    expect(screen.getByTestId('sld-menu-show-results')).toBeTruthy();
    // Pozycje subtype-specific POZOSTAJĄ niedostępne dla generator/unknown
    // (v2 nie ma kategorii dla generatora; zero fabrykacji podtypu).
    expect(screen.queryByTestId('sld-menu-open-pv-config')).toBeNull();
    expect(screen.queryByTestId('sld-menu-open-bess-config')).toBeNull();
    expect(screen.queryByTestId('sld-menu-open-fw-config')).toBeNull();
    expect(screen.queryByTestId('sld-menu-delete-pv')).toBeNull();
    expect(screen.queryByTestId('sld-menu-show-frt-hvrt')).toBeNull();
  });

  it('(c) DER-MENU-V3: akcja "Pokaż krzywe FRT/HVRT" z menu PV woła openRouteSurface(E-26) z preselekcją tego generatora (entityRef = ref DER)', async () => {
    const openRouteSurface = vi.fn();
    useNetworkBuildStore.setState({ openRouteSurface } as never);

    const scene = buildSceneV3(enm);
    const pvIndex = scene.symbols.findIndex((s) => s.meta?.elementKind === 'der' && s.meta?.derKind === 'pv');
    expect(pvIndex).toBeGreaterThanOrEqual(0);
    const pvRef = scene.symbols[pvIndex].meta!.ownerRef!;

    const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
    powiekszKolkiemDoSkali(container, 1);
    const pvGroup = uchwytSymbolu(container, scene, pvIndex);
    await userEvent.pointer({ keys: '[MouseRight]', target: pvGroup! });
    expect(screen.getByRole('menu')).toBeTruthy();

    await userEvent.click(screen.getByTestId('sld-menu-show-frt-hvrt'));

    // E-26 (ACTION_TO_SCREEN['show-frt-hvrt']) z ref klikniętego DER — realna
    // preselekcja generatora, ten sam wykonawca co v2 (`useSldActionExecutor`).
    expect(openRouteSurface).toHaveBeenCalledWith('E-26', {
      entityRef: pvRef,
      subjectKind: 'helper_context',
    });
  });
});
