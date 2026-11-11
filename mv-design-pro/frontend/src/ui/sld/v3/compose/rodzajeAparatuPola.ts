/**
 * Karta UX-04/POLE-LINIOWE-WZORZEC — LUSTRO zbiorów rodzajów aparatu pola i portów pola
 * z backendu (`backend/src/network_model/catalog/rodzaje_aparatury.py`). Schemat NIE ma
 * własnej definicji „co jest łącznikiem" ani „który port leży w torze": czyta te zbiory, a
 * ich równość z backendem przypina `backend/tests/ci/test_parytet_rodzajow_aparatu_pola.py`
 * (parsowanie tego pliku i porównanie ze zbiorami Pythona — zmiana po jednej stronie
 * czerwieni test). Zero fizyki: wyłącznie słownik rodzajów i nazw portów.
 */
import type { BayPrimaryDeviceKind } from '../../../../types/enm';

/** Rodzaje aparatu pola, które są ŁĄCZNIKAMI (położenie łączeniowe); ich symbole należą do
 *  `SYMBOLE_LACZNIKOW_Z_POLOZENIEM` (kafel stanu, test parytetu `kafelStanu.test.tsx`).
 *  Lustro `RODZAJE_LACZNIKOW_POLA`. */
export const RODZAJE_LACZNIKOW_POLA: ReadonlySet<BayPrimaryDeviceKind> = new Set<BayPrimaryDeviceKind>([
  'CB',
  'LOAD_SWITCH',
  'DS',
  'ES',
  'FUSE',
  'THREE_POSITION_SWITCH',
]);

/** Uziemnik — jedyny łącznik pola poza torem głównym. Lustro `RODZAJ_UZIEMNIKA`. */
export const RODZAJ_UZIEMNIKA: BayPrimaryDeviceKind = 'ES';

/** Łączniki TORU GŁÓWNEGO (łączniki pola bez uziemnika). Lustro `RODZAJE_LACZNIKOW_TORU`. */
export const RODZAJE_LACZNIKOW_TORU: ReadonlySet<BayPrimaryDeviceKind> = new Set<BayPrimaryDeviceKind>(
  [...RODZAJE_LACZNIKOW_POLA].filter((rodzaj) => rodzaj !== RODZAJ_UZIEMNIKA),
);

/** Położenia, w których łącznik NIE przewodzi w torze głównym. Lustro `STANY_OTWARTE_W_TORZE`. */
export const STANY_OTWARTE_W_TORZE: readonly string[] = ['otwarty', 'otwarty_naped_rozbrojony', 'uziemiony'];

/** Nazwy portów aparatu pola. Lustro `PORT_WEJSCIA`/`PORT_WYJSCIA`/`PORT_PRZYLACZA`/`PORT_OBWODU`
 *  i zacisków pierwotnych przekładnika międzyfazowego `PORT_FAZY_A`/`PORT_FAZY_B` (PN-EN 61869-3). */
export const PORT_WEJSCIA = 'we';
export const PORT_WYJSCIA = 'wy';
export const PORT_PRZYLACZA = 'przylacze';
export const PORT_OBWODU = 'obwod';
export const PORT_FAZY_A = 'A';
export const PORT_FAZY_B = 'B';

/** Aparaty pola baterii kondensatorów (karta UX-04/POLE-BKR-MODEL; ENEA Operator, Stacje 110 kV,
 *  Zeszyt 1, §17 s. 32 i Zał. 16): przekładnik prądowy niezrównoważenia obejmuje połączenie
 *  między punktami gwiazd baterii (port `obwod`), przekładnik napięciowy międzyfazowy ma dwa
 *  zaciski pierwotne A i B. Lustro `RODZAJ_PRZEKLADNIKA_NIEZROWNOWAZENIA`,
 *  `RODZAJ_PRZEKLADNIKA_NAPIECIOWEGO_MIEDZYFAZOWEGO`, `RODZAJE_APARATOW_POLA_BKR`. */
