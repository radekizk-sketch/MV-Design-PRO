/**
 * STRAŻNIK KLASY „język inżyniera na pierwszym planie wyników" (karta #145).
 *
 * DLACZEGO TEN PLIK ISTNIEJE. Właściciel ocenił kiedyś okno wyników na 0/10 słowami
 * „zbędne kody produkcyjne nie mają prawa pojawić się w interfejsie". Naprawa
 * pojedynczego okna nie wystarczyła: zrzuty żywej aplikacji z 2026-09-24 pokazały tę
 * samą klasę na wielu ekranach naraz — surowe referencje (`stn/08e2…/sn_bus`) w
 * kolumnach tabel, kody wyliczeń (`RECONFIGURED`), notatki deweloperskie jako
 * „założenia", linie śladu bez polskich znaków, odsyłacze do kart i audytów, obcięty
 * zrzut odpowiedzi solvera jako „raport". Każdy z tych defektów przechodził testy
 * jednostkowe swojego modułu, bo żaden test nie czytał EKRANU tak, jak czyta go
 * projektant. Ten spec czyta.
 *
 * CO ROBI. Odwiedza KAŻDĄ scenę wyników i oceny harnessu (`creator-harness.html`,
 * realne komponenty + fikstury policzone backendem), prowadzi ją ścieżką projektanta
 * (natywne kliki: uruchomienie, wybór wiersza, rozwinięcie śladu, wywodu i wyjaśnień)
 * i po KAŻDYM kroku zbiera widoczny tekst korzenia sceny (`innerText`) razem z
 * etykietami list wyboru. Z pomiaru wyłączone są wyłącznie: treść „Informacji
 * audytowych" (`InformacjeAudytowe` — jedyne miejsce metadanych produkcyjnych, spec
 * nigdy ich nie rozwija) i niewidoczna warstwa MathML wzorów KaTeX (dubel wzoru
 * dla czytników ekranu, nie tekst dla oka).
 *
 * CO SPRAWDZA (lista jawna, każdy wzorzec ma nazwę w meldunku błędu):
 *  - referencja z ziarnem (`stn/<32 znaki szesnastkowe>/…`) i KAŻDA referencja
 *    `ref_id` z fikstur scen (sieć złota: `bus_sn_b`, `line_b_c`, `gen_sync`…),
 *  - identyfikatory maszynowe: UUID, odcisk szesnastkowy, znacznik czasu ISO,
 *    klucz w stylu `snake_case` i nazwa klasy w stylu `CamelCase`,
 *  - kod wyliczenia `WIELKIE_Z_PODKRESLNIKIEM`, angielski kod statusu (`RECONFIGURED`)
 *    i wartość wyliczenia wersalikami stojąca sama w komórce (`PRZEKROCZENIE`),
 *  - wartości puste języka programowania (`None`, `null`, `undefined`, `NaN`) i zapis
 *    JSON (`["RFG_13_2"]`, `{"time_s": …}`) zamiast listy po polsku,
 *  - odsyłacze procesu (karty, audyty, sondy, daty prac) — lista fraz niżej,
 *  - słowa polskie zapisane bez polskich znaków — lista słów niżej (zdanie dla
 *    inżyniera jest po polsku, nie w transliteracji z kodu).
 *
 * Prawdziwy backend nie jest potrzebny scenom liczonym z fikstur; bieg „co-jeśli"
 * macierzy NC RfG idzie do backendu biegu (tak jak w `dowody-ncrfg-screenshot`).
 */
import { test, expect, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adresHarnessu } from './adresHarnessu';
import { parametrySceny, wypelnijUziomIPotwierdz } from './formularzV126';
import { wybierzElementOdbioru } from './odbiorPomiary';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = adresHarnessu('creator-harness.html');
const FIXTURY_DIR = path.resolve(_dirname, '../src/harness-fixtures/generated');
/** Katalog zrzutu tekstów (pomiar do meldunku) — ustawiany wyłącznie ręcznie. */
const KATALOG_ZRZUTU = process.env.JEZYK_INZYNIERA_ZRZUT_DIR;

/** Fikstura sceny — DOKŁADNIE ten plik, którym harness karmi ekran. */
function fixtura<T>(nazwa: string): T {
  return JSON.parse(fs.readFileSync(path.join(FIXTURY_DIR, `${nazwa}.json`), 'utf-8')) as T;
}

// ---------------------------------------------------------------------------
// Referencje modeli scen — lista z FIKSTUR, nie z pamięci specu
// ---------------------------------------------------------------------------

/** Każde `ref_id` z migawek scen i z nazw obiektów scen akademickich. */
function referencjeModeliScen(): string[] {
  const refy = new Set<string>();
  const zbieraj = (wezel: unknown): void => {
    if (Array.isArray(wezel)) {
      wezel.forEach(zbieraj);
      return;
    }
    if (wezel !== null && typeof wezel === 'object') {
      const obiekt = wezel as Record<string, unknown>;
      if (typeof obiekt.ref_id === 'string' && obiekt.ref_id !== '') refy.add(obiekt.ref_id);
      Object.values(obiekt).forEach(zbieraj);
    }
  };
  const pliki = fs
    .readdirSync(FIXTURY_DIR)
    .filter((plik) => plik.includes('migawka') || plik === 'nazwy_obiektow_scen_akademickich.json');
  pliki.forEach((plik) => zbieraj(JSON.parse(fs.readFileSync(path.join(FIXTURY_DIR, plik), 'utf-8'))));
  return [...refy].sort();
}

const REFERENCJE_MODELI = referencjeModeliScen();

// ---------------------------------------------------------------------------
// Uwagi profili NC RfG — tekst zamrożony bramką B-01 (zmiana wymaga zgody właściciela)
// ---------------------------------------------------------------------------

const PROFILE_NC_RFG_DIR = path.resolve(_dirname, '../../backend/src/catalog/profiles/nc_rfg');

/**
 * Treści pól `uwagi_pl` z plików profili NC RfG (warstwy i operatorzy). Niosą odsyłacze
 * procesu („plan AB §12.1", „decyzji właściciela O-1"), a ekrany zgodności cytują je
 * w wyjaśnieniach — ale profile są zamrożone bramką B-01 i karta #145 ich nie zmienia.
 * Wyjątek jest WYPROWADZONY z plików, nie wpisany ręcznie: pomiar wycina z linii
 * DOKŁADNIE tekst uwagi profilu (po znormalizowaniu odstępów) i sprawdza resztę linii.
 * Gdy właściciel poprawi profil, wyjątek znika sam; ten sam odsyłacz w każdym innym
 * tekście nadal jest naruszeniem.
 */
