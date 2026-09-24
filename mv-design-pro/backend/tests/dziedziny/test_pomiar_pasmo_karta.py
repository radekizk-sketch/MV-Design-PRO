"""Parametry pomiaru, pasmo widma i karta widmowa (karta AB-H0 §0.5–§0.7)."""

from __future__ import annotations

from typing import get_args

import pytest
from dziedziny.karta_widmowa import (
    KartaWidmowa,
    ModeleWidmoweElementu,
    StatusKataloguKarty,
    materializuj_modele_widmowe,
)
from dziedziny.pasmo import PasmoWidma, modele_niezgodne_z_pasmem
from dziedziny.pomiar import KOMPLET_POMIARU, OknoPomiaru, ParametryPomiaru
from dziedziny.widmo import ZakresCzestotliwosci
from pydantic import ValidationError
from werdykt.kontrakt import DanaPrzyjeta, Wielkosc

from tests.dziedziny import fabryki as f

# --- Parametry pomiaru -----------------------------------------------------------------


def test_komplet_pomiaru_nazywa_kazdy_brak() -> None:
    assert ParametryPomiaru().braki_kompletu(supraharmoniczna=False) == KOMPLET_POMIARU
    assert ParametryPomiaru().braki_kompletu(supraharmoniczna=True) == (*KOMPLET_POMIARU, "rbw_hz")
    assert f.pomiar_kompletny(rbw=False).braki_kompletu(supraharmoniczna=False) == ()
    assert f.pomiar_kompletny(rbw=False).braki_kompletu(supraharmoniczna=True) == ("rbw_hz",)


def test_warunki_sieci_probierczej_wymagaja_jakosci() -> None:
    with pytest.raises(ValidationError, match="bez statusu jakości"):
        ParametryPomiaru(
            warunki_sieci_probierczej=(
                DanaPrzyjeta(
                    nazwa_pl="S_k sieci probierczej",
                    wartosc=Wielkosc(wartosc=10.0, jednostka="MVA"),
                    powod_pl="z protokołu",
                    jakosc=None,
                ),
            )
        )


def test_okno_i_szum_walidowane() -> None:
    with pytest.raises(ValidationError, match="dodatnia"):
        OknoPomiaru(rodzaj_pl="prostokątne", dlugosc_s=0.2, liczba_okresow=0)
    with pytest.raises(ValidationError, match="nieujemną"):
        ParametryPomiaru(poziom_szumu=Wielkosc(wartosc=-1.0, jednostka="A"))


# --- Pasmo widma -----------------------------------------------------------------------


def _pasmo(**inne: object) -> PasmoWidma:
    dane: dict[str, object] = {
        "ident": "pasmo-2-150k",
        "dziedzina": "SUPRAHARMONIC_FREQUENCY_DOMAIN",
        "f_min_hz": 2000.0,
        "f_max_hz": 150000.0,
        "rozdzielczosc_hz": 200.0,
        "pasmo_agregacji_hz": 2000.0,
        "metoda_pomiaru": "wg dokumentu",
        "podstawa": f.podstawa(rodzaj="NORMA", status="NIEUSTALONE", dokument="Dokument pasma"),
        "wersja": "1",
    }
    dane.update(inne)
    return PasmoWidma(**dane)


def test_pasmo_walidacja() -> None:
    assert _pasmo()
    with pytest.raises(ValidationError, match="f_min < f_max"):
        _pasmo(f_min_hz=150000.0, f_max_hz=2000.0)
    with pytest.raises(ValidationError, match="węższe od rozdzielczości"):
        _pasmo(pasmo_agregacji_hz=100.0)
    with pytest.raises(ValidationError):
        _pasmo(rozdzielczosc_hz=0.0)


