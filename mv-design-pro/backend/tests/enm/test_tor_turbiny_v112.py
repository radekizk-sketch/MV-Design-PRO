"""Tor turbiny Vestas V112: generator → przekształtnik pełnej mocy → 0,65 kV → TR → SN.

Karta KATALOG-TURBINY-TOR-V112 (dyrektywa właściciela 2026-10-15). Dawne pole
``nominal_voltage_kv = 0,69`` równoległego katalogu turbin udawało napięcie generatora,
a dla V112 było fałszywe: generator ma 710 V (PMSG) albo 750 V (SCIG), a przekształtnik
po stronie sieci 650 V. Jedyny żywy typ turbiny to ``ConverterType`` rodzaju WIND
(``un_kv`` = napięcie przekształtnika po stronie sieci = uzwojenie nN TR blokowego);
tor maszyny (rodzaj generatora, topologia, napięcie i maksymalna częstotliwość stojana,
strona maszynowa przekształtnika, moc generatora) jest jawnym, opcjonalnym polem tego
samego typu — nie drugim modelem.

Testy pokrywają ILOCZYN CECH: wariant generatora (V112-3.0 PMSG, V112-3.3 PMSG,
V112-3.3 SCIG, V112-3.45 SCIG) × konsument karty (rekord i proweniencja, tor DER-SN
z TR blokowym, zmiana typu na istniejącym elemencie, zapis/odczyt modelu i archiwum
projektu, graf solverów i źródło zwarciowe, sekcje modelu, API katalogu).

Osiem przypadków odbioru karty:
(1) V112-3.0 710/650; (2) V112-3.3 PMSG 710; (3) V112-3.3 SCIG 750;
(4) V112-3.45 750/650; (5) TR 0,65/SN nie dostaje 0,75 kV; (6) zmiana wariantu
generatora nie zmienia napięcia SN; (7) zapis/odczyt projektu zachowuje konfigurację;
(8) schemat i wyniki pokazują parametry używane przez solwery.
"""

from __future__ import annotations

import copy
import io
import json
import math
import zipfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from application.project_archive.service import ProjectArchiveService
from domain.project_archive import ArchiveImportStatus
from enm.domain_operations import execute_domain_operation
from enm.klucz_twin import klucz_twin_projektu
from enm.mapping import map_enm_to_network_graph
from enm.models import EnergyNetworkModel
from enm.store import get_enm, reset_enm_store, set_enm
from fastapi.testclient import TestClient
from infrastructure.persistence.models import ProjectORM, StudyCaseORM
from network_model.catalog.mv_converter_catalog import CONVERTER_WIND_NN_VESTAS_V112
from network_model.catalog.mv_transformer_catalog import TRANSFORMER_SN_NN_INVERTER_BLOCK
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.sekcje_modelu import sekcje_typu
from network_model.catalog.types import (
    POLA_TORU_MASZYNY,
    TOPOLOGIA_PRZEKSZTALTNIKA_WG_MASZYNY,
    CatalogVerificationStatus,
    ConverterKind,
)
from network_model.core.inverter import InverterSource

from tests.enm.test_der_sn_topology_domain_ops import (
    _block_transformer,
    _der_sn_payload,
    _sn_station_enm,
)

#: Wariant → (rodzaj generatora, U stojana [kV], f stojana max [Hz], U strony maszynowej
#: przekształtnika [kV], moc generatora [MW], P turbiny [MW], S_n przekształtnika [MVA],
#: dokument źródłowy w ``source_reference``). Wartości odczytane z dokumentów (pliki
#: pobrane 2026-10-15): GS 0011-9181 V03 tab. 3-1/3-2 str. 12; GS 0034-7282 V04
#: tab. 3-1/3-2 str. 11–12; V112-3.45 — deklaracja DNV GL podana przez właściciela,
#: dokument nieodczytany.
WARIANTY: dict[
    str, tuple[str, float, float | None, float | None, float | None, float, float, str]
] = {
    "vestas_v112_3_0mw_pmsg": ("PMSG", 0.71, 145.0, 0.71, 3.3, 3.075, 3.8, "0011-9181 V03"),
    "vestas_v112_3_3mw_pmsg": ("PMSG", 0.71, 200.0, 0.71, None, 3.3, 3.824, "0034-7282 V04"),
    "vestas_v112_3_3mw_scig": ("SCIG", 0.75, 100.0, None, None, 3.3, 3.824, "0034-7282 V04"),
    "vestas_v112_3_45mw": ("SCIG", 0.75, None, 0.75, None, 3.45, 4.4, "DE-DNVGL-SE-0074-02109-0"),
}

