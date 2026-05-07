import type { StationFieldAnnotationV1 } from './core/layoutResult';
import {
  EmbeddingRoleV1,
  FieldRoleV1,
  type FieldV1,
  type StationBlockDetailV1,
} from './core/fieldDeviceContracts';
import type { VoltageDomain } from './SldVoltageDomainGuard';

export interface StationCadField {
  id: string;
  role: FieldRoleV1;
  label: string;
  x: number;
  busY: number;
  topY: number;
  bottomY: number;
  voltageDomain: VoltageDomain;
}

export interface StationCadLayout {
  stationId: string;
  embeddingRole: EmbeddingRoleV1;
  bounds: { x: number; y: number; width: number; height: number };
  snCompartment: { x: number; y: number; width: number; height: number };
  nnCompartment: { x: number; y: number; width: number; height: number };
  snBus: { x1: number; x2: number; y: number };
  nnBus: { x1: number; x2: number; y: number };
  fields: StationCadField[];
  transformerField: StationCadField | null;
  lineInField: StationCadField | null;
  lineOutField: StationCadField | null;
  branchField: StationCadField | null;
  couplerField: StationCadField | null;
  transformer: { x: number; y: number; radius: number } | null;
  hasSnContinuation: boolean;
  hasBranchOut: boolean;
}

const FIELD_SPACING = 112;
const FIELD_STACK_HEIGHT = 142;
const FIELD_TOP_OFFSET = 12;

function fallbackEmbeddingRole(stationType: StationFieldAnnotationV1['stationType']): EmbeddingRoleV1 {
  switch (stationType) {
    case 'TYPE_B':
      return EmbeddingRoleV1.TRUNK_INLINE;
    case 'TYPE_C':
      return EmbeddingRoleV1.TRUNK_BRANCH;
    case 'TYPE_D':
      return EmbeddingRoleV1.LOCAL_SECTIONAL;
    case 'TYPE_A':
    default:
      return EmbeddingRoleV1.TRUNK_LEAF;
  }
}

function fallbackFields(stationId: string, embeddingRole: EmbeddingRoleV1): FieldV1[] {
  const roles: FieldRoleV1[] = [FieldRoleV1.LINE_IN, FieldRoleV1.TRANSFORMER_SN_NN];
  if (embeddingRole === EmbeddingRoleV1.TRUNK_INLINE || embeddingRole === EmbeddingRoleV1.LOCAL_SECTIONAL) {
    roles.push(FieldRoleV1.LINE_OUT);
  }
  if (embeddingRole === EmbeddingRoleV1.TRUNK_BRANCH) {
    roles.push(FieldRoleV1.LINE_BRANCH);
  }
  if (embeddingRole === EmbeddingRoleV1.LOCAL_SECTIONAL) {
    roles.splice(1, 0, FieldRoleV1.COUPLER_SN);
  }

  return roles.map((role, index) => ({
    id: `${stationId}-${role.toLowerCase()}-${index + 1}`,
    stationId,
    busSectionId: `${stationId}-sn-1`,
    fieldRole: role,
    terminals: {
      incomingNodeId: null,
      outgoingNodeId: null,
      branchNodeId: null,
      generatorNodeId: null,
    },
    requiredDevices: {
      fieldRole: role,
      requirements: [],
    },
    deviceIds: [],
    catalogRef: null,
  }));
}

function fieldSortWeight(role: FieldRoleV1): number {
  switch (role) {
    case FieldRoleV1.LINE_IN:
      return 10;
    case FieldRoleV1.COUPLER_SN:
    case FieldRoleV1.BUS_TIE:
      return 20;
    case FieldRoleV1.TRANSFORMER_SN_NN:
      return 30;
    case FieldRoleV1.LINE_BRANCH:
      return 40;
    case FieldRoleV1.LINE_OUT:
      return 50;
    case FieldRoleV1.MEASUREMENT_SN:
      return 60;
    case FieldRoleV1.PV_SN:
    case FieldRoleV1.BESS_SN:
    case FieldRoleV1.FW_SN:
      return 70;
    default:
      return 90;
  }
}

function isSnFieldRole(role: FieldRoleV1): boolean {
  return role !== FieldRoleV1.MAIN_NN
    && role !== FieldRoleV1.FEEDER_NN
    && role !== FieldRoleV1.PV_NN
    && role !== FieldRoleV1.BESS_NN;
}

