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

/** Wpina rekordy NIE-GPZ modelu `cp` do `out` — JEDNO źródło prawdy filtra
 *  (reguła KLASA §3: ta sama lista pól używana przez `spliceCopyOntoTrunk`,
 *  `insertUnitMidLateral`, `appendLateralBranch` — dawniej powielona 1×,
 *  teraz każdy nowy „graft" reużywa TĘ SAMĄ funkcję zamiast kopiować listę). */
function mergeNonGpzRecords(out: any, cp: any): void {
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
}

/** Wpina NIE-GPZ rekordy kopii `cp` (z magistralą `ct`) do modelu `out`, wiążąc
 *  jej pierwszy segment magistrali z busem `prev`. Zwraca nowy bus ogona. */
function spliceCopyOntoTrunk(out: any, cp: any, prev: string | null): string | null {
  const ct = trunkOf(cp);
  const fb = cp.branches.find((b: any) => b.ref_id === ct.segments[0].segment_ref);
  if (fb) fb.from_bus_ref = prev;
  mergeNonGpzRecords(out, cp);
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
 * WYTYCZNE §5 / karta SLD-LOC (macierz lokalności L4): usuwa WSZYSTKIE gałęzie
 * TWORZĄCE PĘTLĘ (domykające pierścień) — generycznie, przez teorię grafów
 * (drzewo rozpinające BFS od szyny SN GPZ), zero hardcode refów gałęzi/stacji.
 * Po tej operacji graf jest DRZEWEM (sieć promieniowa): każdy bus ma DOKŁADNIE
 * jedną ścieżkę do źródła. Gałęzie NIE należące do drzewa rozpinającego —
 * dokładnie te dopisane przez `connect_secondary_ring_sn` (SUB-52s) — to te,
 * które BFS odrzuca jako prowadzące do JUŻ odwiedzonego węzła (definicja
 * krawędzi nadmiarowej w grafie, nie dopasowanie po id/nazwie).
 */
export function radialize(model: EnergyNetworkModel): EnergyNetworkModel {
  const out = clone(model) as any;
  const adjacency = new Map<string, { to: string; ref: string }[]>();
  const addEdge = (a: string, b: string, ref: string): void => {
    if (!adjacency.has(a)) adjacency.set(a, []);
    adjacency.get(a)!.push({ to: b, ref });
  };
  for (const b of out.branches as any[]) {
    if (!b.from_bus_ref || !b.to_bus_ref) continue;
    addEdge(b.from_bus_ref, b.to_bus_ref, b.ref_id);
    addEdge(b.to_bus_ref, b.from_bus_ref, b.ref_id);
  }
  const root: string | undefined =
    (out.buses as any[]).find((b) => b.ref_id.includes('gpz/') && b.ref_id.endsWith('bus_sn'))?.ref_id
    ?? (out.buses as any[])[0]?.ref_id;
  const spanningTreeRefs = new Set<string>();
  if (root != null) {
    const visited = new Set<string>([root]);
    const queue: string[] = [root];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const edge of adjacency.get(cur) ?? []) {
        if (visited.has(edge.to)) continue;
        visited.add(edge.to);
        spanningTreeRefs.add(edge.ref);
        queue.push(edge.to);
      }
    }
  }
  out.branches = (out.branches as any[]).filter((b) => spanningTreeRefs.has(b.ref_id));
  return out as EnergyNetworkModel;
}

/** Emuluje rozwinięcie sufiksów `_L`/`_R` adaptera (`enmToSldAdapter.ts`
 *  `normalizeLineRunForLayout`/`expandSegmentRefToBranches`) — JEDNO źródło
 *  prawdy o kolejności odcinków odgałęzienia dla helperów niżej: insercja W
 *  ŚRODKU / doklejenie nowego odgałęzienia muszą trafiać w TĘ SAMĄ kolejność,
 *  którą zobaczy scena (reguła KLASA §3 — predykaty parami z adapterem). */
function findLeafBranches(model: any, baseRef: string): any[] {
  const exact = model.branches.filter((b: any) => b.ref_id === baseRef);
  if (exact.length > 0) return exact;
  return model.branches
    .filter((b: any) => b.ref_id.startsWith(`${baseRef}_`))
    .sort((a: any, b: any) => (a.ref_id < b.ref_id ? -1 : a.ref_id > b.ref_id ? 1 : 0));
}

