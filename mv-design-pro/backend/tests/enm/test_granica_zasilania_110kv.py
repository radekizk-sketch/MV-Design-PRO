"""Strona 110 kV GPZ jako funkcjonalna granica zasilania sieci SN (karta GPZ-H5-APARATURA).

Decyzja właściciela 2026-10-22: strona 110 kV ma tory zasilania L1 i L2, dwa pola zasilające
jako przyłącza z łącznikiem pola (stan wchodzi do obliczeń), transformatory 110/SN i łącznik
szyn 110 kV — bez szablonów gniazd, pozycji wymagań ENEA, katalogu aparatury 110 kV,
statusu „wymagane standardem” i oceny wytrzymałości. Pole 110 kV ma dokładnie jeden łącznik
pola z gałęzią modelu (albo transformator), bez luk i bez znaku zapytania.

JEDEN predykat granicy: ``enm.sklad_pola.pole_granicy_wn`` (pasmo WN, Uₙ ≥ 110 kV) — status
składu ``BRAK_TYPU_GRANICA_WN``, odmowa ``bay_equipment.bay_hv_boundary`` i pominięcie pola
w analizie wytrzymałości aparatury czytają go z jednego miejsca. Ochrona przed aparatem SN na
szynie sieci z tabeli 4 IEC 60038 (``zgodnosc_um_aparatu``) zostaje — dotyczy szyny 66 kV
(pasmo SN, tabela 4), bo pole 110 kV nie przyjmuje wyposażenia wcale.

Iloczyn cech:
* napięcie szyny pola {0,4; 15; 35; 66; 109,9; 110; 220 kV; brak} × predykat granicy;
* pole 110 kV układu H5 {pole liniowe L1, L2, pole transformatora TR1, TR2, pole łącznika szyn}
  × tryb operacji wyposażenia {katalog, szablon, standard, wymagania, wyczysc} → odmowa
  atomowa z jednym kodem;
* szyna pola SN {15 kV, 66 kV} × tryb {standard, katalog z aparatem SN, wymagania, wyczysc}
  → zapis / odmowa tabelą napięć (szablon SN tylko w tabeli 3, U_m aparatu wobec tabeli 4);
* skład pola 110 kV {łącznik bez typu, transformator z katalogu} × para „ten sam łącznik bez
  pozycji w polu SN” (gniazdo standardu);
* analiza wytrzymałości aparatury: pola stacji = pola SN (pola 110 kV pominięte) × model
  {z operacji, zastany z pozycją aparatury SN na łączniku pola 110 kV};
* operacja stawiająca aparat albo pole SN {przekładnik prądowy, napięciowy, pole SN, pole
  z katalogu rozdzielnic, ogranicznik, stacja SN/nN na końcu ciągu, stacja w odcinku, łącznik
  sekcyjny, ZKSN} × strona {110 kV, para 15 kV} → odmowa ``{prefiks}.bus_hv_boundary`` / zapis
  (jeden helper ``_odmowa_granicy_wn``); odcinek linii/kabla nie jest aparatem pola (sieci WN
  importu XLSX i sieci odniesienia — rejestr złotych sieci buduje je tymi operacjami);
* łącznik {pole liniowe 110 kV L1, L2, łącznik szyn 110 kV, wyłącznik pola SN TR1, łącznik szyn SN}
  × droga przypisania katalogu {operacja przypisania, zmiana parametrów} →
  ``catalog.switch_hv_boundary`` / zapis;
* katalog aparatury pól: żadnej pozycji z tabeli 4 IEC 60038 (brak katalogu 110 kV);
* punkt neutralny SN: element pola SN nie niesie impedancji punktu neutralnego (ta żyje
  wyłącznie w ``GroundingConfig`` / ``MvNeutralGroundingItem``).
"""

from __future__ import annotations

import copy
import dataclasses
from typing import Any

