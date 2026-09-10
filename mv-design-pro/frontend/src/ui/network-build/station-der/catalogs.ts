/**
 * Katalogi dla integracji E-13 ↔ E-21/E-22/E-23 (Faza B).
 *
 * Każda techniczna wartość wybierana w UI musi mieć `catalog_ref`. Dane
 * katalogowe są frozen tabelami w pamięci frontendu (publikacja z backendu
 * wprowadzi te same wartości via `catalog_namespace` + `catalog_item_id`).
 *
 * Katalogi (stan po karcie FAB-L):
 *  - ConnectionLevelCatalog (2 poziomy — nN / dedicated_transformer)
 *  - SnConnectionPointKindCatalog (słownik UI rodzajów punktu przyłączenia SN)
 *
 * Wszystkie POZOSTAŁE katalogi statyczne odeszły do backendu (karty FAB-J/K/L) —
 * ten plik niesie WYŁĄCZNIE słownik UI wariantów przyłączenia (etykiety,
 * kolejność) i walidację hosting capacity (formuła operatora, nie fizyka
 * elektryczna — porównanie sumy P_DER/P_load z progami umownymi).
 *
 * PROWENIENCJA (karta FAB-L, 2026-09-05) — usunięto DRUGĄ KOPIĘ danych
 * katalogowych backendu i JEDNĄ klasę fizyki liczonej w UI:
 *   * `MV_NEUTRAL_GROUNDING_CATALOG` / `BESS_OPERATION_MODE_CATALOG` /
 *     `TAP_CHANGER_CATALOG` — czytane teraz WYŁĄCZNIE ze snapshotu audytu 2
 *     (`useAudit2CatalogSnapshot`, `audit2-api.ts::MvNeutralGroundingItem` /
 *     `BessOperationModeItem` / `TapChangerItem`), który backend już wystawia
 *     (`/api/v1/catalog/audit2/snapshot`). Selektory (`getMvNeutralGrounding`,
 *     `selectBessModesForPcs`, `selectTapChangersForTransformer`,
 *     `getTapChanger`) zostają jako funkcje CZYSTE, ale przyjmują katalog jako
 *     PARAMETR zamiast czytać statyk modułowy — wywołujący dostarcza snapshot.
 *   * `DER_FAULT_CURRENT_DATA_CATALOG` (R₁/X₁/R₂/X₂/R₀/X₀/Z₀·Z₁⁻¹/κ per
 *     device_catalog_ref) i `computeKappa` — USUNIĘTE bez zamiennika. Inwentarz
 *     solvera IEC 60909 (`network_model/solvers/short_circuit_iec60909.py` +
 *     `enm/mapping.py`) wykazał, że ŻADEN z tych danych NIGDY nie zasilał
 *     obliczeń: solver czyta wyłącznie `k_sc` (katalog konwertera albo
 *     zarejestrowane założenie IEC 1,1), wkład składowej ujemnej falownika
 *     jest STAŁĄ solvera (`contributes_negative_sequence=True`), a składowej
 *     zerowej — STAŁĄ (`contributes_zero_sequence=False`), niezależnie od
 *     JAKIEJKOLWIEK karty katalogowej urządzenia. Katalog i κ liczone w UI były
 *     więc RÓWNOLEGŁĄ FIZYKĄ obok solvera (naruszenie NOT-A-SOLVER) — jeśli
 *     ekran chce pokazać κ, bierze je z `ShortCircuitResult.kappa` (solver już
 *     je liczy tym samym wzorem `1,02 + 0,98·e^(-3·R/X)`), nie liczy go sam.
 *     Pole `fault_current_data_ref` usunięte razem z katalogiem: ze store
 *     (`types.ts`), z odczytu modelu (`zModelu.ts`), z UI (`AddDerWizard.tsx`,
 *     `DerSurfaces.tsx`, `ui2/kreatory/zrodlo-oze/*`) i z wiązań backendu
 *     (`DER_BINDING_KEYS`, `enm/domain_operations_v2.py`) — jawny dług „backend
 *     nie ma katalogu dla tego pola" znika razem z fantomem, którego dotyczył.
 *     Osie gotowości `sc_1f`/`sc_2fg` (`readiness.ts`) sprawdzają dziś TĘ SAMĄ
 *     parę faktów co `sc_3f`/`sc_2f` (urządzenie + PCC) — solver nie potrzebuje
 *     od TEGO wytwórcy żadnej dodatkowej danej dla zwarć z udziałem ziemi;
 *     kompletność sieciowa składowej zerowej (r0/x0 gałęzi, grupy połączeń
 *     transformatorów, uziemienie punktu neutralnego) jest bramką MODELU
 *     (`analysis-eligibility` SC_1F), złożoną osobno (`zlozZBramkaModelu`), nie
 *     drugim predykatem per-DER. Jeśli norma (IEC 60909-0 §6.8) wymaga od
 *     solvera dodatkowego wkładu składowych ujemnej/zerowej falownika wg karty
 *     producenta — to luka rdzenia solvera (B-01, zgoda właściciela), nie coś
 *     do obejścia w UI.
 *   * `DER_DYNAMIC_MODEL_CATALOG` (+ `getDynamicModelForDevice`) — pola BYŁY
 *     ZMYŚLONE (`k_factor_iq_over_du`, `voltage_drop_detection_time_ms` — żaden
 *     z nich nie odpowiada parametrom realnego resolvera backendu) i katalog nie
 *     miał żadnego konsumenta solvera. Zastąpiony przez `GET
 *     /api/catalog/der-dynamic-profiles` (`derRemoteCatalogs.ts::
 *     useDerDynamicProfiles`), jedyne źródło — `network_model.catalog.
 *     der_dynamic`, konsumowane przez solvery `stability_rms`/`frt_hvrt`, z
 *     PRAWDZIWYMI parametrami White Box (Tp/Tq/droop/FRT/inercja).
 *   * `STATION_TEMPLATE_CATALOG` — zero konsumentów produkcyjnych (zmierzone
 *     grepem); backend ma `station_templates.py` jako dostawcę dla kreatora
 *     stacji, ten katalog nie miał żadnego wpięcia. Skasowany bez zamiennika.
 *   * `getLvVoltageLevel` — zero konsumentów produkcyjnych. Reliktowy parser
 *     referencji-napięcia sprzed karty FAB-K: `StationDerConnection.
 *     connection_voltage_kv` jest dziś LICZBĄ czytaną wprost z modelu (szyna
 *     przyłączenia), więc nikt już nie parsuje referencji-łańcucha na napięcie.
 *
 * ZNALEZISKO TEJ SAMEJ KLASY POZA PLIKIEM (zgłoszone, nie naprawione w tej
 * karcie): `protection-catalogs.ts::HV_FUSE_CATALOG` (4 pozycje, identyfikatory
 * IDENTYCZNE z backendowym `audit2_catalogs.HV_FUSE_CATALOG` —
 * `fuse_15kv_50a_full` i in.) jest DOKŁADNIE tym samym mirrorem, konsumowanym
 * przez `station-configurator/cards/StationConfigBaysCard.tsx`. Backend już
 * wystawia `hv_fuses` w snapshocie audytu 2 (pole `AuditCatalogSnapshot.
 * hv_fuses` w `audit2-api.ts` zostaje CELOWO nietypowane — `unknown[]` — bo
 * typowanie go bez migracji konsumenta byłoby dekoracją bez skutku) — migracja
 * konsumenta wymaga osobnej karty: plik `protection-catalogs.ts` (673 linie,
 * 5 katalogów: PROTECTION_FUNCTION/SPZ/SZR/HV_FUSE + CtClass) nie był w
 * zakresie inwentarza tej karty (§0 nazwał WYŁĄCZNIE `catalogs.ts`), a jego
 * pozostałe 4 katalogi wymagają własnego pomiaru konsumentów przed decyzją.
 *
 * Zasada: brak losowych wartości — pusty katalog → blocker, custom value
 * tylko jako pozycja katalogowa użytkownika.
 */

