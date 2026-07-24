/**
 * Model kreatora „Dodaj źródło OZE/DER" (add_converter_source) — ui2, opcja MAX.
 *
 * CZYSTA logika przeniesiona z legacy `AddConverterSourceForm` (Opcja 1: podmiana
 * dostawcy prezentacji, kontrakt payloadu 1:1). ZERO fizyki: moc/prąd/Q liczy backend
 * (PF falownika po G-OZE-PF honoruje control_mode); ten moduł buduje żądanie operacji
 * domenowej i interpretuje kompletność wejść.
 *
 * Pola mapują 1:1 na `AddConverterSourcePayload` (backend): source_technology,
 * connection_variant, station_ref, bus_nn_ref, placement, source_field, source_name,
 * quantity, control_mode, power_setpoint_mw, q_min/max_mvar, bess_mode, soc_min/max,
 * blocking_transformer_ref, catalog_binding, materialized_params. Regulacja (control_mode
 * / Q) jest realnie konsumowana przez kanoniczny rozpływ mocy falownika (V12K-052).
 *
 * Powiązanie NC RfG (krzywe P(f)/Q(U)/FRT, flagi island/black_start/POD) NIE jest
 * utrwalane przez tę operację (kontrakt backendu) — to osobny łańcuch (karta G-OZE-B).
 * Certyfikat PTPiREE spływa z pól katalogu falownika (ConverterType.ptpiree_*).
 */

import { normalizeCatalogBinding } from '../../../ui/network-build/forms/catalogPayload';
import type { ConverterType } from '../../../ui/catalog/types';
import type {
  DerConnectionMethod,
  DerMvSwitchingDevice,
  DerTopologyPayload,
  LvSwitchgearVariant,
} from '../../../types/domainOps';

const CANONICAL_CATALOG_VERSION = 'v12.5';

export type TechnologiaOze = 'PV' | 'BESS' | 'FW';
export type WariantPrzylaczenia = 'nn_side' | 'block_transformer';
export type UmiejscowieniePola = 'NEW_FIELD' | 'EXISTING_FIELD';
export type TrybRegulacji = 'STALY_COS_PHI' | 'Q_OD_U' | 'P_OD_U' | 'WYLACZONE';
export type TrybBess = 'PEAK_SHAVING' | 'ARBITRAGE' | 'BACKUP' | 'GRID_SERVICES';
export type ConverterCatalogNamespace = 'ZRODLO_NN_PV' | 'ZRODLO_NN_BESS' | 'CONVERTER';

/** Konfiguracja technologii — etykieta, rodzaj pola, rodzaj katalogu. */
export interface KonfiguracjaTechnologii {
  readonly label: string;
  readonly shortLabel: string;
  readonly fieldKind: TechnologiaOze;
  readonly catalogKind: 'PV' | 'BESS' | 'WIND';
  readonly defaultName: string;
}

export const TECHNOLOGIE: Record<TechnologiaOze, KonfiguracjaTechnologii> = {
  PV: { label: 'Fotowoltaika', shortLabel: 'PV', fieldKind: 'PV', catalogKind: 'PV', defaultName: 'Blok PV' },
  BESS: { label: 'Magazyn energii', shortLabel: 'BESS', fieldKind: 'BESS', catalogKind: 'BESS', defaultName: 'Blok BESS' },
  FW: { label: 'Elektrownia wiatrowa', shortLabel: 'FW', fieldKind: 'FW', catalogKind: 'WIND', defaultName: 'Blok FW' },
};

/** Opcje = kontrakt danych: `value` to kod backendu, `label` polska etykieta UI. */
export const TECHNOLOGIA_OPCJE: ReadonlyArray<{ value: TechnologiaOze; label: string }> = [
  { value: 'PV', label: 'Fotowoltaika (PV)' },
  { value: 'BESS', label: 'Magazyn energii (BESS)' },
  { value: 'FW', label: 'Elektrownia wiatrowa (FW)' },
];

export const WARIANT_OPCJE: ReadonlyArray<{ value: WariantPrzylaczenia; label: string }> = [
  { value: 'nn_side', label: 'Bezpośrednio do szyny nN' },
  { value: 'block_transformer', label: 'Przez transformator blokowy' },
];

