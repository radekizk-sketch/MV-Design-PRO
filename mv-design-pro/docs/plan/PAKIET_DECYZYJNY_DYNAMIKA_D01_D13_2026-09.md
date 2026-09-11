# PAKIET DECYZYJNY — PROGRAM SYMULACJI DYNAMICZNYCH (D-01 … D-13)

**Typ dokumentu:** materiał decyzyjny (PRE-DECISION) — **nie** plan obowiązujący,
**nie** architektura kanoniczna, **nie** dowód regulacyjny
**Status:** CLAIMED READY FOR FABLE ARCHITECTURAL REVIEW
**Data:** 2026-09-10
**Gałąź:** `claude/opus5-dynamic-prearchitecture-lab`
**Poprzedniki:** `docs/plan/KARTA_MAX_DYNAMIC_SIMULATION_AUDIT_2026-09.md` (audyt, §33 = rejestr D-00…D-13)
**Adresat:** Fable jako Lead Principal Engineer — właściciel decyzji architektonicznych

> **GRANICA TEGO DOKUMENTU.** Dokument **nie ustanawia** żadnej architektury
> kanonicznej, **nie zastępuje** żadnego kontraktu FROZEN, **nie przyznaje**
> żadnego statusu dowodowego. Kod, do którego się odwołuje (`backend/research/`),
> jest **odizolowanym prototypem badawczym** — strukturalnie odciętym od produkcji
> (`pyproject.toml::packages` go nie zawiera, `research_isolation_guard` pilnuje
> granicy w CI). Prototyp wolno przyjąć, zmienić w całości albo wyrzucić bez
> żadnego kosztu dla produktu; nic produkcyjnego z niego nie korzysta.
>
> Jedyne, co ten dokument robi z produkcją, to **bezpiecznik dowodowy D-00**
> (decyzja właściciela z 2026-09-10: FAIL CLOSED), który był rozstrzygnięty
> przed tą pracą i jest już wdrożony.

---

## 0.0 ERRATA — sprostowania po przeglądzie kontradyktoryjnym (runda 2)

Dokument jest materiałem decyzyjnym, więc jego błędy prostuję **widocznie**, a
nie cichą edycją. Sześć twierdzeń z rundy 1 było za mocnych albo błędnych.

| # | Twierdzenie z rundy 1 | Co jest prawdą (zmierzone) | Gdzie poprawione |
|---|---|---|---|
| 1 | „maszyna 4. rzędu + AVR + turbina, **zgodna z ANDES do 8e-09**" | Twierdzenie było za mocne **dla przypadku, na którym je oparto**: GENCLS z redukcją `Xd = Xd'` nie obejmuje dynamiki `E'`, AVR ani turbiny. Luka **została zamknięta w rundzie 2** osobnym przypadkiem GENROU + SEXS + TGOV1 — widmo zgodne 1,2e-08 … 3,0e-08, mody bez odpowiednika NAZWANE (`−1/Td0''`, `−1/Tq0''`, `−1/TB`). Poza zakresem pozostają PSS, nasycenie i ograniczniki. | §5.1 (co obejmował GENCLS) + §5.1b (czym domknięto) |
| 2 | Jedna liczba „8e-09" jako dokładność walidacji | To był błąd JEDNEJ wielkości. Metryki są różne i rozdzielone: kąt 8,4e-09, SEM 7,1e-09, moduł napięcia 7,5e-09, kąt napięcia 5,4e-08, częstotliwość 6,0e-06. **Błąd trajektorii punkt-po-punkcie: NIE ZMIERZONY.** | §5.2 |
| 3 | „**pełny rdzeń DAE**" | To **schemat rozdzielony z eliminacją algebraiczną** (sekwencyjny niejawny), a nie solver rozwiązujący Newtonem jednocześnie po `x` i `y`. Integrator widzi zwykłe ODE. | §3.1, §3.2 |
| 4 | „wszystkie cztery integratory zbiegają **na układzie sztywnym**" | Zadanie porównawcze było **niesztywne** (jedna maszyna klasyczna, brak szybkich stałych). Twierdzenie o sztywności było nieprawdziwe. | §18, `sztywnosc.py` |
| 5 | CCT „85 / 100 / 300 ms" dla `H` = 2 / 4 / 8 | Wartości **błędne i nieodtwarzalne** (pochodziły ze skryptu roboczego, którego nie ma). Obowiązują **298 / 422 / 599 ms**, zgodne z zamkniętym wzorem kryterium równych pól w granicach 0,04–0,51 %. Fizyka laboratorium jest przy tym **bajtowo identyczna** od pierwszego commitu — to była różnica pomiaru, nie modelu. | §19.1 |
| 6 | D-00: „**graf konsumentów domknięty**", „6 końcówek dokumentowych" | **Obalone pomiarem.** Polowanie na obejścia (87 kandydatów, 15 potwierdzonych, 72 odrzucone) znalazło m.in.: bramkę dowodową działającą **fail-open** (pomijała 12 z 20 testów bez klasyfikacji), eksport DOCX/PDF przebiegu drukujący „Status=STABLE" bez statusu dowodowego, oraz zielone werdykty FRT we froncie z pola `evidence`, które warstwa UI gubiła. | §20.5, `test_dynamic_evidence_dokumenty.py` |

Sprostowania **nie zmieniają** żadnej rekomendacji ani żadnego pytania
decyzyjnego. Zmieniają to, ile wolno na podstawie tego materiału twierdzić.

---

## 0. Jak czytać ten dokument

Każda pozycja D-xx ma pięć części i **żadna z nich nie jest decyzją**:

| Część | Co zawiera | Czego NIE zawiera |
|---|---|---|
| **FAKT** | Stan zmierzony na kodzie: liczby, ścieżki, wyniki uruchomień | ocen, rekomendacji |
| **WYMAGANIE** | Co każde rozwiązanie MUSI spełniać, żeby w ogóle wchodziło w grę | wyboru rozwiązania |
| **WARIANTY** | Realne opcje z konsekwencjami, kosztami i tym, co każda przesądza | wskazania „ten" |
| **SPIKE** | Co zostało **wykonane i zmierzone**, żeby wariant przestał być hipotezą | obietnic |
| **DECYZJA FABLE** | Pytanie postawione tak, żeby dało się na nie odpowiedzieć jednym zdaniem | odpowiedzi |

**Czym jest SPIKE.** Wykonywalnym eksperymentem, nie szkicem. Każdy podany
niżej wynik liczbowy pochodzi z uruchomienia kodu w tej sesji i da się go
powtórzyć poleceniem podanym przy pozycji. Tam, gdzie spike nie powstał,
napisane jest wprost „SPIKE: brak" wraz z powodem — bo brak eksperymentu jest
informacją decyzyjną, a nie luką do zamaskowania.

**Czego tu świadomie NIE ma.** Rekomendacji ważonych. Audyt (§33) podał swoje
rekomendacje i one zostają. Ten dokument dokłada do nich POMIAR, żeby decyzja
nie opierała się na cudzej ocenie — także nie na mojej.

---

## 1. Skrót — stan przygotowania każdej pozycji

| ID | Pozycja | Przygotowanie | Co konkretnie powstało | Blokuje |
|---|---|---|---|---|
| **D-00** | Bramkowanie dowodu regulacyjnego | **ROZSTRZYGNIĘTE I WDROŻONE** (FAIL CLOSED) | trzecia oś proweniencji `EvidenceTier`, bezpiecznik w `zbierz_braki`, 6 końcówek dokumentowych domkniętych, 26 testów | — |
| **D-01** | Struktura programu (W1–W12 czy `PLANS.md`) | materiał | inwentarz dokumentów, koszt obu wariantów | planowanie |
| **D-02** | Rdzeń RMS: rozszerzyć czy wymienić | **PROTOTYP DZIAŁA** | działający rdzeń DAE ze sprzężeniem sieciowym; `‖f(x₀,y₀)‖ = 2,98e-13` | ścieżkę krytyczną |
| **D-03** | Zgoda B-01 na wymianę kontraktów FROZEN | materiał + kandydat | inwentarz phantomów, kandydat kontraktu wyniku | D-02 |
| **D-04** | Kolejność rodzin źródeł | **PROTOTYP + WALIDACJA ZEWNĘTRZNA O NAZWANYM ZAKRESIE** | maszyna 4. rzędu, AVR i turbina zwalidowane wobec ANDES GENROU/SEXS/TGOV1 (widmo 1,2e-08 … 3,0e-08); poza zakresem: PSS, nasycenie, ograniczniki — §5.1 i §5.1b | D-02 |
| **D-05** | Rozdzielenie ewaluatora od fizyki | **KONSTRUKCYJNIE POKAZANE** | w prototypie ocena FRT jest typowo niemożliwa do zapętlenia | przyczynę P0-01 |
| **D-06** | Dwie ścieżki stabilności / dwie implementacje NC RfG | **ZMIERZONE — są TRZY** | trzecia (martwa) implementacja we froncie, trzeci słownik werdyktów | rozjazd |
| **D-07** | Zakres PPC / hybryd | materiał | wymagania z PCC, czego brakuje w modelu urządzenia | ewaluator |
| **D-08** | Kanoniczny model wyniku dynamicznego | **KANDYDAT KONTRAKTU** | `WynikDynamiczny` z tożsamością, diagnostyką i odciskiem | dowody, walidację |
| **D-09** | Tryby EXPLORATORY / ENGINEERING / REGULATORY_EVIDENCE | **WDROŻONE (produkcja) + PROTOTYP (model zaufania)** | oś `EvidenceTier` + reguła fail-closed; osobno działający prototyp „status wyprowadzany, nie nadawany” | całą klasę P0 |
| **D-10** | Wersjonowanie profili WOS | materiał | pomiar identyczności 5 profili | dezaktualizację |
| **D-11** | Wyrocznia zewnętrzna dla dynamiki | **WYROCZNIA URUCHOMIONA** | ANDES 2.0.0, zgodność trójstronna, pułapka 60 Hz zakodowana | dowód poprawności |
| **D-12** | Zakres modeli OEM | materiał | interfejs urządzenia z prototypu jako kandydat na punkt wtyczkowy | — |
| **D-13** | Co zrobić z `stability_rms` przed nowym rdzeniem | materiał + pomiar | co dziś deklaruje readiness dla tej ścieżki | komunikat dla projektanta |

**Cztery sprawy kanoniczne** (nie mają numeru D, a wymagają rozstrzygnięcia): §15.

---
## 2. D-01 — Czy powołać strukturę programu (W1–W12) czy rozszerzyć `PLANS.md`

