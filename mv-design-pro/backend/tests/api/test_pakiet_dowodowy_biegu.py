"""Pakiet dowodowy PRZEBIEGU — brama `/api/analysis-runs/{run}/pakiet-dowodowy` (PACK-DOWODY).

DEFEKT ZAMYKANY: dedykowane pakiety dowodowe nie miały konsumenta, bo ich kontrakty
HTTP żądały od klienta wielkości fizycznych (Z1/Z2/Z0, U_f, operator Fortescue).
Brama przyjmuje TOŻSAMOŚĆ przebiegu i punkt zwarcia, a fizykę liczy serwer.

Testy chodzą REALNĄ ścieżką: bieg tworzony i wykonywany przez tor wykonawczy
(`/api/execution/...`), nie ręcznie wstawiany do repozytorium — dzięki temu pin
łapie także rozjazd między tym, co bieg zapisuje, a tym, czego brama szuka.

Pokrycie jako ILOCZYN CECH (nie jeden przykład):
rodzaj biegu (3F / 1F-Z / 2F / 2F+Z / rozpływ mocy / stan fazowy) × dostępność
pakietu (dostępny / rodzaj bez pakietu / bieg bez wyniku) × punkt (domyślny /
wskazany / spoza biegu / podany tam, gdzie punktu nie ma) × zawartość (dowód +
źródło + wykaz + odcisk) × determinizm (dwa wywołania).

Dla pakietu ROZPŁYWU dochodzi drugi iloczyn — cechy MODELU, które zmieniają moc
faktycznie wstrzykniętą przez solver (karta PACK-ROZPLYW):
regulacja falowników {jest / nie ma} × model ZIP odbioru {jest / nie ma} ×
regulacja zaczepów {jest / nie ma} × stan biegu {zbieżny / niezbieżny / bez wyniku}.
Ten iloczyn nie jest ozdobą: gdyby dowód czytał moc ŻĄDANĄ z modelu zamiast mocy
z wyniku, bilans domknąłby się tylko w wariancie bez ZIP i bez regulacji.
"""

from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path
from uuid import uuid4

import pytest
from api.main import app
from fastapi.testclient import TestClient

from tests.catalog_test_helpers import gpz_source_record


def _reset_backend_state() -> None:
    from api.execution_runs import get_engine
    from enm.canonical_analysis import reset_canonical_runs
    from enm.store import reset_enm_store

    engine = get_engine()
    engine._runs.clear()
    engine._result_sets.clear()
    engine._study_cases.clear()
    engine._case_runs.clear()
    reset_canonical_runs()
    reset_enm_store()


@pytest.fixture()
def client() -> TestClient:
    _reset_backend_state()
    with TestClient(app) as test_client:
        yield test_client


def _seed_enm(case_id: str) -> None:
    """Sieć SN: GPZ na szynie głównej, kabel, szyna odbiorcza (uziemienie punktu zerowego).

    Uziemienie transformatora zasilającego jest potrzebne, żeby sieć zerowa (Z0)
    istniała — bez niej pakiet zwarć niesymetrycznych nie miałby podstawy.
    """
    from enm.models import EnergyNetworkModel
    from enm.store import set_enm

    set_enm(
        case_id,
        EnergyNetworkModel.model_validate(
            {
                "header": {
                    "name": "Pakiet dowodowy przebiegu",
                    "enm_version": "1.0",
                    "defaults": {"frequency_hz": 50, "unit_system": "SI"},
                    "created_at": "2024-01-01T00:00:00Z",
                    "updated_at": "2024-01-01T00:00:00Z",
                    "revision": 1,
                    "hash_sha256": "",
                },
                "buses": [
                    {
                        "id": "00000000-0000-0000-0000-000000000501",
                        "ref_id": "bus-main",
                        "name": "Szyna glowna",
                        "tags": [],
                        "meta": {},
                        "voltage_kv": 15.0,
                        "phase_system": "3ph",
                    },
                    {
                        "id": "00000000-0000-0000-0000-000000000502",
                        "ref_id": "bus-odbior",
                        "name": "Szyna odbioru",
                        "tags": [],
                        "meta": {},
                        "voltage_kv": 15.0,
                        "phase_system": "3ph",
                    },
                ],
                "branches": [
                    {
                        "id": "00000000-0000-0000-0000-000000000503",
                        "ref_id": "branch-odbior",
                        "name": "Kabel odbiorczy",
                        "tags": [],
                        "meta": {},
                        "type": "cable",
                        "from_bus_ref": "bus-main",
                        "to_bus_ref": "bus-odbior",
                        "status": "closed",
                        "catalog_ref": "KABEL_SN_TEST",
                        "parameter_source": "CATALOG",
                        "length_km": 0.5,
                        "r_ohm_per_km": 0.253,
                        "x_ohm_per_km": 0.073,
                        # Składowa zerowa gałęzi — bez niej walidator ENM (W001)
                        # odcina zwarcia 1F/2F-Z i pakiet niesymetryczny nie ma
                        # podstawy (ta sama brama, którą widzi użytkownik).
                        "r0_ohm_per_km": 0.759,
                        "x0_ohm_per_km": 0.292,
                        "b_siemens_per_km": 2.6e-07,
                        "rating": {"in_a": 270.0},
                    }
                ],
                "sources": [
                    {
                        "id": "00000000-0000-0000-0000-000000000504",
                        "tags": [],
                        "meta": {},
                        **gpz_source_record(
                            ref_id="src-grid",
                            name="Zasilanie GPZ",
                            bus_ref="bus-main",
                            voltage_kv=15.0,
                            sk3_mva=250.0,
                            rx_ratio=0.10,
                            extra={"z0_z1_ratio": 3.0},
                        ),
                    }
                ],
                "loads": [
                    {
                        # Odbiór jest potrzebny, żeby ten sam model dał się policzyć
                        # także rozpływem mocy — cecha „rodzaj biegu bez pakietu"
                        # musi być sprawdzona na TEJ SAMEJ sieci, inaczej test
                        # dowodziłby czegoś innego.
                        "id": "00000000-0000-0000-0000-000000000505",
                        "ref_id": "load-odbior",
                        "name": "Odbior",
                        "tags": [],
                        "meta": {},
                        "bus_ref": "bus-odbior",
                        "p_mw": 0.5,
                        "q_mvar": 0.15,
                    }
                ],
                "transformers": [],
                "generators": [],
                "substations": [],
                "bays": [],
                "junctions": [],
                "corridors": [],
                "measurements": [],
                "protection_assignments": [],
                "branch_points": [],
            }
        ),
    )


def _wykonaj_bieg(
    client: TestClient,
    case_id: str,
    analysis_type: str,
    solver_input: dict | None = None,
) -> str:
    """Realna ścieżka: utworzenie biegu + wykonanie (tor wykonawczy, nie fixture)."""
    create = client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={"analysis_type": analysis_type, "solver_input": solver_input or {}},
    )
    assert create.status_code == 201, create.text
    run_id = create.json()["id"]
    execute = client.post(f"/api/execution/runs/{run_id}/execute")
    assert execute.status_code == 200, execute.text
    assert execute.json()["status"] == "DONE"
    return str(run_id)


def _wpisy_zip(content: bytes) -> set[str]:
    with zipfile.ZipFile(io.BytesIO(content)) as archiwum:
        return set(archiwum.namelist())


