/*
 * Budowa indeksu wyszukiwarki poleceń (okno W-105).
 *
 * D4 (JEDNA PALETA KOMEND) — dwie zmiany wobec wersji z karty E1.5:
 *
 * 1. ZERO POZYCJI BEZ DOSTAWCY. Wcześniej pozycje statyczne dostawały akcję
 *    `brakAkcji` (pustą funkcję), a powłoka obsługiwała tylko dwa
 *    identyfikatory — „Zapisz", „Przywróć układ domyślny", „Połącz ponownie",
 *    „Eksportuj dowód…", „Porównaj scenariusze", oba przykłady i oba wpisy
 *    pomocy były MARTWYMI KLIKNIĘCIAMI: paleta zamykała się i nie działo się
 *    nic. Teraz akcje wstrzykuje wołający (`AkcjeIndeksu`), a pozycja bez
 *    realnego dostawcy po prostu nie powstaje (zakaz fabrykacji).
 *
 * 2. GRUPA „EKRANY" — przeniesiona zdolność drugiej palety
 *    (`ui/network-build/CommandPalette`, skasowana w tej samej karcie):
 *    otwieranie okien E-XX z `screenCanonRegistry`. To była JEDYNA unikalna
 *    zdolność tamtej palety; jej pozycje menu SLD nie wykonywały żadnej akcji
 *    (rozsyłały zdarzenie `mvdesignpro:command-palette-info`, którego NIKT nie
 *    słuchał), więc nie ma czego przenosić.
 */

import {
  SCREEN_CANON_REGISTRY,
  type CanonicalScreenCode,
} from '../../ui/workspace/screenCanonRegistry';
import { SPACES, type SpaceDefinition, type SpaceId } from '../shell/spaces';
import type { PozycjaWyszukiwania } from './searchModel';

/**
 * Kształt obiektu modelu dostarczanego przez provider. `kategoria` (np. „Stacje")
 * i `slowaKluczowe` (identyfikator, rodzaj) pozwalają odnaleźć obiekt także po
 * tym, czego nie widać w nazwie — parytet ze skasowaną drugą wyszukiwarką
 * modelu (`ui/network-build/GlobalSearch`, karta K1 POWLOKA: JEDNA wyszukiwarka).
 */
export interface ObiektDoIndeksu {
  id: string;
  nazwa: string;
  kategoria?: string;
  slowaKluczowe?: string;
}

/** Provider obiektów modelu — źródłem jest migawka modelu po stronie powłoki. */
export type ProviderObiektow = () => readonly ObiektDoIndeksu[];

/**
 * Realne akcje powłoki stojące za pozycjami indeksu. Każde pole to dostawca,
 * który ISTNIEJE w aplikacji — brak dostawcy = brak pozycji w palecie.
 */
export interface AkcjeIndeksu {
  /** Przejście do przestrzeni kanonicznej (grupa „Przestrzenie"). */
  przejdzDoPrzestrzeni: (przestrzen: SpaceId) => void;
  /** Zaznaczenie obiektu modelu (grupa „Obiekty"). */
  wybierzObiekt: (obiekt: ObiektDoIndeksu) => void;
  /** Otwarcie okna E-XX przez router powierzchni (grupa „Ekrany"). */
  otworzEkran: (kod: CanonicalScreenCode, tytulPl: string) => void;
  /** Uruchomienie obliczeń aktywnego zakresu. */
  przelicz: () => void;
  /** Ekran „Nowy / otwórz projekt". */
  otworzProjekt: () => void;
  /** Przywrócenie domyślnych szerokości i zwinięć doków bieżącej przestrzeni. */
  przywrocUklad: () => void;
  /** Ponowna próba połączenia z backendem (pasek stanu). */
  polaczPonownie: () => void;
  /** Włączenie/wyłączenie „Szczegółów audytowych" (menu „Widok"). */
  przelaczSzczegolyAudytowe: () => void;
  /** Przełączenie motywu ekranu (menu „Widok"). */
  przelaczMotyw: () => void;
}

function pozycjaZPrzestrzeni(
  przestrzen: SpaceDefinition,
  akcje: AkcjeIndeksu,
): PozycjaWyszukiwania {
  return {
    id: `przestrzen:${przestrzen.id}`,
    etykietaPL: przestrzen.label,
    grupa: 'przestrzenie',
    akcja: () => akcje.przejdzDoPrzestrzeni(przestrzen.id),
  };
}

