"""Odbiór nN z pozycji katalogu niesie MOC BIERNĄ katalogu — droga projektanta.

DEFEKT, ZMIERZONY NA ŻYWYM BACKENDZIE (2026-09-11). `add_nn_load` pobierała
pozycję katalogu WYŁĄCZNIE po to, żeby sprawdzić jej istnienie::

    _, blad_katalogu = _pozycja_katalogu(...)     # tabliczka WYRZUCONA

po czym budowała rekord z ``q_mvar = (reactive_power_kvar or 0)/1000``, gdzie
``reactive_power_kvar`` pochodziło WYŁĄCZNIE z payloadu. Odbiór związany z
``load_przem_75kw`` (katalog: ``q_kvar = 28,0``, ``cos_phi = 0,94`` IND) trafiał
więc do modelu jako::

    p_mw = 0.075, q_mvar = 0.0, materialized_params = null,
    parameter_source = "CATALOG", source_mode = "KATALOG"

Rachunek szedł z cosφ = 1,0, a rekord twierdził „parametry z katalogu" — to
dokładnie phantom cosφ V12K-050, tyle że wpuszczony drugimi drzwiami.

KLASA, NIE INSTANCJA. Bliźniacza migracja legacy pól nN
(`catalog_completion.complete_station_loads_from_nn_feeders`) broniła się przed
tym samym phantomem od dawna i JEJ docstring deklarował „parytet z naprawionym
``add_nn_load``". Deklaracja była nieprawdziwa: klasa była zamknięta w JEDNYM z
dwóch pisarzy odbioru katalogowego. Ten plik jest testem PRZYPIĘTYM do tej
deklaracji — bez niego obietnica znów wyłączałaby czujność.

ZAKRES TESTÓW = ILOCZYN CECH, nie przykład z karty. Krzyżujemy:
  * źródło Q: {payload q, payload cosφ, katalog q_kvar, katalog cosφ IND,
    katalog cosφ POJ, katalog „BRAK", katalog milczący},
  * obecność pozycji katalogu: {KATALOG, EKSPERCKI_RECZNY},
  * obecność wielomianu ZIP (scalanie `materialized_params`).
"""

from __future__ import annotations

import math
from dataclasses import replace
from typing import Any

import pytest
from enm.catalog_completion import (
    Q_SOURCE_CATALOG_COS_PHI,
    Q_SOURCE_CATALOG_NO_REACTIVE,
    Q_SOURCE_CATALOG_Q_KVAR,
)
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.types import LoadType

CATALOG_LINE_70 = "line-base-al-st-70"
CATALOG_TRAFO_630 = "tr-sn-nn-15-04-630kva-dyn11"
CATALOG_ZRODLO_250 = "src-gpz-15kv-250mva-rx010"
CATALOG_FIELD_APPARATUS = "sw-cb-abb-vd4-17kv-630a"
CATALOG_APARAT_NN = "cb_nn_400a"

#: Pozycja z JAWNĄ mocą bierną tabliczki (gałąź 1 hierarchii).
ODBIOR_Z_Q_KVAR = "load_przem_75kw"
#: Pozycja BEZ q_kvar, z cosφ indukcyjnym (gałąź 2 hierarchii).
ODBIOR_Z_COS_PHI = "load_uslugi_30kw"


def _op(snap: dict[str, Any], name: str, payload: dict[str, Any]) -> dict[str, Any]:
    wynik = execute_domain_operation(snap, name, payload)
    assert not wynik.get(
        "error"
    ), f"Operacja '{name}' zwróciła błąd: {wynik.get('error')} (code={wynik.get('error_code')})"
    return wynik["snapshot"]


def _op_blad(snap: dict[str, Any], name: str, payload: dict[str, Any]) -> dict[str, Any]:
    wynik = execute_domain_operation(snap, name, payload)
    assert wynik.get("error"), f"Operacja '{name}' MIAŁA odrzucić payload, a przeszła."
    return wynik


