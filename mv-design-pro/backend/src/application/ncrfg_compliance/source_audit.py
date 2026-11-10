"""P0 audyt źródeł NC RfG — wskazuje realne blokery formalnego PASS.

Nie uruchamia solvera, nie zastępuje Werdyktu i nie dopisuje wartości
do WOS/IRiESD/PTPiREE. Odczytuje faktyczny stan profilu i lokalnego wykazu.
"""
from __future__ import annotations

from typing import Any

from catalog.profiles.nc_rfg import load_nc_rfg_profile

from .certificate_review import ocen_stan_rejestru
from .regulatory_effectivity import OcenaPodstawRegulacyjnych


def audyt_zrodel(operator_id: str) -> dict[str, Any]:
    profile = load_nc_rfg_profile(operator_id)
    layers = {
        layer.warstwa: layer for layer in profile.warstwy
    }
    wos = layers["WOS"]
    osd = layers["OSD"]
    wipwc = layers["WIPWC"]
    rejestr = ocen_stan_rejestru()
    blokery: list[dict[str, str]] = []

    def problem(kod: str, opis: str) -> None:
        blokery.append({"kod": kod, "opis_pl": opis})

    if wos.wydanie != "2025":
        problem(
            "WOS_2025_NIE_W_PROFILU",
            f"Profil obejmuje tylko WOS {wos.wydanie or 'nieustalony'}; "
            "projekty objęte WOS2025 wymagają osobnego, zatwierdzonego wydania."
        )
    if wos.status != "ZWERYFIKOWANE":
        problem("WOS_NIEZWERYFIKOWANE", "WOS nie ma zatwierdzonej kompletnej podstawy.")
    if profile.kryteria_akceptacji.zrodlo.status != "ZWERYFIKOWANE":
        problem(
            "PROGI_TESTOW_NIEZWERYFIKOWANE",
            "Kryteria testów T01–T20 pochodzą z niesprawdzonych względem "
            "programów ramowych danych legacy.",
        )
    if profile.program_badan.status != "ZWERYFIKOWANE" or not profile.program_badan.scenariusze:
        problem(
            "PROGRAM_TESTOW_NIEKOMPLETNY",
            "Brak kompletnego zatwierdzonego programu scenariuszy PTPiREE.",
        )
    if osd.status != "ZWERYFIKOWANE":
        problem(
            "OSD_ZRODLO_NIEZWERYFIKOWANE",
            "Dokument IRiESD/warunki operatora bez zatwierdzonej pełnej edycji.",
        )
    if profile.bank_nastaw.status != "ZWERYFIKOWANE":
        problem("BANK_NASTAW_NIEUSTALONY", "Brak zweryfikowanego Banku Nastaw.")
    if rejestr.stan != "AKTUALNY_WOBEC_OBSERWACJI":
        problem(
            "WYKAZ_PTPIREE_NIEAKTUALNY",
            "Snapshot urządzeń PTPiREE nie dorównuje ostatniej znanej publikacji.",
        )
    if wipwc.status != "ZWERYFIKOWANE":
        problem(
            "WIPWC_POKRYCIE_NIEZWERYFIKOWANE",
            "Reguła pokrycia wymagań certyfikatem nie została zatwierdzona źródłowo.",
        )
    return {
        "operator_id": operator_id,
        "profil": profile.wersja_profilu,
        "warstwy": {
            kind: {
                "wydanie": layer.wydanie,
                "status": layer.status,
                "obowiazuje_od": (
                    layer.obowiazuje_od.isoformat() if layer.obowiazuje_od else None
                ),
            }
            for kind, layer in layers.items()
        },
        "ptpiree_rejestr": rejestr.model_dump(mode="json"),
        "blokery": blokery,
        "gotowosc_do_formalnego_potwierdzenia_zgodnosci": not blokery,
        "uwaga": (
            "Brak blokerów oznacza wyłącznie kompletność rejestru podstaw, "
            "nie automatyczną zgodność urządzenia, testów lub wydanie decyzji OSD."
        ),
    }


def blokery_aktywacji_podstaw(
    operator_id: str,
    ocena: OcenaPodstawRegulacyjnych,
) -> tuple[str, ...]:
    """Sprawdzenie, czy wersja skuteczna jest już w realnym profilu solvera."""
    profile = load_nc_rfg_profile(operator_id)
    reasons = [
        x["kod"] for x in audyt_zrodel(operator_id)["blokery"]
    ]
    selected = ocena.wos.wydanie
    if selected is None:
        reasons.append("WOS_STOSOWALNOSC_NIEUSTALONA")
    else:
        current = next(
            layer for layer in profile.warstwy if layer.warstwa == "WOS"
        ).wydanie
        if selected != current:
            reasons.append("WOS_WYDANIE_NIEZGODNE_Z_AKTYWNYM_PROFILEM")
    if ocena.ptpiree.wydanie is None:
        reasons.append("PTPIREE_WERSJA_NIEUSTALONA")
    return tuple(dict.fromkeys(reasons))
