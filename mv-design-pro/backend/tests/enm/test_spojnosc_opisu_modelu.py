"""Spójność opisu modelu — warunki dawnego walidatora semantycznego w JEDNYM walidatorze.

DLACZEGO (karta GPZ-H5-APARATURA, defekt zgłoszony przez integrację linii H5). Post-hook
operacji domenowej `semantic_issues` (`network_model/validation/semantic_rules.py`) był
DRUGĄ ścieżką walidacji obok gotowości odpowiedzi i czytał klucze spoza kontraktu ENM:
odbiór `p_kw`/`q_kvar` (kontrakt `Load.p_mw`/`q_mvar`), więc KAŻDY odbiór dostawał „P=0 kW
i Q=0 kvar", a źródło `voltage_kv` (pola nie ma w kontrakcie `Source`), więc reguła napięcia
źródła była martwa. Testy tamtej ścieżki budowały słowniki z kluczami `p_kw` — fikstura
syntetyczna maskowała defekt. Tu każdy warunek idzie przez model kontraktu ENM i przez
odpowiedź operacji domenowej (realna ścieżka projektanta).

ILOCZYN CECH:
* W013 odbiór: P ∈ {0, ≠0} × Q ∈ {0, ≠0} × model {pq, zip} × ścieżka {walidator, operacja
  `add_load_sn` + `update_element_parameters`};
* E011 odcinek: rodzaj {kabel, linia} × długość {< 0, 0, > 0};
* E012 transformator: napięcia szyn {poprawne 15/0,4, odwrócone 0,4/15, odwrócone w jednym
  paśmie 15/20, równe 15/15};
* W011 wytwórca: rola pola (każda z kontraktu `Bay.bay_role`) × wskazanie pola {jest, brak,
  pole nieistniejące};
* W012 źródło: napięcie odniesienia {brak, równe, w zaokrągleniu, inne} × strona {SN, 110 kV
  z modelu H5 zbudowanego operacjami};
* kontrakt odpowiedzi: brak klucza `semantic_issues` w sukcesie i w odmowie; kody płyną
  w `readiness` z kanonem (W013 → `load.power_zero`, E011 → `trunk.segment_length_invalid`).
"""

from __future__ import annotations

import typing
from typing import Any

import pytest
from domain.canonical_operations import READINESS_CODES
from domain.readiness_bridge import KODY_WALIDATORA_BEZ_KANONU, ODWZOROWANIE_WALIDATOR_NA_KANON
from enm.domain_operations import execute_domain_operation
from enm.models import (
    Bay,
    Bus,
    EnergyNetworkModel,
    Generator,
    Load,
    OverheadLine,
    Substation,
)
from enm.pola import ROLE_POLA_ZRODLA
from enm.validator import (
    KOD_DLUGOSC_ODCINKA_NIEDODATNIA,
    KOD_NAPIECIE_ODNIESIENIA_ZRODLA_INNE_NIZ_SZYNY,
    KOD_ODBIOR_BEZ_MOCY,
    KOD_POLARYZACJA_TRANSFORMATORA_ODWROCONA,
    KOD_WYTWORCA_W_POLU_BEZ_ZRODLA,
    ENMValidator,
)

from tests.enm.test_canonical_sc_c_per_pasmo import N1, N2, _build_mv_lv_enm
from tests.reference_networks.gpz_h5 import refy, zbuduj_h5

KODY = (
    KOD_DLUGOSC_ODCINKA_NIEDODATNIA,
    KOD_POLARYZACJA_TRANSFORMATORA_ODWROCONA,
    KOD_WYTWORCA_W_POLU_BEZ_ZRODLA,
    KOD_NAPIECIE_ODNIESIENIA_ZRODLA_INNE_NIZ_SZYNY,
    KOD_ODBIOR_BEZ_MOCY,
)


def _zgloszenia(model: EnergyNetworkModel, kod: str) -> list[Any]:
    return [i for i in ENMValidator().validate(model).issues if i.code == kod]


def _z_odbiorem(p_mw: float, q_mvar: float, model_odbioru: str = "pq") -> EnergyNetworkModel:
    model = _build_mv_lv_enm("Sieć")
    model.loads.append(
        Load(
            ref_id="LOAD_1",
            name="Odbiór warsztatu",
            bus_ref=N2,
            p_mw=p_mw,
            q_mvar=q_mvar,
            model=model_odbioru,  # type: ignore[arg-type]
        )
    )
    return model


