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
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { etykietaZapasowaRefu, tlumaczSegment } from '../useNazwaObiektu';

const FIXTURA = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..', '..',
  'ui', 'sld', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json',
);

/** Segment maszynowy — ta sama reguła co w module (odcisk/UUID). */
const ODCISK = /^[0-9a-f]{8,}$/i;

/** Segmenty referencji występujące w REALNEJ migawce modelu. */
function segmentyRealnychRefow(): readonly string[] {
  const tekst = readFileSync(FIXTURA, 'utf8');
  const refy = new Set<string>();
  for (const [, ref] of tekst.matchAll(/"((?:gpz|station|substation|corridor)\/[A-Za-z0-9_/-]+)"/g)) {
    refy.add(ref);
  }
  const segmenty = new Set<string>();
  for (const ref of refy) {
    for (const segment of ref.split('/')) {
      if (segment === '' || ODCISK.test(segment) || /^\d+$/.test(segment)) continue;
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