# ---------------------------------------------------------------------------
# Dostępność: rodzaj biegu rozstrzyga (jedno źródło prawdy)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("analysis_type", "oczekiwany_rodzaj"),
    [
        ("SC_3F", "SC3F"),
        ("SC_1F", "SC_NIESYMETRYCZNE"),
        ("SC_2F", "SC_NIESYMETRYCZNE"),
        ("SC_2F_G", "SC_NIESYMETRYCZNE"),
    ],
)
def test_dostepnosc_pakietu_dla_rodzajow_zwarciowych(
    client: TestClient, analysis_type: str, oczekiwany_rodzaj: str
) -> None:
    """Każdy rodzaj zwarcia dostaje pakiet WŁAŚCIWY dla swoich danych."""
    case_id = str(uuid4())
    _seed_enm(case_id)
    run_id = _wykonaj_bieg(client, case_id, analysis_type)

    response = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy/dostepnosc")

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["dostepny"] is True
    assert payload["rodzaj"] == oczekiwany_rodzaj
    assert payload["rodzaj_pl"]
    assert payload["powod_pl"] is None
    assert payload["punkty"], "bieg zwarciowy ma punkty do udokumentowania"
    assert all(p["target_id"] and p["nazwa"] for p in payload["punkty"])
    assert payload["zawartosc_pl"], "opis zawartości pakietu jest częścią kontraktu ekranu"


def test_dostepnosc_pakietu_rodzaj_bez_pakietu_z_powodem(client: TestClient) -> None:
    """Rodzaj spoza zamkniętej listy nie ma pakietu — brama mówi to WPROST.

    Cecha brzegowa: rodzaj biegu spoza mapy pakietów. Ekran ma dostać powód po
    polsku, a nie pusty przycisk. Nośnikiem cechy jest stan fazowy SN — rozpływ
    mocy przestał być przykładem „rodzaju bez pakietu" z chwilą, gdy dostał
    własny pakiet (karta PACK-ROZPLYW); intencja pinu bez zmian.
    """
    case_id = str(uuid4())
    _seed_enm(case_id)
    run_id = _wykonaj_bieg(client, case_id, "PHASE_STATE_SN")

    response = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy/dostepnosc")

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["dostepny"] is False
    assert payload["rodzaj"] is None
    assert payload["powod_pl"]
    assert "pakiet" in payload["powod_pl"].lower()
    assert payload["punkty"] == []


def test_pakiet_niedostepny_odmawia_zamiast_zwracac_pusty_plik(client: TestClient) -> None:
    """Pobranie pakietu dla rodzaju bez pakietu = odmowa z powodem, nie pusty ZIP."""
    case_id = str(uuid4())
    _seed_enm(case_id)
    run_id = _wykonaj_bieg(client, case_id, "PHASE_STATE_SN")

    response = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy")

    assert response.status_code == 422, response.text
    assert response.json()["detail"]


def test_dostepnosc_dla_nieistniejacego_przebiegu_to_404(client: TestClient) -> None:
    response = client.get(f"/api/analysis-runs/{uuid4()}/pakiet-dowodowy/dostepnosc")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Zawartość pakietu × rodzaj biegu
# ---------------------------------------------------------------------------


def test_pakiet_sc3f_niesie_dowod_zrodlo_wykaz_i_odcisk(client: TestClient) -> None:
    """Pakiet SC3F = dowód + źródło LaTeX + wykaz plików + odcisk integralności.

    To jest RÓŻNICA wobec podglądu śladu w oknie dowodu: ślad pokazuje kroki,
    pakiet niesie zamknięty, policzalny artefakt z sumami kontrolnymi.
    """
    case_id = str(uuid4())
    _seed_enm(case_id)
    run_id = _wykonaj_bieg(client, case_id, "SC_3F")

    response = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy")

    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/zip"
    assert "attachment" in response.headers["content-disposition"]
    wpisy = _wpisy_zip(response.content)
    assert "proof_pack/proof.json" in wpisy
    assert "proof_pack/proof.tex" in wpisy
    assert "proof_pack/manifest.json" in wpisy
    assert "proof_pack/signature.json" in wpisy


def test_pakiet_zwarc_niesymetrycznych_niesie_trzy_rodzaje_zwarcia(client: TestClient) -> None:
    """Pakiet niesymetryczny = komplet 1F-Z / 2F / 2F-Z, każdy z własnym dowodem.

    Zamknięcie luki kontraktu: to wywołanie NIE podaje Z1/Z2/Z0 ani U_f ani
    operatora Fortescue — całość liczy serwer ze snapshotu biegu.
    """
    case_id = str(uuid4())
    _seed_enm(case_id)
    run_id = _wykonaj_bieg(client, case_id, "SC_1F")

    response = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy")

    assert response.status_code == 200, response.text
    wpisy = _wpisy_zip(response.content)
    assert wpisy == {
        "pakiet_dowodowy/SC1FZ.zip",
        "pakiet_dowodowy/SC2F.zip",
        "pakiet_dowodowy/SC2FZ.zip",
    }
    with zipfile.ZipFile(io.BytesIO(response.content)) as zbiorczy:
        for nazwa in sorted(wpisy):
            with zipfile.ZipFile(io.BytesIO(zbiorczy.read(nazwa))) as pojedynczy:
                wewnetrzne = set(pojedynczy.namelist())
                assert "proof_pack/proof.json" in wewnetrzne
                assert "proof_pack/proof.tex" in wewnetrzne
                assert "proof_pack/manifest.json" in wewnetrzne


# ---------------------------------------------------------------------------
# Punkt zwarcia: domyślny / wskazany / spoza biegu
# ---------------------------------------------------------------------------


def test_wskazany_punkt_daje_inny_pakiet_niz_domyslny(client: TestClient) -> None:
    """Punkt zwarcia realnie steruje treścią pakietu (a nie tylko nazwą pliku)."""
    case_id = str(uuid4())
    _seed_enm(case_id)
    run_id = _wykonaj_bieg(client, case_id, "SC_3F")

    punkty = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy/dostepnosc").json()["punkty"]
    assert len(punkty) >= 2, "sieć testowa ma dwie szyny — dwa punkty zwarcia"

    domyslny = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy")
    pierwszy = client.get(
        f"/api/analysis-runs/{run_id}/pakiet-dowodowy",
        params={"punkt": punkty[0]["target_id"]},
    )
    drugi = client.get(
        f"/api/analysis-runs/{run_id}/pakiet-dowodowy",
        params={"punkt": punkty[1]["target_id"]},
    )

    assert domyslny.status_code == pierwszy.status_code == drugi.status_code == 200
    # Domyślny punkt = pierwszy z listy (deterministycznie), nie „jakiś".
    assert domyslny.content == pierwszy.content
    assert pierwszy.content != drugi.content
    assert punkty[1]["target_id"] in drugi.headers["content-disposition"]


def test_punkt_spoza_przebiegu_odmawia_z_powodem(client: TestClient) -> None:
    """Punkt, którego bieg nie policzył, nie jest ofertą — odmowa zamiast zmyślenia."""
    case_id = str(uuid4())
    _seed_enm(case_id)
    run_id = _wykonaj_bieg(client, case_id, "SC_3F")

    response = client.get(
        f"/api/analysis-runs/{run_id}/pakiet-dowodowy",
        params={"punkt": "wezel-ktorego-nie-ma"},
    )

    assert response.status_code == 422
    assert "wezel-ktorego-nie-ma" in response.json()["detail"]


# ---------------------------------------------------------------------------
# Determinizm
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("analysis_type", ["SC_3F", "SC_2F_G"])
def test_pakiet_jest_deterministyczny_bajt_w_bajt(client: TestClient, analysis_type: str) -> None:
    """Ten sam przebieg i punkt → identyczny plik (reguła determinizmu).

    Pin obejmuje OBA rodzaje pakietu — znacznik czasu dowodu bierze się z biegu,
    nie z zegara serwera, więc powtórzenie nie może dać innych bajtów.
    """
    case_id = str(uuid4())
    _seed_enm(case_id)
    run_id = _wykonaj_bieg(client, case_id, analysis_type)

    pierwszy = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy")
    drugi = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy")

    assert pierwszy.status_code == drugi.status_code == 200
    assert pierwszy.content == drugi.content


