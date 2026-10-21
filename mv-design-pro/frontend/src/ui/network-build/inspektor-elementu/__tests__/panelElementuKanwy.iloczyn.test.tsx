/**
 * UI-02b JEDEN-INSPEKTOR — sekcje „z kanwy" prawego inspektora jako ILOCZYN CECH:
 *
 *   rodzaj obiektu {stacja · pole · aparat · transformator · źródło OZE · odcinek · węzeł SN}
 *   × działanie {dostępne (klik ma skutek) · niedostępne z przyczyną (klik bez skutku)}
 *   × wyniki {brak · nieaktualne · wartość}.
 *
 * Ścieżka natywna: obiekt wskazuje KLIK w uchwyt trafienia kanwy (`data-hit-for`), nie
 * wymuszony stan selekcji — kanwa pisze selekcję i kontekst kliknięcia, inspektor czyta je
 * tak samo jak w aplikacji. Stan wyników zmienia się w magazynach (nakładka wyników i status
 * przypadku), bo to one są wejściem inspektora; ponowne kliknięcie nie jest potrzebne.
 *
 * Działanie testowane na pozycji „Pokaż wyniki", bo jej dostępność wynika z TEGO SAMEGO
 * statusu wyników co sekcja „Wyniki" (`kontekstDostepnosciAkcji`: brak przebiegu ⇒ pozycja
 * nieaktywna z przyczyną). Dwa rodzaje nie mają w rejestrze menu pozycji z warunkiem
 * dostępności, więc wariant „niedostępne" nie istnieje dla nich w produkcie i test przypina
 * TEN fakt (wszystkie pozycje aktywne) zamiast go udawać:
 *  - źródło OZE (`der_pv`/`der_bess`/`der_fw`): działanie dostępne = „Pokaż zgodność
 *    przyłączeniową" (macierz NC RfG w przestrzeni Wyniki);
 *  - węzeł SN: brak tematu menu kanwy (punkt odgałęźny świadomie bez menu,
 *    `canvasMenuSubject.ts`), działaniem jest wejście do karty węzła.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EnergyNetworkModel } from '../../../../types/enm';
import { useAppStateStore } from '../../../app-state';
import { useSelectionStore } from '../../../selection';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import { useRawResultOverlayStore, type RawOverlayPayload } from '../../../sld-overlay/rawResultOverlayStore';
import { useShellStore } from '../../../../ui2/shell/useShellStore';
import { useNetworkBuildStore } from '../../networkBuildStore';
import { buildSceneV3, type SceneLod, type SceneV3 } from '../../../sld/v3/scene/buildScene';
import { buildW1MatrixFixture } from '../../../sld/v3/scene/__tests__/fixtures/w1MatrixVariants';
import { SldCanvasV3Workspace } from '../../../sld/v3/canvas/SldCanvasV3Workspace';
import { useKontekstElementuKanwy } from '../../../sld/shared/kontekstElementuKanwy';
import { InspektorKanwyTestowy } from './inspektorKanwyTestowy';
import { POWOD_BRAK_PRZEBIEGU_PL } from '../stanPaneluElementu';

const here = dirname(fileURLToPath(import.meta.url));
function wczytaj(...czesci: string[]): EnergyNetworkModel {
  return (JSON.parse(readFileSync(resolve(here, ...czesci), 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;
}
const SIEC = wczytaj('..', '..', '..', 'sld', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json');
const SIEC_ZKSN = wczytaj('..', '..', '..', 'sld', 'v3', 'scene', '__tests__', 'fixtures', 'elementyCiagu-zksn.enm.json');
const SIEC_APARATOW = buildW1MatrixFixture().enm;

/** Nakładka wyników z wielkościami dla KAŻDEGO refu modelu (i szyny SN stacji). */
function nakladkaDlaModelu(enm: EnergyNetworkModel): RawOverlayPayload {
  const refy = new Set<string>();
  const zbierz = (wartosc: unknown): void => {
    if (Array.isArray(wartosc)) wartosc.forEach(zbierz);
    else if (wartosc && typeof wartosc === 'object') {
      for (const [klucz, w] of Object.entries(wartosc)) {
        if ((klucz === 'ref_id' || klucz === 'device_ref') && typeof w === 'string') refy.add(w);
        else zbierz(w);
      }
    }
  };
  zbierz(enm);
  for (const stacja of enm.substations ?? []) refy.add(`${stacja.ref_id.replace(/\/station$/, '')}/sn_bus`);
  const metryka = (code: string, value: number, unit: string) => ({ code, value, unit });
  const elements: RawOverlayPayload['elements'] = {};
  for (const ref of refy) {
    elements[ref] = {
      ref_id: ref,
      kind: 'element',
      badges: [],
      severity: 'INFO',
      metrics: {
        U_kV: metryka('U_kV', 15.12, 'kV'),
        U_pu: metryka('U_pu', 1.008, 'p.u.'),
        P_MW: metryka('P_MW', 0.42, 'MW'),
        Q_Mvar: metryka('Q_Mvar', 0.11, 'Mvar'),
        I_A: metryka('I_A', 17.3, 'A'),
      },
    };
  }
  return { run_id: 'run-iloczyn', analysis_type: 'LOAD_FLOW', elements };
}

