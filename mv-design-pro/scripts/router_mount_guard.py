"""Guard KLASY „router zdefiniowany, ale nigdy niezamontowany”.

DLUG, KTORY TO PRZYPINA (karta ROUTERY-MARTWE)
----------------------------------------------
Modul `backend/src/api/*.py` moze zadeklarowac `APIRouter`, obwiesic go
dekoratorami tras, dostac testy i dokumentacje — i NIE BYC WPIETY do aplikacji.
Wtedy trasy nie istnieja dla nikogo: front dostaje 404, a nastepny edytor
poprawia ten kod w przekonaniu, ze jest zywy. To NIE jest tylko smiec: to
falszywy dostawca zdolnosci.

POMIAR NA HEAD PRZED NAPRAWA (2026-08-08, po tozsamosci funkcji obslugi w
zywej aplikacji, nie po napisie sciezki): 12 modulow `src/api/**` z routerem,
ktorego ZADNA trasa nie jest osiagalna — razem 36 tras. Zadna z nich nie miala
konsumenta wolajacego dokladnie ta sciezke.

DLACZEGO ZADEN ISTNIEJACY GUARD TEGO NIE WIDZIAL
-----------------------------------------------
`api_lifecycle_guard` i `route_prefix_guard` chodza po trasach WPIETYCH
(`discover_all_routes_with_problems` startuje od `app.include_router`), wiec
router niezamontowany jest dla nich niewidzialny Z KONSTRUKCJI. Iniekcja
kontrolna (pusty router `APIRouter(prefix="/api/iniekcja")` nigdzie
niewpiety) przechodzila komplet 69 guardow CI z RC=0. To jest to samo pytanie
kontrolne, ktore prowadzi cala fale audytu: czy zbior, po ktorym chodzi
wyrocznia, jest tym samym zbiorem, na ktorym dziala kod? Tam nie byl.

REGULA
------
KAZDY `APIRouter` zadeklarowany na poziomie modulu w `backend/src/api/**` jest
albo ZAMONTOWANY (bezposrednio przez `app.include_router`, przez reeksport, przez
router pochodny, albo zagniezdzony w innym zamontowanym routerze), albo stoi na
jawnej liscie `SWIADOMIE_ODSTAWIONE` z uzasadnieniem MERYTORYCZNYM.

Guard jest FAIL-CLOSED: router, ktorego nie da sie rozwiazac statycznie, jest
naruszeniem, nie cichym pominieciem (ta sama zasada co w `api_lifecycle_guard`).
PUSTY SKAN JEST BLEDEM — zapadka `MIN_MODULOW_Z_ROUTEREM` nie pozwala meldowac
zieleni skanowi, ktory nic nie znalazl.

ZAPADKA W OBIE STRONY (wzor: `no_direct_fault_params_guard` — budzet zastanych
wywolan per plik; `mypy_ratchet_guard` — prog liczby bledow). `BUDZET_ODSTAWIONYCH_TRAS`
to DOKLADNA liczba tras na routerach swiadomie odstawionych. Wiecej = dlug urosl.
MNIEJ = dlug zmalal i trzeba to utrwalic, inaczej nieaktualny wpis zamienia sie
w ciche wykluczenie czekajace na przyszla regresje pod tym samym adresem.

FORMY, KTORYCH TEN GUARD NIE WYKRYWA — nazwane wprost
----------------------------------------------------
Granica opisana jest granica; granica przemilczana jest dziura. Trzy zalozenia,
na ktorych stoi ten guard, sa DODATKOWO EGZEKWOWANE (ponizej), zeby nie stac sie
cicha dziura, gdy ktos je zlamie:

  1. **Montaz warunkowy** (`if os.getenv(...): app.include_router(...)`) — guard
     czyta wywolania `include_router` bez patrzenia na warunek, wiec router wpiety
     tylko pod flaga wygladalby jak zamontowany zawsze. Dlatego montaz w bloku
     warunkowym jest NARUSZENIEM (`[router-montaz-warunkowy]`).
  2. **Druga aplikacja FastAPI** — guard zna jeden punkt montazu (`api/main.py`).
     Drugie `FastAPI(...)` w `backend/src` jest NARUSZENIEM
     (`[router-wiele-aplikacji]`), bo unieważniałoby caly pomiar.
  3. **Router poza `backend/src/api/**`** — guard skanuje tylko ten katalog.
     `APIRouter` poza nim jest NARUSZENIEM (`[router-poza-katalogiem-api]`).

Formy realnie NIEWYKRYWALNE, swiadomie zostawione poza zakresem:

  4. **Router zbudowany dynamicznie** poza rozpoznanym ksztaltem fabryki
     (`_derived_router` w `api_lifecycle_guard`) — np. zwracany z funkcji, budowany
     w petli, wybierany ze slownika. Taki router konczy sie
     `[router-nierozwiazany]`, wiec jest fail-closed, ale guard nie powie, KTORE
     trasy naprawde wisza w aplikacji.
  5. **Router zamontowany, ktorego wszystkie trasy sa wylaczone** z routera
     produkcyjnego (mechanizm `_PRODUCTION_DISABLED_ROUTE_KEYS` w `api/enm.py`).
     Modul liczy sie wtedy jako zamontowany — bo jest. Martwe POJEDYNCZE trasy
     wewnatrz zamontowanego routera to INNA KLASA i pilnuje ich
     `api_lifecycle_guard` (macierz kompatybilnosci).
  6. **Trasy rejestrowane bez `APIRouter`** (`@app.get`, `app.add_api_route`) —
     nie ma tu routera do zgubienia, wiec klasa nie wystepuje.

Guard NIE importuje zaleznosci backendu — dziala na golym `python3`.
"""

