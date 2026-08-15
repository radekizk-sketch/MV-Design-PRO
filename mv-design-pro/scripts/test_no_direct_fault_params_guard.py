"""Testy bramki `no_direct_fault_params_guard` (audyt 2026-08-01, defekty D3 i H).

Intencja: bramka od narodzin skanowała 0 plików (zdublowany segment `mv-design-pro`
w BACKEND_SRC) i kończyła się kodem 0 — fałszywa zieleń przez całe życie repo.
Po przepisaniu detekcji na AST (V12K-306) testy pilnują trzech rzeczy naraz:
  * bramka GRYZIE tam, gdzie inwariant tego wymaga (iniekcja `fault_node_id=`
    do wywołania warstwy solvera; wywołanie `execute_short_circuit` albo
    `_execute_short_circuit` poza warstwą wiązania),
  * bramka NIE gryzie tam, gdzie trafienie byłoby fałszywe (odczyt atrybutu
    wyniku, kolumna ORM, literał, docstring, budowa DTO) — dzięki temu warstwa
    odczytu wyniku nie potrzebuje ŻADNEJ białej listy, więc nie da się nią
    zamaskować przyszłej iniekcji,
  * PUSTY SKAN (brak korzenia albo 0 plików) to RC=1, nigdy RC=0.

Audyt 2026-08-01 (defekt H, znaleziska P8 i N2) dołożył dwie klasy testów:
  * FORMY POŚREDNIE — ten sam adresat osiągnięty przez zmienną, tablicę
    dyspozycji, atrybut instancji, instancję, wartość domyślną parametru, pętlę
    `for` oraz pozycję z sygnatury solvera.  Zmierzone przed naprawą: trzy takie
    iniekcje w pliku BEZ wykluczeń dawały RC=0 (bramka ślepa), przy formie
    bezpośredniej w tym samym pliku RC=1.
  * ZAPADKA NA WYWOŁANIE — wykluczenie zastanych miejsc działało na PLIK i
    wracało PRZED parsowaniem, więc piąte wejście w solver dopisane do
    `enm/canonical_analysis.py` przechodziło na zielono, mimo obietnicy „lista
    ZAMKNIĘTA: KAŻDE NOWE miejsce = naruszenie".

Kod wyjścia odbierany zawsze bezpośrednio (`main()` / `returncode`), nigdy przez potok.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

import no_direct_fault_params_guard as guard

#: Warstwa solvera w drzewie testowym. Reguła C czyta pozycję `fault_node_id`
#: WPROST Z KODU solvera, więc drzewo bez tego pliku nie ma czego czytać.
WARSTWA_SOLVERA = """\
class ShortCircuitIEC60909Solver:
    @staticmethod
    def compute_3ph_short_circuit(graph, fault_node_id, c_factor=1.1):
        return None


def compute_machine_contributions(graph, fault_node_id, c_factor=1.1):
    return None


def solve_power_flow_physics(graph, wejscie):
    return None
"""

#: Iniekcja: identyfikator węzła wstrzyknięty wprost do wywołania solvera.
INIEKCJA_DO_SOLVERA = """\
from network_model.solvers.short_circuit_iec60909 import ShortCircuitIEC60909Solver


def policz(graph, node_id):
    return ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph,
        fault_node_id=node_id,
        c_factor=1.1,
    )
"""

#: Forma pośrednia 1: tablica dyspozycji (naturalny refaktor czterech gałęzi `if`).
INIEKCJA_PRZEZ_DYSPOZYCJE = """\
from network_model.solvers import ShortCircuitIEC60909Solver

_DYSPOZYTOR = {"3F": ShortCircuitIEC60909Solver.compute_3ph_short_circuit}


def policz(graph, node_id):
    return _DYSPOZYTOR["3F"](graph=graph, fault_node_id=node_id, c_factor=1.1)
"""

#: Forma pośrednia 2: zmienna trzymająca KLASĘ solvera.
INIEKCJA_PRZEZ_ZMIENNA_KLASE = """\
from network_model.solvers import ShortCircuitIEC60909Solver


def policz(graph, node_id):
    solver = ShortCircuitIEC60909Solver
    return solver.compute_3ph_short_circuit(graph=graph, fault_node_id=node_id)
