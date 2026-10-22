"""W5-C: jedna prawda stanu normalnego łącznika — migracja, odcisk, rewizje, akcesory.

Przed kartą punkt normalnie otwarty żył w trzech kopiach obok łącznika
(``Corridor.no_point_ref``, ``LineRun.nop_station_ref``, ``BranchPointSN.switch_state``).
Pilnowane własności:

* MIGRACJA (``enm.stan_normalny``) — każda reguła z nagłówka modułu ma przypadek:
  przeniesione / usunięta kopia / UTRACONE (sprzeczne, bez łącznika, nie-łącznik) /
  puste bez wpisu; idempotencja; migawka wołającego nietknięta; ``status`` łącznika nie
  jest zmieniany (otwarcie operacją ruchową nie staje się punktem podziału);
* ODCISK — pola skasowane haszują jak ``null`` (zapis zastany z pustą kopią ma ten sam
  odcisk co zapis nowy); ``normal_state=None`` poza odciskiem; ``input_hash`` bez stanu
  łączeniowego, odcisk przełączeń z nim;
* REWIZJE I MAGAZYN — zapis zastany wczytany przez magazyn: model zmigrowany, nowa
  rewizja z nazwanym opisem w dzienniku, utrata w logu, migawka rewizji sprzed migracji
  czytelna (hash surowej treści), drugi odczyt bez migracji;
* AKCESORY — ``punkty_podzialu`` (jedyne źródło), ``punkty_podzialu_korytarza``,
  walidator I001 (trzy przyczyny) i I005 (pierścień bez punktu podziału).
"""

from __future__ import annotations

import copy
import json
import logging
from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation
from enm.dziennik_zmian import wpis_rewizji
from enm.hash import (
    compute_enm_hash,
    compute_input_hash,
    compute_switching_snapshot_hash,
    hash_migawki_enm,
)
from enm.models import EnergyNetworkModel
from enm.rewizje import wczytaj_rewizje
from enm.stan_normalny import migruj_punkty_podzialu_slownika
from enm.store import _case_path, checkout, get_enm, reset_enm_store
from enm.topology import build_topology_graph, punkty_podzialu, punkty_podzialu_korytarza
from enm.validator import ENMValidator

from tests.enm.siec_lacznikowa import (
    _gpz,
    _kable,
    _odcinki,
    galaz,
    pierscien_z_nop,
    promieniowa,
    wykonaj,
)

ZKSN = "ZKSN-2P-630A"


def _zastany_pierscien() -> tuple[dict[str, Any], str, str, str]:
    """Pierścień w POSTACI ZAPISU SPRZED KARTY: punkt podziału zapisany wyłącznie przy
    magistrali (``no_point_ref``), łączniki bez pozycji normalnej.

    Zwraca (migawka, korytarz, łącznik punktu podziału, drugi łącznik)."""
    siec = pierscien_z_nop()
    assert siec.poprzedni_nop is not None
    zastany = copy.deepcopy(siec.enm)
    for galaz_ in zastany["branches"]:
        galaz_.pop("normal_state", None)
    korytarz = zastany["corridors"][0]
    korytarz["no_point_ref"] = siec.poprzedni_nop
    return zastany, korytarz["ref_id"], siec.poprzedni_nop, siec.cel


def _wpis_nazwany(wpis: str, migawka: dict[str, Any], *fragmenty: str) -> None:
    """Wpis dziennika opisuje elementy NAZWĄ z migawki i nie niesie ŻADNEGO identyfikatora
    (dziennik zmian jest widoczny w historii modelu — reguła „nazwa bez identyfikatora")."""
    for fragment in fragmenty:
        assert fragment in wpis, (fragment, wpis)
    refy = {
        str(element["ref_id"])
        for kolekcja in migawka.values()
        if isinstance(kolekcja, list)
        for element in kolekcja
        if isinstance(element, dict) and element.get("ref_id")
    } | {
        str(ciag["id"])
        for ciag in migawka.get("line_runs") or []
        if isinstance(ciag, dict) and ciag.get("id")
    }
    assert not sorted(r for r in refy if r in wpis), wpis


def _magistrala(migawka: dict[str, Any]) -> str:
    return f"magistrala „{migawka['corridors'][0]['name']}”"


# ---------------------------------------------------------------------------
# Migracja — reguła po regule
# ---------------------------------------------------------------------------


