/**
 * SŁOWNIK SEGMENTÓW REFERENCJI — czy „ZAMKNIĘTY" znaczy zamknięty (odbiór V126-JEZYK).
 *
 * DLACZEGO TEN PLIK ISTNIEJE. `useNazwaObiektu.ts` nazywa swój słownik
 * „ZAMKNIĘTYM słownictwem referencji domeny" i na tej podstawie tłumaczy segmenty
 * na polskie nazwy rodzajów obiektów. Deklaracja nie miała strażnika, a pomiar na
 * REALNEJ sieci (fikstura 53 stacji, ta sama, na której stoi odbiór SLD) pokazał
 * SZEŚĆ segmentów spoza słownika — `branch` (12 wystąpień), `source`, `main`,
 * `bus_110`, `wn_sn`, `corridor_01`.
 *
 * SKUTEK BYŁ DOKŁADNIE TĄ KLASĄ, KTÓRĄ KARTA ZAMYKAŁA: gdy migawka modelu nie zna
 * obiektu — a to stan NORMALNY dla wyniku starszego niż ostatnia edycja modelu,
 * czyli ten sam stan, dla którego istnieje wskaźnik świeżości — ekran schodzi do
 * etykiety zapasowej i pokazuje projektantowi angielskie `branch` albo `source`.
 * Właściciel ocenił poprzednią wersję okna na 0/10 słowami „zbędne kody
 * produkcyjne nie mają prawa pojawić się w interfejsie".
 *
 * WYROCZNIA JEST POMIAREM, NIE LISTĄ RĘCZNĄ. Test czyta referencje z fikstury
 * realnej sieci i żąda, żeby KAŻDY segment nieodciskowy i nieliczbowy miał
 * tłumaczenie. Nowe słownictwo modelu zapala tu czerwień, zamiast po cichu
 * wypłynąć na ekran po angielsku (reguła KLASA §4).
 *
 * KOREKTA 2026-09-24 (karta #143): pierwsza wersja mierzyła tylko referencje
 * z prefiksami gpz|station|substation|corridor, więc „zamknięty” słownik nie był
 * sprawdzany dla bess, bus, fw, nn, pv, seg, stn, sw z TEJ SAMEJ fikstury ani dla
 * toru DER-SN (`sn/<ziarno>/der/…`) — na ekran wychodziły `branch_end`, `nn_bus`,
 * `producer_nn_bus`, `field_device`, `segment_L`… Teraz wyrocznie są dwie:
 * (1) KOD backendu budujący identyfikatory — `segmenty_referencji_modelu.json`
 * z eksportu fikstur (każde `_make_id` i każdy f-string `"<prefiks>/{ziarno}/…"`
 * w `backend/src`, zmienne rozwinięte na zbiory wartości z map operacji); (2)
 * WSZYSTKIE referencje `prefiks/<ziarno>/…` z fikstury 52 stacji i ze scen
 * akademickich (sieć złota + tor DER-SN).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import nazwyScen from '../../../../harness-fixtures/generated/nazwy_obiektow_scen_akademickich.json';
import wyroczniaSegmentow from '../../../../harness-fixtures/generated/segmenty_referencji_modelu.json';
import { SEGMENT_MASZYNOWY, etykietaZapasowaRefu, tlumaczSegment } from '../useNazwaObiektu';

const FIXTURA = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..', '..',
  'ui', 'sld', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json',
);


/** Referencja zbudowana operacją: `<prefiks>/<ziarno 32 hex>/<ścieżka>`. */
const REF_Z_ZIARNEM = /"([a-z][a-z0-9_]*\/[0-9a-f]{32}\/[A-Za-z0-9_/-]+)"/g;

