/**
 * Empty Inspector Panel â€” "Brak zaznaczenia" State
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: Inspector ZAWSZE widoczny
 * - wizard_screens.md Â§ 2.4: Stan domyĹ›lny inspektora
 *
 * CANONICAL RULE:
 * > Inspector Panel jest ZAWSZE renderowany
 * > Stan domyĹ›lny: "Brak zaznaczenia"
 *
 * FEATURES:
 * - Shows selection info when element selected
 * - Shows "Brak zaznaczenia" when nothing selected
 * - Shows read-only indicator in RESULT_VIEW mode
 * - 100% Polish UI
 */

import { clsx } from 'clsx';
import type { SelectedElement, ElementType } from '../types';

// =============================================================================
// Element Type Labels (Polish)
// =============================================================================

const ELEMENT_TYPE_LABELS_PL: Record<ElementType, string> = {
  // IstniejÄ…ce typy SN (Aâ€“L)
  Bus: 'Szyna',
  LineBranch: 'Linia',
  TransformerBranch: 'Transformator',
  Switch: 'ĹÄ…cznik',
  Source: 'ĹąrĂłdĹ‚o',
  Load: 'OdbiĂłr',
  Generator: 'Generator',
  Measurement: 'Pomiar',
  ProtectionAssignment: 'Zabezpieczenie',
  // Nowe typy infrastruktury SN
  Terminal: 'Terminal',
  PortBranch: 'Port',
  Station: 'Stacja',
  BranchPole: 'Slup rozgalezny',
  ZKSN: 'ZKSN',
  BaySN: 'Pole SN',
  Relay: 'PrzekaĹşnik',
  SecondaryLink: 'PoĹ‚Ä…czenie wtĂłrne',
  NOP: 'Punkt normalnie otwarty',
  // Typy nN (Mâ€“O, Râ€“AP)
  BusNN: 'Szyna nN',
  MainBreakerNN: 'WyĹ‚Ä…cznik gĹ‚Ăłwny nN',
  FeederNN: 'OdpĹ‚yw nN',
  SegmentNN: 'Segment nN',
  LoadNN: 'OdbiĂłr nN',
  SwitchboardNN: 'Rozdzielnica nN',
  SourceFieldNN: 'Pole ĹşrĂłdĹ‚owe nN',
  // ĹąrĂłdĹ‚a nN (Vâ€“Z)
  PVInverter: 'Falownik PV',
  BESSInverter: 'Falownik BESS',
  EnergyStorage: 'Magazyn energii',
  Genset: 'Agregat prÄ…dotwĂłrczy',
  UPS: 'UPS',
  // Pomiary i zabezpieczenia nN (AAâ€“AE)
  EnergyMeter: 'Licznik energii',
  PowerQualityMeter: 'Miernik jakoĹ›ci',
  SurgeArresterNN: 'Ogranicznik przepiÄ™Ä‡',
  Earthing: 'Uziemienie',
  MeasurementNN: 'Pomiar nN',
  // Infrastruktura szyn nN (AFâ€“AR)
  AuxBus: 'Szyna pomocnicza',
  ConnectionPoint: 'Punkt przyĹ‚Ä…czenia',
  SwitchNN: 'ĹÄ…cznik nN',
  ProtectionNN: 'Zabezpieczenie nN',
  SourceController: 'Sterownik ĹşrĂłdĹ‚a',
  InternalJunction: 'WÄ™zeĹ‚ wewnÄ™trzny',
  CableJointNN: 'ZĹ‚Ä…cze kablowe',
  FaultCurrentLimiter: 'Ogr. prÄ…du zwarciowego',
  FilterCompensator: 'Filtr/kompensator',
  TelecontrolDevice: 'UrzÄ…dzenie telesterowania',
  BusSectionNN: 'Sekcja szyn nN',
  BusCouplerNN: 'SprzÄ™gĹ‚o szyn nN',
  ReserveLink: 'ĹÄ…cznik rezerwowy',
  // Parametry logiczne ĹşrĂłdeĹ‚ (ASâ€“AZ)
  SourceDisconnect: 'OdĹ‚Ä…cznik ĹşrĂłdĹ‚a',
  PowerLimit: 'Ograniczenie mocy',
  WorkProfile: 'Profil pracy',
  OperatingMode: 'Tryb pracy',
  ConnectionConstraints: 'Warunki przyĹ‚Ä…czenia',
  MeteringBlock: 'UkĹ‚ad pomiarowy',
  SyncPoint: 'Punkt synchronizacji',
  DescriptiveElement: 'Element opisowy',
};

// =============================================================================
// Component Props
// =============================================================================

export interface EmptyInspectorPanelProps {
  /**
   * Currently selected element (from selection store).
   */
  selectedElement?: SelectedElement | null;

  /**
   * Whether the app is in read-only mode.
   */
  isReadOnly?: boolean;

