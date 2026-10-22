/**
 * Kreator „Dodaj generator synchroniczny SN" — ui2, kreatory/rama. Operacja domenowa
 * `add_generator_sn`; wejście z menu kontekstowego sekcji SN na schemacie
 * („Dodaj generator synchroniczny", kontekst `bus_ref` = kliknięta szyna).
 *
 * Tabliczka znamionowa z katalogu GENERATOR_SN (`GET /api/catalog/synchronous-generator-types`)
 * albo podana ręcznie (tryb ekspercki, ZASADA NR 4) — katalog bez typów dla projektu nie
 * blokuje pracy. Każda kontrolka mapuje się na pole operacji (`zbudujPayload`). ZERO fizyki.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { fetchSynchronousGeneratorTypes, getCatalogErrorMessage } from '../../../ui/catalog/api';
import type { SynchronousGeneratorCatalogType } from '../../../ui/catalog/types';
import { useActiveOperationContext, useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import {
  KreatorGotowosc,
  KreatorInfo,
  KreatorNastepnyKrok,
  KreatorRama,
  KreatorSekcja,
  KreatorSiatka,
  PoleKatalogu,
  PoleLiczbowe,
  PolePrzelacznik,
  PoleTekstowe,
  PoleWyboru,
  RzadWartosci,
  useSelekcjaPoOperacji,
  type WierszGotowosci,
} from '../rama';
import {
  DANE_DOMYSLNE,
  maSzyne,
  napiecieNiezgodne,
  walidujFormularz,
  zbudujPayload,
  type BladPola,
  type GeneratorSnFormData,
  type KontekstGeneratora,
  type TrybPracyGeneratora,
} from './generatorSnModel';
import { GENERATOR_SN_STRINGS as T } from './strings';

function kontekstZOperacji(context: Record<string, unknown> | null): KontekstGeneratora {
  if (!context) return {};
  const napiecie = Number(context.bus_voltage_kv);
  return {
    bus_ref: typeof context.bus_ref === 'string' && context.bus_ref.trim() ? context.bus_ref.trim() : undefined,
    bus_name: typeof context.bus_name === 'string' ? context.bus_name : undefined,
    bus_voltage_kv: Number.isFinite(napiecie) && napiecie > 0 ? napiecie : undefined,
  };
}

function fmt(n: number | null | undefined, jedn: string): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `${String(n).replace('.', ',')} ${jedn}`;
}

export function KreatorGeneratoraSn() {
  const context = useActiveOperationContext() as Record<string, unknown> | null;
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const selekcjaPoOperacji = useSelekcjaPoOperacji();

  const kontekst = useMemo(() => kontekstZOperacji(context), [context]);
  const szynaWskazana = maSzyne(kontekst);

  const [dane, setDane] = useState<GeneratorSnFormData>(() => ({ ...DANE_DOMYSLNE }));
  const [bledy, setBledy] = useState<BladPola[]>([]);
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);
  const [typy, setTypy] = useState<SynchronousGeneratorCatalogType[]>([]);
  const [bladKatalogu, setBladKatalogu] = useState<string | null>(null);
  const [katalogLadowanie, setKatalogLadowanie] = useState(true);

  useEffect(() => {
    let anulowane = false;
    fetchSynchronousGeneratorTypes()
      .then((t) => {
        if (anulowane) return;
        const lista = Array.isArray(t) ? t : [];
        setTypy(lista);
        // Katalog bez typów dla projektu: tabliczka ręczna od razu (ZASADA NR 4).
        if (lista.length === 0) setDane((p) => ({ ...p, tryb_tabliczki: 'reczna' }));
      })
      .catch((e: unknown) => {
        if (!anulowane) setBladKatalogu(getCatalogErrorMessage(e));
      })
      .finally(() => {
        if (!anulowane) setKatalogLadowanie(false);
      });
    return () => {
      anulowane = true;
    };
  }, []);

  const zmien = useCallback(<K extends keyof GeneratorSnFormData>(pole: K, wartosc: GeneratorSnFormData[K]) => {
    setDane((p) => ({ ...p, [pole]: wartosc }));
  }, []);

  const wybranyTyp = useMemo(() => typy.find((t) => t.id === dane.catalog_ref) ?? null, [typy, dane.catalog_ref]);
  const napiecieTabliczki = dane.tryb_tabliczki === 'katalog' ? wybranyTyp?.rated_kv ?? null : dane.rated_kv;
  const bladDlaPola = (pole: string): string | undefined => bledy.find((b) => b.field === pole)?.message;

  const onZapisz = useCallback(async () => {
    if (!szynaWskazana) {
      setBladGlobalny(T.brakSzynyOpis);
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
      const response = await executeDomainOperation(activeCaseId, 'add_generator_sn', zbudujPayload(dane, kontekst));
      if (!response) {
        setBladGlobalny(useSnapshotStore.getState().error ?? T.bladDodania);
        return;
      }
      if (response.error) {
        setBladGlobalny(response.error);
        return;
      }
      closeForm();
      selekcjaPoOperacji(response, { type: 'Generator', name: dane.nazwa.trim() || 'Generator synchroniczny' });
    } catch (e) {
      setBladGlobalny(e instanceof Error ? e.message : T.bladDodania);
    }
  }, [activeCaseId, closeForm, dane, executeDomainOperation, kontekst, selekcjaPoOperacji, szynaWskazana]);

  const stanGotowosci: 'ladowanie' | 'zablokowany' | 'gotowy' =
    !szynaWskazana || !activeCaseId
      ? 'zablokowany'
      : katalogLadowanie && dane.tryb_tabliczki === 'katalog'
        ? 'ladowanie'
        : 'gotowy';

  const wiersze: WierszGotowosci[] = [
    {
      etykieta: T.wierszSzyna,
      stan: szynaWskazana ? 'kompletne' : 'brak',
      wartosc: kontekst.bus_name ?? (szynaWskazana ? 'Wskazana' : 'Brak'),
    },
    {
      etykieta: T.wierszTabliczka,
      stan: (dane.tryb_tabliczki === 'katalog' ? Boolean(dane.catalog_ref) : Boolean(dane.rated_mva && dane.rated_mva > 0))
        ? 'kompletne'
        : 'brak',
      wartosc: dane.tryb_tabliczki === 'katalog' ? wybranyTyp?.name ?? T.tabliczkaZKatalogu : T.tabliczkaReczna,
    },
    { etykieta: T.wierszMoc, stan: dane.p_mw && dane.p_mw > 0 ? 'kompletne' : 'brak', wartosc: fmt(dane.p_mw, 'MW') },
    {
      etykieta: T.wierszTryb,
      stan: 'kompletne',
      wartosc: T.trybPracyOpcje.find((o) => o.id === dane.tryb_pracy)?.etykieta ?? '—',
    },
  ];

  const aside = (
    <>
      <KreatorGotowosc tytul={T.kontrolaTytul} wiersze={wiersze} testid="mvd-kreator-generator-sn-gotowosc" />
      <KreatorNastepnyKrok eyebrow={T.downstreamTytul} opis={T.downstreamOpis} />
    </>
  );

  return (
    <KreatorRama
      eyebrow={T.eyebrow}
      tytul={T.eyebrow}
      cel={T.cel}
      odznaka={T.odznaka}
      pelny
      aside={aside}
      bladGlobalny={bladGlobalny}
      walidacja={
        stanGotowosci === 'ladowanie'
          ? T.katalogLadowanieStopka
          : bledy.length > 0
            ? T.walidacjaStopka
            : !szynaWskazana
              ? T.brakSzynyOpis
              : null
      }
      status={stanGotowosci}
      akcjaGlowna={{
        etykieta: T.zapisz,
        onClick: onZapisz,
        zablokowana: stanGotowosci !== 'gotowy',
        testid: 'mvd-kreator-generator-sn-zapisz',
      }}
      akcjaAnuluj={{ etykieta: T.anuluj, onClick: () => closeForm(), testid: 'mvd-kreator-generator-sn-anuluj' }}
      testid="mvd-kreator-generator-sn"
    >
      {!szynaWskazana ? (
        <KreatorSekcja tytul={T.brakSzynyTytul} testid="mvd-kreator-generator-sn-brak-szyny">
          <KreatorInfo>{T.brakSzynyOpis}</KreatorInfo>
        </KreatorSekcja>
      ) : null}

      <KreatorSekcja tytul={T.sekcjaTabliczkaTytul} nota={kontekst.bus_name} testid="mvd-kreator-generator-sn-tabliczka">
        <PolePrzelacznik
          ariaLabel={T.trybTabliczki}
          testid="mvd-kreator-generator-sn-tryb-tabliczki"
          wartosc={dane.tryb_tabliczki}
          opcje={[
            { id: 'katalog', etykieta: T.trybKatalog },
            { id: 'reczna', etykieta: T.trybReczna },
          ]}
          onZmiana={(id) => zmien('tryb_tabliczki', id === 'reczna' ? 'reczna' : 'katalog')}
        />
        {dane.tryb_tabliczki === 'katalog' ? (
          <>
            {!katalogLadowanie && !bladKatalogu && typy.length === 0 ? <KreatorInfo>{T.katalogPusty}</KreatorInfo> : null}
            <PoleKatalogu
              etykieta={T.typKatalog}
              wartosc={dane.catalog_ref}
              onZmiana={(v) => zmien('catalog_ref', v)}
              opcje={typy.map((t) => ({
                id: t.id,
                etykieta: `${t.name} · ${t.rated_mva} MVA · ${t.rated_kv} kV`,
              }))}
              status={bladKatalogu ? 'error' : katalogLadowanie ? 'loading' : 'ready'}
              placeholder={T.typKatalogPlaceholder}
              komunikatBledu={bladKatalogu ?? T.typBlad}
              wymagane
              blad={bladDlaPola('catalog_ref')}
              testid="mvd-kreator-generator-sn-katalog"
            />
            {wybranyTyp ? (
              <KreatorSiatka kolumny={2}>
                <RzadWartosci etykieta={T.ratedMva} wartosc={fmt(wybranyTyp.rated_mva, 'MVA')} />
                <RzadWartosci etykieta={T.ratedKv} wartosc={fmt(wybranyTyp.rated_kv, 'kV')} />
                <RzadWartosci etykieta={T.tabliczkaQmin} wartosc={fmt(wybranyTyp.q_min_mvar, 'Mvar')} />
                <RzadWartosci etykieta={T.tabliczkaQmax} wartosc={fmt(wybranyTyp.q_max_mvar, 'Mvar')} />
              </KreatorSiatka>
            ) : null}
          </>
        ) : (
          <>
            <KreatorInfo>{T.trybRecznaInfo}</KreatorInfo>
            <KreatorSiatka kolumny={2}>
              <PoleLiczbowe
                etykieta={T.ratedMva}
                jednostka="MVA"
                wartosc={dane.rated_mva}
                onZmiana={(v) => zmien('rated_mva', v)}
                wymagane
                blad={bladDlaPola('rated_mva')}
                testid="mvd-kreator-generator-sn-rated-mva"
              />
              <PoleLiczbowe
                etykieta={T.ratedKv}
                jednostka="kV"
                wartosc={dane.rated_kv}
                onZmiana={(v) => zmien('rated_kv', v)}
                pomoc={T.ratedKvPomoc}
                testid="mvd-kreator-generator-sn-rated-kv"
              />
              <PoleLiczbowe
                etykieta={T.tabliczkaQmin}
                jednostka="Mvar"
                wartosc={dane.tabliczka_q_min_mvar}
                onZmiana={(v) => zmien('tabliczka_q_min_mvar', v)}
                pomoc={T.tabliczkaQPomoc}
                testid="mvd-kreator-generator-sn-tabliczka-qmin"
              />
              <PoleLiczbowe
                etykieta={T.tabliczkaQmax}
                jednostka="Mvar"
                wartosc={dane.tabliczka_q_max_mvar}
                onZmiana={(v) => zmien('tabliczka_q_max_mvar', v)}
                testid="mvd-kreator-generator-sn-tabliczka-qmax"
              />
            </KreatorSiatka>
          </>
        )}
        {napiecieNiezgodne(napiecieTabliczki, kontekst) ? (
          <p className="mvd-pole-blad" role="alert" data-testid="mvd-kreator-generator-sn-napiecie">
            {T.ostrzezenieNapiecie}
          </p>
        ) : null}
      </KreatorSekcja>

      <KreatorSekcja tytul={T.sekcjaPracaTytul} testid="mvd-kreator-generator-sn-praca">
        <KreatorSiatka kolumny={2}>
          <PoleLiczbowe
            etykieta={T.pMw}
            jednostka="MW"
            wartosc={dane.p_mw}
            onZmiana={(v) => zmien('p_mw', v)}
            wymagane
            pomoc={T.pMwPomoc}
            blad={bladDlaPola('p_mw')}
            testid="mvd-kreator-generator-sn-p"
          />
          <PoleWyboru
            etykieta={T.trybPracy}
            wartosc={dane.tryb_pracy}
            onZmiana={(v) => zmien('tryb_pracy', v as TrybPracyGeneratora)}
            opcje={T.trybPracyOpcje}
            testid="mvd-kreator-generator-sn-tryb-pracy"
          />
          {dane.tryb_pracy === 'stala_moc_bierna' ? (
            <PoleLiczbowe
              etykieta={T.qMvar}
              jednostka="Mvar"
              wartosc={dane.q_mvar}
              onZmiana={(v) => zmien('q_mvar', v)}
              pomoc={T.qMvarPomoc}
              testid="mvd-kreator-generator-sn-q"
            />
          ) : (
            <>
              <PoleLiczbowe
                etykieta={T.uSet}
                jednostka="p.u."
                wartosc={dane.u_set_pu}
                onZmiana={(v) => zmien('u_set_pu', v)}
                krok={0.01}
                wymagane
                blad={bladDlaPola('u_set_pu')}
                testid="mvd-kreator-generator-sn-u-set"
              />
              <PoleLiczbowe
                etykieta={T.qMin}
                jednostka="Mvar"
                wartosc={dane.q_min_mvar}
                onZmiana={(v) => zmien('q_min_mvar', v)}
                pomoc={T.qGranicePomoc}
                blad={bladDlaPola('q_min_mvar')}
                testid="mvd-kreator-generator-sn-qmin"
              />
              <PoleLiczbowe
                etykieta={T.qMax}
                jednostka="Mvar"
                wartosc={dane.q_max_mvar}
                onZmiana={(v) => zmien('q_max_mvar', v)}
                testid="mvd-kreator-generator-sn-qmax"
              />
            </>
          )}
          <PoleTekstowe
            etykieta={T.nazwa}
            wartosc={dane.nazwa}
            onZmiana={(v) => zmien('nazwa', v)}
            placeholder={T.nazwaPlaceholder}
            testid="mvd-kreator-generator-sn-nazwa"
          />
        </KreatorSiatka>
      </KreatorSekcja>
    </KreatorRama>
  );
}
