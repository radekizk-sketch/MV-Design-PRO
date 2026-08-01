"""Testy bramki `no_direct_fault_params_guard` (audyt 2026-08-01, defekt D3).

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

Kod wyjścia odbierany zawsze bezpośrednio (`main()` / `returncode`), nigdy przez potok.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

import no_direct_fault_params_guard as guard

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

#: Bezpośrednie wywołanie kanonicznego wiązania spoza warstwy wiązania.
WYWOLANIE_WIAZANIA = """\
from application.solvers.short_circuit_binding import execute_short_circuit


def policz(scenario, graph):
    return execute_short_circuit(scenario, graph)
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


def _drzewo(tmp_path: Path, pliki: dict[str, str]) -> Path:
    root = tmp_path / "src"
    root.mkdir(parents=True, exist_ok=True)
    for relative, content in pliki.items():
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

    rc = guard.main()

    out = capsys.readouterr().out
    assert rc == 0, out
    assert "Scanned 1 Python file(s)" in out


def test_definicja_funkcji_nie_jest_naruszeniem(tmp_path, monkeypatch) -> None:
    root = _drzewo(tmp_path, {"application/definicja.py": DEFINICJA_BEZ_WYWOLANIA})
    monkeypatch.setattr(guard, "BACKEND_SRC", root)

    assert guard.main() == 0


def test_warstwa_solvera_i_warstwa_wiazania_sa_dozwolone(tmp_path, monkeypatch) -> None:
    root = _drzewo(
        tmp_path,
        {
            "network_model/solvers/wlasny_solver.py": INIEKCJA_DO_SOLVERA,
            "application/solvers/short_circuit_binding.py": WYWOLANIE_WIAZANIA,
            "application/execution_engine/service.py": WYWOLANIE_WIAZANIA,
        },
    )
    monkeypatch.setattr(guard, "BACKEND_SRC", root)

    assert guard.main() == 0


def test_zapadka_dopuszcza_zastane_ale_nie_nowe_miejsce(tmp_path, monkeypatch, capsys) -> None:
    """Plik z zapadki przechodzi; NOWY plik z tym samym kodem = naruszenie."""
    root = _drzewo(
        tmp_path,
        {
            "api/proof_pack.py": INIEKCJA_DO_SOLVERA,
            "api/zupelnie_nowy.py": INIEKCJA_DO_SOLVERA,
        },
    )
    monkeypatch.setattr(guard, "BACKEND_SRC", root)

    rc = guard.main()

    out = capsys.readouterr().out
    assert rc == 1
    assert "zupelnie_nowy.py" in out
    assert "proof_pack.py" not in out


def test_plik_z_bledem_skladni_jest_liczony_i_nie_wywraca_bramki(
    tmp_path, monkeypatch, capsys
) -> None:
    root = _drzewo(tmp_path, {"application/zepsuty.py": "def f(:\n", "api/ok.py": CZYSTY})
    monkeypatch.setattr(guard, "BACKEND_SRC", root)

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
    assert int(match.group(1)) > 0, "pusty skan — bramka niczego nie oglada"
    assert completed.returncode == 0, completed.stdout


if __name__ == "__main__":
    import pytest

    sys.exit(pytest.main([__file__, "-v"]))
