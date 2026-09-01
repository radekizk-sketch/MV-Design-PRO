/**
 * KARTA S9-5 — TEMAT MENU KONTEKSTOWEGO (jednostkowo, bez renderu).
 *
 * Plik PRZYPINA deklaracje z nagłówka `canvas/canvasMenuSubject.ts` do
 * zachowania (reguła KLASA, NIE INSTANCJA pkt 4: „deklaracja bez testu =
 * fałszywa pewność"). Sprawdzane są WŁASNOŚCI, nie przykłady z karty:
 *
 *  1. kotwica MUSI istnieć w modelu — ref rysunkowy nie daje tematu;
 *  2. odcinanie sufiksów jest bramkowane KLASĄ obiektu (kreska nie może
 *     zakotwiczyć się na całej stacji);
 *  3. kategoria menu wynika z kotwicy, nie z kreski (rodzina gałęzi, etykieta
 *     transformatora, podtyp DER);
 *  4. kolejność kolekcji przy rozstrzyganiu kotwicy jest deterministyczna;
 *  5. iloczyn cech {klasa obiektu} × {rodzaj kotwicy} — pełna tabela, nie
 *     pojedynczy scenariusz.
 */
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { HIT_OBJECT_CLASSES, type HitObjectClass } from '../hitAreas';
import {
  buildCanvasModelIndex,
  menuKindDer,
  menuKindGalezi,
  menuRefCandidates,
  resolveCanvasMenuSubject,
  type MenuAnchorKind,
} from '../canvasMenuSubject';

/** Minimalny model o ZNANYCH refach — każda kolekcja reprezentowana. */
function model(): EnergyNetworkModel {
  return {
    substations: [
      {
        ref_id: 'stn/A/station',
        id: 'stn/A/station',
        name: 'Stacja A',
        bus_refs: ['bus/A/sn', 'bus/A/nn'],
        meta: { field_specs: [{ field_ref: 'stn/A/sn_field/000' }] },
      },
      {
        ref_id: 'stn/B/station',
        id: 'stn/B/station',
        name: 'Stacja B bez szyny SN',
        bus_refs: ['bus/B/nn'],
      },
    ],
    buses: [
      { ref_id: 'bus/A/sn', id: 'bus/A/sn', name: 'Szyna SN A', voltage_kv: 15 },
      { ref_id: 'bus/A/nn', id: 'bus/A/nn', name: 'Szyna nN A', voltage_kv: 0.4 },
      { ref_id: 'bus/B/nn', id: 'bus/B/nn', name: 'Szyna nN B', voltage_kv: 0.4 },
    ],
    branches: [
      { ref_id: 'seg/K/segment', id: 'seg/K/segment', type: 'cable' },
      { ref_id: 'seg/N/segment', id: 'seg/N/segment', type: 'line_overhead' },
      { ref_id: 'seg/W/breaker', id: 'seg/W/breaker', type: 'breaker' },
    ],
    generators: [{ ref_id: 'gen/PV1', id: 'gen/PV1' }],
    sources: [{ ref_id: 'src/GPZ', id: 'src/GPZ' }],
    transformers: [{ ref_id: 'trf/A/sn_nn', id: 'trf/A/sn_nn' }],
  } as unknown as EnergyNetworkModel;
}

const index = buildCanvasModelIndex(model());

describe('S9-5 — kandydaci refu (odcinanie sufiksów rysunkowych)', () => {
  it('ref kanoniczny adaptera idzie PRZED ownerRef, a sufiksy odcinane są od prawej', () => {
    expect(
      menuRefCandidates({ busRef: 'bus/A/sn', ownerRef: 'stn/A/station#label#name-row-0' }),
    ).toEqual([
      'bus/A/sn',
      'stn/A/station#label#name-row-0',
      'stn/A/station#label',
      'stn/A/station',
    ]);
  });

  it('brak refu = brak kandydatów (znacznik pomocniczy rysunku)', () => {
    expect(menuRefCandidates({})).toEqual([]);
  });
});

