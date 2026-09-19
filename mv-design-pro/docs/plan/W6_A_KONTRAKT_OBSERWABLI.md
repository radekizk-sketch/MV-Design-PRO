> **KOREKTA 2026-09-18 (runda kwalifikacyjna, §2 i §3).** Zdanie „`|J^-1 r|` ogranicza błąd"
> **też jest fałszywe** i zostało obalone. Z rozwinięcia Taylora `y - y* = J^-1 r + J^-1 R_2`,
> a dla odbioru o stałej mocy stała Lipschitza jakobianu rośnie jak `1/|V|^3`, więc człon
> drugiego rzędu nie znika. Pomiar wobec wyroczni **analitycznej liczonej w 60 cyfrach**
> (postać zamknięta, bez wspólnego jakobianu i bez wspólnego Newtona) daje `rho_V > 1`.
> Oddzielnie obalona została propagacja różniczkowa `3x`: dla `V = 1`, `Vdot = j`,
> `dV = -0,9` rzeczywista zmiana wynosi 9, a formuła daje 2,7.

Obie niepewności są **mierzone**, a propagacja jest **skończona**:

$$u_V = \left| J_y^{-1} r \right|, \qquad
u_{\dot V} = \left| \dot V(y - J_y^{-1} r) - \dot V(y) \right|$$

$$\boxed{\;u_{\dot\theta} \;\le\; \frac{u_{\dot V}}{|V| - u_V}
\;+\; \frac{|\dot V|\,u_V}{|V|\,(|V| - u_V)}\;}, \qquad u_V < |V|$$

Nierówność wynika z **tożsamości** `theta_dot = Im(Vdot/V)` i dokładnej różnicy

$$\frac{\dot V^{*}}{V^{*}} - \frac{\dot V}{V}
= \frac{\delta\dot V\,V - \dot V\,\delta V}{V\,(V + \delta V)}$$

po nierówności trójkąta i `|V + dV| >= |V| - u_V`. Jest **ciasna** — osiągana dla `dV`
antyrównoległego do `V` — więc nie zawiera dobranego zapasu.

**STATUS DOWODOWY — trzy różne poziomy, nie wolno ich mylić:**

| Element | Status |
|---|---|
| `theta_dot = Im(Vdot conj(V))/|V|^2 = Im(Vdot/V)` | **TOŻSAMOŚĆ** (dowiedziona) |
| propagacja `(u_V, u_Vdot) -> u_theta_dot` | **NIERÓWNOŚĆ DOWIEDZIONA**, warunkowo: pod założeniem `|dV| <= u_V`, `|dVdot| <= u_Vdot` |
| `u_V = \|J^-1 r\|` jako opis `\|y - y*\|` | **ESTYMATA pierwszego rzędu** — NIE granica |
| `u_f` jako opis pełnego błędu `f` | **ESTYMATA**; nie obejmuje błędu całkowania, modelu ani parametrów |

Granica niedostępności wynika stąd wprost i **nie jest progiem napięciowym** (OD-36):

$$|V_i| \le u_V \;\Rightarrow\; \texttt{NIEDOSTEPNA}
\qquad\text{(mianownik nierówności przestaje być dodatni)}$$

**Kody stanu mówią, co predykat sprawdza** (korekta nazw 2026-09-18):
`ROZROZNIALNA` / `NIEROZROZNIALNA` / `NIEDOSTEPNA`. Predykat brzmi dosłownie „odchyłka od
częstotliwości znamionowej przewyższa oszacowany błąd numeryczny", czyli jest **rozróżnialna
na tle szumu numerycznego**. Nie orzeka wiarygodności inżynierskiej ani sensu fizycznego —
poprzednia nazwa `WIARYGODNA` obiecywała jedno i drugie. Kanał nazywa się `u_f_est_hz`.

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

Podstawienie wzorów daje: `u(f) > |f − f_n|` **dokładnie dla `|V| < 2·u_V`** (przy `u_Vdot = 0`),
gdzie `u_V` jest **zmierzoną** estymatą błędu napięcia.

> **HISTORIA WSPÓŁCZYNNIKA**, bo każde przejście usuwało jedno założenie, a nie dobierało stałej:
> `4·tolerancja` (niepewność **założona** równa tolerancji Newtona) → `3·u_V` (niepewność
> **mierzona**, propagacja **różniczkowa**) → `2·u_V` (propagacja **skończona**).

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

---

## Załącznik Z2 — RUNDA KWALIFIKACYJNA W6-A (2026-09-18), audyt niezależny

Baza: `865c287f`. Zarzut właściciela: poprzednia runda **pomieszała poziomy dowodu** —
nazywała estymatę granicą, a liczbę z sesji dowodem. Poniżej rozstrzygnięcie każdego zarzutu.

### Z2.1 Werdykt wobec zarzutów

| ID | zarzut | odtworzony | matematycznie słuszny | stan końcowy |
|---|---|---|---|---|
| **§1** | „140 × 5" nie istnieje w repozytorium | **TAK** — commitowany test miał 2 reżimy × 3 tolerancje × 2 szyny = **12 porównań** | tak | **NAPRAWIONE**: `kwalifikacja_niepewnosci.py` w repo, uruchamiany testem i z wiersza poleceń |
| **A-01** | `\|J^-1 r\|` nie jest granicą | **TAK** — `rho_V > 1` wobec wyroczni analitycznej w 60 cyfrach | tak (człon `J^-1 R_2`) | **PRZYJĘTY**: kontrakt mówi ESTYMATA; przekroczenie przypięte testem |
| **A-02** | propagacja `3x` pada dla zaburzeń skończonych | **TAK** — kontrprzykład `V=1, Vdot=j, dV=-0,9`: 9 wobec 2,7; 400 000 losowań: najgorszy iloraz **8,61** | tak | **NAPRAWIONE**: nierówność skończona, ciasna (najgorszy iloraz **0,969**) |
| **A-03** | `WIARYGODNA` obiecuje więcej, niż sprawdza | **TAK** — bieg SO-1A publikował `-17,15 Hz` jako „wiarygodną" | tak | **NAPRAWIONE**: `ROZROZNIALNA` / `NIEROZROZNIALNA`, kanał `u_f_est_hz` |
| **A-04** | brak błędu całkowania w `u_f` | **TAK** — przy `h = 4 ms` błąd czasowy 2,14e-12 Hz wobec estymaty 6,45e-14 Hz (**33×**) | tak | **NAZWANE**: wykluczenie w kontrakcie + test strukturalny sygnatury |
| **A-05** | punkt skorygowany liczony przed klasyfikacją | **TAK** (analiza kodu) | tak | **NAPRAWIONE**: kolejność odwrócona; nieobliczalny punkt ⇒ `u_Vdot = inf` ⇒ `NIEDOSTEPNA` |
| **Z-03** | gałąź otwarta nieosiągalna dla zdarzeń | **TAK** | tak | **OPEN → W6-B** (wymaga modelu stanu łączeniowego, nie łatki) |

