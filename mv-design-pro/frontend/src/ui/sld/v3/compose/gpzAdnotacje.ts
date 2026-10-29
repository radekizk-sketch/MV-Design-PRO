/**
 * Karta GPZ-PARYTET — adnotacje bloku GPZ: tła pól wg roli (`gpz.bay.panel`), tabela
 * „Pola GPZ" (karty pól) z plakietkami automatyki (`gpz.status_flags`) i pomiarami z wyniku
 * rozpływu (`gpz.measurements`), sloty nagłówka na bilans (`gpz.header.balance`)
 * i alarmy (`gpz.header.alarms`) oraz legenda ról.
 *
 * Moduł jest CZYSTY: liczy wyłącznie geometrię (prostokąty na siatce) i teksty
 * prezentacyjne. Wartości liczbowe przychodzą gotowe z wyniku backendu
 * (`results/v1`, wiersze `Bay`/`Substation` budowane w `enm/wyniki_pol_gpz.py`) —
 * tu nie ma żadnej arytmetyki fizycznej, nawet sumy. Szerokości slotów są mierzone
 * na NAJDŁUŻSZYM wariancie tekstu (wzorce niżej), więc geometria nie zależy od tego,
 * czy wynik jest wczytany (determinizm sceny bez względu na stan biegu).
 */

import { GRID, snapUp, type V3Rect } from '../core/grid';
import { labelLineHeight, measureLabelWidth } from '../core/text';
import type { GpzStatusFlag, RolaPolaGpz } from '../../v2/canvas/canonicalGpzModel';
import { FIELD_ROLE_LABEL_PL, FIELD_SOURCE_LABEL_PL } from '../../v2/station-rozdzielnia/contract';

/** Kolejność ról w legendzie i w kontrakcie palety (stała, deterministyczna). */
export const ROLE_POL_GPZ: readonly RolaPolaGpz[] = [
  'zasilajace',
  'liniowe',
  'transformatorowe',
  'sprzeglo',
  'pomiarowe',
  'zrodlowe',
  'kompensacyjne',
];

/** Etykiety ról z kanonu nazw pól SN (`FIELD_ROLE_LABEL_PL`) — jedna terminologia ról pól
 *  w produkcie (strażnik `tests/ci/test_etykiety_rol_pol_sn.py`). Rola `liniowe` grupuje
 *  w legendzie GPZ pola liniowe wyjściowe i odgałęźne (`OUT`/`FEEDER`) — to nazwa grupy,
 *  nie trzecia rola. Rola `zrodlowe` bez znanej technologii nosi etykietę pola źródłowego SN. */
export const ETYKIETA_ROLI_POLA_PL: Readonly<Record<RolaPolaGpz, string>> = {
  zasilajace: FIELD_ROLE_LABEL_PL.LINIA_IN,
  liniowe: 'Pole liniowe',
  transformatorowe: FIELD_ROLE_LABEL_PL.TRANSFORMATOROWE,
  sprzeglo: FIELD_ROLE_LABEL_PL.SPRZEGLO,
  pomiarowe: FIELD_ROLE_LABEL_PL.POMIAROWE,
  zrodlowe: FIELD_SOURCE_LABEL_PL,
  kompensacyjne: FIELD_ROLE_LABEL_PL.BATERIA_KONDENSATOROW,
};

/** Rozwinięcie plakietek automatyki (podpowiedź `<title>` i legenda tabeli). */
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

/** Tytuł tabeli pól (stan wyniku jawnie w tytule — nie w pustych komórkach). */
export function tekstTytuluTabeliGpz(maWynik: boolean, nieaktualny: boolean): string {
  if (!maWynik) return 'Pola GPZ — brak wyniku rozpływu mocy';
  return `Pola GPZ — wynik rozpływu mocy${nieaktualny ? PRZYROSTEK_NIEAKTUALNY : ''}`;
}

/** Komórka wartości, gdy wynik jest, ale nie niesie tej wielkości dla pola. */
export const TEKST_BRAKU_WARTOSCI = 'brak';