/**
 * WSZYSTKIE odcinki WŁASNEGO ciągu `unit` (jego `main_trunk`), w kolejności
 * elektrycznej, rozwinięte tą samą konwencją `_L`/`_R` co `findLeafBranches`
 * — GENERYCZNIE, niezależnie od tego, czy `unit` jest ciągiem jednoodcinkowym,
 * czy ma WŁASNE rozcięcie (jak `openTrunkChain`, którego drugi deklarowany
 * segment jest już podzielony na `segment_L`/`segment_R`). Zastępuje
 * niewłaściwe użycie `tailBus()` (zakłada BRAK rozcięcia WŁASNEGO ciągu unit
 * — prawdziwe tylko dla `appendUnitToTrunk`, gdzie wynik i tak jest odrzucany
 * przy pojedynczym doklejeniu; tu wynik JEST używany, więc musi być poprawny). */
function unitLeafBranchesInOrder(unit: any): any[] {
  const ct = trunkOf(unit);
  const allLeaves = (ct.segments as any[]).flatMap((seg) => findLeafBranches(unit, seg.segment_ref));
  if (allLeaves.length === 0) throw new Error('unitLeafBranchesInOrder: unit nie ma ani jednego odcinka');
  return allLeaves;
}

/**
 * Nadaje `leaves` (odcinki `unit`, kolejność elektryczna) refy DZIELĄCE
 * prefiks `baseRef` wg TEJ SAMEJ rekurencyjnej konwencji `_L`/`_R`, którą
 * stosuje realna operacja domenowa przy kolejnych rozcięciach segmentu
 * (dowód: `sldSubstrate52s` ma odgałęzienia rozcięte 3× — `_L`, `_R_L`,
 * `_R_R_L`, `_R_R_R`; wzór: i-ty z N liści (i<N-1) = `_R`×i + `_L`, ostatni
 * (i=N-1) = `_R`×(N-1)). Adapter (`enmToSldAdapter.ts` `normalizeLineRunForLayout`)
 * odnajduje odcinek WYŁĄCZNIE po prefiksie bazowego refu z `line_run.segments`
 * — nowo wszczepione odcinki z WŁASNYM hashem `unit` (choćby poprawnie
 * podłączone busami) są dla adaptera NIEWIDOCZNE, dopóki nie dzielą TEGO
 * prefiksu (bez tego trafiają do synth-trunk fallbacku jako osobny, sierocy
 * ciąg — zmierzone: `run.kind` staje się błędnie `main_trunk`). */
function renameLeavesUnderBase(leaves: readonly any[], baseRef: string): void {
  const n = leaves.length;
  leaves.forEach((leaf, i) => {
    leaf.ref_id = `${baseRef}${'_R'.repeat(i)}${i === n - 1 ? '_R' : '_L'}`;
  });
}

/**
 * Operacja metamorficzna „+1 stacja W ŚRODKU odgałęzienia" (WYTYCZNE §5, karta
 * SLD-LOC L4): rozcina ŚRODKOWY odcinek PIERWSZEGO (deterministycznie,
 * sortowanie po id) odgałęzienia ciągu i wstawia weń stację `unit` — TĄ SAMĄ
 * konwencją przyrostków `_L`/`_R`, którą stosuje realna operacja domenowa
 * `insert_station_on_segment_sn` (dowód: `sldSubstrate52s` ma odgałęzienia już
 * rozcięte tą konwencją — `seg/<h>/branch_segment_R_R_L` itp., patrz
 * `enmToSldAdapter.ts` `expandSegmentRefToBranches`). Deklarowany
 * `line_run.segments` odgałęzienia wskazuje WYŁĄCZNIE bazowy ref (adapter
 * rozwija go po prefiksie), więc doklejenie kolejnego poziomu `_L`/`_R` NIE
 * wymaga żadnej zmiany `line_runs` — jedno źródło prawdy z adapterem.
 */
