"""Końcówka werdyktów wytrzymałości aparatury pól — REALNA ścieżka (karta KD-6).

Sieć powstaje operacjami domenowymi (jedyna produkcyjna droga budowy modelu),
a stacja jest wstawiana z JAWNIE wskazaną pozycją katalogu APARAT_SN — dokładnie
tak, jak robi to kreator. Żaden aparat nie jest tu wstrzykiwany „na skróty",
więc test dowodzi, że werdykt naprawdę bierze się z modelu.

Karta WYTRZYMALOSC-PRAD-POLA: żądanie niesie stację i ZAPISANY bieg zwarciowy (nie liczby);
prąd każdego pola to wiersz biegu dla jego punktu zabudowy. Bieg jest liczony produkcyjnym
torem (``create_run`` + ``execute_run`` — ten sam, który uruchamia ekran wyników).
"""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

import pytest
from api.main import app
from enm.canonical_analysis import build_short_circuit_results, create_run, execute_run
from enm.dziennik_zmian import wyczysc_dziennik
from enm.store import reset_enm_store
from fastapi.testclient import TestClient
from network_model.catalog.repository import get_default_mv_catalog

APARAT_POLA = "sw-cb-abb-vd4-17kv-630a"
KABEL = "cable-tfk-yakxs-3x120"
TRAFO = "tr-sn-nn-15-04-630kva-dyn11"
ZRODLO = "src-gpz-15kv-250mva-rx010"
CT = "ct_400_5_5p20_15va_abb"
PRZEKAZNIK = "REF-OC-100"


@pytest.fixture()
def klient(tmp_path, monkeypatch, uow_factory) -> TestClient:
    from api.dependencies import get_uow_factory

    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path))
    reset_enm_store()
    wyczysc_dziennik()
    app.dependency_overrides[get_uow_factory] = lambda: uow_factory
    app.state.uow_factory = uow_factory
    yield TestClient(app)
    app.dependency_overrides.pop(get_uow_factory, None)
    app.state.uow_factory = None
    reset_enm_store()
    wyczysc_dziennik()


def _nowy_przypadek(klient: TestClient) -> str:
    """Utwórz REALNY projekt + przypadek przez API; zwróć `case_id`.

    CV-1-W: przypadek bez wiersza w bazie dostaje teraz 404 z magazynu ENM
    (inwariant I-2) — testy tego pliku potrzebują prawdziwej pary
    projekt+przypadek zamiast dowolnego napisu.
    """
    project_resp = klient.post("/api/projects", json={"name": "Wytrzymalosc aparatury — test"})
    assert project_resp.status_code == 201, project_resp.text
    project_id = project_resp.json()["id"]
    case_resp = klient.post(
        "/api/study-cases", json={"project_id": project_id, "name": "Przypadek testu"}
    )
    assert case_resp.status_code == 201, case_resp.text
    return str(case_resp.json()["id"])


def _operacja(klient: TestClient, case_id: str, nazwa: str, payload: dict) -> dict:
    odp = klient.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={"operation": {"name": nazwa, "payload": payload}},
    )
    assert odp.status_code == 200, odp.text
    dane = odp.json()
    assert not dane.get("error"), dane.get("error")
    return dane


def _stacja_z_polami(klient: TestClient, case_id: str, *, z_zabezpieczeniem: bool = False) -> str:
    _operacja(
        klient,
        case_id,
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "sk3_mva": 250.0,
            "catalog_ref": ZRODLO,
        },
    )
    odp = _operacja(
        klient,
        case_id,
        "continue_trunk_segment_sn",
        {"segment": {"rodzaj": "KABEL", "dlugosc_m": 400, "catalog_ref": KABEL}},
    )
    segmenty = odp["snapshot"]["corridors"][0]["ordered_segment_refs"]
    # Wyposażenie pola (CT + sterownik zabezpieczeń z katalogu) powstaje w TEJ SAMEJ
    # operacji co stacja (B-3); nastawy zapisuje JEDYNY pisarz `update_protection_settings`
    # (karta OCHRONA-JEDNO-ZRODLO) — ta sama droga co edytor nastaw karty pola.
    pole_in: Any = (
        {
            "field_role": "LINIA_IN",
            "equipment": {
                "ct": {
                    "catalog_ref": CT,
                    "ratio_primary_a": 400.0,
                    "ratio_secondary_a": 5.0,
                },
                "relay": {"catalog_ref": PRZEKAZNIK, "relay_type": "NADPRADOWY"},
            },
        }
        if z_zabezpieczeniem
        else "IN"
    )
    odp = _operacja(
        klient,
        case_id,
        "insert_station_on_segment_sn",
        {
            "field_apparatus_catalog_ref": APARAT_POLA,
            "segment_id": segmenty[-1],
            "station_type": "B",
            "insert_at": {"value": 0.5},
            "station": {
                "sn_voltage_kv": 15.0,
                "nn_voltage_kv": 0.4,
                # Bieg zwarciowy liczy też sieć nN stacji — deklaracja tolerancji napięcia (+6 %)
                # daje wiersz tabeli 1 IEC 60909-0 bez wartości roboczej (karta TOLERANCJA-NN-
                # WARTOSC-ROBOCZA); odbiór potrzeb własnych pozwala policzyć
                # rozpływ (bieg innego rodzaju w teście odrzucenia).
                "station_auxiliary": {"active_power_kw": 10.0, "cos_phi": 0.95},
                "nn_earthing": {"lv_system": "TN-S", "lv_voltage_tolerance": "PLUS_6"},
            },
            "sn_fields": [pole_in, "OUT"],
            "transformer": {
                "create": True,
                "catalog_binding": {
                    "catalog_namespace": "TRAFO_SN_NN",
                    "catalog_item_id": TRAFO,
                    "catalog_item_version": "2024.1",
                },
            },
        },
    )
    stacje = [s for s in odp["snapshot"]["substations"] if "/station" in s["ref_id"]]
    assert stacje, "Operacja musi utworzyć stację"
    if z_zabezpieczeniem:
        pola_stacji = {
            b["ref_id"]
            for b in odp["snapshot"]["bays"]
            if b.get("substation_ref") == stacje[0]["ref_id"] and b.get("bay_role") == "IN"
        }
        (sterownik,) = (
            p for p in odp["snapshot"]["protection_assignments"] if p.get("bay_ref") in pola_stacji
        )
        _operacja(
            klient,
            case_id,
            "update_protection_settings",
            {
                "protection_ref": sterownik["ref_id"],
                "nastawy": {
                    "51": {
                        "prog": 400.0,
                        "jednostka_progu": "A_PIERWOTNY",
                        "krzywa": "DT",
                        "zwloka_s": 0.3,
                    }
                },
                # Pole z jednym stopniem I> (51): funkcja I>> z zestawu szablonu wyłączona
                # przez projektanta (wyłączona funkcja nie jest brakiem nastaw).
                "wlaczone": {"50": False},
            },
        )
    return str(stacje[0]["ref_id"])


