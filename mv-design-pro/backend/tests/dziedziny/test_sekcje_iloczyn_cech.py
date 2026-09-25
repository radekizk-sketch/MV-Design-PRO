"""Status sekcji modelu urządzenia — ILOCZYN CECH z niezależną wyrocznią (karta AB-H0 §0.3).

Iloczyn: rodzaj sekcji (8) × dowód (brak / deklaracja karty / raport badań / pomiar /
certyfikat zgodności PTPiREE / certyfikat modelu) × status weryfikacji rekordu (4) ×
jakość pola (3) × stan podstawy dowodu (ustalona / nieustalona) = 1152 przypadki.
Wyrocznia ``oczekiwany_status`` jest spisana z tabeli karty §0.3 — nie woła
``status_sekcji``. Do tego: odwzorowanie na ``StatusModelu`` PARAMI z regułą, ``VALIDATED``
nieosiągalne, certyfikat zgodności nie podnosi sekcji ``dynamic``, brak danych = ``UNKNOWN``
z nazwanymi brakami, składniki opcjonalne, sufit z widma bez parametrów pomiaru.
"""

from __future__ import annotations

import itertools
from typing import get_args

import pytest
from dziedziny.sekcje import (
    DZIEDZINY_SEKCJI,
    PORZADEK_SILY,
    SEKCJE,
    SEKCJE_DOWODOWE,
    SEKCJE_FIZYCZNE,
    BrakModelu,
    OcenaSekcji,
    PoleSekcji,
    RodzajSekcjiModelu,
    SkladnikSekcji,
    StatusSekcji,
    StatusWeryfikacjiRekordu,
    WejscieStatusuSekcji,
    status_modelu_z_sekcji,
    status_sekcji,
)
from dziedziny.widmo import wybierz_model
from pydantic import ValidationError
from werdykt.kontrakt import DziedzinaFizyki
from werdykt.proweniencja import FieldQuality

from tests.dziedziny import fabryki as f

WSZYSTKIE_DZIEDZINY: tuple[DziedzinaFizyki, ...] = get_args(DziedzinaFizyki)
DOWODY = (
    None,
    "DEKLARACJA_KARTY",
    "RAPORT_BADAN",
    "POMIAR",
    "CERTYFIKAT_ZGODNOSCI",
    "CERTYFIKAT_MODELU",
)
WERYFIKACJE: tuple[StatusWeryfikacjiRekordu, ...] = get_args(StatusWeryfikacjiRekordu)
JAKOSCI = tuple(FieldQuality)
STANY_PODSTAWY = ("WSKAZANE", "NIEUSTALONE")


def _wejscie(
    sekcja: RodzajSekcjiModelu,
    dowod: str | None,
    weryfikacja: StatusWeryfikacjiRekordu,
    jakosc: FieldQuality,
    stan: str,
) -> WejscieStatusuSekcji:
    dowody = (
        ()
        if dowod is None
        else (f.dowod(dowod, WSZYSTKIE_DZIEDZINY, status=stan, odniesienie="DOK-1"),)
    )
    skladniki = (
        ()
        if sekcja in SEKCJE_DOWODOWE
        else (
            SkladnikSekcji(
                nazwa="dane",
                wymagany=True,
                rodzaj_danych="POLA",
                pola=(PoleSekcji(nazwa="pole_x", obecne=True, jakosc=jakosc),),
            ),
        )
    )
    return WejscieStatusuSekcji(
        sekcja=sekcja, skladniki=skladniki, dowody=dowody, status_weryfikacji_rekordu=weryfikacja
    )