export const REGULACJA_OPCJE: ReadonlyArray<{ value: TrybRegulacji; label: string }> = [
  { value: 'STALY_COS_PHI', label: 'Stały współczynnik mocy cosφ' },
  { value: 'Q_OD_U', label: 'Regulacja Q(U) — napięciowo-jałowa' },
  { value: 'P_OD_U', label: 'Regulacja P(U) — ograniczanie mocy od napięcia' },
  { value: 'WYLACZONE', label: 'Bez regulacji (źródło pasywne)' },
];

export const BESS_OPCJE: ReadonlyArray<{ value: TrybBess; label: string }> = [
  { value: 'PEAK_SHAVING', label: 'Ścinanie szczytów (peak shaving)' },
  { value: 'ARBITRAGE', label: 'Arbitraż energetyczny' },
  { value: 'BACKUP', label: 'Zasilanie rezerwowe (backup)' },
  { value: 'GRID_SERVICES', label: 'Usługi systemowe (grid services)' },
];

const TECHNOLOGIA_LABEL = new Map(TECHNOLOGIA_OPCJE.map((o) => [o.value, o.label]));
const WARIANT_LABEL = new Map(WARIANT_OPCJE.map((o) => [o.value, o.label]));
const REGULACJA_LABEL = new Map(REGULACJA_OPCJE.map((o) => [o.value, o.label]));
const BESS_LABEL = new Map(BESS_OPCJE.map((o) => [o.value, o.label]));

export const technologiaLabel = (v: TechnologiaOze): string => TECHNOLOGIA_LABEL.get(v) ?? '';
export const wariantLabel = (v: WariantPrzylaczenia): string => WARIANT_LABEL.get(v) ?? '';
export const regulacjaLabel = (v: TrybRegulacji): string => REGULACJA_LABEL.get(v) ?? '';
export const bessLabel = (v: TrybBess): string => BESS_LABEL.get(v) ?? '';

/** Katalog OZE per technologia (namespace bindowania). */
export function converterCatalogNamespace(technology: TechnologiaOze): ConverterCatalogNamespace {
  if (technology === 'PV') return 'ZRODLO_NN_PV';
  if (technology === 'BESS') return 'ZRODLO_NN_BESS';
  return 'CONVERTER';
}

export interface KontekstOze {
  station_ref?: string;
  station_label?: string;
  bus_nn_ref?: string;
  existing_field_ref?: string;
}

/** Transformator blokowy (kandydat) — z snapshotu stacji. */
export interface TransformatorBlokowy {
  readonly ref_id: string;
  readonly name: string;
  readonly lv_bus_ref: string;
  readonly sn_mva: number;
  readonly uhv_kv?: number | null;
  readonly ulv_kv?: number | null;
}

export interface OzeFormData {
  source_technology: TechnologiaOze;
  connection_variant: WariantPrzylaczenia;
  placement: UmiejscowieniePola;
  source_name: string;
  new_field_name: string;
  quantity: number;
  converter_catalog_ref: string | null;
  apparatus_catalog_ref: string | null;
  blocking_transformer_ref: string | null;
  control_mode: TrybRegulacji;
  // V12K-063 (G-OZE-B3): wartości rządzące trybem regulacji Q — bez nich wybór trybu był
  // pasywny (phantom). cos_phi dla STALY_COS_PHI; nachylenie Q(U) dla Q_OD_U.
  cos_phi_target: number | null;
  qu_slope_pu_per_pu: number | null;
  // V12K-064 (G-OZE-B4): napięciowe pasmo nieczułości Q(U) [pu U] — zakres, w którym Q=0.
  // Bez niego charakterystyka Q(U) reagowała natychmiast (punkt 1.0/1.0) — forward-phantom.
  qu_deadband_low_pu: number | null;
  qu_deadband_high_pu: number | null;
  power_setpoint_mw: number | null;
  q_min_mvar: number | null;
  q_max_mvar: number | null;
  // V12K-062 (G-OZE-B): statyzm P(f)/LFSM [%Pn/%f] — realnie konsumowany przez kanoniczny PF.
  frequency_droop_percent: number | null;
  // V12K-063: pasmo nieczułości P(f)/LFSM [Hz].
  lfsm_deadband_hz: number | null;
  // V12K-087 (G-OZE-B2): jawne zdolności FRT (NC RfG) — przejście przez zanik (LVRT)
  // i przepięcie (HVRT). Deklaracja projektanta (nie z karty katalogowej). Konsumowane
  // przez most zgodności NC RfG (DerDataForCompliance → NcRfgComplianceChecker).
  has_lvrt_curve: boolean;
  has_hvrt_curve: boolean;
  bess_mode: TrybBess;
  soc_min_percent: number | null;
  soc_max_percent: number | null;
}

