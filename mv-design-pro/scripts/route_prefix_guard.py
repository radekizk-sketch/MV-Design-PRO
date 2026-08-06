"""Guard KLASY „rozjazd prefiksow trasy" backend <-> front <-> proxy.

DLUG, KTORY TO PRZYPINA (V12K-325 / karta PREFIKSY)
--------------------------------------------------
Trasa HTTP ma TRZY niezalezne opisy prefiksu i kazdy z nich moze sie rozjechac
z pozostalymi, a zaden test jednostkowy tego nie widzi:

  1. backend   — `app.include_router(prefix=...)` + `APIRouter(prefix=...)`,
  2. front     — literal sciezki w kliencie (`fetch('/api/...')`),
  3. proxy dev — reguly `server.proxy` w `frontend/vite.config.ts`.

Kazdy z tych opisow z osobna wyglada poprawnie. Rozjazd widac dopiero, gdy
zestawi sie je RAZEM — a nie robil tego nikt, wiec obie znane instancje zylly
w repo miesiacami:

  * router archiwum projektu stal pod `/projects` (bez `/api`), wiec dev-proxy
    go nie przepuszczal — koncowki istnialy, ale z przegladarki byly NIEOSIAGALNE
    (eksport paczki dostawal HTML serwera statycznego zamiast ZIP-a);
  * klient `ui/power-flow-results/api.ts` wolal `/api/power-flow-runs/...`,
    a backend serwowal `/power-flow-runs/...` — kierunek ODWROTNY, trasa MARTWA
    (404 na kazdym wejsciu w wyniki rozplywu).

POMIAR NA HEAD PRZED NAPRAWA (2026-08-05): 292 trasy wpiete do aplikacji,
z czego 30 poza kanonem `/api`; 4 rodziny klientow frontu wolaly `/api/<X>`
dla routerow stojacych pod `/<X>` (rozplyw, porownania rozplywu, porownania
zabezpieczen, lista biegow rozplywu projektu) — lacznie 13 martwych sciezek.

KANON (rozstrzygniecie karty PREFIKSY)
--------------------------------------
KAZDY router HTTP montowany jest pod `/api/...`. Prefiks `/api` jest jedyna
granica, ktora dev-proxy przepuszcza bez reguly szytej na miare, wiec kazdy
router poza `/api` wymaga rownoleglej reguly proxy — czyli drugiego miejsca,
ktore moze sie rozjechac. Wyjatki musza stac na jawnej liscie ponizej razem
z uzasadnieniem MERYTORYCZNYM (nie „tak zostalo zrobione").

Guard jest FAIL-CLOSED: router, ktorego nie da sie rozwiazac statycznie, jest
naruszeniem, nie cichym pominieciem (ta sama zasada co `api_lifecycle_guard`).

Guard NIE importuje zaleznosci backendu — dziala na golym `python3`.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from api_lifecycle_guard import (  # noqa: E402
    discover_all_routes_with_problems,
)

ROOT = Path(__file__).resolve().parents[1]
FRONTEND_SRC = ROOT / "frontend" / "src"
VITE_CONFIG = ROOT / "frontend" / "vite.config.ts"

CANONICAL_PREFIX = "/api"

# --------------------------------------------------------------------------
# WYJATKI OD KANONU PREFIKSU (backend). Kazdy wpis = sciezka routera, ktora
# WOLNO wystawiac poza `/api`, wraz z uzasadnieniem merytorycznym.
#
# LISTA JEST ZAMKNIETA i celowo PUSTA. Po naprawie karty PREFIKSY zaden router
# HTTP nie stoi poza `/api` — kazdy nowy wpis wymaga uzasadnienia, dlaczego
# trasa NIE MOZE stac pod `/api`, oraz rownoleglej reguly w `vite.config.ts`
# (inaczej powtorzy sie defekt archiwum projektu: koncowka istnieje, ale jest
# nieosiagalna z przegladarki).
#
# Koncowki infrastrukturalne aplikacji (`/`, `/health`, `/ready`, `/docs`,
# `/redoc`, `/openapi.json`) NIE przechodza przez `include_router`, wiec nie sa
# przedmiotem tej listy — guard ich nie widzi i widziec nie musi.
# --------------------------------------------------------------------------
BACKEND_PREFIX_EXCEPTIONS: dict[str, str] = {}

# --------------------------------------------------------------------------
# WYJATKI PO STRONIE FRONTU. Literal sciezki, ktorego guard nie ma dopasowywac
# do tablicy tras — wylacznie dla przypadkow, gdzie sciezka NIE jest adresem
# HTTP backendu (np. sciezka pliku, klucz slownika zaczynajacy sie od `/`).
# --------------------------------------------------------------------------
FRONTEND_PATH_EXCEPTIONS: dict[str, str] = {}

# --------------------------------------------------------------------------
# REJESTR DLUGU „KLIENT BEZ DOSTAWCY" (inna klasa niz rozjazd prefiksu).
#
# Moduly klienckie wolajace trasy, ktorych backend NIE MA W OGOLE — nie chodzi
# o zly prefiks, tylko o brak dostawcy. Naprawa wymaga decyzji produktowej
# (zbudowac backend albo usunac martwy modul), wiec nie miesci sie w karcie
# PREFIKSY. Dlug jest tu ZAREJESTROWANY, a nie ukryty.
#
# WPIS PINUJE KONKRETNE SCIEZKI, NIE CALY MODUL. To nie jest szczegol: przy
# rejestrze trzymanym na poziomie modulu kazdy plik z lity stawal sie SLEPA
# PLAMKA — dowolna NOWA martwa sciezka dopisana do takiego pliku byla cicho
# wchlaniana przez wpis dlugu. Sprawdzone iniekcja: dopisanie wolania
# `/api/analysis-runs/{id}/nie-ma-takiej-koncowki` do `ui/comparison/api.ts`
# NIE zapalalo guardu. Przy rejestrze sciezkowym zapala.
#
# Guard pilnuje obu kierunkow: sciezka spoza listy => naruszenie; sciezka
# z listy, ktorej juz nie ma => naruszenie (wpis musi zniknac). Rejestr moze
# tylko MALEC.
#
# POMIAR (2026-08-05): 6 modulow, 22 UNIKALNE martwe sciezki (23 miejsca wolania —
# `/api/execution/study-cases/{id}/comparisons` wystepuje w dwoch funkcjach).
#
# SPLACONE (2026-08-06, karta nakladki roznic na schemacie): modul
# `ui/comparison/sldDeltaOverlay.api.ts` (3 sciezki pod
# `/api/execution/comparisons`) — JEDYNY wpis rejestru importowany przez zywy
# store, wiec jedyny, ktorego skutek widzial uzytkownik. Rozstrzygniecie:
# rejestr porownan spod `/api/execution` byl DUPLIKATEM zywej, bezstanowej
# koncowki `/api/short-circuit-comparisons` (jego dostawca nie byl wpiety w
# `main.py`, a stojaca za nim usluga trzymala przebiegi we wlasnej pamieci, do
# ktorej produkcyjna sciezka biegow nic nie zapisuje — samo wpiecie routera
# daloby trase odpowiadajaca „nie znaleziono przebiegu" na kazdy realny
# identyfikator). Zdolnosc „roznice na schemacie" dostala dostawce w zywej
# sciezce (`POST /api/short-circuit-comparisons/sld-overlay`), a duplikat
# (klient, store porownan, panel) zostal usuniety.
# STAN PO SPLACIE: 5 modulow, 19 martwych sciezek.
# --------------------------------------------------------------------------
FRONTEND_DEAD_CLIENT_DEBT: dict[str, tuple[tuple[str, ...], str]] = {
    "frontend/src/ui/protection-coordination/api.ts": (
        (
            "/api/protection-coordination",
            "/api/protection-coordination/projects/{p}/run",
            "/api/protection-coordination/{p}",
            "/api/protection-coordination/{p}/tcc",
            "/api/protection-coordination/{p}/trace",
            "/api/protection-coordination/{p}/checks/sensitivity",
            "/api/protection-coordination/{p}/checks/selectivity",
            "/api/protection-coordination/{p}/checks/overload",
            "/api/protection-coordination/{p}/export/pdf",
            "/api/protection-coordination/{p}/export/docx",
        ),
        "backend NIGDY nie mial routera /api/protection-coordination. Modul nie ma ANI "
        "JEDNEGO importera; zywy ekran koordynacji (E-28) to ui2/wyniki/koordynacja, ktory "
        "czyta /api/protection/overcurrent-settings. Do decyzji: usunac martwy modul albo "
        "zbudowac dostawce koordynacji.",
    ),
    "frontend/src/ui/sld-overlay/variantStore.ts": (
        (
            "/api/projects/{p}/variants",
            "/api/variants/{p}/compare/{p}",
            "/api/variants/{p}/duplicate",
        ),
        "warianty projektu nie maja dostawcy w backendzie. Store uzywany wylacznie przez "
        "wlasny test. Do decyzji: usunac albo zbudowac warianty end-to-end.",
    ),
    "frontend/src/ui/comparison/api.ts": (
        (
            "/api/projects/{p}/runs",
            "/api/study-cases/{p}/runs",
        ),
        "historia biegow: backend wystawia ja jako /api/projects/{id}/analysis-runs. Modul nie "
        "ma importerow; trzecia funkcja (compareRuns -> /api/comparison/runs) jest poprawna.",
    ),
    "frontend/src/ui/proof/traceExportApi.ts": (
        (
            "/api/projects/{p}/analysis-runs/{p}/trace/export/{p}",
            "/api/analysis-runs/{p}/trace/export/{p}",
        ),
        "backend wystawia slad jako /api/analysis-runs/{id}/trace oraz /trace/summary, bez "
        "eksportu do pliku. Modul nie ma importerow.",
    ),
    "frontend/src/ui/topology/api.ts": (
        (
            "/api/cases/{p}/enm/ops",
            "/api/cases/{p}/enm/ops/batch",
        ),
        "dostawca zostal SWIADOMIE wycofany: `_PRODUCTION_DISABLED_ROUTE_KEYS` w "
        "backend/src/api/enm.py wylacza te trasy w aplikacji produkcyjnej. Modul nie ma "
        "importerow — klient jest pozostaloscia po wylaczonym cyklu zapisu.",
    ),
}

HTTP_CALL_HINT = re.compile(r"\bfetch\s*\(|\baxios\s*\.\s*(?:get|post|put|patch|delete)\s*\(")


@dataclass(frozen=True)
class FrontendPath:
    """Literal sciezki absolutnej znaleziony w kliencie frontu."""

    path: str
    source: str
    line: int


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def strip_comments(text: str) -> str:
    """Usuwa komentarze, zeby przykladowe adresy w docstringach nie liczyly sie
    jako realne wolania. Zachowuje dlugosc w liniach (numeracja zostaje trafna)."""

    def blank(match: re.Match[str]) -> str:
        return "\n" * match.group(0).count("\n")

    text = re.sub(r"/\*.*?\*/", blank, text, flags=re.S)
    text = re.sub(r"(?<![:'\"`\\])//[^\n]*", "", text)
    return text


def _module_string_consts(text: str) -> dict[str, str]:
    """Stale modulu trzymajace baze adresu (`const API_BASE = '/api';`)."""
    return dict(re.findall(r"\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*['\"]([^'\"\n]*)['\"]", text))


def _substitute_placeholders(raw: str, consts: dict[str, str]) -> str:
    """`${X}` -> wartosc stalej X, w pozostalych wypadkach -> `{p}`.

    Skanowanie z liczeniem nawiasow: wyrazenia w szablonie bywaja zagniezdzone
    (`${q ? `?${q}` : ''}`), wiec naiwne `\\$\\{[^}]*\\}` urywalo sciezke w polowie
    i produkowalo smieciowy literal.
    """
    out: list[str] = []
    i = 0
    while i < len(raw):
        if raw.startswith("${", i):
            depth = 1
            j = i + 2
            while j < len(raw) and depth:
                if raw[j] == "{":
                    depth += 1
                elif raw[j] == "}":
                    depth -= 1
                j += 1
            expr = raw[i + 2 : j - 1].strip()
            out.append(consts.get(expr, "{p}"))
            i = j
        else:
            out.append(raw[i])
            i += 1
    return "".join(out)


LITERAL = re.compile(r"'((?:[^'\\\n]|\\.)*)'|\"((?:[^\"\\\n]|\\.)*)\"|`((?:[^`\\]|\\.)*)`", re.S)


def collect_frontend_paths(backend_first_segments: set[str]) -> list[FrontendPath]:
    """Literale sciezek absolutnych wolanych przez klientow frontu.

    Zawezenie do PIERWSZEGO SEGMENTU nalezacego do backendu jest celowe: front
    trzyma tez sciezki, ktore adresami HTTP nie sa (trasy nawigacji, klucze,
    sciezki plikow). Segment pierwszy bierzemy z realnej tablicy tras, wiec
    zakres guardu rosnie SAM, gdy backend dostaje nowy prefiks — nie ma tu
    reczne j listy do zapomnienia.
    """
    found: list[FrontendPath] = []
    for path in sorted(FRONTEND_SRC.rglob("*")):
        if path.suffix not in {".ts", ".tsx"} or not path.is_file():
            continue
        rel = path.relative_to(ROOT).as_posix()
        # Testy trzymaja atrapy odpowiedzi i adresy scenariuszy negatywnych —
        # kontraktem klienta jest kod produkcyjny.
        if "__tests__" in rel or ".test." in rel or ".spec." in rel:
            continue
        text = strip_comments(read_text(path))
        if not HTTP_CALL_HINT.search(text):
            continue
        consts = _module_string_consts(text)
        for match in LITERAL.finditer(text):
            raw = match.group(1) or match.group(2) or match.group(3) or ""
            resolved = _substitute_placeholders(raw, consts)
            if not resolved.startswith("/"):
                continue
            candidate = resolved.split("?", 1)[0].split("#", 1)[0]
            segments = candidate.split("/")
            if len(segments) < 2 or segments[1] not in backend_first_segments:
                continue
            if candidate in FRONTEND_PATH_EXCEPTIONS:
                continue
            line = text.count("\n", 0, match.start()) + 1
            found.append(FrontendPath(path=candidate, source=rel, line=line))
    return found


def parse_vite_proxy_prefixes() -> list[str]:
    """Klucze `server.proxy` z `vite.config.ts` (prefiksy przepuszczane w DEV)."""
    text = strip_comments(read_text(VITE_CONFIG))
    match = re.search(r"proxy\s*:\s*\{", text)
    if not match:
        return []
    start = match.end() - 1
    depth = 0
    end = start
    for index in range(start, len(text)):
        if text[index] == "{":
            depth += 1
        elif text[index] == "}":
            depth -= 1
            if depth == 0:
                end = index
                break
    block = text[start : end + 1]
    return re.findall(r"['\"](/[^'\"]*)['\"]\s*:", block)


def _segments(path: str) -> list[str]:
    return path.strip("/").split("/")


def _front_segment_regex(segment: str) -> re.Pattern[str]:
    """Segment literalu frontu -> wzorzec. `{p}` pasuje do dowolnego tekstu bez `/`.

    Znacznik bywa DOKLEJONY do literalu (`report.${format}`, `...${q ? '?'+q : ''}`),
    wiec dopasowanie musi dzialac wewnatrz segmentu, nie tylko na calym segmencie.
    """
    return re.compile(
        "".join(
            "[^/]*" if piece == "{p}" else re.escape(piece)
            for piece in re.split(r"(\{p\})", segment)
            if piece
        )
        + "$"
    )


def _front_matches_served(front: str, served_paths: list[str]) -> bool:
    """Czy literal frontu trafia w realna trase (dokladnie albo jako jej poczatek)?

    Porownanie jest SEGMENTOWE i dwustronnie tolerancyjne:
      * parametr trasy backendu (`{run_id}`) pasuje do dowolnego segmentu frontu,
      * znacznik frontu (`{p}`) pasuje do dowolnego tekstu w segmencie backendu.

    Dopasowanie POCZATKU (front krotszy od trasy) jest potrzebne, bo klienci
    trzymaja bazy adresow (`const API_BASE = '/api'`) sklejane dalej w miejscu
    wolania — same w sobie nie sa pelna trasa, ale nie sa tez rozjazdem.
    """
    front_segments = _segments(front)
    patterns = [_front_segment_regex(segment) for segment in front_segments]
    for served in served_paths:
        served_segments = _segments(served)
        if len(front_segments) > len(served_segments):
            continue
        if _route_matches(front_segments, patterns, served_segments):
            return True
    return False


def _route_matches(
    front_segments: list[str],
    patterns: list[re.Pattern[str]],
    served_segments: list[str],
) -> bool:
    """Dopasowanie trasy z regula „najwyzej JEDEN luzny kierunek".

    Segment moze sie zgodzic na dwa niescisle sposoby:

      * LUZ A — znacznik frontu (`${format}`) trafia w LITERAL trasy.
        Tak wyglada `/export/${format}` wobec `/export/docx` — poprawnie.
      * LUZ B — LITERAL frontu trafia w PARAMETR trasy.
        Tak wyglada `/runs/v126/ssci_impedance` wobec `/runs/v126/{analysis_type}`
        — rowniez poprawnie.

    Kazdy z tych luzow z OSOBNA jest potrzebny, ale ich POLACZENIE oznacza, ze
    dopasowanie „przejechalo" po strukturze trasy i nie dowodzi juz niczego.
    Realny przypadek: `/api/study-cases/${caseId}/runs` — trasa NIEISTNIEJACA —
    zgadzal sie z `/api/study-cases/project/{project_id}`, bo `${caseId}` brano
    za slowo `project` (LUZ A), a `runs` za parametr (LUZ B). Zakaz laczenia
    obu luzow zostawia oba potrzebne dopasowania i odcina ten falszywy zielony.
    """
    loose_a = False
    loose_b = False
    for front_segment, pattern, served_segment in zip(
        front_segments, patterns, served_segments, strict=False
    ):
        served_is_param = served_segment.startswith("{") and served_segment.endswith("}")
        front_has_placeholder = "{p}" in front_segment
        if front_segment == "{p}" and served_is_param:
            continue  # parametr wobec parametru — zgodnosc scisla
        if served_is_param:
            loose_b = True
            continue
        if not pattern.match(served_segment):
            return False
        if front_has_placeholder:
            loose_a = True
    return not (loose_a and loose_b)


def _proxied(path: str, proxy_prefixes: list[str]) -> bool:
    return any(
        path == prefix or path.startswith(prefix.rstrip("/") + "/") for prefix in proxy_prefixes
    )


def check_route_prefixes() -> list[str]:
    violations: list[str] = []

    routes, problems = discover_all_routes_with_problems()
    # Router nierozwiazany statycznie = naruszenie (fail-closed).
    violations.extend(f"[route-prefix-unresolved-router] {problem}" for problem in problems)

    # --- REGULA 1: kanon prefiksu po stronie backendu -----------------------
    for route in routes:
        if route.path.startswith(CANONICAL_PREFIX + "/") or route.path == CANONICAL_PREFIX:
            continue
        if route.path in BACKEND_PREFIX_EXCEPTIONS:
            continue
        violations.append(
            f"[route-prefix-poza-kanonem] {route.key} ({route.source}) "
            f"stoi poza {CANONICAL_PREFIX!r} i nie ma wpisu w BACKEND_PREFIX_EXCEPTIONS"
        )

    served_paths = sorted({route.path for route in routes})
    # Zakres skanowania frontu = pierwsze segmenty realnych tras PLUS zawsze
    # segment kanoniczny. Bez tego drugiego skladnika guard mial slepa plamke
    # dokladnie na defekcie, ktory ma lapac: gdy backend serwuje `/x`, a klient
    # wola `/api/x`, segment `api` moglby nie wystapic w zadnej trasie i literal
    # klienta wypadlby poza zakres — czyli rozjazd byl niewidoczny.
    backend_first_segments = {
        route.path.split("/")[1] for route in routes if len(route.path.split("/")) > 1
    }
    backend_first_segments.add(CANONICAL_PREFIX.strip("/"))
    proxy_prefixes = parse_vite_proxy_prefixes()

    # --- REGULY 2 i 3: klient frontu kontra realna tablica tras -------------
    # Trafienia liczymy PER SCIEZKA, nie per modul — wpis dlugu zwalnia dokladnie
    # te sciezke, ktora zostala zarejestrowana, i ani jednej wiecej.
    debt_hits: dict[tuple[str, str], int] = {
        (source, path): 0
        for source, (paths, _) in FRONTEND_DEAD_CLIENT_DEBT.items()
        for path in paths
    }
    for front in collect_frontend_paths(backend_first_segments):
        if not _front_matches_served(front.path, served_paths):
            key = (front.source, front.path)
            if key in debt_hits:
                debt_hits[key] += 1
                continue
            violations.append(
                f"[route-prefix-martwa] {front.source}:{front.line} wola {front.path!r}, "
                "ktorej backend NIE serwuje"
            )
            continue
        if not _proxied(front.path, proxy_prefixes):
            violations.append(
                f"[route-prefix-nieosiagalna] {front.source}:{front.line} wola {front.path!r} "
                f"— backend ja serwuje, ale dev-proxy jej nie przepuszcza "
                f"(reguly: {proxy_prefixes})"
            )

    # Rejestr dlugu ma tylko MALEC. Zarejestrowana sciezka, ktorej juz nie ma
    # (naprawiona albo usunieta), MUSI zniknac z listy — zostawiona zamienia sie
    # w ciche wykluczenie czekajace na przyszla regresje pod tym samym adresem.
    for (source, path), hits in sorted(debt_hits.items()):
        if hits == 0:
            violations.append(
                f"[route-prefix-nieaktualny-dlug] {source}: sciezka {path!r} nie jest juz "
                "martwa — usun ja z FRONTEND_DEAD_CLIENT_DEBT"
            )

    # --- REGULA 4: kazda regula proxy ma pokrycie w trasach -----------------
    # Reguła proxy bez ani jednej trasy pod nia to resztka po przeniesionym
    # prefiksie — zostawiona, myli przy nastepnej zmianie.
    for prefix in proxy_prefixes:
        if not any(
            path == prefix or path.startswith(prefix.rstrip("/") + "/") for path in served_paths
        ):
            violations.append(
                f"[route-prefix-martwa-regula-proxy] vite.config.ts przepuszcza {prefix!r}, "
                "ale backend nie serwuje pod tym prefiksem ani jednej trasy"
            )

    return violations


def main() -> int:
    violations = check_route_prefixes()
    # Dlug wypisujemy ZAWSZE — zarejestrowany nie znaczy niewidoczny.
    if FRONTEND_DEAD_CLIENT_DEBT:
        laczna = sum(len(paths) for paths, _ in FRONTEND_DEAD_CLIENT_DEBT.values())
        print(
            f"route-prefix-guard: zarejestrowany dlug 'klient bez dostawcy' "
            f"({len(FRONTEND_DEAD_CLIENT_DEBT)} modulow, {laczna} sciezek) — INNA KLASA:"
        )
        for source, (paths, reason) in sorted(FRONTEND_DEAD_CLIENT_DEBT.items()):
            print(f" * {source} ({len(paths)}): {reason}")
        print()
    if violations:
        print("route-prefix-guard: FAILED")
        for violation in violations:
            print(f" - {violation}")
        return 1
    print("route-prefix-guard: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
