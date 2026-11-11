/**
 * S9-2 (AUDYT_JAKOSCI_SLD_2026-08, W-1 „wyniki NIE pojawiają się na schemacie") —
 * TEST INTEGRACYJNY POKRYCIA: liczba etykiet wynikowych vs liczba punktów wyniku
 * z backendu.
 *
 * FIXTURY POCHODZĄ Z ŻYWEGO BIEGU (zero fabrykacji) i z GENERATORA backendu
 * (`backend/tests/reference_networks/fikstury_enm_sld.py`, test świeżości
 * `tests/application/test_fikstury_enm_generowane.py`): sieć zbudowana realnymi
 * operacjami domenowymi API (`add_grid_source_sn` → 2× `continue_trunk_segment_sn`
 * → `station-templates/tpl_sn_nn_1250kva/apply` → wiązanie katalogowe aparatów
 * pól nN), a nakładki to odpowiedzi kanonicznego toru biegu: `POST /api/execution/
 * study-cases/{case}/runs` (`analysis_type=SC_3F`/`LOAD_FLOW`) → `POST
 * /api/execution/runs/{id}/execute` → `GET .../results/v1`, w kształcie, w jakim
 * kanwa dostaje je od orkiestratora.
 *   * `s92Bieg.enm.json`         — migawka ENM (`GET /api/cases/{case}/enm`);
 *   * `s92Zwarcie.overlay.json`  — nakładka biegu zwarciowego (10 punktów);
 *   * `s92Rozplyw.overlay.json`  — nakładka biegu rozpływowego (23 punkty).
 *
 * ATRYBUCJA LICZB (karta SLD-SUBSTRAT, regeneracja z API zamiast zrzutu ręcznego):
 *   * zwarcie 3 → 9 punktów: +6 szyn odpływów nN — automigracja promocji pól nN
 *     (backend `enm/migrations/promocja_aparatow_nn.py`) wprowadziła do modelu
 *     aparat i szynę każdego odpływu nN stacji (5 odpływów + wyłącznik główny
 *     szablonu 1250 kVA), a solver liczy zwarcie w każdym węźle;
 *   * rozpływ 16 → 23 punkty: te same +6 szyn odpływów oraz +1 zacisk pola SN
 *     (szablon 1250 kVA ma RMU 5-polowe, dawny zrzut 1000 kVA — 4 pola);
 *   * szablon 1000 → 1250 kVA: stacja z pomiarem rozliczeniowym (1000 kVA) idzie
 *     od POMIAR-ODG do odgałęzienia przez ZKSN, którego przed pierwszą stacją ciągu
 *     rysunek dziś nie kładzie — kontrakt „wyniki na kanwie" potrzebuje stacji NA
 *     rysunku (znalezisko zgłoszone w meldunku karty).
 *   * zwarcie 9 → 10 punktów (karta GPZ-MODEL): GPZ fikstury ma równoważnik sieci
 *     110 kV i transformator WN/SN (tryb A), więc w modelu jest realna szyna WN GPZ
 *     (`gpz/…/hv_section/001/bus_wn`), a solver liczy zwarcie także w niej. Szyna WN
 *     jest na rysunku (kolumna WN GPZ), więc jej punkt dostaje etykietę: schemat ma
 *     4 punkty (3 SN + 1 WN), rozdzielnice nN — 6.
 *
 * ODBIÓR KARTY: „liczba etykiet wynikowych > 0 i RÓWNA liczbie punktów wyniku
 * z backendu". Dla biegu ZWARCIOWEGO równość jest dosłowna (3 punkty = 3
 * etykiety). Dla biegu ROZPŁYWOWEGO część punktów to węzły, których MODEL sam
 * nie rysuje (`Bus.meta.render_on_sld === false`: mufy ciągu `INLINE_TERMINAL`,
 * zaciski pól `FIELD_TERMINAL`) — dla nich etykieta nie może powstać, bo nie ma
 * elementu rysunku. Szyny odpływów nN należą do rozdzielnicy nN stacji, nie do
 * schematu SN (stacja jest na nim jednym blokiem z szyną nN i agregatem odbioru).
 * Równość jest więc egzekwowana jako INWARIANT SUMY sześciu ROZŁĄCZNYCH kategorii
 * (`summarizeResultPointCoverage`), z twardym wymogiem `withoutAnchor === 0`:
 * żaden punkt rysowalny nie ginie po cichu.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildResultLabelsForSnapshot, buildFlowOverlayForSnapshot } from '../SldCanvasV3Workspace';
import { resultPointsInGpzTable, summarizeResultPointCoverage } from '../resultLabels';
import { buildSceneV3 } from '../../scene/buildScene';
import { resultPointsHiddenByModel, resultPointsInStationNnBoard } from '../resultRefBridge';
import type { EnergyNetworkModel } from '../../../../../types/enm';
import type { RawOverlayPayload } from '../../../../sld-overlay/rawResultOverlayStore';

const here = dirname(fileURLToPath(import.meta.url));
const readFixture = <T,>(name: string): T =>
  JSON.parse(readFileSync(resolve(here, 'fixtures', name), 'utf8')) as T;

const enm = readFixture<EnergyNetworkModel>('s92Bieg.enm.json');
const zwarcie = readFixture<RawOverlayPayload>('s92Zwarcie.overlay.json');
const rozplyw = readFixture<RawOverlayPayload>('s92Rozplyw.overlay.json');
const hidden = resultPointsHiddenByModel(enm);
const nnBoard = resultPointsInStationNnBoard(enm);
const gpzTabela = resultPointsInGpzTable(buildSceneV3(enm, 2));

// Tożsamość elementów wyprowadzana z modelu po NAZWACH/strukturze, nie z ziaren
// identyfikatorów (te zmieniają się z każdą zmianą ziarna operacji domenowej).
const stacja = (enm.substations ?? []).find((s) => s.station_type !== 'gpz')!;
const szynaStacji = (koncowka: string): string => stacja.bus_refs.find((ref) => ref.endsWith(koncowka))!;
const refGalezi = (nazwa: string): string => (enm.branches ?? []).find((g) => g.name === nazwa)!.ref_id;
const szynyOdplywowNn = Object.keys(rozplyw.elements).filter((ref) => nnBoard.has(ref));

/** Punkty wyniku pokryte etykietą — po refie PUNKTU, nie po refie rysunku
 *  (ten sam punkt bywa zakotwiczony dwoma elementami: blok stacji na poziomie
 *  przeglądu i odcinek szyny na poziomach szczegółu). */
