import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * STRAŻNIK — kod maszynowy nie trafia na ekran jako tekst dla projektanta.
 *
 * Lustro reguł backendu (`backend/tests/enm/test_klucze_pol_w_komunikatach_src.py`) po
 * stronie frontu. Dwie reguły klasy:
 *
 *  R1 „surowe sklejenie listy braków” — `missing_data.join(', ')`, `(x.missing ?? []).join(…)`,
 *     `brakujace.join(…)`: lista kodów braków (pól, elementów, predykatów) sklejona wprost w
 *     tekst. Opis braku idzie przez słownik (np. `opisyBrakowDanychNn`, `opisBrakuSsci`) albo
 *     wprost z listy opisów backendu (`missing_data_pl` łuku elektrycznego). Lista o nazwie
 *     z przyrostkiem `_pl` / `Pl` niesie zdania backendu i regule nie podlega.
 *  R2 „powrót do kodu” — `MAPA[kod] ?? kod` (także `|| kod`): kod spoza słownika wraca na ekran
 *     jako tekst. Jedno miejsce „etykieta albo uczciwe zdanie”: `etykietaZeSlownika`
 *     (`ui2/wyniki/wzorzec/slownikWyliczen.ts`).
 *
 * Wyjątki są jawne (`DOZWOLONE`), każdy z uzasadnieniem merytorycznym i testem żywotności —
 * martwy wpis byłby furtką.
 */

const FRONTEND_SRC = join(__dirname, '..', '..');

interface Naruszenie {
  readonly regula: 'R1' | 'R2';
  readonly plik: string;
  readonly linia: number;
  readonly fragment: string;
}

const R1 = /\b(?:missing\w*|\w*[mM]issing\w*|brak\w*)\b\s*(?:\?\?\s*\[\]\s*\))?\s*\.join\(/g;
const R2 = /\[\s*([A-Za-z_$][\w$]*)\s*\]\s*(?:\?\?|\|\|)\s*\1\b/g;
const PRZYROSTEK_ZDAN = /(?:_pl|Pl)\b\s*(?:\?\?\s*\[\]\s*\))?\s*\.join\($/;

/** Komentarze zastąpione spacjami (z zachowaniem końców linii), żeby opis wzorca w
 *  dokumentacji kodu nie był naruszeniem. */
function bezKomentarzy(tekst: string): string {
  const puste = (m: string) => m.replace(/[^\n]/g, ' ');
  return tekst
    .replace(/\/\*[\s\S]*?\*\//g, puste)
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, przed: string) => przed + puste(m.slice(przed.length)));
}

function naruszeniaKodowNaEkranie(plik: string, tekst: string): Naruszenie[] {
  const zrodlo = bezKomentarzy(tekst);
  const linie = tekst.split('\n');
  const wynik: Naruszenie[] = [];
  for (const [regula, wzor] of [['R1', R1], ['R2', R2]] as const) {
    for (const m of zrodlo.matchAll(wzor)) {
      if (regula === 'R1' && PRZYROSTEK_ZDAN.test(m[0])) continue;
      const linia = zrodlo.slice(0, m.index).split('\n').length;
      wynik.push({ regula, plik, linia, fragment: linie[linia - 1].trim() });
    }
  }
  return wynik;
}

/** Wyjątek: plik + fragment linii (stabilny wobec przesunięć linii) → uzasadnienie. */
const DOZWOLONE: Readonly<Record<string, string>> = {
  'oze-source-harness-main.tsx|CODES[archetype] ?? archetype':
    'Strona-uprząż zrzutów e2e (`oze-source-harness.html`), nie ekran produktu — archetyp jest '
    + 'tu kluczem scenariusza zrzutu.',
  'oze-source-harness-main.tsx|NAMES[archetype] ?? archetype':
    'Strona-uprząż zrzutów e2e (`oze-source-harness.html`), nie ekran produktu — archetyp jest '
    + 'tu kluczem scenariusza zrzutu.',
  'ui/shared/fileNamingConvention.ts|POLISH_CHAR_MAP[c] ?? c':
    'Transliteracja znaków nazwy pliku: znak spoza mapy polskich liter jest SAM SOBĄ (litera '
    + 'łacińska, cyfra) — to nie kod, tylko znak tekstu.',
  'ui2/wyniki/dowod/dowodModel.ts|CYFRY_GORNE[znak] ?? znak':
    'Zamiana cyfr na indeks górny w zapisie wykładnika: znak spoza mapy (znak minus, kropka) '
    + 'jest sam sobą — to znak zapisu liczby, nie kod.',
  'ui2/kreatory/zrodlo/zrodloModel.ts|normalized[lower] ?? lower':
    'Transliteracja polskiej litery do identyfikatora: wywołanie wyłącznie dla dopasowania '
    + '[ąćęłńóśźż], więc gałąź „??” obejmuje tylko literę, która jest sama sobą.',
  'ui/property-grid/UnitLabel.tsx|descriptions[unit] ?? unit':
    'Opis słowny jednostki w dymku: symbol jednostki SI spoza słownika opisów (np. „kVA”) jest '
    + 'sam etykietą wielkości (IEC 80000-1) — nie kodem maszynowym.',
  'ui/inspector/formatProtection.ts|ANSI_TO_SHORTCUT[primary] ?? primary':
    'Oznaczenie funkcji zabezpieczenia: numer urządzenia wg IEEE C37.2 / ANSI (np. „87T”) jest '
    + 'normowym oznaczeniem funkcji, gdy nie ma skrótu IEC 60617.',
  'ui2/kreatory/stacja/KreatorStacjiSnNn.tsx|(podglad.impact?.missing_data_after ?? []).join(':
    'Lista `missing_data_after` podglądu podziału odcinka niesie ZDANIA backendu '
    + '(`enm/domain_operations.py`, „Odcinek … nie ma pozycji katalogowej …”), nie kody.',
  'ui/network-build/station-templates/StationBatchPlanner.tsx|{row.missingFields.join(':
    'Lista `missingFields` planera wsadowego jest budowana lokalnie z polskich nazw '
    + '(„szablon stacji”, „odcinek docelowy”, „długość odcinka”), nie z kodów.',
  'ui/protection-coordination/api.ts|${brakujace.join(':
    'Diagnoza niezgodności wersji API (wynik koordynacji bez kolekcji): nazwy kolekcji '
    + 'kontraktu są tu przedmiotem komunikatu (token formatu danych API), a zdanie mówi, co '
    + 'sprawdzić.',
  'ui2/adapters/topologiaZasilenia.ts|${brakujace.join(':
    'Diagnoza niezgodności wersji API (odpowiedź bez pól kontraktu): nazwy pól kontraktu są tu '
    + 'przedmiotem komunikatu (token formatu danych API).',
};

