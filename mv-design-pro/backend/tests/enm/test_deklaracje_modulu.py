"""Deklaracje modułu w modelu i pisarze pól NC RfG generatora (odbiór Pakietu C, plan AB O-50
pkt 5–6).

Pole modelu bez pisarza jest martwym polem, a pole wejścia solvera bez nośnika w modelu —
„BRAK W MODELU", który udaje brak funkcji. Ten plik przypina oba końce łańcucha:

* KONTRAKT — nazwy i dziedziny bloku ``DeklaracjeModulu`` są 1:1 z ``NcRfgPtpireeModuleInput``,
  każde pole wejścia solvera ma nośnik w modelu (most nie wpisuje już „BRAK W MODELU"),
  deklaracja bez źródła jest odrzucana, blok jest poza odciskiem modelu, gdy ``None``;
* PISARZE — iloczyn operacja {``add_converter_source`` nN, ``add_converter_source`` DER-SN,
  ``update_element_parameters``} × pole {status art. 4, data umowy, nastawy, deklaracje} ×
  wartość {poprawna, spoza kontraktu, pusta};
* ODCZYT — deklaracja {obecna, nieobecna} × tor {zatwierdzony model, żądanie klienta ``/run``}
  × rodzaj twierdzenia {konfiguracja zadeklarowana, zachowanie dynamiczne}: test konfiguracji
  z danymi modelu jest oceniany (dane zwalidowane), z żądania klienta — dane przyjęte bez
  walidacji, bez deklaracji — ocena niewykonana z nazwanym brakiem; test zachowania
  dynamicznego pozostaje niewykonany (brak biegu dynamiki) z wartością informacyjną.
"""

from __future__ import annotations

import copy
import json
from datetime import date
from typing import Any

import pytest
from api.generators import DerGeneratorCreateRequest
from application.ncrfg_compliance import bieg_ncrfg, model_bridge, zgodnosc_ncrfg_przypadku
from application.ncrfg_compliance.model_bridge import build_ncrfg_module_input_from_generator
from enm.deklaracje_modulu import (
    POLA_DEKLARACJI,
    POLA_NC_RFG_GENERATORA,
    DeklaracjeModulu,
    pola_nc_rfg_generatora,
)
from enm.domain_operations import execute_domain_operation
from enm.hash import compute_enm_hash, compute_input_hash, hash_migawki_enm
from enm.models import EnergyNetworkModel, Generator
from enm.nastawy_modulu import POLA_NASTAW, NastawyZabezpieczenModulu
from network_model.solvers.ncrfg_ptpiree import NcRfgPtpireeModuleInput, NcRfgPtpireeRunRequest
from network_model.solvers.ncrfg_ptpiree.engine import TEST_CATALOG
from pydantic import ValidationError
from werdykt.proweniencja import ClaimKind

from tests import ncrfg_fabryki as f
from tests.enm.test_brama_katalogowa_operacji_v2 import (
    REF_PV,
    _payload_konwerter_der_sn,
    _payload_zrodla,
    _siec_ze_stacja,
    _wykonaj,
)

#: Wartość poprawna każdego pola deklaracji (logiczne: zadeklarowana funkcja).
_POPRAWNE: dict[str, Any] = {
    "p_min_kw": 100.0,
    "has_scada_communication": True,
    "has_disturbance_recorder": True,
    "active_power_control_enabled": True,
    "stop_generation_enabled": True,
    "reduction_generation_enabled": True,
    "island_operation_required": True,
    "island_operation_capable": True,
    "black_start_required": True,
    "black_start_capable": True,
    "power_oscillation_damping_required": True,
    "power_oscillation_damping_enabled": True,
    "ramp_rate_pct_per_min": 10.0,
    "reactive_current_gain": 2.0,
    "p_recovery_time_s": 0.8,
    "harmonic_thdu_percent": 3.0,
    "cease_generation_time_s": 1.0,
}
#: Wartość spoza dziedziny kontraktu dla pól liczbowych (granica z kontraktu solvera).
_POZA_DZIEDZINA: dict[str, float] = {
    "p_min_kw": -1.0,
    "ramp_rate_pct_per_min": 0.0,
    "reactive_current_gain": -0.1,
    "p_recovery_time_s": -0.1,
    "harmonic_thdu_percent": -0.1,
    "cease_generation_time_s": 0.0,
}
_ZRODLO = "karta katalogowa producenta, deklaracja wytwórcy"