export function insertUnitMidLateral(
  model: EnergyNetworkModel,
  unit: EnergyNetworkModel,
  suffix = 'midins',
): EnergyNetworkModel {
  const out = clone(model) as any;
  const branchRuns = (out.line_runs as any[])
    .filter((r) => r.run_kind === 'branch')
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const targetRun = branchRuns[0];
  if (!targetRun) throw new Error('insertUnitMidLateral: model nie ma odgałęzienia (run_kind=branch)');
  const baseRef = targetRun.segments[0].segment_ref;
  const leaves = findLeafBranches(out, baseRef);
  const mid = leaves[Math.floor(leaves.length / 2)];

  const grafted = remap(clone(unit), suffix) as any;
  const graftedLeaves = unitLeafBranchesInOrder(grafted);
  renameLeavesUnderBase(graftedLeaves, mid.ref_id);
  const entryBranch = graftedLeaves[0];
  const exitBranch = graftedLeaves[graftedLeaves.length - 1];
  entryBranch.from_bus_ref = mid.from_bus_ref;
  exitBranch.to_bus_ref = mid.to_bus_ref;

  // Oryginalny odcinek A→B jest teraz OBEJŚCIEM przez nową stację — usuwamy
  // go (zastępują go odcinki `grafted`, doklejone prefiksem sufiksu `_L`/`_R`
  // wyżej, patrz `entryBranch`/`exitBranch`), inaczej A i B miałyby DWIE drogi.
  out.branches = (out.branches as any[]).filter((b) => b.ref_id !== mid.ref_id);
  mergeNonGpzRecords(out, grafted);
  return out as EnergyNetworkModel;
}

/**
 * Operacja metamorficzna „+1 odgałęzienie" (WYTYCZNE §5, karta SLD-LOC L4):
 * dokłada CAŁE NOWE odgałęzienie zaczepione na WOLNYM polu SN (`bay_role:
 * FEEDER`, `field_role: LINIA_ODG`) DOPISANYM do stacji ciągu głównego —
 * stacja-gospodarz to origin OSTATNIEGO (deterministycznie, sortowanie po id)
 * ISTNIEJĄCEGO odgałęzienia (a więc stacja MAGISTRALI, nie stacja lateralu:
 * pomiar §6 pokazał, że `buildScene.ts` jawnie odrzuca „odgałęzienie
 * zagnieżdżone" — origin spoza magistrali — jako POZA ZAKRESEM silnika,
 * stopNote „nie leży na magistrali głównej"; zaczep na stacji lateralu byłby
 * więc niedowodnym testem, nie lokalnością). OSTATNI, nie pierwszy origin:
 * packer pasm lateralnych jest sekwencyjny i globalny (ten sam mechanizm co
 * defekt naprawiony w tej karcie), więc NOWE, dopisane NA KOŃCU listy
 * odgałęzienie ląduje na NAJNIŻSZEJ dostępnej półce — origin z OSTATNIEGO
 * wiersza arkusza ma do niej NAJKRÓTSZY, WŁASNY pion zejścia (bez przecinania
 * PÓŹNIEJSZYCH wierszy, których po prostu nie ma); origin z PIERWSZEGO
 * wiersza miałby pion przez CAŁY dalszy rysunek — osobny defekt klasy
 * kanałów wielowierszowych (`computeRowChannelPlan` liczony per-wiersz, nie
 * globalnie), poza zakresem tej karty (lokalność PIONOWA, nie routing).
 * Kolejny numer pola tej stacji = max+1 spośród jej WŁASNYCH `field_specs`
 * (reguła ogólna, zero hardcode indeksu — stacja magistrali ma już pole
 * `LINIA_ODG` dla ISTNIEJĄCEGO odgałęzienia, więc NOWE dostaje kolejny wolny
 * numer, nie nadpisuje go). Kształt nowego pola (field_spec + zacisk
 * techniczny + wyłącznik) NIE jest wymyślony — jest SKOPIOWANY z PIERWSZEGO
 * realnego pola `LINIA_ODG` znalezionego w modelu (jedno źródło prawdy: ten
 * sam kontrakt pola, którym już posługuje się `sldSubstrate52s` dla swoich
 * 12 odgałęzień).
 */
