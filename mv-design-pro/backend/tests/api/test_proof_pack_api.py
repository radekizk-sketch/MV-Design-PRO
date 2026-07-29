from __future__ import annotations

import io
import zipfile
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from api.main import app
from application.proof_engine.proof_generator import ProofGenerator, SC3FInput
from domain.analysis_run import AnalysisRun
from domain.models import OperatingCase, Project
from domain.project_design_mode import ProjectDesignMode
from fastapi.testclient import TestClient
from infrastructure.persistence.db import (
    create_engine_from_url,
    create_session_factory,
    init_db,
)
from infrastructure.persistence.repositories import (
    AnalysisRunRepository,
    CaseRepository,
    ProjectRepository,
    ResultRepository,
)
from infrastructure.persistence.unit_of_work import build_uow_factory


def _build_sc3f_proof():
    test_input = SC3FInput(
        project_name="Test Project",
        case_name="Test Case SC3F",
        fault_node_id="B2",
        fault_type="THREE_PHASE",
        run_timestamp=datetime(2026, 1, 27, 10, 30, 0),
        solver_version="1.0.0-test",
        c_factor=1.10,
        u_n_kv=15.0,
        z_thevenin_ohm=complex(0.749, 3.419),
        ikss_ka=2.722,
        ip_ka=5.882,
        ith_ka=2.722,
        sk_mva=70.7,
        kappa=1.528,
        rx_ratio=0.219,
        tk_s=1.0,
        m_factor=1.0,
        n_factor=0.0,
    )
    return ProofGenerator.generate_sc3f_proof(test_input)


def _prepare_api_client(tmp_path):
    db_path = tmp_path / "proof_pack_api.db"
    engine = create_engine_from_url(f"sqlite+pysqlite:///{db_path}")
    init_db(engine)
    session_factory = create_session_factory(engine)
    app.state.uow_factory = build_uow_factory(session_factory)

    session = session_factory()
    project_id = uuid4()
    ProjectRepository(session).add(Project(id=project_id, name="Project"))

    operating_case_id = uuid4()
    CaseRepository(session).add_operating_case(
        OperatingCase(
            id=operating_case_id,
            project_id=project_id,
            name="Base",
            case_payload={"base_mva": 100.0, "active_snapshot_id": str(uuid4())},
            project_design_mode=ProjectDesignMode.SN_NETWORK,
        )
    )

    run_id = uuid4()
    now = datetime.now(UTC)
    run = AnalysisRun(
        id=run_id,
        project_id=project_id,
        operating_case_id=operating_case_id,
        analysis_type="short_circuit_sn",
        status="FINISHED",
        created_at=now,
        finished_at=now,
        input_snapshot={"snapshot_id": "snapshot-123"},
        input_hash="hash-sc",
        result_summary={"status": "FINISHED"},
    )
    AnalysisRunRepository(session).create(run)

    proof = _build_sc3f_proof()
    ResultRepository(session).add_result(
        run_id=run_id,
        project_id=project_id,
        result_type="proof_document",
        payload=proof.to_dict(),
    )

    missing_run_id = uuid4()
    run_missing = AnalysisRun(
        id=missing_run_id,
        project_id=project_id,
        operating_case_id=operating_case_id,
        analysis_type="short_circuit_sn",
        status="FINISHED",
        created_at=now,
        finished_at=now,
        input_snapshot={"snapshot_id": "snapshot-456"},
        input_hash="hash-missing",
        result_summary={"status": "FINISHED"},
    )
    AnalysisRunRepository(session).create(run_missing)
    session.close()

    return TestClient(app), {
        "project_id": project_id,
        "case_id": operating_case_id,
        "run_id": run_id,
        "missing_run_id": missing_run_id,
    }


def test_proof_pack_api_returns_zip(tmp_path):
    client, data = _prepare_api_client(tmp_path)
    response = client.get(
        f"/api/proof/{data['project_id']}/{data['case_id']}/{data['run_id']}/pack"
    )
    assert response.status_code == 410
    assert "StudyCase" in response.json()["detail"]


def test_proof_pack_api_404_when_missing(tmp_path):
    client, data = _prepare_api_client(tmp_path)

    response = client.get(
        f"/api/proof/{data['project_id']}/{data['case_id']}/{data['missing_run_id']}/pack"
    )
    assert response.status_code == 410


