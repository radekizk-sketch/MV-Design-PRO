/**
 * Wiersze konfiguratora stacji wprost z modelu / projekcji nN — przekaźniki, pola pomiarowe,
 * rozdzielnice i odbiory nN (dawniej stałe puste listy bazowe i stałe bez źródła).
 *
 * Iloczyny cech:
 * - przekaźniki: pole z `protection_ref` rozwiązywalnym × nierozwiązywalnym × bez ref;
 *   zabezpieczenie włączone × wyłączone; nastawy z powtórzoną funkcją; każdy rodzaj
 *   `device_type` ma etykietę ze wspólnej mapy (żadnego surowego kodu);
 * - pola pomiarowe: rola pomiarowa × inna rola; deklaracja (napięcie szyn, każdy rodzaj układu
 *   energii, układ energii bez rodzaju, brak) × przekładniki w polu i w innym polu;
 * - strona nN: status grafu OK × brak danych; sekcja główna × podrozdzielnica; odpływ każdego
 *   rodzaju backendu × odpływ innej sekcji; kolejność sekcji po `order`, odbiorów po `ref_id`.
 */
import { describe, expect, it } from 'vitest';

import type { Bay, ProtectionAssignment } from '../../../../types/enm';
import { ETYKIETA_RODZAJU_ZABEZPIECZENIA } from '../../../shared/etykietyZabezpieczen';
import type { LvDomainGraphView } from '../../../sld/v3/lv-domain/types';
import { przekaznikiStacji } from '../przekaznikiStacji';
import { BRAK_DEKLARACJI_POMIARU_PL, polaPomiaroweStacji } from '../polaPomiaroweStacji';
import { odbioryNnZGrafu, rozdzielniceNnZGrafu } from '../stronaNnStacji';

function zabezpieczenie(
  ref: string,
  device_type: ProtectionAssignment['device_type'],
  funkcje: ProtectionAssignment['settings'][number]['function_type'][],
  is_enabled = true,
): ProtectionAssignment {
  return {
    ref_id: ref,
    name: ref,
    breaker_ref: `cb-${ref}`,
    device_type,
    settings: funkcje.map((function_type) => ({ function_type })),
    is_enabled,
  } as ProtectionAssignment;
}

describe('przekaznikiStacji', () => {
  it('pole → zabezpieczenie po protection_ref; kolejność pól; ref nierozwiązywalny i brak ref pominięte', () => {
    const wiersze = przekaznikiStacji(
      [
        zabezpieczenie('pz-2', 'earth_fault', ['earth_fault_51N'], false),
        zabezpieczenie('pz-1', 'overcurrent', ['overcurrent_50', 'overcurrent_51', 'overcurrent_51']),
        zabezpieczenie('pz-obce', 'distance', []),
      ],
      [
        { oznaczenie: 'Pole 1', protectionRef: 'pz-1' },
        { oznaczenie: 'Pole 2', protectionRef: null },
        { oznaczenie: 'Pole 3', protectionRef: 'pz-nie-ma' },
        { oznaczenie: 'Pole 4', protectionRef: 'pz-2' },
      ],
    );
    expect(wiersze).toEqual([
      {
        relayId: 'pz-1',
        bayDesignation: 'Pole 1',
        typePl: 'Nadprądowe',
        functionsPl: ['50', '51'],
        settingsCount: 3,
        enabled: true,
      },
      {
        relayId: 'pz-2',
        bayDesignation: 'Pole 4',
        typePl: 'Ziemnozwarciowe',
        functionsPl: ['51N'],
        settingsCount: 1,
        enabled: false,
      },
    ]);
  });

  it.each(Object.keys(ETYKIETA_RODZAJU_ZABEZPIECZENIA) as ProtectionAssignment['device_type'][])(
    'rodzaj %s ma polską etykietę ze wspólnej mapy',
    (rodzaj) => {
      const [wiersz] = przekaznikiStacji([zabezpieczenie('pz', rodzaj, [])], [
        { oznaczenie: 'P', protectionRef: 'pz' },
      ]);
      expect(wiersz.typePl).toBe(ETYKIETA_RODZAJU_ZABEZPIECZENIA[rodzaj]);
      expect(wiersz.typePl).not.toBe(rodzaj);
    },
  );

  it('kody kierunkowe i częstotliwościowe zachowują sufiks normy', () => {
    const [wiersz] = przekaznikiStacji(
      [zabezpieczenie('pz', 'directional_overcurrent', ['directional_67N', 'rocof_81R', 'underfrequency_81U'])],
      [{ oznaczenie: 'P', protectionRef: 'pz' }],
    );
    expect(wiersz.functionsPl).toEqual(['67N', '81R', '81U']);
  });
});

