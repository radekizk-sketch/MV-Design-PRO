/**
 * Kreator „Źródło dyspozycyjne nN (agregat / UPS)" — ui2, kreatory/rama.
 *
 * Wspólny kreator dla operacji `add_genset_nn` i `add_ups_nn` (rodzaj z op).
 * Katalog-first (SYSTEM_ZRODLOWY + APARAT_NN). Zapis = operacja domenowa. ZERO
 * fizyki w UI (kontrakt payloadu bez zmian względem legacy AddDispatchableSourceForm).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { fetchLvApparatusTypes, getCatalogErrorMessage } from '../../../ui/catalog/api';
import type { LVApparatusType } from '../../../ui/catalog/types';
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
  konfliktyFormularza,
  operacjaDla,
  rodzajZOperacji,
  walidujFormularz,
  zbudujPayload,
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

/** Miejsce pola modelu w kreatorze — cel wskazania BRAKU_DO_OPERACJI. */
const MIEJSCA: Readonly<Record<string, MiejscePola>> = {
  bus_nn_ref: { krok: 'pole', pole: 'mvd-kreator-zrodlo-dysp-szyna' },
  existing_field_ref: { krok: 'pole', pole: 'mvd-kreator-zrodlo-dysp-pole-istniejace' },
  new_field_switch_kind: { krok: 'pole', pole: 'mvd-kreator-zrodlo-dysp-aparat' },
  new_field_switch_state: { krok: 'pole', pole: 'mvd-kreator-zrodlo-dysp-stan' },
  new_field_voltage_nn_kv: { krok: 'pole', pole: 'mvd-kreator-zrodlo-dysp-napiecie-nn' },
  rated_power_kw: { krok: 'parametry', pole: 'mvd-kreator-zrodlo-dysp-moc' },
  rated_voltage_kv: { krok: 'parametry', pole: 'mvd-kreator-zrodlo-dysp-napiecie' },
  power_factor: { krok: 'parametry', pole: 'mvd-kreator-zrodlo-dysp-cosfi' },
  genset_operation_mode: { krok: 'parametry', pole: 'mvd-kreator-zrodlo-dysp-tryb-genset' },
  backup_time_min: { krok: 'parametry', pole: 'mvd-kreator-zrodlo-dysp-backup' },
  ups_operation_mode: { krok: 'parametry', pole: 'mvd-kreator-zrodlo-dysp-tryb-ups' },
};

