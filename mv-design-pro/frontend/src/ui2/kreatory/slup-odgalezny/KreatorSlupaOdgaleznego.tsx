/**
 * Kreator „Słup rozgałęźny SN" — ui2, kreatory/rama.
 *
 * Wstawia słup rozgałęźny (węzeł odczepu) na odcinku linii napowietrznej SN.
 * Katalog-first (mv_branch_points / BRANCH_POLE). Zapis = operacja domenowa
 * `insert_branch_pole_on_segment_sn`. ZERO fizyki w UI (kontrakt payloadu bez
 * zmian względem legacy InsertBranchPoleForm).
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
  problemTorowosci,
  walidujFormularz,
  zbudujPayload,
  type BladPola,
  type KontekstSlupa,
  type SlupOdgaleznyFormData,
} from './slupOdgaleznyModel';
import { SLUP_STRINGS as T } from './strings';

const KROKI: readonly KrokKreatora[] = [
  { id: 'slup', tytul: T.krokKatalog },
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

function kontekstZOperacji(
  context: Record<string, unknown> | null,
  snapshot: EnergyNetworkModel | null | undefined,
): KontekstSlupa {
  if (!context) return {};
  const segId = trimmed(context.segment_id ?? context.segment_ref ?? context.segmentRef);
  const segment = znajdzOdcinek(snapshot, segId);
  return {
    segment_id: segId || undefined,
    segment_label:
      trimmed(context.segmentLabel ?? context.segment_name)
      || trimmed(segment?.name)
      || (segId ? 'Linia napowietrzna SN' : undefined),
    segment_type: segment?.type,
    switch_state: context.switch_state,
  };
}

export function KreatorSlupaOdgaleznego() {
  const context = useActiveOperationContext() as Record<string, unknown> | null;
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const selekcjaPoOperacji = useSelekcjaPoOperacji();
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);

  const kontekst = useMemo(() => kontekstZOperacji(context, snapshot), [context, snapshot]);
  const hasOdcinek = maOdcinek(kontekst);
  const problemTor = useMemo(() => problemTorowosci(kontekst), [kontekst]);

  const [dane, setDane] = useState<SlupOdgaleznyFormData>(() => ({ ...DANE_DOMYSLNE }));
  const [bledy, setBledy] = useState<BladPola[]>([]);
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);
  const [krok, setKrok] = useState<string>('slup');

  const [typy, setTypy] = useState<BranchPointCatalogType[]>([]);
  const [bladKatalogu, setBladKatalogu] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBladKatalogu(null);
    fetchBranchPointTypes('BRANCH_POLE')
      .then((t) => {
        if (!cancelled) setTypy(Array.isArray(t) ? t : []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setTypy([]);
        setBladKatalogu(e instanceof Error ? e.message : T.typBlad);
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
    () =>
      typy.map((t) => ({
        id: t.id,
        etykieta:
          typeof t.switch_rated_current_a === 'number'
            ? `${t.name} · ${t.switch_rated_current_a} A`
            : t.name,
      })),
    [typy],
  );

  const zmien = useCallback(
    <K extends keyof SlupOdgaleznyFormData>(pole: K, wartosc: SlupOdgaleznyFormData[K]) => {
      setDane((p) => ({ ...p, [pole]: wartosc }));
    },
    [],
  );

  const bladDlaPola = (pole: string): string | undefined => bledy.find((b) => b.field === pole)?.message;

  const zapisMozliwy = hasOdcinek && !problemTor && Boolean(activeCaseId);

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
        'insert_branch_pole_on_segment_sn',
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
        type: 'BranchPole',
        name: dane.nazwa.trim() || 'Słup rozgałęźny SN',
      });
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
      wartosc: problemTor ? 'Nieprawidłowy tor' : 'Linia napowietrzna SN',
    },
    {
      etykieta: T.wierszSlup,
      stan: dane.catalog_ref ? 'kompletne' : 'brak',
      wartosc: dane.catalog_ref ? 'Kompletne' : 'Do konfiguracji',
    },
    { etykieta: T.wierszPolozenie, stan: 'kompletne', wartosc: fmtPct01(dane.polozenie) },
  ];

  const aside = (
    <>
      <KreatorGotowosc tytul={T.kontrolaTytul} wiersze={wierszeGotowosci} testid="mvd-kreator-slup-gotowosc" />
      <KreatorNastepnyKrok eyebrow={T.downstreamTytul} opis={T.downstreamOpis} />
    </>
  );

  const paramReadout = params ? (
    <KreatorSiatka kolumny={3}>
      <RzadWartosci etykieta={T.paramLacznik} wartosc={params.switch_device_kind ?? '—'} />
      <RzadWartosci
        etykieta={T.paramPrad}
        wartosc={typeof params.switch_rated_current_a === 'number' ? `${params.switch_rated_current_a} A` : '—'}
      />
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
        bledy.length > 0
          ? T.walidacjaStopka
          : problemTor ?? (!hasOdcinek ? T.brakOdcinkaOpis : null)
      }
      akcjaGlowna={{ etykieta: T.zapisz, onClick: onZapisz, zablokowana: !zapisMozliwy, testid: 'mvd-kreator-slup-zapisz' }}
      akcjaAnuluj={{ etykieta: T.anuluj, onClick: () => closeForm(), testid: 'mvd-kreator-slup-anuluj' }}
      krokWstecz={
        krokIndex > 0
          ? { etykieta: T.wstecz, onClick: () => setKrok(KROKI[krokIndex - 1].id), testid: 'mvd-kreator-slup-wstecz' }
          : undefined
      }
      krokDalej={
        krokIndex < KROKI.length - 1
          ? { etykieta: T.dalej, onClick: () => setKrok(KROKI[krokIndex + 1].id), testid: 'mvd-kreator-slup-dalej' }
          : undefined
      }
      licznikKrokow={T.licznik(krokIndex + 1, KROKI.length)}
      testid="mvd-kreator-slup"
    >
      {!hasOdcinek ? (
        <KreatorSekcja tytul={T.brakOdcinkaTytul} testid="mvd-kreator-slup-brak">
          <KreatorInfo>{T.brakOdcinkaOpis}</KreatorInfo>
        </KreatorSekcja>
      ) : null}

      {hasOdcinek && problemTor ? (
        <KreatorSekcja tytul={T.wierszTor} testid="mvd-kreator-slup-tor">
          <KreatorInfo>{problemTor}</KreatorInfo>
        </KreatorSekcja>
      ) : null}

      {krok === 'slup' ? (
        <KreatorSekcja tytul={T.krokKatalog} testid="mvd-kreator-slup-sekcja">
          <KreatorInfo>{T.typPomoc}</KreatorInfo>
          <PoleKatalogu
            etykieta={T.typKatalog}
            wartosc={dane.catalog_ref}
            onZmiana={(v) => zmien('catalog_ref', v)}
            opcje={opcjeTypow}
            status={bladKatalogu ? 'error' : 'ready'}
            placeholder={T.typKatalogPlaceholder}
            komunikatBledu={bladKatalogu ?? T.typBlad}
            wymagane
            testid="mvd-kreator-slup-katalog"
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
              testid="mvd-kreator-slup-polozenie"
            />
            <PoleTekstowe
              etykieta={T.nazwa}
              wartosc={dane.nazwa}
              onZmiana={(v) => zmien('nazwa', v)}
              placeholder={T.nazwaPlaceholder}
              testid="mvd-kreator-slup-nazwa"
            />
          </KreatorSiatka>
          {paramReadout}
          <PanelTeorii
            tytul={T.teoriaTytul}
            opis={T.teoriaOpis}
            wymog={T.teoriaWymog}
            podstawa={T.teoriaPodstawa}
            testid="mvd-kreator-slup-teoria"
          />
        </KreatorSekcja>
      ) : null}

      {krok === 'zapis' ? (
        <KreatorSekcja tytul={T.krokZapis} testid="mvd-kreator-slup-zapis">
          <KreatorInfo>{T.downstreamOpis}</KreatorInfo>
          <KreatorSiatka kolumny={2}>
            <RzadWartosci etykieta={T.wierszOdcinek} wartosc={kontekst.segment_label || '—'} />
            <RzadWartosci etykieta={T.wierszPolozenie} wartosc={fmtPct01(dane.polozenie)} />
            <RzadWartosci etykieta={T.wierszSlup} wartosc={params?.name ?? '—'} />
            <RzadWartosci etykieta={T.nazwa} wartosc={dane.nazwa.trim() || 'Słup rozgałęźny SN'} />
          </KreatorSiatka>
        </KreatorSekcja>
      ) : null}
    </KreatorRama>
  );
}
