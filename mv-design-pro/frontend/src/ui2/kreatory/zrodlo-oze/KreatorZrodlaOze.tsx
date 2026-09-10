/**
 * Kreator „Dodaj źródło OZE/DER" (add_converter_source) — ui2, kreatory/rama, opcja MAX.
 *
 * Katalog-first (falownik PV/BESS/FW); tryb regulacji (Q(U)/cosφ) realnie zasila kanoniczny
 * rozpływ mocy falownika (V12K-052). Zapis = operacja domenowa `add_converter_source`.
 * ZERO fizyki w UI. Zastępuje legacy `AddConverterSourceForm` (kontrakt payloadu 1:1).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { fetchConverterTypes, fetchLvApparatusTypes, getCatalogErrorMessage } from '../../../ui/catalog/api';
import type { ConverterType, LVApparatusType } from '../../../ui/catalog/types';
import {
  listNnFeederOptions,
  listSnBusOptions,
  resolveBusNnRef,
  resolveBusSnRef,
  resolveStationRef,
  stationLabel,
} from '../../../ui/network-build/forms/enmResolvers';
import {
  DerPersistenceApiError,
  patchDerCatalogBindings,
} from '../../../ui/sld/v2/canvas/derPersistenceApi';
import { useActiveOperationContext, useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
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
  TekstZWzorami,
  useSelekcjaPoOperacji,
  type KrokKreatora,
  type WierszGotowosci,
} from '../rama';
import {
  BESS_OPCJE,
  DANE_DER_SN_DOMYSLNE,
  DANE_DOMYSLNE,
  REGULACJA_OPCJE,
  SUGEROWANE,
  TECHNOLOGIA_OPCJE,
  TECHNOLOGIE,
  WARIANT_OPCJE,
  bessLabel,
  etykietaKonwertera,
  maKontekst,
  regulacjaLabel,
  refUtworzonegoWytworcy,
  sugerujDerSn,
  technologiaLabel,
  transformatoryBlokowe,
  trybQWymagaWartosci,
  walidujFormularz,
  wariantLabel,
  zbudujDerTopology,
  zbudujLimityBierne,
  zbudujPayload,
  zbudujWiazaniaDer,
  type BladPolaOze,
  type DerSnFormData,
  type EtapSekwencjiZapisu,
  type KontekstOze,
  type OzeFormData,
  type TechnologiaOze,
  type TransformatorBlokowy,
  type TrybBess,
  type TrybRegulacji,
  type WariantPrzylaczenia,
} from './zrodloOzeModel';
import {
  fetchNcRfgOperators,
  getNcRfgOperator,
  type NcRfgOperatorItem,
} from '../../../ui/network-build/station-der';
import { DoborToruSn } from './DoborToruSn';
import { KrokAparatura, KrokZgodnosc } from './KrokiAparaturaZgodnosc';
import { GotowoscDer } from './GotowoscDer';
import type { SourceOperatingMode } from '../../../types/domainOps';
import { PodsumowanieAutoBieg } from './PodsumowanieAutoBieg';
import { zastosujPropozycje } from './zrodloOzeDobor';
import type {
  CableLayingConditions,
  DerSelectionPreviewResponse,
} from './derSelectionApi';
import {
  fetchListaMaterialowa,
  fetchRaportZgodnosci,
  uruchomAutoBieg,
  type ListaMaterialowa,
  type RaportZgodnosci,
} from './podsumowanieApi';
import { OZE_STRINGS as T, PODSUMOWANIE_STRINGS as P } from './strings';
import { CharakterystykaNcRfg } from './WykresyNcRfg';
import { useShellStore } from '../../shell/useShellStore';
import type { RunStatus } from '../../../ui/study-cases/types';

type FazaPodsumowania = 'formularz' | 'bieg' | 'dokumenty' | 'gotowe';

// Krok „dobor" (dobór toru SN z katalogu) wchodzi po „katalog" tylko dla wariantu
// z transformatorem blokowym (tor materializowany po stronie SN). K9-A: po doborze
// wchodzą kroki „aparatura" (wiązania aparaturowe) i „zgodnosc" (profile NC RfG).
function zbudujKroki(zTorem: boolean): readonly KrokKreatora[] {
  const kroki: KrokKreatora[] = [
    { id: 'tech', tytul: T.krokTechnologia },
    { id: 'katalog', tytul: T.krokKatalog },
  ];
  if (zTorem) kroki.push({ id: 'dobor', tytul: T.krokDobor });
  kroki.push({ id: 'aparatura', tytul: T.krokAparatura });
  kroki.push({ id: 'zgodnosc', tytul: T.krokZgodnosc });
  kroki.push({ id: 'regulacja', tytul: T.krokRegulacja });
  kroki.push({ id: 'zapis', tytul: T.krokZapis });
  return kroki;
}

const OPCJE_TECH = TECHNOLOGIA_OPCJE.map((o) => ({ id: o.value, etykieta: o.label }));
const OPCJE_WARIANT = WARIANT_OPCJE.map((o) => ({ id: o.value, etykieta: o.label }));
// Karta CV-4.1b (A3-04): pełna lista `REGULACJA_OPCJE` (import zamiast stałej modułowej)
// jest bramkowana profilem NC RfG per-render — patrz `opcjeRegulacjaDostepne` w komponencie.
const OPCJE_BESS = BESS_OPCJE.map((o) => ({ id: o.value, etykieta: o.label }));
const OPCJE_UMIEJSCOWIENIE = [
  { id: 'NEW_FIELD', etykieta: T.umiejscowienieNowe },
  { id: 'EXISTING_FIELD', etykieta: T.umiejscowienieIstniejace },
];
// K9-A O5: słownik trybów pracy źródła (1:1 z kontraktem odczytu pola) + pusty
// wybór „bez wskazania" (operacja trybu jest wtedy pomijana — uczciwy stan zerowy).
const OPCJE_TRYB_PRACY = [{ id: '', etykieta: T.trybPracyBrak }, ...T.trybPracyOpcje];

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

type StanKataloguNcRfg = 'ladowanie' | 'gotowy' | 'blad';
type DostepnoscTrybu = 'tak' | 'nie' | 'nieznana';

export function KreatorZrodlaOze() {
  const context = useActiveOperationContext() as Record<string, unknown> | null;
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const selekcjaPoOperacji = useSelekcjaPoOperacji();
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const activeProjectId = useAppStateStore((s) => s.activeProjectId);
  const setActiveSpace = useShellStore((s) => s.setActiveSpace);

  const kontekst = useMemo<KontekstOze>(() => {
    const ctx = context ?? undefined;
    const stationRef = resolveStationRef(ctx, snapshot) ?? undefined;
    const busRef = resolveBusNnRef(ctx, snapshot) ?? undefined;
    return {
      station_ref: stationRef,
      station_label: stationRef ? stationLabel(snapshot, stationRef) : undefined,
      bus_nn_ref: busRef,
      existing_field_ref: trimmed(context?.existing_field_ref) || undefined,
    };
  }, [context, snapshot]);
  const hasKontekst = maKontekst(kontekst);

  // Transformatory blokowe stacji (kandydaci do wariantu block_transformer).
  const transformatory = useMemo<TransformatorBlokowy[]>(() => {
    if (!snapshot || !kontekst.station_ref) return [];
    const station = snapshot.substations?.find(
      (s) => s.ref_id === kontekst.station_ref || s.id === kontekst.station_ref,
    );
    if (!station) return [];
    const refs = new Set(station.transformer_refs ?? []);
    const list = (snapshot.transformers ?? [])
      .filter((t) => refs.has(t.ref_id) && Boolean(t.lv_bus_ref))
      .map((t) => ({
        ref_id: t.ref_id,
        name: t.name,
        lv_bus_ref: t.lv_bus_ref as string,
        sn_mva: t.sn_mva,
        uhv_kv: t.uhv_kv ?? null,
        ulv_kv: t.ulv_kv ?? null,
      }));
    return transformatoryBlokowe(list);
  }, [snapshot, kontekst.station_ref]);

  const [dane, setDane] = useState<OzeFormData>(() => ({ ...DANE_DOMYSLNE }));
  const [bledy, setBledy] = useState<BladPolaOze[]>([]);
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);
  const [krok, setKrok] = useState<string>('tech');

  // D2: tor DER-SN materializowany doborem (der_topology). `derSnZastosowany` = użytkownik
  // zastosował propozycję → payload materializuje tor zamiast wiązać istniejący TR.
  const [derSn, setDerSn] = useState<DerSnFormData>(() => ({ ...DANE_DER_SN_DOMYSLNE }));
  const [derSnZastosowany, setDerSnZastosowany] = useState(false);

  const [konwertery, setKonwertery] = useState<ConverterType[]>([]);
  const [aparaty, setAparaty] = useState<LVApparatusType[]>([]);
  const [bladKatalogu, setBladKatalogu] = useState<string | null>(null);
  // R5 (karta FAB-K, wzorzec E2E-S95): katalog przekształtników/aparatury nN
  // ładuje się asynchronicznie (`fetchConverterTypes`/`fetchLvApparatusTypes`
  // niżej) — bez tej flagi `stanGotowosci` nie mógłby odróżnić „katalog jeszcze
  // w locie" od „katalog odpowiedział pustą listą".
  const [katalogLadowanie, setKatalogLadowanie] = useState(true);

  // D4: auto-bieg obliczeń po zapisie + raport zgodności + BOM (opt-in, domyślnie tak).
  const [autoBieg, setAutoBieg] = useState(true);
  const [zapiszDoMagazynu, setZapiszDoMagazynu] = useState(true);
  const [faza, setFaza] = useState<FazaPodsumowania>('formularz');
  const [runStatus, setRunStatus] = useState<RunStatus | null>(null);
  const [raport, setRaport] = useState<RaportZgodnosci | null>(null);
  const [bom, setBom] = useState<ListaMaterialowa | null>(null);
  // K9-A: przebieg sekwencji zapisu (uczciwie: co zapisane, co padło, co pominięte)
  // + ref utworzonego wytwórcy dla readoutu osi gotowości.
  const [sekwencja, setSekwencja] = useState<EtapSekwencjiZapisu[]>([]);
  const [generatorRef, setGeneratorRef] = useState<string | null>(null);
  // Odpowiedź zapisu do wiązania ze schematem przy ZAKOŃCZENIU kreatora: selekcja
  // wytwórcy w trakcie otwartego kreatora uruchamia nawigację do konfiguratora
  // źródła (orkiestrator tras), która zastępuje powierzchnię kreatora — podsumowanie
  // po zapisie ginęło. Selekcję i wycentrowanie wykonujemy przy „Zakończ".
  const [odpowiedzZapisu, setOdpowiedzZapisu] = useState<Parameters<typeof selekcjaPoOperacji>[0]>(null);

  useEffect(() => {
    let cancelled = false;
    setBladKatalogu(null);
    setKatalogLadowanie(true);
    Promise.all([fetchConverterTypes(), fetchLvApparatusTypes()])
      .then(([conv, apar]) => {
        if (cancelled) return;
        setKonwertery(Array.isArray(conv) ? conv : []);
        setAparaty(Array.isArray(apar) ? apar : []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setKonwertery([]);
        setAparaty([]);
        setBladKatalogu(getCatalogErrorMessage(e));
      })
      .finally(() => {
        if (cancelled) return;
        setKatalogLadowanie(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tech = TECHNOLOGIE[dane.source_technology];
  const konwerteryTech = useMemo(
    () => konwertery.filter((c) => c.kind === tech.catalogKind),
    [konwertery, tech.catalogKind],
  );
  const wybranyKonwerter = useMemo(
    () => (dane.converter_catalog_ref ? konwerteryTech.find((c) => c.id === dane.converter_catalog_ref) ?? null : null),
    [dane.converter_catalog_ref, konwerteryTech],
  );
  const wybranyTransformator = useMemo(
    () => transformatory.find((t) => t.ref_id === dane.blocking_transformer_ref) ?? null,
    [transformatory, dane.blocking_transformer_ref],
  );

  const opcjeKonwertery = useMemo(
    () => konwerteryTech.map((c) => ({ id: c.id, etykieta: etykietaKonwertera(c) })),
    [konwerteryTech],
  );
  const opcjeAparaty = useMemo(
    () => aparaty.map((a) => ({ id: a.id, etykieta: `${a.name} · Un ${a.u_n_kv} kV · In ${a.i_n_a} A` })),
    [aparaty],
  );
  const opcjeTransformatory = useMemo(
    () =>
      transformatory.map((t) => ({
        id: t.ref_id,
        etykieta: `${t.name} · ${t.sn_mva.toFixed(3)} MVA`,
      })),
    [transformatory],
  );

  const isBlock = dane.connection_variant === 'block_transformer';
  const KROKI = useMemo(() => zbudujKroki(isBlock), [isBlock]);

  // Karta CV-4.1b (A3-04): pozycja „regulacja napięcia (U = const)" widoczna WYŁĄCZNIE,
  // gdy profil operatora (krok „Zgodność przyłączeniowa", `dane.nc_rfg_profile_ref`)
  // dopuszcza `voltage_control` w `reactive_power.voltage_control_modes` — kontrakt
  // backendu (`GET /api/ncrfg-tests/catalog`), zero drugiej kopii katalogu w froncie.
  // Pobranie WPROST (nie hak React Query `useNcRfgOperatorCatalog`) — ten sam wzorzec
  // co `KrokZgodnosc` (`KrokiAparaturaZgodnosc.tsx`): kreator nie jest osadzony pod
  // `QueryClientProvider` we wszystkich miejscach montowania. Pobranie BRAMKOWANE
  // dotarciem do kroku „zgodność"/„regulacja" (nie na starcie kreatora) — `KrokZgodnosc`
  // bramkuje swoje IDENTYCZNE pobranie samym montowaniem warunkowym (`krok === 'zgodnosc'
  // ? <KrokZgodnosc/> : null`); tu dane są potrzebne na poziomie rodzica (opcje selecta
  // trybu), więc bramka jest jawna w zależnościach efektu, nie w montowaniu. Bez tej
  // bramki efekt odpalał się na KAŻDYM montowaniu kreatora (także testy, które nigdy nie
  // docierają do kroku regulacji) i zostawiał nierozstrzygniętą aktualizację stanu poza
  // `act()` w testach synchronicznych renderujących tylko krok początkowy.
  const potrzebujeKatalNcRfgRegulacji =
    krok === 'zgodnosc' || krok === 'regulacja' || krok === 'zapis';
  const [ncRfgOperatorzyRegulacja, setNcRfgOperatorzyRegulacja] = useState<NcRfgOperatorItem[]>([]);
  const [stanKataloguNcRfg, setStanKataloguNcRfg] = useState<StanKataloguNcRfg>('ladowanie');
  useEffect(() => {
    if (!potrzebujeKatalNcRfgRegulacji) return;
    let cancelled = false;
    setStanKataloguNcRfg('ladowanie');
    fetchNcRfgOperators()
      .then((operatorzy) => {
        if (cancelled) return;
        setNcRfgOperatorzyRegulacja(Array.isArray(operatorzy) ? [...operatorzy] : []);
        setStanKataloguNcRfg('gotowy');
      })
      .catch(() => {
        if (cancelled) return;
        setNcRfgOperatorzyRegulacja([]);
        setStanKataloguNcRfg('blad');
      });
    return () => {
      cancelled = true;
    };
  }, [potrzebujeKatalNcRfgRegulacji]);
  const profilNcRfgRegulacja = useMemo(
    () => getNcRfgOperator(ncRfgOperatorzyRegulacja, dane.nc_rfg_profile_ref),
    [ncRfgOperatorzyRegulacja, dane.nc_rfg_profile_ref],
  );
  // Dopuszczalność trybu REGULACJA_NAPIECIA jest ZNANA wyłącznie, gdy katalog operatorów
  // NC RfG jest pobrany I profil wybrany; katalog w trakcie pobierania, błąd pobrania
  // albo brak profilu = 'nieznana'. Stan nieznany NIE zmienia danych użytkownika —
  // poprzedni cichy reset przy pustej liście operatorów był fallbackiem klasy A6-12
  // (wybrany tryb znikał przed nadejściem odpowiedzi katalogu albo po jej błędzie).
  // Wyrocznią dopuszczalności dla MODELU jest walidator ENM
  // (`generators.voltage_control_profile_missing` / `..._not_permitted`), nie UI.
  const dostepnoscRegulacjiNapiecia: DostepnoscTrybu = useMemo(() => {
    if (stanKataloguNcRfg !== 'gotowy' || !profilNcRfgRegulacja) return 'nieznana';
    return profilNcRfgRegulacja.reactive_power.voltage_control_modes.includes('voltage_control')
      ? 'tak'
      : 'nie';
  }, [stanKataloguNcRfg, profilNcRfgRegulacja]);
  // Opcja widoczna, gdy dopuszczalność jest znana i dodatnia (fail-closed bez profilu)
  // ALBO gdy jest już wybrana przy dopuszczalności nieznanej — select nigdy nie pokazuje
  // wartości spoza listy (zero stanu fantomowego w obie strony).
  const opcjeRegulacjaDostepne = useMemo(
    () =>
      REGULACJA_OPCJE.filter(
        (o) =>
          o.value !== 'REGULACJA_NAPIECIA' ||
          dostepnoscRegulacjiNapiecia === 'tak' ||
          (dostepnoscRegulacjiNapiecia === 'nieznana' && dane.control_mode === 'REGULACJA_NAPIECIA'),
      ).map((o) => ({ id: o.value, etykieta: o.label })),
    [dostepnoscRegulacjiNapiecia, dane.control_mode],
  );
  const [komunikatRegulacjiNapiecia, setKomunikatRegulacjiNapiecia] = useState<string | null>(null);
  // Predykat PAROWY: ten sam warunek 'nie' rządzi zniknięciem opcji i cofnięciem wyboru —
  // profil, który cofnął dopuszczenie, cofa tryb na „Bez regulacji" Z WIDOCZNYM
  // komunikatem (nigdy po cichu); stan nieznany zostawia wybór użytkownika nietknięty.
  useEffect(() => {
    if (dane.control_mode === 'REGULACJA_NAPIECIA' && dostepnoscRegulacjiNapiecia === 'nie') {
      setDane((d) => ({ ...d, control_mode: 'WYLACZONE', u_set_pu: null }));
      setKomunikatRegulacjiNapiecia(
        T.regulacjaNapieciaCofnieta(
          profilNcRfgRegulacja?.operator_name_pl ?? dane.nc_rfg_profile_ref ?? '',
        ),
      );
    }
  }, [dane.control_mode, dostepnoscRegulacjiNapiecia, profilNcRfgRegulacja, dane.nc_rfg_profile_ref]);

  // Szyna SN stacji (punkt przyłączenia toru DER-SN) + jej napięcie — z realnego snapshotu.
  const snBusRef = useMemo(
    () => resolveBusSnRef((context ?? undefined) as Record<string, unknown> | undefined, snapshot),
    [context, snapshot],
  );
  const snBusVoltageKv = useMemo(() => {
    if (!snBusRef) return null;
    const opcja = listSnBusOptions(snapshot, kontekst.station_ref).find((b) => b.ref_id === snBusRef);
    return opcja?.voltage_kv ?? null;
  }, [snapshot, kontekst.station_ref, snBusRef]);

  // K9-A O12: istniejące pola odpływowe nN rozdzielni — wybór dla umiejscowienia
  // „istniejące pole" (operacja czyta existing_field_ref).
  const polaOdplywowe = useMemo(
    () => listNnFeederOptions(snapshot, kontekst.station_ref, kontekst.bus_nn_ref),
    [snapshot, kontekst.station_ref, kontekst.bus_nn_ref],
  );
  const opcjePolOdplywowych = useMemo(
    () => polaOdplywowe.map((p) => ({ id: p.ref_id, etykieta: p.name })),
    [polaOdplywowe],
  );

  const zmien = useCallback(<K extends keyof OzeFormData>(pole: K, wartosc: OzeFormData[K]) => {
    setDane((p) => ({ ...p, [pole]: wartosc }));
  }, []);

  const zmienDlugoscKabla = useCallback((v: number | null) => {
    setDerSn((p) => ({ ...p, mv_cable_length_km: v }));
  }, []);

  const zmienGrupePolaczen = useCallback((v: string) => {
    setDerSn((p) => ({ ...p, block_transformer_vector_group: v || null }));
  }, []);

  // V12K-207 (karta F-K7): warunki ułożenia kabla jadą DO MODELU razem z torem —
  // raport zgodności liczy potem propozycję dla tego samego założenia.
  const zmienWarunkiUlozenia = useCallback((v: CableLayingConditions | null) => {
    setDerSn((p) => ({ ...p, mv_cable_laying_conditions: v }));
  }, []);

  const onZastosujDobor = useCallback(
    (response: DerSelectionPreviewResponse) => {
      setDerSn((p) => zastosujPropozycje(p, response));
      setDerSnZastosowany(true);
    },
    [],
  );

  const zmienTechnologie = useCallback((v: TechnologiaOze) => {
    // Zmiana technologii → inny katalog; wyczyść wybór falownika.
    setDane((p) => ({ ...p, source_technology: v, converter_catalog_ref: null }));
  }, []);

  // Krok „dobor" istnieje tylko dla wariantu blokowego — po zmianie na nN wróć do „katalog".
  useEffect(() => {
    if (!isBlock && krok === 'dobor') setKrok('katalog');
  }, [isBlock, krok]);

  const bladDlaPola = (pole: string): string | undefined => bledy.find((b) => b.field === pole)?.message;

  // Tor SN materializowany doborem: użytkownik zastosował propozycję i mamy szynę SN.
  const materializowanyTorSn = isBlock && derSnZastosowany && Boolean(snBusRef);

  const onZapisz = useCallback(async () => {
    if (!hasKontekst) {
      setBladGlobalny(T.brakStacjiOpis);
      return;
    }
    const walid = walidujFormularz(dane, kontekst, { torSnMaterializowany: materializowanyTorSn });
    setBledy(walid);
    if (walid.length > 0) return;
    if (!wybranyKonwerter) {
      setBledy([{ field: 'converter_catalog_ref', message: T.katalogPlaceholder }]);
      return;
    }
    if (!activeCaseId) {
      setBladGlobalny(T.brakZakresu);
      return;
    }
    setBladGlobalny(null);
    try {
      const derTopology =
        materializowanyTorSn && snBusRef
          ? zbudujDerTopology(sugerujDerSn(derSn, wybranyKonwerter, snBusVoltageKv), snBusRef)
          : null;
      const payload = zbudujPayload(dane, kontekst, wybranyKonwerter, wybranyTransformator, derTopology);
      const response = await executeDomainOperation(activeCaseId, 'add_converter_source', payload);
      if (!response) {
        setBladGlobalny(useSnapshotStore.getState().error ?? T.walidacjaStopka);
        return;
      }
      if (response.error) {
        setBladGlobalny(response.error);
        return;
      }
      // Wiązanie ze schematem (selekcja + centrowanie) dopiero przy „Zakończ" —
      // selekcja wytwórcy przy otwartym kreatorze zastępuje jego powierzchnię
      // konfiguratorem źródła (nawigacja orkiestratora tras po typie selekcji).
      setOdpowiedzZapisu(response);
      setKrok('zapis');

      // K9-A §0.4: SEKWENCJA operacji po utworzeniu elementu — wiązania aparaturowe
      // i profile, tryb pracy, limity mocy biernej. Model nie zapewnia atomowości,
      // więc każdy etap raportujemy osobno (co zapisane, co padło, co pominięte).
      // Ref WYTWÓRCY (nie wskazania selekcji — to może być pole): operacje sekwencji
      // działają na generatorze.
      const nowyRef = refUtworzonegoWytworcy(response);
      setGeneratorRef(nowyRef);
      const etapy: EtapSekwencjiZapisu[] = [
        { id: 'zrodlo', etykieta: T.sekwencjaKrokZrodlo, stan: 'zapisane' },
      ];

      const wiazania = zbudujWiazaniaDer(dane);
      if (!wiazania) {
        etapy.push({ id: 'wiazania', etykieta: T.sekwencjaKrokWiazania, stan: 'pominiete' });
      } else if (!nowyRef || !activeProjectId) {
        etapy.push({
          id: 'wiazania',
          etykieta: T.sekwencjaKrokWiazania,
          stan: 'blad',
          komunikat: activeProjectId ? T.walidacjaStopka : T.brakProjektu,
        });
      } else {
        try {
          await patchDerCatalogBindings(activeProjectId, activeCaseId, nowyRef, wiazania);
          etapy.push({ id: 'wiazania', etykieta: T.sekwencjaKrokWiazania, stan: 'zapisane' });
        } catch (bladWiazan) {
          etapy.push({
            id: 'wiazania',
            etykieta: T.sekwencjaKrokWiazania,
            stan: 'blad',
            komunikat:
              bladWiazan instanceof DerPersistenceApiError || bladWiazan instanceof Error
                ? bladWiazan.message
                : T.walidacjaStopka,
          });
        }
      }

      if (!dane.operating_mode) {
        etapy.push({ id: 'tryb', etykieta: T.sekwencjaKrokTryb, stan: 'pominiete' });
      } else if (!nowyRef) {
        etapy.push({ id: 'tryb', etykieta: T.sekwencjaKrokTryb, stan: 'blad', komunikat: T.walidacjaStopka });
      } else {
        const odpTryb = await executeDomainOperation(activeCaseId, 'set_source_operating_mode', {
          source_ref: nowyRef,
          mode: dane.operating_mode,
        });
        etapy.push(
          !odpTryb || odpTryb.error
            ? {
                id: 'tryb',
                etykieta: T.sekwencjaKrokTryb,
                stan: 'blad',
                komunikat: odpTryb?.error ?? useSnapshotStore.getState().error ?? T.walidacjaStopka,
              }
            : { id: 'tryb', etykieta: T.sekwencjaKrokTryb, stan: 'zapisane' },
        );
      }

      const limity = zbudujLimityBierne(dane);
      if (!limity) {
        etapy.push({ id: 'limity', etykieta: T.sekwencjaKrokLimity, stan: 'pominiete' });
      } else if (!nowyRef) {
        etapy.push({ id: 'limity', etykieta: T.sekwencjaKrokLimity, stan: 'blad', komunikat: T.walidacjaStopka });
      } else {
        const odpLimity = await executeDomainOperation(activeCaseId, 'update_element_parameters', {
          element_ref: nowyRef,
          parameters: { limits: limity },
        });
        etapy.push(
          !odpLimity || odpLimity.error
            ? {
                id: 'limity',
                etykieta: T.sekwencjaKrokLimity,
                stan: 'blad',
                komunikat: odpLimity?.error ?? useSnapshotStore.getState().error ?? T.walidacjaStopka,
              }
            : { id: 'limity', etykieta: T.sekwencjaKrokLimity, stan: 'zapisane' },
        );
      }
      setSekwencja(etapy);

      // D4 (wymaganie 12+13+BOM): auto-bieg (LF + SC) po zapisie + raport zgodności + BOM.
      // Bez fizyki w UI — bieg reużywa mechanizmu przebiegów, dokumenty liczy backend.
      let status: RunStatus | null = null;
      if (autoBieg) {
        setFaza('bieg');
        status = await uruchomAutoBieg(activeCaseId);
        setRunStatus(status);
      }
      setFaza('dokumenty');
      const opcjeStore = { projectId: activeProjectId, zapiszDoMagazynu };
      const [raportView, bomView] = await Promise.all([
        fetchRaportZgodnosci(activeCaseId, { ...opcjeStore, runStatus: status }),
        fetchListaMaterialowa(activeCaseId, opcjeStore),
      ]);
      setRaport(raportView);
      setBom(bomView);
      setFaza('gotowe');
    } catch (e) {
      setFaza('formularz');
      setBladGlobalny(e instanceof Error ? e.message : P.bladDokumentow);
    }
  }, [activeCaseId, activeProjectId, autoBieg, dane, derSn, executeDomainOperation, hasKontekst, kontekst, materializowanyTorSn, selekcjaPoOperacji, snBusRef, snBusVoltageKv, wybranyKonwerter, wybranyTransformator, zapiszDoMagazynu]);

  const otworzDokumentacje = useCallback(() => {
    setActiveSpace('dokumentacja');
    closeForm();
  }, [closeForm, setActiveSpace]);

  // „Zakończ" = zamknięcie kreatora + wiązanie ze schematem (V12K-073): selekcja
  // nowego wytwórcy, wycentrowanie, powrót na schemat. Wykonywane PO zamknięciu
  // formularza, żeby nawigacja po selekcji nie zastępowała powierzchni kreatora.
  const zakonczPoZapisie = useCallback(() => {
    closeForm();
    selekcjaPoOperacji(odpowiedzZapisu, {
      type: 'Generator',
      name: dane.source_name.trim() || 'Źródło OZE',
    });
  }, [closeForm, dane.source_name, odpowiedzZapisu, selekcjaPoOperacji]);

  // K9-A: postęp wyborów aparatury (CT/VT/zabezpieczenie) i profili (profil + 3 krzywe).
  const liczbaAparatury = [dane.ct_catalog_ref, dane.vt_catalog_ref, dane.protection_catalog_ref]
    .filter((ref) => Boolean(ref?.trim())).length;
  const liczbaProfili = [
    dane.nc_rfg_profile_ref,
    dane.lvrt_curve_ref,
    dane.hvrt_curve_ref,
    dane.pf_curve_ref,
  ].filter((ref) => Boolean(ref?.trim())).length;

  const przylaczenieWartosc = isBlock
    ? materializowanyTorSn
      ? 'Tor SN (dobór)'
      : wybranyTransformator?.name ?? 'Transformator blokowy'
    : kontekst.bus_nn_ref
    ? 'Szyna nN'
    : 'Brak';

  const wierszeGotowosci: WierszGotowosci[] = [
    {
      etykieta: T.wierszStacja,
      stan: hasKontekst ? 'kompletne' : 'brak',
      wartosc: kontekst.station_label || (hasKontekst ? 'Wskazana' : 'Brak'),
    },
    { etykieta: T.wierszTechnologia, stan: 'kompletne', wartosc: technologiaLabel(dane.source_technology) },
    {
      etykieta: T.wierszPrzylaczenie,
      stan: isBlock
        ? materializowanyTorSn || wybranyTransformator
          ? 'kompletne'
          : 'brak'
        : kontekst.bus_nn_ref
        ? 'kompletne'
        : 'brak',
      wartosc: przylaczenieWartosc,
    },
    {
      etykieta: T.wierszFalownik,
      stan: dane.converter_catalog_ref ? 'kompletne' : 'brak',
      wartosc: dane.converter_catalog_ref ? 'Kompletne' : 'Do konfiguracji',
    },
    // K9-A: aparatura (3 wiązania katalogowe) i profile NC RfG (profil + 3 krzywe)
    // — kontrola pokazuje postęp wyborów; komplet odblokowuje osie gotowości analiz.
    {
      etykieta: T.wierszAparatura,
      stan: liczbaAparatury === 3 ? 'kompletne' : liczbaAparatury > 0 ? 'ostrzezenie' : 'brak',
      wartosc:
        liczbaAparatury === 3
          ? 'Kompletne'
          : liczbaAparatury > 0
          ? T.aparaturaCzesciowa(liczbaAparatury, 3)
          : T.doKonfiguracji,
    },
    {
      etykieta: T.wierszZgodnosc,
      stan: liczbaProfili === 4 ? 'kompletne' : liczbaProfili > 0 ? 'ostrzezenie' : 'brak',
      wartosc:
        liczbaProfili === 4
          ? 'Kompletne'
          : liczbaProfili > 0
          ? T.aparaturaCzesciowa(liczbaProfili, 4)
          : T.doKonfiguracji,
    },
    { etykieta: T.wierszRegulacja, stan: 'kompletne', wartosc: regulacjaLabel(dane.control_mode) },
    {
      etykieta: T.wierszTrybPracy,
      stan: 'kompletne',
      wartosc: dane.operating_mode
        ? T.trybPracyOpcje.find((o) => o.id === dane.operating_mode)?.etykieta ?? dane.operating_mode
        : T.bezWskazania,
    },
  ];

  const aside = (
    <>
      <KreatorGotowosc tytul={T.kontrolaTytul} wiersze={wierszeGotowosci} testid="mvd-kreator-oze-gotowosc" />
      <KreatorNastepnyKrok eyebrow={T.downstreamTytul} opis={T.downstreamOpis} />
    </>
  );

  // O7: jawna semantyka liczby jednostek — zestaw (N × typ) i sumy z tabliczki
  // katalogowej (prezentacja agregacji danych katalogowych, agregat liczy backend).
  const liczbaJednostek = Math.max(1, dane.quantity);
  const paramReadout = wybranyKonwerter ? (
    <>
      <KreatorSiatka kolumny={2}>
        <RzadWartosci
          etykieta={T.paramZestaw}
          wartosc={`${liczbaJednostek} × ${wybranyKonwerter.name}`}
        />
        <RzadWartosci etykieta={T.paramNapiecie} wartosc={`${wybranyKonwerter.un_kv} kV`} />
      </KreatorSiatka>
      <KreatorSiatka kolumny={3}>
        <RzadWartosci etykieta={T.paramMoc} wartosc={`${wybranyKonwerter.sn_mva.toFixed(3)} MVA`} />
        <RzadWartosci
          etykieta={T.paramMocAgregat}
          wartosc={`${(wybranyKonwerter.sn_mva * liczbaJednostek).toFixed(3)} MVA`}
        />
        <RzadWartosci
          etykieta={T.paramPmax}
          wartosc={`${(wybranyKonwerter.pmax_mw * liczbaJednostek).toFixed(3)} MW`}
        />
      </KreatorSiatka>
    </>
  ) : null;

  const krokIndex = KROKI.findIndex((k) => k.id === krok);
  const wToku = faza === 'bieg' || faza === 'dokumenty';

  /**
   * R5 (karta FAB-K, wzorzec E2E-S95 — `KreatorMagistralaSn.tsx`): JEDNO
   * źródło prawdy dla DWÓCH obserwowalnych powierzchni — `zablokowana`
   * przycisku zapisu ORAZ `status`/`data-status` korzenia `KreatorRama` —
   * żeby te dwie powierzchnie nie mogły rozjechać się w dwa niezależne
   * warunki (reguła KLASA NIE INSTANCJA, „Predykaty parami"). Poprzednia
   * wersja miała TYLKO `zablokowana: !hasKontekst || !activeCaseId` — bez
   * stanu ładowania katalogu przekształtników/aparatury nN, więc przycisk
   * był klikalny (i `KreatorRama` nie niosła żadnego `status`) w chwili, gdy
   * katalog jeszcze leciał — zapis wtedy widziałby pustą listę urządzeń.
   * Dotyczy WYŁĄCZNIE fazy „formularz" — `wToku`/`'gotowe"` mają WŁASNE,
   * jawnie nazwane stany (bieg/dokumenty/zakończ), nieporównywalne z
   * gotowością formularza przed pierwszym zapisem.
   */
  const stanGotowosci: 'ladowanie' | 'zablokowany' | 'gotowy' =
    !hasKontekst || !activeCaseId
      ? 'zablokowany'
      : katalogLadowanie
        ? 'ladowanie'
        : 'gotowy';

  const akcjaGlowna =
    faza === 'gotowe'
      ? { etykieta: P.zakoncz, onClick: zakonczPoZapisie, testid: 'mvd-kreator-oze-zapisz' }
      : wToku
      ? {
          etykieta: faza === 'bieg' ? P.fazaBieg : P.fazaDokumenty,
          onClick: () => {},
          zablokowana: true,
          testid: 'mvd-kreator-oze-zapisz',
        }
      : {
          etykieta: T.zapisz,
          onClick: onZapisz,
          zablokowana: stanGotowosci !== 'gotowy',
          testid: 'mvd-kreator-oze-zapisz',
        };

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
      walidacja={
        faza === 'gotowe' || wToku
          ? null
          : stanGotowosci === 'ladowanie'
            ? T.katalogLadowanieStopka
            : bledy.length > 0
              ? T.walidacjaStopka
              : !hasKontekst
                ? T.brakStacjiOpis
                : null
      }
      status={faza === 'gotowe' || wToku ? undefined : stanGotowosci}
      akcjaGlowna={akcjaGlowna}
      akcjaAnuluj={{ etykieta: T.anuluj, onClick: () => closeForm(), testid: 'mvd-kreator-oze-anuluj' }}
      krokWstecz={
        faza === 'formularz' && krokIndex > 0
          ? { etykieta: T.wstecz, onClick: () => setKrok(KROKI[krokIndex - 1].id), testid: 'mvd-kreator-oze-wstecz' }
          : undefined
      }
      krokDalej={
        faza === 'formularz' && krokIndex < KROKI.length - 1
          ? { etykieta: T.dalej, onClick: () => setKrok(KROKI[krokIndex + 1].id), testid: 'mvd-kreator-oze-dalej' }
          : undefined
      }
      licznikKrokow={T.licznik(krokIndex + 1, KROKI.length)}
      testid="mvd-kreator-oze"
    >
      {!hasKontekst ? (
        <KreatorSekcja tytul={T.brakStacjiTytul} testid="mvd-kreator-oze-brak">
          <KreatorInfo>{T.brakStacjiOpis}</KreatorInfo>
        </KreatorSekcja>
      ) : null}

      {krok === 'tech' ? (
        <KreatorSekcja tytul={T.sekcjaTechnologia} testid="mvd-kreator-oze-tech">
          <KreatorInfo>{T.technologiaPomoc}</KreatorInfo>
          <KreatorSiatka kolumny={2}>
            <PoleWyboru
              etykieta={T.technologia}
              wartosc={dane.source_technology}
              onZmiana={(v) => zmienTechnologie(v as TechnologiaOze)}
              opcje={OPCJE_TECH}
              testid="mvd-kreator-oze-technologia"
            />
            <PoleTekstowe
              etykieta={T.nazwa}
              wartosc={dane.source_name}
              onZmiana={(v) => zmien('source_name', v)}
              placeholder={T.nazwaPlaceholder}
              testid="mvd-kreator-oze-nazwa"
            />
          </KreatorSiatka>
          <KreatorInfo>{T.wariantPomoc}</KreatorInfo>
          <PoleWyboru
            etykieta={T.wariant}
            wartosc={dane.connection_variant}
            onZmiana={(v) => zmien('connection_variant', v as WariantPrzylaczenia)}
            opcje={OPCJE_WARIANT}
            testid="mvd-kreator-oze-wariant"
          />
          {isBlock ? (
            <>
              <PoleWyboru
                etykieta={T.transformator}
                wartosc={dane.blocking_transformer_ref ?? ''}
                onZmiana={(v) => zmien('blocking_transformer_ref', v || null)}
                opcje={[{ id: '', etykieta: T.transformatorPlaceholder }, ...opcjeTransformatory]}
                testid="mvd-kreator-oze-transformator"
              />
              {transformatory.length === 0 ? <KreatorInfo>{T.transformatorBrak}</KreatorInfo> : null}
              {bladDlaPola('blocking_transformer_ref') ? (
                <p className="mvd-pole-blad">{bladDlaPola('blocking_transformer_ref')}</p>
              ) : null}
            </>
          ) : (
            <>
              <PoleWyboru
                etykieta={T.umiejscowienie}
                wartosc={dane.placement}
                onZmiana={(v) => zmien('placement', v as OzeFormData['placement'])}
                opcje={OPCJE_UMIEJSCOWIENIE}
                testid="mvd-kreator-oze-umiejscowienie"
              />
              {dane.placement === 'NEW_FIELD' ? (
                <>
                  <PoleTekstowe
                    etykieta={T.nazwaNowegoPola}
                    wartosc={dane.new_field_name}
                    onZmiana={(v) => zmien('new_field_name', v)}
                    placeholder={tech.defaultName}
                    testid="mvd-kreator-oze-nowe-pole-nazwa"
                  />
                  <PoleKatalogu
                    etykieta={T.aparatNowegoPola}
                    wartosc={dane.apparatus_catalog_ref}
                    onZmiana={(v) => zmien('apparatus_catalog_ref', v)}
                    opcje={opcjeAparaty}
                    status={bladKatalogu ? 'error' : 'ready'}
                    placeholder={T.aparatPlaceholder}
                    komunikatBledu={bladKatalogu ?? T.katalogBlad}
                    blad={bladDlaPola('apparatus_catalog_ref')}
                    testid="mvd-kreator-oze-aparat"
                  />
                </>
              ) : (
                <>
                  {/* K9-A O12: wskazanie istniejącego pola odpływowego wprost w kreatorze
                      (dotąd wyłącznie z kontekstu wywołania). */}
                  <PoleWyboru
                    etykieta={T.istniejacePole}
                    wartosc={dane.existing_field_ref ?? kontekst.existing_field_ref ?? ''}
                    onZmiana={(v) => zmien('existing_field_ref', v || null)}
                    opcje={[{ id: '', etykieta: T.istniejacePolePlaceholder }, ...opcjePolOdplywowych]}
                    blad={bladDlaPola('existing_field_ref')}
                    testid="mvd-kreator-oze-istniejace-pole"
                  />
                  {opcjePolOdplywowych.length === 0 && !kontekst.existing_field_ref ? (
                    <KreatorInfo>{T.istniejacePoleBrak}</KreatorInfo>
                  ) : null}
                </>
              )}
              {bladDlaPola('bus_nn_ref') ? <p className="mvd-pole-blad">{bladDlaPola('bus_nn_ref')}</p> : null}
            </>
          )}
          {/* K9-A O13: konsekwencje wariantu — opis strukturalny operacji (bez liczb). */}
          <KreatorSekcja tytul={T.konsekwencjeTytul} testid="mvd-kreator-oze-konsekwencje">
            <ul className="mvd-kreator-lista">
              {(isBlock ? T.konsekwencjeBlok : T.konsekwencjeNn).map((punkt) => (
                <li key={punkt}>{punkt}</li>
              ))}
            </ul>
          </KreatorSekcja>
          <PanelTeorii
            tytul={T.teoriaTechTytul}
            opis={T.teoriaTechOpis}
            wymog={T.teoriaTechWymog}
            podstawa={T.teoriaTechPodstawa}
            testid="mvd-kreator-oze-teoria-tech"
          />
        </KreatorSekcja>
      ) : null}

      {krok === 'katalog' ? (
        <KreatorSekcja tytul={T.sekcjaKatalog} testid="mvd-kreator-oze-katalog">
          <KreatorInfo>{T.katalogPomoc}</KreatorInfo>
          <PoleKatalogu
            etykieta={T.katalog}
            wartosc={dane.converter_catalog_ref}
            onZmiana={(v) => zmien('converter_catalog_ref', v)}
            opcje={opcjeKonwertery}
            status={bladKatalogu ? 'error' : 'ready'}
            placeholder={T.katalogPlaceholder}
            komunikatBledu={bladKatalogu ?? T.katalogBlad}
            blad={bladDlaPola('converter_catalog_ref')}
            testid="mvd-kreator-oze-konwerter"
          />
          <KreatorSiatka kolumny={2}>
            <PoleLiczbowe
              etykieta={T.liczba}
              wartosc={dane.quantity}
              onZmiana={(v) => zmien('quantity', Math.max(1, Math.trunc(v ?? 1)))}
              krok={1}
              min={1}
              pomoc={T.liczbaPomoc}
              testid="mvd-kreator-oze-liczba"
            />
          </KreatorSiatka>
          {paramReadout}
          {wybranyKonwerter && !wybranyKonwerter.ptpiree_certificate_ref ? (
            <KreatorInfo>{T.ptpireeBrak}</KreatorInfo>
          ) : null}
          <PanelTeorii
            tytul={T.teoriaKatalogTytul}
            opis={T.teoriaKatalogOpis}
            wymog={T.teoriaKatalogWymog}
            podstawa={T.teoriaKatalogPodstawa}
            testid="mvd-kreator-oze-teoria-katalog"
          />
        </KreatorSekcja>
      ) : null}

      {krok === 'dobor' && isBlock ? (
        <KreatorSekcja tytul={T.sekcjaDobor} testid="mvd-kreator-oze-dobor-sekcja">
          <DoborToruSn
            converter={wybranyKonwerter}
            quantity={dane.quantity}
            snBusVoltageKv={snBusVoltageKv}
            derSn={derSn}
            onCableLengthChange={zmienDlugoscKabla}
            onVectorGroupChange={zmienGrupePolaczen}
            onLayingConditionsChange={zmienWarunkiUlozenia}
            onZastosuj={onZastosujDobor}
            applied={derSnZastosowany}
          />
        </KreatorSekcja>
      ) : null}

      {krok === 'aparatura' ? <KrokAparatura dane={dane} zmien={zmien} /> : null}

      {krok === 'zgodnosc' ? <KrokZgodnosc dane={dane} zmien={zmien} /> : null}

      {krok === 'regulacja' ? (
        <>
          <KreatorSekcja tytul={T.sekcjaRegulacja} testid="mvd-kreator-oze-regulacja">
            {/* K9-A O5: tryb pracy źródła — zapis osobną operacją po utworzeniu elementu. */}
            <PoleWyboru
              etykieta={T.trybPracy}
              wartosc={dane.operating_mode ?? ''}
              onZmiana={(v) => zmien('operating_mode', (v || null) as SourceOperatingMode | null)}
              opcje={OPCJE_TRYB_PRACY}
              pomoc={T.trybPracyPomoc}
              testid="mvd-kreator-oze-tryb-pracy"
            />
            <KreatorInfo><TekstZWzorami tekst={T.regulacjaPomoc} /></KreatorInfo>
            <PoleWyboru
              etykieta={T.regulacja}
              wartosc={dane.control_mode}
              onZmiana={(v) => {
                setKomunikatRegulacjiNapiecia(null);
                zmien('control_mode', v as TrybRegulacji);
              }}
              opcje={opcjeRegulacjaDostepne}
              testid="mvd-kreator-oze-tryb"
            />
            {stanKataloguNcRfg === 'blad' ? (
              <KreatorInfo testid="mvd-kreator-oze-regulacja-katalog-blad">
                {T.regulacjaNapieciaKatalogNiedostepny}
              </KreatorInfo>
            ) : null}
            {komunikatRegulacjiNapiecia ? (
              <KreatorInfo testid="mvd-kreator-oze-regulacja-cofnieta">
                {komunikatRegulacjiNapiecia}
              </KreatorInfo>
            ) : null}
            {dane.control_mode === 'STALY_COS_PHI' ? (
              <PoleLiczbowe
                etykieta={T.cosPhiCel}
                wartosc={dane.cos_phi_target}
                onZmiana={(v) => zmien('cos_phi_target', v)}
                krok={0.01}
                min={0}
                max={1}
                placeholder={`Sugerowane: ${SUGEROWANE.cosPhi}`}
                pomoc={T.cosPhiCelPomoc}
                blad={bladDlaPola('cos_phi_target')}
                testid="mvd-kreator-oze-cosphi"
              />
            ) : null}
            {dane.control_mode === 'Q_OD_U' ? (
              <>
                <PoleLiczbowe
                  etykieta={T.quNachylenie}
                  wartosc={dane.qu_slope_pu_per_pu}
                  onZmiana={(v) => zmien('qu_slope_pu_per_pu', v)}
                  krok={0.5}
                  min={0}
                  placeholder={`Sugerowane: ${SUGEROWANE.quSlopePuPerPu}`}
                  pomoc={T.quNachyleniePomoc}
                  testid="mvd-kreator-oze-qu-slope"
                />
                <KreatorSiatka kolumny={2}>
                  <PoleLiczbowe
                    etykieta={T.quPasmoDol}
                    jednostka="pu"
                    wartosc={dane.qu_deadband_low_pu}
                    onZmiana={(v) => zmien('qu_deadband_low_pu', v)}
                    krok={0.01}
                    min={0}
                    placeholder={`Sugerowane: ${SUGEROWANE.quDeadbandLowPu}`}
                    pomoc={T.quPasmoPomoc}
                    testid="mvd-kreator-oze-qu-db-low"
                  />
                  <PoleLiczbowe
                    etykieta={T.quPasmoGora}
                    jednostka="pu"
                    wartosc={dane.qu_deadband_high_pu}
                    onZmiana={(v) => zmien('qu_deadband_high_pu', v)}
                    krok={0.01}
                    min={0}
                    placeholder={`Sugerowane: ${SUGEROWANE.quDeadbandHighPu}`}
                    blad={bladDlaPola('qu_deadband_high_pu')}
                    testid="mvd-kreator-oze-qu-db-high"
                  />
                </KreatorSiatka>
              </>
            ) : null}
            {dane.control_mode === 'REGULACJA_NAPIECIA' ? (
              <PoleLiczbowe
                etykieta={T.uSetPu}
                jednostka="pu"
                wartosc={dane.u_set_pu}
                onZmiana={(v) => zmien('u_set_pu', v)}
                krok={0.001}
                min={0.9}
                max={1.1}
                pomoc={T.uSetPuPomoc}
                blad={bladDlaPola('u_set_pu')}
                testid="mvd-kreator-oze-u-set-pu"
              />
            ) : null}
            {trybQWymagaWartosci(dane) ? (
              <KreatorInfo><TekstZWzorami tekst={T.regulacjaPasywnaOstrzezenie} /></KreatorInfo>
            ) : null}
            <KreatorSiatka kolumny={2}>
              <PoleLiczbowe
                etykieta={T.qMin}
                jednostka="Mvar"
                wartosc={dane.q_min_mvar}
                onZmiana={(v) => zmien('q_min_mvar', v)}
                pomoc={T.qPomoc}
                testid="mvd-kreator-oze-qmin"
              />
              <PoleLiczbowe
                etykieta={T.qMax}
                jednostka="Mvar"
                wartosc={dane.q_max_mvar}
                onZmiana={(v) => zmien('q_max_mvar', v)}
                blad={bladDlaPola('q_max_mvar')}
                testid="mvd-kreator-oze-qmax"
              />
            </KreatorSiatka>
            <PoleLiczbowe
              etykieta={T.mocRobocza}
              jednostka="MW"
              wartosc={dane.power_setpoint_mw}
              onZmiana={(v) => zmien('power_setpoint_mw', v)}
              pomoc={T.mocRoboczaPomoc}
              testid="mvd-kreator-oze-moc"
            />
            <KreatorSiatka kolumny={2}>
              <PoleLiczbowe
                etykieta={T.statyzmPf}
                jednostka="%"
                wartosc={dane.frequency_droop_percent}
                onZmiana={(v) => zmien('frequency_droop_percent', v)}
                min={0}
                placeholder={`Sugerowane: ${SUGEROWANE.pfDroopPercent}`}
                pomoc={T.statyzmPfPomoc}
                testid="mvd-kreator-oze-statyzm"
              />
              {dane.frequency_droop_percent ? (
                <PoleLiczbowe
                  etykieta={T.pfDeadband}
                  jednostka="Hz"
                  wartosc={dane.lfsm_deadband_hz}
                  onZmiana={(v) => zmien('lfsm_deadband_hz', v)}
                  krok={0.05}
                  min={0}
                  placeholder={`Sugerowane: ${SUGEROWANE.pfDeadbandHz}`}
                  pomoc={T.pfDeadbandPomoc}
                  testid="mvd-kreator-oze-deadband"
                />
              ) : null}
            </KreatorSiatka>
            <CharakterystykaNcRfg
              mode={dane.control_mode}
              cosPhi={dane.cos_phi_target}
              quSlope={dane.qu_slope_pu_per_pu}
              quDbLow={dane.qu_deadband_low_pu}
              quDbHigh={dane.qu_deadband_high_pu}
              droopPct={dane.frequency_droop_percent}
              pfDbHz={dane.lfsm_deadband_hz}
              allowIncrease={dane.source_technology === 'BESS'}
            />
            <KreatorInfo>{T.frtOpis}</KreatorInfo>
            <KreatorSiatka kolumny={2}>
              <PoleWyboru
                etykieta={T.frtLvrt}
                wartosc={dane.has_lvrt_curve ? 'tak' : 'nie'}
                onZmiana={(v) => zmien('has_lvrt_curve', v === 'tak')}
                opcje={T.frtOpcje}
                testid="mvd-kreator-oze-lvrt"
              />
              <PoleWyboru
                etykieta={T.frtHvrt}
                wartosc={dane.has_hvrt_curve ? 'tak' : 'nie'}
                onZmiana={(v) => zmien('has_hvrt_curve', v === 'tak')}
                opcje={T.frtOpcje}
                testid="mvd-kreator-oze-hvrt"
              />
            </KreatorSiatka>
          </KreatorSekcja>

          {dane.source_technology === 'BESS' ? (
            <KreatorSekcja tytul={T.sekcjaBess} testid="mvd-kreator-oze-bess">
              <PoleWyboru
                etykieta={T.bessTryb}
                wartosc={dane.bess_mode}
                onZmiana={(v) => zmien('bess_mode', v as TrybBess)}
                opcje={OPCJE_BESS}
                testid="mvd-kreator-oze-bess-tryb"
              />
              <KreatorSiatka kolumny={2}>
                <PoleLiczbowe
                  etykieta={T.socMin}
                  jednostka="%"
                  wartosc={dane.soc_min_percent}
                  onZmiana={(v) => zmien('soc_min_percent', v)}
                  blad={bladDlaPola('soc_min_percent')}
                  pomoc={T.socPomoc}
                  testid="mvd-kreator-oze-soc-min"
                />
                <PoleLiczbowe
                  etykieta={T.socMax}
                  jednostka="%"
                  wartosc={dane.soc_max_percent}
                  onZmiana={(v) => zmien('soc_max_percent', v)}
                  blad={bladDlaPola('soc_max_percent')}
                  testid="mvd-kreator-oze-soc-max"
                />
              </KreatorSiatka>
            </KreatorSekcja>
          ) : null}
        </>
      ) : null}

      {krok === 'zapis' && faza === 'formularz' ? (
        <>
          <KreatorSekcja tytul={T.krokZapis} testid="mvd-kreator-oze-zapis">
            <KreatorInfo>{T.downstreamOpis}</KreatorInfo>
            <KreatorSiatka kolumny={2}>
              <RzadWartosci etykieta={T.wierszStacja} wartosc={kontekst.station_label || '—'} />
              <RzadWartosci etykieta={T.wierszTechnologia} wartosc={technologiaLabel(dane.source_technology)} />
              <RzadWartosci etykieta={T.wierszPrzylaczenie} wartosc={wariantLabel(dane.connection_variant)} />
              <RzadWartosci etykieta={T.wierszRegulacja} wartosc={regulacjaLabel(dane.control_mode)} />
              {dane.control_mode === 'REGULACJA_NAPIECIA' ? (
                <RzadWartosci
                  etykieta={T.uSetPu}
                  wartosc={dane.u_set_pu !== null ? `${dane.u_set_pu} pu` : T.doKonfiguracji}
                />
              ) : null}
              {dane.source_technology === 'BESS' ? (
                <RzadWartosci etykieta={T.bessTryb} wartosc={bessLabel(dane.bess_mode)} />
              ) : null}
              <RzadWartosci etykieta={T.nazwa} wartosc={dane.source_name.trim() || tech.defaultName} />
              <RzadWartosci
                etykieta={T.wierszAparatura}
                wartosc={liczbaAparatury > 0 ? T.aparaturaCzesciowa(liczbaAparatury, 3) : T.doKonfiguracji}
              />
              <RzadWartosci
                etykieta={T.wierszZgodnosc}
                wartosc={liczbaProfili > 0 ? T.aparaturaCzesciowa(liczbaProfili, 4) : T.doKonfiguracji}
              />
              <RzadWartosci
                etykieta={T.wierszTrybPracy}
                wartosc={
                  dane.operating_mode
                    ? T.trybPracyOpcje.find((o) => o.id === dane.operating_mode)?.etykieta
                      ?? dane.operating_mode
                    : T.bezWskazania
                }
              />
            </KreatorSiatka>
          </KreatorSekcja>
          <KreatorSekcja tytul={P.sekcjaAutoBieg} testid="mvd-kreator-oze-autobieg">
            <KreatorInfo>{P.autoBiegOpis}</KreatorInfo>
            <KreatorSiatka kolumny={2}>
              <PoleWyboru
                etykieta={P.autoBieg}
                wartosc={autoBieg ? 'tak' : 'nie'}
                onZmiana={(v) => setAutoBieg(v === 'tak')}
                opcje={P.opcjeTakNie}
                testid="mvd-kreator-oze-autobieg-toggle"
              />
              <PoleWyboru
                etykieta={P.zapiszDoMagazynu}
                wartosc={zapiszDoMagazynu ? 'tak' : 'nie'}
                onZmiana={(v) => setZapiszDoMagazynu(v === 'tak')}
                opcje={P.opcjeTakNie}
                pomoc={P.zapiszDoMagazynuOpis}
                testid="mvd-kreator-oze-magazyn-toggle"
              />
            </KreatorSiatka>
          </KreatorSekcja>
        </>
      ) : null}

      {krok === 'zapis' && wToku ? (
        <KreatorSekcja tytul={T.krokZapis} testid="mvd-kreator-oze-wtoku">
          <KreatorInfo>{faza === 'bieg' ? P.fazaBieg : P.fazaDokumenty}</KreatorInfo>
        </KreatorSekcja>
      ) : null}

      {/* K9-A §0.4: uczciwy przebieg sekwencji zapisu — co zapisane, co padło. */}
      {krok === 'zapis' && sekwencja.length > 0 ? (
        <KreatorSekcja tytul={T.sekwencjaTytul} testid="mvd-kreator-oze-sekwencja">
          <KreatorInfo>{T.sekwencjaOpis}</KreatorInfo>
          <ul className="mvd-kreator-sekwencja">
            {sekwencja.map((etap) => (
              <li key={etap.id} data-stan={etap.stan} data-testid={`mvd-kreator-oze-sekwencja-${etap.id}`}>
                {etap.etykieta}
                {' — '}
                <strong>
                  {etap.stan === 'zapisane'
                    ? T.sekwencjaZapisane
                    : etap.stan === 'pominiete'
                    ? T.sekwencjaPominiete
                    : T.sekwencjaBlad}
                </strong>
                {etap.komunikat ? (
                  <span className="mvd-kreator-sekwencja-komunikat">{etap.komunikat}</span>
                ) : null}
              </li>
            ))}
          </ul>
          {sekwencja.some((etap) => etap.stan === 'blad') ? (
            <KreatorInfo>{T.sekwencjaBladPodsumowanie}</KreatorInfo>
          ) : null}
        </KreatorSekcja>
      ) : null}

      {/* K9-A O15: osie gotowości wytwórcy — readout z modelu po zapisie. */}
      {krok === 'zapis' && faza === 'gotowe' ? (
        <GotowoscDer projectId={activeProjectId} caseId={activeCaseId} generatorRef={generatorRef} />
      ) : null}

      {krok === 'zapis' && faza === 'gotowe' ? (
        <PodsumowanieAutoBieg
          runStatus={runStatus}
          autoBieg={autoBieg}
          raport={raport}
          bom={bom}
          onOtworzDokumentacje={otworzDokumentacje}
          onZakoncz={zakonczPoZapisie}
        />
      ) : null}
    </KreatorRama>
  );
}
