/**
 * SLD-nN-TOPOLOGIA T0→T1 (`docs/nn/PLAN_SLD_NN_TOPOLOGIA_2026-08.md` §0.4) —
 * WYROCZNIA ZGODNOŚCI SCENY. Buduje scenę Stacji B DZISIEJSZYM pipeline
 * (`buildSceneV3` — ENM → scena, TA SAMA funkcja co
 * `scene/__tests__/buildScene.nnBoard.test.ts`), wyekstrahowuje krawędzie
 * przewodzące (`PreviewSegment` z `meta.kind` ∈ klasy toru mocy) i sprawdza:
 * KAŻDA krawędź sceny odpowiada krawędzi grafu elektrycznego
 * (`electrical/terminalGraph.ts`) LUB jest czysto dekoracyjna (jawna lista
 * wyjątków z uzasadnieniem, `DECORATIVE_OWNER_REF_PATTERNS` niżej).
 *
 * TYLKO ODCZYT `scene/buildScene.ts` — ZERO zmian w compose/scene (karta
 * §Zakazy). Struktura sceny (jakie sufiksy `ownerRef` istnieją, jakie `kind`/
 * `elementKind` dostają) jest ZMIERZONA (nie zgadnięta) uruchomieniem
 * `buildSceneV3` na fixturze Stacja B i odczytem `scene.segments` —
 * dowód/metoda opisane w meldunku karty T0.
 *
 * FLIP T1 (karta T1, §0 pkt 4): NA T0 część wyroczni BYŁA czerwona — DOWÓD
 * DEFEKTU zgodny z werdyktem B-02 („dolna linia to artefakt layoutu, nie
 * szyna 0,4 kV"), oznaczony `it.fails(...)`. Po T1 (`scene/buildScene.ts`
 * `classifyStationSegmentKind` czyta domenę Z GRAFU zamiast heurystyki
 * pozycji — patrz `docs/nn/PLAN_SLD_NN_TOPOLOGIA_2026-08.md` §0 pkt 2) obie
 * asercje są ZIELONE Z KONSTRUKCJI — `it.fails`→`it`, ZAPADKA: żadna
 * przyszła zmiana `compose/`/`scene/` nie może już cofnąć tego dowodu bez
 * czerwonego CI. Gdyby wyrocznia okazała się NIESPODZIEWANIE zielona bez
 * powodu, trzeba by się zatrzymać i sprawdzić, czy naprawdę mierzy
 * przewodzenie (pusta lista = pusta wyrocznia = fałszywa zieleń) — po
 * zmierzeniu na REALNEJ scenie (25 krawędzi przewodzących, patrz Check B)
 * wyrocznia NIE jest pusta.
 */
import { describe, expect, it } from 'vitest';

import { buildSceneV3, sceneConnectivityIndex, type PreviewSegment, type SceneV3 } from '../../scene/buildScene';
import { buildTerminalGraph } from '../terminalGraph';
import { buildStacjaBFixture, STACJA_B_REFS } from './fixtures/stacjaB';

const enm = buildStacjaBFixture();
const scene: SceneV3 = buildSceneV3(enm, 2);
const graph = buildTerminalGraph(enm);

/** Klasy `meta.kind` odpowiadające TOROWI MOCY (zgodnie z definicją samego
 *  `scene/buildScene.ts` — `PreviewSegmentKind` w `compose/preview.tsx`, oraz
 *  `isAnnotationSegment` w `sceneConnectivityIndex` niżej). Wyłączone z tej
 *  klasy — WARSTWA ADNOTACJI, udokumentowana WPROST w `compose/preview.tsx`
 *  i `scene/buildScene.ts::sceneConnectivityIndex`:
 *   - `leader`      — łącznik etykiety z właścicielem (nie tor mocy);
 *   - `protectionTrip`/`measurementLink` — obwód wtórny (zabezpieczenia/
 *     pomiar), JAWNIE wyłączony z ciągłości toru mocy w
 *     `sceneConnectivityIndex` (komentarz F9.9/F10.5 w `buildScene.ts`);
 *   - `openTerminal`  — marker KOŃCA otwartego ciągu (kreska prostopadła
 *     narysowana NA istniejącym torze, nie osobne połączenie — `compose/
 *     preview.tsx` §16-v3);
 *   - `sheetContinuation` — grot kontynuacji na złamaniu arkusza, marker
 *     czytelności NA torze `snTrunk`, „sam tor zachowuje klasę snTrunk"
 *     (`compose/preview.tsx` S9-1) — tor sam jest już policzony pod swoją
 *     WŁASNĄ klasą (`snTrunk`), ten marker jest DODATKOWĄ, czysto wizualną
 *     adnotacją nad nim. */
