"""Model statyczny odbiorow rdzenia dynamiki: kontrakt, charakterystyka, przejscie PQ -> Z.

Testy sa ILOCZYNEM CECH (CLAUDE.md, KLASA NIE INSTANCJA pkt 2): ksztalt charakterystyki
{stala moc, czysty Z, czysty I, mieszany ZIP} x os {P, Q} x polozenie napiecia {daleko nad
U_min, tuz nad, dokladnie U_min, tuz pod, zero} x czynnik czestotliwosciowy {1, rozny od 1
przez jawne f0 rozne od czestotliwosci ewaluacji}.

WYROCZNIA NIEZALEZNA. Wzory odbioru sa tu zapisane OD NOWA (`_s_wyrocznia`), bez importu
funkcji z `odbiory.py` — test porownuje dwie implementacje tego samego rownania, a nie
kod z samym soba.
"""

from __future__ import annotations

import cmath
import dataclasses
import math
import random

import numpy as np
import pytest
from network_model.solvers.dynamika.kontrakty import (
    KOD_ODBIOR_CZULY_CZESTOTLIWOSCIOWO,
    KOD_PARAMETRY_ODBIORU_SPRZECZNE,
    TOLERANCJA_SUMY_UDZIALOW,
    CharakterystykaOdbioru,
    OdbiorDynamiki,
    OdmowaDynamiki,
)
from network_model.solvers.dynamika.odbiory import (
    OPIS_TRYBU_ODBIORU_PL,
    TRYB_CHARAKTERYSTYKA,
    TRYB_IMPEDANCJA,
    TRYB_ODCIETY,
    TRYB_ODLACZONY,
    admitancja_rownowazna_pu,
    charakterystyka_stalej_mocy,
    charakterystyka_z_wielomianu,
    czynnik_czestotliwosci,
    jakobian_pradu_mocy,
    jakobian_pradu_pu,
    moc_charakterystyki_pu,
    moc_poboru_pu,
    prad_mocy_pu,
    prad_wstrzykiwany_pu,
    sprawdz_odbior_biegu,
    tryb_odbioru,
    w_galezi_impedancyjnej,
    wymaga_napiecia_niezerowego,
)
from network_model.solvers.power_flow_zip import ZipCoeffs, validate_zip_coeffs

U_MIN = 0.7
P0 = 0.3
Q0 = 0.1
F_N = 50.0

#: Ksztalty charakterystyki (a, b, c) wspolne dla P i Q — iloczyn cech.
KSZTALTY: dict[str, tuple[float, float, float]] = {
    "stala_moc": (0.0, 0.0, 1.0),
    "czysty_z": (1.0, 0.0, 0.0),
    "czysty_i": (0.0, 1.0, 0.0),
    "mieszany_zip": (0.5, 0.25, 0.25),
}
#: Czynnik czestotliwosciowy: (k, f0, f ewaluacji) — `rozny` daje F = 1 + 2 * (50 - 49)/49.
CZYNNIKI: dict[str, tuple[float, float | None, float | None]] = {
    "F_1": (0.0, None, None),
    "F_rozny": (2.0, 49.0, F_N),
}
V0 = 1.02


def _charakterystyka(ksztalt: str, czynnik: str, *, u_min: float | None = U_MIN):
    a, b, c = KSZTALTY[ksztalt]
    k, f0, _ = CZYNNIKI[czynnik]
    czysty_z = b == 0.0 and c == 0.0
    return charakterystyka_z_wielomianu(
        a_p=a,
        b_p=b,
        c_p=c,
        a_q=a,
        b_q=b,
        c_q=c,
        v0_pu=V0,
        k_pf=k,
        k_qf=k / 2.0,
        f0_hz=F_N if f0 is None else f0,
        u_min_pu=None if czysty_z else u_min,
    )


def _odbior(ksztalt: str, czynnik: str, **kw) -> OdbiorDynamiki:
    return OdbiorDynamiki("O", "B", P0, Q0, _charakterystyka(ksztalt, czynnik, **kw))


# ---------------------------------------------------------------------------
# Wyrocznia niezalezna (bez importu wzorow z rdzenia)
# ---------------------------------------------------------------------------


def _s_charakterystyki(ksztalt: str, czynnik: str, modul: float) -> complex:
    a, b, c = KSZTALTY[ksztalt]
    k, f0, f = CZYNNIKI[czynnik]
    fp = 1.0 if f0 is None else 1.0 + k * (f - f0) / f0
    fq = 1.0 if f0 is None else 1.0 + (k / 2.0) * (f - f0) / f0
    r = modul / V0
    w = a * r * r + b * r + c
    return complex(P0 * fp * w, Q0 * fq * w)


