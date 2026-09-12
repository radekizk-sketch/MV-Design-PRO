# MV-DESIGN-PRO — INDEPENDENT WORK SHADOW REVIEW

Data: 2026-09-12. Tryb przeglądu: adversarial, evidence-based. Kod produkcyjny, testy, progi i fixtures nie zostały zmienione. Sondy wykonano poza kodem produktu. Checkpoint oznacza wykonanie przeglądu, a nie akceptację ani zamknięcie niewykonanych kontroli.

## REVIEW RANGE

- REVIEW_BASE_SHA: `24c8883d305f88a047bdd1ce49bcf42fd061e649`
- REVIEW_HEAD_SHA: `2345ab4566bb3c441bc3abad0ccbe76a4374f31c`
- Merge base delty: `24c8883d305f88a047bdd1ce49bcf42fd061e649`
- Merge base z `main`: `7e84753adbc4b0e50de9a1fd4f1022f1cfd01903`
- Branch: `claude/max-dynamic-audit-kzbivg`
- PR: NONE. Powiązany PR #475 pozostaje otwarty dla starszej gałęzi `claude/opus5-dynamic-physics-audit-fixes`, HEAD `1e96202535abb0acfb123ebac8a49dae430e792c`.

Delta obejmuje commity `69c8126d`, merge `c525a57c` i `2345ab45` oraz dwa wcześniejsze zapisy audytu. Zmiany merytoryczne dotyczą: pochodzenia obu biegów MAX/MIN i kontroli prądów koordynacji, skalowania tolerancji trapezu, granicy kroku BESS oraz statusów uprzęży kwalifikacyjnej.

## EXECUTIVE VERDICT

**REJECT CURRENT DELTA**

Naprawy czterech zgłoszonych defektów są widoczne w kodzie. Niezależny kontrprzykład `x'=-x`, `dt=1 s` daje teraz dla trapezu `x1=1/3`, surowe residuum `1.11e-16` i `STRICT_CONVERGENCE`, więc P1-DELTA-26 został usunięty dla badanego przypadku. Granica BESS odrzuca `dt=10 ms`; na granicy `dt=0.72 ms` rozładowanie kończy się przy `soc=0.100000003`, a ładowanie przy `soc=0.899999997`. Dla `eta_discharge=0.5` granica skraca się do `0.36 ms` i SOC pozostaje w oknie.

Uprząż kwalifikacyjna nadal nie jest fail-closed jako klasa. Raport z sekcjami oznaczonymi `WYKONANE`, ale bez werdyktu trajektorii i bez ani jednej pozycji integratora, dostaje `ZAKWALIFIKOWANE`. Jednocześnie rzeczywisty, niezmieniony zestaw porównania integratorów jest zawsze odrzucany przez nowy wspólny próg 0.01 rad: cztery pozycje Eulera mają błędy od `0.0126242` do `0.111944` rad. Dokumentacja uzasadnienia progu wymienia wyłącznie RK4 i trapez, lecz kod stosuje go także do obu metod Eulera. Deklaracja „wszystko zielone” nie jest zatem prawdziwa dla samej logiki pełnej kwalifikacji.

Warstwa pozostaje `UNVALIDATED_MODEL`. Wynik nie jest `VALIDATED_SIMULATION`, nie jest podstawą dowodu NC RfG i nie jest gotowy regulacyjnie.

## LEVELS OF VERIFICATION

- IMPLEMENTED: TAK dla czterech deklarowanych poprawek.
- SOFTWARE-VERIFIED: CZĘŚCIOWO; wykonano niezależne sondy Python, lecz runtime nie zawiera `pytest`, `networkx`, ANDES ani pandapower.
- MATHEMATICALLY VERIFIED: CZĘŚCIOWO dla trapezu, warunku kroku BESS i CCT badanego SMIB.
- NUMERICALLY VERIFIED: REFUTED dla kontraktu uprzęży kwalifikacyjnej; częściowo wspierane dla samego trapezu.
- PHYSICALLY SUPPORTED: CZĘŚCIOWO dla okna SOC w sprawdzonym scenariuszu.
- PHYSICALLY VALIDATED: NIE.
- PRODUCTION-READY: NIE dla dynamiki; poprawki autorytetu zwarciowego są zweryfikowane statycznie, nie pełnym biegiem API.
- REGULATORY-EVIDENCE-READY: NIE.

