/**
 * SldCommandService — facade dla menu kontekstowego + toast feedback (PR-13).
 *
 * Brief 1 §12 + brief 2 §17 pkt 10.
 * Dostarcza:
 *   - rejestr menu per typ obiektu (SldMenuRegistry)
 *   - publish toast events (Polish messages)
 *   - integrację z BuildSequence (8 komend) + HistoryStore (undo/redo)
 */

export type SldElementKindForMenu =
  | 'background'
  | 'gpz'
  | 'section'
  | 'bay'
  | 'apparatus'
  | 'cable_segment_sn'
  | 'overhead_line_sn'
  | 'station'
  | 'der_pv'
  | 'der_bess'
  | 'der_fw';

export interface SldMenuAction {
  readonly id: string;
  readonly labelPl: string;
  readonly group?: 'budowa' | 'edycja' | 'widok' | 'usun';
  readonly disabled?: boolean;
  readonly disabledReasonPl?: string;
}

export const SLD_MENU_REGISTRY: Readonly<Record<SldElementKindForMenu, readonly SldMenuAction[]>> = {
  background: [
    { id: 'insert-gpz', labelPl: 'Wstaw główny punkt zasilania', group: 'budowa' },
    { id: 'open-catalogs', labelPl: 'Otwórz katalogi techniczne', group: 'widok' },
    { id: 'show-readiness', labelPl: 'Pokaż kontrolę konfiguracji', group: 'widok' },
  ],
  gpz: [
    { id: 'open-source', labelPl: 'Edytuj główny punkt zasilania', group: 'edycja' },
    { id: 'show-sc-source', labelPl: 'Pokaż dane zwarciowe źródła', group: 'widok' },
    { id: 'add-section', labelPl: 'Dodaj sekcję rozdzielni SN', group: 'budowa' },
  ],
  section: [
    { id: 'add-bay', labelPl: 'Dodaj pole SN', group: 'budowa' },
    { id: 'show-sc-data', labelPl: 'Pokaż dane zwarciowe źródła', group: 'widok' },
    { id: 'show-readiness', labelPl: 'Pokaż kontrolę konfiguracji', group: 'widok' },
  ],
  bay: [
    { id: 'open-bay', labelPl: 'Otwórz okno pola', group: 'edycja' },
    { id: 'configure-equipment', labelPl: 'Skonfiguruj aparaturę', group: 'edycja' },
    { id: 'configure-cts-vts', labelPl: 'Skonfiguruj przekładniki', group: 'edycja' },
    { id: 'configure-protection', labelPl: 'Skonfiguruj zabezpieczenia', group: 'edycja' },
    { id: 'start-branch', labelPl: 'Rozpocznij odgałęzienie', group: 'budowa' },
    /* Phase 0B (operator-grade SLD plan v2): Append-on-Endpoint workflow */
    { id: 'append-station-on-endpoint', labelPl: 'Zakończ ciąg w stacji', group: 'budowa' },
    { id: 'set-switch-state', labelPl: 'Zmień stan łącznika', group: 'edycja' },
    { id: 'show-measurements', labelPl: 'Pokaż pomiary pola', group: 'widok' },
    { id: 'show-results', labelPl: 'Pokaż wyniki pola', group: 'widok' },
    { id: 'show-rationale', labelPl: 'Pokaż uzasadnienie inżynierskie', group: 'widok' },
    { id: 'delete-bay', labelPl: 'Usuń pole', group: 'usun' },
  ],
  apparatus: [
    { id: 'open-bay', labelPl: 'Otwórz kartę pola', group: 'edycja' },
    { id: 'configure-equipment', labelPl: 'Skonfiguruj aparat', group: 'edycja' },
    { id: 'configure-cts-vts', labelPl: 'Skonfiguruj przekładniki', group: 'edycja' },
    { id: 'configure-protection', labelPl: 'Skonfiguruj zabezpieczenia', group: 'edycja' },
    { id: 'extend-trunk', labelPl: 'Wyprowadź ciąg główny z głowicy', group: 'budowa' },
    { id: 'show-results', labelPl: 'Pokaż wyniki aparatu', group: 'widok' },
    { id: 'show-rationale', labelPl: 'Pokaż uzasadnienie inżynierskie', group: 'widok' },
  ],
  cable_segment_sn: [
    { id: 'continue-trunk-from-endpoint', labelPl: 'Kontynuuj ciąg główny', group: 'budowa' },
    { id: 'insert-station', labelPl: 'Zakończ odcinek stacją SN/nN', group: 'budowa' },
    { id: 'insert-zksn', labelPl: 'Zakończ odcinek w ZK SN', group: 'budowa' },
    { id: 'insert-pole', labelPl: 'Zakończ odcinek słupem rozgałęźnym', group: 'budowa' },
    /* Phase 0C (operator-grade SLD plan v2): świadomy split z preview */
    { id: 'conscious-split-on-segment', labelPl: 'Podziel odcinek (świadomy)', group: 'budowa' },
    { id: 'insert-sectional', labelPl: 'Wstaw łącznik sekcyjny', group: 'budowa' },
    { id: 'insert-joint', labelPl: 'Wstaw mufę kablową', group: 'budowa' },
    { id: 'change-catalog', labelPl: 'Zmień katalog kabla', group: 'edycja' },
    { id: 'edit-laying', labelPl: 'Edytuj parametry ułożenia', group: 'edycja' },
    { id: 'show-thermal', labelPl: 'Pokaż obciążalność cieplną', group: 'widok' },
    { id: 'show-results', labelPl: 'Pokaż wyniki odcinka', group: 'widok' },
    { id: 'change-family-to-overhead', labelPl: 'Zmień rodzinę na linię napowietrzną SN', group: 'edycja' },
    { id: 'delete-segment', labelPl: 'Usuń odcinek', group: 'usun' },
  ],
  overhead_line_sn: [
    { id: 'continue-trunk-from-endpoint', labelPl: 'Kontynuuj ciąg główny', group: 'budowa' },
    { id: 'insert-station', labelPl: 'Zakończ odcinek stacją SN/nN', group: 'budowa' },
    { id: 'insert-pole', labelPl: 'Zakończ odcinek słupem rozgałęźnym', group: 'budowa' },
    /* Phase 0C (operator-grade SLD plan v2): świadomy split z preview */
    { id: 'conscious-split-on-segment', labelPl: 'Podziel odcinek (świadomy)', group: 'budowa' },
    { id: 'insert-sectional', labelPl: 'Wstaw łącznik sekcyjny', group: 'budowa' },
    { id: 'change-catalog', labelPl: 'Zmień katalog przewodu', group: 'edycja' },
    { id: 'edit-line', labelPl: 'Edytuj parametry linii', group: 'edycja' },
    { id: 'show-results', labelPl: 'Pokaż wyniki odcinka', group: 'widok' },
    { id: 'change-family-to-cable', labelPl: 'Zmień rodzinę na kabel SN', group: 'edycja' },
    { id: 'delete-segment', labelPl: 'Usuń odcinek', group: 'usun' },
  ],
  station: [
    { id: 'open-station-config', labelPl: 'Otwórz konfigurator stacji', group: 'edycja' },
    { id: 'continue-trunk', labelPl: 'Kontynuuj ciąg główny', group: 'budowa' },
    { id: 'start-branch', labelPl: 'Rozpocznij odgałęzienie', group: 'budowa' },
    { id: 'add-source', labelPl: 'Dodaj układ PV/BESS/FW z katalogu', group: 'budowa' },
    { id: 'add-load', labelPl: 'Dodaj obciążenie nN', group: 'budowa' },
    { id: 'show-readiness', labelPl: 'Pokaż konfigurację stacji', group: 'widok' },
    { id: 'show-results', labelPl: 'Pokaż wyniki stacji', group: 'widok' },
    { id: 'delete-station', labelPl: 'Usuń stację', group: 'usun' },
  ],
  der_pv: [
    { id: 'open-pv-config', labelPl: 'Otwórz kartę PV', group: 'edycja' },
    { id: 'show-frt-hvrt', labelPl: 'Pokaż krzywe FRT/HVRT', group: 'widok' },
    { id: 'show-ncrfg', labelPl: 'Pokaż zgodność przyłączeniową', group: 'widok' },
    { id: 'delete-pv', labelPl: 'Usuń źródło PV', group: 'usun' },
  ],
  der_bess: [
    { id: 'open-bess-config', labelPl: 'Otwórz kartę BESS', group: 'edycja' },
    { id: 'show-frt-hvrt', labelPl: 'Pokaż krzywe FRT/HVRT', group: 'widok' },
    { id: 'show-ncrfg', labelPl: 'Pokaż zgodność przyłączeniową', group: 'widok' },
    { id: 'delete-bess', labelPl: 'Usuń magazyn BESS', group: 'usun' },
  ],
  der_fw: [
    { id: 'open-fw-config', labelPl: 'Otwórz kartę FW', group: 'edycja' },
    { id: 'show-frt-hvrt', labelPl: 'Pokaż krzywe FRT/HVRT', group: 'widok' },
    { id: 'show-ncrfg', labelPl: 'Pokaż zgodność przyłączeniową', group: 'widok' },
    { id: 'delete-fw', labelPl: 'Usuń farmę wiatrową', group: 'usun' },
  ],
};

