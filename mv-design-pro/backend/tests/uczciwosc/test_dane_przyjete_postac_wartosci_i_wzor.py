"""Dana przyjęta: postać wartości i wzór zależności (karta DANE-PRZYJETE-EKRANY, recenzja).

Dwa defekty klasy, które ta karta zamyka u źródła (backend), a nie w prezentacji:

1. Wartość robocza nieskalarna (położenia przewodów linii 110 kV, typ przewodu odgromowego,
   blok parametrów dynamiki) szła jako ``wartosc=None`` — ekran pokazywał „bez wartości
   liczbowej", choć wartość ISTNIAŁA. Para danych przyjętych niesie teraz czytelną postać
   wartości (``wartosc_opis_pl``), a „bez wartości" zostaje tylko tam, gdzie jej naprawdę nie ma.
   Iloczyn cech: skalar × wektor współrzędnych × tekst (typ) × brak.
2. Uzasadnienia wartości roboczych niosły wzory jako tekst ASCII („ωμ0/(2π)·ln 1,25",
   „R′0 = 3·R′1", „S_rG = P/cos φ_rG") — kontrakt prezentacji inżynierskiej V12.7 dopuszcza
   matematykę wyłącznie z pola ``*_latex``. Zależność idzie w ``wzor_latex``, proza opisuje ją
   słownie. Przegląd CAŁEGO rejestru wartości roboczych pilnuje, żeby wzór nie wrócił do prozy.
"""

from __future__ import annotations

import dataclasses
import re
from dataclasses import dataclass
from typing import Any

import pytest
from application.dynamika.opis_wyniku import opis_wartosci_dynamiki_pl
from enm.dynamika_z_katalogu import StanDynamikiGeneratora, StanDynamikiOdbioru
from network_model.catalog.der_dynamic import list_all_profile_ids
from network_model.catalog.wartosci_robocze import (
    FAZY_SLUPA_TYPOWEGO_M,
    PARAMETR_LINII_FAZY,
    PARAMETR_LINII_ODGROMOWE,
    PARAMETR_LINII_PRZEWOD_ODGROMOWY,
    PARAMETR_LINII_REZYSTYWNOSC,
    POCHODZENIE_MOCY_Z_MOCY_POZORNEJ,
    PROPOZYCJA_TOLERANCJI_NN,
    PROPOZYCJE_LINII_WN,
    PROPOZYCJE_MASZYNY,
    RODZINA_MASZYNA_ASYNCHRONICZNA,
    RODZINA_MASZYNA_SYNCHRONICZNA,
    WZORY_ZALOZEN_KATALOGU_LATEX,
    ZALOZENIE_ITH_ZYLY_POWROTNEJ,
    ZALOZENIE_R0_TRZY_R1,
    ZALOZENIE_R0_ZYLA_POWROTNA,
    ZALOZENIE_R_ZYLY_POWROTNEJ,
    ZALOZENIE_X0_TRZY_X1,
    GeometriaProjektuLinii,
    dana_przyjeta_parametru_maszyny,
    dana_przyjeta_z0,
    dane_przyjete_linii_wn,
    nazwa_przewodu_linii_wn,
    opis_polozen_pl,
    propozycje_aparatu_sn,
    rozstrzygnij_dane_linii_wn,
    rozstrzygnij_parametry_aparatu_sn,
    rozstrzygnij_parametry_maszyny,
    wpis_parametru_maszyny,
)
from werdykt.kontrakt import DanaPrzyjeta, Wielkosc
from werdykt.proweniencja import FieldQuality
from werdykt.wyjasnienie import opis_danej

#: Wzór zapisany tekstem: litery greckie wzorów, pierwiastek, logarytm, iloczyn symboli
#: („3·R′1", „ωμ0·ln"), równanie między symbolami („R′0 = 3", „S_rG = P/…") i iloraz symboli
#: („P/cos", „I_LR/I_rM"). Jednostki („Ω·m", „Ω/km", „kA") i wartości („t_b = 0,1 s") nie są
#: wzorem — lewa strona iloczynu/ilorazu jednostki to „Ω" albo przedrostek jednostki.
WZOR_TEKSTEM = re.compile(
    r"[ωμπ√]"
    r"|\bln\b"
    r"|[A-Za-z0-9′″)]\s*·\s*[A-Za-zρηφ(]"
    r"|\b[A-Za-z][A-Za-z0-9_′″]*\s*=\s*[A-Za-z(]"
    r"|\b(?!k[AVW]\b|M[VW]|Ω)[A-Za-z][A-Za-z0-9_′″]*\s*/\s*(?!km\b|s\b|m\b)[A-Za-z]"
)


