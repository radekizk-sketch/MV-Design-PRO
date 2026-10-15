/**
 * Kreator „Dodaj ogranicznik przepięć SN" (V12K-085, G-STK-8) — ui2, rama.
 *
 * Domyka stronę konfiguracyjną GAP-2: zapis = operacja domenowa
 * `add_surge_arrester_sn` (aparat na field_spec pola). Ten sam element czytają
 * read-model pola (glif SLD) i most koordynacji izolacji IEC 60071. Katalog-first
 * (OGRANICZNIK_SN); ZERO fizyki w UI — margines BIL liczy solver koordynacji.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { fetchSurgeArresterTypes, getCatalogErrorMessage } from '../../../ui/catalog/api';
import type { SurgeArresterCatalogType } from '../../../ui/catalog/types';
import {
  useActiveOperationContext,
  useNetworkBuildStore,
} from '../../../ui/network-build/networkBuildStore';
import { useSelectionStore } from '../../../ui/selection';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
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
  RzadWartosci,
  jedynaZgodna,
  napieciePola,
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
  fmtKlasa,
  fmtKv,
  maMiejsce,
  napiecieNiezgodne,
  parametryZKatalogu,
  typyZgodneZSzyna,
  walidujFormularz,
  zbudujPayload,
  type KontekstOgranicznika,
  type OgranicznikFormData,
} from './ogranicznikModel';
import { OGRANICZNIK_STRINGS as T } from './strings';

const KROKI: readonly KrokKreatora[] = [
  { id: 'typ', tytul: T.krokTyp },
  { id: 'zapis', tytul: T.krokZapis },
];

/** Pole formularza → krok i kontrolka (wskazanie BRAKU_DO_OPERACJI przy zapisie). */
const MIEJSCA: Readonly<Record<string, MiejscePola>> = {
  catalog_ref: { krok: 'typ', pole: 'mvd-kreator-ogranicznik-katalog' },
};

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function kontekstZOperacji(
  context: Record<string, unknown> | null,
  selected: { id: string; name: string; type: string } | null,
): KontekstOgranicznika {
  const fieldRef =
    trimmed(context?.field_ref ?? context?.bay_ref)
    || (selected && selected.type === 'BaySN' ? selected.id : '');
  const fieldName =
    trimmed(context?.field_name ?? context?.bay_name)
    || (selected && selected.type === 'BaySN' ? selected.name : '');
  const busRef =
    trimmed(context?.bus_ref) || (selected && selected.type === 'Bus' ? selected.id : '');
  const busName =
    trimmed(context?.bus_name) || (selected && selected.type === 'Bus' ? selected.name : '');
  const rawV = Number(context?.bus_voltage_kv ?? context?.voltage_kv);
  return {
    field_ref: fieldRef || undefined,
    field_name: fieldName || undefined,
    bus_ref: busRef || undefined,
    bus_name: busName || undefined,
    bus_voltage_kv: Number.isFinite(rawV) && rawV > 0 ? rawV : undefined,
  };
}

