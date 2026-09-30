"""Kotwica wyłącznika liniowego — jedna reguła dla listy read modelu i dwóch pisarzy.

Karta BIEG-ZABEZPIECZEN-Z-MODELU: przekładnik (``add_ct``) i przekaźnik (``add_relay``) mogą
stać przy wyłączniku wstawionym w odcinek SN poza polem rozdzielnicy; ekran „Zabezpieczenia i
automatyka” listuje takie wyłączniki (``protection-view`` → ``wylaczniki_liniowe``). Predykat
jest JEDEN (``odmowa_kotwicy_wylacznika``) — gdyby lista i pisarze liczyli go osobno, ekran
oferowałby „Dodaj przekładnik” przy aparacie, który operacja odrzuca (zmierzone na żywym
e2e: wyłącznik strony nN stacji był na liście wyłączników liniowych SN).

Iloczyn cech: kotwica {wyłącznik liniowy SN, rozłącznik liniowy, wyłącznik pola stacji,
wyłącznik liniowy z szyną nN, wyłącznik liniowy z szyną WN, szyna bez napięcia, aparat
nieistniejący} × wejście {predykat, lista read modelu, ``add_ct``, ``add_relay``} — kod odmowy
z tego samego powodu, model wejściowy nietknięty przy odmowie.
"""

from __future__ import annotations

import copy
from functools import cache
from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation
from enm.wylaczniki_liniowe import odmowa_kotwicy_wylacznika, wylaczniki_liniowe

from tests.golden.enm_builders.zabezpieczenia_magistrali import (
    KATALOG_APARATU,
    KATALOG_PRZEKAZNIKA,
    KATALOG_PRZEKLADNIKA,
    POLOZENIE_WYLACZNIKA,
    operacja,
    siec_magistrali,
)


def _wstaw(enm: dict[str, Any], odcinek: str, rodzaj: str, nazwa: str) -> tuple[dict, str]:
    przed = {g["ref_id"] for g in enm["branches"]}
    enm = operacja(
        enm,
        "insert_section_switch_sn",
        {
            "segment_id": odcinek,
            "insert_at": {"mode": "RATIO", "value": POLOZENIE_WYLACZNIKA},
            "switch_type": rodzaj,
            "catalog_ref": KATALOG_APARATU,
            "switch_name": nazwa,
        },
    )
    (nowy,) = (
        g["ref_id"]
        for g in enm["branches"]
        if g["ref_id"] not in przed and g["type"] in ("breaker", "switch")
    )
    return enm, nowy


@cache
def _siec() -> tuple[dict[str, Any], dict[str, str]]:
    """Magistrala G08 bez zabezpieczeń z wyłącznikiem i rozłącznikiem liniowym."""
    enm, odcinek_gpz, odcinek_s01 = siec_magistrali()
    enm, wylacznik = _wstaw(enm, odcinek_gpz, "WYLACZNIK", "Wyłącznik liniowy")
    enm, rozlacznik = _wstaw(enm, odcinek_s01, "ROZLACZNIK", "Rozłącznik liniowy")
    wylacznik_pola = next(g["ref_id"] for g in enm["branches"] if "sn_field_breaker" in g["ref_id"])
    return enm, {
        "wylacznik_liniowy_sn": wylacznik,
        "rozlacznik_liniowy": rozlacznik,
        "wylacznik_pola": wylacznik_pola,
    }


def _z_napieciem(enm: dict[str, Any], wylacznik: str, napiecie: float | None) -> dict[str, Any]:
    """Kopia modelu, w której szyna końcowa wyłącznika ma zadane napięcie znamionowe."""
    kopia = copy.deepcopy(enm)
    galaz = next(g for g in kopia["branches"] if g["ref_id"] == wylacznik)
    for szyna in kopia["buses"]:
        if szyna["ref_id"] == galaz["to_bus_ref"]:
            szyna["voltage_kv"] = napiecie
    return kopia


#: (nazwa przypadku, klucz aparatu, napięcie szyny końcowej albo „bez zmiany”, powód)
PRZYPADKI: list[tuple[str, str, Any, str | None]] = [
    ("wylacznik_liniowy_sn", "wylacznik_liniowy_sn", "bez_zmiany", None),
    ("rozlacznik_liniowy", "rozlacznik_liniowy", "bez_zmiany", "NIE_WYLACZNIK"),
    ("wylacznik_pola_stacji", "wylacznik_pola", "bez_zmiany", "W_POLU"),
    ("szyna_nn", "wylacznik_liniowy_sn", 0.4, "POZA_SIECIA_SN"),
    ("szyna_wn", "wylacznik_liniowy_sn", 110.0, "POZA_SIECIA_SN"),
    ("szyna_bez_napiecia", "wylacznik_liniowy_sn", None, "POZA_SIECIA_SN"),
    ("aparat_nieistniejacy", "nieistniejacy", "bez_zmiany", "NIE_WYLACZNIK"),
]
KODY = {
    "NIE_WYLACZNIK": "breaker_not_found",
    "W_POLU": "breaker_in_field",
    "POZA_SIECIA_SN": "breaker_not_sn",
}