function uwagiProfiliNcRfg(): string[] {
  const pliki = ['warstwy', 'operatorzy'].flatMap((podkatalog) =>
    fs
      .readdirSync(path.join(PROFILE_NC_RFG_DIR, podkatalog))
      .filter((plik) => plik.endsWith('.yaml'))
      .map((plik) => path.join(PROFILE_NC_RFG_DIR, podkatalog, plik)),
  );
  const uwagi: string[] = [];
  pliki.forEach((plik) => {
    const linie = fs.readFileSync(plik, 'utf-8').split('\n');
    linie.forEach((linia, i) => {
      const dopasowanie = /^(\s*)uwagi_pl:\s*(.*)$/.exec(linia);
      if (!dopasowanie) return;
      const [, wciecie, reszta] = dopasowanie;
      if (reszta.startsWith('"') || reszta.startsWith("'")) {
        uwagi.push(reszta.slice(1, -1));
        return;
      }
      // Blok zawinięty `>-`: kolejne linie głębiej wcięte, sklejone spacją.
      const czesci: string[] = [];
      for (let j = i + 1; j < linie.length; j += 1) {
        const nastepna = linie[j];
        const wciecieNastepnej = /^(\s*)/.exec(nastepna)![1].length;
        if (nastepna.trim() === '' || wciecieNastepnej <= wciecie.length) break;
        czesci.push(nastepna.trim());
      }
      if (czesci.length > 0) uwagi.push(czesci.join(' '));
    });
  });
  return uwagi.map((u) => u.replace(/\s+/g, ' ').trim()).filter((u) => u !== '');
}

const UWAGI_PROFILI_B01 = uwagiProfiliNcRfg();

/**
 * Teksty silnika prób NC RfG (`network_model/solvers/ncrfg_ptpiree/engine.py`) — rdzeń
 * zamrożony bramką B-01. Silnik nazywa dane przyjęte i braki z kluczem pola kontraktu
 * w nawiasie („napięcie przyłączenia modułu (voltage_kv)"); rekordy oceny cytują te
 * zdania na pierwszym planie macierzy (bieg „co-jeśli"). Zmiana wymaga zgody właściciela
 * na edycję rdzenia — do tego czasu pomiar wycina DOKŁADNIE literały silnika zawierające
 * klucz pola (sklejone jak w Pythonie: sąsiednie literały łączone, fragment `{…}` f-stringu
 * dopasowuje dowolny tekst). Literał wyprowadzony z pliku silnika, nie wpisany ręcznie:
 * poprawiony silnik zawęża wyjątek sam; ten sam klucz pola w innym tekście nadal jest
 * naruszeniem.
 */
function literalySilnikaNcRfgB01(): RegExp[] {
  const zrodlo = fs.readFileSync(
    path.resolve(_dirname, '../../backend/src/network_model/solvers/ncrfg_ptpiree/engine.py'),
    'utf-8',
  );
  // Ciągi sąsiednich literałów napisowych (opcjonalny prefiks f) rozdzielonych odstępami.
  const ciagi = zrodlo.match(/(?:f?"(?:[^"\\\n]|\\.)*"\s*)+/g) ?? [];
  const literaly = ciagi
    .map((ciag) => [...ciag.matchAll(/f?"((?:[^"\\\n]|\\.)*)"/g)].map((m) => m[1]).join(''))
    .filter((tekst) => /\([a-z][a-z0-9]*_[a-z0-9_]*(?:, [a-z][a-z0-9_]*)*\)/.test(tekst));
  // Najdłuższe najpierw: literał krótszy bywa fragmentem dłuższego (wycięcie krótszego
  // rozbiłoby dłuższy i zostawiło klucz pola w reszcie linii).
  return [...new Set(literaly)].sort((a, b) => b.length - a.length).map(
    (tekst) =>
      new RegExp(
        tekst
          .split(/\{[^}]*\}/)
          .map((czesc) => czesc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('.*?'),
        'g',
      ),
  );
}

const LITERALY_SILNIKA_B01 = literalySilnikaNcRfgB01();

// ---------------------------------------------------------------------------
// Wzorce naruszeń (lista jawna)
// ---------------------------------------------------------------------------

/**
 * Odsyłacze procesu — frazy, które opisują PRACĘ NAD PROGRAMEM (karty, audyty, sondy,
 * decyzje z datą), a nie sieć. Projektant nie zna kart ani sond; zdanie dla niego
 * mówi, co policzono i dlaczego, a nie kiedy i w której karcie to zmieniono.
 */
const ODSYLACZE_PROCESU: readonly string[] = [
  'uczciwość natychmiastowa',
  'uczciwosc natychmiastowa',
  'sonda audytu',
  'sondy audytu',
  'audyt właściciela',
  'decyzja właściciela',
  'dyrektywa właściciela',
  'karta V',
  'karty V',
  'kartą V',
  'karta AB',
  'karta #',
  'Pakiet 0',
  'HARNESS',
  'harness',
  'fikstur',
  'atrap',
  'V12K',
  'TODO',
  'FIXME',
  'white box',
  'WHITE BOX',
  'White Box',
  'snapshot',
  'payload',
  'backend',
  'frontend',
  'plan AB',
  'Plan AB',
  'do dopracowania',
  'na razie',
];

/**
 * Słowa polskie zapisane bez polskich znaków. Lista jawna — każde słowo to forma,
 * która w polszczyźnie NIE istnieje bez znaków diakrytycznych (więc trafienie jest
 * zawsze błędem zapisu, nie fałszywym alarmem).
 */
const SLOWA_BEZ_POLSKICH_ZNAKOW: readonly string[] = [
  'napiecie', 'napiecia', 'napieciu', 'napieciem', 'napiec', 'napieciowe', 'napieciowy',
  'prad', 'pradu', 'pradem', 'pradow', 'prady',
  'wezel', 'wezla', 'wezlow', 'wezle', 'wezly',
  'galaz', 'galezi', 'galezie',
  'zrodlo', 'zrodla', 'zrodel', 'zrodle',
  'obciazenie', 'obciazenia', 'obciazen',
  'wzor', 'Wzor', 'wzoru',
  'wartosc', 'wartosci',
  'porownania', 'porownanie', 'porownan', 'Porownanie',
  'krawedz', 'krawedzi',
  'nizsza', 'nizszy', 'nizej', 'wyzsza', 'wyzszy', 'wyzej',
  'przekaznik', 'przekaznika',
  'spelnione', 'spelniony', 'spelnia', 'niespelnione', 'SPELNIONE', 'NIESPELNIONE',
  'zaklocenia', 'zaklocenie', 'zaklocen',
  'prob', 'probie', 'proby',
  'czestotliwosc', 'czestotliwosci',
  'wylaczenie', 'wylaczenia', 'wylacznik', 'wylacznika',
  'lacznik', 'lacznika', 'polaczenie',
  'zalozenie', 'zalozenia', 'zalozen',
  'dlugosc', 'dlugosci',
  'przeksztaltnik', 'przeksztaltnika', 'przeksztaltnikow',
  'wspolczynnik', 'wspolczynnika',
  'wiekszy', 'wieksze', 'wieksza',
  'moze', 'mozna', 'ktory', 'ktora', 'ktore', 'jesli', 'wiec', 'rowne', 'rowna', 'rowny',
  'rownanie', 'rownania',
  'sciezka', 'sciezki',
  'odleglosc', 'odleglosci',
  'skladowa', 'skladowe', 'skladowych',
  'uklad', 'ukladu',
  'katem', 'kata',
  'dzialanie', 'dzialania', 'zadzialanie', 'zadzialania',
  'opoznienie', 'opoznienia',
  'poczatek', 'poczatku', 'koncowy', 'koncowe',
  'glebokosc', 'glebokosci',
  'wlasny', 'wlasne', 'wlasciwy', 'wlasciwe',
  'rozplyw', 'rozplywu',
  'blad', 'bledu', 'bledy',
  'slad', 'sladu', 'Slad',
  'niepewnosc', 'niepewnosci', 'dokladnosc',
  'mozliwe', 'niemozliwe',
  'przyjeto', 'przyjete', 'zalozono',
  'uwzglednione', 'uwzgledniono',
];