def _s_wyrocznia(ksztalt: str, czynnik: str, napiecie: complex) -> complex:
    """Moc POBIERANA: charakterystyka nad U_min, S(U_min)(|V|/U_min)^2 pod (albo czysty Z)."""
    modul = abs(napiecie)
    a, b, c = KSZTALTY[ksztalt]
    if b == 0.0 and c == 0.0:
        return _s_charakterystyki(ksztalt, czynnik, V0) * (modul / V0) ** 2
    if modul < U_MIN:
        return _s_charakterystyki(ksztalt, czynnik, U_MIN) * (modul / U_MIN) ** 2
    return _s_charakterystyki(ksztalt, czynnik, modul)


def _prad_wyrocznia(ksztalt: str, czynnik: str, napiecie: complex) -> complex:
    """Prad WSTRZYKIWANY; pod U_min liniowy w V (zero w zerze), nad — -conj(S)/conj(V)."""
    modul = abs(napiecie)
    a, b, c = KSZTALTY[ksztalt]
    if (b == 0.0 and c == 0.0) or modul < U_MIN:
        odniesienie = V0 if (b == 0.0 and c == 0.0) else U_MIN
        admitancja = _s_charakterystyki(ksztalt, czynnik, odniesienie).conjugate() / odniesienie**2
        return -admitancja * napiecie
    return -_s_wyrocznia(ksztalt, czynnik, napiecie).conjugate() / napiecie.conjugate()


POLOZENIA: dict[str, float] = {
    "daleko_nad": 1.05,
    "tuz_nad": U_MIN * (1.0 + 1e-3),
    "dokladnie_u_min": U_MIN,
    "tuz_pod": U_MIN * (1.0 - 1e-3),
    "zero": 0.0,
}
KAT = 0.37


def _v(modul: float) -> complex:
    return cmath.rect(modul, KAT) if modul else 0j


# ---------------------------------------------------------------------------
# Kontrakt danych (fantom / brak / poprawne) — rdzen, nie adapter
# ---------------------------------------------------------------------------


def _pola(**nadpisania):
    pola: dict[str, object] = {
        "a_p": 0.0,
        "b_p": 0.0,
        "c_p": 1.0,
        "a_q": 0.0,
        "b_q": 0.0,
        "c_q": 1.0,
        "v0_pu": None,
        "k_pf": 0.0,
        "k_qf": 0.0,
        "f0_hz": None,
        "u_min_pu": None,
    }
    pola.update(nadpisania)
    return pola


PRZYPADKI_KONTRAKTU = {
    # v0: potrzebne <=> skladowa Z albo I
    "v0_brak_przy_skladowej_z": (_pola(a_p=1.0, c_p=0.0), "v0_pu"),
    "v0_brak_przy_skladowej_i_q": (_pola(b_q=1.0, c_q=0.0, u_min_pu=0.7), "v0_pu"),
    "v0_fantom_przy_stalej_mocy": (_pola(v0_pu=1.0), "v0_pu"),
    "v0_niedodatnie": (_pola(a_p=1.0, c_p=0.0, v0_pu=0.0), "v0_pu"),
    # f0: potrzebne <=> k != 0
    "f0_brak_przy_k_pf": (_pola(k_pf=1.0), "f0_hz"),
    "f0_brak_przy_k_qf": (_pola(k_qf=-1.0), "f0_hz"),
    "f0_fantom_bez_k": (_pola(f0_hz=50.0), "f0_hz"),
    "f0_niedodatnie": (_pola(k_pf=1.0, f0_hz=0.0), "f0_hz"),
    # u_min: fantom przy czystej impedancji, zakres (0, 1)
    "u_min_fantom_przy_czystym_z": (
        _pola(a_p=1.0, c_p=0.0, a_q=1.0, c_q=0.0, v0_pu=1.0, u_min_pu=0.7),
        "u_min_pu",
    ),
    "u_min_zero": (_pola(u_min_pu=0.0), "u_min_pu"),
    "u_min_jeden": (_pola(u_min_pu=1.0), "u_min_pu"),
    # udzialy
    "udzial_ujemny": (_pola(a_p=-0.1, c_p=1.1, v0_pu=1.0), None),
    "udzial_ponad_jeden": (_pola(c_q=1.5, b_q=-0.5, v0_pu=1.0), None),
    "suma_rozna_od_jedynki": (_pola(c_p=0.9), None),
    "nieskonczonosc": (_pola(k_pf=math.inf, f0_hz=50.0), "k_pf"),
    "nan": (_pola(c_q=math.nan), "c_q"),
    "logiczna_zamiast_liczby": (_pola(c_p=True), "c_p"),
}


