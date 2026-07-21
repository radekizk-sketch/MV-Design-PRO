/**
 * Model kreatora „Dodaj stację SN/nN" (Audyt D, faza D2 — rdzeń).
 *
 * Katalog-first (TRAFO_SN_NN); dobór transformatora po napięciu SN szyny i
 * napięciu nN odbioru — porównanie napięć katalogowych, ZERO fizyki w UI.
 * Umiejscowienie stacji (koniec odcinka vs świadomy podział) pochodzi z
 * kontekstu operacji, nie z domysłu UI. Zapis = realna operacja domenowa
 * `append_station_on_endpoint` (koniec) lub `insert_station_on_segment_sn`
 * (podział). Semantyka podziału backendu pozostaje NIETKNIĘTA.
 *
 * Zakres D2: typ stacji + umiejscowienie + transformator + minimalny blok nN
 * (LOAD_NN). Rozdzielnica SN i pełny blok nN/PV = fazy D3/D4.
 */

import { normalizeCatalogBinding } from '../../../ui/network-build/forms/catalogPayload';
import {
  SN_FIELD_ROLE_TO_BAY_KIND,
  buildDefaultSnFields,
  buildStationSnFields as buildStationSnFieldsHelper,
  compareStationNnSourceConverters,
  compareTransformersForSourcePower,
  findTemplateForRole,
  isCompleteSourceStatus,
  isStationNnSourceConverter,
  isUsableManufacturer,
  isUsableSwitchgearFamily,
  orderManufacturers,
  sourceFeederRole,
  sourceProtectionIntent,
  templateOptionsForRole,
  voltageMatches,
} from '../../../ui/network-build/forms/InsertStationFormHelpers';
import type {
  NnConfiguration,
  SnFieldRole,
  SourceProtectionIntent,
  StationSnFieldTemplate,
  StationSwitchgearChoice,
  TopologicalStationKind,
} from '../../../ui/network-build/forms/InsertStationFormHelpers';
import type { CompleteMvBayTemplateSummary } from '../../../ui/catalog/BayTemplatePicker';
import type { CatalogNamespace, ConverterType } from '../../../ui/catalog/types';
import type { Manufacturer } from '../../../ui/catalog/manufacturer';
import type { SwitchgearFamily } from '../../../ui/catalog/SwitchgearFamilyPicker';
import type { TransformerType } from '../../../ui/catalog/types';

export type { SnFieldRole, StationSnFieldTemplate } from '../../../ui/network-build/forms/InsertStationFormHelpers';

export type { SourceProtectionIntent } from '../../../ui/network-build/forms/InsertStationFormHelpers';
export type { ConverterType } from '../../../ui/catalog/types';

/** Typ stacji SN/nN (semantyczny — backend akceptuje 1:1). */
export type TypStacji = 'terminal' | 'branch' | 'inline' | 'sectional';

/**
 * Konfiguracja strony nN stacji — PEŁNY parytet z legacy `InsertStationForm`
 * i kontraktem operacji (`domain_operations.py` blok nN + `source_kind_map`):
 * `LOAD_NN` — rozdzielnia nN odbiorcza; `CUSTOM_NN` — odbiorcza z jawnie
 * wybranym napięciem strony nN; `PV_INVERTER`/`BESS_INVERTER`/`FW_INVERTER` —
 * źródło (PV / magazyn BESS / elektrownia wiatrowa) za transformatorem, gdzie
 * falownik z katalogu wyznacza napięcie strony nN i moc źródła. Typ reużyty z
 * helperów legacy (jedno źródło prawdy dla wariantów).
 */
export type { NnConfiguration } from '../../../ui/network-build/forms/InsertStationFormHelpers';

/** Tryb umiejscowienia stacji względem topologii magistrali. */
export type TrybUmiejscowienia = 'ENDPOINT_APPEND' | 'SPLIT';

