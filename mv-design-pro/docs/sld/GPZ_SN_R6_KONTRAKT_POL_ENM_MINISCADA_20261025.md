# MV-DESIGN PRO — GPZ SN R6: kontrakt kanonicznego pola i odbiór eksploatacyjny

**Rewizja:** R6 / 2026-10-25 · **B-02: ODRZUCONE** · **Status:** DO OCENY, niezatwierdzone do eksploatacji ani obliczeń LF/SC.

## 1. Źródła podstawowe i rozgraniczenie odpowiedzialności

- ENEA Operator, *Stacje elektroenergetyczne 110 kV, Zeszyt 1: Stacje dwutransformatorowe 110 kV/SN* (obowiązuje od 02.04.2024): rys. Z.2, Z.7, Z.10–Z.12, Z.17 i rozdział 13.
  Oficjalny PDF: https://www.operator.enea.pl/media/675/stacje-elektroenergetyczne-110-kv-zeszyt-1-stacje-dwutransformatorowe-110-kvsn-obowiazuje
- Elektrometal Energetyka: e²TANGO-miniSCADA i e²TANGO SN. Wyłącznie wzorzec oddzielenia torów pierwotnych, synoptyki, powiązań funkcjonalnych i inspektora; NIE odtwarzać modułu sterowania rzeczywistymi aparatami.
  https://elektrometal-energetyka.pl/system-miniscada-2/
- Zewnętrzna granica 110 kV jest odpowiednikiem źródła; nie projektować szczegółowo pola 110 kV.
- `frontend/src/types/enm.ts` oraz `backend/src/enm/models.py`: JEDYNY kanon pola i urządzeń; nie kopiować modelu do pliku prototypowego.
- `backend/src/enm/interlock_rules.py`: JEDEN istniejący silnik predykatów blokad pola. Nie powielać go w React. Należy rozszerzać walidację topologiczną centralnie w backendzie, z oddzielną oceną bezpieczeństwa eksploatacyjnego.
- `frontend/src/ui/sld/v3/cad/CadSymbol.tsx`, `cadSymbolRegistry.ts`: istniejący renderer rzeczywistej geometrii CAD. Zweryfikowane źródła QET w PR #499, nakładka dwukolorowa w PR #500.

## 2. Co jest implementowane w tej gałęzi

`frontend/src/ui/field/bayPrimaryComposition.ts` — czysty bezstanowy adapter `BayBaseModel.primary_devices`:
- zachowuje źródłową listę/porządek aparatów; nie dopisuje CT/VT/wyłącznika „z szablonu”;
- oddziela dwupunktowy tor pierwotny (CT, wyłącznik, DS, rozłącznik) od odgałęzień;
- VT i ES NIE mogą zostać ustawione szeregowo w głównym torze, także przez pomyłkę w `placement`;
- brak state, `awaria`, `nieznany` nie nadaje żadnej trzeciej ramki;
- przy braku portów odgałęzienia NIE rysuje połączenia uziemnika/VT, zgłasza błąd gotowości;
- nie wymyśla głowicy, ogranicznika ani innego symbolu, gdy rejestr nie posiada geometrii;
- dla pola transformatora ustawia szyny poniżej toru; dla liniowego u góry;
- sprzęgło wymaga jawnej identyfikacji dwóch stron `LEFT` i `RIGHT` oraz sekcji w ENM (samotny „łącznik na szynach” odrzucony).

`frontend/src/ui/field/BayWindowSchematic.tsx` — **zastępuje** dotychczasowy rysunek z fikcyjnych kół i wypełnionych prostokątów:
- oryginalne CAD z `CadSymbol`, bez bitmap i bez nowego renderera;
- zielone `#2CCF93` / czerwone `#F05260` dyskretnie wyłącznie na aparatach łączeniowych;
- przewody prowadzone do zacisków istniejących symboli CAD, nie przez środek wypełnionych ikonek;
- osobna kolumna urządzeń bocznych, bez pozornego toru elektrycznego dla niepotwierdzonego połączenia;
- problemy źródła ENM jawnie w sekcji „Niekompletne dane aparatury i połączeń”;
- brak interakcji wykonującej operację. Inspektor jest **TYLKO DO ODCZYTU**.

