/**
 * UX-04 — AKCJA Z MENU OBIEKTU ZAZNACZA TEN OBIEKT (pomiar 2026-10-29, zrzut okna pola).
 *
 * Defekt: prawy klik w wyłącznik pola GPZ → „Otwórz kartę pola" otwierał kartę pola, a prawy
 * inspektor pokazywał nadal POPRZEDNIE zaznaczenie (odcinek kablowy po kreatorze magistrali) —
 * karta i inspektor mówiły o dwóch różnych obiektach. Reguła (`SldCanvasV3Workspace`
 * `handleContextMenuAction`): wykonanie akcji z menu obiektu najpierw zaznacza obiekt TĄ SAMĄ
 * ścieżką co natywny lewy klik; otwarcie i zamknięcie menu bez akcji zaznaczenia nie zmienia;
 * menu tła nie ma obiektu; uzbrojona paleta OZE nie jest „zrzucana" akcją z menu.
 *
 * Iloczyn cech: obiekt {aparat pola GPZ, stacja SN/nN} × akcja {nawigacyjna (karta), formularzowa
 * (operacja), brak akcji (Escape)} × zaznaczenie wstępne {inny obiekt} + menu tła + paleta OZE.
 * Wyrocznia: wynik NATYWNEGO lewego kliku w ten sam uchwyt (jedno źródło refu selekcji).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import fxZ11 from '../../../../../harness-fixtures/generated/pole_liniowe_z11_gpz_odgalezienie.json';
import { buildSceneV3 } from '../../scene/buildScene';
import { useAppStateStore } from '../../../../app-state';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { useSelectionStore } from '../../../../selection';
import { useNetworkBuildStore } from '../../../../network-build/networkBuildStore';
import { useNotificationStore } from '../../../../notifications/store';
import { SldCanvasV3Workspace } from '../SldCanvasV3Workspace';
import { useRawResultOverlayStore } from '../../../../sld-overlay/rawResultOverlayStore';
import { InspektorKanwyTestowy } from '../../../../network-build/inspektor-elementu/__tests__/inspektorKanwyTestowy';

const here = dirname(fileURLToPath(import.meta.url));
const enm52 = (
  JSON.parse(
    readFileSync(resolve(here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json'), 'utf8'),
  ) as { readonly enm: EnergyNetworkModel }
).enm;
const enmGpz = (fxZ11 as unknown as { readonly snapshot: EnergyNetworkModel }).snapshot;

afterEach(() => {
  cleanup();
  useRawResultOverlayStore.getState().clear();
});

beforeEach(() => {
  useAppStateStore.getState().reset();
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
  useNotificationStore.getState().clearAll();
  useNetworkBuildStore.setState({ activeSurface: null, surfaceStack: [] });
});

function zaznaczone(): string[] {
  return useSelectionStore.getState().selectedElements.map((e) => e.id);
}

/** Uchwyt obiektu w warstwie trafień — ten sam węzeł, w który trafia mysz. */
function uchwyt(container: HTMLElement, selektor: string): Element {
  const el = container.querySelector(selektor);
  expect(el, selektor).toBeTruthy();
  return el!;
}

/** Wyrocznia: zaznaczenie po NATYWNYM lewym kliku w uchwyt (osobny render, czyste zaznaczenie). */
function zaznaczenieLewegoKliku(snapshot: EnergyNetworkModel, selektor: string): string[] {
  useSnapshotStore.setState({ snapshot });
  useSelectionStore.getState().clearSelection();
  const { container, unmount } = render(<SldCanvasV3Workspace width={800} height={600} />);
  fireEvent.click(uchwyt(container, selektor));
  const wynik = zaznaczone();
  unmount();
  useSelectionStore.getState().clearSelection();
  return wynik;
}

const KABEL = 'seg/a40aac5dfd5da2982a74d4b05edb8f82/segment';

type Przypadek = {
  readonly nazwa: string;
  readonly snapshot: () => EnergyNetworkModel;
  readonly selektor: () => string;
  readonly wstepne: () => string;
  readonly akcjaNawigacyjna: string;
  readonly akcjaFormularzowa: string;
};

function selektorStacji(): string {
  const scene = buildSceneV3(enm52, 0);
  const i = scene.symbols.findIndex((s) => s.meta?.elementKind === 'station');
  const testId = scene.symbols[i]?.meta?.testId ?? `sld-v3-symbol-${i}`;
  return `[data-hit-for="${testId}"][data-hit-role="obrys"]`;
}

function selektorWylacznikaPola(): string {
  const bay = (enmGpz.bays ?? []).find((b) => (b.primary_devices ?? []).some((d) => d.designation === 'Q0'))!;
  const q0 = bay.primary_devices!.find((d) => d.designation === 'Q0')!;
  return `[data-hit-klasa="aparat"][data-hit-device-ref="${q0.device_ref}"]`;
}

