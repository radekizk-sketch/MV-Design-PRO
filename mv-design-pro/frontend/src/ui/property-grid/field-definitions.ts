/**
 * Property Grid Field Definitions
 *
 * CANONICAL ALIGNMENT:
 * - wizard_screens.md § 3: Complete Property Grid specs for each element type
 * - ui_canonical_parity.md § D: Property Grid rules
 *
 * DETERMINISTIC ORDER (per ui_canonical_parity.md § D.3):
 * 1. Identyfikacja (ID, Nazwa, UUID)
 * 2. Stan (W eksploatacji, Cykl życia)
 * 3. Topologia (Szyna początkowa, końcowa)
 * 4. Referencja typu (type_ref) — READ-ONLY
 * 5. Parametry elektryczne z typu — READ-ONLY
 * 6. Parametry lokalne (długość, zaczep) — edytowalne
 * 7. Wartości obliczeniowe — READ-ONLY
 * 8. Stan walidacji — komunikaty błędów/ostrzeżeń
 * 9. Metadane audytowe — READ-ONLY
 */

import type { ElementType, OperatingMode, PropertyField, PropertySection } from '../types';
import { definicjaPolaSiatki } from '../../ui2/model/rejestrPol';

/**
 * Wartość pola siatki z surowego rekordu modelu (karta JEDNA-SCIEZKA-EDYCJI).
 *
 * Pole z rejestru pól czyta wartość odczytem swojej definicji (np. zaczep z podzespołu
 * `tap_changer`); pole odczytu czyta klucz modelu, także zagnieżdżony (`rating.in_a`).
 * Brak wartości w modelu = `null` — siatka nie pokazuje wartości wpisanej w kod (dawne
 * „domyślne" 15 kV, 1 km, 5000 MVA udawały dane modelu). Wyjątkiem jest stała opisowa
 * `element_type`, która nie jest daną modelu.
 */
export function wartoscPolaZModelu(
  elementType: ElementType,
  field: PropertyField,
  dane: Readonly<Record<string, unknown>>
): unknown {
  const definicja = definicjaPolaSiatki(elementType, field.key);
  if (definicja) return definicja.odczyt(dane);
  let biezacy: unknown = dane;
  for (const czesc of field.key.split('.')) {
    if (typeof biezacy !== 'object' || biezacy === null) {
      biezacy = undefined;
      break;
    }
    biezacy = (biezacy as Record<string, unknown>)[czesc];
  }
  if (biezacy !== undefined && biezacy !== null) return biezacy;
  return field.key === 'element_type' ? field.value : null;
}

/**
 * Section order (canonical, deterministic).
 */
export const SECTION_ORDER = [
  'identification',
  'state',
  'topology',
  'type_reference',
  'type_params',
  'local_params',
  'calculated',
  'validation',
  'audit',
] as const;

/**
 * Section labels (Polish, per wizard_screens.md).
 */
export const SECTION_LABELS: Record<string, string> = {
  identification: 'Identyfikacja',
  state: 'Stan',
  topology: 'Topologia',
  type_reference: 'Referencja typu',
  type_params: 'Parametry typu (z katalogu)',
  local_params: 'Parametry lokalne',
  electrical_params: 'Parametry elektryczne',
  calculated: 'Wartości obliczeniowe',
  validation: 'Stan walidacji',
  audit: 'Metadane audytowe',
  nameplate: 'Dane znamionowe',
  oltc: 'Przełącznik zaczepów (OLTC)',
  short_circuit: 'Parametry zwarciowe',
  power_flow: 'Parametry rozpływu mocy',
};

/**
 * Field definitions for Bus (Szyna).
 * Per wizard_screens.md § 3.1.
 */