/** Tolerancje zgodności napięć katalogowych (kV) — parytet z legacy. */
const SN_VOLTAGE_TOLERANCE_KV = 0.01;
const NN_VOLTAGE_TOLERANCE_KV = 0.001;

/** Standardowe napięcia nN odbioru [kV] (wariant LOAD_NN). */
export const NAPIECIA_NN_KV = [0.4, 0.69] as const;
/**
 * Rozszerzona lista napięć strony nN [kV] dla wariantu CUSTOM_NN — parytet z
 * legacy `NN_VOLTAGE_OPTIONS_KV` (0,4–6,3 kV). Projektant wybiera jawnie.
 */
export const NAPIECIA_NN_CUSTOM_KV = [0.4, 0.5, 0.69, 0.8, 1, 3.15, 6, 6.3] as const;
export const DOMYSLNE_NAPIECIE_NN_KV = 0.4;
export const DOMYSLNA_LICZBA_ODPLYWOW_NN = 2;

/** Układ sieci nN (uziemienie) — kontrakt operacji `nn_earthing.lv_system`. */
export type UkladSieciNn = 'TN-S' | 'TN-C-S' | 'TN-C' | 'TT' | 'IT';
/** Typ pracy punktu neutralnego — kontrakt `enm.models.GroundingConfig.type`. */
export type PunktNeutralny =
  | 'directly_grounded'
  | 'resistor_grounded'
  | 'petersen_coil'
  | 'isolated';

export interface StacjaFormData {
  station_type: TypStacji;
  station_name: string;
  /** Konfiguracja strony nN (odbiorcza vs źródło PV za transformatorem). */
  nn_configuration: NnConfiguration;
  /** Układ sieci nN (uziemienie) — G-STK-1. */
  nn_earthing_system: UkladSieciNn;
  /** Typ pracy punktu neutralnego transformatora (strona nN) — G-STK-1. */
  neutral_point: PunktNeutralny;
  /** Rezystancja uziemienia punktu neutralnego [Ω] — tekst PL (przecinek). */
  neutral_r_ohm: string;
  /** Napięcie nN odbioru [kV] — steruje doborem transformatora (LOAD_NN). */
  nn_voltage_kv: number;
  /** Referencja katalogowa falownika PV (tylko dla PV_INVERTER). */
  source_converter_ref: string | null;
  catalog_ref: string | null;
  /** Liczba odpływów nN odbiorczych (minimalny blok nN). */
  outgoing_feeders_nn_count: number;
  /** Producent rozdzielnicy SN (referencja katalogowa). */
  manufacturer_ref: string;
  /** Rodzina rozdzielnicy SN wybranego producenta (opcjonalna). */
  switchgear_family_ref: string | null;
  /** Ręczny wybór szablonu pola per rola (nadpisuje dobór automatyczny). */
  bay_template_refs: Partial<Record<SnFieldRole, string>>;
  /** Moc potrzeb własnych stacji [kW] — tekst PL; puste = brak odbioru (G-STK-3). */
  station_auxiliary_kw: string;
  /** cosφ potrzeb własnych — tekst PL; steruje mocą bierną odbioru. */
  station_auxiliary_cosphi: string;
  /** Liczba równoległych transformatorów w polu (1 = pojedynczy) — G-STK-6. */
  transformer_units: number;
}

export interface BladPola {
  field: string;
  message: string;
}

export const DANE_DOMYSLNE: StacjaFormData = {
  station_type: 'branch',
  station_name: '',
  nn_configuration: 'LOAD_NN',
  // Domyślnie TN-C-S z bezpośrednio uziemionym punktem neutralnym — typowy układ
  // dystrybucyjny nN (PN-HD 60364). Projektant zmienia świadomie.
  nn_earthing_system: 'TN-C-S',
  neutral_point: 'directly_grounded',
  neutral_r_ohm: '',
  nn_voltage_kv: DOMYSLNE_NAPIECIE_NN_KV,
  source_converter_ref: null,
  catalog_ref: null,
  outgoing_feeders_nn_count: DOMYSLNA_LICZBA_ODPLYWOW_NN,
  manufacturer_ref: '',
  switchgear_family_ref: null,
  bay_template_refs: {},
  station_auxiliary_kw: '',
  station_auxiliary_cosphi: '0,95',
  transformer_units: 1,
};