def test_pasmo_supraharmoniczne_wymaga_rbw_modeli_ktore_je_wskazuja() -> None:
    supra = {
        "dziedzina": "SUPRAHARMONIC_FREQUENCY_DOMAIN",
        "zakres_czestotliwosci": ZakresCzestotliwosci(f_min_hz=2000.0, f_max_hz=150000.0),
        "skladowe": (f.skladowa(16000.0, 0.5),),
        "pasmo_ref": "pasmo-2-150k",
    }
    bez_rbw = f.model(ident="bez-rbw", **supra)
    z_rbw = f.model(ident="z-rbw", pomiar=f.pomiar_kompletny(rbw=True), **supra)
    obcy = f.model(ident="obcy", **{**supra, "pasmo_ref": "inne"})
    assert modele_niezgodne_z_pasmem(_pasmo(), (z_rbw, bez_rbw, obcy)) == ("bez-rbw",)
    harmoniczny = f.model(ident="harm", pasmo_ref="pasmo-2-150k")
    assert modele_niezgodne_z_pasmem(_pasmo(), (harmoniczny,)) == ("harm",)


# --- Karta widmowa ---------------------------------------------------------------------


def test_karta_wymaga_modeli_i_normalizuje_kolejnosc() -> None:
    with pytest.raises(ValidationError, match="co najmniej jednego modelu"):
        f.karta(modele=())
    with pytest.raises(ValidationError, match="powtarzają identyfikatory"):
        f.karta(modele=(f.model(), f.model()))
    a = f.karta(modele=(f.model(ident="b"), f.model(ident="a")))
    b = f.karta(modele=(f.model(ident="a"), f.model(ident="b")))
    assert [m.ident for m in a.modele] == ["a", "b"]
    assert a.odcisk() == b.odcisk()


def test_karta_przyjmuje_tylko_dowody_widma() -> None:
    with pytest.raises(ValidationError, match="nie jest dowodem widma"):
        f.karta(dowody=(f.dowod("CERTYFIKAT_ZGODNOSCI", ("HARMONIC_FREQUENCY_DOMAIN",)),))
    with pytest.raises(ValidationError, match="spoza dziedziny częstotliwości"):
        f.karta(dowody=(f.dowod("RAPORT_BADAN", ("RMS_DYNAMICS",)),))
    assert f.karta(dowody=(f.dowod("RAPORT_BADAN", ("HARMONIC_FREQUENCY_DOMAIN",)),))


def test_karta_round_trip_json_bajtowo() -> None:
    karta = f.karta(dowody=(f.dowod("POMIAR", ("HARMONIC_FREQUENCY_DOMAIN",)),))
    odtworzona = KartaWidmowa.model_validate(karta.to_dict())
    assert odtworzona == karta
    assert odtworzona.kanoniczny_json() == karta.kanoniczny_json()
    assert odtworzona.odcisk() == karta.odcisk()


def test_status_katalogu_karty_parytet_z_katalogiem() -> None:
    from network_model.catalog.types import CatalogStatus

    assert set(get_args(StatusKataloguKarty)) == {s.value for s in CatalogStatus}


def test_materializacja_niesie_proweniencje_i_jest_deterministyczna() -> None:
    k1 = f.karta(id="k1", modele=(f.model(ident="k1-m"),))
    k2 = f.karta(id="k2", modele=(f.model(ident="k2-m"),))
    a = materializuj_modele_widmowe(((k2, "PROJEKT"), (k1, "STATYCZNA")))
    b = materializuj_modele_widmowe(((k1, "STATYCZNA"), (k2, "PROJEKT")))
    assert a == b
    assert [z.karta_id for z in a.zrodla] == ["k1", "k2"]
    assert a.zrodla[0].odcisk_karty == k1.odcisk()
    assert a.zrodla[1].przestrzen == "PROJEKT"
    assert [m.ident for m in a.modele] == ["k1-m", "k2-m"]


def test_materializacja_odrzuca_kolizje_identyfikatorow_modeli_i_pustke() -> None:
    with pytest.raises(ValidationError, match="unikalny w obrębie elementu"):
        materializuj_modele_widmowe(
            ((f.karta(id="k1"), "STATYCZNA"), (f.karta(id="k2"), "PROJEKT"))
        )
    with pytest.raises(ValueError, match="co najmniej jednej karty"):
        materializuj_modele_widmowe(())
    with pytest.raises(ValidationError):
        ModeleWidmoweElementu(modele=(), zrodla=())
