# Elektrometal e²TANGO — pełna rodzina / audyt źródeł i katalogów (31.10.2026)

**Status:** źródłowy indeks rodziny + addytywne typy kanoniczne SN, DO WERYFIKACJI CI.
**Gałąź zależna:** PR #516 → #517 → niniejszy PR. Wartości aktywnych nastaw i funkcji nie są deklarowane jako potwierdzone. **Brak zmian UX-04, B-01, B-02, IEC 60909 i solverów.**

## 1. Zakres i źródła: stan źródeł ≠ konfiguracja obiektu

**Źródło kontrolne zakresu 2026:** [Katalog Rozwiązania Elektrometal K-0.2.12, 04/2026](https://elektrometal-energetyka.pl/wp-content/uploads/2026/04/Katalog-Rozwiazania-0.2.12.pdf) — oficjalny wykaz jedenastu modeli SN/nN (50, 100, 150, 200, 250, 400, 450, 600, 800, 1000, 1200), rodzina 2000 WN oraz odmiany detektora 50. To źródło nadrzędne dla kompletności typoszeregu, ale nie dla konfiguracji każdej sztuki.

Wiodąca publiczna oferta producenta: https://elektrometal-energetyka.pl/sterowniki-polowe-e%C2%B2tango/ .
Osobny produkt e²TANGO-50 to **detektor zwarć**, nie zamiennik kompletnego przekaźnika EAZ.
Wersje e²TANGO-2000 są specjalizowanymi zespołami WN, a SZR/PPZ aplikacją automatyki opartą na platformie, nie nowym aparatem o jednym uniwersalnym SKU.

| Model / wariant | Rodzaj | Podstawa producenta | Dostęp w pickerze SN |
|---|---|---|---|
| 50, w tym CT/RC/RCx/RCU/RCUR/RCUx/RCUxR | detektor zwarć SN | [strona produktu](https://elektrometal-energetyka.pl/zespoly-zabezpieczen-e%C2%B2tango/detektor-zwarc-e%C2%B2tango-50/) + Katalog Rozwiązania 0.2.12 (04/2026), s. 69 | NIE — osobna kategoria |
| 100 | kompaktowe zabezpieczenie SN/nN | [strona 100/150](https://elektrometal-energetyka.pl/zespoly-zabezpieczen-e%C2%B2tango/zespoly-zabezpieczen-e%C2%B2tango-100/) | TAK, ręcznie |
| 150 (M/L/G/LG) | kompaktowe zabezpieczenie SN/nN | [K-40.1.8](https://elektrometal-energetyka.pl/wp-content/uploads/2025/08/karta-katalogowa-e2TANGO-150-K-40.1.8.pdf), s. 9 | TAK, ręcznie |
| 200 | wykonanie autonomiczne | [strona produktu](https://elektrometal-energetyka.pl/zespoly-zabezpieczen-e%C2%B2tango/zespol-zabezpieczen-e%C2%B2tango-200/) | TAK, projekt istniejący / ograniczenia producenta |
| 250 (S/U) | nowa generacja zabezpieczeń SN | [K-42.1.8](https://elektrometal-energetyka.pl/wp-content/uploads/2025/10/Karta-katalogowa-e2TANGO-250-K-42.1.8.pdf), s. 6–9 | TAK (#517) |
| 400 | poprzednia generacja | [komunikat producenta](https://elektrometal-energetyka.pl/nowa-generacja-e%C2%B2tango/) | TAK, dla modeli istniejących; osobno historyczny V0 |
| 450 | nowa generacja sterowników SN | [K-43.1.7](https://elektrometal-energetyka.pl/wp-content/uploads/2025/07/Karta-katalogowa-e2TANGO-450-K-43.1.7.pdf), s. 6–9 | TAK (#517) |
| 600/800/1000/1200 | sterowniki polowe SN | [K-3.2.21](https://elektrometal-energetyka.pl/wp-content/uploads/2025/05/Karta-katalogowa-e2TANGO-600-1200-K-3.2.21.pdf), s. 7–9 | TAK, ręcznie |
| 2000-ODL | WN, odległościowe | [strona produktu](https://elektrometal-energetyka.pl/zespol-zabezpieczen-wn-e%C2%B2tango-2000-odl-zabezpieczenie-odleglosciowe/) | NIE |
| 2000-TRR | WN, różnicowe transformatora | [strona produktu](https://elektrometal-energetyka.pl/zespol-zabezpieczen-wn-e%C2%B2tango-2000-trr-zabezpieczenie-roznicowe-transformatora/) | NIE |
| 2000-STP | WN, nadprądowe i ziemnozwarciowe | [strona produktu](https://elektrometal-energetyka.pl/zespol-zabezpieczen-wn-e%C2%B2tango-2000-stp-sterowniki-polowe/) | NIE |
| 2000-ARN | WN, regulator napięcia | [strona produktu](https://elektrometal-energetyka.pl/zespol-zabezpieczen-wn-e%C2%B2tango-2000-arn-automatyczny-regulator-napiecia/) | NIE |
| 2000-LRR | WN, różnicowe linii | [strona produktu](https://elektrometal-energetyka.pl/zespol-zabezpieczen-wn-e%C2%B2tango-2000-lrr-zabezpieczenie-roznicowe-linii/) | NIE |
| SZR/PPZ | automatyka stacyjna oparta na e²TANGO | [strona automatyki](https://elektrometal-energetyka.pl/rozwiazania-2/automatyka-e%C2%B2tango-szr/) | NIE — nie jest odrębnym przekaźnikiem |

Łącznie **17 pozycji w źródłowym indeksie wiedzy**: 11 urządzeń SN/nN (w tym detektor 50), 5 odmian WN i 1 aplikacja SZR/PPZ. Dodatkowe zestawy wykonań (np. 150-M, 250-U, 50-RC) są wariantami, nie 20 fikcyjnymi numerami SKU.

## 2. Rozróżnienia w danych elektrycznych

- **Typ producenta:** istnienie modelu, podstawowa rola, ekran, wariantowość, źródło i wydanie; nie implikuje aktywnych zabezpieczeń.
- **Instancja w polu:** kod zamówienia, wariant 250 S/U lub 150 M/L/G/LG, karty/sloty, wejścia CT/VT, przekładnie, wybór 1/5 A, uziemienia/połączenia U0, bieżące firmware, konfiguracja funkcji i grup nastaw.
- **Stan eksploatacyjny:** położenia łączników (z ENM), blokady i zadziałania; nie należy do rekordu modelu.
- **Wynik analizy:** aktywne i udokumentowane funkcje EAZ (np. 50/51, 67N, 87T), krzywa, próg, czas, grupa, wyzwalany wyłącznik i przyłączenie do toru pomiarowego; nie odtwarzać z nazwy urządzenia.
- **e²TANGO-250:** karta K-42.1.8 s. 7 rozróżnia **S = 4I+1U** i **U = 1I+4U**. Funkcje 50/51/67N oraz 79 są wskazane dla wykonania S, zaś 27/59/81 dla U. 59N pojawia się w obu. Nie traktować 250-U jako 250-S z dodatkowymi napięciami.
- **e²TANGO-450:** 4 wejścia prądowe, 1 napięciowe standardowo, rozszerzenie napięciowe opcjonalne (K-43.1.7 s. 6); 1/5 A wejścia PP (s. 9). Funkcje dokumentu stanowią możliwości modelu, nie aktywną listę instancji.
- **600–1200:** K-3.2.21 s. 8–9 publikuje jedną listę funkcji rodziny (np. 50, 51, 67N, 87T, 87L, 50BF), a nie formalny dowód, że każda fizyczna wersja posiada wszystkie funkcje. 600/800: ekran 6 cali; 1000/1200: ekran dotykowy 7 cali. **55 schematów synoptycznych ≠ 55 symboli IEC.**
- **87T dla modelu 800:** w `application/station_templates/_choices.py` szablon podpisany „e2TANGO-800 z 87T”, podczas gdy `devices_v0.json` nie deklaruje dla 800 funkcji 87T. Jest sprzeczność **wewnętrzna**; potwierdzenie realizacji z dokumentacji wykonawczej konkretnego zamówienia i konfiguracji CT jest niezbędne, zanim szablon otrzyma status poprawnego doboru.
- **Funkcje 21, 87BB w analitycznych profilach 1000/1200:** w K-3.2.21 brak jednoznacznego potwierdzenia tych konkretnych kodów dla danej odmiany. Nie oznacza to dowodu technicznej nieobecności; oznacza **brak podstawy w tym źródle** i potrzebę przypisania DTR, konfiguracji albo zmiany etykiety w bibliotece analitycznej.
- **Katalogowe granice nastaw:** w analitycznym `devices_v0.json` maksima dla serii 450, 600, 800 itd. przyjmują wartości skorelowane z numerem modelu. Bez jednoznacznej jednostki i źródła producenta NIE SĄ potwierdzonymi zakresami fizycznymi.
- **Certyfikaty:** wzmianka o certyfikacie Instytutu Energetyki nie stanowi certyfikatu NC RfG/PTPiREE danego obiektu, nie oznacza bezterminowej ważności i nie jest dowodem zgodności z technicznym standardem ENEA Operator.

## 3. Implementacja na gałęzi tej karty

- `backend/src/network_model/catalog/elektrometal_etango_family.py` — jawny indeks 17 pozycji, źródła, warianty, rozdział danych producenta od rzeczywistej konfiguracji, 8 nowych kanonicznych typów SN.
- `backend/src/network_model/catalog/mv_auxiliary_catalog.py` — addytywne podłączenie nowych typów; bez modyfikacji starych identyfikatorów V0 i bez nowego schematu danych.
- `backend/src/api/catalog.py`: `GET /api/catalog/elektrometal-etango-family` — komplet wiedzy, także detektor 50 i WN; `GET /api/catalog/mv-protection-device-types` — nadal tylko typy wybieralne w obszarze budowy SN.
- `backend/tests/network_model/catalog/test_etango_family_reference.py` i testy API/repo — 17 pozycji bez dubli ID, warianty i źródła, 10 realnych typów SN, detektor/WN poza `add_relay`, brak sztucznych amperów z nazwy, brak nastaw/aktywacji funkcji.

## 4. Granice aktualnego odbioru i ENEA

1. **Producent:** potwierdza produkt i opublikowane możliwości; nie potwierdza zastosowanej konfiguracji konkretnej stacji bez kodu zamówieniowego.
2. **ENEA Operator:** brak dowodu, że cała rodzina lub konfiguracje są obowiązkowymi wzorcami w dowolnym standardzie ENEA. Porównanie symboli SLD, geometrii, prawidłowości stanów i pól wg ENEA/H5/IEC 60617 pozostaje w UX-04 Opusa i bramce B-02.
3. **Współpraca z EAZ:** `analytical_library_ref=None` dla nowych pozycji do chwili potwierdzenia funkcji i jednostki nastaw; bibliotekę analityczną można wykorzystać do symulacji tylko ze świadomym oznaczeniem statusu danych i bez udawania DTR.
4. **Zakres programu:** GPZ WN modelować wyłącznie jako zasilanie SN, nie wybudowywać rozdzielnicy WN ani sterowania SCADA. Warianty 2000 do indeksu wiedzy, nie do pickera pól SN.
5. **Integracja:** PR #516 → #517 → rozszerzenie pełnej rodziny; nie scalać przed zielonym CI i kontrolą użytkownika, żadnych automatycznych zmian LOD ani zestawów zabezpieczeń.
