# Audyt ekranu E-21 „Konfigurator falownika PV" — 2026-07-27

**Status:** BINDING (podstawa przebudowy). Zlecenie właściciela: uwagi krytyczne do E-21
po oględzinach żywego ekranu (V12K-243). Dyrektywa nr 5: audyt przed przebudową; dyrektywa
nr 2: opcja MAX; dyrektywa nr 3: zero fabrykacji.

**Metoda:** każdy zarzut rozstrzygnięty POMIAREM na kodzie i danych, nie oceną wizualną.
Trzy możliwe werdykty: `DEFEKT PRODUKTU` (naprawiamy), `ARTEFAKT SCENY` (błąd materiału
dowodowego, nie produktu), `BRAK ZDOLNOŚCI` (danych/reguły nie ma nigdzie — trzeba je
zbudować, a do tego czasu brak musi być NAZWANY).

---

## Rozstrzygnięcia punkt po punkcie

### P1. Ekran miesza obiekty techniczne — **DEFEKT PRODUKTU**

Pomiar: `buildDerCards` (`DerSurfaces.tsx`) wystawia w jednym rekordzie
`StationDerConnection` dane czterech różnych obiektów modelu: urządzenia wytwórczego
(`device_catalog_ref`, moc), instalacji (PCC, profile NC RfG), transformatora blokowego
(`block_transformer_catalog_ref`) i wyposażenia pola SN (`protection/ct/vt_catalog_ref`).
Rekord warsztatu skleja je świadomie, ale EKRAN nie rozróżnia, do czego dana należy —
wszystko leży w jednej liście „Wiązania katalogowe" i jednej karcie gotowości.

Skutek inżynierski: przekładnik i zabezpieczenie wyglądają na wyposażenie falownika,
podczas gdy należą do pola SN, mierzą określony tor i działają na konkretny wyłącznik.

### P2. Sprzeczność mocy (1 MW vs 8 MW) — **DEFEKT PRODUKTU + ARTEFAKT SCENY**

Pomiar: `quantity` i `n_parallel` istnieją w modelu (`enm/models.py::Generator`), ale
w rekordzie warsztatu i na ekranie **nie istnieją wcale** (0 trafień w `types.ts`
i `DerSurfaces.tsx`). Ekran zna wyłącznie `nominal_power_kw` jednej pozycji i nie
odróżnia mocy jednostki, bloku i farmy — więc sprzeczności nie da się nawet wykryć.

Artefakt sceny: nazwa „Farma PV 1 MW" przy projekcie „Przyłączenie farmy PV 8 MW"
pochodzi z fikstury sceny zrzutów, nie z produkcji. Ale zarzut merytoryczny zostaje:
bez `quantity` × `moc jednostkowa` → `moc bloku` → `moc farmy` → `Pmax w PCC` żaden
z tych poziomów nie jest wyrażalny, a od nich zależą prądy robocze, dobór
transformatora, CT, kategoria NC RfG i wszystkie obliczenia sieciowe.

### P3. „Po stronie SN" nie opisuje przyłączenia — **DEFEKT PRODUKTU**

Pomiar: `pccPathLabel` zwraca STAŁY łańcuch per `connection_side` (6 wariantów), np.
„falownik → transformator blokowy → pole SN dedykowane". To opis KLASY przyłączenia,
a nie toru w modelu: nie ma nazw stacji, transformatora, pola, szyny ani PCC, więc
projektant nie widzi, czy tor jest kompletny i co konkretnie w nim brakuje.

### P4. „Kompletna konfiguracja" wbrew brakom — **DEFEKT PRODUKTU**

Pomiar: `computeDerCompleteness` zwraca `complete` po spełnieniu TRZECH warunków
(PCC + urządzenie katalogowe + profil NC RfG). Macierz gotowości wymaga kilkunastu
danych. Dlatego ekran mógł jednocześnie napisać „kompletna konfiguracja" i wyliczyć
braki — dwa słowniki na jednym ekranie odpowiadały na dwa różne pytania tym samym
słowem. Słowo „kompletna" jest w tym miejscu nieprawdą o stanie częściowym.