/** Angielskie kody statusów/wyliczeń (jedno słowo, bez podkreślnika) — w dowolnym miejscu tekstu. */
const KODY_ANGIELSKIE: readonly string[] = [
  'OK', 'PASS', 'FAIL', 'FAILED', 'WARN', 'WARNING', 'ERROR', 'INFO', 'NONE', 'TRUE', 'FALSE',
  'True', 'False', 'MARGINAL',
  'RECONFIGURED', 'ISLANDED', 'SECTION', 'STABLE', 'UNSTABLE', 'DONE', 'PENDING', 'FINISHED',
  'COMPUTED', 'UNAVAILABLE', 'UNKNOWN', 'PARTIAL', 'COMPLETE', 'VALID', 'INVALID', 'BLOCKED',
  'CONVERGED', 'DIVERGED',
];

/**
 * Wartości wyliczeń pisane wielkimi literami, które mają też uczciwy zapis na ekranie jako
 * SKRÓT albo NAGŁÓWEK wersalikami („Pasmo MIN/MAX", plakietka „GOTOWOŚĆ POTWIERDZONA",
 * „SPEŁNIA WYMAGANIA" — kontrakt prezentacji V12.7 §0.5). Kodem wyliczenia są dopiero
 * wtedy, gdy stoją SAME jako komórka tabeli albo cała linia — tak wygląda wartość
 * wyliczenia przepisana na ekran zamiast etykiety (komórka „PRZEKROCZENIE", „MAX").
 */
const KODY_WYLICZEN_SAMODZIELNE: readonly string[] = [
  'PRZEKROCZENIE', 'STABILNY', 'NIESTABILNY', 'ZGODNY', 'NIEZGODNY', 'SPELNIA', 'SPEŁNIA',
  'NIESPELNIA', 'NIEOCENIONO', 'POTWIERDZONA', 'NIEPOTWIERDZONA', 'WYCOFANA', 'KATALOG',
  'RECZNE', 'RĘCZNE', 'MAGAZYN', 'PASMO', 'PPM', 'MAX', 'MIN', 'OSTRZEZENIE', 'OSTRZEŻENIE',
  'BRAK', 'ZASTANE', 'DEKLARACJA', 'SYMULACJA',
];

interface Wzorzec {
  readonly nazwa: string;
  readonly test: (tekst: string) => string[];
}

function trafieniaWyrazenia(wyrazenie: RegExp): (tekst: string) => string[] {
  return (tekst) => [...tekst.matchAll(new RegExp(wyrazenie.source, `${wyrazenie.flags.replace('g', '')}g`))].map((m) => m[0]);
}

function trafieniaSlow(slowa: readonly string[]): (tekst: string) => string[] {
  const wyrazenie = new RegExp(
    `(?<![\\p{L}\\p{N}_])(?:${slowa.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}\\p{N}_])`,
    'gu',
  );
  return (tekst) => [...tekst.matchAll(wyrazenie)].map((m) => m[0]);
}

function trafieniaFraz(frazy: readonly string[]): (tekst: string) => string[] {
  return (tekst) => frazy.filter((fraza) => tekst.includes(fraza));
}

/** Komórki linii (`innerText` rozdziela komórki tabeli tabulatorem) równe kodowi wyliczenia. */
function trafieniaKomorek(kody: readonly string[]): (tekst: string) => string[] {
  const zbior = new Set(kody);
  return (tekst) =>
    tekst
      .split('\t')
      .map((komorka) => komorka.trim())
      .filter((komorka) => zbior.has(komorka));
}

const WZORCE: readonly Wzorzec[] = [
  { nazwa: 'referencja z ziarnem', test: trafieniaWyrazenia(/[a-z_]+\/[0-9a-f]{32}(?:\/|\b)/) },
  { nazwa: 'referencja modelu sceny', test: trafieniaSlow(REFERENCJE_MODELI) },
  { nazwa: 'UUID', test: trafieniaWyrazenia(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i) },
  // Odcisk: co najmniej 8 znaków szesnastkowych (małe litery) z literą a–f I cyfrą —
  // także skrót odcisku (`66e29b8f`) w etykiecie przebiegu. Liczba dziesiętna ani słowo
  // polskie nie spełniają obu warunków naraz.
  {
    nazwa: 'odcisk szesnastkowy',
    test: trafieniaWyrazenia(/\b(?=[0-9a-f]*[a-f])(?=[0-9a-f]*\d)[0-9a-f]{8,}\b/),
  },
  // Identyfikator przebiegu/przypadku/porównania w zapisie sceny (`run-lf-scena-a`,
  // `case-demo`) — w produkcji to UUID, w fiksturach czytelny klucz; oba są metadaną.
  {
    nazwa: 'identyfikator przebiegu lub przypadku',
    test: trafieniaWyrazenia(/\b(?:run|case|cmp)-[a-z0-9]+(?:-[a-z0-9]+)*\b/),
  },
  { nazwa: 'znacznik czasu ISO', test: trafieniaWyrazenia(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/) },
  // Kod wyliczenia: człon z co najmniej dwiema wielkimi literami (symbol wielkości
  // z indeksem — `Z_Q`, `I_C` — kodem nie jest).
  { nazwa: 'kod WIELKIE_Z_PODKRESLNIKIEM', test: trafieniaWyrazenia(/\b[A-Z]{2,}[A-Z0-9]*(?:_[A-Z0-9]+)+\b/) },
  { nazwa: 'klucz snake_case', test: trafieniaWyrazenia(/\b[a-z]{2,}(?:_[a-z0-9]+)+\b/) },
  // Nazwa klasy: co najmniej 8 znaków (skróty jednostek i symbole, np. `VarCf`, nie są klasą).
  {
    nazwa: 'nazwa klasy CamelCase',
    test: trafieniaWyrazenia(/\b(?=[A-Za-z0-9]{8,}\b)[A-Z][a-z]+(?:[A-Z][a-z0-9]+)+\b/),
  },
  { nazwa: 'angielski kod statusu', test: trafieniaSlow(KODY_ANGIELSKIE) },
  { nazwa: 'kod wyliczenia jako komórka', test: trafieniaKomorek(KODY_WYLICZEN_SAMODZIELNE) },
  { nazwa: 'wartość pusta języka programowania', test: trafieniaSlow(['None', 'null', 'undefined', 'NaN']) },
  { nazwa: 'zapis JSON', test: trafieniaWyrazenia(/[[{]\s*"[A-Za-z_]+"\s*:|\["[^"\]]*"(?:,"[^"\]]*")*\]/) },
  { nazwa: 'odsyłacz procesu', test: trafieniaFraz(ODSYLACZE_PROCESU) },
  { nazwa: 'słowo bez polskich znaków', test: trafieniaSlow(SLOWA_BEZ_POLSKICH_ZNAKOW) },
];