from __future__ import annotations

import ast
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from api_lifecycle_guard import (  # noqa: E402
    UnresolvedRouter,
    _apirouter_prefix,
    _derived_router,
    _module_level_assignments,
    _reexport_target,
    _route_decorators,
    read_text,
)

ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = ROOT / "backend" / "src"
API_DIR = BACKEND_SRC / "api"
MAIN_PATH = API_DIR / "main.py"

#: Zapadka na pusty skan. Na HEAD 2026-08-08: 50 modulow `src/api/**` deklaruje
#: `APIRouter`. Mniej niz 45 znaczy, ze zmienil sie uklad katalogow albo skladnia
#: deklaracji — a NIE ze routerow ubylo. Skan, ktory nic nie znalazl, nie ma prawa
#: meldowac zieleni (ta sama zasada co `MIN_GUARDOW` w `guardy_z_ci.py`).
MIN_MODULOW_Z_ROUTEREM = 45

#: DOKLADNA liczba tras na routerach z `SWIADOMIE_ODSTAWIONE`. Zapadka dziala w
#: OBIE STRONY: wiecej = dlug urosl (naruszenie), mniej = dlug zmalal i trzeba
#: obnizyc budzet, inaczej poprawa nie zostaje utrwalona.
#: Pomiar 2026-08-08: protection_coordination 7 + archive_diff 2 + cloud_backup 4
#: + incremental_archive 3 = 16.
BUDZET_ODSTAWIONYCH_TRAS = 16