/** Segmenty referencji występujące w REALNEJ migawce modelu i w scenach akademickich. */
function segmentyRealnychRefow(): readonly string[] {
  const refy = new Set<string>();
  for (const [, ref] of readFileSync(FIXTURA, 'utf8').matchAll(REF_Z_ZIARNEM)) refy.add(ref);
  for (const kolekcja of Object.values(nazwyScen as Record<string, { ref_id: string }[]>)) {
    for (const { ref_id: ref } of kolekcja) if (/\/[0-9a-f]{32}\//.test(ref)) refy.add(ref);
  }
  const segmenty = new Set<string>();
  for (const ref of refy) {
    for (const segment of ref.split('/')) {
      if (segment === '' || SEGMENT_MASZYNOWY.test(segment) || /^\d+$/.test(segment)) continue;
      segmenty.add(segment);
    }
  }
  return [...segmenty].sort();
}

describe('V126-JEZYK — słownik segmentów referencji jest ZAMKNIĘTY na realnym modelu', () => {
  it('pomiar widzi referencje (zapadka na fiksturę, która przestała je zawierać)', () => {
    expect(segmentyRealnychRefow().length).toBeGreaterThan(8);
  });

  it('KAŻDY segment realnej referencji ma polskie tłumaczenie', () => {
    const bezTlumaczenia = segmentyRealnychRefow().filter((s) => tlumaczSegment(s) === s);
    expect(
      bezTlumaczenia,
      `segmenty modelu bez tłumaczenia trafiłyby na ekran po angielsku: ${bezTlumaczenia.join(', ')}`,
    ).toEqual([]);
  });

  it('etykieta zapasowa realnej referencji nie niesie angielskiego segmentu', () => {
    // Iloczyn cech: {ref z odciskiem} × {segment techniczny} × {numer porządkowy} —
    // czyli kształt, który realnie produkuje model, a nie przykład z karty.
    const etykieta = etykietaZapasowaRefu(
      'gpz/860003b4514aa388b39561d5005ce584/section/001/branch/002/bus_sn',
    );
    expect(etykieta).not.toMatch(/branch|section|bus_sn|source|main/);
    expect(etykieta).toContain('sekcja 001');
  });

  it('reguła `<rodzaj>_<numer>` zamyka KLASĘ, nie instancję', () => {
    // `corridor_01` jest w fiksturze; `corridor_07` jeszcze nie istnieje, a ma się
    // tłumaczyć bez dopisywania czegokolwiek — inaczej pierwszy nowy numer wróciłby
    // na ekran po angielsku.
    expect(tlumaczSegment('corridor_01')).toBe('ciąg liniowy 01');
    expect(tlumaczSegment('corridor_07')).toBe('ciąg liniowy 07');
    expect(tlumaczSegment('station_12')).toBe('stacja 12');
    // Wpis JAWNY ma pierwszeństwo przed regułą — inaczej „szyna 110 kV" zsunęłaby
    // się do „szyna 110" i zniknęłaby jednostka napięcia.
    expect(tlumaczSegment('bus_110')).toBe('szyna 110 kV');
    // Rodzaj spoza słownika zostaje bez zmian (uczciwość zamiast zmyślania).
    expect(tlumaczSegment('cokolwiek_03')).toBe('cokolwiek_03');
  });

  it('referencja z samego odcisku daje uczciwy komunikat, nie pusty napis', () => {
    expect(etykietaZapasowaRefu('860003b4514aa388b39561d5005ce584')).toBe('obiekt modelu bez nazwy');
    expect(etykietaZapasowaRefu('')).toBe('—');
  });
});

describe('#143 — słownik zamknięty na KODZIE backendu, który buduje identyfikatory', () => {
  const wyrocznia = wyroczniaSegmentow as {
    segmenty: string[];
    przyrostki_podzialu: string[];
    pliki_zrodlowe: string[];
  };

  it('wyrocznia widzi wszystkie moduły budujące identyfikatory (zapadka na pusty pomiar)', () => {
    expect(wyrocznia.pliki_zrodlowe).toEqual(
      expect.arrayContaining(['src/enm/domain_operations.py', 'src/enm/domain_operations_v2.py']),
    );
    expect(wyrocznia.segmenty.length).toBeGreaterThan(100);
    expect(wyrocznia.przyrostki_podzialu).toEqual(
      expect.arrayContaining(['_L', '_R', '_SL', '_SR']),
    );
  });

  it('KAŻDY segment, który backend potrafi zbudować, ma polskie tłumaczenie', () => {
    const bezTlumaczenia = wyrocznia.segmenty.filter((s) => tlumaczSegment(s) === s);
    expect(
      bezTlumaczenia,
      `segmenty z kodu backendu bez tłumaczenia: ${bezTlumaczenia.join(', ')}`,
    ).toEqual([]);
  });

  it('KAŻDY przyrostek podziału odcinka × odcinek magistrali i odgałęzienia daje polską etykietę', () => {
    // Iloczyn cech: {przyrostek z kodu} × {odcinek magistrali, odcinek odgałęzienia,
    // zamknięcie pierścienia} — przyrostki doklejają operacje tnące KAŻDY odcinek.
    for (const podstawa of ['segment', 'branch_segment', 'ring_closure']) {
      for (const przyrostek of wyrocznia.przyrostki_podzialu) {
        const etykieta = tlumaczSegment(`${podstawa}${przyrostek}`);
        expect(etykieta, `${podstawa}${przyrostek}`).not.toMatch(/_|[A-Za-z]*[a-z][A-Z]|\b[LR]\b/);
        expect(etykieta).toMatch(/część [12]/);
      }
    }
  });

  it('część po podziale: numeracja 1/2 jak w nazwie połówki, podział powtórzony, rodzaj punktu', () => {
    expect(tlumaczSegment('segment_L')).toBe('odcinek, część 1');
    expect(tlumaczSegment('segment_R')).toBe('odcinek, część 2');
    expect(tlumaczSegment('segment_L_R')).toBe('odcinek, część 1.2');
    // Łącznik sekcyjny dzieli na `_SL`/`_SR` — ta sama numeracja, przyczyna nazwana.
    expect(tlumaczSegment('segment_SR')).toBe('odcinek, część 2 (podział przy: łącznik sekcyjny)');
    expect(tlumaczSegment('branch_segment_R_R_L_SL')).toBe(
      'odcinek odgałęzienia, część 2.2.1.1 (podział przy: łącznik sekcyjny)',
    );
    expect(tlumaczSegment('segment_R_zksn')).toBe('odcinek, część 2 (podział przy: ZKSN)');
    expect(tlumaczSegment('branch_segment_L_branch_pole')).toBe(
      'odcinek odgałęzienia, część 1 (podział przy: słup odgałęźny)',
    );
    // Rodzaj spoza słownika — uczciwie bez zmian, nie „część 1 (podział przy: cokolwiek)”.
    expect(tlumaczSegment('segment_L_cokolwiek')).toBe('segment_L_cokolwiek');
  });

  it('etykieta zapasowa toru DER-SN i elementów stacji nie niesie angielskiego segmentu', () => {
    const ziarno = '9d008ed355939bef762652554f56b2e4';
    expect(etykietaZapasowaRefu(`pv/${ziarno}/der/producer_nn_bus`)).toBe(
      'instalacja PV · źródło rozproszone · szyna nN wytwórcy',
    );
    expect(etykietaZapasowaRefu(`sn/${ziarno}/der/field_device`)).toBe(
      'SN · źródło rozproszone · aparat pola',
    );
    expect(etykietaZapasowaRefu(`bay/${ziarno}/linia_out_2`)).toBe('pole · liniowe wyjściowe 2');
    // Prefiks, który następny człon powtarza albo zawęża, nie dubluje słowa.
    expect(etykietaZapasowaRefu(`tr/${ziarno}/transformer`)).toBe('transformator');
    expect(etykietaZapasowaRefu(`seg/${ziarno}/segment_L`)).toBe('odcinek, część 1');
    expect(etykietaZapasowaRefu(`seg/${ziarno}/branch_segment`)).toBe('odcinek odgałęzienia');
    expect(etykietaZapasowaRefu(`stn/${ziarno}/nn_source/pv_inverter/protection`)).toBe(
      'stacja · źródło nN · falownik PV · zabezpieczenie',
    );
  });
});

