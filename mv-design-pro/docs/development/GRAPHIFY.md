# Graphify — lokalna analiza architektury MV-DESIGN-PRO

## Status i zakres

Integracja narzędziowa: Graphify CLI (pakiet `graphifyy`, wersja bazowa **0.9.104**).
Nie zmienia aplikacji, modeli elektroenergetycznych, solverów, SLD ani kontraktów API.
Nie tworzy nowego źródła prawdy — obowiązuje hierarchia dokumentów z `AGENTS.md`.
Instalacja jest wykonywana w izolowanym środowisku użytkownika lub osobnym zadaniu CI.

Repozytorium: https://github.com/Graphify-Labs/graphify (Apache-2.0).
Oficjalna dystrybucja: https://pypi.org/project/graphifyy/0.9.104/.

## Instalacja w środowisku deweloperskim

W **katalogu głównym repozytorium**:

```bash
uv tool install "graphifyy==0.9.104"
graphify --version
bash mv-design-pro/scripts/graphify_local.sh
```

Skrypt analizuje **tylko kod** katalogu `mv-design-pro/`, z `--code-only`
i `--backend none`. Wymusza `GRAPHIFY_BACKEND=none` nawet przy obecności
kluczy API w powłoce. Dane dokumentacji, PDF-y, obrazy i schematy nie trafiają
do etapu semantycznego LLM. Nie używaj trybu Cloud ani opcji `--deep`,
`--backend claude` i automatycznego dołączania dokumentów bez osobnej decyzji.
Komunikaty zapytań nie są zapisywane przez Graphify
(`GRAPHIFY_QUERY_LOG_DISABLE=1` w skrypcie).

Oczekiwane lokalne pliki: `graphify-out/graph.json`,
`graphify-out/GRAPH_REPORT.md`, `graphify-out/graph.html`.
Artefakty są ignorowane przez Git; nie należy ich dodawać do PR.
Jeśli Graphify zapisze je pod `mv-design-pro/graphify-out/`, ten katalog
również jest ignorowany.

## Integracja z Claude Code i Codex

Po instalacji CLI, świadomie uruchom w korzeniu repozytorium:

```bash
graphify install --project --platform claude
graphify install --project --platform codex
```

**Przed zatwierdzeniem zmian sprawdź `git diff`.** Instalator może dopisywać
instrukcje, skille i hooki. Nie zastępuj istniejących `CLAUDE.md`, `AGENTS.md`,
`.claude/settings.json` ani reguł agentów. Nie włączaj `--strict`.
W repozytorium obowiązuje opcjonalna reguła GRAPH-FIRST:
gdy istnieje **aktualny** graf, rozpocznij od krótkiego zapytania i dopiero
potem zweryfikuj wskazane pliki oraz testy. Gdy grafu brak lub jest nieaktualny,
normalnie użyj `rg` i analizy kodu; graf nie może blokować pracy.

Zapytania po zbudowaniu grafu:

```bash
graphify query "SldCanvasV3 buildSceneV3"
graphify explain "PowerFlowNewtonSolver"
graphify path "PowerFlowNewtonSolver" "NetworkGraph"
```

Identyfikatory mogą być niejednoznaczne; nie zgaduj połączenia na podstawie samej
nazwy. `EXTRACTED` oznacza relację wyodrębnioną z kodu, `INFERRED` — wywnioskowaną;
obie sprawdź względem rzeczywistej implementacji. Graf AST nie zapewnia dowodu
przepływu danych pomiędzy TypeScript i Python ani poprawności matematycznej.

## Walidacja

`mv-design-pro/scripts/graphify_smoke.py` wykonuje trzy jawne sondy:

| Sonda | Punkt kontrolny | Dowód w źródle |
| --- | --- | --- |
| A — SLD | `SldCanvasV3` | `frontend/src/ui/sld/v3/canvas/SldCanvasV3.tsx`, import `buildSceneV3` |
| B — rozpływ | `PowerFlowNewtonSolver` | `backend/src/network_model/solvers/power_flow_newton.py`, wywołanie algorytmu Newtona |
| C — topologia | `NetworkGraph` | `backend/src/network_model/core/graph.py`, `nx.MultiGraph` |

Skrypt porównuje obecność odpowiednich symboli w **kodzie źródłowym**
i etykietach węzłów `graph.json`. To sprawdzian kompletności indeksowania,
**nie** pełna walidacja analizy wpływu zmian. Pełny audyt wymaga przeglądu
krawędzi `EXTRACTED/INFERRED`, potwierdzenia zależności plik:wiersz oraz
porównania z bezpośrednim wyszukiwaniem kodu. Wyników audytu ani pomiarów
oszczędności tokenów nie należy deklarować bez rzeczywistego uruchomienia.

Dodatkowe przykładowe obszary do ręcznej analizy:
`frontend/src/ui/sld/v3/`, `backend/src/network_model/`,
`backend/src/application/solvers/`. Zachowaj granice SN/nN i wymóg
jednego modelu sieci zgodnie z dokumentacją kanoniczną.

## Uruchamianie i utrzymanie

Workflow `.github/workflows/graphify-local.yml` instaluje przypiętą wersję
Graphify i uruchamia sondy przy zmianie konfiguracji, skryptów lub dokumentacji
integracji oraz na żądanie (`workflow_dispatch`). Nie wykonuje okresowego
skanowania wszystkich commitów. Graf jest lokalnym artefaktem sesji; po
istotnych zmianach repozytorium ponownie uruchom skrypt.

Zasady bezpieczeństwa: żadnych kluczy API, usług semantycznych, Graphify Cloud,
publikowania grafu ani automatycznych hooków `git` bez odrębnej decyzji.
Dostęp sieciowy CI służy tylko instalacji zależności z PyPI.
