// @vitest-environment node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * STRAŻNIK — kod maszynowy nie trafia na ekran jako tekst dla projektanta.
 *
 * Lustro reguł backendu (`backend/tests/enm/test_klucze_pol_w_komunikatach_src.py`) po
 * stronie frontu. Cztery reguły klasy:
 *
 *  R1 „surowe sklejenie listy braków” — `missing_data.join(', ')`, `(x.missing ?? []).join(…)`,
 *     `brakujace.join(…)`: lista kodów braków (pól, elementów, predykatów) sklejona wprost w
 *     tekst. Opis braku idzie przez słownik (np. `opisyBrakowDanychNn`, `opisBrakuSsci`) albo
 *     wprost z listy opisów backendu (`missing_data_pl` łuku elektrycznego). Lista o nazwie
 *     z przyrostkiem `_pl` / `Pl` niesie zdania backendu i regule nie podlega.
 *  R2 „powrót do kodu” — `MAPA[kod] ?? kod` (także `|| kod`, `?? String(kod)` i klucz będący
 *     wyrażeniem składowym: `MAPA[x.typ] ?? x.typ`, `MAPA[a?.b] ?? a?.b`): kod spoza słownika
 *     wraca na ekran jako tekst. Jedno miejsce „etykieta albo uczciwe zdanie”:
 *     `etykietaZeSlownika` (`ui2/wyniki/wzorzec/slownikWyliczen.ts`). Ta sama reguła dla `Map`:
 *     `nazwy.get(ref) ?? ref` wypisywał identyfikator z odciskiem zamiast nazwy — zapas to
 *     `etykietaZapasowaRefu` (`ui2/wyniki/wzorzec/useNazwaObiektu.ts`) albo jawne zdanie.
 *  R3 „przełącznik zwraca kod” — `switch (kod) { case …: return 'opis'; default: return kod; }`:
 *     ta sama klasa co R2 zapisana instrukcją `switch` (pomiar 2026-11: 16 miejsc w `src`).
 *  R4 „nazwa albo identyfikator” — `obiekt.name || obiekt.ref_id`, `x?.name ?? ref`,
 *     `String(item.name_pl ?? … ?? item.id)`, `bay_name ?? bayRef`, także rozbite na linie
 *     (`?.name\n ?? elementId`) i ostatni człon referencji jako etykieta
 *     (`stationId.split('/').pop()`): obiekt bez nazwy pokazywał projektantowi referencję modelu
 *     z odciskiem, identyfikator katalogu albo UUID (pomiar 2026-11: 77 miejsc w `src`). Jedno
 *     miejsce reguły: `nazwaObiektuPl` / `nazwaPoReferencjiPl` (`ui/shared/nazwaObiektu.ts`) —
 *     opis rodzaju z numerem w kolekcji albo nazwą rodzica; identyfikator wyłącznie
 *     w informacjach audytowych.
 *
 * Wyjątki są jawne (`DOZWOLONE`), każdy z uzasadnieniem merytorycznym i testem żywotności —
 * martwy wpis byłby furtką.
 */

const FRONTEND_SRC = join(__dirname, '..', '..');

type Regula = 'R1' | 'R2' | 'R3' | 'R4';

interface Naruszenie {
  readonly regula: Regula;
  readonly plik: string;
  readonly linia: number;
  readonly fragment: string;
}