interface Naruszenie {
  readonly etap: string;
  readonly wzorzec: string;
  readonly trafienie: string;
  readonly linia: string;
}

function naruszeniaTekstu(etap: string, tekst: string): Naruszenie[] {
  const wynik: Naruszenie[] = [];
  tekst
    .split('\n')
    .map((linia) => linia.trim())
    .filter((linia) => linia !== '')
    .forEach((liniaPelna) => {
      // B-01: tekst uwagi profilu NC RfG wycięty — reszta linii mierzona bez wyjątków.
      const bezUwag = UWAGI_PROFILI_B01.reduce(
        (tekstLinii, uwaga) => tekstLinii.split(uwaga).join(' '),
        liniaPelna.replace(/\s+/g, ' '),
      );
      // B-01: literały silnika prób NC RfG wycięte — reszta linii mierzona bez wyjątków.
      // Adres internetowy (źródło wykazu, dokument normy) jest odsyłaczem do dokumentu dla
      // projektanta, nie kodem — jego ścieżka nie jest mierzona wzorcami kluczy.
      const linia = LITERALY_SILNIKA_B01.reduce(
        (tekstLinii, wzorzec) => tekstLinii.replace(wzorzec, ' '),
        bezUwag,
      ).replace(/https?:\/\/\S+/g, ' ');
      WZORCE.forEach((wzorzec) => {
        wzorzec.test(linia).forEach((trafienie) => {
          wynik.push({ etap, wzorzec: wzorzec.nazwa, trafienie, linia: liniaPelna.slice(0, 240) });
        });
      });
    });
  return wynik;
}

// ---------------------------------------------------------------------------
// Pomiar tekstu pierwszego planu
// ---------------------------------------------------------------------------

/**
 * Widoczny tekst korzenia sceny + etykiety list wyboru, bez „Informacji audytowych".
 * Na czas pomiaru arkusz neutralizuje `text-transform` — `innerText` oddaje tekst po
 * transformacji CSS, a nagłówek zapisany wersalikami („GOTOWOŚĆ POTWIERDZONA") jest
 * stylem, nie kodem wyliczenia w treści.
 */
async function tekstPierwszegoPlanu(page: Page): Promise<string> {
  return page.evaluate(() => {
    const korzen = document.querySelector('[data-testid="creator-harness-root"]') as HTMLElement | null;
    if (korzen === null) throw new Error('korzeń sceny zniknął — ekran się wywrócił (wyjątek renderu)');
    const arkusz = document.createElement('style');
    arkusz.textContent = '[data-testid="creator-harness-root"] * { text-transform: none !important; }';
    document.head.appendChild(arkusz);
    const ukryte: [HTMLElement, string][] = [];
    korzen.querySelectorAll<HTMLElement>('.mvd-audyt-lista, .katex-mathml').forEach((el) => {
      ukryte.push([el, el.style.display]);
      el.style.display = 'none';
    });
    const widoczny = korzen.innerText;
    ukryte.forEach(([el, styl]) => {
      el.style.display = styl;
    });
    arkusz.remove();
    const opcje = Array.from(korzen.querySelectorAll('select option'))
      .filter((opcja) => !opcja.closest('.mvd-audyt'))
      .map((opcja) => (opcja.textContent ?? '').trim())
      .filter((tekst) => tekst !== '');
    return `${widoczny}\n${opcje.join('\n')}`;
  });
}

/**
 * Rozwija wszystko, co projektant może rozwinąć jednym klikiem: przełączniki
 * `aria-expanded=false` i przyciski „Pokaż …" (ślad, wywód, wyjaśnienie, przebieg).
 * NIGDY: „Informacje audytowe" (jedyne miejsce metadanych — z definicji poza
 * pierwszym planem) ani akcje zmieniające stan pracy (nawigacja, poprawa modelu).
 * Każdy przycisk klikany co najwyżej raz (przełącznik „Pokaż/Ukryj" nie wraca).
 */
async function rozwinWszystko(page: Page): Promise<void> {
  const klikniete = new Set<string>();
  for (let runda = 0; runda < 10; runda += 1) {
    const kandydaci = await page.evaluate((juz: string[]) => {
      const korzen = document.querySelector('[data-testid="creator-harness-root"]') as HTMLElement | null;
      if (korzen === null) throw new Error('korzeń sceny zniknął — ekran się wywrócił (wyjątek renderu)');
      const wynik: { klucz: string; znacznik: string }[] = [];
      const liczniki = new Map<string, number>();
      korzen.querySelectorAll<HTMLButtonElement>('button').forEach((przycisk, indeks) => {
        if (przycisk.closest('.mvd-audyt')) return;
        if (przycisk.disabled) return;
        const obszar = przycisk.getBoundingClientRect();
        if (obszar.width === 0 && obszar.height === 0) return;
        const tekst = (przycisk.textContent ?? '').trim();
        const rozwijany = przycisk.getAttribute('aria-expanded') === 'false';
        const pokaz = /^Pokaż\b/.test(tekst) && !/^Pokaż (na schemacie|w schemacie|element)/.test(tekst);
        if (!rozwijany && !pokaz) return;
        const podstawa = `${przycisk.getAttribute('data-testid') ?? ''}|${tekst}`;
        const n = (liczniki.get(podstawa) ?? 0) + 1;
        liczniki.set(podstawa, n);
        const klucz = `${podstawa}|${n}`;
        if (juz.includes(klucz)) return;
        const znacznik = `k${indeks}`;
        przycisk.setAttribute('data-straznik-jezyka', znacznik);
        wynik.push({ klucz, znacznik });
      });
      return wynik;
    }, [...klikniete]);
    if (kandydaci.length === 0) return;
    for (const { klucz, znacznik } of kandydaci) {
      klikniete.add(klucz);
      const przycisk = page.locator(`[data-straznik-jezyka="${znacznik}"]`).first();
      if ((await przycisk.count()) === 0) continue;
      if (!(await przycisk.isVisible()) || !(await przycisk.isEnabled())) continue;
      await przycisk.click();
    }
    await page.waitForTimeout(200);
  }
}

interface Pomiar {
  readonly teksty: { etap: string; tekst: string }[];
}