/**
 * Kontekst operacji (znormalizowany z payloadu operacji). Rozstrzyga tryb
 * umiejscowienia i referencje topologiczne. `segmentId` i `snVoltageKv`
 * rozwiązuje komponent ze snapshotu (helpery legacy), bo wymagają modelu.
 */
export interface KontekstStacji {
  tryb: TrybUmiejscowienia;
  endpointBusRef: string;
  runRef: string;
  segmentId: string;
  positionOnSegment: number;
  snVoltageKv: number;
  stationName: string;
  stationKind: TypStacji;
}

const TYPY_STACJI: readonly TypStacji[] = ['terminal', 'branch', 'inline', 'sectional'];

/** Normalizuje typ stacji z kontekstu do wariantu obsługiwanego przez D2. */
export function normalizujTypStacji(raw: unknown): TypStacji {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if ((TYPY_STACJI as readonly string[]).includes(value)) {
    return value as TypStacji;
  }
  // Mapowanie legacy A/B/C/D + mv_lv → semantyczny wariant.
  if (value === 'a' || value === 'mv_lv') return 'terminal';
  if (value === 'b') return 'inline';
  if (value === 'd') return 'sectional';
  if (value === 'c') return 'branch';
  return 'branch';
}

/**
 * Wyznacza tryb umiejscowienia: koniec odcinka (append) vs świadomy podział
 * (insert). Parytet z legacy: append gdy jawny ENDPOINT_APPEND lub pozycja na
 * końcu segmentu (>= 0.999) i znany terminal.
 */
export function wyznaczTryb(
  placementMode: string,
  endpointBusRef: string,
  positionOnSegment: number,
): TrybUmiejscowienia {
  const mode = placementMode.toUpperCase();
  const naKoncu = mode === 'ENDPOINT_APPEND' || positionOnSegment >= 0.999;
  return endpointBusRef && naKoncu ? 'ENDPOINT_APPEND' : 'SPLIT';
}

/** Czy zlecenie to zakończenie odcinka stacją (append). */
export function czyKoniecOdcinka(kontekst: KontekstStacji): boolean {
  return kontekst.tryb === 'ENDPOINT_APPEND';
}

/** Nazwa realnej operacji domenowej dla danego trybu. */
export function nazwaOperacji(kontekst: KontekstStacji): string {
  return czyKoniecOdcinka(kontekst)
    ? 'append_station_on_endpoint'
    : 'insert_station_on_segment_sn';
}

/** Czy kontekst pozwala umieścić stację (terminal dla append / segment dla split). */
export function kontekstKompletny(kontekst: KontekstStacji): boolean {
  return czyKoniecOdcinka(kontekst)
    ? Boolean(kontekst.endpointBusRef)
    : Boolean(kontekst.segmentId);
}

/** Ogranicza liczbę odpływów nN do sensownego zakresu (1..8). */
export function ogranicznikOdplywow(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(8, Math.trunc(value)));
}

