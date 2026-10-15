/**
 * TopologyPanel — panel edycji topologii sieci SN.
 *
 * Integruje:
 * - TopologyTreeView (widok spine/laterals)
 * - Toolbar z akcjami (dodaj element)
 * - Modale catalog-first (NodeModal, BranchModal, etc.)
 * - Selection sync z SLD
 *
 * CATALOG-FIRST: submit handlers przekazują catalog_ref + topology.
 * Brak parametrów fizycznych w payload.
 * BINDING: PL labels, no codenames.
 */

import { useCallback, useState } from 'react';
import { useTopologyStore } from './store';
import { TopologyTreeView } from './TopologyTreeView';
import {
  NodeModal,
  BranchModal,
  ProtectionModal,
  MeasurementModal,
  TransformerStationModal,
  LoadDERModal,
} from './modals';
import type { NodeFormData } from './modals/NodeModal';
import type { BranchFormData } from './modals/BranchModal';
import type { ProtectionFormData } from './modals/ProtectionModal';
import type { MeasurementFormData } from './modals/MeasurementModal';
import type { TransformerStationFormData } from './modals/TransformerStationModal';
import type { LoadDERFormData } from './modals/LoadDERModal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ModalKind =
  | 'node'
  | 'branch'
  | 'protection'
  | 'measurement'
  | 'transformer'
  | 'load_der'
  | null;

interface TopologyPanelProps {
  caseId: string;
  busOptions: Array<{ ref_id: string; name: string; voltage_kv: number }>;
  breakerOptions: Array<{ ref_id: string; name: string }>;
  ctOptions: Array<{ ref_id: string; name: string; ratio: string }>;
  vtOptions: Array<{ ref_id: string; name: string }>;
}

// ---------------------------------------------------------------------------
// Toolbar items
// ---------------------------------------------------------------------------