@pytest.mark.parametrize("nazwa", sorted(PRZYPADKI_KONTRAKTU))
def test_kontrakt_charakterystyki_odmawia_fantomu_braku_i_sprzecznosci(nazwa: str) -> None:
    pola, pole = PRZYPADKI_KONTRAKTU[nazwa]
    with pytest.raises(OdmowaDynamiki) as blad:
        CharakterystykaOdbioru(**pola)
    assert blad.value.kod == KOD_PARAMETRY_ODBIORU_SPRZECZNE
    if pole is not None:
        assert blad.value.szczegoly.get("pole") == pole


@pytest.mark.parametrize(
    "pola",
    [
        _pola(),
        _pola(u_min_pu=0.7),
        _pola(a_p=1.0, c_p=0.0, a_q=1.0, c_q=0.0, v0_pu=1.05),
        _pola(a_p=0.2, b_p=0.3, c_p=0.5, v0_pu=1.0, u_min_pu=0.5),
        _pola(k_pf=2.0, k_qf=-1.0, f0_hz=60.0, u_min_pu=0.6),
        _pola(a_q=1.0, c_q=0.0, v0_pu=1.0, u_min_pu=0.8),
    ],
)
def test_kontrakt_przyjmuje_kazdy_poprawny_ksztalt(pola: dict) -> None:
    CharakterystykaOdbioru(**pola)


def test_kontrakt_bez_zadnej_domyslki() -> None:
    """Zero domyslek (straz `dynamika_zero_default_guard`) — takze po stronie odbioru."""
    for klasa in (CharakterystykaOdbioru, OdbiorDynamiki):
        for pole in dataclasses.fields(klasa):
            assert pole.default is dataclasses.MISSING, (klasa.__name__, pole.name)
            assert pole.default_factory is dataclasses.MISSING, (klasa.__name__, pole.name)


@pytest.mark.parametrize(
    ("p_pu", "odmowa"),
    [(-1e-9, True), (-0.3, True), (math.nan, True), (math.inf, True), (0.0, False), (0.4, False)],
)
def test_moc_czynna_bazowa_ujemna_albo_nieskonczona_jest_odmowa(p_pu: float, odmowa: bool) -> None:
    charakterystyka = charakterystyka_stalej_mocy(u_min_pu=None)
    if odmowa:
        with pytest.raises(OdmowaDynamiki) as blad:
            OdbiorDynamiki("O", "B", p_pu, 0.1, charakterystyka)
        assert blad.value.kod == KOD_PARAMETRY_ODBIORU_SPRZECZNE
    else:
        OdbiorDynamiki("O", "B", p_pu, -0.2, charakterystyka)


@pytest.mark.parametrize(
    "udzialy",
    [
        (0.0, 0.0, 1.0),
        (1.0, 0.0, 0.0),
        (0.5, 0.25, 0.25),
        (0.3, 0.3, 0.4 + 0.9e-6),
        (0.3, 0.3, 0.4 + 1.1e-6),
        (0.3, 0.3, 0.4 - 1.1e-6),
        (-1e-12, 0.5, 0.5 + 1e-12),
        (1.0 + 1e-12, 0.0, -1e-12),
        (0.4, 0.3, 0.4),
    ],
)
def test_regula_wielomianu_rdzenia_jest_regula_rozplywu(udzialy: tuple) -> None:
    """Parytet regul PARAMI: wielomian przyjety przez rozplyw <=> przyjety przez rdzen.

    Rdzen nie importuje rozpływu (granica B-01), wiec zgodnosc dwoch zapisow tej samej
    reguly (zakres [0, 1], suma 1 z tolerancja) jest przypieta tym testem.
    """
    a, b, c = udzialy
    try:
        validate_zip_coeffs(ZipCoeffs(a, b, c, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 50.0))
        rozplyw = True
    except ValueError:
        rozplyw = False
    try:
        v0 = None if a == 0.0 and b == 0.0 else 1.0
        CharakterystykaOdbioru(a, b, c, 0.0, 0.0, 1.0, v0, 0.0, 0.0, None, 0.5)
        rdzen = True
    except OdmowaDynamiki:
        rdzen = False
    assert rozplyw == rdzen
    assert TOLERANCJA_SUMY_UDZIALOW == 1.0e-6


