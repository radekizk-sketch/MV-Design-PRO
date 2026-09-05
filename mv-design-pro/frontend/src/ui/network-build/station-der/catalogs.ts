/**
 * Katalogi dla integracji E-13 ↔ E-21/E-22/E-23 (Faza B).
 *
 * Każda techniczna wartość wybierana w UI musi mieć `catalog_ref`. Dane
 * katalogowe są frozen tabelami w pamięci frontendu (publikacja z backendu
 * wprowadzi te same wartości via `catalog_namespace` + `catalog_item_id`).
 *
 * Katalogi (stan po karcie FAB-K):
 *  - ConnectionLevelCatalog (2 poziomy — nN / dedicated_transformer)
 *  - MvNeutralGroundingCatalog (5 wariantów)
 *  - StationTemplateCatalog (10 szablonów)
 *  - DerFaultCurrentDataCatalog (modele zwarciowe wg device_catalog_ref)
 *  - DerDynamicModelCatalog (modele dynamiczne FRT/HVRT)
 *  - BessOperationModeCatalog (tryby pracy magazynu)
 *  - TapChangerCatalog (przełączniki zaczepów)
 *
 * PROWENIENCJA (karta FAB-J, 2026-09-05) — usunięto DRUGĄ KOPIĘ danych
 * katalogowych, dla których backend jest już jedynym źródłem prawdy:
 *   * `PF_CURVE_CATALOG` / `BLOCK_TRANSFORMER_CATALOG` — czytane teraz
 *     WYŁĄCZNIE ze snapshotu audytu 2 (`useAudit2CatalogSnapshot`,
 *     `audit2-api.ts::PfCurveItem`/`BlockTransformerItem`), który kreator już
 *     pobierał bez użycia.
 *   * `NC_RFG_PROFILE_CATALOG` / `LVRT_CURVE_CATALOG` / `HVRT_CURVE_CATALOG` —
 *     czytane teraz z `GET /api/ncrfg-tests/catalog`
 *     (`derRemoteCatalogs.ts::NcRfgOperatorItem` — operator + JEDNA para
 *     krzywych ride-through; backend nie różnicuje LVRT/HVRT wg modułu, więc
 *     front przestał to udawać).
 *   * `LV_VOLTAGE_LEVEL_CATALOG` — wyprowadzony z katalogu przekształtników
 *     (`derRemoteCatalogs.ts::useLvVoltageLevelsKv`, `un_kv` < 1 kV) —
 *     zero nowej końcówki, jedyna prawda o istniejących urządzeniach.
 *   * `BESS_BATTERY_CATALOG` — `GET /api/catalog/bess-battery-types`
 *     (`derRemoteCatalogs.ts::BessBatteryItem`); backend nie miał tego
 *     katalogu wcale przed tą kartą.
 *   * `PV_INVERTER_CATALOG` / `BESS_PCS_CATALOG` / `WIND_TURBINE_CATALOG` —
 *     jedyny pozostały konsument (`DerSurfaces.tsx` — nazwa/producent
 *     urządzenia) czyta teraz to samo pobranie `fetchDerConverterTypes`,
 *     którego kreator już używa (FAB-I).
 *   * `validateMinSkAtPcc` (Naprawa B.4) — zależał wyłącznie od
 *     `sk_min_to_p_ratio_by_module` usuniętego profilu NC RfG i nie miał
 *     konsumenta produkcyjnego (tylko własny test) — backend nie niesie tego
 *     pola, więc funkcja zniknęła razem z katalogiem, którego jedynym celem
 *     było jej karmienie.
 *
 * Zasada: brak losowych wartości — pusty katalog → blocker, custom value
 * tylko jako pozycja katalogowa użytkownika.
 */

import type { BlockTransformerItem } from './audit2-api';

/**
 * Wersja katalogów = DATA PRZEGLĄDU PROWENIENCJI (ISO-8601), nie wymyślony numer.
 *
 * Do karty K-Q pozycje deklarowały `catalog_version: AUDIT2_CATALOG_VERSION` — numer, który nie
 * odpowiadał żadnemu wydaniu żadnego źródła i którego nie dało się z niczym
 * skonfrontować. Wersja jest teraz MIERZALNA: to dzień, w którym każdą pozycję
 * zestawiono ze źródłem (albo z niego usunięto). Wartość jest identyczna ze stałą
 * `AUDIT2_CATALOG_VERSION` w backendzie (`network_model/catalog/audit2_catalogs.py`),
 * bo backend jest autorytetem danych, a ten plik jego mirrorem.
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
// 4b. MvNeutralGroundingCatalog (Naprawa B.1 — audyt projektanta SN)
// =============================================================================
//
// Punkt uziemienia neutralnego transformatora 110/SN (lub stacji SN-SN).
// Decyduje o impedancji Z₀ sieci SN i kształcie obliczeń SC1F/SC2FG.
//
// PROWENIENCJA (karta K-O, 2026-08-14) — usunięto dwa pola tej samej klasy, co
// zmyślone pasmo wkładki SN:
//   * `typical_ik1_a_range` — ZAKRES PRĄDU ZWARCIA DOZIEMNEGO bez źródła,
//     pokazywany użytkownikowi na dwóch ekranach jako „I_k1 typowo 5000-25000 A".
//     Liczba, na której projektant mógłby oprzeć dobór zabezpieczeń
//     ziemnozwarciowych, a która nie pochodziła znikąd. Prąd I_k1 tej sieci
//     wylicza solver SC1F z realnej impedancji Z₀ modelu — „typowy zakres"
//     z tabeli konkurował z wynikiem obliczeń i nie miał czym tego wygrać.
//   * `typical_operators_pl` — przypisanie praktyki ruchowej imiennie wskazanym
//     operatorom (PGE Dystrybucja, Energa-Operator, Tauron, Enea, „PSE GPZ")
//     bez cytatu z IRiESD. Bez konsumenta produkcyjnego.
// Imiona operatorów usunięto też z `description_pl`. Zostaje `r_ohm`/`x_ohm` —
// to parametr DEFINIUJĄCY wariant (widnieje w jego nazwie), czyli wybór
// projektanta, a nie cudza zmierzona własność.

export interface MvNeutralGroundingItem {
  readonly id: string;
  readonly catalog_namespace: 'mv_neutral_grounding';
  readonly catalog_version: string;
  readonly grounding_type: 'isolated' | 'petersen_coil' | 'resistor_grounded' | 'directly_grounded';
  readonly label_pl: string;
  readonly description_pl: string;
  /** Rezystancja uziemienia [Ω] definiująca wariant (gdy resistor_grounded). */
  readonly r_ohm?: number;
  /** Reaktancja uziemienia [Ω] definiująca wariant (petersen_coil — Lp = 1/(3·ω·C₀)). */
  readonly x_ohm?: number;
}

