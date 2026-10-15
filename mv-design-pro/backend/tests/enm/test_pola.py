"""Akcesor pól rozdzielnicy `enm/pola.py` (karta W5-B) — jeden nośnik pól: rekordy `bays`.

PO CO. Od karty W5-B każdy czytelnik pól (walidator, zajętość, tor pola, read-model pola,
LoM, reguły referencyjne, kontrakty V12.6) pyta ten moduł, zamiast składać pola z trzech
słowników `meta` po swojemu. Testy przypinają odpowiedzi akcesorów jako ILOCZYN CECH, w
którym rozjazd mógłby się schować:

  {poziom pola: SN, nN, ZKSN} × {zacisk: własny, brak} × {postać modelu: słownik migawki,
  model Pydantic}

oraz deklaracje modułu, które bez testu byłyby fałszywą pewnością: zamknięta lista
`KLUCZE_META_ZAKAZANE`, lustro `_wszystkie_ref_id` = `topology_ops._all_refs_set` ∪
`branch_points`, jedyny pisarz (`dodaj_pole`/`zmien_pole`/`usun_pole`) odmawiający kształtu
spoza kontraktu.
"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from enm import pola as akcesor
from enm.migrations import klucze_meta_pola
from enm.models import Bay, EnergyNetworkModel
from enm.topology_ops import _all_refs_set

POZIOMY = ("SN", "nN", "ZKSN")
ZACISKI = ("z_zaciskiem", "bez_zacisku")
POSTACIE = ("slownik", "model")


def _rekord(poziom: str, zacisk: str) -> dict[str, Any]:
    ref = f"pole/{poziom}/{zacisk}"
    wlasciciel: dict[str, Any] = (
        {"branch_point_ref": "bp-1", "branch_point_port_id": "MAIN_IN"}
        if poziom == "ZKSN"
        else {"substation_ref": "st-1"}
    )
    szyna = {"SN": "sn", "nN": "nn", "ZKSN": "bp-szyna"}[poziom]
    return akcesor.zbuduj_pole(
        ref_id=ref,
        bay_role="IN",
        field_role="LINIA_IN" if poziom != "nN" else None,
        bus_ref=szyna,
        poziom_nn=poziom == "nN",
        terminal_bus_ref=f"{ref}/zacisk" if zacisk == "z_zaciskiem" else None,
        equipment_refs=[f"{ref}/aparat"],
        **wlasciciel,
    )


def _migawka() -> dict[str, Any]:
    return {
        "header": {"name": "akcesor pól"},
        "buses": [
            {"ref_id": "sn", "name": "SN", "voltage_kv": 15.0},
            {"ref_id": "nn", "name": "nN", "voltage_kv": 0.4},
            {"ref_id": "bp-szyna", "name": "ZKSN", "voltage_kv": 15.0},
        ],
        "substations": [
            {"ref_id": "st-1", "name": "Stacja", "station_type": "mv_lv", "bus_refs": ["sn", "nn"]}
        ],
        "bays": [_rekord(p, z) for p in POZIOMY for z in ZACISKI],
    }


def _postac(postac: str) -> Any:
    dane = _migawka()
    return dane if postac == "slownik" else EnergyNetworkModel.model_validate(dane)


def _atr(rekord: Any, klucz: str) -> Any:
    return rekord.get(klucz) if isinstance(rekord, dict) else getattr(rekord, klucz)


def _refy(rekordy: list[Any]) -> list[str]:
    return [_atr(r, "ref_id") for r in rekordy]


@pytest.mark.parametrize("postac", POSTACIE)
@pytest.mark.parametrize("zacisk", ZACISKI)
@pytest.mark.parametrize("poziom", POZIOMY)
def test_akcesory_iloczyn_poziom_zacisk_postac(poziom: str, zacisk: str, postac: str) -> None:
    enm = _postac(postac)
    ref = f"pole/{poziom}/{zacisk}"
    rekord = akcesor.pole(enm, ref)
    assert rekord is not None and akcesor.pole_istnieje(enm, ref)
    # Zbiory: pole należy dokładnie do zbiorów swojego poziomu i właściciela.
    stacji = _refy(akcesor.pola_stacji(enm, "st-1"))
    assert (ref in stacji) is (poziom != "ZKSN")
    assert (ref in _refy(akcesor.pola_sn_stacji(enm, "st-1"))) is (poziom == "SN")
    assert (ref in _refy(akcesor.pola_nn_stacji(enm, "st-1"))) is (poziom == "nN")
    assert (ref in _refy(akcesor.pola_nn(enm))) is (poziom == "nN")
    assert (ref in _refy(akcesor.pola_zksn(enm, "bp-1"))) is (poziom == "ZKSN")
    assert (ref in _refy(akcesor.pola_wszystkich_stacji(enm))) is (poziom != "ZKSN")
    assert akcesor.czy_pole_nn(enm, rekord) is (poziom == "nN")
    stacja = akcesor.stacja_pola(enm, ref)
    assert (_atr(stacja, "ref_id") if stacja is not None else None) == (
        None if poziom == "ZKSN" else "st-1"
    )
    # Zacisk: jedyny nośnik `terminal_bus_ref`; punkt przyłączenia = zacisk albo szyna pola.
    oczekiwany_zacisk = f"{ref}/zacisk" if zacisk == "z_zaciskiem" else None
    assert akcesor.zacisk_pola(rekord) == oczekiwany_zacisk
    assert akcesor.punkt_przylaczenia_pola(rekord) == (oczekiwany_zacisk or _atr(rekord, "bus_ref"))
    assert akcesor.pole_aparatu(enm, f"{ref}/aparat") is not None
    assert _atr(akcesor.pole_aparatu(enm, f"{ref}/aparat"), "ref_id") == ref
    # Grupowanie po szynie: tylko pola stacji (ZKSN obsługuje punkt rozgałęzienia).
    wg_szyny = {s: _refy(lista) for s, lista in akcesor.pola_wg_szyny(enm).items()}
    assert (ref in wg_szyny.get(_atr(rekord, "bus_ref"), [])) is (poziom != "ZKSN")
    assert akcesor.rola_kanoniczna_pola(rekord) == "LINIA_IN"


@pytest.mark.parametrize("postac", POSTACIE)
def test_odczyty_brzegowe_bez_pola(postac: str) -> None:
    enm = _postac(postac)
    for pusty in (None, "", "   ", "pole-nieistniejace", 7):
        assert akcesor.pole(enm, pusty) is None
        assert akcesor.stacja_pola(enm, pusty) is None
        assert akcesor.pole_aparatu(enm, pusty) is None
    assert akcesor.pola_stacji(enm, None) == []
    assert akcesor.pola_zksn(enm, "  ") == []
    assert akcesor.zacisk_pola(None) is None


def test_poziom_pola_z_napiecia_szyny_granica_pasma() -> None:
    """Poziom pola rozstrzyga pasmo szyny `bus_ref` (0 < Uₙ ≤ 1 kV = nN); szyna nieznana
    albo bez napięcia = NIE nN (brak danych nie jest domysłem poziomu)."""
    for napiecie, nn in ((0.4, True), (1.0, True), (1.001, False), (15.0, False), (None, False)):
        enm = {"buses": [{"ref_id": "b", "voltage_kv": napiecie}], "bays": []}
        assert akcesor.czy_pole_nn(enm, {"bus_ref": "b"}) is nn, napiecie
    assert akcesor.czy_pole_nn({"buses": []}, {"bus_ref": "szyna-widmo"}) is False
    assert akcesor.czy_pole_nn({"buses": []}, {}) is False


def test_pola_wg_szyny_kolejnosc_rol_i_identyfikatorow() -> None:
    """Kolejność wyboru pola startu ciągu: OUT < FEEDER < IN < pozostałe, potem `ref_id`."""
    enm: dict[str, Any] = {"buses": [{"ref_id": "sn", "voltage_kv": 15.0}], "bays": []}
    for ref, rola in (("d", "TR"), ("c", "IN"), ("b2", "FEEDER"), ("b1", "FEEDER"), ("a", "OUT")):
        akcesor.dodaj_pole(
            enm,
            akcesor.zbuduj_pole(ref_id=ref, bay_role=rola, bus_ref="sn", substation_ref="st"),
        )
    assert _refy(akcesor.pola_wg_szyny(enm)["sn"]) == ["a", "b1", "b2", "c", "d"]


def test_klucze_meta_zakazane_z_jednego_zrodla_z_migracja() -> None:
    """Predykaty parami: pisarz odmawia DOKŁADNIE tych kluczy `meta`, które migracja przy
    wczytaniu przenosi na pola typowane albo kasuje jako martwe — jeden obiekt z jednego
    modułu, nie dwie listy, które „dziś się zgadzają". Dosłowną listę (dawne nazwy kluczy)
    przypina test migracji `tests/enm/migrations/test_field_specs_promocja.py`."""
    assert akcesor.KLUCZE_META_ZAKAZANE is klucze_meta_pola.KLUCZE_META_ZAKAZANE
    assert akcesor.KLUCZE_META_ZAKAZANE == (
        frozenset(klucze_meta_pola.KLUCZE_META_NA_POLE) | klucze_meta_pola.KLUCZE_META_MARTWE
    )
    # Każdy klucz przenoszony trafia na ISTNIEJĄCE pole typowane rekordu `Bay`.
    assert set(klucze_meta_pola.KLUCZE_META_NA_POLE.values()) <= set(Bay.model_fields)


@pytest.mark.parametrize("klucz", sorted(akcesor.KLUCZE_META_ZAKAZANE))
def test_pisarz_odmawia_klucza_meta_z_typowanym_odpowiednikiem(klucz: str) -> None:
    with pytest.raises(akcesor.BladPola, match=klucz):
        akcesor.zbuduj_pole(
            ref_id="p", bay_role="IN", bus_ref="sn", substation_ref="st", meta={klucz: "x"}
        )


def test_pisarz_odmawia_klucza_spoza_kontraktu_i_dubla() -> None:
    rekord = akcesor.zbuduj_pole(ref_id="p", bay_role="IN", bus_ref="sn", substation_ref="st")
    with pytest.raises(akcesor.BladPola, match="klucze spoza kontraktu Bay: nieznany"):
        akcesor.waliduj_rekord_pola({**rekord, "nieznany": 1})
    enm: dict[str, Any] = {"buses": [{"ref_id": "p"}], "bays": []}
    with pytest.raises(akcesor.BladPola, match="już zajęty"):
        akcesor.dodaj_pole(enm, rekord)
    with pytest.raises(akcesor.BladPola):
        akcesor.zbuduj_pole(ref_id="p", bay_role="NIEZNANA", bus_ref="sn", substation_ref="st")
    with pytest.raises(akcesor.BladPola):  # właściciel: dokładnie jedno z dwóch
        akcesor.zbuduj_pole(
            ref_id="p", bay_role="IN", bus_ref="sn", substation_ref="st", branch_point_ref="bp"
        )


def test_zmien_i_usun_pole() -> None:
    enm: dict[str, Any] = {"bays": []}
    akcesor.dodaj_pole(
        enm, akcesor.zbuduj_pole(ref_id="p", bay_role="IN", bus_ref="sn", substation_ref="st")
    )
    zmienione = akcesor.zmien_pole(enm, "p", terminal_bus_ref="zacisk")
    assert enm["bays"][0] == zmienione and zmienione["terminal_bus_ref"] == "zacisk"
    with pytest.raises(akcesor.BladPola):
        akcesor.zmien_pole(enm, "p", nieznane=1)
    with pytest.raises(akcesor.BladPola):
        akcesor.zmien_pole(enm, "brak", name="x")
    assert akcesor.usun_pole(enm, "p")["ref_id"] == "p"
    assert enm["bays"] == []
    with pytest.raises(akcesor.BladPola):
        akcesor.usun_pole(enm, "p")


def test_builder_kopiuje_gleboko_i_nadaje_nazwe_z_kanonu() -> None:
    meta = {"feeder_role": "ZRODLO_NN_PV", "zagniezdzone": {"a": 1}}
    rekord = akcesor.zbuduj_pole(
        ref_id="p", bay_role="FEEDER", bus_ref="nn", substation_ref="st", poziom_nn=True, meta=meta
    )
    meta["zagniezdzone"]["a"] = 2
    assert rekord["meta"]["zagniezdzone"] == {"a": 1}
    assert rekord["name"] == "Pole źródła nN"
    assert (
        akcesor.zbuduj_pole(
            ref_id="q", bay_role="IN", bus_ref="nn", substation_ref="st", poziom_nn=True
        )["name"]
        == "Wyłącznik główny nN"
    )
    sn = akcesor.zbuduj_pole(
        ref_id="r", bay_role="OUT", field_role="LINIA_ODG", bus_ref="sn", substation_ref="st"
    )
    assert sn["field_role"] == "LINIA_ODG"
    assert sn["name"] and sn["name"] != "r"
    # Nazwa projektanta wygrywa; nazwa z samych spacji to brak nazwy.
    assert (
        akcesor.zbuduj_pole(
            ref_id="s", bay_role="IN", bus_ref="sn", substation_ref="st", name="  Pole A  "
        )["name"].strip()
        == "Pole A"
    )
    assert (
        akcesor.zbuduj_pole(
            ref_id="t", bay_role="IN", bus_ref="sn", substation_ref="st", name="   "
        )["name"]
        != "   "
    )


def test_pola_zksn_z_portow_deterministyczne() -> None:
    raz = akcesor.pola_zksn_z_portow(branch_point_ref="bp", bus_ref="b", branch_ports_count=2)
    dwa = akcesor.pola_zksn_z_portow(branch_point_ref="bp", bus_ref="b", branch_ports_count=2)
    # Determinizm tożsamości i treści (pole `id` — UUID instancji — poza porównaniem, jak w
    # odcisku modelu `enm.hash`).
    assert [{k: v for k, v in r.items() if k != "id"} for r in raz] == [
        {k: v for k, v in r.items() if k != "id"} for r in dwa
    ]
    assert [(r["ref_id"], r["name"], r["field_role"], r["branch_point_port_id"]) for r in raz] == [
        ("bp/pole/MAIN_IN", "WE", "LINIA_IN", "MAIN_IN"),
        ("bp/pole/MAIN_OUT", "WY", "LINIA_OUT", "MAIN_OUT"),
        ("bp/pole/BRANCH_1", "ODG 1", "LINIA_ODG", "BRANCH_1"),
        ("bp/pole/BRANCH_2", "ODG 2", "LINIA_ODG", "BRANCH_2"),
    ]
    jeden = akcesor.pola_zksn_z_portow(branch_point_ref="bp", bus_ref="b", branch_ports_count=1)
    assert jeden[-1]["branch_point_port_id"] == "BRANCH"
    assert all(r["branch_point_ref"] == "bp" and r["substation_ref"] is None for r in raz)


def test_wszystkie_ref_id_lustro_topology_ops_z_punktami_rozgalezienia() -> None:
    """`enm.pola` jest liściem (nie importuje operacji) — lista kolekcji identyfikatorów jest
    LUSTREM `topology_ops._all_refs_set` powiększonym o `branch_points`. Parytet przypięty na
    migawce, która ma element w KAŻDEJ kolekcji modelu z `ref_id`."""
    kolekcje = [
        nazwa
        for nazwa, pole in EnergyNetworkModel.model_fields.items()
        if "list" in str(pole.annotation)
    ]
    migawka: dict[str, Any] = {k: [{"ref_id": f"{k}/1"}] for k in kolekcje}
    oczekiwane = _all_refs_set(copy.deepcopy(migawka)) | {"branch_points/1"}
    assert akcesor._wszystkie_ref_id(migawka) == oczekiwane
    # Kolekcja modelu z identyfikatorem, której żadna z dwóch list nie zna, byłaby dziurą
    # w unikalności identyfikatora pola — każda znana kolekcja listowa jest nazwana tu jawnie.
    poza = sorted(
        k for k in kolekcje if f"{k}/1" not in oczekiwane and k not in {"katalog_projektu"}
    )
    assert poza == sorted(set(poza)), poza


def test_relacja_wytworcy_z_polem_z_jednego_klucza() -> None:
    """Karta W5-B: pole wytwórcy to `Generator.meta.field_ref` (`enm.pola.ref_pola_wytworcy`)
    — dla słownika migawki i modelu; klucz `bay_ref` (nieistniejące pole modelu) nie jest
    relacją."""
    from enm.models import Generator
    from enm.pola import ref_pola_wytworcy

    assert ref_pola_wytworcy({"meta": {"field_ref": "pole-1"}}) == "pole-1"
    assert ref_pola_wytworcy({"meta": {"bay_ref": "pole-1"}}) is None
    assert ref_pola_wytworcy({"meta": {"field_ref": "  "}}) is None
    assert ref_pola_wytworcy({}) is None
    gen = Generator(ref_id="g", name="G", bus_ref="b", p_mw=1.0, meta={"field_ref": "pole-2"})
    assert ref_pola_wytworcy(gen) == "pole-2"