def _bez_wzoru(tekst: str) -> None:
    trafienie = WZOR_TEKSTEM.search(tekst)
    assert trafienie is None, f"wzór tekstem {trafienie.group(0)!r} w: {tekst}"


# ---------------------------------------------------------------------------
# Kontrakt pary: pola addytywne, nieobecne w zrzucie, gdy ich nie ma
# ---------------------------------------------------------------------------


def test_pola_addytywne_nie_zmieniaja_zrzutu_istniejacej_danej() -> None:
    """Dana bez postaci opisowej i bez wzoru ma zrzut identyczny z kontraktem sprzed karty —
    istniejące ładunki i odciski (SHA-256) nie zmieniają się od samego dodania pól."""
    dana = DanaPrzyjeta(
        nazwa_pl="R′0 z katalogu (odcinek A)",
        wartosc=Wielkosc(wartosc=0.3, jednostka="Ω/km"),
        powod_pl="Założenie.",
        jakosc=FieldQuality.ESTIMATED,
    )
    zrzut = dana.model_dump(mode="json")
    assert set(zrzut) == {"nazwa_pl", "wartosc", "powod_pl", "jakosc"}
    assert "wartosc_opis_pl" not in dana.model_dump_json()
    assert "wzor_latex" not in dana.model_dump_json()


def test_pola_addytywne_obecne_w_zrzucie_gdy_niesione() -> None:
    dana = DanaPrzyjeta(
        nazwa_pl="typ przewodu odgromowego (linia L1)",
        wartosc=None,
        powod_pl="Propozycja.",
        jakosc=FieldQuality.ESTIMATED,
        wartosc_opis_pl="Przewód odgromowy 95/55 mm²",
        wzor_latex=r"X'_0 = 3\,X'_1",
    )
    zrzut = dana.model_dump(mode="json")
    assert zrzut["wartosc_opis_pl"] == "Przewód odgromowy 95/55 mm²"
    assert zrzut["wzor_latex"] == r"X'_0 = 3\,X'_1"


def test_wartosc_skalarna_i_opisowa_wykluczaja_sie() -> None:
    """Jedna postać wartości: skalar ALBO opis — dwie prawdy o tej samej wartości to błąd."""
    with pytest.raises(ValueError, match="jedną postać"):
        DanaPrzyjeta(
            nazwa_pl="x",
            wartosc=Wielkosc(wartosc=1.0, jednostka="m"),
            powod_pl="p",
            jakosc=None,
            wartosc_opis_pl="1 m",
        )


# ---------------------------------------------------------------------------
# Iloczyn: skalar × wektor współrzędnych × tekst (typ) × brak
# ---------------------------------------------------------------------------


def _dane_linii_roboczej() -> dict[str, DanaPrzyjeta]:
    dane = rozstrzygnij_dane_linii_wn(GeometriaProjektuLinii())
    przyjete = dane_przyjete_linii_wn(dane, miejsce_pl="linia L1")
    parametry = [s.parametr for s in dane.robocze]
    return dict(zip(parametry, przyjete, strict=True))


def test_linia_110kv_kazda_wartosc_robocza_ma_postac_wartosci() -> None:
    dane = _dane_linii_roboczej()
    assert set(dane) == {
        PARAMETR_LINII_FAZY,
        PARAMETR_LINII_ODGROMOWE,
        PARAMETR_LINII_PRZEWOD_ODGROMOWY,
        PARAMETR_LINII_REZYSTYWNOSC,
    }
    # skalar
    rez = dane[PARAMETR_LINII_REZYSTYWNOSC]
    assert rez.wartosc == Wielkosc(wartosc=100.0, jednostka="Ω·m")
    assert rez.wartosc_opis_pl is None
    assert opis_danej(rez) == "rezystywność gruntu (linia L1) = 100 Ω·m, jakość danej: oszacowane"
    # wektor współrzędnych
    fazy = dane[PARAMETR_LINII_FAZY]
    assert fazy.wartosc is None
    assert fazy.wartosc_opis_pl == "(−3,5; 15), (3,5; 15), (−3; 19) m"
    assert fazy.wartosc_opis_pl == opis_polozen_pl(FAZY_SLUPA_TYPOWEGO_M)
    odgr = dane[PARAMETR_LINII_ODGROMOWE]
    assert odgr.wartosc_opis_pl == "(0; 23) m"
    # tekst (typ z katalogu, nie identyfikator pozycji)
    typ = dane[PARAMETR_LINII_PRZEWOD_ODGROMOWY]
    assert typ.wartosc is None
    assert typ.wartosc_opis_pl == "Przewód odgromowy 95/55 mm² (97-AL1/56-ST1A)"
    for dana in dane.values():
        assert "bez wartości" not in opis_danej(dana), opis_danej(dana)


