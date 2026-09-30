# `network_model/solvers/stability_rms` — dyspozycja forensyczna

**Zlecenie:** decyzja właściciela: *„stability_rms is not deleted solely because it has zero
production imports. Complete the forensic disposition first."* Dokument ustala, **czym ten pakiet
jest**, co z niego warto zachować i czego kasacja by kosztowała.

**Baza:** HEAD `cb2cb93e`. Rozmiar: 603 linie (`__init__.py` 33, `contracts.py` 179, `engine.py` 391).

---

## 1. Czym pakiet jest wg własnej deklaracji, a czym jest naprawdę

**Deklaracja** (`__init__.py:1-19`): pakiet miał dostarczać *kontrakty + adapter ze statusem
`no_module`*, bo „numeryczne solvery RMS … wymagają eksperckiej implementacji … ~42 osobodni
eksperta solver", a solver miał powstać w osobnej sesji.

**Stan faktyczny:** `engine.py` zawiera `run_stability_rms`, `_model_derivative`,
`_trapezoidal_step`, `_compute_eigenvalues` — czyli implementację, której nagłówek pakietu
zaprzecza. **Nagłówek i zawartość są ze sobą sprzeczne od nieznanej daty.**

---

## 2. Co ta implementacja liczy (pomiar z kodu)

| Obserwacja | Miejsce | Znaczenie |
|---|---|---|
| moc elektryczna maszyny: `Pe = V·sin(δ)` | `engine.py:93` (komentarz: „uproszczony air-gap") | brak SEM wewnętrznej, brak reaktancji, brak sieci — to nie jest model maszyny, tylko wykres podręcznikowy przy `E = 1` i `X = 1` |
| `dδ/dt = 2π·50,0·ω` | `engine.py:95` | **50 Hz zaszyte w kodzie**, wbrew regule „częstotliwość z danych" |
| napięcie jako **skalar** `voltage_pu: float` | `engine.py:77-81` | zero sprzężenia sieciowego — każdy model całkuje się osobno przy zadanym napięciu |
| domyślne wartości parametrów: `H=4,5`, `D=1,0`, `Ka=100,0`, `Ta=0,05`, `Tg=0,5`, `R=0,05`, `Tw=10,0` | `engine.py:90-120` i dalej | ciche podstawienia liczbowe — klasa zakazana w tym repozytorium |
| status `no_module` | `contracts.py:88,124,171`, `engine.py:307` | wprost zakazany przez zasadę nr 1 |
| pakiet na **allowliście** guarda `no_module_zero_guard` | `scripts/no_module_zero_guard.py:64` | wyjątek, który pozwolił temu przetrwać |

**Wniosek:** to nie jest „drugi solver RMS o innej dokładności". To zbiór **rozprzężonych równań
skalarnych** z zaszytymi domyślnymi parametrami, bez sieci, bez bazy i bez jednostek z danych.
Rdzeń `network_model/solvers/dynamika` rozwiązuje to samo zadanie ze sprzężeniem sieciowym,
jakobianem, zdarzeniami i wyroczniami.

---

## 3. Konsumenci — pomiar

| Warstwa | Stan |
|---|---|
| produkcja (`backend/src/**`) | **ZERO importów.** Cztery wystąpienia napisu `stability_rms` poza pakietem to komentarze i docstringi: `api/catalog.py:475`, `network_model/catalog/der_dynamic/__init__.py:14`, `.../der_dynamic/models.py:4,126` |
| testy | `backend/tests/solvers/test_pr15_pr16_solvers.py` (wspólny plik z testami `frt_hvrt`) |
| frontend | brak |

---

## 4. Co warto zachować — i to jest jedyny realny zysk z tego pakietu

**Lista rodzin modeli** (`contracts.py:18-35`) jest listą WYMAGAŃ, spisaną kiedyś przez kogoś, kto
patrzył na zakres produktu. Zestawienie z biblioteką W6-3A:

| Rodzina z `DynamicModelKind` | Stan w `dynamika` |
|---|---|
| maszyna synchroniczna 6. rzędu | **JEST** (pełna, z nasyceniem) |
| regulator napięcia (4 typy) | **JEST** jeden typ (SEXS); IEEE T1/T2/AC4A/ST5B — brak |
| regulator obrotów (3 typy) | **JEST** jeden typ (TGOV1); GAST, IEEE-G1 — brak |
| stabilizator PSS (PSS2A/PSS2B) | **JEST** jeden typ (PSS1A) |
| **silnik indukcyjny 5. rzędu** | **BRAK — i brak go też w zamrożonej macierzy zdolności** |
| turbina typ 1 i 2 | brak (jawna odmowa rdzenia) |
| turbina typ 3 i 4 | **JEST** |
| przekształtnik PV, magazyn | **JEST** (GFL/GFM/magazyn) |

**Silnik indukcyjny jest jedyną pozycją, która wnosi coś nowego do CELU, a nie do kodu.** Duże
silniki SN decydują o zachowaniu napięciowym po zwarciu (zapad, zatrzymanie, prąd przy odbudowie).
Rodzina nie występuje ani w bibliotece urządzeń, ani w macierzy zdolności docelowej — więc jej
dopisanie jest **rozszerzeniem celu**, czyli decyzją właściciela (**OD-37**).

Poza tym: zestaw typów regulatorów (AVR/GOV/PSS) jest listą kandydatów do rozszerzenia biblioteki —
wartościową jako spis, bezwartościową jako kod.

---

## 5. Dyspozycja proponowana

| Krok | Treść | Warunek |
|---|---|---|
| 1 | **Przeniesienie wartości poznawczej**: lista rodzin modeli i typów regulatorów trafia do macierzy zdolności jako pozycje celu (silnik indukcyjny → OD-37; warianty AVR/GOV/PSS → rejestr rozszerzeń biblioteki) | przed kasacją |
| 2 | **Zapis dowodu**: ten dokument jako trwały ślad, czym pakiet był i dlaczego nie jest wart utrzymania | wykonane |
| 3 | **Kasacja pakietu** wraz z jego testami, wg procedury kasacji stosowanej w tym repozytorium (inwentarz → kasacja → bramka wskrzeszenia → retarget dokumentów) | po kroku 1 |
| 4 | **Zdjęcie wpisu z allowlisty** `no_module_zero_guard.py:64` — zapadka tylko w dół | razem z krokiem 3 |
| 5 | **Retarget czterech docstringów**, które przywołują pakiet jako konsumenta katalogu dynamicznego DER | razem z krokiem 3 |

**Czego kasacja NIE załatwia:** wpis `frt_hvrt/` pozostaje na allowliście guarda, bo tamten tor
żyje do fali W6-3H/W6-D. To osobna sprawa i nie wolno jej dołączyć „przy okazji".

**Bramka:** pakiet nie należy do zbioru zamrożonych rdzeni (`scripts/solver_diff_guard.py:39-47`
wymienia siedem plików rozpływu i zwarć), więc kasacja **nie wymaga bramki B-01**. Wymaga
natomiast kroku 1 — i to jest powód, dla którego nie została wykonana od ręki.
