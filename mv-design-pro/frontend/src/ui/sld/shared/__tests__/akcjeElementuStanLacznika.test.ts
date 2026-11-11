/**
 * KARTA W5-C — dostępność pozycji stanu łącznika w menu schematu (`akcjeElementu`).
 *
 * Iloczyn cech: obiekt menu {pole z jednym łącznikiem, aparat pola `⟨pole⟩#⟨rodzaj⟩`,
 * łącznik sekcyjny na trasie (gałąź `switch`), sprzęgło sekcji (gałąź `bus_coupler`)} ×
 * stan łącznika {zamknięty bez deklaracji, otwarty bez deklaracji, punkt normalnie otwarty,
 * normalnie zamknięty a chwilowo otwarty, bezpiecznik zamknięty, bezpiecznik otwarty} ×
 * pozycja {otwórz, zamknij, ustaw punkt podziału}. Dodatkowo obiekty bez jednego łącznika
 * (pole bez łącznika, pole z dwoma łącznikami) blokują wszystkie trzy pozycje z powodem —
 * tym samym, którym wykonawca odmawia (jeden resolver `lacznikTematu`, predykaty parami).
 */
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../types/enm';
import { akcjeElementu } from '../akcjeElementu';
import type { CanvasMenuSubject } from '../../v3/canvas/canvasMenuSubject';

type Stan = 'zamkniety' | 'otwarty' | 'nop' | 'nz-otwarty' | 'bezp-zamkniety' | 'bezp-otwarty';
type Obiekt = 'pole' | 'aparat' | 'trasa' | 'sprzeglo';

const STANY: Readonly<Record<Stan, { type: string; status: 'open' | 'closed'; normal?: 'open' | 'closed' }>> = {
  zamkniety: { type: 'switch', status: 'closed' },
  otwarty: { type: 'switch', status: 'open' },
  nop: { type: 'switch', status: 'open', normal: 'open' },
  'nz-otwarty': { type: 'breaker', status: 'open', normal: 'closed' },
  'bezp-zamkniety': { type: 'fuse', status: 'closed' },
  'bezp-otwarty': { type: 'fuse', status: 'open' },
};

function migawka(obiekt: Obiekt, stan: Stan): EnergyNetworkModel {
  const s = STANY[stan];
  const typ = obiekt === 'sprzeglo' && s.type !== 'fuse' ? 'bus_coupler' : s.type;
  return {
    branches: [
      {
        id: 'q1', ref_id: 'q1', name: 'Q1', type: typ, status: s.status,
        from_bus_ref: 'a', to_bus_ref: 'b', tags: [], meta: {},
        ...(s.normal ? { normal_state: s.normal } : {}),
      },
      { id: 'q2', ref_id: 'q2', name: 'Q2', type: 'switch', status: 'closed', from_bus_ref: 'c', to_bus_ref: 'd', tags: [], meta: {} },
    ],
    bays: [
      { id: 'pole-1', ref_id: 'pole-1', bay_role: 'OUT', bus_ref: 'a', equipment_refs: ['q1'] },
      { id: 'pole-0', ref_id: 'pole-0', bay_role: 'OUT', bus_ref: 'a', equipment_refs: [] },
      { id: 'pole-2', ref_id: 'pole-2', bay_role: 'OUT', bus_ref: 'a', equipment_refs: ['q1', 'q2'] },
    ],
    substations: [],
    buses: [],
  } as unknown as EnergyNetworkModel;
}

function temat(obiekt: Obiekt | 'pole-0' | 'pole-2'): CanvasMenuSubject {
  switch (obiekt) {
    case 'pole':
      return { menuKind: 'bay', modelRef: 'pole-1', kotwica: 'pole' } as CanvasMenuSubject;
    case 'aparat':
      return { menuKind: 'apparatus', modelRef: 'pole-1#cb', kotwica: 'pole' } as CanvasMenuSubject;
    case 'trasa':
    case 'sprzeglo':
      return { menuKind: 'apparatus', modelRef: 'q1', kotwica: 'galaz', rodzinaGalezi: 'switch' } as CanvasMenuSubject;
    case 'pole-0':
      return { menuKind: 'bay', modelRef: 'pole-0', kotwica: 'pole' } as CanvasMenuSubject;
    case 'pole-2':
      return { menuKind: 'bay', modelRef: 'pole-2', kotwica: 'pole' } as CanvasMenuSubject;
  }
}

function pozycje(snapshot: EnergyNetworkModel | null, t: CanvasMenuSubject) {
  const akcje = akcjeElementu(snapshot, null, t, 'NONE');
  const znajdz = (id: string) => {
    const a = akcje.find((x) => x.id === id);
    expect(a, `menu ${t.menuKind} nie ma pozycji ${id}`).toBeDefined();
    return a!;
  };
  return {
    otworz: znajdz('open-switch'),
    zamknij: znajdz('close-switch'),
    nop: znajdz('set-normal-open-point'),
  };
}

describe('menu schematu — obiekt × stan łącznika × pozycja', () => {
  const przypadki: Array<[string, Obiekt, Stan]> = [];
  for (const obiekt of ['pole', 'aparat', 'trasa', 'sprzeglo'] as const) {
    for (const stan of Object.keys(STANY) as Stan[]) przypadki.push([`${obiekt} × ${stan}`, obiekt, stan]);
  }

  it.each(przypadki)('%s', (_opis, obiekt, stan) => {
    const s = STANY[stan];
    const { otworz, zamknij, nop } = pozycje(migawka(obiekt, stan), temat(obiekt));
    expect(otworz.disabled === true).toBe(s.status === 'open');
    expect(zamknij.disabled === true).toBe(s.status === 'closed');
    const bezpiecznik = s.type === 'fuse';
    expect(nop.disabled === true).toBe(bezpiecznik || stan === 'nop');
    if (otworz.disabled) expect(otworz.disabledReasonPl).toBe('Łącznik jest już otwarty.');
    if (zamknij.disabled) expect(zamknij.disabledReasonPl).toBe('Łącznik jest już zamknięty.');
    if (bezpiecznik) expect(nop.disabledReasonPl).toContain('Bezpiecznik nie ma pozycji normalnej');
    if (stan === 'nop') expect(nop.disabledReasonPl).toBe('Łącznik jest już punktem normalnie otwartym.');
  });

  it.each([
    ['pole-0', 'Pole nie ma łącznika w modelu sieci.'],
    ['pole-2', 'Pole ma kilka łączników (Q1, Q2)'],
  ] as const)('%s: wszystkie trzy pozycje zablokowane z powodem resolvera', (obiekt, powod) => {
    const { otworz, zamknij, nop } = pozycje(migawka('pole', 'zamkniety'), temat(obiekt));
    for (const a of [otworz, zamknij, nop]) {
      expect(a.disabled).toBe(true);
      expect(a.disabledReasonPl).toContain(powod);
    }
  });

  it('brak migawki: pozycje bez pomiaru nie są blokowane domysłem (odmowę nazwie wykonawca)', () => {
    const { otworz, zamknij, nop } = pozycje(null, temat('pole'));
    expect([otworz.disabled, zamknij.disabled, nop.disabled]).toEqual([undefined, undefined, undefined]);
  });
});
