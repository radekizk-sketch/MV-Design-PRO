/**
 * Kreator „Łącznik sekcyjny SN" (V12K-053, G-SEK) — ui2, kreatory/rama.
 *
 * Katalog-first (APARAT_SN); stan normalny (zamknięty/otwarty=NOP) honorowany
 * przez rozpływ mocy (zweryfikowane: open switch → brak gałęzi w Y-bus). Zapis =
 * operacja domenowa `insert_section_switch_sn`. ZERO fizyki w UI.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { fetchMvApparatusTypes, getCatalogErrorMessage } from '../../../ui/catalog/api';
import type { MVApparatusCatalogType } from '../../../ui/catalog/types';
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
  useSelekcjaPoOperacji,
  type KrokKreatora,
  type WierszGotowosci,
} from '../rama';
import {
  DANE_DOMYSLNE,
  fmtPct01,
  maOdcinek,
  walidujFormularz,
  zbudujPayload,
  type BladPola,
  type KontekstLacznika,
  type LacznikFormData,
  type NormalState,
  type SwitchType,
} from './lacznikModel';
import { LACZNIK_STRINGS as T } from './strings';

const KROKI: readonly KrokKreatora[] = [
  { id: 'aparat', tytul: T.krokAparat },
  { id: 'zapis', tytul: T.krokZapis },
];

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function kontekstZOperacji(context: Record<string, unknown> | null): KontekstLacznika {
  if (!context) return {};
  const segId = trimmed(context.segment_id ?? context.segment_ref ?? context.segmentRef);
  return {
    segment_id: segId || undefined,
    segment_label: trimmed(context.segmentLabel ?? context.segment_name) || segId || undefined,
  };
}

export function KreatorLacznikaSekcyjnego() {
  const context = useActiveOperationContext() as Record<string, unknown> | null;
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const selekcjaPoOperacji = useSelekcjaPoOperacji();
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);

  const kontekst = useMemo(() => kontekstZOperacji(context), [context]);
  const hasOdcinek = maOdcinek(kontekst);

  const [dane, setDane] = useState<LacznikFormData>(() => ({ ...DANE_DOMYSLNE }));
  const [bledy, setBledy] = useState<BladPola[]>([]);
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);
  const [krok, setKrok] = useState<string>('aparat');

  const [typy, setTypy] = useState<MVApparatusCatalogType[]>([]);
  const [bladKatalogu, setBladKatalogu] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBladKatalogu(null);
    fetchMvApparatusTypes()
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

  const params = useMemo(
    () => (dane.catalog_ref ? typy.find((t) => t.id === dane.catalog_ref) ?? null : null),
    [dane.catalog_ref, typy],
  );

  const opcjeTypow = useMemo(
    () => typy.map((t) => ({ id: t.id, etykieta: `${t.name} · ${t.u_n_kv} kV · ${t.i_n_a} A` })),
    [typy],
  );

  const zmien = useCallback(<K extends keyof LacznikFormData>(pole: K, wartosc: LacznikFormData[K]) => {
    setDane((p) => ({ ...p, [pole]: wartosc }));
  }, []);

  const bladDlaPola = (pole: string): string | undefined => bledy.find((b) => b.field === pole)?.message;

  const onZapisz = useCallback(async () => {
    if (!hasOdcinek) {
      setBladGlobalny(T.brakOdcinkaOpis);
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
      const response = await executeDomainOperation(activeCaseId, 'insert_section_switch_sn', zbudujPayload(dane, kontekst));
      if (!response) {
        setBladGlobalny(useSnapshotStore.getState().error ?? T.walidacjaStopka);
        return;
      }
      if (response.error) {
        setBladGlobalny(response.error);
        return;
      }
      closeForm();
      selekcjaPoOperacji(response, { type: 'Switch', name: dane.nazwa.trim() || 'Łącznik sekcyjny SN' });
    } catch (e) {
      setBladGlobalny(e instanceof Error ? e.message : T.walidacjaStopka);
    }
  }, [activeCaseId, closeForm, dane, executeDomainOperation, hasOdcinek, kontekst, selekcjaPoOperacji]);

  const wierszeGotowosci: WierszGotowosci[] = [
    {
      etykieta: T.wierszOdcinek,
      stan: hasOdcinek ? 'kompletne' : 'brak',
      wartosc: kontekst.segment_label || (hasOdcinek ? 'Wskazany' : 'Brak'),
    },
    {
      etykieta: T.wierszAparat,
      stan: dane.catalog_ref ? 'kompletne' : 'brak',
      wartosc: dane.catalog_ref ? 'Kompletne' : 'Do konfiguracji',
    },
    {
      etykieta: T.wierszStan,
      stan: dane.normal_state === 'open' ? 'ostrzezenie' : 'kompletne',
      wartosc: dane.normal_state === 'open' ? 'Otwarty (NOP)' : 'Zamknięty',
    },
    { etykieta: T.wierszPolozenie, stan: 'kompletne', wartosc: fmtPct01(dane.polozenie) },
  ];

  const aside = (
    <>
      <KreatorGotowosc tytul={T.kontrolaTytul} wiersze={wierszeGotowosci} testid="mvd-kreator-lacznik-gotowosc" />
      <KreatorNastepnyKrok eyebrow={T.downstreamTytul} opis={T.downstreamOpis} />
    </>
  );

  const paramReadout = params ? (
    <KreatorSiatka kolumny={3}>
      <RzadWartosci etykieta={T.paramNapiecie} wartosc={`${params.u_n_kv} kV`} />
      <RzadWartosci etykieta={T.paramPrad} wartosc={`${params.i_n_a} A`} />
      <RzadWartosci
        etykieta={T.paramZwarcie}
        wartosc={typeof params.breaking_capacity_ka === 'number' ? `${params.breaking_capacity_ka} kA` : '—'}
      />
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
      walidacja={bledy.length > 0 ? T.walidacjaStopka : !hasOdcinek ? T.brakOdcinkaOpis : null}
      akcjaGlowna={{ etykieta: T.zapisz, onClick: onZapisz, zablokowana: !hasOdcinek || !activeCaseId, testid: 'mvd-kreator-lacznik-zapisz' }}
      akcjaAnuluj={{ etykieta: T.anuluj, onClick: () => closeForm(), testid: 'mvd-kreator-lacznik-anuluj' }}
      krokWstecz={
        krokIndex > 0
          ? { etykieta: T.wstecz, onClick: () => setKrok(KROKI[krokIndex - 1].id), testid: 'mvd-kreator-lacznik-wstecz' }
          : undefined
      }
      krokDalej={
        krokIndex < KROKI.length - 1
          ? { etykieta: T.dalej, onClick: () => setKrok(KROKI[krokIndex + 1].id), testid: 'mvd-kreator-lacznik-dalej' }
          : undefined
      }
      licznikKrokow={T.licznik(krokIndex + 1, KROKI.length)}
      testid="mvd-kreator-lacznik"
    >
      {!hasOdcinek ? (
        <KreatorSekcja tytul={T.brakOdcinkaTytul} testid="mvd-kreator-lacznik-brak">
          <KreatorInfo>{T.brakOdcinkaOpis}</KreatorInfo>
        </KreatorSekcja>
      ) : null}

      {krok === 'aparat' ? (
        <KreatorSekcja tytul={T.krokAparat} testid="mvd-kreator-lacznik-aparat">
          <KreatorInfo>{T.typPomoc}</KreatorInfo>
          <PoleKatalogu
            etykieta={T.typKatalog}
            wartosc={dane.catalog_ref}
            onZmiana={(v) => zmien('catalog_ref', v)}
            opcje={opcjeTypow}
            status={bladKatalogu ? 'error' : 'ready'}
            placeholder={T.typKatalogPlaceholder}
            komunikatBledu={bladKatalogu ?? T.typBlad}
            testid="mvd-kreator-lacznik-katalog"
          />
          {bladDlaPola('catalog_ref') ? <p className="mvd-pole-blad">{bladDlaPola('catalog_ref')}</p> : null}
          <KreatorSiatka kolumny={2}>
            <PoleWyboru
              etykieta={T.rodzaj}
              wartosc={dane.switch_type}
              onZmiana={(v) => zmien('switch_type', v as SwitchType)}
              opcje={T.rodzajOpcje}
              testid="mvd-kreator-lacznik-rodzaj"
            />
            <PoleWyboru
              etykieta={T.stan}
              wartosc={dane.normal_state}
              onZmiana={(v) => zmien('normal_state', v as NormalState)}
              opcje={T.stanOpcje}
              testid="mvd-kreator-lacznik-stan"
            />
            <PoleLiczbowe
              etykieta={T.polozenie}
              wartosc={dane.polozenie}
              onZmiana={(v) => zmien('polozenie', v ?? 0)}
              krok={0.05}
              min={0}
              pomoc={T.polozeniePomoc}
              blad={bladDlaPola('polozenie')}
              testid="mvd-kreator-lacznik-polozenie"
            />
            <PoleTekstowe
              etykieta={T.nazwa}
              wartosc={dane.nazwa}
              onZmiana={(v) => zmien('nazwa', v)}
              placeholder={T.nazwaPlaceholder}
              testid="mvd-kreator-lacznik-nazwa"
            />
          </KreatorSiatka>
          {paramReadout}
          <PanelTeorii
            tytul={T.teoriaTytul}
            opis={T.teoriaOpis}
            wymog={T.teoriaWymog}
            podstawa={T.teoriaPodstawa}
            testid="mvd-kreator-lacznik-teoria"
          />
        </KreatorSekcja>
      ) : null}

      {krok === 'zapis' ? (
        <KreatorSekcja tytul={T.krokZapis} testid="mvd-kreator-lacznik-zapis">
          <KreatorInfo>{T.downstreamOpis}</KreatorInfo>
          <KreatorSiatka kolumny={2}>
            <RzadWartosci etykieta={T.wierszOdcinek} wartosc={kontekst.segment_label || '—'} />
            <RzadWartosci etykieta={T.wierszStan} wartosc={dane.normal_state === 'open' ? 'Otwarty (NOP)' : 'Zamknięty'} />
            <RzadWartosci etykieta={T.wierszPolozenie} wartosc={fmtPct01(dane.polozenie)} />
            <RzadWartosci etykieta={T.rodzaj} wartosc={dane.switch_type} />
          </KreatorSiatka>
        </KreatorSekcja>
      ) : null}
    </KreatorRama>
  );
}
