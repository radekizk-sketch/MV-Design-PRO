"""Generator tekstu werdyktu: zdanie, przyczyna, braki, zastrzeżenia i formatowanie liczb.

Intencja: tekst werdyktu powstaje WYŁĄCZNIE z pól rekordu jednym generatorem. Testy sprawdzają
obowiązki treści z §2.1/§5 kontraktu na całym katalogu rekordów (każda relacja × każda droga do
każdego statusu, K i W), a zastrzeżenia (T6, T7, stan źródła, zakres ważności, status
nowy/istniejący modułu) na iloczynie cech pól, z których są wyprowadzane — żeby zastrzeżenie
nie mogło zniknąć dla kombinacji, której nikt nie przewidział. Liczby formatowane jednym
formatterem (przecinek, ≤ 4 cyfry znaczące, bez separatora tysięcy, typograficzny minus).
"""

from __future__ import annotations

import itertools
import math
import re

import pytest
from pydantic import ValidationError
from werdykt import (
    MetodaDowodu,
    OcenaKryterium,
    PodstawaWymagania,
    PoziomRekordu,
    Relacja,
    RodzajPodstawy,
    StanDanych,
    StanZrodla,
    StatusDanych,
    StatusModelu,
    WynikWymagania,
    format_liczba,
    format_wielkosc,
)
from werdykt.kontrakt import KOLEJNOSC_METOD, STATUSY_Z_BRAKAMI
from werdykt.proweniencja import ClaimKind, EvidenceTier, FieldQuality
from werdykt.wyjasnienie import (
    NAZWA_METODY_PL,
    NAZWA_RODZAJU_PODSTAWY_PL,
    metody_przydatne_pl,
    nazwa_skladowej,
    opis_podstawy,
)

from tests.werdykt import fabryki as f

REKORDY_K = f.rekordy_k()
REKORDY_W = f.rekordy_w()
IDENTYFIKATORY = [n for n, _ in REKORDY_K + REKORDY_W]
#: Koniec zdania: kropka na końcu tekstu albo przed odstępem i wielką literą.
_KONIEC_ZDANIA = re.compile(r"\.(?=\s+[A-ZĄĆĘŁŃÓŚŹŻ]|$)")


def _teksty(rekord: OcenaKryterium | WynikWymagania) -> list[str]:
    w = rekord.wyjasnienie
    return [w.zdanie_pl, w.przyczyna_pl or "", *w.czego_brakuje, *w.zastrzezenia]


# ---------------------------------------------------------------------------
# Formatowanie liczb
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "wartosc, znak, oczekiwany",
    [
        (0.037, True, "+0,037"),
        (89.8, False, "89,8"),
        (1800.0, False, "1800"),
        (12345.0, False, "12350"),
        (1234567.0, False, "1235000"),
        (123.45, False, "123,5"),
        (1.0005, False, "1,001"),
        (0.00012345, False, "0,0001235"),
        (1e-7, False, "0,0000001"),
        (9.99995, False, "10"),
        (0.1 + 0.2, False, "0,3"),
        (2.5, True, "+2,5"),
        (-0.2, False, "−0,2"),
        (-0.2, True, "−0,2"),
        (-27.0, True, "−27"),
        (0.0, True, "0"),
        (-0.0, False, "0"),
        (1.5e20, False, "150000000000000000000"),
    ],
)
def test_format_liczba(wartosc: float, znak: bool, oczekiwany: str) -> None:
    """Przecinek dziesiętny, ≤ 4 cyfry znaczące (zaokrąglenie połówkowe w górę), bez zer
    końcowych, bez separatora tysięcy i bez zapisu wykładniczego, minus typograficzny."""
    assert format_liczba(wartosc, znak=znak) == oczekiwany


@pytest.mark.parametrize("wartosc", [math.nan, math.inf, -math.inf])
def test_format_liczba_odrzuca_liczby_nieskonczone(wartosc: float) -> None:
    with pytest.raises(ValueError, match="nie ma zapisu"):
        format_liczba(wartosc)


@pytest.mark.parametrize(
    "wartosc, jednostka, znak, oczekiwany",
    [
        (0.037, "p.u. (U_n)", True, "+0,037 p.u. (U_n)"),
        (89.8, "%", False, "89,8 %"),
        (1800.0, "s", False, "1800 s"),
        (1.0, "1", False, "1"),
        (-0.2, "pp", True, "−0,2 pp"),
    ],
)
def test_format_wielkosc(wartosc: float, jednostka: str, znak: bool, oczekiwany: str) -> None:
    """Spacja przed jednostką; jednostka bezwymiarowa „1" nie jest dopisywana."""
    assert format_wielkosc(f.wielkosc(wartosc, jednostka), znak=znak) == oczekiwany


