"""Aparaty toru pola SN tworzonego bez wskazanego szablonu (`enm.aparaty_pol_sn`).

Pole SN stacji i rozdzielni GPZ tworzone bez szablonu miało dotąd wyłącznie gałąź aparatu
głównego i pustą listę `Bay.primary_devices` — kompozytor SLD rysuje tor wyłącznie z rekordów
aparatów, więc pole było gołym kwadratem łącznika (ocena właściciela 0/10), a funkcje EAZ
pochodziły z szablonu, którego aparatów pole nie miało.

ILOCZYN CECH (reguła KLASA §2):
* operacja tworząca ∈ {wcięcie stacji w odcinek, dołożenie stacji na końcu ciągu,
  `add_sn_bay` w stacji, `add_sn_bay` pola sprzęgła w stacji sekcyjnej} (+ `add_sn_bay` w GPZ);
* funkcja pola ∈ {IN, OUT, FEEDER, TR, COUPLER, MEASUREMENT} (GPZ: + BKR);
* konstrukcja (rodzaj aparatu głównego z KATALOGU) ∈ {wyłącznik, rozłącznik, rozłącznik
  bezpiecznikowy, odłącznik} (+ brak pozycji katalogu — rodzaj z typu gałęzi);
* obecność funkcji EAZ ∈ {pole wyłącznikowe — funkcje szablonu, pole rozłącznikowe — brak}.

Wyrocznia: tabela rodzajów aparatów toru przypięta jawnie w tym pliku (nie z kodu szablonów);
predykat parami rekord pola ↔ gałąź aparatu ↔ aparat główny (`linked_ref`); położenie
łączników bez własnej gałęzi zgodne ze stanem gałęzi; aparat bez pozycji katalogu jest daną
przyjętą ESTIMATED (ZASADA NR 4). Parytet: aparaty toru nie zmieniają liczb zwarć ani rozpływu
(bieg kanoniczny z rekordami aparatów i bez nich). Determinizm identyfikatorów.
"""

from __future__ import annotations

import copy
import json
from collections.abc import Iterator
from typing import Any

import pytest
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel
from enm.store import reset_enm_store, set_enm
from enm.wyposazenie_pola import dane_przyjete_wyposazenia
from network_model.catalog.bay_templates import BAY_TEMPLATE_REGISTRY, SZABLON_KANONICZNY_ROLI

from tests.enm.siec_lacznikowa import _gpz, _kable, _odcinki, wykonaj

TRAFO = "tr-sn-nn-15-04-630kva-dyn11"

#: Konstrukcja pola → pozycja katalogu aparatu głównego i rodzaj rekordu aparatu głównego.
KONSTRUKCJE: dict[str, tuple[str, str]] = {
    "wylacznik": ("sw-cb-abb-vd4-17kv-630a", "CB"),
    "rozlacznik": ("sw-ls-ogolny-prozniowy-24kv-630a", "LOAD_SWITCH"),
    "rozlacznik_bezpiecznikowy": ("sw-fuse-eti-vv-17kv-63a", "LOAD_SWITCH"),
    "odlacznik": ("sw-ds-abb-ojs-17kv-630a", "DS"),
}
WYLACZNIKOWE = {"wylacznik"}

#: WYROCZNIA — rodzaje aparatów toru pola w kolejności rekordów (pole wyłącznikowe wg
#: szablonu kanonicznego roli; pole rozłącznikowe RMU — rozłącznik, uziemnik, głowica albo
#: wkładki i transformator, bez odłączników i przekładników prądowych). `GLOWNY` zastępowany
#: rodzajem aparatu głównego konstrukcji.
GLOWNY = "<glowny>"
TOR_WYLACZNIKOWY: dict[str, list[str]] = {
    "IN": ["DS", GLOWNY, "CT", "DS", "ES", "CABLE_HEAD"],
    "OUT": ["DS", GLOWNY, "CT", "DS", "ES", "CABLE_HEAD"],
    "FEEDER": ["DS", GLOWNY, "CT", "DS", "ES", "CABLE_HEAD"],
    "TR": ["DS", GLOWNY, "CT", "DS", "ES", "TRANSFORMER_DEVICE"],
    "COUPLER": ["DS", GLOWNY, "DS", "ES"],
}
TOR_ROZLACZNIKOWY: dict[str, list[str]] = {
    "IN": [GLOWNY, "ES", "CABLE_HEAD"],
    "OUT": [GLOWNY, "ES", "CABLE_HEAD"],
    "FEEDER": [GLOWNY, "ES", "CABLE_HEAD"],
    "TR": [GLOWNY, "FUSE", "ES", "TRANSFORMER_DEVICE"],
    "COUPLER": [GLOWNY, "ES"],
}
LACZNIKI = {"CB", "LOAD_SWITCH", "DS", "ES"}