def _stacja_z_odplywem_nn(*, wiazanie_aparatu: bool = True) -> tuple[dict[str, Any], str, str, str]:
    """Sieć: GPZ → 2 odcinki → stacja SN/nN → odpływ nN (bez odbioru).

    Zwraca ``(migawka, station_ref, bus_nn_ref, feeder_ref)``.
    """
    snap = EnergyNetworkModel(
        header=ENMHeader(name="Odbiór nN", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    ).model_dump(mode="json")
    snap = _op(
        snap,
        "add_grid_source_sn",
        {"voltage_kv": 15.0, "sk3_mva": 250.0, "catalog_ref": CATALOG_ZRODLO_250},
    )
    for _ in range(2):
        snap = _op(
            snap,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "LINIA_NAPOWIETRZNA",
                    "dlugosc_m": 500.0,
                    "catalog_ref": CATALOG_LINE_70,
                }
            },
        )
    segment_id = next(b["ref_id"] for b in snap["branches"] if b.get("type") == "line_overhead")
    snap = _op(
        snap,
        "insert_station_on_segment_sn",
        {
            "segment_id": segment_id,
            "field_apparatus_catalog_ref": CATALOG_FIELD_APPARATUS,
            "station": {"name": "Stacja S1", "station_type": "inline", "nn_voltage_kv": 0.4},
            "transformer": {"transformer_catalog_ref": CATALOG_TRAFO_630},
            "nn_voltage_kv": 0.4,
        },
    )
    station_ref = next(s["ref_id"] for s in snap["substations"] if s["ref_id"].startswith("stn/"))
    bus_nn_ref = next(
        b["ref_id"]
        for b in snap["buses"]
        if b.get("voltage_kv") is not None and b["voltage_kv"] < 1.0
    )

    payload: dict[str, Any] = {"station_ref": station_ref, "bus_nn_ref": bus_nn_ref}
    if wiazanie_aparatu:
        payload["catalog_binding"] = {
            "catalog_namespace": "APARAT_NN",
            "catalog_item_id": CATALOG_APARAT_NN,
            "catalog_item_version": "2024.1",
        }
    wynik = execute_domain_operation(snap, "add_nn_outgoing_field", payload)
    assert not wynik.get("error"), wynik.get("error")
    feeder_ref = (wynik.get("selection_hint") or {})["element_id"]
    return wynik["snapshot"], station_ref, bus_nn_ref, feeder_ref


def _dodaj_odbior(snap: dict[str, Any], **nadpisania: Any) -> dict[str, Any]:
    station_ref, bus_nn_ref, feeder_ref = (
        nadpisania.pop("station_ref"),
        nadpisania.pop("bus_nn_ref"),
        nadpisania.pop("feeder_ref"),
    )
    payload: dict[str, Any] = {
        "station_ref": station_ref,
        "bus_nn_ref": bus_nn_ref,
        "feeder_ref": feeder_ref,
        "load_kind": "SKUPIONY",
        "connection_type": "TROJFAZOWY",
        "active_power_kw": 75.0,
        "load_name": "Odbiór testowy",
    }
    payload.update(nadpisania)
    return payload


def _podmien_pozycje_odbioru(
    monkeypatch: pytest.MonkeyPatch, type_id: str, zmiany: dict[str, Any]
) -> None:
    """Podmień JEDNĄ pozycję katalogu odbiorów, resztę zostaw prawdziwą.

    `CatalogRepository` i `LoadType` są ZAMROŻONYMI dataklasami, więc podmiana
    idzie przez TYP repozytorium (jak w `test_catalog_completion_cosphi`) i przez
    `dataclasses.replace` pozycji — nie przez przypisanie do instancji. Pozostałe
    pozycje muszą przechodzić bez zmian: inaczej test badałby katalog-atrapę
    zamiast katalogu produktu.
    """
    katalog = get_default_mv_catalog()
    prawdziwe = type(katalog).get_load_type

    def _podmienione(self: Any, szukane: str) -> LoadType | None:
        pozycja = prawdziwe(self, szukane)
        if pozycja is None or szukane != type_id:
            return pozycja
        return replace(pozycja, **zmiany)

    monkeypatch.setattr(type(katalog), "get_load_type", _podmienione, raising=True)


def _jedyny_odbior(snap: dict[str, Any]) -> dict[str, Any]:
    odbiory = snap.get("loads") or []
    assert len(odbiory) == 1, f"Oczekiwano jednego odbioru, jest {len(odbiory)}."
    return odbiory[0]


# ---------------------------------------------------------------------------
# (a) Q z tabliczki katalogu — obie gałęzie hierarchii
# ---------------------------------------------------------------------------