#: Napięcie przekształtnika po stronie sieci = uzwojenie nN TR blokowego (wszystkie
#: warianty: tab. 3-2 obu specyfikacji, deklaracja DNV dla 3.45).
U_SIECI_KV = 0.65
#: TR normatywny 15/0,65 kV Dyn11 3,15 MVA (największy z wierszy normatywnych 0,65 kV;
#: TR producenta 3450/3750/4000 kVA są zablokowane danymi — brak tabeli Tier 2 > 3150 kVA).
TR_065 = "tr-sn-nn-15-0p65-3p15mva-dyn11-inverter"
#: Deklarowana przeciążalność TR blokowego (decyzja O-53): S_n przekształtnika V112
#: (3,8–4,4 MVA) przekracza moc TR 3,15 MVA; projektant deklaruje k_obc (chłodzenie AF).
K_OBC = {
    "vestas_v112_3_0mw_pmsg": 1.25,
    "vestas_v112_3_3mw_pmsg": 1.25,
    "vestas_v112_3_3mw_scig": 1.25,
    "vestas_v112_3_45mw": 1.4,
}


def _rekord(typ_id: str) -> dict[str, Any]:
    return next(r for r in CONVERTER_WIND_NN_VESTAS_V112 if r["id"] == typ_id)


def _typ(typ_id: str) -> Any:
    return next(t for t in get_default_mv_catalog().list_converter_types() if t.id == typ_id)


def _payload_v112(
    typ_id: str,
    *,
    u_wyjscia_kv: float = U_SIECI_KV,
    u_nn_tr_kv: float = U_SIECI_KV,
    tr: str = TR_065,
    k_obc: float | None = None,
    z_tr_blokowym: bool = True,
) -> dict[str, Any]:
    payload = copy.deepcopy(
        _der_sn_payload(
            technology="FW",
            source_name=f"Turbina {typ_id}",
            block_tr=tr,
            power_setpoint_mw=3.0,
            has_block_transformer=z_tr_blokowym,
            include_block_spec=z_tr_blokowym,
        )
    )
    payload["catalog_binding"]["catalog_item_id"] = typ_id
    topologia = payload["der_topology"]
    topologia["inverter_output_voltage_kv"] = u_wyjscia_kv
    if z_tr_blokowym:
        topologia["block_transformer"].update(
            rated_power_mva=3.15,
            secondary_voltage_kv=u_nn_tr_kv,
            loadability_pu=K_OBC[typ_id] if k_obc is None else k_obc,
        )
    return payload


def _dodaj(typ_id: str, **kwargs: Any) -> dict[str, Any]:
    wynik = execute_domain_operation(
        _sn_station_enm(), "add_converter_source", _payload_v112(typ_id, **kwargs)
    )
    assert not wynik.get("error"), (wynik.get("error_code"), wynik.get("error"))
    return wynik["snapshot"]


def _napiecia_szyn(snapshot: dict[str, Any]) -> dict[str, float]:
    return {b["ref_id"]: b["voltage_kv"] for b in snapshot["buses"]}


