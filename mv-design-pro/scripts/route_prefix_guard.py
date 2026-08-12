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

DRUGA INSTANCJA TEJ SAMEJ KLASY — KLIENT-BEZ-RODZINY (naprawiona 2026-08-12)
-----------------------------------------------------------------------
Karta PREFIKSY naprawila rozjazd MIEDZY dwiema tablicami tras. Zapadka miala
jednak WLASNY blad tej samej klasy: `collect_frontend_paths` zbieral literaly
frontu WYLACZNIE dla PIERWSZYCH SEGMENTOW, ktore backend juz serwuje
(`backend_first_segments`, wyprowadzone z tablicy tras backendu). Skutek:
klient wolajacy RODZINE, ktorej backend nie ma W OGOLE (pierwszy segment nie
wystepuje w zadnej trasie), mial pierwszy segment SPOZA `backend_first_segments`
i wypadal ze skanu Z KONSTRUKCJI — ani zgloszony, ani policzony. Tak przezyla
(do usuniecia inna karta, commit `d0419a1a`) wyspa `frontend/src/designer/` z
trzema sciezkami do nieistniejacej rodziny `/snapshots` — zero alarmow przez
caly czas istnienia guarda. Odnotowane w `docs/plan/PRZEKAZANIE_NADZORU_2026-08-07.md`
jako kolejkowa pozycja „KLIENT-BEZ-RODZINY".

NAPRAWA: `collect_frontend_paths` zbiera TERAZ kazdy literal absolutny z pliku
zawierajacego wywolanie HTTP, niezaleznie od tego, czy jego pierwszy segment
nalezy do dzisiejszej tablicy tras backendu. Jedynym filtrem zostaje jawna
`FRONTEND_PATH_EXCEPTIONS` — z uzasadnieniem PER POZYCJA, tak jak dla literalow,
ktore adresami HTTP nie sa. `backend_first_segments` (obliczenie oparte na
DRUGIEJ stronie porownania) zostalo usuniete jako martwe.

POMIAR PO NAPRAWIE (2026-08-12): 0 zywych rodzin „klient bez backendu" w repo —
wyspa `designer/` byla jedynym instancja i zostala juz usunieta (commit
`d0419a1a`, 2026-08-08). Poszerzony skan ujawnil 6 literalow spoza `/api` w
plikach z wywolaniem HTTP, ZADEN nie jest realnym adresem: separator `.join('/')`
(`ui/proof/proofLatexApi.ts`), trzy sufiksy sklejane w `adresWyniku()`
(`ui2/wyniki/akademickie/api.ts`: `/trace`, `/proof`, `/report` — literal
wylapany OSOBNO od bazy przez plaski skan pliku, bo nie sa czescia tego samego
literalu co `BAZA_PRZEBIEGU`) oraz dwie sciezki zasobow statycznych serwowanych
przez Vite z `public/test-fixtures/` w harnessie zrzutow ekranu, nie przez
backend (`screenshot-harness-main.tsx`). Wszystkie szesc opisane per-pozycja w
`FRONTEND_PATH_EXCEPTIONS` ponizej.

TRZECIA INSTANCJA TEJ SAMEJ KLASY — FRONTEND-WYJATKI-STALE (naprawiona 2026-08-12)
-----------------------------------------------------------------------------
Odbior karty KLIENT-BEZ-RODZINY nazwal dlug NASTEPNY, zanim zdazyl powstac:
wpis `FRONTEND_PATH_EXCEPTIONS` moze OSIEROCEC — literal, ktory go uzasadnial,
zniknie z frontu (plik usuniety, sufiks przepisany, helper zmieniony), a wpis
zostanie. Osierocony wpis nie jest neutralny: PO CICHU poszerza allowliste —
przyszly literal o TEJ SAMEJ sciezce (przypadkiem albo celowo) przeszedlby
guard bez zadnej kontroli, bo dopasowanie jest po samej sciezce, nie po
zrodle, ktore ja wyprodukowalo.

