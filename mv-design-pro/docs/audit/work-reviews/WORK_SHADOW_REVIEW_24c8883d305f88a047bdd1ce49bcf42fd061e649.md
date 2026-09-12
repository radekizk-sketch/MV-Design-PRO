# MV-DESIGN-PRO — INDEPENDENT WORK SHADOW REVIEW

Data: 2026-09-12. Tryb: READ-ONLY wobec kodu; sondy poza kodem produktu. Checkpoint oznacza przegląd, nie akceptację.

## REVIEW RANGE

- REVIEW_BASE_SHA: `7fd4a8de5fa8b9cdd01b02f5d54444f1dfd10ff4`
- REVIEW_HEAD_SHA: `24c8883d305f88a047bdd1ce49bcf42fd061e649`
- Merge base delty: `7fd4a8de5fa8b9cdd01b02f5d54444f1dfd10ff4`
- Merge base z `main`: `7e84753adbc4b0e50de9a1fd4f1022f1cfd01903`
- Branch: `claude/max-dynamic-audit-kzbivg`
- PR: NONE. Powiązany PR #475 pozostaje otwarty dla starszej gałęzi `claude/opus5-dynamic-physics-audit-fixes`, HEAD `1e96202535abb0acfb123ebac8a49dae430e792c`.

Delta ma 5 commitów. Jedyna zmiana kodu to `9999a93495eff20925048b9b51d1c74b4faee7dd`, ograniczona do laboratorium i testów badawczych. `755f7121` i `2d12995b` zapisują poprzedni audyt, `856179ee` jest raportem wykonawcy, a `24c8883d` scaleniem. Produkcyjne ścieżki zwarciowe, ochronne i dynamiczne nie uległy zmianie.

## EXECUTIVE VERDICT

**REJECT CURRENT DELTA**

Kampania mutacyjna została istotnie wzmocniona: ma obecnie 13 rzeczywistych mutacji, zachowuje kontrolę bazową i dodaje mutanty degradacji RK4 oraz wadliwej osi czasu. Niezależnie odtworzono dla RK4 dryfy `5.200329056e-11`, `1.659783422e-12`, `4.463096559e-14` i ilorazy `31.3314`, `37.1891`. Porównanie CCT jest rzeczywiście wykonywane: `0.42087890625 s` wobec `0.42386326742 s`, błąd względny `0.007040858 < 0.015`.

Nowa uprząż nadal nie kwalifikuje jednak wszystkich raportowanych wielkości. Pominięta albo nierozstrzygnięta trajektoria nie jest luką. Nie są bramkowane wielkość błędu integratora ani residuum inicjalizacji. Wykonywalny kontrprzykład zwraca pustą listę luk przy braku ANDES, statusie nierozstrzygniętym, błędzie `1e99` i residuum `1e99`. Jednokomendowa uprząż może więc zakończyć się kodem 0 bez zasadniczej kwalifikacji numerycznej.

Otwarte P0/P1 z poprzedniego przeglądu nie były naprawiane. Warstwa pozostaje `UNVALIDATED_MODEL`; `VALIDATED_SIMULATION` i dowód NC RfG pozostają niedopuszczalne.

## LEVELS OF VERIFICATION

- IMPLEMENTED: TAK.
- SOFTWARE-VERIFIED: CZĘŚCIOWO; brak `pytest` uniemożliwił niezależny pełny bieg mutacji.
- MATHEMATICALLY VERIFIED: CZĘŚCIOWO dla RK4 i CCT badanego SMIB.
- NUMERICALLY VERIFIED: REFUTED dla kontraktu kwalifikacji.
- PHYSICALLY SUPPORTED: CZĘŚCIOWO; delta nie zmienia modeli urządzeń.
- PHYSICALLY VALIDATED: NIE.
- PRODUCTION-READY: NIE.
- REGULATORY-EVIDENCE-READY: NIE.

## NEW P0/P1

### P1-DELTA-33 — pominięty lub nierozstrzygnięty dowód nie blokuje kwalifikacji

- Subsystem: research qualification / evidence logic.
- Claim: kod 0 wymaga wykonania i rozstrzygnięcia obowiązkowych pomiarów.
- Evidence: `_luki_kwalifikacji()` dodaje lukę dla trajektorii wyłącznie przy `stan="WYKONANE"` i `status="niezgodne"`. `POMINIETE` oraz `nierozstrzygniete` przechodzą. Pominięte CCT i porównanie integratorów również przechodzą.
- Reproduction:

```bash
cd mv-design-pro/backend
PYTHONPATH=research:src python - <<'PY'
from kwalifikacja import _luki_kwalifikacji
r={'mutacje':{'przezyly_krytyczne':[],'liczba_mutacji':13},
   'trajektoria_vs_andes':{'stan':'POMINIETE'},
   'czas_krytyczny_zwarcia':{'stan':'POMINIETE'},
   'porownanie_integratorow':{'stan':'POMINIETE'}}
print(_luki_kwalifikacji(r))
PY
```

Wynik: `[]`. Tak samo dla `stan="WYKONANE", status="nierozstrzygniete"`.
- Why it matters: widoczny brak dowodu nie może zostać pomylony z pełną kwalifikacją procesu.
- Existing tests: NIE; zachowanie jest obecnie zamierzone w komentarzu.
- Acceptance: rozdzielić `QUALIFIED`, `INCOMPLETE` i `FAILED`; wymagany pomiar pominięty/nierozstrzygnięty nie może dać `QUALIFIED`.
- Resolution: **SOL CAN RESOLVE**.

### P1-DELTA-34 — błąd integratora i residuum inicjalizacji są mierzone, ale nie bramkowane

- Subsystem: numerical qualification / initialization.
- Claim: każda metryka jest oceniana względem własnego kryterium.
- Evidence: `_luki_kwalifikacji()` nie czyta `residua_inicjalizacji`. Dla integratorów sprawdza tylko `zbiegl`, ignorując `blad_max_vs_odniesienie`.
- Reproduction:

```bash
cd mv-design-pro/backend
PYTHONPATH=research:src python - <<'PY'
from kwalifikacja import _luki_kwalifikacji
r={'mutacje':{'przezyly_krytyczne':[],'liczba_mutacji':13},
   'trajektoria_vs_andes':{'stan':'WYKONANE','status':'zgodne_w_granicach_wzorca'},
   'czas_krytyczny_zwarcia':{'stan':'POMINIETE'},
   'porownanie_integratorow':{'stan':'WYKONANE','pozycje':[{'integrator':'X','krok_s':1.0,'zbiegl':True,'blad_max_vs_odniesienie':1e99}]},
   'residua_inicjalizacji':{'najgorsza_norma_pochodnej':1e99}}
print(_luki_kwalifikacji(r))
PY
```

Wynik: `[]`.
- Why it matters: zakończenie iteracji nie dowodzi dokładności; duże `f(x0,y0)` oznacza brak równowagi początkowej.
- Existing tests: NIE dla dużego błędu z `zbiegl=True` ani dużego residuum.
- Acceptance: jawne, skalowane kryteria dla `f`, `g` i błędu; brak progu daje `UNRESOLVED`; NaN/Inf zawsze odrzucane.
- Resolution: **SOL CAN RESOLVE**.

## NEW P2

Brak. Poprzednią regresję spisu izolacji naprawiono; brak porównania pandapower jest teraz jawnie raportowany.

## PHYSICS SCORE

**PARTIALLY SUPPORTED.** Delta nie zmienia modeli. Odtworzony CCT wspiera wyłącznie klasyczny przypadek SMIB, nie GFL/GFM, DFIG, BESS ani regulatory.

## MATHEMATICS SCORE

**PARTIALLY SUPPORTED.** Rząd RK4 i CCT odtworzono. Empiryczny próg dryfu jest detektorem regresji dla konkretnej wielkości, nie uniwersalnym dowodem rzędu sprzężonego DAE.

## NUMERICAL SCORE

**REFUTED.** Uprząż dopuszcza błąd i residuum `1e99`. Nadal otwarty jest trapez z `STRICT_CONVERGENCE`, residuum `0.5` i błędem stanu `1/3`.

## ENERGY / NETWORK SCORE

**UNRESOLVED DLA DELTY.** Brak zmian modeli energii/sieci. Dyskretny przeskok BESS poniżej `soc_min` pozostaje otwarty; nie wykonano nowego pełnego audytu KCL/PQ.

## CATALOG ENGINEERING SCORE

**UNRESOLVED DLA DELTY.** Brak zmian katalogowych. `57/57` nie dowodzi weryfikacji produkcyjnej `23/23` rodzin ani proweniencji producenta.

## CI DELTA

Dla REVIEW_HEAD_SHA zaobserwowano 7 uruchomień: 5 zakończonych powodzeniem oraz 2 nadal wykonywane (`Python tests`, `Frontend checks`). Zielone: Architectural And Repo Hygiene Guard, Docs Integrity Guard, Physics Label Guard, P0 Extended Guards, SLD Determinism Guards. Nie wydano werdyktu dla przebiegów niezakończonych.