function formatFieldRoleLabel(role: FieldRoleV1): string {
  switch (role) {
    case FieldRoleV1.LINE_IN:
      return 'Pole wejściowe SN';
    case FieldRoleV1.LINE_OUT:
      return 'Pole wyjściowe SN';
    case FieldRoleV1.LINE_BRANCH:
      return 'Pole odgałęźne SN';
    case FieldRoleV1.TRANSFORMER_SN_NN:
      return 'Pole transformatorowe';
    case FieldRoleV1.COUPLER_SN:
    case FieldRoleV1.BUS_TIE:
      return 'Pole sprzęgła SN';
    case FieldRoleV1.MEASUREMENT_SN:
      return 'Pole pomiarowe SN';
    case FieldRoleV1.PV_SN:
      return 'Pole źródła PV SN';
    case FieldRoleV1.BESS_SN:
      return 'Pole magazynu SN';
    case FieldRoleV1.FW_SN:
      return 'Pole farmy wiatrowej SN';
    default:
      return 'Pole SN';
  }
}

function selectFields(detail: StationBlockDetailV1 | null, field: StationFieldAnnotationV1): readonly FieldV1[] {
  const embeddingRole = detail?.embeddingRole ?? fallbackEmbeddingRole(field.stationType);
  const fields = detail?.fields.filter((item) => isSnFieldRole(item.fieldRole)) ?? [];
  if (fields.length > 0) {
    return [...fields].sort((left, right) => {
      const roleDiff = fieldSortWeight(left.fieldRole) - fieldSortWeight(right.fieldRole);
      return roleDiff !== 0 ? roleDiff : left.id.localeCompare(right.id);
    });
  }
  return fallbackFields(field.stationId, embeddingRole);
}

export function buildStationCadLayout(field: StationFieldAnnotationV1): StationCadLayout {
  const detail = field.detail ?? null;
  const embeddingRole = detail?.embeddingRole ?? fallbackEmbeddingRole(field.stationType);
  const baseX = field.apparatus[0]?.position.x ?? 0;
  const baseY = field.apparatus[0]?.position.y ?? 0;
  const selectedFields = selectFields(detail, field);
  const fieldCount = Math.max(selectedFields.length, 2);
  const width = Math.max(386, fieldCount * FIELD_SPACING + 118);
  const x = baseX - width / 2;
  const y = baseY - 92;
  const snBusY = y + 86;
  const topY = snBusY + FIELD_TOP_OFFSET;
  const bottomY = topY + FIELD_STACK_HEIGHT;
  const transformerY = bottomY + 42;
  const nnBusY = transformerY + 78;
  const height = nnBusY - y + 92;
  const fieldStartX = baseX - ((fieldCount - 1) * FIELD_SPACING) / 2;

  const fields = selectedFields.map((item, index): StationCadField => ({
    id: item.id,
    role: item.fieldRole,
    label: formatFieldRoleLabel(item.fieldRole),
    x: fieldStartX + index * FIELD_SPACING,
    busY: snBusY,
    topY,
    bottomY,
    voltageDomain: 'SN',
  }));

  const transformerField =
    fields.find((item) => item.role === FieldRoleV1.TRANSFORMER_SN_NN) ?? null;
  const lineInField = fields.find((item) => item.role === FieldRoleV1.LINE_IN) ?? null;
  const lineOutField = fields.find((item) => item.role === FieldRoleV1.LINE_OUT) ?? null;
  const branchField = fields.find((item) => item.role === FieldRoleV1.LINE_BRANCH) ?? null;
  const couplerField =
    fields.find((item) => item.role === FieldRoleV1.COUPLER_SN || item.role === FieldRoleV1.BUS_TIE) ?? null;

  return {
    stationId: field.stationId,
    embeddingRole,
    bounds: { x, y, width, height },
    snCompartment: { x: x + 14, y: y + 48, width: width - 28, height: 190 },
    nnCompartment: { x: x + 46, y: nnBusY - 34, width: width - 92, height: 78 },
    snBus: { x1: x + 46, x2: x + width - 46, y: snBusY },
    nnBus: { x1: x + 88, x2: x + width - 88, y: nnBusY },
    fields,
    transformerField,
    lineInField,
    lineOutField,
    branchField,
    couplerField,
    transformer: transformerField ? { x: transformerField.x, y: transformerY, radius: 18 } : null,
    hasSnContinuation: Boolean(lineOutField || embeddingRole === EmbeddingRoleV1.TRUNK_INLINE || embeddingRole === EmbeddingRoleV1.LOCAL_SECTIONAL),
    hasBranchOut: Boolean(branchField || embeddingRole === EmbeddingRoleV1.TRUNK_BRANCH),
  };
}
