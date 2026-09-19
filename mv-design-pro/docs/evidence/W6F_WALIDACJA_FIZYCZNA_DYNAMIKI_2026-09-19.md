# W6-F — NIEZALEŻNA WALIDACJA FIZYCZNA SYMULACJI DYNAMICZNEJ

> **Status dokumentu:** raport fazy DIAGNOSTYCZNEJ (mandat właściciela 2026-09-19, §0–§43).
> Faza naprawcza NIE została rozpoczęta (§43). Żaden plik produkcyjny nie został trwale
> zmieniony w tej rundzie; żaden golden nie został zregenerowany (§25).
>
> **Pytanie rundy:** czy silnik dynamiki odtwarza poprawną FIZYKĘ — a nie tylko wynik
> powtarzalny, zbieżny numerycznie i zgodny z innym programem.

---

## A. BASELINE (§1)

| Pozycja | Wartość |
|---|---|
| HEAD | `ad4629ae424d94954acb12daba0d617b70041fca` |
| Data HEAD | 2026-09-19 13:04:25 +0000 |
| Gałąź | `claude/mv-design-pro-twin-audit-u4lhy0` |
| Katalog pracy | worktree `.claude/worktrees/fable-f6` |
| `git status --short` (worktree) | **0 wpisów — drzewo czyste** (stan sprawdzony przed startem, po mutacjach i przed raportem) |

**Mandat ostrzegał, żeby nie zakładać HEAD = `a8d5451e`. Słusznie: HEAD to `ad4629ae`**
(commit rundy 7 — bramka determinizmu międzyprocesowego). Cała praca W6-F odbyła się
na `ad4629ae` bez merge, bez rebase, bez regeneracji goldenów i bez zmian solvera.

### A.1 Znalezisko uboczne (NIE naprawione — §1 zakazuje operacji na repo w fazie diagnostycznej)

Główny checkout `/home/user/MV-Design-PRO` (ten sam HEAD `ad4629ae`) ma **23 pliki w stanie
„M " (staged)**, a `git diff HEAD --stat` pokazuje **46 wstawień i 2211 usunięć**. `git diff`
(drzewo vs indeks) jest PUSTE — czyli indeks i pliki robocze są zgodne ze sobą, ale OBA są
starsze niż HEAD. To nie jest artefakt daty indeksu: to faktyczne cofnięcie 23 plików
(m.in. `docs/plan/W6_A_KONTRAKT_OBSERWABLI.md` — 779 linii, `FINAL_DYNAMICS_CAPABILITY_FREEZE.md`).
Commit w tym checkoucie skasowałby te pliki.

Klasyfikacja: **P2-CHECKOUT**, porządkowe. Nie dotknięte — to checkout innej sesji, a §1
tej rundy zakazuje operacji na repo przed zakończeniem diagnostyki. Worktree `fable-f6`,
w którym wykonano całą pracę, jest czysty i zgodny z HEAD.

---

## B. WERDYKT WYKONAWCZY (§37, §38)

**W6-F = ZWALIDOWANE FIZYCZNIE W ZADEKLAROWANEJ DZIEDZINIE (sekcja C), Z DWOMA
OGRANICZENIAMI DZIEDZINY (OD-11, OD-12) I JEDNĄ LUKĄ ZDOLNOŚCI (skok mocy mechanicznej).**

Rozstrzygnięcie hipotez §2:

* **H0 (solver jest spójny numerycznie i deterministyczny, ale fizycznie nieudowodniony)
  — ODRZUCONA** dla dziedziny z sekcji C. Podstawa: zgodność z ROZWIĄZANIAMI ANALITYCZNYMI
  (nie z goldenami, nie z ANDES): mod elektromechaniczny, całka pierwsza energii, skalowanie
  bezwładności, kryterium równych pól, ROCOF trzema niezależnymi drogami — sekcje E, F, H, I, K.
* **H1 (model odtwarza fizykę w zadeklarowanej dziedzinie) — PRZYJĘTA** na poziomie
  dowodowym **L5** dla rdzenia elektromechanicznego (definicja poziomów: §28, tabela w sekcji Q).

Czego ten werdykt NIE obejmuje — jawnie:

1. **Poza dziedziną zwalidowaną** są sieci, w których granice mocy biernej węzłów PV wiążą
   na iteracjach przejściowych rozpływu (OD-11) — punkt pracy dynamiki pochodzi z rozpływu,
   więc błąd rozpływu jest błędem warunku początkowego (sekcja O).
2. **Liczby biegu czasowego dziedziczą status ZAŁOŻENIA** po mocy zwarciowej źródła
   sieciowego, jeżeli ta moc jest założona, a nie dana (OD-12) — bo z niej liczona jest
   impedancja szyny sztywnej (sekcja O).
3. **Skok mocy mechanicznej nie istnieje jako zdarzenie produktu** — przypadek §12 poz. B
   jest NIEPOROWNYWALNY z braku zdolności produktu, nie z braku odpowiednika w wyroczni
   (sekcja N).
4. Werdykt dotyczy **modelu klasycznego maszyny + szyny sztywnej + gałęzi o stałej
   admitancji + odbioru o stałej mocy**. Regulatory, modele wyższego rzędu, przekształtniki
   i dynamika trójfazowa niesymetryczna NIE były przedmiotem tej rundy.

---

## C. DZIEDZINA ZWALIDOWANA (§2, §29)

Walidacja dotyczy układu i zakresów, które faktycznie zmierzono — nie „dynamiki w ogóle".