def oczekiwany_status(
    sekcja: str, dowod: str | None, weryfikacja: str, jakosc: FieldQuality, stan: str
) -> StatusSekcji:
    """Tabela karty §0.3 spisana wprost (wyrocznia niezależna od implementacji)."""
    uznany = dowod is not None and (stan != "NIEUSTALONE" or weryfikacja == "ZWERYFIKOWANY")
    if sekcja == "validation":
        return "UNKNOWN"
    if sekcja == "certification":
        if dowod in ("CERTYFIKAT_ZGODNOSCI", "CERTYFIKAT_MODELU"):
            return "CERTIFIED" if uznany else "UNVALIDATED"
        return "UNKNOWN"
    if sekcja == "measurement":
        if dowod in ("RAPORT_BADAN", "POMIAR"):
            return "MEASURED" if uznany else "UNVALIDATED"
        return "UNKNOWN"
    if dowod == "CERTYFIKAT_MODELU" and uznany:
        z_dowodu: StatusSekcji = "CERTIFIED"
    elif dowod in ("RAPORT_BADAN", "POMIAR") and uznany:
        z_dowodu = "MEASURED"
    else:
        z_dowodu = "UNVALIDATED"
    if jakosc is not FieldQuality.DATASHEET:
        return "UNVALIDATED"
    return z_dowodu


def test_iloczyn_cech_statusu_sekcji_z_wyrocznia() -> None:
    przypadki = 0
    rozbieznosci: list[str] = []
    for sekcja, dowod, weryfikacja, jakosc, stan in itertools.product(
        SEKCJE, DOWODY, WERYFIKACJE, JAKOSCI, STANY_PODSTAWY
    ):
        przypadki += 1
        ocena = status_sekcji(_wejscie(sekcja, dowod, weryfikacja, jakosc, stan))
        oczekiwany = oczekiwany_status(sekcja, dowod, weryfikacja, jakosc, stan)
        if ocena.status != oczekiwany:
            rozbieznosci.append(
                f"{sekcja}/{dowod}/{weryfikacja}/{jakosc.value}/{stan}: {ocena.status} ≠ "
                f"{oczekiwany} ({ocena.powod_pl})"
            )
        assert ocena.powod_pl.strip(), "powód statusu jest niepusty ZAWSZE"
        assert ocena.status not in ("VALIDATED", "OUTSIDE_DOMAIN")
    assert przypadki == 8 * 6 * 4 * 3 * 2
    assert not rozbieznosci, f"{len(rozbieznosci)} rozbieżności:\n" + "\n".join(rozbieznosci[:20])


def test_status_modelu_parami_z_regula_dla_calego_iloczynu() -> None:
    """Odwzorowanie ``StatusModelu`` na każdym wyniku iloczynu — JEDNA reguła."""
    oczekiwane: dict[str, str] = {
        "CERTIFIED": "CERTIFIED_MODEL",
        "UNVALIDATED": "UNVALIDATED_MODEL",
    }
    for sekcja, dowod, weryfikacja, jakosc, stan in itertools.product(
        SEKCJE, DOWODY, WERYFIKACJE, JAKOSCI, STANY_PODSTAWY
    ):
        ocena = status_sekcji(_wejscie(sekcja, dowod, weryfikacja, jakosc, stan))
        wynik = status_modelu_z_sekcji(ocena)
        if sekcja in SEKCJE_DOWODOWE:
            assert isinstance(wynik, BrakModelu), (sekcja, ocena.status, wynik)
            assert "nie jest modelem" in wynik.powod_pl
        elif ocena.status in oczekiwane:
            assert wynik == oczekiwane[ocena.status], (sekcja, ocena.status, wynik)
        else:
            # MEASURED bez zapytania o domenę i UNKNOWN → brak modelu z powodem.
            assert isinstance(wynik, BrakModelu), (sekcja, ocena.status, wynik)
            assert wynik.czego_brakuje_pl.strip()