NAPRAWA: `check_frontend_path_exceptions_freshness()` — kazdy wpis
`FRONTEND_PATH_EXCEPTIONS` musi nadal pasowac do co najmniej jednego literalu
z `collect_all_frontend_literals()` (zbior SUROWY, PRZED filtrem wyjatkow).
Wpis bez pokrycia = naruszenie nazywajace wpis po kluczu, z zadaniem jego
usuniecia. Zapadka i filtr (`collect_frontend_paths()`) czytaja z JEDNEGO
zrodla prawdy — `_exception_covers_literal()` — zamiast dwoch rownoleglych
porownan sciezek, ktore moglyby z czasem dryfowac (regula KLASA-NIE-INSTANCJA
§3, predykaty parami).

Zapadka MUSI liczyc po zbiorze SUROWYM, nie po `collect_frontend_paths()`
(ktory sam juz odejmuje `FRONTEND_PATH_EXCEPTIONS`) — inaczej kazdy dzialajacy
wpis wygladalby jak sierota, bo literal, ktory go uzasadnia, znika z
przefiltrowanego zbioru WLASNIE DLATEGO, ze wyjatek zadzialal poprawnie.

POMIAR NA HEAD PRZED NAPRAWA (2026-08-12): 6/6 wpisow `FRONTEND_PATH_EXCEPTIONS`
mialo dokladnie jedno pokrycie w surowym skanie (0 sierot) — dlug byl
NAZWANY, nie jeszcze ZREALIZOWANY. Zapadka pilnuje, zeby nie powstal cicho.

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
    RouteContract,
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
#
# ZAPADKA SWIEZOSCI (karta FRONTEND-WYJATKI-STALE, 2026-08-12): kazdy wpis
# musi nadal wskazywac trase, ktora RZECZYWISCIE stoi poza `/api` w dzisiejszej
# tablicy tras — sprawdza to `check_backend_prefix_exceptions_freshness()`.
# --------------------------------------------------------------------------
BACKEND_PREFIX_EXCEPTIONS: dict[str, str] = {}