export interface BladPolaOze {
  field: string;
  message: string;
}

export const DANE_DOMYSLNE: OzeFormData = {
  source_technology: 'PV',
  connection_variant: 'nn_side',
  placement: 'NEW_FIELD',
  source_name: '',
  new_field_name: '',
  quantity: 1,
  converter_catalog_ref: null,
  apparatus_catalog_ref: null,
  blocking_transformer_ref: null,
  control_mode: 'STALY_COS_PHI',
  cos_phi_target: null,
  qu_slope_pu_per_pu: null,
  qu_deadband_low_pu: null,
  qu_deadband_high_pu: null,
  power_setpoint_mw: null,
  q_min_mvar: null,
  q_max_mvar: null,
  frequency_droop_percent: null,
  lfsm_deadband_hz: null,
  has_lvrt_curve: false,
  has_hvrt_curve: false,
  bess_mode: 'PEAK_SHAVING',
  soc_min_percent: null,
  soc_max_percent: null,
};

function parseQuantity(value: number): number {
  return Math.max(1, Math.trunc(value) || 1);
}

export function maKontekst(kontekst: KontekstOze): boolean {
  return Boolean(kontekst.station_ref?.trim());
}

/** Kandydaci transformatora blokowego = transformatory stacji z szyną nN. */
export function transformatoryBlokowe(
  transformers: readonly TransformatorBlokowy[],
): TransformatorBlokowy[] {
  return transformers.filter((t) => Boolean(t.lv_bus_ref?.trim()));
}

/** Opcje walidacji formularza — tor SN materializowany doborem zamiast istniejącego TR. */
export interface WalidacjaOpcje {
  /** D2: tor DER-SN materializowany z katalogu (der_topology) — nie wymaga istniejącego TR. */
  torSnMaterializowany?: boolean;
}