/** Oznacznik pola w tabeli, gdy model nie niesie ani numeru, ani nazwy pola WN. */
export const TEKST_POLA_BEZ_OZNACZENIA = 'bez oznaczenia';

/** Najdłuższe zapisy liczb, jakie backend formatuje (`format_hint` fixed4/fixed1/fixed2). */
const WZORZEC_MOCY = '−8888,8888';
const WZORZEC_PRADU = '88888,8';
const WZORZEC_NAPIECIA = '888,88';
const WZORZEC_LICZBY = '8888';

const PELNY_BILANS: BilansGpzWartosci = {
  pZasilaniaMw: WZORZEC_MOCY,
  qZasilaniaMvar: WZORZEC_MOCY,
  pOdplywowMw: WZORZEC_MOCY,
  qOdplywowMvar: WZORZEC_MOCY,
};
const PUSTY_BILANS: BilansGpzWartosci = { pZasilaniaMw: null, qZasilaniaMvar: null, pOdplywowMw: null, qOdplywowMvar: null };

const WZORCE_ZASILANIA: readonly string[] = [null, PELNY_BILANS, PUSTY_BILANS].map(tekstZasilaniaGpz);
const WZORCE_ODPLYWOW: readonly string[] = [null, PELNY_BILANS, PUSTY_BILANS].map(tekstOdplywowGpz);

const WZORCE_ALARMOW: readonly string[] = [
  tekstAlarmowGpz(null, false, false),
  tekstAlarmowGpz(null, true, true),
  tekstAlarmowGpz(WZORZEC_LICZBY, true, true),
];

const WZORCE_TYTULU: readonly string[] = [tekstTytuluTabeliGpz(false, false), tekstTytuluTabeliGpz(true, true)];

// ---------------------------------------------------------------------------
// Geometria.
// ---------------------------------------------------------------------------

/** Klasa typograficzna danych tabeli i nagłówka — 13 px (dyrektywa typografii danych). */
export const KLASA_DANYCH_GPZ = 't1' as const;
/** Wysokość wiersza tabeli: linia pisma 13 px + prześwit, na siatce. */
export const WYSOKOSC_WIERSZA_GPZ = snapUp(labelLineHeight(KLASA_DANYCH_GPZ) + GRID / 2);
/** Bok próbki koloru roli (komórka tabeli i legenda). */
export const BOK_PROBKI_ROLI = 2 * GRID;
const ODSTEP_KOLUMN = 2 * GRID;
const ODSTEP_PLAKIETEK = GRID / 2;

export type KluczWartosciGpz = 'p' | 'q' | 'i' | 'u';

/** Kolumna wartości w drugim wierszu karty pola (położenie WZGLĘDEM lewej krawędzi
 *  kolumny kart; liczby wyrównane do prawej krawędzi kolumny). */
export interface KolumnaWartosciGpz {
  readonly klucz: KluczWartosciGpz;
  /** Nagłówek z jednostką (np. „P [MW]") — w wierszu nagłówka nad każdą kolumną kart. */
  readonly naglowek: string;
  readonly dx: number;
  readonly width: number;
}

export interface PlakietkaGpz {
  readonly flaga: GpzStatusFlag;
  readonly rect: V3Rect;
}

/**
 * Karta pola w tabeli „Pola GPZ": próbka koloru roli, oznaczenie, rola, plakietki
 * automatyki oraz wartości P, Q, I, U z wyniku backendu. Gdy oba człony mieszczą
 * się obok siebie w dostępnej szerokości, karta jest JEDNYM wierszem tabeli
 * (wartości na prawo od opisu pola); w przeciwnym razie wartości schodzą do
 * drugiego wiersza karty. Wysokość tabeli jest częścią wysokości ramy GPZ, a ta
 * — kadru „Dopasuj widok" całej sieci, więc wiersz oszczędzony w karcie to
 * większa skala dopasowania (kontrakt tożsamości etykiet KD-11).
 */