def _deklaracje(**pola: Any) -> DeklaracjeModulu:
    return DeklaracjeModulu(**pola, zrodlo_pl=_ZRODLO)


# ---------------------------------------------------------------------------
# Kontrakt: parytet z wejściem solvera, źródło, dziedziny, odcisk
# ---------------------------------------------------------------------------


def test_parytet_nazw_i_dziedzin_z_wejsciem_solvera() -> None:
    """Nazwy 1:1 i te same ograniczenia dziedziny co ``NcRfgPtpireeModuleInput`` — w tym tryb
    ścisły (``Strict`` w metadanych pola): jeden predykat na obu nośnikach deklaracji."""
    assert set(DeklaracjeModulu.model_fields) - {"zrodlo_pl"} == set(POLA_DEKLARACJI)
    assert set(_POPRAWNE) == set(POLA_DEKLARACJI)
    wejscie = NcRfgPtpireeModuleInput.model_fields
    for pole in POLA_DEKLARACJI:
        assert pole in wejscie, pole
        assert DeklaracjeModulu.model_fields[pole].metadata == wejscie[pole].metadata, pole


def test_kazde_pole_wejscia_solvera_ma_nosnik_w_modelu() -> None:
    """Most nie ma już pozycji „BRAK W MODELU": każde pole deklaracji przechodzi 1:1."""
    assert "BRAK W MODELU" not in (model_bridge.__doc__ or "")
    wejscie = build_ncrfg_module_input_from_generator(
        f.generator(deklaracje_modulu=_deklaracje(**_POPRAWNE)),
        voltage_kv=15.0,
        operator_id=f.OPERATOR,
    )
    for pole, wartosc in _POPRAWNE.items():
        assert getattr(wejscie, pole) == wartosc, pole


@pytest.mark.parametrize("pole", POLA_DEKLARACJI)
def test_deklaracja_bez_zrodla_jest_odrzucana(pole: str) -> None:
    with pytest.raises(ValidationError, match="zrodlo_pl"):
        DeklaracjeModulu(**{pole: _POPRAWNE[pole]})
    assert getattr(_deklaracje(**{pole: _POPRAWNE[pole]}), pole) == _POPRAWNE[pole]


@pytest.mark.parametrize("pole", sorted(_POZA_DZIEDZINA))
def test_wartosc_spoza_dziedziny_jest_odrzucana(pole: str) -> None:
    with pytest.raises(ValidationError):
        _deklaracje(**{pole: _POZA_DZIEDZINA[pole]})


def test_brak_deklaracji_to_stan_nie_wartosc() -> None:
    brak = build_ncrfg_module_input_from_generator(
        f.generator(), voltage_kv=15.0, operator_id=f.OPERATOR
    )
    wymagania_programu = {
        "island_operation_required",
        "black_start_required",
        "power_oscillation_damping_required",
    }
    for pole in POLA_DEKLARACJI:
        oczekiwane = False if pole in wymagania_programu else None
        assert getattr(brak, pole) is oczekiwane, pole


def _model(**pola: Any) -> EnergyNetworkModel:
    return f.model(f.generator(**pola))


def test_deklaracje_poza_odciskiem_gdy_none() -> None:
    enm = _model()
    dane = enm.model_dump(mode="json")
    for generator in dane["generators"]:
        generator.pop("deklaracje_modulu", None)
    assert compute_enm_hash(enm) == hash_migawki_enm(dane)
    z = _model(deklaracje_modulu=_deklaracje(p_min_kw=100.0))
    assert compute_enm_hash(enm) != compute_enm_hash(z)
    assert compute_input_hash(enm) != compute_input_hash(z)


# ---------------------------------------------------------------------------
# Pisarze: operacja × pole × wartość
# ---------------------------------------------------------------------------

