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
import { buildSldDataFromSnapshot, projectBayPrimaryDevices } from '../../sld/v2/canvas/enmToSldAdapter';
import { symbolIdForPrimaryDeviceKind } from '../../sld/v3/compose/apparatusSequence';
import type { SelectedElement } from '../../types';
import type { SldMenuAction } from '../../sld/v2/command/SldCommandService';
import {
  buildCanvasModelIndex,
  ELEMENT_KIND_KOTWICY,
  elementTypeForKind,
  refOperacjiTematu,
  resolveCanvasMenuSubject,
  type CanvasMenuSubject,
  type CanvasModelIndex,
} from '../../sld/v3/canvas/canvasMenuSubject';
import { akcjeElementu } from '../../sld/shared/akcjeElementu';
import {
  buildDaneElementuKanwy,
  buildDaneSzkicuDer,
  odczytWynikuElementu,
  type DaneElementuKanwy,
  type RodzajElementuKanwy,
  type OdczytWynikuElementu,
} from '../../sld/shared/daneElementuKanwy';
import { selectResultLabelSpecs, type ResultLabelAnalysis } from '../../sld/shared/resultLabelTemplates';
import {
  kontekstDlaSelekcji,
  useKontekstElementuKanwy,
  type KontekstElementuKanwy,
  type SzkicDer,
} from '../../sld/shared/kontekstElementuKanwy';
import { useSldActionExecutor } from '../../sld/shared/sldActionExecutor';
import {
  buildKartaTechniczna,
  type CelAkcjiKarty,
  type CelWierszaTabeli,
  type AkcjaWiersza,
  type EdycjaWiersza,
  type KartaTechniczna,
} from '../../sld/shared/kartaTechnicznaElementu';
import { useKatalogiKarty } from './katalogiKarty';
import type { ObslugaAkcjiKarty } from './KartaTechnicznaElementu';

/** Nazwa rodzaju obiektu kanwy (nagłówek inspektora, zdanie przyczyny braku wyników). */
export const NAZWA_RODZAJU: Readonly<Record<NonNullable<RodzajElementuKanwy>, string>> = {
  station: 'Stacja SN/nN',
  bay: 'Pole',
  apparatus: 'Aparat',
  transformer: 'Transformator',
  der: 'Źródło rozproszone',
  cable_run: 'Ciąg SN',
  node: 'Węzeł sieci SN',
  generator: 'Źródło OZE',
  grid_source: 'Sieć zasilająca',
  bus: 'Szyna',
};

const REF_WEWNETRZNY = /\b(?:stn|seg|gpz|bus|bay|pv|bess|fw|source)\/[^\s]+/i;

function etykietaPubliczna(wartosc: string | null | undefined): wartosc is string {
  return Boolean(wartosc && !REF_WEWNETRZNY.test(wartosc));
}

/** Nazwa obiektu na schemacie — publiczna etykieta, kod stacji albo nazwa rodzaju. */
export function etykietaElementuKanwy(dane: DaneElementuKanwy): string {
  if (etykietaPubliczna(dane.label)) return dane.label;
  if (dane.kind === 'station' && dane.stationCode) return dane.stationCode;
  return dane.kind ? NAZWA_RODZAJU[dane.kind] : 'Element schematu';
}

/** Bieg, z którego pochodzi sekcja wyników (karta K8: atrybuty `data-run-id`/`data-swiezosc`). */
interface ZrodloWynikowElementu {
  readonly runId: string | null;
  readonly swiezosc: StanSwiezosciBiegu | null;
  /** Rodzina analizy biegu (tytuł sekcji: „Obliczenia zwarciowe”, „Rozpływ mocy”…). */
  readonly analiza: ResultLabelAnalysis | null;
}

/** Stan sekcji wyników: brak / nieaktualne / wartość — bez wartości zastępczych. */
export type StanWynikowElementu =
  | ({ readonly stan: 'brak'; readonly powodPl: string } & ZrodloWynikowElementu)
  | ({
      readonly stan: 'wartosc' | 'nieaktualne';
      readonly metryki: NonNullable<DaneElementuKanwy['liveMetrics']>;
    } & ZrodloWynikowElementu);

