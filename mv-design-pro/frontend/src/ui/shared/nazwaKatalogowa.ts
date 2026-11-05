/**
 * Wyświetlanie nazwy pozycji katalogowej (aparat, rodzina rozdzielnicy, szablon pola,
 * transformator, przekładnik, bezpiecznik, przełącznik zaczepów) i opisów zbudowanych
 * z liczby i jednostki: spacja między liczbą a jednostką staje się spacją twardą (U+00A0),
 * więc przy łamaniu wiersza „630” i „A” nie rozchodzą się do dwóch linii (kontrakt prezentacji
 * §10 — liczba z jednostką jest jedną całością).
 *
 * Funkcja NIE zmienia nazwy poza tą spacją: kropka dziesiętna w nazwie handlowej producenta
 * („ABB VD4 17.5 kV”) zostaje — to nazwa wyrobu, nie liczba zapisana przez system.
 */

/** Jednostki rozpoznawane po liczbie (dłuższe przed krótszymi o tym samym początku). */
const JEDNOSTKI = [
  'MVA', 'kVA', 'VA', 'Mvar', 'kvar', 'var',
  'MWh', 'kWh', 'MW', 'kW', 'W',
  'kV', 'V', 'kA', 'A', 'mA',
  'mΩ', 'Ω', 'mm²', 'mm2', 'km', 'mm', 'm',
  'Hz', 'ms', 's', '%', '°C',
] as const;

const WZORZEC = new RegExp(
  `(\\d)[ \\t]+(?=(?:${JEDNOSTKI.map((j) => j.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}\\d]))`,
  'gu',
);

export const TWARDA_SPACJA = '\u00a0';

/** Tekst z liczbami i jednostkami: spacja między liczbą a jednostką → spacja twarda. */
export function bezLamaniaLiczbyIJednostki(tekst: string): string {
  return tekst.replace(WZORZEC, `$1${TWARDA_SPACJA}`);
}

/** Nazwa pozycji katalogu do wyświetlenia: liczba i jednostka połączone spacją twardą. */
export function nazwaKatalogowa(nazwa: string): string {
  return bezLamaniaLiczbyIJednostki(nazwa);
}