export function getBusFieldDefinitions(): PropertySection[] {
  return [
    {
      id: 'identification',
      label: SECTION_LABELS.identification,
      fields: [
        { key: 'id', label: 'ID', value: '', type: 'string', editable: false, source: 'instance' },
        { key: 'name', label: 'Nazwa', value: '', type: 'string', editable: true, source: 'instance' },
        // Odbiór K7c-FE (klasa fantomów kluczy vs model ENM, ta sama co bus_ref/sn_voltage_kv):
        // `ENMElement` ma `id` (UUID, wiersz wyżej) i `ref_id` (identyfikator kanoniczny) —
        // klucz `uuid` nie istnieje w żadnym elemencie, pole zawsze pokazywało puste „—".
        { key: 'ref_id', label: 'Identyfikator kanoniczny', value: '', type: 'string', editable: false, source: 'instance' },
        { key: 'element_type', label: 'Typ obiektu', value: 'Bus', type: 'string', editable: false, source: 'instance' },
      ],
    },
    // Karta JEDNA-SCIEZKA-EDYCJI: sekcja „Stan" (W eksploatacji / Cykl życia) skasowana —
    // model ENM nie ma ani `in_service`, ani `lifecycle_state` (backend odrzucał oba klucze
    // kodem `params.key_not_allowed`). Element wyłączony z ruchu to scenariusz łączeniowy
    // przypadku (`OperatingScenario.out_of_service`), nie flaga elementu modelu.
    {
      id: 'electrical_params',
      label: SECTION_LABELS.electrical_params,
      fields: [
        { key: 'voltage_kv', label: 'Napięcie znamionowe', value: null, type: 'number', unit: 'kV', editable: true, source: 'instance' },
        // Karta K7c-FE (grep property-grid vs modelem ENM Bus, ta sama klasa co
        // naprawione Source.voltage_kv→sn_voltage_kv): `Bus` ENM (`types/enm.ts`,
        // `backend/src/enm/models.py::Bus`) NIE MA pól `bus_type`/`rated_current_a` —
        // pokazywały zaszyte wartości domyślne ('ZBIORCZA'/1000) i zapisywały klucze,
        // których nic w modelu nie czyta (fantom; `update_element_parameters` dla
        // kolekcji `buses` nie ma allowlisty, więc zapis nie sygnalizuje błędu —
        // po prostu ląduje w nieczytanym polu surowego rekordu). Usunięte, nie
        // przemianowane: żaden realny odpowiednik w modelu Bus nie istnieje.
      ],
    },
    {
      id: 'calculated',
      label: SECTION_LABELS.calculated,
      fields: [
        { key: 'u_calculated', label: 'U obliczone', value: null, type: 'number', unit: 'kV', editable: false, source: 'calculated' },
        { key: 'angle_deg', label: 'Kąt napięcia', value: null, type: 'number', unit: '°', editable: false, source: 'calculated' },
        { key: 'ikss_ka', label: 'Ik"', value: null, type: 'number', unit: 'kA', editable: false, source: 'calculated' },
        { key: 'ip_ka', label: 'ip', value: null, type: 'number', unit: 'kA', editable: false, source: 'calculated' },
      ],
    },
    {
      id: 'audit',
      label: SECTION_LABELS.audit,
      fields: [
        { key: 'created_at', label: 'Data utworzenia', value: '', type: 'string', editable: false, source: 'audit' },
        { key: 'created_by', label: 'Utworzył', value: '', type: 'string', editable: false, source: 'audit' },
        { key: 'modified_at', label: 'Data modyfikacji', value: '', type: 'string', editable: false, source: 'audit' },
        { key: 'modified_by', label: 'Zmodyfikował', value: '', type: 'string', editable: false, source: 'audit' },
      ],
    },
  ];
}

/**
 * Field definitions for LineBranch (Linia/Kabel).
 * Per wizard_screens.md § 3.2.
 */
export function getLineBranchFieldDefinitions(): PropertySection[] {
  return [
    {
      id: 'identification',
      label: SECTION_LABELS.identification,
      fields: [
        { key: 'id', label: 'ID', value: '', type: 'string', editable: false, source: 'instance' },
        { key: 'name', label: 'Nazwa', value: '', type: 'string', editable: true, source: 'instance' },
        // Odbiór K7c-FE (klasa fantomów kluczy vs model ENM, ta sama co bus_ref/sn_voltage_kv):
        // `ENMElement` ma `id` (UUID, wiersz wyżej) i `ref_id` (identyfikator kanoniczny) —
        // klucz `uuid` nie istnieje w żadnym elemencie, pole zawsze pokazywało puste „—".
        { key: 'ref_id', label: 'Identyfikator kanoniczny', value: '', type: 'string', editable: false, source: 'instance' },
        { key: 'element_type', label: 'Typ obiektu', value: 'LineBranch', type: 'string', editable: false, source: 'instance' },
      ],
    },
    {
      id: 'state',
      label: SECTION_LABELS.state,
      fields: [
        // Karta JEDNA-SCIEZKA-EDYCJI: „W eksploatacji" i „Cykl życia" (klucze nieobecne
        // w modelu, odrzucane przez backend) zastąpione realnym stanem łączeniowym odcinka
        // `status` (gałąź wyłączona z ruchu = otwarta). Zapis: rejestr pól `POLE_STAN_ODCINKA`.
        { key: 'status', label: 'Stan łączeniowy', value: null, type: 'enum', editable: true, enumOptions: ['closed', 'open'], enumLabels: { closed: 'załączony', open: 'wyłączony' }, source: 'instance' },
      ],
    },
    {
      id: 'topology',
      label: SECTION_LABELS.topology,
      fields: [
        // Odbiór K7c-FE: klucze zgodne z modelem ENM `BranchBase.from_bus_ref`/`to_bus_ref`.
        // Karta JEDNA-SCIEZKA-EDYCJI: końce odcinka tylko do odczytu — przepięcie końca to
        // operacja topologiczna (backend odrzucał klucze `params.key_not_allowed`).
        { key: 'from_bus_ref', label: 'Szyna początkowa', value: null, type: 'ref', refType: 'Bus', editable: false, source: 'instance' },
        { key: 'to_bus_ref', label: 'Szyna końcowa', value: null, type: 'ref', refType: 'Bus', editable: false, source: 'instance' },
      ],
    },
    {
      id: 'type_reference',
      label: SECTION_LABELS.type_reference,
      fields: [
        {
          key: 'catalog_ref',
          label: 'Typ przewodu (katalog)',
          value: null,
          type: 'type_ref_with_actions',
          editable: true, // Buttons available in MODEL_EDIT
          source: 'type',
        },
      ],
    },
    {
      id: 'type_params',
      label: SECTION_LABELS.type_params,
      fields: [
        { key: 'r_ohm_per_km', label: "Rezystancja R'", value: null, type: 'number', unit: 'Ω/km', editable: false, source: 'type' },
        { key: 'x_ohm_per_km', label: "Reaktancja X'", value: null, type: 'number', unit: 'Ω/km', editable: false, source: 'type' },
        // Karta JEDNA-SCIEZKA-EDYCJI: klucze modelu ENM (dawne `c_nf_per_km`/`b_us_per_km`/
        // `rated_current_a` nie istniały w rekordzie odcinka — pola zawsze „brak danych").
        { key: 'b_siemens_per_km', label: "Susceptancja B'", value: null, type: 'number', unit: 'S/km', editable: false, source: 'type' },
        { key: 'rating.in_a', label: 'Prąd dopuszczalny', value: null, type: 'number', unit: 'A', editable: false, source: 'type' },
      ],
    },
    {
      id: 'local_params',
      label: SECTION_LABELS.local_params,
      fields: [
        // Karta JEDNA-SCIEZKA-EDYCJI: rodzaj odcinka z klucza modelu `type` — odczyt (kabel ↔ linia
        // to inny element, nie edycja pola; klucz `branch_type` backend odrzucał).
        { key: 'type', label: 'Rodzaj', value: null, type: 'enum', editable: false, enumOptions: ['cable', 'line_overhead'], enumLabels: { cable: 'kabel', line_overhead: 'linia napowietrzna' }, source: 'instance' },
        // Długość: definicja rejestru pól (`POLE_DLUGOSC_ODCINKA_KM`) — ta sama walidacja co karta
        // odcinka i kreator magistrali.
        { key: 'length_km', label: 'Długość', value: null, type: 'number', unit: 'km', editable: true, source: 'instance' },
      ],
    },
    {
      id: 'calculated',
      label: SECTION_LABELS.calculated,
      fields: [
        { key: 'r_total_ohm', label: 'R całkowite', value: null, type: 'number', unit: 'Ω', editable: false, source: 'calculated' },
        { key: 'x_total_ohm', label: 'X całkowite', value: null, type: 'number', unit: 'Ω', editable: false, source: 'calculated' },
        { key: 'z_total_ohm', label: 'Z całkowite', value: null, type: 'number', unit: 'Ω', editable: false, source: 'calculated' },
        { key: 'i_calculated_a', label: 'I obliczony', value: null, type: 'number', unit: 'A', editable: false, source: 'calculated' },
        { key: 'loading_percent', label: 'Obciążenie', value: null, type: 'number', unit: '%', editable: false, source: 'calculated' },
      ],
    },
    {
      id: 'audit',
      label: SECTION_LABELS.audit,
      fields: [
        { key: 'created_at', label: 'Data utworzenia', value: '', type: 'string', editable: false, source: 'audit' },
        { key: 'created_by', label: 'Utworzył', value: '', type: 'string', editable: false, source: 'audit' },
        { key: 'modified_at', label: 'Data modyfikacji', value: '', type: 'string', editable: false, source: 'audit' },
        { key: 'modified_by', label: 'Zmodyfikował', value: '', type: 'string', editable: false, source: 'audit' },
      ],
    },
  ];
}

