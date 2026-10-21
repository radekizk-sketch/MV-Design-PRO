export type SldTopologyRunKind = 'main_trunk' | 'branch' | 'ring' | 'loop';

export interface SldTopologyRun {
  readonly id: string;
  readonly kind: SldTopologyRunKind;
  /** F10.2 (SLD_CAD_SPEC_V3 §19.2, D2): `LineRun.name` SUROWY (przycięty,
   *  odfiltrowany od refów/hashy programistycznych) — `null` gdy dana
   *  nieobecna LUB nie wygląda na czytelną nazwę. Bez syntezy
   *  zastępczej nazwy — pomieszanie realnej nazwy z syntetycznym napisem w
   *  podpisie pola liniowego naruszałoby WHITE BOX/zero zgadywania,
   *  spec §19.2 „brak danych linii = sam kier. ⟨kod⟩", nie fabrykowany
   *  numer). Konsument: `v3/scene/buildScene.ts` `buildLineRunShims`. */
  readonly lineName: string | null;
  readonly parentRunRef: string | null;
  readonly branchOriginStationRef: string | null;
  readonly nopStationRef: string | null;
  readonly startingBayRef: string | null;
  readonly startingPortRef: string | null;
  readonly stationRefs: readonly string[];
}