const TOOLBAR_ITEMS: Array<{ kind: ModalKind; label: string; icon: string }> = [
  { kind: 'node', label: 'Szyna', icon: '⬜' },
  { kind: 'branch', label: 'Gałąź', icon: '━' },
  { kind: 'transformer', label: 'Transformator', icon: '⊗' },
  { kind: 'load_der', label: 'Odbiór/OZE', icon: '▽' },
  { kind: 'measurement', label: 'Przekładnik', icon: '◎' },
  { kind: 'protection', label: 'Zabezpieczenie', icon: '⊕' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TopologyPanel({
  caseId,
  busOptions,
  breakerOptions,
  ctOptions,
  vtOptions,
}: TopologyPanelProps) {
  const { summary, loading, error, lastOpIssues, executeOp } = useTopologyStore();
  const [activeModal, setActiveModal] = useState<ModalKind>(null);
  const [selectedNodeRef, setSelectedNodeRef] = useState<string | null>(null);

  // Modal handlers
  const openModal = useCallback((kind: ModalKind) => setActiveModal(kind), []);
  const closeModal = useCallback(() => setActiveModal(null), []);

  const handleNodeSubmit = useCallback(
    async (data: NodeFormData) => {
      await executeOp(caseId, 'create_node', {
        ref_id: data.ref_id,
        name: data.name,
        voltage_kv: data.voltage_kv,
        zone: data.zone || undefined,
      });
      closeModal();
    },
    [caseId, executeOp, closeModal]
  );

  const handleBranchSubmit = useCallback(
    async (data: BranchFormData) => {
      await executeOp(caseId, 'create_branch', {
        ref_id: data.ref_id,
        name: data.name,
        type: data.type,
        from_bus_ref: data.from_bus_ref,
        to_bus_ref: data.to_bus_ref,
        length_km: data.length_km,
        catalog_ref: data.catalog_ref || undefined,
        parameter_source: data.parameter_source,
        overrides: data.overrides.length > 0 ? data.overrides : undefined,
        status: data.status,
      });
      closeModal();
    },
    [caseId, executeOp, closeModal]
  );

  const handleProtectionSubmit = useCallback(
    async (data: ProtectionFormData) => {
      await executeOp(caseId, 'attach_protection', {
        ref_id: data.ref_id,
        name: data.name,
        breaker_ref: data.breaker_ref,
        ct_ref: data.ct_ref || undefined,
        vt_ref: data.vt_ref || undefined,
        device_type: data.device_type,
        catalog_ref: data.catalog_ref || undefined,
        parameter_source: data.parameter_source,
        overrides: data.overrides.length > 0 ? data.overrides : undefined,
      });
      closeModal();
    },
    [caseId, executeOp, closeModal]
  );

  const handleMeasurementSubmit = useCallback(
    async (data: MeasurementFormData) => {
      await executeOp(caseId, 'create_measurement', {
        ref_id: data.ref_id,
        name: data.name,
        measurement_type: data.measurement_type,
        bus_ref: data.bus_ref,
        connection: data.connection,
        purpose: data.purpose,
        catalog_ref: data.catalog_ref || undefined,
        parameter_source: data.parameter_source,
        overrides: data.overrides.length > 0 ? data.overrides : undefined,
      });
      closeModal();
    },
    [caseId, executeOp, closeModal]
  );

  const handleTransformerSubmit = useCallback(
    async (data: TransformerStationFormData) => {
      await executeOp(caseId, 'create_device', {
        device_kind: 'transformer',
        ref_id: data.ref_id,
        name: data.name,
        hv_bus_ref: data.hv_bus_ref,
        lv_bus_ref: data.lv_bus_ref,
        tap_position: data.tap_position,
        catalog_ref: data.catalog_ref || undefined,
        parameter_source: data.parameter_source,
        overrides: data.overrides.length > 0 ? data.overrides : undefined,
      });
      closeModal();
    },
    [caseId, executeOp, closeModal]
  );

  const handleLoadDERSubmit = useCallback(
    async (data: LoadDERFormData) => {
      const device_kind = data.element_kind === 'load' ? 'load' : 'generator';
      const payload: Record<string, unknown> = {
        device_kind,
        ref_id: data.ref_id,
        name: data.name,
        bus_ref: data.bus_ref,
        catalog_ref: data.catalog_ref || undefined,
        parameter_source: data.parameter_source,
        overrides: data.overrides.length > 0 ? data.overrides : undefined,
      };
      if (device_kind === 'load') {
        payload.model = data.load_model;
      } else {
        payload.gen_type = data.gen_type;
        payload.quantity = data.quantity;
      }
      await executeOp(caseId, 'create_device', payload);
      closeModal();
    },
    [caseId, executeOp, closeModal]
  );

  return (
    <div className="flex flex-col h-full" data-testid="topology-panel">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        {TOOLBAR_ITEMS.map((item) => (
          <button
            key={item.kind}
            onClick={() => openModal(item.kind)}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-100 transition-colors"
            title={`Dodaj: ${item.label}`}
          >
            <span className="text-sm">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      {/* Op issues banner */}
      {lastOpIssues.length > 0 && (
        <div className="px-3 py-2 bg-sygnal-uwaga-tlo border-b border-sygnal-uwaga/40 text-xs text-sygnal-uwaga-tusz">
          {lastOpIssues.map((issue, i) => (
            <div key={i}>
              <span className="font-medium">[{issue.severity}]</span>{' '}
              {issue.message_pl}
            </div>
          ))}
        </div>
      )}

      {/* Topology tree */}
      <div className="flex-1 overflow-hidden">
        <TopologyTreeView
          summary={summary}
          loading={loading}
          error={error}
          selectedNodeRef={selectedNodeRef}
          onNodeSelect={setSelectedNodeRef}
        />
      </div>

      {/* Modals */}
      <NodeModal
        isOpen={activeModal === 'node'}
        mode="create"
        onSubmit={handleNodeSubmit}
        onCancel={closeModal}
      />
      <BranchModal
        isOpen={activeModal === 'branch'}
        mode="create"
        busOptions={busOptions}
        onSubmit={handleBranchSubmit}
        onCancel={closeModal}
      />
      <ProtectionModal
        isOpen={activeModal === 'protection'}
        mode="create"
        breakerOptions={breakerOptions}
        ctOptions={ctOptions}
        vtOptions={vtOptions}
        onSubmit={handleProtectionSubmit}
        onCancel={closeModal}
      />
      <MeasurementModal
        isOpen={activeModal === 'measurement'}
        mode="create"
        busOptions={busOptions}
        onSubmit={handleMeasurementSubmit}
        onCancel={closeModal}
      />
      <TransformerStationModal
        isOpen={activeModal === 'transformer'}
        mode="create"
        busOptions={busOptions}
        onSubmit={handleTransformerSubmit}
        onCancel={closeModal}
      />
      <LoadDERModal
        isOpen={activeModal === 'load_der'}
        mode="create"
        busOptions={busOptions}
        onSubmit={handleLoadDERSubmit}
        onCancel={closeModal}
      />
    </div>
  );
}