type StanWynikow = 'brak' | 'nieaktualne' | 'wartosc';

function ustawWyniki(enm: EnergyNetworkModel, stan: StanWynikow): void {
  act(() => {
    useRawResultOverlayStore.getState().setPayload(stan === 'brak' ? null : nakladkaDlaModelu(enm));
    useAppStateStore.setState({
      activeCaseResultStatus: stan === 'brak' ? 'NONE' : stan === 'nieaktualne' ? 'OUTDATED' : 'FRESH',
    });
  });
}

interface Przypadek {
  readonly nazwa: string;
  readonly enm: EnergyNetworkModel;
  readonly lod: SceneLod;
  /** testId uchwytu trafienia obiektu w scenie danego poziomu. */
  readonly uchwyt: (scena: SceneV3) => string;
  readonly rodzaj: string;
}

function symbol(predykat: (s: SceneV3['symbols'][number]) => boolean) {
  return (scena: SceneV3): string => {
    const i = scena.symbols.findIndex(predykat);
    expect(i, 'symbol w scenie').toBeGreaterThanOrEqual(0);
    return scena.symbols[i].meta?.testId ?? `sld-v3-symbol-${i}`;
  };
}

const PRZYPADKI: readonly Przypadek[] = [
  {
    nazwa: 'stacja',
    enm: SIEC,
    lod: 0,
    uchwyt: symbol((s) => s.meta?.elementKind === 'station' && s.symbolId !== 'gpzCollapsed'),
    rodzaj: 'station',
  },
  {
    nazwa: 'pole',
    enm: SIEC,
    lod: 2,
    uchwyt: symbol((s) => s.meta?.elementKind === 'apparatus' && !s.meta?.deviceRef && Boolean(s.meta?.ownerRef?.includes('/sn_field/'))),
    rodzaj: 'apparatus',
  },
  {
    nazwa: 'aparat',
    enm: SIEC_APARATOW,
    lod: 2,
    uchwyt: symbol((s) => s.meta?.elementKind === 'apparatus' && Boolean(s.meta?.deviceRef)),
    rodzaj: 'apparatus',
  },
  {
    nazwa: 'transformator',
    enm: SIEC,
    lod: 2,
    uchwyt: symbol((s) => s.meta?.elementKind === 'transformer'),
    rodzaj: 'transformer',
  },
  {
    nazwa: 'źródło OZE',
    enm: SIEC,
    lod: 2,
    uchwyt: symbol((s) => s.meta?.elementKind === 'der'),
    rodzaj: '',
  },
  {
    nazwa: 'odcinek',
    enm: SIEC,
    lod: 2,
    uchwyt: (scena) => {
      const i = scena.segments.findIndex(
        (s) => s.meta?.elementKind === 'segment' && s.meta.ownerRef && !s.meta.ownerRef.includes('#'),
      );
      expect(i).toBeGreaterThanOrEqual(0);
      return scena.segments[i].meta?.testId ?? `sld-v3-segment-${i}`;
    },
    rodzaj: 'cable_run',
  },
  {
    nazwa: 'węzeł SN',
    enm: SIEC_ZKSN,
    lod: 2,
    uchwyt: symbol((s) => s.meta?.elementKind === 'branchPoint'),
    rodzaj: 'node',
  },
];

const otworzPowierzchnie = vi.fn();
const pierwotneOtwarcie = useNetworkBuildStore.getState().openRouteSurface;

beforeEach(() => {
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
  useRawResultOverlayStore.getState().clear();
  useAppStateStore.setState({ activeCaseId: 'case-iloczyn', activeCaseResultStatus: 'NONE' });
  useNetworkBuildStore.setState({ openRouteSurface: otworzPowierzchnie });
  otworzPowierzchnie.mockClear();
  act(() => useShellStore.getState().setActiveSpace('model'));
});
afterEach(() => {
  cleanup();
  useKontekstElementuKanwy.getState().wyczysc();
  useRawResultOverlayStore.getState().clear();
  useNetworkBuildStore.setState({ openRouteSurface: pierwotneOtwarcie });
  useAppStateStore.setState({ activeCaseId: null, activeCaseResultStatus: 'NONE' });
});