export const POWOD_BRAK_PRZEBIEGU_PL =
  'Brak wyników obliczeń aktywnego przypadku. Uruchom obliczenia, aby zobaczyć wielkości elementu.';

/** Tytuł sekcji wyników wg rodziny analizy biegu (karta INSPEKTOR-I-NAWIGACJA pkt 3). */
export const TYTUL_WYNIKOW_PL: Readonly<Record<ResultLabelAnalysis, string>> = {
  short_circuit: 'Obliczenia zwarciowe',
  load_flow: 'Rozpływ mocy',
  short_circuit_delta: 'Porównanie zwarć A/B',
};

/** Rodzaj obiektu w dopełniaczu — zdanie przyczyny („… dla szyny Szyna nN stacji”). */
const RODZAJ_DLA_PL: Readonly<Record<string, string>> = {
  bus: 'szyny',
  transformer: 'transformatora',
  source: 'źródła',
  branch: 'gałęzi',
};

/**
 * Przyczyna braku wielkości — rodzaj obliczenia, konkretny obiekt i USTALONA przyczyna
 * (karta INSPEKTOR-I-NAWIGACJA pkt 3), z odczytu nakładki, nie z domysłu:
 *  - bieg nieznanej rodziny analizy (brak wykazu wielkości),
 *  - rodzaj obiektu, dla którego ta analiza nie wyznacza wielkości (np. pole SN — wynik
 *    należy do szyny albo aparatu; gałąź w obliczeniach zwarciowych — wynik w węzłach),
 *  - obiekt nie jest punktem obliczeń biegu (brak wpisu w wyniku),
 *  - wpis jest, ale bez wartości liczbowych wykazu.
 */
export function powodBrakuWielkosci(odczyt: OdczytWynikuElementu, nazwaObiektu: string): string {
  const { analiza, klasa, punktWWyniku } = odczyt;
  if (!analiza) {
    return `Oglądany przebieg nie jest obliczeniem zwarciowym ani rozpływem mocy — ta analiza nie wyznacza wielkości obiektu ${nazwaObiektu}.`;
  }
  const obliczenie = TYTUL_WYNIKOW_PL[analiza];
  if (!klasa) {
    return `${obliczenie}: obiekt ${nazwaObiektu} nie jest punktem obliczeń — wielkości należą do jego szyny albo aparatu.`;
  }
  const dla = `${RODZAJ_DLA_PL[klasa]} ${nazwaObiektu}`;
  if (selectSpecsPuste(analiza, klasa)) {
    return `${obliczenie} nie wyznaczają wielkości dla ${dla} — wyniki tej analizy są w węzłach sieci.`;
  }
  if (!punktWWyniku) {
    return `${obliczenie}: przebieg nie liczył punktu dla ${dla} — obiekt nie jest punktem obliczeń tego przebiegu.`;
  }
  return `${obliczenie}: wynik przebiegu dla ${dla} nie niesie wartości liczbowych.`;
}

function selectSpecsPuste(analiza: ResultLabelAnalysis, klasa: NonNullable<OdczytWynikuElementu['klasa']>): boolean {
  return selectResultLabelSpecs(analiza, klasa).length === 0;
}

/**
 * Stan wyników elementu z biegu OGLĄDANEGO. Nieaktualność z TEGO SAMEGO predykatu
 * świeżości biegu, którym kanwa bramkuje etykiety wyników (karta K8,
 * `kontekstWyniku.swiezoscBiegu`).
 */