def _bieg(
    klient: TestClient,
    case_id: str,
    *,
    analysis_type: str = "short_circuit_sn",
    options: dict[str, Any] | None = None,
) -> str:
    """Zapisany bieg liczony produkcyjnym torem; zwraca jego identyfikator."""
    from application.twin_key import klucz_twin_dla_przypadku

    klucz = klucz_twin_dla_przypadku(case_id, klient.app.state.uow_factory)
    run = execute_run(
        create_run(
            case_id=case_id, klucz_twin=klucz, analysis_type=analysis_type, options=options
        ).id
    )
    assert run.status == "FINISHED", run.error_message
    return str(run.id)


def _wytrzymalosc(klient: TestClient, case_id: str, station_ref: str, run_id: str) -> Any:
    return klient.post(
        f"/api/cases/{case_id}/enm/wytrzymalosc-aparatury",
        json={"station_ref": station_ref, "short_circuit_run_id": run_id},
    )


def _ocena(pole: dict[str, Any], rodzaj: str) -> dict[str, Any]:
    return next(o for o in pole["oceny"] if o["kryterium_id"].endswith(f".{rodzaj}"))


def test_werdykty_powstaja_z_modelu_i_pradow_pola_z_biegu(klient: TestClient):
    """SEDNO: żadnego zapisu konfiguracji i żadnej liczby w żądaniu — a pola stacji dostają
    werdykt przy prądach z wiersza biegu dla SWOJEGO punktu zabudowy."""
    case_id = _nowy_przypadek(klient)
    station_ref = _stacja_z_polami(klient, case_id)
    run_id = _bieg(klient, case_id)

    odp = _wytrzymalosc(klient, case_id, station_ref, run_id)
    assert odp.status_code == 200, odp.text
    widok = odp.json()

    from enm.canonical_analysis import get_run

    wiersze = {
        w["element_id"]: w
        for w in build_short_circuit_results(get_run(UUID(run_id)))["rows"]
        if w["fault_type"] == "3F"
    }
    assert widok["status"] == "OK"
    assert widok["bieg_zwarciowy_ref"] == run_id
    assert widok["pola"], "Stacja z aparatami w modelu musi dać wiersze werdyktu"
    assert {p["zrodlo"] for p in widok["pola"]} == {"model"}
    for pole in widok["pola"]:
        assert pole["aparat_catalog_ref"] == APARAT_POLA
        # Znamiona z pozycji katalogu — z jawnym pochodzeniem każdej liczby.
        assert pole["znamiona"]["i_th_ka"] is not None
        assert pole["znamiona"]["i_th_pochodzenie"] == "producent"
        # Karta nie podaje I_dyn — wartość robocza z relacji normowej (V12K-351), jawnie
        # oznaczona i niesiona jako dana przyjęta oceny dynamicznej (nigdy dana producenta).
        assert pole["znamiona"]["i_dyn_pochodzenie"] == "wartosc_robocza"
        assert pole["znamiona"]["wartosci"]["i_dyn_ka"]["pochodzenie"] == "PROPOZYCJA"
        # Prądy pola = wiersz biegu dla punktu zabudowy pola (nie liczba z żądania).
        wiersz = wiersze[pole["prady_pola"]["punkt_ref"]]
        assert pole["prady_pola"]["ip_ka"] == wiersz["ip_ka"]
        assert pole["prady_pola"]["ith_ka"] == wiersz["ith_ka"]
        assert pole["werdykt"]["i_dyn_ok"] is True
        dynamiczna = _ocena(pole, "dynamiczna")
        assert dynamiczna["status_maszynowy"] == "SPELNIA"
        assert dynamiczna["kompletnosc_dowodu"] == "NIEPELNY"
        assert dynamiczna["limit"]["podstawa"]["rodzaj"] != "KATALOG_PRODUCENTA"
        dane = dynamiczna["dowod"]["status_danych"]["dane_przyjete"]
        assert {d["jakosc"] for d in dane} == {"ESTIMATED"}
        assert any("IEC 62271-1:2017 p. 5.7" in d["powod_pl"] for d in dane)


