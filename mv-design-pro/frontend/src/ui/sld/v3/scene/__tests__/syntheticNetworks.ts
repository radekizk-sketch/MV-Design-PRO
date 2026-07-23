/**
 * RECENZJA EKSPERCKA P1 — generatory syntetycznych sieci SN (rodzina H, WYTYCZNE
 * §3) i operacje metamorficzne, WSPÓLNE dla testów skalowalności i lokalności.
 *
 * ZASADA (WYTYCZNE §1): to NIE jest strojenie fixtury. Sieć wielkoskalowa
 * powstaje przez DETERMINISTYCZNE łańcuchowanie kopii podgrafu sieci referencyjnej
 * (`sldSubstrate52s`, 53 stacje z magistralą + 12 lateralami + TR + DER + NO) na
 * JEDNEJ magistrali — każda kopia z unikalnym sufiksem hasha (refy strukturalnie
 * poprawne), spięta busem ogona magistrali poprzednika. Proporcje (laterale/TR/
 * DER/NO na stację) są REALNE, bo replikują realną topologię, nie sztuczny wzór.
 * Zapis = KOD generatora (nie ogromne JSON-y), seed = liczba kopii (stały).
 */
import { readFileSync } from 'node:fs';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import type { SceneLod, SceneV3 } from '../buildScene';

export const LODS: readonly SceneLod[] = [0, 1, 2];

export function loadEnm(path: string): EnergyNetworkModel {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { readonly enm?: EnergyNetworkModel };
  return parsed.enm ?? (parsed as unknown as EnergyNetworkModel);
}

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;
const trunkOf = (e: any): any => e.line_runs.find((r: any) => r.run_kind === 'main_trunk');
/** Remap wszystkich hashy refów w kopii przez dopisanie sufiksu — utrzymuje
 *  wewnętrzną spójność referencji kopii (WYTYCZNE §1: „unikalny sufiks hasha"). */
const remap = (o: any, suf: string): any => {
  if (typeof o === 'string') return o.replace(/([0-9a-f]{16,})/g, `$1${suf}`);
  if (Array.isArray(o)) return o.map((x) => remap(x, suf));
  if (o && typeof o === 'object') {
    const r: any = {};
    for (const k of Object.keys(o)) r[k] = remap(o[k], suf);
    return r;
  }
  return o;
};
const isGpz = (r: unknown): boolean => typeof r === 'string' && r.includes('gpz/');
const isGpzTr = (t: any): boolean =>
  (Array.isArray(t.tags) && t.tags.includes('gpz_wn_sn_transformer')) ||
  (t.meta && t.meta.visual_role === 'GPZ_WN_SN_TRANSFORMER');
const tailBus = (e: any): string | null => {
  const t = trunkOf(e);
  const l = t.segments[t.segments.length - 1].segment_ref;
  return e.branches.find((b: any) => b.ref_id === l)?.to_bus_ref ?? null;
};

/** Wpina NIE-GPZ rekordy kopii `cp` (z magistralą `ct`) do modelu `out`, wiążąc
 *  jej pierwszy segment magistrali z busem `prev`. Zwraca nowy bus ogona. */
function spliceCopyOntoTrunk(out: any, cp: any, prev: string | null): string | null {
  const ct = trunkOf(cp);
  const fb = cp.branches.find((b: any) => b.ref_id === ct.segments[0].segment_ref);
  if (fb) fb.from_bus_ref = prev;
  out.substations.push(...cp.substations.filter((s: any) => !isGpz(s.ref_id)));
  out.buses.push(...cp.buses.filter((b: any) => !isGpz(b.ref_id)));
  out.branches.push(...cp.branches.filter((b: any) => !isGpz(b.ref_id)));
  out.transformers.push(...(cp.transformers ?? []).filter((t: any) => !isGpzTr(t)));
  out.sources.push(...(cp.sources ?? []).filter((s: any) => !isGpz(s.ref_id)));
  out.loads.push(...(cp.loads ?? []));
  out.generators.push(...(cp.generators ?? []));
  out.bays.push(...(cp.bays ?? []).filter((b: any) => !isGpz(b.ref_id)));
  out.junctions.push(...(cp.junctions ?? []));
  out.branch_points.push(...(cp.branch_points ?? []));
  out.measurements.push(...(cp.measurements ?? []));
  out.protection_assignments.push(...(cp.protection_assignments ?? []));
  out.connection_nodes.push(...(cp.connection_nodes ?? []));
  out.corridors.push(...(cp.corridors ?? []));
  for (const r of cp.line_runs) if (r.run_kind === 'branch') out.line_runs.push(r);
  const ot = trunkOf(out);
  let order = ot.segments.length;
  for (const seg of ct.segments) {
    order += 1;
    ot.segments.push({ segment_ref: seg.segment_ref, order });
  }
  return tailBus(cp);
}

