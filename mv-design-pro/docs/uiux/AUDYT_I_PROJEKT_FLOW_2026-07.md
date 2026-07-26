# AUDYT EKSPERCKI I PROJEKT FLOW PROJEKTANTA (2026-07)

Status: **WIĄŻĄCY** dla programu UI/UX 2026-07. Podlega kanonowi V12.xx i dyrektywom
właściciela z `CLAUDE.md`. Materiał faktograficzny: `docs/uiux/INWENTARYZACJA_FLOW_2026-07.md`
(mapa przestrzeni, rejestr kreatorów, rozbieżności operacji) — ten dokument go NIE powtarza,
tylko ocenia i projektuje.

Metoda: siedem soczewek eksperckich (dyrektywa właściciela nr 5). Każde znalezisko ma dowód
w kodzie (`plik:linia`) albo niezależny rachunek liczbowy. Znaleziska bez dowodu nie weszły.

---

## 0. STRESZCZENIE — co jest naprawdę nie tak

System ma bardzo dużo **zdolności** (18 solverów, 19 analiz, 21 kreatorów) i bardzo mało
**łańcucha**. Trzy najcięższe znaleziska nie dotyczą braku funkcji — dotyczą **przerwanych
połączeń między funkcjami, które już istnieją**:

| # | Znalezisko | Waga |
|---|---|---|
| **Z1** | Nikt nie sprawdza, czy przekrój przewodu wytrzyma **prąd zwarciowy** przez czas wyłączania. Dane normowe SĄ w katalogu (`ith_1s_a`, `jth_1s_a_per_mm2`), resolver ma gotową metodę `get_ith_1s()` — **zero konsumentów** poza własnym `to_dict()` i testami katalogu. Kabel poprawny prądowo i napięciowo może ulec zniszczeniu przy zwarciu, a system milczy. | **krytyczna** |
| **Z2** | Warunki przyłączenia OSD (moc przyłączeniowa, wymagany cosφ, tryb pracy) to **wyspa**: zapisywane do `header.connection_conditions`, czytane WYŁĄCZNIE przez kafel pulpitu. Zero konsumpcji w backendzie, zero w analizach, zero w ocenie zgodności. Dokument, który definiuje kryteria całego projektu, nie jest kryterium niczego. | **wysoka** |
| **Z3** | Brak **agregatu werdyktu projektowego**. Projektant nie ma jednej odpowiedzi na pytanie „czy ten projekt spełnia wymagania?". Istniejący raport zgodności (`raport_zgodnosci.py`) obejmuje wyłącznie tor DER-SN. | **wysoka** |

Diagnoza jednym zdaniem: **flow jest zorganizowany wokół narzędzi (co można uruchomić), a nie
wokół kryteriów (co musi być spełnione, żeby projekt był poprawny)** — i dlatego łańcuchy
urywają się w miejscach, których nikt nie widzi, bo każde ogniwo z osobna działa.

---

## 1. SOCZEWKA: PROJEKTANT SIECI SN (prowadzący opracowanie)

### Z1 — brak kryterium wytrzymałości zwarciowej przewodu (IEC 60949)

Dobór kabla (`network_model/solvers/der_selection_preview.py:296` `propose_mv_cable`) stosuje
**dwa** kryteria:

1. obciążalność długotrwała: `I_z ≥ I_TR·(1+rezerwa)` (`:315`),
2. zmiana napięcia: `|ΔU%| ≤ ΔU_dop` (`:262-268`).

Brakuje kryterium **normowego i w sieciach SN często wiążącego**: minimalnego przekroju ze
względu na zwarcie. Warunek IEC 60949 / PN-HD 60364-5-54:

$$ S \ge \frac{I_{th}\sqrt{t_k}}{k} \qquad\Longleftrightarrow\qquad I_{th} \le \frac{I_{th(1s)}}{\sqrt{t_k}} $$

**Rachunek kontrolny** (dlaczego to nie jest teoretyczne). Magistrala SN, kabel
Al/XLPE 3×70 mm², `jth = 94 A/mm²` (stała materiałowa z
`catalog/mv_cable_line_catalog.py:36`):

- `I_th(1s) = 94 · 70 = 6 580 A`
- czas wyłączania zabezpieczenia `t_k = 0,5 s` → dopuszczalny prąd cieplny
  `6 580 / √0,5 = 9 306 A`
- prąd zwarciowy w miejscu zabudowy `I″k = 12 500 A` **> 9 306 A**

Przekrój jest niewystarczający o ~34 %. Kryterium obciążalności długotrwałej tego nie wychwyci
(70 mm² Al przenosi ~200 A długotrwale, a prąd roboczy magistrali bywa rzędu 100 A), kryterium
spadku napięcia też nie. **Prawidłowy dobór to tu 120 mm², a system zaakceptuje 70 mm².**

Co gorsza, wszystkie składniki tego rachunku już w systemie są:

| Składnik | Gdzie jest | Konsumowany? |
|---|---|---|
| `I_th(1s)` przewodu | `catalog/resolver.py:67` (`get_ith_1s()`), `catalog/types.py:503,688` | **NIE** — wywołania tylko w `to_dict()` (`resolver.py:91`) i w testach katalogu |
| `I_th` zwarciowy | solver IEC 60909 (`m`, `n`, `I″k`) | tak, ale wyłącznie do dowodu **aparatury** |
| `t_k` czas wyłączania | analiza zabezpieczeń (IEC 60255) | tak, lokalnie |

Czyli to nie jest brak danych ani brak fizyki — to **brak ogniwa**, które te trzy rzeczy
zestawi. Dokładnie przypadek z dyrektywy nr 1: „nigdy nie buduj wyspy".

Powiązanie: `equipment_proof/generator.py:152` (`_check_ith`) sprawdza wytrzymałość cieplną
**aparatu** i robi to poprawnie (porównanie energii `I²t` przy różnych czasach odniesienia —
`:176-181`). Ta sama zasada nie została zastosowana do **przewodu**.

### Z6 — dobór kabla bez współczynników korekcyjnych ułożenia

`propose_mv_cable` bierze obciążalność katalogową wprost. Obciążalność długotrwała kabla
zależy od warunków ułożenia (grupowanie, rezystywność cieplna gruntu, temperatura otoczenia,
głębokość — IEC 60287). Brak jakiegokolwiek członu korekcyjnego w torze doboru; jedyne
`derating` w repo dotyczy warstwy powierzchniowej przy uziemieniach
(`solver_input/v126_contracts.py:134`), to inna wielkość.

Skutek: dobór optymistyczny. Nie jest to defekt fizyki (wzór jest poprawny dla warunków
odniesienia), tylko **brak jawnego założenia**: nigdzie nie napisano, że wynik obowiązuje dla
warunków katalogowych.

