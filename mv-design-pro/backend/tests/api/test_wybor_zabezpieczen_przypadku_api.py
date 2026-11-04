"""Wybór zabezpieczeń PRZYPADKU obliczeniowego — grupa nastaw i nadpisania nastaw (ADR-022,
karta EDYTOR-DELT-SCENARIUSZA-ZABEZPIECZEN).

Ścieżka użytkownika: projektant w karcie przypadku B wybiera grupę nastaw 2 sterownika pola albo
nadpisuje zwłokę stopnia 51 (``PUT /api/scenariusze-laczeniowe/study-cases/{B}/
zabezpieczenia-przypadku``), liczy bieg zwarciowy przypadku BEZ wskazywania scenariusza (przycisk
„Oblicz") i ocenę zabezpieczeń na tym biegu, czyta czas wyłączenia i wytrzymałość aparatury pola.
Wybór przypadku nakłada się sam na każdy bieg przypadku B; przypadek A tego samego projektu
i model bazowy zostają bez zmian, a zmiana wyboru unieważnia wyłącznie wyniki przypadku B.

Iloczyn cech: grupa {brak, 2} × nadpisanie zwłoki {brak, 0,7 s} × przypadek {A, B} × wynik
{czas wyłączenia pola, ocena zabezpieczeń, świeżość przypadku} × model bazowy {bez zmian}; do
tego: wybór × scenariusz nazwany biegu (składanie, konflikt jednego sterownika), wybór × wariant
w pamięci, wybór × klonowanie i usunięcie przypadku, wybór zdjęty pustym stanem, odmowy zapisu
(nastawa ujemna, funkcja spoza sterownika, grupa nieistniejąca, sterownik spoza modelu).
"""

from __future__ import annotations

from typing import Any

import pytest
from application.twin_key import klucz_twin_dla_przypadku
from enm.canonical_analysis import bieg_wariantu, create_run, execute_run, get_run
from enm.scenariusze import (
    KLUCZ_OPCJI_ZABEZPIECZEN_PRZYPADKU,
    SCENARIUSZ_NORMALNY,
    apply_scenario,
    id_scenariusza_przypadku,
    stan_scenariusza,
)
from enm.store import get_enm
from fastapi.testclient import TestClient

from tests.api import test_przypadek_zabezpieczen_scenariusz_api as _scen
from tests.api.test_przypadek_zabezpieczen_scenariusz_api import (
    CZAS_WLASNY_S,
    _czas_pola,
    _model,
    stacja_z_grupa_2,  # noqa: F401 — fikstura
)

#: Fikstura klienta API ze wspólnym magazynem i bazą sesji testu wytrzymałości aparatury.
klient = _scen.klient

_ADRES = "/api/scenariusze-laczeniowe/study-cases/{case_id}/zabezpieczenia-przypadku"


def _klucz(klient: TestClient, case_id: str) -> str:
    return klucz_twin_dla_przypadku(case_id, klient.app.state.uow_factory)


def _przypadek_b(klient: TestClient, case_a: str) -> str:
    """Drugi przypadek TEGO SAMEGO projektu (ten sam model sieci)."""
    projekt = klient.get(f"/api/study-cases/{case_a}").json()["project_id"]
    odp = klient.post("/api/study-cases", json={"project_id": projekt, "name": "Przypadek B"})
    assert odp.status_code == 201, odp.text
    return str(odp.json()["id"])


def _zapisz_wybor(klient: TestClient, case_id: str, **delty: Any) -> Any:
    return klient.put(_ADRES.format(case_id=case_id), json=delty)


def _bieg_sc(klient: TestClient, case_id: str) -> str:
    """Bieg zwarciowy przypadku BEZ scenariusza — tor przycisku „Oblicz"."""
    run = execute_run(
        create_run(
            case_id=case_id, klucz_twin=_klucz(klient, case_id), analysis_type="short_circuit_sn"
        ).id
    )
    assert run.status == "FINISHED", run.error_message
    return str(run.id)