@pytest.mark.parametrize("tb_s", [None, 0.1], ids=["bez_tb", "tb_0_1"])
def test_kryterium_wylaczania_z_realnego_biegu_porownuje_ib(klient: TestClient, tb_s: float | None):
    """Karta SC-IB-ITH-ZRODLA — realna ścieżka: bieg produkcyjny (z t_b albo bez), końcówka
    HTTP, trzeci rekord K. Sieć bez maszyn wirujących: I_b = I″k (IEC 60909-0 rozdz. 9), więc
    kryterium wyłączania wyłącznika SN jest rozstrzygnięte wobec I_b z wiersza biegu i nazywa
    tę wielkość; t_b i i_DC(t_b) wiersza idą do śladu. Karta TB-WARTOSC-ROBOCZA: bieg bez t_b
    w scenariuszu ma t_b rozstrzygnięte w punkcie zwarcia (pola lokalne, inaczej wartość
    robocza) — pole niesie t_b i jego pochodzenie z wiersza, i_DC zawsze policzone."""
    case_id = _nowy_przypadek(klient)
    station_ref = _stacja_z_polami(klient, case_id)
    opcje = None if tb_s is None else {"breaking_time_seconds": tb_s}
    run_id = _bieg(klient, case_id, options=opcje)

    odp = _wytrzymalosc(klient, case_id, station_ref, run_id)
    assert odp.status_code == 200, odp.text
    from enm.canonical_analysis import get_run

    wiersze = {
        w["element_id"]: w
        for w in build_short_circuit_results(get_run(UUID(run_id)))["rows"]
        if w["fault_type"] == "3F"
    }
    for pole in odp.json()["pola"]:
        wiersz = wiersze[pole["prady_pola"]["punkt_ref"]]
        assert pole["prady_pola"]["ib_ka"] == wiersz["ib_ka"] == wiersz["ikss_ka"]
        assert pole["prady_pola"]["tb_s"] == wiersz["tb_s"] is not None
        if tb_s is not None:
            assert wiersz["tb_s"] == tb_s
        assert pole["prady_pola"]["un_kv"] == wiersz["un_kv"]
        ocena = _ocena(pole, "wylaczanie")
        assert ocena["status_maszynowy"] == "SPELNIA"
        assert ocena["wynik"]["symbol_latex"] == "I_b"
        assert ocena["wynik"]["wartosc"]["wartosc"] == wiersz["ib_ka"]
        assert ocena["podstawa"]["dokument"].startswith("IEC 62271-100")
        assert pole["prady_pola"]["i_dc_ka"] == wiersz["i_dc_ka"] is not None
        if tb_s is None:
            assert pole["prady_pola"]["tb_zrodlo"] == wiersz["tb_zrodlo"]
            assert wiersz["tb_zrodlo"]["pochodzenie"] in {"PROPOZYCJA", "Z_POL"}
        else:
            assert pole["prady_pola"].get("tb_zrodlo") is None
            assert wiersz.get("tb_zrodlo") is None


def test_porownanie_biegow_niesie_tb_i_pochodzenie_po_obu_stronach(klient: TestClient):
    """Karta TB-WARTOSC-ROBOCZA — realna ścieżka porównania biegów: ta sama stacja liczona
    bez t_b w scenariuszu (t_b rozstrzygnięty w punkcie zwarcia) i z t_b projektanta 0,2 s;
    końcówka porównania HTTP niesie I_b, i_DC(t_b) i t_b z pochodzeniem każdej strony 1:1
    z wierszy biegów, a delty liczy domena (B − A)."""
    case_id = _nowy_przypadek(klient)
    _stacja_z_polami(klient, case_id)
    run_a = _bieg(klient, case_id)
    run_b = _bieg(klient, case_id, options={"breaking_time_seconds": 0.2})

    from enm.canonical_analysis import get_run

    def _wiersze(run_id: str) -> dict[str, dict[str, Any]]:
        # Ta sama reguła klucza co końcówka porównania (ostatni wiersz celu wygrywa).
        return {
            str(w["target_id"]): w
            for w in build_short_circuit_results(get_run(UUID(run_id)))["rows"]
            if w.get("target_id") is not None
        }

    wiersze_a, wiersze_b = _wiersze(run_a), _wiersze(run_b)
    odp = klient.post("/api/short-circuit-comparisons", json={"run_id_a": run_a, "run_id_b": run_b})
    assert odp.status_code == 200, odp.text
    punkty = odp.json()["punkty"]
    assert punkty
    for punkt in punkty:
        wa, wb = wiersze_a[punkt["target_id"]], wiersze_b[punkt["target_id"]]
        assert punkt["tb_s_a"] == wa["tb_s"] and punkt["tb_s_b"] == wb["tb_s"] == 0.2
        assert punkt["tb_pochodzenie_a"] == wa["tb_zrodlo"]["pochodzenie"]
        assert punkt["tb_wartosc_robocza_a"] is wa["tb_zrodlo"]["wartosc_robocza"]
        assert punkt["tb_pochodzenie_b"] == "PROJEKTANT"
        assert punkt["tb_wartosc_robocza_b"] is False
        assert punkt["ib_ka_a"] == wa["ib_ka"] and punkt["ib_ka_b"] == wb["ib_ka"]
        assert punkt["i_dc_ka_a"] == wa["i_dc_ka"] and punkt["i_dc_ka_b"] == wb["i_dc_ka"]
        assert punkt["delta_tb_s"] == pytest.approx(0.2 - wa["tb_s"], abs=1e-12)
        assert punkt["delta_i_dc_ka"] == pytest.approx(wb["i_dc_ka"] - wa["i_dc_ka"], abs=1e-12)
        if wa["tb_s"] < 0.2:
            # Dłuższy t_b ⇒ mniejsza składowa nieokresowa (zanik e^(−2πf·t_b·R/X)).
            assert punkt["delta_i_dc_ka"] < 0.0


def test_koncowka_jest_deterministyczna(klient: TestClient):
    case_id = _nowy_przypadek(klient)
    station_ref = _stacja_z_polami(klient, case_id)
    run_id = _bieg(klient, case_id)

    pierwsza_odp = _wytrzymalosc(klient, case_id, station_ref, run_id)
    druga_odp = _wytrzymalosc(klient, case_id, station_ref, run_id)
    # Przypina status PRZED porownaniem cial — dwie identyczne odpowiedzi
    # bledu (np. 404 tlumaczenia case_id) rownie chetnie przeszlyby ten
    # test (test maskujacy defekt).
    assert pierwsza_odp.status_code == 200, pierwsza_odp.text
    assert druga_odp.status_code == 200, druga_odp.text

    assert pierwsza_odp.json() == druga_odp.json()


def test_stacja_spoza_modelu_nie_udaje_pustej(klient: TestClient):
    case_id = _nowy_przypadek(klient)
    _stacja_z_polami(klient, case_id)
    run_id = _bieg(klient, case_id)

    odp = _wytrzymalosc(klient, case_id, "nie-ma-takiej", run_id)
    assert odp.status_code == 200
    widok = odp.json()
    assert widok["status"] == "brak danych"
    assert widok["kody_gotowosci"] == ["aparatura.stacja_nieznana"]


def test_zadanie_bez_biegu_jest_odrzucane(klient: TestClient):
    """Liczby z żądania zniknęły — bez biegu nie ma czego oceniać (422, nie werdykt)."""
    case_id = _nowy_przypadek(klient)
    station_ref = _stacja_z_polami(klient, case_id)

    odp = klient.post(
        f"/api/cases/{case_id}/enm/wytrzymalosc-aparatury",
        json={"station_ref": station_ref, "i_peak_ka": 10.0, "i_thermal_ka": 4.0, "ik_ka": 8.0},
    )
    assert odp.status_code == 422


