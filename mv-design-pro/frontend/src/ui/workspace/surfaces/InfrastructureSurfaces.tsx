/**
 * Surface'y infrastruktury sieciowej (Etap 4):
 *  - ZksnSurface (E-14): Złącze kablowe SN
 *  - BranchPoleSurface (E-15): Słup rozgałęźny
 *  - BranchSurface (E-16): Odgałęzienie
 *  - NopSurface (E-17): Punkt normalnie otwarty
 *
 * Każdy surface ma minimalny ale kompletny konfigurator z polskimi etykietami,
 * polami danych technicznych i hint'em o kolejnych etapach roadmapy.
 */

import { useMemo, useState } from 'react';

import { useSnapshotStore } from '../../topology/snapshotStore';
import { useNetworkBuildStore } from '../../network-build/networkBuildStore';
import {
  resolveBranchPointBranchPortId,
  resolveBranchPointBranchPortOccupancy,
  resolveBranchSourceContext,
  resolveBranchSourceRef,
} from '../../network-build/operationContextResolvers';
import { MISSING_DASH } from '../../shared/formatPolishValue';
import { publicTechnicalLabel } from '../../shared/publicTechnicalLabels';
import type { Branch, BranchPointSN, EnergyNetworkModel } from '../../../types/enm';
import type { WorkspaceSurfaceDescriptor } from '../types';

interface SurfaceProps {
  readonly surface: WorkspaceSurfaceDescriptor;
}

function isRouteSegment(branch: Branch): boolean {
  if (branch.type !== 'cable' && branch.type !== 'line_overhead') return false;
  const tags = Array.isArray(branch.tags) ? branch.tags : [];
  const meta = branch.meta && typeof branch.meta === 'object' ? branch.meta as Record<string, unknown> : {};
  return !tags.includes('branch_point_internal_connector') && meta.render_on_sld !== false;
}

function expectedMainSegmentType(branchPoint: BranchPointSN | null): Branch['type'] | null {
  if (!branchPoint) return null;
  return branchPoint.branch_point_type === 'branch_pole' ? 'line_overhead' : 'cable';
}

function branchRef(branch: Branch): string {
  return branch.ref_id ?? branch.id;
}

function resolveBranchPointMainSegment(
  snapshot: EnergyNetworkModel | null | undefined,
  branchPoint: BranchPointSN | null,
): Branch | null {
  if (!snapshot || !branchPoint) return null;
  const expectedType = expectedMainSegmentType(branchPoint);
  const visibleSegments = (snapshot.branches ?? []).filter(isRouteSegment);
  const runtimeRefs = branchPoint.runtime_inputs?.main_segment_refs;
  if (Array.isArray(runtimeRefs)) {
    const runtimeSegment = visibleSegments.find((branch) =>
      runtimeRefs.includes(branchRef(branch)) && (!expectedType || branch.type === expectedType),
    );
    if (runtimeSegment) return runtimeSegment;
  }

  const directSegment = visibleSegments.find((branch) =>
    branchRef(branch) === branchPoint.parent_segment_id && (!expectedType || branch.type === expectedType),
  );
  if (directSegment) return directSegment;

  const connectedSegments = visibleSegments.filter(
    (branch) => branch.from_bus_ref === branchPoint.bus_ref || branch.to_bus_ref === branchPoint.bus_ref,
  );
  return (
    connectedSegments.find((branch) => !expectedType || branch.type === expectedType)
    ?? connectedSegments[0]
    ?? null
  );
}

function routeSegmentCatalogNamespace(segment: Branch): 'KABEL_SN' | 'LINIA_SN' {
  return segment.type === 'line_overhead' ? 'LINIA_SN' : 'KABEL_SN';
}