## NEW P0/P1

### P1-DELTA-35 — stan `WYKONANE` bez dowodu nadal daje kwalifikację

- Subsystem: research qualification / evidence chain.
- Claim under test: `ZAKWALIFIKOWANE` oznacza, że każdy wymagany pomiar istnieje, ma rozpoznany werdykt i zawiera niepusty materiał porównawczy.
- Independent evidence: `_braki_kwalifikacji()` sprawdza tylko `stan != "WYKONANE"` albo dokładnie `status == "nierozstrzygniete"`. Brak pola `status` i dowolny nieznany status przechodzą. `_luki_kwalifikacji()` akceptuje `porownanie_integratorow.pozycje=[]`, ponieważ obie listy naruszeń są wtedy puste.
- Exact reproduction:

```bash
cd mv-design-pro/backend
PYTHONPATH=research python - <<'PY'
from kwalifikacja import _braki_kwalifikacji, _luki_kwalifikacji, StatusKwalifikacji
r={
 'mutacje': {'przezyly_krytyczne': [], 'liczba_mutacji': 13},
 'trajektoria_vs_andes': {'stan':'WYKONANE'},
 'czas_krytyczny_zwarcia': {'stan':'WYKONANE','zgodne':True},
 'porownanie_integratorow': {'stan':'WYKONANE','pozycje':[]},
 'residua_inicjalizacji': {'najgorsza_norma_pochodnej':0.0},
}
l=_luki_kwalifikacji(r); b=_braki_kwalifikacji(r)
print(l,b,StatusKwalifikacji.ZAKWALIFIKOWANE.value if not l and not b else 'BLOCKED')
PY
```

Wynik zmierzony: `[] [] ZAKWALIFIKOWANE`. Zamiana na `status='dowolny_nieznany'` daje identyczny wynik.
- Why it matters: pusty albo niezrozumiały obiekt evidence może ustanowić dodatni stan procesu. To narusza wymóg, aby verdict wynikał z raw result + oracle + comparator + criteria + identity.
- Existing Opus tests: NIE. Testują `POMINIETE` i dokładnie `nierozstrzygniete`, ale nie brak/nieznany status ani pustą listę pozycji.
- Acceptance test: każda sekcja ma zamknięty schemat statusów; `WYKONANE` bez wymaganych metryk, werdyktu lub niepustej populacji daje `NIEKOMPLETNE` albo `ODRZUCONE`, nigdy kod 0.
- Resolution: **SOL CAN RESOLVE**.

### P1-DELTA-36 — własny pełny benchmark integratorów jest deterministycznie odrzucany

- Subsystem: numerical qualification.
- Claim under test: nowy próg błędu kwalifikuje aktualny zestaw wzorcowy, a zmierzone wyniki mają „trzy rzędy zapasu”.
- Independent evidence: `_porownanie_integratorow(False)` zwraca osiem pozycji. Cztery pozycje Eulera przekraczają `MAKS_BLAD_INTEGRATORA_RAD=0.01`; `_luki_kwalifikacji()` stosuje próg do wszystkich pozycji, mimo że komentarz uzasadniający próg cytuje wyłącznie RK4 i trapez.
- Exact reproduction:

```bash
cd mv-design-pro/backend
PYTHONPATH=research python - <<'PY'
from kwalifikacja import (_czas_krytyczny,_porownanie_integratorow,
  _residua_inicjalizacji,_luki_kwalifikacji,_braki_kwalifikacji)
r={'mutacje':{'przezyly_krytyczne':[],'liczba_mutacji':13},
   'trajektoria_vs_andes':{'stan':'WYKONANE','status':'zgodne_w_granicach_wzorca'},
   'czas_krytyczny_zwarcia':_czas_krytyczny(False),
   'porownanie_integratorow':_porownanie_integratorow(False),
   'residua_inicjalizacji':_residua_inicjalizacji()}
print(_luki_kwalifikacji(r)); print(_braki_kwalifikacji(r))
PY
```