export function walidujFormularz(
  data: OzeFormData,
  kontekst: KontekstOze,
  opcje: WalidacjaOpcje = {},
): BladPolaOze[] {
  const errors: BladPolaOze[] = [];
  if (!data.converter_catalog_ref?.trim()) {
    errors.push({ field: 'converter_catalog_ref', message: 'Wybierz układ PV/BESS/FW z katalogu.' });
  }
  if (data.connection_variant === 'nn_side') {
    if (!kontekst.bus_nn_ref?.trim()) {
      errors.push({ field: 'bus_nn_ref', message: 'Wskaż szynę nN rozdzielni dla przyłączenia bezpośredniego.' });
    }
    if (data.placement === 'EXISTING_FIELD' && !kontekst.existing_field_ref?.trim()) {
      errors.push({ field: 'existing_field_ref', message: 'Wskaż istniejące pole odpływowe nN.' });
    }
    if (data.placement === 'NEW_FIELD' && !data.apparatus_catalog_ref?.trim()) {
      errors.push({ field: 'apparatus_catalog_ref', message: 'Dobierz aparat nN dla nowego pola źródłowego.' });
    }
  } else if (!opcje.torSnMaterializowany && !data.blocking_transformer_ref?.trim()) {
    // Tor SN materializowany doborem (der_topology) nie potrzebuje istniejącego TR stacji.
    errors.push({ field: 'blocking_transformer_ref', message: 'Wybierz transformator blokowy SN/nN.' });
  }
  const qMin = data.q_min_mvar;
  const qMax = data.q_max_mvar;
  if (qMin !== null && qMax !== null && qMin > qMax) {
    errors.push({ field: 'q_max_mvar', message: 'Zakres mocy biernej: Q min nie może przekraczać Q max.' });
  }
  // V12K-063 (kontrola po code-review): cosφ musi mieścić się w (0; 1] — poza tym zakresem
  // solver zaokrągla wartość (cosφ>1 → 1 = tryb pasywny), więc kontrolka byłaby phantomem.
  if (data.control_mode === 'STALY_COS_PHI' && data.cos_phi_target !== null) {
    if (data.cos_phi_target <= 0 || data.cos_phi_target > 1) {
      errors.push({ field: 'cos_phi_target', message: 'Współczynnik mocy cosφ musi mieścić się w zakresie (0; 1].' });
    }
  }
  // V12K-064: napięciowe pasmo nieczułości Q(U) — dolna granica nie może przekraczać górnej
  // (solver odrzuca low>high). Puste pola przyjmują domyślne 1,0 pu.
  if (data.control_mode === 'Q_OD_U') {
    const dbLow = data.qu_deadband_low_pu ?? 1.0;
    const dbHigh = data.qu_deadband_high_pu ?? 1.0;
    if (dbLow > dbHigh) {
      errors.push({ field: 'qu_deadband_high_pu', message: 'Pasmo Q(U): napięcie dolne nie może przekraczać górnego.' });
    }
  }
  if (data.source_technology === 'BESS') {
    const socMin = data.soc_min_percent;
    const socMax = data.soc_max_percent;
    if (socMin !== null && (socMin < 0 || socMin > 100)) {
      errors.push({ field: 'soc_min_percent', message: 'Stan naładowania SOC min musi mieścić się w 0–100%.' });
    }
    if (socMax !== null && (socMax < 0 || socMax > 100)) {
      errors.push({ field: 'soc_max_percent', message: 'Stan naładowania SOC max musi mieścić się w 0–100%.' });
    }
    if (socMin !== null && socMax !== null && socMin > socMax) {
      errors.push({ field: 'soc_max_percent', message: 'SOC min nie może przekraczać SOC max.' });
    }
  }
  return errors;
}

/** Tabliczka katalogowa falownika → materialized_params (kontrakt solvera). */
export function materializedParams(
  converter: ConverterType,
  power_setpoint_mw: number | null,
): Record<string, unknown> {
  return {
    catalog_item_id: converter.id,
    catalog_item_version: CANONICAL_CATALOG_VERSION,
    sn_mva: converter.sn_mva,
    pmax_mw: converter.pmax_mw,
    un_kv: converter.un_kv,
    qmin_mvar: converter.qmin_mvar ?? null,
    qmax_mvar: converter.qmax_mvar ?? null,
    cosphi_min: converter.cosphi_min ?? null,
    cosphi_max: converter.cosphi_max ?? null,
    e_kwh: converter.e_kwh ?? null,
    power_setpoint_mw,
    ptpiree_certificate_ref: converter.ptpiree_certificate_ref ?? null,
    ptpiree_document_number: converter.ptpiree_document_number ?? null,
    ptpiree_wos_version: converter.ptpiree_wos_version ?? null,
    ptpiree_source_url: converter.ptpiree_source_url ?? null,
  };
}