/**
 * Field definitions for TransformerBranch.
 * Per wizard_screens.md § 3.3.
 */
export function getTransformerBranchFieldDefinitions(): PropertySection[] {
  return [
    {
      id: 'identification',
      label: SECTION_LABELS.identification,
      fields: [
        { key: 'id', label: 'ID', value: '', type: 'string', editable: false, source: 'instance' },
        { key: 'name', label: 'Nazwa', value: '', type: 'string', editable: true, source: 'instance' },
        // Odbiór K7c-FE (klasa fantomów kluczy vs model ENM, ta sama co bus_ref/sn_voltage_kv):
        // `ENMElement` ma `id` (UUID, wiersz wyżej) i `ref_id` (identyfikator kanoniczny) —
        // klucz `uuid` nie istnieje w żadnym elemencie, pole zawsze pokazywało puste „—".
        { key: 'ref_id', label: 'Identyfikator kanoniczny', value: '', type: 'string', editable: false, source: 'instance' },
        { key: 'element_type', label: 'Typ obiektu', value: 'TransformerBranch', type: 'string', editable: false, source: 'instance' },
      ],
    },
    // Karta JEDNA-SCIEZKA-EDYCJI: sekcja „Stan" (W eksploatacji / Cykl życia) skasowana —
    // model ENM nie ma ani `in_service`, ani `lifecycle_state` (backend odrzucał oba klucze
    // kodem `params.key_not_allowed`). Element wyłączony z ruchu to scenariusz łączeniowy
    // przypadku (`OperatingScenario.out_of_service`), nie flaga elementu modelu.
    {
      id: 'topology',
      label: SECTION_LABELS.topology,
      fields: [
        // Odbiór K7c-FE: klucze zgodne z modelem ENM `Transformer.hv_bus_ref`/`lv_bus_ref`.
        // Karta JEDNA-SCIEZKA-EDYCJI: odczyt — przyłączenie zmienia operacja topologiczna.
        { key: 'hv_bus_ref', label: 'Szyna GN', value: null, type: 'ref', refType: 'Bus', editable: false, source: 'instance' },
        { key: 'lv_bus_ref', label: 'Szyna DN', value: null, type: 'ref', refType: 'Bus', editable: false, source: 'instance' },
      ],
    },
    {
      id: 'type_reference',
      label: SECTION_LABELS.type_reference,
      fields: [
        {
          key: 'catalog_ref',
          label: 'Typ transformatora (katalog)',
          value: null,
          type: 'type_ref_with_actions',
          editable: true, // Buttons available in MODEL_EDIT
          source: 'type',
        },
      ],
    },
    {
      id: 'type_params',
      label: SECTION_LABELS.type_params,
      fields: [
        // Karta JEDNA-SCIEZKA-EDYCJI: klucze modelu ENM `Transformer` (były `rated_power_mva`,
        // `voltage_hv_kv`, `voltage_lv_kv` — klucze typu katalogowego, których rekord modelu nie
        // ma, więc pola pokazywały zawsze „brak danych").
        { key: 'sn_mva', label: 'Moc znamionowa Sn', value: null, type: 'number', unit: 'MVA', editable: false, source: 'type' },
        { key: 'uhv_kv', label: 'Napięcie GN', value: null, type: 'number', unit: 'kV', editable: false, source: 'type' },
        { key: 'ulv_kv', label: 'Napięcie DN', value: null, type: 'number', unit: 'kV', editable: false, source: 'type' },
        { key: 'uk_percent', label: 'Napięcie zwarcia uk%', value: null, type: 'number', unit: '%', editable: false, source: 'type' },
        { key: 'pk_kw', label: 'Straty obciążeniowe Pk', value: null, type: 'number', unit: 'kW', editable: false, source: 'type' },
        { key: 'i0_percent', label: 'Prąd jałowy i0%', value: null, type: 'number', unit: '%', editable: false, source: 'type' },
        { key: 'p0_kw', label: 'Straty jałowe P0', value: null, type: 'number', unit: 'kW', editable: false, source: 'type' },
        // W5-A: grupa połączeń WYŁĄCZNIE z typu katalogowego — szablon bez domyślnego Dyn11.
        { key: 'vector_group', label: 'Grupa połączeń', value: '', type: 'string', editable: false, source: 'type' },
      ],
    },
    {
      id: 'local_params',
      label: SECTION_LABELS.local_params,
      fields: [
        // Pozycja zaczepu z rejestru pól (`POLE_ZACZEP_TRANSFORMATORA`): podzespół `tap_changer`,
        // gdy transformator go ma, inaczej `tap_position` — zero wartości domyślnej.
        { key: 'tap_position', label: 'Aktualny zaczep', value: null, type: 'number', editable: true, source: 'instance' },
      ],
    },
    {
      id: 'calculated',
      label: SECTION_LABELS.calculated,
      fields: [
        { key: 'zk_ohm', label: 'Impedancja zwarcia Zk', value: null, type: 'number', unit: 'Ω', editable: false, source: 'calculated' },
        { key: 'rk_ohm', label: 'Rezystancja zwarcia Rk', value: null, type: 'number', unit: 'Ω', editable: false, source: 'calculated' },
        { key: 'xk_ohm', label: 'Reaktancja zwarcia Xk', value: null, type: 'number', unit: 'Ω', editable: false, source: 'calculated' },
        { key: 'turns_ratio', label: 'Przekładnia nominalna', value: null, type: 'number', editable: false, source: 'calculated' },
        { key: 'loading_percent', label: 'Obciążenie', value: null, type: 'number', unit: '%', editable: false, source: 'calculated' },
      ],
    },
    {
      id: 'audit',
      label: SECTION_LABELS.audit,
      fields: [
        { key: 'created_at', label: 'Data utworzenia', value: '', type: 'string', editable: false, source: 'audit' },
        { key: 'created_by', label: 'Utworzył', value: '', type: 'string', editable: false, source: 'audit' },
        { key: 'modified_at', label: 'Data modyfikacji', value: '', type: 'string', editable: false, source: 'audit' },
        { key: 'modified_by', label: 'Zmodyfikował', value: '', type: 'string', editable: false, source: 'audit' },
      ],
    },
  ];
}