export interface KartaPolaGpz {
  readonly bayRef: string;
  readonly oznaczenie: string;
  readonly rola: RolaPolaGpz;
  readonly rect: V3Rect;
  readonly probka: V3Rect;
  readonly oznaczenieX: number;
  readonly rolaX: number;
  readonly plakietki: readonly PlakietkaGpz[];
  /** Górna krawędź wiersza wartości (ten sam wiersz co opis w karcie jednowierszowej). */
  readonly wartosciY: number;
  /** Lewa krawędź kolumny kart (odniesienie `KolumnaWartosciGpz.dx`). */
  readonly kolumnaX: number;
}

export interface PozycjaLegendyGpz {
  readonly rola: RolaPolaGpz;
  readonly tekst: string;
  readonly probka: V3Rect;
  readonly tekstX: number;
  /** Górna krawędź wiersza legendy (legenda łamie się w dostępnej szerokości). */
  readonly y: number;
}

export interface TabelaPolGpz {
  readonly rect: V3Rect;
  readonly tytul: V3Rect;
  /** Górna krawędź wiersza nagłówków wartości. */
  readonly naglowekY: number;
  /** Lewe krawędzie kolumn kart (nagłówki wartości powtarzane nad każdą kolumną). */
  readonly kolumnyKart: readonly number[];
  readonly kolumnyWartosci: readonly KolumnaWartosciGpz[];
  readonly karty: readonly KartaPolaGpz[];
  /** Legenda ról (wyłącznie role obecne w tabeli, kolejność `ROLE_POL_GPZ`). */
  readonly legenda: readonly PozycjaLegendyGpz[];
}

export interface PanelPolaGpz {
  readonly bayRef: string;
  readonly rola: RolaPolaGpz;
  readonly rect: V3Rect;
}

export interface GpzAdnotacje {
  /** Sloty nagłówka (wewnątrz górnej belki ramy, pod nazwą): bilans zasilania, bilans
   *  odpływów (razem `gpz.header.balance`) i alarmy (`gpz.header.alarms`). */
  readonly zasilanie: V3Rect;
  readonly odplywy: V3Rect;
  readonly alarmy: V3Rect;
  readonly tabela: TabelaPolGpz | null;
  readonly panele: readonly PanelPolaGpz[];
}

/** Wejście karty tabeli — pole w kolejności kompozycji. */
export interface PoleTabeliGpzWejscie {
  readonly bayRef: string;
  readonly oznaczenie: string | null;
  readonly rola: RolaPolaGpz;
  readonly plakietki: readonly GpzStatusFlag[];
}

const szer = (tekst: string): number => measureLabelWidth(tekst, KLASA_DANYCH_GPZ);
const szerMax = (teksty: readonly string[]): number => Math.max(0, ...teksty.map(szer));

/** Szerokości slotów nagłówka (najdłuższy wariant tekstu każdego wiersza). */
export function szerokoscSlotowNaglowka(): {
  readonly zasilanie: number;
  readonly odplywy: number;
  readonly alarmy: number;
} {
  return {
    zasilanie: snapUp(szerMax(WZORCE_ZASILANIA)),
    odplywy: snapUp(szerMax(WZORCE_ODPLYWOW)),
    alarmy: snapUp(szerMax(WZORCE_ALARMOW)),
  };
}

function szerokoscPlakietki(flaga: GpzStatusFlag): number {
  return snapUp(szer(flaga) + GRID);
}

const DEFINICJE_WARTOSCI: readonly { klucz: KluczWartosciGpz; naglowek: string; wzorzec: string }[] = [
  { klucz: 'p', naglowek: 'P [MW]', wzorzec: WZORZEC_MOCY },
  { klucz: 'q', naglowek: 'Q [Mvar]', wzorzec: WZORZEC_MOCY },
  { klucz: 'i', naglowek: 'I [A]', wzorzec: WZORZEC_PRADU },
  { klucz: 'u', naglowek: 'U [kV]', wzorzec: WZORZEC_NAPIECIA },
];