import type {
  BessOperationModeItem,
  BlockTransformerItem,
  TapChangerItem,
} from './audit2-api';

/**
 * Wersja katalogów = DATA PRZEGLĄDU PROWENIENCJI (ISO-8601), nie wymyślony numer.
 *
 * Wartość jest identyczna ze stałą `AUDIT2_CATALOG_VERSION` w backendzie
 * (`network_model/catalog/audit2_catalogs.py`) i w `protection-catalogs.ts`
 * (który ją stąd importuje) — jeden punkt odniesienia dla daty przeglądu
 * proweniencji wszystkich katalogów tej rodziny, niezależnie od tego, który
 * plik dziś niesie ich dane.
 */
export const AUDIT2_CATALOG_VERSION = '2026-08-14';

// =============================================================================
// 4. ConnectionLevelCatalog (karta FAB-K — zastępuje ConnectionVariantCatalog)
// =============================================================================

/**
 * PROWENIENCJA (karta FAB-K, 2026-09-05). Dawny `CONNECTION_VARIANT_CATALOG`
 * (6 „wariantów": SN/nN/dedicated_transformer/at_zksn/at_branch_pole/
 * at_cable_joint) mieszał DWIE ortogonalne decyzje fizyczne w jednym enumie:
 * (1) POZIOM przyłączenia (nN vs SN przez transformator dedykowany — żadne
 * urządzenie w katalogu przekształtników nie łączy się z siecią SN bez
 * pośredniczącego transformatora), i (2) dla SN, PUNKT przyłączenia (istniejący
 * element modelu). Cztery z sześciu wariantów (`SN`, `at_zksn`, `at_branch_pole`,
 * `at_cable_joint`) wysyłały do backendu ten sam `connection_variant` BEZ pozycji
 * katalogowej transformatora (`block_transformer_catalog_ref`) — GWARANTOWANY
 * 422 przy zapisie (pomiar: żadna z tych czterech ścieżek nie kończyła się
 * sukcesem). `CONNECTION_LEVEL_CATALOG` niesie WYŁĄCZNIE poziom (2 pozycje);
 * punkt przyłączenia SN wybiera się z listy ISTNIEJĄCYCH elementów modelu
 * (`selectSnConnectionPointCandidates` w `AddDerWizard.tsx`), nie z katalogu.
 */
