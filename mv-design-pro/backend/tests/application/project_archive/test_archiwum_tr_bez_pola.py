"""Archiwum projektu „klasy B" dla e2e ``tr2w-bez-pola`` — świeżość, zapadki, import.

Generator: ``tests/reference_networks/archiwum_tr_bez_pola.py`` (docstring tam: skąd dziś
bierze się klasa B i dlaczego jedyną drogą jest import archiwum zapisanego przed regułą
toru pola).

ILOCZYN CECH (reguła KLASA §2):
* {archiwum przekształcone (klasa B), archiwum bez przekształcenia (z polem TR)}
  × {model po imporcie przez ``POST /api/projects/import``, bramka gotowości ``W041``} —
  kontrprzykład z polem TR dowodzi, że asercje klasy B rozróżniają oba stany (te same
  zapadki, które niesie spec e2e);
* zapadka narzędzia × {brak pola TR, pole TR bez transformatora w ``equipment_refs``,
  transformator poza zaciskiem pola} — każda droga, którą operacje mogłyby przestać
  wytwarzać pole TR, kończy się nazwanym błędem;
* przekształcenie × {odwołanie do usuniętego pola, zacisku, aparatu} — pozostawione
  odwołanie jest nazwanym błędem, nie cichym modelem z wiszącym refem.
"""

from __future__ import annotations

import copy
import json
from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.reference_networks.archiwum_tr_bez_pola import (
    KOMENDA_REGENERACJI,
    NAZWA_PRZYPADKU,
    SCIEZKA_ARCHIWUM,
    EksportZmienilModel,
    NiepelnePrzeksztalcenie,
    OperacjeNieDokladajaPolaTr,
    model_z_archiwum,
    pola_tr_stacji,
    tresc_archiwum,
    zapis_sprzed_reguly_toru,
    zbuduj_archiwum,
)


@pytest.fixture(scope="module")
def archiwa() -> dict[str, bytes]:
    return {
        "klasa_b": zbuduj_archiwum(),
        "z_polem_tr": zbuduj_archiwum(przeksztalc=False),
    }


def _model_z_archiwum(dane: bytes) -> dict[str, Any]:
    return copy.deepcopy(model_z_archiwum(dane))


def _stacja(enm: dict[str, Any]) -> dict[str, Any]:
    return next(s for s in enm["substations"] if s["ref_id"].endswith("/station"))


def _role_pol_stacji(enm: dict[str, Any]) -> list[str]:
    stacja = _stacja(enm)
    return [
        str(p.get("bay_role")) for p in enm["bays"] if p.get("substation_ref") == stacja["ref_id"]
    ]


# --- świeżość i determinizm -------------------------------------------------------------


def test_archiwum_w_repo_jest_tresciowo_rowne_generatorowi(archiwa: dict[str, bytes]) -> None:
    assert SCIEZKA_ARCHIWUM.exists(), f"brak {SCIEZKA_ARCHIWUM}. {KOMENDA_REGENERACJI}"
    assert tresc_archiwum(SCIEZKA_ARCHIWUM.read_bytes()) == tresc_archiwum(
        archiwa["klasa_b"]
    ), f"archiwum e2e ROZJECHANE z generatorem. {KOMENDA_REGENERACJI}"


def test_generator_jest_deterministyczny_bajtowo(archiwa: dict[str, bytes]) -> None:
    assert zbuduj_archiwum() == archiwa["klasa_b"]