/** Wysokość karty jednowierszowej (opis i wartości obok siebie). */
export const WYSOKOSC_KARTY_JEDNOWIERSZOWEJ_GPZ = WYSOKOSC_WIERSZA_GPZ;
/** Wysokość karty dwuwierszowej (wartości pod opisem pola). */
export const WYSOKOSC_KARTY_GPZ = 2 * WYSOKOSC_WIERSZA_GPZ;
const ODSTEP_KART_PIONOWY = GRID;

/**
 * Układ tabeli pól z lewym-górnym narożnikiem w (x, y), łamany w szerokości
 * `dostepnaSzerokosc` (szerokość treści elektrycznej bloku): karty pól płyną
 * wierszami w kolumnach kart o JEDNAKOWEJ szerokości. Tabela nie poszerza więc
 * ramy GPZ ponad treść elektryczną — rama rośnie tylko w pionie (szerokość GPZ
 * przesuwa świat sieci i łamanie arkusza, wysokość wyłącznie przesuwa go w dół).
 * Gdy pojedyncza karta jest szersza niż dostępna szerokość (bardzo długie
 * oznaczenie pola), tabela ma jedną kolumnę kart szerokości karty — jawnie, bez
 * ucinania tekstu.
 *
 * Karta jednowierszowa (opis i wartości obok siebie) albo dwuwierszowa (wartości
 * pod opisem): wybierany jest wariant o MNIEJSZEJ wysokości tabeli, bo wysokość
 * ramy GPZ wchodzi w kadr „Dopasuj widok" całej sieci; przy równej wysokości —
 * jednowierszowy (jedno pole = jeden wiersz tabeli). Wybór zależy wyłącznie od
 * pól i szerokości (nie od wyniku), więc jest deterministyczny.
 */
export function ulozTabeliGpz(
  pola: readonly PoleTabeliGpzWejscie[],
  x: number,
  y: number,
  dostepnaSzerokosc: number,
): TabelaPolGpz {
  const dwuwierszowa = ulozWariantTabeliGpz(pola, x, y, dostepnaSzerokosc, false);
  if (!wariantJednowierszowyMiesciSie(pola, dostepnaSzerokosc)) return dwuwierszowa;
  const jednowierszowa = ulozWariantTabeliGpz(pola, x, y, dostepnaSzerokosc, true);
  return jednowierszowa.rect.height <= dwuwierszowa.rect.height ? jednowierszowa : dwuwierszowa;
}

interface MiaryKartyGpz {
  readonly oznaczenia: readonly string[];
  readonly oznaczenieDx: number;
  readonly rolaDx: number;
  readonly plakietkiDx: number;
  readonly wiersz1W: number;
  readonly szerokosciWartosci: readonly number[];
  readonly wartosciW: number;
  readonly wartosciObokDx: number;
}

function miaryKartyGpz(pola: readonly PoleTabeliGpzWejscie[]): MiaryKartyGpz {
  const oznaczenia = pola.map((p) => p.oznaczenie ?? TEKST_POLA_BEZ_OZNACZENIA);
  const oznaczenieDx = BOK_PROBKI_ROLI + GRID;
  const oznaczenieW = snapUp(szerMax(oznaczenia));
  const rolaDx = oznaczenieDx + oznaczenieW + ODSTEP_KOLUMN;
  const rolaW = snapUp(szerMax(pola.map((p) => ETYKIETA_ROLI_POLA_PL[p.rola])));
  const plakietkiDx = rolaDx + rolaW + ODSTEP_KOLUMN;
  const plakietkiW = Math.max(
    0,
    ...pola.map((p) =>
      p.plakietki.reduce((suma, f, i) => suma + szerokoscPlakietki(f) + (i > 0 ? ODSTEP_PLAKIETEK : 0), 0),
    ),
  );
  const wiersz1W = plakietkiW > 0 ? plakietkiDx + plakietkiW : rolaDx + rolaW;
  const szerokosciWartosci = DEFINICJE_WARTOSCI.map((d) =>
    snapUp(szerMax([d.naglowek, d.wzorzec, TEKST_BRAKU_WARTOSCI])),
  );
  const wartosciW =
    szerokosciWartosci.reduce((suma, w) => suma + w, 0) + (szerokosciWartosci.length - 1) * ODSTEP_KOLUMN;
  // Odstęp opisu od wartości w karcie jednowierszowej = GRID (nie 2·GRID jak między
  // kolumnami): liczby są wyrównane do PRAWEJ krawędzi kolumny szerokości najdłuższego
  // wzorca, więc między opisem a pierwszą cyfrą zostaje jeszcze luz kolumny P.
  const wartosciObokDx = snapUp(wiersz1W + GRID);
  return { oznaczenia, oznaczenieDx, rolaDx, plakietkiDx, wiersz1W, szerokosciWartosci, wartosciW, wartosciObokDx };
}