const CONDUCTING_KINDS = new Set(['bus', 'busGpz', 'sn', 'snTrunk', 'lv']);

function conductingSegments(): readonly PreviewSegment[] {
  return scene.segments.filter((s) => CONDUCTING_KINDS.has(s.meta?.kind ?? ''));
}

describe('WYROCZNIA — wyrocznia mierzy coś realnego (kontrola przed dowodem defektu)', () => {
  it('scena Stacji B ma NIEZEROWĄ liczbę segmentów przewodzących (pusta lista = pusta wyrocznia = fałszywa zieleń)', () => {
    const segments = conductingSegments();
    expect(segments.length).toBeGreaterThan(0);
    // Zmierzone na tej fixturze: 25 segmentów klasy toru mocy (LOD2) — patrz
    // meldunek karty T0. Asercja na PROGU (nie dokładnej liczbie), żeby drobne
    // zmiany geometrii T1+ nie psuły tego testu kontrolnego bez potrzeby.
    expect(segments.length).toBeGreaterThanOrEqual(20);
  });

  it('scena Stacji B niesie OBIE domeny napięciowe (SN i nN) — dowód, że test w ogóle mógłby wykryć pomieszanie domen', () => {
    const mvBuses = [...graph.nodes.values()].filter((n) => n.voltageKv > 1);
    const lvBuses = [...graph.nodes.values()].filter((n) => n.voltageKv <= 1);
    expect(mvBuses.length).toBeGreaterThan(0);
    expect(lvBuses.length).toBeGreaterThan(0);
  });
});

describe('Check A — DOWÓD DEFEKTU B-02: krawędzie sceny z DOSŁOWNYM ref gałęzi ENM muszą mieć kind zgodny z domeną grafu', () => {
  // `graph.edges[].ref` = `Branch.ref_id` (literał ENM, bez sufiksu `#…`).
  // Gdy scena rysuje segment, którego `ownerRef` jest DOKŁADNIE tym refem
  // (nie kompozytem stacji/sekcji), to ten segment reprezentuje TĘ gałąź —
  // jego `kind` MUSI być spójny z domeną napięciową gałęzi w grafie
  // elektrycznym: domena nN (`voltage_kv` ≤ 1 kV po obu końcach) ⇒
  // `kind==='lv'`; domena SN/WN ⇒ `kind` INNY niż `'lv'`.
  const edgeByRef = new Map(graph.edges.map((e) => [e.ref, e] as const));

  const literalEdgeSegments = conductingSegments()
    .filter((s) => s.meta?.ownerRef != null && edgeByRef.has(s.meta.ownerRef))
    .map((s) => ({ segment: s, edge: edgeByRef.get(s.meta!.ownerRef!)! }));

  it('kontrola: fixtura Stacja B produkuje ≥3 segmenty z dosłownym ref gałęzi ENM (wyrocznia mierzy coś realnego)', () => {
    expect(literalEdgeSegments.length).toBeGreaterThanOrEqual(3);
  });

  it('FLIP T1 (dowód defektu B-02 naprawiony — ZAPADKA): KAŻDY taki segment ma kind zgodny z domeną grafu (QF-TR1/QF-01/QF-02/QF-03 dostają kind="lv", zgodnie z domeną nN)', () => {
    for (const { segment, edge } of literalEdgeSegments) {
      const fromNode = graph.nodes.get(edge.fromBusRef)!;
      const edgeIsLv = fromNode.voltageKv <= 1;
      const segmentDeclaresLv = segment.meta?.kind === 'lv';
      expect(segmentDeclaresLv, `gałąź ${edge.ref} (domena ${fromNode.voltageKv} kV) ma scenowy kind="${segment.meta?.kind}"`).toBe(edgeIsLv);
    }
  });
});

