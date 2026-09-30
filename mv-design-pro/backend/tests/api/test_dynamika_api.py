"""Tok pracy dynamiki czasowej przez HTTP (karta AB-P1): opis scenariusza, gotowość,
scenariusze nazwane, bieg ze scenariusza i odczyt wyniku z opisem i ocenami niewykonanymi.

Para z kryterium ukończenia karty (ścieżka backendu tego samego toku, który ćwiczy e2e):
wytwórca BEZ modelu dynamicznego -> bieg odmawia nazwanym kodem, gotowość podaje akcję
naprawczą `der.dynamika_missing` -> wiązanie z katalogowym profilem operacją domenową ->
rozpływ na nowej migawce -> bieg przechodzi (zwarcie w kablu w x·L usunięte izolacją).
"""

from __future__ import annotations

from typing import Any, get_args

import pytest
from api.main import app
from application.contracts.resultset_dynamic_v2 import TrybScenariusza
from application.dynamika.opis_scenariusza import (
    ETYKIETY_POL,
    ETYKIETY_RODZAJOW,
    ETYKIETY_WARTOSCI,
    ETYKIETY_WIELKOSCI_DETEKTORA,
    POLA_TRYBU_STANOWISKA,
    opis_scenariusza_dynamicznego,
)
from application.dynamika.opis_wyniku import (
    _STANY_URZADZEN,
    _ZDARZENIA_WYKONANE,
    OPISY_TRYBU_SCENARIUSZA,
    _jednostka_stanu,
    opis_wyniku_dynamiki,
)
from enm.adapter_dynamiki import (
    KOD_NASTAWY_BRAK,
    POLA_NASTAW,
    POLA_NASTAW_Z_WARTOSCIA_NULL,
    OdmowaWejsciaDynamiki,
    nastawy_z_opcji,
)
from enm.scenariusze import (
    Detektor,
    OperatingScenario,
    RodzajScenariusza,
    ScenariuszDynamiczny,
    ZdarzenieDynamiczne,
    _ref_detektora,
    zapisz_scenariusz,
)
from fastapi.testclient import TestClient
from network_model.solvers.dynamika.urzadzenia.maszyna_klasyczna import (
    NAZWY_STANOW_MASZYNY_KLASYCZNEJ,
)
from network_model.solvers.dynamika.urzadzenia.szyna_sztywna import NAZWY_STANOW_SZYNY_SZTYWNEJ
from network_model.solvers.dynamika.urzadzenia.zrodlo_testowe import (
    NAZWY_STANOW_ZRODLA_TESTOWEGO,
)
from network_model.solvers.dynamika.zdarzenia import RodzajWpisu

pytest.importorskip("sqlalchemy")

from tests.golden.enm_builders.dynamika_projektanta import (  # noqa: E402
    NAZWA_DETEKTORA_ZAPADU,
    NAZWA_KONCA_MAGISTRALI,
    NAZWA_ODBIORU,
    NAZWA_ODCINKA_ZWARCIA,
    PROFIL_ODBIORU,
    PROG_DETEKTORA_ZAPADU_PU,
    build_dynamika_projektanta_enm,
    refy_sieci,
    scenariusz_zwarcia_w_odcinku,
)
from tests.test_dynamika_rms_run import (  # noqa: E402
    NASTAWY_SOLVERA,
    _nowy_przypadek,
    _reset_backend_state,
    _uruchom_rozplyw,
)

#: Sieć toku pracy dynamiki (operacje domenowe z katalogu) i jej identyfikatory — z NAZW.
_SIEC = build_dynamika_projektanta_enm(z_modelem_pv=False, z_modelem_odbioru=False)
REFY = refy_sieci(_SIEC)
#: Zwarcie 3F w połowie „Odcinek 2", usunięte IZOLACJĄ: odcinek otwierany w chwili usunięcia
#: (miejsce zwarcia leży wewnątrz gałęzi), koniec magistrali z odbiorem zostaje odcięty.
SCENARIUSZ_IZOLACJI: dict[str, Any] = scenariusz_zwarcia_w_odcinku(
    REFY.odcinek_zwarcia, szyna_detektora=None
)
#: Ten sam scenariusz z detektorem zapadu napięcia szyny PV (bez działania na sieć).
SCENARIUSZ_Z_DETEKTOREM: dict[str, Any] = scenariusz_zwarcia_w_odcinku(
    REFY.odcinek_zwarcia, szyna_detektora=REFY.szyna_pv
)
#: Z detektorem tolerancja lokalizacji chwili przekroczenia jest wymagana (bez — `None`).
NASTAWY_Z_DETEKTOREM: dict[str, Any] = {
    **NASTAWY_SOLVERA,
    "tolerancja_lokalizacji_zdarzen_s": 1.0e-4,
}


@pytest.fixture
def client() -> TestClient:
    _reset_backend_state()
    with TestClient(app) as test_client:
        yield test_client