# ---------------------------------------------------------------------------
# Obowiązki treści na całym katalogu (T1, §2.1, §5)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("nazwa, rekord", REKORDY_K + REKORDY_W, ids=IDENTYFIKATORY)
def test_zdanie_niepuste_od_nazwy_w_jednym_do_trzech_zdan(
    nazwa: str, rekord: OcenaKryterium | WynikWymagania
) -> None:
    zdanie = rekord.wyjasnienie.zdanie_pl
    naglowek = rekord.kryterium.opis_pl if isinstance(rekord, OcenaKryterium) else rekord.nazwa_pl
    assert zdanie.startswith(naglowek)
    assert 1 <= len(_KONIEC_ZDANIA.findall(zdanie)) <= 3, zdanie


@pytest.mark.parametrize("nazwa, rekord", REKORDY_K + REKORDY_W, ids=IDENTYFIKATORY)
def test_przyczyna_i_braki_wg_statusu(nazwa: str, rekord: OcenaKryterium | WynikWymagania) -> None:
    """Przyczyna obowiązkowa poza SPELNIA (na W zawsze); braki obowiązkowe dla NIE_OCENIONO,
    BRAK_PODSTAWY, BRAK_DOWODU i NIEJEDNOZNACZNY."""
    w = rekord.wyjasnienie
    if rekord.status_maszynowy != "SPELNIA" or isinstance(rekord, WynikWymagania):
        assert w.przyczyna_pl
    else:
        assert w.przyczyna_pl is None
    if rekord.status_maszynowy in STATUSY_Z_BRAKAMI:
        assert w.czego_brakuje


@pytest.mark.parametrize("nazwa, rekord", REKORDY_K + REKORDY_W, ids=IDENTYFIKATORY)
def test_tekst_werdyktu_bez_latexu(nazwa: str, rekord: OcenaKryterium | WynikWymagania) -> None:
    """Matematyka idzie polami ``*_latex`` do renderera — tekst werdyktu nie niesie LaTeX-u."""
    for tekst in _teksty(rekord):
        assert "\\" not in tekst and "$" not in tekst, tekst


@pytest.mark.parametrize("nazwa, rekord", REKORDY_K + REKORDY_W, ids=IDENTYFIKATORY)
def test_tekst_bez_plakietek_pass_fail(nazwa: str, rekord: OcenaKryterium | WynikWymagania) -> None:
    for tekst in _teksty(rekord):
        assert re.search(r"\b(PASS|FAIL|OK|ERROR)\b", tekst) is None, tekst


# ---------------------------------------------------------------------------
# Treść poszczególnych statusów K
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("relacja", f.RELACJE_LICZBOWE)
@pytest.mark.parametrize("znak", [1.0, -1.0])
def test_werdykt_liczbowy_podaje_wynik_limit_margines_i_miejsce(
    relacja: Relacja, znak: float
) -> None:
    rekord = f.ocena(relacja, m=znak * f.KROK_MARGINESU[relacja])
    assert rekord.wynik is not None and rekord.limit is not None and rekord.margines is not None
    assert rekord.margines.wartosc is not None
    zdanie = rekord.wyjasnienie.zdanie_pl
    assert ("kryterium spełnione" if znak > 0 else "kryterium naruszone") in zdanie
    assert format_wielkosc(rekord.wynik.wartosc) in zdanie
    assert format_wielkosc(rekord.margines.wartosc, znak=True) in zdanie
    assert "pkt 7.2 „Warunki przyłączenia OSD”" in zdanie
    if rekord.wynik.chwila_s is not None:
        assert "w chwili t = 0,5 s" in zdanie
        assert "punkt przyłączenia modułu" in zdanie
    if znak < 0:
        modul = f.wielkosc(abs(rekord.margines.wartosc.wartosc), rekord.margines.wartosc.jednostka)
        assert format_wielkosc(modul) in str(rekord.wyjasnienie.przyczyna_pl)


