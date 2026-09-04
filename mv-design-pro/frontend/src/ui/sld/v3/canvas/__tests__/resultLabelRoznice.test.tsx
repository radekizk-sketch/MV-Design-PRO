/**
 * NAKŁADKA RÓŻNIC A/B na schemacie — warstwa etykiet.
 *
 * DŁUG, KTÓRY TE TESTY ZAMYKAJĄ: funkcja „pokaż różnice na schemacie" była
 * widoczna w interfejsie, a jej klient wołał trasę bez dostawcy. Naprawa niesie
 * DWIE zmiany, które trzeba przybić osobno: różnice liczy i opisuje backend
 * (rodzina szablonów `short_circuit_delta` czyta kody `DELTA_*` z jednostkami
 * z payloadu) oraz różnice mają PIERWSZEŃSTWO w warstwie etykiet, dopóki tryb
 * trwa — a po wyjściu warstwa wraca do wyniku pojedynczego przebiegu.
 *
 * Ścieżka NATYWNA (Zero-Debt pkt 5): wyjście z trybu różnic wykonywane realnym
 * klikiem użytkownika (`userEvent`), nie wołaniem akcji store'u.
 *
 * Pokrycie jest iloczynem cech: rodzina analizy (różnice / zwarcia / rozpływ)
 * × obecność nakładki (jest / nie ma) × świeżość wyników (aktualne / OUTDATED)
 * × tryb porównawczy kolejnych biegów (dostępny / wykluczony przez różnice).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3 } from '../../scene/buildScene';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { useSelectionStore } from '../../../../selection';
import { useAppStateStore } from '../../../../app-state';
import { SldCanvasV3Workspace } from '../SldCanvasV3Workspace';
import { buildResultLabelsFromScene, resultLabelLineQuantity, orientedSegmentRefs } from '../resultLabels';
import {
  RESULT_LABEL_TEMPLATES,
  normalizeResultLabelAnalysis,
} from '../resultLabelTemplates';
import {
  useRawResultOverlayStore,
  type RawOverlayElement,
  type RawOverlayPayload,
} from '../../../../sld-overlay/rawResultOverlayStore';
import { useOverlayStore } from '../../../../sld-overlay/overlayStore';
import { useSldDeltaOverlayStore } from '../../../../sld-overlay/sldDeltaOverlayStore';
import type { NakladkaRoznic } from '../../../../sld-overlay/sldDeltaOverlay.api';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

const CANVAS_W = 1024;
const CANVAS_H = 640;
const sceneL2 = buildSceneV3(enm, 2);
const singleHop = new Set(orientedSegmentRefs(enm).keys());

/** Szyna ze sceny — kotwica etykiety i kanoniczny ref wyniku (zero fabrykacji). */
const busSeg = sceneL2.segments.find((s) => s.meta?.elementKind === 'bus' && s.meta?.ownerRef)!;
const busOwnerRef = busSeg.meta!.ownerRef!;
const busRef = busSeg.meta!.busResultRef ?? busOwnerRef;

function metryka(code: string, value: number, unit: string, formatHint: string) {
  return { code, value, unit, format_hint: formatHint, source: 'solver' };
}

function elementRoznic(severity: string, metrics: RawOverlayElement['metrics']): RawOverlayElement {
  return { ref_id: busRef, kind: 'bus', badges: [], metrics, severity };
}

