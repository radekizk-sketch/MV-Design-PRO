/**
 * Kreator „Dodaj baterię kondensatorów SN" (V12K-048, G-KOMP / GAP-1) — ui2,
 * framework kreatory/rama.
 *
 * Domyka istniejący łańcuch mocy biernej (katalog + PF +jB + reactive_adequacy).
 * Katalog-first (KOMPENSATOR_SN), podgląd B/I_c z backendu, zapis = operacja
 * domenowa `add_shunt_compensator_sn`. ZERO fizyki w UI.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { fetchShuntCapacitorTypes, getCatalogErrorMessage } from '../../../ui/catalog/api';
import type { ShuntCapacitorCatalogType } from '../../../ui/catalog/types';
import {
  fetchShuntCompensatorPreview,
  type ShuntCompensatorPreviewResponse,
} from '../../../ui/network-build/forms/shuntCompensatorPreviewApi';
import { useActiveOperationContext, useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { useSelectionStore } from '../../../ui/selection';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { nazwaObiektuZMigawki } from '../../wyniki/wzorzec/useNazwaObiektu';
import {
  KreatorGotowosc,
  KreatorInfo,
  KreatorNastepnyKrok,
  KreatorPodsumowanie,
  KreatorRama,
  KreatorSekcja,
  KreatorSiatka,
  PoleKatalogu,
  PoleTekstowe,
  PanelTeorii,
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
  fmtKw,
  fmtMvar,
  fmtSiemens,
  maSzyne,
  napiecieNiezgodne,
  parametryZKatalogu,
  typyZgodneZSzyna,
  walidujFormularz,
  zbudujPayload,
  zbudujZapytaniePodgladu,
  type KompensatorFormData,
  type KontekstKompensatora,
  type StatusBaterii,
} from './kompensatorModel';
import { KOMPENSATOR_STRINGS as T } from './strings';
import { WykresQU } from './WykresQU';

const KROKI: readonly KrokKreatora[] = [
  { id: 'typ', tytul: T.krokTyp },
  { id: 'zapis', tytul: T.krokZapis },
];

/** Pole formularza → krok i kontrolka (wskazanie BRAKU_DO_OPERACJI przy zapisie). */
const MIEJSCA: Readonly<Record<string, MiejscePola>> = {
  catalog_ref: { krok: 'typ', pole: 'mvd-kreator-kompensator-katalog' },
};

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function kontekstZOperacji(
  context: Record<string, unknown> | null,
  selectedBus: { id: string; name: string; voltage_kv?: number } | null,
): KontekstKompensatora {
  const busRef = trimmed(context?.bus_ref ?? context?.bus_nn_ref) || (selectedBus?.id ?? '');
  const busName =
    trimmed(context?.bus_name ?? context?.terminal_name) || (selectedBus?.name ?? '');
  const rawV = Number(context?.bus_voltage_kv ?? context?.voltage_kv ?? selectedBus?.voltage_kv);
  return {
    bus_ref: busRef || undefined,
    bus_name: busName || undefined,
    bus_voltage_kv: Number.isFinite(rawV) && rawV > 0 ? rawV : undefined,
  };
}

