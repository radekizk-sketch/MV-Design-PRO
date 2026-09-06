"""FastAPI integration tests for reference_networks endpoints."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_list_endpoint_returns_all_networks() -> None:
    from api.main import app

    client = TestClient(app)
    response = client.get("/api/v1/reference-networks")
    assert response.status_code == 200
    networks = response.json()
    assert len(networks) == 12


def test_list_endpoint_includes_required_fields() -> None:
    from api.main import app

    client = TestClient(app)
    response = client.get("/api/v1/reference-networks")
    networks = response.json()
    for net in networks:
        assert "id" in net
        assert "name_pl" in net
        assert "source" in net
        assert "voltage_kv" in net
        assert "has_der" in net


def test_detail_endpoint_for_ieee_4bus() -> None:
    from api.main import app

    client = TestClient(app)
    response = client.get("/api/v1/reference-networks/ieee-4bus")
    assert response.status_code == 200
    detail = response.json()
    assert detail["id"] == "ieee-4bus"
    assert detail["bus_count"] == 4
    assert detail["has_pf_expected"] is True


def test_detail_endpoint_unknown_returns_404() -> None:
    from api.main import app

    client = TestClient(app)
    response = client.get("/api/v1/reference-networks/does-not-exist")
    assert response.status_code == 404


def test_run_endpoint_returns_result() -> None:
    from api.main import app

    client = TestClient(app)
    response = client.post("/api/v1/reference-networks/ieee-4bus/run?solver_kind=power_flow_newton")
    assert response.status_code == 200
    body = response.json()
    assert body["network_id"] == "ieee-4bus"
    assert body["success"] is True
    assert "buses" in body["result"]


def test_run_endpoint_passes_convergence_through() -> None:
    """Zbieznosc i iteracje sa czescia wyniku solvera — koncowka nie moze ich gubic.

    ROUTERY-4A: `solve_reference_network` zwraca `converged`/`iterations`, a
    `_run_solver_for_network` je UPUSZCZAL — konsument (panel biegu sieci
    referencyjnych) nie mial jak odroznic zbieznosci od braku danych. Iloczyn
    cech: siec symetryczna (NR) x niesymetryczna (BFS, S6) — obie drogi
    dyspozycji solvera musza przenosic komplet.
    """
    from api.main import app

    client = TestClient(app)
    for network_id in ("ieee-4bus", "ieee-13bus"):
        response = client.post(f"/api/v1/reference-networks/{network_id}/run")
        assert response.status_code == 200
        result = response.json()["result"]
        assert result["converged"] is True, network_id
        assert isinstance(result["iterations"], int), network_id
        assert len(result["buses"]) > 0, network_id


def test_validate_endpoint_ieee_4bus_passes() -> None:
    """End-to-end validation: actual matches expected → PASS."""
    from api.main import app

    client = TestClient(app)
    response = client.post("/api/v1/reference-networks/ieee-4bus/validate")
    assert response.status_code == 200
    body = response.json()
    report = body["report"]
    assert report["network_id"] == "ieee-4bus"
    assert report["overall_status"] == "PASS"
    assert report["pf_pass_count"] >= 4  # 4 buses


def test_validate_endpoint_all_networks_pass() -> None:
    """All registered networks must return PASS with real solver outputs.

    `oze-pv-bess` WYKLUCZONE z tej listy (CV-4.3 K1, 2026-09-06 — dług jawny,
    Zero-Debt pkt 4; patrz test przypinający niżej, NIE milczące pominięcie).
    Stary dialekt słownikowy (`computation.py::_power_flow_newton_raphson`)
    NIE ZBIEGA dla tej sieci (`converged: False`, zweryfikowane bezpośrednio)
    — endpoint zwraca flat start (v_pu=1.0/angle_deg=0.0), co historycznie
    "przechodziło" wyłącznie dzięki łagodnej polityce kąta w `comparator.py`
    (|expected|<10° ⇒ tolerancja ABSOLUTNA 10°), maskującej brak zbieżności
    fabrykowanymi "oczekiwanymi" kątami rzędu -0,15/-0,22° (test maskujący
    defekt = dwa defekty, CLAUDE.md pkt 5).

    Historia korekt `expected/oze_pv_bess.json` (obie w tej samej karcie —
    patrz `source_note` pliku dla pełnej wersji): KOREKTA 1 podstawiła kąt
    zmierzony torem KANONICZNYM (~29,8°) w miejsce niezweryfikowanego
    oryginału — ale ten kąt sam okazał się BŁĘDNY (defekt katalogowy
    `vector_group=None` -> domyślne "Dyn11" +30° w `enm/mapping.py`, patrz
    `mv_benchmark_catalog.py`). KOREKTA 2 (ta sama sesja) naprawiła katalog
    (`vector_group="Yy0"`) i ponownie odczytała tor kanoniczny — PRAWDZIWY
    kąt jest MAŁY (rzędu -0,19/-0,20°, fizycznie sensowny, bliski
    pierwotnemu przed-KOREKTA-1 zgadywaniu -0,15/-0,22°). Ta zmiana NIE
    naprawia starego dialektu (wciąż `converged: False`) — zmienia tylko,
    KTÓRE konkretne porównania łagodna polityka kąta comparator.py maskuje
    (patrz test przypinający niżej, zaktualizowany do aktualnego kształtu).
    Łagodna polityka kąta w `comparator.py` (tolerancja ABSOLUTNA 10° dla
    małych kątów, niezależna od `rtol` zadeklarowanego per wiersz) jest
    znaleziskiem POZA zakresem tej karty — używana przez WSZYSTKIE sieci
    tego endpointu, jej zawężenie wymaga audytu wpływu na całą powierzchnię
    `/validate` (Zero-Debt pkt 4, dług jawny do execplanu, nie cicha zmiana
    tu). Wyrocznia kanoniczna (klasy a/b/c, CV-4.3 K1) dla tej sieci żyje w
    `tests/golden/parytet_benchmarkow/` — TA funkcja pilnuje wyłącznie
    starego dialektu, nieużywanego przez tor kanoniczny.
    """
    from api.main import app

    client = TestClient(app)
    for net_id in [
        "ieee-4bus",
        "ieee-9bus",
        "ieee-14bus",
        "ieee-39bus",
        "iec60909-example",
        "pandapower-iec60909-radial",
        "cigre-mv-14",
        "pp-simple-4bus",
        # "oze-pv-bess" — patrz docstring wyżej + test przypinający niżej.
        "ieee-13bus",
        "ieee-34bus",
        "cigre-lv-benchmark",
    ]:
        response = client.post(f"/api/v1/reference-networks/{net_id}/validate")
        assert response.status_code == 200, f"{net_id} validate failed: {response.text}"
        report = response.json()["report"]
        assert report["overall_status"] == "PASS", f"{net_id} validation FAIL: {report}"


def test_oze_pv_bess_validate_przypina_znany_brak_zbieznosci_starego_dialektu() -> None:
    """Przypina DOKŁADNY kształt wykluczenia z testu wyżej (jego docstring).

    Deklaracja bez testu = fałszywa pewność (reguła KLASA §4): jeśli stary
    dialekt kiedyś zacznie zbiegać dla tej sieci (albo defekt się pogłębi),
    ten test czerwienieje i ktoś musi to świadomie zauważyć — zamiast cichego
    wykluczenia, które nikt już nigdy nie zrewiduje.

    ZBIÓR NIEZBIEŻNYCH PORÓWNAŃ ZMIENIŁ SIĘ w tej samej karcie (KOREKTA 2
    `expected/oze_pv_bess.json` — patrz docstring testu wyżej): flat start
    starego dialektu (v_pu=1.0/angle_deg=0.0 wszędzie) jest NIEZMIENIONY, ale
    prawdziwy (mały) kąt kanoniczny wpadł w łagodne pasmo ABSOLUTNEJ
    tolerancji 10° `comparator.py` dla obu szyn — `angle_deg@BUS-2` i
    `angle_deg@BUS-3` przeszły z FAIL na PASS mimo rel_diff=1,0 (100%
    błędu względnego), bo abs_diff (~0,19/0,20°) mieści się w paśmie 10°.
    To NIE jest naprawa starego dialektu — asercja niżej (`actual in
    (0.0, 1.0)`) na WSZYSTKICH porównaniach (PASS i FAIL) jest właśnie po
    to, żeby złapać moment, gdy stary dialekt naprawdę zacznie zbiegać,
    NIEZALEŻNIE od tego, czy dana wielkość akurat mieści się w tolerancji.
    """
    from api.main import app

    client = TestClient(app)
    response = client.post("/api/v1/reference-networks/oze-pv-bess/validate")
    assert response.status_code == 200
    report = response.json()["report"]
    assert report["overall_status"] == "FAIL"
    niezbiezne = {
        f"{c['quantity']}@{c['element_id']}"
        for c in report["pf_comparisons"]
        if c["status"] == "FAIL"
    }
    assert niezbiezne == {"v_pu@BUS-3"}
    # Brak zbieżności starego NR (flat start), nie inna fizyka — sprawdzone na
    # WSZYSTKICH porównaniach (nie tylko FAIL), bo łagodna polityka kąta
    # comparator.py potrafi zamaskować brak zbieżności na PASS (patrz wyżej).
    # Jeśli `actual` kiedyś przestanie być dokładnie stanem startowym
    # (0.0/1.0), ktoś zmienił zachowanie solvera i musi zaktualizować to
    # przypięcie.
    for porownanie in report["pf_comparisons"]:
        assert porownanie["actual"] in (0.0, 1.0), (
            "actual poza flat startem starego dialektu — defekt się zmienił, "
            "zrewiduj to przypięcie (nie tylko wartości)"
        )


def test_pandapower_iec60909_radial_uses_solver_trace_not_expected_copy() -> None:
    from api.main import app

    client = TestClient(app)
    response = client.post(
        "/api/v1/reference-networks/pandapower-iec60909-radial/run"
        "?solver_kind=short_circuit_iec60909"
    )
    assert response.status_code == 200
    body = response.json()
    sc = body["result"]["short_circuit"]["BUS-01__3F"]
    assert sc["ikss_a"] > 28_000.0
    assert sc["white_box_trace"]
    assert any(step.get("key") == "Zk" for step in sc["white_box_trace"])


def test_similarity_match_endpoint() -> None:
    from api.main import app

    client = TestClient(app)
    response = client.post(
        "/api/v1/reference-networks/similarity-match",
        json={
            "bus_count": 4,
            "branch_count": 4,
            "voltage_kv_levels": [132.0],
            "has_der": False,
            "is_unbalanced": False,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert "matches" in body
    # First match should be IEEE 4-bus (closest topology)
    assert body["matches"][0]["network_id"] == "ieee-4bus"
    assert body["matches"][0]["confidence_pct"] > 70.0


def test_nc_rfg_compliance_oze_network() -> None:
    from api.main import app

    client = TestClient(app)
    response = client.get("/api/v1/reference-networks/oze-pv-bess/nc-rfg-compliance")
    assert response.status_code == 200
    body = response.json()
    assert body["applicable"] is True
    assert body["status"] == "compliant"


def test_nc_rfg_compliance_non_oze_network() -> None:
    from api.main import app

    client = TestClient(app)
    response = client.get("/api/v1/reference-networks/ieee-4bus/nc-rfg-compliance")
    assert response.status_code == 200
    body = response.json()
    assert body["applicable"] is False
    assert body["status"] == "not_applicable"