@pytest.mark.parametrize("ksztalt", sorted(KSZTALTY))
@pytest.mark.parametrize("czynnik", sorted(CZYNNIKI))
def test_budowa_z_wielomianu_zeruje_pola_bez_znaczenia(ksztalt: str, czynnik: str) -> None:
    """Regula „pole nieuzywane = None" zyje w RDZENIU (adapter podaje komplet z rozpływu)."""
    charakterystyka = _charakterystyka(ksztalt, czynnik)
    a, b, _c = KSZTALTY[ksztalt]
    assert (charakterystyka.v0_pu is None) == (a == 0.0 and b == 0.0)
    assert (charakterystyka.f0_hz is None) == (czynnik == "F_1")


# ---------------------------------------------------------------------------
# Fizyka: iloczyn ksztalt x polozenie x czynnik
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("ksztalt", sorted(KSZTALTY))
@pytest.mark.parametrize("polozenie", sorted(POLOZENIA))
@pytest.mark.parametrize("czynnik", sorted(CZYNNIKI))
def test_moc_i_prad_wobec_wyroczni(ksztalt: str, polozenie: str, czynnik: str) -> None:
    odbior = _odbior(ksztalt, czynnik)
    napiecie = _v(POLOZENIA[polozenie])
    f = CZYNNIKI[czynnik][2]
    moc = moc_poboru_pu(odbior, napiecie, f)
    prad = prad_wstrzykiwany_pu(odbior, napiecie, f)
    wyrocznia_mocy = _s_wyrocznia(ksztalt, czynnik, napiecie)
    wyrocznia_pradu = _prad_wyrocznia(ksztalt, czynnik, napiecie)
    skala = abs(complex(P0, Q0))
    assert abs(moc - wyrocznia_mocy) <= 1e-12 * skala
    assert abs(prad - wyrocznia_pradu) <= 1e-12 * skala
    if polozenie == "zero":
        # V = 0 BEZ dzielenia przez napiecie: prad i moc sa zerem DOKLADNIE.
        assert prad == 0 and moc == 0
    else:
        # Tozsamosc mocy i pradu: S = V conj(I_pobierany) (jedna galaz dla obu).
        assert abs(napiecie * (-prad).conjugate() - moc) <= 1e-12 * skala


@pytest.mark.parametrize("ksztalt", sorted(KSZTALTY))
@pytest.mark.parametrize("polozenie", ["daleko_nad", "tuz_nad", "tuz_pod", "zero"])
@pytest.mark.parametrize("czynnik", sorted(CZYNNIKI))
def test_jakobian_analityczny_wobec_roznicy_centralnej(
    ksztalt: str, polozenie: str, czynnik: str
) -> None:
    """Jakobian w kazdej galezi i w zerze wobec roznicy centralnej (mutacja: brak dS/d|V|).

    `dokladnie_u_min` jest tu swiadomie pominiete: w U_min pochodna ma ZALAMANIE (cecha
    modelu) i roznica centralna przecina dwie galezie — jakobian jest tam jednostronny.
    """
    odbior = _odbior(ksztalt, czynnik)
    napiecie = _v(POLOZENIA[polozenie])
    f = CZYNNIKI[czynnik][2]
    analityczny = jakobian_pradu_pu(odbior, napiecie, f)
    krok = 1e-7
    for os in (0, 1):
        delta = complex(krok, 0.0) if os == 0 else complex(0.0, krok)
        w_gore = _prad_wyrocznia(ksztalt, czynnik, napiecie + delta)
        w_dol = _prad_wyrocznia(ksztalt, czynnik, napiecie - delta)
        numeryczny = np.array([(w_gore - w_dol).real, (w_gore - w_dol).imag]) / (2 * krok)
        assert np.allclose(analityczny[:, os], numeryczny, rtol=1e-6, atol=1e-7)


