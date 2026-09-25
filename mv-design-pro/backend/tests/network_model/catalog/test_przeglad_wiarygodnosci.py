"""Przeglad wiarygodnosci — regula jako ILOCZYN CECH, nie przyklad z karty.

Kazda regula klasy WIARYGODNOSC jest tu sprawdzana na TRZECH stanach pozycji:
lamie / spelnia / nie da sie policzyc. Trzeci stan jest najwazniejszy, bo to on
odroznia „zero odstepstw" od „reguly nie policzono" — a wlasnie ta roznica
gubila sie w poprzednim ksztalcie wyniku (dwustanowy `Odstepstwo | None`).
Rekordy sa SYNTETYCZNE: sprawdzamy regule, nie dane producenta.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pytest
from network_model.catalog.niezmienniki_katalogu import (
    KLASY_MIEKKIE,
    KLASY_TWARDE,
    KODY_WIARYGODNOSCI,
    POWODY_POMINIECIA,
    PREDYKATY_WIARYGODNOSCI,
    REGULY_KATALOGU,
    RODZINY_BEZ_REGUL,
    RODZINY_PRZEGLADU,
    BladRejestruNiezmiennikow,
    KlasaNiezmiennika,
    RegulaKatalogu,
    przeglad_rodziny,
    przeglad_wiarygodnosci,
)


@dataclass(frozen=True)
class _Pozycja:
    """Syntetyczna pozycja katalogu — dowolny zestaw pol przez `**kwargs`."""

    id: str

    def __init__(self, id: str, **pola: Any) -> None:  # noqa: A002
        object.__setattr__(self, "id", id)
        for nazwa, wartosc in pola.items():
            object.__setattr__(self, nazwa, wartosc)


#: kod -> (rodzina, pozycja LAMIACA, pozycja SPELNIAJACA, pozycja NIEPOLICZALNA)
ILOCZYN_CECH: dict[str, tuple[str, _Pozycja, _Pozycja, _Pozycja]] = {
    "KAT-W-001": (
        "kable-sn",
        _Pozycja("lamie", r0_ohm_per_km=0.05, r_ohm_per_km=0.2),
        _Pozycja("spelnia", r0_ohm_per_km=0.8, r_ohm_per_km=0.2),
        _Pozycja("brak-danej", r_ohm_per_km=0.2),
    ),
    "KAT-W-002": (
        "transformatory",
        _Pozycja("lamie", p0_kw=30.0, pk_kw=20.0),
        _Pozycja("spelnia", p0_kw=2.0, pk_kw=20.0),
        _Pozycja("brak-danej", pk_kw=20.0),
    ),
    "KAT-W-003": (
        "aparaty-sn",
        _Pozycja("lamie", i_th_ka=25.0, breaking_capacity_ka=20.0),
        _Pozycja("spelnia", i_th_ka=20.0, breaking_capacity_ka=25.0),
        # Odlacznik: zdolnosci wylaczania NIE MA (0 kA) — regula nie ma sensu.
        _Pozycja("odlacznik", i_th_ka=20.0, breaking_capacity_ka=0.0),
    ),
    "KAT-W-004": (
        "aparaty-nn",
        _Pozycja("lamie", icw_ka=60.0, i_cu_ka=50.0),
        _Pozycja("spelnia", icw_ka=42.0, i_cu_ka=50.0),
        _Pozycja("rozlacznik", icw_ka=None, i_cu_ka=None),
    ),
    "KAT-W-005": (
        "zrodla-systemowe",
        _Pozycja("lamie", rx_ratio=1.4),
        _Pozycja("spelnia", rx_ratio=0.1, rx_ratio_min=0.12),
        _Pozycja("brak-danej", rx_ratio=None, rx_ratio_min=None),
    ),
    "KAT-W-006": (
        "transformatory",
        _Pozycja("lamie", i0_percent=12.0, p0_kw=2.0, pk_kw=20.0),
        _Pozycja("spelnia", i0_percent=1.2, p0_kw=2.0, pk_kw=20.0),
        _Pozycja("brak-danej", p0_kw=2.0, pk_kw=20.0),
    ),
}


def test_iloczyn_cech_pokrywa_komplet_regul_wiarygodnosci() -> None:
    assert set(ILOCZYN_CECH) == set(KODY_WIARYGODNOSCI)


@pytest.mark.parametrize("kod", sorted(ILOCZYN_CECH))
def test_pozycja_lamiaca_daje_odstepstwo_z_wlasciwym_kodem(kod: str) -> None:
    rodzina, lamie, _, _ = ILOCZYN_CECH[kod]
    wynik = przeglad_rodziny(rodzina, [lamie])
    kody = [o.kod for o in wynik.odstepstwa]
    assert kod in kody, (kod, kody)
    odstepstwo = next(o for o in wynik.odstepstwa if o.kod == kod)
    assert odstepstwo.pozycja_id == lamie.id
    assert odstepstwo.opis_wartosci.strip()
    assert odstepstwo.regula == REGULY_KATALOGU[kod].nazwa


@pytest.mark.parametrize("kod", sorted(ILOCZYN_CECH))
def test_pozycja_spelniajaca_jest_POLICZONA_i_bez_odstepstwa(kod: str) -> None:
    rodzina, _, spelnia, _ = ILOCZYN_CECH[kod]
    wynik = przeglad_rodziny(rodzina, [spelnia])
    assert kod not in {o.kod for o in wynik.odstepstwa}
    pokrycie = next(p for p in wynik.pokrycie if p.kod == kod)
    assert pokrycie.policzone == 1
    assert pokrycie.pominiete == 0


@pytest.mark.parametrize("kod", sorted(ILOCZYN_CECH))
def test_pozycja_bez_danych_jest_POMINIETA_a_nie_zielona(kod: str) -> None:
    """Trzeci stan: brak danej NIE JEST zgodnoscia z regula."""
    rodzina, _, _, niepoliczalna = ILOCZYN_CECH[kod]
    wynik = przeglad_rodziny(rodzina, [niepoliczalna])
    assert kod not in {o.kod for o in wynik.odstepstwa}
    pokrycie = next(p for p in wynik.pokrycie if p.kod == kod)
    assert pokrycie.policzone == 0
    assert pokrycie.pominiete == 1
    assert pokrycie.powod_pominiecia == POWODY_POMINIECIA[kod]


def test_przeglad_nigdy_nie_podnosi_wyjatku_na_danych_smieciowych() -> None:
    """ZERO ODMOWY: wiarygodnosc raportuje, nie odrzuca — nawet dla NaN/tekstu/bool."""
    smieci = [
        _Pozycja("nan", r0_ohm_per_km=float("nan"), r_ohm_per_km=0.2),
        _Pozycja("inf", r0_ohm_per_km=float("inf"), r_ohm_per_km=float("-inf")),
        _Pozycja("tekst", r0_ohm_per_km="duzo", r_ohm_per_km="malo"),
        _Pozycja("bool", r0_ohm_per_km=True, r_ohm_per_km=False),
        _Pozycja("brak-pol"),
    ]
    wynik = przeglad_rodziny("kable-sn", smieci)
    assert wynik.liczba_pozycji == 5
    pokrycie = next(p for p in wynik.pokrycie if p.kod == "KAT-W-001")
    assert pokrycie.policzone == 0
    assert pokrycie.pominiete == 5
    assert wynik.bez_odstepstw


def test_odstepstwa_sa_posortowane_deterministycznie() -> None:
    pozycje = [
        _Pozycja("zzz", r0_ohm_per_km=0.05, r_ohm_per_km=0.2),
        _Pozycja("aaa", r0_ohm_per_km=0.05, r_ohm_per_km=0.2),
        _Pozycja("mmm", r0_ohm_per_km=0.05, r_ohm_per_km=0.2),
    ]
    wynik = przeglad_rodziny("kable-sn", pozycje)
    assert [o.pozycja_id for o in wynik.odstepstwa] == ["aaa", "mmm", "zzz"]
    assert wynik.wedlug_kodu() == {"KAT-W-001": 3}


def test_przeglad_wymaga_KOMPLETU_rodzin() -> None:
    """Rodzina pominieta dalaby raport, w ktorym brak = zero."""
    niepelne = {nazwa: [] for nazwa in sorted(RODZINY_PRZEGLADU)[:-1]}
    with pytest.raises(BladRejestruNiezmiennikow, match="brakuje"):
        przeglad_wiarygodnosci(niepelne)


def test_przeglad_odrzuca_rodzine_spoza_rejestru() -> None:
    nadmiar = {nazwa: [] for nazwa in RODZINY_PRZEGLADU}
    nadmiar["wymyslona-rodzina"] = []
    with pytest.raises(BladRejestruNiezmiennikow, match="spoza przeglądu"):
        przeglad_wiarygodnosci(nadmiar)


def test_rodzina_spoza_rejestru_w_przegladzie_pojedynczym() -> None:
    with pytest.raises(BladRejestruNiezmiennikow, match="nie jest objęta"):
        przeglad_rodziny("wymyslona-rodzina", [])


# ---------------------------------------------------------------------------
# Spojnosc REJESTRU — deklaracje z docstringow maja tu swoje testy
# ---------------------------------------------------------------------------


def test_kazda_klasa_niezmiennika_ma_przypisana_moc() -> None:
    """Suma klas twardych i miekkich musi pokryc KOMPLET klas."""
    assert KLASY_TWARDE | KLASY_MIEKKIE == set(KlasaNiezmiennika)
    assert not (KLASY_TWARDE & KLASY_MIEKKIE)


def test_kazda_regula_wiarygodnosci_ma_predykat_i_powod_pominiecia() -> None:
    assert set(PREDYKATY_WIARYGODNOSCI) == set(KODY_WIARYGODNOSCI)
    assert set(POWODY_POMINIECIA) == set(KODY_WIARYGODNOSCI)
    assert all(powod.strip() for powod in POWODY_POMINIECIA.values())


def test_kazdy_kod_rodziny_przegladu_jest_regula_wiarygodnosci() -> None:
    for specyfikacja in RODZINY_PRZEGLADU.values():
        assert specyfikacja.kody
        for kod in specyfikacja.kody:
            assert kod in KODY_WIARYGODNOSCI, (specyfikacja.rodzina, kod)


def test_rodziny_z_regulami_i_bez_regul_sa_rozlaczne() -> None:
    assert not (set(RODZINY_PRZEGLADU) & set(RODZINY_BEZ_REGUL))
    assert all(powod.strip() for powod in RODZINY_BEZ_REGUL.values())


def test_rejestr_jest_posortowany_po_kodzie() -> None:
    """Determinizm raportu: kolejnosc regul nie zalezy od kolejnosci wpisow w pliku."""
    assert list(REGULY_KATALOGU) == sorted(REGULY_KATALOGU)


def test_regula_za_mocna_wymaga_klasy_docelowej() -> None:
    """Klasa HISTORYCZNA bez mocy docelowej nie jest regula — kontrakt ma test.

    Zaden wpis NASZEGO rejestru nie ma dzis tej klasy (zadna nasza regula nie
    byla egzekwowana za mocno — pomiar karty), wiec kontrakt sprawdzamy na
    rekordzie syntetycznym. Inaczej deklaracja z docstringu bylaby obietnica
    bez testu.
    """
    with pytest.raises(BladRejestruNiezmiennikow, match="klasa_docelowa"):
        RegulaKatalogu(
            kod="KAT-W-900",
            nazwa="Reguła zdegradowana bez celu",
            klasa=KlasaNiezmiennika.REGULA_ZA_MOCNA,
            podstawa="ustalenie przeglądu",
            uzasadnienie="brak klasy docelowej",
        )
    dobra = RegulaKatalogu(
        kod="KAT-W-900",
        nazwa="Reguła zdegradowana",
        klasa=KlasaNiezmiennika.REGULA_ZA_MOCNA,
        podstawa="ustalenie przeglądu",
        uzasadnienie="zdegradowana do wiarygodności",
        klasa_docelowa=KlasaNiezmiennika.WIARYGODNOSC,
    )
    assert not dobra.twarda
    assert dobra.to_dict()["klasa_docelowa"] == "WIARYGODNOSC"


def test_klasa_docelowa_ma_sens_wylacznie_dla_reguly_za_mocnej() -> None:
    with pytest.raises(BladRejestruNiezmiennikow, match="wyłącznie dla REGULA_ZA_MOCNA"):
        RegulaKatalogu(
            kod="KAT-T-900",
            nazwa="Reguła fizyczna",
            klasa=KlasaNiezmiennika.KONIECZNOSC_FIZYCZNA,
            podstawa="definicja",
            uzasadnienie="uzasadnienie",
            klasa_docelowa=KlasaNiezmiennika.WIARYGODNOSC,
        )


def test_regula_normowa_musi_nazwac_norme() -> None:
    """Regula, ktora nie potrafi nazwac normy, nie jest regula normowa."""
    with pytest.raises(BladRejestruNiezmiennikow, match="WYMOG_NORMOWY"):
        RegulaKatalogu(
            kod="KAT-T-901",
            nazwa="Reguła bez normy",
            klasa=KlasaNiezmiennika.WYMOG_NORMOWY,
            podstawa="tak się przyjęło",
            uzasadnienie="uzasadnienie",
        )


def test_kod_musi_pasowac_do_mocy_reguly() -> None:
    with pytest.raises(BladRejestruNiezmiennikow, match="KAT-T-"):
        RegulaKatalogu(
            kod="KAT-W-902",
            nazwa="Twarda z kodem miekkim",
            klasa=KlasaNiezmiennika.KONIECZNOSC_FIZYCZNA,
            podstawa="definicja",
            uzasadnienie="uzasadnienie",
        )
    with pytest.raises(BladRejestruNiezmiennikow, match="KAT-W-"):
        RegulaKatalogu(
            kod="KAT-T-902",
            nazwa="Miękka z kodem twardym",
            klasa=KlasaNiezmiennika.WIARYGODNOSC,
            podstawa="typowa relacja",
            uzasadnienie="uzasadnienie",
        )


def test_regula_nieklasyfikowana_jest_TWARDA_ale_nie_twierdzi_o_fizyce() -> None:
    """Rozdzielenie mocy od twierdzenia — oba zdania maja test."""
    regula = RegulaKatalogu(
        kod="KAT-T-903",
        nazwa="Nowa bramka bez decyzji",
        klasa=KlasaNiezmiennika.NIESKLASYFIKOWANA,
        podstawa="brak decyzji o podstawie",
        uzasadnienie="reguła egzekwowana twardo, ale jeszcze nie nazwana",
    )
    assert regula.twarda
    assert regula.klasa is not KlasaNiezmiennika.KONIECZNOSC_FIZYCZNA
