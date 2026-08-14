/**
 * T5a (KONCEPCJA_LOD_NN_2026-08.md §L1, werdykt właściciela §0 pkt 2/3) —
 * dowód JEDNOSTKOWY budżetu adaptacyjnego kikutów odpływów nN i agregacji
 * per sekcja. Testy PURE (zero DOM/scena) — plan renderowalny per sekcja
 * (`nnSectionAggregationPlan`) i formuła budżetu (`nnSectionFeederBudget`)
 * są funkcjami czystymi wywoływanymi przez `compose/station.ts`/
 * `layout/measure.ts::nnBoardSectionPlans`, ale dowodzone tu NIEZALEŻNIE od
 * pełnego potoku sceny (wzorzec `blokPusty.test.ts` — jednostka NAJPIERW,
 * scena potem).
 */
import { describe, expect, it } from 'vitest';

import type { SldNnFeeder } from '../../../shared/nnBoardTypes';
import {
  isNnFeederAlwaysExplicit,
  isNnFeederCriticalLoad,
  NN_SECTION_MIN_BUDGET,
  NN_SECTION_MIN_FEEDER_PITCH,
  nnSectionAggregationPlan,
  nnSectionFeederBudget,
  type NnAggregatedFeederSlot,
} from '../measure';

function feeder(partial: Partial<SldNnFeeder> & { readonly branchRef: string }): SldNnFeeder {
  return {
    branchRef: partial.branchRef,
    apparatusKind: partial.apparatusKind ?? 'MCB',
    apparatusRef: partial.apparatusRef ?? partial.branchRef,
    apparatusLabel: partial.apparatusLabel ?? 'MCB B16',
    destinationKind: partial.destinationKind ?? 'load',
    destinationRef: partial.destinationRef ?? `${partial.branchRef}#load`,
    destinationLabel: partial.destinationLabel ?? 'Odbiór',
    cableRefs: partial.cableRefs ?? [],
  };
}

