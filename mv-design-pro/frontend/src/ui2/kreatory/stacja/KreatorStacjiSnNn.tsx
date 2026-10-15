/**
 * Kreator „Dodaj stację SN/nN" — ui2, kreatory/rama (karta K9-B, opcja MAX).
 *
 * Prowadzi projektanta przez pełny łańcuch budowy stacji transformatorowej:
 * szablon startowy → rodzaj i umiejscowienie → transformator → EDYTOWALNA lista
 * pól SN (rola + szablon producenta + aparat z katalogu) → pomiar i
 * zabezpieczenia pól → blok nN → uziemienie → podgląd skutków (dry_run) →
 * zapis sekwencji operacji z łańcuchowaniem następnego kroku.
 *
 * Zasady (kanon): ZERO fizyki w UI — każda liczba pochodzi z katalogu albo z
 * backendu; ZERO fabrykacji — każda kontrolka mapuje na realne pole operacji
 * domenowej; aparat pola jest WYMAGANY (B-12: operacja nie dobiera go sama).
 *
 * Wyposażenie pól (CT/VT/zabezpieczenie) jedzie w TEJ SAMEJ operacji stacyjnej (atomowo).
 *
 * Prowadzenie projektanta (kontrakt `KONTRAKT_PROWADZENIA_PROJEKTANTA.md`): w trakcie pracy
 * kreator milczy; wartości dobiera wyłącznie z jednoznacznego źródła (jedyna zgodna pozycja
 * katalogu, szablon stacji, tabliczka transformatora); brak przy zapisie to jedno wskazanie
 * z przejściem do pola; konflikt widać od razu przy polu.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import {
  fetchBayApparatusKinds,
  fetchBayProtectionCodes,
  fetchCompleteBayTemplates,
  fetchConverterTypes,
  fetchCtTypes,
  fetchFactoryConfigurations,
  fetchManufacturers,
  fetchMvApparatusTypes,
  fetchMvProtectionDeviceTypes,
  fetchSwitchgearFamilies,
  fetchTransformerTypes,
  fetchVtTypes,
  getCatalogErrorMessage,
} from '../../../ui/catalog/api';
import type { CompleteMvBayTemplateSummary } from '../../../ui/catalog/BayTemplatePicker';
import type { Manufacturer } from '../../../ui/catalog/manufacturer';
import type { SwitchgearFamily } from '../../../ui/catalog/SwitchgearFamilyPicker';
import type {
  CTCatalogType,
  ConverterType,
  MVApparatusCatalogType,
  ProtectionDeviceType,
  TransformerType,
  VTCatalogType,
} from '../../../ui/catalog/types';
import {
  fetchStationTemplate,
  fetchStationTemplateCategories,
  fetchStationTemplates,
  previewStationTemplate,
  type StationTemplateFull,
  type StationTemplateSummary,
} from '../../../ui/network-build/station-templates/api';
import '../../kryteria/kryteria.css';
import { KRYTERIA_STRINGS, SekcjaBilansuCtVt, SekcjaKrzywychPrzekaznika } from '../../kryteria';
import {
  pobierzSzablonyUzytkownika,
  zapiszSzablonUzytkownika,
  type SzablonUzytkownika,
} from './szablonyUzytkownika';
import {
  contextString,
  deriveSnVoltageKv,
  resolveSegmentIdFromContext,
} from '../../../ui/network-build/forms/InsertStationFormHelpers';
import { fieldRoleLabelPl } from '../../../ui/sld/v2/station-rozdzielnia/contract';
import {
  useActiveOperationContext,
  useNetworkBuildStore,
} from '../../../ui/network-build/networkBuildStore';
import { scheduleNextOperationForm } from '../../../ui/network-build/trunkContinuation';
import { selectBusOptions, useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { PUNKTY_NEUTRALNE_IMPEDANCYJNE } from '../../../types/uziemienie';
import {
  KreatorGotowosc,
  KreatorInfo,
  KreatorNastepnyKrok,
  KreatorRama,
  KreatorSekcja,
  KreatorSiatka,
  PanelTeorii,
  PoleKatalogu,
  PoleLiczbowe,
  PoleTekstowe,
  PoleWyboru,
  RzadWartosci,
  jedynaZgodna,
  pierwszyBrak,
  useAktualnoscWskazania,
  useDecyzjeProjektanta,
  useProwadzenie,
  useSelekcjaPoOperacji,
  type BrakDoOperacji,
  type KrokKreatora,
  type WierszGotowosci,
} from '../rama';
import {
  APARATY_WYLACZAJACE,
  DANE_DOMYSLNE,
  aparatyDlaPola,
  brakiFormularza,
  brakiNnIUziemienia,
  brakiPol,
  brakujacePolaToru,
  czyAparaturaKompletna,
  czyKoniecOdcinka,
  domyslneWpisyPol,
  etykietaRodzajuAparatu,
  nowyWpisPola,
  nowyWpisWyposazenia,
  zbudujPolaSnZWpisow,
  zbudujWyposazeniePolaDoPayloadu,
  czyRozdzielnicaKompletna,
  czyZrodloNn,
  doborTransformatorow,
  falownikiZrodla,
  fmtKv,
  fmtMva,
  fmtPct,
  fmtRatio,
  konfliktyFormularza,
  kontekstKompletny,
  konwerterZKatalogu,
  mocZrodlaNnMva,
  etykietaKartyPola,
  nazwaOperacji,
  ogranicznikOdplywow,
  opcjeSzablonowRoli,
  parametryZKatalogu,
  producenciUzywalni,
  rodzajStacjiZKreatora,
  rodzajZabezpieczeniaZKodow,
  rolePolaStacji,
  szablonyDlaWyboru,
  typStacjiStartowy,
  uzwojenieVtZKlasy,
  wymaganeNapiecieNn,
  wyznaczTryb,
  zabezpieczenieZrodla,
  zbudujPayload,
  type BladPola,
  type KontekstStacji,
  type NnConfiguration,
  type PoleSnWpis,
  type SnFieldRole,
  type StacjaFormData,
  type TypKonstrukcji,
  type TypStacji,
  type WyborRozdzielnicy,
} from './stacjaModel';
import {
  aparaturaJednostkiPl,
  etykietaOfertyRodziny,
  naglowekRodziny,
  ofertaRodzinProducenta,
  polaZBloku,
  rozlozBlok,
  szerokoscBlokuPl,
  torRodziny,
  wyposazenieSzablonu,
  type BlokFabryczny,
} from './konfiguratorRozdzielnicy';
import { KLUCZE_OPERACJI_STACYJNEJ, KartaWyposazeniaPola } from './KartaWyposazeniaPola';
import { PodgladRozdzielnicySn } from './PodgladRozdzielnicySn';
import type { StatusKonfiguracji } from './podgladRozdzielnicy';
import { pobierzPodgladStacji, type PodgladStacji } from './stacjaPodglad';
import { refUtworzonejStacji } from './stacjaOdpowiedz';
import { KATEGORIE_SZABLONOW, wypelnienieZSzablonu } from './stacjaSzablony';
import { STACJA_STRINGS as T } from './strings';
import { NAZWA_RODZAJU_STACJI_PL } from '../../../ui/shared/rodzajStacji';
import { zaczepyZTabliczki } from '../transformator/transformatorModel';
import { aparatWOfercieRodziny, kartaZgodnaZAparatem } from './zgodnoscPola';

const KROKI: readonly KrokKreatora[] = [
  { id: 'szablon', tytul: T.krokSzablon },
  { id: 'rodzaj', tytul: T.krokRodzaj },
  { id: 'transformator', tytul: T.krokTransformator },
  { id: 'pola', tytul: T.krokPola },
  { id: 'pomiar', tytul: T.krokPomiar },
  { id: 'nn', tytul: T.krokNn },
  { id: 'uziemienie', tytul: T.krokUziemienie },
  { id: 'podglad', tytul: T.krokPodglad },
  { id: 'zapis', tytul: T.krokZapis },
];

/** Role pól dostępne w edytowalnej liście (kontrakt operacji stacyjnej). */
const ROLE_POL: readonly SnFieldRole[] = [
  'LINIA_IN',
  'LINIA_OUT',
  'LINIA_ODG',
  'TRANSFORMATOROWE',
  'SPRZEGLO',
];

/** Rola pola → rola przyjmowana przez tablicę kodów zabezpieczeń backendu. */
const ROLA_POLA_NA_BAY_ROLE: Record<SnFieldRole, string> = {
  LINIA_IN: 'IN',
  LINIA_OUT: 'OUT',
  LINIA_ODG: 'FEEDER',
  TRANSFORMATOROWE: 'TR',
  SPRZEGLO: 'COUPLER',
};

/** Następny krok po zapisie stacji (łańcuchowanie operacji). */
type NastepnyKrok = 'nic' | 'pierscien' | 'nop';


/** Miejsce stałego pola formularza w kreatorze — cel wskazania braku (krok + kontrolka). */
const MIEJSCA_STALE: Readonly<Record<string, { krok: string; pole?: string }>> = {
  umiejscowienie: { krok: 'rodzaj' },
  source_converter_ref: { krok: 'transformator', pole: 'mvd-kreator-stacja-falownik' },
  nn_voltage_kv: { krok: 'transformator', pole: 'mvd-kreator-stacja-nn' },
  catalog_ref: { krok: 'transformator', pole: 'mvd-kreator-stacja-katalog' },
  transformer_regulated_winding: { krok: 'transformator', pole: 'mvd-kreator-stacja-zaczepy-uzwojenie' },
  transformer_tap_min_position: { krok: 'transformator', pole: 'mvd-kreator-stacja-zaczepy-min' },
  transformer_tap_max_position: { krok: 'transformator', pole: 'mvd-kreator-stacja-zaczepy-max' },
  transformer_tap_neutral_position: { krok: 'transformator', pole: 'mvd-kreator-stacja-zaczepy-neutralna' },
  transformer_tap_current_position: { krok: 'transformator', pole: 'mvd-kreator-stacja-zaczepy-biezaca' },
  transformer_tap_step_percent: { krok: 'transformator', pole: 'mvd-kreator-stacja-zaczepy-krok' },
  manufacturer_ref: { krok: 'pola', pole: 'mvd-kreator-stacja-producent' },
  switchgear_family_ref: { krok: 'pola', pole: 'mvd-kreator-stacja-rodzina' },
  factory_configuration_ref: { krok: 'pola', pole: 'mvd-kreator-stacja-blok' },
  pola_toru: { krok: 'pola' },
  outgoing_feeders_nn_count: { krok: 'nn', pole: 'mvd-kreator-stacja-odplywy' },
  station_auxiliary_kw: { krok: 'nn', pole: 'mvd-kreator-stacja-pw-moc' },
  station_auxiliary_cosphi: { krok: 'nn', pole: 'mvd-kreator-stacja-pw-cosphi' },
  uklad_sieci_nn: { krok: 'uziemienie', pole: 'mvd-kreator-stacja-uklad-nn' },
  neutral_point: { krok: 'uziemienie', pole: 'mvd-kreator-stacja-punkt-neutralny' },
  neutral_impedance_ohm: { krok: 'uziemienie', pole: 'mvd-kreator-stacja-rezystancja-uziemienia' },
  insert_at_m: { krok: 'podglad', pole: 'mvd-kreator-stacja-insert-at' },
};

/** Decyzje projektanta chroniące pola przed automatem (klucz decyzji per pole formularza). */
const KLUCZ_DECYZJI: Partial<Record<keyof StacjaFormData, string>> = {
  source_converter_ref: 'falownik',
  catalog_ref: 'transformator',
  nn_voltage_kv: 'nn_voltage',
  manufacturer_ref: 'producent',
  switchgear_family_ref: 'rodzina',
};

/** Kontrolka pola rozdzielnicy (klucz `pole:<id>:<cecha>`) → krok i `data-testid`. */
const MIEJSCA_POLA: Readonly<Record<string, { krok: string; prefiks: string }>> = {
  szablon: { krok: 'pola', prefiks: 'mvd-kreator-stacja-pole-szablon' },
  aparat: { krok: 'pola', prefiks: 'mvd-kreator-stacja-aparat' },
  rodzaj_zabezpieczenia: { krok: 'pomiar', prefiks: 'mvd-kreator-stacja-rodzaj-zabezpieczenia' },
  ct: { krok: 'pomiar', prefiks: 'mvd-kreator-stacja-ct' },
  przekaznik: { krok: 'pomiar', prefiks: 'mvd-kreator-stacja-przekaznik' },
  vt_uzwojenie: { krok: 'pomiar', prefiks: 'mvd-kreator-stacja-vt-uzwojenie' },
};

const OPERACJA_NASTEPNEGO_KROKU: Record<
  Exclude<NastepnyKrok, 'nic'>,
  'connect_secondary_ring_sn' | 'set_normal_open_point'
> = {
  pierscien: 'connect_secondary_ring_sn',
  nop: 'set_normal_open_point',
};