/** Pola, które kreator może przyjąć automatycznie z topologii (AUTO_PRZYJETE). */
type PoleAuto = 'bus_nn_ref' | 'new_field_voltage_nn_kv' | 'rated_voltage_kv';

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

  const [dane, setDane] = useState<ZrodloDyspozycyjneFormData>(DANE_DOMYSLNE);
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);
  const [krok, setKrok] = useState<string>('pole');
  const prowadzenie = useProwadzenie(setKrok);
  const { edytowane, decyzjaProjektanta } = useDecyzjeProjektanta<PoleAuto>();

  const [aparatKatalog, setAparatKatalog] = useState<LVApparatusType[]>([]);
  const [bladKatalogu, setBladKatalogu] = useState<string | null>(null);
  const [katalogLadowanie, setKatalogLadowanie] = useState(true);

  // AUTO_PRZYJETE: szyna z kontekstu wywołania albo jedyna szyna nN stacji. Kilka szyn bez
  // wskazania = wybór projektanta (dawniej cicho pierwsza z listy).
  const jedynaSzyna = useMemo(() => jedynaZgodna(busOptions), [busOptions]);
  const szynaAutoRef = initialBusRef ?? jedynaSzyna?.ref_id ?? null;
  useEffect(() => {
    if (!szynaAutoRef || decyzjaProjektanta('bus_nn_ref')) return;
    setDane((p) => (p.bus_nn_ref === szynaAutoRef ? p : { ...p, bus_nn_ref: szynaAutoRef }));
  }, [decyzjaProjektanta, szynaAutoRef]);

  // AUTO_PRZYJETE: napięcie pola i napięcie znamionowe agregatu z napięcia wybranej szyny nN
  // (topologia). Szyna bez znanego napięcia = pola puste, projektant podaje je sam.
  const napiecieSzyny = useMemo(() => {
    const kv = busOptions.find((b) => b.ref_id === dane.bus_nn_ref)?.voltage_kv;
    return typeof kv === 'number' && kv > 0 ? kv : null;
  }, [busOptions, dane.bus_nn_ref]);
  useEffect(() => {
    if (napiecieSzyny === null) return;
    if (!decyzjaProjektanta('new_field_voltage_nn_kv')) {
      setDane((p) => ({ ...p, new_field_voltage_nn_kv: napiecieSzyny }));
    }
    if (kind === 'GENSET' && !decyzjaProjektanta('rated_voltage_kv')) {
      setDane((p) => ({ ...p, rated_voltage_kv: napiecieSzyny }));
    }
  }, [decyzjaProjektanta, kind, napiecieSzyny]);

  useEffect(() => {
    let active = true;
    setBladKatalogu(null);
    setKatalogLadowanie(true);
    fetchLvApparatusTypes()
      .then((lv) => {
        if (active) setAparatKatalog(Array.isArray(lv) ? lv : []);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setAparatKatalog([]);
        setBladKatalogu(getCatalogErrorMessage(e));
      })
      .finally(() => {
        if (active) setKatalogLadowanie(false);
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
      if (pole === 'bus_nn_ref' || pole === 'new_field_voltage_nn_kv' || pole === 'rated_voltage_kv') {
        edytowane(pole as PoleAuto);
      }
    },
    [edytowane],
  );

  // KONFLIKT_TECHNICZNY — przy polu od razu; braki dopiero przy próbie zapisu (wskazanie ramy).
  const konflikty = useMemo(() => konfliktyFormularza(dane, kind), [dane, kind]);
  const bladDlaPola = (pole: string): string | undefined => konflikty.find((b) => b.field === pole)?.message;

  const opcjeSzyn = useMemo(
    () => busOptions.map((b) => ({ id: b.ref_id, etykieta: `${b.name} (${b.voltage_kv} kV)` })),
    [busOptions],
  );
  const opcjePol = useMemo(
    () => fieldOptions.map((f) => ({ id: f.ref_id, etykieta: f.name })),
    [fieldOptions],
  );
  const opcjeAparatu = useMemo(
    () => aparatKatalog.map((a) => ({ id: a.id, etykieta: `${a.name} · ${a.u_n_kv} kV · ${a.i_n_a} A` })),
    [aparatKatalog],
  );

  const isNewField = dane.placement === 'NEW_FIELD';

  const onZapisz = useCallback(async () => {
    const brak = pierwszyBrak([
      ...walidujFormularz(dane, kind).map((b) => wskazanieZBledu(b, MIEJSCA)),
      !activeCaseId && { komunikat: T.brakZakresu },
    ]);
    if (brak || !activeCaseId) {
      if (brak) prowadzenie.wskaz(brak);
      return;
    }
    prowadzenie.zgas();
    setBladGlobalny(null);
    try {
      const response = await executeDomainOperation(
        activeCaseId,
        operacjaDla(kind),
        zbudujPayload(dane, kind, { station_ref: stationRef, station_label: stationName }),
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
      selekcjaPoOperacji(response, {
        type: kind === 'GENSET' ? 'Generator' : 'Load',
        name: dane.source_name.trim() || (kind === 'GENSET' ? 'Agregat nN' : 'UPS nN'),
      });
    } catch (e) {
      setBladGlobalny(e instanceof Error ? e.message : T.bladZapisu);
    }
  }, [activeCaseId, closeForm, dane, executeDomainOperation, kind, prowadzenie, selekcjaPoOperacji, stationName, stationRef]);

  // Panel kontroli neutralny: „do wyboru” w trakcie pracy, czerwień tylko dla konfliktu.
  const konfliktPola = konflikty.some((k) => k.field === 'new_field_voltage_nn_kv');
  const poleKompletne = isNewField
    ? Boolean(dane.new_field_switch_kind && dane.new_field_switch_state && dane.new_field_voltage_nn_kv !== null)
    : Boolean(dane.existing_field_ref);
  const konfliktMocy = konflikty.some((k) => k.field === 'rated_power_kw');
  const wierszeGotowosci: WierszGotowosci[] = [
    {
      etykieta: T.wierszSzyna,
      stan: !dane.bus_nn_ref ? 'do_wyboru' : 'ustalone',
      wartosc: busOptions.find((b) => b.ref_id === dane.bus_nn_ref)?.name ?? '',
    },
    {
      etykieta: T.wierszPole,
      stan: konfliktPola ? 'konflikt' : poleKompletne ? 'ustalone' : 'do_wyboru',
      wartosc: poleKompletne ? (isNewField ? T.wierszPoleNowe : T.wierszPoleIstniejace) : '',
    },
    {
      etykieta: T.wierszMoc,
      stan: konfliktMocy ? 'konflikt' : dane.rated_power_kw !== null ? 'ustalone' : 'do_wyboru',
      wartosc: dane.rated_power_kw !== null ? `${dane.rated_power_kw} kW` : '',
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
      {...prowadzenie.propsRamy}
      akcjaGlowna={{
        etykieta: tk.zapisz,
        onClick: onZapisz,
        // Wyszarzenie tylko na czas wczytywania katalogu aparatów nN (zamknięta lista ramy).
        blokada: katalogLadowanie ? 'ladowanie' : null,
        testid: 'mvd-kreator-zrodlo-dysp-zapisz',
      }}
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
              opcje={[{ id: '', etykieta: T.szynaPlaceholder }, ...opcjeSzyn]}
              pomoc={T.szynaPomoc}
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
                  wymagane
                  testid="mvd-kreator-zrodlo-dysp-aparat"
                />
                <PoleWyboru
                  etykieta={T.stanNormalny}
                  wartosc={dane.new_field_switch_state ?? ''}
                  onZmiana={(v) => zmien('new_field_switch_state', (v || null) as NNSwitchState | null)}
                  opcje={[{ id: '', etykieta: '— wybierz —' }, ...T.stanNormalnyOpcje]}
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
            <RzadWartosci etykieta={T.wierszMoc} wartosc={dane.rated_power_kw !== null ? `${dane.rated_power_kw} kW` : '—'} />
          </KreatorSiatka>
        </KreatorSekcja>
      ) : null}
    </KreatorRama>
  );
}
