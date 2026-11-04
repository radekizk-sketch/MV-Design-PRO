/**
 * TABLICZKA PRZEKŁADNIKA PRĄDOWEGO NA SCHEMACIE (karta UX-04/POLE-LINIOWE-WZORZEC, decyzja
 * architekta §11.7 pkt 6, 2026-10-30) — zapis przekładni i klas rdzeni z danych modelu
 * (`BayPrimaryDevice.rdzenie`, tabliczka PN-EN 61869-2). CZYSTE formatowanie zapisu tabliczki:
 * zero fizyki, zero zaokrągleń, zero domysłu — brak rdzeni w rekordzie = brak tabliczki.
 *
 * Zapis wg rysunku ENEA Zeszyt 1 (Z.10 s.89: „200-400/5", „kl. 5P20"; Z.11 s.90:
 * „200-400/5/5/5"): rdzenie o wspólnym zapisie strony pierwotnej dają jedną przekładnię
 * z prądami wtórnymi kolejnych rdzeni („200-400/5/5/5 A"); rdzenie o różnej stronie pierwotnej
 * — przekładnie kolejnych rdzeni po przecinku. Klasy kolejnych rdzeni rozdziela „/" (kolejność
 * rdzeni z modelu), rdzeń pomiarowy z FS niesie go po klasie („0,2S FS5").
 *
 * Przekładnik napięciowy (`BayPrimaryDevice.uzwojenia`, tabliczka PN-EN 61869-3) — zapis
 * rysunku Z.11.1 s.91 („SN/√3 / 0,1/√3 / 0,1/√3 / 0,1/√3"): uzwojenia o wspólnej stronie
 * pierwotnej dają jedną przekładnię z napięciami wtórnymi kolejnych uzwojeń; klasy kolejnych
 * uzwojeń po „ / ". Przekładnik Ferrantiego (`BayPrimaryDevice.przekladnia`) — zapis z rekordu
 * bez zmian („1/100").
 */
import type {
  PrzeznaczenieRdzenia,
  RdzenPrzekladnikaPradowego,
  UzwojeniePrzekladnikaNapieciowego,
} from '../../../../types/przekladniki';

/** Liczba w zapisie polskim (przecinek dziesiętny) — bez zaokrąglania. */
function liczbaPl(wartosc: number): string {
  return String(wartosc).replace('.', ',');
}

/** Rozbicie zapisu przekładni rdzenia na stronę pierwotną i wtórną (ostatni „/"). `null`, gdy
 *  zapis nie ma „/" (nie da się go złożyć z innymi bez domysłu). */
function stronyPrzekladni(przekladnia: string): { readonly pierwotna: string; readonly wtorna: string } | null {
  const i = przekladnia.lastIndexOf('/');
  if (i <= 0 || i === przekladnia.length - 1) return null;
  return { pierwotna: przekladnia.slice(0, i).trim(), wtorna: przekladnia.slice(i + 1).trim() };
}

/** Przekładnia tabliczki (np. „200-400/5 A", „200-400/5/5/5 A"); `null` bez rdzeni. */
export function tekstPrzekladniRdzeni(rdzenie: readonly RdzenPrzekladnikaPradowego[] | null | undefined): string | null {
  if (!rdzenie || rdzenie.length === 0) return null;
  const strony = rdzenie.map((r) => stronyPrzekladni(r.przekladnia.trim()));
  const pierwsza = strony[0];
  const wspolnaPierwotna = pierwsza !== null && strony.every((s) => s !== null && s.pierwotna === pierwsza.pierwotna);
  if (wspolnaPierwotna) return `${pierwsza.pierwotna}/${strony.map((s) => s!.wtorna).join('/')} A`;
  return `${rdzenie.map((r) => r.przekladnia.trim()).join(', ')} A`;
}

/** Klasy dokładności rdzeni w kolejności z modelu (np. „5P20", „0,2S FS5 / 0,2 FS5 / 5P20");
 *  `null` bez rdzeni. */
export function tekstKlasRdzeni(rdzenie: readonly RdzenPrzekladnikaPradowego[] | null | undefined): string | null {
  if (!rdzenie || rdzenie.length === 0) return null;
  return rdzenie.map((r) => (r.fs != null ? `${r.klasa} FS${liczbaPl(r.fs)}` : r.klasa)).join(' / ');
}

/** Przeznaczenia rdzenia zabezpieczeniowego i pomiarowego — lustro
 *  `przekladniki.PRZEZNACZENIA_ZABEZPIECZENIOWE` / `PRZEZNACZENIA_POMIAROWE` (parytet przypina
 *  `__tests__/tabliczkaPrzekladnika.test.ts`). Przeznaczenie spoza obu zbiorów (regulacja
 *  napięcia) nie rozstrzyga wariantu przekładnika. */
export const PRZEZNACZENIA_ZABEZPIECZENIOWE: ReadonlySet<PrzeznaczenieRdzenia> = new Set<PrzeznaczenieRdzenia>(['ZABEZPIECZENIA', 'ROZNICOWE']);
export const PRZEZNACZENIA_POMIAROWE: ReadonlySet<PrzeznaczenieRdzenia> = new Set<PrzeznaczenieRdzenia>(['ROZLICZENIE', 'POMIAR', 'JAKOSC_ENERGII']);

/** Przeznaczenie przekładnika z przeznaczeń jego rdzeni (prądowy) albo uzwojeń (napięciowy —
 *  ten sam słownik przeznaczeń): same zabezpieczeniowe —
 *  `protection`, same pomiarowe — `metering`, oba rodzaje — `combined`; `undefined` bez rdzeni
 *  albo bez przeznaczeń z tych dwóch zbiorów (uczciwy brak). */