export const MV_NEUTRAL_GROUNDING_CATALOG: ReadonlyArray<MvNeutralGroundingItem> = Object.freeze([
  {
    id: 'mng_isolated',
    catalog_namespace: 'mv_neutral_grounding',
    catalog_version: AUDIT2_CATALOG_VERSION,
    grounding_type: 'isolated',
    label_pl: 'Sieć izolowana (bez uziemienia neutralnego)',
    description_pl:
      'Punkt neutralny transformatora 110/SN nie jest uziemiony. Prąd zwarcia '
      + '1-fazowego doziemnego jest ograniczony tylko pojemnością sieci.',
  },
  {
    id: 'mng_petersen',
    catalog_namespace: 'mv_neutral_grounding',
    catalog_version: AUDIT2_CATALOG_VERSION,
    grounding_type: 'petersen_coil',
    label_pl: 'Sieć skompensowana (cewka Petersena PCK)',
    description_pl:
      'Punkt neutralny uziemiony przez dławik kompensacyjny (cewkę Petersena). '
      + 'Lp = 1 / (3·ω·C₀) gdzie C₀ jest pojemnością sieci. W stanie '
      + 'kompensacji prąd zwarcia doziemnego jest bliski zeru.',
  },
  {
    id: 'mng_resistor_low',
    catalog_namespace: 'mv_neutral_grounding',
    catalog_version: AUDIT2_CATALOG_VERSION,
    grounding_type: 'resistor_grounded',
    label_pl: 'Sieć uziemiona przez rezystor — niski (R≈7 Ω)',
    description_pl:
      'Punkt neutralny uziemiony przez rezystor 7 Ω — ogranicza prąd zwarcia '
      + 'doziemnego na tyle, by pozostał wykrywalny przez 51N. Stosowane '
      + 'w sieciach kablowych miejskich.',
    r_ohm: 7,
  },
  {
    id: 'mng_resistor_medium',
    catalog_namespace: 'mv_neutral_grounding',
    catalog_version: AUDIT2_CATALOG_VERSION,
    grounding_type: 'resistor_grounded',
    label_pl: 'Sieć uziemiona przez rezystor — średni (R≈40 Ω)',
    description_pl:
      'Punkt neutralny uziemiony przez rezystor 40 Ω. Kompromis między '
      + 'wykrywalnością zwarć a ochroną sprzętu. Stosowane w sieciach '
      + 'mieszanych kabel/napowietrzna.',
    r_ohm: 40,
  },
  {
    id: 'mng_directly',
    catalog_namespace: 'mv_neutral_grounding',
    catalog_version: AUDIT2_CATALOG_VERSION,
    grounding_type: 'directly_grounded',
    label_pl: 'Sieć uziemiona bezpośrednio (Z=0)',
    description_pl:
      'Punkt neutralny uziemiony bezpośrednio. Ik1 maksymalne (porównywalne '
      + 'z Ik3). Rzadko stosowane w SN — głównie w przemysłowych sieciach '
      + 'specjalnych. Zwiększa wymagania na zabezpieczenia i sprzęt.',
  },
]);

// =============================================================================
// 5. StationTemplateCatalog (10 szablonów)
// =============================================================================

export interface StationTemplateItem {
  readonly id: string;
  readonly catalog_namespace: 'station_template';
  readonly label_pl: string;
  readonly description_pl: string;
  readonly topological_type: 'końcowa' | 'przelotowa' | 'odgałęźna' | 'sekcyjna';
  readonly transformer_count: number;
  readonly nn_voltage_level_refs: readonly string[];
  readonly pre_configured_der_count: number;
  readonly applicable_when_pl: string;
}

