"""Dane projektu szablonu GPZ — warunek wymagalności MASZYNOWY i typ wartości (karta
GPZ-H5-APARATURA, meldunek koordynatora pkt 4).

Kontrakt `dane_projektu` niósł wymagalność wyłącznie jako zdanie (`warunek_pl`) i nie mówił,
w jakiej postaci wysłać wartość — formularz musiałby zgadywać (np. numer transformatora
rezerwowego jako tekst, który operacja odrzuca). Po naprawie każda dana ma `typ_wartosci`,
`wymagalnosc` i `wymagana_gdy` (koniunkcja warunków), a zdanie jest z nich wyprowadzane.

Predykaty parami: warunek kontraktu (`dana_projektu_wymagana`) i odmowa operacji
`add_grid_source_sn` (przez zastosowanie szablonu) to dwa miejsca tej samej reguły —
test przechodzi iloczyn {szablon 110/15, 110/20} × {stan normalny łącznika szyn 110 kV
otwarty, zamknięty} × {rezerwa ukryta, jawna} × {1, 2 transformatory} × {każda dana} i dla
każdej kombinacji wymaga: dana wymagana ⇔ zastosowanie bez niej jest odmową nazywającą jej
pole. Wspólna fikstura przypadków przypina lustro TS (`daneProjektu.ts`).
"""

from __future__ import annotations

import itertools
import json
import uuid
from pathlib import Path
from typing import Any

import pytest
from application.station_templates import get_template
from application.station_templates.apply import TemplateApplyError, apply_template_to_case
from application.station_templates.schema import (
    TYPY_WARTOSCI_DANEJ_PROJEKTU,
    DanaProjektuSzablonu,
    StationTemplate,
    TemplateParamInt,
    WarunekWymagalnosci,
    _schema_to_dict,
    dana_projektu_wymagana,
    opis_warunku_pl,
)
from enm.models import EnergyNetworkModel
from enm.slownik_komunikatow import pole
from enm.store import set_enm

from tests.reference_networks.gpz_h5 import ladunek_h5, pusty_model

SZABLONY_H5 = ("tpl_gpz_h5_110_15_2x25mva", "tpl_gpz_h5_110_20_2x25mva")

#: Fikstura przypadków wymagalności dla lustra TS (generowana tym plikiem:
#: ``PYTHONPATH=src:. python tests/application/station_templates/test_dane_projektu_wymagalnosc.py``).
FIKSTURA_TS = (
    Path(__file__).resolve().parents[4]
    / "frontend"
    / "src"
    / "ui"
    / "network-build"
    / "station-templates"
    / "__tests__"
    / "wymagalnosc_danych_projektu.json"
)


def _szablon(tpl_id: str) -> StationTemplate:
    szablon = get_template(tpl_id)
    assert szablon is not None
    return szablon


def _kombinacje() -> list[tuple[str, str, int]]:
    """(stan łącznika szyn 110 kV, tryb rezerwy, liczba transformatorów) — stany POPRAWNE.

    Rezerwa ukryta z jednym transformatorem jest stanem niepoprawnym niezależnie od danych
    projektu (sekcja SN 2 bez transformatora pod napięciem, `source.gpz_sn_section_unfed`) —
    dla niej nie ma kompletu danych, którego brak dałoby się sprawdzić.
    """
    return [
        (stan, tryb, liczba)
        for stan, tryb, liczba in itertools.product(
            ("open", "closed"), ("hidden", "explicit"), (1, 2)
        )
        if not (tryb == "hidden" and liczba == 1)
    ]


