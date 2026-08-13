/*
 * NASTĘPNA NAJLEPSZA AKCJA (NBA) — DOKŁADNIE JEDNA akcja, wyznaczona
 * deterministycznie z kontraktu backendu. Czysta funkcja: zero Reacta, zero
 * store'ów, zero fizyki, zero wywołań API.
 *
 * ŹRÓDŁO DECYZJI = WYŁĄCZNIE POLA KONTRAKTU. Reguła nie ma wag, punktacji ani
 * rankingu heurystycznego. Kolejno używa:
 *   1. obecności modelu (odpowiedź operacji domenowej: jest snapshot albo nie),
 *   2. `severity` zgłoszenia gotowości (BLOKUJACE / OSTRZEZENIE — klasy
 *      kontraktu, w UI nie powstaje ŻADNA nowa klasa ważności),
 *   3. `canonical_priority` z kanonicznego rejestru kodów gotowości
 *      (`backend/src/domain/canonical_operations.py`, `ReadinessCodeSpec.priority`,
 *      1 = najwyższy) — pole doprowadzone do odpowiedzi operacji domenowej
 *      addytywnie przez `domain/readiness_bridge.opis_kanoniczny`,
 *   4. `code` i `element_ref` zgłoszenia jako jawne pola rozstrzygające remis,
 *   5. statusu przebiegu obliczeń (`status === 'DONE'`) oraz `results_valid`
 *      przypadku obliczeniowego.
 *
 * DRABINA REGUŁ (pierwszy spełniony warunek wygrywa — dokładnie jedna akcja):
 *   R1. brak otwartego projektu                     -> otwórz projekt      (E1)
 *   R2. gotowość NIEUSTALONA (nikt jej nie policzył)-> ustal gotowość      (E3)
 *   R3. jest co najmniej jedna BLOKADA gotowości    -> usuń blokadę        (E3)
 *   R4. brak zakończonego przebiegu obliczeń        -> uruchom obliczenia  (E4)
 *   R5. wyniki jawnie nieaktualne (`results_valid` = fałsz)
 *                                                   -> przelicz ponownie   (E4)
 *   R6. w pozostałych przypadkach                   -> odczytaj wyniki     (E5)
 *
 * DLACZEGO R2 ISTNIEJE (dług V12K-309 poz. 1, ta sama klasa): pusta lista
 * zgłoszeń znaczy „brak braków" TYLKO wtedy, gdy gotowość w ogóle policzono.
 * Gdy odczyt gotowości padł, `readiness` jest `null` — i reguła bez tego
 * szczebla ogłaszałaby „uruchom obliczenia" dokładnie wtedy, gdy NIE WIADOMO,
 * czy wolno. Predykat pochodzi z JEDNEGO źródła prawdy — `czyGotowoscUstalona`
 * z adaptera gotowości (reguła KLASA-NIE-INSTANCJA §3: warunek wejścia i
 * wyjścia z jednego miejsca, nie dwa „dziś zgodne" warunki).
 *
 * DLACZEGO OSTRZEŻENIA NIE TWORZĄ NBA: kontrakt gotowości rozdziela blokady od
 * ostrzeżeń i to blokady (a nie ostrzeżenia) zamykają drogę do obliczeń —
 * `readiness.ready` liczy się z blokad. Wystawienie ostrzeżenia jako „następnej
 * najlepszej akcji" byłoby rankingiem wymyślonym w UI ponad semantyką kontraktu.
 * Ostrzeżenia pozostają widoczne w przestrzeni „Gotowość" (pełna lista).
 *
 * DLACZEGO DRABINA JEST MONOTONICZNA WZGLĘDEM OSI E1–E8: każdy kolejny szczebel
 * wymaga spełnienia warunku poprzedniego (obliczeń nie da się uruchomić przy
 * blokadach, wyników nie da się odczytać bez zakończonego przebiegu). Dzięki
 * temu etap zwrócony przez NBA jest jednocześnie miejscem projektu na osi
 * procesu — mapa etapów nie potrzebuje własnego, drugiego wyliczenia postępu.
 * Reguła topuje na E5: etapów E6–E8 (decyzje projektowe, uzgodnienia,
 * dokumentacja) NIE da się zmierzyć ze store'ów read-only pulpitu, więc NBA
 * ich nie ogłasza — zamiast zgadywać, milczy.
 */