export const STATION_TEMPLATE_CATALOG: ReadonlyArray<StationTemplateItem> = Object.freeze([
  {
    id: 'st_terminal_1t',
    catalog_namespace: 'station_template',
    label_pl: 'Stacja końcowa 1T',
    description_pl: 'Stacja końcowa z jednym transformatorem SN/nN, prosta odbiorcza.',
    topological_type: 'końcowa',
    transformer_count: 1,
    nn_voltage_level_refs: ['lv_0_4kV'],
    pre_configured_der_count: 0,
    applicable_when_pl: 'Standardowa stacja kontenerowa odbiorcza na końcu ciągu.',
  },
  {
    id: 'st_inline_1t',
    catalog_namespace: 'station_template',
    label_pl: 'Stacja przelotowa 1T',
    description_pl: 'Stacja przelotowa z jednym transformatorem; ciąg SN przechodzi.',
    topological_type: 'przelotowa',
    transformer_count: 1,
    nn_voltage_level_refs: ['lv_0_4kV'],
    pre_configured_der_count: 0,
    applicable_when_pl: 'Stacja na środku ciągu z odpływem nN.',
  },
  {
    id: 'st_branch_1t',
    catalog_namespace: 'station_template',
    label_pl: 'Stacja odgałęźna 1T',
    description_pl: 'Stacja odgałęźna z jednym transformatorem.',
    topological_type: 'odgałęźna',
    transformer_count: 1,
    nn_voltage_level_refs: ['lv_0_4kV'],
    pre_configured_der_count: 0,
    applicable_when_pl: 'Punkt odgałęzienia ciągu SN z odpływem.',
  },
  {
    id: 'st_sectional_1t',
    catalog_namespace: 'station_template',
    label_pl: 'Stacja sekcyjna 1T',
    description_pl: 'Stacja sekcyjna do podziału ciągu z jednym transformatorem.',
    topological_type: 'sekcyjna',
    transformer_count: 1,
    nn_voltage_level_refs: ['lv_0_4kV'],
    pre_configured_der_count: 0,
    applicable_when_pl: 'Punkt sekcjonowania ciągu z odpływem nN.',
  },
  {
    id: 'st_terminal_2t',
    catalog_namespace: 'station_template',
    label_pl: 'Stacja 2T (rezerwa)',
    description_pl: 'Stacja końcowa z dwoma transformatorami (rezerwa).',
    topological_type: 'końcowa',
    transformer_count: 2,
    nn_voltage_level_refs: ['lv_0_4kV'],
    pre_configured_der_count: 0,
    applicable_when_pl: 'Stacja przemysłowa wymagająca rezerwy zasilania nN.',
  },
  {
    id: 'st_pv_sn',
    catalog_namespace: 'station_template',
    label_pl: 'Stacja z PV po SN',
    description_pl: 'Stacja końcowa z PV przyłączonym przez dedykowane pole SN.',
    topological_type: 'końcowa',
    transformer_count: 1,
    nn_voltage_level_refs: ['lv_0_4kV'],
    pre_configured_der_count: 1,
    applicable_when_pl: 'Farma PV o mocy >500 kW przyłączona po stronie SN.',
  },
  {
    id: 'st_pv_nn',
    catalog_namespace: 'station_template',
    label_pl: 'Stacja z PV po nN',
    description_pl: 'Stacja przelotowa z PV przyłączonym do szyny nN.',
    topological_type: 'przelotowa',
    transformer_count: 1,
    nn_voltage_level_refs: ['lv_0_4kV'],
    pre_configured_der_count: 1,
    applicable_when_pl: 'PV mikroinstalacja lub mała farma do 500 kW.',
  },
  {
    id: 'st_bess_sn',
    catalog_namespace: 'station_template',
    label_pl: 'Stacja z BESS po SN',
    description_pl: 'Stacja końcowa z magazynem energii po stronie SN.',
    topological_type: 'końcowa',
    transformer_count: 1,
    nn_voltage_level_refs: ['lv_0_4kV'],
    pre_configured_der_count: 1,
    applicable_when_pl: 'Magazyn BESS >1 MW przyłączony do SN.',
  },
  {
    id: 'st_bess_nn',
    catalog_namespace: 'station_template',
    label_pl: 'Stacja z BESS po nN',
    description_pl: 'Stacja przelotowa z BESS po stronie nN.',
    topological_type: 'przelotowa',
    transformer_count: 1,
    nn_voltage_level_refs: ['lv_0_4kV'],
    pre_configured_der_count: 1,
    applicable_when_pl: 'Magazyn BESS lokalny <500 kW.',
  },
  {
    id: 'st_industrial_multi',
    catalog_namespace: 'station_template',
    label_pl: 'Stacja przemysłowa multi-voltage nN',
    description_pl:
      'Stacja przemysłowa z wieloma poziomami napięć nN (0,4 / 0,69 / 6 kV) i opcjonalnym BESS.',
    topological_type: 'przelotowa',
    transformer_count: 2,
    nn_voltage_level_refs: ['lv_0_4kV', 'lv_0_69kV', 'lv_6kV'],
    pre_configured_der_count: 0,
    applicable_when_pl: 'Zakład przemysłowy z silnikami 6 kV i odbiorami 0,4/0,69 kV.',
  },
]);


