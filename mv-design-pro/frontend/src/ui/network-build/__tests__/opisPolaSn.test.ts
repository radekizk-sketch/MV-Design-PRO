/**
 * Opis pola SN z modelu (KD6 — każda informacja ma znaczenie i akcję; „— · Brak danych”
 * zastąpione konkretem). Iloczyn cech:
 *  - odejście: rola {OUT, IN, FEEDER, TR, BKR} × zacisk {bez odcinka, kabel, linia napowietrzna,
 *    brak zacisku} × cel {szyna innej stacji, zacisk pola innej stacji, przez łącznik ciągu,
 *    koniec bez stacji, rozgałęzienie, powrót do własnej stacji};
 *  - aparat (aparaty pierwotne MODELU POLA, `field-view`): {model pola nieodczytany, bez aparatów,
 *    z aparatami} × katalog {nazwa znana, nazwa nieznana, bez pozycji} × rodzaj {CB, LOAD_SWITCH,
 *    FUSE, DS, kilka naraz, tylko nie-łączeniowe} × rodzina rozdzielnicy {jest, brak};
 *  - zabezpieczenie: {sterownik z kodami (powtórzenia), bez nastaw, wyłączony, ref bez rekordu,
 *    bez ref} × rola {liniowa, pomiarowa} × aparat {bezpieczniki, inny};
 *  - sprzęgło: stan {normal_state, status} × druga strona {sekcja „Sekcja N”, nazwa własna,
 *    szyna spoza sekcji, szyna bez nazwy};
 *  - powiązany obiekt (konfigurator stacji): {odejście, transformator, bateria, zespół, źródło,
 *    sprzęgło, nic}.
 */
import { describe, expect, it } from 'vitest';

import type { Bay, EnergyNetworkModel } from '../../../types/enm';
import {
  aparatGlownyPola,
  odejsciePola,
  opisSprzegla,
  powiazanyObiektPola,
  pozycjeOpisuPola,
  tekstAparatu,
  tekstOdejscia,
  zabezpieczeniePola,
  zSekcja,
} from '../cards/opisPolaSn';

function pole(ref: string, rola: string, nadpisz: Record<string, unknown> = {}): Bay {
  return {
    id: ref,
    ref_id: ref,
    name: `Pole ${ref}`,
    bay_role: rola,
    bus_ref: 'gpz/s1',
    substation_ref: 'gpz',
    terminal_bus_ref: `${ref}/zacisk`,
    equipment_refs: [],
    tags: [],
    meta: {},
    ...nadpisz,
  } as unknown as Bay;
}

function galaz(ref: string, typ: string, z: string, doSzyny: string, nadpisz: Record<string, unknown> = {}) {
  return { id: ref, ref_id: ref, name: ref, type: typ, from_bus_ref: z, to_bus_ref: doSzyny, status: 'closed', tags: [], meta: {}, ...nadpisz };
}

function model(nadpisz: Record<string, unknown> = {}): EnergyNetworkModel {
  return {
    buses: [],
    branches: [],
    bays: [],
    substations: [
      { ref_id: 'gpz', name: 'GPZ Północ', station_type: 'gpz', bus_refs: ['gpz/s1'], transformer_refs: [] },
      { ref_id: 'st-12', name: 'S-12', station_type: 'mv_lv', bus_refs: ['st-12/sn'], transformer_refs: [] },
    ],
    protection_assignments: [],
    ...nadpisz,
  } as unknown as EnergyNetworkModel;
}

const P = pole('pole-a', 'OUT');