**FAKT.** Audyt §4 ustalił, że dokumenty `MAPA_DOMKNIECIA`, `CONVERGENCE_ROADMAP`,
`PRODUCT_CAPABILITY_CONSTITUTION`, `CANONICAL_TWIN_ARCHITECTURE`,
`DECISION_FREEZE_REGISTER` oraz karty W1–W12 **nie istnieją w repozytorium**.
Obowiązująca hierarchia dokumentów (`CLAUDE.md`, „Document Hierarchy") ma dziesięć
poziomów i nie przewiduje poziomu dla programu dynamicznego. Rejestr stanu i długu
(`STAN_REPO.md`) prowadzi własną numerację D-01…D-16, **niezależną od numeracji
D-01…D-13 z §33 audytu** — dwa różne rejestry, ta sama forma identyfikatora.

**WYMAGANIE.** Program dynamiczny dotknie: warstwy solverów, kontraktów FROZEN,
API, ENM, katalogów i UI. Struktura musi (a) wskazywać JEDNO miejsce, w którym
zapada decyzja o kolejności, (b) nie tworzyć trzeciej numeracji identyfikatorów.

**WARIANTY.**

| Wariant | Konsekwencja | Koszt |
|---|---|---|
| (a) nowa struktura W1–W12 | osobna przestrzeń kart, jasny podział na wycinki | trzeba wpisać ją do „Document Hierarchy" i pogodzić z `STAN_REPO.md` |
| (b) rozszerzenie `PLANS.md` + jeden dokument programu | zero nowych poziomów hierarchii | `PLANS.md` jest LIVING i już duży |

**SPIKE: brak.** To decyzja o formie zapisu, nie o technice — eksperyment nie
rozstrzygnąłby jej, a udawana „ocena wykonalności" byłaby tu ozdobnikiem.

**DECYZJA FABLE.** Która struktura, i **co zrobić z kolizją numeracji D-xx**
między `STAN_REPO.md` a §33 audytu (te same identyfikatory, inne znaczenia).
Kolizja jest realna już dziś, niezależnie od wyboru struktury.

---

## 3. D-02 — Rdzeń RMS: rozszerzyć istniejący czy zbudować nowy

**FAKT (zmierzony na kodzie).**

| Pomiar | Wartość |
|---|---|
| `network_model/solvers/stability_rms/` | 2 pliki, 603 linie (`contracts.py` 179, `engine.py` 391) |
| odwołania do Ybus / macierzy sieci w `engine.py` | **0** |
| pola kontraktu FROZEN nieczytane przez silnik | `enm_ref` (0 użyć), `target_ref` (0 użyć), `integrator` (tylko komentarz w nagłówku), `white_box_trace_path` (docstring nazywa je „placeholder") |
| laboratorium badawcze (dla skali porównawczej) | 13 modułów, 3 208 linii |

Silnik produkcyjny całkuje **rozprzężone równania skalarne**: elementy nie widzą
siebie nawzajem, bo nie ma warstwy algebraicznej sieci. To nie jest brak funkcji
do dołożenia — to własność kontraktu (`StabilitySolverInput` nie niesie
topologii), więc „rozszerzenie" oznacza i tak jego wymianę.

**WYMAGANIE.** Rdzeń musi rozwiązywać układ DAE: `ẋ = f(x,y,u,p,t)` przy
`0 = g(x,y,u,p,t)`, gdzie `y` to zespolone napięcia węzłowe będące ROZWIĄZANIEM
`Ybus·V = I_wstrzyk(x,V)`, a nie stałą. Zdarzenie musi zmieniać MODEL SIECI
(bocznik zwarciowy `Zf`, wyłączenie gałęzi), a napięcie ma być tego skutkiem.

**SPIKE — WYKONANY, DZIAŁA.** `backend/research/dynamic_lab/` implementuje
rdzeń: `siec.py` (Ybus, ekwiwalenty Nortona, iteracja części nieliniowej),
`silnik.py` (pętla + inicjalizacja + weryfikacja równowagi), `zdarzenia.py`
(zdarzenia jako zmiana topologii), `calkowanie.py` (cztery integratory za jednym
kontraktem).

### 3.1 CZYM DOKŁADNIE JEST TEN RDZEŃ — klasyfikacja, nie hasło

Określenie „pełny rdzeń DAE" jest mylące i tu je precyzuję, bo sugeruje solver
monolityczny, którym ten prototyp NIE jest.

| Cecha | Ten prototyp |
|---|---|
| Sformułowanie | `ẋ = f(x, y)`, `0 = g(x, y)` — **układ DAE indeksu 1** |
| Sposób rozwiązania | **eliminacja algebraiczna wewnątrz ewaluacji `f`**: dla zadanego `x` rozwiązywane jest `g(x, y) = 0` względem `y`, po czym integrator dostaje `dx/dt = F(x, t) = f(x, y(x), t)` |
| Co widzi integrator | zwykłe **ODE** — nie ma zmiennych algebraicznych w wektorze stanu |
| Jakobian metody niejawnej | wyłącznie po `x` (wymiar = liczba stanów dynamicznych) |
| Sprzężenie z siecią | **realne**: zmiana `Ybus` zmienia `y`, a przez nie prądy, moce i pochodne wszystkich urządzeń |

Nazwa właściwa: **schemat rozdzielony (partitioned) z eliminacją algebraiczną**,
wariant „sekwencyjny niejawny" w klasyfikacji narzędzi RMS. **NIE** jest to
solver DAE rozwiązujący Newtonem jednocześnie po `x` i `y` (schemat
symultaniczny / „simultaneous implicit"), którego jakobian ma wymiar
`len(x) + 2·len(y)`.

Docstring `silnik.py` mówił to od początku poprawnie („schemat rozdzielony…
integrator widzi zwykłe ODE"); mylące było streszczenie w tym pakiecie.

### 3.2 Ograniczenia schematu rozdzielonego — materiał dla Fable, nie decyzja

| Zjawisko | Konsekwencja dla schematu rozdzielonego |
|---|---|
| **Silna sztywność** | Metoda niejawna stabilizuje tylko część `x`; algebra sieci jest rozwiązywana do zbieżności w każdej ewaluacji, więc koszt rośnie liniowo z liczbą ewaluacji, a nie z liczbą kroków. Przy szybkich pętlach regulatorów rośnie gwałtownie. |
| **Ograniczniki i przełączenia** | Nieciągłość `f` wewnątrz kroku psuje jakobian numeryczny; schemat symultaniczny może wykryć przełączenie jako zdarzenie algebraiczne, rozdzielony musi je „przecałkować". Zmierzone w tym prototypie: ogranicznik AVR ograniczający pochodną, ale nie żądanie, dawał cykl graniczny Newtona dokładnie w chwili zwarcia. |
| **Osobliwość algebraiczna** | Gdy `g` traci rozwiązanie (wyspa bez źródła, zwarcie metaliczne w węźle bez admitancji), ewaluacja `f` **rzuca wyjątek** zamiast zwrócić pochodną. Schemat symultaniczny widzi to jako osobliwość jakobianu i może zredukować krok. |
| **Wyspy** | Każda wyspa musi mieć własne odniesienie kątowe; przy eliminacji algebraicznej brak odniesienia objawia się jako osobliwość, a nie jako brak fizyki. |
| **GFM z ograniczeniem prądu** | Przejście źródło napięciowe → źródło prądowe zmienia STRUKTURĘ `g`, nie tylko jego wartość. To najtrudniejszy przypadek dla obu schematów; zmierzone zachowanie prototypu jest osobnym eksperymentem. |
| **PLL** | Wnosi szybką dynamikę do `x` i sprzężenie zwrotne przez `y`; w schemacie rozdzielonym opóźnienie o jedną ewaluację może zaniżyć tłumienie. |
| **Zmiany topologii** | Tanie: przebudowa `Ybus` między krokami. Zaleta schematu rozdzielonego. |
| **Wiele urządzeń na jednej szynie** | Obsługiwane przez sumowanie wstrzyknięć; problem pojawia się dopiero, gdy dwa urządzenia narzucają napięcie tej samej szyny (dwa GFM bez impedancji wirtualnej) — wtedy `g` jest źle uwarunkowane. |

Zmierzone własności:

| Własność | Wynik | Co dowodzi |
|---|---|---|
| Norma pochodnej w punkcie startowym | `‖f(x₀,y₀)‖ = 2,98e-13` | start JEST równowagą — przebieg nie jest artefaktem rozruchu |
| Zgodność `delta₀`, `E'`, `V` z ANDES | 8,4e-09 / 7,1e-09 / 7,5e-09 | inicjalizacja i warstwa algebraiczna liczą to samo, co narzędzie zewnętrzne |
| Zależność wyniku od impedancji sieci, bezwładności, czasu wyłączenia i głębokości zwarcia | zmierzona, monotoniczna | sieć realnie wchodzi do wyniku (defekt P0-02 nie jest odtwarzalny) |

Powtórzenie: `cd backend && PYTHONPATH=research python -m pytest tests/research -q`.

**WARIANTY.**

| Wariant | Konsekwencja |
|---|---|
| (a) rozszerzyć `stability_rms` | kontrakt trzeba wymienić i tak (D-03); zostaje 391 linii, których nic nie używa poza własnymi testami |
| (b) nowy rdzeń, stary usunąć | wymaga D-03 i D-13; prototyp pokazuje, że rdzeń mieści się w ~1 200 liniach z testami |
| (c) rdzeń zewnętrzny (ANDES jako silnik, nie wyrocznia) | znosi koszt budowy, ale wprowadza zależność licencyjną i utratę kontroli nad WHITE BOX; **nie badane** poza użyciem jako wyrocznia |

**DECYZJA FABLE.** Wariant (a) / (b) / (c). Prototyp jest materiałem do wariantu
(b) i **nie jest propozycją kontraktu produkcyjnego** — kod wolno wyrzucić.

---

## 4. D-03 — Zgoda B-01 na wymianę kontraktów FROZEN

**FAKT.** Cztery pola kontraktów FROZEN nie są czytane przez żaden silnik
(pomiar w §3). Kontrakt obiecuje więc zdolności, których implementacja nie ma:
wybór integratora (`integrator`), wskazanie miejsca zdarzenia (`target_ref`),
powiązanie z migawką sieci (`enm_ref`) i ślad WHITE BOX (`white_box_trace_path`).

**WYMAGANIE.** Reguła 6 z `CLAUDE.md` („Frozen Result API") wymaga bumpu wersji
major przy zmianie. Reguła 2 („WHITE BOX") wymaga, żeby ślad istniał. Dziś
obie są w konflikcie: zamrożony kontrakt utrwala pola-obietnice.

**SPIKE — CZĘŚCIOWY.** `research/dynamic_lab/wynik.py` jest **kandydatem**
kontraktu wyniku (nie zamiennikiem): niesie oś czasu, sygnały z jednostkami i
przypisaniem do elementu, tożsamość modelu z odciskiem parametrów, diagnostykę
numeryczną (integrator, krok, liczba ewaluacji, residuum sieci, zbieżność,
`‖f(x₀,y₀)‖`), odciski scenariusza i topologii oraz odcisk całości.
Zasada projektowa: **wynik musi dać się odtworzyć i obalić** — bez tożsamości
modelu nie da się orzec, czy różnica dwóch biegów to różnica fizyki, czy nastaw.

**DECYZJA FABLE.** (a) zgoda na wymianę · (b) wersjonowanie major · (c) zachowanie
kontraktów. Uwaga faktograficzna: wariant (c) utrwala pola, których nikt nie
czyta — to jest ta sama klasa, którą audyt nazwał „zdolność zgłoszona nazwą".

---

## 5. D-04 — Kolejność rodzin źródeł

**FAKT.** Audyt §5: 19 nazw modeli w systemie odpowiada 8 zestawom równań;
rodzina synchroniczna nie ma **żadnego** modelu, a readiness wyklucza projekt
z samymi maszynami synchronicznymi komunikatem „nie dotyczy" (§24.1).

**WYMAGANIE.** Pierwsza rodzina musi (a) definiować problem stabilności
kątowej, żeby rdzeń dało się zwalidować, (b) mieć dostępną wyrocznię.

**SPIKE — WYKONANY; WALIDACJA ZEWNĘTRZNA O WĄSKIM, NAZWANYM ZAKRESIE.**
Zaimplementowano maszynę synchroniczną 4. rzędu (`delta, omega, E'q, E'd`) z
równaniami stojana, transformacją `dq↔sieć` przez `delta − π/2`, oraz zespół z
AVR i regulatorem turbiny o **zamkniętych** pętlach (6 stanów). Procedura
inicjalizacji jest wyprowadzona krok po kroku, nie zgadnięta
(`urzadzenia.punkt_pracy`).

### 5.1 Co ANDES zwalidował, a czego NIE — rozstrzygnięcie sprzeczności

Pierwsza wersja tego pakietu pisała w tabeli skrótu „maszyna 4. rzędu + AVR +
turbina, zgodna z ANDES do 8e-09", a w §12 poprawnie zastrzegała, że przypadek
używa GENCLS i nie waliduje regulatorów. **Sprzeczność rozstrzygam na korzyść
§12**: tabela skrótu była za mocna.

Przyczyna jest równaniowa, nie redakcyjna. Przypadek porównawczy używa
`benchmarki.maszyna_klasyczna`, czyli modelu 4. rzędu z `Xd = Xd'` i `Xq = Xq'`.
Przy tej redukcji człony `(Xd − Xd')·Id` i `(Xq − Xq')·Iq` **znikają**, więc:

| Równanie modelu 4. rzędu | Czy weszło do porównania z ANDES |
|---|---|
| `dδ/dt = ω_s (ω − 1)` | **TAK** |
| `2H dω/dt = Pm − Pe − D(ω−1)` | **TAK** |
| równania stojana `Id, Iq` z `E'd, E'q, Ra, Xd', Xq'` | **TAK** |
| transformacja `dq ↔ sieć` przez `δ − π/2` | **TAK** |
| inicjalizacja `E = V + (Ra + jXq)·I`, `δ = arg(E)` | **TAK** |
| `dE'q/dt = (Efd − E'q − (Xd − Xd')·Id) / Td0'` | **NIE w przypadku GENCLS** — człon zeruje się z założenia |
| `dE'd/dt = (−E'd + (Xq − Xq')·Iq) / Tq0'` | **NIE w przypadku GENCLS** — jw. |
| AVR (`RegulatorNapiecia`) | **NIE w przypadku GENCLS** — GENCLS nie ma wzbudnicy |
| regulator turbiny (`RegulatorTurbiny`) | **NIE w przypadku GENCLS** — `Pm = const` |
| PSS | **NIE** — nie ma go w laboratorium |
| ogranicznik AVR (żądanie i pochodna) | **NIE** — wyłącznie testy własne |

Na przypadku GENCLS zwalidowane zewnętrznie jest zatem **jądro
elektromechaniczne wraz z warstwą algebraiczną i inicjalizacją**, a nie
„dynamika 4. rzędu z regulatorami".

### 5.1b DOMKNIĘCIE LUKI — przypadek GENROU + wzbudnica + turbina

Luka z tabeli wyżej **została zamknięta w tej samej transzy**
(`research/dynamic_lab/wzorzec_genrou.py`). Zakres zgodności jest WYNIKIEM
pomiaru, nie założeniem — i okazał się szerszy, niż zakładałem:

**Ustalenie 1: GENROU redukuje się DOKŁADNIE do modelu dwuosiowego** — na dwa
niezależne sposoby, oba zmierzone:

*Droga R1* (`Xd'' = Xd'`, `Xq'' = Xq'`, `S10 = 0`): współczynniki podziału
strumienia stają się `γd1 = γq1 = 1`, `γd2 = γq2 = 0`, jakobian jest blokowo
trójkątny i stany tłumików odsprzęgają się.

| Wielkość (SMIB, `Xd`=1,9 `Xq`=1,7 `Xd'`=`Xq'`=0,3 `Td0'`=8 s `Tq0'`=0,8 s) | Błąd względny lab vs ANDES |
|---|---|
| `δ₀` | 4,06e-09 |
| `E'q` | 1,01e-08 |
| `E'd` | 1,16e-09 |
| `Efd` | 3,71e-10 |
| **całe widmo 4 modów** | **1,21e-08** |

Dwa mody ANDES bez odpowiednika po naszej stronie to **dokładnie** `−1/Td0''`
i `−1/Tq0''` — zgodność **co do bitu**, sprawdzona dla czterech par stałych
tłumików. To nie jest zbieżność przypadkowa: to identyfikacja modów, których
nasz model 4. rzędu z założenia nie ma.

*Droga R2* (`Td0'' → 0` przy CZYNNYM odstępie `Xd'' = 0,20`): błąd modu maleje
**liniowo** — 5,92e-02 (50 ms) → 1,26e-03 (1 ms), iloraz stały ≈ 1,25 s⁻¹. To
dowodzi, że różnica pochodzi z dynamiki tłumików, a nie z błędu modelu.

**Ustalenie 2: regulatory zwalidowane w części wspólnej.**

| Porównanie | Warunek równoważności | Zmierzony błąd widma |
|---|---|---|
| `RegulatorNapiecia` ↔ **SEXS** | `TA = TB` (człon lead-lag tożsamościowy) | 1,15e-08 … 1,10e-07 na iloczynie `K_a ∈ {50, 200, 400}` × `T_a ∈ {0,02; 0,05; 0,2}` |
| `RegulatorTurbiny` ↔ **TGOV1** | `T2 = T3`, `Dt = 0` | 1,19e-08 … 1,24e-08 na iloczynie `R ∈ {0,02; 0,05; 0,10}` × `T_g ∈ {0,2; 0,5; 1,5}` |
| **oba naraz** | j.w. | 1,55e-08 … 3,04e-08, sześć modów, **zero** zer strukturalnych |

Mody ANDES bez odpowiednika są nazwane: `−1/Td0''`, `−1/Tq0''`, `−1/TB`.

**Ustalenie 3: zwalidowane jest też CAŁKOWANIE, nie tylko równania.** Mod
odczytany z trajektorii RK4 (regresja po ekstremach) wobec wartości własnej
ANDES: **6,1e-05** przy zaburzeniu 0,5°, 5,1e-05 przy 2° — tym razem z
niezerowym tłumieniem (`σ = −1,0263`), którego przypadek GENCLS nie miał.

**Ustalenie 4 — luka wykryta i zamknięta w tej samej pracy.** ANDES wymusza
`Xd'' = Xq''`, więc droga R1 wymaga `Xd' = Xq'`, a domyślna, realistyczna
parametryzacja laboratorium (`Xd' = 0,30`, `Xq' = 0,55`) zostawałaby poza
walidacją. Domknięte drogą R2: punkt pracy dokładny (1,0e-08) niezależnie od
`Td0''`, a błąd widma maleje jak `1,096 · Td0''`.

**Co po tym pozostaje niezwalidowane zewnętrznie:** PSS (nie ma go w
laboratorium), ograniczniki AVR (ANDES SEXS ma inne), nasycenie obwodu
magnetycznego (`S10`/`S12` — nasz model go nie ma), oraz modele przekształtnikowe.

### 5.2 Zgodność liczbowa — OSOBNE metryki, nie jedna liczba

Podawanie jednego „8e-09" jako dokładności całej walidacji było mylące: to był
błąd JEDNEJ wielkości, a nie wspólna miara. Rozdzielone:

| Metryka | Co porównuje | Wartość (błąd względny) |
|---|---|---|
| **Błąd punktu pracy — kąt** | `δ₀` z inicjalizacji vs ANDES | 8,4e-09 |
| **Błąd punktu pracy — SEM** | `E'` z inicjalizacji vs ANDES | 7,1e-09 |
| **Błąd napięcia — moduł** | `\|V_gen\|` z `Ybus·V = I` vs ANDES | 7,5e-09 |
| **Błąd napięcia — kąt** | `arg(V_gen)` vs ANDES | 5,4e-08 |
| **Błąd częstotliwości małosygnałowej** | `f_osc` z trajektorii vs wartość własna ANDES | 6,0e-06 |
| **Błąd wzoru analitycznego** | `ωₙ = √(ω_s·P_s/2H)` vs wartość własna ANDES | 3,9e-09 |
| **Błąd trajektorii (punkt po punkcie)** | — | **NIE ZMIERZONY** |

Ostatni wiersz jest istotny: porównywane są *wielkości skalarne wyprowadzone z*
trajektorii, a nie trajektoria z trajektorią. Porównanie punkt-po-punkcie
wymagałoby wyeksportowania przebiegu z ANDES na wspólnej siatce i nie zostało
zrobione.

### 5.3 Trzecia oś — zachowanie DUŻOSYGNAŁOWE

Wszystkie metryki wyżej dotyczą MAŁYCH zaburzeń. Model może być poprawny
małosygnałowo i błędny dużosygnałowo. Domyka to niezależna wyrocznia
analityczna kryterium równych pól (§19.1): CCT z symulacji zgadza się z
zamkniętym wzorem w granicach **0,04–0,51 %** dla `H` od 1 do 16 s.

**Znaleziony i naprawiony w prototypie defekt klasy, która wróci w produkcji:**
ogranicznik AVR ograniczał POCHODNĄ wzbudzenia, ale nie ŻĄDANIE regulatora.
Przy `K_a·(V_ref − V_t) ≈ 88 p.u.` predyktor wychodził na 22 p.u. przy suficie
5 p.u., co dawało cykl graniczny residuum Newtona **dokładnie w chwili zwarcia**
(23,3 ↔ 18,5). Diagnoza wymagała instrumentacji residuum — trzy kolejne hipotezy
(pamięć ciepłego startu, nieciągłość FRT, ogranicznik prądu) zostały obalone
pomiarem. Wniosek do przeniesienia: **ogranicznik musi ograniczać żądanie, nie
tylko pochodną**; inaczej niejawne integratory tracą zbieżność na zdarzeniu.

**DECYZJA FABLE.** (a) synchroniczne najpierw · (b) przekształtnikowe najpierw ·
(c) równolegle. Pomiar mówi tylko tyle, że wariant (a) jest **wykonalny i
weryfikowalny wyrocznią** — nie że jest właściwy dla produktu, którego rynkiem
są sieci SN zdominowane przez DER.

---

## 6. D-05 — Rozdzielenie ewaluatora wymagań od wytwarzania fizyki

**FAKT (dowód wykonawczy z audytu §21.1).** Test T14/T15 zwracał
`simulated_voltage = limiting.voltage_pu`, a następnie `margin = simulated_voltage
− limiting.voltage_pu`, czyli **zawsze 0,0 i zawsze `pass`**. Siedem różnych
wejść dawało identyczny wynik. Przyczyną strukturalną było to, że ewaluator sam
wytwarzał „przebieg", zamiast czytać cudzy.

**WYMAGANIE.** Ewaluator wymagań MUSI konsumować wynik obcy sobie. Konstrukcja
ma czynić zapętlenie **niemożliwym typowo**, nie tylko zakazanym w regule.

**SPIKE — WYKONANY, POKAZANE KONSTRUKCYJNIE.** W `research/dynamic_lab/frt.py`
wymaganie (`ObwiedniaFrt`) i wynik (`PrzebiegNapiecia`) to **różne typy**, więc
podstawienie obwiedni w miejsce przebiegu nie kompiluje się semantycznie.
Konstruktor przebiegu dodatkowo ODRZUCA źródła `("obwiednia_profilu", "profil",
"wymaganie")` z komunikatem zawierającym słowo „fabrykacja" — bo typ chroni przed
pomyłką, a jawny warunek przed obejściem typu.

W produkcji ta sama tautologia została **zablokowana inaczej** (D-00): test
zwraca `no_data`, ślad niesie formułę `U_wymagane(t) = obwiednia profilu operatora
[brak przebiegu U_sym(t)]`, a metryka `simulated_trajectory_available: False`.
To jest bezpiecznik, **nie** rozwiązanie — rozwiązaniem jest D-05.

**DECYZJA FABLE.** (a) ewaluator wyłącznie konsumujący `ResultSet` · (b) status quo.

---
## 7. D-06 — Dwie ścieżki stabilności i dwie implementacje NC RfG

**FAKT — KOREKTA AUDYTU: implementacje NC RfG są TRZY, nie dwie.**

| # | Implementacja | Przestrzeń ID testów | Słownik werdyktów | Żywa? |
|---|---|---|---|---|
| 1 | `network_model/solvers/ncrfg_ptpiree/engine.py` | `T01`…`T20` (20, wiodące zero) | test: `pass/fail/no_data/not_required`; moduł: `zgodny/niezgodny/brak_danych` | TAK — certyfikat, wniosek OSD, API |
| 2 | `application/ncrfg_compliance/checker.py` | `T1`…`T18` (18, bez zera) | test: `pass/fail/no_data/**no_module**` | TAK — końcówka `run_ncrfg_compliance_from_model` |
| 3 | `frontend/.../station-der/NcRfgComplianceBadge.tsx` | brak ID — lista 5 pozycji | `compliant/audit_required/non_compliant` | **NIE** — patrz niżej |

Trzecia implementacja: `evaluateNcRfgCompliance` ocenia zgodność NC RfG
**po stronie klienta**, z pięciopozycyjnej listy kontrolnej (FRT, cos φ(P), Q(U),
anti-islanding, certyfikat PTPiREE), i wydaje własny werdykt. Jest używana przez
`DerValidationBanner.tsx`, a ten **nie jest importowany nigdzie** poza własnymi
testami (sprawdzone na całym `src/` i `e2e/`). To martwa wyspa, którą przy życiu
trzymają wyłącznie jej testy — czyli dokładnie ten stan, w którym „zielone testy"
maskują brak ścieżki użytkownika.

Dwie ścieżki stabilności potwierdzone: `network_model/solvers/stability_rms/`
oraz `application/stability/{dynamic_stability,voltage_trajectory}.py`.

**Uwaga normatywna:** słownik implementacji 2 zawiera literalne `no_module`,
którego `CLAUDE.md` (ZASADA NR 1) zakazuje wprost.

**WYMAGANIE.** `CLAUDE.md` zakazuje dwóch ścieżek tej samej fizyki. Rozstrzygnięcie
musi objąć **wszystkie trzy** implementacje i **wszystkie trzy** słowniki — usunięcie
jednej z dwóch backendowych zostawia trzeci werdykt we froncie.

**SPIKE: brak — świadomie.** Usunięcie którejkolwiek implementacji JEST wykonaniem
D-06, a nie przygotowaniem do niego. Kontrakt tej sesji rezerwuje tę decyzję dla
Fable, więc martwa wyspa została **zmierzona i opisana, nie skasowana**. Zapis
tego wyboru: nie jest to odłożenie długu „na potem", tylko odmowa podjęcia cudzej
decyzji architektonicznej pod pozorem sprzątania.

**DECYZJA FABLE.** (a) jedna ścieżka, pozostałe usunięte · (b) rozdzielenie ról
z jawnym kontraktem między nimi · (c) status quo. Plus: **który słownik werdyktów
jest kanoniczny** — dziś są trzy.

---

## 8. D-07 — Zakres PPC i układów hybrydowych

**FAKT.** Audyt §11: byt domenowy „elektrownia hybrydowa" i „regulator PPC" nie
istnieje. Zgodność NC RfG jest jednak oceniana **na punkcie przyłączenia**, a nie
na pojedynczym module — więc dla farmy PV+BESS pod jednym PPC obecny ewaluator
ocenia niewłaściwy obiekt.

**WYMAGANIE.** Model urządzenia musi unieść: alokację P/Q między jednostkami,
ograniczenie eksportu na PCC, wspólną odpowiedź FRT oraz stan energii (SOC), bo
LFSM-U bez SOC jest deklaracją, a nie zdolnością.

**SPIKE — CZĘŚCIOWY (interfejs, nie model).** Prototyp pokazuje, że urządzenia
wchodzą do rdzenia przez JEDEN wąski kontrakt (`nazwy_stanow`, `pochodne`,
`wstrzykniecie`, `inicjalizuj`), więc PPC daje się dołożyć jako urządzenie
nadrzędne bez zmiany rdzenia. **Nie zbudowano** modelu PPC ani SOC — to byłoby
budowanie architektury produktu, nie przygotowanie decyzji.

**DECYZJA FABLE.** (a) w rdzeniu od początku · (b) po modelach urządzeń ·
(c) poza zakresem programu.

---

## 9. D-08 — Kanoniczny model wyniku dynamicznego

**FAKT.** Trzy równoległe kontrakty wyniku dynamicznego; `resultset_v1_schema.json`
jest z założenia MIGAWKOWY (brak osi czasu, tablicy próbek i `dt`); brak `f(t)`,
`Efd(t)`, `Pm(t)`, `SOC(t)`; `P(t)`/`Q(t)` zadeklarowane, nigdy niewypełniane;
dwa z trzech wyników nie mają żadnego odcisku ani wiązania z migawką sieci.

**WYMAGANIE.** Wynik musi dać się **odtworzyć** (odcisk wejścia, scenariusza,
topologii, parametrów modelu) i **obalić** (diagnostyka numeryczna, żeby dało się
odróżnić różnicę fizyki od różnicy nastaw solvera).

**SPIKE — KANDYDAT KONTRAKTU.** `research/dynamic_lab/wynik.py`:
`WynikDynamiczny{czas_s, sygnaly[Sygnal], modele[TozsamoscModelu], zdarzenia,
diagnostyka[DiagnostykaSolvera], odcisk_scenariusza, odcisk_topologii}`.
`Sygnal` niesie klucz, etykietę PL, jednostkę i `element_ref`.
`DiagnostykaSolvera` niesie `‖f(x₀,y₀)‖` — czyli **dowód (lub jego brak), że
przebieg nie jest artefaktem rozruchu**. Przydatność dowodowa **nie jest polem
tego kontraktu**: rozstrzyga o niej rejestr proweniencji produkcji.

**DECYZJA FABLE.** (a) rozszerzyć `ResultSet` o serię czasową · (b) osobny
kontrakt czasowy w tym samym rejestrze · (c) status quo. Kandydat z prototypu
odpowiada wariantowi (b) i **nie jest propozycją zamiany** `ResultSetV1`.

---

## 10. D-09 — Tryby EXPLORATORY / ENGINEERING / REGULATORY_EVIDENCE

**FAKT — CZĘŚCIOWO WDROŻONE (D-00).** `solver_input/provenance.py` ma trzecią oś
`EvidenceTier{VALIDATED_SIMULATION, DECLARATION, UNVALIDATED_MODEL, NOT_SIMULATED}`
z regułą fail-closed: nieznana zdolność → `UNVALIDATED_MODEL`. Rejestr
`_DYNAMIC_CAPABILITY_EVIDENCE` klasyfikuje 8 zdolności dynamicznych; **żadna** nie
jest dziś `VALIDATED_SIMULATION`.

**LUKA, KTÓRA ZOSTAJE — model zaufania.** Dziś `VALIDATED_SIMULATION` jest
**wartością, którą kod może sobie przypisać**. To jest dokładnie ta konstrukcja,
która pozwoliła powstać P0-01: status nadany deklaracją, nie dowodem. Bezpiecznik
działa, dopóki nikt nie wpisze tej wartości — a to nie jest gwarancja, tylko
grzeczność.

**WYMAGANIE (projekt kandydacki, NIE wdrożony).** Żeby status był dowodem, musi
wynikać z danych, nie z literału:

```
ValidationEvidence {
    model_identity      : ModelIdentity{klasa, wersja, odcisk_parametrow}
    validation_scope    : ValidationScope{zakres napięć, mocy, SCR, typ zdarzenia}
    benchmark_set       : BenchmarkSet{przypadki, wyrocznia, jej wersja}
    acceptance_metrics  : AcceptanceMetrics{tolerancje ustalone PRZED biegiem}
    evidence_fingerprint: sha256(wszystkiego powyżej + wyniku)
}
```

`regulatory_evidence_eligible` byłoby wtedy funkcją: **status obliczony**, a warunek
brzmiałby „istnieje `ValidationEvidence`, którego `validation_scope` **zawiera**
bieżący punkt pracy, a `acceptance_metrics` są spełnione". Model poza zakresem
walidacji traci status automatycznie, zamiast go nieść dalej.

**SPIKE — WYKONANY W IZOLACJI.** Dwie części:

1. **W produkcji** (D-00): oś `EvidenceTier` + reguła fail-closed, 108 + 14
   testów, w tym mutacja kontrolna dowodząca, że bezpiecznik jest realnie
   sprawdzany, a nie tylko przechodzi.
2. **W laboratorium** (`research/dynamic_lab/dowod_walidacji.py`, 13 testów):
   **działający prototyp** modelu zaufania. Stopień dowodowy jest tam
   `RejestrDowodow.orzeknij(model, punkt_pracy)` — funkcją, nie literałem.
   Prototyp używa **własnych, polskich nazw stopni**, żeby nie dało się go
   pomylić z kontraktem produkcji (pilnuje tego `research_isolation_guard`).

Zmierzone własności prototypu — każda odpowiada sposobowi, w jaki dziś fałszywy
pozytyw byłby osiągalny:

| Sytuacja | Orzeczenie prototypu |
|---|---|
| model bez zapisanego dowodu | niedowodowy (fail-closed, jak w produkcji) |
| model zwalidowany, punkt pracy **w** zakresie | dowodowy, z nazwą wyroczni i liczbą przypadków |
| ten sam model, punkt pracy **poza** zakresem (U, P, SCR, rodzaj zdarzenia) | **traci** stopień automatycznie, z podaniem który wymiar zawiódł |
| wymiar w ogóle niebadany | brak pokrycia — „nie badano" ≠ „dowolny" |
| **cicha zmiana parametru modelu** (`H` 4,0 → 4,5) | dowód znika: rejestr indeksuje ODCISKIEM parametrów, nie nazwą |
| walidacja wykonana, ale metryka niespełniona | niedowodowy — „wykonana" ≠ „zdana" |
| dowód z pustą listą przypadków | **odrzucony w konstruktorze** (pułapka `all([]) == True`) |
| nowa wersja wyroczni | inny odcisk dowodu → wymaga przeglądu |

Sedno: **dowód jest relacją model–zakres–punkt pracy, nie atrybutem modelu.**
Dlatego prototypu nie da się „oszukać przypisaniem wartości" — nie ma wartości
do przypisania.

To nadal **nie jest** propozycja zmiany `provenance.py`. Rozbudowa produkcyjnej
proweniencji jest ustanawianiem architektury i należy do Fable; prototyp
pokazuje tylko, że wariant „status wyprowadzany" jest wykonalny i jak wygląda.

**DECYZJA FABLE.** Czy `VALIDATED_SIMULATION` ma pozostać wartością nadawaną,
czy stać się statusem WYPROWADZANYM z `ValidationEvidence`. Do czasu decyzji
bezpiecznik trzyma, ale trzyma **umową**, nie konstrukcją.

---

## 11. D-10 — Wersjonowanie profili operatorów

**FAKT — KOREKTA AUDYTU.** Audyt napisał „5 plików, treść identyczna". Pomiar
(po usunięciu komentarzy i pól tożsamości, `md5`):

| Profil | Odcisk treści | Linii |
|---|---|---|
| `enea.yaml` | `7d847dda3912` | 59 |
| `energa.yaml` | `7d847dda3912` | 59 |
| `pge.yaml` | `7d847dda3912` | 59 |
| `tauron.yaml` | `7d847dda3912` | 59 |
| `pse.yaml` | inny | 109 |

Czyli: **cztery profile OSD są liczbowo identyczne** (zróżnicowanie wyłącznie
nominalne — nazwa i opis), a PSE (OSP) rzeczywiście się różni. Audyt zawyżył
zarzut o jeden plik i to jest tu poprawione.

**Żaden z pięciu profili nie ma wersji ani daty obowiązywania** (`grep`:
`wersja|version|obowiazuje_od|valid_from|data_` → 0 trafień).

**WYMAGANIE.** Werdykt zgodności powołuje się na wymagania operatora
obowiązujące w dacie warunków przyłączenia. Bez wersji i daty nie da się orzec,
którą redakcję IRiESD zastosowano — a to jest treść, którą projektant podpisuje.

**SPIKE: brak.** Uzupełnienie treści profili wymaga danych normatywnych OSD,
których w repozytorium nie ma i których nie wolno zgadywać. Wpisanie
„prawdopodobnych" wartości byłoby fabrykacją tej samej klasy co T14/T15.

**DECYZJA FABLE.** (a) wersja + data obowiązywania + data warunków przyłączenia +
klauzule · (b) sama data. Plus rozstrzygnięcie: czy do czasu uzupełnienia
czterech identycznych profili narzędzie ma **jawnie komunikować**, że różnicowanie
operatora jest nominalne.

---
## 12. D-11 — Wyrocznia zewnętrzna dla dynamiki

**FAKT.** Rekomendacja audytu §33 dla D-11 brzmiała „(a) PowerFactory + (c) IEC
61400-27 i literatura", z uzasadnieniem, że „wzorzec `reference_networks/` już
działa dla stanu ustalonego". **Uzasadnienie było błędne** — patrz ERRATA §0 w
karcie audytowej: porównanie z żywym narzędziem zewnętrznym nie wykonuje się
nigdy (10 funkcji testowych pomijanych, `pandapower` poza `pyproject.toml` i poza
wszystkimi 9 workflowami CI).

**Uzupełnienie faktograficzne:** `pandapower` nie nadaje się na wyrocznię
dynamiczną w ogóle — nie ma symulacji RMS (brak modeli maszyn, regulatorów,
całkowania w czasie).

**WYMAGANIE.** Wyrocznia musi być (a) niezależna — nie może dzielić z nami
wyprowadzenia ani implementacji, (b) uruchamialna w CI, bo wyrocznia, której się
nie uruchamia, jest dekoracją, (c) zdolna dać odpowiedź **niezależną od naszego
całkowania** — inaczej porównuje się dwie metody numeryczne, a nie fizykę.

**SPIKE — WYROCZNIA URUCHOMIONA I ZMIERZONA.**

| Cecha | ANDES 2.0.0 |
|---|---|
| Licencja | Apache-2.0 (bez kosztu, bez licencji stanowiskowej) |
| Zakres | 27 modeli dynamicznych: GENCLS/GENROU, wzbudnice, turbiny, PSS, modele przekształtnikowe |
| Odpowiedź niezależna od całkowania | **TAK** — wartości własne linearyzacji (`EIG`) |
| Instalacja | `pip install andes`, czysty Python, działa w środowisku sesji |
| Koszt biegu | ~150 s na 26 testów (ANDES buduje `System` od zera na przypadek) |

Zmierzona zgodność trójstronna (SMIB 50 Hz, maszyna klasyczna, `H=4`, `x=0,15`):

```
delta0       ANDES 0,223138626 rad | laboratorium 0,223138624 | blad 8,4e-09
E'           ANDES 1,016758362 pu  | laboratorium 1,016758354 | blad 7,1e-09
|V_gen|      ANDES 1,000000000 pu  | laboratorium 0,999999993 | blad 7,5e-09
arg(V_gen)   ANDES 0,075070496 rad | laboratorium 0,075070492 | blad 5,4e-08
f_oscylacji  ANDES 1,480476 Hz     | laboratorium 1,480485    | blad 6,0e-06
                                   | wzor analityczny         | blad 3,9e-09
```

Napięcie **nie jest przepisane** z wyroczni: laboratorium dostaje samą moc
zespoloną i musi odtworzyć `V` z własnego `Ybus·V = I`. Zgodność w siatce
3 × bezwładność × 3 × impedancja + 3 punkty obciążenia.

### 12.1 Co dokładnie waliduje przekazanie `Q` z ANDES — rozbite na warstwy

Punkt pracy ustala ANDES (węzeł PV), a laboratorium dostaje `S = P + jQ`.
Warstwy rozdzielone, żeby nie nazywać tego walidacją całego rozpływu:

| Warstwa | Walidowana? | Dlaczego |
|---|---|---|
| **Rozpływ z węzłami PV** (utrzymanie `\|V\|` przez regulację `Q`) | **NIE** | Laboratorium go nie ma — `rozplyw_ustalony` obsługuje PQ + szynę sztywną. `Q` jest DANE, a nie znalezione. |
| **Ybus i rozwiązanie sieci** | **TAK** | Z samego `S` i szyny sztywnej laboratorium musi trafić w `V` wyroczni — moduł 7,5e-09, kąt 5,4e-08. Gdyby Ybus był zły, ta liczba by nie wyszła. |
| **Rekonstrukcja napięcia z `S`** | **TAK** | To jest ta sama rzecz co wyżej, widziana od strony wejścia: `V` jest jedyną niewiadomą. |
| **Inicjalizacja maszyny** | **TAK** | `δ₀` i `E'` liczone z `V` i `S` po naszej stronie, porównane z ANDES (8,4e-09 / 7,1e-09). |
| **Dynamika małosygnałowa** | **TAK, w zakresie §5.1** | Częstotliwość wahań vs wartość własna (6,0e-06). |
| **Dynamika dużosygnałowa** | **NIE przez ANDES** | Domyka ją wyrocznia analityczna równych pól (§19.1). |

### 12.2 RYZYKO RESZTKOWE: mapowanie parametrów piszemy MY

ANDES jest niezależną IMPLEMENTACJĄ, ale adapter przypadku — przypisanie
`M = 2H`, `xd1 = X'd`, `fn`, oraz konstrukcja `PV`/`Slack`/`Line` — jest naszym
kodem. Wspólny błąd interpretacji wejścia skaziłby OBIE strony porównania i
zgodność do 1e-9 by go nie wykryła.

**MAPOWANIE ANDES ↔ MV-DESIGN-PRO NIE JEST JESZCZE NIEZALEŻNIE ZWALIDOWANE.**

Piszę to wprost, bo zgodność dwóch programów nie zastępuje tego sprawdzenia.
Co zostało zrobione, żeby ryzyko zawęzić — i co nadal zostaje:

| Kontrola | Status |
|---|---|
| `fn` — sprawdzone, że wpływa na wynik i jak (`f ∝ √fn`, zmierzony stosunek `√(60/50)` z dokładnością 1e-4) | **wykonana** |
| `M` — sprawdzone, że wchodzi jak bezwładność (`CCT ∝ √H` na 5 punktach, `f_osc ∝ 1/√H`) | **wykonana** |
| `xd1` — sprawdzone przez zgodność `E'` liczonego niezależnie z `V + jX·I` | **wykonana** |
| Porównanie z **natywnym przypadkiem ANDES** (`cases/smib/SMIB.xlsx`, `cases/kundur/*`) i z opublikowanymi wartościami własnymi z literatury | **NIE wykonana** — ANDES dostarcza takie przypadki, ich użycie jest naturalnym następnym krokiem |

Trzy pierwsze kontrole są **niezależne od ANDES** (opierają się na zamkniętych
relacjach skalowania), więc wykluczają najgroźniejszą klasę pomyłki — parametr
wpisany w niewłaściwe pole. Nie wykluczają pomyłki w konwencji bazy mocy albo
w interpretacji `Sn` urządzenia względem `Sn` sieci.

**PUŁAPKA, KTÓRA MUSI TRAFIĆ DO DECYZJI.** ANDES domyślnie liczy na **60 Hz**,
a `ss.config.freq = 50.0` **nie działa** (także ustawione przed `setup()`).
Skuteczny jest wyłącznie parametr `fn` **przy urządzeniu**. Pominięcie daje błąd
`√(60/50) = 1,0954`, czyli **9,5 % w częstotliwości wahań** — wynik wyglądający
wiarygodnie, policzony dla innej sieci. Harness **odrzuca** niezgodną bazę
wyjątkiem zamiast po cichu przeskalować; przeskalowanie byłoby dopasowaniem
wyroczni do modelu tym samym wzorem, który wyrocznia ma sprawdzić. Koszt pułapki
ma przypięty pomiar (`test_pominiecie_bazy_dalo_by_blad_o_zmierzonej_wielkosci`).

**GRANICE TEJ WYROCZNI (uczciwie).** GENCLS to maszyna klasyczna bez regulacji,
więc wyrocznia **nie waliduje** AVR, turbiny, PSS, modeli GFL/GFM ani wiatrowych
Type 1–4. Waliduje: warstwę algebraiczną sieci, inicjalizację maszyny i
dynamikę elektromechaniczną. Rozszerzenie na GENROU + wzbudnicę jest wykonalne
(ANDES ma te modele), ale **nie zostało zrobione**.

**DŁUG ZAPISANY WPROST.** Testy wyroczni są bramkowane `importorskip("andes")` —
czyli tym samym wzorcem „uśpionego dowodu", który ERRATA właśnie napiętnowała.
Dopóki ANDES nie jest zależnością deweloperską wpiętą w CI, ten poziom walidacji
jest **narzędziem badawczym, nie bramką**. Nie ukrywam tego i nie „naprawiam"
tego samodzielnie: dopisanie zależności do `pyproject.toml` produkcji jest
decyzją o zależnościach projektu.

**DECYZJA FABLE.** (a) PowerFactory · (b) PSS/E · (c) IEC 61400-27 + literatura ·
**(d) ANDES jako wyrocznia CI** · dowolna kombinacja. Oraz pytanie wtórne:
czy `andes` ma trafić do `pyproject.toml [dev]` i do workflowa, czy poziom 4
ma pozostać uruchamiany ręcznie.

---

## 13. D-12 — Zakres modeli OEM producentów

**FAKT.** Audyt §5 i §8: 19 nazw modeli → 8 zestawów równań; wiatr Type 1–4 dzieli
dwa zestawy; GFM ≡ GFL.

**WYMAGANIE.** Rejestr modeli OEM ma sens dopiero, gdy istnieje **stabilny
interfejs urządzenia** — inaczej każda wtyczka wiąże się z wewnętrznymi
szczegółami rdzenia.

**SPIKE — INTERFEJS KANDYDACKI.** Prototyp używa jednego, wąskiego kontraktu:

```python
class UrzadzenieDynamiczne(Protocol):
    ref: str
    szyna: str
    def nazwy_stanow(self) -> tuple[str, ...]: ...
    def pochodne(self, x, v_szyny) -> NDArray: ...
    def wstrzykniecie(self, x, v_szyny) -> complex: ...
    def inicjalizuj(self, v_szyny, s_zadane) -> NDArray: ...
```

Na tym interfejsie zrealizowano pięć różnych urządzeń (maszyna 4. rzędu, zespół
z AVR i turbiną, GFL, GFM, odbiór o stałej mocy) **bez zmiany rdzenia**. To jest
argument za wykonalnością wariantu (a), nie za jego wyborem.

**DECYZJA FABLE.** (a) rejestr modeli + wtyczki · (b) tylko modele generyczne ·
(c) później.

---

## 14. D-13 — Co zrobić z `stability_rms` przed nowym rdzeniem

**FAKT.** Silnik istnieje (391 linii), nie czyta sieci, nie czyta czterech pól
własnego kontraktu. Jednocześnie warstwa readiness **deklaruje gotowość** do
uruchomienia obliczeń tą ścieżką — projektant dostaje komunikat „można liczyć"
dla ścieżki, która nie modeluje sieci.

**WYMAGANIE.** Komunikat dla projektanta musi być prawdziwy **zanim** powstanie
nowy rdzeń — bo nowy rdzeń to miesiące, a mylący komunikat działa dziś.

**CO ZOSTAŁO ZROBIONE (D-00, już w produkcji).** `enm/canonical_analysis.
_execute_dynamic_stability` nie wpisuje już na sztywno `proof_status="complete"`
i `reporting_status="reportable"` — oba pochodzą z
`classify_dynamic_capability("dynamic_stability.fault_clear")`, czyli z rejestru
proweniencji. Wynik nadal powstaje, ale **nie udaje dowodu**.

**SPIKE: brak — świadomie.** Usunięcie `stability_rms` jest wykonaniem D-13,
nie przygotowaniem do niego, i zależy od D-02/D-03.

**DECYZJA FABLE.** (a) usunąć teraz jako martwy kod · (b) oznaczyć jako
niedostępny w readiness · (c) zostawić do wymiany rdzenia. Uwaga: (c) jest po
D-00 mniej groźne niż było, ale nadal zostawia w readiness ścieżkę bez fizyki.

---
## 15. Cztery sprawy kanoniczne bez numeru D — wymagają rozstrzygnięcia

Nie mają numeru w §33 audytu, a każda blokuje spójność produktu niezależnie od
losu programu dynamicznego. Wszystkie cztery są **zmierzone**, nie domniemane.

### 15.1 Dwie niekompatybilne przestrzenie numeracji testów NC RfG

| Implementacja | Identyfikatory | Liczba |
|---|---|---|
| `solvers/ncrfg_ptpiree/engine.py` | `T01`…`T20` (wiodące zero) | 20 |
| `application/ncrfg_compliance/checker.py` | `T1`…`T18` (bez zera) | 18 |

`T14` w jednej przestrzeni **nie jest** `T14` w drugiej, a różnica formatu
(`T01` vs `T1`) sprawia, że nawet porównanie łańcuchów nie wykryje pomyłki —
po prostu nie trafi. Dokument, który cytuje „test T14", jest dziś dwuznaczny.

**Rozstrzygnięcie potrzebne:** która przestrzeń jest kanoniczna i czy druga
dostaje mapowanie, czy znika. To pytanie jest **węższe od D-06** i da się je
rozstrzygnąć niezależnie — numeracja to kontrakt komunikacyjny z operatorem,
a nie architektura.

### 15.2 Dwa słowniki „niepełności" w jednym systemie

| Kontrakt | Słownik |
|---|---|
| `api/v125_contracts.py::CanonicalCompletenessStatus` | `complete` · **`partial`** · `failed` · `not_applicable` |
| `ncrfg_ptpiree/contracts.py::proof_status` | `complete` · **`incomplete`** |

Dwa słowa na ten sam stan („zrobione częściowo / nie w pełni") w kontraktach,
które spotykają się w jednym dokumencie. Konsument musi znać oba i wiedzieć,
że nie znaczą tego samego — bo `partial` dopuszcza wynik częściowy, a
`incomplete` opisuje brak dowodu.

**Rozstrzygnięcie potrzebne:** jeden słownik, czy jawne rozdzielenie osi
(kompletność wyniku vs kompletność dowodu) z dwiema różnymi nazwami pól.
Wariant drugi jest obronny, ale wtedy nazwy nie mogą być synonimami.

### 15.3 Martwa wyspa oceny NC RfG po stronie klienta

`frontend/src/ui/network-build/station-der/NcRfgComplianceBadge.tsx` zawiera
`evaluateNcRfgCompliance` — **trzecią** ocenę zgodności NC RfG, wydającą werdykt
`compliant/audit_required/non_compliant` z pięciopozycyjnej listy kontrolnej,
w całości po stronie klienta. Konsumentem jest `DerValidationBanner.tsx`, który
**nie jest importowany nigdzie** poza własnymi testami (`src/` i `e2e/`
przeszukane w całości).

Dlaczego to nie jest zwykły martwy kod: moduł łamie jednocześnie trzy reguły
repozytorium — fizykę/ocenę w warstwie prezentacji, drugą prawdę o zgodności,
oraz funkcję żyjącą wyłącznie w testach. A ponieważ nie jest wpięty, **żaden
bezpiecznik D-00 go nie obejmuje** — gdyby ktoś go zamontował, wystawiałby
werdykt zgodności z pominięciem całego toru dowodowego.

**Rozstrzygnięcie potrzebne:** usunąć oba pliki wraz z testami, czy zamontować
je jako podgląd konfiguracji (nie zgodności) z inną, nieoceniającą nazwą.
Nie usunąłem ich w tej sesji świadomie: usunięcie jednej z trzech implementacji
jest **wykonaniem D-06**, a nie przygotowaniem do niego.

### 15.4 `no_module` — literał zakazany przez `CLAUDE.md`, używany w 22 miejscach

`CLAUDE.md`, ZASADA NR 1: „Zakaz `no_module` / `funkcja w przygotowaniu` /
`TODO` / zaślepek". Pomiar: **10 wystąpień w `backend/src`** i **12 w
`frontend/src`**. Jedno z nich niesie wprost znacznik odroczenia:
`stability_rms/contracts.py:88` → `"no_module",  # Brak modułu numerycznego (PR-15-impl pending)`.

**Skutek, który działa DZIŚ** (`application/calculation_readiness/service.py:87`):

```python
if all(s in ("ready", "n_a", "no_module") for s in statuses):
    return "ready"
```

Projekt, w którym **każde** obliczenie nie ma modułu numerycznego, dostaje status
globalny **`ready`**. To jest ta sama klasa co P0-01: brak zdolności raportowany
jako gotowość.

**Pomiar zasięgu zmiany** (usunięcie `"no_module"` z tej krotki, wykonane w
odizolowanym worktree):
- testy `-k readiness`: **184 passed, 0 failed**;
- **pełna regresja backendu: `10720 passed, 6 skipped, 0 failed`** (685 s).

Czyli **zasięg zmiany w backendzie wynosi ZERO testów**. Żaden test nie pinuje
obecnego zachowania i żaden nie pinuje zachowania przeciwnego — reguła
„`no_module` liczy się jak `ready`" nie jest ani chroniona, ani zakwestionowana.
Pozostałe ryzyko jest po stronie frontendu (12 wystąpień `no_module` w
`frontend/src`) i po stronie komunikatu dla użytkownika, nie po stronie backendu.

Brak testu w obie strony jest tu najważniejszą informacją: nikt nie zapisał tej
reguły jako decyzji, więc dziś jest ona skutkiem ubocznym jednej krotki, a nie
ustaleniem produktowym.

**Rozstrzygnięcie potrzebne:** czy `no_module` ma degradować status globalny do
`partial`, czy potrzebny jest osobny status globalny („niedostępne w tej wersji"),
który nie udaje ani gotowości, ani częściowej gotowości. Nie zmieniłem tego,
bo wybór statusu docelowego jest decyzją produktową o komunikacie dla projektanta.

---
## 15.5 Podział pozycji nierozstrzygniętych: co WYMAGA Fable, a co dało się zrobić

Runda 1 wymieniała listę rzeczy niezrobionych, uzasadniając je zbiorczo
„to architektura". Przegląd słusznie zauważył, że to uzasadnienie było
nadużywane: **brak decyzji produkcyjnej nie blokuje eksperymentu badawczego**.
Poniżej podział na dwie grupy i wykonanie grupy B.

### Grupa A — NIE DA SIĘ bez decyzji Fable (techniczna blokada, nie ostrożność)

| Pozycja | Techniczna blokada |
|---|---|
| Wymiana produkcyjnego solvera prototypem | Wymaga wymiany kontraktów FROZEN (D-03). Bez tego nowy rdzeń nie ma jak dostać topologii — `StabilitySolverInput` jej nie niesie. |
| Ogłoszenie kontraktu wyniku kanonicznym | `ResultSetV1` jest FROZEN; dodanie osi czasu to zmiana major (D-08). |
| Nadanie stopnia zwalidowanej symulacji | Wymaga modelu zaufania w PRODUKCJI (D-09) — prototyp pokazuje wariant, ale wdrożenie zmienia kontrakt proweniencji. |
| Usunięcie jednej z trzech implementacji NC RfG | To JEST wykonanie D-06. |
| Zmiana wymagalności T01 dla PPM klasy A/B | Zmienia to, co narzędzie twierdzi o prawie (NC RfG art. 13(2) vs zapis katalogu „zależy od certyfikatu i decyzji OS"). Pomyłka w każdą stronę jest szkodliwa. |
| Zmiana semantyki `no_module` w readiness | Wybór statusu docelowego jest decyzją o komunikacie dla projektanta. |
| Wpięcie ANDES do `pyproject.toml` i CI | Decyzja o zależnościach projektu. |

### Grupa B — DAŁO SIĘ zrobić jako odizolowany spike i ZOSTAŁO zrobione

| Pozycja | Co powstało | Gdzie |
|---|---|---|
| Realny benchmark **sztywny** | wskaźnik sztywności 4286,9; metody jawne rozbiegają się od 5 ms, niejawne nie; kroki graniczne zgodne z zamkniętym wzorem w 1–2 % | §18.1, `sztywnosc.py` |
| **Ogranicznik prądu GFM** | strategie ograniczenia + pomiar wpływu na ciągłość, zbieżność i charakter źródła | `urzadzenia.py` (GFM), `test_gfm_ogranicznik.py` |
| **BESS z SOC**, **PPC**, **DFIG** | trzy modele z jawnie opisanym zakresem; BESS traci zdolność wsparcia po wyczerpaniu energii | `urzadzenia_oze.py` |
| Walidacja **regulatorów** wyrocznią | przypadek GENROU + wzbudnica; zakres zgodności jest WYNIKIEM, nie założeniem | `wzorzec_genrou.py` |
| Walidacja **mapowania** na cudzym przypadku | przypadek natywny ANDES, błąd 6,5e-08 | §12.2, `wzorzec_natywny.py` |
| Druga wyrocznia analityczna (**CCT**) | zgodność 0,04–0,51 % dla `H` = 1…16 s | §19.1 |
| **Forensyka błędu solvera** | `BladSolvera` z fazą, chwilą, krokiem i lokalizacją stanu | `wynik.py`, `silnik.py` |

Zasada, którą stąd wyprowadzam na przyszłość: „to jest architektura" wolno
podać jako powód zatrzymania **tylko wtedy, gdy da się nazwać techniczną
blokadę**. Jeżeli kod może powstać w `research/` bez wejścia do produkcji —
powinien powstać, bo zmienia pytanie decyzyjne z „czy się da" na „co wybrać".

---

## 16. Czego NIE zrobiono i dlaczego — uczciwy rejestr

Ta sekcja istnieje, żeby dokument nie był mocniejszy, niż jest.

| Czego nie ma | Dlaczego | Skutek dla decyzji |
|---|---|---|
| Wymiany produkcyjnego solvera prototypem | zakazane wprost przez kontrakt sesji | prototyp jest materiałem, nie propozycją wdrożenia |
| Ogłoszenia kontraktu wyniku kanonicznym | j.w. | `wynik.py` jest kandydatem; `ResultSetV1` nietknięty |
| Nadania statusu zwalidowanej symulacji czemukolwiek | j.w.; a także dlatego, że model zaufania (§10) nie istnieje | wszystkie zdolności dynamiczne pozostają niedowodowe |
| Modeli wiatrowych Type 1–4, DFIG, crowbar | to budowa architektury, nie przygotowanie decyzji | D-04 rozstrzygany na maszynie synchronicznej i falownikach |
| Modelu PPC, hybryd, SOC | j.w. | D-07 ma tylko argument o interfejsie, nie o modelu |
| Walidacji AVR / turbiny / PSS wyrocznią zewnętrzną | GENCLS w ANDES jest maszyną klasyczną bez regulacji; GENROU + wzbudnica są dostępne, ale nie zrobione | D-11 zwalidowany na wąskim zakresie i tylko na nim |
| Usunięcia martwej wyspy frontu (§15.3) | usunięcie jednej z trzech implementacji JEST wykonaniem D-06 | zmierzone i opisane, nie skasowane |
| Zmiany semantyki `no_module` w readiness (§15.4) | wybór statusu docelowego jest decyzją o komunikacie dla projektanta | zmierzony zasięg zmiany zamiast zmiany |
| Wpięcia ANDES do `pyproject.toml` i CI | decyzja o zależnościach projektu | poziom 4 walidacji jest narzędziem, nie bramką |
| Naprawy czterech zastanych czerwonych guardów | kontrakt sesji: zastana czerwień jest do zapisania, nie do rozszerzania zakresu | rejestr w §17 |

**Czego ten dokument NIE dowodzi.** Że prototyp liczy fizykę poprawnie **poza
zakresem, w którym go zmierzono**. Zgodność z ANDES obejmuje maszynę klasyczną
w sieci dwuwęzłowej przy małych zaburzeniach. Poza tym zakresem prototyp jest
niezwalidowany — dokładnie tak jak produkcja, tylko z tą różnicą, że tutaj jest
to napisane.

---

## 17. Powtarzalność — jak sprawdzić każdą liczbę z tego dokumentu

```bash
# Laboratorium: pełny zestaw testów własności (bez wyroczni zewnętrznej)
cd mv-design-pro/backend
PYTHONPATH=research poetry run python -m pytest tests/research -q

# Poziom 4 — wyrocznia zewnętrzna (wymaga: pip install andes)
PYTHONPATH=research poetry run python -m pytest tests/research/test_wzorzec_zewnetrzny.py -q
PYTHONPATH=research poetry run python -c \
  "from dynamic_lab.wzorzec_zewnetrzny import porownaj_z_wzorcem; print(porownaj_z_wzorcem().raport())"

# Bezpiecznik dowodowy D-00 — niezmiennik + graf konsumentów
poetry run python -m pytest tests/test_dynamic_evidence_containment.py \
                            tests/api/test_dynamic_evidence_bypass.py -q

# Czas krytyczny zwarcia (bisekcja, ~75 s na 6 pomiarow)
PYTHONPATH=research poetry run python -c \
  "from dynamic_lab.benchmarki import czas_krytyczny_zwarcia as c; \
   print([round(c(h_s=h)*1000) for h in (2.0,4.0,8.0)])"

# Prototyp modelu zaufania D-09 (status dowodowy wyprowadzany, nie nadawany)
PYTHONPATH=research poetry run python -m pytest tests/research/test_dowod_walidacji.py -q

# Izolacja kodu badawczego od produkcji
cd .. && python scripts/research_isolation_guard.py
cd backend && poetry run python -m pytest -q ../scripts/test_research_isolation_guard.py

# Uśpione testy pandapower (ERRATA §0 karty audytowej)
poetry run python -m pytest tests/application/reference_networks/ -q -rs
```

### DWIE OSOBNE BRAMKI — nigdy sumowane w jeden zielony wynik

Wyrocznia zewnętrzna jest bramkowana `importorskip("andes")`, a ANDES nie jest
zależnością repozytorium. Na maszynie bez ANDES „pełna regresja zielona" NIE
znaczy „wyrocznia zewnętrzna przeszła" — znaczy, że jej nie uruchomiono.
Sumowanie tych dwóch liczb w jeden wynik byłoby dokładnie tym samym błędem, co
uśpione testy pandapower opisane w ERRATA karty audytowej.

| Bramka | Co obejmuje | Wynik (środowisko sesji, ANDES ZAINSTALOWANY) |
|---|---|---|
| **CORE REGRESSION** | pełna regresja backendu | **11 113 passed, 6 skipped, 0 failed** (18:02) |
| **EXTERNAL ORACLE REGRESSION** | testy bramkowane `importorskip("andes")` | **118 testów** — w tym środowisku weszły do 11 113 jako PASS; **w CI zostałyby pominięte** |

Sześć pominięć w pełnej regresji NIE dotyczy wyroczni — wszystkie sześć wynika
z opcjonalnych bibliotek raportowych (`PyMuPDF` nieobecny; `reportlab` i
`python-docx` OBECNE, więc pomijają się ich warianty „biblioteka
niedostępna"). Innymi słowy: w tym środowisku wyrocznia zewnętrzna **wykonała
się w całości**, a w CI nie wykonałaby się wcale — i to jest cała różnica
między tymi dwiema bramkami.

Pomiar rozdzielenia (zablokowany import `andes`, `pytest -q -rs tests/research`):

| Konfiguracja | Wynik |
|---|---|
| **bez ANDES** (stan CI) | **324 passed, 3 skipped** — trzy pominięcia MODUŁOWE: `test_wzorzec_zewnetrzny.py`, `test_wzorzec_natywny.py`, `test_wzorzec_genrou.py` |
| **z ANDES** | **442 passed** |
| **EXTERNAL ORACLE REGRESSION** | **442 − 324 = 118 testów**, które w CI nie wykonują się nigdy |

Sto osiemnaście testów to nie drobiazg na marginesie — to cała walidacja wobec
niezależnego narzędzia: widmo GENROU, regulatory SEXS/TGOV1, mapowanie na
przypadku natywnym i porównanie SMIB. Raportowanie „regresja zielona" bez
podania tej liczby byłoby przemilczeniem, ile z walidacji faktycznie nie
zostało uruchomione.

**LOCAL VERIFICATION ONLY.** Wszystkie wyniki w tym dokumencie i w meldunkach
transzy pochodzą z uruchomień lokalnych w środowisku sesji. Workflow GitHub
Actions dla tej gałęzi **nie został uruchomiony i nie został sprawdzony**;
nazywanie tego „CI zielone" byłoby twierdzeniem bez pokrycia.

### Zastana czerwień na punkcie odgałęzienia (`7e84753a`) — do rejestru

Zweryfikowane w osobnym worktree na commicie `7e84753a`, czyli **przed**
jakąkolwiek zmianą z tej sesji:

| Guard / test | Kod wyjścia na `7e84753a` |
|---|---|
| `scripts/enm_contract_parity_guard.py` | 1 |
| `scripts/solver_input_substitute_guard.py` | 1 (11 naruszeń, m.in. `enm/mapping.py:659`) |
| `scripts/success_toast_guard.py` | 1 (15 operacji kanonicznych bez komunikatu) |
| `scripts/tsconfig_gate_guard.py` | 1 |
| `scripts/test_solver_input_substitute_guard.py` | 2 testy czerwone |

Nie naprawione w tej sesji świadomie — kontrakt sesji nakazuje zapisać zastaną
czerwień precyzyjnie, a nie rozszerzać o nią zakres. **To jest dług otwarty,
nie stan zaakceptowany.**

---
## 18. Zmierzone własności numeryczne — materiał do D-02

Wybór integratora bywa rozstrzygany opinią („trapezy są stabilniejsze"). Poniżej
pomiar na wspólnym zadaniu (SMIB z impulsem kątowym 5°, tłumienie `D=1`, 5 s;
odniesieniem RK4 z krokiem `2e-4`, czyli **porównanie metod całkowania między
sobą — NIE walidacja fizyki**, tę robi wyrocznia analityczna i ANDES):

| Integrator | krok [s] | błąd max vs odniesienie [rad] | ewaluacje pochodnych | zbieżny |
|---|---|---|---|---|
| Euler jawny | 0,001 | 1,59e-02 | 5 001 | tak |
| Euler jawny | 0,005 | 1,30e-01 | 1 001 | tak |
| Euler jawny | 0,010 | 5,02e-01 | 501 | tak |
| Euler jawny | 0,020 | **1,66e+01** | 251 | tak (ale wynik bez sensu) |
| Euler niejawny | 0,001 | 1,27e-02 | 45 001 | tak |
| Euler niejawny | 0,020 | 6,73e-02 | 2 419 | tak |
| **RK4** | 0,001 | **1,96e-10** | 20 001 | tak |
| **RK4** | 0,010 | **1,96e-06** | 2 001 | tak |
| **RK4** | 0,020 | **3,13e-05** | 1 001 | tak |
| Trapez niejawny | 0,001 | 2,19e-05 | 45 001 | tak |
| Trapez niejawny | 0,020 | 8,73e-03 | 2 251 | tak |

**Co z tego wynika dla decyzji, a co nie.**

Wynika: na tym, NIESZTYWNYM zadaniu RK4 wygrywa jednoznacznie — przy kroku 20 ms
jest o **trzy rzędy wielkości** dokładniejszy od trapezów niejawnych i zużywa
**2,2× mniej** ewaluacji pochodnych. „Zbieżny" u Eulera jawnego przy 20 ms nie
znaczy „poprawny": błąd 16,6 rad to wynik oderwany od rozwiązania.

**Nie wynika**, że RK4 jest właściwym wyborem dla produktu. To zadanie jest
**niesztywne** (jedna maszyna, brak szybkich stałych czasowych regulatorów,
brak modeli przekształtnikowych o stałych rzędu milisekund). Przewaga metod
A-stabilnych ujawnia się dopiero przy sztywności, której to zadanie nie ma.

**SPROSTOWANIE.** Wcześniejszy meldunek pisał, że „wszystkie cztery integratory
zbiegają na układzie sztywnym". To było nieprawdą: mierzone zadanie było
niesztywne, a zadania sztywnego wtedy nie było. Zostało zbudowane i zmierzone —
patrz §18.1. Wniosek z niego jest **przeciwny** do wniosku z tabeli wyżej.

### 18.1 To samo pytanie na zadaniu REALNIE SZTYWNYM

`research/dynamic_lab/sztywnosc.py`: sieć `GEN—SN—SYS`, maszyna 4. rzędu
(`H = 4 s`, `Td0' = 8 s`) obok falownika z **kaskadą regulacji** (pętla mocy
200 ms → pętla prądowa **1 ms**). Rozstaw skal czasowych 1 ms ↔ 8 s.

Sztywność jest **zmierzona, nie zadeklarowana** — z wartości własnych `df/dx`
liczonych różnicami centralnymi w punkcie pracy:

```
λ = −1000,00 · −999,96 · −5,13 · −5,00 · −4,87 · −0,826 ± 7,376j · −0,233 · 0 · 0
max|Re λ| = 1000,0 s⁻¹     min|Re λ|≠0 = 0,2333 s⁻¹
WSKAŹNIK SZTYWNOŚCI = 4286,9
```

(Dwie zerowe wartości własne są strukturalne: `Efd` i `Pm` są bez AVR/governora
stanami stałymi, więc ich wiersze jakobianu są identycznie zerowe. Wskaźnik nie
zmienia się przy zmianie progu zera o pięć rzędów wielkości.)

Błąd maksymalny wobec `scipy.integrate.solve_ivp` metodą **Radau** (`rtol` 1e-10),
zaburzenie 5°, `T = 1 s`:

| Integrator | 1 ms | 2 ms | 5 ms | 10 ms | 20 ms |
|---|---|---|---|---|---|
| Euler jawny | 1,08e−3 | 2,19e−3 | **ROZBIEGŁ** | **ROZBIEGŁ** | **ROZBIEGŁ** |
| RK4 | 7,92e−9 | 2,20e−7 | **ROZBIEGŁ** | **ROZBIEGŁ** | **ROZBIEGŁ** |
| Euler niejawny | 1,06e−3 | 2,09e−3 | 5,04e−3 | 9,53e−3 | 1,71e−2 |
| **Trapez niejawny** | 1,38e−6 | 5,50e−6 | 3,44e−5 | 1,38e−4 | **5,49e−4** |

Krok graniczny stabilności (bisekcja) wobec **zamkniętego wzoru** dla obszaru
stabilności metody — czyli trzeci, niezależny sprawdzian, że to naprawdę
sztywność, a nie błąd implementacji:

| Metoda | Zmierzony krok graniczny | Wzór | Zgodność |
|---|---|---|---|
| Euler jawny | 2,034 ms | `2/\|λ\| = 2,000 ms` | +1,7 % |
| RK4 | 2,812 ms | `2,7853/\|λ\| = 2,785 ms` | +1,0 % |
| Euler niejawny | brak ograniczenia w badanym przedziale | A-stabilna | — |
| Trapez niejawny | brak ograniczenia w badanym przedziale | A-stabilna | — |

**Wniosek, który się ODWRACA.** Na zadaniu niesztywnym RK4 wygrywał o trzy rzędy
wielkości. Na zadaniu sztywnym RK4 **nie da się w ogóle uruchomić** powyżej
2,8 ms, a trapez przy 20 ms daje błąd 5,5e−04 za 992 ewaluacje pochodnych —
czyli mniej niż RK4 potrzebuje przy 2 ms. To jest dokładnie ta różnica, której
poprzedni pomiar nie mógł pokazać, bo mierzył niewłaściwe zadanie.

Materiał dla D-02: **wymienny integrator jest konieczny** (oba reżimy istnieją
w tym samym produkcie), a wybór domyślnego zależy od tego, czy rdzeń ma unieść
modele przekształtnikowe z pętlą prądową. Jeśli tak — metoda jawna odpada.
**Wyboru nie dokonuję**: to jest decyzja architektoniczna.

**Znaleziona przy okazji pułapka, która wróci w produkcji.** Drabina tolerancji
musi być spójna: przy rozwiązywaniu sieci z tolerancją `1e-10` i różniczkowaniu
Jacobianu krokiem `1e-7` szum Jacobianu sięga `~1e-3`, więc zewnętrzny Newton
NIGDY nie osiągnie celu `1e-10` i zgłosi niezbieżność **na poprawnym wyniku**.
Rozwiązanie zastosowane w prototypie: tolerancja względna, krok różnicowy
`√eps`, wykrywanie zastoju, tolerancja sieci zaostrzona o dwa rzędy względem
tolerancji zewnętrznej.

---
## 19. Zmierzone własności fizyczne — materiał do D-04 i D-07

Trzy pomiary, z których każdy odpowiada na jeden z defektów P0 audytu. Wszystkie
z tego samego prototypu, na tej samej sieci, tym samym integratorem.

### 19.1 Czas krytyczny wyłączenia zwarcia (CCT) — defekt P0-06

Produkcyjny silnik zwracał dla zwarcia trójfazowego **stałą `return 0.05`**,
identyczną dla każdego elementu, niezależnie od miejsca zwarcia i impedancji.
Pole `target_ref` nie było w ogóle odczytywane. W prototypie zwarcie jest
bocznikiem admitancyjnym w Ybus, a CCT wynika z symulacji:

| Bezwładność `H` [s] | CCT [ms] | Zależność |
|---|---|---|
| 2 | 290 | — |
| 4 | 420 | 420/290 = 1,45 |
| 8 | 590 | 590/420 = 1,40 |

Stosunki odpowiadają `√2 = 1,414`, czyli klasycznemu wynikowi kryterium równych
pól **`CCT ∝ √H`** — a to jest własność, której nikt tu nie zaprogramował: nigdzie
w kodzie nie ma wzoru na CCT ani na kryterium równych pól, więc zależność może
wyjść wyłącznie z całkowania równania wahań przy zwarciu zmieniającym Ybus.

Twierdzenie ma **przypięty test**, nie tylko pomiar w tym dokumencie:
`test_cct_rosnie_z_bezwladnoscia_jak_pierwiastek` (czterokrotny wzrost `H` musi
dać dwukrotny wzrost CCT, tolerancja 5 %) oraz `test_cct_maleje_gdy_siec_slabnie`.
Pomiar w tabeli pochodzi z liniowego przemiatania co 10 ms; testy używają
bisekcji (`benchmarki.czas_krytyczny_zwarcia`) i dają 297 / 421 / 596 ms —
zgodnie w granicach kroku przemiatania.

| Reaktancja linii `x` [p.u.] (przy `H=4`) | CCT [ms] |
|---|---|
| 0,05 (sieć sztywna) | 440 |
| 0,15 | 420 |
| 0,40 (sieć słaba) | 370 |

Kierunek poprawny: słabsza sieć → mniejsza moc synchronizująca → krótszy czas
krytyczny. Wynik zależy od sieci, nie od stałej.

### 19.2 GFL kontra GFM — defekt P0-07

Audyt ustalił, że w produkcji **GFM ≡ GFL**: ten sam zestaw równań pod dwiema
nazwami, a wynik nie zależał od urządzenia (`pv_1` ≡ `dfig_60MW`, `p_recov`
0,275 w obu). Ten sam scenariusz na prototypie (identyczna sieć DER—MID—SYS,
identyczne zwarcie przez `Zf` na szynie MID, 150 ms):

| Wielkość | GFL | GFM |
|---|---|---|
| Liczba stanów / sygnałów wyjściowych | 2 / **4** | 4 / **9** |
| Prąd `I` [p.u.] | 0,546 … **1,200** (ogranicznik aktywny, dokładnie `I_max`) | 0,233 … **1,977** |
| Moc czynna `P` [p.u.] | 0,413 … 0,600 | 0,229 … 0,989 |
| Moc bierna `Q` [p.u.] | −0,000 … **0,472** (priorytet Q w FRT) | −0,178 … 1,371 |
| Częstotliwość własna urządzenia | **brak** — GFL nie ma kąta ani prędkości | 49,778 … 50,210 Hz |
| `‖f(x₀,y₀)‖` | 0,000e+00 | 4,65e-14 |

To są **różne modele, nie różne etykiety**: GFL nie ma czego wyprowadzić jako
częstotliwości, bo nie ma stanu kątowego; GFM ma `delta`, `omega` i odpowiedź
inercji wirtualnej. Różnica jest w liczbie stanów, nie w nazwie.

**Uczciwe ograniczenie tego pomiaru.** Prototypowy GFM **nie ma ogranicznika
prądu** (jego parametry to `h_wirtualna_s, d_p, t_f_s, p_ref_pu, q_ref_pu,
e_ref_pu, k_qv, r_wirtualna_pu, x_wirtualna_pu` — nie ma wśród nich `i_max`),
dlatego prąd sięga 1,977 p.u. Rzeczywisty falownik GFM ogranicza prąd i robi to
w sposób, który jest przedmiotem osobnego projektu (przejście źródło napięciowe →
źródło prądowe pod ograniczeniem). **Liczba 1,977 p.u. jest więc własnością tej
konfiguracji modelu, a nie stwierdzeniem o zachowaniu sprzętu.** To jest znana
luka prototypu, nie wynik.

### 19.2b OGRANICZNIK PRĄDU GFM — dwie strategie, zmierzone, żadna nie wybrana

Runda 1 zapisała jako ograniczenie, że prototypowy GFM nie ma ogranicznika
prądu (1,977 p.u. przy zwarciu). Zbudowane w rundzie 2, jako **dwaj jawnie
nazwani kandydaci**, ogranicznik **domyślnie WYŁĄCZONY** (dzięki czemu wszystkie
wcześniejsze pomiary pozostają porównywalne — 52 testy `test_dynamic_lab.py`
dają identyczny wynik przed i po).

| Wariant | I_max (`x_f`=0,05 / 0,01) | P(0,60 s) | Q(0,60 s) | U_min DER |
|---|---|---|---|---|
| bez ogranicznika | **2,4425 / 3,5916** | +0,3122 | 1,3558 | 0,6287 |
| impedancja wirtualna `k`=0,10 | 1,3801 / 1,4203 | +0,1706 | 0,6869 | 0,5133 |
| impedancja wirtualna `k`=0,20 | 1,1928 / 1,1994 | +0,0960 | 0,3675 | 0,4430 |
| nasycenie zadania prądu | 1,2000 / 1,2000 | −0,0000 | 0,5876 | 0,4897 |

Kres twardości impedancji wirtualnej **wyprowadzony**, nie dobrany: limit jest
twardy dla `k ≥ |Z_w|/i_max = 0,125277`, poniżej miękki z asymptotą `|Z_w|/k`.

**Cztery pomiary numeryczne, o które prosił przegląd — w tym DWA WYNIKI
NEGATYWNE, zaraportowane jako wyniki:**

1. **Nieciągłość: funkcja `f` pozostaje CIĄGŁA, skacze JAKOBIAN.**
   `‖f(δ+ε) − f(δ−ε)‖` maleje 10-krotnie na dekadę `ε` (1e-4 → 1e-7) w każdym
   wariancie. Skok pochodnej jednostronnej na progu: 0,0093 (bez ogranicznika,
   czyli szum) wobec **97,81 / 195,59 / 247,92**, liniowo w `k`; nasycenie
   najtwardsze. To rozróżnienie jest istotne: nieciągłość `f` psułaby całkowanie,
   nieciągłość jakobianu psuje tylko Newtona metody niejawnej.
2. **Utrata zbieżności Newtona: NIE WYSTĘPUJE.** 4 integratory × 3 konfiguracje
   × 2 głębokości = **32/32 biegów zbieżnych**, rozrzut `I_max` między metodami
   < 2 %. Wynik negatywny, zmierzony — nie domniemany.
3. **Zmiana charakteru źródła — i ODWRÓCENIE RANKINGU.** Sztywność napięciowa
   `|dU/dP|`: bez zwarcia **0,02010 identycznie dla wszystkich** (ogranicznik
   nieaktywny — przebiegi zgodne co do bitu). Przy `x_f` = 0,05 najgorsze jest
   nasycenie (0,09713); przy `x_f` = 0,01 najgorsza jest impedancja `k`=0,20
   (**1,08097**), a nasycenie wypada lepiej (0,16770). **Teza „impedancja
   wirtualna zachowuje charakter źródła napięciowego" jest FAŁSZYWA bez podania
   punktu pracy** — to jest wynik obalający intuicję, nie ją potwierdzający.
4. **Zwarcie bliskie metalicznemu.** Bez ogranicznika i obie nastawy impedancji
   liczą się do `x_f = 0` włącznie. **Nasycenie zadania traci zbieżność algebry
   sieci**; próg zawężony bisekcją do **(0,004559; 0,004565) p.u.**

**Nie wybieram strategii.** Materiał mówi, że wybór jest kompromisem zależnym
od punktu pracy: nasycenie daje twardszy limit i lepiej znosi płytkie zwarcie,
impedancja wirtualna przeżywa zwarcie metaliczne. To jest decyzja
architektoniczna dla Fable (D-07/GFM).

### 19.2c BESS z SOC, PPC i maszyna dwustronnie zasilana

**BESS** (5 stanów, w tym własna PLL): kluczowa własność, o którą chodziło —
LFSM-U bez SOC jest deklaracją, nie zdolnością. Zmierzone na wyspie
(wydzielenie 0,2 s → skok obciążenia 0,5 s):

| Skok | Pojemność | `f_min` | `f_koniec` | `P_koniec` | Wsparcie do |
|---|---|---|---|---|---|
| 0,20 | 0,02 MWh | 49,472 | 49,531 | **0,0000** | **5,23 s** |
| 0,20 | 2,0 MWh | 49,549 | 49,658 | 0,0569 | 8,00 s (całe okno) |
| 0,40 | 0,02 MWh | 48,909 | 49,051 | **0,0000** | **2,26 s** |
| 0,40 | 2,0 MWh | 49,223 | 49,415 | 0,1539 | 8,00 s |

Szczyt mocy **identyczny** dla obu pojemności — różni je wyłącznie ENERGIA.
Bilans `∫P dt` wobec `Δsoc·E` zgodny do 0,001–0,003 % we wszystkich biegach.
Ograniczenie falownika przyjęto jako **OKRĄG** `|S| ≤ S_n` z uzasadnieniem:
prostokąt dopuszczałby `|S| = √2·S_n`, czyli 41 % przetężenia zaworów.

**PPC**: limit eksportu 0,5 p.u. przy dyspozycji 0,9 → PCC = 0,5000 (również
maksimum po drodze). Alokacja proporcjonalna 0,3333/0,1667, priorytetowa
0,5000/0,0000 — obie zmierzone. Bez limitu PCC = **0,8986**, a nie 0,9000, bo
moduł 0,6 p.u. domyka okrąg mocą bierną; **model tego nie ukrywa**.

**`MaszynaDwustronnieZasilana3Rzedu`** — świadomie NIE nazwana „DFIG", bo nie
modeluje dynamiki strumienia stojana, crowbaru, przekształtnika sieciowego ani
wału dwumasowego. Uczciwa wąska implementacja zamiast szerokiej atrapy.

### 19.3 Co te pomiary rozstrzygają, a czego nie

Rozstrzygają: że sprzężenie z siecią, zdarzenia jako zmiana modelu i
zróżnicowanie urządzeń są **osiągalne** w rdzeniu tej wielkości, i że dają
wyniki zgodne z klasyczną teorią stabilności.

Nie rozstrzygają: czy tak zbudowany rdzeń jest właściwą architekturą dla
MV-DESIGN-PRO. To jest D-02, i to jest pytanie do Fable.

---

## 20. Blok przekazania — FABLE HANDOFF

### 20.1 Co jest już rozstrzygnięte i wdrożone (nie wymaga decyzji)

**D-00 — FAIL CLOSED.** Decyzja właściciela z 2026-09-10: pozytywny certyfikat
zgodności NC RfG **nie powstaje jako dowód regulacyjny**, jeżeli jego pozytywny
werdykt zależy od obecnej warstwy dynamicznej. Raport diagnostyczny nadal
powstaje i jawnie mówi, że nie jest dowodem.

Wdrożone: trzecia oś proweniencji `EvidenceTier`, rejestr 8 zdolności
dynamicznych, reguła fail-closed dla nieznanych, bezpiecznik w
`certyfikat_zgodnosci.zbierz_braki`, domknięcie 6 końcówek dokumentowych
(certyfikat i wniosek OSD × JSON/DOCX/PDF), inwentarz konsumentów z pilnowaną
kompletnością, tytuł raportu zmieniony na diagnostyczny, `_execute_dynamic_stability`
przestał wpisywać status dowodowy na sztywno.

Bezpiecznik **działa w jedną stronę**: blokuje fałszywy pozytyw, nigdy nie
wycisza wykazanej niezgodności (pinowane osobnym testem).

### 20.1b D-00 RUNDA 2 — piętnaście potwierdzonych obejść i co z nimi zrobiono

Runda 1 ogłosiła „graf konsumentów domknięty". **Nie był.** Wielosoczewkowe
polowanie na obejścia (87 kandydatów zweryfikowanych adwersaryjnie, **15
potwierdzonych jako osiągalne na żywo**, 72 odrzucone) znalazło trzy KLASY
obejść. Wszystkie zamknięte w tej transzy, każda naprawą klasy, nie instancji.

**Klasa A — bramka dowodowa działała FAIL-OPEN.** `_module_evidence_status`
pomijała każdy wynik, którego `evidence` było `None`, a klasyfikację doklejało
**8 ewaluatorów z 20**. Rejestr proweniencji był fail-closed, a jego konsument
fail-open — czyli „rozdziel szerzej, niż doklejasz z powrotem".

Najgroźniejsza instancja: **T18** („Praca wyspowa, rozruch autonomiczny i
tłumienie oscylacji") orzekał `pass` z trzech flag wejściowych, bez żadnego
obliczenia, i był dla bramki **niewidoczny** — a to trzy jednoznacznie
DYNAMICZNE zdolności. Certyfikat „Projekt zgodny z wymaganiami NC RfG"
powstawał w całości.

Naprawa: `capability_id` jest polem OBOWIĄZKOWYM **definicji testu**, a
`_result()` klasyfikuje z definicji — ewaluator nie może zapomnieć. Brak
klasyfikacji jest teraz ograniczeniem (`BRAK_KLASYFIKACJI`), nie zgodą.

Klasyfikacja wszystkich 20 testów wymusiła drugie rozróżnienie, którego runda 1
nie miała: **rodzaj twierdzenia** (`ClaimKind`). Deklaracja wnioskodawcy JEST
właściwym dowodem faktu „moduł ma rejestrator zakłóceń", a NIE jest dowodem
„moduł przetrwa zapad 150 ms". Różnica nie leży w stopniu dowodowym, tylko w
tym, CO jest twierdzone — dlatego eligibility zależy od pary (tier, claim_kind),
a nie od samego tieru.

**Klasa B — dokumenty gubiły status dowodowy przy renderowaniu.** Eksport
DOCX/PDF przebiegu drukował `Status=STABLE | t_wyl=120,0 ms | Margines=30,0 ms`
dla przebiegu oznaczonego `not_reportable`; wiersz `source_compliance` trzydzieści
linii niżej status drukował. Ta sama asymetria w sekcji „Podsumowanie" i w
kontrakcie kolumn.

Naprawa jest **regułą RENDERERA, nie gałęzi**: `wiersze_niedowodowe()` czyta
DANE każdego wiersza każdej tabeli i emituje blok `BRAK WYSTARCZAJĄCEGO DOWODU`
przed tabelami. Nowa tabela dodana kiedyś do raportu jest objęta regułą bez
zmiany kodu — sprawdzone testem na tabeli, której jeszcze nie ma.

**Klasa C — front gubił pole `evidence`.** Backend wystawia je od rundy 1;
interfejs `WidokTrajektoriiFrt` deklarował zgodność „1:1 z odpowiedzią" i tego
pola **nie miał w ogóle**. Skutek: zielony baner „Model odzwierciedla wymagania
profilu operatora" z modelu bez ustalonej poprawności fizycznej, przenoszony
przyciskiem „Zapisz wynik" do macierzy NC RfG. Dodatkowo `werdyktCalosciFrt`
zwracał ten sam zielony werdykt dla **pustej listy scenariuszy** — pułapka
`all([]) === true` w wersji prezentacyjnej.

Naprawa: `evidence` w kontrakcie UI; pozytyw ze zdolności nieprzydatnej
dowodowo schodzi do ostrzeżenia z jawnym dopiskiem; pusta lista scenariuszy ma
własny stan. Werdykt NEGATYWNY nie jest zmiękczany — ostrzeżenie dowodowe nigdy
nie maskuje naruszenia.

**Czego NIE naprawiono i dlaczego (pozycja decyzyjna).** Polowanie zgłosiło
jako P0, że `module_family="PPM"` nie czyni T01 (LFSM-O) wymaganym dla klas A/B,
podczas gdy reguła kompensacyjna istnieje wyłącznie dla `SyPGM`, a NC RfG art.
13(2) wymaga LFSM-O od typu A wzwyż. **Obejście dowodowe jest zamknięte**
(każdy test jest teraz sklasyfikowany, więc raportowalność klasy A wynika z
jawnego faktu, że wszystkie jej testy wymagane są twierdzeniami
konfiguracyjnymi). **Otwarte pozostaje pytanie NORMATYWNE**: czy PPM klasy A/B
bez certyfikatu powinien mieć T01 wymagany. Zmiana wymagalności testu zmienia
to, co narzędzie twierdzi o prawie — i pomyłka w którąkolwiek stronę jest
szkodliwa. To jest decyzja właściciela/Fable, nie skutek uboczny sprzątania.

**Pomiar wiarygodności napraw.** Każda naprawa przeszła mutację kontrolną:
przywrócenie fail-open → 1 test czerwony; błędna klasyfikacja T18 jako faktu
konfiguracyjnego → 3 testy czerwone; usunięcie reguły renderera → 9 testów
czerwonych. Pierwsza wersja testu dokumentów mutacji **nie wykrywała** (łączyła
dwa sygnały spójnikiem „lub") i została wzmocniona — to też jest zapisane.

---

### 20.2 Trzynaście pytań do rozstrzygnięcia

| ID | Pytanie w jednym zdaniu |
|---|---|
| D-01 | Nowa struktura programu czy rozszerzenie `PLANS.md` — i co z kolizją numeracji `D-xx` między `STAN_REPO.md` a §33 audytu? |
| D-02 | Rozszerzyć `stability_rms`, zbudować nowy rdzeń, czy oprzeć się na silniku zewnętrznym? |
| D-03 | Zgoda B-01 na wymianę kontraktów FROZEN zawierających cztery pola, których żaden silnik nie czyta? |
| D-04 | Która rodzina źródeł pierwsza — synchroniczna (wykonalna i weryfikowalna) czy przekształtnikowa (rynek produktu)? |
| D-05 | Czy ewaluator wymagań ma wyłącznie KONSUMOWAĆ wynik, bez prawa go wytwarzać? |
| D-06 | Która z **trzech** implementacji NC RfG zostaje i który z **trzech** słowników werdyktów jest kanoniczny? |
| D-07 | PPC i hybrydy w rdzeniu od początku, po modelach urządzeń, czy poza programem? |
| D-08 | Seria czasowa w `ResultSet`, osobny kontrakt czasowy, czy status quo (trzy równoległe)? |
| D-09 | Czy `VALIDATED_SIMULATION` ma pozostać wartością NADAWANĄ, czy stać się statusem WYPROWADZANYM z `ValidationEvidence`? |
| D-10 | Wersjonowanie profili operatorów — i czy do czasu uzupełnienia narzędzie ma mówić wprost, że cztery profile OSD są liczbowo identyczne? |
| D-11 | Która wyrocznia dynamiczna — i czy ANDES trafia do `pyproject.toml [dev]` oraz do CI? |
| D-12 | Rejestr modeli OEM z wtyczkami, tylko modele generyczne, czy później? |
| D-13 | `stability_rms`: usunąć teraz, oznaczyć jako niedostępny, czy zostawić do wymiany rdzenia? |

**Plus cztery sprawy kanoniczne z §15**, z których §15.4 (`no_module` → `ready`)
działa **dziś** i nie jest pinowana żadnym testem w żadną stronę.

### 20.3 Co wolno zrobić z prototypem

Przyjąć w całości, przyjąć fragmentami, przepisać, albo **skasować katalog
`backend/research/` jednym poleceniem** — nic produkcyjnego z niego nie korzysta
i pilnuje tego guard w CI. To była cała idea izolacji: żeby odrzucenie prototypu
kosztowało zero.

Jeżeli którykolwiek fragment ma trafić do produkcji, to **nie przez przeniesienie
plików**, tylko przez decyzję D-02/D-03/D-08 i normalną ścieżkę: kontrakt →
implementacja → testy → guardy → determinizm.

### 20.4 Trzy rzeczy, których ten dokument świadomie NIE zrobił

1. **Nie podmienił produkcyjnego solvera** prototypem.
2. **Nie ogłosił żadnego kontraktu kanonicznym.**
3. **Nie nadał niczemu statusu zwalidowanej symulacji.**

To były trzy jawne granice zlecenia i żadna nie została przekroczona.

---

**CLAIMED READY FOR FABLE ARCHITECTURAL REVIEW**

*Pakiet decyzyjny — materiał PRE-DECISION. Nie zmienia kanonu, solverów,
kontraktów ani statusu dowodowego. Wszystkie warianty są otwarte;
decyzja należy do Fable.*