describe('Check A2 — DOWÓD DEFEKTU B-02: DWIE strukturalnie identyczne szyny stacji (SN i nN) muszą dostać TĘ SAMĄ klasyfikację "to jest szyna"', () => {
  // `#sn-bus` i `#lv-bus` są ZBUDOWANE tym samym wzorcem w `compose/
  // station.ts` (`ownerRef: `${station.id}#sn-bus`` / `#lv-bus`` — linia
  // pozioma, do której dotykają porty WIELU pól/odpływów tej samej stacji) —
  // ta sama rola strukturalna, dwie różne domeny. `#hv-bus` (GPZ, `compose/
  // gpz.ts`) i `#bus-primary` (sekcja GPZ) są TĄ SAMĄ rodziną wzorca
  // (potwierdzone: `grep -n "ownerRef.*#.*-bus" compose/station.ts
  // compose/gpz.ts`).
  const BUSBAR_OWNER_REF_SUFFIXES = ['#sn-bus', '#lv-bus', '#hv-bus', '#bus-primary'] as const;

  function busbarSegments(): readonly PreviewSegment[] {
    return conductingSegments().filter((s) =>
      BUSBAR_OWNER_REF_SUFFIXES.some((suffix) => s.meta?.ownerRef?.endsWith(suffix)),
    );
  }

  it('kontrola: fixtura Stacja B produkuje segmenty szynowe dla WSZYSTKICH czterech wzorców (sn-bus, lv-bus, hv-bus, bus-primary)', () => {
    const found = new Set(
      busbarSegments()
        .map((s) => BUSBAR_OWNER_REF_SUFFIXES.find((suffix) => s.meta?.ownerRef?.endsWith(suffix)))
        .filter((x): x is (typeof BUSBAR_OWNER_REF_SUFFIXES)[number] => x != null),
    );
    expect(found.size).toBe(BUSBAR_OWNER_REF_SUFFIXES.length);
  });

  it('FLIP T1 (dowód defektu B-02 naprawiony — ZAPADKA): KAŻDY segment szynowy ma elementKind="bus" (#lv-bus dostaje TERAZ elementKind="bus", symetrycznie z #sn-bus/#hv-bus/#bus-primary)', () => {
    for (const segment of busbarSegments()) {
      expect(segment.meta?.elementKind, `${segment.meta?.ownerRef} ma elementKind="${segment.meta?.elementKind}"`).toBe('bus');
    }
  });

  it('DOWÓD BEZPOŚREDNI (bez pętli, dla czytelności meldunku): #sn-bus I #lv-bus TEJ SAMEJ stacji są OBIE kind="bus"/elementKind="bus" — symetria naprawiona T1 (przed T1: #lv-bus miała kind="lv"/elementKind="segment", asymetria zmierzona w T0)', () => {
    const snBusSeg = scene.segments.find((s) => s.meta?.ownerRef === `${STACJA_B_REFS.stationRef}#sn-bus`);
    const lvBusSeg = scene.segments.find((s) => s.meta?.ownerRef === `${STACJA_B_REFS.stationRef}#lv-bus`);
    expect(snBusSeg?.meta?.kind).toBe('bus');
    expect(snBusSeg?.meta?.elementKind).toBe('bus');
    expect(lvBusSeg?.meta?.kind).toBe('bus');
    expect(lvBusSeg?.meta?.elementKind).toBe('bus');
  });
});