def test_nazwa_pliku_i_manifest_bez_oznaczen_roboczych(client: TestClient) -> None:
    """Eksport nie niesie roboczych oznaczeń projektu (CLAUDE.md reguła 8).

    Deklaracja z docstringów `pakiet_biegu`/`equipment_proof` dostaje strażnika:
    ani nazwa pobieranego pliku, ani wykaz plików nie mogą zawierać oznaczeń
    roboczych typu „P12" (guard kodenamów skanuje wyłącznie interfejs).
    """
    import re

    case_id = str(uuid4())
    _seed_enm(case_id)
    run_id = _wykonaj_bieg(client, case_id, "SC_3F")

    response = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy")
    assert response.status_code == 200

    # Wzorzec SZERSZY niż w guardzie kodenamów: `\b` nie odcina `P14_STEP_001`,
    # bo podkreślenie jest znakiem słowa — a właśnie w identyfikatorach kroków
    # oznaczenie robocze siedziało latami w POBIERANYM dowodzie. Sprawdzone
    # iniekcją: wzorzec z `\b` przepuszczał przywrócony prefiks roboczy.
    wzorzec = re.compile(r"(?<![A-Za-z0-9])[pP](?!0(?![0-9]))\d+(?![0-9])")
    assert not wzorzec.search(response.headers["content-disposition"])
    with zipfile.ZipFile(io.BytesIO(response.content)) as archiwum:
        manifest = archiwum.read("proof_pack/manifest.json").decode("utf-8")
    assert not wzorzec.search(manifest)


# ---------------------------------------------------------------------------
# Pakiet ROZPŁYWU MOCY (karta PACK-ROZPLYW)
# ---------------------------------------------------------------------------

#: Wielomian ZIP „stała impedancja" — model odbioru, przy którym moc FAKTYCZNIE
#: wstrzyknięta różni się od mocy zadanej w modelu (skaluje się z napięciem).
_ZIP_STALA_IMPEDANCJA = {
    "a_p": 1.0,
    "b_p": 0.0,
    "c_p": 0.0,
    "a_q": 1.0,
    "b_q": 0.0,
    "c_q": 0.0,
    "v0_pu": 1.0,
}


def _seed_enm_rozplyw(
    case_id: str,
    *,
    falowniki: bool = False,
    zip_model: bool = False,
    oltc: bool = False,
) -> None:
    """Sieć 110/15 kV pod rozpływ: GPZ → transformator → linia SN → odbiór.

    Trzy przełączniki odpowiadają trzem torom, którymi ``_execute_power_flow``
    zmienia moc FAKTYCZNIE wstrzykniętą wobec mocy zadanej w modelu:
    regulacja falownika (Q(U)/cosφ), wielomian ZIP odbioru oraz automatyczna
    regulacja zaczepów. Każdy z nich musi dać ten sam domknięty bilans w dowodzie
    — inaczej dowód czytałby model zamiast wyniku.
    """
    from enm.models import EnergyNetworkModel
    from enm.store import set_enm

    transformator = {
        "id": "00000000-0000-0000-0000-000000000610",
        "ref_id": "tr-gpz",
        "name": "TR 110/15",
        "tags": [],
        "meta": {},
        "hv_bus_ref": "b-wn",
        "lv_bus_ref": "b-sn",
        "sn_mva": 25.0,
        "uhv_kv": 110.0,
        "ulv_kv": 15.0,
        "uk_percent": 12.0,
        "pk_kw": 120.0,
        "catalog_ref": "tr-wn-sn-110-15-25mva-yd11",
        "catalog_namespace": "TRAFO_SN_NN",
    }
    if oltc:
        transformator["tap_changer"] = {
            "regulation_type": "OLTC",
            "regulated_winding": "HV",
            "neutral_position": 0,
            "current_position": 0,
            "min_position": -9,
            "max_position": 9,
            "step_percent": 1.25,
            "control_mode": "AUTOMATIC",
            "voltage_setpoint_kv": 15.5,
            "deadband_kv": 0.2,
            "controlled_bus_ref": "b-sn",
            "catalog_ref": "tc_oltc_110sn_19_125",
        }

    odbior = {
        "id": "00000000-0000-0000-0000-000000000620",
        "ref_id": "load-sn",
        "name": "Odbior SN",
        "tags": [],
        "meta": {},
        "bus_ref": "b-odbior",
        "p_mw": 6.0,
        "q_mvar": 2.0,
        "model": "zip" if zip_model else "pq",
    }
    if zip_model:
        odbior["materialized_params"] = dict(_ZIP_STALA_IMPEDANCJA)

    # Falownik jest elementem nN (walidator ENM tego pilnuje), więc wariant z
    # regulacją dokłada szynę nN i transformator blokowy — tak, jak w modelu
    # rzeczywistego przyłączenia OZE.
    szyna_nn = {
        "id": "00000000-0000-0000-0000-000000000605",
        "ref_id": "b-nn",
        "name": "Szyna nN PV",
        "tags": [],
        "meta": {},
        "voltage_kv": 0.4,
        "phase_system": "3ph",
    }
    transformator_blokowy = {
        "id": "00000000-0000-0000-0000-000000000612",
        "ref_id": "tr-pv",
        "name": "TR blokowy PV",
        "tags": [],
        "meta": {},
        "hv_bus_ref": "b-odbior",
        "lv_bus_ref": "b-nn",
        "sn_mva": 2.5,
        "uhv_kv": 15.0,
        "ulv_kv": 0.4,
        "uk_percent": 6.0,
        "pk_kw": 20.0,
        "catalog_ref": "tr-sn-nn-15-04-2p5mva-dyn5",
        "catalog_namespace": "TRAFO_SN_NN",
    }
    falownik = {
        "id": "00000000-0000-0000-0000-000000000630",
        "ref_id": "pv-1",
        "name": "Farma PV",
        "tags": [],
        # Regulacja REALNIE aktywna (cosφ ≠ 1) — inaczej tor konwertera nie
        # zostałby w ogóle zbudowany i cecha byłaby pozorna.
        "meta": {"control_mode": "STALY_COS_PHI", "cos_phi": 0.95},
        "bus_ref": "b-nn",
        "p_mw": 2.0,
        "q_mvar": 0.0,
        "gen_type": "pv_inverter",
        "connection_variant": "block_transformer",
        "blocking_transformer_ref": "tr-pv",
    }

    set_enm(
        case_id,
        EnergyNetworkModel.model_validate(
            {
                "header": {
                    "name": "Pakiet dowodowy rozpływu",
                    "enm_version": "1.0",
                    "defaults": {"frequency_hz": 50, "unit_system": "SI"},
                    "created_at": "2024-01-01T00:00:00Z",
                    "updated_at": "2024-01-01T00:00:00Z",
                    "revision": 1,
                    "hash_sha256": "",
                },
                "buses": [
                    {
                        "id": "00000000-0000-0000-0000-000000000601",
                        "ref_id": "b-wn",
                        "name": "110 kV",
                        "tags": [],
                        "meta": {},
                        "voltage_kv": 110,
                        "phase_system": "3ph",
                    },
                    {
                        "id": "00000000-0000-0000-0000-000000000602",
                        "ref_id": "b-sn",
                        "name": "Szyna SN",
                        "tags": [],
                        "meta": {},
                        "voltage_kv": 15,
                        "phase_system": "3ph",
                    },
                    {
                        "id": "00000000-0000-0000-0000-000000000603",
                        "ref_id": "b-odbior",
                        "name": "Szyna odbioru",
                        "tags": [],
                        "meta": {},
                        "voltage_kv": 15,
                        "phase_system": "3ph",
                    },
                ]
                + ([szyna_nn] if falowniki else []),
                "branches": [
                    {
                        "id": "00000000-0000-0000-0000-000000000611",
                        "ref_id": "ln-sn",
                        "name": "Linia SN",
                        "tags": [],
                        "meta": {},
                        "from_bus_ref": "b-sn",
                        "to_bus_ref": "b-odbior",
                        "status": "closed",
                        "type": "line_overhead",
                        "length_km": 5.0,
                        "r_ohm_per_km": 0.3,
                        "x_ohm_per_km": 0.4,
                        "catalog_ref": "LINIA_SN:reczne",
                        "catalog_namespace": "LINIA_SN",
                    }
                ],
                "transformers": [transformator] + ([transformator_blokowy] if falowniki else []),
                "sources": [
                    {
                        "id": "00000000-0000-0000-0000-000000000604",
                        "tags": [],
                        "meta": {},
                        **gpz_source_record(
                            ref_id="src-gpz",
                            name="Zasilanie GPZ",
                            bus_ref="b-wn",
                            voltage_kv=110.0,
                            sk3_mva=3000.0,
                            rx_ratio=0.10,
                        ),
                    }
                ],
                "loads": [odbior],
                "generators": [falownik] if falowniki else [],
                "shunt_capacitors": [],
                "substations": [],
                "bays": [],
                "junctions": [],
                "corridors": [],
                "measurements": [],
                "protection_assignments": [],
                "branch_points": [],
            }
        ),
    )