/**
 * Field definitions for Switch (Łącznik).
 * Per wizard_screens.md § 3.5, § 3.6.
 */
export function getSwitchFieldDefinitions(): PropertySection[] {
  return [
    {
      id: 'identification',
      label: SECTION_LABELS.identification,
      fields: [
        { key: 'id', label: 'ID', value: '', type: 'string', editable: false, source: 'instance' },
        { key: 'name', label: 'Nazwa', value: '', type: 'string', editable: true, source: 'instance' },
        // Odbiór K7c-FE (klasa fantomów kluczy vs model ENM, ta sama co bus_ref/sn_voltage_kv):
        // `ENMElement` ma `id` (UUID, wiersz wyżej) i `ref_id` (identyfikator kanoniczny) —
        // klucz `uuid` nie istnieje w żadnym elemencie, pole zawsze pokazywało puste „—".
        { key: 'ref_id', label: 'Identyfikator kanoniczny', value: '', type: 'string', editable: false, source: 'instance' },
        { key: 'element_type', label: 'Typ obiektu', value: 'Switch', type: 'string', editable: false, source: 'instance' },
        // Karta JEDNA-SCIEZKA-EDYCJI: łącznik żyje w kolekcji `branches` (`SwitchBranch`/`FuseBranch`);
        // podtyp to klucz modelu `type` (dawny `switch_type` nie istniał w rekordzie).
        { key: 'type', label: 'Podtyp', value: null, type: 'enum', editable: false, enumOptions: ['breaker', 'switch', 'disconnector', 'bus_coupler', 'fuse'], enumLabels: { breaker: 'wyłącznik', switch: 'rozłącznik', disconnector: 'odłącznik', bus_coupler: 'sprzęgło', fuse: 'bezpiecznik' }, source: 'instance' },
      ],
    },
    {
      id: 'state',
      label: SECTION_LABELS.state,
      fields: [
        // Karta JEDNA-SCIEZKA-EDYCJI: położenie łącznika = `status` modelu, zapis WYŁĄCZNIE
        // operacją otwarcia/zamknięcia (`POLE_POLOZENIE_LACZNIKA`); `in_service`/`lifecycle_state`
        // nie istnieją w modelu.
        { key: 'status', label: 'Położenie', value: null, type: 'enum', editable: true, enumOptions: ['closed', 'open'], enumLabels: { closed: 'zamknięty', open: 'otwarty' }, source: 'instance' },
      ],
    },
    {
      id: 'topology',
      label: SECTION_LABELS.topology,
      fields: [
        // Klucze modelu `BranchBase.from_bus_ref`/`to_bus_ref` (dawne `from_node_id`/`to_node_id`
        // nie istniały); odczyt — przepięcie łącznika to operacja topologiczna.
        { key: 'from_bus_ref', label: 'Szyna', value: null, type: 'ref', refType: 'Bus', editable: false, source: 'instance' },
        { key: 'to_bus_ref', label: 'Szyna końcowa', value: null, type: 'ref', refType: 'Bus', editable: false, source: 'instance' },
      ],
    },
    {
      id: 'type_reference',
      label: SECTION_LABELS.type_reference,
      fields: [
        {
          key: 'catalog_ref',
          label: 'Typ aparatu (katalog)',
          value: null,
          type: 'type_ref_with_actions',
          editable: true, // Buttons available in MODEL_EDIT
          source: 'type',
        },
      ],
    },
    {
      id: 'type_params',
      label: SECTION_LABELS.type_params,
      // Parametry typu pochodzą z katalogu: bez danej (typ nieprzypisany albo pozycja bez
      // tej wartości, np. łącznik 110 kV bez I_k/I_cw) pole pokazuje „brak danych”, nie 0.
      fields: [
        { key: 'un_kv', label: 'Napięcie znamionowe Un', value: null, type: 'number', unit: 'kV', editable: false, source: 'type' },
        { key: 'in_a', label: 'Prąd znamionowy In', value: null, type: 'number', unit: 'A', editable: false, source: 'type' },
        { key: 'ik_ka', label: 'Prąd wyłączalny Ik', value: null, type: 'number', unit: 'kA', editable: false, source: 'type' },
        { key: 'icw_ka', label: 'Prąd wytrzymałości Icw', value: null, type: 'number', unit: 'kA', editable: false, source: 'type' },
        { key: 'medium', label: 'Ośrodek gaszący', value: '', type: 'string', editable: false, source: 'type' },
      ],
    },
    // Karta JEDNA-SCIEZKA-EDYCJI: dawna sekcja „Parametry elektryczne" łącznika (Un 15 kV,
    // In 1250 A, Ik 25 kA — wartości wpisane w kod, klucze nieobecne w `SwitchBranch`) skasowana.
    // Parametry znamionowe aparatu pochodzą z typu katalogowego (sekcja wyżej); wartość
    // projektanta aparatu SN to `overrides` w kreatorze edycji parametrów (zasada nr 4).
    {
      id: 'calculated',
      label: SECTION_LABELS.calculated,
      fields: [
        { key: 'i_calculated_a', label: 'I obliczony', value: null, type: 'number', unit: 'A', editable: false, source: 'calculated' },
        { key: 'ikss_at_location_ka', label: 'Ik" w miejscu', value: null, type: 'number', unit: 'kA', editable: false, source: 'calculated' },
        { key: 'utilization_percent', label: 'Współczynnik wykorzystania', value: null, type: 'number', unit: '%', editable: false, source: 'calculated' },
      ],
    },
    {
      id: 'audit',
      label: SECTION_LABELS.audit,
      fields: [
        { key: 'created_at', label: 'Data utworzenia', value: '', type: 'string', editable: false, source: 'audit' },
        { key: 'created_by', label: 'Utworzył', value: '', type: 'string', editable: false, source: 'audit' },
        { key: 'modified_at', label: 'Data modyfikacji', value: '', type: 'string', editable: false, source: 'audit' },
        { key: 'modified_by', label: 'Zmodyfikował', value: '', type: 'string', editable: false, source: 'audit' },
      ],
    },
  ];
}