def test_linia_110kv_postac_wartosci_z_danych_projektu_nie_ze_slupa_typowego() -> None:
    """Fazy z projektu, odgrom wyprowadzony z faz projektu — postać opisuje TĘ wartość."""
    dane = rozstrzygnij_dane_linii_wn(
        GeometriaProjektuLinii(fazy=((-4.0, 12.5), (0.0, 12.5), (4.0, 12.5)))
    )
    przyjete = {
        s.parametr: d
        for s, d in zip(dane.robocze, dane_przyjete_linii_wn(dane, miejsce_pl="L2"), strict=True)
    }
    assert PARAMETR_LINII_FAZY not in przyjete  # dana projektu nie jest daną przyjętą
    assert przyjete[PARAMETR_LINII_ODGROMOWE].wartosc_opis_pl == "(0; 16,5) m"


def test_nazwa_przewodu_spoza_katalogu_to_blad_nie_domysl() -> None:
    with pytest.raises(KeyError):
        nazwa_przewodu_linii_wn("przewod-nieistniejacy")


@pytest.mark.parametrize(
    ("wartosc", "opis", "oczekiwany"),
    [
        (Wielkosc(wartosc=100.0, jednostka="Ω·m"), None, "d = 100 Ω·m"),
        (None, "(−3,5; 15), (3,5; 15) m", "d: (−3,5; 15), (3,5; 15) m"),
        (None, "Przewód odgromowy 95/55 mm²", "d: Przewód odgromowy 95/55 mm²"),
        (None, None, "d (bez wartości liczbowej)"),
    ],
    ids=["skalar", "wektor_wspolrzednych", "tekst_typ", "brak"],
)
def test_opis_danej_iloczyn_postaci_wartosci(
    wartosc: Wielkosc | None, opis: str | None, oczekiwany: str
) -> None:
    """Opis danej w raporcie/eksporcie/dowodzie — ta sama postać co kolumna wartości ekranu."""
    dana = DanaPrzyjeta(
        nazwa_pl="d", wartosc=wartosc, powod_pl="p", jakosc=None, wartosc_opis_pl=opis
    )
    assert opis_danej(dana) == oczekiwany


def _stan(klasa: type[Any], **pola: Any) -> Any:
    wartosci: dict[str, Any] = {}
    for pole in dataclasses.fields(klasa):
        wartosci[pole.name] = pola.get(pole.name, () if "tuple" in str(pole.type) else None)
    return klasa(**wartosci)


def test_dynamika_postac_wartosci_bloku() -> None:
    """Blok dynamiki: profil katalogu (tekst) albo liczby równań odbioru; brak — tylko bez nich."""
    profil = list_all_profile_ids()[0]
    wytworca = _stan(StanDynamikiGeneratora, ref_id="g", nazwa="G", wiazanie=profil, stan="x")
    assert opis_wartosci_dynamiki_pl(wytworca).startswith("profil „")
    wytworca_bez = _stan(StanDynamikiGeneratora, ref_id="g", nazwa="G", stan="wlasny")
    assert opis_wartosci_dynamiki_pl(wytworca_bez) is None
    odbior = _stan(
        StanDynamikiOdbioru,
        ref_id="o",
        nazwa="O",
        stan="z_katalogu",
        u_min_pu=0.7,
        t_pomiaru_czestotliwosci_s=0.1,
    )
    assert (
        opis_wartosci_dynamiki_pl(odbior)
        == "napięcie przejścia 0,7 p.u., stała pomiaru częstotliwości 0,1 s"
    )
    odbior_bez = _stan(StanDynamikiOdbioru, ref_id="o", nazwa="O", stan="brak")
    assert opis_wartosci_dynamiki_pl(odbior_bez) is None


# ---------------------------------------------------------------------------
# Wzór zależności: pole LaTeX, nie proza
# ---------------------------------------------------------------------------


def test_linia_110kv_wzory_wplywu_w_latex() -> None:
    dane = _dane_linii_roboczej()
    fazy = dane[PARAMETR_LINII_FAZY].wzor_latex
    assert fazy is not None and r"\ln 1{,}25" in fazy and r"\ln 0{,}75" in fazy
    assert r"\frac{\omega \mu_0}{2\pi}" in fazy
    rez = dane[PARAMETR_LINII_REZYSTYWNOSC].wzor_latex
    assert rez is not None and r"\ln 10" in rez
    for dana in dane.values():
        _bez_wzoru(dana.powod_pl)


