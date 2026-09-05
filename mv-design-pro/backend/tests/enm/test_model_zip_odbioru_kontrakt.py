"""Model ZIP odbioru ma POWIERZCHNIĘ: projektant go widzi, ustawia i nie rozjedzie.

Stan zastany (rewizja inwentarza funkcji 2026-08): współczynniki ``a_p…c_q`` i
``k_pf``/``k_qf`` były w ``solver_fields`` kontraktu OBCIAZENIE — rozpływ mocy z
nich liczył — ale nie było ich ani w ``ui_fields``, ani w żadnym polu kreatora.
Solver liczył modelem, którego projektant nie mógł ani zobaczyć, ani ustawić.

Testy pilnują CAŁEJ KLASY, nie jednego przykładu:

* powierzchnia — komplet ośmiu współczynników w kontrakcie pól, każdy z etykietą
  po polsku, i każdy faktycznie czytany przez solver (predykaty parami: zbiór
  pokazany ⊆ zbiór czytany);
* wejście do modelu — ILOCZYN {trzy drogi zapisu} × {rodzaje niepoprawności},
  bo defekt „zwalidowane w jednej operacji, wolne w pozostałych" jest dokładnie
  tym, co reguła KLASA, NIE INSTANCJA każe wykluczyć;
* zgodność wsteczna — payload bez współczynników i payload z domyślnymi dają ten
  sam odbiór CO DO BAJTU i ten sam wynik rozpływu (pin reduce-to-NR);
* domknięcie łańcucha — model ustawiony przez projektanta DOCHODZI do solvera.
"""

from __future__ import annotations

import pytest
from enm.canonical_analysis import (
    _graph_id_from_ref,
    create_run,
    execute_run,
    reset_canonical_runs,
)
from enm.domain_operations import execute_domain_operation
from enm.load_zip_model import (
    DOMYSLNE_ZIP_ODBIORU,
    KLUCZE_ZIP_ODBIORU,
    zip_odbioru_z_payloadu,
)
from enm.mapping import map_enm_to_network_graph
from enm.models import EnergyNetworkModel
from enm.store import reset_enm_store, set_enm
from enm.topology_ops import create_device
from network_model.catalog.types import MATERIALIZATION_CONTRACTS
from network_model.solvers.power_flow_zip import zip_coeffs_from_materialized_params

from tests.catalog_test_helpers import gpz_source_record

BASE_MVA = 10.0
U_KV = 15.0

#: Wielomian napięciowy stałej impedancji — model NIETRYWIALNY (a=1), więc każda
#: droga zapisu musi go donieść do solvera.
ZIP_STALA_IMPEDANCJA = {
    "a_p": 1.0,
    "b_p": 0.0,
    "c_p": 0.0,
    "a_q": 1.0,
    "b_q": 0.0,
    "c_q": 0.0,
    "k_pf": 0.0,
    "k_qf": 0.0,
}

#: Rodzaje niepoprawności modelu — druga oś iloczynu cech. Każdy z nich musi
#: odbić się od KAŻDEJ drogi zapisu, nie tylko od kreatora odbioru.
NIEPOPRAWNE_MODELE: dict[str, dict[str, float]] = {
    "suma_p_ponizej_jedynki": {"a_p": 0.5, "b_p": 0.0, "c_p": 0.2},
    "suma_p_powyzej_jedynki": {"a_p": 0.7, "b_p": 0.7, "c_p": 0.1},
    "suma_q_rozjechana": {"a_q": 0.4, "b_q": 0.4, "c_q": 0.4},
    "udzial_poza_zakresem": {"a_p": -0.5, "b_p": 0.5, "c_p": 1.0},
}


@pytest.fixture(autouse=True)
def _reset_state():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


# ---------------------------------------------------------------------------
# 1. POWIERZCHNIA: kontrakt pól OBCIAZENIE pokazuje model, którym liczy solver
# ---------------------------------------------------------------------------


def test_kontrakt_pol_obciazenia_pokazuje_komplet_wspolczynnikow_zip() -> None:
    kontrakt = MATERIALIZATION_CONTRACTS["OBCIAZENIE"]
    pokazane = {nazwa for nazwa, _etykieta, _jednostka in kontrakt.ui_fields}
    brakujace = sorted(set(KLUCZE_ZIP_ODBIORU) - pokazane)
    assert not brakujace, (
        "współczynniki modelu ZIP czytane przez rozpływ, a niewidoczne dla "
        f"projektanta: {brakujace}"
    )


