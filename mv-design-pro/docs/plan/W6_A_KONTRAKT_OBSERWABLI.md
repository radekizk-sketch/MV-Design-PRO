# W6-A — KONTRAKT TECHNICZNY OBSERWABLI DYNAMICZNYCH

**Zlecenie:** decyzje właściciela po zamrożeniu zdolności docelowej (2026-09-18), punkty NEXT
ACTION 1–5. Dokument idzie **do przeglądu architektonicznego przed rozszerzeniem implementacji** —
nie jest zgodą na kodowanie.

**Baza:** HEAD `cb2cb93e`. Zdolności domykane przez W6-A: **B2** (częstotliwość węzła),
**B3** (ROCOF), **B4** (prądy i przepływy gałęzi) oraz brakujące obserwable **C2–C5**
(`docs/plan/FINAL_DYNAMICS_CAPABILITY_FREEZE.md` §2–3).

---

## 1. Zakres i definicja ukończenia

W6-A wprowadza obserwable jako **kanoniczne wielkości wyniku solvera**, nie jako dane do wykresu.
Każda z nich musi być zdatna do użycia przez: zabezpieczenia w pętli (W6-C), kryteria (W6-D),
wyszukiwanie granicy stabilności (W6-E), diagnostykę (W6-H), White-Box (W6-F) i powierzchnię (W6-I).

**Poza zakresem W6-A:** ocena kryterialna (W6-D), zdarzenia warunkowe (W6-C), prezentacja (W6-I).

---

## 2. Model kanoniczny `x` / `y` / `z` (rozdział semantyczny, nie serializacyjny)

| Przestrzeń | Co to jest | Kto to wytwarza | Przykłady |
|---|---|---|---|
| **`x(t)`** — stany dynamiczne urządzeń | zmienne całkowane, każda z własnym równaniem ruchu | urządzenie (`Urzadzenie.pochodne`) | `delta_rad`, `omega_pu`, `eq_prim_pu`, `efd_pu`, `pll_kat_rad`, `soc_pu`, `pitch_rad` |
| **`y(t)`** — zmienne algebraiczne sieci | rozwiązanie `g(x, y) = 0` w danej chwili | rdzeń sieciowy (`siec.py`) | zespolone napięcia węzłowe `V_i`, a z nich `\|V_i\|` i `θ_i` |
| **`z(t)`** — obserwable inżynierskie | wielkości WYPROWADZONE z `x` i `y` wg jawnego wzoru, z jednostką, orientacją i domeną ważności | warstwa obserwabli rdzenia | `f_i`, `ROCOF_i`, `P_ij`, `Q_ij`, `I_ij`, `P_k`, `Q_k` urządzenia |

**Zamrożone:**

1. Te trzy przestrzenie **nie spłaszczają się** do jednego słownika „bo tak wygodniej w API".
   Kontrakt wyniku może je serializować wspólnie (kanały mają już klucz i jednostkę), ale
   **każdy kanał niesie swoją przestrzeń** — pole `przestrzen` istnieje dziś
   (`KanalDynamicznyV1.przestrzen`) i ma zostać rozszerzone o wartość dla obserwabli
   wyprowadzonych, zamiast wciskać je w „siec" albo „urzadzenie".
2. Obserwabla `z` **nigdy nie jest stanem**. Nie wolno dodać `f_i` jako stanu różniczkowego, żeby
   „mieć pochodną za darmo" — to wprowadziłoby fikcyjną wartość własną do analizy małosygnałowej.
3. Obserwabla `z` jest liczona **w rdzeniu**, nie w API i nie w przeglądarce.

---

## 3. DOWÓD wyprowadzenia częstotliwości węzła z faktycznej formulacji solvera

Właściciel wymaga dowodu, nie założenia. Poniżej wyprowadzenie z KODU, z cytatami.

### 3.1 Układ odniesienia — co robi solver

| Fakt | Miejsce | Treść |
|---|---|---|
| fazory sieciowe w układzie wirującym synchronicznie | `dynamika/konwencje.py:11-12` | „fazory sieciowe w ukladzie wirujacym z predkoscia synchroniczna (RMS), wiec os czasu niesie OBWIEDNIE" |
| maszyna synchroniczna całkuje ODCHYŁKĘ | `urzadzenia/maszyna_synchroniczna.py:330,338` | `odchylka_predkosci = omega_pu − 1.0`; `d(delta_rad)/dt = odchylka_predkosci · omega_bazowa_rad_s` |
| przekształtnik tworzący sieć — tak samo | `urzadzenia/przeksztaltnik_gfm.py:262` | `d(kat_rad)/dt = (predkosc − 1.0) · omega_bazowa_rad_s` |
| pętla synchronizacji nadążnego — tak samo | `urzadzenia/przeksztaltnik_gfl.py:320` | `d(pll_kat_rad)/dt = odchylka_pulsacji · omega_bazowa_rad_s` |
| `omega_bazowa_rad_s = 2π·f_bazowa` | `konwencje.py:36-38`, `maszyna_synchroniczna.py:688` | `pulsacja_bazowa_rad_s(f_bazowa_hz)` |
| `f_bazowa` pochodzi z DANYCH studium, nie ze stałej | `enm/canonical_analysis.py` (wywołanie `czestotliwosc_studium_hz(snapshot)`) | — |
| macierz admitancyjna nie zależy od czasu ani od częstotliwości | `dynamika/siec.py:1-16` | Ybus składana od nowa z tego samego opisu gałęzi co rozpływ; admitancje stałe |

**Wniosek pośredni:** wszystkie trzy rodziny kątów wewnętrznych całkują **odchyłkę prędkości**
pomnożoną przez `ω_0`. Kąt, który całkuje odchyłkę, jest kątem **względem osi wirującej z `ω_0`**.
Napięcia węzłowe są rozwiązaniem algebraicznym z tych samych fazorów przez stałą Ybus, więc leżą
w tym samym układzie odniesienia.

### 3.2 Wyprowadzenie