| Wymiar | Dziedzina zwalidowana | Dowód |
|---|---|---|
| Model maszyny | klasyczny 2. rzędu (E′ za X′d), stany (δ, ω, P_m, \|E′\|) | D, E, F |
| Warunek brzegowy | szyna sztywna = SEM za skończoną impedancją (Z ≠ 0 wymagane) | D, I.3 |
| Sieć | gałęzie o stałej admitancji; odbiór o stałej mocy | D, G |
| Bezwładność H | 0,05 – 14 s (w tym granica „bardzo mała bezwładność") | I.2, I.3, K |
| Tłumienie D | −2 … 200 p.u. (podkrytyczne, zerowe, ujemne, nadkrytyczne) | F, I.2, I.3 |
| Reaktancja zewnętrzna X_T | 0,33 – 1,55 p.u. | I.2, I.3 |
| Zaburzenie | skok mocy 1e−8 … 6,1e−1 p.u. (siedem rzędów); zwarcie o impedancji 2,22 … 0,02 p.u. | I.2, I.3, K |
| Kąt δ | od punktu pracy do kąta niestabilnej równowagi (kryterium równych pól) | F.3 |
| Krok całkowania | 1,25e−4 … 4e−3 s (rząd zbieżności potwierdzony empirycznie) | E, H |
| Zdarzenia | zwarcie węzłowe (założenie i zdjęcie), zmiana gałęzi, skok odbioru | G, J |

**Poza dziedziną (jawnie):** skok mocy mechanicznej (brak zdolności produktu), regulacja
napięcia/prędkości, modele wyższego rzędu, przekształtniki, stany niesymetryczne,
sieci z wiążącymi granicami Q na iteracjach przejściowych rozpływu (OD-11).

---
## D. INWENTARZ RÓWNAŃ ODTWORZONY Z KODU (§3, §4, §19)

Równania spisane z kodu, nie z dokumentacji. Ścieżka bazowa:
`backend/src/network_model/solvers/dynamika/`.

### D.1 Wektor stanu, algebra, wejścia

| Symbol | Znaczenie | Jednostka | Miejsce w kodzie |
|---|---|---|---|
| `x` | stany urządzeń, sklejone w kolejności urządzeń | — | `siec.py`, `silnik.py` |
| δ | kąt wirnika od osi odniesienia sieci | rad | `maszyna_klasyczna.py:63` (`INDEKS_DELTA`) |
| ω | prędkość wirnika | p.u. (1,0 = synchroniczna) | `maszyna_klasyczna.py:64` |
| P_m | moc mechaniczna (STAN o zerowej pochodnej) | p.u. bazy układu | `maszyna_klasyczna.py:65` |
| \|E′\| | moduł SEM przejściowej (STAN o zerowej pochodnej) | p.u. | `maszyna_klasyczna.py:66` |
| E_re, E_im | SEM szyny sztywnej (STANY o zerowych pochodnych) | p.u. | `szyna_sztywna.py:38-39` |
| `y` | napięcia węzłowe w postaci rzeczywistej `[Re V; Im V]` | p.u. | `siec.py::residuum_algebry` |

**Równanie różniczkowe (maszyna klasyczna), `maszyna_klasyczna.py:133-149`:**

```
dδ/dt = ω_bazowa_rad_s · (ω − 1)
dω/dt = [ P_m − P_e − D·(ω − 1) ] / (2H)
dP_m/dt = 0 ,  d|E′|/dt = 0
```

Współczynniki odczytane z kodu, nie założone:
* mnożnik w pierwszym równaniu to POLE `omega_bazowa_rad_s` (`:83`), ustawiane wyłącznie
  przez `pulsacja_bazowa_rad_s(f) = 2π·f` (`konwencje.py:36-38`). Dla f = 50 Hz daje
  ω₀ = 314,159265… rad/s. **Nie ma w pakiecie drugiego miejsca, które produkowałoby ω₀.**
* mianownik drugiego równania to `2.0 * self.h_s` (`:144`) — postać MOCOWA równania ruchu
  (nie momentowa), H w sekundach.
* człon tłumienia to `- self.d_pu * odchylka_predkosci` (`:142`), czyli D·Δω w p.u.
  (tłumienie proporcjonalne do odchyłki prędkości, nie do pochodnej kąta).

**Równanie algebraiczne, `siec.py::residuum_algebry`:**

```
0 = g(x, y) = Y·V − I(x, V)      (część rzeczywista i urojona sklejone)
```

**Moc elektryczna, `maszyna_klasyczna.py:127-131`:** `P_e = Re( E · conj(I) )`, gdzie
`I = (E − V)·y_wew`, `y_wew = 1/(R_a + jX′d)`. To moc SZCZELINY POWIETRZNEJ (zawiera
straty `R_a·|I|²`), a nie moc zacisków — dla R_a = 0 obie są równe i taki jest układ
odniesienia W6-F.

**Warunek początkowy, `maszyna_klasyczna.py:113-125`:** `I = conj(S)/conj(V)`,
`E = V + (R_a + jX′d)·I`, `δ = arg(E)`, `ω = 1`, `P_m = Re(E·conj(I))`, `|E′| = |E|`.
Wyprowadzenie z punktu pracy, nie z wartości znamionowych ani płaskiego startu.

### D.2 Audyt wymiarowy (§4) — zamknięty inwentarz przeliczeń

Przeszukanie całego pakietu (`grep` po `math.pi`, `degrees`) daje **pięć** miejsc, w których
zmienia się jednostka kąta lub częstotliwości. Wszystkie pięć jest poprawne:

| # | Miejsce | Przeliczenie | Kierunek |
|---|---|---|---|
| 1 | `konwencje.py:38` | ω₀ = 2π·f_b | Hz → rad/s — JEDYNY producent ω₀ |
| 2 | `konwencje.py:33` | ćwierć obrotu π/2 (oś q względem fazora) | stała układu dq |
| 3 | `obserwable.py:381` | f = f_b + θ̇/(2π) | rad/s → Hz |
| 4 | `obserwable.py:386` | niepewność f, też /(2π) | rad/s → Hz |
| 5 | `walidacja/malosygnalowa.py:95` | f_modu = \|Im λ\|/(2π) | rad/s → Hz |

Jedyna konwersja na stopnie: `silnik.py:702` (`kat_deg@` — kanał prezentacyjny).
**Nie znaleziono ANI JEDNEGO miejsca mieszającego Hz z rad/s ani stopnie z radianami
w torze fizyki.** Δω, Δf i ROCOF wiąże jedna relacja: `f = f_b·ω` ⇒ `Δf = f_b·Δω` ⇒
`df/dt = f_b·dω/dt` (sprawdzona pomiarem — sekcja K).

**Przeliczenia baz (§4)** — dwie funkcje o PRZECIWNYCH kierunkach, jedno źródło prawdy:

| Wielkość | Wzór | Miejsce |
|---|---|---|
| impedancja / reaktancja | `z_układ = z_urz · (S_układ / S_urz)` | `konwencje.py:52-69` |
| stała bezwładności H | `H_układ = H_urz · (S_urz / S_układ)` | `konwencje.py:72-87` |
| moce i granice mocy | ten sam kierunek co H (delegacja) | `konwencje.py:90-102` |

Kierunki są przeciwne i **to jest poprawne**: H jest energią kinetyczną odniesioną do mocy
bazowej, impedancja jest odwrotnie proporcjonalna do mocy bazowej. Obie funkcje odrzucają
bazy niedodatnie. Jedyne miejsce wywołania przy budowie maszyny: `maszyna_klasyczna.py:224-249`;
przy budowie szyny sztywnej: `szyna_sztywna.py:118-138`.

**Baza impedancji węzła:** `Z_b = U_n²/S_b` liczona przez `network_model/pochodne`
(`impedancja_z_napiecia_i_mocy_ohm`) — ta sama funkcja, co w rozpływie i zwarciach; rdzeń
dynamiki nie ma własnej kopii (`konwencje.py:117-139`). Dla U_n = 15 kV, S_b = 100 MVA:
Z_b = 2,25 Ω.

### D.3 Zdarzenia i topologia

| Zdarzenie | Klasa kontraktu | Działanie fizyczne |
|---|---|---|
| zwarcie węzłowe | `kontrakty.py:215` `ZwarcieWezla` | dodanie bocznika `y_f = 1/(R_f + jX_f)` do Y-bus |
| zmiana gałęzi | `kontrakty.py:234` `ZmianaGalezi` | załączenie/wyłączenie gałęzi |
| odłączenie źródła | `kontrakty.py:243` `OdlaczenieZrodla` | usunięcie urządzenia |
| skok odbioru | `kontrakty.py:251` `SkokObciazenia` | zmiana P/Q odbioru o stałej mocy |

**Brak zdarzenia „skok mocy mechanicznej"** — to jest fakt o zdolności produktu, ustalony
z zamkniętej listy `kontrakty.py`, nie domysł.

Zwarcie metaliczne (R_f = X_f = 0) nie ma skończonej admitancji — `konwencje.py:134-138`
podnosi `ZeroDivisionError`, a wołający odrzuca je nazwaną odmową (sekcja M, przypadek L10).

### D.4 Całkowanie

`calkowanie.py` — trapez NIEJAWNY na UKŁADZIE SPRZĘŻONYM (x, y):

```
R_x = x₁ − x₀ − (dt/2)·[ f(x₀,y₀) + f(x₁,y₁) ]
R_y = g(x₁, y₁)
```

Rząd metody p = 2 (`calkowanie.py:387-388`). Newton z globalizacją Armijo
(`siec.py`, `WSPOLCZYNNIK_ARMIJO = 1.0e-4`). Estymata błędu lokalnego przez podwojenie
kroku, dzielona przez 2^p − 1.

**Chwile zdarzeń są PUNKTAMI OBOWIĄZKOWYMI siatki** (`silnik.py:542-557`,
`_punkt_obowiazkowy`) — zdarzenie nigdy nie „wpada między kroki" (dowód pomiarowy: sekcja L).

---
## E. SPÓJNOŚĆ STANU USTALONEGO (§5, §30)

Skrypt: `e05_stan_ustalony.py`. Tolerancje ustalone A PRIORI (§30) z arytmetyki
podwójnej precyzji, a nie po obejrzeniu wyniku: residuum na poziomie epsilonu maszynowego
razy wielkość członów (~1e−16), dryf bez zakłócenia = 0 dokładnie (bo pochodne w punkcie
równowagi są zerami maszynowymi, więc trapez nie ma czego dodać).

### E.1 Punkt pracy — produkt vs wyrocznia niezależna

| Wielkość | Produkt | Wyrocznia niezależna | Różnica |
|---|---|---|---|
| δ₀ [rad] | 0,43080107103566123 | 0,43080107103566123 | **0 (bit w bit)** |
| ω₀ [p.u.] | 1,0 | 1,0 | 0 |
| P_m [p.u.] | 0,8 | 0,8 | **0 (bit w bit)** |
| \|E′\| [p.u.] | 1,1494285497688852 | 1,1494285497688852 | **0 (bit w bit)** |
| E_sys [p.u.] | 0,9962994162926585 − j0,04 | 0,9962994162926585 − j0,04 | **0 (bit w bit)** |

Wyrocznia liczy punkt pracy WŁASNĄ algebrą (rozkład 2×2 macierzy zespolonej), produkt —
swoją. Zgodność bit w bit oznacza, że obie drogi realizują tę samą definicję, a nie że
jedna kopiuje drugą (wyrocznia nie importuje ani jednej linii produktu — §14).

### E.2 Residua w punkcie pracy

```
max |f(x₀, y₀)| = 3,172065784643304e−17      (równania różniczkowe)
max |g(x₀, y₀)| = 8,881784197001252e−16      (równania algebraiczne)
```

f ≠ 0 tylko na JEDNEJ współrzędnej (dω/dt) i tylko na poziomie 3,2e−17 — to zaokrąglenie
odejmowania P_m − P_e, nie niedomknięcie modelu.

### E.3 Dryf bez zakłócenia — drabina kroku (§5)

Horyzont 20 s, brak zdarzeń. Dla KAŻDEGO kroku, dla KAŻDEGO kanału:

| dt [s] | max\|δ−δ₀\| | max\|ω−1\| | max\|U−U₀\| | max\|P−P₀\| | max\|Q−Q₀\| | max res f | max res g |
|---|---|---|---|---|---|---|---|
| 4,0e−3 | **0,0** | **0,0** | **0,0** | **0,0** | **0,0** | 1,27e−19 | 8,88e−16 |
| 2,0e−3 | **0,0** | **0,0** | **0,0** | **0,0** | **0,0** | 6,34e−20 | 8,88e−16 |
| 1,0e−3 | **0,0** | **0,0** | **0,0** | **0,0** | **0,0** | 3,17e−20 | 8,88e−16 |
| 5,0e−4 | **0,0** | **0,0** | **0,0** | **0,0** | **0,0** | 1,59e−20 | 8,88e−16 |

**WERDYKT E: SPEŁNIONE.** Punkt pracy spełnia f = 0 i g = 0 z dokładnością maszynową,
a bieg bez zakłócenia nie rusza się ani o jeden bit przez 20 s przy czterech krokach.
Residuum f maleje LINIOWO z krokiem (1,27e−19 → 6,34e−20 → 3,17e−20 → 1,59e−20), bo jest
to residuum przemnożone przez dt/2 — czyli zachowuje się dokładnie tak, jak przewiduje
wzór trapezu, a nie „jakoś".

---
## F. BENCHMARKI ANALITYCZNE (§6, §7, §11, §18)

Benchmark analityczny jest mocniejszy od wyroczni programowej: porównuje wynik z
ROZWIĄZANIEM ZADANIA, a nie z innym przybliżeniem. **Parametry benchmarków pochodzą
z modelu, nie są dopasowywane do solvera** (§6).

### F.1 Mod elektromechaniczny — linearyzacja równania ruchu (§6, §11)

Linearyzacja równania ruchu wokół punktu pracy:

```
Δδ̈ + (D/2H)·Δδ̇ + (ω₀·K_s/2H)·Δδ = 0
ω_n = √(ω₀·K_s / 2H) ,   ζ = D/(4H·ω_n) ,   σ = ζ·ω_n = D/(4H)
K_s = dP_e/dδ = |E′|·|E_s|·cos(δ₀ − δ_s) / X_T ,   X_T = X′d + X_L + X_s
```

Pobudzenie: PŁYTKIE (X_f = 5 Ω = 2,222 p.u.) i KRÓTKIE (20 ms) zwarcie zdjęte w 0,52 s.
Układ po zdjęciu jest identyczny z przedzwarciowym, więc maszyna wykonuje DRGANIA
SWOBODNE wokół tego samego położenia równowagi — czyli dokładnie przypadek, dla którego
obowiązuje linearyzacja. Amplituda (5,5e−03…5,8e−03 rad) wynika z płytkości zwarcia,
a nie z dopasowania.

Skrypt: `e06_malosygnalowa.py`, dt = 2e−4 s, horyzont 12 s (≈16 okresów).

| D [p.u.] | K_s [p.u./rad] | T analityczny [s] | T zmierzony [s] | błąd okresu | σ analityczna = D/(4H) [1/s] | σ zmierzona [1/s] | błąd σ |
|---|---|---|---|---|---|---|---|
| 0 | 1,571296 | 0,748212597 | 0,748198878 | **1,83e−05** | 0,000000000 | −0,000000002 | — |
| 2 | 1,571296 | 0,748320886 | 0,748312408 | **1,13e−05** | 0,142857143 | 0,142860534 | **2,37e−05** |
| 4 | 1,571296 | 0,748646034 | 0,748638917 | **9,51e−06** | 0,285714286 | 0,285717914 | **1,27e−05** |

Liczba przejść przez równowagę: 30, liczba pików: 31 w każdym przypadku — okres mierzony
z 15 pełnych cykli, nie z jednego.

**Trzy niezależne sprawdziany w tej tabeli:**
1. **Częstotliwość modu** zgadza się z `√(ω₀K_s/2H)/2π` do 1e−05 względnie — to jest
   sprawdzian ω₀, H, K_s i całej algebry sieci ŁĄCZNIE. Błąd w którejkolwiek z tych
   wielkości przesunąłby okres o rzędy wielkości (patrz sekcja L: mutacje M1, M3, M5, M8).
2. **Tłumienie** zgadza się z `D/(4H)` do 1,3e−05…2,4e−05 — sprawdzian członu D
   i ponownie mianownika 2H.
3. **σ dla D = 0 wynosi −2e−09 1/s**, czyli zero z dokładnością pomiaru: integrator NIE
   wprowadza sztucznego tłumienia ani sztucznego wzmocnienia (to jest własność trapezu
   jako metody A-stabilnej i nietłumiącej — potwierdzona, nie założona).

Residuum algebry w tych biegach: max ≈ 9,1e−12 (tolerancja Newtona).

### F.2 Całka pierwsza energii (§7)

Funkcja energii dla maszyny klasycznej przy D = 0 jest CAŁKĄ PIERWSZĄ równania ruchu:

```
V = H·(ω − 1)² − (1/ω₀)·[ P_m·δ + P_max·cos(δ − δ_s) ]      dV/dt = 0  (D = 0)
                                                             dV/dt ≤ 0  (D > 0)
```

Skrypt: `e07_16_17.py`. Energia liczona PO ZDJĘCIU zwarcia (od t_c), gdzie układ jest
zachowawczy.

| Wariant | dt [s] | max\|E − E(t_c)\| | dryf względem zakresu E_kin | max DODATNI przyrost E |
|---|---|---|---|---|
| D = 0 | 1,0e−3 | 1,997e−10 | 1,44e−06 | 6,16e−11 |
| D = 4 | 5,0e−4 | 1,241e−04 | — | **0,0 (dokładnie)** |

* **D = 0:** energia zachowana do 2,0e−10 przez cały przebieg; maksymalny DODATNI
  przyrost 6,2e−11 — czyli układ nie „produkuje" energii.
* **D = 4:** `max DODATNI przyrost energii = 0,0 DOKŁADNIE`, a E_końcowe − E(t_c) =
  −1,241e−04 < 0. Energia maleje MONOTONICZNIE, ani razu nie rośnie — druga zasada
  dla układu z tłumieniem jest spełniona nie „średnio", tylko w każdej próbce.

Dryf całki pierwszej maleje z kwadratem kroku (pomiar przypięty testem produktu:
`test_calka_pierwsza_jest_zachowana_i_dryf_maleje_jak_kwadrat_kroku`, iloraz w oknie
3,6…4,4 dla p = 2).

---
### F.3 Kryterium równych pól i krytyczny czas wyłączenia (§18)

Dla maszyny klasycznej BEZ tłumienia w układzie bezstratnym kryterium równych pól jest
DOKŁADNE, nie przybliżone: maszyna zachowuje synchronizm dokładnie wtedy, gdy kąt nie
przekroczy kąta niestabilnej równowagi δ_u. Dlatego §18 jest tu policzalny, a nie „N/A".

```
δ_u : P_e^post(δ_u) = P_m  na gałęzi OPADAJĄCEJ
A1(δ_c) = ∫[δ₀→δ_c] (P_m − P_e^zwarcie) dδ        pole PRZYSPIESZAJĄCE
A2(δ_c) = ∫[δ_c→δ_u] (P_e^post − P_m) dδ          pole HAMUJĄCE
δ_c : A1(δ_c) = A2(δ_c)  ⇒  CCT = czas, w którym trajektoria zwarciowa osiąga δ_c
```

Skrypt: `e18_cct.py`. Pola liczone KWADRATURĄ na RZECZYWISTYCH krzywych P_e(δ) wyroczni
niezależnej (nie na postaci zamkniętej — bocznik zwarcia zmienia układ), całkowanie
trajektorii zwarciowej: DOP853 z rtol 1e−13 i detekcją zdarzenia na δ_c.
Kryterium stabilności w bisekcji solvera: `max δ ≤ δ_u` — bez zapasów dobieranych „na oko".

X_f = 0,15 p.u., zwarcie od t = 0,2 s.

| Wielkość | Wartość |
|---|---|
| P_m | 0,8 p.u. |
| P_max przed/po zwarciu | 1,763227045996474 p.u. |
| P_max w zwarciu | 0,8489611702945986 p.u. |
| δ₀ | 0,43080107103566123 rad = 24,683° |
| δ_u (niestabilna równowaga) | 2,6305375384332312 rad = 150,719° |
| δ_c (z równości pól) | 2,201101609535463 rad = 126,114° |
| A1(δ_c) | 0,13221012388530398 |
| A2(δ_c) | 0,13221012388530373 |
| **reszta pól A1 − A2** | **2,498e−16** |
| **CCT analityczny** | **0,6344840466792927 s** |
| **CCT z bisekcji SOLVERA** | **0,6344792059501768 s** |
| rozdzielczość bisekcji | 9,681e−06 s |
| błąd bezwzględny | 4,841e−06 s |
| **błąd względny** | **7,63e−06** |

**Błąd (4,84e−06 s) jest MNIEJSZY niż rozdzielczość bisekcji (9,68e−06 s)** — czyli
zgodność jest w granicy rozdzielczości pomiaru, a nie „bliska".

Dla porównania: własny test produktu (`test_cct_z_bisekcji_zgadza_sie_z_kryterium_rownych_pol`,
`backend/tests/network_model/dynamika/test_walidacja_smib.py`) przyjmuje `TOLERANCJA_CCT = 0,02`
(2 %). Niezależny pomiar tej rundy jest **2600 razy ciaśniejszy od progu odbioru produktu**,
i to na innej drodze obliczeniowej (kwadratura na rzeczywistej krzywej vs postać zamknięta
z redukcji Krona).

**To jest najmocniejszy pojedynczy dowód fizyczny w tej rundzie**, bo CCT zależy JEDNOCZEŚNIE
od: ω₀, H, charakterystyki P_e(δ) w trzech stanach sieci, chwili założenia i zdjęcia zwarcia,
całkowania równania ruchu w stanie silnie nieliniowym (δ od 24° do 151°) oraz poprawnego
rozpoznania granicy stabilności. Błąd w KTÓREJKOLWIEK z tych rzeczy przesuwa CCT o procenty,
nie o 7,6e−06.

---
## G. WYROCZNIA ZEWNĘTRZNA — ANDES 1.9.3 (§12, §13, §31, §32)

Skrypt: `e12b_andes.py` (scratchpad rundy). Krok obu narzędzi 5e−4 s, horyzont 3 s,
tolerancja ANDES 1e−10.

### G.1 Poprawka metodyczna — układ odniesienia

Pierwsze podejście odejmowało `phase(E_sys)` od JEDNEJ strony (ANDES) i produkowało
**pozorny stały błąd 4,012e−02 rad**, który przez chwilę wyglądał jak defekt mostka.
Odtworzenie z kodu pokazało, że oba programy liczą kąt od TEJ SAMEJ osi (w produkcie
szyna SYS ma kąt 0; w modelu ANDES szyna 2 JEST węzłem SEM systemu i dostaje
`a0 = phase(E_sys)`), więc żadna strona nie wymaga przesunięcia. **Porównanie jest
surowe, a zgodność układów odniesienia — MIERZONA, nie zakładana:** różnica kątów
początkowych wynosi −1,315e−08 rad we wszystkich przypadkach.

To jest korekta MOJEGO błędu z tej rundy, nie defekt produktu. Mostek w repozytorium
(`tests/network_model/dynamika/wyrocznia_andes.py:189`) odejmuje odniesienie od OBU stron,
czyli jest poprawny.

### G.2 Uzgodnienia modelu (§13 — dokumentujemy, nie stroimy)

1. **Odbiór.** ANDES domyślnie zamienia PQ na stałą IMPEDANCJĘ w biegu czasowym
   (`p2z = 1,0`, `q2z = 1,0` — odczytane z `PQ.config`). Produkt trzyma odbiór o STAŁEJ MOCY.
   Żeby porównanie dotyczyło tej samej fizyki, wymuszono `p2p = 1, p2z = 0, q2q = 1, q2z = 0`
   i zmieniano `Ppf` (tak nakazuje docstring `Alter` w ANDES). **Żaden parametr nie był
   dobierany pod wielkość błędu.**
2. **Topologia.** Wszystkie przypadki liczone na modelu TRÓJWĘZŁOWYM (1 = GEN, 3 = SYS,
   2 = węzeł SEM systemu), z reaktancją systemu jako OSOBNĄ gałęzią 3–2. Dzięki temu
   wariant dwutorowy ma w ANDES dosłowny odpowiednik (`Toggle` na jednym torze), a nie
   przybliżenie — poprzednia wersja mostka musiała oznaczać ten przypadek „PRODUKT-ONLY".
3. **Moment vs moc.** ANDES całkuje moment (`tm`), produkt moc (`P_m`). Różnica jest rzędu
   |ω−1|. Hipoteza „to tłumaczy podłogę błędu" została OBALONA POMIAREM — sekcja N.

### G.3 Wyniki — 8 przypadków (§12 wymaga ≥ 7)

| # | Przypadek | δ e_max [rad] | δ e_RMS | t(e_max) [s] | ω e_max [p.u.] |
|---|---|---|---|---|---|
| A | bez zakłócenia | 1,3152e−08 | 1,315e−08 | 0,00 | **0,000e+00** |
| B | zwarcie 100 ms zdjęte, D = 0 | 1,4465e−04 | 9,175e−05 | 2,07 | 4,364e−06 |
| C | zwarcie 100 ms zdjęte, D = 2 | 1,3682e−04 | 7,751e−05 | 0,94 | 4,363e−06 |
| D | zwarcie 100 ms zdjęte, H = 7 | 7,0556e−05 | 4,413e−05 | 2,68 | 2,182e−06 |
| E | zwarcie 100 ms zdjęte, D = 4 | 1,2969e−04 | 6,680e−05 | 0,94 | 4,362e−06 |
| F | skok odbioru +0,05 p.u. (stała moc) | 8,0401e−06 | 5,104e−06 | 2,89 | 2,182e−07 |
| G | zwarcie TRWAŁE (bez zdjęcia) | 6,1062e−05 | 3,908e−05 | 0,72 | 1,396e−06 |
| H | wyłączenie jednego toru linii | 8,3713e−05 | 5,376e−05 | 0,74 | 1,808e−06 |

Pokrycie listy §12: A (bez zakłócenia) ✔, C (zmiana odbioru) ✔ = F, D (zwarcie /
zmiana impedancji) ✔ = B/G, E (zdjęcie zwarcia) ✔ = B/C/E, F (dwa poziomy H) ✔ = B/D,
G (dwa poziomy D) ✔ = B/C/E. **B (skok mocy mechanicznej) — NIEPOROWNYWALNY:** produkt
nie ma takiego zdarzenia (`kontrakty.py` — lista zamknięta: zwarcie, zmiana gałęzi,
odłączenie źródła, skok odbioru). To jest luka ZDOLNOŚCI produktu, nie luka wyroczni —
zapisana w sekcji P jako znalezisko otwarte.

Przypadek **H jest nowy w tej rundzie**: wcześniej wyłączenie toru było w mostku oznaczone
„PRODUKT-ONLY (brak równoważnika ANDES)", czyli ta zdolność nie miała walidacji zewnętrznej.
Ma ją od teraz.

### G.4 Statystyki oscylacji (§32)

| Przypadek | T produkt [s] | T ANDES [s] | błąd częstotliwości | błąd amplitudy | błąd fazy max [rad] | tempo narastania fazy [rad/s] |
|---|---|---|---|---|---|---|
| B | 0,750629 | 0,750629 | 3,73e−09 | 3,31e−06 | 4,18e−04 | +1,23e−07 |
| C | 0,749172 | 0,749172 | 4,64e−08 | 4,92e−07 | 4,20e−04 | −1,64e−07 |
| D | 1,054330 | 1,054330 | 2,13e−07 | 6,10e−07 | 2,98e−04 | −9,68e−07 |
| E | 0,748580 | 0,748580 | 2,35e−08 | 1,74e−06 | 4,20e−04 | +2,72e−07 |

**To jest rozstrzygające dla interpretacji różnicy z ANDES.** Okres modu zgadza się do
3,7e−09…2,1e−07 względnie, amplituda do 5e−07…3,3e−06, a błąd fazy NIE NARASTA
(tempo ~1e−07 rad/s — po 3 s daje 3e−07 rad, czyli trzy rzędy mniej niż sam błąd).
Różnica z ANDES nie jest więc błędem częstotliwości ani tłumienia, tylko **jednorazowym
przesunięciem powstałym w chwili zdarzenia**.

### G.5 Rozkład błędu na fazy przebiegu (§34)

| Przypadek | przed zdarzeniem | w zwarciu / po zdarzeniu | po zdjęciu |
|---|---|---|---|
| B | 1,3152e−08 | 1,3332e−04 | 1,4465e−04 |
| C | 1,3152e−08 | 1,3143e−04 | 1,3682e−04 |
| D | 1,3152e−08 | 6,7558e−05 | 7,0556e−05 |
| E | 1,3152e−08 | 1,2958e−04 | 1,2969e−04 |
| F | 1,3447e−08 | 8,0401e−06 | — |
| G | 1,3152e−08 | 6,1062e−05 | — |
| H | 9,8641e−09 | 8,3713e−05 | — |

**Przed zdarzeniem błąd jest równy różnicy warunków początkowych (1,3e−08) i niczemu
więcej** — przez pół sekundy trwania stanu ustalonego nie narasta. Rośnie dopiero wtedy,
gdy trajektoria zaczyna się PORUSZAĆ, a jego wielkość idzie w parze z wielkością ruchu:
skok odbioru 8,0e−06 → wyłączenie toru 8,4e−05 → zwarcie 1,3e−04.

**UWAGA INTERPRETACYJNA (korekta w obrębie tej rundy).** Pierwsze odczytanie tej tabeli
brzmiało: „błąd rodzi się NA ZDARZENIU". Test kontrolny z sekcji M (kołysanie swobodne
pobudzone przesunięciem stanu początkowego, BEZ żadnego zdarzenia dyskretnego) dał
1,056e−04 rad, czyli ten sam rząd — więc zdarzenie nie TWORZY błędu, tylko wprawia układ
w ruch. Właściwa przyczyna (przesunięcie osi czasu po stronie ANDES) jest ustalona
w sekcji M. Zapisuję to jawnie, bo wcześniejsza interpretacja tej samej tabeli była
w tej rundzie błędna.