"""

#: Forma pośrednia 3: zmienna trzymająca FUNKCJĘ solvera.
INIEKCJA_PRZEZ_ZMIENNA_FUNKCJE = """\
from network_model.solvers.short_circuit_iec60909 import compute_3ph_short_circuit


def policz(graph, node_id):
    f = compute_3ph_short_circuit
    return f(graph=graph, fault_node_id=node_id)
"""

#: Forma pośrednia 4: wywołanie na INSTANCJI (metody solvera są statyczne).
INIEKCJA_PRZEZ_INSTANCJE = """\
from network_model.solvers import ShortCircuitIEC60909Solver


def policz(graph, node_id):
    return ShortCircuitIEC60909Solver().compute_3ph_short_circuit(
        graph=graph, fault_node_id=node_id
    )
"""

#: Forma pośrednia 5: atrybut instancji ustawiony w konstruktorze.
INIEKCJA_PRZEZ_ATRYBUT = """\
from network_model.solvers import ShortCircuitIEC60909Solver


class Serwis:
    def __init__(self):
        self._solver = ShortCircuitIEC60909Solver

    def policz(self, graph, node_id):
        return self._solver.compute_3ph_short_circuit(graph=graph, fault_node_id=node_id)
"""

#: Forma pośrednia 6: wartość domyślna parametru (statyczna, więc rozwiązywalna).
INIEKCJA_PRZEZ_DOMYSLNY_PARAMETR = """\
from network_model.solvers import ShortCircuitIEC60909Solver


def policz(graph, node_id, solver=ShortCircuitIEC60909Solver):
    return solver.compute_3ph_short_circuit(graph=graph, fault_node_id=node_id)
"""

#: Forma pośrednia 7: cel pętli `for` po krotce referencji.
INIEKCJA_PRZEZ_PETLE = """\
from network_model.solvers import ShortCircuitIEC60909Solver


def policz(graph, node_id):
    wyniki = []
    for wywolaj in (ShortCircuitIEC60909Solver.compute_3ph_short_circuit,):
        wyniki.append(wywolaj(graph=graph, fault_node_id=node_id))
    return wyniki
"""

#: Forma pozycyjna (reguła C): identyfikator na pozycji z sygnatury solvera.
INIEKCJA_POZYCYJNA = """\
from network_model.solvers import ShortCircuitIEC60909Solver


def policz(graph, node_id):
    return ShortCircuitIEC60909Solver.compute_3ph_short_circuit(graph, node_id, 1.1)
"""

#: Bezpośrednie wywołanie kanonicznego wiązania spoza warstwy wiązania.
WYWOLANIE_WIAZANIA = """\
from application.solvers.short_circuit_binding import execute_short_circuit


def policz(scenario, graph):
    return execute_short_circuit(scenario, graph)
"""

#: Wiązanie osiągnięte przez zmienną — ta sama ślepota, co w regule A.
WYWOLANIE_WIAZANIA_PRZEZ_ZMIENNA = """\
from application.solvers.short_circuit_binding import execute_short_circuit


def policz(scenario, graph):
    uruchom = execute_short_circuit
    return uruchom(scenario, graph)
"""

#: Prywatny wariant wiązania — ożywienie martwego wzorca (dług #2 karty H).
WYWOLANIE_WIAZANIA_PRYWATNE = """\
def uruchom(run):
    return _execute_short_circuit(run)
"""

#: Warstwa odczytu wyniku: atrybut, kolumna ORM, literał, docstring, DTO.
ODCZYT_WYNIKU = '''\
from network_model.solvers.short_circuit_iec60909 import ShortCircuitResult


class WierszORM:
    """Kolumna fault_node_id jest kluczem wiersza, nie parametrem solvera."""

    fault_node_id = Column(String(512), primary_key=True)


def raport(result: ShortCircuitResult, payload: dict) -> dict:
    target = result.fault_node_id
    odtworzony = ShortCircuitResult(
        fault_node_id=str(payload.get("fault_node_id", "")),
        ikss_a=float(payload.get("ikss_a", 0.0)),
    )
    return {"fault_node_id": target, "odtworzony": odtworzony}
'''

#: KONTRPRZYKŁAD: zwykła tablica dyspozycji, która NIE pochodzi z warstwy solvera.
#: Sam zapis `slownik[klucz](fault_node_id=...)` nie może wystarczyć do trafienia,
#: bo wtedy każda mapa akcji w API stawałaby się naruszeniem.
KONTRPRZYKLAD_OBCA_DYSPOZYCJA = """\
def policz(dispatch, graph, node_id):
    return dispatch["3F"](graph=graph, fault_node_id=node_id)
