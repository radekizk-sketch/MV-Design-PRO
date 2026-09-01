/**
 * Klient atomowej projekcji nN (kontrakt 2.0.0, kanon
 * `docs/sld/PROJEKCJA_SN_NN_PORTAL_V1.md` §3): JEDNO żądanie, odpowiedź
 * przyjęta WYŁĄCZNIE gdy (a) ma obsługiwaną wersję i kształt, (b) jej
 * tożsamość (przypadek/stacja/scenariusz) jest tożsamością żądania. Iloczyn
 * cech: {wersja zgodna/niezgodna} × {kształt pełny/bez transformers/bez wysp}
 * × {tożsamość zgodna/inny przypadek/inna stacja/inny scenariusz}.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ISLAND_DOMAIN_PROJECTION } from '../fixtures/islandDomain';
import { fetchLvDomainProjectionV1, isLvDomainProjectionV1, projectionIdentityMismatch } from '../projectionApi';
import { LV_DOMAIN_PROJECTION_CONTRACT_VERSION } from '../types';

const REQUEST = { caseId: ISLAND_DOMAIN_PROJECTION.case_id, stationRef: ISLAND_DOMAIN_PROJECTION.station_ref } as const;

function odpowiedz(body: unknown, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
    ),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('isLvDomainProjectionV1 — wersja i kształt kontraktu', () => {
  it('fixtura projekcji ma kształt 2.0.0 (transformers[], islands, tożsamość w model_snapshot)', () => {
    expect(LV_DOMAIN_PROJECTION_CONTRACT_VERSION).toBe('2.0.0');
    expect(isLvDomainProjectionV1(ISLAND_DOMAIN_PROJECTION)).toBe(true);
  });

  it('inna wersja kontraktu = odrzucenie (ten sam identyfikator na dwóch kształtach byłby cichą pułapką)', () => {
    expect(isLvDomainProjectionV1({ ...ISLAND_DOMAIN_PROJECTION, contract_version: '1.0.0' })).toBe(false);
  });

  it('brak `swz_snapshot.transformers` (płaska lista odpływów sprzed 2.0.0) = odrzucenie', () => {
    const { transformers: _t, ...bezTransformatorow } = ISLAND_DOMAIN_PROJECTION.swz_snapshot;
    expect(
      isLvDomainProjectionV1({ ...ISLAND_DOMAIN_PROJECTION, swz_snapshot: { ...bezTransformatorow, feeders: [] } }),
    ).toBe(false);
  });

  it('graf OK bez `islands` = odrzucenie (energizacja i wyspy są obowiązkowe)', () => {
    const { islands: _i, ...grafBezWysp } = ISLAND_DOMAIN_PROJECTION.graph;
    expect(isLvDomainProjectionV1({ ...ISLAND_DOMAIN_PROJECTION, graph: grafBezWysp })).toBe(false);
  });

  it('brak tożsamości żądania w `model_snapshot` = odrzucenie', () => {
    const { case_id: _c, ...snapshotBezTozsamosci } = ISLAND_DOMAIN_PROJECTION.model_snapshot;
    expect(isLvDomainProjectionV1({ ...ISLAND_DOMAIN_PROJECTION, model_snapshot: snapshotBezTozsamosci })).toBe(false);
  });
});

describe('projectionIdentityMismatch — odpowiedź musi być odpowiedzią NA TO żądanie', () => {
  it('zgodna tożsamość → brak rozjazdu', () => {
    expect(projectionIdentityMismatch(ISLAND_DOMAIN_PROJECTION, REQUEST)).toBeNull();
    expect(projectionIdentityMismatch(ISLAND_DOMAIN_PROJECTION, { ...REQUEST, scenario: 'MAX' })).toBeNull();
  });

  it('inny przypadek / inna stacja / inny scenariusz → nazwany rozjazd', () => {
    expect(projectionIdentityMismatch(ISLAND_DOMAIN_PROJECTION, { ...REQUEST, caseId: 'inny-przypadek' })).toContain('przypadku');
    expect(projectionIdentityMismatch(ISLAND_DOMAIN_PROJECTION, { ...REQUEST, stationRef: 'inna-stacja' })).toContain('stacji');
    expect(projectionIdentityMismatch(ISLAND_DOMAIN_PROJECTION, { ...REQUEST, scenario: 'MIN' })).toContain('scenariusza');
  });
});

describe('fetchLvDomainProjectionV1 — jedno żądanie, odpowiedź przyjęta albo odrzucona z powodem', () => {
  it('poprawna odpowiedź wraca bez zmian; adres niesie scenariusz (i run_id, gdy wskazany)', async () => {
    odpowiedz(ISLAND_DOMAIN_PROJECTION);
    const wynik = await fetchLvDomainProjectionV1({ ...REQUEST, runId: 'run-7' });
    expect(wynik).toEqual(ISLAND_DOMAIN_PROJECTION);
    const url = String((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]);
    expect(url).toContain(`/api/cases/${REQUEST.caseId}/enm/lv-domain/${REQUEST.stationRef}/projection/v1?`);
    expect(url).toContain('scenario=MAX');
    expect(url).toContain('run_id=run-7');
  });

  it('odpowiedź z inną wersją → błąd z nazwą obsługiwanej wersji', async () => {
    odpowiedz({ ...ISLAND_DOMAIN_PROJECTION, contract_version: '1.0.0' });
    await expect(fetchLvDomainProjectionV1(REQUEST)).rejects.toThrow('2.0.0');
  });

  it('odpowiedź dla innej stacji (np. z pamięci podręcznej) → błąd tożsamości, nie cudzy rysunek', async () => {
    odpowiedz(ISLAND_DOMAIN_PROJECTION);
    await expect(fetchLvDomainProjectionV1({ ...REQUEST, stationRef: 'inna-stacja' })).rejects.toThrow('nie odpowiada żądaniu');
  });

  it('błąd HTTP → treść `detail` backendu jako komunikat', async () => {
    odpowiedz({ detail: 'Przebieg należy do innego przypadku.' }, 409);
    await expect(fetchLvDomainProjectionV1(REQUEST)).rejects.toThrow('Przebieg należy do innego przypadku.');
  });
});