// =============================================================================
// 7. DerFaultCurrentDataCatalog (Naprawa A.1, A.3, A.4 — audyt profesora)
// =============================================================================
//
// Składowe symetryczne (R₁/X₁, R₂/X₂, R₀/X₀) + Z₀/Z₁ ratio + κ + i_max_pu.
// Wymagane dla obliczeń:
//   - SC1F (zwarcie 1-fazowe doziemne) — IEC 60909-3
//   - SC2FG (zwarcie 2-fazowe z ziemią)
//   - ip (peak short-circuit) przez κ = 1.02 + 0.98·exp(-3·R/X)
//
// Pozycje w katalogu są skojarzone z konkretnym device_catalog_ref poprzez
// pole `applicable_device_ids`.
//
// PROWENIENCJA (karta K-Q, 2026-08-14). Pozycje nosiły w nazwie KONKRETNY WYRÓB
// („SMA SC2500-EV", „ABB PCS100 ESS", „Vestas V117") i deklarowały jego graniczny
// prąd zwarciowy — a więc przypisywały imiennemu producentowi liczby, których
// żadna karta katalogowa nie potwierdzała. Pole `fault_current_capability_pu`
// usunięto (to ta sama dana, którą karta usunęła z katalogów urządzeń), a nazwy
// są dziś opisem WARIANTU MODELU ZWARCIOWEGO, nazwanym swoimi parametrami.
// Składowe symetryczne zostają jako parametry DEFINIUJĄCE wariant, który
// projektant wybiera; do projektu wykonawczego wymagają potwierdzenia kartą
// przekształtnika — `applicable_device_ids` jest regułą domyślnego doboru, a nie
// deklaracją, że tak zmierzył producent.

export interface DerFaultCurrentDataItem {
  readonly id: string;
  readonly catalog_namespace: 'der_fault_current_data';
  readonly catalog_version: string;
  readonly applicable_device_ids: readonly string[];
  readonly label_pl: string;
  /** Składowe kolejności dodatniej (R₁, X₁) per unit. */
  readonly r1_pu: number;
  readonly x1_pu: number;
  /** Składowe kolejności ujemnej (R₂, X₂). Domyślnie ≈ R₁/X₁ dla falowników. */
  readonly r2_pu: number;
  readonly x2_pu: number;
  /** Składowe kolejności zerowej (R₀, X₀). */
  readonly r0_pu: number;
  readonly x0_pu: number;
  /** Stosunek Z₀/Z₁ — kluczowe dla SC1F. */
  readonly z0_z1_ratio: number;
  /** Stosunek R/X w punkcie generowania prądu zwarciowego. Dla κ. */
  readonly rx_ratio_at_terminal: number;
  /** Model contribution: voltage-source-behind-Zth albo current-source-limited. */
  readonly contribution_model: 'voltage_source' | 'current_source_limited';
}

export const DER_FAULT_CURRENT_DATA_CATALOG: ReadonlyArray<DerFaultCurrentDataItem> = Object.freeze([
  {
    id: 'fcd_pv_inv_sma_2500',
    catalog_namespace: 'der_fault_current_data',
    catalog_version: AUDIT2_CATALOG_VERSION,
    applicable_device_ids: ['pv_inv_sma_2500'],
    label_pl: 'Model zwarciowy falownika PV · źródło prądowe z ograniczeniem · Z₀/Z₁ = 2,2',
    r1_pu: 0.05,
    x1_pu: 0.18,
    r2_pu: 0.05,
    x2_pu: 0.18,
    r0_pu: 0.10,
    x0_pu: 0.40,
    z0_z1_ratio: 2.2,
    rx_ratio_at_terminal: 0.28,
    contribution_model: 'current_source_limited',
  },
  {
    id: 'fcd_pv_inv_huawei_185',
    catalog_namespace: 'der_fault_current_data',
    catalog_version: AUDIT2_CATALOG_VERSION,
    applicable_device_ids: ['pv_inv_huawei_185'],
    label_pl: 'Model zwarciowy falownika PV nN · źródło prądowe z ograniczeniem · Z₀/Z₁ = 2,1',
    r1_pu: 0.04,
    x1_pu: 0.15,
    r2_pu: 0.04,
    x2_pu: 0.15,
    r0_pu: 0.08,
    x0_pu: 0.32,
    z0_z1_ratio: 2.1,
    rx_ratio_at_terminal: 0.27,
    contribution_model: 'current_source_limited',
  },
  {
    id: 'fcd_pv_inv_fimer_3000',
    catalog_namespace: 'der_fault_current_data',
    catalog_version: AUDIT2_CATALOG_VERSION,
    applicable_device_ids: ['pv_inv_fimer_3000'],
    label_pl: 'Model zwarciowy falownika PV dużej mocy · źródło prądowe · Z₀/Z₁ = 2,1',
    r1_pu: 0.05,
    x1_pu: 0.20,
    r2_pu: 0.05,
    x2_pu: 0.20,
    r0_pu: 0.11,
    x0_pu: 0.42,
    z0_z1_ratio: 2.1,
    rx_ratio_at_terminal: 0.25,
    contribution_model: 'current_source_limited',
  },
  {
    id: 'fcd_bess_pcs_sma_2200',
    catalog_namespace: 'der_fault_current_data',
    catalog_version: AUDIT2_CATALOG_VERSION,
    applicable_device_ids: ['bess_pcs_sma_2200'],
    label_pl: 'Model zwarciowy PCS magazynu · przekształtnik tworzący napięcie · Z₀/Z₁ = 2,0',
    r1_pu: 0.04,
    x1_pu: 0.16,
    r2_pu: 0.04,
    x2_pu: 0.16,
    r0_pu: 0.08,
    x0_pu: 0.32,
    z0_z1_ratio: 2.0,
    rx_ratio_at_terminal: 0.25,
    contribution_model: 'voltage_source',
  },
  {
    id: 'fcd_bess_pcs_abb_500',
    catalog_namespace: 'der_fault_current_data',
    catalog_version: AUDIT2_CATALOG_VERSION,
    applicable_device_ids: ['bess_pcs_abb_500'],
    label_pl: 'Model zwarciowy PCS magazynu · przekształtnik podążający · Z₀/Z₁ = 2,0',
    r1_pu: 0.05,
    x1_pu: 0.18,
    r2_pu: 0.05,
    x2_pu: 0.18,
    r0_pu: 0.10,
    x0_pu: 0.36,
    z0_z1_ratio: 2.0,
    rx_ratio_at_terminal: 0.28,
    contribution_model: 'current_source_limited',
  },
  {
    id: 'fcd_wt_vestas_v117_3450',
    catalog_namespace: 'der_fault_current_data',
    catalog_version: AUDIT2_CATALOG_VERSION,
    applicable_device_ids: ['wt_vestas_v117_3450'],
    label_pl: 'Model zwarciowy turbiny z pełnym przekształtnikiem · Z₀/Z₁ = 2,0',
    r1_pu: 0.06,
    x1_pu: 0.20,
    r2_pu: 0.06,
    x2_pu: 0.20,
    r0_pu: 0.12,
    x0_pu: 0.40,
    z0_z1_ratio: 2.0,
    rx_ratio_at_terminal: 0.30,
    contribution_model: 'current_source_limited',
  },
  {
    id: 'fcd_wt_siemens_swt_2300',
    catalog_namespace: 'der_fault_current_data',
    catalog_version: AUDIT2_CATALOG_VERSION,
    applicable_device_ids: ['wt_siemens_swt_2300_113'],
    label_pl: 'Model zwarciowy turbiny dwustronnie zasilanej (DFIG) · Z₀/Z₁ = 2,0',
    r1_pu: 0.025,
    x1_pu: 0.12,
    r2_pu: 0.025,
    x2_pu: 0.12,
    r0_pu: 0.05,
    x0_pu: 0.24,
    z0_z1_ratio: 2.0,
    rx_ratio_at_terminal: 0.21,
    contribution_model: 'voltage_source',
  },
  {
    id: 'fcd_wt_ge_158_5500',
    catalog_namespace: 'der_fault_current_data',
    catalog_version: AUDIT2_CATALOG_VERSION,
    applicable_device_ids: ['wt_ge_158_5500'],
    label_pl: 'Model zwarciowy turbiny z pełnym przekształtnikiem, duża moc · Z₀/Z₁ = 2,0',
    r1_pu: 0.06,
    x1_pu: 0.20,
    r2_pu: 0.06,
    x2_pu: 0.20,
    r0_pu: 0.12,
    x0_pu: 0.40,
    z0_z1_ratio: 2.0,
    rx_ratio_at_terminal: 0.30,
    contribution_model: 'current_source_limited',
  },
]);


