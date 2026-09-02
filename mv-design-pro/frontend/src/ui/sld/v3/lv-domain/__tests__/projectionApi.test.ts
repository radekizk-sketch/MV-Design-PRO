/**
 * Klient atomowej projekcji nN (kontrakt 3.0.0, kanon
 * `docs/sld/PROJEKCJA_SN_NN_PORTAL_V1.md` §3): JEDNO żądanie, odpowiedź
 * przyjęta WYŁĄCZNIE gdy (a) ma obsługiwaną wersję i kształt, (b) jej
 * tożsamość (przypadek/stacja/scenariusz) jest tożsamością żądania. Iloczyn
 * cech: {wersja zgodna/niezgodna} × {kształt pełny / bez transformers / bez
 * wysp / bez komunikatów walidacji / bez stanu szyny} × {tożsamość zgodna /
 * inny przypadek / inna stacja / inny scenariusz}.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { scenariusz } from '../fixtures/scenariusze';
import { fetchLvDomainProjectionV1, isLvDomainProjectionV1, projectionIdentityMismatch } from '../projectionApi';
import { LV_DOMAIN_PROJECTION_CONTRACT_VERSION } from '../types';

const PROJEKCJA = scenariusz('07_island_grid_following');
const REQUEST = { caseId: PROJEKCJA.case_id, stationRef: PROJEKCJA.station_ref } as const;

function odpowiedz(body: unknown, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
    ),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('isLvDomainProjectionV1 — wersja i kształt kontraktu 3.0.0', () => {
  it('fixtura z backendu ma kształt 3.0.0', () => {
    expect(LV_DOMAIN_PROJECTION_CONTRACT_VERSION).toBe('3.0.0');
    expect(isLvDomainProjectionV1(PROJEKCJA)).toBe(true);
  });

  it('inna wersja kontraktu = odrzucenie (ten sam identyfikator na dwóch kształtach byłby cichą pułapką)', () => {
    expect(isLvDomainProjectionV1({ ...PROJEKCJA, contract_version: '2.0.0' })).toBe(false);
  });

  it('brak `swz_snapshot.transformers` = odrzucenie', () => {
    const { transformers: _t, ...bezTransformatorow } = PROJEKCJA.swz_snapshot;
    expect(isLvDomainProjectionV1({ ...PROJEKCJA, swz_snapshot: { ...bezTransformatorow, feeders: [] } })).toBe(false);
  });

  it('graf OK bez `islands` / `devices` / `segments` / `supply_paths` = odrzucenie (3.0.0 wymaga stanów i ról)', () => {
    if (PROJEKCJA.graph.status !== 'OK') throw new Error('fixtura musi mieć graf OK');
    for (const klucz of ['islands', 'devices', 'segments', 'supply_paths', 'sections', 'measurements', 'protection_assignments'] as const) {
      const graf: Record<string, unknown> = { ...PROJEKCJA.graph };
      delete graf[klucz];
      expect(isLvDomainProjectionV1({ ...PROJEKCJA, graph: graf }), klucz).toBe(false);
    }
  });

  it('szyna bez `energization_state` albo `island_ref` = odrzucenie (stan zasilania jest obowiązkowy per zacisk)', () => {
    if (PROJEKCJA.graph.status !== 'OK') throw new Error('fixtura musi mieć graf OK');
    const [pierwsza, ...reszta] = PROJEKCJA.graph.buses;
    const { energization_state: _e, ...bezStanu } = pierwsza;
    expect(isLvDomainProjectionV1({ ...PROJEKCJA, graph: { ...PROJEKCJA.graph, buses: [bezStanu, ...reszta] } })).toBe(false);
    const { island_ref: _i, ...bezWyspy } = pierwsza;
    expect(isLvDomainProjectionV1({ ...PROJEKCJA, graph: { ...PROJEKCJA.graph, buses: [bezWyspy, ...reszta] } })).toBe(false);
  });

  it('brak `validation_messages` (audyt §34) = odrzucenie', () => {
    const { validation_messages: _v, ...bezAudytu } = PROJEKCJA;
    expect(isLvDomainProjectionV1(bezAudytu)).toBe(false);
  });

  it('brak tożsamości żądania w `model_snapshot` = odrzucenie', () => {
    const { case_id: _c, ...snapshotBezTozsamosci } = PROJEKCJA.model_snapshot;
    expect(isLvDomainProjectionV1({ ...PROJEKCJA, model_snapshot: snapshotBezTozsamosci })).toBe(false);
  });
});

describe('projectionIdentityMismatch — odpowiedź musi być odpowiedzią NA TO żądanie', () => {
  it('zgodna tożsamość → brak rozjazdu', () => {
    expect(projectionIdentityMismatch(PROJEKCJA, REQUEST)).toBeNull();
    expect(projectionIdentityMismatch(PROJEKCJA, { ...REQUEST, scenario: 'MAX' })).toBeNull();
  });

  it('inny przypadek / inna stacja / inny scenariusz → nazwany rozjazd', () => {
    expect(projectionIdentityMismatch(PROJEKCJA, { ...REQUEST, caseId: 'inny-przypadek' })).toContain('przypadku');
    expect(projectionIdentityMismatch(PROJEKCJA, { ...REQUEST, stationRef: 'inna-stacja' })).toContain('stacji');
    expect(projectionIdentityMismatch(PROJEKCJA, { ...REQUEST, scenario: 'MIN' })).toContain('scenariusza');
  });
});

describe('fetchLvDomainProjectionV1 — jedno żądanie, odpowiedź przyjęta albo odrzucona z powodem', () => {
  it('poprawna odpowiedź wraca bez zmian; adres niesie scenariusz (i run_id, gdy wskazany)', async () => {
    odpowiedz(PROJEKCJA);
    const wynik = await fetchLvDomainProjectionV1({ ...REQUEST, runId: 'run-7' });
    expect(wynik).toEqual(PROJEKCJA);
    const url = String((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]);
    expect(url).toContain(`/api/cases/${REQUEST.caseId}/enm/lv-domain/${REQUEST.stationRef}/projection/v1?`);
    expect(url).toContain('scenario=MAX');
    expect(url).toContain('run_id=run-7');
  });

  it('odpowiedź z inną wersją → błąd z nazwą obsługiwanej wersji', async () => {
    odpowiedz({ ...PROJEKCJA, contract_version: '2.0.0' });
    await expect(fetchLvDomainProjectionV1(REQUEST)).rejects.toThrow('3.0.0');
  });

  it('odpowiedź dla innej stacji (np. z pamięci podręcznej) → błąd tożsamości, nie cudzy rysunek', async () => {
    odpowiedz(PROJEKCJA);
    await expect(fetchLvDomainProjectionV1({ ...REQUEST, stationRef: 'inna-stacja' })).rejects.toThrow('nie odpowiada żądaniu');
  });

  it('błąd HTTP → treść `detail` backendu jako komunikat', async () => {
    odpowiedz({ detail: 'Przebieg należy do innego przypadku.' }, 409);
    await expect(fetchLvDomainProjectionV1(REQUEST)).rejects.toThrow('Przebieg należy do innego przypadku.');
  });
});