@pytest.mark.parametrize(
    ("bieg", "kod"),
    [
        (lambda klient, case_id: "nie-uuid", 422),
        (lambda klient, case_id: str(uuid4()), 404),
        (lambda klient, case_id: _bieg(klient, case_id, analysis_type="PF"), 422),
        (lambda klient, case_id: _bieg(klient, case_id, options={"scenario": "min"}), 422),
    ],
    ids=["niepoprawny_uuid", "bieg_nieistniejacy", "bieg_rozplywu", "scenariusz_min"],
)
def test_bieg_niewlasciwy_jest_odrzucany(klient: TestClient, bieg: Any, kod: int):
    """Scenariusz MIN zaniżyłby prąd i dał werdykt optymistyczny — wytrzymałość ocenia
    się przy prądzie maksymalnym."""
    case_id = _nowy_przypadek(klient)
    station_ref = _stacja_z_polami(klient, case_id)

    odp = _wytrzymalosc(klient, case_id, station_ref, bieg(klient, case_id))
    assert odp.status_code == kod, odp.text


def _pole_z_nastaw(widok: dict[str, Any]) -> dict[str, Any]:
    z_nastaw = [p for p in widok["pola"] if p["czas_wylaczenia"]["zrodlo"] == "nastawy_pola"]
    assert z_nastaw, "Pole z nastawami musi dostać człon wyprowadzony z charakterystyki"
    return z_nastaw[0]


def _dane_przyjete(ocena: dict[str, Any]) -> list[dict[str, Any]]:
    return list(ocena["dowod"]["status_danych"]["dane_przyjete"] or [])


def test_czas_z_nastaw_pola_z_czasem_wlasnym_roboczym(klient: TestClient):
    """KD-6 poz. 3 + zasada nr 4 (V12K-351): człon nastawczy z NASTAW przy prądzie TEGO pola,
    a karta wyłącznika nie podaje czasu własnego — system przyjmuje wartość roboczą 0,060 s
    (profil urządzenia) i LICZY: T_k = 0,3 s + 0,06 s. Kryterium cieplne ma status z liczb,
    ale kompletność NIEPEŁNĄ, a czas własny stoi w danych przyjętych z jakością ESTIMATED
    (dawniej BRAK_PODSTAWY z kodem braku czasu własnego)."""
    case_id = _nowy_przypadek(klient)
    station_ref = _stacja_z_polami(klient, case_id, z_zabezpieczeniem=True)
    run_id = _bieg(klient, case_id)

    odp = _wytrzymalosc(klient, case_id, station_ref, run_id)
    assert odp.status_code == 200, odp.text
    pole = _pole_z_nastaw(odp.json())
    czas = pole["czas_wylaczenia"]
    # WHITE BOX: człon i ślad nastawy, prąd = Ik″ punktu zabudowy TEGO pola.
    assert czas["czlon_nastawczy_s"] == 0.3
    assert czas["funkcja"] == "51"
    assert czas["prad_zwarciowy_a"] == pytest.approx(pole["prady_pola"]["ik_ka"] * 1000.0)
    assert czas["czas_wlasny_wylacznika_s"] == 0.06
    assert czas["t_clearing_s"] == pytest.approx(0.36)
    assert czas["czas_wlasny"]["pochodzenie"] == "PROPOZYCJA"
    assert czas["czas_wlasny"]["propozycja"]["rodzaj_zrodla"] == "PROFIL_URZADZENIA"
    assert "aparatura.brak_czasu_wlasnego_wylacznika" not in pole["kody_gotowosci"]
    assert pole["werdykt"]["i_th_ok"] is True
    assert "wartościach roboczych" in pole["komunikat_pl"]
    cieplna = _ocena(pole, "cieplna")
    assert cieplna["status_maszynowy"] == "SPELNIA"
    assert cieplna["kompletnosc_dowodu"] == "NIEPELNY"
    assert cieplna["limit"]["zakres_stosowalnosci_pl"].endswith("czas wyłączenia 0,36 s")
    dane = _dane_przyjete(cieplna)
    assert [d["wartosc"] for d in dane] == [{"wartosc": 0.06, "jednostka": "s"}]
    assert dane[0]["jakosc"] == "ESTIMATED"
    assert "czas własny" in dane[0]["nazwa_pl"]


def test_realny_wiersz_biegu_niesie_kappa_i_tk_a_ocena_porownuje_ith_pola(klient: TestClient):
    """Prąd cieplny przy czasie wyłączenia pola potrzebuje κ i T_k biegu z wiersza punktu.

    Realny wiersz biegu (produkcyjny tor ``create_run`` + ``execute_run`` →
    ``build_short_circuit_results``) niesie je ZAWSZE, gdy niesie I_th — to przypina, że fikstury
    syntetyczne z κ i T_k odtwarzają kształt realnego wiersza, a nie go wymyślają. Wielkość
    porównywana w ocenie cieplnej = ``prad_cieplny_pola.ith_ka`` = I_th biegu przeliczony na T_k
    pola wzorem normy (wyrocznia niezależna), a prąd cieplny biegu nadal stoi w ``prady_pola``.
    """
    from enm.canonical_analysis import get_run

    from tests.utils.prad_cieplny import ith_normy

    case_id = _nowy_przypadek(klient)
    station_ref = _stacja_z_polami(klient, case_id, z_zabezpieczeniem=True)
    run_id = _bieg(klient, case_id)
    wiersze = build_short_circuit_results(get_run(UUID(run_id)))["rows"]
    z_pradem = [w for w in wiersze if w.get("ith_ka") is not None]
    assert z_pradem
    for w in z_pradem:
        assert isinstance(w["kappa"], float) and 1.0 < w["kappa"] < 2.0, w
        assert isinstance(w["tk_s"], float) and w["tk_s"] > 0.0, w

    pole = _pole_z_nastaw(_wytrzymalosc(klient, case_id, station_ref, run_id).json())
    cieplny = pole["prad_cieplny_pola"]
    cieplna = _ocena(pole, "cieplna")
    wiersz = next(
        w
        for w in wiersze
        if w["fault_type"] == "3F" and w["element_id"] == pole["prady_pola"]["punkt_ref"]
    )
    assert cieplny["ith_biegu_ka"] == wiersz["ith_ka"] == pole["prady_pola"]["ith_ka"]
    assert cieplny["kappa"] == wiersz["kappa"]
    assert cieplny["tk_biegu_s"] == wiersz["tk_s"]
    assert cieplny["tk_pola_s"] == pytest.approx(0.36)
    assert cieplna["wynik"]["wartosc"]["wartosc"] == cieplny["ith_ka"]
    assert cieplny["ith_ka"] == pytest.approx(
        ith_normy(wiersz["ikss_ka"], wiersz["kappa"], 0.36), rel=1e-12
    )
    # Ta sama funkcja przy T_k biegu odtwarza I_th wiersza biegu (spójność z rdzeniem).
    assert ith_normy(wiersz["ikss_ka"], wiersz["kappa"], wiersz["tk_s"]) == pytest.approx(
        wiersz["ith_ka"], rel=1e-12
    )
    # T_k pola 0,36 s < T_k biegu 1 s: składowa nieokresowa większa — I_th pola > I_th biegu.
    assert cieplny["ith_ka"] > wiersz["ith_ka"]