# --------------------------------------------------------------------------
# WYJATKI PO STRONIE FRONTU. Literal sciezki, ktorego guard nie ma dopasowywac
# do tablicy tras — wylacznie dla przypadkow, gdzie sciezka NIE jest adresem
# HTTP backendu (np. sciezka pliku, klucz slownika zaczynajacy sie od `/`).
#
# Klucz jest GLOBALNY (nie per-plik) — tak samo jak `BACKEND_PREFIX_EXCEPTIONS`.
# Kazda pozycja ponizej zostala potwierdzona pelnym skanem repo (2026-08-12,
# naprawa KLIENT-BEZ-RODZINY): to JEDYNE literaly spoza `/api` w plikach z
# wywolaniem HTTP — zaden z nich nie jest adresem, ktorego brak dostawcy
# nalezaloby zarejestrowac w `FRONTEND_DEAD_CLIENT_DEBT` ponizej.
#
# ZAPADKA SWIEZOSCI (karta FRONTEND-WYJATKI-STALE, 2026-08-12): kazdy wpis
# ponizej musi nadal pasowac do co najmniej jednego literalu zebranego przez
# `collect_all_frontend_literals()` (zbior SUROWY, sprzed odjecia tej samej
# listy) — sprawdza to `check_frontend_path_exceptions_freshness()`. Wpis,
# ktorego literal zniknal z frontu (plik usuniety, helper przepisany), jest
# naruszeniem: osierocony wpis po cichu poszerza allowliste dla przyszlego
# literalu o tej samej sciezce.
# --------------------------------------------------------------------------
FRONTEND_PATH_EXCEPTIONS: dict[str, str] = {
    "/": (
        "frontend/src/ui/proof/proofLatexApi.ts: separator `.join('/')` przy budowie "
        "URL-a (`[BAZA, id, ...SEGMENTY].join('/')`), nie samodzielny adres — plaski "
        "skan literalow pliku wylapuje go jako oddzielny literal `'/'`."
    ),
    "/trace": (
        "frontend/src/ui2/wyniki/akademickie/api.ts: sufiks doklejany jako argument "
        "`adresWyniku(runId, rodzaj, '/trace')` — realny adres to "
        "`/api/analysis-runs/{id}/results/v126/{rodzaj}/trace`, ale sufiks jest "
        "OSOBNYM literalem od bazy `BAZA_PRZEBIEGU`, wiec plaski skan pliku wylapuje "
        "go jako niezalezna, pozorna rodzine `/trace`."
    ),
    "/proof": (
        "frontend/src/ui2/wyniki/akademickie/api.ts: jak `/trace` powyzej — sufiks "
        "`adresWyniku(runId, rodzaj, '/proof')`, realny adres "
        "`/api/analysis-runs/{id}/results/v126/{rodzaj}/proof`."
    ),
    "/report": (
        "frontend/src/ui2/wyniki/akademickie/api.ts: jak `/trace` powyzej — sufiks "
        "`adresWyniku(runId, rodzaj, '/report')`, realny adres "
        "`/api/analysis-runs/{id}/results/v126/{rodzaj}/report`."
    ),
    "/test-fixtures/sldSubstrate52s.powerflow.json": (
        "frontend/src/screenshot-harness-main.tsx: fixtura wizualna serwowana przez "
        "Vite jako plik statyczny z `frontend/public/test-fixtures/` (harness zrzutow "
        "ekranu, `screenshot-harness.html`, poza glowna aplikacja SPA) — backend nigdy "
        "nie serwuje tej sciezki i nie ma jej serwowac."
    ),
    "/test-fixtures/{p}.enm.json": (
        "frontend/src/screenshot-harness-main.tsx: jak wyzej, nazwa fixtury wybierana "
        "parametrem `?fixture=` (`fetch(`/test-fixtures/${fixtureNameFromQuery()}.enm.json`)`) "
        "— plik statyczny Vite, nie adres backendu."
    ),
}

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
        # SPROSTOWANE 2026-08-08 (karta ROUTERY-MARTWE). Poprzednie uzasadnienie
        # glosilo „backend NIGDY nie mial routera /api/protection-coordination" —
        # to NIEPRAWDA i przeklamywala czekajaca tu decyzje: sugerowala budowe
        # dostawcy OD ZERA, podczas gdy dostawca w wiekszosci ISTNIEJE.
        "backend MA modul `api/protection_coordination.py` z 7 trasami pod prefiksem "
        "`/protection-coordination`, ale aplikacja go NIE MONTUJE (pilnuje tego "
        "`router_mount_guard`, wpis w `SWIADOMIE_ODSTAWIONE`). Zestawienie klienta z "
        "modulem: 7 z 9 wolan ma dokladny odpowiednik w module (run, {id}, tcc, trace, "
        "checks/sensitivity, checks/selectivity, checks/overload); BRAKUJE dwoch "
        "eksportow ({id}/export/pdf, {id}/export/docx). Modul nie ma ANI JEDNEGO "
        "importera; zywy ekran koordynacji (E-28) to ui2/wyniki/koordynacja, ktory czyta "
        "/api/protection/overcurrent-settings — czyli WEZSZA zdolnosc (nastawy jednego "
        "pola, bez pary gora-dol). Do decyzji: usunac oba martwe konce albo domknac "
        "koordynacje end-to-end (montaz pod /api + dwa eksporty + ekran).",
    ),
    # WPIS ZDJETY 2026-08-07 (wiersz KLIENT-BEZ-TRASY-WARIANTY w rejestrze).
    # „Do decyzji: usunac albo zbudowac warianty end-to-end" rozstrzygniete na
    # USUNIECIE: zdolnosc porownania A/B juz istnieje inna, zywa droga (przestrzen
    # wynikow, routery power-flow-comparisons i execution/comparisons), wiec budowa
    # drugiego dostawcy byla by duplikacja. Modul `variantStore.ts` + `VariantSelector.tsx`
    # usuniety razem z testem; zapadka ZMALALA o trzy sciezki i tak ma zostac.
    # Nie przywracaj tego wpisu bez przywrocenia modulu — bramka zada wtedy jego zdjecia.
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


