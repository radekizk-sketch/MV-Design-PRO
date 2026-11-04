"""Scena zwarć doziemnych SN — GPZ z polami liniowymi, polem pomiaru napięcia Z.17 i stacją
z zabezpieczeniem odejścia, zbudowana WYŁĄCZNIE operacjami domenowymi ścieżki projektanta
(karta EWALUATORY-ZIEMNOZWARCIOWE).

KSZTAŁT. Równoważnik GPZ na szynach SN 15 kV (Sk″ 250 MVA, katalog), jedna sekcja, trzy pola
liniowe w wykonaniu ENEA Z.10 (przekładnik Ferrantiego, 51N, a po powiązaniu źródła 3U₀ z polem
pomiaru napięcia Z.17 także 67N). Pole 1 zasila kabel 5 km do stacji ST1, a w stacji ST1 jest
wyłącznik odejścia z zabezpieczeniem i kabel 3 km dalej (strefa zagnieżdżona — stopniowanie
i „zwarcie na sąsiedniej linii"); pole 2 — kabel 10 km, pole 3 — kabel 15 km.

SPOSÓB PRACY PUNKTU NEUTRALNEGO (``Source.neutral_grounding`` + Z0 równoważnika, W5-A):

* ``IZOLOWANY`` — brak bocznika zerowego źródła;
* ``KOMPENSOWANY`` — dławik X_N = 80 Ω (I_L ≈ 108 A, przekompensowanie wobec I_C ≈ 95 A),
  Z0 = 3·jX_N = j240 Ω, rezystancja strat R_N = 6 Ω (Z0 = 18 + j240 Ω);
* ``KOMPENSOWANY_AWSC`` — jak wyżej + rezystor wymuszania AWSC 25 A;
* ``REZYSTOR`` — rezystor R_N = 17,3 Ω (I_R ≈ 500 A), Z0 = 3·R_N.

Nośnik sceny: dane wejściowe projektu, liczby dobrane tak, by ręczna sonda była czytelna
(B′0 kabla z katalogu 122,5 µS/km, łączna długość 33 km).
"""

from __future__ import annotations

from typing import Any, Literal

from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader

from tests.reference_networks.scena_geometrii_stacji import dodaj_pole_pomiaru_napiecia_z17
from tests.reference_networks.sceny_zajetosci_pol import APARAT, KABEL, ZRODLO, ok, op

SposobPracy = Literal["IZOLOWANY", "KOMPENSOWANY", "KOMPENSOWANY_AWSC", "REZYSTOR"]
SPOSOBY_PRACY: tuple[SposobPracy, ...] = (
    "IZOLOWANY",
    "KOMPENSOWANY",
    "KOMPENSOWANY_AWSC",
    "REZYSTOR",
)

SZABLON_Z10 = "bay_template_gpz_line_enea_z10_trojpolozeniowy"
PRZEKAZNIK = "REF-OC-200"
PRZEKLADNIK_FAZOWY = "ct_600_5_5p20_15va_schneider"

X_DLAWIKA_OHM = 80.0
R_DLAWIKA_OHM = 6.0
PRAD_AWSC_A = 25.0
R_REZYSTORA_OHM = 17.3
DLUGOSCI_POL_M: tuple[int, ...] = (5000, 10000, 15000)
DLUGOSC_ODEJSCIA_ST1_M = 3000


def _uziemienie(sposob: SposobPracy) -> dict[str, Any]:
    if sposob == "IZOLOWANY":
        return {"grounding": {"type": "isolated"}}
    if sposob == "REZYSTOR":
        return {
            "grounding": {"type": "resistor_grounded", "r_ohm": R_REZYSTORA_OHM},
            "zero_sequence": {"enabled": True, "r0_ohm": 3 * R_REZYSTORA_OHM, "x0_ohm": 0.0},
        }
    uziemienie: dict[str, Any] = {
        "type": "petersen_coil",
        "r_ohm": R_DLAWIKA_OHM,
        "x_ohm": X_DLAWIKA_OHM,
    }
    if sposob == "KOMPENSOWANY_AWSC":
        uziemienie["awsc_prad_wymuszenia_a"] = PRAD_AWSC_A
    return {
        "grounding": uziemienie,
        "zero_sequence": {
            "enabled": True,
            "r0_ohm": 3 * R_DLAWIKA_OHM,
            "x0_ohm": 3 * X_DLAWIKA_OHM,
        },
    }


