# P0 / DECISION REQUEST — korekta obciążalności kabli SN: ENEA 03.2026 vs IEC 60502-2 Annex B

**Status:** DO DECYZJI CLAUDE OPUS; dokumentacja i audyt, bez zmiany solvera.  
**Data przeglądu:** 2026-11-04  
**Zakres:** wyłącznie długotrwała obciążalność kabli SN w gruncie oraz pochodzenie współczynników korekcyjnych.  
**Repozytorium:** radekizk-sketch/MV-Design-PRO, bazowy `main`.  
**Priorytet:** P0 poprawność fizyczna i śledzenie źródeł.

## 1. Decyzja wymagana — bez automatycznej implementacji

Opus ma rozstrzygnąć i udokumentować:

- **D1 — metoda:** (A) ENEA 03.2026 jako osobny profil referencyjny dla kabli/operatora, (B) IEC 60502-2 Annex B jako osobny profil dla kabli właściwych zakresowi normy, (C) obie metody jawnie rozdzielone. **Rekomendacja: C**, pod warunkiem zgodności źródeł bazowej obciążalności i współczynników.
- **D2 — preset historyczny:** utrzymać `ZIEMIA_3_KABLE_200MM` wyłącznie jako historyczny profil projektu, odłączyć od automatycznego doboru nowych kabli do czasu weryfikacji MT880 v3 i dokumentu ENEA 2021. **Rekomendacja: nie usuwać bez migracji projektów, ale nie deklarować jako IEC/ENEA 2026.**
- **D3 — zakres normowych tablic:** włączyć tylko dane sprawdzone w uprawnionym egzemplarzu IEC 60502-2 (wydanie musi być jawne); pozostałe trasy obsługiwać udokumentowanymi danymi producenta lub odmową obliczenia, nie zgadywaniem.
- **D4 — priorytet źródeł:** bazowa obciążalność + warunki jej wyznaczenia > tablice zgodne z tym samym modelem odniesienia > własne dane projektanta z opisem. Nie mieszać podstaw IEC, ENEA, producenta bez sprawdzonego przeliczenia.
- **D5 — status praw autorskich:** nie włączać do repo pełnych chronionych tablic normy bez odpowiedniej licencji/uprawnienia. Wskazania numerów tablic i minimalne, dozwolone próbki weryfikacyjne są czym innym niż reprodukcja całego dokumentu.

Żaden wariant nie upoważnia do cichego przepisania bieżących wyników projektów.

## 2. Dowody źródłowe i ograniczenia

### 2.1 ENEA — źródło pierwotne, potwierdzone

**ENEA Operator, _Elektroenergetyczne linie kablowe średniego napięcia_, wersja 03.2026, zatwierdzona do stosowania 01.07.2026, uchwała 202/2026; zastępuje wersję 12.2023.**  
PDF: https://www.operator.enea.pl/media/4774/uslugi-dystrybucyjne/elektroenergetyczne-linie-kablowe-sn-obowiazuje-od-01072026pdf.pdf

Załącznik A-1 _Album linii kablowych średniego napięcia_, **pkt 4.2.3(b), drukowana s. 7 załącznika / 32. strona pliku PDF**, przyjmuje dla doboru:
- temperatura gruntu **20 °C**;
- głębokość kabla **0,7–1,1 m**;
- oporność cieplna właściwa gruntu **1,0 K·m/W**;
- współczynnik obciążenia **0,7 w ziemi; 1,0 w powietrzu**;
- temperaturę żyły przed zwarciem **90 °C**, po zwarciu **250 °C** (dotyczą oceny zwarciowej, nie są dodatkowym współczynnikiem obciążalności długotrwałej).

**Pkt 4.2.3(c) i tablica 4.3** podają obciążalności określonych kabli ENEA w podanych warunkach; przyjęty jest układ trójkątny ze stykającymi się powłokami. Należy zweryfikować pełny zestaw warunków przy użyciu tabeli.  
**Współczynnik obciążenia 0,7 NIE oznacza automatycznie współczynnika derating `f = 0,7` mnożonego przez prąd znamionowy** — opisuje założony profil obciążania. Konieczne jest sprawdzenie zgodności metody, charakterystyki czasowej i źródłowej obciążalności.

