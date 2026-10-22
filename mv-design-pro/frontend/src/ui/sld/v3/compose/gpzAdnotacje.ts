/**
 * Pola GPZ — teksty i stan danych pól dla karty GPZ w prawym inspektorze
 * (`network-build/inspektor-elementu/SekcjaPolGpz.tsx`).
 *
 * Karta GPZ-H5-SLD etap 2 (odrzucenie wizualne B-02): tabela „Pola GPZ", bilans i alarmy
 * nagłówka oraz tła ról pól ZESZŁY z geometrii schematu — schemat niesie oznaczenia
 * i stan aparatów, a dane pól (rola, automatyka, P/Q/I/U, bilans, przeciążenia) są w karcie
 * GPZ inspektora, otwieranej klikiem w nagłówek bloku GPZ. Kompozycja (`gpz.ts`) emituje
 * w meta sceny wyłącznie listę pól (`PoleTabeliGpzWejscie`, kolejność kompozycji), z której
 * czyta inspektor i rachunek pokrycia wyników — jedno źródło prawdy.
 *
 * Moduł jest CZYSTY: same teksty prezentacyjne. Wartości liczbowe przychodzą gotowe z wyniku
 * backendu (`results/v1`, wiersze `Bay`/`Substation` budowane w `enm/wyniki_pol_gpz.py`) —
 * tu nie ma żadnej arytmetyki fizycznej, nawet sumy.
 */

import type { GpzStatusFlag, RolaPolaGpz } from '../../v2/canvas/canonicalGpzModel';
import { FIELD_ROLE_LABEL_PL, FIELD_SOURCE_LABEL_PL } from '../../v2/station-rozdzielnia/contract';

/** Kolejność ról pól (stała, deterministyczna). */
export const ROLE_POL_GPZ: readonly RolaPolaGpz[] = [
  'zasilajace',
  'liniowe',
  'transformatorowe',
  'sprzeglo',
  'pomiarowe',
  'uziemiajace',
  'kompensacyjne',
  'zrodlowe',
];

/** Etykiety ról z kanonu nazw pól SN (`FIELD_ROLE_LABEL_PL`) — jedna terminologia ról pól
 *  w produkcie (strażnik `tests/ci/test_etykiety_rol_pol_sn.py`). Rola `liniowe` grupuje
 *  w karcie GPZ pola liniowe wyjściowe i odgałęźne (`OUT`/`FEEDER`) — to nazwa grupy,
 *  nie trzecia rola. Rola `zrodlowe` bez znanej technologii nosi etykietę pola źródłowego SN. */
export const ETYKIETA_ROLI_POLA_PL: Readonly<Record<RolaPolaGpz, string>> = {
  zasilajace: FIELD_ROLE_LABEL_PL.LINIA_IN,
  liniowe: 'Pole liniowe',
  transformatorowe: FIELD_ROLE_LABEL_PL.TRANSFORMATOROWE,
  sprzeglo: FIELD_ROLE_LABEL_PL.SPRZEGLO,
  pomiarowe: FIELD_ROLE_LABEL_PL.POMIAROWE,
  uziemiajace: FIELD_ROLE_LABEL_PL.UZIEMIAJACE,
  kompensacyjne: FIELD_ROLE_LABEL_PL.KOMPENSACYJNE,
  zrodlowe: FIELD_SOURCE_LABEL_PL,
};

/** Rozwinięcie plakietek automatyki (podpowiedź przy plakietce w karcie GPZ). */
export const OPIS_PLAKIETKI_PL: Readonly<Record<GpzStatusFlag, string>> = {
  SPZ: 'SPZ — samoczynne ponowne załączanie (funkcja 79 w modelu zabezpieczeń pola)',
  SCO: 'SCO — samoczynne częstotliwościowe odciążenie (funkcja 81U w modelu zabezpieczeń pola)',
};

/**
 * KONTRAKT NEGATYWNY (rozstrzygnięcie §0 pkt 6 karty GPZ-PARYTET): elementy nagłówka
 * operatorskiego SCADA dawnego renderera v2 i plakietka OWG, których schemat narzędzia
 * projektowego ŚWIADOMIE nie rysuje. Każdy wpis to klucz parytetu i uzasadnienie;
 * kompozycja nie może wyemitować żadnego z tych kluczy (test w
 * `compose/__tests__/gpz.test.ts`), dowód w `docs/evidence/CONVERGENCE_EVIDENCE.md` P1-11.
 */