export interface ConnectionLevelItem {
  readonly id: string;
  readonly catalog_namespace: 'connection_level';
  readonly side: 'nN' | 'dedicated_transformer';
  readonly label_pl: string;
  readonly description_pl: string;
  readonly applicable_der_kinds: ReadonlyArray<'PV' | 'BESS' | 'FW'>;
  readonly required_objects_pl: ReadonlyArray<string>;
}

export const CONNECTION_LEVEL_CATALOG: ReadonlyArray<ConnectionLevelItem> = Object.freeze([
  {
    id: 'level_nn',
    catalog_namespace: 'connection_level',
    side: 'nN',
    label_pl: 'Po stronie nN — za transformatorem stacji',
    description_pl:
      'DER przyłączony do szyny nN stacji, za istniejącym transformatorem SN/nN. '
      + 'Wymaga zgodności napięcia falownika/PCS z napięciem szyny nN.',
    applicable_der_kinds: ['PV', 'BESS'],
    required_objects_pl: ['Szyna nN stacji', 'Pole odpływowe nN', 'Zabezpieczenie nN', 'Pomiar'],
  },
  {
    id: 'level_dedicated',
    catalog_namespace: 'connection_level',
    side: 'dedicated_transformer',
    label_pl: 'Po stronie SN — przez transformator dedykowany',
    description_pl:
      'DER przyłączony do sieci SN przez transformator dedykowany (nowy z katalogu '
      + 'albo istniejący w modelu). Wymaga wskazania PUNKTU przyłączenia — istniejącej '
      + 'szyny SN stacji, ZK SN, słupa rozgałęźnego albo odgałęzienia (krok następny).',
    applicable_der_kinds: ['PV', 'BESS', 'FW'],
    required_objects_pl: [
      'Transformator dedykowany',
      'Punkt przyłączenia SN (istniejący element modelu)',
      'Zabezpieczenia po obu stronach',
    ],
  },
]);

/**
 * Rodzaj punktu przyłączenia SN — słownik UI (etykiety), nie katalog fizyczny:
 * kandydaci realni pochodzą z migawki modelu (`selectSnConnectionPointCandidates`),
 * to jest wyłącznie mapowanie rodzaju → etykieta/opis dla prezentacji.
 */
export interface SnConnectionPointKindItem {
  readonly kind: 'station_bus' | 'zksn' | 'branch_pole' | 'junction';
  readonly label_pl: string;
  readonly description_pl: string;
}

export const SN_CONNECTION_POINT_KIND_CATALOG: ReadonlyArray<SnConnectionPointKindItem> = Object.freeze([
  {
    kind: 'station_bus',
    label_pl: 'Szyna SN stacji (przez pole SN)',
    description_pl: 'Punkt przyłączenia to szyna SN bieżącej stacji, dedykowane pole SN źródłowe.',
  },
  {
    kind: 'zksn',
    label_pl: 'Złącze kablowe SN (ZK SN)',
    description_pl: 'Punkt przyłączenia to złącze kablowe SN poza stacją — wymaga zabezpieczenia kierunkowego (67/67N).',
  },
  {
    kind: 'branch_pole',
    label_pl: 'Słup rozgałęźny linii napowietrznej SN',
    description_pl: 'Punkt przyłączenia to słup rozgałęźny linii napowietrznej SN.',
  },
  {
    kind: 'junction',
    label_pl: 'Odgałęzienie (węzeł T)',
    description_pl: 'Punkt przyłączenia to węzeł T (odgałęzienie) na ciągu kablowym albo napowietrznym SN.',
  },
]);

