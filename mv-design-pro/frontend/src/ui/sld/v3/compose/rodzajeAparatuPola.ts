/**
 * Karta UX-04/POLE-LINIOWE-WZORZEC — LUSTRO zbiorów rodzajów aparatu pola i portów pola
 * z backendu (`backend/src/network_model/catalog/rodzaje_aparatury.py`). Schemat NIE ma
 * własnej definicji „co jest łącznikiem" ani „który port leży w torze": czyta te zbiory, a
 * ich równość z backendem przypina `backend/tests/ci/test_parytet_rodzajow_aparatu_pola.py`
 * (parsowanie tego pliku i porównanie ze zbiorami Pythona — zmiana po jednej stronie
 * czerwieni test). Zero fizyki: wyłącznie słownik rodzajów i nazw portów.
 */
import type { BayPrimaryDeviceKind } from '../../../../types/enm';

/** Rodzaje aparatu pola, które są ŁĄCZNIKAMI (położenie łączeniowe) — zbiór, który schemat
 *  oznacza ramką stanu SCADA. Lustro `RODZAJE_LACZNIKOW_POLA`. */
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

/** Nazwy portów aparatu pola. Lustro `PORT_WEJSCIA`/`PORT_WYJSCIA`/`PORT_PRZYLACZA`/`PORT_OBWODU`. */
export const PORT_WEJSCIA = 'we';
export const PORT_WYJSCIA = 'wy';
export const PORT_PRZYLACZA = 'przylacze';
export const PORT_OBWODU = 'obwod';

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
};

/** Węzeł szyny sekcji — pierwszy węzeł toru pola. Lustro `WEZEL_SZYNY`. */
export const WEZEL_SZYNY = 'szyna';

/** Węzły końca TORU GŁÓWNEGO pola (odejście kablowe, zacisk transformatora pola, odpływ) —
 *  tor główny to droga aparatów dwuportowych od szyny do jednego z nich. Lustro
 *  `rodzaje_aparatury.WEZLY_KONCA_TORU` (test parytetu `test_parytet_rodzajow_aparatu_pola.py`). */
export const WEZLY_KONCA_TORU: ReadonlySet<string> = new Set<string>(['kabel', 'transformator', 'odplyw']);

/** Łącznik pola (ramka stanu SCADA) — jeden predykat dla kompozycji i sond sceny. */
export function czyLacznikPola(kind: BayPrimaryDeviceKind | undefined): boolean {
  return kind !== undefined && RODZAJE_LACZNIKOW_POLA.has(kind);
}