def test_validated_nie_ma_producenta_w_tym_przyroscie() -> None:
    """Żadne wejście nie daje ``VALIDATED`` — typ rekordu walidacji nie istnieje."""
    from dziedziny.sekcje import RodzajDowodu

    assert "WALIDACJA" not in " ".join(get_args(RodzajDowodu))
    for sekcja in SEKCJE:
        for dowod in DOWODY:
            ocena = status_sekcji(
                _wejscie(sekcja, dowod, "ZWERYFIKOWANY", FieldQuality.DATASHEET, "ZWERYFIKOWANE")
            )
            assert ocena.status != "VALIDATED"
    walidacja = status_sekcji(
        _wejscie(
            "validation",
            "CERTYFIKAT_MODELU",
            "ZWERYFIKOWANY",
            FieldQuality.DATASHEET,
            "ZWERYFIKOWANE",
        )
    )
    assert walidacja.status == "UNKNOWN"
    assert "producent" in walidacja.powod_pl


def test_certyfikat_zgodnosci_nie_podnosi_sekcji_dynamic() -> None:
    """Rekord PTPiREE: ``certification = CERTIFIED``, ``dynamic ≠ CERTIFIED``."""
    for weryfikacja in WERYFIKACJE:
        certyfikacja = status_sekcji(
            _wejscie(
                "certification",
                "CERTYFIKAT_ZGODNOSCI",
                weryfikacja,
                FieldQuality.DATASHEET,
                "WSKAZANE",
            )
        )
        dynamika = status_sekcji(
            _wejscie(
                "dynamic", "CERTYFIKAT_ZGODNOSCI", weryfikacja, FieldQuality.DATASHEET, "WSKAZANE"
            )
        )
        assert certyfikacja.status == "CERTIFIED"
        assert dynamika.status != "CERTIFIED"
        assert dynamika.status == "UNVALIDATED"
        assert status_modelu_z_sekcji(dynamika) == "UNVALIDATED_MODEL"


def test_dowod_niepokrywajacy_dziedziny_sekcji_jest_pomijany() -> None:
    wejscie = WejscieStatusuSekcji(
        sekcja="harmonic",
        skladniki=(
            SkladnikSekcji(
                nazwa="impedancja",
                wymagany=True,
                rodzaj_danych="POLA",
                pola=(PoleSekcji(nazwa="x", obecne=True, jakosc=FieldQuality.DATASHEET),),
            ),
        ),
        dowody=(f.dowod("CERTYFIKAT_MODELU", ("RMS_DYNAMICS",)),),
        status_weryfikacji_rekordu="ZWERYFIKOWANY",
    )
    assert status_sekcji(wejscie).status == "UNVALIDATED"


# ---------------------------------------------------------------------------
# Obecność danych, składniki, najsłabszy składnik
# ---------------------------------------------------------------------------


def _pole(nazwa: str, obecne: bool = True, jakosc: FieldQuality | None = FieldQuality.DATASHEET):
    return PoleSekcji(nazwa=nazwa, obecne=obecne, jakosc=jakosc)


def test_brak_pola_wymaganego_daje_unknown_z_nazwanymi_brakami() -> None:
    ocena = status_sekcji(
        WejscieStatusuSekcji(
            sekcja="short_circuit",
            skladniki=(
                SkladnikSekcji(
                    nazwa="udzial_zwarciowy",
                    wymagany=True,
                    rodzaj_danych="POLA",
                    pola=(_pole("k_sc", obecne=False, jakosc=None),),
                ),
            ),
            status_weryfikacji_rekordu="REFERENCYJNY",
        )
    )
    assert ocena.status == "UNKNOWN"
    assert "k_sc" in ocena.powod_pl
    assert status_modelu_z_sekcji(ocena) == BrakModelu(
        sekcja="short_circuit",
        powod_pl=ocena.powod_pl,
        czego_brakuje_pl="model sekcji short_circuit",
    )