import pytest
from application.analyses.wytrzymalosc_aparatury_pol import (
    zbuduj_widok_wytrzymalosci_aparatury,
)
from enm.domain_operations import execute_domain_operation
from enm.katalog_projektu import katalog_biezacy
from enm.models import EnergyNetworkModel
from enm.sklad_pola import (
    NAZWY_STATUSOW_SKLADU_PL,
    indeks_modelu_pola,
    napiecie_szyny_pola,
    pole_granicy_wn,
    sklad_pola,
)
from enm.wyposazenie_pola import TRYBY_WYPOSAZENIA
from network_model.catalog.gniazda_pol_enea import SZABLONY_POL_STANDARDU
from network_model.catalog.mv_wymagania_enea_catalog import POZYCJE_WYMAGAN_GNIAZD
from network_model.catalog.types import ElementPolaType
from network_model.pochodne.pasma_napieciowe import (
    pasmo_napieciowe,
    tabela_napiec_urzadzenia,
)

from tests.reference_networks.gpz_h5 import RefyH5, refy, zbuduj_h5

#: Aparat łączeniowy SN z katalogu (U_m 17,5 kV) — poprawny dla szyny 15 kV.
WYLACZNIK_SN = "sw-cb-abb-vd4-17kv-630a"


@pytest.fixture(scope="module")
def h5() -> dict[str, Any]:
    return zbuduj_h5()


@pytest.fixture(scope="module")
def r(h5: dict[str, Any]) -> RefyH5:
    return refy(h5)


def _pola_wg_napiecia(enm: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """(pola 110 kV, pola SN) układu — napięcie szyny pola z JEDNEJ funkcji modelu pola."""
    indeks = indeks_modelu_pola(EnergyNetworkModel.model_validate(enm))
    wn, sn = [], []
    for bay in enm["bays"]:
        (wn if (napiecie_szyny_pola(indeks, bay) or 0.0) >= 110.0 else sn).append(bay)
    return wn, sn


# ---------------------------------------------------------------------------
# Predykat granicy — jedno pasmo
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("u_n", "granica"),
    [
        (None, False),
        (0.4, False),
        (15.0, False),
        (35.0, False),
        (66.0, False),
        (109.9, False),
        (110.0, True),
        (220.0, True),
    ],
)
def test_predykat_granicy_to_pasmo_wn(u_n: float | None, granica: bool) -> None:
    assert pole_granicy_wn(u_n) is granica
    assert granica is (pasmo_napieciowe(u_n) == "WN")


# ---------------------------------------------------------------------------
# Operacja wyposażenia pola — odmowa na granicy, para SN
# ---------------------------------------------------------------------------


def _ladunek_trybu(tryb: str) -> dict[str, Any]:
    return {
        "katalog": {
            "mode": "katalog",
            "devices": [{"kind": "CB", "placement": "MIDSTREAM", "catalog_ref": WYLACZNIK_SN}],
        },
        "szablon": {"mode": "szablon", "bay_template_ref": "bay_template_line_in"},
        "standard": {"mode": "standard", "szablon_standardu_ref": "ENEA_SN_LINIA"},
        "wymagania": {"mode": "wymagania"},
        "wyczysc": {"mode": "wyczysc"},
    }[tryb]


def test_iloczyn_trybow_kompletny() -> None:
    assert {*TRYBY_WYPOSAZENIA} == {"katalog", "szablon", "standard", "wymagania", "wyczysc"}


@pytest.mark.parametrize("tryb", TRYBY_WYPOSAZENIA)
def test_pole_110kv_odmawia_wyposazenia_w_kazdym_trybie(
    h5: dict[str, Any], r: RefyH5, tryb: str
) -> None:
    """Każde pole 110 kV (L1, L2, TR1, TR2, łącznik szyn) × każdy tryb → ta sama odmowa,
    model wejściowy nietknięty. Iniekcja „brama granicy zdjęta” — tryb ``wyczysc`` usuwa
    łącznik pola (pole bez łącznika z gałęzią), tryb ``standard`` odmawia innym kodem."""
    wn, _sn = _pola_wg_napiecia(h5)
    assert {b["bay_role"] for b in wn} == {"IN", "TR", "COUPLER"}
    assert len(wn) == 5
    for bay in wn:
        wejscie = copy.deepcopy(h5)
        wynik = execute_domain_operation(
            h5, "set_bay_equipment", {"bay_ref": bay["ref_id"], **_ladunek_trybu(tryb)}
        )
        assert wynik.get("error_code") == "bay_equipment.bay_hv_boundary", (bay["name"], wynik)
        assert wynik["snapshot"] is None
        assert h5 == wejscie
        komunikat = wynik["error"]
        assert "granicą zasilania sieci SN" in komunikat
        assert "Scenariusze łączeniowe" in komunikat
        assert bay["ref_id"] not in komunikat, "komunikat nazywa pole nazwą, nie identyfikatorem"