### Z2.2 Hipotezy, które PADŁY — zapisane, nie usunięte

**H1 — „estymata myli się o rzędy wielkości".** Pierwszy pomiar dał `rho_V = 8,9e6`.
**Artefakt.** Przy `P → P_max` obie gałęzie krzywej PV zbiegają się (przy `0,99999 P_max`
rozstęp `|V_B|` to 3,5e-3), Newton z różnych punktów startowych ląduje na różnych gałęziach,
a porównanie mierzyło wtedy **odległość między rozwiązaniami**, nie błąd jednego z nich.
Sweep odrzuca dziś punkty o rozstępie poniżej `MIN_ROZSTEP_GALEZI_PU`.

**H2 — „wyrocznia analityczna w podwójnej precyzji wystarczy".** Nie wystarczy: wyróżnik
`E^2 - 4(v^2 + X_tot Q)` przy nosie krzywej to różnica prawie równych liczb (1,21 − 1,209754),
tracąca ~4 cyfry. Wyrocznia liczy się dziś w `decimal` z 60 cyframi; residuum produkcyjne w
punkcie wzorcowym wynosi ~1e-16 na **obu** gałęziach.

**H3 — „rho > 1 na pełnej siatce dowodzi wady estymaty".** Częściowo artefakt: przy ciasnej
tolerancji błąd i estymata schodzą do poziomu zaokrąglenia i iloraz mierzy szum arytmetyki.
Raport podaje **oba** zbiory; zapadki dotyczą wielkości nad podłogą szumu.

**H4 — „porządek zbieżności czasowej da się zmierzyć na SMIB".** Nie udało się: na układzie
odniesienia błąd dyskretyzacji już dla `h ≤ 20 ms` leży na poziomie zaokrąglenia (~1e-13 Hz),
więc ilorazy są szumem i **rząd nie został potwierdzony empirycznie**. Wykluczenie błędu
całkowania z `u_f_est_hz` jest ustalone **konstrukcyjnie** (funkcja nie widzi kroku), a nie
przez badanie rzędu. Sztywniejszy przypadek walidacyjny → dług otwarty.

### Z2.3 Sweep kwalifikacyjny — reprodukowalny

```
cd mv-design-pro/backend
PYTHONPATH=$PWD:$PWD/src python -m tests.network_model.dynamika.kwalifikacja_niepewnosci [--pelny]
```

Siatka: iloczyn `P` (5 ułamków obciążalności) × `Q` × `R/X` × susceptancja × przekładnia
zespolona × punkt startowy × **5 tolerancji Newtona**, dwie rodziny wyroczni (analityczna
w 60 cyfrach oraz zaciśnięcie z tego samego punktu).

Siatka CI, wielkości **nad podłogą szumu**:

| metryka | p50 | p90 | p99 | max |
|---|---|---|---|---|
| `rho_V` | 1,0000 | 1,0003 | 1,0015 | **1,0015** |
| `rho_Vdot` | 1,0000 | 1,0007 | 1,0043 | **1,0043** |
| `rho_f` | 0,2981 | 0,7279 | 0,7990 | **0,7990** |

Czyta się to tak: estymaty `u_V` i `u_Vdot` są **przekraczane** o ułamki procenta (bo są
estymatami pierwszego rzędu), a `u_f` **pokrywa** błąd z zapasem — bo nierówność skończona
jest zachowawcza wobec kierunku rzeczywistego zaburzenia. To jest własność **empiryczna
zbadanej klasy**, nie twierdzenie.

### Z2.4 Macierz mutacyjna M-Q01…M-Q17

16 mutacji **źródła** zabitych; jedna (`M-Q14`) obsłużona testem alternatywnej
implementacji, bo produkcja nie ma miejsca na różnicę skończoną; jedna (`M-Q02`, znak
korekty Newtona) **nieobserwowalna w wyniku** — moduł `|Vdot(y∓J^-1 r) − Vdot(y)|` jest w
pierwszym rzędzie niewrażliwy na znak — więc przypięta **testem AST** i nazwana strukturalną.

### Z2.5 F-7 — status i specyfikacja przypadku walidacyjnego

**STATUS: NIEWYKONANE.** Most do ANDES (`tests/network_model/dynamika/wyrocznia_andes.py`)
porównuje **kąt wirnika** `GENCLS.delta` — stan maszyny, nie wielkość sieciową. Zielony job
ANDES w CI **nie jest** dowodem F-7, bo porównuje inną wielkość fizyczną niż `f_hz@szyna`.

**SPECYFIKACJA PRZYPADKU** (do wykonania w fali walidacyjnej, nie w tej rundzie):

1. **Układ:** ten sam SMIB, którego most już używa — równoważność elektryczna jest w moście
   udowodniona i zmierzona (`|delta_rel| = 7e-10 rad` przy inicjalizacji).
2. **Wielkość porównywana:** ANDES `BusFreq` (wyjście `f`, p.u.) wobec naszego `f_hz@`.
   **Uwaga metodyczna — to NIE jest ta sama definicja:** `BusFreq` liczy pochodną kąta przez
   filtr washout + dolnoprzepustowy o stałej `Tf`, a my liczymy pochodną **analitycznie**.
   Porównanie wymaga albo (a) ustawienia `Tf` na tyle małego, by opóźnienie filtru zeszło
   poniżej progu walidacyjnego, albo (b) przepuszczenia **naszego** przebiegu przez ten sam
   filtr przed porównaniem. Wariant (b) jest uczciwszy i nie wymaga strojenia wyroczni.
3. **Reżimy:** (i) stan ustalony — obie strony muszą dać `f_n`; (ii) rozbieg wyspowy bez
   regulatora — obie strony muszą dać `f_n·omega`; (iii) okno zwarcia — tu rozbieżność
   definicji jest największa i to jest właściwy przedmiot pomiaru.
4. **Oś czasu:** wspólna siatka wyjścia albo interpolacja o **kontrolowanym** błędzie;
   `unwrap` kąta wyłącznie po stronie wyroczni, jeśli jej wyjście tego wymaga.
5. **Tolerancja WYPROWADZONA**, nie dobrana: suma (a) błędu dyskretyzacji obu stron przy
   zadanym kroku, (b) opóźnienia filtru wyroczni, (c) różnicy modelu maszyny. Bez tego
   rozkładu wynik nie jest walidacją, tylko zgodnością liczb.
