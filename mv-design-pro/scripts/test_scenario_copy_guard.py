"""Testy wlasne `scenario_copy_guard.py` (CV-3.1) — kazda regula × trafienie / nie-trafienie,
zapadka w obie strony, oraz pin stanu repozytorium (zielony, 9 zastanych trafien po
migracji D4/D5/D6 karta CV-3-W; D1-D3 migruje rownolegle inny wykonawca)."""

from __future__ import annotations

import ast
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import scenario_copy_guard as guard  # noqa: E402


def _naruszenia(kod: str) -> list[tuple[str, str]]:
    return [(regula, opis) for regula, _, opis in guard.zbierz_naruszenia(ast.parse(kod))]


def _reguly(kod: str) -> list[str]:
    return [regula for regula, _ in _naruszenia(kod)]


# --- R1 -----------------------------------------------------------------------


@pytest.mark.parametrize(
    "kod",
    [
        "from enm.canonical_analysis import CanonicalRun, _execute_power_flow\n",
        "from enm.canonical_analysis import _execute_short_circuit as sc\n",
        "from enm import canonical_analysis\ncanonical_analysis._execute_power_flow(run)\n",
        "import enm.canonical_analysis as ca\nca._execute_short_circuit(run)\n",
    ],
)
def test_r1_import_prywatnego_wykonawcy(kod: str) -> None:
    assert _reguly(kod) == ["R1"]


def test_r1_publiczny_dyspozytor_i_inne_prywatne_nazwy_nie_sa_trafieniem() -> None:
    kod = (
        "from enm.canonical_analysis import wykonaj_bieg_w_pamieci, _graph_id_from_ref\n"
        "wykonaj_bieg_w_pamieci(run)\n"
    )
    assert _reguly(kod) == []


# --- R2 -----------------------------------------------------------------------


def test_r2_konstrukcja_canonical_run_poza_fabryka() -> None:
    kod = (
        "from enm.canonical_analysis import CanonicalRun as Bieg\n"
        "def w(b):\n    return Bieg(id=b.id, snapshot=b.snapshot)\n"
    )
    assert _reguly(kod) == ["R2"]
    kod2 = "from enm import canonical_analysis\nx = canonical_analysis.CanonicalRun(id=1)\n"
    assert _reguly(kod2) == ["R2"]


def test_r2_uzycie_typu_bez_konstrukcji_nie_jest_trafieniem() -> None:
    kod = (
        "from enm.canonical_analysis import CanonicalRun, bieg_wariantu\n"
        "def w(b: CanonicalRun) -> CanonicalRun:\n    return bieg_wariantu(b, m, analysis_type='PF')\n"
    )
    assert _reguly(kod) == []


# --- R3 -----------------------------------------------------------------------


@pytest.mark.parametrize(
    "wyrazenie",
    [
        "base_snapshot",
        "run.snapshot",
        "kotwica.snapshot or {}",
        "migawka_bazy",
        "(snapshot if x else {})",
    ],
)
def test_r3_gleboka_kopia_migawki(wyrazenie: str) -> None:
    for forma in (
        f"import copy\ns = copy.deepcopy({wyrazenie})\n",
        f"from copy import deepcopy\ns = deepcopy({wyrazenie})\n",
    ):
        assert _reguly(forma) == ["R3"], forma


def test_r3_kopia_nie_migawki_nie_jest_trafieniem() -> None:
    assert (
        _reguly("import copy\ng = copy.deepcopy(gen)\nopcje = copy.deepcopy(run.options)\n") == []
    )


# --- R4 -----------------------------------------------------------------------


def test_r4_plytka_kopia_migawki_z_zapisem_po_indeksie() -> None:
    kod = "def w(snapshot, k):\n    wariant = dict(snapshot)\n    wariant[k] = []\n    return wariant\n"
    assert _naruszenia(kod) == [("R4", "wariant = dict(snapshot); wariant[...] = ...")]
    kod_aug = "def w(snapshot):\n    s = dict(snapshot or {})\n    s['n'] += 1\n"
    assert _reguly(kod_aug) == ["R4"]


def test_r4_plytka_kopia_bez_mutacji_albo_mutacja_w_innym_zakresie_nie_jest_trafieniem() -> None:
    assert (
        _reguly(
            "def w(enm_snapshot):\n    snapshot = dict(enm_snapshot or {})\n    return f(snapshot)\n"
        )
        == []
    )
    assert (
        _reguly(
            "def a(snapshot):\n    s = dict(snapshot)\n    return s\ndef b(s):\n    s['x'] = 1\n"
        )
        == []
    )
    assert _reguly("def w(b, snapshot_bazowy):\n    return f(b, dict(snapshot_bazowy))\n") == []
    assert _reguly("def w(dane):\n    d = dict(dane)\n    d['x'] = 1\n") == []


# --- zapadka ---------------------------------------------------------------------


def test_zapadka_wykrywa_wzrost_i_spadek_oraz_nowy_plik() -> None:
    zapadka = {"a.py": {"R1": 1, "R3": 2}}
    assert guard.porownaj_z_zapadka({"a.py": {"R1": 1, "R3": 2}}, zapadka) == []
    wzrost = guard.porownaj_z_zapadka({"a.py": {"R1": 2, "R3": 2}}, zapadka)
    assert len(wzrost) == 1 and wzrost[0].startswith("[dlug-urosl] a.py: R1 1 -> 2")
    spadek = guard.porownaj_z_zapadka({"a.py": {"R1": 1}}, zapadka)
    assert len(spadek) == 1 and "R3 2 -> 0" in spadek[0] and "usun wpis" in spadek[0]
    nowy = guard.porownaj_z_zapadka({"a.py": {"R1": 1, "R3": 2}, "b.py": {"R2": 1}}, zapadka)
    assert len(nowy) == 1 and nowy[0].startswith("[dlug-urosl] b.py: R2 0 -> 1")


def test_zasieg_pomija_dom_apply_scenario_i_fabryk() -> None:
    pliki = {p.relative_to(guard.BACKEND_SRC).as_posix() for p in guard.pliki_w_zasiegu()}
    assert "enm/scenariusze.py" not in pliki and "enm/canonical_analysis.py" not in pliki
    assert "enm/store.py" in pliki and "application/analyses/hosting_capacity.py" in pliki


def test_stan_repozytorium_jest_zielony_i_przypiety() -> None:
    """Pin stanu (2026-09-05, po kartach CV-3-W A i B, +1 wyjatek CV-3.3-B).

    Stan sprzed CV-3-W: 6 rodzin, 19 trafien (D1 R1+R2+R4=3, D2 3, D3 3, D4 3,
    D5 3, D6 R2 2 + R3 2). Wszystkie rodziny przeszly na apply_scenario/
    bieg_wariantu/wykonaj_bieg_w_pamieci z parytetem bit w bit
    (`tests/golden/parytet_scenariuszy`). Karta CV-3.3-B dopisala JEDYNY
    dopuszczony wyjatek: `application/project_archive/service.py` (R2×1) —
    deserializacja historycznego biegu z archiwum ZIP przy imporcie projektu,
    INNA KLASA niz dlug scenariuszy (uzasadnienie w komentarzu przy `ZASTANE`
    w module guarda). Kazde KOLEJNE nowe trafienie = czerwone CI."""
    pomiar = guard.zmierz()
    assert pomiar == guard.ZASTANE == {"application/project_archive/service.py": {"R2": 1}}
    assert sum(sum(v.values()) for v in pomiar.values()) == 1
    assert guard.main([]) == 0