def _ze_szyna(enm: dict[str, Any], szyna: str, napiecie_kv: float) -> dict[str, Any]:
    """Kopia z napięciem jednej szyny zmienionym — reguły operacji wyposażenia czytają
    wyłącznie napięcie szyny pola (spójność transformatorów nie jest tu cechą)."""
    kopia = copy.deepcopy(enm)
    for bus in kopia["buses"]:
        if bus["ref_id"] == szyna:
            bus["voltage_kv"] = napiecie_kv
    return kopia


#: (napięcie szyny SN, tryb) → kod odmowy (``None`` — zapis).
OCZEKIWANE_SN: dict[tuple[float, str], str | None] = {
    (15.0, "standard"): None,
    (15.0, "katalog"): None,
    (15.0, "wymagania"): None,
    (15.0, "wyczysc"): None,
    (66.0, "standard"): "bay_equipment.standard_template_voltage_mismatch",
    (66.0, "katalog"): "bay_equipment.um_mismatch",
    (66.0, "wymagania"): "bay_equipment.um_mismatch",
    (66.0, "wyczysc"): None,
}


@pytest.mark.parametrize(("napiecie_kv", "tryb"), sorted(OCZEKIWANE_SN))
def test_pole_sn_tabela_napiec_bez_bramy_granicy(
    h5: dict[str, Any], r: RefyH5, napiecie_kv: float, tryb: str
) -> None:
    """Pole liniowe SN (szablon ENEA_SN_LINIA): szyna 15 kV — zapis; szyna 66 kV (pasmo SN,
    tabela 4 IEC 60038) — szablon standardu SN i aparat SN odmawiane tabelą napięć, NIGDY
    bramą granicy 110 kV (66 kV nie jest stroną 110 kV)."""
    enm = _ze_szyna(h5, r.szyna_sn_a, napiecie_kv)
    (linia, *_reszta) = (
        b
        for b in enm["bays"]
        if b.get("szablon_standardu_ref") == "ENEA_SN_LINIA" and b["bus_ref"] == r.szyna_sn_a
    )
    wynik = execute_domain_operation(
        enm, "set_bay_equipment", {"bay_ref": linia["ref_id"], **_ladunek_trybu(tryb)}
    )
    assert wynik.get("error_code") == OCZEKIWANE_SN[(napiecie_kv, tryb)], wynik.get("error")
    if OCZEKIWANE_SN[(napiecie_kv, tryb)] is None:
        assert wynik["snapshot"] is not None
        assert "wyposazenie_pola" in wynik


# ---------------------------------------------------------------------------
# Skład pola 110 kV — jeden łącznik pola, bez luk
# ---------------------------------------------------------------------------