function pole(ref: string, rola: string, deklaracja: Partial<Bay> = {}): { bay: Bay; oznaczenie: string } {
  return {
    bay: { ref_id: ref, name: ref, bay_role: rola, bus_ref: 'sn', equipment_refs: [], ...deklaracja } as Bay,
    oznaczenie: `O-${ref}`,
  };
}

describe('polaPomiaroweStacji', () => {
  it('tylko pola o roli pomiarowej; deklaracja z modelu z etykietą kreatora; przekładniki z pola', () => {
    const wiersze = polaPomiaroweStacji(
      [
        pole('liniowe', 'OUT', { funkcja_pomiaru: 'UKLAD_ENERGII', rodzaj_pomiaru: 'PODSTAWOWY' }),
        pole('szyny', 'MEASUREMENT', { funkcja_pomiaru: 'NAPIECIA_SZYN' }),
        pole('podst', 'MEASUREMENT', { funkcja_pomiaru: 'UKLAD_ENERGII', rodzaj_pomiaru: 'PODSTAWOWY' }),
        pole('rez', 'MEASUREMENT', { funkcja_pomiaru: 'UKLAD_ENERGII', rodzaj_pomiaru: 'REZERWOWY' }),
        pole('rown', 'MEASUREMENT', { funkcja_pomiaru: 'UKLAD_ENERGII', rodzaj_pomiaru: 'ROWNOWAZNY' }),
        pole('kontr', 'MEASUREMENT', { funkcja_pomiaru: 'UKLAD_ENERGII', rodzaj_pomiaru: 'KONTROLNY' }),
        pole('bez-rodzaju', 'MEASUREMENT', { funkcja_pomiaru: 'UKLAD_ENERGII' }),
        pole('bez', 'MEASUREMENT'),
        pole('kanon', 'POMIAROWE', { field_role: 'POMIAROWE' }),
      ],
      [
        { bay_ref: 'podst', measurement_type: 'CT' },
        { bay_ref: 'podst', measurement_type: 'CT' },
        { bay_ref: 'podst', measurement_type: 'VT' },
        { bay_ref: 'liniowe', measurement_type: 'CT' },
        { bay_ref: null, measurement_type: 'VT' },
      ],
    );
    expect(wiersze.map((w) => w.bayId)).toEqual([
      'szyny',
      'podst',
      'rez',
      'rown',
      'kontr',
      'bez-rodzaju',
      'bez',
      'kanon',
    ]);
    const poId = new Map(wiersze.map((w) => [w.bayId, w]));
    expect(poId.get('szyny')?.pomiarPl).toMatch(/napięcia szyn/);
    expect(poId.get('podst')?.pomiarPl).toMatch(/rozliczeniowy podstawowy/);
    expect(poId.get('rez')?.pomiarPl).toMatch(/rozliczeniowy rezerwowy/);
    expect(poId.get('rown')?.pomiarPl).toMatch(/rozliczeniowy równoważny/);
    expect(poId.get('kontr')?.pomiarPl).toMatch(/pomiarowo-kontrolny/);
    expect(poId.get('bez-rodzaju')?.pomiarPl).toBe(BRAK_DEKLARACJI_POMIARU_PL);
    expect(poId.get('bez')?.pomiarPl).toBe(BRAK_DEKLARACJI_POMIARU_PL);
    expect(poId.get('podst')).toMatchObject({ designation: 'O-podst', przekladnikiCt: 2, przekladnikiVt: 1 });
    expect(poId.get('szyny')).toMatchObject({ przekladnikiCt: 0, przekladnikiVt: 0 });
  });
});

