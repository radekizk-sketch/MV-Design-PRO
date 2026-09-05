import type { CtClass } from './protection-catalogs';

/**
 * StationDer types — jednolity model danych łączący Stację SN/nN (E-13)
 * z konfiguratorami DER (PV E-21, BESS E-22, FW E-23).
 *
 * Zasada: jeden DER = jeden obiekt z `station_context` + `pcc` + `catalog_refs`
 * + `profile_refs`. Brak duplikacji między E-13 i E-21/E-22/E-23.
 */

/**
 * Poziom przyłączenia DER — DOKŁADNIE DWIE decyzje fizyczne (karta FAB-K).
 *
 * Dawny 6-wariantowy `ConnectionSide` (`SN`/`nN`/`dedicated_transformer`/
 * `at_zksn`/`at_branch_pole`/`at_cable_joint`) mieszał DWIE ortogonalne decyzje
 * w jednym polu: (1) POZIOM przyłączenia — szyna nN stacji, albo sieć SN przez
 * transformator dedykowany (żadne urządzenie w katalogu przekształtników nie
 * łączy się z siecią SN bez pośredniczącego transformatora — stąd `SN` bez
 * transformatora nie istnieje fizycznie); (2) dla SN, PUNKT przyłączenia —
 * ISTNIEJĄCY element modelu, do którego podłącza się górna strona transformatora
 * dedykowanego. Cztery z sześciu dawnych wariantów (`SN`, `at_zksn`,
 * `at_branch_pole`, `at_cable_joint`) wysyłały ten sam wariant backendu
 * (`dedicated`/`block_transformer`) BEZ pozycji katalogowej transformatora —
 * gwarantowany 422 przy zapisie. Punkt przyłączenia SN jest teraz osobnym polem
 * (`sn_connection_bus_ref` na `StationDerConnection`, `SnConnectionPointKind`
 * niżej dla RODZAJU punktu — pochodna typu elementu w modelu, nie wybór).
 */
export type ConnectionSide = 'nN' | 'dedicated_transformer';

/**
 * Rodzaj punktu przyłączenia SN — POCHODNA typu elementu modelu, do którego
 * należy `sn_connection_bus_ref` (szyna stacji wg pól / `BranchPointSN` /
 * `Junction`), NIE osobny wybór projektanta. `null` gdy `connection_side` nie
 * jest `dedicated_transformer`, albo gdy punktu nie da się sklasyfikować.
 *
 * Mufa kablowa (`CableJoint`) NIE WYSTĘPUJE tu jako rodzaj punktu — mufa NIE MA
 * topologii w modelu (`enm/models.py`: „punkt na segmencie kabla SN BEZ podziału
 * topologii"), więc nie jest obliczalnym punktem przyłączenia. Projektant, który
 * chce przyłączyć DER w miejscu mufy, tworzy tam ODGAŁĘZIENIE (Junction/T-node)
 * kreatorem odgałęzienia i wskazuje JEGO szynę — stąd `junction`, nie `mufa`.
 */
export type SnConnectionPointKind = 'station_bus' | 'branch_pole' | 'zksn' | 'junction';

/** Rodzaj DER (zunifikowany dla 3 specjalizacji). */
export type DerKindUnified = 'PV' | 'BESS' | 'FW';

/** Status kompletności konfiguracji DER. */
export type DerCompleteness =
  | 'complete'
  | 'partial'
  | 'missing_catalog'
  | 'missing_profile'
  | 'voltage_mismatch'
  | 'no_pcc';

/**
 * Wybrane pozycje katalogowe per DER.
 *
 * PROWENIENCJA (karta FAB-K, 2026-09-05) — usunięto DWA pola FANTOMOWE (kontrolka
 * UI bez pełnego łańcucha katalog → zapis → odczyt → konsument, reguła KLASA
 * NIE INSTANCJA pkt R2):
 *   * `controller_catalog_ref` (regulator PV/farmy FW) — backend NIE MA katalogu
 *     regulatorów/kontrolerów (grep całego backendu: zero wyniku); istniejące
 *     pasma regulatorów IBG w `mv_converter_catalog.py` to OSZACOWANIA literaturowe
 *     wbudowane w tabliczkę urządzenia, nie osobna pozycja katalogowa z ID.
 *   * `cable_catalog_ref` (kabel wewnętrzny od PCC do urządzenia) — ŻADNA operacja
 *     domenowa go nie zapisuje, żaden kreator go nie zbiera; jedyny „konsument"
 *     był etykietą w panelu OZE, która nigdy nie miała czego wyświetlić.
 */