Niech `φ_i(t)` będzie fazą chwilową napięcia węzła `i` w układzie nieruchomym. Definicja fazora
RMS w układzie wirującym z `ω_0`:

$$\varphi_i(t) = \omega_0 t + \theta_i(t), \qquad \omega_0 = 2\pi f_n$$

gdzie `θ_i(t)` to kąt fazora, który zwraca solver (kanał `kat_deg@<szyna>`). Chwilowa pulsacja
węzła to pochodna fazy chwilowej:

$$\omega_i(t) = \frac{d\varphi_i}{dt} = \omega_0 + \frac{d\theta_i}{dt}$$

a zatem

$$\boxed{\;f_i(t) = f_n + \frac{1}{2\pi}\,\frac{d\theta_i(t)}{dt}\;}$$

**Dodanie `f_n` jest tu POPRAWNE i wynika z formulacji, nie z założenia** — bo `θ_i` jest kątem
względem osi wirującej z `ω_0`, co pokazuje §3.1. Gdyby solver liczył kąt w układzie nieruchomym
(kąty rosnące liniowo o `ω_0 t`), wzór byłby bez `f_n` — i ten warunek ma być **przypięty testem**,
a nie zapisany w komentarzu.

### 3.3 Sprawdzian tożsamościowy (falsyfikacja układu odniesienia)

W wyspie zasilanej **jednym** urządzeniem tworzącym sieć o prędkości `ω_GFM = 1 + s`:
`d(kat_rad)/dt = s·ω_0` jest stałe, więc wszystkie fazory obracają się z tą samą prędkością, czyli
`dθ_i/dt = s·ω_0` dla każdego węzła. Wzór daje `f_i = f_n(1 + s) = f_GFM` — **dla każdego węzła
wyspy**. Test, który tego nie potwierdza, obala albo wzór, albo układ odniesienia.

### 3.4 `bus_electrical_frequency` jest wielkością SIECI — rozłączność nazw

| Wielkość | Czym jest | Skąd | Czy równa `f_i`? |
|---|---|---|---|
| `czestotliwosc_elektryczna_szyny` (`f_i`) | obserwabla węzła wyprowadzona z `θ_i` | `z(t)` | — |
| częstotliwość pętli synchronizacji (`f_PLL`) | POMIAR urządzenia nadążnego, stan `pll_kat_rad` + `pll_calka_pu` | `x(t)` | **NIE** — jest wynikiem filtru pętli o skończonym paśmie |
| częstotliwość urządzenia tworzącego sieć (`f_GFM`) | stan/wielkość wewnętrzna generatora napięcia | `x(t)` | **NIE automatycznie** — równa się `f_i` tylko przy pomijalnym spadku na impedancji wyjściowej |
| prędkość elektryczna wirnika (`ω_r`) | stan maszyny | `x(t)` | **NIE** — różni się o dynamikę kąta mocy |

**Zakaz zamrożony:** żadna z trzech wielkości urządzeniowych nie może być podstawiana pod `f_i`.
Ich zbieżność w niektórych stanach pracy jest **wynikiem**, nigdy założeniem modelu danych.

**Brak „częstotliwości systemowej" domyślnie.** Średnia prędkości maszyn ważona bezwładnością
**nie powstaje** w W6-A i nie zastępuje `f_i`. Jeżeli kiedyś powstanie, to jako osobno nazwana
metryka inżynierska z własnym uzasadnieniem — nigdy jako „częstotliwość sieci".

### 3.5 Miejsce obliczenia — priorytet (wymóg właściciela)

1. **wprost z formulacji** — jeżeli dla danej rodziny urządzeń `dθ_i/dt` da się wyrazić analitycznie
   z `x` i `y` (dla węzła z jednym urządzeniem tworzącym sieć: wprost z jego prędkości),
2. **z gęstego wyjścia wewnętrznego rdzenia** — pochodna liczona na siatce kroków całkowania, nie
   na siatce próbkowania wyjścia,
3. **z udokumentowanego estymatora** na trajektorii o wystarczającej rozdzielczości, z podaną metodą,
4. **NIGDY** z próbek eksportowanych do interfejsu (`krok_wyjscia_s` bywa rzędu 10 ms — różnica
   wsteczna na takiej siatce ma błąd rzędu `dt·d²θ/dt²` i przy zdarzeniu daje wartość bez sensu).

**Zawijanie kąta** obsługiwane jawnie: przejście `+179,9° → −179,9°` to ciągła zmiana o `0,2°`,
nie skok o `359,8°`. Rozwinięcie fazy (unwrap) wykonuje rdzeń na swojej gęstej siatce, PRZED
różniczkowaniem; próbka wyjściowa niesie kąt w postaci kanonicznej.

---

## 4. Domena ważności obserwabli (wymóg właściciela)

Kąt fazora traci sens numeryczny i fizyczny przy `|V_i| → 0`. Stan jakości jest **częścią
kontraktu obserwabli**, nie adnotacją interfejsu.

| Stan | Znaczenie | Kryterium |
|---|---|---|
| `WIARYGODNA` | wartość nadaje się do oceny inżynierskiej | poniżej |
| `NISKIE_NAPIECIE_NIEWIARYGODNA` | kąt istnieje numerycznie, ale jego błąd przekracza założoną granicę | poniżej |
| `NIEDOSTEPNA` | węzeł bez rozwiązania (wyspa bez źródła, brak zbieżności w tej chwili) | brak rozwiązania algebraicznego |

**Kryterium nie może być liczbą przyjętą „na oko" — ale nie może też być ZAŁOŻENIEM.**