/** Czy karta jednowierszowa mieści się w dostępnej szerokości (jedno źródło z układem). */
export function wariantJednowierszowyMiesciSie(pola: readonly PoleTabeliGpzWejscie[], dostepnaSzerokosc: number): boolean {
  const m = miaryKartyGpz(pola);
  return m.wartosciObokDx + m.wartosciW <= dostepnaSzerokosc;
}

/** Układ tabeli w JEDNYM wariancie karty (eksport na potrzeby wyroczni wyboru
 *  wariantu o mniejszej wysokości w `ulozTabeliGpz`). */
export function ulozWariantTabeliGpz(
  pola: readonly PoleTabeliGpzWejscie[],
  x: number,
  y: number,
  dostepnaSzerokosc: number,
  jednowierszowa: boolean,
): TabelaPolGpz {
  const { oznaczenia, oznaczenieDx, rolaDx, plakietkiDx, wiersz1W, szerokosciWartosci, wartosciObokDx } =
    miaryKartyGpz(pola);
  const kolumnyWartosci: KolumnaWartosciGpz[] = [];
  let dx = jednowierszowa ? wartosciObokDx : oznaczenieDx;
  DEFINICJE_WARTOSCI.forEach((d, k) => {
    const width = szerokosciWartosci[k];
    kolumnyWartosci.push({ klucz: d.klucz, naglowek: d.naglowek, dx, width });
    dx += width + ODSTEP_KOLUMN;
  });
  const wiersz2W = dx - ODSTEP_KOLUMN;
  const kartaW = snapUp(Math.max(wiersz1W, wiersz2W));
  const kartaH = jednowierszowa ? WYSOKOSC_KARTY_JEDNOWIERSZOWEJ_GPZ : WYSOKOSC_KARTY_GPZ;
  const liczbaKolumn = Math.max(
    1,
    Math.min(pola.length, Math.floor((dostepnaSzerokosc + ODSTEP_KOLUMN) / (kartaW + ODSTEP_KOLUMN))),
  );
  const kolumnyKart = Array.from({ length: liczbaKolumn }, (_, k) => x + k * (kartaW + ODSTEP_KOLUMN));

  const tytul: V3Rect = { x, y, width: snapUp(szerMax(WZORCE_TYTULU)), height: WYSOKOSC_WIERSZA_GPZ };
  const naglowekY = y + WYSOKOSC_WIERSZA_GPZ;
  const kartyY = naglowekY + WYSOKOSC_WIERSZA_GPZ;
  const karty: KartaPolaGpz[] = pola.map((pole, i) => {
    const kolumnaX = kolumnyKart[i % liczbaKolumn];
    const kartaY = kartyY + Math.floor(i / liczbaKolumn) * (kartaH + ODSTEP_KART_PIONOWY);
    let px = kolumnaX + plakietkiDx;
    const plakietki = pole.plakietki.map((flaga) => {
      const width = szerokoscPlakietki(flaga);
      const rect = { x: px, y: kartaY + GRID / 2, width, height: WYSOKOSC_WIERSZA_GPZ - GRID };
      px += width + ODSTEP_PLAKIETEK;
      return { flaga, rect };
    });
    return {
      bayRef: pole.bayRef,
      oznaczenie: oznaczenia[i],
      rola: pole.rola,
      rect: { x: kolumnaX, y: kartaY, width: kartaW, height: kartaH },
      probka: {
        x: kolumnaX,
        y: kartaY + (WYSOKOSC_WIERSZA_GPZ - BOK_PROBKI_ROLI) / 2,
        width: BOK_PROBKI_ROLI,
        height: BOK_PROBKI_ROLI,
      },
      oznaczenieX: kolumnaX + oznaczenieDx,
      rolaX: kolumnaX + rolaDx,
      plakietki,
      wartosciY: jednowierszowa ? kartaY : kartaY + WYSOKOSC_WIERSZA_GPZ,
      kolumnaX,
    };
  });
  const wierszeKart = Math.ceil(pola.length / liczbaKolumn);
  const kartyDol = kartyY + wierszeKart * kartaH + (wierszeKart - 1) * ODSTEP_KART_PIONOWY;
  const prawaKart = kolumnyKart[liczbaKolumn - 1] + kartaW;

  // Legenda ról łamana w szerokości max(dostępna, kolumny kart). Gdy CAŁA legenda
  // mieści się w wierszu tytułu na prawo od tytułu, stoi tam (tabela o wiersz
  // niższa — wysokość ramy GPZ wchodzi w kadr „Dopasuj widok" całej sieci);
  // w przeciwnym razie pod kartami, łamana. Szerokość tytułu to najdłuższy wzorzec,
  // więc wybór nie zależy od wyniku.
  const granicaLegendy = x + Math.max(dostepnaSzerokosc, prawaKart - x);
  const obecne = ROLE_POL_GPZ.filter((rola) => pola.some((p) => p.rola === rola));
  const szerokosciLegendy = obecne.map((rola) => BOK_PROBKI_ROLI + GRID + szer(ETYKIETA_ROLI_POLA_PL[rola]));
  // Krok pozycji legendy — JEDNA reguła dla próby zmieszczenia w wierszu tytułu
  // i dla właściwego układu niżej (predykat i układ z jednego źródła).
  const nastepnaPozycja = (lx: number, k: number): number => snapUp(lx + szerokosciLegendy[k] + ODSTEP_KOLUMN);
  const startLegendyWTytule = snapUp(x + tytul.width + ODSTEP_KOLUMN);
  const koniecLegendyWTytule = obecne.reduce(
    (lx, _rola, k) => (k === obecne.length - 1 ? lx + szerokosciLegendy[k] : nastepnaPozycja(lx, k)),
    startLegendyWTytule,
  );
  const legendaWTytule = obecne.length > 0 && koniecLegendyWTytule <= granicaLegendy;
  const legenda: PozycjaLegendyGpz[] = [];
  let lx = legendaWTytule ? startLegendyWTytule : x;
  let ly = legendaWTytule ? y : kartyDol + GRID;
  let prawaLegendy = x;
  obecne.forEach((rola, k) => {
    const tekst = ETYKIETA_ROLI_POLA_PL[rola];
    const szerPozycji = szerokosciLegendy[k];
    if (!legendaWTytule && lx > x && lx + szerPozycji > granicaLegendy) {
      lx = x;
      ly += WYSOKOSC_WIERSZA_GPZ;
    }
    const probka = { x: lx, y: ly + (WYSOKOSC_WIERSZA_GPZ - BOK_PROBKI_ROLI) / 2, width: BOK_PROBKI_ROLI, height: BOK_PROBKI_ROLI };
    const tekstX = lx + BOK_PROBKI_ROLI + GRID;
    legenda.push({ rola, tekst, probka, tekstX, y: ly });
    prawaLegendy = Math.max(prawaLegendy, lx + szerPozycji);
    lx = nastepnaPozycja(lx, k);
  });
  const prawa = Math.max(prawaKart, prawaLegendy, x + tytul.width);
  const dol = legendaWTytule || obecne.length === 0 ? kartyDol : ly + WYSOKOSC_WIERSZA_GPZ;
  return {
    rect: { x, y, width: snapUp(prawa - x), height: snapUp(dol - y) },
    tytul,
    naglowekY,
    kolumnyKart,
    kolumnyWartosci,
    karty,
    legenda,
  };
}

