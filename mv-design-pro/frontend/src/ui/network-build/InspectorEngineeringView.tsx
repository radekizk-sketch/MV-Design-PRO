/**
 * InspectorEngineeringView - inspektor inżynierski pogrupowany domenowo.
 *
 * Wyświetla pełne dane wybranego elementu sieci w sekcjach:
 * 1. Identyfikacja (ref_id, nazwa, typ elementu, stacja nadrzędna)
 * 2. Parametry elektryczne (napięcie, impedancja, moc, prąd)
 * 3. Topologia (szyna od, szyna do, magistrala, odgałęzienie)
 * 4. Katalog (pozycja katalogowa, source=catalog/override)
 * 5. Eksploatacja (stan łącznika, NOP, w eksploatacji)
 * 6. Kontrola konfiguracji dotycząca tego elementu
 * 7. Operacje (przyciski akcji kontekstowych)
 *
 * UŻYCIE: snapshotStore + selectionStore.
 * BINDING: 100% PL etykiety.
 */

import { nazwaObiektuPl, pierwszaNazwa } from '../shared/nazwaObiektu';
import { etykietaPunktuNeutralnegoPL } from '../../types/uziemienie';
import { OPIS_POLOZENIA_PL, stanStatusuGalezi } from '../sld/v2/model/stanAparatowPola';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { SchematPolaSn } from '../field/SchematPolaSn';
import {
  availabilityLabel,
  commandExecutionStateLabel,
  communicationStatusLabel,
  BRAK_TELEMETRII,
  deviceKindLabel,
  integrityStatusLabel,
  resultStateLabel,
  sourceKindLabel,
  switchStateLabel,
} from '../field/fieldLabels';
import { useFieldReadModel, type FieldReadModelItem } from '../field/useFieldReadModel';
import { useKatalogPola, type KatalogPola } from '../field/useKatalogPola';
import { bayKindLabelPl, etykietaStatusuZrodlaSzablonuPl } from '../catalog/BayTemplatePicker';
import {
  CONSTRUCTION_LABELS_PL,
  opisMediumRodzinyPl,
  powodBlokadyRodzinyPl,
} from '../catalog/SwitchgearFamilyPicker';
import { nazwaStanuObiektuPl } from '../shared/stanObiektu';
import { kodyFunkcjiSterownika, nazwaUrzadzeniaSterownika } from '../shared/sterownikZabezpieczen';
import { PORT_KIND_LABELS_PL } from '../sld/v2/core/ports';
import { fieldRoleLabelPl } from '../sld/v2/station-rozdzielnia/contract';
import { useSnapshotStore } from '../topology/snapshotStore';
import { useSelectionStore } from '../selection';
import { sanitizeDisplayValue } from '../shell/displayHelpers';
import { useNetworkBuildStore } from './networkBuildStore';
import { useAppStateStore } from '../app-state';
import { useProblemyGotowosci } from '../../ui2/spaces/gotowosc/adapters/gotowoscAdapter';
import { issueTargetsElement } from './liveReadiness';
import {
  isRawTechnicalIdentifier,
  publicTechnicalLabel,
  stationPublicIdentity,
} from '../shared/publicTechnicalLabels';
import type { ReadinessIssue, SelectedElement } from '../types';
import type {
  EnergyNetworkModel,
  Branch,
  Generator,
  LogicalViewsV1,
  Port,
  StanObiektu,
} from '../../types/enm';
import { isApparatusBranch } from '../../types/enm';
import { RODZAJ_GALEZI_PL } from '../shared/rodzajGalezi';
import type { NetworkBuildOperationName } from './networkBuildStore';
import { buildOperationContext } from './operationContext';
import { buildSldOperationContext } from '../sld/shared/sldActionExecutor';
import {
  POWOD_BRAKU_STARTU_ODGALEZIENIA_PL,
  powodBrakuStartuCiagu,
  type SldElementKindForMenu,
} from '../sld/v2/command/SldCommandService';
import { findOperationalBus } from '../shared/enmVisibility';
import { TypePicker } from '../catalog/TypePicker';
import { buildCatalogBinding } from '../catalog/catalogBinding';
import type { CatalogNamespace, TypeCategory } from '../catalog/types';
import type { WorkspaceSurfaceCode } from '../workspace/types';
import { wariantPrzylaczeniaPl } from './der-configurator/wariantPrzylaczeniaPl';
import { TechCard, buildTechCardSubject } from '../tech-card';
import { ElementCalculationProofPanel } from '../proof';
import { stacjaSzyn, szynyStacji } from '../shared/szynyStacji';
import {
  selectStationDistributionTransformers,
  stationRefOfTransformer,
  transformatoryNalezaceDoStacji,
} from '../shared/transformatoryStacji';
import { operacjaAkcjiMenu } from '../sld/shared/sldActionExecutor';
import {
  nazwaAparatuPl,
  rozbierzIdentyfikatorAparatu,
  type IdentyfikatorAparatu,
} from '../sld/shared/identyfikatorAparatu';
import { refOperacjiTematu } from '../sld/v3/canvas/canvasMenuSubject';
import {
  DzialaniaZwiniete,
  PanelElementuKanwy,
  type OperacjaModeluInspektora,
} from './inspektor-elementu/PanelElementuKanwy';
import { panelMaTresc } from './inspektor-elementu/panelNadOknem';
import { useStanPaneluElementu } from './inspektor-elementu/stanPaneluElementu';
import { useRunIdOgladany } from '../../ui2/wyniki/kontekst/kontekstWyniku';
import { TekstZWzorami, tekstBezWzorow } from '../../ui2/kreatory/rama/tekstZWzorami';
import { etykietaZeSlownika } from '../../ui2/wyniki/wzorzec/slownikWyliczen';

// =============================================================================
// Types
// =============================================================================

export interface PropertyField {
  key: string;
  label: string;
  value: string | number | boolean | null;
  unit?: string;
  source?: 'instance' | 'catalog' | 'calculated';
}

export interface PropertySection {
  id: string;
  label: string;
  fields: PropertyField[];
}

interface QuickAction {
  id: string;
  label: string;
  op: NetworkBuildOperationName;
  context?: Record<string, unknown>;
  variant?: 'primary' | 'secondary' | 'danger';
}

function joinValues(values: string[] | undefined | null): string | null {
  if (!values || values.length === 0) return null;
  return values
    .map((value, index) => publicTechnicalLabel(value, `pozycja ${index + 1}`))
    .join(', ');
}

function joinNumbers(values: readonly number[] | undefined): string | null {
  if (!values || values.length === 0) return null;
  return values.map((value) => value.toLocaleString('pl-PL')).join(', ');
}

/**
 * Sekcja „Katalog producenta" karty pola. Model pola niesie tylko referencje
 * (`bay_template_ref`, `switchgear_family_ref`); treść pochodzi z katalogu (`useKatalogPola`).
 * Każdy stan ma zdanie: brak powiązania, odczyt, błąd odczytu, referencja nieobecna w katalogu,
 * rozbieżność rodziny pola i rodziny szablonu. Liczby (napięcia) wyłącznie z rekordu katalogu.
 */
function buildBayCatalogSection(
  bayTemplateRef: string | null,
  familyRefFromModel: string | null,
  katalog: KatalogPola,
  stanObiektu: StanObiektu | null,
): PropertySection {
  const section = (fields: PropertyField[]): PropertySection => ({
    id: 'catalog',
    label: 'Katalog producenta',
    fields,
  });
  if (katalog.stan === 'BEZ_POWIAZANIA' || (!bayTemplateRef && !familyRefFromModel)) {
    return section([{
      key: 'catalog_binding',
      label: 'Powiązanie z katalogiem',
      value: 'Pole złożone bez szablonu producenta — model nie wskazuje pozycji katalogu.',
    }]);
  }
  if (katalog.stan === 'LADOWANIE') {
    return section([{ key: 'catalog_state', label: 'Stan odczytu', value: 'Ładowanie katalogu producentów...' }]);
  }
  if (katalog.stan === 'BLAD') {
    return section([{ key: 'catalog_state', label: 'Błąd odczytu katalogu', value: katalog.komunikat }]);
  }
  const { szablony, rodziny, producenci } = katalog.dane;
  const fields: PropertyField[] = [];
  const szablon = bayTemplateRef
    ? szablony.find((entry) => entry.template_ref === bayTemplateRef) ?? null
    : null;
  if (bayTemplateRef && !szablon) {
    fields.push({
      key: 'template_missing',
      label: 'Szablon pola producenta',
      value: 'Szablon wskazany w modelu nie występuje w katalogu.',
    });
  } else if (szablon) {
    const nazwa = [szablon.template_name_pl, szablon.template_code].filter(Boolean).join(' · ');
    fields.push(
      { key: 'template_name', label: 'Szablon pola producenta', value: nazwa || null, source: 'catalog' },
      { key: 'template_kind', label: 'Rodzaj pola katalogowego', value: bayKindLabelPl(szablon.bay_kind), source: 'catalog' },
      {
        key: 'template_source_status',
        label: 'Status źródła szablonu',
        value: etykietaStatusuZrodlaSzablonuPl(szablon.source_status),
        source: 'catalog',
      },
      { key: 'template_source_refs', label: 'Źródła szablonu', value: szablon.source_refs.length, source: 'catalog' },
      { key: 'template_version', label: 'Wersja szablonu', value: szablon.version, source: 'catalog' },
    );
  }
  const familyRef = familyRefFromModel ?? szablon?.switchgear_family_ref ?? null;
  if (familyRefFromModel && szablon?.switchgear_family_ref && szablon.switchgear_family_ref !== familyRefFromModel) {
    fields.push({
      key: 'family_mismatch',
      label: 'Niezgodność',
      value: 'Rodzina rozdzielnicy pola różni się od rodziny szablonu pola.',
    });
  }
  const rodzina = familyRef ? rodziny.find((entry) => entry.switchgear_family_ref === familyRef) ?? null : null;
  if (familyRef && !rodzina) {
    fields.push({
      key: 'family_missing',
      label: 'Rodzina rozdzielnicy',
      value: 'Rodzina wskazana dla pola nie występuje w katalogu.',
    });
  } else if (rodzina) {
    const producent = producenci.find((entry) => entry.manufacturer_ref === rodzina.manufacturer_ref);
    const powod = powodBlokadyRodzinyPl(rodzina, stanObiektu);
    fields.push(
      { key: 'family_name', label: 'Rodzina rozdzielnicy', value: rodzina.family_name, source: 'catalog' },
      { key: 'manufacturer', label: 'Producent', value: nazwaObiektuPl(producent?.name, 'producent', producent ? null : { spozaKatalogu: true }), source: 'catalog' },
      {
        key: 'construction',
        label: 'Konstrukcja',
        value: CONSTRUCTION_LABELS_PL[rodzina.construction_type] ?? null,
        source: 'catalog',
      },
      {
        key: 'network_voltages',
        label: 'Napięcia sieci',
        value: joinNumbers(rodzina.network_voltages_kv),
        unit: 'kV',
        source: 'catalog',
      },
      { key: 'um_classes', label: 'Klasy napięciowe $U_{m}$', value: joinNumbers(rodzina.um_classes_kv), unit: 'kV', source: 'catalog' },
      { key: 'family_medium', label: 'Medium rozdzielnicy', value: opisMediumRodzinyPl(rodzina), source: 'catalog' },
      {
        key: 'family_buildable',
        label:
          stanObiektu === 'ISTNIEJACY'
            ? 'Dopuszczona w polu istniejącym'
            : 'Dopuszczona w polu projektowanym',
        value: powod === null ? 'Tak — status potwierdzony źródłem katalogowym' : `Nie — ${powod}`,
        source: 'catalog',
      },
    );
  }
  return section(fields);
}