> **KOREKTA 2026-09-18 (runda domknięcia W6-A §5, dowód wykonywalny).** Wyprowadzenie poniżej
> pierwotnie brzmiało: „solver rozwiązuje `g(x,y)=0` do tolerancji `ε_g`, więc niepewność
> składowych napięcia jest rzędu `ε_g`". **To zdanie jest fałszywe i zostało obalone pomiarem.**
> Newton kończy przy `‖r‖ ≤ ε_g`, ale błąd rozwiązania spełnia `Δy = J_y^{-1} r` — jest więc
> wzmocniony przez `J_y^{-1}`. W punkcie pracy w ostatnim promilu obciążalności (`P = 1,0079`
> przy `P_max = 1,0083`) zmierzone wzmocnienie wynosi **8,4×**, a meldowana niepewność
> częstotliwości była **2,45 raza mniejsza** od rzeczywistego błędu — przy kodzie jakości
> „wiarygodna". Analogicznie obalone zostało założenie, że błąd względny pochodnej równa się
> błędowi względnemu napięcia (niedoszacowanie 1,83×).

Obie niepewności są dziś **mierzone**, każda z wielkości, które solver i tak ma:

$$u_V = \left| J_y^{-1} r \right| \text{ na węźle}, \qquad
u_{\dot V} = \left| \dot V(y - J_y^{-1} r) - \dot V(y) \right|$$

Rozkład LU jest ten sam, którym liczona jest pochodna, więc `u_V` kosztuje jedno dodatkowe
podstawienie; `u_V̇` wymaga drugiej faktoryzacji (pomiar narzutu: §15 raportu domknięcia).
Propagacja jest **wyprowadzona**, nie dobrana:

$$u_{\dot\theta} \le \frac{u_{\dot V}}{|V|} + 3\,\frac{|\dot V|\,u_V}{|V|^2},
\qquad u_f = \frac{u_{\dot\theta}}{2\pi}$$

Granica niedostępności wynika stąd wprost i **nie jest progiem napięciowym** (OD-36):

$$|V_i| \le u_V \;\Rightarrow\; \texttt{NIEDOSTEPNA}
\qquad\text{(fazor leży wewnątrz własnej kuli niepewności)}$$

**Zakaz zamrożony:** wartość niedostępna **nie jest** zastępowana częstotliwością znamionową.
Kanał zwraca stan jakości, a nie „ładną liczbę".

---

## 5. Zdarzenia nieciągłe — konwencja (wymóg właściciela)

Rdzeń już dziś deklaruje: *„Probka w chwili t jest stanem PO wykonaniu wszystkich zdarzen tej
chwili"* (`dynamika/silnik.py:744` i dalej, `ZALOZENIA_RDZENIA`). W6-A dopisuje do tego:

1. **Chwila zdarzenia rozcina przedział ciągłości.** Pochodna `dθ/dt` liczona jest WYŁĄCZNIE
   wewnątrz przedziału ciągłości — nigdy przez granicę zdarzenia.
2. **W chwili zdarzenia `f_i` jest NIEOKREŚLONA** i kanał zwraca stan `NIEDOSTEPNA` dla tej jednej
   próbki, z jawnym powodem „nieciągłość zdarzenia".
3. **Próbki jednostronne:** dla chwili `t_zd` publikowana jest wartość lewostronna (koniec
   poprzedniego przedziału) i prawostronna (początek następnego) jako dwie różne próbki — tak samo,
   jak zdarzenie ma dziś `t_zaplanowany_s` i `t_wykonany_s`.
4. **Zakaz zamrożony:** nieciągłość łączeniowa **nie może** wyprodukować impulsu ROCOF. Impuls
   z różniczkowania skoku algebraicznego nie jest zjawiskiem fizycznym, tylko artefaktem metody.

---

## 6. ROCOF — osobna kwalifikacja, osobne nazwy

Posiadanie `f_i(t)` **nie oznacza** posiadania ROCOF klasy inżynierskiej. W6-A wprowadza dwie
rozłącznie nazwane wielkości; mieszanie ich jest zabronione.

| Wielkość | Definicja | Zastosowanie | Czego NIE wolno |
|---|---|---|---|
| `rocof_chwilowy` | `df_i/dt` na gęstej siatce rdzenia, wewnątrz przedziału ciągłości | badanie przebiegu, diagnostyka | nie jest wielkością, wobec której ocenia się nastawy zabezpieczeń |
| `rocof_pomiarowy` | wartość na **jawnie zadanym oknie obserwacji** `T_obs` z jawnie zadaną filtracją i interwałem raportowania, odwzorowująca sposób pomiaru przez przekaźnik | ocena kryteriów i nastaw | nie wolno go publikować bez kompletu: metoda, okno, filtr, interwał, jednostka, warunki ważności, traktowanie zdarzeń |

Dopóki `rocof_pomiarowy` nie ma kompletu tych pięciu parametrów **z danych** (a nie z domyślnych
stałych), pozostaje `NOT IMPLEMENTED` — zgodnie z dyrektywą: *„If the current solver does not
support defensible ROCOF, mark it NOT IMPLEMENTED instead of fabricating it."*

---

## 7. Kontrakt prądów i przepływów gałęzi

### 7.1 Orientacja i znaki — jednoznacznie

Dla gałęzi `i → j` (`wezel_od` → `wezel_do`) publikujemy **obie strony**:

| Wielkość | Definicja | Znak |
|---|---|---|
| `i_od_pu` | prąd wpływający do gałęzi na zacisku `od` | dodatni = z węzła `i` DO gałęzi |
| `i_do_pu` | prąd wpływający do gałęzi na zacisku `do` | dodatni = z węzła `j` DO gałęzi |
| `s_od_pu` | `V_i · conj(i_od_pu)` | dodatnia część rzeczywista = moc pobierana przez gałąź od węzła `i` |
| `s_do_pu` | `V_j · conj(i_do_pu)` | analogicznie |

Przy tej konwencji `s_od + s_do` jest **stratą** gałęzi (dodatnia część rzeczywista) — ten sam
predykat, którym liczy dziś rozpływ (`power_flow_newton_internal.py:1119`:
`losses_total_pu += s_from + s_to`).

**Zakaz zamrożony:** nie publikujemy pojedynczego, bezprzymiotnikowego `I_galezi`. Istniejący tor
statyczny wystawia `branch_current_pu[branch_id] = i_from` (`power_flow_newton_internal.py:1116`) —
czyli JEDNĄ stronę pod nazwą sugerującą wielkość gałęzi. **Kontrakt dynamiczny tego błędu nie
powtarza.** (Tor statyczny jest w zbiorze FROZEN, więc jego korekta jest osobną sprawą do decyzji
właściciela — patrz §10.)

