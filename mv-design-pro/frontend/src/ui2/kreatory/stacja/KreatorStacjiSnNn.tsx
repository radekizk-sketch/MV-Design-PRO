/**
 * Kreator „Dodaj stację SN/nN" (Audyt D, faza D2 — rdzeń) — ui2, kreatory/rama.
 *
 * Buduje stację transformatorową SN/nN RÓWNOLEGLE do legacy `InsertStationForm`
 * (cutover = faza D5). Rdzeń D2: rodzaj + umiejscowienie (koniec odcinka /
 * świadomy podział z kontekstu operacji) + transformator (katalog TRAFO_SN_NN,
 * dobór po napięciu nN) + minimalny blok nN (LOAD_NN) + zapis realną operacją
 * domenową i wiązanie ze schematem (V12K-073). Rozdzielnica SN i pełny blok
 * nN/PV = fazy D3/D4. ZERO fizyki w UI — wartości z katalogu, wynik z backendu.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import {
  fetchCompleteBayTemplates,
  fetchConverterTypes,
  fetchManufacturers,
  fetchSwitchgearFamilies,
  fetchTransformerTypes,
  getCatalogErrorMessage,
} from '../../../ui/catalog/api';
import type { CompleteMvBayTemplateSummary } from '../../../ui/catalog/BayTemplatePicker';
import type { Manufacturer } from '../../../ui/catalog/manufacturer';
import type { SwitchgearFamily } from '../../../ui/catalog/SwitchgearFamilyPicker';
import type { ConverterType, TransformerType } from '../../../ui/catalog/types';
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
  czyKoniecOdcinka,
  czyRozdzielnicaKompletna,
  doborTransformatorow,
  falownikiPv,
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
  rodzinyDlaProducenta,
  rolePolaStacji,
  szablonyDlaWyboru,
  szablonyPerRola,
  walidujFormularz,
  wymaganeNapiecieNn,
  wyznaczTryb,
  zabezpieczenieZrodla,
  zbudujPayload,
  zbudujPolaSn,
  type BladPola,
  type KontekstStacji,
  type NnConfiguration,
  type SnFieldRole,
  type StacjaFormData,
  type TypStacji,
  type WyborRozdzielnicy,
} from './stacjaModel';
import { PodgladRozdzielnicySn } from './PodgladRozdzielnicySn';
import { STACJA_STRINGS as T } from './strings';

const KROKI: readonly KrokKreatora[] = [
  { id: 'rodzaj', tytul: T.krokRodzaj },
  { id: 'transformator', tytul: T.krokTransformator },
  { id: 'rozdzielnica', tytul: T.krokRozdzielnica },
  { id: 'nn', tytul: T.krokNn },
  { id: 'zapis', tytul: T.krokZapis },
];

export function KreatorStacjiSnNn() {
  const rawContext = useActiveOperationContext() as Record<string, unknown> | null;
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
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
    const snVoltageKv = deriveSnVoltageKv(snapshot, busOptions, segmentId);
    const stationKind = normalizujTypStacji(
      (context?.station as Record<string, unknown> | undefined)?.station_type ?? context?.station_type,
    );
    return {
      tryb: wyznaczTryb(placementMode, endpointBusRef, positionOnSegment),
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
  const [krok, setKrok] = useState<string>('rodzaj');

  const [typy, setTypy] = useState<TransformerType[]>([]);
  const [konwertery, setKonwertery] = useState<ConverterType[]>([]);
  const [bladKatalogu, setBladKatalogu] = useState<string | null>(null);

  const [producenci, setProducenci] = useState<Manufacturer[]>([]);
  const [rodziny, setRodziny] = useState<SwitchgearFamily[]>([]);
  const [szablony, setSzablony] = useState<CompleteMvBayTemplateSummary[]>([]);
  const [bladRozdzielnicy, setBladRozdzielnicy] = useState<string | null>(null);

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

  const isPv = dane.nn_configuration === 'PV_INVERTER';
  const falowniki = useMemo(() => falownikiPv(konwertery), [konwertery]);
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

  // PV: auto-wybór pierwszego zdatnego falownika, gdy brak wyboru (parytet legacy).
  useEffect(() => {
    if (!isPv || falowniki.length === 0) return;
    if (falowniki.some((c) => c.id === dane.source_converter_ref)) return;
    setDane((p) => ({ ...p, source_converter_ref: falowniki[0].id }));
  }, [dane.source_converter_ref, falowniki, isPv]);

  // Powrót do odbiorczej → wyczyść referencję falownika (spójność payloadu).
  useEffect(() => {
    if (!isPv && dane.source_converter_ref) {
      setDane((p) => ({ ...p, source_converter_ref: null }));
    }
  }, [dane.source_converter_ref, isPv]);

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

  const producenciDobrani = useMemo(() => producenciUzywalni(producenci), [producenci]);
  const rodzinyDobrane = useMemo(
    () => rodzinyDlaProducenta(rodziny, dane.manufacturer_ref, kontekst.snVoltageKv),
    [dane.manufacturer_ref, kontekst.snVoltageKv, rodziny],
  );

  // Kompletne szablony pól per producent (filtr niekompletnych przez API + model).
  useEffect(() => {
    if (!dane.manufacturer_ref) {
      setSzablony([]);
      return;
    }
    let cancelled = false;
    fetchCompleteBayTemplates(dane.manufacturer_ref)
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
  }, [dane.manufacturer_ref]);

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
  const snFields = useMemo(
    () =>
      zbudujPolaSn(dane.station_type, szablonyRola, {
        manufacturerRef: dane.manufacturer_ref,
        switchgearFamilyRef: dane.switchgear_family_ref,
      }),
    [dane.manufacturer_ref, dane.station_type, dane.switchgear_family_ref, szablonyRola],
  );
  const rozdzielnicaKompletna = czyRozdzielnicaKompletna(snFields);

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
    !bladKatalogu && isPv && konwertery.length > 0 && falowniki.length === 0 ? T.falownikBrak : null;
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
        closeForm();
        selekcjaPoOperacji(response, {
          type: 'Station',
          name: daneEff.station_name.trim() || kontekst.stationName.trim() || 'Stacja SN/nN',
        });
      } catch (e) {
        setBladGlobalny(e instanceof Error ? e.message : T.walidacjaStopka);
      }
    },
    [activeCaseId, closeForm, executeDomainOperation, kontekst, kontekstOk, rozdzielnica, selekcjaPoOperacji, snFields],
  );

  const onZapisz = useCallback(() => {
    void zapiszStacje(dane, konwerter);
  }, [dane, konwerter, zapiszStacje]);

  // Szybka ścieżka „stacja rekomendowana" (parytet legacy): auto-dobór
  // rekomendowanego transformatora i (dla PV) pierwszego falownika, zapis skrótem.
  const onZapiszRekomendowana = useCallback(() => {
    const trafoRef = dane.catalog_ref ?? dobrane[0]?.id ?? null;
    const konwerterEff = isPv ? konwerter ?? falowniki[0] ?? null : null;
    const daneEff: StacjaFormData = {
      ...dane,
      catalog_ref: trafoRef,
      source_converter_ref: konwerterEff?.id ?? dane.source_converter_ref,
    };
    void zapiszStacje(daneEff, konwerterEff);
  }, [dane, dobrane, falowniki, isPv, konwerter, zapiszStacje]);

  const koniec = czyKoniecOdcinka(kontekst);
  const typLabel =
    T.typStacjiOpcje.find((o) => o.id === dane.station_type)?.etykieta ?? dane.station_type;
  const umiejscowienieLabel = koniec ? T.umiejscowienieKoniec : T.umiejscowieniePodzial;
  const konfiguracjaNnLabel =
    T.konfiguracjaNnOpcje.find((o) => o.id === dane.nn_configuration)?.etykieta ?? dane.nn_configuration;
  const nnVoltageLabel = isPv
    ? konwerter
      ? fmtKv(konwerter.un_kv)
      : T.wymNnOczekuje
    : fmtKv(dane.nn_voltage_kv);
  const nnBlokKompletny = !isPv || Boolean(konwerter);
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
      stan: rozdzielnicaKompletna ? 'kompletne' : 'brak',
      wartosc: rozdzielnicaKompletna
        ? `${snFields.length} pól · ${selectedManufacturer?.name ?? dane.manufacturer_ref}`
        : 'Do doboru',
    },
    {
      etykieta: T.wierszNn,
      stan: nnBlokKompletny ? 'kompletne' : 'brak',
      wartosc: isPv
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
    !kontekstOk || !activeCaseId || !rozdzielnicaKompletna || !dane.catalog_ref || (isPv && !konwerter);
  const szybkaZablokowana =
    !kontekstOk
    || !activeCaseId
    || !rozdzielnicaKompletna
    || !rekomendowanyTrafoRef
    || (isPv && falowniki.length === 0);
  const brakSzablonowKomunikat =
    !bladRozdzielnicy && Boolean(dane.manufacturer_ref) && szablonyWyboru.length === 0
      ? T.brakSzablonow
      : null;
  const rozdzielnicaBladStopka = rozdzielnicaKompletna
    ? null
    : bladRozdzielnicy ?? (dane.manufacturer_ref ? T.brakSzablonow : T.brakProducenta);
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
            {isPv ? (
              <RzadWartosci etykieta={T.wymNnOdczyt} wartosc={nnVoltageLabel} />
            ) : (
              <PoleWyboru
                etykieta={T.nnVoltage}
                wartosc={String(dane.nn_voltage_kv)}
                onZmiana={(v) => zmien('nn_voltage_kv', Number(v))}
                opcje={T.nnVoltageOpcje}
                pomoc={T.nnVoltagePomoc}
                blad={bladDlaPola('nn_voltage_kv')}
                testid="mvd-kreator-stacja-nn"
              />
            )}
            <RzadWartosci etykieta={T.snVoltageOdczyt} wartosc={fmtKv(kontekst.snVoltageKv)} />
          </KreatorSiatka>
          {isPv ? (
            <>
              <PoleKatalogu
                etykieta={T.falownik}
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
          <PanelTeorii
            tytul={T.teoriaTrafoTytul}
            opis={T.teoriaTrafoOpis}
            wymog={T.teoriaTrafoWymog}
            podstawa={T.teoriaTrafoPodstawa}
            testid="mvd-kreator-stacja-teoria-trafo"
          />
        </KreatorSekcja>
      ) : null}

      {krok === 'rozdzielnica' ? (
        <KreatorSekcja tytul={T.krokRozdzielnica} testid="mvd-kreator-stacja-rozdzielnica">
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
                ...rodzinyDobrane.map((f) => ({ id: f.switchgear_family_ref, etykieta: f.family_name })),
              ]}
              pomoc={T.rodzinaPomoc}
              wylaczone={!dane.manufacturer_ref}
              testid="mvd-kreator-stacja-rodzina"
            />
          </KreatorSiatka>

          {dane.manufacturer_ref && rodzinyDobrane.length === 0 ? (
            <KreatorInfo testid="mvd-kreator-stacja-brak-rodzin">{T.brakRodzin}</KreatorInfo>
          ) : null}

          {brakSzablonowKomunikat ? (
            <KreatorInfo testid="mvd-kreator-stacja-brak-szablonow">{brakSzablonowKomunikat}</KreatorInfo>
          ) : (
            <>
              {rolePol.map((role: SnFieldRole) => {
                const opcje = opcjeSzablonowRoli(szablonyWyboru, role);
                const wartosc = dane.bay_template_refs[role] ?? szablonyRola[role]?.template_ref ?? null;
                return (
                  <PoleKatalogu
                    key={role}
                    etykieta={FIELD_ROLE_LABELS[role] ?? role}
                    wartosc={wartosc}
                    onZmiana={(v) =>
                      setDane((p) => ({
                        ...p,
                        bay_template_refs: { ...p.bay_template_refs, [role]: v ?? undefined },
                      }))
                    }
                    opcje={opcje.map((t) => ({ id: t.template_ref, etykieta: templateOptionLabel(t, role) }))}
                    status={bladRozdzielnicy ? 'error' : 'ready'}
                    placeholder={T.polePlaceholder}
                    pomoc={T.poleRoliPomoc}
                    komunikatBledu={bladRozdzielnicy ?? T.rozdzielnicaBlad}
                    testid={`mvd-kreator-stacja-pole-${role}`}
                  />
                );
              })}
              <div>
                <div className="mvd-pole-etykieta">{T.podgladTytul}</div>
                <PodgladRozdzielnicySn snFields={snFields} testid="mvd-kreator-stacja-podglad" />
              </div>
            </>
          )}

          <PanelTeorii
            tytul={T.teoriaRozdzielnicaTytul}
            opis={T.teoriaRozdzielnicaOpis}
            wymog={T.teoriaRozdzielnicaWymog}
            podstawa={T.teoriaRozdzielnicaPodstawa}
            testid="mvd-kreator-stacja-teoria-rozdzielnica"
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

          {isPv ? (
            <KreatorSekcja tytul={T.nnBlokZrodloTytul} testid="mvd-kreator-stacja-zrodlo-pv">
              {konwerter ? (
                <>
                  <KreatorSiatka kolumny={2}>
                    <RzadWartosci etykieta={T.nnBlokZrodloFalownik} wartosc={konwerter.name} />
                    <RzadWartosci etykieta={T.nnBlokZrodloUn} wartosc={fmtKv(konwerter.un_kv)} />
                    <RzadWartosci etykieta={T.nnBlokZrodloMoc} wartosc={fmtMva(konwerter.sn_mva)} />
                    <RzadWartosci etykieta={T.nnBlokZrodloPmax} wartosc={fmtMva(konwerter.pmax_mw)} />
                    <RzadWartosci etykieta={T.nnBlokLabelPvPole} wartosc={T.nnBlokLabelPvPoleWartosc} />
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
                <KreatorInfo testid="mvd-kreator-stacja-zrodlo-brak">{T.nnBlokZrodloBrak}</KreatorInfo>
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
            {isPv ? (
              <RzadWartosci
                etykieta={T.podsumZrodlo}
                wartosc={konwerter ? `${konwerter.name} · ${fmtMva(konwerter.sn_mva)}` : T.nnBlokZrodloBrak}
              />
            ) : null}
          </KreatorSiatka>

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