def _siec_bez_modelu_pv(client: TestClient, case_id: str) -> None:
    """Sieć toku pracy dynamiki projektanta z PV BEZ modelu dynamicznego —
    `tests/golden/enm_builders/dynamika_projektanta`, to samo źródło co sceny harnessu
    (spec e2e buduje ją tymi samymi operacjami przez HTTP)."""
    from application.twin_key import klucz_twin_dla_przypadku
    from enm.models import EnergyNetworkModel
    from enm.store import set_enm

    klucz = klucz_twin_dla_przypadku(case_id, client.app.state.uow_factory)
    set_enm(klucz, EnergyNetworkModel.model_validate(_SIEC))


def _operacja(client: TestClient, case_id: str, nazwa: str, payload: dict) -> dict:
    odpowiedz = client.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={
            "project_id": "",
            "snapshot_base_hash": "",
            "operation": {"name": nazwa, "idempotency_key": f"t-{nazwa}", "payload": payload},
        },
    )
    assert odpowiedz.status_code == 200, odpowiedz.text
    wynik = odpowiedz.json()
    assert wynik.get("error") is None, wynik.get("error")
    return wynik


def _bieg(
    client: TestClient,
    case_id: str,
    scenario_id: str,
    pf_run_id: str,
    nastawy: dict[str, Any] = NASTAWY_SOLVERA,
) -> dict:
    utworzony = client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={
            "analysis_type": "DYNAMIKA_RMS",
            "solver_input": {"pf_run_id": pf_run_id, "nastawy_solvera": nastawy},
            "scenario_id": scenario_id,
        },
    )
    assert utworzony.status_code == 201, utworzony.text
    run_id = utworzony.json()["id"]
    wykonany = client.post(f"/api/execution/runs/{run_id}/execute")
    assert wykonany.status_code == 200, wykonany.text
    return {"run_id": run_id, **wykonany.json()}


# ---------------------------------------------------------------------------
# Opis scenariusza — wprost z kontraktów
# ---------------------------------------------------------------------------


def test_opis_scenariusza_niesie_kazdy_rodzaj_unii_kontraktu(client: TestClient) -> None:
    opis = client.get("/api/dynamika/opis-scenariusza").json()
    rodzaje = {r["rodzaj"]: r for r in opis["rodzaje_zdarzen"]}
    klasy = get_args(get_args(ZdarzenieDynamiczne)[0])
    assert set(rodzaje) == {str(k.model_fields["rodzaj"].default) for k in klasy}
    # Zdolność rdzenia wyprowadzona z adaptera biegu, nie z listy w tej warstwie: komenda
    # regulacji i częściowa utrata źródła są wykonywane, synchronizacja — odmowa nazwana.
    assert rodzaje["komenda_regulacji"]["wykonywany_przez_rdzen"] is True
    assert rodzaje["utrata_czesciowa_zrodla"]["wykonywany_przez_rdzen"] is True
    assert rodzaje["synchronizacja"]["wykonywany_przez_rdzen"] is False
    assert rodzaje["zwarcie"]["wykonywany_przez_rdzen"] is True
    typ = next(p for p in rodzaje["zwarcie"]["pola"] if p["nazwa"] == "typ")
    assert [w["wartosc"] for w in typ["wartosci"] if w["wykonywana_przez_rdzen"]] == ["3F"]
    # Role referencji z predykatu walidacji scenariusza.
    miejsce = {p["nazwa"]: p for p in rodzaje["zwarcie"]["pola"]}
    assert [k["kolekcja"] for k in miejsce["bus_ref"]["kolekcje"]] == ["buses"]
    assert [k["kolekcja"] for k in miejsce["element_ref"]["kolekcje"]] == ["branches"]
    skok = {p["nazwa"]: p for p in rodzaje["skok_obciazenia"]["pola"]}
    assert [k["kolekcja"] for k in skok["ref_id"]["kolekcje"]] == ["loads"]


def test_opis_nastaw_to_komplet_pol_solvera_bez_wartosci_domyslnych() -> None:
    opis = opis_scenariusza_dynamicznego()
    assert [n["nazwa"] for n in opis["nastawy_solvera"]] == list(POLA_NASTAW)
    assert all("domyslna" not in n and "wartosc" not in n for n in opis["nastawy_solvera"])
    integrator = next(n for n in opis["nastawy_solvera"] if n["nazwa"] == "integrator")
    assert {w["wartosc"] for w in integrator["wartosci"]} == {"trapez_niejawny", "rk4_jawny"}


def _pola_rekurencyjnie(pola: list[dict[str, Any]], sciezka: str) -> list[tuple[str, dict]]:
    """Każde pole opisu z polami obiektów, elementów list i wariantów unii (ścieżka w tekście)."""
    wynik: list[tuple[str, dict]] = []
    for pole in pola:
        tu = f"{sciezka}.{pole['nazwa']}"
        wynik.append((tu, pole))
        wynik.extend(_pola_rekurencyjnie(pole.get("pola") or [], tu))
        for wariant in pole.get("warianty") or []:
            wynik.extend(_pola_rekurencyjnie(wariant["pola"], f"{tu}[{wariant['rodzaj']}]"))
    return wynik


