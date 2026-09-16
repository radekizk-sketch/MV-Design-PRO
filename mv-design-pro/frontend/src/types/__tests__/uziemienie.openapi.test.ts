/**
 * W5-A: literały uziemienia frontu (`types/uziemienie.ts`) PRZYPIĘTE do kontraktu backendu
 * (`backend/schemas/openapi_snapshot.json`, `GET /api/catalog/slowniki-uziemienia`,
 * `GET /api/catalog/grupy-polaczen`). Rozjazd = czerwony test, nie cicha druga lista.
 * Snapshot regeneruje `backend/scripts/generuj_snapshot_openapi.py`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ROLE_UZIEMNIKA,
  TYPY_PUNKTU_NEUTRALNEGO,
  UKLADY_SIECI_NN,
  UZIEMIENIA_EKRANU_KABLA,
} from '../uziemienie';

type Schemat = { enum?: unknown[]; items?: Schemat; anyOf?: Schemat[]; $ref?: string };
type Snapshot = {
  paths: Record<string, unknown>;
  components: { schemas: Record<string, { properties: Record<string, Schemat> }> };
};

const SNAPSHOT_PATH = resolve(__dirname, '../../../../backend/schemas/openapi_snapshot.json');
const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as Snapshot;

/** Enum listy (`items.enum`) albo wprost, z rozwinięciem `$ref` do `components.schemas`. */
function enumListy(schemat: Schemat): unknown[] {
  const items = schemat.items ?? schemat;
  if (items.$ref) {
    const nazwa = items.$ref.split('/').pop() ?? '';
    const cel = (snapshot.components.schemas as Record<string, Schemat>)[nazwa];
    if (!cel) throw new Error(`brak schematu ${nazwa}`);
    return enumListy(cel);
  }
  if (items.enum) return items.enum;
  const wariant = items.anyOf?.find((w) => w.enum);
  if (wariant?.enum) return wariant.enum;
  throw new Error(`schemat bez enum: ${JSON.stringify(schemat).slice(0, 200)}`);
}

describe('słowniki uziemienia frontu = kontrakt OpenAPI backendu (W5-A)', () => {
  const slowniki = snapshot.components.schemas.SlownikiUziemienia.properties;

  it('endpointy słowników są w snapshotcie', () => {
    expect(snapshot.paths).toHaveProperty('/api/catalog/slowniki-uziemienia');
    expect(snapshot.paths).toHaveProperty('/api/catalog/grupy-polaczen');
  });

  it('typ punktu neutralnego (GroundingConfig.type)', () => {
    expect([...TYPY_PUNKTU_NEUTRALNEGO]).toEqual(enumListy(slowniki.typy_punktu_neutralnego));
  });

  it('układ sieci nN (Transformer.lv_earthing_system)', () => {
    expect([...UKLADY_SIECI_NN]).toEqual(enumListy(slowniki.uklady_sieci_nn));
  });

  it('układ uziemienia ekranu kabla (Cable.screen_bonding)', () => {
    expect([...UZIEMIENIA_EKRANU_KABLA]).toEqual(enumListy(slowniki.uziemienia_ekranu_kabla));
  });

  it('rola uziemnika pola (BayPrimaryDevice.earthing_role)', () => {
    expect([...ROLE_UZIEMNIKA]).toEqual(enumListy(slowniki.role_uziemnika));
  });

  it('słownik grup połączeń IEC 60076-1 jest zamknięty i niepusty (front pobiera go z API)', () => {
    const grupy = enumListy(snapshot.components.schemas.SlownikGrupPolaczen.properties.grupy);
    expect(grupy.length).toBeGreaterThanOrEqual(40);
    expect(grupy).toContain('Dyn11');
    expect(grupy).toContain('YNd11');
    expect(grupy).toContain('Yzn5');
  });
});
