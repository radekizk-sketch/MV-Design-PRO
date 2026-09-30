"""Karty widmowe w katalogu — brama rekordu, kody odmowy, karty statyczne, repozytorium.

Karta AB-H0 §0.7: karta widmowa jest OSOBNYM rekordem (przestrzeń ``KARTA_WIDMOWA``),
jej jedynym kontraktem jest ``dziedziny.karta_widmowa.KartaWidmowa``, a brama katalogowa
``network_model.catalog.karty_widmowe`` zamienia naruszenie kontraktu na odmowę z kodem
``KAT-T``. Testy przypinają:

* PARYTET reguł: każda reguła kontraktu OSIĄGALNA z rekordu karty (graf typów pól
  ``KartaWidmowa`` + funkcje, które ich walidatory wołają — wyliczany, nie spisany) ma
  kod ``KAT-T``; reguły nieosiągalne są nazwane z powodem; mapa i tabela odmów spójne;
* kod odmowy z POŁOŻENIA błędu typów (brak pola, zły literał, liczba spoza dziedziny);
* karty statyczne: WYŁĄCZNIE z wyciągiem dokumentu przypiętym SHA-256 (``KAT-T-041``),
  stan dzisiejszy katalogu: zero kart;
* repozytorium: odczyt, filtr po typie, sortowanie, kolizja identyfikatorów, materializacja
  wiązania ``KARTA_WIDMOWA``.
"""

from __future__ import annotations

import ast
import hashlib
import inspect
import json
import sys
import textwrap
import types
import typing
from pathlib import Path
from typing import Any

import pytest
from dziedziny.kanon import REGULY_KONTRAKTU
from dziedziny.karta_widmowa import KartaWidmowa
from network_model.catalog import karty_widmowe as modul_kart
from network_model.catalog.karty_widmowe import (
    KATALOG_KART,
    KOD_BRAKU_DOKUMENTU,
    KODY_REGUL_KARTY,
    karta_widmowa_z_rekordu,
    wczytaj_karty_statyczne,
)
from network_model.catalog.materialization import materialize_catalog_binding
from network_model.catalog.niezmienniki_katalogu import KODY_TWARDE, OdmowaKatalogu
from network_model.catalog.repository import CatalogRepository, get_default_mv_catalog
from network_model.catalog.types import CatalogBinding, CatalogNamespace
from pydantic import BaseModel

from tests.dziedziny import fabryki as f

#: Reguły kontraktu NIEOSIĄGALNE z rekordu karty — z powodem (weryfikowane wyliczeniem).
NIEOSIAGALNE_Z_KARTY: dict[str, str] = {
    "sekcje.wejscie": "wejście funkcji statusu sekcji — budowane przez adapter, nie z rekordu",
    "karta.materializacja": "materializacja kart w elemencie (ENM), nie rekord karty",
    "pasmo.definicja": "definicja pasma widma — osobny rekord (PasmoWidma)",
    "jakosc.wpis": "rejestr wymagań jakości energii — osobny rekord",
    "jakosc.parametr_metody": "parametr metody oceny jakości energii — osobny rekord",
}


def _modele_osiagalne(korzen: type[BaseModel]) -> set[type[BaseModel]]:
    """Wszystkie modele pydantic pakietu ``dziedziny`` osiągalne z typów pól ``korzen``."""
    widziane: set[type[BaseModel]] = set()
    kolejka: list[Any] = [korzen]
    while kolejka:
        typ = kolejka.pop()
        if isinstance(typ, type) and issubclass(typ, BaseModel):
            if typ in widziane or not typ.__module__.startswith("dziedziny"):
                continue
            widziane.add(typ)
            for pole in typ.model_fields.values():
                kolejka.append(pole.annotation)
            continue
        kolejka.extend(typing.get_args(typ))
    return widziane


def _reguly_w_zrodle(obiekt: Any, odwiedzone: set[Any]) -> set[str]:
    """Identyfikatory reguł z ``naruszenie("…")`` w źródle obiektu i w funkcjach modułu
    ``dziedziny``, które to źródło woła (domknięcie po nazwach)."""
    if obiekt in odwiedzone:
        return set()
    odwiedzone.add(obiekt)
    drzewo = ast.parse(textwrap.dedent(inspect.getsource(obiekt)))
    modul = sys.modules[obiekt.__module__]
    reguly: set[str] = set()
    for wezel in ast.walk(drzewo):
        if (
            isinstance(wezel, ast.Call)
            and getattr(wezel.func, "id", "") == "naruszenie"
            and isinstance(wezel.args[0], ast.Constant)
        ):
            reguly.add(str(wezel.args[0].value))
        if isinstance(wezel, ast.Name):
            cel = getattr(modul, wezel.id, None)
            if isinstance(cel, types.FunctionType) and cel.__module__.startswith("dziedziny"):
                reguly |= _reguly_w_zrodle(cel, odwiedzone)
    return reguly