### 7.2 Wzory — te same, którymi liczy rozpływ

Dla gałęzi bez przekładni (linia, kabel), z admitancją szeregową `y` i CAŁKOWITĄ susceptancją
poprzeczną `b` modelu π (połowa na każdą stronę — `dynamika/kontrakty.py:147-148`):

$$I_{od} = (V_i - V_j)\,y + V_i\,\frac{jb}{2}, \qquad I_{do} = (V_j - V_i)\,y + V_j\,\frac{jb}{2}$$

Dla transformatora z przekładnią zespoloną `t = |t|e^{j\varphi}` (moduł zaczepu i przesunięcie
grupy połączeń — `kontrakty.py:144-146`), w postaci zgodnej z Ybus:

$$I_{od} = \frac{V_i}{|t|^2}\,y - \frac{V_j}{|t|}e^{-j\varphi}\,y, \qquad
I_{do} = -\frac{V_i}{|t|}e^{j\varphi}\,y + V_j\,y$$

To są **te same wyrażenia**, które stosuje tor statyczny (`power_flow_newton_internal.py:1105-1112`).
Zgodność nie jest deklaracją: jest bramką odbioru §9.

### 7.3 Jednostki i znaczenie fizyczne

* Wielkości podstawowe: **jednostki względne** na bazie układu (ta sama baza, co reszta biegu).
* Przeliczenie na ampery wymaga napięcia bazowego węzła: `I_A = I_pu · S_b / (√3 · U_b)`.
  Ta algebra należy do liściowego pakietu wielkości pochodnych, nie do warstwy prezentacji.
* **Znaczenie:** wartość skuteczna składowej zgodnej, wielkość trójfazowa symetryczna.
  Dopóki tor czasowy odmawia niesymetrii (D2), kontrakt **jawnie nazywa** obserwable jako
  składową zgodną — żeby nikt nie odczytał ich jako prądu fazowego przy zwarciu doziemnym.

### 7.4 Dlaczego to musi być przed W6-C

Zabezpieczenie nadprądowe mierzy **prąd gałęzi**, nie moc urządzenia. Bez `i_od_pu`/`i_do_pu`
z jawną orientacją nie da się ani policzyć czasu zadziałania, ani rozstrzygnąć warunku
kierunkowego. Dlatego §7 jest warunkiem wstępnym fali W6-C, a nie jej częścią.

---

## 8. Brakujące obserwable urządzeń (C2–C5)

Wszystkie są wielkościami `z` — wyprowadzonymi ze stanów `x` i napięcia `y`, nigdy nowymi stanami.

| Obserwabla | Rodzina | Wyprowadzenie | Po co |
|---|---|---|---|
| `i_pu` (moduł i faza prądu urządzenia) | wszystkie | `Urzadzenie.prad_pu(stan, V)` — istnieje, nie jest publikowane | limity prądowe, porównanie z ogranicznikiem |
| `i_bierny_wsparcia_pu` | GFL, magazyn, turbina 3/4 | składowa prądu w osi prostopadłej do napięcia węzła, czyli rzut `I` na `j·V/\|V\|` | ocena wtrysku prądu biernego w czasie zapadu (FRT) |
| `ogranicznik_aktywny` | GFL, GFM, magazyn, turbina | predykat: czy zadanie prądu zostało obcięte przez ogranicznik w tej chwili | bez niego nie da się odróżnić „falownik oddał tyle, ile chciał" od „falownik został obcięty" |
| `f_pll_hz` | GFL, turbina 3/4 | `f_n·(1 + Δω_pll)`, gdzie `Δω_pll` to `RdzenGFL.czestotliwosc_pll` (`przeksztaltnik_gfl.py:196-198`) — **pomiar urządzenia** | porównanie pomiaru z rzeczywistą `f_i` węzła |
| `f_gfm_hz` | GFM | `f_n·predkosc` (`przeksztaltnik_gfm.py:260`) — **wielkość urządzenia** | ocena pracy wyspowej |
| `f_wirnika_hz` | maszyna synchroniczna, klasyczna | `f_n·omega_pu` | odróżnienie prędkości wirnika od częstotliwości węzła |
| `moc_mechaniczna_pu` | maszyna | stan `p_mechaniczna_pu` — już jest kanałem, wymaga tylko nazwy inżynierskiej | bilans momentu |

**Zamrożone:** `f_pll_hz`, `f_gfm_hz` i `f_wirnika_hz` są publikowane **pod własnymi nazwami i w
przestrzeni urządzenia**, obok — nie zamiast — `f_i` węzła. Ich porównanie jest wynikiem
inżynierskim (np. uchyb pętli synchronizacji przy zapadzie), a nie redundancją do usunięcia.

---

## 9. Plan falsyfikacji W6-A

W6-A **nie jest odebrana dlatego, że liczby są skończone.** Każdy przypadek ma wynik oczekiwany
wyprowadzony PRZED biegiem.

### 9.1 Częstotliwość węzła

| # | Przypadek | Wynik oczekiwany | Co obala |
|---|---|---|---|
| F-1 | stan ustalony, wszystkie urządzenia przy `ω = 1` | `f_i = f_n` na każdym węźle, z dokładnością wyprowadzoną z tolerancji algebry | błędny znak/człon `f_n` |
| F-2 | wyspa z JEDNYM urządzeniem tworzącym sieć o `ω = 1 + s` | `f_i = f_n(1+s)` na KAŻDYM węźle wyspy (§3.3) | błędny układ odniesienia |
| F-3 | narzucona odchyłka częstotliwości szyny sztywnej | `f_i` zbiega do narzuconej wartości; błąd maleje z krokiem | błąd estymatora pochodnej |
| F-4 | trajektoria przechodząca przez `±180°` | brak skoku `f_i`; wartość ciągła | brak rozwinięcia fazy |
| F-5 | głęboki zapad do `\|V\| → 0` | stan `NISKIE_NAPIECIE_NIEWIARYGODNA`, **nie** liczba bliska `f_n` | ciche podstawienie wartości znamionowej |
| F-6 | otwarcie gałęzi w chwili `t_zd` | brak impulsu; próbka w `t_zd` ze stanem `NIEDOSTEPNA`; wartości lewo- i prawostronne różne, obie skończone | różniczkowanie przez granicę zdarzenia |
| F-7 | porównanie z wyrocznią zewnętrzną na układzie maszyna–szyna sztywna | `e_∞ = max_t \|f_MV(t) − f_ref(t)\|` poniżej tolerancji wyprowadzonej inżyniersko | błąd modelu albo estymatora |