def _przypadek(klucz: str, napiecie: Any) -> tuple[dict[str, Any], str]:
    enm, aparaty = _siec()
    ref = aparaty.get(klucz, "sw/nieistniejacy/switch")
    model = copy.deepcopy(enm) if napiecie == "bez_zmiany" else _z_napieciem(enm, ref, napiecie)
    return model, ref


@pytest.mark.parametrize(("nazwa", "klucz", "napiecie", "powod"), PRZYPADKI)
def test_predykat_i_lista_read_modelu_z_jednego_zrodla(
    nazwa: str, klucz: str, napiecie: Any, powod: str | None
) -> None:
    model, ref = _przypadek(klucz, napiecie)
    assert odmowa_kotwicy_wylacznika(model, ref) == powod, nazwa
    na_liscie = ref in {w["ref_id"] for w in wylaczniki_liniowe(model)}
    assert na_liscie is (powod is None), nazwa


@pytest.mark.parametrize(("nazwa", "klucz", "napiecie", "powod"), PRZYPADKI)
def test_add_ct_przyjmuje_i_odrzuca_wg_tej_samej_reguly(
    nazwa: str, klucz: str, napiecie: Any, powod: str | None
) -> None:
    model, ref = _przypadek(klucz, napiecie)
    przed = copy.deepcopy(model)
    wynik = execute_domain_operation(
        model,
        "add_ct",
        {
            "breaker_ref": ref,
            "catalog_ref": KATALOG_PRZEKLADNIKA,
            "ratio_primary_a": 600.0,
            "ratio_secondary_a": 5.0,
            "accuracy_class": "5P20",
            "burden_va": 15.0,
        },
    )
    if powod is None:
        assert wynik.get("error") is None, wynik.get("error")
    else:
        assert wynik["error_code"] == f"ct.{KODY[powod]}", nazwa
        assert model == przed


@pytest.mark.parametrize(("nazwa", "klucz", "napiecie", "powod"), PRZYPADKI)
def test_add_relay_przyjmuje_i_odrzuca_wg_tej_samej_reguly(
    nazwa: str, klucz: str, napiecie: Any, powod: str | None
) -> None:
    model, ref = _przypadek(klucz, napiecie)
    if powod is None:
        wynik_ct = execute_domain_operation(
            model,
            "add_ct",
            {
                "breaker_ref": ref,
                "catalog_ref": KATALOG_PRZEKLADNIKA,
                "ratio_primary_a": 600.0,
                "ratio_secondary_a": 5.0,
                "accuracy_class": "5P20",
                "burden_va": 15.0,
            },
        )
        model = wynik_ct["snapshot"]
    przed = copy.deepcopy(model)
    wynik = execute_domain_operation(
        model,
        "add_relay",
        {"breaker_ref": ref, "relay_type": "NADPRADOWY", "catalog_ref": KATALOG_PRZEKAZNIKA},
    )
    if powod is None:
        assert wynik.get("error") is None, wynik.get("error")
    else:
        assert wynik["error_code"] == f"relay.{KODY[powod]}", nazwa
        assert model == przed


def _aparaty_torow_pol(enm: dict[str, Any]) -> list[str]:
    """Aparaty leżące W TORZE pola (karta POLA-W-TORZE): łącznik między szyną pola a WŁASNYM
    zaciskiem pola (`enm.zajetosc_pol.zacisk_pola`) — z topologii, nie z wyposażenia pola."""
    from enm.zajetosc_pol import zacisk_pola

    wynik: list[str] = []
    for stacja in enm["substations"]:
        for spec in (stacja.get("meta") or {}).get("field_specs") or []:
            zacisk = zacisk_pola(spec)
            if not zacisk or zacisk == spec.get("bus_ref"):
                continue
            wynik.extend(
                g["ref_id"]
                for g in enm["branches"]
                if {g.get("from_bus_ref"), g.get("to_bus_ref")} == {spec.get("bus_ref"), zacisk}
            )
    return sorted(wynik)


@pytest.mark.parametrize("stacje", [("Stacja S01", "Stacja S02"), ("S1", "S2", "S3")])
def test_aparat_w_torze_pola_nie_jest_wylacznikiem_liniowym(stacje: tuple[str, ...]) -> None:
    """Predykat pola (`pole_aparatu` z wyposażenia pola) i zasada toru (aparat między szyną pola
    a zaciskiem) muszą rozpoznawać TEN SAM zbiór aparatów pól: każdy aparat toru pola stacji
    wstawionej w odcinek to kotwica `W_POLU` (przekładnik i zabezpieczenie wskazuje się przez
    pole), nigdy wyłącznik liniowy — inaczej lista wyłączników liniowych ekranu „Zabezpieczenia
    i automatyka” zawierałaby aparaty pól."""
    enm, _gpz, _s01 = siec_magistrali(stacje)
    aparaty = _aparaty_torow_pol(enm)
    assert len(aparaty) == 3 * len(stacje)  # pola WE, WY, TR każdej stacji
    for aparat in aparaty:
        assert odmowa_kotwicy_wylacznika(enm, aparat) == "W_POLU", aparat
    assert not set(aparaty) & {w["ref_id"] for w in wylaczniki_liniowe(enm)}