def test_siec_poprawna_nie_ma_zadnego_kodu_spojnosci() -> None:
    model = _z_odbiorem(0.2, 0.05)
    assert [i.code for i in ENMValidator().validate(model).issues if i.code in KODY] == []


# ---------------------------------------------------------------------------
# W013 — odbiór bez mocy
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("model_odbioru", ["pq", "zip"])
@pytest.mark.parametrize(
    ("p_mw", "q_mvar", "ostrzezenie"),
    [(0.0, 0.0, True), (0.2, 0.0, False), (0.0, 0.05, False), (0.2, 0.05, False)],
)
def test_w013_tylko_odbior_bez_mocy_czynnej_i_biernej(
    p_mw: float, q_mvar: float, ostrzezenie: bool, model_odbioru: str
) -> None:
    zgloszenia = _zgloszenia(_z_odbiorem(p_mw, q_mvar, model_odbioru), KOD_ODBIOR_BEZ_MOCY)
    if not ostrzezenie:
        # Dawny walidator czytał `p_kw`/`q_kvar` — ten przypadek dawał fałszywe ostrzeżenie.
        assert zgloszenia == []
        return
    (zgloszenie,) = zgloszenia
    assert zgloszenie.severity == "IMPORTANT"
    assert zgloszenie.element_refs == ["LOAD_1"]
    assert "Odbiór warsztatu" in zgloszenie.message_pl
    assert "P = 0 MW i Q = 0 Mvar" in zgloszenie.message_pl
    assert "LOAD_1" not in zgloszenie.message_pl
    assert zgloszenie.fix_action is not None
    assert zgloszenie.fix_action.payload_hint == {"required": "p_mw"}


def test_w013_sciezka_operacji_odbior_z_moca_nie_ostrzega() -> None:
    """Realna ścieżka: model H5 z odbiorami dodanymi operacją `add_load_sn` — żadnego W013
    (dawny post-hook ostrzegał „P=0 kW i Q=0 kvar" dla każdego z nich)."""
    enm = zbuduj_h5(odbiory=True)
    assert len(enm["loads"]) == 2
    wynik = execute_domain_operation(enm, "refresh_snapshot", {})
    kody = [z["code"] for z in [*wynik["readiness"]["blockers"], *wynik["readiness"]["warnings"]]]
    assert KOD_ODBIOR_BEZ_MOCY not in kody, kody
    assert "semantic_issues" not in wynik


def test_w013_sciezka_operacji_odbior_bez_mocy_i_naprawa() -> None:
    enm = zbuduj_h5(odbiory=False)
    szyna = refy(enm).szyna_sn_a
    wynik = execute_domain_operation(
        enm, "add_load_sn", {"bus_ref": szyna, "p_mw": 0.0, "q_mvar": 0.0, "load_name": "Rezerwa"}
    )
    assert wynik.get("error") is None, wynik.get("error")
    (odbior,) = wynik["snapshot"]["loads"]
    (ostrzezenie,) = (z for z in wynik["readiness"]["warnings"] if z["code"] == KOD_ODBIOR_BEZ_MOCY)
    assert ostrzezenie["element_ref"] == odbior["ref_id"]
    assert ostrzezenie["canonical_code"] == "load.power_zero"
    assert "semantic_issues" not in wynik

    naprawa = execute_domain_operation(
        wynik["snapshot"],
        "update_element_parameters",
        {"element_ref": odbior["ref_id"], "parameters": {"p_mw": 0.4, "q_mvar": 0.1}},
    )
    assert naprawa.get("error") is None, naprawa.get("error")
    kody = [z["code"] for z in naprawa["readiness"]["warnings"]]
    assert KOD_ODBIOR_BEZ_MOCY not in kody, kody


# ---------------------------------------------------------------------------
# E011 — długość odcinka
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("rodzaj", ["cable", "line_overhead"])
@pytest.mark.parametrize(("dlugosc_km", "blokada"), [(-0.5, True), (0.0, True), (0.3, False)])
def test_e011_odcinek_o_dlugosci_niedodatniej_blokuje(
    rodzaj: str, dlugosc_km: float, blokada: bool
) -> None:
    model = _build_mv_lv_enm("Sieć")
    kabel = model.branches[0]
    if rodzaj == "line_overhead":
        model.branches[0] = OverheadLine(
            **{**kabel.model_dump(exclude={"type"}), "name": "Linia napowietrzna SN"}
        )
    model.branches[0] = model.branches[0].model_copy(update={"length_km": dlugosc_km})
    zgloszenia = _zgloszenia(model, KOD_DLUGOSC_ODCINKA_NIEDODATNIA)
    if not blokada:
        assert zgloszenia == []
        return
    (zgloszenie,) = zgloszenia
    assert zgloszenie.severity == "BLOCKER"
    assert zgloszenie.element_refs == ["C_SN"]
    assert f"{dlugosc_km:g} km" in zgloszenie.message_pl
    assert "C_SN" not in zgloszenie.message_pl
    assert ENMValidator().readiness(ENMValidator().validate(model)).ready is False