def test_skladnik_opcjonalny_bez_danych_nie_obniza_statusu_a_z_danymi_obniza() -> None:
    wymagany = SkladnikSekcji(
        nazwa="znamionowe",
        wymagany=True,
        rodzaj_danych="POLA",
        pola=(_pole("sn_mva"), _pole("un_kv")),
    )
    opcjonalny_pusty = SkladnikSekcji(
        nazwa="migotanie",
        wymagany=False,
        rodzaj_danych="POLA",
        pola=(_pole("flicker_c", obecne=False, jakosc=None),),
    )
    opcjonalny_szacowany = SkladnikSekcji(
        nazwa="migotanie",
        wymagany=False,
        rodzaj_danych="POLA",
        pola=(_pole("flicker_c", jakosc=FieldQuality.ESTIMATED),),
    )
    dowod = (f.dowod("RAPORT_BADAN", ("POWER_FLOW",)),)
    bez = status_sekcji(
        WejscieStatusuSekcji(
            sekcja="fundamental",
            skladniki=(wymagany, opcjonalny_pusty),
            dowody=dowod,
            status_weryfikacji_rekordu="ZWERYFIKOWANY",
        )
    )
    assert bez.status == "MEASURED"
    assert [s.uwzgledniony for s in bez.skladniki] == [True, False]
    z = status_sekcji(
        WejscieStatusuSekcji(
            sekcja="fundamental",
            skladniki=(wymagany, opcjonalny_szacowany),
            dowody=dowod,
            status_weryfikacji_rekordu="ZWERYFIKOWANY",
        )
    )
    assert z.status == "UNVALIDATED"
    assert "migotanie" in z.powod_pl and "flicker_c" in z.powod_pl
    assert [d.nazwa_pl for d in z.dane_przyjete] == ["flicker_c"]


def test_skladnik_czesciowo_obecny_wymagany_nieznany_opcjonalny_na_polach_obecnych() -> None:
    """Iloczyn: wymagany/opcjonalny × komplet/część/brak pól (6 przypadków, wyrocznia z reguły)."""
    stany = {
        "komplet": (_pole("a"), _pole("b")),
        "czesc": (_pole("a"), _pole("b", obecne=False, jakosc=None)),
        "brak": (_pole("a", obecne=False, jakosc=None), _pole("b", obecne=False, jakosc=None)),
    }
    oczekiwane = {
        (True, "komplet"): ("MEASURED", True),
        (True, "czesc"): ("UNKNOWN", True),
        (True, "brak"): ("UNKNOWN", True),
        (False, "komplet"): ("MEASURED", True),
        (False, "czesc"): ("MEASURED", True),
        (False, "brak"): ("UNKNOWN", False),
    }
    for (wymagany, stan), (status, uwzgledniony) in oczekiwane.items():
        ocena = status_sekcji(
            WejscieStatusuSekcji(
                sekcja="fundamental",
                skladniki=(
                    SkladnikSekcji(
                        nazwa="s", wymagany=wymagany, rodzaj_danych="POLA", pola=stany[stan]
                    ),
                ),
                dowody=(f.dowod("RAPORT_BADAN", ("POWER_FLOW",)),),
                status_weryfikacji_rekordu="ZWERYFIKOWANY",
            )
        )
        skladnik = ocena.skladniki[0]
        assert (skladnik.status, skladnik.uwzgledniony) == (status, uwzgledniony), (wymagany, stan)
        if stan == "czesc":
            assert "b" in skladnik.powod_pl
        if not wymagany and stan == "czesc":
            assert "składnik opcjonalny" in skladnik.powod_pl


def test_sekcja_bez_skladnikow_jest_nieznana() -> None:
    ocena = status_sekcji(
        WejscieStatusuSekcji(sekcja="supraharmonic", status_weryfikacji_rekordu="ZWERYFIKOWANY")
    )
    assert ocena.status == "UNKNOWN"
    assert "brak danych sekcji" in ocena.powod_pl


