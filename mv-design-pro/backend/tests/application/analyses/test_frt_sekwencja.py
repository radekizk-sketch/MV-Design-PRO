"""Testy serwisu sekwencji zapadów FRT z kontekstem siły sieci (D9).

Warstwa APPLICATION — bieg FROZEN solvera FRT dla N scenariuszy LVRT w jednym
wejściu. Kontekst SCR/WSCR dołączany z widoku siły sieci D1 (golden network).

Zmiana kanonu (uczciwość natychmiastowa 2026-09-23): dawne werdykty per zapad („w
obwiedni" / „moduł wypadł") i werdykt sekwencji jako koniunkcja („sekwencja niezaliczona —
zapad N") były tautologią wobec profilu wejściowego (sonda audytu: zapad do 0,06 p.u.
przez 3 s dawał „sekwencja w obwiedni"). Każdy zapad i cała sekwencja niosą rekord
``NIE_OCENIONO``; pola solvera zostają audytem. Intencja zachowana: kolejność zapadów,
echo wejścia, obwiednia, założenia, determinizm, walidacja, kontekst siły sieci, granica
``no_module``, stopień dowodowy; testy werdyktu ODWRÓCONE.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from application.analyses.frt_sekwencja import (
    _MAX_ZAPADY,
    build_frt_sekwencja_view,
)
from application.analyses.frt_trajektorie import (
    BRAKI_OCENY_FRT,
    KOD_GOTOWOSCI_BRAK_MODELU_DYNAMICZNEGO,
    WERDYKT_NIE_OCENIONO_PL,
)
from application.analyses.grid_strength import build_grid_strength_view
from catalog.profiles.nc_rfg.loader import load_nc_rfg_profile
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
from enm.models import GenLimits
from enm.store import reset_enm_store, set_enm
from network_model.catalog.types import ConverterKind, ConverterType
from network_model.solvers.frt_hvrt.contracts import FrtHvrtResult

from tests.cgmes.golden_enm import build_golden_enm

_PROFILE = load_nc_rfg_profile("pse")

# Zapady z utrzymaniem w pracy wg solvera (głębokość > 0.05 p.u.) i z meldunkiem
# odłączenia (v < 0.05) — obie klasy dawniej dawały werdykt, dziś ocenę niewykonaną.
_ZAPAD_OK = (0.30, 0.15)
_ZAPAD_OK_2 = (0.40, 0.20)
_ZAPAD_WYPADA = (0.02, 0.20)
# Sonda audytu 2026-09-23: 0,06 p.u. przez 3 s — dawniej „sekwencja w obwiedni".
_ZAPAD_SONDA = (0.06, 3.0)


def _converter() -> ConverterType:
    return ConverterType(
        id="conv-test-der",
        name="Test DER",
        kind=ConverterKind.PV,
        un_kv=0.4,
        sn_mva=2.5,
        pmax_mw=2.0,
        qmin_mvar=-0.6,
        qmax_mvar=0.6,
    )


# --------------------------------------------------------------------------
# Sekwencja i werdykty per zapad
# --------------------------------------------------------------------------


def _sprawdz_bez_werdyktu(view: dict) -> None:
    assert view["werdykt_sekwencji_pl"] == WERDYKT_NIE_OCENIONO_PL
    assert view["ocena"]["status_maszynowy"] == "NIE_OCENIONO"
    assert view["ocena"]["kryterium_id"] == "frt_hvrt.sekwencja.conv-test-der"
    for zapad in view["zapady"]:
        assert zapad["werdykt_pl"] == WERDYKT_NIE_OCENIONO_PL
        assert zapad["ocena"]["status_maszynowy"] == "NIE_OCENIONO"
        assert zapad["ocena"]["kryterium_id"] == (
            f"frt_hvrt.sekwencja.conv-test-der.{zapad['scenario_id']}"
        )
        for brak in BRAKI_OCENY_FRT:
            assert brak in zapad["ocena"]["wyjasnienie"]["czego_brakuje"]


def test_sequence_of_two_dips_has_per_dip_records() -> None:
    view = build_frt_sekwencja_view(_converter(), _PROFILE, [_ZAPAD_OK, _ZAPAD_OK_2])
    assert view["liczba_zapadow"] == 2
    assert len(view["zapady"]) == 2
    for zapad in view["zapady"]:
        assert "glebokosc_pu" in zapad and "czas_s" in zapad
    _sprawdz_bez_werdyktu(view)


# ILOCZYN CECH: skład sekwencji (same „utrzymane" / z meldunkiem odłączenia na różnych
# pozycjach / sonda audytu 0,06 p.u. przez 3 s). Dawniej: „w obwiedni" albo „sekwencja
# niezaliczona — zapad N"; teraz żaden skład nie daje werdyktu sekwencji ani zapadu.
@pytest.mark.parametrize(
    "zapady",
    [
        [_ZAPAD_OK, _ZAPAD_OK_2, _ZAPAD_OK],
        [_ZAPAD_OK, _ZAPAD_WYPADA, _ZAPAD_OK_2],
        [_ZAPAD_WYPADA, _ZAPAD_WYPADA],
        [_ZAPAD_SONDA],
    ],
)
def test_no_composition_of_dips_produces_a_verdict(zapady: list[tuple[float, float]]) -> None:
    view = build_frt_sekwencja_view(_converter(), _PROFILE, zapady)
    _sprawdz_bez_werdyktu(view)
    assert "niezaliczona" not in str(view)
    assert "w obwiedni" not in str(view)


def test_dip_order_preserved() -> None:
    zapady = [_ZAPAD_OK, _ZAPAD_WYPADA, _ZAPAD_OK_2]
    view = build_frt_sekwencja_view(_converter(), _PROFILE, zapady)
    glebokosci = [z["glebokosc_pu"] for z in view["zapady"]]
    assert glebokosci == [0.3, 0.02, 0.4]
    assert [z["scenario_id"] for z in view["zapady"]] == ["zapad_1", "zapad_2", "zapad_3"]


def test_solver_disconnect_report_stays_audit_field() -> None:
    """Meldunek solvera o odłączeniu (v < 0,05 p.u.) zostaje polem audytowym zapadu —
    bez interpretacji w werdykt (dawniej „moduł wypadł" i „sekwencja niezaliczona")."""
    view = build_frt_sekwencja_view(_converter(), _PROFILE, [_ZAPAD_OK, _ZAPAD_WYPADA])
    assert view["zapady"][0]["stayed_connected"] is True
    assert view["zapady"][1]["stayed_connected"] is False
    _sprawdz_bez_werdyktu(view)


# --------------------------------------------------------------------------
# WHITE BOX, metadane, obwiednia, założenia
# --------------------------------------------------------------------------


def test_white_box_solver_input_per_dip() -> None:
    view = build_frt_sekwencja_view(_converter(), _PROFILE, [_ZAPAD_OK])
    wejscie = view["zapady"][0]["wejscie_solvera"]
    assert wejscie["test_kind"] == "lvrt"
    assert wejscie["voltage_dip_depth_pu"] == 0.3
    assert wejscie["fault_duration_s"] == 0.15
    assert wejscie["target_der_ref"] == "conv-test-der"


def test_module_and_operator_metadata_present() -> None:
    view = build_frt_sekwencja_view(_converter(), _PROFILE, [_ZAPAD_OK])
    assert view["modul_der"]["id"] == "conv-test-der"
    assert view["modul_der"]["pmax_mw"] == pytest.approx(2.0)
    assert view["operator"]["id"] == "pse"
    assert view["operator"]["nazwa"] == _PROFILE.operator_name_pl


def test_envelope_matches_operator_lvrt_profile() -> None:
    view = build_frt_sekwencja_view(_converter(), _PROFILE, [_ZAPAD_OK])
    expected = [
        {"czas_s": pt.time_s, "napiecie_pu": pt.voltage_pu} for pt in _PROFILE.voltage_levels.lvrt
    ]
    assert view["obwiednia_profilu"]["punkty"] == expected
    assert view["obwiednia_profilu"]["rodzaj"] == "lvrt"


def test_zalozenia_pl_documents_between_dip_limitation() -> None:
    view = build_frt_sekwencja_view(_converter(), _PROFILE, [_ZAPAD_OK])
    assert "MIĘDZY zapadami" in view["zalozenia_pl"]
    # Zmiana kanonu (2026-09-23): dawne „każdy zapad oceniany niezależnie" → zapady liczone
    # od stanu ustalonego i NIEoceniane (trajektoria zadana profilem wejściowym).
    assert "od stanu ustalonego" in view["zalozenia_pl"]
    assert "nie są oceniane" in view["zalozenia_pl"]


# --------------------------------------------------------------------------
# Determinizm i input_hash
# --------------------------------------------------------------------------


def test_view_is_deterministic_including_hash() -> None:
    zapady = [_ZAPAD_OK, _ZAPAD_OK_2]
    first = build_frt_sekwencja_view(_converter(), _PROFILE, zapady)
    second = build_frt_sekwencja_view(_converter(), _PROFILE, zapady)
    assert first == second
    assert len(first["input_hash"]) == 64
    assert all(c in "0123456789abcdef" for c in first["input_hash"])


def test_input_hash_differs_for_different_sequence() -> None:
    a = build_frt_sekwencja_view(_converter(), _PROFILE, [_ZAPAD_OK])
    b = build_frt_sekwencja_view(_converter(), _PROFILE, [_ZAPAD_OK_2])
    assert a["input_hash"] != b["input_hash"]


# --------------------------------------------------------------------------
# Walidacja wejścia
# --------------------------------------------------------------------------


def test_empty_sequence_raises_valueerror() -> None:
    with pytest.raises(ValueError, match="pusta"):
        build_frt_sekwencja_view(_converter(), _PROFILE, [])


def test_too_long_sequence_raises_valueerror() -> None:
    zapady = [_ZAPAD_OK] * (_MAX_ZAPADY + 1)
    with pytest.raises(ValueError, match="maksimum"):
        build_frt_sekwencja_view(_converter(), _PROFILE, zapady)


def test_depth_out_of_lvrt_range_raises_valueerror() -> None:
    with pytest.raises(ValueError, match="poza zakresem 0..1"):
        build_frt_sekwencja_view(_converter(), _PROFILE, [(1.5, 0.15)])


# --------------------------------------------------------------------------
# Kontekst siły sieci (SCR/WSCR)
# --------------------------------------------------------------------------


def test_grid_strength_context_null_without_row() -> None:
    view = build_frt_sekwencja_view(_converter(), _PROFILE, [_ZAPAD_OK])
    assert view["kontekst_sily_sieci"] is None
    assert "pominięty" in view["kontekst_sily_sieci_powod_pl"]


def test_grid_strength_context_passed_through() -> None:
    row = {"bus_ref": "bus_x", "scr": 4.2, "verdict": "mocna", "is_weak": False}
    view = build_frt_sekwencja_view(_converter(), _PROFILE, [_ZAPAD_OK], grid_strength_row=row)
    assert view["kontekst_sily_sieci"] == row
    assert view["kontekst_sily_sieci_powod_pl"] is None


class TestGridStrengthContextFromGoldenRun:
    """Kontekst SCR dołączony z realnego przebiegu zwarciowego (golden network, D1)."""

    @pytest.fixture(autouse=True)
    def _reset(self) -> None:
        reset_canonical_runs()
        reset_enm_store()
        yield
        reset_canonical_runs()
        reset_enm_store()

    def _grid_strength_row(self, bus_ref: str) -> dict:
        enm = build_golden_enm()
        gens = list(enm.generators)
        gens[1] = gens[1].model_copy(
            update={
                "limits": GenLimits(q_min_mvar=-0.9, q_max_mvar=0.9),
                "materialized_params": {"sn_mva": 2.75},
            }
        )
        enm = enm.model_copy(update={"generators": gens})
        set_enm("c1", enm)
        run = execute_run(
            create_run(case_id="c1", klucz_twin="c1", analysis_type="short_circuit_sn").id
        )
        assert run.status == "FINISHED", run.error_message
        entries = {e["bus_ref"]: e for e in build_grid_strength_view(run)["entries"]}
        return entries[bus_ref]

    def test_context_from_short_circuit_run_attached(self) -> None:
        row = self._grid_strength_row("bus_nn")
        view = build_frt_sekwencja_view(_converter(), _PROFILE, [_ZAPAD_OK], grid_strength_row=row)
        assert view["kontekst_sily_sieci"]["bus_ref"] == "bus_nn"
        assert view["kontekst_sily_sieci"]["scr"] is not None
        assert "verdict" in view["kontekst_sily_sieci"]
        assert view["kontekst_sily_sieci_powod_pl"] is None


def test_no_module_status_mapped_to_blocked_at_boundary() -> None:
    """Karta S-4 (W6-0), KLASA NIE INSTANCJA — ta sama granica co D6
    (trajektorie): status solvera FROZEN `no_module` NIGDY nie dociera do FE,
    mapowany na `blocked` z kodem gotowości `der.dynamic_profile_missing`."""
    converter = _converter()
    with patch(
        "application.analyses.frt_sekwencja.FrtHvrtSolverAdapter.run",
        return_value=FrtHvrtResult(
            status="no_module",
            no_module_reason_pl="Brak zdefiniowanego profilu dynamicznego DER.",
        ),
    ):
        view = build_frt_sekwencja_view(converter, _PROFILE, [_ZAPAD_OK])
    assert view["status_solvera"] == "blocked"
    assert view["kod_gotowosci"] == KOD_GOTOWOSCI_BRAK_MODELU_DYNAMICZNEGO
    assert view["missing_fields_pl"] == ["Brak zdefiniowanego profilu dynamicznego DER."]
    assert view["liczba_zapadow"] == 0
    assert view["zapady"] == []
    assert "no_module" not in str(view)


def test_ocena_dowodowa_sekwencji_unvalidated_model() -> None:
    """Karta S-1 §0.9: sekwencja FRT niesie ten sam stopień dowodowy co
    trajektoria pojedyncza — UNVALIDATED_MODEL."""
    view = build_frt_sekwencja_view(_converter(), _PROFILE, [_ZAPAD_OK])
    assert view["ocena_dowodowa"]["capability_id"] == "frt_hvrt.trajectory"
    assert view["ocena_dowodowa"]["tier"] == "UNVALIDATED_MODEL"
