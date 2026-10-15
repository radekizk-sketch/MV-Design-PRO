"""Migracja W5-B: dawne wpisy pól (`meta.field_specs`, `meta.nn_field_specs`,
`materialized_params.switchgear_field_specs`) → typowane rekordy `bays`.

Iloczyn cech (reguła KLASA, NIE INSTANCJA):
  {poziom: SN (`field_specs`), nN (`nn_field_specs`)} × {nazwa: nadana, brak} ×
  {`bay_ref` scalany z rekordem `bays`, bez} × {klucz `meta`: typowany (przenoszony na
  pole), nietypowany (zostaje w `meta`), klucz wpisu nieznany (błąd nazwany)};
  ZKSN osobno (pola z portów punktu rozgałęzienia — nazwa i `bay_ref` nie dotyczą).
Ponadto: idempotencja, przepisanie `bay_ref` w czterech nośnikach, odmowa zapisu modelu z
dawnymi kluczami w magazynie i migracja substratu 52 stacji (371 pól, 199 nN z aparatem).
"""

from __future__ import annotations

import copy
import gzip
import json
from pathlib import Path
from typing import Any

import pytest
from enm.migrations.field_specs_promocja import BladMigracjiPol, migruj, wymaga_migracji
from enm.migrations.klucze_meta_pola import (
    KLUCZE_META_MARTWE,
    KLUCZE_META_NA_POLE,
    KLUCZE_META_ZAKAZANE,
)
from enm.models import EnergyNetworkModel
from enm.pola import czy_pole_nn, pola_nn, zacisk_pola
from enm.store import LegacyFieldSpecsError, przygotuj_model_po_odczycie, reset_enm_store, set_enm

#: ARCHIWUM: migawka substratu 52 stacji zapisana PRZED kartą W5-B (drzewo `f3c435b6`,
#: ścieżka produktu — 172 wpisy pól SN i 199 wpisów pól nN w `meta` stacji). Zamrożona celowo:
#: fikstury generowane po W5-B nie niosą już dawnych kluczy, a migracja musi umieć wczytać
#: projekt zapisany przed kartą. Nie regenerować (to dane historyczne, nie wyjście generatora).
ARCHIWUM_52S = Path(__file__).parent / "dane" / "substrat52s_przed_w5b.enm.json.gz"
#: Ten sam substrat zbudowany DZIŚ ścieżką produktu (fikstura generowana).
FIKSTURA_52S = (
    Path(__file__).resolve().parents[4] / "frontend/public/test-fixtures/sldSubstrate52s.enm.json"
)

POZIOMY = ("field_specs", "nn_field_specs")
NAZWY = ("z_nazwa", "bez_nazwy")
SCALENIA = ("bay_ref", "bez_bay_ref")
KLUCZE_META = ("typowany", "nietypowany")