# --------------------------------------------------------------------------
# ROUTERY SWIADOMIE ODSTAWIONE (nie wpiete i nie usuniete).
#
# Klucz: nazwa modulu w `backend/src/api/` (bez `.py`, z kropkami dla podkatalogow).
# Wartosc: (nazwy zmiennych-routerow, uzasadnienie MERYTORYCZNE).
#
# Wpis WOLNO zalozyc TYLKO wtedy, gdy modul niesie ZDOLNOSC, ktorej decyzja
# „wpiac czy skasowac” jest decyzja produktowa, a nie porzadkiem w plikach.
# Reguła wlasciciela: montowac WYLACZNIE z konsumentem — trasa bez odbiorcy jest
# fantomem. Wpis, ktory przestal byc prawdziwy (modul zniknal albo zostal wpiety),
# zapala czerwien: `[router-nieaktualny-wpis]`.
# --------------------------------------------------------------------------
SWIADOMIE_ODSTAWIONE: dict[str, tuple[tuple[str, ...], str]] = {
    "protection_coordination": (
        ("router",),
        "CALA ZDOLNOSC koordynacji zabezpieczen (7 koncowek: bieg, TCC, slad, "
        "kontrole czulosci/selektywnosci/przeciazenia) + martwy klient frontu "
        "`ui/protection-coordination/api.ts` z 10 sciezkami w rejestrze "
        "`FRONTEND_DEAD_CLIENT_DEBT`. Zywy ekran koordynacji (E-28) to "
        "`ui2/wyniki/koordynacja`, ktory czyta `/api/protection/overcurrent-settings` "
        "— czyli WEZSZA zdolnosc (nastawy jednego pola, bez pary gora-dol). "
        "Rozstrzygniecie „wpiac dostawce koordynacji czy skasowac ekran” jest "
        "decyzja o ZAKRESIE PRODUKTU, nie o porzadku w plikach — zostaje na "
        "osobna karte. Do tego czasu modul NIE JEST wpiety: trasa bez konsumenta "
        "byla by fantomem.",
    ),
    "archive_diff": (
        ("router",),
        "Roznicowanie dwoch archiwow projektu (ZIP) — zdolnosc odnotowana w "
        "WIAZACYM inwentarzu `docs/uiux/INWENTARZ_FUNKCJI_2026-07.md` (wiersz "
        "„Archiwum projektu (ZIP)”, ocena ◐) jako SWIADOMA luka: „poza UI zostaja "
        "roznicowanie i archiwum przyrostowe”. Warstwa domenowa "
        "(`domain/archive_diff.py` + `tests/test_archive_diff.py`) jest kompletna i "
        "przetestowana; brakuje wejscia w UI. Usuniecie zabralo by zdolnosc, ktora "
        "inwentarz sledzi jako zaplanowana — wpiecie bez ekranu dalo by trase bez "
        "konsumenta. Decyzja: karta domykajaca archiwum end-to-end.",
    ),
    "incremental_archive": (
        ("router",),
        "Eksport/import przyrostowy archiwum + historia eksportow — ta sama "
        "odnotowana luka inwentarza co `archive_diff` („poza UI zostaja roznicowanie "
        "i archiwum przyrostowe”). Dodatkowo modul jest CZYNNYM przedmiotem programu "
        "10x (`docs/plan/10X_WSP_INWENTARZ.md`: pozycja P2 wspolbieznosci, cykl "
        "odczyt-przeliczenie-zapis naprawiony w §7 pkt 2) — kasacja tutaj kolidowala "
        "by z inna karta. Decyzja razem z `archive_diff`.",
    ),
    "cloud_backup": (
        ("router",),
        "Kopie zapasowe archiwow w chmurze (4 koncowki + dostawcy w "
        "`infrastructure/cloud_backup.py`, konfiguracja ze zmiennych srodowiska). "
        "Zdolnosc kompletna i przetestowana, ale NIE jest obiecana w zadnej macierzy "
        "funkcji — nie ma ani ekranu, ani decyzji produktowej, czy system ma wozic "
        "dane projektow do zewnetrznego dostawcy (to pytanie o powierzenie danych, "
        "nie o kod). Montaz bez tej decyzji wystawilby koncowke zapisu do chmury "
        "bez konsumenta; kasacja rozstrzygnela by pytanie produktowe po cichu.",
    ),
}


@dataclass(frozen=True)
class RouterDef:
    """`APIRouter` zadeklarowany na poziomie modulu `api/**`."""

    module: str
    var: str
    prefix: str
    line: int

    @property
    def key(self) -> str:
        return f"{self.module}.{self.var}"


def _module_name(path: Path, api_dir: Path) -> str:
    return ".".join(path.relative_to(api_dir).with_suffix("").parts)


def _module_path(module: str, api_dir: Path) -> Path:
    return api_dir / Path(*module.split(".")).with_suffix(".py")


def _annotated_assignments(tree: ast.Module) -> dict[str, ast.expr]:
    """Przypisania Z ANOTACJA na poziomie modulu (`router: APIRouter = ...`).

    `_module_level_assignments` w `api_lifecycle_guard` widzi tylko `ast.Assign`,
    wiec sama anotacja typu wystarczylaby, zeby router zniknal ze skanu. Tutaj
    forma jest widziana, a jesli taki router zostanie ZAMONTOWANY, rozwiazywanie
    (`resolve_chain`) i tak konczy sie `[router-nierozwiazany]` — fail-closed,
    nie cicha zielen.
    """
    found: dict[str, ast.expr] = {}
    for node in tree.body:
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            if node.value is not None:
                found[node.target.id] = node.value
    return found


def collect_router_defs(api_dir: Path | None = None) -> list[RouterDef]:
    """Kazdy `X = APIRouter(...)` na poziomie modulu w `api/**` (rekursywnie)."""
    directory = api_dir or API_DIR
    defs: list[RouterDef] = []
    for path in sorted(directory.rglob("*.py")):
        tree = ast.parse(read_text(path), filename=str(path))
        assignments = {**_module_level_assignments(tree), **_annotated_assignments(tree)}
        for name, value in assignments.items():
            if not (
                isinstance(value, ast.Call)
                and isinstance(value.func, ast.Name)
                and value.func.id == "APIRouter"
            ):
                continue
            defs.append(
                RouterDef(
                    module=_module_name(path, directory),
                    var=name,
                    prefix=_apirouter_prefix(value),
                    line=value.lineno,
                )
            )
    return defs


