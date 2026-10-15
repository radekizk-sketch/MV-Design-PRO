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
import { useGrupyPolaczen } from '../../../ui/catalog/useGrupyPolaczen';
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
  jedynaZgodna,
  napiecieSzyny,
  pierwszyBrak,
  useDecyzjeProjektanta,
  useProwadzenie,
  useSelekcjaPoOperacji,
  wskazanieZBledu,
  type KrokKreatora,
  type MiejscePola,
  type WierszGotowosci,
} from '../rama';
import {
  DANE_DOMYSLNE,
  fmtA,
  fmtKv,
  fmtMva,
  fmtPct,
  konfliktyFormularza,
  parametryZKatalogu,
  seedRegulacjiZKatalogu,
  tabliczkaZgodnaZSzynami,
  walidujFormularz,
  zaczepyZTabliczki,
  zbudujPayload,
  zbudujZapytaniePodgladu,
  type ControlMode,
  type KontekstTransformatora,
  type RegulatedWinding,
  type RegulationType,
  type TransformatorFormData,
} from './transformatorModel';
import { wPasmieNn, wPasmieSn } from '../../model/pasmaNapieciowe';
import { TRANSFORMATOR_STRINGS as T } from './strings';
import { WykresAvr } from './WykresAvr';

const KROKI: readonly KrokKreatora[] = [
  { id: 'szyny', tytul: T.krokSzyny },
  { id: 'regulacja', tytul: T.krokRegulacja },
  { id: 'zapis', tytul: T.krokZapis },
];

/** Pole formularza → krok i kontrolka (wskazanie BRAKU_DO_OPERACJI przy zapisie). */
const MIEJSCA: Readonly<Record<string, MiejscePola>> = {
  hv_bus_ref: { krok: 'szyny', pole: 'mvd-kreator-transformator-hv' },
  lv_bus_ref: { krok: 'szyny', pole: 'mvd-kreator-transformator-lv' },
  catalog_ref: { krok: 'szyny', pole: 'mvd-kreator-transformator-katalog' },
  tap_min_position: { krok: 'regulacja', pole: 'mvd-kreator-transformator-tapmin' },
  tap_max_position: { krok: 'regulacja', pole: 'mvd-kreator-transformator-tapmax' },
  tap_neutral_position: { krok: 'regulacja', pole: 'mvd-kreator-transformator-tapneutral' },
  tap_current_position: { krok: 'regulacja', pole: 'mvd-kreator-transformator-tapcurrent' },
  tap_step_percent: { krok: 'regulacja', pole: 'mvd-kreator-transformator-tapstep' },
  voltage_setpoint_kv: { krok: 'regulacja', pole: 'mvd-kreator-transformator-setpoint' },
};

type PoleAuto =
  | 'hv_bus_ref'
  | 'lv_bus_ref'
  | 'catalog_ref'
  | 'tap_min_position'
  | 'tap_max_position'
  | 'tap_neutral_position'
  | 'tap_current_position'
  | 'tap_step_percent';

