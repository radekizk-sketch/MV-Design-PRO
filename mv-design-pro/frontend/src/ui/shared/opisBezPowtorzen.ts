/**
 * Opis obiektu bez powtórzeń — JEDNA reguła dla każdej komórki i nagłówka, które stawiają obok
 * siebie nazwę obiektu i jego rodzaj albo rolę (karta techniczna K6: tabela pól stacji, tabela
 * aparatów pola, nagłówek karty aparatu; konfigurator stacji: tabela pól).
 *
 * Nazwy pól i aparatów w modelu bywają pochodną rodzaju albo obiektu nadrzędnego: pole
 * „Pole liniowe wejściowe 1” ma rolę „Pole liniowe wejściowe”, aparat nowego pola GPZ nazywa się
 * „Aparat Pole liniowe GPZ 1.1” (nazwa pola poprzedzona słowem „Aparat”). Postawienie obok siebie
 * nazwy i rodzaju mówiło wtedy dwa razy to samo („Pole liniowe wejściowe 1 · Pole liniowe
 * wejściowe”, „Wyłącznik · Aparat Pole liniowe GPZ 1.1” pod nagłówkiem tego pola).
 *
 * Porównanie bez wielkości liter (`pl`) i na granicy słowa: „Pole liniowe” nie zaczyna nazwy
 * „Pole liniowe1”, a „Wyłącznik” nie zaczyna „Wyłącznikowy …”.
 */

const GRANICA = '[\\s·,;:()/-]';

/** Czy nazwa zaczyna się opisem (rodzajem albo rolą) — na granicy słowa, bez wielkości liter. */
export function nazwaZaczynaSieOpisem(nazwa: string | null | undefined, opis: string | null | undefined): boolean {
  const n = (nazwa ?? '').trim().toLocaleLowerCase('pl');
  const o = (opis ?? '').trim().toLocaleLowerCase('pl');
  if (!n || !o || !n.startsWith(o)) return false;
  return n.length === o.length || new RegExp(GRANICA, 'u').test(n.charAt(o.length));
}

/** Słowa, które same nic nie mówią o aparacie, gdy zostają po zdjęciu nazwy pola
 *  („Aparat” z nazwy „Aparat Pole liniowe GPZ 1.1”). */
const SLOWA_BEZ_TRESCI = new Set(['aparat', 'aparat pola', 'łącznik']);

const SEPARATORY_KRAWEDZI = /^[\s·,;:/-]+|[\s·,;:/-]+$/gu;

/** Tekst bez każdego wystąpienia frazy na granicy słowa (bez wielkości liter). */
function bezFrazy(tekst: string, fraza: string): string {
  const f = fraza.trim();
  if (!f) return tekst;
  const doslownie = f.replace(/[.*+?^$()|[\]\\{}]/gu, '\\$&');
  const wzor = new RegExp(`(^|${GRANICA})${doslownie}(?=$|${GRANICA})`, 'giu');
  return tekst.replace(wzor, '$1').replace(/\s{2,}/gu, ' ').replace(SEPARATORY_KRAWEDZI, '').trim();
}

/**
 * Opis obiektu: rodzaj i nazwa, każda informacja raz.
 *  - z nazwy zdejmowane są nazwy obiektów nadrzędnych (`nadrzedne` — np. pole, w którym aparat
 *    stoi, gdy karta albo nagłówek już je nazywa);
 *  - reszta bez treści (pusta albo samo „Aparat”) → sam rodzaj;
 *  - reszta zaczynająca się rodzajem → sama reszta („Wyłącznik pola SN 3”);
 *  - inaczej → „rodzaj · reszta” („Wyłącznik · Q5”).
 */
export function opisBezPowtorzen(argumenty: {
  readonly rodzaj: string;
  readonly nazwa: string | null | undefined;
  readonly nadrzedne?: readonly (string | null | undefined)[];
}): string {
  const { rodzaj } = argumenty;
  let reszta = (argumenty.nazwa ?? '').trim();
  for (const n of argumenty.nadrzedne ?? []) if (n) reszta = bezFrazy(reszta, n);
  if (!reszta || SLOWA_BEZ_TRESCI.has(reszta.toLocaleLowerCase('pl'))) return rodzaj;
  if (nazwaZaczynaSieOpisem(reszta, rodzaj)) return reszta;
  return `${rodzaj} · ${reszta}`;
}