@pytest.mark.parametrize(
    ("zalozenie", "wzor"),
    [
        (ZALOZENIE_R0_TRZY_R1, r"R'_0 = 3\,R'_1"),
        (ZALOZENIE_X0_TRZY_X1, r"X'_0 = 3\,X'_1"),
        (ZALOZENIE_R0_ZYLA_POWROTNA, r"R'_0 = R'_1 + R'_\mathrm{p}"),
        (ZALOZENIE_R_ZYLY_POWROTNEJ, r"R'_\mathrm{p} = \frac{\rho_{20}}{S_\mathrm{p}}"),
        (
            ZALOZENIE_ITH_ZYLY_POWROTNEJ,
            r"I_\mathrm{th,p}(1\,\mathrm{s}) = j_\mathrm{th}\,S_\mathrm{p}",
        ),
    ],
)
def test_zalozenia_katalogu_wzor_w_latex_proza_bez_wzoru(zalozenie: str, wzor: str) -> None:
    dana = dana_przyjeta_z0(etykieta="R′0", zalozenie=zalozenie, wartosc=0.3, miejsce_pl="A")
    assert dana.wzor_latex == wzor
    _bez_wzoru(zalozenie)
    _bez_wzoru(dana.powod_pl)
    assert dana.powod_pl[0].isupper()


def test_zalozenie_spoza_rejestru_bez_wzoru() -> None:
    dana = dana_przyjeta_z0(etykieta="X′0", zalozenie="pomiar", wartosc=1.0, miejsce_pl="A")
    assert dana.wzor_latex is None


def test_rejestr_wzorow_zalozen_pokrywa_kazde_zalozenie_katalogu() -> None:
    """Każde założenie, które katalog zapisuje w pozycjach, ma wzór w rejestrze."""
    from network_model.catalog import wartosci_robocze as wr

    zalozenia = {v for k, v in vars(wr).items() if k.startswith("ZALOZENIE_")}
    assert zalozenia == set(WZORY_ZALOZEN_KATALOGU_LATEX)


@pytest.mark.parametrize(
    ("rodzina", "parametr", "fragment"),
    [
        (RODZINA_MASZYNA_SYNCHRONICZNA, "sn_mva", r"S_\mathrm{rG} = \frac{P}"),
        (RODZINA_MASZYNA_ASYNCHRONICZNA, "pr_mw", r"m = \frac{P_\mathrm{rM}}{p}"),
        (RODZINA_MASZYNA_ASYNCHRONICZNA, "pole_pairs", r"m = \frac{P_\mathrm{rM}}{p}"),
        (RODZINA_MASZYNA_ASYNCHRONICZNA, "cos_phi", r"\eta_\mathrm{r} \cos\varphi_\mathrm{r}"),
        (RODZINA_MASZYNA_ASYNCHRONICZNA, "efficiency", r"\eta_\mathrm{r} \cos\varphi_\mathrm{r}"),
        (RODZINA_MASZYNA_SYNCHRONICZNA, "xd_subtransient_pu", None),
        (RODZINA_MASZYNA_ASYNCHRONICZNA, "i_lr_ratio", None),
    ],
)
def test_maszyna_wzor_przechodzi_wpisem_do_danej_przyjetej(
    rodzina: Any, parametr: str, fragment: str | None
) -> None:
    """Wzór propozycji → wpis śladu biegu (JSON) → dana przyjęta wyniku: jedna droga."""
    rozstrzygniecie = rozstrzygnij_parametry_maszyny(
        rodzina, tabliczka={}, moc_czynna_punktu_pracy_mw=2.0, liczba_jednostek=1
    )[parametr]
    wpis = wpis_parametru_maszyny(rozstrzygniecie, source_id="g", source_name="G", wielkosci=())
    dana = dana_przyjeta_parametru_maszyny(wpis)
    if fragment is None:
        assert "wzor_latex" not in wpis
        assert dana.wzor_latex is None
    else:
        assert fragment in wpis["wzor_latex"]
        assert dana.wzor_latex == wpis["wzor_latex"]
    _bez_wzoru(dana.powod_pl)


@dataclass(frozen=True)
class _Karta:
    device_kind: str
    manufacturer: str | None = "Producent"
    breaking_capacity_ka: float | None = None
    i_th_ka: float | None = None
    i_th_duration_s: float | None = None
    i_dyn_ka: float | None = None
    break_time_s: float | None = None