6. **Kryterium:** `e_inf = max_t |f_MV(t) − f_ref(t)|` poniżej tak wyprowadzonej tolerancji,
   raportowane **odcinkami** (przed / w oknie / po), jak już robi to porównanie kąta.

Dopóki to nie zostanie wykonane: **ZWALIDOWANE FIZYCZNIE = NIE**.

### Z2.6 SO-1A — kryterium odbioru NIE zostało wykonane

Kryterium zamrożone w `FINAL_DYNAMICS_CAPABILITY_FREEZE.md` §0.1 brzmi: **„Instalacja PV
2,75 MW i magazyn energii pracują w miejscu przyłączenia"**. Sieć wzorcowa G16 niesie
**PV 1,6 MW i maszynę synchroniczną** — magazynu nie ma.

Poprzednia runda nazwała to „odstępstwem od litery". To była zła nazwa. Poprawnie:
**acceptance criterion not exercised**. Wykonany został scenariusz o tej samej strukturze
czasowej (zwarcie → zdjęcie po 180 ms → horyzont 10 s), ale na innym składzie źródeł, więc
**nie zalicza** kryterium SO-1A. Możliwości są trzy i wybór należy do właściciela:

* **A** — zbudować sieć wzorcową z PV 2,75 MW i magazynem, wykonać scenariusz;
* **B** — formalnie zmienić kryterium decyzją właściciela (z zapisem w dokumencie zamrożenia);
* **C** — pozostawić **OPEN**.

Do czasu rozstrzygnięcia pozycja ma status **OPEN**, a nie „wykonane z odstępstwem".

---

## Załącznik Z3 — SO-1A wykonane (bramka właścicielska, 2026-09-18)

Pozycja Z2.6 była **OPEN**: kryterium odbioru „PV 2,75 MW i magazyn energii w miejscu
przyłączenia" nie było wykonane, bo sieć G16 niesie PV 1,6 MW i maszynę synchroniczną.
Właściciel wybrał **wariant A** (zbudować kanoniczny przypadek i go wykonać). Ten załącznik
opisuje, co przy tym wyszło.

### Z3.1 Sieć wzorcowa G17 i macierz zgodności

Nowa sieć rejestru: `tests/golden/enm_builders/so1a_pv_magazyn.py` (wpis **G17**).
Wykonanie: `tests/e2e/test_so1a_scenariusz_odniesienia.py` (10 testów).

| Wymaganie zamrożenia §0.1/§0.2 | Implementacja przypadku | Zgodność |
|---|---|---|
| instalacja PV **2,75 MW** | `gen-pv`, `p_mw = 2.75`, `gen_type = pv_inverter`, rodzina `przeksztaltnikowa_gfl`, `s_n = 3,0 MVA` | **TAK** |
| **magazyn energii** | `gen-magazyn`, `gen_type = bess`, rodzina `magazyn`, 2 MWh / ±1 MW, przekształtnik **GFM** (VSM) | **TAK** |
| obydwa **w miejscu przyłączenia** | wspólna szyna `b-przylacze` | **TAK** |
| zwarcie **na szynie SN** w `t = 1 s` | `zwarcie` 3F na `b-sn-stacja`, `t_s = 1.000` | **TAK** |
| zabezpieczenie otwiera wyłącznik **po 180 ms** | `wylaczenie_galezi` na `wyl-pole` (`type: breaker`), `t_s = 1.180`; zdjęcie zwarcia `t_usuniecia_s = 1.180` | **TAK co do chwili**; chwila pochodzi z wpisu inżyniera, nie z nastaw — to jest definicja SO-1A (§0.2), wyznaczenie jej z zabezpieczenia to SO-1B |
| **po 1 s** ponowne załączenie | `zalaczenie_galezi` na `wyl-pole`, `t_s = 2.180` | **TAK** |
| zbadaj zachowanie sieci **przez 10 s** | `horyzont_s = 10.0`, 501 próbek co 20 ms | **TAK** |
| łańcuch ENM → rozpływ → inicjalizacja → zdarzenia → RMS | `_execute_power_flow` (realny solver) → `pf_run_id` → `punkt_pracy_z_biegu_rozplywu` → `zloz_wejscie_dynamiki` → `SilnikDynamiki` | **TAK** |
| użytkownik nie wpisuje `U_post`, `f_post`, `δ_fault` | żaden stan początkowy nie jest budowany ręcznie | **TAK** |

**Dwie wielkości przypadku NIE pochodzą z zamrożenia i są nazwane wprost:**

1. **Rezystancja łuku `R_f = 0,5 Ω`.** Zwarcie metaliczne (`R_f = X_f = 0`) nie ma w modelu
   węzłowym skończonej admitancji — rdzeń odmawia nazwanym kodem
   `dynamika.zwarcie_metaliczne_bez_admitancji`. Wartość odpowiada łukowi ~0,3 m przy
   prądzie zwarciowym rzędu kilku kA (wzór Warringtona). **Pomiar wrażliwości** (nie jest
   to dobór pod zbieżność): bieg wykonuje się dla 5,0 / 2,0 / 1,0 / 0,5 / 0,2 Ω, a zapad na
   przyłączu sięga odpowiednio 0,93 / 0,72 / 0,49 / 0,29 / 0,14 pu. Przy `R_f ≤ 0,1 Ω`
   (napięcie resztkowe < 0,05 pu) re-inicjalizacja algebry nie zbiega — to **granica modelu
   odbioru o stałej mocy**, którą rdzeń deklaruje wprost (`dynamika.odbior_zip_nieobslugiwany`),
   a nie defekt wykryty w tej rundzie.
2. **Topologia pierścieniowa.** Wariant promieniowy (stacja zasilana wyłącznie przez
   wyłącznik) po jego otwarciu zostawia podsieć bez źródła albo — gdy OZE jest za
   wyłącznikiem — **wyspę**. Jedno i drugie to zdolność **D11, przypisana w zamrożeniu do
   fali W6-B**. SO-1A dowodzi fali W6-A, więc jego układ nie może zależeć od zdolności
   następnej fali. Pierścień spełnia opis scenariusza i jest dobrze postawiony w każdej
   chwili biegu.

### Z3.2 Co bieg pokazał (dowód wykonania, nie walidacji fizycznej)

Wszystkie cztery zdarzenia wykonane **w chwilach zaplanowanych**, każde ze **zerową** zmianą
stanów różniczkowych (`delta_x_max = 0`, układ DAE indeksu 1) i residuum KCL ≤ 5,6·10⁻¹¹:

| zdarzenie | `t` zaplan. | `t` wykon. | `Δy_max` | residuum KCL |
|---|---|---|---|---|
| `zwarcie` (b-sn-stacja) | 1,000 | 1,000 | 9,387·10⁻¹ | 1,288·10⁻¹² |
| `zdjecie_zwarcia` | 1,180 | 1,180 | 9,220·10⁻¹ | 5,587·10⁻¹¹ |
| `wylaczenie_galezi` (wyl-pole) | 1,180 | 1,180 | 9,220·10⁻¹ | 5,587·10⁻¹¹ |
| `zalaczenie_galezi` (wyl-pole) | 2,180 | 2,180 | 9,782·10⁻³ | 4,091·10⁻¹² |

Bieg: 1137 kroków, 16 odrzuconych, `max‖f‖ = 9,78·10⁻¹¹`, `max‖g‖ = 4,63·10⁻¹⁰`,
501 próbek × 79 kanałów, czas 18,8 s.

Obserwable w chwilach charakterystycznych (`b-przylacze` — miejsce przyłączenia):

| faza | `t` [s] | `U` [pu] | `f` [Hz] | `u_f,est` [Hz] | jakość |
|---|---|---|---|---|---|
| przed zwarciem | 0,50 | 1,05812 | 50,0000000 | 6,3·10⁻¹¹ | NIEROZRÓŻNIALNA |
| zwarcie (granica prawostronna) | 1,000 | 0,29457 | 46,5160888 | 7,2·10⁻¹² | ROZRÓŻNIALNA |
| w zwarciu | 1,100 | 0,29716 | 49,9980460 | 1,8·10⁻¹² | ROZRÓŻNIALNA |
| zdjęcie + otwarcie | 1,180 | 1,04739 | 72,9606320 | 2,1·10⁻⁸ | ROZRÓŻNIALNA |
| po zdjęciu | 1,200 | 1,05233 | 50,0401355 | 1,4·10⁻¹² | ROZRÓŻNIALNA |
| ponowne załączenie | 2,180 | 1,05773 | 49,9985580 | — | ROZRÓŻNIALNA |
| koniec horyzontu | 10,00 | ≈ wartość sprzed zwarcia | ≈ 50 | — | ROZRÓŻNIALNA |

Stan **NIEROZRÓŻNIALNA przed zwarciem jest poprawnym werdyktem, nie brakiem**: układ jest w
stanie ustalonym, więc odchyłki od 50 Hz nie da się odróżnić od szumu numerycznego.

**Instalacje na szynie przyłączenia:** PV startuje z `p = 0,0275 pu = 2,75 MW`, magazyn z
`p = 0,005 pu = 0,50 MW` — **każdy ze SWOJEJ mocy**, nie z wypadkowej szyny (patrz Z3.3).
W zwarciu PV przechodzi w tryb FRT (`i_czynny ≈ 0`, `i_bierny = 0,0358 pu`,
`odbudowa_zwolnienie_pu = 0,577`), po zdjęciu odbudowuje moc i w `t = 10 s` wraca do
2,75 MW. Stan naładowania magazynu maleje z 0,550000 do 0,549269 — znak bilansu energii
zgodny z rozładowaniem.

**Topologia:** po otwarciu wyłącznika wszystkie sześć kanałów zacisków `wyl-pole` jest
**dokładnie zerem**; po ponownym załączeniu gałąź znów przewodzi. Szyna stacji magistralnej
jest zasilana przez cały bieg (zasilanie przechodzi na drugą stronę pierścienia).

**Determinizm (§9 bramki):** dwa biegi tego samego scenariusza dają **0 różnic** na
39 579 liczbach próbek, komplecie 79 kanałów, śladzie zdarzeń, odciskach tożsamości,
metrykach, śladzie White Box (w tym ślad topologii i kroki szczegółowe) oraz własnościach
biegu. Porównanie NIE ogranicza się do kodu wyjścia.

**Granica prawostronna (§7):** próbka w chwili zdarzenia opisuje układ PO zdarzeniu,
poprzednia — PRZED nim. Częstotliwość w chwili zdarzenia jest wartością `Im(V̇/V)`
wyliczoną z rozwiązania, a nie różnicą próbek: przed zdarzeniem `f = 50,000000 Hz`, w
chwili zdarzenia `f = 46,76 / 73,11 Hz` w zależności od skoku kąta.

**Jakość przy najgłębszym zapadzie (§8):** w biegu z `R_f = 0,2 Ω` napięcie schodzi do
**0,0249 pu**, a największe `u_f,est` w całym biegu wynosi **2,1·10⁻⁹ Hz** — dziewięć rzędów
wielkości poniżej raportowanych odchyłek. Faza jest więc numerycznie wyznaczona i werdykt
ROZRÓŻNIALNA jest uzasadniony; stan NIEDOSTĘPNA nie zapala się nigdzie, bo `|V| > u_V` z
ogromnym zapasem. Żaden próg napięciowy nie bierze w tym udziału.

### Z3.3 Dwa defekty wykryte przez SO-1A i naprawione u źródła

**D-1. Kilku wytwórców na jednej szynie było odmawiane bez podstawy.**
Adapter odmawiał kodem `dynamika.wiele_urzadzen_w_wezle` KAŻDEJ szynie z więcej niż jednym
urządzeniem, z uzasadnieniem „rozpływ podaje moc WYPADKOWĄ szyny, więc podziału nie da się
wyprowadzić bez zgadywania". **Uzasadnienie było fałszywe dla klasy wytwórca+wytwórca** —
`Generator.p_mw`/`q_mvar` są danymi per wytwórca i to z nich assembler zbudował wstrzyk
węzłowy. Pomiar na G17: suma z modelu minus wypadkowa szyny = **dokładnie 0,000e+00 pu**.
Przez tę odmowę **kanoniczny SO-1A był niewykonalny**, bo jego opis wymaga PV i magazynu na
jednej szynie.

Naprawa (klasa, nie instancja): odmowa modelowa zawężona do przypadku, w którym podziału
naprawdę nie da się wyprowadzić — **źródło sieciowe (szyna sztywna, bez zadeklarowanej mocy)
dzielące szynę z innym urządzeniem**. Dla kilku wytwórców adapter przypisuje każdemu jego
moc z modelu i sprawdza uzgodnienie z wypadkową szyny; niezgodność (rozpływ przesunął moc:
przełączenie PV→PQ, ograniczenie Q, bilans szyny bilansującej) kończy się nowym, nazwanym
kodem `dynamika.podzial_mocy_wezla_niespojny`. **Tolerancja nie jest nowym progiem**:
niezgodność mierzy się w prądzie (`|ΔS/V*|`, ta sama wielkość co residuum algebry) i
porównuje z `eps_init` — tą samą liczbą, którą rdzeń rozstrzyga, czy punkt startowy jest
równowagą.

