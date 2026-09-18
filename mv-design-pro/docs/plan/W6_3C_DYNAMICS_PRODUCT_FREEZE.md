# W6-3C — ZAMROŻENIE ARCHITEKTURY PRODUKTU „DYNAMIKA I STABILNOŚĆ SIECI SN"

**Zlecenie:** dyrektywa właściciela z 2026-09-18, „MV-DESIGN-PRO / OPUS — W6-3C / DYNAMICS &
STABILITY PRODUCT ARCHITECTURE FREEZE" (§§1–28). Dokument jest DELIVERABLE z §26 i warunkiem
wstępnym jakiegokolwiek kodu W6-3C (§28: „DO NOT IMPLEMENT W6-3C UI UNTIL THE PRODUCT FREEZE
DOCUMENT IS COMPLETE").

**HEAD rozpoznania:** `957e2a5f`.
**Macierz szczegółowa:** `docs/audit/CURRENT_DYNAMIC_CAPABILITY_MATRIX.md` (dowody `plik:linia`,
komendy i wyniki). Ten dokument jej nie powtarza — streszcza i rozstrzyga.

---

## 0. KONFLIKT ARCHITEKTONICZNY — WYMAGANY PRZEGLĄD WŁAŚCICIELA

Zgodnie z §28 dyrektywy melduję wprost:

**ARCHITECTURAL CONFLICT — OWNER REVIEW REQUIRED.**

Karta W6-3C, którą sam napisałem i skierowałem do wykonawcy PRZED otrzymaniem dyrektywy
(`karta_w63c_powierzchnia.md`, poza repozytorium), zakładała w §4, że powierzchnią docelową
zdolności dynamicznej jest **adaptacja istniejącego ekranu `ui2/wyniki/stabilnosc`**. To jest
dokładnie to, czego dyrektywa zakazuje w tytule i w §17 („Do not start by adapting the existing
`ui2/wyniki/stabilnosc` screen").

Działanie podjęte natychmiast po odczytaniu dyrektywy: **zatrzymałem wykonawcę** (zadanie
`a6350d189b63a755a`) w chwili, gdy meldował „Now let me write the screen." Żadna linia kodu
powierzchni W6-3C nie powstała i nie weszła do gałęzi. Karta jest **unieważniona**; jej
poprawiona wersja to sekcja I.1 tego dokumentu.

**Rekomendacja wprost (punkt 13 raportu końcowego): karta W6-3C w dotychczasowym brzmieniu NIE
MOŻE zostać zrealizowana bez zmian.** Powód nie jest formalny: stary ekran jest powierzchnią
toru, w którym inżynier WPISUJE kąty wirnika i wielkości pozwarciowe. Zbudowanie nad nim
powierzchni dynamiki utrwaliłoby pomylenie wielkości wejściowej z wyznaczaną — czyli dokładnie tę
klasę błędu, której zakazuje §1.

---

## A. Macierz zdolności — stan wykonywalny (streszczenie)

Pełna macierz: `docs/audit/CURRENT_DYNAMIC_CAPABILITY_MATRIX.md`. Cztery wnioski, które
rozstrzygają architekturę:

1. **Rdzeń RMS/DAE jest realny i policzalny.** 9 589 linii w `network_model/solvers/dynamika/**`,
   410 testów zielonych w 264 s, wyrocznia zewnętrzna ANDES dla układu maszyna–szyna sztywna,
   trzy niezależne wyrocznie analityczne (równe pola, wartości własne, bilans energii).
   Bieg `dynamika_rms` kończy się wynikiem albo NAZWANĄ odmową (15 kodów).
2. **Rdzeń nie ma ani jednego konsumenta w interfejsie.** `grep -rln "dynamika_rms" frontend/src`
   zwraca WYŁĄCZNIE `frontend/src/types/enm.ts`. Zdolność istnieje wyłącznie przez API.
3. **Ekran, który dziś nazywa się „Stabilność dynamiczna", nie jest powierzchnią tego rdzenia.**
   Jest powierzchnią toru progowego, który niczego nie całkuje.
4. **Trzy wielkości, których produkt dynamiczny wymaga w pierwszej kolejności — częstotliwość
   węzła, ROCOF i krytyczny czas usunięcia zwarcia — NIE ISTNIEJĄ w wyniku rdzenia.**
   To nie jest brak ekranu. To brak fizyki w wyniku.

---

## B. Mapa LEGACY vs RMS (dyrektywa §3)

| Wymiar | T1 — LEGACY `DYNAMIC_STABILITY` | T2 — RMS `dynamika_rms` |
|--------|--------------------------------|-------------------------|
| Pytanie, na które odpowiada | „czy przyjęte wielkości mieszczą się w przyjętych progach?" | „jak układ zachowa się w czasie po zadanej sekwencji zdarzeń?" |
| Wejście stanu układu | 5 liczb WPISANYCH przez inżyniera | punkt pracy z JAWNIE wskazanego biegu rozpływu (`pf_run_id`) |
| Czy coś jest całkowane | NIE | TAK (DAE, krok zmienny, trapez) |
| Model urządzenia | brak | 6 rodzin, zmienny wektor stanu |
| Zdarzenia | jedno zwarcie opisane trzema polami | harmonogram wielu zdarzeń z dokładnym czasem |
| Wyjście | `STABLE`/`UNSTABLE` + `stability_index` + 4 marginesy | kanały czasowe + metryki + zdarzenia wykonane + własności numeryczne + tożsamość |
| „Szereg czasowy" | funkcja wykładnicza o stałej podanej przez inżyniera | próbki rozwiązania równań |
| Klasyfikacja dowodowa | `UNVALIDATED_MODEL` | `UNVALIDATED_MODEL` |
| Powierzchnia | pełny ekran E-32 (1 528 linii) | brak |

**Relacja między torami — rozstrzygnięcie architektoniczne.** T1 nie jest uproszczoną wersją T2
i nie da się go „podmienić" na T2 bez zmiany znaczenia pól. T1 przyjmuje jako wejście to, co T2
wyznacza jako wyjście. Prawidłowa relacja jest jednokierunkowa i przebiega przez wynik:

```
T2 (bieg RMS)  ──►  przebiegi δ(t), U(t), ω(t)
                        │
                        ▼
              wielkości charakterystyczne przebiegu
              (δ_max, U_min, U_ustalone, ω_min/max)
                        │
                        ▼
T1' (ocena kryterialna) ──► SPEŁNIA / NIE SPEŁNIA / BRAK PODSTAW
```

Czyli: kryteria zostają, wpisywane wielkości stanu znikają. Ocena progowa przestaje być
NIEZALEŻNYM torem obliczeniowym i staje się **warstwą interpretacji wyniku biegu** — dokładnie
tam, gdzie należy wg podziału warstw (ANALYSIS, nie SOLVER).

**Nie kasuję T1 w tym dokumencie** (§3: „Do not delete the legacy capability blindly") — jego los
to decyzja właściciela OD-28 w sekcji J.

---

## C. Klasyfikacja wejść i wyjść (dyrektywa §1)

Klasy: **A** rzeczywiste wejście inżynierskie · **B** parametr modelu · **C** parametr zdarzenia ·
**D** stan wyznaczany przez solver · **E** wynik wyznaczany przez solver · **F** zastępnik
ręczny (legacy).

### C.1 Tor T1 — wszystkie dziewięć pól formularza (`canonical_analysis.py:1528-1547`, `model.ts:151-188`)

| Pole | Klasa dziś | Klasa właściwa | Uzasadnienie |
|------|-----------|----------------|--------------|
| `faulted_element_id` | C | **C** | element objęty zwarciem — parametr zdarzenia, poprawnie |
| `clearing_time_ms` | C | **C** | czas usunięcia — parametr zdarzenia, poprawnie |
| `cleared_by_element_ids` | C | **C** | aparaty wyłączające — parametr zdarzenia, poprawnie |
| `pre_fault_angle_deg` | **F** | **D** | kąt wirnika w punkcie pracy wynika z rozpływu i modelu maszyny |
| `during_fault_angle_deg` | **F** | **D** | kąt w czasie zwarcia to CAŁKA równania ruchu, nie dana wejściowa |
| `post_fault_angle_deg` | **F** | **D** | j.w., po zmianie topologii |
| `post_fault_voltage_pu` | **F** | **E** | napięcie pozwarciowe to rozwiązanie sieci z odbudowanymi źródłami |
| `post_fault_frequency_pu` | **F** | **E** | częstotliwość ustalona wynika z bilansu mocy i regulacji pierwotnej |
| `recovery_time_constant_s` | **F** | **(brak)** | stała odbudowy nie jest wielkością modelu — jest parametrem KRZYWEJ ZASTĘPCZEJ; w torze RMS nie ma odpowiednika, bo kształt odbudowy wynika z AVR/GOV i impedancji |

Progi oceny (`max_clearing_time_ms`, `max_angle_swing_deg`, `min_voltage_recovery_pu`,
`min_frequency_recovery_pu`, `dynamic_stability.py:46-52`) są klasy **A** — kryterium przyjęte
przez inżyniera. Zostają. Repozytorium uczciwie notuje, że nie niesie dla nich cytatu normy
(`dynamic_stability.py:38`) — ta nota ma zostać widoczna w interfejsie.

**Wniosek §1: sześć z dziewięciu pól formularza to wielkości, których inżynier wpisywać nie
powinien.** Trzy pozostałe opisują zdarzenie i są poprawne.

### C.2 Tor T2 — pełna klasyfikacja wejścia

| Grupa | Pola | Klasa | Źródło |
|-------|------|-------|--------|
| Punkt pracy | `pf_run_id` | **A** | wybór inżyniera spośród zakończonych biegów rozpływu (`adapter_dynamiki.py:382`) |
| Definicja badania | `horyzont_s`, `krok_wyjscia_s` | **A** | `scenariusze.py:286-287` |
| Zdarzenia | `t_s`, `bus_ref`, `typ`, `r_f_ohm`, `x_f_ohm`, `t_usuniecia_s`, `element_ref`, `ref_id`, `delta_p_mw`, `delta_q_mvar` | **C** | `scenariusze.py:172-260` |
| Nastawy numeryczne | `dt_s`, `dt_min_s`, `dt_max_s`, `tolerancja`, `tolerancja_kroku`, `eps_init`, `max_iteracji_newtona`, `max_nawrotow`, `integrator` | **A** (warstwa dowodowa) | `adapter_dynamiki.py:509-551` |
| Parametry modeli urządzeń | stałe bezwładności, reaktancje, stałe czasowe, nastawy AVR/GOV/PSS, parametry przekształtnika, zasobnika, toru mechanicznego | **B** | `enm/dynamika_modele.py`, katalog/profil typowy |
| Wektory stanu wszystkich rodzin | patrz macierz §4 | **D** | wyznaczane |
| Metryki `u_min_pu`, `t_u_min_s`, `omega_max_pu@`, `omega_min_pu@`, `delta_max_rad@` | | **E** | `silnik.py:633-668` |

**Ani jedno pole klasy D ani E nie jest w torze T2 wejściem.** To jest właściwa struktura i ona
zostaje zamrożona jako obowiązująca dla produktu.

---

## D. Macierz sygnałów — co produkt może narysować

Pełna tabela: macierz §4. Rozstrzygnięcia produktowe:

| Sygnał | Dostępny dziś | Decyzja produktu |
|--------|---------------|------------------|
| `U_i(t)`, `θ_i(t)` na każdej szynie | TAK | pierwszoplanowy przebieg |
| `δ_k(t)`, `ω_k(t)` maszyn | TAK | pierwszoplanowy przebieg (stabilność kątowa) |
| `P_k(t)`, `Q_k(t)` urządzeń | TAK | pierwszoplanowy przebieg |
| stany regulatorów (AVR/GOV/PSS), PLL, prądy przekształtnika, SOC, kąt łopat, crowbar | TAK | drugi plan, na żądanie (hierarchia sieć → urządzenie → wielkość) |
| **`f_i(t)` częstotliwość węzła** | NIE | **NIE FABRYKOWAĆ.** Ekran deklaruje wprost: „częstotliwość węzła nie jest dziś wielkością wyniku". Podstawienie `omega_pu` maszyny pod `f(t)` węzła jest ZAKAZANE — to inna wielkość fizyczna |
| **ROCOF `df/dt`** | NIE | **NOT IMPLEMENTED** (dyrektywa §7 wprost). Żadnego różniczkowania próbek w interfejsie |
| **`I(t)`, `P(t)`, `Q(t)` gałęzi** | NIE | brak kanału → brak przebiegu; wpisane do rejestru luk P1 |
| **`I_q(t)` wsparcia napięciowego jako wielkość FRT** | NIE | brak kanału → tor FRT nie może dziś dzielić przebiegów z RMS |

**Zamrożone:** jeżeli sygnału nie ma w `ResultSetDynamicV1`, interfejs go nie pokazuje i nie
wylicza. Wielkość pochodna liczona w przeglądarce z próbek jest zakazana (fizyka w UI).

---

## E. Macierz zdarzeń

Pełna tabela: macierz §5. Rozstrzygnięcia:

* **Sekwencja wielu zdarzeń jest architektonicznie dopuszczona i wykonywana** — interfejs
  projektuje się od razu na oś czasu `E = {(t₁,e₁) … (tₙ,eₙ)}`, nie na „jedno zwarcie".
* **Sześć rodzajów wykonywanych:** zwarcie 3F, zdjęcie zwarcia, otwarcie gałęzi, zamknięcie
  gałęzi, odłączenie źródła, skok obciążenia.
* **Dwa rodzaje w kontrakcie danych, odmawiane przez rdzeń:** komenda regulacji, synchronizacja.
  Interfejs POKAZUJE je jako niewykonalne z nazwanym powodem — nie ukrywa i nie udaje.
* **Zwarcia niesymetryczne:** kontrakt danych je przyjmuje, rdzeń odmawia nazwanym kodem.
  **Dyrektywa §14 jest wiążąca: odmowy nie wolno obejść w interfejsie.** Wybór 2F/1F/2FZ prowadzi
  do jawnej informacji, że tor czasowy wymaga składowych symetrycznych (W6-4).
* **Zabezpieczenia i automatyka nie są dziś zdarzeniami dynamicznymi** — nie wolno ich rysować na
  osi czasu jako „zadziałanie", dopóki nie zostaną zdarzeniami rdzenia.

---

## F. Macierz walidacji

Pełna tabela: macierz §6. Zamrożone zasady prezentacji (dyrektywa §21):

Produkt niesie **cztery rozłączne stany**, nigdy zwinięte do jednej odznaki:

| Warstwa | Pytanie | Źródło |
|---------|---------|--------|
| **Wykonanie numeryczne** | czy bieg się zbiegł, ile kroków, jakie residua | `WlasnosciBieguV1` |
| **Walidacja modelu** | czy poprawność modelu jest wykazana | rejestr proweniencji — dziś `UNVALIDATED_MODEL` dla wszystkich trzech torów |
| **Kryterium inżynierskie** | czy wielkości mieszczą się w przyjętych progach | warstwa interpretacji (T1') |
| **Zgodność regulacyjna** | czy wynik nadaje się na dowód | `regulatory_evidence_eligible` |

**Zamrożone:** `UNVALIDATED_MODEL` pozostaje widoczny i wiążący. Zakończony bieg nie jest
walidacją fizyczną. Awans zdolności wymaga dowodu walidacji, nie faktu, że bieg się wykonał
(`provenance.py:340-353` mówi to już dziś — to zdanie ma trafić na ekran).

**Wyrocznie niezależne, które można uruchomić DZIŚ:** ANDES (maszyna synchroniczna, SMIB),
kryterium równych pól, wartości własne, bilans energii. **Rodziny bez wyroczni zewnętrznej:**
GFL, GFM, magazyn, turbina 3/4 — to jest jedyny powód, dla którego cała zdolność stoi na
`UNVALIDATED_MODEL`, i jedyna droga awansu.

---

## G. Docelowa architektura informacji powierzchni (dyrektywa §17–§19)

**Rozstrzygnięcie:** dziewięć pozycji z §17 to NIE jest dziewięć stron. To trzy fazy pracy
inżyniera nad JEDNYM badaniem plus jedna operacja ponad badaniami. Dlatego: **jedna przestrzeń
robocza „Dynamika i stabilność sieci SN"**, zgodna z obowiązującym w repozytorium kontraktem
ekranu prowadzącego (cel jednym zdaniem · tor pracy · uczciwe stany zerowe · jawny następny krok).

```
PRZESTRZEŃ: Dynamika i stabilność sieci SN
│
├─ FAZA 1 — DEFINICJA BADANIA (co liczymy i od czego)
│   ├─ Punkt pracy .............. wybór zakończonego biegu rozpływu; widoczne: sieć,
│   │                              scenariusz ruchowy, zbieżność, rewizja modelu
│   ├─ Modele dynamiczne ........ inwentarz urządzeń z rodziną, rzędem modelu, obecnymi
│   │                              blokami regulacji i POCHODZENIEM parametrów
│   ├─ Scenariusz ............... oś czasu zdarzeń (dodaj/usuń/przesuń), horyzont, krok wyjścia
│   └─ Nastawy numeryczne ....... integrator, kroki, tolerancje — warstwa dowodowa
│
├─ FAZA 2 — WYKONANIE
│   └─ Uruchomienie ............. gotowość (warunki spełnione / brakujące), bieg, wynik ALBO
│                                 nazwana odmowa z kodem i listą elementów blokujących
│
├─ FAZA 3 — ODCZYT WYNIKU (jeden bieg)
│   ├─ Przebiegi ................ przeglądarka klasy inżynierskiej (poniżej)
│   ├─ Zdarzenia ................ co i kiedy WYKONANO (t zaplanowany vs wykonany, skok stanu,
│   │                              residuum bilansu prądowego po re-inicjalizacji)
│   ├─ Kryteria ................. ocena wielkości charakterystycznych względem progów przyjętych
│   └─ Dowód .................... White Box A–D + status wykonania/walidacji/kryterium/zgodności
│
└─ PONAD BADANIAMI
    └─ Porównanie ............... zestawienie przebiegów i metryk wielu biegów (wycinek W6-3I)
```

### G.1 Przeglądarka przebiegów — wymagania zamrożone (§18)

* wspólna oś czasu i wspólny kursor dla wszystkich otwartych przebiegów;
* znaczniki zdarzeń z osi czasu scenariusza naniesione na wykres (chwila WYKONANA, nie zaplanowana);
* hierarchia wyboru **sieć → element → wielkość**, nigdy setki krzywych domyślnie;
  domyślnie: napięcia szyn objętych zdarzeniami + kąt i prędkość maszyn objętych badaniem;
* jednostka przy każdej wielkości, nazwa elementu z modelu (nie identyfikator techniczny);
* adnotacje ekstremów wyłącznie z metryk backendu (`u_min_pu`, `t_u_min_s`, `omega_min/max`,
  `delta_max_rad`) — nigdy liczone w przeglądarce;
* zakres czasu i zakres wartości sterowane przez inżyniera; brak automatycznego „ładnego" przycięcia,
  które ukrywałoby przebieg poza kadrem.

### G.2 Powiązanie ze schematem (§19)

Dwukierunkowo: wybór szyny/urządzenia na schemacie otwiera jego przebiegi; wybór przebiegu
podświetla element na schemacie. **Przebieg nie jest osobnym „oscyloskopem" oderwanym od modelu.**
Realizacja korzysta z istniejącego mechanizmu zaznaczenia i nakładki wyników, nie tworzy drugiego.

### G.3 Zakaz w interfejsie (zamrożony)

Nie wolno: liczyć w przeglądarce żadnej wielkości pochodnej z próbek (w szczególności ROCOF),
podstawiać `omega_pu` maszyny pod „częstotliwość", pokazywać identyfikatorów technicznych i
skrótów jako treści pierwszoplanowej (miejsce: warstwa audytowa), zwijać czterech statusów §F
do jednej odznaki, pokazywać `STABLE/UNSTABLE` jako jedynej reprezentacji wyniku.

---

## H. Rejestr luk (P0 / P1 / P2)

### P0 — blokują nazwanie tej zdolności środowiskiem symulacyjnym

| Id | Luka | Dowód | Rodzaj |
|----|------|-------|--------|
| **P0-1** | Rdzeń RMS bez powierzchni użytkownika | `grep -rln "dynamika_rms" frontend/src` → tylko `types/enm.ts` | brak toku pracy |
| **P0-2** | Sześć pól klasy D/E wpisywanych przez inżyniera w torze T1 | `canonical_analysis.py:1528-1547`, `model.ts:151-188` | odwrócenie wejścia i wyjścia |
| **P0-3** | Brak częstotliwości węzła w wyniku → brak stabilności częstotliwościowej i ROCOF | `silnik.py:555-605` | brak fizyki w wyniku |
| **P0-4** | Krytyczny czas usunięcia zwarcia nie jest wielkością produktu | `silnik.py:633-668`; bisekcja tylko w `test_walidacja_smib.py` | zdolność uwięziona w teście |
| **P0-5** | Model fizyczny odbudowy napięcia w warstwie aplikacji, prezentowany jako „szereg czasowy" | `application/stability/voltage_trajectory.py:90-113` (w tym **zaszyty współczynnik 0,5** stałej czasowej dla częstotliwości, uzasadniony komentarzem); `canonical_analysis.py:1651-1672` | naruszenie warstw + nadużycie |
| **P0-6** | Martwy trzeci rdzeń RMS w katalogu solverów | `network_model/solvers/stability_rms/**`, zero importów produkcyjnych | martwy kod |
| **P0-7** | Nadużycia nazewnicze N-1, N-3, N-4, N-6 | macierz §7 | fałszywa pewność |

### P1 — ograniczają wartość inżynierską, nie podważają uczciwości

| Id | Luka | Dowód |
|----|------|-------|
| P1-1 | Brak kanałów prądu i przepływów gałęzi | `silnik.py:555-605` |
| P1-2 | `komenda_regulacji` i `synchronizacja` w kontrakcie, odmawiane przez rdzeń | `scenariusze.py:239-260`; `adapter_dynamiki.py` |
| P1-3 | Zabezpieczenia i automatyka nie są zdarzeniami dynamicznymi | `zdarzenia.py:49-56` |
| P1-4 | Tor FRT nie dzieli przebiegów z rdzeniem RMS | `frt_hvrt/engine.py:23-60` |
| P1-5 | Brak porównania scenariuszy i przemiatania parametrycznego | brak wykonawcy wielobiegowego |
| P1-6 | Brak wyroczni zewnętrznej dla rodzin przekształtnikowych, magazynu i turbiny | macierz §6 |
| P1-7 | Brak powiązania przebiegów ze schematem | brak konsumenta |

### P2 — zakres do rozszerzenia

| Id | Luka |
|----|------|
| P2-1 | Turbiny typu 1 i 2 (`REFUSED_BY_CORE`) |
| P2-2 | Zwarcia niesymetryczne w torze czasowym (wymaga składowych symetrycznych — W6-4) |
| P2-3 | Wydzielenie na wyspę i ponowne załączenie jako nazwane zdarzenia |
| P2-4 | Wielkości mechaniczne toru skrętnego jako osobna grupa prezentacji |

---

## I. Wycinki wdrożeniowe

Dyrektywa §I jest wprost: „Do not attempt to fit everything into W6-3C." Podział poniżej jest
wykonaniem tego polecenia, nie odroczeniem — każdy wycinek ma zamknięty zakres i własną bramkę.

### I.1 W6-3C (POPRAWIONA karta — zastępuje unieważnioną)

**Zakres:** przestrzeń robocza „Dynamika i stabilność sieci SN" nad torem T2, w pełnym łańcuchu
punkt pracy → modele → scenariusz → nastawy → bieg → przebiegi/zdarzenia/kryteria/dowód.

**Poza zakresem (i powód, nie wymówka):**
* częstotliwość węzła i ROCOF — **nie ma ich w wyniku**; dodanie ich to zmiana fizyki rdzenia
  z własną walidacją (W6-3D), a fabrykowanie ich w interfejsie jest zakazane (§7);
* CCT — j.w. (W6-3E);
* prądy i przepływy gałęzi — j.w. (W6-3F);
* porównanie i przemiatanie — najpierw musi być dowiedziony deterministyczny bieg pojedynczy (§16);
* powiązanie ze schematem — W6-3G po ustabilizowaniu kontraktu wyboru przebiegu;
* tor T1 — **nie dotykamy do decyzji OD-28**.

**Bramki odbioru:** zero fizyki w interfejsie (guard `ui_no_physics_guard`); każda kontrolka
mapuje na realne pole kontraktu (zero fabrykacji); cztery statusy §F rozłączne na ekranie;
`UNVALIDATED_MODEL` widoczny; odmowy adaptera i rdzenia prezentowane z kodem; pełna regresja
frontu + backendu; werdykt wizualny właściciela (B-02).

### I.2 Kolejne wycinki

| Wycinek | Zakres | Warunek wstępny |
|---------|--------|-----------------|
| **W6-3D** | Częstotliwość węzła jako wielkość wyniku + ROCOF z udokumentowaną metodą różniczkowania, próbkowaniem, filtracją, obsługą brzegów i jednostką | decyzja o definicji częstotliwości węzła (OD-31) |
| **W6-3E** | Krytyczny czas usunięcia zwarcia jako wielkość wyznaczana: bracket → symulacja → klasyfikacja → bisekcja → tolerancja, z jawnym kryterium stabilności | W6-3C (bieg pojedynczy udowodniony) |
| **W6-3F** | Kanały prądu i przepływów gałęzi | — |
| **W6-3G** | Powiązanie przebiegów ze schematem (dwukierunkowe) | W6-3C |
| **W6-3H** | FRT/HVRT na rzeczywistych przebiegach RMS; kasacja zastępników `frt_hvrt/engine.py` i `voltage_trajectory.py` | OD-29, W6-3D (obwiednie odnoszą się też do częstotliwości) |
| **W6-3I** | Porównanie scenariuszy i przemiatanie parametryczne | W6-3C |
| **W6-3J** | Zabezpieczenia i automatyka jako zdarzenia dynamiczne | sprzężenie z domeną zabezpieczeń |
| **W6-4** | Zwarcia niesymetryczne (składowe symetryczne) | model fazowy (W5) |
| **W6-3W** | Wyrocznie zewnętrzne dla rodzin przekształtnikowych — warunek awansu z `UNVALIDATED_MODEL` | — |

### I.3 Do wykonania natychmiast, bez decyzji właściciela (Zero-Debt)

Te pozycje nie są decyzjami produktowymi, tylko długiem — wykonuję je bez pytania, niezależnie
od losu wycinków:

1. **P0-6** — kasacja martwego `network_model/solvers/stability_rms/**` procedurą kasacji
   (inwentarz → kasacja → bramka wskrzeszenia → dokumenty), wraz z retargetem czterech
   docstringów, które go przywołują.
2. **P0-7 / N-4** — docstring `MetrykaDynamicznaV1` wymienia `cct_s` i `rocof_max_hz_s` jako
   przykłady metryk, których rdzeń nie liczy; przykłady zastąpione wielkościami faktycznie
   emitowanymi, z testem przypiętym do rzeczywistego zbioru metryk (reguła KLASA §4).
3. **P0-7 / N-3** — `stability_index` opisany w interfejsie jako to, czym jest (średnia
   znormalizowanych marginesów progowych), albo usunięty z pierwszego planu.
4. **P0-7 / N-6** — nagłówek `frt_hvrt/engine.py` przestaje nazywać się „solverem RMS
   time-domain"; nazwa ma być zgodna z tym, co rejestr proweniencji już o nim mówi.

---

## J. Decyzje właściciela

| Id | Decyzja | Warianty | Rekomendacja |
|----|---------|----------|--------------|
| **OD-28** | Los toru T1 (`DYNAMIC_STABILITY` + ekran E-32) | (a) kasacja po udostępnieniu powierzchni T2; (b) zachowanie jako osobna, jawnie nazwana „ocena progowa" z wpisywanymi wielkościami; (c) przebudowa na warstwę interpretacji wyniku T2 (kryteria zostają, wpisywane stany znikają) | **(c)**, z kasacją pól klasy D/E. Wariant (b) utrwala odwrócenie wejścia i wyjścia; wariant (a) traci kryteria, które są wartościowe |
| **OD-29** | Los zastępników przebiegu: `application/stability/voltage_trajectory.py` i `frt_hvrt/engine.py` | (a) kasacja obu po W6-3H; (b) pozostawienie do czasu W6-3H z jawną etykietą „krzywa zastępcza, nie wynik symulacji"; (c) przeniesienie do warstwy solverów bez zmiany treści | **(b) teraz → (a) w W6-3H.** Wariant (c) legalizuje model zastępczy jako fizykę i jest gorszy niż obecny stan |
| **OD-30** | Definicja częstotliwości węzła dla W6-3D | (a) częstotliwość z pochodnej kąta napięcia węzła (wymaga filtracji, daje szum przy zdarzeniach); (b) częstotliwość z PLL jako pomiar urządzenia (istnieje w GFL); (c) częstotliwość „systemowa" z prędkości maszyn ważonej bezwładnością (poprawna tylko dla sieci sztywnej) | **(a) jako wielkość węzła + (b) jako pomiar urządzenia, rozłącznie nazwane.** Wariant (c) jest wielkością zastępczą i nie nadaje się dla sieci SN z przewagą przekształtników |
| **OD-31** | Czy powierzchnia W6-3C ma wejść BEZ częstotliwości, ROCOF i CCT | (a) tak — uczciwie, z jawną informacją o brakach; (b) nie — czekamy na W6-3D/E | **(a).** Rdzeń i tak liczy dziś więcej, niż produkt pokazuje; zwłoka nie dodaje fizyki, a odbiera inżynierowi dostęp do tego, co już jest |
| **OD-32** | Priorytet wyroczni zewnętrznych dla rodzin przekształtnikowych (W6-3W) względem rozszerzania zakresu | (a) wyrocznie przed nowymi wielkościami; (b) po | **(a)** — dopóki nie ma wyroczni, każda nowa wielkość powiększa powierzchnię `UNVALIDATED_MODEL` |

---

## K. Odpowiedzi na piętnaście pytań P0 (dyrektywa §27)

1. **Czy ekran stabilności da się pogodzić z rdzeniem RMS?** Nie bez zmiany znaczenia sześciu
   pól. Jego kryteria — tak (jako warstwa interpretacji). Jego formularz — nie.
2. **Które pola są wejściem, a które wyjściem?** Sekcja C, pełna klasyfikacja A–F obu torów.
3. **Czy `max_clearing_time_ms` to próg czy CCT?** Próg przyjęty, domyślnie 150 ms
   (`dynamic_stability.py:47`). Nie jest CCT.
4. **Jakie szeregi czasowe wystawia dziś `ResultSetDynamicV1`?** `u_pu@szyna`, `kat_deg@szyna`,
   komplet stanów każdego urządzenia, `p_pu@urządzenie`, `q_pu@urządzenie` (`silnik.py:555-605`).
5. **Jakie stany wewnętrzne ma każda rodzina?** Macierz §4; wektor stanu jest ZMIENNY — blok
   regulacji nieobecny nie tworzy stanu (`uklad_stanow.py:1-18`).
6. **Czy częstotliwość jest wielkością sieci, węzła, urządzenia czy pochodną?** Dziś: WYŁĄCZNIE
   urządzenia (prędkość wirnika, PLL). Wielkości węzła nie ma.
7. **Czy da się dziś podać obronialny ROCOF?** Nie. `NOT IMPLEMENTED`, zgodnie z §7.
8. **Jak lokalizowane są zdarzenia nieciągłe?** Krok skracany dokładnie do chwili zdarzenia,
   zdarzenie wykonane, re-inicjalizacja algebry, pomiar skoku i residuum
   (`zdarzenia.py:1-16`, `reinicjalizacja.py`).
9. **Czy dopuszczalna jest sekwencja wielu zdarzeń?** Tak, architektonicznie i wykonawczo;
   kolejność kanoniczna `(t_s, indeks)`.
10. **Czy tor FRT może dzielić przebiegi z RMS?** Docelowo tak, dziś nie — brak kanału prądu
    biernego wsparcia i brak częstotliwości; FRT liczy własną funkcję zadaną.
11. **Które rodziny mają niezależną wyrocznię?** Wyłącznie maszyna synchroniczna i klasyczna
    (ANDES + trzy wyrocznie analityczne). Pozostałe cztery — nie.
12. **Co blokuje awans z `UNVALIDATED_MODEL`?** Brak dowodu walidacji rodzin przekształtnikowych
    na sieci, nie brak biegów. Rejestr mówi to wprost (`provenance.py:344-352`).
13. **Co jest zablokowane wyłącznie brakiem interfejsu?** Cały tor T2: bieg, przebiegi, zdarzenia
    wykonane, metryki, White Box, tożsamość, odmowy. To jest zakres W6-3C.
14. **Co wymaga nowej fizyki?** Częstotliwość węzła, ROCOF, CCT, prądy i przepływy gałęzi,
    zwarcia niesymetryczne, zdarzenia zabezpieczeń i automatyki.
15. **Jaki tok pracy daje inżynierowi najwięcej informacji?** Sekcja G: jedna przestrzeń,
    trzy fazy, przeglądarka ze wspólną osią i znacznikami zdarzeń, cztery rozłączne statusy.

---

## L. Zamrożenie (dyrektywa §25) — dziesięć zdań wiążących

1. W6-3B jest wycinkiem pionowym, nie definicją produktu.
2. Istniejący ekran stabilności nie jest automatycznie powierzchnią docelową.
3. `STABLE`/`UNSTABLE` nie jest jedyną reprezentacją wyniku dynamicznego.
4. Wielkość wyznaczana przez solver nie wraca do produktu jako pole wpisywane.
5. FRT, symulacja RMS i ocena kryterialna mają jedną spójną architekturę, nie trzy równoległe.
6. Rodziny GFL, GFM, magazyn, maszyna synchroniczna i turbina pozostają rozróżnialne w modelu,
   wyniku i prezentacji.
7. Fizyka nieobsługiwana kończy się jawną odmową, nigdy podmianą na inną.
8. `UNVALIDATED_MODEL` pozostaje widoczny i wiążący.
9. Zakończony bieg nie jest walidacją fizyczną.
10. Celem jest środowisko badań dynamicznych sieci SN, nie ekran demonstracyjny.