def _seed_enm_rozplyw_bez_odcinkow(case_id: str) -> None:
    """Sieć 110/15 kV BEZ ani jednej linii i ani jednego kabla (GPZ → TR → odbiór).

    Cecha brzegowa pakietu zbiorczego: bilans mocy i straty opisują całą sieć i
    NALEŻĄ SIĘ projektantowi także wtedy, gdy nie ma czego udokumentować dowodem
    spadku napięcia. Bez tej sieci nic nie pilnowałoby, że brak odcinków nie
    odbiera całego pakietu (rodzaj rozpływu ma punkt NIEOBOWIĄZKOWY).
    """
    from enm.models import EnergyNetworkModel
    from enm.store import set_enm

    set_enm(
        case_id,
        EnergyNetworkModel.model_validate(
            {
                "header": {
                    "name": "Rozpływ bez odcinków",
                    "enm_version": "1.0",
                    "defaults": {"frequency_hz": 50, "unit_system": "SI"},
                    "created_at": "2024-01-01T00:00:00Z",
                    "updated_at": "2024-01-01T00:00:00Z",
                    "revision": 1,
                    "hash_sha256": "",
                },
                "buses": [
                    {
                        "id": "00000000-0000-0000-0000-000000000701",
                        "ref_id": "b-wn",
                        "name": "110 kV",
                        "tags": [],
                        "meta": {},
                        "voltage_kv": 110,
                        "phase_system": "3ph",
                    },
                    {
                        "id": "00000000-0000-0000-0000-000000000702",
                        "ref_id": "b-sn",
                        "name": "Szyna SN",
                        "tags": [],
                        "meta": {},
                        "voltage_kv": 15,
                        "phase_system": "3ph",
                    },
                ],
                "branches": [],
                "transformers": [
                    {
                        "id": "00000000-0000-0000-0000-000000000710",
                        "ref_id": "tr-gpz",
                        "name": "TR 110/15",
                        "tags": [],
                        "meta": {},
                        "hv_bus_ref": "b-wn",
                        "lv_bus_ref": "b-sn",
                        "sn_mva": 25.0,
                        "uhv_kv": 110.0,
                        "ulv_kv": 15.0,
                        "uk_percent": 12.0,
                        "pk_kw": 120.0,
                        "catalog_ref": "tr-wn-sn-110-15-25mva-yd11",
                        "catalog_namespace": "TRAFO_SN_NN",
                    }
                ],
                "sources": [
                    {
                        "id": "00000000-0000-0000-0000-000000000704",
                        "tags": [],
                        "meta": {},
                        **gpz_source_record(
                            ref_id="src-gpz",
                            name="Zasilanie GPZ",
                            bus_ref="b-wn",
                            voltage_kv=110.0,
                            sk3_mva=3000.0,
                            rx_ratio=0.10,
                        ),
                    }
                ],
                "loads": [
                    {
                        "id": "00000000-0000-0000-0000-000000000720",
                        "ref_id": "load-sn",
                        "name": "Odbior SN",
                        "tags": [],
                        "meta": {},
                        "bus_ref": "b-sn",
                        "p_mw": 6.0,
                        "q_mvar": 2.0,
                    }
                ],
                "generators": [],
                "shunt_capacitors": [],
                "substations": [],
                "bays": [],
                "junctions": [],
                "corridors": [],
                "measurements": [],
                "protection_assignments": [],
                "branch_points": [],
            }
        ),
    )


def _artefakt_biegu(run_id: str) -> dict:
    """Zamrożony artefakt wyniku biegu — ŹRÓDŁO ODNIESIENIA dla asercji.

    Czytamy go z magazynu biegów, a nie z pakietu: pin ma porównać dowód z tym,
    co ZAPISAŁ tor obliczeniowy, więc obie strony porównania nie mogą pochodzić
    z tego samego pliku.
    """
    from uuid import UUID

    from enm.canonical_analysis import get_run

    run = get_run(UUID(run_id))
    assert run is not None and run.raw_result is not None
    return run.raw_result


def _dowod_z_pakietu(content: bytes) -> dict:
    with zipfile.ZipFile(io.BytesIO(content)) as archiwum:
        return json.loads(archiwum.read("proof_pack/proof.json").decode("utf-8"))


def _podpakiet(content: bytes, nazwa: str) -> bytes:
    """Zagnieżdżony pakiet ZBIORCZY (``pakiet_dowodowy/<nazwa>.zip``)."""
    with zipfile.ZipFile(io.BytesIO(content)) as archiwum:
        return archiwum.read(f"pakiet_dowodowy/{nazwa}.zip")


def _dowod_z_pakietu_zbiorczego(content: bytes, nazwa: str) -> dict:
    """Dowód spod wskazanej pozycji pakietu zbiorczego (rozpływ / straty / spadek)."""
    return _dowod_z_pakietu(_podpakiet(content, nazwa))


def _wezel_id_po_element_id(wezly: dict, element_id: str) -> str:
    """ID węzła GRAFU (klucz ``node_voltage_kv``) po referencji ``element_id``.

    Karta P0.5b: nagłówek dowodu (``source_bus``/``target_bus``) opisuje ŁAŃCUCH
    od źródła do punktu — może obejmować WIELE odcinków (i granicę
    transformatora), więc nie da się już znaleźć „dokładnie jednej gałęzi"
    łączącej oba końce wprost. Odwrotne wyszukanie po ``element_id`` działa dla
    łańcucha DOWOLNEJ długości.
    """
    for id_wezla, opis in wezly.items():
        if opis.get("element_id") == element_id:
            return id_wezla
    raise AssertionError(f"Węzeł o element_id='{element_id}' nie istnieje w grafie biegu.")


#: ILOCZYN CECH MODELU: 2 (falowniki) × 2 (ZIP) × 2 (zaczepy). Każda trójka
#: prowadzi do INNYCH liczb w wyniku — sprawdzone pomiarem, nie założeniem.
_WARIANTY_ROZPLYWU = [
    pytest.param(f, z, o, id=f"falowniki={int(f)}-zip={int(z)}-zaczepy={int(o)}")
    for f in (False, True)
    for z in (False, True)
    for o in (False, True)
]