**Wersja ENEA „Dobór kabli SN” 2021-06-30** wymieniona w kodzie **nie została w tym przeglądzie pozyskana ani zweryfikowana**. Nie wolno przedstawiać jej jako potwierdzenia liczby 0,90, 1,01 lub 0,82. Dokument 2026 nie dowodzi pochodzenia tych historycznych wartości.

### 2.2 IEC — identyfikacja tablic, dane wtórne kandydackie

IEC 60502-2:2014 / IEC 60502-2:2014+A1:2024, zał. B: **20 °C gruntu, 0,8 m głębokości, 1,5 K·m/W gruntu** jako punkt odniesienia tabelowego (pozostałe warunki zależą od konfiguracji kabla). Źródło poglądowe: https://www.ti-soft.com/en/support/help/electricaldesign/standards/iec-60502-2

| Tablica | Wielkość/kontekst | Odróżnienie wymagane w modelu |
|---|---|---|
| B.11 | temperatura gruntu | od bazowych 20 °C |
| B.12 | głębokość, bezpośrednio w gruncie | od 0,8 m |
| B.13 | głębokość, w kanałach/rurach | od 0,8 m |
| B.14 | rezystywność, 1-żyłowe w gruncie | przekrój i 1,5 K·m/W |
| B.15 | rezystywność, 1-żyłowe w rurach | przekrój i 1,5 K·m/W |
| B.16 | rezystywność, 3-żyłowe w gruncie | przekrój i 1,5 K·m/W |
| B.17 | rezystywność, 3-żyłowe w rurach | przekrój i 1,5 K·m/W |
| B.18 | grupowanie 3-żyłowych w gruncie | liczba kabli, rozstaw/układ |
| B.19 | grupowanie obwodów 3-faz. z 1-żyłowych w gruncie | liczba obwodów, rozstaw/układ |
| B.20 | grupowanie 3-żyłowych w rurach | liczba kabli, rozstaw/układ |
| B.21 | grupowanie obwodów z 1-żyłowych w rurach | liczba obwodów, rozstaw/układ |

**Uwaga krytyczna:** 3 kable jednożyłowe jednej linii SN to co do zasady **jeden obwód trójfazowy**, a nie 3 obwody w tablicy grupowania. Nie wyciągać współczynnika grupowego z liczby żył.

Potencjalne źródła wtórne, **NIE zatwierdzone automatycznie do danych produkcyjnych**:
- TiSoft B.14: https://www.ti-soft.com/en/support/help/electricaldesign/standards/iec-60502-2/cables-installed-in-ground/correction-factor-k3/table_b_14
- TiSoft B.15: https://www.ti-soft.com/en/support/help/electricaldesign/standards/iec-60502-2/cables-installed-in-ground/correction-factor-k3/table_b_15
- TiSoft B.16: https://www.ti-soft.com/en/support/help/electricaldesign/standards/iec-60502-2/cables-installed-in-ground/correction-factor-k3/table_b_16
- TiSoft B.17: https://www.ti-soft.com/en/support/help/electricaldesign/standards/iec-60502-2/cables-installed-in-ground/correction-factor-k3/table_b_17

**Wykryta anomalia:** wtórna tablica TiSoft B.14 w wierszu **35 mm², 1,5 K·m/W** pokazuje **0,89** zamiast oczekiwanego współczynnika odniesienia **1,00**; ten sam wiersz jest niespójny dla dalszych kolumn. Jest to konkretny powód, by nie kopiować tabel bez weryfikacji pierwotnej. Nie dokonywać automatycznej „poprawki” jako rzekomo normowej.

Źródłem ostatecznego potwierdzenia wartości normowych powinien być legalny egzemplarz właściwego wydania IEC/PN-EN, a nie wyszukiwarka, inne edycje lub katalog z innymi założeniami.

### 2.3 BICC — tylko odrębne dane producenta

BICC _Medium Voltage Cables Catalogue_ 2024, s. 9–10: https://www.bicccables.com/wp-content/uploads/2024/07/MV_Catalogue_D6_Final_Print_July_24_V2.pdf. W materiałach dotychczasowego rozpoznania podano **odniesienie 0,5 m i 1,0 K·m/W**, różne od IEC. BICC nie jest substytutem tablic B.11–B.21. Nie podpisywać danych BICC „IEC 60502-2 B.x”, nie normalizować przez podzielenie przez wiersz odniesienia i nie nazywać tego cytatem z IEC. Katalog BICC należy ponownie skontrolować, jeśli wybrany do implementacji.