def test_jawne_q_kvar_katalogu_trafia_do_modelu() -> None:
    """Gałąź 1: pozycja z jawnym ``q_kvar`` — bez przeliczeń, wprost do modelu.

    To jest dokładnie przypadek zmierzony przed naprawą: model dostawał Q = 0.
    """
    snap, station, bus, feeder = _stacja_z_odplywem_nn()
    pozycja = get_default_mv_catalog().get_load_type(ODBIOR_Z_Q_KVAR)
    assert pozycja is not None and pozycja.q_kvar == 28.0, "Fikstura nietrafiona w katalog."

    snap = _op(
        snap,
        "add_nn_load",
        _dodaj_odbior(
            snap,
            station_ref=station,
            bus_nn_ref=bus,
            feeder_ref=feeder,
            catalog_binding={
                "catalog_namespace": "OBCIAZENIE",
                "catalog_item_id": ODBIOR_Z_Q_KVAR,
                "catalog_item_version": "2024.1",
            },
        ),
    )
    odbior = _jedyny_odbior(snap)
    assert odbior["q_mvar"] == pytest.approx(0.028), "Phantom cosφ wrócił — Q nie z katalogu."
    assert odbior["p_mw"] == pytest.approx(0.075)
    assert odbior["parameter_source"] == "CATALOG"
    assert odbior["source_mode"] == "KATALOG"


def test_cos_phi_katalogu_daje_q_przy_MOCY_PROJEKTANTA_nie_tabliczkowej() -> None:
    """Gałąź 2: Q = P·tan(arccos cosφ) liczone przy P ZADEKLAROWANYM w formularzu.

    PREDYKATY PARAMI. Gdyby przeliczenie szło od katalogowego ``p_kw`` (30 kW),
    odbiór 75 kW dostałby moc bierną odbioru 30 kW — rekord byłby wewnętrznie
    sprzeczny (P projektanta, Q tabliczki) i nikt by tego nie zobaczył, bo obie
    liczby „pochodzą z katalogu".
    """
    snap, station, bus, feeder = _stacja_z_odplywem_nn()
    pozycja = get_default_mv_catalog().get_load_type(ODBIOR_Z_COS_PHI)
    assert pozycja is not None and pozycja.q_kvar is None and pozycja.cos_phi == 0.92
    assert pozycja.p_kw == 30.0, "Fikstura ma sens tylko, gdy P katalogu ≠ P formularza."

    snap = _op(
        snap,
        "add_nn_load",
        _dodaj_odbior(
            snap,
            station_ref=station,
            bus_nn_ref=bus,
            feeder_ref=feeder,
            catalog_binding={
                "catalog_namespace": "OBCIAZENIE",
                "catalog_item_id": ODBIOR_Z_COS_PHI,
                "catalog_item_version": "2024.1",
            },
        ),
    )
    odbior = _jedyny_odbior(snap)
    oczekiwane = 0.075 * math.tan(math.acos(0.92))
    assert odbior["q_mvar"] == pytest.approx(oczekiwane, rel=1e-12)
    assert odbior["q_mvar"] != pytest.approx(
        0.030 * math.tan(math.acos(0.92))
    ), "Q policzone od MOCY KATALOGU zamiast od mocy projektanta."


def test_slad_white_box_mowi_KTORA_galezia_hierarchii_poszlo_Q() -> None:
    """Bez znacznika źródła audyt nie odróżni 28 kvar tabliczki od przeliczenia."""
    snap, station, bus, feeder = _stacja_z_odplywem_nn()
    snap_q = _op(
        snap,
        "add_nn_load",
        _dodaj_odbior(
            snap,
            station_ref=station,
            bus_nn_ref=bus,
            feeder_ref=feeder,
            catalog_binding={"catalog_namespace": "OBCIAZENIE", "catalog_item_id": ODBIOR_Z_Q_KVAR},
        ),
    )
    slad = _jedyny_odbior(snap_q)["materialized_params"]
    assert slad["q_source"] == Q_SOURCE_CATALOG_Q_KVAR
    assert slad["catalog_item_id"] == ODBIOR_Z_Q_KVAR
    assert slad["q_kvar"] == pytest.approx(28.0)
    assert slad["catalog_p_kw"] == pytest.approx(75.0)
    assert slad["catalog_cos_phi"] == pytest.approx(0.94)
    assert slad["catalog_cos_phi_mode"] == "IND"

    snap_cos = _op(
        snap,
        "add_nn_load",
        _dodaj_odbior(
            snap,
            station_ref=station,
            bus_nn_ref=bus,
            feeder_ref=feeder,
            catalog_binding={
                "catalog_namespace": "OBCIAZENIE",
                "catalog_item_id": ODBIOR_Z_COS_PHI,
            },
        ),
    )
    assert _jedyny_odbior(snap_cos)["materialized_params"]["q_source"] == Q_SOURCE_CATALOG_COS_PHI