# ---------------------------------------------------------------------------
# Przypadki 1–4: rekord katalogu × wariant — wartości i proweniencja z dokumentu.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("typ_id", sorted(WARIANTY))
def test_rekord_wariantu_niesie_tor_maszyny_z_dokumentu(typ_id: str) -> None:
    maszyna, u_stojana, f_stojana, u_maszynowa, p_gen, p_turbiny, s_n, dokument = WARIANTY[typ_id]
    typ = _typ(typ_id)
    assert typ.kind.value == "WIND"
    # Strona sieci przekształtnika = 650 V we wszystkich wariantach — nigdy 0,69 kV.
    assert typ.un_kv == U_SIECI_KV
    assert typ.generator_machine_type == maszyna
    assert typ.converter_topology == "FULL_CONVERTER"
    assert typ.generator_stator_voltage_kv == u_stojana
    assert typ.generator_stator_frequency_max_hz == f_stojana
    assert typ.converter_machine_side_voltage_kv == u_maszynowa
    assert typ.generator_rated_power_mw == p_gen
    assert typ.pmax_mw == p_turbiny
    assert typ.sn_mva == s_n
    # Generator NIE jest na napięciu sieci 650 V (zakaz karty).
    assert typ.generator_stator_voltage_kv != typ.un_kv
    # Moc turbiny ≠ moc generatora (zakaz utożsamienia): tam, gdzie dokument podaje
    # moc generatora, różni się od mocy turbiny.
    if p_gen is not None:
        assert p_gen != typ.pmax_mw
    # Proweniencja: rozdział/tabela/strona albo deklaracja — w treści źródła.
    zrodlo = typ.source_reference
    assert dokument in zrodlo
    if typ_id == "vestas_v112_3_45mw":
        assert zrodlo.startswith("Deklarowane: ")
        assert typ.verification_status == CatalogVerificationStatus.NIEWERYFIKOWANY.value
    else:
        assert "tab. 3-1" in zrodlo and "tab. 3-2" in zrodlo and "str. " in zrodlo
        assert typ.verification_status == CatalogVerificationStatus.CZESCIOWO_ZWERYFIKOWANY.value


@pytest.mark.parametrize("typ_id", sorted(WARIANTY))
def test_brak_danych_bez_zrodla_to_brak_wartosci_nie_wspolczynnik_typowy(typ_id: str) -> None:
    """Dawne 1,2 / 1,1 pu nie są danymi Vestas: k_sc i profil dynamiki bez źródła = brak."""
    typ = _typ(typ_id)
    assert typ.k_sc is None
    assert typ.dynamic_profile_id is None
    rekord = _rekord(typ_id)
    for klucz in ("short_circuit_current_pu", "fault_current_contribution_pu", "k_sc"):
        assert rekord["params"].get(klucz) is None


@pytest.mark.parametrize("typ_id", sorted(WARIANTY))
def test_czestotliwosc_stojana_nie_jest_czestotliwoscia_sieci(typ_id: str) -> None:
    """Stojan za przekształtnikiem pracuje z częstotliwością zmienną — nigdy 50 Hz z sieci."""
    f = _typ(typ_id).generator_stator_frequency_max_hz
    assert f is None or f != 50.0


def test_topologia_wynika_z_rodzaju_maszyny() -> None:
    for typ_id in WARIANTY:
        typ = _typ(typ_id)
        assert (
            TOPOLOGIA_PRZEKSZTALTNIKA_WG_MASZYNY[typ.generator_machine_type]
            == typ.converter_topology
        )


def test_wariant_3_3_jawny_w_karcie_dwa_rekordy() -> None:
    """V112-3.3 ma dwa warianty generatora (tab. 3-1 Alt 1/Alt 2) — dwa rekordy, nie jeden."""
    modele = [
        t
        for t in get_default_mv_catalog().list_converter_types()
        if t.id.startswith("vestas_v112_3_3")
    ]
    assert sorted(t.generator_machine_type for t in modele) == ["PMSG", "SCIG"]


# ---------------------------------------------------------------------------
# Przypadki 1–4 × tor DER-SN: tabliczka elementu, TR blokowy 0,65 kV, szyny.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("typ_id", sorted(WARIANTY))
def test_tor_der_sn_materializuje_tor_maszyny_i_tr_065(typ_id: str) -> None:
    snapshot = _dodaj(typ_id)
    generator = snapshot["generators"][0]
    tabliczka = generator["materialized_params"]
    assert generator["gen_type"] == "wind_inverter"
    assert tabliczka["un_kv"] == U_SIECI_KV
    typ = _typ(typ_id)
    for pole in POLA_TORU_MASZYNY:
        assert tabliczka.get(pole) == getattr(typ, pole), pole
    tr_blokowy = _block_transformer(snapshot)
    # (5) uzwojenie nN TR = strona sieci przekształtnika, nigdy napięcie stojana.
    assert tr_blokowy["ulv_kv"] == U_SIECI_KV
    assert tr_blokowy["ulv_kv"] != typ.generator_stator_voltage_kv
    assert tr_blokowy["uhv_kv"] == 15.0
    napiecia = _napiecia_szyn(snapshot)
    assert napiecia[generator["bus_ref"]] == U_SIECI_KV
    assert napiecia["bus_sn"] == 15.0
    # Żadna szyna modelu nie ma napięcia stojana — generator nie jest węzłem sieci.
    assert typ.generator_stator_voltage_kv not in napiecia.values()


