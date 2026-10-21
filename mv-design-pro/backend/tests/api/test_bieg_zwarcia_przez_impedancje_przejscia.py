"""Zwarcie przez impedancję przejścia Z_f — ścieżka projektanta przez HTTP (karta OD-14).

INTENCJA. Do partii integracji 10 tryb IMPEDANCE scenariusza zwarciowego był zaślepką:
kwalifikowalność blokowała bieg kodem `ELIG_BINDING_UNSUPPORTED_FAULT_IMPEDANCE`. Ten plik
ćwiczy całą drogę użytkownika na sieci ręcznej z sondy liczbowej meldunku (15 kV,
S″k = 250 MVA, R/X = 0,1; linia 5 km 0,206 + j0,35 Ω/km): scenariusz → kwalifikowalność →
bieg (kolejka wykonawcy) → wyniki → konfiguracja biegu na ekranie wyników → pakiet dowodowy
→ wkłady źródeł. Iloczyn cech:

  * tryb scenariusza {METALLIC, IMPEDANCE R_f, IMPEDANCE X_f, IMPEDANCE R_f + jX_f,
    IMPEDANCE Z_f = 0} × rodzaj {3F, 1F} — prąd z wyrocznią ręczną, flaga zakresu
    i artefakt biegu (bieg metaliczny i Z_f = 0 bajt w bajt bez śladu Z_f);
  * odmowa danych × wejście {scenariusz utworzony, scenariusz zmieniony, opcja biegu wprost,
    opcja Z_f w biegu niezwarciowym, żądanie wkładów, żądanie pakietu SC3F} — 422/409
    z `kod` i `dane`, zdanie bez identyfikatora;
  * konsument wyniku: pakiet dowodowy biegu (krok pętli, ostrzeżenie) i wkłady źródeł.
"""

from __future__ import annotations

import io
import json
import math
import zipfile
from typing import Any
from uuid import UUID

import pytest
from api.main import app
from fastapi.testclient import TestClient

from tests.catalog_test_helpers import gpz_source_record
from tests.utils.biegi import wykonaj_bieg

BASE_URL = "/api/execution"
UN_KV = 15.0
C_MAX = 1.1
SK_MVA = 250.0
RX_Q = 0.1
DLUGOSC_KM = 5.0
R_KM = 0.206
X_KM = 0.35

_ZQ_ABS = C_MAX * UN_KV**2 / SK_MVA
_XQ = _ZQ_ABS / math.sqrt(1.0 + RX_Q**2)
Z_Q = complex(RX_Q * _XQ, _XQ)
Z_L = complex(R_KM * DLUGOSC_KM, X_KM * DLUGOSC_KM)
Z_K = Z_Q + Z_L

#: Sonda ręczna meldunku: I″k3 metaliczne i przez R_f = 2 Ω na końcu linii.
IKSS_3F_METALICZNY_A = 3219.6918
IKSS_3F_RF2_A = 2292.4451


@pytest.fixture(scope="module")
def klient() -> Any:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def przypadek(klient: TestClient) -> str:
    from application.twin_key import zapomnij_migracje
    from enm.canonical_analysis import reset_canonical_runs
    from enm.store import reset_enm_store

    projekt = klient.post("/api/projects", json={"name": "Zwarcie przez impedancję"})
    assert projekt.status_code == 201, projekt.text
    przypadek = klient.post(
        "/api/study-cases",
        json={"project_id": projekt.json()["id"], "name": "Przypadek Z_f"},
    )
    assert przypadek.status_code == 201, przypadek.text
    case_id = str(przypadek.json()["id"])
    # Wzorzec `tests/test_fault_scenarios_run_integration.py`: magazyn i pamięć migracji
    # czyste PO utworzeniu przypadku, żeby pierwszy odczyt modelu przez klucz projektu
    # zaadoptował sieć zasianą pod kluczem przypadku.
    reset_canonical_runs()
    reset_enm_store()
    zapomnij_migracje()
    _zasiej_siec(case_id)
    return case_id


