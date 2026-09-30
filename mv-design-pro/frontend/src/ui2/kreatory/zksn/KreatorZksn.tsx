/**
 * Kreator „Złącze kablowe SN (ZKSN)" — ui2, kreatory/rama.
 *
 * Wstawia ZKSN (rozdzielnicę kablową SN) na odcinku kablowym SN. Katalog-first
 * (mv_branch_points / ZKSN); liczba portów odgałęzienia z wariantu katalogowego.
 * Zapis = operacja domenowa `insert_zksn_on_segment_sn`. ZERO fizyki w UI
 * (kontrakt payloadu bez zmian względem legacy InsertZksnForm).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { fetchBranchPointTypes } from '../../../ui/catalog/api';
import type { BranchPointCatalogType } from '../../../ui/catalog/types';
import { useActiveOperationContext, useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import type { Branch, EnergyNetworkModel } from '../../../types/enm';
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
  RzadWartosci,
  useSelekcjaPoOperacji,
  type KrokKreatora,
  type WierszGotowosci,
} from '../rama';
import {
  DANE_DOMYSLNE,
  fmtPct01,
  maOdcinek,
  opisWariantu,
  problemTorowosci,
  walidujFormularz,
  zbudujPayload,
  type BladPola,
  type KontekstZksn,
  type ZksnFormData,
} from './zksnModel';
import { ZKSN_STRINGS as T } from './strings';

const KROKI: readonly KrokKreatora[] = [
  { id: 'zksn', tytul: T.krokKatalog },
  { id: 'zapis', tytul: T.krokZapis },
];

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function segmentRef(branch: Branch): string {
  return branch.ref_id || branch.id;
}

function znajdzOdcinek(
  snapshot: EnergyNetworkModel | null | undefined,
  segmentId: string,
): Branch | undefined {
  if (!segmentId) return undefined;
  return snapshot?.branches?.find((b) => segmentRef(b) === segmentId || b.id === segmentId);
}

function pozycjaZKontekstu(context: Record<string, unknown> | null): number | undefined {
  if (!context) return undefined;
  const explicit = Number(context.position_on_segment);
  if (Number.isFinite(explicit)) return Math.min(1, Math.max(0, explicit));
  const insertAt = context.insert_at;
  if (insertAt && typeof insertAt === 'object') {
    const value = Number((insertAt as Record<string, unknown>).value);
    if (Number.isFinite(value)) return Math.min(1, Math.max(0, value));
  }
  return context.placement_mode === 'ENDPOINT_APPEND' ? 1 : undefined;
}

function kontekstZOperacji(
  context: Record<string, unknown> | null,
  snapshot: EnergyNetworkModel | null | undefined,
): KontekstZksn {
  if (!context) return {};
  const segId = trimmed(context.segment_id ?? context.segment_ref ?? context.segmentRef);
  const segment = znajdzOdcinek(snapshot, segId);
  return {
    segment_id: segId || undefined,
    segment_label:
      trimmed(context.segmentLabel ?? context.segment_name)
      || trimmed(segment?.name)
      || (segId ? 'Kabel SN' : undefined),
    segment_type: segment?.type,
    switch_state: context.switch_state,
    polozenie: pozycjaZKontekstu(context),
  };
}

export function KreatorZksn() {
  const context = useActiveOperationContext() as Record<string, unknown> | null;
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const selekcjaPoOperacji = useSelekcjaPoOperacji();
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);

  const kontekst = useMemo(() => kontekstZOperacji(context, snapshot), [context, snapshot]);
  const hasOdcinek = maOdcinek(kontekst);
  const problemTor = useMemo(() => problemTorowosci(kontekst), [kontekst]);

  const [dane, setDane] = useState<ZksnFormData>(() => ({
    ...DANE_DOMYSLNE,
    polozenie: kontekst.polozenie ?? DANE_DOMYSLNE.polozenie,
  }));
  const [bledy, setBledy] = useState<BladPola[]>([]);
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);
  const [krok, setKrok] = useState<string>('zksn');

  const [typy, setTypy] = useState<BranchPointCatalogType[]>([]);
  const [bladKatalogu, setBladKatalogu] = useState<string | null>(null);
  // S9-5 (klasa: bramka enable bez sygnału gotowości) — jawny znacznik
  // ładowania katalogu, niezależny od `typy.length` (katalog pusty PO
  // wczytaniu wygląda inaczej niż katalog W TRAKCIE wczytywania).
  const [katalogLadowanie, setKatalogLadowanie] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setBladKatalogu(null);
    setKatalogLadowanie(true);
    fetchBranchPointTypes('ZKSN')
      .then((t) => {
        if (!cancelled) setTypy(Array.isArray(t) ? t : []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setTypy([]);
        setBladKatalogu(e instanceof Error ? e.message : T.typBlad);
      })
      .finally(() => {
        if (!cancelled) setKatalogLadowanie(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const params = useMemo(
    () => (dane.catalog_ref ? typy.find((t) => t.id === dane.catalog_ref) ?? null : null),
    [dane.catalog_ref, typy],
  );

  const opcjeTypow = useMemo(
    () => typy.map((t) => ({ id: t.id, etykieta: `${t.name} · ${opisWariantu(t.branch_ports_count)}` })),
    [typy],
  );

  const zmien = useCallback(
    <K extends keyof ZksnFormData>(pole: K, wartosc: ZksnFormData[K]) => {
      setDane((p) => ({ ...p, [pole]: wartosc }));
    },
    [],
  );

  // Wybór wariantu z katalogu determinuje liczbę portów odgałęzienia (bez fabrykacji).
  const wybierzKatalog = useCallback(
    (id: string | null) => {
      const wariant = id ? typy.find((t) => t.id === id) ?? null : null;
      setDane((p) => ({
        ...p,
        catalog_ref: id,
        branch_ports_count: wariant?.branch_ports_count ?? p.branch_ports_count,
        nazwa: p.nazwa.trim() ? p.nazwa : wariant?.name ?? p.nazwa,
      }));
    },
    [typy],
  );

  const bladDlaPola = (pole: string): string | undefined => bledy.find((b) => b.field === pole)?.message;

  // S9-5 (klasa: bramka enable bez sygnału gotowości) — jedno źródło prawdy
  // dla `disabled` i `data-status` (patrz `KreatorMagistralaSn.tsx`, ta sama
  // karta i ten sam mechanizm powtórzony w tym pliku).
  const stanGotowosci: 'ladowanie' | 'zablokowany' | 'gotowy' =
    !hasOdcinek || Boolean(problemTor) || !activeCaseId
      ? 'zablokowany'
      : katalogLadowanie
        ? 'ladowanie'
        : 'gotowy';
  const zapisMozliwy = stanGotowosci === 'gotowy';

  const onZapisz = useCallback(async () => {
    if (!hasOdcinek) {
      setBladGlobalny(T.brakOdcinkaOpis);
      return;
    }
    if (problemTor) {
      setBladGlobalny(problemTor);
      return;
    }
    const walid = walidujFormularz(dane);
    setBledy(walid);
    if (walid.length > 0) return;
    if (!activeCaseId) {
      setBladGlobalny(T.brakZakresu);
      return;
    }
    setBladGlobalny(null);
    try {
      const response = await executeDomainOperation(
        activeCaseId,
        'insert_zksn_on_segment_sn',
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
      selekcjaPoOperacji(response, { type: 'BranchPole', name: dane.nazwa.trim() || 'ZKSN SN' });
    } catch (e) {
      setBladGlobalny(e instanceof Error ? e.message : T.walidacjaStopka);
    }
  }, [activeCaseId, closeForm, dane, executeDomainOperation, hasOdcinek, kontekst, problemTor, selekcjaPoOperacji]);

  const wierszeGotowosci: WierszGotowosci[] = [
    {
      etykieta: T.wierszOdcinek,
      stan: hasOdcinek ? 'kompletne' : 'brak',
      wartosc: kontekst.segment_label || (hasOdcinek ? 'Wskazany' : 'Brak'),
    },
    {
      etykieta: T.wierszTor,
      stan: problemTor ? 'brak' : 'kompletne',
      wartosc: problemTor ? 'Nieprawidłowy tor' : 'Kabel SN',
    },
    {
      etykieta: T.wierszWariant,
      stan: dane.catalog_ref ? 'kompletne' : 'brak',
      wartosc: dane.catalog_ref ? opisWariantu(dane.branch_ports_count) : 'Do konfiguracji',
    },
    { etykieta: T.wierszPolozenie, stan: 'kompletne', wartosc: fmtPct01(dane.polozenie) },
  ];

  const aside = (
    <>
      <KreatorGotowosc tytul={T.kontrolaTytul} wiersze={wierszeGotowosci} testid="mvd-kreator-zksn-gotowosc" />
      <KreatorNastepnyKrok eyebrow={T.downstreamTytul} opis={T.downstreamOpis} />
    </>
  );

  const paramReadout = params ? (
    <KreatorSiatka kolumny={2}>
      <RzadWartosci etykieta={T.paramLacznik} wartosc={params.switch_device_kind ?? '—'} />
      <RzadWartosci etykieta={T.paramPorty} wartosc={`${params.branch_ports_count}`} />
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
      walidacja={
        stanGotowosci === 'ladowanie'
          ? T.katalogLadowanieStopka
          : bledy.length > 0
            ? T.walidacjaStopka
            : problemTor ?? (!hasOdcinek ? T.brakOdcinkaOpis : null)
      }
      status={stanGotowosci}
      akcjaGlowna={{ etykieta: T.zapisz, onClick: onZapisz, zablokowana: !zapisMozliwy, testid: 'mvd-kreator-zksn-zapisz' }}
      akcjaAnuluj={{ etykieta: T.anuluj, onClick: () => closeForm(), testid: 'mvd-kreator-zksn-anuluj' }}
      krokWstecz={
        krokIndex > 0
          ? { etykieta: T.wstecz, onClick: () => setKrok(KROKI[krokIndex - 1].id), testid: 'mvd-kreator-zksn-wstecz' }
          : undefined
      }
      krokDalej={
        krokIndex < KROKI.length - 1
          ? { etykieta: T.dalej, onClick: () => setKrok(KROKI[krokIndex + 1].id), testid: 'mvd-kreator-zksn-dalej' }
          : undefined
      }
      licznikKrokow={T.licznik(krokIndex + 1, KROKI.length)}
      testid="mvd-kreator-zksn"
    >
      {!hasOdcinek ? (
        <KreatorSekcja tytul={T.brakOdcinkaTytul} testid="mvd-kreator-zksn-brak">
          <KreatorInfo>{T.brakOdcinkaOpis}</KreatorInfo>
        </KreatorSekcja>
      ) : null}

      {hasOdcinek && problemTor ? (
        <KreatorSekcja tytul={T.wierszTor} testid="mvd-kreator-zksn-tor">
          <KreatorInfo>{problemTor}</KreatorInfo>
        </KreatorSekcja>
      ) : null}

      {krok === 'zksn' ? (
        <KreatorSekcja tytul={T.krokKatalog} testid="mvd-kreator-zksn-sekcja">
          <KreatorInfo>{T.typPomoc}</KreatorInfo>
          <PoleKatalogu
            etykieta={T.typKatalog}
            wartosc={dane.catalog_ref}
            onZmiana={wybierzKatalog}
            opcje={opcjeTypow}
            status={bladKatalogu ? 'error' : 'ready'}
            placeholder={T.typKatalogPlaceholder}
            komunikatBledu={bladKatalogu ?? T.typBlad}
            wymagane
            testid="mvd-kreator-zksn-katalog"
          />
          {bladDlaPola('catalog_ref') ? <p className="mvd-pole-blad">{bladDlaPola('catalog_ref')}</p> : null}
          <KreatorSiatka kolumny={2}>
            <PoleLiczbowe
              etykieta={T.polozenie}
              wartosc={dane.polozenie}
              onZmiana={(v) => zmien('polozenie', v ?? 0)}
              krok={0.05}
              min={0}
              max={1}
              pomoc={T.polozeniePomoc}
              blad={bladDlaPola('polozenie')}
              testid="mvd-kreator-zksn-polozenie"
            />
            <PoleTekstowe
              etykieta={T.nazwa}
              wartosc={dane.nazwa}
              onZmiana={(v) => zmien('nazwa', v)}
              placeholder={T.nazwaPlaceholder}
              testid="mvd-kreator-zksn-nazwa"
            />
          </KreatorSiatka>
          {params ? <RzadWartosci etykieta={T.wariant} wartosc={opisWariantu(dane.branch_ports_count)} /> : null}
          {paramReadout}
          <PanelTeorii
            tytul={T.teoriaTytul}
            opis={T.teoriaOpis}
            wymog={T.teoriaWymog}
            podstawa={T.teoriaPodstawa}
            testid="mvd-kreator-zksn-teoria"
          />
        </KreatorSekcja>
      ) : null}

      {krok === 'zapis' ? (
        <KreatorSekcja tytul={T.krokZapis} testid="mvd-kreator-zksn-zapis">
          <KreatorInfo>{T.downstreamOpis}</KreatorInfo>
          <KreatorSiatka kolumny={2}>
            <RzadWartosci etykieta={T.wierszOdcinek} wartosc={kontekst.segment_label || '—'} />
            <RzadWartosci etykieta={T.wierszWariant} wartosc={opisWariantu(dane.branch_ports_count)} />
            <RzadWartosci etykieta={T.wierszPolozenie} wartosc={fmtPct01(dane.polozenie)} />
            <RzadWartosci etykieta={T.nazwa} wartosc={dane.nazwa.trim() || 'ZKSN SN'} />
          </KreatorSiatka>
        </KreatorSekcja>
      ) : null}
    </KreatorRama>
  );
}
