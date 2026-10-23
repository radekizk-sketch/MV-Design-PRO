"""Testy własne ``readiness_consumption_guard`` — kody walidatora emitowane przez stałe.

Po co (karta GPZ-H5-SCALENIE-APARATURY): strażnik szukał kodów walidatora ENM wyłącznie jako
literału ``code="…"``. Walidator emituje część kodów nazwaną stałą modułu
(``KOD_NAPIECIE_ODNIESIENIA_ZRODLA_INNE_NIZ_SZYNY = "W012"`` … ``code=KOD_…``), więc wpis
``KODY_WALIDATORA_BEZ_KANONU`` realnie emitowanego kodu był meldowany jako sierota, a kod
bez rozstrzygnięcia przechodziłby niezauważony. Iloczyn: postać argumentu ``code=``
{literał, stała modułu (``=``), stała z adnotacją typu, zmienna lokalna} × miejsce
{wywołanie konstruktora zgłoszenia}; plus prawdziwy walidator: każdy kod emitowany stałą
jest widziany, a strażnik na repo kończy się RC=0.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend" / "src"))
sys.path.insert(0, str(REPO / "scripts"))

from readiness_consumption_guard import VALIDATOR, kody_emitowane_w_tresci  # noqa: E402

MODUL = """
KOD_A = "W901"
KOD_B: str = "E902"
NIE_KOD = 5


def f(lokalny):
    zgloszenie(code="W900")
    zgloszenie(code=KOD_A)
    zgloszenie(code=KOD_B)
    zgloszenie(code=NIE_KOD)
    kod = "W903"
    zgloszenie(code=kod)
"""


def test_literal_i_stale_modulu_sa_kodami_emitowanymi() -> None:
    assert kody_emitowane_w_tresci(MODUL) == {"W900", "W901", "E902"}


def test_prawdziwy_walidator_kody_ze_stalych_widoczne() -> None:
    kody = kody_emitowane_w_tresci(VALIDATOR.read_text(encoding="utf-8"))
    # Kody emitowane WYŁĄCZNIE stałą modułu (bez literału `code="…"` w walidatorze).
    for kod in ("E011", "E012", "W011", "W012", "W013", "E067", "W063"):
        assert kod in kody, kod
        assert f'code="{kod}"' not in VALIDATOR.read_text(encoding="utf-8")


def test_straznik_na_repo_rc0() -> None:
    wynik = subprocess.run(
        [sys.executable, str(REPO / "scripts" / "readiness_consumption_guard.py")],
        capture_output=True,
        text=True,
        check=False,
    )
    assert wynik.returncode == 0, wynik.stdout + wynik.stderr