/** Sekcja „Zaciski pola" — jawne porty `Bay.ports` modelu; brak portów to stan, nie pustka. */
function buildBayPortsSection(ports: readonly Port[] | null): PropertySection {
  if (!ports || ports.length === 0) {
    return {
      id: 'ports',
      label: 'Zaciski pola',
      fields: [{
        key: 'no_ports',
        label: 'Zaciski pola',
        value: 'Model nie zawiera jawnych zacisków tego pola.',
      }],
    };
  }
  return {
    id: 'ports',
    label: 'Zaciski pola',
    fields: ports.map((port, index) => ({
      key: `port_${index}`,
      label: `${etykietaZeSlownika(PORT_KIND_LABELS_PL, port.kind)} · ${port.nominal_voltage_kv.toLocaleString('pl-PL')} kV`,
      value: port.occupied_by ? 'Przyłączony' : 'Wolny',
    })),
  };
}

export function buildBaySections(
  item: FieldReadModelItem | null,
  isLoading: boolean,
  error: string | null,
  readinessIssues: ReadinessIssue[],
  elementId: string,
  bayName: string,
  katalog: KatalogPola,
  ports: readonly Port[] | null,
): { sections: PropertySection[]; elementType: string; elementName: string; actions: QuickAction[] } {
  if (!item) {
    return {
      elementType: 'bay',
      elementName: bayName,
      actions: [],
      sections: [
        {
          id: 'bay_missing',
          label: 'Kontrakt pola',
          fields: [
            {
              key: 'state',
              label: isLoading ? 'Stan odczytu' : 'Stan układu',
              value: isLoading
                ? 'Ładowanie widoku pola...'
                : error ?? 'Kanoniczny model pola nie jest dostępny dla wybranego elementu.',
            },
          ],
        },
      ],
    };
  }

  const canonicalModel = item.canonical_model;
  const baseModel = canonicalModel.base_model;
  const runtimeState = canonicalModel.runtime_state;
  const measurementChain = baseModel.measurement_chain;
  const protection = baseModel.zabezpieczenie ?? null;
  const sourceEndpoint = baseModel.source_endpoint;
  const projectResults = item.project_results;
  const activeInterlocks = baseModel.interlocks.entries.filter((entry) => entry.active);
  const activeAlarms = runtimeState?.active_alarms ?? [];
  const readinessMessages = readinessIssues
    .filter((issue) => issueTargetsElement(issue, elementId))
    .map((issue, index) => ({
      key: `readiness_${index}`,
      label: issue.severity === 'BLOCKER' ? 'Konfiguracja' : 'Ostrzeżenie',
      value: sanitizeEngineerText(issue.message_pl),
    }));

  return {
    elementType: 'bay',
    elementName: item.bay_name,
    actions: [],
    sections: [
      {
        id: 'ident',
        label: 'Identyfikacja',
        fields: [
          { key: 'bay_id', label: 'Identyfikator pola', value: item.bay_id },
          { key: 'bay_ref', label: 'Oznaczenie pola', value: item.bay_ref },
          { key: 'name', label: 'Nazwa', value: item.bay_name },
          { key: 'role', label: 'Rola kanoniczna', value: fieldRoleLabelPl(baseModel.bay_role) },
          { key: 'object_state', label: 'Stan obiektu', value: nazwaStanuObiektuPl(baseModel.stan_obiektu ?? null) },
          {
            key: 'integrity',
            label: 'Integralność modelu',
            value: integrityStatusLabel(canonicalModel.integrity_status),
          },
        ],
      },
      buildBayCatalogSection(
        baseModel.bay_template_ref ?? null,
        baseModel.switchgear_family_ref ?? null,
        katalog,
        baseModel.stan_obiektu ?? null,
      ),
      {
        id: 'runtime',
        label: 'Stan ruchowy pola',
        // Karta #135: stan ruchowy pola WYŁĄCZNIE ze źródła runtime (`runtime_state` modelu
        // odczytu = rekord źródła albo `null`). Bez źródła każdy wiersz: „brak telemetrii".
        fields: [
          {
            key: 'comm',
            label: 'Łączność urządzenia wtórnego',
            value: runtimeState
              ? communicationStatusLabel(runtimeState.secondary_communication_status)
              : BRAK_TELEMETRII,
          },
          {
            key: 'last_good_update',
            label: 'Ostatnia poprawna aktualizacja',
            value: runtimeState ? runtimeState.last_good_update_at ?? null : BRAK_TELEMETRII,
          },
          {
            key: 'control_availability',
            label: 'Dostępność sterowania',
            value: runtimeState
              ? availabilityLabel(runtimeState.control_availability)
              : BRAK_TELEMETRII,
          },
          {
            key: 'measurement_availability',
            label: 'Dostępność pomiarów',
            value: runtimeState
              ? availabilityLabel(runtimeState.measurement_availability)
              : BRAK_TELEMETRII,
          },
          {
            key: 'command_state',
            label: 'Stan ostatniego polecenia',
            value: runtimeState
              ? commandExecutionStateLabel(runtimeState.pending_command?.state)
              : BRAK_TELEMETRII,
          },
          {
            key: 'safe_to_work',
            label: 'Bezpieczne do pracy',
            value: runtimeState ? runtimeState.energization_and_safety.safe_to_work : BRAK_TELEMETRII,
          },
          {
            key: 'unsafe_reason',
            label: 'Przyczyna braku bezpieczeństwa',
            value: runtimeState
              ? runtimeState.energization_and_safety.unsafe_reason_pl ?? null
              : BRAK_TELEMETRII,
          },
          {
            key: 'energized_bus',
            label: 'Zasilanie od strony szyn',
            value: runtimeState
              ? runtimeState.energization_and_safety.energized_from_bus_side
              : BRAK_TELEMETRII,
          },
          {
            key: 'energized_feeder',
            label: 'Zasilanie od strony odpływu',
            value: runtimeState
              ? runtimeState.energization_and_safety.energized_from_feeder_side
              : BRAK_TELEMETRII,
          },
          {
            key: 'grounded',
            label: 'Pole uziemione',
            value: runtimeState ? runtimeState.energization_and_safety.grounded : BRAK_TELEMETRII,
          },
          {
            key: 'visible_gap',
            label: 'Widoczna przerwa',
            value: runtimeState
              ? runtimeState.energization_and_safety.visible_isolation_gap
              : BRAK_TELEMETRII,
          },
        ],
      },
      {
        id: 'devices',
        label: 'Aparaty pierwotne',
        fields: baseModel.primary_devices.length > 0
          ? baseModel.primary_devices.map((device, index) => ({
              key: `device_${index}`,
              label: `${deviceKindLabel(device.kind)} ${index + 1}`,
              value: `${deviceKindLabel(device.kind)} - ${switchStateLabel(device.switch_state?.actual_state ?? null)}`,
            }))
          : [
              {
                key: 'no_devices',
                label: 'Aparaty pierwotne do konfiguracji',
                value: 'Skonfiguruj pole SN z katalogu aparatury.',
              },
            ],
      },
      buildBayPortsSection(ports),
      {
        id: 'measurements',
        label: 'Tor pomiarowy',
        fields: [
          { key: 'chain_ref', label: 'Identyfikator toru', value: measurementChain?.chain_ref ?? null },
          { key: 'ct_refs', label: 'Przekładniki prądowe', value: joinValues(measurementChain?.ct_refs) },
          { key: 'vt_refs', label: 'Przekładniki napięciowe', value: joinValues(measurementChain?.vt_refs) },
          { key: '3i0', label: 'Źródło 3I0', value: measurementChain?.zero_sequence_current_source ?? null },
          { key: '3u0', label: 'Źródło 3U0', value: measurementChain?.zero_sequence_voltage_source ?? null },
        ],
      },
      {
        id: 'protection',
        label: 'Zabezpieczenie pola',
        fields: [
          { key: 'unit_ref', label: 'Sterownik', value: protection?.name ?? null },
          { key: 'model', label: 'Model', value: protection ? nazwaUrzadzeniaSterownika(protection) : null },
          {
            key: 'functions',
            label: 'Funkcje aktywne',
            value: joinValues(kodyFunkcjiSterownika(protection)) ?? 'Nie skonfigurowano',
          },
          {
            key: 'spz',
            label: 'SPZ',
            value: kodyFunkcjiSterownika(protection).includes('79') ? 'funkcja 79 włączona' : 'SPZ nie skonfigurowany',
          },
        ],
      },
      {
        id: 'control',
        label: 'Sterowanie i uzależnienia',
        fields: [
          {
            key: 'controllable',
            label: 'Aparaty sterowalne',
            value: joinValues(baseModel.control_surface.controllable_device_refs) ?? 'Nie skonfigurowano',
          },
          {
            key: 'open_confirm',
            label: 'Potwierdzenie otwarcia',
            value: baseModel.control_surface.open_requires_confirmation,
          },
          {
            key: 'close_confirm',
            label: 'Potwierdzenie zamknięcia',
            value: baseModel.control_surface.close_requires_confirmation,
          },
          {
            key: 'interlocks',
            label: 'Aktywne uzależnienia',
            value: joinValues(activeInterlocks.map((entry) => entry.code)) ?? 'Nie występują',
          },
        ],
      },
      ...(sourceEndpoint
        ? [{
            id: 'source',
            label: 'Zacisk źródłowy',
            fields: [
              { key: 'source_kind', label: 'Rodzaj źródła', value: sourceKindLabel(sourceEndpoint.source_kind) },
              { key: 'requires_vt', label: 'Wymaga toru przekładnika napięciowego', value: sourceEndpoint.requires_vt },
              { key: 'requires_sync', label: 'Wymaga synchronizmu', value: sourceEndpoint.requires_synchrocheck },
              { key: 'operating_mode', label: 'Tryb pracy', value: sourceEndpoint.operating_mode },
            ],
          }]
        : []),
      {
        id: 'results',
        label: 'Wyniki projektowe pola',
        fields: [
          { key: 'run_ref', label: 'Ostatnie obliczenie', value: projectResults?.run_ref ?? null },
          { key: 'result_state', label: 'Stan wyników', value: resultStateLabel(projectResults?.result_state) },
          { key: 'result_message', label: 'Opis wyników', value: projectResults?.result_message_pl ?? null },
          {
            key: 'sc_contributions',
            label: 'Wkłady źródeł w zwarciu',
            value: projectResults?.source_contributions_sc.length ?? null,
          },
          {
            key: 'pf_contributions',
            label: 'Wkłady źródeł w rozpływie',
            value: projectResults?.source_contributions_pf.length ?? null,
          },
          {
            key: 'earth_fault',
            label: 'Tor ziemnozwarciowy',
            value: projectResults?.earth_fault_path
              ? etykietaPunktuNeutralnegoPL(projectResults.earth_fault_path.neutral_grounding_mode)
              : null,
          },
        ],
      },
      {
        id: 'proof',
        label: 'Wywód pola',
        fields: [
          { key: 'proof_ref', label: 'Identyfikator uzasadnienia', value: projectResults?.proof_binding.proof_ref ?? null },
          {
            key: 'input_refs',
            label: 'Powiązane dane wejściowe',
            value: projectResults?.proof_binding.input_data_refs.length ?? null,
          },
          {
            key: 'source_refs',
            label: 'Powiązane wkłady źródeł',
            value: projectResults?.proof_binding.source_contribution_refs.length ?? null,
          },
        ],
      },
      ...(activeAlarms.length || readinessMessages.length
        ? [{
            id: 'alarms',
            label: 'Alarmy i kontrola',
            fields: [
              ...activeAlarms.map((alarm, index) => ({
                key: `alarm_${index}`,
                label: 'Alarm aktywny',
                value: `${alarm.code}: ${alarm.message_pl}`,
              })),
              ...readinessMessages,
            ],
          }]
        : []),
    ],
  };
}

// =============================================================================
// Element type labels
// =============================================================================

