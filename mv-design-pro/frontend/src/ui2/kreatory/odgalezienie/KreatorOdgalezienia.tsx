/**
 * Kreator „Odgałęzienie SN" — ui2, kreatory/rama.
 *
 * Rozpoczyna odgałęzienie (pierwszy odcinek) od jawnego zacisku źródła. Katalog-first
 * (KABEL_SN / LINIA_SN — bez ręcznych impedancji). Zapis = operacja domenowa
 * `start_branch_segment_sn`. ZERO fizyki w UI (kontrakt payloadu bez zmian
 * względem legacy StartBranchForm; zachowane guardy torowości).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { fetchCableTypes, fetchLineTypes, getCatalogErrorMessage } from '../../../ui/catalog/api';
import type { CableType, LineType } from '../../../ui/catalog/types';
import { catalogRefFromInput } from '../../../ui/network-build/forms/catalogPayload';
import { validateCatalogFirst } from '../../../ui/network-build/forms/catalogFirstRules';
import { resolveBranchSourceContextFromOperation } from '../../../ui/network-build/operationContextResolvers';
import { resolveTrunkOriginKind } from '../../../ui/network-build/trunkOriginResolver';
import { validateTrunkSegmentOrigin, type TrunkBranchKind } from '../../../ui/network-build/semanticValidator';
import { useActiveOperationContext, useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { nazwaObiektuZMigawki } from '../../wyniki/wzorzec/useNazwaObiektu';
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
  PoleWyboru,
  RzadWartosci,
  jedynaZgodna,
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
  efektywnyRodzaj,
  konfliktyFormularza,
  maZrodlo,
  walidujFormularz,
  zbudujPayload,
  type KontekstOdgalezienia,
  type OdgaleznieFormData,
  type RodzajOdcinka,
} from './odgaleznieModel';
import { OPCJE_UZIEMIENIA_EKRANU } from '../../../types/uziemienie';
import { ODGALEZIENIE_STRINGS as T } from './strings';

const KROKI: readonly KrokKreatora[] = [
  { id: 'odcinek', tytul: T.krokOdcinek },
  { id: 'zapis', tytul: T.krokZapis },
];

/** Pole formularza → krok i kontrolka (wskazanie BRAKU_DO_OPERACJI przy zapisie). */
const MIEJSCA: Readonly<Record<string, MiejscePola>> = {
  dlugosc_km: { krok: 'odcinek', pole: 'mvd-kreator-odgalezienie-dlugosc' },
  catalog_ref: { krok: 'odcinek', pole: 'mvd-kreator-odgalezienie-katalog' },
};

/** Tor wymuszony przez typ źródła (ZKSN=kabel, słup=linia napowietrzna). */
function wymuszonyRodzaj(sourceType: string): RodzajOdcinka | null {
  if (sourceType === 'ZKSN') return 'cable';
  if (sourceType === 'Słup rozgałęźny') return 'line_overhead';
  return null;
}

function rodzajZKontekstu(context: Record<string, unknown> | undefined): RodzajOdcinka {
  const segment = context?.segment as Record<string, unknown> | undefined;
  const candidate = segment?.rodzaj ?? segment?.type ?? context?.segment_type ?? context?.segment_kind;
  return candidate === 'LINIA_NAPOWIETRZNA' || candidate === 'line_overhead' ? 'line_overhead' : 'cable';
}