Wynik: `ODRZUCONE`; przekroczenia: Euler jawny `0.0151341` i `0.111944`, Euler niejawny `0.0126242` i `0.0454496` rad; braków `[]`.
- Why it matters: jednokomendowa kwalifikacja nie może być jednocześnie deklarowana jako zielona i z definicji odrzucać swój kanoniczny benchmark. Wspólny bezwzględny próg nie rozróżnia celu metody referencyjnej, rzędu ani amplitudy scenariusza.
- Existing Opus tests: NIE. Minimalna fikstura zawiera wyłącznie RK4 z małym błędem; nie uruchamia pełnego zestawu przez `_luki_kwalifikacji`.
- Acceptance test: rzeczywisty raport pełny musi dawać stan zgodny z jawnie nazwanym celem każdej metody; kryteria muszą być zdefiniowane per rola/metoda/scenariusz albo benchmarki niespełniające kryterium muszą być jawnie oczekiwanymi porażkami. Test musi użyć prawdziwego `_porownanie_integratorow(False)`.
- Resolution: **SOL CAN RESOLVE**.

## NEW P2

### P2-DELTA-37 — granica kroku BESS nie wymaga skończonej dodatniej wartości

`MagazynEnergiiBESS.__post_init__` przepuszcza `NaN` w `s_bazowa_mva`, `s_falownika_pu` i `pasmo_soc`, ponieważ używa porównań `<=`. `krok_maksymalny_s()` zwraca wtedy `NaN`, a predykat `self.krok_s > granica` jest fałszywy. Sonda z `krok_s=1.0` zwróciła `GUARD_ACCEPTED` dla wszystkich trzech przypadków. Jest to ograniczenie nowej ochrony; wiąże się z wcześniej otwartym, szerszym brakiem kontroli NaN/Inf wejść. Kryterium odbioru: konstruktor i granica ważności wymagają skończonych dodatnich parametrów, a nieskończona/NaN granica jest odrzucana przed porównaniem.

### P2-DELTA-38 — dokumentacja nadal podaje 16/16, wykonywalny katalog ma 13 mutacji

`mutacje_laboratorium()` zwróciło dokładnie 13 identyfikatorów: M-KON-01..04, M-NUM-01..05, M-FIZ-01..03 i M-TOZ-01. `PRE_FABLE_DYNAMIC_ENGINEERING_HANDOFF_2026-09.md` nadal deklaruje w trzech miejscach `16/16`. Pełnej kampanii nie wykonano w runtime bez `pytest`; nie ma podstaw do twierdzenia 16/16 dla bieżącego HEAD. Kryterium odbioru: licznik w dokumencie jest wyprowadzany z raportu konkretnego SHA i zgodny z katalogiem wykonywalnym.

## PHYSICS SCORE

**PARTIALLY SUPPORTED.** Delta nie zmienia równań urządzeń. Warunek kroku BESS ma poprawny wymiar: `dt_max = pasmo_SOC · 3600 E_MWh /(S_fal,pu S_base,MVA max(1/eta_dis,eta_ch))`. Odtworzono obie strony okna SOC dla znamionowego scenariusza. Nie zweryfikowano GFL/GFM, DFIG, fault response, AVR/governor/PSS ani semantyki rozdzielonego DAE.

## MATHEMATICS SCORE

**PARTIALLY SUPPORTED.** Dla `x'=-x` metoda trapezowa rozwiązuje równanie `x1-x0-dt(f0+f1)/2=0` do `1.11e-16`; poprawne `x1=1/3`. Granica BESS jest konserwatywnym warunkiem nieprzeskoczenia całego pasma, nie dowodem globalnej niezmienniczości dla każdego integratora i każdego stanu pośredniego. CCT: `0.42087890625 s` wobec `0.423863267422 s`, względnie `0.007040858 < 0.015`.

## NUMERICAL SCORE

**REFUTED DLA KWALIFIKACJI / PARTIALLY SUPPORTED DLA SOLVERA.** Fałszywe rozluźnienie tolerancji dla dużego kroku zostało usunięte. Residuum inicjalizacji dla dwóch benchmarków wynosi `8.32667e-17` i `0.0`. Kontrakt kwalifikacji ma jednak zarówno false-positive (pusty evidence), jak i false-negative dla własnego pełnego benchmarku. Nie wykonano drabiny `dt, dt/2, dt/4, dt/8` w nowej delcie ani niezależnego pomiaru podłogi ANDES.

## ENERGY / NETWORK SCORE