const POLA_ZACZEPOW = [
  'tap_min_position',
  'tap_max_position',
  'tap_neutral_position',
  'tap_current_position',
  'tap_step_percent',
] as const;

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
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);
  const [krok, setKrok] = useState<string>('szyny');
  const prowadzenie = useProwadzenie(setKrok);
  const { edytowane, decyzjaProjektanta } = useDecyzjeProjektanta<PoleAuto>();

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
  const grupyPolaczen = useGrupyPolaczen();
  const opcjeGrup = useMemo(
    () => [
      { id: '', etykieta: T.grupaZKatalogu(params?.vector_group ?? null) },
      ...(grupyPolaczen ?? []).map((g) => ({ id: g, etykieta: g })),
    ],
    [grupyPolaczen, params],
  );

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
      if ((['hv_bus_ref', 'lv_bus_ref', 'catalog_ref', ...POLA_ZACZEPOW] as string[]).includes(pole)) {
        edytowane(pole as PoleAuto);
      }
    },
    [edytowane],
  );

  const napiecieHv = useMemo(() => napiecieSzyny(snapshot, dane.hv_bus_ref), [dane.hv_bus_ref, snapshot]);
  const napiecieLv = useMemo(() => napiecieSzyny(snapshot, dane.lv_bus_ref), [dane.lv_bus_ref, snapshot]);

  // AUTO_PRZYJETE: szyny z kontekstu stacji, a bez niego — jedyna szyna SN / jedyna szyna nN
  // modelu (topologia). Kilka szyn = wybór projektanta z listy.
  // Pasma z jednego lustra predykatu backendu (`ui2/model/pasmaNapieciowe`).
  const jedynaSzynaSn = useMemo(() => jedynaZgodna(busOptions, (b) => wPasmieSn(b.voltage_kv)), [busOptions]);
  const jedynaSzynaNn = useMemo(() => jedynaZgodna(busOptions, (b) => wPasmieNn(b.voltage_kv)), [busOptions]);
  useEffect(() => {
    if (!dane.hv_bus_ref && jedynaSzynaSn && !decyzjaProjektanta('hv_bus_ref')) {
      setDane((p) => ({ ...p, hv_bus_ref: jedynaSzynaSn.ref_id }));
    }
    if (!dane.lv_bus_ref && jedynaSzynaNn && !decyzjaProjektanta('lv_bus_ref')) {
      setDane((p) => ({ ...p, lv_bus_ref: jedynaSzynaNn.ref_id }));
    }
  }, [dane.hv_bus_ref, dane.lv_bus_ref, decyzjaProjektanta, jedynaSzynaNn, jedynaSzynaSn]);

  // AUTO_PRZYJETE: jedyny transformator katalogu o napięciach tych szyn (kilka = wybór).
  const jedynyTyp = useMemo(
    () =>
      napiecieHv !== null && napiecieLv !== null
        ? jedynaZgodna(typy, (t) => tabliczkaZgodnaZSzynami(t, napiecieHv, napiecieLv))
        : null,
    [napiecieHv, napiecieLv, typy],
  );
  useEffect(() => {
    if (!jedynyTyp || dane.catalog_ref || decyzjaProjektanta('catalog_ref')) return;
    setDane((p) => ({ ...p, catalog_ref: jedynyTyp.id }));
  }, [dane.catalog_ref, decyzjaProjektanta, jedynyTyp]);

  // AUTO_PRZYJETE: zaczepy z tabliczki wybranej pozycji katalogowej (jedno źródło, to samo
  // co w kreatorze stacji). Zmiana pozycji katalogowej odświeża wartości nieedytowane.
  const nazwaTypu = typy.find((t) => t.id === dane.catalog_ref)?.name ?? '';
  useEffect(() => {
    if (dane.regulation_type === 'NONE') return;
    const zaczepy = zaczepyZTabliczki(params);
    if (!zaczepy) return;
    setDane((p) => {
      let zmiana = false;
      const nastepne = { ...p };
      for (const pole of POLA_ZACZEPOW) {
        if (decyzjaProjektanta(pole)) continue;
        if (nastepne[pole] !== zaczepy[pole]) {
          nastepne[pole] = zaczepy[pole];
          zmiana = true;
        }
      }
      return zmiana ? nastepne : p;
    });
  }, [dane.regulation_type, decyzjaProjektanta, params]);

  const zmienRegulacje = useCallback(
    (regulation_type: RegulationType) => {
      setDane((p) => {
        const next = { ...p, regulation_type };
        return regulation_type === 'NONE' ? next : seedRegulacjiZKatalogu(next, params);
      });
    },
    [params],
  );

  // KONFLIKT_TECHNICZNY — widoczny od razu przy polu (ta sama szyna, napięcia tabliczki ≠
  // szyny, zaczep min ≥ max, krok niedodatni, pozycja poza zakresem).
  const konflikty = useMemo(
    () => konfliktyFormularza(dane, params, napiecieHv, napiecieLv),
    [dane, napiecieHv, napiecieLv, params],
  );
  const konfliktDlaPola = (pole: string): string | undefined =>
    konflikty.find((b) => b.field === pole)?.message;
  const hasKontekst = Boolean(kontekst.hv_bus_ref && kontekst.lv_bus_ref) || busOptions.length > 0;
  const blockReason = kontekst.block_reason ?? (busOptions.length === 0 ? T.brakKontekstuOpis : null);

  const onZapisz = useCallback(async () => {
    const brak = pierwszyBrak([
      !hasKontekst && { komunikat: blockReason ?? T.brakKontekstuOpis },
      ...walidujFormularz(dane, params, napiecieHv, napiecieLv).map((b) => wskazanieZBledu(b, MIEJSCA)),
      !activeCaseId && { komunikat: T.brakZakresu },
    ]);
    if (brak) {
      prowadzenie.wskaz(brak);
      return;
    }
    prowadzenie.zgas();
    setBladGlobalny(null);
    try {
      const response = await executeDomainOperation(activeCaseId as string, 'add_transformer_sn_nn', zbudujPayload(dane, kontekst));
      if (!response) {
        setBladGlobalny(useSnapshotStore.getState().error ?? T.bladZapisu);
        return;
      }
      if (response.error) {
        setBladGlobalny(response.error);
        return;
      }
      closeForm();
      selekcjaPoOperacji(response, {
        type: 'TransformerBranch',
        name: dane.nazwa.trim() || 'Transformator',
      });
    } catch (e) {
      setBladGlobalny(e instanceof Error ? e.message : T.bladZapisu);
    }
  }, [activeCaseId, blockReason, closeForm, dane, executeDomainOperation, hasKontekst, kontekst, napiecieHv, napiecieLv, params, prowadzenie, selekcjaPoOperacji]);

  const regulacjaLabel =
    dane.regulation_type === 'NONE'
      ? 'Bez regulacji'
      : dane.regulation_type === 'DETC'
        ? 'DETC'
        : `OLTC ${dane.control_mode === 'AUTOMATIC' ? '(AVR)' : '(ręczny)'}`;

  const nazwaSzyny = (ref: string): string => busOptions.find((b) => b.ref_id === ref)?.name ?? ref;
  const wierszeGotowosci: WierszGotowosci[] = [
    {
      etykieta: T.wierszSzyny,
      stan: konfliktDlaPola('lv_bus_ref')
        ? 'konflikt'
        : !dane.hv_bus_ref || !dane.lv_bus_ref
          ? 'do_wyboru'
          : 'ustalone',
      wartosc: dane.hv_bus_ref && dane.lv_bus_ref ? `${nazwaSzyny(dane.hv_bus_ref)} / ${nazwaSzyny(dane.lv_bus_ref)}` : T.szynyDoWskazania,
    },
    {
      etykieta: T.wierszTyp,
      stan: konfliktDlaPola('catalog_ref') ? 'konflikt' : !dane.catalog_ref ? 'do_wyboru' : 'ustalone',
      wartosc: nazwaTypu,
    },
    { etykieta: T.wierszMoc, stan: params ? 'ustalone' : 'do_wyboru', wartosc: params ? fmtMva(params.rated_power_mva) : '' },
    {
      etykieta: T.wierszRegulacja,
      stan: POLA_ZACZEPOW.some((pole) => konfliktDlaPola(pole)) ? 'konflikt' : 'ustalone',
      wartosc: regulacjaLabel,
    },
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
      <RzadWartosci etykieta={T.paramGrupa} wartosc={dane.vector_group ?? params.vector_group ?? '—'} />
      <RzadWartosci etykieta={T.paramZaczepy} wartosc={`${params.tap_min}…${params.tap_max}`} />
    </KreatorSiatka>
  ) : null;

  const krokIndex = KROKI.findIndex((k) => k.id === krok);

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
        blokada: katalogLadowanie ? 'ladowanie' : null,
        testid: 'mvd-kreator-transformator-zapisz',
      }}
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
              opcje={[{ id: '', etykieta: T.szynaPlaceholder }, ...opcjeSzyn]}
              blad={konfliktDlaPola('hv_bus_ref')}
              testid="mvd-kreator-transformator-hv"
            />
            <PoleWyboru
              etykieta={T.lvBus}
              wartosc={dane.lv_bus_ref}
              onZmiana={(v) => zmien('lv_bus_ref', v)}
              opcje={[{ id: '', etykieta: T.szynaPlaceholder }, ...opcjeSzyn]}
              blad={konfliktDlaPola('lv_bus_ref')}
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
            blad={konfliktDlaPola('catalog_ref')}
            testid="mvd-kreator-transformator-katalog"
          />
          <PoleTekstowe
            etykieta={T.nazwa}
            wartosc={dane.nazwa}
            onZmiana={(v) => zmien('nazwa', v)}
            placeholder={T.nazwaPlaceholder}
            testid="mvd-kreator-transformator-nazwa"
          />
          {paramReadout}
          <PoleWyboru
            etykieta={T.grupaPolaczen}
            wartosc={dane.vector_group ?? ''}
            onZmiana={(v) => zmien('vector_group', v || null)}
            opcje={opcjeGrup}
            pomoc={T.grupaPomoc}
            wylaczone={!dane.catalog_ref}
            testid="mvd-kreator-transformator-grupa"
          />
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
                <PoleLiczbowe etykieta={T.tapMin} wartosc={dane.tap_min_position} onZmiana={(v) => zmien('tap_min_position', v)} blad={konfliktDlaPola('tap_min_position')} testid="mvd-kreator-transformator-tapmin" />
                <PoleLiczbowe etykieta={T.tapMax} wartosc={dane.tap_max_position} onZmiana={(v) => zmien('tap_max_position', v)} testid="mvd-kreator-transformator-tapmax" />
                <PoleLiczbowe etykieta={T.tapNeutral} wartosc={dane.tap_neutral_position} onZmiana={(v) => zmien('tap_neutral_position', v)} testid="mvd-kreator-transformator-tapneutral" />
                <PoleLiczbowe etykieta={T.tapCurrent} wartosc={dane.tap_current_position} onZmiana={(v) => zmien('tap_current_position', v)} blad={konfliktDlaPola('tap_current_position')} testid="mvd-kreator-transformator-tapcurrent" />
              </KreatorSiatka>
              <KreatorSiatka kolumny={2}>
                <PoleLiczbowe etykieta={T.tapStep} jednostka="%" wartosc={dane.tap_step_percent} onZmiana={(v) => zmien('tap_step_percent', v)} krok={0.01} blad={konfliktDlaPola('tap_step_percent')} testid="mvd-kreator-transformator-tapstep" />
                {dane.regulation_type === 'OLTC' ? (
                  <PoleWyboru etykieta={T.controlMode} wartosc={dane.control_mode} onZmiana={(v) => zmien('control_mode', v as ControlMode)} opcje={T.controlModeOpcje} testid="mvd-kreator-transformator-control" />
                ) : null}
              </KreatorSiatka>
              {dane.regulation_type === 'OLTC' && dane.control_mode === 'AUTOMATIC' ? (
                <>
                  <KreatorInfo>{T.regAvrPomoc}</KreatorInfo>
                  <KreatorSiatka kolumny={2}>
                    <PoleLiczbowe etykieta={T.setpoint} jednostka="kV" wartosc={dane.voltage_setpoint_kv} onZmiana={(v) => zmien('voltage_setpoint_kv', v)} blad={konfliktDlaPola('voltage_setpoint_kv')} testid="mvd-kreator-transformator-setpoint" />
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
            {dane.regulation_type !== 'NONE'
            && dane.tap_min_position !== null
            && dane.tap_max_position !== null
            && dane.tap_neutral_position !== null
            && dane.tap_step_percent !== null
            && dane.tap_min_position < dane.tap_max_position ? (
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
            <RzadWartosci etykieta={T.wierszTyp} wartosc={nazwaTypu || '—'} />
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
