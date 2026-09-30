/*
 * Akcja naprawcza gotowości = WYKONAWCA jednym kliknięciem (karta C-12, decyzja K-12
 * opcja A, EF-046).
 *
 * Dawniej przycisk „Napraw…" tylko przełączał przestrzeń na „Schemat": projektant sam
 * szukał elementu i sam otwierał formularz. Teraz klik = JEDNA nawigacja powłoki
 * (`przejdzDoPrzestrzeni`, kanon D1) → selekcja elementu → formularz operacji domenowej
 * z fokusem na brakującym polu (wykonawca przeniesiony z warstwy legacy,
 * `fixActionSurfaceExecutor.ts`).
 *
 * JEDNO źródło prawdy (reguła „predykaty parami"): `rozwiazAkcjeNaprawcza` decyduje
 * zarówno o tym, CO pokazuje wiersz problemu (przycisk formularza, przycisk przejścia
 * albo nazwana odmowa), jak i o tym, CO robi klik. Wiersz nie ma własnego warunku.
 *
 * Tabela `AKCJE_KODOW_KANONU` jest KOMPLETNA względem kanonicznego rejestru kodów
 * gotowości (`backend/src/domain/canonical_operations.py::READINESS_CODES`, snapshot
 * `__tests__/fixtures/readiness_registry_snapshot.json` pilnowany testem dryfu po
 * stronie backendu). Każdy kod ma dokładnie jedną z trzech odpowiedzi:
 *   - `formularz` — operacja domenowa z dostawcą formularza (`implemented=true` w
 *     rejestrze powierzchni i komponent w `OPERATION_FORM_REGISTRY`);
 *   - `przestrzen` — naprawa NIE jest operacją modelu (bieg analizy, warunki
 *     przyłączenia z kafla pulpitu, wybór zacisku w nastawach), więc klik prowadzi
 *     tam, gdzie się ją wykonuje, a powód jest nazwany;
 *   - `odmowa` — klik nie ma dokąd prowadzić (np. „usuń blokady z tej listy"); wiersz
 *     pokazuje powód zamiast przycisku.
 * Kod spoza tabeli wraca do akcji emitera (`FixAction` walidatora ENM / bloków
 * domenowych `_build_readiness`), rozwiązywanej istniejącym `resolveFixActionSurface`.
 *
 * Zero fizyki, zero mutacji modelu poza formularzem, który zapisuje operacja domenowa.
 */