export function walidujFormularz(
  data: StacjaFormData,
  snFields?: readonly StationSnFieldTemplate[],
): BladPola[] {
  const errors: BladPola[] = [];
  if (!data.catalog_ref?.trim()) {
    errors.push({ field: 'catalog_ref', message: 'Wybierz typ transformatora z katalogu.' });
  }
  if (!(Number.isFinite(data.nn_voltage_kv) && data.nn_voltage_kv > 0)) {
    errors.push({ field: 'nn_voltage_kv', message: 'Podaj napięcie nN odbioru większe od zera.' });
  }
  if (ogranicznikOdplywow(data.outgoing_feeders_nn_count) < 1) {
    errors.push({
      field: 'outgoing_feeders_nn_count',
      message: 'Stacja wymaga co najmniej jednego odpływu nN.',
    });
  }
  if (czyZrodloNn(data.nn_configuration) && !data.source_converter_ref?.trim()) {
    errors.push({
      field: 'source_converter_ref',
      message: 'Wybierz falownik źródła z katalogu — napięcie strony nN wynika z jego strony nN.',
    });
  }
  if (!data.manufacturer_ref?.trim()) {
    errors.push({ field: 'manufacturer_ref', message: 'Wybierz producenta rozdzielnicy SN.' });
  }
  if (snFields !== undefined && !czyRozdzielnicaKompletna(snFields)) {
    errors.push({
      field: 'sn_fields',
      message: 'Dobierz kompletny szablon rozdzielnicy SN dla każdego pola stacji.',
    });
  }
  return errors;
}

/**
 * Dobór transformatorów zgodnych z napięciem SN szyny i wymaganym napięciem
 * strony nN. Wyłącznie porównanie napięć katalogowych — ZERO fizyki. Gdy podano
 * moc źródła nN (PV), sort preferuje typy o wystarczającej mocy (parytet legacy,
 * reużycie `compareTransformersForSourcePower`); w przeciwnym razie sort rosnąco
 * po mocy znamionowej (stabilny, deterministyczny porządek doboru).
 */
export function doborTransformatorow(
  typy: readonly TransformerType[],
  snVoltageKv: number,
  nnVoltageKv: number,
  sourcePowerMva: number | null = null,
): TransformerType[] {
  const zgodne = typy.filter(
    (t) =>
      voltageMatches(t.voltage_hv_kv, snVoltageKv, SN_VOLTAGE_TOLERANCE_KV)
      && voltageMatches(t.voltage_lv_kv, nnVoltageKv, NN_VOLTAGE_TOLERANCE_KV),
  );
  if (sourcePowerMva != null) {
    return zgodne.sort(compareTransformersForSourcePower(sourcePowerMva));
  }
  return zgodne.sort((a, b) => a.rated_power_mva - b.rated_power_mva || a.id.localeCompare(b.id));
}

// ------------------------------------------------------ Blok nN / źródło za trafo

/**
 * Rodzaj falownika (katalog) wymagany przez wariant źródłowy nN — parytet z
 * legacy `NN_CONFIGURATION_OPTIONS.converterKind`: PV→`PV`, BESS→`BESS`,
 * FW→`WIND`. Warianty odbiorcze (LOAD_NN/CUSTOM_NN) nie mają falownika (`null`).
 */
export function rodzajFalownika(config: NnConfiguration): ConverterType['kind'] | null {
  switch (config) {
    case 'PV_INVERTER':
      return 'PV';
    case 'BESS_INVERTER':
      return 'BESS';
    case 'FW_INVERTER':
      return 'WIND';
    case 'LOAD_NN':
    case 'CUSTOM_NN':
    default:
      return null;
  }
}

/** Czy wariant nN to źródło za transformatorem (falownik z katalogu). */
export function czyZrodloNn(config: NnConfiguration): boolean {
  return rodzajFalownika(config) !== null;
}

/**
 * Falowniki zdatne na źródło nN stacji dla danego wariantu: filtr rodzaju
 * (PV/BESS/WIND wg `rodzajFalownika`) i napięcia strony nN (≤ 1 kV, reużycie
 * `isStationNnSourceConverter`), sort deterministyczny wg bliskości do napięcia
 * odbioru (reużycie `compareStationNnSourceConverters`). ZERO fizyki.
 */
export function falownikiZrodla(
  converters: readonly ConverterType[],
  config: NnConfiguration,
): ConverterType[] {
  const kind = rodzajFalownika(config);
  if (!kind) return [];
  return converters
    .filter((c) => c.kind === kind && isStationNnSourceConverter(c))
    .sort(compareStationNnSourceConverters);
}