def _nadaj_wartosci(
    klient: TestClient, case_id: str, aparat_ref: str, wpisy: list[dict[str, Any]]
) -> dict[str, Any]:
    """Wartości projektanta przez PRODUKCYJNĄ operację domenową (ta sama, którą wysyła kreator
    edycji parametrów)."""
    dane = _operacja(
        klient,
        case_id,
        "update_element_parameters",
        {"element_ref": aparat_ref, "parameters": {"overrides": wpisy}},
    )
    return next(b for b in dane["snapshot"]["branches"] if b["ref_id"] == aparat_ref)


def test_wartosc_projektanta_zmienia_wynik_po_przeliczeniu(klient: TestClient):
    """Projektant zmienia czas własny i prąd krótkotrwały na elemencie modelu — po
    przeliczeniu T_k i status kryterium cieplnego wynikają z JEGO wartości (pierwszeństwo:
    projektant > karta > propozycja), a zdjęcie wpisów przywraca kartę i propozycję."""
    case_id = _nowy_przypadek(klient)
    station_ref = _stacja_z_polami(klient, case_id, z_zabezpieczeniem=True)
    run_id = _bieg(klient, case_id)
    przed = _pole_z_nastaw(_wytrzymalosc(klient, case_id, station_ref, run_id).json())
    aparat_ref = przed["aparat_ref"]
    i_th_obliczony = przed["prady_pola"]["ith_ka"]
    assert _ocena(przed, "cieplna")["status_maszynowy"] == "SPELNIA"

    galaz = _nadaj_wartosci(
        klient,
        case_id,
        aparat_ref,
        [
            # Kolejność wejścia odwrotna do kanonicznej — zapis normalizuje kolejność.
            {"key": "i_th_ka", "value": 5, "reason": "  aparat istniejący, tabliczka 5 kA  "},
            {"key": "break_time_s", "value": 0.1, "reason": "pomiar odbiorczy"},
        ],
    )
    assert galaz["parameter_source"] == "OVERRIDE"
    assert galaz["overrides"] == [
        {"key": "break_time_s", "value": 0.1, "reason": "pomiar odbiorczy"},
        {"key": "i_th_ka", "value": 5.0, "reason": "aparat istniejący, tabliczka 5 kA"},
    ]
    run_po = _bieg(klient, case_id)
    po = _pole_z_nastaw(_wytrzymalosc(klient, case_id, station_ref, run_po).json())
    czas = po["czas_wylaczenia"]
    assert czas["czas_wlasny"]["pochodzenie"] == "PROJEKTANT"
    assert czas["t_clearing_s"] == pytest.approx(0.4)
    assert po["znamiona"]["i_th_ka"] == 5.0
    assert po["znamiona"]["i_th_pochodzenie"] == "projektant"
    assert po["prady_pola"]["ith_ka"] == pytest.approx(i_th_obliczony)
    assert i_th_obliczony > 5.0, "Dobór liczb testu: I_th pola musi przekroczyć 5 kA"
    cieplna = _ocena(po, "cieplna")
    assert cieplna["status_maszynowy"] == "NIE_SPELNIA"
    assert cieplna["kompletnosc_dowodu"] == "NIEPELNY"
    assert cieplna["limit"]["podstawa"]["rodzaj"] == "ZALOZENIE_PROJEKTOWE"
    dane = {d["nazwa_pl"].split(" (")[0]: d for d in _dane_przyjete(cieplna)}
    assert dane["prąd krótkotrwały wytrzymywany"]["wartosc"]["wartosc"] == 5.0
    assert dane["czas własny wyłączania wyłącznika"]["wartosc"]["wartosc"] == 0.1
    assert {d["jakosc"] for d in dane.values()} == {"ESTIMATED"}
    assert "aparat istniejący, tabliczka 5 kA" in (
        dane["prąd krótkotrwały wytrzymywany"]["powod_pl"]
    )
    assert po["werdykt"]["i_th_ok"] is False

    # Zdjęcie wartości projektanta: karta i propozycja wracają, wiązanie katalogowe też.
    galaz = _nadaj_wartosci(klient, case_id, aparat_ref, [])
    assert galaz["overrides"] == []
    assert galaz["parameter_source"] == "CATALOG"
    run_zdjete = _bieg(klient, case_id)
    zdjete = _pole_z_nastaw(_wytrzymalosc(klient, case_id, station_ref, run_zdjete).json())
    assert zdjete["czas_wylaczenia"]["t_clearing_s"] == pytest.approx(0.36)
    assert zdjete["znamiona"]["i_th_pochodzenie"] == "producent"
    assert _ocena(zdjete, "cieplna")["status_maszynowy"] == "SPELNIA"