@pytest.mark.parametrize("relacja", f.RELACJE_LICZBOWE)
def test_niejednoznaczny_podaje_margines_niepewnosc_metode_i_rozstrzygniecie(
    relacja: Relacja,
) -> None:
    rekord = f.ocena(relacja, u=f.KROK_MARGINESU[relacja])
    zdanie = rekord.wyjasnienie.zdanie_pl
    assert "wynik niejednoznaczny, wymaga weryfikacji" in zdanie
    assert "niepewność ±" in zdanie and "połowionym kroku" in zdanie
    assert "Rozstrzygnie:" in zdanie


@pytest.mark.parametrize("relacja", f.RELACJE)
def test_brak_podstawy_zaczyna_od_werdyktu_niewydanego_i_pokazuje_wynik_informacyjnie(
    relacja: Relacja,
) -> None:
    rekord = (
        f.ocena(relacja, stan_kryterium="NIEUSTALONE")
        if relacja == "LOGICZNE"
        else f.ocena(relacja, stan_limitu="NIEUSTALONE")
    )
    zdanie = rekord.wyjasnienie.zdanie_pl
    assert zdanie.startswith(
        f"{rekord.kryterium.opis_pl} ({rekord.przedmiot.nazwa_pl}) — werdykt zgodności "
        "niewydany: brak ustalonej podstawy parametru"
    )
    assert "NIEUSTALONE" in zdanie
    assert "informacyjn" in zdanie


#: Metody dopuszczalne na poziomie K (bez dowodu łączonego — metody wyłącznie poziomu W) dla
#: twierdzeń, których deklaracja nie wykazuje, i przedmiot zdania „nie wykazuje …".
METODY_K_I_PRZEDMIOT: dict[ClaimKind, tuple[tuple[str, ...], str]] = {
    ClaimKind.DYNAMIC_PERFORMANCE: (
        ("SYMULACJA", "RAPORT_Z_TESTU", "POMIAR", "CERTYFIKAT"),
        "zachowania dynamicznego",
    ),
    ClaimKind.STATIC_CALCULATION: (
        ("OBLICZENIE", "POMIAR", "RAPORT_Z_TESTU", "CERTYFIKAT"),
        "wielkości z obliczenia statycznego",
    ),
}


@pytest.mark.parametrize("twierdzenie", list(METODY_K_I_PRZEDMIOT))
@pytest.mark.parametrize("relacja", f.RELACJE)
def test_metoda_niedopuszczalna_nazywa_metode_wlasciwa_w_stalej_kolejnosci(
    relacja: Relacja, twierdzenie: ClaimKind
) -> None:
    """„ocena niewykonana: metoda … nie wykazuje <przedmiotu twierdzenia>; wartość zadeklarowana
    … pokazana informacyjnie; właściwa metoda: …" — lista metod w kolejności słownika, nie
    w kolejności iteracji zbioru, bez dowodu łączonego (niedozwolony na poziomie K)."""
    metody, przedmiot = METODY_K_I_PRZEDMIOT[twierdzenie]
    rekord = f.ocena(relacja, dowod_oceny=f.dowod(twierdzenie=twierdzenie))
    zdanie = rekord.wyjasnienie.zdanie_pl
    assert f"ocena niewykonana: metoda „deklaracja” nie wykazuje {przedmiot}" in zdanie
    assert "wartość zadeklarowana pokazana informacyjnie" in zdanie
    nazwy = [NAZWA_METODY_PL[m] for m in KOLEJNOSC_METOD if m in metody]
    assert f"właściwa metoda: {', '.join(nazwy[:-1])} albo {nazwy[-1]}." in zdanie
    assert "dowód łączony" not in zdanie
    assert "dowód łączony" not in rekord.wyjasnienie.czego_brakuje[0]


def test_brak_wyniku_nazywa_brak_i_akcje_naprawcza() -> None:
    rekord = f.ocena(jest_wynik=False, braki_dodatkowe=["bieg dynamiki RMS modułu typu B."])
    zdanie = rekord.wyjasnienie.zdanie_pl
    assert "ocena niewykonana" in zdanie and "(bieg dynamiki RMS modułu typu B)" in zdanie
    assert "Akcja naprawcza" in zdanie
    assert rekord.wyjasnienie.czego_brakuje[-1] == "bieg dynamiki RMS modułu typu B."


def test_nie_dotyczy_z_warunku_wstepnego_cytuje_warunek() -> None:
    warunek = "U_PCC(t) ≥ obwiednia w całym przedziale"
    rekord = f.ocena(
        "LOGICZNE",
        warunek_wstepny=warunek,
        stosowalnosc_oceny=f.stosowalnosc(False, warunek_wstepny_nieuruchomiony=True),
    )
    assert f"obowiązek nie został uruchomiony: {warunek}." in rekord.wyjasnienie.zdanie_pl