const ELEMENT_TYPE_LABELS: Record<string, string> = {
  bus: 'Szyna',
  branch: 'Gałąź',
  // Rodzaje gałęzi modelu — z jednego słownika (`ui/shared/rodzajGalezi.ts`).
  ...RODZAJ_GALEZI_PL,
  transformer: 'Transformator',
  source: 'Źródło zasilania',
  load: 'Obciążenie',
  Switch: 'Łącznik SN',
  substation: 'Stacja',
  bay: 'Pole',
  generator: 'Generator',
  pv_inverter: 'Układ PV',
  bess_inverter: 'Układ BESS',
  wind_inverter: 'Układ farmy wiatrowej',
  synchronous: 'Generator synchroniczny',
  genset: 'Agregat',
  ups: 'UPS',
  ct: 'Przekładnik prądowy',
  vt: 'Przekładnik napięciowy',
  relay: 'Zabezpieczenie',
  branch_pole: 'Słup rozgałęźny SN',
  zksn: 'ZKSN SN',
  BUSBAR_SECTION: 'Szyna',
  BUSBAR_SYSTEM: 'System szyn',
  MV_CABLE_SEGMENT: 'Odcinek kablowy SN',
  MV_OVERHEAD_SEGMENT: 'Odcinek napowietrzny SN',
  MV_BRANCH_POINT: 'Punkt rozgałęzienia SN',
  MV_LV_TRANSFORMER: 'Transformator SN/nN',
  TRANSFORMER: 'Transformator',
  GPZ: 'GPZ',
  SOURCE: 'Źródło',
  PV_INVERTER: 'Układ PV',
  BESS_CONVERTER: 'Magazyn energii BESS',
  WIND_SOURCE: 'Układ farmy wiatrowej',
  LV_LOAD_NODE: 'Odbiór nN',
};


function formatElementTypeLabel(elementType: string): string {
  return etykietaZeSlownika(ELEMENT_TYPE_LABELS, elementType);
}

function generatorMeta(generator: Generator | null | undefined): Record<string, unknown> {
  return generator?.meta && typeof generator.meta === 'object' ? generator.meta : {};
}

function valueAsString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function generatorStationRef(generator: Generator | null | undefined): string | null {
  const meta = generatorMeta(generator);
  return generator?.station_ref ?? valueAsString(meta.station_ref);
}

/**
 * Generator modelu wskazany selekcją — WYŁĄCZNIE dopasowanie identyfikatora (`ref_id` / `id`).
 * Dawne dopasowanie po podciągach identyfikatora („pv_inverter", „/fw/", „bess", ref stacji
 * zawarty w identyfikatorze) i „jedyny kandydat danego rodzaju" było domysłem: wskazanie
 * spoza modelu dostawało cudzy generator, a z nim cudze operacje.
 */
function findGeneratorForSelectedConverter(
  selectedElement: SelectedElement,
  snapshot: EnergyNetworkModel,
): Generator | null {
  return snapshot.generators?.find((generator) =>
    generator.ref_id === selectedElement.id || generator.id === selectedElement.id,
  ) ?? null;
}

/** Rola źródła przekształtnikowego z rodzaju generatora w modelu (`gen_type`) — model
 *  rozstrzyga, nie rola semantyczna selekcji. */
function converterRoleForGenerator(generator: Generator): 'PV_INVERTER' | 'BESS_CONVERTER' | 'WIND_SOURCE' {
  if (generator.gen_type === 'bess') return 'BESS_CONVERTER';
  if (
    generator.gen_type === 'wind_inverter'
    || generator.gen_type === 'fw_pmsg'
    || generator.gen_type === 'fw_dfig'
    || generator.gen_type === 'fw_scig'
  ) {
    return 'WIND_SOURCE';
  }
  return 'PV_INVERTER';
}

function converterSurfaceCodeForRole(role: string): WorkspaceSurfaceCode {
  if (role === 'BESS_CONVERTER') return 'E-22';
  if (role === 'WIND_SOURCE') return 'E-23';
  return 'E-21';
}

function converterSurfaceTitle(role: string): string {
  if (role === 'BESS_CONVERTER') return 'Konfiguracja magazynu BESS';
  if (role === 'WIND_SOURCE') return 'Konfiguracja farmy wiatrowej';
  return 'Konfiguracja falownika PV';
}

// =============================================================================
// Helpers: branch type guard
// =============================================================================

function isLineCable(b: Branch): b is Branch & { type: 'line_overhead' | 'cable' } {
  return b.type === 'line_overhead' || b.type === 'cable';
}


interface SegmentTechnicalPayload {
  length_km?: number | null;
  r_ohm_per_km?: number | null;
  x_ohm_per_km?: number | null;
  rating?: { in_a?: number | null } | null;
  catalog_ref?: string | null;
  catalog_namespace?: string | null;
}

function getSegmentTechnicalPayload(branch: Branch | undefined): SegmentTechnicalPayload | null {
  if (!branch) return null;
  const payload = branch as Branch & SegmentTechnicalPayload;
  if (
    payload.length_km === undefined
    && payload.r_ohm_per_km === undefined
    && payload.x_ohm_per_km === undefined
    && payload.rating === undefined
    && payload.catalog_ref === undefined
    && payload.catalog_namespace === undefined
  ) {
    return null;
  }
  return payload;
}

function hasSemanticSelection(
  selectedElement: SelectedElement | null | undefined,
): selectedElement is SelectedElement & {
  semanticHash: string;
  semanticElementKind: string;
  semanticEngineeringRole: string;
} {
  return Boolean(
    selectedElement?.semanticHash
      && selectedElement.semanticElementKind
      && selectedElement.semanticEngineeringRole,
  );
}

function semanticTypeKey(selectedElement: SelectedElement): string {
  return selectedElement.semanticEngineeringRole
    ?? selectedElement.semanticElementKind
    ?? selectedElement.type;
}

function semanticTypeLabel(selectedElement: SelectedElement): string {
  return formatElementTypeLabel(semanticTypeKey(selectedElement));
}

/**
 * KARTA S95-START: pozycja kontynuacji ciągu karty technicznej → ta sama para
 * (rodzaj menu, pozycja), którą rozstrzyga menu kanwy. Stacja (także GPZ, którego
 * karta jest kartą stacji) → „Kontynuuj ciąg główny" stacji; odcinek → koniec ciągu.
 */
function kontynuacjaCiaguKartyTechnicznej(
  kind: string,
  elementId: string,
  snapshot: EnergyNetworkModel | null,
): { readonly kind: SldElementKindForMenu; readonly actionId: string } | null {
  if (kind === 'station' || kind === 'gpz') return { kind: 'station', actionId: 'continue-trunk' };
  if (kind === 'line_segment') {
    const galaz = (snapshot?.branches ?? []).find(
      (branch) => branch.ref_id === elementId || branch.id === elementId,
    );
    return {
      kind: galaz?.type === 'line_overhead' ? 'overhead_line_sn' : 'cable_segment_sn',
      actionId: 'continue-trunk-from-endpoint',
    };
  }
  return null;
}

function semanticActionContext(
  selectedElement: SelectedElement,
  context: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...context,
    semantic_element_kind: selectedElement.semanticElementKind,
    semantic_engineering_role: selectedElement.semanticEngineeringRole,
    semantic_hash: selectedElement.semanticHash,
  };
}

function isSemanticMvSegment(selectedElement: SelectedElement): boolean {
  return selectedElement.semanticElementKind === 'MV_CABLE_SEGMENT'
    || selectedElement.semanticElementKind === 'MV_OVERHEAD_SEGMENT'
    || selectedElement.semanticEngineeringRole === 'MV_CABLE_SEGMENT'
    || selectedElement.semanticEngineeringRole === 'MV_OVERHEAD_SEGMENT';
}

function isSemanticOverheadSegment(selectedElement: SelectedElement): boolean {
  return selectedElement.semanticElementKind === 'MV_OVERHEAD_SEGMENT'
    || selectedElement.semanticEngineeringRole === 'MV_OVERHEAD_SEGMENT';
}

function isSemanticCableSegment(selectedElement: SelectedElement): boolean {
  return selectedElement.semanticElementKind === 'MV_CABLE_SEGMENT'
    || selectedElement.semanticEngineeringRole === 'MV_CABLE_SEGMENT';
}

function isSemanticConverterSource(selectedElement: SelectedElement): boolean {
  return selectedElement.semanticElementKind === 'SOURCE'
    && (
      selectedElement.semanticEngineeringRole === 'PV_INVERTER'
      || selectedElement.semanticEngineeringRole === 'BESS_CONVERTER'
      || selectedElement.semanticEngineeringRole === 'WIND_SOURCE'
    );
}

function isSemanticGpzSource(selectedElement: SelectedElement): boolean {
  return selectedElement.semanticElementKind === 'GPZ'
    || selectedElement.semanticEngineeringRole === 'GPZ_SUPPLY_NODE'
    || (selectedElement.type === 'Source' && selectedElement.id.includes('/substation'));
}

/**
 * Aparat pola trafiony na kanwie (`refOperacjiTematu` → `rozbierzIdentyfikatorAparatu`, jeden
 * parser). Treść aparatu daje WYŁĄCZNIE karta techniczna panelu z kanwy
 * (`kartaTechnicznaElementu.ts`: rekord aparatu z `deviceRef` sceny — nazwa, rola techniczna
 * z jednego słownika symboli, dane znamionowe; symbol bez rekordu — karta pola), a operacje
 * aparatu (w tym „Wyprowadź ciąg główny z głowicy") — pasek działań z rejestru menu i jednego
 * wykonawcy. Ten widok dokłada tylko skrót konfiguracji pola, którego pasek nie ma; dawne
 * sekcje „Parametry aparatu" / „Wyprowadzenie sieci SN" były drugą ścieżką tych samych danych
 * i nie renderowały się nigdy, bo karta techniczna zastępuje sekcje widoku (K6).
 */
function buildApparatusSectionsForElement(
  apparatus: IdentyfikatorAparatu,
): { sections: PropertySection[]; elementType: string; elementName: string; actions: QuickAction[] } {
  return {
    sections: [],
    elementType: 'apparatus',
    elementName: nazwaAparatuPl(apparatus.symbolId),
    actions: [
      {
        id: 'edit_field_apparatus',
        label: 'Skonfiguruj pole SN',
        op: 'update_element_parameters',
        context: {
          element_ref: apparatus.bayRef,
          field_ref: apparatus.bayRef,
          target_tab: 'apparatus',
        },
      },
    ],
  };
}