function pokrytePunkty(entries: Readonly<Record<string, { readonly resultRef: string }>>): ReadonlySet<string> {
  return new Set(Object.values(entries).map((entry) => entry.resultRef));
}

describe('S9-2 — pokrycie punktów wyniku etykietami (bieg zwarciowy)', () => {
  const entries = buildResultLabelsForSnapshot(enm, zwarcie);

  const punktySchematuSn = Object.keys(zwarcie.elements).filter((ref) => !nnBoard.has(ref));

  it('kontrola wejścia: nakładka biegu niesie 10 punktów zwarcia, wszystkie klasy „bus" (3 schematu SN + szyna WN GPZ + 6 szyn odpływów nN)', () => {
    expect(Object.keys(zwarcie.elements)).toHaveLength(10);
    expect(Object.values(zwarcie.elements).every((element) => element.kind === 'bus')).toBe(true);
    expect(punktySchematuSn).toHaveLength(4);
    expect(punktySchematuSn.filter((ref) => ref.includes('/hv_section/'))).toHaveLength(1);
    expect(Object.keys(zwarcie.elements).filter((ref) => nnBoard.has(ref))).toHaveLength(6);
  });

  it('ODBIÓR: liczba etykiet > 0 i RÓWNA liczbie punktów wyniku schematu (4 = 4)', () => {
    const pokryte = pokrytePunkty(entries);
    expect(pokryte.size).toBeGreaterThan(0);
    expect([...pokryte].sort()).toEqual([...punktySchematuSn].sort());
  });

  it('rachunek pokrycia: schemat SN oznakowany w całości, szyny odpływów nN nazwane, zero punktów bez elementu rysunku', () => {
    const coverage = summarizeResultPointCoverage(zwarcie, entries, hidden, nnBoard, gpzTabela);
    expect(coverage).toEqual({
      total: 10,
      labelled: 4,
      hiddenByModel: 0,
      inGpzTable: 0,
      withoutTemplate: 0,
      inStationNnBoard: 6,
      withoutAnchor: 0,
      withoutAnchorRefs: [],
    });
  });

  it('WARTOŚCI z danych: każda etykieta niesie Ik″/ip/Ith TEGO punktu, sformatowane z wartości backendu', () => {
    for (const ref of punktySchematuSn) {
      const element = zwarcie.elements[ref];
      const entry = Object.values(entries).find((candidate) => candidate.resultRef === ref);
      expect(entry, ref).toBeDefined();
      const prefixy = entry!.lines.map((line) => line.prefix);
      expect(prefixy.slice(0, 3)).toEqual(['Ik″', 'ip', 'Ith']);
      // Kontrola „1:1 z danych": liczba w etykiecie == wartość metryki
      // znormalizowana do kA wg JEDNOSTKI metryki (ścieżka zwarciowa emituje
      // `ikss_ka` w kA — patrz `result_builder_v1.METRYKI_ELEMENTOW_WYNIKU`). Formatowanie
      // wolno, arytmetyka wielkości nie.
      const ikss = element.metrics.IK_3F_A;
      const ka = ikss.unit === 'A' ? (ikss.value as number) / 1000 : (ikss.value as number);
      expect(entry!.lines[0].text).toBe(`${ka.toFixed(1).replace('.', ',')} kA`);
    }
  });
});

