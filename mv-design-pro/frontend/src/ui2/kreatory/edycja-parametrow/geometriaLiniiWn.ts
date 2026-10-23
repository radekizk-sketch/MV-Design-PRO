/**
 * Dane linii napowietrznej 110 kV w kreatorze edycji parametrów: przewód z katalogu
 * PRZEWOD_LINII_WN i geometria słupa (dana projektu).
 *
 * PO CO. Parametry R′, X′, B′ i Z′0 linii 110 kV liczy solver backendu z geometrii słupa
 * i danych przewodu (PN-EN 50182). Geometria jest daną projektu; składowa, której projekt nie
 * podaje, dostaje wartość roboczą rejestru backendu (jakość ESTIMATED, kompletność dowodu
 * NIEPELNY) — zasada nr 4: brak geometrii nie blokuje obliczeń.
 *
 * Ten moduł NIE liczy fizyki i NIE powiela reguł dziedzinowych: zamienia formularz na
 * kształt `GeometriaSlupaLinii` (pary liczb, liczba całkowita przewodów w wiązce) i odwrotnie.
 * Spójność geometrii (wiązka bez odstępu, przewód odgromowy spoza katalogu, przewód pod
 * ziemią) rozstrzyga walidator backendu — jedna brama dla zapisu i podglądu.
 */

import type {
  Branch,
  GeometriaSlupaLinii,
  OverheadLine,
  PolozeniePrzewoduLinii,
} from '../../../types/enm';
import type { OverheadConductorType } from '../../../ui/catalog/types';

/** Przestrzeń katalogu przewodów linii 110 kV (backend `PRZEWOD_LINII_WN`). */
export const NAMESPACE_PRZEWOD_LINII_WN = 'PRZEWOD_LINII_WN';

/** Liczba faz linii trójfazowej — tyle położeń przewodów fazowych podaje projekt. */
export const LICZBA_FAZ = 3;

/** Najmniejsza liczba miejsc na przewody odgromowe w formularzu (typowy słup 110 kV: 1–2). */
export const MIEJSCA_ODGROMOWYCH = 2;

/**
 * Sposób podania przewodów odgromowych:
 * - `robocze` — projekt nie podaje (`odgromowe: null`): wartość robocza rejestru backendu;
 * - `brak` — jawna deklaracja linii BEZ przewodu odgromowego (`odgromowe: []`);
 * - `podane` — położenia z projektu.
 */
export type TrybOdgromowych = 'robocze' | 'brak' | 'podane';

export interface PolozenieFormularza {
  readonly x: string;
  readonly y: string;
}

export interface FormularzLiniiWn {
  readonly przewodId: string;
  readonly fazy: readonly PolozenieFormularza[];
  readonly liczbaWWiazce: string;
  readonly odstepWiazki: string;
  readonly trybOdgromowych: TrybOdgromowych;
  readonly odgromowe: readonly PolozenieFormularza[];
  readonly przewodOdgromowyRef: string;
  readonly rezystywnosc: string;
}

/** Pole formularza, którego treść nie daje się zamienić na kształt geometrii. */
export type PoleGeometrii =
  | 'fazy'
  | 'liczbaWWiazce'
  | 'odstepWiazki'
  | 'odgromowe'
  | 'rezystywnosc';

export type WynikGeometrii =
  | { readonly rodzaj: 'geometria'; readonly geometria: GeometriaSlupaLinii }
  | { readonly rodzaj: 'blad'; readonly pole: PoleGeometrii };

function tekstLiczby(wartosc: number | null | undefined): string {
  return typeof wartosc === 'number' && Number.isFinite(wartosc) ? String(wartosc) : '';
}

function polozeniaFormularza(
  polozenia: readonly PolozeniePrzewoduLinii[] | null | undefined,
  minimum: number,
): PolozenieFormularza[] {
  const wynik = (polozenia ?? []).map((p) => ({ x: tekstLiczby(p.x_m), y: tekstLiczby(p.y_m) }));
  while (wynik.length < minimum) wynik.push({ x: '', y: '' });
  return wynik;
}