**DOMKNIĘTE (V12K-207, karta F-K7).** Korekta jest kryterium doborowym, więc liczy ją solver
(`network_model/solvers/cable_ampacity_derating.py`), a współczynnik pochodzi ALBO z nazwanego
zestawu o udokumentowanej podstawie, ALBO wprost od projektanta (wtedy opis warunków jest
wymagany — bez opisu wynik nie dałby się obronić w dokumentacji). Interpolacji nie ma: repo nie
zawiera tablic IEC 60287, a zgadnięty współczynnik jest liczbą bez podstawy. Domyślnie obowiązują
warunki katalogowe (iloczyn 1,0), więc żaden dotychczasowy dobór się nie przesunął — zmieniło się
to, że **założenie jest jawne** w wyniku, w kreatorze i w modelu. Dowód, że to nie kosmetyka:
140 A / 1 km / |ΔU%| ≤ 2,0 % daje 50 mm² katalogowo i 120 mm² dla ułożenia w ziemi w grupie
(160 × 0,74538 = 119,3 A < 140 A). Przy okazji zniknął drugi rachunek korekty w warstwie
prezentacji (`cableSelectionContract.checkCableAmpacity` mnożył `Idd × f1 × f2 × kg5` w UI, z
własną kopią współczynników niezależną od solvera).

---

## 2. SOCZEWKA: PRZYŁĄCZENIA / OZE

### Z2 — warunki przyłączenia OSD nie są kryterium niczego

Operacja `set_connection_conditions` zapisuje do `header.connection_conditions`:
moc przyłączeniową [MW], wymagany cosφ, tryb pracy
(`enm/domain_operations_v2.py:3766-3818`, walidacja zakresów poprawna).

Konsumenci — komplet:

| Warstwa | Konsument | Uwaga |
|---|---|---|
| frontend | `ui2/spaces/projekt/pulpitAdapter.ts:202` | jedyny; zasila kafel |
| backend | **brak** | grep po `backend/src`: tylko definicja operacji |
| analizy | **brak** | żadna analiza nie zna limitu OSD |
| ocena zgodności | **brak** | `raport_zgodnosci.py` dotyczy toru DER-SN |

Kafel porównuje moc **znamionową** (suma z tabliczek) z limitem. To projekcja danych
wejściowych — użyteczna, ale to nie jest sprawdzenie warunku przyłączeniowego. Warunek
przyłączeniowy dotyczy mocy **rzeczywiście wymienianej w punkcie przyłączenia**, czyli wyniku
rozpływu, oraz **cosφ w punkcie przyłączenia**, czyli stosunku Q/P z rozpływu.

Dziś projektant może wpisać „moc przyłączeniowa 5 MW", zbudować sieć oddającą w PWP 6,2 MW,
policzyć rozpływ i **nie dostać żadnego sygnału**.

### Z3-b — martwe kontrolki tego samego kroku (naprawione, V12K-191)

W trakcie audytu ustalono, że formularz warunków przyłączenia **w ogóle się nie wykonywał**:
nazwa `set_connection_conditions` nie była na białej liście frontu, a bramka
`assertCanonicalOpName` (`types/domainOps.ts`) odrzucała ją wyjątkiem przed żądaniem
sieciowym. Tym samym mechanizmem martwe były jeszcze dwa gotowe kreatory:
**bateria kondensatorów SN** (`add_shunt_compensator_sn`) i **ogranicznik przepięć SN**
(`add_surge_arrester_sn`).

Przyczyna strukturalna: typ `CanonicalOpName` (unia) i tablica runtime
`CANONICAL_OPERATION_NAMES` były zapisane osobno, a `satisfies readonly CanonicalOpName[]`
pilnowało tylko jednego kierunku (tablica ⊆ unia). Nazwa obecna w unii, ale pominięta w
tablicy, przechodziła kompilację i type-check, a padała dopiero w runtime.

Testy kreatorów tego nie łapały, bo mockują `executeDomainOperation` na poziomie store'u —
czyli **ponad bramką**. To wzorzec „test maskujący defekt produktu" (`CLAUDE.md` §Zero-Debt
pkt 5): jeden defekt produktu i jeden defekt testu.

Naprawiono w tej samej kolejce (V12K-191): typ wyprowadzony z tablicy (rozjazd stał się
niewyrażalny), trzy nazwy dodane, guard skanujący źródła + test ćwiczący realną ścieżkę
(mockowany wyłącznie `fetch`).

---

## 3. SOCZEWKA: ZWARCIOWIEC

Solver zwarciowy po falach A–C audytu fizyki jest w dobrym stanie (składowe symetryczne
zamknęły się z **zerem defektów**, błędy ≤ 2,2·10⁻¹⁴ %). Zarzut nie dotyczy liczb, tylko
**adresatów liczb**:

- `I″k max` (c ≥ 1,0) trafia do doboru aparatury — **tak**, przez `equipment_proof`.
- `I″k min` (c < 1,0) trafia do nastaw zabezpieczeń — **tak**, po naprawie V12K-189
  (`overcurrent/input_adapter.py` rozróżnia gałąź MIN/MAX po współczynniku napięciowym `c`).
- `I_th` trafia do sprawdzenia **przewodu** — **NIE** (Z1).
- `I_p` (szczytowy, `κ·√2·I″k`) trafia do wytrzymałości dynamicznej aparatu — tak.

Czyli z czterech adresatów prądu zwarciowego jeden nie istnieje.

---

## 4. SOCZEWKA: ZABEZPIECZENIA