/** Falowniki PV — wariant źródłowy PV (reużycie `falownikiZrodla`). */
export function falownikiPv(converters: readonly ConverterType[]): ConverterType[] {
  return falownikiZrodla(converters, 'PV_INVERTER');
}

/** Wybrany falownik z listy zdatnych (odczyt katalogu). */
export function konwerterZKatalogu(
  ref: string | null,
  converters: readonly ConverterType[],
): ConverterType | null {
  if (!ref) return null;
  return converters.find((c) => c.id === ref) ?? null;
}

/**
 * Wymagane napięcie strony nN stacji: dla wariantów źródłowych (PV/BESS/FW) z
 * katalogu falownika (bez domysłu — `null`, gdy brak wyboru), dla odbioru
 * (LOAD_NN/CUSTOM_NN) z wyboru napięcia nN.
 */
export function wymaganeNapiecieNn(
  data: StacjaFormData,
  konwerter: ConverterType | null,
): number | null {
  if (czyZrodloNn(data.nn_configuration)) {
    return konwerter?.un_kv ?? null;
  }
  return data.nn_voltage_kv;
}

/** Moc źródła nN [MVA] do doboru transformatora (PV/BESS/FW: z katalogu falownika). */
export function mocZrodlaNnMva(
  data: StacjaFormData,
  konwerter: ConverterType | null,
): number | null {
  return czyZrodloNn(data.nn_configuration) ? konwerter?.sn_mva ?? null : null;
}

/** Intencja zabezpieczenia źródła nN (reużycie legacy) — obecnie tylko dla PV. */
export function zabezpieczenieZrodla(
  data: StacjaFormData,
): SourceProtectionIntent | undefined {
  return sourceProtectionIntent(data.nn_configuration);
}

/**
 * Przestrzeń nazw wiązania katalogowego falownika w polu źródłowym nN — parytet
 * 1:1 z legacy `InsertStationForm`: PV→`ZRODLO_NN_PV`, BESS→`ZRODLO_NN_BESS`,
 * pozostałe źródła (FW)→`CONVERTER`.
 */
export function namespaceZrodlaNn(config: NnConfiguration): CatalogNamespace {
  if (config === 'PV_INVERTER') return 'ZRODLO_NN_PV';
  if (config === 'BESS_INVERTER') return 'ZRODLO_NN_BESS';
  return 'CONVERTER';
}

/** Parametry wybranego typu (odczyt z katalogu). */
export interface ParametryTransformatora {
  rated_power_mva: number;
  voltage_hv_kv: number;
  voltage_lv_kv: number;
  uk_percent: number;
}

export function parametryZKatalogu(
  catalogRef: string | null,
  typy: readonly TransformerType[],
): ParametryTransformatora | null {
  if (!catalogRef) return null;
  const it = typy.find((t) => t.id === catalogRef);
  if (!it) return null;
  return {
    rated_power_mva: it.rated_power_mva,
    voltage_hv_kv: it.voltage_hv_kv,
    voltage_lv_kv: it.voltage_lv_kv,
    uk_percent: it.uk_percent,
  };
}

// ------------------------------------------------------ Rozdzielnica SN

/**
 * Role pól rozdzielnicy SN dla danego typu stacji — reużycie definicji legacy
 * (`buildDefaultSnFields`), bez duplikacji. Odbiorcza: WE + WY + ODG + TR;
 * przelotowa: WE + WY + TR; sekcyjna: WE + WY + SPRZĘGŁO + TR.
 */
export function rolePolaStacji(stationType: TypStacji): SnFieldRole[] {
  return buildDefaultSnFields(stationType as TopologicalStationKind).map((f) => f.field_role);
}

