/**
 * Prowadzenie projektanta w kreatorze — JEDEN mechanizm ramy dla wszystkich kreatorów
 * (kontrakt `docs/domain/KONTRAKT_PROWADZENIA_PROJEKTANTA.md`, dyrektywa właściciela
 * 2026-10-15: „aplikacja myśli jak doświadczony projektant SN, a nie jak walidator
 * formularzy”).
 *
 * Klasy sygnałów, które obsługuje rama:
 *  - KONFIGURACJA_W_TOKU — NIGDY jako ostrzeżenie: kreator w trakcie pracy milczy
 *    (panel kontroli neutralny, stopka pusta, zapis nie jest wyszarzany z powodu braków).
 *  - BRAK_DO_OPERACJI — dopiero przy próbie zapisu: `useProwadzenie().wskaz(brak)` przenosi
 *    do kroku pierwszego brakującego parametru, ustawia na nim fokus i pokazuje JEDNO
 *    konkretne wskazanie (co, po co). Nigdy ogólne „uzupełnij dane”.
 *  - AUTO_PRZYJETE — wartość dobrana z jednoznacznego źródła (topologia, jedyna zgodna
 *    pozycja katalogu, szablon producenta, dane wybranej pozycji katalogowej) trafia do pola
 *    jak zwykła, edytowalna wartość — BEZ etykiety pochodzenia (dyrektywa właściciela
 *    2026-10-15: narzędzie projektowe, nie ewidencja dowodów; pochodzenie to dana modelu
 *    w zapleczu). Kreator pamięta tylko, które pola projektant zmienił
 *    (`useDecyzjeProjektanta`), żeby automat ich nie nadpisywał.
 *  - KONFLIKT_TECHNICZNY / NARUSZENIE_OGRANICZENIA — kreator pokazuje je od razu przy polu
 *    (`blad` pola), w panelu kontroli stanem `konflikt`; to jedyne sygnały czerwone.
 *
 * ZERO fizyki — same kontrakty prezentacji i stan wskazania.
 */

import { useCallback, useEffect, useState } from 'react';

/**
 * BRAK_DO_OPERACJI — jeden konkretny parametr, którego brak blokuje zapis.
 *
 * `komunikat` to jedno zdanie „co i po co”, np. „Wybierz transformator z katalogu — bez
 * tabliczki nie da się policzyć rozpływu ani zwarć.”. `pole` to `data-testid` kontrolki,
 * która dostaje fokus (brak = parametr spoza formularza, np. brak wskazania na schemacie).
 * `krok` to krok kreatora, na którym leży kontrolka (kreatory bez paska kroków go pomijają).
 */
export interface BrakDoOperacji {
  readonly komunikat: string;
  readonly pole?: string;
  readonly krok?: string;
}

/** Kandydat listy braków: `null`/`false`/`undefined` = parametr podany. */
export type KandydatBraku = BrakDoOperacji | null | false | undefined;

/**
 * Pierwszy brak z UPORZĄDKOWANEJ listy kandydatów (kolejność = kolejność pracy projektanta
 * w kreatorze). `null` = komplet dla operacji.
 */
export function pierwszyBrak(kandydaci: readonly KandydatBraku[]): BrakDoOperacji | null {
  for (const kandydat of kandydaci) {
    if (kandydat) return kandydat;
  }
  return null;
}

/** Miejsce pola formularza w kreatorze: krok i `data-testid` kontrolki. */
export interface MiejscePola {
  readonly krok?: string;
  readonly pole?: string;
}

/**
 * Wskazanie z błędu/braku modelu kreatora (`{ field, message }`) — mapa `miejsca` tłumaczy
 * klucz pola modelu na krok i kontrolkę (modele kreatorów nie znają prezentacji).
 */
export function wskazanieZBledu(
  blad: { readonly field: string; readonly message: string },
  miejsca: Readonly<Record<string, MiejscePola>>,
): BrakDoOperacji {
  const miejsce = miejsca[blad.field] ?? {};
  return { komunikat: blad.message, pole: miejsce.pole, krok: miejsce.krok };
}

/**
 * Powód, dla którego rama wyszarza przycisk zapisu — ZAMKNIĘTA lista. Brak danych NIE jest
 * powodem (to `BRAK_DO_OPERACJI` przy kliknięciu); wyszarzenie dopuszczają wyłącznie:
 *  - `ladowanie` — katalog jeszcze się wczytuje (wybór pozycji nie jest możliwy),
 *  - `zapis_w_toku` — operacja zapisu właśnie trwa (podwójny klik nie zdubluje elementu).
 * Typ pilnuje tego w kompilacji, strażnik `kreatory_prowadzenie_guard.py` — w tekście.
 */