_WARTOSCI: dict[str, tuple[Any, Any, str]] = {
    # pole: (wartość poprawna w ładunku, wartość spoza kontraktu, kod błędu)
    "modul_istniejacy": (False, "tak", "generator.modul_istniejacy_invalid"),
    "data_umowy_przylaczeniowej": ("2025-03-01", "01.03.2025", "generator.data_umowy_invalid"),
    "nastawy_zabezpieczen": (
        {"u_min_pu": 0.8, "u_min_czas_s": 0.2, "zrodlo_pl": "karta nastaw"},
        {"u_min_pu": 0.8},
        "generator.nastawy_zabezpieczen_invalid",
    ),
    "deklaracje_modulu": (
        {"stop_generation_enabled": True, "cease_generation_time_s": 1.0, "zrodlo_pl": _ZRODLO},
        {"stop_generation_enabled": True, "pole_nieznane": 1},
        "generator.deklaracje_modulu_invalid",
    ),
}
_OCZEKIWANE_W_MODELU: dict[str, Any] = {
    "modul_istniejacy": False,
    "data_umowy_przylaczeniowej": date(2025, 3, 1),
    "nastawy_zabezpieczen": NastawyZabezpieczenModulu(
        u_min_pu=0.8, u_min_czas_s=0.2, zrodlo_pl="karta nastaw"
    ),
    "deklaracje_modulu": _deklaracje(stop_generation_enabled=True, cease_generation_time_s=1.0),
}
_OPERACJE = ("add_converter_source_nn", "add_converter_source_der_sn", "update_element_parameters")


def test_lista_pol_pisarzy_to_pola_modelu() -> None:
    assert set(POLA_NC_RFG_GENERATORA) == set(_WARTOSCI)
    assert set(POLA_NC_RFG_GENERATORA) <= set(Generator.model_fields)


def _zapisz(operacja: str, pole: str, wartosc: Any) -> tuple[dict[str, Any], dict[str, Any]]:
    """(migawka przed, wynik operacji) dla operacji zapisu pola NC RfG generatora."""
    siec = _siec_ze_stacja()
    if operacja == "add_converter_source_nn":
        payload = _payload_zrodla(siec, catalog_ref=REF_PV, technologia="PV")
        return siec, execute_domain_operation(
            siec, "add_converter_source", {**payload, pole: wartosc}
        )
    if operacja == "add_converter_source_der_sn":
        payload = copy.deepcopy(_payload_konwerter_der_sn(siec))
        return siec, execute_domain_operation(
            siec, "add_converter_source", {**payload, pole: wartosc}
        )
    z_wytworca = _wykonaj(
        siec, "add_converter_source", _payload_zrodla(siec, catalog_ref=REF_PV, technologia="PV")
    )
    ref = z_wytworca["generators"][-1]["ref_id"]
    return z_wytworca, execute_domain_operation(
        z_wytworca,
        "update_element_parameters",
        {"element_ref": ref, "parameters": {pole: wartosc}},
    )


@pytest.mark.parametrize("pole", list(_WARTOSCI))
@pytest.mark.parametrize("operacja", _OPERACJE)
def test_pisarz_zapisuje_pole_poprawne_w_postaci_kontraktu(operacja: str, pole: str) -> None:
    _przed, wynik = _zapisz(operacja, pole, _WARTOSCI[pole][0])
    assert not wynik.get("error"), (wynik.get("error"), wynik.get("error_code"))
    enm = EnergyNetworkModel.model_validate(wynik["snapshot"])
    wytworca = enm.generators[-1]
    assert getattr(wytworca, pole) == _OCZEKIWANE_W_MODELU[pole]


@pytest.mark.parametrize("pole", list(_WARTOSCI))
@pytest.mark.parametrize("operacja", _OPERACJE)
def test_pisarz_odrzuca_wartosc_spoza_kontraktu_bez_skutku(operacja: str, pole: str) -> None:
    _przed, wynik = _zapisz(operacja, pole, _WARTOSCI[pole][1])
    assert wynik.get("error_code") == _WARTOSCI[pole][2], wynik
    assert wynik.get("snapshot") is None


@pytest.mark.parametrize("pole", list(_WARTOSCI))
def test_aktualizacja_pusta_zdejmuje_dana(pole: str) -> None:
    z_polem = _zapisz("update_element_parameters", pole, _WARTOSCI[pole][0])[1]["snapshot"]
    ref = z_polem["generators"][-1]["ref_id"]
    wynik = execute_domain_operation(
        z_polem, "update_element_parameters", {"element_ref": ref, "parameters": {pole: None}}
    )
    assert not wynik.get("error")
    assert (
        getattr(EnergyNetworkModel.model_validate(wynik["snapshot"]).generators[-1], pole) is None
    )