`frontend/src/ui/field/__tests__/bayPrimaryComposition.test.ts` — 10 testów kontraktu (wejścia jednostkowe, wymagają uruchomienia w CI).

**WAŻNE:** to poprawka produkcyjnego widoku szczegółowego pola w gałęzi DRAFT. Nie zamienia ona całej projekcji GPZ w `SldCanvasV3`; przeniesienie kompozycji do wspólnej warstwy `v3/compose/gpz.ts` i faktycznych portów ENM wymaga dalszej pracy.

## 3. Stan prototypu referencyjnego

Osobny prototyp do oceny `MV_DESIGN_PRO_GPZ_SN_R6_KONTRAKTY_POL_I_SPRZEGLO.html` ma sprzęgło jako dwie cele A/B, wyłącznik QF-S, odłączniki QS-A/QS-B i odrębne uziemniki wydzielonych członów sprzęgła. To nie jest wdrożenie produkcyjne ani elektroniczna instrukcja ruchowa.

Próby w lokalnym Chromium na samodzielnym HTML (2026-10-25): **19/19 PASS** — aparatów 29, CT=7, właściwe VT=2, gniazda VT=6, przełączanie i blokady modelu, kolory, brak kolizji ramek, brak błędów JS. Metoda: Playwright `page.set_content()`, ponieważ nawigację `file://` i `localhost` blokuje środowisko. Jest to wyłącznie pozytywny wynik dla sprawdzonego prototypu, a NIE gotowość operacyjna i NIE wynik CI repo.

## 4. Dodatkowe P0 — warunki rzeczywistego końca do końca

1. Schematy ENEA Z.2, Z.7, Z.10–Z.12, Z.17 porównać **per pole/aparat** z konkretnymi rodzinami OEM i wskazanymi portami. Nie wywodzić całego pola z samego symbolu QF.
2. Model ENM musi nieść **osobno** funkcjonalne porty główne, zaciski przyłączeniowe gałęzi VT i uziemników oraz węzły sprzęgła A/B. `linked_ref` nie może zastąpić `port_id`, bo może oznaczać związki pomiarowe lub EAZ.
3. Kompozycja: kolejność aparatów, transformator nad szynami, CT na pierwotnym, VT tylko odgałęzienie; wyświetlić miejsce sterownika polowego i linie sygnałowe na ODŁĄCZALNEJ warstwie, nie jako przewody SN.
4. Uziemnik: rozpoznawalny styk i połączenie do ziemi oraz jawny odcinek podlegający uziemieniu, stan toru przy aparacie, źródła zwrotne i blokady w backendzie.
5. Sprzęgło: dwie rzeczywiste celki A/B jednego elektrycznego przejścia, bez domyślnego skrótu „wyłącznik w szynie”.
6. Wersjonowanie ENM/scenariusza, symulowana zmiana → ponowna analiza wysp → LF/SC → atomowy wynik K-S2 → widok SN i inspektor. Żadnego oznaczania starych wyników jako nowych.
7. Testy przeciwne: inna kolejność załączeń, odłącznik przy zamkniętym wyłączniku, źródła zwrotne, uziemnik i blokady, błąd aparatu, brak portu, rozbieżny stan biegunów i brak telemetrii.
8. Odbiór przez eksploatację, ruch, EAZ i właściciela. Bez realnego sprawdzenia dokumentacji konkretnego rozwiązania wykluczyć dopuszczenie do sterowania rzeczywistego.

## 5. Stan zatwierdzenia

Koncepcja dwóch ramek QET-SCADA: zaakceptowana właścicielsko. Kompozycja pól GPZ: **DO POPRAWY/ODBIORU**. Normatywna geometria wariantów zamkniętych QET i uziemników: niezatwierdzona.

**B-02 POZOSTAJE ODRZUCONE. Nie scalać.**