/**
 * Field definitions for Source (Źródło - sieć zewnętrzna).
 * Per wizard_screens.md § 3.7.
 */
export function getSourceFieldDefinitions(): PropertySection[] {
  return [
    {
      id: 'identification',
      label: SECTION_LABELS.identification,
      fields: [
        { key: 'id', label: 'ID', value: '', type: 'string', editable: false, source: 'instance' },
        { key: 'name', label: 'Nazwa', value: '', type: 'string', editable: true, source: 'instance' },
        // Odbiór K7c-FE (klasa fantomów kluczy vs model ENM, ta sama co bus_ref/sn_voltage_kv):
        // `ENMElement` ma `id` (UUID, wiersz wyżej) i `ref_id` (identyfikator kanoniczny) —
        // klucz `uuid` nie istnieje w żadnym elemencie, pole zawsze pokazywało puste „—".
        { key: 'ref_id', label: 'Identyfikator kanoniczny', value: '', type: 'string', editable: false, source: 'instance' },
        { key: 'element_type', label: 'Typ obiektu', value: 'Source', type: 'string', editable: false, source: 'instance' },
      ],
    },
    // Karta JEDNA-SCIEZKA-EDYCJI: sekcja „Stan" (W eksploatacji / Cykl życia) skasowana —
    // model ENM nie ma ani `in_service`, ani `lifecycle_state` (backend odrzucał oba klucze
    // kodem `params.key_not_allowed`). Element wyłączony z ruchu to scenariusz łączeniowy
    // przypadku (`OperatingScenario.out_of_service`), nie flaga elementu modelu.
    {
      id: 'topology',
      label: SECTION_LABELS.topology,
      fields: [
        // Karta K7c-FE (grep property-grid vs modelem ENM Source): klucz zgodny
        // z polem modelu ENM `Source.bus_ref` (był `bus_id` — niedopasowany,
        // ta sama klasa co `sk_mva`→`sk3_mva`/`voltage_kv`→`sn_voltage_kv`
        // niżej: pole ZAWSZE pokazywało puste „—" zamiast realnej szyny
        // przyłączenia, a edycja zapisywała klucz, którego nic nie czyta —
        // zmiana przyłączenia przez property-grid była martwa).
        // Karta JEDNA-SCIEZKA-EDYCJI: odczyt — zmiana szyny przyłączenia to operacja topologiczna.
        { key: 'bus_ref', label: 'Szyna przyłączenia', value: null, type: 'ref', refType: 'Bus', editable: false, source: 'instance' },
      ],
    },
    {
      id: 'short_circuit',
      label: SECTION_LABELS.short_circuit,
      fields: [
        // Karta K7-FE: klucz zgodny z polem modelu ENM `Source.sk3_mva` (był
        // `sk_mva` — niedopasowany do `elementData`, więc PropertyGrid ZAWSZE
        // pokazywał zaszytą wartość przykładową 5000 zamiast rzeczywistej mocy
        // źródła, a edycja zapisywała klucz, którego nic w modelu nie czyta;
        // ten sam defekt co niżej w `applyCaseConfigRules`/`validation.ts` —
        // naprawione w komplecie, KLASA NIE INSTANCJA).
        { key: 'sk3_mva', label: "Moc zwarciowa Sk\"", value: null, type: 'number', unit: 'MVA', editable: true, source: 'instance' },
        { key: 'rx_ratio', label: 'Stosunek R/X', value: null, type: 'number', editable: true, source: 'instance' },
        // Karta K7c-FE: klucz zgodny z polem modelu ENM `Source.sn_voltage_kv`
        // (był `voltage_kv` — `Source` NIE MA takiego pola, ma `sn_voltage_kv`;
        // ta sama klasa fantomu co `sk_mva` powyżej — etykieta bez zmian).
        { key: 'sn_voltage_kv', label: 'Napięcie znamionowe Un', value: null, type: 'number', unit: 'kV', editable: true, source: 'instance' },
        // CV-4.3 K7: dane scenariusza MIN (warunki przyłączenia OSD) — opcjonalne,
        // brak wartości domyślnej (zero fabrykacji; `null` = nie podano).
        { key: 'sk3_min_mva', label: "Moc zwarciowa Sk\"min", value: null, type: 'number', unit: 'MVA', editable: true, source: 'instance' },
        { key: 'ik3_min_ka', label: "Prąd zwarciowy Ik\"min", value: null, type: 'number', unit: 'kA', editable: true, source: 'instance' },
        { key: 'rx_ratio_min', label: 'Stosunek R/X (MIN)', value: null, type: 'number', editable: true, source: 'instance' },
        // CV-4.3 K7c: napięcie zadane szyny bilansującej — opcjonalne (brak =
        // znamionowe, zero fabrykacji), ta sama klasa mutowalności co MIN wyżej.
        { key: 'u_set_pu', label: 'Napięcie zadane szyny bilansującej', value: null, type: 'number', unit: 'pu', editable: true, source: 'instance' },
      ],
    },
    {
      id: 'calculated',
      label: SECTION_LABELS.calculated,
      fields: [
        { key: 'zk_ohm', label: 'Impedancja zwarciowa Zk', value: null, type: 'number', unit: 'Ω', editable: false, source: 'calculated' },
        { key: 'rk_ohm', label: 'Rk', value: null, type: 'number', unit: 'Ω', editable: false, source: 'calculated' },
        { key: 'xk_ohm', label: 'Xk', value: null, type: 'number', unit: 'Ω', editable: false, source: 'calculated' },
        { key: 'ikss_ka', label: 'Ik"', value: null, type: 'number', unit: 'kA', editable: false, source: 'calculated' },
        { key: 'p_mw', label: 'P wpływające', value: null, type: 'number', unit: 'MW', editable: false, source: 'calculated' },
        { key: 'q_mvar', label: 'Q wpływające', value: null, type: 'number', unit: 'Mvar', editable: false, source: 'calculated' },
      ],
    },
    {
      id: 'audit',
      label: SECTION_LABELS.audit,
      fields: [
        { key: 'created_at', label: 'Data utworzenia', value: '', type: 'string', editable: false, source: 'audit' },
        { key: 'created_by', label: 'Utworzył', value: '', type: 'string', editable: false, source: 'audit' },
        { key: 'modified_at', label: 'Data modyfikacji', value: '', type: 'string', editable: false, source: 'audit' },
        { key: 'modified_by', label: 'Zmodyfikował', value: '', type: 'string', editable: false, source: 'audit' },
      ],
    },
  ];
}