Testy: `TestPodzialMocyWezla` (4 przypadki klasy) + `test_punkt_pracy_dzieli_moc_wezla_miedzy_obie_instalacje`.
**Mutacja M-S1** (każdy wytwórca dostaje wypadkową szyny — dawne zachowanie rozciągnięte na N)
zabija **3 testy**; sam fakt, że bieg się wykonuje, defektu NIE wykrywa.

**D-2. Zwarcie metaliczne kończyło się gołym `ZeroDivisionError`.**
Docstring `konwencje.admitancja_zwarcia_pu` deklarował, że taki przypadek „jest odrzucany
przez wołającego (`zdarzenia.py`)" — **deklaracja bez pokrycia**: wołający nie sprawdzał
niczego. Kontrakt danych (`enm/scenariusze.py::Zwarcie`) przyjmuje `r_f_ohm = x_f_ohm = 0`
(oba pola `ge=0.0`), więc projektant mógł wpisać wartość kończącą bieg wyjątkiem, którego
`execute_run` nie łapie — czyli błędem 500 zamiast komunikatu. Naprawa: nazwana odmowa
`dynamika.zwarcie_metaliczne_bez_admitancji` w `zdarzenia.py`, docstring zgodny z kodem,
dwa testy (odmowa dla zerowej impedancji, skończona admitancja dla niezerowej).

### Z3.4 Czego SO-1A nie dowodzi

* **Zgodności przebiegów z narzędziem zewnętrznym** (wyrocznia H4). To jest fala **W6-F**.
  ZWALIDOWANE FIZYCZNIE = **NIE**, bez zmian wobec Z2.5.
* **Wyznaczenia chwili otwarcia z nastaw zabezpieczenia** — to SO-1B (fale W6-B i W6-C).
  Zaliczenie SO-1A nie zalicza ani jednego wiersza przypisanego do W6-C (zamrożenie §0.2).
* **Pracy wyspowej** (D11, fala W6-B) — układ SO-1A celowo jej nie wywołuje.
* **Metryk scenariusza** (nadir, zenith, ROCOF max, czas ustalenia — wiersz E3, fala W6-D).
  SO-1A dostarcza przebiegi, z których te metryki będą liczone; sam ich nie liczy.

---

## Załącznik Z4 — RUNDA ADVERSARIALNA PO `b31f57c7` (2026-09-18)

**Tryb:** REPRODUKUJ → PRZYCZYNA ŹRÓDŁOWA → MINIMALNA NAPRAWA → FALSYFIKUJ → REGRESJA.
**Werdykt wejściowy recenzenta zewnętrznego:** REJECT CURRENT DELTA.
**Zakres przeglądu:** `865c287f..b31f57c7`. **Zakres tej rundy:** wyłącznie W6-A; W6-B nie ruszone.

### Z4.1 P1-DELTA-40 — reprodukcja PRZED naprawą

Miejsce: `backend/src/network_model/solvers/dynamika/obserwable.py:364` (stan `b31f57c7`).

```python
odchylka_hz = abs(f_hz - f_bazowa_hz)
jakosc = JAKOSC_NIEROZROZNIALNA if niepewnosc_hz > odchylka_hz else JAKOSC_ROZROZNIALNA
```

Predykat kodu: `ROZROZNIALNA ⟺ d_f ≥ u_f`. Kontrakt (§4 tego dokumentu):
`ROZROZNIALNA ⟺ d_f > u_f`. Rozjazd dotyczy DOKŁADNIE równości.

Reprodukcja wykonana przed jakąkolwiek zmianą kodu (4 przypadki, 2 niezgodne):

| przypadek | wejście | `f_hz` | `d_f` | `u_f,est` | kontrakt `d_f > u_f` | kod PRZED | oczekiwane |
|-----------|---------|--------|-------|-----------|----------------------|-----------|------------|
| Q-1 | V=1, V̇=2πj, u_V̇=4π | 51,0 | 1,0 | 2,0 | FAŁSZ | NIEROZRÓŻNIALNA | NIEROZRÓŻNIALNA |
| Q-2a | V=1, V̇=0, u_V=0, u_V̇=0 | 50,0 | 0,0 | 0,0 | **FAŁSZ** | **ROZRÓŻNIALNA** | NIEROZRÓŻNIALNA |
| Q-2b | V=1, V̇=2πj, u_V̇=2π | 51,0 | 1,0 | 1,0 | **FAŁSZ** | **ROZRÓŻNIALNA** | NIEROZRÓŻNIALNA |
| Q-3 | V=1, V̇=2πj, u_V̇=π | 51,0 | 1,0 | 0,5 | PRAWDA | ROZRÓŻNIALNA | ROZRÓŻNIALNA |

Q-2a to stan ustalony każdego biegu: przy zerowej pochodnej fazora etykieta „odchyłka
rozróżnialna numerycznie" twierdziła, że **zero przewyższa zero**. Kanał `jakosc_f@<węzeł>`
idzie do wyniku, więc fałsz nie kończył się na nazwie.

### Z4.2 Naprawa — rozdzielczość WYPROWADZONA, nie przestawiony operator

Mechaniczne `>=` → `>` zamknęłoby DELTA-40 i otworzyło gorszy defekt: dwa biegi różniące się
jednym ULP w `u_f` dostawałyby różne kody jakości tej samej wielkości fizycznej.

Wyprowadzenie (`obserwable.rozdzielczosc_porownania_hz`): `|f − f_n|` powstaje przez
odejmowanie liczb rzędu `f_n`, więc jego błąd bezwzględny jest rzędu `ulp(f_n)`
(**7,105e-15 Hz** dla 50 Hz) **niezależnie** od tego, jak mała jest sama odchyłka; przy `f`
daleko od `f_n` dominuje `ulp(f)`; druga strona porównania wnosi `ulp(u_f)`. Stąd

```
rozdzielczosc_hz = max(ulp(f_n), ulp(f), ulp(u_f))
ROZROZNIALNA ⟺ (d_f − u_f) > rozdzielczosc_hz
```

Kierunek zaokrąglenia rozstrzygnięty na korzyść ostrożności: różnica mieszcząca się w
rozdzielczości daje NIEROZRÓŻNIALNA. Żadnej stałej progowej nie ma i być nie może.