def test_etykiety_obejmuja_dzisiejsze_rodzaje_i_pola() -> None:
    """Dzisiejsze rodzaje, pola (także zagnieżdżone: obiekty, elementy list, warianty unii),
    wartości wyboru i nastawy mają etykiety po polsku; rodzaj albo pole dodane do kontraktu
    bez etykiety i tak trafia do edytora (etykieta z nazwy) — ten test pokazuje wtedy brak."""
    opis = opis_scenariusza_dynamicznego()
    pola: list[tuple[str, dict]] = _pola_rekurencyjnie(opis["pola_scenariusza"], "scenariusz")
    pola += _pola_rekurencyjnie(opis["nastawy_solvera"], "nastawy")
    for rodzaj in opis["rodzaje_zdarzen"]:
        assert rodzaj["rodzaj"] in ETYKIETY_RODZAJOW, rodzaj["rodzaj"]
        pola += _pola_rekurencyjnie(rodzaj["pola"], rodzaj["rodzaj"])
    for sciezka, pole in pola:
        assert pole["nazwa"] in ETYKIETY_POL, sciezka
        for wartosc in pole.get("wartosci") or []:
            assert (pole["nazwa"], wartosc["wartosc"]) in ETYKIETY_WARTOSCI, (sciezka, wartosc)
        for wariant in pole.get("warianty") or []:
            assert wariant["rodzaj"] in ETYKIETY_WIELKOSCI_DETEKTORA, (sciezka, wariant)


def test_opis_pol_scenariusza_tryb_sieci_z_detektorami_z_kontraktu() -> None:
    """Pola scenariusza = pola kontraktu bez harmonogramu i BEZ trybu stanowiska badawczego;
    detektory to lista obiektów, wielkość detektora to unia wariantów kontraktu, a role
    referencji wariantów pochodzą z predykatu walidacji `_ref_detektora` (para predykatów)."""
    opis = opis_scenariusza_dynamicznego()
    nazwy = [p["nazwa"] for p in opis["pola_scenariusza"]]
    assert nazwy == [
        n
        for n in ScenariuszDynamiczny.model_fields
        if n != "zdarzenia" and n not in POLA_TRYBU_STANOWISKA
    ]
    assert POLA_TRYBU_STANOWISKA == ("stanowisko",)
    detektory = next(p for p in opis["pola_scenariusza"] if p["nazwa"] == "detektory")
    assert detektory["typ"] == "lista" and detektory["wymagane"] is False
    pola = {p["nazwa"]: p for p in detektory["pola"]}
    assert list(pola) == list(Detektor.model_fields)
    assert pola["jednorazowy"]["typ"] == "logiczna"
    assert [w["wartosc"] for w in pola["kierunek"]["wartosci"]] == ["w_dol", "w_gore"]
    wielkosc = pola["wielkosc"]
    assert wielkosc["typ"] == "unia"
    klasy = get_args(Detektor.model_fields["wielkosc"].annotation)
    assert [w["rodzaj"] for w in wielkosc["warianty"]] == [
        str(k.model_fields["rodzaj"].default) for k in klasy
    ]
    for klasa, wariant in zip(klasy, wielkosc["warianty"], strict=True):
        referencje = [p for p in wariant["pola"] if p["typ"] == "referencja"]
        assert len(referencje) == 1, wariant
        ref = referencje[0]
        _, kolekcje = _ref_detektora(
            Detektor.model_construct(wielkosc=klasa.model_construct(**{ref["nazwa"]: "x"}))
        )
        assert [k["kolekcja"] for k in ref["kolekcje"]] == list(kolekcje), wariant["rodzaj"]


def test_nastawa_bez_wartosci_tylko_tam_gdzie_przyjmuje_ja_adapter() -> None:
    """Iloczyn nastawa × brak wartości: opis `dopuszcza_brak` zgadza się z ZACHOWANIEM
    adaptera biegu (odmowa `dynamika.nastawy_solvera_brak` albo przyjęcie `null`) dla KAŻDEJ
    nastawy — opis i odmowa czytają ten sam predykat `POLA_NASTAW_Z_WARTOSCIA_NULL`."""
    opis = {n["nazwa"]: n for n in opis_scenariusza_dynamicznego()["nastawy_solvera"]}
    scenariusz = ScenariuszDynamiczny.model_validate(SCENARIUSZ_IZOLACJI)
    for nazwa in POLA_NASTAW:
        nastawy = {**NASTAWY_Z_DETEKTOREM, nazwa: None}
        try:
            nastawy_z_opcji({"nastawy_solvera": nastawy}, scenariusz)
            przyjeta = True
        except OdmowaWejsciaDynamiki as odmowa:
            przyjeta = not (odmowa.kod == KOD_NASTAWY_BRAK and nazwa in odmowa.elementy)
        except (TypeError, ValueError):
            przyjeta = True  # przeszła bramkę braku; odmowa dotyczy WARTOŚCI, nie braku
        assert opis[nazwa]["dopuszcza_brak"] is przyjeta, nazwa
        assert opis[nazwa]["dopuszcza_brak"] is (nazwa in POLA_NASTAW_Z_WARTOSCIA_NULL), nazwa
        assert opis[nazwa]["wymagane"] is True, nazwa


