/**
 * KreatorZrodloZasilania — pełnoekranowy, 7-krokowy konfigurator „Dodaj źródło
 * zasilania (GPZ / rozdzielnia SN)". Przebudowa od zera wg audytu eksperckiego
 * `docs/uiux/AUDYT_KREATOR_ZRODLA_2026-07.md` (V12K-043): układ dwukolumnowy
 * (kroki+pola | stała kolumna: podsumowanie backendu + kontrola gotowości),
 * KOMPLET opcji z kontraktu `add_grid_source_sn` (katalog / ręczny ekwiwalent,
 * strona SN/110 kV, Sk″/impedancja, składowa zerowa, uziemienie R/X, per-sekcja,
 * transformatory, aparaty, parametry normowe).
 *
 * ZERO fizyki w UI: Sk″/Ik″/κ/ip/Ith/Z1/Z0 liczy backend (fetchGridSourcePreview,
 * IEC 60909). ZERO fabrykacji: każda opcja mapuje na realne pole payloadu.
 * Kontrakt operacji domenowej bez zmian (payload w `zrodloModel`).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { fetchMvApparatusTypes, fetchSourceSystemTypes, getCatalogErrorMessage } from '../../../ui/catalog/api';
import type { MVApparatusType, SourceSystemCatalogType } from '../../../ui/catalog/types';
import { navigateToSld } from '../../../ui/navigation/routes';
import { validateCatalogFirst } from '../../../ui/network-build/forms/catalogFirstRules';
import { catalogRefFromInput, type GpzGroundingType } from '../../../ui/network-build/forms/catalogPayload';
import {
  fetchGridSourcePreview,
  type GridSourcePreviewResponse,
} from '../../../ui/network-build/forms/gridSourcePreviewApi';
import { useActiveOperationContext, useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import {
  KreatorGotowosc,
  KreatorInfo,
  KreatorNastepnyKrok,
  KreatorPodsumowanie,
  KreatorRama,
  KreatorSekcja,
  KreatorSiatka,
  PoleKatalogu,
  PoleLiczbowe,
  PolePrzelacznik,
  PolePrzelacznikBinarny,
  PoleTekstowe,
  PoleWyboru,
  RzadWartosci,
  type KrokKreatora,
  type StatusPobrania,
} from '../rama';
import {
  MAX_POL_NA_SEKCJE,
  etykietaAparatu,
  etykietaZrodlaKatalogu,
  formatujKa,
  formatujLiczbe,
  formatujMva,
  formatujZespolona,
  normalizujSekcje,
  opisUziemienia,
  pasujeRodzajAparatu,
  scalDanePoczatkowe,
  walidujFormularz,
  wierszeGotowosci,
  zbudujOznaczenieGpz,
  zbudujPayloadZrodla,
  zbudujZadaniePodgladu,
  znajdzPozycjeKatalogu,
  type BladPolaZrodla,
  type GpzLineFieldApparatusKind,
  type GridSourceFormData,
} from './zrodloModel';
import { ZRODLO_STRINGS as T } from './strings';

const KROKI: readonly KrokKreatora[] = [
  { id: 'identyfikacja', tytul: T.krokIdentyfikacja },
  { id: 'zrodlo', tytul: T.krokZrodlo },
  { id: 'transformatory', tytul: T.krokTransformatory },
  { id: 'rozdzielnia', tytul: T.krokRozdzielnia },
  { id: 'sekcje', tytul: T.krokSekcje },
  { id: 'normy', tytul: T.krokNormy },
  { id: 'zapis', tytul: T.krokZapis },
];

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function daneZKontekstu(context: Record<string, unknown> | null): Partial<GridSourceFormData> {
  if (!context) return {};
  const initial: Partial<GridSourceFormData> = {};
  const sourceName = readString(context.source_name);
  const voltageKv = readNumber(context.sn_voltage_kv) ?? readNumber(context.voltage_kv);
  const catalogRef = catalogRefFromInput(context.catalog_ref) ?? catalogRefFromInput(context.catalog_binding);
  const sectionsCount = readNumber(context.sections_count);
  const transformerCount = readNumber(context.transformer_count);
  const lineFieldsPerSection = readNumber(context.line_fields_per_section);
  if (sourceName) initial.source_name = sourceName;
  if (voltageKv !== null) initial.sn_voltage_kv = voltageKv;
  if (catalogRef) initial.catalog_ref = catalogRef;
  if (sectionsCount !== null) initial.sections_count = sectionsCount;
  if (transformerCount !== null) initial.transformer_count = transformerCount;
  if (lineFieldsPerSection !== null) initial.line_fields_per_section = lineFieldsPerSection;
  return initial;
}

export function KreatorZrodloZasilania() {
  const context = useActiveOperationContext();
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const collapseSurfaceStackTo = useNetworkBuildStore((s) => s.collapseSurfaceStackTo);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);

  const [dane, setDane] = useState<GridSourceFormData>(() =>
    scalDanePoczatkowe(daneZKontekstu(context as Record<string, unknown> | null)),
  );
  const [bledy, setBledy] = useState<BladPolaZrodla[]>([]);
  const [dotkniete, setDotkniete] = useState<Set<string>>(new Set());
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);
  const [krok, setKrok] = useState<string>('identyfikacja');

  const [katalog, setKatalog] = useState<SourceSystemCatalogType[]>([]);
  const [statusKatalogu, setStatusKatalogu] = useState<StatusPobrania>('idle');
  const [bladKatalogu, setBladKatalogu] = useState<string | null>(null);

  const [aparaty, setAparaty] = useState<MVApparatusType[]>([]);
  const [bladAparatow, setBladAparatow] = useState<string | null>(null);

  const [podglad, setPodglad] = useState<GridSourcePreviewResponse | null>(null);
  const [statusPodgladu, setStatusPodgladu] = useState<StatusPobrania>('idle');
  const [bladPodgladu, setBladPodgladu] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatusKatalogu('loading');
    setBladKatalogu(null);
    fetchSourceSystemTypes()
      .then((items) => {
        if (cancelled) return;
        setKatalog(Array.isArray(items) ? items : []);
        setStatusKatalogu('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setKatalog([]);
        setStatusKatalogu('error');
        setBladKatalogu(getCatalogErrorMessage(error));
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (dane.manual_mode || dane.catalog_ref || katalog.length === 0) return;
    const first = katalog[0];
    setDane((p) => (p.catalog_ref ? p : {
      ...p,
      catalog_ref: first.id,
      sn_voltage_kv: Number.isFinite(first.voltage_rating_kv) ? first.voltage_rating_kv : p.sn_voltage_kv,
      sk3_mva: Number.isFinite(first.sk3_mva) ? first.sk3_mva : p.sk3_mva,
      rx_ratio: typeof first.rx_ratio === 'number' && Number.isFinite(first.rx_ratio) ? first.rx_ratio : p.rx_ratio,
    }));
  }, [katalog, dane.catalog_ref, dane.manual_mode]);

  useEffect(() => {
    let cancelled = false;
    setBladAparatow(null);
    fetchMvApparatusTypes()
      .then((items) => {
        if (cancelled) return;
        setAparaty(Array.isArray(items) ? items : []);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setAparaty([]);
        setBladAparatow(getCatalogErrorMessage(error));
      });
    return () => { cancelled = true; };
  }, []);

  const filtrowaneAparaty = useMemo(
    () => aparaty.filter((item) => pasujeRodzajAparatu(item, dane.gpz_line_field_apparatus_kind)),
    [aparaty, dane.gpz_line_field_apparatus_kind],
  );

  useEffect(() => {
    if (dane.gpz_line_field_apparatus_catalog_ref || filtrowaneAparaty.length === 0) return;
    setDane((p) => (p.gpz_line_field_apparatus_catalog_ref ? p : {
      ...p,
      gpz_line_field_apparatus_catalog_ref: filtrowaneAparaty[0].id,
    }));
  }, [filtrowaneAparaty, dane.gpz_line_field_apparatus_catalog_ref]);

  const zadaniePodgladu = useMemo(() => zbudujZadaniePodgladu(dane), [dane]);
  useEffect(() => {
    if (zadaniePodgladu === null) {
      setPodglad(null);
      setStatusPodgladu('idle');
      setBladPodgladu(null);
      return undefined;
    }
    const controller = new AbortController();
    setPodglad(null);
    setStatusPodgladu('loading');
    setBladPodgladu(null);
    void fetchGridSourcePreview(zadaniePodgladu, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setPodglad(result);
        setStatusPodgladu('ready');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setPodglad(null);
        setStatusPodgladu('error');
        setBladPodgladu(error instanceof Error ? error.message : T.podsumBladDomyslny);
      });
    return () => controller.abort();
  }, [zadaniePodgladu]);

  const zmien = useCallback(<K extends keyof GridSourceFormData>(pole: K, wartosc: GridSourceFormData[K]) => {
    setDane((p) => ({ ...p, [pole]: wartosc }));
    setDotkniete((p) => new Set(p).add(pole as string));
  }, []);

  const ustawLiczbeSekcji = useCallback((n: number) => {
    setDane((p) => ({
      ...p,
      sections_count: n,
      sekcje: normalizujSekcje(p.sekcje, n, p.line_fields_per_section),
    }));
  }, []);

  const zmienSekcje = useCallback((index: number, patch: Partial<GridSourceFormData['sekcje'][number]>) => {
    setDane((p) => ({
      ...p,
      sekcje: p.sekcje.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));
  }, []);

  const wybierzKatalog = useCallback((catalogRef: string | null) => {
    const selected = znajdzPozycjeKatalogu(katalog, catalogRef);
    setDane((p) => ({
      ...p,
      catalog_ref: catalogRef,
      sn_voltage_kv: selected?.voltage_rating_kv ?? p.sn_voltage_kv,
      sk3_mva: selected?.sk3_mva ?? p.sk3_mva,
      rx_ratio: selected?.rx_ratio ?? p.rx_ratio,
    }));
    setDotkniete((p) => new Set(p).add('catalog_ref'));
  }, [katalog]);

  const zapisz = useCallback(async () => {
    const walidacja = walidujFormularz(dane);
    setBledy(walidacja);
    if (walidacja.length > 0) {
      setBladGlobalny(T.walidacjaStopka);
      return;
    }
    if (!activeCaseId) {
      setBladGlobalny(T.brakZakresu);
      return;
    }
    const payload = zbudujPayloadZrodla(dane);
    const validationError = validateCatalogFirst('add_grid_source_sn', payload);
    if (validationError) {
      setBladGlobalny(validationError);
      return;
    }
    setBladGlobalny(null);
    const result = await executeDomainOperation(activeCaseId, 'add_grid_source_sn', payload);
    if (
      typeof result === 'object' && result !== null && 'error' in result
      && typeof (result as { error?: unknown }).error === 'string'
      && (result as { error: string }).error.trim()
    ) {
      setBladGlobalny((result as { error: string }).error);
      return;
    }
    collapseSurfaceStackTo(null);
    closeForm();
    navigateToSld();
  }, [dane, activeCaseId, executeDomainOperation, collapseSurfaceStackTo, closeForm]);

  const bladDlaPola = (pole: string): string | undefined => {
    if (!dotkniete.has(pole) && bledy.length === 0) return undefined;
    return bledy.find((b) => b.field === pole)?.message;
  };

  const oznaczenie = useMemo(() => zbudujOznaczenieGpz(dane.source_name), [dane.source_name]);
  const wybranaPozycja = useMemo(() => znajdzPozycjeKatalogu(katalog, dane.catalog_ref), [katalog, dane.catalog_ref]);
  const gotowosc = useMemo(() => wierszeGotowosci(dane), [dane]);
  const opcjeKatalogu = katalog.map((item) => ({ id: item.id, etykieta: etykietaZrodlaKatalogu(item) }));
  const opcjeAparatow = filtrowaneAparaty.map((item) => ({ id: item.id, etykieta: etykietaAparatu(item) }));

  const indeksKroku = Math.max(0, KROKI.findIndex((k) => k.id === krok));
  const hv = dane.manual_mode && dane.short_circuit_input_side === 'HV_110';
  const impedancja = dane.manual_mode && dane.short_circuit_mode === 'IMPEDANCE';

  const etykietaIk1 = statusPodgladu === 'loading'
    ? 'obliczanie…'
    : statusPodgladu === 'ready' && podglad?.ik1_ka === null
      ? 'brak składowej zerowej'
      : formatujKa(podglad?.ik1_ka);

  const aside = (
    <>
      <KreatorPodsumowanie
        tytul={T.podsumTytul}
        status={statusPodgladu}
        komunikat={statusPodgladu === 'error' ? (bladPodgladu ?? T.podsumBladDomyslny) : null}
        komunikatTon="warn"
        testid="mvd-kreator-zrodlo-podsumowanie"
      >
        <RzadWartosci etykieta={T.podsumSk} wartosc={formatujMva(podglad?.sk_mva)} />
        <RzadWartosci etykieta={T.podsumIk3} wartosc={formatujKa(podglad?.ik3_ka)} />
        <RzadWartosci etykieta={T.podsumIk1} wartosc={etykietaIk1} ton={statusPodgladu === 'ready' && podglad?.ik1_ka !== null ? 'ok' : 'warn'} />
        <RzadWartosci etykieta={T.podsumKappa} wartosc={formatujLiczbe(podglad?.kappa, 3)} />
        <RzadWartosci etykieta={T.podsumIp} wartosc={formatujKa(podglad?.ip_ka)} />
        <RzadWartosci etykieta={T.podsumIth} wartosc={formatujKa(podglad?.ith_ka)} />
        <RzadWartosci etykieta={T.podsumZ1} wartosc={formatujZespolona(podglad?.z1_ohm)} />
        <RzadWartosci etykieta={T.podsumZ0} wartosc={formatujZespolona(podglad?.z0_ohm)} />
        <RzadWartosci etykieta={T.podsumZrodlo} wartosc={podglad ? T.podsumZrodloWartosc : T.podsumBrak} />
      </KreatorPodsumowanie>
      <KreatorGotowosc tytul={T.kontrolaTytul} wiersze={gotowosc} testid="mvd-kreator-zrodlo-kontrola" />
    </>
  );

  return (
    <KreatorRama
      testid="mvd-kreator-zrodlo"
      pelny
      aside={aside}
      eyebrow={T.eyebrow}
      tytul={dane.source_name || 'GPZ'}
      cel={T.celTworzenie}
      odznaka={T.odznakaNowy}
      kroki={KROKI}
      krokAktywny={krok}
      onKrok={setKrok}
      licznikKrokow={T.licznik(indeksKroku + 1, KROKI.length)}
      krokWstecz={{
        etykieta: T.wstecz,
        onClick: () => setKrok(KROKI[Math.max(0, indeksKroku - 1)].id),
        zablokowana: indeksKroku === 0,
        testid: 'mvd-kreator-zrodlo-wstecz',
      }}
      krokDalej={{
        etykieta: T.dalej,
        onClick: () => setKrok(KROKI[Math.min(KROKI.length - 1, indeksKroku + 1)].id),
        zablokowana: indeksKroku === KROKI.length - 1,
        testid: 'mvd-kreator-zrodlo-dalej',
      }}
      bladGlobalny={bladGlobalny}
      walidacja={bledy.length > 0 ? T.walidacjaStopka : null}
      akcjaGlowna={{ etykieta: T.zapisz, onClick: () => void zapisz(), testid: 'mvd-kreator-zrodlo-zapisz' }}
      akcjaAnuluj={{ etykieta: T.anuluj, onClick: closeForm, testid: 'mvd-kreator-zrodlo-anuluj' }}
    >
      {krok === 'identyfikacja' ? (
        <KreatorSekcja tytul={T.idTytul} testid="mvd-kreator-zrodlo-id">
          <KreatorSiatka kolumny={2}>
            <PoleTekstowe
              etykieta={T.nazwa}
              wartosc={dane.source_name}
              onZmiana={(v) => zmien('source_name', v)}
              placeholder={T.nazwaPlaceholder}
              wymagane
              blad={bladDlaPola('source_name')}
              testid="mvd-kreator-zrodlo-nazwa"
            />
            <PoleTekstowe etykieta={T.oznaczenie} wartosc={oznaczenie} tylkoOdczyt />
          </KreatorSiatka>
          <PoleWyboru
            etykieta={T.napiecieSn}
            wartosc={String(dane.sn_voltage_kv ?? '')}
            onZmiana={(v) => zmien('sn_voltage_kv', Number(v))}
            opcje={T.napieciaSn}
            pomoc={T.napiecieSnPomoc}
            wymagane
            blad={bladDlaPola('sn_voltage_kv')}
            testid="mvd-kreator-zrodlo-napiecie"
          />
        </KreatorSekcja>
      ) : null}

      {krok === 'zrodlo' ? (
        <>
          <KreatorSekcja tytul={T.trybZrodlaTytul} testid="mvd-kreator-zrodlo-tryb">
            <PolePrzelacznik
              ariaLabel={T.trybZrodlaTytul}
              testid="mvd-kreator-zrodlo-tryb-przel"
              wartosc={dane.manual_mode ? 'reczny' : 'katalog'}
              opcje={[
                { id: 'katalog', etykieta: T.trybKatalog },
                { id: 'reczny', etykieta: T.trybReczny },
              ]}
              onZmiana={(id) => zmien('manual_mode', id === 'reczny')}
            />
            {dane.manual_mode ? <KreatorInfo>{T.trybRecznyInfo}</KreatorInfo> : null}
          </KreatorSekcja>

          {!dane.manual_mode ? (
            <KreatorSekcja tytul={T.katalogTytul} testid="mvd-kreator-zrodlo-katalog">
              <PoleKatalogu
                etykieta={T.katalogPole}
                wartosc={dane.catalog_ref}
                onZmiana={wybierzKatalog}
                opcje={opcjeKatalogu}
                status={statusKatalogu}
                placeholder={T.katalogPlaceholder}
                placeholderLadowanie={T.katalogLadowanie}
                komunikatBledu={bladKatalogu ?? T.katalogBlad}
                pomoc={T.katalogPomoc}
                wymagane
                blad={bladDlaPola('catalog_ref')}
                testid="mvd-kreator-zrodlo-katalog-select"
              />
              <RzadWartosci etykieta={T.zrodloParametrow} wartosc={wybranaPozycja?.name ?? dane.catalog_ref ?? '—'} />
              <RzadWartosci
                etykieta={T.powiazanieKatalogowe}
                wartosc={wybranaPozycja ? etykietaZrodlaKatalogu(wybranaPozycja) : T.powiazanieBrak}
                ton={dane.catalog_ref ? 'ok' : 'warn'}
              />
            </KreatorSekcja>
          ) : (
            <KreatorSekcja tytul={T.zwarcieTytul} testid="mvd-kreator-zrodlo-reczny">
              <PolePrzelacznik
                etykieta={T.stronaTytul}
                testid="mvd-kreator-zrodlo-strona"
                wartosc={dane.short_circuit_input_side}
                opcje={[{ id: 'SN', etykieta: T.stronaSn }, { id: 'HV_110', etykieta: T.stronaHv }]}
                onZmiana={(id) => zmien('short_circuit_input_side', id as GridSourceFormData['short_circuit_input_side'])}
              />
              {!hv ? (
                <PolePrzelacznik
                  etykieta={T.trybParamTytul}
                  testid="mvd-kreator-zrodlo-trybparam"
                  wartosc={dane.short_circuit_mode}
                  opcje={[{ id: 'SHORT_CIRCUIT_POWER', etykieta: T.trybMoc }, { id: 'IMPEDANCE', etykieta: T.trybImpedancja }]}
                  onZmiana={(id) => zmien('short_circuit_mode', id as GridSourceFormData['short_circuit_mode'])}
                />
              ) : null}
              <KreatorSiatka kolumny={3}>
                {hv ? (
                  <>
                    <PoleLiczbowe etykieta={T.napiecieHv} jednostka="kV" wartosc={dane.hv_voltage_kv} onZmiana={(v) => zmien('hv_voltage_kv', v)} wymagane blad={bladDlaPola('hv_voltage_kv')} testid="mvd-kreator-zrodlo-hv-napiecie" />
                    <PoleLiczbowe etykieta={T.sk3Hv} jednostka="MVA" wartosc={dane.sk3_hv_mva} onZmiana={(v) => zmien('sk3_hv_mva', v)} pomoc={T.sk3Pomoc} wymagane blad={bladDlaPola('sk3_hv_mva')} testid="mvd-kreator-zrodlo-sk3hv" />
                    <PoleLiczbowe etykieta={T.rx} wartosc={dane.rx_ratio} onZmiana={(v) => zmien('rx_ratio', v)} krok={0.01} pomoc={T.rxPomoc} wymagane blad={bladDlaPola('rx_ratio')} testid="mvd-kreator-zrodlo-rx" />
                  </>
                ) : impedancja ? (
                  <>
                    <PoleLiczbowe etykieta={T.rOhm} jednostka="Ω" wartosc={dane.r_ohm} onZmiana={(v) => zmien('r_ohm', v)} krok={0.01} wymagane blad={bladDlaPola('r_ohm')} testid="mvd-kreator-zrodlo-rohm" />
                    <PoleLiczbowe etykieta={T.xOhm} jednostka="Ω" wartosc={dane.x_ohm} onZmiana={(v) => zmien('x_ohm', v)} krok={0.01} wymagane blad={bladDlaPola('x_ohm')} testid="mvd-kreator-zrodlo-xohm" />
                  </>
                ) : (
                  <>
                    <PoleLiczbowe etykieta={T.sk3} jednostka="MVA" wartosc={dane.sk3_mva} onZmiana={(v) => zmien('sk3_mva', v)} pomoc={T.sk3Pomoc} wymagane blad={bladDlaPola('sk3_mva')} testid="mvd-kreator-zrodlo-sk3" />
                    <PoleLiczbowe etykieta={T.rx} wartosc={dane.rx_ratio} onZmiana={(v) => zmien('rx_ratio', v)} krok={0.01} pomoc={T.rxPomoc} wymagane blad={bladDlaPola('rx_ratio')} testid="mvd-kreator-zrodlo-rx" />
                  </>
                )}
              </KreatorSiatka>
            </KreatorSekcja>
          )}

          <KreatorSekcja tytul={T.zeroTytul} testid="mvd-kreator-zrodlo-zero">
            <PolePrzelacznikBinarny
              etykieta={T.zeroToggle}
              wlaczone={dane.zero_sequence_enabled}
              onZmiana={(v) => zmien('zero_sequence_enabled', v)}
              testid="mvd-kreator-zrodlo-zero-toggle"
            />
            <KreatorSiatka kolumny={3}>
              <PoleLiczbowe etykieta={T.r0} jednostka="Ω" wartosc={dane.r0_ohm} onZmiana={(v) => zmien('r0_ohm', v)} wylaczone={!dane.zero_sequence_enabled} blad={bladDlaPola('r0_ohm')} />
              <PoleLiczbowe etykieta={T.x0} jednostka="Ω" wartosc={dane.x0_ohm} onZmiana={(v) => zmien('x0_ohm', v)} wylaczone={!dane.zero_sequence_enabled} blad={bladDlaPola('x0_ohm')} />
              <PoleLiczbowe etykieta={T.z0z1} wartosc={dane.z0_z1_ratio} onZmiana={(v) => zmien('z0_z1_ratio', v)} krok={0.1} wylaczone={!dane.zero_sequence_enabled} blad={bladDlaPola('z0_z1_ratio')} />
            </KreatorSiatka>
          </KreatorSekcja>
        </>
      ) : null}

      {krok === 'transformatory' ? (
        <KreatorSekcja tytul={T.krokTransformatory} testid="mvd-kreator-zrodlo-transformatory">
          <PoleWyboru
            etykieta={T.liczbaTrafo}
            wartosc={String(dane.transformer_count)}
            onZmiana={(v) => zmien('transformer_count', Number(v))}
            opcje={T.liczby1do4}
            blad={bladDlaPola('transformer_count')}
            testid="mvd-kreator-zrodlo-liczba-trafo"
          />
          <KreatorInfo>{T.transformatoryOpis}</KreatorInfo>
        </KreatorSekcja>
      ) : null}

      {krok === 'rozdzielnia' ? (
        <KreatorSekcja tytul={T.krokRozdzielnia} testid="mvd-kreator-zrodlo-rozdzielnia">
          <KreatorSiatka kolumny={2}>
            <PoleWyboru
              etykieta={T.liczbaSekcji}
              wartosc={String(dane.sections_count)}
              onZmiana={(v) => ustawLiczbeSekcji(Number(v))}
              opcje={T.liczby1do4}
              blad={bladDlaPola('sections_count')}
              testid="mvd-kreator-zrodlo-liczba-sekcji"
            />
            <PoleWyboru
              etykieta={T.uziemienie}
              wartosc={dane.grounding_type}
              onZmiana={(v) => zmien('grounding_type', v as GpzGroundingType)}
              opcje={T.typyUziemienia}
              pomoc={opisUziemienia(dane.grounding_type)}
              testid="mvd-kreator-zrodlo-uziemienie"
            />
          </KreatorSiatka>
          {(dane.grounding_type === 'resistor_grounded' || dane.grounding_type === 'petersen_coil') ? (
            <PoleLiczbowe
              etykieta={dane.grounding_type === 'petersen_coil' ? T.uziemienieX : T.uziemienieR}
              jednostka="Ω"
              wartosc={dane.grounding_type === 'petersen_coil' ? dane.grounding_x_ohm : dane.grounding_r_ohm}
              onZmiana={(v) => zmien(dane.grounding_type === 'petersen_coil' ? 'grounding_x_ohm' : 'grounding_r_ohm', v)}
              blad={bladDlaPola(dane.grounding_type === 'petersen_coil' ? 'grounding_x_ohm' : 'grounding_r_ohm')}
              testid="mvd-kreator-zrodlo-uziemienie-ohm"
            />
          ) : null}
          <KreatorInfo>{T.sprzegloNota}</KreatorInfo>
        </KreatorSekcja>
      ) : null}

      {krok === 'sekcje' ? (
        <KreatorSekcja tytul={T.krokSekcje} testid="mvd-kreator-zrodlo-sekcje">
          <KreatorInfo>{T.sekcjeOpis}</KreatorInfo>
          {normalizujSekcje(dane.sekcje, dane.sections_count, dane.line_fields_per_section).map((sekcja, index) => (
            <KreatorSiatka kolumny={2} key={index}>
              <PoleTekstowe
                etykieta={`${T.sekcjaNazwaPol} ${index + 1}`}
                wartosc={sekcja.nazwa}
                onZmiana={(v) => zmienSekcje(index, { nazwa: v })}
                testid={`mvd-kreator-zrodlo-sekcja-nazwa-${index}`}
              />
              <PoleLiczbowe
                etykieta={T.sekcjaLiczbaPol}
                wartosc={sekcja.liczbaPol}
                onZmiana={(v) => zmienSekcje(index, { liczbaPol: Math.max(1, Math.min(MAX_POL_NA_SEKCJE, v ?? 1)) })}
                min={1}
                krok={1}
                testid={`mvd-kreator-zrodlo-sekcja-pola-${index}`}
              />
            </KreatorSiatka>
          ))}
          <KreatorSiatka kolumny={2}>
            <PoleWyboru
              etykieta={T.aparatRodzaj}
              wartosc={dane.gpz_line_field_apparatus_kind}
              onZmiana={(v) => {
                zmien('gpz_line_field_apparatus_kind', v as GpzLineFieldApparatusKind);
                zmien('gpz_line_field_apparatus_catalog_ref', null);
              }}
              opcje={T.rodzajeAparatu}
              testid="mvd-kreator-zrodlo-aparat-rodzaj"
            />
            <PoleKatalogu
              etykieta={T.aparatSekcja}
              wartosc={dane.gpz_line_field_apparatus_catalog_ref}
              onZmiana={(v) => zmien('gpz_line_field_apparatus_catalog_ref', v)}
              opcje={opcjeAparatow}
              status={bladAparatow ? 'error' : 'ready'}
              placeholder={T.aparatPlaceholder}
              komunikatBledu={bladAparatow ?? T.aparatBlad}
              wymagane
              blad={bladDlaPola('gpz_line_field_apparatus_catalog_ref')}
              testid="mvd-kreator-zrodlo-aparat-katalog"
            />
          </KreatorSiatka>
        </KreatorSekcja>
      ) : null}

      {krok === 'normy' ? (
        <KreatorSekcja tytul={T.normyTytul} testid="mvd-kreator-zrodlo-normy">
          <PoleLiczbowe
            etykieta={T.czasCieplny}
            jednostka="s"
            wartosc={dane.thermal_time_s}
            onZmiana={(v) => zmien('thermal_time_s', v ?? 0)}
            krok={0.1}
            min={0.1}
            pomoc="Czas trwania zwarcia do sprawdzenia wytrzymałości cieplnej Ith (feeder do backendu)."
            blad={bladDlaPola('thermal_time_s')}
            testid="mvd-kreator-zrodlo-tk"
          />
          <RzadWartosci etykieta={T.norma} wartosc="IEC 60909:2016" />
          <RzadWartosci etykieta={T.czestotliwosc} wartosc="50 Hz" />
          <RzadWartosci etykieta={`${T.cMax} / ${T.cMin}`} wartosc="1,10 / 1,00" />
        </KreatorSekcja>
      ) : null}

      {krok === 'zapis' ? (
        <KreatorSekcja tytul={T.przegladTytul} testid="mvd-kreator-zrodlo-przeglad">
          <KreatorInfo>{T.przegladOpis}</KreatorInfo>
          <RzadWartosci etykieta={T.nazwa} wartosc={dane.source_name || '—'} />
          <RzadWartosci etykieta={T.napiecieSn} wartosc={`${formatujLiczbe(dane.sn_voltage_kv, 0)} kV`} />
          <RzadWartosci etykieta={T.trybZrodlaTytul} wartosc={dane.manual_mode ? T.trybReczny : T.trybKatalog} />
          <RzadWartosci etykieta={T.liczbaSekcji} wartosc={String(dane.sections_count)} />
          <RzadWartosci etykieta={T.liczbaTrafo} wartosc={String(dane.transformer_count)} />
          <RzadWartosci etykieta={T.uziemienie} wartosc={T.typyUziemienia.find((o) => o.id === dane.grounding_type)?.etykieta ?? dane.grounding_type} />
          <KreatorNastepnyKrok opis={T.nastepnyOpis} testid="mvd-kreator-zrodlo-nastepny" />
        </KreatorSekcja>
      ) : null}
    </KreatorRama>
  );
}

export default KreatorZrodloZasilania;
