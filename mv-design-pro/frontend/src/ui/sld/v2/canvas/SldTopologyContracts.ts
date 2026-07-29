import type { LabelAnchor, LabelPlacement, LabelPriority } from './LabelDeclutter';

export interface SldPoint {
  readonly x: number;
  readonly y: number;
}

export type SldRunCorridorKind =
  | 'gpz'
  | 'main-trunk'
  | 'branch'
  | 'ring-return'
  | 'der-connection'
  | 'label-reserve';

export type SldTopologyRunKind = 'main_trunk' | 'branch' | 'ring' | 'loop';

export type SldTerminalElementType =
  | 'bay'
  | 'segment'
  | 'station'
  | 'zksn'
  | 'branch_pole'
  | 'nop'
  | 'der'
  | 'bus'
  | 'unknown';

export interface SldTopologyRun {
  readonly id: string;
  readonly kind: SldTopologyRunKind;
  readonly label: string;
  /** F10.2 (SLD_CAD_SPEC_V3 §19.2, D2): `LineRun.name` SUROWY (przycięty,
   *  odfiltrowany od refów/hashy programistycznych) — `null` gdy dana
   *  nieobecna LUB nie wygląda na czytelną nazwę. ODDZIELNE od `label`
   *  (który ZAWSZE syntetyzuje bezpieczny fallback, np. „Ciąg SN 01", do
   *  UI ogólnego — pomieszanie realnej nazwy z syntetycznym fallbackiem w
   *  podpisie pola liniowego naruszałoby WHITE BOX/zero zgadywania,
   *  spec §19.2 „brak danych linii = sam kier. ⟨kod⟩", nie fabrykowany
   *  numer). Konsument: `v3/scene/buildScene.ts` `buildLineRunShims`. */
  readonly lineName: string | null;
  readonly corridorId: string;
  readonly laneIndex: number;
  readonly orderInRun: number;
  readonly parentRunRef: string | null;
  readonly sourceRunRef: string | null;
  readonly branchOriginStationRef: string | null;
  readonly nopStationRef: string | null;
  readonly startingBayRef: string | null;
  readonly startingPortRef: string | null;
  readonly tapPoint: SldPoint | null;
  readonly distanceFromSourceM: number | null;
  readonly routePoints: readonly SldPoint[];
  readonly segmentRefs: readonly string[];
  readonly stationRefs: readonly string[];
  readonly terminalRefs: readonly string[];
}

export interface SldRunCorridor {
  readonly id: string;
  readonly kind: SldRunCorridorKind;
  readonly yMin: number;
  readonly yMax: number;
  readonly laneIndex: number;
  readonly label?: string;
  readonly stationCount: number;
  readonly runRef?: string | null;
  readonly parentRunRef?: string | null;
  readonly sourceRunRef?: string | null;
  readonly nopStationRef?: string | null;
  readonly tapPoint?: SldPoint | null;
  readonly routePoints?: readonly SldPoint[];
}

export interface SldTerminalBinding {
  readonly id: string;
  readonly elementRef: string;
  readonly elementType: SldTerminalElementType;
  readonly terminalRef: string;
  readonly busRef?: string | null;
  readonly portRef?: string | null;
  readonly runRef?: string | null;
  readonly laneIndex?: number | null;
  readonly orderInRun?: number | null;
  readonly distanceFromSourceM?: number | null;
  readonly x?: number | null;
  readonly y?: number | null;
}

export interface SldBranchPointMarker {
  readonly id: string;
  readonly name: string;
  readonly branchPointType: 'branch_pole' | 'zksn';
  readonly x: number;
  readonly y: number;
  readonly anchorX?: number | null;
  readonly anchorY?: number | null;
  readonly runRef?: string | null;
  readonly parentSegmentRef?: string | null;
  readonly catalogRef?: string | null;
  readonly switchState?: 'open' | 'closed' | null;
  readonly branchPortCount?: number;
  readonly switchgearFieldCount?: number;
  readonly hasTransformer?: boolean;
}

export type SldLabelOwnerKind =
  | 'gpz'
  | 'run'
  | 'segment'
  | 'station'
  | 'branch_point'
  | 'der'
  | 'device'
  | 'result'
  | 'nop';

export interface SldLabelSpec {
  readonly id: string;
  readonly ownerRef: string;
  readonly ownerKind: SldLabelOwnerKind;
  readonly text: string;
  readonly priority: LabelPriority;
  readonly anchorPoint: { readonly x: number; readonly y: number };
  readonly width: number;
  readonly height: number;
  readonly preferredAnchor?: LabelAnchor | null;
  readonly lockedAnchor?: LabelAnchor | null;
  /**
   * Tylko dla `ownerKind === 'run'`: czy ciąg jest magistralą / głównym fiderem
   * (`runKind === 'main_trunk'`). Pozwala warstwie kanwy pokazać RZADKĄ etykietę
   * kabla magistrali na przeglądzie sieci (L0) — analogicznie do referencji SCADA,
   * gdzie kable opisane są wzdłuż trasy — bez zaśmiecania widoku etykietami
   * krótkich odgałęzień. Brak / false → etykieta ciągu pojawia się dopiero od L1.
   */
  readonly isTrunk?: boolean;
}

export interface SldReadabilityReport {
  readonly score: number;
  readonly totalLabels: number;
  readonly placedLabels: number;
  readonly hiddenLabels: number;
  readonly criticalCollisions: number;
  readonly hiddenCriticalLabelRefs: readonly string[];
  readonly orphanStationRefs: readonly string[];
  readonly orphanSegmentRefs: readonly string[];
  readonly missingTerminalRefs: readonly string[];
  readonly topologyContinuity: 'continuous' | 'warnings' | 'broken';
  readonly labelPlacements: readonly LabelPlacement[];
}