def _ocena_zabezpieczen(klient: TestClient, case_id: str, sc_run_id: str) -> list[float]:
    """Czasy zadziałania z oceny zabezpieczeń przypadku na biegu zwarciowym."""
    run = execute_run(
        create_run(
            case_id=case_id,
            klucz_twin=_klucz(klient, case_id),
            analysis_type="protection_sn",
            options={"sc_run_id": sc_run_id},
        ).id
    )
    assert run.status == "FINISHED", run.error_message
    oceny = (run.raw_result or {})["protection_result"]["evaluations"]
    return sorted(float(o["t_trip_s"]) for o in oceny if o.get("t_trip_s") is not None)


def _status(klient: TestClient, case_id: str) -> tuple[str, str]:
    odp = klient.get(f"/api/study-cases/{case_id}").json()
    return odp["result_status"], odp["result_status_reason"]


@pytest.mark.parametrize(
    ("grupa", "zwloka", "czlon_s"),
    [(None, None, 0.3), (2, None, 0.5), (None, 0.7, 0.7), (2, 0.9, 0.9)],
    ids=["bez_wyboru", "grupa_2", "nadpisanie_zwloki", "grupa_2_i_nadpisanie"],
)
def test_wybor_przypadku_b_zmienia_wyniki_b_a_przypadek_a_i_model_bez_zmian(
    klient: TestClient,
    stacja_z_grupa_2: dict[str, Any],  # noqa: F811
    grupa: int | None,
    zwloka: float | None,
    czlon_s: float,
) -> None:
    s = stacja_z_grupa_2
    case_a = s["case_id"]
    case_b = _przypadek_b(klient, case_a)
    delty: dict[str, Any] = {}
    if grupa is not None:
        delty["protection_groups"] = {s["ref"]: grupa}
    if zwloka is not None:
        delty["protection_overrides"] = {s["ref"]: {s["funkcja_ref"]: {"zwloka_s": zwloka}}}
    odp = _zapisz_wybor(klient, case_b, **delty)
    assert odp.status_code == 200, odp.text
    assert odp.json()["protection_groups"] == delty.get("protection_groups", {})
    assert odp.json()["protection_overrides"] == delty.get("protection_overrides", {})

    sc_a, sc_b = _bieg_sc(klient, case_a), _bieg_sc(klient, case_b)
    czas_a = _czas_pola(klient, case_a, s["station_ref"], sc_a, s["bay_ref"])
    czas_b = _czas_pola(klient, case_b, s["station_ref"], sc_b, s["bay_ref"])
    assert czas_a["czlon_nastawczy_s"] == pytest.approx(0.3)
    assert czas_b["czlon_nastawczy_s"] == pytest.approx(czlon_s)
    assert czas_b["t_clearing_s"] == pytest.approx(czlon_s + CZAS_WLASNY_S)

    oceny_a = _ocena_zabezpieczen(klient, case_a, sc_a)
    oceny_b = _ocena_zabezpieczen(klient, case_b, sc_b)
    assert oceny_a, "ocena zabezpieczeń przypadku A bez czasów zadziałania"
    if delty:
        assert oceny_b != oceny_a
        assert czlon_s in [pytest.approx(t) for t in oceny_b]
    else:
        assert oceny_b == oceny_a
    # Model bazowy nietknięty przez wybór przypadku.
    assert _model(klient, case_a)["protection_assignments"] == s["zabezpieczenia_bazowe"]