def pola_liniowe(enm: dict[str, Any]) -> list[dict[str, Any]]:
    return sorted(
        (b for b in enm["bays"] if "gpz_line_field" in (b.get("tags") or [])),
        key=lambda b: b["ref_id"],
    )


def sterownik_pola(enm: dict[str, Any], pole_ref: str) -> dict[str, Any]:
    return next(p for p in enm["protection_assignments"] if p.get("bay_ref") == pole_ref)


def _odcinek_z_pola(enm: dict[str, Any], pole: dict[str, Any]) -> dict[str, Any]:
    return next(
        g
        for g in enm["branches"]
        if g["type"] == "cable" and g["from_bus_ref"] == pole["terminal_bus_ref"]
    )


def zbuduj_scene(sposob: SposobPracy) -> dict[str, Any]:
    """Model sceny (migawka JSON) bez nastaw funkcji ziemnozwarciowych."""
    pusty = EnergyNetworkModel(header=ENMHeader(name="DOZIEMIENIE-SN", defaults=ENMDefaults()))
    enm = ok(
        op(
            pusty.model_dump(mode="json"),
            "add_grid_source_sn",
            {
                "voltage_kv": 15.0,
                "sk3_mva": 250.0,
                "catalog_ref": ZRODLO,
                "sections_count": 1,
                "line_fields_per_section": len(DLUGOSCI_POL_M),
                "gpz_line_field_apparatus": {"catalog_ref": APARAT},
                **_uziemienie(sposob),
            },
        )
    )
    sekcja = next(b["gpz_section_id"] for b in enm["bays"] if b.get("gpz_section_id"))
    enm, vt_u0 = dodaj_pole_pomiaru_napiecia_z17(enm, sekcja)
    for numer, (pole, dlugosc) in enumerate(
        zip(pola_liniowe(enm), DLUGOSCI_POL_M, strict=True), start=1
    ):
        enm = ok(
            op(
                enm,
                "set_bay_equipment",
                {
                    "bay_ref": pole["ref_id"],
                    "mode": "szablon",
                    "bay_template_ref": SZABLON_Z10,
                    "zrodlo_u0_ref": vt_u0,
                },
            )
        )
        enm = ok(
            op(
                enm,
                "continue_trunk_segment_sn",
                {
                    "field_ref": pole["ref_id"],
                    "segment": {
                        "rodzaj": "KABEL",
                        "dlugosc_m": dlugosc,
                        "name": f"Kabel pola {numer}",
                        "catalog_ref": KABEL,
                    },
                },
            )
        )
    return enm


def dodaj_odejscie_stacji(enm: dict[str, Any]) -> tuple[dict[str, Any], str]:
    """Na końcu kabla pola 1 — kabel 3 km dalej i wyłącznik odejścia (2 % długości) z
    przekładnikiem fazowym (układ Holmgreena dla 3I0) i sterownikiem z 51N. Zwraca model
    i ``ref`` sterownika odejścia."""
    pole1 = pola_liniowe(enm)[0]
    koniec = _odcinek_z_pola(enm, pole1)["to_bus_ref"]
    przed = {g["ref_id"] for g in enm["branches"]}
    enm = ok(
        op(
            enm,
            "continue_trunk_segment_sn",
            {
                "from_terminal_id": koniec,
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": DLUGOSC_ODEJSCIA_ST1_M,
                    "name": "Kabel odejścia ST1",
                    "catalog_ref": KABEL,
                },
            },
        )
    )
    odcinek = next(
        g["ref_id"] for g in enm["branches"] if g["ref_id"] not in przed and g["type"] == "cable"
    )
    przed = {g["ref_id"] for g in enm["branches"]}
    enm = ok(
        op(
            enm,
            "insert_section_switch_sn",
            {
                "segment_id": odcinek,
                "insert_at": {"mode": "RATIO", "value": 0.02},
                "switch_type": "WYLACZNIK",
                "catalog_ref": APARAT,
                "switch_name": "Wyłącznik odejścia ST1",
            },
        )
    )
    wylacznik = next(
        g["ref_id"] for g in enm["branches"] if g["ref_id"] not in przed and g["type"] == "breaker"
    )
    wynik_ct = op(
        enm,
        "add_ct",
        {
            "breaker_ref": wylacznik,
            "catalog_ref": PRZEKLADNIK_FAZOWY,
            "ratio_primary_a": 600.0,
            "ratio_secondary_a": 5.0,
            "accuracy_class": "5P20",
            "burden_va": 15.0,
            "name": "Przekładnik odejścia ST1",
        },
    )
    enm = ok(wynik_ct)
    wynik = op(
        enm,
        "add_relay",
        {
            "breaker_ref": wylacznik,
            "wejscia": {"ct_ref": wynik_ct["selection_hint"]["element_id"]},
            "funkcje": ["51N"],
            "catalog_ref": PRZEKAZNIK,
            "name": "Zabezpieczenie odejścia ST1",
        },
    )
    enm = ok(wynik)
    return enm, str(wynik["selection_hint"]["element_id"])