def _reguly_osiagalne_z_karty() -> set[str]:
    odwiedzone: set[Any] = set()
    reguly: set[str] = set()
    for klasa in _modele_osiagalne(KartaWidmowa):
        reguly |= _reguly_w_zrodle(klasa, odwiedzone)
    return reguly


# ---------------------------------------------------------------------------
# Parytet reguł i kodów
# ---------------------------------------------------------------------------


def test_kazda_regula_osiagalna_z_karty_ma_kod_katalogu() -> None:
    osiagalne = _reguly_osiagalne_z_karty()
    assert osiagalne == set(KODY_REGUL_KARTY), {
        "osiagalne_bez_kodu": sorted(osiagalne - set(KODY_REGUL_KARTY)),
        "kod_dla_nieosiagalnej": sorted(set(KODY_REGUL_KARTY) - osiagalne),
    }
    assert set(NIEOSIAGALNE_Z_KARTY) == set(REGULY_KONTRAKTU) - osiagalne
    assert not set(NIEOSIAGALNE_Z_KARTY) & osiagalne


def test_kody_mapy_i_tabeli_odmow_sa_twardymi_regulami_rejestru() -> None:
    odmowy = set(modul_kart._ODMOWY)
    assert set(KODY_REGUL_KARTY.values()) <= odmowy
    assert odmowy <= set(KODY_TWARDE)
    # Każda odmowa tabeli ma drogę: kod reguły kontraktu albo kod położenia/dokumentu.
    kody_polozenia = {
        modul_kart._KOD_STATUSU_WERYFIKACJI,
        modul_kart._KOD_STATUSU_KATALOGU,
        modul_kart._KOD_KSZTALTU,
        KOD_BRAKU_DOKUMENTU,
    }
    assert odmowy == set(KODY_REGUL_KARTY.values()) | kody_polozenia


def test_kazda_odmowa_tabeli_niesie_swoj_kod() -> None:
    for kod, odmowa in modul_kart._ODMOWY.items():
        with pytest.raises(OdmowaKatalogu) as wyjatek:
            odmowa("komunikat")
        assert wyjatek.value.kod == kod


# ---------------------------------------------------------------------------
# Kod odmowy z położenia błędu typów
# ---------------------------------------------------------------------------


def _rekord(**karta: Any) -> dict[str, Any]:
    rekord = f.karta().to_dict()
    rekord.update(karta)
    return rekord


def _z_modelem(**model: Any) -> dict[str, Any]:
    rekord = f.karta().to_dict()
    rekord["modele"][0].update(model)
    return rekord


def _skladowa_z(**pola: Any) -> dict[str, Any]:
    skladowa = f.skladowa(250.0).model_dump(mode="json")
    skladowa.update(pola)
    return skladowa


PRZYPADKI_POLOZENIA: dict[str, tuple[dict[str, Any], str]] = {
    "status weryfikacji spoza słownika": (
        _rekord(verification_status="ZWERYFIKOWANY_CZESCIOWO"),
        "KAT-T-001",
    ),
    "status katalogu spoza słownika": (_rekord(catalog_status="PRODUKCYJNY"), "KAT-T-002"),
    "pole spoza kontraktu": (_rekord(harmonic_spectrum_percent={"5": 3.0}), "KAT-T-009"),
    "brak pola wymaganego": (
        {k: v for k, v in _rekord().items() if k != "urzadzenie_ref"},
        "KAT-T-009",
    ),
    "rodzaj modelu spoza słownika": (_z_modelem(rodzaj="WIDMO_TYPOWE"), "KAT-T-009"),
    "częstotliwość nieliczbowa": (
        _z_modelem(skladowe=[_skladowa_z(f_hz="piąta")]),
        "KAT-T-015",
    ),
    "częstotliwość zerowa": (_z_modelem(skladowe=[_skladowa_z(f_hz=0.0)]), "KAT-T-015"),
    "f1 nieskończona": (_z_modelem(f1_hz="inf"), "KAT-T-015"),
    "amplituda bez jednostki": (
        _z_modelem(skladowe=[_skladowa_z(amplituda={"wartosc": 3.0})]),
        "KAT-T-016",
    ),
    "rodzaj podstawy spoza słownika": (
        _z_modelem(podstawa={**f.podstawa().model_dump(mode="json"), "rodzaj": "LITERATURA"}),
        "KAT-T-036",
    ),
    "podstawa karty spoza słownika": (
        _rekord(podstawa={**f.podstawa().model_dump(mode="json"), "rodzaj": "LITERATURA"}),
        "KAT-T-036",
    ),
    "pomiar z polem spoza kontraktu": (
        _z_modelem(
            rodzaj="MEASURED_SPECTRUM",
            pomiar={**f.pomiar_kompletny().model_dump(mode="json"), "dokladnosc": "wysoka"},
        ),
        "KAT-T-038",
    ),
    "punkt pracy z bazą spoza słownika": (
        _z_modelem(
            punkt_pracy={**f.punkt_pracy().model_dump(mode="json"), "baza_mocy": "P_INSTALOWANA"}
        ),
        "KAT-T-040",
    ),
}


