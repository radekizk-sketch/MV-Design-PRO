"""Jedna reguła zapisu nastaw zabezpieczeń dla każdego pisarza (karta BIEG-ZABEZPIECZEN-Z-MODELU).

Deklaracja modułu ``enm.nastawy_zabezpieczen``: „JEDNA reguła dla każdego pisarza” — zapis
przyjmuje nastawy NIEKOMPLETNE (brak nazywa ocena), odrzuca SPRZECZNE i zapisuje postać
znormalizowaną (walidacja ``ProtectionSetting``, ``exclude_none``, sortowanie po funkcji).
Ten test przypina deklarację: gdyby któryś pisarz przepuszczał sprzeczność albo zapisywał
nastawy bez normalizacji, ten sam model dawałby różne migawki zależnie od drogi zapisu.

Iloczyn cech:
  pisarz {``add_relay``, ``update_protection_settings`` (operacje domenowe V2),
          ``attach_protection``, ``update_protection`` (operacje topologiczne)} ×
  nastawy {komplet, niekompletne ×2 (tylko funkcja; próg bez charakterystyki) — przyjęte;
          sprzeczne ×12 — odrzucone} ×
  skutek {odmowa: model wejściowy nietknięty i brak nowego przypisania, kod odmowy wspólny dla
          operacji V2; przyjęcie: zapis równy ``normalizuj_nastawy`` i ta sama postać dla
          wejścia w odwróconej kolejności}.
Sieć: G08 bez przekaźników (magistrala z wyłącznikiem liniowym i przekładnikiem z katalogu),
budowana operacjami domenowymi.
"""

from __future__ import annotations

import copy
from functools import cache
from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation
from enm.nastawy_zabezpieczen import bledy_nastaw, normalizuj_nastawy
from enm.topology_ops import attach_protection, update_protection

from tests.golden.enm_builders.zabezpieczenia_magistrali import (
    KATALOG_APARATU,
    KATALOG_PRZEKAZNIKA,
    KATALOG_PRZEKLADNIKA,
    NASTAWY_Q1,
    POLOZENIE_WYLACZNIKA,
    operacja,
    siec_magistrali,
)

KOMPLET: list[dict[str, Any]] = copy.deepcopy(NASTAWY_Q1)

NIEKOMPLETNE: dict[str, list[dict[str, Any]]] = {
    "tylko_funkcja": [{"function_type": "overcurrent_51"}],
    "prog_bez_charakterystyki": [
        {"function_type": "overcurrent_51", "threshold_a": 2.0, "threshold_unit": "A_WTORNY"}
    ],
}

_I51 = {"function_type": "overcurrent_51", "threshold_a": 2.0, "threshold_unit": "A_WTORNY"}

SPRZECZNE: dict[str, Any] = {
    "nie_lista": {"function_type": "overcurrent_51"},
    "wpis_nie_slownik": ["overcurrent_51"],
    "funkcja_spoza_slownika": [{"function_type": "overcurrent_99"}],
    "prog_niedodatni": [{**_I51, "threshold_a": 0.0, "curve_type": "DT", "time_delay_s": 0.3}],
    "prog_bez_jednostki": [
        {"function_type": "overcurrent_51", "threshold_a": 2.0, "curve_type": "DT"}
    ],
    "mnoznik_niedodatni": [{**_I51, "curve_type": "IEC_SI", "time_multiplier": -0.1}],
    "zwloka_ujemna": [{**_I51, "curve_type": "DT", "time_delay_s": -0.1}],
    "zwloka_zero_funkcji_pradowej": [{**_I51, "curve_type": "DT", "time_delay_s": 0.0}],
    "zwloka_przy_charakterystyce_zaleznej": [
        {**_I51, "curve_type": "IEC_SI", "time_multiplier": 0.2, "time_delay_s": 0.3}
    ],
    "mnoznik_przy_czasie_niezaleznym": [
        {**_I51, "curve_type": "DT", "time_delay_s": 0.3, "time_multiplier": 0.2}
    ],
    "funkcja_dwukrotnie": [
        {**_I51, "curve_type": "DT", "time_delay_s": 0.3},
        {**_I51, "curve_type": "DT", "time_delay_s": 0.5},
    ],
    "pole_czestotliwosciowe_w_funkcji_pradowej": [{**_I51, "threshold_hz": 50.0}],
    "pole_pradowe_w_funkcji_czestotliwosciowej": [
        {"function_type": "rocof_81R", "threshold_hz_s": 2.0, "threshold_a": 1.0}
    ],
}