function buildSemanticSegmentSections(
  selectedElement: SelectedElement,
  branch: Branch | undefined,
  snapshot: EnergyNetworkModel,
  readinessIssues: ReadinessIssue[],
): { sections: PropertySection[]; elementType: string; elementName: string; actions: QuickAction[] } {
  const elementId = selectedElement.id;
  const segmentRef = branch?.ref_id ?? elementId;
  const segmentName = branch?.name ?? selectedElement.name;
  const segmentPayload = getSegmentTechnicalPayload(branch);
  const sections: PropertySection[] = [
    {
      id: 'ident',
      label: 'Identyfikacja',
      fields: [
        { key: 'ref_id', label: 'Oznaczenie odcinka', value: segmentRef },
        { key: 'name', label: 'Nazwa', value: segmentName },
        { key: 'type', label: 'Typ', value: semanticTypeLabel(selectedElement) },
        { key: 'engineering_role', label: 'Rola semantyczna', value: selectedElement.semanticEngineeringRole ?? null },
        ...(branch?.status ? [{ key: 'status', label: 'Stan', value: branch.status }] : []),
      ],
    },
  ];
  const actions: QuickAction[] = [
    {
      id: 'assign_catalog',
      label: 'Przypisz katalog',
      op: 'assign_catalog_to_element',
      context: semanticActionContext(selectedElement, { element_ref: segmentRef }),
    },
    {
      id: 'insert_station_on_segment_sn',
      label: 'Wstaw stację',
      op: 'insert_station_on_segment_sn',
      context: semanticActionContext(selectedElement, { segment_ref: segmentRef }),
    },
  ];

  const branchParent = findParentStation(elementId, snapshot);
  if (branchParent) {
    sections[0].fields.push(
      { key: 'parent_station', label: 'Stacja nadrzedna', value: branchParent },
    );
  }

  if (branch) {
    sections.push({
      id: 'topology',
      label: 'Topologia',
      fields: [
        { key: 'from_bus', label: 'Szyna poczatkowa', value: branch.from_bus_ref },
        { key: 'to_bus', label: 'Szyna koncowa', value: branch.to_bus_ref },
      ],
    });
  }
  if (segmentPayload) {
    sections.push({
      id: 'electrical',
      label: 'Parametry elektryczne',
      fields: [
        { key: 'length_km', label: 'Długość', value: segmentPayload.length_km ?? null, unit: 'km' },
        { key: 'r_ohm', label: 'Rezystancja R\'', value: segmentPayload.r_ohm_per_km ?? null, unit: 'ohm/km', source: 'catalog' },
        { key: 'x_ohm', label: 'Reaktancja X\'', value: segmentPayload.x_ohm_per_km ?? null, unit: 'ohm/km', source: 'catalog' },
        { key: 'rating', label: 'Obciążalność długotrwała', value: segmentPayload.rating?.in_a ?? null, unit: 'A', source: 'catalog' },
      ],
    });
    sections.push({
      id: 'catalog',
      label: 'Katalog',
      fields: [
        { key: 'catalog_ref', label: 'Pozycja katalogowa', value: segmentPayload.catalog_ref ?? '?' },
      ],
    });
  }

  if (isSemanticOverheadSegment(selectedElement)) {
    actions.push({
      id: 'insert_branch_pole_on_segment_sn',
      label: 'Wstaw słup rozgałęźny',
      op: 'insert_branch_pole_on_segment_sn',
      context: semanticActionContext(selectedElement, { segment_ref: segmentRef }),
    });
  }
  if (isSemanticCableSegment(selectedElement)) {
    actions.push({
      id: 'insert_zksn_on_segment_sn',
      label: 'Wstaw ZKSN',
      op: 'insert_zksn_on_segment_sn',
      context: semanticActionContext(selectedElement, { segment_ref: segmentRef }),
    });
  }
  actions.push({
    id: 'insert_section_switch_sn',
    label: 'Wstaw łącznik',
    op: 'insert_section_switch_sn',
    context: semanticActionContext(selectedElement, { segmentRef: segmentRef, segmentLabel: segmentName }),
  });

  appendReadinessSection(sections, readinessIssues, elementId);

  return {
    sections,
    elementType: semanticTypeKey(selectedElement),
    elementName: segmentName,
    actions,
  };
}

/**
 * Sekcja „Kontrola" — problemy gotowości wskazujące obiekt (którykolwiek z `refs`). JEDNA
 * reguła dla sekcji widoku i dla karty technicznej panelu z kanwy: karta zastępuje sekcje
 * danych obiektu (K6), ale nie zdejmuje z inspektora tego, co blokuje obliczenia obiektu.
 */
function sekcjaKontroli(readinessIssues: ReadinessIssue[], refs: readonly string[]): PropertySection | null {
  const dotyczy = (issue: ReadinessIssue) => refs.some((ref) => ref !== '' && issueTargetsElement(issue, ref));
  const elementBlockers = readinessIssues.filter((issue) => issue.severity === 'BLOCKER' && dotyczy(issue));
  const elementWarnings = readinessIssues.filter((issue) => issue.severity !== 'BLOCKER' && dotyczy(issue));
  if (elementBlockers.length === 0 && elementWarnings.length === 0) return null;
  return {
    id: 'readiness',
    label: 'Kontrola',
    fields: [
      ...elementBlockers.map((b, i) => ({
        key: `blocker_${i}`,
        label: 'Konfiguracja',
        value: sanitizeEngineerText(b.message_pl),
      })),
      ...elementWarnings.map((w, i) => ({
        key: `warning_${i}`,
        label: 'Ostrzeżenie',
        value: sanitizeEngineerText(w.message_pl),
      })),
    ],
  };
}

function appendReadinessSection(
  sections: PropertySection[],
  readinessIssues: ReadinessIssue[],
  elementId: string,
): void {
  const sekcja = sekcjaKontroli(readinessIssues, [elementId]);
  if (sekcja) sections.push(sekcja);
}

/**
 * Źródło przekształtnikowe (PV/BESS/FW): dane obiektu pokazuje WYŁĄCZNIE karta techniczna
 * panelu z kanwy (`kartaTechnicznaElementu.ts::kartaZrodla` — identyfikacja, typ i producent
 * przekształtnika z katalogu, tor przyłączenia, zgodność przyłączeniowa NC RfG/FRT,
 * zabezpieczenie źródła). Ten widok dokłada tylko operacje modelu, których pasek działań nie
 * ma. Dawne sekcje „Falownik z katalogu", „NC RfG i regulacja", „FRT / LVRT / HVRT",
 * „Obliczenia i uzasadnienie", „Zabezpieczenia falownika" były drugą ścieżką tych samych
 * danych — przy karcie nie renderowały się nigdy, a bez obiektu w modelu pokazywały szablon
 * „do konfiguracji" dla obiektu, którego nie ma (atrapa).
 */
function dzialaniaZrodlaPrzeksztaltnikowego(
  selectedElement: SelectedElement,
  snapshot: EnergyNetworkModel,
): { sections: PropertySection[]; elementType: string; elementName: string; actions: QuickAction[] } {
  const generator = findGeneratorForSelectedConverter(selectedElement, snapshot);
  // Wskazanie bez generatora w modelu nie ma operacji źródła (zero atrapy).
  if (!generator) return { sections: [], elementType: '', elementName: selectedElement.name, actions: [] };
  const role = converterRoleForGenerator(generator);
  const generatorRef = generator.ref_id;
  const actionContext = hasSemanticSelection(selectedElement)
    ? semanticActionContext(selectedElement, { element_ref: generatorRef, generator_ref: generatorRef })
    : { element_ref: generatorRef, generator_ref: generatorRef };
  return {
    sections: [],
    elementType: role,
    elementName: generator.name,
    actions: [
      {
        id: 'assign_catalog',
        label: role === 'PV_INVERTER' ? 'Zmień katalog falownika' : 'Zmień katalog urządzenia',
        op: 'assign_catalog_to_element',
        context: actionContext,
      },
      {
        id: 'edit',
        label: role === 'PV_INVERTER' ? 'Skonfiguruj falownik PV' : 'Skonfiguruj układ PV/BESS/FW',
        op: 'update_element_parameters',
        context: actionContext,
      },
    ],
  };
}

/**
 * Sieć zasilająca GPZ: dane (parametry zwarciowe MAX/MIN, napięcie zadane, model zastępczy,
 * impedancja Thevenina, sekcja rozdzielni) pokazuje WYŁĄCZNIE karta techniczna
 * (`kartaTechnicznaElementu.ts::kartaSieci`); dawne sekcje „Parametry sieci"/„Sekcje GPZ"
 * tego widoku były drugą ścieżką tych samych danych. Zostaje operacja edycji parametrów.
 */
function dzialaniaSieciZasilajacej(
  selectedElement: SelectedElement,
  snapshot: EnergyNetworkModel,
): { sections: PropertySection[]; elementType: string; elementName: string; actions: QuickAction[] } {
  const source = snapshot.sources?.find((s) =>
    s.ref_id === selectedElement.id
    || s.id === selectedElement.id
    || s.substation_ref === selectedElement.id
  );
  return {
    sections: [],
    elementType: semanticTypeKey(selectedElement),
    elementName: source?.name ?? selectedElement.name,
    actions: [
      {
        id: 'edit',
        label: 'Edytuj parametry',
        op: 'update_element_parameters',
        context: semanticActionContext(selectedElement, { element_ref: selectedElement.id }),
      },
    ],
  };
}

function buildSemanticSectionsForElement(
  selectedElement: SelectedElement,
  snapshot: EnergyNetworkModel,
  readinessIssues: ReadinessIssue[],
): { sections: PropertySection[]; elementType: string; elementName: string; actions: QuickAction[] } {
  if (isSemanticMvSegment(selectedElement)) {
    return buildSemanticSegmentSections(
      selectedElement,
      snapshot.branches?.find((branch) => branch.ref_id === selectedElement.id),
      snapshot,
      readinessIssues,
    );
  }

  if (isSemanticConverterSource(selectedElement)) {
    return dzialaniaZrodlaPrzeksztaltnikowego(selectedElement, snapshot);
  }

  if (isSemanticGpzSource(selectedElement)) {
    return dzialaniaSieciZasilajacej(selectedElement, snapshot);
  }

  const sections: PropertySection[] = [
    {
      id: 'ident',
      label: 'Identyfikacja',
      fields: [
        { key: 'ref_id', label: 'Oznaczenie elementu', value: selectedElement.id },
        { key: 'name', label: 'Nazwa', value: selectedElement.name },
        { key: 'type', label: 'Typ', value: semanticTypeLabel(selectedElement) },
        { key: 'engineering_role', label: 'Rola semantyczna', value: selectedElement.semanticEngineeringRole ?? null },
      ],
    },
  ];
  appendReadinessSection(sections, readinessIssues, selectedElement.id);

  return {
    sections,
    elementType: semanticTypeKey(selectedElement),
    elementName: selectedElement.name,
    actions: [
      {
        id: 'edit',
        label: 'Edytuj parametry',
        op: 'update_element_parameters',
        context: semanticActionContext(selectedElement, { element_ref: selectedElement.id }),
      },
    ],
  };
}

// =============================================================================
// Helpers: build sections from ENM element
// =============================================================================

function findParentStation(
  elementId: string,
  snapshot: EnergyNetworkModel,
): string | null {
  // SZYNY-STACJI-LUSTRO: stacja transformatora z JEDNEJ reguły „transformatory stacji”.
  const trStationRef = stationRefOfTransformer(snapshot, elementId);
  const trStation = trStationRef ? snapshot.substations?.find((s) => s.ref_id === trStationRef) : undefined;
  if (trStation) return trStation.name;
  // Check generator station_ref
  const gen = snapshot.generators?.find((g) => g.ref_id === elementId);
  if (gen?.station_ref) {
    const station = snapshot.substations?.find((s) => s.id === gen.station_ref);
    return station?.name ?? null;
  }
  // SZYNY-STACJI-LUSTRO: odbiór/generator/gałąź → stacja szyny z jednego lustra
  // `szynyStacji` (szyny główne, zaciski pól SN, końce aparatów pól nN).
  const stacjaSzyny = stacjaSzyn(snapshot);
  const nazwaStacji = (busRef: string | null | undefined): string | null => {
    const ref = busRef ? stacjaSzyny.get(busRef) : undefined;
    return ref ? snapshot.substations?.find((s) => s.ref_id === ref)?.name ?? null : null;
  };
  const load = snapshot.loads?.find((l) => l.ref_id === elementId);
  const busRef = load?.bus_ref ?? gen?.bus_ref;
  if (busRef) return nazwaStacji(busRef);
  const branch = snapshot.branches?.find((b) => b.ref_id === elementId || b.id === elementId);
  if (branch) return nazwaStacji(branch.from_bus_ref);
  return null;
}