"""

#: KONTRPRZYKŁAD: funkcja o nazwie solvera, ale zdefiniowana LOKALNIE — adresat
#: nie pochodzi z warstwy solvera, więc iniekcji w fizykę tu nie ma.
KONTRPRZYKLAD_WLASNA_FUNKCJA = """\
def compute_3ph_short_circuit(graph, fault_node_id):
    return {"graph": graph, "fault_node_id": fault_node_id}


def policz(graph, node_id):
    return compute_3ph_short_circuit(graph=graph, fault_node_id=node_id)
"""

#: KONTRPRZYKŁAD: WYNIK wywołania solvera nie jest referencją do solvera —
#: nazwa, do której trafił wynik, nie może zarażać dalszych wywołań.
KONTRPRZYKLAD_WYNIK_NIE_JEST_REFERENCJA = """\
from network_model.solvers import ShortCircuitIEC60909Solver


def raport(graph):
    wynik = ShortCircuitIEC60909Solver.zbierz_statystyki(graph)
    return wynik.opisz(fault_node_id="szyna-1")
"""

#: KONTRPRZYKŁAD reguły C: wywołanie pozycyjne do funkcji warstwy solvera, której
#: sygnatura NIE deklaruje `fault_node_id` — reguła stoi na sygnaturze, nie na
#: „jakimkolwiek argumencie pozycyjnym do solvera".
KONTRPRZYKLAD_POZYCYJNA_BEZ_WEZLA = """\
from network_model.solvers import solve_power_flow_physics


def policz(graph, wejscie):
    return solve_power_flow_physics(graph, wejscie)
"""

#: Definicja funkcji o zakazanej nazwie NIE jest naruszeniem — naruszeniem jest wołanie.
DEFINICJA_BEZ_WYWOLANIA = """\
def execute_short_circuit(scenario, graph):
    return None
"""

CZYSTY = """\
from domain.fault_scenario import FaultScenario


def policz(graph, scenario: FaultScenario):
    return scenario.to_dict()
"""

#: Zastane wywołania `application/reference_networks/computation.py` w kształcie
#: zgodnym z budżetem zapadki (2 x reguła A) — dokładnie tyle, ile plik ma dziś.
ZASTANE_ZGODNE_Z_BUDZETEM = """\
from network_model.solvers import ShortCircuitIEC60909Solver


def policz(graph, node_id):
    trzyfazowe = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph, fault_node_id=node_id
    )
    dwufazowe = ShortCircuitIEC60909Solver.compute_2ph_short_circuit(
        graph=graph, fault_node_id=node_id
    )
    return trzyfazowe, dwufazowe
"""

#: Ten sam plik z zapadki po dopisaniu JEDNEGO nowego wejścia w solver.
ZASTANE_PLUS_NOWE_WYWOLANIE = (
    ZASTANE_ZGODNE_Z_BUDZETEM
    + """

def policz_jeszcze_raz(graph, node_id):
    return ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph, fault_node_id=node_id
    )
"""
)

#: Ten sam plik z zapadki po USUNIĘCIU jednego zastanego wejścia.
ZASTANE_MINUS_WYWOLANIE = """\
from network_model.solvers import ShortCircuitIEC60909Solver


def policz(graph, node_id):
    return ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graph, fault_node_id=node_id
    )