/** Wymiary tabeli pól bez położenia (do rezerwacji ramy przed translacją). */
export function wymiaryTabeliGpz(
  pola: readonly PoleTabeliGpzWejscie[],
  dostepnaSzerokosc: number,
): { readonly width: number; readonly height: number } {
  if (pola.length === 0) return { width: 0, height: 0 };
  const probna = ulozTabeliGpz(pola, 0, 0, dostepnaSzerokosc);
  return { width: probna.rect.width, height: probna.rect.height };
}

/** Prostokąt elementu kompozycji uczestniczącego w tle pola. */
export interface ElementPolaGpz {
  readonly bayRef: string;
  readonly rect: V3Rect;
}

/**
 * Tła pól: obrys wszystkich symboli i adnotacji zabezpieczeń pola z marginesem
 * GRID/2 (symbole stoją na siatce, więc krawędzie tła leżą na półsiatce). Kolejność wyjścia = kolejność pól na wejściu (deterministyczna).
 * Pola bez żadnego narysowanego elementu nie dostają tła (nie ma czego podświetlić).
 */
export function panelePolGpz(
  pola: readonly { readonly bayRef: string; readonly rola: RolaPolaGpz }[],
  elementy: readonly ElementPolaGpz[],
): readonly PanelPolaGpz[] {
  const margines = GRID / 2;
  const wynik: PanelPolaGpz[] = [];
  pola.forEach((pole) => {
    const wlasne = elementy.filter((e) => e.bayRef === pole.bayRef);
    if (wlasne.length === 0) return;
    const minX = Math.min(...wlasne.map((e) => e.rect.x)) - margines;
    const minY = Math.min(...wlasne.map((e) => e.rect.y)) - margines;
    const maxX = Math.max(...wlasne.map((e) => e.rect.x + e.rect.width)) + margines;
    const maxY = Math.max(...wlasne.map((e) => e.rect.y + e.rect.height)) + margines;
    wynik.push({
      bayRef: pole.bayRef,
      rola: pole.rola,
      rect: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    });
  });
  return wynik;
}