**PARTIALLY SUPPORTED DLA DELTY.** Dla BESS bez strat przy rozładowaniu i ładowaniu na granicy kroku SOC pozostał odpowiednio `0.100000003` i `0.899999997`. Dla `eta_discharge=0.5` granica zmniejszyła się dwukrotnie do `0.00036 s`. Nie przeprowadzono w tej delcie pełnego całkowego audytu `Delta E ≈ integral P_ac dt` ani lokalnego KCL/PQ wszystkich szyn. Wcześniejsze otwarte kontrole energii, baz i historii pozostają pending.

## CATALOG ENGINEERING SCORE

**UNRESOLVED DLA DELTY.** Delta nie zmienia danych katalogowych. Wcześniejsza granica pozostaje: kompletność szablonu `57/57` nie dowodzi produkcyjnej weryfikacji 23 rodzin ani proweniencji producenta. Reguły katalogowe i źródła producentów pozostają w pending scope.

## CI DELTA

GitHub dla dokładnego `REVIEW_HEAD_SHA` zwrócił 0 workflow runs i 0 commit statuses. Gałąź nie ma PR, a dostępny wrapper pokazuje tylko biegi wyzwolone przez pull request. Nie ma więc zewnętrznego dowodu CI dla twierdzenia „wszystko zielone”. Lokalnych deklaracji autora nie traktowano jako niezależnego wyniku. Runtime recenzenta nie zawiera `pytest` ani `networkx`; pełne testy backend/frontend/research nie zostały tu wykonane.

Nie sklasyfikowano żadnej czerwieni jako regresji, ponieważ dla dokładnego SHA nie otrzymano ani zielonego, ani czerwonego biegu. To jest **BRAK DANYCH**, nie sukces i nie porażka CI.

## MUTATION STATUS

- Duży krok trapezu / fałszywe `STRICT_CONVERGENCE`: **KILLED** w odtworzonym kontrprzykładzie.
- Przeskok dolnego okna SOC przy `dt=10 ms`: **KILLED** przez głośne odrzucenie; granica i kroki mniejsze utrzymały SOC.
- Brak/nieznany status trajektorii + pusta populacja integratorów: **SURVIVED**; wynik `ZAKWALIFIKOWANE`.
- Niepoprawna granica BESS `NaN`: **SURVIVED** na poziomie nowej bramki kroku; klasyfikacja P2 ze względu na badawczy zakres i istniejące późniejsze zapory skończoności.
- Katalog: 13 mutantów, nie 16. Kampania wykonawcza: **NIE WYKONANA** w tym runtime z powodu braku `pytest`; nie powielono deklaracji autora 13/13 ani 16/16.
- P0-DELTA-24 i P0-DELTA-25: zmiany kodu zabijające poprzednie ścieżki są widoczne, ale test integracyjny API nie został wykonany z powodu brakujących zależności.

## PRIOR FINDINGS — STATUS

### Zamknięte lub ograniczone w bieżącej delcie

- P0-DELTA-24, proweniencja tylko z MAX: **IMPLEMENTED; STATICALLY VERIFIED; RUNTIME UNRESOLVED**. Znaczniki MAX i MIN są łączone, a `DEFAULT_FORBIDDEN` z któregokolwiek biegu trafia do wspólnej bramki.
- P0-DELTA-25, NaN w dalszym wierszu SC: **IMPLEMENTED; STATICALLY VERIFIED; RUNTIME UNRESOLVED**. Każdy wiersz i każda wartość żądania przechodzą jeden predykat `finite && >0`; odrzucone wiersze stają się niezgodnością przed autoryzacją.
- P1-DELTA-26, rozluźnianie tolerancji dla `dt>5 ms`: **CLOSED FOR REPRODUCTION**. Współczynnik jest ograniczony do 1; kontrprzykład daje poprawny krok.
- P1-DELTA-27, dyskretny przeskok BESS: **CLOSED FOR FINITE NOMINAL INPUTS**; P2-DELTA-37 zachowuje zastrzeżenie dla NaN.
- P1-DELTA-33/34, dokładne poprzednie kontrprzykłady: **CLOSED AS INSTANCES**, lecz P1-DELTA-35/36 pokazują niezamknięcie klasy evidence.
- P2-DELTA-30: spis README — ZAMKNIĘTE.
- P2-DELTA-23: brak pandapower — OGRANICZONE przez jawny zapis, nadal niewykonane.

### Nadal otwarte

