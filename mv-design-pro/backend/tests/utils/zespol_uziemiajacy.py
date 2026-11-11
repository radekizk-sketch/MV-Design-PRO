"""Zespół uziemiający sieci SN dla sieci testowych (karta ZU-JEDEN-NOSNIK).

Uziemienie punktu neutralnego sieci SN niesie WYŁĄCZNIE punkt neutralny uzwojenia
transformatora — w tym transformatora uziemiającego ZNyn11 zespołu uziemiającego, którego
``hv_neutral`` niesie wyposażenie punktu neutralnego (dławik gaszący, rezystor, oba równolegle
albo jawna deklaracja uziemienia bezpośredniego). Równoważnik sieci na szynach SN nie opisuje ani
typu uziemienia, ani impedancji zerowej (``enm.uziemienie_sekcji``).

Sieci testowe stawiają zespół rekordami, które zapisuje OPERACJA PRODUKTU
``add_zespol_uziemiajacy_sn`` (pozycje katalogu transformatorów ZNyn11, dławików i rezystorów —
Catalog Binding Rule): pomocnik uruchamia operację na modelu pomocniczym z szyną o napięciu
pozycji katalogu i przenosi oba rekordy (transformator i szynę potrzeb własnych 0,4 kV) do sieci
testu pod jawnymi identyfikatorami. Liczby urządzeń pochodzą z katalogu, nie z testu.
"""

from __future__ import annotations

import copy
from typing import Any, Literal

from enm.domain_operations_v2 import add_zespol_uziemiajacy_sn
from enm.models import Bus, EnergyNetworkModel, Transformer
from network_model.catalog.mv_transformer_catalog import TRANSFORMATORY_UZIEMIAJACE_ZNYN11
from network_model.catalog.mv_zespol_uziemiajacy_catalog import (
    get_all_arc_suppression_coil_records,
    get_all_neutral_earthing_resistor_records,
)

WariantTestowy = Literal["rezystor", "dlawik", "dlawik_rezystor", "bezposrednie"]


def _napiecie_katalogu(u_kv: float) -> float:
    """Napięcie pozycji katalogu najbliższe napięciu sieci (katalog typowy: 15 i 20 kV)."""
    return min(
        (float(r["params"]["voltage_hv_kv"]) for r in TRANSFORMATORY_UZIEMIAJACE_ZNYN11),
        key=lambda u: (abs(u - u_kv), u),
    )


def _pozycja(rekordy: list[dict], u_kv: float, ref: str | None) -> str:
    if ref is not None:
        return ref
    return min(rekordy, key=lambda r: (abs(float(r["params"]["u_n_kv"]) - u_kv), r["id"]))["id"]