/** Translacja adnotacji o (dx, dy) — wołana z translacji końcowej kompozycji GPZ. */
export function przesunAdnotacjeGpz(adn: GpzAdnotacje, dx: number, dy: number): GpzAdnotacje {
  const r = (rect: V3Rect): V3Rect => ({ ...rect, x: rect.x + dx, y: rect.y + dy });
  const tabela: TabelaPolGpz | null = adn.tabela
    ? {
        ...adn.tabela,
        rect: r(adn.tabela.rect),
        tytul: r(adn.tabela.tytul),
        naglowekY: adn.tabela.naglowekY + dy,
        kolumnyKart: adn.tabela.kolumnyKart.map((kx) => kx + dx),
        karty: adn.tabela.karty.map((k) => ({
          ...k,
          rect: r(k.rect),
          probka: r(k.probka),
          oznaczenieX: k.oznaczenieX + dx,
          rolaX: k.rolaX + dx,
          plakietki: k.plakietki.map((p) => ({ ...p, rect: r(p.rect) })),
          wartosciY: k.wartosciY + dy,
          kolumnaX: k.kolumnaX + dx,
        })),
        legenda: adn.tabela.legenda.map((l) => ({ ...l, probka: r(l.probka), tekstX: l.tekstX + dx, y: l.y + dy })),
      }
    : null;
  return {
    zasilanie: r(adn.zasilanie),
    odplywy: r(adn.odplywy),
    alarmy: r(adn.alarmy),
    tabela,
    panele: adn.panele.map((p) => ({ ...p, rect: r(p.rect) })),
  };
}