def test_punkt_podzialu_magistrali_przechodzi_na_lacznik() -> None:
    zastany, _korytarz, nop, drugi = _zastany_pierscien()
    wejscie = copy.deepcopy(zastany)

    wynik, raport = migruj_punkty_podzialu_slownika(zastany)

    assert zastany == wejscie, "migracja zmieniła migawkę wołającego"
    assert all("no_point_ref" not in k for k in wynik["corridors"])
    assert galaz(wynik, nop)["normal_state"] == "open"
    assert galaz(wynik, nop)["status"] == "open"
    assert "normal_state" not in galaz(wynik, drugi)
    (wpis,) = raport.przeniesione
    _wpis_nazwany(wpis, zastany, _magistrala(zastany), f"łącznik „{galaz(zastany, nop)['name']}”")
    assert not raport.usuniete and not raport.utracone
    # Idempotencja: druga migracja zwraca TEN SAM obiekt i pusty raport.
    ponownie, raport_2 = migruj_punkty_podzialu_slownika(wynik)
    assert ponownie is wynik and not raport_2.zmieniono
    # Model wczytany z zapisu zastanego = model po migracji (walidator `before`).
    model = EnergyNetworkModel.model_validate(zastany)
    assert punkty_podzialu(model) == (nop,)


@pytest.mark.parametrize("operacja", ["refresh_snapshot", "set_normal_open_point"])
def test_operacja_domenowa_na_zapisie_zastanym_oddaje_migawke_zmigrowana(operacja: str) -> None:
    """Droga operacji domenowej (słownik → handler → odpowiedź) stosuje TĘ SAMĄ listę
    migracji co walidator modelu: odpowiedź nie niesie skasowanych kluczy (punkt podziału,
    uziemienie szyny), a handler widzi pozycję normalną przeniesioną z magistrali —
    ``set_normal_open_point`` na drugim łączniku zamyka punkt z zapisu zastanego."""
    zastany, _korytarz, nop, drugi = _zastany_pierscien()
    zastany["buses"][0]["grounding"] = {"type": "isolated"}
    ladunek = {"switch_ref": drugi} if operacja == "set_normal_open_point" else {}

    wynik = execute_domain_operation(zastany, operacja, ladunek)

    assert wynik.get("error") is None, wynik.get("error")
    migawka = wynik["snapshot"]
    assert all("no_point_ref" not in k for k in migawka["corridors"])
    assert all("grounding" not in b for b in migawka["buses"])
    if operacja == "refresh_snapshot":
        assert galaz(migawka, nop)["normal_state"] == "open"
        assert punkty_podzialu(EnergyNetworkModel.model_validate(migawka)) == (nop,)
    else:
        assert galaz(migawka, nop)["normal_state"] == "closed"
        assert galaz(migawka, nop)["status"] == "closed"
        assert galaz(migawka, drugi)["normal_state"] == "open"
        assert punkty_podzialu(EnergyNetworkModel.model_validate(migawka)) == (drugi,)


@pytest.mark.parametrize(
    ("pozycja", "oczekiwany_wpis"), [("open", "usuniete"), ("closed", "utracone")]
)
def test_lacznik_z_pozycja_normalna_wygrywa_z_kopia(pozycja: str, oczekiwany_wpis: str) -> None:
    zastany, _korytarz, nop, _drugi = _zastany_pierscien()
    galaz(zastany, nop)["normal_state"] = pozycja

    wynik, raport = migruj_punkty_podzialu_slownika(zastany)

    assert galaz(wynik, nop)["normal_state"] == pozycja
    (wpis,) = getattr(raport, oczekiwany_wpis)
    _wpis_nazwany(wpis, zastany, _magistrala(zastany), f"łącznik „{galaz(zastany, nop)['name']}”")
    assert not raport.przeniesione


@pytest.mark.parametrize("rodzaj", ["nieistniejacy", "kabel"])
def test_kopia_bez_lacznika_jest_utracona_z_nazwa(rodzaj: str) -> None:
    zastany, _korytarz, _nop, _drugi = _zastany_pierscien()
    wskazany = (
        "sw/nie-ma-takiego"
        if rodzaj == "nieistniejacy"
        else next(g["ref_id"] for g in zastany["branches"] if g.get("type") == "cable")
    )
    zastany["corridors"][0]["no_point_ref"] = wskazany

    wynik, raport = migruj_punkty_podzialu_slownika(zastany)

    assert punkty_podzialu(wynik) == ()
    (wpis,) = raport.utracone
    oczekiwany = (
        "wskazany łącznik punktu podziału nie istnieje w modelu"
        if rodzaj == "nieistniejacy"
        else f"kabel „{galaz(zastany, wskazany)['name']}”"
    )
    _wpis_nazwany(wpis, zastany, _magistrala(zastany), oczekiwany)
    assert wskazany not in wpis
    assert "UTRACONE" in raport.opis_pl()