export const KONTRAKT_NEGATYWNY_GPZ: Readonly<Record<string, string>> = {
  'gpz.header.transmission':
    'Nie SCADA: stan transmisji telemetrii to wielkość ruchowa systemu nadzoru; model ENM jej nie niesie (Bay.runtime_state nie ma w produkcie zapisującego) — kontrolka byłaby atrapą (reguła phantom).',
  'gpz.header.address':
    'Nie SCADA: adres stacji i identyfikator radiowy telemechaniki nie są polami modelu sieci (Substation nie ma adresu) — wartość byłaby fabrykacją (reguła phantom).',
  'gpz.header.control':
    'Nie SCADA: dostępność sterowania zdalnego to stan systemu nadzoru, nie dana projektowa; narzędzie nie steruje łącznikami ruchowo — przycisk bez operacji backendu (reguła phantom).',
  'gpz.header.reset_signals':
    'Nie SCADA: kasowanie sygnalizacji to polecenie do sterownika obiektowego; w narzędziu projektowym nie ma sygnalizacji do skasowania ani operacji backendu (martwy klik, reguła phantom).',
  'gpz.status_flags.OWG':
    'Brak podstawy: OWG nie ma pola w modelu ENM ani definicji w kanonie (dwa sprzeczne rozwinięcia w historii repo) — plakietka byłaby domysłem; plakietki tylko z kodów funkcji pola (SPZ ⇔ 79, SCO ⇔ 81U).',
};

// ---------------------------------------------------------------------------
// Teksty prezentacyjne (wspólne dla kompozycji — pomiar — i renderu — treść).
// ---------------------------------------------------------------------------

/** Wartości bilansu GPZ — gotowe napisy liczb z wyniku backendu (`null` = brak metryki). */
export interface BilansGpzWartosci {
  readonly pZasilaniaMw: string | null;
  readonly qZasilaniaMvar: string | null;
  readonly pOdplywowMw: string | null;
  readonly qOdplywowMvar: string | null;
}

const PRZYROSTEK_NIEAKTUALNY = ' · wynik nieaktualny';

/** Wiersz bilansu ZASILANIA w nagłówku GPZ (wtrysk źródeł policzony przez backend).
 *  `null` = brak wyniku rozpływu mocy. */
export function tekstZasilaniaGpz(bilans: BilansGpzWartosci | null): string {
  if (!bilans) return 'Zasilanie GPZ: brak wyniku rozpływu mocy';
  return bilans.pZasilaniaMw !== null && bilans.qZasilaniaMvar !== null
    ? `Zasilanie GPZ: P = ${bilans.pZasilaniaMw} MW, Q = ${bilans.qZasilaniaMvar} Mvar`
    : 'Zasilanie GPZ: brak wyniku źródła';
}

/** Wiersz bilansu ODPŁYWÓW w nagłówku GPZ (suma pól liniowych policzona przez backend). */
export function tekstOdplywowGpz(bilans: BilansGpzWartosci | null): string {
  if (!bilans) return 'Odpływy GPZ: brak wyniku rozpływu mocy';
  return bilans.pOdplywowMw !== null && bilans.qOdplywowMvar !== null
    ? `Odpływy GPZ: P = ${bilans.pOdplywowMw} MW, Q = ${bilans.qOdplywowMvar} Mvar`
    : 'Odpływy GPZ: brak kompletu wyników pól';
}

/** Wiersz alarmów w nagłówku GPZ (liczba przeciążeń policzona przez backend). Niesie
 *  też jawny znacznik nieaktualności wyniku dla całej belki nagłówka. */
export function tekstAlarmowGpz(
  liczbaPrzeciazen: string | null,
  maWynik: boolean,
  nieaktualny: boolean,
): string {
  if (!maWynik) return 'Przeciążenia w GPZ: brak wyniku rozpływu mocy';
  if (liczbaPrzeciazen === null) return `Przeciążenia w GPZ: brak wyniku${nieaktualny ? PRZYROSTEK_NIEAKTUALNY : ''}`;
  return `Przeciążenia w GPZ: ${liczbaPrzeciazen}${nieaktualny ? PRZYROSTEK_NIEAKTUALNY : ''}`;
}

/** Tytuł tabeli pól (stan wyniku jawnie w tytule — nie w pustych komórkach). `innyBieg` =
 *  wynik z aktywnego biegu rodziny rozpływu, a schemat pokazuje inny bieg (np. zwarciowy;
 *  karta GPZ-H5-SLD pkt 3b, R15). Tytuł stoi w karcie inspektora, nie w geometrii schematu,
 *  więc jego długość nie wpływa na układ sceny. */
export function tekstTytuluTabeliGpz(maWynik: boolean, nieaktualny: boolean, innyBieg = false): string {
  if (!maWynik) return 'Pola GPZ — brak wyniku rozpływu mocy';
  if (innyBieg) return `Pola GPZ — rozpływ z innego biegu niż schemat${nieaktualny ? PRZYROSTEK_NIEAKTUALNY : ''}`;
  return `Pola GPZ — wynik rozpływu mocy${nieaktualny ? PRZYROSTEK_NIEAKTUALNY : ''}`;
}