describe('S9-2 — pokrycie punktów wyniku etykietami (bieg rozpływowy)', () => {
  const entries = buildResultLabelsForSnapshot(enm, rozplyw);

  it('kontrola wejścia: nakładka biegu niesie 25 punktów (szyny, gałęzie, transformatory, źródło, pole i bilans GPZ)', () => {
    expect(Object.keys(rozplyw.elements)).toHaveLength(25);
    expect(new Set(Object.values(rozplyw.elements).map((element) => element.kind))).toEqual(
      new Set(['bus', 'branch', 'generator', 'bay', 'substation']),
    );
  });

  it('GPZ-PARYTET: wiersze pola i bilansu GPZ liczą się jako opisane w tabeli GPZ (nie „bez wielkości dla tej analizy")', () => {
    const gpz = (enm.substations ?? []).find((s) => s.station_type === 'gpz')!;
    const wierszeGpz = Object.keys(rozplyw.elements).filter((ref) => ['bay', 'substation'].includes(rozplyw.elements[ref].kind));
    expect(wierszeGpz).toHaveLength(2);
    expect(wierszeGpz).toContain(gpz.ref_id);
    expect(wierszeGpz.every((ref) => gpzTabela.has(ref))).toBe(true);
    const coverage = summarizeResultPointCoverage(rozplyw, entries, hidden, nnBoard, gpzTabela);
    expect(coverage.inGpzTable).toBe(2);
    expect(coverage.withoutTemplate).toBe(0);
    // Bez zbioru tabeli GPZ te same wiersze spadają do „bez wielkości" (kategoria
    // nie jest pusta z definicji — predykat realnie rozstrzyga).
    const bezTabeli = summarizeResultPointCoverage(rozplyw, entries, hidden, nnBoard, new Set());
    expect(bezTabeli.inGpzTable).toBe(0);
    expect(bezTabeli.withoutTemplate).toBe(2);
    // L0: blok GPZ zwinięty, adnotacji nie ma — zbiór pusty.
    expect(resultPointsInGpzTable(buildSceneV3(enm, 0)).size).toBe(0);
  });

  it('model DEKLARUJE 7 punktów jako nierysowane (2 mufy ciągu + 5 zacisków pól RMU) — to nie jest brak warstwy', () => {
    const nierysowane = Object.keys(rozplyw.elements).filter((ref) => hidden.has(ref));
    expect(nierysowane).toHaveLength(7);
    expect(nierysowane.filter((ref) => ref.endsWith('/downstream'))).toHaveLength(2);
    expect(nierysowane.filter((ref) => ref.includes('/sn_field_terminal/'))).toHaveLength(5);
  });

  it('szyny odpływów nN: 6 punktów, każdy to szyna za aparatem pola nN TEJ stacji', () => {
    expect(szynyOdplywowNn).toHaveLength(6);
    for (const ref of szynyOdplywowNn) {
      const aparat = (enm.branches ?? []).find((g) => g.to_bus_ref === ref)!;
      expect(aparat.from_bus_ref).toBe(szynaStacji('/nn_bus'));
    }
  });

  it('ODBIÓR: INWARIANT SUMY sześciu kategorii === total, przy withoutAnchor = 0', () => {
    const coverage = summarizeResultPointCoverage(rozplyw, entries, hidden, nnBoard, gpzTabela);
    expect(coverage.total).toBe(25);
    expect(coverage.labelled).toBeGreaterThan(0);
    expect(
      coverage.labelled + coverage.hiddenByModel + coverage.inGpzTable + coverage.withoutTemplate
        + coverage.inStationNnBoard + coverage.withoutAnchor,
    ).toBe(coverage.total);
    expect(coverage.withoutAnchorRefs).toEqual([]);
    expect(coverage.labelled).toBe(10);
    expect(coverage.hiddenByModel).toBe(7);
    expect(coverage.inStationNnBoard).toBe(6);
  });

  it('bez predykatu rozdzielnicy nN te same szyny spadają do „bez elementu na schemacie" (kategoria nie jest pusta z definicji)', () => {
    const coverage = summarizeResultPointCoverage(rozplyw, entries, hidden, new Set(), gpzTabela);
    expect(coverage.inStationNnBoard).toBe(0);
    expect([...coverage.withoutAnchorRefs].sort()).toEqual([...szynyOdplywowNn].sort());
  });

  it('KLASY pokryte: szyna stacji SN i nN, blok stacji (przegląd), transformator stacji, gałęzie ciągu, źródło', () => {
    const pokryte = pokrytePunkty(entries);
    expect(pokryte.has(szynaStacji('/sn_bus'))).toBe(true);
    expect(pokryte.has(szynaStacji('/nn_bus'))).toBe(true);
    expect(pokryte.has((enm.transformers ?? []).find((t) => t.name === 'Transformator SN/nN')!.ref_id)).toBe(true);
    expect(pokryte.has(refGalezi('Odcinek 0'))).toBe(true);
    expect(pokryte.has(refGalezi('Odcinek 1 (1)'))).toBe(true);
    expect(pokryte.has(refGalezi('Odcinek 1 (2)'))).toBe(true);
    expect(pokryte.has((enm.sources ?? [])[0].ref_id)).toBe(true);
  });

  it('KIERUNEK ze znaku danych: strzałka rozpływu na KAŻDEJ gałęzi ciągu, zwrot zgodny ze znakiem P i orientacją gałęzi', () => {
    const flow = buildFlowOverlayForSnapshot(enm, rozplyw);
    const galezie = Object.keys(rozplyw.elements).filter((ref) => rozplyw.elements[ref].kind === 'branch');
    const zeStrzalka = galezie.filter((ref) => flow[ref]);
    expect(zeStrzalka.length).toBeGreaterThan(0);
    for (const ref of zeStrzalka) {
      const p = rozplyw.elements[ref].metrics.P_MW?.value;
      expect(typeof p).toBe('number');
      // Wszystkie gałęzie tej fixtury są zadeklarowane zgodnie z kierunkiem
      // trasy (`orientedSegmentRefs` = true), więc znak P mapuje się na zwrot
      // wprost — a `forward` bierze się ze ZŁOŻENIA znaku z orientacją, nie z
      // geometrii (dowód reguły: `overlay.test.ts`).
      expect(flow[ref].forward).toBe((p as number) >= 0);
      expect(flow[ref].p?.value).toBe(p);
    }
  });
});

describe('S9-2 — stan zerowy (uczciwy brak)', () => {
  it('bieg bez punktów wyniku ⇒ zero etykiet i rachunek pokrycia „0 z 0" (zero atrap)', () => {
    const pusty: RawOverlayPayload = { run_id: 'run-pusty', analysis_type: 'SC_3F', elements: {} };
    const entries = buildResultLabelsForSnapshot(enm, pusty);
    expect(Object.keys(entries)).toHaveLength(0);
    expect(summarizeResultPointCoverage(pusty, entries, hidden, nnBoard, gpzTabela).total).toBe(0);
  });

  it('brak biegu (payload=null) ⇒ zero etykiet, zero strzałek', () => {
    expect(buildResultLabelsForSnapshot(enm, null)).toEqual({});
    expect(buildFlowOverlayForSnapshot(enm, null)).toEqual({});
  });

  it('analiza NIEZNANEJ rodziny ⇒ zero etykiet (zero fabrykacji podpisów)', () => {
    const obcy: RawOverlayPayload = { ...zwarcie, analysis_type: 'DYNAMIKA_RMS' };
    expect(buildResultLabelsForSnapshot(enm, obcy)).toEqual({});
  });
});