@pytest.mark.parametrize("ksztalt", ["stala_moc", "czysty_i", "mieszany_zip"])
@pytest.mark.parametrize("czynnik", sorted(CZYNNIKI))
def test_ciaglosc_mocy_i_pradu_w_napieciu_przejscia(ksztalt: str, czynnik: str) -> None:
    """Ciaglosc w U_min Z KONSTRUKCJI — ta sama S(U_min) po obu stronach (mutacja: S(v0))."""
    odbior = _odbior(ksztalt, czynnik)
    f = CZYNNIKI[czynnik][2]
    # Os rzeczywista: modul DOKLADNIE U_min (fazor obrocony moglby zaokraglic sie w dol).
    nad = complex(U_MIN, 0.0)
    pod = complex(math.nextafter(U_MIN, 0.0), 0.0)
    assert tryb_odbioru(odbior, nad) == TRYB_CHARAKTERYSTYKA
    assert tryb_odbioru(odbior, pod) == TRYB_IMPEDANCJA
    skala = abs(complex(P0, Q0))
    assert abs(moc_poboru_pu(odbior, nad, f) - moc_poboru_pu(odbior, pod, f)) <= 1e-12 * skala
    assert (
        abs(prad_wstrzykiwany_pu(odbior, nad, f) - prad_wstrzykiwany_pu(odbior, pod, f))
        <= 1e-12 * skala
    )


@pytest.mark.parametrize("ksztalt", ["stala_moc", "czysty_i", "mieszany_zip"])
def test_galaz_impedancyjna_niesie_moc_bierna_i_czynnik_czestotliwosci(ksztalt: str) -> None:
    """Pod U_min: Q0 != 0 idzie z WLASCIWYM znakiem (sprzezenie), a czynnik F skaluje galaz
    impedancyjna tak samo jak charakterystyke (mutacje: Y bez sprzezenia, F tylko nad U_min).
    """
    odbior_f = _odbior(ksztalt, "F_rozny")
    odbior_1 = _odbior(ksztalt, "F_1")
    napiecie = _v(0.4)
    moc_f = moc_poboru_pu(odbior_f, napiecie, F_N)
    moc_1 = moc_poboru_pu(odbior_1, napiecie, None)
    fp = 1.0 + 2.0 * (F_N - 49.0) / 49.0
    fq = 1.0 + 1.0 * (F_N - 49.0) / 49.0
    assert moc_f.real == pytest.approx(fp * moc_1.real, rel=1e-13)
    assert moc_f.imag == pytest.approx(fq * moc_1.imag, rel=1e-13)
    assert moc_1.imag > 0.0  # odbior indukcyjny pobiera moc bierna takze pod U_min
    admitancja = admitancja_rownowazna_pu(odbior_1, None)
    assert admitancja is not None and admitancja.imag < 0.0


@pytest.mark.parametrize("ksztalt", ["czysty_i", "mieszany_zip", "stala_moc"])
def test_zero_napiecia_bez_odmowy_przy_skladowej_stalopradowej(ksztalt: str) -> None:
    """Skladowa stalopradowa PRZECHODZI w impedancje razem ze stalomocowa (mutacja: tylko c)."""
    odbior = _odbior(ksztalt, "F_1")
    assert prad_wstrzykiwany_pu(odbior, 0j) == 0j
    jakobian = jakobian_pradu_pu(odbior, 0j)
    assert np.all(np.isfinite(jakobian))
    assert not wymaga_napiecia_niezerowego(odbior)


def test_czysta_impedancja_rowna_odsprzegowi() -> None:
    """Odbior czysto impedancyjny = odsprzeg `g = P0/v0^2`, `b = -Q0/v0^2` (<= 1e-12)."""
    odbior = _odbior("czysty_z", "F_1")
    g = P0 / V0**2
    b = -Q0 / V0**2
    for modul in (0.0, 0.1, 0.5, 1.0, 1.3):
        napiecie = _v(modul)
        prad = prad_wstrzykiwany_pu(odbior, napiecie)
        assert abs(prad - (-(complex(g, b)) * napiecie)) <= 1e-12 * abs(complex(P0, Q0))
        assert tryb_odbioru(odbior, napiecie) == TRYB_CHARAKTERYSTYKA


def test_stala_moc_przez_wzor_ogolny_jest_bitowo_dawnym_wzorem() -> None:
    """Parytet bitowy (sonda S5 karty): stala moc z U_min ponizej |V| = dawny prad i jakobian."""
    los = random.Random(20260925)
    for _ in range(20000):
        p = los.uniform(0.0, 2.0)
        q = los.uniform(-2.0, 2.0)
        modul = los.uniform(0.3, 1.4)
        napiecie = cmath.rect(modul, los.uniform(-math.pi, math.pi))
        u_min = los.choice((None, los.uniform(0.01, 0.29)))
        odbior = OdbiorDynamiki("O", "B", p, q, charakterystyka_stalej_mocy(u_min_pu=u_min))
        dawny_prad = -complex(p, q).conjugate() / napiecie.conjugate()
        assert prad_wstrzykiwany_pu(odbior, napiecie) == dawny_prad
        assert moc_poboru_pu(odbior, napiecie) == complex(p, q)
        assert np.array_equal(
            jakobian_pradu_pu(odbior, napiecie), jakobian_pradu_mocy(p, q, napiecie)
        )
        assert prad_mocy_pu(p, q, napiecie) == dawny_prad


