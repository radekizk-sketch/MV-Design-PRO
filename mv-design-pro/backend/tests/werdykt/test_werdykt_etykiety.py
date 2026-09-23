"""Słownik etykiet statusu i semantyki koloru (§9) — jedyne mapowanie w produkcie.

Intencja: tabela §9 jest przypięta wiersz po wierszu NA OBU POZIOMACH (K — „Kryterium …",
W — „Wymaganie …", karta A2 pkt 6); ``SPELNIA`` bez określonej kompletności dowodu nie ma
etykiety, a para ``SPELNIA`` + ``NIEPELNY`` na poziomie W jest odrzucana; dla pozostałych
statusów etykieta nie zależy od kompletności (iloczyn poziom × status × kompletność); słownik
wystawiany w API ma stałą kolejność i kształt; KAŻDY rekord katalogu K i W niesie etykietę
słownika SWOJEGO poziomu, a para ``SPELNIA`` + ``NIEPELNY`` na poziomie wymagania nie daje się
zbudować.
"""

from __future__ import annotations

import itertools
from typing import get_args

import pytest
from pydantic import ValidationError
from werdykt import (
    SLOWNIK_ETYKIET,
    Etykieta,
    KompletnoscDowodu,
    OcenaKryterium,
    PoziomRekordu,
    SemantykaKoloru,
    StatusWerdyktu,
    WynikWymagania,
    etykieta,
)

from tests.werdykt import fabryki as f

STATUSY: tuple[StatusWerdyktu, ...] = get_args(StatusWerdyktu)
KOMPLETNOSCI: tuple[KompletnoscDowodu | None, ...] = (*get_args(KompletnoscDowodu), None)
POZIOMY: tuple[PoziomRekordu, ...] = get_args(PoziomRekordu)

WierszTabeli = tuple[PoziomRekordu, StatusWerdyktu, KompletnoscDowodu | None, str, SemantykaKoloru]

#: Tabela §9 z regułą poziomu: na poziomie W słowo „Kryterium" zastąpione słowem „Wymaganie";
#: pary SPELNIA + NIEPELNY na poziomie W nie ma.
TABELA_PARAGRAF_9: list[WierszTabeli] = [
    ("K", "SPELNIA", "PELNY", "Kryterium spełnione", "pozytywna"),
    ("K", "SPELNIA", "NIEPELNY", "Kryterium spełnione — dowód niepełny", "ostrzegawcza"),
    ("K", "NIE_SPELNIA", None, "Kryterium naruszone", "negatywna"),
    ("K", "NIEJEDNOZNACZNY", None, "Wynik niejednoznaczny — wymaga weryfikacji", "ostrzegawcza"),
    ("K", "NIE_OCENIONO", None, "Ocena niewykonana", "neutralna"),
    ("K", "BRAK_DOWODU", None, "Brak wystarczającego dowodu", "ostrzegawcza"),
    ("K", "BRAK_PODSTAWY", None, "Brak zweryfikowanej podstawy wymagania", "ostrzegawcza"),
    ("K", "NIE_DOTYCZY", None, "Nie dotyczy", "neutralna"),
    ("W", "SPELNIA", "PELNY", "Wymaganie spełnione", "pozytywna"),
    ("W", "NIE_SPELNIA", None, "Wymaganie naruszone", "negatywna"),
    ("W", "NIEJEDNOZNACZNY", None, "Wynik niejednoznaczny — wymaga weryfikacji", "ostrzegawcza"),
    ("W", "NIE_OCENIONO", None, "Ocena niewykonana", "neutralna"),
    ("W", "BRAK_DOWODU", None, "Brak wystarczającego dowodu", "ostrzegawcza"),
    ("W", "BRAK_PODSTAWY", None, "Brak zweryfikowanej podstawy wymagania", "ostrzegawcza"),
    ("W", "NIE_DOTYCZY", None, "Nie dotyczy", "neutralna"),
]


@pytest.mark.parametrize("poziom, status, kompletnosc, tekst, semantyka", TABELA_PARAGRAF_9)
def test_etykieta_wg_tabeli_paragrafu_9(
    poziom: PoziomRekordu,
    status: StatusWerdyktu,
    kompletnosc: KompletnoscDowodu | None,
    tekst: str,
    semantyka: SemantykaKoloru,
) -> None:
    assert etykieta(status, kompletnosc, poziom) == Etykieta(etykieta_pl=tekst, semantyka=semantyka)


def test_etykiety_poziomow_roznia_sie_wylacznie_slowem_kryterium_wymaganie() -> None:
    """Reguła §9: etykieta W = etykieta K z „Kryterium" zastąpionym przez „Wymaganie"."""
    for status in STATUSY:
        kompletnosc: KompletnoscDowodu | None = "PELNY" if status == "SPELNIA" else None
        etykieta_k = etykieta(status, kompletnosc, "K")
        etykieta_w = etykieta(status, kompletnosc, "W")
        assert etykieta_w.etykieta_pl == etykieta_k.etykieta_pl.replace("Kryterium", "Wymaganie")
        assert etykieta_w.semantyka == etykieta_k.semantyka


@pytest.mark.parametrize("poziom", POZIOMY)
@pytest.mark.parametrize("kompletnosc", [None, "NIE_DOTYCZY"])
def test_spelnia_wymaga_okreslonej_kompletnosci(
    kompletnosc: KompletnoscDowodu | None, poziom: PoziomRekordu
) -> None:
    with pytest.raises(ValueError, match="PELNY albo NIEPELNY"):
        etykieta("SPELNIA", kompletnosc, poziom)