def test_kazdy_pokazany_wspolczynnik_zip_jest_czytany_przez_solver() -> None:
    """Predykaty parami: nie pokazujemy pola, którego solver nie czyta (phantom)."""
    kontrakt = MATERIALIZATION_CONTRACTS["OBCIAZENIE"]
    for klucz in KLUCZE_ZIP_ODBIORU:
        assert klucz in kontrakt.solver_fields, f"pole '{klucz}' pokazane, ale nieczytane"


def test_etykiety_wspolczynnikow_zip_sa_po_polsku_i_nazywaja_wielkosc() -> None:
    etykiety = {
        nazwa: etykieta
        for nazwa, etykieta, _jednostka in MATERIALIZATION_CONTRACTS["OBCIAZENIE"].ui_fields
    }
    assert etykiety["a_p"] == "Udział stałoimpedancyjny P (a_P)"
    assert etykiety["b_p"] == "Udział stałoprądowy P (b_P)"
    assert etykiety["c_p"] == "Udział stałomocowy P (c_P)"
    assert etykiety["a_q"] == "Udział stałoimpedancyjny Q (a_Q)"
    assert etykiety["b_q"] == "Udział stałoprądowy Q (b_Q)"
    assert etykiety["c_q"] == "Udział stałomocowy Q (c_Q)"
    assert etykiety["k_pf"] == "Wrażliwość częstotliwościowa P (k_pf)"
    assert etykiety["k_qf"] == "Wrażliwość częstotliwościowa Q (k_qf)"


def test_domyslne_kontraktu_sa_domyslnymi_solvera() -> None:
    """Domyślne MUSZĄ odtwarzać stan zastany — inaczej istniejące projekty ruszą.

    Sprawdzamy to nie przez powtórzenie liczb, lecz przez zachowanie SOLVERA:
    tabliczka z domyślnymi daje ten sam obiekt co tabliczka pusta (brak modelu).
    """
    assert zip_coeffs_from_materialized_params(dict(DOMYSLNE_ZIP_ODBIORU)) is None
    assert zip_coeffs_from_materialized_params({}) is None


# ---------------------------------------------------------------------------
# 2. WEJŚCIE DO MODELU: iloczyn {droga zapisu} × {rodzaj niepoprawności}
# ---------------------------------------------------------------------------


def _enm_z_odplywem() -> tuple[dict, str]:
    enm: dict = {
        "buses": [{"ref_id": "bus-nn", "name": "Szyna nN", "voltage_kv": 0.4}],
        "substations": [
            {"ref_id": "st-1", "name": "ST-1", "bus_refs": ["bus-nn"], "field_specs": []}
        ],
    }
    odplyw = execute_domain_operation(
        enm, "add_nn_outgoing_field", {"station_ref": "st-1", "bus_nn_ref": "bus-nn"}
    )
    assert not odplyw.get("error"), odplyw
    return odplyw["snapshot"], odplyw["selection_hint"]["element_id"]


def _dodaj_odbior(snapshot: dict, feeder_ref: str, **dodatkowe: object) -> dict:
    return execute_domain_operation(
        snapshot,
        "add_nn_load",
        {
            "feeder_ref": feeder_ref,
            "bus_nn_ref": "bus-nn",
            "active_power_kw": 100.0,
            "cos_phi": 0.9,
            **dodatkowe,
        },
    )


@pytest.mark.parametrize("rodzaj", sorted(NIEPOPRAWNE_MODELE))
def test_kreator_odbioru_odrzuca_niepoprawny_model(rodzaj: str) -> None:
    snapshot, feeder_ref = _enm_z_odplywem()
    wynik = _dodaj_odbior(snapshot, feeder_ref, **NIEPOPRAWNE_MODELE[rodzaj])
    assert wynik.get("error"), f"model '{rodzaj}' przeszedł przez kreator odbioru"
    assert wynik["error_code"] == "load.zip_invalid"
    # Operacja meldująca błąd nie zostawia skutku: kontrakt odpowiedzi błędnej to
    # BRAK migawki, a nie migawka z połową zapisu.
    assert wynik.get("snapshot") is None, "odrzucenie zostawiło skutek w modelu"