# ---------------------------------------------------------------------------
# (b) Pierwszeństwo deklaracji projektanta nad tabliczką
# ---------------------------------------------------------------------------


def test_jawne_q_formularza_wygrywa_z_tabliczka() -> None:
    """Formularz opisuje KONKRETNĄ instalację, katalog tylko typ.

    Katalog uzupełnia to, czego formularz nie powiedział — nigdy nie nadpisuje
    tego, co powiedział. Bez tej strony testu naprawa „Q z katalogu" mogłaby
    zjeść deklarację projektanta i nikt by nie zauważył.
    """
    snap, station, bus, feeder = _stacja_z_odplywem_nn()
    snap = _op(
        snap,
        "add_nn_load",
        _dodaj_odbior(
            snap,
            station_ref=station,
            bus_nn_ref=bus,
            feeder_ref=feeder,
            reactive_power_kvar=11.0,
            catalog_binding={"catalog_namespace": "OBCIAZENIE", "catalog_item_id": ODBIOR_Z_Q_KVAR},
        ),
    )
    odbior = _jedyny_odbior(snap)
    assert odbior["q_mvar"] == pytest.approx(0.011)
    assert (
        odbior.get("materialized_params") is None
    ), "Q nie przyszło z katalogu, więc ślad materializacji Q nie ma czego opisywać."


def test_cos_phi_formularza_wygrywa_z_tabliczka() -> None:
    """Ta sama zasada dla drugiego kanału deklaracji — cosφ podanego w formularzu."""
    snap, station, bus, feeder = _stacja_z_odplywem_nn()
    snap = _op(
        snap,
        "add_nn_load",
        _dodaj_odbior(
            snap,
            station_ref=station,
            bus_nn_ref=bus,
            feeder_ref=feeder,
            cos_phi=0.80,
            catalog_binding={"catalog_namespace": "OBCIAZENIE", "catalog_item_id": ODBIOR_Z_Q_KVAR},
        ),
    )
    assert _jedyny_odbior(snap)["q_mvar"] == pytest.approx(
        0.075 * math.tan(math.acos(0.80)), rel=1e-12
    )


# ---------------------------------------------------------------------------
# (c) Odbiór ekspercki — tor BEZ katalogu zostaje nietknięty
# ---------------------------------------------------------------------------


def test_odbior_ekspercki_bez_katalogu_zapisuje_sie_jak_przed_naprawa() -> None:
    """ZGODNOŚĆ: brak pozycji ⇒ Q z payloadu (także 0), bez `materialized_params`.

    Cisza katalogu, którego NIE MA, nie jest phantomem — to jawna deklaracja
    projektanta w trybie eksperckim. Zakaz cichego Q = 0 dotyczy WYŁĄCZNIE
    rekordu z pieczątką „CATALOG".
    """
    snap, station, bus, feeder = _stacja_z_odplywem_nn()
    snap = _op(
        snap,
        "add_nn_load",
        _dodaj_odbior(snap, station_ref=station, bus_nn_ref=bus, feeder_ref=feeder),
    )
    odbior = _jedyny_odbior(snap)
    assert odbior["q_mvar"] == 0.0
    assert odbior["source_mode"] == "EKSPERCKI_RECZNY"
    assert odbior["parameter_source"] == "OVERRIDE"
    assert odbior.get("catalog_ref") is None
    assert odbior.get("materialized_params") is None


# ---------------------------------------------------------------------------
# (d) Katalog milczący — odmowa zamiast phantomu (parytet z migracją)
# ---------------------------------------------------------------------------


def test_katalog_bez_q_i_bez_cos_phi_ODRZUCA_operacje(monkeypatch: pytest.MonkeyPatch) -> None:
    """Brak kanonu tabliczki ⇒ operacja odrzucona, a NIE ciche Q = 0 pod „CATALOG".

    To ten sam warunek, który stosuje migracja legacy
    (`complete_station_loads_from_nn_feeders`: „Brak kanonu katalogu dla mocy
    biernej ⇒ NIE materializujemy odbioru"). Predykat wejścia obu pisarzy
    pochodzi z jednego źródła — `moc_bierna_odbioru_katalogowego`.
    """
    snap, station, bus, feeder = _stacja_z_odplywem_nn()
    _podmien_pozycje_odbioru(
        monkeypatch,
        ODBIOR_Z_Q_KVAR,
        {"q_kvar": None, "cos_phi": None, "cos_phi_mode": None},
    )

    wynik = _op_blad(
        snap,
        "add_nn_load",
        _dodaj_odbior(
            snap,
            station_ref=station,
            bus_nn_ref=bus,
            feeder_ref=feeder,
            catalog_binding={"catalog_namespace": "OBCIAZENIE", "catalog_item_id": ODBIOR_Z_Q_KVAR},
        ),
    )
    assert wynik.get("error_code") == "catalog.load_reactive_power_unresolved"
    assert "moc" in str(wynik.get("error")).lower()