def test_generator_odmawia_gdy_odczyt_magazynu_zmienia_model_przy_eksporcie(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Archiwum ma nieść DOKŁADNIE model zbudowany przez narzędzie: automigracja przy
    odczycie magazynu, która zmienia model (tu: wstrzyknięta, nieidempotentna), musi
    wywrócić generator nazwanym błędem, a nie przejść do archiwum po cichu."""
    import enm.store as magazyn

    prawdziwe = magazyn.przygotuj_model_po_odczycie
    licznik = {"odczyty": 0}

    def zmieniajace(enm):  # type: ignore[no-untyped-def]
        model, _ = prawdziwe(enm)
        licznik["odczyty"] += 1
        model = model.model_copy(deep=True)
        model.header.description = f"odczyt {licznik['odczyty']}"
        return model, True

    monkeypatch.setattr(magazyn, "przygotuj_model_po_odczycie", zmieniajace)
    with pytest.raises(EksportZmienilModel):
        zbuduj_archiwum()


# --- zapadka narzędzia: operacje DOKŁADAJĄ pole TR ----------------------------------------


def test_operacje_dokladaja_pole_tr_na_zacisku_transformatora(archiwa: dict[str, bytes]) -> None:
    model = _model_z_archiwum(archiwa["z_polem_tr"])
    pola = pola_tr_stacji(model)
    assert len(pola) == 1
    assert _role_pol_stacji(model).count("TR") == 1


def _bez_pola_tr(model: dict[str, Any]) -> None:
    model["bays"] = [p for p in model["bays"] if p.get("bay_role") != "TR"]


def _pole_tr_bez_transformatora(model: dict[str, Any]) -> None:
    for pole in model["bays"]:
        if pole.get("bay_role") == "TR":
            pole["equipment_refs"] = [r for r in pole["equipment_refs"] if "transformer" not in r]


def _transformator_poza_zaciskiem(model: dict[str, Any]) -> None:
    tr = set(_stacja(model)["transformer_refs"])
    for transformator in model["transformers"]:
        if transformator["ref_id"] in tr:
            transformator["hv_bus_ref"] = _stacja(model)["ref_id"].replace("/station", "/sn_bus")


@pytest.mark.parametrize(
    "psuj", [_bez_pola_tr, _pole_tr_bez_transformatora, _transformator_poza_zaciskiem]
)
def test_zapadka_narzedzia_wywraca_sie_nazwanym_bledem(archiwa: dict[str, bytes], psuj) -> None:
    model = _model_z_archiwum(archiwa["z_polem_tr"])
    psuj(model)
    with pytest.raises(OperacjeNieDokladajaPolaTr):
        pola_tr_stacji(model)
    with pytest.raises(OperacjeNieDokladajaPolaTr):
        zapis_sprzed_reguly_toru(model)


# --- przekształcenie „zapis sprzed reguły toru" ------------------------------------------


def test_przeksztalcenie_daje_klase_b_bez_wiszacych_odwolan(archiwa: dict[str, bytes]) -> None:
    przed = _model_z_archiwum(archiwa["z_polem_tr"])
    pole = pola_tr_stacji(przed)[0]
    po = zapis_sprzed_reguly_toru(przed)
    stacja = _stacja(po)

    assert "TR" not in _role_pol_stacji(po)
    assert _role_pol_stacji(po) == [r for r in _role_pol_stacji(przed) if r != "TR"]
    transformator = next(t for t in po["transformers"] if t["ref_id"] in stacja["transformer_refs"])
    assert transformator["hv_bus_ref"] == pole["bus_ref"]
    # Znika dokładnie: zacisk pola (szyna), aparat pola (gałąź), rekord pola.
    assert {s["ref_id"] for s in przed["buses"]} - {s["ref_id"] for s in po["buses"]} == {
        pole["terminal_bus_ref"]
    }
    aparaty = {r for r in pole["equipment_refs"] if r != transformator["ref_id"]}
    assert {g["ref_id"] for g in przed["branches"]} - {g["ref_id"] for g in po["branches"]} == (
        aparaty
    )
    assert {t["ref_id"] for t in po["transformers"]} == {t["ref_id"] for t in przed["transformers"]}
    tekst = json.dumps(po)
    for ref in (pole["ref_id"], pole["terminal_bus_ref"], *aparaty):
        assert ref not in tekst


@pytest.mark.parametrize("cel", ["pole", "zacisk", "aparat"])
def test_przeksztalcenie_odmawia_przy_pozostawionym_odwolaniu(
    archiwa: dict[str, bytes], cel: str
) -> None:
    model = _model_z_archiwum(archiwa["z_polem_tr"])
    pole = pola_tr_stacji(model)[0]
    ref = {
        "pole": pole["ref_id"],
        "zacisk": pole["terminal_bus_ref"],
        "aparat": pole["equipment_refs"][0],
    }[cel]
    # Odwołanie spoza miejsc, które przekształcenie zna (np. pomiar wskazujący element).
    model["measurements"].append({"ref_id": "pomiar-wiszacy", "bus_ref": ref})
    with pytest.raises(NiepelnePrzeksztalcenie, match="usunięte"):
        zapis_sprzed_reguly_toru(model)


# --- import przez końcówkę produktu ------------------------------------------------------


def _importuj(klient: TestClient, dane: bytes) -> dict[str, Any]:
    """Import jak UI archiwum: plik ``*.mvdp.zip``, weryfikacja integralności DOMYŚLNA."""
    odpowiedz = klient.post(
        "/api/projects/import",
        files={"file": ("projekt-tr-bez-pola.mvdp.zip", dane, "application/zip")},
    )
    assert odpowiedz.status_code == 200, odpowiedz.text
    wynik = odpowiedz.json()
    assert wynik["status"] == "SUCCESS", wynik
    assert wynik["errors"] == []
    przypadek = klient.get(f"/api/study-cases/project/{wynik['project_id']}/active").json()
    assert przypadek["name"] == NAZWA_PRZYPADKU
    enm = klient.get(f"/api/cases/{przypadek['id']}/enm").json()
    gotowosc = klient.get(f"/api/cases/{przypadek['id']}/engineering-readiness").json()
    return {"enm": enm, "gotowosc": gotowosc}


@pytest.mark.parametrize("wariant", ["klasa_b", "z_polem_tr"])
def test_import_archiwum_daje_model_i_gotowosc_zgodne_z_wariantem(
    archiwa: dict[str, bytes], wariant: str
) -> None:
    from api.main import app

    with TestClient(app) as klient:
        stan = _importuj(klient, archiwa[wariant])
    enm = stan["enm"]
    stacja = _stacja(enm)
    transformator = next(
        t for t in enm["transformers"] if t["ref_id"] in stacja["transformer_refs"]
    )
    w041 = [i for i in stan["gotowosc"]["issues"] if i["code"] == "W041"]

    if wariant == "klasa_b":
        # Magazyn NIE dokłada pola przy wczytaniu — klasa B przeżywa import.
        assert "TR" not in _role_pol_stacji(enm)
        assert transformator["hv_bus_ref"] in stacja["bus_refs"]
        assert len(w041) == 1
        assert w041[0]["severity"] == "IMPORTANT"
        assert w041[0]["canonical_code"] == "transformer.bay_missing"
        assert w041[0]["element_refs"] == [transformator["ref_id"], stacja["ref_id"]]
    else:
        assert _role_pol_stacji(enm).count("TR") == 1
        assert w041 == []