const R1 = /\b(?:missing\w*|\w*[mM]issing\w*|brak\w*)\b\s*(?:\?\?\s*\[\]\s*\))?\s*\.join\(/g;
const KLUCZ = String.raw`[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*`;
const R2 = new RegExp(
  String.raw`\[\s*(${KLUCZ})\s*\]\s*(?:\?\?|\|\|)\s*(?:String\(\s*)?\1(?![\w$?.])`,
  'g',
);
/** Ta sama klasa dla słownika `Map`: `mapa.get(kod) ?? kod` (nazwa/etykieta albo identyfikator). */
const R2_MAPA = new RegExp(
  String.raw`\.get\(\s*(${KLUCZ})\s*\)\s*(?:\?\?|\|\|)\s*(?:String\(\s*)?\1(?![\w$?.])`,
  'g',
);
/** `switch (x) { … default: return x; }` — także przełącznik po wartości pochodnej kodu
 *  (`switch (rodzaj(x)) { … default: return x; }`): w gałęzi domyślnej na ekran wraca ten sam kod.
 *  Bez przechodzenia przez kolejny `switch`. */
const R3 = new RegExp(
  String.raw`switch\s*\(\s*(?:${KLUCZ}\(\s*)?(${KLUCZ})\s*(?:\)\s*)?\)\s*\{(?:(?!switch\s*\()[\s\S])*?default:\s*return\s+\1\s*;`,
  'g',
);
/** Pole nazwy obiektu po lewej, identyfikator (lub jego składowa) po prawej `??` / `||`. */
const POLE_NAZWY = String.raw`(?:name|nazwa|name_pl|bay_name|station_name)`;
const IDENTYFIKATOR = String.raw`(?:ref_id|id|ref|element_ref|element_id|section_id|catalog_ref|[a-z][\w$]*_ref|[a-z][\w$]*Ref|[a-z][\w$]*Id)`;
const R4 = new RegExp(
  String.raw`(?<![\w$])(?:[\w$]+(?:\?\.|\.))?${POLE_NAZWY}\s*(?:\|\||\?\?)\s*(?:String\(\s*)?`
    + String.raw`(?:[A-Za-z_$][\w$]*(?:\??\.[\w$]+)*?\??\.)?${IDENTYFIKATOR}\b(?!\s*\()`,
  'g',
);
/** Ostatni człon referencji modelu jako etykieta: `stationId.split('/').pop()`. */
const R4_CZLON = /\b(?:[a-z][\w$]*(?:Id|Ref|_id|_ref)|id|ref)\.split\(\s*['"]\/['"]\s*\)\.pop\(\)/g;
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
  for (const [regula, wzor] of [['R1', R1], ['R2', R2], ['R2', R2_MAPA], ['R3', R3], ['R4', R4], ['R4', R4_CZLON]] as const) {
    for (const m of zrodlo.matchAll(wzor)) {
      if (regula === 'R1' && PRZYROSTEK_ZDAN.test(m[0])) continue;
      // R3 wskazuje linię `default: return kod;` (koniec dopasowania), nie początek `switch`.
      const koniec = regula === 'R3' ? m.index + m[0].length : m.index;
      const linia = zrodlo.slice(0, koniec).split('\n').length;
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
  'ui/sld/v3/compose/gpz.ts|return symbolId;':
    'Przyrostek identyfikatora testowego (`data-testid`) aparatu toru transformatora GPZ, nie '
    + 'tekst ekranu — symbol spoza skrótów jest tu kluczem technicznym DOM.',
  'ui/sld/v3/export/exportPalette.ts|map.get(hit) ?? hit':
    'Podmiana kolorów w znacznikach SVG eksportu: dopasowany kolor spoza mapy palety zostaje '
    + 'sam sobą (wartość atrybutu SVG, nie tekst ekranu).',
  'ui/sld/v3/export/pdfFont.ts|SPECIAL_WIDTH_CHAR.get(char) ?? char':
    'Metryka szerokości znaku czcionki PDF: znak spoza mapy znaków specjalnych jest sam sobą '
    + '(pomiar szerokości glifu, nie tekst ekranu).',
  'ui/shared/fileNamingConvention.ts|POLISH_CHAR_MAP[c] ?? c':
    'Transliteracja znaków nazwy pliku: znak spoza mapy polskich liter jest SAM SOBĄ (litera '
    + 'łacińska, cyfra) — to nie kod, tylko znak tekstu.',
  'ui/proof/latexTekst.ts|ZNAKI_POLECEN[polecenie] ?? polecenie':
    'Odczyt tekstowy wzoru LaTeX (`tekstBezWzorow` — etykiety dostępności, eksport tekstu): '
    + 'polecenie spoza mapy znaków (np. `\\lg`, `\\sin`) czyta się nazwą funkcji matematycznej — '
    + 'to zapis wzoru, nie kod maszynowy.',
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
  'ui/sld/shared/sldActionExecutor.ts|generator?.name ?? elementId':
    'Klucz dopasowania preselekcji modułu macierzy NC RfG (`MacierzNcRfg`: `derRef === klucz || '
    + 'nazwa === klucz`), nie tekst ekranu — wartość nie jest nigdzie wyświetlana.',
  'ui/network-build/operationContextResolvers.ts|(left.name ?? left.ref_id).localeCompare(':
    'Klucz sortowania szyn o tym samym napięciu (deterministyczny porządek wyboru szyny GN/DN '
    + 'transformatora), nie tekst ekranu — etykiety tych szyn idą przez `nazwaObiektuPl`.',
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

describe('Strażnik: kod maszynowy nie trafia na ekran (R1 sklejenie braków, R2 powrót do kodu, R3 przełącznik zwraca kod, R4 nazwa albo identyfikator)', () => {
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
    const iniekcje: Array<[string, Regula[]]> = [
      ['const t = `Brak: ${(view.missing_data ?? []).join(", ")}`;', ['R1']],
      ['const t = wynik.missing_fields.join("; ");', ['R1']],
      ['const t = brakujace.join(", ");', ['R1']],
      ['return MAPA[kod] ?? kod;', ['R2']],
      ['return (MAPA as Record<string, string>)[typ]\n    ?? typ;', ['R2']],
      ['return MAPA[kod] || kod;', ['R2']],
      ['const t = SLOWNIK[wynik.status] ?? wynik.status;', ['R2']],
      ['const t = SLOWNIK[os?.status] || os?.status;', ['R2']],
      ['const t = SLOWNIK[e.typ] ?? String(e.typ);', ['R2']],
      ['const t = SLOWNIK[e.typ] ?? e.typPl;', []],
      ['const t = nazwy.get(ref) ?? ref;', ['R2']],
      ['const t = nazwy.get(run.case_id) || run.case_id;', ['R2']],
      ['const t = nazwy.get(ref) || etykietaZapasowaRefu(ref);', []],
      ['const t = SLOWNIK[e.typ] ?? e.typ.opis;', []],
      ["switch (rodzaj) {\n  case 'a':\n    return 'Opis A';\n  default:\n    return rodzaj;\n}", ['R3']],
      ["switch (x.tryb) {\n  case 'a':\n    return 'A';\n  default:\n    return x.tryb;\n}", ['R3']],
      ["switch (rodzajSymbolu(symbol)) {\n  case 'a':\n    return 'A';\n  default:\n    return symbol;\n}", ['R3']],
      ["switch (rodzajSymbolu(symbol)) {\n  case 'a':\n    return 'A';\n  default:\n    return 'symbol spoza słownika';\n}", []],
      ["switch (rodzaj) {\n  case 'a':\n    return 'Opis A';\n  default:\n    return 'rodzaj spoza słownika';\n}", []],
      ["switch (a) {\n  default:\n    return null;\n}\nswitch (b) {\n  default:\n    return a;\n}", []],
      ['const t = wynik.missing_fields_pl.join(" ");', []],
      ['const t = opisyBrakowDanychNn(view.missing_data);', []],
      ['return etykietaZeSlownika(MAPA, kod);', []],
      ['// dawniej: MAPA[kod] ?? kod oraz missing.join(", ")', []],
      ['return MAPA[kod] ?? "brak opisu";', []],
      ['const t = bus.name || bus.ref_id;', ['R4']],
      ['const t = stacja?.name ?? stationRef;', ['R4']],
      ['const t = String(item.name_pl ?? params.name ?? item.id ?? "");', ['R4']],
      ['const t = item?.bay_name ?? bayRef ?? "Pole";', ['R4']],
      ['const t = selected?.name\n    ?? elementId\n    ?? "Pole";', ['R4']],
      ['const t = tor.element.nazwa || tor.element.ref_id;', ['R4']],
      ['const t = gniazdo.nazwa ?? gniazdo.catalog_ref;', ['R4']],
      ['const t = run.name ?? run.id;', ['R4']],
      ['const t = view.station_name ?? view.station_ref;', ['R4']],
      ["const t = label ?? stationId.split('/').pop();", ['R4']],
      ["const t = id.split('/').pop();", ['R4']],
      ["const t = nazwaPliku.split('/').pop();", []],
      ['const t = nazwaObiektuPl(bus.name, "szyna", miejsceWKolekcji(model.buses, bus));', []],
      ['const t = nazwaPoReferencjiPl(model.buses, ref, "szyna");', []],
      ['const t = bus.name ?? "Szyna bez nazwy";', []],
      ['const t = { name: x.name, ref: x.ref_id };', []],
      ['const t = bus.name ?? zbudujOpis(bus.ref_id);', []],
      ['// dawniej: bus.name || bus.ref_id', []],
    ];
    for (const [zrodlo, oczekiwane] of iniekcje) {
      const reguly = naruszeniaKodowNaEkranie('iniekcja.ts', zrodlo).map((n) => n.regula);
      expect(reguly, zrodlo).toEqual(oczekiwane);
    }
  });
});
