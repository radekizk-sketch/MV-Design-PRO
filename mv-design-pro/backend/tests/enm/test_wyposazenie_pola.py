"""Wyposażenie pola SN (``set_bay_equipment``, karty W5-C i GPZ-H5-APARATURA) — iloczyn cech.

Cechy iloczynu:

* status wiersza składu pola (JEDNA funkcja ``enm.sklad_pola.sklad_pola``) ∈ {ZAPROJEKTOWANE
  (tryb ``katalog`` — aparat z pozycją katalogu, sam albo przez element modelu),
  BRAK_POZYCJI_KATALOGU (tryb ``szablon`` — rodzaj z katalogiem bez pozycji),
  RODZAJ_BEZ_KATALOGU (głowica kablowa, wkładki, transformator pola)} × tryb ∈ {pole świeże,
  ``katalog``, ``szablon``, ``wyczysc``} × rola pola SN ∈ {IN, OUT, TR, FEEDER (wcięcie stacji), COUPLER, MEASUREMENT, OZE
  (``add_sn_bay``)} — każda kombinacja z sieci zbudowanej operacjami domenowymi;
* przestrzeń katalogu aparatu ∈ {APARAT_SN × rodzaj katalogowy, CT, VT, OGRANICZNIK_SN,
  ELEMENT_POLA_SN, rodzaj bez katalogu SN} × {pozycja istnieje, pozycja nie istnieje, pozycja
  innego rodzaju, brak pozycji} — pozycja „poprawna" ma U_m właściwe dla szyny 15 kV
  (pozycja wymagań standardu 110 kV w polu SN jest odmawiana: ``bay_equipment.um_mismatch``);
* aparat z gałęzią (``linked_ref``) × {łącznik tego pola, łącznik innego pola, kabel,
  aparat bez gałęzi} × stan łącznika w modelu (odczyt pola po ``open_switch``);
* odczyt pola (``build_field_read_model``) niesie TEN SAM skład co odpowiedź operacji;
* atomowość każdej odmowy (model wejściowy nietknięty, brak migawki) i determinizm.
"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from application.field_read_model import build_field_read_model
from enm.domain_operations import execute_domain_operation
from enm.katalog_projektu import katalog_biezacy
from enm.models import EnergyNetworkModel
from enm.pole_katalogowe import _rejestr_pol_katalogowych
from enm.sklad_pola import dane_pozycji_aparatu, zgodnosc_um_aparatu
from enm.wyposazenie_pola import (
    PRZESTRZEN_KATALOGU_APARATU,
    RODZAJE_BEZ_KATALOGU_SN,
    RODZAJE_KATALOGOWE_APARATU,
)

from tests.enm.siec_lacznikowa import _gpz, _kable, _odcinki, _pusty, galaz, wykonaj

APARAT_POLA = "sw-cb-abb-vd4-17kv-630a"

#: Rola pola SN → szablon kanoniczny tej roli (``BAY_TEMPLATE_REGISTRY``).
SZABLON_ROLI: dict[str, str] = {
    "IN": "bay_template_line_in",
    "OUT": "bay_template_line_out",
    "TR": "bay_template_transformer",
    "FEEDER": "bay_template_reserve",
    "COUPLER": "bay_template_coupler",
    "MEASUREMENT": "bay_template_measurement",
    "OZE": "bay_template_der_pv",
}
ROLE = tuple(SZABLON_ROLI)


#: Napięcie znamionowe szyn stacji sieci testowej (kV).
NAPIECIE_SZYNY_KV = 15.0


def _pierwsza(przestrzen: str, slownik: dict[str, Any], warunek: Any = None) -> str:
    """Pierwsza pozycja przestrzeni (kolejność ``ref``) spełniająca warunek, o U_m właściwym
    dla szyny 15 kV — ta sama funkcja zgodności U_m, co operacja zapisu."""
    katalog = katalog_biezacy()
    return next(
        ref
        for ref, typ in sorted(slownik.items())
        if (warunek is None or warunek(typ))
        and zgodnosc_um_aparatu(
            dane_pozycji_aparatu(katalog, przestrzen, ref).u_m_kv,
            NAPIECIE_SZYNY_KV,
            wymagane_znane=False,
        ).zgodna
    )


def _ref_aparatu_sn(rodzaj_katalogowy: str) -> str:
    return _pierwsza(
        "APARAT_SN",
        katalog_biezacy().mv_apparatus_types,
        lambda t: t.device_kind == rodzaj_katalogowy,
    )


def _ref_przestrzeni(przestrzen: str) -> str:
    katalog = katalog_biezacy()
    return {
        "CT": lambda: _pierwsza("CT", katalog.ct_types),
        "VT": lambda: _pierwsza("VT", katalog.vt_types),
        "OGRANICZNIK_SN": lambda: _pierwsza("OGRANICZNIK_SN", katalog.surge_arrester_types),
    }[przestrzen]()


def _ref_elementu_pola(rodzaj: str) -> str:
    dozwolone = RODZAJE_KATALOGOWE_APARATU[rodzaj]
    return _pierwsza(
        "ELEMENT_POLA_SN",
        katalog_biezacy().element_pola_types,
        lambda t: t.rodzaj in dozwolone,
    )


#: Rodzaj aparatu pola → poprawna pozycja katalogowa (status ZAPROJEKTOWANE).
def _poprawny_ref(rodzaj: str) -> str:
    if PRZESTRZEN_KATALOGU_APARATU[rodzaj] == "ELEMENT_POLA_SN":
        return _ref_elementu_pola(rodzaj)
    if rodzaj in RODZAJE_KATALOGOWE_APARATU:
        return _ref_aparatu_sn(sorted(RODZAJE_KATALOGOWE_APARATU[rodzaj])[0])
    return _ref_przestrzeni(PRZESTRZEN_KATALOGU_APARATU[rodzaj])


#: Rola pola → wyposażenie z katalogu (realne zestawy aparatów tej funkcji pola).
APARATY_ROLI: dict[str, list[tuple[str, str]]] = {
    "IN": [("DS", "UPSTREAM"), ("CB", "MIDSTREAM"), ("CT", "MIDSTREAM"), ("ES", "GROUND_BRANCH")],
    "OUT": [("DS", "UPSTREAM"), ("CB", "MIDSTREAM"), ("CT", "MIDSTREAM"), ("ES", "GROUND_BRANCH")],
    "TR": [("LOAD_SWITCH", "MIDSTREAM"), ("ES", "GROUND_BRANCH")],
    "FEEDER": [("LOAD_SWITCH", "MIDSTREAM"), ("SURGE_ARRESTER", "GROUND_BRANCH")],
    "COUPLER": [("DS", "UPSTREAM"), ("CB", "MIDSTREAM"), ("DS", "DOWNSTREAM")],
    "MEASUREMENT": [("DS", "UPSTREAM"), ("VT", "DOWNSTREAM")],
    "OZE": [("CB", "MIDSTREAM"), ("CT", "MIDSTREAM"), ("VT", "DOWNSTREAM")],
}


def _siec_z_polami() -> tuple[dict[str, Any], dict[str, str], str]:
    """GPZ → 2 odcinki; stacja wcięta w ostatni odcinek (pola IN/OUT/FEEDER/TR) i pola
    COUPLER/MEASUREMENT/OZE dodane ``add_sn_bay``. Zwraca (migawka, rola → pole SN,
    pole nN stacji)."""
    enm = _odcinki(_gpz(), [200, 300])
    enm = wykonaj(
        enm,
        "insert_station_on_segment_sn",
        {
            "segment_ref": _kable(enm)[-1]["ref_id"],
            "field_apparatus_catalog_ref": APARAT_POLA,
            "station_type": "B",
            "insert_at": {"value": 0.5},
            "station": {"sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4},
            "sn_fields": ["IN", "OUT", "FEEDER"],
            "transformer": {
                "create": True,
                "transformer_catalog_ref": "tr-sn-nn-15-04-630kva-dyn11",
            },
        },
    )
    stacja = next(s for s in enm["substations"] if s.get("station_type") != "gpz")
    for rola in ("COUPLER", "MEASUREMENT", "OZE"):
        enm = wykonaj(
            enm,
            "add_sn_bay",
            {
                "bus_ref": stacja["bus_refs"][0],
                "station_ref": stacja["ref_id"],
                "bay_role": rola,
                "catalog_ref": APARAT_POLA,
            },
        )
    pola_stacji = [b for b in enm["bays"] if b["substation_ref"] == stacja["ref_id"]]
    pole_nn = next(b["ref_id"] for b in pola_stacji if b["ref_id"].endswith("nn_main_breaker"))
    pola_sn = {b["bay_role"]: b["ref_id"] for b in pola_stacji if b["ref_id"] != pole_nn}
    assert set(pola_sn) == set(ROLE), pola_sn
    return enm, pola_sn, pole_nn


@pytest.fixture(scope="module")
def siec() -> tuple[dict[str, Any], dict[str, str], str]:
    return _siec_z_polami()


def _pole(enm: dict[str, Any], ref: str) -> dict[str, Any]:
    return next(b for b in enm["bays"] if b["ref_id"] == ref)


def _wykonaj(enm: dict[str, Any], ladunek: dict[str, Any]) -> dict[str, Any]:
    return execute_domain_operation(enm, "set_bay_equipment", ladunek)


def _odmowa(enm: dict[str, Any], ladunek: dict[str, Any], kod: str) -> dict[str, Any]:
    wejscie = copy.deepcopy(enm)
    wynik = _wykonaj(enm, ladunek)
    assert wynik.get("error_code") == kod, (wynik.get("error_code"), wynik.get("error"))
    assert wynik["snapshot"] is None
    assert enm == wejscie, "odmowa zmieniła model wejściowy"
    assert "wyposazenie_pola" not in wynik
    return wynik


def _ladunek_katalogowy(rola: str) -> list[dict[str, Any]]:
    return [
        {"kind": rodzaj, "placement": umiejscowienie, "catalog_ref": _poprawny_ref(rodzaj)}
        for rodzaj, umiejscowienie in APARATY_ROLI[rola]
    ]


# ---------------------------------------------------------------------------
# Iloczyn: status składu × tryb × rola pola SN
# ---------------------------------------------------------------------------


def _status_oczekiwany(wiersz: dict[str, Any]) -> str:
    """Reguła statusu wiersza aparatu spoza gniazd — wyprowadzona niezależnie od modułu
    (z przestrzeni katalogu rodzaju i obecności pozycji)."""
    if wiersz["catalog_ref"]:
        return "ZAPROJEKTOWANE"
    if wiersz["rodzaj"] in PRZESTRZEN_KATALOGU_APARATU:
        return "BRAK_POZYCJI_KATALOGU"
    return "RODZAJ_BEZ_KATALOGU"


def _sprawdz_wiersze(sklad: list[dict[str, Any]]) -> None:
    for wiersz in sklad:
        assert wiersz["gniazdo_ref"] is None, "pole bez szablonu standardu nie ma gniazd"
        assert wiersz["status"] == _status_oczekiwany(wiersz), wiersz
        assert wiersz["opis_pl"], "status bez wyjaśnienia"


@pytest.mark.parametrize("rola", ROLE)
def test_pole_swieze_ma_sklad_z_elementow_modelu(siec: Any, rola: str) -> None:
    """Pole świeże (bez rekordu aparatów) — skład to aparaty wyprowadzone z elementów modelu
    pola (łączniki ``equipment_refs``, głowica kabla, transformator), każdy ze statusem
    reguły katalogu; pole bez szablonu standardu nie ma wierszy gniazd."""
    enm, pola, _ = siec
    rekord = _pole(enm, pola[rola])
    assert rekord["primary_devices"] == []
    sklad = _odczyt_pola(enm, pola[rola])["sklad"]
    _sprawdz_wiersze(sklad)
    assert {w["linked_ref"] for w in sklad} <= set(rekord["equipment_refs"]) | {
        t["ref_id"] for t in enm.get("transformers", [])
    } | {g["ref_id"] for g in enm.get("generators", [])}


@pytest.mark.parametrize("rola", ROLE)
def test_tryb_katalog_daje_zaprojektowane(siec: Any, rola: str) -> None:
    enm, pola, _ = siec
    devices = _ladunek_katalogowy(rola)
    wynik = _wykonaj(enm, {"bay_ref": pola[rola], "mode": "katalog", "devices": devices})

    assert wynik.get("error") is None, wynik.get("error")
    zapisane = _pole(wynik["snapshot"], pola[rola])["primary_devices"]
    assert [(a["kind"], a["placement"]) for a in zapisane] == [
        (d["kind"], d["placement"]) for d in devices
    ]
    assert [a["device_ref"] for a in zapisane] == [
        f"{pola[rola]}::dev::{i}" for i in range(len(devices))
    ]
    # Przekładnik pola to rekord ``Measurement`` (jedna reprezentacja): aparat rekordu go
    # wskazuje, katalog niesie przekładnik; pozostałe rodzaje niosą katalog same.
    pomiary = {m["ref_id"]: m for m in wynik["snapshot"].get("measurements", [])}
    utworzone = []
    for aparat, wpis in zip(zapisane, devices, strict=True):
        if aparat["kind"] in {"CT", "VT"}:
            assert aparat.get("catalog_ref") is None
            przekladnik = pomiary[aparat["linked_ref"]]
            assert przekladnik["catalog_ref"] == wpis["catalog_ref"]
            assert przekladnik["bay_ref"] == pola[rola]
            assert przekladnik["measurement_type"] == aparat["kind"]
            utworzone.append(aparat["linked_ref"])
        else:
            assert aparat["catalog_ref"] == wpis["catalog_ref"]
    opis = wynik["wyposazenie_pola"]
    assert opis["bay_ref"] == pola[rola]
    assert opis["szablon_standardu_ref"] is None
    wiersze_rekordu = [
        w for w in opis["sklad"] if w["device_ref"] in {a["device_ref"] for a in zapisane}
    ]
    assert len(wiersze_rekordu) == len(zapisane)
    assert {w["status"] for w in wiersze_rekordu} == {"ZAPROJEKTOWANE"}
    _sprawdz_wiersze(opis["sklad"])
    assert wynik["domain_events"] == [
        {"event_seq": 1, "event_type": "BAY_EQUIPMENT_SET", "element_id": pola[rola]}
    ]
    assert wynik["changes"]["updated_element_ids"] == [pola[rola]]
    assert sorted(wynik["changes"].get("created_element_ids") or []) == sorted(utworzone)
    # Jedna prawda: pozostałe pola i gałęzie bez zmian.
    for inne in wynik["snapshot"]["bays"]:
        if inne["ref_id"] != pola[rola]:
            assert inne == _pole(enm, inne["ref_id"])
    assert wynik["snapshot"]["branches"] == enm["branches"]
    EnergyNetworkModel.model_validate(wynik["snapshot"])


@pytest.mark.parametrize("rola", ROLE)
def test_tryb_szablon_daje_aparaty_bez_pozycji(siec: Any, rola: str) -> None:
    """Szablon kanoniczny pola daje rodzaje aparatów BEZ pozycji katalogowej — skład pokazuje
    je jako ``BRAK_POZYCJI_KATALOGU`` (albo ``RODZAJ_BEZ_KATALOGU``), chyba że aparat związał się
    z łącznikiem pola niosącym katalog (wtedy ``ZAPROJEKTOWANE`` z katalogu łącznika)."""
    enm, pola, _ = siec
    wynik = _wykonaj(
        enm, {"bay_ref": pola[rola], "mode": "szablon", "bay_template_ref": SZABLON_ROLI[rola]}
    )

    assert wynik.get("error") is None, wynik.get("error")
    rekord = _pole(wynik["snapshot"], pola[rola])
    assert rekord["bay_template_ref"] == SZABLON_ROLI[rola]
    assert rekord["primary_devices"], "szablon roli bez aparatów"
    sklad = wynik["wyposazenie_pola"]["sklad"]
    _sprawdz_wiersze(sklad)
    galezie = {g["ref_id"]: g for g in enm["branches"]}
    for wiersz in sklad:
        if wiersz["status"] == "ZAPROJEKTOWANE":
            assert wiersz["catalog_ref"] == galezie[wiersz["linked_ref"]]["catalog_ref"]
    assert any(w["status"] == "BRAK_POZYCJI_KATALOGU" for w in sklad), sklad


@pytest.mark.parametrize("rola", ROLE)
def test_tryb_wyczysc_wraca_do_skladu_z_elementow(siec: Any, rola: str) -> None:
    enm, pola, _ = siec
    wyposazone = wykonaj(
        enm,
        "set_bay_equipment",
        {"bay_ref": pola[rola], "mode": "katalog", "devices": _ladunek_katalogowy(rola)},
    )
    wynik = _wykonaj(wyposazone, {"bay_ref": pola[rola], "mode": "wyczysc"})

    assert wynik.get("error") is None, wynik.get("error")
    assert _pole(wynik["snapshot"], pola[rola])["primary_devices"] == []
    sklad = wynik["wyposazenie_pola"]["sklad"]
    _sprawdz_wiersze(sklad)
    assert not any("::dev::" in str(w["device_ref"]) for w in sklad)


def _odczyt_pola(migawka: dict[str, Any], pole_ref: str) -> dict[str, Any]:
    odczyt = build_field_read_model("w5c", EnergyNetworkModel.model_validate(migawka))
    (pole_odczytu,) = (f for f in odczyt["fields"] if f["bay_ref"] == pole_ref)
    return pole_odczytu["canonical_model"]["base_model"]


@pytest.mark.parametrize("tryb", ["katalog", "szablon", "wyczysc"])
@pytest.mark.parametrize("rola", ROLE)
def test_odczyt_pola_niesie_sklad_z_operacji(siec: Any, rola: str, tryb: str) -> None:
    """Karta pola (E-11) czyta skład z odczytu pola — TA SAMA funkcja co odpowiedź operacji
    (``sklad_pola``): wiersze, statusy i wyjaśnienia są identyczne."""
    enm, pola, _ = siec
    ref = pola[rola]
    ladunek: dict[str, Any] = {"bay_ref": ref, "mode": tryb}
    if tryb == "katalog":
        ladunek["devices"] = _ladunek_katalogowy(rola)
    if tryb == "szablon":
        ladunek["bay_template_ref"] = SZABLON_ROLI[rola]
    if tryb == "wyczysc":
        enm = wykonaj(
            enm,
            "set_bay_equipment",
            {"bay_ref": ref, "mode": "katalog", "devices": _ladunek_katalogowy(rola)},
        )
    wynik = _wykonaj(enm, ladunek)
    assert wynik.get("error") is None, wynik.get("error")
    model_pola = _odczyt_pola(wynik["snapshot"], ref)
    assert model_pola["sklad"] == wynik["wyposazenie_pola"]["sklad"]
    assert model_pola["szablon_standardu_ref"] == wynik["wyposazenie_pola"]["szablon_standardu_ref"]


@pytest.mark.parametrize("rola", ["FEEDER", "IN", "OUT", "TR", "COUPLER", "MEASUREMENT"])
def test_szablon_pola_producenta_daje_model_z_bomu(rola: str) -> None:
    """Pole GPZ na rodzinie ABB UniGear ZS1, szablon = katalogowe pole rodziny tej roli:
    aparaty z BOM-u producenta, każdy z referencją szablonu aparatu (MODEL, bez danych
    przyjętych). Rola pola GPZ zmieniana jest szablonem tylko wtedy, gdy zgadza się z rolą
    pola — dlatego pole FEEDER przyjmuje wyłącznie szablon FEEDER, inne odmawia."""
    rodzina = "ABB__UNIGEAR_ZS1"
    szablony = {
        k: v for k, v in _rejestr_pol_katalogowych().items() if v.switchgear_family_ref == rodzina
    }
    (szablon,) = (k for k, v in szablony.items() if v.bay_role == rola)
    enm = wykonaj(
        _pusty(),
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "source_name": "GPZ",
            "sk3_mva": 300.0,
            "rx_ratio": 0.1,
            "catalog_ref": "src-gpz-15kv-300mva-rx010",
            "switchgear_family_ref": rodzina,
        },
    )
    (pole_gpz,) = (b for b in enm["bays"])
    ladunek = {"bay_ref": pole_gpz["ref_id"], "mode": "szablon", "bay_template_ref": szablon}
    if pole_gpz["bay_role"] != rola:
        _odmowa(enm, ladunek, "bay_equipment.template_role_mismatch")
        return
    wynik = _wykonaj(enm, ladunek)
    assert wynik.get("error") is None, wynik.get("error")
    aparaty = _pole(wynik["snapshot"], pole_gpz["ref_id"])["primary_devices"]
    bom = {i.device_template_ref for i in szablony[szablon].device_instances}
    assert aparaty and {a["catalog_ref"] for a in aparaty} <= bom
    wiersze_rekordu = [
        w
        for w in wynik["wyposazenie_pola"]["sklad"]
        if w["device_ref"] in {a["device_ref"] for a in aparaty}
    ]
    assert {w["status"] for w in wiersze_rekordu} == {"ZAPROJEKTOWANE"}


def test_szablon_z_rekordu_pola_bez_wskazania_w_ladunku(siec: Any) -> None:
    enm, pola, _ = siec
    ze_wskazaniem = wykonaj(
        enm,
        "set_bay_equipment",
        {"bay_ref": pola["OUT"], "mode": "szablon", "bay_template_ref": "bay_template_line_out"},
    )
    ponownie = _wykonaj(ze_wskazaniem, {"bay_ref": pola["OUT"], "mode": "szablon"})
    assert ponownie.get("error") is None
    assert ponownie["snapshot"] == ze_wskazaniem


def test_tryb_katalog_z_rodzajem_bez_katalogu_jest_rodzajem_bez_katalogu(siec: Any) -> None:
    """Rozłącznik bezpiecznikowy z katalogu + wkładki (rodzaj bez katalogu SN) — wyposażenie
    mieszane: rozłącznik ZAPROJEKTOWANE, wkładki RODZAJ_BEZ_KATALOGU z wyjaśnieniem."""
    enm, pola, _ = siec
    wynik = _wykonaj(
        enm,
        {
            "bay_ref": pola["TR"],
            "mode": "katalog",
            "devices": [
                {
                    "kind": "LOAD_SWITCH",
                    "placement": "MIDSTREAM",
                    "catalog_ref": _ref_aparatu_sn("ROZLACZNIK_BEZPIECZNIKOWY"),
                },
                {"kind": "FUSE", "placement": "MIDSTREAM", "designation": "F1"},
            ],
        },
    )
    assert wynik.get("error") is None, wynik.get("error")
    wiersze = {w["device_ref"]: w for w in wynik["wyposazenie_pola"]["sklad"]}
    rozlacznik = wiersze[f"{pola['TR']}::dev::0"]
    wkladki = wiersze[f"{pola['TR']}::dev::1"]
    assert rozlacznik["status"] == "ZAPROJEKTOWANE"
    assert wkladki["status"] == "RODZAJ_BEZ_KATALOGU"
    assert "bezpieczniki F1" in wkladki["opis_pl"]
    assert "bez katalogu" in wkladki["opis_pl"]


# ---------------------------------------------------------------------------
# Iloczyn: przestrzeń katalogu × stan wskazania
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("rodzaj", sorted(PRZESTRZEN_KATALOGU_APARATU))
def test_pozycja_katalogowa_kazdej_przestrzeni(siec: Any, rodzaj: str) -> None:
    enm, pola, _ = siec
    umiejscowienie = "GROUND_BRANCH" if rodzaj in {"ES", "SURGE_ARRESTER"} else "MIDSTREAM"

    def ladunek(ref: object) -> dict[str, Any]:
        wpis: dict[str, Any] = {"kind": rodzaj, "placement": umiejscowienie}
        if ref is not None:
            wpis["catalog_ref"] = ref
        return {"bay_ref": pola["IN"], "mode": "katalog", "devices": [wpis]}

    poprawny = _wykonaj(enm, ladunek(_poprawny_ref(rodzaj)))
    assert poprawny.get("error") is None, poprawny.get("error")
    (wiersz,) = (
        w
        for w in poprawny["wyposazenie_pola"]["sklad"]
        if w["device_ref"] == f"{pola['IN']}::dev::0"
    )
    assert wiersz["status"] == "ZAPROJEKTOWANE"
    assert wiersz["catalog_namespace"] == PRZESTRZEN_KATALOGU_APARATU[rodzaj]

    _odmowa(enm, ladunek(None), "bay_equipment.catalog_ref_missing")
    _odmowa(enm, ladunek("   "), "bay_equipment.catalog_ref_missing")
    nieistniejaca = _odmowa(enm, ladunek("pozycja-ktorej-nie-ma"), "catalog.item_not_found")
    assert "Aparat 1" in nieistniejaca["error"]


@pytest.mark.parametrize("rodzaj", sorted(RODZAJE_KATALOGOWE_APARATU))
def test_pozycja_aparatu_innego_rodzaju(siec: Any, rodzaj: str) -> None:
    """Pozycja ISTNIEJĄCA w przestrzeni rodzaju, ale innego rodzaju pozycji (APARAT_SN:
    ``device_kind``, ELEMENT_POLA_SN: ``rodzaj``) — odmowa rodzaju, nie braku pozycji."""
    enm, pola, _ = siec
    dozwolone = RODZAJE_KATALOGOWE_APARATU[rodzaj]
    if PRZESTRZEN_KATALOGU_APARATU[rodzaj] == "ELEMENT_POLA_SN":
        obca_pozycja = _pierwsza(
            "ELEMENT_POLA_SN",
            katalog_biezacy().element_pola_types,
            lambda t: t.rodzaj not in dozwolone,
        )
    else:
        obca_pozycja = _ref_aparatu_sn(
            next(k for k in ("UZIEMNIK", "WYLACZNIK", "ODLACZNIK") if k not in dozwolone)
        )
    _odmowa(
        enm,
        {
            "bay_ref": pola["IN"],
            "mode": "katalog",
            "devices": [{"kind": rodzaj, "placement": "MIDSTREAM", "catalog_ref": obca_pozycja}],
        },
        "bay_equipment.catalog_kind_mismatch",
    )


@pytest.mark.parametrize("rodzaj", sorted(RODZAJE_BEZ_KATALOGU_SN))
def test_rodzaj_bez_katalogu_nie_przyjmuje_pozycji(siec: Any, rodzaj: str) -> None:
    enm, pola, _ = siec
    _odmowa(
        enm,
        {
            "bay_ref": pola["TR"],
            "mode": "katalog",
            "devices": [{"kind": rodzaj, "placement": "MIDSTREAM", "catalog_ref": APARAT_POLA}],
        },
        "bay_equipment.catalog_not_applicable",
    )


def test_ct_z_pozycja_vt_jest_odrzucony(siec: Any) -> None:
    """Przestrzeń wynika z rodzaju aparatu — pozycja innej przestrzeni nie istnieje w tej."""
    enm, pola, _ = siec
    _odmowa(
        enm,
        {
            "bay_ref": pola["IN"],
            "mode": "katalog",
            "devices": [
                {"kind": "CT", "placement": "MIDSTREAM", "catalog_ref": _ref_przestrzeni("VT")}
            ],
        },
        "catalog.item_not_found",
    )


# ---------------------------------------------------------------------------
# Aparat z gałęzią × stan łącznika w modelu
# ---------------------------------------------------------------------------


def _wylacznik_pola(enm: dict[str, Any], pole_ref: str) -> str:
    return next(
        ref
        for ref in _pole(enm, pole_ref)["equipment_refs"]
        if galaz(enm, ref)["type"] in {"breaker", "switch"}
    )


def _cb(linked_ref: str) -> dict[str, Any]:
    """Wyłącznik pola wskazujący łącznik modelu — bez ``catalog_ref``: katalog niesie łącznik
    (jedna prawda katalogu; dubel odmawiany ``bay_equipment.catalog_on_linked_element``)."""
    return {"kind": "CB", "placement": "MIDSTREAM", "linked_ref": linked_ref}


def test_aparat_wskazuje_lacznik_pola_i_odczyt_pola_czyta_jego_stan(siec: Any) -> None:
    enm, pola, _ = siec
    lacznik = _wylacznik_pola(enm, pola["OUT"])
    wyposazone = wykonaj(
        enm,
        "set_bay_equipment",
        {"bay_ref": pola["OUT"], "mode": "katalog", "devices": [_cb(lacznik)]},
    )
    otwarte = wykonaj(wyposazone, "open_switch", {"switch_ref": lacznik})

    def stan_aparatu(migawka: dict[str, Any]) -> dict[str, Any]:
        odczyt = build_field_read_model("w5c", EnergyNetworkModel.model_validate(migawka))
        (pozycja,) = (p for p in odczyt["fields"] if p["bay_ref"] == pola["OUT"])
        (aparat,) = pozycja["canonical_model"]["base_model"]["primary_devices"]
        assert aparat["linked_ref"] == lacznik
        return aparat["switch_state"]

    assert stan_aparatu(wyposazone)["actual_state"] == "zamkniety"
    assert stan_aparatu(otwarte)["actual_state"] == "otwarty"
    # Operacja łącznika nie rusza wyposażenia pola (jedna prawda: stan na gałęzi).
    assert _pole(otwarte, pola["OUT"]) == _pole(wyposazone, pola["OUT"])


def test_aparat_z_lacznikiem_nie_dubluje_katalogu_lacznika(siec: Any) -> None:
    enm, pola, _ = siec
    lacznik = _wylacznik_pola(enm, pola["OUT"])
    assert galaz(enm, lacznik)["catalog_ref"]
    _odmowa(
        enm,
        {
            "bay_ref": pola["OUT"],
            "mode": "katalog",
            "devices": [{**_cb(lacznik), "catalog_ref": APARAT_POLA}],
        },
        "bay_equipment.catalog_on_linked_element",
    )
    wynik = _wykonaj(enm, {"bay_ref": pola["OUT"], "mode": "katalog", "devices": [_cb(lacznik)]})
    (wiersz,) = (w for w in wynik["wyposazenie_pola"]["sklad"] if w["linked_ref"] == lacznik)
    assert wiersz["status"] == "ZAPROJEKTOWANE"
    assert wiersz["catalog_ref"] == galaz(enm, lacznik)["catalog_ref"]


def test_aparat_nie_wskazuje_lacznika_innego_pola(siec: Any) -> None:
    enm, pola, _ = siec
    cudzy = _wylacznik_pola(enm, pola["IN"])
    wynik = _odmowa(
        enm,
        {"bay_ref": pola["OUT"], "mode": "katalog", "devices": [_cb(cudzy)]},
        "bay_equipment.linked_ref_other_bay",
    )
    assert "nie należy do" in wynik["error"]


def test_aparat_nie_wskazuje_kabla_ani_aparat_bez_galezi_lacznika(siec: Any) -> None:
    enm, pola, _ = siec
    kabel = _kable(enm)[0]["ref_id"]
    _odmowa(
        enm,
        {"bay_ref": pola["OUT"], "mode": "katalog", "devices": [_cb(kabel)]},
        "bay_equipment.linked_ref_invalid",
    )
    lacznik = _wylacznik_pola(enm, pola["OUT"])
    _odmowa(
        enm,
        {
            "bay_ref": pola["OUT"],
            "mode": "katalog",
            "devices": [
                {
                    "kind": "ES",
                    "placement": "GROUND_BRANCH",
                    "catalog_ref": _poprawny_ref("ES"),
                    "linked_ref": lacznik,
                }
            ],
        },
        "bay_equipment.linked_ref_invalid",
    )


def test_dwa_aparaty_nie_wskazuja_tego_samego_lacznika(siec: Any) -> None:
    enm, pola, _ = siec
    lacznik = _wylacznik_pola(enm, pola["OUT"])
    _odmowa(
        enm,
        {"bay_ref": pola["OUT"], "mode": "katalog", "devices": [_cb(lacznik), _cb(lacznik)]},
        "bay_equipment.linked_ref_duplicate",
    )


# ---------------------------------------------------------------------------
# Odmowy ładunku i pola — atomowość
# ---------------------------------------------------------------------------


def test_rodzina_rozdzielnicy_zaweza_rodzaje_aparatow() -> None:
    """Pole GPZ na rodzinie bez przekładnika prądowego (ZPUE TPM) — CT odrzucony,
    wyłącznik przyjęty."""
    enm = wykonaj(
        _pusty(),
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "source_name": "GPZ",
            "sk3_mva": 300.0,
            "rx_ratio": 0.1,
            "catalog_ref": "src-gpz-15kv-300mva-rx010",
            "switchgear_family_ref": "ZPUE_WLOSZCZOWA__TPM",
        },
    )
    (pole_gpz,) = (b["ref_id"] for b in enm["bays"])
    _odmowa(
        enm,
        {
            "bay_ref": pole_gpz,
            "mode": "katalog",
            "devices": [
                {"kind": "CT", "placement": "MIDSTREAM", "catalog_ref": _poprawny_ref("CT")}
            ],
        },
        "bay_equipment.family_disallows",
    )
    przyjete = _wykonaj(
        enm,
        {
            "bay_ref": pole_gpz,
            "mode": "katalog",
            "devices": [{"kind": "CB", "placement": "MIDSTREAM", "catalog_ref": APARAT_POLA}],
        },
    )
    assert przyjete.get("error") is None, przyjete.get("error")


@pytest.mark.parametrize(
    ("ladunek", "kod"),
    [
        ({"mode": "katalog"}, "bay_equipment.bay_ref_missing"),
        ({"bay_ref": "brak-pola", "mode": "katalog"}, "bay_equipment.bay_not_found"),
        ({"bay_ref": "@IN", "mode": "inny"}, "bay_equipment.mode_invalid"),
        ({"bay_ref": "@IN"}, "bay_equipment.mode_invalid"),
        ({"bay_ref": "@IN", "mode": "katalog"}, "bay_equipment.devices_missing"),
        ({"bay_ref": "@IN", "mode": "katalog", "devices": []}, "bay_equipment.devices_missing"),
        ({"bay_ref": "@IN", "mode": "katalog", "devices": ["CB"]}, "bay_equipment.device_invalid"),
        (
            {"bay_ref": "@IN", "mode": "katalog", "devices": [{"kind": "XX"}]},
            "bay_equipment.kind_not_allowed",
        ),
        (
            {"bay_ref": "@IN", "mode": "katalog", "devices": [{"kind": "CB", "placement": "X"}]},
            "bay_equipment.placement_invalid",
        ),
        (
            {
                "bay_ref": "@IN",
                "mode": "katalog",
                "devices": [
                    {
                        "kind": "CB",
                        "placement": "MIDSTREAM",
                        "catalog_ref": APARAT_POLA,
                        "earthing_role": "WORKING",
                    }
                ],
            },
            "bay_equipment.earthing_role_not_applicable",
        ),
        ({"bay_ref": "@IN", "mode": "szablon"}, "bay_equipment.template_missing"),
        (
            {"bay_ref": "@IN", "mode": "szablon", "bay_template_ref": "brak-szablonu"},
            "bay_equipment.template_unknown",
        ),
        (
            {"bay_ref": "@IN", "mode": "szablon", "bay_template_ref": "bay_template_transformer"},
            "bay_equipment.template_role_mismatch",
        ),
        ({"bay_ref": "@NN", "mode": "wyczysc"}, "bay_equipment.bay_not_mv"),
    ],
)
def test_odmowy_sa_atomowe(siec: Any, ladunek: dict[str, Any], kod: str) -> None:
    enm, pola, pole_nn = siec
    if ladunek.get("bay_ref") == "@IN":
        ladunek = {**ladunek, "bay_ref": pola["IN"]}
    if ladunek.get("bay_ref") == "@NN":
        ladunek = {**ladunek, "bay_ref": pole_nn}
    _odmowa(enm, ladunek, kod)


def test_drugi_aparat_bledny_nie_zostawia_pierwszego(siec: Any) -> None:
    enm, pola, _ = siec
    _odmowa(
        enm,
        {
            "bay_ref": pola["IN"],
            "mode": "katalog",
            "devices": [
                {"kind": "CB", "placement": "MIDSTREAM", "catalog_ref": APARAT_POLA},
                {"kind": "CT", "placement": "MIDSTREAM", "catalog_ref": "brak-pozycji"},
            ],
        },
        "catalog.item_not_found",
    )


# ---------------------------------------------------------------------------
# Determinizm
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("tryb", ["katalog", "szablon", "wyczysc"])
def test_determinizm(siec: Any, tryb: str) -> None:
    enm, pola, _ = siec
    ladunek: dict[str, Any] = {"bay_ref": pola["OUT"], "mode": tryb}
    if tryb == "katalog":
        ladunek["devices"] = _ladunek_katalogowy("OUT")
    if tryb == "szablon":
        ladunek["bay_template_ref"] = "bay_template_line_out"
    pierwszy = _wykonaj(copy.deepcopy(enm), ladunek)
    drugi = _wykonaj(copy.deepcopy(enm), ladunek)
    assert pierwszy.get("error") is None, pierwszy.get("error")
    assert pierwszy == drugi