export function KreatorOdgalezienia() {
  const context = useActiveOperationContext() as Record<string, unknown> | undefined;
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const selekcjaPoOperacji = useSelekcjaPoOperacji();
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);

  const sourceContext = useMemo(
    () => resolveBranchSourceContextFromOperation(snapshot, context),
    [snapshot, context],
  );
  const kontekst = useMemo<KontekstOdgalezienia>(() => {
    const segment = context?.segment as Record<string, unknown> | undefined;
    return {
      from_ref: sourceContext.fromRef,
      source_type_label: sourceContext.sourceType,
      source_name: sourceContext.sourceName,
      forced_segment_type: wymuszonyRodzaj(sourceContext.sourceType),
      initial_segment_type: rodzajZKontekstu(context),
      initial_catalog_ref:
        catalogRefFromInput(segment?.catalog_binding) ?? catalogRefFromInput(context?.catalog_binding),
    };
  }, [context, sourceContext]);

  const hasZrodlo = maZrodlo(kontekst);

  const [dane, setDane] = useState<OdgaleznieFormData>(() => ({
    ...DANE_DOMYSLNE,
    segment_type: kontekst.forced_segment_type ?? kontekst.initial_segment_type,
    catalog_ref: kontekst.initial_catalog_ref,
  }));
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);
  const [krok, setKrok] = useState<string>('odcinek');
  const prowadzenie = useProwadzenie(setKrok);
  const { edytowane, decyzjaProjektanta } = useDecyzjeProjektanta<'catalog_ref'>();

  const [kable, setKable] = useState<CableType[]>([]);
  const [linie, setLinie] = useState<LineType[]>([]);
  const [bladKatalogu, setBladKatalogu] = useState<string | null>(null);
  // S9-5 (klasa: bramka enable bez sygnału gotowości) — jawny znacznik
  // ładowania katalogu, niezależny od `kable/linie.length` (katalog pusty PO
  // wczytaniu wygląda inaczej niż katalog W TRAKCIE wczytywania).
  const [katalogLadowanie, setKatalogLadowanie] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setBladKatalogu(null);
    setKatalogLadowanie(true);
    Promise.all([fetchCableTypes(), fetchLineTypes()])
      .then(([c, l]) => {
        if (cancelled) return;
        setKable(Array.isArray(c) ? c : []);
        setLinie(Array.isArray(l) ? l : []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setKable([]);
        setLinie([]);
        setBladKatalogu(getCatalogErrorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setKatalogLadowanie(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rodzaj = efektywnyRodzaj(dane, kontekst);
  const rodzajZablokowany = kontekst.forced_segment_type != null;

  // Wymuszenie toru po stronie źródła nadpisuje wybór użytkownika.
  useEffect(() => {
    if (kontekst.forced_segment_type && dane.segment_type !== kontekst.forced_segment_type) {
      setDane((p) => ({ ...p, segment_type: kontekst.forced_segment_type as RodzajOdcinka }));
    }
  }, [kontekst.forced_segment_type, dane.segment_type]);

  const opcjeTypow = useMemo(() => {
    if (rodzaj === 'line_overhead') {
      return linie.map((t) => ({
        id: t.id,
        etykieta: `${t.name} · ${t.cross_section_mm2} mm² · ${t.rated_current_a} A`,
      }));
    }
    return kable.map((t) => ({
      id: t.id,
      etykieta: `${t.name} · ${t.cross_section_mm2} mm² · ${t.rated_current_a} A`,
    }));
  }, [kable, linie, rodzaj]);

  const params = useMemo(() => {
    if (!dane.catalog_ref) return null;
    const pool = rodzaj === 'line_overhead' ? linie : kable;
    return pool.find((t) => t.id === dane.catalog_ref) ?? null;
  }, [dane.catalog_ref, kable, linie, rodzaj]);

  const wymuszonyKomunikat =
    kontekst.forced_segment_type === 'cable'
      ? T.wymuszonyTorZksn
      : kontekst.forced_segment_type === 'line_overhead'
        ? T.wymuszonyTorSlup
        : null;

  const zmien = useCallback(
    <K extends keyof OdgaleznieFormData>(pole: K, wartosc: OdgaleznieFormData[K]) => {
      setDane((p) => ({ ...p, [pole]: wartosc }));
      if (pole === 'catalog_ref') edytowane('catalog_ref');
    },
    [edytowane],
  );

  // AUTO_PRZYJETE: typ odcinka wskazany w kontekście operacji albo jedyna pozycja katalogu
  // dla rodzaju odcinka. Kilka pozycji = wybór projektanta (lista), nigdy pierwsza.
  const pulaRodzaju: readonly (CableType | LineType)[] = rodzaj === 'line_overhead' ? linie : kable;
  const jedynyTyp = useMemo(() => jedynaZgodna(pulaRodzaju), [pulaRodzaju]);
  useEffect(() => {
    if (katalogLadowanie || decyzjaProjektanta('catalog_ref')) return;
    if (kontekst.initial_catalog_ref && dane.catalog_ref === kontekst.initial_catalog_ref) return;
    if (dane.catalog_ref && pulaRodzaju.some((t) => t.id === dane.catalog_ref)) return;
    if (dane.catalog_ref) {
      // Pozycja spoza puli rodzaju (zmiana rodzaju odcinka) — źródło przestało obowiązywać.
      setDane((p) => ({ ...p, catalog_ref: null }));
      return;
    }
    if (jedynyTyp) {
      setDane((p) => ({ ...p, catalog_ref: jedynyTyp.id }));
    }
  }, [dane.catalog_ref, decyzjaProjektanta, jedynyTyp, katalogLadowanie, kontekst.initial_catalog_ref, pulaRodzaju]);

  // KONFLIKT_TECHNICZNY — widoczny od razu: długość niedodatnia, tor niezgodny ze źródłem
  // (kabel nie wychodzi ze słupa itd. — guard torowości zachowany z legacy).
  const konflikty = useMemo(() => konfliktyFormularza(dane), [dane]);
  const konfliktDlaPola = (pole: string): string | undefined =>
    konflikty.find((b) => b.field === pole)?.message;
  const konfliktToru = useMemo(() => {
    const originKind = resolveTrunkOriginKind(snapshot, {
      ...context,
      from_ref: kontekst.from_ref,
      source_type_label: kontekst.source_type_label,
    });
    if (!originKind) return null;
    const branchKind: TrunkBranchKind = rodzaj === 'line_overhead' ? 'overhead_line_sn' : 'cable_sn';
    const semantyka = validateTrunkSegmentOrigin({ branchKind, originKind });
    return semantyka.ok ? null : `${semantyka.messagePl} ${semantyka.suggestedFixPl}`;
  }, [context, kontekst.from_ref, kontekst.source_type_label, rodzaj, snapshot]);

  const onZapisz = useCallback(async () => {
    const brak = pierwszyBrak([
      !hasZrodlo && { komunikat: T.brakZrodlaOpis },
      konfliktToru ? { komunikat: konfliktToru, krok: 'odcinek', pole: 'mvd-kreator-odgalezienie-rodzaj' } : null,
      ...walidujFormularz(dane).map((b) => wskazanieZBledu(b, MIEJSCA)),
      !activeCaseId && { komunikat: T.brakZakresu },
    ]);
    if (brak) {
      prowadzenie.wskaz(brak);
      return;
    }
    prowadzenie.zgas();

    const payload = zbudujPayload(dane, kontekst);
    const bladKatalogFirst = validateCatalogFirst('start_branch_segment_sn', payload);
    if (bladKatalogFirst) {
      setBladGlobalny(bladKatalogFirst);
      return;
    }

    setBladGlobalny(null);
    try {
      const response = await executeDomainOperation(activeCaseId as string, 'start_branch_segment_sn', payload);
      if (!response) {
        setBladGlobalny(useSnapshotStore.getState().error ?? T.bladZapisu);
        return;
      }
      if (response.error) {
        setBladGlobalny(response.error);
        return;
      }
      closeForm();
      selekcjaPoOperacji(response, { type: 'LineBranch', name: 'Nowe odgałęzienie SN' });
    } catch (e) {
      setBladGlobalny(e instanceof Error ? e.message : T.bladZapisu);
    }
  }, [activeCaseId, closeForm, dane, executeDomainOperation, hasZrodlo, konfliktToru, kontekst, prowadzenie, selekcjaPoOperacji]);

  const wierszeGotowosci: WierszGotowosci[] = [
    {
      etykieta: T.wierszZrodlo,
      stan: hasZrodlo ? 'ustalone' : 'do_wyboru',
      wartosc: hasZrodlo ? kontekst.source_name : T.zrodloDoWskazania,
    },
    {
      etykieta: T.wierszRodzaj,
      stan: konfliktToru ? 'konflikt' : 'ustalone',
      wartosc: rodzaj === 'line_overhead' ? 'Linia napowietrzna SN' : 'Kabel SN',
    },
    {
      etykieta: T.wierszDlugosc,
      stan: konfliktDlaPola('dlugosc_km') ? 'konflikt' : dane.dlugosc_km === null ? 'do_wyboru' : 'ustalone',
      wartosc: dane.dlugosc_km !== null ? `${dane.dlugosc_km} km` : '',
    },
    {
      etykieta: T.wierszKatalog,
      stan: !dane.catalog_ref ? 'do_wyboru' : 'ustalone',
      wartosc: params?.name ?? '',
    },
  ];

  const aside = (
    <>
      <KreatorGotowosc tytul={T.kontrolaTytul} wiersze={wierszeGotowosci} testid="mvd-kreator-odgalezienie-gotowosc" />
      <KreatorNastepnyKrok eyebrow={T.downstreamTytul} opis={T.downstreamOpis} />
    </>
  );

  const paramReadout = params ? (
    <KreatorSiatka kolumny={3}>
      <RzadWartosci etykieta={T.paramObciazalnosc} wartosc={`${params.rated_current_a} A`} />
      <RzadWartosci etykieta={T.paramPrzekroj} wartosc={`${params.cross_section_mm2} mm²`} />
      <RzadWartosci etykieta={T.paramNapiecie} wartosc={`${params.voltage_rating_kv} kV`} />
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
        testid: 'mvd-kreator-odgalezienie-zapisz',
      }}
      akcjaAnuluj={{ etykieta: T.anuluj, onClick: () => closeForm(), testid: 'mvd-kreator-odgalezienie-anuluj' }}
      krokWstecz={
        krokIndex > 0
          ? { etykieta: T.wstecz, onClick: () => setKrok(KROKI[krokIndex - 1].id), testid: 'mvd-kreator-odgalezienie-wstecz' }
          : undefined
      }
      krokDalej={
        krokIndex < KROKI.length - 1
          ? { etykieta: T.dalej, onClick: () => setKrok(KROKI[krokIndex + 1].id), testid: 'mvd-kreator-odgalezienie-dalej' }
          : undefined
      }
      licznikKrokow={T.licznik(krokIndex + 1, KROKI.length)}
      testid="mvd-kreator-odgalezienie"
    >
      {!hasZrodlo ? (
        <KreatorSekcja tytul={T.brakZrodlaTytul} testid="mvd-kreator-odgalezienie-brak">
          <KreatorInfo>{T.brakZrodlaOpis}</KreatorInfo>
        </KreatorSekcja>
      ) : null}

      <KreatorSekcja tytul={T.zrodloSekcja} testid="mvd-kreator-odgalezienie-zrodlo">
        <KreatorSiatka kolumny={3}>
          <RzadWartosci
            etykieta={T.zrodloPunkt}
            wartosc={kontekst.from_ref ? nazwaObiektuZMigawki(snapshot, kontekst.from_ref) : '—'}
          />
          <RzadWartosci etykieta={T.zrodloTyp} wartosc={kontekst.source_type_label} />
          <RzadWartosci etykieta={T.zrodloNazwa} wartosc={kontekst.source_name} />
        </KreatorSiatka>
      </KreatorSekcja>

      {krok === 'odcinek' ? (
        <KreatorSekcja tytul={T.krokOdcinek} testid="mvd-kreator-odgalezienie-sekcja">
          <KreatorSiatka kolumny={2}>
            <PoleWyboru
              etykieta={T.rodzaj}
              wartosc={rodzaj}
              onZmiana={(v) => zmien('segment_type', v as RodzajOdcinka)}
              opcje={T.rodzajOpcje}
              pomoc={wymuszonyKomunikat ?? T.rodzajPomoc}
              blad={konfliktToru ?? undefined}
              wylaczone={rodzajZablokowany}
              testid="mvd-kreator-odgalezienie-rodzaj"
            />
            {rodzaj === 'cable' ? (
              <PoleWyboru
                etykieta={T.ekranUziemienie}
                wartosc={dane.screen_bonding}
                onZmiana={(v) => zmien('screen_bonding', v as OdgaleznieFormData['screen_bonding'])}
                opcje={OPCJE_UZIEMIENIA_EKRANU}
                pomoc={T.ekranUziemieniePomoc}
                testid="mvd-kreator-odgalezienie-ekran"
              />
            ) : null}
            <PoleLiczbowe
              etykieta={T.dlugosc}
              jednostka="km"
              wartosc={dane.dlugosc_km}
              onZmiana={(v) => zmien('dlugosc_km', v)}
              krok={0.01}
              min={0}
              pomoc={T.dlugoscPomoc}
              blad={konfliktDlaPola('dlugosc_km')}
              wymagane
              testid="mvd-kreator-odgalezienie-dlugosc"
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
            wymagane
            testid="mvd-kreator-odgalezienie-katalog"
          />
          {paramReadout}
          <PanelTeorii
            tytul={T.teoriaTytul}
            opis={T.teoriaOpis}
            wymog={T.teoriaWymog}
            podstawa={T.teoriaPodstawa}
            testid="mvd-kreator-odgalezienie-teoria"
          />
        </KreatorSekcja>
      ) : null}

      {krok === 'zapis' ? (
        <KreatorSekcja tytul={T.krokZapis} testid="mvd-kreator-odgalezienie-zapis">
          <KreatorInfo>{T.downstreamOpis}</KreatorInfo>
          <KreatorSiatka kolumny={2}>
            <RzadWartosci etykieta={T.wierszZrodlo} wartosc={kontekst.source_name} />
            <RzadWartosci etykieta={T.wierszRodzaj} wartosc={rodzaj === 'line_overhead' ? 'Linia napowietrzna SN' : 'Kabel SN'} />
            <RzadWartosci etykieta={T.wierszDlugosc} wartosc={dane.dlugosc_km ? `${dane.dlugosc_km} km` : '—'} />
            <RzadWartosci etykieta={T.wierszKatalog} wartosc={params?.name ?? '—'} />
          </KreatorSiatka>
        </KreatorSekcja>
      ) : null}
    </KreatorRama>
  );
}