/**
 * Rodzina H (WYTYCZNE §3): sieć ~`53×copies` stacji na JEDNEJ magistrali przez
 * łańcuchowanie `copies` kopii sieci referencyjnej. Deterministyczna (sufiks =
 * numer kopii). `copies=1` zwraca kopię modelu bez zmian.
 */
export function synthLargeTrunk(model: EnergyNetworkModel, copies: number): EnergyNetworkModel {
  const out = clone(model) as any;
  let prev = tailBus(out);
  for (let c = 1; c < copies; c++) {
    const suf = `${String(c).padStart(2, '0')}ab`;
    prev = spliceCopyOntoTrunk(out, remap(clone(model), suf), prev);
  }
  return out as EnergyNetworkModel;
}

/**
 * Operacja metamorficzna „+1 stacja na ogonie magistrali" (WYTYCZNE §5): dokleja
 * NIE-GPZ stacje małej, samodzielnej fixtury `unit` do ogona magistrali `base`.
 * Dla `unit` z jedną stacją SN (np. `openTrunkChain`/`gpzFeeder`) daje +1 stację.
 * Reużywa tej samej maszynerii co `synthLargeTrunk` (jedno źródło wiązania).
 */
export function appendUnitToTrunk(
  base: EnergyNetworkModel,
  unit: EnergyNetworkModel,
  suffix = 'p1add',
): EnergyNetworkModel {
  const out = clone(base) as any;
  spliceCopyOntoTrunk(out, remap(clone(unit), suffix), tailBus(out));
  return out as EnergyNetworkModel;
}

/**
 * WYTYCZNE §5 — deterministyczna PERMUTACJA rekordów wejściowych BEZ zmiany
 * kolejności TOPOLOGICZNEJ: odwraca tablice-PULE wyszukiwane po `ref_id` (silnik
 * buduje z nich mapy), których kolejność w pamięci jest arbitralna. NIE rusza
 * `line_runs`/`segments`/`bays`/`corridors` (nośniki semantyki kolejności).
 */
export function permuteRecords(model: EnergyNetworkModel): EnergyNetworkModel {
  const rev = <T>(a: readonly T[] | undefined): T[] | undefined =>
    a ? [...a].reverse() : a === undefined ? undefined : [];
  return {
    ...model,
    buses: rev((model as any).buses)!,
    branches: rev((model as any).branches)!,
    transformers: rev((model as any).transformers)!,
    sources: rev((model as any).sources)!,
    loads: rev((model as any).loads)!,
    generators: rev((model as any).generators)!,
    substations: rev((model as any).substations)!,
    junctions: rev((model as any).junctions)!,
    branch_points: rev((model as any).branch_points),
    measurements: rev((model as any).measurements)!,
    protection_assignments: rev((model as any).protection_assignments)!,
  } as EnergyNetworkModel;
}

/** Podpis sceny (symbole + trasy + etykiety + liczba crossingów) — deterministyczny,
 *  do porównań determinizmu/permutacji. */
export function sceneSignature(scene: SceneV3): string {
  const symbols = scene.symbols.map((s) => `${s.symbolId}@${s.x},${s.y}`).sort().join('|');
  const segments = scene.segments
    .map((seg) => `${seg.meta?.ownerRef ?? '?'}#${seg.points.map((p) => `${p.x},${p.y}`).join(';')}`)
    .sort()
    .join('|');
  const labels = scene.labels.map((l) => `${l.ownerRef}:${l.text}@${l.rect.x},${l.rect.y}`).sort().join('|');
  return `S[${symbols}]G[${segments}]L[${labels}]X[${scene.crossings.length}]`;
}