"""


def _drzewo(tmp_path: Path, pliki: dict[str, str], z_warstwa_solvera: bool = False) -> Path:
    root = tmp_path / "src"
    root.mkdir(parents=True, exist_ok=True)
    zawartosc = dict(pliki)
    if z_warstwa_solvera:
        zawartosc["network_model/solvers/short_circuit_iec60909.py"] = WARSTWA_SOLVERA
    for relative, content in zawartosc.items():
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    return root


def test_iniekcja_do_solvera_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    root = _drzewo(tmp_path, {"api/nowy_endpoint.py": INIEKCJA_DO_SOLVERA})
    monkeypatch.setattr(guard, "BACKEND_SRC", root)

    rc = guard.main()

    out = capsys.readouterr().out
    assert rc == 1
    assert "nowy_endpoint.py" in out
    assert "iniekcja 'fault_node_id='" in out
    assert "compute_3ph_short_circuit" in out


def test_wywolanie_wiazania_poza_warstwa_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    root = _drzewo(tmp_path, {"api/nowy_endpoint.py": WYWOLANIE_WIAZANIA})
    monkeypatch.setattr(guard, "BACKEND_SRC", root)

    rc = guard.main()

    out = capsys.readouterr().out
    assert rc == 1
    assert "bezposrednie wywolanie 'execute_short_circuit'" in out


def test_prywatne_wywolanie_wiazania_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """Regresja dlugu #2 karty H: `\\b` w regexie nie lapalo `_execute_short_circuit`."""
    root = _drzewo(tmp_path, {"application/inny_serwis.py": WYWOLANIE_WIAZANIA_PRYWATNE})
    monkeypatch.setattr(guard, "BACKEND_SRC", root)

    rc = guard.main()

    out = capsys.readouterr().out
    assert rc == 1
    assert "bezposrednie wywolanie '_execute_short_circuit'" in out


def test_odczyt_wyniku_nie_jest_naruszeniem(tmp_path, monkeypatch, capsys) -> None:
    """Warstwa odczytu wyniku przechodzi BEZ wpisu na bialej liscie."""
    root = _drzewo(tmp_path, {"application/raporty/eksport.py": ODCZYT_WYNIKU})
    monkeypatch.setattr(guard, "BACKEND_SRC", root)
    # Drzewo syntetyczne nie zawiera plikow warstwy wiazania z WHITELISTED_PATHS
    # (nie jest to przedmiotem TEGO testu) — zapadka swiezosci (pozycja b karty
    # ZAPADKI-ALLOWLIST-RESZTA) inaczej zglosilaby wszystkie 5 wpisow jako
    # sieroty, bo szuka ich pod podmienionym BACKEND_SRC.
    monkeypatch.setattr(guard, "WHITELISTED_PATHS", set())

    rc = guard.main()

    out = capsys.readouterr().out
    assert rc == 0, out
    assert "Scanned 1 Python file(s)" in out


def test_definicja_funkcji_nie_jest_naruszeniem(tmp_path, monkeypatch) -> None:
    root = _drzewo(tmp_path, {"application/definicja.py": DEFINICJA_BEZ_WYWOLANIA})
    monkeypatch.setattr(guard, "BACKEND_SRC", root)
    # patrz komentarz w test_odczyt_wyniku_nie_jest_naruszeniem powyzej.
    monkeypatch.setattr(guard, "WHITELISTED_PATHS", set())

    assert guard.main() == 0


def test_warstwa_solvera_i_warstwa_wiazania_sa_dozwolone(tmp_path, monkeypatch) -> None:
    root = _drzewo(
        tmp_path,
        {
            "network_model/solvers/wlasny_solver.py": INIEKCJA_DO_SOLVERA,
            "application/solvers/short_circuit_binding.py": WYWOLANIE_WIAZANIA,
            "application/execution_engine/service.py": WYWOLANIE_WIAZANIA,
        },
        z_warstwa_solvera=True,
    )
    monkeypatch.setattr(guard, "BACKEND_SRC", root)
    # patrz komentarz w test_odczyt_wyniku_nie_jest_naruszeniem powyzej. Drzewo
    # ma TYLKO 2 z 5 plikow WHITELISTED_PATHS (celowo, do testu regul A/B/C) —
    # zapadka swiezosci zglosilaby brakujace 3 jako sieroty.
    monkeypatch.setattr(guard, "WHITELISTED_PATHS", set())