def test_pusta_kopia_znika_bez_wpisu() -> None:
    zastany, _korytarz, _nop, _drugi = _zastany_pierscien()
    zastany["corridors"][0]["no_point_ref"] = None
    zastany["line_runs"] = [{"id": "ciag-1", "nop_station_ref": None}]

    wynik, raport = migruj_punkty_podzialu_slownika(zastany)

    assert "no_point_ref" not in wynik["corridors"][0]
    assert "nop_station_ref" not in wynik["line_runs"][0]
    assert not raport.zmieniono


@pytest.mark.parametrize(
    ("nazwa_ciagu", "stacja_w_modelu", "oczekiwany"),
    [
        (
            None,
            False,
            "ciąg liniowy bez nazwy: martwa kopia stacji punktu podziału (stacja spoza modelu)",
        ),
        (
            "Ciąg północny",
            True,
            "ciąg liniowy „Ciąg północny”: martwa kopia stacji punktu podziału "
            "(stacja „Stacja testowa”)",
        ),
    ],
)
def test_martwa_kopia_ciagu_jest_nazwana(
    nazwa_ciagu: str | None, stacja_w_modelu: bool, oczekiwany: str
) -> None:
    siec = promieniowa()
    zastany = copy.deepcopy(siec.enm)
    if stacja_w_modelu:
        zastany.setdefault("substations", []).append(
            {"ref_id": "stacja-x", "name": "Stacja testowa", "bus_refs": []}
        )
    ciag: dict[str, Any] = {"id": "ciag-1", "nop_station_ref": "stacja-x"}
    if nazwa_ciagu is not None:
        ciag["name"] = nazwa_ciagu
    zastany["line_runs"] = [ciag]

    wynik, raport = migruj_punkty_podzialu_slownika(zastany)

    assert wynik["line_runs"] == [{k: v for k, v in ciag.items() if k != "nop_station_ref"}]
    assert raport.usuniete == (oczekiwany,)
    _wpis_nazwany(raport.usuniete[0], zastany)


def test_otwarty_lacznik_bez_kopii_nie_staje_sie_punktem_podzialu() -> None:
    """Otwarcie łącznika operacją ruchową NIE jest deklaracją pozycji normalnej."""
    siec = promieniowa()
    otwarty = wykonaj(siec.enm, "open_switch", {"switch_ref": siec.cel})
    model = EnergyNetworkModel.model_validate(otwarty)
    assert punkty_podzialu(model) == ()
    lacznik = next(b for b in model.branches if b.ref_id == siec.cel)
    assert lacznik.status == "open" and lacznik.normal_state is None


def _siec_z_zksn(stan: str) -> tuple[dict[str, Any], str]:
    enm = _odcinki(_gpz(), [400])
    enm = wykonaj(
        enm,
        "insert_zksn_on_segment_sn",
        {
            "segment_id": _kable(enm)[0]["ref_id"],
            "catalog_ref": ZKSN,
            "branch_ports_count": 2,
            "switch_state": stan,
        },
    )
    (punkt,) = enm["branch_points"]
    return enm, str(punkt["ref_id"])


@pytest.mark.parametrize("stan", ["closed", "open"])
def test_zksn_zapisuje_stan_na_lacznikach_portow(stan: str) -> None:
    enm, punkt = _siec_z_zksn(stan)
    porty = [g for g in enm["branches"] if (g.get("meta") or {}).get("branch_point_ref") == punkt]
    assert porty, "punkt rozgałęzienia bez łączników portów"
    assert {(g["status"], g["normal_state"]) for g in porty} == {(stan, stan)}
    assert "switch_state" not in enm["branch_points"][0]


