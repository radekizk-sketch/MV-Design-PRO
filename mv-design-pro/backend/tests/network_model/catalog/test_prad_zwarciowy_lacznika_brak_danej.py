"""Wielkość zwarciowa aparatu: liczba dodatnia albo ``None`` — nigdy 0 kA (bramka KAT-T-050).

DEFEKT, KTÓRY TO ZAMYKA (decyzje architekta 2026-10-22). Katalog zapisywał zerem DWA różne
braki liczby: brak danej karty (typ minimalny łącznika 110 kV, ``ik_ka = icw_ka = 0.0``)
i „nie dotyczy” (20 rekordów SN: I_k rozłącznika, odłącznika i uziemnika, I_cw
bezpiecznika), a rozłączniki i odłączniki polskich producentów niosły w polu I_k dodatnią
kopię I_cw. Każdy konsument poza projekcją APARAT_SN czytał zero jako liczbę — ekran
pokazywał „0 kA” dla rozłącznika (ciche zero zakazane przez kontrakt werdyktu wyjaśnialnego).

KONWENCJA PO NAPRAWIE: wielkość niewłaściwa rodzajowi jest ``None`` („nie dotyczy”
rozstrzyga rodzaj z jednego źródła — ``network_model/catalog/rodzaje_aparatury.py``),
wielkość właściwa bez danej karty jest ``None`` („brak danych”), zero jest odrzucane w
każdej wielkości.

ILOCZYN CECH (każda kombinacja jest osobnym przypadkiem):
  pozycja ∈ {wyłącznik z danymi karty, odłącznik z danymi karty, rozłącznik z danymi karty,
  uziemnik, bezpiecznik, wyłącznik 110 kV bez danej, odłącznik 110 kV bez danej}
  × konsument ∈ {projekcja APARAT_SN, ocena wytrzymałości pola (tor produkcyjny
  ``widok_wytrzymalosci_z_biegu``), odczyt zdolności wyłączania dowodu doboru
  (``resolve_um_icu_from_catalog``), kandydaci doboru aparatu pola SN, serializacja API
  (``GET /api/catalog/switch-equipment-types`` i ``/mv-apparatus-types``)}.

Osobno: bramka rekordu KAT-T-050 jako iloczyn rodzaj aparatu (6) × pole (I_k, I_cw, I_cu)
× wartość {None, 0, ujemna, NaN, ∞, dodatnia} oraz rodzaj aparatu SN (6) × pole projekcji
(4) × wartość, z oczekiwaniem wpisanym tutaj NIEZALEŻNIE od zbiorów modułu (norma, nie
kod, mówi, który rodzaj ma którą wielkość).
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
from network_model.catalog.types import MVApparatusType, SwitchEquipmentType
from network_model.catalog.wartosci_robocze import (
    PARAMETR_I_TH,
    rozstrzygnij_parametry_aparatu_sn,
)

#: Pozycja → (rodzaj, I_k karty [kA] albo None, I_cw karty [kA] albo None). Wartości
#: pozycji z danymi przepisane z kart w katalogu (ABB VD4 / OJS / NAL 12 kV, ETI VV,
#: uziemnik generyczny, ZPUE NAL — rozłącznik, któremu migracja zdjęła kopię I_cw z pola I_k).
POZYCJE: dict[str, tuple[str, float | None, float | None]] = {
    "sw-cb-abb-vd4-12kv-630a": ("CIRCUIT_BREAKER", 20.0, 20.0),
    "sw-ds-abb-ojs-12kv-630a": ("DISCONNECTOR", None, 20.0),
    "sw-ls-abb-nal-12kv-630a": ("LOAD_SWITCH", None, 20.0),
    "sw-ls-zpue-nal-12kv-630a": ("LOAD_SWITCH", None, 16.0),
    "sw-es-generic-12kv": ("EARTH_SWITCH", None, 20.0),
    "sw-fuse-eti-vv-12kv-63a": ("FUSE", 63.0, None),
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
#: Pole rekordu łącznika → zbiór rodzajów, którym wielkość jest właściwa.
WLASCIWE = {"ik_ka": Z_IK, "i_cu_ka": Z_IK, "icw_ka": Z_ICW}
#: Rodzaj aparatu SN projekcji (device_kind) → rodzaj rekordu łącznika.
APARAT_SN = {
    "WYLACZNIK": "CIRCUIT_BREAKER",
    "REKLOZER": "RECLOSER",
    "ROZLACZNIK_BEZPIECZNIKOWY": "FUSE",
    "ROZLACZNIK": "LOAD_SWITCH",
    "ODLACZNIK": "DISCONNECTOR",
    "UZIEMNIK": "EARTH_SWITCH",
}


# ---------------------------------------------------------------------------
# Bramka rekordu KAT-T-050
# ---------------------------------------------------------------------------


def _oczekiwana_odmowa(dotyczy: bool, wartosc: float | None) -> bool:
    if wartosc is None:
        return False
    if not dotyczy:
        return True  # „nie dotyczy” zapisuje się wyłącznie jako None
    return not math.isfinite(wartosc) or wartosc <= 0


@pytest.mark.parametrize("wartosc", [None, 0.0, -1.0, math.nan, math.inf, 12.5])
@pytest.mark.parametrize("pole", ["ik_ka", "icw_ka", "i_cu_ka"])
@pytest.mark.parametrize("rodzaj", RODZAJE)
def test_bramka_pradu_zwarciowego_lacznika(rodzaj: str, pole: str, wartosc: float | None) -> None:
    pola: dict[str, Any] = {"ik_ka": None, "icw_ka": None, "i_cu_ka": None, pole: wartosc}

    def _zbuduj() -> SwitchEquipmentType:
        return SwitchEquipmentType(id="t", name="t", equipment_kind=rodzaj, un_kv=12.0, **pola)

    if _oczekiwana_odmowa(rodzaj in WLASCIWE[pole], wartosc):
        with pytest.raises(OdmowaKatalogu) as odmowa:
            _zbuduj()
        assert odmowa.value.kod == "KAT-T-050"
    else:
        assert getattr(_zbuduj(), pole) == wartosc


@pytest.mark.parametrize("wartosc", [None, 0.0, -1.0, math.nan, 12.5])
@pytest.mark.parametrize(
    "pole", ["breaking_capacity_ka", "making_capacity_ka", "i_th_ka", "i_dyn_ka"]
)
@pytest.mark.parametrize("rodzaj", sorted(APARAT_SN) + ["APARAT_SN"])
def test_bramka_wielkosci_zwarciowej_aparatu_sn(
    rodzaj: str, pole: str, wartosc: float | None
) -> None:
    """Ta sama bramka na pozycji APARAT_SN (siostrzany typ tej samej klasy cichego zera)."""
    lacznik = APARAT_SN.get(rodzaj)
    pole_lacznika = {"breaking_capacity_ka": "ik_ka", "i_th_ka": "icw_ka"}.get(pole)
    dotyczy = lacznik is None or pole_lacznika is None or lacznik in WLASCIWE[pole_lacznika]
    pola: dict[str, Any] = {pole: wartosc}
    if pole == "i_th_ka" and wartosc is not None:
        pola["i_th_duration_s"] = 1.0

    def _zbuduj() -> MVApparatusType:
        return MVApparatusType(id="t", name="t", device_kind=rodzaj, u_n_kv=12.0, **pola)

    if _oczekiwana_odmowa(dotyczy, wartosc):
        with pytest.raises(OdmowaKatalogu) as odmowa:
            _zbuduj()
        assert odmowa.value.kod == "KAT-T-050"
    else:
        assert getattr(_zbuduj(), pole) == wartosc


def test_rekord_z_api_z_zerem_zamiast_braku_danej_jest_odrzucony() -> None:
    """Import rekordu (``from_dict``) — ta sama bramka, nie tylko konstruktor."""
    rekord = SwitchEquipmentType(
        id="t", name="t", equipment_kind="DISCONNECTOR", un_kv=123.0, ik_ka=None, icw_ka=None
    ).to_dict()
    assert SwitchEquipmentType.from_dict(rekord).icw_ka is None
    with pytest.raises(OdmowaKatalogu, match="KAT-T-050"):
        SwitchEquipmentType.from_dict({**rekord, "icw_ka": 0.0})


def test_zaden_rekord_katalogu_nie_niesie_zera_ani_liczby_w_wielkosci_niewlasciwej() -> None:
    """Pin danych: w ŻADNYM rekordzie łącznika i ŻADNEJ pozycji APARAT_SN nie ma zera, a
    wielkość niewłaściwa rodzajowi jest ``None`` (zero nie jest zapisem „nie dotyczy”)."""
    zera: list[tuple[str, str]] = []
    niewlasciwe: list[tuple[str, str]] = []
    rekordy = get_all_switch_equipment_types()
    for rekord in rekordy:
        params = rekord["params"]
        for pole, zbior in WLASCIWE.items():
            wartosc = params.get(pole)
            if wartosc == 0:
                zera.append((rekord["id"], pole))
            if wartosc is not None and params["equipment_kind"] not in zbior:
                niewlasciwe.append((rekord["id"], pole))
    for aparat in get_default_mv_catalog().list_mv_apparatus_types():
        for pole in ("breaking_capacity_ka", "making_capacity_ka", "i_th_ka", "i_dyn_ka"):
            if getattr(aparat, pole) == 0:
                zera.append((aparat.id, pole))
    assert len(rekordy) == 50
    assert zera == []
    assert niewlasciwe == []


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
    if rodzaj == "FUSE":
        # „Nie dotyczy” z rodzaju (IEC 62271-105 § 4.5–4.6), NIE „brak danych”: status,
        # wyjaśnienie bez braków znamion i bez kodu gotowości „pozycja bez znamion”.
        for ocena in (dynamiczna, cieplna):
            assert ocena["status_maszynowy"] == "NIE_DOTYCZY", ocena
            assert "IEC 62271-105" in ocena["stosowalnosc"]["powod_pl"]
            assert not any("nie niesie" in b for b in ocena["wyjasnienie"]["czego_brakuje"]), ocena[
                "wyjasnienie"
            ]
        assert "aparatura.pozycja_bez_znamion_wytrzymalosci" not in pole["kody_gotowosci"]
        assert pole["komunikat_pl"].startswith("NIE DOTYCZY")
    elif icw is None:
        # Kryterium dynamiczne zależy wyłącznie od I_cw (I_dyn = 2,5·I_cw — propozycja
        # normowa): brak danej to BRAK_PODSTAWY z nazwanym brakiem, nie „nie dotyczy”.
        assert dynamiczna["status_maszynowy"] == "BRAK_PODSTAWY"
        assert dynamiczna["limit"] is None
        assert any(
            "nie niesie prądu szczytowego I_p" in b
            for b in dynamiczna["wyjasnienie"]["czego_brakuje"]
        )
        assert "aparatura.pozycja_bez_znamion_wytrzymalosci" in pole["kody_gotowosci"]
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
    if rodzaj in ("DISCONNECTOR", "LOAD_SWITCH", "EARTH_SWITCH"):
        # Zdolność wyłączania „nie dotyczy” z rodzaju — bez braku „nie niesie I_cu”.
        assert wylaczanie["status_maszynowy"] == "NIE_DOTYCZY"
        assert not any("I_cu" in b for b in wylaczanie["wyjasnienie"]["czego_brakuje"]), wylaczanie[
            "wyjasnienie"
        ]
        assert "aparatura.brak_zdolnosci_wylaczania" not in pole["kody_gotowosci"]
    elif ik is None:
        # Brak danej ≠ nie dotyczy: wyłącznik ma tę zdolność, karta jej nie podaje.
        assert wylaczanie["status_maszynowy"] == "NIE_OCENIONO"
        assert wylaczanie["limit"] is None
        assert any(
            "nie niesie znamionowej zdolności wyłączania zwarciowej I_cu" in b
            for b in wylaczanie["wyjasnienie"]["czego_brakuje"]
        )
        assert "aparatura.brak_zdolnosci_wylaczania" in pole["kody_gotowosci"]
    else:
        assert wylaczanie["limit"]["wartosc"] == {"wartosc": ik, "jednostka": "kA"}


@pytest.mark.parametrize("ref", sorted(POZYCJE))
def test_odczyt_zdolnosci_wylaczania_dowodu_doboru(ref: str) -> None:
    rodzaj, ik, _ = POZYCJE[ref]
    odczyt = resolve_um_icu_from_catalog(ref)
    assert odczyt.found_in_catalog
    if rodzaj not in Z_IK:
        assert odczyt.i_cu_not_applicable and odczyt.i_cu_ka is None
    elif ik is None:
        # Brak danej ≠ nie dotyczy: wyłącznik ma tę zdolność, karta jej nie podaje.
        assert not odczyt.i_cu_not_applicable and odczyt.i_cu_ka is None
    else:
        assert odczyt.i_cu_ka == ik


@pytest.mark.parametrize("ref", sorted(POZYCJE))
def test_wartosc_robocza_pradu_krotkotrwalego(ref: str) -> None:
    """Rejestr wartości roboczych: brak I_th bezpiecznika to „nie dotyczy” (rodzaj), brak
    I_th wyłącznika/odłącznika 110 kV to „brak danych” z karty — dwa różne powody."""
    rodzaj, _, icw = POZYCJE[ref]
    aparat = get_default_mv_catalog().get_mv_apparatus_type(ref)
    assert aparat is not None
    i_th = rozstrzygnij_parametry_aparatu_sn(aparat)[PARAMETR_I_TH]
    if icw is not None:
        assert (i_th.wartosc, i_th.pochodzenie) == (icw, "KATALOG")
    elif rodzaj == "FUSE":
        assert i_th.wartosc is None
        assert i_th.powod_braku_pl is not None
        assert i_th.powod_braku_pl.startswith("prąd krótkotrwały wytrzymywany nie dotyczy")
    else:
        assert i_th.powod_braku_pl is not None
        assert "nie dotyczy" not in i_th.powod_braku_pl
        assert i_th.powod_braku_pl.startswith("karta nie podaje")


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
    assert aparat["i_th_ka"] == icw