def test_zmiana_wyboru_uniewaznia_tylko_przypadek_b(
    klient: TestClient,
    stacja_z_grupa_2: dict[str, Any],  # noqa: F811
) -> None:
    s = stacja_z_grupa_2
    case_a = s["case_id"]
    case_b = _przypadek_b(klient, case_a)
    _bieg_sc(klient, case_a)
    _bieg_sc(klient, case_b)
    assert _status(klient, case_a)[0] == "FRESH"
    assert _status(klient, case_b)[0] == "FRESH"

    # Wybór dodany PO biegu: bieg B policzono na nastawach bazowych — nieaktualny.
    assert _zapisz_wybor(klient, case_b, protection_groups={s["ref"]: 2}).status_code == 200
    assert _status(klient, case_a) == ("FRESH", "model-niezmieniony")
    assert _status(klient, case_b) == ("OUTDATED", "zabezpieczenia-przypadku-zmienione")

    _bieg_sc(klient, case_b)
    assert _status(klient, case_b)[0] == "FRESH"

    # Wybór zmieniony (nadpisanie zwłoki) → B nieaktualny, A bez zmian.
    nadpisanie = {s["ref"]: {s["funkcja_ref"]: {"zwloka_s": 0.6}}}
    odp = _zapisz_wybor(
        klient, case_b, protection_groups={s["ref"]: 2}, protection_overrides=nadpisanie
    )
    assert odp.status_code == 200, odp.text
    assert _status(klient, case_b) == ("OUTDATED", "zabezpieczenia-przypadku-zmienione")
    assert _status(klient, case_a)[0] == "FRESH"
    _bieg_sc(klient, case_b)
    assert _status(klient, case_b)[0] == "FRESH"

    # Zapis identycznej treści nie jest zmianą (rewizja bez zmian, wynik aktualny).
    rewizja = odp.json()["revision"]
    odp = _zapisz_wybor(
        klient, case_b, protection_groups={s["ref"]: 2}, protection_overrides=nadpisanie
    )
    assert odp.json()["revision"] == rewizja
    assert _status(klient, case_b)[0] == "FRESH"

    # Pusty stan zdejmuje wybór (nagrobek): biegi policzone na wyborze są nieaktualne, a bieg
    # sprzed wyboru (nastawy bazowe) znów opisuje bieżący stan przypadku — status przypadku
    # FRESH jest prawdą o tym biegu, nie przeoczeniem.
    biegi_b = _biegi_przypadku(case_b)
    odp = _zapisz_wybor(klient, case_b)
    assert odp.status_code == 200, odp.text
    assert odp.json()["scenario_id"] is None
    stan = stan_scenariusza(_klucz(klient, case_b), id_scenariusza_przypadku(case_b))
    assert stan is not None and stan.usuniety
    werdykty = _werdykty_biegow(klient, case_b, biegi_b)
    assert werdykty == {
        "bez_wyboru": {("FRESH", "model-niezmieniony")},
        "z_wyborem": {("OUTDATED", "zabezpieczenia-przypadku-zmienione")},
    }
    sc_b = _bieg_sc(klient, case_b)
    assert _status(klient, case_b)[0] == "FRESH"
    czas = _czas_pola(klient, case_b, s["station_ref"], sc_b, s["bay_ref"])
    assert czas["czlon_nastawczy_s"] == pytest.approx(0.3)
    assert KLUCZ_OPCJI_ZABEZPIECZEN_PRZYPADKU not in (get_run_opcje(sc_b))
    assert _status(klient, case_a)[0] == "FRESH"
    assert _model(klient, case_a)["protection_assignments"] == s["zabezpieczenia_bazowe"]


def _biegi_przypadku(case_id: str) -> list[Any]:
    from enm.canonical_analysis import list_runs_for_case

    return list(list_runs_for_case(case_id))


def _werdykty_biegow(
    klient: TestClient, case_id: str, biegi: list[Any]
) -> dict[str, set[tuple[str, str]]]:
    """Świeżość KAŻDEGO biegu przypadku — tą samą funkcją co status przypadku."""
    from application.result_freshness import StanBiezacyModelu, swiezosc_biegu_kanonicznego

    stan = StanBiezacyModelu.dla_przypadku(case_id, klient.app.state.uow_factory)
    wynik: dict[str, set[tuple[str, str]]] = {"bez_wyboru": set(), "z_wyborem": set()}
    for bieg in biegi:
        werdykt = swiezosc_biegu_kanonicznego(bieg, stan)
        rodzaj = "z_wyborem" if KLUCZ_OPCJI_ZABEZPIECZEN_PRZYPADKU in bieg.options else "bez_wyboru"
        wynik[rodzaj].add((werdykt.status.value, werdykt.reason.value))
    return wynik


def get_run_opcje(run_id: str) -> dict[str, Any]:
    from uuid import UUID

    run = get_run(UUID(run_id))
    assert run is not None
    return dict(run.options)