# --- FORMY POSREDNIE (audyt 2026-08-01, znalezisko P8) -----------------------------------


def _pierwsze_naruszenie(tmp_path, monkeypatch, kod: str, sciezka: str = "api/nowy.py") -> str:
    root = _drzewo(tmp_path, {sciezka: kod}, z_warstwa_solvera=True)
    monkeypatch.setattr(guard, "BACKEND_SRC", root)
    naruszenia = guard.check_file(root / sciezka)
    assert len(naruszenia) == 1, naruszenia
    return naruszenia[0]


def test_forma_posrednia_tablica_dyspozycji_jest_naruszeniem(tmp_path, monkeypatch) -> None:
    """Sciagniecie czterech galezi `if` do slownika dyspozycji nie moze rozbrajac bramki."""
    naruszenie = _pierwsze_naruszenie(tmp_path, monkeypatch, INIEKCJA_PRZEZ_DYSPOZYCJE)

    assert "iniekcja 'fault_node_id='" in naruszenie
    assert "_DYSPOZYTOR['3F']" in naruszenie


def test_forma_posrednia_zmienna_z_klasa_solvera_jest_naruszeniem(tmp_path, monkeypatch) -> None:
    naruszenie = _pierwsze_naruszenie(tmp_path, monkeypatch, INIEKCJA_PRZEZ_ZMIENNA_KLASE)

    assert "iniekcja 'fault_node_id='" in naruszenie
    assert "solver.compute_3ph_short_circuit" in naruszenie


def test_forma_posrednia_zmienna_z_funkcja_solvera_jest_naruszeniem(tmp_path, monkeypatch) -> None:
    naruszenie = _pierwsze_naruszenie(tmp_path, monkeypatch, INIEKCJA_PRZEZ_ZMIENNA_FUNKCJE)

    assert "iniekcja 'fault_node_id='" in naruszenie


def test_forma_posrednia_wywolanie_na_instancji_jest_naruszeniem(tmp_path, monkeypatch) -> None:
    naruszenie = _pierwsze_naruszenie(tmp_path, monkeypatch, INIEKCJA_PRZEZ_INSTANCJE)

    assert "ShortCircuitIEC60909Solver().compute_3ph_short_circuit" in naruszenie


def test_forma_posrednia_atrybut_instancji_jest_naruszeniem(tmp_path, monkeypatch) -> None:
    naruszenie = _pierwsze_naruszenie(tmp_path, monkeypatch, INIEKCJA_PRZEZ_ATRYBUT)

    assert "self._solver.compute_3ph_short_circuit" in naruszenie


def test_forma_posrednia_domyslny_parametr_jest_naruszeniem(tmp_path, monkeypatch) -> None:
    naruszenie = _pierwsze_naruszenie(tmp_path, monkeypatch, INIEKCJA_PRZEZ_DOMYSLNY_PARAMETR)

    assert "iniekcja 'fault_node_id='" in naruszenie


def test_forma_posrednia_cel_petli_jest_naruszeniem(tmp_path, monkeypatch) -> None:
    naruszenie = _pierwsze_naruszenie(tmp_path, monkeypatch, INIEKCJA_PRZEZ_PETLE)

    assert "iniekcja 'fault_node_id='" in naruszenie


def test_iniekcja_pozycyjna_jest_naruszeniem(tmp_path, monkeypatch) -> None:
    """Regula C: pozycja `fault_node_id` czytana Z SYGNATURY solvera w drzewie."""
    naruszenie = _pierwsze_naruszenie(tmp_path, monkeypatch, INIEKCJA_POZYCYJNA)

    assert "POZYCYJNIE" in naruszenie
    assert "argument nr 2" in naruszenie


def test_wiazanie_przez_zmienna_jest_naruszeniem(tmp_path, monkeypatch) -> None:
    naruszenie = _pierwsze_naruszenie(tmp_path, monkeypatch, WYWOLANIE_WIAZANIA_PRZEZ_ZMIENNA)

    assert "bezposrednie wywolanie 'uruchom'" in naruszenie


# --- KONTRPRZYKLADY (formy, ktore naruszeniem NIE SA) -----------------------------------