/** Nakładka różnic w kształcie ODPOWIEDZI BACKENDU (jednostki i wagi stamtąd). */
function nakladkaFixture(over: Partial<NakladkaRoznic> = {}): NakladkaRoznic {
  return {
    run_id_a: 'sc-run-a',
    run_id_b: 'sc-run-b',
    analysis_type: 'DELTA_SC',
    report_version: '1.3.0',
    elements: {
      [busRef]: elementRoznic('WARNING', {
        DELTA_IK_3F_KA: metryka('DELTA_IK_3F_KA', 2, 'kA', 'fixed2'),
        DELTA_IK_3F_PCT: metryka('DELTA_IK_3F_PCT', 25, '%', 'fixed1'),
      }),
    },
    legend: {
      title: 'Legenda roznic A/B',
      entries: [
        { severity: 'INFO', label: 'Bez zmian', description: 'Wartości identyczne' },
        { severity: 'WARNING', label: 'Zmiana', description: 'Wartości różne' },
      ],
    },
    content_hash: 'a'.repeat(64),
    liczba_punktow_zmienionych: 1,
    liczba_punktow_bez_zmian: 0,
    liczba_punktow_bez_odpowiednika: 2,
    liczba_punktow_bez_danych: 0,
    ...over,
  };
}

/**
 * Nakładka o JEDNEJ linii na punkt — używana w asercjach DOM. Fixtura pełna
 * (dwie linie) na tej gęstej sieci referencyjnej nie mieści się przy szynie
 * i declutter ją UKRYWA (`hiddenCount`, zachowanie wspólne dla wszystkich
 * rodzin etykiet — tak samo znikają wielolinijkowe etykiety rozpływu). Test
 * treści na kanwie ma sprawdzać ŁAŃCUCH danych, a nie wynik rozmieszczania,
 * więc pracuje na etykiecie o rozmiarze porównywalnym z wynikiem zwarciowym.
 */
function nakladkaJednaLinia(): NakladkaRoznic {
  return nakladkaFixture({
    elements: {
      [busRef]: elementRoznic('WARNING', {
        DELTA_IK_3F_KA: metryka('DELTA_IK_3F_KA', 2, 'kA', 'fixed2'),
      }),
    },
  });
}

function payloadZwarciowy(runId: string): RawOverlayPayload {
  return {
    run_id: runId,
    analysis_type: 'short_circuit_3f',
    elements: {
      [busRef]: {
        ref_id: busRef,
        kind: 'bus',
        badges: [],
        severity: 'INFO',
        metrics: { IK_3F_A: metryka('IK_3F_A', 12.5, 'kA', 'fixed2') },
      },
    },
  };
}

beforeEach(() => {
  if (typeof URL.createObjectURL !== 'function') URL.createObjectURL = () => 'blob:shim';
  if (typeof URL.revokeObjectURL !== 'function') URL.revokeObjectURL = () => {};
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
  useRawResultOverlayStore.getState().clear();
  useOverlayStore.getState().clearOverlay();
  useSldDeltaOverlayStore.getState().wyczyscRoznice();
  useAppStateStore.getState().reset();
  useSnapshotStore.setState({ snapshot: enm });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useRawResultOverlayStore.getState().clear();
  useSldDeltaOverlayStore.getState().wyczyscRoznice();
  useAppStateStore.getState().reset();
});

/** Otwiera panel warstw (zawiera panel filtrów z sekcją różnic). */
function otworzPanelFiltrow(): void {
  fireEvent.click(screen.getByTestId('sld-v3-layer-panel-toggle'));
}

/**
 * Treść CAŁEJ warstwy wynikowej kanwy. Czytana z warstwy, a nie z grupy
 * konkretnego elementu, bo etykiety kolidujące renderer scala w bloki zbiorcze
 * (`sld-v3-result-aggregate-*`) — asercja na jedną grupę byłaby zakładem o
 * wynik rozmieszczania, nie o treść.
 */
function trescWarstwyWynikowej(container: HTMLElement): string {
  return container.querySelector('[data-testid="sld-v3-result-labels"]')?.textContent ?? '';
}

// ---------------------------------------------------------------------------
// Rejestr szablonów
// ---------------------------------------------------------------------------