def test_spelnia_z_dowodem_niepelnym_na_poziomie_w_jest_odrzucane() -> None:
    with pytest.raises(ValueError, match="poziomie wymagania status SPELNIA wymaga dowodu"):
        etykieta("SPELNIA", "NIEPELNY", "W")


@pytest.mark.parametrize(
    "poziom, status, kompletnosc",
    [(p, s, k) for p, s, k in itertools.product(POZIOMY, STATUSY, KOMPLETNOSCI) if s != "SPELNIA"],
)
def test_etykieta_poza_spelnia_nie_zalezy_od_kompletnosci(
    poziom: PoziomRekordu, status: StatusWerdyktu, kompletnosc: KompletnoscDowodu | None
) -> None:
    assert etykieta(status, kompletnosc, poziom) == etykieta(status, None, poziom)


def test_slownik_etykiet_do_api_w_stalej_kolejnosci() -> None:
    assert [
        (p.poziom, p.status, p.kompletnosc, p.etykieta_pl, p.semantyka) for p in SLOWNIK_ETYKIET
    ] == TABELA_PARAGRAF_9
    for poziom in POZIOMY:
        assert {p.status for p in SLOWNIK_ETYKIET if p.poziom == poziom} == set(STATUSY)
    assert {p.semantyka for p in SLOWNIK_ETYKIET} == set(get_args(SemantykaKoloru))
    assert [p.model_dump(mode="json") for p in SLOWNIK_ETYKIET][0] == {
        "poziom": "K",
        "status": "SPELNIA",
        "kompletnosc": "PELNY",
        "etykieta_pl": "Kryterium spełnione",
        "semantyka": "pozytywna",
    }
    with pytest.raises(ValidationError, match="frozen"):
        SLOWNIK_ETYKIET[0].__setattr__("etykieta_pl", "Spełnia")


@pytest.mark.parametrize(
    "nazwa, rekord",
    f.rekordy_k() + f.rekordy_w(),
    ids=[n for n, _ in f.rekordy_k() + f.rekordy_w()],
)
def test_kazdy_rekord_niesie_etykiete_slownika_swojego_poziomu(
    nazwa: str, rekord: OcenaKryterium | WynikWymagania
) -> None:
    kompletnosc = None if rekord.kompletnosc_dowodu == "NIE_DOTYCZY" else rekord.kompletnosc_dowodu
    poziom: PoziomRekordu = "K" if isinstance(rekord, OcenaKryterium) else "W"
    assert rekord.etykieta == etykieta(rekord.status_maszynowy, kompletnosc, poziom)
    if rekord.status_maszynowy in ("SPELNIA", "NIE_SPELNIA"):
        slowo = "Kryterium" if poziom == "K" else "Wymaganie"
        assert rekord.etykieta.etykieta_pl.startswith(slowo)


@pytest.mark.parametrize("status_skladowej", ["SPELNIA", "NIE_SPELNIA"])
def test_rekord_z_etykieta_innego_poziomu_jest_odrzucany(status_skladowej: str) -> None:
    """Etykieta K w rekordzie W (i odwrotnie) różni się od słownika poziomu — walidator ją
    odrzuca."""
    skladowa = f.ocena(m=2.0 if status_skladowej == "SPELNIA" else -2.0)
    rekord_w = f.wymaganie([skladowa])
    dane_w = rekord_w.model_dump(mode="json")
    dane_w["etykieta"] = skladowa.etykieta.model_dump(mode="json")
    with pytest.raises(ValidationError, match="etykieta"):
        WynikWymagania.model_validate(dane_w)
    dane_k = skladowa.model_dump(mode="json")
    dane_k["etykieta"] = rekord_w.etykieta.model_dump(mode="json")
    with pytest.raises(ValidationError, match="etykieta"):
        OcenaKryterium.model_validate(dane_k)


def test_kryterium_spelnione_z_dowodem_niepelnym_jest_ostrzegawcze() -> None:
    rekord = f.ocena(dowod_oceny=f.dowod(stan_danych="UNVALIDATED_INPUT"))
    assert (rekord.status_maszynowy, rekord.kompletnosc_dowodu) == ("SPELNIA", "NIEPELNY")
    assert rekord.etykieta == Etykieta(
        etykieta_pl="Kryterium spełnione — dowód niepełny", semantyka="ostrzegawcza"
    )


def test_wymaganie_spelnione_z_dowodem_niepelnym_nie_daje_sie_zbudowac() -> None:
    """Para SPELNIA + NIEPELNY na W: słownik jej nie ma, a rekord z podmienionym statusem
    i etykietą ostrzegawczą poziomu K jest odrzucany."""
    rekord = f.wymaganie([f.ocena(dowod_oceny=f.dowod(stan_danych="UNVALIDATED_INPUT"))])
    assert rekord.status_maszynowy == "BRAK_DOWODU"
    dane = rekord.model_dump(mode="json")
    dane["status_maszynowy"] = "SPELNIA"
    dane["etykieta"] = etykieta("SPELNIA", "NIEPELNY", "K").model_dump(mode="json")
    with pytest.raises(ValidationError, match="status"):
        WynikWymagania.model_validate(dane)