// =============================================================================
// 8. DerDynamicModelCatalog (Naprawa A.5 — audyt profesora)
// =============================================================================
//
// Modele dynamiczne dla solvera RMS time-domain (FRT/HVRT, stabilność).

export interface DerDynamicModelItem {
  readonly id: string;
  readonly catalog_namespace: 'der_dynamic_model';
  readonly catalog_version: string;
  readonly applicable_device_ids: readonly string[];
  readonly label_pl: string;
  readonly model_type:
    | 'pv_grid_following'
    | 'pv_grid_forming'
    | 'bess_grid_following'
    | 'bess_grid_forming'
    | 'wt_pmsg_full_converter'
    | 'wt_dfig'
    | 'wt_scig';
  /** Czas reakcji falownika/PCS [ms]. */
  readonly response_time_ms: number;
  /** Współczynnik wsparcia napięciowego k(Iq/ΔU) podczas FRT — typowo 2-6. */
  readonly k_factor_iq_over_du: number;
  /** Maksymalny prąd reaktywny podczas FRT [pu]. */
  readonly iq_max_during_fault_pu: number;
  /** Stopień regenenracji P po zakończeniu FRT [pu/s]. */
  readonly p_recovery_rate_pu_per_s: number;
  /** Czas filtru wykrywania zaniku napięcia [ms]. */
  readonly voltage_drop_detection_time_ms: number;
}