/**
 * Filtruje akcje menu wg dostępności (np. zakaz "Wyprowadź ciąg główny" gdy
 * pole już ma wyprowadzony ciąg).
 */
export function getMenuActions(
  kind: SldElementKindForMenu,
  context?: {
    readonly bayHasOutgoingRun?: boolean;
    readonly bayIsRunEndpoint?: boolean;  // Phase 0B: czy pole jest endpointem ciągu (free terminal)
    readonly stationHasFreeBay?: boolean;
    readonly hasResults?: boolean;
    readonly apparatusKind?: string;
  },
): SldMenuAction[] {
  const baseActions = SLD_MENU_REGISTRY[kind];
  const ctx = context ?? {};

  return baseActions.map((a) => {
    if (a.id === 'extend-trunk' && ctx.bayHasOutgoingRun === true) {
      return {
        ...a,
        disabled: true,
        disabledReasonPl: 'Pole ma już wyprowadzony ciąg główny.',
      };
    }
    if (kind === 'apparatus' && a.id === 'extend-trunk' && ctx.apparatusKind !== 'cable_head') {
      return {
        ...a,
        disabled: true,
        disabledReasonPl: 'Ciąg główny można wyprowadzić tylko z głowicy kablowej / portu odpływu pola SN.',
      };
    }
    /* Phase 0B (operator-grade SLD plan v2): append-on-endpoint dostępny TYLKO
     * gdy pole jest free endpointem ciągu (bus z topology_terminal tag). */
    if (a.id === 'append-station-on-endpoint' && ctx.bayIsRunEndpoint === false) {
      return {
        ...a,
        disabled: true,
        disabledReasonPl: 'Pole nie jest końcem ciągu. Najpierw wyprowadź ciąg lub wybierz endpoint.',
      };
    }
    if (a.id === 'start-branch' && kind === 'station' && ctx.stationHasFreeBay === false) {
      return {
        ...a,
        disabled: true,
        disabledReasonPl: 'Brak wolnego pola SN. Najpierw dodaj pole odgałęzienia.',
      };
    }
    if (a.id === 'show-results' && ctx.hasResults === false) {
      return {
        ...a,
        disabled: true,
        disabledReasonPl: 'Brak obliczeń. Uruchom obliczenia z prawego panelu.',
      };
    }
    return a;
  });
}