export function appendLateralBranch(
  model: EnergyNetworkModel,
  unit: EnergyNetworkModel,
  suffix = 'p1branch',
): EnergyNetworkModel {
  const out = clone(model) as any;
  const branchRuns = (out.line_runs as any[])
    .filter((r) => r.run_kind === 'branch')
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const targetRun = branchRuns[branchRuns.length - 1];
  if (!targetRun) throw new Error('appendLateralBranch: model nie ma odgałęzienia (run_kind=branch)');
  const hostStationRef: string = (targetRun.branch_origin_station_ref as string).replace(/\/sn_field\/\d+$/, '');
  const hostBus = `${hostStationRef}/sn_bus`;

  const templateHit = (out.substations as any[])
    .flatMap((s) =>
      (s.meta?.field_specs ?? []).map((field: any) => ({
        stationRef: (s.ref_id as string).replace(/\/station$/, ''),
        field,
      })),
    )
    .find(({ field }) => field.meta?.field_role === 'LINIA_ODG');
  if (!templateHit) throw new Error('appendLateralBranch: brak pola LINIA_ODG-wzorca w modelu');
  const templateStationRef: string = templateHit.stationRef;
  const templateIndex = Number(/(\d+)$/.exec(templateHit.field.field_ref)![1]);
  const pad = (n: number): string => String(n).padStart(3, '0');
  const templateTerminalBus = (out.buses as any[]).find(
    (b) => b.ref_id === `${templateStationRef}/sn_field_terminal/${pad(templateIndex)}`,
  );
  const templateBreakerBranch = (out.branches as any[]).find(
    (b) => b.ref_id === `${templateStationRef}/sn_field_breaker/${pad(templateIndex)}`,
  );
  if (!templateTerminalBus || !templateBreakerBranch) {
    throw new Error('appendLateralBranch: wzorzec pola LINIA_ODG niekompletny (brak busa/wyłącznika)');
  }

  const hostSubstation = (out.substations as any[]).find((s) => s.ref_id === `${hostStationRef}/station`);
  const existingIndices = (hostSubstation.meta.field_specs ?? []).map(
    (f: any) => Number(/(\d+)$/.exec(f.field_ref)![1]),
  );
  const newIndex = Math.max(-1, ...existingIndices) + 1;
  const newFieldRef = `${hostStationRef}/sn_field/${pad(newIndex)}`;
  const newTerminalRef = `${hostStationRef}/sn_field_terminal/${pad(newIndex)}`;
  const newBreakerRef = `${hostStationRef}/sn_field_breaker/${pad(newIndex)}`;

  const newFieldSpec = clone(templateHit.field);
  newFieldSpec.field_ref = newFieldRef;
  newFieldSpec.bus_ref = hostBus;
  newFieldSpec.equipment_refs = [newBreakerRef];
  newFieldSpec.meta.default_device_ref = newBreakerRef;
  newFieldSpec.meta.terminal_bus_ref = newTerminalRef;
  hostSubstation.meta.field_specs = [...(hostSubstation.meta.field_specs ?? []), newFieldSpec];
  hostSubstation.bus_refs = [...(hostSubstation.bus_refs ?? []), newTerminalRef];

  const newTerminalBus = clone(templateTerminalBus);
  newTerminalBus.id = newTerminalRef;
  newTerminalBus.ref_id = newTerminalRef;
  newTerminalBus.meta.field_ref = newFieldRef;
  newTerminalBus.meta.station_ref = `${hostStationRef}/station`;
  out.buses.push(newTerminalBus);

  const newBreakerBranch = clone(templateBreakerBranch);
  newBreakerBranch.id = newBreakerRef;
  newBreakerBranch.ref_id = newBreakerRef;
  newBreakerBranch.from_bus_ref = hostBus;
  newBreakerBranch.to_bus_ref = newTerminalRef;
  newBreakerBranch.meta.field_ref = newFieldRef;
  newBreakerBranch.meta.station_ref = `${hostStationRef}/station`;
  out.branches.push(newBreakerBranch);

  const grafted = remap(clone(unit), suffix) as any;
  const ct = trunkOf(grafted);
  const entryBranch = unitLeafBranchesInOrder(grafted)[0];
  entryBranch.from_bus_ref = newTerminalRef;
  mergeNonGpzRecords(out, grafted);
  out.line_runs.push({
    id: `corridor/${suffix}/branch`,
    name: 'Odgałęzienie SN (test lokalności)',
    run_kind: 'branch',
    starting_bay_ref: newFieldRef,
    starting_port_ref: `${newFieldRef}.BRANCH`,
    segments: ct.segments.map((s: any) => ({ segment_ref: s.segment_ref, order: s.order })),
    stations: [],
    nop_station_ref: null,
    parent_run_ref: null,
    branch_origin_station_ref: newFieldRef,
  });
  return out as EnergyNetworkModel;
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