export function zbudujPayload(
  data: OzeFormData,
  kontekst: KontekstOze,
  converter: ConverterType,
  transformer: TransformatorBlokowy | null,
  derTopology: DerTopologyPayload | null = null,
): Record<string, unknown> {
  const tech = TECHNOLOGIE[data.source_technology];
  const isBlock = data.connection_variant === 'block_transformer';
  // D2: tor SN materializowany doborem (der_topology) — falownik siada na szynie nN
  // producenta materializowanej przez backend; nie wiążemy istniejącego TR/szyny nN stacji.
  const materializowanyTorSn = derTopology != null;
  const quantity = parseQuantity(data.quantity);
  const nominalPowerMw = converter.pmax_mw * quantity;
  const qMin = data.q_min_mvar ?? converter.qmin_mvar ?? null;
  const qMax = data.q_max_mvar ?? converter.qmax_mvar ?? null;
  const pSetpoint = data.power_setpoint_mw ?? nominalPowerMw ?? converter.pmax_mw;
  const targetBusRef = isBlock ? transformer?.lv_bus_ref ?? '' : kontekst.bus_nn_ref ?? '';

  return {
    source_technology: data.source_technology,
    connection_variant: data.connection_variant,
    station_ref: kontekst.station_ref,
    bus_nn_ref: targetBusRef,
    // D2 (ADDYTYWNY): kompletny tor DER-SN z doboru — backend materializuje TR blokowy,
    // kabel SN i dedykowane pole SN (connection_level='sn'); pomija blocking_transformer_ref.
    der_topology: derTopology ?? undefined,
    placement: isBlock ? undefined : data.placement,
    existing_field_ref:
      !isBlock && data.placement === 'EXISTING_FIELD' ? kontekst.existing_field_ref : undefined,
    source_field:
      !isBlock && data.placement === 'NEW_FIELD'
        ? {
            field_name: data.new_field_name.trim() || undefined,
            source_field_kind: tech.fieldKind,
            catalog_binding: normalizeCatalogBinding(data.apparatus_catalog_ref, 'APARAT_NN') ?? undefined,
          }
        : undefined,
    source_name: data.source_name.trim() || tech.defaultName,
    quantity,
    control_mode: data.control_mode,
    // Wartości rządzące trybem Q wysyłane TYLKO dla właściwego trybu (zero fabrykacji:
    // cosφ dla STALY_COS_PHI, nachylenie Q(U) dla Q_OD_U). Backend czyta cos_phi/qu_slope.
    cos_phi:
      data.control_mode === 'STALY_COS_PHI' ? data.cos_phi_target ?? undefined : undefined,
    qu_slope_pu_per_pu:
      data.control_mode === 'Q_OD_U' ? data.qu_slope_pu_per_pu ?? undefined : undefined,
    qu_deadband_low_pu:
      data.control_mode === 'Q_OD_U' ? data.qu_deadband_low_pu ?? undefined : undefined,
    qu_deadband_high_pu:
      data.control_mode === 'Q_OD_U' ? data.qu_deadband_high_pu ?? undefined : undefined,
    power_setpoint_mw: pSetpoint,
    q_min_mvar: qMin,
    q_max_mvar: qMax,
    frequency_droop_percent: data.frequency_droop_percent ?? undefined,
    lfsm_deadband_hz: data.frequency_droop_percent ? data.lfsm_deadband_hz ?? undefined : undefined,
    // V12K-087 (G-OZE-B2): jawne zdolności FRT — wysyłane tylko gdy zadeklarowane
    // (zero fabrykacji: false → undefined, brak flagi w payloadzie).
    has_lvrt_curve: data.has_lvrt_curve ? true : undefined,
    has_hvrt_curve: data.has_hvrt_curve ? true : undefined,
    bess_mode: data.source_technology === 'BESS' ? data.bess_mode : undefined,
    soc_min_percent:
      data.source_technology === 'BESS' ? data.soc_min_percent ?? undefined : undefined,
    soc_max_percent:
      data.source_technology === 'BESS' ? data.soc_max_percent ?? undefined : undefined,
    blocking_transformer_ref:
      isBlock && !materializowanyTorSn ? transformer?.ref_id ?? undefined : undefined,
    catalog_binding:
      normalizeCatalogBinding(data.converter_catalog_ref, converterCatalogNamespace(data.source_technology)) ??
      undefined,
    materialized_params: materializedParams(converter, pSetpoint),
  };
}

/** Sugerowane nastawy (NC RfG / PTPiREE) — podpowiedź, NIE wypełniane automatycznie
 * (uczciwy stan zerowy; wartość wybiera projektant). */
