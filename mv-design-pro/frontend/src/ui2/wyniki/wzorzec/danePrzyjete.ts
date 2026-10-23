/**
 * Para danych przyjętych wyniku — lustro płaskich pól odpowiedzi analiz
 * (`enm/dane_przyjete_galezi.py::pola_danych_przyjetych_biegu/_wiersza`).
 */
import type { StanDanych, DanaPrzyjeta, StatusDowodu } from './werdykt';

/**
 * Para danych przyjętych WYNIKU (kontrakt werdyktu §3, ZASADA NR 4 pkt 4) — pola addytywne
 * odpowiedzi analizy, wiersza tabeli albo pozycji widoku, który stoi na wartości roboczej:
 * `status_danych` (płasko, kod `StanDanych`) i `dane_przyjete` (rekordy `DanaPrzyjeta`).
 * Backend wysyła obie WYŁĄCZNIE, gdy lista jest niepusta (np.
 * `enm/dane_przyjete_galezi.py::pola_danych_przyjetych_biegu`); wynik na danych projektu nie
 * niesie żadnej. Każdy ekran czyta parę tym typem i pokazuje ją `StanDanychWyniku`.
 *
 * Para nie jest klasą `werdykt.kontrakt` (płaskie pola słownika odpowiedzi, nie model), więc
 * stoi poza lustrem `werdykt.ts`; zbiór jej pól przypina
 * `backend/tests/uczciwosc/test_parytet_pary_danych_przyjetych_fe.py`.
 */
export interface ParaDanychPrzyjetych {
  readonly status_danych?: StanDanych;
  readonly dane_przyjete?: readonly DanaPrzyjeta[];
}

/**
 * Para danych przyjętych DOWODU rekordu werdyktu (`StatusDowodu.status_danych`) w kształcie
 * pary wyniku — ten sam zapis `StanDanychWyniku` dla rekordu i dla odpowiedzi analizy.
 * Czysta zmiana kształtu (zero logiki): stan i lista 1:1 z rekordu.
 */
export function paraDanychDowodu(dowod: StatusDowodu): ParaDanychPrzyjetych {
  return {
    status_danych: dowod.status_danych.stan,
    dane_przyjete: dowod.status_danych.dane_przyjete,
  };
}