// ---------------------------------------------------------------------------
// §1 — nnSectionFeederBudget: formuła adaptacyjna (werdykt §0 pkt 2: „nie
// stała N=8"). Dowód: budżet ROŚNIE z szerokością obwiedni, MALEJE z liczbą
// sekcji, NIGDY nie schodzi poniżej podłogi.
// ---------------------------------------------------------------------------
describe('T5a §1 — nnSectionFeederBudget: budżet ADAPTACYJNY (szerokość/sekcje/pitch), nie stała', () => {
  it('formuła: floor(envelope / sectionCount / NN_SECTION_MIN_FEEDER_PITCH), z podłogą', () => {
    // envelope=480, 1 sekcja, pitch=24 -> 480/1/24 = 20
    expect(nnSectionFeederBudget(480, 1)).toBe(20);
    // ta sama obwiednia podzielona na 2 sekcje -> budżet o połowę mniejszy
    expect(nnSectionFeederBudget(480, 2)).toBe(10);
    // 4 sekcje -> jeszcze mniejszy (dowód: rośnie/maleje, nie stała)
    expect(nnSectionFeederBudget(480, 4)).toBe(5);
  });

  it('POMIAR: stacja WĄSKA (mało pól SN) dostaje MNIEJSZY budżet niż stacja SZEROKA — dowód adaptacyjności na dwóch konkretnych obwiedniach', () => {
    const waskaStacja = nnSectionFeederBudget(120, 1); // np. 1-2 pola SN
    const szerokaStacja = nnSectionFeederBudget(960, 1); // np. wiele pól SN
    expect(waskaStacja).toBeLessThan(szerokaStacja);
    expect(waskaStacja).toBe(5);
    expect(szerokaStacja).toBe(40);
  });

  it('podłoga NN_SECTION_MIN_BUDGET: obwiednia zerowa/ujemna NIGDY nie daje budżetu < podłogi', () => {
    expect(nnSectionFeederBudget(0, 1)).toBe(NN_SECTION_MIN_BUDGET);
    expect(nnSectionFeederBudget(-100, 1)).toBe(NN_SECTION_MIN_BUDGET);
    expect(nnSectionFeederBudget(10, 1)).toBe(NN_SECTION_MIN_BUDGET); // 10/24 < 1 -> podłoga
  });

  it('sectionCount<=0 (dana niekompletna/wejście obronne) -> podłoga, zero dzielenia przez zero', () => {
    expect(nnSectionFeederBudget(480, 0)).toBe(NN_SECTION_MIN_BUDGET);
    expect(nnSectionFeederBudget(480, -1)).toBe(NN_SECTION_MIN_BUDGET);
  });

  it('pitch minimalny jest DODATNI i STAŁY (mianownik formuły, nie zero)', () => {
    expect(NN_SECTION_MIN_FEEDER_PITCH).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// §2 — isNnFeederAlwaysExplicit: lista NIGDY-W-AGREGACIE (werdykt §0 pkt 3).
// Iloczyn cech: KAŻDA kategoria z listy × obecność w wejściu funkcji.
// ---------------------------------------------------------------------------
describe('T5a §2 — isNnFeederAlwaysExplicit: lista NIGDY-W-AGREGACIE przypięta testem (werdykt §0 pkt 3)', () => {
  it('odpływ UNRESOLVED (HARD FAIL strukturalny) -> ZAWSZE jawny', () => {
    const f = feeder({ branchRef: 'unresolved-1', apparatusKind: 'UNRESOLVED' });
    expect(isNnFeederAlwaysExplicit(f)).toBe(true);
  });

  it('odpływ do DER (pokrywa DER/agregat prądotwórczy/UPS — patrz docstring, wszystkie trzy = Generator w ENM) -> ZAWSZE jawny', () => {
    const f = feeder({ branchRef: 'der-1', destinationKind: 'der' });
    expect(isNnFeederAlwaysExplicit(f)).toBe(true);
  });

  it('odbiór krytyczny: luka modelu udokumentowana — predykat DEDYKOWANY istnieje i dziś zwraca false (Load nie niesie flagi krytyczności)', () => {
    const f = feeder({ branchRef: 'load-1', destinationKind: 'load' });
    expect(isNnFeederCriticalLoad(f)).toBe(false);
  });

  it('odpływ ZWYKŁY (MCB do odbioru, rozpoznany aparat) -> AGREGOWALNY (nie jest na liście nigdy-jawnych)', () => {
    const f = feeder({ branchRef: 'normal-1', apparatusKind: 'MCB', destinationKind: 'load' });
    expect(isNnFeederAlwaysExplicit(f)).toBe(false);
  });

  it('odpływ do podrozdzielnicy (board) -> AGREGOWALNY (board nie jest na liście werdyktu)', () => {
    const f = feeder({ branchRef: 'board-1', destinationKind: 'board' });
    expect(isNnFeederAlwaysExplicit(f)).toBe(false);
  });

  it('odpływ z gołym kablem (apparatusKind=null) do odbioru nieznanego -> AGREGOWALNY', () => {
    const f = feeder({ branchRef: 'bare-1', apparatusKind: null, destinationKind: 'unknown' });
    expect(isNnFeederAlwaysExplicit(f)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §3 — nnSectionAggregationPlan: ILOCZYN {budżet × skład zawsze-jawnych ×
// agregowalnych}. Dowód formalny (nie tylko przykład z karty).
// ---------------------------------------------------------------------------
describe('T5a §3 — nnSectionAggregationPlan: kikuty jawne + agregat, budżet respektowany, nigdy-jawne NIGDY ukryte', () => {
  function hiddenOf(slots: readonly NnAggregatedFeederSlot[]): readonly SldNnFeeder[] {
    const agg = slots.find((s) => s.kind === 'aggregate');
    return agg && agg.kind === 'aggregate' ? agg.hidden : [];
  }
  function explicitFeederRefs(slots: readonly NnAggregatedFeederSlot[]): readonly string[] {
    return slots.filter((s): s is Extract<NnAggregatedFeederSlot, { kind: 'feeder' }> => s.kind === 'feeder')
      .map((s) => s.feeder.branchRef);
  }

  it('wszystkie odpływy mieszczą się w budżecie -> ZERO agregacji (wszystko jawne, kolejność zachowana)', () => {
    const feeders = [feeder({ branchRef: 'a' }), feeder({ branchRef: 'b' }), feeder({ branchRef: 'c' })];
    const plan = nnSectionAggregationPlan(feeders, 5);
    expect(plan.every((s) => s.kind === 'feeder')).toBe(true);
    expect(explicitFeederRefs(plan)).toEqual(['a', 'b', 'c']);
  });

  it('budżet DOKŁADNIE wystarczający (feeders.length === budget) -> ZERO agregatu-z-jednego (dowód przeciw off-by-one)', () => {
    const feeders = Array.from({ length: 6 }, (_, i) => feeder({ branchRef: `f${i}` }));
    const plan = nnSectionAggregationPlan(feeders, 6);
    expect(plan.filter((s) => s.kind === 'aggregate')).toEqual([]);
    expect(plan).toHaveLength(6);
  });

  it('budżet przekroczony o WIĘCEJ niż jeden -> agregat zajmuje JEDEN slot, nadmiar w środku ukryty', () => {
    // 8 odpływów zwykłych, budżet 5: 4 jawne + 1 agregat(4 ukryte) = 5 slotów.
    const feeders = Array.from({ length: 8 }, (_, i) => feeder({ branchRef: `f${i}` }));
    const plan = nnSectionAggregationPlan(feeders, 5);
    expect(plan).toHaveLength(5);
    expect(plan.filter((s) => s.kind === 'aggregate')).toHaveLength(1);
    expect(explicitFeederRefs(plan)).toEqual(['f0', 'f1', 'f2', 'f3']);
    expect(hiddenOf(plan).map((f) => f.branchRef)).toEqual(['f4', 'f5', 'f6', 'f7']);
  });

  it('agregat zawsze na KOŃCU listy slotów (pozycja stała, deterministyczna)', () => {
    const feeders = Array.from({ length: 10 }, (_, i) => feeder({ branchRef: `f${i}` }));
    const plan = nnSectionAggregationPlan(feeders, 3);
    expect(plan[plan.length - 1].kind).toBe('aggregate');
    expect(plan.slice(0, -1).every((s) => s.kind === 'feeder')).toBe(true);
  });

  it('ILOCZYN CECH: nigdy-jawne (UNRESOLVED + DER) WMIESZANE między agregowalne, budżet ciasny -> OBA nigdy-jawne zostają jawne, agregat zbiera TYLKO agregowalne', () => {
    const feeders = [
      feeder({ branchRef: 'n0' }),
      feeder({ branchRef: 'n1' }),
      feeder({ branchRef: 'HARDFAIL', apparatusKind: 'UNRESOLVED' }),
      feeder({ branchRef: 'n2' }),
      feeder({ branchRef: 'DER1', destinationKind: 'der' }),
      feeder({ branchRef: 'n3' }),
      feeder({ branchRef: 'n4' }),
    ];
    // budżet 3: 2 nigdy-jawne (HARDFAIL, DER1) + 1 agregowalny jawny + reszta agregowalnych do agregatu.
    const plan = nnSectionAggregationPlan(feeders, 3);
    const explicitRefs = explicitFeederRefs(plan);
    expect(explicitRefs).toContain('HARDFAIL');
    expect(explicitRefs).toContain('DER1');
    const hiddenRefs = hiddenOf(plan).map((f) => f.branchRef);
    expect(hiddenRefs).not.toContain('HARDFAIL');
    expect(hiddenRefs).not.toContain('DER1');
    // dowód nietrywialności: agregat FAKTYCZNIE coś ukrywa na tej fixturze.
    expect(hiddenRefs.length).toBeGreaterThan(0);
  });

  it('nigdy-jawne SAME przekraczają budżet -> budżet LEGALNIE przekroczony (priorytet bezwzględny reguły „nigdy w agregacie" nad liczbą, werdykt)', () => {
    const feeders = [
      feeder({ branchRef: 'h0', apparatusKind: 'UNRESOLVED' }),
      feeder({ branchRef: 'h1', apparatusKind: 'UNRESOLVED' }),
      feeder({ branchRef: 'h2', apparatusKind: 'UNRESOLVED' }),
    ];
    const plan = nnSectionAggregationPlan(feeders, 1); // budżet 1, ale 3 nigdy-jawne
    expect(plan).toHaveLength(3);
    expect(plan.every((s) => s.kind === 'feeder')).toBe(true);
    expect(explicitFeederRefs(plan)).toEqual(['h0', 'h1', 'h2']);
  });

  it('brak odpływów agregowalnych, tylko nigdy-jawne w nadmiarze -> ZERO agregatu spurious (nic do ukrycia)', () => {
    const feeders = [
      feeder({ branchRef: 'd0', destinationKind: 'der' }),
      feeder({ branchRef: 'd1', destinationKind: 'der' }),
    ];
    const plan = nnSectionAggregationPlan(feeders, 1);
    expect(plan.filter((s) => s.kind === 'aggregate')).toEqual([]);
  });

  it('pusta lista odpływów -> pusty plan (zero zmian geometrii dla sekcji bez odpływów)', () => {
    expect(nnSectionAggregationPlan([], 5)).toEqual([]);
  });

  it('determinizm: to samo wejście (klony) -> identyczny plan (zero stanu ukrytego)', () => {
    const feeders = Array.from({ length: 9 }, (_, i) => feeder({ branchRef: `f${i}` }));
    const clone1 = JSON.parse(JSON.stringify(feeders)) as SldNnFeeder[];
    const clone2 = JSON.parse(JSON.stringify(feeders)) as SldNnFeeder[];
    const plan1 = nnSectionAggregationPlan(clone1, 4);
    const plan2 = nnSectionAggregationPlan(clone2, 4);
    expect(plan1).toEqual(plan2);
  });
});