def _zasiej_siec(case_id: str) -> None:
    from enm.models import EnergyNetworkModel
    from enm.store import set_enm

    set_enm(
        case_id,
        EnergyNetworkModel.model_validate(
            {
                "header": {
                    "name": "Sieć sondy ręcznej",
                    "enm_version": "1.0",
                    "defaults": {"frequency_hz": 50, "unit_system": "SI"},
                    "created_at": "2024-01-01T00:00:00Z",
                    "updated_at": "2024-01-01T00:00:00Z",
                    "revision": 1,
                    "hash_sha256": "",
                },
                "buses": [
                    {
                        "id": "00000000-0000-0000-0000-000000000201",
                        "ref_id": "bus-main",
                        "name": "Szyna zasilania",
                        "tags": [],
                        "meta": {},
                        "voltage_kv": UN_KV,
                        "phase_system": "3ph",
                    },
                    {
                        "id": "00000000-0000-0000-0000-000000000202",
                        "ref_id": "bus-1",
                        "name": "Koniec linii",
                        "tags": [],
                        "meta": {},
                        "voltage_kv": UN_KV,
                        "phase_system": "3ph",
                    },
                ],
                "branches": [
                    {
                        "id": "00000000-0000-0000-0000-000000000203",
                        "ref_id": "linia-1",
                        "name": "Linia sondy",
                        "tags": [],
                        "meta": {},
                        "type": "line_overhead",
                        "from_bus_ref": "bus-main",
                        "to_bus_ref": "bus-1",
                        "status": "closed",
                        "catalog_ref": "LINIA_SN_TEST",
                        "parameter_source": "CATALOG",
                        "length_km": DLUGOSC_KM,
                        "r_ohm_per_km": R_KM,
                        "x_ohm_per_km": X_KM,
                        "b_siemens_per_km": 0.0,
                        "r0_ohm_per_km": 3 * R_KM,
                        "x0_ohm_per_km": 3 * X_KM,
                        "b0_siemens_per_km": 0.0,
                    }
                ],
                "sources": [
                    {
                        "id": "00000000-0000-0000-0000-000000000204",
                        "tags": [],
                        "meta": {},
                        **gpz_source_record(
                            ref_id="src-grid",
                            name="Zasilanie GPZ",
                            bus_ref="bus-main",
                            voltage_kv=UN_KV,
                            sk3_mva=SK_MVA,
                            rx_ratio=RX_Q,
                            # Z0 źródła (Z0/Z1 = 3) — zwarcie doziemne dostępne w modelu.
                            extra={"z0_z1_ratio": 3.0},
                        ),
                    }
                ],
                "transformers": [],
                "loads": [],
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


def _utworz_scenariusz(
    klient: TestClient,
    case_id: str,
    *,
    fault_type: str = "SC_3F",
    impedancja: dict[str, float] | None = None,
) -> Any:
    tresc: dict[str, Any] = {
        "name": f"Zwarcie {fault_type} {impedancja}",
        "fault_type": fault_type,
        "location": {"element_ref": "bus-1", "location_type": "BUS", "position": None},
        # Scalenie partii 10 i 11: scenariusz jest jedynym nośnikiem c (MAX → c_max tabeli 1
        # IEC 60909-0 dla pasma węzła; 15 kV → 1,10, wyrocznia ręczna `C_MAX`).
        "config": {"scenariusz": "MAX"},
    }
    if impedancja is not None:
        tresc["fault_mode"] = "IMPEDANCE"
        tresc["fault_impedance"] = impedancja
    return klient.post(f"{BASE_URL}/study-cases/{case_id}/fault-scenarios", json=tresc)


def _bieg_ze_scenariusza(
    klient: TestClient, case_id: str, **kwargs: Any
) -> tuple[str, dict[str, Any]]:
    scenariusz = _utworz_scenariusz(klient, case_id, **kwargs)
    assert scenariusz.status_code == 201, scenariusz.text
    sid = scenariusz.json()["scenario_id"]
    kwalifikacja = klient.get(f"{BASE_URL}/fault-scenarios/{sid}/eligibility").json()
    assert kwalifikacja["status"] == "ELIGIBLE", kwalifikacja
    assert all(
        "UNSUPPORTED_FAULT_IMPEDANCE" not in blokada.get("code", "")
        for blokada in kwalifikacja.get("blockers", [])
    )
    bieg = klient.post(f"{BASE_URL}/fault-scenarios/{sid}/runs", json={})
    assert bieg.status_code == 201, bieg.text
    run_id = bieg.json()["id"]
    koniec = wykonaj_bieg(klient, run_id)
    assert koniec.json()["status"] == "DONE", koniec.json()
    from enm.canonical_analysis import get_run

    run = get_run(UUID(run_id))
    assert run is not None and run.raw_result is not None
    return run_id, run.raw_result


def _wiersz_konca_linii(raw: dict[str, Any]) -> dict[str, Any]:
    """Wiersz zwarcia w węźle „bus-1" (koniec linii) — przez graf biegu, nie po pozycji."""
    wezly = [
        wezel_id
        for wezel_id, wezel in raw["graph"]["nodes"].items()
        if wezel["element_id"] == "bus-1"
    ]
    assert len(wezly) == 1, raw["graph"]["nodes"]
    wiersze = [w for w in raw["results"] if w["fault_node_id"] == wezly[0]]
    assert len(wiersze) == 1, [w.get("fault_node_id") for w in raw["results"]]
    return dict(wiersze[0])


#: Pola wiersza wiążące go z TOŻSAMOŚCIĄ biegu (hash wejścia biegu), nie z fizyką: bieg
#: METALLIC i bieg IMPEDANCE z Z_f = 0 to dwa różne biegi (różne scenariusze, różne opcje),
#: więc ich referencje dowodu różnią się z definicji; parytet kontraktu §1 dotyczy fizyki.
_POLA_TOZSAMOSCI_BIEGU = ("proof_ref", "proof_binding")


def _fizyka_wierszy(raw: dict[str, Any]) -> str:
    return json.dumps(
        [
            {k: v for k, v in wiersz.items() if k not in _POLA_TOZSAMOSCI_BIEGU}
            for wiersz in raw["results"]
        ],
        sort_keys=True,
        default=str,
    )


def _zespolona(wartosc: dict[str, float]) -> complex:
    return complex(wartosc["re"], wartosc["im"])


# ---------------------------------------------------------------------------
# Tryb × rodzaj: prąd, flaga, artefakt
# ---------------------------------------------------------------------------


def _petla(rodzaj: str, z_f: complex) -> tuple[complex, float]:
    """Wyrocznia ręczna pętli i współczynnika napięcia (Z_2 = Z_1, Z_0 sieci promieniowej
    — tylko dla 3F wartość jest liczona ręcznie, 1F porównujemy z rdzeniem wprost)."""
    assert rodzaj == "SC_3F"
    return Z_K + z_f, 1.0 / math.sqrt(3.0)


@pytest.mark.parametrize(
    ("impedancja", "z_f"),
    [
        ({"r_f_ohm": 2.0, "x_f_ohm": 0.0}, complex(2.0, 0.0)),
        ({"r_f_ohm": 0.0, "x_f_ohm": 1.5}, complex(0.0, 1.5)),
        ({"r_f_ohm": 2.0, "x_f_ohm": 1.5}, complex(2.0, 1.5)),
    ],
    ids=["rezystancja", "reaktancja", "zespolona"],
)
def test_bieg_3f_przez_impedancje_przejscia_z_wyrocznia_reczna(
    klient: TestClient, przypadek: str, impedancja: dict[str, float], z_f: complex
) -> None:
    run_id, raw = _bieg_ze_scenariusza(klient, przypadek, impedancja=impedancja)
    wiersz = _wiersz_konca_linii(raw)
    petla, wsp = _petla("SC_3F", z_f)
    oczekiwany = C_MAX * UN_KV * 1000.0 * wsp / abs(petla)
    assert wiersz["ikss_a"] == pytest.approx(oczekiwany, rel=1e-6)
    assert "fault_impedance_outside_iec60909" in wiersz["reporting_limitations"]
    assert "fault_impedance_outside_iec60909" in raw["reporting_limitations"]
    assert raw["impedancja_zwarcia"] == {
        "r_f_ohm": impedancja["r_f_ohm"],
        "x_f_ohm": impedancja["x_f_ohm"],
        "poza_zakresem_iec60909": True,
    }
    # Ekran wyników: konfiguracja ZAPISANA na biegu niesie Z_f (to samo źródło co autorytet).
    wyniki = klient.get(f"/api/analysis-runs/{run_id}/results/short-circuit")
    assert wyniki.status_code == 200, wyniki.text
    assert wyniki.json()["konfiguracja_biegu"]["impedancja_przejscia"] == {
        "r_f_ohm": impedancja["r_f_ohm"],
        "x_f_ohm": impedancja["x_f_ohm"],
        "poza_zakresem_iec60909": True,
    }
    (wiersz_ekranu,) = wyniki.json()["rows"]
    assert any("IEC 60909" in zdanie for zdanie in wiersz_ekranu["reporting_limitations_pl"])


def test_sonda_liczbowa_reczna_przez_cala_sciezke_uzytkownika(
    klient: TestClient, przypadek: str
) -> None:
    """Sonda ręczna meldunku przez HTTP: I″k3 = 3219,69 A metalicznie, 2292,45 A przez
    R_f = 2 Ω (stosunek 0,7120) — te same liczby co wyrocznia rdzenia."""
    _, metaliczny = _bieg_ze_scenariusza(klient, przypadek)
    _, przez_rf = _bieg_ze_scenariusza(
        klient, przypadek, impedancja={"r_f_ohm": 2.0, "x_f_ohm": 0.0}
    )
    i_met = _wiersz_konca_linii(metaliczny)["ikss_a"]
    i_rf = _wiersz_konca_linii(przez_rf)["ikss_a"]
    assert i_met == pytest.approx(IKSS_3F_METALICZNY_A, abs=1e-2)
    assert i_rf == pytest.approx(IKSS_3F_RF2_A, abs=1e-2)
    assert i_rf / i_met == pytest.approx(0.712008, abs=1e-5)


@pytest.mark.parametrize("fault_type", ["SC_3F", "SC_2F", "SC_1F", "SC_2F_G"])
def test_zerowa_impedancja_przejscia_to_bieg_metaliczny_bez_sladu_zf(
    klient: TestClient, przypadek: str, fault_type: str
) -> None:
    """Kontrakt §1/§3: tryb IMPEDANCE z Z_f = 0 liczy zwarcie metaliczne — wiersze wyniku
    bajt w bajt jak w trybie METALLIC, bez flagi zakresu i bez klucza Z_f w artefakcie."""
    _, metaliczny = _bieg_ze_scenariusza(klient, przypadek, fault_type=fault_type)
    _, zerowa = _bieg_ze_scenariusza(
        klient, przypadek, fault_type=fault_type, impedancja={"r_f_ohm": 0.0, "x_f_ohm": 0.0}
    )
    assert "impedancja_zwarcia" not in zerowa
    assert "fault_impedance_outside_iec60909" not in zerowa["reporting_limitations"]
    assert _wiersz_konca_linii(zerowa)["ikss_a"] == _wiersz_konca_linii(metaliczny)["ikss_a"]
    assert _fizyka_wierszy(zerowa) == _fizyka_wierszy(metaliczny)


def test_bieg_1f_przez_impedancje_przejscia_obniza_prad_i_niesie_flage(
    klient: TestClient, przypadek: str
) -> None:
    _, metaliczny = _bieg_ze_scenariusza(klient, przypadek, fault_type="SC_1F")
    _, przez_rf = _bieg_ze_scenariusza(
        klient, przypadek, fault_type="SC_1F", impedancja={"r_f_ohm": 2.0, "x_f_ohm": 0.0}
    )
    w_met = _wiersz_konca_linii(metaliczny)
    w_rf = _wiersz_konca_linii(przez_rf)
    # Pętla 1F: Z_1 + Z_2 + Z_0 + 3·Z_f (kontrakt OD-14 §2); składowe z wiersza biegu
    # metalicznego, wyrocznia: I″k1 = √3·c·U_n / |pętla|.
    suma = sum(_zespolona(w_met[k]) for k in ("z1_ohm", "z2_ohm", "z0_ohm"))
    assert w_met["ikss_a"] == pytest.approx(
        math.sqrt(3.0) * C_MAX * UN_KV * 1000.0 / abs(suma), rel=1e-6
    )
    assert w_rf["ikss_a"] == pytest.approx(
        math.sqrt(3.0) * C_MAX * UN_KV * 1000.0 / abs(suma + 3 * complex(2.0, 0.0)), rel=1e-6
    )
    assert w_rf["ikss_metaliczny_a"] == w_met["ikss_a"]
    assert w_rf["ikss_a"] < w_met["ikss_a"]
    assert "fault_impedance_outside_iec60909" in w_rf["reporting_limitations"]


@pytest.mark.parametrize(
    "z_f",
    [complex(2.0, 0.0), complex(0.0, 1.5), complex(2.0, 1.5)],
    ids=["rezystancja", "reaktancja", "zespolona"],
)
@pytest.mark.parametrize("fault_type", ["SC_2F", "SC_2F_G"])
def test_bieg_2f_i_2fg_ze_scenariusza_przez_impedancje_przejscia(
    klient: TestClient, przypadek: str, fault_type: str, z_f: complex
) -> None:
    """Rodzaje 2F i 2F+G ścieżką użytkownika (scenariusz → bieg) × trzy postaci Z_f.

    Do partii 10 scenariusza 2F+G nie dało się zapisać (`FaultType` bez SC_2F_G → 400), choć
    rdzeń i bieg z opcji go liczyły. Wyrocznia pętli z kontraktu OD-14 §2 ze składowych
    WIERSZA biegu metalicznego: 2F Z_1 + Z_2 + Z_f; 2F+G Z_1 + Z_2·(Z_0 + 3Z_f)/(Z_2 + Z_0 + 3Z_f).
    """
    _, metaliczny = _bieg_ze_scenariusza(klient, przypadek, fault_type=fault_type)
    _, przez_zf = _bieg_ze_scenariusza(
        klient,
        przypadek,
        fault_type=fault_type,
        impedancja={"r_f_ohm": z_f.real, "x_f_ohm": z_f.imag},
    )
    w_met = _wiersz_konca_linii(metaliczny)
    w_zf = _wiersz_konca_linii(przez_zf)
    z1, z2 = (_zespolona(w_met[k]) for k in ("z1_ohm", "z2_ohm"))
    if fault_type == "SC_2F":
        # Zwarcie bez ziemi nie ma toru składowej zerowej — wiersz nie niesie Z_0.
        assert "z0_ohm" not in w_met
        petla = z1 + z2 + z_f
        petla_met = z1 + z2
    else:
        z0 = _zespolona(w_met["z0_ohm"])
        petla = z1 + z2 * (z0 + 3 * z_f) / (z2 + z0 + 3 * z_f)
        petla_met = z1 + z2 * z0 / (z2 + z0)
    assert _zespolona(w_met["zkk_ohm"]) == pytest.approx(petla_met, rel=1e-9)
    assert _zespolona(w_zf["zkk_ohm"]) == pytest.approx(petla, rel=1e-9)
    assert _zespolona(w_zf["zkk_metaliczne_ohm"]) == pytest.approx(petla_met, rel=1e-9)
    assert _zespolona(w_zf["z_f_ohm"]) == z_f
    assert w_zf["ikss_metaliczny_a"] == w_met["ikss_a"]
    assert w_zf["poza_zakresem_iec60909"] is True
    assert "fault_impedance_outside_iec60909" in w_zf["reporting_limitations"]
    if fault_type == "SC_2F":
        # Pętla szeregowa: I″k2 = c·U_n/|pętla| i |I(Z_f)| < |I(0)| z algebry (kontrakt §2).
        assert w_zf["ikss_a"] == pytest.approx(C_MAX * UN_KV * 1000.0 / abs(petla), rel=1e-6)
        assert w_zf["ikss_a"] < w_met["ikss_a"]


# ---------------------------------------------------------------------------
# Odmowy danych × wejście
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("impedancja", "kod"),
    [
        ({"r_f_ohm": 1.0, "x_f_ohm": -0.5}, "sc.impedancja_zwarcia_pojemnosciowa"),
        ({"r_f_ohm": -0.1, "x_f_ohm": 0.5}, "sc.rezystancja_zwarcia_ujemna"),
    ],
    ids=["x_ujemna", "r_ujemna"],
)
def test_scenariusz_z_niedopuszczalna_impedancja_to_odmowa_nazwana(
    klient: TestClient, przypadek: str, impedancja: dict[str, float], kod: str
) -> None:
    odpowiedz = _utworz_scenariusz(klient, przypadek, impedancja=impedancja)
    assert odpowiedz.status_code == 422, odpowiedz.text
    cialo = odpowiedz.json()
    assert cialo["kod"] == kod
    assert cialo["dane"] == impedancja
    assert "bus-1" not in cialo["detail"]

    # Ta sama reguła przy ZMIANIE scenariusza (drugie wejście tej danej).
    poprawny = _utworz_scenariusz(klient, przypadek, impedancja={"r_f_ohm": 1.0, "x_f_ohm": 0.0})
    assert poprawny.status_code == 201, poprawny.text
    zmiana = klient.put(
        f"{BASE_URL}/fault-scenarios/{poprawny.json()['scenario_id']}",
        json={"fault_mode": "IMPEDANCE", "fault_impedance": impedancja},
    )
    assert zmiana.status_code == 422, zmiana.text
    assert zmiana.json()["kod"] == kod


def test_opcja_biegu_wprost_z_niedopuszczalna_impedancja_odmowiona_przy_tworzeniu(
    klient: TestClient, przypadek: str
) -> None:
    """Opcja `fault_impedance` podana wprost w żądaniu biegu (z pominięciem scenariusza)
    przechodzi tę samą regułę — już przy tworzeniu biegu, nie w kolejce wykonawcy."""
    odpowiedz = klient.post(
        f"{BASE_URL}/study-cases/{przypadek}/runs",
        json={
            "analysis_type": "SC_3F",
            "solver_input": {"fault_impedance": {"r_f_ohm": 1.0, "x_f_ohm": -2.0}},
        },
    )
    assert odpowiedz.status_code == 409, odpowiedz.text
    assert odpowiedz.json()["kod"] == "sc.impedancja_zwarcia_pojemnosciowa"


def test_opcja_impedancji_w_biegu_niezwarciowym_to_odmowa(
    klient: TestClient, przypadek: str
) -> None:
    odpowiedz = klient.post(
        f"{BASE_URL}/study-cases/{przypadek}/runs",
        json={
            "analysis_type": "PHASE_STATE_SN",
            "solver_input": {"fault_impedance": {"r_f_ohm": 1.0, "x_f_ohm": 0.0}},
        },
    )
    assert odpowiedz.status_code == 409, odpowiedz.text
    assert odpowiedz.json()["kod"] == "sc.impedancja_zwarcia_poza_biegiem_zwarciowym"


def test_opcja_biegu_wprost_z_poprawna_impedancja_liczy_jak_scenariusz(
    klient: TestClient, przypadek: str
) -> None:
    bieg = klient.post(
        f"{BASE_URL}/study-cases/{przypadek}/runs",
        json={
            "analysis_type": "SC_3F",
            "solver_input": {"fault_impedance": {"r_f_ohm": 2.0, "x_f_ohm": 0.0}},
        },
    )
    assert bieg.status_code == 201, bieg.text
    koniec = wykonaj_bieg(klient, bieg.json()["id"])
    assert koniec.json()["status"] == "DONE", koniec.json()
    from enm.canonical_analysis import get_run

    run = get_run(UUID(bieg.json()["id"]))
    assert run is not None and run.raw_result is not None
    assert _wiersz_konca_linii(run.raw_result)["ikss_a"] == pytest.approx(IKSS_3F_RF2_A, abs=1e-2)


# ---------------------------------------------------------------------------
# Konsumenci: pakiet dowodowy biegu i wkłady źródeł
# ---------------------------------------------------------------------------


def _dowod_z_zip(zawartosc: bytes) -> dict[str, Any]:
    """`proof.json` z pakietu (bezpośrednio albo z pakietu zagnieżdżonego)."""
    with zipfile.ZipFile(io.BytesIO(zawartosc)) as archiwum:
        for nazwa in sorted(archiwum.namelist()):
            if nazwa.endswith("proof.json"):
                return dict(json.loads(archiwum.read(nazwa)))
            if nazwa.endswith(".zip"):
                return _dowod_z_zip(archiwum.read(nazwa))
    raise AssertionError("pakiet bez proof.json")


def test_pakiet_dowodowy_biegu_z_zf_opisuje_ten_sam_prad(
    klient: TestClient, przypadek: str
) -> None:
    run_id, raw = _bieg_ze_scenariusza(
        klient, przypadek, impedancja={"r_f_ohm": 2.0, "x_f_ohm": 0.0}
    )
    odpowiedz = klient.get(
        f"/api/analysis-runs/{run_id}/pakiet-dowodowy", params={"punkt": "bus-1"}
    )
    if odpowiedz.status_code != 200:
        # Punkt pakietu to identyfikator węzła grafu biegu — wybór z listy dostępności.
        dostepnosc = klient.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy/dostepnosc").json()
        punkt = next(p["target_id"] for p in dostepnosc["punkty"] if p["nazwa"] == "Koniec linii")
        odpowiedz = klient.get(
            f"/api/analysis-runs/{run_id}/pakiet-dowodowy", params={"punkt": punkt}
        )
    assert odpowiedz.status_code == 200, odpowiedz.text
    dowod = _dowod_z_zip(odpowiedz.content)
    rownania = [krok["equation"]["equation_id"] for krok in dowod["steps"]]
    assert rownania[:4] == ["EQ_SC3F_003", "EQ_SC3F_016", "EQ_SC3F_017", "EQ_SC3F_018"]
    assert "EQ_SC3F_004" not in rownania
    ikss_dowodu_ka = dowod["summary"]["key_results"]["ikss_ka"]["value"]
    assert ikss_dowodu_ka * 1000.0 == pytest.approx(_wiersz_konca_linii(raw)["ikss_a"], rel=1e-9)
    assert any("poza zakresem IEC 60909" in w for w in dowod["summary"]["warnings"])


def test_punkt_spoza_biegu_to_odmowa_z_identyfikatorem_w_polu(
    klient: TestClient, przypadek: str
) -> None:
    run_id, _ = _bieg_ze_scenariusza(klient, przypadek)
    odpowiedz = klient.get(
        f"/api/analysis-runs/{run_id}/pakiet-dowodowy", params={"punkt": "wezel-obcy-77"}
    )
    assert odpowiedz.status_code == 422, odpowiedz.text
    cialo = odpowiedz.json()
    assert "wezel-obcy-77" not in cialo["detail"]
    assert cialo["kod"] == "dowod.punkt_zwarcia_spoza_biegu"
    assert cialo["dane"] == {"punkt": "wezel-obcy-77"}


def _migawka(case_id: str) -> dict[str, Any]:
    from enm.store import get_enm

    return get_enm(case_id).model_dump(mode="json")


def _wejscie_wkladow(case_id: str, z_maszyna: bool) -> dict[str, Any]:
    """Migawka sieci sondy (bez maszyn) albo sieci z maszyną synchroniczną testu wkładów."""
    if not z_maszyna:
        return {"snapshot": _migawka(case_id), "fault_node_id": "bus-1", "scenariusz": "MAX"}
    from tests.api.test_proof_pack_api import _enm_z_maszyna

    return {
        "snapshot": _enm_z_maszyna().model_dump(mode="json"),
        "fault_node_id": "bus_oze",
        "scenariusz": "MAX",
    }


@pytest.mark.parametrize("z_maszyna", [False, True], ids=["bez_maszyn", "z_maszyna"])
@pytest.mark.parametrize(
    "impedancja",
    [None, {"r_f_ohm": 2.0, "x_f_ohm": 0.0}, {"r_f_ohm": 0.0, "x_f_ohm": 0.0}],
    ids=["brak", "rezystancja", "zero"],
)
def test_wklady_zrodel_z_impedancja_przejscia(
    klient: TestClient,
    przypadek: str,
    impedancja: dict[str, float] | None,
    z_maszyna: bool,
) -> None:
    """Iloczyn {sieć bez maszyn, sieć z maszyną} × {brak Z_f, R_f, Z_f = 0}: ślad Z_f
    i pozycja „Zakres ważności normy" wyłącznie dla Z_f ≠ 0; z maszyną prąd całkowity
    i wkład maszyny maleją przez Z_f, a Z_f = 0 daje wynik bit w bit jak brak Z_f."""
    # Jedna migawka na test: model z maszyną niesie znaczniki czasu nagłówka, więc dwa
    # wywołania budowy dałyby dwie różne migawki (inny odcisk wejścia).
    wejscie = _wejscie_wkladow(przypadek, z_maszyna)
    tresc: dict[str, Any] = dict(wejscie)
    if impedancja is not None:
        tresc["fault_impedance"] = impedancja
    odpowiedz = klient.post("/api/proof/sc3f/contributions", json=tresc)
    assert odpowiedz.status_code == 200, odpowiedz.text
    cialo = odpowiedz.json()
    istotna = impedancja is not None and bool(impedancja["r_f_ohm"] or impedancja["x_f_ohm"])
    pozycje = [p["pozycja_pl"] for p in cialo["walidacja_iec"]]
    assert ("Zakres ważności normy" in pozycje) is istotna
    assert ("z_f_ohm" in cialo["white_box"]) is istotna
    bez = klient.post("/api/proof/sc3f/contributions", json=wejscie).json()
    if impedancja is None:
        assert cialo["input_hash"] == bez["input_hash"]
    else:
        assert cialo["input_hash"] != bez["input_hash"]
    if not z_maszyna:
        assert cialo["contributions"] == bez["contributions"] == []
        return
    if istotna:
        assert cialo["white_box"]["ikss_total_a"] < bez["white_box"]["ikss_total_a"]
        assert 0.0 < cialo["ikss_machines_a"] < bez["ikss_machines_a"]
    else:
        assert cialo["white_box"] == bez["white_box"]
        assert cialo["contributions"] == bez["contributions"]


@pytest.mark.parametrize(
    "adres",
    ["/api/proof/sc3f/contributions", "/api/proof/sc3f/pack"],
)
def test_zadanie_z_niedopuszczalna_impedancja_to_odmowa_nazwana(
    klient: TestClient, przypadek: str, adres: str
) -> None:
    tresc: dict[str, Any] = {
        "snapshot": _migawka(przypadek),
        "fault_node_id": "bus-1",
        "scenariusz": "MAX",
        "fault_impedance": {"r_f_ohm": 1.0, "x_f_ohm": -1.0},
    }
    if adres.endswith("/pack"):
        tresc |= {
            "project_id": "p",
            "case_id": "c",
            "run_id": "r",
            "snapshot_id": "s",
            "project_name": "Projekt",
            "case_name": "Przypadek",
            "run_timestamp": "2026-01-01T00:00:00Z",
            "solver_version": "test",
        }
    odpowiedz = klient.post(adres, json=tresc)
    assert odpowiedz.status_code == 422, odpowiedz.text
    assert odpowiedz.json()["kod"] == "sc.impedancja_zwarcia_pojemnosciowa"


# ---------------------------------------------------------------------------
# Konsumenci biegu zwarciowego × {bieg metaliczny, bieg z Z_f} — blokada SI-117
# ---------------------------------------------------------------------------

KOD_SI117 = "SI-117"


def _wywolaj_konsumenta(klient: TestClient, konsument: str, run_id: str) -> Any:
    if konsument == "migotanie":
        return klient.get("/api/quality/flicker", params={"run_id": run_id})
    if konsument == "wytrzymalosc_cieplna":
        return klient.get("/api/quality/conductor-thermal-withstand", params={"run_id": run_id})
    if konsument == "energia_luku":
        return klient.post("/api/quality/arc-flash", json={"run_id": run_id})
    assert konsument == "sila_sieci"
    return klient.get("/api/oze-analysis/grid-strength", params={"run_id": run_id})


@pytest.mark.parametrize("z_f", [False, True], ids=["metaliczny", "przez_zf"])
@pytest.mark.parametrize(
    ("konsument", "zdolnosc"),
    [
        ("migotanie", "REGULATORY_EVIDENCE"),
        ("wytrzymalosc_cieplna", "SC_WITHSTAND_EVIDENCE"),
        ("energia_luku", "ARC_FLASH"),
        ("sila_sieci", "REGULATORY_EVIDENCE"),
    ],
)
def test_konsument_biegu_odmawia_wyniku_przez_zf_kodem_si117(
    klient: TestClient, przypadek: str, konsument: str, zdolnosc: str, z_f: bool
) -> None:
    """Zdolność zabroniona przez kontrakt OD-14 × rodzaj biegu: bieg z Z_f → 422 SI-117
    z nazwą zdolności w polu; bieg metaliczny tego samego miejsca nigdy nie dostaje SI-117
    (inna odmowa danych — np. brak danych projektowych — jest dopuszczalna)."""
    run_id, _ = _bieg_ze_scenariusza(
        klient, przypadek, impedancja={"r_f_ohm": 2.0, "x_f_ohm": 0.0} if z_f else None
    )
    odpowiedz = _wywolaj_konsumenta(klient, konsument, run_id)
    if z_f:
        assert odpowiedz.status_code == 422, odpowiedz.text
        assert odpowiedz.json()["kod"] == KOD_SI117
        assert odpowiedz.json()["dane"] == {"zdolnosc": zdolnosc}
        assert "IEC 60909" in odpowiedz.json()["detail"]
    else:
        assert odpowiedz.status_code != 500, odpowiedz.text
        if odpowiedz.status_code == 422:
            assert odpowiedz.json().get("kod") != KOD_SI117


@pytest.mark.parametrize("z_f", [False, True], ids=["metaliczny", "przez_zf"])
def test_pakiet_nastaw_i_bieg_zbiorczy_nastaw_ta_sama_blokada_si117(
    klient: TestClient, przypadek: str, z_f: bool
) -> None:
    """Predykaty parami: dostępność pakietu nastaw (ekran) i budowa wejścia biegu zbiorczego
    nastaw odmawiają kotwicy z Z_f TYM SAMYM komunikatem; kotwica metaliczna tej odmowy
    nie dostaje."""
    from application.protection_settings.batch_run import (
        BrakDanychNastawError,
        zbuduj_wejscie_nastaw,
    )
    from enm.canonical_analysis import get_run

    run_id, _ = _bieg_ze_scenariusza(
        klient, przypadek, impedancja={"r_f_ohm": 2.0, "x_f_ohm": 0.0} if z_f else None
    )
    dostepnosc = klient.get(f"/api/analysis-runs/{run_id}/pakiet-dowodowy-nastaw/dostepnosc")
    assert dostepnosc.status_code == 200, dostepnosc.text
    cialo = dostepnosc.json()
    kotwica = get_run(UUID(run_id))
    assert kotwica is not None
    with pytest.raises(BrakDanychNastawError) as odmowa:
        zbuduj_wejscie_nastaw(
            kotwica,
            line_id="linia-1",
            next_bus_id="bus-1",
            zacisk_zabezpieczenia=None,
        )
    if z_f:
        assert cialo["dostepny"] is False
        assert "impedancję przejścia" in cialo["powod_pl"]
        assert odmowa.value.kod == KOD_SI117
        assert str(odmowa.value) == cialo["powod_pl"]
    else:
        assert "impedancję przejścia" not in (cialo.get("powod_pl") or "")
        assert odmowa.value.kod != KOD_SI117


@pytest.mark.parametrize("z_f", [False, True], ids=["metaliczny", "przez_zf"])
def test_wniosek_osd_nie_bierze_sk_z_biegu_przez_zf(
    klient: TestClient, przypadek: str, z_f: bool
) -> None:
    """Wniosek do OSD: S″k w punkcie przyłączenia to wielkość zwarcia METALICZNEGO — bieg
    z Z_f jest brakiem wniosku z komunikatem SI-117, bieg metaliczny tego braku nie daje."""
    from types import SimpleNamespace

    from application.analyses.wniosek_osd import zbierz_braki_wniosku
    from enm.canonical_analysis import get_run

    run_id, _ = _bieg_ze_scenariusza(
        klient, przypadek, impedancja={"r_f_ohm": 2.0, "x_f_ohm": 0.0} if z_f else None
    )
    bieg = get_run(UUID(run_id))
    assert bieg is not None
    braki = zbierz_braki_wniosku(
        bieg,
        bieg,
        "bus-1",
        SimpleNamespace(bieg=object(), pominiete=()),  # type: ignore[arg-type]
    )
    zdania_zf = [b for b in braki if "impedancję przejścia" in b]
    assert bool(zdania_zf) is z_f


def test_selekcja_najnowszego_biegu_zwarciowego_pomija_bieg_przez_zf(
    klient: TestClient, przypadek: str
) -> None:
    """Werdykt projektowy i reguły aparatury pola biorą NAJNOWSZY bieg zwarcia METALICZNEGO:
    bieg z Z_f utworzony PÓŹNIEJ nie wypiera biegu metalicznego (ten sam predykat co
    proweniencja, `bieg_w_zakresie_iec60909`)."""
    from api.generators import _prady_zwarciowe_szyny
    from application.analyses.werdykt_projektowy import ZRODLO_SC, _najnowszy_bieg
    from enm.canonical_analysis import get_run, list_runs_for_case

    metaliczny_id, _ = _bieg_ze_scenariusza(klient, przypadek)
    przez_zf_id, _ = _bieg_ze_scenariusza(
        klient, przypadek, impedancja={"r_f_ohm": 2.0, "x_f_ohm": 0.0}
    )
    metaliczny = get_run(UUID(metaliczny_id))
    przez_zf = get_run(UUID(przez_zf_id))
    assert metaliczny is not None and przez_zf is not None
    assert przez_zf.created_at >= metaliczny.created_at
    wybrany = _najnowszy_bieg(list_runs_for_case(przypadek), ZRODLO_SC)
    assert wybrany is not None and str(wybrany.id) == metaliczny_id
    ikss_ka, _, zrodlo = _prady_zwarciowe_szyny(przypadek, "bus-1")
    assert zrodlo == metaliczny_id
    assert ikss_ka == pytest.approx(IKSS_3F_METALICZNY_A / 1000.0, abs=1e-5)