describe('S9-5 — kotwica MUSI istnieć w modelu', () => {
  it('ref spoza modelu nie daje tematu (uczciwa odmowa, nie operacja na refie rysunku)', () => {
    const wynik = resolveCanvasMenuSubject({ klasa: 'tor', ownerRef: 'seg/NIEISTNIEJE/segment' }, index);
    expect(wynik.stan).toBe('brak');
    expect(wynik.stan === 'brak' && wynik.kod).toBe('poza-modelem');
  });

  it('obiekt bez refu w ogóle melduje inny powód niż ref poza modelem', () => {
    const wynik = resolveCanvasMenuSubject({ klasa: 'aparat' }, index);
    expect(wynik.stan === 'brak' && wynik.kod).toBe('brak-refu');
  });

  it('adnotacja zabezpieczeń nie jest obiektem modelu — osobny powód', () => {
    const wynik = resolveCanvasMenuSubject(
      { klasa: 'adnotacja', elementKind: 'protectionAnnotation', ownerRef: 'seg/K/segment' },
      index,
    );
    expect(wynik.stan === 'brak' && wynik.kod).toBe('adnotacja');
  });
});

describe('S9-5 — kategoria menu wynika z KOTWICY, nie z kreski', () => {
  it('rodzina gałęzi rozstrzyga kabel / linię napowietrzną / aparat łącznikowy', () => {
    expect(menuKindGalezi('cable')).toBe('cable_segment_sn');
    expect(menuKindGalezi('line_overhead')).toBe('overhead_line_sn');
    expect(menuKindGalezi('breaker')).toBe('apparatus');
    expect(menuKindGalezi(undefined)).toBe('apparatus');
  });

  it('linia napowietrzna dostaje menu LINII, nie kabla (defekt (c) audytu S9-5)', () => {
    const wynik = resolveCanvasMenuSubject({ klasa: 'tor', ownerRef: 'seg/N/segment' }, index);
    expect(wynik.stan === 'temat' && wynik.temat.menuKind).toBe('overhead_line_sn');
    expect(wynik.stan === 'temat' && wynik.temat.rodzinaGalezi).toBe('line_overhead');
  });

  it('kabel dostaje menu kabla', () => {
    const wynik = resolveCanvasMenuSubject({ klasa: 'tor', ownerRef: 'seg/K/segment' }, index);
    expect(wynik.stan === 'temat' && wynik.temat.menuKind).toBe('cable_segment_sn');
  });

  it('etykieta TRANSFORMATORA daje menu aparatu, nie STACJI (defekt (b) audytu S9-5)', () => {
    // Realny kształt refu z kompozycji: `…#label#name-row-0`, `ownerKind`
    // etykiety to `station-name` — dawna tabela `LABEL_OWNER_ELEMENT_KIND`
    // dawała tu kategorię `station`, czyli „Usuń stację" nad transformatorem.
    const wynik = resolveCanvasMenuSubject(
      { klasa: 'etykieta', elementKind: 'station', ownerRef: 'trf/A/sn_nn#label#name-row-0' },
      index,
    );
    expect(wynik.stan === 'temat' && wynik.temat.kotwica).toBe('transformator');
    expect(wynik.stan === 'temat' && wynik.temat.menuKind).toBe('apparatus');
  });

  it('etykieta STACJI daje menu stacji i TEN SAM ref co symbol stacji (jeden predykat na obiekt)', () => {
    const zEtykiety = resolveCanvasMenuSubject(
      { klasa: 'etykieta', elementKind: 'station', ownerRef: 'stn/A/station#name-row-0' },
      index,
    );
    const zSymbolu = resolveCanvasMenuSubject(
      { klasa: 'stacja', elementKind: 'station', ownerRef: 'stn/A/station' },
      index,
    );
    expect(zEtykiety).toEqual(zSymbolu);
  });

  it('podtyp DER rozstrzyga kategorię tylko dla rodzajów ROZPOZNANYCH (reszta = degradacja)', () => {
    expect(menuKindDer('pv')).toBe('der_pv');
    expect(menuKindDer('bess')).toBe('der_bess');
    expect(menuKindDer('wind')).toBe('der_fw');
    expect(menuKindDer('generator')).toBe('der');
    expect(menuKindDer('unknown')).toBe('der');
    expect(menuKindDer(undefined)).toBe('der');
    const wynik = resolveCanvasMenuSubject(
      { klasa: 'uklad-der', elementKind: 'der', derKind: 'bess', ownerRef: 'gen/PV1' },
      index,
    );
    expect(wynik.stan === 'temat' && wynik.temat.menuKind).toBe('der_bess');
  });
});