def _include_router_calls(tree: ast.Module, holder: str) -> list[tuple[str, ast.Call]]:
    """`<holder>.include_router(<nazwa>)` -> [(nazwa aliasu, wezel wywolania)]."""
    calls: list[tuple[str, ast.Call]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if not (
            isinstance(func, ast.Attribute)
            and func.attr == "include_router"
            and isinstance(func.value, ast.Name)
            and func.value.id == holder
        ):
            continue
        if node.args and isinstance(node.args[0], ast.Name):
            calls.append((node.args[0].id, node))
        else:
            calls.append(("<wyrazenie nie bedace nazwa>", node))
    return calls


def _main_aliases(tree: ast.Module) -> dict[str, tuple[str, str]]:
    """Alias w `main.py` -> (modul `api/*`, nazwa symbolu w tym module)."""
    aliases: dict[str, tuple[str, str]] = {}
    for node in ast.walk(tree):
        if not isinstance(node, ast.ImportFrom) or not node.module:
            continue
        if not node.module.startswith("api."):
            continue
        module = node.module.removeprefix("api.")
        for alias in node.names:
            aliases[alias.asname or alias.name] = (module, alias.name)
    return aliases


def resolve_chain(
    module: str, symbol: str, api_dir: Path, _depth: int = 0
) -> tuple[set[str], set[tuple[str, str]]]:
    """Wszystkie ogniwa `(modul, symbol)` na drodze do routera, ktory TWORZY trasy.

    Zwraca (klucze `modul.symbol` na drodze, para docelowa). Fail-closed:
    nierozpoznany ksztalt konczy sie `UnresolvedRouter`.
    """
    if _depth > 5:
        raise UnresolvedRouter(f"{module}.{symbol}: cykl reeksportow routera")
    path = _module_path(module, api_dir)
    if not path.exists():
        raise UnresolvedRouter(f"brak modulu api/{module.replace('.', '/')}.py")
    tree = ast.parse(read_text(path), filename=str(path))
    assignments = _module_level_assignments(tree)
    visited = {f"{module}.{symbol}"}

    value = assignments.get(symbol)
    if value is None:
        reexport = _reexport_target(tree, symbol)
        if reexport is None:
            raise UnresolvedRouter(
                f"{module}.{symbol} nie jest przypisany na poziomie modulu"
            )
        deeper, target = resolve_chain(reexport[0], reexport[1], api_dir, _depth + 1)
        return visited | deeper, target

    if not (isinstance(value, ast.Call) and isinstance(value.func, ast.Name)):
        raise UnresolvedRouter(f"{module}.{symbol} ma nierozpoznany ksztalt routera")
    if value.func.id == "APIRouter":
        return visited, {(module, symbol)}

    base_name, _ = _derived_router(tree, assignments, value.func.id)
    visited.add(f"{module}.{base_name}")
    return visited, {(module, base_name)}


def _nested_mounts(module: str, holder: str, api_dir: Path) -> list[tuple[str, str]]:
    """`<holder>.include_router(sub)` WEWNATRZ modulu -> lista (modul, symbol).

    Sub-router doklejony do routera zamontowanego jest ZAMONTOWANY. Na HEAD
    2026-08-08 repozytorium nie uzywa tej formy w ogole (jedyne `include_router`
    sa w `api/main.py`) — obsluga jest tu, zeby forma nie stala sie dziura w dniu,
    w ktorym ktos jej uzyje.
    """
    path = _module_path(module, api_dir)
    if not path.exists():
        return []
    tree = ast.parse(read_text(path), filename=str(path))
    aliases = _main_aliases(tree)
    found: list[tuple[str, str]] = []
    for alias, _call in _include_router_calls(tree, holder):
        target = aliases.get(alias)
        if target is not None:
            found.append(target)
        else:
            found.append((module, alias))
    return found


def mounted_router_keys(
    api_dir: Path | None = None, main_path: Path | None = None
) -> tuple[set[str], list[str]]:
    """Klucze `modul.symbol` routerow OSIAGALNYCH z aplikacji + problemy."""
    directory = api_dir or API_DIR
    main = main_path or MAIN_PATH
    problems: list[str] = []
    if not main.exists():
        return set(), [f"[router-nierozwiazany] brak punktu montazu {main}"]

    tree = ast.parse(read_text(main), filename=str(main))
    aliases = _main_aliases(tree)
    queue: list[tuple[str, str]] = []
    for alias, _call in _include_router_calls(tree, "app"):
        target = aliases.get(alias)
        if target is None:
            problems.append(
                f"[router-nierozwiazany] app.include_router({alias}) bez importu z api.*"
            )
            continue
        queue.append(target)

    mounted: set[str] = set()
    seen_pairs: set[tuple[str, str]] = set()
    while queue:
        module, symbol = queue.pop()
        if (module, symbol) in seen_pairs:
            continue
        seen_pairs.add((module, symbol))
        try:
            visited, targets = resolve_chain(module, symbol, directory)
        except UnresolvedRouter as error:
            problems.append(f"[router-nierozwiazany] {error}")
            continue
        mounted |= visited
        for target_module, target_var in targets:
            mounted.add(f"{target_module}.{target_var}")
            queue.extend(_nested_mounts(target_module, target_var, directory))
    return mounted, problems


def check_premises(
    backend_src: Path | None = None, main_path: Path | None = None
) -> list[str]:
    """Zalozenia guarda egzekwowane, zeby nie stac sie cicha dziura."""
    src = backend_src or BACKEND_SRC
    main = main_path or MAIN_PATH
    api_dir = main.parent
    violations: list[str] = []

    # (1) Jedna aplikacja FastAPI i wylacznie w punkcie montazu.
    apps: list[str] = []
    for path in sorted(src.rglob("*.py")):
        tree = ast.parse(read_text(path), filename=str(path))
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id == "FastAPI"
            ):
                apps.append(f"{path.relative_to(src)}:{node.lineno}")
    if len(apps) != 1 or not apps[0].startswith(str(main.relative_to(src))):
        violations.append(
            "[router-wiele-aplikacji] guard zna JEDEN punkt montazu "
            f"({main.relative_to(src)}), a `FastAPI(...)` wystepuje w: "
            f"{', '.join(apps) or 'nigdzie'}. Drugi punkt montazu uniewaznia caly "
            "pomiar — albo wpisz go do guarda, albo go nie twórz."
        )

    # (3) Router poza katalogiem `api/**` — guard tam nie zaglada.
    for path in sorted(src.rglob("*.py")):
        if api_dir in path.parents or path == api_dir:
            continue
        tree = ast.parse(read_text(path), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.Name) and node.id == "APIRouter":
                violations.append(
                    f"[router-poza-katalogiem-api] {path.relative_to(src)}:{node.lineno} "
                    "uzywa APIRouter poza `api/**`, gdzie guard nie skanuje."
                )
                break

    # (2) Montaz warunkowy — guard nie rozroznia „wpiete zawsze” od „pod flaga”.
    if main.exists():
        tree = ast.parse(read_text(main), filename=str(main))
        parents: dict[int, ast.AST] = {}
        for node in ast.walk(tree):
            for child in ast.iter_child_nodes(node):
                parents[id(child)] = node
        blocking = (ast.If, ast.Try, ast.For, ast.While, ast.With, ast.FunctionDef)
        for alias, call in _include_router_calls(tree, "app"):
            node: ast.AST | None = call
            while node is not None:
                if isinstance(node, blocking):
                    violations.append(
                        f"[router-montaz-warunkowy] {main.name}:{call.lineno} montuje "
                        f"{alias} w bloku {type(node).__name__} — guard nie odrozni "
                        "routera wpietego ZAWSZE od wpietego pod flaga, wiec montaz "
                        "warunkowy jest zakazany."
                    )
                    break
                node = parents.get(id(node))
    return violations


