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
 */
import type { PrzeznaczenieRdzenia, RdzenPrzekladnikaPradowego } from '../../../../types/przekladniki';

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

/** Przeznaczenie przekładnika z przeznaczeń jego rdzeni: same zabezpieczeniowe —
 *  `protection`, same pomiarowe — `metering`, oba rodzaje — `combined`; `undefined` bez rdzeni
 *  albo bez przeznaczeń z tych dwóch zbiorów (uczciwy brak). */
export function przeznaczeniePrzekladnika(
  rdzenie: readonly RdzenPrzekladnikaPradowego[] | null | undefined,
): 'protection' | 'metering' | 'combined' | undefined {
  const wszystkie = (rdzenie ?? []).flatMap((r) => r.przeznaczenie ?? []);
  const zabezpieczeniowe = wszystkie.some((p) => PRZEZNACZENIA_ZABEZPIECZENIOWE.has(p));
  const pomiarowe = wszystkie.some((p) => PRZEZNACZENIA_POMIAROWE.has(p));
  if (zabezpieczeniowe && pomiarowe) return 'combined';
  if (zabezpieczeniowe) return 'protection';
  return pomiarowe ? 'metering' : undefined;
}