# ---------------------------------------------------------------------------
# Przypadek 5: TR 0,65/SN nie dostaje 0,75 kV; SCIG nie wchodzi wprost na SN.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("typ_id", sorted(WARIANTY))
@pytest.mark.parametrize(
    ("u_wyjscia", "u_nn_tr"),
    [(0.75, 0.75), (0.75, U_SIECI_KV), (U_SIECI_KV, 0.75), (0.69, 0.69), (0.71, 0.71)],
)
def test_napiecie_stojana_ani_069_nie_trafia_na_tor_sieciowy(
    typ_id: str, u_wyjscia: float, u_nn_tr: float
) -> None:
    wynik = execute_domain_operation(
        _sn_station_enm(),
        "add_converter_source",
        _payload_v112(typ_id, u_wyjscia_kv=u_wyjscia, u_nn_tr_kv=u_nn_tr),
    )
    assert wynik.get("error_code") in {
        "der.inverter_voltage_mismatch",
        "converter.der_sn.napiecie_falownika_niezgodne",
    }, (wynik.get("error_code"), wynik.get("error"))


def test_katalog_nie_ma_tr_blokowego_z_uzwojeniem_nn_075() -> None:
    napiecia_nn = {r["params"]["voltage_lv_kv"] for r in TRANSFORMER_SN_NN_INVERTER_BLOCK}
    assert U_SIECI_KV in napiecia_nn
    assert 0.75 not in napiecia_nn
    assert 0.71 not in napiecia_nn


@pytest.mark.parametrize("typ_id", sorted(WARIANTY))
def test_turbina_nie_wchodzi_wprost_na_sn_bez_tr_blokowego(typ_id: str) -> None:
    wynik = execute_domain_operation(
        _sn_station_enm(), "add_converter_source", _payload_v112(typ_id, z_tr_blokowym=False)
    )
    assert wynik.get("error_code") == "converter.sn_requires_block_transformer"


def test_kontrola_mocy_tr_bez_deklarowanej_przeciazalnosci_odmawia() -> None:
    """O-53: S_n przekształtnika 3,8 MVA > TR 3,15 MVA przy k_obc = 1 — jawna odmowa."""
    wynik = execute_domain_operation(
        _sn_station_enm(),
        "add_converter_source",
        _payload_v112("vestas_v112_3_0mw_pmsg", k_obc=1.0),
    )
    assert wynik.get("error_code") == "converter.transformer_capacity_exceeded"


# ---------------------------------------------------------------------------
# Przypadek 6: zmiana wariantu generatora nie zmienia napięcia SN (ani nN toru).
# ---------------------------------------------------------------------------


def _przypisz(snapshot: dict[str, Any], ref: str, typ_id: str) -> dict[str, Any]:
    return execute_domain_operation(
        snapshot,
        "assign_catalog_to_element",
        {
            "element_ref": ref,
            "catalog_binding": {
                "catalog_namespace": "CONVERTER",
                "catalog_item_id": typ_id,
                "catalog_item_version": "2024.1",
                "materialize": True,
                "snapshot_mapping_version": "1.0",
            },
        },
    )


@pytest.mark.parametrize(
    ("z_typu", "na_typ"),
    [
        ("vestas_v112_3_3mw_pmsg", "vestas_v112_3_3mw_scig"),
        ("vestas_v112_3_3mw_scig", "vestas_v112_3_3mw_pmsg"),
        ("vestas_v112_3_3mw_pmsg", "vestas_v112_3_0mw_pmsg"),
        ("vestas_v112_3_0mw_pmsg", "vestas_v112_3_3mw_scig"),
    ],
)
def test_zmiana_wariantu_generatora_nie_zmienia_napiec_sieci(z_typu: str, na_typ: str) -> None:
    przed = _dodaj(z_typu)
    ref = przed["generators"][0]["ref_id"]
    wynik = _przypisz(przed, ref, na_typ)
    assert not wynik.get("error"), (wynik.get("error_code"), wynik.get("error"))
    po = wynik["snapshot"]
    assert _napiecia_szyn(po) == _napiecia_szyn(przed)
    assert _block_transformer(po)["ulv_kv"] == _block_transformer(przed)["ulv_kv"] == U_SIECI_KV
    tabliczka = po["generators"][0]["materialized_params"]
    assert tabliczka["un_kv"] == U_SIECI_KV
    assert tabliczka["generator_machine_type"] == WARIANTY[na_typ][0]
    assert tabliczka["generator_stator_voltage_kv"] == WARIANTY[na_typ][1]
    # Pole nieobecne w nowym typie znika z tabliczki — brak resztek poprzedniego wariantu.
    for pole in POLA_TORU_MASZYNY:
        assert tabliczka.get(pole) == getattr(_typ(na_typ), pole), pole