@pytest.mark.parametrize(
    "wpisy",
    [
        [{"key": "break_time_s", "value": 0.0}],
        [{"key": "break_time_s", "value": 0.5}],
        [{"key": "i_th_ka", "value": "20"}],
        [{"key": "i_th_ka", "value": True}],
        [{"key": "u_m_kv", "value": 17.5}],
        [{"key": "i_th_ka", "value": 20.0}, {"key": "i_th_ka", "value": 25.0}],
        [{"key": "i_th_ka", "value": 20.0, "reason": 7}],
        ["i_th_ka"],
        {"key": "i_th_ka", "value": 20.0},
    ],
    ids=[
        "czas_zero",
        "czas_ponad_zakres",
        "wartosc_tekstowa",
        "wartosc_logiczna",
        "parametr_spoza_rejestru",
        "klucz_powtorzony",
        "uzasadnienie_nietekstowe",
        "wpis_nie_slownik",
        "nie_lista",
    ],
)
def test_wartosc_projektanta_spoza_kontraktu_jest_odmowa(klient: TestClient, wpisy: Any):
    """Brama zapisu: wartość, której rejestr nie dopuszcza, nie wchodzi do modelu (model bez
    zmian, kod błędu jawny)."""
    case_id = _nowy_przypadek(klient)
    station_ref = _stacja_z_polami(klient, case_id, z_zabezpieczeniem=True)
    run_id = _bieg(klient, case_id)
    aparat_ref = _pole_z_nastaw(_wytrzymalosc(klient, case_id, station_ref, run_id).json())[
        "aparat_ref"
    ]
    odp = klient.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={
            "operation": {
                "name": "update_element_parameters",
                "payload": {"element_ref": aparat_ref, "parameters": {"overrides": wpisy}},
            }
        },
    )
    assert odp.status_code == 200, odp.text
    wynik = odp.json()
    assert wynik.get("error"), "Wartość spoza kontraktu musi być odmową"
    assert wynik.get("error_code") == "params.override_invalid", wynik
    model = klient.get(f"/api/cases/{case_id}/enm").json()
    galaz = next(b for b in model["branches"] if b["ref_id"] == aparat_ref)
    assert galaz["overrides"] == []
    assert galaz["parameter_source"] != "OVERRIDE"


def test_powrot_do_karty_przechodzi_brame_katalogowa_aparatu(klient: TestClient):
    """Znacznik `parameter_source: CATALOG` po wyczyszczeniu wartości projektanta stawia
    WYŁĄCZNIE brama katalogowa aparatu (inwentarz deklaracji katalogowych): pozycja, której
    w katalogu nie ma, jest odmową, a model zostaje z wartościami projektanta."""
    case_id = _nowy_przypadek(klient)
    station_ref = _stacja_z_polami(klient, case_id, z_zabezpieczeniem=True)
    run_id = _bieg(klient, case_id)
    aparat_ref = _pole_z_nastaw(_wytrzymalosc(klient, case_id, station_ref, run_id).json())[
        "aparat_ref"
    ]
    _nadaj_wartosci(klient, case_id, aparat_ref, [{"key": "i_th_ka", "value": 5.0}])
    odp = klient.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={
            "operation": {
                "name": "update_element_parameters",
                "payload": {
                    "element_ref": aparat_ref,
                    "parameters": {"overrides": [], "catalog_ref": "APARAT-SPOZA-KATALOGU"},
                },
            }
        },
    )
    assert odp.status_code == 200, odp.text
    wynik = odp.json()
    assert wynik.get("error_code") == "catalog.item_not_found", wynik
    model = klient.get(f"/api/cases/{case_id}/enm").json()
    galaz = next(b for b in model["branches"] if b["ref_id"] == aparat_ref)
    assert galaz["parameter_source"] == "OVERRIDE"
    assert [w["key"] for w in galaz["overrides"]] == ["i_th_ka"]


@pytest.mark.parametrize("operacja", ["update_element_parameters", "assign_catalog_to_element"])
def test_zmiana_pozycji_katalogu_zachowuje_wartosci_projektanta(klient: TestClient, operacja: str):
    """Wartości projektanta należą do ELEMENTU: zmiana pozycji katalogu aparatu (oba tory
    zapisu pozycji) ich nie kasuje, a znacznik zostaje OVERRIDE — inaczej walidator E010
    zablokowałby model po zwykłej zmianie typu aparatu."""
    case_id = _nowy_przypadek(klient)
    station_ref = _stacja_z_polami(klient, case_id, z_zabezpieczeniem=True)
    run_id = _bieg(klient, case_id)
    aparat_ref = _pole_z_nastaw(_wytrzymalosc(klient, case_id, station_ref, run_id).json())[
        "aparat_ref"
    ]
    przed = _nadaj_wartosci(klient, case_id, aparat_ref, [{"key": "i_th_ka", "value": 5.0}])
    inna = next(
        a.id
        for a in get_default_mv_catalog().list_mv_apparatus_types()
        if a.id != przed["catalog_ref"] and a.device_kind == "WYLACZNIK"
    )
    if operacja == "update_element_parameters":
        payload: dict[str, Any] = {"element_ref": aparat_ref, "parameters": {"catalog_ref": inna}}
    else:
        payload = {
            "element_ref": aparat_ref,
            "catalog_item_id": inna,
            "catalog_namespace": "APARAT_SN",
        }
    _operacja(klient, case_id, operacja, payload)
    model = klient.get(f"/api/cases/{case_id}/enm").json()
    galaz = next(b for b in model["branches"] if b["ref_id"] == aparat_ref)
    assert galaz["catalog_ref"] == inna
    assert galaz["parameter_source"] == "OVERRIDE"
    assert [(w["key"], w["value"]) for w in galaz["overrides"]] == [("i_th_ka", 5.0)]


