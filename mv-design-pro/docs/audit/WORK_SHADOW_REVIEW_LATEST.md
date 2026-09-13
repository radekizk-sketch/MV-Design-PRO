# MV-DESIGN-PRO — INDEPENDENT WORK SHADOW REVIEW

Data: 2026-09-13. Tryb: READ-ONLY wobec kodu, adversarial, evidence-based. Zmieniono wyłącznie dozwolone pliki raportowe. Checkpoint oznacza wykonanie przeglądu, nie akceptację ani zamknięcie niewykonanych kontroli.

## REVIEW RANGE

- REVIEW_BASE_SHA: `2345ab4566bb3c441bc3abad0ccbe76a4374f31c`
- REVIEW_HEAD_SHA: `367a81a17e478f9dbea6f6b0a03bf191ba9318ba`
- Rodzic zmiany wykonawczej: `4c0ab856bd75f713bc2b7dcd94fe81ec4738c02d`
- Merge base zakresu: `2345ab4566bb3c441bc3abad0ccbe76a4374f31c`
- Merge base gałęzi z `main`: `7e84753adbc4b0e50de9a1fd4f1022f1cfd01903`
- Branch: `claude/max-dynamic-audit-kzbivg`
- PR: NONE. Powiązany PR #475 pozostaje otwarty dla starszej gałęzi `claude/opus5-dynamic-physics-audit-fixes`, HEAD `1e96202535abb0acfb123ebac8a49dae430e792c`.

Zakres kodu to jeden commit `367a81a1`; po `2345ab45` znajdują się także dwa dozwolone commity raportowe. Zmiana dotyczy wyłącznie kwalifikacji wyników badań: zamkniętego zbioru statusów oraz oceny rzędu integratorów.

## EXECUTIVE VERDICT

**REJECT CURRENT DELTA**

Dokładne kontrprzykłady P1-DELTA-35 i P1-DELTA-36 z poprzedniej recenzji zostały naprawione. Brak statusu, status nieznany i `pozycje=[]` nie ustanawiają już kwalifikacji. Rzeczywisty benchmark ośmiu pozycji daje teraz `LUKI=[]`, `BRAKI=[]`; CCT wynosi `0.42087890625 s` wobec `0.423863267422 s`, a residua inicjalizacji `8.32667e-17` i `0.0`.

Naprawa nadal nie zamyka klasy błędu. Raport zawierający wyłącznie dwie pozycje RK4, z pominięciem obu metod Eulera i trapezu, uzyskuje `ZAKWALIFIKOWANE`. Tak samo kwalifikowane są dwie pozycje z błędem równym zero albo ujemnym: filtr dodaje do oceny rzędu wyłącznie błędy `finite && > 0`, a odrzuconych rekordów nie klasyfikuje jako brak ani lukę. „Niepusty” nie oznacza „kompletny i dziedzinowo poprawny”.

Warstwa pozostaje `UNVALIDATED_MODEL`. Wynik nie jest `VALIDATED_SIMULATION`, nie stanowi dowodu NC RfG i nie jest gotowy regulacyjnie.

## LEVELS OF VERIFICATION

- IMPLEMENTED: TAK dla zadeklarowanych napraw P1-DELTA-35/36.
- SOFTWARE-VERIFIED: CZĘŚCIOWO; wykonano niezależne sondy Python i rzeczywiste obliczenia CCT/integratorów, ale runtime nie zawiera `pytest`.
- MATHEMATICALLY VERIFIED: CZĘŚCIOWO; wzór dwupunktowego rzędu jest poprawny wyłącznie dla dodatnich błędów i różnych dodatnich kroków, których dziedzina nie jest egzekwowana.
- NUMERICALLY VERIFIED: CZĘŚCIOWO dla rzeczywistego benchmarku; REFUTED dla fail-closed kompletności uprzęży.
- PHYSICALLY SUPPORTED: BEZ NOWEGO DOWODU; delta nie zmienia modeli fizycznych.
- PHYSICALLY VALIDATED: NIE.
- PRODUCTION-READY: NIE dla dynamiki.
- REGULATORY-EVIDENCE-READY: NIE.

## NEW P0/P1

### P1-DELTA-39 — niekompletna lub niedozwolona populacja integratorów nadal daje `ZAKWALIFIKOWANE`

- Subsystem: research qualification / numerical evidence chain.
- Claim under test: stan dodatni oznacza kompletny benchmark wymaganych metod, prawidłowe błędy i zmierzony rząd każdej metody.
- Independent evidence: `_braki_kwalifikacji()` wymaga jedynie niepustej listy. `_luki_rzedu_integratorow()` iteruje tylko po nazwach obecnych w raporcie; nie porównuje ich ze zbiorem oczekiwanym. Rekord jest dodawany do grupy tylko, gdy `blad > 0`. Błąd `0.0` lub ujemny jest skończony, nie trafia do kontroli NaN/Inf, znika z oceny rzędu i nie tworzy naruszenia.
- Reproduction:

```bash
cd mv-design-pro
python3 - <<'PY'
import sys
sys.path.insert(0,'backend/research')
import kwalifikacja as k

base={
 'mutacje':{'przezyly_krytyczne':[],'liczba_mutacji':13},
 'trajektoria_vs_andes':{'stan':'WYKONANE','status':'zgodne_w_granicach_wzorca'},
 'czas_krytyczny_zwarcia':{'stan':'WYKONANE','zgodne':True},
 'residua_inicjalizacji':{'najgorsza_norma_pochodnej':0.0},
}
cases={
 'tylko_rk4':[
  {'integrator':'rk4','krok_s':.002,'zbiegl':True,'blad_max_vs_odniesienie':1.438481e-9},
  {'integrator':'rk4','krok_s':.010,'zbiegl':True,'blad_max_vs_odniesienie':9.014917e-7}],
 'blad_zero':[
  {'integrator':'rk4','krok_s':.002,'zbiegl':True,'blad_max_vs_odniesienie':0.0},
  {'integrator':'rk4','krok_s':.010,'zbiegl':True,'blad_max_vs_odniesienie':0.0}],
 'blad_ujemny_i_nieznana_metoda':[
  {'integrator':'ghost','krok_s':.002,'zbiegl':True,'blad_max_vs_odniesienie':-1.0},
  {'integrator':'ghost','krok_s':.010,'zbiegl':True,'blad_max_vs_odniesienie':-5.0}],
}
for name,pozycje in cases.items():
 r=dict(base,porownanie_integratorow={'stan':'WYKONANE','pozycje':pozycje})
 l=k._luki_kwalifikacji(r); b=k._braki_kwalifikacji(r)
 print(name,l,b,'ZAKWALIFIKOWANE' if not l and not b else 'BLOCKED')
PY
```

Wynik zmierzony:

```text
tylko_rk4 [] [] ZAKWALIFIKOWANE
blad_zero [] [] ZAKWALIFIKOWANE
blad_ujemny_i_nieznana_metoda [] [] ZAKWALIFIKOWANE
```

- Why it matters: benchmark może utracić trzy z czterech metod albo nieść liczby poza dziedziną błędu i nadal ustanowić dodatni stan procesu. To jest false-positive kwalifikacji i przerwanie łańcucha raw evidence → comparator → criteria → verdict.
- Existing Opus tests: NIE. Test pełnego biegu sprawdza, że lista jest niepusta i że RK4 jest dokładniejszy od Eulera jawnego; test logiki kwalifikacji używa wyłącznie dwóch rekordów RK4. Brak testu równości zbioru metod/kroków i brak testu błędu zero/ujemnego.
- Expected engineering property: wymagany manifest benchmarku ma być jawny i kompletny; każda oczekiwana metoda ma wymagane, unikalne kroki; błąd musi należeć do jawnej dziedziny; rekord niedozwolony lub pominięty blokuje kwalifikację.
- Acceptance test: usunięcie dowolnej metody/kroku, duplikat, nieznana metoda, `error<0`, a w tym niezerowym benchmarku także `error=0`, muszą dać `NIEKOMPLETNE` albo `ODRZUCONE`, nigdy kod 0.
- Resolution: **SOL CAN RESOLVE**.

## NEW P2

### P2-DELTA-40 — ocena rzędu jest dwupunktowa i korzysta z deklaracji tej samej implementacji

Rząd jest liczony tylko z dwóch kroków `2 ms` i `10 ms`, a wartość oczekiwana pochodzi z `INTEGRATORY[nazwa].rzad` w tym samym module implementacyjnym. Jest to użyteczny test regresyjny, ale nie niezależna weryfikacja rzędu asymptotycznego. Dwie próbki nie pokazują, czy obliczenia są w obszarze asymptotycznym, a wspólna zmiana algorytmu i jego etykiety może zachować zgodność. Wymagany profesorski test `dt, dt/2, dt/4, dt/8` nadal nie został wykonany w tej uprzęży. Kryterium odbioru: co najmniej trzy ilorazy błędów na wspólnych czasach, osobno dla odcinków gładkich/zdarzeń/ograniczników, oraz oczekiwany rząd przypięty poza mutowalnymi metadanymi implementacji.

## PHYSICS SCORE

**UNRESOLVED DLA DELTY.** Nie zmieniono modeli urządzeń, sieci ani zdarzeń. Rzeczywisty benchmark SMIB potwierdza spójność numeryczną badanego przypadku, nie wiarygodność fizyczną maszyny, DER, BESS, AVR/governora ani FRT.