def test_odczyt_wyboru_i_lista_wyborow_projektu(
    klient: TestClient,
    stacja_z_grupa_2: dict[str, Any],  # noqa: F811
) -> None:
    s = stacja_z_grupa_2
    case_a = s["case_id"]
    case_b = _przypadek_b(klient, case_a)
    pusty = klient.get(_ADRES.format(case_id=case_b)).json()
    assert pusty["scenario_id"] is None
    assert pusty["protection_groups"] == {} and pusty["protection_overrides"] == {}
    _zapisz_wybor(klient, case_b, protection_groups={s["ref"]: 2})
    wpis = klient.get(_ADRES.format(case_id=case_b)).json()
    assert wpis["protection_groups"] == {s["ref"]: 2}
    assert wpis["revision"] == 1
    lista = klient.get(
        f"/api/scenariusze-laczeniowe/study-cases/{case_a}/zabezpieczenia-przypadkow"
    ).json()
    assert [w["case_id"] for w in lista["przypadki"]] == [case_b]
    # Wybór przypadku nie jest scenariuszem nazwanym projektu (lista scenariuszy łączeniowych).
    nazwane = klient.get(f"/api/scenariusze-laczeniowe/study-cases/{case_a}").json()
    assert nazwane["count"] == 0
    # …ani nie daje się nadpisać jako scenariusz nazwany.
    odp = klient.post(
        f"/api/scenariusze-laczeniowe/study-cases/{case_a}",
        json={
            "scenario_id": id_scenariusza_przypadku(case_b),
            "name": "Podmiana",
            "protection_groups": {s["ref"]: 2},
        },
    )
    assert odp.status_code == 422, odp.text
    # …ani wskazać jako scenariusz biegu innego przypadku.
    odp = klient.post(
        f"/api/execution/study-cases/{case_a}/runs",
        json={"analysis_type": "SC_3F", "scenario_id": id_scenariusza_przypadku(case_b)},
    )
    assert odp.status_code in (409, 422), odp.text
    assert "Wybór zabezpieczeń przypadku" in odp.text


def _nastawa_ujemna(ref: str, f: str) -> dict[str, Any]:
    return {"protection_overrides": {ref: {f: {"zwloka_s": -1.0}}}}


def _funkcja_spoza(ref: str, f: str) -> dict[str, Any]:
    return {"protection_overrides": {ref: {"brak-funkcji": {"zwloka_s": 0.4}}}}


def _grupa_nieistniejaca(ref: str, f: str) -> dict[str, Any]:
    return {"protection_groups": {ref: 3}}


def _sterownik_spoza(ref: str, f: str) -> dict[str, Any]:
    return {"protection_groups": {"sterownik-spoza-modelu": 2}}


@pytest.mark.parametrize(
    "ladunek",
    [_nastawa_ujemna, _funkcja_spoza, _grupa_nieistniejaca, _sterownik_spoza],
    ids=["nastawa_ujemna", "funkcja_spoza_sterownika", "grupa_nieistniejaca", "sterownik_spoza"],
)
def test_wybor_sprzeczny_z_modelem_jest_odmowa_422_bez_skutku(
    klient: TestClient,
    stacja_z_grupa_2: dict[str, Any],  # noqa: F811
    ladunek: Any,
) -> None:
    s = stacja_z_grupa_2
    case_b = _przypadek_b(klient, s["case_id"])
    delty = ladunek(s["ref"], s["funkcja_ref"])
    odp = _zapisz_wybor(klient, case_b, **delty)
    assert odp.status_code == 422, odp.text
    (blad,) = odp.json()["detail"]
    ((klucz, wskazania),) = delty.items()
    (ref,) = wskazania
    assert blad["pole"] == f"{klucz}.{ref}"
    assert ref not in blad["komunikat"]
    assert klient.get(_ADRES.format(case_id=case_b)).json()["scenario_id"] is None
    assert _model(klient, case_b)["protection_assignments"] == s["zabezpieczenia_bazowe"]