def test_sklad_pola_110kv_lacznik_bez_typu_para_z_polem_sn(h5: dict[str, Any], r: RefyH5) -> None:
    """Pole liniowe i pole łącznika szyn 110 kV: jeden wiersz — łącznik pola z gałęzią modelu,
    status ``BRAK_TYPU_GRANICA_WN`` ze zdaniem wyjaśnienia; pole transformatora 110 kV: jeden
    wiersz transformatora z katalogu. Para: wyłącznik pola SN transformatora (gałąź bez
    pozycji katalogu, gniazdo „W” standardu) ma status gniazda standardu, nie granicy.
    Iniekcja „predykat granicy zawsze fałsz” — wiersz pola 110 kV traci status granicy."""
    model = EnergyNetworkModel.model_validate(h5)
    indeks = indeks_modelu_pola(model)
    wn, sn = _pola_wg_napiecia(h5)
    lacznik_pola = {
        bay["ref_id"]: bay["equipment_refs"][0] for bay in wn if bay["bay_role"] != "TR"
    }
    assert set(lacznik_pola.values()) == {r.wylacznik_l1, r.wylacznik_l2, r.lacznik_wn}
    for bay in wn:
        rekord = next(b for b in model.bays if b.ref_id == bay["ref_id"])
        wiersze = sklad_pola(indeks, rekord)
        assert len(wiersze) == 1, (bay["name"], wiersze)
        (wiersz,) = wiersze
        assert wiersz.gniazdo_ref is None
        assert "?" not in wiersz.opis_pl
        if bay["bay_role"] == "TR":
            assert (wiersz.rodzaj, wiersz.status) == ("TRANSFORMER_DEVICE", "ZAPROJEKTOWANE")
            assert wiersz.catalog_ref is not None
            continue
        assert wiersz.rodzaj == "CB"
        assert wiersz.status == "BRAK_TYPU_GRANICA_WN"
        assert wiersz.linked_ref == lacznik_pola[bay["ref_id"]]
        assert wiersz.catalog_ref is None
        assert "brak typu" in wiersz.opis_pl
        assert "granicą zasilania sieci SN" in wiersz.opis_pl
        assert "stan łącznika" in wiersz.opis_pl
    assert NAZWY_STATUSOW_SKLADU_PL["BRAK_TYPU_GRANICA_WN"] == (
        "brak typu — łącznik pola 110 kV (granica zasilania sieci SN)"
    )
    # Para SN: ten sam rodzaj łącznika (gałąź bez pozycji katalogu) w polu SN.
    pole_tr_sn = next(
        b for b in sn if b["bay_role"] == "TR" and r.wylacznik_tr1 in b["equipment_refs"]
    )
    rekord = next(b for b in model.bays if b.ref_id == pole_tr_sn["ref_id"])
    (w,) = (w for w in sklad_pola(indeks, rekord) if w.linked_ref == r.wylacznik_tr1)
    assert w.gniazdo_ref == "W"
    assert w.status == "WYMAGANE_STANDARDEM_BRAK"
    assert all(w.status != "BRAK_TYPU_GRANICA_WN" for w in sklad_pola(indeks, rekord))


# ---------------------------------------------------------------------------
# Analiza wytrzymałości aparatury — wyłącznie pola SN
# ---------------------------------------------------------------------------


def test_wytrzymalosc_aparatury_pomija_pola_110kv(h5: dict[str, Any], r: RefyH5) -> None:
    """Widok wytrzymałości stacji GPZ: wiersze i gniazda bez pozycji wyłącznie z pól SN.
    W modelu z operacji pole 110 kV nie ma aparatu z katalogu (łącznik bez typu), więc ten
    test jest stanem bazowym, nie dowodem filtra — iniekcja „filtr granicy zdjęty” jest
    obserwowalna w ``test_wytrzymalosc_pomija_pole_110kv_takze_z_zastanym_katalogiem``."""
    model = EnergyNetworkModel.model_validate(h5)
    widok = zbuduj_widok_wytrzymalosci_aparatury(
        enm=model, station_ref=r.stacja, prady_pol={}, run_id="bieg-testowy"
    )
    wn, sn = _pola_wg_napiecia(h5)
    refy_wn = {b["ref_id"] for b in wn}
    refy_sn = {b["ref_id"] for b in sn}
    w_widoku = {w["pole_ref"] for w in widok["pola"]} | {
        g["pole_ref"] for g in widok["gniazda_bez_pozycji"]
    }
    assert w_widoku, "widok bez pól SN"
    assert w_widoku <= refy_sn
    assert not (w_widoku & refy_wn)


# ---------------------------------------------------------------------------
# Katalog — brak aparatury 110 kV; punkt neutralny SN bez drugiej prawdy
# ---------------------------------------------------------------------------