def check_router_mounts(
    api_dir: Path | None = None, main_path: Path | None = None
) -> list[str]:
    """Naruszenia reguly „kazdy router zamontowany albo swiadomie odstawiony”."""
    directory = api_dir or API_DIR
    main = main_path or MAIN_PATH
    violations: list[str] = []

    defs = collect_router_defs(directory)
    modules_with_router = {d.module for d in defs}
    if len(modules_with_router) < MIN_MODULOW_Z_ROUTEREM:
        violations.append(
            f"[router-pusty-skan] znaleziono {len(modules_with_router)} modulow z "
            f"`APIRouter` (zapadka: co najmniej {MIN_MODULOW_Z_ROUTEREM}). Skan, ktory "
            "nic nie znalazl, NIE jest sukcesem — sprawdz uklad katalogow i skladnie "
            "deklaracji routera."
        )

    mounted, problems = mounted_router_keys(directory, main)
    violations.extend(problems)

    unmounted = [d for d in defs if d.key not in mounted]
    parked_routes = 0

    for definition in sorted(unmounted, key=lambda d: d.key):
        entry = SWIADOMIE_ODSTAWIONE.get(definition.module)
        if entry is None:
            violations.append(
                f"[router-niezamontowany] api/{definition.module.replace('.', '/')}.py:"
                f"{definition.line} deklaruje `{definition.var} = APIRouter("
                f"prefix={definition.prefix!r})`, ktorego aplikacja NIE MONTUJE — "
                "trasy nie istnieja dla nikogo. Usun modul albo wpisz go do "
                "`SWIADOMIE_ODSTAWIONE` z uzasadnieniem merytorycznym."
            )
            continue
        if definition.var not in entry[0]:
            violations.append(
                f"[router-nowy-w-odstawionym-module] api/"
                f"{definition.module.replace('.', '/')}.py:{definition.line} deklaruje "
                f"router `{definition.var}`, ktorego wpis `SWIADOMIE_ODSTAWIONE"
                f"['{definition.module}']` NIE WYMIENIA. Nowy router w odstawionym "
                "module przeszedl by bez uzasadnienia."
            )
            continue
        parked_routes += len(
            _route_decorators(_module_path(definition.module, directory), definition.var)
        )

    # Rejestr odstawionych ma tylko MALEC. Wpis, ktory przestal byc prawdziwy,
    # jest cichym wykluczeniem czekajacym na regresje pod tym samym adresem.
    unmounted_keys = {d.key for d in unmounted}
    for module, (variables, _reason) in sorted(SWIADOMIE_ODSTAWIONE.items()):
        path = _module_path(module, directory)
        if not path.exists():
            violations.append(
                f"[router-nieaktualny-wpis] `SWIADOMIE_ODSTAWIONE['{module}']` wskazuje "
                "modul, ktorego JUZ NIE MA — zdejmij wpis i obniz "
                "`BUDZET_ODSTAWIONYCH_TRAS`."
            )
            continue
        for variable in variables:
            if f"{module}.{variable}" in unmounted_keys:
                continue
            reason = (
                "router zostal ZAMONTOWANY"
                if f"{module}.{variable}" in mounted
                else "takiego routera nie ma w module"
            )
            violations.append(
                f"[router-nieaktualny-wpis] `SWIADOMIE_ODSTAWIONE['{module}']` wymienia "
                f"`{variable}`, ale {reason} — zdejmij wpis i obniz "
                "`BUDZET_ODSTAWIONYCH_TRAS`."
            )

    if parked_routes != BUDZET_ODSTAWIONYCH_TRAS:
        kierunek = (
            "UROSL — nowa trasa na odstawionym routerze nie jest darmowa"
            if parked_routes > BUDZET_ODSTAWIONYCH_TRAS
            else "ZMALAL — obniz `BUDZET_ODSTAWIONYCH_TRAS`, inaczej poprawa nie "
            "zostaje utrwalona"
        )
        violations.append(
            f"[router-budzet-odstawionych] tras na routerach swiadomie odstawionych: "
            f"{parked_routes}, budzet {BUDZET_ODSTAWIONYCH_TRAS}. Dlug {kierunek}."
        )

    return violations


def main() -> int:
    violations = check_premises() + check_router_mounts()
    defs = collect_router_defs()
    mounted, _ = mounted_router_keys()
    print(
        f"router-mount-guard: {len({d.module for d in defs})} modulow z `APIRouter`, "
        f"{len([d for d in defs if d.key in mounted])} routerow zamontowanych, "
        f"{len(SWIADOMIE_ODSTAWIONE)} modulow swiadomie odstawionych "
        f"({BUDZET_ODSTAWIONYCH_TRAS} tras)."
    )
    for module, (_variables, reason) in sorted(SWIADOMIE_ODSTAWIONE.items()):
        print(f" * api/{module}.py: {reason.splitlines()[0]}")

    if violations:
        print("\nFAILED: router zadeklarowany, ktorego aplikacja nie montuje.\n")
        for violation in violations:
            print(f"  {violation}")
        return 1
    print("\nrouter-mount-guard: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
