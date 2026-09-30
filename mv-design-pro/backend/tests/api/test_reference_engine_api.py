"""Reference Engine V1 — kontrakt API (spec §9/§12).

GET /api/reference/packs, GET /api/reference/packs/{id},
GET /api/cases/{case_id}/reference/compliance (+ ?packs= i 404 nieznanego
pakietu — negatyw).
"""

from enm.models import (
    Bay,
    BayPrimaryDevice,
    Bus,
    EnergyNetworkModel,
    ENMHeader,
    Substation,
)
from enm.store import set_enm


def _nowy_przypadek(client) -> str:
    """Utwórz REALNY projekt + przypadek przez API; zwróć `case_id`.

    CV-1-W: przypadek bez wiersza w bazie dostaje teraz 404 z magazynu ENM
    (inwariant I-2) — testy tego pliku potrzebują prawdziwej pary
    projekt+przypadek zamiast dowolnego napisu.
    """
    project_resp = client.post("/api/projects", json={"name": "Reference Engine — test"})
    assert project_resp.status_code == 201, project_resp.text
    project_id = project_resp.json()["id"]
    case_resp = client.post(
        "/api/study-cases", json={"project_id": project_id, "name": "Przypadek testu"}
    )
    assert case_resp.status_code == 201, case_resp.text
    return str(case_resp.json()["id"])


def _klucz(client, case_id: str) -> str:
    """Klucz magazynu ENM dla `case_id` — TO SAMO tłumaczenie co warstwa API (CV-1)."""
    from application.twin_key import klucz_twin_dla_przypadku

    return klucz_twin_dla_przypadku(case_id, client.app.state.uow_factory)


def _seed_enm(client, case_id: str) -> None:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="API zgodności referencyjnej"),
        buses=[Bus(ref_id="bus/sn", name="Szyna SN", voltage_kv=15.0)],
        substations=[
            Substation(
                ref_id="st/01",
                name="Stacja testowa",
                station_type="mv_lv",
                bus_refs=["bus/sn"],
            )
        ],
        bays=[
            Bay(
                ref_id="bay/ok",
                name="Pole liniowe RMU",
                bay_role="OUT",
                substation_ref="st/01",
                bus_ref="bus/sn",
                primary_devices=[
                    BayPrimaryDevice(
                        device_ref="q1",
                        symbol_ref="q1",
                        kind="LOAD_SWITCH",
                        placement="MIDSTREAM",
                    ),
                    BayPrimaryDevice(
                        device_ref="qe1",
                        symbol_ref="qe1",
                        kind="ES",
                        placement="GROUND_BRANCH",
                    ),
                    BayPrimaryDevice(
                        device_ref="gk",
                        symbol_ref="gk",
                        kind="CABLE_HEAD",
                        placement="DOWNSTREAM",
                    ),
                ],
            )
        ],
    )
    set_enm(_klucz(client, case_id), enm)


class TestReferencePacksApi:
    def test_list_packs_returns_all_with_versions(self, app_client) -> None:
        response = app_client.get("/api/reference/packs")
        assert response.status_code == 200
        packs = response.json()
        assert [p["pack_id"] for p in packs] == [
            "abb_safering",
            "abb_unigear",
            "elektrometal_e2alpha",
            "iec60617",
            "iec62271",
            "osd_enea",
            "schneider_sm6",
            "siemens_8djh",
        ]
        assert all(p["version"] for p in packs)

    def test_get_pack_returns_full_profiles(self, app_client) -> None:
        response = app_client.get("/api/reference/packs/iec62271")
        assert response.status_code == 200
        pack = response.json()
        profile_ids = {p["profile_id"] for p in pack["field_profiles"]}
        assert "rmu_line" in profile_ids
        assert "line_breaker" in profile_ids

    def test_get_unknown_pack_is_404(self, app_client) -> None:
        response = app_client.get("/api/reference/packs/nie-ma-takiego")
        assert response.status_code == 404


class TestReferenceComplianceApi:
    def test_compliance_report_with_scores(self, app_client) -> None:
        case_id = _nowy_przypadek(app_client)
        _seed_enm(app_client, case_id)
        response = app_client.get(f"/api/cases/{case_id}/reference/compliance")
        assert response.status_code == 200
        report = response.json()
        by_id = {p["pack_id"]: p for p in report["packs"]}
        assert len(by_id) == 8
        assert by_id["iec62271"]["score_percent"] == 100
        assert by_id["iec62271"]["failed"] == 0

    def test_compliance_packs_filter(self, app_client) -> None:
        case_id = _nowy_przypadek(app_client)
        _seed_enm(app_client, case_id)
        response = app_client.get(
            f"/api/cases/{case_id}/reference/compliance",
            params={"packs": "iec62271,osd_enea"},
        )
        assert response.status_code == 200
        assert [p["pack_id"] for p in response.json()["packs"]] == [
            "iec62271",
            "osd_enea",
        ]

    def test_compliance_unknown_pack_is_404(self, app_client) -> None:
        case_id = _nowy_przypadek(app_client)
        _seed_enm(app_client, case_id)
        response = app_client.get(
            f"/api/cases/{case_id}/reference/compliance",
            params={"packs": "nie-ma-takiego"},
        )
        assert response.status_code == 404
        # Przypina WŁAŚCIWY powód (pakiet, nie tłumaczenie case_id) — bez tego
        # dwa różne 404 (case bez projektu vs. nieznany pakiet) byłyby
        # nierozróżnialne dla tego testu (test maskujący defekt).
        assert "nie-ma-takiego" in response.json()["detail"]