def test_zmiana_na_turbine_o_innym_napieciu_sieci_jest_odmowa() -> None:
    przed = _dodaj("vestas_v112_3_3mw_scig")
    wynik = _przypisz(przed, przed["generators"][0]["ref_id"], "conv-wind-nn-2mw-0p4kv")
    assert wynik.get("error_code") == "der.inverter_voltage_mismatch"


def test_zmiana_na_wariant_ponad_przeciazalnosc_tr_jest_odmowa() -> None:
    """V112-3.45 (S_n 4,4 MVA) nie mieści się w 3,15 MVA · 1,25 — O-53 przy zmianie typu."""
    przed = _dodaj("vestas_v112_3_3mw_pmsg")
    wynik = _przypisz(przed, przed["generators"][0]["ref_id"], "vestas_v112_3_45mw")
    assert wynik.get("error_code") == "converter.transformer_capacity_exceeded"


# ---------------------------------------------------------------------------
# Przypadek 7: zapis/odczyt modelu i archiwum projektu zachowuje konfigurację.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("typ_id", sorted(WARIANTY))
def test_zapis_odczyt_modelu_zachowuje_tor_maszyny(typ_id: str) -> None:
    model = EnergyNetworkModel.model_validate(_dodaj(typ_id))
    json_modelu = model.model_dump_json()
    odczytany = EnergyNetworkModel.model_validate_json(json_modelu)
    assert odczytany.generators[0].materialized_params == model.generators[0].materialized_params
    assert odczytany.model_dump_json() == json_modelu
    # Determinizm: ten sam wariant → identyczne elementy toru (identyfikatory i tabliczka).
    # Porównanie na kolekcjach migawki operacji: nagłówek i `id` szyn fikstury stacji
    # pochodzą z konstruktora modelu testowego (znacznik czasu, uuid), nie z operacji.
    pierwszy, drugi = _dodaj(typ_id), _dodaj(typ_id)
    for kolekcja in ("buses", "transformers", "branches", "generators"):
        assert pierwszy[kolekcja] == drugi[kolekcja], kolekcja


@pytest.fixture
def magazyn_enm(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path / "enm_store"))
    reset_enm_store(remove_persisted=False)
    yield
    reset_enm_store(remove_persisted=False)


def test_archiwum_projektu_zachowuje_wariant_turbiny(test_db_session, magazyn_enm) -> None:
    teraz = datetime.now(UTC)
    projekt_id = uuid4()
    test_db_session.add(
        ProjectORM(
            id=projekt_id,
            name="Farma V112",
            description=None,
            schema_version="1.0.0",
            connection_node_id=None,
            sources_jsonb=[],
            created_at=teraz,
            updated_at=teraz,
        )
    )
    test_db_session.add(
        StudyCaseORM(
            id=uuid4(),
            project_id=projekt_id,
            name="Przypadek",
            description=None,
            study_jsonb={"c_factor_max": 1.1, "c_factor_min": 0.95},
            is_active=True,
            result_status="NONE",
            result_refs_jsonb=[],
            revision=1,
            created_at=teraz,
            updated_at=teraz,
        )
    )
    test_db_session.commit()
    model = EnergyNetworkModel.model_validate(_dodaj("vestas_v112_3_3mw_scig"))
    zapisany = set_enm(klucz_twin_projektu(projekt_id), model)

    serwis = ProjectArchiveService(test_db_session)
    archiwum = serwis.export_project(projekt_id)
    with zipfile.ZipFile(io.BytesIO(archiwum), "r") as zf:
        dane = json.loads(zf.read("project.json").decode("utf-8"))
    tabliczka_w_archiwum = dane["enm"]["models"][0]["snapshot"]["generators"][0][
        "materialized_params"
    ]
    assert tabliczka_w_archiwum["generator_machine_type"] == "SCIG"
    assert tabliczka_w_archiwum["generator_stator_voltage_kv"] == 0.75
    assert tabliczka_w_archiwum["un_kv"] == U_SIECI_KV

    reset_enm_store(remove_persisted=True)
    wynik = serwis.import_project(archiwum, new_project_name="Farma V112 — import")
    assert wynik.status in {
        ArchiveImportStatus.SUCCESS,
        ArchiveImportStatus.CATALOG_MAPPING_REQUIRED,
    }, wynik.errors
    odtworzony = get_enm(klucz_twin_projektu(wynik.project_id))
    assert odtworzony.header.hash_sha256 == zapisany.header.hash_sha256
    assert (
        odtworzony.generators[0].materialized_params == zapisany.generators[0].materialized_params
    )