/** Kompletne szablony pól SN dla wybranego producenta/rodziny (filtr niekompletnych). */
export function szablonyDlaWyboru(
  templates: readonly CompleteMvBayTemplateSummary[],
  manufacturerRef: string,
  familyRef: string | null,
): CompleteMvBayTemplateSummary[] {
  return templates.filter((t) => {
    const producentZgodny = t.manufacturer_ref == null || t.manufacturer_ref === manufacturerRef;
    const rodzinaZgodna =
      !familyRef || t.switchgear_family_ref == null || t.switchgear_family_ref === familyRef;
    return producentZgodny && rodzinaZgodna && isCompleteSourceStatus(t.source_status);
  });
}

/** Kompletne opcje szablonów pola dla roli (posortowane, tylko repo_verified/kompletne). */
export function opcjeSzablonowRoli(
  templates: readonly CompleteMvBayTemplateSummary[],
  role: SnFieldRole,
): CompleteMvBayTemplateSummary[] {
  return templateOptionsForRole([...templates], role, SN_FIELD_ROLE_TO_BAY_KIND);
}

/**
 * Dobiera szablon per rola: ręczny wybór (jeśli nadal dostępny) albo najlepszy
 * kompletny szablon dla roli. Reużycie `templateOptionsForRole`/`findTemplateForRole`.
 */
export function szablonyPerRola(
  templatesForSwitchgear: readonly CompleteMvBayTemplateSummary[],
  stationType: TypStacji,
  selectedRefs: Partial<Record<SnFieldRole, string>>,
): Partial<Record<SnFieldRole, CompleteMvBayTemplateSummary>> {
  const arr = [...templatesForSwitchgear];
  const byRole: Partial<Record<SnFieldRole, CompleteMvBayTemplateSummary>> = {};
  for (const role of rolePolaStacji(stationType)) {
    const opcje = templateOptionsForRole(arr, role, SN_FIELD_ROLE_TO_BAY_KIND);
    const wybrany = opcje.find((t) => t.template_ref === selectedRefs[role]);
    const chosen = wybrany ?? findTemplateForRole(arr, role, SN_FIELD_ROLE_TO_BAY_KIND) ?? undefined;
    if (chosen) byRole[role] = chosen;
  }
  return byRole;
}

/** Buduje szablony pól SN stacji (reużycie helpera legacy, bez duplikacji logiki). */
export function zbudujPolaSn(
  stationType: TypStacji,
  templatesByRole: Partial<Record<SnFieldRole, CompleteMvBayTemplateSummary>>,
  choice: StationSwitchgearChoice,
): StationSnFieldTemplate[] {
  return buildStationSnFieldsHelper(
    stationType as TopologicalStationKind,
    templatesByRole,
    choice,
    SN_FIELD_ROLE_TO_BAY_KIND,
  );
}

/** Czy rozdzielnica kompletna: każde pole ma kompletny szablon katalogowy. */
export function czyRozdzielnicaKompletna(snFields: readonly StationSnFieldTemplate[]): boolean {
  return (
    snFields.length > 0
    && snFields.every((f) => Boolean(f.bay_template_ref) && isCompleteSourceStatus(f.source_status))
  );
}

/** Producenci używalni w konfiguratorze (kolejność katalogowa, tylko kompletni). */
export function producenciUzywalni(manufacturers: readonly Manufacturer[]): Manufacturer[] {
  return orderManufacturers([...manufacturers]).filter(isUsableManufacturer);
}

/** Rodziny rozdzielnicy zgodne z producentem i napięciem SN szyny (parytet legacy). */
export function rodzinyDlaProducenta(
  families: readonly SwitchgearFamily[],
  manufacturerRef: string,
  snVoltageKv: number,
): SwitchgearFamily[] {
  return families
    .filter((f) => f.manufacturer_ref === manufacturerRef)
    .filter(isUsableSwitchgearFamily)
    .filter(
      (f) =>
        f.voltage_levels.length === 0
        || f.voltage_levels.some((v) => voltageMatches(v, snVoltageKv, 0.5)),
    )
    .sort(
      (a, b) =>
        a.family_name.localeCompare(b.family_name, 'pl-PL')
        || a.switchgear_family_ref.localeCompare(b.switchgear_family_ref),
    );
}

