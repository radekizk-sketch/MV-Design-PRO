/**
 * UI-02b JEDEN-INSPEKTOR — stan sekcji „z kanwy" prawego inspektora dla bieżącej selekcji.
 *
 * Wszystko liczone z bieżących magazynów (migawka modelu, wynik biegu OGLĄDANEGO z magazynu
 * kontekstu wyniku — karta K8 — i jego świeżość z jednego predykatu) i z kontekstu kliknięcia kanwy — nic nie jest kopiowane w chwili kliku, więc
 * nowy wynik obliczeń albo zmiana modelu odświeża inspektor bez ponownego kliknięcia.
 */
import { useCallback, useMemo } from 'react';

import { useAppStateStore } from '../../app-state';
import { useSelectionStore } from '../../selection/store';
import { useSnapshotStore } from '../../topology/snapshotStore';
import {
  useNakladkaBieguOgladanego,
  useSwiezoscBiegu,
  type StanSwiezosciBiegu,
} from '../../../ui2/wyniki/kontekst/kontekstWyniku';
import type { EnergyNetworkModel } from '../../../types/enm';
import { useNetworkBuildStore } from '../networkBuildStore';
import { buildSldDataFromSnapshot } from '../../sld/v2/canvas/enmToSldAdapter';
import type { SldMenuAction } from '../../sld/v2/command/SldCommandService';
import {
  buildCanvasModelIndex,
  ELEMENT_KIND_KOTWICY,
  resolveCanvasMenuSubject,
  type CanvasMenuSubject,
  type CanvasModelIndex,
} from '../../sld/v3/canvas/canvasMenuSubject';
import { akcjeElementu } from '../../sld/shared/akcjeElementu';
import {
  buildDaneElementuKanwy,
  buildDaneSzkicuDer,
  buildLiveMetrics,
  type DaneElementuKanwy,
} from '../../sld/shared/daneElementuKanwy';
import {
  kontekstDlaSelekcji,
  useKontekstElementuKanwy,
  type KontekstElementuKanwy,
  type SzkicDer,
} from '../../sld/shared/kontekstElementuKanwy';
import { useSldActionExecutor } from '../../sld/shared/sldActionExecutor';
import {
  buildKartaTechniczna,
  type EdycjaWiersza,
  type KartaTechniczna,
} from '../../sld/shared/kartaTechnicznaElementu';
import { useKatalogiKarty } from './katalogiKarty';
import { useStanKartyGpz, type StanKartyGpz } from './stanKartyGpz';

/** Bieg, z którego pochodzi sekcja „Wyniki" (karta K8: atrybuty `data-run-id`/`data-swiezosc`). */
interface ZrodloWynikowElementu {
  readonly runId: string | null;
  readonly swiezosc: StanSwiezosciBiegu | null;
}

/** Stan sekcji „Wyniki": brak / nieaktualne / wartość — bez wartości zastępczych. */
export type StanWynikowElementu =
  | ({ readonly stan: 'brak'; readonly powodPl: string } & ZrodloWynikowElementu)
  | ({
      readonly stan: 'wartosc' | 'nieaktualne';
      readonly metryki: NonNullable<DaneElementuKanwy['liveMetrics']>;
    } & ZrodloWynikowElementu);

export const POWOD_BRAK_PRZEBIEGU_PL =
  'Brak wyników obliczeń aktywnego przypadku. Uruchom obliczenia, aby zobaczyć wielkości elementu.';
export const POWOD_BRAK_WIELKOSCI_PL =
  'Wynik aktywnego przebiegu nie zawiera wielkości dla tego elementu.';

/**
 * Stan wyników elementu z biegu OGLĄDANEGO. Nieaktualność z TEGO SAMEGO predykatu
 * świeżości biegu, którym kanwa bramkuje etykiety wyników (karta K8,
 * `kontekstWyniku.swiezoscBiegu`).
 */
export function stanWynikowElementu(
  maWynikPrzebiegu: boolean,
  swiezosc: StanSwiezosciBiegu | null,
  metryki: DaneElementuKanwy['liveMetrics'],
  runId: string | null = null,
): StanWynikowElementu {
  const zrodlo = { runId: maWynikPrzebiegu ? runId : null, swiezosc: maWynikPrzebiegu ? swiezosc : null };
  if (!maWynikPrzebiegu) return { stan: 'brak', powodPl: POWOD_BRAK_PRZEBIEGU_PL, ...zrodlo };
  if (!metryki || metryki.length === 0) return { stan: 'brak', powodPl: POWOD_BRAK_WIELKOSCI_PL, ...zrodlo };
  return { stan: swiezosc === 'nieaktualny' ? 'nieaktualne' : 'wartosc', metryki, ...zrodlo };
}

