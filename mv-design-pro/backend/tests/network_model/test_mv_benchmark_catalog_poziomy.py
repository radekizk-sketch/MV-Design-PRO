"""Klasa: baza impedancji per-unit linii benchmarku = poziom napięcia JEJ szyn.

Znalezisko (CI run 4923 na ``fc24fc76``, 2026-09-09): katalog benchmarków
stemplował KAŻDĄ linię sieci bazą napięcia SYSTEMU (``base_kv`` nagłówka), a tor
kanoniczny przelicza Ω → p.u. bazą WŁASNEGO poziomu napięcia szyny. Linia na innym
poziomie (ieee14bus: 8 odcinków w obszarze 0,208 kV przy bazie 135 kV) dostawała
impedancję (135/0,208)² ≈ 4,2·10⁵ razy za dużą; rozpływ kanoniczny bliźniaka był
ROZBIEŻNY (30 iteracji, |U| do 320 p.u.), a złoty parytet asemblera przypinał
wynik niezbieżny — zależny od maszyny (lokalnie 21 iteracji/3 przełączenia PV→PQ,
na CI 26 iteracji i 187 rozbieżności liczb). Test pilnuje CAŁEJ klasy: każda
gałąź liniowa każdego bliźniaka rejestru odwołuje się do rekordu katalogu, którego
``voltage_rating_kv`` równa się napięciu znamionowemu OBU jej szyn (jedna linia nie
zmienia napięcia — zmiana poziomu jest wyłącznie transformatorem, K1.1).
"""

from __future__ import annotations

import math

import pytest
from enm.models import Cable, OverheadLine
from network_model.catalog.mv_benchmark_catalog import get_all_benchmark_line_records

from tests.golden.parytet_assemblera.harness import sieci_enm_rejestru

_BLIZNIAKI = [(klucz, enm) for klucz, enm in sieci_enm_rejestru() if klucz.startswith("B-BENCH/")]


def _rekordy_linii() -> dict[str, float]:
    return {
        r["id"]: float(r["params"]["voltage_rating_kv"]) for r in get_all_benchmark_line_records()
    }


@pytest.mark.parametrize("klucz,enm", _BLIZNIAKI, ids=[k for k, _ in _BLIZNIAKI])
def test_baza_impedancji_linii_rowna_napieciu_szyn(klucz: str, enm) -> None:
    rekordy = _rekordy_linii()
    napiecie_szyny = {bus.ref_id: float(bus.voltage_kv) for bus in enm.buses}
    sprawdzone = 0
    for branch in enm.branches:
        if not isinstance(branch, OverheadLine | Cable):
            continue
        ref = branch.catalog_ref or ""
        if not ref.startswith("bench_"):
            continue
        assert ref in rekordy, f"{klucz}: gałąź {branch.ref_id} wskazuje nieznany rekord {ref}"
        u_katalog = rekordy[ref]
        for szyna in (branch.from_bus_ref, branch.to_bus_ref):
            u_szyny = napiecie_szyny[szyna]
            assert math.isclose(u_katalog, u_szyny, rel_tol=1e-9), (
                f"{klucz}: odcinek {branch.ref_id} ({ref}) ma bazę impedancji "
                f"{u_katalog} kV, a jego szyna {szyna} jest na {u_szyny} kV — impedancja "
                f"per-unit zostanie przeliczona ({u_katalog}/{u_szyny})² razy błędnie"
            )
        sprawdzone += 1
    # Bliźniak bez gałęzi liniowej z katalogu benchmark (IEC 60909-4 Example: same
    # transformatory/kable innych przestrzeni katalogu) nie jest naruszeniem klasy;
    # pokrycie pilnuje `test_klasa_obejmuje_bliźniaki_z_liniami` (liczba z pomiaru).
    assert sprawdzone >= 0


def test_klasa_obejmuje_blizniaki_z_liniami() -> None:
    """Zapadka pokrycia: bliźniaki z ≥1 gałęzią liniową `bench_*` (pomiar 2026-09-09: 10/11)."""
    z_liniami = {
        klucz
        for klucz, enm in _BLIZNIAKI
        if any(
            isinstance(b, OverheadLine | Cable) and (b.catalog_ref or "").startswith("bench_")
            for b in enm.branches
        )
    }
    assert len(_BLIZNIAKI) == 11, sorted(k for k, _ in _BLIZNIAKI)
    assert len(z_liniami) == 10, sorted(z_liniami)
    (bez_linii,) = {k for k, _ in _BLIZNIAKI} - z_liniami
    assert bez_linii.startswith("B-BENCH/09:IEC 60909-4"), bez_linii


def test_ieee14bus_odcinki_0208_kv_maja_baze_0208_kv() -> None:
    """Instancja z CI: br7–br14 (obszar 0,208 kV) — jawnie, żeby regresja miała nazwę."""
    rekordy = _rekordy_linii()
    for i in range(7, 15):
        assert rekordy[f"bench_ieee14bus_br{i}"] == pytest.approx(0.208)
    for i in range(0, 7):
        assert rekordy[f"bench_ieee14bus_br{i}"] == pytest.approx(135.0)