def test_pole_bez_nastaw_ocenia_cieplne_dla_czasu_roboczego_1_s(klient: TestClient):
    """Pakiet 8 karty EDYTOR-DELT-SCENARIUSZA-ZABEZPIECZEN (dyrektywa właściciela): pole, którego
    nastawy nie dają czasu, ma kryterium cieplne rozstrzygnięte dla t = 1 s (wartość robocza
    IEC 62271-1 §4.7, dana przyjęta), z komunikatem „Spełnione dla t = 1 s” — nie brak podstawy.
    Dawny kod „czas wyłączenia nieustalony” nie istnieje; kod braku nastaw zostaje (sterownik
    przypisany, nastawy niekompletne — konkretny brak modelu z akcją)."""
    case_id = _nowy_przypadek(klient)
    station_ref = _stacja_z_polami(klient, case_id)
    run_id = _bieg(klient, case_id)

    odp = _wytrzymalosc(klient, case_id, station_ref, run_id)
    assert odp.status_code == 200, odp.text
    widok = odp.json()

    assert widok["pola"], "Stacja ma pola z aparatami — werdykt dynamiczny nadal powstaje"
    for pole in widok["pola"]:
        czas = pole["czas_wylaczenia"]
        assert (czas["t_clearing_s"], czas["zrodlo"]) == (1.0, "wartosc_robocza")
        assert not any("nieustalon" in k for k in pole["kody_gotowosci"])
        assert pole["werdykt"]["i_dyn_ok"] is True
        assert pole["werdykt"]["i_th_ok"] is True
        assert pole["komunikat_cieplny_pl"] == "Spełnione dla t = 1 s"
        cieplna = _ocena(pole, "cieplna")
        assert cieplna["status_maszynowy"] == "SPELNIA"
        assert cieplna["kompletnosc_dowodu"] == "NIEPELNY"


# --- Karta KD6-SZCZEGOLY: wyprowadzenie prądów i czasu pola z danych backendu ----------------


def test_wyprowadzenie_pradow_pola_z_wiersza_biegu_i_sladu_solvera(klient: TestClient):
    """Każde pole dostaje κ, m, n, T_k biegu i wzory i_p / I_th / I_b z TEGO SAMEGO wiersza
    biegu (kroki śladu solvera), a wiersz z czasem pola — wzór limitu cieplnego. Lista wierszy
    zwarciowych bez żądania wyprowadzenia pozostaje bez tych pól (kontrakt listy bez zmian)."""
    case_id = _nowy_przypadek(klient)
    station_ref = _stacja_z_polami(klient, case_id, z_zabezpieczeniem=True)
    run_id = _bieg(klient, case_id)

    odp = _wytrzymalosc(klient, case_id, station_ref, run_id)
    assert odp.status_code == 200, odp.text
    widok = odp.json()

    from enm.canonical_analysis import get_run

    run = get_run(UUID(run_id))
    lista = build_short_circuit_results(run)["rows"]
    assert all("wzory_pradow" not in w and "m_factor" not in w for w in lista)
    wiersze = {
        w["element_id"]: w
        for w in build_short_circuit_results(run, include_wyprowadzenie=True)["rows"]
        if w["fault_type"] == "3F"
    }
    for pole in widok["pola"]:
        prady = pole["prady_pola"]
        wiersz = wiersze[prady["punkt_ref"]]
        wyprowadzenie = prady["wyprowadzenie"]
        assert wyprowadzenie["kappa"] == wiersz["kappa"]
        assert wyprowadzenie["m_factor"] == wiersz["m_factor"]
        assert wyprowadzenie["n_factor"] == wiersz["n_factor"]
        assert wyprowadzenie["tk_biegu_s"] == wiersz["tk_s"]
        assert set(wyprowadzenie["wzory"]) == {"ip", "ith", "ib"}
        assert wyprowadzenie["wzory"]["ith"] == r"I_{th} = I_{k}'' \cdot \sqrt{m + n}"
        assert r"\kappa" in wyprowadzenie["wzory"]["ip"]
        # Limit cieplny: wzór z tego samego źródła co warunek kryterium cieplnego.
        warunek = _ocena(pole, "cieplna")["kryterium"]["warunek_latex"]
        wzor = pole["wzor_limitu_cieplnego_latex"]
        assert warunek.split(r"\le ", 1)[1] == wzor.split("= ", 1)[1]
        # Karta KD6: symbol zapasu (lewa strona definicji marginesu rekordów pola) nie jest
        # symbolem żadnego wzoru wyprowadzenia (m, n, κ, I_th…) — jeden symbol, jedna wielkość.
        import re

        symbole_wzorow = {
            t
            for w in [*wyprowadzenie["wzory"].values(), wzor]
            for t in re.findall(r"\\[A-Za-z]+|[A-Za-z](?:_\{[^}]*\}|_[A-Za-z0-9])?", w)
        }
        for rodzaj in ("dynamiczna", "cieplna", "wylaczanie"):
            margines = _ocena(pole, rodzaj)["margines"]
            if margines is None or margines["definicja_latex"] is None:
                continue
            lewa = margines["definicja_latex"].split("=", 1)[0].strip()
            assert lewa not in symbole_wzorow
            assert not set(lewa.split()) & {"m", "n", r"\kappa"}


def test_zdania_o_czasie_pola_sa_krotkie_i_z_tych_samych_danych(klient: TestClient):
    """Jedno zdanie o członie nastawczym (stopień, charakterystyka, zabezpieczenie, prąd) i jedno
    o czasie własnym (wartość robocza: profil i podstawa) — pełne uzasadnienie zostaje
    w założeniach czasu, nie jest powtarzane."""
    case_id = _nowy_przypadek(klient)
    station_ref = _stacja_z_polami(klient, case_id, z_zabezpieczeniem=True)
    run_id = _bieg(klient, case_id)

    pole = _pole_z_nastaw(_wytrzymalosc(klient, case_id, station_ref, run_id).json())
    czas = pole["czas_wylaczenia"]
    assert czas["opis_czlonu_pl"].startswith("0,3 s — stopień ")
    assert "(DT)" in czas["opis_czlonu_pl"]
    ik_ka = round(pole["prady_pola"]["ik_ka"], 2)
    assert czas["opis_czlonu_pl"].endswith(f"{str(ik_ka).replace('.', ',')} kA")
    assert czas["opis_czasu_wlasnego_pl"] == (
        "0,06 s — wartość robocza: profil typowy wyłącznika próżniowego SN "
        "(IEC 62271-100: czas wyłączania deklaruje producent)"
    )
    assert len(czas["opis_czasu_wlasnego_pl"]) < len(czas["zalozenia_pl"][-1])


