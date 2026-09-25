"""Nazwy nadawane przez operacje modelu nigdy nie pochodzą z identyfikatora (karta #144).

Klasa defektu: operacja tworząca element BEZ nazwy w ładunku nadawała mu nazwę sklejoną
z identyfikatora — `f"Odcinek {ref[-8:]}"` w `continue_trunk_segment_sn` (dosłownie
„Odcinek /segment"), `data.get("name", ref_id)` w siedmiu prymitywach topologii, „GPZ
<source_id>" w `add_grid_source_sn`, „CT pola <field_ref>" w `add_ct`/`add_vt`, „Sekcja N —
<ref stacji>" w `add_nn_section_coupler`, „<prefiks> — <ref>" w `copy_nn_feeder`, a połówka
odcinka bez nazwy dostawała „Odcinek <ref połówki>". Dalsze operacje obchodziły skutek
filtrem nazw po wzorcach „seg/", „/segment", „branch" (punkt rozgałęzienia) — filtr zniknął
razem z przyczyną.

Testy pokrywają iloczyn cech, w którym defekt mógłby się schować (reguła KLASA, NIE
INSTANCJA):

* odcinek magistrali: (brak pola × None × pusty napis × same spacje) × (linia napowietrzna ×
  kabel) × (pierwszy × kolejny odcinek ciągu) oraz nazwa jawna × kolejny odcinek bez nazwy;
* połówki odcinka nazwanego przez ciąg × (wstawienie stacji × łącznik sekcyjny × słup
  rozgałęźny na linii × ZKSN na kablu);
* GPZ: (pierwszy × kolejny × trzeci o tym samym napięciu × inne napięcie) × (bez nazwy ×
  nazwa jawna × nazwa z samych spacji) — tożsamość źródła (`source_id`) nigdy w nazwie;
* prymitywy topologii: każdy rodzaj elementu × (brak pola × None × pusty napis × same spacje ×
  nazwa jawna);
* przekładniki pola (CT × VT) × (pole z nazwą × pole bez nazwy); sekcja nN × (stacja z nazwą ×
  bez nazwy); kopia odpływu nN × (elementy z nazwami × elementy bez nazw);
* determinizm: ten sam model i ładunek → te same nazwy i identyfikatory.

Wspólna asercja klasy (`_bez_fragmentow_identyfikatorow`) sprawdza CAŁĄ migawkę po operacji,
nie tylko element z karty: żadna nazwa nie zawiera identyfikatora elementu, jego końcówki
ani ziarna (32 znaki szesnastkowe) któregokolwiek identyfikatora migawki.
"""

from __future__ import annotations

import copy
import re
from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation
from enm.nazwy_elementow import jest_nazwa
from enm.topology_ops import (
    attach_protection,
    create_branch,
    create_device,
    create_measurement,
    create_node,
)

from tests.enm.test_enm_api import _valid_enm_with_field_specs
from tests.enm.test_nazwy_polowek_odcinka import (
    CATALOG_APARAT_SN,
    CATALOG_LINE_70,
    CATALOG_ROZLACZNIK,
    CATALOG_TRAFO_630,
    _empty_enm,
    op,
)
from tests.enm.test_nn_topology_ops import (
    REF_APARAT_NN,
    REF_KABEL_NN,
    _board,
    _branch_by_name,
    _dwie_szyny_nn,
    _stacja,
    _wykonaj,
)

CATALOG_KABEL_SN = "cable-tfk-yakxs-3x120"
CATALOG_SLUP_ODG = "SLUP-ODG-12"
CATALOG_ZKSN = "ZKSN-2P-630A"

_KOLEKCJE_Z_NAZWAMI = (
    "buses",
    "branches",
    "transformers",
    "sources",
    "loads",
    "generators",
    "substations",
    "bays",
    "junctions",
    "corridors",
    "measurements",
    "protection_assignments",
    "branch_points",
    "line_runs",
)
_ZIARNO = re.compile(r"[0-9a-f]{32}")

#: Brak nazwy w ładunku — każdy wariant, który predykat `jest_nazwa` uznaje za brak.
BRAKI_NAZWY = [
    pytest.param({}, id="brak-pola"),
    pytest.param({"name": None}, id="none"),
    pytest.param({"name": ""}, id="pusty-napis"),
    pytest.param({"name": "   "}, id="same-spacje"),
]
#: Rodzaj odcinka magistrali SN × pozycja katalogu.
RODZAJE_ODCINKA = [
    pytest.param("LINIA_NAPOWIETRZNA", CATALOG_LINE_70, id="linia"),
    pytest.param("KABEL", CATALOG_KABEL_SN, id="kabel"),
]


