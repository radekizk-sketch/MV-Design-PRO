/**
 * P0.8 nN (H_PLAN_IMPLEMENTACJI_NN §P0.8 pkt 5) — nakładka SWZ (`overlay.ts`
 * `buildSwzOverlayFromResponses`/`swzPresentationTone`): budowniczy CZYSTY z
 * odpowiedzi endpointu SWZ per obwód (`GET /{case_id}/enm/swz`, karta
 * P0.6/G-22). ZERO fizyki w UI — testy sprawdzają WYŁĄCZNIE przepisanie
 * gotowego werdyktu backendu, zero przeliczeń.
 */
import { describe, expect, it } from 'vitest';

import {
  buildSwzOverlayFromResponses,
  swzPresentationTone,
  type SwzApiResponse,
} from '../overlay';

function okResponse(overrides: Partial<SwzApiResponse['swz']> & { breaker_ref: string }): SwzApiResponse {
  const { breaker_ref, ...swz } = overrides;
  return {
    status: 'OK',
    breaker_ref,
    swz: {
      status: 'spełnia',
      przyczyna_pl: 'Ik1_min ≥ Ia wymagane',
      ik1_min_a: 250,
      ia_wymagane_a: 160,
      t_wymagany_s: 0.4,
      margines: 1.5625,
      ...swz,
    },
  };
}

describe('P0.8 nN — buildSwzOverlayFromResponses (przepisanie werdyktu 3-stanowego)', () => {
  it('status=OK: wpis w nakładce, wartości przepisane 1:1 (zero przeliczeń)', () => {
    const overlay = buildSwzOverlayFromResponses([
      okResponse({ breaker_ref: 'brc/mcb1', status: 'spełnia', ik1_min_a: 250, ia_wymagane_a: 160, margines: 1.5625 }),
    ]);
    expect(overlay['brc/mcb1']).toEqual({
      ownerRef: 'brc/mcb1',
      status: 'spełnia',
      przyczynaPl: 'Ik1_min ≥ Ia wymagane',
      ik1MinA: 250,
      iaWymaganeA: 160,
      tWymaganyS: 0.4,
      margines: 1.5625,
    });
  });

  it('status=OK, werdykt "nie spełnia": przepisany bez zmian (nie fabrykuje "spełnia")', () => {
    const overlay = buildSwzOverlayFromResponses([
      okResponse({ breaker_ref: 'brc/mcb2', status: 'nie spełnia', ik1_min_a: 90, ia_wymagane_a: 160, margines: 0.5625 }),
    ]);
    expect(overlay['brc/mcb2'].status).toBe('nie spełnia');
    expect(overlay['brc/mcb2'].margines).toBe(0.5625);
  });

  it('status=OK, werdykt "nierozstrzygalne" (np. wkładka gG bez bramek I-t): przepisany, ia/t mogą być null', () => {
    const overlay = buildSwzOverlayFromResponses([
      okResponse({
        breaker_ref: 'brc/fuse1', status: 'nierozstrzygalne', ia_wymagane_a: null, t_wymagany_s: null, margines: null,
      }),
    ]);
    expect(overlay['brc/fuse1'].status).toBe('nierozstrzygalne');
    expect(overlay['brc/fuse1'].iaWymaganeA).toBeNull();
    expect(overlay['brc/fuse1'].margines).toBeNull();
  });

  it('status="brak danych" (envelope): WPIS POMINIĘTY — uczciwy brak, zero fabrykacji werdyktu bez dowodu', () => {
    const overlay = buildSwzOverlayFromResponses([
      { status: 'brak danych', breaker_ref: 'brc/nodata' },
    ]);
    expect(overlay['brc/nodata']).toBeUndefined();
    expect(Object.keys(overlay)).toHaveLength(0);
  });

  it('status="nie dotyczy" (układ nie-TN): WPIS POMINIĘTY', () => {
    const overlay = buildSwzOverlayFromResponses([
      { status: 'nie dotyczy', breaker_ref: 'brc/nontn' },
    ]);
    expect(overlay['brc/nontn']).toBeUndefined();
  });

  it('mieszanka: tylko odpowiedzi status=OK trafiają do nakładki, pozostałe pominięte', () => {
    const overlay = buildSwzOverlayFromResponses([
      okResponse({ breaker_ref: 'brc/ok1' }),
      { status: 'brak danych', breaker_ref: 'brc/missing' },
      okResponse({ breaker_ref: 'brc/ok2', status: 'nie spełnia' }),
      { status: 'nie dotyczy', breaker_ref: 'brc/nontn' },
    ]);
    expect(Object.keys(overlay).sort()).toEqual(['brc/ok1', 'brc/ok2']);
  });

  it('deterministyczna: to samo wejście ⇒ identyczny wynik', () => {
    const responses = [okResponse({ breaker_ref: 'brc/a' }), okResponse({ breaker_ref: 'brc/b', status: 'nierozstrzygalne' })];
    const a = buildSwzOverlayFromResponses(responses);
    const b = buildSwzOverlayFromResponses(responses);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('pusta lista odpowiedzi ⇒ pusta nakładka (zero fabrykacji)', () => {
    expect(buildSwzOverlayFromResponses([])).toEqual({});
  });
});

describe('P0.8 nN — swzPresentationTone (klasyfikacja 3-stanowa, fail-closed)', () => {
  it('"spełnia" → ok', () => {
    expect(swzPresentationTone('spełnia')).toBe('ok');
  });
  it('"nie spełnia" → fail', () => {
    expect(swzPresentationTone('nie spełnia')).toBe('fail');
  });
  it('"nierozstrzygalne" → unknown (fail-closed, NIGDY "ok" bez dowodu)', () => {
    expect(swzPresentationTone('nierozstrzygalne')).toBe('unknown');
  });
});