function buildSectionsForElement(
  elementId: string,
  snapshot: EnergyNetworkModel | null,
  readinessIssues: ReadinessIssue[],
  logicalViews?: LogicalViewsV1 | null,
  selectedElement?: SelectedElement | null,
): { sections: PropertySection[]; elementType: string; elementName: string; actions: QuickAction[] } {
  if (!snapshot) return { sections: [], elementType: '', elementName: '', actions: [] };

  // Źródło przekształtnikowe: generator modelu o identyfikatorze selekcji (bez domysłu z
  // podciągów identyfikatora albo z rodzaju selekcji).
  if (selectedElement && findGeneratorForSelectedConverter(selectedElement, snapshot)) {
    return dzialaniaZrodlaPrzeksztaltnikowego(selectedElement, snapshot);
  }

  if (hasSemanticSelection(selectedElement)) {
    return buildSemanticSectionsForElement(selectedElement, snapshot, readinessIssues);
  }

  const sections: PropertySection[] = [];
  const actions: QuickAction[] = [];
  let elementType = '';
  let elementName = '';

  // Try to find in buses
  const bus = findOperationalBus(snapshot, elementId);
  if (bus) {
    elementType = 'bus';
    elementName = bus.name;
    sections.push({
      id: 'ident', label: 'Identyfikacja', fields: [
        { key: 'ref_id', label: 'Oznaczenie szyny', value: bus.ref_id },
        { key: 'name', label: 'Nazwa', value: bus.name },
        { key: 'type', label: 'Typ', value: ELEMENT_TYPE_LABELS.bus },
      ],
    });
    sections.push({
      id: 'electrical', label: 'Parametry elektryczne', fields: [
        { key: 'voltage_kv', label: 'Napięcie znamionowe', value: bus.voltage_kv, unit: 'kV' },
      ],
    });
  }

  // Try branches
  const branch = snapshot.branches?.find((b) => b.ref_id === elementId);
  if (branch) {
    if (isApparatusBranch(branch)) {
      elementType = 'Switch';
      elementName = branch.name;
      const apparatusLabel = RODZAJ_GALEZI_PL[branch.type];
      const branchParent = findParentStation(elementId, snapshot);
      sections.push({
        id: 'ident',
        label: 'Identyfikacja',
        fields: [
          { key: 'ref_id', label: 'Oznaczenie aparatu', value: branch.ref_id },
          { key: 'name', label: 'Nazwa', value: branch.name },
          { key: 'kind', label: 'Rodzaj aparatu', value: apparatusLabel },
          // Jedna mapa etykiet położenia (`OPIS_POLOZENIA_PL`, kafel stanu kanwy i inspektor):
          // brak `status` to stan nieustalony, nie „otwarty" (dawny domysł).
          { key: 'status', label: 'Stan ruchowy', value: OPIS_POLOZENIA_PL[stanStatusuGalezi(branch.status)] },
          ...(branchParent ? [{ key: 'parent_station', label: 'Stacja nadrzędna', value: branchParent }] : []),
        ],
      });
      sections.push({
        id: 'topology',
        label: 'Topologia',
        fields: [
          { key: 'from_bus', label: 'Szyna początkowa', value: branch.from_bus_ref },
          { key: 'to_bus', label: 'Szyna końcowa', value: branch.to_bus_ref },
        ],
      });
      sections.push({
        id: 'catalog',
        label: 'Katalog aparatu',
        fields: [
          { key: 'catalog_ref', label: 'Pozycja katalogowa', value: branch.catalog_ref ?? '?' },
          { key: 'catalog_namespace', label: 'Przestrzeń katalogu', value: branch.catalog_namespace ?? 'APARAT_SN' },
        ],
      });
      actions.push({
        id: 'assign_catalog',
        label: 'Przypisz katalog aparatu',
        op: 'assign_catalog_to_element',
        context: {
          element_ref: branch.ref_id,
          element_type: 'switch',
          catalog_namespace: branch.catalog_namespace ?? 'APARAT_SN',
        },
      });
      return { sections, elementType, elementName, actions };
    }

    elementType = branch.type;
    elementName = branch.name;
    sections.push({
      id: 'ident', label: 'Identyfikacja', fields: [
        { key: 'ref_id', label: 'Oznaczenie odcinka', value: branch.ref_id },
        { key: 'name', label: 'Nazwa', value: branch.name },
        { key: 'type', label: 'Typ', value: RODZAJ_GALEZI_PL[branch.type] },
        { key: 'status', label: 'Stan', value: branch.status },
      ],
    });
    // Parent station and role context
    const branchParent = findParentStation(elementId, snapshot);
    if (branchParent) {
      sections[sections.length - 1].fields.push(
        { key: 'parent_station', label: 'Stacja nadrzędna', value: branchParent },
      );
    }
    // Role context from logical views
    if (logicalViews) {
      let roleLabel = '—';
      const isTrunk = logicalViews.trunks?.some((t) => t.segments?.includes(elementId));
      const isBranch = logicalViews.branches?.some((br) => br.segments?.includes(elementId));
      const isSecondary = logicalViews.secondary_connectors?.some((sc) => sc.segment_ref === elementId);
      if (isTrunk) roleLabel = 'Magistrala';
      else if (isBranch) roleLabel = 'Odgałęzienie';
      else if (isSecondary) roleLabel = 'Połączenie pierścieniowe';
      sections[sections.length - 1].fields.push(
        { key: 'role', label: 'Rola w sieci', value: roleLabel },
      );
    }
    sections.push({
      id: 'topology', label: 'Topologia', fields: [
        { key: 'from_bus', label: 'Szyna początkowa', value: branch.from_bus_ref },
        { key: 'to_bus', label: 'Szyna końcowa', value: branch.to_bus_ref },
      ],
    });
    if (isLineCable(branch)) {
      sections.push({
        id: 'electrical', label: 'Parametry elektryczne', fields: [
          { key: 'length_km', label: 'Długość', value: branch.length_km, unit: 'km' },
          { key: 'r_ohm', label: 'Rezystancja R\'', value: branch.r_ohm_per_km, unit: 'Ω/km', source: 'catalog' },
          { key: 'x_ohm', label: 'Reaktancja X\'', value: branch.x_ohm_per_km, unit: 'Ω/km', source: 'catalog' },
          { key: 'rating', label: 'Obciążalność długotrwała', value: branch.rating?.in_a ?? null, unit: 'A', source: 'catalog' },
        ],
      });
    }
    sections.push({
      id: 'catalog', label: 'Katalog', fields: [
        { key: 'catalog_ref', label: 'Pozycja katalogowa', value: branch.catalog_ref ?? '?' },
      ],
    });
    actions.push({ id: 'assign_catalog', label: 'Przypisz katalog', op: 'assign_catalog_to_element', context: { element_ref: branch.ref_id } });
    if (isLineCable(branch)) {
      actions.push({ id: 'insert_station_on_segment_sn', label: 'Wstaw stację', op: 'insert_station_on_segment_sn', context: { segment_ref: branch.ref_id } });
      if (branch.type === 'line_overhead') {
        actions.push({ id: 'insert_branch_pole_on_segment_sn', label: 'Wstaw słup rozgałęźny', op: 'insert_branch_pole_on_segment_sn', context: { segment_ref: branch.ref_id } });
      }
      if (branch.type === 'cable') {
        actions.push({ id: 'insert_zksn_on_segment_sn', label: 'Wstaw ZKSN', op: 'insert_zksn_on_segment_sn', context: { segment_ref: branch.ref_id } });
      }
      actions.push({ id: 'insert_section_switch_sn', label: 'Wstaw łącznik', op: 'insert_section_switch_sn', context: { segmentRef: branch.ref_id, segmentLabel: branch.name } });
    }
  }

  // Try branch points
  const branchPoint = snapshot.branch_points?.find((bp) => bp.ref_id === elementId);
  if (branchPoint) {
    elementType = branchPoint.branch_point_type;
    elementName = branchPoint.name;
    sections.push({
      id: 'ident',
      label: 'Identyfikacja',
      fields: [
        { key: 'ref_id', label: 'Oznaczenie punktu rozgałęzienia', value: branchPoint.ref_id },
        { key: 'name', label: 'Nazwa', value: branchPoint.name },
        { key: 'type', label: 'Typ', value: formatElementTypeLabel(branchPoint.branch_point_type) },
      ],
    });
    sections.push({
      id: 'topology',
      label: 'Topologia',
      fields: [
        { key: 'parent_segment_id', label: 'Segment nadrzędny', value: branchPoint.parent_segment_id },
        { key: 'main_in', label: 'Port główny wejściowy', value: branchPoint.ports?.MAIN_IN ?? '?' },
        { key: 'main_out', label: 'Port główny wyjściowy', value: branchPoint.ports?.MAIN_OUT ?? '?' },
        { key: 'branch_ports', label: 'Porty odgałęzień', value: branchPoint.ports?.BRANCH?.join(', ') ?? '?' },
      ],
    });
    sections.push({
      id: 'catalog',
      label: 'Katalog',
      fields: [
        { key: 'catalog_ref', label: 'Pozycja katalogowa', value: branchPoint.catalog_ref ?? '?' },
      ],
    });
    actions.push({ id: 'start_branch_segment_sn', label: 'Dodaj odgałęzienie', op: 'start_branch_segment_sn' });
  }

  // Try transformers
  const transformer = snapshot.transformers?.find((t) => t.ref_id === elementId);
  if (transformer) {
    elementType = 'transformer';
    elementName = transformer.name;
    sections.push({
      id: 'ident', label: 'Identyfikacja', fields: [
        { key: 'ref_id', label: 'Oznaczenie transformatora', value: transformer.ref_id },
        { key: 'name', label: 'Nazwa', value: transformer.name },
        { key: 'type', label: 'Typ', value: ELEMENT_TYPE_LABELS.transformer },
      ],
    });
    sections.push({
      id: 'topology', label: 'Topologia', fields: [
        { key: 'hv_bus', label: 'Szyna GN (SN)', value: transformer.hv_bus_ref },
        { key: 'lv_bus', label: 'Szyna DN (nN)', value: transformer.lv_bus_ref },
      ],
    });
    sections.push({
      id: 'electrical', label: 'Parametry elektryczne', fields: [
        { key: 'sn_mva', label: 'Moc znamionowa', value: transformer.sn_mva, unit: 'MVA', source: 'catalog' },
        { key: 'uk_percent', label: 'Napięcie zwarcia $u_{k}$', value: transformer.uk_percent, unit: '%', source: 'catalog' },
        { key: 'pk_kw', label: 'Straty zwarciowe $P_{k}$', value: transformer.pk_kw, unit: 'kW', source: 'catalog' },
        { key: 'tap_position', label: 'Pozycja zaczepu', value: transformer.tap_position ?? 0 },
        { key: 'vector_group', label: 'Grupa wektorowa', value: transformer.vector_group ?? '?', source: 'catalog' },
      ],
    });
    sections.push({
      id: 'catalog', label: 'Katalog', fields: [
        { key: 'catalog_ref', label: 'Pozycja katalogowa', value: transformer.catalog_ref ?? '?' },
      ],
    });
    actions.push({ id: 'assign_catalog', label: 'Przypisz katalog', op: 'assign_catalog_to_element', context: { element_ref: transformer.ref_id } });
    actions.push({ id: 'edit', label: 'Edytuj parametry', op: 'update_element_parameters', context: { element_ref: transformer.ref_id } });
  }

  // Sieć zasilająca: dane — karta techniczna (`kartaSieci`); tu wyłącznie operacja edycji.
  const source = snapshot.sources?.find((s) =>
    s.ref_id === elementId
    || s.id === elementId
    || s.substation_ref === elementId
  );
  if (source) {
    elementType = 'source';
    elementName = source.name;
    actions.push({ id: 'edit', label: 'Edytuj parametry', op: 'update_element_parameters', context: { element_ref: source.ref_id } });
  }

  // Try substations
  const station = source
    ? null
    : snapshot.substations?.find((s) => s.id === elementId || s.ref_id === elementId);
  if (station) {
    elementType = 'substation';
    const stationIdentity = stationPublicIdentity(snapshot, station);
    elementName = stationIdentity.displayName;
    // K6 (Z-12): dane stacji (identyfikacja, rozdzielnica SN z tabelą pól, transformator,
    // strona nN, przyłączenia) pokazuje WYŁĄCZNIE karta techniczna panelu z kanwy
    // (`kartaTechnicznaElementu.ts`) — dawne sekcje „Identyfikacja"/„Struktura" tego widoku
    // były drugą, uboższą ścieżką tych samych danych i zostały usunięte.
    // SZYNY-STACJI-LUSTRO: transformatory stacji z JEDNEJ reguły (bez blokowego źródła DER).
    const stationTransformers = selectStationDistributionTransformers(snapshot, station);
    actions.push({ id: 'continue_trunk_from_station', label: 'Kontynuuj ciąg SN', op: 'continue_trunk_segment_sn', variant: 'primary' });
    if (stationTransformers.length === 0) {
      actions.push({ id: 'create_transformer_sn_nn', label: 'Dobierz transformator z katalogu', op: 'add_transformer_sn_nn', context: { station_ref: station.id }, variant: 'primary' });
    }
    actions.push({ id: 'create_converter_source_pv', label: 'Dodaj układ PV z katalogu', op: 'add_converter_source', context: { station_ref: station.id, source_technology: 'PV' } });
    actions.push({ id: 'create_converter_source_bess', label: 'Dodaj układ BESS z katalogu', op: 'add_converter_source', context: { station_ref: station.id, source_technology: 'BESS' } });
    actions.push({ id: 'create_converter_source_fw', label: 'Dodaj układ farmy wiatrowej z katalogu', op: 'add_converter_source', context: { station_ref: station.id, source_technology: 'FW' } });
  }

  // Generator (PV/BESS/FW): dane — karta techniczna źródła; tu wyłącznie operacje modelu.
  const generator = snapshot.generators?.find((g) => g.ref_id === elementId);
  if (generator) {
    const semanticRole = generator.gen_type === 'bess'
      ? 'BESS_CONVERTER'
      : generator.gen_type === 'wind_inverter'
        || generator.gen_type === 'fw_pmsg'
        || generator.gen_type === 'fw_dfig'
        || generator.gen_type === 'fw_scig'
          ? 'WIND_SOURCE'
          : 'PV_INVERTER';
    return dzialaniaZrodlaPrzeksztaltnikowego(
      {
        ...(selectedElement ?? {}),
        id: generator.ref_id,
        type: selectedElement?.type ?? 'Generator',
        name: generator.name,
        semanticHash: selectedElement?.semanticHash ?? `source:${generator.ref_id}`,
        semanticElementKind: 'SOURCE',
        semanticEngineeringRole: semanticRole,
      } as SelectedElement,
      snapshot,
    );
  }

  // Try loads
  const load = snapshot.loads?.find((l) => l.ref_id === elementId);
  if (load) {
    elementType = 'load';
    elementName = load.name;
    sections.push({
      id: 'ident', label: 'Identyfikacja', fields: [
        { key: 'ref_id', label: 'Oznaczenie odbioru', value: load.ref_id },
        { key: 'name', label: 'Nazwa', value: load.name },
        { key: 'type', label: 'Typ', value: ELEMENT_TYPE_LABELS.load },
      ],
    });
    sections.push({
      id: 'electrical', label: 'Parametry elektryczne', fields: [
        { key: 'p_mw', label: 'Moc czynna', value: load.p_mw, unit: 'MW' },
        { key: 'q_mvar', label: 'Moc bierna', value: load.q_mvar, unit: 'Mvar' },
      ],
    });
    actions.push({ id: 'edit', label: 'Edytuj parametry', op: 'update_element_parameters', context: { element_ref: load.ref_id } });
  }

  // Sekcja kontroli konfiguracji dla tego elementu.
  appendReadinessSection(sections, readinessIssues, elementId);

  return { sections, elementType, elementName, actions };
}