def test_katalogowy_kanon_BRAK_mocy_biernej_zapisuje_zero_JAWNIE(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``cos_phi_mode == "BRAK"`` to jedyna droga, którą Q = 0 wolno wejść z katalogu.

    Rozróżnienie „katalog milczy" (odmowa) od „katalog mówi: bez mocy biernej"
    (zero, jawnie oznaczone) jest całą różnicą między phantomem a deklaracją.
    """
    snap, station, bus, feeder = _stacja_z_odplywem_nn()
    _podmien_pozycje_odbioru(monkeypatch, ODBIOR_Z_Q_KVAR, {"q_kvar": None, "cos_phi_mode": "BRAK"})

    snap = _op(
        snap,
        "add_nn_load",
        _dodaj_odbior(
            snap,
            station_ref=station,
            bus_nn_ref=bus,
            feeder_ref=feeder,
            catalog_binding={"catalog_namespace": "OBCIAZENIE", "catalog_item_id": ODBIOR_Z_Q_KVAR},
        ),
    )
    odbior = _jedyny_odbior(snap)
    assert odbior["q_mvar"] == 0.0
    assert odbior["materialized_params"]["q_source"] == Q_SOURCE_CATALOG_NO_REACTIVE


def test_katalog_pojemnosciowy_daje_Q_UJEMNE(monkeypatch: pytest.MonkeyPatch) -> None:
    """Konwencja znaku przechodzi z hierarchii do modelu, a nie gubi się po drodze."""
    snap, station, bus, feeder = _stacja_z_odplywem_nn()
    _podmien_pozycje_odbioru(monkeypatch, ODBIOR_Z_COS_PHI, {"cos_phi_mode": "POJ"})

    snap = _op(
        snap,
        "add_nn_load",
        _dodaj_odbior(
            snap,
            station_ref=station,
            bus_nn_ref=bus,
            feeder_ref=feeder,
            catalog_binding={
                "catalog_namespace": "OBCIAZENIE",
                "catalog_item_id": ODBIOR_Z_COS_PHI,
            },
        ),
    )

    assert _jedyny_odbior(snap)["q_mvar"] == pytest.approx(
        -0.075 * math.tan(math.acos(0.92)), rel=1e-12
    )


# ---------------------------------------------------------------------------
# (e) Iloczyn cech: tabliczka katalogu × wielomian ZIP
# ---------------------------------------------------------------------------


def test_slad_katalogu_i_wielomian_ZIP_wspolistnieja_w_jednym_worku() -> None:
    """Oba trafiają do `materialized_params` — żaden nie może wyprzeć drugiego.

    Rozpływ czyta stamtąd współczynniki ZIP
    (`zip_coeffs_from_materialized_params`), audyt czyta stamtąd pochodzenie Q.
    Gdyby zapis jednego nadpisywał drugi, jedna z tych dwóch ścieżek cicho by
    zamilkła — a obie „działają" osobno, więc nikt by nie zauważył.
    """
    snap, station, bus, feeder = _stacja_z_odplywem_nn()
    snap = _op(
        snap,
        "add_nn_load",
        _dodaj_odbior(
            snap,
            station_ref=station,
            bus_nn_ref=bus,
            feeder_ref=feeder,
            catalog_binding={"catalog_namespace": "OBCIAZENIE", "catalog_item_id": ODBIOR_Z_Q_KVAR},
            a_p=0.5,
            b_p=0.2,
            c_p=0.3,
            a_q=0.4,
            b_q=0.1,
            c_q=0.5,
        ),
    )
    odbior = _jedyny_odbior(snap)
    slad = odbior["materialized_params"]
    assert odbior["model"] == "zip"
    assert slad["q_source"] == Q_SOURCE_CATALOG_Q_KVAR, "ZIP wyparł ślad katalogu."
    assert slad["a_p"] == pytest.approx(0.5) and slad["c_q"] == pytest.approx(
        0.5
    ), "Ślad katalogu wyparł wielomian ZIP."