### 9.2 Prądy i przepływy gałęzi

| # | Przypadek | Wynik oczekiwany | Co obala |
|---|---|---|---|
| F-8 | układ dwuwęzłowy, gałąź bezstratna (`R = 0`, `b = 0`) | `s_od + s_do = 0` dokładnie; `i_od = −i_do` | błąd znaku/orientacji |
| F-9 | gałąź rezystancyjna | `Re(s_od + s_do) = \|i\|²R > 0`, wartość zgodna z rachunkiem analitycznym | błąd bazy/impedancji |
| F-10 | gałąź z susceptancją poprzeczną | `i_od ≠ −i_do` o prąd ładowania; suma zgodna z modelem π | zgubiona połówka susceptancji |
| F-11 | odwrócenie kierunku przepływu (zmiana generacji) | znak `Re(s_od)` zmienia się, orientacja `od→do` **nie** | orientacja liczona z chwilowego kierunku zamiast z definicji gałęzi |
| F-12 | transformator z zaczepem i przesunięciem grupy | wartości identyczne z torem statycznym na tej samej migawce | rozjazd modelu przekładni |
| F-13 | gałąź wyłączona | brak kanału albo stan `NIEDOSTEPNA` — **nie** zero udające przepływ | ciche zero |
| F-14 | **parytet `t = 0` z punktem pracy rozpływu** | wszystkie `s_od`, `s_do`, `i_od`, `i_do` oraz `\|V\|`, `θ` zgodne z wybranym biegiem rozpływu w granicy tolerancji uzasadnionej numerycznie | rozjazd inicjalizacji dynamiki z rozpływem |

**F-14 jest bramką nadrzędną.** Jeżeli w chwili `t = 0` obserwable dynamiczne nie zgadzają się
z punktem pracy, od którego bieg wystartował, to cała reszta przebiegu opisuje inny układ.

### 9.3 Obserwable urządzeń

| # | Przypadek | Wynik oczekiwany |
|---|---|---|
| F-15 | przekształtnik w ograniczeniu prądowym | `ogranicznik_aktywny` prawdziwy dokładnie wtedy, gdy `\|i\| = i_max` w granicach tolerancji |
| F-16 | zapad napięcia u falownika nadążnego | `i_bierny_wsparcia_pu` zgodny z prawem wsparcia z kontraktu (porównanie do 1e-12 na prawie algebraicznym, nie na przebiegu) |
| F-17 | maszyna przy `ω ≠ 1` | `f_wirnika_hz ≠ f_i` węzła przyłączenia; różnica równa pochodnej kąta mocy — **oczekiwana, nie błąd** |

---

## 10. Pozycje do decyzji właściciela wynikłe z tego kontraktu

| Id | Sprawa | Dlaczego decyzja, a nie wykonanie |
|---|---|---|
| **OD-35** | Tor statyczny rozpływu wystawia `branch_current_pu` = prąd JEDNEJ strony pod nazwą sugerującą wielkość gałęzi (`power_flow_newton_internal.py:1116`). Kontrakt dynamiczny tego nie powtarza, więc powstaną dwa różne znaczenia tej samej nazwy w produkcie | plik jest w zbiorze FROZEN (`scripts/solver_diff_guard.py:39-47`) — korekta wymaga bramki B-01. Warianty: (a) rozszerzyć wynik statyczny o drugą stronę pod bramką B-01; (b) zostawić i nazwać różnicę w prezentacji; (c) wystawić drugą stronę w warstwie odczytu bez zmiany rdzenia. Rekomendacja: **(c)** — pełna informacja bez ruszania zamrożonego rdzenia |
| **OD-36** | Żądana dokładność kąta `Δθ_dop`, z której wynika granica domeny ważności `f_i` (§4) | to wielkość inżynierska, nie numeryczna: określa, od jakiego zapadu przestajemy orzekać o częstotliwości. Rekomendacja: podać ją jako jawne pole nastaw biegu z wartością wymaganą, nie domyślną |
| **OD-37** | Silnik indukcyjny jako rodzina dynamiczna — patrz `docs/audit/DYSPOZYCJA_STABILITY_RMS.md` | duże silniki SN decydują o stabilności napięciowej po zwarciu (zapad, zatrzymanie, prąd rozruchowy przy odbudowie). Rodzina jest wymieniona w martwym module, **nie ma jej** w bibliotece W6-3A i nie ma jej w zamrożonej macierzy. To rozszerzenie celu, więc decyzja właściciela |

---

## 11. SO-1A i SO-1B — rozdzielenie przyjęte

Zgodnie z decyzją właściciela scenariusz odniesienia rozdziela się na dwa, o różnym ciężarze dowodowym:

| | **SO-1A — wyłączenie zaplanowane** | **SO-1B — wyłączenie z zabezpieczenia** |
|---|---|---|
| Co podaje inżynier | zwarcie w `t = 1 s`, zdjęcie w `t = 1,18 s`, ponowne załączenie w `t = 2,18 s` | zwarcie w `t = 1 s`, **konfigurację zabezpieczenia i wyłącznika** |
| Co wyznacza program | przebiegi, metryki | **chwilę zadziałania (≈180 ms)**, przebiegi, metryki |
| Czego dowodzi | deterministyczne wykonanie RMS i zdarzeń | **pełny łańcuch przyczynowy inżynierski** |
| Fala | wykonalny po W6-A (dziś: bez `f`, `ROCOF`, prądów gałęzi) | wymaga W6-A + W6-B + W6-C |