export interface DerCatalogSelections {
  /** Katalog falownika PV / PCS BESS / turbiny FW. */
  readonly device_catalog_ref: string | null;
  /**
   * Wpis certyfikatu PTPiREE dla falownika/konwertera DER — POCHODNA materializacji
   * urządzenia (`materialized_params.ptpiree_certificate_ref`, backend
   * `_certyfikat_ptpiree_z_katalogu`), nie osobny wybór projektanta.
   */
  readonly ptpiree_certificate_ref: string | null;
  /**
   * Bateria BESS (tylko BESS) — katalog `BATERIA_BESS` (`GET
   * /api/catalog/bess-battery-types`, FAB-J), wiązanie i walidacja istnienia
   * w żądaniu tworzenia (`battery_catalog_ref`, FAB-K).
   */
  readonly battery_catalog_ref: string | null;
  /** Pole SN jeśli connection_side='dedicated_transformer'. */
  readonly bay_catalog_ref: string | null;
  /** Zabezpieczenie. */
  readonly protection_catalog_ref: string | null;
  /** Przekładniki CT/VT. */
  readonly ct_catalog_ref: string | null;
  readonly vt_catalog_ref: string | null;
  /**
   * Naprawa A (audyt profesora): dane składowych symetrycznych z katalogu
   * urządzenia. Wymagane dla obliczeń SC1F/SC2FG (IEC 60909-3) + asymetrii.
   * Format ref: `der_fault_current_data_{device_id}` z polami R0/X0/Z0Z1.
   */
  readonly fault_current_data_ref: string | null;
  /**
   * Naprawa A (audyt profesora): model dynamiczny (PMSG/DFIG/SCIG dla FW,
   * grid-following/forming dla PV/BESS) — wymagane dla solvera RMS i FRT/HVRT.
   */
  readonly dynamic_model_ref: string | null;
  /**
   * Transformator dedykowany (blokowy) z katalogu, gdy connection_side='dedicated_transformer'.
   *
   * V12K-244: to JEDYNE pole opisujące ten transformator. Kontrakt miał wcześniej DRUGIE
   * pole o tym samym znaczeniu (`transformer_catalog_ref`), którego NIE ZAPISYWAŁA żadna
   * ścieżka produkcyjna — a właśnie je czytała reguła gotowości. Skutek: oś „Dowód
   * aparatury" dla wytwórcy z transformatorem dedykowanym była TRWALE „częściowo"
   * z powodem „brak transformatora dedykowanego", mimo że projektant go wybrał.
   */
  readonly block_transformer_catalog_ref: string | null;
}

export const EMPTY_DER_CATALOGS: DerCatalogSelections = Object.freeze({
  device_catalog_ref: null,
  ptpiree_certificate_ref: null,
  battery_catalog_ref: null,
  bay_catalog_ref: null,
  protection_catalog_ref: null,
  ct_catalog_ref: null,
  vt_catalog_ref: null,
  fault_current_data_ref: null,
  dynamic_model_ref: null,
  block_transformer_catalog_ref: null,
});

/**
 * Wybrane profile zgodności przyłączeniowej i wymagań.
 *
 * PROWENIENCJA (karta FAB-K, 2026-09-05) — usunięto `regulation_profile_ref`
 * (profil regulacji Q(U)/P(f)): backend NIE MA katalogu „nazwanych profili
 * regulacji" — parametry Q(U)/P(f) są liczbami zapisywanymi WPROST na
 * generatorze (`qu_slope_pu_per_pu`, `frequency_droop_percent`, …, `meta`
 * `add_converter_source`), nie referencją do pozycji katalogowej. Pole nie
 * miało żadnego zapisu produkcyjnego — tylko odczyt bez źródła.
 */
export interface DerProfileSelections {
  /** Operator (PSE/Energa/Tauron/Enea/PGE) — `nc-rfg-profile-catalog`. */
  readonly nc_rfg_profile_ref: string | null;
  /** Krzywa LVRT (Low Voltage Ride Through). */
  readonly lvrt_curve_ref: string | null;
  /** Krzywa HVRT (High Voltage Ride Through). */
  readonly hvrt_curve_ref: string | null;
  /** Pakiet H: krzywa P(f) (NC RfG Art. 13/15) — operator-specific. */
  readonly pf_curve_ref: string | null;
  /** Pakiet H: tryby pracy BESS (multi-select, NC RfG Art. 13/15). */
  readonly bess_operation_mode_refs: readonly string[];
}

export const EMPTY_DER_PROFILES: DerProfileSelections = Object.freeze({
  nc_rfg_profile_ref: null,
  lvrt_curve_ref: null,
  hvrt_curve_ref: null,
  pf_curve_ref: null,
  bess_operation_mode_refs: [],
});