function* pliki(katalog: string): Generator<string> {
  for (const wpis of readdirSync(katalog)) {
    if (wpis === '__tests__' || wpis === 'node_modules' || wpis === 'test' || wpis.startsWith('.')) {
      continue;
    }
    const sciezka = join(katalog, wpis);
    if (statSync(sciezka).isDirectory()) {
      yield* pliki(sciezka);
    } else if (/\.(ts|tsx)$/.test(wpis) && !/\.(test|spec)\.(ts|tsx)$/.test(wpis) && !wpis.endsWith('.d.ts')) {
      yield sciezka;
    }
  }
}

function wszystkieNaruszenia(): Naruszenie[] {
  const wynik: Naruszenie[] = [];
  for (const sciezka of pliki(FRONTEND_SRC)) {
    const plik = relative(FRONTEND_SRC, sciezka).split('\\').join('/');
    wynik.push(...naruszeniaKodowNaEkranie(plik, readFileSync(sciezka, 'utf-8')));
  }
  return wynik;
}

function dozwolone(n: Naruszenie): string | null {
  for (const klucz of Object.keys(DOZWOLONE)) {
    const [plik, fragment] = klucz.split('|');
    if (n.plik === plik && n.fragment.includes(fragment)) return klucz;
  }
  return null;
}

describe('Strażnik: kod maszynowy nie trafia na ekran (R1 sklejenie braków, R2 powrót do kodu)', () => {
  const naruszenia = wszystkieNaruszenia();

  it('produkt frontu: RAZEM 0 poza jawnymi wyjątkami', () => {
    const niedozwolone = naruszenia
      .filter((n) => dozwolone(n) === null)
      .map((n) => `${n.regula} ${n.plik}:${n.linia} ${n.fragment}`);
    expect(niedozwolone).toEqual([]);
  });

  it('każdy wyjątek ma uzasadnienie i jest żywy (bez wpisu strażnik zgłasza miejsce)', () => {
    const uzyte = new Set(naruszenia.map(dozwolone).filter((k): k is string => k !== null));
    for (const [klucz, uzasadnienie] of Object.entries(DOZWOLONE)) {
      expect(uzasadnienie.trim().length, klucz).toBeGreaterThan(40);
      expect(uzyte.has(klucz), `martwy wyjątek: ${klucz}`).toBe(true);
    }
  });

  it('iniekcje: każda reguła czerwienieje na swoim wzorcu, poprawna postać — nie', () => {
    const iniekcje: Array<[string, Array<'R1' | 'R2'>]> = [
      ['const t = `Brak: ${(view.missing_data ?? []).join(", ")}`;', ['R1']],
      ['const t = wynik.missing_fields.join("; ");', ['R1']],
      ['const t = brakujace.join(", ");', ['R1']],
      ['return MAPA[kod] ?? kod;', ['R2']],
      ['return (MAPA as Record<string, string>)[typ]\n    ?? typ;', ['R2']],
      ['return MAPA[kod] || kod;', ['R2']],
      ['const t = wynik.missing_fields_pl.join(" ");', []],
      ['const t = opisyBrakowDanychNn(view.missing_data);', []],
      ['return etykietaZeSlownika(MAPA, kod);', []],
      ['// dawniej: MAPA[kod] ?? kod oraz missing.join(", ")', []],
      ['return MAPA[kod] ?? "brak opisu";', []],
    ];
    for (const [zrodlo, oczekiwane] of iniekcje) {
      const reguly = naruszeniaKodowNaEkranie('iniekcja.ts', zrodlo).map((n) => n.regula);
      expect(reguly, zrodlo).toEqual(oczekiwane);
    }
  });
});