def test_obca_tablica_dyspozycji_nie_jest_naruszeniem(tmp_path, monkeypatch) -> None:
    root = _drzewo(tmp_path, {"api/akcje.py": KONTRPRZYKLAD_OBCA_DYSPOZYCJA}, True)
    monkeypatch.setattr(guard, "BACKEND_SRC", root)

    assert guard.check_file(root / "api/akcje.py") == []


def test_wlasna_funkcja_o_nazwie_solvera_nie_jest_naruszeniem(tmp_path, monkeypatch) -> None:
    root = _drzewo(tmp_path, {"api/wlasna.py": KONTRPRZYKLAD_WLASNA_FUNKCJA}, True)
    monkeypatch.setattr(guard, "BACKEND_SRC", root)

    assert guard.check_file(root / "api/wlasna.py") == []


def test_wynik_wywolania_solvera_nie_zaraza_nazwy(tmp_path, monkeypatch) -> None:
    """`x = Solver.cos(...)` to WYNIK, nie referencja — inaczej odczyt wyniku bylby czerwony."""
    root = _drzewo(tmp_path, {"api/raport.py": KONTRPRZYKLAD_WYNIK_NIE_JEST_REFERENCJA}, True)
    monkeypatch.setattr(guard, "BACKEND_SRC", root)

    assert guard.check_file(root / "api/raport.py") == []


def test_pozycyjne_wywolanie_bez_wezla_w_sygnaturze_nie_jest_naruszeniem(
    tmp_path, monkeypatch
) -> None:
    root = _drzewo(tmp_path, {"api/rozplyw.py": KONTRPRZYKLAD_POZYCYJNA_BEZ_WEZLA}, True)
    monkeypatch.setattr(guard, "BACKEND_SRC", root)

    assert guard.check_file(root / "api/rozplyw.py") == []


# --- ZAPADKA NA WYWOLANIE (audyt 2026-08-01, znalezisko N2) ------------------------------


def test_zapadka_przepuszcza_dokladnie_zastane_wywolania(tmp_path, monkeypatch, capsys) -> None:
    root = _drzewo(
        tmp_path,
        {"application/reference_networks/computation.py": ZASTANE_ZGODNE_Z_BUDZETEM},
    )
    monkeypatch.setattr(guard, "BACKEND_SRC", root)
    # patrz komentarz w test_odczyt_wyniku_nie_jest_naruszeniem powyzej.
    monkeypatch.setattr(guard, "WHITELISTED_PATHS", set())

    rc = guard.main()

    out = capsys.readouterr().out
    assert rc == 0, out


def test_zapadka_lapie_nowe_wywolanie_w_pliku_z_listy(tmp_path, monkeypatch, capsys) -> None:
    """Sedno N2: plik z zapadki NIE MOZE cicho urosnac o kolejne wejscie w solver."""
    root = _drzewo(
        tmp_path,
        {"application/reference_networks/computation.py": ZASTANE_PLUS_NOWE_WYWOLANIE},
    )
    monkeypatch.setattr(guard, "BACKEND_SRC", root)

    rc = guard.main()

    out = capsys.readouterr().out
    assert rc == 1
    assert "computation.py" in out
    assert "zapadka zastanych wywolan 'A:compute_3ph_short_circuit'" in out
    assert "budzet 1, znaleziono 2" in out


def test_zapadka_zada_obnizenia_budzetu_gdy_dlug_zmalal(tmp_path, monkeypatch, capsys) -> None:
    """Zapadka dziala w obie strony (konwencja mypy_ratchet_guard)."""
    root = _drzewo(
        tmp_path,
        {"application/reference_networks/computation.py": ZASTANE_MINUS_WYWOLANIE},
    )
    monkeypatch.setattr(guard, "BACKEND_SRC", root)

    rc = guard.main()

    out = capsys.readouterr().out
    assert rc == 1
    assert "Dlug ZMALAL" in out
    assert "A:compute_2ph_short_circuit" in out


