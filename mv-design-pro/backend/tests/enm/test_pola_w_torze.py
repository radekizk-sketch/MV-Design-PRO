"""Karta POLA-W-TORZE — aparat pola stacji w torze prądowym elementu, któremu pole służy.

Po co: stacja wstawiona w odcinek i stacja końca ciągu przyłączały kable i transformator do
szyny głównej, z pominięciem aparatów swoich pól. Aparat pola był martwy elektrycznie — jego
otwarcie niczego nie odłączało, a przez aparat nie płynął prąd elementu. Zasada toru
(`enm/tor_pola.py`): element jest przyłączony do ZACISKU pola, które mu służy, a szyna główna
niesie wyłącznie aparaty pól i sprzęgła.

Testy jako ILOCZYN CECH (reguła KLASA, NIE INSTANCJA):
  * {droga budowy: wcięcie A/B/C/D, koniec ciągu, konfigurator (transformator na szynie
    stacji), pierścień, odgałęzienie, pomiar w torze, promocja pól nN} × {element: połówka WE,
    połówka WY, odgałęzienie, pierścień, transformator (strona górna i dolna), odbiór nN}
    → element na zacisku pola, aparat pola w torze, szyna główna bez elementu mocy;
  * {stan aparatu: zamknięty, otwarty} × {pole: WE, WY, TR, wyłącznik główny nN, odpływ nN}
    → otwarcie odłącza element w wyniku rozpływu (prawda solvera, nie prognoza);
  * {konsument: łańcuch szeregowy zabezpieczenia (prąd aparatu = prąd zacisku elementu),
    zajętość, brama ścieżki zasilania, przynależność szyn do stacji, zgodność OSD} → wartość
    z toru aparatu pola;
  * jeden predykat ścieżki zasilania: {źródło na szynie nN stacji, na podrozdzielni za kablem
    nN, na polu źródła nN} × {transformator przez pole TR, brak transformatora w wyspie,
    łącznik otwarty w drodze};
  * walidator W042 + akcja naprawcza `przepnij_element_na_pole` z nazwanymi odmowami.
"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from application.protection_settings.zacisk_zabezpieczenia import (
    RODZAJE_LACZNIKOW,
    zacisk_lacznika_w_szeregu,
    zaciski_galezi,
)
from enm.domain_operations_v2 import transformatory_sciezki_zasilania
from enm.migrations.nn_field_specs_promocja import migruj
from enm.models import EnergyNetworkModel
from enm.tor_pola import (
    KOD_WALIDATORA_ELEMENT_OMIJA_POLE,
    naruszenia_zasady_toru,
    szyna_glowna_stacji,
    szyny_stacji,
)
from enm.validator import ENMValidator
from enm.zajetosc_pol import zacisk_pola, zajetosc_pola

from tests.golden.sld_substrate_power_flow import compute_substrate_power_flow
from tests.reference_networks.sceny_zajetosci_pol import (
    APARAT,
    TRAFO,
    _gpz,
    odcinek,
    ok,
    op,
    pola_liniowe,
)

TYPY_ODCINKA = ("cable", "line_overhead")


# ---------------------------------------------------------------------------
# Budowa scen
# ---------------------------------------------------------------------------


def _ciag_z_gpz(liczba_odcinkow: int = 2) -> dict[str, Any]:
    enm = _gpz(z_zaciskami=True, sekcje=1)
    pole = pola_liniowe(enm, "gpz/")[0]
    enm = ok(op(enm, "continue_trunk_segment_sn", {"field_ref": pole, "segment": odcinek(500)}))
    for n in range(1, liczba_odcinkow):
        enm = ok(op(enm, "continue_trunk_segment_sn", {"segment": odcinek(400 + n)}))
    return enm


def _odcinki(enm: dict[str, Any]) -> list[dict[str, Any]]:
    return [b for b in enm["branches"] if b.get("type") in TYPY_ODCINKA]


def _stacja(enm: dict[str, Any], nazwa: str) -> dict[str, Any]:
    return next(s for s in enm["substations"] if s.get("name") == nazwa)


def _wciecie(
    typ: str, sn_fields: list[Any], *, nazwa: str = "Stacja Lipowa", nn_feeders: int = 1
) -> dict[str, Any]:
    enm = _ciag_z_gpz()
    return ok(
        op(
            enm,
            "insert_station_on_segment_sn",
            {
                "segment_ref": _odcinki(enm)[0]["ref_id"],
                "field_apparatus_catalog_ref": APARAT,
                "station_type": typ,
                "insert_at": {"value": 0.5},
                "station": {"name": nazwa, "sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4},
                "sn_fields": sn_fields,
                "transformer": {"create": True, "transformer_catalog_ref": TRAFO},
                "nn_block": {"outgoing_feeders_nn_count": nn_feeders},
            },
        )
    )


def _koniec_ciagu(sn_fields: list[str], *, nazwa: str = "Stacja Brzozowa") -> dict[str, Any]:
    enm = _ciag_z_gpz(1)
    koniec = _odcinki(enm)[-1]["to_bus_ref"]
    return ok(
        op(
            enm,
            "append_station_on_endpoint",
            {
                "endpoint_bus_ref": koniec,
                "station": {"name": nazwa, "station_type": "terminal"},
                "field_apparatus_catalog_ref": APARAT,
                "transformer": {"transformer_catalog_ref": TRAFO},
                "nn_voltage_kv": 0.4,
                "sn_fields": [{"field_role": r} for r in sn_fields],
            },
        )
    )


def _pole_zacisku(enm: dict[str, Any], szyna: str) -> dict[str, Any] | None:
    """Specyfikacja pola SN, którego WŁASNYM zaciskiem jest `szyna`."""
    for stacja in enm["substations"]:
        for spec in (stacja.get("meta") or {}).get("field_specs") or []:
            zacisk = zacisk_pola(spec)
            if zacisk == szyna and zacisk != spec.get("bus_ref"):
                return spec
    return None


def _aparat_pola(enm: dict[str, Any], spec: dict[str, Any]) -> dict[str, Any]:
    """Aparat pola: łącznik między szyną pola a jego zaciskiem (dokładnie jeden)."""
    szyna, zacisk = spec["bus_ref"], zacisk_pola(spec)
    aparaty = [
        b
        for b in enm["branches"]
        if b.get("type") in RODZAJE_LACZNIKOW
        and {b["from_bus_ref"], b["to_bus_ref"]} == {szyna, zacisk}
    ]
    assert len(aparaty) == 1, (spec["field_ref"], aparaty)
    return aparaty[0]


def _szyna_glowna_niesie_tylko_aparaty(enm: dict[str, Any]) -> None:
    """Niezmiennik zasady toru: szyna główna stacji z polami (z własnym zaciskiem) niesie
    wyłącznie aparaty pól i sprzęgła — żadnego odcinka, transformatora, odbioru, źródła."""
    assert naruszenia_zasady_toru(enm) == []
    for stacja in enm["substations"]:
        if stacja.get("station_type") == "gpz":
            # GPZ nie modeluje pola zasilającego transformatora WN/SN ani pola źródła — na
            # sekcji nie ma aparatu, który mógłby być martwy (pozycja inwentarza w meldunku).
            continue
        specs = (stacja.get("meta") or {}).get("field_specs") or []
        szyny_z_polami = {
            s["bus_ref"] for s in specs if zacisk_pola(s) and zacisk_pola(s) != s.get("bus_ref")
        }
        for szyna in szyny_z_polami:
            for b in enm["branches"]:
                if szyna in (b["from_bus_ref"], b["to_bus_ref"]):
                    assert b.get("type") in RODZAJE_LACZNIKOW, (stacja["name"], b["ref_id"])
            for t in enm["transformers"]:
                assert szyna not in (t["hv_bus_ref"], t["lv_bus_ref"]), (stacja["name"], t)
            for kolekcja in ("loads", "generators", "sources"):
                for e in enm.get(kolekcja) or []:
                    assert e.get("bus_ref") != szyna, (stacja["name"], e["ref_id"])


def _w_torze_pola(enm: dict[str, Any], szyna: str, role: set[str]) -> dict[str, Any]:
    """`szyna` jest zaciskiem pola roli z `role`, a aparat pola łączy go z szyną pola."""
    spec = _pole_zacisku(enm, szyna)
    assert spec is not None, f"{szyna} nie jest zaciskiem pola stacji"
    assert str(spec.get("bay_role")).upper() in role, spec.get("bay_role")
    _aparat_pola(enm, spec)
    return spec


# ---------------------------------------------------------------------------
# 1. Iloczyn: droga budowy × element → element na zacisku właściwego pola
# ---------------------------------------------------------------------------

DROGI_WCIECIA = {
    "A": ["IN", "OUT"],
    "B": ["IN", "OUT", "FEEDER"],
    "C": ["IN", "OUT", "FEEDER", "FEEDER"],
    "D": None,  # sekcyjna — skład pól z typu (sekcja B, sprzęgło)
}


@pytest.mark.parametrize("typ", sorted(DROGI_WCIECIA))
def test_wciecie_polowki_i_transformator_na_zaciskach_pol(typ: str) -> None:
    pola = DROGI_WCIECIA[typ]
    enm = _wciecie(typ, pola) if pola is not None else _wciecie(typ, [])
    stacja = _stacja(enm, "Stacja Lipowa")
    polowki = [b for b in _odcinki(enm) if b["ref_id"].endswith(("segment_L", "segment_R"))]
    lewa = next(b for b in polowki if b["ref_id"].endswith("segment_L"))
    prawa = next(b for b in polowki if b["ref_id"].endswith("segment_R"))
    _w_torze_pola(enm, lewa["to_bus_ref"], {"IN"})
    spec_wy = _w_torze_pola(enm, prawa["from_bus_ref"], {"OUT"})
    transformator = next(
        t for t in enm["transformers"] if t["ref_id"] in stacja["transformer_refs"]
    )
    spec_tr = _w_torze_pola(enm, transformator["hv_bus_ref"], {"TR"})
    # Transformator należy do pola, na którego zacisku leży (a nie do każdego pola TR).
    assert transformator["ref_id"] in spec_tr["equipment_refs"]
    if typ == "D":
        # Pole wyjściowe stacji sekcyjnej stoi na sekcji B (aparat sekcja B → zacisk).
        assert spec_wy["bus_ref"] != lewa and spec_wy["bus_ref"] in stacja["bus_refs"]
        sprzeglo = next(
            b
            for b in enm["branches"]
            if b.get("type") == "bus_coupler" and b["ref_id"].startswith("stn/")
        )
        assert sprzeglo["to_bus_ref"] == spec_wy["bus_ref"]
    _szyna_glowna_niesie_tylko_aparaty(enm)


def test_wciecie_domyka_brakujace_pola_toru() -> None:
    """Skład pól bez pola WY i TR — operacja DOMYKA je (ta sama reguła w obu drogach budowy)."""
    enm = _wciecie("B", ["IN"])
    role = [s["bay_role"] for s in _stacja(enm, "Stacja Lipowa")["meta"]["field_specs"]]
    assert role == ["IN", "OUT", "TR"]
    _szyna_glowna_niesie_tylko_aparaty(enm)


def test_koniec_ciagu_odcinek_dojsciowy_i_transformator_na_zaciskach_pol() -> None:
    enm = _koniec_ciagu(["LINIA_IN", "LINIA_OUT"])
    stacja = _stacja(enm, "Stacja Brzozowa")
    dojscie = _odcinki(enm)[-1]
    _w_torze_pola(enm, dojscie["to_bus_ref"], {"IN"})
    transformator = next(
        t for t in enm["transformers"] if t["ref_id"] in stacja["transformer_refs"]
    )
    _w_torze_pola(enm, transformator["hv_bus_ref"], {"TR"})
    _szyna_glowna_niesie_tylko_aparaty(enm)


@pytest.mark.parametrize("droga", ["wciecie", "koniec_ciagu"])
def test_odgalezienie_i_ciag_ze_stacji_wychodza_z_zacisku_wolnego_pola(droga: str) -> None:
    if droga == "wciecie":
        enm, nazwa = _wciecie("C", ["IN", "OUT", "FEEDER"]), "Stacja Lipowa"
    else:
        enm, nazwa = _koniec_ciagu(["LINIA_IN", "LINIA_ODG"]), "Stacja Brzozowa"
    szyna = _stacja(enm, nazwa)["bus_refs"][0]
    # Start wskazany SZYNĄ stacji — kabel wychodzi z zacisku wolnego pola liniowego.
    enm = ok(op(enm, "start_branch_segment_sn", {"from_bus_ref": szyna, "segment": odcinek(200)}))
    odgalezienie = next(b for b in _odcinki(enm) if "branch_segment" in b["ref_id"])
    _w_torze_pola(enm, odgalezienie["from_bus_ref"], {"OUT", "FEEDER"})
    _szyna_glowna_niesie_tylko_aparaty(enm)


def test_pierscien_do_szyny_stacji_zamyka_sie_przez_wolne_pole() -> None:
    enm = _wciecie("C", ["IN", "OUT", "FEEDER"])
    szyna = _stacja(enm, "Stacja Lipowa")["bus_refs"][0]
    koniec = _odcinki(enm)[-1]["to_bus_ref"]
    enm = ok(
        op(
            enm,
            "connect_secondary_ring_sn",
            {"from_bus_ref": koniec, "to_bus_ref": szyna, "segment": odcinek(600)},
        )
    )
    pierscien = [b for b in _odcinki(enm) if koniec in (b["from_bus_ref"], b["to_bus_ref"])][-1]
    drugi = (
        pierscien["to_bus_ref"]
        if pierscien["from_bus_ref"] == koniec
        else pierscien["from_bus_ref"]
    )
    _w_torze_pola(enm, drugi, {"FEEDER", "OUT"})
    _szyna_glowna_niesie_tylko_aparaty(enm)


def test_pomiar_rozliczeniowy_w_torze_czesc_kliencka_za_polem_pomiaru() -> None:
    """Pole układu pomiarowego energii leży w torze części klienckiej: pola wypisane po nim
    wychodzą z jego zacisku (POMIAR_ROZLICZENIOWY_SN_V1 §3), a transformator klienta leży
    na zacisku pola TR za pomiarem. Stacja abonencka na końcu ciągu (w torze tranzytu
    magistrali pomiar jest zakazany bramą pomiaru)."""
    enm = _koniec_ciagu(["LINIA_IN", "POMIAROWE", "TRANSFORMATOROWE"])
    stacja = _stacja(enm, "Stacja Brzozowa")
    specs = {s["bay_role"]: s for s in stacja["meta"]["field_specs"]}
    pomiar = next(s for s in stacja["meta"]["field_specs"] if s.get("field_role") == "POMIAROWE")
    assert pomiar.get("funkcja_pomiaru") == "UKLAD_ENERGII"
    assert specs["TR"]["bus_ref"] == zacisk_pola(pomiar)
    transformator = next(
        t for t in enm["transformers"] if t["ref_id"] in stacja["transformer_refs"]
    )
    _w_torze_pola(enm, transformator["hv_bus_ref"], {"TR"})
    _szyna_glowna_niesie_tylko_aparaty(enm)


# --- konfigurator: transformator dokładany na szynie stacji ---------------------------------


def test_transformator_na_szynie_stacji_przechodzi_przez_wolne_pole_tr() -> None:
    enm = _wciecie("B", ["IN", "OUT", "TR", "TR"])
    stacja = _stacja(enm, "Stacja Lipowa")
    szyna = stacja["bus_refs"][0]
    wynik = ok(
        op(
            enm,
            "add_transformer_sn_nn",
            {"hv_bus_ref": szyna, "lv_voltage_kv": 0.4, "transformer_catalog_ref": TRAFO},
        )
    )
    nowy = next(t for t in wynik["transformers"] if t["ref_id"].startswith("tr/"))
    spec = _w_torze_pola(wynik, nowy["hv_bus_ref"], {"TR"})
    assert nowy["ref_id"] in spec["equipment_refs"]
    _szyna_glowna_niesie_tylko_aparaty(wynik)


def test_transformator_na_szynie_stacji_bez_wolnego_pola_tr_to_nazwana_odmowa() -> None:
    enm = _wciecie("B", ["IN", "OUT", "TR"])
    przed = copy.deepcopy(enm)
    wynik = op(
        enm,
        "add_transformer_sn_nn",
        {
            "hv_bus_ref": _stacja(enm, "Stacja Lipowa")["bus_refs"][0],
            "lv_voltage_kv": 0.4,
            "transformer_catalog_ref": TRAFO,
        },
    )
    assert wynik.get("error_code") == "tor.field_missing"
    assert wynik.get("snapshot") is None
    assert "pole transformatorowe" in wynik["error"]
    assert enm == przed


def test_transformator_na_szynie_bez_pol_bez_zmian() -> None:
    """Szyna goła (brak rozdzielnicy z polami) — zasada toru nie ma tam pola; jak dotąd."""
    enm = _ciag_z_gpz(1)
    koniec = _odcinki(enm)[-1]["to_bus_ref"]
    wynik = ok(
        op(
            enm,
            "add_transformer_sn_nn",
            {"hv_bus_ref": koniec, "lv_voltage_kv": 0.4, "transformer_catalog_ref": TRAFO},
        )
    )
    assert any(t["hv_bus_ref"] == koniec for t in wynik["transformers"])


# ---------------------------------------------------------------------------
# 2. Strona nN: promocja pól nN wg zasady toru (wyłącznik główny, odpływ, pole źródła)
# ---------------------------------------------------------------------------


def _stacja_z_odbiorem_nn() -> tuple[EnergyNetworkModel, dict[str, Any]]:
    enm = _wciecie("B", ["IN", "OUT"], nn_feeders=2)
    stacja = _stacja(enm, "Stacja Lipowa")
    odplyw = next(f["field_ref"] for f in stacja["meta"]["nn_field_specs"] if f["bay_role"] != "IN")
    enm = ok(
        op(enm, "add_nn_load", {"feeder_ref": odplyw, "active_power_kw": 100.0, "cos_phi": 0.9})
    )
    model, zmieniono = migruj(EnergyNetworkModel.model_validate(enm))
    assert zmieniono
    return model, stacja


def _aparat_promowany(model: EnergyNetworkModel, field_ref: str) -> Any:
    return next(
        b for b in model.branches if (b.meta or {}).get("nn_field_migrowany_z") == field_ref
    )


def test_promocja_nn_wylacznik_glowny_w_torze_transformator_szyna_nn() -> None:
    model, stacja = _stacja_z_odbiorem_nn()
    specs = stacja["meta"]["nn_field_specs"]
    wylacznik = next(s for s in specs if s["bay_role"] == "IN")
    aparat_in = _aparat_promowany(model, wylacznik["field_ref"])
    transformator = next(t for t in model.transformers if t.ref_id in stacja["transformer_refs"])
    # Tor: transformator (strona dolna) → wyłącznik główny nN → szyna nN.
    assert transformator.lv_bus_ref == aparat_in.to_bus_ref
    assert aparat_in.from_bus_ref == wylacznik["bus_ref"]
    # Odbiór za aparatem swojego odpływu, nie na szynie rozdzielnicy.
    odbior = model.loads[0]
    aparat_odplywu = _aparat_promowany(model, odbior.meta["feeder_ref"])
    assert odbior.bus_ref == aparat_odplywu.to_bus_ref
    assert odbior.bus_ref != wylacznik["bus_ref"]
    # Szyna rozdzielnicy nN niesie wyłącznie aparaty pól.
    for b in model.branches:
        if wylacznik["bus_ref"] in (b.from_bus_ref, b.to_bus_ref):
            assert b.type in RODZAJE_LACZNIKOW
    # Migracja jest idempotentna (drugi przebieg nic nie zmienia).
    assert migruj(model)[1] is False


def test_promocja_nn_wczesniej_promowany_wpis_przepina_transformator() -> None:
    """Model promowany dawną regułą (aparat IN obok transformatora wiszącego na szynie nN) —
    ta sama reguła toru przepina transformator za wyłącznik główny przy odczycie."""
    model, stacja = _stacja_z_odbiorem_nn()
    wylacznik = next(s for s in stacja["meta"]["nn_field_specs"] if s["bay_role"] == "IN")
    dawny = model.model_copy(deep=True)
    for t in dawny.transformers:
        if t.ref_id in stacja["transformer_refs"]:
            t.lv_bus_ref = wylacznik["bus_ref"]
    naprawiony, zmieniono = migruj(dawny)
    assert zmieniono
    aparat_in = _aparat_promowany(naprawiony, wylacznik["field_ref"])
    assert any(t.lv_bus_ref == aparat_in.to_bus_ref for t in naprawiony.transformers)


# ---------------------------------------------------------------------------
# 3. Stan aparatu × pole → otwarcie odłącza element (prawda solvera rozpływu)
# ---------------------------------------------------------------------------


def _szyny_bez_zasilania(model: EnergyNetworkModel) -> set[str]:
    wynik = compute_substrate_power_flow(model, case_ref="pola-w-torze", case_label="test")
    assert wynik["converged"]
    return set(wynik["de_energized_bus_refs"])


def _pole_sn(stacja: dict[str, Any], rola: str) -> dict[str, Any]:
    return next(s for s in stacja["meta"]["field_specs"] if s["bay_role"] == rola)


@pytest.mark.parametrize("stan", ["closed", "open"])
@pytest.mark.parametrize("pole", ["WE", "WY", "TR", "IN_nN", "odplyw_nN"])
def test_otwarcie_aparatu_pola_odlacza_element_w_rozplywie(stan: str, pole: str) -> None:
    model, stacja = _stacja_z_odbiorem_nn()
    enm = model.model_dump(mode="json")
    transformator = next(
        t for t in enm["transformers"] if t["ref_id"] in stacja["transformer_refs"]
    )
    odbior = enm["loads"][0]
    prawa = next(b for b in _odcinki(enm) if b["ref_id"].endswith("segment_R"))
    wylacznik_nn = next(s for s in stacja["meta"]["nn_field_specs"] if s["bay_role"] == "IN")
    if pole == "WE":
        aparat_ref = _aparat_pola(enm, _pole_sn(stacja, "IN"))["ref_id"]
        # Stacja zasilana wyłącznie przez pole WE: bez niego gaśnie stacja i dalszy ciąg.
        odlaczone = {transformator["lv_bus_ref"], odbior["bus_ref"], prawa["to_bus_ref"]}
    elif pole == "WY":
        aparat_ref = _aparat_pola(enm, _pole_sn(stacja, "OUT"))["ref_id"]
        odlaczone = {prawa["to_bus_ref"]}
    elif pole == "TR":
        aparat_ref = _aparat_pola(enm, _pole_sn(stacja, "TR"))["ref_id"]
        odlaczone = {transformator["lv_bus_ref"], odbior["bus_ref"]}
    elif pole == "IN_nN":
        aparat_ref = _aparat_promowany(model, wylacznik_nn["field_ref"]).ref_id
        odlaczone = {wylacznik_nn["bus_ref"], odbior["bus_ref"]}
    else:
        aparat_ref = _aparat_promowany(model, odbior["meta"]["feeder_ref"]).ref_id
        odlaczone = {odbior["bus_ref"]}
    for b in enm["branches"]:
        if b["ref_id"] == aparat_ref:
            b["status"] = stan
    bez_zasilania = _szyny_bez_zasilania(EnergyNetworkModel.model_validate(enm))
    if stan == "closed":
        assert bez_zasilania == set()
    else:
        assert odlaczone <= bez_zasilania, (pole, odlaczone - bez_zasilania)


# ---------------------------------------------------------------------------
# 4. Konsumenci: prąd aparatu pola = prąd zacisku elementu (łańcuch szeregowy KCL)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("rola", "element", "zacisk"),
    [("IN", "segment_L", "do"), ("OUT", "segment_R", "od"), ("TR", "transformer", "od")],
)
def test_aparat_pola_w_szeregu_z_zaciskiem_elementu(rola: str, element: str, zacisk: str) -> None:
    """Zabezpieczenie i przekładnik pola czytają prąd zacisku elementu, z którym aparat stoi
    w szeregu (`zacisk_zabezpieczenia`, reguła KCL). Martwy aparat (dawny stan) — model
    milczał; aparat w torze — model rozstrzyga zacisk elementu, któremu pole służy."""
    enm = _wciecie("B", ["IN", "OUT"])
    stacja = _stacja(enm, "Stacja Lipowa")
    aparat = _aparat_pola(enm, _pole_sn(stacja, rola))
    element_ref = next(
        r
        for r in [b["ref_id"] for b in enm["branches"]] + [t["ref_id"] for t in enm["transformers"]]
        if r.endswith(element) and (r.startswith("seg/") or r in stacja["transformer_refs"])
    )
    zaciski = zaciski_galezi(enm, element_ref)
    assert zaciski is not None
    assert zacisk_lacznika_w_szeregu(enm, aparat["ref_id"], zaciski) == zacisk


def test_zajetosc_pola_wy_stacji_przelotowej_z_jednego_zrodla() -> None:
    enm = _wciecie("B", ["IN", "OUT", "FEEDER"])
    stacja = _stacja(enm, "Stacja Lipowa")
    assert zajetosc_pola(enm, _pole_sn(stacja, "OUT")["field_ref"]).zajete
    assert zajetosc_pola(enm, _pole_sn(stacja, "IN")["field_ref"]).zajete
    assert not zajetosc_pola(enm, _pole_sn(stacja, "FEEDER")["field_ref"]).zajete
    # „Kontynuuj ciąg" ze stacji: kabel z WOLNEGO pola, nigdy z zajętego.
    wynik = ok(
        op(
            enm,
            "continue_trunk_segment_sn",
            {"from_terminal_id": stacja["bus_refs"][0], "segment": odcinek(150)},
        )
    )
    nowy = _odcinki(wynik)[-1]
    assert nowy["from_bus_ref"] == zacisk_pola(_pole_sn(stacja, "FEEDER"))


def test_kontynuacja_ze_stacji_bez_wolnego_pola_to_nazwana_odmowa() -> None:
    enm = _wciecie("A", ["IN", "OUT"])
    przed = copy.deepcopy(enm)
    wynik = op(
        enm,
        "continue_trunk_segment_sn",
        {"from_terminal_id": _stacja(enm, "Stacja Lipowa")["bus_refs"][0], "segment": odcinek(150)},
    )
    assert wynik.get("snapshot") is None
    assert wynik.get("error_code") == "field.line_field_occupied"
    assert enm == przed


def test_przynaleznosc_szyn_do_stacji_obejmuje_zaciski_pol() -> None:
    model, stacja = _stacja_z_odbiorem_nn()
    enm = model.model_dump(mode="json")
    szyny = szyny_stacji(
        stacja
        | {"meta": next(s for s in enm["substations"] if s["ref_id"] == stacja["ref_id"])["meta"]},
        enm["branches"],
    )
    transformator = next(
        t for t in enm["transformers"] if t["ref_id"] in stacja["transformer_refs"]
    )
    assert transformator["hv_bus_ref"] in szyny and transformator["lv_bus_ref"] in szyny
    assert enm["loads"][0]["bus_ref"] in szyny
    # Szyna główna za zaciskiem: SN — szyna pola; nN za wyłącznikiem głównym — szyna nN.
    wylacznik_nn = next(s for s in stacja["meta"]["nn_field_specs"] if s["bay_role"] == "IN")
    assert (
        szyna_glowna_stacji(stacja, enm["branches"], transformator["lv_bus_ref"])
        == wylacznik_nn["bus_ref"]
    )
    assert (
        szyna_glowna_stacji(stacja, enm["branches"], transformator["hv_bus_ref"])
        == stacja["bus_refs"][0]
    )
    assert szyna_glowna_stacji(stacja, enm["branches"], "szyna-obca") is None
    # Ten sam wynik na obiektach modelu (konsumenci pracują na obu postaciach).
    stacja_model = next(s for s in model.substations if s.ref_id == stacja["ref_id"])
    assert szyny_stacji(stacja_model, model.branches) == szyny


def test_zgodnosc_osd_stacja_slupowa_widzi_kabel_na_zacisku_pola() -> None:
    """Reguła OSD „stacja słupowa bez kablowego podejścia SN" pytała o kabel na szynie
    głównej — po zasadzie toru kabel leży na zacisku pola, więc reguła przepuszczała kablowe
    podejście. Przynależność szyn do stacji z jednego źródła."""
    from reference_engine.compliance import evaluate_enm

    enm = _wciecie("B", ["IN", "OUT"])
    for stacja in enm["substations"]:
        if stacja.get("name") == "Stacja Lipowa":
            stacja["station_type"] = "mv_lv"
            stacja["construction_type"] = "slupowa"
    raport = evaluate_enm(EnergyNetworkModel.model_validate(enm), ["osd_enea"])
    werdykty = [
        c.status
        for pakiet in raport.packs
        for c in pakiet.checks
        if c.rule_code == "osd_enea.station.pole_station_cable_entry_forbidden"
    ]
    assert werdykty == ["fail"]


# ---------------------------------------------------------------------------
# 5. Jeden predykat ścieżki zasilania (brama źródła po stronie nN)
# ---------------------------------------------------------------------------


def _siec_predykatu(miejsce: str, droga: str) -> tuple[dict[str, Any], str]:
    """Stacja: szyna SN → pole TR (aparat) → transformator → szyna nN; źródło w `miejsce`
    × droga {tr_przez_pole, bez_tr_w_wyspie, lacznik_otwarty}."""
    szyny = [
        {"ref_id": r, "name": r, "voltage_kv": kv, "tags": [], "meta": {}}
        for r, kv in (
            ("sn", 15.0),
            ("sn_tr_zacisk", 15.0),
            ("nn", 0.4),
            ("nn_zrodlo", 0.4),
            ("nn_podrozdzielnia", 0.4),
        )
    ]
    galezie = [
        {
            "ref_id": "aparat_tr",
            "type": "breaker",
            "from_bus_ref": "sn",
            "to_bus_ref": "sn_tr_zacisk",
            "status": "closed",
        },
        {
            "ref_id": "aparat_zrodla",
            "type": "breaker",
            "from_bus_ref": "nn",
            "to_bus_ref": "nn_zrodlo",
            "status": "open" if droga == "lacznik_otwarty" else "closed",
        },
        {
            "ref_id": "kabel_nn",
            "type": "cable",
            "from_bus_ref": "nn",
            "to_bus_ref": "nn_podrozdzielnia",
            "status": "open" if droga == "lacznik_otwarty" else "closed",
        },
    ]
    transformatory = (
        []
        if droga == "bez_tr_w_wyspie"
        else [{"ref_id": "tr", "hv_bus_ref": "sn_tr_zacisk", "lv_bus_ref": "nn"}]
    )
    szyna = {
        "szyna_stacji": "nn",
        "pole_zrodla": "nn_zrodlo",
        "podrozdzielnia": "nn_podrozdzielnia",
    }[miejsce]
    return {"buses": szyny, "branches": galezie, "transformers": transformatory}, szyna


@pytest.mark.parametrize("droga", ["tr_przez_pole", "bez_tr_w_wyspie", "lacznik_otwarty"])
@pytest.mark.parametrize("miejsce", ["szyna_stacji", "pole_zrodla", "podrozdzielnia"])
def test_jeden_predykat_sciezki_zasilania(miejsce: str, droga: str) -> None:
    """Graf STRUKTURALNY: brama pyta o projekt (źródło po stronie dolnej transformatora),
    nie o stan łączeniowy studium — otwarty łącznik w drodze nie zmienia odpowiedzi (wyspę
    odciętą pokazuje rozpływ). Transformator przyłączony przez pole TR jest widoczny (dawny
    predykat przynależności do stacji go gubił), podrozdzielnia za kablem nN też."""
    enm, szyna = _siec_predykatu(miejsce, droga)
    transformatory = [t["ref_id"] for t in transformatory_sciezki_zasilania(enm, szyna)]
    assert transformatory == ([] if droga == "bez_tr_w_wyspie" else ["tr"])


def test_brama_zrodla_nn_przyjmuje_zrodlo_za_polem_na_stacji_z_torem() -> None:
    """Operacja: źródło PV po stronie nN stacji zbudowanej wg zasady toru (transformator na
    zacisku pola TR, strona dolna za wyłącznikiem głównym) — brama widzi transformator."""
    model, stacja = _stacja_z_odbiorem_nn()
    enm = model.model_dump(mode="json")
    wylacznik_nn = next(s for s in stacja["meta"]["nn_field_specs"] if s["bay_role"] == "IN")
    assert transformatory_sciezki_zasilania(enm, wylacznik_nn["bus_ref"])


# ---------------------------------------------------------------------------
# 6. Walidator W042 + akcja naprawcza `przepnij_element_na_pole`
# ---------------------------------------------------------------------------


def _model_zastany() -> tuple[dict[str, Any], dict[str, Any]]:
    """Stan modelu sprzed karty: połówki odcinka i transformator na szynie głównej, aparaty
    pól martwe (odtwarzany wprost — żadna operacja już takiego stanu nie buduje)."""
    enm = _wciecie("B", ["IN", "OUT", "FEEDER"])
    stacja = _stacja(enm, "Stacja Lipowa")
    szyna = stacja["bus_refs"][0]
    for b in enm["branches"]:
        if b["ref_id"].endswith("segment_L"):
            b["to_bus_ref"] = szyna
        if b["ref_id"].endswith("segment_R"):
            b["from_bus_ref"] = szyna
    for t in enm["transformers"]:
        if t["ref_id"] in stacja["transformer_refs"]:
            t["hv_bus_ref"] = szyna
    return enm, stacja


def test_walidator_w042_wskazuje_element_i_pole_z_akcja_naprawcza() -> None:
    enm, stacja = _model_zastany()
    zgloszenia = [
        i
        for i in ENMValidator().validate(EnergyNetworkModel.model_validate(enm)).issues
        if i.code == KOD_WALIDATORA_ELEMENT_OMIJA_POLE
    ]
    elementy = sorted(i.element_refs[0].rsplit("/", 1)[-1] for i in zgloszenia)
    assert elementy == ["segment_L", "segment_R", "transformer"]
    for zgloszenie in zgloszenia:
        assert zgloszenie.severity == "IMPORTANT"
        assert zgloszenie.fix_action is not None
        assert zgloszenie.fix_action.modal_type == "przepnij_element_na_pole"
        field_ref = zgloszenie.fix_action.payload_hint["field_ref"]
        rola = next(
            s["bay_role"] for s in stacja["meta"]["field_specs"] if s["field_ref"] == field_ref
        )
        assert (
            rola
            == {"segment_L": "IN", "segment_R": "OUT", "transformer": "TR"}[
                zgloszenie.element_refs[0].rsplit("/", 1)[-1]
            ]
        )
        assert "/" not in zgloszenie.message_pl.split("—")[0] or "„" in zgloszenie.message_pl
    # Most gotowości: W042 == kanoniczny `station.element_bypasses_field`.
    from domain.readiness_bridge import ODWZOROWANIE_WALIDATOR_NA_KANON

    assert ODWZOROWANIE_WALIDATOR_NA_KANON["W042"] == "station.element_bypasses_field"


def test_akcja_naprawcza_przepina_kazdy_element_i_zeruje_w042() -> None:
    enm, _ = _model_zastany()
    for naruszenie in naruszenia_zasady_toru(enm):
        wynik = op(enm, "przepnij_element_na_pole", {"element_ref": naruszenie.element_ref})
        assert wynik.get("error") is None, wynik.get("error")
        assert wynik["domain_events"][0]["event_type"] == "ELEMENT_REATTACHED_TO_FIELD"
        enm = wynik["snapshot"]
    _szyna_glowna_niesie_tylko_aparaty(enm)
    kody = {i.code for i in ENMValidator().validate(EnergyNetworkModel.model_validate(enm)).issues}
    assert KOD_WALIDATORA_ELEMENT_OMIJA_POLE not in kody


def test_akcja_naprawcza_odmowy_nazwane_bez_skutku() -> None:
    enm, stacja = _model_zastany()
    przed = copy.deepcopy(enm)
    lewa = next(b["ref_id"] for b in enm["branches"] if b["ref_id"].endswith("segment_L"))
    transformator = stacja["transformer_refs"][0]
    pola = {s["bay_role"]: s["field_ref"] for s in stacja["meta"]["field_specs"]}
    przypadki = [
        ({}, "tor.element_missing"),
        (
            {
                "element_ref": next(
                    b["ref_id"]
                    for b in _odcinki(enm)
                    if not b["ref_id"].endswith(("segment_L", "segment_R"))
                )
            },
            "tor.element_not_bypassing_field",
        ),
        ({"element_ref": lewa, "field_ref": "pole-nieistniejace"}, "tor.field_not_found"),
        ({"element_ref": lewa, "field_ref": pola["OUT"]}, "tor.field_role_mismatch"),
        ({"element_ref": transformator, "field_ref": pola["FEEDER"]}, "tor.field_role_mismatch"),
    ]
    for payload, kod in przypadki:
        wynik = op(enm, "przepnij_element_na_pole", payload)
        assert wynik.get("error_code") == kod, (
            payload,
            wynik.get("error_code"),
            wynik.get("error"),
        )
        assert wynik.get("snapshot") is None
        assert enm == przed


def test_akcja_naprawcza_pole_zajete_i_brak_wolnego_pola() -> None:
    enm, stacja = _model_zastany()
    pola = {s["bay_role"]: s["field_ref"] for s in stacja["meta"]["field_specs"]}
    lewa = next(b["ref_id"] for b in enm["branches"] if b["ref_id"].endswith("segment_L"))
    prawa = next(b["ref_id"] for b in enm["branches"] if b["ref_id"].endswith("segment_R"))
    # Prawa połówka przepięta na pole FEEDER (wolne) — potem pole to jest zajęte.
    enm = ok(
        op(enm, "przepnij_element_na_pole", {"element_ref": prawa, "field_ref": pola["FEEDER"]})
    )
    zajete = op(enm, "przepnij_element_na_pole", {"element_ref": lewa, "field_ref": pola["FEEDER"]})
    assert zajete.get("error_code") in {"tor.field_role_mismatch", "field.line_field_occupied"}
    # Stacja bez wolnego pola TR: transformator bez celu — odmowa z akcją „dodaj pole".
    bez_tr = copy.deepcopy(enm)
    for s in bez_tr["substations"]:
        if s["ref_id"] == stacja["ref_id"]:
            s["meta"]["field_specs"] = [
                f for f in s["meta"]["field_specs"] if f["bay_role"] != "TR"
            ]
    wynik = op(bez_tr, "przepnij_element_na_pole", {"element_ref": stacja["transformer_refs"][0]})
    assert wynik.get("error_code") in {"tor.element_not_bypassing_field", "tor.field_missing"}


def _bez_znacznikow_czasu(enm: dict[str, Any]) -> dict[str, Any]:
    kopia = copy.deepcopy(enm)
    kopia["header"].pop("created_at", None)
    kopia["header"].pop("updated_at", None)
    return kopia


def test_determinizm_budowy_wg_zasady_toru() -> None:
    """Te same operacje → te same identyfikatory zacisków, aparatów i przyłączeń."""
    assert _bez_znacznikow_czasu(_wciecie("C", ["IN", "OUT", "FEEDER"])) == _bez_znacznikow_czasu(
        _wciecie("C", ["IN", "OUT", "FEEDER"])
    )
    assert _bez_znacznikow_czasu(_koniec_ciagu(["LINIA_IN", "LINIA_OUT"])) == (
        _bez_znacznikow_czasu(_koniec_ciagu(["LINIA_IN", "LINIA_OUT"]))
    )