describe.each(PRZYPADKI)('inspektor elementu kanwy: $nazwa', (przypadek) => {
  function kliknij() {
    useSnapshotStore.setState({ snapshot: przypadek.enm });
    const { container } = render(
      <>
        <SldCanvasV3Workspace width={1322} height={696} lodOverride={przypadek.lod === 0 ? undefined : przypadek.lod} />
        <InspektorKanwyTestowy />
      </>,
    );
    const testId = przypadek.uchwyt(buildSceneV3(przypadek.enm, przypadek.lod));
    const uchwyt = container.querySelector(`[data-hit-for="${testId}"]`);
    expect(uchwyt, `uchwyt trafienia ${testId}`).not.toBeNull();
    fireEvent.click(uchwyt!, { detail: 1 });
    const panel = screen.getByTestId('inspektor-element-kanwy');
    expect(panel).toHaveAttribute('data-rodzaj', przypadek.rodzaj);
    return panel;
  }

  for (const stan of ['brak', 'nieaktualne', 'wartosc'] as const) {
    it(`wyniki: ${stan}`, () => {
      kliknij();
      ustawWyniki(przypadek.enm, stan);
      const sekcja = screen.getByTestId('inspektor-wyniki');
      expect(sekcja).toHaveAttribute('data-stan', stan);
      if (stan === 'brak') {
        expect(within(sekcja).getByTestId('inspektor-wyniki-brak').textContent).toBe(POWOD_BRAK_PRZEBIEGU_PL);
        expect(within(sekcja).queryAllByTestId(/^inspektor-wynik-/)).toHaveLength(0);
      } else {
        const wiersze = within(sekcja).getAllByTestId(/^inspektor-wynik-/);
        expect(wiersze.length).toBeGreaterThan(0);
        // Liczby z nakładki wyników (format polski), nigdy wartość zastępcza.
        expect(wiersze.map((w) => w.textContent).join(' ')).toMatch(/\d+,\d+ (kV|MW|Mvar|A|p\.u\.)/);
        expect(wiersze.map((w) => w.textContent).join(' ')).not.toContain('—');
        expect(within(sekcja).queryByTestId('inspektor-wyniki-nieaktualne') !== null).toBe(stan === 'nieaktualne');
      }
    });
  }

  if (przypadek.rodzaj === 'node') {
    it('działanie dostępne: wejście do karty węzła otwiera kartę ZK SN z refem węzła; brak paska działań (węzeł bez menu kanwy)', () => {
      kliknij();
      expect(screen.queryByTestId('inspektor-dzialania')).toBeNull();
      fireEvent.click(screen.getByTestId('inspektor-otworz-konfiguracje'));
      expect(otworzPowierzchnie).toHaveBeenCalledTimes(1);
      const [ekran, opcje] = otworzPowierzchnie.mock.calls[0] as [string, { entityRef: string }];
      expect(ekran).toBe('E-14');
      expect(opcje.entityRef).toBe(useSelectionStore.getState().selectedElements[0].id);
    });
    return;
  }

  if (przypadek.rodzaj === '') {
    for (const stan of ['brak', 'nieaktualne', 'wartosc'] as const) {
      it(`działanie dostępne (wyniki: ${stan}): „Pokaż zgodność przyłączeniową" otwiera macierz NC RfG; rejestr źródła nie ma pozycji warunkowych`, () => {
        kliknij();
        ustawWyniki(przypadek.enm, stan);
        const pasek = screen.getByTestId('inspektor-dzialania');
        expect(pasek.querySelectorAll('[aria-disabled="true"]')).toHaveLength(0);
        fireEvent.click(within(pasek).getByTestId('inspektor-akcja-show-ncrfg'));
        expect(useShellStore.getState().activeSpace).toBe('wyniki');
        expect(useShellStore.getState().wynikiTab).toBe('ncrfg');
      });
    }
    return;
  }

  it('działanie niedostępne z przyczyną (bez wyników): „Pokaż wyniki" nieaktywne, przyczyna w opisie, klik bez skutku', () => {
    kliknij();
    ustawWyniki(przypadek.enm, 'brak');
    const pozycja = screen.getByTestId('inspektor-akcja-show-results');
    expect(pozycja).toHaveAttribute('aria-disabled', 'true');
    expect(pozycja).not.toBeDisabled();
    const opis = document.getElementById(pozycja.getAttribute('aria-describedby') ?? '');
    expect(opis?.textContent).toBe('Brak obliczeń. Uruchom obliczenia z prawego panelu.');
    expect(pozycja).toHaveAttribute('title', 'Brak obliczeń. Uruchom obliczenia z prawego panelu.');
    fireEvent.click(pozycja);
    expect(useShellStore.getState().activeSpace).toBe('model');
  });

  for (const stan of ['nieaktualne', 'wartosc'] as const) {
    it(`działanie dostępne (wyniki: ${stan}): „Pokaż wyniki" prowadzi do wyników rozpływu tego obiektu`, () => {
      kliknij();
      ustawWyniki(przypadek.enm, stan);
      const pozycja = screen.getByTestId('inspektor-akcja-show-results');
      expect(pozycja).not.toHaveAttribute('aria-disabled');
      fireEvent.click(pozycja);
      expect(useShellStore.getState().activeSpace).toBe('wyniki');
      expect(useShellStore.getState().wynikiTab).toBe('rozplyw');
    });
  }
});