@pytest.mark.parametrize("rodzaj", sorted(NIEPOPRAWNE_MODELE))
def test_zapis_topologiczny_odrzuca_niepoprawny_model(rodzaj: str) -> None:
    """``create_device`` to DRUGA droga zapisu odbioru — kontrakt ten sam."""
    enm = {"buses": [{"ref_id": "b1", "name": "B1", "voltage_kv": 15.0}], "loads": []}
    wynik = create_device(
        enm,
        {
            "device_type": "load",
            "ref_id": "load-1",
            "bus_ref": "b1",
            "p_mw": 1.0,
            "q_mvar": 0.3,
            "materialized_params": {**ZIP_STALA_IMPEDANCJA, **NIEPOPRAWNE_MODELE[rodzaj]},
        },
    )
    assert not wynik.success, f"model '{rodzaj}' przeszedł przez zapis topologiczny"
    assert any(i.code == "OP_LOAD_ZIP_INVALID" for i in wynik.issues)
    assert not enm["loads"], "odrzucenie zostawiło skutek w modelu"


@pytest.mark.parametrize("rodzaj", sorted(NIEPOPRAWNE_MODELE))
def test_korekta_ekspercka_odrzuca_niepoprawny_model(rodzaj: str) -> None:
    """``update_element_parameters`` to TRZECIA droga zapisu — kontrakt ten sam."""
    snapshot, feeder_ref = _enm_z_odplywem()
    utworzony = _dodaj_odbior(snapshot, feeder_ref)
    assert not utworzony.get("error"), utworzony
    load_ref = utworzony["snapshot"]["loads"][0]["ref_id"]

    wynik = execute_domain_operation(
        utworzony["snapshot"],
        "update_element_parameters",
        {
            "element_ref": load_ref,
            "parameters": {
                "materialized_params": {**ZIP_STALA_IMPEDANCJA, **NIEPOPRAWNE_MODELE[rodzaj]}
            },
        },
    )
    assert wynik.get("error"), f"model '{rodzaj}' przeszedł przez korektę ekspercką"
    assert wynik["error_code"] == "load.zip_invalid"


def test_komunikat_odrzucenia_wskazuje_zmierzona_sume_po_polsku() -> None:
    snapshot, feeder_ref = _enm_z_odplywem()
    wynik = _dodaj_odbior(snapshot, feeder_ref, a_p=0.5, b_p=0.0, c_p=0.2)
    komunikat = wynik["error"]
    assert "0.700000" in komunikat, komunikat
    assert "Model obciążenia (ZIP)" in komunikat
    assert "musi wynosić 1" in komunikat
    # Komunikat czyta projektant — angielski tekst solvera nie ma tu wstępu.
    assert "must sum to" not in komunikat


def test_wspolczynnik_nieliczbowy_jest_odrzucany() -> None:
    _wspolczynniki, blad = zip_odbioru_z_payloadu({"a_p": "połowa"})
    assert blad is not None
    assert "musi być liczbą" in blad


@pytest.mark.parametrize(("klucz", "wartosc"), [("v0_pu", 0.0), ("f0_hz", -50.0)])
def test_wielkosci_odniesienia_tez_podlegaja_kontroli(klucz: str, wartosc: float) -> None:
    """Kreator ich nie ustawia, ale rozpływ je CZYTA — więc muszą być sprawdzone.

    Tabliczka z migracji albo z korekty eksperckiej może je nieść. Przepuszczone
    bez kontroli wywracałyby ``validate_zip_coeffs`` dopiero w środku biegu.
    """
    _wspolczynniki, blad = zip_odbioru_z_payloadu({**ZIP_STALA_IMPEDANCJA, klucz: wartosc})
    assert blad is not None, f"'{klucz}' = {wartosc} przeszło bez kontroli"


def test_odniesienia_niepodane_nie_puchna_tabliczki() -> None:
    """Odbiór z kreatora dostaje DOKŁADNIE osiem kluczy — ani jednego więcej."""
    wspolczynniki, blad = zip_odbioru_z_payloadu(dict(ZIP_STALA_IMPEDANCJA))
    assert blad is None
    assert wspolczynniki is not None
    assert set(wspolczynniki) == set(KLUCZE_ZIP_ODBIORU)


