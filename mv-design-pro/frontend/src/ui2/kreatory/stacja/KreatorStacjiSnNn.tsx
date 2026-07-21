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
import { fetchTransformerTypes, getCatalogErrorMessage } from '../../../ui/catalog/api';
import type { TransformerType } from '../../../ui/catalog/types';
import {
  contextString,
  deriveSnVoltageKv,
  resolveSegmentIdFromContext,
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
  doborTransformatorow,
  fmtKv,
  fmtMva,
  fmtPct,
  fmtRatio,
  kontekstKompletny,
  nazwaOperacji,
  normalizujTypStacji,
  ogranicznikOdplywow,
  parametryZKatalogu,
  walidujFormularz,
  wyznaczTryb,
  zbudujPayload,
  type BladPola,
  type KontekstStacji,
  type StacjaFormData,
  type TypStacji,
} from './stacjaModel';
import { STACJA_STRINGS as T } from './strings';

const KROKI: readonly KrokKreatora[] = [
  { id: 'rodzaj', tytul: T.krokRodzaj },
  { id: 'transformator', tytul: T.krokTransformator },
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
  const [bladKatalogu, setBladKatalogu] = useState<string | null>(null);

  // Typ stacji podpowiedziany z kontekstu operacji.
  useEffect(() => {
    setDane((p) => ({ ...p, station_type: kontekst.stationKind }));
  }, [kontekst.stationKind]);

  useEffect(() => {
    let cancelled = false;
    setBladKatalogu(null);
    fetchTransformerTypes()
      .then((t) => {
        if (!cancelled) setTypy(Array.isArray(t) ? t : []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setTypy([]);
        setBladKatalogu(getCatalogErrorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dobrane = useMemo(
    () => doborTransformatorow(typy, kontekst.snVoltageKv, dane.nn_voltage_kv),
    [dane.nn_voltage_kv, kontekst.snVoltageKv, typy],
  );

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
  const brakDoboruKomunikat =
    !bladKatalogu && typy.length > 0 && dobrane.length === 0 ? T.brakDoboru : null;

  const onZapisz = useCallback(async () => {
    const walid = walidujFormularz(dane);
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
        zbudujPayload(dane, kontekst),
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
        name: dane.station_name.trim() || kontekst.stationName.trim() || 'Stacja SN/nN',
      });
    } catch (e) {
      setBladGlobalny(e instanceof Error ? e.message : T.walidacjaStopka);
    }
  }, [activeCaseId, closeForm, dane, executeDomainOperation, kontekst, kontekstOk, selekcjaPoOperacji]);

  const koniec = czyKoniecOdcinka(kontekst);
  const typLabel =
    T.typStacjiOpcje.find((o) => o.id === dane.station_type)?.etykieta ?? dane.station_type;
  const umiejscowienieLabel = koniec ? T.umiejscowienieKoniec : T.umiejscowieniePodzial;

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
      etykieta: T.wierszNn,
      stan: 'kompletne',
      wartosc: `${fmtKv(dane.nn_voltage_kv)} · ${ogranicznikOdplywow(dane.outgoing_feeders_nn_count)} odpł.`,
    },
  ];

  const aside = (
    <>
      <KreatorGotowosc tytul={T.kontrolaTytul} wiersze={wierszeGotowosci} testid="mvd-kreator-stacja-gotowosc" />
      <KreatorNastepnyKrok eyebrow={T.downstreamTytul} opis={T.downstreamOpis} />
    </>
  );

  const krokIndex = KROKI.findIndex((k) => k.id === krok);
  const zapisZablokowany = !kontekstOk || !activeCaseId;

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
      walidacja={bledy.length > 0 ? T.walidacjaStopka : brakDoboruKomunikat}
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
          <KreatorSiatka kolumny={2}>
            <PoleWyboru
              etykieta={T.nnVoltage}
              wartosc={String(dane.nn_voltage_kv)}
              onZmiana={(v) => zmien('nn_voltage_kv', Number(v))}
              opcje={T.nnVoltageOpcje}
              pomoc={T.nnVoltagePomoc}
              blad={bladDlaPola('nn_voltage_kv')}
              testid="mvd-kreator-stacja-nn"
            />
            <RzadWartosci etykieta={T.snVoltageOdczyt} wartosc={fmtKv(kontekst.snVoltageKv)} />
          </KreatorSiatka>
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
          <PanelTeorii
            tytul={T.teoriaTrafoTytul}
            opis={T.teoriaTrafoOpis}
            wymog={T.teoriaTrafoWymog}
            podstawa={T.teoriaTrafoPodstawa}
            testid="mvd-kreator-stacja-teoria-trafo"
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
              etykieta={T.podsumNn}
              wartosc={`${fmtKv(dane.nn_voltage_kv)} · ${ogranicznikOdplywow(dane.outgoing_feeders_nn_count)} odpł.`}
            />
          </KreatorSiatka>
        </KreatorSekcja>
      ) : null}
    </KreatorRama>
  );
}