/** Status pojedynczej macierzy gotowości obliczeń per typ. */
export type ReadinessAxisStatus =
  | 'ready'
  | 'partial'
  | 'blocked'
  | 'not_applicable'
  | 'no_module';

/** Macierz gotowości obliczeń DER (14 osi). */
export interface DerReadinessMatrix {
  readonly sc_3f: ReadinessAxisStatus;
  readonly sc_1f: ReadinessAxisStatus;
  readonly sc_2f: ReadinessAxisStatus;
  readonly sc_2fg: ReadinessAxisStatus;
  readonly vdrop: ReadinessAxisStatus;
  readonly q_u: ReadinessAxisStatus;
  readonly equipment: ReadinessAxisStatus;
  readonly protection: ReadinessAxisStatus;
  readonly protection_selectivity: ReadinessAxisStatus;
  readonly frt: ReadinessAxisStatus;
  readonly hvrt: ReadinessAxisStatus;
  readonly nc_rfg: ReadinessAxisStatus;
  readonly report_osd: ReadinessAxisStatus;
  readonly report_technical: ReadinessAxisStatus;
}

export const EMPTY_DER_READINESS: DerReadinessMatrix = Object.freeze({
  sc_3f: 'blocked',
  sc_1f: 'blocked',
  sc_2f: 'blocked',
  sc_2fg: 'blocked',
  vdrop: 'blocked',
  q_u: 'blocked',
  equipment: 'blocked',
  protection: 'blocked',
  protection_selectivity: 'blocked',
  frt: 'blocked',
  hvrt: 'blocked',
  nc_rfg: 'blocked',
  report_osd: 'blocked',
  report_technical: 'blocked',
});

/**
 * Pełny rekord przyłączenia DER do stacji.
 *
 * Zasada single source of truth — ten obiekt jest używany jako:
 *   - rząd tabeli "Układy PV/BESS/FW" w E-13 Karta 7
 *   - dane konfiguratora w E-21/E-22/E-23
 *   - źródło kontekstu dla Proof (E-36) i Report (E-25/E-37)
 *   - źródło readiness (E-04)
 *   - źródło renderera DER w SldCanvasV2
 */
export interface StationDerConnection {
  readonly id: string;
  readonly project_id: string;
  readonly station_id: string;
  readonly der_kind: DerKindUnified;
  readonly name: string;

  /** Konfiguracja przyłączenia. */
  readonly connection_side: ConnectionSide;
  /** Punkt wspólnego przyłączenia (PCC). Format: `{stationId}__{busbarId}__{nominal_kv}`. */
  readonly bus_przylaczenia_ref: string | null;
  /**
   * V12K-232: klasa dokladnosci i zastosowanie przypisanego przekladnika PRADOWEGO,
   * rozwiazane z PRAWDZIWEGO katalogu (`/api/catalog/ct-types`). Regula normowa
   * IEC 61869-2 (klasa 5P/10P dla zabezpieczen) oraz warunek 87T (rdzen podwojny)
   * czytaja te DANE, a nie szukaja identyfikatora w rownoleglym katalogu frontu —
   * tamten ma zerowe pokrycie ID z backendem, wiec dla realnego przekladnika regula
   * nigdy nie mogla byc spelniona.
   */
  readonly ct_accuracy_class?: CtClass | null;
  readonly ct_application?: 'protection' | 'metering' | 'dual' | null;
  /** Pole SN — jeśli `connection_side='dedicated_transformer'` i punkt to `station_bus`. */
  readonly bay_ref: string | null;
  /** Transformator dedykowany — jeśli `connection_side='dedicated_transformer'`. */
  readonly transformer_ref: string | null;
  /** Szyna nN — jeśli `connection_side='nN'`. */
  readonly lv_busbar_ref: string | null;
  /**
   * Punkt przyłączenia SN (karta FAB-K) — szyna ISTNIEJĄCA w modelu, do której
   * podłącza się górna strona transformatora dedykowanego: szyna SN stacji,
   * `BranchPointSN.bus_ref` (ZK SN / słup rozgałęźny) albo szyna `Junction`
   * (odgałęzienie). Wymagany gdy `connection_side='dedicated_transformer'`.
   * Zastępuje dawny `connection_node_ref`, który fabrykował referencje w UI
   * (`node_zksn_<nazwa>` itp.) zamiast wskazywać istniejący element.
   */
  readonly sn_connection_bus_ref: string | null;
  /** Rodzaj punktu `sn_connection_bus_ref` — pochodna typu elementu, nie wybór. */
  readonly sn_connection_point_kind: SnConnectionPointKind | null;

