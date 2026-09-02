/**
 * KOMPOZYTOR SCENY nN — geometria z ról i stanów backendu (§1/§5/§7/§8/§10/
 * §11/§31): dwa kikuty na aparat (każdy w stanie SWOJEGO zacisku), sprzęgło
 * jako aparat między sekcjami, jedna kotwica SN na system, sloty rastrowane,
 * zero BFS po stronie klienta, determinizm.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { composeLvDomainScene, type LvDomainScene } from '../composeLvDomainScene';
import { scenariusz, SCENARIUSZE_NN, SLUGI_SCENARIUSZY } from '../fixtures/scenariusze';
import { RASTER, TOKENY_GEOMETRII } from '../visualGrammar';
import type { LvDomainProjectionV1 } from '../types';

function scena(p: LvDomainProjectionV1): LvDomainScene {
  return composeLvDomainScene(p.graph, p.upstream_equivalents);
}

function edge(s: LvDomainScene, ref: string) {
  const e = s.edges.find((x) => x.ref === ref);
  if (!e) throw new Error(`brak krawędzi ${ref}`);
  return e;
}

function node(s: LvDomainScene, ref: string) {
  const n = s.nodes.find((x) => x.ref === ref);
  if (!n) throw new Error(`brak węzła ${ref}`);
  return n;
}

describe('Aparat = DWA kikuty w stanach własnych zacisków (§5) — iloczyn: rola × stan łącznika × strona', () => {
  it('[11] QF-B3 OTWARTY: strona A zasilona z sieci (wyspa 1), strona B zasilona z magazynu (wyspa 2) — oba kikuty ENERGIZED, różne wyspy', () => {
    const s = scena(scenariusz('11_double_sided_open'));
    const a = edge(s, 'QF-B3#a');
    const b = edge(s, 'QF-B3#b');
    expect(a.meta?.energization).toBe('ENERGIZED');
    expect(b.meta?.energization).toBe('ENERGIZED');
    expect(a.meta?.islandRef).toBe('island-1');
    expect(b.meta?.islandRef).toBe('island-2');
    expect(a.meta?.connectivity).toBe('OPEN');
    expect(node(s, 'QF-B3').meta?.deviceState).toBe('OPEN');
  });

  it('[10] QF-TB OTWARTY: zacisk TR zasilony, szyna RGnN-B bez napięcia — kikut A ENERGIZED, kikut B DEENERGIZED', () => {
    const s = scena(scenariusz('10_deenergized_section'));
    expect(edge(s, 'QF-TB#a').meta?.energization).toBe('ENERGIZED');
    expect(edge(s, 'QF-TB#b').meta?.energization).toBe('DEENERGIZED');
    expect(node(s, 'RGnN-B').meta?.energization).toBe('DEENERGIZED');
    // Odpływy sekcji bez napięcia: oba kikuty każdego aparatu bez napięcia.
    for (const ref of ['FU-B2', 'QF-B1']) {
      expect(edge(s, `${ref}#a`).meta?.energization, ref).toBe('DEENERGIZED');
      expect(edge(s, `${ref}#b`).meta?.energization, ref).toBe('DEENERGIZED');
    }
  });

  it('[02]/[03] sprzęgło QBC: aparat POZIOMY między sekcjami z dwoma kikutami; otwarte → kikuty z różnych źródeł, zamknięte → MULTISOURCE', () => {
    const otwarte = scena(scenariusz('02_two_tr_qbc_open'));
    const qbc = node(otwarte, 'QBC');
    expect(qbc.kind).toBe('apparatus');
    expect(qbc.meta?.role).toBe('coupler');
    expect(qbc.meta?.horizontal).toBe(true);
    expect(qbc.meta?.designation).toBe('QBC');
    expect(edge(otwarte, 'QBC#a').y1).toBe(edge(otwarte, 'QBC#b').y2);
    expect((edge(otwarte, 'QBC#a').meta?.supplyRefs as string[])).toEqual(['TA']);
    expect((edge(otwarte, 'QBC#b').meta?.supplyRefs as string[])).toEqual(['TB']);
    const zamkniete = scena(scenariusz('03_two_tr_qbc_closed'));
    expect(edge(zamkniete, 'QBC#a').meta?.energization).toBe('MULTISOURCE');
    expect(edge(zamkniete, 'QBC#b').meta?.energization).toBe('MULTISOURCE');
    expect(node(zamkniete, 'RGnN-A').meta?.energization).toBe('MULTISOURCE');
  });

  it('[06] konflikt źródeł: obie sekcje CONFLICT z backendu, sprzęgło zamknięte — kompozytor przepisuje, nie ocenia', () => {
    const s = scena(scenariusz('06_conflict_parallel_sources'));
    expect(node(s, 'RGnN-A').meta?.energization).toBe('CONFLICT');
    expect(node(s, 'RGnN-B').meta?.energization).toBe('CONFLICT');
    expect(node(s, 'QBC').meta?.deviceState).toBe('CLOSED');
  });
});

describe('Kotwica systemu SN (§10/§11) — jedna kreska na tożsamość zasilania', () => {
  it('[02] wspólne zasilanie: OBA transformatory pod JEDNĄ kotwicą (equivalent_id), z nazwą źródła SN', () => {
    const s = scena(scenariusz('02_two_tr_qbc_open'));
    const kotwice = s.nodes.filter((n) => n.kind === 'anchorBar');
    expect(kotwice).toHaveLength(1);
    expect(kotwice[0].meta?.shared).toBe(true);
    expect(kotwice[0].meta?.transformerRefs).toEqual(['TA', 'TB']);
    expect(kotwice[0].label).toContain('GPZ Północ');
    expect(s.edges.filter((e) => e.kind === 'anchorDrop')).toHaveLength(2);
  });

  it('[05] niezależne systemy SN: DWIE kotwice (po jednej na system), każda z powodem braku równoważnika po polsku', () => {
    const s = scena(scenariusz('05_independent_upstream'));
    const kotwice = s.nodes.filter((n) => n.kind === 'anchorBar').sort((a, b) => a.x - b.x);
    expect(kotwice).toHaveLength(2);
    expect(kotwice.map((k) => k.meta?.systemId)).toEqual(['sn', 'sn2']);
    expect(kotwice.map((k) => k.meta?.systemCount)).toEqual([2, 2]);
    for (const k of kotwice) {
      expect(k.meta?.status).toBe('brak danych');
      expect(String(k.meta?.opisLabel)).toContain('brak danych');
      expect(String(k.meta?.opisLabel)).not.toContain('upstream_network_topology_invalid');
      expect(typeof k.meta?.labelMaxWidth).toBe('number');
    }
    // Pas etykiety pierwszej kotwicy kończy się PRZED drugą kotwicą.
    const [lewa, prawa] = kotwice;
    expect((lewa.barLeft ?? 0) + Number(lewa.meta?.labelMaxWidth)).toBeLessThanOrEqual(prawa.barLeft ?? 0);
  });

  it('[04] wspólne zasilanie + granica domeny: jedna kotwica, chip granicy z nazwą obcej stacji, terminal graniczny', () => {
    const s = scena(scenariusz('04_shared_upstream_boundary'));
    expect(s.nodes.filter((n) => n.kind === 'anchorBar')).toHaveLength(1);
    expect(node(s, 'boundary:QS-B9').label).toContain('Stacja OBCA');
    expect(node(s, 'boundary-terminal:QS-B9').kind).toBe('boundaryTerminal');
    expect(edge(s, 'QS-B9').kind).toBe('cable');
    expect(edge(s, 'boundary:QS-B9#link').kind).toBe('boundaryLink');
  });
});

describe('Raster i sloty (§8/§42) — każda pozycja jest wielokrotnością rastru, aparaty sekcji na jednej wysokości', () => {
  for (const slug of SLUGI_SCENARIUSZY) {
    it(`[${slug}] wszystkie X/Y węzłów i końców krawędzi leżą na rastrze ${RASTER}`, () => {
      const s = scena(SCENARIUSZE_NN[slug]);
      for (const n of s.nodes) {
        expect(n.x % RASTER, `${n.ref}.x=${n.x}`).toBe(0);
        expect(n.y % RASTER, `${n.ref}.y=${n.y}`).toBe(0);
      }
      for (const e of s.edges) {
        for (const v of [e.x1, e.y1, e.x2, e.y2]) expect(v % RASTER, `${e.ref}`).toBe(0);
      }
    });
  }

  it('[15] dwanaście odpływów: aparaty na JEDNEJ wysokości, rozstaw = feederGap, kolejność wg oznaczenia', () => {
    const s = scena(scenariusz('15_many_feeders'));
    const odplywy = s.nodes.filter((n) => n.kind === 'apparatus' && n.meta?.role === 'feeder').sort((a, b) => a.x - b.x);
    expect(odplywy).toHaveLength(12);
    expect(new Set(odplywy.map((n) => n.y)).size).toBe(1);
    for (let i = 1; i < odplywy.length; i += 1) expect(odplywy[i].x - odplywy[i - 1].x).toBe(TOKENY_GEOMETRII.feederGap);
    expect(odplywy.map((n) => n.ref)).toEqual([...odplywy.map((n) => n.ref)].sort((a, b) => a.localeCompare(b, 'pl', { numeric: true })));
  });

  it('[02] incomer TA na LEWYM krańcu sekcji A, incomer TB na PRAWYM krańcu sekcji B (lustro ostatniej sekcji)', () => {
    const s = scena(scenariusz('02_two_tr_qbc_open'));
    const a = node(s, 'RGnN-A');
    const b = node(s, 'RGnN-B');
    expect(node(s, 'QF-TA').x).toBeLessThan(s.nodes.filter((n) => n.meta?.role === 'feeder' && n.x < (a.barRight ?? 0)).reduce((m, n) => Math.min(m, n.x), Infinity));
    expect(node(s, 'QF-TB').x).toBeGreaterThan(s.nodes.filter((n) => n.meta?.role === 'feeder' && n.x > (b.barLeft ?? 0)).reduce((m, n) => Math.max(m, n.x), -Infinity));
    expect(b.meta?.mirror).toBe(true);
  });
});

describe('Hierarchia pionowa i podrozdzielnice (§9/§13/§14 mandatu, §15 scenariuszy)', () => {
  it('[14] tor T1 → QF-T1 → RGnN-1 → QF-02 → RGN-2 → FU-22 → RGN-3 → QF-31 → odbiór: Y ściśle rosnące', () => {
    const s = scena(scenariusz('14_sub_boards'));
    const ys = ['T1', 'QF-T1', 'RGnN-1', 'QF-02', 'RGN-2_szyna', 'FU-22', 'RGN-3_szyna', 'QF-31', 'QF-31_odbior'].map((r) => node(s, r).y);
    for (let i = 1; i < ys.length; i += 1) expect(ys[i], `krok ${i}`).toBeGreaterThan(ys[i - 1]);
    // Etykieta podrozdzielnicy stoi ZA pionem zasilającym (nie pod nim).
    const feed = edge(s, 'RGN-2_szyna#feed');
    expect(Number(node(s, 'RGN-2_szyna').meta?.labelX)).toBeGreaterThan(feed.x1);
  });

  it('[13] odbiór bez pola siedzi WPROST na szynie (własny slot, zejście z kreski) — audyt NN-AUD-07 z backendu, nie fabrykacja aparatu', () => {
    const p = scenariusz('13_loads_via_fields');
    const s = scena(p);
    const bezPola = node(s, 'odbior_bez_pola');
    expect(bezPola.meta?.direct).toBe(true);
    expect(edge(s, 'odbior_bez_pola#leaf-drop').y1).toBe(node(s, 'RGnN-1').y);
    expect(p.validation_messages.map((m) => m.code)).toContain('NN-AUD-07');
    expect(s.nodes.filter((n) => n.kind === 'apparatus' && n.meta?.role === 'feeder')).toHaveLength(4);
  });

  it('[12] pełny tor DER: aparat → kabel → zacisk pcc z przekładnikiem → źródło; przekaźnik obok kikuta dolnego z łącznikiem', () => {
    const s = scena(scenariusz('12_der_full_path'));
    for (const [qf, ct, gen] of [['QF-G1', 'CT-QF-G1', 'QF-G1_zrodlo'], ['QF-PV1', 'CT-QF-PV1', 'QF-PV1_zrodlo']] as const) {
      expect(node(s, qf).kind).toBe('apparatus');
      expect(edge(s, `${qf}_kabel`).kind).toBe('cable');
      expect(node(s, ct).kind).toBe('measurement');
      expect(node(s, gen).kind).toBe('generator');
      const relay = node(s, `relay:REL-${qf}`);
      expect(relay.kind).toBe('relay');
      expect(relay.x).toBeLessThan(node(s, qf).x);
      expect(relay.y).toBeGreaterThan(node(s, qf).y);
      expect(edge(s, `relay:REL-${qf}#link`).kind).toBe('relayLink');
    }
  });

  it('[16] dwa odbiory na jednym zacisku: zejścia zaczynają się W ZACISKU (łamana ortogonalna), nie pod liściem', () => {
    const s = scena(scenariusz('16_stale_result'));
    const zacisk = node(s, 'QF-01_koniec');
    for (const ref of ['QF-01_odbior', 'odbior_nowy']) {
      const e = edge(s, `${ref}#leaf-drop`);
      expect(e.x1).toBe(zacisk.x);
      expect(e.y1).toBe(zacisk.y);
      expect(e.x2).toBe(node(s, ref).x);
    }
    expect(node(s, 'QF-01_odbior').x).not.toBe(node(s, 'odbior_nowy').x);
  });
});

describe('Ścieżki zasilania i ostrzeżenia — przepisane z projekcji (§37/§40)', () => {
  it('[14] supplyPaths sceny = graph.supply_paths backendu (klucz: szyna → źródło → gałęzie)', () => {
    const p = scenariusz('14_sub_boards');
    const s = scena(p);
    if (p.graph.status !== 'OK') throw new Error('graf OK');
    for (const sp of p.graph.supply_paths) {
      expect(s.supplyPaths.get(sp.bus_ref)?.get(sp.source_ref)).toEqual(sp.branch_refs);
    }
    expect(s.supplyPaths.get('QF-31_zacisk')?.get('T1')).toEqual(['QF-T1', 'QF-02', 'QF-02_kabel', 'FU-22', 'FU-22_kabel', 'QF-31']);
  });

  it('scena dla widoku „brak danych" jest pusta i nie rzuca', () => {
    const p = scenariusz('01_single_tr');
    const s = composeLvDomainScene({ ...p.graph, status: 'brak danych', missing_data: ['station'] } as unknown as typeof p.graph, []);
    expect(s.nodes).toHaveLength(0);
    expect(s.edges).toHaveLength(0);
  });
});

describe('Determinizm i zakaz BFS po stronie klienta (§1/§46)', () => {
  for (const slug of SLUGI_SCENARIUSZY) {
    it(`[${slug}] dwa wywołania kompozytora dają identyczną scenę`, () => {
      expect(scena(SCENARIUSZE_NN[slug])).toEqual(scena(SCENARIUSZE_NN[slug]));
    });
  }

  it('kompozytor i renderer NIE przechodzą grafu (zero kolejki/odwiedzonych/pętli while) — stany są czytane, nie liczone', () => {
    const katalog = path.join(__dirname, '..');
    for (const plik of ['composeLvDomainScene.ts', 'LvDomainView.tsx']) {
      const kod = fs
        .readFileSync(path.join(katalog, plik), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(kod.match(/\bvisited\b|\bqueue\b|\bwhile\s*\(/), plik).toBeNull();
      expect(kod.match(/energization_state\s*=\s*['"]/), `${plik}: przypisanie stanu zasilania w UI`).toBeNull();
    }
  });

  it('stan każdej szyny sceny == stan szyny z projekcji (pass-through) — wszystkie scenariusze × wszystkie szyny', () => {
    for (const slug of SLUGI_SCENARIUSZY) {
      const p = SCENARIUSZE_NN[slug];
      if (p.graph.status !== 'OK') continue;
      const s = scena(p);
      for (const bus of p.graph.buses) {
        const n = s.nodes.find((x) => x.ref === bus.ref_id && (x.kind === 'bus' || x.kind === 'terminal'));
        if (!n) continue;
        expect(n.meta?.energization, `${slug}/${bus.ref_id}`).toBe(bus.energization_state);
        expect(n.meta?.islandRef, `${slug}/${bus.ref_id}`).toBe(bus.island_ref);
      }
    }
  });
});
