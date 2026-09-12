# PRZEKAZANIE PRZED DECYZJĄ ARCHITEKTONICZNĄ — INŻYNIERIA DYNAMIKI (2026-09)

**Typ dokumentu:** materiał decyzyjny (PRE-DECISION)
**Status:** PAKIET INŻYNIERSKI GOTOWY DO DECYZJI ARCHITEKTONICZNEJ
**Data:** 2026-09-12
**Gałąź:** `claude/max-dynamic-audit-kzbivg`
**Adresat:** Fable 5.1 jako Lead Principal Engineer

> **CZYM TEN DOKUMENT NIE JEST.** Nie ustanawia architektury kanonicznej, nie
> zmienia żadnego kontraktu FROZEN, nie przyznaje żadnego statusu dowodowego.
> Warstwa dynamiczna pozostaje `UNVALIDATED_MODEL`; bezpiecznik D-00 (FAIL
> CLOSED) obowiązuje bez zmian.

---

## 0. RELACJA DO ISTNIEJĄCYCH DOKUMENTÓW — przeczytaj najpierw

Ten dokument **NIE zastępuje** i **NIE powiela**:

| Dokument | Co zawiera | Relacja |
|---|---|---|
| `docs/plan/KARTA_MAX_DYNAMIC_SIMULATION_AUDIT_2026-09.md` | audyt + rejestr D-00…D-13 | obowiązuje bez zmian |
| `docs/plan/PAKIET_DECYZYJNY_DYNAMIKA_D01_D13_2026-09.md` | pełny pakiet decyzyjny (1390 wierszy) z erratą | **dokument nadrzędny dla dynamiki** |
| `backend/research/README.md` | spis laboratorium badawczego | obowiązuje, uzupełniony |

**Ten dokument dokłada do nich wyłącznie to, co powstało w tej sesji.**

### 0.1 KOREKTA WŁASNA — sposób pracy w tej sesji

Zaczynając, przeszukałem `backend/src/**` i znalazłem tam wyłącznie produkcyjny
stub `network_model/solvers/stability_rms/engine.py`. Na tej podstawie uznałem,
że laboratorium dynamiczne trzeba zbudować, i zbudowałem równoległy rdzeń
(~3 500 wierszy) w `backend/src/research/dynamics/`.

**To było błędne.** Dojrzałe laboratorium **już istniało** w
`backend/research/dynamic_lab/` — 20 modułów, 13 413 wierszy, 29 plików testów,
wyrocznia ANDES, badanie sztywności, CCT z kryterium równych pól. Mój katalog
leżał POZA moim zasięgiem wyszukiwania, bo szukałem tylko pod `src/`.

Zbudowany przeze mnie rdzeń **skasowałem w całości** przed scaleniem: dwie
ścieżki tej samej fizyki to defekt, który kanon repozytorium nazywa wprost, a
utrzymywanie słabszej kopii obok dojrzałego oryginału byłoby dokładnie nim.
Zachowałem wyłącznie to, czego w laboratorium NIE BYŁO (§3).

Zapisuję to widocznie, a nie cichą edycją — zgodnie z dyscypliną erraty przyjętą
w pakiecie decyzyjnym.

---

## 1. HEAD i commity

| Pozycja | Wartość |
|---|---|
| Punkt wyjścia | `b2dbd376` |
| Milestone A (produkcja) | `4ae788e9` |
| Milestone B (laboratorium) | patrz `git log` gałęzi |

---

## 2. MILESTONE A — naprawy PRODUKCYJNE (commit `4ae788e9`)

Domknięcie wszystkich znalezisk drugiej niezależnej recenzji. Szczegóły w
treści commitu; skrót:

| Znalezisko | Naprawa | Dowód |
|---|---|---|
| **P0** — cztery zdolności bez punktu wywołania bramki | `network_model/core/autorytet_wyniku_zwarciowego.py`; proweniencji nie da się zadeklarować, tylko wyprowadzić; wpięte w 4 produkcyjne punkty | `tests/api/test_granica_autorytetu_downstream.py` (10), `tests/application/test_autorytet_wyniku_zwarciowego.py` (124) |
| **P1-DELTA-07** — `k_sc=1e308` → `I_k=inf` z etykietą DEKLARACJA | kontrola dziedziny WYNIKU, znacznik `POZA_DZIEDZINA_WYNIKU`, kod SI-114 | macierz akceptacji w testach granicy |
| **P1-DELTA-08** — globalne `ready` zawyżało komunikat | pole `ready` USUNIĘTE; `kompletnosc_modelu` + mapa `zdolnosci` | `test_kompletnosc_modelu_nie_jest_zgoda_na_analize` |
| **P2-DELTA-09** — `SOURCE_VERIFIED` bez weryfikacji | → `SOURCE_REFERENCED` | pomiar inwentarza |
| **P2-DELTA-10** — czerwona bramka zakresu | `domain/dobor_aparatu_pola.py` do `CONTRACT_SOURCES` (+0 trafień, 0 kolizji) | `scripts/test_solver_input_substitute_guard.py` 44/44 |
| **P2-DELTA-11 + Icw/Icu nN** | `Ics ≤ Icu` zostaje twarde (IEC 60947-2 §4.3.5.2.2); `Icw ≤ Icu` → WIARYGODNOSC; odstępstwa dają wynik STRUKTURALNY | `test_niezmienniki_fizyczne_katalogu.py` 28/28 |

