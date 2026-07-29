/**
 * R4 (RECENZJA_WARSTWA_WYNIKOWA_2026-07 §wym.10) — testy bufora POPRZEDNIEGO
 * payloadu per `analysis_type` w `rawResultOverlayStore`. Reguła: nowy bieg TEJ
 * SAMEJ analizy (inny run_id) przesuwa dotychczasowy do „poprzedni"; bieg innego
 * typu NIE nadpisuje poprzednika typu bieżącego (trend porównuje kolejne biegi
 * TEJ SAMEJ analizy); `clear()` czyści oba bufory.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  previousPayloadForAnalysis,
  useRawResultOverlayStore,
  type RawOverlayPayload,
} from '../rawResultOverlayStore';

function payload(analysisType: string, runId: string): RawOverlayPayload {
  return { run_id: runId, analysis_type: analysisType, elements: {} };
}

describe('rawResultOverlayStore — poprzedni payload per analiza (R4)', () => {
  beforeEach(() => {
    useRawResultOverlayStore.getState().clear();
  });

  it('nowy bieg TEJ SAMEJ analizy (inny run_id) ⇒ dotychczasowy trafia do „poprzedni"', () => {
    const store = useRawResultOverlayStore;
    store.getState().setPayload(payload('LOAD_FLOW', 'r1'));
    store.getState().setPayload(payload('LOAD_FLOW', 'r2'));
    const state = store.getState();
    expect(state.payload?.run_id).toBe('r2');
    expect(previousPayloadForAnalysis(state.previousByAnalysisType, 'LOAD_FLOW')?.run_id).toBe('r1');
  });

  it('pierwszy bieg ⇒ brak poprzednika (uczciwie, brak porównania)', () => {
    const store = useRawResultOverlayStore;
    store.getState().setPayload(payload('LOAD_FLOW', 'r1'));
    expect(previousPayloadForAnalysis(store.getState().previousByAnalysisType, 'LOAD_FLOW')).toBeNull();
  });

  it('ten sam run_id ⇒ NIE tworzy poprzednika (to nie nowy bieg)', () => {
    const store = useRawResultOverlayStore;
    store.getState().setPayload(payload('LOAD_FLOW', 'r1'));
    store.getState().setPayload(payload('LOAD_FLOW', 'r1'));
    expect(previousPayloadForAnalysis(store.getState().previousByAnalysisType, 'LOAD_FLOW')).toBeNull();
  });

  it('bieg innego typu NIE nadpisuje poprzednika typu bieżącego', () => {
    const store = useRawResultOverlayStore;
    store.getState().setPayload(payload('LOAD_FLOW', 'lf1'));
    store.getState().setPayload(payload('LOAD_FLOW', 'lf2')); // poprzedni LF = lf1
    store.getState().setPayload(payload('short_circuit_3f', 'sc1')); // inny typ
    const state = store.getState();
    // poprzednik LF pozostaje lf1 (SC nie dotknął bufora LF).
    expect(previousPayloadForAnalysis(state.previousByAnalysisType, 'LOAD_FLOW')?.run_id).toBe('lf1');
    // SC nie ma jeszcze poprzednika (pierwszy bieg SC).
    expect(previousPayloadForAnalysis(state.previousByAnalysisType, 'short_circuit_3f')).toBeNull();
  });

  it('kolejny bieg SC ⇒ poprzednik SC osobno od LF', () => {
    const store = useRawResultOverlayStore;
    store.getState().setPayload(payload('LOAD_FLOW', 'lf1'));
    store.getState().setPayload(payload('short_circuit_3f', 'sc1'));
    store.getState().setPayload(payload('short_circuit_3f', 'sc2'));
    expect(previousPayloadForAnalysis(store.getState().previousByAnalysisType, 'short_circuit_3f')?.run_id).toBe('sc1');
  });

  it('setPayload(null) ⇒ zeruje payload, ZACHOWUJE bufor poprzednich; clear() czyści oba', () => {
    const store = useRawResultOverlayStore;
    store.getState().setPayload(payload('LOAD_FLOW', 'r1'));
    store.getState().setPayload(payload('LOAD_FLOW', 'r2'));
    store.getState().setPayload(null);
    expect(store.getState().payload).toBeNull();
    expect(previousPayloadForAnalysis(store.getState().previousByAnalysisType, 'LOAD_FLOW')?.run_id).toBe('r1');
    store.getState().clear();
    expect(store.getState().previousByAnalysisType).toEqual({});
  });
});
