"""Pin skryptu `guardy_z_ci` — listy bramek nie utrzymuje człowiek (2026-08-07).

INTENCJA. CI było czerwone przez cztery kolejne szczyty, bo klaster odbioru
nadzorcy był listą wybraną ręcznie i nie zawierał `no_direct_fault_params_guard`.
Skrypt zastępuje tę listę odczytem z definicji workflowów, więc nowy guard
wchodzi do odbioru sam. Ten plik przypina dwie własności, na których to stoi:
wyciąg z workflowów faktycznie widzi guardy z CI, a pusty skan jest błędem, nie
ciszą (skrypt, który nic nie uruchomił, nie ma prawa meldować zieleni).

Sam bieg 69 guardów trwa minuty i należy do odbioru, nie do testu jednostkowego —
tutaj sprawdzamy WYCIĄG i ZAPADKĘ, czyli to, co decyduje o kompletności listy.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = PROJECT_ROOT / "scripts"


def _load_script(module_name: str):
    script_path = SCRIPTS_DIR / f"{module_name}.py"
    spec = importlib.util.spec_from_file_location(module_name, script_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load script module: {script_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


skrypt = _load_script("guardy_z_ci")


def test_wyciag_widzi_guardy_wolane_przez_ci() -> None:
    """Lista jest niepusta i niesie guardy z RÓŻNYCH workflowów."""
    nazwy = skrypt.guardy_z_workflowow()
    assert len(nazwy) >= skrypt.MIN_GUARDOW
    # Po jednym reprezentancie z trzech różnych workflowów — gdyby wyciąg czytał
    # tylko jeden plik, ten warunek by upadł.
    assert "no_direct_fault_params_guard" in nazwy  # p0-extended-guards
    assert "docs_guard" in nazwy  # docs-guard
    assert "arch_guard" in nazwy  # arch-guard


def test_kazdy_wolany_guard_istnieje_w_repozytorium() -> None:
    """Workflow nie woła skryptu, którego nie ma — inaczej CI padłoby na starcie."""
    brakujace = [n for n in skrypt.guardy_z_workflowow() if not (SCRIPTS_DIR / f"{n}.py").exists()]
    assert brakujace == []


def test_guard_naprawiony_dzis_jest_na_liscie_odbioru() -> None:
    """Zapadka na regresję procesu: bramka, która przepuściła cztery czerwone
    szczyty, MUSI należeć do listy odbioru. Gdyby ktoś wyjął ją z workflowa,
    ten test upadnie zamiast przywrócić dawną ślepotę po cichu."""
    assert "no_direct_fault_params_guard" in skrypt.guardy_z_workflowow()


def test_pusty_skan_jest_bledem_a_nie_zieloną_bramka(monkeypatch, tmp_path: Path) -> None:
    """Katalog workflowów bez wywołań guardów -> RC=1, nigdy 0."""
    pusty = tmp_path / "workflows"
    pusty.mkdir()
    (pusty / "nic.yml").write_text("name: nic\njobs: {}\n", encoding="utf-8")
    monkeypatch.setattr(skrypt, "WORKFLOWS_DIR", pusty)
    assert skrypt.main() == 1
