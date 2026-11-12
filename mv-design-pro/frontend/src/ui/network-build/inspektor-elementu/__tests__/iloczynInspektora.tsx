/**
 * Wspólne przygotowanie testów inspektora jako ILOCZYNU CECH (rodzaj obiektu × wyniki ×
 * analiza): przypadki obiektów kanwy wskazywanych NATYWNYM klikiem w uchwyt trafienia,
 * nakładka wyników i bieg w rejestrze (ścieżka karty K8), odpowiedź pasma MAKS./MIN.
 * Rozdzielone na dwa pliki testów (`panelElementuKanwy.iloczyn.test.tsx`,
 * `panelElementuKanwy.zwarcieIKolejnosc.test.tsx`), żeby każdy render pełnej kanwy nie
 * siedział w jednym procesie puli — czas pliku rósł ponad próg odpowiedzi procesu testów.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, vi } from 'vitest';

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
import { useExecutionRunsStore } from '../../../study-cases/runStore';
import { REWIZJA_BIEGU, biegRejestru, wyczyscRejestrBiegow } from '../../../../test/biegNieaktualny';
import { wyczyscKontekstWyniku, zasiejWynikWczytany } from '../../../../test/kontekstBiegu';
import { wyczyscZwarcieElementu } from '../zwarcieElementu';
import type { PasmoZwarciaOdpowiedz, StronaPasmaOdpowiedz } from '../../../../ui2/wyniki/zwarcia/api';

const here = dirname(fileURLToPath(import.meta.url));
function wczytaj(...czesci: string[]): EnergyNetworkModel {
  return (JSON.parse(readFileSync(resolve(here, ...czesci), 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;
}
const SIEC = wczytaj('..', '..', '..', 'sld', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json');
const SIEC_ZKSN = wczytaj('..', '..', '..', 'sld', 'v3', 'scene', '__tests__', 'fixtures', 'elementyCiagu-zksn.enm.json');
const SIEC_APARATOW = buildW1MatrixFixture().enm;

/** Nakładka wyników z wielkościami dla KAŻDEGO refu modelu (i szyny SN stacji). */
export function nakladkaDlaModelu(enm: EnergyNetworkModel, analiza: 'LOAD_FLOW' | 'SC_3F' = 'LOAD_FLOW'): RawOverlayPayload {
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
      // Kody, które backend emituje (`result_builder_v1.METRYKI_ELEMENTOW_WYNIKU`) — zestaw
      // obu analiz pod każdym refem: wykaz obiektu wybiera rejestr (analiza × klasa).
      metrics: {
        U_kV: metryka('U_kV', 15.12, 'kV'),
        V_PU: metryka('V_PU', 1.008, 'p.u.'),
        P_MW: metryka('P_MW', 0.42, 'MW'),
        Q_Mvar: metryka('Q_Mvar', 0.11, 'Mvar'),
        I_A: metryka('I_A', 17.3, 'A'),
        S_MVA: metryka('S_MVA', 0.44, 'MVA'),
        LOADING_PCT: metryka('LOADING_PCT', 41.5, '%'),
        IK_3F_A: metryka('IK_3F_A', 18496, 'A'),
        IP_A: metryka('IP_A', 44120, 'A'),
        ITH_A: metryka('ITH_A', 18800, 'A'),
        SK_MVA: metryka('SK_MVA', 480.5, 'MVA'),
      },
    };
  }
  return { run_id: 'run-iloczyn', analysis_type: analiza, elements };
}

export type StanWynikow = 'brak' | 'nieaktualne' | 'wartosc';

/**
 * Wyniki realną ścieżką karty K8: bieg w rejestrze biegów przypadku (bieg oglądany =
 * najnowszy zakończony), jego `results/v1` wczytany do magazynu kontekstu wyniku, a
 * świeżość z JEDNEGO predykatu (`swiezoscBiegu`: rewizja biegu ≠ rewizja modelu ⇒
 * nieaktualny). Nakładka kanwy (`rawResultOverlayStore`) dostaje ten sam payload — w
 * aplikacji pisze ją orkiestrator z tej samej pamięci.
 */