/** Komórka wartości, gdy wynik jest, ale nie niesie tej wielkości dla pola. */
export const TEKST_BRAKU_WARTOSCI = 'brak';

/**
 * Karta GPZ-H5-SLD pkt 3c (rozbieżność R13): jeden napis „brak" krył cztery różne stany —
 * pole rezerwowe, pole bez odpływu, pole bez wyposażenia i niewykonane obliczenie. Trzy
 * pierwsze to STAN DANYCH pola z rekordu modelu (nie z wyniku):
 * - `rezerwowe` — rodzaj pola katalogowego „rezerwowe" (`czyPoleRezerwowe`, lustro backendu
 *   `enm/rodzaj_stacji.py`);
 * - `bez_odplywu` — pole liniowe, którego zacisku nie kończy żaden odcinek (`czyPoleWolne`);
 * - `bez_aparatu` — model nie niesie żadnego rekordu aparatu pola (`primaryDevices`).
 * Czwarty stan (`niewykonane`) to brak biegu rozpływu mocy. Pierwszeństwo: dane pola przed
 * stanem obliczenia (pole rezerwowe pozostaje rezerwowym także bez biegu).
 */
export type StanDanychPolaGpz = 'rezerwowe' | 'bez_odplywu' | 'bez_aparatu';

/** Stan danych pola z rekordu kanonicznego (`CanonicalGpzBay.reserve`, `.primaryDevices`). */
export function stanDanychPolaGpz(pole: {
  readonly reserve?: 'rezerwowe' | 'wolne';
  readonly primaryDevices?: readonly unknown[];
}): StanDanychPolaGpz | null {
  if (pole.reserve === 'rezerwowe') return 'rezerwowe';
  if (pole.reserve === 'wolne') return 'bez_odplywu';
  if (!pole.primaryDevices || pole.primaryDevices.length === 0) return 'bez_aparatu';
  return null;
}

export const TEKST_STANU_POLA_GPZ: Readonly<Record<StanDanychPolaGpz | 'niewykonane', string>> = {
  rezerwowe: 'pole rezerwowe',
  bez_odplywu: 'pole bez odpływu',
  bez_aparatu: 'pole bez aparatu w modelu',
  niewykonane: 'obliczenie niewykonane',
};

/**
 * Napis wiersza pola, gdy pole nie ma ŻADNEJ wartości z wyniku (`null` = wiersz pokazuje
 * wartości kolumn, a pojedyncza nieobecna wielkość — „brak"). Wynik backendu ma
 * pierwszeństwo: pole, dla którego backend podał P/Q/I/U, pokazuje liczby. Stan
 * `bez_aparatu` NIE daje napisu wiersza (wymaganie 7 karty GPZ-H5-SLD etap 2: raz przy
 * obiekcie i raz zbiorczo — `tekstPolBezAparatuGpz`), więc taki wiersz mówi o stanie
 * obliczenia jak pole z kompletem danych.
 */
export function tekstStanuWartosciPolaGpz(
  stanDanych: StanDanychPolaGpz | null,
  maWynik: boolean,
  maWartosci: boolean,
): string | null {
  if (maWartosci) return null;
  if (stanDanych !== null && stanDanych !== 'bez_aparatu') return TEKST_STANU_POLA_GPZ[stanDanych];
  if (!maWynik) return TEKST_STANU_POLA_GPZ.niewykonane;
  return null;
}

/** Oznacznik pola w tabeli, gdy model nie niesie ani numeru, ani nazwy pola WN. */
export const TEKST_POLA_BEZ_OZNACZENIA = 'bez oznaczenia';

/** Pole GPZ w kolejności kompozycji (meta sceny `gpzPola`). */
export interface PoleTabeliGpzWejscie {
  readonly bayRef: string;
  readonly oznaczenie: string | null;
  readonly rola: RolaPolaGpz;
  readonly plakietki: readonly GpzStatusFlag[];
  /** Stan danych pola z rekordu (`stanDanychPolaGpz`); `null` = pole z kompletem danych. */
  readonly stanDanych: StanDanychPolaGpz | null;
}

/**
 * Karta GPZ-H5-SLD etap 2, wymaganie 7: „pole bez aparatu w modelu" jest sygnalizowane RAZ
 * przy obiekcie (znak „?" przy oznaczeniu pola na schemacie) i JEDEN raz zbiorczo w karcie
 * GPZ — nie w każdym wierszu. `null` = wszystkie pola mają rekord aparatu.
 */
export function tekstPolBezAparatuGpz(pola: readonly Pick<PoleTabeliGpzWejscie, 'stanDanych'>[]): string | null {
  const bez = pola.filter((pole) => pole.stanDanych === 'bez_aparatu').length;
  if (bez === 0) return null;
  return `Pola bez aparatu w modelu: ${bez} z ${pola.length} — znak „?” przy oznaczeniu pola na schemacie`;
}