/** Wybór rozdzielnicy przekazywany do payloadu (referencje + nazwy + pola). */
export interface WyborRozdzielnicy {
  manufacturerRef: string;
  manufacturerName: string | null;
  familyRef: string | null;
  familyName: string | null;
  snFields: readonly StationSnFieldTemplate[];
}

/** Punkty neutralne impedancyjne — dla nich R jest istotne (rezystor/cewka). */
const PUNKTY_IMPEDANCYJNE: ReadonlySet<PunktNeutralny> = new Set([
  'resistor_grounded',
  'petersen_coil',
]);

/** Parsuje dodatnią liczbę z przecinkiem PL; `null` gdy puste/nieliczbowe/≤0. */
function liczbaDodatniaPL(surowy: string): number | null {
  const tekst = surowy.trim();
  if (tekst === '') return null;
  const liczba = Number(tekst.replace(',', '.'));
  return Number.isFinite(liczba) && liczba > 0 ? liczba : null;
}

/**
 * Buduje blok `station_auxiliary` (G-STK-3): odbiór potrzeb własnych stacji.
 * Tylko gdy moc > 0. cosφ opcjonalny (backend wyprowadza Q). ZERO fizyki w UI —
 * moc bierną liczy backend z cosφ (parytet add_nn_load).
 */
function blokPotrzebWlasnych(data: StacjaFormData): Record<string, unknown> | null {
  const p = liczbaDodatniaPL(data.station_auxiliary_kw);
  if (p === null) return null;
  const blok: Record<string, unknown> = { active_power_kw: p };
  const cosphi = liczbaDodatniaPL(data.station_auxiliary_cosphi);
  if (cosphi !== null && cosphi <= 1) blok.cos_phi = cosphi;
  return blok;
}

/**
 * Buduje blok `nn_earthing` (G-STK-1): układ sieci nN + typ pracy punktu
 * neutralnego + opcjonalna rezystancja uziemienia (tylko dla wariantów
 * impedancyjnych). Mapuje 1:1 na kontrakt operacji (`GroundingConfig.type` +
 * `lv_system`); R spływa jako `lv_r_ohm`. ZERO fabrykacji: R tylko gdy podane.
 */
function blokUziemienia(data: StacjaFormData): Record<string, unknown> | null {
  const blok: Record<string, unknown> = {
    lv_system: data.nn_earthing_system,
    neutral_point: data.neutral_point,
  };
  if (PUNKTY_IMPEDANCYJNE.has(data.neutral_point)) {
    const r = liczbaDodatniaPL(data.neutral_r_ohm);
    if (r !== null) blok.lv_r_ohm = r;
  }
  return blok;
}

/**
 * Buduje payload realnej operacji domenowej. Wspólny blok (stacja/transformator/
 * blok nN/opcje) + warianty umiejscowienia. Mapuje wyłącznie pola realnie
 * przyjmowane przez operacje `append_station_on_endpoint` /
 * `insert_station_on_segment_sn` (bez fabrykacji).
 */