// =============================================================================
// Component
// =============================================================================

export interface InspectorEngineeringViewProps {
  className?: string;
}

export function InspectorEngineeringView({ className }: InspectorEngineeringViewProps) {
  const [segmentCatalogPickerOpen, setSegmentCatalogPickerOpen] = useState(false);
  const selectedElements = useSelectionStore((s) => s.selectedElements);
  const selectedElement = useSelectionStore((s) => s.selectedElements[0] ?? null);
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const logicalViews = useSnapshotStore((s) => s.logicalViews);
  const readinessIssues = useProblemyGotowosci();
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);
  const openRouteSurface = useNetworkBuildStore((s) => s.openRouteSurface);
  const activeMode = useAppStateStore((s) => s.activeMode);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const runIdOgladany = useRunIdOgladany();
  const {
    itemsByBayId,
    itemsByBayRef,
    isLoading: isFieldLoading,
    error: fieldReadModelError,
  } = useFieldReadModel();
  // UI-02b JEDEN-INSPEKTOR: sekcje przejęte z dawnej szuflady kanwy (działania z rejestru
  // menu, wyniki elementu, węzeł SN, stan aparatu, szkic DER) — dla TEJ SAMEJ selekcji.
  const stanPanelu = useStanPaneluElementu();
  // Operacje już osiągalne z paska działań (ten sam rejestr co menu kanwy) — skróty karty
  // technicznej i szybkich operacji do tej samej operacji nie są powtarzane.
  const operacjeZPaska = useMemo(() => {
    const zbior = new Set<string>();
    for (const akcja of stanPanelu?.akcje ?? []) {
      const op = operacjaAkcjiMenu(akcja.id);
      if (op) zbior.add(op);
    }
    return zbior;
  }, [stanPanelu?.akcje]);

  const elementId = selectedElements.length > 0 ? selectedElements[0].id : null;
  const selectedBaySnapshot = useMemo(
    () => snapshot?.bays?.find((bay) => bay.id === elementId || bay.ref_id === elementId) ?? null,
    [snapshot, elementId],
  );
  const selectedBayField = useMemo(() => {
    if (!elementId) return null;
    return itemsByBayId.get(elementId)
      ?? itemsByBayRef.get(elementId)
      ?? (selectedBaySnapshot
        ? itemsByBayId.get(selectedBaySnapshot.id) ?? itemsByBayRef.get(selectedBaySnapshot.ref_id)
        : null)
      ?? null;
  }, [elementId, itemsByBayId, itemsByBayRef, selectedBaySnapshot]);
  const isSelectedBay = selectedElement?.type === 'BaySN' || Boolean(selectedBayField);
  const selectedBayKatalog = useKatalogPola(
    selectedBayField?.canonical_model.base_model.bay_template_ref,
    selectedBayField?.canonical_model.base_model.switchgear_family_ref,
  );
  const selectedBayPorts = selectedBaySnapshot?.ports ?? null;
  const selectedBayName = nazwaObiektuPl(pierwszaNazwa(selectedBayField?.bay_name, selectedElement?.name), 'pole');
  const selectedSegment = useMemo(
    () => elementId
      ? snapshot?.branches?.find((branch) => branch.ref_id === elementId || branch.id === elementId) ?? null
      : null,
    [elementId, snapshot],
  );
  const isSelectedSegment = selectedElement?.type === 'LineBranch'
    && (!selectedSegment || isLineCable(selectedSegment));
  const selectedSegmentCatalogRef = selectedSegment?.catalog_ref ?? null;
  const selectedSegmentCatalogNamespace = inferSegmentCatalogNamespace(selectedSegment);
  const selectedSegmentPickerCategory = inferSegmentPickerCategory(selectedSegment);
  const selectedConverterGenerator = useMemo(
    () => selectedElement && snapshot
      ? findGeneratorForSelectedConverter(selectedElement, snapshot)
      : null,
    [selectedElement, snapshot],
  );
  const selectedConverterRole = selectedConverterGenerator
    ? converterRoleForGenerator(selectedConverterGenerator)
    : null;
  const selectedConverterRef = selectedConverterRole ? selectedConverterGenerator?.ref_id ?? null : null;
  const calculationProofRefs = useMemo(
    () => buildCalculationProofCandidateRefs(elementId, selectedElement, snapshot),
    [elementId, selectedElement, snapshot],
  );

  // Aparat pola trafiony na kanwie: tożsamość z tematu kliknięcia (ten sam ref operacji, którym
  // pasek działań woła wykonawcę), rozebrana jednym parserem identyfikatora aparatu.
  const temat = stanPanelu?.temat ?? null;
  const aparatZaznaczenia = useMemo(
    () => (temat ? rozbierzIdentyfikatorAparatu(refOperacjiTematu(temat)) : null),
    [temat],
  );

  const { sections, elementType, elementName, actions } = useMemo(
    () => {
      if (aparatZaznaczenia) {
        return buildApparatusSectionsForElement(aparatZaznaczenia);
      }
      if (isSelectedBay) {
        return buildBaySections(
          selectedBayField,
          isFieldLoading,
          fieldReadModelError,
          readinessIssues,
          elementId ?? '',
          selectedBayName,
          selectedBayKatalog,
          selectedBayPorts,
        );
      }
      return buildSectionsForElement(
        elementId ?? '',
        snapshot,
        readinessIssues,
        logicalViews,
        selectedElement,
      );
    },
    [
      aparatZaznaczenia,
      elementId,
      fieldReadModelError,
      isSelectedBay,
      isFieldLoading,
      logicalViews,
      readinessIssues,
      selectedBayField,
      selectedBayKatalog,
      selectedBayName,
      selectedBayPorts,
      selectedElement,
      snapshot,
    ],
  );

  const handleAction = useCallback(
    (action: QuickAction) => {
      if (!selectedElement) {
        openOperationForm(action.op, action.context);
        return;
      }
      openOperationForm(action.op, buildOperationContext({
        canonicalOp: action.op,
        elementId: selectedElement.id,
        elementType: selectedElement.type,
        snapshot,
        logicalViews,
        extraContext: action.context,
      }));
    },
    [logicalViews, openOperationForm, selectedElement, snapshot],
  );

  const handleOpenConverterSurface = useCallback(() => {
    if (!selectedConverterRole || !selectedConverterRef) return;
    openRouteSurface(converterSurfaceCodeForRole(selectedConverterRole), {
      entityRef: selectedConverterRef,
      entityType: selectedConverterRole === 'PV_INVERTER'
        ? 'pv_source'
        : selectedConverterRole === 'BESS_CONVERTER'
          ? 'bess_source'
          : 'fw_source',
      subjectKind: 'entity',
      titlePl: converterSurfaceTitle(selectedConverterRole),
      payload: {
        derId: selectedConverterRef,
        derName: selectedElement?.name || elementName,
        derRole: selectedConverterRole,
        stationId: selectedConverterGenerator ? generatorStationRef(selectedConverterGenerator) : null,
      },
      openMode: 'replace_right_panel',
    });
  }, [
    openRouteSurface,
    selectedConverterGenerator,
    selectedConverterRef,
    selectedConverterRole,
  ]);

  const handleSelectSegmentCatalog = useCallback(
    (typeId: string) => {
      if (!activeCaseId || !elementId || !selectedSegmentCatalogNamespace) return;
      void executeDomainOperation(activeCaseId, 'assign_catalog_to_element', {
        element_ref: elementId,
        catalog_binding: buildCatalogBinding(selectedSegmentCatalogNamespace, typeId),
      }).finally(() => {
        setSegmentCatalogPickerOpen(false);
      });
    },
    [activeCaseId, elementId, executeDomainOperation, selectedSegmentCatalogNamespace],
  );

  const techCardSubject = useMemo(
    () => buildTechCardSubject(snapshot, selectedElement, { readinessBlocker: null }),
    [snapshot, selectedElement],
  );
  const techCardSubjectWithActions = useMemo(() => {
    if (!techCardSubject) return null;
    const wiredActions = (techCardSubject.actions ?? []).filter((action) => {
      const commandMatch = /^open_operation:(.+)$/.exec(action.id);
      return !(commandMatch && operacjeZPaska.has(commandMatch[1]));
    }).map((action) => {
      const commandMatch = /^open_operation:(.+)$/.exec(action.id);
      if (!commandMatch) return action;
      const opName = commandMatch[1] as NetworkBuildOperationName;
      // KARTA S95-START (predykaty PARAMI, czwarta droga wejścia): „Kontynuuj ciąg SN"
      // karty technicznej czyta TO SAMO rozstrzygnięcie punktu startu co menu kanwy,
      // pasek działań inspektora i konfigurator stacji (`buildSldOperationContext`). Dotąd przycisk był
      // zawsze aktywny, a dla stacji bez wolnego pola i GPZ z zajętym polem otwierał
      // kreator magistrali z trwale zablokowanym zapisem.
      const kontynuacja = opName === 'continue_trunk_segment_sn' && selectedElement
        ? kontynuacjaCiaguKartyTechnicznej(techCardSubject.kind, selectedElement.id, snapshot)
        : null;
      if (kontynuacja && selectedElement) {
        const operacja = buildSldOperationContext(
          kontynuacja.actionId,
          kontynuacja.kind,
          selectedElement.id,
          snapshot,
          logicalViews,
        );
        if (!operacja) {
          return {
            ...action,
            disabled: true,
            disabledReasonPl: powodBrakuStartuCiagu(kontynuacja.kind),
          };
        }
        return {
          ...action,
          onClick: () => {
            openOperationForm(opName, {
              ...operacja.context,
              ...semanticActionContext(selectedElement, {}),
              source: 'karta_techniczna',
            });
          },
        };
      }
      // S95-START × S9-10 (ta sama klasa w tym samym miejscu): „Rozpocznij
      // odgałęzienie SN" karty technicznej sparowane z resolverem kreatora
      // odgałęzienia — bez punktu startu (`from_ref`) pozycja jest zablokowana.
      if (opName === 'start_branch_segment_sn' && selectedElement) {
        const kontekstOdgalezienia = buildOperationContext({
          canonicalOp: opName,
          elementId: selectedElement.id,
          elementType: selectedElement.type,
          snapshot,
          logicalViews,
        });
        const fromRef = kontekstOdgalezienia.from_ref;
        if (typeof fromRef !== 'string' || fromRef.trim().length === 0) {
          return {
            ...action,
            disabled: true,
            disabledReasonPl: POWOD_BRAKU_STARTU_ODGALEZIENIA_PL,
          };
        }
      }
      return {
        ...action,
        onClick: () => {
          if (!selectedElement) return;
          openOperationForm(opName, buildOperationContext({
            canonicalOp: opName,
            elementId: selectedElement.id,
            elementType: selectedElement.type,
            snapshot,
            logicalViews,
            // Klucze semantyczne selekcji (semantic_hash/kind/role) — ta
            // ścieżka (akcje TechCard) je GUBIŁA, w odróżnieniu od
            // `handleAction` (QuickAction.context → extraContext): operacja
            // wywołana z karty traciła tożsamość semantyczną elementu, którą
            // pilnował test „wybiera akcje segmentu po semantyce selekcji…"
            // (wykluczony w vite.config zamiast naprawiony; dług 2026-07-17).
            extraContext: semanticActionContext(selectedElement, {}),
          }));
        },
      };
    });
    return { ...techCardSubject, actions: wiredActions };
  }, [logicalViews, openOperationForm, operacjeZPaska, selectedElement, snapshot, techCardSubject]);

  const szybkieOperacje = actions.filter((action) => !operacjeZPaska.has(action.op));
  const panelKanwyMaTresc = panelMaTresc(stanPanelu);
  // K6 (Z-12, Z-13): gdy obiekt ma kartę techniczną (`kartaTechnicznaElementu.ts`), JEDYNYM
  // nagłówkiem i JEDYNYM opisem danych obiektu jest panel z kanwy — nagłówek, sekcje danych
  // i karta `TechCard` tego widoku byłyby drugą (i trzecią) ścieżką tych samych danych z inną
  // nazwą i innym rodzajem. Zostają: dowód obliczeń, akcje źródła przekształtnikowego,
  // schemat pola i operacje, których pasek działań panelu nie ma.
  const kartaObiektu = stanPanelu?.karta ?? null;
  // Problemy gotowości obiektu z kartą techniczną — ta sama sekcja „Kontrola" co w widoku bez
  // karty (ref selekcji i ref obiektu karty: aparat pola z kanwy ma selekcję na polu).
  const kontrolaKarty = kartaObiektu
    ? sekcjaKontroli(readinessIssues, [elementId ?? '', kartaObiektu.elementRef])
    : null;
  const pokazTechCard = Boolean(techCardSubjectWithActions) && !kartaObiektu;
  const akcjeKartyBezPaska = kartaObiektu ? techCardSubjectWithActions?.actions ?? [] : [];
  const operacjeModelu: OperacjaModeluInspektora[] =
    activeMode === 'MODEL_EDIT' && !pokazTechCard
      ? [
          ...szybkieOperacje.map((action) => ({
            id: action.id,
            etykietaPl: action.label,
            onClick: () => handleAction(action),
            wariant: action.variant === 'danger' ? ('danger' as const) : undefined,
          })),
          ...akcjeKartyBezPaska.map((action) => ({
            id: `karta-${action.id}`,
            etykietaPl: action.label,
            onClick: action.onClick,
            niedostepnaPl: action.disabled ? action.disabledReasonPl ?? 'Operacja niedostępna dla tego obiektu.' : null,
          })),
        ]
      : [];

  if (!elementId || (sections.length === 0 && !panelKanwyMaTresc)) {
    return (
      <div className={clsx('flex flex-col h-full', className)} data-testid="inspector-engineering">
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <p className="text-[length:var(--mvd-font-size-data)] text-gray-500">Zaznacz element na SLD</p>
            <p className="text-[length:var(--mvd-font-size-data)] text-gray-400 mt-1">
              aby zobaczyć szczegóły inżynierskie
            </p>
          </div>
        </div>
      </div>
    );
  }

  const headerIsConverterSource = Boolean(
    selectedConverterRole
      || (selectedElement && isSemanticConverterSource(selectedElement))
      || snapshot?.generators?.some((generator) => generator.ref_id === elementId),
  );
  const publicElementId = publicTechnicalLabel(elementId, elementName);
  // Podtytuł źródła przekształtnikowego: REALNY wariant przyłączenia z ENM
  // (`connection_variant` generatora → `wariantPrzylaczeniaPl`), nie stała.
  // Poprzedni hardkod „PV za transformatorem SN/nN" kłamał podwójnie: rola
  // (farma wiatrowa/BESS dostawały „PV") i wariant (nn_side ≠ blokowo przez
  // transformator) — dokładnie ta regresja, której pilnował test
  // InspectorEngineeringView „pokazuje kanoniczne etykiety…", wykluczony
  // w vite.config zamiast naprawiony (dług zlikwidowany 2026-07-17).
  const headerSubtitle = headerIsConverterSource
    ? `${formatElementTypeLabel(elementType)} - ${wariantPrzylaczeniaPl(selectedConverterGenerator?.connection_variant) ?? '—'}`
    : `${formatElementTypeLabel(elementType)} - Oznaczenie: ${publicElementId}`;

  const dowodObliczen = (
    <ElementCalculationProofPanel
      runId={runIdOgladany ?? null}
      selectedElement={selectedElement}
      candidateRefs={calculationProofRefs}
    />
  );
  return (
    <div className={clsx('flex flex-col h-full', className)} data-testid="inspector-engineering">
      {/* JEDNO przewijanie całego ciała inspektora: nagłówek, sekcje obiektu z kanwy, dowód
          obliczeń, karta techniczna i sekcje modelu mają NATURALNĄ wysokość. Dawny układ
          (kolumna flex, w której przewijały się tylko sekcje) ściskał elementy rodzeństwa
          poniżej ich treści, więc nakładały się i przechwytywały kliki (e2e
          sld-editor-real-backend-flex, karta UI-02b). */}
      <div data-testid="sld-engineering-inspector-wrapper" className="min-h-0 flex-1 overflow-y-auto">
      {/* Header */}
      {!kartaObiektu && (
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
          <h3 className="text-sm font-semibold text-gray-800 truncate">{elementName}</h3>
        </div>
        <p className="text-[length:var(--mvd-font-size-data)] text-gray-500 mt-0.5">
          {headerSubtitle}
        </p>
      </div>
      )}

      {/* Kolejność paneli (karta INSPEKTOR-I-NAWIGACJA): schemat pola (połączenia i stany)
          i dowód obliczeń (wyniki) idą do panelu elementu PRZED sekcją „Katalog”. */}
      {stanPanelu ? (
        <PanelElementuKanwy
          stan={stanPanelu}
          dzialaniaPoza
          schematPola={selectedBayField ? <SchematPolaSn item={selectedBayField} snapshot={snapshot} /> : null}
          dowod={dowodObliczen}
        />
      ) : (
        dowodObliczen
      )}

      {pokazTechCard && techCardSubjectWithActions && (
        <div
          data-testid="tech-card-host"
          data-tech-card-subject-kind={techCardSubjectWithActions.kind}
          className="flex max-h-[60vh] min-h-[14rem] flex-col border-b border-gray-200 bg-white"
        >
          <TechCard
            subject={techCardSubjectWithActions}
            onClose={clearSelection}
          />
        </div>
      )}

      {isSelectedSegment && (
        <div
          data-testid="sld-segment-inspector"
          className="border-b border-gray-200 bg-white px-4 py-2 text-[length:var(--mvd-font-size-data)] text-gray-700"
        >
          <div className="font-semibold text-gray-800">Odcinek SN</div>
          <div>Oznaczenie: {publicTechnicalLabel(elementId, elementName)}</div>
          <div data-testid="sld-segment-inspector-catalog">
            Katalog: {selectedSegmentCatalogRef ?? 'nie wybrano typu'}
          </div>
          <div data-testid="sld-segment-inspector-catalog-family">
            Przestrzeń katalogu: {selectedSegmentCatalogNamespace ?? 'nie wybrano typu'}
          </div>
          <div data-testid="sld-segment-catalog-status">
            Aktualny typ: {selectedSegmentCatalogRef ?? 'nie wybrano typu'}
          </div>
          {selectedSegmentPickerCategory && (
            <button
              type="button"
              data-testid="sld-segment-open-catalog-picker"
              onClick={() => setSegmentCatalogPickerOpen(true)}
              className="mt-2 rounded border border-gray-300 px-2 py-1 font-medium text-gray-800 hover:bg-gray-50"
            >
              Zmień typ katalogowy
            </button>
          )}
        </div>
      )}

      {selectedConverterRole && (
        <div
          data-testid="pv-inverter-engineering-actions"
          className="border-b border-slate-200 bg-white px-4 py-3 text-[length:var(--mvd-font-size-data)] text-slate-700"
        >
          <div className="mb-2 font-semibold text-slate-900">
            {converterSurfaceTitle(selectedConverterRole)}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              data-testid="open-pv-inverter-config"
              onClick={handleOpenConverterSurface}
              className="rounded border border-cyan-300 bg-cyan-50 px-2 py-1.5 text-left font-medium text-cyan-800 hover:border-cyan-500"
            >
              Otwórz konfigurację falownika
            </button>
            <button
              type="button"
              onClick={() => handleAction({
                id: 'edit_converter_parameters',
                label: 'Uzupełnij dane',
                op: 'update_element_parameters',
                context: { element_ref: selectedConverterRef },
              })}
              className="rounded border border-cyan-200 px-2 py-1.5 text-left font-medium text-cyan-800 hover:border-cyan-500"
            >
              Uzupełnij dane wejściowe
            </button>
          </div>
          <div className="mt-2 text-[length:var(--mvd-font-size-data)] leading-4 text-cyan-700">
            Karta obejmuje falownik z katalogu, PCC, tor SN/nN, NC RfG, Q(U), P(f),
            FRT/HVRT, rozpływ mocy, wkład zwarciowy i zabezpieczenia nN.
          </div>
        </div>
      )}

      {/* Sections */}
      <div>
        {kontrolaKarty && (
          <SectionBlock
            section={kontrolaKarty}
            elementId={elementId}
            activeCaseId={activeCaseId}
            executeDomainOperation={executeDomainOperation}
          />
        )}

        {!kartaObiektu && sections.map((section, index) => (
          <SectionBlock
            key={`${section.id}:${index}`}
            section={section}
            elementId={elementId}
            activeCaseId={activeCaseId}
            executeDomainOperation={executeDomainOperation}
          />
        ))}

        {!stanPanelu && selectedBayField && <SchematPolaSn item={selectedBayField} snapshot={snapshot} />}

        {/* K6: działania na samym końcu inspektora, zwinięte — pozycje rejestru menu kanwy
            i operacje modelu tego widoku w JEDNYM bloku (operacje modelu tylko w trybie edycji
            i bez karty `TechCard`, która ma własny pasek akcji). */}
        <DzialaniaZwiniete
          akcje={stanPanelu?.akcje ?? []}
          onAkcja={stanPanelu?.wykonajAkcje ?? (() => undefined)}
          operacje={operacjeModelu}
        />
      </div>
      </div>

      {isSelectedSegment && selectedSegmentPickerCategory && (
        <TypePicker
          isOpen={segmentCatalogPickerOpen}
          category={selectedSegmentPickerCategory}
          currentTypeId={selectedSegmentCatalogRef}
          onSelectType={handleSelectSegmentCatalog}
          onClose={() => setSegmentCatalogPickerOpen(false)}
        />
      )}
    </div>
  );
}