**Weryfikacja Milestone A:** backend 12 031 passed / 0 failed; frontend 11 989
passed / 0 failed; ruff 0; black 0; 24 guardy zielone.

---

## 3. MILESTONE B — wkład do LABORATORIUM badawczego

Tylko to, czego w laboratorium nie było.

### 3.1 DEFEKT: wyłączenie jednego toru rozpinało cały korytarz

**Odtworzenie przed naprawą** (nie wydedukowane z lektury):

```
dwa tory GEN–SYS po x = 0,40 p.u.
Ybus[0,0] przed             = -5j
z_wylaczona_galezia("GEN","SYS")
Ybus[0,0] po                =  0j        <- korytarz ROZPIĘTY
stan gałęzi                 = [False, False]   <- oba tory
```

`TopologiaSieci.z_wylaczona_galezia(od, do)` adresowało gałąź **parą szyn**, a
pętla nie miała przerwania — wyłączało więc WSZYSTKIE tory między wskazanymi
szynami naraz. `Galaz` nie miała żadnej tożsamości, więc nie dało się nawet
wskazać, który tor ma paść.

**Dlaczego było niewidoczne:** żaden istniejący scenariusz nie miał dwóch
gałęzi na tę samą parę szyn. Skutek był CICHY i wyglądał wiarygodnie — przebieg
pokazywał utratę synchronizmu po „wyłączeniu linii", czyli to, czego badacz się
spodziewa po wyłączeniu OSTATNIEGO toru.

**Ten sam wzorzec był już raz w tym laboratorium naprawiony dla BOCZNIKÓW**
(`bez_bocznika_o_zrodle` zastąpiło kasowanie wszystkiego na szynie, defekt E1
audytu). Gałąź została wtedy pominięta.

**Naprawa:** `Galaz.ident` (nadawany deterministycznie `"<od>-<do>#<n>"`),
`z_wylaczona_galezia_po_id(ident)`, para szyn dopuszczalna **tylko gdy
jednoznaczna** (inaczej błąd głośny), `WylaczenieGalezi(ident=...)`.

**Regresja:** `tests/research/test_tory_rownolegle.py` (10 przypadków, w tym
obie strony predykatu i powtórne wyłączenie).

### 3.2 POMIAR: błąd trajektorii punkt po punkcie wobec ANDES

Domyka wiersz z §5.2 pakietu decyzyjnego, który brzmiał **„NIE ZMIERZONY"**.

Istniejące porównania uruchamiały w ANDES wyłącznie `PFlow` i `EIG` — po stronie
wzorca trajektoria nie powstawała w ogóle. Nowy moduł
`dynamic_lab/wzorzec_trajektoria.py` uruchamia `TDS` po obu stronach.

**Przypadek:** SMIB o dwóch torach (0,30 p.u. każdy), maszyna klasyczna /
GENCLS, `H = 4 s`, `P = 0,50` p.u.; wyłączenie jednego toru w `t = 1,0 s`
(korytarz 0,15 → 0,30 p.u.); amplituda kołysania ≈ 8,8°.

**Wynik przy kroku 1 ms po obu stronach:**

| Wielkość | max \|Δ\| | RMS | max \|Δ\| / zakres |
|---|---|---|---|
| kąt wirnika δ | 4,102e-05 rad | 2,203e-05 rad | 2,68e-04 |
| prędkość ω | 9,947e-07 p.u. | 5,487e-07 p.u. | 2,56e-04 |
| punkt pracy δ₀ | 3,676e-09 rad | — | — |

**Drabina kroku — błąd maleje, ale ma PODŁOGĘ:**

| krok | max \|Δδ\| [rad] | stosunek |
|---|---|---|
| 4 ms | 1,838e-04 | — |
| 2 ms | 6,899e-05 | 2,66× |
| 1 ms | 4,102e-05 | 1,68× |
| 0,5 ms | 3,354e-05 | **1,22×** |