def test_skladnik_widmowy_bez_karty_jest_nieznany() -> None:
    ocena = status_sekcji(
        WejscieStatusuSekcji(
            sekcja="harmonic",
            skladniki=(
                SkladnikSekcji(nazwa="emisja", wymagany=True, rodzaj_danych="MODELE_WIDMOWE"),
            ),
            status_weryfikacji_rekordu="REFERENCYJNY",
        )
    )
    assert ocena.status == "UNKNOWN"
    assert "karty widmowej" in ocena.powod_pl


def test_widmo_zmierzone_z_kompletem_i_podstawa_daje_measured_w_domenie() -> None:
    zmierzony = f.model_zmierzony()
    ocena = status_sekcji(
        WejscieStatusuSekcji(
            sekcja="harmonic",
            skladniki=(
                SkladnikSekcji(
                    nazwa="emisja",
                    wymagany=True,
                    rodzaj_danych="MODELE_WIDMOWE",
                    modele=(zmierzony,),
                ),
            ),
            status_weryfikacji_rekordu="REFERENCYJNY",
        )
    )
    assert ocena.status == "MEASURED"
    # MEASURED → VALIDATED_AGAINST_TEST wyłącznie w domenie punktu pomiaru.
    w_domenie = wybierz_model((zmierzony,), "HARMONIC_FREQUENCY_DOMAIN", 250.0, f.zapytanie())
    assert status_modelu_z_sekcji(ocena, wybor=w_domenie) == "VALIDATED_AGAINST_TEST"
    poza = wybierz_model((zmierzony,), "HARMONIC_FREQUENCY_DOMAIN", 9000.0, f.zapytanie())
    wynik_poza = status_modelu_z_sekcji(ocena, wybor=poza)
    assert isinstance(wynik_poza, BrakModelu) and "poza domeną" in wynik_poza.powod_pl
    bez_zapytania = status_modelu_z_sekcji(ocena)
    assert isinstance(bez_zapytania, BrakModelu)
    assert "domenie punktu pomiaru" in bez_zapytania.powod_pl


def test_widmo_zmierzone_z_podstawa_nieustalona_nie_jest_measured() -> None:
    zmierzony = f.model_zmierzony(podstawa=f.podstawa(status="NIEUSTALONE"))
    ocena = status_sekcji(
        WejscieStatusuSekcji(
            sekcja="harmonic",
            skladniki=(
                SkladnikSekcji(
                    nazwa="emisja",
                    wymagany=True,
                    rodzaj_danych="MODELE_WIDMOWE",
                    modele=(zmierzony,),
                ),
            ),
            status_weryfikacji_rekordu="ZWERYFIKOWANY",
        )
    )
    assert ocena.status == "UNVALIDATED"


def test_widmo_producenta_bez_parametrow_pomiaru_ma_sufit_i_zastrzezenie() -> None:
    """CURRENT_SPECTRUM bez pomiaru: dozwolone, ale sufit ``UNVALIDATED`` — nawet
    z uznanym certyfikatem modelu; dana przyjęta nazywa brak parametrów pomiaru."""
    ocena = status_sekcji(
        WejscieStatusuSekcji(
            sekcja="harmonic",
            skladniki=(
                SkladnikSekcji(
                    nazwa="emisja",
                    wymagany=True,
                    rodzaj_danych="MODELE_WIDMOWE",
                    modele=(f.model(),),
                ),
            ),
            dowody=(f.dowod("CERTYFIKAT_MODELU", ("HARMONIC_FREQUENCY_DOMAIN",)),),
            status_weryfikacji_rekordu="ZWERYFIKOWANY",
        )
    )
    assert ocena.status == "UNVALIDATED"
    assert "status ograniczony" in ocena.powod_pl
    assert any("parametry pomiaru nieznane" in d.powod_pl for d in ocena.dane_przyjete)