export function KreatorKompensatoraSn() {
  const context = useActiveOperationContext() as Record<string, unknown> | null;
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const selekcjaPoOperacji = useSelekcjaPoOperacji();
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const selectedElement = useSelectionStore((s) => s.selectedElements[0] ?? null);
  const snapshot = useSnapshotStore((s) => s.snapshot);

  const selectedBus = useMemo(() => {
    if (!selectedElement || selectedElement.type !== 'Bus') return null;
    return { id: selectedElement.id, name: selectedElement.name };
  }, [selectedElement]);

  // Napięcie szyny: z kontekstu operacji, a gdy go brak — z migawki modelu (topologia).
  const kontekst = useMemo(() => {
    const k = kontekstZOperacji(context, selectedBus);
    return k.bus_voltage_kv !== undefined
      ? k
      : { ...k, bus_voltage_kv: napiecieSzyny(snapshot, k.bus_ref) ?? undefined };
  }, [context, selectedBus, snapshot]);
  const hasSzyna = maSzyne(kontekst);

  const [dane, setDane] = useState<KompensatorFormData>(() => ({ ...DANE_DOMYSLNE }));
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);
  const [krok, setKrok] = useState<string>('typ');
  const prowadzenie = useProwadzenie(setKrok);
  const { edytowane, decyzjaProjektanta } = useDecyzjeProjektanta<'catalog_ref'>();

  const [typy, setTypy] = useState<ShuntCapacitorCatalogType[]>([]);
  const [bladKatalogu, setBladKatalogu] = useState<string | null>(null);
  // S9-5 (klasa: bramka enable bez sygnału gotowości) — jawny znacznik
  // ładowania katalogu, niezależny od `typy.length` (katalog pusty PO
  // wczytaniu wygląda inaczej niż katalog W TRAKCIE wczytywania).
  const [katalogLadowanie, setKatalogLadowanie] = useState(true);

  const [podglad, setPodglad] = useState<ShuntCompensatorPreviewResponse | null>(null);
  const [bladPodgladu, setBladPodgladu] = useState<string | null>(null);
  const previewSeq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setBladKatalogu(null);
    setKatalogLadowanie(true);
    fetchShuntCapacitorTypes()
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

  const params = useMemo(
    () => parametryZKatalogu(dane.catalog_ref, typy),
    [dane.catalog_ref, typy],
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
      fetchShuntCompensatorPreview(zapytanie)
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
        etykieta: `${t.name} · ${t.rated_mvar} Mvar · ${t.rated_kv} kV`,
      })),
    [typy],
  );

  // AUTO_PRZYJETE: jedyny typ baterii zgodny napięciem z szyną (źródło jednoznaczne).
  const napiecieKv = kontekst.bus_voltage_kv ?? null;
  const jedynyTyp = useMemo(
    () => (napiecieKv !== null ? jedynaZgodna(typyZgodneZSzyna(typy, napiecieKv)) : null),
    [napiecieKv, typy],
  );
  useEffect(() => {
    if (!jedynyTyp || napiecieKv === null || decyzjaProjektanta('catalog_ref') || dane.catalog_ref) return;
    setDane((p) => ({ ...p, catalog_ref: jedynyTyp.id }));
  }, [dane.catalog_ref, decyzjaProjektanta, jedynyTyp, napiecieKv]);

  const zmien = useCallback(
    <K extends keyof KompensatorFormData>(pole: K, wartosc: KompensatorFormData[K]) => {
      setDane((p) => ({ ...p, [pole]: wartosc }));
      if (pole === 'catalog_ref') edytowane('catalog_ref');
    },
    [edytowane],
  );

  // KONFLIKT_TECHNICZNY — napięcie typu ≠ napięcie szyny: widoczny od razu przy polu typu.
  const napBlad = napiecieNiezgodne(params, kontekst);

  const onZapisz = useCallback(async () => {
    const brak = pierwszyBrak([
      !hasSzyna && { komunikat: T.brakSzynyOpis },
      napBlad && { komunikat: T.ostrzezenieNapiecie, ...MIEJSCA.catalog_ref },
      ...walidujFormularz(dane).map((b) => wskazanieZBledu(b, MIEJSCA)),
      !activeCaseId && { komunikat: T.brakZakresu },
    ]);
    if (brak) {
      prowadzenie.wskaz(brak);
      return;
    }
    prowadzenie.zgas();
    setBladGlobalny(null);
    try {
      const response = await executeDomainOperation(
        activeCaseId as string,
        'add_shunt_compensator_sn',
        zbudujPayload(dane, kontekst),
      );
      if (!response) {
        setBladGlobalny(useSnapshotStore.getState().error ?? T.bladZapisu);
        return;
      }
      if (response.error) {
        setBladGlobalny(response.error);
        return;
      }
      closeForm();
      selekcjaPoOperacji(response, { type: 'Load', name: dane.nazwa.trim() || 'Kompensator SN' });
    } catch (e) {
      setBladGlobalny(e instanceof Error ? e.message : T.bladZapisu);
    }
  }, [activeCaseId, closeForm, dane, executeDomainOperation, hasSzyna, kontekst, napBlad, prowadzenie, selekcjaPoOperacji]);

  const typWybrany = params ? typy.find((t) => t.id === dane.catalog_ref)?.name ?? '' : '';
  const wierszeGotowosci: WierszGotowosci[] = [
    {
      etykieta: T.wierszTyp,
      stan: napBlad ? 'konflikt' : !dane.catalog_ref ? 'do_wyboru' : 'ustalone',
      wartosc: typWybrany,
    },
    {
      etykieta: T.wierszSzyna,
      stan: hasSzyna ? 'ustalone' : 'do_wyboru',
      wartosc: kontekst.bus_name || (hasSzyna ? 'Wskazana' : T.szynaDoWskazania),
    },
    {
      etykieta: T.wierszMoc,
      stan: params ? 'ustalone' : 'do_wyboru',
      wartosc: params ? fmtMvar(params.rated_mvar) : '',
    },
    {
      etykieta: T.wierszNapiecie,
      stan: napBlad ? 'konflikt' : params ? 'ustalone' : 'do_wyboru',
      wartosc: params ? fmtKv(params.rated_kv) : '',
    },
  ];

  const aside = (
    <>
      <KreatorPodsumowanie
        tytul={T.podgladTytul}
        komunikat={bladPodgladu}
        komunikatTon="warn"
        testid="mvd-kreator-kompensator-podsumowanie"
      >
        {podglad ? (
          <>
            <RzadWartosci etykieta={T.paramMvar} wartosc={fmtMvar(podglad.rated_mvar)} />
            <RzadWartosci etykieta={T.podgladB} wartosc={fmtSiemens(podglad.susceptance_siemens)} />
            <RzadWartosci etykieta={T.podgladIc} wartosc={fmtA(podglad.rated_current_a)} />
            <RzadWartosci etykieta={T.podgladZrodlo} wartosc={T.podgladZrodloWartosc} />
          </>
        ) : (
          <p className="mvd-podsum-komunikat">{T.podgladBrak}</p>
        )}
      </KreatorPodsumowanie>
      <KreatorGotowosc tytul={T.kontrolaTytul} wiersze={wierszeGotowosci} testid="mvd-kreator-kompensator-gotowosc" />
      <KreatorNastepnyKrok eyebrow={T.downstreamTytul} opis={T.downstreamOpis} />
    </>
  );

  const paramReadout = params ? (
    <KreatorSiatka kolumny={3}>
      <RzadWartosci etykieta={T.paramMvar} wartosc={fmtMvar(params.rated_mvar)} />
      <RzadWartosci etykieta={T.paramKv} wartosc={fmtKv(params.rated_kv)} />
      <RzadWartosci etykieta={T.paramStraty} wartosc={fmtKw(params.loss_kw)} />
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
        testid: 'mvd-kreator-kompensator-zapisz',
      }}
      akcjaAnuluj={{ etykieta: T.anuluj, onClick: () => closeForm(), testid: 'mvd-kreator-kompensator-anuluj' }}
      krokWstecz={
        krokIndex > 0
          ? { etykieta: T.wstecz, onClick: () => setKrok(KROKI[krokIndex - 1].id), testid: 'mvd-kreator-kompensator-wstecz' }
          : undefined
      }
      krokDalej={
        krokIndex < KROKI.length - 1
          ? { etykieta: T.dalej, onClick: () => setKrok(KROKI[krokIndex + 1].id), testid: 'mvd-kreator-kompensator-dalej' }
          : undefined
      }
      licznikKrokow={T.licznik(krokIndex + 1, KROKI.length)}
      testid="mvd-kreator-kompensator"
    >
      {!hasSzyna ? (
        <KreatorSekcja tytul={T.brakSzynyTytul} testid="mvd-kreator-kompensator-brak-szyny">
          <KreatorInfo>{T.brakSzynyOpis}</KreatorInfo>
        </KreatorSekcja>
      ) : null}

      {krok === 'typ' ? (
        <KreatorSekcja tytul={T.krokTyp} testid="mvd-kreator-kompensator-typ">
          <KreatorInfo>{T.typPomoc}</KreatorInfo>
          <PoleKatalogu
            etykieta={T.typKatalog}
            wartosc={dane.catalog_ref}
            onZmiana={(v) => zmien('catalog_ref', v)}
            opcje={opcjeTypow}
            status={bladKatalogu ? 'error' : 'ready'}
            placeholder={T.typKatalogPlaceholder}
            komunikatBledu={bladKatalogu ?? T.typBlad}
            blad={napBlad ? T.ostrzezenieNapiecie : undefined}
            testid="mvd-kreator-kompensator-katalog"
          />
          <KreatorSiatka kolumny={2}>
            <PoleTekstowe
              etykieta={T.nazwa}
              wartosc={dane.nazwa}
              onZmiana={(v) => zmien('nazwa', v)}
              placeholder={T.nazwaPlaceholder}
              testid="mvd-kreator-kompensator-nazwa"
            />
            <PoleWyboru
              etykieta={T.status}
              wartosc={dane.status}
              onZmiana={(v) => zmien('status', v as StatusBaterii)}
              opcje={T.statusOpcje}
              testid="mvd-kreator-kompensator-status"
            />
          </KreatorSiatka>
          {paramReadout}
          <PanelTeorii
            tytul={T.teoriaTytul}
            opis={T.teoriaOpis}
            wymog={T.teoriaWymog}
            podstawa={T.teoriaPodstawa}
            testid="mvd-kreator-kompensator-teoria"
          >
            <figure className="mvd-wykres-fig">
              <WykresQU />
              <figcaption className="mvd-wykres-cap">{T.teoriaJakCzytac}</figcaption>
            </figure>
          </PanelTeorii>
        </KreatorSekcja>
      ) : null}

      {krok === 'zapis' ? (
        <KreatorSekcja tytul={T.krokZapis} testid="mvd-kreator-kompensator-zapis">
          <KreatorInfo>{T.downstreamOpis}</KreatorInfo>
          <KreatorSiatka kolumny={2}>
            <RzadWartosci
              etykieta={T.wierszSzyna}
              wartosc={
                kontekst.bus_name
                || (kontekst.bus_ref ? nazwaObiektuZMigawki(snapshot, kontekst.bus_ref) : '—')
              }
            />
            <RzadWartosci etykieta={T.wierszMoc} wartosc={fmtMvar(params?.rated_mvar)} />
            <RzadWartosci etykieta={T.podgladIc} wartosc={fmtA(podglad?.rated_current_a)} />
            <RzadWartosci etykieta={T.wierszStan} wartosc={dane.status === 'open' ? 'Wyłączona' : 'Załączona'} />
          </KreatorSiatka>
        </KreatorSekcja>
      ) : null}
    </KreatorRama>
  );
}