export function KreatorStacjiSnNn() {
  const rawContext = useActiveOperationContext() as Record<string, unknown> | null;
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const selekcjaPoOperacji = useSelekcjaPoOperacji();

  const busOptions = useMemo(() => selectBusOptions(snapshot), [snapshot]);
  const context = rawContext ?? undefined;

  const kontekst = useMemo<KontekstStacji>(() => {
    const placementMode = typeof context?.placement_mode === 'string' ? context.placement_mode : '';
    const endpointBusRef = contextString(context, [
      'endpoint_bus_ref',
      'terminal_id',
      'terminalId',
      'from_bus_ref',
    ]);
    const runRef = contextString(context, ['run_ref', 'corridor_ref', 'trunk_id', 'trunkId']);
    // Miejsce wskazane na schemacie (udział długości odcinka). Brak = brak (dawniej środek).
    const rawPos = context?.position_on_segment;
    const positionOnSegment =
      typeof rawPos === 'number' && Number.isFinite(rawPos) && rawPos > 0 && rawPos < 1 ? rawPos : null;
    const segmentId = resolveSegmentIdFromContext(context, snapshot);
    // Napięcie SN z rzeczywistej szyny: odcinka (insert) lub terminala (append).
    // 0 = nieznane → serializacja pomija sn_voltage_kv, backend ustala z szyny.
    const snVoltageKv = deriveSnVoltageKv(snapshot, busOptions, segmentId, endpointBusRef);
    const tryb = wyznaczTryb(placementMode, endpointBusRef, positionOnSegment);
    const rawStationType =
      (context?.station as Record<string, unknown> | undefined)?.station_type
      ?? context?.station_type;
    // Rodzaj startowy listy pól: deklaracja z kontekstu albo minimalny zbiór pól toru dla
    // umiejscowienia (koniec odcinka → końcowa, podział → przelotowa); nigdy cicha „odgałęźna”.
    const stationKind = typStacjiStartowy(rawStationType, tryb);
    return {
      tryb,
      endpointBusRef,
      runRef,
      segmentId,
      positionOnSegment,
      snVoltageKv,
      stationName: contextString(context, ['station_name', 'name']),
      stationKind,
    };
  }, [busOptions, context, snapshot]);

  const [dane, setDane] = useState<StacjaFormData>(() => ({
    ...DANE_DOMYSLNE,
    station_type: kontekst.stationKind,
  }));
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);
  const [krok, setKrok] = useState<string>('szablon');
  const [zapisWToku, setZapisWToku] = useState(false);
  const prowadzenie = useProwadzenie(setKrok);
  const { edytowane, decyzjaProjektanta } = useDecyzjeProjektanta<string>();

  const [typy, setTypy] = useState<TransformerType[]>([]);
  const [konwertery, setKonwertery] = useState<ConverterType[]>([]);
  const [bladKatalogu, setBladKatalogu] = useState<string | null>(null);

  const [producenci, setProducenci] = useState<Manufacturer[]>([]);
  const [rodziny, setRodziny] = useState<SwitchgearFamily[]>([]);
  const [szablony, setSzablony] = useState<CompleteMvBayTemplateSummary[]>([]);
  const [bladRozdzielnicy, setBladRozdzielnicy] = useState<string | null>(null);
  const [aparaty, setAparaty] = useState<MVApparatusCatalogType[]>([]);
  const [bladAparatow, setBladAparatow] = useState<string | null>(null);

  // Tor BLOK_RMU — konfiguracje fabryczne WYBRANEJ rodziny (subzasób katalogu).
  // Stan pobrania jest jawny, bo „ta rodzina nie ma bloków w katalogu" i „bloki
  // jeszcze się nie pobrały" to dwa różne komunikaty: pierwszy jest werdyktem o
  // katalogu, drugi tylko chwilą oczekiwania.
  const [bloki, setBloki] = useState<BlokFabryczny[]>([]);
  const [blokiStan, setBlokiStan] = useState<'laduje' | 'gotowe'>('gotowe');
  const [bladBlokow, setBladBlokow] = useState<string | null>(null);

  // Krok 0 — biblioteka szablonów stacji.
  const [kategoriaSzablonu, setKategoriaSzablonu] = useState<string>(KATEGORIE_SZABLONOW[0]);
  // Nazwy kategorii biblioteki szablonów z backendu (w UI nazwa, nie identyfikator).
  const [nazwyKategorii, setNazwyKategorii] = useState<Record<string, string>>({});
  const [szablonyStacji, setSzablonyStacji] = useState<StationTemplateSummary[]>([]);
  /**
   * Stan pobrania biblioteki szablonów DLA WYBRANEJ KATEGORII.
   *
   * Do tej karty stanu nie było, a lista przy zmianie kategorii NIE była
   * czyszczona — przez czas trwania żądania picker pokazywał szablony
   * POPRZEDNIEJ kategorii jako szablony wybranej. Projektant, który wybrał
   * kategorię i od razu sięgnął po szablon, mógł wypełnić formularz szablonem z
   * zupełnie innej kategorii; nic go o tym nie informowało. Osobno: pusty stan
   * („biblioteka nie ma szablonów") wyświetlał się także PODCZAS ładowania,
   * czyli mówił „nie ma", zanim wiadomo było, czy jest.
   */
  const [szablonyStan, setSzablonyStan] = useState<'laduje' | 'gotowe'>('laduje');
  const [bladSzablonow, setBladSzablonow] = useState<string | null>(null);
  const [wybranySzablonId, setWybranySzablonId] = useState<string>('');
  // B-8: szablony ZAPISANE PRZEZ UŻYTKOWNIKA — osobny zbiór, osobna przestrzeń
  // identyfikatorów (`user_…`); wbudowane pozostają nietknięte.
  const [szablonyWlasne, setSzablonyWlasne] = useState<SzablonUzytkownika[]>([]);
  const [nazwaWlasnegoSzablonu, setNazwaWlasnegoSzablonu] = useState<string>('');
  const [komunikatZapisuSzablonu, setKomunikatZapisuSzablonu] = useState<string | null>(null);
  const [szablonZastosowany, setSzablonZastosowany] = useState<StationTemplateFull | null>(null);
  // Propozycja wyposażenia z szablonu stacji (CT i zabezpieczenie z katalogu MV) — trafia
  // WYŁĄCZNIE do pól z aparatem wyłączającym; VT nie trafia z automatu do żadnego pola.
  const [propozycjaWyposazenia, setPropozycjaWyposazenia] = useState<{
    ct: string | null;
    przekaznik: string | null;
  }>({ ct: null, przekaznik: null });

  // Krok 4 — katalogi pomiaru i zabezpieczeń.
  const [ctTypy, setCtTypy] = useState<CTCatalogType[]>([]);
  const [vtTypy, setVtTypy] = useState<VTCatalogType[]>([]);
  const [przekazniki, setPrzekazniki] = useState<ProtectionDeviceType[]>([]);
  const [kodyZabezpieczen, setKodyZabezpieczen] = useState<Record<string, string[]>>({});
  const [bladPomiaru, setBladPomiaru] = useState<string | null>(null);

  // KOMPLETNOSC-POLA-TR: rodzaje aparatu głównego dopuszczalne per rola pola —
  // readout z backendu (`BAY_PRIMARY_APPARATUS_KINDS_BY_ROLE`), zero tablicy
  // wariantów zaszytej w UI. Brak odpowiedzi = brak zawężenia (pełny katalog).
  const [rodzajeAparatuRoli, setRodzajeAparatuRoli] = useState<Record<string, string[]>>({});

  // Krok 7 — podgląd skutków (dry_run).
  const [podglad, setPodglad] = useState<PodgladStacji | null>(null);
  const [podgladStan, setPodgladStan] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [bladPodgladu, setBladPodgladu] = useState<string | null>(null);

  // Krok 8 — łańcuchowanie następnej operacji.
  const [nastepnyKrok, setNastepnyKrok] = useState<NastepnyKrok>('nic');

  // Typ stacji podpowiedziany z kontekstu operacji.
  useEffect(() => {
    setDane((p) => ({ ...p, station_type: kontekst.stationKind }));
  }, [kontekst.stationKind]);

  useEffect(() => {
    let cancelled = false;
    setBladKatalogu(null);
    Promise.all([fetchTransformerTypes(), fetchConverterTypes()])
      .then(([t, c]) => {
        if (cancelled) return;
        setTypy(Array.isArray(t) ? t : []);
        setKonwertery(Array.isArray(c) ? c : []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setTypy([]);
        setKonwertery([]);
        setBladKatalogu(getCatalogErrorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isZrodlo = czyZrodloNn(dane.nn_configuration);
  // Rezystancja uziemienia istotna tylko dla wariantów impedancyjnych (G-STK-1).
  const punktImpedancyjny = dane.neutral_point !== null && PUNKTY_NEUTRALNE_IMPEDANCYJNE.has(dane.neutral_point);
  const isCustomNn = dane.nn_configuration === 'CUSTOM_NN';
  const zrodloTeksty =
    dane.nn_configuration === 'PV_INVERTER'
      ? T.zrodloEtykiety.PV_INVERTER
      : dane.nn_configuration === 'BESS_INVERTER'
        ? T.zrodloEtykiety.BESS_INVERTER
        : dane.nn_configuration === 'FW_INVERTER'
          ? T.zrodloEtykiety.FW_INVERTER
          : null;
  const falowniki = useMemo(
    () => falownikiZrodla(konwertery, dane.nn_configuration),
    [konwertery, dane.nn_configuration],
  );
  const konwerter = useMemo(
    () => konwerterZKatalogu(dane.source_converter_ref, falowniki),
    [dane.source_converter_ref, falowniki],
  );
  const wymNn = useMemo(() => wymaganeNapiecieNn(dane, konwerter), [dane, konwerter]);
  const mocZrodla = useMemo(() => mocZrodlaNnMva(dane, konwerter), [dane, konwerter]);

  const dobrane = useMemo(
    () =>
      wymNn && wymNn > 0
        ? doborTransformatorow(typy, kontekst.snVoltageKv, wymNn, mocZrodla)
        : [],
    [kontekst.snVoltageKv, mocZrodla, typy, wymNn],
  );

  // Wariant źródłowy: referencja spoza listy dla rodzaju (PV/BESS/FW) odpada; jedyny zdatny
  // falownik wchodzi do pola (AUTO_PRZYJETE), kilka = wybór projektanta (dawniej pierwszy).
  useEffect(() => {
    if (!isZrodlo) return;
    if (dane.source_converter_ref && falowniki.some((c) => c.id === dane.source_converter_ref)) {
      return;
    }
    const jedyny = decyzjaProjektanta('falownik') ? null : jedynaZgodna(falowniki);
    setDane((p) => ({ ...p, source_converter_ref: jedyny?.id ?? null }));
  }, [dane.source_converter_ref, decyzjaProjektanta, falowniki, isZrodlo]);

  // Powrót do wariantu odbiorczego → wyczyść referencję falownika (spójność payloadu).
  useEffect(() => {
    if (!isZrodlo && dane.source_converter_ref) {
      setDane((p) => ({ ...p, source_converter_ref: null }));
    }
  }, [dane.source_converter_ref, isZrodlo]);

  // Gdy wybrany typ wypada z doboru (zmiana napięcia nN) — wyczyść wybór; jedyny zgodny typ
  // wchodzi do pola (AUTO_PRZYJETE), kilka = wybór projektanta.
  useEffect(() => {
    if (dane.catalog_ref && !dobrane.some((t) => t.id === dane.catalog_ref)) {
      setDane((p) => ({ ...p, catalog_ref: null }));
      return;
    }
    if (dane.catalog_ref || decyzjaProjektanta('transformator')) return;
    const jedyny = jedynaZgodna(dobrane);
    if (jedyny) setDane((p) => ({ ...p, catalog_ref: jedyny.id }));
  }, [dane.catalog_ref, decyzjaProjektanta, dobrane]);

  // Napięcie nN (wariant odbiorczy): jedyne napięcie dolne transformatorów katalogu na
  // napięcie SN szyny (AUTO_PRZYJETE) — kilka napięć = wybór projektanta (dawniej 0,4 kV).
  const napiecieNnJedyne = useMemo(() => {
    if (!(kontekst.snVoltageKv > 0)) return null;
    const napiecia = [...new Set(
      typy
        .filter((t) => 0.01 >= Math.abs(t.voltage_hv_kv - kontekst.snVoltageKv))
        .map((t) => t.voltage_lv_kv),
    )];
    return jedynaZgodna(napiecia);
  }, [kontekst.snVoltageKv, typy]);
  useEffect(() => {
    if (isZrodlo || dane.nn_voltage_kv !== null || napiecieNnJedyne === null) return;
    if (decyzjaProjektanta('nn_voltage')) return;
    setDane((p) => ({ ...p, nn_voltage_kv: napiecieNnJedyne }));
  }, [dane.nn_voltage_kv, decyzjaProjektanta, isZrodlo, napiecieNnJedyne]);

  const params = useMemo(
    () => parametryZKatalogu(dane.catalog_ref, typy),
    [dane.catalog_ref, typy],
  );

  // Zaczepy z tabliczki wybranego transformatora (jedno źródło z kreatorem transformatora):
  // przy włączonej regulacji pola nieedytowane przez projektanta idą za tabliczką.
  useEffect(() => {
    if (dane.transformer_regulation_type === 'NONE') return;
    const zaczepy = zaczepyZTabliczki(params);
    if (!zaczepy) return;
    const mapa = {
      transformer_tap_min_position: zaczepy.tap_min_position,
      transformer_tap_max_position: zaczepy.tap_max_position,
      transformer_tap_step_percent: zaczepy.tap_step_percent,
      transformer_tap_neutral_position: zaczepy.tap_neutral_position,
      transformer_tap_current_position: zaczepy.tap_current_position,
    } as const;
    setDane((p) => {
      let zmiana = false;
      const nastepne = { ...p };
      for (const [pole, wartosc] of Object.entries(mapa) as [keyof typeof mapa, number | null][]) {
        if (decyzjaProjektanta(pole) || nastepne[pole] === wartosc) continue;
        nastepne[pole] = wartosc;
        zmiana = true;
      }
      return zmiana ? nastepne : p;
    });
  }, [dane.transformer_regulation_type, decyzjaProjektanta, params]);

  // Katalog rozdzielnic SN: producenci + rodziny (raz).
  useEffect(() => {
    let cancelled = false;
    setBladRozdzielnicy(null);
    Promise.all([fetchManufacturers(), fetchSwitchgearFamilies()])
      .then(([m, f]) => {
        if (cancelled) return;
        setProducenci(Array.isArray(m) ? m : []);
        setRodziny(Array.isArray(f) ? f : []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setProducenci([]);
        setRodziny([]);
        setBladRozdzielnicy(getCatalogErrorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Katalog aparatury SN (APARAT_SN) — aparat pola wskazuje projektant (B-12).
  useEffect(() => {
    let cancelled = false;
    setBladAparatow(null);
    fetchMvApparatusTypes()
      .then((a) => {
        if (!cancelled) setAparaty(Array.isArray(a) ? a : []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setAparaty([]);
        setBladAparatow(getCatalogErrorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Zawężenie rodzaju aparatu per rola pola — POBIERANE OSOBNO od katalogu.
  // Pierwsza wersja tej karty łączyła oba pobrania w jedno `Promise.all`, więc
  // niedostępność samego zawężenia (backend bez tej końcówki, chwilowy błąd
  // sieci) kasowała RÓWNIEŻ listę aparatów i krok pól stawał się pusty —
  // dodatek do doboru wywracał dobór. Degradacja jest teraz proporcjonalna:
  // brak zawężenia = pełna lista katalogowa (zachowanie sprzed karty), a nie
  // brak listy.
  useEffect(() => {
    let cancelled = false;
    fetchBayApparatusKinds()
      .then((rodzaje) => {
        if (!cancelled) setRodzajeAparatuRoli(rodzaje ?? {});
      })
      .catch(() => {
        if (!cancelled) setRodzajeAparatuRoli({});
      });
    return () => {
      cancelled = true;
    };
  }, []);



  // Biblioteka szablonów stacji (krok 0) — lista dla wybranej kategorii.
  // Lista jest CZYSZCZONA na wejściu: dopóki nie wiadomo, jakie szablony ma
  // wybrana kategoria, picker nie może pokazywać szablonów poprzedniej (patrz
  // `szablonyStan` wyżej — oferta z cudzej kategorii jest gorsza od chwilowego
  // braku oferty, bo wygląda dokładnie jak prawdziwa).
  useEffect(() => {
    let cancelled = false;
    setBladSzablonow(null);
    setSzablonyStacji([]);
    setSzablonyStan('laduje');
    fetchStationTemplates(kategoriaSzablonu)
      .then((odp) => {
        if (cancelled) return;
        const lista = [...(odp.templates ?? [])];
        setSzablonyStacji(lista);
        setSzablonyStan('gotowe');
        const nazwa = lista[0]?.category_label_pl;
        if (nazwa) setNazwyKategorii((p) => (p[kategoriaSzablonu] ? p : { ...p, [kategoriaSzablonu]: nazwa }));
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setSzablonyStacji([]);
        setSzablonyStan('gotowe');
        setBladSzablonow(e instanceof Error ? e.message : T.szablonBlad);
      });
    return () => {
      cancelled = true;
    };
  }, [kategoriaSzablonu]);

  // B-8: szablony użytkownika — lista niezależna od kategorii wbudowanych.
  const odswiezSzablonyWlasne = useCallback(() => {
    pobierzSzablonyUzytkownika()
      .then(setSzablonyWlasne)
      // Brak listy własnych szablonów nie może wywrócić kroku 0 — biblioteka
      // wbudowana działa dalej (uczciwy stan zerowy zamiast błędu ekranu).
      .catch(() => setSzablonyWlasne([]));
  }, []);

  useEffect(() => {
    odswiezSzablonyWlasne();
  }, [odswiezSzablonyWlasne]);

  useEffect(() => {
    let cancelled = false;
    fetchStationTemplateCategories()
      .then((odp) => {
        if (cancelled) return;
        setNazwyKategorii(Object.fromEntries((odp.categories ?? []).map((k) => [k.id, k.label_pl])));
      })
      // Bez listy nazw kategorie pokazują się nazwami z odpowiedzi biblioteki (niżej).
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Katalogi kroku „Pomiar i zabezpieczenia" + kanoniczne kody funkcji per rola.
  useEffect(() => {
    let cancelled = false;
    setBladPomiaru(null);
    Promise.all([
      fetchCtTypes(),
      fetchVtTypes(),
      fetchMvProtectionDeviceTypes(),
      fetchBayProtectionCodes(),
    ])
      .then(([ct, vt, relays, kody]) => {
        if (cancelled) return;
        setCtTypy(Array.isArray(ct) ? ct : []);
        setVtTypy(Array.isArray(vt) ? vt : []);
        setPrzekazniki(Array.isArray(relays) ? relays : []);
        setKodyZabezpieczen(kody ?? {});
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setCtTypy([]);
        setVtTypy([]);
        setPrzekazniki([]);
        setKodyZabezpieczen({});
        setBladPomiaru(getCatalogErrorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const producenciDobrani = useMemo(
    () => producenciUzywalni(producenci, szablony),
    [producenci, szablony],
  );
  /**
   * OFERTA RODZIN producenta — WSZYSTKIE rodziny z katalogu, z jawnym powodem
   * niedostępności przy tych, na których katalog nie pozwala budować. Lista
   * zawężona do „używalnych" pokazywała producenta z jedną rodziną, choć katalog
   * niesie ich osiemnaście; projektant nie dowiadywał się, że reszta portfolio
   * czeka na kartę katalogową.
   */
  const ofertaRodzin = useMemo(
    () => ofertaRodzinProducenta(rodziny, dane.manufacturer_ref, kontekst.snVoltageKv),
    [dane.manufacturer_ref, kontekst.snVoltageKv, rodziny],
  );
  /** Rodziny, które WOLNO wybrać — jedno źródło dla resetu i dla walidacji. */
  const rodzinyDobrane = useMemo(
    () => ofertaRodzin.filter((p) => p.powod === null).map((p) => p.rodzina),
    [ofertaRodzin],
  );

  // Kompletne szablony pól — WSZYSTKICH producentów, raz. Lista producentów
  // kroku pól wynika z dostępności kompletnych szablonów (`producenciUzywalni`),
  // więc musi być znana ZANIM projektant wybierze producenta.
  useEffect(() => {
    let cancelled = false;
    fetchCompleteBayTemplates()
      .then((t) => {
        if (!cancelled) setSzablony(Array.isArray(t) ? t : []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setSzablony([]);
        setBladRozdzielnicy(getCatalogErrorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Producent: jedyny używalny w katalogu (AUTO_PRZYJETE) — kilku = wybór projektanta
  // (dawniej pierwszy z listy). Szablon stacji wnosi producenta sam (`zastosujSzablon`).
  useEffect(() => {
    if (producenciDobrani.length === 0 || dane.manufacturer_ref) return;
    if (decyzjaProjektanta('producent')) return;
    const jedyny = jedynaZgodna(producenciDobrani);
    if (jedyny) setDane((p) => ({ ...p, manufacturer_ref: jedyny.manufacturer_ref }));
  }, [dane.manufacturer_ref, decyzjaProjektanta, producenciDobrani]);

  // Rodzina spoza oferty producenta odpada; jedyna wybieralna rodzina wchodzi do pola
  // (AUTO_PRZYJETE), kilka = wybór projektanta.
  useEffect(() => {
    if (dane.switchgear_family_ref) {
      if (rodzinyDobrane.some((f) => f.switchgear_family_ref === dane.switchgear_family_ref)) return;
      setDane((p) => ({ ...p, switchgear_family_ref: null }));
      return;
    }
    if (decyzjaProjektanta('rodzina')) return;
    const jedyna = jedynaZgodna(rodzinyDobrane);
    if (jedyna) setDane((p) => ({ ...p, switchgear_family_ref: jedyna.switchgear_family_ref }));
  }, [dane.switchgear_family_ref, decyzjaProjektanta, rodzinyDobrane]);

  const szablonyWyboru = useMemo(
    () => szablonyDlaWyboru(szablony, dane.manufacturer_ref, dane.switchgear_family_ref),
    [dane.manufacturer_ref, dane.switchgear_family_ref, szablony],
  );
  const rolePol = useMemo(() => rolePolaStacji(dane.station_type), [dane.station_type]);
  /**
   * Karta katalogowa pola dla roli i aparatu: JEDYNA karta rodziny zgodna z rolą i z rodzajem
   * wskazanego aparatu (pole z rozłącznikiem bezpiecznikowym nie dostaje karty z wyłącznikiem).
   * Kilka zgodnych = wybór projektanta (dawniej pierwsza z listy).
   */
  const kartaJedyna = useCallback(
    (rola: SnFieldRole, aparatRef: string | null): string | null => {
      const rodzaj = aparatRef ? aparaty.find((a) => a.id === aparatRef)?.family_apparatus_kind ?? null : null;
      return (
        jedynaZgodna(
          opcjeSzablonowRoli(szablonyWyboru, rola),
          (t) => kartaZgodnaZAparatem(t, rodzaj),
        )?.template_ref ?? null
      );
    },
    [aparaty, szablonyWyboru],
  );
  /** Karta dla roli bez wskazanego aparatu (start listy pól, blok fabryczny). */
  const szablonyRola = useMemo(() => {
    const mapa: Partial<Record<SnFieldRole, CompleteMvBayTemplateSummary>> = {};
    for (const rola of ROLE_POL) {
      const ref = kartaJedyna(rola, null);
      const szablon = ref ? szablonyWyboru.find((t) => t.template_ref === ref) : undefined;
      if (szablon) mapa[rola] = szablon;
    }
    return mapa;
  }, [kartaJedyna, szablonyWyboru]);
  const selectedManufacturer = useMemo(
    () => producenciDobrani.find((m) => m.manufacturer_ref === dane.manufacturer_ref) ?? null,
    [dane.manufacturer_ref, producenciDobrani],
  );
  const selectedFamily = useMemo<SwitchgearFamily | null>(
    () => rodzinyDobrane.find((f) => f.switchgear_family_ref === dane.switchgear_family_ref) ?? null,
    [dane.switchgear_family_ref, rodzinyDobrane],
  );

  /**
   * Aparaty oferty WYBRANEJ RODZINY: rodzaje dopuszczone kartą rodziny, a w nich aparaty
   * producenta rodziny (`manufacturer_ref` pozycji katalogu) albo komponenty wymienne między
   * rodzinami (`interchangeable_across_families` — wkładki bezpiecznikowe). Oba rzuty
   * wystawia backend; ten sam predykat przypina test końcówki katalogu. Bez rodziny — pełny
   * katalog zdatny napięciowo (lista pól i tak czeka na wskazanie rodziny).
   */
  const aparatyRodziny = useMemo(
    () =>
      selectedFamily === null
        ? aparaty
        : aparaty.filter((a) => aparatWOfercieRodziny(a, selectedFamily)),
    [aparaty, selectedFamily],
  );

  /** Aparaty zdatne DLA ROLI pola — rodzina + zawężenie roli z backendu + napięcie. */
  const aparatyDlaRoli = useCallback(
    (rola: SnFieldRole) =>
      aparatyDlaPola(
        aparatyRodziny,
        kontekst.snVoltageKv,
        rodzajeAparatuRoli[ROLA_POLA_NA_BAY_ROLE[rola]] ?? [],
      ),
    [aparatyRodziny, kontekst.snVoltageKv, rodzajeAparatuRoli],
  );

  /** Lista bez zawężenia rolą — stan zerowy kroku. */
  const aparatyZdatne = useMemo(
    () => aparatyDlaPola(aparatyRodziny, kontekst.snVoltageKv),
    [aparatyRodziny, kontekst.snVoltageKv],
  );
  /**
   * TOR KONFIGURACJI wybranej rodziny — czytany z katalogu, nie z formularza
   * (kanon §3: pole WYLICZANE przez backend z konstrukcji rodziny). `null` =
   * rodzina niewybrana albo bez zadeklarowanej konstrukcji; kreator nie zgaduje
   * wtedy toru pracy, tylko nazywa brak.
   */
  const torKonfiguracji = useMemo(() => torRodziny(selectedFamily), [selectedFamily]);

  // Konfiguracje fabryczne rodziny RMU — subzasób WYBRANEJ rodziny. Lista jest
  // czyszczona na wejściu: bloki poprzedniej rodziny wyglądają dokładnie jak
  // prawdziwe, a opisują inny wyrób.
  useEffect(() => {
    const rodzinaRef = selectedFamily?.switchgear_family_ref ?? null;
    setBloki([]);
    setBladBlokow(null);
    if (rodzinaRef === null || torKonfiguracji !== 'BLOK_RMU') {
      setBlokiStan('gotowe');
      return undefined;
    }
    let cancelled = false;
    setBlokiStan('laduje');
    fetchFactoryConfigurations(rodzinaRef)
      .then((odp) => {
        if (cancelled) return;
        setBloki(Array.isArray(odp) ? odp : []);
        setBlokiStan('gotowe');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setBloki([]);
        setBlokiStan('gotowe');
        setBladBlokow(getCatalogErrorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedFamily, torKonfiguracji]);

  const wybranyBlok = useMemo<BlokFabryczny | null>(
    () => bloki.find((b) => b.configuration_ref === dane.factory_configuration_ref) ?? null,
    [bloki, dane.factory_configuration_ref],
  );

  /** Jednostki wybranego bloku z rolami kontraktu — readout składu wyrobu. */
  const jednostkiBloku = useMemo(() => rozlozBlok(wybranyBlok), [wybranyBlok]);

  /** Nagłówek rodziny — producent, klasy znamionowe, technologia, tor pracy. */
  const wierszeNaglowkaRodziny = useMemo(
    () => naglowekRodziny(selectedFamily, selectedManufacturer?.name ?? null),
    [selectedFamily, selectedManufacturer],
  );

  /**
   * WYBÓR BLOKU I POLA Z NIEGO ZBUDOWANE ŻYJĄ I GINĄ RAZEM.
   *
   * Blok przestaje obowiązywać, gdy rodzina zmienia się na inną (jego wyrób
   * znika z katalogu bieżącej rodziny) albo gdy nowa rodzina w ogóle nie chodzi
   * torem blokowym. W obu przypadkach odchodzą TAKŻE pola z niego zbudowane —
   * inaczej jednostki poprzedniego wyrobu zostawały na liście jako „pola
   * projektanta": tor modułowy widział komplet ról rodzaju stacji i nie
   * odbudowywał domyślnej listy, więc rozdzielnica cicho dziedziczyła skład
   * bloku, którego projektant już nie wybrał. Warunek WEJŚCIA (co zbudowało
   * pola) i WYJŚCIA (co je zwalnia) ma tu jedno źródło.
   *
   * Trwające pobranie bloków NIE kasuje wyboru: pusta lista w trakcie ładowania
   * znaczy „jeszcze nie wiem", a nie „tego bloku nie ma".
   */
  useEffect(() => {
    if (!dane.factory_configuration_ref) return;
    if (blokiStan === 'laduje') return;
    const blokNadalWybieralny =
      torKonfiguracji === 'BLOK_RMU'
      && bloki.some((b) => b.configuration_ref === dane.factory_configuration_ref);
    if (blokNadalWybieralny) return;
    setDane((p) => ({ ...p, factory_configuration_ref: null, pola: [], wyposazenie: {} }));
  }, [blokiStan, bloki, dane.factory_configuration_ref, torKonfiguracji]);

  /**
   * Aparat DLA ROLI — JEDYNY zdatny w ofercie rodziny dla roli pola (AUTO_PRZYJETE); kilka
   * zdatnych = wybór projektanta (dawniej pierwszy z listy — np. reklozer w polu liniowym).
   */
  const aparatDomyslnyRoli = useCallback(
    (rola: SnFieldRole) => jedynaZgodna(aparatyDlaRoli(rola))?.id ?? null,
    [aparatyDlaRoli],
  );

  /** Nazwy PL rozwiązań dopuszczalnych dla roli pola (wprost z kontraktu backendu). */
  const wariantyAparatuRoli = useCallback(
    (rola: SnFieldRole) =>
      (rodzajeAparatuRoli[ROLA_POLA_NA_BAY_ROLE[rola]] ?? []).map(etykietaRodzajuAparatu),
    [rodzajeAparatuRoli],
  );

  /** Katalogowe pole rodziny dla roli — dobór z pakietu wybranej rodziny. */
  const szablonDlaRoli = useCallback(
    (rola: SnFieldRole) => szablonyRola[rola]?.template_ref ?? null,
    [szablonyRola],
  );

  /**
   * Karta katalogowa WSKAZANA w polu — źródło składu pola na karcie wyposażenia.
   * Szukamy w pełnym zbiorze szablonów, nie w zawężonym do bieżącego wyboru:
   * gdy projektant zmieni rodzinę, pole przez chwilę wskazuje kartę poprzedniej
   * i lepiej pokazać jej prawdziwy skład niż pusty stan sugerujący pole bez
   * wyposażenia.
   */
  const szablonPolaWpisu = useCallback(
    (pole: PoleSnWpis) =>
      pole.bay_template_ref
        ? szablony.find((t) => t.template_ref === pole.bay_template_ref) ?? null
        : null,
    [szablony],
  );

  // Lista pól SN startuje od ról rodzaju stacji i pozostaje EDYTOWALNA (krok 3).
  // Zmiana rodzaju stacji przebudowuje listę domyślną — projektant świadomie
  // wybiera układ pól, więc zmiana rodzaju jest decyzją, nie przypadkiem.
  //
  // TOR BLOK_RMU jest z tego wyłączony: tam listę pól wyznacza BLOK FABRYCZNY
  // (efekt niżej), a nie role rodzaju stacji. Gdyby oba mechanizmy pisały do tej
  // samej listy, sekwencja jednostek wyrobu byłaby nadpisywana rolami stacji —
  // czyli kreator opisywałby blok, którego producent nie robi.
  //
  // KATALOG-FIRST: bez WSKAZANEJ RODZINY pól nie ma z czego złożyć. Wcześniej
  // krok komponował je z pakietu producenta bez względu na rodzinę, więc
  // rozdzielnica mogła powstać z kart DWÓCH RÓŻNYCH WYROBÓW naraz — ta sama
  // atrapa, co usunięta „rodzina standardowa producenta", tylko niewidoczna.
  //
  // Warunkiem jest TOR ZNANY I MODUŁOWY, nie „byle nie blokowy": rodzina, która
  // nie zadeklarowała konstrukcji, nie wyznacza toru pracy, więc kreator na niej
  // nie buduje (kanon §3). Inaczej ekran mówiłby „nie zgaduję toru", a listę pól
  // i tak by złożył.
  useEffect(() => {
    if (torKonfiguracji !== 'MODULARNY') return;
    if (selectedFamily === null) return;
    setDane((p) => {
      if (p.pola.length > 0 && p.pola.every((pole) => rolePol.includes(pole.field_role))) {
        return p;
      }
      if (p.pola.length > 0 && p.template_id) return p;
      return { ...p, pola: domyslneWpisyPol(p.station_type, szablonyRola, aparatDomyslnyRoli) };
    });
  }, [aparatDomyslnyRoli, rolePol, selectedFamily, szablonyRola, torKonfiguracji]);

  /**
   * Rodzina odznaczona zwalnia pola, które KREATOR sam skomponował z jej
   * pakietu — tak samo jak opuszczenie toru blokowego zwalnia jednostki bloku.
   *
   * WYJĄTEK: lista pochodząca z SZABLONU STARTOWEGO zostaje. To decyzja
   * projektanta z kroku 0 (role pól i aparaty przyszły z szablonu, nie z
   * rodziny), więc skasowanie jej przy zmianie rodziny byłoby cichym
   * wyrzuceniem jego pracy. Takie pola czekają na wskazanie rodziny z pustą
   * kartą katalogową — krok pozostaje wtedy jawnie niedomknięty.
   */
  useEffect(() => {
    if (selectedFamily !== null && torKonfiguracji !== null) return;
    setDane((p) =>
      p.pola.length === 0 || p.template_id !== null ? p : { ...p, pola: [], wyposazenie: {} },
    );
  }, [selectedFamily, torKonfiguracji]);

  /**
   * TOR BLOK_RMU — pola rozdzielnicy WYNIKAJĄ z wybranego bloku fabrycznego.
   * Sekwencja jednostek jest stałą cechą wyrobu, więc lista pól przebudowuje się
   * przy każdej zmianie bloku; wyposażenie poprzedniego bloku odchodzi razem
   * z jego wpisami (klucze wyposażenia są per wpis pola).
   *
   * Brak wybranego bloku = ZERO pól: rodzina RMU bez bloku nie jest „pustą
   * rozdzielnicą do złożenia z pól", tylko wyborem, którego jeszcze nie ma.
   */
  useEffect(() => {
    if (torKonfiguracji !== 'BLOK_RMU') return;
    const polaBloku = polaZBloku(wybranyBlok, szablonDlaRoli, aparatDomyslnyRoli);
    setDane((p) => {
      const bezZmian =
        p.pola.length === polaBloku.length
        && p.pola.every((pole, index) => pole.id === polaBloku[index]?.id);
      if (bezZmian) return p;
      return {
        ...p,
        pola: polaBloku,
        wyposazenie: Object.fromEntries(
          Object.entries(p.wyposazenie).filter(([klucz]) =>
            polaBloku.some((pole) => pole.id === klucz),
          ),
        ),
      };
    });
  }, [aparatDomyslnyRoli, szablonDlaRoli, torKonfiguracji, wybranyBlok]);

  /**
   * Uzupełnienie wskazań w istniejących wpisach — WYŁĄCZNIE z jednoznacznego źródła, bez
   * nadpisywania decyzji projektanta:
   *  · aparat: wskazany zostaje, gdy należy do oferty rodziny dla roli; propozycja (szablon,
   *    automat) spoza oferty odpada na rzecz jedynego zdatnego albo wyboru projektanta;
   *    decyzja projektanta spoza oferty zostaje i jest KONFLIKTEM przy polu;
   *  · karta pola: wskazana zostaje, gdy należy do pakietu rodziny; brak = jedyna karta
   *    zgodna z rolą i rodzajem aparatu (bez rodziny pole zostaje bez karty).
   * ZBIÓR OFERTY I ZBIÓR ZACHOWANIA TO JEDEN ZBIÓR (`aparatyDlaRoli`, `szablonyWyboru`).
   */
  useEffect(() => {
    if (aparaty.length === 0) return;
    setDane((p) => {
      let zmiana = false;
      const pola = p.pola.map((pole) => {
        const oferta = aparatyDlaRoli(pole.field_role);
        const aparatWOfercie =
          pole.apparatus_catalog_ref !== null && oferta.some((a) => a.id === pole.apparatus_catalog_ref);
        const aparatRef =
          aparatWOfercie || decyzjaProjektanta(`aparat:${pole.id}`)
            ? pole.apparatus_catalog_ref
            : jedynaZgodna(oferta)?.id ?? null;
        // Karta przyjęta automatycznie zostaje, dopóki należy do pakietu rodziny I jest zgodna
        // z bieżącym aparatem (ten sam predykat, którym `kartaJedyna` ją wybrała). Zmiana
        // aparatu na niezgodny z kartą-automatem przelicza kartę; kartę wybraną przez
        // projektanta zostawia (niezgodność pokazuje wtedy konflikt przy polu).
        const rodzajAparatu = aparatRef
          ? aparaty.find((a) => a.id === aparatRef)?.family_apparatus_kind ?? null
          : null;
        const kartaBiezaca = pole.bay_template_ref !== null
          ? szablonyWyboru.find((t) => t.template_ref === pole.bay_template_ref) ?? null
          : null;
        const kartaWPakiecie =
          kartaBiezaca !== null && kartaZgodnaZAparatem(kartaBiezaca, rodzajAparatu);
        const szablonRef =
          kartaWPakiecie || decyzjaProjektanta(`szablon:${pole.id}`)
            ? pole.bay_template_ref
            : selectedFamily === null
              ? null
              : kartaJedyna(pole.field_role, aparatRef);
        if (szablonRef === pole.bay_template_ref && aparatRef === pole.apparatus_catalog_ref) {
          return pole;
        }
        zmiana = true;
        return { ...pole, bay_template_ref: szablonRef, apparatus_catalog_ref: aparatRef };
      });
      return zmiana ? { ...p, pola } : p;
    });
    // `dane.pola` w zależnościach: zmiana aparatu pola przelicza kartę-automat (wyżej).
    // Aktualizacja bez zmiany zwraca ten sam obiekt stanu, więc nie ma pętli renderów.
  }, [aparaty, aparatyDlaRoli, dane.pola, decyzjaProjektanta, kartaJedyna, selectedFamily, szablonyWyboru]);

  /**
   * Wyposażenie pola idzie za APARATEM (item 4 przejścia scenariusza 630 kVA): propozycja
   * szablonu stacji (CT + zabezpieczenie) trafia WYŁĄCZNIE do pól z aparatem wyłączającym
   * (wyłącznik, reklozer). Pole z rozłącznikiem bezpiecznikowym nie ma przekaźnika ani CT
   * zabezpieczeniowego; VT nie trafia z automatu do żadnego pola. Rodzaj zabezpieczenia
   * z kanonicznych kodów funkcji roli (readout backendu). Pole, którego wyposażenie projektant
   * zmienił, automat zostawia.
   */
  useEffect(() => {
    if (!propozycjaWyposazenia.ct && !propozycjaWyposazenia.przekaznik) return;
    setDane((p) => {
      let zmiana = false;
      const wyposazenie = { ...p.wyposazenie };
      for (const pole of p.pola) {
        if (decyzjaProjektanta(`wyposazenie:${pole.id}`)) continue;
        const rodzaj = aparaty.find((a) => a.id === pole.apparatus_catalog_ref)?.device_kind ?? null;
        const wylaczajacy = rodzaj !== null && APARATY_WYLACZAJACE.has(rodzaj);
        const kody = kodyZabezpieczen[ROLA_POLA_NA_BAY_ROLE[pole.field_role]] ?? [];
        const biezacy = wyposazenie[pole.id] ?? nowyWpisWyposazenia();
        const ct = wylaczajacy ? propozycjaWyposazenia.ct : null;
        const przekaznik = wylaczajacy ? propozycjaWyposazenia.przekaznik : null;
        const rodzajZab = przekaznik ? rodzajZabezpieczeniaZKodow(kody) : '';
        if (
          biezacy.ct_catalog_ref === ct
          && biezacy.relay_catalog_ref === przekaznik
          && biezacy.relay_type === rodzajZab
        ) {
          continue;
        }
        wyposazenie[pole.id] = {
          ...biezacy,
          ct_catalog_ref: ct,
          relay_catalog_ref: przekaznik,
          relay_type: rodzajZab,
        };
        zmiana = true;
      }
      return zmiana ? { ...p, wyposazenie } : p;
    });
  }, [aparaty, dane.pola, decyzjaProjektanta, kodyZabezpieczen, propozycjaWyposazenia]);

  /**
   * Wyposażenie pól (krok 4) per WPIS pola — jedzie w TEJ SAMEJ operacji co
   * stacja (B-3). Przekładnie CT/VT pochodzą z pozycji katalogowej, parametry
   * materializuje backend (zero fizyki w UI).
   */
  const wyposazenieDoPayloadu = useMemo(() => {
    const mapa: Record<string, Record<string, unknown> | null> = {};
    for (const pole of dane.pola) {
      mapa[pole.id] = zbudujWyposazeniePolaDoPayloadu(dane.wyposazenie[pole.id], ctTypy, vtTypy);
    }
    return mapa;
  }, [ctTypy, dane.pola, dane.wyposazenie, vtTypy]);

  // Blok fabryczny NIE jest tu osobnym argumentem: tożsamość wyrobu siedzi na
  // WPISIE pola (`polaZBloku` nadaje ref bloku i numer jednostki), więc lista
  // pól i ich przynależność do bloku pochodzą z jednego źródła — nie da się
  // wysłać pola z bloku, którego ten wpis nie ma.
  const snFields = useMemo(
    () =>
      zbudujPolaSnZWpisow(
        dane.pola,
        {
          manufacturerRef: dane.manufacturer_ref,
          switchgearFamilyRef: dane.switchgear_family_ref,
        },
        szablonyWyboru,
        wyposazenieDoPayloadu,
      ),
    [
      dane.manufacturer_ref,
      dane.pola,
      dane.switchgear_family_ref,
      szablonyWyboru,
      wyposazenieDoPayloadu,
    ],
  );
  const rozdzielnicaKompletna = czyRozdzielnicaKompletna(snFields);
  // POLA-W-TORZE: pola toru wymagane przez umiejscowienie (JEDEN predykat
  // `brakujacePolaToru`, ten sam zbiór, który operacja domyka). Kreator ZAWSZE tworzy
  // transformator, więc pole TR należy do toru w obu trybach; brak dowolnego pola toru
  // blokuje zapis i jest nazwany wprost w kroku pól oraz w panelu kontroli.
  const polaToruBrak = brakujacePolaToru(dane.pola, kontekst.tryb);
  const brakPolaTransformatorowego = polaToruBrak.includes('TRANSFORMATOROWE');
  const brakPolLiniowychToru = polaToruBrak.filter((rola) => rola !== 'TRANSFORMATOROWE');
  const aparaturaKompletna = czyAparaturaKompletna(snFields);

  const dodajPole = useCallback(() => {
    setDane((p) => {
      const rola: SnFieldRole = 'LINIA_ODG';
      return {
        ...p,
        pola: [
          ...p.pola,
          nowyWpisPola(
            rola,
            szablonyRola[rola]?.template_ref ?? null,
            aparatDomyslnyRoli(rola),
            p.pola.length + 1,
          ),
        ],
      };
    });
  }, [aparatDomyslnyRoli, szablonyRola]);

  /**
   * Dodanie brakującego pola toru (transformatorowego albo liniowego) jednym kliknięciem.
   * Pole wchodzi z tym samym doborem, co domyślne (szablon roli + aparat dopuszczalny dla
   * roli) — projektant nie musi go składać od nowa i nadal może je edytować.
   */
  const dodajPoleToru = useCallback((rola: SnFieldRole) => {
    setDane((p) => {
      if (p.pola.some((pole) => pole.field_role === rola)) return p;
      const wpis = nowyWpisPola(
        rola,
        szablonyRola[rola]?.template_ref ?? null,
        aparatDomyslnyRoli(rola),
        p.pola.length + 1,
      );
      // Kolejność toru jak w składzie domykanym przez operację: pole wejściowe na
      // początku, wyjściowe zaraz za wejściowym, transformatorowe na końcu.
      const zaWejsciowym = p.pola.findIndex((pole) => pole.field_role === 'LINIA_IN') + 1;
      const pozycja =
        rola === 'LINIA_IN' ? 0 : rola === 'LINIA_OUT' ? zaWejsciowym : p.pola.length;
      return { ...p, pola: [...p.pola.slice(0, pozycja), wpis, ...p.pola.slice(pozycja)] };
    });
  }, [aparatDomyslnyRoli, szablonyRola]);

  const usunPole = useCallback((id: string) => {
    setDane((p) => ({
      ...p,
      pola: p.pola.filter((pole) => pole.id !== id),
      wyposazenie: Object.fromEntries(
        Object.entries(p.wyposazenie).filter(([klucz]) => klucz !== id),
      ),
    }));
  }, []);

  const zmienPole = useCallback(
    (id: string, zmiana: Partial<PoleSnWpis>) => {
      if (zmiana.apparatus_catalog_ref !== undefined) edytowane(`aparat:${id}`);
      if (zmiana.bay_template_ref !== undefined) edytowane(`szablon:${id}`);
      setDane((p) => ({
        ...p,
        pola: p.pola.map((pole) => (pole.id === id ? { ...pole, ...zmiana } : pole)),
      }));
    },
    [edytowane],
  );

  const zmienWyposazenie = useCallback(
    (id: string, zmiana: Partial<StacjaFormData['wyposazenie'][string]>) => {
      edytowane(`wyposazenie:${id}`);
      if (zmiana.vt_uzwojenie !== undefined) edytowane(`vt_uzwojenie:${id}`);
      if (zmiana.relay_type !== undefined) edytowane(`relay_type:${id}`);
      setDane((p) => {
        const biezace = p.wyposazenie[id] ?? nowyWpisWyposazenia();
        const nastepne = { ...biezace, ...zmiana };
        // Rodzaj zabezpieczenia z kodów funkcji roli pola (readout backendu), gdy wskazują
        // jeden rodzaj i projektant rodzaju sam nie wybrał.
        if (zmiana.relay_catalog_ref !== undefined && !decyzjaProjektanta(`relay_type:${id}`)) {
          const rola = p.pola.find((pole) => pole.id === id)?.field_role;
          nastepne.relay_type =
            zmiana.relay_catalog_ref && rola
              ? rodzajZabezpieczeniaZKodow(kodyZabezpieczen[ROLA_POLA_NA_BAY_ROLE[rola]] ?? [])
              : '';
        }
        // Kategoria uzwojenia VT z klasy dokładności wybranej pozycji katalogowej
        // (AUTO_PRZYJETE), dopóki projektant nie wskaże jej sam.
        if (zmiana.vt_catalog_ref !== undefined && !decyzjaProjektanta(`vt_uzwojenie:${id}`)) {
          const vt = vtTypy.find((t) => t.id === zmiana.vt_catalog_ref) ?? null;
          nastepne.vt_uzwojenie = vt ? uzwojenieVtZKlasy(vt.accuracy_class) : null;
        }
        return { ...p, wyposazenie: { ...p.wyposazenie, [id]: nastepne } };
      });
    },
    [decyzjaProjektanta, edytowane, kodyZabezpieczen, vtTypy],
  );

  const opcjeTypow = useMemo(
    () =>
      dobrane.map((t) => ({
        id: t.id,
        etykieta: `${t.name} · ${t.rated_power_mva} MVA · ${t.voltage_hv_kv}/${t.voltage_lv_kv} kV`,
      })),
    [dobrane],
  );

  const zmien = useCallback(
    <K extends keyof StacjaFormData>(pole: K, wartosc: StacjaFormData[K]) => {
      const klucz = KLUCZ_DECYZJI[pole] ?? (String(pole).startsWith('transformer_tap_') ? String(pole) : null);
      if (klucz) edytowane(klucz);
      setDane((p) => ({ ...p, [pole]: wartosc }));
    },
    [edytowane],
  );

  // KONFLIKT_TECHNICZNY — przy polu od razu (dane stacji + pola rozdzielnicy).
  const konfliktyDanych = useMemo(() => konfliktyFormularza(dane), [dane]);
  const konfliktyPol = useMemo<BladPola[]>(() => {
    if (aparaty.length === 0) return [];
    const wynik: BladPola[] = [];
    dane.pola.forEach((pole, index) => {
      const nr = index + 1;
      const aparat = pole.apparatus_catalog_ref
        ? aparaty.find((a) => a.id === pole.apparatus_catalog_ref) ?? null
        : null;
      if (aparat && !aparatyDlaRoli(pole.field_role).some((a) => a.id === aparat.id)) {
        wynik.push({
          field: `pole:${pole.id}:aparat`,
          message: `Aparat ${aparat.name} nie pasuje do pola ${nr}: spoza oferty rodziny rozdzielnicy, roli pola albo napięcia sieci — wybierz aparat z listy.`,
        });
      }
      const karta = pole.bay_template_ref
        ? szablony.find((t) => t.template_ref === pole.bay_template_ref) ?? null
        : null;
      // Zabezpieczenie działa przez wyłącznik pola (backend: `relay.breaker_missing`) —
      // pole z rozłącznikiem albo bezpiecznikiem nie ma czym wyłączyć prądu zwarciowego.
      if (
        aparat
        && dane.wyposazenie[pole.id]?.relay_catalog_ref
        && !APARATY_WYLACZAJACE.has(aparat.device_kind)
      ) {
        wynik.push({
          field: `pole:${pole.id}:przekaznik`,
          message: `Zabezpieczenie pola ${nr} wymaga wyłącznika — ${aparat.name} nie wyłącza prądu zwarciowego na sygnał przekaźnika.`,
        });
      }
      if (karta && aparat && !kartaZgodnaZAparatem(karta, aparat.family_apparatus_kind)) {
        const jestKartaZgodna = opcjeSzablonowRoli(szablonyWyboru, pole.field_role).some((t) =>
          kartaZgodnaZAparatem(t, aparat.family_apparatus_kind),
        );
        wynik.push(
          jestKartaZgodna
            ? {
                field: `pole:${pole.id}:szablon`,
                message: `Karta pola ${nr} ma inny aparat główny niż wybrany (${etykietaRodzajuAparatu(aparat.device_kind)}) — wybierz kartę zgodną z aparatem.`,
              }
            : {
                field: `pole:${pole.id}:aparat`,
                message: `Rodzina nie ma karty pola ${nr} z aparatem: ${etykietaRodzajuAparatu(aparat.device_kind)} — wybierz aparat zgodny z kartą pola.`,
              },
        );
      }
    });
    return wynik;
  }, [aparaty, aparatyDlaRoli, dane.pola, dane.wyposazenie, szablony, szablonyWyboru]);
  const konflikty = useMemo(() => [...konfliktyDanych, ...konfliktyPol], [konfliktyDanych, konfliktyPol]);
  const bladDlaPola = (pole: string): string | undefined =>
    konflikty.find((b) => b.field === pole)?.message;

  const kontekstOk = kontekstKompletny(kontekst);
  const brakFalownikowKomunikat =
    !bladKatalogu && isZrodlo && konwertery.length > 0 && falowniki.length === 0
      ? zrodloTeksty?.katalogBrak ?? null
      : null;
  const brakDoboruKomunikat =
    !bladKatalogu && typy.length > 0 && wymNn != null && wymNn > 0 && dobrane.length === 0
      ? T.brakDoboru
      : null;

  const rozdzielnica = useMemo<WyborRozdzielnicy>(
    () => ({
      manufacturerRef: dane.manufacturer_ref,
      manufacturerName: selectedManufacturer?.name ?? null,
      familyRef: dane.switchgear_family_ref,
      familyName: selectedFamily?.family_name ?? null,
      snFields,
    }),
    [dane.manufacturer_ref, dane.switchgear_family_ref, selectedFamily, selectedManufacturer, snFields],
  );

  /**
   * Liczba elementów wyposażenia w payloadzie stacji (B-3) — informacja „co
   * powstanie razem ze stacją", liczona z TEGO SAMEGO payloadu, który jedzie do
   * backendu (nie z osobnego zestawienia).
   */
  const liczbaElementowWyposazenia = useMemo(
    () =>
      Object.values(wyposazenieDoPayloadu).reduce(
        (suma, wyposazenie) => suma + (wyposazenie ? Object.keys(wyposazenie).length : 0),
        0,
      ),
    [wyposazenieDoPayloadu],
  );

  /** Wskazanie braku z klucza pola modelu (stałe pola formularza i pola rozdzielnicy). */
  const wskazanieBraku = useCallback(
    (blad: BladPola): BrakDoOperacji => {
      const [rodzaj, id, cecha] = blad.field.split(':');
      if (rodzaj === 'pole' && id && cecha) {
        const index = dane.pola.findIndex((pole) => pole.id === id);
        const miejsce = MIEJSCA_POLA[cecha];
        if (miejsce && index >= 0) {
          return { komunikat: blad.message, krok: miejsce.krok, pole: `${miejsce.prefiks}-${index + 1}` };
        }
      }
      const stale = MIEJSCA_STALE[blad.field];
      return { komunikat: blad.message, krok: stale?.krok, pole: stale?.pole };
    },
    [dane.pola],
  );

  /**
   * Konflikty i braki stacji w kolejności kroków kreatora — JEDNA lista dla zapisu
   * (pierwszy element = wskazanie) i dla werdyktu walidatora na kroku pól (sprawdzenie
   * rusza dopiero przy pustej liście, więc w trakcie pracy nie ma czerwieni).
   */
  const konfliktyIBraki = useCallback(
    (daneEff: StacjaFormData): BrakDoOperacji[] => {
      const polaToru = brakujacePolaToru(daneEff.pola, kontekst.tryb);
      const lista: Array<BrakDoOperacji | false> = [
        ...konflikty.map(wskazanieBraku),
        ...brakiFormularza(daneEff, kontekst).map(wskazanieBraku),
        torKonfiguracji === 'BLOK_RMU' && !daneEff.factory_configuration_ref
          && wskazanieBraku({ field: 'factory_configuration_ref', message: T.blokBrakWalid }),
        polaToru.length > 0
          && wskazanieBraku({
            field: 'pola_toru',
            message: T.polaToruBrakStopka(polaToru.map((rola) => fieldRoleLabelPl(rola)).join(', ')),
          }),
        ...brakiPol(daneEff.pola, daneEff.wyposazenie).map(wskazanieBraku),
        ...brakiNnIUziemienia(daneEff, kontekst).map(wskazanieBraku),
      ];
      return lista.filter((b): b is BrakDoOperacji => b !== false);
    },
    [konflikty, kontekst, torKonfiguracji, wskazanieBraku],
  );

  // Wskazanie gaśnie, gdy jego brak zniknął (także brak bez kontrolki, np. pola toru).
  // Brak przypadku obliczeniowego nie zależy od danych formularza — trzymany osobno.
  const biezaceBraki = useMemo(
    () => [...konfliktyIBraki(dane), ...(activeCaseId ? [] : [{ komunikat: T.brakZakresu }])],
    [activeCaseId, dane, konfliktyIBraki],
  );
  useAktualnoscWskazania(prowadzenie, biezaceBraki);

  const zapiszStacje = useCallback(
    async (daneEff: StacjaFormData, konwerterEff: ConverterType | null) => {
      const brak = pierwszyBrak([
        ...konfliktyIBraki(daneEff),
        !activeCaseId && { komunikat: T.brakZakresu },
      ]);
      if (brak || !activeCaseId) {
        if (brak) prowadzenie.wskaz(brak);
        return;
      }
      prowadzenie.zgas();
      setBladGlobalny(null);
      setZapisWToku(true);
      try {
        const response = await executeDomainOperation(
          activeCaseId,
          nazwaOperacji(kontekst),
          zbudujPayload(daneEff, kontekst, rozdzielnica, konwerterEff),
        );
        if (!response) {
          setBladGlobalny(useSnapshotStore.getState().error ?? T.bladZapisu);
          return;
        }
        if (response.error) {
          setBladGlobalny(response.error);
          return;
        }

        // B-3: wyposażenie pól (CT/VT/zabezpieczenie) powstało W TEJ SAMEJ
        // operacji co stacja — nie ma już sekwencji po zapisie ani stanu
        // połowicznego „wykonano N z M". Błąd wyposażenia = błąd całej operacji,
        // obsłużony wyżej (`response.error`), bez zapisanej stacji.
        const stationRef = refUtworzonejStacji(response);

        closeForm();
        selekcjaPoOperacji(response, {
          type: 'Station',
          name: daneEff.station_name.trim() || kontekst.stationName.trim() || 'Stacja SN/nN',
        });

        // Łańcuchowanie: od razu otwórz kolejną operację na nowej stacji.
        if (nastepnyKrok !== 'nic') {
          scheduleNextOperationForm(openOperationForm, OPERACJA_NASTEPNEGO_KROKU[nastepnyKrok], {
            station_ref: stationRef,
            element_ref: stationRef,
            element_type: 'Station',
            corridor_ref: kontekst.runRef,
            run_ref: kontekst.runRef,
          });
        }
      } catch (e) {
        setBladGlobalny(e instanceof Error ? e.message : T.bladZapisu);
      } finally {
        setZapisWToku(false);
      }
    },
    [
      activeCaseId,
      closeForm,
      executeDomainOperation,
      konfliktyIBraki,
      kontekst,
      nastepnyKrok,
      openOperationForm,
      prowadzenie,
      rozdzielnica,
      selekcjaPoOperacji,
    ],
  );

  /** Podgląd skutków (krok 7) — TA SAMA operacja z `dry_run`, wyłącznie odczyt. */
  const przeliczPodglad = useCallback(async () => {
    if (!activeCaseId || !kontekstOk) {
      setBladPodgladu(T.podgladBrakKontekstu);
      setPodgladStan('error');
      return;
    }
    setPodgladStan('loading');
    setBladPodgladu(null);
    try {
      const wynik = await pobierzPodgladStacji(
        activeCaseId,
        nazwaOperacji(kontekst),
        zbudujPayload(dane, kontekst, rozdzielnica, konwerter),
      );
      setPodglad(wynik);
      setPodgladStan('ready');
    } catch (e) {
      setPodglad(null);
      setBladPodgladu(e instanceof Error ? e.message : T.podgladBlad);
      setPodgladStan('error');
    }
  }, [activeCaseId, dane, kontekst, kontekstOk, konwerter, rozdzielnica]);

  /**
   * Podgląd na żądanie projektanta: przy braku danych — to samo wskazanie co zapis (bez
   * zapytania, które backend i tak by odrzucił), przy komplecie — podgląd `dry_run`.
   */
  const onPrzeliczPodglad = useCallback(() => {
    const brak = pierwszyBrak([...konfliktyIBraki(dane), !activeCaseId && { komunikat: T.brakZakresu }]);
    if (brak) {
      prowadzenie.wskaz(brak);
      return;
    }
    prowadzenie.zgas();
    void przeliczPodglad();
  }, [activeCaseId, dane, konfliktyIBraki, przeliczPodglad, prowadzenie]);

  /**
   * SLD-GEN-POLA — WERDYKT KONFIGURACJI ROZDZIELNICY w nagłówku kroku pól.
   *
   * Nie jest liczony w UI: to stan odczytu z walidatora backendu (`dry_run` tej
   * samej operacji domenowej, która wykona zapis), więc nagłówek pokazuje
   * dokładnie ten werdykt, który rozstrzygnie o przyjęciu stacji. Odwzorowanie
   * jest 1:1 i BEZ trzeciej oceny: „niesprawdzona" i „sprawdzanie" to stany
   * odczytu, nie własna opinia UI o poprawności.
   */
  const konfiguracjaKompletna = konfliktyIBraki(dane).length === 0;
  const statusKonfiguracji: StatusKonfiguracji = !konfiguracjaKompletna
    ? 'NIESPRAWDZONA'
    : podgladStan === 'ready'
      ? 'VALID'
      : podgladStan === 'error'
        ? 'INVALID'
        : podgladStan === 'loading'
          ? 'SPRAWDZANIE'
          : 'NIESPRAWDZONA';

  /**
   * Werdykt ma być ŚWIEŻY względem tego, co projektant właśnie skonfigurował,
   * więc na kroku pól sprawdzenie idzie samo po każdej zmianie konfiguracji
   * (z opóźnieniem, żeby wpisywanie w polu formularza nie wysyłało zapytania na
   * każdy znak). Bez tego nagłówek pokazywałby werdykt sprzed edycji — czyli
   * kłamałby dokładnie wtedy, gdy jest najbardziej potrzebny.
   *
   * Klucz efektu to SERIALIZOWANY PAYLOAD operacji: identyczna konfiguracja nie
   * wywołuje ponownego zapytania, każda realna zmiana wywołuje dokładnie jedno.
   */
  const payloadWerdyktu = useMemo(
    () =>
      konfiguracjaKompletna && activeCaseId
        ? JSON.stringify(zbudujPayload(dane, kontekst, rozdzielnica, konwerter))
        : null,
    [activeCaseId, dane, kontekst, konfiguracjaKompletna, konwerter, rozdzielnica],
  );
  useEffect(() => {
    if (krok !== 'pola' || payloadWerdyktu === null) return undefined;
    const uchwyt = setTimeout(() => {
      void przeliczPodglad();
    }, 400);
    return () => clearTimeout(uchwyt);
    // `przeliczPodglad` celowo poza zależnościami: zmienia tożsamość przy każdej
    // zmianie `dane`, a to samo źródło zmian niesie już `payloadWerdyktu` —
    // wpisanie go tutaj podwajałoby zapytania bez żadnej nowej informacji.
  }, [krok, payloadWerdyktu]);

  /** Krok 0 — wypełnienie formularza wybranym szablonem (wszystko edytowalne). */
  const zastosujSzablon = useCallback(async () => {
    if (!wybranySzablonId) {
      setBladSzablonow(T.szablonWybierzNajpierw);
      return;
    }
    setBladSzablonow(null);
    // B-8: szablon UŻYTKOWNIKA odtwarzamy 1:1 z zapisanego stanu formularza —
    // backend go nie interpretuje, więc nie ma miejsca na rozjazd zapisu i
    // odtworzenia. Szablony wbudowane idą dawną ścieżką (schemat + podgląd).
    const wlasny = szablonyWlasne.find((s) => s.id === wybranySzablonId);
    if (wlasny) {
      setSzablonZastosowany(null);
      setDane({
        ...DANE_DOMYSLNE,
        ...(wlasny.configuration as Partial<StacjaFormData>),
        template_id: wlasny.id,
        template_name: wlasny.name_pl,
      });
      return;
    }
    try {
      const [szablon, podgladSzablonu] = await Promise.all([
        fetchStationTemplate(wybranySzablonId),
        previewStationTemplate(wybranySzablonId, {}).catch(() => null),
      ]);
      const wypelnienie = wypelnienieZSzablonu(szablon, podgladSzablonu);
      setSzablonZastosowany(szablon);
      // Propozycje szablonu przyjmujemy TYLKO wtedy, gdy pozycja istnieje w katalogu, który
      // waliduje operacja (add_ct/add_relay). Przypisanie do pól idzie za aparatem (efekt
      // wyżej): pole bez aparatu wyłączającego nie dostaje ani CT, ani przekaźnika; VT nie
      // trafia z automatu nigdzie.
      const wKatalogu = (ref: string | null, lista: ReadonlyArray<{ id: string }>) =>
        ref && lista.some((t) => t.id === ref) ? ref : null;
      setPropozycjaWyposazenia({
        ct: wKatalogu(wypelnienie.ctRef, ctTypy),
        przekaznik: wKatalogu(wypelnienie.przekaznikRef, przekazniki),
      });
      setDane((p) => {
        const stationType = wypelnienie.stationType ?? p.station_type;
        // Aparat z szablonu (propozycja — odpada, gdy nie należy do oferty wskazanej rodziny),
        // a przy jego braku — jedyny zdatny DLA ROLI pola.
        const aparatRef = wypelnienie.aparatRef ?? null;
        const aparatDlaPola = (rola: SnFieldRole) => aparatRef ?? aparatDomyslnyRoli(rola);
        // Karta katalogowa pola pochodzi z pakietu WSKAZANEJ rodziny; szablon
        // stacji rodziny nie deklaruje (niesie role pól i aparat), więc dopóki
        // jej nie ma, pole zostaje bez karty. Dobór z pakietu producenta
        // mieszałby karty różnych wyrobów w jednej rozdzielnicy.
        const kartaDlaRoli = (rola: SnFieldRole) =>
          selectedFamily === null ? null : szablonyRola[rola]?.template_ref ?? null;
        const pola: PoleSnWpis[] =
          wypelnienie.pola.length > 0
            ? wypelnienie.pola.map((pole, index) =>
                nowyWpisPola(
                  pole.field_role,
                  kartaDlaRoli(pole.field_role),
                  pole.apparatus_catalog_ref ?? aparatDlaPola(pole.field_role),
                  index + 1,
                ),
              )
            : domyslneWpisyPol(stationType, szablonyRola, aparatDlaPola);
        return {
          ...p,
          template_id: wypelnienie.templateId,
          template_name: wypelnienie.templateName,
          station_type: stationType,
          catalog_ref: wypelnienie.transformerRef ?? p.catalog_ref,
          // Napięcie nN z tabliczki transformatora szablonu (jedno źródło z doborem).
          nn_voltage_kv:
            typy.find((t) => t.id === wypelnienie.transformerRef)?.voltage_lv_kv ?? p.nn_voltage_kv,
          transformer_units: wypelnienie.transformerCount ?? p.transformer_units,
          outgoing_feeders_nn_count:
            wypelnienie.nnFeedersCount != null && wypelnienie.nnFeedersCount > 0
              ? wypelnienie.nnFeedersCount
              : p.outgoing_feeders_nn_count,
          // Producent rozdzielnicy z szablonu (efektywna konfiguracja producenta).
          manufacturer_ref: wypelnienie.producentRef ?? p.manufacturer_ref,
          pola,
          wyposazenie: {},
        };
      });
    } catch (e) {
      setBladSzablonow(e instanceof Error ? e.message : T.szablonBlad);
    }
  }, [
    aparatDomyslnyRoli,
    ctTypy,
    przekazniki,
    selectedFamily,
    szablonyRola,
    szablonyWlasne,
    typy,
    wybranySzablonId,
  ]);

  /** B-8 — zapisz bieżącą konfigurację kreatora jako szablon użytkownika. */
  const zapiszJakoSzablon = useCallback(async () => {
    const nazwa = nazwaWlasnegoSzablonu.trim();
    if (!nazwa) {
      setKomunikatZapisuSzablonu(T.szablonZapiszBrakNazwy);
      return;
    }
    setKomunikatZapisuSzablonu(null);
    try {
      const zapisany = await zapiszSzablonUzytkownika(
        nazwa,
        null,
        dane as unknown as Record<string, unknown>,
      );
      odswiezSzablonyWlasne();
      setKomunikatZapisuSzablonu(T.szablonZapiszOk(zapisany.name_pl));
    } catch (e) {
      setKomunikatZapisuSzablonu(e instanceof Error ? e.message : T.szablonZapiszBlad);
    }
  }, [dane, nazwaWlasnegoSzablonu, odswiezSzablonyWlasne]);

  const pracujOdZera = useCallback(() => {
    setWybranySzablonId('');
    setSzablonZastosowany(null);
    setPropozycjaWyposazenia({ ct: null, przekaznik: null });
    setDane((p) => ({
      ...p,
      template_id: null,
      template_name: '',
      pola: domyslneWpisyPol(p.station_type, szablonyRola, aparatDomyslnyRoli),
      wyposazenie: {},
    }));
  }, [aparatDomyslnyRoli, szablonyRola]);

  const onZapisz = useCallback(() => {
    void zapiszStacje(dane, konwerter);
  }, [dane, konwerter, zapiszStacje]);

  const koniec = czyKoniecOdcinka(kontekst);
  // Rodzaj, który powstanie ze składu pól i umiejscowienia (jedna reguła produktu) — to on
  // jedzie do modelu; wybór w kroku „Rodzaj” ustawia tylko startową listę pól, więc nie ma
  // czego porównywać ani przed czym ostrzegać.
  // Przed złożeniem pól (rodzina jeszcze niewskazana) skład to startowa lista ról rodzaju
  // z kroku „Rodzaj” — pusta lista dawała tu fałszywą „stację końcową”.
  const rodzajWynikowy = rodzajStacjiZKreatora(
    dane.pola.length > 0 ? dane.pola : rolePol.map((field_role) => ({ field_role })),
    kontekst.tryb,
  );
  const typLabel = T.rodzajWynikowy(NAZWA_RODZAJU_STACJI_PL[rodzajWynikowy]);
  const umiejscowienieLabel = koniec ? T.umiejscowienieKoniec : T.umiejscowieniePodzial;
  // Nazwy elementów miejsca stacji (w UI nazwa, nie identyfikator modelu).
  const nazwaSzynyKonca =
    snapshot?.buses.find((b) => b.ref_id === kontekst.endpointBusRef || b.id === kontekst.endpointBusRef)?.name
    ?? '—';
  const nazwaOdcinka =
    snapshot?.branches.find((b) => b.ref_id === kontekst.segmentId || b.id === kontekst.segmentId)?.name ?? '—';
  const konfiguracjaNnLabel =
    T.konfiguracjaNnOpcje.find((o) => o.id === dane.nn_configuration)?.etykieta ?? dane.nn_configuration;
  const nnVoltageLabel = isZrodlo
    ? konwerter
      ? fmtKv(konwerter.un_kv)
      : T.wymNnOczekuje
    : fmtKv(dane.nn_voltage_kv);
  const liczbaOdplywowLabel = ogranicznikOdplywow(dane.outgoing_feeders_nn_count) ?? '—';
  const nnBlokKompletny = !isZrodlo || Boolean(konwerter);
  const protekcja = zabezpieczenieZrodla(dane);

  // Panel kontroli neutralny (kontrakt prowadzenia): „do wyboru” w trakcie pracy, czerwień
  // wyłącznie dla konfliktu (te same `konflikty`, co błędy przy polach).
  const konfliktZ = (test: (pole: string) => boolean) => konflikty.some((b) => test(b.field));
  const wierszeGotowosci: WierszGotowosci[] = [
    { etykieta: T.wierszTyp, stan: 'ustalone', wartosc: typLabel },
    {
      etykieta: T.wierszUmiejscowienie,
      stan: kontekstOk ? 'ustalone' : 'do_wyboru',
      wartosc: kontekstOk ? umiejscowienieLabel : '',
    },
    {
      etykieta: T.wierszTransformator,
      stan: konfliktZ((p) => p === 'nn_voltage_kv' || p.startsWith('transformer_'))
        ? 'konflikt'
        : dane.catalog_ref
          ? 'ustalone'
          : 'do_wyboru',
      wartosc: dane.catalog_ref ? fmtMva(params?.rated_power_mva) : '',
    },
    {
      etykieta: T.wierszRozdzielnica,
      stan: konfliktZ((p) => p.startsWith('pole:'))
        ? 'konflikt'
        : rozdzielnicaKompletna && aparaturaKompletna
          ? 'ustalone'
          : 'do_wyboru',
      wartosc:
        rozdzielnicaKompletna && aparaturaKompletna
          ? `${snFields.length} pól · ${selectedManufacturer?.name ?? ''}`
          : '',
    },
    // Pole transformatorowe w panelu kontroli — widoczne z KAŻDEGO kroku (POLA-W-TORZE).
    {
      etykieta: T.wierszPoleTr,
      stan: brakPolaTransformatorowego ? 'do_wyboru' : 'ustalone',
      wartosc: brakPolaTransformatorowego ? T.wierszPoleTrBrak : T.wierszPoleTrJest,
    },
    {
      etykieta: T.wierszNn,
      stan: konfliktZ((p) => p === 'outgoing_feeders_nn_count' || p.startsWith('station_auxiliary'))
        ? 'konflikt'
        : nnBlokKompletny && dane.outgoing_feeders_nn_count !== null
          ? 'ustalone'
          : 'do_wyboru',
      wartosc: isZrodlo
        ? `${konfiguracjaNnLabel} · ${nnVoltageLabel}`
        : `${nnVoltageLabel} · ${liczbaOdplywowLabel} odpł.`,
    },
  ];

  const aside = (
    <>
      <KreatorGotowosc tytul={T.kontrolaTytul} wiersze={wierszeGotowosci} testid="mvd-kreator-stacja-gotowosc" />
      <KreatorNastepnyKrok eyebrow={T.downstreamTytul} opis={T.downstreamOpis} />
    </>
  );

  const krokIndex = KROKI.findIndex((k) => k.id === krok);
  const brakSzablonowKomunikat =
    !bladRozdzielnicy && Boolean(dane.manufacturer_ref) && szablonyWyboru.length === 0
      ? T.brakSzablonow
      : null;

  return (
    <KreatorRama
      eyebrow={T.eyebrow}
      tytul={T.eyebrow}
      cel={T.cel}
      odznaka={T.odznaka}
      kroki={KROKI}
      krokAktywny={krok}
      onKrok={setKrok}
      pelny
      aside={aside}
      bladGlobalny={bladGlobalny}
      {...prowadzenie.propsRamy}
      akcjaGlowna={{
        etykieta: T.zapisz,
        onClick: onZapisz,
        // Wyszarzenie WYŁĄCZNIE na czas trwającego zapisu (zamknięta lista ramy); brak danych
        // wskazuje kreator przy kliknięciu.
        blokada: zapisWToku ? 'zapis_w_toku' : null,
        testid: 'mvd-kreator-stacja-zapisz',
      }}
      akcjaAnuluj={{ etykieta: T.anuluj, onClick: () => closeForm(), testid: 'mvd-kreator-stacja-anuluj' }}
      krokWstecz={
        krokIndex > 0
          ? { etykieta: T.wstecz, onClick: () => setKrok(KROKI[krokIndex - 1].id), testid: 'mvd-kreator-stacja-wstecz' }
          : undefined
      }
      krokDalej={
        krokIndex < KROKI.length - 1
          ? { etykieta: T.dalej, onClick: () => setKrok(KROKI[krokIndex + 1].id), testid: 'mvd-kreator-stacja-dalej' }
          : undefined
      }
      licznikKrokow={T.licznik(krokIndex + 1, KROKI.length)}
      testid="mvd-kreator-stacja"
    >
      {krok === 'szablon' ? (
        <KreatorSekcja tytul={T.krokSzablon} testid="mvd-kreator-stacja-szablon">
          <KreatorInfo>{T.szablonOpis}</KreatorInfo>
          <KreatorSiatka kolumny={2}>
            <PoleWyboru
              etykieta={T.szablonKategoria}
              wartosc={kategoriaSzablonu}
              onZmiana={(v) => {
                setKategoriaSzablonu(v);
                setWybranySzablonId('');
              }}
              opcje={KATEGORIE_SZABLONOW.filter((id) => nazwyKategorii[id]).map((id) => ({
                id,
                etykieta: nazwyKategorii[id],
              }))}
              pomoc={T.szablonKategoriaPomoc}
              testid="mvd-kreator-stacja-szablon-kategoria"
            />
            <PoleWyboru
              etykieta={T.szablonWybor}
              wartosc={wybranySzablonId}
              onZmiana={setWybranySzablonId}
              opcje={[
                { id: '', etykieta: T.szablonWyborPlaceholder },
                ...szablonyStacji.map((s) => ({
                  id: s.id,
                  etykieta: T.szablonEtykietaWbudowany(s.name_pl),
                })),
                // B-8: zapisane przez użytkownika — na tej samej liście, ale ze
                // ZRÓDŁEM w etykiecie (projektant musi wiedzieć, skąd szablon).
                ...szablonyWlasne.map((s) => ({
                  id: s.id,
                  etykieta: T.szablonEtykietaWlasny(s.name_pl),
                })),
              ]}
              pomoc={T.szablonWyborPomoc}
              testid="mvd-kreator-stacja-szablon-wybor"
            />
          </KreatorSiatka>

          {bladSzablonow ? (
            <KreatorInfo testid="mvd-kreator-stacja-szablon-blad">{bladSzablonow}</KreatorInfo>
          ) : null}
          {!bladSzablonow && szablonyStan === 'laduje' ? (
            <KreatorInfo testid="mvd-kreator-stacja-szablon-laduje">{T.szablonLaduje}</KreatorInfo>
          ) : null}
          {!bladSzablonow && szablonyStan === 'gotowe' && szablonyStacji.length === 0 ? (
            <KreatorInfo testid="mvd-kreator-stacja-szablon-pusty">{T.szablonPusty}</KreatorInfo>
          ) : null}

          <div className="mvd-kreator-stopka-nawigacja">
            <button
              type="button"
              className="mvd-kreator-btn mvd-kreator-btn--glowna"
              onClick={() => void zastosujSzablon()}
              data-testid="mvd-kreator-stacja-szablon-zastosuj"
            >
              {T.szablonZastosuj}
            </button>
            <button
              type="button"
              className="mvd-kreator-btn"
              onClick={pracujOdZera}
              data-testid="mvd-kreator-stacja-szablon-od-zera"
            >
              {T.szablonWyczysc}
            </button>
          </div>

          <KreatorSiatka kolumny={2}>
            <RzadWartosci
              etykieta={T.szablonWybrany}
              wartosc={dane.template_name || T.szablonBrakWyboru}
            />
            <RzadWartosci etykieta={T.szablonLiczbaPol} wartosc={String(dane.pola.length)} />
            <RzadWartosci
              etykieta={T.szablonTransformator}
              wartosc={typy.find((t) => t.id === dane.catalog_ref)?.name ?? '—'}
            />
            <RzadWartosci etykieta={T.szablonOdplywy} wartosc={String(liczbaOdplywowLabel)} />
          </KreatorSiatka>
          {dane.template_id ? (
            <KreatorInfo testid="mvd-kreator-stacja-szablon-zastosowany">
              {T.szablonZastosowany}
            </KreatorInfo>
          ) : null}
          {szablonZastosowany?.description_pl ? (
            <KreatorInfo>{szablonZastosowany.description_pl}</KreatorInfo>
          ) : null}
        </KreatorSekcja>
      ) : null}

      {krok === 'rodzaj' ? (
        <KreatorSekcja tytul={T.krokRodzaj} testid="mvd-kreator-stacja-rodzaj">
          <PoleWyboru
            etykieta={T.typStacji}
            wartosc={dane.station_type}
            onZmiana={(v) => zmien('station_type', v as TypStacji)}
            opcje={T.typStacjiOpcje}
            pomoc={T.typStacjiPomoc}
            testid="mvd-kreator-stacja-typ"
          />
          <PoleTekstowe
            etykieta={T.nazwa}
            wartosc={dane.station_name}
            onZmiana={(v) => zmien('station_name', v)}
            placeholder={T.nazwaPlaceholder}
            pomoc={T.nazwaPomoc}
            testid="mvd-kreator-stacja-nazwa"
          />
          <KreatorSiatka kolumny={2}>
            <PoleTekstowe
              etykieta={T.oznaczenie}
              wartosc={dane.designation}
              onZmiana={(v) => zmien('designation', v)}
              placeholder={T.oznaczeniePlaceholder}
              pomoc={T.oznaczeniePomoc}
              testid="mvd-kreator-stacja-oznaczenie"
            />
            <PoleWyboru
              etykieta={T.konstrukcja}
              wartosc={dane.construction_type}
              onZmiana={(v) => zmien('construction_type', v as TypKonstrukcji | '')}
              opcje={T.konstrukcjaOpcje}
              pomoc={T.konstrukcjaPomoc}
              testid="mvd-kreator-stacja-konstrukcja"
            />
          </KreatorSiatka>

          {kontekstOk ? (
            <KreatorSekcja tytul={T.umiejscowienieTytul} testid="mvd-kreator-stacja-umiejscowienie">
              <KreatorInfo>{koniec ? T.umiejscowienieKoniecOpis : T.umiejscowieniePodzialOpis}</KreatorInfo>
              <KreatorSiatka kolumny={2}>
                <RzadWartosci etykieta={T.podsumUmiejscowienie} wartosc={umiejscowienieLabel} />
                {koniec ? (
                  <RzadWartosci etykieta={T.umiejscowienieTerminal} wartosc={nazwaSzynyKonca} />
                ) : (
                  <>
                    <RzadWartosci etykieta={T.umiejscowienieSegment} wartosc={nazwaOdcinka} />
                    <RzadWartosci etykieta={T.umiejscowieniePozycja} wartosc={fmtRatio(kontekst.positionOnSegment)} />
                  </>
                )}
                <RzadWartosci etykieta={T.snVoltageOdczyt} wartosc={fmtKv(kontekst.snVoltageKv)} />
              </KreatorSiatka>
            </KreatorSekcja>
          ) : (
            <KreatorSekcja tytul={T.umiejscowienieBrakTytul} testid="mvd-kreator-stacja-brak">
              <KreatorInfo>{T.umiejscowienieBrakOpis}</KreatorInfo>
            </KreatorSekcja>
          )}

          <PanelTeorii
            tytul={T.teoriaRodzajTytul}
            opis={T.teoriaRodzajOpis}
            wymog={T.teoriaRodzajWymog}
            podstawa={T.teoriaRodzajPodstawa}
            testid="mvd-kreator-stacja-teoria-rodzaj"
          />
        </KreatorSekcja>
      ) : null}

      {krok === 'transformator' ? (
        <KreatorSekcja tytul={T.krokTransformator} testid="mvd-kreator-stacja-transformator">
          <PoleWyboru
            etykieta={T.konfiguracjaNn}
            wartosc={dane.nn_configuration}
            onZmiana={(v) => zmien('nn_configuration', v as NnConfiguration)}
            opcje={T.konfiguracjaNnOpcje}
            pomoc={T.konfiguracjaNnPomoc}
            testid="mvd-kreator-stacja-konfiguracja-nn"
          />
          <KreatorSiatka kolumny={2}>
            {isZrodlo ? (
              <RzadWartosci etykieta={T.wymNnOdczyt} wartosc={nnVoltageLabel} />
            ) : (
              <PoleWyboru
                etykieta={isCustomNn ? T.nnVoltageCustom : T.nnVoltage}
                wartosc={dane.nn_voltage_kv === null ? '' : String(dane.nn_voltage_kv)}
                onZmiana={(v) => zmien('nn_voltage_kv', v === '' ? null : Number(v))}
                opcje={[{ id: '', etykieta: T.wybierz }, ...(isCustomNn ? T.nnVoltageCustomOpcje : T.nnVoltageOpcje)]}
                wymagane
                pomoc={isCustomNn ? T.nnVoltageCustomPomoc : T.nnVoltagePomoc}
                blad={bladDlaPola('nn_voltage_kv')}
                testid="mvd-kreator-stacja-nn"
              />
            )}
            <RzadWartosci etykieta={T.snVoltageOdczyt} wartosc={fmtKv(kontekst.snVoltageKv)} />
          </KreatorSiatka>
          {isZrodlo && zrodloTeksty ? (
            <>
              <PoleKatalogu
                etykieta={zrodloTeksty.falownik}
                wartosc={dane.source_converter_ref}
                onZmiana={(v) => zmien('source_converter_ref', v)}
                opcje={falowniki.map((c) => ({
                  id: c.id,
                  etykieta: `${c.name} · ${fmtMva(c.sn_mva)} · ${fmtKv(c.un_kv)}`,
                }))}
                status={bladKatalogu ? 'error' : 'ready'}
                placeholder={T.falownikPlaceholder}
                pomoc={T.falownikPomoc}
                komunikatBledu={bladKatalogu ?? T.falownikBlad}
                blad={bladDlaPola('source_converter_ref')}
                wymagane
                testid="mvd-kreator-stacja-falownik"
              />
              {brakFalownikowKomunikat ? (
                <KreatorInfo testid="mvd-kreator-stacja-brak-falownikow">{brakFalownikowKomunikat}</KreatorInfo>
              ) : null}
            </>
          ) : null}
          <PoleKatalogu
            etykieta={T.typKatalog}
            wartosc={dane.catalog_ref}
            onZmiana={(v) => zmien('catalog_ref', v)}
            opcje={opcjeTypow}
            status={bladKatalogu ? 'error' : 'ready'}
            placeholder={T.typKatalogPlaceholder}
            pomoc={T.typKatalogPomoc}
            komunikatBledu={bladKatalogu ?? T.typBlad}
            wymagane
            testid="mvd-kreator-stacja-katalog"
          />
          {brakDoboruKomunikat ? (
            <KreatorInfo testid="mvd-kreator-stacja-brak-doboru">{brakDoboruKomunikat}</KreatorInfo>
          ) : null}
          {params ? (
            <KreatorSiatka kolumny={2}>
              <RzadWartosci etykieta={T.paramMoc} wartosc={fmtMva(params.rated_power_mva)} />
              <RzadWartosci
                etykieta={T.paramNapiecia}
                wartosc={`${fmtKv(params.voltage_hv_kv)} / ${fmtKv(params.voltage_lv_kv)}`}
              />
              <RzadWartosci etykieta={T.paramUk} wartosc={fmtPct(params.uk_percent)} />
            </KreatorSiatka>
          ) : null}
          <PoleLiczbowe
            etykieta={T.liczbaTransformatorow}
            wartosc={dane.transformer_units}
            onZmiana={(v) => zmien('transformer_units', v ?? 1)}
            krok={1}
            min={1}
            max={4}
            pomoc={T.liczbaTransformatorowPomoc}
            testid="mvd-kreator-stacja-liczba-trafo"
          />
          {/* B-2: zaczepy transformatora — ta sama operacja stacyjna, ten sam
              kontrakt domenowy co transformator GPZ (zero pól równoległych). */}
          <KreatorSekcja tytul={T.zaczepyTytul} testid="mvd-kreator-stacja-zaczepy">
            <KreatorInfo>{T.zaczepyOpis}</KreatorInfo>
            <PoleWyboru
              etykieta={T.zaczepyRodzaj}
              wartosc={dane.transformer_regulation_type}
              onZmiana={(v) =>
                zmien('transformer_regulation_type', v as StacjaFormData['transformer_regulation_type'])
              }
              opcje={T.zaczepyRodzajOpcje}
              pomoc={T.zaczepyRodzajPomoc}
              testid="mvd-kreator-stacja-zaczepy-rodzaj"
            />
            {dane.transformer_regulation_type !== 'NONE' ? (
              <>
                <PoleWyboru
                  etykieta={T.zaczepyUzwojenie}
                  wartosc={dane.transformer_regulated_winding ?? ''}
                  onZmiana={(v) =>
                    zmien(
                      'transformer_regulated_winding',
                      (v || null) as StacjaFormData['transformer_regulated_winding'],
                    )
                  }
                  opcje={[{ id: '', etykieta: T.wybierz }, ...T.zaczepyUzwojenieOpcje]}
                  wymagane
                  pomoc={T.zaczepyUzwojeniePomoc}
                  testid="mvd-kreator-stacja-zaczepy-uzwojenie"
                />
                <KreatorSiatka kolumny={2}>
                  <PoleLiczbowe
                    etykieta={T.zaczepyPozycjaMin}
                    wartosc={dane.transformer_tap_min_position}
                    onZmiana={(v) => zmien('transformer_tap_min_position', v)}
                    krok={1}
                    wymagane
                    blad={bladDlaPola('transformer_tap_min_position')}
                    testid="mvd-kreator-stacja-zaczepy-min"
                  />
                  <PoleLiczbowe
                    etykieta={T.zaczepyPozycjaMax}
                    wartosc={dane.transformer_tap_max_position}
                    onZmiana={(v) => zmien('transformer_tap_max_position', v)}
                    krok={1}
                    wymagane
                    blad={bladDlaPola('transformer_tap_max_position')}
                    testid="mvd-kreator-stacja-zaczepy-max"
                  />
                  <PoleLiczbowe
                    etykieta={T.zaczepyPozycjaNeutralna}
                    wartosc={dane.transformer_tap_neutral_position}
                    onZmiana={(v) => zmien('transformer_tap_neutral_position', v)}
                    krok={1}
                    wymagane
                    blad={bladDlaPola('transformer_tap_neutral_position')}
                    testid="mvd-kreator-stacja-zaczepy-neutralna"
                  />
                  <PoleLiczbowe
                    etykieta={T.zaczepyPozycjaBiezaca}
                    wartosc={dane.transformer_tap_current_position}
                    onZmiana={(v) => zmien('transformer_tap_current_position', v)}
                    krok={1}
                    wymagane
                    blad={bladDlaPola('transformer_tap_current_position')}
                    testid="mvd-kreator-stacja-zaczepy-biezaca"
                  />
                </KreatorSiatka>
                <PoleLiczbowe
                  etykieta={T.zaczepyKrok}
                  wartosc={dane.transformer_tap_step_percent}
                  onZmiana={(v) => zmien('transformer_tap_step_percent', v)}
                  krok={0.25}
                  min={0}
                  wymagane
                  blad={bladDlaPola('transformer_tap_step_percent')}
                  pomoc={T.zaczepyKrokPomoc}
                  testid="mvd-kreator-stacja-zaczepy-krok"
                />
                {dane.transformer_tap_min_position !== null
                && dane.transformer_tap_max_position !== null
                && dane.transformer_tap_step_percent !== null ? (
                  <RzadWartosci
                    etykieta={T.zaczepyTytul}
                    wartosc={T.zaczepyZakres(
                      dane.transformer_tap_min_position,
                      dane.transformer_tap_max_position,
                      dane.transformer_tap_step_percent,
                    )}
                  />
                ) : null}
              </>
            ) : null}
          </KreatorSekcja>
          <PanelTeorii
            tytul={T.teoriaTrafoTytul}
            opis={T.teoriaTrafoOpis}
            wymog={T.teoriaTrafoWymog}
            podstawa={T.teoriaTrafoPodstawa}
            testid="mvd-kreator-stacja-teoria-trafo"
          />
        </KreatorSekcja>
      ) : null}

      {krok === 'pola' ? (
        <KreatorSekcja tytul={T.krokPola} testid="mvd-kreator-stacja-pola">
          <KreatorInfo>{T.polaOpis}</KreatorInfo>
          <KreatorSiatka kolumny={2}>
            <PoleKatalogu
              etykieta={T.producent}
              wartosc={dane.manufacturer_ref || null}
              onZmiana={(v) => zmien('manufacturer_ref', v ?? '')}
              opcje={producenciDobrani.map((m) => ({ id: m.manufacturer_ref, etykieta: m.name }))}
              status={bladRozdzielnicy ? 'error' : 'ready'}
              placeholder={T.producentPlaceholder}
              pomoc={T.producentPomoc}
              komunikatBledu={bladRozdzielnicy ?? T.rozdzielnicaBlad}
              wymagane
              testid="mvd-kreator-stacja-producent"
            />
            <PoleWyboru
              etykieta={T.rodzina}
              wartosc={dane.switchgear_family_ref ?? ''}
              onZmiana={(v) => zmien('switchgear_family_ref', v || null)}
              opcje={[
                { id: '', etykieta: T.rodzinaPlaceholder },
                ...ofertaRodzin.map((pozycja) => ({
                  id: pozycja.rodzina.switchgear_family_ref,
                  etykieta: etykietaOfertyRodziny(pozycja),
                  // Widoczna, ale niewybieralna: katalog nie pozwala na niej
                  // budować, a powód stoi w etykiecie.
                  wylaczona: pozycja.powod !== null,
                })),
              ]}
              pomoc={T.rodzinaPomoc}
              wylaczone={!dane.manufacturer_ref}
              wymagane
              testid="mvd-kreator-stacja-rodzina"
            />
          </KreatorSiatka>

          {/* NAGŁÓWEK WYBRANEJ RODZINY (kanon §3) — klasy znamionowe, technologia
              i TOR KONFIGURACJI. Wyłącznie readout katalogu: brak danej pokazujemy
              jako brak, bo zmyślony milimetr czy amper wchodzi do dokumentacji. */}
          {selectedFamily ? (
            <KreatorSekcja
              tytul={T.naglowekRodzinyTytul}
              testid="mvd-kreator-stacja-naglowek-rodziny"
            >
              <dl className="mvd-kreator-naglowek-rodziny">
                {wierszeNaglowkaRodziny.map((wiersz) => (
                  <Fragment key={wiersz.etykieta}>
                    <dt>{wiersz.etykieta}</dt>
                    <dd data-brak={wiersz.wartosc === null ? 'tak' : 'nie'}>
                      {wiersz.wartosc ?? T.naglowekBrakDanej}
                    </dd>
                  </Fragment>
                ))}
              </dl>
            </KreatorSekcja>
          ) : null}

          {/* Rodzina bez zadeklarowanej konstrukcji — katalog nie wyznacza toru
              pracy, a kreator go nie zgaduje (kanon §3: jawny brak, nigdy tor
              domyślny). */}
          {selectedFamily && torKonfiguracji === null ? (
            <KreatorSekcja tytul={T.torBrakTytul} testid="mvd-kreator-stacja-tor-brak">
              <KreatorInfo>{T.torBrakOpis}</KreatorInfo>
            </KreatorSekcja>
          ) : null}

          {/* TOR MODUŁOWY — rozdzielnica składana z katalogowych pól rodziny. */}
          {torKonfiguracji === 'MODULARNY' ? (
            <KreatorSekcja tytul={T.torModularnyTytul} testid="mvd-kreator-stacja-tor-modularny">
              <KreatorInfo>{T.torModularnyOpis}</KreatorInfo>
            </KreatorSekcja>
          ) : null}

          {/* TOR BLOKOWY (RMU) — najpierw BLOK fabryczny, potem doposażenie
              jednostek. Sekwencja jednostek jest cechą wyrobu, więc pól nie da
              się tu dostawiać ani usuwać. */}
          {torKonfiguracji === 'BLOK_RMU' ? (
            <KreatorSekcja tytul={T.torBlokTytul} testid="mvd-kreator-stacja-tor-blok">
              <KreatorInfo>{T.torBlokOpis}</KreatorInfo>

              {bladBlokow ? (
                <KreatorInfo testid="mvd-kreator-stacja-blok-blad">{bladBlokow}</KreatorInfo>
              ) : null}

              {/* UCZCIWY STAN ZEROWY: rodzina RMU bez transkrybowanych bloków.
                  Rozróżniamy „katalog ich nie ma" od „jeszcze się nie pobrały". */}
              {!bladBlokow && blokiStan === 'gotowe' && bloki.length === 0 ? (
                <KreatorSekcja tytul={T.blokBrakTytul} testid="mvd-kreator-stacja-blok-brak">
                  <KreatorInfo>{T.blokBrakOpis}</KreatorInfo>
                </KreatorSekcja>
              ) : null}

              {bloki.length > 0 ? (
                <PoleKatalogu
                  etykieta={T.blokWybor}
                  wartosc={dane.factory_configuration_ref}
                  onZmiana={(v) => zmien('factory_configuration_ref', v)}
                  opcje={bloki.map((blok) => ({
                    id: blok.configuration_ref,
                    etykieta: `${blok.code} · ${blok.name_pl} · ${blok.unit_sequence}`,
                  }))}
                  status={blokiStan === 'laduje' ? 'loading' : 'ready'}
                  placeholder={T.blokPlaceholder}
                  pomoc={T.blokPomoc}
                  wymagane
                  testid="mvd-kreator-stacja-blok"
                />
              ) : null}

              {wybranyBlok ? (
                <>
                  <RzadWartosci
                    etykieta={T.blokSekwencja}
                    wartosc={wybranyBlok.unit_sequence}
                    testid="mvd-kreator-stacja-blok-sekwencja"
                  />
                  <RzadWartosci
                    etykieta={T.blokSzerokosc}
                    wartosc={szerokoscBlokuPl(wybranyBlok) ?? T.naglowekBrakDanej}
                    testid="mvd-kreator-stacja-blok-szerokosc"
                  />
                  <div className="mvd-pole-etykieta">{T.blokJednostkiTytul}</div>
                  <ul className="mvd-kreator-jednostki-bloku">
                    {jednostkiBloku.map((wpis) => (
                      <li
                        key={`${wpis.pozycja}-${wpis.jednostka.unit_code}`}
                        data-testid={`mvd-kreator-stacja-blok-jednostka-${wpis.pozycja}`}
                      >
                        <span className="mvd-kreator-kod-jednostki">
                          {T.blokJednostka(wpis.pozycja, wpis.jednostka.unit_code)}
                        </span>
                        <span className="mvd-kreator-nazwa-aparatu">
                          {`${wpis.jednostka.unit_name_pl} · ${aparaturaJednostkiPl(wpis.jednostka)}`}
                        </span>
                        {wpis.rola === null ? (
                          <span
                            className="mvd-kreator-podpowiedz"
                            data-testid={`mvd-kreator-stacja-blok-jednostka-bez-roli-${wpis.pozycja}`}
                          >
                            {T.jednostkaBezRoli}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </>
              ) : bloki.length > 0 ? (
                <KreatorInfo testid="mvd-kreator-stacja-blok-niewybrany">
                  {T.blokNiewybrany}
                </KreatorInfo>
              ) : null}
            </KreatorSekcja>
          ) : null}

          {dane.manufacturer_ref && rodzinyDobrane.length === 0 ? (
            <KreatorInfo testid="mvd-kreator-stacja-brak-rodzin">{T.brakRodzin}</KreatorInfo>
          ) : null}
          {brakSzablonowKomunikat ? (
            <KreatorInfo testid="mvd-kreator-stacja-brak-szablonow">{brakSzablonowKomunikat}</KreatorInfo>
          ) : null}
          {!bladAparatow && aparatyZdatne.length === 0 ? (
            <KreatorInfo testid="mvd-kreator-stacja-brak-aparatow">{T.brakAparatow}</KreatorInfo>
          ) : null}

          {brakPolaTransformatorowego ? (
            <KreatorSekcja
              tytul={T.polaBrakTrTytul}
              testid="mvd-kreator-stacja-brak-pola-tr"
            >
              <KreatorInfo>{T.polaBrakTrOpis}</KreatorInfo>
              {/* Przywrócenie pola TR dokłada pole do listy — w torze blokowym
                  byłoby to dostawienie jednostki do bloku fabrycznego, czyli opis
                  wyrobu, którego producent nie robi. Tam drogą jest wybór bloku
                  z jednostką transformatorową (np. L-L-T), więc przycisku nie ma. */}
              {torKonfiguracji === 'BLOK_RMU' ? null : (
                <button
                  type="button"
                  className="mvd-kreator-btn mvd-kreator-btn--glowna"
                  onClick={() => dodajPoleToru('TRANSFORMATOROWE')}
                  data-testid="mvd-kreator-stacja-przywroc-pole-tr"
                >
                  {T.polaPrzywrocTr}
                </button>
              )}
            </KreatorSekcja>
          ) : null}

          {brakPolLiniowychToru.length > 0 ? (
            <KreatorSekcja tytul={T.polaToruBrakTytul} testid="mvd-kreator-stacja-brak-pol-toru">
              <KreatorInfo>
                {T.polaToruBrakOpis(
                  brakPolLiniowychToru.map((rola) => fieldRoleLabelPl(rola)).join(', '),
                  czyKoniecOdcinka(kontekst),
                )}
              </KreatorInfo>
              {/* W torze blokowym jednostek nie dokłada się ręcznie (patrz pole TR wyżej). */}
              {torKonfiguracji === 'BLOK_RMU'
                ? null
                : brakPolLiniowychToru.map((rola) => (
                    <button
                      key={rola}
                      type="button"
                      className="mvd-kreator-btn mvd-kreator-btn--glowna"
                      onClick={() => dodajPoleToru(rola)}
                      data-testid={`mvd-kreator-stacja-dodaj-pole-toru-${rola}`}
                    >
                      {T.polaDodajPoleToru(fieldRoleLabelPl(rola))}
                    </button>
                  ))}
            </KreatorSekcja>
          ) : null}

          {/* Pusta lista pól znaczy co innego w każdym torze: w modułowym „dodaj
              pole", w blokowym „wskaż blok" (jednostek nie dodaje się ręcznie).
              Jeden komunikat na oba tory kazałby projektantowi RMU szukać
              przycisku, którego świadomie nie ma. */}
          {dane.pola.length === 0 ? (
            <KreatorInfo testid="mvd-kreator-stacja-pola-puste">
              {selectedFamily === null
                ? T.rodzinaNiewybrana
                : torKonfiguracji === 'BLOK_RMU'
                  ? T.blokNiewybrany
                  : T.polaPuste}
            </KreatorInfo>
          ) : (
            dane.pola.map((pole, index) => (
              <KreatorSekcja
                key={pole.id}
                tytul={`${index + 1}. ${fieldRoleLabelPl(pole.field_role)}`}
                testid={`mvd-kreator-stacja-pole-wiersz-${index + 1}`}
              >
                <KreatorSiatka kolumny={3}>
                  {/* Rola pola w torze blokowym jest cechą JEDNOSTKI WYROBU (blok
                      L-L-T ma dwie jednostki liniowe i transformatorową), więc
                      pochodzi z bloku i jest readoutem — zmiana roli oznaczałaby
                      inny blok, wybierany wyżej. */}
                  {torKonfiguracji === 'BLOK_RMU' ? (
                    <RzadWartosci
                      etykieta={T.polaRola}
                      wartosc={fieldRoleLabelPl(pole.field_role)}
                      testid={`mvd-kreator-stacja-pole-rola-${index + 1}`}
                    />
                  ) : (
                    <PoleWyboru
                      etykieta={T.polaRola}
                      wartosc={pole.field_role}
                      onZmiana={(v) => zmienPole(pole.id, { field_role: v as SnFieldRole })}
                      opcje={ROLE_POL.map((rola) => ({
                        id: rola,
                        etykieta: fieldRoleLabelPl(rola),
                      }))}
                      testid={`mvd-kreator-stacja-pole-rola-${index + 1}`}
                    />
                  )}
                  <PoleKatalogu
                    etykieta={T.polaSzablon}
                    wartosc={pole.bay_template_ref}
                    onZmiana={(v) => zmienPole(pole.id, { bay_template_ref: v })}
                    opcje={opcjeSzablonowRoli(szablonyWyboru, pole.field_role).map((t) => ({
                      id: t.template_ref,
                      etykieta: etykietaKartyPola(t, pole.field_role),
                    }))}
                    wymagane
                    blad={bladDlaPola(`pole:${pole.id}:szablon`)}
                    status={bladRozdzielnicy ? 'error' : 'ready'}
                    placeholder={T.polePlaceholder}
                    pomoc={T.poleRoliPomoc}
                    komunikatBledu={bladRozdzielnicy ?? T.rozdzielnicaBlad}
                    testid={`mvd-kreator-stacja-pole-szablon-${index + 1}`}
                  />
                  <PoleKatalogu
                    etykieta={T.aparatPola}
                    wartosc={pole.apparatus_catalog_ref}
                    onZmiana={(v) => zmienPole(pole.id, { apparatus_catalog_ref: v })}
                    opcje={aparatyDlaRoli(pole.field_role).map((a) => ({
                      id: a.id,
                      etykieta: `${a.name} · ${etykietaRodzajuAparatu(a.device_kind)} · ${fmtKv(a.u_n_kv)} · ${a.i_n_a} A`,
                    }))}
                    status={bladAparatow ? 'error' : 'ready'}
                    placeholder={T.aparatPolaPlaceholder}
                    pomoc={`${T.aparatPolaPomoc} ${T.aparatPolaWarianty(wariantyAparatuRoli(pole.field_role))}`}
                    komunikatBledu={bladAparatow ?? T.aparatBlad}
                    wymagane
                    blad={bladDlaPola(`pole:${pole.id}:aparat`)}
                    testid={`mvd-kreator-stacja-aparat-${index + 1}`}
                  />
                </KreatorSiatka>
                {!bladAparatow && aparatyZdatne.length > 0 && aparatyDlaRoli(pole.field_role).length === 0 ? (
                  <KreatorInfo testid={`mvd-kreator-stacja-brak-aparatow-roli-${index + 1}`}>
                    {T.brakAparatowRoli}
                  </KreatorInfo>
                ) : null}

                {/* SKŁAD KATALOGOWEGO POLA — pełne wyposażenie z karty rodziny
                    (oznaczenia operatorskie, status FABRYCZNY/OPCJA). To właśnie
                    ta różnica odróżnia pola między sobą: pole switch-fuse RMU i
                    pole wyłącznikowe z przekładnikami nie są tym samym polem
                    o innym podpisie. */}
                <KartaWyposazeniaPola
                  pozycje={wyposazenieSzablonu(szablonPolaWpisu(pole))}
                  szablonWskazany={Boolean(pole.bay_template_ref)}
                  kluczeOperacji={KLUCZE_OPERACJI_STACYJNEJ}
                  wyposazenie={dane.wyposazenie[pole.id]}
                  ctTypy={ctTypy}
                  vtTypy={vtTypy}
                  przekazniki={przekazniki}
                  onZmianaWyposazenia={(zmiana) => zmienWyposazenie(pole.id, zmiana)}
                  testid={`mvd-kreator-stacja-wyposazenie-${index + 1}`}
                />

                {/* Jednostki bloku fabrycznego są STAŁE — usunięcie jednostki
                    opisywałoby wyrób, którego producent nie robi. */}
                {torKonfiguracji === 'BLOK_RMU' ? null : (
                  <button
                    type="button"
                    className="mvd-kreator-btn"
                    onClick={() => usunPole(pole.id)}
                    data-testid={`mvd-kreator-stacja-pole-usun-${index + 1}`}
                  >
                    {T.polaUsun}
                  </button>
                )}
              </KreatorSekcja>
            ))
          )}

          <div className="mvd-kreator-stopka-nawigacja">
            {torKonfiguracji === 'BLOK_RMU' ? null : (
              <button
                type="button"
                className="mvd-kreator-btn mvd-kreator-btn--glowna"
                onClick={dodajPole}
                data-testid="mvd-kreator-stacja-pole-dodaj"
              >
                {T.polaDodaj}
              </button>
            )}
            <span className="mvd-kreator-stopka-licznik">{T.polaLicznik(dane.pola.length)}</span>
          </div>

          <div>
            <div className="mvd-pole-etykieta">{T.podgladTytul}</div>
            {/* SLD-GEN-POLA: podgląd rysuje KOMPOZYCJĘ APARATÓW pola z kart
                katalogowych (`szablonyPol` — te same, z których dobrane są pola
                stacji), rodzaj aparatu głównego z pozycji katalogu APARAT_SN
                wskazanej w polu, opis transformatora z pozycji TRAFO_SN_NN, a
                nagłówek pakietu z rodziny rozdzielnicy. Werdykt konfiguracji
                pochodzi z walidatora backendu (`dry_run` tej samej operacji,
                która wykona zapis) — UI go nie liczy, tylko pokazuje. */}
            <PodgladRozdzielnicySn
              snFields={snFields}
              aparaty={aparaty}
              transformatory={typy}
              transformatorRef={dane.catalog_ref}
              snVoltageKv={kontekst.snVoltageKv}
              szablonyPol={szablony}
              rodzina={selectedFamily}
              producent={selectedManufacturer?.name ?? null}
              statusKonfiguracji={statusKonfiguracji}
              komunikatStatusu={bladPodgladu}
              testid="mvd-kreator-stacja-podglad"
            />
          </div>

          <PanelTeorii
            tytul={T.teoriaRozdzielnicaTytul}
            opis={T.teoriaRozdzielnicaOpis}
            wymog={T.teoriaRozdzielnicaWymog}
            podstawa={T.teoriaRozdzielnicaPodstawa}
            testid="mvd-kreator-stacja-teoria-rozdzielnica"
          />
        </KreatorSekcja>
      ) : null}

      {krok === 'pomiar' ? (
        <KreatorSekcja tytul={T.krokPomiar} testid="mvd-kreator-stacja-pomiar">
          <KreatorInfo>{T.pomiarOpis}</KreatorInfo>
          {bladPomiaru ? (
            <KreatorInfo testid="mvd-kreator-stacja-pomiar-blad">{bladPomiaru}</KreatorInfo>
          ) : null}
          {dane.pola.length === 0 ? (
            <KreatorInfo testid="mvd-kreator-stacja-pomiar-brak">{T.pomiarBrak}</KreatorInfo>
          ) : (
            dane.pola.map((pole, index) => {
              const wpis = dane.wyposazenie[pole.id];
              const kody = kodyZabezpieczen[ROLA_POLA_NA_BAY_ROLE[pole.field_role]] ?? [];
              const ct = wpis?.ct_catalog_ref
                ? ctTypy.find((t) => t.id === wpis.ct_catalog_ref) ?? null
                : null;
              const vt = wpis?.vt_catalog_ref
                ? vtTypy.find((t) => t.id === wpis.vt_catalog_ref) ?? null
                : null;
              return (
                <KreatorSekcja
                  key={pole.id}
                  tytul={`${index + 1}. ${fieldRoleLabelPl(pole.field_role)}`}
                  testid={`mvd-kreator-stacja-pomiar-pole-${index + 1}`}
                >
                  <KreatorSiatka kolumny={2}>
                    <PoleKatalogu
                      etykieta={T.pomiarCt}
                      wartosc={wpis?.ct_catalog_ref ?? null}
                      onZmiana={(v) => zmienWyposazenie(pole.id, { ct_catalog_ref: v })}
                      opcje={ctTypy.map((t) => ({
                        id: t.id,
                        etykieta: `${t.name} · ${t.ratio_primary_a}/${t.ratio_secondary_a} A`,
                      }))}
                      status={bladPomiaru ? 'error' : 'ready'}
                      placeholder={T.wyposazenieBrak}
                      pomoc={T.pomiarCtPomoc}
                      komunikatBledu={bladPomiaru ?? T.pomiarKatalogBlad}
                      blad={bladDlaPola(`pole:${pole.id}:ct`)}
                      testid={`mvd-kreator-stacja-ct-${index + 1}`}
                    />
                    <PoleKatalogu
                      etykieta={T.pomiarVt}
                      wartosc={wpis?.vt_catalog_ref ?? null}
                      onZmiana={(v) => zmienWyposazenie(pole.id, { vt_catalog_ref: v })}
                      opcje={vtTypy.map((t) => ({
                        id: t.id,
                        etykieta: `${t.name} · ${t.ratio_primary_v}/${t.ratio_secondary_v} V`,
                      }))}
                      status={bladPomiaru ? 'error' : 'ready'}
                      placeholder={T.wyposazenieBrak}
                      pomoc={T.pomiarVtPomoc}
                      komunikatBledu={bladPomiaru ?? T.pomiarKatalogBlad}
                      testid={`mvd-kreator-stacja-vt-${index + 1}`}
                    />
                    <PoleKatalogu
                      etykieta={T.pomiarPrzekaznik}
                      wartosc={wpis?.relay_catalog_ref ?? null}
                      onZmiana={(v) => zmienWyposazenie(pole.id, { relay_catalog_ref: v })}
                      opcje={przekazniki.map((t) => {
                        // Katalog MV podaje `name_pl`; biblioteka analityczna `name`.
                        const nazwa = t.name_pl ?? t.name ?? t.id;
                        return {
                          id: t.id,
                          etykieta: t.vendor ? `${t.vendor} · ${nazwa}` : nazwa,
                        };
                      })}
                      status={bladPomiaru ? 'error' : 'ready'}
                      placeholder={T.wyposazenieBrak}
                      pomoc={T.pomiarPrzekaznikPomoc}
                      komunikatBledu={bladPomiaru ?? T.pomiarKatalogBlad}
                      blad={bladDlaPola(`pole:${pole.id}:przekaznik`)}
                      testid={`mvd-kreator-stacja-przekaznik-${index + 1}`}
                    />
                    <PoleWyboru
                      etykieta={T.pomiarRodzaj}
                      wartosc={wpis?.relay_type ?? ''}
                      onZmiana={(v) => zmienWyposazenie(pole.id, { relay_type: v })}
                      opcje={[{ id: '', etykieta: T.wybierz }, ...T.pomiarRodzajOpcje]}
                      testid={`mvd-kreator-stacja-rodzaj-zabezpieczenia-${index + 1}`}
                    />
                  </KreatorSiatka>
                  <KreatorSiatka kolumny={2}>
                    <RzadWartosci
                      etykieta={T.pomiarKody}
                      wartosc={kody.length > 0 ? kody.join(' · ') : T.pomiarKodyBrak}
                    />
                    <RzadWartosci
                      etykieta={T.pomiarPrzekladnia}
                      wartosc={
                        ct || vt
                          ? [
                              ct ? `CT ${ct.ratio_primary_a}/${ct.ratio_secondary_a} A` : null,
                              vt ? `VT ${vt.ratio_primary_v}/${vt.ratio_secondary_v} V` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')
                          : '—'
                      }
                    />
                  </KreatorSiatka>
                  {/* KD-3: obwody wtórne CT/VT — dane wejściowe kryteriów bilansu.
                      Wartości liczbowe wracają z końcówek solvera (zero fizyki tutaj). */}
                  {wpis?.ct_catalog_ref ? (
                    <>
                      <KreatorSiatka kolumny={3}>
                        <PoleLiczbowe
                          etykieta={KRYTERIA_STRINGS.ctDlugosc}
                          jednostka="m"
                          wartosc={wpis.ct_dlugosc_m}
                          onZmiana={(v) => zmienWyposazenie(pole.id, { ct_dlugosc_m: v })}
                          krok={0.5}
                          min={0}
                          testid={`mvd-kreator-stacja-ct-dlugosc-${index + 1}`}
                        />
                        <PoleLiczbowe
                          etykieta={KRYTERIA_STRINGS.ctPrzekroj}
                          jednostka="mm²"
                          wartosc={wpis.ct_przekroj_mm2}
                          onZmiana={(v) => zmienWyposazenie(pole.id, { ct_przekroj_mm2: v })}
                          krok={0.5}
                          min={0}
                          testid={`mvd-kreator-stacja-ct-przekroj-${index + 1}`}
                        />
                        <PoleLiczbowe
                          etykieta={KRYTERIA_STRINGS.ctMocAparatow}
                          jednostka="VA"
                          wartosc={wpis.ct_moc_aparatow_va}
                          onZmiana={(v) => zmienWyposazenie(pole.id, { ct_moc_aparatow_va: v })}
                          krok={0.5}
                          min={0}
                          testid={`mvd-kreator-stacja-ct-moc-${index + 1}`}
                        />
                      </KreatorSiatka>
                      <KreatorSiatka kolumny={1}>
                        <PoleLiczbowe
                          etykieta={KRYTERIA_STRINGS.ctMocStykow}
                          jednostka="VA"
                          wartosc={wpis.ct_moc_stykow_va}
                          onZmiana={(v) => zmienWyposazenie(pole.id, { ct_moc_stykow_va: v })}
                          krok={0.1}
                          min={0}
                          testid={`mvd-kreator-stacja-ct-moc-stykow-${index + 1}`}
                        />
                      </KreatorSiatka>
                    </>
                  ) : null}
                  {wpis?.vt_catalog_ref ? (
                    <>
                      <KreatorSiatka kolumny={3}>
                        <PoleLiczbowe
                          etykieta={KRYTERIA_STRINGS.vtDlugosc}
                          jednostka="m"
                          wartosc={wpis.vt_dlugosc_m}
                          onZmiana={(v) => zmienWyposazenie(pole.id, { vt_dlugosc_m: v })}
                          krok={0.5}
                          min={0}
                          testid={`mvd-kreator-stacja-vt-dlugosc-${index + 1}`}
                        />
                        <PoleLiczbowe
                          etykieta={KRYTERIA_STRINGS.vtPrzekroj}
                          jednostka="mm²"
                          wartosc={wpis.vt_przekroj_mm2}
                          onZmiana={(v) => zmienWyposazenie(pole.id, { vt_przekroj_mm2: v })}
                          krok={0.5}
                          min={0}
                          testid={`mvd-kreator-stacja-vt-przekroj-${index + 1}`}
                        />
                        <PoleLiczbowe
                          etykieta={KRYTERIA_STRINGS.vtMocAparatow}
                          jednostka="VA"
                          wartosc={wpis.vt_moc_aparatow_va}
                          onZmiana={(v) => zmienWyposazenie(pole.id, { vt_moc_aparatow_va: v })}
                          krok={0.5}
                          min={0}
                          testid={`mvd-kreator-stacja-vt-moc-${index + 1}`}
                        />
                      </KreatorSiatka>
                      <KreatorSiatka kolumny={1}>
                        <PoleLiczbowe
                          etykieta={KRYTERIA_STRINGS.vtMocStykow}
                          jednostka="VA"
                          wartosc={wpis.vt_moc_stykow_va}
                          onZmiana={(v) => zmienWyposazenie(pole.id, { vt_moc_stykow_va: v })}
                          krok={0.1}
                          min={0}
                          testid={`mvd-kreator-stacja-vt-moc-stykow-${index + 1}`}
                        />
                      </KreatorSiatka>
                      <PoleWyboru
                        etykieta={KRYTERIA_STRINGS.vtUzwojenie}
                        wartosc={wpis.vt_uzwojenie ?? ''}
                        onZmiana={(v) =>
                          zmienWyposazenie(pole.id, {
                            vt_uzwojenie: (v || null) as 'POMIAROWE' | 'ZABEZPIECZENIOWE' | null,
                          })
                        }
                        opcje={[
                          { id: '', etykieta: T.wybierz },
                          ...KRYTERIA_STRINGS.vtUzwojenieOpcje.map((o) => ({
                            id: o.id,
                            etykieta: o.etykieta,
                          })),
                        ]}
                        testid={`mvd-kreator-stacja-vt-uzwojenie-${index + 1}`}
                      />
                    </>
                  ) : null}
                  <SekcjaBilansuCtVt
                    ctRef={wpis?.ct_catalog_ref ?? null}
                    // Kryterium VT tylko przy znanej kategorii uzwojenia (od niej zależy limit);
                    // bez niej VT nie jest sprawdzany, a kategorii nie zgadujemy.
                    vtRef={wpis?.vt_uzwojenie ? wpis.vt_catalog_ref ?? null : null}
                    obwodCt={{
                      dlugosc_m: wpis?.ct_dlugosc_m ?? null,
                      przekroj_mm2: wpis?.ct_przekroj_mm2 ?? null,
                      moc_aparatow_va: wpis?.ct_moc_aparatow_va ?? null,
                      moc_stykow_va: wpis?.ct_moc_stykow_va ?? null,
                    }}
                    obwodVt={{
                      dlugosc_m: wpis?.vt_dlugosc_m ?? null,
                      przekroj_mm2: wpis?.vt_przekroj_mm2 ?? null,
                      moc_aparatow_va: wpis?.vt_moc_aparatow_va ?? null,
                      moc_stykow_va: wpis?.vt_moc_stykow_va ?? null,
                    }}
                    uzwojenieVt={wpis?.vt_uzwojenie ?? 'POMIAROWE' /* nieużywane bez vtRef */}
                    testidSufiks={String(index + 1)}
                  />
                  {/* KD-3 poz. 9: od dobranego przekaźnika wprost do jego krzywych —
                      powiązanie z danych katalogu, nie z dopasowania nazw w UI. */}
                  <SekcjaKrzywychPrzekaznika
                    relayRef={wpis?.relay_catalog_ref ?? null}
                    testidSufiks={String(index + 1)}
                  />
                </KreatorSekcja>
              );
            })
          )}
          <RzadWartosci
            etykieta={T.pomiarWyposazenieRazem(liczbaElementowWyposazenia)}
            wartosc={String(liczbaElementowWyposazenia)}
          />
        </KreatorSekcja>
      ) : null}


      {krok === 'nn' ? (
        <KreatorSekcja tytul={T.krokNn} testid="mvd-kreator-stacja-nn-blok">
          <KreatorSiatka kolumny={2}>
            <RzadWartosci etykieta={T.nnBlokKonfiguracja} wartosc={konfiguracjaNnLabel} />
            <RzadWartosci etykieta={T.nnBlokNapiecie} wartosc={nnVoltageLabel} />
          </KreatorSiatka>
          <PoleLiczbowe
            etykieta={T.liczbaOdplywow}
            wartosc={dane.outgoing_feeders_nn_count}
            onZmiana={(v) => zmien('outgoing_feeders_nn_count', v)}
            krok={1}
            min={1}
            max={8}
            pomoc={T.liczbaOdplywowPomoc}
            wymagane
            blad={bladDlaPola('outgoing_feeders_nn_count')}
            testid="mvd-kreator-stacja-odplywy"
          />

          <KreatorSekcja tytul={T.potrzebyWlasneTytul} testid="mvd-kreator-stacja-potrzeby-wlasne">
            <KreatorInfo>{T.potrzebyWlasneOpis}</KreatorInfo>
            <KreatorSiatka kolumny={2}>
              <PoleTekstowe
                etykieta={T.potrzebyWlasneMoc}
                wartosc={dane.station_auxiliary_kw}
                onZmiana={(v) => zmien('station_auxiliary_kw', v)}
                placeholder={T.potrzebyWlasneMocPlaceholder}
                pomoc={T.potrzebyWlasneMocPomoc}
                blad={bladDlaPola('station_auxiliary_kw')}
                testid="mvd-kreator-stacja-pw-moc"
              />
              <PoleTekstowe
                etykieta={T.potrzebyWlasneCosphi}
                wartosc={dane.station_auxiliary_cosphi}
                onZmiana={(v) => zmien('station_auxiliary_cosphi', v)}
                pomoc={T.potrzebyWlasneCosphiPomoc}
                blad={bladDlaPola('station_auxiliary_cosphi')}
                testid="mvd-kreator-stacja-pw-cosphi"
              />
            </KreatorSiatka>
          </KreatorSekcja>

          {isZrodlo && zrodloTeksty ? (
            <KreatorSekcja tytul={zrodloTeksty.sekcja} testid="mvd-kreator-stacja-zrodlo">
              {konwerter ? (
                <>
                  <KreatorSiatka kolumny={2}>
                    <RzadWartosci etykieta={T.nnBlokZrodloFalownik} wartosc={konwerter.name} />
                    <RzadWartosci etykieta={T.nnBlokZrodloUn} wartosc={fmtKv(konwerter.un_kv)} />
                    <RzadWartosci etykieta={T.nnBlokZrodloMoc} wartosc={fmtMva(konwerter.sn_mva)} />
                    <RzadWartosci etykieta={T.nnBlokZrodloPmax} wartosc={fmtMva(konwerter.pmax_mw)} />
                    <RzadWartosci etykieta={T.nnBlokLabelPvPole} wartosc={zrodloTeksty.poleWartosc} />
                  </KreatorSiatka>
                  {protekcja ? (
                    <KreatorSekcja tytul={T.ochronaTytul} testid="mvd-kreator-stacja-ochrona">
                      <KreatorInfo>{T.ochronaOpis}</KreatorInfo>
                      <KreatorSiatka kolumny={2}>
                        <RzadWartosci etykieta={T.ochronaAparat} wartosc={protekcja.device_label} />
                        <RzadWartosci etykieta={T.ochronaChroniony} wartosc={protekcja.protected_object} />
                        <RzadWartosci etykieta={T.ochronaZakres} wartosc={protekcja.analysis_scope} />
                      </KreatorSiatka>
                    </KreatorSekcja>
                  ) : null}
                </>
              ) : (
                <KreatorInfo testid="mvd-kreator-stacja-zrodlo-brak">{zrodloTeksty.wyborBrak}</KreatorInfo>
              )}
            </KreatorSekcja>
          ) : null}

          <PanelTeorii
            tytul={T.teoriaNnTytul}
            opis={T.teoriaNnOpis}
            wymog={T.teoriaNnWymog}
            podstawa={T.teoriaNnPodstawa}
            testid="mvd-kreator-stacja-teoria-nn"
          />
        </KreatorSekcja>
      ) : null}

      {krok === 'uziemienie' ? (
        <KreatorSekcja tytul={T.krokUziemienie} testid="mvd-kreator-stacja-uziemienie">
          <KreatorInfo>{T.uziemienieOpis}</KreatorInfo>
          <PoleWyboru
            etykieta={T.uziemienieUklad}
            wartosc={dane.uklad_sieci_nn ?? ''}
            opcje={[{ id: '', etykieta: T.wybierz }, ...T.uziemienieUkladOpcje]}
            onZmiana={(v) => zmien('uklad_sieci_nn', (v || null) as StacjaFormData['uklad_sieci_nn'])}
            wymagane
            pomoc={T.uziemienieUkladPomoc}
            testid="mvd-kreator-stacja-uklad-nn"
          />
          <PoleWyboru
            etykieta={T.uziemieniePunkt}
            wartosc={dane.neutral_point ?? ''}
            opcje={[{ id: '', etykieta: T.wybierz }, ...T.uziemieniePunktOpcje]}
            onZmiana={(v) => zmien('neutral_point', (v || null) as StacjaFormData['neutral_point'])}
            wymagane
            pomoc={T.uziemieniePunktPomoc}
            testid="mvd-kreator-stacja-punkt-neutralny"
          />
          {punktImpedancyjny ? (
            <PoleTekstowe
              etykieta={dane.neutral_point === 'petersen_coil' ? T.uziemienieReaktancja : T.uziemienieRezystancja}
              wartosc={dane.neutral_impedance_ohm}
              onZmiana={(v) => zmien('neutral_impedance_ohm', v)}
              placeholder={T.uziemienieRezystancjaPlaceholder}
              pomoc={T.uziemienieRezystancjaPomoc}
              wymagane
              blad={bladDlaPola('neutral_impedance_ohm')}
              testid="mvd-kreator-stacja-rezystancja-uziemienia"
            />
          ) : null}
          <PanelTeorii
            tytul={T.teoriaUziemienieTytul}
            opis={T.teoriaUziemienieOpis}
            wymog={T.teoriaUziemienieWymog}
            podstawa={T.teoriaUziemieniePodstawa}
            testid="mvd-kreator-stacja-teoria-uziemienie"
          />
        </KreatorSekcja>
      ) : null}

      {krok === 'podglad' ? (
        <KreatorSekcja tytul={T.krokPodglad} testid="mvd-kreator-stacja-podglad-skutkow">
          <KreatorInfo>{T.podgladOpis}</KreatorInfo>
          {!koniec ? (
            <PoleTekstowe
              etykieta={T.insertAt}
              wartosc={dane.insert_at_m}
              onZmiana={(v) => zmien('insert_at_m', v)}
              placeholder={T.insertAtPlaceholder}
              pomoc={T.insertAtPomoc}
              blad={bladDlaPola('insert_at_m')}
              testid="mvd-kreator-stacja-insert-at"
            />
          ) : null}
          <div className="mvd-kreator-stopka-nawigacja">
            <button
              type="button"
              className="mvd-kreator-btn mvd-kreator-btn--glowna"
              disabled={podgladStan === 'loading'}
              onClick={onPrzeliczPodglad}
              data-testid="mvd-kreator-stacja-podglad-przelicz"
            >
              {T.podgladOdswiez}
            </button>
          </div>

          {/* B-8: zapis bieżącej konfiguracji jako szablonu użytkownika. Zapisujemy
              STAN FORMULARZA — odtworzenie jest wtedy dokładne, bez tłumaczenia
              kształtu (i bez miejsca, w którym zapis mógłby się rozjechać). */}
          <KreatorSekcja tytul={T.szablonZapiszTytul} testid="mvd-kreator-stacja-zapisz-szablon">
            <KreatorInfo>{T.szablonZapiszOpis}</KreatorInfo>
            <PoleTekstowe
              etykieta={T.szablonZapiszNazwa}
              wartosc={nazwaWlasnegoSzablonu}
              onZmiana={setNazwaWlasnegoSzablonu}
              placeholder={T.szablonZapiszNazwaPlaceholder}
              testid="mvd-kreator-stacja-szablon-nazwa"
            />
            <div className="mvd-kreator-stopka-nawigacja">
              <button
                type="button"
                className="mvd-kreator-btn"
                onClick={() => void zapiszJakoSzablon()}
                data-testid="mvd-kreator-stacja-szablon-zapisz"
              >
                {T.szablonZapiszAkcja}
              </button>
            </div>
            {komunikatZapisuSzablonu ? (
              <KreatorInfo testid="mvd-kreator-stacja-szablon-zapis-komunikat">
                {komunikatZapisuSzablonu}
              </KreatorInfo>
            ) : null}
          </KreatorSekcja>

          {podgladStan === 'loading' ? (
            <KreatorInfo testid="mvd-kreator-stacja-podglad-ladowanie">{T.podgladLadowanie}</KreatorInfo>
          ) : null}
          {podgladStan === 'error' ? (
            <KreatorInfo testid="mvd-kreator-stacja-podglad-blad">
              {bladPodgladu ?? T.podgladBlad}
            </KreatorInfo>
          ) : null}
          {podgladStan === 'idle' ? (
            <KreatorInfo testid="mvd-kreator-stacja-podglad-pusty">{T.podgladPusty}</KreatorInfo>
          ) : null}

          {podglad ? (
            <div data-testid="mvd-kreator-stacja-podglad-wynik">
            <KreatorSiatka kolumny={2}>
              <RzadWartosci
                etykieta={T.podgladPodzial}
                wartosc={
                  podglad.halves?.split_ratio != null ? fmtRatio(podglad.halves.split_ratio) : '—'
                }
              />
              <RzadWartosci
                etykieta={T.podgladDlugoscA}
                wartosc={
                  podglad.halves?.first_length_km != null
                    ? `${podglad.halves.first_length_km.toFixed(3)} km`
                    : '—'
                }
              />
              <RzadWartosci
                etykieta={T.podgladDlugoscB}
                wartosc={
                  podglad.halves?.second_length_km != null
                    ? `${podglad.halves.second_length_km.toFixed(3)} km`
                    : '—'
                }
              />
              <RzadWartosci
                etykieta={T.podgladElementy}
                wartosc={String((podglad.impact?.affected_object_refs ?? []).length)}
              />
              <RzadWartosci
                etykieta={T.podgladWyniki}
                wartosc={String((podglad.impact?.invalidated_results ?? []).length)}
              />
              <RzadWartosci
                etykieta={T.podgladBraki}
                wartosc={
                  (podglad.impact?.missing_data_after ?? []).length > 0
                    ? (podglad.impact?.missing_data_after ?? []).join(' · ')
                    : '—'
                }
              />
            </KreatorSiatka>
            </div>
          ) : null}
        </KreatorSekcja>
      ) : null}

      {krok === 'zapis' ? (
        <KreatorSekcja tytul={T.krokZapis} testid="mvd-kreator-stacja-zapis">
          <KreatorInfo>{T.downstreamOpis}</KreatorInfo>
          <KreatorSiatka kolumny={2}>
            <RzadWartosci etykieta={T.podsumTyp} wartosc={typLabel} />
            <RzadWartosci etykieta={T.podsumUmiejscowienie} wartosc={kontekstOk ? umiejscowienieLabel : '—'} />
            <RzadWartosci etykieta={T.podsumTransformator} wartosc={fmtMva(params?.rated_power_mva)} />
            <RzadWartosci
              etykieta={T.podsumRozdzielnica}
              wartosc={
                rozdzielnicaKompletna
                  ? `${selectedManufacturer?.name ?? ''} · ${snFields.length} pól`
                  : '—'
              }
            />
            <RzadWartosci etykieta={T.podsumNnKonfiguracja} wartosc={konfiguracjaNnLabel} />
            <RzadWartosci
              etykieta={T.podsumNn}
              wartosc={`${nnVoltageLabel} · ${liczbaOdplywowLabel} odpł.`}
            />
            {isZrodlo && zrodloTeksty ? (
              <RzadWartosci
                etykieta={T.podsumZrodlo}
                wartosc={konwerter ? `${konwerter.name} · ${fmtMva(konwerter.sn_mva)}` : zrodloTeksty.wyborBrak}
              />
            ) : null}
            <RzadWartosci
              etykieta={T.szablonWybrany}
              wartosc={dane.template_name || T.szablonBrakWyboru}
            />
            <RzadWartosci
              etykieta={T.oznaczenie}
              wartosc={dane.designation.trim() || '—'}
            />
            <RzadWartosci
              etykieta={T.konstrukcja}
              wartosc={
                T.konstrukcjaOpcje.find((o) => o.id === dane.construction_type)?.etykieta ?? '—'
              }
            />
            <RzadWartosci
              etykieta={T.pomiarWyposazenieRazem(liczbaElementowWyposazenia)}
              wartosc={String(liczbaElementowWyposazenia)}
            />
          </KreatorSiatka>

          <PoleWyboru
            etykieta={T.dalejTytul}
            wartosc={nastepnyKrok}
            onZmiana={(v) => setNastepnyKrok(v as NastepnyKrok)}
            opcje={T.dalejOpcje}
            pomoc={T.dalejPomoc}
            testid="mvd-kreator-stacja-nastepny-krok"
          />

        </KreatorSekcja>
      ) : null}
    </KreatorRama>
  );
}