describe('Rejestr szablonów — rodzina różnic', () => {
  it('typ analizy z prefiksem „DELTA_" trafia do rodziny różnic, nie zwarć', () => {
    // Nazwa niesie także człon zwarciowy — pomyłka rodziny dałaby podpisy
    // wartości bezwzględnych pod liczbami, które są RÓŻNICAMI.
    expect(normalizeResultLabelAnalysis('DELTA_SC')).toBe('short_circuit_delta');
    expect(normalizeResultLabelAnalysis('DELTA_SC_3F')).toBe('short_circuit_delta');
    expect(normalizeResultLabelAnalysis('short_circuit_3f')).toBe('short_circuit');
    expect(normalizeResultLabelAnalysis('load_flow')).toBe('load_flow');
  });

  it('podpisy różnic niosą „Δ", wartości B „(B)" — i nie powtarzają podpisów wielkości', () => {
    // INTENCJA (zachowana z wersji sprzed S9-13): żadnej linii rodziny różnic
    // nie da się wziąć za wynik pojedynczego przebiegu. Po S9-13 rodzina niesie
    // DWA rodzaje linii: różnice (kody DELTA_*, podpis z „Δ") oraz wartości
    // bezwzględne przebiegu B (kody B_*, podpis z „(B)" i BEZ „Δ" — to nie jest
    // różnica). Każdy podpis pozostaje rozłączny z podpisami rodziny zwarciowej.
    const specy = RESULT_LABEL_TEMPLATES.short_circuit_delta.bus!;
    const zwarcia = RESULT_LABEL_TEMPLATES.short_circuit.bus!.map((s) => s.prefix);
    for (const spec of specy) {
      if (spec.code.startsWith('DELTA_')) {
        expect(spec.prefix, `różnica bez „Δ": ${spec.code}`).toContain('Δ');
      } else {
        expect(spec.code.startsWith('B_'), `kod spoza rodzin DELTA_/B_: ${spec.code}`).toBe(true);
        expect(spec.prefix, `wartość B bez „(B)": ${spec.code}`).toContain('(B)');
        expect(spec.prefix, `wartość B z „Δ" udaje różnicę: ${spec.code}`).not.toContain('Δ');
      }
      expect(zwarcia.includes(spec.prefix), `podpis wspólny ze zwarciami: ${spec.prefix}`).toBe(false);
    }
  });

  it('tabela wielkości filtra jest ZAMKNIĘTA — każdy podpis rejestru ma wielkość', () => {
    // Deklaracja „tabela zamknięta" bez testu byłaby fałszywą pewnością: linia
    // z podpisem spoza tabeli przechodzi przez filtry niefiltrowalna.
    const rodziny = Object.values(RESULT_LABEL_TEMPLATES);
    const podpisy = rodziny.flatMap((rodzina) =>
      Object.values(rodzina).flatMap((specs) => (specs ?? []).map((s) => s.prefix)),
    );
    expect(podpisy.length).toBeGreaterThan(0);
    for (const podpis of podpisy) {
      expect(resultLabelLineQuantity(podpis), `podpis bez wielkości: ${podpis}`).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Budowniczy etykiet
// ---------------------------------------------------------------------------

describe('Etykiety różnic — treść z backendu', () => {
  it('linia niesie różnicę ZE ZNAKIEM i jednostką z payloadu', () => {
    const wpisy = buildResultLabelsFromScene(
      sceneL2,
      { run_id: 'sc-run-b', analysis_type: 'DELTA_SC', elements: nakladkaFixture().elements },
      singleHop,
    );
    expect(wpisy[busOwnerRef].lines[0]).toEqual({ prefix: 'Δ Ik″', text: '+2,00 kA' });
    expect(wpisy[busOwnerRef].lines[1]).toEqual({ prefix: 'Δ Ik″ %', text: '+25,0 %' });
    expect(wpisy[busOwnerRef].severity).toBe('WARNING');
  });

  it('S9-13: etykieta niesie wartość B obok różnicy (Δ przed B, potem Δ %)', () => {
    // Payload z metryką `B_IK_3F_KA` (kontrakt 1.3.0) — kolejność linii to
    // priorytet szablonu: różnica (najważniejsza), wartość, której dotyczy,
    // różnica względna. Wartość B BEZ znaku (wielkość bezwzględna, nie zmiana).
    const zWartosciaB = nakladkaFixture({
      elements: {
        [busRef]: elementRoznic('WARNING', {
          DELTA_IK_3F_KA: metryka('DELTA_IK_3F_KA', 2, 'kA', 'fixed2'),
          B_IK_3F_KA: metryka('B_IK_3F_KA', 10, 'kA', 'fixed2'),
          DELTA_IK_3F_PCT: metryka('DELTA_IK_3F_PCT', 25, '%', 'fixed1'),
        }),
      },
    });
    const wpisy = buildResultLabelsFromScene(
      sceneL2,
      { run_id: 'sc-run-b', analysis_type: 'DELTA_SC', elements: zWartosciaB.elements },
      singleHop,
    );
    expect(wpisy[busOwnerRef].lines[0]).toEqual({ prefix: 'Δ Ik″', text: '+2,00 kA' });
    // `formatCurrent` (ten sam formatter co Ik″ pojedynczego przebiegu):
    // 1 miejsce po przecinku dla kA.
    expect(wpisy[busOwnerRef].lines[1]).toEqual({ prefix: 'Ik″ (B)', text: '10,0 kA' });
    expect(wpisy[busOwnerRef].lines[2]).toEqual({ prefix: 'Δ Ik″ %', text: '+25,0 %' });
  });

  it('spadek zachowuje znak ujemny (kierunek zmiany jest informacją)', () => {
    const spadek = nakladkaFixture({
      elements: {
        [busRef]: elementRoznic('WARNING', {
          DELTA_IK_3F_KA: metryka('DELTA_IK_3F_KA', -1.5, 'kA', 'fixed2'),
        }),
      },
    });
    const wpisy = buildResultLabelsFromScene(
      sceneL2,
      { run_id: 'sc-run-b', analysis_type: spadek.analysis_type, elements: spadek.elements },
      singleHop,
    );
    expect(wpisy[busOwnerRef].lines[0].text).toBe('-1,50 kA');
  });

  it('punkt bez różnic nie dostaje etykiety (zero atrap)', () => {
    const wpisy = buildResultLabelsFromScene(
      sceneL2,
      {
        run_id: 'sc-run-b',
        analysis_type: 'DELTA_SC',
        elements: { [busRef]: elementRoznic('INFO', {}) },
      },
      singleHop,
    );
    expect(wpisy[busOwnerRef]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Kanwa — pierwszeństwo, pochodzenie, świeżość, wyjście z trybu
// ---------------------------------------------------------------------------

describe('Kanwa w trybie różnic A/B', () => {
  it('nakładka różnic ma pierwszeństwo nad wynikiem pojedynczego przebiegu', () => {
    useRawResultOverlayStore.getState().setPayload(payloadZwarciowy('sc-run-b'));
    useSldDeltaOverlayStore.setState({ nakladka: nakladkaJednaLinia() });

    const { container } = render(<SldCanvasV3Workspace width={CANVAS_W} height={CANVAS_H} lodOverride={2} />);

    const tresc = trescWarstwyWynikowej(container);
    expect(tresc).toContain('Δ Ik″');
    // Wartość bezwzględna przebiegu B (12,5 kA) NIE może zostać na ekranie —
    // inaczej operator czytałby dwie różne wielkości pod jednym punktem.
    expect(tresc).not.toContain('12,5 kA');
  });

  it('pochodzenie deklaruje OBA przebiegi pary', () => {
    useSldDeltaOverlayStore.setState({ nakladka: nakladkaFixture() });
    const { container } = render(<SldCanvasV3Workspace width={CANVAS_W} height={CANVAS_H} lodOverride={2} />);

    const badge = container.querySelector('[data-testid="sld-v3-overlay-provenance"]');
    expect(badge).toBeTruthy();
    expect(badge!.getAttribute('data-run-id')).toBe('sc-run-a → sc-run-b');
    expect(badge!.getAttribute('data-analysis-type-label')).toContain('Różnice A/B');
  });

  it('edycja modelu (wyniki OUTDATED) znaczy różnice jako nieaktualne', () => {
    // Ta sama reguła świeżości co dla wyniku pojedynczego przebiegu — różnica
    // policzona na modelu sprzed edycji jest tak samo nieaktualna.
    useSldDeltaOverlayStore.setState({ nakladka: nakladkaJednaLinia() });
    useAppStateStore.setState({ activeCaseResultStatus: 'OUTDATED' });

    const { container } = render(<SldCanvasV3Workspace width={CANVAS_W} height={CANVAS_H} lodOverride={2} />);

    const warstwa = container.querySelector('[data-testid="sld-v3-result-labels"]')!;
    const znaczniki = Array.from(warstwa.querySelectorAll('[data-result-stale]'));
    expect(znaczniki.length).toBeGreaterThan(0);
    expect(znaczniki.every((el) => el.getAttribute('data-result-stale') === 'true')).toBe(true);
  });

  it('tryb porównawczy kolejnych biegów jest wykluczony, gdy trwają różnice A/B', () => {
    useRawResultOverlayStore.getState().setPayload(payloadZwarciowy('sc-run-a'));
    useRawResultOverlayStore.getState().setPayload(payloadZwarciowy('sc-run-b'));
    useSldDeltaOverlayStore.setState({ nakladka: nakladkaFixture() });

    render(<SldCanvasV3Workspace width={CANVAS_W} height={CANVAS_H} lodOverride={2} />);
    otworzPanelFiltrow();

    expect(screen.getByTestId('sld-v3-result-comparison').getAttribute('data-comparison-available')).toBe('false');
    expect(screen.getByTestId('sld-v3-result-comparison-blocked').textContent).toContain('różnic A/B');
  });

  it('panel pokazuje parę, rozkład punktów i legendę z backendu', () => {
    useSldDeltaOverlayStore.setState({ nakladka: nakladkaFixture() });
    render(<SldCanvasV3Workspace width={CANVAS_W} height={CANVAS_H} lodOverride={2} />);
    otworzPanelFiltrow();

    expect(screen.getByTestId('sld-v3-result-roznice-para').textContent).toContain('sc-run-a');
    expect(screen.getByTestId('sld-v3-result-roznice-para').textContent).toContain('sc-run-b');
    expect(screen.getByTestId('sld-v3-result-roznice-liczby').textContent).toContain('Zmienione: 1');
    // Punkty bez odpowiednika nie są elementami nakładki — ich liczba musi być
    // widoczna, inaczej brak byłby niemy.
    expect(screen.getByTestId('sld-v3-result-roznice-braki').textContent).toContain('2');
    expect(screen.getByText(/Bez zmian —/)).toBeTruthy();
  });

  it('sekcja różnic nie istnieje, gdy tryb różnic nie trwa (zero martwej kontrolki)', () => {
    useRawResultOverlayStore.getState().setPayload(payloadZwarciowy('sc-run-b'));
    render(<SldCanvasV3Workspace width={CANVAS_W} height={CANVAS_H} lodOverride={2} />);
    otworzPanelFiltrow();

    expect(screen.queryByTestId('sld-v3-result-roznice')).toBeNull();
  });

  it('KLIK „Wyłącz różnice" przywraca wynik pojedynczego przebiegu', async () => {
    const user = userEvent.setup();
    useRawResultOverlayStore.getState().setPayload(payloadZwarciowy('sc-run-b'));
    useSldDeltaOverlayStore.setState({ nakladka: nakladkaJednaLinia() });

    const { container } = render(<SldCanvasV3Workspace width={CANVAS_W} height={CANVAS_H} lodOverride={2} />);
    otworzPanelFiltrow();

    await user.click(screen.getByTestId('sld-v3-result-roznice-wylacz'));

    expect(useSldDeltaOverlayStore.getState().nakladka).toBeNull();
    const tresc = trescWarstwyWynikowej(container);
    expect(tresc).toContain('12,5 kA');
    expect(tresc).not.toContain('Δ Ik″');
  });
});
