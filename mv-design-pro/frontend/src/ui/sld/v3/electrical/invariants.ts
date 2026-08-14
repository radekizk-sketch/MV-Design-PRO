/**
 * SLD-nN-TOPOLOGIA T0 (`docs/nn/PLAN_SLD_NN_TOPOLOGIA_2026-08.md` §Inwarianty,
 * P0.7 dyspozycji) — 9 inwariantów napięciowych grafu elektrycznego. CZYSTY
 * TS, zero Reacta, zero fizyki (walidacja TOPOLOGII/DOMEN, nie prądów/mocy).
 *
 * Plan nazywa 9 inwariantów krótkimi hasłami bez pełnej specyfikacji
 * (dyspozycja P0.1-P0.12 żyje w treści werdyktu właściciela, nie w repo) —
 * każdy poniższy komentarz dokumentuje WYBRANĄ, KONKRETNĄ interpretację
 * (WHITE BOX: „Document assumptions"), z kodem i uzasadnieniem. Gdy właściciel
 * doprecyzuje inaczej, zmiana jest lokalna do jednej funkcji tutaj.
 */
import type { ConductingEdge, TerminalGraph } from './terminalGraph';
import { nonTransformerComponents } from './terminalGraph';

export type InvariantCode =
  | 'EDGE_VOLTAGE_MISMATCH'
  | 'TRANSFORMER_NOT_CROSSING_DOMAIN'
  | 'BUS_VOLTAGE_INCONSISTENT'
  | 'DEVICE_TERMINAL_UNRESOLVED'
  | 'DANGLING_ENERGIZED_TERMINAL'
  | 'CROSS_VOLTAGE_CONDUCTOR'
  | 'UNRESOLVED_ACTIVE_APPARATUS'
  | 'LV_FEEDER_ON_MV_BUS'
  | 'MV_FIELD_ON_LV_BUS';

export interface InvariantViolation {
  readonly code: InvariantCode;
  readonly messagePl: string;
  /** Referencje ENM lokalizujące naruszenie (branch/transformer/bus/leaf ref). */
  readonly elementRefs: readonly string[];
}

export interface GraphValidationResult {
  readonly status: 'SLD_VALID' | 'SLD_INVALID';
  readonly violations: readonly InvariantViolation[];
}

/** Granica domeny nN/SN dla inwariantów 7-9 (IEC 60038: nN ≤ 1 kV). Próg
 *  UŻYWANY WYŁĄCZNIE do scoping tych trzech inwariantów (rozstrzygnięcie, czy
 *  sprawdzać klasyfikację aparatu nN) — węzły/domeny grafu (inwarianty 1/6)
 *  NIE używają tego progu, bo działają na DOWOLNEJ liczbie dyskretnych
 *  poziomów napięć, nie tylko na podziale SN/nN. */
const LV_DOMAIN_MAX_KV = 1.0;

function isLvKv(voltageKv: number): boolean {
  return voltageKv <= LV_DOMAIN_MAX_KV;
}

function busVoltageKv(graph: TerminalGraph, busRef: string): number | null {
  return graph.nodes.get(busRef)?.voltageKv ?? null;
}