def test_sc_asymmetrical_pack_api_returns_bundle_zip(tmp_path):
    client, data = _prepare_api_client(tmp_path)
    payload = {
        "project_id": str(data["project_id"]),
        "case_id": str(data["case_id"]),
        "run_id": str(data["run_id"]),
        "snapshot_id": "snapshot-123",
        "project_name": "Projekt testowy",
        "case_name": "Przypadek SC asymetryczny",
        "fault_node_id": "B1",
        "run_timestamp": "2026-02-06T10:00:00",
        "solver_version": "1.0.0-test",
        "u_n_kv": 15.0,
        "c_factor": 1.1,
        "u_prefault_kv": 9.526279,
        "z1_re_ohm": 0.5,
        "z1_im_ohm": 1.2,
        "z2_re_ohm": 0.6,
        "z2_im_ohm": 1.1,
        "z0_re_ohm": 0.8,
        "z0_im_ohm": 2.4,
        "a_re": -0.5,
        "a_im": 0.8660254038,
        "tk_s": 1.0,
        "m_factor": 1.0,
        "n_factor": 0.0,
    }
    response = client.post("/api/proof/sc-asymmetrical/pack", json=payload)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"

    with zipfile.ZipFile(io.BytesIO(response.content)) as bundle:
        entries = set(bundle.namelist())
        assert "pakiet_dowodowy/SC1FZ.zip" in entries
        assert "pakiet_dowodowy/SC2F.zip" in entries
        assert "pakiet_dowodowy/SC2FZ.zip" in entries

        for nested_name in [
            "pakiet_dowodowy/SC1FZ.zip",
            "pakiet_dowodowy/SC2F.zip",
            "pakiet_dowodowy/SC2FZ.zip",
        ]:
            nested_bytes = bundle.read(nested_name)
            with zipfile.ZipFile(io.BytesIO(nested_bytes)) as nested:
                nested_entries = set(nested.namelist())
                assert "proof_pack/proof.json" in nested_entries
                assert "proof_pack/proof.tex" in nested_entries


def test_sc3f_pack_api_returns_zip(tmp_path):
    """G-SCM F2: SC3F proof pack endpoint builds a ZIP from an ENM snapshot
    (physics server-side; machine breakdown for rotating machines)."""
    from enm.mapping import map_enm_to_network_graph
    from enm.models import (
        Bus,
        EnergyNetworkModel,
        ENMHeader,
        Generator,
        OverheadLine,
        Source,
    )

    enm = EnergyNetworkModel(
        header=ENMHeader(name="Test SC3F API"),
        buses=[
            Bus(ref_id="bus_sn", name="Szyna SN", voltage_kv=15),
            Bus(ref_id="bus_oze", name="Szyna OZE", voltage_kv=15),
        ],
        sources=[
            Source(
                ref_id="src",
                name="Sieć",
                bus_ref="bus_sn",
                model="short_circuit_power",
                sk3_mva=220,
                rx_ratio=0.1,
            )
        ],
        branches=[
            OverheadLine(
                ref_id="ln1",
                name="L1",
                from_bus_ref="bus_sn",
                to_bus_ref="bus_oze",
                length_km=2.0,
                r_ohm_per_km=0.25,
                x_ohm_per_km=0.32,
            )
        ],
        generators=[
            Generator(
                ref_id="gen1",
                name="Agregat",
                bus_ref="bus_oze",
                p_mw=1.0,
                gen_type="synchronous",
                materialized_params={"un_kv": 15.0, "sn_mva": 1.25},
            )
        ],
    )
    graph = map_enm_to_network_graph(enm)
    fault_node_id = next(n.id for n in graph.nodes.values() if n.name == "Szyna OZE")

    client, data = _prepare_api_client(tmp_path)
    payload = {
        "project_id": str(data["project_id"]),
        "case_id": str(data["case_id"]),
        "run_id": str(data["run_id"]),
        "snapshot_id": "snapshot-123",
        "project_name": "Projekt testowy",
        "case_name": "Przypadek SC3F",
        "fault_node_id": fault_node_id,
        "run_timestamp": "2026-02-06T10:00:00",
        "solver_version": "1.0.0-test",
        "snapshot": enm.model_dump(mode="json"),
        "c_factor": 1.1,
        "tk_s": 1.0,
    }
    response = client.post("/api/proof/sc3f/pack", json=payload)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"

    with zipfile.ZipFile(io.BytesIO(response.content)) as pack:
        entries = set(pack.namelist())
        assert "proof_pack/proof.json" in entries
        assert "proof_pack/proof.tex" in entries


