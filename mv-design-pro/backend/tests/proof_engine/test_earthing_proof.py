"""Dowód uziemienia stacji SN — prezentacja wyniku solvera doziemień SN (karta
EWALUATORY-ZIEMNOZWARCIOWE, decyzja O-74 pkt 3: łańcuch P19 z podziałem ról).

ŚCIEŻKA. Scena zwarć doziemnych zbudowana operacjami projektanta → ocena zabezpieczeń
ziemnozwarciowych i uziemień (ta, którą woła bieg ``protection_sn``) → rekordy ``uziemienia``
→ ``dowody_uziemien_biegu`` → dokument dowodu. Dowód NIE liczy: każda liczba kluczowa jest
bitowo równa liczbie rekordu (solvera), także tam, gdzie dawny dowód liczyłby inaczej
(I_E = U0/Z_E; prąd uziomowy sieci kompensowanej z dławikiem w stacji ≠ r·I_Res).

ILOCZYN CECH: sposób pracy punktu neutralnego {izolowany, kompensowany, kompensowany z AWSC,
rezystor} × uziom {R_E podane, R_E brak} × współczynnik r {podany, brak → r = 1 przyjęte}.
"""

from __future__ import annotations

import itertools
import json
from datetime import UTC, datetime
from typing import Any

import pytest
from application.analyses.protection.ocena_ziemnozwarciowa import (
    ocen_zabezpieczenia_ziemnozwarciowe,
)
from application.proof_engine.equation_registry import EquationRegistry
from application.proof_engine.packs.earthing_ground_fault_sn import (
    artefakt_uziemienia,
    dowody_uziemien_biegu,
    serialize_earthing_pack,
)
from application.proof_engine.proof_inspector import InspectorExporter, export_to_json
from application.proof_engine.types import ProofType
from enm.mapping import map_enm_to_network_graph
from enm.models import EnergyNetworkModel

from tests.reference_networks.scena_doziemienia import (
    SPOSOBY_PRACY,
    SposobPracy,
    scena_z_nastawami,
    ustaw_uziom_stacji,
)

_TS = datetime(2026, 11, 4, 12, 0, tzinfo=UTC)
_R_E_OHM = 2.0
_R = 0.6

_SCENY: dict[tuple[SposobPracy, bool, bool], dict[str, Any]] = {}


def _ziemnozwarciowe(sposob: SposobPracy, z_re: bool, z_r: bool) -> dict[str, Any]:
    klucz = (sposob, z_re, z_r)
    if klucz not in _SCENY:
        enm = ustaw_uziom_stacji(
            scena_z_nastawami(sposob),
            rezystancja_ohm=_R_E_OHM if z_re else None,
            wspolczynnik_r=_R if z_r else None,
        )
        model = EnergyNetworkModel.model_validate(enm)
        _SCENY[klucz] = ocen_zabezpieczenia_ziemnozwarciowe(
            model, map_enm_to_network_graph(model), odniesienie="test"
        ).to_dict()
    return _SCENY[klucz]


def _dowody(ziemne: dict[str, Any]):
    return dowody_uziemien_biegu(
        ziemne,
        run_id="bieg-testowy",
        project_name="Projekt",
        case_name="Przypadek",
        run_timestamp=_TS,
        solver_version="test",
    )


def _rekord_uziemienia(ziemne: dict[str, Any]) -> dict[str, Any]:
    return next(r for r in ziemne["uziemienia"] if r["kryterium"] != "NAPIECIE_KROKOWE")


def test_kolejnosc_krokow_stala() -> None:
    assert EquationRegistry.get_earth_step_order() == [
        "EQ_EARTH_001",
        "EQ_EARTH_002",
        "EQ_EARTH_003",
    ]