export const SUGEROWANE = {
  cosPhi: 0.95, // ±0.95 typowe wymaganie NC RfG dla modułów typu B/C
  quSlopePuPerPu: 4.0, // nachylenie Q(U) ~2–5 (statyzm napięciowo-jałowy)
  quDeadbandLowPu: 0.95, // dolna granica napięciowego pasma nieczułości Q(U)
  quDeadbandHighPu: 1.05, // górna granica napięciowego pasma nieczułości Q(U)
  pfDroopPercent: 5.0, // statyzm P(f) 5% (typ. 2–12% wg operatora)
  pfDeadbandHz: 0.2, // LFSM-O od 50.2 Hz (pasmo 200 mHz)
  socMinPercent: 10,
  socMaxPercent: 90,
} as const;

/** Tryb Q wybrany, ale bez wartości rządzącej → regulacja pasywna (ostrzeżenie gotowości). */
export function trybQWymagaWartosci(data: OzeFormData): boolean {
  if (data.control_mode === 'STALY_COS_PHI') return data.cos_phi_target === null;
  if (data.control_mode === 'Q_OD_U') return data.qu_slope_pu_per_pu === null;
  return false;
}

/** Etykieta pozycji katalogu falownika. */
export function etykietaKonwertera(item: ConverterType): string {
  return `${item.name} · Un ${item.un_kv} kV · S ${item.sn_mva.toFixed(3)} MVA · Pmax ${item.pmax_mw.toFixed(3)} MW`;
}

// ===========================================================================
// W2b-DANE (POLECENIE_DER_SN_TOPOLOGIA_2026-07): kompletny tor DER po stronie SN.
// Model MAPUJE 1:1 na DerTopologyPayload backendu (zero fabrykacji): każda kontrolka
// odpowiada realnemu polu operacji, które materializuje osobny TR blokowy, kabel SN
// i dedykowane pole źródłowe SN. Render toru w SLD (W2c) poza zakresem tej karty.
// ===========================================================================

export const LV_SWITCHGEAR_OPCJE: ReadonlyArray<{ value: LvSwitchgearVariant; label: string }> = [
  { value: 'none', label: 'Bez rozdzielni producenta (bezpośrednio z falownika)' },
  { value: 'single-bus', label: 'Rozdzielnica jednosekcyjna' },
  { value: 'multi-feeder', label: 'Rozdzielnica z kilkoma odpływami' },
  { value: 'combiner', label: 'Odpływ zbiorczy (combiner)' },
  { value: 'integrated-skid', label: 'Zestaw zintegrowany / stacja kompaktowa' },
];

export const APARAT_POLA_SN_OPCJE: ReadonlyArray<{ value: DerMvSwitchingDevice; label: string }> = [
  { value: 'CB', label: 'Wyłącznik' },
  { value: 'LBS', label: 'Rozłącznik' },
];

// D1 wymaganie 9: jawny „sposób przyłączenia" DER dla toru po stronie SN (z TR blokowym).
// Tor DER-SN zawsze ma connection_level='sn' + has_block_transformer=true, więc oferujemy
// dwa spójne warianty; walidacja spójności zapada w backendzie (der_sn_validation).
export const SPOSOB_PRZYLACZENIA_OPCJE: ReadonlyArray<{ value: DerConnectionMethod; label: string }> = [
  { value: 'der_z_tr_blokowym', label: 'DER z transformatorem blokowym' },
  { value: 'der_przez_rozdzielnie_producenta', label: 'DER przez rozdzielnię producenta' },
];

const LV_SWITCHGEAR_LABEL = new Map(LV_SWITCHGEAR_OPCJE.map((o) => [o.value, o.label]));
const APARAT_POLA_SN_LABEL = new Map(APARAT_POLA_SN_OPCJE.map((o) => [o.value, o.label]));
const SPOSOB_PRZYLACZENIA_LABEL = new Map(SPOSOB_PRZYLACZENIA_OPCJE.map((o) => [o.value, o.label]));

export const lvSwitchgearLabel = (v: LvSwitchgearVariant): string =>
  LV_SWITCHGEAR_LABEL.get(v) ?? '';
export const aparatPolaSnLabel = (v: DerMvSwitchingDevice): string =>
  APARAT_POLA_SN_LABEL.get(v) ?? '';