def test_zapadka_z_pustym_budzetem_lapie_pierwsze_wywolanie(tmp_path, monkeypatch, capsys) -> None:
    """Plik z listy o budzecie {} nie ma dzis ani jednego wejscia — kazde jest nowe.

    INTENCJA (zachowana przy karcie BATCH-ROUTER, ktora usunela `api/case_runs.py`
    razem z jego wpisem zapadki): pusty budzet NIE jest bialolistowaniem — pierwsze
    bezposrednie wejscie w solver w takim pliku musi zapalic guard. Nosnikiem
    testu jest inny realny wpis o pustym budzecie (`api/fault_loop.py`).
    """
    root = _drzewo(tmp_path, {"api/fault_loop.py": INIEKCJA_DO_SOLVERA})
    monkeypatch.setattr(guard, "BACKEND_SRC", root)

    rc = guard.main()

    out = capsys.readouterr().out
    assert rc == 1
    assert "fault_loop.py" in out
    assert "budzet 0, znaleziono 1" in out


def test_plik_z_zapadki_nie_jest_bialolistowany(tmp_path, monkeypatch) -> None:
    """`is_whitelisted` nie moze wracac przed parsowaniem pliku z zapadki."""
    root = _drzewo(tmp_path, {"enm/canonical_analysis.py": CZYSTY})
    monkeypatch.setattr(guard, "BACKEND_SRC", root)

    assert guard.is_whitelisted(root / "enm/canonical_analysis.py") is False


# --- MAPA SYGNATUR I PUSTE SKANY ---------------------------------------------------------


def test_mapa_sygnatur_czyta_pozycje_z_kodu_solvera() -> None:
    """Regula C nie stoi na recznej liscie — pozycja pochodzi z sygnatur w repo."""
    signatures = guard.solver_signature_index()

    assert signatures, "warstwa solvera nie oddala zadnej sygnatury z fault_node_id"
    assert signatures["compute_3ph_short_circuit"] == 1
    assert signatures["compute_machine_contributions"] == 1
    assert set(signatures.values()) == {1}


def test_pusta_mapa_sygnatur_jest_bledem(tmp_path, monkeypatch, capsys) -> None:
    """Warstwa solvera bez `fault_node_id` = martwa regula C, wiec RC=1, nie cisza."""
    root = _drzewo(
        tmp_path,
        {
            "network_model/solvers/pusty.py": "def solve(graph):\n    return None\n",
            "api/ok.py": CZYSTY,
        },
    )
    monkeypatch.setattr(guard, "BACKEND_SRC", root)

    rc = guard.main()

    out = capsys.readouterr().out
    assert rc == 1
    assert "ani jednej sygnatury" in out


def test_plik_z_bledem_skladni_jest_liczony_i_nie_wywraca_bramki(
    tmp_path, monkeypatch, capsys
) -> None:
    root = _drzewo(tmp_path, {"application/zepsuty.py": "def f(:\n", "api/ok.py": CZYSTY})
    monkeypatch.setattr(guard, "BACKEND_SRC", root)
    # patrz komentarz w test_odczyt_wyniku_nie_jest_naruszeniem powyzej.
    monkeypatch.setattr(guard, "WHITELISTED_PATHS", set())

    rc = guard.main()

    out = capsys.readouterr().out
    assert rc == 0, out
    assert "Scanned 2 Python file(s)" in out
    assert "nie da sie sparsowac" in out


def test_plik_spoza_korzenia_nie_jest_cicho_bialolistowany(tmp_path, monkeypatch) -> None:
    """Regresja drugiej warstwy pustki: ValueError z relative_to zwracal True."""
    root = _drzewo(tmp_path, {"api/ok.py": CZYSTY})
    monkeypatch.setattr(guard, "BACKEND_SRC", root)

    outsider = tmp_path / "poza_korzeniem" / "obcy.py"
    outsider.parent.mkdir(parents=True, exist_ok=True)
    outsider.write_text(INIEKCJA_DO_SOLVERA, encoding="utf-8")

    assert guard.is_whitelisted(outsider) is False
    assert guard.check_file(outsider) != []


def test_pusty_skan_jest_bledem(tmp_path, monkeypatch, capsys) -> None:
    """Katalog istnieje, ale nie ma w nim ani jednego pliku .py — to RC=1."""
    root = tmp_path / "src"
    root.mkdir()
    monkeypatch.setattr(guard, "BACKEND_SRC", root)

    rc = guard.main()

    out = capsys.readouterr().out
    assert rc == 1
    assert "Scanned 0 Python file(s)" in out
    assert "Empty scan" in out