def collect_all_frontend_literals() -> list[FrontendPath]:
    """Wszystkie literaly sciezek absolutnych z plikow wolajacych HTTP, PRZED
    filtrem `FRONTEND_PATH_EXCEPTIONS`.

    ZAKRES JEST PELNY: kazdy literal absolutny z pliku zawierajacego wywolanie
    HTTP (`fetch`/`axios.*`) jest kandydatem, NIEZALEZNIE od tego, czy jego
    pierwszy segment nalezy do dzisiejszej tablicy tras backendu.

    Dawniej zbior byl zawezany do pierwszych segmentow JUZ znanych backendowi
    (`backend_first_segments`, wyprowadzone z DRUGIEJ strony porownania) —
    to byl blad, nie zabezpieczenie: klient wolajacy RODZINE, ktorej backend
    nie ma W OGOLE, mial pierwszy segment spoza tego zbioru i wypadal ze
    skanu z konstrukcji, zamiast zostac zgloszony jako martwy. Tak przezyla
    (do usuniecia inna karta, `d0419a1a`) wyspa `frontend/src/designer/` z
    trzema sciezkami do nieistniejacej rodziny `/snapshots` — zero alarmow
    przez caly czas istnienia guarda (karta KLIENT-BEZ-RODZINY, 2026-08-12).

    Funkcja CELOWO nie filtruje `FRONTEND_PATH_EXCEPTIONS` — surowy wynik sluzy
    zapadce pustego skanu w `check_route_prefixes` (zero literalow PRZED
    wyjatkami = skan zepsuty; zero PO wyjatkach, gdy przed nimi bylo cos, to
    zwykly, legalny stan „wszystko wylapane to nie-adresy"). Filtr wyjatkow
    stosuje wylacznie `collect_frontend_paths` ponizej.
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
            if len(segments) < 2:
                continue
            line = text.count("\n", 0, match.start()) + 1
            found.append(FrontendPath(path=candidate, source=rel, line=line))
    return found


def _exception_covers_literal(exception_path: str, literal: FrontendPath) -> bool:
    """JEDYNE zrodlo prawdy dla pytania „czy wpis `FRONTEND_PATH_EXCEPTIONS`
    dotyczy TEGO literalu?" — uzywane zarowno przez filtr
    (`collect_frontend_paths`, ktory odejmuje wyjatki od surowego zbioru), jak
    i przez zapadke swiezosci (`check_frontend_path_exceptions_freshness`,
    ktora sprawdza, ze kazdy wyjatek ma jeszcze co odejmowac).

    Dopasowanie jest DOKLADNA rownoscia sciezek (klucz wyjatku == `literal.path`).
    Funkcja istnieje mimo trywialnosci reguly, zeby oba miejsca uzycia czytaly
    z JEDNEGO porownania zamiast dwoch rownoleglych, ktore moglyby z czasem
    rozjechac sie w definicji „dopasowania" (regula KLASA-NIE-INSTANCJA §3,
    predykaty parami — karta FRONTEND-WYJATKI-STALE, 2026-08-12).
    """
    return exception_path == literal.path


def collect_frontend_paths() -> list[FrontendPath]:
    """`collect_all_frontend_literals()` po odjeciu jawnych `FRONTEND_PATH_EXCEPTIONS`

    Front trzyma tez literaly, ktore adresami HTTP NIE SA (separatory `.join`,
    sufiksy sklejane w helperach budujacych URL, sciezki zasobow statycznych
    spoza backendu) — jedynym filtrem na to jest JAWNA `FRONTEND_PATH_EXCEPTIONS`
    z uzasadnieniem per pozycja, nie domyslne wykluczenie oparte na tym, co
    backend akurat dzis serwuje.
    """
    return [
        item
        for item in collect_all_frontend_literals()
        if not any(
            _exception_covers_literal(exception_path, item)
            for exception_path in FRONTEND_PATH_EXCEPTIONS
        )
    ]


def check_frontend_path_exceptions_freshness(
    raw_literals: list[FrontendPath],
) -> list[str]:
    """Zapadka swiezosci `FRONTEND_PATH_EXCEPTIONS` (karta FRONTEND-WYJATKI-STALE).

    Kazdy wpis MUSI nadal pasowac do co najmniej jednego literalu z `raw_literals`
    — zbioru SUROWEGO (`collect_all_frontend_literals()`), sprzed odjecia tej
    samej listy. Wpis bez pokrycia = literal, ktory go uzasadnial, zniknal z
    frontu (plik usuniety, sufiks przepisany, helper zmieniony) — wyjatek
    OSIEROCIAL i po cichu poszerza allowliste dla kazdego PRZYSZLEGO literalu
    o tej samej sciezce, ktory guard juz nigdy by nie zobaczyl.

    Zbior MUSI byc SUROWY (przed filtrem), nie wynik `collect_frontend_paths()`
    — ten drugi juz ODEJMUJE `FRONTEND_PATH_EXCEPTIONS`, wiec kazdy dzialajacy
    wpis wygladalby jak sierota: literal, ktory go uzasadnia, znika z
    przefiltrowanego zbioru WLASNIE DLATEGO, ze wyjatek zadzialal poprawnie.

    Uzywa `_exception_covers_literal()` — TEGO SAMEGO porownania, ktorym
    `collect_frontend_paths()` odejmuje wyjatki od surowego zbioru (regula
    KLASA-NIE-INSTANCJA §3, predykaty parami): zapadka i filtr nie moga
    dryfowac w rozne strony, bo czytaja z jednej funkcji.
    """
    violations: list[str] = []
    for exception_path, reason in sorted(FRONTEND_PATH_EXCEPTIONS.items()):
        if any(_exception_covers_literal(exception_path, item) for item in raw_literals):
            continue
        violations.append(
            f"[route-prefix-wyjatek-osierocony] FRONTEND_PATH_EXCEPTIONS[{exception_path!r}] "
            "nie pasuje juz do zadnego literalu znalezionego w plikach frontu z "
            f"wywolaniem HTTP — usun ten wpis (uzasadnienie bylo: {reason})"
        )
    return violations


def check_backend_prefix_exceptions_freshness(routes: list[RouteContract]) -> list[str]:
    """Zapadka swiezosci `BACKEND_PREFIX_EXCEPTIONS` — ta sama klasa ryzyka co
    `check_frontend_path_exceptions_freshness()` powyzej, w tym samym pliku i
    tym samym guardzie: wpis moze osierocec, gdy trasa, ktora go uzasadniala,
    zostanie przeniesiona pod `/api` albo usunieta. Naprawiona przy okazji
    (karta FRONTEND-WYJATKI-STALE, 2026-08-12) — trywialna, mechanicznie
    identyczna z naprawa frontu.
    """
    served_paths = {route.path for route in routes}
    violations: list[str] = []
    for exception_path, reason in sorted(BACKEND_PREFIX_EXCEPTIONS.items()):
        if exception_path in served_paths:
            continue
        violations.append(
            f"[route-prefix-wyjatek-osierocony-backend] BACKEND_PREFIX_EXCEPTIONS"
            f"[{exception_path!r}] nie pasuje juz do zadnej trasy w dzisiejszej "
            f"tablicy — usun ten wpis (uzasadnienie bylo: {reason})"
        )
    return violations


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
    violations.extend(check_backend_prefix_exceptions_freshness(routes))

    served_paths = sorted({route.path for route in routes})
    proxy_prefixes = parse_vite_proxy_prefixes()

    # --- REGULY 2 i 3: klient frontu kontra realna tablica tras -------------
    # Trafienia liczymy PER SCIEZKA, nie per modul — wpis dlugu zwalnia dokladnie
    # te sciezke, ktora zostala zarejestrowana, i ani jednej wiecej.
    debt_hits: dict[tuple[str, str], int] = {
        (source, path): 0
        for source, (paths, _) in FRONTEND_DEAD_CLIENT_DEBT.items()
        for path in paths
    }
    raw_frontend_literals = collect_all_frontend_literals()
    # Zapadka na pusty zbior: skan bez ANI JEDNEGO kandydata (PRZED filtrem
    # FRONTEND_PATH_EXCEPTIONS) jest sam w sobie naruszeniem (fail-closed), nie
    # cichym „wszystko OK". Realny frontend ma dziesiatki modulow klienckich pod
    # `/api` — zero trafien znaczy, ze skan (rozszerzenie plikow, katalog
    # FRONTEND_SRC, wzorzec HTTP_CALL_HINT) jest zepsuty, a nie ze repo nie ma
    # klientow HTTP. Sprawdzamy zbior SUROWY (przed wyjatkami), zeby modul, w
    # ktorym KAZDY znaleziony literal akurat trafil na wyjatek, nie wygladal
    # tak samo jak skan, ktory nie znalazl niczego w ogole.
    if not raw_frontend_literals:
        violations.append(
            "[route-prefix-skan-pusty] collect_all_frontend_literals() nie znalazl ANI JEDNEGO "
            "literalu sciezki w plikach z wywolaniem HTTP — skan jest zepsuty (rozszerzenie "
            "plikow / FRONTEND_SRC / HTTP_CALL_HINT), nie repo bez klientow"
        )
    violations.extend(check_frontend_path_exceptions_freshness(raw_frontend_literals))
    for front in collect_frontend_paths():
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
