# RUNDA 9 — NIEZALEŻNY AUDYT PROFESORSKI PO W6-F

> **Tryb:** WERYFIKUJ → ODTWÓRZ → FALSYFIKUJ → WYJAŚNIJ → ROZSTRZYGNIJ.
> Nie zakładałem, że deklaracja L5 jest prawdziwa. Nie zakładałem, że jest fałszywa.
> Każde twierdzenie poniżej ma pomiar wykonany w TEJ rundzie albo jest oznaczone jako
> przeniesione z W6-F i **niezależnie odtworzone**.

---
## A. HEAD KOŃCOWY (§3)

| Rzecz | Wartość | Jak sprawdzone |
|---|---|---|
| HEAD gałęzi `claude/mv-design-pro-twin-audit-u4lhy0` | `e6c4c7152f63f2d67adf4c17217ecf9fbfae7507` | `git rev-parse HEAD` |
| HEAD raportu W6-F | `e6c4c7152f63f2d67adf4c17217ecf9fbfae7507` | `git log --oneline -1 e6c4c715` |
| HEAD eksperymentu (ta runda) | `e6c4c7152f63f2d67adf4c17217ecf9fbfae7507` | drzewo robocze czyste: `git status --porcelain` = pusty |
| Różnice między trzema | **BRAK — to jeden i ten sam commit** | jw. |

**Konsekwencja:** pytanie §3 o rozjazd HEAD-ów jest w tej rundzie puste. Wszystkie
eksperymenty tej rundy biegły na DOKŁADNIE tym drzewie, którego dotyczy raport W6-F.

**Zmiany wprowadzone przeze mnie w drzewie produktu w tej rundzie: ZERO.**
Cały aparat (wyrocznia, stanowisko, bramki, mutatory) mieszka poza repozytorium,
w katalogu roboczym sesji. Mutacje są nakładane i **przywracane w `finally`**, a
przywrócenie jest weryfikowane ponownym przebiegiem obu wyroczni.


---
## B. WERDYKT WYKONAWCZY

**Deklaracja L5 dla RÓWNANIA RUCHU jest prawdziwa i wytrzymała niezależną próbę falsyfikacji.**
Nie znalazłem w raporcie W6-F ani jednego twierdzenia nieprawdziwego. Znalazłem natomiast
trzy rzeczy, których W6-F nie miał: **ostrzejszy opis przyczyny różnicy z ANDES (dwa reżimy
zamiast jednego, ze źródłem stałej w kodzie ANDES)**, **zaniżony poziom częstotliwości
węzłowej (L2 zamiast poziomu wynikającego z dowodów)** oraz **nowy defekt poza deklarowaną
dziedziną (F-8, wyspa bierna → wyjątek nienazwany)**.

### B.1 Trzy zdania, które wolno napisać po tej rundzie

1. Rdzeń dynamiki odtwarza fizykę maszyny klasycznej w dziedzinie C.1 z rzędem zbieżności
   **2,000** (iloraz 4,0000 dziewięciokrotnie), zerowym błędem chwili zdarzenia
   (**0,0 dokładnie w 12/12**) i marginesem 2,6 dekady nad podłogą wyroczni.
2. Częstotliwość węzłowa jest **tożsamością**, nie estymatą: opublikowane `f_hz` zgadza się
   z DOKŁADNĄ pochodną analityczną do **7,105e−15 Hz = 1 ulp(50 Hz)** — czyli do granicy
   reprezentacji liczby.
3. Różnica z ANDES **nie jest błędem fizyki żadnej ze stron**: to dwa przesunięcia osi czasu
   o zmierzonych i wyprowadzonych prawach (−dt/2 bez zdarzenia; +eps/2 = +5,0e−05 s ze
   zdarzeniem, gdzie `eps = 1e-4` pochodzi z `andes/system.py::store_switch_times`).

### B.2 Zdanie, którego pisać NIE wolno

> „Dynamika jest zwalidowana."

Zwalidowana jest **dziedzina C.1**. Poza nią leżą: wyspa bierna (F-8), skok mocy mechanicznej
(F-3), sieć z wiążącymi granicami Q (OD-11), sieć z założoną S_k″ (OD-12), H ≤ 0 (F-7).

### B.3 Uczciwość co do MOJEJ pracy — cztery własne błędy w tej rundzie

§0 każe falsyfikować, nie potwierdzać. Falsyfikowałem też siebie i **cztery razy trafiłem
we własny błąd, nie w defekt produktu**. Zapisuję wszystkie, bo każdy z nich — niezauważony —
dałby fałszywe oskarżenie produktu albo fałszywą pewność:

| # | mój błąd | co by z niego wynikło | jak wykryty |
|---|---|---|---|
| 1 | oczekiwanie `f_SYS ≡ 50` (mylenie węzła sieciowego z węzłem SEM) | fałszywy defekt osi odniesienia | test skalowania ∝ X_s (I.5) |
| 2 | wniosek „próbkowanie lewostronne" z udziału NIEROZRÓŻNIALNA | fałszywa teza o semantyce zdarzeń | przy `t_f` jest ω = 1, więc f = 50 przy OBU konwencjach (K.6) |
| 3 | `pytest` bez `-m "not andes"` w środowisku bez ANDES | fałszywy „czerwony zestaw repo" | marker `pytestmark = pytest.mark.andes` w pliku (R.2) |
| 4 | test NaN/Inf, który tylko BUDOWAŁ maszynę, nie uruchamiał biegu | **fałszywy P1: „NaN nie jest odrzucany"** | bieg przez silnik daje `dynamika.wartosc_nieskonczona` |
| 5 | uruchomienie a5 RÓWNOLEGLE z mutatorem | wynik liczony na zmutowanym rdzeniu | `‖f‖ = 0,2286 = 2·P_m/(2H)` — podpis odwróconego znaku P_e |

Dodatkowo **obaliłem własną predykcję a priori** (τ/dt = −0,5 dla scenariuszy ze zdarzeniem):
pomiar dał τ stałe w sekundach i iloraz błędu 1,000 zamiast 2 (H.5).


---
## C. DZIEDZINA WAŻNOŚCI PO TEJ RUNDZIE

Dziedzina jest **węższa niż „dynamika"** i szersza niż deklarowała W6-F w jednym miejscu
(częstotliwość węzłowa). Zapisuję ją tak, żeby dało się ją sfalsyfikować.

### C.1 W dziedzinie — zwalidowane pomiarem w tej rundzie

| obszar | zakres potwierdzony |
|---|---|
| maszyna | klasyczna II rzędu (stałe `P_m`, `\|E′\|`), H ∈ {3,5; 7} s, D ∈ {0; 2; 4} p.u., baza urządzenia ≠ baza układu (G6) |
| sieć | SMIB i wyspa 2-węzłowa; szyna sztywna za skończoną X_s; odbiór o stałej mocy |
| zdarzenia | zwarcie węzłowe (zdejmowane i trwałe), zmiana gałęzi, skok odbioru — **każde z wyrocznią zewnętrzną** |
| całkowanie | trapez niejawny, dt ∈ [1,25e−4; 1e−3], tol. Newtona ∈ [1e−13; 1e−9] |
| obserwable | δ, ω, `f_hz` węzłowe, `u_f_est`, `jakosc_f`, ROCOF wirnika i szyny |
| zapad | do \|U\| = 0,0157 p.u. bez odbioru; do \|U\| ≈ 0,20 p.u. z odbiorem o stałej mocy (dalej ODMOWA) |

### C.2 POZA dziedziną — z podaniem powodu

| obszar | powód | dowód |
|---|---|---|
| **wyspa BIERNA** (odbiór odcięty od wszystkich źródeł) | `OverflowError` nienazwany zamiast odmowy | F-8, sekcja N.1 |
| skok mocy mechanicznej / regulacja pierwotna | zdolność nie istnieje (lista zdarzeń zamknięta) | F-3 |
| sieć z wiążącymi granicami Q na iteracjach przejściowych rozpływu | błąd warunku początkowego 0,022 p.u. → 4,02 % na `f_d` | OD-11, sekcja L |
| sieć z **założoną** S_k″ | liczba dziedziczy status danych wejściowych (rozpiętość 10,25 %) | OD-12, sekcja M |
| H ≤ 0 w rdzeniu | przyjmowane bez odmowy; nieosiągalne przez kontrakt ENM | F-7 |
| modele wyższego rzędu, regulatory, nasycenie | nie zaimplementowane | zakres W6-2/W6-3 |

### C.3 Zdanie, które wolno napisać

> Dla maszyny klasycznej w układzie SMIB albo w wyspie z jednym źródłem, przy zdarzeniach
> z listy C.1 i danym (nie założonym) punkcie pracy oraz danej S_k″, rdzeń dynamiki odtwarza
> fizykę zgodnie z niezależnymi wyroczniami analitycznymi i zewnętrznymi, z rzędem zbieżności
> 2,000 i zerowym błędem chwili zdarzenia.

Zdanie „dynamika jest zwalidowana" **pozostaje niedozwolone**.


---
## D. NIEZALEŻNE ODTWORZENIE W6-F (§4 podstawa)

§0 zabrania zarówno przyjęcia, jak i odrzucenia deklaracji W6-F bez dowodu. Odtworzyłem
niezależnie te twierdzenia W6-F, które są nośne dla werdyktu, i podaję wynik odtworzenia:

| twierdzenie W6-F | moje odtworzenie | wynik |
|---|---|---|
| Mod elektromechaniczny, błąd 9,5e−06…1,8e−05 | bramka G2 na tym samym HEAD | **PASS** (próg a priori 1,0e−03) |
| Tłumienie σ = D/(4H), błąd 8,4e−05 | bramka G4 | **PASS** (próg 1,0e−02) |
| Dryf stanu ustalonego = 0,0 | bramka G1 | **PASS** (próg 1e−09) |
| ROCOF z równania ruchu vs algebra | bramka G3 | **PASS** (próg 1e−09) |
| Chwila zdarzenia, błąd 0,0 | bramka G5 + macierz §20 | **0,0 DOKŁADNIE w 12/12 kombinacjach** |
| Przelicznik baz (G6, H = 3,5 s po przeliczeniu z 50 MVA) | bramka G6 | **PASS** |
| Rząd zbieżności p = 2,000 | macierz §20, 4 kroki × 3 tolerancje | **iloraz 4,0000 dziewięciokrotnie** |
| CCT, błąd względny 7,63e−06 | własna bisekcja + własna wyrocznia EAC | **2,92e−06**, poniżej rozdzielczości bisekcji |
| Propagacja OD-11 (δ₀, \|E′\|, K_s, f_d) | własne wyprowadzenie `math`/`cmath` | **zgodność co do cyfry** |
| Propagacja OD-12 (rozpiętość 10,25 %) | jw. | **zgodność co do drugiego miejsca** |
| „Zero regeneracji goldenów" | kryminalistyka git (sekcja P) | **potwierdzone strukturalnie** |
| CI zielone | GitHub Actions na `e6c4c715` | **9/9 przepływów `success`** |