def test_pole_bez_nastaw_nie_ma_zdan_o_czasie(klient: TestClient):
    """Czas roboczy 1 s: brak zdań o członach nastaw (nie ma czego opisać) — zostaje podstawa
    czasu (norma i sposób zmiany), a rozbicie z nastaw niesie powód braku czasu z nastaw."""
    case_id = _nowy_przypadek(klient)
    station_ref = _stacja_z_polami(klient, case_id)
    run_id = _bieg(klient, case_id)

    widok = _wytrzymalosc(klient, case_id, station_ref, run_id).json()
    for pole in widok["pola"]:
        czas = pole["czas_wylaczenia"]
        assert czas["t_clearing_s"] == 1.0
        assert "opis_czlonu_pl" not in czas
        assert "opis_czasu_wlasnego_pl" not in czas
        assert "IEC 62271-1" in czas["podstawa_pl"]
        assert czas["czas_z_nastaw"]["t_clearing_s"] is None
        assert czas["czas_z_nastaw"]["powod_pl"]


def _straznik_matematyki_ui() -> Any:
    """Moduł ``scripts/ui_math_guard.py`` — jedno źródło wzorca gołego indeksu symbolu."""
    import importlib.util
    import sys
    from pathlib import Path

    skrypty = Path(__file__).resolve().parents[3] / "scripts"

    def _zaladuj(nazwa: str) -> Any:
        spec = importlib.util.spec_from_file_location(nazwa, skrypty / f"{nazwa}.py")
        assert spec is not None and spec.loader is not None
        modul = importlib.util.module_from_spec(spec)
        sys.modules[nazwa] = modul
        spec.loader.exec_module(modul)
        return modul

    # Strażnik importuje `guard_parsowanie` z katalogu skryptów; moduł rejestrujemy wprost
    # w `sys.modules`, bez dokładania `scripts/` do `sys.path` (to mogłoby przesłonić pakiet
    # źródłowy — tests/ci/test_testy_nie_cieniuja_pakietow_zrodlowych.py).
    if "guard_parsowanie" not in sys.modules:
        _zaladuj("guard_parsowanie")
    return _zaladuj("ui_math_guard")


#: Pola tekstowe kontraktu, które NIE są prozą dla projektanta (identyfikatory, kody, statusy,
#: jednostki, zapis LaTeX). Każde inne pole tekstowe odpowiedzi jest prozą.
_POLA_NIE_PROZY = frozenset(
    {
        "pole",
        "pole_ref",
        "rola",
        "zrodlo",
        "aparat_ref",
        "punkt_ref",
        "kryterium_id",
        "element_ref",
        "relacja",
        "status",
        "status_maszynowy",
        "rodzaj",
        "jednostka",
        "metoda",
        "jakosc",
        "pochodzenie",
        "parametr",
        "rodzaj_zrodla",
        "run_id",
        "krok",
        "urzadzenie_ref",
        "funkcja",
        "krzywa",
        "kod",
        "kompletnosc",
        "poziom",
        "rodzaj_twierdzenia",
        "status_modelu",
        "status_danych",
        "skala_rodzaj",
        "czas_wlasny_pozycja_ref",
        "catalog_ref",
        "klucz",
        "etykieta",
        "typ_modulu",
        "technologia",
        "pole_nazwa",
        "zabezpieczenie_ref",
        "wersja_profilu",
        # Wzory wyprowadzenia prądów pola — zapis LaTeX solvera (słownik ``wzory``).
        "wzory",
        # Komunikat zbiorczy jądra werdyktu konfiguratora stacji (``audit2_catalogs``) — widok
        # aparatury pól go NIE wyświetla (V12K-353, przypięte w WeryfikacjaAparatury.test.tsx);
        # jego proza należy do ekranu konfiguratora stacji, nie do tego widoku.
        "komunikat_pl",
        "werdykt",
    }
)


def _proza_odpowiedzi(dane: Any, klucz: str = "") -> list[tuple[str, str]]:
    """(ścieżka, tekst) każdej prozy odpowiedzi — pola spoza ``_POLA_NIE_PROZY`` i bez ``_latex``."""
    wynik: list[tuple[str, str]] = []
    if isinstance(dane, dict):
        for k, v in dane.items():
            if k.endswith("_latex") or k in _POLA_NIE_PROZY or k.endswith("_ref"):
                continue
            wynik.extend(_proza_odpowiedzi(v, f"{klucz}/{k}"))
    elif isinstance(dane, list):
        for i, v in enumerate(dane):
            wynik.extend(_proza_odpowiedzi(v, f"{klucz}[{i}]"))
    elif isinstance(dane, str):
        wynik.append((klucz, dane))
    return wynik


@pytest.mark.parametrize("z_zabezpieczeniem", [True, False])
def test_proza_widoku_aparatury_bez_symboli_ascii(klient: TestClient, z_zabezpieczeniem: bool):
    """Karta KD6: każdy tekst odpowiedzi pokazywany w szczegółach aparatury pól (podstawy
    znamion, zdania czasu, pochodzenie czasu przerwania prądu, ślady, braki, wartości robocze)
    nazywa wielkości słowami — symbol wielkości przychodzi wyłącznie w polach ``*_latex``
    i renderuje go MathRenderer. Wzorzec gołego indeksu z ``ui_math_guard`` (jedno źródło).
    Iloczyn: pole z czasem z nastaw (zabezpieczenie) × pole bez nastaw (czas nieustalony)."""
    straznik = _straznik_matematyki_ui()
    case_id = _nowy_przypadek(klient)
    station_ref = _stacja_z_polami(klient, case_id, z_zabezpieczeniem=z_zabezpieczeniem)
    run_id = _bieg(klient, case_id)
    widok = _wytrzymalosc(klient, case_id, station_ref, run_id).json()

    proza = _proza_odpowiedzi(widok["pola"])
    assert len(proza) > 20, "odpowiedź bez prozy — test niczego nie sprawdza"
    naruszenia = [
        (sciezka, tekst)
        for sciezka, tekst in proza
        if straznik.WZORZEC_GOLY_INDEKS.search(straznik.SEGMENT_WZORU_RE.sub(" ", tekst))
    ]
    assert naruszenia == [], "\n".join(f"{s}: {t}" for s, t in naruszenia)