// =============================================================================
// 9. Helpery selektora
// =============================================================================

/** Filtruje poziomy przyłączenia po rodzaju DER. */
export function selectConnectionLevelsForKind(
  kind: 'PV' | 'BESS' | 'FW',
): readonly ConnectionLevelItem[] {
  return CONNECTION_LEVEL_CATALOG.filter((v) => v.applicable_der_kinds.includes(kind));
}

/** Polski label dla poziomu przyłączenia (`ConnectionSide`). */
export function getConnectionSideLabelPl(side: 'nN' | 'dedicated_transformer'): string {
  const item = CONNECTION_LEVEL_CATALOG.find((v) => v.side === side);
  return item?.label_pl ?? side;
}

/** Polski label dla rodzaju punktu przyłączenia SN (`SnConnectionPointKind`). */
export function getSnConnectionPointKindLabelPl(
  kind: 'station_bus' | 'zksn' | 'branch_pole' | 'junction' | null,
): string {
  if (kind === null) return '—';
  const item = SN_CONNECTION_POINT_KIND_CATALOG.find((v) => v.kind === kind);
  return item?.label_pl ?? kind;
}

/**
 * Naprawa B.5: filtruje transformatory dedykowane dla danej kombinacji DER + napięć.
 * Zwraca pozycje katalogowe pasujące do device_voltage / station_voltage.
 *
 * Karta FAB-J: katalog przychodzi WYŁĄCZNIE ze snapshotu audytu 2
 * (`useAudit2CatalogSnapshot`, `audit2-api.ts::BlockTransformerItem`) — funkcja
 * przyjmuje go jako parametr, zero statyku modułowego.
 */
export function selectBlockTransformersForDer(
  blockTransformers: readonly BlockTransformerItem[],
  args: {
    readonly derKind: 'PV' | 'BESS' | 'FW';
    readonly hvKv?: number;
    readonly lvKv?: number;
    readonly requiresGalvanicIsolation?: boolean;
  },
): readonly BlockTransformerItem[] {
  return blockTransformers.filter((btr) => {
    if (!btr.applicable_der_kinds.includes(args.derKind)) return false;
    if (args.hvKv !== undefined && Math.abs(btr.hv_kv - args.hvKv) > 0.5) return false;
    if (args.lvKv !== undefined && Math.abs(btr.lv_kv - args.lvKv) > 0.05) return false;
    if (args.requiresGalvanicIsolation === true && !btr.galvanic_isolation) return false;
    return true;
  });
}

/** Pobiera transformator dedykowany po id z katalogu podanego przez wołającego. */
export function getBlockTransformer(
  blockTransformers: readonly BlockTransformerItem[],
  id: string | null,
): BlockTransformerItem | null {
  if (!id) return null;
  return blockTransformers.find((b) => b.id === id) ?? null;
}

// =============================================================================
// 10. Selektor trybów pracy BESS (Naprawa eng.10 — audyt OZE)
// =============================================================================

/**
 * Filtruje tryby pracy magazynu dostępne dla zdolności danego przekształtnika.
 *
 * Karta FAB-L: katalog przychodzi WYŁĄCZNIE ze snapshotu audytu 2
 * (`useAudit2CatalogSnapshot`, `audit2-api.ts::BessOperationModeItem`) — funkcja
 * przyjmuje go jako parametr, zero statyku modułowego (dawny
 * `BESS_OPERATION_MODE_CATALOG` niósł te same 10 pozycji co backend, więc
 * mirror był wyłącznie ryzykiem rozjazdu, nigdy niezależną daną).
 */
export function selectBessModesForPcs(
  modes: readonly BessOperationModeItem[],
  args: {
    readonly fourQuadrant: boolean;
    readonly gridFormingCapable: boolean;
  },
): readonly BessOperationModeItem[] {
  return modes.filter((m) => {
    if (m.requires_four_quadrant && !args.fourQuadrant) return false;
    if (m.requires_grid_forming && !args.gridFormingCapable) return false;
    return true;
  });
}