function routeSegmentOperationContext(segment: Branch, rodzaj: Branch['type'] = segment.type): Record<string, unknown> {
  const params = segment.materialized_params && typeof segment.materialized_params === 'object'
    ? segment.materialized_params as Record<string, unknown>
    : {};
  return {
    rodzaj,
    catalog_binding: {
      catalog_namespace:
        (segment as { catalog_namespace?: string | null }).catalog_namespace
        ?? routeSegmentCatalogNamespace(segment),
      catalog_item_id: (segment as { catalog_ref?: string | null }).catalog_ref ?? null,
      catalog_item_version:
        (segment as { catalog_version?: string | null }).catalog_version ?? '1.0',
    },
    catalog_label: params.catalog_label ?? params.type_label ?? params.type_designation ?? params.name ?? null,
    cross_section_mm2: (segment as { cross_section_mm2?: number | null }).cross_section_mm2
      ?? (typeof params.cross_section_mm2 === 'number' ? params.cross_section_mm2 : null),
    return_conductor_cross_section_mm2:
      (segment as { return_conductor_cross_section_mm2?: number | null }).return_conductor_cross_section_mm2
      ?? (typeof params.return_conductor_cross_section_mm2 === 'number'
        ? params.return_conductor_cross_section_mm2
        : null),
    conductor_material: (segment as { conductor_material?: string | null }).conductor_material
      ?? (typeof params.conductor_material === 'string' ? params.conductor_material : null),
  };
}

function routeSegmentPublicLabel(segment: Branch | null, fallback: string): string {
  if (!segment) return fallback;
  return publicTechnicalLabel(segment.name, fallback);
}

function zksnBranchPortDisplayLabel(index: number): string {
  return `ODG ${index + 1}`;
}

function zksnMainSegmentRefs(branchPoint: BranchPointSN | null): readonly string[] {
  const runtimeInputs = branchPoint?.runtime_inputs;
  if (!runtimeInputs || typeof runtimeInputs !== 'object') return [];
  const refs = (runtimeInputs as Record<string, unknown>).main_segment_refs;
  return Array.isArray(refs)
    ? refs.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];
}

function branchPortSegmentRef(
  snapshot: EnergyNetworkModel | null | undefined,
  branchPoint: BranchPointSN,
  portId: string,
  busRef: string,
): string | null {
  const sourceRef = `${branchPoint.ref_id}.${portId}`;
  const connectedBranch = (snapshot?.branches ?? []).find((branch) => {
    const endpointAPort = (branch as { endpoint_a_port?: { port_id?: string; bus_ref?: string } | null }).endpoint_a_port;
    const endpointBPort = (branch as { endpoint_b_port?: { port_id?: string; bus_ref?: string } | null }).endpoint_b_port;
    return (
      branch.from_bus_ref === busRef
      || branch.to_bus_ref === busRef
      || endpointAPort?.port_id === sourceRef
      || endpointBPort?.port_id === sourceRef
      || endpointAPort?.bus_ref === busRef
      || endpointBPort?.bus_ref === busRef
    );
  });
  return connectedBranch ? branchRef(connectedBranch) : null;
}

function zksnBranchPortOccupancy(
  snapshot: EnergyNetworkModel | null | undefined,
  branchPoint: BranchPointSN,
  portId: string,
  busRef: string,
  index: number,
): string | null {
  return (
    resolveBranchPointBranchPortOccupancy(branchPoint, index)
    ?? branchPortSegmentRef(snapshot, branchPoint, portId, busRef)
  );
}

// =============================================================================
// E-14 — ZK SN (Złącze kablowe SN)
// =============================================================================