@pytest.mark.parametrize(
    ("kopia", "oczekiwany_wpis"), [("closed", "usuniete"), ("open", "utracone")]
)
def test_kopia_stanu_punktu_rozgalezienia(kopia: str, oczekiwany_wpis: str) -> None:
    enm, punkt = _siec_z_zksn("closed")
    zastany = copy.deepcopy(enm)
    zastany["branch_points"][0]["switch_state"] = kopia

    wynik, raport = migruj_punkty_podzialu_slownika(zastany)

    assert "switch_state" not in wynik["branch_points"][0]
    (wpis,) = getattr(raport, oczekiwany_wpis)
    nazwa_punktu = zastany["branch_points"][0]["name"]
    _wpis_nazwany(wpis, zastany, f"punkt rozgałęzienia „{nazwa_punktu}”")
    assert punkt not in wpis
    # Wartość NIE jest przenoszona na łączniki portów (byłaby domysłem).
    assert wynik["branches"] == zastany["branches"]


# ---------------------------------------------------------------------------
# Odcisk
# ---------------------------------------------------------------------------


def test_skasowane_kopie_haszuja_jak_null() -> None:
    siec = pierscien_z_nop()
    nowy = copy.deepcopy(siec.enm)
    zastany = copy.deepcopy(nowy)
    for korytarz in zastany["corridors"]:
        korytarz["no_point_ref"] = None
    zastany["line_runs"] = [dict(c, nop_station_ref=None) for c in nowy.get("line_runs", [])]
    enm_z_zksn, _punkt = _siec_z_zksn("closed")
    zastany_zksn = copy.deepcopy(enm_z_zksn)
    zastany_zksn["branch_points"][0]["switch_state"] = None

    assert hash_migawki_enm(zastany) == hash_migawki_enm(nowy)
    assert hash_migawki_enm(zastany_zksn) == hash_migawki_enm(enm_z_zksn)


def test_pozycja_normalna_niezadeklarowana_poza_odciskiem() -> None:
    siec = promieniowa()
    model = EnergyNetworkModel.model_validate(siec.enm)
    zrzut = model.model_dump(mode="json")
    bez_klucza = copy.deepcopy(zrzut)
    for galaz_ in bez_klucza["branches"]:
        assert galaz_.get("normal_state") is None
        galaz_.pop("normal_state", None)
    assert hash_migawki_enm(bez_klucza) == hash_migawki_enm(zrzut) == compute_enm_hash(model)


def test_pozycja_normalna_jest_stanem_laczeniowym_nie_danymi_wejscia() -> None:
    siec = promieniowa()
    przed = EnergyNetworkModel.model_validate(siec.enm)
    po = EnergyNetworkModel.model_validate(
        wykonaj(siec.enm, "set_normal_open_point", {"switch_ref": siec.cel})
    )
    assert compute_enm_hash(po) != compute_enm_hash(przed)
    assert compute_input_hash(po) == compute_input_hash(przed)
    assert compute_switching_snapshot_hash(po) != compute_switching_snapshot_hash(przed)
    # Sama pozycja normalna (bez zmiany położenia) też zmienia odcisk przełączeń.
    tylko_pozycja = copy.deepcopy(siec.enm)
    galaz(tylko_pozycja, siec.cel)["normal_state"] = "closed"
    model_pozycji = EnergyNetworkModel.model_validate(tylko_pozycja)
    assert compute_switching_snapshot_hash(model_pozycji) != compute_switching_snapshot_hash(przed)
    assert compute_input_hash(model_pozycji) == compute_input_hash(przed)


# ---------------------------------------------------------------------------
# Magazyn i rewizje
# ---------------------------------------------------------------------------


@pytest.fixture()
def _magazyn(monkeypatch: pytest.MonkeyPatch, tmp_path):
    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path / "enm_store"))
    reset_enm_store()
    yield
    reset_enm_store()


def _zapisz_zastany(klucz: str, snapshot: dict[str, Any], rewizja: int) -> None:
    snapshot = copy.deepcopy(snapshot)
    snapshot["header"]["revision"] = rewizja
    path = _case_path(klucz)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"klucz": klucz, "snapshot": snapshot, "revision": rewizja}),
        encoding="utf-8",
    )