# ---------------------------------------------------------------------------
# Przypadek 8: graf solverów, źródło zwarciowe, sekcje modelu i API pokazują
# parametry, których solwery używają.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("typ_id", sorted(WARIANTY))
def test_graf_solverow_widzi_przeksztaltnik_na_065_nie_maszyne(typ_id: str) -> None:
    graf = map_enm_to_network_graph(EnergyNetworkModel.model_validate(_dodaj(typ_id)))
    zrodla = graf.get_inverter_sources()
    assert len(zrodla) == 1
    zrodlo = zrodla[0]
    # Wkład zwarciowy liczony z prądu znamionowego PRZEKSZTAŁTNIKA (S_n/(√3·U_sieci)),
    # nie z impedancji maszyny: źródło przekształtnikowe typu 4 (`wind_inverter`), brak
    # źródeł maszynowych w grafie (ścieżka `fw_scig`/`fw_dfig` nie jest użyta).
    assert isinstance(zrodlo, InverterSource)
    assert zrodlo.converter_kind == ConverterKind.WIND
    assert graf.nodes[zrodlo.node_id].voltage_level == U_SIECI_KV
    s_n = WARIANTY[typ_id][6]
    assert zrodlo.in_rated_a == pytest.approx(s_n * 1e3 / (math.sqrt(3) * U_SIECI_KV))
    assert graf.get_synchronous_machine_sources() == []
    assert graf.get_asynchronous_machine_sources() == []
    # k_sc bez źródła → jawna odmowa u konsumenta: założenie w śladzie WHITE BOX
    # (kod gotowości `inverter.k_sc_default_forbidden`), nie cichy współczynnik.
    assert zrodlo.k_sc is None
    assert [w["inputs"]["generator_ref"] for w in graf.k_sc_assumptions_trace] == [zrodlo.id]


@pytest.mark.parametrize("typ_id", sorted(WARIANTY))
def test_sekcje_modelu_pokazuja_tor_maszyny(typ_id: str) -> None:
    oceny = {o.sekcja: o for o in sekcje_typu(get_default_mv_catalog(), "CONVERTER", typ_id)}
    skladniki = {s.nazwa for s in oceny["fundamental"].skladniki}
    assert "tor_maszyny" in skladniki
    # Brak k_sc i profilu dynamiki → sekcje zwarciowa i dynamiczna NIE są ocenione.
    assert oceny["short_circuit"].status == "UNKNOWN"
    assert oceny["dynamic"].status == "UNKNOWN"


@pytest.fixture
def klient_api(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{tmp_path / 'katalog.db'}")
    from api.main import app

    with TestClient(app) as klient:
        yield klient


def test_api_katalogu_zwraca_tor_maszyny(klient_api: TestClient) -> None:
    odpowiedz = klient_api.get("/api/catalog/converter-types", params={"kind": "WIND"})
    assert odpowiedz.status_code == 200
    rekordy = {r["id"]: r for r in odpowiedz.json()}
    for typ_id, (maszyna, u_stojana, _f, u_maszynowa, *_reszta) in WARIANTY.items():
        rekord = rekordy[typ_id]
        assert rekord["un_kv"] == U_SIECI_KV
        assert rekord["generator_machine_type"] == maszyna
        assert rekord["generator_stator_voltage_kv"] == u_stojana
        assert rekord.get("converter_machine_side_voltage_kv") == u_maszynowa
    # Rekord bez toru maszyny nie dostaje pól None (addytywny kontrakt, exclude_none).
    bez_toru = rekordy["conv-wind-nn-2mw-0p4kv"]
    assert not set(POLA_TORU_MASZYNY) & set(bez_toru)