def _model(klucz: str, nazwa: str, scalenie: str, meta: str) -> dict[str, Any]:
    szyna = "sn" if klucz == "field_specs" else "nn"
    wpis: dict[str, Any] = {
        "field_ref": "field/st/1",
        "bay_role": "FEEDER" if klucz == "nn_field_specs" else "OUT",
        "bus_ref": szyna,
        "equipment_refs": ["aparat-wpisu"],
        "tags": ["t-wpisu"],
        "meta": {},
    }
    if nazwa == "z_nazwa":
        wpis["name"] = "Pole projektanta"
    if meta == "typowany":
        wpis["meta"] = {"terminal_bus_ref": "zacisk", "field_role": "LINIA_OUT"}
    else:
        wpis["meta"] = {"assigned_corridor_ref": "kor-1", "feeder_role": "ODPLYW_NN"}
    bays: list[dict[str, Any]] = []
    if scalenie == "bay_ref":
        wpis["bay_ref"] = "bay/st/out"
        bays.append(
            {
                "ref_id": "bay/st/out",
                "name": "Nazwa rekordu",
                "bay_role": wpis["bay_role"],
                "substation_ref": "st",
                "bus_ref": szyna,
                "equipment_refs": ["aparat-rekordu"],
                "protection_codes": ["51"],
                "meta": {"sn_field_template": {"x": 1}, "bay_ref": "x", "created_by": "op"},
            }
        )
    return {
        "header": {"name": "migracja pól"},
        "buses": [
            {"ref_id": "sn", "name": "SN", "voltage_kv": 15.0},
            {"ref_id": "nn", "name": "nN", "voltage_kv": 0.4},
        ],
        "substations": [
            {
                "ref_id": "st",
                "name": "Stacja",
                "station_type": "mv_lv",
                "bus_refs": ["sn", "nn"],
                "meta": {klucz: [wpis], "inny_klucz": 1},
            }
        ],
        "bays": bays,
        "generators": [
            {
                "ref_id": "g",
                "name": "G",
                "bus_ref": szyna,
                "p_mw": 0.1,
                "meta": {"field_ref": "bay/st/out"},
            }
        ],
        "loads": [
            {
                "ref_id": "o",
                "name": "O",
                "bus_ref": szyna,
                "p_mw": 0.01,
                "q_mvar": 0.0,
                "meta": {"feeder_ref": "bay/st/out"},
            }
        ],
        "measurements": [
            {
                "ref_id": "m",
                "name": "CT",
                "measurement_type": "CT",
                "bus_ref": szyna,
                "bay_ref": "bay/st/out",
                "rating": {"ratio_primary": 100.0, "ratio_secondary": 5.0},
            }
        ],
        "protection_assignments": [
            {
                "ref_id": "pa",
                "name": "Z",
                "breaker_ref": "aparat-wpisu",
                "device_type": "overcurrent",
            }
        ],
        "branches": [
            {
                "ref_id": "aparat-wpisu",
                "name": "Q",
                "type": "breaker",
                "from_bus_ref": szyna,
                "to_bus_ref": "zacisk",
                "meta": {"bay_ref": "bay/st/out", "field_ref": "bay/st/out"},
            }
        ],
    }


def _napisy(obiekt: object) -> set[str]:
    """Wszystkie napisy migawki (odwołanie do dawnego identyfikatora nie może przetrwać)."""
    if isinstance(obiekt, str):
        return {obiekt}
    if isinstance(obiekt, dict):
        return set().union(*(_napisy(v) for v in obiekt.values())) if obiekt else set()
    if isinstance(obiekt, list):
        return set().union(*(_napisy(v) for v in obiekt)) if obiekt else set()
    return set()


@pytest.mark.parametrize("meta", KLUCZE_META)
@pytest.mark.parametrize("scalenie", SCALENIA)
@pytest.mark.parametrize("nazwa", NAZWY)
@pytest.mark.parametrize("klucz", POZIOMY)
def test_iloczyn_migracji_wpisu_stacji(klucz: str, nazwa: str, scalenie: str, meta: str) -> None:
    model = EnergyNetworkModel.model_validate(_model(klucz, nazwa, scalenie, meta))
    assert wymaga_migracji(model)
    po, zmieniono = migruj(model)
    assert zmieniono and not wymaga_migracji(po)
    dane = po.model_dump(mode="json")
    # Jeden rekord na pole (scalenie dubla stacji końca ciągu), identyfikator = field_ref.
    assert [b["ref_id"] for b in dane["bays"]] == ["field/st/1"]
    pole = dane["bays"][0]
    assert pole["substation_ref"] == "st"
    # Poziom z napięcia szyny pola (dawna przynależność do kolekcji nn_field_specs).
    assert czy_pole_nn(dane, pole) is (klucz == "nn_field_specs")
    # Nazwa: projektanta; bez niej — nazwa rekordu scalanego; bez obu — nazwa roli z kanonu.
    if nazwa == "z_nazwa":
        assert pole["name"] == "Pole projektanta"
    elif scalenie == "bay_ref":
        assert pole["name"] == "Nazwa rekordu"
    else:
        assert pole["name"] and pole["name"] != "field/st/1"
    # Klucze meta: typowane przeniesione na pole i zdjęte z meta; martwe skasowane;
    # nietypowane zostają.
    if meta == "typowany":
        assert zacisk_pola(pole) == "zacisk"
        assert pole["field_role"] == "LINIA_OUT"
        assert "terminal_bus_ref" not in pole["meta"] and "field_role" not in pole["meta"]
    else:
        assert zacisk_pola(pole) is None
        assert pole["meta"]["assigned_corridor_ref"] == "kor-1"
    assert not {"sn_field_template", "bay_ref", "field_ref"} & set(pole["meta"])
    if scalenie == "bay_ref":
        assert pole["equipment_refs"] == ["aparat-wpisu", "aparat-rekordu"]
        assert pole["protection_codes"] == ["51"]
        assert pole["meta"]["created_by"] == "op"
        # KOMPLET odwołań do dawnego `bay/…` przepisany (`_ODWOLANIA_DO_POLA`): przekładnik
        # (`Measurement.bay_ref`), aparat (`meta.bay_ref`/`meta.field_ref` gałęzi), wytwórca
        # (`Generator.meta.field_ref`), odbiór odpływu (`Load.meta.feeder_ref`).
        stare = {"bay/st/out"}
        assert dane["measurements"][0]["bay_ref"] == "field/st/1"
        assert dane["branches"][0]["meta"]["bay_ref"] == "field/st/1"
        assert dane["branches"][0]["meta"]["field_ref"] == "field/st/1"
        assert dane["generators"][0]["meta"]["field_ref"] == "field/st/1"
        assert dane["loads"][0]["meta"]["feeder_ref"] == "field/st/1"
        assert stare.isdisjoint(_napisy(dane))
    else:
        assert dane["measurements"][0]["bay_ref"] == "bay/st/out"
        assert dane["generators"][0]["meta"]["field_ref"] == "bay/st/out"
    # Dawne klucze znikają z meta stacji; inne klucze zostają.
    assert dane["substations"][0]["meta"] == {"inny_klucz": 1}
    # Idempotencja: drugi przebieg zwraca TEN SAM obiekt.
    assert migruj(po) == (po, False)