/**
 * Kontekst efektywny selekcji: kontekst kliknięcia kanwy, a dla wskazania spoza kanwy
 * (drzewo, wyszukiwarka, adres) — temat rozstrzygnięty z samego refu selekcji tą samą
 * funkcją co menu kanwy (`resolveCanvasMenuSubject`). Punkt odgałęźny nie ma tematu menu
 * (świadomie, `canvasMenuSubject.ts`), więc jego rodzaj pochodzi z rekordu modelu.
 */
export function kontekstEfektywny(
  kontekst: KontekstElementuKanwy | null,
  selekcjaId: string,
  snapshot: EnergyNetworkModel | null,
  index: CanvasModelIndex,
): KontekstElementuKanwy {
  if (kontekst) return kontekst;
  const wynik = resolveCanvasMenuSubject({ ownerRef: selekcjaId }, index);
  if (wynik.stan === 'temat') {
    return {
      selekcjaId,
      elementKind: ELEMENT_KIND_KOTWICY[wynik.temat.kotwica],
      ref: wynik.temat.modelRef,
      temat: wynik.temat,
      tylkoOdczyt: false,
    };
  }
  const punkt = (snapshot?.branch_points ?? []).some((bp) => bp.ref_id === selekcjaId || bp.id === selekcjaId);
  return {
    selekcjaId,
    elementKind: punkt ? 'branchPoint' : undefined,
    ref: selekcjaId,
    temat: null,
    tylkoOdczyt: false,
  };
}

/** Wejście do konfiguratora odcinka (E-12, karta trasy) albo karty węzła (E-14 / E-15). */
export interface OtwarcieKonfiguracji {
  readonly etykietaPl: string;
  readonly otworz: () => void;
}

export interface StanPaneluElementu {
  readonly dane: DaneElementuKanwy | null;
  readonly temat: CanvasMenuSubject | null;
  readonly akcje: readonly SldMenuAction[];
  readonly wykonajAkcje: (actionId: string) => void;
  readonly wyniki: StanWynikowElementu;
  readonly szkicDer: SzkicDer | null;
  readonly daneSzkicuDer: DaneElementuKanwy | null;
  readonly konfiguracja: OtwarcieKonfiguracji | null;
  /** K6: karta techniczna obiektu (`kartaTechnicznaElementu.ts`); `null` — rodzaj bez karty. */
  readonly karta: KartaTechniczna | null;
  /** Zmiana wartości karty operacją domenową; `null` poza trybem edycji modelu i dla
   *  obiektu tylko do odczytu (bez przycisku „Zmień" — bez atrapy). */
  readonly edytuj: ((edycja: EdycjaWiersza) => void) | null;
  /** Karta GPZ-H5-SLD etap 2: karta GPZ (bilans, przeciążenia, tabela pól) — `null`, gdy
   *  selekcja nie jest GPZ rysowanym na schemacie (`stanKartyGpz.ts`). */
  readonly kartaGpz: StanKartyGpz | null;
}