export const RODZAJ_PRZEKLADNIKA_NIEZROWNOWAZENIA = 'UNBALANCE_CT' satisfies BayPrimaryDeviceKind;
export const RODZAJ_PRZEKLADNIKA_NAPIECIOWEGO_MIEDZYFAZOWEGO = 'PHASE_TO_PHASE_VT' satisfies BayPrimaryDeviceKind;
export const RODZAJE_APARATOW_POLA_BKR: ReadonlySet<BayPrimaryDeviceKind> = new Set<BayPrimaryDeviceKind>([
  RODZAJ_PRZEKLADNIKA_NIEZROWNOWAZENIA,
  RODZAJ_PRZEKLADNIKA_NAPIECIOWEGO_MIEDZYFAZOWEGO,
]);
/** Liczba przekładników międzyfazowych rozładowujących baterię (Zeszyt 1 §17 s. 32). Lustro
 *  `LICZBA_PRZEKLADNIKOW_ROZLADOWCZYCH_BATERII`. */
export const LICZBA_PRZEKLADNIKOW_ROZLADOWCZYCH_BATERII = 2;

/** Porty aparatu pola wg rodzaju — lustro `PORTY_APARATU_POLA` (rodzaj bez wpisu nie ma
 *  portów pola: wytwórca, falownik, bateria). */
export const PORTY_APARATU_POLA: Readonly<Partial<Record<BayPrimaryDeviceKind, readonly string[]>>> = {
  CB: [PORT_WEJSCIA, PORT_WYJSCIA],
  LOAD_SWITCH: [PORT_WEJSCIA, PORT_WYJSCIA],
  DS: [PORT_WEJSCIA, PORT_WYJSCIA],
  FUSE: [PORT_WEJSCIA, PORT_WYJSCIA],
  THREE_POSITION_SWITCH: [PORT_WEJSCIA, PORT_WYJSCIA],
  CT: [PORT_WEJSCIA, PORT_WYJSCIA],
  CABLE_HEAD: [PORT_WEJSCIA, PORT_WYJSCIA],
  TRANSFORMER_DEVICE: [PORT_WEJSCIA, PORT_WYJSCIA],
  ES: [PORT_PRZYLACZA],
  VT: [PORT_PRZYLACZA],
  SURGE_ARRESTER: [PORT_PRZYLACZA],
  VOLTAGE_INDICATOR: [PORT_PRZYLACZA],
  CORE_BALANCE_CT: [PORT_OBWODU],
  UNBALANCE_CT: [PORT_OBWODU],
  PHASE_TO_PHASE_VT: [PORT_FAZY_A, PORT_FAZY_B],
};

/** Czy rodzaj aparatu leży W TORZE pola: komplet portów to dokładnie (`we`, `wy`) — ten sam
 *  predykat co backend (`PORTY_APARATU_POLA.get(rodzaj) == (PORT_WEJSCIA, PORT_WYJSCIA)`). Liczba
 *  portów NIE rozstrzyga: przekładnik napięciowy międzyfazowy ma dwa zaciski (A, B), a jest
 *  odgałęzieniem przyłączonym obydwoma do jednego węzła. */
export function czyRodzajWTorze(kind: BayPrimaryDeviceKind): boolean {
  const komplet = PORTY_APARATU_POLA[kind] ?? [];
  return komplet.length === 2 && komplet[0] === PORT_WEJSCIA && komplet[1] === PORT_WYJSCIA;
}

/** Węzeł szyny sekcji — pierwszy węzeł toru pola. Lustro `WEZEL_SZYNY`. */
export const WEZEL_SZYNY = 'szyna';

/** Węzły końca TORU GŁÓWNEGO pola (odejście kablowe, zacisk transformatora pola, odpływ) —
 *  tor główny to droga aparatów dwuportowych od szyny do jednego z nich. Lustro
 *  `rodzaje_aparatury.WEZLY_KONCA_TORU` (test parytetu `test_parytet_rodzajow_aparatu_pola.py`). */
export const WEZLY_KONCA_TORU: ReadonlySet<string> = new Set<string>(['kabel', 'transformator', 'odplyw']);