function inferSegmentCatalogNamespace(branch: Branch | null | undefined): CatalogNamespace | null {
  if (branch?.catalog_namespace) return branch.catalog_namespace as CatalogNamespace;
  if (branch?.type === 'line_overhead') return 'LINIA_SN';
  if (branch?.type === 'cable') return 'KABEL_SN';
  return null;
}

function inferSegmentPickerCategory(branch: Branch | null | undefined): TypeCategory | null {
  if (branch?.type === 'line_overhead') return 'LINE';
  if (branch?.type === 'cable') return 'CABLE';
  return null;
}

function pushUniqueRef(target: string[], value: unknown): void {
  if (typeof value !== 'string') return;
  const trimmed = value.trim();
  if (!trimmed || target.includes(trimmed)) return;
  target.push(trimmed);
}

function pushElementRefs(target: string[], element: unknown, keys: string[]): void {
  if (!element || typeof element !== 'object') return;
  const record = element as Record<string, unknown>;
  for (const key of keys) {
    pushUniqueRef(target, record[key]);
  }
}

function elementMatchesSelection(element: unknown, elementId: string | null): boolean {
  if (!elementId || !element || typeof element !== 'object') return false;
  const record = element as Record<string, unknown>;
  return [record.id, record.ref_id, record.name].some((value) => value === elementId);
}