export function ustawWyniki(enm: EnergyNetworkModel, stan: StanWynikow, analiza: 'LOAD_FLOW' | 'SC_3F' = 'LOAD_FLOW'): void {
  act(() => {
    // Status wyników PRZYPADKU (serwer) zostaje źródłem dostępności akcji „Pokaż wyniki"
    // (`kontekstDostepnosciAkcji`) — to werdykt przypadku, nie wybór biegu.
    useAppStateStore.setState({
      activeCaseResultStatus: stan === 'brak' ? 'NONE' : stan === 'nieaktualne' ? 'OUTDATED' : 'FRESH',
    });
    if (stan === 'brak') {
      wyczyscRejestrBiegow();
      wyczyscKontekstWyniku();
      useRawResultOverlayStore.getState().setPayload(null);
      return;
    }
    const payload = nakladkaDlaModelu(enm, analiza);
    useExecutionRunsStore.setState({ runs: [biegRejestru(payload.run_id, analiza)] });
    useSnapshotStore.setState({
      rewizjaBiezacegoModelu: stan === 'nieaktualne' ? REWIZJA_BIEGU + 1 : REWIZJA_BIEGU,
    });
    zasiejWynikWczytany({
      runId: payload.run_id,
      analysisType: payload.analysis_type,
      elementy: payload.elements,
      qualityStatus: null,
      proofStatus: null,
      runFinishedAt: null,
    });
    useRawResultOverlayStore.getState().setPayload(payload);
  });
}


/** Odpowiedź `…/results/short-circuit/pasmo`: wiersz dla KAŻDEGO punktu nakładki, strony różne. */
export function pasmoDlaModelu(enm: EnergyNetworkModel, brakMin: boolean): PasmoZwarciaOdpowiedz {
  const punkty = Object.keys(nakladkaDlaModelu(enm, 'SC_3F').elements).sort();
  const strona = (ik: number, c: number, rewizja: number): StronaPasmaOdpowiedz => ({
    zrodlo: 'biegu_zapisanego',
    run_id: `run-${c}`,
    bieg_bazowy_id: 'run-iloczyn',
    wynik: {
      run_id: `run-${c}`,
      rows: punkty.map((ref) => ({
        target_id: ref,
        target_name: null,
        ikss_ka: ik,
        ip_ka: ik * 2.4,
        ith_ka: ik * 1.02,
        sk_mva: ik * 26,
        fault_type: '3F',
        flags: [],
        c_factor: c,
        c_zrodlo: `IEC 60909-0 tab. 1, pasmo SN, ${c > 1 ? 'MAX' : 'MIN'}`,
        tk_s: 1,
      })),
    },
    analysis_case_context: { rewizja_modelu: rewizja },
  });
  return {
    run_id_kotwicy: 'run-iloczyn',
    scenariusz_kotwicy: 'MAX',
    typ_zwarcia_kotwicy: '3F',
    brakujacy_scenariusz: brakMin ? 'MIN' : null,
    powod_niedostepnosci: brakMin ? 'BRAK_BIEGU_MIN' : null,
    powod_niedostepnosci_pl: brakMin ? 'przypadek nie ma biegu minimalnego' : null,
    max: strona(18.5, 1.1, REWIZJA_BIEGU),
    min: brakMin ? null : strona(12.25, 1, REWIZJA_BIEGU),
  };
}

/**
 * K3 × K6: klik adresujący POLE (nie pojedyncze urządzenie). Aparatura pola pochodzi wyłącznie
 * z rekordów modelu, więc symbol bez `deviceRef` istnieje już tylko jako sylwetka
 * `bayNoEquipment` („brak danych wyposażenia pola") pola, które ma rekord `Bay` w modelu.
 * Dawny predykat szukał łącznika pola stacji z konwencji (bez `deviceRef`) — po K3 takiego
 * symbolu nie ma: łącznik pola stacji niesie ref urządzenia i otwiera kartę aparatu.
 */
function jestPoleBezRekorduAparatu(s: SceneV3['symbols'][number]): boolean {
  return (
    s.symbolId === 'bayNoEquipment' &&
    s.meta?.elementKind === 'apparatus' &&
    !s.meta?.deviceRef &&
    (SIEC.bays ?? []).some((b) => b.ref_id === s.meta?.ownerRef)
  );
}
export interface Przypadek {
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

export const PRZYPADKI: readonly Przypadek[] = [
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
    uchwyt: symbol((s) => jestPoleBezRekorduAparatu(s)),
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
    // K6: źródło OZE ma własny rodzaj danych panelu (karta techniczna źródła z torem
    // przyłączenia) — dawniej panel nie rozpoznawał rodzaju (pusty atrybut).
    rodzaj: 'generator',
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

export const otworzPowierzchnie = vi.fn();
const pierwotneOtwarcie = useNetworkBuildStore.getState().openRouteSurface;

/** Rejestracja przygotowania i sprzątania magazynów — wołana raz na plik testu. */
export function przygotujIloczyn(): void {
  beforeEach(() => {
    useSnapshotStore.getState().reset();
    useSelectionStore.getState().clearSelection();
    useRawResultOverlayStore.getState().clear();
    useAppStateStore.setState({ activeCaseId: 'case-iloczyn', activeCaseResultStatus: 'NONE' });
    wyczyscRejestrBiegow();
    wyczyscKontekstWyniku();
    wyczyscZwarcieElementu();
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
    vi.unstubAllGlobals();
  });
}

export function kliknijObiekt(przypadek: Przypadek): HTMLElement {
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
