/**
 * Definicje zakładek inspectora v2 (PR-7).
 *
 * Brief 2 §5: Tabs:
 *   Podstawowe / SLD / Topologia / Aparatura / Dane elektryczne /
 *   Zabezpieczenia / Pomiary / Obliczenia / Konfiguracja / Raport / Techniczne
 *
 * Każda zakładka jest dostępna dla różnych typów obiektów (per applicableTo).
 */

export type ElementTypeForInspector =
  | 'gpz'
  | 'section'
  | 'bay'
  | 'device'
  | 'cable_run'
  | 'cable_segment'
  | 'station'
  | 'transformer'
  | 'der_pv'
  | 'der_bess'
  | 'der_fw'
  | 'load'
  | 'measurement_ct'
  | 'measurement_vt'
  | 'protection_relay';

export type InspectorTabId =
  | 'podstawowe'
  | 'sld'
  | 'topologia'
  | 'aparatura'
  | 'dane-elektryczne'
  | 'zabezpieczenia'
  | 'pomiary'
  | 'obliczenia'
  | 'konfiguracja'
  | 'raport'
  | 'techniczne';

export interface InspectorTabDef {
  readonly id: InspectorTabId;
  readonly labelPl: string;
  readonly applicableTo: readonly ElementTypeForInspector[] | 'ANY';
  readonly icon?: string;  // Lucide icon name or similar
  readonly priority: number;  // dla sortowania w UI
}

export const INSPECTOR_TABS: readonly InspectorTabDef[] = [
  { id: 'podstawowe', labelPl: 'Podstawowe', applicableTo: 'ANY', priority: 1 },
  {
    id: 'sld',
    labelPl: 'SLD',
    applicableTo: ['gpz', 'station', 'bay', 'cable_run'],
    priority: 2,
  },
  {
    id: 'topologia',
    labelPl: 'Topologia',
    applicableTo: ['gpz', 'station', 'bay', 'cable_run', 'cable_segment'],
    priority: 3,
  },
  {
    id: 'aparatura',
    labelPl: 'Aparatura',
    applicableTo: ['bay', 'station'],
    priority: 4,
  },
  {
    id: 'dane-elektryczne',
    labelPl: 'Dane elektryczne',
    applicableTo: [
      'cable_segment', 'transformer', 'der_pv', 'der_bess', 'der_fw',
      'load', 'measurement_ct', 'measurement_vt',
    ],
    priority: 5,
  },
  {
    id: 'zabezpieczenia',
    labelPl: 'Zabezpieczenia',
    applicableTo: ['bay', 'protection_relay', 'station', 'transformer'],
    priority: 6,
  },
  {
    id: 'pomiary',
    labelPl: 'Pomiary',
    applicableTo: ['bay', 'station', 'measurement_ct', 'measurement_vt'],
    priority: 7,
  },
  {
    id: 'obliczenia',
    labelPl: 'Obliczenia',
    applicableTo: 'ANY',
    priority: 8,
  },
  {
    id: 'konfiguracja',
    labelPl: 'Konfiguracja',
    applicableTo: 'ANY',
    priority: 9,
  },
  { id: 'raport', labelPl: 'Raport', applicableTo: 'ANY', priority: 10 },
  { id: 'techniczne', labelPl: 'Techniczne', applicableTo: 'ANY', priority: 11 },
];

/** Liczba zakładek = 11 (binding z briefa §5 pkt 3). */
export const INSPECTOR_TAB_COUNT = INSPECTOR_TABS.length;

/** Zwraca zakładki widoczne dla danego typu obiektu. */
export function visibleTabsFor(elementType: ElementTypeForInspector): InspectorTabDef[] {
  return INSPECTOR_TABS.filter((t) =>
    t.applicableTo === 'ANY' || (t.applicableTo as readonly string[]).includes(elementType),
  ).sort((a, b) => a.priority - b.priority);
}

/** Pobiera definicję zakładki po ID. */
export function getTabDef(id: InspectorTabId): InspectorTabDef | undefined {
  return INSPECTOR_TABS.find((t) => t.id === id);
}
