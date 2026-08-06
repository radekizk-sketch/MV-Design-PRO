/**
 * R3 (RECENZJA_WARSTWA_WYNIKOWA_2026-07 §wym.6/7/9/17; program WYNIKI-SLD R3) —
 * testy INTERAKCJI (klik etykiety → aktywacja właściciela), POCHODZENIA
 * (moduł+przebieg), PROGÓW severity (kolor+znacznik z kontraktu backendu, ZERO
 * progów w UI) oraz FILTRÓW widoczności (przycinanie warstwy etykiet BEZ zmiany
 * geometrii sceny — inwariant §11 rozszerzony o stany filtrów).
 *
 * Fixtura REALNA (`sldSubstrate52s`, ta sama co pozostałe testy warstwy); refy ze
 * sceny (zero fabrykacji). Wartości metryk przepisane z realnych źródeł repo.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3 } from '../../scene/buildScene';
import { SldCanvasV3, layoutResultLabels } from '../SldCanvasV3';
import {
  applyResultLabelFilter,
  buildResultLabelsFromScene,
  DEFAULT_RESULT_LABEL_FILTER,
  isExceedanceSeverity,
  resultLabelLineQuantity,
  resultLabelsHaveExceedances,
  orientedSegmentRefs,
  type ResultLabelEntry,
  type ResultLabelFilter,
} from '../resultLabels';
import type { RawOverlayElement, RawOverlayPayload } from '../../../../sld-overlay/rawResultOverlayStore';
import type { SldV3Overlay } from '../overlay';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json');
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

const CANVAS_WIDTH = 1024;
const CANVAS_HEIGHT = 640;

const sceneL2 = buildSceneV3(enm, 2);
const singleHop = new Set(orientedSegmentRefs(enm).keys());

const trRef = sceneL2.symbols.find((s) => s.meta?.elementKind === 'transformer' && s.meta?.ownerRef)!.meta!.ownerRef!;
const sourceRef = sceneL2.symbols.find((s) => s.meta?.elementKind === 'source' && s.meta?.ownerRef)!.meta!.ownerRef!;
const branchRef = sceneL2.segments.find(
  (s) => s.meta?.elementKind === 'segment' && s.meta.ownerRef && !s.meta.ownerRef.includes('#') && singleHop.has(s.meta.ownerRef),
)!.meta!.ownerRef!;

function el(refId: string, kind: string, metrics: RawOverlayElement['metrics'], severity = 'INFO'): RawOverlayElement {
  return { ref_id: refId, kind, badges: [], metrics, severity };
}
function payloadOf(elements: Record<string, RawOverlayElement>, analysisType = 'load_flow'): RawOverlayPayload {
  return { run_id: 'run-r3', analysis_type: analysisType, elements };
}

/** Payload z metrykami P/Q na źródle, obc./I/P/Q na przęśle, S na TR. */
function richPayload(severityByRef: Record<string, string> = {}): RawOverlayPayload {
  return payloadOf({
    [trRef]: el(
      trRef,
      'transformer',
      { S_MVA: { code: 'S_MVA', value: 0.63, unit: 'MVA', format_hint: 'fixed2' } },
      severityByRef[trRef] ?? 'INFO',
    ),
    [sourceRef]: el(
      sourceRef,
      'generator',
      {
        P_MW: { code: 'P_MW', value: 6.546769, unit: 'MW', format_hint: 'fixed4' },
        Q_Mvar: { code: 'Q_Mvar', value: -0.3, unit: 'Mvar', format_hint: 'fixed4' },
      },
      severityByRef[sourceRef] ?? 'INFO',
    ),
    [branchRef]: el(
      branchRef,
      'branch',
      {
        LOADING_PCT: { code: 'LOADING_PCT', value: 72.5, unit: '%', format_hint: 'fixed1' },
        I_A: { code: 'I_A', value: 182, unit: 'A', format_hint: 'fixed1' },
        P_MW: { code: 'P_MW', value: 5.648, unit: 'MW', format_hint: 'fixed4' },
        Q_Mvar: { code: 'Q_Mvar', value: 0.92, unit: 'Mvar', format_hint: 'fixed4' },
      },
      severityByRef[branchRef] ?? 'INFO',
    ),
  });
}