const PRZYPADKI: readonly Przypadek[] = [
  {
    nazwa: 'wyłącznik pola liniowego GPZ',
    snapshot: () => enmGpz,
    selektor: selektorWylacznikaPola,
    wstepne: () => KABEL,
    akcjaNawigacyjna: 'sld-menu-open-bay',
    akcjaFormularzowa: 'sld-menu-add-arrester',
  },
  {
    nazwa: 'stacja SN/nN',
    snapshot: () => enm52,
    selektor: selektorStacji,
    wstepne: () => enm52.branches[0]!.ref_id,
    akcjaNawigacyjna: 'sld-menu-open-station-config',
    akcjaFormularzowa: 'sld-menu-add-load',
  },
];

describe('UX-04 — akcja z menu obiektu zaznacza ten obiekt (inspektor = karta)', () => {
  for (const p of PRZYPADKI) {
    for (const rodzaj of ['nawigacyjna', 'formularzowa', 'brak'] as const) {
      it(`${p.nazwa} × akcja ${rodzaj} × wcześniej zaznaczony inny obiekt`, () => {
        const oczekiwane = zaznaczenieLewegoKliku(p.snapshot(), p.selektor());
        expect(oczekiwane.length, 'lewy klik zaznacza obiekt').toBe(1);
        const openRouteSurface = vi.fn();
        const openOperationForm = vi.fn();
        useNetworkBuildStore.setState({ openRouteSurface, openOperationForm } as never);
        useAppStateStore.setState({ activeCaseId: 'przypadek-menu' });
        useSnapshotStore.setState({ snapshot: p.snapshot() });
        const { container } = render(
          <>
            <SldCanvasV3Workspace width={800} height={600} />
            <InspektorKanwyTestowy />
          </>,
        );
        useSelectionStore.getState().selectElement({ id: p.wstepne(), type: 'LineBranch', name: p.wstepne() });
        expect(zaznaczone()).toEqual([p.wstepne()]);

        fireEvent.contextMenu(uchwyt(container, p.selektor()), { clientX: 120, clientY: 80 });
        expect(screen.getByRole('menu')).toBeTruthy();
        // Otwarcie menu samo nie zmienia zaznaczenia.
        expect(zaznaczone()).toEqual([p.wstepne()]);
        if (rodzaj === 'brak') {
          fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
          fireEvent.keyDown(document, { key: 'Escape' });
          expect(screen.queryByRole('menu')).toBeNull();
          // Escape kanwy czyści zaznaczenie albo zostawia wstępne — nigdy nie zaznacza obiektu menu.
          expect(zaznaczone()).not.toEqual(oczekiwane);
          return;
        }
        const pozycja = screen.getByTestId(rodzaj === 'nawigacyjna' ? p.akcjaNawigacyjna : p.akcjaFormularzowa);
        fireEvent.click(pozycja);
        expect(zaznaczone()).toEqual(oczekiwane);
        if (rodzaj === 'nawigacyjna') expect(openRouteSurface).toHaveBeenCalledTimes(1);
        // Inspektor powłoki pokazuje obiekt menu (ten sam, którego kartę otwarto).
        expect(screen.getByTestId('inspektor-element-kanwy').getAttribute('data-element-id')).toBe(oczekiwane[0]);
      });
    }
  }

  it('menu tła × akcja nawigacyjna — zaznaczenie bez zmian (tło nie jest obiektem)', () => {
    useNetworkBuildStore.setState({ openRouteSurface: vi.fn() } as never);
    useSnapshotStore.setState({ snapshot: enmGpz });
    const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
    useSelectionStore.getState().selectElement({ id: KABEL, type: 'LineBranch', name: KABEL });
    // Najpierw menu OBIEKTU zamknięte bez akcji, potem menu tła — ref obiektu nie może przeżyć.
    fireEvent.contextMenu(uchwyt(container, selektorWylacznikaPola()), { clientX: 120, clientY: 80 });
    fireEvent.contextMenu(container.querySelector('[data-testid="sld-canvas-v3"]')!, { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByTestId('sld-menu-show-readiness'));
    expect(zaznaczone()).toEqual([KABEL]);
  });

  it('uzbrojona paleta OZE × akcja z menu stacji — stacja nie jest „zrzucana", uzbrojenie zostaje', () => {
    useNetworkBuildStore.setState({ openRouteSurface: vi.fn() } as never);
    useSnapshotStore.setState({ snapshot: enm52 });
    const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
    const menuNarzedzi = screen.queryByTestId('sld-v3-toolbar-menu-toggle');
    if (menuNarzedzi && screen.queryByTestId('sld-v3-toolbar-menu') === null) fireEvent.click(menuNarzedzi);
    fireEvent.click(screen.getByTestId('der-palette-btn-PV'));
    expect(screen.getByTestId('sld-v3-der-cancel')).toBeTruthy();
    fireEvent.contextMenu(uchwyt(container, selektorStacji()), { clientX: 120, clientY: 80 });
    fireEvent.click(screen.getByTestId('sld-menu-open-station-config'));
    expect(screen.getByTestId('sld-v3-der-cancel')).toBeTruthy();
    expect(zaznaczone()).toEqual([]);
  });
});