### P5. „Zakres kompletny / do przeliczenia" nic nie wyjaśnia — **DEFEKT PRODUKTU**

Pomiar: `readinessPl` mapuje trzy statusy reguły na trzy ogólniki. Reguła ma
KOMPLETNE dane, żeby powiedzieć więcej: `buildAggregatedReadiness` (front) i
`osie_gotowosci_der` (backend, V12K-244) zwracają dla każdej osi listę NAZWANYCH
powodów z kodem, komunikatem i miejscem naprawy — ekran ich nie pokazuje.
To zdolność bez wywołania: dane są, prezentacja je zgniata do jednego słowa.

Brakuje natomiast (BRAK ZDOLNOŚCI): znacznika czasu ostatniego biegu per analiza,
przyczyny unieważnienia (co się zmieniło) i najważniejszej wartości wynikowej.

### P6. Komunikaty backendowe w treści dla projektanta — **DEFEKT PRODUKTU (mój, V12K-242)**

Pomiar: `WIAZANIA_BEZ_KATALOGU` w `DerWiazaniaEditor` pisze „brak katalogu
w backendzie — wymaga danych producenta". To opis stanu implementacji, nie informacja
inżynierska. Właściwa treść: czego brakuje, po co to jest, które analizy od tego
zależą, skąd wziąć dane, gdzie kliknąć.

### P7. Lista funkcji ANSI bez uzasadnienia — **DEFEKT PRODUKTU (poważny)**

Pomiar: `derProtectionSummary()` skleja kody ze STAŁEJ listy `PROTECTION_FUNCTION_CATALOG`
(24 pozycje, 13 z flagą `required_for_der: true`) — jedna, uniwersalna lista dla KAŻDEJ
instalacji, niezależnie od topologii, sposobu uziemienia sieci, wymagań OSD i możliwości
wybranego urządzenia. Backend NIE MA reguły doboru funkcji od obiektu: jedyne
`_required_functions` (`analyses/protection/catalog/validator.py`) wyprowadza wymagania
z ZESTAWU NASTAW, a nie z chronionego obiektu.

Konsekwencja normowa: 50N/51N (pomiar sumy prądów fazowych albo przekładnik Holmgreena)
i 50G/51G (pomiar z przekładnika ziemnozwarciowego / uziemienia) opisują RÓŻNE tory
pomiarowe i nie mogą być wymagane jednocześnie „na wszelki wypadek"; 67/67N wymagają
toru napięciowego i polaryzacji; 78 wymaga uzasadnienia. Lista bez tego jest ozdobą.

### P8. ABB Relion REB670 jako „zabezpieczenie wytwórcy" — **DEFEKT PRODUKTU + ARTEFAKT SCENY**

Pomiar rozstrzygający: rekord katalogowy `ABB_REB670` niesie
`functions_supported = ('87BB', '50BF', '50', '51')`. **87BB to zabezpieczenie
różnicowe szyn** — dana mówiąca „to jest urządzenie szynowe" ISTNIEJE w katalogu.
Walidacja wiązań DER (V12K-241) sprawdza wyłącznie, czy referencja istnieje w katalogu;
przeznaczenia aplikacyjnego nie sprawdza NIC. Klasyczna zdolność bez wywołania:
dane do wykrycia błędu są, nikt ich nie czyta.

Artefakt sceny: konkretny wybór REB670 w zrzucie to mój dobór fikstury (pierwszy rekord
katalogu). Ale to właśnie dowodzi defektu — system przyjął go bez słowa sprzeciwu.

### P9. CT/VT jako nazwy katalogowe bez wyniku doboru — **DEFEKT PRODUKTU + BRAK ZDOLNOŚCI**

Pomiar: `CTType` (katalog backendu) ma `ratio_primary_a`, `ratio_secondary_a`,
`accuracy_class`, `burden_va`, `manufacturer` (+ wyprowadzone `application`,
`accuracy_limit_factor`). **NIE MA**: prądu cieplnego 1 s (Ith), prądu dynamicznego
(Idyn), rezystancji uzwojenia i przewodów wtórnych, współczynnika bezpieczeństwa Fs.