Naprawiono wprowadzoną czerwień spisu izolacji. Raport wykonawcy diagnozuje różnice JSON jako zależne od BLAS/CPU bez regenerowania fikstur; nie odtworzono tego na drugim środowisku. Odpowiedź E2E około `96.4 MiB` wobec limitu `60 MiB` pozostaje nierozstrzygnięta.

## MUTATION STATUS

- Katalog zawiera dokładnie 13 mutacji, nie 16.
- Niezmieniony RK4: pomiar odtworzony i spełnia nowe kryterium.
- M-NUM-05 i M-KON-04: **NIE ODTWORZONO** — runtime nie zawiera `pytest`.
- Pominięty/nierozstrzygnięty dowód: **SURVIVED** — lista luk `[]`.
- Błąd integratora i residuum `1e99`: **SURVIVED** — lista luk `[]`.
- Poprzednie mutanty MIN `DEFAULT_FORBIDDEN`, NaN w dalszym wierszu SC, duży krok trapezów i przeskok BESS pozostają **SURVIVED**; ich kod nie został zmieniony.

## PRIOR OPEN / CLOSED

Zamknięte/ograniczone:

- P2-DELTA-30: spis README — ZAMKNIĘTE.
- P2-DELTA-31: kardynalność ustalona wykonywalnie jako 13.
- P2-DELTA-22, część CCT — ZAMKNIĘTE; porównanie wykonano.
- P2-DELTA-23 — OGRANICZONE; pandapower jawnie niewykonany.

Nadal otwarte:

- P0-DELTA-24: autorytet `k_sc` tylko dla MAX; MIN z `DEFAULT_FORBIDDEN` może wejść do koordynacji.
- P0-DELTA-25: NaN w dalszym wierszu SC może autoryzować arbitralne prądy payloadu.
- P1-DELTA-26: duży krok trapezów daje fałszywe `STRICT_CONVERGENCE`.
- P1-DELTA-27: BESS przekracza `soc_min`; poprzednio `soc_final=0.07527778`, zasób do granicy `0.010 kWh`, wykorzystanie `0.03472222 kWh`.
- P1-DELTA-28: historyczny bieg dostaje odcisk bieżącego kodu przy konsumpcji.
- Re-inicjalizacja po zwarciu/topologii: `max Δx0=1.09421789`.
- Pełny audyt baz BESS; evidence/FRT i pokrycie czasu; regulatory AVR/governor/PSS; DAE rozdzielone kontra jednoczesne; kwalifikacja producenta 23 rodzin.

## UNRESOLVED PROFESSORIAL QUESTIONS

1. Które pomiary są obowiązkowe dla `QUALIFIED`, a które opcjonalne tylko diagnostycznie? **SOL CAN RESOLVE**.
2. Jak skalować kryteria `f(x0,y0)`, `g(x0,y0)` i błędu trajektorii? **SOL CAN RESOLVE**.
3. Jak rozdzielić tożsamość danych/topologii od zmiennego między środowiskami odcisku wyniku? **SOL CAN RESOLVE**.
4. Jaka część podłogi ANDES wynika z semantyki zdarzenia, a jaka z tłumienia wzorca? **SOL CAN RESOLVE**.

## ASTRA ESCALATION

Brak. Nowe P1 są jednoznaczne. **SOL CAN RESOLVE**.

## EXACT REPRODUCTIONS AND EVIDENCE

```bash
git merge-base origin/main 24c8883d305f88a047bdd1ce49bcf42fd061e649
# 7e84753adbc4b0e50de9a1fd4f1022f1cfd01903

cd mv-design-pro/backend
PYTHONPATH=research:src python - <<'PY'
from dynamic_lab.katalog_mutacji import mutacje_laboratorium
print(len(mutacje_laboratorium()), [m.ident for m in mutacje_laboratorium()])
PY
# 13

PYTHONPATH=research:src python - <<'PY'
from kwalifikacja import _czas_krytyczny
print(_czas_krytyczny(False))
PY
# 0.42087890625; 0.42386326742; 0.007040858

PYTHONPATH=research:src python -m pytest tests/research/test_calkowanie_zbieznosc.py -q
# No module named pytest
```

Repozytorium było czyste przed zapisem. Audyt zmienia wyłącznie dwa dozwolone pliki raportowe.

## REVIEWER CHECKPOINT

`LAST_VERIFIED_SHA = 24c8883d305f88a047bdd1ce49bcf42fd061e649`

Checkpoint nie oznacza akceptacji; `pending_from_base` pozostaje otwarte.
