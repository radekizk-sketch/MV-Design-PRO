/**
 * GPZ-PARYTET cz. 2 (pkt 4): przesunięcia portów stacji po wyciągu z martwego
 * silnika mini-bloku. Iloczyn cech: liczba pól (0, 1, 3, 5) × pola liniowe
 * (brak, jedno, dwa+) × obwód PV po stronie nN (brak, PV nN, PV SN, BESS nN).
 * Wartości referencyjne zmierzone dawną funkcją
 * `v2/renderer/MiniBlockRmuRenderer.tsx` `miniBlockStationPortOffsets('detail', …)`
 * przed jej skasowaniem (ten sam plik testu uruchomiony na obu implementacjach).
 */
import { describe, expect, it } from 'vitest';

import { FIELD_ROLE, type FieldRole } from '../../domain/apparatusContracts';
import { miniBlockStationPortOffsets } from '../stationPortOffsets';
import type { MiniBlockBayDescriptor, MiniBlockDerBadge } from '../widokPolStacji';

function pola(...role: FieldRole[]): MiniBlockBayDescriptor[] {
  return role.map((fieldRole, i) => ({
    bayRef: `bay-${i}`,
    fieldRole,
    designation: `P${i}`,
    hasMissingRequiredDevice: false,
  }));
}

const PV_NN: MiniBlockDerBadge = { kind: 'PV', count: 1, connectionSide: 'nn' };
const PV_SN: MiniBlockDerBadge = { kind: 'PV', count: 1, connectionSide: 'sn' };
const BESS_NN: MiniBlockDerBadge = { kind: 'BESS', count: 1, connectionSide: 'nn' };

describe('miniBlockStationPortOffsets', () => {
  it('brak pól → brak przesunięć', () => {
    expect(miniBlockStationPortOffsets([])).toBeNull();
  });

  it('pola bez roli liniowej → brak przesunięć', () => {
    expect(miniBlockStationPortOffsets(pola(FIELD_ROLE.TRANSFORMER, FIELD_ROLE.MEASUREMENT))).toBeNull();
  });

  it('jedno pole liniowe stoi na osi', () => {
    expect(miniBlockStationPortOffsets(pola(FIELD_ROLE.LINE_IN))).toEqual([0, null]);
  });

  it('trzy pola (WE, TR, WY) bez obwodu PV', () => {
    const p = pola(FIELD_ROLE.LINE_IN, FIELD_ROLE.TRANSFORMER, FIELD_ROLE.LINE_OUT);
    expect(miniBlockStationPortOffsets(p)).toEqual([-86, 86]);
    expect(miniBlockStationPortOffsets(p, [PV_SN])).toEqual([-86, 86]);
    expect(miniBlockStationPortOffsets(p, [BESS_NN])).toEqual([-86, 86]);
  });

  it('trzy pola z obwodem PV po stronie nN — szersza szyna', () => {
    const p = pola(FIELD_ROLE.LINE_IN, FIELD_ROLE.TRANSFORMER, FIELD_ROLE.LINE_OUT);
    expect(miniBlockStationPortOffsets(p, [PV_NN])).toEqual([-146, 146]);
  });

  it('pięć pól: pierwsze dwa liniowe po TR i pomiarze', () => {
    const p = pola(
      FIELD_ROLE.TRANSFORMER,
      FIELD_ROLE.MEASUREMENT,
      FIELD_ROLE.RMU_LINE,
      FIELD_ROLE.DER_BESS,
      FIELD_ROLE.LINE_BRANCH,
    );
    expect(miniBlockStationPortOffsets(p)).toEqual([0, 43]);
  });
});