describe('S9-5 — bramka klasy przy odcinaniu sufiksów', () => {
  it('kreska toru NIE kotwiczy się na stacji, choć jej ref się do niej skraca (defekt (a))', () => {
    const wynik = resolveCanvasMenuSubject({ klasa: 'tor', ownerRef: 'stn/A/station#descent-0' }, index);
    expect(wynik.stan).toBe('brak');
    expect(wynik.stan === 'brak' && wynik.kod).toBe('poza-modelem');
  });

  it('kreska toru MOŻE zakotwiczyć się na polu SN, którego jest przewodem', () => {
    const wynik = resolveCanvasMenuSubject({ klasa: 'tor', ownerRef: 'stn/A/sn_field/000#lateral-0' }, index);
    expect(wynik.stan === 'temat' && wynik.temat.kotwica).toBe('pole');
    expect(wynik.stan === 'temat' && wynik.temat.menuKind).toBe('apparatus');
  });

  it('łącznik wiersza arkusza kotwiczy się na SWOJEJ gałęzi (ten sam obiekt co reszta przęsła)', () => {
    const wynik = resolveCanvasMenuSubject(
      { klasa: 'lacznik-wiersza', ownerRef: 'seg/K/segment#sheet-continuation-out-0' },
      index,
    );
    expect(wynik.stan === 'temat' && wynik.temat.modelRef).toBe('seg/K/segment');
    expect(wynik.stan === 'temat' && wynik.temat.menuKind).toBe('cable_segment_sn');
  });

  it('łącznik wiersza NIE kotwiczy się na polu ani stacji (tylko gałąź)', () => {
    const wynik = resolveCanvasMenuSubject(
      { klasa: 'lacznik-wiersza', ownerRef: 'stn/A/sn_field/000#sheet-continuation-out-0' },
      index,
    );
    expect(wynik.stan).toBe('brak');
  });

  // KARTA KLIK-ETYKIETA-KOTWICA — INTENCJA BEZ ZMIAN, WEJŚCIE DOPROWADZONE DO
  // PRODUKCYJNEGO. Bramka przejścia stacja→szyna czyta teraz DEKLAROWANY rodzaj
  // (`elementKind === 'bus'`), a nie klasę trafienia (`klasa === 'szyna'`), bo
  // klasa `'szyna'` powstaje wyłącznie dla KRESEK — uchwyt tej samej szyny
  // (napis napięcia) jej nie miał i przejście dla niego nie odpalało (zmierzone:
  // 54 z 1084 etykiet LOD2 dostawało menu STACJI z pozycją „Usuń stację").
  // Kreska szyny NIESIE `elementKind:'bus'` w produkcji — zmierzone na sieci
  // referencyjnej: wszystkie 55 odcinków szynowych sceny (LOD 1/2). Wejście testu
  // je pomijało, więc badało kombinację, która na kanwie nie występuje.
  it('szyna narysowana jako kompozyt stacji sprowadza się do KANONICZNEJ szyny SN tej stacji', () => {
    const wynik = resolveCanvasMenuSubject(
      { klasa: 'szyna', elementKind: 'bus', ownerRef: 'stn/A/station#sn-bus' },
      index,
    );
    expect(wynik.stan === 'temat' && wynik.temat.kotwica).toBe('szyna');
    expect(wynik.stan === 'temat' && wynik.temat.modelRef).toBe('bus/A/sn');
    expect(wynik.stan === 'temat' && wynik.temat.menuKind).toBe('section');
  });

  it('UCHWYT szyny (napis napięcia) sprowadza się do TEJ SAMEJ szyny, co jej kreska', () => {
    // Druga połowa pary (reguła KLASA pkt 3): oba końce z jednego źródła. Napis
    // ma klasę `'etykieta'`, więc dawna bramka po klasie trafienia go pomijała.
    const wynik = resolveCanvasMenuSubject(
      { klasa: 'etykieta', elementKind: 'bus', ownerRef: 'stn/A/station#busbar-voltage' },
      index,
    );
    expect(wynik.stan === 'temat' && wynik.temat.kotwica).toBe('szyna');
    expect(wynik.stan === 'temat' && wynik.temat.modelRef).toBe('bus/A/sn');
    expect(wynik.stan === 'temat' && wynik.temat.menuKind).toBe('section');
  });

  it('stacja BEZ szyny SN nie podstawia menu stacji pod kreskę szyny (odmowa zamiast podmiany obiektu)', () => {
    const wynik = resolveCanvasMenuSubject(
      { klasa: 'szyna', elementKind: 'bus', ownerRef: 'stn/B/station#sn-bus' },
      index,
    );
    expect(wynik.stan).toBe('brak');
  });

  it('znacznik wyniku dziedziczy temat swojego właściciela (uchwyt, jak etykieta)', () => {
    const wynik = resolveCanvasMenuSubject({ klasa: 'znacznik-wyniku', ownerRef: 'bus/A/sn' }, index);
    expect(wynik.stan === 'temat' && wynik.temat.menuKind).toBe('section');
  });
});