export const DER_DYNAMIC_MODEL_CATALOG: ReadonlyArray<DerDynamicModelItem> = Object.freeze([
  {
    id: 'dyn_pv_gfl_typical',
    catalog_namespace: 'der_dynamic_model',
    catalog_version: AUDIT2_CATALOG_VERSION,
    applicable_device_ids: ['pv_inv_sma_2500', 'pv_inv_huawei_185', 'pv_inv_fimer_3000'],
    label_pl: 'PV grid-following typowy (NC RfG: k=2, t_resp=20ms)',
    model_type: 'pv_grid_following',
    response_time_ms: 20,
    k_factor_iq_over_du: 2.0,
    iq_max_during_fault_pu: 1.0,
    p_recovery_rate_pu_per_s: 5.0,
    voltage_drop_detection_time_ms: 10,
  },
  {
    id: 'dyn_bess_gfm_4q',
    catalog_namespace: 'der_dynamic_model',
    catalog_version: AUDIT2_CATALOG_VERSION,
    applicable_device_ids: ['bess_pcs_sma_2200'],
    label_pl: 'BESS grid-forming 4Q (k=4, t_resp=5ms)',
    model_type: 'bess_grid_forming',
    response_time_ms: 5,
    k_factor_iq_over_du: 4.0,
    iq_max_during_fault_pu: 1.2,
    p_recovery_rate_pu_per_s: 10.0,
    voltage_drop_detection_time_ms: 5,
  },
  {
    id: 'dyn_bess_gfl_4q',
    catalog_namespace: 'der_dynamic_model',
    catalog_version: AUDIT2_CATALOG_VERSION,
    applicable_device_ids: ['bess_pcs_abb_500'],
    label_pl: 'BESS grid-following 4Q (k=2.5, t_resp=15ms)',
    model_type: 'bess_grid_following',
    response_time_ms: 15,
    k_factor_iq_over_du: 2.5,
    iq_max_during_fault_pu: 1.0,
    p_recovery_rate_pu_per_s: 8.0,
    voltage_drop_detection_time_ms: 10,
  },
  {
    id: 'dyn_wt_pmsg_full',
    catalog_namespace: 'der_dynamic_model',
    catalog_version: AUDIT2_CATALOG_VERSION,
    applicable_device_ids: ['wt_vestas_v117_3450', 'wt_ge_158_5500'],
    label_pl: 'WT PMSG full-converter (k=2, t_resp=30ms)',
    model_type: 'wt_pmsg_full_converter',
    response_time_ms: 30,
    k_factor_iq_over_du: 2.0,
    iq_max_during_fault_pu: 1.0,
    p_recovery_rate_pu_per_s: 3.0,
    voltage_drop_detection_time_ms: 15,
  },
  {
    id: 'dyn_wt_dfig',
    catalog_namespace: 'der_dynamic_model',
    catalog_version: AUDIT2_CATALOG_VERSION,
    applicable_device_ids: ['wt_siemens_swt_2300_113'],
    label_pl: 'WT DFIG (transient 4-6×In, k=2.5, t_resp=20ms)',
    model_type: 'wt_dfig',
    response_time_ms: 20,
    k_factor_iq_over_du: 2.5,
    iq_max_during_fault_pu: 1.1,
    p_recovery_rate_pu_per_s: 4.0,
    voltage_drop_detection_time_ms: 10,
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

/** Naprawa B.1: pobiera szczegóły uziemienia neutralnego stacji. */
export function getMvNeutralGrounding(id: string): MvNeutralGroundingItem | null {
  return MV_NEUTRAL_GROUNDING_CATALOG.find((g) => g.id === id) ?? null;
}

/**
 * Poziom napięcia nN — WYPROWADZONY z referencji (karta FAB-J), nie z katalogu
 * lokalnego: referencja JEST wartością napięcia w kV (patrz
 * `derRemoteCatalogs.ts::useLvVoltageLevelsKv`, lista dostępnych poziomów
 * pochodzi z `un_kv` katalogu przekształtników). Ta funkcja tylko PARSUJE i
 * formatuje — nie ma już drugiego źródła prawdy do sprawdzenia.
 */
export function getLvVoltageLevel(ref: string | null): { nominal_kv: number } | null {
  if (!ref) return null;
  const nominal_kv = Number(ref);
  return Number.isFinite(nominal_kv) && nominal_kv > 0 ? { nominal_kv } : null;
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

/** Naprawa A.1: pobiera dane zwarciowe dla danego device_id. */
export function getFaultCurrentDataForDevice(
  deviceId: string,
): DerFaultCurrentDataItem | null {
  return (
    DER_FAULT_CURRENT_DATA_CATALOG.find((d) => d.applicable_device_ids.includes(deviceId)) ?? null
  );
}

/** Naprawa A.5: pobiera model dynamiczny dla danego device_id. */
export function getDynamicModelForDevice(deviceId: string): DerDynamicModelItem | null {
  return DER_DYNAMIC_MODEL_CATALOG.find((d) => d.applicable_device_ids.includes(deviceId)) ?? null;
}

/**
 * Naprawa A.3: oblicza współczynnik κ (peak short-circuit factor) z R/X
 * zgodnie z IEC 60909-0 Sekcja 8.1.3 (metoda B):
 *
 *   κ = 1.02 + 0.98 · exp(-3 · R/X)
 *
 * Prąd udarowy ip = κ · √2 · Ik″.
 */
export function computeKappa(rx_ratio: number): number {
  if (rx_ratio < 0) return 1.0;
  return 1.02 + 0.98 * Math.exp(-3 * rx_ratio);
}

// =============================================================================
// 10. BessOperationModeCatalog (Naprawa eng.10 — audyt OZE)
// =============================================================================
//
// PROWENIENCJA (karta K-Q, 2026-08-14) — mirror wyrównany do stanu backendu.
// Pozycja opisuje USŁUGĘ, którą magazyn ma świadczyć: jej nazwę, sens i wymagania
// wobec przekształtnika. USUNIĘTO cztery pola, które udawały dane:
//   * `reserved_capacity_percent` — decyzja projektowa konkretnego projektu (i
//     przedmiot umowy rynkowej), a nie własność trybu pracy; backend wstawiał tę
//     liczbę do modelu przed rozpływem;
//   * `max_duration_h` — wynika z pojemności konkretnego magazynu;
//   * `response_time_s` — dla usług bilansujących określa go regulamin rynku
//     operatora systemu przesyłowego, dla peak shavingu nikt go nie określa;
//   * `required_for_nc_rfg_modules` — deklaracja, że NC RfG WYMAGA danej usługi
//     od modułu typu C/D. Sprawdzone na tekście rozporządzenia (UE) 2016/631:
//     ono nie nakazuje modułom wytwórczym świadczenia FCR-N / FCR-D / aFRR /
//     mFRR — to produkty rynku bilansującego, a nie warunek przyłączenia.
// Zostają `requires_four_quadrant` / `requires_grid_forming`: to nie cudza dana,
// tylko własność samej usługi.

export interface BessOperationModeItem {
  readonly id: string;
  readonly catalog_namespace: 'bess_operation_mode';
  readonly catalog_version: string;
  readonly label_pl: string;
  readonly description_pl: string;
  readonly mode_code:
    | 'peak_shaving'
    | 'arbitrage'
    | 'fcr_n'
    | 'fcr_d_up'
    | 'fcr_d_down'
    | 'afrr'
    | 'mfrr'
    | 'voltage_support'
    | 'island_backup'
    | 'self_consumption';
  /** Usługa wymaga przekształtnika pracującego w czterech ćwiartkach. */
  readonly requires_four_quadrant: boolean;
  /** Usługa wymaga przekształtnika tworzącego napięcie (grid-forming). */
  readonly requires_grid_forming: boolean;
}

export const BESS_OPERATION_MODE_CATALOG: ReadonlyArray<BessOperationModeItem> = Object.freeze([
  {
    id: 'mode_peak_shaving',
    catalog_namespace: 'bess_operation_mode',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'Peak shaving (redukcja szczytu)',
    description_pl: 'Wyładowanie magazynu w szczytach obciążenia odbiorcy, żeby obniżyć moc szczytową i opłaty dystrybucyjne.',
    mode_code: 'peak_shaving',
    requires_four_quadrant: false,
    requires_grid_forming: false,
  },
  {
    id: 'mode_arbitrage',
    catalog_namespace: 'bess_operation_mode',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'Arbitraż cenowy (przesunięcie energii w czasie)',
    description_pl: 'Ładowanie w godzinach niskich cen energii, wyładowanie w godzinach wysokich. Opłacalność zależy od cennika rynku, który nie jest daną katalogową.',
    mode_code: 'arbitrage',
    requires_four_quadrant: false,
    requires_grid_forming: false,
  },
  {
    id: 'mode_fcr_n',
    catalog_namespace: 'bess_operation_mode',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'FCR-N (rezerwa pierwotna symetryczna)',
    description_pl: 'Symetryczna rezerwa pierwotna: magazyn zmienia moc czynną w obie strony wokół częstotliwości znamionowej. Wymagany czas reakcji, wielkość rezerwy i statyzm określa regulamin rynku bilansującego operatora systemu przesyłowego — nie ten katalog.',
    mode_code: 'fcr_n',
    requires_four_quadrant: true,
    requires_grid_forming: false,
  },
  {
    id: 'mode_fcr_d_up',
    catalog_namespace: 'bess_operation_mode',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'FCR-D (rezerwa awaryjna w górę)',
    description_pl: 'Rezerwa pierwotna asymetryczna w górę, uruchamiana przy zakłóceniu podczęstotliwościowym. Próg uruchomienia i profil narastania mocy określa regulamin rynku bilansującego, nie ten katalog.',
    mode_code: 'fcr_d_up',
    requires_four_quadrant: true,
    requires_grid_forming: false,
  },
  {
    id: 'mode_afrr',
    catalog_namespace: 'bess_operation_mode',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'aFRR (rezerwa wtórna automatyczna)',
    description_pl: 'Rezerwa wtórna sterowana automatycznie sygnałem operatora systemu przesyłowego, symetryczna w obie strony. Czasy aktywacji określa regulamin rynku bilansującego, nie ten katalog.',
    mode_code: 'afrr',
    requires_four_quadrant: true,
    requires_grid_forming: false,
  },
  {
    id: 'mode_mfrr',
    catalog_namespace: 'bess_operation_mode',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'mFRR (rezerwa wtórna ręczna)',
    description_pl: 'Rezerwa uruchamiana ręcznie komendą dyspozytora operatora systemu przesyłowego. Czas aktywacji i wymagany czas podtrzymania określa regulamin rynku bilansującego, nie ten katalog.',
    mode_code: 'mfrr',
    requires_four_quadrant: false,
    requires_grid_forming: false,
  },
  {
    id: 'mode_voltage_support',
    catalog_namespace: 'bess_operation_mode',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'Wsparcie napięciowe Q(U)',
    description_pl: 'Regulacja mocy biernej w funkcji napięcia w punkcie przyłączenia (charakterystyka Q(U)). Wymaga przekształtnika pracującego w czterech ćwiartkach; zakres regulacji wynika z karty przekształtnika i z warunków przyłączenia, nie z tego katalogu.',
    mode_code: 'voltage_support',
    requires_four_quadrant: true,
    requires_grid_forming: false,
  },
  {
    id: 'mode_island_backup',
    catalog_namespace: 'bess_operation_mode',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'Praca wyspowa (przekształtnik tworzący napięcie)',
    description_pl: 'Tworzenie napięcia po zaniku zasilania. Wymaga przekształtnika tworzącego napięcie (grid-forming). Powrót do pracy równoległej przez kontrolę synchronizmu (funkcja 25).',
    mode_code: 'island_backup',
    requires_four_quadrant: true,
    requires_grid_forming: true,
  },
  {
    id: 'mode_self_consumption',
    catalog_namespace: 'bess_operation_mode',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'Autokonsumpcja PV z magazynem',
    description_pl: 'Maksymalizacja autokonsumpcji instalacji PV: ładowanie nadwyżek generacji dziennej, wyładowanie wieczorne.',
    mode_code: 'self_consumption',
    requires_four_quadrant: false,
    requires_grid_forming: false,
  },
]);

/** Filtruje tryby pracy magazynu dostępne dla zdolności danego przekształtnika. */
export function selectBessModesForPcs(args: {
  readonly fourQuadrant: boolean;
  readonly gridFormingCapable: boolean;
}): readonly BessOperationModeItem[] {
  return BESS_OPERATION_MODE_CATALOG.filter((m) => {
    if (m.requires_four_quadrant && !args.fourQuadrant) return false;
    if (m.requires_grid_forming && !args.gridFormingCapable) return false;
    return true;
  });
}

// USUNIĘTY (karta K-Q, 2026-08-14): `selectRequiredBessModesForModule`.
// Zwracał tryby rzekomo WYMAGANE przez NC RfG dla danego typu modułu, na
// podstawie pola `required_for_nc_rfg_modules`. Rozporządzenie (UE) 2016/631
// sprawdzone u źródła nie nakazuje modułom wytwórczym świadczenia FCR-N /
// FCR-D / aFRR / mFRR — to produkty rynku bilansującego, a nie warunek
// przyłączenia. Pole i selektor zniknęły też po stronie backendu.

// =============================================================================
// 11. TapChangerCatalog (Naprawa eng.13 — audyt projektanta SN)
// =============================================================================
//
// Przełącznik zaczepów transformatora — kluczowy dla regulacji napięcia
// (VR control) i zarządzania w GPZ.
//
// PROWENIENCJA (karta K-Q, 2026-08-14) — mirror wyrównany do stanu backendu.
// Pozycja jest WARIANTEM REGULACJI, który projektant zadaje: liczba zaczepów,
// skok i zakres widnieją w jej nazwie i są ze sobą spójne. USUNIĘTO dwa pola,
// które opisywały KONKRETNY WYRÓB bez żadnego źródła: czas przełączenia
// (podaje go karta mechanizmu napędowego producenta) oraz resurs między
// przeglądami (gwarancja producenta, nie liczba do zgadnięcia).

export interface TapChangerItem {
  readonly id: string;
  readonly catalog_namespace: 'tap_changer';
  readonly catalog_version: string;
  readonly label_pl: string;
  /** Typ przełącznika: OLTC = on-load (pod obciążeniem), DETC = off-load. */
  readonly type: 'oltc' | 'detc';
  /** Pozycja neutralna (typowo 0 lub środek zakresu). */
  readonly neutral_position: number;
  /** Liczba zaczepów. */
  readonly tap_count: number;
  /** Krok napięcia per zaczep [%]. */
  readonly step_percent: number;
  /** Zakres regulacji [%] = (tap_count − 1) / 2 · step_percent. */
  readonly range_percent: number;
  /** Strona regulacji: HV (pierwotna) lub LV (wtórna). */
  readonly regulated_side: 'hv' | 'lv';
  /** Czy obsługuje AVR (Automatic Voltage Regulation). */
  readonly supports_avr: boolean;
  /** Stosowanie. */
  readonly applicable_to: ReadonlyArray<'transformer_110_15' | 'transformer_110_20' | 'transformer_15_04' | 'block_transformer'>;
}

export const TAP_CHANGER_CATALOG: ReadonlyArray<TapChangerItem> = Object.freeze([
  {
    id: 'tc_oltc_110sn_19_125',
    catalog_namespace: 'tap_changer',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'OLTC 110/SN · 19 zaczepów · ±11,25% · AVR',
    type: 'oltc',
    neutral_position: 0,
    tap_count: 19,
    step_percent: 1.25,
    range_percent: 11.25,
    regulated_side: 'hv',
    supports_avr: true,
    applicable_to: ['transformer_110_15', 'transformer_110_20'],
  },
  {
    id: 'tc_oltc_110sn_17_125',
    catalog_namespace: 'tap_changer',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'OLTC 110/SN · 17 zaczepów · ±10% · AVR',
    type: 'oltc',
    neutral_position: 0,
    tap_count: 17,
    step_percent: 1.25,
    range_percent: 10,
    regulated_side: 'hv',
    supports_avr: true,
    applicable_to: ['transformer_110_15', 'transformer_110_20'],
  },
  {
    id: 'tc_detc_snnn_5_25',
    catalog_namespace: 'tap_changer',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'DETC SN/nN · 5 zaczepów · ±5% (off-load)',
    type: 'detc',
    neutral_position: 0,
    tap_count: 5,
    step_percent: 2.5,
    range_percent: 5,
    regulated_side: 'hv',
    supports_avr: false,
    applicable_to: ['transformer_15_04', 'block_transformer'],
  },
  {
    id: 'tc_oltc_snnn_9_15',
    catalog_namespace: 'tap_changer',
    catalog_version: AUDIT2_CATALOG_VERSION,
    label_pl: 'OLTC SN/nN · 9 zaczepów · ±6% · AVR (przemysłowe)',
    type: 'oltc',
    neutral_position: 0,
    tap_count: 9,
    step_percent: 1.5,
    range_percent: 6,
    regulated_side: 'hv',
    supports_avr: true,
    applicable_to: ['transformer_15_04', 'block_transformer'],
  },
]);

/** Filtruje przełączniki zaczepów dla danego typu transformatora. */
export function selectTapChangersForTransformer(
  type: 'transformer_110_15' | 'transformer_110_20' | 'transformer_15_04' | 'block_transformer',
): readonly TapChangerItem[] {
  return TAP_CHANGER_CATALOG.filter((tc) => tc.applicable_to.includes(type));
}

/** Pobiera szczegóły przełącznika zaczepów. */
export function getTapChanger(id: string): TapChangerItem | null {
  return TAP_CHANGER_CATALOG.find((tc) => tc.id === id) ?? null;
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