import type { ProblemGotowosci } from '../spaces/gotowosc/grupowanieCelow';
import type { SpaceId } from '../shell/spaces';
import type { EtapId } from './etapy';
import { PROCES_STRINGS } from './strings';

/** Rodzaj następnej akcji — zamknięty zbiór szczebli drabiny reguł. */
export type RodzajNastepnejAkcji =
  | 'otworz-projekt'
  | 'ustal-gotowosc'
  | 'usun-blokade'
  | 'uruchom-obliczenia'
  | 'przelicz-ponownie'
  | 'odczytaj-wyniki';

/**
 * Sygnały wejściowe reguły — wyłącznie odwzorowanie pól kontraktu backendu.
 * Świadomie prymitywne: adapter mapuje store'y na te pola, a reguła pozostaje
 * czystą funkcją testowalną bez Reacta.
 */
export interface SygnalyProcesu {
  /** Czy odpowiedź operacji domenowej niesie model (snapshot) — projekt otwarty. */
  projektOtwarty: boolean;
  /**
   * Czy gotowość została W OGÓLE policzona (`czyGotowoscUstalona` adaptera
   * gotowości). Fałsz znaczy „nie wiadomo", a nie „brak braków" — bez tego
   * rozróżnienia pusta lista zgłoszeń kłamałaby po nieudanym odczycie.
   */
  gotowoscUstalona: boolean;
  /** Zgłoszenia gotowości (blokady i ostrzeżenia) w postaci wspólnej dla ui2. */
  problemy: readonly ProblemGotowosci[];
  /** Czy istnieje przebieg obliczeń o statusie zakończonym. */
  jestZakonczonyPrzebieg: boolean;
  /**
   * Aktualność wyników aktywnego przypadku obliczeniowego (`results_valid`).
   * `null` = przypadek nie ma wyników (`result_status` = brak) albo nie ma
   * aktywnego przypadku — brak danej NIE jest udawany wartością logiczną.
   */
  wynikiAktualne: boolean | null;
}

/** Wyznaczona akcja — dokładnie jedna, zawsze z klikalnym celem. */
export interface NastepnaAkcja {
  rodzaj: RodzajNastepnejAkcji;
  /** Etap osi E1–E8, na którym ta akcja się wykonuje. */
  etap: EtapId;
  /** Co zrobić — nagłówek akcji. */
  tytul: string;
  /** Dlaczego akurat to — zdanie wyprowadzone z kontraktu, nie z domysłu. */
  uzasadnienie: string;
  /** Etykieta przycisku. */
  etykietaAkcji: string;
  /** Przestrzeń docelowa nawigacji (dla akcji bez zgłoszenia gotowości). */
  przestrzen: SpaceId;
  /**
   * Zgłoszenie gotowości do naprawy — NIEPUSTE wyłącznie dla „usun-blokade".
   * Niesie `fixAction` i `elementRef`, więc akcja prowadzi do konkretnego
   * elementu, a nie do ogólnego ekranu.
   */
  problem: ProblemGotowosci | null;
}

/**
 * Porządek zgłoszeń gotowości — TOTALNY i deterministyczny, wyłącznie na
 * jawnych polach kontraktu:
 *   1. `priorytetKanoniczny` rosnąco (1 = najwyższy). Zgłoszenie BEZ priorytetu
 *      kanonicznego nie wyprzedza zgłoszenia, które kanon uszeregował — brak
 *      wpisu w kanonie nie jest podstawą do pierwszeństwa (i nie wolno go
 *      zastąpić domysłem UI).
 *   2. `code` rosnąco — porównanie kodowe (nie językowe), więc wynik nie zależy
 *      od ustawień lokalizacji przeglądarki.
 *   3. `elementRef` rosnąco; zgłoszenie bez elementu idzie po zgłoszeniach
 *      z elementem (akcja wskazująca konkretny element jest wykonalna wprost).
 * Zwraca liczbę ujemną, gdy `a` ma iść przed `b`.
 */
export function porownajProblemy(a: ProblemGotowosci, b: ProblemGotowosci): number {
  const priorytetA = a.priorytetKanoniczny ?? Number.MAX_SAFE_INTEGER;
  const priorytetB = b.priorytetKanoniczny ?? Number.MAX_SAFE_INTEGER;
  if (priorytetA !== priorytetB) return priorytetA - priorytetB;
  if (a.code !== b.code) return a.code < b.code ? -1 : 1;
  const elementA = a.elementRef ?? '￿';
  const elementB = b.elementRef ?? '￿';
  if (elementA !== elementB) return elementA < elementB ? -1 : 1;
  return 0;
}