export function ZksnSurface({ surface }: SurfaceProps): JSX.Element {
  const ref = surface.entityRef ?? null;
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const openOperationForm = useNetworkBuildStore((state) => state.openOperationForm);
  const branchPoint = useMemo(
    () => snapshot?.branch_points?.find((point) => point.ref_id === ref || point.id === ref) ?? null,
    [snapshot, ref],
  );
  const mainRouteSegment = useMemo(
    () => resolveBranchPointMainSegment(snapshot, branchPoint),
    [branchPoint, snapshot],
  );
  const mainSegmentRefs = useMemo(() => zksnMainSegmentRefs(branchPoint), [branchPoint]);
  const mainOutBusRef = typeof branchPoint?.ports?.MAIN_OUT === 'string'
    ? branchPoint.ports.MAIN_OUT
    : null;
  const mainRouteLabel = routeSegmentPublicLabel(mainRouteSegment, 'Ciąg kablowy SN');
  const mainOutAlreadyContinued = mainSegmentRefs.length > 1;
  const branchPorts = useMemo(
    () => {
      const ports = branchPoint?.ports?.BRANCH ?? [];
      return ports.map((busRef, index) => {
        const portId = resolveBranchPointBranchPortId(ports.length, index);
        const occupiedSegmentRef = branchPoint
          ? zksnBranchPortOccupancy(snapshot, branchPoint, portId, busRef, index)
          : null;
        return {
          busRef,
          portId,
          displayLabel: zksnBranchPortDisplayLabel(index),
          occupied: Boolean(occupiedSegmentRef),
          occupiedSegmentRef,
        };
      });
    },
    [branchPoint, snapshot],
  );

  const handleContinueMainRoute = () => {
    if (!branchPoint || !mainOutBusRef) return;
    openOperationForm('continue_trunk_segment_sn', {
      from_terminal_id: mainOutBusRef,
      terminal_id: mainOutBusRef,
      terminalId: mainOutBusRef,
      from_bus_ref: mainOutBusRef,
      terminal_port_id: `${branchPoint.ref_id}.MAIN_OUT`,
      port_id: `${branchPoint.ref_id}.MAIN_OUT`,
      terminal_name: 'Pole WY ZK SN',
      terminal_voltage_label: '15 kV',
      element_ref: branchPoint.ref_id,
      element_type: 'ZKSN',
      source_type_label: 'ZKSN',
      source_name: branchPoint.name ?? 'ZK SN',
      source_port_label: 'pole wyjściowe ciągu głównego',
      segment_kind: 'KABEL_SN',
      length_m: 500,
      segment: mainRouteSegment ? routeSegmentOperationContext(mainRouteSegment, 'cable') : undefined,
    });
  };

  const handleStartBranchFromPort = (portId: string) => {
    if (!branchPoint) return;
    const fromRef = `${branchPoint.ref_id}.${portId}`;
    const branchSource = resolveBranchSourceContext(snapshot, fromRef);
    if (!branchSource.sourceBusRef) return;
    openOperationForm('start_branch_segment_sn', {
      from_ref: fromRef,
      element_ref: ref,
      source_bus_ref: branchSource.sourceBusRef,
      source_type_label: branchSource.sourceType,
      source_name: branchSource.sourceName,
      source_voltage_label: branchSource.voltageLabel,
      source_port_label: publicBranchPortLabel(branchSource.portLabel),
      segment: mainRouteSegment ? routeSegmentOperationContext(mainRouteSegment, 'cable') : undefined,
    });
  };

  const activeFieldLabels = ['WE', 'WY', ...branchPorts.map((port) => port.displayLabel)];
  const activeFieldCount = activeFieldLabels.length;

  return (
    <div data-testid="zksn-surface" className="flex h-full w-full flex-col p-4">
      <SurfaceHeader
        code="E-14"
        title="Rozdzielnica kablowa SN bez transformatora"
        subtitle={branchPoint?.name ?? surface.titlePl ?? 'ZK SN niewybrane'}
      />
      <div className="flex-1 space-y-3 overflow-auto p-4">
        <div className="rounded border border-scada-border bg-scada-surface p-3 text-sm text-scada-muted">
          ZK SN jest rozdzielnicą w torze kablowym. Ma pola liniowe WE/WY oraz pola odgałęźne
          z katalogu, ale nie zawiera transformatora SN/nN.
        </div>
        <div className="grid grid-cols-2 gap-3">
          <KeyValue label="Rola w sieci" value="rozdzielnica odgałęźna toru kablowego" />
          <KeyValue label="Medium odgałęzienia" value="kabel SN" />
          <KeyValue label="Ciąg główny" value={mainRouteLabel} />
          <KeyValue label="Transformator" value="nie występuje" />
          <KeyValue label="Wariant katalogowy" value={branchPoint?.catalog_ref ?? MISSING_DASH} />
          <KeyValue
            label="Układ pól SN"
            value={activeFieldCount > 0 ? activeFieldLabels.join(' / ') : MISSING_DASH}
          />
          <KeyValue label="Porty odgałęźne" value={`${branchPorts.length}`} />
        </div>
        <div className="rounded border border-scada-border bg-scada-panel p-3">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-scada-muted">
            Tor główny WE/WY
          </div>
          <div className="mt-2 space-y-2">
            {mainOutAlreadyContinued ? (
              <p
                data-testid="zksn-main-out-state"
                className="rounded border border-scada-border bg-scada-surface px-3 py-2 text-xs font-semibold text-scada-text"
              >
                Pole WY ciągu głównego jest już połączone z następnym odcinkiem kablowym.
              </p>
            ) : (
              <button
                type="button"
                disabled={!mainOutBusRef}
                onClick={handleContinueMainRoute}
                data-testid="zksn-action-continue-main"
                className="w-full rounded border border-scada-sn bg-scada-sn/10 px-3 py-2 text-left text-xs font-semibold text-scada-text hover:bg-scada-sn/20 disabled:cursor-not-allowed disabled:border-scada-border disabled:bg-scada-surface disabled:text-scada-muted"
              >
                {mainOutBusRef
                  ? 'Kontynuuj tor kablowy z pola WY'
                  : 'Pole WY nie jest dostępne w wariancie katalogowym'}
              </button>
            )}
          </div>
        </div>
        <div className="rounded border border-scada-border bg-scada-panel p-3">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-scada-muted">
            Wyprowadzenia kablowe
          </div>
          <div className="mt-2 space-y-2">
            {branchPorts.length === 0 ? (
              <p className="text-[11px] text-amber-300">
                Brak wolnych pól odgałęźnych w materializacji ZK SN.
              </p>
            ) : (
              branchPorts.map((port) => (
                <button
                  key={port.portId}
                  type="button"
                  disabled={port.occupied}
                  onClick={() => handleStartBranchFromPort(port.portId)}
                  data-testid={`zksn-action-start-branch-${port.portId}`}
                  className="w-full rounded border border-scada-sn bg-scada-sn/10 px-3 py-2 text-left text-xs font-semibold text-scada-text hover:bg-scada-sn/20 disabled:cursor-not-allowed disabled:border-scada-border disabled:bg-scada-surface disabled:text-scada-muted"
                >
                  {port.occupied
                    ? `${port.displayLabel}: odgałęzienie kablowe już wyprowadzone`
                    : `Wyprowadź odgałęzienie kablowe z ${port.displayLabel}`}
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// E-15 — Słup rozgałęźny
// =============================================================================

export function BranchPoleSurface({ surface }: SurfaceProps): JSX.Element {
  const ref = surface.entityRef ?? null;
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const openOperationForm = useNetworkBuildStore((state) => state.openOperationForm);
  const branchPoint = useMemo(
    () => snapshot?.branch_points?.find((point) => point.ref_id === ref || point.id === ref) ?? null,
    [snapshot, ref],
  );
  const branchSourceRef = useMemo(
    () => resolveBranchSourceRef(snapshot, ref, null, branchPoint?.bus_ref ?? null),
    [branchPoint?.bus_ref, ref, snapshot],
  );
  const branchSource = useMemo(
    () => (branchSourceRef ? resolveBranchSourceContext(snapshot, branchSourceRef) : null),
    [branchSourceRef, snapshot],
  );
  const branchPortOccupied = Boolean(branchPoint?.branch_occupied?.BRANCH);
  const branchSegmentRef = branchPoint?.branch_occupied?.BRANCH ?? null;
  const mainRouteSegment = useMemo(
    () => resolveBranchPointMainSegment(snapshot, branchPoint),
    [branchPoint, snapshot],
  );
  const branchSegment = useMemo(
    () => snapshot?.branches?.find((branch) => branch.ref_id === branchSegmentRef || branch.id === branchSegmentRef) ?? null,
    [branchSegmentRef, snapshot],
  );
  const branchPoleName = publicTechnicalLabel(
    branchPoint?.name ?? surface.titlePl,
    'Słup rozgałęźny SN',
  );
  const mainRouteLabel = routeSegmentPublicLabel(mainRouteSegment, 'Ciąg linii napowietrznej SN');
  const branchSegmentLabel = routeSegmentPublicLabel(branchSegment, 'Odcinek odgałęźny SN');
  const branchPortState = branchPortOccupied ? 'zajęty przez odgałęzienie' : 'wolny';

  const handleStartBranch = () => {
    if (!branchSourceRef || !branchSource) return;
    openOperationForm('start_branch_segment_sn', {
      from_ref: branchSourceRef,
      element_ref: ref,
      source_bus_ref: branchSource.sourceBusRef,
      source_type_label: branchSource.sourceType,
      source_name: branchSource.sourceName,
      source_voltage_label: branchSource.voltageLabel,
      source_port_label: publicBranchPortLabel(branchSource.portLabel),
      segment: mainRouteSegment ? routeSegmentOperationContext(mainRouteSegment) : undefined,
    });
  };

  return (
    <div data-testid="branch-pole-surface" className="flex h-full w-full flex-col p-4">
      <SurfaceHeader
        code="E-15"
        title="Słup linii napowietrznej SN"
        subtitle={branchPoleName}
      />
      <div className="flex-1 space-y-4 overflow-auto p-4">
        <div className="rounded border border-scada-border bg-scada-surface p-3 text-sm text-scada-muted">
          Punkt odgałęźny linii napowietrznej SN. Słup jest węzłem trasy i portem bocznym odgałęzienia,
          nie polem szynowym stacji.
        </div>
        <div className="grid grid-cols-2 gap-3">
          <KeyValue label="Rola w sieci" value="węzeł linii napowietrznej z portem odgałęzienia" />
          <KeyValue label="Ciąg główny" value={mainRouteLabel} />
          <KeyValue label="Poziom napięcia" value={branchSource?.voltageLabel ?? MISSING_DASH} />
          <KeyValue label="Port odgałęzienia" value={publicBranchPortLabel(branchSource?.portLabel)} />
          <KeyValue
            label="Stan łącznika"
            value={branchPoint?.switch_state === 'open' ? 'otwarty' : 'zamknięty'}
          />
          <KeyValue
            label="Wariant katalogowy"
            value={publicTechnicalLabel(branchPoint?.catalog_ref, 'Słup rozgałęźny SN')}
          />
          <KeyValue label="Tor odgałęźny" value={branchPortState} />
        </div>
        <div className="rounded border border-scada-border bg-scada-panel p-3">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-scada-muted">
            {branchPortOccupied ? 'Odgałęzienie wyprowadzone' : 'Następny krok projektowy'}
          </div>
          {branchPortOccupied ? (
            <p className="mt-2 rounded border border-scada-border bg-scada-surface px-3 py-2 text-xs font-semibold text-scada-text">
              Port odgałęźny jest zajęty: {branchSegmentLabel}. Kontynuuj konfigurację odcinka
              odgałęźnego albo jego zakończenia.
            </p>
          ) : (
            <button
              type="button"
              disabled={!branchSourceRef}
              onClick={handleStartBranch}
              data-testid="branch-pole-action-start-branch"
              className="mt-2 w-full rounded border border-scada-sn bg-scada-sn/10 px-3 py-2 text-left text-xs font-semibold text-scada-text hover:bg-scada-sn/20 disabled:cursor-not-allowed disabled:border-scada-border disabled:bg-scada-surface disabled:text-scada-muted"
            >
              Wyprowadź odgałęzienie SN z portu słupa
            </button>
          )}
          {!branchSourceRef && !branchPortOccupied && (
            <p className="mt-2 text-[11px] text-amber-300">
              Najpierw wybierz wolny port odgałęźny słupa.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// E-16 — Odgałęzienie
// =============================================================================

export function BranchSurface({ surface }: SurfaceProps): JSX.Element {
  const ref = surface.entityRef ?? null;
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const branchInfo = useMemo(() => {
    if (!snapshot || !ref) return { name: ref ?? 'Odgałęzienie niewybrane', stationsCount: 0, lengthM: null as number | null };
    return { name: ref, stationsCount: 0, lengthM: null };
  }, [snapshot, ref]);
  return (
    <div data-testid="branch-surface" className="flex h-full w-full flex-col p-4">
      <SurfaceHeader code="E-16" title="Odgałęzienie" subtitle={branchInfo.name} />
      <div className="flex-1 space-y-3 overflow-auto p-4">
        <p className="rounded border border-scada-border bg-scada-surface p-3 text-sm text-scada-muted">
          Odgałęzienie podporządkowane ciągowi głównemu. Konfiguracja odgałęzienia
          obejmuje: punkt startowy (pole liniowe stacji, ZK SN albo słup linii napowietrznej), rodzinę odcinka
          (kabel/linia), endpointy oraz obiekty na odgałęzieniu.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <KeyValue label="Liczba stacji" value={`${branchInfo.stationsCount}`} />
          <KeyValue label="Długość całkowita" value={branchInfo.lengthM !== null ? `${branchInfo.lengthM} m` : MISSING_DASH} />
          <KeyValue label="Status" value="W trakcie konfiguracji" />
          <KeyValue label="Wyniki" value={MISSING_DASH} />
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// E-17 — NOP (Punkt normalnie otwarty)
// =============================================================================

interface NopData {
  designation: string;
  apparatusRef: string;
  isNormallyOpen: boolean;
  switchableUnderLoad: boolean;
  remoteControl: boolean;
}

export function NopSurface({ surface }: SurfaceProps): JSX.Element {
  const ref = surface.entityRef ?? null;
  const [data, setData] = useState<NopData>({
    designation: '',
    apparatusRef: '',
    isNormallyOpen: true,
    switchableUnderLoad: true,
    remoteControl: false,
  });
  return (
    <div data-testid="nop-surface" className="flex h-full w-full flex-col p-4">
      <SurfaceHeader code="E-17" title="Punkt normalnie otwarty" subtitle={ref ?? 'NOP niewybrany'} />
      <div className="flex-1 space-y-3 overflow-auto p-4">
        <Field
          label="Oznaczenie NOP"
          required
          value={data.designation}
          onChange={(v) => setData((d) => ({ ...d, designation: v }))}
          placeholder="np. NOP-W-01"
        />
        <Field
          label="Aparat realizujący NOP"
          value={data.apparatusRef}
          onChange={(v) => setData((d) => ({ ...d, apparatusRef: v }))}
          placeholder="ID aparatu z modelu sieci"
        />
        <CheckboxField
          label="Stan normalny: otwarty"
          checked={data.isNormallyOpen}
          onChange={(v) => setData((d) => ({ ...d, isNormallyOpen: v }))}
        />
        <CheckboxField
          label="Możliwość przełączania pod obciążeniem"
          checked={data.switchableUnderLoad}
          onChange={(v) => setData((d) => ({ ...d, switchableUnderLoad: v }))}
        />
        <CheckboxField
          label="Sterowanie zdalne (SCADA)"
          checked={data.remoteControl}
          onChange={(v) => setData((d) => ({ ...d, remoteControl: v }))}
        />
        <p className="rounded border border-scada-border bg-scada-surface p-3 text-[11px] text-scada-muted">
          NOP modeluje rozcięcie elektryczne pierścienia SN. Operacja domenowa
          set_normal_open_point (panel ENM) ustawia / zmienia stan łącznika.
          Pełna integracja z układem pracy sieci (E-05) — Etap 6 roadmapy.
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// Wspólne komponenty pomocnicze
// =============================================================================

function SurfaceHeader({ code: _code, title, subtitle }: { code: string; title: string; subtitle: string }) {
  return (
    <div className="mb-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-scada-muted">
        {title}
      </div>
      <h2 className="mt-1 text-base font-semibold text-scada-text">{subtitle}</h2>
    </div>
  );
}

function publicBranchPortLabel(portLabel: string | null | undefined): string {
  if (!portLabel) return 'port boczny odgałęzienia';
  if (portLabel.startsWith('BRANCH')) return 'port boczny odgałęzienia';
  return portLabel;
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-scada-border bg-scada-surface p-2">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-scada-muted">{label}</div>
      <div className="mt-1 text-sm font-medium text-scada-text">{value}</div>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}

function Field({ label, value, onChange, placeholder, required }: FieldProps) {
  return (
    <div>
      <label className="mb-1 block text-xs text-scada-muted">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-scada-border bg-scada-surface px-2 py-1.5 text-sm text-scada-text placeholder:text-scada-muted focus:border-scada-sn focus:outline-none"
      />
    </div>
  );
}

interface CheckboxFieldProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function CheckboxField({ label, checked, onChange }: CheckboxFieldProps) {
  return (
    <label className="flex items-center gap-2 text-sm text-scada-text">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-scada-border bg-scada-surface text-scada-sn focus:ring-scada-sn"
      />
      {label}
    </label>
  );
}