def test_opis_zdarzen_wykonanych_obejmuje_kazdy_rodzaj_wpisu_rdzenia() -> None:
    """Każdy rodzaj wpisu harmonogramu rdzenia ma opis po polsku w odpowiedzi wyniku —
    rodzaj dodany do rdzenia bez opisu trafia do osi zdarzeń z nazwą rdzenia, a ten test
    pokazuje brak (lista zamknięta jest pinem, nie założeniem)."""
    assert set(get_args(RodzajWpisu)) == set(_ZDARZENIA_WYKONANE)


# ---------------------------------------------------------------------------
# Scenariusze nazwane w magazynie scenariuszy
# ---------------------------------------------------------------------------


def test_scenariusz_zapis_rewizja_lista_i_odmowy(client: TestClient) -> None:
    case_id = _nowy_przypadek(client)
    _siec_bez_modelu_pv(client, case_id)
    adres = f"/api/dynamika/study-cases/{case_id}/scenariusze"

    pierwszy = client.post(
        adres, json={"name": "Zwarcie w odcinku", "dynamika": SCENARIUSZ_IZOLACJI}
    )
    assert pierwszy.status_code == 201, pierwszy.text
    wpis = pierwszy.json()
    assert wpis["revision"] == 1
    assert ScenariuszDynamiczny.model_validate(wpis["dynamika"]) == (
        ScenariuszDynamiczny.model_validate(SCENARIUSZ_IZOLACJI)
    )

    zmieniony = {**SCENARIUSZ_IZOLACJI, "horyzont_s": 0.4}
    drugi = client.post(
        adres,
        json={
            "scenario_id": wpis["scenario_id"],
            "name": "Zwarcie w odcinku",
            "dynamika": zmieniony,
        },
    )
    assert drugi.status_code == 201 and drugi.json()["revision"] == 2

    lista = client.get(adres).json()
    assert [s["scenario_id"] for s in lista["scenariusze"]] == [wpis["scenario_id"]]

    zly_kontrakt = client.post(
        adres, json={"name": "zły", "dynamika": {**SCENARIUSZ_IZOLACJI, "horyzont_s": -1}}
    )
    assert zly_kontrakt.status_code == 422
    assert any(b["pole"] == "horyzont_s" for b in zly_kontrakt.json()["detail"])

    zla_rola = client.post(
        adres,
        json={
            "name": "zła rola",
            "dynamika": {
                **SCENARIUSZ_IZOLACJI,
                "zdarzenia": [{"rodzaj": "odlaczenie_odbioru", "t_s": 0.1, "ref_id": REFY.pv}],
            },
        },
    )
    assert zla_rola.status_code == 422

    nieznany = client.post(
        adres, json={"scenario_id": "brak-takiego", "name": "x", "dynamika": SCENARIUSZ_IZOLACJI}
    )
    assert nieznany.status_code == 404

    bieg_z_nieznanym = client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={"analysis_type": "DYNAMIKA_RMS", "solver_input": {}, "scenario_id": "brak-takiego"},
    )
    assert bieg_z_nieznanym.status_code == 404


# ---------------------------------------------------------------------------
# Para z kryterium ukończenia karty
# ---------------------------------------------------------------------------