def test_jeden_walidator_dla_obu_pisarzy() -> None:
    """Ta sama funkcja normalizuje ładunek tworzenia i aktualizacji (predykat parami)."""
    pola, blad = pola_nc_rfg_generatora({pole: w[0] for pole, w in _WARTOSCI.items()})
    assert blad is None
    assert pola["data_umowy_przylaczeniowej"] == "2025-03-01"
    assert pola["nastawy_zabezpieczen"] == {
        "u_min_pu": 0.8,
        "u_min_czas_s": 0.2,
        "zrodlo_pl": "karta nastaw",
    }


# ---------------------------------------------------------------------------
# Jeden typ pola na każdym nośniku: nośnik × wartość (status art. 4, data umowy)
# ---------------------------------------------------------------------------

#: Wartości daty umowy: liczby (także zapisane napisem) pydantic w trybie łagodnym czyta jako
#: czas uniksowy (0 → 1970-01-01, 1735689600 → 2025-01-01) — cicha podmiana daty umowy, a z nią
#: wersji procedury PTPiREE. Przyjęte są WYŁĄCZNIE data i napis ISO RRRR-MM-DD.
_DATY: tuple[tuple[Any, bool], ...] = (
    (0, False),
    (86400, False),
    (1735689600, False),
    (0.0, False),
    (True, False),
    ("1735689600", False),
    ("01.03.2025", False),
    ("2025-03-01T00:00:00", False),
    ("2025-02-30", False),
    ("2025-03-01", True),
    (date(2025, 3, 1), True),
)
#: Wartości statusu modułu istniejącego: wyłącznie wartość logiczna.
_STATUSY: tuple[tuple[Any, bool], ...] = (
    (1, False),
    (0, False),
    ("true", False),
    ("tak", False),
    (True, True),
    (False, True),
)
_NOSNIKI = (
    "pisarz_operacji",
    "model_python",
    "model_json",
    "zadanie_http",
    "wejscie_solvera",
)


def _przyjete(nosnik: str, pole: str, wartosc: Any) -> bool:
    """Czy nośnik przyjmuje wartość pola (``True``) czy ją odrzuca (``False``)."""
    if nosnik == "pisarz_operacji":
        return pola_nc_rfg_generatora({pole: wartosc})[1] is None
    try:
        if nosnik == "model_python":
            Generator.model_validate(
                {"ref_id": "g-1", "name": "G", "bus_ref": "b-1", "p_mw": 1.0, pole: wartosc}
            )
        elif nosnik == "model_json":
            Generator.model_validate_json(
                json.dumps(
                    {"ref_id": "g-1", "name": "G", "bus_ref": "b-1", "p_mw": 1.0, pole: wartosc}
                )
            )
        elif nosnik == "zadanie_http":
            DerGeneratorCreateRequest.model_validate(
                {
                    "station_ref": "st-1",
                    "der_kind": "PV",
                    "power_mw": 1.0,
                    "catalog_ref": REF_PV,
                    pole: wartosc,
                }
            )
        else:
            NcRfgPtpireeModuleInput.model_validate({**f.KOMPLET, pole: wartosc})
    except ValidationError:
        return False
    return True


@pytest.mark.parametrize(("wartosc", "przyjeta"), _DATY)
@pytest.mark.parametrize("nosnik", _NOSNIKI)
def test_data_umowy_jeden_typ_na_kazdym_nosniku(nosnik: str, wartosc: Any, przyjeta: bool) -> None:
    if nosnik == "model_json" and isinstance(wartosc, date):
        wartosc = wartosc.isoformat()
    assert _przyjete(nosnik, "data_umowy_przylaczeniowej", wartosc) is przyjeta


@pytest.mark.parametrize(("wartosc", "przyjeta"), _STATUSY)
@pytest.mark.parametrize("nosnik", _NOSNIKI)
def test_status_modulu_istniejacego_jeden_typ_na_kazdym_nosniku(
    nosnik: str, wartosc: Any, przyjeta: bool
) -> None:
    assert _przyjete(nosnik, "modul_istniejacy", wartosc) is przyjeta