**Zamrożone: SO-1A nie jest dowodem na istnienie SO-1B.** Zaliczenie SO-1A nie zalicza ani jednego
wiersza macierzy przypisanego do W6-C.

---

## 12. Co ten dokument świadomie zostawia poza sobą

Uczciwie, żeby nie wyglądało na kompletność, której nie ma:

* **nie projektuje** zdarzenia warunkowego ani logiki zabezpieczenia (W6-C — ten kontrakt tylko
  dostarcza wielkość mierzoną),
* **nie definiuje** kryterium synchronizmu Φ ani metryk (W6-D),
* **nie rozstrzyga** kosztu pamięciowego pełnego zestawu kanałów gałęziowych przy dużej sieci —
  wymaga pomiaru przed wyborem strategii zakresu (kandydaci: zakres gałęzi z zainteresowania
  inżyniera, próbkowanie rzadsze dla kanałów drugoplanowych). Pomiar jest częścią W6-A, wybór
  strategii **po** pomiarze, nie przed,
* **nie zawiera** projektu prezentacji (W6-I).

---

## 13. WYKONANIE — stan po wdrożeniu (dopisane po autoryzacji W6-A)

### 13.1 Co powstało

| Element | Miejsce |
|---|---|
| Warstwa obserwabli `z(t)` | `backend/src/network_model/solvers/dynamika/obserwable.py` (nowy moduł) |
| Pochodna napięć z różniczkowania równania algebraicznego | `obserwable.py::pochodna_napiec` |
| Częstotliwość węzła: wartość + niepewność + stan jakości | `obserwable.py::czestotliwosc_wezla` |
| Wielkości OBU zacisków gałęzi | `obserwable.py::wielkosci_galezi` |
| Kanały wyniku | `silnik.py::_kanaly_obserwabli`, `silnik.py::_probkuj_obserwable` |
| Przestrzeń `obserwabla` w kontrakcie | `application/contracts/resultset_dynamic_v1.py::PrzestrzenKanalu` |
| Falsyfikacja | `backend/tests/network_model/dynamika/test_obserwable.py` (24 testy) |

**Kanały na węzeł:** `f_hz@`, `u_f_hz@`, `jakosc_f@`.
**Kanały na gałąź:** `i_od_pu@`, `i_do_pu@`, `p_od_pu@`, `q_od_pu@`, `p_do_pu@`, `q_do_pu@`.

### 13.2 Miejsce obliczenia — priorytet 1 z §3.5 osiągnięty

Pochodna napięć **nie jest różnicą próbek**. Różniczkowanie `g(x,y) = 0` po czasie daje układ
liniowy `(∂g/∂y)·ẏ = (∂I/∂x)·ẋ`, którego macierz to **dokładnie ten sam jakobian**, którym Newton
rozwiązuje algebrę (`siec.jakobian_algebry`), a prawa strona składa się z bloków
`jakobian_prad_stan` urządzeń. Konsekwencje: brak błędu rzędu kroku wyjścia, brak potrzeby
rozwijania fazy (kąt nie jest różniczkowany numerycznie), brak impulsu na granicy zdarzenia.

### 13.3 Falsyfikacja — wynik

```
PYTHONPATH=$PWD:$PWD/src python -m pytest tests/network_model/dynamika/test_obserwable.py -q
→ 24 passed
```

Regresja pakietu dynamiki + adaptera + API: **1 645 passed, 3 deselected** (odznaczone to wyrocznia
ANDES w osobnym środowisku).

**F-2 na biegu — najważniejszy test.** Wyspa bez szyny sztywnej: maszyna klasyczna + odbiór o
stałej mocy, skok obciążenia w `t = 0,2 s`. Ponieważ SEM maszyny klasycznej i moc mechaniczna są
między zdarzeniami stałe, a odbiór o stałej mocy jest ekwiwariantny względem obrotu, cały układ
fazorów obraca się sztywno z kątem wirnika — więc `f_i = f_n·ω` musi zachodzić **na każdej szynie
i w każdej próbce**. Zachodzi z tolerancją względną 1e-6. Test padłby natychmiast przy usunięciu
członu `f_n` albo przy potraktowaniu kąta jako kąta układu nieruchomego.

**Znalezisko przy pisaniu tego testu:** pierwsza wersja używała maszyny 6. rzędu i **padła** —
słusznie. Przy zmiennych strumieniach przejściowych SEM nie jest stała, więc tożsamość
`f_i = f_n·ω` **nie obowiązuje**. To nie był błąd obserwabli, tylko błąd doboru układu do
tożsamości. Zapis tutaj, żeby nikt nie „naprawił" tego kiedyś rozluźnieniem tolerancji.

**Iniekcje** (5 przypadków) dowodzą, że powyższe testy wykrywają: brak członu `f_n`, estymator
różnicowy przy zawinięciu fazy, zamianę zacisków gałęzi, błędne sprzężenie w `S = V·conj(I)`,
pominiętą połowę susceptancji.

### 13.4 Ograniczenie polityki jakości — uczciwie

Podstawienie wzorów daje: `u(f) > |f − f_n|` **dokładnie dla `|V| < 3·u_V`** (przy `u_V̇ = 0`),
gdzie `u_V` jest **zmierzonym** błędem napięcia, nie tolerancją Newtona. Pasmo `OGRANICZONA`
jest więc wąskie i przylega do pasma `NIEDOSTEPNA`.

> **KOREKTA 2026-09-18.** Wcześniejsza wersja tego zdania podawała granicę `|V| < 4·tolerancja`.
> Współczynnik 4 zawierał człon pochodzący z ZAŁOŻENIA o proporcjonalności błędu pochodnej;
> po zastąpieniu obu niepewności pomiarem zostaje czysty współczynnik 3 z różniczkowania
> `θ̇ = Im(V̇·conj(V))/|V|²` (licznik ×1, mianownik ×2).