function graf(nadpisz: Partial<LvDomainGraphView> = {}): LvDomainGraphView {
  const urzadzenie = (ref: string, board: string | null, rola: string, rodzaj: string | null) => ({
    ref_id: ref,
    device_type: 'breaker',
    device_kind: null,
    designation_class: 'QF',
    device_role: rola,
    feeder_kind: rodzaj,
    transformer_ref: null,
    board_bus_ref: board,
    parent_bus_ref: board ?? 'x',
    child_bus_ref: `${ref}-k`,
    terminal_a: 'a',
    terminal_b: 'b',
    device_state: 'CLOSED',
  });
  return {
    status: 'OK',
    station_ref: 'st',
    buses: [
      { ref_id: 'nn-a', name: 'Szyna nN A', voltage_kv: 0.4 },
      { ref_id: 'nn-pod', name: 'Podrozdzielnica R1', voltage_kv: 0.4 },
    ],
    sections: [
      // Backend numeruje sekcje po ref szyny — podrozdzielnica może mieć mniejszy `order`.
      { section_id: 's-pod', bus_ref: 'nn-pod', order: 1, tier: 'sub', station_ref: 'st', coupler_refs: [], incomer_refs: [], transformer_refs: [] },
      { section_id: 's-a', bus_ref: 'nn-a', order: 2, tier: 'main', station_ref: 'st', coupler_refs: ['sp'], incomer_refs: ['we'], transformer_refs: ['tr'] },
    ],
    devices: [
      urzadzenie('we', 'nn-a', 'incomer', null),
      urzadzenie('o-load', 'nn-a', 'feeder', 'load'),
      urzadzenie('o-der', 'nn-a', 'feeder', 'der'),
      urzadzenie('o-mix', 'nn-a', 'feeder', 'mixed'),
      urzadzenie('o-sub', 'nn-a', 'feeder', 'sub_board'),
      urzadzenie('o-gr', 'nn-a', 'feeder', 'boundary'),
      urzadzenie('o-none', 'nn-a', 'feeder', 'none'),
      urzadzenie('o-pod', 'nn-pod', 'feeder', 'load'),
      urzadzenie('sp', null, 'coupler', null),
    ],
    loads: [
      { ref_id: 'odb-2', name: 'Biuro', bus_ref: 'nn-pod', p_mw: 0.01, q_mvar: 0.002 },
      { ref_id: 'odb-1', name: 'Hala', bus_ref: 'nn-a-k', p_mw: 0.2, q_mvar: 0.05 },
    ],
    ...nadpisz,
  } as unknown as LvDomainGraphView;
}

describe('stronaNnStacji', () => {
  it('rozdzielnica główna przed podrozdzielnicami (nawet przy mniejszym order podrozdzielnicy); liczby odpływów wg rodzaju z backendu, tylko odpływy tej sekcji', () => {
    expect(rozdzielniceNnZGrafu(graf())).toEqual([
      {
        sectionId: 's-a',
        designation: 'Szyna nN A',
        nnVoltageKv: 0.4,
        tier: 'main',
        incomersCount: 1,
        couplersCount: 1,
        feedersCount: 6,
        loadFeedersCount: 2,
        derFeedersCount: 2,
        subBoardFeedersCount: 1,
      },
      {
        sectionId: 's-pod',
        designation: 'Podrozdzielnica R1',
        nnVoltageKv: 0.4,
        tier: 'sub',
        incomersCount: 0,
        couplersCount: 0,
        feedersCount: 1,
        loadFeedersCount: 1,
        derFeedersCount: 0,
        subBoardFeedersCount: 0,
      },
    ]);
  });

  it('odbiory po ref_id; punkt przyłączenia to nazwa szyny, a szyna spoza listy — jej ref (jawnie)', () => {
    expect(odbioryNnZGrafu(graf())).toEqual([
      { loadId: 'odb-1', name: 'Hala', attachmentPointPl: 'nn-a-k', pMw: 0.2, qMvar: 0.05 },
      { loadId: 'odb-2', name: 'Biuro', attachmentPointPl: 'Podrozdzielnica R1', pMw: 0.01, qMvar: 0.002 },
    ]);
  });

  it('graf bez domeny (status ≠ OK) daje puste wiersze — stan niesie komunikat, nie listy', () => {
    const brak = graf({ status: 'brak danych' });
    expect(rozdzielniceNnZGrafu(brak)).toEqual([]);
    expect(odbioryNnZGrafu(brak)).toEqual([]);
  });
});