# ---------------------------------------------------------------------------
# E012 — polaryzacja transformatora
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("napiecie_g_kv", "napiecie_d_kv", "blokada"),
    [(15.0, 0.4, False), (0.4, 15.0, True), (15.0, 20.0, True), (15.0, 15.0, False)],
)
def test_e012_odwrocona_polaryzacja_transformatora(
    napiecie_g_kv: float, napiecie_d_kv: float, blokada: bool
) -> None:
    model = _build_mv_lv_enm("Sieć")
    szyny = {N1: napiecie_g_kv, N2: napiecie_d_kv}
    model.buses = [
        b.model_copy(update={"voltage_kv": szyny[b.ref_id]}) if b.ref_id in szyny else b
        for b in model.buses
    ]
    zgloszenia = _zgloszenia(model, KOD_POLARYZACJA_TRANSFORMATORA_ODWROCONA)
    if not blokada:
        assert zgloszenia == []
        return
    (zgloszenie,) = zgloszenia
    assert zgloszenie.severity == "BLOCKER"
    assert zgloszenie.element_refs == ["TR1", N1, N2]
    assert "Szyna SN stacji" in zgloszenie.message_pl and "Szyna nN" in zgloszenie.message_pl
    assert f"{napiecie_g_kv:g} kV" in zgloszenie.message_pl


# ---------------------------------------------------------------------------
# W011 — wytwórca w polu bez źródła
# ---------------------------------------------------------------------------

ROLE_POLA: tuple[str, ...] = typing.get_args(Bay.model_fields["bay_role"].annotation)


def test_role_pola_zrodla_naleza_do_kontraktu() -> None:
    assert ROLE_POLA_ZRODLA < set(ROLE_POLA), ROLE_POLA_ZRODLA


def _z_wytworca(rola: str | None, *, pole_istnieje: bool = True) -> EnergyNetworkModel:
    model = _build_mv_lv_enm("Sieć")
    model.substations = [
        Substation(ref_id="ST_1", name="Stacja 1", station_type="mv_lv", bus_refs=[N1])
    ]
    if rola is not None and pole_istnieje:
        model.bays.append(
            Bay(
                ref_id="BAY_1",
                name="Pole 1",
                bay_role=rola,  # type: ignore[arg-type]
                bus_ref=N1,
                substation_ref="ST_1",
            )
        )
    meta = {"field_ref": "BAY_1"} if rola is not None else {}
    model.generators.append(
        Generator(
            ref_id="GEN_1", name="Farma PV", bus_ref=N1, p_mw=1.0, gen_type="pv_inverter", meta=meta
        )
    )
    return model


@pytest.mark.parametrize("rola", ROLE_POLA)
def test_w011_kazda_rola_pola_z_kontraktu(rola: str) -> None:
    zgloszenia = _zgloszenia(_z_wytworca(rola), KOD_WYTWORCA_W_POLU_BEZ_ZRODLA)
    if rola in ROLE_POLA_ZRODLA:
        assert zgloszenia == []
        return
    (zgloszenie,) = zgloszenia
    assert zgloszenie.severity == "IMPORTANT"
    assert zgloszenie.element_refs == ["GEN_1", "BAY_1"]
    assert "Farma PV" in zgloszenie.message_pl and "Pole 1" in zgloszenie.message_pl


@pytest.mark.parametrize(("rola", "pole_istnieje"), [(None, True), ("TR", False)])
def test_w011_bez_wskazania_pola_albo_pole_nieistniejace(
    rola: str | None, pole_istnieje: bool
) -> None:
    model = _z_wytworca(rola, pole_istnieje=pole_istnieje)
    assert _zgloszenia(model, KOD_WYTWORCA_W_POLU_BEZ_ZRODLA) == []