  /**
   * Network statistics for summary display.
   */
  networkStats?: {
    nodeCount?: number;
    branchCount?: number;
    transformerCount?: number;
    loadCount?: number;
    sourceCount?: number;
  };

  /**
   * Additional CSS classes.
   */
  className?: string;
}

// =============================================================================
// Component
// =============================================================================

export function EmptyInspectorPanel({
  selectedElement,
  isReadOnly = false,
  networkStats,
  className,
}: EmptyInspectorPanelProps) {
  // No selection state - show network summary
  if (!selectedElement) {
    const hasStats = networkStats && (
      networkStats.nodeCount !== undefined ||
      networkStats.branchCount !== undefined ||
      networkStats.transformerCount !== undefined ||
      networkStats.loadCount !== undefined ||
      networkStats.sourceCount !== undefined
    );

    return (
      <div
        className={clsx(
          'h-full flex flex-col',
          className
        )}
        data-testid="inspector-panel-empty"
      >
        {/* Network summary content */}
        <div className="flex-1 p-4 space-y-4">
          {/* Section header */}
          <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Podsumowanie sieci
          </h3>

          {/* Stats grid */}
          {hasStats ? (
            <div className="space-y-2 text-sm">
              {networkStats.nodeCount !== undefined && (
                <div className="flex justify-between items-center py-1 border-b border-gray-100">
                  <span className="text-gray-500">Wezly</span>
                  <span className="font-medium text-gray-900">{networkStats.nodeCount}</span>
                </div>
              )}
              {networkStats.branchCount !== undefined && (
                <div className="flex justify-between items-center py-1 border-b border-gray-100">
                  <span className="text-gray-500">Galezie</span>
                  <span className="font-medium text-gray-900">{networkStats.branchCount}</span>
                </div>
              )}
              {networkStats.transformerCount !== undefined && (
                <div className="flex justify-between items-center py-1 border-b border-gray-100">
                  <span className="text-gray-500">Transformatory</span>
                  <span className="font-medium text-gray-900">{networkStats.transformerCount}</span>
                </div>
              )}
              {networkStats.loadCount !== undefined && (
                <div className="flex justify-between items-center py-1 border-b border-gray-100">
                  <span className="text-gray-500">Obciazenia</span>
                  <span className="font-medium text-gray-900">{networkStats.loadCount}</span>
                </div>
              )}
              {networkStats.sourceCount !== undefined && (
                <div className="flex justify-between items-center py-1 border-b border-gray-100">
                  <span className="text-gray-500">Zrodla</span>
                  <span className="font-medium text-gray-900">{networkStats.sourceCount}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-400 italic">
              Brak elementow w sieci
            </div>
          )}

          {/* Help text */}
          <div className="pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              Kliknij element na schemacie lub w drzewie projektu, aby zobaczyc jego wlasciwosci.
            </p>
          </div>
        </div>

        {/* Mode indicator */}
        {isReadOnly && (
          <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>Tryb wynikow â€” tylko do odczytu</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Selection preview (minimal info before full inspector loads)
  const typeLabel = ELEMENT_TYPE_LABELS_PL[selectedElement.type] || selectedElement.type;

  return (
    <div
      className={clsx(
        'h-full flex flex-col',
        className
      )}
      data-testid="inspector-panel-preview"
      data-selection-id={selectedElement.id}
    >
      {/* Element name header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-800" data-testid="inspector-title">
          {selectedElement.name || selectedElement.id}
        </h3>
      </div>

      {/* Element type badge */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Typ:</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
            {typeLabel}
          </span>
        </div>
      </div>

      {/* Basic info */}
      <div className="flex-1 p-4">
        <div className="space-y-3">
          {/* ID */}
          <div className="flex justify-between items-start">
            <span className="text-xs text-gray-500">ID</span>
            <span className="text-xs font-mono text-gray-700 text-right max-w-[180px] truncate" title={selectedElement.id}>
              {selectedElement.id}
            </span>
          </div>

          {/* Name */}
          <div className="flex justify-between items-start">
            <span className="text-xs text-gray-500">Nazwa</span>
            <span className="text-xs text-gray-700 text-right max-w-[180px] truncate" title={selectedElement.name}>
              {selectedElement.name || 'â€”'}
            </span>
          </div>

          {/* Type */}
          <div className="flex justify-between items-start">
            <span className="text-xs text-gray-500">Typ elementu</span>
            <span className="text-xs text-gray-700">{typeLabel}</span>
          </div>
        </div>

        {/* Loading indicator for full properties */}
        <div className="mt-6 pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-400 text-center">
            SzczegĂłĹ‚owe wĹ‚aĹ›ciwoĹ›ci Ĺ‚adujÄ… siÄ™...
          </p>
        </div>
      </div>

      {/* Mode indicator */}
      {isReadOnly && (
        <div className="px-4 py-2 border-t border-gray-200 bg-green-50">
          <div className="flex items-center gap-2 text-xs text-green-700">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span>Tryb wynikĂłw â€” tylko do odczytu</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default EmptyInspectorPanel;