def test_dawne_klucze_meta_pola_lista_zamknieta() -> None:
    """Deklaracja „lista ZAMKNIĘTA" przypięta dosłownie: klucze `meta` wpisu z typowanym
    odpowiednikiem na rekordzie `Bay` (przenoszone) i martwe (dawny identyfikator, dawna kopia
    szablonu pola). Ten sam zbiór odmawia pisarz `enm.pola` (test parami w `test_pola.py`)."""
    assert KLUCZE_META_NA_POLE == {
        "field_role": "field_role",
        "terminal_bus_ref": "terminal_bus_ref",
        "field_terminal_bus_ref": "terminal_bus_ref",
        "gpz_section_id": "gpz_section_id",
        "catalog_bindings": "catalog_bindings",
        "apparatus_catalog_ref": "apparatus_catalog_ref",
    }
    assert frozenset({"bay_ref", "field_ref", "sn_field_template"}) == KLUCZE_META_MARTWE
    assert len(KLUCZE_META_ZAKAZANE) == 9


@pytest.mark.parametrize("klucz", POZIOMY)
def test_nieznany_klucz_wpisu_to_blad_nazwany(klucz: str) -> None:
    dane = _model(klucz, "z_nazwa", "bez_bay_ref", "nietypowany")
    dane["substations"][0]["meta"][klucz][0]["klucz_spoza_listy"] = 1
    with pytest.raises(BladMigracjiPol, match="klucz_spoza_listy"):
        migruj(EnergyNetworkModel.model_validate(dane))