PO naprawie: 4/4 przypadki zgodne z kontraktem. Testy: `test_obserwable.py`
— `test_q123_etykieta_jakosci_idzie_za_ostra_nierownoscia_kontraktu` (3 przypadki),
`test_q4_jeden_ulp_nie_przestawia_etykiety_jakosci` (81 przesunięć ULP w obie strony,
z falsyfikacją: zbiór uzyskanych `u_f` musi mieć >1 element),
`test_q4b_odchylka_ponad_rozdzielczoscia_arytmetyki_jest_rozroznialna` (pasmo jest wąskie —
1e-09 Hz już je opuszcza, >100× rozdzielczości),
`test_rozdzielczosc_porownania_jest_ziarnistoscia_arytmetyki_a_nie_stala` (próg skaluje się
z 50 Hz na 50 kHz). **Korekta testu istniejącego:**
`test_f1_stan_ustalony_daje_dokladnie_czestotliwosc_znamionowa` żądał ROZRÓŻNIALNEJ dla
stanu ustalonego — to była ta sama pomyłka zapisana w teście; intencja (f = f_n co do bitu,
u = 0) bez zmian.

### Z4.3 Semantyka etykiety — sprawdzona u WSZYSTKICH konsumentów

`JAKOSC_ROZROZNIALNA` znaczy **wyłącznie**: „numerycznie wyznaczona odchyłka częstotliwości
od znamionowej przewyższa oszacowany poziom błędu tej obserwabli". NIE znaczy: poprawna
fizycznie · zwalidowana · dokładna pomiarowo · zgodna z NC RfG · zakwalifikowana inżyniersko.

Inwentarz konsumentów (pomiar grepem, nie pamięć): jedynym producentem kanału jest
`silnik.py:646` (deklaracja kanału), `:731` i `:743` (próbkowanie). Poza rdzeniem dynamiki
**żaden** moduł backendu ani frontu nie czyta `jakosc_f@` i nie ma miejsca, w którym
przechodziłby on na PASS / ZWALIDOWANE / ZGODNE. Nazwy `WIARYGODNA` nie ma w repo i nie
wraca (§Z2.1).

### Z4.4 BILANS ENERGII MAGAZYNU — P0 REPRODUKOWALNY, naprawiony u źródła

**Wyrocznia** (niezależna od kodu modelu): energia ogniw `E = SOC · E_n` [kWh]; zdanie
energetyczne kontraktu mówi, że z ogniw ubywa `P_ac/η_roz` przy oddawaniu i przybywa
`|P_ac|·η_ład` przy pobieraniu. Liczba MODELU: `(SOC_k − SOC_p)·E_n` przepuszczona przez cały
stos. Liczba WYROCZNI: kwadratura trapezowa **zarejestrowanego** `p_pu@BESS1` przez to
zdanie. `ε_E = ΔE_model − ΔE_wyroczni`.

Pomiar na `b31f57c7` (magazyn 20 MWh / 25 MW, baza 100 MVA, horyzont 2 s, `dt = dt_wyj = 2 ms`):

| przypadek | ΔE model [kWh] | ΔE wyrocznia [kWh] | ε_E [kWh] | ε względne | werdykt |
|-----------|----------------|--------------------|-----------|------------|---------|
| E-1 rozładowanie P=+0,20 pu | −11,947431302061773 | −11,94743130227001 | 2,08e-10 | 1,7e-11 | OK |
| E-2 ładowanie P=−0,20 pu | +10,555555556290841 | +10,555555555555555 | 7,35e-10 | 7,0e-11 | OK |
| E-3 P=0 | 0,0 | −6,40e-16 | 6,40e-16 | — | OK |
| **E-4 granica SOC min** | **−2,000** | **−14,336917562724011** | **+12,337** | **0,8605** | **P0** |
| **E-5 granica SOC max** | **+2,000** | **+12,666666666666666** | **−10,667** | **−0,8421** | **P0** |
| E-6 zmiana znaku P | −2,9488195456961463 | −2,948883902276891 | 6,44e-05 | 2,2e-05 | patrz niżej |

**Znak, obie sprawności, baza mocy i przelicznik 3600 są POPRAWNE** — E-1/E-2/E-3 zgadzają
się z wyrocznią na poziomie tolerancji algebry (1e-11 na residuum `g`). Historyczny zarzut
„zły znak albo zła baza energii BESS" jest **NIEREPRODUKOWALNY**.

Prompt właścicielski żąda w tym miejscu wskazania commitu, który zarzut zamknął. **Takiego
commitu NIE MA i nie mogło być**: `git log -p --all` po `magazyn.py` pokazuje, że linia
`return -moc_stalopradowa_kw / (pojemnosc_kwh * SEKUND_W_GODZINIE)` oraz rozdzielenie
sprawności na dwa kierunki istnieją **od commitu tworzącego plik** (`e4c32f9e`) i nigdy nie
miały innej postaci (zbiór wariantów tej linii w całej historii ma jeden element). Zarzut
nie został naprawiony — on nigdy nie był prawdziwy w tym repozytorium. Zapisujemy to jako
FAŁSZYWY, a nie jako ZAMKNIĘTY, bo te dwie rzeczy znaczą co innego przy następnym audycie.

Reprodukowalny jest **inny, cięższy defekt tej samej dziedziny**: na granicy zakresu SOC
model oddawał do sieci 24 MW przez 1,7 s **z pustych ogniw**, a bieg kończył się normalnie,
ze statusem poprawnym i kompletem próbek. 86 % bilansu energii przebiegu brane ZNIKĄD.
Symetrycznie przy SOC max: 10,667 kWh pochłonięte przez baterię, która już jest pełna.

**Przyczyna źródłowa — pomylenie dwóch różnych mechanizmów.** `soc_pu` był zadeklarowany w
`granice_stanow`, czyli jako OGRANICZNIK. Ogranicznik jest członem modelu i stan sprowadzony
na granicę CZYTAJĄ pozostałe równania (strumień maszyny czyta `efd_pu`, moc aerodynamiczna
czyta `pitch_rad`, okno mocy czyta `crowbar_pu`). Stanu naładowania **nie czyta nic** —
przekształtnik pracuje tak samo przy SOC 0,55 i przy SOC 0,10 — więc rzutowanie niczego nie
uzgadniało: zamrażało jedną liczbę i zostawiało resztę modelu w biegu.

**Naprawa minimalna** (nie przeprojektowanie): `soc_pu` przeniesiony z `granice_stanow` do
nowej deklaracji `zakresy_waznosci` (`kontrakty.Urzadzenie`), a wyjście poza zakres kończy
bieg odmową `dynamika.zakres_waznosci_przekroczony` z adresem stanu, chwilą, wartością,
granicą i przekroczeniem (`dynamika/waznosc.py`). Okno mocy **nie** zamyka się skokowo —
decyzja zmierzona w `Zasobnik.okno_mocy` zostaje bez zmian. Zdarzenia warunkowe (odcięcie
BMS) pozostają poza zakresem tej rundy zgodnie z §14 promptu.

Margines odmowy jest WYPROWADZONY, nie dobrany: `⌈horyzont_s / dt_min_s⌉ · ulp(granica)` —
największe przesunięcie, które można przypisać samej arytmetyce (nastawy domyślne: 1,4e-14;
najcięższe SO-1A: 1,1e-08). Realne wyjście poza zakres jest o rzędy wielkości większe.