## 3. Potwierdzony stan `main` — konkretne punkty ingerencji

`mv-design-pro/backend/src/network_model/solvers/cable_ampacity_derating.py`:
- `WspolczynnikiObciazalnosci(f_grunt, f_wiazka, f_grupa, podstawa)`, agregat jednego scenariusza, nie niezależne tablice IEC.
- `ZIEMIA_3_KABLE_200MM`: opis „3 kable jednożyłowe, 200 mm, 1,5 K·m/W, 20 °C”; współczynniki **0,90 × 1,01 × 0,82 = 0,74538** (poprawne arytmetycznie). Jest to jednak tylko dowód mnożenia, nie poprawności doborowej wartości składowych.
- `podstawa`: „MT880 v3; ENEA Dobór kabli SN 2021-06-30” — nieudokumentowana w tym przeglądzie proweniencja każdej liczby osobno.
- `WARUNKI_KATALOGOWE`: wszystkie korekty 1,0, zachowuje dotychczasowe wyniki tylko pod warunkiem faktycznej zgodności warunków katalogowych.
- `wspolczynniki_wlasne`: liczby projektanta + opis (pozostawić).
- `obciazalnosc_skorygowana(Iz, wspolczynniki)`: **jedyna** wspólna funkcja mnożenia SN/nN — NIE tworzyć drugiej ścieżki.
- nN: osobne tablice `lv_ampacity_iec60364_5_52` i `wspolczynniki_nn` — NIE MIESZAĆ z SN.

Istnieją testy w:
- `mv-design-pro/backend/tests/network_model/solvers/test_cable_ampacity_derating.py`;
- `mv-design-pro/backend/tests/api/test_der_selection_preview_api.py`;
- `mv-design-pro/backend/tests/network_model/solvers/test_der_selection_preview.py`;
- `mv-design-pro/frontend/src/ui2/kreatory/zrodlo-oze/__tests__/DoborToruSn.test.tsx`.

Test istniejącego iloczynu jest dowodem poprawnej implementacji mnożenia, **nie dowodem poprawności normowej trzech składowych**.

## 4. Wymagany minimalny kontrakt przed zmianą solvera

Każde źródło bazowej obciążalności `Iz_ref` musi identyfikować:
- typ/producent/variant kabla, U0/U, 1- lub 3-żyłowy, izolacja, materiał i przekrój;
- środowisko: powietrze / bezpośrednio w ziemi / w rurze;
- układ i liczba rzeczywistych obwodów trójfazowych, odstępy, ekran i połączenie ekranu (o ile wpływa na użyty Iz);
- warunki odniesienia `T_ref [°C], rho_ref [K·m/W], h_ref [m]`;
- czy dane są **długotrwałe ciągłe**, czy obciążalność dla założonego współczynnika obciążenia / profilu;
- podstawa: dokument, wydanie, tablica, wiersz/kolumna lub karta producenta.

Dopiero przy zgodnym punkcie odniesienia wolno złożyć:
`Iz_wynik = Iz_ref × k_temperatura × k_rezystywność × k_głębokość × k_grupowanie × [inne jawne]`.

Zapis jest **kontraktem logicznym**, nie poleceniem natychmiastowego dopisania wszystkich pól do ENM. Przy braku danych o podstawie `Iz_ref` NIE zakładać, że jest to baza IEC 1,5 K·m/W ani ENEA 1,0 K·m/W.

**Zasada bezpieczeństwa:** dla warunków referencyjnych, których baza jest zgodna z zastosowaną tablicą, współczynnik odpowiedniego parametru = 1. Przy niezgodnych bazach nie stosować bezpośrednio tej samej tablicy. W szczególności:
- dla bazowej obciążalności IEC przy 1,5 K·m/W korekta 1,0 K·m/W może być >1, jeżeli odpowiada właściwej tablicy i konfiguracji;
- dla bazowej obciążalności ENEA 1,0 K·m/W nie wolno dodać tej samej korekty IEC do 1,0 K·m/W drugi raz;
- tablice B.18/B.19 nie służą do dodatkowego „grupowania” pojedynczego obwodu utworzonego z trzech kabli jednożyłowych.

Nie wprowadzać interpolacji między wartościami dyskretnymi bez osobnej decyzji normowej, zakresu ważności i testów.

## 5. Minimalny plan realizacji po decyzji (osobny PR kodowy)