@pytest.mark.parametrize("nazwa", sorted(PRZYPADKI_POLOZENIA))
def test_kod_odmowy_z_polozenia_bledu(nazwa: str) -> None:
    rekord, kod = PRZYPADKI_POLOZENIA[nazwa]
    with pytest.raises(OdmowaKatalogu) as wyjatek:
        karta_widmowa_z_rekordu(rekord)
    assert wyjatek.value.kod == kod, str(wyjatek.value)
    assert "Karta widmowa 'karta-1' odrzucona" in str(wyjatek.value)


def test_rekord_poprawny_daje_karte_rowna_kontraktowi() -> None:
    karta = f.karta(dowody=(f.dowod("RAPORT_BADAN", ("HARMONIC_FREQUENCY_DOMAIN",)),))
    assert karta_widmowa_z_rekordu(karta.to_dict()) == karta


# ---------------------------------------------------------------------------
# Karty statyczne — wyłącznie z dokumentem
# ---------------------------------------------------------------------------


def _zapisz(katalog: Path, nazwa: str, tresc: Any) -> None:
    (katalog / nazwa).write_text(json.dumps(tresc, ensure_ascii=False), encoding="utf-8")


def _wyciag(katalog: Path, nazwa: str = "raport.txt") -> dict[str, str]:
    sciezka = katalog / nazwa
    sciezka.write_text(f"wyciąg dokumentu {nazwa}", encoding="utf-8")
    return {"plik": nazwa, "sha256": hashlib.sha256(sciezka.read_bytes()).hexdigest()}


def test_pusty_katalog_kart_daje_pusta_liste(tmp_path: Path) -> None:
    assert wczytaj_karty_statyczne(tmp_path) == []


@pytest.mark.parametrize(
    "wyciag",
    [
        None,
        {"plik": "raport.txt"},
        {"sha256": "0" * 64},
        {"plik": "brak.txt", "sha256": "0" * 64},
        "raport.txt",
    ],
    ids=["brak", "bez_skrotu", "bez_pliku", "plik_nie_istnieje", "zly_ksztalt"],
)
def test_karta_statyczna_bez_dokumentu_jest_odrzucona(tmp_path: Path, wyciag: Any) -> None:
    tresc: dict[str, Any] = {"karta": _rekord()}
    if wyciag is not None:
        tresc["wyciag_dokumentu"] = wyciag
    _zapisz(tmp_path, "karta-1.json", tresc)
    with pytest.raises(OdmowaKatalogu) as wyjatek:
        wczytaj_karty_statyczne(tmp_path)
    assert wyjatek.value.kod == KOD_BRAKU_DOKUMENTU


def test_karta_statyczna_ze_skrotem_niezgodnym_jest_odrzucona(tmp_path: Path) -> None:
    wyciag = _wyciag(tmp_path)
    (tmp_path / "raport.txt").write_text("dokument podmieniony", encoding="utf-8")
    _zapisz(tmp_path, "karta-1.json", {"karta": _rekord(), "wyciag_dokumentu": wyciag})
    with pytest.raises(OdmowaKatalogu, match="różni się od przypiętego") as wyjatek:
        wczytaj_karty_statyczne(tmp_path)
    assert wyjatek.value.kod == KOD_BRAKU_DOKUMENTU


def test_plik_bez_obiektu_karty_jest_odrzucony(tmp_path: Path) -> None:
    _zapisz(tmp_path, "karta-1.json", {"wyciag_dokumentu": _wyciag(tmp_path)})
    with pytest.raises(OdmowaKatalogu) as wyjatek:
        wczytaj_karty_statyczne(tmp_path)
    assert wyjatek.value.kod == "KAT-T-009"


def test_karty_statyczne_z_dokumentem_w_kolejnosci_plikow(tmp_path: Path) -> None:
    wyciag = _wyciag(tmp_path)
    _zapisz(tmp_path, "b.json", {"karta": _rekord(id="karta-b"), "wyciag_dokumentu": wyciag})
    _zapisz(tmp_path, "a.json", {"karta": _rekord(id="karta-a"), "wyciag_dokumentu": wyciag})
    rekordy = wczytaj_karty_statyczne(tmp_path)
    assert [r["id"] for r in rekordy] == ["karta-a", "karta-b"]
    repo = _repo(karty_widmowe=rekordy)
    assert sorted(repo.karty_widmowe) == ["karta-a", "karta-b"]