def test_katalog_aparatury_pol_bez_pozycji_tabeli_4() -> None:
    """Strona 110 kV nie ma katalogu aparatury: żadna pozycja aparatury łączeniowej,
    ogranicznika, elementu pola ani wymagania gniazda nie leży w tabeli 4 IEC 60038
    (U_m ≥ 52 kV); szablony pól standardu opisują wyłącznie rozdzielnicę SN."""
    katalog = katalog_biezacy()
    u_m: list[tuple[str, float | None]] = []
    for ref, typ in katalog.mv_apparatus_types.items():
        u_m.append((ref, typ.u_m_kv if typ.u_m_kv is not None else typ.u_n_kv))
    u_m += [(ref, typ.u_m_kv) for ref, typ in katalog.surge_arrester_types.items()]
    u_m += [(ref, typ.u_m_kv) for ref, typ in katalog.element_pola_types.items()]
    w_tabeli_4 = [
        (ref, u) for ref, u in u_m if u is not None and tabela_napiec_urzadzenia(u) == "TAB4"
    ]
    assert w_tabeli_4 == []
    for ref_vt, vt in katalog.vt_types.items():
        assert vt.ratio_primary_v <= 40_500.0, ref_vt
    pozycje_wymagan = set(POZYCJE_WYMAGAN_GNIAZD.values())
    assert pozycje_wymagan, "rejestr pozycji wymagań pusty"
    for szablon, _gniazdo in POZYCJE_WYMAGAN_GNIAZD:
        assert szablon in SZABLONY_POL_STANDARDU, szablon
    for ref, szablon in SZABLONY_POL_STANDARDU.items():
        assert ref.startswith("ENEA_SN_"), ref
        assert " SN" in szablon.nazwa_pl, szablon.nazwa_pl


def test_element_pola_sn_nie_niesie_impedancji_punktu_neutralnego() -> None:
    """Punkt neutralny sieci SN ma JEDNO źródło impedancji: ``GroundingConfig`` modelu
    i pozycja ``MvNeutralGroundingItem`` katalogu. Element pola SN (dławik gaszący, rezystor,
    transformator uziemiający jako wyposażenie gniazda) niesie wymagania standardu (zakresy,
    obudowa, tryb pracy), nie R/X — inaczej dwie prawdy tej samej fizyki."""
    pola = {f.name for f in dataclasses.fields(ElementPolaType)}
    impedancyjne = {
        p for p in pola if p.endswith(("_ohm", "_ohm_ph")) or p.startswith(("r0", "x0"))
    }
    assert impedancyjne == set()
    from network_model.catalog.audit2_catalogs import MvNeutralGroundingItem

    assert {"r_ohm", "x_ohm"} <= {f.name for f in dataclasses.fields(MvNeutralGroundingItem)}


# ---------------------------------------------------------------------------
# Operacje stawiające aparat albo element sieci SN — brama granicy × para SN
# ---------------------------------------------------------------------------

#: Kabel SN z katalogu (12/20 kV) — odcinek magistrali układu H5.
KABEL_SN = "cable-tfk-yakxs-3x120"
#: Przekładnik napięciowy 15 kV z katalogu — poprawny dla szyny 15 kV.
PRZEKLADNIK_NAPIECIOWY_SN = "vt_15kv_100v_05_abb"
#: Rozłącznik SN i złącze kablowe SN z katalogu (łącznik sekcyjny, ZKSN).
ROZLACZNIK_SN = "sw-ls-schneider-rm6-17kv-400a"
ZLACZE_KABLOWE_SN = "ZKSN-2P-630A"
#: Pole rozdzielnicy z katalogu rozdzielnic (materializacja pola z katalogu).
POLE_KATALOGOWE = "ZPUE_WLOSZCZOWA__ROTOBLOK__TRANSFORMER"


