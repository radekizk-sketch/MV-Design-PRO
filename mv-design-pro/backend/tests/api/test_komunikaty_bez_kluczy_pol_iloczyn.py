"""Klasa: surowy klucz pola kontraktu w komunikacie dla projektanta — iloczyn ŹRÓDŁO × POLE.

PO CO. Strażnik statyczny (``tests/enm/test_klucze_pol_w_komunikatach_src.py``) czyta drzewo
składniowe całego ``src`` i nie widzi zdania, które powstaje dopiero w biegu (nazwa pola
z mapy, opis wstawiony z krotki, zamiana kluczy odmowy dynamiki na etykiety). Ten plik
wywołuje REALNE drogi, którymi komunikat dochodzi do projektanta, i sprawdza gotowe zdanie:

* ŹRÓDŁO komunikatu: odmowa danych końcówki API (422 przez handler ``OdmowaDanychError``),
  walidacja kształtu żądania (422 ``RequestValidationError`` → ``opis_pozycji_walidacji``),
  identyfikator w ścieżce/parametrze (400/422 ``parsuj_uuid`` i rozwiązanie biegu arkusza
  nN), scenariusz zwarciowy (422 ``FaultScenarioValidationError``), model ENM (pydantic →
  ``opis_bledu_walidacji`` — ta sama funkcja, którą operacje domenowe oddają projektantowi),
  rdzeń obliczeniowy (``OdmowaDanychError`` solvera podglądu, krzywych nN, ZIP, falownika,
  obciążalności, pętli zwarcia), katalog typów (odmowa niezmiennika typu), odmowa dynamiki
  (``OdmowaDynamiki`` → ``komunikat_dla_projektanta``), walidacja modelu źródła i migracja modelu
  zastanego;
* POLE: co najmniej dwa różne pola kontraktu w każdym źródle.

Dla każdej pary zdanie (1) zawiera polską nazwę wielkości — z mapy ``NAZWY_POL_KONTRAKTU_PL``
albo etykiety scenariusza, gdy pole tam jest (jedno źródło nazw), (2) nie zawiera klucza pola,
(3) nie zawiera żadnego kodu wg reguły ``kody_w_tekscie`` (snake_case, KOD_Z_PODKRESLNIKIEM,
odwrócone apostrofy, znane kody wartości). ``test_iloczyn_pokrywa_kazde_zrodlo_dwoma_polami``
pilnuje, żeby iloczyn nie skurczył się do pojedynczych przykładów.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from tests.enm.test_komunikaty_operacji_bez_kodow import kody_w_tekscie

# ---------------------------------------------------------------------------
# Narzędzia
# ---------------------------------------------------------------------------


def _tresc_odmowy(wywolanie: Callable[[], object]) -> str:
    """Treść odmowy, którą kończy się wywołanie (wywołanie MUSI odmówić). Odmowa danych
    jest ``ValueError`` (``OdmowaDanychError`` i jej odmiany katalogu, dynamiki, migracji;
    ``ValueError`` walidatora, który pydantic przenosi do 422). Inny wyjątek (``TypeError``
    złej sygnatury, ``KeyError``) to błąd przypadku testowego — leci dalej, nie udaje
    komunikatu."""
    try:
        wywolanie()
    except ValueError as blad:
        return str(blad)
    raise AssertionError("wywołanie nie odmówiło — przypadek nie ćwiczy komunikatu")


def _detal(odpowiedz: Any, status: int) -> str:
    """Treść dla projektanta z odpowiedzi błędu: ``detail`` napisem albo ``msg`` pozycji."""
    assert odpowiedz.status_code == status, (odpowiedz.status_code, odpowiedz.text)
    detail = odpowiedz.json()["detail"]
    if isinstance(detail, list):
        return "; ".join(str(pozycja["msg"]) for pozycja in detail)
    return str(detail)


def _nazwa(klucz: str) -> str:
    from enm.slownik_komunikatow import nazwa_pola

    return nazwa_pola(klucz)


def _etykieta_scenariusza(klucz: str) -> str:
    from enm.scenariusze import ETYKIETY_POL

    return ETYKIETY_POL[klucz]


def _nowy_przypadek(klient: TestClient) -> str:
    projekt = klient.post("/api/projects", json={"name": "Komunikaty bez kluczy"})
    assert projekt.status_code == 201, projekt.text
    przypadek = klient.post(
        "/api/study-cases", json={"project_id": projekt.json()["id"], "name": "Przypadek"}
    )
    assert przypadek.status_code == 201, przypadek.text
    return str(przypadek.json()["id"])


@dataclass(frozen=True)
class Przypadek:
    """Para (źródło komunikatu, pole kontraktu) i droga, która daje zdanie projektanta."""

    zrodlo: str
    klucz: str
    #: Nazwa wielkości, której zdanie MUSI użyć (wołana leniwie: mapy z ``src``).
    nazwa: Callable[[], str]
    komunikat: Callable[[TestClient], str]

    @property
    def ident(self) -> str:
        return f"{self.zrodlo}-{self.klucz}"


def _stala(tekst: str) -> Callable[[], str]:
    return lambda: tekst


# ---------------------------------------------------------------------------
# Źródło: odmowa danych końcówki API (OdmowaDanychError → 422)
# ---------------------------------------------------------------------------

_PODGLAD = "/api/solver/grid-source-preview"


def _podglad(klient: TestClient, **dane: object) -> str:
    return _detal(klient.post(_PODGLAD, json={"voltage_kv": 15.0, **dane}), 422)


def _spadek(klient: TestClient, **flagi: str) -> str:
    tresc = {
        "current_a": 100.0,
        "length_km": 1.0,
        "r_ohm_per_km": 0.2,
        "x_ohm_per_km": 0.1,
        "cos_phi": 0.9,
        "line_voltage_v": 400.0,
        **flagi,
    }
    return _detal(klient.post("/api/solver/cable-voltage-drop-preview", json=tresc), 422)


def _obciazalnosc(klient: TestClient, warunki: dict[str, object]) -> str:
    tresc = {"rated_ampacity_a": 300.0, "design_current_a": 200.0, "laying_conditions": warunki}
    return _detal(klient.post("/api/solver/cable-ampacity-derating-preview", json=tresc), 422)


_ODMOWY_API = [
    Przypadek(
        "odmowa_api",
        "sk3_mva",
        _stala("Sk″"),
        lambda k: _podglad(k, short_circuit_mode="SHORT_CIRCUIT_POWER", rx_ratio=0.1),
    ),
    Przypadek(
        "odmowa_api",
        "rx_ratio",
        _stala("stosunek R/X"),
        lambda k: _podglad(k, short_circuit_mode="SHORT_CIRCUIT_POWER", sk3_mva=250.0),
    ),
    Przypadek(
        "odmowa_api",
        "r_ohm",
        _stala("rezystancja R"),
        lambda k: _podglad(k, short_circuit_mode="IMPEDANCE", x_ohm=1.0),
    ),
    Przypadek(
        "odmowa_api",
        "x_ohm",
        _stala("reaktancja X"),
        lambda k: _podglad(k, short_circuit_mode="IMPEDANCE", r_ohm=0.1),
    ),
    Przypadek(
        "odmowa_api",
        "rx_ratio_min",
        lambda: _nazwa("rx_ratio_min"),
        lambda k: _podglad(k, sk3_mva=250.0, rx_ratio=0.1, rx_ratio_min=0.2),
    ),
    Przypadek(
        "odmowa_api",
        "r0_ohm",
        _stala("rezystancji R0"),
        lambda k: _podglad(k, sk3_mva=250.0, rx_ratio=0.1, zero_sequence_enabled=True, x0_ohm=2.0),
    ),
    Przypadek(
        "odmowa_api",
        "flow_direction",
        _stala("Kierunek przepływu mocy czynnej"),
        lambda k: _spadek(k, flow_direction="nieznany"),
    ),
    Przypadek(
        "odmowa_api",
        "reactive_character",
        _stala("Charakter mocy biernej"),
        lambda k: _spadek(k, reactive_character="nieznany"),
    ),
]

# ---------------------------------------------------------------------------
# Źródło: walidacja kształtu żądania (RequestValidationError → opis pozycji)
# ---------------------------------------------------------------------------

_WALIDACJA_KSZTALTU = [
    Przypadek(
        "walidacja_ksztaltu",
        "rx_ratio_min",
        lambda: _nazwa("rx_ratio_min"),
        lambda k: _podglad(k, sk3_mva=250.0, rx_ratio=0.1, rx_ratio_min=-1.0),
    ),
    Przypadek(
        "walidacja_ksztaltu",
        "sk3_min_mva",
        lambda: _nazwa("sk3_min_mva"),
        lambda k: _podglad(k, sk3_mva=250.0, rx_ratio=0.1, sk3_min_mva=0.0),
    ),
    Przypadek(
        "walidacja_ksztaltu",
        "ik3_min_ka",
        lambda: _nazwa("ik3_min_ka"),
        lambda k: _podglad(k, sk3_mva=250.0, rx_ratio=0.1, ik3_min_ka=-2.0),
    ),
    # Walidator modelu żądania (odmowa w ``model_validator``) — zdanie idzie wprost.
    Przypadek(
        "walidacja_ksztaltu",
        "f_grunt",
        _stala("Współczynnik gruntu"),
        lambda k: _obciazalnosc(k, {"f_grunt": 0.9}),
    ),
    Przypadek(
        "walidacja_ksztaltu",
        "f_wiazka",
        _stala("współczynnik wiązki"),
        lambda k: _obciazalnosc(k, {"f_grunt": 0.9, "f_wiazka": 0.8}),
    ),
]

# ---------------------------------------------------------------------------
# Źródło: identyfikator w ścieżce albo parametrze żądania
# ---------------------------------------------------------------------------


def _arkusz_nn(klient: TestClient, parametr: str) -> str:
    case_id = _nowy_przypadek(klient)
    odpowiedz = klient.get(
        f"/api/cases/{case_id}/enm/nn-circuit-sheet",
        params={"station_ref": "stn", parametr: "nie-uuid"},
    )
    return _detal(odpowiedz, 422)


_IDENTYFIKATORY = [
    Przypadek(
        "identyfikator_api",
        "run_id",
        lambda: _nazwa("run_id"),
        lambda k: _detal(k.get("/api/execution/runs/nie-uuid"), 400),
    ),
    Przypadek(
        "identyfikator_api",
        "scenario_id",
        lambda: _nazwa("scenario_id"),
        lambda k: _detal(k.get("/api/execution/fault-scenarios/nie-uuid"), 400),
    ),
    Przypadek(
        "identyfikator_api",
        "batch_id",
        lambda: _nazwa("batch_id"),
        lambda k: _detal(k.get("/api/execution/batches/nie-uuid"), 400),
    ),
    Przypadek(
        "identyfikator_api",
        "project_id",
        lambda: _nazwa("project_id"),
        lambda k: _detal(k.get("/api/study-cases/project/nie-uuid"), 400),
    ),
    Przypadek(
        "identyfikator_api",
        "case_id",
        lambda: _nazwa("case_id"),
        lambda k: _detal(k.get("/api/study-cases/nie-uuid"), 400),
    ),
    Przypadek(
        "identyfikator_api",
        "case_a_id",
        lambda: _nazwa("case_a_id"),
        lambda k: _detal(
            k.post(
                "/api/study-cases/compare",
                json={"case_a_id": "nie-uuid", "case_b_id": _nowy_przypadek(k)},
            ),
            400,
        ),
    ),
    Przypadek(
        "identyfikator_api",
        "load_flow_run_id",
        lambda: _nazwa("load_flow_run_id"),
        lambda k: _arkusz_nn(k, "load_flow_run_id"),
    ),
    Przypadek(
        "identyfikator_api",
        "short_circuit_run_id",
        lambda: _nazwa("short_circuit_run_id"),
        lambda k: _arkusz_nn(k, "short_circuit_run_id"),
    ),
]

# ---------------------------------------------------------------------------
# Źródło: scenariusz zwarciowy (FaultScenarioValidationError → 422)
# ---------------------------------------------------------------------------


def _scenariusz(klient: TestClient, lokalizacja: dict[str, object], **config: object) -> str:
    case_id = _nowy_przypadek(klient)
    tresc = {
        "name": "Zwarcie",
        "fault_type": "SC_3F",
        "location": lokalizacja,
        "config": {"scenariusz": "MAX", **config},
    }
    return _detal(
        klient.post(f"/api/execution/study-cases/{case_id}/fault-scenarios", json=tresc), 422
    )


_SCENARIUSZE = [
    Przypadek(
        "scenariusz_zwarciowy",
        "position",
        _stala("położenia miejsca zwarcia"),
        lambda k: _scenariusz(
            k, {"element_ref": "linia-1", "location_type": "BRANCH", "position": None}
        ),
    ),
    Przypadek(
        "scenariusz_zwarciowy",
        "thermal_time_seconds",
        _stala("Czas trwania zwarcia t_k"),
        lambda k: _scenariusz(
            k,
            {"element_ref": "bus-1", "location_type": "BUS", "position": None},
            thermal_time_seconds=0.0,
        ),
    ),
]

# ---------------------------------------------------------------------------
# Źródło: model ENM (pydantic → opis_bledu_walidacji)
# ---------------------------------------------------------------------------


def _opis_modelu(klasa: str, dane: dict[str, object]) -> str:
    import enm.models as modele
    from enm.slownik_komunikatow import opis_bledu_walidacji

    try:
        getattr(modele, klasa).model_validate(dane)
    except ValidationError as blad:
        return opis_bledu_walidacji(blad)
    raise AssertionError(f"{klasa}: walidacja nie odmówiła")


def _przekladnik(rodzaj: str, **pola: object) -> dict[str, object]:
    return {
        "ref_id": "przekladnik-1",
        "name": "Przekładnik pola 1",
        "measurement_type": rodzaj,
        "bus_ref": "szyna-1",
        "rating": {"ratio_primary": 400.0, "ratio_secondary": 5.0},
        **pola,
    }


def _harmonogram(klient: TestClient, **dynamika: object) -> str:
    """Zapis scenariusza dynamiki przez API — 422 z ``komunikat`` każdej pozycji."""
    case_id = _nowy_przypadek(klient)
    odpowiedz = klient.post(
        f"/api/dynamika/study-cases/{case_id}/scenariusze",
        json={"name": "Scenariusz", "dynamika": dynamika},
    )
    assert odpowiedz.status_code == 422, odpowiedz.text
    return "; ".join(str(pozycja["komunikat"]) for pozycja in odpowiedz.json()["detail"])


_MODEL_ENM = [
    Przypadek(
        "model_enm",
        "ct_cores",
        lambda: _nazwa("ct_cores"),
        lambda _k: _opis_modelu("Measurement", _przekladnik("VT", ct_cores=2)),
    ),
    Przypadek(
        "model_enm",
        "vt_mounting",
        lambda: _nazwa("vt_mounting"),
        lambda _k: _opis_modelu("Measurement", _przekladnik("CT", vt_mounting="SZYNY")),
    ),
    Przypadek(
        "model_enm",
        "ct_arrangement",
        lambda: _nazwa("ct_arrangement"),
        lambda _k: _opis_modelu("Measurement", _przekladnik("VT", ct_arrangement="3_FAZOWY")),
    ),
]

# ---------------------------------------------------------------------------
# Źródło: rdzeń obliczeniowy (OdmowaDanychError solvera)
# ---------------------------------------------------------------------------


def _mccb(**nastawy: float | None) -> str:
    from network_model.solvers.protection_lv_curves import compute_mccb_point

    pelne: dict[str, float | None] = {
        "i_query_a": 500.0,
        "ir_a": 100.0,
        "isd_a": None,
        "ii_a": None,
        "tr_s": 10.0,
        "tsd_s": None,
    }
    pelne.update(nastawy)
    return _tresc_odmowy(lambda: compute_mccb_point(**pelne))  # type: ignore[arg-type]


def _zip(**udzialy: float) -> str:
    from network_model.solvers.power_flow_zip import ZipCoeffs, validate_zip_coeffs

    pelne = {
        "a_p": 0.0,
        "b_p": 0.0,
        "c_p": 1.0,
        "a_q": 0.0,
        "b_q": 0.0,
        "c_q": 1.0,
        "v0_pu": 1.0,
        "k_pf": 0.0,
        "k_qf": 0.0,
        "f0_hz": 50.0,
        **udzialy,
    }
    return _tresc_odmowy(lambda: validate_zip_coeffs(ZipCoeffs(**pelne)))


def _falownik(**pola: object) -> str:
    from network_model.solvers.power_flow_inverter import (
        InverterControl,
        validate_inverter_control,
    )

    return _tresc_odmowy(lambda: validate_inverter_control(InverterControl(**pola)))  # type: ignore[arg-type]


def _podglad_solvera(**pola: object) -> str:
    from network_model.solvers.grid_source_preview import (
        GridSourcePreviewInput,
        compute_grid_source_preview,
    )

    dane = {"voltage_kv": 15.0, "short_circuit_mode": "SHORT_CIRCUIT_POWER", "scenariusz": "MAX"}
    dane.update(pola)
    return _tresc_odmowy(
        lambda: compute_grid_source_preview(GridSourcePreviewInput(**dane))  # type: ignore[arg-type]
    )


def _wspolczynniki_sn(**pola: float) -> str:
    from network_model.solvers.cable_ampacity_derating import WspolczynnikiObciazalnosci

    pelne: dict[str, object] = {
        "nazwa": "test",
        "etykieta_pl": "Warunki testowe",
        "f_grunt": 1.0,
        "f_wiazka": 1.0,
        "f_grupa": 1.0,
        "podstawa": "przypadek testowy",
        **pola,
    }
    return _tresc_odmowy(lambda: WspolczynnikiObciazalnosci(**pelne))  # type: ignore[arg-type]


def _impedancja_transformatora(**pola: float) -> str:
    from network_model.solvers.fault_loop_builder import transformer_lv_impedance_ohm

    pelne = {"sn_mva": 0.63, "uk_percent": 6.0, "ulv_kv": 0.4, "pk_kw": 6.5, **pola}
    return _tresc_odmowy(lambda: transformer_lv_impedance_ohm(**pelne))


def _krzywa_mcb(**pola: float) -> str:
    from network_model.solvers.protection_lv_curves import compute_mcb_thermal_point

    pelne = {"i_query_a": 50.0, "in_a": 16.0, **pola}
    return _tresc_odmowy(lambda: compute_mcb_thermal_point(**pelne))


def _kompensator(**pola: float) -> str:
    from network_model.solvers.shunt_compensator_preview import (
        ShuntCompensatorPreviewInput,
        compute_shunt_compensator_preview,
    )

    pelne = {"rated_mvar": 1.0, "rated_kv": 15.0, **pola}
    return _tresc_odmowy(
        lambda: compute_shunt_compensator_preview(ShuntCompensatorPreviewInput(**pelne))
    )


_RDZEN = [
    Przypadek(
        "rdzen_obliczeniowy",
        "ir_a",
        _stala("Nastawa długozwłoczna I_r"),
        lambda _k: _mccb(ir_a=0.0),
    ),
    Przypadek(
        "rdzen_obliczeniowy", "tr_s", _stala("Zwłoka długozwłoczna t_r"), lambda _k: _mccb(tr_s=0.0)
    ),
    Przypadek(
        "rdzen_obliczeniowy",
        "tsd_s",
        _stala("bez odpowiadającej zwłoki t_sd"),
        lambda _k: _mccb(isd_a=400.0),
    ),
    Przypadek(
        "rdzen_obliczeniowy",
        "in_a",
        _stala("Prąd znamionowy I_n"),
        lambda _k: _krzywa_mcb(in_a=0.0),
    ),
    Przypadek(
        "rdzen_obliczeniowy",
        "i_query_a",
        _stala("Badany prąd"),
        lambda _k: _krzywa_mcb(i_query_a=-1.0),
    ),
    Przypadek(
        "rdzen_obliczeniowy",
        "v0_pu",
        _stala("Napięcie odniesienia modelu ZIP"),
        lambda _k: _zip(v0_pu=0.0),
    ),
    Przypadek(
        "rdzen_obliczeniowy",
        "a_p",
        _stala("udział części stałej impedancji"),
        lambda _k: _zip(a_p=1.5, c_p=-0.5),
    ),
    Przypadek(
        "rdzen_obliczeniowy",
        "f0_hz",
        _stala("Częstotliwość odniesienia falownika"),
        lambda _k: _falownik(f0_hz=0.0),
    ),
    Przypadek(
        "rdzen_obliczeniowy",
        "lfsm_droop_pct",
        _stala("Statyzm LFSM falownika"),
        lambda _k: _falownik(lfsm_droop_pct=-1.0),
    ),
    Przypadek(
        "rdzen_obliczeniowy",
        "x0_ohm",
        _stala("reaktancji X0"),
        lambda _k: _podglad_solvera(
            sk3_mva=250.0, rx_ratio=0.1, zero_sequence_enabled=True, r0_ohm=0.5, x0_ohm=0.0
        ),
    ),
    Przypadek(
        "rdzen_obliczeniowy",
        "z0_z1_ratio",
        _stala("Stosunek Z0/Z1"),
        lambda _k: _podglad_solvera(
            sk3_mva=250.0, rx_ratio=0.1, zero_sequence_enabled=True, z0_z1_ratio=0.0
        ),
    ),
    Przypadek(
        "rdzen_obliczeniowy",
        "f_grunt",
        _stala("Współczynnik gruntu"),
        lambda _k: _wspolczynniki_sn(f_grunt=2.0),
    ),
    Przypadek(
        "rdzen_obliczeniowy",
        "f_grupa",
        _stala("Współczynnik grupowania"),
        lambda _k: _wspolczynniki_sn(f_grupa=2.0),
    ),
    Przypadek(
        "rdzen_obliczeniowy",
        "uk_percent",
        _stala("napięcie zwarcia u_k"),
        lambda _k: _impedancja_transformatora(uk_percent=0.0),
    ),
    Przypadek(
        "rdzen_obliczeniowy",
        "rated_mvar",
        _stala("Moc znamionowa kompensatora"),
        lambda _k: _kompensator(rated_mvar=0.0),
    ),
    Przypadek(
        "rdzen_obliczeniowy",
        "rated_kv",
        _stala("Napięcie znamionowe kompensatora"),
        lambda _k: _kompensator(rated_kv=0.0),
    ),
]

# ---------------------------------------------------------------------------
# Źródło: katalog typów (odmowa niezmiennika typu)
# ---------------------------------------------------------------------------


def _rcd(**pola: object) -> str:
    from network_model.catalog.types import LVRcdType

    pelne: dict[str, object] = {
        "id": "rcd-test",
        "name": "RCD testowy",
        "in_a": 40.0,
        "i_delta_n_a": 0.03,
        "rcd_type": "A",
        "selective": False,
        "t_a_s": 0.3,
        **pola,
    }
    return _tresc_odmowy(lambda: LVRcdType(**pelne))  # type: ignore[arg-type]


def _magazyn(**pola: object) -> str:
    from network_model.catalog.types import BESSBatteryType

    pelne: dict[str, object] = {
        "id": "bess-test",
        "name": "Magazyn testowy",
        "chemistry": "LFP",
        "capacity_kwh": 1000.0,
        "nominal_voltage_dc_v": 800.0,
        "c_rate": 0.5,
        **pola,
    }
    return _tresc_odmowy(lambda: BESSBatteryType(**pelne))  # type: ignore[arg-type]


def _przeksztaltnik(**pola: object) -> str:
    from network_model.catalog.types import ConverterKind, ConverterType

    pelne: dict[str, object] = {
        "id": "conv-test",
        "name": "Falownik testowy",
        "kind": ConverterKind.PV,
        "un_kv": 0.4,
        "sn_mva": 1.0,
        "pmax_mw": 1.0,
        **pola,
    }
    return _tresc_odmowy(lambda: ConverterType(**pelne))  # type: ignore[arg-type]


def _aparat_nn(**pola: object) -> str:
    from network_model.catalog.types import LVApparatusType

    pelne: dict[str, object] = {
        "id": "cb-test",
        "name": "Wyłącznik testowy",
        "device_kind": "WYLACZNIK_ODPLYWOWY",
        "u_n_kv": 0.4,
        "i_n_a": 250.0,
        "breaking_capacity_ka": 25.0,
        **pola,
    }
    return _tresc_odmowy(lambda: LVApparatusType(**pelne))  # type: ignore[arg-type]


_KATALOG = [
    Przypadek("katalog_typow", "in_a", _stala("prąd znamionowy I_n"), lambda _k: _rcd(in_a=0.0)),
    Przypadek(
        "katalog_typow",
        "i_delta_n_a",
        _stala("znamionowy prąd różnicowy I_Δn"),
        lambda _k: _rcd(i_delta_n_a=0.0),
    ),
    Przypadek("katalog_typow", "t_a_s", _stala("czas zadziałania t_a"), lambda _k: _rcd(t_a_s=0.0)),
    Przypadek(
        "katalog_typow",
        "capacity_kwh",
        _stala("pojemność magazynu energii"),
        lambda _k: _magazyn(capacity_kwh=0.0),
    ),
    Przypadek("katalog_typow", "c_rate", _stala("współczynnik C"), lambda _k: _magazyn(c_rate=0.0)),
    Przypadek(
        "katalog_typow",
        "nominal_voltage_dc_v",
        _stala("napięcie znamionowe DC"),
        lambda _k: _magazyn(nominal_voltage_dc_v=-1.0),
    ),
    Przypadek(
        "katalog_typow",
        "pq_curve",
        _stala("rosnąco według mocy czynnej P"),
        lambda _k: _przeksztaltnik(pq_curve=((0.5, -0.1, 0.1), (0.2, -0.1, 0.1))),
    ),
    Przypadek(
        "katalog_typow",
        "q_min_mvar",
        _stala("najmniejsza moc bierna Q"),
        lambda _k: _przeksztaltnik(pq_curve=((0.5, 0.2, 0.1),)),
    ),
    Przypadek(
        "katalog_typow",
        "ir_range",
        _stala("nastawy długozwłocznej I_r"),
        lambda _k: _aparat_nn(ir_range=(200.0, 100.0)),
    ),
]

# ---------------------------------------------------------------------------
# Źródło: odmowa dynamiki (OdmowaDynamiki → komunikat_dla_projektanta)
# ---------------------------------------------------------------------------


def _nastawy(**pola: object) -> str:
    from application.dynamika.odmowy import komunikat_dla_projektanta
    from network_model.solvers.dynamika.kontrakty import NastawySolvera

    pelne: dict[str, object] = {
        "dt_s": 0.001,
        "dt_min_s": 0.001,
        "dt_max_s": 0.001,
        "tolerancja": 1e-6,
        "tolerancja_kroku": 1e-4,
        "eps_init": 1e-8,
        "max_iteracji_newtona": 20,
        "max_nawrotow": 4,
        "horyzont_s": 1.0,
        "krok_wyjscia_s": 0.01,
        "integrator": "trapezowy",
        "tolerancja_lokalizacji_zdarzen_s": None,
        **pola,
    }
    tekst = _tresc_odmowy(lambda: NastawySolvera(**pelne))  # type: ignore[arg-type]
    return komunikat_dla_projektanta(tekst, {})


def _charakterystyka(**pola: object) -> str:
    from application.dynamika.odmowy import komunikat_dla_projektanta
    from network_model.solvers.dynamika.kontrakty import CharakterystykaOdbioru

    pelne: dict[str, object] = {
        "a_p": 0.0,
        "b_p": 0.0,
        "c_p": 1.0,
        "a_q": 0.0,
        "b_q": 0.0,
        "c_q": 1.0,
        "v0_pu": None,
        "k_pf": 0.0,
        "k_qf": 0.0,
        "f0_hz": None,
        "u_min_pu": None,
        "t_pomiaru_czestotliwosci_s": None,
        **pola,
    }
    tekst = _tresc_odmowy(lambda: CharakterystykaOdbioru(**pelne))  # type: ignore[arg-type]
    return komunikat_dla_projektanta(tekst, {})


_DYNAMIKA = [
    Przypadek(
        "odmowa_dynamiki",
        "dt_s",
        lambda: _etykieta_scenariusza("dt_s"),
        lambda _k: _nastawy(dt_s=0.01),
    ),
    Przypadek(
        "odmowa_dynamiki",
        "krok_wyjscia_s",
        lambda: _etykieta_scenariusza("krok_wyjscia_s"),
        lambda _k: _nastawy(krok_wyjscia_s=2.0),
    ),
    Przypadek(
        "odmowa_dynamiki",
        "horyzont_s",
        lambda: _etykieta_scenariusza("horyzont_s"),
        lambda _k: _nastawy(horyzont_s=-1.0),
    ),
    Przypadek(
        "odmowa_dynamiki",
        "tolerancja_lokalizacji_zdarzen_s",
        lambda: _etykieta_scenariusza("tolerancja_lokalizacji_zdarzen_s"),
        lambda _k: _nastawy(tolerancja_lokalizacji_zdarzen_s=0.0),
    ),
    Przypadek(
        "odmowa_dynamiki",
        "a_p",
        _stala("udział części stałej impedancji Z w mocy czynnej"),
        lambda _k: _charakterystyka(a_p=math.nan),
    ),
    Przypadek(
        "odmowa_dynamiki",
        "t_pomiaru_czestotliwosci_s",
        _stala("stała czasowa pomiaru częstotliwości"),
        lambda _k: _charakterystyka(t_pomiaru_czestotliwosci_s="0,1"),
    ),
    Przypadek(
        "scenariusz_dynamiczny",
        "krok_wyjscia_s",
        lambda: _etykieta_scenariusza("krok_wyjscia_s"),
        lambda k: _harmonogram(k, horyzont_s=1.0, krok_wyjscia_s=2.0),
    ),
    Przypadek(
        "scenariusz_dynamiczny",
        "horyzont_s",
        lambda: _etykieta_scenariusza("horyzont_s"),
        lambda k: _harmonogram(k, horyzont_s=0.0, krok_wyjscia_s=0.01),
    ),
]

# ---------------------------------------------------------------------------
# Źródło: walidacja modelu źródła i migracja modelu zastanego
# ---------------------------------------------------------------------------


def _migracja(rekord: dict[str, object], klucz: str) -> str:
    from application.migracja_legacy import _liczba

    return _tresc_odmowy(lambda: _liczba(rekord, klucz, element="Węzeł W1"))


def _galaz(dane: dict[str, object]) -> str:
    from network_model.core.branch import Branch

    return _tresc_odmowy(lambda: Branch.from_dict(dane))


_GOTOWOSC_I_MIGRACJA = [
    # Wariant przyłączenia źródła: jedyna reguła to walidator modelu `Generator`
    # (`enm/models.py`); dawny rekord gotowości `validate_generator_connections` — druga,
    # równoległa reguła bez konsumenta w produkcie — skasowany (ADR-025, commit 4).
    Przypadek(
        "model_zrodla",
        "station_ref",
        _stala("wymaga wskazania stacji SN/nN"),
        lambda _k: _opis_modelu(
            "Generator",
            {
                "ref_id": "pv-1",
                "name": "PV 1",
                "gen_type": "pv_inverter",
                "bus_ref": "szyna-1",
                "p_mw": 0.1,
                "connection_variant": "nn_side",
            },
        ),
    ),
    Przypadek(
        "model_zrodla",
        "blocking_transformer_ref",
        lambda: _nazwa("blocking_transformer_ref"),
        lambda _k: _opis_modelu(
            "Generator",
            {
                "ref_id": "pv-1",
                "name": "PV 1",
                "gen_type": "pv_inverter",
                "bus_ref": "szyna-1",
                "p_mw": 0.1,
                "connection_variant": "block_transformer",
            },
        ),
    ),
    Przypadek(
        "migracja_modelu",
        "base_kv",
        lambda: _nazwa("base_kv"),
        lambda _k: _migracja({}, "base_kv"),
    ),
    Przypadek(
        "migracja_modelu",
        "p_mw",
        lambda: _nazwa("p_mw"),
        lambda _k: _migracja({"p_mw": "dużo"}, "p_mw"),
    ),
    Przypadek(
        "model_galezi",
        "from_node_id",
        _stala("węzła początkowego"),
        lambda _k: _galaz({"id": "g1", "name": "G1", "branch_type": "LINE", "to_node_id": "b"}),
    ),
    Przypadek(
        "model_galezi",
        "to_node_id",
        _stala("węzła końcowego"),
        lambda _k: _galaz({"id": "g1", "name": "G1", "branch_type": "LINE", "from_node_id": "a"}),
    ),
]

PRZYPADKI: list[Przypadek] = [
    *_ODMOWY_API,
    *_WALIDACJA_KSZTALTU,
    *_IDENTYFIKATORY,
    *_SCENARIUSZE,
    *_MODEL_ENM,
    *_RDZEN,
    *_KATALOG,
    *_DYNAMIKA,
    *_GOTOWOSC_I_MIGRACJA,
]


@pytest.mark.parametrize("przypadek", PRZYPADKI, ids=[p.ident for p in PRZYPADKI])
def test_komunikat_nazywa_wielkosc_bez_klucza_pola(
    przypadek: Przypadek, app_client: TestClient
) -> None:
    tekst = przypadek.komunikat(app_client)
    nazwa = przypadek.nazwa()
    assert nazwa in tekst, (przypadek.ident, nazwa, tekst)
    assert przypadek.klucz not in tekst, (przypadek.ident, tekst)
    assert kody_w_tekscie(tekst) == [], (przypadek.ident, kody_w_tekscie(tekst), tekst)


def test_iloczyn_pokrywa_kazde_zrodlo_dwoma_polami() -> None:
    """Każde źródło komunikatu ćwiczy co najmniej dwa RÓŻNE pola, a para się nie powtarza —
    iloczyn nie kurczy się do jednego przykładu na źródło."""
    pola_zrodel: dict[str, set[str]] = {}
    for przypadek in PRZYPADKI:
        pola_zrodel.setdefault(przypadek.zrodlo, set()).add(przypadek.klucz)
    assert len({p.ident for p in PRZYPADKI}) == len(PRZYPADKI)
    jednopolowe = {zrodlo: pola for zrodlo, pola in pola_zrodel.items() if len(pola) < 2}
    assert not jednopolowe, jednopolowe
    assert len(pola_zrodel) >= 10, sorted(pola_zrodel)