def _enm_z_maszyna():
    """ENM z maszyną synchroniczną — wspólny kształt z testem SC3F pack (R3-B)."""
    from enm.models import (
        Bus,
        EnergyNetworkModel,
        ENMHeader,
        Generator,
        OverheadLine,
        Source,
    )

    return EnergyNetworkModel(
        header=ENMHeader(name="Test wkladow SC"),
        buses=[
            Bus(ref_id="bus_sn", name="Szyna SN", voltage_kv=15),
            Bus(ref_id="bus_oze", name="Szyna OZE", voltage_kv=15),
        ],
        sources=[
            Source(
                ref_id="src",
                name="Siec",
                bus_ref="bus_sn",
                model="short_circuit_power",
                sk3_mva=220,
                rx_ratio=0.1,
            )
        ],
        branches=[
            OverheadLine(
                ref_id="ln1",
                name="L1",
                from_bus_ref="bus_sn",
                to_bus_ref="bus_oze",
                length_km=2.0,
                r_ohm_per_km=0.25,
                x_ohm_per_km=0.32,
            )
        ],
        generators=[
            Generator(
                ref_id="gen1",
                name="Agregat",
                bus_ref="bus_oze",
                p_mw=1.0,
                gen_type="synchronous",
                materialized_params={"un_kv": 15.0, "sn_mva": 1.25},
            )
        ],
    )


def test_sc3f_contributions_returns_machine_breakdown(tmp_path):
    """R3-B (K3-G3): endpoint wkladow zwraca rozbicie maszynowe z WHITE BOX."""
    from enm.mapping import map_enm_to_network_graph

    enm = _enm_z_maszyna()
    graph = map_enm_to_network_graph(enm)
    fault_node_id = next(n.id for n in graph.nodes.values() if n.name == "Szyna OZE")

    client, _ = _prepare_api_client(tmp_path)
    payload = {
        "snapshot": enm.model_dump(mode="json"),
        "fault_node_id": fault_node_id,
        "c_factor": 1.1,
        "t_min_s": 0.10,
    }
    response = client.post("/api/proof/sc3f/contributions", json=payload)
    assert response.status_code == 200
    dane = response.json()
    assert dane["standard"] == "IEC 60909-0:2016 §6.6"
    assert len(dane["contributions"]) == 1
    wklad = dane["contributions"][0]
    assert wklad["source_name"] == "Agregat"
    assert wklad["ikss_partial_a"] > 0
    assert 0 < wklad["mu"] <= 1.0
    assert dane["white_box"]  # slad solvera obecny

    # Wywod dyplomowy (zasada KaTeX 2026-07-22): kazdy krok wzor ogolny ->
    # podstawienie liczbowe -> wynik; kroki maszyny budowane W SOLVERZE.
    wywod = dane["wywod"]
    assert wywod[0]["tekst"].startswith("Model: IEC 60909")
    assert wywod[0]["latex"] is None
    assert wywod[1]["tekst"].startswith("Punkt zwarcia: I''k")
    assert wywod[2]["tekst"] == "— Agregat (SYNCHRONOUS) —"
    latexy = " ".join(k["latex"] for k in wywod if k["latex"])
    # Wzor ogolny pradu czesciowego (superpozycja Z-bus) + podstawienie z c.
    assert r"I''_{k,m} = \frac{c\,|Z_{mk}|}{|Z_{kk}|\,|Z_m|}" in latexy
    assert r"\frac{1.10 \cdot" in latexy
    # Impedancja maszyny z modulem; krotnosc; wspolczynnik zaniku; Ib z podstawieniem.
    assert r"|Z''_m| =" in latexy
    assert rf"= {wklad['ratio_ik_ir']:.2f}" in latexy
    assert rf"{wklad['mu']:.3f} \cdot {wklad['q']:.3f} \cdot" in latexy
    assert rf"= {wklad['ib_a'] / 1000.0:.3f}\;\mathrm{{kA}}" in latexy
    # Kroki wywodu takze w samym wkladzie (WHITE BOX solvera, per maszyna).
    assert len(wklad["wywod"]) >= 4
    assert any(k["tekst"].startswith("Suma wkladow maszyn") for k in wywod)
    assert any("Regula malych silnikow" in k["tekst"] for k in wywod)

    # Determinizm: to samo wejscie -> identyczna odpowiedz.
    response2 = client.post("/api/proof/sc3f/contributions", json=payload)
    assert response2.json() == dane


def test_sc3f_contributions_empty_without_machines(tmp_path):
    """Siec bez maszyn wirujacych -> deterministycznie pusta lista wkladow."""
    from enm.mapping import map_enm_to_network_graph

    enm = _enm_z_maszyna().model_copy(update={"generators": []})
    graph = map_enm_to_network_graph(enm)
    fault_node_id = next(n.id for n in graph.nodes.values() if n.name == "Szyna OZE")

    client, _ = _prepare_api_client(tmp_path)
    response = client.post(
        "/api/proof/sc3f/contributions",
        json={"snapshot": enm.model_dump(mode="json"), "fault_node_id": fault_node_id},
    )
    assert response.status_code == 200
    assert response.json()["contributions"] == []