Co można sprawdzić DZIŚ (defekt produktu — nie jest sprawdzane): przekładnia vs prąd
znamionowy chronionego toru, klasa vs zastosowanie (5P/10P do zabezpieczeń), ALF vs
prąd zwarciowy odniesiony do przekładni, zgodność prądu wtórnego (1 A / 5 A) z wejściem
IED. Czego nie da się sprawdzić bez danych producenta (BRAK ZDOLNOŚCI, nazwać wprost):
obciążalność cieplna/dynamiczna, rzeczywiste obciążenie uzwojenia z przewodami,
nasycenie przy pełnej składowej nieokresowej.

### P10. Brak wniosku inżynierskiego — **DEFEKT PRODUKTU**

Ekran nie odpowiada na żadne pytanie decyzyjne. Część odpowiedzi ma pokrycie w danych
JUŻ dziś (zakres Q z `cos_phi_min/max` katalogu, zgodność funkcji IED, przekładnia CT
vs prąd toru), część wymaga wyniku solvera (udział w zwarciu, FRT), a część danych
producenta. Podsumowanie musi rozróżniać te trzy sytuacje, nigdy ich nie zlepiać.

### P11. Brak głównej akcji i ogólnikowe przyciski — **DEFEKT PRODUKTU**

„Zmień / Wyczyść / Wybierz" nie nazywają obiektu. Brak stałego paska działań i jawnego
następnego kroku (kontrakt ekranu prowadzącego, `FLOW_PROJEKTANTA_2026-07.md`).

### P12. Widok mobilny — **DEFEKT PRODUKTU**

Powierzchnie E-2x budują tabele o stałej szerokości kolumn (`grid-cols-[170px_1fr]`)
i listy poziome; brak układu kartowego i progów dotykowych.

---

## Wnioski przekrojowe

1. **Trzy defekty tej samej rodziny co seria V12K-232…244:** dana istnieje, ale nikt jej
   nie czyta (przeznaczenie IED z `functions_supported`, `quantity` generatora, powody
   z reguły gotowości).
2. **Jedna reguła normowa nadal mieszka w prezentacji**: dobór wymaganych funkcji ANSI
   (stała lista w UI). Musi trafić do domeny i wynikać z obiektu, uziemienia, wymagań OSD
   i możliwości urządzenia.
3. **Słownik ekranu kłamie o stanie**: „kompletna konfiguracja" liczona z trzech pól przy
   kilkunastu wymaganych; „zakres kompletny/do przeliczenia" zamiast powodu i akcji.

## Plan przebudowy (kolejność wiążąca)

| Karta | Zakres | Zamyka punkty |
|---|---|---|
| **E21-1** | Tożsamość obiektu i uczciwy stan: jednostka/blok/farma z `quantity`, realny tor mocy z modelu, koniec słowa „kompletna" wbrew brakom, powody i akcje zamiast ogólników, treść inżynierska zamiast komunikatów o backendzie | P1, P2, P3, P4, P6, P11 |
| **E21-2** | Macierz analiz: po co · z czego · czego brak · stan · przyczyna unieważnienia · ostatni wynik · działanie | P5, P10 |
| **E21-3** | Dobór funkcji zabezpieczeniowych w domenie (od obiektu, uziemienia, OSD) + walidacja przeznaczenia IED z `functions_supported` | P7, P8 |
| **E21-4** | Dobór CT/VT: sprawdzenia możliwe na dzisiejszych danych + nazwane braki danych producenta + rozszerzenie katalogu o Ith/Idyn/Fs, gdy dane są | P9 |
| **E21-5** | Układ mobilny: karty pionowe, progi dotykowe, stały pasek działania | P12 |

Każda karta: naprawa u źródła → test ćwiczący realną ścieżkę → bramka sprawdzona
wstrzykniętą regresją → pełna regresja warstwy + guardy → wpis do rejestru → push →
zrzut żywego ekranu na stronie oceny.
