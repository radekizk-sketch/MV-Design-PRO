"""t_k aparatu POLA w wymaganiach dowodu doboru aparatury (karta EDYTOR-DELT-SCENARIUSZA-
ZABEZPIECZEN, znalezisko (a)): czas wyłączenia pola zastępuje czas cieplny biegu; pole bez czasu
z nastaw ma wartość roboczą 1 s (IEC 62271-1 §4.7, pakiet 8) jako daną przyjętą dowodu.

I_th wymagany = prąd cieplny przy TYM SAMYM t_k pola (``solvers.wytrzymalosc_cieplna_pola``,
decyzja architekta rozszerzająca (a)): para (I_th, t_k) opisuje jeden stan.

Iloczyn: czas pola {z nastaw, wartość robocza} × t_k biegu {obecny} → wymagania (t_k, I_th)
+ uwaga dowodu + dana przyjęta.
"""

from __future__ import annotations

from application.equipment_proof.generator import EquipmentProofBundle, EquipmentProofGenerator
from application.equipment_proof.types import DeviceRating, EquipmentProofInput
from application.equipment_proof.wymagania_pola import (
    ZRODLO_TK_CZAS_POLA,
    wymagania_z_czasem_pola,
)
from network_model.solvers.wytrzymalosc_cieplna_pola import prad_cieplny_pola

from tests.utils.prad_cieplny import ith_normy

#: I_th biegu spójny z I″k i κ wiersza (realny wiersz: I_th = I″k·√(m(T_k,bieg) + 1)).
ITH_BIEGU_KA = ith_normy(8.0, 1.557, 1.0)
WYMAGANE_BIEGU = {
    "u_kv": 15.0,
    "ikss_ka": 8.0,
    "ip_ka": 20.0,
    "ith_ka": ITH_BIEGU_KA,
    "tk_s": 1.0,
}


def _czas(t_clearing_s: float | None, powod: str, *, roboczy: bool = False) -> dict[str, object]:
    cieplny = prad_cieplny_pola(
        ikss_ka=8.0,
        kappa=1.557,
        ith_biegu_ka=ITH_BIEGU_KA,
        tk_biegu_s=1.0,
        tk_pola_s=t_clearing_s,
        powod_braku_czasu_pl=powod,
    )
    return {
        "prad_cieplny_pola": cieplny.to_dict(),
        "t_clearing_s": t_clearing_s,
        "pole_ref": "pole-1",
        "czlon_nastawczy_s": 0.3 if t_clearing_s is not None else None,
        "czas_wlasny_wylacznika_s": 0.06 if t_clearing_s is not None else None,
        "powod_pl": powod,
        "zrodlo": "wartosc_robocza" if roboczy else "nastawy_pola",
        "podstawa_pl": powod,
        "dana_przyjeta": (
            {
                "nazwa_pl": "czas trwania zwarcia (pole P-1)",
                "wartosc": {"wartosc": 1.0, "jednostka": "s"},
                "jakosc": "ESTIMATED",
                "powod_pl": powod,
            }
            if roboczy
            else None
        ),
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
    # I_th przy t_k pola (większa składowa nieokresowa), nie I_th biegu przy 1 s.
    assert wymagane["ith_ka"] > WYMAGANE_BIEGU["ith_ka"]
    assert wymagane["ith_zrodlo"]["tk_pola_s"] == 0.36
    wynik = _dowod(wymagane)
    (ith,) = (c for c in wynik.result.checks if c.name == "Ith")
    assert any(n.startswith("Czas trwania zwarcia pola:") for n in ith.notes)
    assert any(
        n.startswith("Prąd zastępczy cieplny przy czasie wyłączenia pola") for n in ith.notes
    )
    assert ith.required_value == wymagane["ith_ka"]
    assert any("Czas trwania zwarcia pola:" in w for w in wynik.proof_document.summary.warnings)


def test_pole_bez_nastaw_ma_czas_roboczy_1_s_jako_dana_przyjeta() -> None:
    """Pole bez zabezpieczenia: t_k = 1 s wg IEC 62271-1 §4.7 (wartość robocza), I_th przy
    tym czasie, sprawdzenie I_th rozstrzygnięte, a czas stoi w danych przyjętych dowodu."""
    podstawa = (
        "wartość robocza 1 s — znamionowy czas trwania zwarcia IEC 62271-1 §4.7; "
        "pole nie ma zabezpieczenia"
    )
    wymagane = wymagania_z_czasem_pola(WYMAGANE_BIEGU, _czas(1.0, podstawa, roboczy=True))
    assert wymagane["tk_s"] == 1.0
    assert wymagane["tk_zrodlo"]["zrodlo_czasu"] == "wartosc_robocza"
    wynik = _dowod(wymagane)
    (ith,) = (c for c in wynik.result.checks if c.name == "Ith")
    assert not ith.message_pl.startswith("Brak podstawy")
    assert any("IEC 62271-1" in n for n in ith.notes)
    assert any(
        d.wartosc is not None and d.wartosc.wartosc == 1.0 and d.wartosc.jednostka == "s"
        for d in wynik.result.dane_przyjete
    )