/** Linia napowietrzna z migawki (inne gałęzie nie niosą geometrii słupa). */
export function jestLiniaNapowietrzna(
  galaz: Branch | null | undefined,
): galaz is OverheadLine {
  return galaz?.type === 'line_overhead';
}

/** Formularz ze stanu linii w modelu: puste pole = składowa niepodana przez projekt. */
export function formularzZLinii(galaz: Branch | null | undefined): FormularzLiniiWn {
  const linia = jestLiniaNapowietrzna(galaz) ? galaz : null;
  const geometria = linia?.geometria_slupa ?? null;
  const przewodId =
    linia?.catalog_namespace === NAMESPACE_PRZEWOD_LINII_WN ? (linia.catalog_ref ?? '') : '';
  const odgromowe = geometria?.odgromowe;
  const trybOdgromowych: TrybOdgromowych =
    odgromowe === null || odgromowe === undefined
      ? 'robocze'
      : odgromowe.length === 0
        ? 'brak'
        : 'podane';
  return {
    przewodId,
    fazy: polozeniaFormularza(geometria?.fazy, LICZBA_FAZ),
    liczbaWWiazce: tekstLiczby(geometria?.liczba_w_wiazce ?? null),
    odstepWiazki: tekstLiczby(geometria?.odstep_wiazki_m ?? null),
    trybOdgromowych,
    odgromowe: polozeniaFormularza(odgromowe, MIEJSCA_ODGROMOWYCH),
    przewodOdgromowyRef: geometria?.przewod_odgromowy_ref ?? '',
    rezystywnosc: tekstLiczby(geometria?.rezystywnosc_gruntu_ohm_m ?? null),
  };
}

/** Liczba z pola (przecinek albo kropka dziesiętna); `''` = pole puste; `null` = nie liczba. */
function liczbaPola(tekst: string): number | '' | null {
  const t = tekst.trim().replace(',', '.');
  if (t === '') return '';
  const wartosc = Number(t);
  return Number.isFinite(wartosc) ? wartosc : null;
}

type WynikPolozen =
  | { readonly rodzaj: 'puste' }
  | { readonly rodzaj: 'lista'; readonly polozenia: PolozeniePrzewoduLinii[] }
  | { readonly rodzaj: 'blad' };

/**
 * Położenia z wierszy formularza: wiersz w pełni pusty pomijany, wiersz z jedną współrzędną
 * albo z tekstem nie-liczbą to błąd kształtu.
 */
function polozeniaZFormularza(wiersze: readonly PolozenieFormularza[]): WynikPolozen {
  const polozenia: PolozeniePrzewoduLinii[] = [];
  for (const wiersz of wiersze) {
    const x = liczbaPola(wiersz.x);
    const y = liczbaPola(wiersz.y);
    if (x === '' && y === '') continue;
    if (x === '' || y === '' || x === null || y === null) return { rodzaj: 'blad' };
    polozenia.push({ x_m: x, y_m: y });
  }
  return polozenia.length === 0 ? { rodzaj: 'puste' } : { rodzaj: 'lista', polozenia };
}

/**
 * Geometria słupa do zapisu (`update_element_parameters`) i do podglądu parametrów.
 * Fazy: wszystkie trzy położenia albo żadne (żadne = wartość robocza). Wiązka: liczba
 * całkowita ≥ 1 (puste = przewód pojedynczy, jak w kontrakcie modelu).
 */