async function zbierz(page: Page, pomiar: Pomiar, etap: string): Promise<void> {
  await rozwinWszystko(page);
  pomiar.teksty.push({ etap, tekst: await tekstPierwszegoPlanu(page) });
}

/**
 * Każdy wybieralny wiersz tabel wyników (klik = szczegół wiersza) — po kliknięciu
 * rozwinięcie i pomiar. Wiersze nie są próbką „pierwszego z brzegu": iloczyn
 * cech „rodzaj wiersza × stan danych" siedzi właśnie w różnych wierszach.
 */
async function przejdzWiersze(page: Page, pomiar: Pomiar, etap: string, limit = 30): Promise<void> {
  const wiersze = page.locator('[data-testid="creator-harness-root"] tr[data-testid="mvd-wyn-wiersz"][tabindex="0"]');
  const liczba = Math.min(await wiersze.count(), limit);
  for (let i = 0; i < liczba; i += 1) {
    const wiersz = wiersze.nth(i);
    if (!(await wiersz.isVisible())) continue;
    await wiersz.click();
    await zbierz(page, pomiar, `${etap} · wiersz ${i + 1}`);
  }
}

async function otworz(page: Page, scena: string, dodatek = ''): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${HARNESS_URL}?creator=${scena}&theme=light${dodatek}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await expect(page.locator('[data-testid="creator-harness-root"]').first()).toHaveAttribute(
    'data-status',
    'ready',
    { timeout: 60000 },
  );
}

// ---------------------------------------------------------------------------
// Prowadzenie scen ścieżką projektanta
// ---------------------------------------------------------------------------

type Prowadzenie = (page: Page, pomiar: Pomiar) => Promise<void>;

/** Scena, która po wczytaniu pokazuje wynik — rozwinięcie + wiersze. */
const zwykla: Prowadzenie = async (page, pomiar) => {
  await page.waitForTimeout(500);
  await zbierz(page, pomiar, 'po wczytaniu');
  await przejdzWiersze(page, pomiar, 'tabela');
};

const ODBIOR_WYNIK = fixtura<{
  wiersze: { element_ref: string; wielkosc: string; wartosc_pomiar: number; zacisk: 'od' | 'do' | null }[];
}>('odbior_zgodnosc_scena_wynik');
const ESTYMACJA_WYNIK = fixtura<{
  measurements: { meas_type: string; bus_ref: string; bus_j_ref: string | null; value: number; sigma: number }[];
}>('estymacja_scena_wynik');
const POROWNANIE_PF = fixtura<{ run_a_id: string; run_b_id: string }>('porownanie_scena_wynik_pf');
const POROWNANIE_ZAB = fixtura<{ run_a_id: string; run_b_id: string }>('porownanie_scena_wynik_zabezpieczen');
const OZE_MIGAWKA = fixtura<{ generators: { ref_id: string }[] }>('oze_scena_migawka');
const FRT_SEKWENCJA = fixtura<{ kontekst_sily_sieci: { bus_ref: string } }>('frt_scena_sekwencja');
const FRT_PRZEBIEG = fixtura<{ id: string }>('frt_scena_przebieg_zwarciowy');
const MACIERZ_MIGAWKA = fixtura<{ generators: { ref_id: string; gen_type: string }[] }>('macierz_scena_migawka');
const WNIOSEK_ZADANIE = fixtura<{ bus_ref: string }>('wniosek_scena_magazyn_zadanie');
const WNIOSEK_BRAKI_ZADANIE = fixtura<{ bus_ref: string }>('wniosek_scena_macierz_zadanie');
const KOORDYNACJA_MIEJSCA = fixtura<{ urzadzenia_sceny: { lokalizacja: string; zacisk: 'od' | 'do' }[] }>(
  'koordynacja_scena_miejsca',
);
const AKADEMICKIE_BIEGI = fixtura<{ biegi: Record<string, unknown> }>('akademickie_scena_biegi');
const KATALOG_V126 = fixtura<{ items: { kod: string; prezentowany: boolean }[] }>('katalog_analiz_v126');
const GOTOWOSC_V126 = fixtura<{ analizy: { kod: string; gotowosc: string }[] }>('gotowosc_v126_scena_akademickie');