def test_nie_dotyczy_z_typu_nie_twierdzi_nieuruchomienia_obowiazku() -> None:
    """Kryterium z warunkiem wstępnym, niestosowalne z powodu typu modułu, nie może mówić
    o nieuruchomionym obowiązku — powód stosowalności jest inny."""
    rekord = f.ocena("LOGICZNE", warunek_wstepny="U_PCC(t) ≥ obwiednia", dotyczy=False)
    zdanie = rekord.wyjasnienie.zdanie_pl
    assert "nie dotyczy: wymaganie dotyczy modułów parku energii" in zdanie
    assert "obowiązek nie został uruchomiony" not in zdanie


@pytest.mark.parametrize("relacja", f.RELACJE)
def test_naruszenie_na_modelu_niezwalidowanym_mowi_o_walidacji(relacja: Relacja) -> None:
    rekord = f.ocena(
        relacja,
        m=-f.KROK_MARGINESU.get(relacja, 0.0),
        stan_logiczny=False,
        dowod_oceny=f.dowod_symulacji(status_modelu="UNVALIDATED_MODEL"),
        metoda_wyniku="SYMULACJA",
        u=f.NIEPEWNOSC_ROZSTRZYGALNA[relacja],
    )
    assert rekord.status_maszynowy == "NIE_SPELNIA"
    assert "wykazano na modelu bez walidacji" in rekord.wyjasnienie.zdanie_pl
    wymaganie = f.wymaganie([rekord], sposob="SYMULACJA")
    assert "wykazano na modelu bez walidacji" in wymaganie.wyjasnienie.zdanie_pl


# ---------------------------------------------------------------------------
# Zastrzeżenia — iloczyn cech pól źródłowych (T6, T7)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("stan_stosowalnosci", [None, *f.STANY_ZRODLA])
@pytest.mark.parametrize("stan_limitu", f.STANY_ZRODLA)
@pytest.mark.parametrize("stan_kryterium", f.STANY_ZRODLA)
def test_zastrzezenia_stanu_zrodla_kazdej_podstawy(
    stan_kryterium: StanZrodla, stan_limitu: StanZrodla, stan_stosowalnosci: StanZrodla | None
) -> None:
    """Podstawa kryterium × podstawa limitu × podstawa stosowalności: zastrzeżenie istnieje
    dokładnie dla każdej odrębnej podstawy o stanie ≠ ZWERYFIKOWANE (ta sama podstawa w dwóch
    polach — jedno zastrzeżenie); WSKAZANE mówi, że treść dokumentu nie jest dołączona."""
    rekord = f.ocena(
        stan_kryterium=stan_kryterium,
        stan_limitu=stan_limitu,
        stosowalnosc_oceny=f.stosowalnosc(
            podstawa_stosowalnosci=(
                None
                if stan_stosowalnosci is None
                else f.podstawa(stan_stosowalnosci, dokument="Wymogi ogólnego stosowania")
            )
        ),
        zakres_oceny=f.zakres(wykluczenia=()),
    )
    assert rekord.limit is not None
    zastrzezenia = rekord.wyjasnienie.zastrzezenia
    odrebne = {p for p in (rekord.podstawa, rekord.limit.podstawa) if p.status != "ZWERYFIKOWANE"}
    podstaw = [z for z in zastrzezenia if z.startswith("Podstawa ")]
    assert len(podstaw) == len(odrebne)
    for podstawa in odrebne:
        assert any(podstawa.dokument in z and podstawa.status in z for z in podstaw)
    for z in podstaw:
        if "stan źródła WSKAZANE" in z:
            assert "treść dokumentu nie jest dołączona do repozytorium" in z
    stosowalnosc = [z for z in zastrzezenia if z.startswith("Stosowalność wyznaczona")]
    if stan_stosowalnosci in ("WSKAZANE", "NIEUSTALONE"):
        assert len(stosowalnosc) == 1
        assert f"wg podstawy o stanie {stan_stosowalnosci}" in stosowalnosc[0]
    else:
        assert stosowalnosc == []
    if not odrebne and stan_stosowalnosci in (None, "ZWERYFIKOWANE"):
        assert zastrzezenia == ()