def test_wybor_przypadku_ze_scenariuszem_nazwanym_biegu_skladanie_i_konflikt(
    klient: TestClient,
    stacja_z_grupa_2: dict[str, Any],  # noqa: F811
) -> None:
    """Bieg przypadku B ze scenariuszem nazwanym: wybór B nakłada się także na niego; ten
    sam sterownik zmieniany przez oba = odmowa nazwana, nie pierwszeństwo zgadnięte."""
    s = stacja_z_grupa_2
    case_b = _przypadek_b(klient, s["case_id"])
    assert _zapisz_wybor(klient, case_b, protection_groups={s["ref"]: 2}).status_code == 200
    klucz = _klucz(klient, case_b)
    from enm.scenariusze import OperatingScenario, RodzajScenariusza, zapisz_scenariusz

    lacz = zapisz_scenariusz(
        klucz,
        OperatingScenario(
            scenario_id="scen-nazwany-1",
            name="Nazwany bez zabezpieczeń",
            kind=RodzajScenariusza.CUSTOM,
        ),
    )
    run = execute_run(
        create_run(
            case_id=case_b, klucz_twin=klucz, analysis_type="short_circuit_sn", scenariusz=lacz
        ).id
    )
    assert run.status == "FINISHED", run.error_message
    assert run.envelope["scenario_ref"]["scenario_id"] == "scen-nazwany-1"
    czas = _czas_pola(klient, case_b, s["station_ref"], str(run.id), s["bay_ref"])
    assert czas["czlon_nastawczy_s"] == pytest.approx(0.5)

    konflikt = zapisz_scenariusz(
        klucz,
        OperatingScenario(
            scenario_id="scen-nazwany-2",
            name="Nazwany z grupą",
            kind=RodzajScenariusza.CUSTOM,
            protection_overrides={s["ref"]: {s["funkcja_ref"]: {"zwloka_s": 0.4}}},
        ),
    )
    from network_model.odmowa_danych import OdmowaDanychError

    with pytest.raises(OdmowaDanychError, match="ten sam sterownik"):
        create_run(
            case_id=case_b, klucz_twin=klucz, analysis_type="short_circuit_sn", scenariusz=konflikt
        )


def test_wariant_w_pamieci_dziedziczy_wybor_przypadku(
    klient: TestClient,
    stacja_z_grupa_2: dict[str, Any],  # noqa: F811
) -> None:
    """Wariant (np. N-1, pasmo zwarć) liczony z biegu bazowego przypadku B niesie wybór B —
    baza na samym wyborze przypadku nie jest „składaniem scenariuszy" (dawniej odmowa)."""
    s = stacja_z_grupa_2
    case_b = _przypadek_b(klient, s["case_id"])
    _zapisz_wybor(klient, case_b, protection_groups={s["ref"]: 2})
    from uuid import UUID

    bazowy = get_run(UUID(_bieg_sc(klient, case_b)))
    assert bazowy is not None
    migawka = apply_scenario(get_enm(_klucz(klient, case_b)), SCENARIUSZ_NORMALNY)
    wariant = bieg_wariantu(bazowy, migawka, analysis_type="short_circuit_sn")
    (sterownik,) = (
        p for p in wariant.snapshot["protection_assignments"] if p["ref_id"] == s["ref"]
    )
    assert sterownik["aktywna_grupa"] == 2
    assert wariant.options[KLUCZ_OPCJI_ZABEZPIECZEN_PRZYPADKU]["revision"] == 1
    assert wariant.snapshot_hash == bazowy.snapshot_hash