def _z_odcinkiem_sn(h5: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    """Model H5 z jednym odcinkiem magistrali SN wyprowadzonym z wolnego pola liniowego SN
    (ścieżka użytkownika: ``continue_trunk_segment_sn``) → (model, rekord odcinka)."""
    wynik = execute_domain_operation(
        h5,
        "continue_trunk_segment_sn",
        {"segment": {"rodzaj": "KABEL", "dlugosc_m": 300, "catalog_ref": KABEL_SN}},
    )
    assert wynik.get("error") is None, wynik.get("error")
    enm = wynik["snapshot"]
    (kabel,) = (b for b in enm["branches"] if b["type"] == "cable")
    return enm, kabel


def _z_odcinkiem_wn(h5: dict[str, Any], r: RefyH5) -> tuple[dict[str, Any], dict[str, Any]]:
    """Ten sam odcinek przepięty na szynę sekcji 110 kV, koniec odcinka 110 kV. Odcinek 110 kV
    jest realny w sieciach WN: import XLSX i kompilator sieci odniesienia budują linie
    dowolnego poziomu napięcia operacjami odcinka (``continue_trunk_segment_sn`` ze zwykłej
    szyny, ``connect_secondary_ring_sn``); tu skrót do tego stanu na układzie H5."""
    enm, kabel = _z_odcinkiem_sn(h5)
    enm = copy.deepcopy(enm)
    (odcinek,) = (b for b in enm["branches"] if b["ref_id"] == kabel["ref_id"])
    odcinek["from_bus_ref"] = r.szyna_wn_1
    for bus in enm["buses"]:
        if bus["ref_id"] == odcinek["to_bus_ref"]:
            bus["voltage_kv"] = 110.0
    return enm, odcinek


def _pole_szyny(enm: dict[str, Any], szyna: str, rola: str) -> str:
    return next(b["ref_id"] for b in enm["bays"] if b["bus_ref"] == szyna and b["bay_role"] == rola)


def _przypadek(
    operacja: str, h5: dict[str, Any], r: RefyH5, strona: str
) -> tuple[dict[str, Any], dict[str, Any]]:
    """(model, ładunek) operacji na stronie ``WN`` (szyna albo pole 110 kV) i jej para ``SN``
    (to samo na szynie 15 kV sekcji A) — jedna funkcja, żeby para różniła się WYŁĄCZNIE
    stroną granicy."""
    wn = strona == "WN"
    szyna = r.szyna_wn_1 if wn else r.szyna_sn_a
    pole_pomiaru = _pole_szyny(h5, szyna, "IN" if wn else "OUT")
    katalog = katalog_biezacy()
    ct = katalog.ct_types[sorted(katalog.ct_types)[0]]
    vt = katalog.vt_types[PRZEKLADNIK_NAPIECIOWY_SN]
    if operacja == "add_ct":
        return h5, {
            "bay_ref": pole_pomiaru,
            "catalog_ref": ct.id,
            "ratio_primary_a": ct.ratio_primary_a,
            "ratio_secondary_a": ct.ratio_secondary_a,
        }
    if operacja == "add_vt":
        return h5, {
            "bay_ref": pole_pomiaru,
            "catalog_ref": vt.id,
            "ratio_primary_v": vt.ratio_primary_v,
            "ratio_secondary_v": vt.ratio_secondary_v,
        }
    if operacja == "add_sn_bay":
        return h5, {
            "bus_ref": szyna,
            "station_ref": r.stacja,
            "bay_role": "OUT",
            "field_apparatus_catalog_ref": WYLACZNIK_SN,
        }
    if operacja == "add_sn_bay_from_catalog":
        return h5, {
            "bus_ref": szyna,
            "station_ref": r.stacja,
            "complete_bay_template_ref": POLE_KATALOGOWE,
        }
    if operacja == "add_surge_arrester_sn":
        return h5, {
            "bus_ref": szyna,
            "station_ref": r.stacja,
            "catalog_ref": sorted(katalog.surge_arrester_types)[0],
        }
    enm, odcinek = _z_odcinkiem_wn(h5, r) if wn else _z_odcinkiem_sn(h5)
    if operacja == "append_station_on_endpoint":
        return enm, {
            "endpoint_bus_ref": odcinek["to_bus_ref"],
            "field_apparatus_catalog_ref": WYLACZNIK_SN,
            "station": {"name": "Stacja końcowa", "station_type": "terminal"},
            "nn_voltage_kv": 0.4,
        }
    if operacja == "insert_station_on_segment_sn":
        return enm, {
            "segment_ref": odcinek["ref_id"],
            "field_apparatus_catalog_ref": WYLACZNIK_SN,
            "station_type": "B",
            "insert_at": {"value": 0.5},
            "station": {"sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4},
            "sn_fields": ["IN", "OUT"],
            "transformer": {
                "create": True,
                "transformer_catalog_ref": "tr-sn-nn-15-04-630kva-dyn11",
            },
        }
    if operacja == "insert_section_switch_sn":
        return enm, {
            "segment_id": odcinek["ref_id"],
            "insert_at": {"mode": "RATIO", "value": 0.5},
            "catalog_ref": ROZLACZNIK_SN,
        }
    assert operacja == "insert_zksn_on_segment_sn", operacja
    return enm, {
        "segment_id": odcinek["ref_id"],
        "catalog_ref": ZLACZE_KABLOWE_SN,
        "insert_at": {"mode": "RATIO", "value": 0.5},
        "switch_state": "closed",
    }


#: Operacja stawiająca aparat albo pole SN → prefiks kodu odmowy granicy. Odcinek linii/kabla
#: (``continue_trunk_segment_sn``, ``connect_secondary_ring_sn``) świadomie poza listą: to
#: element sieci dowolnego napięcia (sieci WN importu XLSX i rejestru sieci odniesienia).
OPERACJE_STRONY_SN: dict[str, str] = {
    "add_ct": "ct",
    "add_vt": "vt",
    "add_sn_bay": "sn",
    "add_sn_bay_from_catalog": "sn",
    "add_surge_arrester_sn": "spd",
    "append_station_on_endpoint": "station.append",
    "insert_station_on_segment_sn": "station.insert",
    "insert_section_switch_sn": "switch",
    "insert_zksn_on_segment_sn": "branch_point",
}


@pytest.mark.parametrize("strona", ["WN", "SN"])
@pytest.mark.parametrize("operacja", sorted(OPERACJE_STRONY_SN))
def test_operacja_strony_sn_odmawia_szyny_110kv_para_z_szyna_sn(
    h5: dict[str, Any], r: RefyH5, operacja: str, strona: str
) -> None:
    """Iloczyn: operacja stawiająca aparat/pole/element SN × strona {szyna albo pole 110 kV,
    szyna 15 kV}. Strona 110 kV → odmowa atomowa ``{prefiks}.bus_hv_boundary`` (model
    wejściowy nietknięty, zdanie bez identyfikatorów); para SN → zapis. Iniekcja „brama
    zdjęta” w jednej operacji — jej przypadek WN przechodzi zapisem (czerwony)."""
    enm, ladunek = _przypadek(operacja, h5, r, strona)
    wejscie = copy.deepcopy(enm)
    wynik = execute_domain_operation(enm, operacja, ladunek)
    if strona == "SN":
        assert wynik.get("error") is None, (wynik.get("error_code"), wynik.get("error"))
        assert wynik["snapshot"] is not None
        return
    assert wynik.get("error_code") == f"{OPERACJE_STRONY_SN[operacja]}.bus_hv_boundary", (
        wynik.get("error_code"),
        wynik.get("error"),
    )
    assert wynik["snapshot"] is None
    assert enm == wejscie
    komunikat = wynik["error"]
    assert "leży na stronie 110 kV" in komunikat
    assert "granicą zasilania sieci SN" in komunikat
    assert "Scenariusze łączeniowe" in komunikat
    assert all(ref not in komunikat for ref in (r.szyna_wn_1, r.zacisk_l1, r.stacja))


def test_operacje_pierwszego_odcinka_sn_nie_wychodza_ze_strony_110kv(
    h5: dict[str, Any], r: RefyH5
) -> None:
    """Para do bramy granicy: odcinek SN magistrali i odgałęzienia nie wychodzi z szyny ani
    zacisku pola 110 kV — te operacje odmawiają WCZEŚNIEJ, regułą punktu startu (pole
    liniowe SN, port odgałęźny), więc bramy granicy nie dublują. Test przypina, że reguła
    startu obejmuje stronę 110 kV."""
    odcinek = {"rodzaj": "KABEL", "dlugosc_m": 300, "catalog_ref": KABEL_SN}
    oczekiwane = {
        ("continue_trunk_segment_sn", r.szyna_wn_1): "trunk.source_requires_line_bay",
        ("continue_trunk_segment_sn", r.zacisk_l1): "trunk.source_field_not_line_bay",
        ("start_branch_segment_sn", r.szyna_wn_1): "branch_connection.source_not_branch_capable",
        ("start_branch_segment_sn", r.zacisk_l1): "branch_connection.source_not_branch_capable",
    }
    for (operacja, szyna), kod in oczekiwane.items():
        ladunek = (
            {"from_terminal_id": szyna, "segment": odcinek}
            if operacja == "continue_trunk_segment_sn"
            else {"from_bus_ref": szyna, "segment": odcinek}
        )
        wynik = execute_domain_operation(h5, operacja, ladunek)
        assert wynik.get("error_code") == kod, (operacja, wynik.get("error"))


# ---------------------------------------------------------------------------
# Katalog łącznika strony 110 kV — odmowa w każdej drodze przypisania
# ---------------------------------------------------------------------------


def _drogi_przypisania(element_ref: str) -> dict[str, tuple[str, dict[str, Any]]]:
    return {
        "assign_catalog_to_element": (
            "assign_catalog_to_element",
            {
                "element_ref": element_ref,
                "catalog_item_id": WYLACZNIK_SN,
                "catalog_namespace": "APARAT_SN",
            },
        ),
        "update_element_parameters": (
            "update_element_parameters",
            {
                "element_ref": element_ref,
                "parameters": {"catalog_ref": WYLACZNIK_SN, "catalog_namespace": "APARAT_SN"},
            },
        ),
    }


@pytest.mark.parametrize("droga", ["assign_catalog_to_element", "update_element_parameters"])
@pytest.mark.parametrize(
    "lacznik", ["wylacznik_l1", "wylacznik_l2", "lacznik_wn", "wylacznik_tr1", "lacznik_sn"]
)
def test_katalog_lacznika_110kv_odmawiany_w_kazdej_drodze_para_sn(
    h5: dict[str, Any], r: RefyH5, lacznik: str, droga: str
) -> None:
    """Iloczyn: łącznik {pola liniowego 110 kV L1, L2, łącznik szyn 110 kV, wyłącznik pola SN TR1,
    łącznik szyn SN} × droga przypisania katalogu {operacja przypisania, zmiana parametrów}.
    Strona 110 kV → ``catalog.switch_hv_boundary`` (łącznik zostaje bez typu, model
    nietknięty); strona SN → aparat z katalogu zapisany. Iniekcja „brama katalogu zdjęta” —
    łącznik pola 110 kV dostaje pozycję aparatury SN (czerwony)."""
    ref = getattr(r, lacznik)
    operacja, ladunek = _drogi_przypisania(ref)[droga]
    wejscie = copy.deepcopy(h5)
    wynik = execute_domain_operation(h5, operacja, ladunek)
    if lacznik in {"wylacznik_tr1", "lacznik_sn"}:
        assert wynik.get("error") is None, (wynik.get("error_code"), wynik.get("error"))
        (galaz,) = (b for b in wynik["snapshot"]["branches"] if b["ref_id"] == ref)
        assert galaz["catalog_ref"] == WYLACZNIK_SN
        return
    assert wynik.get("error_code") == "catalog.switch_hv_boundary", wynik.get("error")
    assert wynik["snapshot"] is None
    assert h5 == wejscie
    assert "granicą zasilania sieci SN" in wynik["error"]
    assert "bez typu" in wynik["error"]
    assert ref not in wynik["error"]


def test_wytrzymalosc_pomija_pole_110kv_takze_z_zastanym_katalogiem(
    h5: dict[str, Any], r: RefyH5
) -> None:
    """Filtr granicy w analizie wytrzymałości jest obserwowalny: model ZASTANY (archiwum
    sprzed decyzji) z pozycją aparatury SN na wyłączniku pola 110 kV — operacje takiej pozycji
    już nie nadają (``catalog.switch_hv_boundary``), ale model spoza operacji może ją nieść.
    Widok wytrzymałości nadal nie ocenia pola 110 kV. Iniekcja „filtr granicy zdjęty” —
    pole liniowe 110 kV wraca do widoku z aparatem 17,5 kV (czerwony)."""
    zastany = copy.deepcopy(h5)
    for galaz in zastany["branches"]:
        if galaz["ref_id"] in {r.wylacznik_l1, r.wylacznik_l2}:
            galaz["catalog_ref"] = WYLACZNIK_SN
    model = EnergyNetworkModel.model_validate(zastany)
    widok = zbuduj_widok_wytrzymalosci_aparatury(
        enm=model, station_ref=r.stacja, prady_pol={}, run_id="bieg-testowy"
    )
    wn, _sn = _pola_wg_napiecia(zastany)
    refy_wn = {b["ref_id"] for b in wn}
    w_widoku = {w["pole_ref"] for w in widok["pola"]} | {
        g["pole_ref"] for g in widok["gniazda_bez_pozycji"]
    }
    assert w_widoku
    assert not (w_widoku & refy_wn)