**Co to znaczy:** polityka chroni przed **numeryczną** bezsensownością kąta i nic ponad to.
**Nie orzeka**, od jak głębokiego zapadu inżynier ma przestać mówić o częstotliwości węzła.
Ta druga, **fizyczna** granica wymaga polityki wyprowadzonej i **zwalidowanej** — i pozostaje
jawną luką przypisaną do fali walidacyjnej. Nie zastępujemy jej progiem przyjętym z góry, bo
to jest dokładnie to, co OD-36 odrzuca.

Wartość przy stanie `NIEDOSTEPNA` niesie niepewność równą **całej częstotliwości znamionowej** —
konsument ignorujący kod jakości widzi wtedy, że liczba nie niesie treści.

### 13.5 Pomiar kosztu kanałów

Na układzie SMIB (2 szyny, 1 gałąź, 2 urządzenia): `siec` 4 kanały, `urzadzenie` 10,
**`obserwabla` 12**, razem 26. Przyrost: **3 kanały na szynę + 6 na gałąź**.

Dla sieci rzędu 50 szyn i 60 gałęzi daje to ~510 kanałów obserwabli. Pomiar na sieci tej skali
**nie został jeszcze wykonany** — i dopóki nie zostanie, strategia zakresu (wybór gałęzi
z zainteresowania, rzadsze próbkowanie drugiego planu) **nie jest wybierana**. Wybór przed
pomiarem byłby zgadywaniem.

### 13.6 Czego W6-A nie dostarczyła

* **ROCOF** — zgodnie z decyzją pozostaje CELEM, nie jest promowany; wymaga własnej kwalifikacji
  estymatora, okna i semantyki zdarzeń,
* **prąd bierny wsparcia i stan ogranicznika** urządzeń (C2–C5 z macierzy) — kanały urządzeniowe
  nie zostały rozszerzone w tej fali,
* **wyrocznia zewnętrzna dla `f_i`** (przypadek F-7 z §9.1) — porównanie z niezależnym narzędziem
  nie zostało wykonane; tożsamości analityczne F-1…F-5 i parytet B-8 to dowody **wewnętrzne**,
* **jednostka amperowa** prądów gałęzi — kontrakt wystawia jednostki względne; przeliczenie na
  ampery należy do warstwy prezentacji przez pakiet wielkości pochodnych.

---

## Załącznik Z — RUNDA DOMKNIĘCIA W6-A (2026-09-18), dowody wykonywalne

Baza: `903cd222`. Tryb: WERYFIKUJ → ODTWÓRZ → SFALSYFIKUJ → WYJAŚNIJ → NAPRAW TYLKO Z DOWODEM.
Wszystkie liczby poniżej pochodzą z uruchomień, nie z oszacowań.

### Z.1 Znaleziska

| ID | waga | hipoteza | odtworzone | przyczyna źródłowa | naprawa |
|---|---|---|---|---|---|
| Z-01 | P0 | `u_f_hz` nie ogranicza rzeczywistego błędu | TAK — iloraz 2,45 przy `jakość = wiarygodna` | `u_V` **zakładane** równe tolerancji Newtona, gdy błąd rozwiązania to `J_y^{-1} r` (wzmocnienie 8,4×); dodatkowo błąd pochodnej zakładany proporcjonalny (1,83×) | obie niepewności **mierzone**, propagacja wyprowadzona; pokrycie 140/140 punktów, najgorszy iloraz 0,769 |
| Z-02 | P1 | zbieżność algebry nie dowodzi istnienia pochodnej | TAK — jakobian osobliwy daje surowy `RuntimeError` scipy | `splu` bez osłony w `pochodna_napiec` | odmowa **nazwana** `dynamika.algebra_niezbiezna`; w próbkowaniu → `NIEDOSTEPNA`, bieg trwa |
| Z-03 | P1 | gałąź otwarta w ENM jest nieosiągalna dla zdarzeń | TAK — `zalaczenie_galezi` na `kab-rezerwa` odmówione | `adapter_dynamiki.py` pomija `not in_service` (`continue`) | **NIE naprawione** — zakres W6-B (wymaga modelu stanu łączeniowego w rdzeniu) |
| Z-04 | P2 | iloczyn cech przekładnia × susceptancja bez testu | TAK — B-5 i B-6 rozłączne | test przypinał instancje, nie iloczyn | testy B-9 (przekładnia × susceptancja) i B-10 (bilans zacisków = straty) |
| Z-05 | P2 | rozłączne przestrzenie nazw rozpływu i dynamiki | TAK — rozpływ adresuje `id` grafu, dynamika `ref` ENM | most `ref_to_graph_id` jest jedyny i niejawny | most **jawny** w teście B-8; do rozważenia jako pozycja kontraktu odczytu |

### Z.2 Rzeczywiste B-8 (§10) — ENM → rozpływ → `pf_run_id` → adapter → RMS

22 porównane wielkości na sieci G16, najgorszy błąd względny **2,58e-12**; `|V|` i `θ` zgodne
**co do bitu** (0,00e+00). Pokrycie: przepływ wsteczny (`lin-oze`), kabel rezystancyjny z
susceptancją (`kab-odplyw`), transformator z zaczepem poza znamionowym i przesunięciem grupy
`Dyn11` (`tr-gpz`). Poza porównaniem: sprzęgło szyn `spr-szyn` — tor rozpływu zwija łączniki i
nie wystawia dla niego wiersza. Tolerancja testu 1e-9 wyprowadzona z arytmetyki, nie dobrana
do obserwacji (cztery rzędy zapasu).

### Z.3 SO-1A (§12) — wykonanie, nie deklaracja

Wykonane: zwarcie 3F `t = 1,000 s` → zdjęcie `t = 1,180 s` → otwarcie sprzęgła `t = 1,180 s`
→ horyzont **10,000 s**. 1057 kroków, 6 odrzuconych, 501 próbek, 73 kanały.
`max‖f‖ = 9,78e-09`, **max residuum KCL = 7,15e-09**. Chwile wykonania zdarzeń **równe
zaplanowanym co do bitu**. Skok algebraiczny reinicjalizacji: `Δy_max = 8,05e-01` (zwarcie),
`6,25e-01` (zdjęcie + otwarcie); residuum po reinicjalizacji `6,99e-10` i `1,72e-15`.
Powtórzenie biegu: odcisk próbek **identyczny** (`37e257b10cb05ae2c1a735d8`).