def _identyfikator(element: dict[str, Any]) -> str:
    return str(element.get("ref_id") or element.get("id") or "")


def _bez_fragmentow_identyfikatorow(snapshot: dict[str, Any]) -> None:
    """Żadna nazwa w migawce nie niesie identyfikatora ani jego fragmentu."""
    identyfikatory = [
        _identyfikator(element)
        for kolekcja in _KOLEKCJE_Z_NAZWAMI
        for element in snapshot.get(kolekcja) or []
        if isinstance(element, dict) and _identyfikator(element)
    ]
    ziarna = {ziarno for ref in identyfikatory for ziarno in _ZIARNO.findall(ref)}
    for kolekcja in _KOLEKCJE_Z_NAZWAMI:
        for element in snapshot.get(kolekcja) or []:
            if not isinstance(element, dict):
                continue
            nazwa = element.get("name")
            if not isinstance(nazwa, str):
                continue
            ref = _identyfikator(element)
            assert not ref or ref not in nazwa, (kolekcja, ref, nazwa)
            assert not ref or len(ref) < 12 or ref[-8:] not in nazwa, (kolekcja, ref, nazwa)
            assert not any(ziarno in nazwa for ziarno in ziarna), (kolekcja, ref, nazwa)
            for wzorzec in ("seg/", "/segment", "bus/", "gpz/", "stn/", "bp/"):
                assert wzorzec not in nazwa, (kolekcja, ref, nazwa)


def _galaz(snapshot: dict[str, Any], ref: str) -> dict[str, Any]:
    return next(b for b in snapshot["branches"] if b["ref_id"] == ref)


def _szyna(snapshot: dict[str, Any], ref: str) -> dict[str, Any]:
    return next(b for b in snapshot["buses"] if b["ref_id"] == ref)


def _gpz(snapshot: dict[str, Any] | None = None, **ladunek: Any) -> dict[str, Any]:
    return op(snapshot or _empty_enm(), "add_grid_source_sn", {"voltage_kv": 15.0, **ladunek})


def _odcinek(
    snapshot: dict[str, Any], rodzaj: str, catalog_ref: str, dlugosc_m: float, **nazwa: Any
) -> tuple[dict[str, Any], str]:
    snap = op(
        snapshot,
        "continue_trunk_segment_sn",
        {
            "segment": {
                "rodzaj": rodzaj,
                "dlugosc_m": dlugosc_m,
                "catalog_ref": catalog_ref,
                **nazwa,
            },
        },
    )
    return snap, snap["corridors"][0]["ordered_segment_refs"][-1]


# ---------------------------------------------------------------------------
# Odcinek magistrali SN
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(("rodzaj", "catalog_ref"), RODZAJE_ODCINKA)
@pytest.mark.parametrize("brak_nazwy", BRAKI_NAZWY)
def test_odcinek_bez_nazwy_dostaje_nazwe_ciagu_i_numer(
    brak_nazwy: dict[str, Any], rodzaj: str, catalog_ref: str
) -> None:
    """Odcinek bez nazwy = nazwa ciągu + numer odcinka w ciągu (pierwszy i kolejny);
    zacisk końcowy = opis rodzaju. Nigdy fragment identyfikatora („Odcinek /segment")."""
    snap = _gpz()
    nazwa_ciagu = snap["corridors"][0]["name"]
    snap, pierwszy = _odcinek(snap, rodzaj, catalog_ref, 400.0, **brak_nazwy)
    snap, drugi = _odcinek(snap, rodzaj, catalog_ref, 500.0, **brak_nazwy)

    assert _galaz(snap, pierwszy)["name"] == f"{nazwa_ciagu} — odcinek 01"
    assert _galaz(snap, drugi)["name"] == f"{nazwa_ciagu} — odcinek 02"
    for ref in (pierwszy, drugi):
        zacisk = _szyna(snap, _galaz(snap, ref)["to_bus_ref"])
        assert zacisk["name"] == "Zacisk końcowy odcinka SN"
    _bez_fragmentow_identyfikatorow(snap)