## MATHEMATICS SCORE

**PARTIALLY SUPPORTED.** Dla dodatnich `e_1,e_2` oraz różnych dodatnich `h_1,h_2` wzór

`p = log(e_2/e_1) / log(h_2/h_1)`

jest poprawnym dwupunktowym estymatorem rzędu. Kod nie egzekwuje jednak pełnej dziedziny: zero i wartości ujemne są pomijane, a nie odrzucane; kompletność siatki nie jest dowodzona. Nie potwierdzono rzędu na czterostopniowej drabinie.

## NUMERICAL SCORE

**PARTIALLY SUPPORTED DLA BENCHMARKU / REFUTED DLA KWALIFIKACJI.** Niezależnie uruchomiono osiem rzeczywistych pozycji. Oszacowane rzędy są zgodne z deklarowanymi w paśmie 0.5, a najgorszy błąd na kroku 2 ms wynosi `1.5134076e-02 rad < 0.5 rad`. Stary false-negative P1-DELTA-36 jest zamknięty. Nowy false-positive P1-DELTA-39 pozostaje.

## ENERGY / NETWORK SCORE

**UNRESOLVED DLA DELTY.** Zmiana nie dotyczy bilansu energii, KCL, P/Q, Ybus ani per-unit. Nie powtórzono pełnego `Delta E ≈ integral P_bess dt` ani lokalnych residuów wszystkich szyn. Wcześniejsze ograniczenia energetyczne i sieciowe pozostają pending.

## CATALOG ENGINEERING SCORE

**UNRESOLVED DLA DELTY.** Brak zmian katalogowych. Kompletność szablonu `57/57` nadal nie jest równoważna produkcyjnej weryfikacji 23 rodzin ani proweniencji producenta. Brak nowego dowodu zmieniającego tę klasyfikację.

## CI DELTA

Dla dokładnego `367a81a17e478f9dbea6f6b0a03bf191ba9318ba` dostępne dane GitHub zwróciły 0 workflow runs i 0 commit statuses. Gałąź nie ma PR; wrapper biegów obejmuje tylko zdarzenia pull request. Powiązany PR #475 pozostaje na `1e962025...`. Nie ma niezależnego zewnętrznego dowodu „wszystko zielone”.

Lokalnie `python3 -m pytest ...` zakończył się komunikatem `No module named pytest`; pełnego zestawu testów nie wykonano i nie udaje się jego wykonania. Rzeczywiste funkcje CCT, residuów i ośmiu pozycji integratorów wykonano bez pytest.

## MUTATION STATUS

- Brak statusu trajektorii: **KILLED** — pojawia się brak wymaganego pola.
- Nieznany status trajektorii: **KILLED** — status spoza zbioru zamkniętego.
- Pusta lista integratorów: **KILLED** — zero pozycji.
- Pełny ośmiopozycyjny benchmark autora: **ACCEPTED BY GATE**; `LUKI=[]`, `BRAKI=[]`.
- Pominięcie trzech metod przy zachowaniu dwóch RK4: **SURVIVED**; `ZAKWALIFIKOWANE`.
- Błąd `0.0` dla dwóch kroków: **SURVIVED**; `ZAKWALIFIKOWANE`.
- Błąd ujemny z nieznaną metodą: **SURVIVED**; `ZAKWALIFIKOWANE`.
- Wykonywalny katalog nadal zawiera 13 mutacji, nie deklarowane wcześniej 16. Pełnej kampanii nie wykonano bez pytest.

## PRIOR FINDINGS — STATUS

### Zamknięte lub ograniczone

- P1-DELTA-35: **CLOSED FOR EXACT REPRODUCTIONS** — brak statusu, status nieznany i lista pusta są blokowane. Klasa pozostaje otwarta jako P1-DELTA-39.
- P1-DELTA-36: **CLOSED FOR ACTUAL BENCHMARK** — rzeczywiste osiem pozycji przechodzi nową bramkę.
- P0-DELTA-24, pochodzenie tylko z MAX: **IMPLEMENTED; STATICALLY VERIFIED; RUNTIME UNRESOLVED**.
- P0-DELTA-25, NaN w dalszym wierszu SC: **IMPLEMENTED; STATICALLY VERIFIED; RUNTIME UNRESOLVED**.
- P1-DELTA-26, rozluźnianie tolerancji dużego kroku: **CLOSED FOR REPRODUCTION**.
- P1-DELTA-27, dyskretny przeskok BESS: **CLOSED FOR FINITE NOMINAL INPUTS**; zastrzeżenie P2-DELTA-37 pozostaje.
- P1-DELTA-33/34: dokładne kontrprzykłady zamknięte.
- P2-DELTA-30: spis README zamknięty.