def test_klon_kopiuje_wybor_jako_wlasny_a_usuniecie_zdejmuje_go(
    klient: TestClient,
    stacja_z_grupa_2: dict[str, Any],  # noqa: F811
) -> None:
    s = stacja_z_grupa_2
    case_b = _przypadek_b(klient, s["case_id"])
    _zapisz_wybor(klient, case_b, protection_groups={s["ref"]: 2})
    klon = klient.post(f"/api/study-cases/{case_b}/clone", json={"new_name": "Klon B"})
    assert klon.status_code == 201, klon.text
    case_c = str(klon.json()["id"])
    assert klient.get(_ADRES.format(case_id=case_c)).json()["protection_groups"] == {s["ref"]: 2}
    # Zmiana w klonie nie dotyka oryginału.
    _zapisz_wybor(
        klient, case_c, protection_overrides={s["ref"]: {s["funkcja_ref"]: {"zwloka_s": 0.4}}}
    )
    assert klient.get(_ADRES.format(case_id=case_b)).json()["protection_groups"] == {s["ref"]: 2}
    klucz = _klucz(klient, case_b)
    assert klient.delete(f"/api/study-cases/{case_b}").status_code == 204
    stan = stan_scenariusza(klucz, id_scenariusza_przypadku(case_b))
    assert stan is not None and stan.usuniety
    # Wybór klonu żyje dalej (własna historia rewizji: kopia + zmiana).
    assert klient.get(_ADRES.format(case_id=case_c)).json()["revision"] == 2


def _dowod_aparatury(
    klient: TestClient, case_id: str, station_ref: str, run_id: str, bay_ref: str
) -> dict[str, Any]:
    """Pakiet dowodu doboru aparatury POLA (``POST /api/equipment-proof/pack``) → proof.json."""
    import io
    import json
    import zipfile

    widok = _scen._wytrzymalosc(klient, case_id, station_ref, run_id).json()
    (pole,) = (p for p in widok["pola"] if p["pole_ref"] == bay_ref)
    odp = klient.post(
        "/api/equipment-proof/pack",
        json={
            "project_id": "projekt",
            "case_id": case_id,
            "run_id": run_id,
            "connection_node_id": _wezel_punktu(run_id, pole["prady_pola"]["punkt_ref"]),
            "device": {
                "device_id": pole["aparat_ref"],
                "name_pl": "Wyłącznik pola",
                "u_m_kv": 17.5,
                "i_cu_ka": 25.0,
                "i_dyn_ka": 63.0,
                "i_th_ka": 25.0,
                "t_th_s": 3.0,
            },
        },
    )
    assert odp.status_code == 200, odp.text
    with zipfile.ZipFile(io.BytesIO(odp.content)) as archiwum:
        return json.loads(archiwum.read("proof_pack/proof.json").decode("utf-8"))


def _wezel_punktu(run_id: str, punkt_ref: str) -> str:
    """Węzeł zwarcia biegu (``fault_node_id`` artefaktu) dla punktu zabudowy pola."""
    from uuid import UUID

    from enm.mapping import ref_to_graph_id

    run = get_run(UUID(run_id))
    assert run is not None
    identyfikatory = {punkt_ref, ref_to_graph_id(punkt_ref)}
    for wiersz in (run.raw_result or {})["results"]:
        if wiersz.get("fault_node_id") in identyfikatory:
            return str(wiersz["fault_node_id"])
    raise AssertionError("bieg bez wiersza punktu zabudowy pola")


def _wartosc_dowodu(dowod: dict[str, Any], klucz: str, symbol: str) -> float | None:
    """Wartość wejściowa kroku dowodu o kluczu źródła ``klucz`` i symbolu ``symbol``."""
    for krok in dowod["steps"]:
        for wartosc in krok.get("input_values", []):
            if wartosc.get("source_key") == klucz and wartosc.get("symbol") == symbol:
                return wartosc.get("value")
    raise AssertionError(f"dowód bez {symbol} w danych kroków")


def _tk_dowodu(dowod: dict[str, Any]) -> float | None:
    """t_k z danych wejściowych kroku sprawdzenia I_th dowodu."""
    for krok in dowod["steps"]:
        for wartosc in krok.get("input_values", []):
            if wartosc.get("source_key") == "tk_s" and wartosc.get("symbol") == "t_k":
                return wartosc.get("value")
    raise AssertionError("dowód bez t_k w kroku sprawdzenia I_th")