export function useStanPaneluElementu(): StanPaneluElementu | null {
  const selekcja = useSelectionStore((state) => state.selectedElements[0] ?? null);
  const kontekstKanwy = useKontekstElementuKanwy((state) => state.kontekst);
  const szkic = useKontekstElementuKanwy((state) => state.szkicDer);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const logicalViews = useSnapshotStore((state) => state.logicalViews);
  // Karta K8: wynik z magazynu kontekstu wyniku (bieg oglądany) — ta sama pamięć
  // `results/v1`, która karmi nakładkę schematu i panel dolny.
  const nakladka = useNakladkaBieguOgladanego();
  const payload = nakladka.payload;
  const swiezoscBiegu = useSwiezoscBiegu(nakladka.bieg);
  const status = useAppStateStore((state) => state.activeCaseResultStatus);
  const openRouteSurface = useNetworkBuildStore((state) => state.openRouteSurface);
  const openOperationForm = useNetworkBuildStore((state) => state.openOperationForm);
  const activeMode = useAppStateStore((state) => state.activeMode);
  const katalogi = useKatalogiKarty();

  const index = useMemo(() => buildCanvasModelIndex(snapshot), [snapshot]);
  const sldData = useMemo(() => buildSldDataFromSnapshot(snapshot, logicalViews), [snapshot, logicalViews]);
  const selekcjaId = selekcja?.id ?? null;
  const kontekst = useMemo(
    () =>
      selekcjaId === null
        ? null
        : kontekstEfektywny(kontekstDlaSelekcji(kontekstKanwy, selekcjaId), selekcjaId, snapshot, index),
    [kontekstKanwy, selekcjaId, snapshot, index],
  );
  const wykonawca = useSldActionExecutor({ readOnly: kontekst?.tylkoOdczyt ?? false });
  const kartaGpz = useStanKartyGpz(kontekst?.temat?.modelRef ?? selekcjaId);

  const dane = useMemo(() => {
    if (!kontekst) return null;
    const wprost = buildDaneElementuKanwy(
      snapshot,
      sldData,
      payload,
      kontekst.elementKind,
      kontekst.ref,
      kontekst.deviceRef,
    );
    if (wprost || !kontekst.temat) return wprost;
    // Ref kompozytowy rysunku (`…#sn-bus`) — dane z kotwicy modelu tematu, nie z sufiksu.
    return buildDaneElementuKanwy(
      snapshot,
      sldData,
      payload,
      ELEMENT_KIND_KOTWICY[kontekst.temat.kotwica],
      kontekst.temat.modelRef,
      kontekst.deviceRef,
    );
  }, [kontekst, payload, sldData, snapshot]);

  const karta = useMemo(() => buildKartaTechniczna(snapshot, dane, katalogi), [dane, katalogi, snapshot]);
  const edycjaDozwolona = activeMode === 'MODEL_EDIT' && !(kontekst?.tylkoOdczyt ?? false);
  const edytuj = useCallback(
    (edycja: EdycjaWiersza) =>
      openOperationForm('update_element_parameters', {
        element_ref: edycja.elementRef,
        field: edycja.parametr,
        value: edycja.wartosc,
        source: 'inspektor_karta',
      }),
    [openOperationForm],
  );

  const temat = kontekst?.temat ?? null;
  const akcje = useMemo(
    () => (temat ? akcjeElementu(snapshot, logicalViews, temat, status) : []),
    [logicalViews, snapshot, status, temat],
  );
  const wykonajAkcje = useCallback(
    (actionId: string) => {
      if (!temat) return;
      wykonawca(actionId, temat.menuKind, temat.modelRef);
    },
    [temat, wykonawca],
  );

  const szkicDer = szkic && selekcjaId !== null && szkic.stationRef === selekcjaId ? szkic : null;
  const daneSzkicuDer = useMemo(
    () => (szkicDer ? buildDaneSzkicuDer(snapshot, sldData, szkicDer.stationRef) : null),
    [sldData, snapshot, szkicDer],
  );

  const konfiguracja = useMemo<OtwarcieKonfiguracji | null>(() => {
    if (!dane?.elementId) return null;
    const elementId = dane.elementId;
    if (dane.kind === 'cable_run') {
      return {
        etykietaPl: 'Otwórz konfigurację odcinka (trasa)',
        otworz: () =>
          openRouteSurface('E-12', {
            entityRef: elementId,
            entityType: 'segment',
            subjectKind: 'helper_context',
            payload: { defaultCard: 'trasa' },
          }),
      };
    }
    if (dane.kind === 'node') {
      const slup = dane.nodeSpec?.nodeKind === 'branch_pole';
      return {
        etykietaPl: slup ? 'Otwórz kartę słupa rozgałęźnego' : 'Otwórz kartę złącza kablowego SN',
        otworz: () =>
          openRouteSurface(slup ? 'E-15' : 'E-14', {
            entityRef: elementId,
            entityType: slup ? 'branch_pole' : 'zksn',
            subjectKind: 'helper_context',
          }),
      };
    }
    return null;
  }, [dane, openRouteSurface]);

  if (selekcjaId === null) return null;
  return {
    dane,
    temat,
    akcje,
    wykonajAkcje,
    // Obiekt bez danych panelu (np. istniejące źródło OZE) nadal ma wielkości wynikowe
    // pod refem modelu tematu — ta sama funkcja odczytu nakładki.
    wyniki: stanWynikowElementu(
      payload != null,
      swiezoscBiegu?.stan ?? null,
      dane?.liveMetrics ?? (temat ? buildLiveMetrics(payload, null, temat.modelRef) : undefined),
      nakladka.runId,
    ),
    szkicDer,
    daneSzkicuDer,
    konfiguracja,
    karta,
    edytuj: edycjaDozwolona ? edytuj : null,
    kartaGpz,
  };
}