**Interpretacja — uczciwa.** Błąd jest zdominowany dyskretyzacją do ok. 1 ms, po
czym wychodzi na podłogę ≈ 3e-05 rad zamiast dążyć do zera. Podłoga **nie jest**
błędem równań (widmo zgadza się do 1e-08) ani punktu pracy (3,7e-09 rad).
**Zmierzone prawdopodobne źródło:** ANDES zagęszcza krok w otoczeniu
przełączenia (`min dt = 1e-04 s` niezależnie od zadanego `tstep`), laboratorium
przechodzi tę chwilę krokiem stałym — różnica dotyczy **traktowania
nieciągłości**, nie fizyki. **Nie rozstrzygnięto tego do końca** i tak jest
raportowane.

**Odtworzenie:** `pytest backend/tests/research/test_wzorzec_trajektoria.py`
(pomijane bez ANDES — pominięta wyrocznia nie jest walidacją).

---

## 4. USTALENIE ARCHITEKTONICZNE — kontrakt integratora wyklucza metody wielokrokowe

**Pomiar:**

```
Integrator.krok(self, f, x, t, dt) -> (x_next, ewaluacje)
zarejestrowane: euler_jawny(1), rk4(4), euler_niejawny(1), trapez_niejawny(2)
```

Kontrakt jest **jednokrokowy**: nie ma w nim miejsca na historię `x_{n-1}`.

**Konsekwencja.** Metody WIELOKROKOWE (rodzina BDF, o którą pyta brief) nie dają
się dołożyć bez jednego z dwóch:

- **OPCJA A** — zmiana kontraktu integratora na przyjmujący historię. Koszt:
  dotyka wszystkich czterech istniejących integratorów, silnika i
  `IntegratorZNiezmiennikami`. Zysk: BDF2/BDF3 stają się zwykłymi kandydatami.
- **OPCJA B** — integrator ze stanem mutowalnym trzymającym `x_{n-1}`. Koszt:
  **reintrodukuje klasę defektu, którą to laboratorium już raz naprawiło jako
  P0** — stan przeciekający między biegami (`symuluj` dokumentuje zmierzony
  skutek: `max|różnica| = 6,908e-01 p.u.` i wynik deklarujący inną topologię niż
  policzona). Odradzam.

**Świadomie NIE zaimplementowałem BDF.** Wybór między A i B jest decyzją o
kontrakcie, czyli dokładnie tym, co brief rezerwuje dla prowadzącego. Wstawienie
BDF-a przez OPCJĘ B „żeby był" cofnęłoby naprawiony defekt.

---

## 5. STAN LABORATORIUM — zmierzony, nie zadeklarowany

| Pozycja | Stan |
|---|---|
| moduły | 21 (20 istniejących + `wzorzec_trajektoria.py`) |
| testy badawcze | 834 passed → po dołożeniu: patrz §7 |
| izolacja od produkcji | `research_isolation_guard` PASSED (801 plików produkcyjnych, 21 badawczych) |
| wyrocznie zewnętrzne | ANDES 2.0.0 (zainstalowany, WYKONANY), pandapower 3.5.4 (używany w `wzorzec_zewnetrzny`) |
| status dowodowy | `UNVALIDATED_MODEL`; D-00 FAIL CLOSED nietknięty |

---

## 6. DECYZJE ZASTRZEŻONE DLA PROWADZĄCEGO

Bez zmian względem pakietu decyzyjnego D-01…D-13, **plus jedna nowa**:

| # | Decyzja | Materiał |
|---|---|---|
| D-01…D-13 | jak w `PAKIET_DECYZYJNY_DYNAMIKA_D01_D13_2026-09.md` | tam |
| **NOWA** | kontrakt integratora: jednokrokowy (dziś) czy z historią (umożliwia BDF) | §4 tego dokumentu |
| **NOWA** | czy podłoga 3e-05 rad w trajektorii wymaga uzgodnienia traktowania nieciągłości między narzędziami | §3.2 |

Schemat DAE (rozdzielony kontra jednoczesny) pozostaje otwarty tak, jak opisuje
errata #3 pakietu decyzyjnego — **nie** rozstrzygam go tym dokumentem.

---

## 7. CZEGO NIE ZROBIŁEM I DLACZEGO

| Pozycja | Powód |
|---|---|
| BDF2/BDF3 | wymaga decyzji o kontrakcie integratora — §4 |
| drugi rdzeń DAE (schemat jednoczesny) | zbudowany i **skasowany**; duplikacja dojrzałego laboratorium — §0.1 |
| walidacja PSS, nasycenia, ograniczników AVR wobec ANDES | brak odpowiedników w modelach obu narzędzi (pakiet decyzyjny §5.1) |
| uzupełnienie profili normatywnych OSD | wymaga danych normatywnych, których nie mam; zakaz fabrykacji |
| promocja do `QUALIFIED_MODEL` / `VALIDATED_SIMULATION` | decyzja prowadzącego, nie skutek zielonych testów |
