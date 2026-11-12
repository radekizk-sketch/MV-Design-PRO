"""Karta UX-04/ROZDZIELNICA-SN-KOREKTA — model rozdzielnicy SN GPZ (werdykt właściciela 0/10).

Iloczyn cech, w którym chował się defekt „transformator schodzi do szyn poza swoim polem”:

- liczba sekcji (1, 2) × liczba transformatorów (1, 2) × aparat pól GPZ z katalogu (jest / brak):
  każdy transformator 110 kV/SN ma DOKŁADNIE jedno pole roli ``TR`` na szynie swojej sekcji;
  z aparatem — strona SN transformatora stoi na zacisku pola, a wyłącznik pola łączy zacisk
  z szyną sekcji (rozdział także w obliczeniach); bez aparatu — strona SN na szynie sekcji;
  jedno źródło przypisania sekcji (`szyny_sekcji_transformatorow_gpz`) dla obu przypadków;
- sprzęgło (stan zamknięty / otwarty): sekcje SN łączy galwanicznie WYŁĄCZNIE gałąź sprzęgła —
  zamknięte = jedna wyspa SN, otwarte = dwie (pola TR nie dokładają drugiej drogi);
- pole zespołu uziemiającego (Z.13, Z.14, Z.15): szyna 0,4 kV potrzeb własnych nie jest szyną
  sekcji ani szyną pola odpływowego SN, a transformator uziemiający nie zasila sekcji;
- pole pomiaru napięcia (Z.17): przekładnik napięciowy kończy tor pola (węzeł za głowicą
  kablową), wskaźnik napięcia jest odgałęzieniem — nie aparat w osi toru głównego.
"""

from __future__ import annotations

from typing import Any

import pytest
from enm.models import EnergyNetworkModel
from enm.topology import szyny_sekcji_transformatorow_gpz, transformatory_zasilajace_gpz
from enm.validator import ENMValidator
from network_model.catalog.bay_templates import BAY_TEMPLATE_GPZ_POMIAR_NAPIECIA_Z17

from tests.reference_networks.scena_geometrii_stacji import (
    TRAFO_WN_SN,
    ZRODLO_110KV,
    dodaj_pole_pomiaru_napiecia_z17,
    zbuduj_gpz_110kv,
    zbuduj_gpz_pole_zespolu,
)
from tests.reference_networks.sceny_zajetosci_pol import APARAT, ok, op


def _gpz(sekcje: int, transformatory: int, *, z_aparatem: bool) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "voltage_kv": 15.0,
        "manual_equivalent": dict(ZRODLO_110KV),
        "sections_count": sekcje,
        "transformer_count": transformatory,
        "transformer_catalog_ref": TRAFO_WN_SN,
        "line_fields_per_section": 2,
    }
    if z_aparatem:
        payload["gpz_line_field_apparatus"] = {"catalog_ref": APARAT}
    pusty = EnergyNetworkModel.model_validate(
        {"header": {"name": "ROZDZIELNICA-SN", "defaults": {}}}
    ).model_dump(mode="json")
    return ok(op(pusty, "add_grid_source_sn", payload))


def _gpz_stacja(enm: dict[str, Any]) -> dict[str, Any]:
    return next(s for s in enm["substations"] if s.get("station_type") == "gpz")


def _szyny_sekcji(enm: dict[str, Any]) -> dict[str, str]:
    """section_id → bus_ref sekcji GPZ."""
    return {s["section_id"]: s["bus_ref"] for s in _gpz_stacja(enm)["gpz_sections"]}


def _transformatory_wn_sn(enm: dict[str, Any]) -> list[dict[str, Any]]:
    stacja = _gpz_stacja(enm)
    return [t for t in enm["transformers"] if t["ref_id"] in stacja["transformer_refs"]]