afterEach(() => cleanup());

describe('R3 — pochodne severity + mapowanie wielkości (czyste)', () => {
  it('wym.9 severity 1:1 z payloadu: WARNING/IMPORTANT/CRITICAL przenoszone do entry, INFO domyślne', () => {
    const payload = richPayload({ [sourceRef]: 'CRITICAL', [branchRef]: 'WARNING' });
    const byRef = buildResultLabelsFromScene(sceneL2, payload, singleHop);
    expect(byRef[sourceRef].severity).toBe('CRITICAL');
    expect(byRef[branchRef].severity).toBe('WARNING');
    expect(byRef[trRef].severity).toBe('INFO');
  });

  it('wym.9 isExceedanceSeverity: INFO=fałsz; WARNING/IMPORTANT/CRITICAL=prawda', () => {
    expect(isExceedanceSeverity('INFO')).toBe(false);
    expect(isExceedanceSeverity(undefined)).toBe(false);
    for (const s of ['WARNING', 'IMPORTANT', 'CRITICAL']) expect(isExceedanceSeverity(s)).toBe(true);
  });

  it('wym.17 resultLabelsHaveExceedances: brama „tylko przekroczenia”', () => {
    const clean = buildResultLabelsFromScene(sceneL2, richPayload(), singleHop);
    expect(resultLabelsHaveExceedances(clean)).toBe(false);
    const dirty = buildResultLabelsFromScene(sceneL2, richPayload({ [branchRef]: 'IMPORTANT' }), singleHop);
    expect(resultLabelsHaveExceedances(dirty)).toBe(true);
  });

  it('wym.17 prefiks→wielkość: każdy prefiks szablonu mapuje na wielkość filtrowaną', () => {
    expect(resultLabelLineQuantity('P')).toBe('P');
    expect(resultLabelLineQuantity('ΔP')).toBe('P');
    expect(resultLabelLineQuantity('Q')).toBe('Q');
    expect(resultLabelLineQuantity('S')).toBe('S');
    expect(resultLabelLineQuantity('I')).toBe('I');
    expect(resultLabelLineQuantity('Ik″')).toBe('I');
    expect(resultLabelLineQuantity('U')).toBe('U');
    expect(resultLabelLineQuantity('δ')).toBe('U');
    expect(resultLabelLineQuantity('obc.')).toBe('loading');
  });
});

describe('R3 — applyResultLabelFilter (wym.17, czyste, warstwa etykiet)', () => {
  const byRef = buildResultLabelsFromScene(sceneL2, richPayload({ [sourceRef]: 'CRITICAL' }), singleHop);

  it('filtr domyślny ⇒ tożsamość referencji (koszt zero, determinizm, sonda R2 nietknięta)', () => {
    expect(applyResultLabelFilter(byRef, DEFAULT_RESULT_LABEL_FILTER)).toBe(byRef);
  });

  it('„tylko P” (odznaczone Q/S/I/U/obciążenie) ⇒ w entry zostają wyłącznie linie mocy czynnej', () => {
    const onlyP: ResultLabelFilter = {
      ...DEFAULT_RESULT_LABEL_FILTER,
      quantities: { P: true, Q: false, S: false, I: false, U: false, loading: false },
    };
    const out = applyResultLabelFilter(byRef, onlyP);
    // Przęsło: z [obc.,I,P,Q] zostaje samo P.
    expect(out[branchRef].lines.map((l) => l.prefix)).toEqual(['P']);
    // TR miał tylko S ⇒ po „tylko P” znika całkowicie (brak linii).
    expect(out[trRef]).toBeUndefined();
    // Źródło: P zostaje.
    expect(out[sourceRef].lines.map((l) => l.prefix)).toEqual(['P']);
  });

  it('filtr klasy: odznaczenie „linie” usuwa wpisy klasy branch, reszta bez zmian', () => {
    const noBranch: ResultLabelFilter = {
      ...DEFAULT_RESULT_LABEL_FILTER,
      classes: { source: true, transformer: true, branch: false, bus: true },
    };
    const out = applyResultLabelFilter(byRef, noBranch);
    expect(out[branchRef]).toBeUndefined();
    expect(out[sourceRef]).toBeDefined();
    expect(out[trRef]).toBeDefined();
  });

  it('„tylko przekroczenia” ⇒ zostają wyłącznie wpisy severity>INFO', () => {
    const onlyExc: ResultLabelFilter = { ...DEFAULT_RESULT_LABEL_FILTER, onlyExceedances: true };
    const out = applyResultLabelFilter(byRef, onlyExc);
    expect(Object.keys(out)).toEqual([sourceRef]); // tylko źródło jest CRITICAL
  });

  it('determinizm: dwa przebiegi filtra ⇒ identyczny JSON', () => {
    const f: ResultLabelFilter = { ...DEFAULT_RESULT_LABEL_FILTER, quantities: { ...DEFAULT_RESULT_LABEL_FILTER.quantities, Q: false } };
    expect(JSON.stringify(applyResultLabelFilter(byRef, f))).toBe(JSON.stringify(applyResultLabelFilter(byRef, f)));
  });
});