/* ---------------------------------------------------------------------------
   Toast feedback bus (brief 2 §17 pkt 10)
   --------------------------------------------------------------------------- */

export type ToastSeverity = 'success' | 'info' | 'warning' | 'error';

export interface ToastEvent {
  readonly id: string;
  readonly severity: ToastSeverity;
  readonly messagePl: string;
  readonly timestamp: number;
}

type ToastListener = (event: ToastEvent) => void;

class ToastBus {
  private listeners: Set<ToastListener> = new Set();
  private nextId = 0;

  publish(severity: ToastSeverity, messagePl: string): ToastEvent {
    const event: ToastEvent = {
      id: `toast_${this.nextId++}`,
      severity,
      messagePl,
      timestamp: Date.now(),
    };
    for (const listener of this.listeners) {
      listener(event);
    }
    return event;
  }

  subscribe(listener: ToastListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Reset dla testów
  __reset_for_tests(): void {
    this.listeners.clear();
    this.nextId = 0;
  }
}

export const toastBus = new ToastBus();

/** Polskie wzorce komunikatów dla typowych operacji (brief 2 §17 pkt 10). */
export const COMMAND_FEEDBACK_PL = {
  bayCreated: (designation: string) => `Utworzono pole ${designation}.`,
  segmentSplit: 'Odcinek podzielono na dwa odcinki end-to-end.',
  transformerAdded: (designation: string) => `Dodano transformator SN/nN ${designation}.`,
  derAttached: (kind: 'PV' | 'BESS' | 'FW', name: string) =>
    `Dodano źródło ${kind} "${name}" z punktem przyłączenia.`,
  missingInverterData: 'Brakuje danych falownika do obliczeń zwarciowych.',
  voltageMismatch: (fromKv: number, toKv: number) =>
    `Niespójność napięć: ${fromKv} kV ↔ ${toKv} kV. Wymagany transformator dedykowany.`,
  stationInserted: (name: string) => `Wstawiono stację "${name}" na ciągu.`,
  branchStarted: (origin: string) => `Rozpoczęto odgałęzienie z "${origin}".`,
  switchStateChanged: (designationQ: string, newState: string) =>
    `Aparat ${designationQ}: stan zmieniony na "${newState}".`,
  nopMarked: (stationName: string) => `Stacja "${stationName}" oznaczona jako punkt normalnie otwarty.`,
  /* Phase 0B (operator-grade SLD plan v2): Append-on-Endpoint workflow */
  appendStarted: 'Wskaż punkt zakończenia odcinka.',
  appendEndpointPicked: 'Wybrano koniec odcinka. Wybierz typ stacji.',
  appendPreviewReady: 'Podgląd: odcinek zostanie zakończony w stacji.',
  appendCommitted: (stationName: string) =>
    `Utworzono stację "${stationName}" na końcu odcinka i przypięto port wejściowy SN.`,
  appendCancelled: 'Operacja anulowana. Model bez zmian.',
  continueFromStation: 'Kontynuuj ciąg z portu wyjściowego stacji.',
  /* Phase 0C: Conscious Split workflow */
  splitPreviewReady: 'Podgląd świadomego podziału odcinka.',
  splitImpactSummary: (count: number) =>
    `Operacja unieważni ${count} wyników obliczeń.`,
  splitCommitted: 'Odcinek został podzielony na dwa odcinki end-to-end.',
  splitCancelled: 'Podział odcinka anulowany. Model bez zmian.',
} as const;