@pytest.mark.parametrize("stan_danych", f.STANY_DANYCH)
@pytest.mark.parametrize("model", f.STATUSY_MODELU)
@pytest.mark.parametrize("nazwa_przypadku", ["spelnia", "nie_spelnia", "niejednoznaczny"])
def test_t6_t7_zastrzezenia_modelu_i_danych_na_iloczynie(
    nazwa_przypadku: str, model: StatusModelu, stan_danych: StanDanych
) -> None:
    """Status werdyktu × status modelu × status danych: UNVALIDATED_MODEL zawsze daje
    zastrzeżenie z nazwą osi (model urządzenia), UNVALIDATED_INPUT — zastrzeżenie z wartością
    danej przyjętej; także przy kryterium naruszonym i niejednoznacznym."""
    m = {"spelnia": 2.0, "nie_spelnia": -2.0, "niejednoznaczny": 0.5}[nazwa_przypadku]
    rekord = f.ocena(
        m=m,
        dowod_oceny=f.dowod_symulacji(status_modelu=model, stan_danych=stan_danych),
        metoda_wyniku="SYMULACJA",
        u=0.5,
    )
    zastrzezenia = rekord.wyjasnienie.zastrzezenia
    modelu = [z for z in zastrzezenia if "Status modelu urządzenia: UNVALIDATED_MODEL" in z]
    assert len(modelu) == (1 if model == "UNVALIDATED_MODEL" else 0)
    danych = [z for z in zastrzezenia if "(UNVALIDATED_INPUT)" in z]
    if stan_danych == "UNVALIDATED_INPUT":
        assert len(danych) == 1
        assert "moc zwarciowa sieci S_k″ = 120 MVA" in danych[0]
        assert "jakość danej ESTIMATED" in danych[0]
        assert "założona do czasu otrzymania warunków przyłączenia" in danych[0]
    else:
        assert danych == []


@pytest.mark.parametrize("wartosc", [120.0, None])
@pytest.mark.parametrize("jakosc", [*FieldQuality, None])
def test_t7_zastrzezenie_kazdej_danej_przyjetej(
    jakosc: FieldQuality | None, wartosc: float | None
) -> None:
    dane = StatusDanych(
        stan="UNVALIDATED_INPUT",
        dane_przyjete=(
            f.dana_przyjeta(wartosc=wartosc, jakosc=jakosc),
            f.dana_przyjeta(nazwa="stosunek X/R", wartosc=8.0, jednostka="1", jakosc=None),
        ),
    )
    rekord = f.ocena(dowod_oceny=f.dowod(dane=dane))
    danych = [z for z in rekord.wyjasnienie.zastrzezenia if "(UNVALIDATED_INPUT)" in z]
    assert len(danych) == 2
    pierwsza = danych[0]
    assert ("= 120 MVA" in pierwsza) == (wartosc is not None)
    assert ("bez wartości liczbowej" in pierwsza) == (wartosc is None)
    assert (f"jakość danej {jakosc.value}" in pierwsza) if jakosc else "jakość" not in pierwsza
    assert "stosunek X/R = 8" in danych[1]


METODY_OSI: tuple[MetodaDowodu, ...] = ("SYMULACJA", "OBLICZENIE", "DEKLARACJA")


@pytest.mark.parametrize("metoda", METODY_OSI)
@pytest.mark.parametrize("poziom", list(EvidenceTier))
def test_zastrzezenie_osi_zdolnosci_narzedzia(metoda: MetodaDowodu, poziom: EvidenceTier) -> None:
    """Oś zdolności narzędzia (EvidenceTier) jest nazwana osobno od osi modelu urządzenia."""
    bieg = metoda in ("SYMULACJA", "OBLICZENIE")
    dowod_oceny = f.dowod(
        metoda=metoda,
        poziom=poziom,
        twierdzenie=ClaimKind.DECLARED_CONFIGURATION,
        status_modelu="VALIDATED_AGAINST_TEST",
        w_domenie=True if bieg else None,
        domena=f.DOMENA_WALIDACJI if bieg else None,
    )
    rekord = f.ocena(
        dowod_oceny=dowod_oceny,
        metoda_wyniku=metoda,
        u=0.5 if metoda == "SYMULACJA" else None,
    )
    osi = [z for z in rekord.wyjasnienie.zastrzezenia if "zdolności narzędzia" in z]
    oczekiwane = metoda in ("SYMULACJA", "OBLICZENIE") and poziom in (
        EvidenceTier.UNVALIDATED_MODEL,
        EvidenceTier.NOT_SIMULATED,
    )
    assert len(osi) == (1 if oczekiwane else 0)
    if oczekiwane:
        assert poziom.value in osi[0]