@pytest.mark.parametrize("operacja", _OPERACJE)
def test_pisarz_odrzuca_liczbe_jako_date_umowy_bez_skutku(operacja: str) -> None:
    """Czas uniksowy o północy (2025-01-01) nie przechodzi żadną operacją zapisu."""
    _przed, wynik = _zapisz(operacja, "data_umowy_przylaczeniowej", 1735689600)
    assert wynik.get("error_code") == "generator.data_umowy_invalid", wynik
    assert wynik.get("snapshot") is None


# ---------------------------------------------------------------------------
# Tryb ścisły kontraktów modułu: kontrakt × pole × wartość innego rodzaju × nośnik
# ---------------------------------------------------------------------------

_LICZBOWE_DEKLARACJI = tuple(p for p in POLA_DEKLARACJI if not isinstance(_POPRAWNE[p], bool))
_LOGICZNE_DEKLARACJI = tuple(p for p in POLA_DEKLARACJI if isinstance(_POPRAWNE[p], bool))


def test_podzial_pol_deklaracji_jest_zupelny() -> None:
    assert set(_LICZBOWE_DEKLARACJI) | set(_LOGICZNE_DEKLARACJI) == set(POLA_DEKLARACJI)
    assert set(_LICZBOWE_DEKLARACJI) == set(_POZA_DZIEDZINA)


def _deklaracja_na_nosniku(nosnik: str, pole: str, wartosc: Any) -> Any:
    """Wartość pola deklaracji po walidacji na nośniku: blok modelu albo wejście solvera (ten
    sam predykat — nazwy 1:1, tryb ścisły na obu)."""
    if nosnik == "blok_modelu":
        return getattr(DeklaracjeModulu(**{pole: wartosc}, zrodlo_pl=_ZRODLO), pole)
    return getattr(NcRfgPtpireeModuleInput.model_validate({**f.KOMPLET, pole: wartosc}), pole)


_NOSNIKI_DEKLARACJI = ("blok_modelu", "wejscie_solvera")


@pytest.mark.parametrize("wartosc", [True, False, "1.5"])
@pytest.mark.parametrize("pole", _LICZBOWE_DEKLARACJI)
@pytest.mark.parametrize("nosnik", _NOSNIKI_DEKLARACJI)
def test_deklaracja_liczbowa_nie_przyjmuje_wartosci_innego_rodzaju(
    nosnik: str, pole: str, wartosc: Any
) -> None:
    """Wartość logiczna nie staje się liczbą (true → 1,0), napis nie staje się liczbą; liczba
    całkowita JEST liczbą — na bloku modelu i na wejściu solvera jednakowo."""
    with pytest.raises(ValidationError):
        _deklaracja_na_nosniku(nosnik, pole, wartosc)
    assert _deklaracja_na_nosniku(nosnik, pole, 2) == 2.0


@pytest.mark.parametrize("wartosc", [1, 0, "true", "false"])
@pytest.mark.parametrize("pole", _LOGICZNE_DEKLARACJI)
@pytest.mark.parametrize("nosnik", _NOSNIKI_DEKLARACJI)
def test_deklaracja_logiczna_nie_przyjmuje_wartosci_innego_rodzaju(
    nosnik: str, pole: str, wartosc: Any
) -> None:
    with pytest.raises(ValidationError):
        _deklaracja_na_nosniku(nosnik, pole, wartosc)
    assert _deklaracja_na_nosniku(nosnik, pole, True) is True


@pytest.mark.parametrize("wartosc", [True, "0.8"])
@pytest.mark.parametrize("pole", POLA_NASTAW)
def test_nastawa_nie_przyjmuje_wartosci_innego_rodzaju(pole: str, wartosc: Any) -> None:
    with pytest.raises(ValidationError):
        NastawyZabezpieczenModulu(**{pole: wartosc}, zrodlo_pl="karta nastaw")
    assert getattr(NastawyZabezpieczenModulu(**{pole: 2}, zrodlo_pl="karta nastaw"), pole) == 2.0