@cache
def _siec_bazowa() -> tuple[dict[str, Any], str, str]:
    """G08 bez przekaźnika: wyłącznik liniowy na odcinku GPZ i przekładnik z katalogu."""
    enm, odcinek_gpz, _odcinek_s01 = siec_magistrali()
    przed = {g["ref_id"] for g in enm["branches"]}
    enm = operacja(
        enm,
        "insert_section_switch_sn",
        {
            "segment_id": odcinek_gpz,
            "insert_at": {"mode": "RATIO", "value": POLOZENIE_WYLACZNIKA},
            "switch_type": "WYLACZNIK",
            "catalog_ref": KATALOG_APARATU,
            "switch_name": "Wyłącznik liniowy testu",
        },
    )
    (wylacznik,) = (
        g["ref_id"] for g in enm["branches"] if g["ref_id"] not in przed and g["type"] == "breaker"
    )
    wynik_ct = execute_domain_operation(
        enm,
        "add_ct",
        {
            "breaker_ref": wylacznik,
            "catalog_ref": KATALOG_PRZEKLADNIKA,
            "ratio_primary_a": 600.0,
            "ratio_secondary_a": 5.0,
            "accuracy_class": "5P20",
            "burden_va": 15.0,
            "name": "Przekładnik testu",
        },
    )
    assert wynik_ct.get("error") is None, wynik_ct.get("error")
    return wynik_ct["snapshot"], wylacznik, wynik_ct["selection_hint"]["element_id"]


def _siec() -> tuple[dict[str, Any], str, str]:
    enm, wylacznik, przekladnik = _siec_bazowa()
    return copy.deepcopy(enm), wylacznik, przekladnik


def _siec_z_przekaznikiem() -> tuple[dict[str, Any], str]:
    enm, wylacznik, przekladnik = _siec()
    wynik = _add_relay(enm, wylacznik, przekladnik, KOMPLET)
    assert wynik.get("error") is None, wynik.get("error")
    return wynik["snapshot"], wynik["selection_hint"]["element_id"]


def _add_relay(
    enm: dict[str, Any], wylacznik: str, przekladnik: str, nastawy: Any
) -> dict[str, Any]:
    return execute_domain_operation(
        enm,
        "add_relay",
        {
            "breaker_ref": wylacznik,
            "ct_ref": przekladnik,
            "relay_type": "NADPRADOWY",
            "catalog_ref": KATALOG_PRZEKAZNIKA,
            "name": "Zabezpieczenie testu",
            "settings": nastawy,
        },
    )


def _zapis(pisarz: str, nastawy: Any) -> tuple[bool, dict[str, Any], dict[str, Any], str | None]:
    """Wykonaj zapis wskazanym pisarzem. Zwraca (przyjęty, model przed, model po, kod odmowy);
    przy przyjęciu „model po” to migawka z zapisem, przy odmowie — model wejściowy po wywołaniu."""
    if pisarz in ("add_relay", "attach_protection"):
        enm, wylacznik, przekladnik = _siec()
        przed = copy.deepcopy(enm)
        if pisarz == "add_relay":
            wynik = _add_relay(enm, wylacznik, przekladnik, nastawy)
            if wynik.get("error") is not None:
                return False, przed, enm, wynik.get("error_code")
            return True, przed, wynik["snapshot"], None
        wynik_topo = attach_protection(
            enm,
            {
                "ref_id": "zab-testu",
                "name": "Zabezpieczenie testu",
                "breaker_ref": wylacznik,
                "ct_ref": przekladnik,
                "device_type": "overcurrent",
                "settings": nastawy,
            },
        )
        return wynik_topo.success, przed, (wynik_topo.enm if wynik_topo.success else enm), None
    enm, zabezpieczenie = _siec_z_przekaznikiem()
    przed = copy.deepcopy(enm)
    if pisarz == "update_protection_settings":
        wynik = execute_domain_operation(
            enm,
            "update_protection_settings",
            {"protection_ref": zabezpieczenie, "settings": nastawy},
        )
        if wynik.get("error") is not None:
            return False, przed, enm, wynik.get("error_code")
        return True, przed, wynik["snapshot"], None
    wynik_topo = update_protection(enm, {"ref_id": zabezpieczenie, "settings": nastawy})
    return wynik_topo.success, przed, (wynik_topo.enm if wynik_topo.success else enm), None