@pytest.mark.parametrize(
    "sposob,z_re,z_r",
    list(itertools.product(SPOSOBY_PRACY, (True, False), (True, False))),
    ids=lambda v: str(v),
)
def test_dowod_przenosi_liczby_solvera(sposob: SposobPracy, z_re: bool, z_r: bool) -> None:
    ziemne = _ziemnozwarciowe(sposob, z_re, z_r)
    rekord = _rekord_uziemienia(ziemne)
    (dowod,) = _dowody(ziemne)
    klucze = dowod.summary.key_results

    assert dowod.proof_type == ProofType.EARTHING_GROUND_FAULT_SN
    assert [s.equation.equation_id for s in dowod.steps] == EquationRegistry.get_earth_step_order()
    assert dowod.summary.unit_check_passed
    # Liczby kluczowe = liczby rekordu solvera, bez przeliczania.
    assert klucze["i_earth_a"].value == rekord["prad_uziomowy_a"]
    assert dowod.steps[0].input_values[1].value == rekord["prad_odniesienia_a"]
    assert dowod.steps[0].input_values[0].value == rekord["wspolczynnik_r"]
    assert rekord["wspolczynnik_r"] == (_R if z_r else 1.0)
    assert rekord["wspolczynnik_r_przyjety"] is (not z_r)
    assert klucze["earthing_mode"].value == rekord["sposob_pl"]
    if z_re:
        assert rekord["kryterium"] == "NAPIECIE_UZIOMOWE"
        assert klucze["u_e_v"].value == rekord["napiecie_uziomowe_v"]
        assert klucze["u_e_v"].value == pytest.approx(_R_E_OHM * rekord["prad_uziomowy_a"])
        assert klucze["computed_status"].value == "COMPUTED"
    else:
        assert rekord["kryterium"] == "REZYSTANCJA_DOPUSZCZALNA"
        assert klucze["u_e_v"].value == "—"
        assert klucze["computed_status"].value == "R_E NIEZNANE"
        assert any("R_E nieznana" in w for w in dowod.summary.warnings)
    assert any("r nieznany" in w for w in dowod.summary.warnings) is (not z_r)
    # U_Tp — treści normy brak: R_E,max bez wartości (nigdy liczba z założenia).
    assert dowod.steps[2].result.value == "—"
    # Wzór wiersza tablicy 1 z solvera w podstawieniu kroku 1.
    assert rekord["wzor_latex"] in dowod.steps[0].substitution_latex


def test_kompensowana_z_dlawikiem_w_stacji_prad_odniesienia_z_dlawikiem() -> None:
    """Iniekcja klasy „dowód liczy sam": w sieci kompensowanej z dławikiem w stacji prąd
    uziomowy to r·√(I_L² + I_Res²), a nie r·I_Res — dowód, który przeliczałby I_E z prądu
    zwarcia, dałby liczbę ~10× mniejszą."""
    ziemne = _ziemnozwarciowe("KOMPENSOWANY", True, True)
    rekord = _rekord_uziemienia(ziemne)
    assert rekord["sposob"] == "KOMPENSOWANA_Z_DLAWIKIEM_W_STACJI"
    assert rekord["prad_dlawika_a"] > 5 * rekord["prad_zwarcia_a"]
    (dowod,) = _dowody(ziemne)
    i_e = dowod.summary.key_results["i_earth_a"].value
    assert i_e == pytest.approx(_R * (rekord["prad_dlawika_a"] ** 2 + rekord["prad_zwarcia_a"] ** 2) ** 0.5)
    assert i_e > 5 * _R * rekord["prad_zwarcia_a"]


def test_determinizm_i_identyfikator_artefaktu() -> None:
    ziemne = _ziemnozwarciowe("REZYSTOR", True, True)
    (d1,) = _dowody(ziemne)
    (d2,) = _dowody(ziemne)
    assert d1.artifact_id == d2.artifact_id == artefakt_uziemienia(
        "bieg-testowy", _rekord_uziemienia(ziemne)["stacja_ref"]
    )
    j1, j2 = json.loads(export_to_json(d1)), json.loads(export_to_json(d2))
    for j in (j1, j2):
        j.pop("document_id", None)
        j.pop("created_at", None)
    assert j1 == j2


def test_serializacja_i_eksport_docx() -> None:
    pytest.importorskip("docx")
    (dowod,) = _dowody(_ziemnozwarciowe("IZOLOWANY", False, False))
    payload = serialize_earthing_pack(dowod)
    assert payload["pack_type"] == "EARTHING_GROUND_FAULT_SN"
    assert payload["summary"]["proof_type"] == "EARTHING_GROUND_FAULT_SN"
    wynik = InspectorExporter(dowod).export_docx()
    assert wynik.success and wynik.content[:2] == b"PK"


def test_bez_rekordow_uziemienia_brak_dowodu() -> None:
    assert _dowody({"uziemienia": []}) == []