@pytest.mark.parametrize(("falowniki", "zip_model", "oltc"), _WARIANTY_ROZPLYWU)
def test_pakiet_rozplywu_powstaje_dla_kazdej_kombinacji_cech_modelu(
    client: TestClient, falowniki: bool, zip_model: bool, oltc: bool
) -> None:
    """Pakiet rozpływu jest dostępny i pobieralny w KAŻDEJ kombinacji cech.

    Dług PACK-DOWODY-DLUG-ROZPLYW brzmiał: „podpięcie wymaga odtworzenia wejść
    solvera PF z biegu (tor niesie regulacje falowników, ZIP i OLTC)". Ten pin
    pokazuje, że odtwarzanie WEJŚĆ było niepotrzebne — dowód opisuje WYNIK, a
    wynik bieg już zapisał; dlatego żadna z tych cech nie odbiera pakietu.
    """
    case_id = str(uuid4())
    _seed_enm_rozplyw(case_id, falowniki=falowniki, zip_model=zip_model, oltc=oltc)
    run_id = _wykonaj_bieg(client, case_id, "LOAD_FLOW")

    dostepnosc = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy/dostepnosc")
    assert dostepnosc.status_code == 200, dostepnosc.text
    payload = dostepnosc.json()
    assert payload["dostepny"] is True, payload["powod_pl"]
    assert payload["rodzaj"] == "ROZPLYW_MOCY"
    assert payload["rodzaj_pl"]
    assert payload["powod_pl"] is None
    # Punktem pakietu rozpływu jest ODCINEK linii/kabla (karta PACK-BEZ-KONSUMENTA).
    # Ta sieć ma linię SN, więc lista nie może być pusta — a etykieta wyboru musi
    # przyjść z serwera, bo to on wie, co użytkownik wybiera.
    assert payload["punkty"], "bieg rozpływu z linią SN ma odcinek do udokumentowania"
    assert all(p["target_id"] and p["nazwa"] for p in payload["punkty"])
    assert payload["punkty_etykieta_pl"] == "Odcinek dla spadku napięcia"
    assert payload["zawartosc_pl"]

    pakiet = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy")
    assert pakiet.status_code == 200, pakiet.text
    assert pakiet.headers["content-type"] == "application/zip"
    # Pakiet przebiegu rozpływu jest ZBIORCZY: bilans, straty i spadek napięcia.
    assert _wpisy_zip(pakiet.content) == {
        "pakiet_dowodowy/rozplyw.zip",
        "pakiet_dowodowy/straty.zip",
        "pakiet_dowodowy/spadek_napiecia.zip",
    }
    for nazwa in ("rozplyw", "straty", "spadek_napiecia"):
        wpisy = _wpisy_zip(_podpakiet(pakiet.content, nazwa))
        assert "proof_pack/proof.json" in wpisy, nazwa
        assert "proof_pack/proof.tex" in wpisy, nazwa
        assert "proof_pack/manifest.json" in wpisy, nazwa
        assert "proof_pack/signature.json" in wpisy, nazwa


@pytest.mark.parametrize(("falowniki", "zip_model", "oltc"), _WARIANTY_ROZPLYWU)
def test_bilans_w_dowodzie_domyka_sie_dla_kazdej_kombinacji_cech(
    client: TestClient, falowniki: bool, zip_model: bool, oltc: bool
) -> None:
    """Dowód czyta moc WSTRZYKNIĘTĄ przez solver, a nie moc zadaną w modelu.

    To jest ostrze tego iloczynu cech. Na szynie z wielomianem ZIP albo z
    regulacją falownika moc faktycznie wstrzyknięta RÓŻNI SIĘ od zadanej w
    modelu (dla wariantu ZIP: 5,23 MW wobec 6,00 MW zadanych — zmierzone).
    Gdyby wejście dowodu składano z modelu, bilans domknąłby się wyłącznie w
    wariancie bez ZIP i bez regulacji, a pozostałe siedem pokazałoby projektantowi
    fałszywą różnicę rzędu 0,7 MW.
    """
    case_id = str(uuid4())
    _seed_enm_rozplyw(case_id, falowniki=falowniki, zip_model=zip_model, oltc=oltc)
    run_id = _wykonaj_bieg(client, case_id, "LOAD_FLOW")

    pakiet = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy")
    assert pakiet.status_code == 200, pakiet.text
    dowod = _dowod_z_pakietu_zbiorczego(pakiet.content, "rozplyw")

    assert dowod["summary"]["key_results"]["converged"]["value"] == 1.0
    assert dowod["summary"]["overall_status"] == "PASS", dowod["summary"]["warnings"]

    reszty = {
        krok["result"]["source_key"]: abs(krok["result"]["value"])
        for krok in dowod["steps"]
        if krok["result"]["source_key"] in {"p_balance_mw", "q_balance_mvar"}
    }
    assert set(reszty) == {"p_balance_mw", "q_balance_mvar"}
    assert reszty["p_balance_mw"] < 1e-6, reszty
    assert reszty["q_balance_mvar"] < 1e-6, reszty


@pytest.mark.parametrize(("falowniki", "zip_model", "oltc"), _WARIANTY_ROZPLYWU)
def test_pakiet_rozplywu_jest_deterministyczny_bajt_w_bajt(
    client: TestClient, falowniki: bool, zip_model: bool, oltc: bool
) -> None:
    """Dwa pobrania tego samego przebiegu = identyczny plik, w każdym wariancie.

    Znacznik dowodu bierze się z PRZEBIEGU, a tożsamość artefaktu z tożsamości
    pakietu — dlatego powtórzenie nie może dać innych bajtów (i dlatego
    ``from_power_flow_result`` nie wolno było zostawić z ``datetime.utcnow()``).
    """
    case_id = str(uuid4())
    _seed_enm_rozplyw(case_id, falowniki=falowniki, zip_model=zip_model, oltc=oltc)
    run_id = _wykonaj_bieg(client, case_id, "LOAD_FLOW")

    pierwszy = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy")
    drugi = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy")

    assert pierwszy.status_code == drugi.status_code == 200
    assert pierwszy.content == drugi.content


def test_rozne_cechy_modelu_daja_rozne_pakiety(client: TestClient) -> None:
    """Cechy modelu realnie sterują treścią dowodu (a nie tylko nazwą pliku).

    Bez tego pinu poprzednie testy przechodziłyby także wtedy, gdyby pakiet
    ignorował wynik i zawsze pisał to samo.
    """
    pakiety = []
    for zip_model in (False, True):
        case_id = str(uuid4())
        _seed_enm_rozplyw(case_id, zip_model=zip_model)
        run_id = _wykonaj_bieg(client, case_id, "LOAD_FLOW")
        odpowiedz = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy")
        assert odpowiedz.status_code == 200, odpowiedz.text
        pakiety.append(_dowod_z_pakietu_zbiorczego(odpowiedz.content, "rozplyw"))

    bez_zip, z_zip = pakiety
    assert (
        bez_zip["summary"]["key_results"]["p_losses_mw"]["value"]
        != z_zip["summary"]["key_results"]["p_losses_mw"]["value"]
    )


def test_bieg_niezbiezny_daje_pakiet_ktory_MOWI_o_braku_zbieznosci(
    client: TestClient,
) -> None:
    """Bieg bez zbieżności nie jest ukrywany — dowód nazywa rzecz po imieniu.

    Odmowa byłaby tu gorsza od dowodu: projektant potrzebuje udokumentowanego
    śladu nieudanego obliczenia. Kłamstwem byłoby dopiero podanie takiego dowodu
    jako poprawnego — dlatego krok zbieżności kończy się niepowodzeniem, a
    podsumowanie niesie ostrzeżenie.
    """
    case_id = str(uuid4())
    _seed_enm_rozplyw(case_id)
    run_id = _wykonaj_bieg(client, case_id, "LOAD_FLOW", {"max_iterations": 1})

    dostepnosc = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy/dostepnosc").json()
    assert dostepnosc["dostepny"] is True

    pakiet = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy")
    assert pakiet.status_code == 200, pakiet.text
    dowod = _dowod_z_pakietu_zbiorczego(pakiet.content, "rozplyw")

    assert dowod["summary"]["key_results"]["converged"]["value"] == 0.0
    assert dowod["summary"]["overall_status"] != "PASS"
    assert any("zbieżności" in ostrzezenie for ostrzezenie in dowod["summary"]["warnings"])