def test_brak_korzenia_skanowania_jest_bledem(tmp_path, monkeypatch, capsys) -> None:
    """Zepsuta sciezka (dokladnie defekt D3) musi zapalic bramke, nie ja wyciszyc."""
    monkeypatch.setattr(guard, "BACKEND_SRC", tmp_path / "nie" / "ma" / "takiego")

    rc = guard.main()

    out = capsys.readouterr().out
    assert rc == 1
    assert "Backend source directory not found" in out


def test_korzen_skanowania_w_repo_istnieje_i_jest_niepusty() -> None:
    assert guard.BACKEND_SRC.is_dir(), f"brak korzenia skanowania: {guard.BACKEND_SRC}"
    assert len(list(guard.BACKEND_SRC.rglob("*.py"))) > 0


# =============================================================================
# ZAPADKA SWIEZOSCI WHITELISTED_PATHS (karta ZAPADKI-ALLOWLIST-RESZTA,
# pozycja b, 2026-08-12). Minimalna zapadka: kazda sciezka musi istniec pod
# BACKEND_SRC — lista wyznacza warstwe wiazania FaultScenario (miejsce, gdzie
# parametry zwarcia MAJA prawo powstawac), nie zbior zastanych naruszen, wiec
# nie ma tu dodatkowego "wzorca" do sprawdzenia poza samym istnieniem pliku.
# =============================================================================


def test_whitelisted_paths_freshness_is_green_na_repo() -> None:
    assert guard.check_whitelisted_paths_freshness() == []


def test_whitelisted_paths_wszystkie_istnieja_pod_backend_src() -> None:
    for path in guard.WHITELISTED_PATHS:
        assert (guard.BACKEND_SRC / path).is_file(), f"WHITELISTED_PATHS: brak pliku {path!r}"


def test_whitelisted_paths_freshness_lapie_sierote(monkeypatch) -> None:
    """Wpis wskazujacy plik, ktorego juz nie ma -> naruszenie z NAZWA wpisu."""
    monkeypatch.setattr(
        guard,
        "WHITELISTED_PATHS",
        {"domain/nigdy_nieistniejacy_plik_wstrzykniety_testem.py"},
    )

    violations = guard.check_whitelisted_paths_freshness()

    assert len(violations) == 1
    assert "[fault-params-wyjatek-osierocony]" in violations[0]
    assert "nigdy_nieistniejacy_plik_wstrzykniety_testem.py" in violations[0]


def test_whitelisted_paths_freshness_wpieta_w_main(monkeypatch, capsys) -> None:
    """RC=1 z main(), kiedy WHITELISTED_PATHS zawiera sierote — zapadka W GUARDZIE,
    nie tylko w funkcji pomocniczej."""
    monkeypatch.setattr(
        guard,
        "WHITELISTED_PATHS",
        {"domain/nigdy_nieistniejacy_plik_wstrzykniety_testem.py"},
    )

    rc = guard.main()

    out = capsys.readouterr().out
    assert rc == 1
    assert "fault-params-wyjatek-osierocony" in out


def test_bramka_na_szczycie_repo_jest_zielona_i_niepusta() -> None:
    """Uruchomienie realnym procesem — kod wyjscia i licznik brane bezposrednio."""
    script = Path(guard.__file__).resolve()
    completed = subprocess.run(
        [sys.executable, str(script)],
        capture_output=True,
        text=True,
        cwd=str(script.parent.parent),
        check=False,
    )

    assert "skipping guard" not in completed.stdout
    match = re.search(r"Scanned (\d+) Python file\(s\)", completed.stdout)
    assert match is not None, f"bramka nie zaraportowala liczby plikow:\n{completed.stdout}"
    assert int(match.group(1)) > 700, "skan mniejszy niz backend/src — bramka patrzy nie tam"
    assert completed.returncode == 0, completed.stdout


if __name__ == "__main__":
    import pytest

    sys.exit(pytest.main([__file__, "-v"]))
