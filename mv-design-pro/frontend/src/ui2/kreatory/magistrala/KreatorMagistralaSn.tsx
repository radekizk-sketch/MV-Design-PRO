/**
 * Kreator „Wyprowadź magistralę SN" (V12K-047, G-MAG) — ui2, framework kreatory/rama.
 *
 * Prowadzi ciąg SN z pola odpływowego GPZ: rodzaj + typ z katalogu, długość,
 * podgląd ΔU/prądu z backendu (R1), zapis = operacja domenowa
 * `continue_trunk_segment_sn`, po zapisie flow łańcuchuje realny KOLEJNY krok
 * (stacja / ZK SN / słup / kolejny odcinek). Superset retirowanego ContinueTrunkForm:
 * rozwiązywanie startu z selekcji, uczciwy stan zerowy, walidacja semantyczna
 * pochodzenia odcinka, katalog-first. ZERO fizyki w UI.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { fetchCableTypes, fetchLineTypes, getCatalogErrorMessage } from '../../../ui/catalog/api';
import type { CableType, LineType } from '../../../ui/catalog/types';
import {
  fetchCableVoltageDrop,
  type CableVoltageDropResponse,
} from '../../../ui/network-build/forms/cableVoltageDropApi';
import { validateCatalogFirst } from '../../../ui/network-build/forms/catalogFirstRules';
import { navigateToSld } from '../../../ui/navigation/routes';
import { buildOperationContext } from '../../../ui/network-build/operationContext';
import { useActiveOperationContext, useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { validateTrunkSegmentOrigin } from '../../../ui/network-build/semanticValidator';
import { resolveTrunkOriginKind } from '../../../ui/network-build/trunkOriginResolver';
import {
  buildNextContext,
  createdEndpointBusRef,
  createdSegmentRef,
  nextOperationForStep,
  scheduleNextOperationForm,
  type TrunkNextStep,
} from '../../../ui/network-build/trunkContinuation';
import { useSelectionStore } from '../../../ui/selection';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import type { ElementType } from '../../../ui/types';
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
  type KrokKreatora,
  type WierszGotowosci,
} from '../rama';
import {
  branchKindZRodzaju,
  DANE_DOMYSLNE,
  fmtA,
  fmtDlugosc,
  fmtPct,
  fmtV,
  kontekstKontynuacji,
  lacznaDlugosc,
  lacznySpadekPct,
  LIMIT_SPADKU_PCT,
  maStartCiagu,
  nextStepDozwolony,
  ocenaDoboru,
  parametryZKatalogu,
  podsumujOdcinek,
  walidujFormularz,
  zbudujPayload,
  zbudujZapytaniePodgladu,
  type BladPola,
  type KontekstMagistrali,
  type MagistralaFormData,
  type OdcinekBudowy,
  type RodzajOdcinka,
  type StanOceny,
} from './magistralaModel';
import { MAGISTRALA_STRINGS as T } from './strings';
import { WykresSpadku } from './WykresSpadku';

const KROKI: readonly KrokKreatora[] = [
  { id: 'typ', tytul: T.krokTyp },
  { id: 'parametry', tytul: T.krokParametry },
  { id: 'zapis', tytul: T.krokZapis },
];

function canUseElementRefAsFieldRef(elementType: string): boolean {
  return ['BaySN', 'FieldSN', 'LineBaySN', 'SNBay', 'Bay'].includes(elementType);
}

function canResolveElementAsTrunkStart(
  elementType: string,
): elementType is Extract<ElementType, 'Station' | 'LineBranch'> {
  return elementType === 'Station' || elementType === 'LineBranch';
}

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function daneZKontekstu(context: Record<string, unknown> | null): Partial<MagistralaFormData> {
  if (!context) return {};
  const napiecie = Number(context.voltage_kv ?? context.sn_voltage_kv);
  const dlugosc = Number(context.length_m);
  const out: Partial<MagistralaFormData> = {};
  if (Number.isFinite(napiecie) && napiecie > 0) out.napiecie_kv = napiecie;
  if (Number.isFinite(dlugosc) && dlugosc > 0) out.dlugosc_m = dlugosc;
  return out;
}

export function KreatorMagistralaSn() {
  const rawContext = useActiveOperationContext() as Record<string, unknown> | null;
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const logicalViews = useSnapshotStore((s) => s.logicalViews);
  const selectedElement = useSelectionStore((s) => s.selectedElements[0] ?? null);
  const selectElement = useSelectionStore((s) => s.selectElement);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);

  // Rozwiązanie startu ciągu: kontekst jawny (SLD/hub) albo z selekcji (stacja/odcinek).
  const context = useMemo<Record<string, unknown> | null>(() => {
    const rawElementRef = trimmed(rawContext?.element_ref);
    const rawElementType = trimmed(rawContext?.element_type ?? rawContext?.elementType);
    const hasExplicitStart = Boolean(
      trimmed(rawContext?.terminalId)
      || trimmed(rawContext?.terminal_id)
      || trimmed(rawContext?.from_terminal_id)
      || trimmed(rawContext?.field_ref),
    );
    if (hasExplicitStart) return rawContext;

    const fallbackElementRef = selectedElement?.id ?? rawElementRef;
    const fallbackElementType = selectedElement?.type ?? rawElementType;
    if (!fallbackElementRef || !canResolveElementAsTrunkStart(fallbackElementType)) {
      return rawContext;
    }
    const selectionContext = buildOperationContext({
      canonicalOp: 'continue_trunk_segment_sn',
      elementId: fallbackElementRef,
      elementType: fallbackElementType,
      snapshot,
      logicalViews,
    });
    const hasResolvedStart = Boolean(
      trimmed(selectionContext.terminalId)
      || trimmed(selectionContext.terminal_id)
      || trimmed(selectionContext.from_terminal_id),
    );
    return hasResolvedStart ? { ...(rawContext ?? {}), ...selectionContext } : rawContext;
  }, [logicalViews, rawContext, selectedElement, snapshot]);

  const trunkId = trimmed(context?.trunkId ?? context?.trunk_id);
  const terminalId = trimmed(
    context?.terminalId ?? context?.terminal_id ?? context?.from_terminal_id,
  );
  const terminalVoltageLabel = trimmed(context?.terminal_voltage_label);
  const elementRef = trimmed(context?.element_ref);
  const elementType = trimmed(context?.element_type ?? context?.elementType);
  const fieldRef =
    trimmed(context?.field_ref)
    || (elementRef && canUseElementRefAsFieldRef(elementType) ? elementRef : '');

  const kontekstBazowy: KontekstMagistrali = useMemo(
    () => ({
      trunk_id: trunkId || undefined,
      from_terminal_id: terminalId || undefined,
      field_ref: fieldRef || undefined,
      terminal_voltage_label: terminalVoltageLabel || undefined,
    }),
    [fieldRef, terminalId, terminalVoltageLabel, trunkId],
  );

  // Builder realnej sieci (M2): po dodaniu odcinka trzymamy koniec ciągu jako start
  // kolejnego (bez zamykania okna) + rosnącą listę odcinków magistrali.
  const [zbudowane, setZbudowane] = useState<OdcinekBudowy[]>([]);
  const [nadpisanyKontekst, setNadpisanyKontekst] = useState<KontekstMagistrali | null>(null);
  const kontekst = nadpisanyKontekst ?? kontekstBazowy;

  const hasStart = maStartCiagu(kontekst);
  const brakStartuReason = !hasStart
    ? elementType === 'Station'
      ? T.brakStartuStacja
      : T.brakStartuOgolny
    : null;

  const [dane, setDane] = useState<MagistralaFormData>(() => ({
    ...DANE_DOMYSLNE,
    ...daneZKontekstu(rawContext),
  }));
  const [bledy, setBledy] = useState<BladPola[]>([]);
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);
  const [krok, setKrok] = useState<string>('typ');

  const [kable, setKable] = useState<CableType[]>([]);
  const [linie, setLinie] = useState<LineType[]>([]);
  const [bladKatalogu, setBladKatalogu] = useState<string | null>(null);

  const [podglad, setPodglad] = useState<CableVoltageDropResponse | null>(null);
  const [bladPodgladu, setBladPodgladu] = useState<string | null>(null);
  const previewSeq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setBladKatalogu(null);
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
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const params = useMemo(
    () => parametryZKatalogu(dane.rodzaj, dane.catalog_ref, kable, linie),
    [dane.rodzaj, dane.catalog_ref, kable, linie],
  );

  const typLabel = useMemo(() => {
    const items = dane.rodzaj === 'KABEL' ? kable : linie;
    return items.find((it) => it.id === dane.catalog_ref)?.name ?? '';
  }, [dane.rodzaj, dane.catalog_ref, kable, linie]);

  // Podgląd ΔU (R1) — liczy backend; debounce przez sekwencję.
  useEffect(() => {
    const zapytanie = zbudujZapytaniePodgladu(dane, params);
    if (!zapytanie) {
      setPodglad(null);
      setBladPodgladu(null);
      return;
    }
    const seq = ++previewSeq.current;
    const t = setTimeout(() => {
      fetchCableVoltageDrop(zapytanie)
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
    }, 250);
    return () => clearTimeout(t);
  }, [dane, params]);

  const opcjeTypow = useMemo(() => {
    const items = dane.rodzaj === 'KABEL' ? kable : linie;
    return items.map((it) => ({
      id: it.id,
      etykieta:
        dane.rodzaj === 'KABEL'
          ? `${it.name} · ${(it as CableType).cross_section_mm2 ?? '—'} mm² · ${it.rated_current_a} A`
          : `${it.name} · ${it.rated_current_a} A`,
    }));
  }, [dane.rodzaj, kable, linie]);

  const opcjeNext = useMemo(
    () => T.nextOpcje.filter((o) => nextStepDozwolony(o.id as TrunkNextStep, dane.rodzaj)),
    [dane.rodzaj],
  );

  const zmien = useCallback(<K extends keyof MagistralaFormData>(pole: K, wartosc: MagistralaFormData[K]) => {
    setDane((p) => ({ ...p, [pole]: wartosc }));
  }, []);

  const bladDlaPola = (pole: string): string | undefined => bledy.find((b) => b.field === pole)?.message;

  const iznamPrzekroczony = Boolean(
    params && dane.prad_a && dane.prad_a > params.rated_current_a,
  );

  // Asystent doboru przekroju (M3): interpretuje ΔU (backend) i Iz (katalog) vs kryteria.
  const ocena = ocenaDoboru(params, podglad?.delta_u_pct ?? null, dane.prad_a ?? null);

  const onZapisz = useCallback(async () => {
    if (!hasStart) {
      setBladGlobalny(brakStartuReason);
      return;
    }
    const walid = walidujFormularz(dane);
    setBledy(walid);
    if (walid.length > 0) return;
    if (!activeCaseId) {
      setBladGlobalny(T.brakZakresu);
      return;
    }
    const payload = zbudujPayload(dane, kontekst);
    const catalogError = validateCatalogFirst('continue_trunk_segment_sn', payload);
    if (catalogError) {
      setBladGlobalny(catalogError);
      return;
    }
    // Walidacja semantyczna pochodzenia odcinka (kabel/linia vs pole źródłowe).
    const originKind = resolveTrunkOriginKind(snapshot, {
      ...(context ?? {}),
      field_ref: fieldRef,
      terminal_id: terminalId,
    });
    if (originKind) {
      const semantic = validateTrunkSegmentOrigin({
        branchKind: branchKindZRodzaju(dane.rodzaj),
        originKind,
      });
      if (!semantic.ok) {
        setBladGlobalny(`${semantic.messagePl} ${semantic.suggestedFixPl}`);
        return;
      }
    }
    setBladGlobalny(null);
    try {
      const previousSnapshot = snapshot;
      const response = await executeDomainOperation(activeCaseId, 'continue_trunk_segment_sn', payload);
      if (!response) {
        setBladGlobalny(useSnapshotStore.getState().error ?? T.walidacjaStopka);
        return;
      }
      if (response.error) {
        setBladGlobalny(response.error);
        return;
      }
      // Łańcuchowanie realnej kolejnej operacji (następny krok flow).
      const nextSegmentRef = createdSegmentRef(response, previousSnapshot, terminalId || fieldRef);
      const nextEndpointBusRef = createdEndpointBusRef(response, nextSegmentRef);
      const nextTerminal = response.logical_views?.terminals?.find(
        (terminal) => terminal.element_id === nextEndpointBusRef,
      );
      const nextTrunkId = nextTerminal?.trunk_id ?? trunkId;
      const nextOperation = nextOperationForStep(dane.next_step);

      // Odcinek dodany realnie do modelu → dopisz do listy magistrali w budowie (M2),
      // z zapamiętanym spadkiem ΔU odcinka (skumulowana ocena ciągu, M3).
      setZbudowane((prev) => [...prev, podsumujOdcinek(dane, params, typLabel, podglad?.delta_u_pct ?? null)]);

      if (!nextSegmentRef || !nextEndpointBusRef) {
        // Odcinek utworzony; brak wskazania końca → wróć na schemat, nie fabrykuj kroku.
        closeForm();
        navigateToSld();
        return;
      }

      // „Kolejny odcinek" → builder ZOSTAJE OTWARTY: koniec ciągu staje się startem
      // następnego odcinka; formularz resetuje długość/nazwę (typ zostaje), krok = parametry.
      if (dane.next_step === 'continue') {
        setNadpisanyKontekst(
          kontekstKontynuacji(nextEndpointBusRef, nextTrunkId, terminalVoltageLabel),
        );
        setDane((p) => ({
          ...DANE_DOMYSLNE,
          rodzaj: p.rodzaj,
          catalog_ref: p.catalog_ref,
          napiecie_kv: p.napiecie_kv,
          next_step: 'continue',
        }));
        setBledy([]);
        setKrok('parametry');
        selectElement({ id: nextSegmentRef, type: 'LineBranch', name: 'Nowy odcinek SN' });
        return;
      }

      // Element na końcu (stacja/ZK/słup) → zamknij i otwórz realną operację na końcu ciągu.
      const nextContext = buildNextContext({
        nextOperation,
        nextSegmentRef,
        nextEndpointBusRef,
        nextTrunkId,
        nextPortId: nextTerminal?.port_id ?? 'trunk_end',
        terminalVoltageLabel,
      });
      selectElement({ id: nextSegmentRef, type: 'LineBranch', name: 'Nowy odcinek SN' });
      closeForm();
      scheduleNextOperationForm(openOperationForm, nextOperation, nextContext);
    } catch (e) {
      setBladGlobalny(e instanceof Error ? e.message : T.walidacjaStopka);
    }
  }, [
    activeCaseId,
    brakStartuReason,
    closeForm,
    context,
    dane,
    executeDomainOperation,
    fieldRef,
    hasStart,
    kontekst,
    openOperationForm,
    params,
    podglad,
    selectElement,
    snapshot,
    terminalId,
    terminalVoltageLabel,
    trunkId,
    typLabel,
  ]);

  const onZakonczBudowe = useCallback(() => {
    closeForm();
    navigateToSld();
  }, [closeForm]);

  const wierszeGotowosci: WierszGotowosci[] = [
    {
      etykieta: T.wierszTyp,
      stan: dane.catalog_ref ? 'kompletne' : 'brak',
      wartosc: dane.catalog_ref ? 'Kompletne' : 'Do konfiguracji',
    },
    {
      etykieta: T.wierszDlugosc,
      stan: dane.dlugosc_m && dane.dlugosc_m > 0 ? 'kompletne' : 'brak',
      wartosc: dane.dlugosc_m ? `${dane.dlugosc_m} m` : 'Do konfiguracji',
    },
    {
      etykieta: T.wierszDeltaU,
      stan: podglad ? 'kompletne' : 'ostrzezenie',
      wartosc: podglad ? fmtPct(podglad.delta_u_pct) : 'Podgląd',
    },
    {
      etykieta: T.wierszObciazenie,
      stan: iznamPrzekroczony ? 'ostrzezenie' : 'kompletne',
      wartosc: iznamPrzekroczony ? 'Przekroczona' : 'OK',
    },
  ];

  const skumulowanySpadek = lacznySpadekPct(zbudowane);
  const builderPanel = (
    <KreatorPodsumowanie
      tytul={T.builderTytul}
      komunikat={skumulowanySpadek > LIMIT_SPADKU_PCT ? T.builderSkumulowanyOstrzezenie(LIMIT_SPADKU_PCT) : null}
      komunikatTon="warn"
      testid="mvd-kreator-magistrala-builder"
    >
      {zbudowane.length === 0 ? (
        <p className="mvd-podsum-komunikat">{T.builderPusto}</p>
      ) : (
        <>
          {zbudowane.map((o, i) => (
            <RzadWartosci
              key={`${i}-${o.typLabel}-${o.dlugosc_m}`}
              etykieta={`${i + 1}. ${o.rodzaj === 'KABEL' ? 'Kabel' : 'Linia'} ${o.typLabel}`.trim()}
              wartosc={`${o.cross_section_mm2 ?? '—'} mm² · ${fmtDlugosc(o.dlugosc_m)}`}
            />
          ))}
          <RzadWartosci etykieta={T.builderLaczna} wartosc={fmtDlugosc(lacznaDlugosc(zbudowane))} />
          <RzadWartosci etykieta={T.builderSkumulowany} wartosc={fmtPct(skumulowanySpadek)} />
        </>
      )}
    </KreatorPodsumowanie>
  );

  const stanLabel = (s: StanOceny): string =>
    s === 'ok' ? T.ocenaOK : s === 'ostrzezenie' ? T.ocenaOstrzezenie : T.ocenaBrak;
  const ocenaKomunikat =
    ocena.obciazalnosc === 'ostrzezenie' && ocena.obciazenieA != null && ocena.izA != null
      ? T.ocenaObciazalnoscZle(ocena.obciazenieA, ocena.izA)
      : ocena.spadek === 'ostrzezenie' && ocena.spadekPct != null
        ? T.ocenaSpadekZle(ocena.spadekPct, ocena.limitPct)
        : null;
  const ocenaPanel = (
    <KreatorPodsumowanie
      tytul={T.ocenaTytul}
      komunikat={ocenaKomunikat}
      komunikatTon="warn"
      testid="mvd-kreator-magistrala-ocena"
    >
      <RzadWartosci etykieta={T.ocenaObciazalnosc} wartosc={stanLabel(ocena.obciazalnosc)} />
      <RzadWartosci etykieta={T.ocenaSpadek} wartosc={stanLabel(ocena.spadek)} />
      <p className="mvd-podsum-komunikat">{T.ocenaIthPomoc}</p>
    </KreatorPodsumowanie>
  );

  const aside = (
    <>
      {builderPanel}
      <KreatorPodsumowanie
        tytul={T.podgladTytul}
        komunikat={iznamPrzekroczony ? T.podgladOstrzezenieIznam : bladPodgladu}
        komunikatTon="warn"
        testid="mvd-kreator-magistrala-podsumowanie"
      >
        {podglad ? (
          <>
            <RzadWartosci etykieta={T.podgladDeltaU} wartosc={fmtV(podglad.delta_u_v)} />
            <RzadWartosci etykieta={T.podgladDeltaUpct} wartosc={fmtPct(podglad.delta_u_pct)} />
            <RzadWartosci etykieta={T.podgladRtotal} wartosc={`${podglad.r_total_ohm.toFixed(3)} Ω`} />
            <RzadWartosci etykieta={T.podgladXtotal} wartosc={`${podglad.x_total_ohm.toFixed(3)} Ω`} />
            <RzadWartosci etykieta={T.podgladZrodlo} wartosc={T.podgladZrodloWartosc} />
          </>
        ) : (
          <p className="mvd-podsum-komunikat">{T.podgladBrak}</p>
        )}
      </KreatorPodsumowanie>
      {ocenaPanel}
      <KreatorGotowosc tytul={T.kontrolaTytul} wiersze={wierszeGotowosci} testid="mvd-kreator-magistrala-gotowosc" />
      <KreatorNastepnyKrok opis={zbudowane.length > 0 ? T.builderDodajKolejny : T.nastepnyOpis} />
    </>
  );

  const jednOhmKm = (v: number | null): string => (typeof v === 'number' ? `${v} Ω/km` : '—');
  const jednTemp = (v: number | null): string => (typeof v === 'number' ? `${v} °C` : '—');
  const jednPrzekroj = (v: number | null): string => (typeof v === 'number' ? `${v} mm²` : '—');
  const tekst = (v: string | null): string => v ?? '—';
  const paramReadout = params ? (
    <>
      <KreatorInfo>{T.paramSekcjaNormowa}</KreatorInfo>
      <KreatorSiatka kolumny={3}>
        <RzadWartosci etykieta={T.paramPrzekroj} wartosc={jednPrzekroj(params.cross_section_mm2)} />
        <RzadWartosci etykieta={T.paramR} wartosc={jednOhmKm(params.r_ohm_per_km)} />
        <RzadWartosci etykieta={T.paramX} wartosc={jednOhmKm(params.x_ohm_per_km)} />
        <RzadWartosci etykieta={T.paramIznam} wartosc={fmtA(params.rated_current_a)} />
        <RzadWartosci etykieta={T.paramMaterial} wartosc={tekst(params.conductor_material)} />
        <RzadWartosci etykieta={T.paramTempMax} wartosc={jednTemp(params.max_temperature_c)} />
        {dane.rodzaj === 'KABEL' ? (
          <>
            <RzadWartosci
              etykieta={T.paramC}
              wartosc={typeof params.c_nf_per_km === 'number' ? `${params.c_nf_per_km} nF/km` : '—'}
            />
            <RzadWartosci etykieta={T.paramIzolacja} wartosc={tekst(params.insulation_type)} />
            <RzadWartosci etykieta={T.paramIthPowrot} wartosc={fmtA(params.return_conductor_ith_1s_a)} />
          </>
        ) : (
          <RzadWartosci
            etykieta={T.paramB}
            wartosc={typeof params.b_us_per_km === 'number' ? `${params.b_us_per_km} µS/km` : '—'}
          />
        )}
        <RzadWartosci etykieta={T.paramNorma} wartosc={tekst(params.standard)} />
      </KreatorSiatka>
    </>
  ) : null;

  const krokIndex = KROKI.findIndex((k) => k.id === krok);
  const zapisZablokowany = !hasStart || !activeCaseId;

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
      walidacja={bledy.length > 0 ? T.walidacjaStopka : !hasStart ? brakStartuReason : null}
      akcjaGlowna={{
        etykieta: zbudowane.length > 0 ? T.builderDodaj : T.zapisz,
        onClick: onZapisz,
        zablokowana: zapisZablokowany,
        testid: 'mvd-kreator-magistrala-zapisz',
      }}
      akcjaAnuluj={
        zbudowane.length > 0
          ? { etykieta: T.builderZakoncz, onClick: onZakonczBudowe, testid: 'mvd-kreator-magistrala-zakoncz' }
          : { etykieta: T.anuluj, onClick: () => closeForm(), testid: 'mvd-kreator-magistrala-anuluj' }
      }
      krokWstecz={
        krokIndex > 0
          ? { etykieta: T.wstecz, onClick: () => setKrok(KROKI[krokIndex - 1].id), testid: 'mvd-kreator-magistrala-wstecz' }
          : undefined
      }
      krokDalej={
        krokIndex < KROKI.length - 1
          ? { etykieta: T.dalej, onClick: () => setKrok(KROKI[krokIndex + 1].id), testid: 'mvd-kreator-magistrala-dalej' }
          : undefined
      }
      licznikKrokow={T.licznik(krokIndex + 1, KROKI.length)}
      testid="mvd-kreator-magistrala"
    >
      {!hasStart ? (
        <KreatorSekcja tytul={T.brakStartuTytul} testid="mvd-kreator-magistrala-brak-startu">
          <KreatorInfo>{brakStartuReason}</KreatorInfo>
        </KreatorSekcja>
      ) : null}

      {krok === 'typ' ? (
        <KreatorSekcja tytul={T.krokTyp} testid="mvd-kreator-magistrala-typ">
          <KreatorInfo>{T.typPomoc}</KreatorInfo>
          <KreatorSiatka kolumny={2}>
            <PoleWyboru
              etykieta={T.rodzaj}
              wartosc={dane.rodzaj}
              onZmiana={(v) => setDane((p) => ({ ...p, rodzaj: v as RodzajOdcinka, catalog_ref: null }))}
              opcje={T.rodzaje}
              testid="mvd-kreator-magistrala-rodzaj"
            />
            <PoleTekstowe
              etykieta={T.nazwa}
              wartosc={dane.nazwa}
              onZmiana={(v) => zmien('nazwa', v)}
              placeholder={T.nazwaPlaceholder}
              testid="mvd-kreator-magistrala-nazwa"
            />
          </KreatorSiatka>
          <PoleKatalogu
            etykieta={T.typKatalog}
            wartosc={dane.catalog_ref}
            onZmiana={(v) => zmien('catalog_ref', v)}
            opcje={opcjeTypow}
            status={bladKatalogu ? 'error' : 'ready'}
            placeholder={T.typKatalogPlaceholder}
            komunikatBledu={bladKatalogu ?? (dane.rodzaj === 'KABEL' ? T.typKabelBlad : T.typLiniaBlad)}
            testid="mvd-kreator-magistrala-katalog"
          />
          {bladDlaPola('catalog_ref') ? <p className="mvd-pole-blad">{bladDlaPola('catalog_ref')}</p> : null}
          {paramReadout}
        </KreatorSekcja>
      ) : null}

      {krok === 'parametry' ? (
        <KreatorSekcja tytul={T.krokParametry} testid="mvd-kreator-magistrala-parametry">
          <KreatorSiatka kolumny={2}>
            <PoleLiczbowe
              etykieta={T.dlugosc}
              jednostka="m"
              wartosc={dane.dlugosc_m}
              onZmiana={(v) => zmien('dlugosc_m', v)}
              wymagane
              blad={bladDlaPola('dlugosc_m')}
              testid="mvd-kreator-magistrala-dlugosc"
            />
            <PoleLiczbowe
              etykieta={T.napiecie}
              jednostka="kV"
              wartosc={dane.napiecie_kv}
              onZmiana={(v) => zmien('napiecie_kv', v ?? 0)}
              testid="mvd-kreator-magistrala-napiecie"
            />
            <PoleLiczbowe
              etykieta={T.prad}
              jednostka="A"
              wartosc={dane.prad_a}
              onZmiana={(v) => zmien('prad_a', v)}
              pomoc={T.pradPomoc}
              testid="mvd-kreator-magistrala-prad"
            />
            <PoleLiczbowe
              etykieta={T.cosPhi}
              wartosc={dane.cos_phi}
              onZmiana={(v) => zmien('cos_phi', v ?? 0)}
              krok={0.01}
              blad={bladDlaPola('cos_phi')}
              testid="mvd-kreator-magistrala-cosphi"
            />
          </KreatorSiatka>
          {paramReadout}
          <PanelTeorii
            tytul={T.teoriaTytul}
            opis={T.teoriaOpis}
            wymog={T.teoriaWymog}
            podstawa={T.teoriaPodstawa}
            testid="mvd-kreator-magistrala-teoria"
          >
            <p className="mvd-teoria-opis">{T.teoriaOpisKabelLinia}</p>
            <figure className="mvd-wykres-fig">
              <WykresSpadku cosPhi={dane.cos_phi} />
              <figcaption className="mvd-wykres-cap">{T.teoriaJakCzytac}</figcaption>
            </figure>
          </PanelTeorii>
        </KreatorSekcja>
      ) : null}

      {krok === 'zapis' ? (
        <KreatorSekcja tytul={T.krokZapis} testid="mvd-kreator-magistrala-zapis">
          <KreatorInfo>{T.nastepnyOpis}</KreatorInfo>
          <PoleWyboru
            etykieta={T.krokNastepnyTytul}
            wartosc={dane.next_step}
            onZmiana={(v) => zmien('next_step', v as TrunkNextStep)}
            opcje={opcjeNext}
            pomoc={T.krokNastepnyPomoc}
            blad={bladDlaPola('next_step')}
            testid="mvd-kreator-magistrala-next"
          />
          {dane.rodzaj === 'KABEL' ? (
            <p className="mvd-pole-pomoc" data-testid="mvd-kreator-magistrala-next-blokada">
              {T.nextBranchPoleBlokada}
            </p>
          ) : null}
          <KreatorSiatka kolumny={2}>
            <RzadWartosci etykieta={T.rodzaj} wartosc={dane.rodzaj === 'KABEL' ? 'Kabel SN' : 'Linia SN'} />
            <RzadWartosci etykieta={T.wierszDlugosc} wartosc={dane.dlugosc_m ? `${dane.dlugosc_m} m` : '—'} />
            <RzadWartosci etykieta={T.podgladDeltaU} wartosc={fmtV(podglad?.delta_u_v)} />
            <RzadWartosci etykieta={T.podgladDeltaUpct} wartosc={fmtPct(podglad?.delta_u_pct)} />
          </KreatorSiatka>
        </KreatorSekcja>
      ) : null}
    </KreatorRama>
  );
}