/**
 * Okna E-XX widoczne w nawigacji — kolejność z rejestru ekranów (stabilna,
 * bo rejestr jest literałem obiektowym), więc indeks pozostaje deterministyczny.
 */
function pozycjeEkranow(akcje: AkcjeIndeksu): PozycjaWyszukiwania[] {
  return Object.values(SCREEN_CANON_REGISTRY)
    .filter((ekran) => ekran.visibleInNavigation)
    .map((ekran) => ({
      id: `ekran:${ekran.id}`,
      etykietaPL: ekran.labelFull,
      grupa: 'ekrany' as const,
      slowaKluczowe: `${ekran.id} ${ekran.labelShort}`,
      akcja: () => akcje.otworzEkran(ekran.id, ekran.labelFull),
    }));
}

/**
 * Polecenia powłoki. Lista ZAMKNIĘTA i sparowana z `AkcjeIndeksu`: dopisanie
 * pozycji wymaga dopisania dostawcy, bo inaczej kod się nie skompiluje.
 * Pozycje usunięte w D4 wraz z uzasadnieniem:
 *  - „Zapisz" — model nie ma osobnego zapisu (operacja domenowa zapisuje się
 *    na serwerze od razu), więc polecenie nie miało czego wywołać,
 *  - „Eksportuj dowód obliczeniowy do PDF" i „Porównaj scenariusze
 *    obliczeniowe" — DUBLOWAŁY pozycje menu powłoki („Generator raportu",
 *    „Porównanie przebiegów”), które mają realne akcje,
 *  - „Przykład: …" ×2 i „Pomoc: …" ×2 — brak dostawcy w aplikacji.
 */
function pozycjePolecen(akcje: AkcjeIndeksu): PozycjaWyszukiwania[] {
  return [
    {
      id: 'polecenie:przelicz',
      etykietaPL: 'Przelicz aktywny przypadek',
      grupa: 'polecenia',
      akcja: akcje.przelicz,
    },
    {
      id: 'polecenie:otworz-projekt',
      etykietaPL: 'Otwórz projekt',
      grupa: 'polecenia',
      akcja: akcje.otworzProjekt,
    },
    {
      id: 'polecenie:przywroc-uklad',
      etykietaPL: 'Przywróć układ domyślny',
      grupa: 'polecenia',
      akcja: akcje.przywrocUklad,
    },
    {
      id: 'polecenie:polacz-ponownie',
      etykietaPL: 'Połącz ponownie',
      grupa: 'polecenia',
      akcja: akcje.polaczPonownie,
    },
    {
      id: 'polecenie:szczegoly-audytowe',
      etykietaPL: 'Szczegóły audytowe: pokaż lub ukryj',
      grupa: 'polecenia',
      slowaKluczowe: 'ekspercki diagnostyka analizy akademickie identyfikatory odciski',
      akcja: akcje.przelaczSzczegolyAudytowe,
    },
    {
      id: 'polecenie:motyw',
      etykietaPL: 'Przełącz motyw ekranu',
      grupa: 'polecenia',
      slowaKluczowe: 'ciemny jasny',
      akcja: akcje.przelaczMotyw,
    },
  ];
}

export interface BudowaIndeksuOpcje {
  /** Realne akcje powłoki — wymagane: indeks nie tworzy pozycji bez dostawcy. */
  akcje: AkcjeIndeksu;
  /** Provider obiektów modelu — pominięcie daje pustą grupę „Obiekty". */
  obiekty?: ProviderObiektow;
}

/** Buduje pełny indeks wyszukiwarki: przestrzenie + ekrany + polecenia + obiekty. */
export function zbudujIndeksWyszukiwania(opcje: BudowaIndeksuOpcje): PozycjaWyszukiwania[] {
  const { akcje } = opcje;
  const przestrzenie = SPACES.map((przestrzen) => pozycjaZPrzestrzeni(przestrzen, akcje));
  const obiekty: PozycjaWyszukiwania[] = (opcje.obiekty?.() ?? []).map((obiekt) => ({
    id: `obiekt:${obiekt.id}`,
    etykietaPL: obiekt.kategoria ? `${obiekt.nazwa} · ${obiekt.kategoria}` : obiekt.nazwa,
    grupa: 'obiekty',
    slowaKluczowe: [obiekt.id, obiekt.slowaKluczowe].filter(Boolean).join(' '),
    akcja: () => akcje.wybierzObiekt(obiekt),
  }));
  return [...przestrzenie, ...pozycjeEkranow(akcje), ...pozycjePolecen(akcje), ...obiekty];
}