describe('R3 — progi severity w layout (wym.9, 1:1 z backendu)', () => {
  it('placement.severity == severity elementu (mapowanie 1:1, zero progów w UI)', () => {
    const payload = richPayload({ [sourceRef]: 'CRITICAL', [branchRef]: 'WARNING', [trRef]: 'IMPORTANT' });
    const byRef = buildResultLabelsFromScene(sceneL2, payload, singleHop);
    const layout = layoutResultLabels(sceneL2, byRef, [], 2);
    const bySeverity = new Map<string, string>();
    for (const p of layout.placements) bySeverity.set(p.ownerRef, p.severity);
    for (const a of layout.aggregates) for (const m of a.members) bySeverity.set(m.ownerRef, m.severity);
    expect(bySeverity.get(sourceRef)).toBe('CRITICAL');
    expect(bySeverity.get(branchRef)).toBe('WARNING');
    expect(bySeverity.get(trRef)).toBe('IMPORTANT');
  });

  it('agregat dziedziczy NAJGROŹNIEJSZE severity członków', () => {
    // Ustaw wszystkim severity, znajdź agregat i sprawdź jego severity == max(members).
    const payload = richPayload({ [sourceRef]: 'CRITICAL', [branchRef]: 'WARNING', [trRef]: 'IMPORTANT' });
    const byRef = buildResultLabelsFromScene(sceneL2, payload, singleHop);
    const layout = layoutResultLabels(sceneL2, byRef, [], 2);
    const rank: Record<string, number> = { INFO: 0, WARNING: 1, IMPORTANT: 2, CRITICAL: 3 };
    for (const a of layout.aggregates) {
      const maxMember = a.members.reduce((m, x) => (rank[x.severity] > rank[m] ? x.severity : m), 'INFO');
      expect(a.severity).toBe(maxMember);
    }
  });
});

