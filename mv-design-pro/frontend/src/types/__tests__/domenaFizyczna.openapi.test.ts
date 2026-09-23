/**
 * Karta AB-1a D1: literały domeny fizycznej frontu (`types/domenaFizyczna.ts`) PRZYPIĘTE do
 * kontraktu backendu (`backend/schemas/openapi_snapshot.json`, schemat `PhysicsDomain`
 * z `GET /api/solver-capabilities`). Rozjazd = czerwony test, nie cicha druga lista.
 * Snapshot regeneruje `backend/scripts/generuj_snapshot_openapi.py`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DOMENY_FIZYCZNE, czyDomenaFizyczna } from '../domenaFizyczna';

type Schemat = { enum?: unknown[]; $ref?: string; properties?: Record<string, Schemat> };
type Snapshot = {
  paths: Record<string, unknown>;
  components: { schemas: Record<string, Schemat> };
};

const SNAPSHOT_PATH = resolve(__dirname, '../../../../backend/schemas/openapi_snapshot.json');
const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as Snapshot;

describe('domena fizyczna frontu = kontrakt OpenAPI backendu (AB-1a D1)', () => {
  it('rejestr zdolności z domeną jest w snapshotcie', () => {
    expect(snapshot.paths).toHaveProperty('/api/solver-capabilities');
    const pole = snapshot.components.schemas.ZdolnoscSolveraV1.properties?.physics_domain;
    expect(pole?.$ref).toBe('#/components/schemas/PhysicsDomain');
  });

  it('literały frontu = enum PhysicsDomain (ta sama kolejność)', () => {
    expect([...DOMENY_FIZYCZNE]).toEqual(snapshot.components.schemas.PhysicsDomain.enum);
  });

  it('strażnik typu odrzuca wartość spoza kontraktu', () => {
    expect(czyDomenaFizyczna('POWER_FLOW')).toBe(true);
    expect(czyDomenaFizyczna('power_flow')).toBe(false);
    expect(czyDomenaFizyczna(null)).toBe(false);
    expect(czyDomenaFizyczna(undefined)).toBe(false);
  });
});
