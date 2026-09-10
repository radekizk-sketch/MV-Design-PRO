"""Migracja jednorazowa tabel legacy przy starcie (W1, OD-2): zrzut → ENM → DROP.

Baza SQLite z tabelami legacy tworzonymi surowym SQL (klasy ORM już nie istnieją —
i tak ma wyglądać baza sprzed W1 widziana przez kod po W1). Iloczyn cech:
{projekt z modelem legacy bez ENM, projekt z ENM, projekt z odmową} × {tabele są, tabel nie ma}.
"""

from __future__ import annotations

import json
from pathlib import Path
from uuid import uuid4

import pytest
from enm.dziennik_zmian import wszystkie_wpisy
from enm.klucz_twin import klucz_twin_projektu
from enm.store import get_enm, has_enm
from infrastructure.persistence.db import create_engine_from_url, init_db
from infrastructure.persistence.migracja_legacy_db import (
    TABELE_LEGACY,
    ZRODLO_MIGRACJI,
    migruj_i_usun_tabele_legacy,
)
from infrastructure.persistence.models import ProjectORM
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

_DDL = {
    "network_snapshots": "CREATE TABLE network_snapshots (snapshot_id VARCHAR(64) PRIMARY KEY, parent_snapshot_id VARCHAR(64), created_at DATETIME, schema_version VARCHAR(50), network_model_id VARCHAR(64), fingerprint VARCHAR(64), snapshot_json JSON)",
    "network_nodes": "CREATE TABLE network_nodes (id CHAR(32) PRIMARY KEY, project_id CHAR(32), name VARCHAR(255), node_type VARCHAR(20), base_kv FLOAT, attrs_jsonb JSON)",
    "network_branches": "CREATE TABLE network_branches (id CHAR(32) PRIMARY KEY, project_id CHAR(32), name VARCHAR(255), branch_type VARCHAR(20), from_node_id CHAR(32), to_node_id CHAR(32), in_service BOOLEAN, params_jsonb JSON)",
    "network_sources": "CREATE TABLE network_sources (id CHAR(32) PRIMARY KEY, project_id CHAR(32), node_id CHAR(32), source_type VARCHAR(20), payload_jsonb JSON, in_service BOOLEAN)",
    "network_loads": "CREATE TABLE network_loads (id CHAR(32) PRIMARY KEY, project_id CHAR(32), node_id CHAR(32), payload_jsonb JSON, in_service BOOLEAN)",
    "network_switching_states": "CREATE TABLE network_switching_states (id CHAR(32) PRIMARY KEY, case_id CHAR(32), element_id CHAR(32), element_type VARCHAR(50), in_service BOOLEAN)",
    "line_types": "CREATE TABLE line_types (id VARCHAR(255) PRIMARY KEY, name VARCHAR(255), params_jsonb JSON)",
}


@pytest.fixture()
def silnik(tmp_path):
    engine = create_engine_from_url(f"sqlite+pysqlite:///{tmp_path / 'legacy.db'}")
    yield engine
    engine.dispose()


def _projekt(engine, nazwa: str):
    with Session(engine) as s:
        projekt = ProjectORM(
            id=uuid4(),
            name=nazwa,
            description=None,
            schema_version="1.0",
            mode="AS-IS",
            voltage_level_kv=15.0,
            frequency_hz=50.0,
            sources_jsonb=[],
        )
        s.add(projekt)
        s.commit()
        return projekt.id


def _wstaw_model_legacy(engine, project_id, *, obciazalnosc: float = 315.0):
    n1, n2, n3, b1, b2 = (uuid4().hex for _ in range(5))
    pid = project_id.hex
    with engine.begin() as c:
        for tabela, ddl in _DDL.items():
            if tabela not in set(inspect(engine).get_table_names()):
                c.execute(text(ddl))
        for nid, name, typ, kv in (
            (n1, "GPZ", "SLACK", 15.0),
            (n2, "Stacja", "PQ", 15.0),
            (n3, "Stacja nN", "PQ", 0.4),
        ):
            c.execute(
                text("INSERT INTO network_nodes VALUES (:id, :pid, :name, :typ, :kv, :attrs)"),
                {"id": nid, "pid": pid, "name": name, "typ": typ, "kv": kv, "attrs": "{}"},
            )
        c.execute(
            text(
                "INSERT INTO network_branches VALUES (:id, :pid, 'AFL-6 120', 'line', :od, :do, 1, :params)"
            ),
            {
                "id": b1,
                "pid": pid,
                "od": n1,
                "do": n2,
                "params": json.dumps(
                    {
                        "r_ohm_per_km": 0.253,
                        "x_ohm_per_km": 0.081,
                        "b_us_per_km": 0.0,
                        "length_km": 5.0,
                        "rated_current_a": obciazalnosc,
                        "type_ref": None,
                    }
                ),
            },
        )
        c.execute(
            text(
                "INSERT INTO network_branches VALUES (:id, :pid, 'T1', 'transformer', :od, :do, 1, :params)"
            ),
            {
                "id": b2,
                "pid": pid,
                "od": n2,
                "do": n3,
                "params": json.dumps(
                    {
                        "rated_power_mva": 0.4,
                        "voltage_hv_kv": 15.0,
                        "voltage_lv_kv": 0.4,
                        "uk_percent": 6.0,
                        "pk_kw": 4.6,
                        "vector_group": "Dyn11",
                    }
                ),
            },
        )
        c.execute(
            text("INSERT INTO network_sources VALUES (:id, :pid, :node, 'GRID', :payload, 1)"),
            {
                "id": uuid4().hex,
                "pid": pid,
                "node": n1,
                "payload": json.dumps(
                    {
                        "name": "Z1",
                        "model": "short_circuit_power",
                        "sk3_mva": 500.0,
                        "rx_ratio": 0.1,
                    }
                ),
            },
        )
        c.execute(
            text("INSERT INTO network_loads VALUES (:id, :pid, :node, :payload, 1)"),
            {
                "id": uuid4().hex,
                "pid": pid,
                "node": n3,
                "payload": json.dumps({"name": "O1", "p_mw": 0.25, "q_mvar": 0.08}),
            },
        )
        c.execute(
            text(
                "INSERT INTO network_snapshots VALUES (:sid, NULL, NULL, '1.0', :pid, 'abc', :js)"
            ),
            {
                "sid": f"snap-{pid}",
                "pid": str(project_id),
                "js": json.dumps({"meta": {}, "graph": {"nodes": [], "branches": []}}),
            },
        )