@pytest.mark.parametrize("typ_modulu", ["B", None])
@pytest.mark.parametrize("modul_istniejacy", [True, False, None])
def test_zastrzezenie_statusu_nowy_istniejacy(
    modul_istniejacy: bool | None, typ_modulu: str | None
) -> None:
    stosowalnosc = f.stosowalnosc(modul_istniejacy=modul_istniejacy).model_copy(
        update={"typ_modulu": typ_modulu}
    )
    rekord = f.ocena(stosowalnosc_oceny=stosowalnosc)
    zastrzezenie = [z for z in rekord.wyjasnienie.zastrzezenia if "nowy/istniejący" in z]
    assert len(zastrzezenie) == (1 if modul_istniejacy is None and typ_modulu else 0)


@pytest.mark.parametrize(
    "wykluczenia", [(), ("zwarcia niesymetryczne",), ("EMT", "harmoniczne", "zwarcia 1f")]
)
def test_zastrzezenie_zakresu_waznosci_wymienia_kazde_wykluczenie(
    wykluczenia: tuple[str, ...],
) -> None:
    rekord = f.ocena(zakres_oceny=f.zakres(wykluczenia=wykluczenia))
    zakresu = [z for z in rekord.wyjasnienie.zastrzezenia if z.startswith("Zakres ważności")]
    if not wykluczenia:
        assert zakresu == []
    else:
        assert len(zakresu) == 1
        for wykluczenie in wykluczenia:
            assert wykluczenie in zakresu[0]


def test_zastrzezenia_wymagania_suma_skladowych_bez_powtorzen_w_stalej_kolejnosci() -> None:
    a = f.ocena(kryterium_id="a", stan_limitu="WSKAZANE")
    b = f.ocena(
        "PASMO",
        kryterium_id="b",
        stan_limitu="WSKAZANE",
        dowod_oceny=f.dowod(stan_danych="UNVALIDATED_INPUT"),
    )
    rekord = f.wymaganie([a, b], stan_podstawy="WSKAZANE")
    zastrzezenia = rekord.wyjasnienie.zastrzezenia
    assert len(set(zastrzezenia)) == len(zastrzezenia)
    oczekiwana_kolejnosc = list(
        dict.fromkeys([*a.wyjasnienie.zastrzezenia, *b.wyjasnienie.zastrzezenia])
    )
    assert list(zastrzezenia[: len(oczekiwana_kolejnosc)]) == oczekiwana_kolejnosc
    assert any("Rozporządzenie Komisji (UE) 2016/631" in z for z in zastrzezenia)


# ---------------------------------------------------------------------------
# Treść rekordów W
# ---------------------------------------------------------------------------


def test_wymaganie_naruszone_mowi_nie_jest_spelnione_a_nie_niewykazane() -> None:
    zdanie = dict(REKORDY_W)["nie_spelnia"].wyjasnienie.zdanie_pl
    assert "wymaganie nie jest spełnione" in zdanie
    assert "nie zostało wykazane" not in zdanie
    assert "Pozostałe kryteria składowe" in zdanie


def test_brak_metody_nazywa_certyfikat_albo_raport_z_badania_typu() -> None:
    zdanie = dict(REKORDY_W)["brak_metody"].wyjasnienie.zdanie_pl
    assert (
        "brak metody wykazania w narzędziu; właściwa metoda: certyfikat urządzenia albo raport "
        "z badania typu" in zdanie
    )


def test_brak_dowodu_podaje_metode_wlasciwa_i_wynik_obliczeniowy() -> None:
    rekord = dict(REKORDY_W)["dowod_niepelny"]
    zdanie = rekord.wyjasnienie.zdanie_pl
    assert "Właściwa metoda:" in zdanie and "Wynik obliczeniowy składników:" in zdanie
    for powod in rekord.powody_niepelnosci:
        assert powod in str(rekord.wyjasnienie.przyczyna_pl)


def test_pokrycie_czesciowe_nazywa_pokryty_zbior() -> None:
    rekord = dict(REKORDY_W)["pokrycie_czesciowe"]
    assert "program badań pokryty częściowo" in rekord.wyjasnienie.zdanie_pl
    assert "3 głębokości zapadu" in rekord.wyjasnienie.zdanie_pl