def test_magazyn_migruje_zapis_zastany_i_nazywa_skutek(_magazyn: None) -> None:
    zastany, korytarz, nop, _drugi = _zastany_pierscien()
    _zapisz_zastany("w5-c-a", zastany, rewizja=3)

    enm = get_enm("w5-c-a")

    assert punkty_podzialu(enm) == (nop,)
    assert enm.header.revision == 4
    wpis = wpis_rewizji("w5-c-a", 4)
    assert wpis is not None and wpis.operacja is None
    assert wpis.opis_pl is not None and "Migracja punktów podziału" in wpis.opis_pl
    _wpis_nazwany(wpis.opis_pl, zastany, _magistrala(zastany))
    assert korytarz not in wpis.opis_pl
    assert "UTRACONE" not in wpis.opis_pl
    # Rewizja sprzed migracji pozostaje czytelna (hash surowej treści) i NIE ma kopii
    # po migracji — `checkout` daje model tej rewizji (zmigrowany przy wczytaniu).
    rewizja_3 = wczytaj_rewizje("w5-c-a", 3)
    assert punkty_podzialu(rewizja_3) == (nop,)
    assert punkty_podzialu(checkout("w5-c-a", 3)) == (nop,)
    # Drugi odczyt (nowy proces) — migracja nie biegnie drugi raz.
    reset_enm_store(remove_persisted=False)
    assert get_enm("w5-c-a").header.revision == 4
    assert wpis_rewizji("w5-c-a", 5) is None


def test_utrata_punktu_podzialu_trafia_do_dziennika_i_logu(
    _magazyn: None, caplog: pytest.LogCaptureFixture
) -> None:
    zastany, korytarz, _nop, _drugi = _zastany_pierscien()
    zastany["corridors"][0]["no_point_ref"] = "sw/nie-ma-takiego"
    _zapisz_zastany("w5-c-b", zastany, rewizja=2)

    with caplog.at_level(logging.WARNING, logger="enm.store"):
        enm = get_enm("w5-c-b")

    assert punkty_podzialu(enm) == ()
    wpis = wpis_rewizji("w5-c-b", enm.header.revision)
    assert wpis is not None and wpis.opis_pl is not None and "UTRACONE" in wpis.opis_pl
    utrata = f"{_magistrala(zastany)}: wskazany łącznik punktu podziału nie istnieje w modelu"
    _wpis_nazwany(wpis.opis_pl, zastany, utrata)
    assert korytarz not in wpis.opis_pl
    assert any(
        "migracja_zapisu_zastanego" in r.getMessage() and utrata in r.getMessage()
        for r in caplog.records
    )


# ---------------------------------------------------------------------------
# Akcesory i walidator
# ---------------------------------------------------------------------------


def test_punkty_podzialu_korytarza_i_widok_korytarzy() -> None:
    siec = pierscien_z_nop()
    model = EnergyNetworkModel.model_validate(siec.enm)
    (korytarz,) = model.corridors
    assert punkty_podzialu_korytarza(model, korytarz.ordered_segment_refs) == (siec.poprzedni_nop,)
    assert punkty_podzialu_korytarza(model, ["kabel-spoza-sieci"]) == ()
    widok = build_topology_graph(model)
    assert [c.has_no_point for c in widok.corridors] == [True]


def _kody(model: EnergyNetworkModel, kod: str) -> list[Any]:
    return [i for i in ENMValidator().validate(model).issues if i.code == kod]


def test_walidator_i005_czyta_pozycje_normalna() -> None:
    siec = pierscien_z_nop()
    assert _kody(EnergyNetworkModel.model_validate(siec.enm), "I005") == []
    bez_punktu = copy.deepcopy(siec.enm)
    galaz(bez_punktu, siec.poprzedni_nop)["normal_state"] = None
    galaz(bez_punktu, siec.poprzedni_nop)["status"] = "closed"
    model = EnergyNetworkModel.model_validate(bez_punktu)
    assert [k.corridor_type for k in model.corridors] == ["ring"]
    (problem,) = _kody(model, "I005")
    assert problem.element_refs == [model.corridors[0].ref_id]


@pytest.mark.parametrize(
    ("normal_state", "fraza"),
    [
        ("open", "jest punktem normalnie otwartym"),
        ("closed", "wbrew pozycji normalnej"),
        (None, "jest otwarty — odcina część sieci"),
    ],
)
def test_walidator_i001_nazywa_przyczyne_otwarcia(normal_state: str | None, fraza: str) -> None:
    siec = promieniowa()
    enm = copy.deepcopy(siec.enm)
    galaz(enm, siec.cel)["status"] = "open"
    galaz(enm, siec.cel)["normal_state"] = normal_state
    (komunikat,) = (i.message_pl for i in _kody(EnergyNetworkModel.model_validate(enm), "I001"))
    assert fraza in komunikat