@pytest.mark.parametrize("z_aparatem", [True, False], ids=["aparat", "bez-aparatu"])
@pytest.mark.parametrize("transformatory", [1, 2])
@pytest.mark.parametrize("sekcje", [1, 2])
def test_kazdy_transformator_ma_jedno_pole_tr_na_swojej_sekcji(
    sekcje: int, transformatory: int, z_aparatem: bool
) -> None:
    enm = _gpz(sekcje, transformatory, z_aparatem=z_aparatem)
    szyny = _szyny_sekcji(enm)
    przypisanie = szyny_sekcji_transformatorow_gpz(enm)
    trafa = _transformatory_wn_sn(enm)
    assert len(trafa) == transformatory
    galezie = {g["ref_id"]: g for g in enm["branches"]}
    for trafo in trafa:
        pola = [
            b
            for b in enm["bays"]
            if b.get("bay_role") == "TR" and trafo["ref_id"] in (b.get("equipment_refs") or [])
        ]
        assert len(pola) == 1, f"{trafo['ref_id']}: pola TR {[p['ref_id'] for p in pola]}"
        pole = pola[0]
        szyna_sekcji = szyny[trafo["meta"]["gpz_section_id"]]
        assert pole["bus_ref"] == szyna_sekcji
        assert pole["bay_template_ref"] == "gpz_tr_enea_z7" or "z7" in pole["bay_template_ref"]
        # Jedno źródło przypisania transformatora do sekcji (walidator, operacje, odczyty).
        assert przypisanie[trafo["ref_id"]] == szyna_sekcji
        assert trafo["ref_id"] in transformatory_zasilajace_gpz(enm)
        if z_aparatem:
            assert trafo["lv_bus_ref"] == pole["terminal_bus_ref"] != szyna_sekcji
            wylaczniki = [r for r in pole["equipment_refs"] if r in galezie]
            assert len(wylaczniki) == 1
            wylacznik = galezie[wylaczniki[0]]
            assert wylacznik["type"] == "breaker"
            assert {wylacznik["from_bus_ref"], wylacznik["to_bus_ref"]} == {
                szyna_sekcji,
                pole["terminal_bus_ref"],
            }
        else:
            assert trafo["lv_bus_ref"] == szyna_sekcji
            assert pole.get("terminal_bus_ref") in (None, "")
    # Żadne pole TR bez transformatora (duplikat „pod szynami”).
    pola_tr = [b for b in enm["bays"] if b.get("bay_role") == "TR"]
    assert len(pola_tr) == transformatory
    # Pola liniowe GPZ zapisane przed polami TR (indeks pola liniowego niezależny od liczby TR).
    role = [b.get("bay_role") for b in enm["bays"] if b.get("substation_ref")]
    assert role.index("TR") > max(i for i, r in enumerate(role) if r in {"OUT", "FEEDER"})


@pytest.mark.parametrize("z_aparatem", [True, False], ids=["aparat", "bez-aparatu"])
def test_model_gpz_z_polami_tr_bez_bledow_walidatora(z_aparatem: bool) -> None:
    enm = _gpz(2, 2, z_aparatem=z_aparatem)
    wynik = ENMValidator().validate(EnergyNetworkModel.model_validate(enm))
    bledy = [i for i in wynik.issues if str(i.severity).upper().endswith("BLOCKER")]
    assert bledy == [], [(i.code, i.message_pl) for i in bledy]
    assert "E066" not in {i.code for i in wynik.issues}


def _wyspy_sn(enm: dict[str, Any]) -> list[frozenset[str]]:
    """Składowe galwaniczne szyn SN sekcji GPZ po gałęziach zamkniętych (bez transformatorów —
    sekcje wiąże też droga przez szynę 110 kV, ale to nie jest połączenie szyn SN)."""
    sasiedzi: dict[str, set[str]] = {}
    for g in enm["branches"]:
        if g.get("status", "closed") != "closed":
            continue
        a, b = g["from_bus_ref"], g["to_bus_ref"]
        sasiedzi.setdefault(a, set()).add(b)
        sasiedzi.setdefault(b, set()).add(a)
    szyny = set(_szyny_sekcji(enm).values())
    wyspy: list[frozenset[str]] = []
    odwiedzone: set[str] = set()
    for start in sorted(szyny):
        if start in odwiedzone:
            continue
        stos, skladowa = [start], set()
        while stos:
            w = stos.pop()
            if w in skladowa:
                continue
            skladowa.add(w)
            stos.extend(sasiedzi.get(w, ()))
        odwiedzone |= skladowa
        wyspy.append(frozenset(skladowa & szyny))
    return wyspy


