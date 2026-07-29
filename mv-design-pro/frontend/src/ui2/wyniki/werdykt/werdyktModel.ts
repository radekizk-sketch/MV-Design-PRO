/*
 * Adapter prezentacyjny ekranu „Werdykt projektowy" (karta F-K3).
 *
 * ZERO fizyki i ZERO ocen własnych: stany kryteriów, liczniki i przyczyny
 * przychodzą gotowe z backendu (`application/analyses/werdykt_projektowy.py`).
 * Ten moduł tylko tłumaczy je na etykiety PL i mapuje semantykę elementu
 * wiodącego (domena) na typ elementu interfejsu + rodzaj przekroczenia pętli
 * decyzji (`wyniki/wzorzec/akcjeNaprawcze.ts`).
 */

import type { PozycjaWerdyktu, StanKryterium, ZrodloKryterium, ZrodloWerdyktu } from './api';
import { WERDYKT_STRINGS as T } from './strings';
import type { RodzajPrzekroczenia } from '../wzorzec';
import type { ElementType } from '../../../ui/types';

/** Etykieta PL stanu kryterium. */
export function stanPL(stan: StanKryterium): string {
  switch (stan) {
    case 'SPELNIONE':
      return T.stanSpelnione;
    case 'NARUSZONE':
      return T.stanNaruszone;
    case 'NIESPRAWDZONE':
      return T.stanNiesprawdzone;
    case 'NIE_DOTYCZY':
      return T.stanNieDotyczy;
  }
}

/** Klasa CSS wiersza wg stanu (kolory tylko przez tokeny w arkuszu). */
export function klasaStanu(stan: StanKryterium): string {
  switch (stan) {
    case 'NARUSZONE':
      return 'mvd-werdykt-stan-naruszone';
    case 'NIESPRAWDZONE':
      return 'mvd-werdykt-stan-niesprawdzone';
    case 'SPELNIONE':
      return 'mvd-werdykt-stan-spelnione';
    case 'NIE_DOTYCZY':
      return 'mvd-werdykt-stan-nie-dotyczy';
  }
}

/** Etykieta PL werdyktu całościowego. */
export function werdyktPL(werdykt: 'SPELNIONE' | 'NARUSZONE' | 'NIESPRAWDZONE'): string {
  if (werdykt === 'NARUSZONE') return T.werdyktNaruszone;
  if (werdykt === 'NIESPRAWDZONE') return T.werdyktNiesprawdzone;
  return T.werdyktSpelnione;
}

/** Objaśnienie werdyktu całościowego (jawny następny krok). */
export function werdyktOpisPL(werdykt: 'SPELNIONE' | 'NARUSZONE' | 'NIESPRAWDZONE'): string {
  if (werdykt === 'NARUSZONE') return T.werdyktOpisNaruszone;
  if (werdykt === 'NIESPRAWDZONE') return T.werdyktOpisNiesprawdzone;
  return T.werdyktOpisSpelnione;
}

/** Etykieta PL źródła danych. */
export function zrodloPL(rodzaj: ZrodloKryterium): string {
  if (rodzaj === 'PF') return T.zrodloRozplyw;
  if (rodzaj === 'short_circuit_sn') return T.zrodloZwarcie;
  return T.zrodloModel;
}

/**
 * Stan aktualności źródła jednym zdaniem (kontrakt ekranu, punkt 2).
 *
 * Kolejność sprawdzeń ma znaczenie: backend oznacza bieg NIEAKTUALNY jako
 * niedostępny (reguła 4 kanonu — zmiana modelu unieważnia wyniki), więc gdyby
 * najpierw pytać o dostępność, komunikat o unieważnieniu nigdy by się nie
 * pokazał i projektant nie wiedziałby, że wystarczy przeliczyć.
 */
export function stanZrodlaPL(zrodlo: ZrodloWerdyktu): string {
  if (zrodlo.run_id !== null && !zrodlo.aktualny) return T.zrodloNieaktualny;
  if (!zrodlo.dostepny) return zrodlo.powod_pl ?? T.zrodloNiedostepny;
  return T.zrodloAktualny;
}

/**
 * Typ elementu interfejsu dla pętli decyzji. `null` ⇒ kryterium bez elementu
 * modelu (agregat systemowy) — przycisk decyzji się nie renderuje, zamiast
 * prowadzić w nikąd.
 */
export function typElementuKryterium(pozycja: PozycjaWerdyktu): ElementType | null {
  if (!pozycja.wiodacy_element_id) return null;
  switch (pozycja.element_rodzaj) {
    case 'szyna':
      return 'Bus';
    case 'galaz_liniowa':
      return 'LineBranch';
    case 'transformator':
      return 'TransformerBranch';
    default:
      return null;
  }
}

/**
 * Rodzaj przekroczenia dla kontekstowej akcji naprawczej. Mapowane WYŁĄCZNIE
 * tam, gdzie rejestr akcji ma realny cel (zero fabrykacji celu nawigacji);
 * pozostałe kryteria dostają akcję generyczną (`undefined`).
 */
export function rodzajPrzekroczeniaKryterium(
  pozycja: PozycjaWerdyktu,
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

/** Opis zakresu oceny pozycji (ile ocenionych / naruszonych / bez danych). */
export function zakresOcenyPL(pozycja: PozycjaWerdyktu): string {
  const podstawa = T.zakresOceny({
    ocenione: pozycja.liczba_ocenionych,
    naruszone: pozycja.liczba_naruszen,
    niesprawdzone: pozycja.liczba_niesprawdzonych,
  });
  if (pozycja.liczba_ostrzezen > 0) {
    return `${podstawa} · ${T.ostrzezenia(pozycja.liczba_ostrzezen)}`;
  }
  return podstawa;
}

/**
 * Przyczyna pozycji jednym zdaniem: opis elementu wiodącego, a gdy go nie ma —
 * powód braku oceny. Pusty string oznacza brak treści do pokazania (pozycja
 * spełniona bez uwag).
 */
export function przyczynaPL(pozycja: PozycjaWerdyktu): string {
  return pozycja.wiodacy_opis_pl ?? pozycja.powod_pl ?? '';
}