def test_bieg_rozplywu_bez_wyniku_nie_ma_pakietu_z_powodem_po_polsku(
    client: TestClient,
) -> None:
    """Bieg utworzony, ale niewykonany: pakietu nie ma i brama mówi dlaczego.

    Cecha „bieg bez wyniku" nie przechodzi przez tor wykonawczy HTTP (ten zawsze
    wykonuje), więc bieg zostaje w stanie utworzonym — to jest realny stan bazy,
    nie spreparowana fikstura.
    """
    from enm.canonical_analysis import create_run

    case_id = str(uuid4())
    _seed_enm_rozplyw(case_id)
    run = create_run(case_id=case_id, analysis_type="PF")

    dostepnosc = client.get(f"/api/analysis-runs/{run.id}/pakiet-dowodowy/dostepnosc")
    assert dostepnosc.status_code == 200, dostepnosc.text
    payload = dostepnosc.json()
    assert payload["dostepny"] is False
    # Rodzaj jest znany mimo braku wyniku — brak dotyczy DANYCH, nie rodzaju.
    assert payload["rodzaj"] == "ROZPLYW_MOCY"
    assert "nie zakończył się wynikiem" in payload["powod_pl"]

    pobranie = client.get(f"/api/analysis-runs/{run.id}/pakiet-dowodowy")
    assert pobranie.status_code == 422
    assert pobranie.json()["detail"] == payload["powod_pl"]


def test_odcinek_spoza_przebiegu_odmawia_zamiast_podstawic_pierwszy(
    client: TestClient,
) -> None:
    """Wskazanie, którego bieg nie zna, jest odmową — nie cichym podstawieniem.

    INTENCJA ZACHOWANA z pinu „punkt podany dla pakietu całej sieci odmawia
    zamiast go zignorować". Rodzaj rozpływu przyjmuje dziś ODCINEK (karta
    PACK-BEZ-KONSUMENTA), więc nośnikiem tej samej cechy jest odcinek spoza
    przebiegu: projektant, który poprosił o odcinek A, nie może dostać dokumentu
    o odcinku B ani dokumentu bez dowodu spadku.
    """
    case_id = str(uuid4())
    _seed_enm_rozplyw(case_id)
    run_id = _wykonaj_bieg(client, case_id, "LOAD_FLOW")

    odpowiedz = client.get(
        f"/api/analysis-runs/{run_id}/pakiet-dowodowy",
        params={"punkt": "jakis-odcinek"},
    )

    assert odpowiedz.status_code == 422
    assert "jakis-odcinek" in odpowiedz.json()["detail"]
    assert "wybierz odcinek z listy" in odpowiedz.json()["detail"]


def test_pakiet_rozplywu_bez_oznaczen_roboczych_w_CALEJ_zawartosci(
    client: TestClient,
) -> None:
    """Eksport bez nazw roboczych — sprawdzany na KAŻDYM pliku pakietu.

    Rozszerzenie klasy wobec pinu zwarciowego (tamten patrzył na nazwę pliku i
    wykaz): identyfikatory kroków dowodu też jadą do pobieranego ``proof.json``,
    a te przez lata niosły oznaczenie robocze karty.
    """
    import re

    case_id = str(uuid4())
    _seed_enm_rozplyw(case_id)
    run_id = _wykonaj_bieg(client, case_id, "LOAD_FLOW")

    odpowiedz = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy")
    assert odpowiedz.status_code == 200

    # Wzorzec SZERSZY niż w guardzie kodenamów: `\b` nie odcina `P14_STEP_001`,
    # bo podkreślenie jest znakiem słowa — a właśnie w identyfikatorach kroków
    # oznaczenie robocze siedziało latami w POBIERANYM dowodzie. Sprawdzone
    # iniekcją: wzorzec z `\b` przepuszczał przywrócony prefiks roboczy.
    wzorzec = re.compile(r"(?<![A-Za-z0-9])[pP](?!0(?![0-9]))\d+(?![0-9])")
    assert not wzorzec.search(odpowiedz.headers["content-disposition"])
    # Pakiet rozpływu jest ZBIORCZY, więc skan musi zejść do KAŻDEGO podpakietu —
    # inaczej oznaczenie robocze schowałoby się jedno piętro niżej niż pin patrzy.
    sprawdzone = 0
    for podpakiet in _wpisy_zip(odpowiedz.content):
        assert not wzorzec.search(podpakiet), podpakiet
        with zipfile.ZipFile(io.BytesIO(_podpakiet(odpowiedz.content, Path(podpakiet).stem))) as z:
            for nazwa in sorted(z.namelist()):
                if nazwa.endswith("/") or nazwa.endswith(".pdf"):
                    continue
                tresc = z.read(nazwa).decode("utf-8")
                znalezione = wzorzec.findall(tresc)
                assert not znalezione, (podpakiet, nazwa, sorted(set(znalezione))[:5])
                sprawdzone += 1
    # Zapadka na pusty zbiór: pin bez plików przechodziłby zawsze.
    assert sprawdzone >= 12, sprawdzone


# ---------------------------------------------------------------------------
# Straty i spadek napięcia w pakiecie zbiorczym (karta PACK-BEZ-KONSUMENTA)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(("falowniki", "zip_model", "oltc"), _WARIANTY_ROZPLYWU)
def test_dowod_strat_zgadza_sie_z_wynikiem_biegu_w_kazdym_wariancie(
    client: TestClient, falowniki: bool, zip_model: bool, oltc: bool
) -> None:
    """Straty w dowodzie to straty Z WYNIKU, a nie policzone po raz drugi.

    Ostrze iloczynu cech: regulacja falownika, wielomian ZIP i zaczepy zmieniają
    moc faktycznie wstrzykniętą, więc zmieniają też straty. Gdyby dowód składał
    je z modelu albo liczył od nowa, rozjechałby się z tabelą wyników w co
    najmniej siedmiu z ośmiu wariantów.
    """
    case_id = str(uuid4())
    _seed_enm_rozplyw(case_id, falowniki=falowniki, zip_model=zip_model, oltc=oltc)
    run_id = _wykonaj_bieg(client, case_id, "LOAD_FLOW")

    pakiet = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy")
    assert pakiet.status_code == 200, pakiet.text
    dowod = _dowod_z_pakietu_zbiorczego(pakiet.content, "straty")

    podsumowanie = _artefakt_biegu(run_id)["result_v1"]["summary"]
    kluczowe = dowod["summary"]["key_results"]

    assert kluczowe["p_losses_total_mw"]["value"] == pytest.approx(
        podsumowanie["total_losses_p_mw"], abs=1e-12
    )
    assert kluczowe["q_losses_total_mvar"]["value"] == pytest.approx(
        podsumowanie["total_losses_q_mvar"], abs=1e-12
    )
    assert kluczowe["branch_count"]["value"] >= 1.0