def test_odniesienie_podane_jawnie_jest_zachowane() -> None:
    wspolczynniki, blad = zip_odbioru_z_payloadu({**ZIP_STALA_IMPEDANCJA, "v0_pu": 0.98})
    assert blad is None
    assert wspolczynniki is not None
    assert wspolczynniki["v0_pu"] == 0.98
    assert "f0_hz" not in wspolczynniki


# ---------------------------------------------------------------------------
# 3. ZGODNOŚĆ WSTECZNA: brak pól ≡ pola domyślne
# ---------------------------------------------------------------------------


def test_payload_bez_wspolczynnikow_i_z_domyslnymi_daja_ten_sam_odbior() -> None:
    """Pin reduce-to-NR NA POZIOMIE MODELU: odbiór jest identyczny CO DO BAJTU.

    Gdyby domyślne zapisywały się jako tabliczka, każdy nowy odbiór stałomocowy
    zmieniałby migawkę istniejących projektów — bez żadnej zmiany fizyki.
    """
    snapshot, feeder_ref = _enm_z_odplywem()
    bez_pol = _dodaj_odbior(snapshot, feeder_ref)
    z_domyslnymi = _dodaj_odbior(snapshot, feeder_ref, **DOMYSLNE_ZIP_ODBIORU)

    assert not bez_pol.get("error"), bez_pol
    assert not z_domyslnymi.get("error"), z_domyslnymi
    assert bez_pol["snapshot"]["loads"] == z_domyslnymi["snapshot"]["loads"]
    odbior = bez_pol["snapshot"]["loads"][0]
    assert "materialized_params" not in odbior
    assert odbior["model"] == "pq"


def test_wynik_rozplywu_jest_ten_sam_bez_pol_i_z_domyslnymi() -> None:
    """Ten sam pin, ale na WYNIKU SOLVERA — obietnica bez testu jest fałszywą pewnością."""
    bez_pol = _rozplyw("zip-zgodnosc-bez", _payload_z_odbiorem("Bez pól", None))
    z_domyslnymi = _rozplyw(
        "zip-zgodnosc-domyslne", _payload_z_odbiorem("Domyślne", dict(DOMYSLNE_ZIP_ODBIORU))
    )
    for ref in ("b1", "b2"):
        assert _szyna(bez_pol, ref)["v_pu"] == _szyna(z_domyslnymi, ref)["v_pu"]
        assert _szyna(bez_pol, ref)["p_injected_mw"] == _szyna(z_domyslnymi, ref)["p_injected_mw"]
        assert (
            _szyna(bez_pol, ref)["q_injected_mvar"] == _szyna(z_domyslnymi, ref)["q_injected_mvar"]
        )


# ---------------------------------------------------------------------------
# 4. DOMKNIĘCIE ŁAŃCUCHA: model ustawiony przez projektanta dochodzi do solvera
# ---------------------------------------------------------------------------


def test_model_z_kreatora_dociera_do_solvera() -> None:
    snapshot, feeder_ref = _enm_z_odplywem()
    wynik = _dodaj_odbior(snapshot, feeder_ref, **ZIP_STALA_IMPEDANCJA)
    assert not wynik.get("error"), wynik

    odbior = wynik["snapshot"]["loads"][0]
    assert odbior["model"] == "zip"
    assert odbior["materialized_params"]["a_p"] == 1.0

    # Tabliczka ZAPISANA PRZEZ KREATOR (a nie ręcznie przepisana w teście) jedzie
    # dalej tą samą drogą, którą czyta rozpływ — to jest właśnie brakujące ogniwo.
    graf = map_enm_to_network_graph(
        EnergyNetworkModel.model_validate(
            _payload_z_odbiorem("Z kreatora", dict(odbior["materialized_params"]))
        )
    )
    wezel = next(n for n in graf.nodes.values() if n.zip_coeffs is not None)
    assert wezel.zip_coeffs.a_p == 1.0
    assert wezel.zip_coeffs.c_p == 0.0