export function stanWynikowElementu(
  maWynikPrzebiegu: boolean,
  swiezosc: StanSwiezosciBiegu | null,
  odczyt: OdczytWynikuElementu,
  nazwaObiektu: string,
  runId: string | null = null,
): StanWynikowElementu {
  const zrodlo = {
    runId: maWynikPrzebiegu ? runId : null,
    swiezosc: maWynikPrzebiegu ? swiezosc : null,
    analiza: maWynikPrzebiegu ? odczyt.analiza : null,
  };
  if (!maWynikPrzebiegu) return { stan: 'brak', powodPl: POWOD_BRAK_PRZEBIEGU_PL, ...zrodlo };
  if (odczyt.metryki.length === 0) return { stan: 'brak', powodPl: powodBrakuWielkosci(odczyt, nazwaObiektu), ...zrodlo };
  return { stan: swiezosc === 'nieaktualny' ? 'nieaktualne' : 'wartosc', metryki: odczyt.metryki, ...zrodlo };
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

/**
 * Wskazanie aparatu pola z wiersza tabeli karty pola — TO SAMO, które zapisuje klik w symbol
 * aparatu na kanwie (`SldCanvasV3Workspace.handleElementClick`): selekcja pod refem pola
 * (właściciel symbolu) z typem `elementTypeForKind('apparatus')`, kontekst z rodzajem
 * `'apparatus'`, refem pola i refem urządzenia, temat z `resolveCanvasMenuSubject` z symbolem
 * aparatu tej samej sekwencji co rysunek (`projectBayPrimaryDevices` →
 * `symbolIdForPrimaryDeviceKind`) i z refem urządzenia (`deviceRef`, jak trafienie symbolu). Dzięki temu karta aparatu i jej pasek działań są te same,
 * co po kliknięciu symbolu. Rodzaj bez symbolu toru (np. przekładnik niezrównoważenia) — temat
 * pola bez symbolu aparatu (bez domysłu rodzaju, jak napis pola na kanwie).
 */
export function wskazanieAparatuPola(
  snapshot: EnergyNetworkModel | null,
  index: CanvasModelIndex,
  cel: CelWierszaTabeli,
  tylkoOdczyt: boolean,
): { readonly zaznaczenie: SelectedElement; readonly kontekst: KontekstElementuKanwy } {
  const pole = (snapshot?.bays ?? []).find((b) => b.ref_id === cel.poleRef) ?? null;
  const galezie = new Map((snapshot?.branches ?? []).map((b) => [b.ref_id, b]));
  const urzadzenie = pole ? projectBayPrimaryDevices(pole, galezie, snapshot?.bays)?.find((d) => d.deviceRef === cel.aparatRef) : undefined;
  const symbolId = urzadzenie ? symbolIdForPrimaryDeviceKind(urzadzenie.kind) ?? undefined : undefined;
  // To samo wejście co klik w symbol aparatu na kanwie (`SldCanvasV3Workspace` — meta symbolu
  // z `deviceRef`): temat niesie urządzenie, więc karta i działania z wiersza ≡ z kanwy.
  const wynik = resolveCanvasMenuSubject(
    { ownerRef: cel.poleRef, elementKind: 'apparatus', symbolId, deviceRef: cel.aparatRef },
    index,
  );
  const typ = elementTypeForKind('apparatus');
  return {
    zaznaczenie: typ
      ? { id: cel.poleRef, type: typ, name: cel.poleRef }
      : { id: cel.poleRef, type: 'DescriptiveElement', name: cel.poleRef },
    kontekst: {
      selekcjaId: cel.poleRef,
      elementKind: 'apparatus',
      ref: cel.poleRef,
      deviceRef: cel.aparatRef,
      temat: wynik.stan === 'temat' ? wynik.temat : null,
      tylkoOdczyt,
    },
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
  /** Otwarcie karty aparatu z wiersza tabeli aparatów pola (`wskazanieAparatuPola`). */
  readonly otworzAparat: (cel: CelWierszaTabeli) => void;
  /** Operacja usuwająca brak z wiersza karty (kreator `add_relay` z `bay_ref`); `null` poza
   *  trybem edycji modelu — jak `edytuj`. */
  readonly wykonajAkcjeWiersza: ((akcja: AkcjaWiersza) => void) | null;
  /** Akcja wiersza tabeli karty (przejście do nastaw): ekran E-27 zawsze, formularz operacji
   *  modelu wyłącznie przy dozwolonej edycji — inaczej `null` i przycisku nie ma. */
  readonly akcjaKarty: ObslugaAkcjiKarty;
  /** Sekcja karty, do której prowadzi kliknięty obiekt rysunku (`KontekstElementuKanwy.sekcja`). */
  readonly sekcjaWyrozniona: string | null;
  /** Obiekt, którego stan (istniejący / projektowany) inspektor zmienia operacją
   *  `set_object_state` — pole, aparat pola albo łącznik (`ui/field/EdytorStanuObiektuPola`);
   *  `null` poza trybem edycji modelu i dla rodzaju bez stanu obiektu — jak `edytuj`. */
  readonly stanObiektuRef: string | null;
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
  // Wyniki obiektu z tego samego rejestru wielkości co etykiety kanwy; obiekt bez danych
  // panelu (np. istniejące źródło OZE) — pod refem modelu tematu.
  const odczytWynikow = useMemo(
    () =>
      dane?.elementId
        ? odczytWynikuElementu(payload, snapshot, dane.kind, dane.elementId)
        : odczytWynikuElementu(payload, snapshot, null, kontekst?.temat?.modelRef ?? selekcjaId ?? ''),
    [dane, kontekst, payload, selekcjaId, snapshot],
  );
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
  const wykonajAkcjeWiersza = useCallback(
    (akcja: AkcjaWiersza) => openOperationForm(akcja.operacja, { ...akcja.kontekst }),
    [openOperationForm],
  );

  const tylkoOdczytKontekstu = kontekst?.tylkoOdczyt ?? false;
  const otworzAparat = useCallback(
    (cel: CelWierszaTabeli) => {
      const { zaznaczenie, kontekst: kontekstAparatu } = wskazanieAparatuPola(snapshot, index, cel, tylkoOdczytKontekstu);
      // Kontekst przed selekcją: odczyt inspektora po zmianie selekcji od razu go widzi.
      useKontekstElementuKanwy.getState().ustawKontekst(kontekstAparatu);
      useSelectionStore.getState().selectElement(zaznaczenie);
    },
    [index, snapshot, tylkoOdczytKontekstu],
  );

  const akcjaKarty = useCallback<ObslugaAkcjiKarty>(
    (cel: CelAkcjiKarty) => {
      if (cel.rodzaj === 'ekran') return () => openRouteSurface(cel.kodEkranu);
      return edycjaDozwolona ? () => openOperationForm(cel.operacja, { ...cel.kontekst }) : null;
    },
    [edycjaDozwolona, openOperationForm, openRouteSurface],
  );

  const temat = kontekst?.temat ?? null;
  const akcje = useMemo(
    () => (temat ? akcjeElementu(snapshot, logicalViews, temat, status) : []),
    [logicalViews, snapshot, status, temat],
  );
  const wykonajAkcje = useCallback(
    (actionId: string) => {
      if (!temat) return;
      // Ten sam ref operacji co menu kanwy — aparat pola jako `${bayRef}#${SymbolId}` — i ten sam
      // rekord aparatu (`deviceRef`), gdy temat go zna (stan łącznika wskazanego urządzenia).
      wykonawca(actionId, temat.menuKind, refOperacjiTematu(temat), undefined, temat.deviceRef);
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
            payload: { defaultCard: 'route' },
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
      odczytWynikow,
      karta?.nazwa ?? (dane ? etykietaElementuKanwy(dane) : selekcja?.name ?? selekcjaId),
      nakladka.runId,
    ),
    szkicDer,
    daneSzkicuDer,
    konfiguracja,
    karta,
    edytuj: edycjaDozwolona ? edytuj : null,
    wykonajAkcjeWiersza: edycjaDozwolona ? wykonajAkcjeWiersza : null,
    otworzAparat,
    akcjaKarty,
    sekcjaWyrozniona: kontekst?.sekcja ?? null,
    stanObiektuRef:
      edycjaDozwolona && (dane?.kind === 'bay' || dane?.kind === 'apparatus') ? dane.elementId : null,
  };
}