  /** Parametry techniczne — wszystkie z katalogów. */
  readonly catalogs: DerCatalogSelections;

  /** Profile zgodności i regulacji — z katalogów profili. */
  readonly profiles: DerProfileSelections;

  /**
   * Moc znamionowa AC CAŁEJ pozycji w kW — tyle wnosi ten rekord do modelu.
   *
   * E21-1: operacja kanoniczna zapisuje do modelu `p_mw` = moc katalogowa jednostki
   * × liczba sztuk, więc dla grupy falowników jest to moc GRUPY, nie jednostki.
   * Rozbicie na jednostkę i liczbę sztuk daje `identyfikacjaMocy` — ekran ma pokazać
   * oba poziomy, bo od nich zależą prądy robocze, dobór transformatora, CT i kategoria
   * NC RfG.
   */
  readonly nominal_power_kw: number | null;

  /**
   * Liczba jednostek wytwórczych w tej pozycji (`quantity` w modelu).
   *
   * `null` znaczy „model nie niesie tej danej" i MUSI zostać brakiem — podstawienie
   * jednej sztuki zamieniałoby brak danej w wartość i fałszowało moc jednostkową
   * (audyt E-21 pkt P2: sprzeczność 1 MW / 8 MW nie była nawet wykrywalna).
   */
  readonly unit_count: number | null;

  /**
   * Napięcie znamionowe SZYNY PRZYŁĄCZENIA [kV] odczytane Z MODELU (migawka ENM).
   *
   * PO CO. JEDYNE źródło napięcia przyłączenia od karty FAB-K — dawny
   * `voltage_level_ref` (osobna referencja katalogu poziomów, zapisywana WYŁĄCZNIE
   * przez kreator stacji) był FANTOMEM: backend go nie przyjmuje (`_build_domain_payload`
   * dla `nn_side` sam bierze szynę nN stacji), a katalog poziomów nie znał np. 0,8 kV
   * (typowe napięcie falowników string) — ocena zgodności NC RfG meldowała wtedy „brak
   * danych" dla urządzenia, którego napięcie stoi w modelu na szynie przyłączenia.
   * Pole usunięte; to jest jedyne napięcie przyłączenia.
   *
   * To NIE jest domysł ani wartość domyślna: `null` zostaje `null`, a wartość
   * pochodzi z `buses[].voltage_kv` szyny, do której wytwórca jest przyłączony.
   * Pole jest OPCJONALNE (addytywne) — rekordy sprzed tej daty go nie mają.
   */
  readonly connection_voltage_kv?: number | null;

  /** Status kompletności + macierz gotowości. */
  readonly completeness: DerCompleteness;
  readonly readiness: DerReadinessMatrix;

  /** Audit: kiedy utworzony / ostatnio zmodyfikowany. */
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * Komputowalny status kompletności DER na podstawie pól.
 *
 * Reguły:
 *  - Brak PCC → no_pcc
 *  - Brak catalog urządzenia → missing_catalog
 *  - Brak profilu NC RfG → missing_profile
 *  - Napięcie przyłączenia nierozpoznane z modelu (`connection_voltage_kv`) →
 *    missing_catalog (dotyczy obu poziomów — nN i dedicated_transformer;
 *    dawny wyjątek „SN i dedicated_transformer nie wymagają" odpadł razem
 *    z fantomem `voltage_level_ref`, którego dotyczył).
 *  - Dla `dedicated_transformer` brak wskazanego punktu przyłączenia SN
 *    (`sn_connection_bus_ref`) → missing_catalog (backend odrzuci zapis 422
 *    bez tego pola — kompletność frontu musi to nazwać PRZED próbą zapisu).
 *  - Voltage mismatch sprawdza wyższa warstwa porównująca napięcie szyny
 *    z napięciem urządzenia (potrzebuje katalogu).
 */
export function computeDerCompleteness(der: Pick<
  StationDerConnection,
  | 'connection_side'
  | 'bus_przylaczenia_ref'
  | 'catalogs'
  | 'profiles'
  | 'connection_voltage_kv'
  | 'sn_connection_bus_ref'
>): DerCompleteness {
  if (!der.bus_przylaczenia_ref) return 'no_pcc';
  if (!der.catalogs.device_catalog_ref) return 'missing_catalog';
  if (!der.profiles.nc_rfg_profile_ref) return 'missing_profile';
  if (der.connection_voltage_kv == null) return 'missing_catalog';
  if (der.connection_side === 'dedicated_transformer' && !der.sn_connection_bus_ref) {
    return 'missing_catalog';
  }
  return 'complete';
}