describe('Check B — KOMPLETNOŚĆ: każda krawędź przewodząca sceny jest (a) dosłowną gałęzią ENM, (b) znaną szyną, LUB (c) dekoracją z uzasadnieniem', () => {
  const edgeByRef = new Map(graph.edges.map((e) => [e.ref, e] as const));
  const BUSBAR_OWNER_REF_SUFFIXES = ['#sn-bus', '#lv-bus', '#hv-bus', '#bus-primary'] as const;

  /**
   * Jawna lista wyjątków z uzasadnieniem (karta §0.4). KAŻDY wzorzec
   * odpowiada łącznikowi PORTU symbolu z torem/szyną, dla którego ENM NIE
   * modeluje osobnej gałęzi (port aparatu → własna szyna zbiorcza pola/
   * stacji; głowica kabla/wyprowadzenie transformatora → jego WŁASNY,
   * jedyny bus_ref) — zmierzone czytaniem `compose/station.ts`/`compose/
   * gpz.ts` (cytaty w uzasadnieniu), NIE zgadnięte.
   */
  const DECORATIVE_OWNER_REF_PATTERNS: ReadonlyArray<{ readonly match: (ownerRef: string) => boolean; readonly justification: string }> = [
    {
      match: (r) => r.includes('#lateral-'),
      justification: 'odnoga stosu aparatów pola do jego własnej osi — compose/station.ts buildBayStack / compose/gpz.ts field lateral (port symbolu, nie gałąź ENM).',
    },
    {
      match: (r) => r.endsWith('#descent'),
      justification: 'zejście z magistrali/szyny do GÓRNEGO portu pierwszego aparatu stosu pola — compose/station.ts/gpz.ts (port, nie gałąź ENM).',
    },
    {
      match: (r) => r.includes('#tee-'),
      justification: 'punkt odgałęzienia NA JUŻ sklasyfikowanym odcinku szyny/magistrali (podział geometryczny tego samego toru, nie nowe połączenie) — compose/station.ts `#lv-bus#tee-N`, scene/buildScene.ts `#…#tee-N` dla segment_L/section#bus-primary.',
    },
    {
      match: (r) => r.endsWith('#hv-connector') || r.endsWith('#hv-field-to-tr') || r.endsWith('#field-anchor') || r.endsWith('#tr-field-to-bus') || /#tr-field-lateral-\d+$/.test(r),
      justification: 'łączniki WEWNĘTRZNE toru transformatora GPZ (port uzwojenia HV → pole → szyna) — compose/gpz.ts, transformator ma JEDEN hv_bus_ref/lv_bus_ref w ENM, nie osobne gałęzie dla każdego odcinka rysunku.',
    },
    {
      match: (r) => r.endsWith('#grid-source-drop'),
      justification: 'zejście z portu symbolu źródła sieciowego (gridSource) do jego bus_ref — Source ENM ma JEDEN bus_ref, nie osobną gałąź do szyny.',
    },
    {
      match: (r) => r.endsWith('#source-bus-extension'),
      justification: 'przedłużenie szyny WN pod symbol źródła (rezerwacja miejsca rysunkowego) — compose/gpz.ts, nie odpowiada żadnej gałęzi ENM.',
    },
    {
      match: (r) => r.includes('#lv-drop-'),
      justification: 'zejście z portu LV transformatora stacji do linii `#lv-bus` — Transformer ENM ma JEDEN lv_bus_ref, port→szyna nie jest osobną gałęzią.',
    },
    {
      match: (r) => r.endsWith('#board-descent'),
      justification: 'łącznik APARATU odpływu z liściem podrozdzielnicy (nnDistributionBoard) — geometria portu, gałąź RZECZYWISTA (aparat) jest już policzona osobno jako dosłowny ref (Check A).',
    },
  ];

  interface Classification {
    readonly segment: PreviewSegment;
    readonly bucket: 'literal-edge' | 'busbar' | 'decorative' | 'UNCLASSIFIED';
  }

  function classify(segment: PreviewSegment): Classification {
    const ownerRef = segment.meta?.ownerRef;
    if (ownerRef != null && edgeByRef.has(ownerRef)) return { segment, bucket: 'literal-edge' };
    if (ownerRef != null && BUSBAR_OWNER_REF_SUFFIXES.some((suffix) => ownerRef.endsWith(suffix))) {
      return { segment, bucket: 'busbar' };
    }
    if (ownerRef != null && DECORATIVE_OWNER_REF_PATTERNS.some((p) => p.match(ownerRef))) {
      return { segment, bucket: 'decorative' };
    }
    return { segment, bucket: 'UNCLASSIFIED' };
  }

  const classifications = conductingSegments().map(classify);

  it('WSZYSTKIE segmenty przewodzące sceny Stacji B są sklasyfikowane (zero UNCLASSIFIED) — kompletność wyroczni', () => {
    const unclassified = classifications.filter((c) => c.bucket === 'UNCLASSIFIED');
    expect(
      unclassified.map((c) => c.segment.meta?.ownerRef),
      'segmenty bez klasyfikacji — dopisz wzorzec do BUSBAR_OWNER_REF_SUFFIXES/DECORATIVE_OWNER_REF_PATTERNS z uzasadnieniem albo do literalnych gałęzi grafu',
    ).toEqual([]);
  });

  it('rozkład klasyfikacji: literal-edge ≥3, busbar =4, decorative ≥10 (kontrola progu — dowód nietrywialności wyroczni)', () => {
    const counts = { 'literal-edge': 0, busbar: 0, decorative: 0, UNCLASSIFIED: 0 } as Record<Classification['bucket'], number>;
    for (const c of classifications) counts[c.bucket]++;
    expect(counts['literal-edge']).toBeGreaterThanOrEqual(3);
    expect(counts.busbar).toBe(4);
    expect(counts.decorative).toBeGreaterThanOrEqual(10);
  });
});