- P1-DELTA-28: wynik historyczny może dostać odcisk bieżącej implementacji przy konsumpcji.
- Re-inicjalizacja/historia po zwarciu lub zmianie topologii: wcześniejszy pomiar `max Delta x0=1.09421789` nie został ponownie rozstrzygnięty w tej delcie.
- Pełna kontrola NaN/Inf wejść i wyników; P2-DELTA-37 pokazuje nadal otwarty wariant parametrów BESS.
- Pełny audyt baz BESS i per-unit, w tym baza urządzenia kontra sieci.
- Tożsamość eventów i równoległych gałęzi poza naprawionym przypadkiem wyłączenia jednego toru.
- Samodzielnie konstruowane evidence/FRT, kompletność pokrycia czasu i brakujące kanały.
- Regulatory AVR/governor/PSS, nasycenie, anti-windup i zwalnianie ograniczników.
- Schemat DAE rozdzielony kontra jednoczesny; podłoga porównania trajektorii z ANDES.
- Produkcyjna proweniencja katalogów, CT/VT, ochrona, topologia SN–TR–nN i reguły inwariantów.
- Kolizja kodu `SI-115` między nieznanym znacznikiem a niepoprawnym prądem znamionowym pozostaje luką traceability poprzedniego zakresu.

## UNRESOLVED PROFESSORIAL QUESTIONS

1. Czy Euler w benchmarku jest metodą podlegającą kryterium akceptacji, czy kontrolą dolną mającą świadomie pokazać błąd? Obecny kod i opis odpowiadają sprzecznie. **SOL CAN RESOLVE**.
2. Jaki zamknięty schemat i minimalna kardynalność raw evidence są wymagane dla każdej sekcji `WYKONANE`? **SOL CAN RESOLVE**.
3. Czy granica kroku BESS ma być warunkiem tylko nieprzeskoczenia pasma, czy gwarancją niezmienniczości wszystkich etapów integratora? **SOL CAN RESOLVE**.
4. Jak rozdzielić tożsamość danych/topologii od zmiennego między środowiskami odcisku wyniku? **SOL CAN RESOLVE**.
5. Jaka część podłogi ANDES wynika z semantyki zdarzenia i adaptacyjnego kroku, a jaka z różnicy modelu? **SOL CAN RESOLVE**.

## ASTRA ESCALATION

Brak. Nowe P1 są jednoznacznie odtwarzalne i nie wymagają rozstrzygnięcia Astra. **SOL CAN RESOLVE**.

## EXACT REPRODUCTIONS AND EVIDENCE

```bash
git rev-parse HEAD
# 2345ab4566bb3c441bc3abad0ccbe76a4374f31c
git merge-base HEAD origin/main
# 7e84753adbc4b0e50de9a1fd4f1022f1cfd01903

cd mv-design-pro/backend
PYTHONPATH=research python - <<'PY'
import numpy as np
from dynamic_lab.calkowanie import TrapezNiejawny
y,r=TrapezNiejawny().krok_ze_sprawozdaniem(lambda x,t:-x,np.array([1.]),0.,1.)
res=y-np.array([1.])-0.5*(-np.array([1.])-y)
print(y,r.status.value,r.rho,res)
PY
# [0.33333333] STRICT_CONVERGENCE 1.099e-09 [-1.11022302e-16]

PYTHONPATH=research python - <<'PY'
from dynamic_lab.katalog_mutacji import mutacje_laboratorium
print(len(mutacje_laboratorium()), [m.ident for m in mutacje_laboratorium()])
PY
# 13 [M-KON-01, ..., M-TOZ-01]

python -m pytest tests/research/test_kwalifikacja.py -q
# No module named pytest

PYTHONPATH=src python -c 'import application.autorytet_biegu_zwarciowego'
# ModuleNotFoundError: No module named networkx
```

Wyniki BESS, CCT, integratorów i kontrprzykłady kwalifikacji znajdują się również w sekcjach findings powyżej. Repozytorium było czyste przed zapisem. Audyt zmienia wyłącznie dwa dozwolone pliki raportowe.

## REVIEWER CHECKPOINT

`LAST_VERIFIED_SHA = 2345ab4566bb3c441bc3abad0ccbe76a4374f31c`

Checkpoint nie oznacza akceptacji. `pending_from_base` pozostaje otwarte dla niewykonanych kontroli wymienionych powyżej.