def test_spelnia_nazywa_kryterium_najblizej_granicy_z_marginesem_wzglednym() -> None:
    rekord = dict(REKORDY_W)["spelnia"]
    najblizsza = next(o for o in rekord.oceny_skladowe if o.kryterium_id == "b")
    przyczyna = str(rekord.wyjasnienie.przyczyna_pl)
    assert nazwa_skladowej(najblizsza) in przyczyna and "względnie" in przyczyna
    assert "Kryterium najbliżej granicy" in rekord.wyjasnienie.zdanie_pl


@pytest.mark.parametrize("nazwa", ["nie_oceniono", "brak_podstawy", "niejednoznaczny"])
def test_wymaganie_cytuje_przyczyne_skladowej(nazwa: str) -> None:
    rekord = dict(REKORDY_W)[nazwa]
    skladowa = rekord.oceny_skladowe[0]
    assert str(skladowa.wyjasnienie.przyczyna_pl) in rekord.wyjasnienie.zdanie_pl
    for brak in skladowa.wyjasnienie.czego_brakuje:
        assert f"{nazwa_skladowej(skladowa)}: {brak}" in rekord.wyjasnienie.czego_brakuje


def _przydatna_w_jakiejs_konfiguracji(
    metoda: MetodaDowodu, twierdzenie: ClaimKind, poziom_rekordu: PoziomRekordu
) -> bool:
    """Czy formuła przydatności przyjmuje metodę dla rodzaju twierdzenia przy JAKIEJKOLWIEK
    konfiguracji poziomu zdolności, modelu urządzenia i domeny walidacji (dla dowodu łączonego
    na poziomie W — przy składnikach przydatnych; na poziomie K dowód łączony jest zakazany)."""
    if metoda == "DOWOD_LACZONY":
        return poziom_rekordu == "W"
    domeny: tuple[bool | None, ...] = (
        (None, True, False) if metoda in ("SYMULACJA", "OBLICZENIE") else (None,)
    )
    return any(
        f.dowod(
            metoda=metoda,
            poziom=poziom,
            twierdzenie=twierdzenie,
            status_modelu=model,
            w_domenie=w_domenie,
            domena=None if w_domenie is None else f.DOMENA_WALIDACJI,
        ).przydatnosc_dowodowa
        for poziom, model, w_domenie in itertools.product(EvidenceTier, f.STATUSY_MODELU, domeny)
    )


@pytest.mark.parametrize("poziom_rekordu", ["K", "W"])
@pytest.mark.parametrize("twierdzenie", list(ClaimKind))
def test_metody_przydatne_zgodne_z_formula_przydatnosci(
    twierdzenie: ClaimKind, poziom_rekordu: PoziomRekordu
) -> None:
    """Rodzaj twierdzenia × poziom rekordu: tekst „właściwa metoda" nazywa każdą metodę, którą
    formuła przydatności przyjmuje, i żadnej innej; symulacja i obliczenie — z warunkami
    poziomu zdolności, modelu i domeny walidacji."""
    tekst = metody_przydatne_pl(twierdzenie, poziom_rekordu)
    for metoda in KOLEJNOSC_METOD:
        nazwa = NAZWA_METODY_PL[metoda]
        assert (nazwa in tekst) == _przydatna_w_jakiejs_konfiguracji(
            metoda, twierdzenie, poziom_rekordu
        ), metoda
    if twierdzenie is ClaimKind.DYNAMIC_PERFORMANCE:
        assert "VALIDATED_SIMULATION" in tekst and "VALIDATED_AGAINST_TEST" in tekst
        assert "domenie walidacji" in tekst
    if twierdzenie is ClaimKind.STATIC_CALCULATION:
        assert "obliczenie na zdolności o poziomie VALIDATED_SIMULATION" in tekst