### Nadal otwarte P0/P1/P2

- P1-DELTA-28: historyczny wynik może otrzymać odcisk bieżącej implementacji przy konsumpcji.
- P2-DELTA-37: NaN w parametrach BESS może ominąć ochronę granicy kroku.
- P2-DELTA-38: dokumentacja deklarowała 16/16, a katalog wykonywalny ma 13 mutacji.
- Re-inicjalizacja i zależność od historii po zwarciu/topologii: wcześniejszy `max Delta x0=1.09421789`.
- Pełna kontrola NaN/Inf wejść i wyników.
- Bazy BESS i per-unit, w tym baza urządzenia kontra baza sieci.
- Tożsamość eventów i równoległych gałęzi poza naprawionym przypadkiem jednego toru.
- Samodzielnie konstruowane evidence/FRT, kompletność pokrycia czasu i brakujące kanały.
- AVR/governor/PSS, nasycenie, anti-windup i zwalnianie ograniczników.
- Schemat DAE rozdzielony kontra jednoczesny oraz podłoga porównania ANDES.
- Produkcyjna proweniencja katalogów, CT/VT, zabezpieczenia i topologia SN–TR–nN.
- Kolizja kodu `SI-115` pozostaje luką śledzenia.

## UNRESOLVED PROFESSORIAL QUESTIONS

1. Jaki jest kanoniczny manifest metod, kroków i scenariuszy wymagany do kwalifikacji? **SOL CAN RESOLVE**.
2. Czy błąd dokładnie zerowy jest dopuszczalny wyłącznie dla jawnie wskazanego rozwiązania dokładnego, czy ma blokować ten niezerowy benchmark jako podejrzenie utraty danych? **SOL CAN RESOLVE**.
3. Jaki rząd należy potwierdzić na odcinkach gładkich, zdarzeniach i przejściach ograniczników? **SOL CAN RESOLVE**.
4. Jak rozdzielić tożsamość danych/topologii od odcisku implementacji i historycznego wyniku? **SOL CAN RESOLVE**.
5. Jaka część podłogi ANDES wynika z semantyki zdarzenia/adaptacyjnego kroku, a jaka z różnicy modelu? **SOL CAN RESOLVE**.

## ASTRA ESCALATION

Brak. P1-DELTA-39 jest jednoznacznie odtwarzalny i nie wymaga rozstrzygnięcia Astra. **SOL CAN RESOLVE**.

## EXACT REPRODUCTIONS AND EVIDENCE

```bash
git rev-parse HEAD
# 367a81a17e478f9dbea6f6b0a03bf191ba9318ba
git show -s --format='%P' HEAD
# 4c0ab856bd75f713bc2b7dcd94fe81ec4738c02d
git merge-base 2345ab4566bb3c441bc3abad0ccbe76a4374f31c HEAD
# 2345ab4566bb3c441bc3abad0ccbe76a4374f31c

cd mv-design-pro
python3 - <<'PY'
import sys,json
sys.path.insert(0,'backend/research')
import kwalifikacja as k
r={
 'mutacje':{'przezyly_krytyczne':[],'liczba_mutacji':13},
 'trajektoria_vs_andes':{'stan':'WYKONANE','status':'zgodne_w_granicach_wzorca'},
 'czas_krytyczny_zwarcia':k._czas_krytyczny(False),
 'porownanie_integratorow':k._porownanie_integratorow(False),
 'residua_inicjalizacji':k._residua_inicjalizacji(),
}
print(json.dumps({
 'cct':r['czas_krytyczny_zwarcia'],
 'integrators':r['porownanie_integratorow'],
 'residuals':r['residua_inicjalizacji'],
 'luki':k._luki_kwalifikacji(r),
 'braki':k._braki_kwalifikacji(r)},indent=2))
PY
# CCT relative error 0.007040858; 8 integrator positions;
# worst initialization residual 8.32667e-17; luki []; braki [].

python3 -m pytest -q backend/tests/research/test_kwalifikacja.py
# No module named pytest
```

Pełna reprodukcja P1-DELTA-39 i jej trzy zmierzone wyniki znajdują się w karcie znaleziska. Repozytorium było czyste przed zapisem raportu. Nie zmieniono kodu, testów, progów ani fixtures.

## REVIEWER CHECKPOINT

`LAST_VERIFIED_SHA = 367a81a17e478f9dbea6f6b0a03bf191ba9318ba`

`pending_from_base` pozostaje otwarte dla niewykonanych kontroli i starych problemów wymienionych powyżej. Checkpoint nie oznacza akceptacji.