def test_harmonic_to_najslabszy_z_emisji_i_impedancji() -> None:
    emisja = SkladnikSekcji(
        nazwa="emisja", wymagany=True, rodzaj_danych="MODELE_WIDMOWE", modele=(f.model_zmierzony(),)
    )
    impedancja = SkladnikSekcji(
        nazwa="impedancja_wewnetrzna",
        wymagany=True,
        rodzaj_danych="MODELE_WIDMOWE",
        modele=(f.model_parametryczny(FieldQuality.ESTIMATED),),
    )
    ocena = status_sekcji(
        WejscieStatusuSekcji(
            sekcja="harmonic",
            skladniki=(emisja, impedancja),
            status_weryfikacji_rekordu="REFERENCYJNY",
        )
    )
    assert [s.status for s in ocena.skladniki] == ["MEASURED", "UNVALIDATED"]
    assert ocena.status == "UNVALIDATED"
    assert "impedancja_wewnetrzna" in ocena.powod_pl


# ---------------------------------------------------------------------------
# Osie i słowniki
# ---------------------------------------------------------------------------


def test_kazda_dziedzina_fizyki_ma_sekcje_modelu() -> None:
    pokryte = set().union(*DZIEDZINY_SEKCJI.values())
    assert set(WSZYSTKIE_DZIEDZINY) <= pokryte
    assert set(DZIEDZINY_SEKCJI) == set(SEKCJE)
    for sekcja in SEKCJE_DOWODOWE:
        assert DZIEDZINY_SEKCJI[sekcja] == frozenset()
    for sekcja in SEKCJE_FIZYCZNE:
        assert DZIEDZINY_SEKCJI[sekcja]


def test_dwie_osie_sa_rozlaczne() -> None:
    """Wartości sekcji ≠ wartości dziedzin (dwie osie, nie jedna — O-19 łączył je)."""
    assert not set(get_args(RodzajSekcjiModelu)) & set(WSZYSTKIE_DZIEDZINY)
    assert len(SEKCJE) == 8 and len(WSZYSTKIE_DZIEDZINY) == 6


def test_porzadek_sily_i_slownik_statusow() -> None:
    assert PORZADEK_SILY == ("UNKNOWN", "UNVALIDATED", "MEASURED", "VALIDATED", "CERTIFIED")
    assert set(get_args(StatusSekcji)) == set(PORZADEK_SILY) | {"OUTSIDE_DOMAIN"}


def test_status_weryfikacji_parytet_z_katalogiem() -> None:
    from network_model.catalog.types import CatalogVerificationStatus

    assert set(WERYFIKACJE) == {s.value for s in CatalogVerificationStatus}


def test_sekcja_dowodowa_nie_przyjmuje_skladnikow() -> None:
    with pytest.raises(ValidationError, match="nie ma składników danych"):
        WejscieStatusuSekcji(
            sekcja="certification",
            skladniki=(
                SkladnikSekcji(nazwa="x", wymagany=True, rodzaj_danych="POLA", pola=(_pole("a"),)),
            ),
            status_weryfikacji_rekordu="ZWERYFIKOWANY",
        )


def test_dowod_wymaga_pokrycia_i_normalizuje_kolejnosc() -> None:
    with pytest.raises(ValidationError, match="co najmniej jedną pokrytą dziedzinę"):
        f.dowod("RAPORT_BADAN", ())
    a = f.dowod("RAPORT_BADAN", ("SHORT_CIRCUIT", "POWER_FLOW"))
    b = f.dowod("RAPORT_BADAN", ("POWER_FLOW", "SHORT_CIRCUIT"))
    assert a.pokrywa == ("POWER_FLOW", "SHORT_CIRCUIT")
    assert a.odcisk() == b.odcisk()


def test_ocena_sekcji_nie_jest_polem_rekordu_katalogu() -> None:
    """Status wyprowadzany: ``OcenaSekcji`` jest wynikiem funkcji, nie danymi wejścia."""
    assert "status" not in WejscieStatusuSekcji.model_fields
    assert "status" in OcenaSekcji.model_fields