**Noga ponownego załączenia NIE przechodzi** i to jest fizyka, nie luka narzędzia: po sekundzie
pracy wyspowej kąt wyspy odjeżdża, a załączenie sprzęgła bez synchronizacji daje skok kąta,
którego pętla synchronizacji przekształtnika PV nie nadąża odtworzyć — rdzeń odmawia z
diagnozą wskazującą `gen-pv.pll_kat_rad` jako największe residuum. Ten sam wynik przy
scenariuszu **bez zwarcia** (samo otwarcie i zamknięcie sprzęgła), co izoluje przyczynę.
Zdarzenie `synchronizacja` jest w kontrakcie danych, ale rdzeń go **nie wykonuje** (odmowa
`dynamika.rodzaj_zdarzenia_nieobslugiwany`) — to jest brakujące ogniwo nogi SPZ, pozycja W6-B.

Odstępstwo od litery SO-1A, nazwane wprost: sieć wzorcowa G16 niesie PV 1,6 MW i maszynę
synchroniczną, a nie „PV 2,75 MW i magazyn". Noga magazynowa scenariusza **nie jest ćwiczona**.

### Z.4 Narzut wydajnościowy (§15) — zmierzony

Sieć 5-szynowa, najlepszy z 3 przebiegów, ten sam punkt pracy i scenariusz:

| horyzont / próbek | bez obserwabli | W6-A z jedną faktoryzacją | W6-A z niepewnością mierzoną |
|---|---|---|---|
| 2,0 s / 101 | 1,467 s | 1,541 s (+5,0 %) | 1,691 s (+15,2 %) |
| 2,0 s / 401 | 2,844 s | 3,318 s (+16,6 %) | 3,770 s (+32,5 %) |
| 10,0 s / 501 | 8,197 s | 8,784 s (+7,2 %) | 9,393 s (+14,6 %) |

Narzut skaluje się **gęstością próbkowania**, nie horyzontem — obserwabla liczy się raz na
próbkę. Koszt pomiaru niepewności to druga faktoryzacja. Optymalizacja przez ponowne użycie
rozkładu LU (`δV̇ = J^{-1}(δb − δJ·V̇)`) jest możliwa i **świadomie niewdrożona**: dawałaby tę
samą wielkość pierwszego rzędu, ale bez dowodu równoważności nie wolno zamieniać poprawności
na czas.

### Z.5 Macierz mutacyjna (§16)

| mutacja | wykrywający test | dowód |
|---|---|---|
| M-01 usunięcie członu `f_n` | `test_f2_bieg_wyspowy…` | ZABITA |
| M-02 odwrócenie znaku prawej strony DAE | `test_f2_bieg_wyspowy…` | ZABITA |
| M-03 estymator różnicowy kąta | `test_z2_iniekcja_rozniczkowanie…`, `test_f3…` | wykazana wykonywalnie (nie mutacja źródła — produkcja nie ma miejsca na różnicę) |
| M-04 różniczkowanie przez nieciągłość | `test_z1_probka_w_chwili_zdarzenia…` | ZABITA (zamiana kolejności zdarzenie/próbka) |
| M-05 zamiana orientacji zacisków | `test_b3…` | ZABITA |
| M-06 `S = V·I` zamiast `V·conj(I)` | `test_b7…` | ZABITA |
| M-07 pełne `B` zamiast `B/2` | `test_b5…` | ZABITA |
| M-08 przekładnia po złej stronie | `test_b6…` | ZABITA |
| M-09 znak przesunięcia fazowego | `test_b6…` | ZABITA |
| M-10 zła baza mocy (×2) | `test_b8_parytet…realnej_sciezce…` | ZABITA |
| M-11 rozjazd inicjalizacji rozpływ→RMS | `test_b8_parytet…realnej_sciezce…` | ZABITA |
| M-12 fałszywa promocja jakości | `test_niepewnosc_ogranicza…` | ZABITE 4 warianty (a: `u_V̇ = 0`; b: `u_V = 0`; c: człon pochodnej wycięty; d: powrót do proporcjonalności) |

**Uczciwie:** pierwsza wersja testu pokrycia przypinała TYLKO punkt blisko granicy obciążalności
i mutacje M-12a/M-12c **przeżyły** — bo w tym punkcie dominuje błąd napięcia. Test został
rozszerzony o drugi reżim (`P = 0,99`, start 1,00), w którym dominuje błąd pochodnej. To jest
ta sama pułapka, przed którą ostrzega reguła KLASA, NIE INSTANCJA.

### Z.6 Stan walidacji po rundzie

| stan | wartość | podstawa |
|---|---|---|
| WYKONYWALNE NUMERYCZNIE | **TAK** | SO-1A 10 s, residuum KCL 7,15e-09, odtwarzalność bit w bit |
| KWALIFIKOWANE NUMERYCZNIE | **TAK** | rzeczywiste B-8 2,58e-12, 12 mutacji zabitych, niepewność pokrywa błąd w 140/140 punktach |
| ZWALIDOWANE FIZYCZNIE | **NIE** | brak porównania z wyrocznią zewnętrzną dla częstotliwości (F-7) |
| KWALIFIKOWANE INŻYNIERSKO | **NIE** | polityka jakości jest numeryczna; bieg SO-1A publikuje `f = −17,15 Hz` na szynie PV w czasie zwarcia z kodem „wiarygodna" — liczba poprawna dla modelu fazorowego, ale nazwa „częstotliwość szyny" ją nadinterpretuje |

Ostatni wiersz jest **mierzonym** uzasadnieniem, dlaczego fizyczna granica ważności musi wyjść
z fali walidacyjnej (W6-F), a nie z progu przyjętego z góry.