export function geometriaZFormularza(formularz: FormularzLiniiWn): WynikGeometrii {
  const fazy = polozeniaZFormularza(formularz.fazy);
  if (fazy.rodzaj === 'blad') return { rodzaj: 'blad', pole: 'fazy' };
  if (fazy.rodzaj === 'lista' && fazy.polozenia.length !== LICZBA_FAZ) {
    return { rodzaj: 'blad', pole: 'fazy' };
  }
  const wiazka = liczbaPola(formularz.liczbaWWiazce);
  if (wiazka === null || (wiazka !== '' && (!Number.isInteger(wiazka) || wiazka < 1))) {
    return { rodzaj: 'blad', pole: 'liczbaWWiazce' };
  }
  const odstep = liczbaPola(formularz.odstepWiazki);
  if (odstep === null) return { rodzaj: 'blad', pole: 'odstepWiazki' };
  const rezystywnosc = liczbaPola(formularz.rezystywnosc);
  if (rezystywnosc === null) return { rodzaj: 'blad', pole: 'rezystywnosc' };

  let odgromowe: PolozeniePrzewoduLinii[] | null = null;
  if (formularz.trybOdgromowych === 'brak') odgromowe = [];
  if (formularz.trybOdgromowych === 'podane') {
    const podane = polozeniaZFormularza(formularz.odgromowe);
    if (podane.rodzaj !== 'lista') return { rodzaj: 'blad', pole: 'odgromowe' };
    odgromowe = podane.polozenia;
  }

  return {
    rodzaj: 'geometria',
    geometria: {
      fazy: fazy.rodzaj === 'lista' ? fazy.polozenia : null,
      liczba_w_wiazce: wiazka === '' ? 1 : wiazka,
      odstep_wiazki_m: odstep === '' ? null : odstep,
      odgromowe,
      // Przewód odgromowy z katalogu ma sens tylko przy przewodach odgromowych linii.
      przewod_odgromowy_ref:
        formularz.trybOdgromowych === 'brak' || formularz.przewodOdgromowyRef.trim() === ''
          ? null
          : formularz.przewodOdgromowyRef.trim(),
      rezystywnosc_gruntu_ohm_m: rezystywnosc === '' ? null : rezystywnosc,
    },
  };
}

/**
 * Czy geometria z formularza różni się od zapisanej w linii. Porównanie po tym samym
 * odwzorowaniu (model → formularz → geometria), więc linia bez geometrii i formularz z samymi
 * pustymi polami to „bez zmian" — nic nie jest wysyłane.
 */
export function geometriaZmieniona(
  formularz: FormularzLiniiWn,
  galaz: Branch | null | undefined,
): boolean {
  const nowa = geometriaZFormularza(formularz);
  const zapisana = geometriaZFormularza(formularzZLinii(galaz));
  if (nowa.rodzaj !== 'geometria') return false;
  const poprzednia = zapisana.rodzaj === 'geometria' ? zapisana.geometria : null;
  return JSON.stringify(nowa.geometria) !== JSON.stringify(poprzednia);
}

/** Czy formularz wskazuje inny przewód fazowy niż wiązanie katalogowe linii w modelu. */
export function przewodZmieniony(
  formularz: FormularzLiniiWn,
  galaz: Branch | null | undefined,
): boolean {
  return formularz.przewodId !== '' && formularz.przewodId !== formularzZLinii(galaz).przewodId;
}

/** Przewody fazowe (do wyboru dla linii) i odgromowe (do wyboru przewodu odgromowego). */
export function podzialPrzewodow(przewody: readonly OverheadConductorType[]): {
  readonly fazowe: readonly OverheadConductorType[];
  readonly odgromowe: readonly OverheadConductorType[];
} {
  return {
    fazowe: przewody.filter((p) => p.przeznaczenie === 'FAZOWY'),
    odgromowe: przewody.filter((p) => p.przeznaczenie === 'ODGROMOWY'),
  };
}

/**
 * Czy linia jest linią 110 kV w rozumieniu katalogu: wiązanie PRZEWOD_LINII_WN albo napięcie
 * szyny początkowej równe napięciu znamionowemu przewodu fazowego z katalogu (dana katalogu,
 * nie próg zaszyty w UI). Linia SN z wiązaniem LINIA_SN na szynie SN sekcji nie dostaje.
 */
export function liniaWnWgKatalogu(
  galaz: Branch | null | undefined,
  napiecieSzynyKv: number | null,
  przewodyFazowe: readonly OverheadConductorType[],
): boolean {
  if (!jestLiniaNapowietrzna(galaz)) return false;
  if (galaz.catalog_namespace === NAMESPACE_PRZEWOD_LINII_WN) return true;
  if (napiecieSzynyKv === null) return false;
  return przewodyFazowe.some((p) => p.voltage_rating_kv === napiecieSzynyKv);
}
