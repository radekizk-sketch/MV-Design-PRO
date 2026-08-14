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
 * Dług nazwany B-3: CT/VT/przekaźnik dokładane są operacjami PO zapisie stacji
 * (backend nie przyjmuje ich dziś w operacji stacyjnej) — sekwencja nie jest
 * atomowa i kreator uczciwie raportuje krok, który zawiódł.
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
  FIELD_ROLE_LABELS,
  contextString,
  deriveSnVoltageKv,
  resolveSegmentIdFromContext,
  templateOptionLabel,
} from '../../../ui/network-build/forms/InsertStationFormHelpers';
import {
  useActiveOperationContext,
  useNetworkBuildStore,
} from '../../../ui/network-build/networkBuildStore';
import { scheduleNextOperationForm } from '../../../ui/network-build/trunkContinuation';
import { selectBusOptions, useSnapshotStore } from '../../../ui/topology/snapshotStore';
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
  useSelekcjaPoOperacji,
  type KrokKreatora,
  type WierszGotowosci,
} from '../rama';
import {
  DANE_DOMYSLNE,
  RODZAJE_ZABEZPIECZEN,
  aparatyDlaPola,
  brakujePolaTransformatorowego,
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
  kontekstKompletny,
  konwerterZKatalogu,
  mocZrodlaNnMva,
  nazwaOperacji,
  normalizujTypStacji,
  ogranicznikOdplywow,
  opcjeSzablonowRoli,
  parametryZKatalogu,
  producenciUzywalni,
  rolePolaStacji,
  szablonyDlaWyboru,
  szablonyPerRola,
  walidujFormularz,
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
    const rawPos = context?.position_on_segment;
    const positionOnSegment = typeof rawPos === 'number' && Number.isFinite(rawPos) ? rawPos : 0.5;
    const segmentId = resolveSegmentIdFromContext(context, snapshot);
    // Napięcie SN z rzeczywistej szyny: odcinka (insert) lub terminala (append).
    // 0 = nieznane → serializacja pomija sn_voltage_kv, backend ustala z szyny.
    const snVoltageKv = deriveSnVoltageKv(snapshot, busOptions, segmentId, endpointBusRef);
    const tryb = wyznaczTryb(placementMode, endpointBusRef, positionOnSegment);
    const rawStationType =
      (context?.station as Record<string, unknown> | undefined)?.station_type
      ?? context?.station_type;
    // Dopięcie na końcu odcinka bez jawnego typu → stacja końcowa (WE+TR),
    // nie odgałęźna (P1: dead-end nie dostaje nadmiarowych pól WY/ODG).
    const stationKind =
      rawStationType == null && tryb === 'ENDPOINT_APPEND'
        ? 'terminal'
        : normalizujTypStacji(rawStationType);
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
  const [bledy, setBledy] = useState<BladPola[]>([]);
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);
  const [krok, setKrok] = useState<string>('szablon');

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
  const punktImpedancyjny =
    dane.neutral_point === 'resistor_grounded' || dane.neutral_point === 'petersen_coil';
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

  // Wariant źródłowy: gdy bieżąca referencja nie należy do listy dla rodzaju
  // (PV/BESS/FW), wybierz pierwszy zdatny albo wyczyść — spójność payloadu przy
  // zmianie rodzaju źródła (parytet legacy: falowniki zawężone do rodzaju).
  useEffect(() => {
    if (!isZrodlo) return;
    if (dane.source_converter_ref && falowniki.some((c) => c.id === dane.source_converter_ref)) {
      return;
    }
    setDane((p) => ({ ...p, source_converter_ref: falowniki[0]?.id ?? null }));
  }, [dane.source_converter_ref, falowniki, isZrodlo]);

  // Powrót do wariantu odbiorczego → wyczyść referencję falownika (spójność payloadu).
  useEffect(() => {
    if (!isZrodlo && dane.source_converter_ref) {
      setDane((p) => ({ ...p, source_converter_ref: null }));
    }
  }, [dane.source_converter_ref, isZrodlo]);

  // Gdy wybrany typ wypada z doboru (zmiana napięcia nN) — wyczyść wybór.
  useEffect(() => {
    if (dane.catalog_ref && !dobrane.some((t) => t.id === dane.catalog_ref)) {
      setDane((p) => ({ ...p, catalog_ref: null }));
    }
  }, [dane.catalog_ref, dobrane]);

  const params = useMemo(
    () => parametryZKatalogu(dane.catalog_ref, typy),
    [dane.catalog_ref, typy],
  );

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

  /** Aparaty zdatne DLA ROLI pola — zawężenie z backendu + zgodność napięciowa. */
  const aparatyDlaRoli = useCallback(
    (rola: SnFieldRole) =>
      aparatyDlaPola(
        aparaty,
        kontekst.snVoltageKv,
        rodzajeAparatuRoli[ROLA_POLA_NA_BAY_ROLE[rola]] ?? [],
      ),
    [aparaty, kontekst.snVoltageKv, rodzajeAparatuRoli],
  );

  /** Lista bez zawężenia rolą — domyślny aparat i stan zerowy kroku. */
  const aparatyZdatne = useMemo(
    () => aparatyDlaPola(aparaty, kontekst.snVoltageKv),
    [aparaty, kontekst.snVoltageKv],
  );

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
        setSzablonyStacji([...(odp.templates ?? [])]);
        setSzablonyStan('gotowe');
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

  // Domyślny producent = pierwszy używalny (parytet legacy), gdy brak wyboru.
  useEffect(() => {
    if (producenciDobrani.length === 0) return;
    if (producenciDobrani.some((m) => m.manufacturer_ref === dane.manufacturer_ref)) return;
    setDane((p) => ({ ...p, manufacturer_ref: producenciDobrani[0].manufacturer_ref }));
  }, [dane.manufacturer_ref, producenciDobrani]);

  // Rodzina spoza zawężonej listy → reset do standardowej (pierwszej dostępnej).
  useEffect(() => {
    if (!dane.switchgear_family_ref) return;
    if (rodzinyDobrane.some((f) => f.switchgear_family_ref === dane.switchgear_family_ref)) return;
    setDane((p) => ({ ...p, switchgear_family_ref: null }));
  }, [dane.switchgear_family_ref, rodzinyDobrane]);

  const szablonyWyboru = useMemo(
    () => szablonyDlaWyboru(szablony, dane.manufacturer_ref, dane.switchgear_family_ref),
    [dane.manufacturer_ref, dane.switchgear_family_ref, szablony],
  );
  const rolePol = useMemo(() => rolePolaStacji(dane.station_type), [dane.station_type]);
  const szablonyRola = useMemo(
    () => szablonyPerRola(szablonyWyboru, dane.station_type, dane.bay_template_refs),
    [dane.bay_template_refs, dane.station_type, szablonyWyboru],
  );
  const selectedManufacturer = useMemo(
    () => producenciDobrani.find((m) => m.manufacturer_ref === dane.manufacturer_ref) ?? null,
    [dane.manufacturer_ref, producenciDobrani],
  );
  const selectedFamily = useMemo(
    () => rodzinyDobrane.find((f) => f.switchgear_family_ref === dane.switchgear_family_ref) ?? null,
    [dane.switchgear_family_ref, rodzinyDobrane],
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
    () => naglowekRodziny(selectedFamily, selectedManufacturer?.name ?? dane.manufacturer_ref),
    [dane.manufacturer_ref, selectedFamily, selectedManufacturer],
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

  const aparatDomyslny = aparatyZdatne[0]?.id ?? null;
  /** Domyślny aparat DLA ROLI — pierwszy zdatny z listy zawężonej rolą pola. */
  const aparatDomyslnyRoli = useCallback(
    (rola: SnFieldRole) => aparatyDlaRoli(rola)[0]?.id ?? aparatDomyslny,
    [aparatDomyslny, aparatyDlaRoli],
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
  useEffect(() => {
    if (torKonfiguracji === 'BLOK_RMU') return;
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
    if (selectedFamily !== null) return;
    setDane((p) =>
      p.pola.length === 0 || p.template_id !== null ? p : { ...p, pola: [], wyposazenie: {} },
    );
  }, [selectedFamily]);

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
   * Uzupełnienie wskazań w istniejących wpisach: katalogowe pole z pakietu
   * WYBRANEJ rodziny, aparat z listy zdatnej DLA ROLI — bez nadpisywania
   * świadomych wyborów projektanta.
   *
   * ZBIÓR OFERTY I ZBIÓR ZACHOWANIA TO JEDEN ZBIÓR (`szablonyWyboru`). Wcześniej
   * warunek brzmiał „zostaw, cokolwiek pole ma" (`pole.bay_template_ref ?? …`),
   * więc pole zachowywało KARTĘ KATALOGOWĄ INNEGO WYROBU po zmianie producenta
   * albo rodziny: picker jej już nie oferował, ale wpis ją trzymał. Skutek był
   * cichy i dotkliwy — szablon spoza pakietu nie odnajdywał się przy budowie
   * pól, więc pole szło do operacji ze statusem „wymaga katalogu", zapis
   * zostawał zablokowany, a ekran nie mówił, dlaczego. Dwa niezależne warunki,
   * które „dziś się zgadzają" (bo cały katalog testowy miał jedną rodzinę),
   * czekały na dane brzegowe: drugą rodzinę w katalogu.
   */
  useEffect(() => {
    setDane((p) => {
      let zmiana = false;
      const pola = p.pola.map((pole) => {
        const wskazanieAktualne =
          pole.bay_template_ref !== null
          && szablonyWyboru.some((t) => t.template_ref === pole.bay_template_ref);
        // Kartę katalogową dobieramy WYŁĄCZNIE z pakietu wskazanej rodziny.
        // Bez rodziny pole zostaje bez karty (krok jawnie niedomknięty) —
        // dobór z pakietu producenta mieszałby karty różnych wyrobów.
        const szablonRef = wskazanieAktualne
          ? pole.bay_template_ref
          : selectedFamily === null
            ? null
            : szablonyRola[pole.field_role]?.template_ref ?? null;
        const aparatRef = pole.apparatus_catalog_ref ?? aparatDomyslnyRoli(pole.field_role);
        if (szablonRef === pole.bay_template_ref && aparatRef === pole.apparatus_catalog_ref) {
          return pole;
        }
        zmiana = true;
        return { ...pole, bay_template_ref: szablonRef, apparatus_catalog_ref: aparatRef };
      });
      return zmiana ? { ...p, pola } : p;
    });
  }, [aparatDomyslnyRoli, selectedFamily, szablonyRola, szablonyWyboru]);

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
        dane.factory_configuration_ref,
      ),
    [
      dane.factory_configuration_ref,
      dane.manufacturer_ref,
      dane.pola,
      dane.switchgear_family_ref,
      szablonyWyboru,
      wyposazenieDoPayloadu,
    ],
  );
  const rozdzielnicaKompletna = czyRozdzielnicaKompletna(snFields);
  // KOMPLETNOSC-POLA-TR: kreator stacji SN/nN ZAWSZE tworzy transformator
  // (`transformer.create: true` w payloadzie), więc brak pola roli TR na liście
  // to zawsze świadoma rezygnacja projektanta — i zawsze ma być nazwana wprost.
  const brakPolaTransformatorowego = brakujePolaTransformatorowego(dane.pola, true);
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
   * KOMPLETNOSC-POLA-TR: przywrócenie pola transformatorowego po świadomym
   * usunięciu. Pole wchodzi z tym samym doborem, co domyślne (szablon roli +
   * aparat dopuszczalny dla roli TR) — projektant nie musi go składać od nowa.
   */
  const przywrocPoleTransformatorowe = useCallback(() => {
    setDane((p) => {
      if (p.pola.some((pole) => pole.field_role === 'TRANSFORMATOROWE')) return p;
      const rola: SnFieldRole = 'TRANSFORMATOROWE';
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

  const usunPole = useCallback((id: string) => {
    setDane((p) => ({
      ...p,
      pola: p.pola.filter((pole) => pole.id !== id),
      wyposazenie: Object.fromEntries(
        Object.entries(p.wyposazenie).filter(([klucz]) => klucz !== id),
      ),
    }));
  }, []);

  const zmienPole = useCallback((id: string, zmiana: Partial<PoleSnWpis>) => {
    setDane((p) => ({
      ...p,
      pola: p.pola.map((pole) => (pole.id === id ? { ...pole, ...zmiana } : pole)),
    }));
  }, []);

  const zmienWyposazenie = useCallback(
    (id: string, zmiana: Partial<StacjaFormData['wyposazenie'][string]>) => {
      setDane((p) => {
        const biezace = p.wyposazenie[id] ?? nowyWpisWyposazenia();
        return { ...p, wyposazenie: { ...p.wyposazenie, [id]: { ...biezace, ...zmiana } } };
      });
    },
    [],
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
      setDane((p) => ({ ...p, [pole]: wartosc }));
    },
    [],
  );

  const bladDlaPola = (pole: string): string | undefined =>
    bledy.find((b) => b.field === pole)?.message;

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

  const zapiszStacje = useCallback(
    async (daneEff: StacjaFormData, konwerterEff: ConverterType | null) => {
      const walid = walidujFormularz(daneEff, snFields);
      setBledy(walid);
      if (walid.length > 0) return;
      if (!kontekstOk) {
        setBladGlobalny(T.umiejscowienieBrakOpis);
        return;
      }
      if (!activeCaseId) {
        setBladGlobalny(T.brakZakresu);
        return;
      }
      setBladGlobalny(null);
      try {
        const response = await executeDomainOperation(
          activeCaseId,
          nazwaOperacji(kontekst),
          zbudujPayload(daneEff, kontekst, rozdzielnica, konwerterEff),
        );
        if (!response) {
          setBladGlobalny(useSnapshotStore.getState().error ?? T.walidacjaStopka);
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
        setBladGlobalny(e instanceof Error ? e.message : T.walidacjaStopka);
      }
    },
    [
      activeCaseId,
      closeForm,
      executeDomainOperation,
      kontekst,
      kontekstOk,
      nastepnyKrok,
      openOperationForm,
      rozdzielnica,
      selekcjaPoOperacji,
      snFields,
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
   * SLD-GEN-POLA — WERDYKT KONFIGURACJI ROZDZIELNICY w nagłówku kroku pól.
   *
   * Nie jest liczony w UI: to stan odczytu z walidatora backendu (`dry_run` tej
   * samej operacji domenowej, która wykona zapis), więc nagłówek pokazuje
   * dokładnie ten werdykt, który rozstrzygnie o przyjęciu stacji. Odwzorowanie
   * jest 1:1 i BEZ trzeciej oceny: „niesprawdzona" i „sprawdzanie" to stany
   * odczytu, nie własna opinia UI o poprawności.
   */
  const statusKonfiguracji: StatusKonfiguracji =
    podgladStan === 'ready'
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
      kontekstOk && activeCaseId
        ? JSON.stringify(zbudujPayload(dane, kontekst, rozdzielnica, konwerter))
        : null,
    [activeCaseId, dane, kontekst, kontekstOk, konwerter, rozdzielnica],
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
      setSzablonZastosowany(null);
      setDane((p) => ({ ...p, template_id: null, template_name: '' }));
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
      setDane((p) => {
        const stationType = wypelnienie.stationType ?? p.station_type;
        // Aparat z szablonu, a przy jego braku — domyślny DLA ROLI pola
        // (szablon stacji nie musi wskazywać aparatu każdego pola).
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
        // Propozycje szablonu przyjmujemy TYLKO wtedy, gdy pozycja istnieje w
        // katalogu, który waliduje odpowiednia operacja (add_ct/add_vt/add_relay).
        // Szablony stacji wskazują zabezpieczenia z biblioteki ANALITYCZNEJ
        // koordynacji (np. EM_E2TANGO_600), a operacja modelu waliduje katalog MV
        // (przestrzeń ZABEZPIECZENIE). To NIE jest dług do scalenia katalogów:
        // oba zbiory mają różne role i tak zostaje (K9-B). Karta KD-3 dołożyła
        // brakujące ogniwo — JAWNE powiązanie pozycji kanonicznej z wpisem
        // biblioteki (`analytical_library_ref`), czytane przez readout krzywych
        // niżej. Pozycji spoza kanonu nadal nie wolno podstawiać: operacja by
        // ją odrzuciła (fabrykacja wyboru).
        const wKatalogu = (ref: string | null, lista: ReadonlyArray<{ id: string }>) =>
          ref && lista.some((t) => t.id === ref) ? ref : null;
        const wyposazenie = Object.fromEntries(
          pola.map((pole) => [
            pole.id,
            nowyWpisWyposazenia({
              ct_catalog_ref: wKatalogu(wypelnienie.ctRef, ctTypy),
              vt_catalog_ref: wKatalogu(wypelnienie.vtRef, vtTypy),
              relay_catalog_ref: wKatalogu(wypelnienie.przekaznikRef, przekazniki),
              relay_type: 'NADPRADOWY',
            }),
          ]),
        );
        return {
          ...p,
          template_id: wypelnienie.templateId,
          template_name: wypelnienie.templateName,
          station_type: stationType,
          catalog_ref: wypelnienie.transformerRef ?? p.catalog_ref,
          transformer_units: wypelnienie.transformerCount ?? p.transformer_units,
          outgoing_feeders_nn_count:
            wypelnienie.nnFeedersCount != null && wypelnienie.nnFeedersCount > 0
              ? wypelnienie.nnFeedersCount
              : p.outgoing_feeders_nn_count,
          pola,
          wyposazenie,
        };
      });
    } catch (e) {
      setBladSzablonow(e instanceof Error ? e.message : T.szablonBlad);
    }
  }, [
    aparatDomyslnyRoli,
    ctTypy,
    przekazniki,
    szablonyRola,
    szablonyWlasne,
    vtTypy,
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

  // Szybka ścieżka „stacja rekomendowana" (parytet legacy): auto-dobór
  // rekomendowanego transformatora i (dla źródła) pierwszego falownika, zapis skrótem.
  const onZapiszRekomendowana = useCallback(() => {
    const trafoRef = dane.catalog_ref ?? dobrane[0]?.id ?? null;
    const konwerterEff = isZrodlo ? konwerter ?? falowniki[0] ?? null : null;
    const daneEff: StacjaFormData = {
      ...dane,
      catalog_ref: trafoRef,
      source_converter_ref: konwerterEff?.id ?? dane.source_converter_ref,
    };
    void zapiszStacje(daneEff, konwerterEff);
  }, [dane, dobrane, falowniki, isZrodlo, konwerter, zapiszStacje]);

  const koniec = czyKoniecOdcinka(kontekst);
  const typLabel =
    T.typStacjiOpcje.find((o) => o.id === dane.station_type)?.etykieta ?? dane.station_type;
  const umiejscowienieLabel = koniec ? T.umiejscowienieKoniec : T.umiejscowieniePodzial;
  const konfiguracjaNnLabel =
    T.konfiguracjaNnOpcje.find((o) => o.id === dane.nn_configuration)?.etykieta ?? dane.nn_configuration;
  const nnVoltageLabel = isZrodlo
    ? konwerter
      ? fmtKv(konwerter.un_kv)
      : T.wymNnOczekuje
    : fmtKv(dane.nn_voltage_kv);
  const nnBlokKompletny = !isZrodlo || Boolean(konwerter);
  const protekcja = zabezpieczenieZrodla(dane);

  const wierszeGotowosci: WierszGotowosci[] = [
    { etykieta: T.wierszTyp, stan: 'kompletne', wartosc: typLabel },
    {
      etykieta: T.wierszUmiejscowienie,
      stan: kontekstOk ? 'kompletne' : 'brak',
      wartosc: kontekstOk ? umiejscowienieLabel : 'Do wskazania',
    },
    {
      etykieta: T.wierszTransformator,
      stan: dane.catalog_ref ? 'kompletne' : 'brak',
      wartosc: dane.catalog_ref ? fmtMva(params?.rated_power_mva) : 'Do doboru',
    },
    {
      etykieta: T.wierszRozdzielnica,
      stan: rozdzielnicaKompletna && aparaturaKompletna ? 'kompletne' : 'brak',
      wartosc:
        rozdzielnicaKompletna && aparaturaKompletna
          ? `${snFields.length} pól · ${selectedManufacturer?.name ?? dane.manufacturer_ref}`
          : 'Do doboru',
    },
    // KOMPLETNOSC-POLA-TR: stan pola transformatorowego W PANELU KONTROLI, czyli
    // widoczny z KAŻDEGO kroku — panel skutków w kroku pól zobaczy tylko ten, kto
    // do tego kroku wróci. `ostrzezenie` (nie `brak`), bo rezygnacja z pola jest
    // legalnym stanem roboczym: zapis pozostaje możliwy.
    {
      etykieta: T.wierszPoleTr,
      stan: brakPolaTransformatorowego ? 'ostrzezenie' : 'kompletne',
      wartosc: brakPolaTransformatorowego ? T.wierszPoleTrBrak : T.wierszPoleTrJest,
    },
    {
      etykieta: T.wierszNn,
      stan: nnBlokKompletny ? 'kompletne' : 'brak',
      wartosc: isZrodlo
        ? `${konfiguracjaNnLabel} · ${nnVoltageLabel}`
        : `${nnVoltageLabel} · ${ogranicznikOdplywow(dane.outgoing_feeders_nn_count)} odpł.`,
    },
  ];

  const aside = (
    <>
      <KreatorGotowosc tytul={T.kontrolaTytul} wiersze={wierszeGotowosci} testid="mvd-kreator-stacja-gotowosc" />
      <KreatorNastepnyKrok eyebrow={T.downstreamTytul} opis={T.downstreamOpis} />
    </>
  );

  const krokIndex = KROKI.findIndex((k) => k.id === krok);
  const rekomendowanyTrafoRef = dane.catalog_ref ?? dobrane[0]?.id ?? null;
  const zapisZablokowany =
    !kontekstOk
    || !activeCaseId
    || !rozdzielnicaKompletna
    || !aparaturaKompletna
    || !dane.catalog_ref
    || (isZrodlo && !konwerter);
  const szybkaZablokowana =
    !kontekstOk
    || !activeCaseId
    || !rozdzielnicaKompletna
    || !aparaturaKompletna
    || !rekomendowanyTrafoRef
    || (isZrodlo && falowniki.length === 0);
  const brakSzablonowKomunikat =
    !bladRozdzielnicy && Boolean(dane.manufacturer_ref) && szablonyWyboru.length === 0
      ? T.brakSzablonow
      : null;
  const rozdzielnicaBladStopka = !rozdzielnicaKompletna
    ? bladRozdzielnicy ?? (dane.manufacturer_ref ? T.brakSzablonow : T.brakProducenta)
    : !aparaturaKompletna
      ? bladAparatow ?? T.brakAparatow
      : null;
  const walidacjaStopka =
    bledy.length > 0
      ? T.walidacjaStopka
      : brakFalownikowKomunikat ?? brakDoboruKomunikat ?? rozdzielnicaBladStopka;

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
      walidacja={walidacjaStopka}
      akcjaGlowna={{ etykieta: T.zapisz, onClick: onZapisz, zablokowana: zapisZablokowany, testid: 'mvd-kreator-stacja-zapisz' }}
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
              opcje={KATEGORIE_SZABLONOW.map((id) => ({ id, etykieta: id.replace(/_/g, ' ') }))}
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
              disabled={!wybranySzablonId}
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
              wartosc={dane.catalog_ref ?? '—'}
            />
            <RzadWartosci
              etykieta={T.szablonOdplywy}
              wartosc={String(ogranicznikOdplywow(dane.outgoing_feeders_nn_count))}
            />
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
                  <RzadWartosci etykieta={T.umiejscowienieTerminal} wartosc={kontekst.endpointBusRef || '—'} />
                ) : (
                  <>
                    <RzadWartosci etykieta={T.umiejscowienieSegment} wartosc={kontekst.segmentId || '—'} />
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
                wartosc={String(dane.nn_voltage_kv)}
                onZmiana={(v) => zmien('nn_voltage_kv', Number(v))}
                opcje={isCustomNn ? T.nnVoltageCustomOpcje : T.nnVoltageOpcje}
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
            blad={bladDlaPola('catalog_ref')}
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
                  wartosc={dane.transformer_regulated_winding}
                  onZmiana={(v) =>
                    zmien(
                      'transformer_regulated_winding',
                      v as StacjaFormData['transformer_regulated_winding'],
                    )
                  }
                  opcje={T.zaczepyUzwojenieOpcje}
                  pomoc={T.zaczepyUzwojeniePomoc}
                  testid="mvd-kreator-stacja-zaczepy-uzwojenie"
                />
                <KreatorSiatka kolumny={2}>
                  <PoleLiczbowe
                    etykieta={T.zaczepyPozycjaMin}
                    wartosc={dane.transformer_tap_min_position}
                    onZmiana={(v) => zmien('transformer_tap_min_position', v ?? 0)}
                    krok={1}
                    testid="mvd-kreator-stacja-zaczepy-min"
                  />
                  <PoleLiczbowe
                    etykieta={T.zaczepyPozycjaMax}
                    wartosc={dane.transformer_tap_max_position}
                    onZmiana={(v) => zmien('transformer_tap_max_position', v ?? 0)}
                    krok={1}
                    testid="mvd-kreator-stacja-zaczepy-max"
                  />
                  <PoleLiczbowe
                    etykieta={T.zaczepyPozycjaNeutralna}
                    wartosc={dane.transformer_tap_neutral_position}
                    onZmiana={(v) => zmien('transformer_tap_neutral_position', v ?? 0)}
                    krok={1}
                    testid="mvd-kreator-stacja-zaczepy-neutralna"
                  />
                  <PoleLiczbowe
                    etykieta={T.zaczepyPozycjaBiezaca}
                    wartosc={dane.transformer_tap_current_position}
                    onZmiana={(v) => zmien('transformer_tap_current_position', v ?? 0)}
                    krok={1}
                    testid="mvd-kreator-stacja-zaczepy-biezaca"
                  />
                </KreatorSiatka>
                <PoleLiczbowe
                  etykieta={T.zaczepyKrok}
                  wartosc={dane.transformer_tap_step_percent}
                  onZmiana={(v) => zmien('transformer_tap_step_percent', v ?? 0)}
                  krok={0.25}
                  min={0}
                  pomoc={T.zaczepyKrokPomoc}
                  testid="mvd-kreator-stacja-zaczepy-krok"
                />
                <RzadWartosci
                  etykieta={T.zaczepyTytul}
                  wartosc={T.zaczepyZakres(
                    dane.transformer_tap_min_position,
                    dane.transformer_tap_max_position,
                    dane.transformer_tap_step_percent,
                  )}
                />
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
              blad={bladDlaPola('manufacturer_ref')}
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
                  onClick={przywrocPoleTransformatorowe}
                  data-testid="mvd-kreator-stacja-przywroc-pole-tr"
                >
                  {T.polaPrzywrocTr}
                </button>
              )}
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
                tytul={`${index + 1}. ${FIELD_ROLE_LABELS[pole.field_role] ?? pole.field_role}`}
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
                      wartosc={FIELD_ROLE_LABELS[pole.field_role] ?? pole.field_role}
                      testid={`mvd-kreator-stacja-pole-rola-${index + 1}`}
                    />
                  ) : (
                    <PoleWyboru
                      etykieta={T.polaRola}
                      wartosc={pole.field_role}
                      onZmiana={(v) => zmienPole(pole.id, { field_role: v as SnFieldRole })}
                      opcje={ROLE_POL.map((rola) => ({
                        id: rola,
                        etykieta: FIELD_ROLE_LABELS[rola] ?? rola,
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
                      etykieta: templateOptionLabel(t, pole.field_role),
                    }))}
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
              producent={selectedManufacturer?.name ?? dane.manufacturer_ref}
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
                  tytul={`${index + 1}. ${FIELD_ROLE_LABELS[pole.field_role] ?? pole.field_role}`}
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
                      placeholder={T.polePlaceholder}
                      pomoc={T.pomiarCtPomoc}
                      komunikatBledu={bladPomiaru ?? T.pomiarKatalogBlad}
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
                      placeholder={T.polePlaceholder}
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
                      placeholder={T.polePlaceholder}
                      pomoc={T.pomiarPrzekaznikPomoc}
                      komunikatBledu={bladPomiaru ?? T.pomiarKatalogBlad}
                      testid={`mvd-kreator-stacja-przekaznik-${index + 1}`}
                    />
                    <PoleWyboru
                      etykieta={T.pomiarRodzaj}
                      wartosc={wpis?.relay_type ?? RODZAJE_ZABEZPIECZEN[0]}
                      onZmiana={(v) => zmienWyposazenie(pole.id, { relay_type: v })}
                      opcje={T.pomiarRodzajOpcje}
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
                      <PoleWyboru
                        etykieta={KRYTERIA_STRINGS.vtUzwojenie}
                        wartosc={wpis.vt_uzwojenie}
                        onZmiana={(v) =>
                          zmienWyposazenie(pole.id, {
                            vt_uzwojenie: v as 'POMIAROWE' | 'ZABEZPIECZENIOWE',
                          })
                        }
                        opcje={KRYTERIA_STRINGS.vtUzwojenieOpcje.map((o) => ({
                          id: o.id,
                          etykieta: o.etykieta,
                        }))}
                        testid={`mvd-kreator-stacja-vt-uzwojenie-${index + 1}`}
                      />
                    </>
                  ) : null}
                  <SekcjaBilansuCtVt
                    ctRef={wpis?.ct_catalog_ref ?? null}
                    vtRef={wpis?.vt_catalog_ref ?? null}
                    obwodCt={{
                      dlugosc_m: wpis?.ct_dlugosc_m ?? null,
                      przekroj_mm2: wpis?.ct_przekroj_mm2 ?? null,
                      moc_aparatow_va: wpis?.ct_moc_aparatow_va ?? null,
                    }}
                    obwodVt={{
                      dlugosc_m: wpis?.vt_dlugosc_m ?? null,
                      przekroj_mm2: wpis?.vt_przekroj_mm2 ?? null,
                      moc_aparatow_va: wpis?.vt_moc_aparatow_va ?? null,
                    }}
                    uzwojenieVt={wpis?.vt_uzwojenie ?? 'POMIAROWE'}
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
            onZmiana={(v) => zmien('outgoing_feeders_nn_count', v ?? 1)}
            krok={1}
            min={1}
            max={8}
            pomoc={T.liczbaOdplywowPomoc}
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
                testid="mvd-kreator-stacja-pw-moc"
              />
              <PoleTekstowe
                etykieta={T.potrzebyWlasneCosphi}
                wartosc={dane.station_auxiliary_cosphi}
                onZmiana={(v) => zmien('station_auxiliary_cosphi', v)}
                placeholder="0,95"
                pomoc={T.potrzebyWlasneCosphiPomoc}
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
            wartosc={dane.nn_earthing_system}
            opcje={T.uziemienieUkladOpcje}
            onZmiana={(v) => zmien('nn_earthing_system', v as StacjaFormData['nn_earthing_system'])}
            pomoc={T.uziemienieUkladPomoc}
            testid="mvd-kreator-stacja-uklad-nn"
          />
          <PoleWyboru
            etykieta={T.uziemieniePunkt}
            wartosc={dane.neutral_point}
            opcje={T.uziemieniePunktOpcje}
            onZmiana={(v) => zmien('neutral_point', v as StacjaFormData['neutral_point'])}
            pomoc={T.uziemieniePunktPomoc}
            testid="mvd-kreator-stacja-punkt-neutralny"
          />
          {punktImpedancyjny ? (
            <PoleTekstowe
              etykieta={T.uziemienieRezystancja}
              wartosc={dane.neutral_r_ohm}
              onZmiana={(v) => zmien('neutral_r_ohm', v)}
              placeholder={T.uziemienieRezystancjaPlaceholder}
              pomoc={T.uziemienieRezystancjaPomoc}
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
              testid="mvd-kreator-stacja-insert-at"
            />
          ) : null}
          <div className="mvd-kreator-stopka-nawigacja">
            <button
              type="button"
              className="mvd-kreator-btn mvd-kreator-btn--glowna"
              disabled={!kontekstOk || !activeCaseId || podgladStan === 'loading'}
              onClick={() => void przeliczPodglad()}
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
                disabled={!nazwaWlasnegoSzablonu.trim()}
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
            <KreatorSiatka kolumny={2}>
              <RzadWartosci etykieta={T.podgladStacja} wartosc={podglad.stationRef ?? '—'} />
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
          ) : null}
        </KreatorSekcja>
      ) : null}

      {krok === 'zapis' ? (
        <KreatorSekcja tytul={T.krokZapis} testid="mvd-kreator-stacja-zapis">
          <KreatorInfo>{T.downstreamOpis}</KreatorInfo>
          <KreatorSiatka kolumny={2}>
            <RzadWartosci etykieta={T.podsumTyp} wartosc={typLabel} />
            <RzadWartosci etykieta={T.podsumUmiejscowienie} wartosc={kontekstOk ? umiejscowienieLabel : 'Do wskazania'} />
            <RzadWartosci etykieta={T.podsumTransformator} wartosc={fmtMva(params?.rated_power_mva)} />
            <RzadWartosci
              etykieta={T.podsumRozdzielnica}
              wartosc={
                rozdzielnicaKompletna
                  ? `${selectedManufacturer?.name ?? dane.manufacturer_ref} · ${snFields.length} pól`
                  : 'Do doboru'
              }
            />
            <RzadWartosci etykieta={T.podsumNnKonfiguracja} wartosc={konfiguracjaNnLabel} />
            <RzadWartosci
              etykieta={T.podsumNn}
              wartosc={`${nnVoltageLabel} · ${ogranicznikOdplywow(dane.outgoing_feeders_nn_count)} odpł.`}
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

          <KreatorSekcja tytul={T.szybkaTytul} testid="mvd-kreator-stacja-szybka">
            <KreatorInfo>{T.szybkaOpis}</KreatorInfo>
            <button
              type="button"
              className="mvd-kreator-btn mvd-kreator-btn--glowna"
              disabled={szybkaZablokowana}
              onClick={onZapiszRekomendowana}
              data-testid="mvd-kreator-stacja-szybka-zapisz"
            >
              {T.szybkaZapisz}
            </button>
            {szybkaZablokowana ? (
              <KreatorInfo testid="mvd-kreator-stacja-szybka-niedostepna">{T.szybkaNiedostepna}</KreatorInfo>
            ) : null}
          </KreatorSekcja>
        </KreatorSekcja>
      ) : null}
    </KreatorRama>
  );
}