function buildCalculationProofCandidateRefs(
  elementId: string | null,
  selectedElement: SelectedElement | null,
  snapshot: EnergyNetworkModel | null,
): string[] {
  const refs: string[] = [];
  pushUniqueRef(refs, elementId);
  pushUniqueRef(refs, selectedElement?.id);
  pushUniqueRef(refs, selectedElement?.name);

  if (!snapshot || !elementId) {
    return refs;
  }

  const bus = snapshot.buses?.find((item) => elementMatchesSelection(item, elementId));
  pushElementRefs(refs, bus, ['id', 'ref_id', 'name']);

  const branch = snapshot.branches?.find((item) => elementMatchesSelection(item, elementId));
  pushElementRefs(refs, branch, [
    'id',
    'ref_id',
    'name',
    'from_bus_ref',
    'to_bus_ref',
  ]);

  const transformer = snapshot.transformers?.find((item) => elementMatchesSelection(item, elementId));
  pushElementRefs(refs, transformer, [
    'id',
    'ref_id',
    'name',
    'hv_bus_ref',
    'lv_bus_ref',
  ]);

  const bay = snapshot.bays?.find((item) => elementMatchesSelection(item, elementId));
  pushElementRefs(refs, bay, [
    'id',
    'ref_id',
    'name',
    'bus_ref',
    'substation_ref',
  ]);

  const generator = snapshot.generators?.find((item) => elementMatchesSelection(item, elementId));
  pushElementRefs(refs, generator, [
    'id',
    'ref_id',
    'name',
    'bus_ref',
    'station_ref',
  ]);

  const load = snapshot.loads?.find((item) => elementMatchesSelection(item, elementId));
  pushElementRefs(refs, load, [
    'id',
    'ref_id',
    'name',
    'bus_ref',
  ]);

  const source = snapshot.sources?.find((item) => elementMatchesSelection(item, elementId));
  pushElementRefs(refs, source, [
    'id',
    'ref_id',
    'name',
    'bus_ref',
    'substation_ref',
  ]);

  const station = snapshot.substations?.find((item) => elementMatchesSelection(item, elementId));
  pushElementRefs(refs, station, ['id', 'ref_id', 'name']);
  // SZYNY-STACJI-LUSTRO: szyny stacji z jednego lustra (zaciski pól, szyny za aparatami nN).
  for (const busRef of station ? [...szynyStacji(snapshot, station)].sort() : []) {
    pushUniqueRef(refs, busRef);
  }
  for (const transformer of transformatoryNalezaceDoStacji(snapshot, station)) pushUniqueRef(refs, transformer.ref_id);

  if (bus) {
    for (const item of snapshot.branches ?? []) {
      if (item.from_bus_ref === bus.ref_id || item.to_bus_ref === bus.ref_id) {
        pushElementRefs(refs, item, ['id', 'ref_id', 'name']);
      }
    }
  }

  return refs;
}

// =============================================================================
// SectionBlock
// =============================================================================

export function SectionBlock({
  section,
  elementId,
  activeCaseId,
  executeDomainOperation,
}: {
  section: PropertySection;
  elementId: string;
  activeCaseId: string | null;
  executeDomainOperation: (
    caseId: string,
    opName: NetworkBuildOperationName,
    payload: Record<string, unknown>,
  ) => Promise<unknown>;
}) {
  return (
    <div
      className="border-b border-gray-100"
      data-testid={`engineering-section-${sectionTestId(section)}`}
    >
      <div className="px-4 py-2">
        <h4 className="text-[length:var(--mvd-font-size-data)] font-semibold text-gray-500 mb-1.5">
          {section.label}
        </h4>
        <div className="space-y-1">
          {section.fields.map((field, index) => (
            <EngineeringField
              key={`${field.key}:${index}`}
              field={field}
              elementId={elementId}
              activeCaseId={activeCaseId}
              executeDomainOperation={executeDomainOperation}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function EngineeringField({
  field,
  elementId,
  activeCaseId,
  executeDomainOperation,
}: {
  field: PropertyField;
  elementId: string;
  activeCaseId: string | null;
  executeDomainOperation: (
    caseId: string,
    opName: NetworkBuildOperationName,
    payload: Record<string, unknown>,
  ) => Promise<unknown>;
}) {
  const editable = field.key === 'name';
  const formattedInitialValue = formatValue(field.value);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(formattedInitialValue);
  // Wartość wyświetlana idzie za danymi: pole o tym samym kluczu dostaje nową wartość, gdy
  // model odczytu się zmieni (ładowanie → wynik, nowa rewizja, odpowiedź katalogu). Bez tego
  // `useState` trzymał wartość z PIERWSZEGO renderu i karta pokazywała nieaktualną treść
  // (np. „Ładowanie…" po odpowiedzi). W trakcie edycji wpis użytkownika ma pierwszeństwo.
  useEffect(() => {
    if (!editing) setValue(formattedInitialValue);
  }, [editing, formattedInitialValue]);
  const showUnit = Boolean(field.unit) && !isMissingFieldValue(value);

  const reset = useCallback(() => {
    setValue(formatValue(field.value));
    setEditing(false);
  }, [field.value]);

  const commit = useCallback(() => {
    setEditing(false);
    if (!editable || !activeCaseId || !elementId) return;
    const nextValue = value.trim();
    if (!nextValue || nextValue === formatValue(field.value)) return;
    void executeDomainOperation(activeCaseId, 'update_element_parameters', {
      element_ref: elementId,
      parameters: { [field.key]: nextValue },
    });
  }, [activeCaseId, editable, elementId, executeDomainOperation, field.key, field.value, value]);

  const valueClassName = clsx(
    'text-[length:var(--mvd-font-size-data)] font-medium text-right truncate max-w-[55%]',
    editable ? 'cursor-pointer rounded px-1 hover:bg-blue-50 focus:outline-none focus:ring-1 focus:ring-blue-400' : '',
    field.source === 'catalog' ? 'text-blue-700' : 'text-gray-800',
    field.source === 'calculated' ? 'text-green-700 italic' : '',
    field.label === 'Konfiguracja' ? 'text-red-600 font-normal' : '',
    field.label === 'Ostrzeżenie' ? 'text-amber-600 font-normal' : '',
  );

  return (
    <div
      data-testid={`engineering-field-${field.key}`}
      className="flex items-baseline justify-between gap-2"
    >
      <span className="text-[length:var(--mvd-font-size-data)] text-gray-500 flex-shrink-0">
        <TekstZWzorami tekst={field.label} />
      </span>
      {editing ? (
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === 'Tab') {
              commit();
            }
            if (event.key === 'Escape') {
              reset();
            }
          }}
          className="max-w-[60%] rounded border border-blue-300 bg-white px-1.5 py-0.5 text-right text-[length:var(--mvd-font-size-data)] font-medium text-gray-900 shadow-sm"
          autoFocus
        />
      ) : (
        <div
          role={editable ? 'button' : undefined}
          tabIndex={editable ? 0 : undefined}
          className={valueClassName}
          title={tekstBezWzorow(value)}
          onClick={editable ? () => setEditing(true) : undefined}
          onKeyDown={editable ? (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setEditing(true);
            }
          } : undefined}
        >
          <TekstZWzorami tekst={value} />
          {showUnit && <span className="text-gray-400 ml-0.5"> {field.unit}</span>}
        </div>
      )}
    </div>
  );
}

function sectionTestId(section: PropertySection): string {
  if (section.id === 'catalog') return 'typ_i_katalog';
  return slugForTestId(section.label || section.id);
}

function slugForTestId(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function formatValue(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return 'nie podano';
  if (typeof value === 'boolean') return value ? 'Tak' : 'Nie';
  if (typeof value === 'number') {
    return value.toLocaleString('pl-PL', { maximumFractionDigits: 4 });
  }
  const sanitized = sanitizeEngineerText(
    sanitizeDisplayValue(String(value), { fallback: 'do konfiguracji' }),
  );
  if (isMissingFieldValue(sanitized)) return 'do konfiguracji';
  return sanitized;
}

function sanitizeEngineerText(value: string): string {
  const normalized = value.trim();
  if (!normalized) return 'do konfiguracji';
  if (isRawTechnicalIdentifier(normalized)) return 'oznaczenie techniczne';
  if (/^(?:brak danych|nie podano|nie wyznaczono|\?)$/i.test(normalized)) return 'do konfiguracji';
  const legacyConverterTerm = new RegExp(
    [
      String.raw`\bbrak katalogu `,
      String.raw`(?:źródła|zrodla) `,
      String.raw`(?:przekształtnikowego|przeksztaltnikowego)\b`,
    ].join(''),
    'gi',
  );
  const legacyConverterGenitive = new RegExp(
    String.raw`\b(?:źródła|zrodla) (?:przekształtnikowego|przeksztaltnikowego)\b`,
    'gi',
  );
  const legacyConverterNominative = new RegExp(
    String.raw`\b(?:źródło|zrodlo) (?:przekształtnikowe|przeksztaltnikowe)\b`,
    'gi',
  );
  return normalized
    .replace(/\b(?:seg|gpz|stn|bay|bus|src)\/[a-z0-9/_#-]{12,}/gi, 'element techniczny')
    .replace(/\b[0-9a-f]{24,}\b/gi, 'element techniczny')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, 'element techniczny')
    .replace(legacyConverterTerm, 'Wymagany wariant katalogowy układu PV/BESS/FW')
    .replace(legacyConverterGenitive, 'układu PV/BESS/FW')
    .replace(legacyConverterNominative, 'układ PV/BESS/FW')
    .replace(/\bbrak danych\b/gi, 'do konfiguracji')
    .replace(/\bblokad[ay]?\b/gi, 'zagadnienie konfiguracji')
    .replace(/\bgotowości\b/gi, 'konfiguracji');
}

function isMissingFieldValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === 'brak danych'
    || normalized === 'do konfiguracji'
    || normalized === 'nie podano'
    || normalized === 'oznaczenie techniczne'
    || normalized === 'nie wyznaczono'
    || normalized === 'wynik częściowy'
    || normalized === 'wynik zablokowany'
    || normalized === 'zablokowane'
    || normalized === '-'
    || normalized === '—';
}
