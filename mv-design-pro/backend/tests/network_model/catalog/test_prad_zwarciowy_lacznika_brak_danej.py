"""Prąd zwarciowy łącznika: brak danej z karty to ``None``, nigdy 0 kA (bramka KAT-T-048).

DEFEKT, KTÓRY TO ZAMYKA (decyzja architekta 2026-10-22). Typ minimalny łącznika 110 kV
zapisywał brak danych wytrzymałościowych jako ``ik_ka = icw_ka = 0.0``. Projekcja APARAT_SN
zamieniała je na ``None``, ale każdy inny konsument rekordu (lista katalogu w API, dobór
aparatu pola, interfejs, porównania) czytał 0 kA jako liczbę — ciche zero zakazane przez
kontrakt werdyktu wyjaśnialnego (brak danych ≠ wartość).

ILOCZYN CECH (każda kombinacja jest osobnym przypadkiem):
  pozycja ∈ {wyłącznik z danymi karty, odłącznik z danymi karty, wyłącznik 110 kV bez danej,
  odłącznik 110 kV bez danej}
  × konsument ∈ {projekcja APARAT_SN, ocena wytrzymałości pola (tor produkcyjny
  ``widok_wytrzymalosci_z_biegu``), odczyt zdolności wyłączania dowodu doboru
  (``resolve_um_icu_from_catalog``), kandydaci doboru aparatu pola SN, serializacja API
  (``GET /api/catalog/switch-equipment-types`` i ``/mv-apparatus-types``)}.

Osobno: bramka rekordu KAT-T-048 jako iloczyn rodzaj aparatu (6) × pole (I_k, I_cw)
× wartość {None, 0, ujemna, NaN, dodatnia} z oczekiwaniem wpisanym tutaj NIEZALEŻNIE
od zbiorów modułu (norma, nie kod, mówi, który rodzaj ma którą wielkość).
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import pytest
from application.analyses.dobor_toru_der_sn import kandydaci_aparatow_pola_sn
from application.analyses.wytrzymalosc_aparatury_pol import widok_wytrzymalosci_z_biegu
from application.equipment_proof.catalog_bridge import resolve_um_icu_from_catalog
from enm.models import (
    Bay,
    Bus,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    Measurement,
    ProtectionAssignment,
    ProtectionSetting,
    Substation,
    SwitchBranch,
)
from fastapi.testclient import TestClient
from network_model.catalog import get_default_mv_catalog
from network_model.catalog.mv_switch_catalog import get_all_switch_equipment_types
from network_model.catalog.niezmienniki_katalogu import OdmowaKatalogu
from network_model.catalog.types import SwitchEquipmentType

#: Pozycja → (rodzaj, I_k karty [kA] albo None, I_cw karty [kA] albo None). Wartości
#: pozycji z danymi przepisane z karty producenta w katalogu (ABB VD4 / OJS 12 kV).
POZYCJE: dict[str, tuple[str, float | None, float | None]] = {
    "sw-cb-abb-vd4-12kv-630a": ("CIRCUIT_BREAKER", 20.0, 20.0),
    "sw-ds-abb-ojs-12kv-630a": ("DISCONNECTOR", 0.0, 20.0),
    "sw-cb-110kv": ("CIRCUIT_BREAKER", None, None),
    "sw-ds-110kv": ("DISCONNECTOR", None, None),
}
BEZ_DANYCH = ("sw-cb-110kv", "sw-ds-110kv")

#: Rodzaje ze znamionową zdolnością wyłączania zwarć (IEC 62271-100 wyłącznik, IEC 62271-111
#: reklozer, IEC 60282-1 bezpiecznik) i rodzaje z prądem krótkotrwałym (wszystkie poza
#: bezpiecznikiem) — wpisane tu niezależnie od modułu.
Z_IK = {"CIRCUIT_BREAKER", "RECLOSER", "FUSE"}
Z_ICW = {"CIRCUIT_BREAKER", "RECLOSER", "LOAD_SWITCH", "DISCONNECTOR", "EARTH_SWITCH"}
RODZAJE = sorted(Z_IK | Z_ICW)


# ---------------------------------------------------------------------------
# Bramka rekordu KAT-T-048
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("wartosc", [None, 0.0, -1.0, math.nan, math.inf, 12.5])
@pytest.mark.parametrize("pole", ["ik_ka", "icw_ka"])
@pytest.mark.parametrize("rodzaj", RODZAJE)
def test_bramka_pradu_zwarciowego_lacznika(rodzaj: str, pole: str, wartosc: float | None) -> None:
    dotyczy = rodzaj in (Z_IK if pole == "ik_ka" else Z_ICW)
    odrzucony = wartosc is not None and (
        not math.isfinite(wartosc) or wartosc < 0 or (dotyczy and wartosc == 0)
    )
    pola: dict[str, Any] = {"ik_ka": None, "icw_ka": None, pole: wartosc}

    def _zbuduj() -> SwitchEquipmentType:
        return SwitchEquipmentType(id="t", name="t", equipment_kind=rodzaj, un_kv=12.0, **pola)

    if odrzucony:
        with pytest.raises(OdmowaKatalogu) as odmowa:
            _zbuduj()
        assert odmowa.value.kod == "KAT-T-048"
    else:
        assert getattr(_zbuduj(), pole) == wartosc or (wartosc is None)


def test_rekord_z_api_z_zerem_zamiast_braku_danej_jest_odrzucony() -> None:
    """Import rekordu (``from_dict``) — ta sama bramka, nie tylko konstruktor."""
    rekord = SwitchEquipmentType(
        id="t", name="t", equipment_kind="DISCONNECTOR", un_kv=123.0, ik_ka=None, icw_ka=None
    ).to_dict()
    assert SwitchEquipmentType.from_dict(rekord).icw_ka is None
    with pytest.raises(OdmowaKatalogu, match="KAT-T-048"):
        SwitchEquipmentType.from_dict({**rekord, "icw_ka": 0.0})


def test_zaden_rekord_katalogu_nie_niesie_zera_w_wielkosci_wlasciwej_rodzajowi() -> None:
    naruszenia = [
        (r["id"], pole)
        for r in get_all_switch_equipment_types()
        for pole, zbior in (("ik_ka", Z_IK), ("icw_ka", Z_ICW))
        if r["params"]["equipment_kind"] in zbior and r["params"][pole] == 0
    ]
    assert naruszenia == []


# ---------------------------------------------------------------------------
# Konsumenci — iloczyn pozycja × konsument
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("ref", sorted(POZYCJE))
def test_projekcja_aparat_sn(ref: str) -> None:
    rodzaj, ik, icw = POZYCJE[ref]
    rekord = get_default_mv_catalog().get_switch_equipment_type(ref)
    aparat = get_default_mv_catalog().get_mv_apparatus_type(ref)
    assert rekord is not None and aparat is not None
    assert (rekord.ik_ka, rekord.icw_ka) == (ik, icw)
    assert aparat.breaking_capacity_ka == ik
    # I_th = I_cw z czasem odniesienia 1 s albo brak danej — nigdy 0 kA.
    assert aparat.i_th_ka == icw
    assert aparat.i_th_duration_s == (1.0 if icw else None)


def _model(ref: str) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="t", defaults=ENMDefaults(sn_nominal_kv=15.0)),
        buses=[Bus(ref_id="sn1", name="Sekcja 1", voltage_kv=15.0)],
        branches=[
            SwitchBranch(
                ref_id="aparat/1",
                name="Aparat pola 1",
                type="breaker",
                from_bus_ref="sn1",
                to_bus_ref="zacisk/1",
                catalog_ref=ref,
                catalog_namespace="APARAT_SN",
                meta={"station_ref": "stn", "bay_ref": "pole/1"},
            )
        ],
        measurements=[
            Measurement(
                ref_id="ct/1",
                name="Przekładnik pola 1",
                measurement_type="CT",
                bus_ref="sn1",
                rating={"ratio_primary": 600.0, "ratio_secondary": 5.0, "accuracy_class": "5P20"},
            )
        ],
        protection_assignments=[
            ProtectionAssignment(
                ref_id="prot/1",
                name="Zabezpieczenie pola 1",
                breaker_ref="aparat/1",
                ct_ref="ct/1",
                catalog_ref="REF-OC-200",
                device_type="overcurrent",
                settings=[
                    ProtectionSetting(
                        function_type="overcurrent_51",
                        threshold_a=500.0,
                        threshold_unit="A_PIERWOTNY",
                        curve_type="DT",
                        time_delay_s=0.4,
                    )
                ],
            )
        ],
        substations=[
            Substation(ref_id="stn", name="Stacja", station_type="mv_lv", bus_refs=["sn1"])
        ],
        bays=[
            Bay(ref_id="pole/1", name="P-01", bay_role="OUT", substation_ref="stn", bus_ref="sn1")
        ],
    )


_WIERSZE_BIEGU = [
    {
        "target_id": "sn1",
        "element_id": "sn1",
        "target_name": "Szyna sn1",
        "fault_type": "3F",
        "ikss_ka": 5.0,
        "ip_ka": 12.5,
        "ith_ka": 5.1,
    }
]


@pytest.mark.parametrize("ref", sorted(POZYCJE))
def test_ocena_wytrzymalosci_pola(ref: str) -> None:
    rodzaj, ik, icw = POZYCJE[ref]
    widok = widok_wytrzymalosci_z_biegu(
        enm=_model(ref), station_ref="stn", wiersze_biegu=_WIERSZE_BIEGU, run_id="bieg"
    )
    (pole,) = widok["pola"]
    oceny = {o["kryterium_id"].rsplit(".", 1)[1]: o for o in pole["oceny"]}
    # Żaden limit nie jest zerem — zero porównane z prądem zwarcia dałoby fałszywe NIE_SPELNIA.
    assert all(
        o["limit"] is None or o["limit"]["wartosc"]["wartosc"] > 0 for o in oceny.values()
    ), oceny
    dynamiczna, cieplna, wylaczanie = oceny["dynamiczna"], oceny["cieplna"], oceny["wylaczanie"]
    # Kryterium dynamiczne zależy wyłącznie od I_cw (I_dyn = 2,5·I_cw — propozycja normowa),
    # więc rozróżnia „dana jest” od „brak danej” dla każdego rodzaju aparatu.
    if icw is None:
        assert dynamiczna["status_maszynowy"] == "BRAK_PODSTAWY"
        assert dynamiczna["limit"] is None
        assert any(
            "nie niesie prądu szczytowego I_p" in b
            for b in dynamiczna["wyjasnienie"]["czego_brakuje"]
        )
    else:
        assert dynamiczna["status_maszynowy"] == "SPELNIA"
        assert dynamiczna["limit"]["wartosc"] == {"wartosc": 2.5 * icw, "jednostka": "kA"}
    # Kryterium cieplne wymaga czasu wyłączenia zwarcia: odłącznik pod zabezpieczeniem nie
    # wyłącza zwarcia, więc ocenę cieplną rozstrzygamy na wyłącznikach.
    if rodzaj == "CIRCUIT_BREAKER" and icw is None:
        assert cieplna["status_maszynowy"] == "BRAK_PODSTAWY"
        assert cieplna["limit"] is None
        assert any(
            "nie niesie prądu krótkotrwałego I_th" in b
            for b in cieplna["wyjasnienie"]["czego_brakuje"]
        )
    elif rodzaj == "CIRCUIT_BREAKER":
        assert cieplna["status_maszynowy"] == "SPELNIA"
        assert cieplna["limit"]["wartosc"] == {"wartosc": icw, "jednostka": "kA"}
    if rodzaj == "DISCONNECTOR":
        assert wylaczanie["status_maszynowy"] == "NIE_DOTYCZY"
    elif ik is None:
        assert wylaczanie["status_maszynowy"] == "NIE_OCENIONO"
        assert wylaczanie["limit"] is None
        assert any(
            "nie niesie znamionowej zdolności wyłączania zwarciowej I_cu" in b
            for b in wylaczanie["wyjasnienie"]["czego_brakuje"]
        )
    else:
        assert wylaczanie["limit"]["wartosc"] == {"wartosc": ik, "jednostka": "kA"}


@pytest.mark.parametrize("ref", sorted(POZYCJE))
def test_odczyt_zdolnosci_wylaczania_dowodu_doboru(ref: str) -> None:
    rodzaj, ik, _ = POZYCJE[ref]
    odczyt = resolve_um_icu_from_catalog(ref)
    assert odczyt.found_in_catalog
    if rodzaj == "DISCONNECTOR":
        assert odczyt.i_cu_not_applicable and odczyt.i_cu_ka is None
    elif ik is None:
        # Brak danej ≠ nie dotyczy: wyłącznik ma tę zdolność, karta jej nie podaje.
        assert not odczyt.i_cu_not_applicable and odczyt.i_cu_ka is None
    else:
        assert odczyt.i_cu_ka == ik


@pytest.mark.parametrize("ref", sorted(POZYCJE))
def test_kandydaci_doboru_aparatu_pola_sn(ref: str) -> None:
    _, ik, _ = POZYCJE[ref]
    kandydaci = {k.catalog_ref: k for k in kandydaci_aparatow_pola_sn()}
    if ref in BEZ_DANYCH:
        # Łącznik WN nie jest kandydatem aparatu pola SN (pomyłka klasy napięcia).
        assert ref not in kandydaci
    else:
        assert kandydaci[ref].ik_ka == ik
    assert not [
        r
        for r, k in kandydaci.items()
        if k.equipment_kind in Z_IK and k.ik_ka is not None and k.ik_ka <= 0
    ]


@pytest.fixture(scope="module")
def klient(tmp_path_factory: pytest.TempPathFactory) -> Any:
    sciezka: Path = tmp_path_factory.mktemp("katalog-api") / "katalog.db"
    mp = pytest.MonkeyPatch()
    mp.setenv("DATABASE_URL", f"sqlite+pysqlite:///{sciezka}")
    from api.main import app

    with TestClient(app) as klient_api:
        yield klient_api
    mp.undo()


@pytest.mark.parametrize("ref", sorted(POZYCJE))
def test_serializacja_api(klient: Any, ref: str) -> None:
    _, ik, icw = POZYCJE[ref]
    odpowiedz = klient.get("/api/catalog/switch-equipment-types")
    assert odpowiedz.status_code == 200
    rekord = next(r for r in odpowiedz.json() if r["id"] == ref)
    assert (rekord["ik_ka"], rekord["icw_ka"]) == (ik, icw)
    if ref in BEZ_DANYCH:
        surowy = json.loads(odpowiedz.text)
        assert next(r for r in surowy if r["id"] == ref)["ik_ka"] is None
    # Rekord z API wraca do typu bez straty (brak danej zostaje brakiem danej).
    assert SwitchEquipmentType.from_dict(
        rekord
    ) == get_default_mv_catalog().get_switch_equipment_type(ref)
    aparat = next(r for r in klient.get("/api/catalog/mv-apparatus-types").json() if r["id"] == ref)
    assert aparat["breaking_capacity_ka"] == ik
    assert aparat["i_th_ka"] == (icw or None)