describe('odejście pola', () => {
  it.each([
    ['kabel prosto na szynę innej stacji', [galaz('k1', 'cable', 'pole-a/zacisk', 'st-12/sn')], [], 'Odejście: kabel k1 → stacja S-12'],
    ['linia napowietrzna (kierunek gałęzi odwrotny)', [galaz('l1', 'line_overhead', 'st-12/sn', 'pole-a/zacisk')], [], 'Odejście: linia napowietrzna l1 → stacja S-12'],
    [
      'przez łącznik ciągu i drugi odcinek do zacisku pola innej stacji',
      [galaz('k1', 'cable', 'pole-a/zacisk', 'w1'), galaz('ls', 'switch', 'w1', 'w2'), galaz('k2', 'cable', 'w2', 'st-x/we')],
      [pole('st-x-we', 'IN', { substation_ref: 'st-12', terminal_bus_ref: 'st-x/we', bus_ref: 'st-12/sn' })],
      'Odejście: kabel k1 → stacja S-12',
    ],
    ['koniec ciągu bez stacji', [galaz('k1', 'cable', 'pole-a/zacisk', 'w1')], [], 'Odejście: kabel k1 → koniec ciągu bez stacji'],
    [
      'rozgałęzienie ciągu',
      [galaz('k1', 'cable', 'pole-a/zacisk', 'w1'), galaz('k2', 'cable', 'w1', 'w2'), galaz('k3', 'cable', 'w1', 'w3')],
      [],
      'Odejście: kabel k1 → rozgałęzienie ciągu',
    ],
    [
      'ciąg wracający do własnej stacji nie jest stacją docelową',
      [galaz('k1', 'cable', 'pole-a/zacisk', 'gpz/s1')],
      [],
      'Odejście: kabel k1 → koniec ciągu bez stacji',
    ],
  ])('%s', (_opis, branches, bays, tekst) => {
    const m = model({ branches, bays: [P, ...bays] });
    const odejscie = odejsciePola(m, P);
    expect(odejscie).not.toBeNull();
    expect(tekstOdejscia(P, odejscie!)).toBe(tekst);
  });

  it('pole wejściowe: linia zasilająca ze strzałką od stacji', () => {
    const wej = pole('pole-a', 'IN');
    const m = model({ branches: [galaz('k1', 'cable', 'pole-a/zacisk', 'st-12/sn')] });
    expect(tekstOdejscia(wej, odejsciePola(m, wej)!)).toBe('Linia zasilająca: kabel k1 ← stacja S-12');
  });

  it('zacisk bez odcinka, pole bez zacisku, łącznik na zacisku zamiast odcinka → brak odejścia', () => {
    expect(odejsciePola(model(), P)).toBeNull();
    expect(odejsciePola(model({ branches: [galaz('k1', 'cable', 'x', 'y')] }), pole('pole-a', 'OUT', { terminal_bus_ref: null }))).toBeNull();
    expect(odejsciePola(model({ branches: [galaz('q', 'breaker', 'gpz/s1', 'pole-a/zacisk')] }), P)).toBeNull();
  });

  it.each([
    ['OUT', 'Bez odejścia'],
    ['FEEDER', 'Bez odejścia'],
    ['IN', 'Bez linii zasilającej'],
  ])('pole liniowe %s bez odcinka → brak nazwany „%s”', (rola, tekst) => {
    const odejscie = pozycjeOpisuPola(model(), pole('pole-a', rola), [], new Map()).find((p) => p.fokus === 'odejscie');
    expect(odejscie).toEqual({ fokus: 'odejscie', tekst, brak: true });
  });

  it.each(['TR', 'BKR', 'ZU', 'OZE', 'MEASUREMENT', 'COUPLER'])('pole %s bez odcinka nie ma pozycji odejścia', (rola) => {
    expect(pozycjeOpisuPola(model(), pole('pole-a', rola), [], new Map()).map((p) => p.fokus)).not.toContain('odejscie');
  });
});