import type { CanonicalOpName } from '../../../types/domainOps';
import type { EnergyNetworkModel } from '../../../types/enm';
import {
  resolveFixActionSurface,
  type FixActionSurfaceDescriptor,
} from '../../../types/fixActionSurface';
import { useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { notify } from '../../../ui/notifications/store';
import { useSelectionStore } from '../../../ui/selection/store';
import { resolveSelectedElementFromSnapshot } from '../../../ui/shared/selectionResolution';
import { getOperationSurfaceByOp } from '../../../ui/topology/modals/operationSurfaceRegistry';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import type { FixAction } from '../../../ui/types';
import { OPERATION_FORM_REGISTRY } from '../../../ui/workspace/operationFormRegistry';
import { emituj } from '../../events';
import { przejdzDoPrzestrzeni } from '../../shell/przejsciaPrzestrzeni';
import { SPACES, type SpaceId } from '../../shell/spaces';
import { useShellStore } from '../../shell/useShellStore';
import type { ZakladkaId } from '../wyniki/obszary';
import { executeFixActionSurface, type FixActionLike } from './fixActionSurfaceExecutor';
import type { ProblemGotowosci } from './grupowanieCelow';
import { GOTOWOSC_STRINGS } from './strings';

// ---------------------------------------------------------------------------
// Tabela kodów kanonu → akcja
// ---------------------------------------------------------------------------

export type WpisAkcjiKodu =
  | { rodzaj: 'formularz'; operacja: CanonicalOpName }
  | { rodzaj: 'przestrzen'; przestrzen: SpaceId; zakladkaWynikow?: ZakladkaId; powodPl: string }
  | { rodzaj: 'odmowa'; powodPl: string };

const formularz = (operacja: CanonicalOpName): WpisAkcjiKodu => ({ rodzaj: 'formularz', operacja });
const przestrzen = (
  cel: SpaceId,
  powodPl: string,
  zakladkaWynikow?: ZakladkaId,
): WpisAkcjiKodu => ({ rodzaj: 'przestrzen', przestrzen: cel, powodPl, zakladkaWynikow });

const EDYCJA = formularz('update_element_parameters');
const KATALOG = formularz('assign_catalog_to_element');
const TRANSFORMATOR = formularz('add_transformer_sn_nn');

const POWOD_BIEG_ZWARCIOWY =
  'Brakująca wielkość jest wynikiem analizy zwarciowej — uruchom obliczenia zwarciowe przypadku.';
const POWOD_BIEG_WERDYKTU =
  'Kryterium ocenia zakończony bieg obliczeń bieżącego modelu — uruchom obliczenia przypadku.';
const POWOD_ZACISK_ZABEZPIECZENIA =
  'Miejsce zabezpieczenia na gałęzi (zacisk początkowy albo końcowy) wskazuje się w nastawach ' +
  'zabezpieczeń na ekranie koordynacji.';
const POWOD_DANE_ZABEZPIECZENIOWE =
  'Wymaganie wynika z funkcji zabezpieczeniowych pola — uzupełnia się je w nastawach na ekranie ' +
  'koordynacji.';

/**
 * KOMPLETNA tabela kodów kanonu (145 kodów, stan rejestru 2026-09-30). Brak wpisu dla
 * kodu z rejestru jest błędem wykrywanym testem klasy `akcjeNaprawcze.klasa.test.ts`.
 */
export const AKCJE_KODOW_KANONU: Readonly<Record<string, WpisAkcjiKodu>> = {
  // --- Źródła zasilania -----------------------------------------------------
  'source.voltage_invalid': EDYCJA,
  'source.sk3_invalid': EDYCJA,
  'source.grid_supply_missing': formularz('add_grid_source_sn'),
  'source.connection_missing': EDYCJA,
  'source.multiple_grid_sources_in_island': przestrzen(
    'schemat',
    'W jednej wyspie może pracować jedno źródło sieciowe — usuń nadmiarowe źródło z menu ' +
      'kontekstowego elementu na schemacie.',
  ),
  'source.sk_min_missing': EDYCJA,
  'source.sk_min_inconsistent': EDYCJA,
  'source.u_set_pu_out_of_range': EDYCJA,
  'earthing.neutral_grounding_inconsistent': EDYCJA,
  'earthing.electrode_data_missing': EDYCJA,
  // --- Magistrala i pierścień ---------------------------------------------------
  'trunk.terminal_missing': formularz('continue_trunk_segment_sn'),
  'trunk.segment_missing': formularz('continue_trunk_segment_sn'),
  'trunk.segment_length_missing': EDYCJA,
  'trunk.segment_length_invalid': EDYCJA,
  'trunk.catalog_missing': KATALOG,
  'ring.endpoints_missing': formularz('connect_secondary_ring_sn'),
  'ring.nop_required': formularz('set_normal_open_point'),
  'branch.zero_sequence_missing': EDYCJA,
  // --- Stacje i pola --------------------------------------------------------------
  'station.type_invalid': EDYCJA,
  'station.voltage_missing': EDYCJA,
  'station.nn_outgoing_min_1': formularz('add_nn_outgoing_field'),
  'station.required_field_missing': formularz('add_sn_bay'),
  'station.line_field_multiple_segments': formularz('przepnij_element_na_pole'),
  'station.element_bypasses_field': formularz('przepnij_element_na_pole'),
  // --- Transformatory ---------------------------------------------------------------
  'transformer.catalog_missing': KATALOG,
  'transformer.bay_missing': formularz('add_sn_bay'),
  'transformer.connection_missing': TRANSFORMATOR,
  'transformer.loss_data_missing': KATALOG,
  'transformer.no_load_params_missing': KATALOG,
  'transformer.vector_group_missing': KATALOG,
  'transformer.vector_group_invalid': EDYCJA,
  'transformer.neutral_grounding_not_accessible': EDYCJA,
  'transformer.lv_earthing_system_missing': EDYCJA,
  'transformer.loading_factor_missing': EDYCJA,
  'oltc.deadband_missing': EDYCJA,
  'oltc.target_voltage_missing': przestrzen(
    'wyniki',
    'Napięcie docelowe regulacji podobciążeniowej jest parametrem badania regulacji — ustaw je na ' +
      'ekranie regulacji zaczepów.',
    'regulacja-oltc',
  ),
  // --- Strona nN --------------------------------------------------------------------
  'nn.bus_missing': formularz('add_nn_distribution_board'),
  'nn.main_breaker_missing': formularz('add_nn_switch_device'),
  'nn.voltage_missing': EDYCJA,
  'nn.cable_catalog_missing': KATALOG,
  'nn.switch.catalog_ref_missing': KATALOG,
  'nn.source.field_missing': formularz('add_nn_outgoing_field'),
  'nn.source.switch_missing': formularz('add_nn_switch_device'),
  'nn.source.catalog_missing': KATALOG,
  'nn.source.parameters_missing': EDYCJA,
  'nn.measurement.required_missing': formularz('add_ct'),
  'apparatus.sn_catalog_missing': KATALOG,
  'apparatus.nn_catalog_missing': KATALOG,
  'load.catalog_missing': KATALOG,
  'load.zip_agregat_niereprezentowalny': EDYCJA,
  'load.power_zero': EDYCJA,
  // --- OZE, magazyny, źródła dyspozycyjne ------------------------------------------
  'oze.transformer_required': TRANSFORMATOR,
  'oze.pv_no_transformer': TRANSFORMATOR,
  'oze.bess_no_transformer': TRANSFORMATOR,
  'oze.nn_bus_required': formularz('add_nn_distribution_board'),
  'oze.card_field_not_accepted': EDYCJA,
  'der.inverter_certificate_unlinked': KATALOG,
  'der.inverter_certificate_conditional': KATALOG,
  'der.dynamic_profile_missing': EDYCJA,
  'der.dynamika_missing': przestrzen(
    'wyniki',
    'Model dynamiczny źródła wiąże się z profilem katalogowym na ekranie dynamiki czasowej.',
    'dynamika',
  ),
  'generator.q_missing': EDYCJA,
  'generator.voltage_setpoint_missing': EDYCJA,
  'generator.voltage_control_profile_missing': EDYCJA,
  'generator.voltage_control_not_permitted': EDYCJA,
  'generator.converter_card_missing': KATALOG,
  'generator.harmonic_spectrum_missing': KATALOG,
  'inverter.k_sc_default_forbidden': KATALOG,
  'inverter.k_sc_missing': KATALOG,
  'converter.transformer_capacity_exceeded': KATALOG,
  'converter.setpoint_above_rating': EDYCJA,
  'converter.power_check_input_invalid': EDYCJA,
  'pv.control_mode_missing': EDYCJA,
  'bess.energy_module_missing': KATALOG,
  'bess.soc_limits_invalid': EDYCJA,
  'ups.backup_time_invalid': EDYCJA,
  'genset.fuel_type_missing': EDYCJA,
  // --- Zabezpieczenia i przekładniki ------------------------------------------------
  'protection.ct_required': formularz('add_ct'),
  'protection.vt_required': formularz('add_vt'),
  'protection.settings_incomplete': formularz('add_relay'),
  'protection.nominal_current_missing': EDYCJA,
  'protection.fault_current_missing': przestrzen('obliczenia', POWOD_BIEG_ZWARCIOWY),
  'protection.relay_terminal_indication_missing': przestrzen(
    'wyniki',
    POWOD_ZACISK_ZABEZPIECZENIA,
    'koordynacja',
  ),
  'protection.relay_terminal_choice_missing': przestrzen(
    'wyniki',
    POWOD_ZACISK_ZABEZPIECZENIA,
    'koordynacja',
  ),
  'protection.relay_terminal_contradicts_model': przestrzen(
    'wyniki',
    POWOD_ZACISK_ZABEZPIECZENIA,
    'koordynacja',
  ),
  'protection.device_breaker_not_in_series': przestrzen(
    'wyniki',
    POWOD_ZACISK_ZABEZPIECZENIA,
    'koordynacja',
  ),
  'protection.relay_terminal_breaker_loop': przestrzen(
    'wyniki',
    POWOD_ZACISK_ZABEZPIECZENIA,
    'koordynacja',
  ),
  'protection.curve_library_missing': KATALOG,
  'protection.curve_library_ref_broken': KATALOG,
  'ct.secondary_circuit_missing': EDYCJA,
  'ct.rated_burden_missing': KATALOG,
  'ct.accuracy_limit_missing': KATALOG,
  'ct.winding_resistance_missing': KATALOG,
  'ct.required_alf_missing': przestrzen('wyniki', POWOD_DANE_ZABEZPIECZENIOWE, 'koordynacja'),
  'vt.secondary_circuit_missing': EDYCJA,
  'vt.rated_burden_missing': KATALOG,
  'vt.winding_category_missing': KATALOG,
  // --- Przewody i kable ------------------------------------------------------------
  'conductor.thermal_data_missing': KATALOG,
  'conductor.fault_current_missing': przestrzen('obliczenia', POWOD_BIEG_ZWARCIOWY),
  'conductor.fault_duration_missing': przestrzen(
    'wyniki',
    POWOD_DANE_ZABEZPIECZENIOWE,
    'koordynacja',
  ),
  'cable.insulation_data_missing': KATALOG,
  'cable.screen_bonding_reference_mismatch': EDYCJA,
  'cable.operating_temperature_missing': EDYCJA,
  // --- Warunki przyłączenia ----------------------------------------------------------
  'connection.power_limit_missing': przestrzen(
    'projekt',
    'Moc przyłączeniowa jest warunkiem przyłączenia OSD — uzupełnia się ją w kaflu warunków ' +
      'przyłączenia na pulpicie projektu.',
  ),
  'connection.cos_phi_required_missing': przestrzen(
    'projekt',
    'Wymagany współczynnik mocy jest warunkiem przyłączenia OSD — uzupełnia się go w kaflu ' +
      'warunków przyłączenia na pulpicie projektu.',
  ),
  'connection.power_flow_missing': przestrzen(
    'obliczenia',
    'Ocena przyłączenia wymaga zakończonego rozpływu mocy — uruchom obliczenia rozpływowe przypadku.',
  ),
  // --- Rozpływ niesymetryczny i zwarcia ---------------------------------------------
  'power_flow.unbalanced_requires_radial': formularz('set_normal_open_point'),
  'power_flow.unbalanced_load_phases_unsupported': EDYCJA,
  'power_flow.unbalanced_element_unsupported': EDYCJA,
  'power_flow.unbalanced_no_zero_sequence_path': EDYCJA,
  'power_flow.unbalanced_shunt_admittance_omitted': EDYCJA,
  'power_flow.unbalanced_magnetising_branch_omitted': EDYCJA,
  'power_flow.unbalanced_losses_self_impedance': EDYCJA,
  'power_flow.unbalanced_transformer_series_model': EDYCJA,
  'power_flow.unbalanced_zero_sequence_confined': EDYCJA,
  'power_flow.unbalanced_zero_sequence_via_source': EDYCJA,
  'fault.location_on_branch_requires_assembler': przestrzen(
    'obliczenia',
    'Zwarcie w punkcie na gałęzi ustawia się w scenariuszu zwarciowym przypadku obliczeń.',
  ),
  // --- Przypadek, analizy i werdykt ----------------------------------------------------
  'study_case.missing_base_snapshot': przestrzen(
    'obliczenia',
    'Przypadek obliczeń nie ma migawki modelu — wybierz albo utwórz przypadek w menedżerze przypadków.',
  ),
  'analysis.blocked_by_readiness': {
    rodzaj: 'odmowa',
    powodPl: 'Analiza odblokuje się po usunięciu blokad wymienionych na tej liście.',
  },
  'analysis.as_built_measurement_terminal_missing': przestrzen(
    'wyniki',
    'Miejsce pomiaru mocy gałęzi (zacisk początkowy albo końcowy) wskazuje się na ekranie odbioru.',
    'odbior',
  ),
  'verdict.run_missing': przestrzen('obliczenia', POWOD_BIEG_WERDYKTU),
  'verdict.run_stale': przestrzen('obliczenia', POWOD_BIEG_WERDYKTU),
  'verdict.run_failed': przestrzen(
    'obliczenia',
    'Bieg zakończył się błędem — przyczynę pokazuje diagnoza przebiegu w przestrzeni Obliczenia.',
  ),
  'verdict.input_data_missing': przestrzen(
    'wyniki',
    'Brakujące dane wskazuje pozycja werdyktu na ekranie oceny.',
    'ocena',
  ),
  // --- Katalog ------------------------------------------------------------------------
  'catalog.ref_required': KATALOG,
  'import.catalog_mapping_required': przestrzen(
    'projekt',
    'Mapowanie pozycji katalogowych importu wykonuje się w kreatorze importu arkusza na pulpicie projektu.',
  ),
  'catalog.binding_version_missing': KATALOG,
  'catalog.binding_missing': KATALOG,
  'catalog.materialization_failed': KATALOG,
  'catalog.item_not_found': KATALOG,
  'catalog.ref_missing': KATALOG,
  'catalog.item_missing': KATALOG,
  'catalog.item_id_missing': KATALOG,
  'catalog.binding_required': KATALOG,
  'catalog.binding_invalid': KATALOG,
  'catalog.namespace_missing': KATALOG,
  'catalog.namespace_required': KATALOG,
  'catalog.unknown_namespace': KATALOG,
  'catalog.namespace_mismatch': KATALOG,
  'catalog.element_missing': przestrzen(
    'schemat',
    'Przypisanie katalogu nie wskazało elementu — zaznacz element na schemacie i przypisz mu typ.',
  ),
  'catalog.element_not_found': przestrzen(
    'schemat',
    'Wskazany element nie istnieje w modelu — zaznacz istniejący element na schemacie i przypisz mu typ.',
  ),
  'catalog.clear_forbidden': KATALOG,
  'catalog.materialization_required': KATALOG,
  'catalog.materialization_incomplete': KATALOG,
  'catalog.nameplate_mismatch': KATALOG,
  'catalog.gate_result_mismatch': KATALOG,
};

// ---------------------------------------------------------------------------
// Rozwiązanie akcji problemu — JEDNO źródło dla wiersza i wykonawcy
// ---------------------------------------------------------------------------

export type AkcjaNaprawcza =
  | { rodzaj: 'formularz'; akcja: FixActionLike; operacja: CanonicalOpName }
  | { rodzaj: 'element'; akcja: FixActionLike }
  | { rodzaj: 'przestrzen'; przestrzen: SpaceId; zakladkaWynikow: ZakladkaId | null; powodPl: string }
  | { rodzaj: 'odmowa'; powodPl: string };

/** Operacja ma DOSTAWCĘ formularza: wpis rejestru powierzchni `implemented` + komponent. */
export function operacjaMaFormularz(operacja: CanonicalOpName): boolean {
  return (
    getOperationSurfaceByOp(operacja)?.implemented === true
    && OPERATION_FORM_REGISTRY[operacja] != null
  );
}

function akcjaEmitera(fixAction: FixAction, code: string): FixActionLike {
  return {
    code,
    action_type: fixAction.action_type,
    element_ref: fixAction.element_ref,
    modal_type: fixAction.modal_type ?? null,
    panel: fixAction.panel ?? null,
    step: fixAction.step ?? null,
    focus: fixAction.focus ?? null,
    payload_hint: fixAction.payload_hint ?? null,
    surface_descriptor: fixAction.surface_descriptor ?? null,
  };
}

/**
 * Pole formularza do fokusu: nawigacja kanonu wskazuje pole (`focus`), a formularz
 * edycji parametrów przyjmuje je jako klucz pierwszego wiersza. Przekazujemy je
 * WYŁĄCZNIE, gdy element migawki ma taką własność — pole spoza modelu elementu dałoby
 * zapis, którego solver nie czyta (phantom), więc wtedy formularz startuje bez klucza.
 */
export function poleFokusu(
  snapshot: EnergyNetworkModel | null,
  elementRef: string | null,
  pole: string | null,
): string | null {
  if (!snapshot || !elementRef || !pole) return null;
  for (const kolekcja of Object.values(snapshot as unknown as Record<string, unknown>)) {
    if (!Array.isArray(kolekcja)) continue;
    for (const element of kolekcja) {
      if (
        element
        && typeof element === 'object'
        && ((element as { ref_id?: unknown }).ref_id === elementRef
          || (element as { id?: unknown }).id === elementRef)
      ) {
        return Object.prototype.hasOwnProperty.call(element, pole) ? pole : null;
      }
    }
  }
  return null;
}

function akcjaFormularzaKanonu(
  problem: ProblemGotowosci,
  operacja: CanonicalOpName,
  snapshot: EnergyNetworkModel | null,
): FixActionLike {
  const kontekst: Record<string, unknown> = { ...(problem.fixAction?.payload_hint ?? {}) };
  if (problem.elementRef) kontekst.element_ref = problem.elementRef;
  const pole =
    operacja === 'update_element_parameters'
      ? poleFokusu(snapshot, problem.elementRef, problem.nawigacjaKanoniczna?.focus ?? null)
      : null;
  if (pole) kontekst.field = pole;
  const surface: FixActionSurfaceDescriptor = {
    kind: 'operation_form',
    operation: operacja,
    element_ref: problem.elementRef,
    focus_ref: problem.elementRef,
    wizard_step_id: null,
    context: kontekst,
    unresolved_reason_code: null,
  };
  return {
    code: problem.code,
    action_type: 'OPEN_MODAL',
    element_ref: problem.elementRef,
    surface_descriptor: surface,
  };
}

/**
 * Co zrobi „Napraw…" dla tego problemu. `null` = problem bez żadnej drogi naprawy
 * (ani kanonu, ani akcji emitera) — wiersz mówi wtedy „Wymaga interwencji projektanta".
 */
export function rozwiazAkcjeNaprawcza(
  problem: ProblemGotowosci,
  snapshot: EnergyNetworkModel | null = null,
): AkcjaNaprawcza | null {
  const wpis = problem.kodKanoniczny ? AKCJE_KODOW_KANONU[problem.kodKanoniczny] : undefined;
  if (wpis?.rodzaj === 'formularz') {
    return {
      rodzaj: 'formularz',
      akcja: akcjaFormularzaKanonu(problem, wpis.operacja, snapshot),
      operacja: wpis.operacja,
    };
  }
  if (wpis?.rodzaj === 'przestrzen') {
    return {
      rodzaj: 'przestrzen',
      przestrzen: wpis.przestrzen,
      zakladkaWynikow: wpis.zakladkaWynikow ?? null,
      powodPl: wpis.powodPl,
    };
  }
  if (wpis?.rodzaj === 'odmowa') return { rodzaj: 'odmowa', powodPl: wpis.powodPl };

  if (!problem.fixAction) return null;
  const akcja = akcjaEmitera(problem.fixAction, problem.code);
  const surface =
    akcja.surface_descriptor
    ?? resolveFixActionSurface({
      code: problem.code,
      action_type: akcja.action_type,
      element_ref: akcja.element_ref,
      modal_type: akcja.modal_type ?? null,
      panel: akcja.panel ?? null,
      step_hint: akcja.step ?? null,
      focus_ref: akcja.focus ?? null,
      payload_hint: akcja.payload_hint ?? null,
    });
  if (surface.kind === 'operation_form' && surface.operation && operacjaMaFormularz(surface.operation)) {
    return { rodzaj: 'formularz', akcja: { ...akcja, surface_descriptor: surface }, operacja: surface.operation };
  }
  if (surface.kind === 'navigate_to_element' && (surface.focus_ref ?? surface.element_ref)) {
    return { rodzaj: 'element', akcja: { ...akcja, surface_descriptor: surface } };
  }
  return { rodzaj: 'odmowa', powodPl: GOTOWOSC_STRINGS.akcjaNierozpoznana };
}

/** Etykieta przycisku akcji — `null`, gdy wiersz pokazuje odmowę zamiast przycisku. */
export function etykietaAkcji(akcja: AkcjaNaprawcza): string | null {
  switch (akcja.rodzaj) {
    case 'formularz':
    case 'element':
      return GOTOWOSC_STRINGS.napraw;
    case 'przestrzen':
      return GOTOWOSC_STRINGS.przejdzDo(
        SPACES.find((s) => s.id === akcja.przestrzen)?.label ?? akcja.przestrzen,
      );
    case 'odmowa':
      return null;
  }
}

// ---------------------------------------------------------------------------
// Wykonanie — JEDNA funkcja dla wszystkich miejsc z akcją naprawczą
// ---------------------------------------------------------------------------

/**
 * Wykonanie akcji naprawczej problemu gotowości — wołają ją WYŁĄCZNIE panel gotowości
 * (wiersz problemu) i pulpit projektu (następna najlepsza akcja), obaj przez
 * `AppRoot`. Kolejność jest faktem: najpierw JEDNA nawigacja powłoki (D1), potem
 * selekcja i formularz — nawigacja po otwarciu formularza zamknęłaby go razem z trasą.
 */
export function wykonajAkcjeNaprawcza(problem: ProblemGotowosci): void {
  const snapshot = useSnapshotStore.getState().snapshot;
  const akcja = rozwiazAkcjeNaprawcza(problem, snapshot);
  if (problem.elementRef) {
    emituj({ typ: 'selekcja', obiektId: problem.elementRef, zrodlo: 'panel-gotowosci' });
  }

  if (!akcja) {
    przejdzDoPrzestrzeni('schemat');
    return;
  }
  if (akcja.rodzaj === 'odmowa') {
    notify(akcja.powodPl, 'info');
    return;
  }
  if (akcja.rodzaj === 'przestrzen') {
    if (akcja.zakladkaWynikow) {
      useShellStore.getState().setWynikiTab(akcja.zakladkaWynikow, problem.elementRef);
    }
    if (problem.elementRef) {
      useSelectionStore
        .getState()
        .selectElement(resolveSelectedElementFromSnapshot(snapshot, problem.elementRef, problem.elementRef));
    }
    przejdzDoPrzestrzeni(akcja.przestrzen);
    notify(akcja.powodPl, 'info');
    return;
  }

  przejdzDoPrzestrzeni('schemat');
  const selekcja = useSelectionStore.getState();
  executeFixActionSurface(akcja.akcja, {
    snapshot,
    openOperationForm: useNetworkBuildStore.getState().openOperationForm,
    selectElement: selekcja.selectElement,
    centerSldOnElement: selekcja.centerSldOnElement,
    notify,
  });
}
