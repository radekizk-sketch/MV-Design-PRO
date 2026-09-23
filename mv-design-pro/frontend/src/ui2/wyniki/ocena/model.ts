/*
 * Model prezentacji ekranu „Ocena techniczna wyników" (karta B-02 / W3-E).
 *
 * ZERO fizyki i ZERO ocen własnych: wyniki oceny elementów, liczniki, marginesy
 * i wnioski przychodzą gotowe z backendu (`application/analyses/werdykt_projektowy.py`).
 * Ten moduł tylko: grupuje pozycje według znaczenia technicznego (grupy z
 * odpowiedzi, wyłącznie z wynikami), formatuje liczby po polsku i mapuje
 * semantykę elementu (domena) na typ elementu interfejsu + rodzaj przekroczenia
 * pętli decyzji (`wyniki/wzorzec/akcjeNaprawcze.ts`).
 */

import type { ElementType } from '../../../ui/types';
import type { RodzajPrzekroczenia } from '../wzorzec';
import type {
  NiepewnoscOdpowiedz,
  OcenaElementu,
  OdpowiedzOceny,
  PodstawaNormatywnaOdpowiedz,
  PozycjaOceny,
  PrzyczynaOgraniczeniaOdpowiedz,
  PunktKrytycznyOdpowiedz,
  RodzajElementuOceny,
  WynikOceny,
  ZakresWaznosciOdpowiedz,
  ZrodloKryterium,
  ZrodloOceny,
} from './api';
import {
  DOMENA_FIZYCZNA_PL,
  OCENA_STRINGS as T,
  PRZYCZYNA_PL,
  STATUS_PARAMETROW_PL,
  STATUS_ROWNAN_PL,
  STATUS_WEJSCIA_PL,
} from './strings';

/** Grupa znaczeniowa z pozycjami, które MAJĄ oceny elementów. */
export interface GrupaOceny {
  readonly kod: string;
  readonly nazwa: string;
  readonly pozycje: readonly PozycjaOceny[];
}

/**
 * Grupy w kolejności odpowiedzi backendu, WYŁĄCZNIE z pozycjami niosącymi oceny
 * elementów (prompt właściciela §4.5: „wyłącznie grupy, w których są wyniki").
 * Pozycja bez elementów trafia do sekcji „Kryteria bez podstawy do oceny".
 */
export function grupyZWynikami(odpowiedz: OdpowiedzOceny): GrupaOceny[] {
  return odpowiedz.grupy
    .map((grupa) => ({
      kod: grupa.kod,
      nazwa: grupa.nazwa_pl,
      pozycje: odpowiedz.pozycje.filter(
        (pozycja) => pozycja.grupa === grupa.kod && pozycja.elementy.length > 0,
      ),
    }))
    .filter((grupa) => grupa.pozycje.length > 0);
}

/** Pozycje bez ocen elementów — każda z powodem (brak biegu, brak danych, bieg nieaktualny). */
export function pozycjeBezPodstaw(odpowiedz: OdpowiedzOceny): PozycjaOceny[] {
  return odpowiedz.pozycje.filter(
    (pozycja) => pozycja.elementy.length === 0 && pozycja.stan !== 'NIE_DOTYCZY',
  );
}

/**
 * Stan blokujący (prompt §5): brak zakończonego, AKTUALNEGO przebiegu rozpływu
 * i zwarć — ocena nie ma z czego powstać. Kryterium „z modelu" nie ratuje ekranu:
 * ocena techniczna WYNIKÓW dotyczy wyników obliczeń.
 */
export function czyBrakWynikow(odpowiedz: OdpowiedzOceny): boolean {
  return odpowiedz.zrodla
    .filter((zrodlo) => zrodlo.rodzaj !== 'model')
    .every((zrodlo) => !zrodlo.dostepny || !zrodlo.aktualny);
}

/** Etykieta PL wyniku oceny elementu. */
export function wynikPL(wynik: WynikOceny): string {
  switch (wynik) {
    case 'SPELNIA':
      return T.wynikSpelnia;
    case 'NIE_SPELNIA':
      return T.wynikNieSpelnia;
    case 'BRAK_PODSTAW':
      return T.wynikBrakPodstaw;
  }
}