@pytest.mark.parametrize(
    ("etykieta", "seed"),
    [
        # ILOCZYN CECH podstawy odniesienia: początek odcinka NA napięciu
        # znamionowym (kabel od szyny bilansującej) oraz PONIŻEJ niego (szyna SN
        # za transformatorem). Druga sieć jest tu konieczna — pierwszy pomiar tej
        # karty wypadł tylko na pierwszej i wyglądał na dowód pełnej zgodności.
        ("poczatek na napieciu znamionowym", "_seed_enm"),
        ("poczatek ponizej napiecia znamionowego", "_seed_enm_rozplyw"),
    ],
)
def test_spadek_z_dowodu_zgadza_sie_ze_spadkiem_policzonym_przez_solver(
    client: TestClient, etykieta: str, seed: str
) -> None:
    """ΔU_total (kV) z dowodu a ΔU z napięć węzłowych biegu — zgodność ZMIERZONA.

    Wzór dowodu PER ODCINEK (ΔU = (R·P + X·Q)/U_n²) jest klasycznym
    przybliżeniem: pomija składową poprzeczną, którą rozpływ zna dokładnie.
    Deklaracja z docstringu warstwy wiązania („sam spadek zgadza się z biegiem")
    MUSI mieć strażnika — inaczej byłaby fałszywą pewnością.

    Karta P0.5b: dowód jest teraz ŁAŃCUCHEM (może obejmować granicę
    transformatora, karta EQ_VDROP_010), więc porównanie idzie przez
    ``delta_u_total_kv`` (fizycznie spójna suma w kV — patrz EQ_VDROP_007,
    karta PODSTAWA-VDROP) — NIE przez ``delta_u_total_percent`` (prezentacyjne,
    może mieszać podstawy różnych odcinków łańcucha) ani przez rekonstrukcję z
    jednego wspólnego U_n (niepoprawne przy łańcuchu wielopodstawowym).

    Zmierzone: 0,4 V przy ΔU = 6,36 % (sieć 110/15 kV) i poniżej 0,001 V przy
    ΔU = 0,03 % (kabel SN). Próg 1 V wynika z tego pomiaru, nie z wygody:
    większy rozjazd znaczyłby, że dowód opisuje inny przebieg niż tabela wyników.
    """
    case_id = str(uuid4())
    globals()[seed](case_id)
    run_id = _wykonaj_bieg(client, case_id, "LOAD_FLOW")

    pakiet = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy")
    assert pakiet.status_code == 200, pakiet.text
    dowod = _dowod_z_pakietu_zbiorczego(pakiet.content, "spadek_napiecia")

    kluczowe = dowod["summary"]["key_results"]
    delta_u_total_kv_dowodu = kluczowe["delta_u_total_kv"]["value"]

    surowy = _artefakt_biegu(run_id)
    wezly = surowy["graph"]["nodes"]
    source_id = _wezel_id_po_element_id(wezly, dowod["header"]["source_bus"])
    target_id = _wezel_id_po_element_id(wezly, dowod["header"]["target_bus"])
    spadek_biegu_kv = surowy["node_voltage_kv"][source_id] - surowy["node_voltage_kv"][target_id]

    # Uwaga: ``delta_u_total_percent`` NIE MA tu sensownej granicy sanity —
    # przy łańcuchu krzyżującym transformator jego wkład % jest odniesiony do
    # napięcia WTÓRNEGO i zdominowany przez przekładnię (rząd setek %, nie
    # spadku wzdłużnego); to jest właśnie powód, dla którego forma % pozostaje
    # WYŁĄCZNIE prezentacyjna (karta PODSTAWA-VDROP/U4), a porównaniem fizycznym
    # jest ``delta_u_total_kv`` poniżej.
    assert abs(delta_u_total_kv_dowodu - spadek_biegu_kv) * 1000.0 < 1.0, (
        etykieta,
        delta_u_total_kv_dowodu,
        spadek_biegu_kv,
    )


@pytest.mark.parametrize(
    ("etykieta", "seed"),
    [
        # Ten sam iloczyn cech co w teście ΔU powyżej — i z TEGO SAMEGO powodu:
        # bez sieci, w której początek odcinka NIE stoi na U_n, mieszanie
        # podstaw krokowi EQ_VDROP_007 nic by nie kosztowało i naprawa
        # wyglądałaby na potwierdzoną, choć w rogu, który ją wywołał, nie
        # byłaby zmierzona wcale.
        ("poczatek na napieciu znamionowym", "_seed_enm"),
        ("poczatek ponizej napiecia znamionowego", "_seed_enm_rozplyw"),
    ],
)
def test_napiecie_konca_z_dowodu_zgadza_sie_z_napieciem_biegu_karta_podstawa_vdrop(
    client: TestClient, etykieta: str, seed: str
) -> None:
    """U z EQ_VDROP_007 (krok końcowy) a napięcie węzła KOŃCA z biegu — zgodność
    ZMIERZONA po naprawie karty PODSTAWA-VDROP (rozszerzonej na łańcuch kartą
    P0.5b).

    Przed naprawą krok mnożył ΔU_total% (odniesione do U_n) przez U_source —
    na sieci 110/15 kV dawało to 12,4 V rozjazdu wobec napięcia węzła z biegu.
    Karta P0.5b: dowód jest teraz ŁAŃCUCHEM (źródło = SLACK trasy, nie „początek
    JEDNEGO odcinka" — może obejmować granicę transformatora, EQ_VDROP_010), a
    ΔU_total_kV jest SUMĄ wkładów WSZYSTKICH kroków łańcucha — porównanie
    idzie więc po ``dowod["header"]``/``node_voltage_kv`` znalezionych po
    ``element_id`` (dowolna długość łańcucha), nie po „dokładnie jednej gałęzi".
    """
    case_id = str(uuid4())
    globals()[seed](case_id)
    run_id = _wykonaj_bieg(client, case_id, "LOAD_FLOW")

    pakiet = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy")
    assert pakiet.status_code == 200, pakiet.text
    dowod = _dowod_z_pakietu_zbiorczego(pakiet.content, "spadek_napiecia")
    kluczowe = dowod["summary"]["key_results"]

    u_kv_dowodu = kluczowe["u_kv"]["value"]
    delta_u_total_kv_dowodu = kluczowe["delta_u_total_kv"]["value"]

    surowy = _artefakt_biegu(run_id)
    wezly = surowy["graph"]["nodes"]
    source_id = _wezel_id_po_element_id(wezly, dowod["header"]["source_bus"])
    target_id = _wezel_id_po_element_id(wezly, dowod["header"]["target_bus"])
    u_poczatku_biegu = surowy["node_voltage_kv"][source_id]
    u_konca_biegu = surowy["node_voltage_kv"][target_id]

    # Podstawa dowodu (u_source_kv w kroku EQ_VDROP_007) MUSI być napięciem
    # POCZĄTKU łańcucha z TEGO SAMEGO biegu — inaczej rozjazd U_end mógłby
    # wynikać z podstawienia innej wielkości, nie z arytmetyki kroku.
    u_source_dowodu = kluczowe["u_kv"]["value"] + delta_u_total_kv_dowodu
    assert u_source_dowodu == pytest.approx(u_poczatku_biegu, abs=1e-9), (
        etykieta,
        "u_source kroku EQ_VDROP_007 musi pochodzić z napięcia POCZĄTKU biegu",
    )

    rozjazd_v = abs(u_kv_dowodu - u_konca_biegu) * 1000.0
    # Próg 1 V — ten sam, zmierzony próg co ΔU (patrz docstring): po naprawie
    # oba rozjazdy są tą samą liczbą z algebry powyżej, więc próg musi być
    # identyczny, nie „zwyczajowo mniejszy".
    assert rozjazd_v < 1.0, (
        etykieta,
        "rozjazd U_end po naprawie PODSTAWA-VDROP",
        u_kv_dowodu,
        u_konca_biegu,
        rozjazd_v,
    )
    # Zapadka na regresję do STAREJ (wadliwej) formy: sieć musi zawierać co
    # najmniej JEDEN węzeł POŚREDNI (za transformatorem), którego napięcie
    # rzeczywiste odbiega od znamionowego — inaczej mieszanie podstaw w starej
    # formie nic by nie kosztowało, a pomiar wyglądałby na potwierdzenie
    # naprawy bez faktycznego jej wykonania (ta sama lekcja co próg testu ΔU
    # powyżej). Węzeł „b-sn" (szyna SN, TUŻ ZA transformatorem 110/15 w sieci
    # `_seed_enm_rozplyw`) jest tym węzłem — jego napięcie z definicji NIE jest
    # dokładnie na U_n, bo transformator wnosi własny spadek (uk_percent).
    if seed == "_seed_enm_rozplyw":
        posredni_id = _wezel_id_po_element_id(wezly, "b-sn")
        u_posredniego = surowy["node_voltage_kv"][posredni_id]
        u_n_posredniego = wezly[posredni_id]["voltage_level"]
        assert abs(u_posredniego - u_n_posredniego) > 0.01, (
            "sieć musi mieć węzeł pośredni z U != U_n, inaczej pomiar nie dowodzi naprawy",
        )