export function KreatorOgranicznikaSn() {
  const context = useActiveOperationContext() as Record<string, unknown> | null;
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const selekcjaPoOperacji = useSelekcjaPoOperacji();
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const selectedElement = useSelectionStore((s) => s.selectedElements[0] ?? null);
  const snapshot = useSnapshotStore((s) => s.snapshot);

  const selected = useMemo(
    () =>
      selectedElement
        ? { id: selectedElement.id, name: selectedElement.name, type: selectedElement.type }
        : null,
    [selectedElement],
  );

  // Napięcie miejsca: z kontekstu operacji, a gdy go brak — z migawki (szyna albo szyna pola).
  const kontekst = useMemo(() => {
    const k = kontekstZOperacji(context, selected);
    if (k.bus_voltage_kv !== undefined) return k;
    const kv = napiecieSzyny(snapshot, k.bus_ref) ?? napieciePola(snapshot, k.field_ref);
    return { ...k, bus_voltage_kv: kv ?? undefined };
  }, [context, selected, snapshot]);
  const hasMiejsce = maMiejsce(kontekst);

  const [dane, setDane] = useState<OgranicznikFormData>(() => ({ ...DANE_DOMYSLNE }));
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);
  const [krok, setKrok] = useState<string>('typ');
  const prowadzenie = useProwadzenie(setKrok);
  const { edytowane, decyzjaProjektanta } = useDecyzjeProjektanta<'catalog_ref'>();

  const [typy, setTypy] = useState<SurgeArresterCatalogType[]>([]);
  const [bladKatalogu, setBladKatalogu] = useState<string | null>(null);
  // S9-5 (klasa: bramka enable bez sygnału gotowości) — jawny znacznik
  // ładowania katalogu, niezależny od `typy.length` (katalog pusty PO
  // wczytaniu wygląda inaczej niż katalog W TRAKCIE wczytywania).
  const [katalogLadowanie, setKatalogLadowanie] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setBladKatalogu(null);
    setKatalogLadowanie(true);
    fetchSurgeArresterTypes()
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

  const opcjeTypow = useMemo(
    () =>
      typy.map((t) => ({
        id: t.id,
        etykieta: `${t.name} · U_m ${t.u_m_kv} kV · BIL ${t.bil_protected_kv} kV`,
      })),
    [typy],
  );

  // AUTO_PRZYJETE: jedyny ogranicznik, którego U_m pokrywa napięcie miejsca.
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
    <K extends keyof OgranicznikFormData>(pole: K, wartosc: OgranicznikFormData[K]) => {
      setDane((p) => ({ ...p, [pole]: wartosc }));
      if (pole === 'catalog_ref') edytowane('catalog_ref');
    },
    [edytowane],
  );

  // KONFLIKT_TECHNICZNY — U_m < napięcie szyny: widoczny od razu przy polu typu.
  const napBlad = napiecieNiezgodne(params, kontekst);
  const miejsceLabel = kontekst.field_name || kontekst.field_ref || kontekst.bus_name || kontekst.bus_ref || '—';

  const onZapisz = useCallback(async () => {
    const brak = pierwszyBrak([
      !hasMiejsce && { komunikat: T.brakMiejscaOpis },
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
        'add_surge_arrester_sn',
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
      selekcjaPoOperacji(response, { type: 'BaySN', name: miejsceLabel });
    } catch (e) {
      setBladGlobalny(e instanceof Error ? e.message : T.bladZapisu);
    }
  }, [
    activeCaseId,
    closeForm,
    dane,
    executeDomainOperation,
    hasMiejsce,
    kontekst,
    miejsceLabel,
    napBlad,
    prowadzenie,
    selekcjaPoOperacji,
  ]);

  const nazwaTypu = typy.find((t) => t.id === dane.catalog_ref)?.name ?? '';
  const wierszeGotowosci: WierszGotowosci[] = [
    {
      etykieta: T.wierszTyp,
      stan: napBlad ? 'konflikt' : !dane.catalog_ref ? 'do_wyboru' : 'ustalone',
      wartosc: nazwaTypu,
    },
    {
      etykieta: T.wierszMiejsce,
      stan: hasMiejsce ? 'ustalone' : 'do_wyboru',
      wartosc: hasMiejsce ? miejsceLabel : T.miejsceDoWskazania,
    },
    {
      etykieta: T.wierszUm,
      stan: napBlad ? 'konflikt' : params ? 'ustalone' : 'do_wyboru',
      wartosc: params ? fmtKv(params.u_m_kv) : '',
    },
    {
      etykieta: T.wierszBil,
      stan: params ? 'ustalone' : 'do_wyboru',
      wartosc: params ? fmtKv(params.bil_protected_kv) : '',
    },
  ];

  const aside = (
    <>
      <KreatorPodsumowanie
        tytul={T.podsumowanieTytul}
        komunikat={null}
        testid="mvd-kreator-ogranicznik-podsumowanie"
      >
        {params ? (
          <>
            <RzadWartosci etykieta={T.paramUm} wartosc={fmtKv(params.u_m_kv)} />
            <RzadWartosci etykieta={T.paramMcov} wartosc={fmtKv(params.mcov_kv)} />
            <RzadWartosci etykieta={T.paramUres} wartosc={fmtKv(params.u_residual_at_10ka_kv)} />
            <RzadWartosci etykieta={T.paramBil} wartosc={fmtKv(params.bil_protected_kv)} />
          </>
        ) : (
          <p className="mvd-podsum-komunikat">{T.typPomoc}</p>
        )}
      </KreatorPodsumowanie>
      <KreatorGotowosc
        tytul={T.kontrolaTytul}
        wiersze={wierszeGotowosci}
        testid="mvd-kreator-ogranicznik-gotowosc"
      />
      <KreatorNastepnyKrok eyebrow={T.downstreamTytul} opis={T.downstreamOpis} />
    </>
  );

  const paramReadout = params ? (
    <KreatorSiatka kolumny={3}>
      <RzadWartosci etykieta={T.paramUm} wartosc={fmtKv(params.u_m_kv)} />
      <RzadWartosci etykieta={T.paramMcov} wartosc={fmtKv(params.mcov_kv)} />
      <RzadWartosci etykieta={T.paramUres} wartosc={fmtKv(params.u_residual_at_10ka_kv)} />
      <RzadWartosci etykieta={T.paramKlasa} wartosc={fmtKlasa(params.energy_class)} />
      <RzadWartosci etykieta={T.paramBil} wartosc={fmtKv(params.bil_protected_kv)} />
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
        testid: 'mvd-kreator-ogranicznik-zapisz',
      }}
      akcjaAnuluj={{
        etykieta: T.anuluj,
        onClick: () => closeForm(),
        testid: 'mvd-kreator-ogranicznik-anuluj',
      }}
      krokWstecz={
        krokIndex > 0
          ? {
              etykieta: T.wstecz,
              onClick: () => setKrok(KROKI[krokIndex - 1].id),
              testid: 'mvd-kreator-ogranicznik-wstecz',
            }
          : undefined
      }
      krokDalej={
        krokIndex < KROKI.length - 1
          ? {
              etykieta: T.dalej,
              onClick: () => setKrok(KROKI[krokIndex + 1].id),
              testid: 'mvd-kreator-ogranicznik-dalej',
            }
          : undefined
      }
      licznikKrokow={T.licznik(krokIndex + 1, KROKI.length)}
      testid="mvd-kreator-ogranicznik"
    >
      {!hasMiejsce ? (
        <KreatorSekcja tytul={T.brakMiejscaTytul} testid="mvd-kreator-ogranicznik-brak-miejsca">
          <KreatorInfo>{T.brakMiejscaOpis}</KreatorInfo>
        </KreatorSekcja>
      ) : null}

      {krok === 'typ' ? (
        <KreatorSekcja tytul={T.krokTyp} testid="mvd-kreator-ogranicznik-typ">
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
            testid="mvd-kreator-ogranicznik-katalog"
          />
          {paramReadout}
          <PanelTeorii
            tytul={T.teoriaTytul}
            opis={T.teoriaOpis}
            wymog={T.teoriaWymog}
            podstawa={T.teoriaPodstawa}
            testid="mvd-kreator-ogranicznik-teoria"
          />
        </KreatorSekcja>
      ) : null}

      {krok === 'zapis' ? (
        <KreatorSekcja tytul={T.krokZapis} testid="mvd-kreator-ogranicznik-zapis">
          <KreatorInfo>{T.downstreamOpis}</KreatorInfo>
          <KreatorSiatka kolumny={2}>
            <RzadWartosci etykieta={T.wierszMiejsce} wartosc={miejsceLabel} />
            <RzadWartosci etykieta={T.wierszUm} wartosc={fmtKv(params?.u_m_kv)} />
            <RzadWartosci etykieta={T.paramUres} wartosc={fmtKv(params?.u_residual_at_10ka_kv)} />
            <RzadWartosci etykieta={T.wierszBil} wartosc={fmtKv(params?.bil_protected_kv)} />
          </KreatorSiatka>
        </KreatorSekcja>
      ) : null}
    </KreatorRama>
  );
}
