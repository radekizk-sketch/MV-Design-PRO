/**
 * Kreator „Zespół uziemiający SN" (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA) — ui2, rama.
 *
 * Zapis = operacja domenowa `add_zespol_uziemiajacy_sn`: transformator uziemiający ZNyn11
 * i element punktu neutralnego (Z.13 dławik z AWSC, Z.14 dławik‖rezystor, Z.15 rezystor,
 * uziemienie bezpośrednie) w polu ZU albo wprost na szynie SN. Ten sam zespół czytają:
 * odwzorowanie składowej zerowej (Ik1), walidator, dowód przekładników, droga doziemna pola,
 * ładunek DER, analiza akademicka i schemat (`enm.uziemienie_sekcji` — jedna prawda).
 * Katalog-first (trzy przestrzenie); ZERO fizyki w UI — dopuszczalność ocenia próba
 * `dry_run` operacji, impedancje liczy backend.
 */

import { useCallback, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import {
  useActiveOperationContext,
  useNetworkBuildStore,
} from '../../../ui/network-build/networkBuildStore';
import { useSelectionStore } from '../../../ui/selection';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import {
  KontrolaPrzedZapisem,
  KreatorGotowosc,
  KreatorInfo,
  KreatorNastepnyKrok,
  KreatorPodsumowanie,
  KreatorRama,
  KreatorSekcja,
  KreatorSiatka,
  PanelTeorii,
  PolePrzelacznikBinarny,
  PoleTekstowe,
  RzadWartosci,
  komunikatProby,
  useProbaOperacji,
  useSelekcjaPoOperacji,
  wierszProby,
  type BladPola,
  type KrokKreatora,
  type WierszGotowosci,
} from '../rama';
import {
  OPCJE_WARIANTU,
  PolaElementowZespolu,
  PolaUkladuZespolu,
  useKatalogiZespolu,
} from './PolaZespolu';
import {
  DANE_DOMYSLNE,
  maDlawik,
  maMiejsce,
  maRezystor,
  transformatoryWnSn,
  walidujFormularz,
  zbudujPayload,
  type KontekstZespolu,
  type ZespolFormData,
} from './zespolModel';
import { ZESPOL_UZIEMIAJACY_STRINGS as T } from './strings';

const OP = 'add_zespol_uziemiajacy_sn' as const;

const KROKI: readonly KrokKreatora[] = [
  { id: 'uklad', tytul: T.krokUklad },
  { id: 'elementy', tytul: T.krokElementy },
  { id: 'zapis', tytul: T.krokZapis },
];

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function kontekstZOperacji(
  context: Record<string, unknown> | null,
  selected: { id: string; name: string; type: string } | null,
): KontekstZespolu {
  const bayRef =
    trimmed(context?.bay_ref ?? context?.field_ref)
    || (selected && selected.type === 'BaySN' ? selected.id : '');
  const bayName =
    trimmed(context?.bay_name ?? context?.field_name)
    || (selected && selected.type === 'BaySN' ? selected.name : '');
  const busRef =
    trimmed(context?.bus_ref) || (selected && selected.type === 'Bus' ? selected.id : '');
  const busName =
    trimmed(context?.bus_name) || (selected && selected.type === 'Bus' ? selected.name : '');
  return {
    bay_ref: bayRef || undefined,
    bay_name: bayName || undefined,
    bus_ref: bayRef ? undefined : busRef || undefined,
    bus_name: bayRef ? undefined : busName || undefined,
  };
}

export function KreatorZespoluUziemiajacegoSn() {
  const context = useActiveOperationContext() as Record<string, unknown> | null;
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const selekcjaPoOperacji = useSelekcjaPoOperacji();
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const selectedElement = useSelectionStore((s) => s.selectedElements[0] ?? null);

  const selected = useMemo(
    () =>
      selectedElement
        ? { id: selectedElement.id, name: selectedElement.name, type: selectedElement.type }
        : null,
    [selectedElement],
  );
  const kontekst = useMemo(() => kontekstZOperacji(context, selected), [context, selected]);
  const hasMiejsce = maMiejsce(kontekst);
  const miejsceLabel =
    kontekst.bay_name || kontekst.bay_ref || kontekst.bus_name || kontekst.bus_ref || '—';

  const [dane, setDane] = useState<ZespolFormData>(() => ({ ...DANE_DOMYSLNE }));
  const [bledy, setBledy] = useState<BladPola[]>([]);
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);
  const [krok, setKrok] = useState<string>('uklad');

  const katalogi = useKatalogiZespolu();
  const katalogLadowanie = katalogi.ladowanie;

  const zmien = useCallback(
    <K extends keyof ZespolFormData>(pole: K, wartosc: ZespolFormData[K]) => {
      setDane((p) => ({ ...p, [pole]: wartosc }));
    },
    [],
  );

  const tu = katalogi.tu.typy.find((t) => t.id === dane.catalog_ref) ?? null;
  const dl = katalogi.dl.typy.find((t) => t.id === dane.dlawik_catalog_ref) ?? null;
  const rz = katalogi.rz.typy.find((t) => t.id === dane.rezystor_catalog_ref) ?? null;

  const trafoWnSn = useMemo(
    () => transformatoryWnSn(snapshot?.transformers ?? [], snapshot?.buses ?? []),
    [snapshot?.transformers, snapshot?.buses],
  );

  const onZapisz = useCallback(async () => {
    if (!hasMiejsce) {
      setBladGlobalny(T.brakMiejscaOpis);
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
      const response = await executeDomainOperation(activeCaseId, OP, zbudujPayload(dane, kontekst));
      if (!response) {
        setBladGlobalny(useSnapshotStore.getState().error ?? T.walidacjaStopka);
        return;
      }
      if (response.error) {
        setBladGlobalny(response.error);
        return;
      }
      closeForm();
      selekcjaPoOperacji(response, { type: 'Bus', name: miejsceLabel });
    } catch (e) {
      setBladGlobalny(e instanceof Error ? e.message : T.walidacjaStopka);
    }
  }, [activeCaseId, closeForm, dane, executeDomainOperation, hasMiejsce, kontekst, miejsceLabel, selekcjaPoOperacji]);

  // Napięcie typu wobec sieci, zakres nastawy dławika, sprzeczność uziemienia bezpośredniego
  // z elementem, rola pola — ocenia WYŁĄCZNIE operacja (próba `dry_run` z ładunkiem zapisu).
  const ladunekProby = useMemo(
    () => (hasMiejsce && walidujFormularz(dane).length === 0 ? zbudujPayload(dane, kontekst) : null),
    [dane, hasMiejsce, kontekst],
  );
  const proba = useProbaOperacji(activeCaseId, OP, ladunekProby);
  const odmowaProby = proba?.stan === 'odrzucona' || proba?.stan === 'nieustalona';

  const elementKompletny =
    dane.wariant === 'bezposrednie'
    || ((!maDlawik(dane.wariant) || Boolean(dane.dlawik_catalog_ref))
      && (!maRezystor(dane.wariant) || Boolean(dane.rezystor_catalog_ref)));
  const etykietaWariantu = OPCJE_WARIANTU.find((o) => o.id === dane.wariant)?.etykieta ?? '—';

  const wierszeGotowosci: WierszGotowosci[] = [
    { etykieta: T.wierszMiejsce, stan: hasMiejsce ? 'kompletne' : 'brak', wartosc: hasMiejsce ? miejsceLabel : T.wierszBrak },
    {
      etykieta: T.wierszTransformator,
      stan: dane.catalog_ref ? 'kompletne' : 'brak',
      wartosc: dane.catalog_ref ? T.wierszKompletne : T.wierszDoKonfiguracji,
    },
    {
      etykieta: T.wierszElement,
      stan: elementKompletny ? 'kompletne' : 'brak',
      wartosc: elementKompletny ? etykietaWariantu : T.wierszDoKonfiguracji,
    },
    wierszProby(proba),
  ];

  const aside = (
    <>
      <KreatorPodsumowanie
        tytul={T.podsumowanieTytul}
        komunikat={odmowaProby ? komunikatProby(proba) : null}
        komunikatTon="warn"
        testid="mvd-kreator-zu-podsumowanie"
      >
        <RzadWartosci etykieta={T.wariant} wartosc={etykietaWariantu} />
        <RzadWartosci etykieta={T.typTransformatora} wartosc={tu?.name ?? '—'} />
        {maDlawik(dane.wariant) ? <RzadWartosci etykieta={T.typDlawika} wartosc={dl?.name ?? '—'} /> : null}
        {maRezystor(dane.wariant) ? <RzadWartosci etykieta={T.typRezystora} wartosc={rz?.name ?? '—'} /> : null}
      </KreatorPodsumowanie>
      <KreatorGotowosc tytul={T.kontrolaTytul} wiersze={wierszeGotowosci} testid="mvd-kreator-zu-gotowosc" />
      <KreatorNastepnyKrok eyebrow={T.downstreamTytul} opis={T.downstreamOpis} />
    </>
  );

  const krokIndex = KROKI.findIndex((k) => k.id === krok);
  const stanGotowosci: 'ladowanie' | 'zablokowany' | 'gotowy' =
    !hasMiejsce || !activeCaseId ? 'zablokowany' : katalogLadowanie ? 'ladowanie' : 'gotowy';

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
            : !hasMiejsce
              ? T.brakMiejscaOpis
              : null
      }
      status={stanGotowosci}
      akcjaGlowna={{
        etykieta: T.zapisz,
        onClick: onZapisz,
        zablokowana: stanGotowosci !== 'gotowy',
        testid: 'mvd-kreator-zu-zapisz',
      }}
      akcjaAnuluj={{ etykieta: T.anuluj, onClick: () => closeForm(), testid: 'mvd-kreator-zu-anuluj' }}
      krokWstecz={
        krokIndex > 0
          ? { etykieta: T.wstecz, onClick: () => setKrok(KROKI[krokIndex - 1].id), testid: 'mvd-kreator-zu-wstecz' }
          : undefined
      }
      krokDalej={
        krokIndex < KROKI.length - 1
          ? { etykieta: T.dalej, onClick: () => setKrok(KROKI[krokIndex + 1].id), testid: 'mvd-kreator-zu-dalej' }
          : undefined
      }
      licznikKrokow={T.licznik(krokIndex + 1, KROKI.length)}
      testid="mvd-kreator-zu"
    >
      {!hasMiejsce ? (
        <KreatorSekcja tytul={T.brakMiejscaTytul} testid="mvd-kreator-zu-brak-miejsca">
          <KreatorInfo>{T.brakMiejscaOpis}</KreatorInfo>
        </KreatorSekcja>
      ) : null}

      {krok === 'uklad' ? (
        <KreatorSekcja tytul={T.krokUklad} testid="mvd-kreator-zu-uklad">
          <KreatorSiatka kolumny={2}>
            <RzadWartosci etykieta={T.miejsce} wartosc={miejsceLabel} />
            <PoleTekstowe
              etykieta={T.nazwa}
              wartosc={dane.name}
              onZmiana={(v) => zmien('name', v)}
              pomoc={T.nazwaPomoc}
              testid="mvd-kreator-zu-nazwa"
            />
          </KreatorSiatka>
          <PolaUkladuZespolu dane={dane} zmien={zmien} katalogi={katalogi} bledy={bledy} prefiks="mvd-kreator-zu" />
        </KreatorSekcja>
      ) : null}

      {krok === 'elementy' ? (
        <KreatorSekcja tytul={T.krokElementy} testid="mvd-kreator-zu-elementy">
          {dane.wariant === 'bezposrednie' ? <KreatorInfo>{T.bezposrednie}</KreatorInfo> : null}
          <PolaElementowZespolu dane={dane} zmien={zmien} katalogi={katalogi} bledy={bledy} prefiks="mvd-kreator-zu" />
          <KontrolaPrzedZapisem proba={proba} testid="mvd-kreator-zu-proba" />
          <PanelTeorii
            tytul={T.teoriaTytul}
            opis={T.teoriaOpis}
            wymog={T.teoriaWymog}
            podstawa={T.teoriaPodstawa}
            testid="mvd-kreator-zu-teoria"
          />
        </KreatorSekcja>
      ) : null}

      {krok === 'zapis' ? (
        <KreatorSekcja tytul={T.krokZapis} testid="mvd-kreator-zu-zapis">
          <PolePrzelacznikBinarny
            etykieta={T.spz}
            wlaczone={dane.spz}
            onZmiana={(v) => zmien('spz', v)}
            opis={T.spzOpis}
            testid="mvd-kreator-zu-spz"
          />
          <p className="mvd-pole-etykieta">{T.wylaczenieOdTr}</p>
          <KreatorInfo>{T.wylaczenieOdTrOpis}</KreatorInfo>
          {trafoWnSn.length === 0 ? (
            <KreatorInfo>{T.brakTransformatorowWnSn}</KreatorInfo>
          ) : (
            trafoWnSn.map((t) => (
              <PolePrzelacznikBinarny
                key={t.ref_id}
                etykieta={t.name ?? t.ref_id}
                wlaczone={dane.wylaczenie_od_transformatorow_refs.includes(t.ref_id)}
                onZmiana={(v) =>
                  zmien(
                    'wylaczenie_od_transformatorow_refs',
                    v
                      ? [...dane.wylaczenie_od_transformatorow_refs, t.ref_id]
                      : dane.wylaczenie_od_transformatorow_refs.filter((r) => r !== t.ref_id),
                  )
                }
                testid={`mvd-kreator-zu-wylaczenie-${t.ref_id}`}
              />
            ))
          )}
          <KontrolaPrzedZapisem proba={proba} testid="mvd-kreator-zu-proba-zapis" />
        </KreatorSekcja>
      ) : null}
    </KreatorRama>
  );
}
