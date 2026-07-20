/**
 * Kreator „Dodaj źródło OZE/DER" (add_converter_source) — ui2, kreatory/rama, opcja MAX.
 *
 * Katalog-first (falownik PV/BESS/FW); tryb regulacji (Q(U)/cosφ) realnie zasila kanoniczny
 * rozpływ mocy falownika (V12K-052). Zapis = operacja domenowa `add_converter_source`.
 * ZERO fizyki w UI. Zastępuje legacy `AddConverterSourceForm` (kontrakt payloadu 1:1).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { fetchConverterTypes, fetchLvApparatusTypes, getCatalogErrorMessage } from '../../../ui/catalog/api';
import type { ConverterType, LVApparatusType } from '../../../ui/catalog/types';
import {
  resolveBusNnRef,
  resolveStationRef,
  stationLabel,
} from '../../../ui/network-build/forms/enmResolvers';
import { navigateToSld } from '../../../ui/navigation/routes';
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
  PoleTekstowe,
  PoleWyboru,
  RzadWartosci,
  type KrokKreatora,
  type WierszGotowosci,
} from '../rama';
import {
  BESS_OPCJE,
  DANE_DOMYSLNE,
  REGULACJA_OPCJE,
  SUGEROWANE,
  TECHNOLOGIA_OPCJE,
  TECHNOLOGIE,
  WARIANT_OPCJE,
  bessLabel,
  etykietaKonwertera,
  maKontekst,
  regulacjaLabel,
  technologiaLabel,
  transformatoryBlokowe,
  trybQWymagaWartosci,
  walidujFormularz,
  wariantLabel,
  zbudujPayload,
  type BladPolaOze,
  type KontekstOze,
  type OzeFormData,
  type TechnologiaOze,
  type TransformatorBlokowy,
  type TrybBess,
  type TrybRegulacji,
  type WariantPrzylaczenia,
} from './zrodloOzeModel';
import { OZE_STRINGS as T } from './strings';
import { CharakterystykaNcRfg } from './WykresyNcRfg';

const KROKI: readonly KrokKreatora[] = [
  { id: 'tech', tytul: T.krokTechnologia },
  { id: 'katalog', tytul: T.krokKatalog },
  { id: 'regulacja', tytul: T.krokRegulacja },
  { id: 'zapis', tytul: T.krokZapis },
];

const OPCJE_TECH = TECHNOLOGIA_OPCJE.map((o) => ({ id: o.value, etykieta: o.label }));
const OPCJE_WARIANT = WARIANT_OPCJE.map((o) => ({ id: o.value, etykieta: o.label }));
const OPCJE_REGULACJA = REGULACJA_OPCJE.map((o) => ({ id: o.value, etykieta: o.label }));
const OPCJE_BESS = BESS_OPCJE.map((o) => ({ id: o.value, etykieta: o.label }));
const OPCJE_UMIEJSCOWIENIE = [
  { id: 'NEW_FIELD', etykieta: T.umiejscowienieNowe },
  { id: 'EXISTING_FIELD', etykieta: T.umiejscowienieIstniejace },
];

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function KreatorZrodlaOze() {
  const context = useActiveOperationContext() as Record<string, unknown> | null;
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);

  const kontekst = useMemo<KontekstOze>(() => {
    const ctx = context ?? undefined;
    const stationRef = resolveStationRef(ctx, snapshot) ?? undefined;
    const busRef = resolveBusNnRef(ctx, snapshot) ?? undefined;
    return {
      station_ref: stationRef,
      station_label: stationRef ? stationLabel(snapshot, stationRef) : undefined,
      bus_nn_ref: busRef,
      existing_field_ref: trimmed(context?.existing_field_ref) || undefined,
    };
  }, [context, snapshot]);
  const hasKontekst = maKontekst(kontekst);

  // Transformatory blokowe stacji (kandydaci do wariantu block_transformer).
  const transformatory = useMemo<TransformatorBlokowy[]>(() => {
    if (!snapshot || !kontekst.station_ref) return [];
    const station = snapshot.substations?.find(
      (s) => s.ref_id === kontekst.station_ref || s.id === kontekst.station_ref,
    );
    if (!station) return [];
    const refs = new Set(station.transformer_refs ?? []);
    const list = (snapshot.transformers ?? [])
      .filter((t) => refs.has(t.ref_id) && Boolean(t.lv_bus_ref))
      .map((t) => ({
        ref_id: t.ref_id,
        name: t.name,
        lv_bus_ref: t.lv_bus_ref as string,
        sn_mva: t.sn_mva,
        uhv_kv: t.uhv_kv ?? null,
        ulv_kv: t.ulv_kv ?? null,
      }));
    return transformatoryBlokowe(list);
  }, [snapshot, kontekst.station_ref]);

  const [dane, setDane] = useState<OzeFormData>(() => ({ ...DANE_DOMYSLNE }));
  const [bledy, setBledy] = useState<BladPolaOze[]>([]);
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);
  const [krok, setKrok] = useState<string>('tech');

  const [konwertery, setKonwertery] = useState<ConverterType[]>([]);
  const [aparaty, setAparaty] = useState<LVApparatusType[]>([]);
  const [bladKatalogu, setBladKatalogu] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBladKatalogu(null);
    Promise.all([fetchConverterTypes(), fetchLvApparatusTypes()])
      .then(([conv, apar]) => {
        if (cancelled) return;
        setKonwertery(Array.isArray(conv) ? conv : []);
        setAparaty(Array.isArray(apar) ? apar : []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setKonwertery([]);
        setAparaty([]);
        setBladKatalogu(getCatalogErrorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tech = TECHNOLOGIE[dane.source_technology];
  const konwerteryTech = useMemo(
    () => konwertery.filter((c) => c.kind === tech.catalogKind),
    [konwertery, tech.catalogKind],
  );
  const wybranyKonwerter = useMemo(
    () => (dane.converter_catalog_ref ? konwerteryTech.find((c) => c.id === dane.converter_catalog_ref) ?? null : null),
    [dane.converter_catalog_ref, konwerteryTech],
  );
  const wybranyTransformator = useMemo(
    () => transformatory.find((t) => t.ref_id === dane.blocking_transformer_ref) ?? null,
    [transformatory, dane.blocking_transformer_ref],
  );

  const opcjeKonwertery = useMemo(
    () => konwerteryTech.map((c) => ({ id: c.id, etykieta: etykietaKonwertera(c) })),
    [konwerteryTech],
  );
  const opcjeAparaty = useMemo(
    () => aparaty.map((a) => ({ id: a.id, etykieta: `${a.name} · Un ${a.u_n_kv} kV · In ${a.i_n_a} A` })),
    [aparaty],
  );
  const opcjeTransformatory = useMemo(
    () =>
      transformatory.map((t) => ({
        id: t.ref_id,
        etykieta: `${t.name} · ${t.sn_mva.toFixed(3)} MVA`,
      })),
    [transformatory],
  );

  const zmien = useCallback(<K extends keyof OzeFormData>(pole: K, wartosc: OzeFormData[K]) => {
    setDane((p) => ({ ...p, [pole]: wartosc }));
  }, []);

  const zmienTechnologie = useCallback((v: TechnologiaOze) => {
    // Zmiana technologii → inny katalog; wyczyść wybór falownika.
    setDane((p) => ({ ...p, source_technology: v, converter_catalog_ref: null }));
  }, []);

  const bladDlaPola = (pole: string): string | undefined => bledy.find((b) => b.field === pole)?.message;

  const onZapisz = useCallback(async () => {
    if (!hasKontekst) {
      setBladGlobalny(T.brakStacjiOpis);
      return;
    }
    const walid = walidujFormularz(dane, kontekst);
    setBledy(walid);
    if (walid.length > 0) return;
    if (!wybranyKonwerter) {
      setBledy([{ field: 'converter_catalog_ref', message: T.katalogPlaceholder }]);
      return;
    }
    if (!activeCaseId) {
      setBladGlobalny(T.brakZakresu);
      return;
    }
    setBladGlobalny(null);
    try {
      const payload = zbudujPayload(dane, kontekst, wybranyKonwerter, wybranyTransformator);
      const response = await executeDomainOperation(activeCaseId, 'add_converter_source', payload);
      if (!response) {
        setBladGlobalny(useSnapshotStore.getState().error ?? T.walidacjaStopka);
        return;
      }
      if (response.error) {
        setBladGlobalny(response.error);
        return;
      }
      closeForm();
      navigateToSld();
    } catch (e) {
      setBladGlobalny(e instanceof Error ? e.message : T.walidacjaStopka);
    }
  }, [activeCaseId, closeForm, dane, executeDomainOperation, hasKontekst, kontekst, wybranyKonwerter, wybranyTransformator]);

  const isBlock = dane.connection_variant === 'block_transformer';
  const przylaczenieWartosc = isBlock
    ? wybranyTransformator?.name ?? 'Transformator blokowy'
    : kontekst.bus_nn_ref
    ? 'Szyna nN'
    : 'Brak';

  const wierszeGotowosci: WierszGotowosci[] = [
    {
      etykieta: T.wierszStacja,
      stan: hasKontekst ? 'kompletne' : 'brak',
      wartosc: kontekst.station_label || (hasKontekst ? 'Wskazana' : 'Brak'),
    },
    { etykieta: T.wierszTechnologia, stan: 'kompletne', wartosc: technologiaLabel(dane.source_technology) },
    {
      etykieta: T.wierszPrzylaczenie,
      stan: isBlock ? (wybranyTransformator ? 'kompletne' : 'brak') : kontekst.bus_nn_ref ? 'kompletne' : 'brak',
      wartosc: przylaczenieWartosc,
    },
    {
      etykieta: T.wierszFalownik,
      stan: dane.converter_catalog_ref ? 'kompletne' : 'brak',
      wartosc: dane.converter_catalog_ref ? 'Kompletne' : 'Do konfiguracji',
    },
    { etykieta: T.wierszRegulacja, stan: 'kompletne', wartosc: regulacjaLabel(dane.control_mode) },
  ];

  const aside = (
    <>
      <KreatorGotowosc tytul={T.kontrolaTytul} wiersze={wierszeGotowosci} testid="mvd-kreator-oze-gotowosc" />
      <KreatorNastepnyKrok eyebrow={T.downstreamTytul} opis={T.downstreamOpis} />
    </>
  );

  const paramReadout = wybranyKonwerter ? (
    <KreatorSiatka kolumny={3}>
      <RzadWartosci etykieta={T.paramNapiecie} wartosc={`${wybranyKonwerter.un_kv} kV`} />
      <RzadWartosci etykieta={T.paramMoc} wartosc={`${wybranyKonwerter.sn_mva.toFixed(3)} MVA`} />
      <RzadWartosci
        etykieta={T.paramPmax}
        wartosc={`${(wybranyKonwerter.pmax_mw * Math.max(1, dane.quantity)).toFixed(3)} MW`}
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
      walidacja={bledy.length > 0 ? T.walidacjaStopka : !hasKontekst ? T.brakStacjiOpis : null}
      akcjaGlowna={{ etykieta: T.zapisz, onClick: onZapisz, zablokowana: !hasKontekst || !activeCaseId, testid: 'mvd-kreator-oze-zapisz' }}
      akcjaAnuluj={{ etykieta: T.anuluj, onClick: () => closeForm(), testid: 'mvd-kreator-oze-anuluj' }}
      krokWstecz={
        krokIndex > 0
          ? { etykieta: T.wstecz, onClick: () => setKrok(KROKI[krokIndex - 1].id), testid: 'mvd-kreator-oze-wstecz' }
          : undefined
      }
      krokDalej={
        krokIndex < KROKI.length - 1
          ? { etykieta: T.dalej, onClick: () => setKrok(KROKI[krokIndex + 1].id), testid: 'mvd-kreator-oze-dalej' }
          : undefined
      }
      licznikKrokow={T.licznik(krokIndex + 1, KROKI.length)}
      testid="mvd-kreator-oze"
    >
      {!hasKontekst ? (
        <KreatorSekcja tytul={T.brakStacjiTytul} testid="mvd-kreator-oze-brak">
          <KreatorInfo>{T.brakStacjiOpis}</KreatorInfo>
        </KreatorSekcja>
      ) : null}

      {krok === 'tech' ? (
        <KreatorSekcja tytul={T.sekcjaTechnologia} testid="mvd-kreator-oze-tech">
          <KreatorInfo>{T.technologiaPomoc}</KreatorInfo>
          <KreatorSiatka kolumny={2}>
            <PoleWyboru
              etykieta={T.technologia}
              wartosc={dane.source_technology}
              onZmiana={(v) => zmienTechnologie(v as TechnologiaOze)}
              opcje={OPCJE_TECH}
              testid="mvd-kreator-oze-technologia"
            />
            <PoleTekstowe
              etykieta={T.nazwa}
              wartosc={dane.source_name}
              onZmiana={(v) => zmien('source_name', v)}
              placeholder={T.nazwaPlaceholder}
              testid="mvd-kreator-oze-nazwa"
            />
          </KreatorSiatka>
          <KreatorInfo>{T.wariantPomoc}</KreatorInfo>
          <PoleWyboru
            etykieta={T.wariant}
            wartosc={dane.connection_variant}
            onZmiana={(v) => zmien('connection_variant', v as WariantPrzylaczenia)}
            opcje={OPCJE_WARIANT}
            testid="mvd-kreator-oze-wariant"
          />
          {isBlock ? (
            <>
              <PoleWyboru
                etykieta={T.transformator}
                wartosc={dane.blocking_transformer_ref ?? ''}
                onZmiana={(v) => zmien('blocking_transformer_ref', v || null)}
                opcje={[{ id: '', etykieta: T.transformatorPlaceholder }, ...opcjeTransformatory]}
                testid="mvd-kreator-oze-transformator"
              />
              {transformatory.length === 0 ? <KreatorInfo>{T.transformatorBrak}</KreatorInfo> : null}
              {bladDlaPola('blocking_transformer_ref') ? (
                <p className="mvd-pole-blad">{bladDlaPola('blocking_transformer_ref')}</p>
              ) : null}
            </>
          ) : (
            <>
              <PoleWyboru
                etykieta={T.umiejscowienie}
                wartosc={dane.placement}
                onZmiana={(v) => zmien('placement', v as OzeFormData['placement'])}
                opcje={OPCJE_UMIEJSCOWIENIE}
                testid="mvd-kreator-oze-umiejscowienie"
              />
              {dane.placement === 'NEW_FIELD' ? (
                <>
                  <PoleTekstowe
                    etykieta={T.nazwaNowegoPola}
                    wartosc={dane.new_field_name}
                    onZmiana={(v) => zmien('new_field_name', v)}
                    placeholder={tech.defaultName}
                    testid="mvd-kreator-oze-nowe-pole-nazwa"
                  />
                  <PoleKatalogu
                    etykieta={T.aparatNowegoPola}
                    wartosc={dane.apparatus_catalog_ref}
                    onZmiana={(v) => zmien('apparatus_catalog_ref', v)}
                    opcje={opcjeAparaty}
                    status={bladKatalogu ? 'error' : 'ready'}
                    placeholder={T.aparatPlaceholder}
                    komunikatBledu={bladKatalogu ?? T.katalogBlad}
                    blad={bladDlaPola('apparatus_catalog_ref')}
                    testid="mvd-kreator-oze-aparat"
                  />
                </>
              ) : null}
              {bladDlaPola('bus_nn_ref') ? <p className="mvd-pole-blad">{bladDlaPola('bus_nn_ref')}</p> : null}
              {bladDlaPola('existing_field_ref') ? (
                <p className="mvd-pole-blad">{bladDlaPola('existing_field_ref')}</p>
              ) : null}
            </>
          )}
        </KreatorSekcja>
      ) : null}

      {krok === 'katalog' ? (
        <KreatorSekcja tytul={T.sekcjaKatalog} testid="mvd-kreator-oze-katalog">
          <KreatorInfo>{T.katalogPomoc}</KreatorInfo>
          <PoleKatalogu
            etykieta={T.katalog}
            wartosc={dane.converter_catalog_ref}
            onZmiana={(v) => zmien('converter_catalog_ref', v)}
            opcje={opcjeKonwertery}
            status={bladKatalogu ? 'error' : 'ready'}
            placeholder={T.katalogPlaceholder}
            komunikatBledu={bladKatalogu ?? T.katalogBlad}
            blad={bladDlaPola('converter_catalog_ref')}
            testid="mvd-kreator-oze-konwerter"
          />
          <KreatorSiatka kolumny={2}>
            <PoleLiczbowe
              etykieta={T.liczba}
              wartosc={dane.quantity}
              onZmiana={(v) => zmien('quantity', Math.max(1, Math.trunc(v ?? 1)))}
              krok={1}
              min={1}
              pomoc={T.liczbaPomoc}
              testid="mvd-kreator-oze-liczba"
            />
          </KreatorSiatka>
          {paramReadout}
          {wybranyKonwerter && !wybranyKonwerter.ptpiree_certificate_ref ? (
            <KreatorInfo>{T.ptpireeBrak}</KreatorInfo>
          ) : null}
        </KreatorSekcja>
      ) : null}

      {krok === 'regulacja' ? (
        <>
          <KreatorSekcja tytul={T.sekcjaRegulacja} testid="mvd-kreator-oze-regulacja">
            <KreatorInfo>{T.regulacjaPomoc}</KreatorInfo>
            <PoleWyboru
              etykieta={T.regulacja}
              wartosc={dane.control_mode}
              onZmiana={(v) => zmien('control_mode', v as TrybRegulacji)}
              opcje={OPCJE_REGULACJA}
              testid="mvd-kreator-oze-tryb"
            />
            {dane.control_mode === 'STALY_COS_PHI' ? (
              <PoleLiczbowe
                etykieta={T.cosPhiCel}
                wartosc={dane.cos_phi_target}
                onZmiana={(v) => zmien('cos_phi_target', v)}
                krok={0.01}
                min={0}
                max={1}
                placeholder={`Sugerowane: ${SUGEROWANE.cosPhi}`}
                pomoc={T.cosPhiCelPomoc}
                blad={bladDlaPola('cos_phi_target')}
                testid="mvd-kreator-oze-cosphi"
              />
            ) : null}
            {dane.control_mode === 'Q_OD_U' ? (
              <>
                <PoleLiczbowe
                  etykieta={T.quNachylenie}
                  wartosc={dane.qu_slope_pu_per_pu}
                  onZmiana={(v) => zmien('qu_slope_pu_per_pu', v)}
                  krok={0.5}
                  min={0}
                  placeholder={`Sugerowane: ${SUGEROWANE.quSlopePuPerPu}`}
                  pomoc={T.quNachyleniePomoc}
                  testid="mvd-kreator-oze-qu-slope"
                />
                <KreatorSiatka kolumny={2}>
                  <PoleLiczbowe
                    etykieta={T.quPasmoDol}
                    jednostka="pu"
                    wartosc={dane.qu_deadband_low_pu}
                    onZmiana={(v) => zmien('qu_deadband_low_pu', v)}
                    krok={0.01}
                    min={0}
                    placeholder={`Sugerowane: ${SUGEROWANE.quDeadbandLowPu}`}
                    pomoc={T.quPasmoPomoc}
                    testid="mvd-kreator-oze-qu-db-low"
                  />
                  <PoleLiczbowe
                    etykieta={T.quPasmoGora}
                    jednostka="pu"
                    wartosc={dane.qu_deadband_high_pu}
                    onZmiana={(v) => zmien('qu_deadband_high_pu', v)}
                    krok={0.01}
                    min={0}
                    placeholder={`Sugerowane: ${SUGEROWANE.quDeadbandHighPu}`}
                    blad={bladDlaPola('qu_deadband_high_pu')}
                    testid="mvd-kreator-oze-qu-db-high"
                  />
                </KreatorSiatka>
              </>
            ) : null}
            {trybQWymagaWartosci(dane) ? (
              <KreatorInfo>{T.regulacjaPasywnaOstrzezenie}</KreatorInfo>
            ) : null}
            <KreatorSiatka kolumny={2}>
              <PoleLiczbowe
                etykieta={T.qMin}
                jednostka="Mvar"
                wartosc={dane.q_min_mvar}
                onZmiana={(v) => zmien('q_min_mvar', v)}
                pomoc={T.qPomoc}
                testid="mvd-kreator-oze-qmin"
              />
              <PoleLiczbowe
                etykieta={T.qMax}
                jednostka="Mvar"
                wartosc={dane.q_max_mvar}
                onZmiana={(v) => zmien('q_max_mvar', v)}
                blad={bladDlaPola('q_max_mvar')}
                testid="mvd-kreator-oze-qmax"
              />
            </KreatorSiatka>
            <PoleLiczbowe
              etykieta={T.mocRobocza}
              jednostka="MW"
              wartosc={dane.power_setpoint_mw}
              onZmiana={(v) => zmien('power_setpoint_mw', v)}
              pomoc={T.mocRoboczaPomoc}
              testid="mvd-kreator-oze-moc"
            />
            <KreatorSiatka kolumny={2}>
              <PoleLiczbowe
                etykieta={T.statyzmPf}
                jednostka="%"
                wartosc={dane.frequency_droop_percent}
                onZmiana={(v) => zmien('frequency_droop_percent', v)}
                min={0}
                placeholder={`Sugerowane: ${SUGEROWANE.pfDroopPercent}`}
                pomoc={T.statyzmPfPomoc}
                testid="mvd-kreator-oze-statyzm"
              />
              {dane.frequency_droop_percent ? (
                <PoleLiczbowe
                  etykieta={T.pfDeadband}
                  jednostka="Hz"
                  wartosc={dane.lfsm_deadband_hz}
                  onZmiana={(v) => zmien('lfsm_deadband_hz', v)}
                  krok={0.05}
                  min={0}
                  placeholder={`Sugerowane: ${SUGEROWANE.pfDeadbandHz}`}
                  pomoc={T.pfDeadbandPomoc}
                  testid="mvd-kreator-oze-deadband"
                />
              ) : null}
            </KreatorSiatka>
            <CharakterystykaNcRfg
              mode={dane.control_mode}
              cosPhi={dane.cos_phi_target}
              quSlope={dane.qu_slope_pu_per_pu}
              quDbLow={dane.qu_deadband_low_pu}
              quDbHigh={dane.qu_deadband_high_pu}
              droopPct={dane.frequency_droop_percent}
              pfDbHz={dane.lfsm_deadband_hz}
              allowIncrease={dane.source_technology === 'BESS'}
            />
          </KreatorSekcja>

          {dane.source_technology === 'BESS' ? (
            <KreatorSekcja tytul={T.sekcjaBess} testid="mvd-kreator-oze-bess">
              <PoleWyboru
                etykieta={T.bessTryb}
                wartosc={dane.bess_mode}
                onZmiana={(v) => zmien('bess_mode', v as TrybBess)}
                opcje={OPCJE_BESS}
                testid="mvd-kreator-oze-bess-tryb"
              />
              <KreatorSiatka kolumny={2}>
                <PoleLiczbowe
                  etykieta={T.socMin}
                  jednostka="%"
                  wartosc={dane.soc_min_percent}
                  onZmiana={(v) => zmien('soc_min_percent', v)}
                  blad={bladDlaPola('soc_min_percent')}
                  pomoc={T.socPomoc}
                  testid="mvd-kreator-oze-soc-min"
                />
                <PoleLiczbowe
                  etykieta={T.socMax}
                  jednostka="%"
                  wartosc={dane.soc_max_percent}
                  onZmiana={(v) => zmien('soc_max_percent', v)}
                  blad={bladDlaPola('soc_max_percent')}
                  testid="mvd-kreator-oze-soc-max"
                />
              </KreatorSiatka>
            </KreatorSekcja>
          ) : null}
        </>
      ) : null}

      {krok === 'zapis' ? (
        <KreatorSekcja tytul={T.krokZapis} testid="mvd-kreator-oze-zapis">
          <KreatorInfo>{T.downstreamOpis}</KreatorInfo>
          <KreatorSiatka kolumny={2}>
            <RzadWartosci etykieta={T.wierszStacja} wartosc={kontekst.station_label || '—'} />
            <RzadWartosci etykieta={T.wierszTechnologia} wartosc={technologiaLabel(dane.source_technology)} />
            <RzadWartosci etykieta={T.wierszPrzylaczenie} wartosc={wariantLabel(dane.connection_variant)} />
            <RzadWartosci etykieta={T.wierszRegulacja} wartosc={regulacjaLabel(dane.control_mode)} />
            {dane.source_technology === 'BESS' ? (
              <RzadWartosci etykieta={T.bessTryb} wartosc={bessLabel(dane.bess_mode)} />
            ) : null}
            <RzadWartosci etykieta={T.nazwa} wartosc={dane.source_name.trim() || tech.defaultName} />
          </KreatorSiatka>
        </KreatorSekcja>
      ) : null}
    </KreatorRama>
  );
}