def _tabele(engine) -> set[str]:
    return set(inspect(engine).get_table_names())


def test_baza_bez_tabel_legacy_to_pusty_przebieg(silnik):
    init_db(silnik)
    raport = migruj_i_usun_tabele_legacy(silnik)
    assert raport.nic_do_zrobienia
    assert not (_tabele(silnik) & set(TABELE_LEGACY))


def test_projekt_z_modelem_legacy_dostaje_enm_a_tabele_znikaja(silnik):
    init_db(silnik)
    pid = _projekt(silnik, "Sieć zastana")
    _wstaw_model_legacy(silnik, pid)
    assert {"network_nodes", "network_branches", "network_snapshots"} <= _tabele(silnik)

    raport = migruj_i_usun_tabele_legacy(silnik)

    assert set(raport.tabele) == {
        "network_snapshots",
        "network_nodes",
        "network_branches",
        "network_sources",
        "network_loads",
        "network_switching_states",
        "line_types",
    }
    assert list(raport.zmigrowane) == [str(pid)]
    assert raport.odmowione == {} and raport.pominiete == {}
    assert not (_tabele(silnik) & set(TABELE_LEGACY)), "tabele legacy muszą zniknąć"
    assert "projects" in _tabele(silnik)
    klucz = klucz_twin_projektu(pid)
    assert has_enm(klucz)
    model = get_enm(klucz)
    assert model.header.hash_sha256 == raport.zmigrowane[str(pid)]
    assert [b.name for b in model.buses] == ["GPZ", "Stacja", "Stacja nN"]
    assert [t.name for t in model.transformers] == ["T1"]
    assert model.katalog_projektu is not None
    assert (
        model.katalog_projektu.line_types[0].params["source_reference"].startswith(f"legacy:{pid}:")
    )
    [wpis] = wszystkie_wpisy(klucz)
    assert wpis.operacja is None
    assert wpis.ladunek is not None and wpis.ladunek["zrodlo"] == ZRODLO_MIGRACJI
    assert "modelu zastanego" in wpis.opis_pl
    # Zrzut archiwalny + manifest — zero utraty danych.
    katalog = Path(raport.katalog_zrzutu or "")
    assert (katalog / "network_nodes.json").is_file()
    assert len(json.loads((katalog / "network_nodes.json").read_text(encoding="utf-8"))) == 3
    manifest = json.loads((katalog / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["zmigrowane"] == raport.zmigrowane


def test_odmowa_nie_zatrzymuje_migracji_i_trafia_do_manifestu(silnik):
    init_db(silnik)
    dobry = _projekt(silnik, "Dobry")
    zly = _projekt(silnik, "Z placeholderem")
    _wstaw_model_legacy(silnik, dobry)
    _wstaw_model_legacy(silnik, zly, obciazalnosc=0.0)

    raport = migruj_i_usun_tabele_legacy(silnik)

    assert list(raport.zmigrowane) == [str(dobry)] or set(raport.zmigrowane) == {str(dobry)}
    assert str(zly) in raport.odmowione
    assert "placeholder" in raport.odmowione[str(zly)]
    assert not has_enm(klucz_twin_projektu(zly))
    assert not (_tabele(silnik) & set(TABELE_LEGACY))
    manifest = json.loads(
        (Path(raport.katalog_zrzutu or "") / "manifest.json").read_text(encoding="utf-8")
    )
    assert str(zly) in manifest["odmowione"]


def test_projekt_z_istniejacym_enm_nie_jest_nadpisywany(silnik):
    from enm.models import EnergyNetworkModel, ENMHeader
    from enm.store import set_enm

    init_db(silnik)
    pid = _projekt(silnik, "Ma już model")
    _wstaw_model_legacy(silnik, pid)
    klucz = klucz_twin_projektu(pid)
    istniejacy = set_enm(klucz, EnergyNetworkModel(header=ENMHeader(name="własny")))
    raport = migruj_i_usun_tabele_legacy(silnik)
    assert str(pid) in raport.pominiete
    assert get_enm(klucz).header.hash_sha256 == istniejacy.header.hash_sha256
    assert not (_tabele(silnik) & set(TABELE_LEGACY))


def test_init_db_uruchamia_migracje_na_bazie_sprzed_w1(silnik):
    init_db(silnik)
    pid = _projekt(silnik, "Start")
    _wstaw_model_legacy(silnik, pid)
    init_db(silnik)  # drugi start = start aplikacji na bazie sprzed W1
    assert not (_tabele(silnik) & set(TABELE_LEGACY))
    assert has_enm(klucz_twin_projektu(pid))
