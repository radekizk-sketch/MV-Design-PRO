"""Próba operacji (`dry_run`) dla elementów z regułą napięcia tabliczki wobec szyny.

Klasa defektu (scalenie gałęzi UI/UX z gałęzią programu, 2026-10-28): kreatory ui2 liczyły
we froncie WŁASNĄ kopię reguły napięcia — generator synchroniczny |U_r − U_n| > 1,0 kV,
bateria kondensatorów |U_r − U_n| > 0,5 kV, ogranicznik przepięć U_m < U_n — a backend miał
(albo nie miał) własną. Dwa niezależne predykaty, które „dziś się zgadzają”, to defekt
oczekujący na dane brzegowe; ogranicznik nie miał reguły w backendzie wcale. Teraz reguła
jest WYŁĄCZNIE w operacji, a kreator pyta o werdykt próbą TEJ SAMEJ operacji.

Reguły z podstawą normową (korekta 2026-10-28 — wielkość porównywana właściwa dla rodzaju):
generator — U_n szyny w strefie A maszyny 0,95–1,05·U_rG (IEC 60034-1 p. 7.3); bateria —
U_n ≤ U_N ≤ U_s (IEC 60871-1, IEC 60038); ogranicznik i aparaty pola — poziom izolacji
U_m ≥ U_s sieci (IEC 60071-1:2006 p. 3.9–3.10, IEC 60038), nie U_m ≥ U_n.

Iloczyn cech: operacja {generator SN, bateria kondensatorów SN, ogranicznik przepięć SN} ×
napięcie tabliczki {zgodne, niezgodne} × tryb {zapis, próba} × droga {funkcja domenowa,
końcówka HTTP z utrwaleniem}; poziom izolacji: sieć {3…30 kV} × U_m {poniżej, równe, powyżej
U_s} × {ogranicznik operacją, ogranicznik w polu, wyłącznik w polu}; granice reguł generatora
i baterii. Na każdej kombinacji:
próba i zapis dają TĘ SAMĄ odmowę (kod i komunikat), próba zgodna nie niesie migawki i nie
zmienia modelu, a jej `preview.created_refs` to identyfikatory, które nada zapis.
"""

from __future__ import annotations

import copy
from collections.abc import Callable
from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation
from enm.domain_operations_v2 import odmowa_napiecia_generatora, odmowa_tabliczki_baterii
from enm.katalog_projektu import katalog_biezacy
from fastapi.testclient import TestClient

from tests.api.test_pole_katalogowe_api import (  # noqa: F401 — fikstura `klient`
    _ciag_sn,
    _nowy_przypadek,
    _odcisk,
    _operacja,
    _szyna_sn,
    klient,
)
from tests.enm.model_minimalny import model_minimalny
from tests.enm.test_brama_katalogowa_operacji_v2 import _siec_ze_stacja, _szyna_sn_ref


def _szyna_z_polem(napiecie_kv: float) -> dict[str, Any]:
    return model_minimalny(
        buses=[{"ref_id": "BUS_SN", "name": "Szyna SN", "voltage_kv": napiecie_kv}],
        substations=[
            {"ref_id": "ST1", "name": "Stacja 1", "station_type": "mv_lv", "bus_refs": ["BUS_SN"]}
        ],
        bays=[
            {
                "ref_id": "POLE-IN",
                "name": "Pole liniowe",
                "bay_role": "IN",
                "substation_ref": "ST1",
                "bus_ref": "BUS_SN",
                "equipment_refs": [],
            }
        ],
    )


def _wiazanie(przestrzen: str, pozycja: str) -> dict[str, Any]:
    return {
        "catalog_binding": {
            "catalog_namespace": przestrzen,
            "catalog_item_id": pozycja,
            "catalog_item_version": "2024.1",
            "materialize": True,
        }
    }


def _generator(rated_kv_wzgledem_szyny: float) -> Callable[[], tuple[dict[str, Any], dict]]:
    def zbuduj() -> tuple[dict[str, Any], dict[str, Any]]:
        siec = copy.deepcopy(_siec_ze_stacja())
        szyna = _szyna_sn_ref(siec)
        napiecie = float(next(b for b in siec["buses"] if b["ref_id"] == szyna)["voltage_kv"])
        ladunek = {
            "bus_ref": szyna,
            "p_mw": 0.5,
            "q_mvar": 0.1,
            "manual_params": {"rated_mva": 2.0, "rated_kv": napiecie + rated_kv_wzgledem_szyny},
        }
        return siec, ladunek

    return zbuduj


