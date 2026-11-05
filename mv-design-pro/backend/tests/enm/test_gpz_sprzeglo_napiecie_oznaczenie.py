"""Operacje konfiguratora GPZ przywrócone z backendem — iloczyn cech karty KATALOG-PRZEJECIE-PR.

DLACZEGO. Konfigurator GPZ miał kontrolki bez operacji (oznaczenie stacji, nowa sekcja z nową
szyną, napięcie Un strony WN, sprzęgło między sekcjami). Zasada „zero fantomów" każe dopisać
backend, nie usunąć funkcję — te testy przypinają operacje, które je niosą, ścieżką natywną:
payload → `execute_domain_operation` → migawka.

ILOCZYN CECH (reguła KLASA, NIE INSTANCJA):
* oznaczenie × {tekst, tekst z odstępami, `None`, pusty, nie-tekst};
* `create_bus` × {strona SN, strona WN} × {razem z `bus_ref`, wartość nielogiczna, duplikat}
  × para tworzenie/usuwanie (szyna utworzona przez sekcję znika z sekcją, cudza zostaje);
* sprzęgło × {GPZ, stacja SN} × {odmowy: brak drugiej szyny, ta sama szyna, zajęta strona
  sekcji, istniejące sprzęgło, zacisk pola, inne napięcie, klucze sprzęgła przy innej roli,
  zły stan, zmiana roli} × {stan normalny otwarty, zamknięty} × usunięcie pola sprzęgła
  (czyszczenie odwołań sekcji) × usunięcie sekcji ze sprzęgłem (odmowa);
* napięcie WN × {zgodne z uzwojeniem, niezgodne, spoza pasma WN, stacja nie-GPZ}
  × {z wiązaniem typu transformatora, bez} × wyspa galwaniczna (linia WN za szyną stacji);
* napięcie szyny przez `update_element_parameters` × {uzwojenie dolne, uzwojenie górne,
  równoważnik sieci na szynie};
* usunięcie pola × {bez zależności — z aparatem i zaciskiem, element na zacisku, zespół
  uziemiający wskazujący pole}.
"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation as op
from enm.kompilator_grafu import pusty_enm

from tests.enm.test_pola_operacje_w5b import _pole_sn, _wstawiona_stacja

APARAT_SN = "sw-cb-abb-vd4-17kv-630a"
TRAFO_WN_SN = "tr-wn-sn-110-15-25mva-yd11"


def _kat(ns: str, item: str) -> dict[str, str]:
    return {"catalog_namespace": ns, "catalog_item_id": item, "catalog_item_version": "2024.1"}


def _gpz(sekcje: int = 2) -> dict[str, Any]:
    enm = pusty_enm(name="gpz", sn_nominal_kv=15.0)
    r = op(
        enm,
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "manual_equivalent": {
                "short_circuit_input_side": "HV_110",
                "hv_voltage_kv": 110.0,
                "sk3_hv_mva": 3000.0,
                "rx_ratio": 0.1,
            },
            "transformer_count": 1,
            "transformer_catalog_binding": _kat("TRAFO_SN_NN", TRAFO_WN_SN),
            "sections_count": sekcje,
            "line_fields_per_section": 1,
            "gpz_line_field_apparatus": {"catalog_binding": _kat("APARAT_SN", APARAT_SN)},
        },
    )
    assert not r.get("error"), r.get("error")
    return r["snapshot"]


def _sub(snap: dict[str, Any]) -> dict[str, Any]:
    return next(s for s in snap["substations"] if s["station_type"] == "gpz")


def _ok(snap: dict[str, Any], nazwa: str, payload: dict[str, Any]) -> dict[str, Any]:
    r = op(snap, nazwa, payload)
    assert not r.get("error"), (r.get("error_code"), r.get("error"))
    return r


def _kod(snap: dict[str, Any], nazwa: str, payload: dict[str, Any]) -> str | None:
    przed = copy.deepcopy(snap)
    r = op(snap, nazwa, payload)
    assert snap == przed  # operacja nigdy nie mutuje wejścia
    return r.get("error_code")


def _szyna(snap: dict[str, Any], ref: str) -> dict[str, Any] | None:
    return next((b for b in snap["buses"] if b["ref_id"] == ref), None)


# ---------------------------------------------------------------------------
# Oznaczenie stacji
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("wartosc", "oczekiwane"),
    [("GPZ-15/1", "GPZ-15/1"), ("  GPZ Północ ", "GPZ Północ"), (None, None)],
)
def test_oznaczenie_stacji_zapis(wartosc: str | None, oczekiwane: str | None) -> None:
    snap = _gpz()
    sid = _sub(snap)["ref_id"]
    if wartosc is None:
        snap = _ok(
            snap,
            "update_element_parameters",
            {"element_ref": sid, "parameters": {"designation": "X"}},
        )["snapshot"]
    r = _ok(
        snap,
        "update_element_parameters",
        {"element_ref": sid, "parameters": {"designation": wartosc}},
    )
    assert _sub(r["snapshot"]).get("designation") == oczekiwane


@pytest.mark.parametrize("wartosc", ["", "   ", 15, ["GPZ"]])
def test_oznaczenie_stacji_odmowa(wartosc: Any) -> None:
    snap = _gpz()
    sid = _sub(snap)["ref_id"]
    payload = {"element_ref": sid, "parameters": {"designation": wartosc}}
    assert _kod(snap, "update_element_parameters", payload) == "params.invalid_value"


# ---------------------------------------------------------------------------
# Nowa sekcja z nową szyną (create_bus) — para tworzenie/usuwanie
# ---------------------------------------------------------------------------


def test_nowa_sekcja_tworzy_szyne_o_napieciu_strony_i_usuniecie_ja_zabiera() -> None:
    snap = _gpz()
    sid = _sub(snap)["ref_id"]
    r = _ok(
        snap,
        "add_gpz_section",
        {"substation_ref": sid, "section_id": "sek-3", "create_bus": True, "name": "Sekcja 3"},
    )
    szyna_ref, sekcja = r["changes"]["created_element_ids"]
    assert sekcja == "sek-3"
    po = r["snapshot"]
    szyna = _szyna(po, szyna_ref)
    assert szyna is not None and szyna["voltage_kv"] == 15.0
    assert szyna_ref in _sub(po)["bus_refs"]
    assert any(
        s["section_id"] == "sek-3" and s["bus_ref"] == szyna_ref for s in _sub(po)["gpz_sections"]
    )
    # determinizm identyfikatora szyny: ta sama operacja → ten sam identyfikator
    r2 = _ok(
        snap,
        "add_gpz_section",
        {"substation_ref": sid, "section_id": "sek-3", "create_bus": True, "name": "Sekcja 3"},
    )
    assert r2["changes"]["created_element_ids"] == r["changes"]["created_element_ids"]
    # para: usunięcie sekcji zabiera szynę, którą sekcja utworzyła
    r3 = _ok(po, "delete_gpz_section", {"substation_ref": sid, "section_id": "sek-3"})
    assert szyna_ref in r3["changes"]["deleted_element_ids"]
    assert _szyna(r3["snapshot"], szyna_ref) is None
    assert szyna_ref not in _sub(r3["snapshot"])["bus_refs"]


def test_usuniecie_sekcji_na_cudzej_szynie_nie_usuwa_szyny() -> None:
    """Para tworzenie/usuwanie: sekcja wskazująca szynę, której NIE utworzyła (istniejąca szyna
    wolna), znika bez szyny — usuwa się tylko szynę ze znacznikiem `gpz_section_id` tej sekcji."""
    snap = _gpz()
    sid = _sub(snap)["ref_id"]
    snap = _ok(
        snap, "add_gpz_section", {"substation_ref": sid, "section_id": "tmp", "create_bus": True}
    )["snapshot"]
    szyna_ref = next(s["bus_ref"] for s in _sub(snap)["gpz_sections"] if s["section_id"] == "tmp")
    snap = _ok(snap, "delete_gpz_section", {"substation_ref": sid, "section_id": "tmp"})["snapshot"]
    assert _szyna(snap, szyna_ref) is None
    # cudza szyna: ta sama szyna 15 kV dopisana bez znacznika sekcji
    snap["buses"].append(
        {"ref_id": "szyna-wolna", "name": "Szyna wolna", "voltage_kv": 15.0, "tags": []}
    )
    _sub(snap)["bus_refs"].append("szyna-wolna")
    snap = _ok(
        snap,
        "add_gpz_section",
        {"substation_ref": sid, "section_id": "sek-w", "bus_ref": "szyna-wolna"},
    )["snapshot"]
    r = _ok(snap, "delete_gpz_section", {"substation_ref": sid, "section_id": "sek-w"})
    assert "szyna-wolna" not in r["changes"]["deleted_element_ids"]
    assert _szyna(r["snapshot"], "szyna-wolna") is not None


def test_usuniecie_sekcji_z_polami_to_odmowa() -> None:
    snap = _gpz()
    sub = _sub(snap)
    payload = {"substation_ref": sub["ref_id"], "section_id": sub["gpz_sections"][-1]["section_id"]}
    assert _kod(snap, "delete_gpz_section", payload) == "gpz_section.delete.in_use"


@pytest.mark.parametrize(
    ("dodatek", "kod"),
    [
        ({"create_bus": True, "bus_ref": "__szyna1__"}, "gpz_section.add.bus_ref_and_create_bus"),
        ({"create_bus": "tak"}, "gpz_section.add.bus_ref_and_create_bus"),
    ],
)
def test_nowa_sekcja_odmowy_ladunku(dodatek: dict[str, Any], kod: str) -> None:
    snap = _gpz()
    sub = _sub(snap)
    payload = {"substation_ref": sub["ref_id"], "section_id": "sek-9", **dodatek}
    if payload.get("bus_ref") == "__szyna1__":
        payload["bus_ref"] = sub["gpz_sections"][0]["bus_ref"]
    assert _kod(snap, "add_gpz_section", payload) == kod


def test_nowa_sekcja_duplikat_identyfikatora() -> None:
    snap = _gpz()
    sid = _sub(snap)["ref_id"]
    po = _ok(
        snap, "add_gpz_section", {"substation_ref": sid, "section_id": "sek-3", "create_bus": True}
    )
    payload = {"substation_ref": sid, "section_id": "sek-3", "create_bus": True}
    assert (
        _kod(po["snapshot"], "add_gpz_section", payload) == "gpz_section.add.duplicate_section_id"
    )


def test_nowa_sekcja_strony_wn_ma_napiecie_wn() -> None:
    snap = _gpz()
    sid = _sub(snap)["ref_id"]
    r = op(
        snap,
        "add_gpz_section",
        {"substation_ref": sid, "section_id": "wn-2", "create_bus": True, "side": "hv"},
    )
    assert not r.get("error"), (r.get("error_code"), r.get("error"))
    szyna_ref = r["changes"]["created_element_ids"][0]
    assert _szyna(r["snapshot"], szyna_ref)["voltage_kv"] == 110.0


# ---------------------------------------------------------------------------
# Sprzęgło między sekcjami
# ---------------------------------------------------------------------------


def _gpz_trzy_sekcje() -> tuple[dict[str, Any], str, list[str]]:
    snap = _gpz()
    sid = _sub(snap)["ref_id"]
    snap = _ok(
        snap, "add_gpz_section", {"substation_ref": sid, "section_id": "sek-3", "create_bus": True}
    )["snapshot"]
    return snap, sid, [s["bus_ref"] for s in _sub(snap)["gpz_sections"]]


def _sprzeglo(snap: dict[str, Any], sid: str, a: str, b: str, stan: str | None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "bus_ref": a,
        "station_ref": sid,
        "bay_role": "COUPLER",
        "coupled_bus_ref": b,
        "catalog_binding": _kat("APARAT_SN", APARAT_SN),
    }
    if stan is not None:
        payload["coupler_normal_state"] = stan
    return payload


@pytest.mark.parametrize("stan", ["open", "closed", None])
def test_sprzeglo_gpz_tworzy_galaz_i_wiaze_sekcje_a_usuniecie_pola_je_czysci(
    stan: str | None,
) -> None:
    snap, sid, (b1, b2, b3) = _gpz_trzy_sekcje()
    r = _ok(snap, "add_sn_bay", _sprzeglo(snap, sid, b2, b3, stan))
    po = r["snapshot"]
    sprzegla = [g for g in po["branches"] if g["type"] == "bus_coupler"]
    nowe = [g for g in sprzegla if {g["from_bus_ref"], g["to_bus_ref"]} == {b2, b3}]
    assert len(nowe) == 1
    oczekiwany = stan or "closed"
    assert nowe[0]["status"] == oczekiwany and nowe[0]["normal_state"] == oczekiwany
    sekcje = {s["bus_ref"]: s for s in _sub(po)["gpz_sections"]}
    assert sekcje[b2].get("right_coupler_ref") == nowe[0]["ref_id"]
    assert sekcje[b3].get("left_coupler_ref") == nowe[0]["ref_id"]
    pole = next(b for b in po["bays"] if b["bay_role"] == "COUPLER" and b["bus_ref"] == b2)
    assert pole["equipment_refs"] == [nowe[0]["ref_id"]]
    # jedno oznaczenie aparatu i pola (dawniej „Sprzęgło <nazwa pola>” → „Sprzęgło Sprzęgło …”)
    assert nowe[0]["name"] == pole["name"] and pole["name"].strip()
    # sekcji ze sprzęgłem nie usuwa się spod niego
    assert (
        _kod(po, "delete_gpz_section", {"substation_ref": sid, "section_id": "sek-3"})
        == "gpz_section.delete.has_coupler"
    )
    # usunięcie pola sprzęgła zabiera gałąź i czyści odwołania obu sekcji
    r2 = _ok(po, "delete_element", {"element_ref": pole["ref_id"]})
    assert nowe[0]["ref_id"] in r2["changes"]["deleted_element_ids"]
    po2 = r2["snapshot"]
    assert all(g["ref_id"] != nowe[0]["ref_id"] for g in po2["branches"])
    for s in _sub(po2)["gpz_sections"]:
        assert nowe[0]["ref_id"] not in (s.get("left_coupler_ref"), s.get("right_coupler_ref"))
    _ok(po2, "delete_gpz_section", {"substation_ref": sid, "section_id": "sek-3"})


def test_usuniecie_galezi_sprzegla_czysci_odwolania_sekcji() -> None:
    snap, sid, (_b1, b2, b3) = _gpz_trzy_sekcje()
    po = _ok(snap, "add_sn_bay", _sprzeglo(snap, sid, b2, b3, "open"))["snapshot"]
    galaz = next(
        g
        for g in po["branches"]
        if g["type"] == "bus_coupler" and {g["from_bus_ref"], g["to_bus_ref"]} == {b2, b3}
    )
    pole = next(b for b in po["bays"] if b["bay_role"] == "COUPLER" and b["bus_ref"] == b2)
    r = _ok(po, "delete_element", {"element_ref": galaz["ref_id"]})
    for s in _sub(r["snapshot"])["gpz_sections"]:
        assert galaz["ref_id"] not in (s.get("left_coupler_ref"), s.get("right_coupler_ref"))
    # pole sprzęgła bez sprzęgła nie zostaje jako puste pole z wiszącym `coupler_ref`
    assert pole["ref_id"] in r["changes"]["deleted_element_ids"]
    assert all(b["ref_id"] != pole["ref_id"] for b in r["snapshot"]["bays"])
    # para: sprzęgło 2–3 da się dodać ponownie (strony sekcji zwolnione)
    _ok(r["snapshot"], "add_sn_bay", _sprzeglo(r["snapshot"], sid, b2, b3, "closed"))


def test_usuniecie_szyny_sekcji_zabiera_sprzeglo_i_jego_pole() -> None:
    snap, sid, (_b1, b2, b3) = _gpz_trzy_sekcje()
    po = _ok(snap, "add_sn_bay", _sprzeglo(snap, sid, b2, b3, "open"))["snapshot"]
    pole = next(b for b in po["bays"] if b["bay_role"] == "COUPLER" and b["bus_ref"] == b2)
    r = _ok(po, "delete_element", {"element_ref": b3})
    assert pole["ref_id"] in r["changes"]["deleted_element_ids"]
    for s in _sub(r["snapshot"])["gpz_sections"]:
        assert s.get("right_coupler_ref") != pole["equipment_refs"][0]


def test_sprzeglo_odmowy_gpz() -> None:
    snap, sid, (b1, b2, b3) = _gpz_trzy_sekcje()
    po = _ok(snap, "add_sn_bay", _sprzeglo(snap, sid, b2, b3, "open"))["snapshot"]
    bez_drugiej = {"bus_ref": b3, "station_ref": sid, "bay_role": "COUPLER"}
    assert _kod(po, "add_sn_bay", bez_drugiej) == "sn.coupler_bus_missing"
    assert _kod(po, "add_sn_bay", _sprzeglo(po, sid, b3, b3, None)) == "sn.coupler_same_bus"
    assert _kod(po, "add_sn_bay", _sprzeglo(po, sid, b3, b2, None)) == "sn.coupler_exists"
    # sekcja 3 ma już sprzęgło po lewej — sprzęgło 1–3 zająłby tę samą stronę
    assert _kod(po, "add_sn_bay", _sprzeglo(po, sid, b1, b3, None)) == "sn.coupler_exists"
    nieistniejaca = _sprzeglo(po, sid, b1, "nie-ma", None)
    assert _kod(po, "add_sn_bay", nieistniejaca) == "sn.coupler_bus_outside_station"
    zly_stan = _sprzeglo(po, sid, b1, b2, "half")
    assert _kod(po, "add_sn_bay", zly_stan) == "sn.coupler_normal_state_invalid"
    obce = {
        "bus_ref": b1,
        "station_ref": sid,
        "bay_role": "OUT",
        "coupled_bus_ref": b2,
        "catalog_binding": _kat("APARAT_SN", APARAT_SN),
    }
    assert _kod(po, "add_sn_bay", obce) == "sn.coupler_fields_without_coupler"
    obce_stan = {**obce, "coupled_bus_ref": None, "coupler_normal_state": "open"}
    obce_stan.pop("coupled_bus_ref")
    assert _kod(po, "add_sn_bay", obce_stan) == "sn.coupler_fields_without_coupler"


def test_sprzeglo_do_szyny_innego_napiecia_i_spoza_sekcji_sn() -> None:
    snap, sid, (b1, _b2, _b3) = _gpz_trzy_sekcje()
    sub = _sub(snap)
    szyny_wn = [b for b in sub["bus_refs"] if (_szyna(snap, b) or {}).get("voltage_kv") == 110.0]
    assert szyny_wn, "GPZ 110/SN ma szynę strony WN"
    kod = _kod(snap, "add_sn_bay", _sprzeglo(snap, sid, b1, szyny_wn[0], None))
    assert kod in {"sn.coupler_bus_outside_station", "sn.coupler_voltage_mismatch"}
    # zacisk pola liniowego nie jest sekcją
    pole_linii = next(
        b for b in snap["bays"] if b.get("bus_ref") == b1 and b.get("terminal_bus_ref")
    )
    zacisk = pole_linii["terminal_bus_ref"]
    assert (
        _kod(snap, "add_sn_bay", _sprzeglo(snap, sid, b1, zacisk, None))
        == "sn.coupler_bus_outside_station"
    )


def test_sprzeglo_w_stacji_sn_odmawia_zacisku_pola() -> None:
    snap = _wstawiona_stacja()
    stacja = next(s for s in snap["substations"] if s.get("station_type") != "gpz")
    rekord = _pole_sn(snap, "LINIA_ODG")
    szyna = rekord["bus_ref"]
    payload = _sprzeglo(snap, stacja["ref_id"], szyna, rekord["terminal_bus_ref"], None)
    assert _kod(snap, "add_sn_bay", payload) == "sn.coupler_bus_outside_station"
    assert (
        _kod(snap, "add_sn_bay", _sprzeglo(snap, stacja["ref_id"], szyna, szyna, None))
        == "sn.coupler_same_bus"
    )


def test_rekonfiguracja_pola_nie_zmienia_roli_na_sprzeglo_ani_ze_sprzegla() -> None:
    snap, sid, (b1, b2, b3) = _gpz_trzy_sekcje()
    po = _ok(snap, "add_sn_bay", _sprzeglo(snap, sid, b2, b3, "open"))["snapshot"]
    pole_sprzegla = next(b for b in po["bays"] if b["bay_role"] == "COUPLER")
    pole_linii = next(
        b for b in po["bays"] if b["bay_role"] != "COUPLER" and b.get("bus_ref") == b1
    )
    na_linie = {
        "bus_ref": b2,
        "station_ref": sid,
        "bay_role": "OUT",
        "field_ref": pole_sprzegla["ref_id"],
    }
    na_sprzeglo = {
        "bus_ref": b1,
        "station_ref": sid,
        "bay_role": "COUPLER",
        "field_ref": pole_linii["ref_id"],
        "coupled_bus_ref": b2,
    }
    assert _kod(po, "add_sn_bay", na_linie) == "sn.coupler_role_change"
    assert _kod(po, "add_sn_bay", na_sprzeglo) in {
        "sn.coupler_role_change",
        "sn.coupler_exists",
    }


# ---------------------------------------------------------------------------
# Napięcie Un strony WN GPZ
# ---------------------------------------------------------------------------


def _szyny_wn(snap: dict[str, Any]) -> list[str]:
    return sorted(
        b for b in _sub(snap)["bus_refs"] if (_szyna(snap, b) or {}).get("voltage_kv", 0) > 100
    )


def test_napiecie_wn_odmowy() -> None:
    snap = _gpz()
    sid = _sub(snap)["ref_id"]
    r = op(snap, "update_gpz_hv_voltage", {"substation_ref": sid, "voltage_kv": 115.0})
    assert r.get("error_code") == "gpz_hv_voltage.transformer_mismatch"
    assert "110" in r["error"] and sid not in r["error"]
    assert (
        _kod(snap, "update_gpz_hv_voltage", {"substation_ref": sid, "voltage_kv": 15.0})
        == "gpz_hv_voltage.invalid_value"
    )
    assert (
        _kod(snap, "update_gpz_hv_voltage", {"substation_ref": sid, "voltage_kv": -110.0})
        == "gpz_hv_voltage.invalid_value"
    )
    assert (
        _kod(snap, "update_gpz_hv_voltage", {"substation_ref": "nie-ma", "voltage_kv": 110.0})
        == "gpz_hv_voltage.substation_missing"
    )
    # typ 110/SN przy napięciu 115 kV to nadal niezgodność — wiązanie nie omija predykatu
    z_typem = {
        "substation_ref": sid,
        "voltage_kv": 115.0,
        "transformer_catalog_binding": _kat("TRAFO_SN_NN", TRAFO_WN_SN),
    }
    # odmawia tor przypisania typu (ta sama równość napięć `to_samo_napiecie_znamionowe`)
    assert _kod(snap, "update_gpz_hv_voltage", z_typem) == "catalog.transformer_voltage_mismatch"


def test_napiecie_wn_zgodne_z_wiazaniem_typu() -> None:
    snap = _gpz()
    sid = _sub(snap)["ref_id"]
    r = _ok(
        snap,
        "update_gpz_hv_voltage",
        {
            "substation_ref": sid,
            "voltage_kv": 110.0,
            "transformer_catalog_binding": _kat("TRAFO_SN_NN", TRAFO_WN_SN),
        },
    )
    assert all(_szyna(r["snapshot"], b)["voltage_kv"] == 110.0 for b in _szyny_wn(snap))


def test_napiecie_wn_zmienia_wyspe_galwaniczna_i_rownowaznik() -> None:
    """Uzwojenie górne 135 kV (typ spoza katalogu 110/SN wstawiony w migawkę) — zmiana Un na
    135 kV przechodzi i obejmuje szynę za linią WN oraz napięcie równoważnika sieci."""
    snap = _gpz()
    sub = _sub(snap)
    for t in snap["transformers"]:
        if t["ref_id"] in sub["transformer_refs"]:
            t["uhv_kv"] = 135.0
    szyna_wn = _szyny_wn(snap)[0]
    snap["buses"].append(
        {**copy.deepcopy(_szyna(snap, szyna_wn)), "ref_id": "szyna-za-linia", "name": "Za linią"}
    )
    snap["branches"].append(
        {
            "ref_id": "linia-wn",
            "name": "Linia WN",
            "type": "line_overhead",
            "from_bus_ref": szyna_wn,
            "to_bus_ref": "szyna-za-linia",
            "status": "closed",
            "length_km": 1.0,
            "r_ohm_per_km": 0.1,
            "x_ohm_per_km": 0.4,
        }
    )
    r = _ok(snap, "update_gpz_hv_voltage", {"substation_ref": sub["ref_id"], "voltage_kv": 135.0})
    po = r["snapshot"]
    assert _szyna(po, "szyna-za-linia")["voltage_kv"] == 135.0
    assert all(_szyna(po, b)["voltage_kv"] == 135.0 for b in _szyny_wn(snap))
    zrodla = [z for z in po["sources"] if z.get("bus_ref") in {szyna_wn, "szyna-za-linia"}]
    assert zrodla and all(z["voltage_hv_kv"] == 135.0 for z in zrodla)
    # strona SN nietknięta
    for s in sub["gpz_sections"]:
        assert _szyna(po, s["bus_ref"])["voltage_kv"] == 15.0


# ---------------------------------------------------------------------------
# Napięcie szyny przez update_element_parameters — ten sam predykat uzwojeń
# ---------------------------------------------------------------------------


def test_napiecie_szyny_sn_wobec_uzwojenia_dolnego() -> None:
    snap = _gpz()
    b1 = _sub(snap)["gpz_sections"][0]["bus_ref"]
    payload = {"element_ref": b1, "parameters": {"voltage_kv": 20.0}}
    assert (
        _kod(snap, "update_element_parameters", payload)
        == "params.bus_voltage_transformer_mismatch"
    )


def test_napiecie_szyny_wn_wobec_uzwojenia_gornego_i_rownowaznika() -> None:
    snap = _gpz()
    szyna_wn = _szyny_wn(snap)[0]
    payload = {"element_ref": szyna_wn, "parameters": {"voltage_kv": 115.0}}
    assert (
        _kod(snap, "update_element_parameters", payload)
        == "params.bus_voltage_transformer_mismatch"
    )
    # uzwojenie zgodne (135 kV), ale równoważnik sieci ma 110 kV — odmowa z drugiego warunku
    for t in snap["transformers"]:
        t["uhv_kv"] = 135.0
    r = op(
        snap,
        "update_element_parameters",
        {"element_ref": szyna_wn, "parameters": {"voltage_kv": 135.0}},
    )
    assert r.get("error_code") == "params.bus_voltage_transformer_mismatch"
    assert "GPZ" in r["error"]


# ---------------------------------------------------------------------------
# Usunięcie pola — części własne i zależności obce
# ---------------------------------------------------------------------------


def test_usuniecie_pola_ze_wskazaniem_zespolu_uziemiajacego_to_odmowa() -> None:
    snap = _wstawiona_stacja()
    rekord = _pole_sn(snap, "LINIA_ODG")
    snap["zespoly_uziemiajace"] = [
        {
            "ref_id": "zu-1",
            "name": "ZU 1",
            "bus_ref": rekord["bus_ref"],
            "bay_ref": rekord["ref_id"],
        }
    ]
    r = op(snap, "delete_element", {"element_ref": rekord["ref_id"]})
    assert r.get("error_code") == "field.has_dependencies", r.get("error")
    assert "zespół uziemiający" in r["error"]


def test_usuniecie_pola_z_baterie_na_zacisku_to_odmowa() -> None:
    snap = _wstawiona_stacja()
    rekord = _pole_sn(snap, "LINIA_ODG")
    snap["shunt_capacitors"] = [
        {"ref_id": "bkr-1", "name": "BKR 1", "bus_ref": rekord["terminal_bus_ref"], "q_mvar": 1.0}
    ]
    r = op(snap, "delete_element", {"element_ref": rekord["ref_id"]})
    assert r.get("error_code") == "field.has_dependencies", r.get("error")
    assert "zacisk" in r["error"]


def test_pole_sprzegla_gpz_przyjmuje_wyposazenie_jak_pole_sprzegla_stacji_sekcyjnej() -> None:
    """Iloczyn: pole sprzęgła × droga budowy {stacja sekcyjna (typ D), `add_sn_bay` w GPZ} ×
    wyposażenie katalogowe pola — pole sprzęgła GPZ ma ten sam kształt (aparat = sprzęgło,
    bez zacisku), więc `set_bay_equipment` przyjmuje je tą samą drogą."""
    from tests.enm.test_wyposazenie_pola import _ladunek_katalogowy

    snap, sid, (_b1, b2, b3) = _gpz_trzy_sekcje()
    po = _ok(snap, "add_sn_bay", _sprzeglo(snap, sid, b2, b3, "closed"))["snapshot"]
    pole = next(b for b in po["bays"] if b["bay_role"] == "COUPLER" and b["bus_ref"] == b2)
    assert pole.get("terminal_bus_ref") is None
    urzadzenia = _ladunek_katalogowy("COUPLER")
    r = _ok(
        po,
        "set_bay_equipment",
        {"bay_ref": pole["ref_id"], "mode": "katalog", "devices": urzadzenia},
    )
    zapisane = next(b for b in r["snapshot"]["bays"] if b["ref_id"] == pole["ref_id"])
    assert [a["catalog_ref"] for a in zapisane["primary_devices"]] == [
        d["catalog_ref"] for d in urzadzenia
    ]
    assert zapisane["equipment_refs"] == pole["equipment_refs"]  # sprzęgło zostaje aparatem pola


@pytest.mark.parametrize("kierunek", ["z_lewej", "z_prawej"])
@pytest.mark.parametrize("order", ["rozny", "rowny"])
def test_strony_sekcji_sprzegla_z_kolejnosci_niezaleznie_od_kierunku(
    kierunek: str, order: str
) -> None:
    """Iloczyn: kierunek dodania (z sekcji lewej / prawej) × `order` sekcji (różny / równy —
    wtedy rozstrzyga pozycja na liście; `order` jest wymagany kontraktem modelu): lewa sekcja
    dostaje `right_coupler_ref`, prawa `left_coupler_ref`."""
    snap, sid, (_b1, b2, b3) = _gpz_trzy_sekcje()
    if order == "rowny":
        for s in _sub(snap)["gpz_sections"]:
            s["order"] = 1
    a, b = (b2, b3) if kierunek == "z_lewej" else (b3, b2)
    po = _ok(snap, "add_sn_bay", _sprzeglo(snap, sid, a, b, None))["snapshot"]
    galaz = next(
        g
        for g in po["branches"]
        if g["type"] == "bus_coupler" and {g["from_bus_ref"], g["to_bus_ref"]} == {b2, b3}
    )
    sekcje = {s["bus_ref"]: s for s in _sub(po)["gpz_sections"]}
    assert sekcje[b2].get("right_coupler_ref") == galaz["ref_id"]
    assert sekcje[b3].get("left_coupler_ref") == galaz["ref_id"]


def test_nazwa_sprzegla_jest_nazwa_pola_nadana_przez_projektanta() -> None:
    snap, sid, (_b1, b2, b3) = _gpz_trzy_sekcje()
    po = _ok(
        snap, "add_sn_bay", {**_sprzeglo(snap, sid, b2, b3, None), "field_name": "Sprzęgło S2-S3"}
    )["snapshot"]
    galaz = next(
        g for g in po["branches"] if g["type"] == "bus_coupler" and g["from_bus_ref"] == b2
    )
    assert galaz["name"] == "Sprzęgło S2-S3"