---
## H. ZBIEŻNOŚĆ (§15, §30)

Skrypt: `e33b_arbiter.py`. Scenariusz: zwarcie 0,5–0,6 s, X_f = 0,05 p.u., horyzont 3 s.
Odniesienie: wyrocznia NIEZALEŻNA (DOP853, rtol 1e−12). **Samozgodność wyroczni zmierzona
osobno: 4,36e−12 rad** (rtol 1e−12 vs 1e−13) — czyli wyrocznia jest o ≥ 5 rzędów
dokładniejsza od mierzonego przedmiotu, więc wolno jej użyć jako miary (§14).

| dt [s] | PRODUKT vs wyrocznia e_max [rad] | iloraz | ANDES vs wyrocznia e_max [rad] | iloraz |
|---|---|---|---|---|
| 1,000e−3 | 3,71852e−05 | — | 1,81707e−04 | — |
| 5,000e−4 | 9,29636e−06 | **4,000** | 1,53930e−04 | 1,180 |
| 2,500e−4 | 2,32409e−06 | **4,000** | 1,46965e−04 | 1,047 |
| 1,250e−4 | 5,81025e−07 | **4,000** | 1,44763e−04 | 1,015 |

**Empiryczny rząd zbieżności produktu p = log₂(4,000) = 2,000** — dokładnie rząd
teoretyczny trapezu niejawnego (§15: „empiryczny rząd wobec teoretycznego p"). Iloraz
4,000 powtórzony trzy razy, nie raz.

**ANDES NIE ZBIEGA do tej samej granicy:** ilorazy 1,18 → 1,05 → 1,02 dążą do 1,
czyli błąd dąży do stałej podłogi ≈ 1,4448e−04 rad, a nie do zera. To jest punkt wyjścia
analizy przyczyny w sekcji M.

Tolerancje a priori (§30): dla metody rzędu 2 przy dt = 1e−3 i skali zjawiska ~0,5 rad
oczekiwany błąd to O(dt²·ω_n²·A) ≈ 3e−05 rad — zmierzono 3,72e−05. **Tolerancja została
wyprowadzona z rzędu metody i kroku PRZED pomiarem, a nie dopasowana po nim.**

---
## I. NIEZMIENNIKI FIZYCZNE, CZUŁOŚCI I GRANICE MODELU (§7, §21, §22, §23)

### I.1 Niezmienniki — zestawienie

| Niezmiennik | Wymaganie | Zmierzono | Sekcja |
|---|---|---|---|
| f(x₀,y₀) = 0, g(x₀,y₀) = 0 w punkcie pracy | ≈ 0 maszynowo | 3,17e−17 / 8,88e−16 | E.2 |
| Brak dryfu bez zakłócenia | 0 | **0,0 dokładnie** (4 kroki, 20 s, wszystkie kanały) | E.3 |
| Całka pierwsza energii, D = 0 | dV/dt = 0 | dryf 2,00e−10 | F.2 |
| Energia przy D > 0 | dV/dt ≤ 0 | **zero przyrostów dodatnich** | F.2 |
| Bilans mocy `2H·dω/dt = P_m − P_e` | ≈ 0 | 2,94e−07 (górna granica estymatora) | K.6 |
| Ciągłość stanów przy zdarzeniu | Δx = 0 | **0,0** | J.2 |
| Prawo Kirchhoffa po skoku algebraicznym | ≈ 0 | 1,55e−15 | J.2 |

### I.2 Czułości ILOŚCIOWE (§22) — każda z przewidywaniem analitycznym

Skrypt: `e22_czulosci.py`. Każde prawo ma postać zamkniętą WYPROWADZONĄ, a nie dopasowaną.

**S1. H rośnie ⇒ |ROCOF| maleje jak 1/H; okres rośnie jak √H**

| H [s] | ROCOF [Hz/s] | iloraz zmierzony | iloraz przewidziany 1/H | błąd | okres zmierzony [s] | iloraz okresu | przewidziany √H | błąd |
|---|---|---|---|---|---|---|---|---|
| 1,75 | 8,727224541 | 1,999994479 | 2,00 | 5,52e−06 | 0,529045006 | 0,707110191 | 0,707106781 | 3,41e−06 |
| 3,50 | 4,363624317 | 1,000000000 | 1,00 | 0,0 | 0,748179015 | 1,000000000 | 1,000000000 | 0,0 |
| 7,00 | 2,181815170 | 0,500000690 | 0,50 | 6,90e−07 | 1,058082089 | 1,414209792 | 1,414213562 | 3,77e−06 |
| 14,00 | 1,090908338 | 0,250000518 | 0,25 | 5,18e−07 | 1,496426406 | 2,000091390 | 2,000000000 | 9,14e−05 |

Monotoniczność: TAK. Maksymalny błąd ilorazu ROCOF **5,52e−06**, ilorazu okresu **9,14e−05**.

**S2. D rośnie ⇒ tłumienie rośnie dokładnie jak D/(4H); f_d maleje**

| D [p.u.] | σ analityczna = D/(4H) [1/s] | σ zmierzona [1/s] | błąd względny | f_d analityczna [Hz] |
|---|---|---|---|---|
| 0 | 0,000000000 | 2e−09 | — | 1,336518530 |
| 1 | 0,071428571 | 0,071434546 | 8,36e−05 | 1,336470181 |
| 2 | 0,142857143 | 0,142866723 | 6,71e−05 | 1,336325124 |
| 4 | 0,285714286 | 0,285726508 | 4,28e−05 | 1,335744737 |
| 8 | 0,571428571 | 0,571437520 | 1,57e−05 | 1,333420663 |

Monotoniczność σ: TAK. Monotoniczność f_d (malejąca): TAK. Maksymalny błąd **8,36e−05**.

**S3. |ΔP| rośnie ⇒ odpowiedź rośnie liniowo w reżimie małosygnałowym**

Skok odbioru w zakresie **64×**, ΔP_eff mierzone z samego produktu (skok P_e na zaciskach):

| ΔP zadane [p.u.] | ΔP_eff [p.u.] | szczyt \|Δδ\| [rad] | szczyt/ΔP_eff | iloraz szczytu | iloraz ΔP_eff | odchyłka od liniowości |
|---|---|---|---|---|---|---|
| 0,001 | 0,000575852 | 0,000737643 | 1,280960508 | 1,000 | 1,000 | 0 |
| 0,004 | 0,002303190 | 0,002949069 | 1,280428031 | 3,997960 | 3,999623 | 4,16e−04 |
| 0,016 | 0,009209285 | 0,011772464 | 1,278325561 | 15,95956 | 15,99246 | 2,06e−03 |
| 0,064 | 0,036781501 | 0,046725016 | 1,270340104 | 63,34364 | 63,87321 | 8,29e−03 |

Przewidywanie małosygnałowe `2/K_s = 1,272835041`. Zmierzona czułość dąży do niego przy
malejącym ΔP (1,2810 przy najmniejszym skoku), a odchyłka od liniowości rośnie
MONOTONICZNIE z ΔP (0 → 4,2e−04 → 2,1e−03 → 8,3e−03). **To jest poprawne rozdzielenie
reżimu małosygnałowego od dużosygnałowego** — gdyby odchyłka nie rosła, model byłby
podejrzanie liniowy; gdyby rosła nieregularnie, wskazywałaby na błąd.

**S4. X rośnie ⇒ moment synchronizujący K_s maleje; okres rośnie**

| X_L [p.u.] | X_T [p.u.] | K_s [p.u./rad] | okres analityczny [s] | okres zmierzony [s] | błąd |
|---|---|---|---|---|---|
| 0,15 | 0,50 | 2,197456311 | 0,632694162 | 0,632695031 | 1,37e−06 |
| 0,30 | 0,65 | 1,571295521 | 0,748212597 | 0,748179015 | 4,49e−05 |
| 0,60 | 0,95 | 0,923114816 | 0,976171427 | 0,976183776 | 1,27e−05 |
| 1,00 | 1,35 | 0,408769604 | 1,466947783 | 1,467119689 | 1,17e−04 |

Monotoniczność K_s (malejąca): TAK. Monotoniczność okresu (rosnąca): TAK. Maksymalny błąd
okresu **1,17e−04** przy pięciokrotnej zmianie K_s. Sieć słaba (X_T = 1,35) i sieć sztywna
(X_T = 0,50) są odtwarzane tą samą formułą bez żadnej korekty.

### I.3 Granice ważności modelu (§23)

Skrypty: `e23_granice.py` + `e23b_uzupelnienie.py`. Kryterium §23: każdy przypadek kończy
się PASS albo JAWNĄ ODMOWĄ; **zakazane są NaN, Inf, ciche obcięcie i wynik niefizyczny bez
ostrzeżenia**. Kontrola skończoności obejmuje **WSZYSTKIE 26 kanałów wyniku**, nie tylko
te, które czytam.

| # | Przypadek graniczny | Wynik | Dowód liczbowy |
|---|---|---|---|
| L1 | H = 0,05 s (bardzo mała bezwładność) | **PASS** | 26/26 kanałów skończonych; okres 0,08944510 s vs analityczny 0,08942851 s (błąd 1,86e−04); 4471 próbek/okres |
| L2a | H = 0 | **ODMOWA** | `ZeroDivisionError` — bieg przerwany, nie „bardzo duża liczba" |
| L2b | H = −3,5 (bezwładność ujemna) + zakłócenie | **BIEG UKOŃCZONY** | 26/26 skończonych, δ → −23,39 rad, ω → 0,8618 p.u. (maszyna HAMUJE zamiast przyspieszać — skutek odwróconego znaku 2H) |
| L3 | D = 0 (brak tłumienia), 20 s | **PASS** | σ zmierzona 2,91e−06 1/s wobec 0 — amplituda traci < 6e−05 względnie przez 20 s |
| L4 | D = −2 (tłumienie ujemne) | **PASS** | σ = −0,14281945 vs D/(4H) = −0,14285714 (błąd 2,64e−04); **obwiednia ROŚNIE — brak cichego obcinania D do zera** |
| L5 | D = 200 (nadkrytyczne, ζ = 1,7012) | **PASS** | 0 przejść przez równowagę; nachylenie log\|y\| = −2,7251869 1/s vs λ_wolna = −2,7288092 1/s (błąd **1,33e−03**) |
| L6a | sieć bardzo sztywna (X_T = 0,33) | **PASS** | K_s = 5,3065; okres 0,40714388 vs 0,40714400 s (błąd **2,95e−07**) |
| L6b | sieć bardzo słaba (X_T = 1,55) | **PASS** | K_s = 0,1551; δ₀ = 76,79°; okres 2,37236 vs 2,38152 s (błąd 3,84e−03) |
| L7 | kąt blisko granicy statycznej | **PASS / POZA DZIEDZINĄ** | P = 0,8 → K_s = +1,5713 (błąd okresu 2,69e−07); P = 2,0 → K_s = +0,9539 (2,18e−06); **P = 3,0 → K_s = −0,2801**; P = 3,35 → K_s = −1,1907 |
| L8 | zakłócenie 1e−8 … 1e−2 p.u. | **PASS** | czułość 1,2793714…1,2811383, rozrzut **1,38e−03 na zakresie MILION razy**; próg rozdzielczości przesuwa się z tolerancją Newtona (1e−6 przy tol 1e−11 → 1e−8 przy tol 1e−14) |
| L9 | głębokie zwarcie trwałe (utrata synchronizmu) | **PASS** | δ → 108,07 rad (17 poślizgów biegunowych), ω_max = 1,2796 p.u., monotoniczny wzrost; **błąd vs wyrocznia niezależna 3,54e−08 rad**, końcowy 7,06e−09 rad |
| L10 | zwarcie metaliczne R_f = X_f = 0 | **ODMOWA NAZWANA** | `OdmowaDynamiki`, kod `dynamika.zwarcie_metaliczne_bez_admitancji`, komunikat wskazuje działanie („podaj niezerową impedancję zwarcia (rezystancja łuku)") |

**W żadnym z 12 przypadków nie wystąpił NaN ani Inf** — kontrola objęła 26 kanałów ×
12 biegów. Maksymalne residuum algebry w tych biegach: 9,80e−12.

**Trzy wnioski wymagające jawnego nazwania:**

1. **L8 — nie ma ukrytego progu.** Próg rozdzielczości odpowiedzi istnieje, ale
   **przesuwa się razem z JAWNĄ nastawą tolerancji Newtona** (1e−11 → próg 1e−6 p.u.;
   1e−14 → próg 1e−8 p.u.). Gdyby to była zaszyta stała, próg stałby w miejscu. Czułość
   `szczyt/ΔP_eff` jest stała do 1,4e−03 na zakresie miliona — czyli powyżej progu
   nie ma żadnego obcinania.
2. **L7 — granica statyczna jest przekraczalna i to jest poprawne.** Przy P ≥ 3,0 p.u.
   współczynnik synchronizujący K_s staje się UJEMNY (punkt pracy na opadającej gałęzi
   charakterystyki), więc równowaga jest niestabilna. Solver nie odmawia — i nie powinien:
   niestabilność jest wynikiem fizycznym, nie awarią. Takie punkty pracy są jednak
   **POZA DZIEDZINĄ ZWALIDOWANĄ** (sekcja C), bo linearyzacja tam nie obowiązuje.
3. **L2b — bezwładność ujemna: rdzeń jest przepuszczalny, bramka jest warstwę wyżej.**
   Rdzeń DAE przyjmuje H < 0 i liczy do końca (wynik jest wtedy niefizyczny: maszyna
   hamuje przy nadwyżce mocy mechanicznej). **Na ścieżce użytkownika ten przypadek jest
   jednak NIEOSIĄGALNY**: kontrakt ENM wymusza `h_s: Field(gt=0.0, le=15.0)`
   (`backend/src/enm/dynamika_modele.py:159`), więc H ≤ 0 jest odrzucane walidacją
   kontraktu, zanim dotrze do solvera. Klasyfikuję to jako **obserwację o głębokości
   obrony, nie jako defekt §23** — ale nazywam wprost, bo rdzeń NIE powtarza tej kontroli,
   a L2a pokazuje, że przy H = 0 odmowa jest surowym `ZeroDivisionError`, a nie odmową
   NAZWANĄ (jak przy zwarciu metalicznym). Zgłoszone w sekcji N jako F-7.

Zakres H zwalidowany w tej rundzie (0,05 … 14 s) mieści się w zakresie dopuszczonym przez
kontrakt (0 … 15 s] — czyli dziedzina walidacji pokrywa dziedzinę wejścia.

---
## J. WALIDACJA ZDARZEŃ (§16, §17)

Skrypt: `e07_16_17.py`.

### J.1 Dokładność chwili zdarzenia (§16)

Cztery konfiguracje: zdarzenie dokładnie na siatce, między krokami, tuż przy granicy
kroku oraz dwa zdarzenia blisko siebie (odstęp 0,1 ms przy kroku 1 ms).

| Konfiguracja | t zadane [s] | błąd chwili zdarzenia |
|---|---|---|
| dokładnie na siatce | 0,500 / 0,600 | **0,0 (dokładnie)** |
| między krokami | 0,5005 / 0,6003 | **0,0 (dokładnie)** |
| tuż przy granicy kroku | 0,4999999 / 0,6000001 | **0,0 (dokładnie)** |
| dwa zdarzenia blisko siebie | 0,5000 / 0,5001 | **0,0 (dokładnie)** |

Zero jest tu wynikiem konstrukcji, nie szczęścia: `silnik.py:542-557` wstawia chwile
zdarzeń jako PUNKTY OBOWIĄZKOWE siatki całkowania, więc zdarzenie nigdy nie wypada
„między krokami". Mutacja M6 (przesunięcie zdarzenia o jeden krok) jest przez tę bramkę
ZABIJANA (sekcja L).

### J.2 Ciągłość zmiennych przy zdarzeniu (§17)

Pomiar na przejściu przez założenie i zdjęcie zwarcia (t⁻ = 0,4999 / t⁺ = 0,5000 oraz
t⁻ = 0,5999 / t⁺ = 0,6000):

| Wielkość | Klasa | Skok przy zdarzeniu |
|---|---|---|
| `delta_rad@G1` (stan) | RÓŻNICZKOWA | **0,0 — bez skoku** |
| `omega_pu@G1` (stan) | RÓŻNICZKOWA | **0,0 — bez skoku** |
| `p_mechaniczna_pu@G1` (stan) | RÓŻNICZKOWA | **0,0 — bez skoku** |
| `sem_modul_pu@G1` (stan) | RÓŻNICZKOWA | **0,0 — bez skoku** |
| `u_pu@GEN`, `kat_deg@GEN` | ALGEBRAICZNA | skok DOZWOLONY |
| `p_pu@G1`, `q_pu@G1` | ALGEBRAICZNA | skok DOZWOLONY |

Pomiar zbiorczy dla obu zdarzeń:

```
delta_x_max (największy skok stanu)        = 0,0
delta_y_max (największy skok algebraiczny) = 0,4691489361702125
res_kcl (residuum I prawa Kirchhoffa po zdarzeniu) = 1,554e−15
```

**To jest dokładnie ta granica, której wymaga §17:** zmienne stanu (całkowane) są ciągłe,
zmienne algebraiczne (wyznaczane z sieci) skaczą, a po skoku prawo Kirchhoffa jest
spełnione do 1,6e−15. Skok napięcia o 0,469 p.u. przy zwarciu w węźle generatora jest
fizycznie poprawny — sieć bez elementów dynamicznych reaguje natychmiast.

---
## K. ROCOF I ZWIĄZKI ω / f / Δf (§8, §9, §10, §19, §20)

Skrypt: `e08_h_dp_rocof.py`.

### K.1 Relacje z kodu, nie z założenia (§19)

```
ω₀ = 2π·f_b          (konwencje.py:38 — jedyny producent)
f  = f_b·ω           (definicja p.u. prędkości)
Δf = f_b·Δω  ⇒  ROCOF = df/dt = f_b·dω/dt
```

Dla f_b = 50 Hz: ROCOF [Hz/s] = 50 · dω/dt [1/s]. Nie ma w pakiecie miejsca, które
mieszałoby Hz z rad/s (audyt zamknięty w sekcji D.2).

**Częstotliwość WĘZŁA to INNA wielkość niż prędkość WIRNIKA** (`obserwable.py:352-396`):
`θ̇ = Im(V̇·conj(V))/|V|²`, `f = f_b + θ̇/(2π)`. Pomiar potwierdza rozróżnienie:
w chwili t_f⁺ częstotliwość węzła wynosi **50,0 Hz dokładnie**, mimo że wirnik już
przyspiesza — bo δ̇ w tej chwili jest jeszcze zerowe. Mylenie tych dwóch wielkości jest
klasycznym błędem; tutaj są rozdzielone i obie są poprawne.

### K.2 ROCOF trzema NIEZALEŻNYMI drogami (§20)

* **(A)** z równania ruchu, na wielkościach PRODUKTU w chwili t_f⁺: `(P_m − P_e − DΔω)/(2H)`
* **(B)** z trajektorii ω produktu (regresja liniowa po 5 próbkach)
* **(C)** z WYROCZNI NIEZALEŻNEJ: P_e po założeniu bocznika przy niezmienionym δ

Przypadek H = 3,5 s, X_f = 0,05 p.u.:

| Droga | dω/dt [1/s] | ROCOF [Hz/s] | błąd vs (C) |
|---|---|---|---|
| (A) równanie ruchu | 0,08727272727272732 | 4,363636363636366 | **3,18e−16** |
| (B) trajektoria ω | 0,08727248634136801 | 4,363624317068401 | 2,76e−06 |
| (C) wyrocznia | 0,0872727272727273 | 4,363636363636365 | — |

P_e w chwili t_f⁺: produkt 0,1890909090909088 vs wyrocznia 0,18909090909090898 —
zgodność do **2e−16**. Błąd drogi (B) to błąd różniczkowania numerycznego (5 próbek
co 0,25 ms), nie błąd fizyki.

§20 wymaga oddzielenia metryki FILTROWANEJ od chwilowej pochodnej fizycznej: kanał
`f_hz@GEN` (częstotliwość węzła z fazora) i `u_f_est_hz@`/`jakosc_f@` (estymata z
niepewnością i kodem jakości) są osobnymi kanałami; ROCOF wirnika liczony jest
z równania ruchu. Nie ma jednego kanału udającego obie wielkości.

### K.3 Skalowanie bezwładności — przewidywanie analityczne (§8)

`dω/dt|_{t_f⁺} = ΔP/(2H)` ⇒ iloraz ROCOF dla H i H₀ wynosi DOKŁADNIE H₀/H.

| H [s] | iloraz przewidziany (H₀/H) | iloraz zmierzony (A) | iloraz zmierzony (B) |
|---|---|---|---|
| 3,5 | 1,00 | **1,00** | **1,00** |
| 7,0 | 0,50 | **0,50** | **0,50** |
| 14,0 | 0,25 | **0,25** | **0,25** |

Ilorazy zmierzone są równe przewidzianym w pełnej precyzji wydruku — to nie jest „trend",
tylko liczba.

### K.4 Liniowość względem ΔP (§9)

Głębokość zwarcia zmieniana w zakresie 40× (X_f = 2,0 … 0,05 p.u.), co daje ΔP od
0,0598 do 0,611 p.u. Przewidywanie: `ROCOF/ΔP = 1/(2H) = 1/7 = 0,142857…`

| X_f [p.u.] | ΔP [p.u.] | ROCOF/ΔP zmierzone |
|---|---|---|
| 2,00 | 0,0597865 | 0,14285560 |
| 0,05 | 0,6109091 | 0,14285670 |

Stała 1/(2H) odtworzona na całym zakresie z rozrzutem < 1e−05 względnie. To rozdziela
reżim MAŁOSYGNAŁOWY od DUŻOSYGNAŁOWEGO: odpowiedź natychmiastowa (ROCOF) jest liniowa
w ΔP dokładnie, bo w chwili t_f⁺ δ jeszcze się nie zmieniło.

### K.5 Symetria znaku (§10)

Skok odbioru ±0,02 p.u. na tym samym układzie:

| Znak | dω/dt [1/s] | δ(t+50 ms) − δ₀ [rad] |
|---|---|---|
| +0,02 | −0,0016442891529288826 | −0,0006363457311381326 |
| −0,02 | +0,0016463573468312202 | +0,0006371500730047996 |

Suma: 2,068e−06; asymetria względna **1,258e−03**. Ta asymetria jest FIZYCZNA, nie
numeryczna: charakterystyka P_e(δ) jest sinusoidą, więc przy δ₀ = 0,431 rad nachylenie
po obu stronach nie jest identyczne. Rząd wielkości zgadza się z drugą pochodną
(½·P_max·sin(δ₀−δ_s)·Δδ / K_s ≈ 1e−03). Gdyby asymetria była zerowa, model byłby
podejrzanie liniowy.

### K.6 Bilans mocy wzdłuż trajektorii (§21)

Residuum równania ruchu `2H·dω/dt − (P_m − P_e)` liczone poza chwilą skoku:

```
max |residuum| = 2,942e−07 p.u.        RMS = 1,007e−07 p.u.
max residuum algebry solvera (g)       = 3,938e−12
```

Te dwie liczby są RÓŻNYMI wielkościami i są raportowane osobno, jak wymaga §21.
2,9e−07 to GÓRNA GRANICA wynikająca z centralnej różnicy numerycznej użytej do oszacowania
dω/dt (błąd O(dt²) estymatora), a nie niedomknięcie równania ruchu — samo residuum
Newtona jest o pięć rzędów mniejsze.

---
## L. MACIERZ MUTACJI FIZYCZNYCH (§24)

Skrypty: `bramki_fizyczne.py` (bramki), `e24_mutacje.py` (mutator). Mutacja jest wstawiana
do ŹRÓDŁA PRODUKCYJNEGO, bramki są uruchamiane, źródło jest przywracane w bloku `finally`.
Po całym przebiegu `git status --short` drzewa roboczego jest **pusty** (weryfikowane).

### L.1 Bramki fizyczne z progami USTALONYMI A PRIORI (§30)

| Bramka | Sprawdza | Próg |
|---|---|---|
| G1 | dryf stanu ustalonego bez zakłócenia | 1e−09 rad |
| G2 | częstotliwość modu vs `√(ω₀K_s/2H)/2π` | 1,0e−03 wzgl. |
| G3 | ROCOF produktu vs ROCOF wyroczni | 1,0e−09 wzgl. |
| G4 | tłumienie z obwiedni vs `D/(4H)` | 1,0e−02 wzgl. |
| G5 | chwila zdarzenia | 1e−12 s |
| G6 | mod maszyny podanej w INNEJ bazie urządzenia (50 MVA) | 1,0e−03 wzgl. |

### L.2 Wynik — 9 mutacji, 9 zabitych

| # | Mutacja | Status | Bramki, które ją zabiły |
|---|---|---|---|
| M1 | usunięte ω₀ z dδ/dt | **ZABITA** | G2, G4 |
| M2 | odwrócony znak P_e w równaniu ruchu | **ZABITA** | wyjątek (solver nie zbiega) |
| M3 | 2H zastąpione przez H | **ZABITA** | G2, G4 |
| M4 | tłumienie D wyłączone | **ZABITA** | G4 |
| M5 | pulsacja bazowa w Hz zamiast rad/s | **ZABITA** | G2 |
| M6 | zdarzenie przesunięte o jeden krok | **ZABITA** | G5 |
| M7 | odwrócony kierunek zmiany bazy H | **ZABITA** | G6 |
| M8 | połowa reaktancji zewnętrznej systemu | **ZABITA** | G2, G3 |
| M9 | odwrócony kierunek zmiany bazy impedancji | **ZABITA** | G6 |

### L.3 LUKA WALIDACYJNA WYKRYTA I ZAMKNIĘTA W TEJ RUNDZIE

Pierwszy przebieg dał **M7 PRZEŻYŁA**. Diagnoza: układ odniesienia benchmarku (a także
`tests/network_model/dynamika/uklady.py`) buduje maszynę z `s_n_mva = S_BAZOWA_MVA = 100`,
więc **przelicznik bazy jest TOŻSAMOŚCIĄ i każdy błąd kierunku bazy jest niewidoczny**.
To nie była poprawna mutacja „nie do zabicia" — to była luka w zbiorze testowym.

Naprawa (w warstwie walidacyjnej rundy, nie w produkcie): bramka **G6** buduje tę samą
fizycznie maszynę podaną w INNEJ bazie urządzenia:

```
zbuduj_maszyne_klasyczna(s_n_mva=50,0, h_s=7,0, x_prim_pu=0,15, s_bazowa_mva=100,0)
  ⇒ po przeliczeniu MUSI dać H = 3,5 s i X′d = 0,30 p.u., czyli mod IDENTYCZNY
```

Pomiar bazowy po dodaniu G6: `H_po_przeliczeniu = 3,5`, `X′d_po_przeliczeniu = 0,3`,
`okres_inna_baza = 0,7482141747098077 s` — **bit w bit równy okresowi odniesienia**,
błąd względny 2,109e−06. Po tej zmianie M7 ginie z pomiarem
`H_po_przeliczeniu = 14,0` i okresem 1,4964259830164532 s = **dokładnie 2× okres
poprawny**, co jest zgodne z `T ∝ √H` przy czterokrotnym H. M9 (odwrócony kierunek bazy
impedancji) ginie na tej samej bramce.

**Wniosek metodyczny (reguła KLASA, NIE INSTANCJA):** mutacja, która przeżyła, wskazała
nie defekt produktu, lecz ślepy punkt zbioru testowego — i ten ślepy punkt dotyczy CAŁEJ
KLASY przeliczeń bazy (H, impedancja, moce), a nie jednej funkcji. Dlatego bramka G6
sprawdza mod końcowy po przeliczeniu, czyli skutek WSZYSTKICH przeliczeń naraz.

**Znalezisko dla repozytorium (NIE naprawione — §43):** `tests/.../uklady.py` używa
`s_n_mva = S_BAZOWA_MVA`, więc testy produktu dziedziczą ten sam ślepy punkt.
Klasyfikacja **P1-TEST** (nie P1-PHYSICS: kod produkcyjny jest poprawny, niewidoczny jest
tylko potencjalny błąd). Zapisane w sekcji N.

---
## M. PRZYCZYNA RÓŻNICY Z ANDES — USTALONA (§33, §34, §35)

**§33 zabrania zostawienia odpowiedzi „prawdopodobnie numeryczne" bez dowodu.**
Historyczny opis w repozytorium (`tests/network_model/dynamika/test_wyrocznia_andes.py`)
mówi, że przyczyna podłogi ≈1,4e−04 rad „pozostaje NIEUSTALONA". **Ta runda ją ustala.**

### M.1 Łańcuch dowodowy — pięć kroków, każdy z pomiarem

**Krok 1 — to nie jest błąd produktu (sekcja H).** Produkt zbiega do wyroczni niezależnej
z empirycznym rzędem **p = 2,000** (iloraz 4,000 trzykrotnie), osiągając 5,81e−07 rad przy
dt = 1,25e−4. ANDES przy tym samym kroku stoi na 1,4476e−04 i nie schodzi niżej.
Wyrocznia jest samozgodna do 4,36e−12 rad, więc to nie ona jest miarą błędu.

**Krok 2 — to nie jest różnica MODELU ani ALGEBRY (§35).** Skrypt `e35_krok.py` bierze
stan (δ, ω) policzony przez ANDES w trakcie zwarcia i wstawia GO SAMEGO do wyroczni:

| t [s] | błąd \|U\| [p.u.] | błąd kąta U [rad] | błąd P_e [p.u.] | błąd P_e względny |
|---|---|---|---|---|
| 0,55 (w zwarciu) | −4,01e−09 | +2,45e−08 | −2,60e−08 | −1,10e−07 |
| 0,80 | +9,61e−10 | +3,55e−08 | −1,75e−08 | −4,21e−08 |
| 0,999 | −5,97e−10 | −1,80e−07 | +2,85e−08 | −3,44e−07 |

Średni błąd P_e w zwarciu: **−2,54e−08 p.u.** Wynikający z niego błąd dω/dt: 3,62e−09 1/s,
co po 100 ms zwarcia daje błąd kąta **5,69e−09 rad**. Obserwowany błąd ANDES po 100 ms
zwarcia to **1,333e−04 rad — 23 000 razy więcej.** Algebra i model są więc wykluczone.

**Krok 3 — to nie jest różnica MOMENT vs MOC.** Skrypt `e33c_moment_vs_moc.py`:
dwie postaci wyroczni (mocowa i momentowa) różnią się o **5,277e−02 rad**, a:

| porównanie | e_max [rad] |
|---|---|
| PRODUKT vs wyrocznia w postaci MOCY | 2,324e−06 |
| PRODUKT vs wyrocznia w postaci MOMENTU | 5,277e−02 |
| ANDES vs wyrocznia w postaci MOCY | 1,470e−04 |
| ANDES vs wyrocznia w postaci MOMENTU | 5,279e−02 |

ANDES pasuje do postaci MOCOWEJ (1,47e−04), a nie momentowej (5,28e−02). Hipoteza
„ANDES całkuje moment, stąd podłoga" jest **OBALONA POMIAREM** — różnica momentowa jest
360 razy większa od obserwowanej. (max\|ω−1\| w tym biegu: 9,21e−03.)

**Krok 4 — to nie jest obsługa ZDARZENIA.** Skrypt `e35b_bez_zdarzenia.py` pobudza
trajektorię BEZ ŻADNEGO zdarzenia dyskretnego (przesunięcie δ₀ o +0,05 rad wprost
w wektorze stanu po inicjalizacji). Na czystym kołysaniu swobodnym przez 3 s:
**ANDES vs wyrocznia = 1,056e−04 rad** — ten sam rząd, co w przypadkach ze zwarciem.
**To obala tezę, że różnica rodzi się przy zdarzeniu** (i koryguje pierwsze odczytanie
profilu z sekcji G.5: zdarzenie nie TWORZY błędu, tylko wprawia trajektorię w ruch,
a błąd ujawnia się wszędzie tam, gdzie trajektoria się porusza).

**Krok 5 — to jest PRZESUNIĘCIE OSI CZASU ANDES.** Skrypty `e35c_przesuniecie.py`
(bez zdarzenia) i `e35d_kontrast.py` (ze zwarciem) szukają przesunięcia τ, które
minimalizuje błąd wobec gęstego rozwiązania wyroczni.

Kołysanie swobodne (bez zdarzenia):

| dt [s] | błąd bez przesunięcia | τ optymalne [s] | τ w krokach | błąd po przesunięciu | redukcja |
|---|---|---|---|---|---|
| 1,0e−3 | 2,157e−04 | −5,086e−04 | **−0,509** | 3,24e−06 | 66× |
| 5,0e−4 | 1,056e−04 | −2,514e−04 | **−0,503** | 7,23e−07 | 146× |
| 2,5e−4 | 5,307e−05 | −1,260e−04 | **−0,504** | 5,73e−06 | 9× |

Błąd bez przesunięcia skaluje się LINIOWO z krokiem (2,157 → 1,056 → 0,531 ·1e−4;
ilorazy 2,04 i 1,99), a τ optymalne to **równo pół kroku** przy trzech różnych krokach.

Zwarcie 0,5–0,6 s — ten sam test, PRODUKT obok ANDES:

| kto | dt [s] | błąd bez przesunięcia | τ optymalne [s] | τ w krokach | błąd po przesunięciu | redukcja |
|---|---|---|---|---|---|---|
| PRODUKT | 1,0e−3 | 3,719e−05 | −6,77e−06 | −0,0068 | 1,770e−05 | 2,1× |
| ANDES | 1,0e−3 | 1,817e−04 | −5,677e−05 | −0,0568 | 1,774e−05 | 10,2× |
| PRODUKT | 5,0e−4 | 9,296e−06 | −1,69e−06 | −0,0034 | 4,425e−06 | 2,1× |
| ANDES | 5,0e−4 | 1,538e−04 | −5,168e−05 | −0,1034 | 4,447e−06 | 34,6× |
| PRODUKT | 2,5e−4 | 2,324e−06 | −4,23e−07 | −0,0017 | 1,106e−06 | 2,1× |
| ANDES | 2,5e−4 | 1,480e−04 | −5,063e−05 | −0,2025 | 1,697e−06 | 87,2× |

### M.2 Wniosek przyczynowy

1. **PRODUKT nie ma przesunięcia osi czasu.** Jego τ optymalne to 0,17–0,68 % kroku
   i maleje jak dt² (6,77e−06 → 1,69e−06 → 4,23e−07, ilorazy 4,0), czyli jest zwykłym
   artefaktem obcięcia rzędu 2, a nie opóźnieniem. Redukcja błędu po przesunięciu to
   tylko 2,1× — błąd produktu jest izotropowy w czasie.
2. **ANDES ma przesunięcie osi czasu.** W scenariuszu ze zwarciem τ ≈ **−50 µs, STAŁE**
   niezależnie od kroku (−56,8 / −51,7 / −50,6 µs); w scenariuszu bez zdarzenia
   τ = **−dt/2**. Usunięcie przesunięcia redukuje błąd 10–87× (zwarcie) i 66–146×
   (kołysanie swobodne).
3. **Po usunięciu przesunięcia oba programy mają TEN SAM błąd resztkowy:** przy dt = 1e−3
   PRODUKT 1,770e−05 vs ANDES 1,774e−05 (różnica 0,2 %); przy dt = 5e−4 — 4,425e−06 vs
   4,447e−06 (0,5 %); przy 2,5e−4 — 1,106e−06 vs 1,697e−06. Obie reszty maleją jak dt².

**PRZYCZYNA USTALONA: historyczna „podłoga ≈1,4e−04 rad o nieustalonej przyczynie" to
PRZESUNIĘCIE OSI CZASU po stronie ANDES (stempel czasu próbki nie odpowiada stanowi,
który ta próbka przedstawia), a nie błąd fizyki po żadnej ze stron.** Po skorygowaniu
przesunięcia ANDES i MV-DESIGN-PRO zgadzają się z wyrocznią niezależną z dokładnością
SWOJEGO WSPÓLNEGO błędu obcięcia rzędu 2. Różnica nie jest więc miarą jakości modelu
MV-DESIGN-PRO i nie może być używana jako kryterium jego poprawności fizycznej.

### M.3 Konsekwencja dla repozytorium (znalezisko, NIE naprawione w tej rundzie)

Docstring `test_wyrocznia_andes.py` twierdzi, że przyczyna „pozostaje NIEUSTALONA".
Po tej rundzie to zdanie jest NIEAKTUALNE. Klasyfikacja: **P2-DOKUMENTACJA**.
Nie zmienione, bo §43 kończy rundę na raporcie, a §1 zakazuje zmian przed decyzją
właściciela. Zapisane w sekcji N.

---
## N. ZNALEZISKA OTWARTE (§41, §42)

**Nie znaleziono ŻADNEGO defektu klasy P0 ani P1-PHYSICS** — §42 (STOP DIAGNOSTIC PHASE)
nie został uruchomiony. Poniżej pełna lista znalezisk, z klasyfikacją i uzasadnieniem,
dlaczego każde zostało ZOSTAWIONE (§43: „STOP po raporcie, nie rozpoczynaj napraw").

| # | Znalezisko | Klasa | Miejsce | Dlaczego nienaprawione |
|---|---|---|---|---|
| F-1 | Układ odniesienia testów dynamiki ma `s_n_mva = S_BAZOWA_MVA`, więc przelicznik bazy jest TOŻSAMOŚCIĄ i błąd kierunku przeliczenia bazy (H, impedancji, mocy) jest w testach NIEWIDOCZNY | **P1-TEST** (nie P1-PHYSICS — kod produkcyjny jest poprawny) | `backend/tests/network_model/dynamika/uklady.py` (`zbuduj_smib`) | naprawa = zmiana zbioru testowego produktu; §1/§43 zakazują zmian w fazie diagnostycznej. Dowód luki: mutacja M7 przeżyła pierwszy przebieg (sekcja L.3) |
| F-2 | Docstring twierdzi, że przyczyna różnicy z ANDES „pozostaje NIEUSTALONA" — po tej rundzie jest ustalona (sekcja M) | **P2-DOKUMENTACJA** | `backend/tests/network_model/dynamika/test_wyrocznia_andes.py` | jw. |
| F-3 | Brak zdarzenia „skok mocy mechanicznej" — lista zdarzeń jest zamknięta (zwarcie, zmiana gałęzi, odłączenie źródła, skok odbioru). Skutek: nie da się odwzorować regulacji pierwotnej ani przypadku §12 poz. B | **ZDOLNOŚĆ (brak)** | `backend/src/network_model/solvers/dynamika/kontrakty.py:215-263` | to decyzja zakresu produktu, nie defekt; wymaga decyzji właściciela |
| F-4 | Główny checkout `/home/user/MV-Design-PRO` ma 23 pliki starsze niż HEAD (46 wstawień, 2211 usunięć w `git diff HEAD`) — commit w nim skasowałby m.in. `W6_A_KONTRAKT_OBSERWABLI.md` | **P2-CHECKOUT** | checkout główny (nie worktree) | to checkout innej sesji; §1 zakazuje operacji na repo w fazie diagnostycznej |
| F-5 | `pytest_ignore_collect` po cichu pomija CAŁE drzewo testów poza `tests/proof_engine`, gdy brakuje `sqlalchemy`/`numpy`/`networkx` — bez skipa, bez błędu, bez ostrzeżenia | **P1-CI** (przeniesione z rundy 7, nadal otwarte) | `backend/tests/conftest.py:79-90` (zweryfikowane na HEAD `ad4629ae`) | zgłoszone w rundzie 7 i świadomie niezmienione; nadal czeka na decyzję |
| F-6 | Gałąź `main` i gałąź robocza mają `protected: false` — zielone CI jest OBSERWACJĄ, nie wymuszoną bramką | **P2-CI-GOVERNANCE** (przeniesione z rundy 7) | ustawienia repozytorium GitHub | zmiana ustawień repozytorium była jawnie wykluczona w rundzie 7 (§12 tamtego mandatu) |
| F-7 | Rdzeń DAE przyjmuje bezwładność H < 0 i liczy do końca (wynik niefizyczny: maszyna hamuje przy nadwyżce mocy mechanicznej); przy H = 0 odmowa jest surowym `ZeroDivisionError`, a nie odmową NAZWANĄ jak przy zwarciu metalicznym | **P2-ODMOWA** (na ścieżce użytkownika NIEOSIĄGALNE — kontrakt ENM wymusza `h_s: Field(gt=0.0, le=15.0)`) | rdzeń: `urzadzenia/maszyna_klasyczna.py:144`; bramka: `backend/src/enm/dynamika_modele.py:159` | §43 kończy rundę na raporcie; dowód pomiarowy w I.3 (L2a, L2b) |

### N.1 Znalezisko metodyczne dotyczące MOJEJ pracy w tej rundzie (§41 — uczciwość w obie strony)

W tej rundzie popełniłem i skorygowałem **dwa własne błędy**; oba są zapisane, bo
gdyby zostały niezauważone, prowadziłyby do fałszywych wniosków o produkcie:

1. **Błędne wyrównanie układu odniesienia w porównaniu z ANDES** — odejmowałem
   `phase(E_sys)` od jednej strony, co dawało pozorny stały błąd 4,012e−02 rad i przez
   chwilę wyglądało jak defekt mostka repozytorium. Korekta: sekcja G.1. Mostek
   w repozytorium jest poprawny; błędne było moje odtworzenie.
2. **Błędna interpretacja profilu różnicy** — pierwsze odczytanie brzmiało „błąd rodzi
   się na zdarzeniu". Test kontrolny bez żadnego zdarzenia (sekcja M, krok 4) tę tezę
   obalił. Korekta: sekcja G.5 i M.

Trzecia hipoteza (moment vs moc) została **obalona pomiarem, a nie porzucona** — sekcja M
krok 3. Zapisuję ją, bo hipoteza obalona z dowodem jest wynikiem, a nie porażką.

---
## O. WPŁYW OD-11 I OD-12 NA DZIEDZINĘ ZWALIDOWANĄ (§26, §27)

**Mandat zabrania rozstrzygania OD-11 i OD-12 — mam ustalić ich WPŁYW na dziedzinę.**
Nic tu nie jest decyzją; wszystko jest pomiarem. Skrypt: `e26_27_domena.py`.

### O.1 OD-11 — granice mocy biernej egzekwowane na iteracjach przejściowych (§26)

**Mechanizm sprzężenia z dynamiką.** Punkt pracy biegu czasowego NIE jest domysłem:
pochodzi z ZAKOŃCZONEGO biegu rozpływu na tej samej migawce
(`backend/src/enm/adapter_dynamiki.py:43-46`; funkcja `punkt_pracy_z_biegu_rozplywu`;
brak biegu rozpływu = nazwana odmowa, nie płaski start). **Wniosek strukturalny: błąd
rozpływu jest błędem WARUNKU POCZĄTKOWEGO równań różniczkowych.**

Zmierzony w repozytorium błąd rozpływu przy wiążących granicach Q wynosi **0,022 p.u.**
napięcia (`docs/evidence/CONVERGENCE_EVIDENCE.md:870`, IEEE case14 z granicami
z literatury). Propagacja tej liczby przez model dynamiczny:

| U_gen [p.u.] | odchyłka | δ₀ [°] | \|E′\| [p.u.] | K_s [p.u./rad] | f_d analit. [Hz] | f_d z produktu [Hz] | błąd produkt vs analiza |
|---|---|---|---|---|---|---|---|
| 1,028 | −0,022 | 25,659261 | 1,108498 | 1,507772 | 1,309224 | 1,309219 | 3,43e−06 |
| 1,050 | 0 | 24,683083 | 1,149429 | 1,571296 | 1,336519 | 1,336558 | 2,97e−05 |
| 1,072 | +0,022 | 23,775293 | 1,190622 | 1,634222 | 1,363018 | 1,363056 | 2,80e−05 |

**Skutek 0,022 p.u. błędu punktu pracy:**
* zmiana kąta początkowego do **0,976°**,
* zmiana SEM przejściowej do **3,58 %**,
* zmiana częstotliwości modu elektromechanicznego do **2,04 %**.

**Interpretacja (bez rozstrzygania OD-11):** solver dynamiki NIE jest tu wadliwy — przy
KAŻDYM z trzech punktów pracy odtwarza mod z błędem 3,4e−06…3,0e−05, czyli tak samo dobrze.
Punkt pracy jest jego WEJŚCIEM, a nie wynikiem, i jest dodatkowo weryfikowany residuum
algebry. **Konsekwencja dla dziedziny: sieć, w której granice Q wiążą na iteracjach
przejściowych rozpływu (a nie w rozwiązaniu zbieżnym), jest POZA DZIEDZINĄ ZWALIDOWANĄ**
— nie dlatego, że dynamika liczy źle, tylko dlatego, że startuje z innego punktu.
2 % błędu częstotliwości modu jest wielkością, która zmienia werdykt inżynierski
(np. margines tłumienia), więc nie wolno tego pominąć milczeniem.

### O.2 OD-12 — moc zwarciowa źródła sieciowego jako ZAŁOŻENIE (§27)

**Mechanizm sprzężenia z dynamiką.** Impedancja szyny sztywnej (warunku brzegowego biegu
czasowego) jest liczona z impedancji zastępczej źródła sieciowego, czyli **z S_k″**
(`adapter_dynamiki.py:1010-1039`: `z_ohm = _impedancja_zrodla_ohm(...)` z
`graph.get_grid_sc_sources()`, przeliczane bazą szyny przyłączenia). X_s wchodzi wprost
do X_T = X′d + X_L + X_s, a więc do K_s i do częstotliwości modu.

Bliźniaki rozpływowe w repozytorium używają **założonych** wartości 5000 / 20000 / 50000 MVA
(`CONVERGENCE_EVIDENCE.md:871`). Pomiar wrażliwości:

| S_k″ [MVA] | X_s [p.u.] | X_T [p.u.] | K_s [p.u./rad] | f_d analit. [Hz] | f_d z produktu [Hz] | błąd produkt vs analiza | zmiana f_d vs 2000 MVA |
|---|---|---|---|---|---|---|---|
| 1 000 | 0,100 | 0,700 | 1,426110 | 1,273276 | 1,273271 | 4,15e−06 | −4,73 % |
| 2 000 | 0,050 | 0,650 | 1,571296 | 1,336519 | 1,336558 | 2,97e−05 | 0 |
| 5 000 | 0,020 | 0,620 | 1,669647 | 1,377712 | 1,377748 | 2,61e−05 | +3,08 % |
| 20 000 | 0,005 | 0,605 | 1,722480 | 1,399340 | 1,399374 | 2,44e−05 | +4,70 % |
| 50 000 | 0,002 | 0,602 | 1,733363 | 1,403753 | 1,403750 | 2,51e−06 | +5,03 % |

**Rozpiętość częstotliwości modu między 1 000 a 50 000 MVA: 10,25 %.**

**Interpretacja (bez rozstrzygania OD-12):** błąd „produkt vs analiza" NIE zależy od S_k″
(2,5e−06…3,0e−05 w całym zakresie) — czyli **fizyka jest odtwarzana poprawnie dla każdej
z tych wartości**. Ale LICZBA wychodząca z biegu czasowego dziedziczy status danych
wejściowych: jeśli S_k″ jest założona, to częstotliwość modu, tłumienie i ROCOF też są
**ZAŁOŻENIEM**, a nie wynikiem pomiaru sieci. **Konsekwencja dla dziedziny: dziedzina
zwalidowana obejmuje sieć, której S_k″ jest DANA; bliźniak rozpływowy z wymyśloną S_k″
daje mod elektromechaniczny o statusie założenia** — poprawnie policzony, ale nie
wiarygodny jako liczba projektowa.

### O.3 Brak danych zwarciowych — odmowa, nie wartość domyślna

```
kod:     dynamika.zrodlo_bez_impedancji          (adapter_dynamiki.py:1013-1021)
treść:   „sieć nadrzędna o nieskończonej mocy zwarciowej nie ma skończonej admitancji,
          więc nie da się jej postawić jako warunku brzegowego biegu czasowego"
```

To jest ważne dla OD-12: **brak S_k″ nie wchodzi do biegu po cichu**. Albo jest dana
(wtedy liczby są danymi), albo jest założona (wtedy właściciel wie, że założył), albo
jej nie ma i bieg jest odmawiany nazwanym kodem. Trzeciej drogi — „domyślnej wartości
wstawionej milcząco" — w tym torze nie ma.

---
## P. DOWÓD CI (§36)

**Zastrzeżenie metodyczne (§28): zielone CI NIE podnosi poziomu dowodowego z sekcji Q.**
CI dowodzi, że repozytorium jest spójne i że ta runda niczego nie zepsuła — nie dowodzi
fizyki. Fizykę dowodzą sekcje E–M.

### P.1 GitHub Actions na FINALNYM HEAD `ad4629ae424d94954acb12daba0d617b70041fca`

**9 przepływów × 2 zdarzenia (push + pull_request) = 18 biegów, 18 × `success`, 0 × porażka.**

| Przepływ | push | pull_request |
|---|---|---|
| Python tests | success (run 35444709463) | success (run 35444712015) |
| Frontend checks | success (35444709508) | success (35444712022) |
| Frontend E2E smoke | success (35444709557) | success (35444711976) |
| Frontend E2E full | success (35444709525) | success (35444712042) |
| SLD Determinism Guards | success (35444709488) | success (35444712000) |
| Architectural And Repo Hygiene Guard | success (35444709461) | success (35444711984) |
| Docs Integrity Guard | success (35444709516) | success (35444711981) |
| P0 Extended Guards (V12K invariants) | success (35444709543) | success (35444711997) |
| Physics Label Guard (Catalog-First) | success (35444709560) | success (35444711977) |

### P.2 Rozbicie na ZADANIA (§36 wymaga „wg przepływu ORAZ zadania")

`Python tests`, bieg 35444709463 — 4 zadania, wszystkie `success`:

| Zadanie | Wynik | Czas | Co uruchamia |
|---|---|---|---|
| `pytest` | success | 13:05:38 → 13:28:34 | `pytest -q -m "not pandapower and not andes"` + testy guardów + audit2 + **28 guardów** + Mypy Ratchet + black/ruff |
| `Pandapower cross-validation (izolowany venv, scipy<1.17)` | success | 13:05:37 → 13:07:49 | `pytest -q -m pandapower tests` |
| `Wyrocznia dynamiki ANDES (izolowany venv)` | success | 13:05:40 → 13:08:43 | `pytest -q -m andes tests` |
| `Dialekt produkcyjny (PostgreSQL 16)` | success | 13:05:46 → 13:05:59 | testy atomowości przejęcia biegu na PostgreSQL |

Trzy zestawy markerów wymagane przez §36 (`not pandapower and not andes`, `pandapower`,
`andes`) biegną w **izolowanych środowiskach**, bo `pandapower<3.6` wymaga `scipy<1.17`,
a produkt jest przypięty do 1.17.0. Izolacja jest własnością konstrukcji przepływu,
nie obejściem.

### P.3 Bramki lokalne na tym samym HEAD (worktree `fable-f6`, drzewo czyste)

| Bramka | Wynik |
|---|---|
| `npm run type-check` (tsc --noEmit) | **RC = 0** |
| `npm run lint` (eslint, `--max-warnings 0`) | **RC = 0** |
| `npm run test:ci` (vitest) | **RC = 0 — 894 plików, 12 548 testów przeszło, 14 todo**, czas 2077 s |

### P.4 Ograniczenie ważności tej sekcji (§41, powtórzone z rundy 7)

Gałąź `main` i gałąź robocza mają w ustawieniach repozytorium `protected: false`.
**18/18 zielonych biegów jest więc OBSERWACJĄ STANU, a nie wymuszoną bramką** — nic
technicznie nie blokuje scalenia przy czerwonym CI. To znalezisko F-6 z sekcji N,
przeniesione z rundy 7 i nadal otwarte. Podaję je tutaj, żeby tabela P.1 nie była
czytana jako gwarancja procesu, którą nie jest.

---
## Q. MACIERZ ZDOLNOŚCI I POZIOMÓW DOWODOWYCH (§28, §29, §40)

### Q.1 Skala poziomów dowodowych użyta w tej rundzie (§28)

Kotwicą jest definicja z mandatu: **L5 = benchmark analityczny + niezależna wyrocznia +
zabita mutacja**. Pozostałe poziomy są jej monotonicznym rozwinięciem:

| Poziom | Znaczenie |
|---|---|
| L0 | deklaracja bez pomiaru |
| L1 | równanie odczytane z kodu, brak pomiaru |
| L2 | test w repozytorium (własny, nie niezależny) |
| L3 | pomiar wobec własnej wyroczni / goldenu (spójność wewnętrzna) |
| L4 | pomiar wobec NIEZALEŻNEJ wyroczni **albo** benchmark ANALITYCZNY |
| L5 | benchmark analityczny **i** niezależna wyrocznia **i** zabita mutacja |

**Zielone CI nigdy nie podnosi poziomu** (§28) — CI jest w tej macierzy nieobecne jako
argument dowodowy; jego rola jest opisana w sekcji P.

### Q.2 Macierz per zdolność (§29)

| Zdolność | Równanie z kodu | Jednostki / bazy | Niezmiennik | Benchmark analityczny | Wyrocznia zewn. | Zbieżność | Zabita mutacja | Poziom | Status |
|---|---|---|---|---|---|---|---|---|---|
| Równanie ruchu (swing) | D.1 | D.2 | I (energia) | F.1 (mod), F.3 (CCT) | G (8 przyp.) | H (p = 2,000) | M1, M3 | **L5** | ZWALIDOWANE |
| Pulsacja bazowa ω₀ = 2πf | D.1 | D.2 (5 miejsc) | — | F.1 | G | — | M5 | **L5** | ZWALIDOWANE |
| Człon tłumienia D·Δω | D.1 | D.2 | I (energia malejąca) | F.1 (σ = D/4H) | G (D = 0/2/4) | — | M4 | **L5** | ZWALIDOWANE |
| Moc elektryczna P_e = Re(E·I*) | D.1 | D.2 | K.6 (bilans mocy) | F.1 (K_s) | G, M krok 2 | H | M2 | **L5** | ZWALIDOWANE |
| Algebra sieci g = Y·V − I | D.1 | D.2 | E.2 (res 8,9e−16) | F.3 | M krok 2 (1e−08) | H | M8 | **L5** | ZWALIDOWANE |
| Szyna sztywna (warunek brzegowy) | D.1 | D.2 | E.1 | F.1 (X_T w K_s) | G | — | M8 | **L5** | ZWALIDOWANE |
| Przeliczenia baz (H, Z, moce) | D.2 | D.2 | — | L.3 (G6: mod po przeliczeniu) | — | — | M7, M9 | **L4** | ZWALIDOWANE (brak odrębnej wyroczni zewn. dla samego przelicznika) |
| Warunek początkowy z punktu pracy | D.1 | D.2 | E.2 (f = 3,2e−17) | E.1 (bit w bit) | G (δ₀ do 1,3e−08) | — | — | **L4** | ZWALIDOWANE |
| Trapez niejawny, rząd 2 | D.4 | — | F.2 (całka pierwsza) | H (p = 2,000) | H | H | — | **L4** | ZWALIDOWANE |
| Chwila zdarzenia (punkt obowiązkowy) | D.4 | — | J.1 (błąd 0,0) | J.1 | G (8 przyp.) | — | M6 | **L5** | ZWALIDOWANE |
| Ciągłość stanów / skok algebry | D.3 | — | J.2 (Δx = 0, KCL 1,6e−15) | J.2 | G | — | — | **L4** | ZWALIDOWANE |
| Zwarcie węzłowe (bocznik) | D.3 | D.2 (Z_b) | J.2 | F.3 (CCT) | G (B, C, D, E, G) | H | M8 | **L5** | ZWALIDOWANE |
| Zmiana gałęzi (wyłączenie toru) | D.3 | — | J.2 | — | **G (przyp. H — nowy)** | — | — | **L4** | ZWALIDOWANE |
| Skok odbioru (stała moc) | D.3 | — | K.5 (symetria) | K.4 (liniowość) | **G (przyp. F — nowy)** | — | — | **L4** | ZWALIDOWANE |
| ROCOF wirnika | D.1 | D.2, K.1 | K.6 | K.3 (1/H), K.4 (1/2H) | K.2 (droga C) | — | M1, M3 | **L5** | ZWALIDOWANE |
| Częstotliwość węzła (z fazora) | D.2 | K.1 | K.1 (50,0 Hz przy δ̇ = 0) | — | — | — | — | **L2** | CZĘŚCIOWE — brak benchmarku analitycznego dla samej obserwabli |
| Odmowa: zwarcie metaliczne | D.3 | — | I.3 (L10) | — | — | — | — | **L2** | ZWALIDOWANE (odmowa nazwana) |
| Odmowa: brak impedancji źródła | O | — | O | — | — | — | — | **L2** | ZWALIDOWANE (odmowa nazwana) |
| Skok mocy mechanicznej | — | — | — | — | — | — | — | **L0** | **BRAK ZDOLNOŚCI** (F-3) |

### Q.3 Format twierdzeń (§40)

Każde twierdzenie w sekcjach E–M ma komplet: RÓWNANIE (sekcja D), PLIK:LINIA (sekcja D),
KOMENDĘ (nazwa skryptu przy każdej sekcji), WYJŚCIE (liczby w tabelach), NIEZALEŻNĄ
KONTROLĘ (wyrocznia bez importu produktu / postać analityczna / mutacja) i WERDYKT.
Twierdzenia bez kompletu są w tym dokumencie oznaczone jako CZĘŚCIOWE albo BRAK —
nie ma twierdzeń „ogólnych".

---
## R. OŚWIADCZENIE KOŃCOWE (§37, §38, §43)

### R.1 Rozliczenie wymagań mandatu — paragraf po paragrafie

Nie odtwarzam z pamięci „listy 17 warunków"; rozliczam się z wymagań tak, jak są
ponumerowane w mandacie (§3–§36). Każdy wiersz ma sekcję z dowodem.

| § | Wymaganie | Sekcja | Werdykt |
|---|---|---|---|
| §3 | Odtworzenie równań z kodu (x, y, p, u, f, g) z file:line | D.1 | **SPEŁNIONE** |
| §4 | Audyt wymiarowy i baz (Hz↔rad/s, °↔rad, MW↔p.u., H w s) | D.2 | **SPEŁNIONE** — 5 miejsc konwersji, wszystkie poprawne |
| §5 | Stan ustalony f = 0, g = 0; dryf bez zakłócenia; drabina kroku | E | **SPEŁNIONE** — dryf 0,0 dokładnie przy 4 krokach |
| §6 | Benchmark analityczny 1: linearyzacja SMIB, K_s, ω_n, ζ | F.1 | **SPEŁNIONE** — błąd 9,5e−06…1,8e−05 |
| §7 | Benchmark analityczny 2: bilans energii | F.2 | **SPEŁNIONE** — dryf 2,0e−10; przy D > 0 zero przyrostów dodatnich |
| §8 | Eksperyment H (H, 2H, 4H) z przewidywaniem analitycznym | K.3 | **SPEŁNIONE** — ilorazy 1,00 / 0,50 / 0,25 |
| §9 | Liniowość ΔP | K.4 | **SPEŁNIONE** — ROCOF/ΔP = 1/(2H) na zakresie 10× |
| §10 | Symetria znaku ±ΔP | K.5 | **SPEŁNIONE** — asymetria 1,26e−03, wyjaśniona fizycznie |
| §11 | Przemiatanie D: wartości własne, obwiednia, brak przesunięcia częstotliwości | F.1 | **SPEŁNIONE** — σ = D/(4H) do 2,4e−05 |
| §12 | Wyrocznia ANDES ≥ 7 przypadków | G.3 | **SPEŁNIONE** — 8 przypadków; 1 (skok P_m) NIEPOROWNYWALNY z braku zdolności produktu |
| §13 | Zakaz strojenia wyroczni; udokumentowanie równoważności | G.2 | **SPEŁNIONE** — 3 równoważności udokumentowane, żadna nie dobierana pod wynik |
| §14 | Druga niezależna wyrocznia; skrypt bez importu solvera | wyrocznia.py, F | **SPEŁNIONE** — benchmark analityczny + ANDES; wyrocznia nie importuje produktu |
| §15 | Zbieżność h/h2/h4/h8, rząd empiryczny vs teoretyczny | H | **SPEŁNIONE** — p = 2,000 (iloraz 4,000 ×3) |
| §16 | Dokładność chwili zdarzenia (4 konfiguracje) | J.1 | **SPEŁNIONE** — błąd 0,0 we wszystkich |
| §17 | Co może skakać przy zwarciu, a co nie | J.2 | **SPEŁNIONE** — Δx = 0, Δy = 0,469, KCL 1,6e−15 |
| §18 | Kryterium równych pól / CCT | F.3 | **SPEŁNIONE** — błąd względny 7,63e−06, poniżej rozdzielczości bisekcji |
| §19 | Relacje ω/Δω/f/Δf/ROCOF udowodnione z kodu | D.2, K.1 | **SPEŁNIONE** |
| §20 | ROCOF trzema drogami; metryka filtrowana oddzielona | K.2 | **SPEŁNIONE** — A vs C = 3,18e−16 |
| §21 | Residuum bilansu mocy raportowane osobno od residuum Newtona | K.6 | **SPEŁNIONE** — 2,94e−07 vs 3,94e−12, podane osobno |
| §22 | Czułości monotoniczne i ilościowe | I.2 | **SPEŁNIONE** (szczegóły w I.2) |
| §23 | Granice modelu: brak NaN/Inf/cichego obcięcia albo jawna odmowa | I.3 | **SPEŁNIONE** (szczegóły w I.3) |
| §24 | Obowiązkowe mutacje fizyki | L | **SPEŁNIONE** — 9/9 zabitych; jedna luka wykryta i zamknięta |
| §25 | ZERO GOLDEN WASHING | — | **SPEŁNIONE** — żaden golden nie został zregenerowany ani dotknięty |
| §26 | OD-11: wpływ na dziedzinę (bez rozstrzygania) | O.1 | **SPEŁNIONE** |
| §27 | OD-12: wpływ na dziedzinę (bez rozstrzygania) | O.2 | **SPEŁNIONE** |
| §28 | Poziomy dowodowe L0–L5; CI nie podnosi poziomu | Q.1 | **SPEŁNIONE** |
| §29 | Macierz walidacyjna per zdolność | Q.2 | **SPEŁNIONE** |
| §30 | Tolerancje z góry, nie po wyniku | E, H, L.1 | **SPEŁNIONE** |
| §31/§32 | Statystyki błędu; dla oscylacji amplituda/faza/częstotliwość | G.3, G.4 | **SPEŁNIONE** |
| §33 | Przyczyna podłogi ~1e−4 rad USTALONA (zakaz „prawdopodobnie numeryka") | M | **SPEŁNIONE** — przesunięcie osi czasu ANDES, dowód w 5 krokach |
| §34 | Pierwsza rozbieżność: czas, stan, równanie | G.5, M | **SPEŁNIONE** |
| §35 | Porównanie jednego kroku: model vs integrator/zdarzenie | M krok 2 | **SPEŁNIONE** — algebra zgodna do 1e−08, co tłumaczy 5,7e−09 z 1,33e−04 |
| §36 | Pełne bramki projektu + GitHub Actions wg przepływu i zadania | P | **SPEŁNIONE** |

### R.2 Werdykt

**W6-F = ZWALIDOWANE FIZYCZNIE w dziedzinie z sekcji C, na poziomie dowodowym L5
dla rdzenia elektromechanicznego.**

Nie używam sformułowania „w większości zwalidowane" (§37 tego zabrania). Tam, gdzie
dowód jest słabszy, stoi to jawnie w macierzy Q.2 jako poziom L2/L4 albo **BRAK ZDOLNOŚCI**,
a nie jako miękki werdykt globalny (§38: werdykty cząstkowe są lepsze od fałszywego
werdyktu całościowego).

**Trzy rzeczy, których ten werdykt NIE mówi:**

1. Nie mówi, że dynamika jest zwalidowana „w ogóle" — mówi, że jest zwalidowana dla
   modelu klasycznego + szyny sztywnej + sieci o stałej admitancji + odbioru o stałej
   mocy, w zmierzonych zakresach H, D, X i zaburzeń (sekcja C).
2. Nie mówi, że liczby biegu czasowego są wiarygodne niezależnie od danych wejściowych —
   przy założonej mocy zwarciowej źródła (OD-12) mod elektromechaniczny dziedziczy
   status ZAŁOŻENIA (sekcja O.2).
3. Nie mówi, że zgodność z ANDES jest miarą jakości — po ustaleniu przyczyny (sekcja M)
   ta zgodność mierzy głównie stemplowanie czasu w ANDES, a nie fizykę produktu.

### R.3 Czego NIE zrobiono w tej rundzie (§1, §43)

* **Nie naprawiono żadnego znaleziska** z sekcji N — ani F-1 (ślepy punkt baz w testach),
  ani F-2 (nieaktualny docstring), ani F-4 (checkout), ani przeniesionych F-5/F-6.
* **Nie rozstrzygnięto OD-11 ani OD-12** — zmierzono tylko ich wpływ na dziedzinę (§26/§27).
* **Nie zmieniono ani jednej linii solvera**; drzewo robocze jest czyste na każdym etapie.
* **Nie zregenerowano żadnego goldenu** (§25).
* **Nie wykonano merge ani rebase** (§1).

**STOP po raporcie (§43).** Kolejny krok — decyzja właściciela: które ze znalezisk F-1…F-6
wchodzi do naprawy, czy otwierać fazę naprawczą i czy rozstrzygać OD-11/OD-12.

---