def ladunek_zespolu(
    wariant: WariantTestowy = "rezystor",
    *,
    u_kv: float = 15.0,
    rezystor_ref: str | None = None,
    dlawik_ref: str | None = None,
    i_nastawy_a: float | None = None,
    awsc: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Ładunek operacji ``add_zespol_uziemiajacy_sn`` dla wariantu (Z.13 dławik, Z.14
    dławik‖rezystor, Z.15 rezystor, uziemienie bezpośrednie) — bez szyny i pola."""
    u_kat = _napiecie_katalogu(u_kv)
    tu = next(
        r["id"]
        for r in TRANSFORMATORY_UZIEMIAJACE_ZNYN11
        if abs(float(r["params"]["voltage_hv_kv"]) - u_kat) < 1e-9
    )
    ladunek: dict[str, Any] = {"catalog_ref": tu}
    if wariant == "bezposrednie":
        ladunek["uziemienie_bezposrednie"] = True
    if wariant in ("dlawik", "dlawik_rezystor"):
        ladunek["dlawik"] = {
            "catalog_ref": _pozycja(get_all_arc_suppression_coil_records(), u_kat, dlawik_ref),
            **({"i_nastawy_a": i_nastawy_a} if i_nastawy_a is not None else {}),
            **({"awsc": awsc} if awsc is not None else {}),
        }
    if wariant in ("rezystor", "dlawik_rezystor"):
        ladunek["rezystor"] = {
            "catalog_ref": _pozycja(
                get_all_neutral_earthing_resistor_records(), u_kat, rezystor_ref
            )
        }
    return ladunek


def zespol_uziemiajacy_rekordy(
    ref_id: str,
    bus_ref: str,
    *,
    wariant: WariantTestowy = "rezystor",
    u_kv: float = 15.0,
    rezystor_ref: str | None = None,
    dlawik_ref: str | None = None,
    i_nastawy_a: float | None = None,
    awsc: dict[str, Any] | None = None,
    r0_ohm: float | None = None,
    x0_ohm: float | None = None,
    name: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """(transformator uziemiający, szyna potrzeb własnych 0,4 kV) — rekordy zapisane przez
    ``add_zespol_uziemiajacy_sn`` na szynie pomocniczej o napięciu pozycji katalogu,
    przeniesione pod identyfikatory ``ref_id`` i ``{ref_id}-nn`` z zaciskiem SN ``bus_ref``.

    ``r0_ohm``/``x0_ohm`` — impedancja zerowa zygzaka nadana przez projektanta (nadpisanie
    pozycji katalogu). Sieć o napięciu spoza katalogu typowego (np. 33 kV przykładu
    IEC 60909-4): napięcie górne transformatora nadpisane jak R0/X0 (dana projektanta)."""
    u_kat = _napiecie_katalogu(u_kv)
    pomocniczy: dict[str, Any] = {
        "header": {"name": "pomocniczy"},
        "buses": [{"ref_id": "szyna-sn", "name": "Szyna SN", "voltage_kv": u_kat}],
        "transformers": [],
        "sources": [],
        "branches": [],
        "loads": [],
        "generators": [],
        "substations": [],
        "bays": [],
    }
    ladunek = ladunek_zespolu(
        wariant,
        u_kv=u_kv,
        rezystor_ref=rezystor_ref,
        dlawik_ref=dlawik_ref,
        i_nastawy_a=i_nastawy_a,
        awsc=awsc,
    )
    odpowiedz = add_zespol_uziemiajacy_sn(
        pomocniczy, {"bus_ref": "szyna-sn", **ladunek, **({"name": name} if name else {})}
    )
    if odpowiedz.get("error"):
        raise AssertionError(f"Operacja zespołu odmówiła: {odpowiedz['error']}")
    migawka = odpowiedz["snapshot"]
    [trafo] = copy.deepcopy(migawka["transformers"])
    [szyna_nn] = [copy.deepcopy(b) for b in migawka["buses"] if b["ref_id"] == trafo["lv_bus_ref"]]
    if name is None:
        trafo["name"] = f"Zespół uziemiający {ref_id}"
    szyna_nn["ref_id"] = f"{ref_id}-nn"
    szyna_nn["name"] = f"Szyna potrzeb własnych 0,4 kV — {trafo['name']}"
    trafo.update({"ref_id": ref_id, "hv_bus_ref": bus_ref, "lv_bus_ref": szyna_nn["ref_id"]})
    if abs(u_kat - u_kv) > 1e-6:
        trafo.update({"uhv_kv": u_kv, "parameter_source": "OVERRIDE"})
    if r0_ohm is not None or x0_ohm is not None:
        trafo.update({"r0_ohm": r0_ohm, "x0_ohm": x0_ohm, "parameter_source": "OVERRIDE"})
    return trafo, szyna_nn


def dodaj_zespol(enm: dict[str, Any], ref_id: str, bus_ref: str, **opcje: Any) -> dict[str, Any]:
    """Dopisz zespół uziemiający (transformator + szyna 0,4 kV) do surowej migawki ENM
    (mutacja w miejscu) i zwróć rekord transformatora."""
    trafo, szyna = zespol_uziemiajacy_rekordy(ref_id, bus_ref, **opcje)
    enm.setdefault("buses", []).append(szyna)
    enm.setdefault("transformers", []).append(trafo)
    return trafo


def z_zespolem(
    enm: EnergyNetworkModel, ref_id: str, bus_ref: str, **opcje: Any
) -> EnergyNetworkModel:
    """Kopia modelu z zespołem uziemiającym (transformator + szyna 0,4 kV)."""
    trafo, szyna = zespol_uziemiajacy_rekordy(ref_id, bus_ref, **opcje)
    return enm.model_copy(
        update={
            "buses": [*enm.buses, Bus.model_validate(szyna)],
            "transformers": [*enm.transformers, Transformer.model_validate(trafo)],
        }
    )


def dodaj_zespol_o_impedancji_zerowej(
    enm: dict[str, Any],
    ref_id: str,
    bus_ref: str,
    *,
    r0_ohm: float,
    x0_ohm: float,
    u_kv: float = 15.0,
) -> dict[str, Any]:
    """Zespół z punktem neutralnym uziemionym BEZPOŚREDNIO i impedancją zerową zygzaka
    nadpisaną przez projektanta (R0, X0 [Ω]) — bocznik zerowy Z_0 = Z_0,zyg.

    Dla sieci testowych, które przed kartą UX-04/POLE-ZU-SKLADOWA-ZEROWA dawały drogę zerową
    impedancją zerową równoważnika na szynach SN: ten sam bocznik na tej samej szynie (liczby
    zwarć doziemnych bez zmian), niesiony przez jedyny nośnik uziemienia sieci SN. Wariant
    poza rozwiązaniami ENEA §16 (walidator zgłasza W-ZU-05) — świadomie: sieć testowa nie
    opisuje praktyki uziemienia, tylko zachowuje drogę zerową przypiętych wyroczni."""
    return dodaj_zespol(
        enm, ref_id, bus_ref, wariant="bezposrednie", u_kv=u_kv, r0_ohm=r0_ohm, x0_ohm=x0_ohm
    )


def impedancja_zerowa_zamiast_z0_rownowaznika(
    *, u_kv: float, sk3_mva: float, rx_ratio: float, z0_z1_ratio: float, c_max: float = 1.1
) -> tuple[float, float]:
    """(R0, X0) [Ω] bocznika równego Z0 = (Z0/Z1)·Z_Q dawnego równoważnika SN
    (Z_Q = c·U_n²/S″_kQ, X_Q = Z_Q/√(1 + (R/X)²), R_Q = (R/X)·X_Q — IEC 60909-0 pkt 6.2,
    scenariusz MAX). W MIN dawne Z0 skalowało się z c — bocznik jest stały, jak każdy element
    fizyczny."""
    z_q = c_max * u_kv**2 / sk3_mva
    x_q = z_q / (1.0 + rx_ratio**2) ** 0.5
    r_q = rx_ratio * x_q
    return z0_z1_ratio * r_q, z0_z1_ratio * x_q


def z_zespolem_o_impedancji_zerowej(
    enm: EnergyNetworkModel,
    ref_id: str,
    bus_ref: str,
    *,
    r0_ohm: float,
    x0_ohm: float,
    u_kv: float = 15.0,
) -> EnergyNetworkModel:
    """Kopia modelu z zespołem ``dodaj_zespol_o_impedancji_zerowej`` (modele typowane)."""
    return z_zespolem(
        enm, ref_id, bus_ref, wariant="bezposrednie", u_kv=u_kv, r0_ohm=r0_ohm, x0_ohm=x0_ohm
    )


def zespoly_migawki(migawka: dict[str, Any]) -> list[dict[str, Any]]:
    """Transformatory uziemiające (zespoły uziemiające) surowej migawki ENM w kolejności
    ``ref_id`` — ten sam predykat co produkt (``jest_transformatorem_uziemiajacym``)."""
    from enm.punkt_neutralny_zespolu import jest_transformatorem_uziemiajacym

    return sorted(
        (
            t
            for t in migawka.get("transformers") or []
            if jest_transformatorem_uziemiajacym(Transformer.model_validate(t))
        ),
        key=lambda t: t["ref_id"],
    )