export type BlokadaZapisu = 'ladowanie' | 'zapis_w_toku';

/**
 * Jedyny element listy spełniający ograniczenia — źródło jednoznaczne dla AUTO_PRZYJETE.
 * Zero albo więcej niż jeden zgodny element = `null` (wybór należy do projektanta; kreator
 * pokazuje listę, nie zgaduje pierwszej pozycji).
 */
export function jedynaZgodna<T>(lista: readonly T[], zgodna: (element: T) => boolean = () => true): T | null {
  let znaleziony: T | null = null;
  for (const element of lista) {
    if (!zgodna(element)) continue;
    if (znaleziony !== null) return null;
    znaleziony = element;
  }
  return znaleziony;
}

/** Stan wskazania braku kreatora — podłączany do ramy przez `propsRamy`. */
export interface Prowadzenie {
  readonly wskazanie: BrakDoOperacji | null;
  /** Pokaż wskazanie: przejdź do kroku parametru, ustaw fokus, pokaż jedno zdanie. */
  readonly wskaz: (brak: BrakDoOperacji) => void;
  /** Zdejmij wskazanie (np. przed udanym zapisem). */
  readonly zgas: () => void;
  /** Właściwości ramy: `<KreatorRama {...prowadzenie.propsRamy} />`. */
  readonly propsRamy: {
    readonly wskazanie: BrakDoOperacji | null;
    readonly onZgasWskazanie: () => void;
  };
}

/**
 * Wskazanie BRAKU_DO_OPERACJI. `ustawKrok` — setter kroku kreatora (kreatory bez kroków
 * pomijają). Każde wywołanie `wskaz` tworzy nowy obiekt, więc ponowny klik „Zapisz” przy
 * tym samym braku ponownie ustawia fokus na polu.
 */
export function useProwadzenie(ustawKrok?: (krok: string) => void): Prowadzenie {
  const [wskazanie, setWskazanie] = useState<BrakDoOperacji | null>(null);
  const wskaz = useCallback(
    (brak: BrakDoOperacji) => {
      if (brak.krok && ustawKrok) ustawKrok(brak.krok);
      setWskazanie({ ...brak });
    },
    [ustawKrok],
  );
  const zgas = useCallback(() => setWskazanie(null), []);
  return {
    wskazanie,
    wskaz,
    zgas,
    propsRamy: { wskazanie, onZgasWskazanie: zgas },
  };
}

/**
 * Wskazanie żyje tylko, dopóki wskazany brak istnieje. Zmiana WSKAZANEJ kontrolki gasi je
 * w ramie; brak bez kontrolki (np. brakujące pola toru, dodawane przyciskiem) gasi ten
 * strażnik, gdy bieżąca lista braków już go nie zawiera — zdanie o rozwiązanym braku nie
 * wisi w stopce. Lista braków to TA SAMA lista, z której zapis bierze wskazanie (jedno
 * źródło predykatu wejścia i wyjścia).
 */
export function useAktualnoscWskazania(
  prowadzenie: Pick<Prowadzenie, 'wskazanie' | 'zgas'>,
  biezaceBraki: readonly BrakDoOperacji[],
): void {
  const { wskazanie, zgas } = prowadzenie;
  useEffect(() => {
    if (wskazanie && !biezaceBraki.some((b) => b.komunikat === wskazanie.komunikat)) zgas();
  }, [biezaceBraki, wskazanie, zgas]);
}

/** Pola, o których projektant już zdecydował — automat ich nie nadpisuje. */
export interface DecyzjeProjektanta<K extends string> {
  /** Edycja pola przez projektanta: od teraz to jego decyzja. */
  readonly edytowane: (pole: K) => void;
  /** Czy projektant już zdecydował o polu (wtedy kreator NIE nadpisuje go automatem). */
  readonly decyzjaProjektanta: (pole: K) => boolean;
}

/**
 * Rejestr decyzji projektanta. Wartość dobrana automatycznie (AUTO_PRZYJETE) stoi w polu jak
 * każda inna; po edycji pola (`edytowane`) automat już jej nie zmienia — świadomy wybór
 * projektanta ma pierwszeństwo.
 */
export function useDecyzjeProjektanta<K extends string>(): DecyzjeProjektanta<K> {
  const [decyzje, setDecyzje] = useState<ReadonlySet<K>>(() => new Set<K>());
  const edytowane = useCallback((pole: K) => {
    setDecyzje((poprzednie) => {
      if (poprzednie.has(pole)) return poprzednie;
      const kopia = new Set(poprzednie);
      kopia.add(pole);
      return kopia;
    });
  }, []);
  const decyzjaProjektanta = useCallback((pole: K) => decyzje.has(pole), [decyzje]);
  return { edytowane, decyzjaProjektanta };
}
