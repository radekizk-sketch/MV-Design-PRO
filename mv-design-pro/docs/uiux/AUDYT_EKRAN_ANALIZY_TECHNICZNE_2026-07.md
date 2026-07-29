# AUDYT EKSPERCKI — ekran „Analizy techniczne" (hub mostu E-35) · 2026-07-18

**Zleceniodawca:** właściciel (zrzut z iPhone, dyrektywa: „zaprojektować od zera,
nieczytelny i nieintuicyjny, kolory z różnych palet, raz okrągłe raz ostre,
inżyniersko nic nie wiadomo po co, z czego i jak") · **Wykonanie audytu i
przebudowy:** zarządca (Fable) osobiście — zadanie „maksymalnie jakościowe".
**Przedmiot:** domyślny widok zakładki „Pozostałe analizy" warsztatu wyników =
legacy `AnalysisSurface` (E-35, `WorkspaceSurfaceRouter.tsx`) renderowany przez
most w nowej powłoce.

## 1. Ustalenia audytu (pięć soczewek)

**A. Architektura informacji / model mentalny**
1. Ekran nie deklaruje celu — brak jednego zdania „po co tu jestem".
2. „Kontekst analityczny" to płaski zrzut sześciu pól kontraktu bez hierarchii:
   miesza tożsamość pracy (projekt/wariant/wersja) z technikaliami widoku
   („Zakładka: Tabele wyników" — informacja bez wartości decyzyjnej).
3. „Przejścia analityczne" = 9 gołych przycisków bez wyjaśnienia, czym są,
   czego wymagają i co dadzą — nawigacja pamięciowa, nie informacyjna.
4. Sekcja „Wyniki / Tabele wyników per obiekt" dubluje zakładki „Rozpływ mocy"
   i „Zwarcia" nowej powłoki (audyt W5a: ui2 = superset).

**B. Język inżynierski**
5. Wartości pól nie odpowiadają na pytania inżyniera: „Aktywny projekt",
   „Aktywne obliczenie" (tautologie), „Skonfiguruj zakres" (CTA wklejone
   w pole wartości — myli warstwę danych z warstwą akcji).
6. Brak związku przyczynowego: nic nie mówi, że analizy CZYTAJĄ wyniki
   ZAKOŃCZONEGO przebiegu i czego brakuje, by były pełne.

**C. Spójność wizualna**
7. Trzy rodziny promieni na jednym ekranie (pill-przyciski ~999px, karty ~12px,
   tabela 0px) bez systemu; podwójne obramowania (karta w karcie w karcie).
8. Ekran żyje POZA tokenami powłoki (--mvd-*): to legacy Tailwind przepuszczony
   przez remap dark — stąd „kolory z różnych palet" i rozjazd przy zmianie
   motywu (zebra tabeli, wyblakłe etykiety mono o zaniżonym kontraście).

**D. Interakcja**
9. Stany braku („Nie wybrano wersji układu / obliczenia") są martwe — bez
   akcji naprawczej obok wartości.
10. Przyciski przejść nie sygnalizują wymagań wejściowych → wejścia „w ślepy
    zaułek" (panel kontraktu bez danych, bez wyjaśnienia dlaczego pusty).

**E. Spójność systemowa**
11. Jedyny ekran-hub w warsztacie wyników spoza clean-room ui2: nie korzysta
    z tokenów, konwencji etykiet (mvd-lbl), wzorca sekcji ani formatów PL.

## 2. Decyzje projektowe (nowy ekran `EkranAnalizTechnicznych`, ui2)

1. **Cel na górze:** tytuł + jedno zdanie inżynierskie o roli ekranu.
2. **„Tor pracy" zamiast zrzutu kontraktu:** cztery kroki łańcucha
   Projekt → Wariant pracy sieci → Wersja układu → Zakończone obliczenie;
   każdy krok = status (✓/brak), rzeczywista wartość (nazwa, rewizja+hash,
   typ+data przebiegu) i — przy braku — akcja naprawcza prowadząca do
   właściwej przestrzeni. Nota wyjaśnia zależność: analizy interpretują
   wyniki zakończonego przebiegu.
3. **Karty analiz zamiast gołych przycisków**, w trzech grupach dziedzinowych
   (Zabezpieczenia i zgodność · Rozpływ i stany sieci · Zwarcia i wytrzymałość);
   każda karta: nazwa, jedno zdanie „co robi", wiersz „Źródło danych: …",
   chip wymagań (np. „wymaga przebiegu zwarciowego" gdy brak DONE SC) i akcja
   „Otwórz". Karta zawsze działa (otwiera powierzchnię kontraktu) — chip
   uczciwie zapowiada zakres danych.
4. **Widoki klasyczne mostu** (porównanie A/B, ślad obliczeń, testy NC RfG)
   jako zwięzła lista łączy z adnotacją o nowych odpowiednikach w zakładkach
   warsztatu — parytet zdolności bez promowania duplikatów.
5. **System wizualny:** wyłącznie tokeny `--mvd-*` (oba motywy z automatu),
   jedna skala promieni (10 px sekcja / 8 px karta / 999 px chip statusu),
   etykiety mono w konwencji powłoki, siatka odstępów 4/8/12/16.
6. **Architektura:** `MostAnalizTechnicznych` = domyślny widok zakładki
   (gdy powierzchnią jest hub E-35/zakładka domyślna lub brak powierzchni);
   powierzchnie-dzieci (E-28…E-34, taby compare/trace/ncrfg) nadal renderuje
   `WorkspaceSurfaceRouter` z paskiem powrotu „← Analizy techniczne".
   Kanon nietknięty (E-35 pozostaje ekranem kanonicznym; zmiana dostawcy
   widoku domyślnego = metoda Opcja 1, jak E-26→EkranFrt).