const SCENY: Record<string, Prowadzenie> = {
  rozplyw: async (page, pomiar) => {
    await zwykla(page, pomiar);
    const podzakladki = page.locator('[data-testid^="mvd-rozplyw-podzakladka-"]');
    const liczba = await podzakladki.count();
    for (let i = 0; i < liczba; i += 1) {
      await podzakladki.nth(i).click();
      await zbierz(page, pomiar, `podzakładka ${i + 1}`);
      await przejdzWiersze(page, pomiar, `podzakładka ${i + 1}`);
    }
  },
  zwarcia: zwykla,
  'zwarcia-rozplyw': zwykla,
  porownanie: async (page, pomiar) => {
    await page.getByTestId('mvd-por-select-a').selectOption(POROWNANIE_PF.run_a_id);
    await page.getByTestId('mvd-por-select-b').selectOption(POROWNANIE_PF.run_b_id);
    await page.getByTestId('mvd-por-przycisk').click();
    await expect(page.getByTestId('mvd-por-wynik')).toBeVisible();
    await zbierz(page, pomiar, 'porównanie rozpływów');
    await przejdzWiersze(page, pomiar, 'porównanie rozpływów');
    await page.getByTestId('mvd-por-tryb-zabezpieczenia').click();
    await page.getByTestId('mvd-porzab-select-a').selectOption(POROWNANIE_ZAB.run_a_id);
    await page.getByTestId('mvd-porzab-select-b').selectOption(POROWNANIE_ZAB.run_b_id);
    await page.getByTestId('mvd-porzab-przycisk').click();
    await expect(page.getByTestId('mvd-porzab-wynik')).toBeVisible();
    await zbierz(page, pomiar, 'porównanie zabezpieczeń');
    const zakladki = page.locator('[data-testid^="mvd-porzab-tab-"]');
    const liczba = await zakladki.count();
    for (let i = 0; i < liczba; i += 1) {
      await zakladki.nth(i).click();
      await zbierz(page, pomiar, `porównanie zabezpieczeń · zakładka ${i + 1}`);
    }
  },
  kompensacja: zwykla,
  'kompensacja-wynik': async (page, pomiar) => {
    await page.getByTestId('mvd-komp-wezel').selectOption('bus_sn_b');
    await page.getByTestId('mvd-komp-oblicz').click();
    await expect(page.getByTestId('mvd-komp-wynik')).toBeVisible();
    await zwykla(page, pomiar);
  },
  lom: zwykla,
  frt: async (page, pomiar) => {
    await page.getByTestId('mvd-frt-modul').selectOption(OZE_MIGAWKA.generators[0].ref_id);
    await page.getByTestId('mvd-frt-operator').selectOption('pse');
    await page.getByTestId('mvd-frt-oblicz').click();
    await expect(page.getByTestId('mvd-frt-wynik')).toBeVisible();
    await zwykla(page, pomiar);
    await page.getByTestId('mvd-frt-sekw-dodaj').click();
    await page.getByTestId('mvd-frt-sekw-glebokosc-1').fill('0.02');
    await page.getByTestId('mvd-frt-sekw-czas-1').fill('0.5');
    await page.getByTestId('mvd-frt-sekw-run').selectOption(FRT_PRZEBIEG.id);
    await page.getByTestId('mvd-frt-sekw-bus').selectOption(FRT_SEKWENCJA.kontekst_sily_sieci.bus_ref);
    await page.getByTestId('mvd-frt-sekw-oblicz').click();
    await expect(page.getByTestId('mvd-frt-sekw-ocena')).toBeVisible();
    await zbierz(page, pomiar, 'sekwencja zapadów');
  },
  oltc: async (page, pomiar) => {
    await page.getByTestId('mvd-oltc-uruchom').click();
    await expect(page.getByTestId('mvd-oltc-wynik-sweep')).toBeVisible();
    await zwykla(page, pomiar);
  },
  macierz: async (page, pomiar) => {
    const pv = MACIERZ_MIGAWKA.generators.find((g) => g.gen_type === 'pv_inverter')!.ref_id;
    await expect(page.getByTestId(`mvd-oze-zgodnosc-przekrojowa-modul-${pv}`)).toBeVisible();
    await zbierz(page, pomiar, 'zgodność przekrojowa');
    await page.getByTestId(`mvd-oze-modul-${pv}`).click();
    await page.getByTestId('mvd-oze-param-p_recovery_time_s').fill('1.8');
    await page.getByTestId('mvd-oze-przeprowadz').click();
    await expect(page.getByTestId('mvd-oze-komorka-wynik').first()).toBeVisible({ timeout: 30000 });
    await zbierz(page, pomiar, 'macierz po biegu');
    const komorki = page.getByTestId('mvd-oze-komorka-wynik');
    const liczba = Math.min(await komorki.count(), 40);
    for (let i = 0; i < liczba; i += 1) {
      await komorki.nth(i).click();
      await zbierz(page, pomiar, `komórka ${i + 1}`);
    }
    const certyfikat = page.getByTestId('mvd-oze-certyfikat-przycisk');
    await expect(certyfikat).toBeEnabled({ timeout: 15000 });
    await certyfikat.click();
    await expect(page.getByTestId('mvd-oze-cert-braki')).toBeVisible({ timeout: 15000 });
    await zbierz(page, pomiar, 'certyfikat — czego brakuje');
  },
  certyfikat: async (page, pomiar) => {
    const przycisk = page.getByTestId('mvd-oze-certyfikat-przycisk');
    await expect(przycisk).toBeEnabled({ timeout: 15000 });
    await przycisk.click();
    await expect(page.getByTestId('mvd-oze-cert-widok')).toBeVisible({ timeout: 15000 });
    await zbierz(page, pomiar, 'certyfikat');
  },
  wniosek: async (page, pomiar) => {
    await page.getByTestId('mvd-wniosek-wezel').selectOption(WNIOSEK_ZADANIE.bus_ref);
    const generuj = page.getByTestId('mvd-wniosek-generuj');
    await expect(generuj).toBeEnabled({ timeout: 15000 });
    await generuj.click();
    await expect(page.getByTestId('mvd-wniosek-wynik')).toBeVisible({ timeout: 15000 });
    await zbierz(page, pomiar, 'wniosek');
  },
  'wniosek-braki': async (page, pomiar) => {
    await page.getByTestId('mvd-wniosek-wezel').selectOption(WNIOSEK_BRAKI_ZADANIE.bus_ref);
    const generuj = page.getByTestId('mvd-wniosek-generuj');
    await expect(generuj).toBeEnabled({ timeout: 15000 });
    await generuj.click();
    await expect(page.getByTestId('mvd-wniosek-braki')).toBeVisible({ timeout: 15000 });
    await zbierz(page, pomiar, 'wniosek — czego brakuje');
  },
  'pulpit-oze': zwykla,
  koordynacja: async (page, pomiar) => {
    await expect(page.getByTestId('protection-coordination-page')).toBeVisible();
    await zbierz(page, pomiar, 'przed konfiguracją');
    for (const { lokalizacja, zacisk } of KOORDYNACJA_MIEJSCA.urzadzenia_sceny) {
      await page.getByTitle('Zastosuj szablon').click();
      await page.locator('div.fixed.inset-0').getByText('Przekaźnik 50/51 (typowy)').click();
      await expect(page.getByTestId('protection-settings-editor')).toBeVisible();
      await page.getByTestId('device-location-select').selectOption(lokalizacja);
      await page.getByTestId(`device-terminal-${zacisk}`).click();
      await page.getByRole('button', { name: 'Zapisz konfigurację' }).click();
    }
    await page.getByTestId('run-analysis-button').click();
    await page.getByTestId('tab-selectivity').click();
    await expect(page.getByTestId('selectivity-table')).toBeVisible({ timeout: 15000 });
    const zakladki = page.locator('[data-testid^="tab-"]');
    const liczba = await zakladki.count();
    for (let i = 0; i < liczba; i += 1) {
      await zakladki.nth(i).click();
      await zbierz(page, pomiar, `koordynacja · zakładka ${i + 1}`);
    }
  },
  'wyniki-skladowe': zwykla,
  'wyniki-zbieznosc': zwykla,
  'wyniki-stan-fazowy': zwykla,
  'sila-sieci': zwykla,
  'odbior-zgodnosc': async (page, pomiar) => {
    for (let i = 0; i < ODBIOR_WYNIK.wiersze.length; i += 1) {
      const wiersz = ODBIOR_WYNIK.wiersze[i];
      if (i > 0) await page.getByTestId('mvd-odbior-dodaj').click();
      // Najpierw wielkość: lista elementów modelu zależy od wielkości (szyny / gałęzie).
      await page.getByTestId(`mvd-odbior-wielkosc-${i}`).selectOption(wiersz.wielkosc);
      await wybierzElementOdbioru(page, i, wiersz.element_ref);
      await page.getByTestId(`mvd-odbior-wartosc-${i}`).fill(String(wiersz.wartosc_pomiar).replace('.', ','));
      if (wiersz.zacisk) await page.getByTestId(`mvd-odbior-zacisk-${i}-${wiersz.zacisk}`).click();
    }
    await page.getByTestId('mvd-odbior-tol-napiecie').fill('5');
    await page.getByTestId('mvd-odbior-tol-moc').fill('10');
    await page.getByTestId('mvd-odbior-oblicz').click();
    await expect(page.getByTestId('mvd-odbior-wynik')).toBeVisible();
    await zwykla(page, pomiar);
  },
  estymacja: async (page, pomiar) => {
    await expect(page.getByTestId('mvd-est-wymagania')).toBeVisible();
    for (let i = 0; i < ESTYMACJA_WYNIK.measurements.length; i += 1) {
      const p = ESTYMACJA_WYNIK.measurements[i];
      if (i > 0) await page.getByTestId('mvd-est-dodaj').click();
      await page.getByTestId(`mvd-est-typ-${i}`).selectOption(p.meas_type);
      await page.getByTestId(`mvd-est-wezel-${i}`).selectOption(p.bus_ref);
      await page.getByTestId(`mvd-est-wartosc-${i}`).fill(String(p.value).replace('.', ','));
      await page.getByTestId(`mvd-est-sigma-${i}`).fill(String(p.sigma).replace('.', ','));
      if (p.bus_j_ref) await page.getByTestId(`mvd-est-wezelj-${i}`).selectOption(p.bus_j_ref);
    }
    await page.getByTestId('mvd-est-estymuj').click();
    await expect(page.getByTestId('mvd-est-wynik')).toBeVisible();
    await zwykla(page, pomiar);
  },
  ssci: async (page, pomiar) => {
    await page.getByTestId('mvd-ssci-uruchom').click();
    await expect(page.getByTestId('mvd-ssci-wynik')).toBeVisible();
    await zwykla(page, pomiar);
  },
  migotanie: zwykla,
  arcflash: async (page, pomiar) => {
    await page.getByTestId('mvd-jakosc-af-odleglosc').fill('455');
    await page.getByTestId('mvd-jakosc-af-odstep').fill('152');
    await page.getByTestId('mvd-jakosc-af-czas').fill('0.2');
    await page.getByTestId('mvd-jakosc-af-licz').click();
    await expect(page.getByTestId('mvd-jakosc-arcflash')).toBeVisible();
    await zwykla(page, pomiar);
  },
  cieplna: zwykla,
  walidacja: zwykla,
  uwaga: zwykla,
  ocena: zwykla,
  'ocena-przekroczenia': zwykla,
  diagnoza: zwykla,
  'wyniki-warsztat': zwykla,
  akademickie: zwykla,
};