def _bateria(pozycja: str) -> Callable[[], tuple[dict[str, Any], dict[str, Any]]]:
    def zbuduj() -> tuple[dict[str, Any], dict[str, Any]]:
        siec = model_minimalny(
            buses=[{"ref_id": "bus-sn-1", "name": "Szyna SN", "voltage_kv": 15.0}]
        )
        return siec, {"bus_ref": "bus-sn-1", **_wiazanie("KOMPENSATOR_SN", pozycja)}

    return zbuduj


def _ogranicznik(
    napiecie_szyny_kv: float, pozycja: str
) -> Callable[[], tuple[dict[str, Any], dict[str, Any]]]:
    def zbuduj() -> tuple[dict[str, Any], dict[str, Any]]:
        return _szyna_z_polem(napiecie_szyny_kv), {
            "field_ref": "POLE-IN",
            **_wiazanie("OGRANICZNIK_SN", pozycja),
        }

    return zbuduj


#: (operacja, budowa zgodna, budowa niezgodna, kod odmowy niezgodnej)
PRZYPADKI = {
    "generator_sn": (
        "add_generator_sn",
        _generator(0.0),
        _generator(5.0),
        "generator.voltage_mismatch",
    ),
    "bateria_sn": (
        "add_shunt_compensator_sn",
        _bateria("KOMP_SN_1V2_15KV"),
        _bateria("KOMP_SN_1V8_20KV"),
        "shunt.voltage_mismatch",
    ),
    "ogranicznik_sn": (
        "add_surge_arrester_sn",
        _ogranicznik(20.0, "arrester-abb-polim-d-24kv-10ka"),
        _ogranicznik(20.0, "arrester-abb-polim-d-12kv-10ka"),
        "spd.voltage_mismatch",
    ),
}


@pytest.mark.parametrize("nazwa", sorted(PRZYPADKI))
def test_odmowa_napiecia_identyczna_w_zapisie_i_w_probie(nazwa: str) -> None:
    operacja, _, niezgodna, kod = PRZYPADKI[nazwa]
    siec, ladunek = niezgodna()
    zapis = execute_domain_operation(copy.deepcopy(siec), operacja, ladunek)
    proba = execute_domain_operation(copy.deepcopy(siec), operacja, {**ladunek, "dry_run": True})
    assert zapis.get("error_code") == kod, zapis
    assert proba.get("error_code") == kod, proba
    assert proba["error"] == zapis["error"]
    assert not proba.get("snapshot")


@pytest.mark.parametrize("nazwa", sorted(PRZYPADKI))
def test_proba_zgodna_bez_migawki_z_identyfikatorami_zapisu(nazwa: str) -> None:
    operacja, zgodna, _, _ = PRZYPADKI[nazwa]
    siec, ladunek = zgodna()
    przed = copy.deepcopy(siec)
    zapis = execute_domain_operation(copy.deepcopy(siec), operacja, ladunek)
    assert not zapis.get("error"), zapis
    assert zapis.get("snapshot")
    assert "dry_run" not in zapis

    proba = execute_domain_operation(siec, operacja, {**ladunek, "dry_run": True})
    assert not proba.get("error"), proba
    assert proba["dry_run"] is True
    assert "snapshot" not in proba
    assert proba["preview"]["created_refs"] == zapis["changes"]["created_element_ids"]
    assert proba["preview"]["created_refs"]
    # Wejście próby nietknięte (operacja pracuje na kopii granicznej).
    assert siec == przed


#: Napięcie znamionowe sieci → napięcie najwyższe sieci U_s [kV] — IEC 60038 tab. 3 (seria I),
#: przepisane LITERAŁEM z normy (nie z tabeli produktu), żeby test nie był tautologią.
U_S_IEC_60038: dict[float, float] = {
    3.0: 3.6,
    6.0: 7.2,
    10.0: 12.0,
    15.0: 17.5,
    20.0: 24.0,
    30.0: 36.0,
}


def _u_m_ogranicznikow() -> list[tuple[str, float]]:
    return sorted(
        (ref, float(typ.u_m_kv)) for ref, typ in katalog_biezacy().surge_arrester_types.items()
    )


def _u_m_aparatow_sn() -> list[tuple[str, float]]:
    return sorted(
        (ref, float(typ.u_n_kv))
        for ref, typ in katalog_biezacy().mv_apparatus_types.items()
        if typ.device_kind in ("WYLACZNIK", "REKLOZER")
    )