def test_brak_modelu_odmowa_akcja_wiazanie_i_bieg_przechodzi(client: TestClient) -> None:
    case_id = _nowy_przypadek(client)
    _siec_bez_modelu_pv(client, case_id)
    gotowosc_adres = f"/api/dynamika/study-cases/{case_id}/gotowosc"

    gotowosc = client.get(gotowosc_adres).json()
    pv = next(z for z in gotowosc["zrodla"] if z["ref_id"] == REFY.pv)
    assert pv["stan"] == "brak"
    assert pv["akcja_naprawcza"]["kod"] == "der.dynamika_missing"
    assert pv["akcja_naprawcza"]["nawigacja"] == {
        "panel": "analizy",
        "tab": "dynamika",
        "focus": "dynamic_model_ref",
    }
    assert "default_pv_gfl" in [p["profile_id"] for p in pv["profile_zgodne"]]
    assert gotowosc["biegi_rozplywu"] == []
    (brak,) = (
        b for b in gotowosc["braki_modelu"] if b["kod"] == "dynamika.zrodlo_bez_bloku_dynamiki"
    )
    # Projektant czyta NAZWĘ wytwórcy, nie identyfikator — w komunikacie i w liście elementów.
    assert brak["elementy"] == [{"ref_id": REFY.pv, "nazwa": pv["nazwa"]}]
    assert f"„{pv['nazwa']}”" in brak["komunikat_pl"] and REFY.pv not in brak["komunikat_pl"]
    powody = " ".join(gotowosc["gotowosc"]["missing_fields_pl"])
    assert f"wytwórca „{pv['nazwa']}”" in powody and REFY.pv not in powody
    # Karta modeli odbiorów: odbiór bez modelu dynamicznego — ten sam wzorzec (stan, akcja
    # naprawcza kanonu z nawigacją do TEJ SAMEJ sekcji ekranu, powód z nazwą odbioru).
    (odbior,) = gotowosc["odbiory"]
    assert odbior["ref_id"] == REFY.odbior and odbior["stan"] == "brak"
    assert odbior["akcja_naprawcza"]["kod"] == "load.dynamika_missing"
    assert odbior["akcja_naprawcza"]["nawigacja"] == pv["akcja_naprawcza"]["nawigacja"]
    assert [p["profile_id"] for p in gotowosc["profile_odbiorow"]] == [PROFIL_ODBIORU]
    assert all(
        p["podstawa_u_min_pl"] and p["jakosc"] == "ESTIMATED" for p in gotowosc["profile_odbiorow"]
    )
    (brak_odbioru,) = (
        b for b in gotowosc["braki_modelu"] if b["kod"] == "dynamika.odbior_bez_bloku_dynamiki"
    )
    assert brak_odbioru["elementy"] == [{"ref_id": REFY.odbior, "nazwa": odbior["nazwa"]}]
    assert REFY.odbior not in brak_odbioru["komunikat_pl"]
    assert f"odbiór „{odbior['nazwa']}”" in powody and "load.dynamika_missing" in powody

    scenariusz = client.post(
        f"/api/dynamika/study-cases/{case_id}/scenariusze",
        json={"name": "Zwarcie w odcinku 2", "dynamika": SCENARIUSZ_IZOLACJI},
    ).json()

    pf_przed = _uruchom_rozplyw(client, case_id)
    assert [b["run_id"] for b in client.get(gotowosc_adres).json()["biegi_rozplywu"]] == [pf_przed]
    odmowa = _bieg(client, case_id, scenariusz["scenario_id"], pf_przed)
    assert odmowa["status"] == "FAILED"
    assert "dynamika.zrodlo_bez_bloku_dynamiki" in odmowa["error_message"]

    wiazanie = _operacja(
        client,
        case_id,
        "set_der_catalog_bindings",
        {"generator_ref": REFY.pv, "dynamic_model_ref": "default_pv_gfl"},
    )
    pv_po = next(g for g in wiazanie["snapshot"]["generators"] if g["ref_id"] == REFY.pv)
    assert pv_po["dynamika"]["rodzina"] == "przeksztaltnikowa_gfl"

    gotowosc_po = client.get(gotowosc_adres).json()
    assert next(z for z in gotowosc_po["zrodla"] if z["ref_id"] == REFY.pv)["stan"] == (
        "z_katalogu"
    )
    # Wiązanie zmieniło migawkę: rozpływ sprzed wiązania NIE jest punktem pracy tej sieci.
    assert gotowosc_po["biegi_rozplywu"] == []

    # Iloczyn gotowość <-> akcja <-> bieg dla KAŻDEGO kodu braku: po związaniu PV bieg nadal
    # odmawia — tym razem odbiorem bez modelu (nazwa odbioru w komunikacie, nie identyfikator).
    pf_bez_odbioru = _uruchom_rozplyw(client, case_id)
    odmowa_odbioru = _bieg(client, case_id, scenariusz["scenario_id"], pf_bez_odbioru)
    assert odmowa_odbioru["status"] == "FAILED"
    assert "dynamika.odbior_bez_bloku_dynamiki" in odmowa_odbioru["error_message"]
    assert REFY.odbior not in odmowa_odbioru["error_message"]
    assert f"„{NAZWA_ODBIORU}”" in odmowa_odbioru["error_message"]

    wiazanie_odbioru = _operacja(
        client,
        case_id,
        "set_load_dynamic_binding",
        {"load_ref": REFY.odbior, "dynamic_model_ref": PROFIL_ODBIORU},
    )
    (odbior_po,) = wiazanie_odbioru["snapshot"]["loads"]
    assert odbior_po["dynamika"]["u_min_pu"] == 0.7
    assert odbior_po["dynamika"]["t_pomiaru_czestotliwosci_s"] is None
    gotowosc_z_odbiorem = client.get(gotowosc_adres).json()
    assert [o["stan"] for o in gotowosc_z_odbiorem["odbiory"]] == ["z_katalogu"]
    assert gotowosc_z_odbiorem["odbiory"][0]["akcja_naprawcza"] is None
    assert gotowosc_z_odbiorem["braki_modelu"] == []

    pf_po = _uruchom_rozplyw(client, case_id)
    bieg = _bieg(client, case_id, scenariusz["scenario_id"], pf_po)
    assert bieg["status"] == "DONE", bieg["error_message"]

    wynik = client.get(f"/api/analysis-runs/{bieg['run_id']}/results/dynamika").json()
    assert wynik["kontrakt"] == "resultset_dynamic_v2"
    odcinek = REFY.odcinek_zwarcia
    assert [(z["rodzaj"], z["ref"]) for z in wynik["zdarzenia_wykonane"]] == [
        ("zwarcie_galezi", odcinek),
        ("zdjecie_zwarcia_galezi", odcinek),
        ("wylaczenie_galezi", odcinek),
    ]
    # Skutek topologiczny izolacji: koniec magistrali odcięty razem z odbiorem.
    usuniecie = wynik["zdarzenia_wykonane"][1]
    assert usuniecie["obszary_odciete"] == [REFY.koniec_magistrali]
    assert len(usuniecie["odbiory_odciete"]) == 1
    # Oceny: dwa rekordy NIE_OCENIONO z powodem — bieg w trybie sieci nie wydaje werdyktu.
    assert [o["status_maszynowy"] for o in wynik["oceny"]] == ["NIE_OCENIONO", "NIE_OCENIONO"]
    assert all(o["wyjasnienie"]["czego_brakuje"] for o in wynik["oceny"])
    # Opis wyniku: nazwy z migawki biegu, zacisk gałęzi z nazwą szyny, miejsce x·L.
    opis = wynik["opis_wyniku"]
    kabel = opis["elementy"][odcinek]
    galaz = next(b for b in _SIEC["branches"] if b["ref_id"] == odcinek)
    nazwy_szyn = {b["ref_id"]: b["name"] for b in _SIEC["buses"]}
    assert kabel["nazwa"] == NAZWA_ODCINKA_ZWARCIA
    assert kabel["zacisk_od"]["szyna_nazwa"] == nazwy_szyn[galaz["from_bus_ref"]]
    assert kabel["zacisk_do"]["szyna_nazwa"] == NAZWA_KONCA_MAGISTRALI
    assert opis["elementy"][REFY.koniec_magistrali]["nazwa"] == NAZWA_KONCA_MAGISTRALI
    kanaly = {k["klucz"]: k for k in opis["kanaly"]}
    assert kanaly[f"i_od_pu@{odcinek}"]["zacisk"] == "od"
    assert kanaly[f"i_do_pu@{odcinek}"]["zacisk"] == "do"
    miejsce = next(k for k in opis["kanaly"] if k["grupa"] == "miejsce_zwarcia")
    assert miejsce["polozenie_zwarcia"] == 0.5 and miejsce["element_ref"] == odcinek
    assert opis["baza_mocy_mva"] is not None
    # Opis zdarzeń wykonanych: lista równoległa do kontraktu, rodzaj po polsku.
    assert [z["rodzaj_pl"] for z in opis["zdarzenia"]] == [
        "Zwarcie w gałęzi (miejsce x·L)",
        "Usunięcie zwarcia w gałęzi",
        "Wyłączenie gałęzi",
    ]
    assert {k["klucz"] for k in wynik["kanaly"]} == set(kanaly)
    # Harmonogram biegu pochodzi ZE SCENARIUSZA NAZWANEGO (projekcja na opcje biegu).
    assert wynik["tozsamosc"]["odcisk_harmonogramu"]