/**
 * Field definitions for Load (Odbiornik).
 * Per wizard_screens.md § 3.9.
 */
export function getLoadFieldDefinitions(): PropertySection[] {
  return [
    {
      id: 'identification',
      label: SECTION_LABELS.identification,
      fields: [
        { key: 'id', label: 'ID', value: '', type: 'string', editable: false, source: 'instance' },
        { key: 'name', label: 'Nazwa', value: '', type: 'string', editable: true, source: 'instance' },
        // Odbiór K7c-FE (klasa fantomów kluczy vs model ENM, ta sama co bus_ref/sn_voltage_kv):
        // `ENMElement` ma `id` (UUID, wiersz wyżej) i `ref_id` (identyfikator kanoniczny) —
        // klucz `uuid` nie istnieje w żadnym elemencie, pole zawsze pokazywało puste „—".
        { key: 'ref_id', label: 'Identyfikator kanoniczny', value: '', type: 'string', editable: false, source: 'instance' },
        { key: 'element_type', label: 'Typ obiektu', value: 'Load', type: 'string', editable: false, source: 'instance' },
      ],
    },
    // Karta JEDNA-SCIEZKA-EDYCJI: sekcja „Stan" (W eksploatacji / Cykl życia) skasowana —
    // model ENM nie ma ani `in_service`, ani `lifecycle_state` (backend odrzucał oba klucze
    // kodem `params.key_not_allowed`). Element wyłączony z ruchu to scenariusz łączeniowy
    // przypadku (`OperatingScenario.out_of_service`), nie flaga elementu modelu.
    {
      id: 'topology',
      label: SECTION_LABELS.topology,
      fields: [
        // Odbiór K7c-FE: klucz zgodny z modelem ENM `Load.bus_ref`; odczyt (operacja topologiczna).
        { key: 'bus_ref', label: 'Szyna przyłączenia', value: null, type: 'ref', refType: 'Bus', editable: false, source: 'instance' },
      ],
    },
    {
      id: 'electrical_params',
      label: SECTION_LABELS.electrical_params,
      fields: [
        { key: 'p_mw', label: 'Moc czynna P', value: null, type: 'number', unit: 'MW', editable: true, source: 'instance' },
        { key: 'q_mvar', label: 'Moc bierna Q', value: null, type: 'number', unit: 'Mvar', editable: true, source: 'instance' },
        // Karta JEDNA-SCIEZKA-EDYCJI: cos φ to parametr OPERACJI (backend wyznacza Q z P,
        // `POLE_COS_PHI_ODBIORU`), nie pole modelu — wartość pusta, bo model jej nie niesie.
        { key: 'cos_phi', label: 'Współczynnik mocy cos φ', value: null, type: 'number', editable: true, source: 'instance' },
        // Model odbioru = klucz modelu `model`, WYPROWADZANY przez backend ze współczynników ZIP
        // (O-49 pkt 2) — odczyt. Dawny `load_type` backend odrzucał.
        { key: 'model', label: 'Model odbioru', value: null, type: 'enum', editable: false, enumOptions: ['pq', 'zip'], enumLabels: { pq: 'stała moc (PQ)', zip: 'ZIP' }, source: 'instance' },
      ],
    },
    {
      id: 'calculated',
      label: SECTION_LABELS.calculated,
      fields: [
        { key: 'p_calculated_mw', label: 'P obliczone', value: null, type: 'number', unit: 'MW', editable: false, source: 'calculated' },
        { key: 'q_calculated_mvar', label: 'Q obliczone', value: null, type: 'number', unit: 'Mvar', editable: false, source: 'calculated' },
        { key: 's_calculated_mva', label: 'S obliczone', value: null, type: 'number', unit: 'MVA', editable: false, source: 'calculated' },
        { key: 'i_calculated_a', label: 'I obliczony', value: null, type: 'number', unit: 'A', editable: false, source: 'calculated' },
      ],
    },
    {
      id: 'audit',
      label: SECTION_LABELS.audit,
      fields: [
        { key: 'created_at', label: 'Data utworzenia', value: '', type: 'string', editable: false, source: 'audit' },
        { key: 'created_by', label: 'Utworzył', value: '', type: 'string', editable: false, source: 'audit' },
        { key: 'modified_at', label: 'Data modyfikacji', value: '', type: 'string', editable: false, source: 'audit' },
        { key: 'modified_by', label: 'Zmodyfikował', value: '', type: 'string', editable: false, source: 'audit' },
      ],
    },
  ];
}