def test_aparat_sn_wzor_pradu_szczytowego_w_latex() -> None:
    karta = _Karta(device_kind="WYLACZNIK", i_th_ka=20.0)
    i_dyn = rozstrzygnij_parametry_aparatu_sn(karta)["i_dyn_ka"]
    assert i_dyn.pochodzenie == "PROPOZYCJA"
    assert i_dyn.wzor_latex() == r"I_\mathrm{p} = 2{,}5\,I_\mathrm{k}"
    assert i_dyn.to_dict()["wzor_latex"] == r"I_\mathrm{p} = 2{,}5\,I_\mathrm{k}"


# ---------------------------------------------------------------------------
# Przegląd całej klasy: żaden tekst rejestru wartości roboczych nie niesie wzoru prozą
# ---------------------------------------------------------------------------


def _teksty_rejestru() -> list[tuple[str, str]]:
    teksty: list[tuple[str, str]] = []

    def dodaj(miejsce: str, *wartosci: str | None) -> None:
        teksty.extend((miejsce, w) for w in wartosci if w)

    for parametr, propozycja in PROPOZYCJE_LINII_WN.items():
        dodaj(f"linia:{parametr}", propozycja.uzasadnienie_pl, propozycja.wplyw_pl)
    for rodzina, propozycje in PROPOZYCJE_MASZYNY.items():
        for parametr, p in propozycje.items():
            dodaj(f"{rodzina}:{parametr}", p.odniesienie, p.uzasadnienie_pl, p.wplyw_pl)
    karty = (
        _Karta(device_kind="WYLACZNIK", breaking_capacity_ka=25.0),
        _Karta(device_kind="WYLACZNIK", i_th_ka=20.0),
        _Karta(device_kind="REKLOZER"),
        _Karta(device_kind="ODLACZNIK"),
    )
    for karta in karty:
        for p in propozycje_aparatu_sn(karta):
            dodaj(f"aparat:{karta.device_kind}:{p.parametr}", p.uzasadnienie_pl, p.wplyw_pl)
        for parametr, r in rozstrzygnij_parametry_aparatu_sn(karta).items():
            dodaj(f"aparat:{karta.device_kind}:{parametr}", r.opis_zrodla_pl(), r.powod_braku_pl)
    for rodzina in (RODZINA_MASZYNA_SYNCHRONICZNA, RODZINA_MASZYNA_ASYNCHRONICZNA):
        for moc in (2.0, 0.0):
            wynik = rozstrzygnij_parametry_maszyny(
                rodzina, tabliczka={}, moc_czynna_punktu_pracy_mw=moc, liczba_jednostek=1
            )
            for parametr, r in wynik.items():
                dodaj(f"{rodzina}:{parametr}:{moc}", r.opis_zrodla_pl(), r.powod_braku_pl)
    dodaj("nn", PROPOZYCJA_TOLERANCJI_NN.uzasadnienie_pl, PROPOZYCJA_TOLERANCJI_NN.wplyw_pl)
    dodaj("moc z mocy pozornej", POCHODZENIE_MOCY_Z_MOCY_POZORNEJ)
    for zalozenie in WZORY_ZALOZEN_KATALOGU_LATEX:
        dodaj("katalog", zalozenie)
    return teksty


def test_zaden_tekst_rejestru_wartosci_roboczych_nie_niesie_wzoru_proza() -> None:
    teksty = _teksty_rejestru()
    assert len(teksty) > 60  # przegląd obejmuje cały rejestr, nie przykład
    naruszenia = [
        (miejsce, m.group(0), tekst)
        for miejsce, tekst in teksty
        if (m := WZOR_TEKSTEM.search(tekst)) is not None
    ]
    assert naruszenia == []


@pytest.mark.parametrize(
    "tekst",
    [
        "(ωμ0/(2π)·ln 1,25 i ·ln 0,75)",
        "R′0 = 3·R′1",
        "S_rG = P/cos φ_rG",
        "stosunek I_LR/I_rM",
        "√3 razy",
    ],
)
def test_wzorzec_przegladu_lapie_wzory_sprzed_naprawy(tekst: str) -> None:
    """Strażnik przeglądu nie jest pusty: każda postać wzoru sprzed naprawy jest wykrywana."""
    assert WZOR_TEKSTEM.search(tekst) is not None


@pytest.mark.parametrize(
    "tekst",
    ["rezystywność 100 Ω·m", "0,014 Ω/km", "t_b = 0,1 s", "prąd 20 kA", "25 kA/s"],
)
def test_wzorzec_przegladu_nie_lapie_jednostek_i_wartosci(tekst: str) -> None:
    assert WZOR_TEKSTEM.search(tekst) is None