# ---------------------------------------------------------------------------
# Tryb sieci: scenariusz stanowiska badawczego poza ekranem (zapis i lista, jeden predykat)
# ---------------------------------------------------------------------------

#: Stanowisko badawcze kontraktu: źródło sieciowe GPZ zastąpione źródłem testowym.
_STANOWISKO: dict[str, Any] = {"impedancja": "idealna", "profil": []}


def test_scenariusz_stanowiska_odrzucony_przy_zapisie_i_poza_lista(client: TestClient) -> None:
    case_id = _nowy_przypadek(client)
    _siec_bez_modelu_pv(client, case_id)
    adres = f"/api/dynamika/study-cases/{case_id}/scenariusze"
    zrodlo = _SIEC["sources"][0]["ref_id"]
    stanowisko = {
        "horyzont_s": 0.3,
        "krok_wyjscia_s": 0.02,
        "stanowisko": {**_STANOWISKO, "zrodlo_ref": zrodlo},
    }
    ScenariuszDynamiczny.model_validate(stanowisko)  # kontrakt danych go przyjmuje

    odrzucony = client.post(adres, json={"name": "Stanowisko", "dynamika": stanowisko})
    assert odrzucony.status_code == 422, odrzucony.text
    assert [b["pole"] for b in odrzucony.json()["detail"]] == ["dynamika.stanowisko"]

    # Scenariusz stanowiska zapisany INNĄ drogą (magazyn projektu) nie trafia na listę ekranu.
    from application.twin_key import klucz_twin_dla_przypadku

    klucz = klucz_twin_dla_przypadku(case_id, client.app.state.uow_factory)
    zapisz_scenariusz(
        klucz,
        OperatingScenario(
            scenario_id="scen-stanowisko",
            name="Stanowisko badawcze",
            kind=RodzajScenariusza.CUSTOM,
            dynamika=ScenariuszDynamiczny.model_validate(stanowisko),
        ),
    )
    siec = client.post(adres, json={"name": "Zwarcie", "dynamika": SCENARIUSZ_IZOLACJI})
    assert siec.status_code == 201, siec.text
    lista = client.get(adres).json()
    assert [s["name"] for s in lista["scenariusze"]] == ["Zwarcie"]


# ---------------------------------------------------------------------------
# Detektory przekroczeń: iloczyn detektor × tolerancja lokalizacji (podana / brak)
# ---------------------------------------------------------------------------


