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
    wyłącznie aparaty pól i sprzęgła — żadnego odcinka, transformatora, odbioru, źródła.
    Walidator nie zgłasza ani ominięcia pola (W042), ani rozdzielenia pól wejściowego
    i wyjściowego na różne magistrale (E021 — sekcja B za sprzęgłem i część kliencka za
    polem pomiaru to JEDNA magistrala rozdzielnicy stacji)."""
    assert naruszenia_zasady_toru(enm) == []
    kody = {i.code for i in ENMValidator().validate(EnergyNetworkModel.model_validate(enm)).issues}
    assert not {"W042", "E021"} & kody, kody
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


# ---------------------------------------------------------------------------
# 7. Punkt zwarcia na zacisku pola (konsumenci wyniku zwarciowego: nastawy, koordynacja)
# ---------------------------------------------------------------------------


def test_typy_lacznikow_wezla_rowne_topologii() -> None:
    from enm.topology import TYPY_LACZNIKOW_ENM
    from enm.tor_pola import TYPY_LACZNIKOW

    assert TYPY_LACZNIKOW == TYPY_LACZNIKOW_ENM


@pytest.mark.parametrize("stan", ["closed", "open"])
def test_szyna_raportowa_zacisku_pola_to_szyna_pola_tylko_przy_zamknietym_aparacie(
    stan: str,
) -> None:
    """Zwarcie na zacisku pola za ZAMKNIĘTYM aparatem to zwarcie na szynie pola (jeden węzeł
    elektryczny, solver zwarciowy scala zamknięte łączniki); otwarty aparat rozdziela węzły —
    zacisk zostaje sobą (wynik go nie raportuje, konsument odmawia, bez domysłu)."""
    from enm.tor_pola import szyna_raportowa, wezel_elektryczny

    enm = _wciecie("B", ["IN", "OUT"])
    stacja = _stacja(enm, "Stacja Lipowa")
    pole_we = _pole_sn(stacja, "IN")
    aparat = _aparat_pola(enm, pole_we)
    aparat["status"] = stan
    zacisk = zacisk_pola(pole_we)
    szyna = stacja["bus_refs"][0]
    if stan == "closed":
        assert szyna_raportowa(enm, zacisk) == szyna
        assert {zacisk, szyna} <= wezel_elektryczny(enm, zacisk)
    else:
        assert szyna_raportowa(enm, zacisk) == zacisk
        assert szyna not in wezel_elektryczny(enm, zacisk)
    # Szyna niepomocnicza raportuje sama siebie.
    assert szyna_raportowa(enm, szyna) == szyna


@pytest.mark.parametrize("rola", ["IN", "OUT"])
def test_ocena_nadpradowa_ma_punkt_na_zacisku_pola_z_wierszem_szyny_stacji(rola: str) -> None:
    """Ocena nadprądowa (jedna ścieżka ``ocena_nadpradowa``): zabezpieczenie przy wyłączniku
    pola — zwarcie na ZACISKU pola za wyłącznikiem (głowica odcinka) jest punktem oceny, a jego
    Ik'' i rozpływ pochodzą z wiersza SZYNY STACJI (zacisk za zamkniętym aparatem, ten sam
    węzeł elektryczny — ``szyna_raportowa``). Pole WE: strefa leży w stronę GPZ tylko wtedy,
    gdy zasilanie jest z drugiej strony — tu zasilanie jest od GPZ, więc strona zasilania
    wyłącznika pola WE to zacisk, a strefą jest szyna stacji (punkt zacisku nie powstaje)."""
    from application.analyses.protection.ocena_nadpradowa import (
        punkty_zwarcia_strefy,
        strefa_urzadzenia,
    )
    from enm.mapping import map_enm_to_network_graph, ref_to_graph_id
    from enm.tor_pola import ZNACZNIK_SZYNY_POMOCNICZEJ

    enm = _wciecie("B", ["IN", "OUT"])
    stacja = _stacja(enm, "Stacja Lipowa")
    pole = _pole_sn(stacja, rola)
    aparat = _aparat_pola(enm, pole)
    assert aparat["type"] == "breaker"  # aparat pola z katalogu `APARAT` (wyłącznik VD4)
    zacisk = zacisk_pola(pole)
    szyna = stacja["bus_refs"][0]
    model = EnergyNetworkModel.model_validate(enm)
    graf = map_enm_to_network_graph(model)
    strefa, braki, _ = strefa_urzadzenia(
        graf, ref_to_graph_id(aparat["ref_id"]), nazwa_aparatu="aparat pola"
    )
    assert braki == [] and strefa is not None
    # Wiersze biegu SC: każda szyna poza pomocniczymi (reguła celu zwarcia `enm/assembler.py`).
    wyniku = frozenset(
        ref_to_graph_id(b["ref_id"])
        for b in enm["buses"]
        if ZNACZNIK_SZYNY_POMOCNICZEJ not in (b.get("tags") or [])
    )
    punkty, _inne = punkty_zwarcia_strefy(
        enm=model, graph=graf, strefa=strefa, punkty_wyniku=wyniku
    )
    na_zacisku = [p for p in punkty if p.punkt_ref == ref_to_graph_id(zacisk)]
    if rola == "OUT":
        assert [p.punkt_wyniku_ref for p in na_zacisku] == [ref_to_graph_id(szyna)]
        assert ref_to_graph_id(szyna) not in strefa.wezly
    else:
        assert na_zacisku == []
        assert ref_to_graph_id(szyna) in {p.punkt_ref for p in punkty}
    # Żaden punkt nie jest szyną pomocniczą raportowaną pod szyną TEJ SAMEJ strefy.
    assert all(
        p.punkt_ref == p.punkt_wyniku_ref or p.punkt_wyniku_ref not in strefa.wezly for p in punkty
    )


@pytest.mark.parametrize(
    "transformator",
    [
        {"transformer_catalog_ref": TRAFO},
        {"catalog_ref": TRAFO},
        {
            "catalog_binding": {
                "catalog_namespace": "TRAFO_SN_NN",
                "catalog_item_id": TRAFO,
                "catalog_item_version": "2024.1",
            }
        },
    ],
    ids=["transformer_catalog_ref", "catalog_ref", "catalog_binding"],
)
def test_stacja_konca_ciagu_przyjmuje_kazdy_kanal_katalogu_transformatora(
    transformator: dict[str, Any],
) -> None:
    """Każdy kanał wskazania transformatora (referencja albo wiązanie katalog-first) daje
    transformator na zacisku pola TR — dawniej samo wiązanie było po cichu pomijane
    i stacja końca ciągu powstawała bez transformatora."""
    enm = _ciag_z_gpz(1)
    enm = ok(
        op(
            enm,
            "append_station_on_endpoint",
            {
                "endpoint_bus_ref": _odcinki(enm)[-1]["to_bus_ref"],
                "station": {"name": "Stacja Brzozowa", "station_type": "terminal"},
                "field_apparatus_catalog_ref": APARAT,
                "transformer": transformator,
                "nn_voltage_kv": 0.4,
                "sn_fields": [{"field_role": "LINIA_IN"}],
            },
        )
    )
    stacja = _stacja(enm, "Stacja Brzozowa")
    assert len(stacja["transformer_refs"]) == 1
    transformator_modelu = next(
        t for t in enm["transformers"] if t["ref_id"] in stacja["transformer_refs"]
    )
    _w_torze_pola(enm, transformator_modelu["hv_bus_ref"], {"TR"})


# ---------------------------------------------------------------------------
# Pole toru, którego skład projektanta nie ma, bez wspólnego aparatu pól → nazwana odmowa
# ---------------------------------------------------------------------------

POLA_TORU_OPERACJI = {
    # operacja → (rola pola toru w ładunku, nazwa pola w komunikacie)
    "insert_station_on_segment_sn": (
        ("LINIA_IN", "Pole liniowe wejściowe"),
        ("LINIA_OUT", "Pole liniowe wyjściowe"),
        ("TRANSFORMATOROWE", "Pole transformatorowe"),
    ),
    "append_station_on_endpoint": (
        ("LINIA_IN", "Pole liniowe wejściowe"),
        ("TRANSFORMATOROWE", "Pole transformatorowe"),
    ),
}


@pytest.mark.parametrize(
    ("operacja", "brak", "nazwa"),
    [(o, rola, nazwa) for o, pola in POLA_TORU_OPERACJI.items() for rola, nazwa in pola],
)
def test_brak_pola_toru_bez_wspolnego_aparatu_to_nazwana_odmowa_bez_skutku(
    operacja: str, brak: str, nazwa: str
) -> None:
    """Każde pole toru operacji × jego brak w składzie: każde zadeklarowane pole ma własny
    aparat, ale ładunek nie wskazuje wspólnego aparatu pól, więc operacja nie ma czym domknąć
    brakującego pola (B-12: bez domysłu). Odmowa nazywa BRAKUJĄCE pole (nie „aparat tego
    pola", którego na liście projektanta nie ma), niesie dotychczasowy kod i nie zmienia
    modelu. Ta sama sytuacja z kompletnym składem przechodzi (kontrola, że odmowę daje brak
    pola, nie inna reguła)."""
    enm = _ciag_z_gpz(1)
    role = [r for r, _ in POLA_TORU_OPERACJI[operacja]]
    sklad = [{"field_role": r, "apparatus_catalog_ref": APARAT} for r in role if r != brak]
    if operacja == "insert_station_on_segment_sn":
        payload: dict[str, Any] = {
            "segment_ref": _odcinki(enm)[0]["ref_id"],
            "station_type": "inline",
            "insert_at": {"value": 0.5},
            "station": {"name": "Stacja Jodłowa", "sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4},
            "transformer": {"create": True, "transformer_catalog_ref": TRAFO},
            "nn_block": {"outgoing_feeders_nn_count": 1},
        }
        kod = "station.insert.field_apparatus_ref_missing"
    else:
        payload = {
            "endpoint_bus_ref": _odcinki(enm)[-1]["to_bus_ref"],
            "station": {"name": "Stacja Jodłowa", "station_type": "terminal"},
            "transformer": {"transformer_catalog_ref": TRAFO},
            "nn_voltage_kv": 0.4,
        }
        kod = "station.append.field_apparatus_ref_missing"

    przed = copy.deepcopy(enm)
    wynik = op(enm, operacja, {**payload, "sn_fields": sklad})
    assert wynik.get("error_code") == kod, wynik.get("error")
    komunikat = str(wynik.get("error"))
    assert f"Stacja wymaga pola „{nazwa}”" in komunikat, komunikat
    assert "dodaj to pole do składu rozdzielnicy SN" in komunikat, komunikat
    assert brak not in komunikat
    assert wynik.get("snapshot") is None
    assert enm == przed

    pelny = [{"field_role": r, "apparatus_catalog_ref": APARAT} for r in role]
    ok(op(copy.deepcopy(enm), operacja, {**payload, "sn_fields": pelny}))


def _blok_z_jednostkami_liniowymi() -> Any:
    from network_model.catalog.switchgear.factory_configuration import (
        list_factory_configurations,
    )

    return next(
        c
        for c in sorted(list_factory_configurations(), key=lambda c: c.configuration_ref)
        if [u.bay_kind for u in c.units].count("liniowe_odplywowe") >= 2
        and any(u.bay_kind == "transformatorowe" for u in c.units)
    )


@pytest.mark.parametrize("pierwsza_jednostka_wejsciowa", [True, False])
def test_stacja_z_bloku_rmu_prowadzi_tor_przez_jednostke_liniowa_w_roli_wejsciowej(
    pierwsza_jednostka_wejsciowa: bool,
) -> None:
    """Tor bloku RMU × rola pierwszej jednostki liniowej. Jednostki liniowe bloku są
    symetryczne (katalog: `liniowe_odplywowe`); kreator nadaje pierwszej rolę wejściową
    (`rozlozBlok`), a karta katalogowa zostaje kartą jednostki. Wtedy odcinek od strony
    zasilania kończy się na zacisku pierwszej jednostki, dalszy wychodzi z drugiej, a zasada
    toru jest spełniona. Bez roli wejściowej (dawna odwrotność „L → pole odpływowe" dla
    wszystkich jednostek) operacja nie ma wspólnego aparatu do domknięcia pola wejściowego —
    nazwana odmowa zamiast stacji z polem spoza wyrobu."""
    from enm.pole_katalogowe import _pole_rodziny_dla_funkcji

    blok = _blok_z_jednostkami_liniowymi()
    enm = _ciag_z_gpz(1)
    role = {"liniowe_odplywowe": "LINIA_OUT", "transformatorowe": "TRANSFORMATOROWE"}
    pola: list[dict[str, Any]] = []
    for numer, jednostka in enumerate(blok.units, 1):
        rola = role.get(jednostka.bay_kind)
        if rola is None:
            continue
        pola.append(
            {
                "field_role": rola,
                "apparatus_catalog_ref": APARAT,
                "bay_template_ref": _pole_rodziny_dla_funkcji(
                    blok.switchgear_family_ref, jednostka.bay_kind
                ).template_ref,
                "factory_configuration_ref": blok.configuration_ref,
                "factory_unit_index": numer,
            }
        )
    if pierwsza_jednostka_wejsciowa:
        pola[0]["field_role"] = "LINIA_IN"
    wynik = op(
        enm,
        "insert_station_on_segment_sn",
        {
            "segment_ref": _odcinki(enm)[0]["ref_id"],
            "station_type": "inline",
            "insert_at": {"value": 0.5},
            "station": {
                "name": "Stacja Blokowa",
                "sn_voltage_kv": 15.0,
                "nn_voltage_kv": 0.4,
                "switchgear": {"switchgear_family_ref": blok.switchgear_family_ref},
            },
            "sn_fields": pola,
            "transformer": {"create": True, "transformer_catalog_ref": TRAFO},
            "nn_block": {"outgoing_feeders_nn_count": 1},
        },
    )
    if not pierwsza_jednostka_wejsciowa:
        assert wynik.get("error_code") == "station.insert.field_apparatus_ref_missing"
        assert "„Pole liniowe wejściowe”" in str(wynik.get("error"))
        return
    snap = ok(wynik)
    _szyna_glowna_niesie_tylko_aparaty(snap)
    stacja = _stacja(snap, "Stacja Blokowa")
    specs = stacja["meta"]["field_specs"]
    assert [s.get("factory_unit_index") for s in specs if s.get("factory_unit_index")] == [
        p["factory_unit_index"] for p in pola
    ]
    # Obie połówki odcinka kończą się po stronie stacji na zaciskach pól: jedna na polu
    # wejściowym (jednostka nr 1 bloku), druga na polu wyjściowym.
    role_polowek = set()
    for odc in _odcinki(snap):
        for szyna in (odc["from_bus_ref"], odc["to_bus_ref"]):
            spec = _pole_zacisku(snap, szyna)
            if spec is not None and spec in specs:
                _w_torze_pola(snap, szyna, {"IN", "OUT"})
                role_polowek.add(str(spec["bay_role"]).upper())
                if spec["bay_role"] == "IN":
                    assert spec.get("factory_unit_index") == pola[0]["factory_unit_index"]
    assert role_polowek == {"IN", "OUT"}