/** Klasa CSS wyniku (kolory tylko przez tokeny w arkuszu). */
export function klasaWyniku(wynik: WynikOceny): string {
  switch (wynik) {
    case 'SPELNIA':
      return 'mvd-ocena-wynik--spelnia';
    case 'NIE_SPELNIA':
      return 'mvd-ocena-wynik--nie-spelnia';
    case 'BRAK_PODSTAW':
      return 'mvd-ocena-wynik--brak-podstaw';
  }
}

/** Zdanie oceny całościowej (jawny następny krok) — z liczników backendu. */
export function ocenaCalosciowaPL(odpowiedz: OdpowiedzOceny): string {
  if (odpowiedz.ocena.nie_spelnia > 0) return T.ocenaCalosciowaNieSpelnia;
  if (odpowiedz.ocena.brak_podstaw > 0 || odpowiedz.werdykt === 'NIESPRAWDZONE') {
    return T.ocenaCalosciowaBrakPodstaw;
  }
  return T.ocenaCalosciowaSpelnia;
}

/**
 * Liczba po polsku (przecinek dziesiętny), z liczbą miejsc zależną od rzędu
 * wielkości — wyłącznie prezentacja, wartość bez zmian.
 */
export function fmtLiczba(wartosc: number | null): string {
  if (wartosc === null || !Number.isFinite(wartosc)) return T.marginesBrak;
  const modul = Math.abs(wartosc);
  const miejsca = modul >= 100 ? 1 : modul >= 10 ? 2 : 3;
  const tekst = wartosc.toFixed(miejsca).replace(/\.?0+$/, '');
  return tekst.replace('.', ',');
}

/** Liczba z jednostką („12,5 %", „0,95"); jednostka „-" pomijana. */
export function fmtWartoscZJednostka(wartosc: number | null, jednostka: string): string {
  const liczba = fmtLiczba(wartosc);
  if (wartosc === null || jednostka === '' || jednostka === '-') return liczba;
  return `${liczba} ${jednostka}`;
}

/** Zapis wartości odniesienia wg warunku kryterium (≤ / ≥ / pasmo / zgodność). */
export function fmtOdniesienie(element: OcenaElementu, pozycja: PozycjaOceny): string {
  const jednostka = element.jednostka || pozycja.jednostka;
  if (pozycja.warunek === 'zgodnosc' || element.odniesienie === null) {
    return element.odniesienie === null
      ? T.odniesienieBrak
      : fmtWartoscZJednostka(element.odniesienie, jednostka);
  }
  let zapis: string;
  if (pozycja.warunek === 'w_pasmie') {
    zapis =
      element.odniesienie_dolne === null
        ? `≤ ${fmtWartoscZJednostka(element.odniesienie, jednostka)}`
        : `${fmtLiczba(element.odniesienie_dolne)} … ${fmtWartoscZJednostka(element.odniesienie, jednostka)}`;
  } else if (pozycja.warunek === 'nie_mniej_niz') {
    zapis = `≥ ${fmtWartoscZJednostka(element.odniesienie, jednostka)}`;
  } else {
    zapis = `≤ ${fmtWartoscZJednostka(element.odniesienie, jednostka)}`;
  }
  if (element.odniesienie_ostrzegawcze !== null && pozycja.warunek !== 'w_pasmie') {
    zapis += ` (${T.progUwagi}: ${fmtWartoscZJednostka(element.odniesienie_ostrzegawcze, jednostka)})`;
  }
  return zapis;
}

/** Margines ze znakiem i jednostką zapasu („+12,3 pkt proc.", „−4,1 %"). */
export function fmtMargines(element: OcenaElementu): string {
  if (element.margines === null) return T.marginesBrak;
  const znak = element.margines > 0 ? '+' : element.margines < 0 ? '−' : '';
  const liczba = fmtLiczba(Math.abs(element.margines));
  const jednostka = element.margines_jednostka;
  return jednostka === '' || jednostka === '-' ? `${znak}${liczba}` : `${znak}${liczba} ${jednostka}`;
}

/** Podstawa oceny pozycji: odniesienie normowe + warunek (wzory inline `$…$`). */
export function podstawaOcenyPL(pozycja: PozycjaOceny): string {
  return pozycja.norma_pl ? `${pozycja.norma_pl} · ${pozycja.warunek_pl}` : pozycja.warunek_pl;
}

/** Nazwa przedmiotu oceny (element modelu albo agregat całej sieci). */
export function nazwaPrzedmiotu(element: OcenaElementu): string {
  if (element.element_nazwa && element.element_nazwa !== '') return element.element_nazwa;
  if (element.element_id === null || element.element_id === 'network') return T.elementAgregat;
  return element.element_id;
}

