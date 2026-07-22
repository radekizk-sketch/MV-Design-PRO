/**
 * Kreator „Źródło dyspozycyjne nN (agregat / UPS)" — ui2, kreatory/rama.
 *
 * Wspólny kreator dla operacji `add_genset_nn` i `add_ups_nn` (rodzaj z op).
 * Katalog-first (SYSTEM_ZRODLOWY + APARAT_NN). Zapis = operacja domenowa. ZERO
 * fizyki w UI (kontrakt payloadu bez zmian względem legacy AddDispatchableSourceForm).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { fetchLvApparatusTypes, fetchSourceSystemTypes, getCatalogErrorMessage } from '../../../ui/catalog/api';
import type { LVApparatusType, SourceSystemCatalogType } from '../../../ui/catalog/types';
import {
  listNnBusOptions,
  listNnSourceFieldOptions,
  resolveBusNnRef,
  resolveStationRef,
  stationLabel,
} from '../../../ui/network-build/forms/enmResolvers';
import { useActiveOperationForm, useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
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
  operacjaDla,
  rodzajZOperacji,
  walidujFormularz,
  zbudujPayload,
  type BladPola,
  type GensetFuelType,
  type GensetOperationMode,
  type NNSwitchKind,
  type NNSwitchState,
  type SourcePlacement,
  type UpsBatteryType,
  type UpsOperationMode,
  type ZrodloDyspozycyjneFormData,
} from './zrodloDyspozycyjneModel';
import { ZRODLO_DYSP_STRINGS as T, tekstyDla } from './strings';

const KROKI: readonly KrokKreatora[] = [
  { id: 'pole', tytul: T.krokPole },
  { id: 'parametry', tytul: T.krokParametry },
  { id: 'zapis', tytul: T.krokZapis },
];

export function KreatorZrodloDyspozycyjne() {
  const activeForm = useActiveOperationForm();
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const selekcjaPoOperacji = useSelekcjaPoOperacji();
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);

  const kind = rodzajZOperacji(activeForm?.op);
  const tk = tekstyDla(kind);
  const context = activeForm?.context as Record<string, unknown> | undefined;

  const stationRef = useMemo(() => resolveStationRef(context, snapshot), [context, snapshot]);
  const stationName = useMemo(() => stationLabel(snapshot, stationRef), [snapshot, stationRef]);
  const busOptions = useMemo(() => listNnBusOptions(snapshot, stationRef), [snapshot, stationRef]);
  const initialBusRef = useMemo(() => resolveBusNnRef(context, snapshot), [context, snapshot]);

  const [dane, setDane] = useState<ZrodloDyspozycyjneFormData>(() => ({
    ...DANE_DOMYSLNE,
    bus_nn_ref: initialBusRef ?? busOptions[0]?.ref_id ?? '',
  }));
  const [bledy, setBledy] = useState<BladPola[]>([]);
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);
  const [krok, setKrok] = useState<string>('pole');

  const [zrodloKatalog, setZrodloKatalog] = useState<SourceSystemCatalogType[]>([]);
  const [aparatKatalog, setAparatKatalog] = useState<LVApparatusType[]>([]);
  const [bladKatalogu, setBladKatalogu] = useState<string | null>(null);

  // Ustal szynę, gdy kontekst/model dostarczy domyślną dopiero po montażu.
  useEffect(() => {
    const domyslna = initialBusRef ?? busOptions[0]?.ref_id ?? '';
    setDane((p) => (p.bus_nn_ref ? p : { ...p, bus_nn_ref: domyslna }));
  }, [initialBusRef, busOptions]);

  useEffect(() => {
    let active = true;
    setBladKatalogu(null);
    Promise.all([fetchSourceSystemTypes(), fetchLvApparatusTypes()])
      .then(([src, lv]) => {
        if (!active) return;
        setZrodloKatalog(Array.isArray(src) ? src : []);
        setAparatKatalog(Array.isArray(lv) ? lv : []);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setZrodloKatalog([]);
        setAparatKatalog([]);
        setBladKatalogu(getCatalogErrorMessage(e));
      });
    return () => {
      active = false;
    };
  }, []);

  const fieldOptions = useMemo(
    () => listNnSourceFieldOptions(snapshot, stationRef, dane.bus_nn_ref),
    [snapshot, stationRef, dane.bus_nn_ref],
  );

  const zmien = useCallback(
    <K extends keyof ZrodloDyspozycyjneFormData>(pole: K, wartosc: ZrodloDyspozycyjneFormData[K]) => {
      setDane((p) => ({ ...p, [pole]: wartosc }));
    },
    [],
  );

  const bladDlaPola = (pole: string): string | undefined => bledy.find((b) => b.field === pole)?.message;

  const opcjeSzyn = useMemo(
    () => busOptions.map((b) => ({ id: b.ref_id, etykieta: `${b.name} (${b.voltage_kv} kV)` })),
    [busOptions],
  );
  const opcjePol = useMemo(
    () => fieldOptions.map((f) => ({ id: f.ref_id, etykieta: f.name })),
    [fieldOptions],
  );
  const opcjeZrodla = useMemo(
    () =>
      zrodloKatalog.map((s) => ({
        id: s.id,
        etykieta: `${s.name} · ${s.voltage_rating_kv} kV · Sk'' ${s.sk3_mva} MVA`,
      })),
    [zrodloKatalog],
  );
  const opcjeAparatu = useMemo(
    () => aparatKatalog.map((a) => ({ id: a.id, etykieta: `${a.name} · ${a.u_n_kv} kV · ${a.i_n_a} A` })),
    [aparatKatalog],
  );

  const params = useMemo(
    () => (dane.catalog_item_id ? zrodloKatalog.find((s) => s.id === dane.catalog_item_id) ?? null : null),
    [dane.catalog_item_id, zrodloKatalog],
  );

  const isNewField = dane.placement === 'NEW_FIELD';
  const zapisMozliwy = Boolean(dane.bus_nn_ref) && Boolean(activeCaseId);

  const onZapisz = useCallback(async () => {
    const walid = walidujFormularz(dane, kind);
    setBledy(walid);
    if (walid.length > 0) {
      setBladGlobalny(T.walidacjaStopka);
      return;
    }
    if (!activeCaseId) {
      setBladGlobalny(T.brakZakresu);
      return;
    }
    setBladGlobalny(null);
    try {
      const response = await executeDomainOperation(
        activeCaseId,
        operacjaDla(kind),
        zbudujPayload(dane, kind, { station_ref: stationRef, station_label: stationName }),
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
        type: kind === 'GENSET' ? 'Generator' : 'Load',
        name: dane.source_name.trim() || (kind === 'GENSET' ? 'Agregat nN' : 'UPS nN'),
      });
    } catch (e) {
      setBladGlobalny(e instanceof Error ? e.message : T.walidacjaStopka);
    }
  }, [activeCaseId, closeForm, dane, executeDomainOperation, kind, selekcjaPoOperacji, stationName, stationRef]);

  const wierszeGotowosci: WierszGotowosci[] = [
    {
      etykieta: T.wierszSzyna,
      stan: dane.bus_nn_ref ? 'kompletne' : 'brak',
      wartosc: dane.bus_nn_ref ? busOptions.find((b) => b.ref_id === dane.bus_nn_ref)?.name ?? 'Wskazana' : 'Brak',
    },
    {
      etykieta: T.wierszPole,
      stan: isNewField
        ? dane.new_field_switch_kind && dane.new_field_voltage_nn_kv
          ? 'kompletne'
          : 'brak'
        : dane.existing_field_ref
          ? 'kompletne'
          : 'brak',
      wartosc: isNewField ? 'Nowe pole' : dane.existing_field_ref ? 'Istniejące' : 'Do wyboru',
    },
    {
      etykieta: T.wierszKatalog,
      stan: dane.catalog_item_id ? 'kompletne' : 'brak',
      wartosc: dane.catalog_item_id ? params?.name ?? 'Kompletne' : 'Do konfiguracji',
    },
    {
      etykieta: T.wierszMoc,
      stan: dane.rated_power_kw && dane.rated_power_kw > 0 ? 'kompletne' : 'brak',
      wartosc: dane.rated_power_kw ? `${dane.rated_power_kw} kW` : 'Do uzupełnienia',
    },
  ];

  const aside = (
    <>
      <KreatorGotowosc tytul={T.kontrolaTytul} wiersze={wierszeGotowosci} testid="mvd-kreator-zrodlo-dysp-gotowosc" />
      <KreatorNastepnyKrok eyebrow={T.downstreamTytul} opis={tk.downstreamOpis} />
    </>
  );

  const krokIndex = KROKI.findIndex((k) => k.id === krok);

  return (
    <KreatorRama
      eyebrow={tk.eyebrow}
      tytul={tk.eyebrow}
      cel={tk.cel}
      odznaka={tk.odznaka}
      kroki={KROKI}
      krokAktywny={krok}
      onKrok={setKrok}
      pelny
      aside={aside}
      bladGlobalny={bladGlobalny}
      walidacja={bledy.length > 0 ? T.walidacjaStopka : null}
      akcjaGlowna={{ etykieta: tk.zapisz, onClick: onZapisz, zablokowana: !zapisMozliwy, testid: 'mvd-kreator-zrodlo-dysp-zapisz' }}
      akcjaAnuluj={{ etykieta: T.anuluj, onClick: () => closeForm(), testid: 'mvd-kreator-zrodlo-dysp-anuluj' }}
      krokWstecz={
        krokIndex > 0
          ? { etykieta: T.wstecz, onClick: () => setKrok(KROKI[krokIndex - 1].id), testid: 'mvd-kreator-zrodlo-dysp-wstecz' }
          : undefined
      }
      krokDalej={
        krokIndex < KROKI.length - 1
          ? { etykieta: T.dalej, onClick: () => setKrok(KROKI[krokIndex + 1].id), testid: 'mvd-kreator-zrodlo-dysp-dalej' }
          : undefined
      }
      licznikKrokow={T.licznik(krokIndex + 1, KROKI.length)}
      testid="mvd-kreator-zrodlo-dysp"
    >
      {krok === 'pole' ? (
        <KreatorSekcja tytul={T.krokPole} testid="mvd-kreator-zrodlo-dysp-pole">
          <RzadWartosci etykieta={T.stacja} wartosc={stationName} />
          {busOptions.length === 0 ? (
            <KreatorInfo>{T.szynaBrak}</KreatorInfo>
          ) : (
            <PoleWyboru
              etykieta={T.szyna}
              wartosc={dane.bus_nn_ref}
              onZmiana={(v) => zmien('bus_nn_ref', v)}
              opcje={opcjeSzyn}
              pomoc={T.szynaPomoc}
              blad={bladDlaPola('bus_nn_ref')}
              wymagane
              testid="mvd-kreator-zrodlo-dysp-szyna"
            />
          )}

          <PoleWyboru
            etykieta={T.osadzenie}
            wartosc={dane.placement}
            onZmiana={(v) => zmien('placement', v as SourcePlacement)}
            opcje={T.osadzenieOpcje}
            testid="mvd-kreator-zrodlo-dysp-osadzenie"
          />

          {!isNewField ? (
            opcjePol.length === 0 ? (
              <KreatorInfo>{T.poleIstniejaceBrak}</KreatorInfo>
            ) : (
              <PoleWyboru
                etykieta={T.poleIstniejace}
                wartosc={dane.existing_field_ref ?? ''}
                onZmiana={(v) => zmien('existing_field_ref', v || null)}
                opcje={[{ id: '', etykieta: T.poleIstniejacePlaceholder }, ...opcjePol]}
                blad={bladDlaPola('existing_field_ref')}
                wymagane
                testid="mvd-kreator-zrodlo-dysp-pole-istniejace"
              />
            )
          ) : (
            <>
              <KreatorSiatka kolumny={2}>
                <PoleWyboru
                  etykieta={T.aparat}
                  wartosc={dane.new_field_switch_kind ?? ''}
                  onZmiana={(v) => zmien('new_field_switch_kind', (v || null) as NNSwitchKind | null)}
                  opcje={[{ id: '', etykieta: '— wybierz —' }, ...T.aparatOpcje]}
                  pomoc={T.aparatPomoc}
                  blad={bladDlaPola('new_field_switch_kind')}
                  wymagane
                  testid="mvd-kreator-zrodlo-dysp-aparat"
                />
                <PoleWyboru
                  etykieta={T.stanNormalny}
                  wartosc={dane.new_field_switch_state ?? ''}
                  onZmiana={(v) => zmien('new_field_switch_state', (v || null) as NNSwitchState | null)}
                  opcje={[{ id: '', etykieta: '— wybierz —' }, ...T.stanNormalnyOpcje]}
                  blad={bladDlaPola('new_field_switch_state')}
                  wymagane
                  testid="mvd-kreator-zrodlo-dysp-stan"
                />
              </KreatorSiatka>
              <PoleKatalogu
                etykieta={T.aparatKatalog}
                wartosc={dane.new_field_switch_catalog_ref}
                onZmiana={(v) => zmien('new_field_switch_catalog_ref', v)}
                opcje={opcjeAparatu}
                status={bladKatalogu ? 'error' : 'ready'}
                placeholder={T.aparatKatalogPlaceholder}
                komunikatBledu={bladKatalogu ?? T.aparatKatalogBlad}
                pomoc={T.aparatKatalogPomoc}
                testid="mvd-kreator-zrodlo-dysp-aparat-katalog"
              />
              <KreatorSiatka kolumny={2}>
                <PoleLiczbowe
                  etykieta={T.napiecieNn}
                  jednostka="kV"
                  wartosc={dane.new_field_voltage_nn_kv}
                  onZmiana={(v) => zmien('new_field_voltage_nn_kv', v)}
                  krok={0.001}
                  min={0}
                  pomoc={T.napiecieNnPomoc}
                  blad={bladDlaPola('new_field_voltage_nn_kv')}
                  wymagane
                  testid="mvd-kreator-zrodlo-dysp-napiecie-nn"
                />
                <PoleTekstowe
                  etykieta={T.nazwaPola}
                  wartosc={dane.new_field_name}
                  onZmiana={(v) => zmien('new_field_name', v)}
                  placeholder={T.nazwaPolaPlaceholder}
                  testid="mvd-kreator-zrodlo-dysp-nazwa-pola"
                />
              </KreatorSiatka>
            </>
          )}
        </KreatorSekcja>
      ) : null}

      {krok === 'parametry' ? (
        <KreatorSekcja tytul={T.krokParametry} testid="mvd-kreator-zrodlo-dysp-parametry">
          <KreatorInfo>{T.katalogPomoc}</KreatorInfo>
          <PoleKatalogu
            etykieta={tk.katalog}
            wartosc={dane.catalog_item_id}
            onZmiana={(v) => zmien('catalog_item_id', v)}
            opcje={opcjeZrodla}
            status={bladKatalogu ? 'error' : 'ready'}
            placeholder={T.katalogPlaceholder}
            komunikatBledu={bladKatalogu ?? tk.katalogBlad}
            blad={bladDlaPola('catalog_item_id')}
            wymagane
            testid="mvd-kreator-zrodlo-dysp-katalog"
          />

          {kind === 'GENSET' ? (
            <>
              <KreatorSiatka kolumny={3}>
                <PoleLiczbowe
                  etykieta={T.moc}
                  jednostka="kW"
                  wartosc={dane.rated_power_kw}
                  onZmiana={(v) => zmien('rated_power_kw', v)}
                  krok={1}
                  min={0}
                  pomoc={T.mocPomoc}
                  blad={bladDlaPola('rated_power_kw')}
                  wymagane
                  testid="mvd-kreator-zrodlo-dysp-moc"
                />
                <PoleLiczbowe
                  etykieta={T.napiecie}
                  jednostka="kV"
                  wartosc={dane.rated_voltage_kv}
                  onZmiana={(v) => zmien('rated_voltage_kv', v)}
                  krok={0.001}
                  min={0}
                  pomoc={T.napieciePomoc}
                  blad={bladDlaPola('rated_voltage_kv')}
                  wymagane
                  testid="mvd-kreator-zrodlo-dysp-napiecie"
                />
                <PoleLiczbowe
                  etykieta={T.cosfi}
                  wartosc={dane.power_factor}
                  onZmiana={(v) => zmien('power_factor', v)}
                  krok={0.01}
                  min={0}
                  max={1}
                  pomoc={T.cosfiPomoc}
                  blad={bladDlaPola('power_factor')}
                  wymagane
                  testid="mvd-kreator-zrodlo-dysp-cosfi"
                />
              </KreatorSiatka>
              <KreatorSiatka kolumny={2}>
                <PoleWyboru
                  etykieta={T.trybGenset}
                  wartosc={dane.genset_operation_mode ?? ''}
                  onZmiana={(v) => zmien('genset_operation_mode', (v || null) as GensetOperationMode | null)}
                  opcje={[{ id: '', etykieta: '— wybierz —' }, ...T.trybGensetOpcje]}
                  blad={bladDlaPola('genset_operation_mode')}
                  wymagane
                  testid="mvd-kreator-zrodlo-dysp-tryb-genset"
                />
                <PoleWyboru
                  etykieta={T.paliwo}
                  wartosc={dane.fuel_type ?? ''}
                  onZmiana={(v) => zmien('fuel_type', (v || null) as GensetFuelType | null)}
                  opcje={T.paliwoOpcje}
                  testid="mvd-kreator-zrodlo-dysp-paliwo"
                />
              </KreatorSiatka>
            </>
          ) : (
            <>
              <KreatorSiatka kolumny={2}>
                <PoleLiczbowe
                  etykieta={T.moc}
                  jednostka="kW"
                  wartosc={dane.rated_power_kw}
                  onZmiana={(v) => zmien('rated_power_kw', v)}
                  krok={1}
                  min={0}
                  pomoc={T.mocPomoc}
                  blad={bladDlaPola('rated_power_kw')}
                  wymagane
                  testid="mvd-kreator-zrodlo-dysp-moc"
                />
                <PoleLiczbowe
                  etykieta={T.czasPodtrzymania}
                  jednostka="min"
                  wartosc={dane.backup_time_min}
                  onZmiana={(v) => zmien('backup_time_min', v)}
                  krok={1}
                  min={0}
                  pomoc={T.czasPodtrzymaniaPomoc}
                  blad={bladDlaPola('backup_time_min')}
                  wymagane
                  testid="mvd-kreator-zrodlo-dysp-backup"
                />
              </KreatorSiatka>
              <KreatorSiatka kolumny={2}>
                <PoleWyboru
                  etykieta={T.trybUps}
                  wartosc={dane.ups_operation_mode ?? ''}
                  onZmiana={(v) => zmien('ups_operation_mode', (v || null) as UpsOperationMode | null)}
                  opcje={[{ id: '', etykieta: '— wybierz —' }, ...T.trybUpsOpcje]}
                  blad={bladDlaPola('ups_operation_mode')}
                  wymagane
                  testid="mvd-kreator-zrodlo-dysp-tryb-ups"
                />
                <PoleWyboru
                  etykieta={T.akumulator}
                  wartosc={dane.battery_type ?? ''}
                  onZmiana={(v) => zmien('battery_type', (v || null) as UpsBatteryType | null)}
                  opcje={T.akumulatorOpcje}
                  testid="mvd-kreator-zrodlo-dysp-akumulator"
                />
              </KreatorSiatka>
            </>
          )}

          <PoleTekstowe
            etykieta={T.nazwaZrodla}
            wartosc={dane.source_name}
            onZmiana={(v) => zmien('source_name', v)}
            placeholder={T.nazwaZrodlaPlaceholder}
            testid="mvd-kreator-zrodlo-dysp-nazwa"
          />

          <PanelTeorii
            tytul={tk.teoriaTytul}
            opis={tk.teoriaOpis}
            wymog={tk.teoriaWymog}
            podstawa={tk.teoriaPodstawa}
            testid="mvd-kreator-zrodlo-dysp-teoria"
          />
        </KreatorSekcja>
      ) : null}

      {krok === 'zapis' ? (
        <KreatorSekcja tytul={T.krokZapis} testid="mvd-kreator-zrodlo-dysp-zapis">
          <KreatorInfo>{tk.downstreamOpis}</KreatorInfo>
          <KreatorSiatka kolumny={2}>
            <RzadWartosci etykieta={T.stacja} wartosc={stationName} />
            <RzadWartosci
              etykieta={T.wierszSzyna}
              wartosc={busOptions.find((b) => b.ref_id === dane.bus_nn_ref)?.name ?? '—'}
            />
            <RzadWartosci etykieta={T.wierszKatalog} wartosc={params?.name ?? '—'} />
            <RzadWartosci etykieta={T.wierszMoc} wartosc={dane.rated_power_kw ? `${dane.rated_power_kw} kW` : '—'} />
          </KreatorSiatka>
        </KreatorSekcja>
      ) : null}
    </KreatorRama>
  );
}