/**
 * Sceny harnessu POZA klasą (nie są ekranami wyników ani oceny) — lista jawna z
 * powodem, żeby nowa scena wyników nie mogła zniknąć z pomiaru po cichu: test
 * „kompletność listy scen" niżej sprawdza, że KAŻDA scena harnessu jest albo
 * mierzona, albo tu nazwana.
 */
const SCENY_POZA_KLASA: Readonly<Record<string, string>> = {
  'wyniki-stabilnosc':
    'ekran toru T1 stabilności dynamicznej kasowany i zastępowany nowym modułem dynamiki '
    + '(dyrektywa właściciela: rdzeń dynamiki w produkcji) — nowy moduł wchodzi '
    + 'do pomiaru razem ze swoją sceną',
  pulpit: 'pulpit projektu (etap E1) — przegląd pracy, nie ekran wyniku',
  swiezosc: 'pasek aktywnego przypadku powłoki — znacznik świeżości, nie ekran wyniku',
  dokumentacja: 'centrum dokumentów projektu — wytwarzanie dokumentów, nie ekran wyniku',
  'przeglad-wiarygodnosci': 'przegląd wiarygodności pozycji katalogu — biblioteka typów',
  wiazania: 'ekran wiązań katalogowych wytwórcy (edycja modelu), nie wynik',
  szablony: 'przeglądarka szablonów stacji (budowa modelu)',
  stacja: 'kreator stacji SN/nN (budowa modelu)',
  pole: 'kreator pola SN (budowa modelu)',
  oze: 'kreator źródła OZE (budowa modelu)',
  transformator: 'kreator transformatora (budowa modelu)',
  kompensator: 'kreator kompensatora (budowa modelu)',
  magistrala: 'kreator magistrali (budowa modelu)',
  odbior: 'kreator odbioru nN (budowa modelu)',
  zrodlo: 'kreator źródła zasilania (budowa modelu)',
  'zrodlo-dyspozycyjne': 'kreator źródła dyspozycyjnego (budowa modelu)',
  odgalezienie: 'kreator odgałęzienia (budowa modelu)',
  'slup-odgalezny': 'kreator słupa odgałęźnego (budowa modelu)',
  zksn: 'kreator ZKSN (budowa modelu)',
  przekaznik: 'kreator przekaźnika (budowa modelu)',
  pomiar: 'kreator pomiaru (budowa modelu)',
  'pole-nn': 'kreator pola nN (budowa modelu)',
  'przypisanie-katalogu': 'kreator przypisania katalogu (budowa modelu)',
  'edycja-parametrow': 'kreator edycji parametrów (budowa modelu)',
};

/** Rodzaje analiz specjalistycznych prezentowane projektantowi (katalog z backendu). */
const RODZAJE_V126 = KATALOG_V126.items.filter((karta) => karta.prezentowany).map((karta) => karta.kod);

/** Wypełnia formularz parametrów rodzaju wartościami sceny (te, dla których backend policzył gotowość). */
async function wypelnijParametry(page: Page, rodzaj: string): Promise<boolean> {
  const parametry = parametrySceny()[rodzaj] as Record<string, unknown> | undefined;
  if (parametry === undefined) return false;
  if (rodzaj === 'earthing_safety') {
    await wypelnijUziomIPotwierdz(page);
    return true;
  }
  const formularz = page.getByTestId('mvd-akad-parametry');
  for (const [klucz, wartosc] of Object.entries(parametry)) {
    if (klucz === 'relay_methods') {
      for (const metoda of wartosc as string[]) await page.getByTestId(`mvd-akad-metoda-${metoda}`).check();
    } else if (klucz === 'motors') {
      const silniki = wartosc as Record<string, unknown>[];
      for (let i = 0; i < silniki.length; i += 1) {
        await page.getByTestId('mvd-akad-dodaj-wiersz').click();
        const wiersz = page.getByTestId(`mvd-akad-lista-wiersz-${i}`);
        for (const [pole, v] of Object.entries(silniki[i])) {
          const kontrolka = wiersz.getByTestId(`mvd-akad-pole-${pole}`);
          if ((await kontrolka.evaluate((el) => el.tagName)) === 'SELECT') await kontrolka.selectOption(String(v));
          else await kontrolka.fill(String(v));
        }
      }
    } else if (klucz === 'customer_counts') {
      const liczby = Object.entries(wartosc as Record<string, number>);
      for (let i = 0; i < liczby.length; i += 1) {
        await page.getByTestId('mvd-akad-dodaj-wiersz').click();
        const wiersz = page.getByTestId(`mvd-akad-lista-wiersz-${i}`);
        await wiersz.getByTestId('mvd-akad-pole-bus_ref').selectOption(liczby[i][0]);
        await wiersz.getByTestId('mvd-akad-pole-liczba').fill(String(liczby[i][1]));
      }
    } else if (klucz === 'harmonic_spectra') {
      let i = 0;
      for (const [generator, widmo] of Object.entries(wartosc as Record<string, Record<string, number>>)) {
        for (const [rzad, procent] of Object.entries(widmo)) {
          await page.getByTestId('mvd-akad-dodaj-wiersz').click();
          const wiersz = page.getByTestId(`mvd-akad-lista-wiersz-${i}`);
          await wiersz.getByTestId('mvd-akad-pole-generator_ref').fill(generator);
          await wiersz.getByTestId('mvd-akad-pole-rzad').fill(rzad);
          await wiersz.getByTestId('mvd-akad-pole-procent').fill(String(procent));
          i += 1;
        }
      }
    } else {
      const kontrolka = formularz.getByTestId(`mvd-akad-pole-${klucz}`);
      if ((await kontrolka.evaluate((el) => el.tagName)) === 'SELECT') await kontrolka.selectOption(String(wartosc));
      else await kontrolka.fill(String(wartosc));
    }
  }
  await expect(page.getByTestId('mvd-akad-gotowosc')).toHaveAttribute('data-gotowosc', 'POTWIERDZONA', {
    timeout: 30000,
  });
  return true;
}