@pytest.mark.parametrize(("rodzaj", "catalog_ref"), RODZAJE_ODCINKA)
def test_odcinek_z_nazwa_jawna_zachowuje_ja_a_kolejny_bez_nazwy_liczy_sie_dalej(
    rodzaj: str, catalog_ref: str
) -> None:
    """Nazwa jawna nie jest nadpisywana; numer kolejnego odcinka bez nazwy liczy WSZYSTKIE
    odcinki ciągu (ta sama numeracja `order` modelu, nie druga wymyślona)."""
    snap = _gpz()
    nazwa_ciagu = snap["corridors"][0]["name"]
    snap, pierwszy = _odcinek(snap, rodzaj, catalog_ref, 400.0, name="Odcinek Zachodni")
    snap, drugi = _odcinek(snap, rodzaj, catalog_ref, 500.0)

    assert _galaz(snap, pierwszy)["name"] == "Odcinek Zachodni"
    assert _szyna(snap, _galaz(snap, pierwszy)["to_bus_ref"])["name"] == (
        "Zacisk końcowy Odcinek Zachodni"
    )
    assert _galaz(snap, drugi)["name"] == f"{nazwa_ciagu} — odcinek 02"
    _bez_fragmentow_identyfikatorow(snap)


def test_odcinek_bez_nazwy_deterministyczny() -> None:
    """Ten sam model i ładunek → te same identyfikatory i nazwy (bez losowości)."""

    def zbuduj() -> dict[str, Any]:
        snap = _gpz()
        snap, _ = _odcinek(snap, "LINIA_NAPOWIETRZNA", CATALOG_LINE_70, 400.0)
        snap, _ = _odcinek(snap, "KABEL", CATALOG_KABEL_SN, 500.0, name="")
        return snap

    pierwszy, drugi = zbuduj(), zbuduj()
    assert [(b["ref_id"], b["name"]) for b in pierwszy["branches"]] == [
        (b["ref_id"], b["name"]) for b in drugi["branches"]
    ]
    assert [(b["ref_id"], b["name"]) for b in pierwszy["buses"]] == [
        (b["ref_id"], b["name"]) for b in drugi["buses"]
    ]


# ---------------------------------------------------------------------------
# Połówki odcinka nazwanego przez ciąg
# ---------------------------------------------------------------------------


def _polowki(snapshot: dict[str, Any], rodzic: str) -> list[str]:
    return sorted(
        b["name"]
        for b in snapshot["branches"]
        if b["ref_id"].startswith(f"{rodzic}_") and b.get("type") in {"cable", "line_overhead"}
    )