export function zbudujPayload(
  data: StacjaFormData,
  kontekst: KontekstStacji,
  rozdzielnica: WyborRozdzielnicy,
  konwerter: ConverterType | null = null,
): Record<string, unknown> {
  const nazwa = data.station_name.trim() || kontekst.stationName.trim();
  const transformerBinding = normalizeCatalogBinding(data.catalog_ref, 'TRAFO_SN_NN');
  const catalogItemId = data.catalog_ref?.trim() ?? '';
  const feederCount = ogranicznikOdplywow(data.outgoing_feeders_nn_count);
  const isZrodlo = czyZrodloNn(data.nn_configuration);
  const nnVoltage = isZrodlo ? konwerter?.un_kv ?? data.nn_voltage_kv : data.nn_voltage_kv;
  const protection = zabezpieczenieZrodla(data);

  // Lista odpływów nN: odpływy odbiorcze + (dla źródła) pole źródłowe falownika.
  const feeders: Record<string, unknown>[] = Array.from({ length: feederCount }, () => ({
    feeder_role: 'ODPLYW_NN',
    catalog_bindings: null,
  }));
  if (isZrodlo && konwerter) {
    const feederRole = sourceFeederRole(data.nn_configuration);
    feeders.push({
      feeder_role: feederRole,
      catalog_bindings: {
        source_converter: normalizeCatalogBinding(
          konwerter.id,
          namespaceZrodlaNn(data.nn_configuration),
        ),
      },
      ...(protection ? { protection } : {}),
    });
  }

  const nnBlock: Record<string, unknown> = {
    create_nn_bus: true,
    main_breaker_nn: true,
    nn_configuration: data.nn_configuration,
    outgoing_feeders_nn_count: feeders.length,
    outgoing_feeders_nn: feeders,
  };
  if (isZrodlo && konwerter) {
    nnBlock.source_converter_catalog_ref = konwerter.id;
    nnBlock.source_converter_name = konwerter.name;
    nnBlock.source_converter_kind = konwerter.kind;
    nnBlock.source_converter_un_kv = konwerter.un_kv;
    nnBlock.source_converter_sn_mva = konwerter.sn_mva;
    nnBlock.source_converter_pmax_mw = konwerter.pmax_mw;
    if (protection) nnBlock.source_protection = protection;
  }

  const nnEarthing = blokUziemienia(data);
  const auxiliary = blokPotrzebWlasnych(data);

  const commonPayload: Record<string, unknown> = {
    ...(nazwa ? { name: nazwa } : {}),
    station_type: data.station_type,
    ...(nnEarthing ? { nn_earthing: nnEarthing } : {}),
    ...(auxiliary ? { station_auxiliary: auxiliary } : {}),
    station: {
      station_type: data.station_type,
      station_role: 'STACJA_SN_NN',
      ...(nazwa ? { station_name: nazwa } : {}),
      // Napięcie SN tylko gdy znane z rzeczywistej szyny (>0). Nieznane →
      // pomijamy, backend ustala z szyny odcinka/terminala (jedno źródło prawdy,
      // zero fabrykacji — P2/P3).
      ...(kontekst.snVoltageKv > 0 ? { sn_voltage_kv: kontekst.snVoltageKv } : {}),
      nn_voltage_kv: nnVoltage,
      switchgear: {
        manufacturer_ref: rozdzielnica.manufacturerRef,
        manufacturer_name: rozdzielnica.manufacturerName,
        switchgear_family_ref: rozdzielnica.familyRef,
        switchgear_family_name: rozdzielnica.familyName,
      },
    },
    sn_fields: rozdzielnica.snFields,
    transformer: {
      create: true,
      transformer_catalog_ref: catalogItemId,
      ...(transformerBinding ? { catalog_binding: transformerBinding } : {}),
      model_type: 'DWU_UZWOJENIOWY',
      // Praca równoległa: n_parallel tylko dla ≥2 (pojedynczy → pominięte, G-STK-6).
      ...(data.transformer_units > 1 ? { n_parallel: data.transformer_units } : {}),
    },
    nn_block: nnBlock,
    options: {
      create_transformer_field: true,
      create_default_fields: true,
      create_nn_bus: true,
    },
  };

  if (czyKoniecOdcinka(kontekst)) {
    return {
      ...commonPayload,
      endpoint_bus_ref: kontekst.endpointBusRef,
      ...(kontekst.runRef ? { run_ref: kontekst.runRef } : {}),
    };
  }
  return {
    ...commonPayload,
    segment_id: kontekst.segmentId,
    insert_at: { mode: 'RATIO', value: kontekst.positionOnSegment },
  };
}

// ------------------------------------------------------------- Formatery

export function fmtKv(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(3)} kV` : '—';
}

export function fmtMva(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(2)} MVA` : '—';
}

export function fmtPct(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(2)} %` : '—';
}

export function fmtRatio(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : '—';
}
