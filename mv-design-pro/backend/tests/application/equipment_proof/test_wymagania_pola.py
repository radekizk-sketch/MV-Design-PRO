"""t_k aparatu POLA w wymaganiach dowodu doboru aparatury (karta EDYTOR-DELT-SCENARIUSZA-
ZABEZPIECZEN, znalezisko (a)): czas wyłączenia pola zastępuje czas cieplny biegu; czas pola
nieustalony = brak t_k z powodem w uwadze, nigdy czas biegu w zastępstwie.

Iloczyn: czas pola {ustalony, nieustalony} × t_k biegu {obecny} → wymagania + uwaga dowodu.
"""

from __future__ import annotations

from application.equipment_proof.generator import EquipmentProofBundle, EquipmentProofGenerator
from application.equipment_proof.types import DeviceRating, EquipmentProofInput
from application.equipment_proof.wymagania_pola import (
    ZRODLO_TK_CZAS_POLA,
    wymagania_z_czasem_pola,
)

WYMAGANE_BIEGU = {"u_kv": 15.0, "ikss_ka": 8.0, "ip_ka": 20.0, "ith_ka": 8.2, "tk_s": 1.0}


def _czas(t_clearing_s: float | None, powod: str) -> dict[str, object]:
    return {
        "t_clearing_s": t_clearing_s,
        "pole_ref": "pole-1",
        "czlon_nastawczy_s": 0.3 if t_clearing_s is not None else None,
        "czas_wlasny_wylacznika_s": 0.06 if t_clearing_s is not None else None,
        "powod_pl": powod,
    }


def _dowod(wymagane: dict[str, object]) -> EquipmentProofBundle:
    return EquipmentProofGenerator.generate(
        EquipmentProofInput(
            project_id="p",
            case_id="c",
            run_id="r",
            connection_node_id="n",
            device=DeviceRating(
                device_id="q1",
                name_pl="Wyłącznik",
                type_ref=None,
                u_m_kv=17.5,
                i_cu_ka=25.0,
                i_dyn_ka=63.0,
                i_th_ka=25.0,
                t_th_s=3.0,
            ),
            required_fault_results=wymagane,
            project_name="Projekt",
            case_name="Przypadek",
        )
    )


def test_czas_pola_ustalony_zastepuje_tk_biegu_z_pochodzeniem() -> None:
    wymagane = wymagania_z_czasem_pola(WYMAGANE_BIEGU, _czas(0.36, "Czas stopnia I> (DT)."))
    assert wymagane["tk_s"] == 0.36
    assert wymagane["tk_zrodlo"]["zrodlo"] == ZRODLO_TK_CZAS_POLA
    assert WYMAGANE_BIEGU["tk_s"] == 1.0  # wejście nietknięte
    wynik = _dowod(wymagane)
    (ith,) = (c for c in wynik.result.checks if c.name == "Ith")
    assert any("czas wyłączenia pola" in n for n in ith.notes)
    assert any("czas wyłączenia pola" in w for w in wynik.proof_document.summary.warnings)


def test_czas_pola_nieustalony_zdejmuje_tk_zamiast_czasu_biegu() -> None:
    wymagane = wymagania_z_czasem_pola(
        WYMAGANE_BIEGU, _czas(None, "Pole nie ma czynnego sterownika zabezpieczeń.")
    )
    assert "tk_s" not in wymagane
    wynik = _dowod(wymagane)
    (ith,) = (c for c in wynik.result.checks if c.name == "Ith")
    assert ith.message_pl.startswith("Brak podstawy")
    assert any("nie ma czynnego sterownika" in n for n in ith.notes)