def test_stan_dzisiejszy_katalogu_statycznego_zero_kart() -> None:
    """Pomiar 2026-09-23: w repozytorium nie ma raportu badań widma żadnego typu — katalog
    statyczny kart jest pusty (zero widm „typowych”). Dodanie karty z dokumentem zmienia
    ten test ŚWIADOMIE razem z tabelą SPEC_KATALOGI."""
    assert sorted(p.name for p in KATALOG_KART.glob("*.json")) == []
    assert wczytaj_karty_statyczne() == []
    assert get_default_mv_catalog().karty_widmowe == {}


# ---------------------------------------------------------------------------
# Repozytorium i materializacja wiązania
# ---------------------------------------------------------------------------


def _repo(**rekordy: Any) -> CatalogRepository:
    """Repozytorium z samymi kartami (przestrzenie wymagane — puste)."""
    return CatalogRepository.from_records(
        line_types=[], cable_types=[], transformer_types=[], **rekordy
    )


def _repo_z_kartami() -> CatalogRepository:
    return _repo(
        karty_widmowe=[
            _rekord(id="k-2", urzadzenie_ref="conv-a"),
            _rekord(id="k-1", urzadzenie_ref="conv-b"),
            _rekord(id="k-3", urzadzenie_ref="conv-a"),
        ]
    )


def test_repozytorium_odczyt_filtr_i_sortowanie() -> None:
    repo = _repo_z_kartami()
    assert [k.id for k in repo.list_karty_widmowe()] == ["k-2", "k-3", "k-1"]
    assert [k.id for k in repo.list_karty_widmowe(urzadzenie_ref="conv-a")] == ["k-2", "k-3"]
    assert repo.list_karty_widmowe(urzadzenie_ref="conv-brak") == []
    karta = repo.get_karta_widmowa("k-1")
    assert karta is not None and karta.urzadzenie_ref == "conv-b"
    assert repo.get_karta_widmowa("k-brak") is None


def test_repozytorium_odrzuca_kolizje_i_karte_niepoprawna() -> None:
    with pytest.raises(ValueError, match="catalog.duplicate_id"):
        _repo(karty_widmowe=[_rekord(id="k"), _rekord(id="k")])
    with pytest.raises(OdmowaKatalogu) as wyjatek:
        _repo(karty_widmowe=[_z_modelem(skladowe=[])])
    assert wyjatek.value.kod == "KAT-T-014"


def test_materializacja_wiazania_karty_niesie_modele_bez_referencji_w_parametrach() -> None:
    repo = _repo_z_kartami()
    wynik = materialize_catalog_binding(
        CatalogBinding(
            catalog_namespace=CatalogNamespace.KARTA_WIDMOWA.value,
            catalog_item_id="k-1",
            catalog_item_version="1",
        ),
        repo,
    )
    assert wynik.success, wynik.error_message_pl
    karta = repo.get_karta_widmowa("k-1")
    assert karta is not None
    assert wynik.solver_fields == {
        "id": "k-1",
        "wersja": "1",
        "urzadzenie_ref": "conv-b",
        "modele": karta.to_dict()["modele"],
    }
    assert [pole["field"] for pole in wynik.ui_fields] == [
        "producent",
        "model_urzadzenia",
        "wersja",
        "urzadzenie_ref",
    ]
    nieznana = materialize_catalog_binding(
        CatalogBinding(
            catalog_namespace=CatalogNamespace.KARTA_WIDMOWA.value,
            catalog_item_id="k-brak",
            catalog_item_version="1",
        ),
        repo,
    )
    assert nieznana.error_code == "catalog.item_not_found"


def test_kontrakt_materializacji_karty_wskazuje_pola_rekordu() -> None:
    """Pola solverowe i UI kontraktu `KARTA_WIDMOWA` istnieją w `KartaWidmowa`
    (odpowiednik sprawdzenia `catalog_binding_guard` dla klas dataclass — kontrakt
    karty jest modelem pydantic spoza `types.py`, więc parytet przypina ten test)."""
    from network_model.catalog.types import MATERIALIZATION_CONTRACTS

    kontrakt = MATERIALIZATION_CONTRACTS[CatalogNamespace.KARTA_WIDMOWA.value]
    pola = set(KartaWidmowa.model_fields)
    assert set(kontrakt.solver_fields) <= pola
    assert {pole for pole, _, _ in kontrakt.ui_fields} <= pola
    assert kontrakt.pola_opcjonalne == ()