def test_polowki_po_wstawieniu_stacji_dziedzicza_nazwe_nadana_przez_ciag() -> None:
    snap = _gpz()
    snap, odcinek = _odcinek(snap, "LINIA_NAPOWIETRZNA", CATALOG_LINE_70, 500.0)
    nazwa = _galaz(snap, odcinek)["name"]
    snap = op(
        snap,
        "insert_station_on_segment_sn",
        {
            "segment_id": odcinek,
            "station_type": "B",
            "insert_at": {"value": 0.5},
            "station": {"sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4},
            "sn_fields": ["IN", "OUT", "FEEDER"],
            "field_apparatus_catalog_ref": CATALOG_APARAT_SN,
            "transformer": {
                "create": True,
                "catalog_binding": {
                    "catalog_namespace": "TRAFO_SN_NN",
                    "catalog_item_id": CATALOG_TRAFO_630,
                },
            },
        },
    )
    assert _polowki(snap, odcinek) == [f"{nazwa} (1)", f"{nazwa} (2)"]
    _bez_fragmentow_identyfikatorow(snap)


def test_polowki_po_wstawieniu_lacznika_dziedzicza_nazwe_nadana_przez_ciag() -> None:
    snap = _gpz()
    snap, odcinek = _odcinek(snap, "KABEL", CATALOG_KABEL_SN, 500.0)
    nazwa = _galaz(snap, odcinek)["name"]
    snap = op(
        snap,
        "insert_section_switch_sn",
        {
            "segment_id": odcinek,
            "catalog_binding": {
                "catalog_namespace": "APARAT_SN",
                "catalog_item_id": CATALOG_ROZLACZNIK,
            },
        },
    )
    assert _polowki(snap, odcinek) == [f"{nazwa} (1)", f"{nazwa} (2)"]
    _bez_fragmentow_identyfikatorow(snap)


@pytest.mark.parametrize(
    ("operacja", "rodzaj", "catalog_ref", "catalog_punktu"),
    [
        pytest.param(
            "insert_branch_pole_on_segment_sn",
            "LINIA_NAPOWIETRZNA",
            CATALOG_LINE_70,
            CATALOG_SLUP_ODG,
            id="slup-na-linii",
        ),
        pytest.param(
            "insert_zksn_on_segment_sn", "KABEL", CATALOG_KABEL_SN, CATALOG_ZKSN, id="zksn-na-kablu"
        ),
    ],
)
def test_polowki_przy_punkcie_rozgalezienia_dziedzicza_nazwe_nadana_przez_ciag(
    operacja: str, rodzaj: str, catalog_ref: str, catalog_punktu: str
) -> None:
    """Dawny filtr „seg/"/„/segment"/„branch" zastępował nazwę rodzica ogólnikiem
    „Odcinek SN" — bo rodzic nosił identyfikator. Dziś rodzic nosi nazwę z ciągu, więc
    połówki ją dziedziczą ze stroną punktu rozgałęzienia."""
    snap = _gpz()
    snap, odcinek = _odcinek(snap, rodzaj, catalog_ref, 600.0)
    nazwa = _galaz(snap, odcinek)["name"]
    snap = op(snap, operacja, {"segment_id": odcinek, "catalog_ref": catalog_punktu})
    assert _polowki(snap, odcinek) == [
        f"{nazwa} - do punktu rozgałęzienia",
        f"{nazwa} - za punktem rozgałęzienia",
    ]
    _bez_fragmentow_identyfikatorow(snap)


# ---------------------------------------------------------------------------
# GPZ
# ---------------------------------------------------------------------------


def _nazwy_gpz(snapshot: dict[str, Any]) -> list[str]:
    return [s["name"] for s in snapshot["substations"] if s.get("station_type") == "gpz"]


@pytest.mark.parametrize("brak_nazwy", [{}, {"source_name": ""}, {"source_name": "   "}])
def test_kolejne_gpz_bez_nazwy_dostaja_numer_porzadkowy_nie_tozsamosc(
    brak_nazwy: dict[str, Any],
) -> None:
    """GPZ bez nazwy: rodzaj + napięcie, kolejny o tym samym napięciu — pierwszy wolny numer.
    Tożsamość źródła (`source_id`) rozróżnia GPZ w modelu, nie jest nazwą."""
    snap = _gpz(**brak_nazwy)
    snap = _gpz(snap, source_id="GPZ-POLNOC", **brak_nazwy)
    snap = _gpz(snap, source_id="GPZ-POLUDNIE", **brak_nazwy)
    assert _nazwy_gpz(snap) == ["GPZ 15.0 kV", "GPZ 15.0 kV (2)", "GPZ 15.0 kV (3)"]
    for nazwa in (
        [s["name"] for s in snap["substations"]]
        + [s["name"] for s in snap["sources"]]
        + [b["name"] for b in snap["buses"]]
    ):
        assert "GPZ-POLNOC" not in nazwa and "GPZ-POLUDNIE" not in nazwa, nazwa
    _bez_fragmentow_identyfikatorow(snap)


def test_gpz_o_innym_napieciu_i_gpz_z_nazwa_jawna() -> None:
    snap = _gpz()
    snap = _gpz(
        snap,
        voltage_kv=20.0,
        source_id="GPZ-20",
        catalog_ref="src-gpz-20kv-250mva-rx010",
    )
    snap = _gpz(snap, source_id="GPZ-3", source_name="GPZ Północ")
    assert _nazwy_gpz(snap) == ["GPZ 15.0 kV", "GPZ 20.0 kV", "GPZ Północ"]
    _bez_fragmentow_identyfikatorow(snap)


# ---------------------------------------------------------------------------
# Prymitywy topologii
# ---------------------------------------------------------------------------


def _enm_prymitywow() -> dict[str, Any]:
    """Szyny SN/nN, wyłącznik z przekładnikiem CT — podłoże dla każdego prymitywu."""
    return {
        "header": {"name": "Prymitywy", "revision": 1, "defaults": {}},
        "buses": [
            {"ref_id": "bus_1", "name": "Szyna 1", "voltage_kv": 15.0, "tags": [], "meta": {}},
            {"ref_id": "bus_2", "name": "Szyna 2", "voltage_kv": 15.0, "tags": [], "meta": {}},
            {"ref_id": "bus_3", "name": "Szyna 3", "voltage_kv": 0.4, "tags": [], "meta": {}},
        ],
        "branches": [
            {
                "ref_id": "wylacznik_1",
                "name": "Wyłącznik 1",
                "type": "breaker",
                "from_bus_ref": "bus_1",
                "to_bus_ref": "bus_2",
                "status": "closed",
                "tags": [],
                "meta": {},
            }
        ],
        "transformers": [],
        "sources": [],
        "loads": [],
        "generators": [],
        "substations": [],
        "bays": [],
        "junctions": [],
        "corridors": [],
        "measurements": [
            {
                "ref_id": "ct_1",
                "name": "CT 1",
                "measurement_type": "CT",
                "bus_ref": "bus_1",
                "rating": {"ratio_primary": 200.0, "ratio_secondary": 5.0},
                "tags": [],
                "meta": {},
            }
        ],
        "protection_assignments": [],
    }


#: (prymityw, kolekcja, ładunek bez nazwy, opis rodzaju) — każdy rodzaj elementu.
PRYMITYWY = [
    pytest.param(
        create_node,
        "buses",
        {"ref_id": "nowa_szyna", "voltage_kv": 15.0},
        "Szyna bez nazwy",
        id="szyna",
    ),
    pytest.param(
        create_branch,
        "branches",
        {
            "ref_id": "nowa_linia",
            "type": "line_overhead",
            "from_bus_ref": "bus_1",
            "to_bus_ref": "bus_2",
            "length_km": 1.0,
            "r_ohm_per_km": 0.3,
            "x_ohm_per_km": 0.35,
        },
        "Linia napowietrzna bez nazwy",
        id="linia",
    ),
    pytest.param(
        create_branch,
        "branches",
        {
            "ref_id": "nowy_kabel",
            "type": "cable",
            "from_bus_ref": "bus_1",
            "to_bus_ref": "bus_2",
            "length_km": 1.0,
            "r_ohm_per_km": 0.2,
            "x_ohm_per_km": 0.1,
        },
        "Kabel bez nazwy",
        id="kabel",
    ),
    pytest.param(
        create_branch,
        "branches",
        {
            "ref_id": "nowy_wylacznik",
            "type": "breaker",
            "from_bus_ref": "bus_1",
            "to_bus_ref": "bus_2",
        },
        "Wyłącznik bez nazwy",
        id="wylacznik",
    ),
    pytest.param(
        create_device,
        "transformers",
        {
            "device_type": "transformer",
            "ref_id": "nowy_trafo",
            "hv_bus_ref": "bus_2",
            "lv_bus_ref": "bus_3",
            "sn_mva": 0.63,
            "uhv_kv": 15.0,
            "ulv_kv": 0.4,
            "uk_percent": 6.0,
            "pk_kw": 6.5,
        },
        "Transformator bez nazwy",
        id="transformator",
    ),
    pytest.param(
        create_device,
        "loads",
        {"device_type": "load", "ref_id": "nowy_odbior", "bus_ref": "bus_3", "p_mw": 0.1},
        "Odbiór bez nazwy",
        id="odbior",
    ),
    pytest.param(
        create_device,
        "generators",
        {"device_type": "generator", "ref_id": "nowy_generator", "bus_ref": "bus_3", "p_mw": 0.1},
        "Generator bez nazwy",
        id="generator",
    ),
    pytest.param(
        create_device,
        "sources",
        {"device_type": "source", "ref_id": "nowe_zrodlo", "bus_ref": "bus_1"},
        "Źródło zasilania bez nazwy",
        id="zrodlo",
    ),
    pytest.param(
        create_measurement,
        "measurements",
        {
            "ref_id": "nowy_ct",
            "measurement_type": "CT",
            "bus_ref": "bus_1",
            "rating": {"ratio_primary": 400.0, "ratio_secondary": 5.0},
        },
        "Przekładnik prądowy bez nazwy",
        id="przekladnik-pradowy",
    ),
    pytest.param(
        create_measurement,
        "measurements",
        {
            "ref_id": "nowy_vt",
            "measurement_type": "VT",
            "bus_ref": "bus_1",
            "rating": {"ratio_primary": 15000.0, "ratio_secondary": 100.0},
        },
        "Przekładnik napięciowy bez nazwy",
        id="przekladnik-napieciowy",
    ),
    pytest.param(
        attach_protection,
        "protection_assignments",
        {"ref_id": "nowe_zabezpieczenie", "breaker_ref": "wylacznik_1", "ct_ref": "ct_1"},
        "Zabezpieczenie bez nazwy",
        id="zabezpieczenie",
    ),
]


@pytest.mark.parametrize(("prymityw", "kolekcja", "ladunek", "opis_rodzaju"), PRYMITYWY)
@pytest.mark.parametrize("brak_nazwy", BRAKI_NAZWY)
def test_prymityw_bez_nazwy_daje_opis_rodzaju_nigdy_identyfikator(
    brak_nazwy: dict[str, Any],
    prymityw: Any,
    kolekcja: str,
    ladunek: dict[str, Any],
    opis_rodzaju: str,
) -> None:
    wynik = prymityw(_enm_prymitywow(), {**ladunek, **brak_nazwy})
    assert wynik.success, [i.message_pl for i in wynik.issues]
    element = next(e for e in wynik.enm[kolekcja] if e["ref_id"] == ladunek["ref_id"])
    assert element["name"] == opis_rodzaju
    assert ladunek["ref_id"] not in element["name"]


@pytest.mark.parametrize(("prymityw", "kolekcja", "ladunek", "opis_rodzaju"), PRYMITYWY)
def test_prymityw_z_nazwa_jawna_zachowuje_ja(
    prymityw: Any, kolekcja: str, ladunek: dict[str, Any], opis_rodzaju: str
) -> None:
    wynik = prymityw(_enm_prymitywow(), {**ladunek, "name": "Nazwa z projektu"})
    assert wynik.success, [i.message_pl for i in wynik.issues]
    element = next(e for e in wynik.enm[kolekcja] if e["ref_id"] == ladunek["ref_id"])
    assert element["name"] == "Nazwa z projektu"


def test_predykat_nazwy_jeden_dla_indeksu_i_operacji() -> None:
    """Predykat „nazwa jest" — ten sam dla indeksu nazw, prymitywów i operacji domenowych."""
    assert [jest_nazwa(w) for w in (None, "", "   ", "\t", 7, "A", " A ")] == [
        False,
        False,
        False,
        False,
        False,
        True,
        True,
    ]


# ---------------------------------------------------------------------------
# Przekładniki pola, sekcja nN, kopia odpływu nN
# ---------------------------------------------------------------------------

_PRZEKLADNIKI = [
    pytest.param(
        "add_ct",
        {
            "ratio_primary_a": 400.0,
            "ratio_secondary_a": 5.0,
            "catalog_binding": {
                "catalog_namespace": "CT",
                "catalog_item_id": "ct_400_5_5p20_15va_abb",
                "catalog_item_version": "2024.1",
            },
        },
        "CT pola",
        id="ct",
    ),
    pytest.param(
        "add_vt",
        {
            "ratio_primary_v": 20000.0,
            "ratio_secondary_v": 100.0,
            "catalog_binding": {
                "catalog_namespace": "VT",
                "catalog_item_id": "vt_20kv_100v_3p_abb",
                "catalog_item_version": "2024.1",
            },
        },
        "VT pola",
        id="vt",
    ),
]


#: Iloczyn cech nazwy pola, od której przekładnik bierze nazwę: nazwa specyfikacji ×
#: element pola `bay_ref` z nazwą (tak zapisują pola operacje stacji — specyfikacja bez
#: nazwy, nazwa na elemencie pola) × rola pola × rodzaj specyfikacji (SN / nN).
_NAZWY_POLA = [
    pytest.param("Pole IN", "field_specs", None, "IN", "Pole IN", id="spec-z-nazwa"),
    pytest.param(
        "Pole IN",
        "field_specs",
        "Pole liniowe wejściowe — Stacja 1",
        "IN",
        "Pole IN",
        id="spec-z-nazwa-wygrywa-z-elementem",
    ),
    pytest.param(
        None,
        "field_specs",
        "Pole liniowe wejściowe — Stacja 1",
        "IN",
        "Pole liniowe wejściowe — Stacja 1",
        id="spec-bez-nazwy-element-pola-z-nazwa",
    ),
    pytest.param("", "field_specs", "  ", "IN", "Pole liniowe wejściowe", id="bez-nazw-rola-sn"),
    pytest.param(
        "", "field_specs", None, "POMIAROWE", "Pole pomiarowe", id="bez-nazw-rola-pomiarowa"
    ),
    pytest.param("", "field_specs", None, None, "Pole SN", id="bez-nazw-bez-roli"),
    pytest.param("", "nn_field_specs", None, None, "Pole nN bez nazwy", id="pole-nn-bez-nazwy"),
]


@pytest.mark.parametrize(("operacja", "ladunek", "przedrostek"), _PRZEKLADNIKI)
@pytest.mark.parametrize(
    ("nazwa_pola", "rodzaj_spec", "nazwa_elementu_pola", "rola", "oczekiwana"), _NAZWY_POLA
)
def test_przekladnik_pola_bez_nazwy_nazywa_sie_od_nazwy_pola(
    nazwa_pola: str | None,
    rodzaj_spec: str,
    nazwa_elementu_pola: str | None,
    rola: str | None,
    oczekiwana: str,
    operacja: str,
    ladunek: dict[str, Any],
    przedrostek: str,
) -> None:
    enm = _valid_enm_with_field_specs("Przekładniki pola")
    meta = enm["substations"][0]["meta"]
    spec = meta.pop("field_specs")[0]
    spec["name"] = nazwa_pola
    spec["bay_role"] = rola
    if nazwa_elementu_pola is not None:
        spec["bay_ref"] = "bay_in_1"
        enm["bays"] = [
            {
                "ref_id": "bay_in_1",
                "name": nazwa_elementu_pola,
                "bay_role": "IN",
                "substation_ref": "sub_1",
                "bus_ref": "b1",
            }
        ]
    meta[rodzaj_spec] = [spec]
    wynik = execute_domain_operation(enm, operacja, {"field_ref": "field_in_1", **ladunek})
    assert not wynik.get("error"), wynik.get("error")
    przekladnik = wynik["snapshot"]["measurements"][-1]
    assert przekladnik["name"] == f"{przedrostek} {oczekiwana}"
    assert "field_in_1" not in przekladnik["name"]


@pytest.mark.parametrize(
    ("nazwa_stacji", "oczekiwana"),
    [
        pytest.param("RGnN-1", "Sekcja 2 — RGnN-1", id="stacja-z-nazwa"),
        pytest.param("", "Sekcja 2 — Stacja bez nazwy", id="stacja-bez-nazwy"),
    ],
)
def test_sekcja_nn_nazywa_sie_od_nazwy_stacji(nazwa_stacji: str, oczekiwana: str) -> None:
    snap = _board()
    stacja = _stacja(snap)
    stacja["name"] = nazwa_stacji
    wynik = _wykonaj(
        snap,
        "add_nn_section_coupler",
        {"station_ref": stacja["ref_id"], "catalog_ref": REF_APARAT_NN},
    )
    sekcje = sorted(_stacja(wynik["snapshot"])["nn_sections"], key=lambda s: s["order"])
    szyna = _szyna(wynik["snapshot"], sekcje[-1]["bus_ref"])
    assert szyna["name"] == oczekiwana
    assert stacja["ref_id"] not in szyna["name"]


@pytest.mark.parametrize("bez_nazw", [False, True], ids=["z-nazwami", "bez-nazw"])
def test_kopia_odplywu_nn_nazywa_kopie_od_nazw_albo_opisu_rodzaju(bez_nazw: bool) -> None:
    snap = _board()
    bus1, bus2, snap = _dwie_szyny_nn(snap)
    snap = _wykonaj(
        snap,
        "add_nn_switch_device",
        {
            "from_bus_ref": bus1,
            "to_bus_ref": bus2,
            "catalog_ref": REF_APARAT_NN,
            "name": "Aparat odpływowy",
        },
    )["snapshot"]
    aparat_ref = _branch_by_name(snap, "Aparat odpływowy")["ref_id"]
    snap = _wykonaj(
        snap,
        "add_nn_cable_segment",
        {"from_bus_ref": bus2, "length_m": 15.0, "catalog_ref": REF_KABEL_NN, "name": "Kabel K"},
    )["snapshot"]
    kabel = _branch_by_name(snap, "Kabel K")
    snap["loads"].append(
        {
            "ref_id": "odbior-k",
            "name": "Odbiór K",
            "bus_ref": kabel["to_bus_ref"],
            "p_mw": 0.007,
            "q_mvar": 0.0,
            "model": "pq",
            "tags": [],
            "meta": {},
        }
    )
    oryginaly = {aparat_ref, kabel["ref_id"], bus2, kabel["to_bus_ref"], "odbior-k"}
    if bez_nazw:
        snap = copy.deepcopy(snap)
        for kolekcja in ("branches", "buses", "loads"):
            for element in snap[kolekcja]:
                if element["ref_id"] in oryginaly:
                    element["name"] = ""

    kopia = _wykonaj(
        snap, "copy_nn_feeder", {"feeder_apparatus_ref": aparat_ref, "name": "Kopia F1"}
    )["snapshot"]
    nowe_galezie = {b["ref_id"] for b in kopia["branches"]} - {
        b["ref_id"] for b in snap["branches"]
    }
    nazwy_galezi = sorted(_galaz(kopia, ref)["name"] for ref in nowe_galezie)
    nowe_szyny = {b["ref_id"] for b in kopia["buses"]} - {b["ref_id"] for b in snap["buses"]}
    nazwy_szyn = sorted(_szyna(kopia, ref)["name"] for ref in nowe_szyny)
    nazwy_odbiorow = sorted(
        ld["name"]
        for ld in kopia["loads"]
        if ld["ref_id"] not in {x["ref_id"] for x in snap["loads"]}
    )
    if bez_nazw:
        typ_aparatu = _galaz(snap, aparat_ref)["type"]
        opis_aparatu = {"switch": "Łącznik bez nazwy", "breaker": "Wyłącznik bez nazwy"}[
            typ_aparatu
        ]
        assert nazwy_galezi == sorted([f"Kopia F1 — {opis_aparatu}", "Kopia F1 — Kabel bez nazwy"])
        assert nazwy_szyn == ["Kopia F1 — Szyna bez nazwy", "Kopia F1 — Szyna bez nazwy"]
        assert nazwy_odbiorow == ["Kopia F1 — Odbiór bez nazwy"]
    else:
        assert nazwy_galezi == ["Kopia F1 — Aparat odpływowy", "Kopia F1 — Kabel K"]
        assert nazwy_odbiorow == ["Kopia F1 — Odbiór K"]
    for nazwa in nazwy_galezi + nazwy_szyn + nazwy_odbiorow:
        assert not any(ref in nazwa for ref in oryginaly), nazwa
    assert all(jest_nazwa(nazwa) for nazwa in nazwy_galezi + nazwy_szyn + nazwy_odbiorow)


# ---------------------------------------------------------------------------
# Jedna reguła nazwy pola ze specyfikacji stacji — wszyscy konsumenci
# ---------------------------------------------------------------------------

_SPEC_POLA = [
    pytest.param({"name": "Pole IN"}, "Pole IN", id="nazwa-specyfikacji"),
    pytest.param(
        {"name": None, "bay_ref": "bay_in_1"},
        "Pole liniowe wejściowe — Stacja 1",
        id="nazwa-elementu-pola",
    ),
    pytest.param({"name": " "}, "Pole liniowe wejściowe", id="nazwa-roli"),
]


def _model_z_polem_ze_specyfikacji(nadpisania: dict[str, Any]) -> Any:
    from enm.models import EnergyNetworkModel

    enm = _valid_enm_with_field_specs("Nazwa pola ze specyfikacji")
    enm["bays"] = [
        {
            "ref_id": "bay_in_1",
            "name": "Pole liniowe wejściowe — Stacja 1",
            "bay_role": "IN",
            "substation_ref": "sub_1",
            "bus_ref": "b1",
        }
    ]
    enm["substations"][0]["meta"]["field_specs"][0].update(nadpisania)
    return EnergyNetworkModel.model_validate(enm)


@pytest.mark.parametrize(("nadpisania", "oczekiwana"), _SPEC_POLA)
def test_nazwa_pola_ze_specyfikacji_ta_sama_w_read_modelu_i_ocenie_lom(
    nadpisania: dict[str, Any], oczekiwana: str
) -> None:
    """Iloczyn: {nazwa specyfikacji, nazwa elementu pola `bay_ref`, tylko rola} × {read-model
    pola (`collect_bays`), ocena LoM (`_pola_przylaczeniowe`)} — obie drogi dają tę samą nazwę
    (jedna reguła `nazwa_pola_ze_specyfikacji`), nigdy identyfikator `field_in_1`."""
    from application.analyses.ochrona_lom import _pola_przylaczeniowe
    from application.field_read_model import collect_bays

    model = _model_z_polem_ze_specyfikacji(nadpisania)
    for zbieracz in (collect_bays, _pola_przylaczeniowe):
        [pole] = [p for p in zbieracz(model) if p.ref_id == "field_in_1"]
        assert pole.name == oczekiwana, zbieracz.__name__
        assert "field_in_1" not in pole.name