def test_sc3f_contributions_accepts_enm_bus_ref(tmp_path):
    """UI zna ref ENM szyny (target_id wyniku SC) - endpoint rozwiazuje go sam."""
    enm = _enm_z_maszyna()
    client, _ = _prepare_api_client(tmp_path)
    response = client.post(
        "/api/proof/sc3f/contributions",
        json={"snapshot": enm.model_dump(mode="json"), "fault_node_id": "bus_oze"},
    )
    assert response.status_code == 200
    assert len(response.json()["contributions"]) == 1


def _dane_wkladow(tmp_path):
    """Wspolna odpowiedz contributions dla testow ZWARCIA-PRO F3 (pkt 8-10)."""
    enm = _enm_z_maszyna()
    client, _ = _prepare_api_client(tmp_path)
    payload = {"snapshot": enm.model_dump(mode="json"), "fault_node_id": "bus_oze"}
    response = client.post("/api/proof/sc3f/contributions", json=payload)
    assert response.status_code == 200
    return client, payload, response.json()


def test_sc3f_contributions_wywod_sekcje_pogrupowane_1do1(tmp_path):
    """ZWARCIA-PRO F3 pkt 8: `wywod_sekcje` = ta sama tresc co `wywod`, pogrupowana.

    Struktura sekcji: „Dane wejściowe i model" (norma bazowa) -> per maszyna
    „Wkład: {nazwa}" (par. 6.6) -> „Suma wkładów i reguły" (par. 6.6). Splaszczenie
    sekcji z separatorami maszyn odtwarza `wywod` 1:1 (kompatybilnosc: wywod
    zachowuje dotychczasowa strukture plaskiej listy).
    """
    _, _, dane = _dane_wkladow(tmp_path)
    sekcje = dane["wywod_sekcje"]
    assert [s["tytul"] for s in sekcje] == [
        "Dane wejściowe i model",
        "Wkład: Agregat",
        "Suma wkładów i reguły",
    ]
    assert [s["norma"] for s in sekcje] == [
        "IEC 60909-0:2016",
        "IEC 60909-0:2016 §6.6",
        "IEC 60909-0:2016 §6.6",
    ]
    # Kazdy krok sekcji ma kanoniczny ksztalt {tekst, latex}.
    for sekcja in sekcje:
        assert all(set(k) == {"tekst", "latex"} for k in sekcja["kroki"])
    # 1:1 z plaskim wywodem: naglowek + separator maszyny + kroki + suma/regula.
    splaszczone = list(sekcje[0]["kroki"])
    splaszczone.append({"tekst": "— Agregat (SYNCHRONOUS) —", "latex": None})
    splaszczone.extend(sekcje[1]["kroki"])
    splaszczone.extend(sekcje[2]["kroki"])
    assert splaszczone == dane["wywod"]
    # Kompatybilnosc struktury plaskiej listy (jak przed F3).
    assert dane["wywod"][0]["tekst"].startswith("Model: IEC 60909")
    assert dane["wywod"][1]["tekst"].startswith("Punkt zwarcia: I''k")
    assert dane["wywod"][2]["tekst"] == "— Agregat (SYNCHRONOUS) —"
    assert dane["wywod"][-2]["tekst"].startswith("Suma wkladow maszyn")
    assert "Regula malych silnikow" in dane["wywod"][-1]["tekst"]