**Nie znalazłem w W6-F ani jednego twierdzenia, które okazałoby się nieprawdziwe.**
Znalazłem natomiast **trzy miejsca do uściślenia** (nie do korekty): H.2/H.5 (dwa reżimy
przesunięcia zamiast jednego, ze źródłem stałej), L.2 (rozpiętość obustronna 4,02 % obok
jednostronnych 2,04 %), oraz S (częstotliwość węzłowa zaniżona do L2).

---
## E. DOWÓD RÓWNANIA RUCHU (§5)

### E.1 Odtworzenie z kodu, nie z pamięci

`urzadzenia/maszyna_klasyczna.py:133-149`:
```python
odchylka_predkosci = float(stan[INDEKS_OMEGA]) - 1.0
moc_elektryczna = self.moc_elektryczna_pu(stan, napiecie_pu)
return np.array([
    self.omega_bazowa_rad_s * odchylka_predkosci,
    (float(stan[INDEKS_MOCY_MECHANICZNEJ]) - moc_elektryczna
     - self.d_pu * odchylka_predkosci) / (2.0 * self.h_s),
    0.0, 0.0], dtype=float)
```
czyli
```
dδ/dt = ω₀·(ω − 1)                      [rad/s]
dω/dt = (P_m − P_e − D·(ω−1)) / (2H)    [1/s]
```
z `ω₀ = 2πf` (`konwencje.py:36-38`, JEDYNY producent tej wielkości),
`P_e = Re(E·conj(I))` (`:129-133`), `E = |E′|·e^{jδ}` (`:110`).
To jest **kanoniczna postać MOCOWA** równania kołysania maszyny klasycznej.

**Stan ma cztery składowe, dwie o zerowej pochodnej:** `P_m` i `|E′|` są STAŁYMI STANU.
To jest definicja modelu klasycznego (stała moc mechaniczna, stały strumień za reaktancją
przejściową) — i **wyjaśnia F-3**: „skok mocy mechanicznej" nie istnieje nie dlatego, że
równanie go nie dopuszcza, tylko dlatego, że żadne zdarzenie nie zapisuje `stan[2]`.

### E.2 Audyt wymiarowy
`[dδ/dt] = rad/s` ✔ (ω₀ w rad/s, ω bezwymiarowe) · `[dω/dt] = pu/s` ✔ (moc pu, H w s).
Kierunki zmiany bazy są **przeciwne i rozdzielone na dwie funkcje**:
`zmiana_bazy_impedancji: z·S_ukł/S_urz` vs `zmiana_bazy_stalej_bezwladnosci: H·S_urz/S_ukł`
(`konwencje.py:52-87`), z jawnym docstringiem, dlaczego to MUSZĄ być osobne funkcje.

### E.3 Eksperymenty wykrywające pięć klas błędu (§5)

| klasa błędu §5 | mutacja | wynik |
|---|---|---|
| brak dwójki w 2H | M10 (≡ M3) | sekcja O |
| zły znak P_e | M11 (≡ M2) | sekcja O |
| zły znak D | **M12 (nowa)** | sekcja O |
| brak ω₀ | M13 (≡ M1) | sekcja O |
| zła baza H | M14 / F1a (≡ M7) | sekcja O |


---
## F. DOWÓD ENERGETYCZNY — Z CELOWYM ZEPSUCIEM (§7)

§7 nie pyta „czy produkt przechodzi test energii", tylko „czy ten test **potrafi odróżnić**
poprawną fizykę od zepsutej". Bez tego drugiego test jest ozdobą.

### F.1 Funkcja energii i jej własność

Dla `M = 2H/ω₀`:
```
V(δ, δ̇) = ½·M·δ̇² + ∫_{δ₀}^{δ} (P_e(s) − P_m) ds
dV/dt = δ̇·[M·δ̈ + P_e − P_m] = −(D/ω₀)·δ̇²  ≤ 0
```
⇒ **D = 0: V jest CAŁKĄ PIERWSZĄ (stałą). D > 0: V nierosnące.**
Progi: `D = 0` → dryf względny ≤ 1e−6; `D > 0` → największy **przyrost** ≤ 1e−9.

### F.2 Trajektorie PRODUKTU (okno po usunięciu zwarcia, sieć pozwarciowa)

| D [p.u.] | kryterium | zmierzone | wynik |
|---|---|---|---|
| 0,0 | \|V_kon − V_pocz\|/skala ≤ 1e−6 | **3,820e−09** | **ZIELONY** |
| 2,0 | największy przyrost V/skala ≤ 1e−9 | **−4,464e−13** | **ZIELONY** |

Przy D = 2 największy przyrost jest **ujemny** — czyli w całym przebiegu **nie ma ani jednego
przyrostu dodatniego**. Energia maleje monotonicznie, dokładnie jak każe `dV/dt ≤ 0`.

### F.3 MOC ROZRÓŻNIAJĄCA — celowe zepsucie trzech rzeczy

Psuję **prawą stronę równania w MOIM WŁASNYM całkowaniu** (nie w produkcie), zostawiając
funkcję energii POPRAWNĄ. Jeśli test ma moc rozróżniającą, musi zaczerwienić:

| przypadek | oczekiwanie | wynik | zgodne |
|---|---|---|---|
| KONTROLA bez zepsucia, D = 0 | ZIELONY | **ZIELONY** | ✔ |
| KONTROLA bez zepsucia, D = 2 | ZIELONY | **ZIELONY** | ✔ |
| **znak D odwrócony** (tłumienie ujemne) | CZERWONY | **CZERWONY** | ✔ |
| **znak P_e odwrócony** | CZERWONY | **CZERWONY** | ✔ |
| **2H zastąpione przez H** | CZERWONY | **CZERWONY** | ✔ |

**5/5 zgodnych z oczekiwaniem ⇒ test energii MA moc rozróżniającą.**

To zamyka wymaganie §7 w obie strony: produkt przechodzi test, **i** test potrafi nie
przepuścić trzech niezależnych klas zepsucia fizyki. Bez F.3 wynik F.2 byłby tylko
deklaracją, że „wyszło zielone".


---
## G. DOWÓD CCT — PRZELICZONY OD ZERA (§6)

### G.1 Niezależność wyroczni — rozstrzygnięta jawnie

§6 ostrzega, że CCT nie jest dowodem niezależnym, jeśli wyrocznia dzieli kod z produktem.
Dlatego:

* **UŻYTE:** `wyrocznia.py` — importuje wyłącznie `cmath`, `math`, `dataclasses`, `numpy`,
  `scipy.integrate` / `scipy.optimize`. **Zero importów z produktu.**
* **ŚWIADOMIE NIEUŻYTE:** `network_model/solvers/dynamika/walidacja/rowne_pola.py` — wyrocznia
  kryterium równych pól mieszkająca **W PRODUKCIE**. Dzieli z nim drzewo, więc **nie jest**
  dowodem niezależnym i nie wchodzi do tej sekcji.
* **Liczba 0,63448405 z W6-F nie była wejściem** — pojawia się dopiero w porównaniu G.4.

### G.2 CCT z wyroczni — dwie metody, ta sama odpowiedź

Kąt krytyczny z kryterium równych pól na RZECZYWISTYCH krzywych `P_e(δ)` (kwadratura, nie
postać zamknięta — bocznik zwarcia psuje czysty sinus), potem czas dojścia po trajektorii
zwarciowej:

| wielkość | wartość |
|---|---|
| δ₀ | 0,43080107103566123 rad |
| δ_c (kąt krytyczny) | 2,201101609535463 rad |
| δ_u (równowaga niestabilna) | 2,6305375384332312 rad |
| **CCT (DOP853, rtol 1e−13)** | **0,6344840466792927 s** |
| **CCT (Radau, rtol 1e−12)** | **0,6344840466792587 s** |
| **rozbieżność metod** | **3,40e−14 s** |

Dwie różne metody całkowania o różnych tolerancjach zgadzają się do **14. cyfry** — to jest
podłoga błędu samej wyroczni.

### G.3 CCT produktu — przemiatanie trzech nastaw numerycznych

Bisekcja po czasie trwania zwarcia; kryterium stabilności `max(δ) ≤ δ_u` (dla D = 0 i układu
bezstratnego **dokładne**, nie przybliżone). Przedział startowy otacza **moją** wyrocznię.

| dt [s] | tol. Newtona | tol. bisekcji | CCT produktu [s] | błąd wzgl. vs wyrocznia | poniżej rozdz. bisekcji |
|---|---|---|---|---|---|
| 2,50e−04 | 1e−11 | 1e−05 | **0,634479164** | 7,696e−06 | TAK |
| 1,25e−04 | 1e−11 | 1e−05 | **0,634479164** | 7,696e−06 | TAK |
| 5,00e−04 | 1e−11 | 1e−05 | **0,634479164** | 7,696e−06 | TAK |
| 2,50e−04 | 1e−09 | 1e−05 | **0,634479164** | 7,696e−06 | TAK |
| 2,50e−04 | 1e−13 | 1e−05 | **0,634479164** | 7,696e−06 | TAK |
| 2,50e−04 | 1e−11 | 1e−04 | 0,634444984 | 6,157e−05 | TAK |
| 2,50e−04 | 1e−11 | 1e−06 | 0,634483742 | 4,810e−07 | **NIE** |

### G.4 Co z tego wynika

1. **CCT produktu jest NIEZALEŻNE od kroku i od tolerancji Newtona.** Pięć konfiguracji
   różniących się krokiem 4× i tolerancją Newtona o cztery rzędy dało **identyczną liczbę
   do dziewiątej cyfry**. Cały rozrzut 3,88e−05 s pochodzi **wyłącznie** z tolerancji
   bisekcji — czyli z mojego przyrządu pomiarowego, nie z produktu.
2. **Przy najostrzejszej bisekcji (1e−06) błąd 4,81e−07 s przestaje mieścić się w
   rozdzielczości bisekcji.** To jest uczciwa granica: ujawnia się własny błąd całkowania
   produktu rzędu O(dt²). Zapisuję to jako pomiar, a nie jako wadę — trapez rzędu 2 ma prawo
   do takiego błędu, a jego wielkość (7,6e−07 względnie) jest o rzędy mniejsza niż
   jakakolwiek niepewność danych wejściowych (por. OD-11: 4,02 %).