def test_bieg_z_detektorem_przekroczenie_z_opisem_a_bez_tolerancji_odmowa(
    client: TestClient,
) -> None:
    case_id = _nowy_przypadek(client)
    from application.twin_key import klucz_twin_dla_przypadku
    from enm.models import EnergyNetworkModel
    from enm.store import set_enm

    klucz = klucz_twin_dla_przypadku(case_id, client.app.state.uow_factory)
    siec = build_dynamika_projektanta_enm(z_modelem_pv=True, z_modelem_odbioru=True)
    set_enm(klucz, EnergyNetworkModel.model_validate(siec))
    scenariusz = client.post(
        f"/api/dynamika/study-cases/{case_id}/scenariusze",
        json={"name": "Zwarcie z detektorem", "dynamika": SCENARIUSZ_Z_DETEKTOREM},
    ).json()
    pf = _uruchom_rozplyw(client, case_id)

    bez_tolerancji = _bieg(client, case_id, scenariusz["scenario_id"], pf)
    assert bez_tolerancji["status"] == "FAILED"
    assert "dynamika.nastawy_sprzeczne" in bez_tolerancji["error_message"]

    bieg = _bieg(client, case_id, scenariusz["scenario_id"], pf, NASTAWY_Z_DETEKTOREM)
    assert bieg["status"] == "DONE", bieg["error_message"]
    wynik = client.get(f"/api/analysis-runs/{bieg['run_id']}/results/dynamika").json()
    assert wynik["tryb_scenariusza"] == "siec"
    assert wynik["przekroczenia"], "zapad napięcia szyny PV w czasie zwarcia nie zapisany"
    pierwsze = wynik["przekroczenia"][0]
    assert pierwsze["dozor"] == NAZWA_DETEKTORA_ZAPADU
    assert pierwsze["wielkosc"] == f"u_pu@{REFY.szyna_pv}"
    assert pierwsze["prog"] == PROG_DETEKTORA_ZAPADU_PU and pierwsze["kierunek"] == "w_dol"
    assert 0.05 <= pierwsze["t_s"] <= 0.15
    opis = wynik["opis_wyniku"]
    assert len(opis["przekroczenia"]) == len(wynik["przekroczenia"])
    opis_pierwszego = opis["przekroczenia"][0]
    assert opis_pierwszego["wielkosc_pl"] == "Moduł napięcia"
    assert opis_pierwszego["kierunek_pl"] == ETYKIETY_WARTOSCI[("kierunek", "w_dol")]
    szyna_pv = next(b for b in siec["buses"] if b["ref_id"] == REFY.szyna_pv)
    assert opis["elementy"][REFY.szyna_pv]["nazwa"] == szyna_pv["name"]
    # Detektor nie działa na sieć: te same zdarzenia wykonane co bez detektora, z harmonogramu.
    assert [z["rodzaj"] for z in wynik["zdarzenia_wykonane"]] == [
        "zwarcie_galezi",
        "zdjecie_zwarcia_galezi",
        "wylaczenie_galezi",
    ]
    assert {z["przyczyna"] for z in wynik["zdarzenia_wykonane"]} == {"harmonogram"}
    assert {z["przyczyna_pl"] for z in opis["zdarzenia"]} == {"zadane w harmonogramie scenariusza"}


# ---------------------------------------------------------------------------
# Opis wyniku: przyczyna, przypisania stanu, przekroczenia; stany urządzeń; tryb
# ---------------------------------------------------------------------------


def _ladunek_opisu(
    przyczyna: str, przypisania: list[dict[str, Any]], przekroczenia: list[dict[str, Any]]
) -> dict[str, Any]:
    return {
        "kanaly": [
            {
                "klucz": f"u_pu@{REFY.szyna_pv}",
                "element_ref": REFY.szyna_pv,
                "jednostka": "pu",
                "przestrzen": "szyna",
            }
        ],
        "metryki": [],
        "zdarzenia_wykonane": [
            {
                "rodzaj": "komenda_regulacji",
                "ref": REFY.pv,
                "przyczyna": przyczyna,
                "przypisania": przypisania,
                "obszary_odciete": [],
                "obszary_zasilone_ponownie": [],
                "odbiory_odciete": [],
            }
        ],
        "przekroczenia": przekroczenia,
    }