describe('aparat główny pola', () => {
  const nazwy = new Map([
    ['vd4', 'ABB VD4 17,5 kV 630 A'],
    ['rodzina', 'ABB UniGear ZS1'],
  ]);

  const u = (kind: string, catalog_ref: string | null = null) => ({ kind, catalog_ref }) as never;
  it.each([
    ['wyłącznik przed odłącznikiem', [u('DS', 'x'), u('CB', 'vd4')], { rodzaj: 'CB', catalogRef: 'vd4' }],
    ['rozłącznik bez pozycji (wartość robocza)', [u('LOAD_SWITCH')], { rodzaj: 'LOAD_SWITCH', catalogRef: null }],
    ['bezpieczniki przed odłącznikiem', [u('DS'), u('FUSE')], { rodzaj: 'FUSE', catalogRef: null }],
    ['sam odłącznik', [u('DS', 'ds-1')], { rodzaj: 'DS', catalogRef: 'ds-1' }],
    ['tylko aparaty nie-łączeniowe (przekładnik, głowica)', [u('CT', 'ct'), u('CABLE_HEAD')], null],
    ['bez aparatów', [], null],
  ])('%s', (_opis, urzadzenia, oczekiwany) => {
    expect(aparatGlownyPola(urzadzenia)).toEqual(oczekiwany);
  });

  it.each([
    [{ rodzaj: 'CB', catalogRef: 'vd4' }, {}, 'Aparat: ABB VD4 17,5\u00a0kV 630\u00a0A'],
    [{ rodzaj: 'CB', catalogRef: 'nieznany' }, {}, 'Aparat: wyłącznik z katalogu'],
    [{ rodzaj: 'LOAD_SWITCH', catalogRef: null }, {}, 'Aparat: rozłącznik — wartość robocza bez pozycji katalogowej'],
    [{ rodzaj: 'CB', catalogRef: 'vd4' }, { switchgear_family_ref: 'rodzina' }, 'Aparat: ABB VD4 17,5\u00a0kV 630\u00a0A · rozdzielnica ABB UniGear ZS1'],
  ] as const)('tekst aparatu %o (%o) → %s', (aparat, nadpisz, tekst) => {
    const t = tekstAparatu(aparat, pole('pole-a', 'OUT', nadpisz), nazwy);
    expect(t).toBe(tekst);
    // W UI nie ma identyfikatorów katalogu.
    expect(t).not.toMatch(/nieznany|rodzina\b/);
  });

  it('nazwa aparatu i rodziny: liczba z jednostką połączona spacją twardą (bez łamania „630 / A”)', () => {
    const t = tekstAparatu({ rodzaj: 'CB', catalogRef: 'vd4' }, pole('pole-a', 'OUT', { switchgear_family_ref: 'rodzina' }), new Map([
      ['vd4', 'ABB VD4 17.5 kV 630 A'],
      ['rodzina', 'UniGear 24 kV'],
    ]));
    expect(t).toBe('Aparat: ABB VD4 17.5\u00a0kV 630\u00a0A · rozdzielnica UniGear 24\u00a0kV');
  });

  it('pozycja aparatu: nieodczytany = bez akcji, brak = „Aparat nieprzypisany”, wartość robocza = brak z akcją, katalog = bez akcji', () => {
    const fokus = (urz: never[] | null) => pozycjeOpisuPola(model(), P, urz, nazwy).find((p) => p.fokus === 'aparat');
    expect(fokus(null)).toEqual({ fokus: 'aparat', tekst: 'Aparat: model pola w odczycie', brak: false });
    expect(fokus([])).toEqual({ fokus: 'aparat', tekst: 'Aparat nieprzypisany', brak: true });
    expect(fokus([u('CB')])?.brak).toBe(true);
    expect(fokus([u('CB', 'vd4')])).toEqual({ fokus: 'aparat', tekst: 'Aparat: ABB VD4 17,5\u00a0kV 630\u00a0A', brak: false });
  });
});

describe('zabezpieczenie pola', () => {
  const sterownik = (nadpisz: Record<string, unknown> = {}) => ({
    ref_id: 'zab-1',
    name: 'Zabezpieczenie pola 1',
    breaker_ref: 'q1',
    device_type: 'overcurrent',
    settings: [{ function_type: 'overcurrent_50' }, { function_type: 'overcurrent_51' }, { function_type: 'overcurrent_51' }, { function_type: 'earth_fault_51N' }],
    is_enabled: true,
    ...nadpisz,
  });

  it.each([
    ['sterownik z nastawami (kody bez powtórzeń)', sterownik(), 'Zabezpieczenie: 50, 51, 51N', false],
    ['sterownik bez nastaw', sterownik({ settings: [] }), 'Zabezpieczenie: Zabezpieczenie pola 1 bez nastaw funkcji', true],
    ['sterownik wyłączony', sterownik({ is_enabled: false }), 'Zabezpieczenie: 50, 51, 51N (wyłączone w modelu)', false],
  ])('%s', (_opis, rekord, tekst, brak) => {
    const m = model({ protection_assignments: [rekord] });
    const b = pole('pole-a', 'OUT', { protection_ref: 'zab-1' });
    expect(zabezpieczeniePola(m, b)).not.toBeNull();
    expect(pozycjeOpisuPola(m, b, [], new Map()).find((p) => p.fokus === 'zabezpieczenie')).toEqual({ fokus: 'zabezpieczenie', tekst, brak });
  });

  it('ref sterownika bez rekordu albo bez ref → „Brak sterownika” z akcją', () => {
    for (const b of [pole('pole-a', 'OUT', { protection_ref: 'zab-x' }), P]) {
      expect(zabezpieczeniePola(model(), b)).toBeNull();
      expect(pozycjeOpisuPola(model(), b, [], new Map()).find((p) => p.fokus === 'zabezpieczenie')).toEqual({
        fokus: 'zabezpieczenie',
        tekst: 'Brak sterownika',
        brak: true,
      });
    }
  });

  it('pole z bezpiecznikami: zabezpieczenie bezpiecznikami, bez akcji; pole pomiarowe: bez pozycji', () => {
    const tr = pole('pole-a', 'TR');
    expect(pozycjeOpisuPola(model(), tr, [{ kind: 'FUSE', catalog_ref: null } as never], new Map()).find((p) => p.fokus === 'zabezpieczenie')).toEqual({
      fokus: 'zabezpieczenie',
      tekst: 'Zabezpieczenie: bezpieczniki aparatu pola',
      brak: false,
    });
    expect(pozycjeOpisuPola(model(), pole('pole-a', 'MEASUREMENT'), [], new Map()).map((p) => p.fokus)).toEqual(['aparat']);
  });
});

