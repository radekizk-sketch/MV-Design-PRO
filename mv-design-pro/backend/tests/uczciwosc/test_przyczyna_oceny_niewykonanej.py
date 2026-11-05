"""Przyczyna oceny niewykonanej odpowiada faktowi (kontrakt werdyktu wyjaśnialnego §2.1–§2.2).

PO CO. Fabryka ``ocena_niewykonana`` dawała ZAWSZE dowód ``BRAK_METODY``, więc funkcja
ziemnozwarciowa wstrzymana brakiem nastaw mówiła „ocena niewykonana: brak metody dowodu, która
wykazuje wielkości z obliczenia statycznego; właściwa metoda: certyfikat urządzenia, raport
z testu…”, a napięcie krokowe bez geometrii uziomu — że właściwą metodą jest certyfikat
urządzenia. Prawdziwa przyczyna to brak danych modelu; metoda właściwa jest dobrana do
kryterium (napięcie krokowe: obliczenie rozkładu potencjału z modelem uziomu albo pomiar).

ILOCZYN CECH: przyczyna {brak danych, brak metody, brak podstawy limitu} × rodzaj twierdzenia
{obliczenie statyczne, konfiguracja zadeklarowana, zachowanie dynamiczne} na fabryce oraz
kryterium REALNE {czułość/selektywność/czas 51N i 67N, ocena 50/51, napięcie krokowe, napięcie
uziomowe / rezystancja dopuszczalna, ochrona LoM pola bez funkcji, trajektoria FRT} na biegu
→ status, krok reguły (zdanie), metoda dowodu i nazwana metoda właściwa.
"""

from __future__ import annotations

from typing import Any

import pytest
from application.ocena_niewykonana import METODA_DLA_TWIERDZENIA, ocena_niewykonana
from werdykt import (
    ClaimKind,
    EvidenceTier,
    PodstawaWymagania,
    Przedmiot,
    ZakresWaznosci,
    metody_dopuszczalne,
)

_PODSTAWA = PodstawaWymagania(
    rodzaj="ZALOZENIE_PROJEKTOWE",
    dokument="Nastawy w modelu",
    wydanie="model",
    jednostka_redakcyjna="nastawy funkcji",
    status="WSKAZANE",
)
_BRAK = "Brakuje nastaw: próg rozruchowy 3I₀ — uzupełnij w karcie pola."


def _ocena(przyczyna: Any, rodzaj: ClaimKind, akcja: str | None = None) -> Any:
    return ocena_niewykonana(
        kryterium_id="test.k",
        przedmiot=Przedmiot(element_ref="e1", nazwa_pl="Element 1", opis_pl="przedmiot"),
        opis_kryterium_pl="Kryterium testowe",
        podstawa=_PODSTAWA,
        powod_stosowalnosci_pl="dotyczy",
        rodzaj_twierdzenia=rodzaj,
        poziom=EvidenceTier.UNVALIDATED_MODEL,
        status_modelu=(
            "NIE_DOTYCZY" if rodzaj is not ClaimKind.DYNAMIC_PERFORMANCE else "UNVALIDATED_MODEL"
        ),
        zakres_waznosci=ZakresWaznosci(opis_pl="zakres"),
        powod_braku_niepewnosci_pl="brak wyniku",
        czego_brakuje=(_BRAK,),
        przyczyna=przyczyna,
        akcja_naprawcza_pl=akcja,
    )


@pytest.mark.parametrize("rodzaj", list(ClaimKind))
def test_brak_danych_to_krok_wyniku_z_metoda_wlasciwa_dla_twierdzenia(
    rodzaj: ClaimKind,
) -> None:
    ocena = _ocena("BRAK_DANYCH", rodzaj)
    assert ocena.status_maszynowy == "NIE_OCENIONO"
    assert ocena.dowod.metoda == METODA_DLA_TWIERDZENIA[rodzaj]
    assert ocena.dowod.metoda in metody_dopuszczalne(rodzaj)
    zdanie = ocena.wyjasnienie.zdanie_pl
    assert "brak wyznaczonej wielkości ocenianej" in zdanie
    assert "brak metody dowodu" not in zdanie
    assert _BRAK.rstrip(".") in zdanie
    assert ocena.wyjasnienie.czego_brakuje[-1] == _BRAK


@pytest.mark.parametrize("rodzaj", list(ClaimKind))
def test_brak_metody_to_krok_metody_z_lista_metod(rodzaj: ClaimKind) -> None:
    ocena = _ocena("BRAK_METODY", rodzaj)
    assert ocena.status_maszynowy == "NIE_OCENIONO"
    assert ocena.dowod.metoda == "BRAK_METODY"
    assert "brak metody dowodu" in ocena.wyjasnienie.zdanie_pl
    assert "właściwa metoda:" in ocena.wyjasnienie.zdanie_pl


def test_akcja_kryterium_zastepuje_akcje_ogolna_tylko_przy_braku_danych() -> None:
    akcja = "wyznacz wielkość pomiarem"
    ocena = _ocena("BRAK_DANYCH", ClaimKind.STATIC_CALCULATION, akcja)
    assert ocena.wyjasnienie.zdanie_pl.endswith(f"Akcja naprawcza: {akcja}.")
    ogolna = _ocena("BRAK_DANYCH", ClaimKind.STATIC_CALCULATION)
    assert "wykonaj bieg na aktualnym modelu" in ogolna.wyjasnienie.zdanie_pl
    with pytest.raises(ValueError):
        _ocena("BRAK_METODY", ClaimKind.STATIC_CALCULATION, akcja)


