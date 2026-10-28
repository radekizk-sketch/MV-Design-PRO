# Przekazanie właściciela — przebudowa schematu rozdzielni SN 15 kV GPZ (2026-10-28)

Status: **WIĄŻĄCE** dla karty UX-04 i jej podkart w `PLANS.md` część A §C.1. Treść sekcji 1–5
pochodzi od właściciela (przekazanie dla wątku Opus 5.5) i nie jest redagowana merytorycznie.
Sekcja 6 przypisuje ją do kart planu. Status, priorytet i następna czynność są wyłącznie
w `PLANS.md` §C.

## 1. Ustalenia właścicielskie

- R5 odrzucone jako rozwiązanie docelowe. Nie kontynuować kosmetycznego przesuwania symboli.
  Przebudować kompozycję pól od podstaw.
- Podstawa: standardy ENEA Operator, szczególnie rysunki Z.2, Z.7, Z.10–Z.12 i Z.17, oraz
  dokumentacja producentów aparatury.
- Wzorzec czytelności i organizacji: Elektrometal e²TANGO-miniSCADA.
- Symbole: oryginalna stylistyka QElectroTech, bez własnych przypadkowych piktogramów.
- SCADA: wyłącznie dwie ramki — czerwona `#F05260` = zamknięty, zielona `#2CCF93` = otwarty.
  Ramka obejmuje cały symbol, bez kolizji.
- Nie generować obrazów. Dostarczać rzeczywisty, interaktywny schemat SVG/React.

## 2. Architektura pól SN

- Pola transformatorowe T1/T2 nad szynami SN, z prawidłową kolejnością aparatów.
- Pola liniowe jako kompletne, powtarzalne moduły: łączniki, CT, uziemniki, zakończenia
  kablowe i połączenia.
- CT w torze pierwotnym; VT na odgałęzieniu pomiarowym. Nie mylić pola pomiaru napięcia
  z gniazdem VT lub wskaźnikiem obecności napięcia.
- Oddzielne pola pomiaru napięcia według Z.17 — po jednym na sekcję.
- Sprzęgło dwucelkowe: pole łącznika szyn + pole wzniosu, jeden ciągły tor między sekcjami A/B.
- Uziemniki wymagają przebudowy zgodnie z funkcją i konstrukcją aparatury, a nie tylko zmiany
  symbolu ziemi.
- Strona 110 kV wyłącznie jako niezbędna granica modelu.

## 3. Logika inżynierska — P0

- Każda operacja musi być walidowana na całej topologii wynikowej, niezależnie od sekwencji
  przełączeń.
- Blokować niedozwolone operacje odłącznikami, załączenie na uziemiony tor i nieuprawnione
  połączenie równoległe transformatorów.
- Uwzględnić możliwość zasilania zwrotnego, wyspy, blokady i nieaktualne wyniki.
- Kliknięcie aparatu oznacza wybór; przełączenie odbywa się osobno.
- Zachować jeden kanoniczny model ENM, `SldCanvasV3`, istniejący renderer CAD/QET, obliczenia
  LF/SC i kontrakt K-S2.

## 4. Kluczowa decyzja projektowa

Nie projektujemy schematu przez rozmieszczanie pojedynczych symboli. Obowiązująca kolejność:

Standard ENEA → typ pola → sekwencja aparatów i porty → geometria QET → połączenia →
automatyczny układ → SCADA → walidacja.

Najpierw wykonać i zweryfikować jedno kompletne pole liniowe SN jako wzorzec kanoniczny.
Następnie analogicznie opracować pola transformatorowe, pomiarowe, sprzęgło i całą rozdzielnię.

## 5. Zadanie dla wątku Opus

Kontynuować realizację end-to-end na podstawie powyższych decyzji. Zweryfikować stan
repozytorium i istniejących PR #499/#500, wykorzystać zatwierdzone elementy, usunąć błędne
rozwiązania i przygotować kompletny schemat do odbioru właścicielskiego.

Wymagane: prawidłowa topologia, zgodność funkcjonalna z ENEA, brak kolizji, testy operacji
łączeniowych, dowody działania oraz raport rozbieżności.

Nie deklarować zgodności normowej ani odbioru eksploatacyjnego bez dowodów. **Nie scalać bez
zgody właściciela. B-02 POZOSTAJE ODRZUCONE.**

## 6. Przypisanie do kart planu i materiał wejściowy

| Ustalenie | Karta w `PLANS.md` §C.1 | Materiał wejściowy (praca GPT, niescalona) |
|---|---|---|
| §1, §2 pole liniowe, §4 wzorzec | UX-04/POLE-LINIOWE-WZORZEC | PR #499 (import QET, atlas SVG), PR #500 (73 symbole, ramka SCADA, odbiór z checkboxami), PR #502 (pola ENM, CT/VT/ES, `CadSymbol`) |
| §2 pola T1/T2, pomiar Z.17, sprzęgło, granica 110 kV | UX-04/POLA-TR-POMIAR-SPRZEGLO | PR #502; materiał aparatury na gałęzi UI/UX (GPZ-H5-APARATURA) |
| §3 logika łączeniowa | UX-04/LOGIKA-LACZENIOWA | PR #504 (stany łączników z rekordu ENM, tor prądu) |
| uziemniki wg funkcji i konstrukcji | UX-04/POLE-LINIOWE-WZORZEC, następnie wszystkie typy pól | PR #502 |
| podstawa ENEA Z.2, Z.7, Z.10–Z.12, Z.17 | UX-04 (bloker rysunków) | PR #493 (25 standardów, OCR), PR #486 (biblioteka ENEA/Dołęga) — do sprawdzenia, czy zawierają te rysunki |

Praca GPT z tych PR jest materiałem, nie rozwiązaniem: elementy zgodne z sekcjami 1–4 wciąga
się kartami na gałąź wątku UI/UX, elementy sprzeczne (w tym kompozycja R5) usuwa się z jawnym
zapisem w raporcie rozbieżności. PR #498 (ODRZUCONE 1/10) pozostaje wyłącznie materiałem
dowodowym.
