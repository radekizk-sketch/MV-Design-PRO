"""Zespół uziemiający sieci SN dla sieci testowych (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA).

Od tej karty uziemienie punktu neutralnego sieci SN niesie WYŁĄCZNIE zespół uziemiający sekcji
(albo uziemiony punkt neutralny uzwojenia transformatora) — równoważnik sieci na szynach SN nie
opisuje ani typu uziemienia, ani impedancji zerowej (``enm.uziemienie_sekcji``). Sieci testowe,
które liczą zwarcie doziemne w sieci SN, stawiają więc zespół na szynie sekcji — tym samym
rekordem co operacja ``add_zespol_uziemiajacy_sn`` (pozycje katalogu
``mv_zespol_uziemiajacy_catalog``, Catalog Binding Rule), bez fabrykowania liczb poza katalogiem.
"""

from __future__ import annotations

from typing import Any, Literal

from enm.domain_operations_v2 import (
    PRZESTRZEN_DLAWIKA_GASZACEGO,
    PRZESTRZEN_REZYSTORA_UZIEMIAJACEGO,
    PRZESTRZEN_TRANSFORMATORA_UZIEMIAJACEGO,
)
from network_model.catalog.mv_zespol_uziemiajacy_catalog import (
    get_all_arc_suppression_coil_records,
    get_all_earthing_transformer_records,
    get_all_neutral_earthing_resistor_records,
)

WariantTestowy = Literal["rezystor", "dlawik", "dlawik_rezystor", "bezposrednie"]


def _pozycja(rekordy: list[dict], u_kv: float, ref: str | None) -> dict[str, Any]:
    if ref is not None:
        return next(r for r in rekordy if r["id"] == ref)
    # Najbliższa pozycja napięciem (katalog typowy ma 15 i 20 kV) — rekord sieci o innym
    # napięciu dostaje jawne nadpisanie U_n w ``zespol_o_impedancji_zerowej``.
    return min(rekordy, key=lambda r: (abs(float(r["params"]["u_n_kv"]) - u_kv), r["id"]))


def _parametry(rekord: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in rekord["params"].items() if v is not None}


def zespol_uziemiajacy_rekord(
    ref_id: str,
    bus_ref: str,
    *,
    wariant: WariantTestowy = "rezystor",
    u_kv: float = 15.0,
    rezystor_ref: str | None = None,
    dlawik_ref: str | None = None,
    i_nastawy_a: float | None = None,
    bay_ref: str | None = None,
) -> dict[str, Any]:
    """Rekord ``zespoly_uziemiajace`` ENM: transformator uziemiający ZNyn11 z katalogu napięcia
    sieci i element punktu neutralnego wybranego wariantu (Z.13 dławik, Z.14 dławik‖rezystor,
    Z.15 rezystor, uziemienie bezpośrednie). Rezystor domyślny: pierwsza pozycja katalogu na
    napięcie sieci (200 A); dławik: zakres 40–400 A z nastawą podaną albo roboczą."""
    tu = _pozycja(get_all_earthing_transformer_records(), u_kv, None)
    rekord: dict[str, Any] = {
        "ref_id": ref_id,
        "name": f"Zespół uziemiający {ref_id}",
        "bus_ref": bus_ref,
        "bay_ref": bay_ref,
        "catalog_ref": tu["id"],
        "catalog_namespace": PRZESTRZEN_TRANSFORMATORA_UZIEMIAJACEGO,
        "parameter_source": "CATALOG",
        "materialized_params": _parametry(tu),
        "uziemienie_bezposrednie": wariant == "bezposrednie",
        "tags": [],
        "meta": {},
    }
    if wariant in ("dlawik", "dlawik_rezystor"):
        dl = _pozycja(get_all_arc_suppression_coil_records(), u_kv, dlawik_ref)
        rekord["dlawik"] = {
            "catalog_ref": dl["id"],
            "catalog_namespace": PRZESTRZEN_DLAWIKA_GASZACEGO,
            "materialized_params": _parametry(dl),
            **({"i_nastawy_a": i_nastawy_a} if i_nastawy_a is not None else {}),
        }
    if wariant in ("rezystor", "dlawik_rezystor"):
        rz = _pozycja(get_all_neutral_earthing_resistor_records(), u_kv, rezystor_ref)
        rekord["rezystor"] = {
            "catalog_ref": rz["id"],
            "catalog_namespace": PRZESTRZEN_REZYSTORA_UZIEMIAJACEGO,
            "materialized_params": _parametry(rz),
        }
    return rekord


def zespol_o_impedancji_zerowej(
    ref_id: str, bus_ref: str, *, r0_ohm: float, x0_ohm: float, u_kv: float = 15.0
) -> dict[str, Any]:
    """Zespół z punktem neutralnym uziemionym BEZPOŚREDNIO i impedancją zerową transformatora
    uziemiającego nadpisaną przez projektanta (R0, X0 [Ω]) — bocznik zerowy Z_0,ZU = Z_0,TU.

    Dla sieci testowych, które przed kartą UX-04/POLE-ZU-SKLADOWA-ZEROWA dawały drogę zerową
    impedancją zerową równoważnika na szynach SN: ten sam bocznik na tej samej szynie (liczby
    zwarć doziemnych bez zmian), ale niesiony przez jedyny nośnik uziemienia sieci SN. Wariant
    poza rozwiązaniami ENEA §16 (walidator zgłasza W-ZU-05) — świadomie: sieć testowa nie
    opisuje praktyki uziemienia, tylko zachowuje drogę zerową przypiętych wyroczni."""
    rekord = zespol_uziemiajacy_rekord(ref_id, bus_ref, wariant="bezposrednie", u_kv=u_kv)
    rekord.update({"r0_ohm": r0_ohm, "x0_ohm": x0_ohm, "parameter_source": "OVERRIDE"})
    if abs(float(rekord["materialized_params"]["u_n_kv"]) - u_kv) > 1e-6:
        # Sieć o napięciu spoza katalogu typowego (np. 33 kV przykładu IEC 60909-4): napięcie
        # znamionowe transformatora uziemiającego nadpisane jak R0/X0 (dana projektanta).
        rekord["u_n_kv"] = u_kv
    return rekord


def zespol_zamiast_z0_rownowaznika(
    ref_id: str,
    bus_ref: str,
    *,
    u_kv: float,
    sk3_mva: float,
    rx_ratio: float,
    z0_z1_ratio: float,
    c_max: float = 1.1,
) -> dict[str, Any]:
    """Zespół, którego bocznik zerowy równa się Z0 = (Z0/Z1)·Z_Q dawnego równoważnika SN
    (Z_Q = c·U_n²/S″_kQ, X_Q = Z_Q/√(1 + (R/X)²), R_Q = (R/X)·X_Q — IEC 60909-0 pkt 6.2,
    scenariusz MAX). Sieci testowe z Z0/Z1 równoważnika na szynach SN zachowują tę samą drogę
    zerową w scenariuszu MAX (w MIN dawne Z0 skalowało się z c — teraz bocznik jest stały, jak
    każdy element fizyczny)."""
    z_q = c_max * u_kv**2 / sk3_mva
    x_q = z_q / (1.0 + rx_ratio**2) ** 0.5
    r_q = rx_ratio * x_q
    return zespol_o_impedancji_zerowej(
        ref_id, bus_ref, r0_ohm=z0_z1_ratio * r_q, x0_ohm=z0_z1_ratio * x_q, u_kv=u_kv
    )