PO naprawie: E-1/E-2/E-3/E-6 bez zmian co do bitu; E-4 → odmowa w `t = 0,280 s`
(przekroczenie 3,58e-07, tj. jeden krok dryfu), E-5 → odmowa w `t = 0,316 s`
(przekroczenie 6,67e-08).

**Przypadek E-6 (zmiana znaku P)** mierzony jest w oknie PO zdjęciu zwarcia, bo próbka w
chwili zdarzenia jest granicą PRAWOSTRONNĄ nieciągłości (Z1 w `test_obserwable`) — krok
kończący się w tej chwili całkuje inną wartość, niż ta próbka pokazuje. To własność semantyki
zdarzeń, nie bilansu. W oknie bez zdarzeń (242 próbki dodatnie, 668 ujemnych — kierunek mocy
zmienia się wielokrotnie) `ε_E` schodzi do poziomu tolerancji algebry.

**Inwentarz klasy** (reguła KLASA, punkt 1): cztery twarde granice stanu w całej bibliotece —
`efd_pu` (wzbudzenie z AVR), `pitch_rad` (kąt łopat), `crowbar_pu` (sygnał dwustanowy),
`soc_pu`. Pierwsze trzy są ogranicznikami rzeczywistymi i ich stan CZYTAJĄ inne równania;
czwarty nie. Klasa ma dokładnie jednego członka z defektem i jest to stwierdzone pomiarem,
przypiętym testem `test_inwentarz_zakresow_waznosci_calej_biblioteki_jest_przypiety`.

### Z4.5 Macierz uzgodnienia otwartych znalezisk

| ID | zarzut pierwotny | kod, którego dotyczy | reprodukcja na HEAD | waga | stan | dowód | blokuje W6-A? | blokuje W6-B? |
|----|------------------|----------------------|---------------------|------|------|-------|---------------|---------------|
| DELTA-40 | równość `d_f = u_f` daje ROZRÓŻNIALNA | `obserwable.py:364` | **TAK** (Z4.1) | P1 | **ZAMKNIĘTE** | Q-1…Q-4 + M1 | nie (już nie) | nie |
| DELTA-39 | `u_f` jako granica, nie estymata | `obserwable.py` | nie — zamknięte w `b31f57c7` | P1 | ZAMKNIĘTE wcześniej | 200 000 perturbacji, 0 naruszeń, max iloraz 0,994619903212 | nie | nie |
| BESS-ENERGIA | zły znak / zła baza energii | `magazyn.py` | **NIE** (E-1/E-2/E-3 zgodne z wyrocznią) | — | **FAŁSZYWY** | Z4.4 tabela | nie | nie |
| BESS-GRANICA | (nowy, wykryty w tej rundzie) energia znikąd na granicy SOC | `magazyn.py` + `calkowanie.py` | **TAK**, 86 % bilansu | **P0** | **ZAMKNIĘTE** | Z4.4 + M5 + test odmowy | było TAK | nie |
| NaN/Inf | wartość niearytmetyczna w wyniku | `skonczonosc.py`, `obserwable.py` | nie | — | ZAMKNIĘTE + wzmocnione | Z4.6 + M7 | nie | nie |
| REINIT/HISTORIA | historia całkowania sprzed nieciągłości | `calkowanie.py` | nie (obie metody JEDNOKROKOWE) | — | ZAMKNIĘTE | Z4.7 | nie | nie |
| BAZY DER/BESS | mieszanie baz mocy | `magazyn.py`, `konwencje.py` | nie | — | ZAMKNIĘTE + wzmocnione | Z4.8 + M6 | nie | nie |
| TOŻSAMOŚĆ ZDARZEŃ | brak deterministycznej kolejności | `zdarzenia.py` | nie | — | ZAMKNIĘTE | Z4.9 + M8 | nie | nie |
| Z-03 | gałąź otwarta w ENM nieosiągalna dla zdarzeń | `adapter_dynamiki.py:759` | TAK, ale **odmowa nazwana** | P1 | **OPEN — POPRAWNIE ODROCZONE DO W6-B** | Z4.10 | nie | **TAK** |
| F-7 | brak wyroczni zewnętrznej dla `f` | — | n/d | P1 | **OPEN — dług W6-F** | Z2.5 bez zmian | nie | nie |
| SO-1A | kryterium odbioru niewykonane | — | n/d | — | ZAMKNIĘTE w Z3 | Z3 + Z4.11 | nie | nie |
| WALIDACJA FIZYCZNA | ZWALIDOWANE FIZYCZNIE = TAK bez wyroczni | — | n/d | — | **ZWALIDOWANE FIZYCZNIE = NIE** | Z2.5, Z3.4 | nie | nie |
| NC RfG | zgodność normatywna mylona z symulacją | — | n/d | — | rozdzielone: SYMULACJA ≠ WALIDACJA ≠ ZGODNOŚĆ | Z4.10 | nie | nie |

### Z4.6 NaN/Inf — FAIL CLOSED, dowód NA ŚCIEŻCE BIEGU

Straże istniały (`skonczonosc.sprawdz_wektor` przy pochodnych, `sprawdz_napiecia` po algebrze
i po każdym przyjętym kroku, `czestotliwosc_niedostepna` przy `|V| ≤ u_V` i przy osobliwym
jakobianie). **Luka dowodu:** testy wołały funkcję straży wprost, więc usunięcie jej WYWOŁANIA
z `pochodne_ukladu` zostawiłoby je zielone. Domknięte dwoma testami:

* `test_silnik.py::test_NaN_w_pochodnej_konczy_bieg_odmowa_z_adresem_zamiast_wejsc_do_wyniku`
  — atrapa urządzenia skażająca jedną składową pochodnej; żądana odmowa
  `dynamika.wartosc_nieskonczona` z adresem `G1.omega_pu`, indeksem 1;
* `test_silnik.py::test_zaden_kanal_wyniku_nie_wpuszcza_NaN_ani_Inf_jako_wartosci_inzynierskiej`
  — CAŁY ResultSet biegu ze zwarciem i skokiem obciążenia, wszystkie kanały.

Niedostępna częstotliwość NIE jest podstawiana zerem ani `f_n` bez semantyki: wraca z
`niepewnosc = f_n` (cała znamionowa) i kodem `JAKOSC_NIEDOSTEPNA`, więc konsument ignorujący
kod i tak widzi, że liczba nie niesie treści.

### Z4.7 Re-inicjalizacja i historia całkowania

