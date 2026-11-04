/**
 * PRZEKŁADNIA PRZEKŁADNIKA NA SCHEMACIE (karta UX-04/POLE-LINIOWE-WZORZEC, §11.7 pkt 6; odbiór
 * B-02 właściciela 2026-11-04 pkt 6 i 8) — CZYSTE formatowanie zapisu tabliczki z danych modelu
 * (`BayPrimaryDevice.rdzenie`, PN-EN 61869-2; `BayPrimaryDevice.uzwojenia`, PN-EN 61869-3): zero
 * fizyki, zero zaokrągleń, zero domysłu — brak rdzeni/uzwojeń w rekordzie = brak opisu.
 *
 * Na schemacie wyłącznie KRÓTKA przekładnia (LOD2): CT „200–400/5”, VT liczbowo
 * „15/√3 / 0,1/√3 kV”. Pełne dane tabliczki — kolejne rdzenie i uzwojenia, klasy dokładności,
 * współczynniki FS, wybrany zaczep — są w inspektorze pola (`ui/field/EdytorWyposazeniaPola.tsx`),
 * nie powtarzane na schemacie (uwaga właściciela: nadmiar opisów poszerzał pole).
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

/** Oznaczenie napięcia sieci w zapisie przekładni szablonu pola (`bay_templates`: „SN/√3 / 0,1/√3”
 *  — szablon obsługuje rozdzielnice 15 kV i 20 kV, „SN” = napięcie sieci). */
const NAPIECIE_SIECI_SZABLONU = 'SN';

/**
 * KRÓTKA przekładnia przekładnika napięciowego NA SCHEMACIE (uwaga właściciela 2026-11-04, odbiór
 * B-02 pkt 6: „VT liczbowo, np. 15/√3 / 0,1/√3 kV — dziś SN/√3 … z wielokropkiem”): jedna
 * przekładnia — strona pierwotna i wtórna PIERWSZEGO uzwojenia (pozostałe uzwojenia, klasy i moce
 * — w inspektorze pola), z oznaczeniem „SN” zastąpionym napięciem znamionowym szyny pola
 * (`Bus.voltage_kv` — dana modelu, nie domysł; szablon definiuje „SN” jako napięcie sieci).
 * Szyna bez napięcia — „SN” zostaje (brak danej widoczny wprost). Zapis bez separatora stron —
 * bez zmian. `null` bez uzwojeń.
 */
export function krotkaPrzekladniaUzwojen(
  uzwojenia: readonly UzwojeniePrzekladnikaNapieciowego[] | null | undefined,
  napiecieSzynyKv: number | null | undefined,
): string | null {
  if (!uzwojenia || uzwojenia.length === 0) return null;
  const zapis = uzwojenia[0].przekladnia.trim();
  const strony = stronyPrzekladniUzwojenia(zapis);
  if (!strony) return zapis;
  const pierwotna =
    napiecieSzynyKv != null && Number.isFinite(napiecieSzynyKv) && napiecieSzynyKv > 0
      ? strony.pierwotna.replace(new RegExp(`^${NAPIECIE_SIECI_SZABLONU}(?=/|$)`), liczbaPl(napiecieSzynyKv))
      : strony.pierwotna;
  return `${pierwotna}${SEPARATOR_STRON_VT}${strony.wtorna} kV`;
}

/** KRÓTKA przekładnia przekładnika prądowego NA SCHEMACIE (odbiór B-02 pkt 6: „200–400/5”):
 *  zapis przekładni PIERWSZEGO rdzenia (rdzenie przekładnika dzielą zaczepy strony pierwotnej —
 *  `zaczepyPrzekladnika`), półpauza w zakresie zaczepów strony pierwotnej; pozostałe rdzenie,
 *  klasy, zaczep i moce — w inspektorze pola. `null` bez rdzeni. */
export function krotkaPrzekladniaRdzeni(rdzenie: readonly RdzenPrzekladnikaPradowego[] | null | undefined): string | null {
  if (!rdzenie || rdzenie.length === 0) return null;
  return rdzenie[0].przekladnia.trim().replace(/\s*-\s*/g, '–').replace(/\s*\/\s*/g, '/').replace(/\s*A$/, '');
}