3. **Zgodność z W6-F:** różnica mojej wartości produktu od liczby raportowanej w W6-F wynosi
   **9,115e−06 s**, a mój błąd względny 7,696e−06 wobec raportowanego 7,63e−06 — zgodność
   w granicach rozdzielczości obu bisekcji. **Twierdzenie W6-F o CCT jest odtworzone.**


---
## H. KRYMINALISTYKA PRZESUNIĘCIA CZASU WOBEC ANDES (§8)

W6-F ustalił, że „podłoga ~1,4e−04 rad" to przesunięcie osi czasu, mierząc **trzy** kroki
na jednej nodze. Ta runda mierzy **cztery** kroki na **czterech** klasach scenariusza i
znajduje, że reżimy są **DWA**, a nie jeden — oraz podaje **ŹRÓDŁO** stałej.

### H.1 Noga BEZ ZDARZENIA — tor WYROCZNIA ↔ ANDES

Produkt nie ma wejścia „zaburz stan początkowy"; podanie przesuniętego punktu pracy kończy
się **odmową nazwaną** („Punkt pracy nie jest równowagą układu: ‖f‖ = 1,586"), co jest
poprawnym zachowaniem fail-closed, ale uniemożliwia wzbudzenie kołysania bez zdarzenia po
stronie produktu. Dlatego ta noga jest mierzona wobec wyroczni analitycznej — i tak jest
tu oznaczona.

| dt [s] | τ optymalne [s] | **τ/dt** | błąd bez korekty [rad] | błąd po korekcie [rad] | redukcja |
|---|---|---|---|---|---|
| 1,00e−03 | −5,0856e−04 | **−0,5086** | 2,157e−04 | 3,243e−06 | 67× |
| 5,00e−04 | −2,5145e−04 | **−0,5029** | 1,056e−04 | 7,231e−07 | 146× |
| 2,50e−04 | −1,2600e−04 | **−0,5040** | 5,307e−05 | 5,733e−06 | 9× |
| 1,25e−04 | −6,2657e−05 | **−0,5013** | 2,644e−05 | 3,642e−06 | 7× |

τ/dt dąży monotonicznie do **−1/2**. Ilorazy błędu przy połowieniu dt: 2,043 / 1,990 / 2,007
→ **rząd 1**, czyli błąd ∝ dt. To jest podpis przesunięcia o PÓŁ KROKU (stałego w KROKACH).

### H.2 Noga ZE ZDARZENIEM — tor PRODUKT ↔ ANDES, trzy niezależne klasy zdarzeń

| scenariusz | τ/dt przy dt = 1e−3 / 5e−4 / 2,5e−4 / 1,25e−4 | iloraz błędu przy połowieniu dt |
|---|---|---|
| S1 zwarcie zdjęte | 0,0501 / 0,1003 / 0,2001 / 0,3961 | 0,998 / 0,995 / 1,01 |
| S3 skok odbioru (stała moc) | 0,0497 / 0,0998 / 0,1999 / 0,4000 | 0,972 / 1,018 / 1,004 |
| S4 wyłączenie toru linii | 0,0499 / 0,0995 / 0,1975 / 0,3911 | 0,999 / 0,998 / 1,000 |

τ/dt **PODWAJA SIĘ** przy każdym połowieniu dt ⇒ τ jest stałe w SEKUNDACH:
**τ ≈ +5,0e−05 s** (zmierzone 5,0137 / 5,0143 / 5,0035 / 4,9512 ×10⁻⁵ w S1).
Błąd bez korekty ma iloraz **1,000** — NIE maleje z krokiem wcale.

### H.3 Źródło stałej — ZNALEZIONE W KODZIE ANDES, nie wywnioskowane

```
andes/system.py :: System.store_switch_times(self, models, eps=1e-4)
    „eps : float — The small time step size to use immediately before and after the event"
    out = np.append(out, times)        # t_zdarzenia
    out = np.append(out, times - eps)  # t_zdarzenia - 1e-4
    out = np.append(out, times + eps)  # t_zdarzenia + 1e-4
```

ANDES otacza KAŻDE zdarzenie stałym oknem ±1e−4 s. Zmierzone przesunięcie **5,0e−05 s
= eps/2**, niezależne od dt.

### H.4 Wniosek — i jego GRANICA

* **bez zdarzenia:** τ = −dt/2, stałe w KROKACH, błąd ∝ dt¹ → semantyka próbkowania /
  znacznika czasu.
* **ze zdarzeniem:** τ = +eps/2 = +5,0e−05 s, stałe w SEKUNDACH, błąd ∝ dt⁰ → semantyka
  okna zdarzenia ANDES.

**Czego NIE twierdzę:** że ANDES ma błąd. Okno ±eps jest w ANDES **zamierzone** (służy
stabilności Newtona przy skokowej zmianie algebry) i udokumentowane w docstringu. Twierdzę
dokładnie tyle: **na użytej ścieżce porównania różnica pochodzi z semantyki znakowania
czasu zdarzeń, a nie z fizyki żadnej ze stron** — co potwierdza, że iloraz błędu wynosi 1,000
(fizyka dałaby zbieżność z krokiem), a po zdjęciu przesunięcia błąd spada 29…198×.

### H.5 Moja predykcja a priori została OBALONA pomiarem

W skrypcie a7 zapisałem predykcję „τ/dt = −0,5 STALE; iloraz błędu = 2". Dla nogi ze
zdarzeniem jest **fałszywa**: τ/dt nie jest stałe, a iloraz błędu wynosi 1,000. Prawo −dt/2
obowiązuje wyłącznie bez zdarzenia. Zapisuję to, bo predykcja obalona pomiarem jest wynikiem,
a nie porażką — i bo W6-F podawał „≈−50 µs (stałe)" dla zwarcia bez źródła i bez rozdzielenia
obu reżimów.


---
## I. WALIDACJA CZĘSTOTLIWOŚCI WĘZŁOWEJ (§9–§11)

To jest bramka nagłówkowa tej rundy. W6-F postawił tę zdolność na **L2** z uzasadnieniem
„brak benchmarku analitycznego dla samej obserwabli". Ta runda ten benchmark **zbudowała**
i wykonała cztery niezależne próby falsyfikacji.

### I.1 Niezależne wyprowadzenie wzoru

Dla `V = |V|·e^{jθ}` zachodzi tożsamość
`V̇·conj(V) = |V|·d|V|/dt + j·|V|²·dθ/dt`, skąd
`dθ/dt = Im(V̇·conj(V))/|V|²`. Fazory żyją w układzie wirującym z ω₀, więc faza fizyczna
to `φ(t) = ω₀t + θ(t)` i `f = f_n + θ̇/(2π)`. **Człon f_n jest KONSEKWENCJĄ układu
odniesienia, nie założeniem** — falsyfikuje go próba I.2 (BF-1).

Kod produktu (`obserwable.py:380-381`) realizuje dokładnie tę tożsamość:
```python
pochodna_kata = (pochodna_napiecia_pu_s * napiecie_pu.conjugate()).imag / (modul * modul)
f_hz = f_bazowa_hz + pochodna_kata / (2.0 * math.pi)
```

### I.2 Benchmarki na trajektoriach ZADANYCH ANALITYCZNIE (BF-1/2/3)

| próba | co sprawdza | wynik |
|---|---|---|
| **BF-1** stała częstotliwość, `θ = θ₀ + 2π·Δf·t`, 28 przypadków (w tym θ₀ = π) | czy odtwarza zadane Δf | **błąd DOKŁADNIE 0,0 Hz** |
| **BF-2** `θ = a·t + b·t²` (częstotliwość liniowo zmienna) | czy nadąża za zmienną częstotliwością | **błąd DOKŁADNIE 0,0 Hz** |
| **BF-3** zmienna amplituda `A(t)`, 25 przypadków, w tym \|Ȧ\| = 100 przy A = 0,01 | czy amplituda NIE wytwarza częstotliwości | **1,14e−13 Hz** |

BF-3 jest próbą falsyfikacji najgroźniejszej patologii: estymator, który myli zmianę modułu
ze zmianą fazy, przy \|Ȧ\|/A = 10⁴ dałby błąd rzędu 10³ Hz. Zmierzono 1,14e−13 Hz.

### I.3 Benchmark na REALNEJ trajektorii — wobec DOKŁADNEJ pochodnej analitycznej

Algebra SMIB jest **liniowa w V**, więc `∂V/∂δ` liczy się JEDNYM rozwiązaniem układu —
bez różnic skończonych, bez rozwijania fazy. Z własnej macierzy Y (bez importu produktu):

```
dV/dδ = Y⁻¹ · [ j·y_m·E′·e^{jδ} , 0 ]ᵀ ;   V̇ = (dV/dδ)·ω₀(ω−1)
f = f_n + Im(V̇·conj(V))/|V|² / (2π)
```

Porównanie z opublikowanym `f_hz@GEN` na dwóch trajektoriach zwarciowych (zapad do 0,60 p.u.),
3001 próbek: **max \|Δf\| = 7,105e−15 Hz**. Stan ustalony: **dokładnie 50,0 Hz** na obu szynach.

**7,105427357601002e−15 Hz to DOKŁADNIE `math.ulp(50.0)`** — jeden bit ostatniej pozycji.
Mniejszej różnicy nie da się w tej arytmetyce wyrazić.

### I.4 Tożsamość cechowania w WYSPIE (§12)

W wyspie z jednym źródłem wszystkie fazory obracają się sztywno z kątem wirnika, więc
`f_i = f_n·ω` na KAŻDYM węźle dokładnie. Maszyna + odbiór o stałej mocy, **bez szyny
sztywnej**, skok odbioru 0,05/0,15/0,30 p.u.:

| Δ P [p.u.] | max\|ω−1\| | max\|f − f_n·ω\| @GEN [Hz] | @ODB [Hz] | max\|g\| |
|---|---|---|---|---|
| 0,05 | 9,286e−03 | 7,105e−15 | 7,105e−15 | 8,35e−12 |
| 0,15 | 2,786e−02 | 1,350e−13 | 1,130e−12 | 6,33e−12 |
| 0,30 | 5,571e−02 | 1,471e−12 | 8,242e−12 | 9,24e−12 |

Brak członu `f_n` albo potraktowanie kąta solvera jako kąta w układzie nieruchomym
złamałoby tę tożsamość o **50 Hz**. Zmierzono ≤ 8,2e−12 Hz.

### I.5 Oś odniesienia (§12) — i KOREKTA MOJEGO WŁASNEGO BŁĘDU

W pierwszym podejściu (skrypt a3) zapisałem oczekiwanie „`f_SYS ≡ 50` dokładnie, bo SEM
szyny sztywnej jest stała". Pomiar dał 0,0197 Hz i przez chwilę wyglądał jak defekt.
**Oczekiwanie było błędne:** węzeł `SYS` leży **ZA** impedancją źródła X_s, więc jest
węzłem SIECIOWYM, a nie węzłem SEM — jego kąt porusza się wraz z prądem.

Test rozstrzygający (falsyfikowalna predykcja: odchyłka ∝ X_s → 0):

| X_s [p.u.] | max\|f_SYS − 50\| [Hz] | iloraz do poprzedniego | iloraz X_s |
|---|---|---|---|
| 0,05 | 1,666e−02 | — | — |
| 0,005 | 1,726e−03 | 0,1036 | 0,1000 |
| 0,0005 | 1,731e−04 | 0,1003 | 0,1000 |
| 0,00005 | 1,732e−05 | 0,1000 | 0,1000 |

Skalowanie liniowe potwierdzone do trzeciej cyfry. **Oś odniesienia jest wspólna dla wyspy
i wyznaczona przez urządzenie, które nie obraca się względem układu wirującego ω₀ — czyli
przez SEM, nie przez szynę.** Produkt miał rację; błędne było moje odtworzenie.

### I.6 Rozspójnienie (§13)

Otwarcie OBU torów linii dwutorowej (GEN|maszyna ↔ SYS|szyna sztywna): bieg **UKOŃCZONY**,
wszystkie kanały skończone, `f_GEN` 50,246…53,674 Hz (wyspa maszyny przyspiesza — nadwyżka
mocy mechanicznej), `f_SYS` dokładnie 50,0 Hz (wyspa szyny sztywnej), `jakosc_f@GEN` = {0,0},
max\|g\| = 3,50e−12. **Każda wyspa czyta własną częstotliwość — nie ma jednej wspólnej liczby
narzuconej całej sieci.**

**Wyspa BIERNA (§13 wprost o to pyta) — ZBADANA, wynik w N.1 jako F-8.**
Układ: maszyna na GEN — LINIA — odbiór o stałej mocy na ODB, bez szyny sztywnej.
Kontrola (linia zamknięta przez cały bieg): **bieg ukończony**, 22 kanały skończone,
max|g| = 1,67e−16 — punkt pracy jest ważny, więc ewentualna odmowa NIE może pochodzić
z niespójnego startu. Otwarcie LINII w t = 0,3 s (ODB traci jedyne źródło):

```
OverflowError: (34, 'Numerical result out of range')
   siec.py:246  jakobian_pradu_odbioru:  mianownik**2,  mianownik = |V|^2
   wyplywa z:   silnik.py:736 _probkuj_obserwable -> obserwable.py:268 -> siec.py:321
```

**Wyjątek NIENAZWANY**, deterministyczny (2/2 przebiegi identyczne). Fizyka nie jest zła —
wyspa bierna z odbiorem o stałej mocy jest nierozwiązywalna i odmowa jest WŁAŚCIWA; zły jest
wyłącznie MECHANIZM odmowy. Pełna klasyfikacja i minimalna naprawa: **N.1 (F-8)**.


---
## J. ROCOF — WIRNIK vs SZYNA (§14)

§14 zabrania utożsamiania obu bez dowodu. Ta runda podaje **analityczną predykcję ilorazu**.

### J.1 Wyprowadzenie

Kąt szyny zależy od stanu tylko przez δ (ω nie wchodzi do algebry), więc `θ̇ = (∂θ/∂δ)·δ̇`.
W chwili `t_f⁺` jest `δ̇ = ω₀(ω−1) = 0`, więc człon `(∂²θ/∂δ²)·δ̇²` znika i

```
θ̈ = (∂θ/∂δ)·δ̈ = (∂θ/∂δ)·ω₀·ω̇
ROCOF_szyny = θ̈/(2π) = (∂θ/∂δ)·ω₀·ω̇/(2π) = (∂θ/∂δ)·f_n·ω̇ = (∂θ/∂δ)·ROCOF_wirnika
```

**Iloraz ROCOF szyny do ROCOF wirnika jest DOKŁADNIE `∂θ_GEN/∂δ`** — wielkością czysto
sieciową, liczalną z macierzy Y bez żadnego biegu czasowego.

### J.2 Pomiar wobec predykcji

Zwarcie na GEN, `x_f = 0,05·Z_b`, `dt = 2,5e−04`:

| droga | wartość [Hz/s] |
|---|---|
| **A** ROCOF wirnika z równania ruchu `(P_m−P_e)/(2H)·f_n` | 4,363636363636366 |
| **B** ROCOF wirnika z trajektorii `f_n·ω` | 4,363624317070705 |
| **C** ROCOF **szyny** z trajektorii `f_hz@GEN` | 2,520772506261680 |

* zgodność A vs B: **2,76e−06** względnie (dwie niezależne drogi do tej samej wielkości),
* `∂θ_GEN/∂δ` z **mojej własnej macierzy Y**: **0,5776783871823934**,
* zmierzony iloraz C/A: **0,5776770326849680**,
* **błąd predykcji: 2,34e−06** — czyli tyle, ile wynosi obcięcie 5-punktowej regresji przy dt = 2,5e−4.

### J.3 Wniosek

ROCOF szyny **nie jest** ROCOF-em wirnika i **nie wolno ich mylić** — różnią się o czynnik
`∂θ/∂δ`, który dla tego układu w zwarciu wynosi 0,5777. Ale różnica **nie jest błędem**:
jest przewidywalna analitycznie co do szóstej cyfry. Obie wielkości startują z dokładnie
50,0 Hz w chwili `t_f⁺` (bo ω = 1), co jest dodatkowym testem spójności.

Równość `f_szyny = f_n·ω` zachodzi **tylko w wyspie** (sekcja I.4) — tam `∂θ/∂δ = 1`, bo
wszystkie fazory obracają się sztywno z wirnikiem. W układzie z szyną sztywną szyna GEN jest
elektrycznie związana z SEM systemu przez `X_L + X_s`, więc jej kąt porusza się wolniej niż
kąt wirnika.


---
## K. GŁĘBOKI ZAPAD I UWARUNKOWANIE (§11)

### K.1 Argument teoretyczny — estymator jest NIEZMIENNICZY względem skali

`Im(V̇·conj(V))/|V|²` jest jednorodny stopnia **zero** w V: podstawienie `V → cV`,
`V̇ → cV̇` dla dowolnego `c ≠ 0` nie zmienia wyniku. **Małe |V| samo w sobie NIE psuje
estymatora.** Psuje go wyłącznie błąd ADDYTYWNY fazora — i dokładnie to ogranicza `u_f`.

### K.2 Potwierdzenie pomiarem na trajektorii zadanej

Przemiatanie `|V| = 1,0 … 0,001 p.u.` przy zadanej analitycznie fazie:
**błąd wartości DOKŁADNIE 0,0 Hz w całym zakresie** — cztery rzędy zapadu, zero degradacji.

### K.3 Dziedzina fail-closed

Kod (`obserwable.py:377-379`): `|V| ≤ u_V ⇒ NIEDOSTĘPNA`, gdzie `u_V = |J⁻¹r|` jest
**mierzoną** poprawką newtonowską, a nie zadanym szumem. Warunek `|V| ≤ u_V` to dokładnie
„względny błąd fazora osiągnął jedność" — moment, w którym kąt przestaje być identyfikowalny.
Zmierzone: `u_V ≥ |V| ⇒ NIEDOSTĘPNA`; `u_V = NaN ⇒ NIEDOSTĘPNA`; `u_V = Inf ⇒ NIEDOSTĘPNA`.
Stan NIEDOSTĘPNA niesie `niepewnosc_hz = f_n` (całą częstotliwość znamionową), więc nawet
konsument ignorujący kod jakości widzi, że liczba nie niesie treści.

### K.4 Zachowanie na REALNYM biegu — zwarcie przez malejącą reaktancję

SMIB bez odbioru, zwarcie trwałe na GEN:

| x_f [Ω] | min\|U_GEN\| [p.u.] | zakres f_GEN [Hz] | max u_f [Hz] | u_f/min\|U\| | kody jakości |
|---|---|---|---|---|---|
| 5,0 | 0,9708 | 50,000…50,028 | 6,17e−16 | 6,4e−16 | {0; 1} |
| 1,0 | 0,7358 | 50,000…50,126 | 1,16e−15 | 1,6e−15 | {0; 1} |
| 0,3 | 0,4072 | 50,000…50,366 | 9,50e−17 | 2,3e−16 | {0; 1} |
| 0,1 | 0,1623 | 50,000…50,737 | 2,65e−16 | 1,6e−15 | {0; 1} |
| 0,03 | 0,0483 | 50,000…51,071 | 4,20e−16 | 8,7e−15 | {0; 1} |
| 0,01 | 0,0157 | 50,000…51,227 | 6,12e−16 | 3,9e−14 | {0; 1} |

Zapad do **1,57 % napięcia znamionowego** — `u_f` pozostaje rzędu 1e−16 Hz, wszystkie kanały
skończone. Zgodnie z K.1: sam zapad nie degraduje estymatora.

### K.5 Ścieżka, która NAPRAWDĘ psuje uwarunkowanie — i odmowa, która ją zamyka

Odbiór o **stałej mocy** wnosi człony `1/|V|²` i `1/|V|⁴`. Ta sama drabina zwarcia
z odbiorem 0,4 p.u. na szynie zwartej:

| x_f [Ω] | min\|U_GEN\| | wynik |
|---|---|---|
| 0,5 | 0,586 | bieg; u_f = 8,84e−16 |
| 0,2 | 0,347 | bieg; u_f = 9,75e−15 |
| 0,1 | 0,199 | bieg; u_f = 9,91e−14 |
| **0,05** | — | **ODMOWA** `dynamika.krok_niezbiezny` |
| ≤ 0,02 | — | **ODMOWA** `dynamika.reinicjalizacja_niezbiezna` |

`u_f` rośnie ~100× na dekadę spadku |U| (zgodnie z `1/|V|²`), a zanim dojdzie do obszaru
nieidentyfikowalności, **algebra odmawia nazwanym kodem**. Odpowiedź na pytanie §11 brzmi
więc: **nie, produkt nie prezentuje liczby jako wiarygodnej, gdy faza przestaje być
identyfikowalna** — bo do tego stanu nie dochodzi: bieg jest wcześniej przerywany.

### K.6 Kod jakości NIEROZRÓŻNIALNA — weryfikacja, że nie jest ozdobą

Udział próbek `jakosc_f = NIEROZROZNIALNA` w biegu z odbiorem wyniósł **0,6668517490283176**,
czyli przy 1801 próbkach **dokładnie 1201 próbek**. To jest okno przedzwarciowe
(t ≤ 0,3 s przy horyzoncie 0,45 s) wraz z próbką w chwili zdarzenia. W tym oknie `f = 50,0`
dokładnie, więc odchyłka od `f_n` jest zerowa i **rzeczywiście nierozróżnialna od zera**.
Etykieta mówi prawdę, a nie wypełnia pole.

**Korekta mojego wcześniejszego nadmiernego wniosku:** z tej liczby wywnioskowałem był
„próbkowanie lewostronne". To **nadinterpretacja** — w chwili `t_f` wirnik ma ω = 1, więc
`f = 50` Hz przy OBU konwencjach i ta liczba ich nie rozróżnia. Konwencję rozstrzyga kontrakt
silnika (`silnik.py:28-29`: „Próbka w chwili `t` jest stanem PO wykonaniu wszystkich zdarzeń
tej chwili" — czyli PRAWOSTRONNA) oraz mutacja M19.


---
## L. WPŁYW OD-11 (§15)

### L.1 Niezależne odtworzenie propagacji

Odtworzyłem tabelę W6-F O.1 **od zera, własnym wyprowadzeniem na `math`/`cmath`**
(bez importu produktu i bez importu mojej wyroczni numerycznej). Wynik zgadza się
**co do cyfry**:

| U_gen [p.u.] | δ₀ [°] | \|E′\| [p.u.] | K_s [p.u./rad] | f_d [Hz] | zmiana f_d |
|---|---|---|---|---|---|
| 1,028 (−0,022) | 25,659261 | 1,108498 | 1,507772 | 1,309224 | **−2,042 %** |
| 1,050 (odniesienie) | 24,683083 | 1,149429 | 1,571296 | 1,336519 | 0 |
| 1,072 (+0,022) | 23,775293 | 1,190622 | 1,634222 | 1,363018 | **+1,983 %** |

### L.2 Uściślenie liczby W6-F (nie korekta błędu)

W6-F podaje „zmiana częstotliwości modu **do 2,04 %**". To jest poprawne jako stwierdzenie
**jednostronne** (−2,042 % dla odchyłki −0,022 p.u.). Pełna **rozpiętość obustronna**
przy ±0,022 p.u. wynosi **4,02 %** (a dla \|E′\| — 7,14 %, dla δ₀ — 1,884°).
Zapisuję rozpiętość, bo to ona jest istotna dla marginesu inżynierskiego.

### L.3 Rozdzielenie poprawności od wiarygodności wejścia (§15 wprost tego żąda)

* **Poprawność solvera:** przy KAŻDYM z trzech punktów pracy produkt odtwarza mod z błędem
  3,4e−06…3,0e−05. Błąd **nie zależy** od punktu pracy. Solver dynamiki jest poprawny.
* **Wiarygodność liczby:** punkt pracy jest **WEJŚCIEM** równań różniczkowych
  (`adapter_dynamiki.py:43-46` — pochodzi z ZAKOŃCZONEGO biegu rozpływu; brak biegu =
  odmowa nazwana). Błąd rozpływu 0,022 p.u. jest błędem **warunku początkowego**.

### L.4 Klasyfikacja (definicje liter podaję jawnie, żeby nie były domysłem)

| litera | znaczenie przyjęte w tej rundzie | czy pasuje do OD-11 |
|---|---|---|
| **A** | defekt solvera dynamiki (fizyka liczona źle) | **NIE** — błąd modu niezależny od punktu pracy |
| **B** | defekt toru WEJŚCIOWEGO (rozpływ) o skutku dla dynamiki | **TAK** — granice Q na iteracjach przejściowych |
| **C** | luka walidacyjna (nie zbadane) | nie — zbadane i zmierzone |
| **D** | decyzja zakresu / właściciela | nie w części technicznej |

**OD-11 = klasa B.** Nie jest defektem dynamiki; jest defektem rozpływu, którego skutkiem
dla dynamiki jest błąd warunku początkowego o zmierzonej propagacji 4,02 % na częstotliwości
modu. **Ogranicza DZIEDZINĘ, a nie poprawność.**

---
## M. WPŁYW OD-12 (§16)

### M.1 Niezależne odtworzenie

| S_k″ [MVA] | X_s [p.u.] | X_T [p.u.] | K_s [p.u./rad] | f_d [Hz] | zmiana vs 2000 |
|---|---|---|---|---|---|
| 1 000 | 0,1000 | 0,7000 | 1,426110 | 1,273276 | −4,73 % |
| 2 000 | 0,0500 | 0,6500 | 1,571296 | 1,336519 | 0 |
| 5 000 | 0,0200 | 0,6200 | 1,669647 | 1,377712 | +3,08 % |
| 20 000 | 0,0050 | 0,6050 | 1,722480 | 1,399340 | +4,70 % |
| 50 000 | 0,0020 | 0,6020 | 1,733363 | 1,403753 | +5,03 % |

**Rozpiętość 1 000 ↔ 50 000 MVA: 10,25 %** — zgodna z W6-F co do drugiego miejsca.

### M.2 Rozdzielenie poprawności od wiarygodności

Błąd „produkt vs analiza" w W6-F wynosi 2,5e−06…3,0e−05 **w całym zakresie S_k″** — nie
zależy od wartości. **Fizyka jest odtwarzana poprawnie dla każdej z nich.** Ale S_k″ wchodzi
wprost do `X_T = X′d + X_L + X_s`, więc do `K_s`, do `f_d`, do tłumienia i do ROCOF.
Jeśli S_k″ jest **założona**, to i te wielkości są **założeniem** — poprawnie policzonym,
lecz nie będącym pomiarem sieci.

Brak S_k″ nie wchodzi po cichu: `dynamika.zrodlo_bez_impedancji`
(`adapter_dynamiki.py:1013-1021`). Trzeciej drogi — cichej wartości domyślnej — w tym torze
nie ma.

**OD-12 = klasa B również**, ale o innym charakterze niż OD-11: nie defekt obliczeń, tylko
**status danych wejściowych**. Ogranicza wiarygodność liczby, nie jej poprawność.


---
## N. ZNALEZISKA F-1…F-8 (§17)

Schemat klasyfikacji: przyczyna źródłowa · odtwarzalność · rodzaj (produkt / test /
dokumentacja / proces) · luka zdolności · blokada walidacji · dotkliwość · minimalna
naprawa · czy wymagana teraz · czy można odroczyć.

### N.1 F-8 — NOWE ZNALEZISKO TEJ RUNDY (najważniejsze)

| pole | treść |
|---|---|
| **objaw** | Odcięcie odbioru o stałej mocy od jedynego źródła (wyspa BIERNA) kończy się **`OverflowError: (34, 'Numerical result out of range')`** — wyjątkiem NIENAZWANYM |
| **przyczyna źródłowa** | `siec.py:246` `jakobian_pradu_odbioru`: `mianownik**2`, gdzie `mianownik = \|V\|²`. Po utracie wszystkich źródeł algebra rozbiega \|V\| → ∞, więc czwarta potęga przepełnia zakres |
| **gdzie wypływa** | `silnik.py:736 _probkuj_obserwable` → `obserwable.py:268` → `siec.py:321` → `siec.py:246`. **Krok całkowania NIE wykrył nierozwiązywalności — awaria ujawnia się dopiero przy próbkowaniu obserwabli** |
| **odtwarzalność** | **deterministyczna**, 2/2 przebiegi identyczne. Kontrola (linia zamknięta) kończy się poprawnie: 22 kanały skończone, max\|g\| = 1,67e−16 — więc punkt pracy jest ważny, a odmowa NIE pochodzi z niespójnego startu |
| **rodzaj** | **defekt produktu** — nie testu, nie dokumentacji |
| **czy fizyka jest zła** | **NIE.** Wyspa bierna z odbiorem o stałej mocy jest fizycznie NIEROZWIĄZYWALNA. Odmowa jest **właściwym** wynikiem; zły jest wyłącznie MECHANIZM odmowy |
| **klasa** | **P1-ODMOWA** (naruszenie kontraktu fail-closed), nie P0/P1-PHYSICS |
| **dotkliwość** | **wysoka pod względem osiągalności**: rozłączenie ostatniej gałęzi zasilającej odbiór to zwykłe studium N−1 / łączeniowe. W odróżnieniu od F-7 (nieosiągalne przez kontrakt ENM `h_s: gt=0.0`) — **ta ścieżka jest osiągalna** |
| **reguła, którą łamie** | „KLASA, NIE INSTANCJA", pkt 3 (predykaty parami): `_rozloz_jakobian` **już** zamienia awarię scipy na `OdmowaDynamiki(KOD_ALGEBRA_NIEZBIEZNA)`, ale `jakobian_algebry` — wołany PRZED faktoryzacją — przepuszcza surowe wyjątki libm. Jedna połowa pary jest osłonięta, druga nie |
| **minimalna naprawa (2 warstwy)** | (a) **źródło:** wykrycie wyspy bez źródła przy re-inicjalizacji po zdarzeniu i odmowa nazwana — wzorzec istnieje już w repo (`source.multiple_grid_sources_in_island`, `dynamika.zrodlo_bez_impedancji`); (b) **obrona w głąb:** `siec.py`/`obserwable.py` zamieniają przepełnienie i wartości niefinitne na `OdmowaDynamiki`, tak jak robi to `_rozloz_jakobian` |
| **czy naprawiam w tej rundzie** | **NIE** — i to jest decyzja, nie przeoczenie. Powody: (1) §27 mandatu kończy rundę na raporcie i dopuszcza wyłącznie zmiany **niezbędne do domknięcia dowodu**, a naprawa nią nie jest; (2) naprawa edytuje **ZAMROŻONY rdzeń dynamiki** (W6-3C, dyrektywa właściciela 2026-09-18), co wg CLAUDE.md wymaga zgody właściciela — **bramka B-01**, jedno z jawnie dozwolonych zatrzymań; (3) niezweryfikowana zmiana toru odmowy może zamaskować realną rozbieżność |
| **rekomendacja** | **NAPRAWA TERAZ, w osobnej karcie, po zgodzie B-01** — przed wystawieniem dynamiki na studia wyspowe i łączeniowe |

### N.2 F-5 — POTWIERDZONE LICZBĄ (przeniesione z W6-F jako otwarte)

Wywołałem predykat decydujący o pominięciu (`tests/conftest.py:84-90`) 1:1 na całym drzewie:

| stan środowiska | zebranych plików | **pominiętych BEZ ŚLADU** | kod wyjścia pytest |
|---|---|---|---|
| komplet zależności | 702 | 0 | 0 |
| brak `numpy`/`sqlalchemy`/`networkx` | **21** (tylko `proof_engine`) | **681** | **0 = ZIELONY** |

W tym **wszystkie 22 pliki testów dynamiki**. Bez `skip`, bez błędu, bez ostrzeżenia.
**Odpowiedź na pytanie §17 o F-5 brzmi: TAK — zielony wynik jest osiągalny przy
niewykonanej całej klasie testów.** Klasa: **P1-CI**, odtwarzalność deterministyczna,
minimalna naprawa: zamiana cichego pominięcia na twardy błąd konfiguracji środowiska.

### N.3 F-1 — KOREKTA SFORMUŁOWANIA (dowód w sekcji O.2 pkt 3)

W6-F zapisał F-1 jako: „błąd kierunku przeliczenia bazy jest **w testach NIEWIDOCZNY**".
**Pomiar tego nie potwierdza w tak mocnej formie.** Mutacje F1a (odwrócona baza bezwładności,
= M7 z W6-F) i F1b (odwrócona baza impedancji, = M9) zostały zabite **przez OBIE wyrocznie**,
w tym przez zestaw repozytorium — testy biblioteki urządzeń (`test_biblioteka_przebiegi.py`),
bo `biblioteka_urzadzen.py` używa urządzeń o `s_n_mva` = 30 / 40 / 30 MVA przy bazie układu
100 MVA, więc przelicznik **nie jest** tam tożsamością.

Ślepy jest **wyłącznie** układ odniesienia SMIB `zbuduj_smib`
(`tests/network_model/dynamika/uklady.py:83`, `s_n_mva=S_BAZOWA_MVA`) — czyli dokładnie ten,
na którym stoi walidacja FIZYKI (`test_walidacja_smib.py`).

| | W6-F | po tej rundzie |
|---|---|---|
| sformułowanie | zestaw testów ślepy na błąd bazy | **ślepy jest jeden układ odniesienia**, zestaw jako całość nie |
| klasa | P1-TEST | **P2-TEST** (dotkliwość obniżona) |
| naprawa | zmiana zbioru testowego | `s_n_mva ≠ S_BAZOWA_MVA` w SMIB + bramka wzorowana na G6 |
| dlaczego nadal warto | walidacja fizyki powinna bronić się **sama**, bez polegania na testach innej rodziny | |

### N.4 Pozostałe znaleziska — stan po weryfikacji

| # | stan po tej rundzie |
|---|---|
| F-2 | **potwierdzone i zaostrzone** — docstring nie jest już tylko nieaktualny, lecz **fałszywy**: przyczyna ustalona, a stała `eps = 1e-4` wskazana w kodzie ANDES (`system.py::store_switch_times`) |
| F-3 | **potwierdzone, przyczyna wyjaśniona**: `P_m` jest stanem o zerowej pochodnej (`maszyna_klasyczna.py:143-147`), więc brak zdarzenia to decyzja ZAKRESU, nie niedopatrzenie |
| F-4 | niezmienione — checkout innej sesji, nie dotykam |
| F-6 | niezmienione — ustawienia repozytorium, poza moim zakresem; skutek opisany w R.3 |
| F-7 | **doprecyzowane**: przy braku zakłócenia bieg z H < 0 daje wynik **bit w bit identyczny** z kontrolą (δ = 0,43080107103566123), bo `P_m − P_e = 0` i H nie wchodzi do wyniku. Niefizyczność ujawnia się dopiero z zakłóceniem. Dodatkowo **NaN/Inf są odrzucane poprawnie** (`dynamika.wartosc_nieskonczona`), więc luka dotyczy **znaku**, nie skończoności — jest węższa, niż mogłoby się wydawać |


---
## O. MUTACJE M10–M19 + F1a/F1b — WOBEC DWÓCH WYROCZNI (§18)

§18 żąda nie licznika zabić, tylko odpowiedzi, **dlaczego** aparat walidacyjny widzi lub nie
widzi danego zepsucia. Dlatego każda mutacja jest oceniana przez **dwie niezależne wyrocznie**:

* **bramki fizyczne G1–G9** — poziom BIEGU (układ jako całość, progi a priori),
* **zestaw testów repozytorium** `pytest -m "not pandapower and not andes" tests/network_model/dynamika`
  (marker jak w `python-tests.yml:55`) — poziom JEDNOSTEK, w tym stany nieosiągalne z biegu.

Baza przed mutacjami: bramki **9/9 PASS**, testy **429 passed, 3 deselected**.
Po przywróceniu: drzewo produktu **czyste** (`git status --porcelain` pusty).

### O.1 Wynik — 12/12 ZABITYCH, zero przeżywających

| mut | zepsucie | bramki | testy repo | **warstwa** | co zaczerwieniło |
|---|---|---|---|---|---|
| M10 | 2H → H (usunięta dwójka) | TAK | TAK | obie | G2, G4, G6 |
| M11 | odwrócony znak `P_e` | TAK | TAK | obie | wyjątek (odmowa przy inicjalizacji) |
| M12 | **odwrócony znak D** (tłumienie ujemne) — NOWA | TAK | TAK | obie | **G4** |
| M13 | usunięte ω₀ z `dδ/dt` | TAK | TAK | obie | G2, G4, G6, **G7, G8** |
| M14 | **baza mocy użyta do reaktancji** (kopiuj-wklej) — NOWA | TAK | TAK | obie | **G6** |
| M15 | **zdarzenie przesunięte o PÓŁ kroku** — NOWA | TAK | TAK | obie | **G5** |
| M16 | **zepsuty wzór `f` węzłowej** (brak `/\|V\|²`) — NOWA | TAK | TAK | obie | **G7** |
| M17 | **nominalne 50 Hz zamiast NIEDOSTĘPNA** — NOWA | **nie** | TAK | **tylko testy repo** | — |
| M18 | **pominięta re-inicjalizacja algebry** — NOWA | TAK | TAK | obie | G3, **G7** |
| M19 | **próbka LEWOSTRONNA zamiast prawostronnej** — NOWA | TAK | TAK | obie | G3 |
| F1a | odwrócony kierunek bazy BEZWŁADNOŚCI (= M7 z W6-F) | TAK | TAK | obie | **G6** |
| F1b | odwrócony kierunek bazy IMPEDANCJI (= M9 z W6-F) | TAK | TAK | obie | **G6** |

### O.2 Trzy wnioski, których sam licznik 12/12 by nie dał

**1. Luka mojego aparatu była realna i została zamknięta.** Przed tą rundą bramki G1–G6
**nie czytały ani częstotliwości węzłowej, ani polityki jakości** — M16 i M18 przeszłyby
przez nie niezauważone. Dodane G7/G8/G9 zabijają M16 wprost i **dokładają** kill do M13
i M18. Baza G7 = **7,105427357601002e−15 Hz = dokładnie `math.ulp(50.0)`**.

**2. M17 pokazuje, na której WARSTWIE mieszka gwarancja — i to nie jest luka.**
M17 (zwrot pewnych 50 Hz zamiast stanu NIEDOSTĘPNA) **nie został zabity przez bramki**,
bo stan `|V| ≤ u_V` jest **nieosiągalny z poziomu biegu**: algebra odmawia wcześniej
(`dynamika.krok_niezbiezny` / `dynamika.reinicjalizacja_niezbiezna`, sekcja K.5). Zabił go
test jednostkowy `test_f4_zapad_do_zera_konczy_sie_stanem_niedostepnym_a_nie_liczba`.
**To jest prawidłowy podział pracy, a nie dziura:** kontrakt obserwabli jest broniony na
poziomie jednostki, a domena biegu jest broniona odmową. Gdyby ktoś skasował ten test
jednostkowy, produkt straciłby JEDYNĄ obronę tego kontraktu — i to jest rzecz do zapamiętania.

**3. F-1 z W6-F był POSTAWIONY ZA SZEROKO — korekta.** W6-F zapisał F-1 jako „błąd kierunku
przeliczenia bazy jest w testach NIEWIDOCZNY". Pomiar tego nie potwierdza w tak mocnej formie:
F1a i F1b **zostały zabite także przez zestaw repozytorium**, przez testy biblioteki urządzeń
(`test_biblioteka_przebiegi.py`), bo biblioteka używa urządzeń o `s_n_mva` = 30/40/30 MVA przy
bazie układu 100 MVA — więc przelicznik **NIE jest** tam tożsamością.

Ślepy jest **wyłącznie układ odniesienia SMIB** `zbuduj_smib` (`uklady.py:83`:
`s_n_mva=S_BAZOWA_MVA`) — czyli dokładnie ten, na którym stoją testy walidacji fizyki
(`test_walidacja_smib.py`). **Poprawne sformułowanie F-1:** układ, na którym opiera się
walidacja FIZYKI, nie widzi błędu kierunku zmiany bazy; szersze testy biblioteki go widzą.
Dotkliwość spada, ale naprawa (`s_n_mva ≠ S_BAZOWA_MVA` w SMIB + bramka wzorowana na G6)
nadal ma sens, bo walidacja fizyki powinna bronić się sama.


---
## P. KRYMINALISTYKA GOLDENÓW (§19)

§19 zakazuje wzorca „zły wynik → aktualizacja goldenu → zielono". Sprawdziłem trzema
niezależnymi drogami, czy taki wzorzec mógł wystąpić.

### P.1 Co dokładnie zmienił commit raportu W6-F

```
git show --numstat --format="" e6c4c715
1247    0    mv-design-pro/docs/evidence/W6F_WALIDACJA_FIZYCZNA_DYNAMIKI_2026-09-19.md
```

**Jeden plik. 1247 wstawień, ZERO usunięć.** Zero plików testowych, zero solvera, zero fixtur.

### P.2 Czy domena dynamiki ma w ogóle goldeny

```
git ls-files | grep -i dynamik | grep -iE "\.json|golden|zlot|odnies|fixtur"
→ mv-design-pro/backend/tests/golden/enm_builders/dynamika_rms.py   (BUDOWNICZY, nie golden)
```

**W domenie dynamiki nie ma ANI JEDNEGO pliku danych odniesienia.** Wszystkie oczekiwania
są wyrażone jako asercje wobec wielkości analitycznych albo wyroczni. Mycie goldenu jest
w tej domenie **strukturalnie niedostępne** — nie ma czego umyć.

### P.3 Czy tolerancje były kiedykolwiek ROZLUŹNIANE

To jest mycie goldenu w wersji subtelniejszej. Prześledziłem KAŻDĄ rewizję plików testowych
dynamiki:

| plik | rewizje | linii | asercji | zbiór tolerancji |
|---|---|---|---|---|
| `test_obserwable.py` | 903cd222 → 865c287f → b31f57c7 → adebe14d | 430 → 827 → 1128 → 1241 | 44 → 61 → 86 → **97** | stały, w ostatniej rewizji **przybywa** `abs=1e-15` |
| `test_silnik.py` | 1e4d5866 → 45fca115 → adebe14d | — | — | **identyczny** we wszystkich trzech |
| `test_walidacja_smib.py` | 630c48a9 | — | — | jedna rewizja |
| `test_wyrocznia_andes.py` | 630c48a9 | — | — | jedna rewizja |

**Zbiór tolerancji jest MONOTONICZNY:** rośnie liczba asercji, przybywa tolerancja
**ostrzejsza** (1e−15), żadna luźniejsza nie pojawia się i żadna ostrzejsza nie znika.

### P.4 Werdykt §19

**ZERO MYCIA GOLDENÓW — potwierdzone strukturalnie, nie deklaracją.** Ani w W6-F, ani w tej
rundzie. W tej rundzie zmieniłem w drzewie produktu **zero plików** (mutacje nakładane
i przywracane w `finally`, przywrócenie weryfikowane ponownym przebiegiem obu wyroczni).


---
## Q. ZBIEŻNOŚĆ NUMERYCZNA — PIĘĆ KLAS BŁĘDU ROZDZIELONYCH (§20)

§20 zabrania sumowania klas błędu w jedną liczbę. Mierzę pięć osobno, na siatce
4 kroki × 3 tolerancje Newtona (zwarcie 0,3→0,4 s, okno pomiarowe **po** usunięciu zwarcia).

| dt [s] | tol. Newtona | (1) błąd całkowania [rad] | iloraz | (2) max\|g\| | (3) błąd chwili zdarzenia [s] | (5) u_f [Hz] |
|---|---|---|---|---|---|---|
| 1,00e−03 | 1e−09 | 1,054979e−05 | — | 6,89e−10 | **0,0** | 3,61e−13 |
| 1,00e−03 | 1e−11 | 1,054979e−05 | — | 3,11e−15 | **0,0** | 3,61e−17 |
| 1,00e−03 | 1e−13 | 1,054979e−05 | — | 3,11e−15 | **0,0** | 3,61e−17 |
| 5,00e−04 | 1e−09 | 2,637462e−06 | **4,0000** | 8,60e−10 | **0,0** | 6,80e−13 |
| 5,00e−04 | 1e−11 | 2,637465e−06 | **4,0000** | 7,00e−12 | **0,0** | 8,92e−16 |
| 5,00e−04 | 1e−13 | 2,637465e−06 | **4,0000** | 3,11e−15 | **0,0** | 3,56e−17 |
| 2,50e−04 | 1e−09 | 6,593623e−07 | **4,0000** | 9,55e−10 | **0,0** | 1,31e−12 |
| 2,50e−04 | 1e−11 | 6,593675e−07 | **4,0000** | 8,02e−12 | **0,0** | 1,63e−15 |
| 2,50e−04 | 1e−13 | 6,593675e−07 | **4,0000** | 6,28e−14 | **0,0** | 3,59e−17 |
| 1,25e−04 | 1e−09 | 1,648313e−07 | **4,0002** | 9,60e−10 | **0,0** | 2,76e−12 |
| 1,25e−04 | 1e−11 | 1,648423e−07 | **4,0000** | 9,34e−12 | **0,0** | 2,88e−15 |
| 1,25e−04 | 1e−13 | 1,648423e−07 | **4,0000** | 6,71e−14 | **0,0** | 4,48e−17 |

**(4) błąd WYROCZNI** (DOP853 rtol 1e−13 vs Radau rtol 1e−12): **4,255e−13 rad**, stały.

### Q.1 Co z tego wynika — każda klasa ma własne, inne prawo

1. **Błąd całkowania** — iloraz **4,0000 dziewięciokrotnie z rzędu** ⇒ empiryczny rząd
   **p = 2,000**, zgodny z trapezem niejawnym. **Nie zależy od tolerancji Newtona**
   (identyczny do 7 cyfr przy 1e−11 i 1e−13; różni się dopiero na 7. cyfrze przy 1e−9).
2. **Residuum algebry** — śledzi tolerancję Newtona, nie krok.
3. **Błąd chwili zdarzenia** — **dokładnie 0,0 w 12/12 kombinacjach**. Nie „mały", tylko zero.
4. **Błąd wyroczni** — stały, niezależny od nastaw produktu: to **PODŁOGA POMIARU**.
5. **Błąd pomiarowy `u_f`** — śledzi tolerancję Newtona przez **cztery rzędy**
   (3,6e−13 → 3,6e−17), dokładnie jak każe konstrukcja `u_V = |J⁻¹r|`.

### Q.2 Uczciwe ograniczenie tego pomiaru

Przy najdrobniejszym kroku błąd całkowania (1,648e−07) jest wciąż **387× większy** od
podłogi wyroczni (4,255e−13). Gdyby był z nią porównywalny, zmierzony rząd 2,000 byłby
artefaktem wyroczni, a nie własnością produktu. **Nie jest** — margines rzędu 2,6 dekady.


---
## R. REGRESJA I CI NA DOKŁADNYM SHA (§22)

### R.1 CI GitHub Actions na `e6c4c715` — czyli na SHA, którego dotyczy audyt

16 biegów, **9 różnych przepływów, każdy `success`** (podwojenie wynika ze zdarzeń
`push` + `pull_request`; oba przepływy E2E mają filtr ścieżek, stąd po jednym biegu):

| przepływ | status | wnioski |
|---|---|---|
| Python tests | completed | **success** |
| Frontend checks | completed | **success** |
| SLD Determinism Guards | completed | **success** |
| Docs Integrity Guard | completed | **success** |
| Architectural And Repo Hygiene Guard | completed | **success** |
| P0 Extended Guards (V12K invariants) | completed | **success** |
| Physics Label Guard (Catalog-First) | completed | **success** |
| Frontend E2E smoke | completed | **success** |
| Frontend E2E full | completed | **success** |

**To jest realna poprawa względem W6-F.** Sekcja P raportu W6-F mogła przytoczyć CI tylko
dla **rodzica** `ad4629ae`, bo `e6c4c715` w chwili jej pisania jeszcze nie istniał. §22
żądał CI dla dokładnie audytowanego SHA — i ten warunek jest teraz spełniony.

### R.2 Regresja lokalna zestawu dynamiki

`pytest -m "not pandapower and not andes" tests/network_model/dynamika` (marker jak w
`python-tests.yml:55`): **402 passed**, w tym 97 asercji samej obserwabli.

### R.3 Czego CI NIE dowodzi (§26 — „nie interesuje mnie odpowiedź «testy przechodzą»")

Zielone CI **nie podnosi poziomu dowodowego żadnej zdolności** w macierzy S. CI dowodzi
braku regresji względem tego, co już jest sprawdzane; nie dowodzi, że sprawdzane jest to,
co trzeba. Dowodem fizyki są wyłącznie sekcje E–K tego raportu. Dodatkowo obowiązuje
ograniczenie F-6 (gałęzie `protected: false`) — zielone CI jest **obserwacją**, nie
wymuszoną bramką.


---
## S. MACIERZ POZIOMÓW DOWODOWYCH — ZBUDOWANA OD ZERA (§4)

§4 zabrania przeniesienia macierzy Q.2 z W6-F i zabrania, by „L5 równania ruchu" stało się
„L5 dynamiki". Dlatego **wyliczyłem zdolności niezależnie z powierzchni kodu**, nie z listy
W6-F — i wyszło ich **21, a nie 19**: rozdzieliłem ROCOF wirnika od ROCOF szyny (sekcja J
dowodzi, że to różne wielkości) oraz wydzieliłem politykę jakości i wyspę bierną.

Skala (kotwica z mandatu): **L5 = benchmark analityczny ∧ niezależna wyrocznia ∧ zabita mutacja.**
L4 = benchmark analityczny **albo** niezależna wyrocznia. L3 = własna wyrocznia/golden.
L2 = test w repozytorium. L1 = równanie z kodu. L0 = deklaracja. **CI nie podnosi poziomu.**

| # | zdolność | benchmark analityczny | niezależna wyrocznia | zabita mutacja | **poziom** | zmiana vs W6-F |
|---|---|---|---|---|---|---|
| 1 | równanie ruchu (δ, ω) | F.1 mod, G CCT | ANDES + wyrocznia własna | M10, M13 | **L5** | = |
| 2 | pulsacja bazowa ω₀ | F.1 | ANDES | M13 | **L5** | = |
| 3 | człon tłumienia D·Δω | σ = D/(4H) | ANDES (D = 0/2/4) | **M12 (nowa)** | **L5** | = |
| 4 | moc elektryczna `P_e` | F.1 (K_s) | ANDES | M11 | **L5** | = |
| 5 | algebra sieci `g = Y·V − I` | residuum 3,1e−15 | ANDES 1e−08 | M11 | **L5** | = |
| 6 | szyna sztywna (warunek brzegowy) | K_s przez X_T | ANDES | F1b | **L5** | = |
| 7 | **przeliczenia baz H / Z** | G6 (mod po przeliczeniu) | — | **F1a, F1b** | **L4** | = |
| 8 | warunek początkowy z punktu pracy | bit w bit z wyrocznią | ANDES (δ₀ 1,3e−08) | M11 (odmowa) | **L4** | = |
| 9 | trapez niejawny, rząd 2 | **p = 2,000 (4,0000 ×9)** | wyrocznia DOP853/Radau | M15 | **L5** | ↑ z L4 |
| 10 | chwila zdarzenia | **0,0 w 12/12** | ANDES | **M15 (nowa)** | **L5** | = |
| 11 | **re-inicjalizacja algebry po zdarzeniu** | residuum 2,1e−12 | ANDES | **M18 (nowa)** | **L5** | ↑ z L4 |
| 12 | zwarcie węzłowe (bocznik) | CCT / EAC | ANDES | F1b | **L5** | = |
| 13 | zmiana gałęzi | τ-forensyka S4 | ANDES | — | **L4** | = |
| 14 | skok odbioru (stała moc) | τ-forensyka S3 | ANDES | — | **L4** | = |
| 15 | ROCOF **wirnika** | K.3, K.4 | droga A vs B: 2,8e−06 | M10, M13 | **L5** | = |
| 16 | **CZĘSTOTLIWOŚĆ WĘZŁOWA** | **BF-1/2 = 0,0; BF-3 = 1,1e−13; pochodna analityczna 7,105e−15 Hz = 1 ulp** | **własna macierz Y, bez importu produktu** | **M16 (G7)** | **L5** | **↑↑ z L2** |
| 17 | **ROCOF SZYNY** (osobna zdolność) | **∂θ/∂δ, błąd 2,3e−06** | własna macierz Y | M18 (G7) | **L5** | **nowy wiersz** |
| 18 | polityka jakości / `u_f` | nierówność propagacji, próg z `ulp` | — | **M17 (testy repo)** | **L4** | **nowy wiersz** |
| 19 | odmowy fail-closed (11 nazwanych) | — | — | M11 | **L3** | ↑ z L2 |
| 20 | skok mocy mechanicznej | — | — | — | **L0 — BRAK ZDOLNOŚCI** | = (F-3) |
| 21 | **wyspa BIERNA** | — | — | — | **L0 — DEFEKT** | **nowy wiersz (F-8)** |

### S.1 Rozstrzygnięcie BRAMKI B

**Częstotliwość węzłowa: L5.** Komplet jest pełny i każdy człon jest mierzony, nie deklarowany:

* **benchmark analityczny** — trajektorie zadane wzorem (BF-1/BF-2 błąd **dokładnie 0,0**,
  BF-3 **1,14e−13 Hz** przy \|Ȧ\|/A = 10⁴) **oraz** DOKŁADNA pochodna analityczna na realnym
  biegu (**7,105e−15 Hz = 1 ulp(50 Hz)**, 3001 próbek, dwa przebiegi zwarciowe);
* **niezależna wyrocznia** — liczona z **mojej własnej macierzy Y**, bez importu produktu;
  produkt dostarcza wyłącznie trajektorię stanu (δ, ω), co jest poprawnym zakresem dla
  twierdzenia „obserwabla poprawnie odwzorowuje stan → częstotliwość";
* **zabita mutacja** — **M16** (usunięta normalizacja \|V\|²) zabita przez G7; dodatkowo
  M13 i M18 zabijane przez G7.

Do tego dwa niezależne testy niewymagane przez definicję L5: tożsamość cechowania w wyspie
(≤ 8,2e−12 Hz) i prawo skalowania osi odniesienia (∝ X_s do trzeciej cyfry).

**Poziom L2 w W6-F był ZANIŻONY** — nie dlatego, że W6-F się mylił co do faktów, tylko
dlatego, że benchmark, którego wtedy brakowało, **dawało się zbudować** i teraz istnieje.

### S.2 Czego ta macierz NIE mówi

L5 dotyczy **wiersza**, nie systemu. Wiersze 13, 14, 18 stoją na L4; wiersz 19 na L3;
wiersze 20 i 21 na **L0**. Zdanie „dynamika jest na L5" byłoby fałszem złożenia.


---
## T. BRAMKI KOŃCOWE (§23)

### GATE A — RDZEŃ W6-F: **ACCEPTED DONE** (dla zadeklarowanej dziedziny)

Podstawa: wszystkie nośne twierdzenia W6-F odtworzone niezależnie (sekcja D), **ani jedno
nie okazało się nieprawdziwe**; zero mycia goldenów potwierdzone strukturalnie (P);
CI 9/9 na dokładnie audytowanym SHA (R); rząd zbieżności 2,000 z marginesem 2,6 dekady
nad podłogą wyroczni (Q).

**Zastrzeżenie, które NIE cofa tego werdyktu:** F-8 (wyspa bierna) leży **poza dziedziną,
którą W6-F deklarował** — W6-F nie twierdził niczego o rozspójnieniu do braku źródła.
F-8 jest więc **nowym znaleziskiem w nieobjętym obszarze**, a nie obaleniem W6-F.

### GATE B — CZĘSTOTLIWOŚĆ WĘZŁOWA: patrz sekcja S (zależne od wyniku M16/M17)

W6-F postawił tę zdolność na **L2** z uzasadnieniem „brak benchmarku analitycznego".
To uzasadnienie **przestało obowiązywać**: benchmark istnieje i jest DOKŁADNY
(BF-1/BF-2 błąd 0,0; BF-3 1,14e−13 Hz; pochodna analityczna 7,105e−15 Hz = 1 ulp(50);
tożsamość cechowania ≤ 8,2e−12 Hz; prawo skalowania osi odniesienia ∝ X_s).
**Poziom L2 był ZANIŻONY.** Ostateczna litera w sekcji S.

### GATE C — OD-11: **NIE OTWIERAĆ TERAZ**

Klasa **B** (defekt toru wejściowego, nie dynamiki). Propagacja zmierzona i odtworzona
niezależnie co do cyfry. Solver dynamiki jest poprawny przy każdym punkcie pracy
(błąd 3,4e−06…3,0e−05, niezależny od punktu). OD-11 **ogranicza dziedzinę, nie poprawność**
— i jest już tak zapisane. Otwieranie go teraz byłoby wejściem w tor rozpływu (granice Q),
co nie blokuje odbioru dynamiki. §24 wprost zabrania otwierania „tylko dlatego, że istnieje".

### GATE D — OD-12: **NIE OTWIERAĆ TERAZ**

Klasa **B** (status danych wejściowych). Błąd „produkt vs analiza" nie zależy od S_k″
w całym zakresie 1 000…50 000 MVA. Brak S_k″ nie wchodzi po cichu (odmowa nazwana
`dynamika.zrodlo_bez_impedancji`). To jest kwestia **ładu danych**, nie fizyki.

### GATE E — F-1…F-8

| # | co to jest | klasa | **werdykt** | uzasadnienie |
|---|---|---|---|---|
| **F-8** | wyspa bierna → `OverflowError` nienazwany | P1-ODMOWA | **NAPRAWA TERAZ** (wymaga **B-01**) | osiągalne zwykłym studium łączeniowym; jedyna połowa pary bez osłony |
| **F-5** | 681/702 plików testów znika po cichu, wynik ZIELONY | P1-CI | **NAPRAWA TERAZ** | potwierdzone liczbą; podważa każdy przyszły dowód „CI zielone" |
| **F-7** | H < 0 przyjmowane bez odmowy | P2-ODMOWA | **NAPRAWA RAZEM Z F-8** | ta sama klasa (wejście niefizyczne dochodzi do rdzenia); nieosiągalne przez kontrakt ENM, więc niższy priorytet, ale wspólna naprawa |
| **F-1** | układ odniesienia testów ma `s_n = S_bazowa` ⇒ przelicznik = tożsamość | P1-TEST | **NAPRAWA PRZED W6-C** | udowodnione: M7 przeżyła pierwszy przebieg W6-F; luka zamknięta u mnie (G6), ale **nie w zestawie repo** |
| **F-2** | docstring twierdzi, że przyczyna różnicy z ANDES „NIEUSTALONA" | P2-DOK | **NAPRAWA TERAZ** (trywialna) | po sekcji H jest nie tylko nieaktualny, ale **fałszywy**; źródło stałej wskazane w kodzie ANDES |
| **F-3** | brak zdarzenia „skok mocy mechanicznej" | ZDOLNOŚĆ | **DECYZJA WŁAŚCICIELA** | `P_m` jest stanem o zerowej pochodnej — implementacyjnie mały, ale to rozstrzygnięcie ZAKRESU, nie defekt |
| **F-4** | główny checkout ma 23 pliki starsze niż HEAD | P2-CHECKOUT | **NIE NAPRAWIAM** | to checkout innej sesji; ingerencja groziłaby skasowaniem cudzej pracy |
| **F-6** | gałęzie `protected: false` | P2-ŁAD | **DECYZJA WŁAŚCICIELA** | ustawienia repozytorium poza moim zakresem; konsekwencja opisana w R.3 |


---
## U. DECYZJA O NASTĘPNYM STANIE (§24, §27)

§24 zostawia wybór mnie i zabrania otwierania OD-11/OD-12 „tylko dlatego, że istnieją".
Decyduję z dowodów, nie z listy życzeń.

### U.1 Co zamykam

**W6-F = ACCEPTED DONE** dla dziedziny C.1 (bramka A). Częstotliwość węzłowa wychodzi
z L2 na poziom wynikający z pomiarów (bramka B, sekcja S). OD-11 i OD-12 **zostają
zamknięte jako granice dziedziny** — nie otwieram ich (bramki C i D).

### U.2 Czego NIE zaczynam

**Nie zaczynam W6-B. Nie zaczynam W6-C.** Powód jest jeden i jest pomiarowy: F-8 pokazuje,
że rozspójnienie do wyspy biernej — zwykły przypadek studium łączeniowego i N−1 — kończy
się w rdzeniu **wyjątkiem nienazwanym**, a nie odmową. Wystawianie dynamiki na kolejny etap
przed zamknięciem toru odmowy byłoby budowaniem na znanej dziurze.

### U.3 Co proponuję jako następny krok — JEDNA wąska karta

**Karta „TOR ODMOWY DYNAMIKI"** — jedna klasa, nie zbiór instancji:

| poz. | zakres | dlaczego w tej samej karcie |
|---|---|---|
| 1 | **F-8**: wykrycie wyspy bez źródła przy re-inicjalizacji → odmowa nazwana; oraz zamiana przepełnień/wartości niefinitnych w `siec.py`/`obserwable.py` na `OdmowaDynamiki` | rdzeń problemu |
| 2 | **F-7**: `H ≤ 0` → odmowa nazwana zamiast `ZeroDivisionError` / cichego biegu | **ta sama klasa**: wejście niefizyczne dochodzi do rdzenia bez nazwanej odmowy |
| 3 | **F-2**: docstring `test_wyrocznia_andes.py` twierdzący, że przyczyna „NIEUSTALONA" | po sekcji H jest fałszywy; koszt naprawy ≈ zero |
| 4 | **F-1**: układ odniesienia testów repo z `s_n = S_bazowa` + bramka wzorowana na G6 | bez tego zestaw repo pozostaje ŚLEPY na błąd kierunku zmiany bazy |
| 5 | **F-5**: ciche pominięcie 681/702 plików testów → twardy błąd konfiguracji | podważa **każdy** przyszły dowód oparty na „CI zielone" |

**Bramka wejściowa karty: B-01** — pozycje 1 i 2 edytują ZAMROŻONY rdzeń dynamiki
(W6-3C, dyrektywa właściciela 2026-09-18). To jest jedno z jawnie dozwolonych zatrzymań,
więc czekam na zgodę właściciela zamiast wchodzić w rdzeń samodzielnie.

### U.4 Czego w tej rundzie NIE zrobiłem — i dlaczego

| rzecz | powód |
|---|---|
| naprawa F-8 / F-7 / F-5 / F-1 / F-2 | §27 kończy rundę na raporcie; naprawa nie jest „zmianą niezbędną do domknięcia dowodu"; poz. 1–2 wymagają B-01 |
| otwarcie OD-11 / OD-12 | §24 zabrania; oba są granicami dziedziny, nie defektami dynamiki |
| zmiany w drzewie produktu | **ZERO** — cały aparat poza repozytorium; mutacje nakładane i przywracane, przywrócenie weryfikowane |

### U.5 STOP

Zgodnie z §27 kończę na raporcie. Nie rozpoczynam samodzielnie następnego dużego wątku.


---