_INNEGO_RODZAJU: dict[str, tuple[dict[str, Any], str]] = {
    "deklaracje_modulu": (
        {"cease_generation_time_s": True, "zrodlo_pl": _ZRODLO},
        "generator.deklaracje_modulu_invalid",
    ),
    "nastawy_zabezpieczen": (
        {"u_min_pu": "0.8", "u_min_czas_s": 0.2, "zrodlo_pl": "karta nastaw"},
        "generator.nastawy_zabezpieczen_invalid",
    ),
}


@pytest.mark.parametrize("pole", list(_INNEGO_RODZAJU))
@pytest.mark.parametrize("operacja", _OPERACJE)
def test_pisarz_odrzuca_wartosc_innego_rodzaju_bez_skutku(operacja: str, pole: str) -> None:
    wartosc, kod = _INNEGO_RODZAJU[pole]
    _przed, wynik = _zapisz(operacja, pole, wartosc)
    assert wynik.get("error_code") == kod, wynik
    assert wynik.get("snapshot") is None


@pytest.mark.parametrize("pole", list(_INNEGO_RODZAJU))
@pytest.mark.parametrize("nosnik", ["model_python", "model_json", "zadanie_http"])
def test_blok_modulu_innego_rodzaju_odrzucany_na_kazdym_nosniku(nosnik: str, pole: str) -> None:
    assert _przyjete(nosnik, pole, _INNEGO_RODZAJU[pole][0]) is False
    poprawna = _WARTOSCI[pole][0]
    assert _przyjete(nosnik, pole, poprawna) is True


def test_nastawy_innego_rodzaju_odrzucane_na_wejsciu_solvera() -> None:
    """Wejście solvera niesie TEN SAM kontrakt nastaw (``nastawy_zabezpieczen_modulu``)."""
    with pytest.raises(ValidationError):
        NcRfgPtpireeModuleInput.model_validate(
            {**f.KOMPLET, "nastawy_zabezpieczen_modulu": _INNEGO_RODZAJU["nastawy_zabezpieczen"][0]}
        )


# ---------------------------------------------------------------------------
# Odczyt: deklaracja × tor × rodzaj twierdzenia
# ---------------------------------------------------------------------------

_RODZAJ = {d.test_id: d.rodzaj_twierdzenia for d in TEST_CATALOG}
#: Testy czytające deklaracje modułu (T05, T10–T13, T16–T20) i pola, które nazywa brak.
_TESTY_DEKLARACJI: dict[str, str] = {
    "T05": "active_power_control_enabled",
    "T11": "p_min_kw",
    "T12": "stop_generation_enabled",
    "T13": "reduction_generation_enabled",
    "T16": "p_recovery_time_s",
    "T17": "reactive_current_gain",
    "T19": "has_scada_communication",
}
_KOMPLET_DEKLARACJI = {
    pole: wartosc
    for pole, wartosc in _POPRAWNE.items()
    if not pole.startswith(("island", "black", "power_oscillation"))
}


def _testy_modelu(typ: str, deklaracje: DeklaracjeModulu | None) -> dict[str, Any]:
    p_max_kw, napiecie_kv = f.TYPY_MOCY[typ]
    zgodnosc = zgodnosc_ncrfg_przypadku(
        f.model(
            f.generator(p_mw=p_max_kw / 1000.0, deklaracje_modulu=deklaracje),
            napiecie_kv=napiecie_kv,
        ),
        operator_id=f.OPERATOR,
        case_id="c-1",
    )
    assert zgodnosc.bieg is not None
    return {t.test_id: t for t in zgodnosc.bieg.modules[0].tests}


def _testy_klienta(typ: str, deklaracje: dict[str, Any]) -> dict[str, Any]:
    p_max_kw, napiecie_kv = f.TYPY_MOCY[typ]
    dane = {k: v for k, v in f.KOMPLET.items() if k not in POLA_DEKLARACJI}
    modul = NcRfgPtpireeModuleInput(
        **{**dane, "p_max_kw": p_max_kw, "voltage_kv": napiecie_kv, **deklaracje}
    )
    bieg = bieg_ncrfg(NcRfgPtpireeRunRequest(modules=[modul]), zrodlo_danych="ZADANIE_KLIENTA")
    return {t.test_id: t for t in bieg.modules[0].tests}