describe('S9-5 — iloczyn cech {klasa} × {kotwica}: tabela ZAMKNIĘTA', () => {
  /** Ref reprezentatywny dla każdej kotwicy — z modelu wyżej. */
  const REF_KOTWICY: Record<MenuAnchorKind, string> = {
    stacja: 'stn/A/station',
    szyna: 'bus/A/sn',
    galaz: 'seg/K/segment',
    pole: 'stn/A/sn_field/000',
    zrodlo: 'src/GPZ',
    generator: 'gen/PV1',
    transformator: 'trf/A/sn_nn',
  };
  /** Oczekiwanie = deklaracja `KOTWICE_DOZWOLONE_DLA_KLASY` z modułu. */
  const DOZWOLONE: Record<HitObjectClass, readonly MenuAnchorKind[]> = {
    stacja: ['stacja'],
    aparat: ['pole', 'galaz', 'transformator'],
    transformator: ['transformator', 'pole'],
    zrodlo: ['zrodlo'],
    'uklad-der': ['generator'],
    adnotacja: [],
    szyna: ['szyna', 'stacja'],
    tor: ['galaz', 'pole'],
    'lacznik-wiersza': ['galaz'],
    // ODG-RYSUNEK × S9-5: punkt odgałęźny ŚWIADOMIE bez kotwic (zero menu) —
    // żadna operacja domenowa punktu nie jest zweryfikowana; pozycja bez
    // pokrycia byłaby fantomem. Kandydat na kartę menu punktu odgałęźnego.
    'punkt-odgalezny': [],
    // PORTAL nN (LV Domain Projection po B-02): przejście do projekcji nN — nie
    // obiekt modelu, klik otwiera projekcję, menu budowy bez operacji.
    'portal-nn': [],
    etykieta: ['stacja', 'szyna', 'galaz', 'pole', 'zrodlo', 'generator', 'transformator'],
    'znacznik-wyniku': ['stacja', 'szyna', 'galaz', 'pole', 'zrodlo', 'generator', 'transformator'],
  };

  it('lista klas obiektów kanwy jest kompletna względem warstwy trafień', () => {
    expect(Object.keys(DOZWOLONE).sort()).toEqual([...HIT_OBJECT_CLASSES].sort());
  });

  it.each(HIT_OBJECT_CLASSES)('klasa „%s" przyjmuje DOKŁADNIE zadeklarowane kotwice', (klasa) => {
    const przyjete: MenuAnchorKind[] = [];
    for (const [kotwica, ref] of Object.entries(REF_KOTWICY) as [MenuAnchorKind, string][]) {
      const wynik = resolveCanvasMenuSubject({ klasa, ownerRef: ref }, index);
      if (wynik.stan === 'temat') {
        // Szyna kompozytowa zamienia kotwicę `stacja` na `szyna` — liczy się
        // to, że temat POWSTAŁ dla tego refu wejściowego.
        przyjete.push(kotwica);
      }
    }
    expect(przyjete.sort()).toEqual([...DOZWOLONE[klasa]].sort());
  });
});

describe('S9-5 — determinizm rozstrzygania kotwicy', () => {
  it('ten sam ref obecny w dwóch kolekcjach rozstrzyga się STALE (kolejność jest kontraktem)', () => {
    const kolizja = {
      substations: [{ ref_id: 'X', id: 'X', bus_refs: [] }],
      buses: [{ ref_id: 'X', id: 'X', voltage_kv: 15 }],
      branches: [{ ref_id: 'X', id: 'X', type: 'cable' }],
      generators: [],
      sources: [],
      transformers: [],
    } as unknown as EnergyNetworkModel;
    const indeksKolizji = buildCanvasModelIndex(kolizja);
    for (let i = 0; i < 3; i += 1) {
      const wynik = resolveCanvasMenuSubject({ klasa: 'etykieta', ownerRef: 'X' }, indeksKolizji);
      expect(wynik.stan === 'temat' && wynik.temat.kotwica).toBe('stacja');
    }
  });

  it('pusty model nie daje żadnego tematu (zero fabrykacji na starcie projektu)', () => {
    const pusty = buildCanvasModelIndex(null);
    for (const klasa of HIT_OBJECT_CLASSES) {
      expect(resolveCanvasMenuSubject({ klasa, ownerRef: 'cokolwiek' }, pusty).stan).toBe('brak');
    }
  });
});