def _wykonaj_ogranicznik(siec: dict[str, Any], pozycja: str) -> dict[str, Any]:
    return execute_domain_operation(
        siec,
        "add_surge_arrester_sn",
        {"field_ref": "POLE-IN", **_wiazanie("OGRANICZNIK_SN", pozycja)},
    )


def _wykonaj_aparat_pola(siec: dict[str, Any], pozycja: str, rodzaj: str) -> dict[str, Any]:
    umiejscowienie = "GROUND_BRANCH" if rodzaj == "SURGE_ARRESTER" else "MIDSTREAM"
    return execute_domain_operation(
        siec,
        "set_bay_equipment",
        {
            "bay_ref": "POLE-IN",
            "mode": "katalog",
            "devices": [{"kind": rodzaj, "placement": umiejscowienie, "catalog_ref": pozycja}],
        },
    )


#: (droga, rodzaj aparatu, źródło pozycji katalogu, kod odmowy)
DROGI_POZIOMU_IZOLACJI = {
    "ogranicznik_operacja": ("ogranicznik", _u_m_ogranicznikow, "spd.voltage_mismatch"),
    "ogranicznik_w_polu": (
        "SURGE_ARRESTER",
        _u_m_ogranicznikow,
        "bay_equipment.voltage_insufficient",
    ),
    "wylacznik_w_polu": ("CB", _u_m_aparatow_sn, "bay_equipment.voltage_insufficient"),
}


@pytest.mark.parametrize("napiecie_sieci_kv", sorted(U_S_IEC_60038))
@pytest.mark.parametrize("droga", sorted(DROGI_POZIOMU_IZOLACJI))
def test_poziom_izolacji_u_m_wobec_u_s_sieci(droga: str, napiecie_sieci_kv: float) -> None:
    """Iloczyn {sieć 3…30 kV} × {każda pozycja katalogu: U_m poniżej / równe / powyżej U_s} ×
    {ogranicznik operacją, ogranicznik w wyposażeniu pola, wyłącznik w wyposażeniu pola}.

    Odmowa ⇔ U_m < U_s (IEC 60071-1:2006 p. 3.9–3.10, para U_s z IEC 60038). Granica równości
    U_m = U_s jest dopuszczona; U_m = U_n sieci (np. 15 kV na sieci 15 kV) NIE pokrywa sieci.
    Korekta 2026-10-28: poprzednia wersja tego testu przypinała regułę U_m ≥ U_n.
    """
    rodzaj, pozycje, kod = DROGI_POZIOMU_IZOLACJI[droga]
    u_s = U_S_IEC_60038[napiecie_sieci_kv]
    for pozycja, u_m in pozycje():
        siec = _szyna_z_polem(napiecie_sieci_kv)
        wynik = (
            _wykonaj_ogranicznik(siec, pozycja)
            if rodzaj == "ogranicznik"
            else _wykonaj_aparat_pola(siec, pozycja, rodzaj)
        )
        if u_m < u_s:
            assert wynik.get("error_code") == kod, (pozycja, u_m, wynik)
            assert f"napięcia najwyższego sieci {u_s:g} kV" in wynik["error"], wynik["error"]
            assert f"napięcie najwyższe urządzenia {u_m:g} kV" in wynik["error"], wynik["error"]
        else:
            assert not wynik.get("error"), (pozycja, u_m, wynik)


@pytest.mark.parametrize("droga", sorted(DROGI_POZIOMU_IZOLACJI))
def test_iloczyn_poziomu_izolacji_pokrywa_trzy_komorki(droga: str) -> None:
    """Pokrycie iloczynu: dla każdej drogi katalog daje komórki U_m < U_s, U_m = U_s
    i U_m > U_s na sieciach testu (inaczej test wyżej sprawdzałby mniej, niż deklaruje)."""
    _, pozycje, _ = DROGI_POZIOMU_IZOLACJI[droga]
    komorki = {(u_m > u_s) - (u_m < u_s) for u_s in U_S_IEC_60038.values() for _, u_m in pozycje()}
    assert komorki == {-1, 0, 1}


def test_u_m_rowne_u_n_sieci_nie_pokrywa_sieci() -> None:
    """Komórka dyskryminująca: aparat o U_r = 15 kV (reklozer z katalogu) na sieci 15 kV —
    odmowa, bo U_s = 17,5 kV."""
    pozycja = next(ref for ref, u_m in _u_m_aparatow_sn() if u_m == 15.0)
    wynik = _wykonaj_aparat_pola(_szyna_z_polem(15.0), pozycja, "CB")
    assert wynik.get("error_code") == "bay_equipment.voltage_insufficient", wynik