PISARZE = ("add_relay", "update_protection_settings", "attach_protection", "update_protection")


def _zapisane(enm: dict[str, Any]) -> list[dict[str, Any]]:
    (przypisanie,) = enm["protection_assignments"]
    return przypisanie["settings"]


@pytest.mark.parametrize("pisarz", PISARZE)
@pytest.mark.parametrize(
    "nazwa,nastawy",
    [("komplet", KOMPLET), *NIEKOMPLETNE.items()],
)
def test_nastawy_kompletne_i_niekompletne_zapisane_w_postaci_znormalizowanej(
    pisarz: str, nazwa: str, nastawy: list[dict[str, Any]]
) -> None:
    przyjety, _przed, po, kod = _zapis(pisarz, copy.deepcopy(nastawy))
    assert przyjety, f"{pisarz} odrzucił nastawy {nazwa} (kod {kod})"
    assert _zapisane(po) == normalizuj_nastawy(nastawy)
    # Ta sama treść w odwróconej kolejności wpisów daje ten sam zapis (determinizm migawki).
    przyjety_odwr, _p, po_odwr, _k = _zapis(pisarz, list(reversed(copy.deepcopy(nastawy))))
    assert przyjety_odwr
    assert _zapisane(po_odwr) == _zapisane(po)


@pytest.mark.parametrize("pisarz", PISARZE)
@pytest.mark.parametrize("nazwa", sorted(SPRZECZNE))
def test_nastawy_sprzeczne_odrzucone_bez_skutku(pisarz: str, nazwa: str) -> None:
    nastawy = copy.deepcopy(SPRZECZNE[nazwa])
    assert bledy_nastaw(nastawy), f"reguła zapisu nie nazywa sprzeczności {nazwa}"
    przyjety, przed, po, kod = _zapis(pisarz, nastawy)
    assert not przyjety, f"{pisarz} zapisał sprzeczne nastawy {nazwa}"
    assert po == przed, f"{pisarz} zmienił model wejściowy mimo odmowy ({nazwa})"
    if pisarz in ("add_relay", "update_protection_settings"):
        assert kod == "relay.settings_invalid"


def test_odmowa_operacji_v2_nazywa_kazda_sprzecznosc_zdaniem_po_polsku() -> None:
    """Obie operacje V2 zwracają w treści odmowy WSZYSTKIE zdania reguły (nie tylko pierwsze)."""
    nastawy = [
        {"function_type": "overcurrent_51", "threshold_a": 2.0, "curve_type": "DT"},
        {"function_type": "overcurrent_50", "threshold_a": -1.0, "threshold_unit": "A_WTORNY"},
    ]
    zdania = bledy_nastaw(nastawy)
    assert len(zdania) == 2
    enm, wylacznik, przekladnik = _siec()
    odmowa_add = _add_relay(enm, wylacznik, przekladnik, nastawy)
    enm2, zabezpieczenie = _siec_z_przekaznikiem()
    odmowa_upd = execute_domain_operation(
        enm2, "update_protection_settings", {"protection_ref": zabezpieczenie, "settings": nastawy}
    )
    for odmowa in (odmowa_add, odmowa_upd):
        assert odmowa["error_code"] == "relay.settings_invalid"
        for zdanie in zdania:
            assert zdanie in odmowa["error"]