describe('sprzęgło', () => {
  const sekcje = [
    { busRef: 'gpz/s1', etykieta: 'Sekcja 1' },
    { busRef: 'gpz/s2', etykieta: 'Sekcja 2' },
    { busRef: 'gpz/s3', etykieta: 'Rozdzielnia A' },
  ];
  it.each([
    [{ to_bus_ref: 'gpz/s2', normal_state: 'open' }, 'Sprzęgło z sekcją 2 · normalnie otwarte'],
    [{ to_bus_ref: 'gpz/s2', status: 'open' }, 'Sprzęgło z sekcją 2 · normalnie otwarte'],
    [{ to_bus_ref: 'gpz/s2', status: 'open', normal_state: 'closed' }, 'Sprzęgło z sekcją 2 · normalnie zamknięte'],
    [{ to_bus_ref: 'gpz/s3' }, 'Sprzęgło z sekcją „Rozdzielnia A” · normalnie zamknięte'],
    [{ to_bus_ref: 'gpz/x' }, 'Sprzęgło z szyną „Szyna X” · normalnie zamknięte'],
    [{ to_bus_ref: 'gpz/y' }, 'Sprzęgło z szyną spoza sekcji stacji · normalnie zamknięte'],
  ])('%o → %s', (nadpisz, tekst) => {
    const m = model({ buses: [{ ref_id: 'gpz/x', name: 'Szyna X' }, { ref_id: 'gpz/y', name: '' }] });
    const g = galaz('sp', 'bus_coupler', 'gpz/s1', 'gpz/s2', nadpisz);
    expect(opisSprzegla(m, g as never, 'gpz/s1', sekcje)).toBe(tekst);
  });

  it('opis z drugiej strony łącznika wskazuje pierwszą sekcję', () => {
    const g = galaz('sp', 'bus_coupler', 'gpz/s1', 'gpz/s2');
    expect(opisSprzegla(model(), g as never, 'gpz/s2', sekcje)).toBe('Sprzęgło z sekcją 1 · normalnie zamknięte');
  });

  it('zSekcja: numer sekcji w narzędniku, nazwa własna w cudzysłowie', () => {
    expect(zSekcja('Sekcja 3')).toBe('z sekcją 3');
    expect(zSekcja('sekcja IIa')).toBe('z sekcją IIa');
    expect(zSekcja('Szyna rezerwowa')).toBe('z sekcją „Szyna rezerwowa”');
  });
});

describe('powiązany obiekt pola (konfigurator stacji)', () => {
  it.each([
    ['odejście', pole('pole-a', 'OUT'), { branches: [galaz('k1', 'cable', 'pole-a/zacisk', 'st-12/sn')] }, 'Odejście: kabel k1 → stacja S-12'],
    ['transformator', pole('pole-a', 'TR'), { transformers: [{ ref_id: 't1', name: 'T1 630 kVA', hv_bus_ref: 'pole-a/zacisk', lv_bus_ref: 'nn' }] }, 'Transformator T1 630 kVA'],
    ['bateria', pole('pole-a', 'BKR'), { shunt_capacitors: [{ ref_id: 'b', name: 'BK 1', bus_ref: 'pole-a/zacisk' }] }, 'Bateria kondensatorów BK 1'],
    ['zespół uziemiający', pole('pole-a', 'ZU'), { zespoly_uziemiajace: [{ ref_id: 'z', name: 'ZU 1', bay_ref: 'pole-a' }] }, 'Zespół uziemiający ZU 1'],
    ['źródło', pole('pole-a', 'OZE'), { generators: [{ ref_id: 'g', name: 'PV 1 MW', bus_ref: 'pole-a/zacisk' }] }, 'Źródło PV 1 MW'],
    ['sprzęgło', pole('pole-a', 'COUPLER', { equipment_refs: ['sp'] }), { branches: [galaz('sp', 'bus_coupler', 'gpz/s1', 'gpz/s2', { normal_state: 'open' })], buses: [{ ref_id: 'gpz/s2', name: 'Szyna SN 2' }] }, 'Sprzęgło z szyną „Szyna SN 2” · normalnie otwarte'],
    ['nic na zacisku', pole('pole-a', 'OUT'), {}, null],
  ])('%s', (_opis, b, nadpisz, tekst) => {
    expect(powiazanyObiektPola(model(nadpisz), b)).toBe(tekst);
  });
});