def test_jeden_predykat_galezi_dla_pradu_mocy_i_trybu() -> None:
    """Predykaty PARAMI: kod trybu 1 <=> prad liczony liniowo w V (galaz impedancyjna)."""
    los = random.Random(7)
    for ksztalt in ("stala_moc", "czysty_i", "mieszany_zip"):
        odbior = _odbior(ksztalt, "F_1")
        admitancja = admitancja_rownowazna_pu(odbior, None)
        assert admitancja is not None
        for _ in range(500):
            napiecie = cmath.rect(los.uniform(0.0, 1.2), los.uniform(-3, 3))
            liniowy = prad_wstrzykiwany_pu(odbior, napiecie) == -admitancja * napiecie
            impedancyjna = tryb_odbioru(odbior, napiecie) == TRYB_IMPEDANCJA
            assert impedancyjna == w_galezi_impedancyjnej(odbior.charakterystyka, abs(napiecie))
            if impedancyjna:
                assert liniowy


@pytest.mark.parametrize("zadeklarowane", [True, False])
@pytest.mark.parametrize("ksztalt", sorted(KSZTALTY))
@pytest.mark.parametrize("moc_zerowa", [True, False])
def test_wymaga_napiecia_niezerowego_iloczyn(
    zadeklarowane: bool, ksztalt: str, moc_zerowa: bool
) -> None:
    """Prad nie istnieje w V = 0 WYLACZNIE dla odbioru bez U_min, nie-impedancyjnego, z moca."""
    charakterystyka = _charakterystyka(ksztalt, "F_1", u_min=U_MIN if zadeklarowane else None)
    p, q = (0.0, 0.0) if moc_zerowa else (P0, Q0)
    odbior = OdbiorDynamiki("O", "B", p, q, charakterystyka)
    oczekiwane = (not zadeklarowane) and ksztalt != "czysty_z" and not moc_zerowa
    assert wymaga_napiecia_niezerowego(odbior) == oczekiwane
    if not oczekiwane:
        assert prad_wstrzykiwany_pu(odbior, 0j) == 0j
        assert moc_poboru_pu(odbior, 0j) == 0j


def test_odbior_czuly_czestotliwosciowo_jest_odmowa_biegu() -> None:
    """Bez modelu czestotliwosci widzianej przez odbior bieg z k != 0 bylby zly — odmowa."""
    sprawdz_odbior_biegu(_odbior("mieszany_zip", "F_1"))
    with pytest.raises(OdmowaDynamiki) as blad:
        sprawdz_odbior_biegu(_odbior("mieszany_zip", "F_rozny"))
    assert blad.value.kod == KOD_ODBIOR_CZULY_CZESTOTLIWOSCIOWO
    # Funkcja biegu (f = None) tez nie liczy po cichu czynnika dla k != 0.
    with pytest.raises(OdmowaDynamiki) as blad_czynnika:
        moc_charakterystyki_pu(_odbior("mieszany_zip", "F_rozny"), 1.0, None)
    assert blad_czynnika.value.kod == KOD_ODBIOR_CZULY_CZESTOTLIWOSCIOWO


def test_czynnik_czestotliwosci_jest_dokladnie_jeden_bez_czulosci() -> None:
    assert czynnik_czestotliwosci(0.0, None, None) == 1.0
    assert czynnik_czestotliwosci(0.0, None, 49.0) == 1.0
    assert czynnik_czestotliwosci(2.0, 50.0, 50.0) == 1.0
    assert czynnik_czestotliwosci(2.0, 50.0, 49.0) == pytest.approx(1.0 - 2.0 / 50.0, rel=1e-15)


def test_slownik_trybow_jest_zamkniety() -> None:
    assert sorted(OPIS_TRYBU_ODBIORU_PL) == [
        TRYB_CHARAKTERYSTYKA,
        TRYB_IMPEDANCJA,
        TRYB_ODLACZONY,
        TRYB_ODCIETY,
    ]
    assert (TRYB_CHARAKTERYSTYKA, TRYB_IMPEDANCJA, TRYB_ODLACZONY, TRYB_ODCIETY) == (
        0.0,
        1.0,
        2.0,
        3.0,
    )