describe('Check C — T1 (karta T1, §0 pkt 4 „odstępstwo #4 z T0"): sceneConnectivityIndex SPÓJNA z domenami grafu dla WSZYSTKICH elementów nN', () => {
  // Odstępstwo #4 z T0 (karta T0 „USTALENIA T0", defekt (d)): „kable
  // odpływów (nn_qf01_cable itd.) NIE mają żadnej reprezentacji w scenie —
  // kompozycja rysuje tylko pierwszy aparat odpływu". Check A/B (wyżej)
  // dowodzą TYLKO, że segmenty, które ISTNIEJĄ, mają poprawny `kind`/
  // klasyfikację — NIE dowodzą, że kable FAKTYCZNIE dotykają reszty toru
  // (można by narysować segment z poprawnym `kind`, który przez błąd
  // współrzędnych WISI w powietrzu, niepołączony). Check C zamyka TĘ lukę:
  // `sceneConnectivityIndex` (Union-Find po DOTYKU geometrycznym,
  // `scene/buildScene.ts`) musi umieścić szynę nN, aparat główny (incomer)
  // i KAŻDY kabel odpływu w JEDNEJ składowej spójności — to jest dowód
  // GEOMETRYCZNY (nie tylko etykietowy) ciągłości toru T1→…→odbiór.
  const connectivity = sceneConnectivityIndex(scene);

  function segmentIndexByOwnerRef(ownerRef: string): number {
    const idx = scene.segments.findIndex((s) => s.meta?.ownerRef === ownerRef);
    if (idx < 0) throw new Error(`segment „${ownerRef}" nie istnieje na scenie Stacji B — pomiar błędny`);
    return idx;
  }

  const lvBusOwnerRef = `${STACJA_B_REFS.stationRef}#lv-bus`;

  it('kontrola: szyna nN (#lv-bus) i szyna SN (#sn-bus) ISTNIEJĄ na scenie jako odrębne segmenty (wyrocznia mierzy coś realnego)', () => {
    expect(() => segmentIndexByOwnerRef(lvBusOwnerRef)).not.toThrow();
    expect(() => segmentIndexByOwnerRef(`${STACJA_B_REFS.stationRef}#sn-bus`)).not.toThrow();
  });

  it('szyna nN i KAŻDY kabel odpływu (QF-01/QF-02/QF-03) są w JEDNEJ składowej spójności sceny — dowód GEOMETRYCZNY, że kable naprawdę dotykają toru (odstępstwo #4 z T0 naprawione, nie tylko etykietowo)', () => {
    const lvBusRoot = connectivity.segmentRoot(segmentIndexByOwnerRef(lvBusOwnerRef));
    for (const cableRef of [STACJA_B_REFS.cableQf01Ref, STACJA_B_REFS.cableQf02Ref, STACJA_B_REFS.cableQf03Ref]) {
      const cableRoot = connectivity.segmentRoot(segmentIndexByOwnerRef(cableRef));
      expect(cableRoot, `kabel „${cableRef}" NIE jest w tej samej składowej spójności co szyna nN — geometria nie dotyka`).toBe(lvBusRoot);
    }
  });

  it('szyna nN i aparat GŁÓWNY (QF-TR1, incomer) są w JEDNEJ składowej spójności — incomer naprawdę łączy transformator z szyną, nie tylko wisi obok niej', () => {
    const lvBusRoot = connectivity.segmentRoot(segmentIndexByOwnerRef(lvBusOwnerRef));
    const incomerRoot = connectivity.segmentRoot(segmentIndexByOwnerRef(STACJA_B_REFS.qfTr1Ref));
    expect(incomerRoot).toBe(lvBusRoot);
  });

  it('szyna nN i KAŻDY aparat odpływu (QF-01/QF-02/QF-03) są w JEDNEJ składowej spójności', () => {
    const lvBusRoot = connectivity.segmentRoot(segmentIndexByOwnerRef(lvBusOwnerRef));
    for (const feederRef of [STACJA_B_REFS.qf01Ref, STACJA_B_REFS.qf02Ref, STACJA_B_REFS.qf03Ref]) {
      const feederRoot = connectivity.segmentRoot(segmentIndexByOwnerRef(feederRef));
      expect(feederRoot, `aparat odpływu „${feederRef}" NIE jest w tej samej składowej spójności co szyna nN`).toBe(lvBusRoot);
    }
  });

  it('szyna nN i szyna SN SĄ w jednej składowej sceny (transformator FIZYCZNIE łączy obie strony przez port symbolu) — dowód, że Check C mierzy realną spójność sceny, nie odizolowane wysepki per domena', () => {
    const lvBusRoot = connectivity.segmentRoot(segmentIndexByOwnerRef(lvBusOwnerRef));
    const snBusRoot = connectivity.segmentRoot(segmentIndexByOwnerRef(`${STACJA_B_REFS.stationRef}#sn-bus`));
    expect(snBusRoot).toBe(lvBusRoot);
  });
});