/**
 * Get field definitions for an element type.
 * Legacy compatibility wrapper.
 */
export function getFieldDefinitions(elementType: ElementType): PropertySection[] {
  // Default to MODEL_EDIT mode for backward compatibility
  return getFieldDefinitionsForMode(elementType, 'MODEL_EDIT');
}

/**
 * P30e: Get field definitions for an element type and operating mode.
 *
 * CANONICAL CONTEXT-AWARE PROPERTY GRID:
 * - MODEL_EDIT: konstrukcyjne pola (geometria, typy, parametry stałe)
 * - CASE_CONFIG: wariantowe pola (status, parametry przypadku)
 * - RESULT_VIEW: wynikowe pola (prądy, napięcia, straty) — 100% READ-ONLY
 *
 * @param elementType - Typ obiektu
 * @param mode - Tryb pracy (MODEL_EDIT | CASE_CONFIG | RESULT_VIEW)
 * @returns Lista sekcji i pól kontekstowych dla danego trybu
 */
export function getFieldDefinitionsForMode(
  elementType: ElementType,
  mode: OperatingMode
): PropertySection[] {
  // Get base field definitions
  let baseSections: PropertySection[];

  switch (elementType) {
    case 'Bus':
      baseSections = getBusFieldDefinitions();
      break;
    case 'LineBranch':
      baseSections = getLineBranchFieldDefinitions();
      break;
    case 'TransformerBranch':
      baseSections = getTransformerBranchFieldDefinitions();
      break;
    case 'Switch':
      baseSections = getSwitchFieldDefinitions();
      break;
    case 'Source':
      baseSections = getSourceFieldDefinitions();
      break;
    case 'Load':
      baseSections = getLoadFieldDefinitions();
      break;
    default:
      return [];
  }

  // Apply mode-specific filtering and editability rules
  return applyModeRules(elementType, mode, baseSections);
}