// =============================================================================
// 11. Selektor przełączników zaczepów (Naprawa eng.13 — audyt projektanta SN)
// =============================================================================

/**
 * Filtruje przełączniki zaczepów dla danego typu transformatora.
 *
 * Karta FAB-L: katalog przychodzi WYŁĄCZNIE ze snapshotu audytu 2
 * (`useAudit2CatalogSnapshot`, `audit2-api.ts::TapChangerItem`) — funkcja
 * przyjmuje go jako parametr, zero statyku modułowego.
 */
export function selectTapChangersForTransformer(
  tapChangers: readonly TapChangerItem[],
  type: 'transformer_110_15' | 'transformer_110_20' | 'transformer_15_04' | 'block_transformer',
): readonly TapChangerItem[] {
  return tapChangers.filter((tc) => tc.applicable_to.includes(type));
}

/** Pobiera szczegóły przełącznika zaczepów z katalogu podanego przez wołającego. */
export function getTapChanger(
  tapChangers: readonly TapChangerItem[],
  id: string | null,
): TapChangerItem | null {
  if (!id) return null;
  return tapChangers.find((tc) => tc.id === id) ?? null;
}

// =============================================================================
// 12. Hosting capacity export check (Naprawa eng.15 — audyt OZE)
// =============================================================================
//
// Eksport mocy DER do sieci OSD vs. import obciążenia. Reguła operatora:
// jeśli moc eksportowana ≥ 1.5 × moc importowana, wymagana studium NC RfG
// "ramp-down" + ograniczenie eksportu (curtailment).

export interface HostingCapacityExportResult {
  readonly station_id: string;
  readonly p_export_kw: number; // suma mocy DER
  readonly p_import_kw: number; // suma mocy odbiorów
  readonly p_net_export_kw: number; // P_export - P_import (>0 = export do OSD)
  readonly export_to_import_ratio: number;
  readonly status: 'no_export' | 'normal_export' | 'high_export_warning' | 'requires_ramp_down';
  readonly message_pl: string;
}

/**
 * Naprawa eng.15: walidacja kierunku przepływu mocy (export vs import) w stacji.
 * Reguła operatora:
 *   - Σ P_DER ≤ 0.8 × Σ P_load → "no_export" (lokalna autokonsumpcja)
 *   - 0.8 × Σ P_load < Σ P_DER ≤ 1.5 × Σ P_load → "normal_export"
 *   - Σ P_DER > 1.5 × Σ P_load → "high_export_warning" (wymagane curtailment)
 *   - Σ P_DER > 3 × Σ P_load → "requires_ramp_down" (NC RfG study + curtailment)
 */
export function validateHostingCapacityExport(args: {
  readonly station_id: string;
  readonly p_export_kw: number;
  readonly p_import_kw: number;
}): HostingCapacityExportResult {
  const net = args.p_export_kw - args.p_import_kw;
  const ratio = args.p_import_kw > 0 ? args.p_export_kw / args.p_import_kw : Infinity;

  let status: HostingCapacityExportResult['status'];
  let message_pl: string;

  if (net < 0 || ratio < 0.8) {
    status = 'no_export';
    message_pl =
      `Lokalna autokonsumpcja: ${args.p_export_kw.toFixed(0)} kW DER vs `
      + `${args.p_import_kw.toFixed(0)} kW odbiorów. Brak eksportu netto do OSD.`;
  } else if (ratio <= 1.5) {
    status = 'normal_export';
    message_pl =
      `Eksport normalny: ${net.toFixed(0)} kW eksportowanych do OSD `
      + `(stosunek ${ratio.toFixed(2)}× — w granicach standardowej hosting capacity).`;
  } else if (ratio <= 3.0) {
    status = 'high_export_warning';
    message_pl =
      `Wysoki eksport: ${net.toFixed(0)} kW (stosunek ${ratio.toFixed(2)}×). `
      + `Zalecane curtailment 70% w godzinach południowych. Sprawdź profil P(t).`;
  } else {
    status = 'requires_ramp_down';
    message_pl =
      `Krytyczny eksport: ${net.toFixed(0)} kW (stosunek ${ratio.toFixed(2)}×). `
      + `WYMAGANE: studium NC RfG ramp-down + curtailment + uzgodnienie z OSD.`;
  }

  return {
    station_id: args.station_id,
    p_export_kw: args.p_export_kw,
    p_import_kw: args.p_import_kw,
    p_net_export_kw: net,
    export_to_import_ratio: ratio,
    status,
    message_pl,
  };
}
