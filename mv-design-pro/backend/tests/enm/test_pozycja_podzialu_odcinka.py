"""Pozycja wstawienia w odcinek SN (``insert_at``) — jedna reguła wszystkich operacji wstawienia.

Defekt (pomiar 2026-10-22, przegląd dokumentów kontraktu operacji): cztery operacje
wstawiające element w odcinek czytały ``insert_at`` według trzech różnych reguł —
``insert_station_on_segment_sn`` zamieniała tryb spoza słownika na środek odcinka i przyjmowała
odległość dłuższą niż odcinek (ujemna długość drugiej połówki), a podgląd ``dry_run`` liczył
podział inną regułą (przycinał do końców) niż podział wykonany; punkty rozgałęzienia
(``insert_zksn_on_segment_sn``, ``insert_branch_pole_on_segment_sn``) przycinały po cichu do
końców odcinka; ``insert_section_switch_sn`` nie sprawdzał niczego. Typy ładunku deklarowały
tryb ``ANCHOR``, którego żaden handler nie czyta.

Iloczyn cech: operacja wstawienia (4) × pozycja (brak klucza, brak trybu, ułamek, odległość
w odcinku, początek i koniec odcinka, brak wartości, ułamek ujemny, ułamek > 1, odległość dłuższa niż odcinek,
tryb ``ANCHOR``, wartość nieliczbowa, wartość logiczna, ``insert_at`` nie-słownik). Wynik:
długości połówek = współczynnik reguły × długość odcinka, punkt rozgałęzienia na końcu odcinka
zamyka odcinek bez podziału, stacja i łącznik na końcu odcinka oraz pozycje błędne — odmowa
nazwana bez skutku.
Para predykatów: podgląd ``dry_run`` stacji = podział wykonany (jedno źródło współczynnika).
"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from enm.domain_operations import (
    TRYBY_POZYCJI_PODZIALU,
    execute_domain_operation,
    wspolczynnik_podzialu,
)

from tests.ci.dokument_operacji_enm import (
    APARAT_SN,
    KABEL_SN,
    ROZLACZNIK_SN,
    SLUP_ODGALEZNY,
    TRANSFORMATOR_630,
    ZKSN,
    ZRODLO_GPZ,
    _wiazanie,
)
from tests.enm.siec_lacznikowa import _pusty, wykonaj

DLUGOSC_M = 400.0
LINIA_SN = "line-base-al-st-70"
PUNKTY_ROZGALEZIENIA = ("zksn", "slup")
_KONIEC = "koniec"


def _model(napowietrzny: bool = False) -> tuple[dict[str, Any], str]:
    enm = wykonaj(
        _pusty(),
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "sk3_mva": 300.0,
            "rx_ratio": 0.1,
            "catalog_binding": _wiazanie("ZRODLO_SN", ZRODLO_GPZ),
        },
    )
    enm = wykonaj(
        enm,
        "continue_trunk_segment_sn",
        {
            "segment": {
                "rodzaj": "LINIA_NAPOWIETRZNA" if napowietrzny else "KABEL",
                "dlugosc_m": DLUGOSC_M,
                "name": "Odcinek",
                "catalog_binding": (
                    _wiazanie("LINIA_SN", LINIA_SN)
                    if napowietrzny
                    else _wiazanie("KABEL_SN", KABEL_SN)
                ),
            }
        },
    )
    odcinek = next(b for b in enm["branches"] if b.get("name") == "Odcinek")
    return enm, odcinek["ref_id"]


def _stacja(segment: str) -> dict[str, Any]:
    return {
        "segment_id": segment,
        "field_apparatus_catalog_ref": APARAT_SN,
        "station": {"station_type": "B", "sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4},
        "sn_fields": [
            {"field_role": "LINIA_IN"},
            {"field_role": "LINIA_OUT"},
            {"field_role": "TRANSFORMATOROWE"},
        ],
        "transformer": {"create": True, "transformer_catalog_ref": TRANSFORMATOR_630},
    }


OPERACJE: dict[str, tuple[str, Any]] = {
    "stacja": ("insert_station_on_segment_sn", _stacja),
    "lacznik": (
        "insert_section_switch_sn",
        lambda s: {
            "segment_id": s,
            "switch_type": "ROZLACZNIK",
            "catalog_binding": _wiazanie("APARAT_SN", ROZLACZNIK_SN),
        },
    ),
    "zksn": (
        "insert_zksn_on_segment_sn",
        lambda s: {
            "segment_id": s,
            "catalog_binding": _wiazanie("mv_branch_points", ZKSN),
            "switch_state": "closed",
        },
    ),
    "slup": (
        "insert_branch_pole_on_segment_sn",
        lambda s: {
            "segment_id": s,
            "catalog_binding": _wiazanie("mv_branch_points", SLUP_ODGALEZNY),
            "switch_state": "closed",
        },
    ),
}

KOD_ODMOWY = {
    "stacja": "station.insert.insert_at_invalid",
    "lacznik": "params.invalid_value",
    "zksn": "params.invalid_value",
    "slup": "params.invalid_value",
}

_BRAK = object()

# (opis, insert_at albo _BRAK, oczekiwany współczynnik albo None = odmowa)
POZYCJE: list[tuple[str, Any, Any]] = [
    ("brak_klucza", _BRAK, 0.5),
    ("brak_trybu", {"value": 0.25}, 0.25),
    ("ulamek", {"mode": "RATIO", "value": 0.3}, 0.3),
    ("odleglosc", {"mode": "ODLEGLOSC_OD_POCZATKU_M", "value": 100.0}, 0.25),
    ("koniec_odleglosc", {"mode": "ODLEGLOSC_OD_POCZATKU_M", "value": DLUGOSC_M}, _KONIEC),
    ("koniec_ulamek", {"mode": "RATIO", "value": 1}, _KONIEC),
    ("poczatek_ulamek", {"mode": "RATIO", "value": 0.0}, _KONIEC),
    ("brak_wartosci", {"mode": "RATIO"}, None),
    ("ulamek_ujemny", {"mode": "RATIO", "value": -0.1}, None),
    ("ulamek_ponad_jeden", {"mode": "RATIO", "value": 1.5}, None),
    ("odleglosc_za_odcinkiem", {"mode": "ODLEGLOSC_OD_POCZATKU_M", "value": 500.0}, None),
    ("tryb_kotwicy", {"mode": "ANCHOR", "value": 0.5}, None),
    ("wartosc_tekstowa", {"mode": "RATIO", "value": "polowa"}, None),
    ("wartosc_logiczna", {"mode": "RATIO", "value": True}, None),
    ("nie_slownik", [0.5], None),
]


def _polowki(przed: dict[str, Any], po: dict[str, Any], odcinek: str) -> list[float]:
    stare = {b["ref_id"] for b in przed["branches"]}
    return sorted(
        round(b["length_km"] * 1000.0, 6)
        for b in po["branches"]
        if b["ref_id"] not in stare and b.get("type") in ("cable", "line_overhead")
    )


@pytest.mark.parametrize("operacja", sorted(OPERACJE))
@pytest.mark.parametrize(("opis", "pozycja", "wspolczynnik"), POZYCJE, ids=[p[0] for p in POZYCJE])
def test_pozycja_wstawienia_jedna_regula(operacja, opis, pozycja, wspolczynnik) -> None:
    if opis == "nie_slownik" and operacja == "stacja":
        # Stacja odrzuca nie-słownik wcześniej, wspólną kontrolą kształtu ładunku.
        oczekiwany_kod = "payload.invalid_type"
    else:
        oczekiwany_kod = KOD_ODMOWY[operacja]
    if wspolczynnik == _KONIEC and operacja not in PUNKTY_ROZGALEZIENIA:
        wspolczynnik = None
    model, odcinek = _model(napowietrzny=operacja == "slup")
    przed = copy.deepcopy(model)
    nazwa, budowa = OPERACJE[operacja]
    ladunek = budowa(odcinek)
    if pozycja is not _BRAK:
        ladunek["insert_at"] = pozycja
    wynik = execute_domain_operation(model, nazwa, ladunek)
    if wspolczynnik is None:
        assert wynik.get("error_code") == oczekiwany_kod, wynik.get("error")
        assert wynik.get("snapshot") is None
        assert model == przed
        return
    assert wynik.get("error") is None, (wynik.get("error_code"), wynik.get("error"))
    if wspolczynnik == _KONIEC:
        # Punkt rozgałęzienia na końcu odcinka zamyka odcinek — bez podziału.
        punkt = wynik["snapshot"]["branch_points"][0]
        assert punkt["runtime_inputs"]["endpoint_mode"] in ("start", "end")
        assert _polowki(model, wynik["snapshot"], odcinek) == []
        return
    oczekiwane = sorted(
        round(x, 6) for x in (DLUGOSC_M * wspolczynnik, DLUGOSC_M * (1.0 - wspolczynnik))
    )
    assert _polowki(model, wynik["snapshot"], odcinek) == pytest.approx(oczekiwane, abs=1e-6)


@pytest.mark.parametrize(
    "pozycja",
    [
        {"mode": "RATIO", "value": 0.3},
        {"mode": "ODLEGLOSC_OD_POCZATKU_M", "value": 100.0},
    ],
)
def test_podglad_stacji_ta_sama_regula_co_podzial(pozycja) -> None:
    model, odcinek = _model()
    ladunek = {**_stacja(odcinek), "insert_at": pozycja}
    podglad = execute_domain_operation(
        model, "insert_station_on_segment_sn", {**ladunek, "dry_run": True}
    )
    wykonany = execute_domain_operation(model, "insert_station_on_segment_sn", ladunek)
    assert podglad.get("error") is None and wykonany.get("error") is None
    polowki_podgladu = podglad["preview"]["halves"]
    polowki = _polowki(model, wykonany["snapshot"], odcinek)
    assert sorted(
        [
            polowki_podgladu["first_length_km"] * 1000.0,
            polowki_podgladu["second_length_km"] * 1000.0,
        ]
    ) == pytest.approx(polowki, abs=1e-6)


def test_regula_slownik_trybow_i_wartosci_brzegowe() -> None:
    assert TRYBY_POZYCJI_PODZIALU == ("RATIO", "ODLEGLOSC_OD_POCZATKU_M")
    assert wspolczynnik_podzialu(None, 0.4, "x", konce_odcinka=False) == 0.5
    assert wspolczynnik_podzialu({"mode": "RATIO", "value": 0}, 0.4, "x", konce_odcinka=True) == 0.0
    assert (
        wspolczynnik_podzialu(
            {"mode": "ODLEGLOSC_OD_POCZATKU_M", "value": 0}, 0.4, "x", konce_odcinka=True
        )
        == 0.0
    )
    assert isinstance(
        wspolczynnik_podzialu(
            {"mode": "ODLEGLOSC_OD_POCZATKU_M", "value": 10}, 0.0, "x", konce_odcinka=True
        ),
        str,
    )
    assert isinstance(
        wspolczynnik_podzialu(
            {"mode": "RATIO", "value": float("nan")}, 0.4, "x", konce_odcinka=True
        ),
        str,
    )
    assert isinstance(
        wspolczynnik_podzialu({"mode": "ODLEGLOSC_OD_POCZATKU_M"}, 0.4, "x", konce_odcinka=True),
        str,
    )
    assert isinstance(
        wspolczynnik_podzialu({"mode": "RATIO", "value": 1.0}, 0.4, "x", konce_odcinka=False), str
    )
    assert (
        wspolczynnik_podzialu({"mode": "RATIO", "value": 1.0}, 0.4, "x", konce_odcinka=True) == 1.0
    )