/**
 * Apply mode-specific rules to field definitions.
 * Filters sections and marks fields as editable/read-only based on operating mode.
 */
function applyModeRules(
  elementType: ElementType,
  mode: OperatingMode,
  sections: PropertySection[]
): PropertySection[] {
  switch (mode) {
    case 'MODEL_EDIT':
      return applyModelEditRules(elementType, sections);
    case 'CASE_CONFIG':
      return applyCaseConfigRules(elementType, sections);
    case 'RESULT_VIEW':
      return applyResultViewRules(elementType, sections);
    default:
      return sections;
  }
}

/**
 * MODEL_EDIT mode: konstrukcyjne pola (geometria, topologia, typy, parametry).
 * - identification, state, topology, type_reference, type_params, local_params, audit
 * - Edytowalne: instance fields (nie type, calculated, audit)
 */
function applyModelEditRules(
  _elementType: ElementType,
  sections: PropertySection[]
): PropertySection[] {
  // Include: identification, state, topology, type_reference, type_params, local_params, electrical_params (for some), nameplate, short_circuit, power_flow, oltc, audit
  // Exclude: calculated (not relevant in MODEL_EDIT, shown only in RESULT_VIEW)

  const allowedSections = [
    'identification',
    'state',
    'topology',
    'type_reference',
    'type_params',
    'local_params',
    'electrical_params',
    'nameplate',
    'short_circuit',
    'power_flow',
    'oltc',
    'audit',
  ];

  return sections
    .filter((section) => allowedSections.includes(section.id))
    .map((section) => ({
      ...section,
      fields: section.fields.map((field) => {
        // Mark fields as editable based on source
        // Read-only: type, calculated, audit
        // Editable: instance fields (with some exceptions)
        const isReadOnly =
          field.source === 'type' ||
          field.source === 'calculated' ||
          field.source === 'audit' ||
          !field.editable;

        return {
          ...field,
          editable: !isReadOnly,
        };
      }),
    }));
}

/**
 * CASE_CONFIG mode: wariantowe pola (status, parametry przypadku).
 * - identification (READ-ONLY)
 * - state: Switch/LineBranch `status` EDITABLE (położenie / stan łączeniowy)
 * - For Load/Source: p_mw, q_mvar EDITABLE
 * - For TransformerBranch: tap_position EDITABLE
 */
function applyCaseConfigRules(
  elementType: ElementType,
  sections: PropertySection[]
): PropertySection[] {
  const allowedSections = ['identification', 'state', 'topology', 'local_params', 'electrical_params', 'short_circuit'];

  // Define editable fields per element type in CASE_CONFIG mode
  // Karta JEDNA-SCIEZKA-EDYCJI: `in_service` skasowane (model go nie ma); stan łączeniowy
  // odcinka i położenie łącznika to klucz modelu `status`.
  const editableFields = new Set<string>();

  // Element-specific editable fields
  switch (elementType) {
    case 'Switch':
    case 'LineBranch':
      editableFields.add('status');
      break;
    case 'TransformerBranch':
      editableFields.add('tap_position'); // Zaczep transformatora
      break;
    case 'Load':
      editableFields.add('p_mw');
      editableFields.add('q_mvar');
      editableFields.add('cos_phi');
      break;
    case 'Source':
      editableFields.add('sk3_mva');
      editableFields.add('rx_ratio');
      // CV-4.3 K7: dane scenariusza MIN dzielą tę samą mutowalność co Sk3/R-X.
      editableFields.add('sk3_min_mva');
      editableFields.add('ik3_min_ka');
      editableFields.add('rx_ratio_min');
      break;
  }

  return sections
    .filter((section) => allowedSections.includes(section.id))
    .map((section) => ({
      ...section,
      fields: section.fields.map((field) => {
        // Only specific fields are editable in CASE_CONFIG
        const isEditable = editableFields.has(field.key);

        return {
          ...field,
          editable: isEditable,
        };
      }),
    }));
}

/**
 * RESULT_VIEW mode: wynikowe pola (prądy, napięcia, straty) — 100% READ-ONLY.
 * - identification (READ-ONLY)
 * - state (READ-ONLY)
 * - topology (READ-ONLY)
 * - type_params (READ-ONLY, for context)
 * - local_params (READ-ONLY, for context)
 * - calculated (READ-ONLY, main focus)
 * - All fields are READ-ONLY
 */
function applyResultViewRules(
  _elementType: ElementType,
  sections: PropertySection[]
): PropertySection[] {
  const allowedSections = [
    'identification',
    'state',
    'topology',
    'type_params',
    'local_params',
    'electrical_params',
    'short_circuit',
    'calculated',
  ];

  return sections
    .filter((section) => allowedSections.includes(section.id))
    .map((section) => ({
      ...section,
      fields: section.fields.map((field) => ({
        ...field,
        editable: false, // 100% READ-ONLY in RESULT_VIEW
      })),
    }));
}