export const sposobPrzylaczeniaLabel = (v: DerConnectionMethod): string =>
  SPOSOB_PRZYLACZENIA_LABEL.get(v) ?? '';

/** Formularz toru DER-SN — pola 1:1 z DerTopologyPayload (zero pól-widm). */
export interface DerSnFormData {
  connection_method: DerConnectionMethod;
  inverter_output_voltage_kv: number | null;
  has_manufacturer_lv_switchgear: boolean;
  lv_switchgear_variant: LvSwitchgearVariant;
  block_transformer_catalog_ref: string | null;
  block_transformer_rated_power_mva: number | null;
  block_transformer_primary_voltage_kv: number | null;
  block_transformer_secondary_voltage_kv: number | null;
  /** D3 wym. 7: układ połączeń TR blokowego — parametr modelu spójny z typem katalogu. */
  block_transformer_vector_group: string | null;
  mv_switching_device: DerMvSwitchingDevice;
  mv_ct: boolean;
  mv_vt: boolean;
  mv_earthing_switch: boolean;
  mv_surge_arrester: boolean;
  mv_protection_relay: boolean;
  mv_cable_head: boolean;
  mv_field_apparatus_catalog_ref: string | null;
  mv_field_name: string | null;
  mv_cable_catalog_ref: string | null;
  mv_cable_length_km: number | null;
}

export const DANE_DER_SN_DOMYSLNE: DerSnFormData = {
  connection_method: 'der_z_tr_blokowym',
  inverter_output_voltage_kv: null,
  has_manufacturer_lv_switchgear: true,
  lv_switchgear_variant: 'multi-feeder',
  block_transformer_catalog_ref: null,
  block_transformer_rated_power_mva: null,
  block_transformer_primary_voltage_kv: null,
  block_transformer_secondary_voltage_kv: null,
  block_transformer_vector_group: null,
  mv_switching_device: 'CB',
  mv_ct: true,
  mv_vt: false,
  mv_earthing_switch: true,
  mv_surge_arrester: false,
  mv_protection_relay: true,
  mv_cable_head: true,
  mv_field_apparatus_catalog_ref: null,
  mv_field_name: null,
  mv_cable_catalog_ref: null,
  mv_cable_length_km: null,
};

/**
 * Podpowiedź napięcia wyjściowego falownika = Un katalogu falownika (uczciwy stan
 * zerowy: projektant potwierdza). Napięcie strony wtórnej TR blokowego = wyjście
 * falownika, strony pierwotnej = napięcie szyny SN stacji.
 */
export function sugerujDerSn(
  data: DerSnFormData,
  converter: ConverterType | null,
  mvBusVoltageKv: number | null,
): DerSnFormData {
  const inverterKv = data.inverter_output_voltage_kv ?? converter?.un_kv ?? null;
  return {
    ...data,
    inverter_output_voltage_kv: inverterKv,
    block_transformer_secondary_voltage_kv:
      data.block_transformer_secondary_voltage_kv ?? inverterKv,
    block_transformer_primary_voltage_kv:
      data.block_transformer_primary_voltage_kv ?? mvBusVoltageKv,
  };
}

