/**
 * Czujnik ładunku operacji domenowych w testach frontendu — lustro czujnika dyspozytora
 * backendu (`tests/conftest.py::_ladunek_operacji_w_kontrakcie`).
 *
 * Kreatory wysyłają operacje przez `executeDomainOperation(caseId, operacja, ładunek)`
 * (magazyn) albo `executeDomainOp(caseId, operacja, ładunek)` (API); testy podmieniają je
 * makietą `vi.fn`/`vi.spyOn`, więc ładunek nigdy nie dociera do backendu i klucz, którego
 * operacja nie czyta (kontrolka-widmo), przechodził bez śladu. Czujnik obejmuje KAŻDĄ
 * makietę: po teście sprawdza jej wywołania o kształcie `(napis-nie-operacja, operacja,
 * obiekt)` kontraktem kluczy (`kontraktLadunkuOperacji.ts`) i oblewa test z kluczem obcym.
 * Wywołanie `(operacja, kontekst)` — formularz (`openOperationForm`) — nie jest ładunkiem.
 *
 * Test, który CELOWO wysyła klucz spoza kontraktu (np. sprawdza odmowę), woła
 * `dopuscLadunekSpozaKontraktu()` — jawnie, z komentarzem dlaczego.
 */
import { afterEach, vi } from 'vitest';

import { czyOperacjaDomenowa, kluczeSpozaKontraktu } from './kontraktLadunkuOperacji';

interface Makieta {
  mock: { calls: unknown[][] };
}

/** Słabe odwołanie — `WeakRef` środowiska testów (Node); `lib` projektu jest zamrożony na ES2020. */
interface SlabeOdwolanie<T> {
  deref(): T | undefined;
}
const SlabeOdwolanieKonstruktor = (
  globalThis as unknown as { WeakRef: new <T extends object>(cel: T) => SlabeOdwolanie<T> }
).WeakRef;

// Pamięć czujnika NIE MOŻE przedłużać życia makiet: makieta trzyma argumenty wszystkich
// wywołań (całe modele, sceny SLD), a plik testów tworzy ich setki. Lista silnych odwołań
// trzymana do końca pliku podniosła szczyt pamięci procesu `sldCanvasV3.test.tsx` ponad
// limit (OOM). Makiety bieżącego testu są trzymane SILNIE do sprawdzenia po teście (żeby
// zbieracz nie zabrał makiety niewidocznej już z drzewa komponentów przed sprawdzeniem),
// potem SŁABO — makieta modułu (`const wyslij = vi.fn()` nad testami) żyje odwołaniem
// modułu i jest sprawdzana w każdym kolejnym teście, makieta lokalna testu znika.
let makietyTestu: Makieta[] = [];
let makietyWczesniejsze: SlabeOdwolanie<Makieta>[] = [];
const sprawdzone = new WeakMap<Makieta, number>();
let dopuszczone = false;

/** Bieżący test celowo wysyła klucz spoza kontraktu — czujnik go nie oblewa. */
export function dopuscLadunekSpozaKontraktu(): void {
  dopuszczone = true;
}

function czyObiekt(wartosc: unknown): wartosc is Record<string, unknown> {
  return typeof wartosc === 'object' && wartosc !== null && !Array.isArray(wartosc);
}

/** Ładunek wywołania `(zakres, operacja, ładunek, …)` albo `null` (to nie wysyłka operacji). */
export function ladunekWywolania(
  argumenty: readonly unknown[],
): { operacja: string; ladunek: Record<string, unknown> } | null {
  const [zakres, operacja, ladunek] = argumenty;
  if (typeof zakres !== 'string' || czyOperacjaDomenowa(zakres)) return null;
  if (typeof operacja !== 'string' || !czyOperacjaDomenowa(operacja)) return null;
  if (!czyObiekt(ladunek)) return null;
  return { operacja, ladunek };
}

/** Liczba makiet trzymanych silnie (tylko makiety bieżącego testu — przed sprawdzeniem). */
export function liczbaMakietTrzymanychSilnie(): number {
  return makietyTestu.length;
}

/** Naruszenia w wywołaniach makiet od ostatniego sprawdzenia. */
export function naruszeniaMakiet(): string[] {
  const wynik: string[] = [];
  const zyjace: Makieta[] = [];
  for (const odwolanie of makietyWczesniejsze) {
    const makieta = odwolanie.deref();
    if (makieta) zyjace.push(makieta);
  }
  for (const makieta of [...zyjace, ...makietyTestu]) {
    const wywolania = makieta.mock.calls;
    for (let i = sprawdzone.get(makieta) ?? 0; i < wywolania.length; i += 1) {
      const wysylka = ladunekWywolania(wywolania[i]);
      if (!wysylka) continue;
      const obce = kluczeSpozaKontraktu(wysylka.operacja, wysylka.ladunek);
      if (obce.length) wynik.push(`${wysylka.operacja}: ${obce.join(', ')}`);
    }
    sprawdzone.set(makieta, wywolania.length);
  }
  makietyWczesniejsze = [...zyjace, ...makietyTestu].map(
    (makieta) => new SlabeOdwolanieKonstruktor(makieta),
  );
  makietyTestu = [];
  return wynik;
}

function zarejestruj<T extends Makieta>(makieta: T): T {
  makietyTestu.push(makieta);
  return makieta;
}

/** Oblewa bieżący test, gdy makieta wysłała klucz spoza kontraktu (bez dopuszczenia). */
export function sprawdzPoTescie(): void {
  const naruszenia = naruszeniaMakiet();
  const dopuszczoneTeraz = dopuszczone;
  dopuszczone = false;
  if (naruszenia.length && !dopuszczoneTeraz) {
    throw new Error(
      'Ładunek operacji domenowej niesie klucze spoza kontraktu (operacja ich nie czyta — ' +
        `kontrolka-widmo): ${naruszenia.join(' | ')}. Kontrakt: ` +
        'harness-fixtures/generated/kontrakt_ladunkow_operacji.json; test celowo wysyłający ' +
        'taki klucz woła dopuscLadunekSpozaKontraktu().',
    );
  }
}

/** Hak `afterEach` czujnika — asynchroniczny (powód przy `zainstalujCzujnikLadunkow`). */
export async function hakLadunkowPoTescie(): Promise<void> {
  sprawdzPoTescie();
}

export function zainstalujCzujnikLadunkow(): void {
  const fn = vi.fn.bind(vi);
  const spyOn = vi.spyOn.bind(vi);
  Object.assign(vi, {
    fn: ((...argumenty: Parameters<typeof vi.fn>) => zarejestruj(fn(...argumenty))) as typeof vi.fn,
    spyOn: ((...argumenty: Parameters<typeof vi.spyOn>) =>
      zarejestruj(spyOn(...argumenty))) as typeof vi.spyOn,
  });
  // Hak asynchroniczny — ten sam powód co w `czujnikSurowychWzorow.ts`: synchroniczny wyjątek
  // przerwałby wywołanie pozostałych haków `afterEach` (w tym `cleanup` Testing Library).
  afterEach(hakLadunkowPoTescie);
}