def _komplet(szablon: StationTemplate, stan: str, tryb: str, liczba: int) -> dict[str, Any]:
    """Komplet danych zastosowania szablonu: każda dana wymagana w tej kombinacji podana."""
    aparat = szablon.schema.sn_bay_apparatus_options[0].catalog_ref
    dane: dict[str, Any] = {
        "hv_sections": ladunek_h5()["hv_sections"],
        "hv_coupler": {"normal_state": stan},
        "reserve_mode": tryb,
        "transformer_count": liczba,
        "line_fields_per_section": "1",
        "earthing_bay_template": "ENEA_SN_ZU_REZYSTOR",
    }
    if stan == "closed":
        dane["hv_coupler"]["justification"] = "Sekcje 110 kV zasilane jednym torem w danych OSD"
    if tryb == "explicit" and liczba >= 2:
        dane["reserve_transformer"] = 2
        dane["reserve_transformer_apparatus"] = {"catalog_ref": aparat}
    return dane


def _bez(dane: dict[str, Any], klucz: str) -> dict[str, Any]:
    kopia = json.loads(json.dumps(dane))
    cel: dict[str, Any] = kopia
    *droga, ostatni = klucz.split(".")
    for czesc in droga:
        cel = cel[czesc]
    cel.pop(ostatni, None)
    return kopia


def _zastosuj(szablon: StationTemplate, dane: dict[str, Any]) -> TemplateApplyError | None:
    klucz = f"dane-projektu:{uuid.uuid4().hex}"
    set_enm(klucz, EnergyNetworkModel.model_validate(pusty_model()))
    try:
        apply_template_to_case(
            template=szablon, klucz_twin=klucz, target_segment_id=None, params_override=dane
        )
    except TemplateApplyError as blad:
        return blad
    return None


# ---------------------------------------------------------------------------
# Kontrakt
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("tpl_id", SZABLONY_H5)
def test_kazda_dana_ma_typ_wartosci_i_wymagalnosc_w_kontrakcie_api(tpl_id: str) -> None:
    szablon = _szablon(tpl_id)
    wpisy = _schema_to_dict(szablon.schema)["dane_projektu"]
    assert [w["klucz"] for w in wpisy] == [d.klucz for d in szablon.schema.dane_projektu]
    for wpis, dana in zip(wpisy, szablon.schema.dane_projektu, strict=True):
        assert wpis["typ_wartosci"] in TYPY_WARTOSCI_DANEJ_PROJEKTU
        assert wpis["wymagalnosc"] in ("zawsze", "warunkowo", "opcjonalnie")
        assert (wpis["wymagalnosc"] == "warunkowo") == bool(wpis["wymagana_gdy"])
        assert wpis["warunek_pl"] == opis_warunku_pl(dana, szablon.schema)
        assert bool(wpis["warunek_pl"]) == (wpis["wymagalnosc"] != "zawsze")
        if wpis["typ_wartosci"] == "liczba_calkowita":
            assert all(w["wartosc"].isdigit() for w in wpis["wartosci"])


@pytest.mark.parametrize("tpl_id", SZABLONY_H5)
def test_warunki_wskazuja_zadeklarowane_dane_albo_parametry_szablonu(tpl_id: str) -> None:
    schema = _szablon(tpl_id).schema
    po_kluczu = {d.klucz: d for d in schema.dane_projektu}
    for dana in schema.dane_projektu:
        for warunek in dana.wymagana_gdy:
            if warunek.rowna is not None:
                inna = po_kluczu[warunek.klucz]
                assert warunek.rowna in dict(inna.wartosci), (dana.klucz, warunek)
            else:
                assert isinstance(getattr(schema, warunek.klucz), TemplateParamInt)


def test_niespojna_deklaracja_wybucha() -> None:
    # Niezmiennik deklaracji szablonu w kodzie — błąd programu (asercja), nie odmowa danych.
    with pytest.raises(AssertionError):
        WarunekWymagalnosci(klucz="x")
    with pytest.raises(AssertionError):
        WarunekWymagalnosci(klucz="x", rowna="a", co_najmniej=1)
    with pytest.raises(AssertionError):
        DanaProjektuSzablonu(klucz="x", podpowiedz_pl="p", podstawa_pl="s", typ_wartosci="wybor")
    with pytest.raises(AssertionError):
        DanaProjektuSzablonu(
            klucz="x",
            podpowiedz_pl="p",
            podstawa_pl="s",
            typ_wartosci="tekst",
            opcjonalna=True,
            wymagana_gdy=(WarunekWymagalnosci(klucz="y", rowna="a"),),
            skutek_braku_pl="z",
        )
    with pytest.raises(AssertionError):
        DanaProjektuSzablonu(
            klucz="x",
            podpowiedz_pl="p",
            podstawa_pl="s",
            typ_wartosci="liczba_calkowita",
            wartosci=(("jeden", "1"),),
        )


