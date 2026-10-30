// @vitest-environment node
/**
 * P0.8 nN (H_PLAN_IMPLEMENTACJI_NN §P0.8 pkt 5) — nakładka SWZ (`overlay.ts`
 * `buildSwzOverlayFromResponses`): budowniczy CZYSTY z
 * odpowiedzi endpointu SWZ per obwód (`GET /{case_id}/enm/swz`, karta
 * P0.6/G-22). ZERO fizyki w UI — testy sprawdzają WYŁĄCZNIE przepisanie
 * gotowego werdyktu backendu, zero przeliczeń.
 */
import { describe, expect, it } from 'vitest';

import { scenariusz } from '../../lv-domain/fixtures/scenariusze';
import {
  buildSwzOverlayFromResponses,
  KRYTERIUM_SWZ_PRADU_TN,
  type SwzApiResponse,
} from '../overlay';

/** Odpowiedzi SWZ z backendu (fikstura `18_swz_overlay` z generatora projekcji nN): QF-01
 *  kryterium spełnione przy modelu niezwalidowanym, QF-02 naruszone, FU-03 bez podstawy
 *  (wkładka gG bez bramki I-t przy t_wym). Rekordy W są prawdziwe — test nie fabrykuje statusu. */
function odpowiedzi(): readonly SwzApiResponse[] {
  return scenariusz('18_swz_overlay').swz_snapshot.transformers.flatMap((t) => t.feeders.map((f) => f.swz));
}

function odpowiedz(ref: string): SwzApiResponse {
  const r = odpowiedzi().find((o) => o.breaker_ref === ref);
  if (!r) throw new Error(`brak odpowiedzi ${ref} w fiksturze`);
  return r;
}

describe('P0.8 nN — buildSwzOverlayFromResponses (przepisanie rekordu W SWZ)', () => {
  it('status=OK: wpis w nakładce — status, etykieta, zdanie i liczby przepisane 1:1 z rekordu (zero przeliczeń)', () => {
    const r = odpowiedz('QF-01');
    const swz = r.swz;
    if (!swz || 'uklad' in swz) throw new Error('fikstura QF-01 musi nieść werdykt TN');
    const overlay = buildSwzOverlayFromResponses([r]);
    expect(overlay['QF-01']).toEqual({
      ownerRef: 'QF-01',
      status: swz.wymaganie.status_maszynowy,
      etykieta: swz.wymaganie.etykieta,
      kryteriaNaruszone: [],
      przyczynaPl: swz.wymaganie.wyjasnienie.zdanie_pl,
      oznaczeniePradu: 'Ik₁min',
      ik1MinA: swz.ik1_min_a,
      iaWymaganeA: swz.ia_wymagane_a,
      tWymaganyS: swz.t_wymagany_s,
      margines: swz.margines,
    });
    // Kryterium spełnione na liczbach przy modelu niezwalidowanym ≠ „spełnia”.
    expect(overlay['QF-01'].status).toBe('BRAK_DOWODU');
    expect(overlay['QF-01'].etykieta.semantyka).toBe('ostrzegawcza');
  });

  it('rekord naruszony: status i naruszenie z rekordu (nie fabrykuje spełnienia)', () => {
    const overlay = buildSwzOverlayFromResponses([odpowiedz('QF-02')]);
    expect(overlay['QF-02'].status).toBe('NIE_SPELNIA');
    expect(overlay['QF-02'].kryteriaNaruszone).toContain(KRYTERIUM_SWZ_PRADU_TN);
    expect(overlay['QF-02'].etykieta.semantyka).toBe('negatywna');
  });

  it('rekord bez podstawy (wkładka gG bez bramki I-t): przepisany, ia/margines null, bez naruszenia', () => {
    const overlay = buildSwzOverlayFromResponses([odpowiedz('FU-03')]);
    expect(overlay['FU-03'].status).toBe('BRAK_PODSTAWY');
    expect(overlay['FU-03'].kryteriaNaruszone).toEqual([]);
    expect(overlay['FU-03'].iaWymaganeA).toBeNull();
    expect(overlay['FU-03'].margines).toBeNull();
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
      odpowiedz('QF-01'),
      { status: 'brak danych', breaker_ref: 'brc/missing' },
      odpowiedz('QF-02'),
      { status: 'nie dotyczy', breaker_ref: 'brc/nontn' },
    ]);
    expect(Object.keys(overlay).sort()).toEqual(['QF-01', 'QF-02']);
  });

  it('deterministyczna: to samo wejście ⇒ identyczny wynik', () => {
    const responses = odpowiedzi();
    const a = buildSwzOverlayFromResponses(responses);
    const b = buildSwzOverlayFromResponses(responses);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('pusta lista odpowiedzi ⇒ pusta nakładka (zero fabrykacji)', () => {
    expect(buildSwzOverlayFromResponses([])).toEqual({});
  });
});