@pytest.mark.parametrize("dawne_pola", [None, [{"bay_role": "BRANCH"}] * 2])
def test_pola_zksn_z_portow_punktu_rozgalezienia(dawne_pola: Any) -> None:
    """ZKSN: `switchgear_field_specs` zdjęte z obu nośników, rekordy z portów (liczba
    odgałęzień z dawnej listy albo z `branch_ports_count`)."""
    parametry: dict[str, Any] = {"branch_ports_count": 2}
    if dawne_pola is not None:
        parametry = {"switchgear_field_specs": dawne_pola}
    dane = {
        "header": {"name": "zksn"},
        "buses": [{"ref_id": "bp-bus", "name": "ZKSN", "voltage_kv": 15.0}],
        "branch_points": [
            {
                "ref_id": "bp",
                "name": "ZKSN",
                "branch_point_type": "zksn",
                "bus_ref": "bp-bus",
                "parent_segment_id": "seg",
                "materialized_params": parametry,
                "runtime_inputs": {"switchgear_field_specs": []},
            }
        ],
    }
    po, zmieniono = migruj(EnergyNetworkModel.model_validate(dane))
    assert zmieniono
    zrzut = po.model_dump(mode="json")
    assert [b["ref_id"] for b in zrzut["bays"]] == [
        "bp/pole/MAIN_IN",
        "bp/pole/MAIN_OUT",
        "bp/pole/BRANCH_1",
        "bp/pole/BRANCH_2",
    ]
    punkt = zrzut["branch_points"][0]
    assert "switchgear_field_specs" not in (punkt["materialized_params"] or {})
    assert "switchgear_field_specs" not in (punkt["runtime_inputs"] or {})
    assert migruj(po) == (po, False)


def test_magazyn_odmawia_zapisu_modelu_z_dawnymi_kluczami(monkeypatch: Any, tmp_path: Any) -> None:
    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path / "enm_store"))
    reset_enm_store()
    try:
        model = EnergyNetworkModel.model_validate(
            _model("field_specs", "z_nazwa", "bez_bay_ref", "typowany")
        )
        with pytest.raises(LegacyFieldSpecsError):
            set_enm("case-legacy", model)
        po, _ = przygotuj_model_po_odczycie(model)
        set_enm("case-legacy", po)
    finally:
        reset_enm_store()


def test_substrat_52_stacji_migruje_sie_w_calosci() -> None:
    """Archiwum z dawnymi kluczami (substrat 52 stacji sprzed W5-B): 172 pola SN +
    199 pól nN = 371 rekordów; każde pole nN ma aparat i zacisk; zero dawnych kluczy; drugi
    przebieg bez zmian."""
    surowe = json.loads(gzip.decompress(ARCHIWUM_52S.read_bytes()).decode("utf-8"))["enm"]
    assert any("field_specs" in (s.get("meta") or {}) for s in surowe["substations"])
    model, zmieniono = przygotuj_model_po_odczycie(EnergyNetworkModel.model_validate(surowe))
    assert zmieniono
    dane = model.model_dump(mode="json")
    assert len(dane["bays"]) == 371
    nn = pola_nn(dane)
    assert len(nn) == 199
    galezie = {g["ref_id"]: g for g in dane["branches"]}
    for pole in nn:
        assert len(pole["equipment_refs"]) == 1, pole["ref_id"]
        aparat = galezie[pole["equipment_refs"][0]]
        assert zacisk_pola(pole) == aparat["to_bus_ref"]
    tekst = json.dumps(dane)
    assert "field_specs" not in tekst
    drugi, zmieniono_drugi = przygotuj_model_po_odczycie(copy.deepcopy(model))
    assert zmieniono_drugi is False
    assert drugi.model_dump(mode="json") == dane
    # Parytet archiwum ↔ ścieżka produktu po W5-B: projekt zapisany przed kartą, wczytany
    # dziś, ma DOKŁADNIE te same pola (tożsamość, rola, szyna, zacisk, aparaty, nazwa) i ten
    # sam graf, co substrat zbudowany dziś operacjami (fikstura generowana `sld_substrate_fixtures`).
    swiezy, _ = przygotuj_model_po_odczycie(
        EnergyNetworkModel.model_validate(
            json.loads(FIKSTURA_52S.read_text(encoding="utf-8"))["enm"]
        )
    )

    def _pola(m: EnergyNetworkModel) -> list[tuple[object, ...]]:
        return sorted(
            (
                b.ref_id,
                b.bay_role,
                b.bus_ref,
                b.terminal_bus_ref,
                b.substation_ref,
                tuple(b.equipment_refs),
                b.field_role,
                b.name,
            )
            for b in m.bays
        )

    assert _pola(model) == _pola(swiezy)
    for kolekcja in ("buses", "branches", "loads", "generators", "transformers"):
        assert sorted(e.ref_id for e in getattr(model, kolekcja)) == sorted(
            e.ref_id for e in getattr(swiezy, kolekcja)
        ), kolekcja
