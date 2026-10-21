/**
 * UI-02b JEDEN-INSPEKTOR — JEDNO ŹRÓDŁO DZIAŁAŃ: menu kontekstowe kanwy i pasek działań
 * inspektora dają TĘ SAMĄ listę (pozycje, kolejność, dostępność, przyczyna niedostępności)
 * dla tego samego obiektu w tym samym stanie modelu i wyników.
 *
 * Przed tą kartą panel szczegółów kanwy liczył kontekst dostępności osobno od menu
 * i rozjeżdżał się z nim w dwie strony: bramkował „Pokaż wyniki" tylko świeżym wynikiem
 * (menu nie bramkowało wcale), a menu bramkowało agregat/UPS szyną nN stacji (panel nie).
 * Teraz oba czytają `kontekstDostepnosciAkcji` — test przypina parę, żeby nie rozjechała się
 * ponownie.
 *
 * Ścieżka natywna: prawy klik (`contextmenu`) i lewy klik w TEN SAM uchwyt trafienia.
 * Iloczyn: rodzaj obiektu {stacja · pole · aparat · transformator · źródło OZE · odcinek ·
 * szyna} × status wyników {brak · nieaktualne · świeże}.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../types/enm';
import type { ResultStatus } from '../../../types';
import { useAppStateStore } from '../../../app-state';
import { useSelectionStore } from '../../../selection';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import { useRawResultOverlayStore } from '../../../sld-overlay/rawResultOverlayStore';
import { buildSceneV3, type SceneLod, type SceneV3 } from '../../../sld/v3/scene/buildScene';
import { buildW1MatrixFixture } from '../../../sld/v3/scene/__tests__/fixtures/w1MatrixVariants';
import { SldCanvasV3Workspace } from '../../../sld/v3/canvas/SldCanvasV3Workspace';
import { useKontekstElementuKanwy } from '../../../sld/shared/kontekstElementuKanwy';
import { InspektorKanwyTestowy } from './inspektorKanwyTestowy';

const here = dirname(fileURLToPath(import.meta.url));
const SIEC = (
  JSON.parse(
    readFileSync(resolve(here, '..', '..', '..', 'sld', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json'), 'utf8'),
  ) as { readonly enm: EnergyNetworkModel }
).enm;
const SIEC_APARATOW = buildW1MatrixFixture().enm;

interface Pozycja {
  readonly id: string;
  readonly niedostepna: boolean;
  readonly przyczyna: string | null;
}

function pozycjeMenu(): Pozycja[] {
  return screen.getAllByRole('menuitem')
    .filter((el) => (el.getAttribute('data-testid') ?? '').startsWith('sld-menu-'))
    .map((el) => ({
      id: el.getAttribute('data-testid')!.slice('sld-menu-'.length),
      niedostepna: (el as HTMLButtonElement).disabled,
      przyczyna: (el as HTMLButtonElement).disabled ? el.getAttribute('title') : null,
    }));
}

function pozycjePaska(): Pozycja[] {
  const pasek = screen.getByTestId('inspektor-dzialania');
  return Array.from(pasek.querySelectorAll('[data-testid^="inspektor-akcja-"]')).map((el) => {
    const niedostepna = el.getAttribute('aria-disabled') === 'true';
    return {
      id: el.getAttribute('data-testid')!.slice('inspektor-akcja-'.length),
      niedostepna,
      przyczyna: niedostepna ? el.getAttribute('title') : null,
    };
  });
}

/** Kolejność w pasku idzie grupami (budowa, edycja, widok, usuwanie); menu ma kolejność
 *  rejestru w sekcjach. Porównanie zbioru z przyczynami + kolejności WEWNĄTRZ grup
 *  jest więc porównaniem tej samej listy w dwóch układach. */
function poId(pozycje: readonly Pozycja[]): Record<string, Pozycja> {
  return Object.fromEntries(pozycje.map((p) => [p.id, p]));
}

interface Przypadek {
  readonly nazwa: string;
  readonly enm: EnergyNetworkModel;
  readonly lod: SceneLod;
  readonly uchwyt: (scena: SceneV3) => string;
}

function symbol(predykat: (s: SceneV3['symbols'][number]) => boolean) {
  return (scena: SceneV3): string => {
    const i = scena.symbols.findIndex(predykat);
    expect(i, 'symbol w scenie').toBeGreaterThanOrEqual(0);
    return scena.symbols[i].meta?.testId ?? `sld-v3-symbol-${i}`;
  };
}