/** Walidacja toru DER-SN — braki blokujące (każde pole realnie konsumowane przez backend). */
export function walidujDerSn(data: DerSnFormData): BladPolaOze[] {
  const errors: BladPolaOze[] = [];
  if (!data.block_transformer_catalog_ref?.trim()) {
    errors.push({
      field: 'block_transformer_catalog_ref',
      message: 'Wybierz transformator blokowy SN/nN z katalogu.',
    });
  }
  if (!data.mv_field_apparatus_catalog_ref?.trim()) {
    errors.push({
      field: 'mv_field_apparatus_catalog_ref',
      message: 'Dobierz aparat główny dedykowanego pola źródłowego SN.',
    });
  }
  if (!data.mv_cable_catalog_ref?.trim()) {
    errors.push({
      field: 'mv_cable_catalog_ref',
      message: 'Wybierz kabel SN odcinka przyłączeniowego z katalogu.',
    });
  }
  if (data.inverter_output_voltage_kv === null || data.inverter_output_voltage_kv <= 0) {
    errors.push({
      field: 'inverter_output_voltage_kv',
      message: 'Podaj napięcie wyjściowe falownika / strony nN producenta.',
    });
  }
  const lv = data.block_transformer_secondary_voltage_kv;
  const inv = data.inverter_output_voltage_kv;
  if (lv !== null && inv !== null && Math.abs(lv - inv) > 1e-6) {
    errors.push({
      field: 'block_transformer_secondary_voltage_kv',
      message: 'Strona nN transformatora blokowego musi być zgodna z wyjściem falownika.',
    });
  }
  if (data.mv_cable_length_km !== null && data.mv_cable_length_km <= 0) {
    errors.push({
      field: 'mv_cable_length_km',
      message: 'Długość kabla przyłączeniowego musi być większa od zera.',
    });
  }
  // D1 wymaganie 9: wczesne ostrzeżenie spójności sposobu przyłączenia (decyzja w backendzie —
  // zero dublowania logiki liczbowej; to kontrola STRUKTURALNA enum↔pola, nie napięć/mocy).
  if (
    data.connection_method === 'der_przez_rozdzielnie_producenta' &&
    !data.has_manufacturer_lv_switchgear
  ) {
    errors.push({
      field: 'connection_method',
      message:
        'Sposób przyłączenia „DER przez rozdzielnię producenta” wymaga rozdzielni nN producenta.',
    });
  }
  return errors;
}

/**
 * Zbuduj `der_topology` (connection_level='sn') z formularza — 1:1 na kontrakt backendu.
 * `mvBusRef` = szyna SN stacji, do której przypina się dedykowane pole źródłowe SN.
 * Aparaty pierwotne pola wynikają z przełączników (ct/vt/uziemnik/SA/głowica) — backend
 * materializuje je wg tej konfiguracji (odznaczenie realnie usuwa aparat, nie phantom).
 */
export function zbudujDerTopology(data: DerSnFormData, mvBusRef: string): DerTopologyPayload {
  return {
    connection_level: 'sn',
    connection_method: data.connection_method,
    inverter_output_voltage_kv: data.inverter_output_voltage_kv,
    has_manufacturer_lv_switchgear: data.has_manufacturer_lv_switchgear,
    lv_switchgear_variant: data.lv_switchgear_variant,
    has_block_transformer: true,
    block_transformer: {
      rated_power_mva: data.block_transformer_rated_power_mva,
      primary_voltage_kv: data.block_transformer_primary_voltage_kv,
      secondary_voltage_kv: data.block_transformer_secondary_voltage_kv,
      uk_percent: null,
      // D3 wym. 7: grupa z wyboru projektanta idzie w payload; backend waliduje spójność
      // z typem katalogowym (converter.der_sn.grupa_polaczen_niezgodna_z_katalogiem).
      vector_group: data.block_transformer_vector_group,
      catalog_ref: data.block_transformer_catalog_ref,
      catalog_binding: normalizeCatalogBinding(
        data.block_transformer_catalog_ref,
        'TRAFO_SN_NN',
      ),
    },
    has_dedicated_mv_field: true,
    mv_field_configuration: {
      switching_device: data.mv_switching_device,
      ct: data.mv_ct,
      vt: data.mv_vt,
      earthing_switch: data.mv_earthing_switch,
      surge_arrester: data.mv_surge_arrester,
      protection_relay: data.mv_protection_relay,
      cable_head: data.mv_cable_head,
      field_name: data.mv_field_name?.trim() || null,
      bay_template_ref: null,
      apparatus_catalog_binding: normalizeCatalogBinding(
        data.mv_field_apparatus_catalog_ref,
        'APARAT_SN',
      ),
      cable_catalog_ref: data.mv_cable_catalog_ref,
      cable_catalog_binding: normalizeCatalogBinding(data.mv_cable_catalog_ref, 'KABEL_SN'),
      cable_length_km: data.mv_cable_length_km,
    },
    mv_bus_ref: mvBusRef,
  };
}