Semantyka ZDARZENIE → TOPOLOGIA → RE-INICJALIZACJA ALGEBRY → DALEJ jest poprawna **tylko**
przy metodzie jednokrokowej: metoda wielokrokowa (Adams, BDF) czyta `f` z poprzednich kroków
i pierwsze kroki po zdarzeniu całkowałyby częściowo model sprzed niego. Rejestr `INTEGRATORY`
ma dziś dwie metody jednokrokowe i to jest własność, na której stoi semantyka zdarzeń.
Przypięte: `test_calkowanie.py::test_krok_nie_pamieta_niczego_sprzed_swojego_wejscia`
(ten sam krok dwa razy, rozdzielony krokiem z innego stanu i innym `dt`, wynik co do bitu
identyczny — dla obu integratorów) oraz
`test_rejestr_integratorow_zawiera_wylacznie_metody_jednokrokowe`.

Ciągłość stanów różniczkowych przez zdarzenie, ponowne rozwiązanie algebry i niezależny pomiar
skoku `Δy` były już przypięte w `test_reinicjalizacja.py` (8 testów, w tym mutacja migawki
zabijająca diagnostykę).

### Z4.8 Bazy DER/BESS

Rdzeń dynamiki jest modelem WZGLĘDNYM: przejście `I_pu ↔ I_A` w nim nie występuje (pomiar:
zero wystąpień jednostek amperowych w `solvers/dynamika/**`), prądy opuszczają rdzeń w pu.
Bazy w grze: `S_b` układu (100 MVA), `S_n` przekształtnika, granice mocy zasobnika w kW
bezwzględnych, pojemność w kWh przy BEZWYMIAROWYM SOC (baza energii = sama pojemność).
Przeliczniki mają jedno źródło (`konwencje.py`) z jawnie nazwaną parą kierunków
(impedancja w jedną stronę, moc i H w drugą).

Dziurą w dowodzie było to, że baza maszyny i ogranicznik przekształtnika miały testy
niezmienniczości, a **zasobnik nie miał żadnego**. Domknięte trzema testami
(`test_biblioteka_urzadzen.py`): jawna arytmetyka wszystkich przejść
(`rezerwa = 0,1·30/100 = 0,03`, `ładowanie = 25000/1000/100 − 0,03 = 0,22`), ta sama rezerwa
fizyczna w dwóch bazach przekształtnika dająca to samo okno, oraz `dSOC/dt` zależne od mocy
FIZYCZNEJ, nie od liczby względnej (10 MW to 10 MW w bazie 100 i w bazie 50 MVA).
Mutacja M6 (baza przekształtnika zamiast bazy układu) jest przez nie zabijana.

### Z4.9 Tożsamość i kolejność zdarzeń

Bez zmian w tej rundzie — kontrakt publiczny nietknięty. Stan przypięty wcześniej:
kolejność kanoniczna stabilna po czasie, zdarzenia równoczesne dzielą jeden pomiar chwili,
permutacja zdarzeń równoczesnych nie zmienia wyniku, zdarzenie wykonuje się niezależnie od
reprezentacji chwili, brak cichego pominięcia (`AssertionError` przy niewykonanych wpisach).
Mutacja M8 (zdjęcie sortowania) zabijana przez `test_kolejnosc_kanoniczna_jest_stabilna_po_czasie`.

### Z4.10 Z-03, F-7, NC RfG

**Z-03** — gałąź z `in_service = False` jest pomijana przy budowie modelu
(`adapter_dynamiki.py:759`), więc `zalaczenie_galezi` na niej kończy się odmową
`dynamika.zdarzenie_bez_elementu`. To NIE jest bieżąca niespójność kontraktu: zdolności nie
ma i jej brak jest **meldowany odmową nazwaną**, a nie cichym pominięciem. Klasyfikacja:
**OPEN — POPRAWNIE ODROCZONE DO W6-B** (wymaga modelu stanu łączeniowego w rdzeniu, nie łatki).
W tej rundzie nienaprawiane zgodnie z §12 promptu.

**F-7** — bez zmian wobec Z2.5: wyrocznia zewnętrzna dla `f_hz@szyna` nie istnieje, ANDES w CI
porównuje inną wielkość fizyczną i dowodem F-7 nie jest. Dług fali **W6-F**.

**Rozdzielenie trzech rzeczy, których nie wolno mylić:** SYMULACJA (bieg się policzył,
residua w normie) ≠ WALIDACJA FIZYCZNA (zgodność z niezależną wyrocznią — **NIE**, F-7) ≠
ZGODNOŚĆ NORMATYWNA (NC RfG / PTPiREE — osobna domena, nie wynika z żadnego z poprzednich).

### Z4.11 Macierz mutacyjna M1–M8 — WYKONANA

Każda iniekcja nałożona na drzewo roboczne, testy uruchomione, plik przywrócony. Zarzut
recenzenta („16 KILLED nie zostało niezależnie powtórzone") dotyczył Z.5 i jest tu domknięty
przebiegiem, nie cytatem.

| # | iniekcja | plik | test, który spadł | kod wyjścia |
|---|----------|------|-------------------|-------------|
| M1 | równość `d_f = u_f` znów ROZRÓŻNIALNA | `obserwable.py` | `test_f1_stan_ustalony_daje_dokladnie_czestotliwosc_znamionowa` | 1 ZABITA |
| M2 | znak mocy elektrycznej w równaniu ruchu | `maszyna_klasyczna.py` | `test_cct_z_bisekcji_zgadza_sie_z_kryterium_rownych_pol` | 1 ZABITA |
| M3 | `S = V·I` zamiast `V·conj(I)` | `obserwable.py` | `test_b1_galaz_bezstratna_ma_zerowy_bilans_mocy_i_przeciwne_prady` | 1 ZABITA |
| M4 | przekładnia po złej stronie gałęzi w Ybus | `siec.py` | `test_ybus_z_przekladnia_zespolona` | 1 ZABITA |
| M5 | znak mocy magazynu w prawie energii | `magazyn.py` | `test_magazyn_wychodzacy_poza_zakres_naladowania_konczy_bieg_odmowa` | 1 ZABITA |
| M6 | baza mocy magazynu: przekształtnik zamiast układu | `magazyn.py` | `test_bazy_magazynu_sa_rozdzielone_i_policzalne_z_kontraktu` | 1 ZABITA |
| M7 | strażnik skończoności zdjęty ze ścieżki pochodnych | `calkowanie.py` | `test_NaN_w_pochodnej_konczy_bieg_odmowa_z_adresem…` | 1 ZABITA |
| M8 | kolejność kanoniczna zdarzeń zdjęta | `zdarzenia.py` | `test_kolejnosc_kanoniczna_jest_stabilna_po_czasie` | 1 ZABITA |

**ZABITYCH: 8 / 8.**