# ---------------------------------------------------------------------------
# W012 — napięcie odniesienia danych zwarciowych źródła
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("napiecie_odniesienia", "ostrzezenie"),
    [(None, False), (15.0, False), (15.1, False), (20.0, True), (110.0, True)],
)
def test_w012_napiecie_odniesienia_zrodla_sn(
    napiecie_odniesienia: float | None, ostrzezenie: bool
) -> None:
    model = _build_mv_lv_enm("Sieć")
    zrodlo = model.sources[0]
    parametry = dict(zrodlo.materialized_params or {})
    parametry.pop("voltage_rating_kv", None)
    if napiecie_odniesienia is not None:
        parametry["voltage_rating_kv"] = napiecie_odniesienia
    model.sources[0] = zrodlo.model_copy(update={"materialized_params": parametry})
    zgloszenia = _zgloszenia(model, KOD_NAPIECIE_ODNIESIENIA_ZRODLA_INNE_NIZ_SZYNY)
    if not ostrzezenie:
        assert zgloszenia == []
        return
    (zgloszenie,) = zgloszenia
    assert zgloszenie.severity == "IMPORTANT"
    assert zgloszenie.element_refs == ["GRID_Q", zrodlo.bus_ref]
    assert f"{napiecie_odniesienia:g} kV" in zgloszenie.message_pl


def test_w012_rownowazniki_110kv_modelu_h5_sa_spojne_i_rozjazd_wykryty() -> None:
    """Strona 110 kV z modelu zbudowanego operacją `add_grid_source_sn`: równoważniki torów
    mają napięcie odniesienia 110 kV na szynach przyłączenia 110 kV — brak W012; przepięcie
    napięcia szyny przyłączenia (sprzeczny opis) daje W012 dla równoważnika tej szyny.

    Szyną przyłączenia równoważnika toru jest zacisk pola liniowego 110 kV za wyłącznikiem
    pola (karta GPZ-H5-APARATURA: tor L1/L2 = zacisk linii + łącznik pola), nie szyna sekcji
    — W012 porównuje napięcie odniesienia z szyną, na której źródło stoi (`Source.bus_ref`)."""
    enm = zbuduj_h5(odbiory=False)
    model = EnergyNetworkModel.model_validate(enm)
    assert _zgloszenia(model, KOD_NAPIECIE_ODNIESIENIA_ZRODLA_INNE_NIZ_SZYNY) == []
    r = refy(enm)
    zrodla = {z.ref_id: z.bus_ref for z in model.sources}
    assert (zrodla[r.zrodlo_l1], zrodla[r.zrodlo_l2]) == (r.zacisk_l1, r.zacisk_l2)
    model.buses = [
        b.model_copy(update={"voltage_kv": 220.0}) if b.ref_id == r.zacisk_l1 else b
        for b in model.buses
    ]
    (zgloszenie,) = _zgloszenia(model, KOD_NAPIECIE_ODNIESIENIA_ZRODLA_INNE_NIZ_SZYNY)
    assert zgloszenie.element_refs == [r.zrodlo_l1, r.zacisk_l1]


# ---------------------------------------------------------------------------
# Rejestr i kontrakt odpowiedzi
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("kod", KODY)
def test_kazdy_kod_ma_kanon_albo_powod(kod: str) -> None:
    assert (kod in ODWZOROWANIE_WALIDATOR_NA_KANON) != (kod in KODY_WALIDATORA_BEZ_KANONU)


def test_kanon_odbioru_i_dlugosci_wskazuje_pola_kontraktu() -> None:
    """Fokus nawigacji kanonu to pole kontraktu ENM (dawne `p_kw`/`length_m` — fantomy)."""
    assert READINESS_CODES["load.power_zero"].fix_navigation["focus"] == "p_mw"
    assert "p_mw" in Load.model_fields
    for kod in ("trunk.segment_length_invalid", "trunk.segment_length_missing"):
        assert READINESS_CODES[kod].fix_navigation["focus"] == "length_km"
    assert "length_km" in OverheadLine.model_fields


def test_odpowiedz_operacji_nie_ma_drugiej_sciezki_walidacji() -> None:
    sukces = execute_domain_operation(
        zbuduj_h5(odbiory=False), "add_load_sn", {"bus_ref": "brak", "p_mw": 1.0}
    )
    assert sukces.get("error") is not None
    assert "semantic_issues" not in sukces
    enm = zbuduj_h5(odbiory=False)
    wynik = execute_domain_operation(enm, "refresh_snapshot", {})
    assert wynik.get("error") is None
    assert "semantic_issues" not in wynik


def test_pakiet_walidatora_semantycznego_skasowany() -> None:
    import importlib.util

    assert importlib.util.find_spec("network_model.validation.semantic_rules") is None
    assert importlib.util.find_spec("network_model.validation.semantic_validator") is None
    assert Bus.model_fields["voltage_kv"].is_required()
