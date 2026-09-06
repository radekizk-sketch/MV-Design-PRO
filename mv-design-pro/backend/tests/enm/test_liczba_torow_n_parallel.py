"""Karta CI-A (2026-09-04): testy funkcji domenowej ``enm.models.liczba_torow``
— JEDYNEJ definicji „liczba torów/jednostek równoległych" dla
Cable/Transformer/Generator (reguła KLASA NIE INSTANCJA, CLAUDE.md — trzy
niezależne podstawienia ``attr.n_parallel or 1``/``getattr(..., None) or 1``
(``enm/mapping.py`` ×3, ``application/analyses/fault_loop/route.py``) scalone
w jedną funkcję).

Iloczyn cech: {Cable, OverheadLine, Transformer, Generator} ×
{brak/None, jawne 1, jawne n>1}; parytet None↔jawne 1 i skalowanie n=2 → Z/2
(względnie Sn×2) w mapowaniu ``enm.mapping.map_enm_to_network_graph`` —
dokładnie to, co decyzja §0.3 karty CI-A wymaga jako PRZYPIĘTY dowód (reguła
KLASA §4 „deklaracja bez testu = fałszywa pewność": docstring ``liczba_torow``
obiecuje ten parytet).
"""

from __future__ import annotations

import pytest
from enm.mapping import _gen_quantity, map_enm_to_network_graph
from enm.models import (
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMHeader,
    Generator,
    OverheadLine,
    Transformer,
    liczba_torow,
)
from network_model.core.branch import LineBranch, TransformerBranch


def _make_enm(**kwargs: object) -> EnergyNetworkModel:
    return EnergyNetworkModel(header=ENMHeader(name="Test"), **kwargs)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# liczba_torow — testy jednostkowe (bez mapowania do grafu)
# ---------------------------------------------------------------------------


class TestLiczbaTorowCable:
    def _cable(self, **overrides: object) -> Cable:
        pola: dict = {
            "ref_id": "c1",
            "name": "C1",
            "from_bus_ref": "b1",
            "to_bus_ref": "b2",
            "length_km": 1.0,
            "r_ohm_per_km": 0.1,
            "x_ohm_per_km": 0.1,
        }
        pola.update(overrides)
        return Cable(**pola)

    def test_brak_n_parallel_daje_1(self) -> None:
        assert liczba_torow(self._cable()) == 1

    def test_jawne_n_parallel_1_daje_1(self) -> None:
        assert liczba_torow(self._cable(n_parallel=1)) == 1

    def test_jawne_n_parallel_3_daje_3(self) -> None:
        assert liczba_torow(self._cable(n_parallel=3)) == 3


class TestLiczbaTorowOverheadLine:
    def test_brak_pola_w_modelu_daje_1(self) -> None:
        """OverheadLine NIE deklaruje ``n_parallel`` — ``getattr`` z domyślnym
        ``None`` obejmuje ten przypadek bez zmiany zachowania (patrz
        docstring ``liczba_torow``)."""
        linia = OverheadLine(
            ref_id="l1",
            name="L1",
            from_bus_ref="b1",
            to_bus_ref="b2",
            length_km=1.0,
            r_ohm_per_km=0.1,
            x_ohm_per_km=0.1,
        )
        assert not hasattr(linia, "n_parallel")
        assert liczba_torow(linia) == 1


class TestLiczbaTorowTransformer:
    def _trafo(self, **overrides: object) -> Transformer:
        pola: dict = {
            "ref_id": "t1",
            "name": "T1",
            "hv_bus_ref": "b1",
            "lv_bus_ref": "b2",
            "sn_mva": 25.0,
            "uhv_kv": 110.0,
            "ulv_kv": 15.0,
            "uk_percent": 12.0,
            "pk_kw": 120.0,
        }
        pola.update(overrides)
        return Transformer(**pola)

    def test_brak_n_parallel_daje_1(self) -> None:
        assert liczba_torow(self._trafo()) == 1

    def test_jawne_n_parallel_2_daje_2(self) -> None:
        assert liczba_torow(self._trafo(n_parallel=2)) == 2


class TestLiczbaTorowGenerator:
    def _gen(self, **overrides: object) -> Generator:
        pola: dict = {"ref_id": "g1", "name": "G1", "bus_ref": "b1", "p_mw": 1.0}
        pola.update(overrides)
        return Generator(**pola)

    def test_brak_n_parallel_daje_1(self) -> None:
        assert liczba_torow(self._gen()) == 1

    def test_jawne_n_parallel_4_daje_4(self) -> None:
        assert liczba_torow(self._gen(n_parallel=4)) == 4


# ---------------------------------------------------------------------------
# _gen_quantity — Generator ma DWA pola kardynalności (quantity/n_parallel);
# quantity zachowuje priorytet (decyzja niezmieniona kartą CI-A), n_parallel
# czytany teraz przez `liczba_torow`.
# ---------------------------------------------------------------------------