export function przeznaczeniePrzekladnika(
  rdzenie: readonly { readonly przeznaczenie?: readonly PrzeznaczenieRdzenia[] | null }[] | null | undefined,
): 'protection' | 'metering' | 'combined' | undefined {
  const wszystkie = (rdzenie ?? []).flatMap((r) => r.przeznaczenie ?? []);
  const zabezpieczeniowe = wszystkie.some((p) => PRZEZNACZENIA_ZABEZPIECZENIOWE.has(p));
  const pomiarowe = wszystkie.some((p) => PRZEZNACZENIA_POMIAROWE.has(p));
  if (zabezpieczeniowe && pomiarowe) return 'combined';
  if (zabezpieczeniowe) return 'protection';
  return pomiarowe ? 'metering' : undefined;
}

/** Zapis przekładni rdzenia — lustro `przekladniki._ZAPIS_PRZEKLADNI_CT` (backend). */
const ZAPIS_PRZEKLADNI_CT = /^\s*(\d+(?:[.,]\d+)?(?:\s*-\s*\d+(?:[.,]\d+)?)*)\s*\/\s*(\d+(?:[.,]\d+)?)\s*(?:A)?\s*$/;

function liczbaZapisu(tekst: string): number {
  return Number(tekst.trim().replace(',', '.'));
}

/** Zaczepy pierwotne [A] zapisu przekładni JEDNEGO rdzenia, rosnąco — lustro
 *  `przekladniki.zaczepy_pierwotne_a` („200-400/5" → [200, 400]; zapis nierozpoznany → []).
 *  Parytet z backendem przypina wspólna tabela przypadków
 *  `__tests__/zaczepy_przekladnika_przypadki.json` (test frontu i test backendu). */
export function zaczepyPierwotneA(przekladnia: string): readonly number[] {
  const m = ZAPIS_PRZEKLADNI_CT.exec(przekladnia);
  if (!m) return [];
  const zaczepy = m[1].split('-').map(liczbaZapisu);
  if (zaczepy.some((z) => z <= 0) || zaczepy.some((z, i) => i > 0 && zaczepy[i - 1] >= z)) return [];
  if (liczbaZapisu(m[2]) <= 0) return [];
  return zaczepy;
}

/** Zaczepy PRZEKŁADNIKA — wspólne dla wszystkich rdzeni, rosnąco (lustro
 *  `przekladniki.zaczepy_przekladnika`); [] bez rdzeni albo bez wspólnego zaczepu. */
export function zaczepyPrzekladnika(przekladnie: readonly string[]): readonly number[] {
  let wspolne: Set<number> | null = null;
  for (const p of przekladnie) {
    const zaczepy = zaczepyPierwotneA(p);
    if (zaczepy.length === 0) return [];
    wspolne = wspolne === null ? new Set(zaczepy) : new Set(zaczepy.filter((z) => wspolne!.has(z)));
  }
  return wspolne ? [...wspolne].sort((a, b) => a - b) : [];
}

/** Opis wybranego zaczepu na schemacie („zaczep 400 A"); `null` bez zaczepu w rekordzie. */
export function tekstZaczepu(zaczepA: number | null | undefined): string | null {
  return zaczepA != null ? `zaczep ${liczbaPl(zaczepA)} A` : null;
}

/** Separator stron przekładni uzwojenia przekładnika napięciowego w zapisie tabliczki
 *  („15/√3 / 0,1/√3") — ukośnik ze spacjami; ukośnik bez spacji należy do zapisu napięcia
 *  fazowego („/√3"). */
const SEPARATOR_STRON_VT = ' / ';

function stronyPrzekladniUzwojenia(przekladnia: string): { readonly pierwotna: string; readonly wtorna: string } | null {
  const i = przekladnia.indexOf(SEPARATOR_STRON_VT);
  if (i <= 0) return null;
  const wtorna = przekladnia.slice(i + SEPARATOR_STRON_VT.length).trim();
  return wtorna === '' ? null : { pierwotna: przekladnia.slice(0, i).trim(), wtorna };
}

/** Przekładnia tabliczki przekładnika napięciowego (np. „SN/√3 / 0,1/√3 / 0,1/√3 / 0,1/3");
 *  uzwojenia o różnej stronie pierwotnej albo zapisie bez separatora stron — przekładnie
 *  kolejnych uzwojeń po przecinku. `null` bez uzwojeń. */
export function tekstPrzekladniUzwojen(
  uzwojenia: readonly UzwojeniePrzekladnikaNapieciowego[] | null | undefined,
): string | null {
  if (!uzwojenia || uzwojenia.length === 0) return null;
  const strony = uzwojenia.map((u) => stronyPrzekladniUzwojenia(u.przekladnia.trim()));
  const pierwsza = strony[0];
  const wspolnaPierwotna = pierwsza !== null && strony.every((s) => s !== null && s.pierwotna === pierwsza.pierwotna);
  if (wspolnaPierwotna) return [pierwsza.pierwotna, ...strony.map((s) => s!.wtorna)].join(SEPARATOR_STRON_VT);
  return uzwojenia.map((u) => u.przekladnia.trim()).join(', ');
}

/** Klasy dokładności uzwojeń w kolejności z modelu (np. „0,2 / 0,2 / 0,5/3P"); `null` bez uzwojeń. */
export function tekstKlasUzwojen(
  uzwojenia: readonly UzwojeniePrzekladnikaNapieciowego[] | null | undefined,
): string | null {
  if (!uzwojenia || uzwojenia.length === 0) return null;
  return uzwojenia.map((u) => u.klasa.trim()).join(SEPARATOR_STRON_VT);
}