describe('R3 — render: interakcja natywna + progi + pochodzenie (wym.6/7/9)', () => {
  // Payload JEDNOELEMENTOWy (samo źródło) ⇒ layout daje POJEDYNCZĄ etykietę
  // (skupisko 1-elementowe, brak agregatu) — deterministyczny cel klika/znacznika.
  function soloSource(severity = 'INFO'): RawOverlayPayload {
    return payloadOf({
      [sourceRef]: el(
        sourceRef,
        'generator',
        {
          P_MW: { code: 'P_MW', value: 6.546769, unit: 'MW', format_hint: 'fixed4' },
          Q_Mvar: { code: 'Q_Mvar', value: -0.3, unit: 'Mvar', format_hint: 'fixed4' },
        },
        severity,
      ),
    });
  }

  it('wym.6 KLIK NATYWNY etykiety woła onResultLabelActivate(ownerRef, kind) — realna ścieżka, nie syntetyczny dispatch', () => {
    const onActivate = vi.fn();
    const byRef = buildResultLabelsFromScene(sceneL2, soloSource(), singleHop);
    const overlay: SldV3Overlay = { energizedByTestId: {}, resultLabelsByOwnerRef: byRef };
    const { container } = render(
      <SldCanvasV3
        snapshot={enm}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        lodOverride={2}
        overlay={overlay}
        onResultLabelActivate={onActivate}
      />,
    );
    const label = container.querySelector('[data-testid^="sld-v3-result-label-"]');
    expect(label).toBeTruthy();
    const ownerRef = label!.getAttribute('data-result-owner-ref');
    const kind = label!.getAttribute('data-result-kind');
    // KLIK NATYWNY (fireEvent.click = realne zdarzenie w DOM na węźle etykiety),
    // NIE syntetyczny `dispatchEvent` omijający handler (Zero-Debt pkt 5).
    fireEvent.click(label!);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith(ownerRef, kind);
  });

  it('wym.6 brak onResultLabelActivate ⇒ etykieta nieklikalna (kanwa czysto-odczytowa, bez role=button)', () => {
    const byRef = buildResultLabelsFromScene(sceneL2, soloSource(), singleHop);
    const overlay: SldV3Overlay = { energizedByTestId: {}, resultLabelsByOwnerRef: byRef };
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} overlay={overlay} />,
    );
    const label = container.querySelector('[data-testid^="sld-v3-result-label-"]');
    expect(label!.getAttribute('role')).toBeNull();
  });

  it('wym.9 przekroczenie ⇒ etykieta oznaczona data-result-exceeded + znacznik „⚠” (kolor DODATKIEM)', () => {
    const byRef = buildResultLabelsFromScene(sceneL2, soloSource('CRITICAL'), singleHop);
    const overlay: SldV3Overlay = { energizedByTestId: {}, resultLabelsByOwnerRef: byRef };
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} overlay={overlay} />,
    );
    // Źródło CRITICAL renderuje się jako pojedyncza etykieta LUB (przy skupisku)
    // jako marker agregatu — oba niosą data-result-exceeded/severity.
    const exceeded = container.querySelectorAll('[data-result-exceeded="true"]');
    expect(exceeded.length).toBeGreaterThan(0);
    const node = exceeded[0];
    expect(node.getAttribute('data-result-severity')).toBe('CRITICAL');
    // Znacznik tekstowy przekroczenia obecny (nie sam kolor).
    expect(node.textContent).toContain('⚠');
  });

  it('wym.9 wyniki INFO ⇒ zero znaczników przekroczenia (brak progów w UI dla poprawnych)', () => {
    const byRef = buildResultLabelsFromScene(sceneL2, soloSource(), singleHop);
    const overlay: SldV3Overlay = { energizedByTestId: {}, resultLabelsByOwnerRef: byRef };
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} overlay={overlay} />,
    );
    expect(container.querySelector('[data-result-exceeded="true"]')).toBeNull();
  });

  it('wym.7 pochodzenie: badge pokazuje moduł (PL) + przebieg z payloadu', () => {
    const byRef = buildResultLabelsFromScene(sceneL2, soloSource(), singleHop);
    const overlay: SldV3Overlay = {
      energizedByTestId: {},
      resultLabelsByOwnerRef: byRef,
      provenance: { analysisTypeLabel: 'rozpływ mocy', runId: 'run-r3' },
    };
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} overlay={overlay} />,
    );
    const badge = container.querySelector('[data-testid="sld-v3-overlay-provenance"]');
    expect(badge).toBeTruthy();
    expect(badge!.getAttribute('data-analysis-type-label')).toBe('rozpływ mocy');
    expect(badge!.getAttribute('data-run-id')).toBe('run-r3');
    expect(badge!.textContent).toContain('Moduł: rozpływ mocy');
    expect(badge!.textContent).toContain('Przebieg: run-r3');
  });

  it('OVERLAY-TIMESTAMP: czas ukończenia biegu obecny ⇒ badge pokazuje wiersz „Czas ukończenia”', () => {
    const byRef = buildResultLabelsFromScene(sceneL2, soloSource(), singleHop);
    const overlay: SldV3Overlay = {
      energizedByTestId: {},
      resultLabelsByOwnerRef: byRef,
      // `completedAtLabel` jest już sformatowanym łańcuchem PL (workspace woła
      // formatter repo `formatDateTime`) — kanwa asembluje sam tekst pochodzenia.
      provenance: {
        analysisTypeLabel: 'rozpływ mocy',
        runId: 'run-r3',
        completedAtLabel: '24.07.2026, 10:15:30',
      },
    };
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} overlay={overlay} />,
    );
    const badge = container.querySelector('[data-testid="sld-v3-overlay-provenance"]');
    expect(badge).toBeTruthy();
    expect(badge!.getAttribute('data-completed-at')).toBe('24.07.2026, 10:15:30');
    expect(badge!.textContent).toContain('Czas ukończenia: 24.07.2026, 10:15:30');
  });

  it('OVERLAY-TIMESTAMP: brak czasu ukończenia ⇒ badge NIE pokazuje wiersza czasu (uczciwy brak, zero fabrykacji)', () => {
    const byRef = buildResultLabelsFromScene(sceneL2, soloSource(), singleHop);
    const overlay: SldV3Overlay = {
      energizedByTestId: {},
      resultLabelsByOwnerRef: byRef,
      provenance: { analysisTypeLabel: 'rozpływ mocy', runId: 'run-r3' },
    };
    const { container } = render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} overlay={overlay} />,
    );
    const badge = container.querySelector('[data-testid="sld-v3-overlay-provenance"]');
    expect(badge).toBeTruthy();
    expect(badge!.getAttribute('data-completed-at')).toBeNull();
    expect(badge!.textContent).not.toContain('Czas ukończenia');
  });
});