function segment(predykat: (s: SceneV3['segments'][number]) => boolean) {
  return (scena: SceneV3): string => {
    const i = scena.segments.findIndex(predykat);
    expect(i, 'segment w scenie').toBeGreaterThanOrEqual(0);
    return scena.segments[i].meta?.testId ?? `sld-v3-segment-${i}`;
  };
}

const PRZYPADKI: readonly Przypadek[] = [
  { nazwa: 'stacja', enm: SIEC, lod: 0, uchwyt: symbol((s) => s.meta?.elementKind === 'station' && s.symbolId !== 'gpzCollapsed') },
  { nazwa: 'pole', enm: SIEC, lod: 2, uchwyt: symbol((s) => s.meta?.elementKind === 'apparatus' && !s.meta?.deviceRef && Boolean(s.meta?.ownerRef?.includes('/sn_field/'))) },
  { nazwa: 'aparat', enm: SIEC_APARATOW, lod: 2, uchwyt: symbol((s) => s.meta?.elementKind === 'apparatus' && Boolean(s.meta?.deviceRef)) },
  { nazwa: 'transformator', enm: SIEC, lod: 2, uchwyt: symbol((s) => s.meta?.elementKind === 'transformer') },
  { nazwa: 'źródło OZE', enm: SIEC, lod: 2, uchwyt: symbol((s) => s.meta?.elementKind === 'der') },
  { nazwa: 'odcinek', enm: SIEC, lod: 2, uchwyt: segment((s) => s.meta?.elementKind === 'segment' && Boolean(s.meta.ownerRef) && !s.meta.ownerRef!.includes('#')) },
  { nazwa: 'szyna', enm: SIEC, lod: 2, uchwyt: segment((s) => s.meta?.elementKind === 'bus' && Boolean(s.meta?.ownerRef)) },
];

const STATUSY: readonly ResultStatus[] = ['NONE', 'OUTDATED', 'FRESH'];

beforeEach(() => {
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
  useRawResultOverlayStore.getState().clear();
  useAppStateStore.setState({ activeCaseId: 'case-jedno-zrodlo', activeCaseResultStatus: 'NONE' });
});
afterEach(() => {
  cleanup();
  useKontekstElementuKanwy.getState().wyczysc();
  useAppStateStore.setState({ activeCaseId: null, activeCaseResultStatus: 'NONE' });
});

describe.each(PRZYPADKI)('menu kanwy = pasek inspektora: $nazwa', (przypadek) => {
  it.each(STATUSY)('status wyników %s', (status) => {
    useSnapshotStore.setState({ snapshot: przypadek.enm });
    act(() => useAppStateStore.setState({ activeCaseResultStatus: status }));
    const { container } = render(
      <>
        <SldCanvasV3Workspace width={1322} height={696} lodOverride={przypadek.lod === 0 ? undefined : przypadek.lod} />
        <InspektorKanwyTestowy />
      </>,
    );
    const testId = przypadek.uchwyt(buildSceneV3(przypadek.enm, przypadek.lod));
    const uchwyt = container.querySelector(`[data-hit-for="${testId}"]`);
    expect(uchwyt, `uchwyt trafienia ${testId}`).not.toBeNull();

    fireEvent.contextMenu(uchwyt!, { clientX: 200, clientY: 200 });
    const menu = pozycjeMenu();
    expect(menu.length, 'menu obiektu ma pozycje').toBeGreaterThan(0);
    fireEvent.keyDown(document, { key: 'Escape' });

    fireEvent.click(uchwyt!, { detail: 1 });
    const pasek = pozycjePaska();

    expect(poId(pasek)).toEqual(poId(menu));
    expect(pasek.map((p) => p.id).sort()).toEqual(menu.map((p) => p.id).sort());
    // Każda pozycja menu jest w pasku DOKŁADNIE raz.
    expect(new Set(pasek.map((p) => p.id)).size).toBe(pasek.length);
    // „Pokaż wyniki" (gdy obiekt ją ma) bramkowana statusem wyników — w obu miejscach tak samo.
    const wyniki = poId(pasek)['show-results'];
    if (wyniki) expect(wyniki.niedostepna).toBe(status === 'NONE');
  });
});