/**
 * Blokada o najwyższym priorytecie wg `porownajProblemy`. `null`, gdy nie ma
 * żadnej blokady (ostrzeżenia świadomie pomijane — patrz nagłówek modułu).
 */
export function wybierzBlokadeDoNaprawy(
  problemy: readonly ProblemGotowosci[],
): ProblemGotowosci | null {
  const blokady = problemy.filter((problem) => problem.waga === 'BLOKADA');
  if (blokady.length === 0) return null;
  return [...blokady].sort(porownajProblemy)[0];
}

/**
 * Wyznacza DOKŁADNIE JEDNĄ następną najlepszą akcję. Funkcja jest całkowita:
 * dla każdego zestawu sygnałów zwraca akcję z klikalnym celem — nie istnieje
 * wejście, dla którego pulpit zostałby bez następnego kroku.
 */
export function wyznaczNastepnaAkcje(sygnaly: SygnalyProcesu): NastepnaAkcja {
  // R1 — bez modelu nie ma o czym decydować.
  if (!sygnaly.projektOtwarty) {
    return {
      rodzaj: 'otworz-projekt',
      etap: 'E1',
      tytul: PROCES_STRINGS.nbaOtworzProjektTytul,
      uzasadnienie: PROCES_STRINGS.nbaOtworzProjektOpis,
      etykietaAkcji: PROCES_STRINGS.nbaOtworzProjektAkcja,
      przestrzen: 'projekt',
      problem: null,
    };
  }

  // R2 — gotowości nikt nie policzył: „nie wiadomo" nie jest zieloną bramką.
  if (!sygnaly.gotowoscUstalona) {
    return {
      rodzaj: 'ustal-gotowosc',
      etap: 'E3',
      tytul: PROCES_STRINGS.nbaUstalGotowoscTytul,
      uzasadnienie: PROCES_STRINGS.nbaUstalGotowoscOpis,
      etykietaAkcji: PROCES_STRINGS.nbaUstalGotowoscAkcja,
      przestrzen: 'gotowosc',
      problem: null,
    };
  }

  // R3 — blokady gotowości zamykają drogę do obliczeń.
  const blokada = wybierzBlokadeDoNaprawy(sygnaly.problemy);
  if (blokada) {
    const pozostalo = sygnaly.problemy.filter((problem) => problem.waga === 'BLOKADA').length - 1;
    return {
      rodzaj: 'usun-blokade',
      etap: 'E3',
      tytul: blokada.opisPl,
      uzasadnienie: PROCES_STRINGS.nbaPozostaleBlokady(pozostalo),
      etykietaAkcji: PROCES_STRINGS.nbaUsunBlokadeAkcja,
      przestrzen: 'gotowosc',
      problem: blokada,
    };
  }

  // R4 — model gotowy, ale nic jeszcze nie policzone.
  if (!sygnaly.jestZakonczonyPrzebieg) {
    return {
      rodzaj: 'uruchom-obliczenia',
      etap: 'E4',
      tytul: PROCES_STRINGS.nbaUruchomObliczeniaTytul,
      uzasadnienie: PROCES_STRINGS.nbaUruchomObliczeniaOpis,
      etykietaAkcji: PROCES_STRINGS.nbaUruchomObliczeniaAkcja,
      przestrzen: 'obliczenia',
      problem: null,
    };
  }

  // R5 — wyniki jawnie nieaktualne (model zmieniony po obliczeniu).
  if (sygnaly.wynikiAktualne === false) {
    return {
      rodzaj: 'przelicz-ponownie',
      etap: 'E4',
      tytul: PROCES_STRINGS.nbaPrzeliczPonownieTytul,
      uzasadnienie: PROCES_STRINGS.nbaPrzeliczPonownieOpis,
      etykietaAkcji: PROCES_STRINGS.nbaPrzeliczPonownieAkcja,
      przestrzen: 'obliczenia',
      problem: null,
    };
  }

  // R6 — jest co czytać.
  return {
    rodzaj: 'odczytaj-wyniki',
    etap: 'E5',
    tytul: PROCES_STRINGS.nbaPrzejdzDoWynikowTytul,
    uzasadnienie: PROCES_STRINGS.nbaPrzejdzDoWynikowOpis,
    etykietaAkcji: PROCES_STRINGS.nbaPrzejdzDoWynikowAkcja,
    przestrzen: 'wyniki',
    problem: null,
  };
}