# ---------------------------------------------------------------------------
# Warunek wstępny z podstawą (karta A2 pkt 3)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("stosowalny", [True, False])
@pytest.mark.parametrize("stan_warunku", f.STANY_ZRODLA)
@pytest.mark.parametrize("relacja", ["LOGICZNE", "OBWIEDNIA_DOLNA"])
def test_zastrzezenie_podstawy_warunku_wstepnego(
    relacja: Relacja, stan_warunku: StanZrodla, stosowalny: bool
) -> None:
    """Relacja × stan podstawy warunku wstępnego × kryterium stosowalne / nieuruchomione:
    zastrzeżenie istnieje dokładnie dla stanu ≠ ZWERYFIKOWANE i cytuje warunek, stan
    i dokument — także przy NIE_DOTYCZY z nieuruchomionego warunku (rozstrzygnięcie, że
    obowiązek nie został uruchomiony, opiera się na tej podstawie)."""
    warunek = "U_PCC(t) ≥ obwiednia w całym przedziale"
    rekord = f.ocena(
        relacja,
        warunek_wstepny=warunek,
        stan_warunku=stan_warunku,
        stosowalnosc_oceny=(
            f.stosowalnosc()
            if stosowalny
            else f.stosowalnosc(False, warunek_wstepny_nieuruchomiony=True)
        ),
    )
    zastrzezenia = [z for z in rekord.wyjasnienie.zastrzezenia if z.startswith("Warunek wstępny")]
    if stan_warunku == "ZWERYFIKOWANE":
        assert zastrzezenia == []
        return
    assert len(zastrzezenia) == 1
    podstawa = rekord.kryterium.warunek_wstepny_podstawa
    assert podstawa is not None
    assert zastrzezenia[0].startswith(
        f"Warunek wstępny („{warunek}”) oparty na podstawie o stanie {stan_warunku}: "
    )
    assert podstawa.dokument in zastrzezenia[0]


def test_brak_warunku_wstepnego_nie_daje_zastrzezenia_warunku() -> None:
    rekord = f.ocena("LOGICZNE", stan_kryterium="WSKAZANE")
    assert not any(z.startswith("Warunek wstępny") for z in rekord.wyjasnienie.zastrzezenia)


# ---------------------------------------------------------------------------
# Rodzaj podstawy × stan źródła (w tym prawo krajowe — uzupełnienie karty A2 pkt 9)
# ---------------------------------------------------------------------------


RODZAJE_PODSTAWY: tuple[RodzajPodstawy, ...] = tuple(NAZWA_RODZAJU_PODSTAWY_PL)


def test_rodzaje_podstawy_z_prawem_krajowym_w_ustalonej_kolejnosci() -> None:
    assert RODZAJE_PODSTAWY[:4] == ("ROZPORZADZENIE_UE", "NORMA", "PRAWO_KRAJOWE", "WOS")
    assert NAZWA_RODZAJU_PODSTAWY_PL["PRAWO_KRAJOWE"] == "prawo krajowe"


@pytest.mark.parametrize("stan", f.STANY_ZRODLA)
@pytest.mark.parametrize("rodzaj", RODZAJE_PODSTAWY)
def test_rodzaj_podstawy_na_iloczynie_ze_stanem_zrodla(
    rodzaj: RodzajPodstawy, stan: StanZrodla
) -> None:
    """Każdy rodzaj podstawy × każdy stan źródła: rodzaj bez ustalonego pochodzenia ze stanem
    mocniejszym niż NIEUSTALONE jest odrzucany; każda inna para buduje podstawę, której opis
    nazywa rodzaj po polsku, a zastrzeżenie (stan ≠ ZWERYFIKOWANE) i powód niepełności
    (NIEUSTALONE) cytują ją w rekordzie kryterium logicznego."""
    pelna = stan != "NIEUSTALONE"
    dane = {
        "rodzaj": rodzaj,
        "dokument": "Rozporządzenie w sprawie szczegółowych warunków funkcjonowania systemu",
        "wydanie": "2007" if pelna else None,
        "jednostka_redakcyjna": "§ 38" if pelna else None,
        "status": stan,
    }
    if rodzaj == "NIEUSTALONA" and pelna:
        with pytest.raises(ValidationError, match="NIEUSTALONA"):
            PodstawaWymagania.model_validate(dane)
        return
    podstawa = PodstawaWymagania.model_validate(dane)
    opis = opis_podstawy(podstawa)
    assert f"({NAZWA_RODZAJU_PODSTAWY_PL[rodzaj]})" in opis
    rekord = f.ocena("LOGICZNE", podstawa_kryterium=podstawa)
    assert rekord.status_maszynowy == ("SPELNIA" if pelna else "BRAK_PODSTAWY")
    zastrzezenia = [z for z in rekord.wyjasnienie.zastrzezenia if opis in z]
    assert len(zastrzezenia) == (0 if stan == "ZWERYFIKOWANE" else 1)
    assert any(opis in p for p in rekord.powody_niepelnosci) == (not pelna)


def test_rodzaj_danych_zwalidowanych_nie_daje_zastrzezen_danych() -> None:
    rekord = f.ocena(dowod_oceny=f.dowod(stan_danych="ZWALIDOWANE"))
    assert not any("UNVALIDATED_INPUT" in z for z in rekord.wyjasnienie.zastrzezenia)