@pytest.fixture(autouse=True)
def _czysty_stan() -> Iterator[None]:
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _op(enm: dict[str, Any], nazwa: str, ladunek: dict[str, Any]) -> dict[str, Any]:
    return execute_domain_operation(enm_dict=enm, op_name=nazwa, payload=ladunek)


def _galezie(enm: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {b["ref_id"]: b for b in enm["branches"]}


def _stacja_sn(enm: dict[str, Any]) -> dict[str, Any]:
    return next(s for s in enm["substations"] if s.get("station_type") != "gpz")


def _pola_stacji(enm: dict[str, Any], stacja: str) -> list[dict[str, Any]]:
    return [b for b in enm["bays"] if b.get("substation_ref") == stacja]


def _pola_sn_stacji(enm: dict[str, Any], stacja: str) -> list[dict[str, Any]]:
    """Pola rozdzielnicy SN stacji (szyna pola > 1 kV) — pola nN poza iloczynem."""
    napiecia = {b["ref_id"]: b.get("voltage_kv") for b in enm["buses"]}
    return [p for p in _pola_stacji(enm, stacja) if (napiecia.get(p.get("bus_ref")) or 0) > 1.0]


def _wciecie(konstrukcja: str, typ: str, pola: list[str]) -> dict[str, Any]:
    enm = _odcinki(_gpz(), [200, 300])
    return wykonaj(
        enm,
        "insert_station_on_segment_sn",
        {
            "segment_ref": _kable(enm)[-1]["ref_id"],
            "field_apparatus_catalog_ref": KONSTRUKCJE[konstrukcja][0],
            "station_type": typ,
            "insert_at": {"value": 0.5},
            "station": {"sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4},
            "sn_fields": pola,
            "transformer": {"create": True, "transformer_catalog_ref": TRAFO},
        },
    )


def _dolozenie(konstrukcja: str) -> dict[str, Any]:
    enm = _odcinki(_gpz(), [200])
    return wykonaj(
        enm,
        "append_station_on_endpoint",
        {
            "endpoint_bus_ref": _kable(enm)[-1]["to_bus_ref"],
            "station": {"name": "Stacja końcowa", "station_type": "terminal"},
            "nn_voltage_kv": 0.4,
            "sn_fields": ["LINIA_IN", "TRANSFORMATOROWE"],
            "field_apparatus_catalog_ref": KONSTRUKCJE[konstrukcja][0],
            "transformer": {"transformer_catalog_ref": TRAFO},
        },
    )


def _szyna_sn_stacji(enm: dict[str, Any], stacja: str) -> str:
    pole = next(b for b in _pola_stacji(enm, stacja) if b.get("bay_role") == "IN")
    return str(pole["bus_ref"])


def _dodaj_pole(enm: dict[str, Any], rola: str, konstrukcja: str) -> tuple[dict[str, Any], str]:
    stacja = _stacja_sn(enm)["ref_id"]
    przed = {b["ref_id"] for b in enm["bays"]}
    enm = wykonaj(
        enm,
        "add_sn_bay",
        {
            "bus_ref": _szyna_sn_stacji(enm, stacja),
            "station_ref": stacja,
            "bay_role": rola,
            "catalog_ref": KONSTRUKCJE[konstrukcja][0],
        },
    )
    (nowe,) = (b["ref_id"] for b in enm["bays"] if b["ref_id"] not in przed)
    return enm, nowe


def _sprawdz_pole(
    enm: dict[str, Any], pole: dict[str, Any], konstrukcja: str, *, gpz: bool = False
) -> None:
    """Tor pola wg wyroczni + predykat parami pole ↔ gałąź ↔ aparat główny + EAZ + ESTIMATED."""
    rola = pole["bay_role"]
    glowny = KONSTRUKCJE[konstrukcja][1]
    wylacznikowe = konstrukcja in WYLACZNIKOWE
    tor = (TOR_WYLACZNIKOWY if wylacznikowe else TOR_ROZLACZNIKOWY)[rola]
    oczekiwane = [glowny if k == GLOWNY else k for k in tor]
    aparaty = pole.get("primary_devices") or []
    assert [a["kind"] for a in aparaty] == oczekiwane, (rola, konstrukcja)
    # Identyfikatory aparatów jednoznaczne i z przestrzeni pola.
    refy = [a["device_ref"] for a in aparaty]
    assert len(set(refy)) == len(refy)
    assert all(r.startswith(pole["ref_id"]) for r in refy), refy
    # Predykat parami: aparat główny wskazuje gałąź aparatu pola, i tylko on.
    galezie = _galezie(enm)
    (ref_galezi,) = (e for e in pole["equipment_refs"] if e in galezie)
    galaz = galezie[ref_galezi]
    powiazane = [a for a in aparaty if a.get("linked_ref")]
    assert [(a["kind"], a["linked_ref"]) for a in powiazane] == [(glowny, ref_galezi)]
    # Łącznik bez własnej gałęzi: położenie zgodne ze stanem gałęzi (uziemnik otwarty).
    zamknieta = galaz.get("status", "closed") == "closed"
    for aparat in aparaty:
        if aparat["kind"] in LACZNIKI and not aparat.get("linked_ref"):
            stan = (aparat.get("switch_state") or {}).get("actual_state")
            if aparat["kind"] == "ES":
                assert stan == "otwarty", aparat
            else:
                assert stan == ("zamkniety" if zamknieta else "otwarty"), aparat
        assert aparat.get("stan_obiektu") == pole.get("stan_obiektu")
    # Funkcje EAZ z TEGO szablonu, z którego są aparaty (para predykatów z jednego źródła).
    kody = pole.get("protection_codes") or []
    if wylacznikowe and not gpz:
        # Funkcje szablonu; kierunkowa ziemnozwarciowa 67N jest warunkowa (potwierdzone źródło
        # 3U₀ pola, `enm.zrodlo_napiecia_zerowego`) — pole nowe jej nie ma.
        szablonu = list(SZABLON_KANONICZNY_ROLI[rola].funkcje_eaz)
        assert kody == [k for k in szablonu if k != "67N"], (rola, kody)
        assert rola == "COUPLER" or kody, "pole wyłącznikowe linii/TR ma funkcje EAZ szablonu"
    elif not wylacznikowe:
        assert kody == [], (rola, kody)
        assert "CT" not in [a["kind"] for a in aparaty]
    # ZASADA NR 4: aparat bez pozycji katalogu — dana przyjęta ESTIMATED, nie blokada.
    bez_katalogu = [a for a in aparaty if not a.get("catalog_ref")]
    dane = dane_przyjete_wyposazenia(aparaty)
    assert len([d for d in dane if d["jakosc"] == "ESTIMATED"]) >= len(bez_katalogu)


# ---------------------------------------------------------------------------
# Operacja × funkcja × konstrukcja × EAZ
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("konstrukcja", sorted(KONSTRUKCJE))
def test_wciecie_stacji_sekcyjnej_kazde_pole_ma_tor_z_szablonu(konstrukcja: str) -> None:
    enm = _wciecie(konstrukcja, "D", ["IN", "OUT", "SPRZEGLO", "TR"])
    pola_sn = _pola_sn_stacji(enm, _stacja_sn(enm)["ref_id"])
    assert sorted(p["bay_role"] for p in pola_sn) == ["COUPLER", "IN", "OUT", "TR"]
    for pole in pola_sn:
        _sprawdz_pole(enm, pole, konstrukcja)


@pytest.mark.parametrize("konstrukcja", sorted(KONSTRUKCJE))
def test_wciecie_stacji_odgaleznej_pole_odgalezienia(konstrukcja: str) -> None:
    enm = _wciecie(konstrukcja, "C", ["IN", "OUT", "LINIA_ODG", "TR"])
    pola = _pola_sn_stacji(enm, _stacja_sn(enm)["ref_id"])
    assert sorted(p["bay_role"] for p in pola) == ["FEEDER", "IN", "OUT", "TR"]
    for pole in pola:
        _sprawdz_pole(enm, pole, konstrukcja)


@pytest.mark.parametrize("konstrukcja", sorted(KONSTRUKCJE))
def test_dolozenie_stacji_na_koncu_ciagu(konstrukcja: str) -> None:
    enm = _dolozenie(konstrukcja)
    pola = _pola_sn_stacji(enm, _stacja_sn(enm)["ref_id"])
    assert sorted(p["bay_role"] for p in pola) == ["IN", "TR"]
    for pole in pola:
        _sprawdz_pole(enm, pole, konstrukcja)


@pytest.mark.parametrize("rola", ["IN", "OUT", "FEEDER", "TR"])
@pytest.mark.parametrize("konstrukcja", sorted(KONSTRUKCJE))
def test_add_sn_bay_w_stacji(rola: str, konstrukcja: str) -> None:
    enm = _wciecie("wylacznik", "B", ["IN", "OUT", "TR"])
    enm, ref = _dodaj_pole(enm, rola, konstrukcja)
    pole = next(b for b in enm["bays"] if b["ref_id"] == ref)
    _sprawdz_pole(enm, pole, konstrukcja)


@pytest.mark.parametrize("konstrukcja", sorted(KONSTRUKCJE))
def test_add_sn_bay_pole_zrodlowe_oze_w_stacji(konstrukcja: str) -> None:
    """Pole źródłowe OZE bez konfiguracji DER: tor szablonu kanonicznego roli
    (`BAY_TEMPLATE_DER_PV` — ten sam, z którego pole ma funkcje EAZ ochrony sieciowej
    i częstotliwościowej). Funkcje EAZ zostają przy każdej konstrukcji: zabezpieczenie
    sieciowe źródła jest wymaganiem przyłączenia (IRiESD), a nie cechą łącznika; aparat
    główny jest wyrobem z katalogu (rozłącznik bezpiecznikowy — wkładka wskazuje gałąź, bo
    szablon źródłowy nie ma rozłącznika)."""
    enm = _wciecie("wylacznik", "B", ["IN", "OUT", "TR"])
    enm, ref = _dodaj_pole(enm, "OZE", konstrukcja)
    pole = next(b for b in enm["bays"] if b["ref_id"] == ref)
    glowny = KONSTRUKCJE[konstrukcja][1]
    if konstrukcja == "rozlacznik_bezpiecznikowy":
        glowny = "FUSE"
    assert [a["kind"] for a in pole["primary_devices"]] == [
        "DS",
        glowny,
        "CT",
        "VT",
        "DS",
        "ES",
        "CABLE_HEAD",
    ]
    galezie = _galezie(enm)
    (ref_galezi,) = (e for e in pole["equipment_refs"] if e in galezie)
    assert [
        (a["kind"], a["linked_ref"]) for a in pole["primary_devices"] if a.get("linked_ref")
    ] == [(glowny, ref_galezi)]
    # 67N warunkowa (potwierdzone źródło 3U₀) — pole nowe jej nie ma.
    szablonu = SZABLON_KANONICZNY_ROLI["OZE"].funkcje_eaz
    assert pole["protection_codes"] == [k for k in szablonu if k != "67N"]


@pytest.mark.parametrize("konstrukcja", sorted(KONSTRUKCJE))
def test_add_sn_bay_pole_sprzegla_w_stacji_sekcyjnej(konstrukcja: str) -> None:
    enm = _wciecie("wylacznik", "D", ["IN", "OUT", "TR"])
    stacja = _stacja_sn(enm)["ref_id"]
    enm, ref = _dodaj_pole(enm, "COUPLER", konstrukcja)
    pole = next(b for b in enm["bays"] if b["ref_id"] == ref)
    assert pole["substation_ref"] == stacja
    _sprawdz_pole(enm, pole, konstrukcja)


def _nowe_pole(
    enm: dict[str, Any], stacja: str, szyna: str, ladunek: dict[str, Any]
) -> tuple[dict[str, Any], dict[str, Any]]:
    przed = {b["ref_id"] for b in enm["bays"]}
    wynik = _op(enm, "add_sn_bay", {"bus_ref": szyna, "station_ref": stacja, **ladunek})
    assert not wynik.get("error"), (wynik.get("error"), wynik.get("error_code"))
    nowe = wynik["snapshot"]
    (pole,) = (b for b in nowe["bays"] if b["ref_id"] not in przed)
    return nowe, pole


def _glowny(enm: dict[str, Any], pole: dict[str, Any]) -> tuple[str, str, str]:
    """(typ gałęzi aparatu pola, rodzaj i oznaczenie JEDYNEGO rekordu wskazującego gałąź)."""
    galezie = _galezie(enm)
    (ref,) = (e for e in pole["equipment_refs"] if e in galezie)
    (aparat,) = (a for a in pole.get("primary_devices") or [] if a.get("linked_ref"))
    assert aparat["linked_ref"] == ref
    return galezie[ref]["type"], aparat["kind"], aparat["designation"]


#: Para typ gałęzi ↔ rodzaj rekordu aparatu głównego (wyrocznia jawna).
PARA_GALAZ_APARAT = {
    "breaker": {"CB"},
    "switch": {"LOAD_SWITCH", "FUSE"},
    "disconnector": {"DS", "THREE_POSITION_SWITCH"},
    "bus_coupler": {"CB"},
}


@pytest.mark.parametrize("konstrukcja", [None, *sorted(KONSTRUKCJE)])
@pytest.mark.parametrize("szablon", [None, "bay_template_measurement"])
def test_pole_pomiarowe_stacji_aparat_glowny_wskazuje_galaz(
    konstrukcja: str | None, szablon: str | None
) -> None:
    """Pole pomiaru napięcia: bez pozycji katalogu gałąź aparatu ma rodzaj aparatu głównego
    szablonu (odłącznik Q1), z pozycją — rodzaj wyrobu zastępuje aparat główny szablonu."""
    enm = _wciecie("wylacznik", "B", ["IN", "OUT", "TR"])
    stacja = _stacja_sn(enm)["ref_id"]
    ladunek: dict[str, Any] = {"bay_role": "MEASUREMENT"}
    if konstrukcja:
        ladunek["catalog_ref"] = KONSTRUKCJE[konstrukcja][0]
    if szablon:
        ladunek["bay_template_ref"] = szablon
    nowe, pole = _nowe_pole(enm, stacja, _szyna_sn_stacji(enm, stacja), ladunek)
    typ, rodzaj, oznaczenie = _glowny(nowe, pole)
    assert rodzaj in PARA_GALAZ_APARAT[typ], (typ, rodzaj)
    assert oznaczenie == "Q1"
    oczekiwany = KONSTRUKCJE[konstrukcja][1] if konstrukcja else "DS"
    if konstrukcja == "rozlacznik_bezpiecznikowy":
        oczekiwany = "FUSE"
    assert rodzaj == oczekiwany
    assert [a["kind"] for a in pole["primary_devices"]] == [oczekiwany, "VT", "ES"]


@pytest.mark.parametrize("rola", ["IN", "OUT", "FEEDER", "TR", "BKR", "MEASUREMENT"])
@pytest.mark.parametrize("konstrukcja", [None, "wylacznik"])
def test_add_sn_bay_w_gpz_bierze_szablon_enea_roli(rola: str, konstrukcja: str | None) -> None:
    enm = _gpz(2)
    gpz = next(s for s in enm["substations"] if s.get("station_type") == "gpz")
    szyna = sorted(gpz["gpz_sections"], key=lambda s: s["order"])[0]["bus_ref"]
    ladunek: dict[str, Any] = {"bay_role": rola}
    if konstrukcja:
        ladunek["catalog_ref"] = KONSTRUKCJE[konstrukcja][0]
    nowe, pole = _nowe_pole(enm, gpz["ref_id"], szyna, ladunek)
    typ, rodzaj, _ = _glowny(nowe, pole)
    assert rodzaj in PARA_GALAZ_APARAT[typ], (rola, typ, rodzaj)
    rodzaje = [a["kind"] for a in pole["primary_devices"]]
    if rola == "MEASUREMENT":
        # Z.17 (s.97): łącznik trójpołożeniowy i przekładnik napięciowy, bez wyłącznika —
        # wskazany wyłącznik z katalogu zastępuje łącznik główny (katalog-first).
        assert rodzaj == ("CB" if konstrukcja else "THREE_POSITION_SWITCH")
        assert "VT" in rodzaje
    else:
        # Pole GPZ jest wyłącznikowe (Zeszyt 1 §13): wyłącznik i przekładnik prądowy w torze.
        assert rodzaj == "CB"
        assert "CT" in rodzaje


# ---------------------------------------------------------------------------
# Granice: pole z szablonem — tor szablonu, aparat główny wg katalogu i powiązany z gałęzią
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("konstrukcja", [None, *sorted(KONSTRUKCJE)])
@pytest.mark.parametrize("rola", ["OUT", "TR"])
def test_pole_ze_wskazanym_szablonem_aparat_glowny_wg_katalogu(
    rola: str, konstrukcja: str | None
) -> None:
    """Szablon wskazany przez projektanta wygrywa (tor wyłącznikowy z CT), aparat główny jest
    wyrobem wskazanym w katalogu i wskazuje gałąź aparatu pola (dawniej rekord CB bez
    `linked_ref` przy gałęzi rozłącznika — dwie prawdy o jednym aparacie)."""
    enm = _wciecie("wylacznik", "B", ["IN", "OUT", "TR"])
    stacja = _stacja_sn(enm)["ref_id"]
    szablon = SZABLON_KANONICZNY_ROLI[rola].template_id
    ladunek: dict[str, Any] = {"bay_role": rola, "bay_template_ref": szablon}
    if konstrukcja:
        ladunek["catalog_ref"] = KONSTRUKCJE[konstrukcja][0]
    nowe, pole = _nowe_pole(enm, stacja, _szyna_sn_stacji(enm, stacja), ladunek)
    rodzaje = [a["kind"] for a in pole["primary_devices"]]
    assert "CT" in rodzaje
    assert len(rodzaje) == len(BAY_TEMPLATE_REGISTRY[szablon].devices)
    typ, rodzaj, oznaczenie = _glowny(nowe, pole)
    assert rodzaj in PARA_GALAZ_APARAT[typ], (typ, rodzaj)
    assert oznaczenie == "Q0"
    oczekiwany = KONSTRUKCJE[konstrukcja][1] if konstrukcja else "CB"
    if konstrukcja == "rozlacznik_bezpiecznikowy":
        oczekiwany = "FUSE"
    assert rodzaj == oczekiwany


def test_kazdy_szablon_ma_co_najwyzej_jeden_wylacznik_albo_rozlacznik() -> None:
    """Deklaracja `indeks_aparatu_glownego_szablonu`: aparat główny jest jednoznaczny."""
    from network_model.catalog.bay_templates import (
        _TEMPLATE_DEVICE_KIND_TO_PRIMARY_KIND,
        indeks_aparatu_glownego_szablonu,
    )

    for szablon in BAY_TEMPLATE_REGISTRY.values():
        rodzaje = [_TEMPLATE_DEVICE_KIND_TO_PRIMARY_KIND.get(d.kind) for d in szablon.devices]
        assert sum(r in ("CB", "LOAD_SWITCH") for r in rodzaje) <= 1, szablon.template_id
        indeks = indeks_aparatu_glownego_szablonu(szablon)
        laczniki = {"CB", "LOAD_SWITCH", "DS", "THREE_POSITION_SWITCH"}
        if any(r in laczniki for r in rodzaje):
            assert indeks is not None, szablon.template_id
            assert rodzaje[indeks] in laczniki


def test_pola_nn_nie_dostaja_aparatow_sn() -> None:
    enm = _wciecie("wylacznik", "B", ["IN", "OUT", "TR"])
    stacja = _stacja_sn(enm)["ref_id"]
    sn = {p["ref_id"] for p in _pola_sn_stacji(enm, stacja)}
    for pole in _pola_stacji(enm, stacja):
        if pole["ref_id"] in sn:
            continue
        rodzaje = {a["kind"] for a in pole.get("primary_devices") or []}
        assert not (rodzaje & {"CB", "LOAD_SWITCH", "CABLE_HEAD"}) or pole["bay_role"] == "OZE"


# ---------------------------------------------------------------------------
# Parytet liczb zwarć i rozpływu, determinizm
# ---------------------------------------------------------------------------


def _siec_parytetu() -> dict[str, Any]:
    """Magistrala z czterema stacjami — po jednej na konstrukcję — i odbiorem na końcu."""
    enm = _odcinki(_gpz(), [200, 300, 400, 500])
    for konstrukcja in sorted(KONSTRUKCJE):
        enm = wykonaj(
            enm,
            "insert_station_on_segment_sn",
            {
                "segment_ref": _kable(enm)[-1]["ref_id"],
                "field_apparatus_catalog_ref": KONSTRUKCJE[konstrukcja][0],
                "station_type": "B",
                "insert_at": {"value": 0.5},
                "station": {"sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4},
                "sn_fields": ["IN", "OUT", "TR"],
                "transformer": {"create": True, "transformer_catalog_ref": TRAFO},
            },
        )
    return wykonaj(
        enm,
        "add_load_sn",
        {"bus_ref": _kable(enm)[-1]["to_bus_ref"], "p_mw": 0.5, "q_mvar": 0.1, "load_name": "O"},
    )


def _bez_aparatow(enm: dict[str, Any]) -> dict[str, Any]:
    kopia = copy.deepcopy(enm)
    for pole in kopia["bays"]:
        pole["primary_devices"] = []
    return kopia


#: Identyfikatory i odciski wejścia (zależą od treści modelu, nie są liczbami wyniku).
_KLUCZE_POMIJANE = {
    "enm_hash",
    "input_hash",
    "run_id",
    "created_at",
    "finished_at",
    "trace_id",
    "proof_ref",
}


def _liczby(wynik: Any) -> Any:
    if isinstance(wynik, dict):
        return {k: _liczby(v) for k, v in wynik.items() if k not in _KLUCZE_POMIJANE}
    if isinstance(wynik, list):
        return [_liczby(v) for v in wynik]
    return wynik


def _bieg(enm: dict[str, Any], rodzaj: str) -> Any:
    reset_canonical_runs()
    reset_enm_store()
    set_enm("parytet", EnergyNetworkModel.model_validate(enm))
    wynik = execute_run(
        create_run(case_id="parytet", klucz_twin="parytet", analysis_type=rodzaj).id
    )
    assert wynik.status == "FINISHED", wynik.error_message
    return _liczby(wynik.raw_result)


@pytest.mark.parametrize("rodzaj", ["PF", "short_circuit_sn"])
def test_parytet_liczb_z_aparatami_toru_i_bez(rodzaj: str) -> None:
    enm = _siec_parytetu()
    assert sum(len(p.get("primary_devices") or []) for p in enm["bays"]) > 0
    z_aparatami = _bieg(enm, rodzaj)
    bez = _bieg(_bez_aparatow(enm), rodzaj)
    assert json.dumps(z_aparatami, sort_keys=True, default=str) == json.dumps(
        bez, sort_keys=True, default=str
    )


def test_determinizm_identyfikatorow() -> None:
    a = json.dumps(_siec_parytetu(), sort_keys=True)
    b = json.dumps(_siec_parytetu(), sort_keys=True)
    assert a == b