def _ladunek_na_szynie_api(nazwa: str, szyna: str, zgodny: bool) -> tuple[str, dict[str, Any]]:
    if nazwa == "generator_sn":
        return "add_generator_sn", {
            "bus_ref": szyna,
            "p_mw": 0.5,
            "q_mvar": 0.1,
            "manual_params": {"rated_mva": 2.0, "rated_kv": 15.0 if zgodny else 20.0},
        }
    if nazwa == "bateria_sn":
        pozycja = "KOMP_SN_1V2_15KV" if zgodny else "KOMP_SN_1V8_20KV"
        return "add_shunt_compensator_sn", {
            "bus_ref": szyna,
            **_wiazanie("KOMPENSATOR_SN", pozycja),
        }
    pozycja = "arrester-abb-polim-d-24kv-10ka" if zgodny else "arrester-abb-polim-d-12kv-10ka"
    return "add_surge_arrester_sn", {"bus_ref": szyna, **_wiazanie("OGRANICZNIK_SN", pozycja)}


@pytest.mark.parametrize("zgodny", [True, False], ids=["zgodne", "niezgodne"])
@pytest.mark.parametrize("nazwa", sorted(PRZYPADKI))
def test_proba_przez_koncowke_nie_zmienia_modelu(
    klient: TestClient,  # noqa: F811 — fikstura z modułu testów pola katalogowego
    nazwa: str,
    zgodny: bool,
) -> None:
    case_id = _nowy_przypadek(klient)
    szyna = _szyna_sn(_ciag_sn(klient, case_id))
    operacja, ladunek = _ladunek_na_szynie_api(nazwa, szyna, zgodny)
    odcisk_przed = _odcisk(klient, case_id)

    proba = _operacja(klient, case_id, operacja, {**ladunek, "dry_run": True})
    assert "snapshot" not in proba or not proba["snapshot"]
    assert _odcisk(klient, case_id) == odcisk_przed
    if not zgodny:
        assert proba.get("error_code") == PRZYPADKI[nazwa][3], proba
        return
    assert proba["dry_run"] is True, proba
    zapis = _operacja(klient, case_id, operacja, ladunek)
    assert not zapis.get("error"), zapis
    assert proba["preview"]["created_refs"] == zapis["changes"]["created_element_ids"]
    assert _odcisk(klient, case_id) != odcisk_przed


@pytest.mark.parametrize(
    ("napiecie_szyny_kv", "rated_kv", "odmowa"),
    [
        (6.0, 6.3, False),  # U_n/U_rG = 0,952 — strefa A
        (6.0, 7.0, True),  # 0,857 — dawna tolerancja 1,0 kV przyjmowała
        (10.0, 10.5, False),
        (15.0, 15.0, False),
        (15.0, 15.75, False),
        (20.0, 21.0, False),  # U_n/U_rG = 0,952
        (20.0, 22.0, True),  # 0,909
        (30.0, 31.5, False),  # dawna tolerancja 1,0 kV odmawiała
        (15.0, 14.0, True),  # 1,071
    ],
)
def test_regula_generatora_strefa_a_iec_60034_1(
    napiecie_szyny_kv: float, rated_kv: float, odmowa: bool
) -> None:
    wynik = odmowa_napiecia_generatora(rated_kv, napiecie_szyny_kv)
    if odmowa:
        assert wynik is not None and wynik["error_code"] == "generator.voltage_mismatch"
        assert "IEC 60034-1" in wynik["error"]
    else:
        assert wynik is None


@pytest.mark.parametrize(
    ("napiecie_szyny_kv", "rated_kv", "odmowa"),
    [
        (15.0, 14.9, True),  # U_N < U_n — praca ciągła w przepięciu
        (15.0, 15.0, False),
        (15.0, 17.0, False),  # bateria z dławikiem ochronnym (dawne ±0,5 kV odmawiało)
        (15.0, 17.5, False),  # brzeg U_N = U_s
        (15.0, 17.6, True),
        (15.0, 20.0, True),  # bateria wyższego poziomu napięcia
        (20.0, 15.0, True),
        (20.0, 20.0, False),
        (20.0, 24.0, False),
        (20.0, 24.5, True),
    ],
)
def test_regula_baterii_un_do_us(napiecie_szyny_kv: float, rated_kv: float, odmowa: bool) -> None:
    wynik = odmowa_tabliczki_baterii(1.2, rated_kv, napiecie_szyny_kv)
    if odmowa:
        assert wynik is not None and wynik["error_code"] == "shunt.voltage_mismatch"
    else:
        assert wynik is None