@pytest.mark.parametrize("z_aparatem", [True, False], ids=["aparat", "bez-aparatu"])
@pytest.mark.parametrize("stan", ["closed", "open"])
def test_sprzeglo_jedynym_polaczeniem_sekcji(stan: str, z_aparatem: bool) -> None:
    enm = _gpz(2, 2, z_aparatem=z_aparatem)
    sprzegla = [g for g in enm["branches"] if g["type"] == "bus_coupler"]
    assert len(sprzegla) == 1
    sprzegla[0]["status"] = stan
    wyspy = _wyspy_sn(enm)
    assert len(wyspy) == (1 if stan == "closed" else 2), wyspy


@pytest.mark.parametrize("wariant", ["Z13", "Z14", "Z15"])
def test_wyjscie_0_4_kv_zespolu_uziemiajacego_nie_jest_odplywem_sn(wariant: str) -> None:
    enm = zbuduj_gpz_pole_zespolu(wariant)
    szyny_sekcji = set(_szyny_sekcji(enm).values())
    szyny = {b["ref_id"]: b for b in enm["buses"]}
    pola_zu = [b for b in enm["bays"] if b.get("bay_role") == "ZU"]
    assert len(pola_zu) == 1
    trafa_zu = [
        t
        for t in enm["transformers"]
        if t["ref_id"] in (pola_zu[0].get("equipment_refs") or [])
        or t.get("hv_bus_ref") == pola_zu[0].get("terminal_bus_ref")
    ]
    assert len(trafa_zu) == 1
    szyna_0_4 = trafa_zu[0]["lv_bus_ref"]
    assert szyny[szyna_0_4]["voltage_kv"] == pytest.approx(0.4)
    assert szyna_0_4 not in szyny_sekcji
    assert not [
        b
        for b in enm["bays"]
        if b.get("bus_ref") == szyna_0_4 and b.get("bay_role") in {"OUT", "FEEDER"}
    ]
    assert trafa_zu[0]["ref_id"] not in szyny_sekcji_transformatorow_gpz(enm)
    assert trafa_zu[0]["ref_id"] not in transformatory_zasilajace_gpz(enm)


def test_szablon_z17_przekladnik_napieciowy_konczy_tor_pola() -> None:
    aparaty = {a.designation_q: a for a in BAY_TEMPLATE_GPZ_POMIAR_NAPIECIA_Z17.devices}
    # Przekładnik napięciowy jest aparatem bocznym (profil `measurement`, §18.1) — koniec toru
    # wyznaczają porty (jeden port na węźle za złączem GK1), nie `placement` (rejestr konfliktów
    # UX04-Z17-KONIEC-TORU).
    assert aparaty["T1"].placement == "OFF_PATH"
    assert aparaty["GK1"].placement == "DOWNSTREAM"
    assert aparaty["T1"].odgalezienie is None
    assert aparaty["GK1"].odgalezienie is None
    assert aparaty["PF1"].placement == "OFF_PATH"


def test_pole_z17_w_modelu_przekladnik_na_koncu_toru() -> None:
    enm = zbuduj_gpz_110kv()
    sekcja = sorted({b["gpz_section_id"] for b in enm["bays"] if b.get("gpz_section_id")})[0]
    enm, _ = dodaj_pole_pomiaru_napiecia_z17(enm, sekcja)
    pole = next(b for b in enm["bays"] if "z17" in str(b.get("bay_template_ref") or ""))
    aparaty = {a["designation"]: a for a in pole["primary_devices"]}
    # Tor: szyna → Q1 → węzeł (PF1 z boku) → GK1 → koniec toru, na którym stoi T1.
    q1, gk1, t1 = aparaty["Q1"], aparaty["GK1"], aparaty["T1"]
    assert t1["placement"] == "OFF_PATH" and not t1.get("odgalezienie")
    assert gk1["placement"] == "DOWNSTREAM" and not gk1.get("odgalezienie")
    porty_gk1 = {p["wezel"] for p in gk1["ports"]}
    porty_t1 = {p["wezel"] for p in t1["ports"]}
    porty_q1 = {p["wezel"] for p in q1["ports"]}
    # T1 przyłączony do węzła za głowicą (koniec toru), nie do węzła za łącznikiem.
    assert porty_t1 <= porty_gk1
    assert not (porty_t1 & porty_q1)