Charakterystyki IEC 60255-151 są czyste (fala D audytu). Po decyzji właściciela („nastawa bez
danych powinna być niedostępna", V12K-189) kalkulator zwraca `None` + kanoniczny kod gotowości
zamiast wartości zastępczej.

**Dług otwarty**: kody `protection.nominal_current_missing` i
`protection.fault_current_missing` są emitowane w `OvercurrentSettingsV0.readiness_codes` i
niesione w raporcie (`overcurrent/reporting.py`), ale **żaden konsument prezentacyjny** nie
pokazuje stanu „nastawa niedostępna — uzupełnij dane" z akcją naprawczą. Most jest gotowy,
brakuje drugiego brzegu.

Powiązanie z Z1: czas wyłączania `t_k` wyznaczony w tej analizie jest **wejściem** kryterium
wytrzymałości cieplnej przewodu. Dziś nie jest nikomu przekazywany w tym celu.

---

## 5. SOCZEWKA: KATALOGI / REFERENCE ENGINE

Katalog kabli i linii jest zaskakująco kompletny normowo: parametry cieplne wg IEC 60949,
składowe zerowe, przewód powrotny (`mv_cable_line_catalog.py:96-99`), jakość wpisu.
Problem nie leży w katalogu, tylko w tym, że **część jego parametrów nie ma odbiorcy**.

Metryka do wprowadzenia (propozycja, patrz §9): dla każdego parametru katalogowego wskazać
konsumenta. Parametr bez konsumenta jest albo martwym kosztem utrzymania, albo — jak
`ith_1s_a` — sygnałem brakującego ogniwa.

---

## 6. SOCZEWKA: ROZDZIELNIE / APARATURA

`equipment_proof` jest wzorcowy i **powinien być szablonem** dla brakujących sprawdzeń:
- porównuje właściwe wielkości (`I_p` do dynamicznej, `I²t` do cieplnej),
- przy różnych czasach odniesienia przelicza energię cieplną zamiast porównywać prądy wprost
  (`generator.py:176-181`),
- brak danych daje status FAIL z jawnym komunikatem, nie wartość domyślną.

Ta sama dyscyplina zastosowana do przewodu zamyka Z1.

---

## 7. SOCZEWKA: UX / ARCHITEKTURA INFORMACJI

### Z4 — pętla decyzji „od wyniku do modelu" tylko na części ekranów

Trzeba rozróżnić dwie różne rzeczy, które łatwo pomylić przy pobieżnym przeglądzie:

| Rodzaj akcji | Znaczenie | Stan |
|---|---|---|
| **akcja stanu zerowego** — `setActiveSpace('obliczenia')` | „nie ma wyniku → idź go policzyć" | obecna szeroko, m.in. `EkranKoordynacji.tsx:62`, `EkranStabilnosci.tsx:88`, `EkranSkladowych.tsx:99`, `EkranZbieznosci.tsx:79`, `EkranStanuFazowego.tsx:75` |
| **pętla decyzji** — `usePoprawWModelu` | „wynik przekracza kryterium → popraw TEN element modelu" | tylko Jakość, Rozpływ, Odbiory + kontekstowa akcja kompensacji |

Ekrany z wynikiem, ale bez pętli decyzji: koordynacja zabezpieczeń, stabilność RMS, składowe
symetryczne, stan fazowy SN, zbieżność, porównanie A/B, SSCI, estymacja stanu, badania OLTC.
Projektant widzi tam problem i nie ma stąd drogi do jego przyczyny w modelu.

### Z3 — brak agregatu werdyktu projektowego

Nie ma ekranu odpowiadającego na pytanie, które projektant zadaje na końcu: **„czy projekt
spełnia wymagania i czego jeszcze brakuje?"**. Są ekrany per analiza. Ocena zgodności jest
wąska (tor DER-SN).

### Z8 — dwa rejestry gotowości, jeden martwy

`READINESS_CODES` (`domain/canonical_operations.py:487`, 42 kody z `fix_action_id` i nawigacją
naprawczą) nie jest odpytywany w czasie działania: funkcja `get_required_readiness_codes()`
(`:950`) ma **zero wywołań**, a żaden endpoint go nie zwraca. Realny sygnał gotowości płynie
inną ścieżką — walidator ENM emituje `ValidationIssue` z akcją naprawczą inline, w innej
przestrzeni nazw (`E001`, `W005`, `line.missing_catalog`, `ELIG_SC3_*`).

Korekta wobec materiału faktograficznego: `readiness_fix_actions.py` **też nie jest** ścieżką
produkcyjną — jego `resolve_fix_action` (`:26`) wywołuje wyłącznie
`check_blocker_fix_action_coverage` (`:451`), czyli pokrycie na potrzeby CI. Rzeczywisty
dostawca akcji naprawczej dla UI to walidator ENM.

Skutek praktyczny: kody dodane do `READINESS_CODES` (jak dwa z V12K-189) są kanoniczne
dokumentacyjnie, ale nie mają automatycznej drogi do użytkownika.

---

## 8. PROJEKT FLOW — zasada naczelna

> **FLOW to łańcuch KRYTERIÓW, nie sekwencja EKRANÓW.**

Obecny podział na siedem przestrzeni (Projekt → Model → Schemat → Gotowość → Obliczenia →
Wyniki → Dokumentacja) jest poprawny jako **nawigacja** i nie wymaga przebudowy. Brakuje
warstwy nadrzędnej: jawnego rejestru kryteriów projektowych, który wie, co jest sprawdzane,
z czego, wg jakiej normy i co zrobić, gdy kryterium nie jest spełnione.

Każdy etap E1–E8 opisujemy pięcioma polami. To jest kontrakt etapu:

| Pole | Znaczenie |
|---|---|
| **WEJŚCIA** | co musi być znane, żeby etap miał sens (i skąd pochodzi) |
| **DECYZJA** | co projektant faktycznie wybiera na tym etapie |
| **KRYTERIA** | wg czego sprawdzamy poprawność, z odniesieniem normowym |
| **WYJŚCIA** | co etap przekazuje dalej (i do którego etapu) |
| **AKCJA NAPRAWCZA** | co zrobić, gdy kryterium niespełnione (konkretny element + operacja) |

### E1 — Warunki przyłączenia

- **WEJŚCIA**: dokument OSD (moc przyłączeniowa, wymagany cosφ, tryb pracy), parametry PWP
  (`Sk″`, `I″k`, `U`) — dziś w kaflu przyłączenia.
- **DECYZJA**: przyjęcie warunków jako kryteriów projektu.
- **KRYTERIA**: kompletność warunków (blokada dalszych etapów przy braku).
- **WYJŚCIA**: `P_limit`, `cosφ_wymagany`, `tryb_pracy` → **E5** (rozpływ) i **E7** (zgodność).
  **To jest naprawa Z2**: warunki przestają być wyświetlaczem, stają się kryterium.
- **AKCJA NAPRAWCZA**: `set_connection_conditions` (działa od V12K-191).

### E2 — Koncepcja układu

- **WEJŚCIA**: E1 (moc, PWP), lokalizacja.
- **DECYZJA**: punkt przyłączenia, układ pracy (promieniowy / pierścień z NOP), medium
  (kabel / linia napowietrzna), poziom napięcia.
- **KRYTERIA**: spójność topologiczna, dopuszczalność układu.
- **WYJŚCIA**: szkielet topologii → E3.
- **AKCJA NAPRAWCZA**: kreatory magistrali / pierścienia / łącznika sekcyjnego.

### E3 — Dobór głównych elementów

- **WEJŚCIA**: E2 (topologia, długości), E1 (moc), **E4 (prądy zwarciowe — sprzężenie
  zwrotne, patrz niżej)**.
- **DECYZJA**: przekroje przewodów, transformatory (Sn, przekładnia, grupa połączeń, uk),
  aparatura (In, Icu, Icw, Idyn).
- **KRYTERIA** — dla przewodu **cztery**, dziś sprawdzane dwa:
  1. obciążalność długotrwała `I_z ≥ I_rob` (z korektą warunków ułożenia — Z6),
  2. zmiana napięcia `|ΔU%| ≤ ΔU_dop`,
  3. **wytrzymałość zwarciowa `I_th ≤ I_th(1s)/√t_k`** (IEC 60949) — **brak, Z1**,
  4. ekonomiczna gęstość prądu (opcjonalna, jawnie oznaczona jako niewiążąca).
- **WYJŚCIA**: model z katalogiem → E4, E5.
- **AKCJA NAPRAWCZA**: podmiana pozycji katalogowej na najmniejszą spełniającą **wszystkie**
  kryteria wiążące, z pokazaniem, **które kryterium było wiążące**.

**Sprzężenie E3↔E4 jest istotą projektowania i musi być jawne w interfejsie**: przekrój zależy
od prądu zwarciowego, a prąd zwarciowy zależy od przekroju (impedancja). To iteracja, nie
sekwencja. Ekran doboru ma pokazywać, że wynik pochodzi z bieżącego biegu zwarciowego, i
unieważniać się, gdy model się zmienił.

### E4 — Zwarcia

- **WEJŚCIA**: model z E3, sposób pracy punktu neutralnego.
- **DECYZJA**: scenariusze (max/min, rodzaje zwarć, miejsca).
- **KRYTERIA**: `I″k max` ≤ zdolność łączeniowa aparatów; `I″k min` ≥ próg pobudzenia
  zabezpieczeń; `I_p` ≤ `I_dyn`; `I_th` ≤ wytrzymałość cieplna **aparatu ORAZ przewodu**.
- **WYJŚCIA**: `I″k max` → E3 (aparatura) i E7; `I″k min` → E6; `I_th` → **E3 (przewód)**;
  `I_p` → E3.
- **AKCJA NAPRAWCZA**: powrót do E3 ze wskazaniem elementu i kryterium.

### E5 — Rozpływ mocy

- **WEJŚCIA**: model, profile obciążeń/generacji, **E1 (limit mocy, wymagany cosφ)**.
- **DECYZJA**: regulacja (zaczep OLTC, `Q(U)` falownika, kompensacja).
- **KRYTERIA**: napięcia w dopuszczalnym paśmie; obciążenia gałęzi i transformatorów;
  **moc w PWP ≤ `P_limit` (E1)**; **cosφ w PWP zgodny z wymaganym (E1)**; straty.
- **WYJŚCIA**: profil napięć, obciążenia, straty → E7; wskazania regulacyjne → E3.
- **AKCJA NAPRAWCZA**: pętla decyzji do elementu (istnieje), dobór kompensacji (istnieje).

### E6 — Zabezpieczenia

- **WEJŚCIA**: E4 (`I″k min` do czułości, `I″k max` do doboru przekładników), model.
- **DECYZJA**: funkcje, nastawy, charakterystyki, stopniowanie.
- **KRYTERIA**: czułość, selektywność (TCC), czasy zadziałania, IEC 60255-151.
- **WYJŚCIA**: **`t_k` → E3 (kryterium cieplne przewodu — domknięcie Z1)**; nastawy → E8.
- **AKCJA NAPRAWCZA**: przy braku danych — stan „nastawa niedostępna" z nawigacją do
  brakującej danej (kody istnieją od V12K-189; **brakuje strony prezentacyjnej**).

### E7 — Weryfikacja normatywna (agregat werdyktu — naprawa Z3)

- **WEJŚCIA**: wyniki E4, E5, E6 + kryteria z E1.
- **DECYZJA**: żadna — to ekran rozliczenia.
- **KRYTERIA**: pełna lista kryteriów projektu z pozycjami: spełnione / niespełnione /
  **niesprawdzone z powodu braku danych** (trzeci stan jest obowiązkowy i nie wolno go mylić
  z „spełnione").
- **WYJŚCIA**: werdykt + lista braków → E8.
- **AKCJA NAPRAWCZA**: każda pozycja niespełniona prowadzi do etapu i elementu, który ją
  powoduje.

### E8 — Dokumentacja

- **WEJŚCIA**: E7 (werdykt), dowody z E4–E6.
- **KRYTERIA**: kompletność pakietu; brak dokumentu przy niespełnionym kryterium blokującym
  jest **stanem jawnym**, nie cichym pominięciem.

---

## 9. KONTRAKT EKRANU PROWADZĄCEGO (obowiązuje każdy ekran flow)

Rozszerzenie kontraktu z `FLOW_PROJEKTANTA_2026-07.md` o warstwę kryterialną:

1. **Cel jednym zdaniem** — po co ten ekran istnieje w projekcie (język inżynierski, nie
   nazwa modułu).
2. **Skąd dane** — jawne wskazanie etapu-dostawcy i stanu jego aktualności („z biegu zwarciowego
   z dnia X, model niezmieniony").
3. **Kryterium i norma** — przy każdej ocenianej wielkości: wzór, wartość dopuszczalna,
   odniesienie normowe. Bez tego liczba jest tylko liczbą.
4. **Trzy stany, nigdy dwa** — spełnione / niespełnione / **niesprawdzone (brak danych)**.
   Wartość zastępcza jest zakazana (V12K-189).
5. **Które kryterium jest wiążące** — przy doborze pokaż wszystkie kryteria i wskaż to, które
   zdecydowało. Projektant musi wiedzieć, co poluzować, żeby zejść z przekroju.
6. **Akcja naprawcza z adresem** — nie „popraw model", tylko „zmień przekrój odcinka L-03
   na 120 mm²", z operacją, która to wykona.
7. **Jawny następny krok** — dokąd prowadzi wyjście tego etapu.

---

## 10. PLAN WDROŻENIA (karty)

Kolejność wynika z wagi i z zależności łańcucha.

| Karta | Zakres | Zamyka |
|---|---|---|
| **F-K1** faza 1 — **WDROŻONA** (V12K-192) | Solver kryterium `conductor_thermal_withstand.py` (`I_th ≤ I_th(1s)/√t_k`, `S_min = I_th·√t/Jth`) + wpięcie w dobór kabla jako trzecie kryterium, addytywnie (bez danych zwarciowych wynik bit-identyczny) + własny kod odrzucenia + 3 kanoniczne kody gotowości | **Z1** (rdzeń) |
| **F-K1** faza 2 — **WDROŻONA** (V12K-195) | Sprawdzenie na modelu po biegu SC dla wszystkich gałęzi; rozstrzygnięcia: prąd gałęzi z rozbicia wkładów, gałąź poza drogą zwarcia z jawnym uzasadnieniem, czas jednolity z biegu (jawne ograniczenie) | **Z1** |
| **F-K1** faza 3 — **WDROŻONA** (V12K-196) | Domknięcie łańcucha danych: kontrakt materializacji → model ENM → mapowanie do grafu → analiza; końcówka `GET /api/quality/conductor-thermal-withstand`. Bez tego kryterium w produkcji nie miało danych | **Z1** |
| **F-K1** faza 4 — **WDROŻONA** (V12K-197) | Sekcja „Wytrzymałość zwarciowa przewodów" w ekranie Jakości: werdykt per gałąź, wymagany minimalny przekrój obok zastosowanego, trzy stany, pętla decyzji do gałęzi w modelu | **Z1** (domknięte) |
| **F-K1** faza 5 — **WDROŻONA** (V12K-209) | Czas trwania zwarcia PER GAŁĄŹ z realnej mapy zabezpieczeń (topologia → wyłącznik → nastawa 50/51 → solver IEC 60255 przy prądzie tej gałęzi) zamiast jednego założonego `tk_s` dla całej sieci; każda pozycja niesie ŹRÓDŁO czasu (nastawa / założenie przypadku) z powodem po polsku; solver kryterium dostał ślad WHITE BOX, a końcówka `GET /api/quality/conductor-thermal-withstand/proof` składa dowód, którego krok 1 nazywa źródło czasu; w ekranie Jakości kolumny „Czas wyłączenia” i „Źródło czasu” oraz dowód wybranej gałęzi na istniejącym oknie `PrzegladDowodu` | **Z1** (domknięte w całości) |
| **F-K1** faza 6 — **WDROŻONA** (V12K-210) | **Calculation Evidence** wg oceny właściciela (8,5/10, 15 uwag): kryteria cząstkowe z osobnym werdyktem (prądowe · energetyczne · przekrojowe), pełny bilans I²·t wobec k²·S² z marginesem, uzasadnienie współczynnika k (materiał żyły · izolacja · θ_b → θ_k · źródło), działania naprawcze z PROGIEM liczbowym wyprowadzone z tej samej nierówności, analiza wrażliwości (czas · prąd · przekrój), podstawa normowa z punktem, ikony ✔/✖ obok tekstu werdyktu, kolumna „Powód decyzji”, dowód dla KAŻDEJ gałęzi i przejście do gałęzi na schemacie | **Z1** (poziom dowodowy OSD) |
| **F-K1** faza 7 — **WDROŻONA** (V12K-211) | Kryterium cieplne obejmuje CAŁY model SN, a nie tylko jego kablową połowę: kontrakt materializacji `LINIA_SN` przenosi materiał żyły, przekrój, Jth(1 s) i parę temperatur, model ENM `OverheadLine` te pola przyjmuje (dotąd pydantic je cicho połykał), a rekordy linii dostały jawną θ_k wyprowadzoną z materiału żyły (220 °C dla AAL/AAC, 200 °C dla AFL/ACSR z rdzeniem stalowym). Solver rozróżnia RODZAJ przewodu, więc brak izolacji przewodu gołego nie jest już raportowany jako brak danej. Spójność przyjętego k pilnuje test odtwarzający je wzorem IEC 60949 § 3 z pary temperatur | **Z1** (pełne pokrycie modelu) |
| **F-K2** — **WDROŻONA** (V12K-194) | Warunki przyłączenia jako kryterium: `P_limit` i `cosφ_wymagany` z E1 konsumowane w ocenie rozpływu w PWP; werdykt zamiast samego wyświetlenia | **Z2** (domknięte) |
| **F-K3** — **WDROŻONA** (V12K-198) | Agregat werdyktu projektowego (E7): statyczny rejestr 10 kryteriów (etap · warunek · norma · źródło) sklejony z 5 gotowych dostawców (warunki przyłączenia, walidacja energetyczna, wytrzymałość cieplna przewodu, wiarygodność Ik″, dobory DER-SN); trzy stany + jawnie odróżnione „nie dotyczy”; bieg nieaktualny wobec modelu = NIESPRAWDZONE (reguła 4 kanonu); jawny zakres kryteriów poza automatem; pętla decyzji do elementu wiodącego; końcówka `GET /api/quality/design-verdict` + ekran jako pierwsza zakładka Wyników | **Z3** (domknięte) |
| **F-K4** fazy 1–2 — **WDROŻONE** (V12K-200) | Pętla decyzji na 6 ekranach: stan fazowy (asymetria → szyna), SSCI (ryzyko → szyna przyłączenia), estymacja (zły pomiar → szyna), składowe / porównanie A/B / zbieżność (wskazanie INSPEKCYJNE „Pokaż na schemacie” — wynik bez kryterium naruszenia nie może udawać defektu); wzorzec dostał jawny `trybDecyzji` | **Z4** (6 z 9) |
| **F-K4** faza 3 — **WDROŻONA** (V12K-201, V12K-202) | Stabilność RMS: kontrakt wyniku dostał RODZAJ elementu ze snapshotu biegu (`source_kind`, `faulted_element_kind`), pętla prowadzi do miejsca zwarcia, a bez rodzaju akcji nie ma. Koordynacja: werdykt miskoordynacji prowadzi do edytora nastaw urządzenia NADRZĘDNEGO; przy okazji usunięta FABRYKACJA prądów (`Math.random()` w dwóch miejscach) — prądy wyłącznie z biegów, klasyfikacja przypadku po współczynniku `c` | **Z4** (domknięte) |
| **F-K5** część „kierunek mocy" — **WDROŻONA** (V12K-203) | Przypadek pracy toru DER jest parametrem doboru, nie niewidoczną stałą: kreator ma `cos φ toru` i `Charakter mocy biernej falownika`, API `der-selection-preview` przyjmuje `reactive_character`, wynik niesie `is_voltage_rise` + echo kierunków, a wiersz ΔU jest NAZWANY (wzrost/spadek) i pokazany jako moduł zmiany. Przy cos φ = 1 wybór Q jest wyłączony z wyjaśnieniem (sin φ = 0 — kontrolka bez wpływu nie udaje działającej). Defekt uboczny naprawiony: adapter doboru aparatu wywracał się na nastawie NIEDOSTĘPNEJ z V12K-189 | dług V12K-190 (domknięty) |
| **F-K5** część „niedostępne nastawy" — **WDROŻONA** (V12K-204) | Nastawa niewyznaczalna jest jawnym stanem, nie pustym polem: projekcja `settings_presentation` (etykieta ANSI/IEC · wartość albo NIEDOSTĘPNA · powód i akcja naprawcza z kanonicznych `READINESS_CODES`), sekcja w raporcie nastaw, końcówka `GET /api/protection/overcurrent-settings` (run_id albo case_id) i sekcja „Nastawy wyznaczone z analizy" w ekranie koordynacji — PRZED selektywnością, zgodnie z kolejnością flow. Odwzorowanie kod → nastawa jest jawne; brak dopasowanego kodu mówi wprost, że analiza nie podała powodu | dług V12K-189 (domknięty) |
| **F-K6** — **WDROŻONA** (V12K-206) | Rejestrów było CZTERY, nie dwa (pomiar: kanon 52 kody bez konsumenta runtime; walidator ENM 34 kody — zero wspólnych z kanonem; `KNOWN_BLOCKER_CODES` 46 kodów — jeden wspólny; tablica frontu 12 kodów bez emitera i bez konsumenta). Rozstrzygnięcie: SYGNAŁ = walidator ENM, TREŚĆ = kanon, AKCJA = FixAction. Kanon ma drogę do UI (zgłoszenia wzbogacone o kod/poziom/priorytet/akcję), końcówka `GET /api/readiness/registry` wystawia kanon RAZEM z lukami, panel sortuje naprawy po kanonicznym priorytecie, tablica frontu usunięta (treść w kanonie, 64 kody), a nowy `readiness_consumption_guard` pilnuje czterech niezmienników konsumpcji | **Z8** (domknięte) |
| **F-K7** — **WDROŻONA** (V12K-207) | Korekta obciążalności wg warunków UŁOŻENIA jako kryterium doborowe w solverze: dwa zestawy z podstawą dokumentową (warunki katalogowe 1,0; ziemia/3 kable/200 mm → 0,74538) plus współczynniki własne z wymaganym opisem, bez interpolacji. `propose_mv_cable` porównuje próg z obciążalnością SKORYGOWANĄ i zwraca obie liczby + jawne założenie; nowe końcówki `GET /api/solver/cable-laying-conditions` i `POST /api/solver/cable-ampacity-derating-preview`; wybór jedzie DO MODELU (`meta.cable_laying_conditions`), więc raport zgodności D2 liczy propozycję dla tego samego założenia (bez tego zgłaszał FAŁSZYWE odstępstwo za poprawny dobór); rachunek korekty usunięty z warstwy prezentacji | **Z6** (domknięte) |
| **F-K8** (nowa, z realizacji F-K6) | Ocena gotowości DER liczona w UI (`station-der/readiness.ts`, 16 kodów `der.*` z komunikatami PL) przeniesiona do backendu + końcówka + przepięcie ekranów (WorkspaceSurfaceRouter, DerSurfaces). Front nie może oceniać gotowości modelu | **Z8** (pozostałość) |

---

## Rejestr zmian

| Data | Wpis | Autor |
|---|---|---|
| 2026-07-26 | **Kryterium cieplne obejmuje cały model, nie połowę (V12K-211, karta F-K1 faza 7).** Dług zapisany z pomiarem przy fazie 6 okazał się trzema zerwanymi ogniwami naraz, wszystkie ciche: kontrakt materializacji `LINIA_SN` przenosił tylko impedancje i obciążalność, model ENM `OverheadLine` nie miał pól cieplnych (a pydantic domyślnie IGNORUJE nadmiarowe pola — dane przepadały bez żadnego błędu), a temperatura końcowa θ_k przewodu gołego istniała wyłącznie jako komentarz przy stałych `JTH_*_OHL`. Efekt: każda linia napowietrzna kończyła się werdyktem NIEDOSTĘPNY, choć katalog niósł dla niej Jth(1 s) od początku. **Rozstrzygnięcie, które wyszło z realizacji: parę temperatur wolno zapisać jako daną tylko wtedy, gdy odtwarza współczynnik, który katalog już stosuje.** Zamiast przyjąć θ_k „z tablicy", wyprowadziłem ją z materiału żyły i sprawdziłem wzorem IEC 60949 § 3: k(70 → 220 °C) = 94,50 wobec katalogowego 94,0 (AAL/AAC), k(70 → 200 °C) = 89,05 wobec katalogowego 88,0 (AFL/ACSR). Obie wartości katalogowe są NIŻSZE od wzorowych, więc zaokrąglenie idzie w stronę bezpieczną — i to właśnie przypina test asercją `k_katalogowe ≤ k_wzorowe` z tolerancją 2 %, zamiast porównywać liczby z komentarza. Drugie rozstrzygnięcie dotyczy kompletności danych: **brak izolacji jest brakiem tylko tam, gdzie izolacja istnieje.** Przewód goły jej nie ma, więc raportowanie „brak: rodzaj izolacji" było nieprawdą psującą obraz każdego dowodu linii. **Własny błąd złapany regresją (wart zapisania):** pierwsza wersja wymagała deklaracji rodzaju przewodu bezwarunkowo i wywróciła test kompletności fazy 6 dla poprawnie opisanego kabla — naprawiając fałszywy brak dla linii, wprowadziłem fałszywy brak dla kabla. Ostateczna reguła jest symetryczna: rodzaj jest brakiem tylko gdy NIEROZSTRZYGALNY (brak rodzaju i brak izolacji), bo podana izolacja wyklucza przewód goły. Test fazy 6 został nietknięty i przechodzi — to dowód, że kanon poprzedniej fazy jest zachowany, a nie naciągnięty pod nową zmianę. **Trzy defekty ujawnione przy okazji (wszystkie naprawy u źródła):** (1) `thermal_source_ref` istniało w modelu, grafie i dowodzie od fazy 6, ale ŻADEN kontrakt go nie wypełniał — dowód pokazywał „źródło: —", czyli pole bez dostawcy wprost naprzeciw uwagi 6 właściciela („źródło wg normy"); (2) podział odcinka przenosił dane żyły POWROTNEJ, ale nie fazowej, więc po wstawieniu stacji na magistrali kryterium przestawało działać dla obu połówek tego samego fizycznie przewodu; (3) tekst źródła normowego wyświetlał się bez polskich znaków („przewodow golych") — wyłapane przy oględzinach zrzutu, konwencja ASCII-PL obowiązuje w rejestrach, nigdy w napisach dla projektanta. **Dowód liczbowy (AFL 6 70 mm²):** Ith(1 s) = 88 · 70 = 6160 A; przy t = 0,5 s I_dop = 6160/√0,5 = 8711,55 A; dla I_th = 5000 A wykorzystanie 0,574 i S_min = 40,17 mm² < 70 mm² → PASS. Zmierzony dług: katalog linii nie ma rekordów miedzianych ani stopów Al wyższej wytrzymałości — funkcja domykająca parę temperatur świadomie ich NIE uzupełnia (brak pozostaje brakiem), rozszerzenie wymaga danych producenta. | Fable (architekt) |
| 2026-07-25 | **Calculation Evidence kryterium cieplnego (V12K-210, karta F-K1 faza 6).** Ocena właściciela 8,5/10 z 15 uwagami sprowadziła się do jednego wymagania: **raport nie może być prezentacją wyniku — ma być dowodem, który pozwala niezależnie zweryfikować każdą liczbę i każdą decyzję algorytmu.** Rozstrzygnięcie, które wyszło z realizacji: te same dane wystarczą, jeśli pokazać je w trzech układach — diagnozy (co jest naruszone), dowodu (dlaczego, z jakiego wzoru i z jakiej normy) oraz decyzji (co konkretnie zmienić i do jakiej wartości). Stąd trzy równoważne zapisy kryterium — prądowy, energetyczny i przekrojowy — z osobnym werdyktem; ich równoważność pilnuje asercja, bo rozjazd oznaczałby błąd rachunku. Stąd też naprawy liczone jako przekształcenia TEJ SAMEJ nierówności względem każdej zmiennej, a nie porady ogólne: projektant dostaje przekrój, czas, prąd i wymagane k jako liczby, nie jako zalecenia. **Dwa defekty ujawnione przy okazji (obie naprawy u źródła):** (1) `create_branch` filtrował pola gałęzi białą listą bez danych cieplnych żyły fazowej, więc kabel zmaterializowany z katalogu docierał do modelu bez `jth_1s_a_per_mm2` — kryterium widziało go jako pozbawiony danych cieplnych; żaden test nie szedł wcześniej całą drogą operacja → model → graf aż do tych pól. (2) Model ENM przyjmował izolację tylko XLPE/PVC/PAPER, a katalog SN ma 18 rekordów EPR — materializacja takiego kabla wywracała walidację dokumentu (12 testów DER padło natychmiast po wpięciu izolacji do modelu). **Dowód liczbowy:** kabel Al/XLPE 70 mm² (k = 115 A·√s/mm²), I = 9200 A, t = 1 s → I²·t = 8,464·10⁷ A²·s wobec k²·S² = 6,48·10⁷ A²·s; policzone wyjścia: przekrój 80 mm², czas 0,766 s, prąd 8050 A albo materiał o k ≥ 131,43 A·√s/mm². Zmierzony dług: linia napowietrzna nie niesie w modelu danych cieplnych (katalog `LineType` je ma — brakuje ogniwa materializacji, osobna karta); katalog SN nie ma rekordów z izolacją papierową, więc temperatura 160 °C dotyczy dziś wyłącznie PVC. | Fable (architekt) |
| 2026-07-25 | **Z1 domknięte w całości (V12K-209, karta F-K1 faza 5).** Rozstrzygnięcie, które wyszło z realizacji: **czas trwania zwarcia jest współautorem werdyktu bezpieczeństwa, więc musi mieć źródło tak samo jawne jak prąd.** Kryterium cieplne brało dla każdej gałęzi ten sam `sc_result.tk_s` — parametr przypadku obliczeniowego — i pokazywało go tak, jakby wynikał z modelu. Czas z rozwiązanej nastawy nadpisuje teraz czas przypadku, ale gałąź BEZ nastawy nie traci oceny: zachowuje ją na założeniu, które jest NAZWANE. Skasowanie oceny do „niesprawdzone” byłoby drugą skrajnością — projektant ma prawo ocenić przekrój na własnym założeniu normowym, nie ma prawa nazwać go nastawą. **Trzy znaleziska z realizacji:** (1) nazwy charakterystyk w modelu ENM i w solverze się rozjeżdżają (`IEC_SI` kontra `NI`, `IEC_LI` kontra `RI`) — dopasowanie „po podobnej nazwie” podstawiłoby INNĄ charakterystykę, czyli inny czas, więc odwzorowanie idzie po parach stałych (A, B) z IEC 60255-151 tab. 1 i pilnuje go osobny test; (2) wpisy `protection_assignments` wskazują wyłącznik przez `ref_id` modelu, a graf zna go pod identyfikatorem wyliczonym z tego `ref_id` — bez publicznego przełożenia `ref_to_graph_id` KAŻDA gałąź raportowałaby „brak nastaw”, czyli defekt wyglądający jak brak danych projektanta (test integracyjny porównuje przebieg z zabezpieczeniem i bez niego, więc rozjazd nie przejdzie); (3) odczyt prądu gałęzi z rozbicia wkładów potrzebny był w dwóch analizach naraz i tworzył cykl importów — wyodrębniony do wspólnego modułu zamiast skopiowany. **Dowód liczbowy:** sieć wzorcowa z zabezpieczeniem 51 na sprzęgle (Is = 100 A, TMS = 0,2, SI) i prądem gałęzi 643,6 A daje t = 0,738 s zamiast założonego 1,0 s — prąd dopuszczalny `I_th(1s)/√t` rośnie o 16,4 %, czyli tyle zapasu dotąd przepadało. Zmierzony dług: wybór stopnia po najniższym progu (bez logiki blokad i kierunkowości); bezpiecznik nie wyznacza czasu, bo katalog nie niesie jego charakterystyki I-t; sieć wzorcowa nie ma żadnego `ProtectionAssignment`, więc w torze demonstracyjnym wszystkie gałęzie pokazują „założenie przypadku”. | Fable (architekt) |
| 2026-07-24 | Dokument założony: audyt 7 soczewek + projekt FLOW E1–E8 + kontrakt ekranu + plan kart F-K1…F-K7. Znaleziska Z1–Z8 z dowodem w kodzie. | Fable (architekt) |
| 2026-07-25 | **Z6 domknięte (V12K-207, karta F-K7).** Rozstrzygnięcie, które wyszło z realizacji: **brakującego współczynnika nie wolno zgadnąć — trzeba dać mu podstawę albo oddać decyzję projektantowi.** Repozytorium nie ma tablic IEC 60287, więc lista zestawów ma tylko tyle wpisów, ile ma udokumentowaną podstawę (dwa), a dla innych warunków projektant podaje współczynniki wprost — z WYMAGANYM opisem, bo bez opisu wynik doboru nie obroni się w dokumentacji projektu. Powód krótkiej listy jedzie w odpowiedzi API, żeby nie wyglądała na kompletną tablicę norm. **Znalezisko z realizacji, cięższe od samej karty:** warstwa prezentacji miała DRUGI rachunek korekty (`checkCableAmpacity` mnożył `Idd × f1 × f2 × kg5` w `station-wizard-v2`) z własną kopią współczynników, niezależną od solvera doboru — dwa miejsca mogły dać dwie różne odpowiedzi na to samo pytanie. Rachunek przeniesiony do backendu wzorem relokacji ΔU (R1). **Drugie znalezisko:** samo dołożenie korekty do doboru wprowadziłoby FAŁSZYWE odstępstwo w raporcie zgodności D2 — raport przelicza propozycję i bez warunków z modelu porównywałby kabel 70 mm² (dobrany poprawnie dla ułożenia w ziemi) z propozycją 50 mm² policzoną dla warunków katalogowych. Dlatego wybór jedzie DO MODELU, a nie tylko do podglądu; test padał przed naprawą i pilnuje obu kierunków (fałszywe odstępstwo zniknęło, prawdziwe nadal jest zgłaszane). Zmierzony dług: brak formularza współczynników własnych w kreatorze (kontrakt API i model je obsługują i mają testy — brakuje samej kontrolki); katalog kabli nadal nie dokumentuje warunków odniesienia przy typach; magistrala SN liczy dobór inną ścieżką i nie została objęta. **Znalezisko uboczne z pomiaru (do decyzji produktowej, nie do tej karty):** CAŁY moduł `cableSelectionContract.ts` — cztery funkcje kontraktu MT880 v3 — nie ma żadnego konsumenta produkcyjnego; każdą wywołują wyłącznie dwa własne pliki testów. To ten sam wzorzec, który F-K6 nazwała atrapą utrwalaną testem. Rozstrzygnięcie: albo zbudować krok 1 kreatora stacji, który z kontraktu korzysta, albo moduł wygasić razem z referencją MT880. Korekta obciążalności została z niego usunięta u źródła, więc druga kopia reguły doborowej już tam nie stoi. **RUNDA OGLĘDZIN (dyrektywa #8, zrzuty żywego stosu, oba motywy):** oględziny wychwyciły defekt w tym, co właśnie scalono — teksty backendu widoczne w kreatorze (etykiety zestawów, podstawa dokumentowa, zdanie założenia, powód krótkiej listy, komunikaty 422) były zapisane bez polskich znaków, co łamie zasadę 100 % polskiego UI. Konwencja ASCII-PL obowiązuje w rejestrach i dokumentach, NIE w napisach widocznych dla projektanta. Poprawione u źródła w `cable_ampacity_derating.py`, operacji domenowej i walidatorze API; 13 asercji testowych przeniesione na poprawny tekst, zrzuty powtórzone. | Fable (architekt) |
| 2026-07-25 | **Z8 domknięte (V12K-206, karta F-K6).** Pomiar pokazał, że rejestrów gotowości było CZTERY, prawie rozłączne: kanon (52 kody, zero konsumentów runtime), walidator ENM (34 kody, ZERO wspólnych z kanonem — jedyny realny dostawca sygnału do UI), `KNOWN_BLOCKER_CODES` (46 kodów, jeden wspólny, używany tylko przez guard pokrycia) i tablica frontu (12 kodów bez emitera, konsumowana wyłącznie przez 28 testów struktury — test utrwalał atrapę jako zdolność). Rozstrzygnięcie: **jeden warunek ma jednego właściciela na każdą rolę** — sygnał daje walidator (tylko on zna model), treść normatywną kanon, akcję FixAction. Odwzorowanie jest celowo WĄSKIE (5 z 34): komunikat kanonu jest instrukcją naprawy, więc nie może opisywać innego warunku niż ten, który zaszedł — dowód w teście, gdzie E004 („brak napięcia SZYNY") NIE dostaje kodu napięcia STACJI. Pozostałe 29 kodów ma jawny powód braku odpowiednika, więc luka treści jest policzalna. Kanon dostał pierwszą realną drogę do UI, a panel gotowości sortuje naprawy po kanonicznym priorytecie zamiast po alfabecie kodu. Zmierzony dług: gotowość DER liczona w UI (16 kodów, realni konsumenci) — karta F-K8; `KNOWN_BLOCKER_CODES` jako osobna przestrzeń nazw; 29 luk treści kanonu; końcówka rejestru bez konsumenta w UI. | Fable (architekt) |
| 2026-07-25 | **Dług V12K-189 domknięty (V12K-204, karta F-K5 część „niedostępne nastawy").** Karta F-K5 zamknięta w całości. Rozstrzygnięcie, które wyszło z realizacji: **poprawna decyzja inżynierska bez konsumenta zamienia się w milczenie.** V12K-189 usunął nastawy liczone z wartości zastępczych — ale skoro nikt nastaw nie pokazywał, projektant nie widział ANI liczb, ANI powodu, dla którego części z nich nie ma. Powód i akcja naprawcza pochodzą wyłącznie z kanonicznego rejestru kodów gotowości, więc ekran, raport i rejestr mówią to samo; odwzorowanie kod → nastawa jest jawne, żeby instrukcja „uruchom analizę zwarciową" nie trafiła pod nastawę, która zwarcia nie potrzebuje. Brak dopasowanego kodu NIE dostaje domyślnego powodu — zgadnięcie przyczyny ukryłoby rozjazd kontraktu (dokładnie taki jak ten, który V12K-189 ujawnił po usunięciu fallbacków). Nierozpoznany panel nawigacji nie dostaje przycisku naprawy: brak przycisku jest uczciwszy niż przycisk prowadzący w złe miejsce. Zmierzony dług: sekcji PDF/DOCX raportu nastaw nie ma (projekcja gotowa, brakuje generatora). | Fable (architekt) |
| 2026-07-25 | **Dług V12K-190 domknięty (V12K-203, karta F-K5 część „kierunek mocy").** Rozstrzygnięcie, które wyszło z realizacji: **kierunek mocy czynnej NIE jest wyborem projektanta** — tor DER oddaje moc do sieci, więc „generation" to stała fizyczna przelicznika. Wyborem jest charakter mocy biernej, bo od niego zależy, czy wzrost napięcia jest tłumiony (pobór Q — regulacja Q(U)), czy powiększany (oddawanie Q). **Znalezisko z pierwszego biegu testów:** nowy wybór nie zmieniał NICZEGO, bo kreator nie wysyłał `cos_phi` — backend liczył sin φ = 0 i moc bierna nie istniała w rachunku. Dopiero uzupełnienie cos φ toru dało kontrolce realny wpływ: 998 kW / 8 km / moduł ΔU% do 1,0 % przechodzi z 70 mm² (pobór Q) na 95 mm² (oddawanie Q). Granica zdegenerowana jest teraz jawna w UI: przy cos φ = 1 wybór Q jest wyłączony z wyjaśnieniem, żeby nie powstała kontrolka pozorna. Defekt uboczny naprawiony u źródła: `_settings_to_requirement` wymuszał `float()` i wywracał dobór aparatu na nastawie niedostępnej (stan wprowadzony przez V12K-189 dla biegu bez 1F). Zmierzony dług: prezentacja niedostępnych nastaw nadal bez konsumenta; asymetria zamiaru stopnia 51N (tms) kontra 50N (brak pola zamiaru). | Fable (architekt) |
| 2026-07-25 | **Z4 domknięte (V12K-201, V12K-202, karta F-K4 faza 3).** Stabilność: wynik niesie rodzaj elementu ze snapshotu biegu, więc pętla ma jak zaznaczyć element; identyfikator poza snapshotem nie dostaje rodzaju domyślnego. Koordynacja: werdykt miskoordynacji prowadzi do nastaw urządzenia NADRZĘDNEGO (przy braku selektywności koryguje się czas rezerwowego — podrzędne ma zadziałać pierwsze). **Znalezisko poboczne, cięższe od samej karty:** strona koordynacji tworzyła prądy zwarciowe i roboczy z `Math.random()` w dwóch miejscach, więc marginesy selektywności, czułość i przeciążenie liczyły się na liczbach losowych i wyglądały jak wynik. Prądy pochodzą teraz wyłącznie z zakończonych biegów, przypadek max/min klasyfikuje się po realnym współczynniku `c` (IEC 60909), a brak danej jest nazwany wprost — bez biegu `c_min` czułość pozostaje niesprawdzalna, bo Ik_max nie zastąpi Ik_min. Dług: `ui_no_physics_guard` pilnuje tylko `ui2/**`, więc fabrykacja w `ui/**` przechodziła CI bez sygnału. | Fable (architekt) |
| 2026-07-25 | **Z4 domknięte w 6 z 9 ekranów (V12K-200, karta F-K4 fazy 1–2).** Rozstrzygnięcie, które wyszło z realizacji: **wskazanie elementu nie jest naprawą**. Część ekranów niesie wynik bez kryterium naruszenia (składowe, zaczepy, różnica A/B), więc powstała osobna akcja inspekcyjna „Pokaż na schemacie” — ta sama mechanika, inna obietnica; rozdział pilnuje test rejestru akcji. Wzorzec tabeli dostał jawny `trybDecyzji` zamiast globalnego rozluźnienia warunku (to wsadziłoby „Popraw w modelu” w każdy wiersz w normie u wszystkich dotychczasowych konsumentów). Pozostałe 3 ekrany mają zmierzony dług: brak TYPU elementu w kontrakcie stabilności i brak werdyktu miskoordynacji z identyfikatorem urządzenia. | Fable (architekt) |
| 2026-07-25 | **Z3 domknięte (V12K-198, karta F-K3).** Etap E7 ma dostawcę: agregat werdyktu projektowego zestawia 10 kryteriów z 5 istniejących analiz w jeden rejestr o wspólnym kontrakcie. Trzy rozstrzygnięcia, które decydują o uczciwości werdyktu: (1) bieg nieaktualny wobec modelu NIE liczy się jako spełnienie (reguła 4 kanonu — wynik sprzed zmiany modelu wygląda na pomiar, a nim nie jest); (2) agregacja zachowawcza — jedna pozycja niesprawdzona wystarcza, by kryterium nie było „spełnione”; (3) zakres kryteriów POZA automatem jedzie w widoku z powodem, bo milczenie o nich zamieniłoby werdykt w certyfikat kompletności. Otwarte: Z4 (pętla na 9 ekranach), Z6, Z8. | Fable (architekt) |
| 2026-07-25 | Z1 domknięte end-to-end (V12K-195…197): kryterium liczone dla całego modelu, łańcuch danych cieplnych żyły fazowej zamknięty od kontraktu materializacji do grafu, sekcja w ekranie Jakości z wymaganym przekrojem i pętlą decyzji. Z2 domknięte (V12K-194). Otwarte: Z3 (agregat werdyktu), Z4 (pętla na 9 ekranach), Z6, Z8. | Fable (architekt) |
| 2026-07-24 | F-K1 faza 1 wdrożona (V12K-192). Przy okazji domknięcie od strony dostawcy: równoległa fala G audytu fizyki naprawiła sam `I_th` w rdzeniu solvera — liczony był jako `I_kss·√t_k`, czyli niezgodnie wymiarowo. Kryterium F-K1 konsumuje `I_th`, więc bez tej naprawy zamknięcie łańcucha byłoby pozorne: nowe ogniwo dostawałoby fałszywą wielkość. Oba końce łańcucha (dostawca i konsument) są teraz poprawne. | Fable (architekt) |