@pytest.mark.parametrize("typ", ["B", "C"])
@pytest.mark.parametrize("obecna", [True, False])
def test_deklaracja_z_modelu_obecna_nieobecna_rodzaj_twierdzenia(typ: str, obecna: bool) -> None:
    testy = _testy_modelu(typ, _deklaracje(**_KOMPLET_DEKLARACJI) if obecna else None)
    sprawdzone = [t for t in _TESTY_DEKLARACJI if testy[t].required]
    assert {"T05", "T11", "T16", "T17"} <= set(sprawdzone)
    for test_id in sprawdzone:
        ocena = testy[test_id].ocena
        assert ocena.dowod.status_danych.stan == "ZWALIDOWANE", test_id
        pole = _TESTY_DEKLARACJI[test_id]
        if _RODZAJ[test_id] is ClaimKind.DYNAMIC_PERFORMANCE:
            # Zachowanie dynamiczne: bez biegu dynamiki niewykonane niezależnie od deklaracji
            # (nazwanym brakiem jest bieg dynamiki); deklaracja jest wartością informacyjną
            # wyniku i daną przyjętą w śladzie, jej brak — brakiem wartości informacyjnej.
            assert ocena.status_maszynowy == "NIE_OCENIONO", test_id
            assert any("bieg dynamiki" in b for b in ocena.wyjasnienie.czego_brakuje), test_id
            assert (ocena.wynik is not None) == obecna, test_id
            if obecna:
                assert ocena.wynik is not None and ocena.wynik.wartosc.wartosc == (
                    _KOMPLET_DEKLARACJI[pole]
                ), test_id
            continue
        if obecna:
            assert ocena.status_maszynowy != "NIE_OCENIONO", test_id
            assert ocena.wynik is not None and ocena.wynik.metoda == "DEKLARACJA", test_id
        else:
            assert ocena.status_maszynowy == "NIE_OCENIONO", test_id
            assert any(pole in b for b in ocena.wyjasnienie.czego_brakuje), test_id


@pytest.mark.parametrize("obecna", [True, False])
def test_deklaracja_z_zadania_klienta_to_dana_przyjeta(obecna: bool) -> None:
    """Tor ``/run``: ta sama deklaracja z żądania klienta jest daną przyjętą bez walidacji
    (``UNVALIDATED_INPUT``), a jej brak — oceną niewykonaną z nazwanym brakiem (T19: brak
    deklaracji ≠ zadeklarowany brak funkcji)."""
    testy = _testy_klienta("C", _KOMPLET_DEKLARACJI if obecna else {})
    for test_id in ("T05", "T11", "T19"):
        ocena = testy[test_id].ocena
        assert ocena.dowod.status_danych.stan == "UNVALIDATED_INPUT", test_id
        assert ocena.kompletnosc_dowodu == "NIEPELNY", test_id
        if obecna:
            assert ocena.wynik is not None, test_id
        else:
            assert ocena.status_maszynowy == "NIE_OCENIONO", test_id
            pole = _TESTY_DEKLARACJI[test_id]
            assert any(pole in b for b in ocena.wyjasnienie.czego_brakuje), test_id


@pytest.mark.parametrize("zadeklarowane", [True, False, None])
def test_t19_brak_deklaracji_to_nie_zadeklarowany_brak(zadeklarowane: bool | None) -> None:
    """T19 × {zadeklarowana funkcja, zadeklarowany brak, brak deklaracji}: NIE_SPELNIA wyłącznie
    przy zadeklarowanym braku; brak deklaracji to NIE_OCENIONO z nazwanym brakiem."""
    pola = (
        {}
        if zadeklarowane is None
        else {"has_scada_communication": zadeklarowane, "has_disturbance_recorder": True}
    )
    ocena = _testy_modelu("C", _deklaracje(**pola) if pola else None)["T19"].ocena
    if zadeklarowane is None:
        assert ocena.status_maszynowy == "NIE_OCENIONO"
        assert ocena.wynik is None
    else:
        assert ocena.wynik is not None
        assert ocena.wynik.wartosc.wartosc == (1.0 if zadeklarowane else 0.0)
        assert ("zadeklarowany brak" in (ocena.wynik.punkt_krytyczny_pl or "")) == (
            not zadeklarowane
        )