**P0-A — korekta proweniencji i klasyfikacji:**
1. odseparować historyczny preset MT880 2021 od potwierdzonych profili IEC/ENEA;
2. przypisać każdej składowej współczynnika źródło i warunki referencyjne; nie usuwać danych zapisanych projektów;
3. pokazać w logu/raporcie konkretny dokument+tablicę lub „parametry użytkownika” — bez etykiety normowej na podstawie przypuszczenia.

**P0-B — zamknięcie jednej metody obliczeń:**
1. wybrać jedną podstawę obciążalności i spójny komplet korekt dla jednego rodzaju trasy;
2. zachować `obciazalnosc_skorygowana` jako jedyne miejsce mnożenia;
3. w razie niezgodnej bazy albo brakującej tablicy: fail-closed dla trybu normowego, nie podmieniaj na 1,0 ani na BICC/MT880.

**P1 — rozszerzenie B.11–B.21:** tylko po pozyskaniu uprawnionych danych i udowodnieniu poprawności dla przekrojów, układów i warunków odniesienia.

## 6. Bramka odbiorowa — konkretne przypadki

| ID | Przypadek | Oczekiwany rezultat |
|---|---|---|
| G1 | ENEA 03.2026, 1,0 K·m/W, baza z tab. 4.3, właściwy układ | brak podwójnej korekty ρ; zachowany profil obciążenia |
| G2 | IEC Annex B, 1,5 K·m/W, właściwa konfiguracja | kρ=1,00 |
| G3 | IEC Annex B, ρ zwiększona przy stałych pozostałych warunkach | Iz nie rośnie |
| G4 | IEC Annex B, ρ zmniejszona przy stałych pozostałych warunkach | Iz nie maleje |
| G5 | TiSoft B.14, 35 mm² / 1,5 K·m/W = 0,89 | odrzucić jako niespójne z punktem odniesienia; nie importować |
| G6 | 3×1-żyłowy = 1 obwód trójfazowy | brak współczynnika grupowania jak dla 3 obwodów |
| G7 | 2 obwody trójfazowe | dobór właściwej tabeli B.19/B.21 i rozstawu, nie B.18 dla kabli 3-żyłowych |
| G8 | Iz z katalogu producenta bez ρ_ref/h_ref | odmowa automatycznej korekty normowej; bez fikcyjnej proweniencji |
| G9 | 2021 MT880 preset i stare projekty | bez cichej zmiany wartości; jawny status i ścieżka migracji |
| G10 | Zmieniony ρ w modelu, gdy baza i metoda potwierdzone | aktualizacja Iz, obciążenia, doboru i raportu spójnie |
| G11 | API/kreator/raport dla tego samego wariantu | identyczny Iz, współczynniki i źródła |
| G12 | nN PN-HD 60364-5-52 | regresja bez zmian |
| G13 | data-normatywna wydanie/strona/wiersz | da się prześledzić wartości bez kopiowania całej normy |
| G14 | źródło ENEA przy 0,7 współczynniku obciążenia | brak traktowania 0,7 jako dowolnego mnożnika Iz |
| G15 | podanie wartości spoza zatwierdzonej tabeli | jawne nieobsługiwane; bez niekontrolowanej interpolacji |

**Zakaz:** same testy zgodności obliczenia 285 × 0,74538 = 212,43 A nie stanowią normowego dowodu. Wymagana walidacja z niezależnie zweryfikowaną tabelą i przypadkiem aplikacyjnym.

## 7. Co ma oddać Opus w recenzji tego PR

1. D1–D5: **AKCEPTUJ / ZMIEŃ / ODRZUĆ** + krótkie uzasadnienie techniczne.
2. Jednoznaczna informacja, czy MT880 v3 oraz „ENEA 2021-06-30” faktycznie istnieją w repo/uprawnionym repo dokumentów; jeśli tak: dokument, strona, współczynnik, warunki.
3. Zamknięta lista wspieranych konfiguracji SN do pierwszej implementacji (bez fałszywej deklaracji „pełne IEC”).
4. Minimalne pliki do modyfikacji, plan migracji, testy w CI i brak wpływu na nN.
5. Decyzja, czy tworzyć kolejny kodowy PR na tej gałęzi czy oddzielny PR.

**Ten PR jest wyłącznie pakietem dowodowym/wnioskiem o decyzję. Nie stanowi zatwierdzenia współczynników ani wdrożenia solvera.**