@pytest.mark.parametrize(
    ("przyczyna", "oczekiwana"),
    [
        ("harmonogram", "zadane w harmonogramie scenariusza"),
        ("dozor:Zapad", "zdarzenie warunkowe detektora „Zapad”"),
        ("inna", "przyczyna rdzenia „inna”"),
    ],
)
@pytest.mark.parametrize("zapisany_kanal", [True, False])
def test_opis_wyniku_przyczyna_przypisania_i_przekroczenia(
    przyczyna: str, oczekiwana: str, zapisany_kanal: bool
) -> None:
    """Iloczyn przyczyna (harmonogram / dozór / inna) × kanał detektora (zapisany w wyniku
    albo nie): opis nie zgaduje — przyczyna spoza obu form i jednostka kanału niezapisanego
    są nazwane wprost (`None` jednostki, tekst rdzenia przyczyny)."""
    klucz = f"u_pu@{REFY.szyna_pv}" if zapisany_kanal else f"f_hz@{REFY.koniec_magistrali}"
    ladunek = _ladunek_opisu(
        przyczyna,
        [{"adres": f"{REFY.pv}.p_zadane_pu", "przed": 0.2, "po": 0.1}],
        [
            {
                "dozor": "Zapad",
                "wielkosc": klucz,
                "prog": 0.8,
                "kierunek": "w_gore",
                "t_s": 0.1,
                "szerokosc_przedzialu_s": 0.0,
                "iteracje": 0,
            }
        ],
    )
    opis = opis_wyniku_dynamiki(ladunek, _SIEC, baza_mocy_mva=None)
    (zdarzenie,) = opis["zdarzenia"]
    assert zdarzenie["rodzaj_pl"] == "Zmiana nastawy regulatora"
    assert zdarzenie["przyczyna_pl"] == oczekiwana
    assert zdarzenie["przypisania"] == [
        {
            "element_ref": REFY.pv,
            "stan_pl": "Moc czynna zadana przekształtnika",
            "jednostka": "pu",
        }
    ]
    (przekroczenie,) = opis["przekroczenia"]
    assert przekroczenie["kierunek_pl"] == ETYKIETY_WARTOSCI[("kierunek", "w_gore")]
    if zapisany_kanal:
        assert przekroczenie["wielkosc_pl"] == "Moduł napięcia"
        assert przekroczenie["jednostka"] == "pu"
        assert przekroczenie["element_ref"] == REFY.szyna_pv
    else:
        assert przekroczenie["wielkosc_pl"] == "Częstotliwość elektryczna"
        assert przekroczenie["jednostka"] is None
        assert przekroczenie["element_ref"] == REFY.koniec_magistrali
    # Każdy element wskazany przez przypisanie i przekroczenie jest w słowniku nazw.
    assert {REFY.pv, przekroczenie["element_ref"]} <= set(opis["elementy"])


def test_opisy_stanow_obejmuja_kazdy_stan_rodzin_urzadzen_rdzenia() -> None:
    """Każda zmienna stanu, którą rdzeń może zapisać jako kanał urządzenia (wszystkie rodziny
    i konfiguracje regulacji biblioteki urządzeń rdzenia), ma opis po polsku — kanał bez
    opisu pokazywałby nazwę techniczną stanu."""
    from tests.network_model.dynamika import biblioteka_urzadzen as biblioteka

    urzadzenia = [
        biblioteka.maszyna(),
        biblioteka.maszyna(z_wzbudzeniem=True, z_turbina=True, z_stabilizatorem=True),
        biblioteka.przeksztaltnik_gfl(),
        biblioteka.przeksztaltnik_gfm(),
        biblioteka.magazyn(),
        biblioteka.magazyn(rdzen=biblioteka.rdzen_gfm()),
        biblioteka.turbina(typ="wiatr_typ_3", crowbar=biblioteka.crowbar_typowy()),
        biblioteka.turbina(typ="wiatr_typ_4"),
    ]
    nazwy = (
        set(NAZWY_STANOW_SZYNY_SZTYWNEJ)
        | set(NAZWY_STANOW_ZRODLA_TESTOWEGO)
        | set(NAZWY_STANOW_MASZYNY_KLASYCZNEJ)
    )
    for urzadzenie in urzadzenia:
        nazwy |= set(urzadzenie.nazwy_stanow)
    assert sorted(nazwy - set(_STANY_URZADZEN)) == []
    # Każda zmienna stanu ma jednostkę z sufiksu nazwy (przypisania stanu w osi zdarzeń).
    assert sorted(n for n in nazwy if _jednostka_stanu(n) is None) == []
    assert _jednostka_stanu("sem_modul_tempo_pu_na_s") == "pu/s"


def test_opisy_trybu_scenariusza_obejmuja_kazdy_tryb_kontraktu() -> None:
    assert set(OPISY_TRYBU_SCENARIUSZA) == set(get_args(TrybScenariusza))


def test_pole_referencji_bez_roli_w_predykacie_zatrzymuje_opis() -> None:
    """Deklaracja „pole referencji zawsze ma rolę z predykatu walidacji" jest egzekwowana:
    brak roli nie degraduje formantu do pola tekstowego, tylko zatrzymuje budowę opisu."""
    from application.dynamika.opis_scenariusza import _bez_brakow_rol

    with pytest.raises(RuntimeError, match="bez roli"):
        _bez_brakow_rol(Detektor, ("bus_ref",), {})
    _bez_brakow_rol(Detektor, ("bus_ref",), {"bus_ref": ("buses",)})


def test_zalozenia_sa_jedna_lista_zdan_z_nazwami() -> None:
    """Przepisane z intencją (karta modeli odbiorów, §0 pkt 6): dawniej opis wyniku dzielił
    założenia na część MODELU (zdania z nazwami) i ZAPIS RDZENIA (zdania silnika bez nazw,
    z identyfikatorami — zwinięty widok techniczny). Rdzeń oddaje dziś rekordy, a zdania z
    nazwami składa warstwa aplikacji, więc na pierwszym planie jest JEDNA lista — ta sama,
    którą niesie pole `zalozenia` wyniku; opis nie ma już części „zapisu rdzenia"."""
    zapis = ["Zdanie pierwsze.", "Zdanie drugie."]
    opis = opis_wyniku_dynamiki({"zalozenia": zapis}, _SIEC, baza_mocy_mva=None)
    assert opis["zalozenia_modelu"] == zapis
    assert "zalozenia_rdzenia" not in opis