# ---------------------------------------------------------------------------
# Kryteria realne — bieg oceny na scenie doziemienia
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def wynik() -> dict[str, Any]:
    from enm.models import EnergyNetworkModel

    from tests.application.analyses.protection.coordination.test_koordynacja_ziemnozwarciowa import (
        _biegi,
        _koordynuj,
    )
    from tests.reference_networks.scena_doziemienia import zbuduj_scene

    sc_max, sc_min, _ = _biegi(EnergyNetworkModel.model_validate(zbuduj_scene("IZOLOWANY")))
    return _koordynuj(sc_max, sc_min)


@pytest.mark.parametrize("kod", ["51N", "67N"])
def test_funkcja_ziemnozwarciowa_bez_nastaw_to_brak_danych(wynik: dict[str, Any], kod: str) -> None:
    rekordy = [r for r in wynik["ziemnozwarciowe"]["odmowy"] if r["kod"] == kod]
    assert rekordy
    for rekord in rekordy:
        ocena = rekord["ocena"]
        assert ocena["status_maszynowy"] == "NIE_OCENIONO"
        assert ocena["dowod"]["metoda"] == "OBLICZENIE"
        zdanie = ocena["wyjasnienie"]["zdanie_pl"]
        assert "brak wyznaczonej wielkości ocenianej (Brakuje nastaw:" in zdanie
        assert "brak metody dowodu" not in zdanie and "certyfikat" not in zdanie


def test_ocena_nadpradowa_bez_nastaw_to_brak_danych(wynik: dict[str, Any]) -> None:
    assert wynik["odmowy_urzadzen"]
    for odmowa in wynik["odmowy_urzadzen"]:
        ocena = odmowa["ocena"]
        assert ocena["dowod"]["metoda"] == "OBLICZENIE"
        assert "brak metody dowodu" not in ocena["wyjasnienie"]["zdanie_pl"]


def test_napiecie_krokowe_brak_danych_z_metoda_dobrana_do_kryterium(wynik: dict[str, Any]) -> None:
    rekordy = [
        r for r in wynik["ziemnozwarciowe"]["uziemienia"] if r["kryterium"] == "NAPIECIE_KROKOWE"
    ]
    assert rekordy
    for rekord in rekordy:
        ocena = rekord["ocena"]
        assert ocena["status_maszynowy"] == "NIE_OCENIONO"
        zdanie = ocena["wyjasnienie"]["zdanie_pl"]
        assert "geometrii uziomu" in zdanie and "rezystywności gruntu" in zdanie
        assert "rozkładu potencjału" in zdanie and "PN-EN 50522" in zdanie
        assert "pomiarem" in zdanie
        assert "certyfikat" not in zdanie and "brak metody dowodu" not in zdanie


def test_uziemienie_bez_podstawy_limitu_to_brak_podstawy_z_wynikiem(wynik: dict[str, Any]) -> None:
    """Trzecia przyczyna: wynik jest, limit bez ustalonej podstawy (krzywa U_Tp poza repo) —
    BRAK_PODSTAWY z wynikiem informacyjnym, nie „ocena niewykonana”."""
    rekordy = [
        r
        for r in wynik["ziemnozwarciowe"]["uziemienia"]
        if r["kryterium"] in ("NAPIECIE_UZIOMOWE", "REZYSTANCJA_DOPUSZCZALNA")
    ]
    assert rekordy
    for rekord in rekordy:
        ocena = rekord["ocena"]
        assert ocena["status_maszynowy"] == "BRAK_PODSTAWY"
        assert ocena["wynik"] is not None
        zdanie = ocena["wyjasnienie"]["zdanie_pl"]
        assert "brak ustalonej podstawy parametru" in zdanie
        assert "ocena niewykonana" not in zdanie


def test_lom_pole_bez_funkcji_to_brak_danych() -> None:
    """Pole OZE bez funkcji LoM: model nie niesie nastaw do porównania z oknami — brak danych
    (dowód metodą deklaracji), akcja naprawcza nazywa przypisanie funkcji."""
    from application.analyses.ochrona_lom import _pole_widoku
    from enm.models import Bay

    from tests.uczciwosc.pomocnicze import sprawdz_ocene_niewykonana

    pole = Bay(
        ref_id="bay-oze",
        name="Pole OZE",
        bay_role="OZE",
        substation_ref="st-1",
        bus_ref="bus-1",
    )
    widok, _ = _pole_widoku(pole, [], [], [])
    rekord = sprawdz_ocene_niewykonana(widok["ocena"], przyczyna="BRAK_DANYCH")
    assert rekord.dowod.metoda == "DEKLARACJA"
    assert "przypisz polu zabezpieczenie z funkcjami LoM" in rekord.wyjasnienie.zdanie_pl


@pytest.mark.parametrize(
    "modul",
    ["application.analyses.frt_trajektorie", "application.dynamika.opis_wyniku"],
)
def test_brak_metody_zostaje_tam_gdzie_narzedzie_nie_ma_metody(modul: str) -> None:
    """Trajektoria FRT i ocena dynamiki: narzędzie nie ma metody dowodu zachowania dynamicznego
    (symulacja niezwalidowana) — przyczyna BRAK_METODY jest prawdziwa i zostaje jawna.
    """
    import importlib
    import inspect

    zrodlo = inspect.getsource(importlib.import_module(modul))
    assert 'przyczyna="BRAK_METODY"' in zrodlo
    assert 'przyczyna="BRAK_DANYCH"' not in zrodlo
