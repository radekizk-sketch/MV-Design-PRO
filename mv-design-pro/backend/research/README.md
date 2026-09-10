# `backend/research/` — kod BADAWCZY, poza ścieżką produkcyjną

**Status: NIE JEST PRODUKCJĄ. NIE JEST DOWODEM REGULACYJNYM. NIE JEST KANONEM.**

Ten katalog zawiera prototypy inżynierskie przygotowane przed decyzją
architektoniczną właściciela programu (Fable 5.1). Powstał, żeby zamienić pytania
architektoniczne na **mierzalne dowody**: zamiast opinii „DAE czy ODE", „jaki
integrator", „czy da się sprzęgnąć z Ybus" — działający kod i liczby.

## Dlaczego katalog leży POZA `src/`

`pyproject.toml` wylicza pakiety produkcyjne jawnie (`packages = [{include = ...,
from = "src"}]`). Katalog `research/` **nie jest w tej liście**, więc nie wchodzi
do zainstalowanego pakietu i **kod produkcyjny nie ma jak go zaimportować** —
to izolacja strukturalna, nie umowa dżentelmeńska. Testy laboratorium dokładają
tę ścieżkę jawnie (`tests/research/conftest.py`); żaden moduł w `src/` tego nie robi.

Guard `research_isolation_guard.py` pilnuje tej granicy w CI.

## Czego tu NIE WOLNO zrobić

- podpiąć wyniku laboratorium pod jakąkolwiek końcówkę API produkcji,
- użyć go do wygenerowania certyfikatu / wniosku / dowodu zgodności,
- pokazać go w UI jako wynik zwalidowany,
- nadać którejkolwiek zdolności `EvidenceTier.VALIDATED_SIMULATION`,
- zastąpić nim produkcyjnego solvera bez akceptacji właściciela programu.

Bezpiecznik dowodowy z gałęzi containment (`2473afd2`) obowiązuje bez zmian:
**żadna zdolność dynamiczna nie jest dziś dowodem regulacyjnym.**

## Czego tu WOLNO oczekiwać

Kod badawczy jest nadal kodem inżynierskim: deterministyczny, otypowany,
przetestowany, z jawnymi jednostkami, bazami i konwencjami znaków. Każdy model
mówi wprost, **które równania implementuje** — bez zawyżania nazwą (to był jeden
z defektów P0 audytu: model nazwany „6-rzędowym" miał 2 stany).

## Zawartość

| Moduł | Zakres |
|---|---|
| `dynamic_lab/konwencje.py` | jednostki, bazy, konwencje znaków, transformacja dq↔sieć |
| `dynamic_lab/siec.py` | warstwa algebraiczna sieci: Ybus, wstrzyknięcia prądu, rozwiązanie `g(x,V)=0` |
| `dynamic_lab/urzadzenia.py` | protokół urządzenia + maszyna synchroniczna 4. rzędu + falownik GFL/GFM |
| `dynamic_lab/regulatory.py` | AVR, governor — pętle ZAMKNIĘTE, z ogranicznikami i anti-windup |
| `dynamic_lab/zdarzenia.py` | harmonogram zdarzeń (zwarcie, wyłączenie, zmiana topologii) |
| `dynamic_lab/calkowanie.py` | integratory (jawne i niejawne) za wspólnym kontraktem |
| `dynamic_lab/silnik.py` | pętla DAE: `ẋ = f(x,y,u,p,t)`, `0 = g(x,y,u,p,t)`; inicjalizacja: rozpływ → punkt pracy → stany regulatorów → weryfikacja `‖f(x₀,y₀)‖` |
| `dynamic_lab/wynik.py` | kandydat kontraktu wyniku dynamicznego (szereg czasowy + tożsamość) |
| `dynamic_lab/walidacja.py` | metryki zgodności trajektorii + wyrocznie analityczne |
| `dynamic_lab/benchmarki.py` | drabina walidacyjna L0–L4 + mierzone porównanie integratorów |
| `dynamic_lab/frt.py` | ocena FRT: wymaganie (obwiednia) vs wynik (przebieg) — ROZDZIELONE |
| `dynamic_lab/wzorzec_zewnetrzny.py` | poziom 4: porównanie z NIEZALEŻNYM narzędziem (ANDES) — wymaga `pip install andes` |

Testy: `backend/tests/research/` (uruchamiane przez zwykły bieg pytest).