class TestGenQuantity:
    def test_brak_obu_pol_daje_1(self) -> None:
        gen = Generator(ref_id="g1", name="G1", bus_ref="b1", p_mw=1.0)
        assert _gen_quantity(gen) == 1

    def test_tylko_n_parallel_uzywa_liczba_torow(self) -> None:
        gen = Generator(ref_id="g1", name="G1", bus_ref="b1", p_mw=1.0, n_parallel=3)
        assert _gen_quantity(gen) == 3

    def test_quantity_ma_priorytet_nad_n_parallel(self) -> None:
        gen = Generator(ref_id="g1", name="G1", bus_ref="b1", p_mw=1.0, quantity=5, n_parallel=2)
        assert _gen_quantity(gen) == 5


# ---------------------------------------------------------------------------
# Parytet None <-> jawne 1 i skalowanie n=2 w mapowaniu ENM -> NetworkGraph
# (wejście solvera fizyki) — Cable i Transformer.
# ---------------------------------------------------------------------------


def _dwie_szyny_nn() -> list[Bus]:
    return [
        Bus(ref_id="b1", name="B1", voltage_kv=0.4),
        Bus(ref_id="b2", name="B2", voltage_kv=0.4),
    ]


class TestParytetCableMapping:
    def _branch(self, n_parallel: int | None) -> LineBranch:
        from enm.models import BranchRating

        pola: dict = {
            "ref_id": "c1",
            "name": "C1",
            "from_bus_ref": "b1",
            "to_bus_ref": "b2",
            "length_km": 0.1,
            "r_ohm_per_km": 0.2,
            "x_ohm_per_km": 0.15,
            "b_siemens_per_km": 1e-6,
            "rating": BranchRating(in_a=250.0),
        }
        if n_parallel is not None:
            pola["n_parallel"] = n_parallel
        enm = _make_enm(buses=_dwie_szyny_nn(), branches=[Cable(**pola)])
        graph = map_enm_to_network_graph(enm)
        branch = next(iter(graph.branches.values()))
        assert isinstance(branch, LineBranch)
        return branch

    def test_brak_pola_rowny_jawnemu_1(self) -> None:
        """n_parallel=None (nieobecne) daje BAJTOWO identyczne wejście
        solvera co jawne n_parallel=1 — parytet wymagany decyzją §0.3."""
        brak = self._branch(None)
        jeden = self._branch(1)
        assert brak.r_ohm_per_km == jeden.r_ohm_per_km
        assert brak.x_ohm_per_km == jeden.x_ohm_per_km
        assert brak.b_us_per_km == jeden.b_us_per_km
        assert brak.rated_current_a == jeden.rated_current_a

    def test_n_2_dzieli_impedancje_i_mnozy_obciazalnosc(self) -> None:
        jeden = self._branch(1)
        dwa = self._branch(2)
        assert dwa.r_ohm_per_km == pytest.approx(jeden.r_ohm_per_km / 2.0)
        assert dwa.x_ohm_per_km == pytest.approx(jeden.x_ohm_per_km / 2.0)
        assert dwa.b_us_per_km == pytest.approx(jeden.b_us_per_km * 2.0)
        assert dwa.rated_current_a == pytest.approx(jeden.rated_current_a * 2.0)


class TestParytetTransformerMapping:
    def _branch(self, n_parallel: int | None) -> TransformerBranch:
        pola: dict = {
            "ref_id": "t1",
            "name": "T1",
            "hv_bus_ref": "b1",
            "lv_bus_ref": "b2",
            "sn_mva": 0.63,
            "uhv_kv": 15.0,
            "ulv_kv": 0.4,
            "uk_percent": 6.0,
            "pk_kw": 7.5,
        }
        if n_parallel is not None:
            pola["n_parallel"] = n_parallel
        enm = _make_enm(
            buses=[
                Bus(ref_id="b1", name="HV", voltage_kv=15.0),
                Bus(ref_id="b2", name="LV", voltage_kv=0.4),
            ],
            transformers=[Transformer(**pola)],
        )
        graph = map_enm_to_network_graph(enm)
        branch = next(b for b in graph.branches.values() if isinstance(b, TransformerBranch))
        return branch

    def test_brak_pola_rowny_jawnemu_1(self) -> None:
        brak = self._branch(None)
        jeden = self._branch(1)
        assert brak.rated_power_mva == jeden.rated_power_mva

    def test_n_2_podwaja_moc_znamionowa(self) -> None:
        jeden = self._branch(1)
        dwa = self._branch(2)
        assert dwa.rated_power_mva == pytest.approx(jeden.rated_power_mva * 2.0)