def ustaw_funkcje(
    enm: dict[str, Any],
    sterownik_ref: str,
    nastawy: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Zestaw funkcji sterownika (kody = klucze ``nastawy``) i ich nastawy grupy 1 — dwie
    operacje ścieżki projektanta (`add_relay` z listą funkcji, `update_protection_settings`)."""
    sterownik = next(p for p in enm["protection_assignments"] if p["ref_id"] == sterownik_ref)
    kody = sorted({f["kod"] for f in sterownik["funkcje"]} | set(nastawy))
    zadanie: dict[str, Any] = {"funkcje": kody, "catalog_ref": PRZEKAZNIK}
    if sterownik.get("bay_ref"):
        zadanie["bay_ref"] = sterownik["bay_ref"]
    else:
        zadanie["breaker_ref"] = (sterownik.get("meta") or {})["breaker_ref"]
    enm = ok(op(enm, "add_relay", zadanie))
    return ok(
        op(
            enm,
            "update_protection_settings",
            {"protection_ref": sterownik_ref, "grupa": 1, "nastawy": nastawy},
        )
    )


NASTAWY_51N_POLA: dict[str, Any] = {
    "prog": 5.0,
    "jednostka_progu": "A_PIERWOTNY",
    "krzywa": "DT",
    "zwloka_s": 0.8,
}
NASTAWY_51N_ODEJSCIA: dict[str, Any] = {**NASTAWY_51N_POLA, "zwloka_s": 0.3}


def nastawy_67n(sposob: SposobPracy) -> dict[str, Any]:
    """67N pola: kryterium sin φ (90°) w sieci izolowanej, cos φ (0°) w pozostałych."""
    return {
        "prog": 2.0,
        "jednostka_progu": "A_PIERWOTNY",
        "krzywa": "DT",
        "zwloka_s": 0.5,
        "kierunek": "DO_LINII",
        "kat_charakterystyczny_deg": 90.0 if sposob == "IZOLOWANY" else 0.0,
    }


def scena_z_nastawami(sposob: SposobPracy) -> dict[str, Any]:
    """Scena z odejściem ST1, 51N i 67N w polach GPZ oraz 51N w odejściu ST1."""
    enm = zbuduj_scene(sposob)
    enm, st1 = dodaj_odejscie_stacji(enm)
    for pole in pola_liniowe(enm):
        enm = ustaw_funkcje(
            enm,
            sterownik_pola(enm, pole["ref_id"])["ref_id"],
            {"51N": NASTAWY_51N_POLA, "67N": nastawy_67n(sposob)},
        )
    return ustaw_funkcje(enm, st1, {"51N": NASTAWY_51N_ODEJSCIA})


def ustaw_uziom_stacji(
    enm: dict[str, Any],
    *,
    rezystancja_ohm: float | None,
    wspolczynnik_r: float | None,
) -> dict[str, Any]:
    """Dane uziomu stacji GPZ operacją `update_element_parameters` (ścieżka projektanta)."""
    stacja = next(s for s in enm["substations"] if s.get("gpz_sections"))
    parametry: dict[str, Any] = {}
    if rezystancja_ohm is not None:
        parametry["uziom_rezystancja_ohm"] = rezystancja_ohm
    if wspolczynnik_r is not None:
        parametry["uziom_wspolczynnik_redukcji"] = wspolczynnik_r
    if not parametry:
        return enm
    return ok(
        op(
            enm,
            "update_element_parameters",
            {"element_ref": stacja["ref_id"], "parameters": parametry},
        )
    )