/** Typ elementu interfejsu dla semantyki domeny (pętla decyzji / zaznaczenie na schemacie). */
export function typElementu(rodzaj: RodzajElementuOceny | null): ElementType | null {
  switch (rodzaj) {
    case 'szyna':
      return 'Bus';
    case 'galaz_liniowa':
      return 'LineBranch';
    case 'transformator':
      return 'TransformerBranch';
    case 'zrodlo':
      return 'Generator';
    default:
      return null;
  }
}

/** Czy element ma realny cel na schemacie (identyfikator modelu + znany typ). */
export function elementNaSchemacie(element: OcenaElementu, pozycja: PozycjaOceny): boolean {
  return (
    element.element_id !== null
    && element.element_id !== 'network'
    && typElementu(element.element_rodzaj ?? pozycja.element_rodzaj) !== null
  );
}

/**
 * Typ elementu interfejsu dla pozycji (element wiodący) — konsument: rejestr
 * „Co wymaga uwagi". `null` ⇒ kryterium bez elementu modelu (agregat systemowy).
 */
export function typElementuKryterium(pozycja: PozycjaOceny): ElementType | null {
  if (!pozycja.wiodacy_element_id) return null;
  return typElementu(pozycja.element_rodzaj);
}

/**
 * Rodzaj przekroczenia dla kontekstowej akcji naprawczej. Mapowane WYŁĄCZNIE
 * tam, gdzie rejestr akcji ma realny cel (zero fabrykacji celu nawigacji);
 * pozostałe kryteria dostają akcję generyczną (`undefined`).
 */
export function rodzajPrzekroczeniaKryterium(
  pozycja: Pick<PozycjaOceny, 'kryterium_id'>,
): RodzajPrzekroczenia | undefined {
  switch (pozycja.kryterium_id) {
    case 'napiecie.odchylenie':
      return 'napiecie';
    case 'galaz.obciazenie_dlugotrwale':
      return 'obciazalnosc-galezi';
    case 'transformator.obciazenie':
      return 'obciazalnosc-transformatora';
    case 'moc_bierna.bilans':
      return 'bilans-biernej';
    default:
      return undefined;
  }
}

/** Etykieta PL źródła danych. */
export function zrodloPL(rodzaj: ZrodloKryterium): string {
  if (rodzaj === 'PF') return T.zrodloRozplyw;
  if (rodzaj === 'short_circuit_sn') return T.zrodloZwarcie;
  if (rodzaj === 'ncrfg_ptpiree') return T.zrodloNcRfg;
  if (rodzaj.startsWith('v126:')) return T.zrodloV126;
  return T.zrodloModel;
}

/**
 * Stan przebiegu jednym zdaniem. Kolejność sprawdzeń: bieg NIEAKTUALNY jest
 * oznaczany jako niedostępny (reguła 4 kanonu), więc najpierw pytamy o
 * aktualność — inaczej komunikat o unieważnieniu nigdy by się nie pokazał.
 */
export function stanPrzebieguPL(zrodlo: ZrodloOceny): string {
  if (zrodlo.run_id !== null && !zrodlo.aktualny) return T.przebiegNieaktualny;
  if (!zrodlo.dostepny) return zrodlo.powod_pl ?? T.przebiegBrak;
  return `${T.przebiegZakonczony} · ${T.przebiegAktualny}`;
}

/** Czas wykonania przebiegu w czytelnym zapisie (ISO → „RRRR-MM-DD GG:MM"). */
export function czasWykonaniaPL(iso: string | null): string {
  if (!iso) return T.marginesBrak;
  return iso.slice(0, 16).replace('T', ' ');
}

/** Rodzaje wyników w pakiecie (dostępne i aktualne przebiegi). */
export function pakietWynikowPL(zrodla: readonly ZrodloOceny[]): string {
  const nazwy = zrodla
    .filter((zrodlo) => zrodlo.rodzaj !== 'model' && zrodlo.dostepny && zrodlo.aktualny)
    .map((zrodlo) => (zrodlo.rodzaj === 'PF' ? T.pakietRozplyw : T.pakietZwarcia));
  return nazwy.length === 0 ? T.podstawaPakietBrak : nazwy.join(', ');
}


// ---------------------------------------------------------------------------
// Wynik wyjaśnialny (karta AB-1a D2) — formatery pól wyjaśnialności. Czysta
// prezentacja: każda wartość przychodzi z backendu, `null` = kreska/brak sekcji.
// ---------------------------------------------------------------------------