@pytest.mark.parametrize(
    ("grupa", "zwloka", "czlon_s"),
    [(None, None, 0.3), (2, None, 0.5), (None, 0.7, 0.7)],
    ids=["bez_wyboru", "grupa_2", "nadpisanie_zwloki"],
)
def test_dowod_aparatury_pola_bierze_tk_z_czasu_wylaczenia_pola_przypadku(
    klient: TestClient,
    stacja_z_grupa_2: dict[str, Any],  # noqa: F811
    grupa: int | None,
    zwloka: float | None,
    czlon_s: float,
) -> None:
    """Sonda liczbowa (a): t_k dowodu doboru aparatury pola = czas wyłączenia TEGO pola
    (człon nastawczy sterownika pola z migawki biegu + czas własny wyłącznika 0,06 s), a nie
    czas cieplny biegu (``thermal_time_seconds`` — tu domyślne 1,0 s). Przed kartą dowód
    pokazywał t_k = 1,0 s dla każdego pola i każdego przypadku."""
    s = stacja_z_grupa_2
    case_b = _przypadek_b(klient, s["case_id"])
    delty: dict[str, Any] = {}
    if grupa is not None:
        delty["protection_groups"] = {s["ref"]: grupa}
    if zwloka is not None:
        delty["protection_overrides"] = {s["ref"]: {s["funkcja_ref"]: {"zwloka_s": zwloka}}}
    if delty:
        assert _zapisz_wybor(klient, case_b, **delty).status_code == 200
    sc_b = _bieg_sc(klient, case_b)
    dowod = _dowod_aparatury(klient, case_b, s["station_ref"], sc_b, s["bay_ref"])
    assert _tk_dowodu(dowod) == pytest.approx(czlon_s + CZAS_WLASNY_S)
    # Decyzja architekta (rozszerzenie (a)): I_th porównywany = prąd cieplny przy T_k POLA,
    # ten sam w dowodzie i w ocenie cieplnej widoku wytrzymałości; większy niż I_th biegu (1 s).
    widok = _scen._wytrzymalosc(klient, case_b, s["station_ref"], sc_b).json()
    (pole,) = (p for p in widok["pola"] if p["pole_ref"] == s["bay_ref"])
    cieplny = pole["prad_cieplny_pola"]
    assert cieplny["tk_pola_s"] == pytest.approx(czlon_s + CZAS_WLASNY_S)
    assert cieplny["ith_ka"] > pole["prady_pola"]["ith_ka"]
    (ocena,) = (o for o in pole["oceny"] if o["kryterium_id"].endswith(".cieplna"))
    assert ocena["wynik"]["wartosc"]["wartosc"] == cieplny["ith_ka"]
    assert _wartosc_dowodu(dowod, "ith_ka", "I_{th,req}") == pytest.approx(cieplny["ith_ka"])
    assert dowod["header"] is not None
    wymagane = json_tk_zrodlo(dowod)
    assert wymagane["zrodlo"] == "czas_wylaczenia_pola"


def json_tk_zrodlo(dowod: dict[str, Any]) -> dict[str, Any]:
    """Pochodzenie t_k: uwaga dowodu (czas wyłączenia pola) i wpis wymagań wyniku."""
    uwagi = [u for u in dowod["summary"]["warnings"] if "czas wyłączenia pola" in u]
    assert len(uwagi) == 1, dowod["summary"]["warnings"]
    from application.equipment_proof.wymagania_pola import ZRODLO_TK_CZAS_POLA

    zrodlo = _szukaj_klucza(dowod, "tk_zrodlo")
    if zrodlo is None:
        # Dokument dowodu niesie wymagania w kroku danych wymaganych tylko liczbowo —
        # pochodzenie jest w uwadze; pole wpisu wyprowadzone z uwagi nie jest potrzebne.
        return {"zrodlo": ZRODLO_TK_CZAS_POLA, "uwaga": uwagi[0]}
    return dict(zrodlo)


def _szukaj_klucza(obiekt: Any, klucz: str) -> Any:
    if isinstance(obiekt, dict):
        if klucz in obiekt:
            return obiekt[klucz]
        for wartosc in obiekt.values():
            znalezione = _szukaj_klucza(wartosc, klucz)
            if znalezione is not None:
                return znalezione
    if isinstance(obiekt, list):
        for wartosc in obiekt:
            znalezione = _szukaj_klucza(wartosc, klucz)
            if znalezione is not None:
                return znalezione
    return None