def test_wskazany_odcinek_daje_inny_dowod_spadku_niz_domyslny(client: TestClient) -> None:
    """Wybór odcinka steruje TREŚCIĄ dowodu, a nie tylko nazwą pliku."""
    case_id = str(uuid4())
    _seed_enm(case_id)
    run_id = _wykonaj_bieg(client, case_id, "LOAD_FLOW")

    dostepnosc = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy/dostepnosc").json()
    assert dostepnosc["punkty"], dostepnosc
    odcinek = dostepnosc["punkty"][0]["target_id"]

    domyslny = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy")
    wskazany = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy", params={"punkt": odcinek})

    assert domyslny.status_code == wskazany.status_code == 200
    # Ta sieć ma jeden odcinek, więc wskazanie go WPROST musi dać ten sam plik —
    # inaczej „domyślny" znaczyłoby coś innego niż „pierwszy z listy".
    assert domyslny.content == wskazany.content

    dowod = _dowod_z_pakietu_zbiorczego(wskazany.content, "spadek_napiecia")
    assert dowod["header"]["source_bus"] == "bus-main"
    assert dowod["header"]["target_bus"] == "bus-odbior"


def test_rozplyw_bez_odcinkow_ma_pakiet_ale_bez_dowodu_spadku(client: TestClient) -> None:
    """Brak linii i kabli NIE odbiera projektantowi bilansu mocy ani strat.

    Zapadka na pusty zbiór po stronie danych: gdyby rodzaj rozpływu wymagał punktu
    tak jak rodzaje zwarciowe, ta sieć straciłaby CAŁY pakiet — a nie ma w niej
    nic wadliwego, po prostu nie ma czego udokumentować dowodem spadku.
    """
    case_id = str(uuid4())
    _seed_enm_rozplyw_bez_odcinkow(case_id)
    run_id = _wykonaj_bieg(client, case_id, "LOAD_FLOW")

    dostepnosc = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy/dostepnosc")
    assert dostepnosc.status_code == 200, dostepnosc.text
    payload = dostepnosc.json()
    assert payload["dostepny"] is True, payload["powod_pl"]
    assert payload["punkty"] == []
    # Uczciwy stan zerowy: powód braku dowodu spadku jest NAZWANY w opisie
    # zawartości, a nie przemilczany.
    assert any("Bez dowodu spadku napięcia" in poz for poz in payload["zawartosc_pl"])

    pakiet = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy")
    assert pakiet.status_code == 200, pakiet.text
    assert _wpisy_zip(pakiet.content) == {
        "pakiet_dowodowy/rozplyw.zip",
        "pakiet_dowodowy/straty.zip",
    }
    assert _dowod_z_pakietu_zbiorczego(pakiet.content, "straty")["summary"]["key_results"]


def test_trzy_dowody_pakietu_maja_ROZNE_tozsamosci_artefaktow(client: TestClient) -> None:
    """Dowody z jednego przebiegu nie mogą podawać się za ten sam artefakt.

    Bez rozróżnika w ziarnie identyfikatora wszystkie trzy dostałyby ten sam
    ``artifact_id`` i ``document_id`` — pakiet twierdziłby, że bilans, straty i
    spadek napięcia to jeden i ten sam dokument.
    """
    case_id = str(uuid4())
    _seed_enm_rozplyw(case_id)
    run_id = _wykonaj_bieg(client, case_id, "LOAD_FLOW")

    pakiet = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy")
    assert pakiet.status_code == 200, pakiet.text
    dowody = [
        _dowod_z_pakietu_zbiorczego(pakiet.content, nazwa)
        for nazwa in ("rozplyw", "straty", "spadek_napiecia")
    ]

    artefakty = {d["artifact_id"] for d in dowody}
    dokumenty = {d["document_id"] for d in dowody}
    assert len(artefakty) == 3, artefakty
    assert len(dokumenty) == 3, dokumenty
    # Znacznik czasu WSPÓLNY — wszystkie opisują ten sam przebieg.
    assert len({d["created_at"] for d in dowody}) == 1


def test_pakiet_zbiorczy_ze_wskazanym_odcinkiem_jest_deterministyczny(
    client: TestClient,
) -> None:
    """Dwa pobrania tego samego przebiegu i odcinka = identyczny plik."""
    case_id = str(uuid4())
    _seed_enm_rozplyw(case_id)
    run_id = _wykonaj_bieg(client, case_id, "LOAD_FLOW")
    odcinek = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy/dostepnosc").json()[
        "punkty"
    ][0]["target_id"]

    pierwszy = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy", params={"punkt": odcinek})
    drugi = client.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy", params={"punkt": odcinek})

    assert pierwszy.status_code == drugi.status_code == 200
    assert pierwszy.content == drugi.content


# ---------------------------------------------------------------------------
# Zamknięcie mapy rodzajów (deklaracja MUSI mieć strażnika)
# ---------------------------------------------------------------------------


def test_kazdy_rodzaj_pakietu_ma_wlasna_kontrole_danych() -> None:
    """Pin deklaracji „mapa jest ZAMKNIĘTA i pokrywa wszystkie rodzaje".

    Rodzaj dopisany do mapy pakietów bez kontroli danych byłby rodzajem, dla
    którego brama obiecuje pakiet, nie sprawdziwszy podstawy — i objawiłby się
    dopiero błędem serwera u projektanta.
    """
    from application.proof_engine import pakiet_biegu

    rodzaje = set(pakiet_biegu._RODZAJ_PAKIETU_PO_BIEGU.values())
    assert rodzaje, "mapa rodzajów nie może być pusta (zapadka na pusty zbiór)"
    assert set(pakiet_biegu._KONTROLA_DANYCH_RODZAJU) == rodzaje
    assert set(pakiet_biegu._RODZAJ_PL) == rodzaje
    # Rodzaje punktowe to PODZBIÓR rodzajów — nie druga, niezależna lista.
    assert pakiet_biegu._RODZAJE_Z_PUNKTEM <= rodzaje
    assert pakiet_biegu._RODZAJE_Z_ODCINKIEM <= rodzaje
    # Rodzaj nie może być jednocześnie „bez punktu nie ma pakietu" i „punkt opcjonalny".
    assert not (pakiet_biegu._RODZAJE_Z_PUNKTEM & pakiet_biegu._RODZAJE_Z_ODCINKIEM)
    # KAŻDY rodzaj deklaruje, czym jest jego punkt, i jak się ten wybór nazywa na
    # ekranie. Ta równość jest ZAPADKĄ: rodzaj opisujący wyłącznie całą sieć zapali
    # ten pin i wymusi świadomą decyzję (punkt albo jawna odmowa dla parametru),
    # zamiast cicho ignorować `punkt` przekazany przez klienta.
    assert pakiet_biegu._RODZAJE_Z_PUNKTEM | pakiet_biegu._RODZAJE_Z_ODCINKIEM == rodzaje
    assert set(pakiet_biegu._ETYKIETA_PUNKTU_PL) == rodzaje