def test_sama_wrazliwosc_czestotliwosciowa_tez_dochodzi_do_solvera() -> None:
    """Cecha, w której defekt mógłby się schować: wielomian napięciowy TRYWIALNY.

    Model bez zależności napięciowej, ale z ``k_pf`` != 0, nadal JEST modelem —
    gdyby próg „nietrywialności" patrzył wyłącznie na napięcie, ten odbiór
    zapisałby się jako stałomocowy i wrażliwość zniknęłaby bez śladu.
    """
    snapshot, feeder_ref = _enm_z_odplywem()
    wynik = _dodaj_odbior(snapshot, feeder_ref, k_pf=2.0, k_qf=1.0)
    assert not wynik.get("error"), wynik

    odbior = wynik["snapshot"]["loads"][0]
    assert odbior["model"] == "zip"
    assert odbior["materialized_params"]["k_pf"] == 2.0
    assert odbior["materialized_params"]["c_p"] == 1.0

    wspolczynniki = zip_coeffs_from_materialized_params(odbior["materialized_params"])
    assert wspolczynniki is not None
    assert wspolczynniki.has_frequency_dependence()


def test_model_zmienia_wynik_rozplywu() -> None:
    """Bez tego cały łańcuch mógłby być poprawny „na papierze" i bez wpływu na wynik."""
    stala_moc = _rozplyw("zip-wplyw-pq", _payload_z_odbiorem("Stała moc", None))
    stala_impedancja = _rozplyw(
        "zip-wplyw-z", _payload_z_odbiorem("Stała impedancja", dict(ZIP_STALA_IMPEDANCJA))
    )
    # Odbiór stałoimpedancyjny pobiera przy obniżonym napięciu MNIEJ mocy niż
    # stałomocowy, więc szyna odbiorcza trzyma wyższe napięcie.
    assert _szyna(stala_impedancja, "b2")["v_pu"] > _szyna(stala_moc, "b2")["v_pu"]


# ---------------------------------------------------------------------------
# Pomocnicze: minimalna sieć dwuszynowa do biegu rozpływu
# ---------------------------------------------------------------------------


def _payload_z_odbiorem(nazwa: str, model_zip: dict | None) -> dict:
    odbior: dict = {
        "id": "00000000-0000-0000-0000-000000000020",
        "ref_id": "load-1",
        "name": "Odbiór",
        "tags": [],
        "meta": {},
        "bus_ref": "b2",
        "p_mw": 3.0,
        "q_mvar": 1.5,
        "model": "zip" if model_zip else "pq",
    }
    if model_zip is not None:
        odbior["materialized_params"] = model_zip
    return {
        "header": {
            "name": nazwa,
            "enm_version": "1.0",
            "defaults": {"frequency_hz": 50, "unit_system": "SI"},
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
            "revision": 1,
            "hash_sha256": "",
        },
        "buses": [
            {
                "id": "00000000-0000-0000-0000-000000000001",
                "ref_id": "b1",
                "name": "GPZ",
                "tags": [],
                "meta": {},
                "voltage_kv": U_KV,
                "phase_system": "3ph",
            },
            {
                "id": "00000000-0000-0000-0000-000000000002",
                "ref_id": "b2",
                "name": "Odbiory",
                "tags": [],
                "meta": {},
                "voltage_kv": U_KV,
                "phase_system": "3ph",
            },
        ],
        "branches": [
            {
                "id": "00000000-0000-0000-0000-000000000010",
                "ref_id": "ln-1",
                "name": "Linia GPZ-Odbiory",
                "tags": [],
                "meta": {},
                "from_bus_ref": "b1",
                "to_bus_ref": "b2",
                "status": "closed",
                "type": "line_overhead",
                "length_km": 12.0,
                "r_ohm_per_km": 0.4,
                "x_ohm_per_km": 0.8,
                "catalog_ref": "LINIA_SN:reczne",
                "catalog_namespace": "LINIA_SN",
            }
        ],
        "transformers": [],
        "sources": [
            {
                "id": "00000000-0000-0000-0000-000000000003",
                "tags": [],
                "meta": {},
                **gpz_source_record(
                    ref_id="s1", name="S1", bus_ref="b1", voltage_kv=U_KV, sk3_mva=500.0
                ),
            }
        ],
        "loads": [odbior],
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


def _rozplyw(case_id: str, payload: dict):
    set_enm(case_id, EnergyNetworkModel.model_validate(payload))
    run = execute_run(
        create_run(
            case_id=case_id, klucz_twin=case_id, analysis_type="PF", options={"base_mva": BASE_MVA}
        ).id
    )
    assert run.status == "FINISHED", run.error_message
    return run


def _szyna(run, ref_id: str) -> dict:
    szyny = {b["bus_id"]: b for b in run.raw_result["result_v1"]["bus_results"]}
    return szyny[_graph_id_from_ref(ref_id)]