# ---------------------------------------------------------------------------
# Predykaty parami: warunek kontraktu ⇔ odmowa operacji
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("tpl_id", SZABLONY_H5)
@pytest.mark.parametrize(("stan", "tryb", "liczba"), _kombinacje())
def test_warunek_kontraktu_rowny_odmowie_operacji(
    tpl_id: str, stan: str, tryb: str, liczba: int
) -> None:
    szablon = _szablon(tpl_id)
    komplet = _komplet(szablon, stan, tryb, liczba)
    assert _zastosuj(szablon, komplet) is None, "komplet danych kombinacji ma być przyjęty"
    for dana in szablon.schema.dane_projektu:
        wymagana = dana_projektu_wymagana(dana, szablon.schema, komplet)
        blad = _zastosuj(szablon, _bez(komplet, dana.klucz))
        if wymagana:
            assert blad is not None, (dana.klucz, stan, tryb, liczba)
            assert pole(dana.klucz, dana.operacja) in blad.message_pl, (dana.klucz, blad)
        else:
            assert blad is None, (dana.klucz, stan, tryb, liczba, blad)


def test_parametr_szablonu_niepodany_ma_wartosc_domyslna() -> None:
    szablon = _szablon(SZABLONY_H5[0])
    (dana,) = (d for d in szablon.schema.dane_projektu if d.klucz == "reserve_transformer")
    assert szablon.schema.transformer_count.default == 2
    assert dana_projektu_wymagana(dana, szablon.schema, {"reserve_mode": "explicit"})
    assert not dana_projektu_wymagana(
        dana, szablon.schema, {"reserve_mode": "explicit", "transformer_count": 1}
    )
    assert not dana_projektu_wymagana(dana, szablon.schema, {"reserve_mode": "hidden"})


# ---------------------------------------------------------------------------
# Fikstura lustra TS
# ---------------------------------------------------------------------------


def przypadki_lustra_ts() -> dict[str, Any]:
    """Przypadki (dana × dane zastosowania → wymagana) z JEDNEJ reguły backendu."""
    szablon = _szablon(SZABLONY_H5[0])
    schemat = _schema_to_dict(szablon.schema)
    zestawy: list[dict[str, Any]] = [
        {},
        {"reserve_mode": "explicit"},
        {"reserve_mode": "explicit", "transformer_count": 1},
        {"reserve_mode": "hidden", "transformer_count": 2},
        {"hv_coupler": {"normal_state": "closed"}},
        {"hv_coupler": {"normal_state": "open"}},
    ]
    przypadki = [
        {
            "klucz": dana.klucz,
            "dane": dane,
            "wymagana": dana_projektu_wymagana(dana, szablon.schema, dane),
        }
        for dane in zestawy
        for dana in szablon.schema.dane_projektu
    ]
    return {
        "_zrodlo": "tests/application/station_templates/test_dane_projektu_wymagalnosc.py",
        "transformer_count_default": szablon.schema.transformer_count.default,
        "dane_projektu": schemat["dane_projektu"],
        "przypadki": przypadki,
    }


def _tresc_fikstury() -> str:
    return json.dumps(przypadki_lustra_ts(), ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def test_fikstura_lustra_ts_aktualna() -> None:
    assert (
        FIKSTURA_TS.read_text(encoding="utf-8") == _tresc_fikstury()
    ), "Fikstura lustra TS nieaktualna — wygeneruj ją tym plikiem (docstring FIKSTURA_TS)."


if __name__ == "__main__":
    FIKSTURA_TS.write_text(_tresc_fikstury(), encoding="utf-8")