/**
 * Niezłapane wyjątki strony (`pageerror`) — wywrotka renderu jest defektem ekranu tak
 * samo jak identyfikator na pierwszym planie (scena „cieplna": klik w wiersz gałęzi
 * wywracał cały ekran, a spec zbierający sam tekst widział tylko pusty korzeń).
 */
function zbierajWyjatki(page: Page): string[] {
  const wyjatki: string[] = [];
  page.on('pageerror', (blad) => wyjatki.push(blad.message));
  return wyjatki;
}

function wynikScen(scena: string, pomiar: Pomiar): Naruszenie[] {
  const naruszenia = pomiar.teksty.flatMap(({ etap, tekst }) => naruszeniaTekstu(etap, tekst));
  if (KATALOG_ZRZUTU) {
    fs.mkdirSync(KATALOG_ZRZUTU, { recursive: true });
    fs.writeFileSync(
      path.join(KATALOG_ZRZUTU, `${scena}.json`),
      JSON.stringify({ scena, teksty: pomiar.teksty, naruszenia }, null, 1),
    );
  }
  // Jeden wpis na (wzorzec, trafienie) — meldunek czytelny, bez setek powtórzeń.
  const unikalne = new Map<string, Naruszenie>();
  naruszenia.forEach((n) => {
    const klucz = `${n.wzorzec}|${n.trafienie}`;
    if (!unikalne.has(klucz)) unikalne.set(klucz, n);
  });
  return [...unikalne.values()];
}

test.describe('Język inżyniera na pierwszym planie ekranów wyników i oceny', () => {
  test('wyjątek B-01 silnika NC RfG wycina wyłącznie literały silnika — ten sam klucz poza literałem nadal mierzony', () => {
    expect(LITERALY_SILNIKA_B01.length).toBeGreaterThan(0);
    expect(naruszeniaTekstu('próba', 'Dana przyjęta: napięcie przyłączenia modułu (voltage_kv) = 0,8 kV')).toEqual([]);
    const poza = naruszeniaTekstu('próba', 'Brak pola voltage_kv w karcie źródła.');
    expect(poza.map((n) => n.trafienie)).toContain('voltage_kv');
  });

  test('wyjątek B-01 wycina wyłącznie tekst uwag profili NC RfG — reszta linii nadal mierzona', () => {
    expect(UWAGI_PROFILI_B01.length).toBeGreaterThan(0);
    const uwaga = UWAGI_PROFILI_B01.find((u) => u.includes('plan AB'));
    expect(uwaga, 'uwaga profilu z odsyłaczem procesu (stan profili na dziś)').toBeDefined();
    expect(naruszeniaTekstu('próba', `Podstawa: ${uwaga}.`)).toEqual([]);
    const poza = naruszeniaTekstu('próba', `Podstawa: ${uwaga}; zmiana wg plan AB §3.`);
    expect(poza.map((n) => n.trafienie)).toContain('plan AB');
  });

  test('kompletność: każda scena harnessu jest mierzona albo nazwana poza klasą', () => {
    const zrodlo = fs.readFileSync(path.resolve(_dirname, '../src/creator-harness-main.tsx'), 'utf-8');
    const sceny = new Set(
      [...zrodlo.matchAll(/creator === '([a-z0-9-]+)'/g)].map((trafienie) => trafienie[1]),
    );
    const nieobjete = [...sceny].filter((scena) => !(scena in SCENY) && !(scena in SCENY_POZA_KLASA));
    expect(nieobjete, 'scena harnessu bez pomiaru i bez powodu wyłączenia').toEqual([]);
  });

  for (const [scena, prowadz] of Object.entries(SCENY)) {
    test(`scena „${scena}"`, async ({ page }) => {
      test.setTimeout(240_000);
      const wyjatki = zbierajWyjatki(page);
      const pomiar: Pomiar = { teksty: [] };
      await otworz(page, scena);
      await prowadz(page, pomiar);
      const naruszenia = wynikScen(scena, pomiar);
      expect(wyjatki, `wyjątki strony w scenie „${scena}"`).toEqual([]);
      expect(naruszenia, `naruszenia języka inżyniera w scenie „${scena}"`).toEqual([]);
    });
  }

  for (const rodzaj of RODZAJE_V126) {
    test(`analiza specjalistyczna „${rodzaj}"`, async ({ page }) => {
      test.setTimeout(240_000);
      const wyjatki = zbierajWyjatki(page);
      const pomiar: Pomiar = { teksty: [] };
      await otworz(page, 'akademickie', `&rodzaj=${rodzaj}`);
      await expect(page.getByTestId('mvd-akad-uruchomienie')).toBeVisible({ timeout: 60000 });
      await zbierz(page, pomiar, 'widok analizy');
      const gotowoscBazowa = GOTOWOSC_V126.analizy.find((a) => a.kod === rodzaj)?.gotowosc;
      const wypelniony = gotowoscBazowa === 'POTWIERDZONA' ? false : await wypelnijParametry(page, rodzaj);
      if (wypelniony) await zbierz(page, pomiar, 'formularz wypełniony');
      const maBieg = rodzaj in AKADEMICKIE_BIEGI.biegi;
      if (maBieg && (gotowoscBazowa === 'POTWIERDZONA' || wypelniony)) {
        const uruchom = page.getByTestId('mvd-akad-uruchom');
        await expect(uruchom).toBeEnabled({ timeout: 30000 });
        await uruchom.click();
        await expect(page.getByTestId('mvd-akad-wyniki')).toBeVisible({ timeout: 60000 });
        await zbierz(page, pomiar, 'wynik analizy');
      }
      const naruszenia = wynikScen(`akademickie-${rodzaj}`, pomiar);
      expect(wyjatki, `wyjątki strony w analizie „${rodzaj}"`).toEqual([]);
      expect(naruszenia, `naruszenia języka inżyniera w analizie „${rodzaj}"`).toEqual([]);
    });
  }
});
