/**
 * Kreator „Dodaj transformator SN/nN" (V12K-048, G-TRF) — ui2, kreatory/rama.
 *
 * Katalog-first (TRAFO_SN_NN), podgląd prądów I₁/I₂ z backendu (R2), pełna
 * konfiguracja regulacji zaczepów (DETC/OLTC) mapująca na kanoniczny TapChanger.
 * ZERO fizyki w UI. Zapis = operacja domenowa `add_transformer_sn_nn`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { fetchTransformerTypes, getCatalogErrorMessage } from '../../../ui/catalog/api';
import type { TransformerType } from '../../../ui/catalog/types';
import { useActiveOperationContext, useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import {
  fetchTransformerRatedCurrents,
  type TransformerRatedCurrentsResponse,
} from '../../../ui/network-build/forms/transformerRatedCurrentsApi';
import { selectBusOptions, useSnapshotStore } from '../../../ui/topology/snapshotStore';
import {
  KreatorGotowosc,
  KreatorInfo,
  KreatorNastepnyKrok,
  KreatorPodsumowanie,
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
  fmtA,
  fmtKv,
  fmtMva,
  fmtPct,
  parametryZKatalogu,
  seedRegulacjiZKatalogu,
  walidujFormularz,
  zbudujPayload,
  zbudujZapytaniePodgladu,
  type BladPola,
  type ControlMode,
  type KontekstTransformatora,
  type RegulatedWinding,
  type RegulationType,
  type TransformatorFormData,
} from './transformatorModel';
import { TRANSFORMATOR_STRINGS as T } from './strings';
import { WykresAvr } from './WykresAvr';

const KROKI: readonly KrokKreatora[] = [
  { id: 'szyny', tytul: T.krokSzyny },
  { id: 'regulacja', tytul: T.krokRegulacja },
  { id: 'zapis', tytul: T.krokZapis },
];

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function kontekstZOperacji(context: Record<string, unknown> | null): KontekstTransformatora {
  if (!context) return {};
  const valid = context.transformer_context_valid !== false;
  return {
    hv_bus_ref: trimmed(context.hv_bus_ref) || undefined,
    lv_bus_ref: trimmed(context.lv_bus_ref) || undefined,
    station_ref: trimmed(context.station_ref) || undefined,
    station_name: trimmed(context.station_name) || undefined,
    hv_bus_name: trimmed(context.hv_bus_name) || undefined,
    lv_bus_name: trimmed(context.lv_bus_name) || undefined,
    block_reason: !valid ? trimmed(context.transformer_block_reason) || undefined : undefined,
  };
}

export function KreatorTransformatoraSnNn() {
  const context = useActiveOperationContext() as Record<string, unknown> | null;
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const selekcjaPoOperacji = useSelekcjaPoOperacji();

  const kontekst = useMemo(() => kontekstZOperacji(context), [context]);
  const busOptions = useMemo(() => selectBusOptions(snapshot), [snapshot]);

  const [dane, setDane] = useState<TransformatorFormData>(() => ({
    ...DANE_DOMYSLNE,
    hv_bus_ref: kontekst.hv_bus_ref ?? '',
    lv_bus_ref: kontekst.lv_bus_ref ?? '',
  }));
  const [bledy, setBledy] = useState<BladPola[]>([]);
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);
  const [krok, setKrok] = useState<string>('szyny');

  const [typy, setTypy] = useState<TransformerType[]>([]);
  const [bladKatalogu, setBladKatalogu] = useState<string | null>(null);
  // S9-5 (klasa: bramka enable bez sygnału gotowości) — jawny znacznik
  // ładowania katalogu, niezależny od `typy.length` (katalog pusty PO
  // wczytaniu wygląda inaczej niż katalog W TRAKCIE wczytywania).
  const [katalogLadowanie, setKatalogLadowanie] = useState(true);
  const [podglad, setPodglad] = useState<TransformerRatedCurrentsResponse | null>(null);
  const [bladPodgladu, setBladPodgladu] = useState<string | null>(null);
  const previewSeq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setBladKatalogu(null);
    setKatalogLadowanie(true);
    fetchTransformerTypes()
      .then((t) => {
        if (!cancelled) setTypy(Array.isArray(t) ? t : []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setTypy([]);
        setBladKatalogu(getCatalogErrorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setKatalogLadowanie(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const params = useMemo(() => parametryZKatalogu(dane.catalog_ref, typy), [dane.catalog_ref, typy]);

  useEffect(() => {
    const zapytanie = zbudujZapytaniePodgladu(params);
    if (!zapytanie) {
      setPodglad(null);
      setBladPodgladu(null);
      return;
    }
    const seq = ++previewSeq.current;
    const t = setTimeout(() => {
      fetchTransformerRatedCurrents(zapytanie)
        .then((res) => {
          if (seq !== previewSeq.current) return;
          setPodglad(res);
          setBladPodgladu(null);
        })
        .catch(() => {
          if (seq !== previewSeq.current) return;
          setPodglad(null);
          setBladPodgladu(T.podgladBlad);
        });
    }, 200);
    return () => clearTimeout(t);
  }, [params]);

  const opcjeTypow = useMemo(
    () =>
      typy.map((t) => ({
        id: t.id,
        etykieta: `${t.name} · ${t.rated_power_mva} MVA · ${t.voltage_hv_kv}/${t.voltage_lv_kv} kV`,
      })),
    [typy],
  );
  const opcjeSzyn = useMemo(
    () => busOptions.map((b) => ({ id: b.ref_id, etykieta: `${b.name} · ${b.voltage_kv} kV` })),
    [busOptions],
  );

  const zmien = useCallback(
    <K extends keyof TransformatorFormData>(pole: K, wartosc: TransformatorFormData[K]) => {
      setDane((p) => ({ ...p, [pole]: wartosc }));
    },
    [],
  );

  const zmienRegulacje = useCallback(
    (regulation_type: RegulationType) => {
      setDane((p) => {
        const next = { ...p, regulation_type };
        return regulation_type === 'NONE' ? next : seedRegulacjiZKatalogu(next, params);
      });
    },
    [params],
  );

  const bladDlaPola = (pole: string): string | undefined => bledy.find((b) => b.field === pole)?.message;
  const hasKontekst = Boolean(kontekst.hv_bus_ref && kontekst.lv_bus_ref) || busOptions.length > 0;
  const blockReason = kontekst.block_reason ?? (busOptions.length === 0 ? T.brakKontekstuOpis : null);

  const onZapisz = useCallback(async () => {
    const walid = walidujFormularz(dane);
    setBledy(walid);
    if (walid.length > 0) return;
    if (!activeCaseId) {
      setBladGlobalny(T.brakZakresu);
      return;
    }
    setBladGlobalny(null);
    try {
      const response = await executeDomainOperation(activeCaseId, 'add_transformer_sn_nn', zbudujPayload(dane, kontekst));
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
        type: 'TransformerBranch',
        name: dane.nazwa.trim() || 'Transformator SN/nN',
      });
    } catch (e) {
      setBladGlobalny(e instanceof Error ? e.message : T.walidacjaStopka);
    }
  }, [activeCaseId, closeForm, dane, executeDomainOperation, kontekst, selekcjaPoOperacji]);

  const regulacjaLabel =
    dane.regulation_type === 'NONE'
      ? 'Bez regulacji'
      : dane.regulation_type === 'DETC'
        ? 'DETC'
        : `OLTC ${dane.control_mode === 'AUTOMATIC' ? '(AVR)' : '(ręczny)'}`;

  const wierszeGotowosci: WierszGotowosci[] = [
    {
      etykieta: T.wierszSzyny,
      stan: dane.hv_bus_ref && dane.lv_bus_ref ? 'kompletne' : 'brak',
      wartosc: dane.hv_bus_ref && dane.lv_bus_ref ? 'Kompletne' : 'Do wskazania',
    },
    {
      etykieta: T.wierszTyp,
      stan: dane.catalog_ref ? 'kompletne' : 'brak',
      wartosc: dane.catalog_ref ? 'Kompletne' : 'Do konfiguracji',
    },
    { etykieta: T.wierszMoc, stan: params ? 'kompletne' : 'ostrzezenie', wartosc: fmtMva(params?.rated_power_mva) },
    { etykieta: T.wierszRegulacja, stan: 'kompletne', wartosc: regulacjaLabel },
  ];

  const aside = (
    <>
      <KreatorPodsumowanie
        tytul={T.podgladTytul}
        komunikat={bladPodgladu}
        komunikatTon="warn"
        testid="mvd-kreator-transformator-podsumowanie"
      >
        {podglad ? (
          <>
            <RzadWartosci etykieta={T.podgladI1} wartosc={fmtA(podglad.primary_current_a)} />
            <RzadWartosci etykieta={T.podgladI2} wartosc={fmtA(podglad.secondary_current_a)} />
            <RzadWartosci etykieta={T.podgladZrodlo} wartosc={T.podgladZrodloWartosc} />
          </>
        ) : (
          <p className="mvd-podsum-komunikat">{T.podgladBrak}</p>
        )}
      </KreatorPodsumowanie>
      <KreatorGotowosc tytul={T.kontrolaTytul} wiersze={wierszeGotowosci} testid="mvd-kreator-transformator-gotowosc" />
      <KreatorNastepnyKrok eyebrow={T.downstreamTytul} opis={T.downstreamOpis} />
    </>
  );

  const paramReadout = params ? (
    <KreatorSiatka kolumny={2}>
      <RzadWartosci etykieta={T.paramMoc} wartosc={fmtMva(params.rated_power_mva)} />
      <RzadWartosci etykieta={T.paramNapiecia} wartosc={`${fmtKv(params.voltage_hv_kv)} / ${fmtKv(params.voltage_lv_kv)}`} />
      <RzadWartosci etykieta={T.paramUk} wartosc={fmtPct(params.uk_percent)} />
      <RzadWartosci etykieta={T.paramZaczepy} wartosc={`${params.tap_min}…${params.tap_max}`} />
    </KreatorSiatka>
  ) : null;

  const krokIndex = KROKI.findIndex((k) => k.id === krok);
  // S9-5 (klasa: bramka enable bez sygnału gotowości) — jedno źródło prawdy
  // dla `disabled` i `data-status` (patrz `KreatorMagistralaSn.tsx`, ta sama
  // karta i ten sam mechanizm powtórzony w tym pliku).
  const stanGotowosci: 'ladowanie' | 'zablokowany' | 'gotowy' =
    !hasKontekst || !activeCaseId
      ? 'zablokowany'
      : katalogLadowanie
        ? 'ladowanie'
        : 'gotowy';
  const zapisZablokowany = stanGotowosci !== 'gotowy';

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
        stanGotowosci === 'ladowanie'
          ? T.katalogLadowanieStopka
          : bledy.length > 0
            ? T.walidacjaStopka
            : blockReason
      }
      status={stanGotowosci}
      akcjaGlowna={{ etykieta: T.zapisz, onClick: onZapisz, zablokowana: zapisZablokowany, testid: 'mvd-kreator-transformator-zapisz' }}
      akcjaAnuluj={{ etykieta: T.anuluj, onClick: () => closeForm(), testid: 'mvd-kreator-transformator-anuluj' }}
      krokWstecz={
        krokIndex > 0
          ? { etykieta: T.wstecz, onClick: () => setKrok(KROKI[krokIndex - 1].id), testid: 'mvd-kreator-transformator-wstecz' }
          : undefined
      }
      krokDalej={
        krokIndex < KROKI.length - 1
          ? { etykieta: T.dalej, onClick: () => setKrok(KROKI[krokIndex + 1].id), testid: 'mvd-kreator-transformator-dalej' }
          : undefined
      }
      licznikKrokow={T.licznik(krokIndex + 1, KROKI.length)}
      testid="mvd-kreator-transformator"
    >
      {blockReason && !hasKontekst ? (
        <KreatorSekcja tytul={T.brakKontekstuTytul} testid="mvd-kreator-transformator-brak">
          <KreatorInfo>{blockReason}</KreatorInfo>
        </KreatorSekcja>
      ) : null}

      {krok === 'szyny' ? (
        <KreatorSekcja tytul={T.krokSzyny} testid="mvd-kreator-transformator-szyny">
          <KreatorSiatka kolumny={2}>
            <PoleWyboru
              etykieta={T.hvBus}
              wartosc={dane.hv_bus_ref}
              onZmiana={(v) => zmien('hv_bus_ref', v)}
              opcje={opcjeSzyn}
              blad={bladDlaPola('hv_bus_ref')}
              testid="mvd-kreator-transformator-hv"
            />
            <PoleWyboru
              etykieta={T.lvBus}
              wartosc={dane.lv_bus_ref}
              onZmiana={(v) => zmien('lv_bus_ref', v)}
              opcje={opcjeSzyn}
              blad={bladDlaPola('lv_bus_ref')}
              testid="mvd-kreator-transformator-lv"
            />
          </KreatorSiatka>
          <KreatorInfo>{T.typPomoc}</KreatorInfo>
          <PoleKatalogu
            etykieta={T.typKatalog}
            wartosc={dane.catalog_ref}
            onZmiana={(v) => zmien('catalog_ref', v)}
            opcje={opcjeTypow}
            status={bladKatalogu ? 'error' : 'ready'}
            placeholder={T.typKatalogPlaceholder}
            komunikatBledu={bladKatalogu ?? T.typBlad}
            testid="mvd-kreator-transformator-katalog"
          />
          {bladDlaPola('catalog_ref') ? <p className="mvd-pole-blad">{bladDlaPola('catalog_ref')}</p> : null}
          <PoleTekstowe
            etykieta={T.nazwa}
            wartosc={dane.nazwa}
            onZmiana={(v) => zmien('nazwa', v)}
            placeholder={T.nazwaPlaceholder}
            testid="mvd-kreator-transformator-nazwa"
          />
          {paramReadout}
          <PanelTeorii
            tytul={T.teoriaSzynyTytul}
            opis={T.teoriaSzynyOpis}
            wymog={T.teoriaSzynyWymog}
            podstawa={T.teoriaSzynyPodstawa}
            testid="mvd-kreator-transformator-teoria-szyny"
          />
        </KreatorSekcja>
      ) : null}

      {krok === 'regulacja' ? (
        <KreatorSekcja tytul={T.krokRegulacja} testid="mvd-kreator-transformator-regulacja">
          <KreatorSiatka kolumny={2}>
            <PoleWyboru
              etykieta={T.regTyp}
              wartosc={dane.regulation_type}
              onZmiana={(v) => zmienRegulacje(v as RegulationType)}
              opcje={T.regTypOpcje}
              testid="mvd-kreator-transformator-regtyp"
            />
            {dane.regulation_type !== 'NONE' ? (
              <PoleWyboru
                etykieta={T.regUzwojenie}
                wartosc={dane.regulated_winding}
                onZmiana={(v) => zmien('regulated_winding', v as RegulatedWinding)}
                opcje={T.regUzwojenieOpcje}
                testid="mvd-kreator-transformator-uzwojenie"
              />
            ) : null}
          </KreatorSiatka>

          {dane.regulation_type === 'NONE' ? (
            <KreatorInfo>{T.regBezPomoc}</KreatorInfo>
          ) : (
            <>
              <KreatorSiatka kolumny={2}>
                <PoleLiczbowe etykieta={T.tapMin} wartosc={dane.tap_min_position} onZmiana={(v) => zmien('tap_min_position', v ?? 0)} blad={bladDlaPola('tap_min_position')} testid="mvd-kreator-transformator-tapmin" />
                <PoleLiczbowe etykieta={T.tapMax} wartosc={dane.tap_max_position} onZmiana={(v) => zmien('tap_max_position', v ?? 0)} testid="mvd-kreator-transformator-tapmax" />
                <PoleLiczbowe etykieta={T.tapNeutral} wartosc={dane.tap_neutral_position} onZmiana={(v) => zmien('tap_neutral_position', v ?? 0)} testid="mvd-kreator-transformator-tapneutral" />
                <PoleLiczbowe etykieta={T.tapCurrent} wartosc={dane.tap_current_position} onZmiana={(v) => zmien('tap_current_position', v ?? 0)} testid="mvd-kreator-transformator-tapcurrent" />
              </KreatorSiatka>
              <KreatorSiatka kolumny={2}>
                <PoleLiczbowe etykieta={T.tapStep} jednostka="%" wartosc={dane.tap_step_percent} onZmiana={(v) => zmien('tap_step_percent', v ?? 0)} krok={0.01} blad={bladDlaPola('tap_step_percent')} testid="mvd-kreator-transformator-tapstep" />
                {dane.regulation_type === 'OLTC' ? (
                  <PoleWyboru etykieta={T.controlMode} wartosc={dane.control_mode} onZmiana={(v) => zmien('control_mode', v as ControlMode)} opcje={T.controlModeOpcje} testid="mvd-kreator-transformator-control" />
                ) : null}
              </KreatorSiatka>
              {dane.regulation_type === 'OLTC' && dane.control_mode === 'AUTOMATIC' ? (
                <>
                  <KreatorInfo>{T.regAvrPomoc}</KreatorInfo>
                  <KreatorSiatka kolumny={2}>
                    <PoleLiczbowe etykieta={T.setpoint} jednostka="kV" wartosc={dane.voltage_setpoint_kv} onZmiana={(v) => zmien('voltage_setpoint_kv', v)} blad={bladDlaPola('voltage_setpoint_kv')} testid="mvd-kreator-transformator-setpoint" />
                    <PoleLiczbowe etykieta={T.deadband} jednostka="kV" wartosc={dane.deadband_kv} onZmiana={(v) => zmien('deadband_kv', v)} testid="mvd-kreator-transformator-deadband" />
                  </KreatorSiatka>
                </>
              ) : null}
            </>
          )}
          <PanelTeorii
            tytul={T.teoriaRegTytul}
            opis={T.teoriaRegOpis}
            wymog={T.teoriaRegWymog}
            podstawa={T.teoriaRegPodstawa}
            testid="mvd-kreator-transformator-teoria"
          >
            {dane.regulation_type !== 'NONE' ? (
              <figure className="mvd-wykres-fig">
                <WykresAvr
                  tapMin={dane.tap_min_position}
                  tapMax={dane.tap_max_position}
                  tapNeutral={dane.tap_neutral_position}
                  stepPct={dane.tap_step_percent}
                  dbFrac={
                    dane.regulation_type === 'OLTC' &&
                    dane.control_mode === 'AUTOMATIC' &&
                    dane.voltage_setpoint_kv &&
                    dane.voltage_setpoint_kv > 0 &&
                    dane.deadband_kv
                      ? dane.deadband_kv / dane.voltage_setpoint_kv
                      : null
                  }
                />
                <figcaption className="mvd-wykres-cap">{T.teoriaRegJakCzytac}</figcaption>
              </figure>
            ) : null}
          </PanelTeorii>
        </KreatorSekcja>
      ) : null}

      {krok === 'zapis' ? (
        <KreatorSekcja tytul={T.krokZapis} testid="mvd-kreator-transformator-zapis">
          <KreatorInfo>{T.downstreamOpis}</KreatorInfo>
          <KreatorSiatka kolumny={2}>
            <RzadWartosci etykieta={T.wierszTyp} wartosc={dane.catalog_ref ?? '—'} />
            <RzadWartosci etykieta={T.wierszMoc} wartosc={fmtMva(params?.rated_power_mva)} />
            <RzadWartosci etykieta={T.podgladI1} wartosc={fmtA(podglad?.primary_current_a)} />
            <RzadWartosci etykieta={T.podgladI2} wartosc={fmtA(podglad?.secondary_current_a)} />
            <RzadWartosci etykieta={T.wierszRegulacja} wartosc={regulacjaLabel} />
          </KreatorSiatka>
        </KreatorSekcja>
      ) : null}
    </KreatorRama>
  );
}