function readMaterializedString(edge: ConductingEdge, key: string): string | null {
  const value = edge.materializedParams?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

// ---------------------------------------------------------------------------
// Inwariant 1 — edge voltage compatibility (HARD ERROR).
// Każda gałąź ENM (`Branch` — linia/kabel/łącznik) łączy DWIE szyny TEJ SAMEJ
// domeny napięciowej. `Branch` NIGDY nie jest "crossVoltageDevice" — jedynym
// legalnym elementem międzydomenowym w modelu jest `Transformer` (osobna
// tablica ENM, osobna pętla poniżej w inwariancie 2) — więc test jest
// bezwarunkowy dla WSZYSTKICH gałęzi, niezależnie od `status` (patrz
// docstring `ConductingEdgeKind` w `terminalGraph.ts`: stan otwarty nie jest
// wymówką dla błędnego doboru urządzenia).
// ---------------------------------------------------------------------------
function edgeVoltageCompatibilityViolations(graph: TerminalGraph): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  for (const edge of graph.edges) {
    const from = graph.nodes.get(edge.fromBusRef);
    const to = graph.nodes.get(edge.toBusRef);
    if (!from || !to) continue; // nierozwiązane — inwariant 4.
    if (from.voltageLevelId !== to.voltageLevelId) {
      violations.push({
        code: 'EDGE_VOLTAGE_MISMATCH',
        messagePl:
          `Gałąź „${edge.name}" (${edge.ref}) łączy dwie różne domeny napięciowe ` +
          `(${from.voltageKv} kV ↔ ${to.voltageKv} kV) bez pośrednictwa transformatora — ` +
          'niedozwolone dla gałęzi innej niż transformator.',
        elementRefs: [edge.ref, edge.fromBusRef, edge.toBusRef],
      });
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Inwariant 2 — transformer voltage boundary.
// Transformator jest JEDYNĄ krawędzią międzydomenową w modelu (plan §0.1) —
// żeby pełnić tę rolę, jego terminal HV i LV MUSZĄ leżeć w RÓŻNYCH domenach.
// Transformator, którego oba terminale wypadają w TEJ SAMEJ domenie
// (dyskretyzowanej po `voltage_kv` szyny), nie jest granicą niczego — to
// błąd modelu (np. pomylone `hv_bus_ref`/`lv_bus_ref` wskazujące na dwie
// szyny tej samej sieci).
// ---------------------------------------------------------------------------
function transformerVoltageBoundaryViolations(graph: TerminalGraph): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  for (const tr of graph.transformerEdges) {
    if (tr.hvTerminal.voltageLevelId === tr.lvTerminal.voltageLevelId) {
      violations.push({
        code: 'TRANSFORMER_NOT_CROSSING_DOMAIN',
        messagePl:
          `Transformator „${tr.name}" (${tr.ref}) ma terminal HV i LV w TEJ SAMEJ ` +
          `domenie napięciowej (${tr.hvTerminal.voltageKv} kV) — nie pełni roli granicy ` +
          'między domenami.',
        elementRefs: [tr.ref, tr.hvTerminal.busRef, tr.lvTerminal.busRef],
      });
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Inwariant 3 — bus voltage consistency.
// (a) `Bus.voltage_kv` MUSI być skończoną liczbą dodatnią (sanity — poziom
//     napięcia 0/ujemny/NaN nie da się dyskretyzować na sensowną domenę i
//     cicho psułby inwarianty 1/2/6 dalej w łańcuchu).
// (b) Napięcie ZNAMIONOWE uzwojenia transformatora dotykającego tej szyny
//     (`Transformer.uhv_kv`/`ulv_kv`) MUSI być spójne z napięciem szyny w
//     granicach tolerancji inżynierskiej (±10% — pokrywa typowe różnice
//     nominał sieci vs tabliczka znamionowa, np. 15 kV / 15,75 kV, łapiąc
//     wciąż grube pomyłki, np. transformator 15/0,4 kV podłączony `lv_bus_ref`
//     do szyny 15 kV).
// ---------------------------------------------------------------------------
const BUS_TRANSFORMER_RATED_TOLERANCE = 0.1;

function busVoltageConsistencyViolations(graph: TerminalGraph): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  for (const node of graph.nodes.values()) {
    if (!Number.isFinite(node.voltageKv) || node.voltageKv <= 0) {
      violations.push({
        code: 'BUS_VOLTAGE_INCONSISTENT',
        messagePl: `Szyna „${node.name}" (${node.busRef}) ma niepoprawne napięcie znamionowe (${node.voltageKv} kV) — musi być liczbą dodatnią.`,
        elementRefs: [node.busRef],
      });
    }
  }
  for (const tr of graph.transformerEdges) {
    const checkTerminal = (
      terminal: { readonly busRef: string; readonly voltageKv: number; readonly ratedKv: number },
      side: 'HV' | 'LV',
    ): void => {
      if (!Number.isFinite(terminal.ratedKv) || terminal.ratedKv <= 0) return; // brak danych — poza zakresem tego inwariantu.
      const deviation = Math.abs(terminal.voltageKv - terminal.ratedKv) / terminal.ratedKv;
      if (deviation > BUS_TRANSFORMER_RATED_TOLERANCE) {
        violations.push({
          code: 'BUS_VOLTAGE_INCONSISTENT',
          messagePl:
            `Transformator „${tr.name}" (${tr.ref}): napięcie znamionowe uzwojenia ${side} ` +
            `(${terminal.ratedKv} kV) odbiega o ${(deviation * 100).toFixed(1)}% od napięcia szyny ` +
            `${terminal.busRef} (${terminal.voltageKv} kV) — powyżej tolerancji ${BUS_TRANSFORMER_RATED_TOLERANCE * 100}%.`,
          elementRefs: [tr.ref, terminal.busRef],
        });
      }
    };
    checkTerminal(tr.hvTerminal, 'HV');
    checkTerminal(tr.lvTerminal, 'LV');
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Inwariant 4 — device terminal consistency.
// KAŻDA referencja do szyny (branch from/to, transformer hv/lv, load/
// generator/source bus_ref) MUSI rozwiązywać się do REALNEJ szyny w modelu.
// Budowniczy grafu (`buildTerminalGraph`) już wykrywa i zbiera te przypadki w
// `graph.unresolvedReferences` (zero fabrykacji węzła dla brakującej strony)
// — ten inwariant WYŁĄCZNIE surowo je zgłasza (jedno źródło prawdy, reguła
// KLASA §3: budowa grafu i walidacja NIE mogą mieć dwóch niezależnych
// definicji „referencja nierozwiązana").
// ---------------------------------------------------------------------------
function deviceTerminalConsistencyViolations(graph: TerminalGraph): InvariantViolation[] {
  return graph.unresolvedReferences.map((ref) => ({
    code: 'DEVICE_TERMINAL_UNRESOLVED' as const,
    messagePl:
      `Element „${ref.ownerRef}" (${ref.ownerKind}) wskazuje na szynę „${ref.danglingBusRef}", ` +
      'której nie ma w modelu.',
    elementRefs: [ref.ownerRef, ref.danglingBusRef],
  }));
}

// ---------------------------------------------------------------------------
// Inwariant 5 — no dangling energized terminal.
// Każdy terminal liściowy (Load/Generator/Source — element WYPROWADZAJĄCY
// lub POBIERAJĄCY moc) musi siedzieć na szynie, która ma PRZYNAJMNIEJ JEDNĄ
// inną krawędź (gałąź LUB transformator) — bez tego terminal energetyzowany
// nigdy nie mógłby wymienić mocy z resztą sieci (szyna-wyspa z jednym
// odbiorem/źródłem i zero połączeń — typowy ślad niedokończonej edycji).
// ---------------------------------------------------------------------------
function busHasAnyIncidentEdge(graph: TerminalGraph, busRef: string): boolean {
  return (
    graph.edges.some((e) => e.fromBusRef === busRef || e.toBusRef === busRef) ||
    graph.transformerEdges.some((t) => t.hvTerminal.busRef === busRef || t.lvTerminal.busRef === busRef)
  );
}

function danglingEnergizedTerminalViolations(graph: TerminalGraph): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  for (const leaf of graph.leaves) {
    if (!busHasAnyIncidentEdge(graph, leaf.busRef)) {
      violations.push({
        code: 'DANGLING_ENERGIZED_TERMINAL',
        messagePl:
          `Terminal „${leaf.name}" (${leaf.ref}, ${leaf.kind}) siedzi na szynie „${leaf.busRef}", ` +
          'która nie ma ŻADNEJ innej krawędzi (gałęzi ani transformatora) — terminal jest odizolowany.',
        elementRefs: [leaf.ref, leaf.busRef],
      });
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Inwariant 6 — no cross-voltage conductor.
// GLOBALNE (nie per-krawędź, jak inwariant 1) sprawdzenie: żadna SKŁADOWA
// SPÓJNOŚCI liczona WYŁĄCZNIE po gałęziach nie-transformatorowych
// (`nonTransformerComponents`, `terminalGraph.ts` — JEDNO źródło prawdy
// współdzielone z testem ścieżkowym P0.12(b)) nie może zawierać szyn z DWÓCH
// różnych domen napięciowych. To jest dokładnie test ścieżkowy z dyspozycji
// właściciela: „żaden element poza transformatorem/konwerterem nie łączy
// domen napięciowych" — tu jako inwariant globalny (łapie ŁAŃCUCHY gałęzi,
// gdzie każdy POJEDYNCZY hop mógłby przypadkiem ominąć inwariant 1, gdyby
// ktoś kiedyś rozluźnił jego zakres).
// ---------------------------------------------------------------------------
function crossVoltageConductorViolations(graph: TerminalGraph): InvariantViolation[] {
  const componentOf = nonTransformerComponents(graph);
  const busesByComponent = new Map<number, string[]>();
  for (const [busRef, componentId] of componentOf) {
    (busesByComponent.get(componentId) ?? busesByComponent.set(componentId, []).get(componentId)!).push(busRef);
  }
  const violations: InvariantViolation[] = [];
  for (const busRefs of busesByComponent.values()) {
    const levelIds = new Set(busRefs.map((ref) => graph.nodes.get(ref)!.voltageLevelId));
    if (levelIds.size > 1) {
      violations.push({
        code: 'CROSS_VOLTAGE_CONDUCTOR',
        messagePl:
          `Składowa spójności grafu bez transformatorów obejmuje ${levelIds.size} różne domeny ` +
          `napięciowe (szyny: ${busRefs.join(', ')}) — istnieje ścieżka przewodząca między domenami ` +
          'z pominięciem transformatora/konwertera.',
        elementRefs: busRefs,
      });
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Inwariant 7 — no unresolved active apparatus.
// Wewnątrz domeny nN (obie szyny gałęzi ≤ 1 kV — próg celowo ograniczony do
// nN, patrz `LV_DOMAIN_MAX_KV`: klasyfikacja niżej mirroruje
// `ui/sld/v2/canvas/enmToSldAdapter.ts::resolveNnFeederApparatus`, schemat
// namespace/materialized_params WŁAŚCIWY WYŁĄCZNIE aparaturze nN — na
// aparaturze SN dałby fałszywe alarmy, bo SN używa INNEGO schematu katalogu
// `APARAT_SN`; ZAMIERZONA, NIEZALEŻNA reimplementacja, nie import z v2 —
// `ui/sld/v3/electrical` nie może zależeć od `ui/sld/v2` (warstwy wersji),
// więc jest to bounded, uzasadniony wyjątek od reguły „reużycie zamiast
// duplikacji"), gałąź typu switch/breaker/fuse musi rozstrzygać się do
// znanego rodzaju aparatu (MCB/rozłącznik bezpiecznikowy). Gdy dane
// katalogowe/materializowane NIE pozwalają rozstrzygnąć rodzaju, a gałąź
// jest AKTYWNA (`status==='closed'` — w torze), to HARD ERROR (plan: „nigdy
// element w aktywnym torze").
// ---------------------------------------------------------------------------
type NnApparatusResolution = 'MCB' | 'FUSE_SWITCH' | 'UNRESOLVED' | null;

function resolveNnApparatusKind(edge: ConductingEdge): NnApparatusResolution {
  if (edge.kind === 'fuse') return 'FUSE_SWITCH'; // fakt domenowy z typu gałęzi (jak w v2).
  if (edge.kind !== 'switch' && edge.kind !== 'breaker') return null; // nie jest "aparatem odpływu" w tym sensie (np. kabel/linia).
  if (edge.catalogNamespace === 'APARAT_NN_MCB') return 'MCB';
  const deviceKind = readMaterializedString(edge, 'device_kind');
  if (deviceKind === 'WYLACZNIK_GLOWNY' || deviceKind === 'WYLACZNIK_ODPLYWOWY') return 'MCB';
  if (deviceKind === 'ROZLACZNIK_BEZPIECZNIKOWY') return 'FUSE_SWITCH';
  return 'UNRESOLVED';
}

function unresolvedActiveApparatusViolations(graph: TerminalGraph): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  for (const edge of graph.edges) {
    const fromKv = busVoltageKv(graph, edge.fromBusRef);
    const toKv = busVoltageKv(graph, edge.toBusRef);
    if (fromKv === null || toKv === null || !isLvKv(fromKv) || !isLvKv(toKv)) continue; // poza domeną nN.
    if (edge.status !== 'closed') continue; // nieaktywny tor — plan: „nigdy element W AKTYWNYM torze".
    if (resolveNnApparatusKind(edge) === 'UNRESOLVED') {
      violations.push({
        code: 'UNRESOLVED_ACTIVE_APPARATUS',
        messagePl:
          `Gałąź „${edge.name}" (${edge.ref}) w aktywnym torze nN niesie aparat (switch/breaker), ` +
          'którego rodzaju katalog nie rozpoznaje (brak kategorii katalogu/device_kind rozpoznawalnego) — ' +
          'model niekompletny, SLD INVALID.',
        elementRefs: [edge.ref],
      });
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Inwarianty 8-9 — no LV feeder on MV bus / no MV field on LV bus.
// Sprawdzenie SYMETRYCZNE, NAMESPACE-STEROWANE (nie po `type` gałęzi — `type
// ==='fuse'` samo w sobie NIE jest sygnałem domeny: bezpieczniki istnieją i
// w SN, i w nN; namespace katalogu (`APARAT_NN_*`/`APARAT_SN`) jest jedynym
// jednoznacznym, zadeklarowanym sygnałem klasy aparatu — użycie `type` tutaj
// dawałoby fałszywe alarmy na bezpiecznikach SN, dokładnie klasa błędu, przed
// którą ostrzega `CLAUDE.md` „Reguła KLASA, NIE INSTANCJA"): aparat
// zadeklarowany jako klasa nN (`APARAT_NN_*`) nie może dotykać szyny SN i na
// odwrót dla klasy SN (`APARAT_SN`) i szyny nN.
// ---------------------------------------------------------------------------
function isNnClassApparatus(edge: ConductingEdge): boolean {
  return edge.catalogNamespace != null && edge.catalogNamespace.startsWith('APARAT_NN');
}

function isMvClassApparatus(edge: ConductingEdge): boolean {
  return edge.catalogNamespace === 'APARAT_SN';
}

function lvFeederOnMvBusViolations(graph: TerminalGraph): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  for (const edge of graph.edges) {
    if (!isNnClassApparatus(edge)) continue;
    const fromKv = busVoltageKv(graph, edge.fromBusRef);
    const toKv = busVoltageKv(graph, edge.toBusRef);
    if (fromKv !== null && !isLvKv(fromKv)) {
      violations.push({
        code: 'LV_FEEDER_ON_MV_BUS',
        messagePl: `Aparat klasy nN „${edge.name}" (${edge.ref}) dotyka szyny SN „${edge.fromBusRef}" (${fromKv} kV).`,
        elementRefs: [edge.ref, edge.fromBusRef],
      });
    }
    if (toKv !== null && !isLvKv(toKv)) {
      violations.push({
        code: 'LV_FEEDER_ON_MV_BUS',
        messagePl: `Aparat klasy nN „${edge.name}" (${edge.ref}) dotyka szyny SN „${edge.toBusRef}" (${toKv} kV).`,
        elementRefs: [edge.ref, edge.toBusRef],
      });
    }
  }
  return violations;
}

function mvFieldOnLvBusViolations(graph: TerminalGraph): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  for (const edge of graph.edges) {
    if (!isMvClassApparatus(edge)) continue;
    const fromKv = busVoltageKv(graph, edge.fromBusRef);
    const toKv = busVoltageKv(graph, edge.toBusRef);
    if (fromKv !== null && isLvKv(fromKv)) {
      violations.push({
        code: 'MV_FIELD_ON_LV_BUS',
        messagePl: `Aparat klasy SN „${edge.name}" (${edge.ref}) dotyka szyny nN „${edge.fromBusRef}" (${fromKv} kV).`,
        elementRefs: [edge.ref, edge.fromBusRef],
      });
    }
    if (toKv !== null && isLvKv(toKv)) {
      violations.push({
        code: 'MV_FIELD_ON_LV_BUS',
        messagePl: `Aparat klasy SN „${edge.name}" (${edge.ref}) dotyka szyny nN „${edge.toBusRef}" (${toKv} kV).`,
        elementRefs: [edge.ref, edge.toBusRef],
      });
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Agregacja — komplet 9 inwariantów.
// ---------------------------------------------------------------------------
export function validateElectricalGraph(graph: TerminalGraph): GraphValidationResult {
  const violations: InvariantViolation[] = [
    ...edgeVoltageCompatibilityViolations(graph), // 1
    ...transformerVoltageBoundaryViolations(graph), // 2
    ...busVoltageConsistencyViolations(graph), // 3
    ...deviceTerminalConsistencyViolations(graph), // 4
    ...danglingEnergizedTerminalViolations(graph), // 5
    ...crossVoltageConductorViolations(graph), // 6
    ...unresolvedActiveApparatusViolations(graph), // 7
    ...lvFeederOnMvBusViolations(graph), // 8
    ...mvFieldOnLvBusViolations(graph), // 9
  ];
  return { status: violations.length === 0 ? 'SLD_VALID' : 'SLD_INVALID', violations };
}