def test_sc3f_contributions_regula_5_procent_pelna(tmp_path):
    """ZWARCIA-PRO F3 pkt 9: krok reguly malych silnikow PELNY (wartosci + LaTeX).

    Tresc reguly + wymaganie normy + wartosc graniczna 0.05*I''k + wartosc
    obliczona suma I''k,M + werdykt + wplyw na Ib; liczby 1:1 z white_box solvera.
    """
    _, _, dane = _dane_wkladow(tmp_path)
    krok = dane["wywod"][-1]
    async_ka = dane["white_box"]["ikss_async_machines_a"] / 1000.0
    limit_ka = dane["white_box"]["small_motor_limit_a"] / 1000.0
    ikss_ka = dane["white_box"]["ikss_total_a"] / 1000.0
    assert limit_ka == pytest.approx(0.05 * ikss_ka)
    # Tekst: wymaganie + wartosc graniczna + wartosc obliczona + werdykt + wplyw.
    assert "wymaganie suma I''k,M <= 0.05 * I''k" in krok["tekst"]
    assert f"wartosc graniczna 0.05 * I''k = {limit_ka:.3f} kA" in krok["tekst"]
    assert f"wartosc obliczona suma I''k,M = {async_ka:.3f} kA" in krok["tekst"]
    assert "SPELNIONA (silniki pomijalne w Ib)" in krok["tekst"]
    # LaTeX podstawienia obowiazkowy (zasada KaTeX 2026-07-22).
    assert krok["latex"] is not None
    assert rf"\sum_m I''_{{k,M}} = {async_ka:.3f}\;\mathrm{{kA}}" in krok["latex"]
    assert (
        rf"0.05 \cdot {ikss_ka:.3f}\;\mathrm{{kA}} = {limit_ka:.3f}\;\mathrm{{kA}}" in krok["latex"]
    )
    assert r"\text{SPELNIONA}" in krok["latex"]
    # Ten sam krok w sekcji „Suma wkładów i reguły" (1:1).
    assert dane["wywod_sekcje"][-1]["kroki"][-1] == krok


def test_sc3f_contributions_walidacja_iec_deterministyczna(tmp_path):
    """ZWARCIA-PRO F3 pkt 10: checklista walidacji metody z realnych wlasnosci biegu."""
    client, payload, dane = _dane_wkladow(tmp_path)
    walidacja = dane["walidacja_iec"]
    assert [p["pozycja_pl"] for p in walidacja] == [
        "Norma bazowa metody",
        "Współczynnik napięciowy c",
        "Metoda obliczenia wkładów",
        "Maszyny asynchroniczne",
        "Reguła małych silników (5%)",
        "Determinizm kontraktu (input_hash)",
    ]
    assert all(p["status"] in {"PASS", "FAIL", "INFO"} for p in walidacja)
    assert walidacja[0]["wartosc_pl"] == "IEC 60909-0:2016"
    assert walidacja[1]["wartosc_pl"].startswith("c = 1.10")
    # Siec z sama maszyna synchroniczna: silniki asynchroniczne nieobecne (INFO),
    # regula 5% SPELNIONA (PASS) z liczbami z white_box.
    assert walidacja[3] == {
        "pozycja_pl": "Maszyny asynchroniczne",
        "wartosc_pl": "nieobecne w modelu",
        "status": "INFO",
    }
    assert walidacja[4]["status"] == "PASS"
    assert walidacja[4]["wartosc_pl"].startswith("SPELNIONA — silniki pomijalne w Ib")
    assert "prog =" in walidacja[4]["wartosc_pl"]
    # Determinizm kontraktu: input_hash obecny (SHA-256) i stabilny miedzy biegami.
    assert walidacja[5]["status"] == "PASS"
    assert len(dane["input_hash"]) == 64
    assert walidacja[5]["wartosc_pl"] == f"obecny: {dane['input_hash'][:12]}..."
    dane2 = client.post("/api/proof/sc3f/contributions", json=payload).json()
    assert dane2["walidacja_iec"] == walidacja
    assert dane2["input_hash"] == dane["input_hash"]
    assert dane2["wywod_sekcje"] == dane["wywod_sekcje"]


def test_sc3f_contributions_bez_maszyn_sekcje_i_walidacja_uczciwe(tmp_path):
    """Siec bez maszyn: sekcje bez fabrykacji liczb, regula bez podstawien (latex None)."""
    from enm.mapping import map_enm_to_network_graph

    enm = _enm_z_maszyna().model_copy(update={"generators": []})
    graph = map_enm_to_network_graph(enm)
    fault_node_id = next(n.id for n in graph.nodes.values() if n.name == "Szyna OZE")

    client, _ = _prepare_api_client(tmp_path)
    response = client.post(
        "/api/proof/sc3f/contributions",
        json={"snapshot": enm.model_dump(mode="json"), "fault_node_id": fault_node_id},
    )
    dane = response.json()
    tytuly = [s["tytul"] for s in dane["wywod_sekcje"]]
    assert tytuly == ["Dane wejściowe i model", "Suma wkładów i reguły"]
    regula = dane["wywod_sekcje"][-1]["kroki"][-1]
    assert regula["latex"] is None  # brak liczb w white_box -> bez podstawien
    assert "SPELNIONA (silniki pomijalne w Ib)" in regula["tekst"]
    walidacja = dane["walidacja_iec"]
    assert walidacja[3]["wartosc_pl"] == "nieobecne w modelu"
    assert walidacja[4]["wartosc_pl"] == "SPELNIONA — silniki pomijalne w Ib"
