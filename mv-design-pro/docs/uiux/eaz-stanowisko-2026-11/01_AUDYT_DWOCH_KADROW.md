# Audyt konkretnego ekranu: 1440×900 jasny / 1280×720 ciemny

**Status:** obserwacje z dwóch zrzutów użytkownika, nie twierdzenie o wszystkich stanach aplikacji. Przy nowych wersjach wykonawca aktualizuje dowody.

| ID | Miejsce na ekranie | Ustalenie | Konkretna zmiana i warunek |
|---|---|---|---|
| SCR-01 P0 | Lista rozwijana nad TCC | „Zwarcie 3F maksymalne” przy statusie dolnym „Zwarcia: 2F” | Związać wybrany przypadek z typem, ID, rewizją i obliczeniem. Gdy dolny pasek dotyczy innego uruchomienia, jawnie pokazać „Wykres: 3F / globalny aktywny bieg: 2F”, z przejściem do odpowiedniego biegu; NIE podszywać danych 2F pod 3F. |
| SCR-02 P0 | Pod wykresem, zielony komunikat | „Odstęp czasowy spełniony” wynika z jednego zwarcia; brak zbiorczej oceny zakresu | Dwa osobne statusy: `Ocena wskazanego zwarcia` i `Ocena zakresu koordynacji`. Pierwszy pokazuje 0,100/0,400 s, Δt=0,300 s, wymagane 0,200 s, zapas 0,100 s; drugi bez przeanalizowanych scenariuszy = „Nie oceniono pozostałych przypadków” z akcją. |
| SCR-03 P0 | 1280×720 | Wynik `Δt` pod wykresem poza wysokością kadru, dolne sterowanie nastaw poza widokiem | Zwięzły stały pasek wyników BEZPOŚREDNIO nad TCC: t_podrz., t_nadrz., Δt, wymagany Δt, zapas oraz punkt i rodzaj zwarcia; szczegóły poniżej przewijane. |
| SCR-04 P0 | Pionowa linia „I oceny = Ik,max” | Jedna linia sugeruje jeden prąd dla CT po obu stronach | Marker `I_CT,p`, `I_CT,n` i `I_k''` (tylko jeśli potrzebne), każda liczba osobno z ID CT/gałęzi; przy identycznym położeniu łączyć znaczniki z etykietą „prądy równe” dopiero po dowodzie. |
| SCR-05 P0 | Edycja nastaw i „Zapisz nastawy” | Pomarańczowe „Nastawy robocze”, ale brak czytelnej informacji, czy ocena dotyczy wersji zapisanej czy edytowanej | Stany `Zapisane` → `Zmienione roboczo` → `Ocena robocza` / `Ocena zapisana`; po zmianie nie podawać dawnej zielonej oceny jako bieżącej. |
| SCR-06 P0 | „Porównaj z” | Sam wybór pola nie wykazuje nadrzędności i ochrony na danej drodze | Po wyborze pary tekst `Podrzędne: ... / Nadrzędne: ...` + właściwe CT, wyłączniki, relacja elektryczna; bez drogi zasilania — konkretna odmowa oceny pary. |
| SCR-07 P0 | Czasy t=0,100 s oraz 0,400 s | Brak rozróżnienia czasu przekaźnika i czasu całkowitego wyłączenia | Dodać `t funkcji`, `t wyłącznika`, `t całkowity`, a także tolerancje i pochodzenie wymaganego zapasu; nie traktować 0,200 s jako uniwersalnej stałej IEC. |
| SCR-08 P0 | Znacznik `Ik,min` | Brak rzeczywistego testu czułości 50 i 51 na końcu chronionej strefy | Testy z (I_{CT,min}) i progiem konkretnego stopnia, osobno pobudzenie, czas, dopuszczalność i właściwa topologia. |
| SCR-09 P1 | CT 600/5 A 5P20, nastawy 180/1800 A | Podstawowe liczby widoczne, ale brak drugiego CT i obwodów wtórnych | Obie strony z przekładnią, rdzeniem, obciążeniem, stroną pierwotną/wtórną: 180 A pierw. = 1,5 A wt.; 1800 A = 15 A wt. (dla CT 600/5). |
| SCR-10 P1 | Oś TCC 10–10 000 A | Obciążenie (I_{obc}=11,11) A jest przy lewej krawędzi daleko od krzywych | `Dopasuj do nastaw`, `Pokaż pełny zakres` i znacznik obciążenia poza kadrem z rzeczywistą liczbą. |
| SCR-11 P1 | Lewy wykaz pól | Szary punkt, turkusowe zaznaczenie i wykrzykniki bez legendy | Trzy odmienne semantyki: wybrany, do oceny, naruszenie. Żaden wykrzyknik dekoracyjny. |
| SCR-12 P1 | Nazwy i legenda | Pełne zagnieżdżone nazwy są długie, brakuje orientacji pary | `Pole SN 2 · Stacja S1` i `Pole GPZ 1.1` w legendzie; pełna nazwa i ID w inspektorze/naprowadzeniu. |
| SCR-13 P1 | Prawy panel dolny | Porównanie zajmuje dolną część, ucięte na 1280×720 | Przewijanie bocznych paneli niezależnie, wiersz bieżącej grupy nastaw i zapis zawsze osiągalne, szerokości ograniczone. |
| SCR-14 P1 | „Wymagane parametry kompletne” | Ogólny komunikat nie wyjaśnia gotowości | `Sprawdzono: zakres nastaw, CT, przekaźnik, przypisanie Q0, dane zwarciowe`; dla braku: kod, obiekt, wymagana czynność. |
| SCR-15 P1 | Motywy | Jasny 1440 vs ciemny 1280 — nie da się oddzielić wpływu motywu od wymiaru | 4 porównywalne kadry (oba motywy × oba rozmiary), spójne pozycje osi, punktów, alarmów. |
| SCR-16 P1 | TCC log-log | Linie zagięcia 50/51 są czytelne, ale źle scharakteryzowane punkty graniczne mogą mylić | Oznaczyć aktywny stopień 50/51, punkt przełączenia najszybszego stopnia, przecięcie krzywych i obszar ważności (I_{min}…I_{max}) bez wymyślonej ciągłej krzywej w miejscu nieciągłości. |

**Akceptacja:** trzy kolumny (wykaz → TCC → nastawy), dwie krzywe turkus/fiolet, układ dolnej interpretacji, polskie nazewnictwo oraz rzeczywiste dane backendowe ZACHOWAĆ. Rozbudowa ma usunąć braki i dodać prawdziwą analizę, nie zastąpić ekran osobnym panelem administracyjnym.