/** Etykieta PL domeny fizycznej (nieznany kod → dosłownie, jako dane). */
export function domenaFizycznaPL(kod: string | null): string {
  if (kod === null) return T.marginesBrak;
  return DOMENA_FIZYCZNA_PL[kod] ?? kod;
}

/** Części podstawy strukturalnej (dokument, wersja, klauzula) — bez pustych. */
export function czesciPodstawy(podstawa: PodstawaNormatywnaOdpowiedz): string[] {
  const czesci: string[] = [];
  if (podstawa.dokument) czesci.push(podstawa.dokument);
  if (podstawa.wersja) czesci.push(`${T.podstawaWersja} ${podstawa.wersja}`);
  if (podstawa.klauzula) czesci.push(`${T.podstawaKlauzula} ${podstawa.klauzula}`);
  return czesci;
}

/** Zapis podstawy strukturalnej jednym zdaniem (brak dokumentu → nazwany brak). */
export function podstawaStrukturalnaPL(podstawa: PodstawaNormatywnaOdpowiedz): string {
  const czesci = czesciPodstawy(podstawa);
  return czesci.length > 0 ? czesci.join(', ') : T.podstawaBrakDokumentu;
}

/** Czy podstawa niesie źródło NIEPOTWIERDZONE (odznaka na ekranie). */
export function czyZrodloNiezweryfikowane(podstawa: PodstawaNormatywnaOdpowiedz | null): boolean {
  return podstawa !== null && podstawa.zrodlo_status === 'UNVERIFIED_SOURCE';
}

/** Punkt krytyczny: element + współrzędna („t = 0,15 s", „f = 250 Hz"). */
export function fmtPunktKrytyczny(punkt: PunktKrytycznyOdpowiedz): string {
  const czesci: string[] = [];
  if (punkt.element_ref) czesci.push(punkt.element_ref);
  const w = punkt.wspolrzedna;
  if (w !== null && w.t_s !== undefined) czesci.push(`t = ${fmtWartoscZJednostka(w.t_s, 's')}`);
  if (w !== null && w.f_hz !== undefined) czesci.push(`f = ${fmtWartoscZJednostka(w.f_hz, 'Hz')}`);
  return czesci.length > 0 ? czesci.join(' · ') : T.marginesBrak;
}

/** Przyczyna: rodzaj (PL) + opis. */
export function fmtPrzyczyna(przyczyna: PrzyczynaOgraniczeniaOdpowiedz): string {
  const rodzaj = PRZYCZYNA_PL[przyczyna.rodzaj] ?? przyczyna.rodzaj;
  return `${rodzaj}: ${przyczyna.opis_pl}`;
}

/** Etykiety PL dwóch osi statusu modelu. */
export function statusRownanPL(kod: string): string {
  return STATUS_ROWNAN_PL[kod] ?? kod;
}
export function statusParametrowPL(kod: string): string {
  return STATUS_PARAMETROW_PL[kod] ?? kod;
}

/** Jakość danych wejściowych (PL). */
export function statusWejsciaPL(kod: string | null): string {
  if (kod === null) return T.marginesBrak;
  return STATUS_WEJSCIA_PL[kod] ?? kod;
}

/** Niepewność: „± 0,5 % (metoda)". */
export function fmtNiepewnosc(niepewnosc: NiepewnoscOdpowiedz): string {
  return `± ${fmtWartoscZJednostka(niepewnosc.wartosc, niepewnosc.jednostka)} (${niepewnosc.metoda_pl})`;
}

/** Zakres ważności: opis + granice w kolejności kluczy backendu (posortowane). */
export function fmtZakresWaznosci(zakres: ZakresWaznosciOdpowiedz): string {
  const granice = Object.entries(zakres.granice)
    .map(([klucz, wartosc]) => `${klucz} = ${fmtLiczba(wartosc)}`)
    .join(', ');
  return granice ? `${zakres.opis_pl} (${granice})` : zakres.opis_pl;
}

/** Czy element niesie którekolwiek pole wyjaśnialności (sekcja „Szczegóły wyniku"). */
export function maSzczegolyWyniku(element: OcenaElementu): boolean {
  return (
    element.punkt_krytyczny !== null
    || element.przyczyna !== null
    || element.status_modelu !== null
    || element.status_wejscia !== null
    || element.niepewnosc !== null
    || element.zakres_waznosci !== null
  );
}