describe('R3 — inwariant geometrii ze stanami filtrów (wym.11/17)', () => {
  const byRef = buildResultLabelsFromScene(sceneL2, richPayload({ [sourceRef]: 'CRITICAL' }), singleHop);

  function renderWithFilter(filter: ResultLabelFilter) {
    const overlay: SldV3Overlay = { energizedByTestId: {}, resultLabelsByOwnerRef: applyResultLabelFilter(byRef, filter) };
    return render(
      <SldCanvasV3 snapshot={enm} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} lodOverride={2} overlay={overlay} />,
    );
  }

  it('geometria segmentów/symboli/etykiet BAJT-identyczna niezależnie od stanu filtrów', () => {
    const base = renderWithFilter(DEFAULT_RESULT_LABEL_FILTER);
    const filters: ResultLabelFilter[] = [
      { ...DEFAULT_RESULT_LABEL_FILTER, quantities: { P: true, Q: false, S: false, I: false, U: false, loading: false } },
      { ...DEFAULT_RESULT_LABEL_FILTER, classes: { source: true, transformer: false, branch: false, bus: false } },
      { ...DEFAULT_RESULT_LABEL_FILTER, onlyExceedances: true },
    ];
    for (const f of filters) {
      const variant = renderWithFilter(f);
      for (const testId of ['sld-v3-segments', 'sld-v3-symbols', 'sld-v3-labels']) {
        expect(variant.container.querySelector(`[data-testid="${testId}"]`)!.innerHTML).toBe(
          base.container.querySelector(`[data-testid="${testId}"]`)!.innerHTML,
        );
      }
    }
  });

  it('filtr REALNIE ogranicza warstwę etykiet (dowód, że test nie jest pusty)', () => {
    const all = renderWithFilter(DEFAULT_RESULT_LABEL_FILTER);
    const onlyExc = renderWithFilter({ ...DEFAULT_RESULT_LABEL_FILTER, onlyExceedances: true });
    const allCount = all.container.querySelectorAll('[data-testid^="sld-v3-result-label-"]').length
      + all.container.querySelectorAll('[data-testid^="sld-v3-result-aggregate-"]').length;
    const excCount = onlyExc.container.querySelectorAll('[data-testid^="sld-v3-result-label-"]').length
      + onlyExc.container.querySelectorAll('[data-testid^="sld-v3-result-aggregate-"]').length;
    expect(allCount).toBeGreaterThan(excCount);
  });
});
