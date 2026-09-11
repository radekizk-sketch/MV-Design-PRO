"""Przeliczanie baz p.u. — pełna zależność, nie tylko stosunek mocy.

PO CO TEN PLIK. ``BazyMocy.impedancja_na_baze_sieci`` liczyła
``Z_s = Z_u * S_s/S_u``. Jest to prawdziwe WYŁĄCZNIE przy zgodnych bazach
napięciowych, a założenie nie było ani zapisane, ani przetestowane. Pełna
zależność:

    Z_s = Z_u * (S_s/S_u) * (V_u/V_s)^2

Dla typowej pary „generator 15,75 kV na szynie o bazie 15 kV" pominięty człon
wynosi ``(15,75/15)^2 = 1,1025`` — 10,25 % błędu reaktancji, przenoszące się
wprost na prąd zwarciowy i na moduł elektromechaniczny.

Brakowało też przeliczeń dla tłumienia ``D`` i limitów prądowych. Prąd, w
odróżnieniu od mocy i bezwładności, ZALEŻY od bazy napięcia
(``I_b = S_b / (sqrt(3) * V_b)``), więc limit prądu falownika przeliczony samym
stosunkiem mocy jest błędny dokładnie o ``V_s/V_u``.
"""

from __future__ import annotations

import pytest
from dynamic_lab.konwencje import BazyMocy
from dynamic_lab.urzadzenia import MaszynaSynchroniczna4Rzedu

S_SIECI = 100.0
S_URZ = 50.0


# ---------------------------------------------------------------------------
# 1. Ta sama baza napięcia
# ---------------------------------------------------------------------------


def test_ta_sama_baza_napiecia_daje_czysty_stosunek_mocy() -> None:
    bazy = BazyMocy.zgodne_napieciowo(S_SIECI, S_URZ, v_bazowa_kv=15.0)
    assert bazy.zgodne_bazy_napiecia is True
    assert bazy.stosunek_napiec == pytest.approx(1.0)
    assert bazy.wspolczynnik_impedancji == pytest.approx(2.0)
    assert bazy.impedancja_na_baze_sieci(0.2) == pytest.approx(0.4)
    assert bazy.moc_na_baze_sieci(1.0) == pytest.approx(0.5)
    assert bazy.bezwladnosc_na_baze_sieci(4.0) == pytest.approx(2.0)
    assert bazy.tlumienie_na_baze_sieci(2.0) == pytest.approx(1.0)
    assert bazy.prad_na_baze_sieci(1.1) == pytest.approx(0.55)
    assert bazy.napiecie_na_baze_sieci(1.02) == pytest.approx(1.02)


def test_konstruktor_jawny_ze_zgodnymi_napieciami_daje_to_samo() -> None:
    """„Zgodne bazy" mają być NAZWANE, ale nie mogą być osobną fizyką."""
    nazwany = BazyMocy.zgodne_napieciowo(S_SIECI, S_URZ, v_bazowa_kv=15.0)
    jawny = BazyMocy(S_SIECI, S_URZ, v_bazowa_sieci_kv=15.0, v_bazowa_urzadzenia_kv=15.0)
    assert nazwany == jawny


# ---------------------------------------------------------------------------
# 2. Różna baza napięcia — człon, którego brakowało
# ---------------------------------------------------------------------------


def test_rozna_baza_napiecia_wnosi_kwadrat_stosunku_napiec() -> None:
    bazy = BazyMocy(S_SIECI, S_URZ, v_bazowa_sieci_kv=15.0, v_bazowa_urzadzenia_kv=15.75)
    assert bazy.zgodne_bazy_napiecia is False
    assert bazy.stosunek_napiec == pytest.approx(15.75 / 15.0)
    assert bazy.wspolczynnik_impedancji == pytest.approx(2.0 * (15.75 / 15.0) ** 2)
    assert bazy.impedancja_na_baze_sieci(0.2) == pytest.approx(0.441)


def test_pominiecie_czlonu_napieciowego_to_zmierzone_dziesiec_procent_bledu() -> None:
    """Dokumentacja defektu: różnica między starym a poprawnym wzorem."""
    bazy = BazyMocy(S_SIECI, S_URZ, v_bazowa_sieci_kv=15.0, v_bazowa_urzadzenia_kv=15.75)
    stare = 0.2 * bazy.stosunek_mocy
    poprawne = bazy.impedancja_na_baze_sieci(0.2)
    assert poprawne / stare == pytest.approx(1.1025)


@pytest.mark.parametrize(
    ("v_sieci", "v_urzadzenia"),
    [(15.0, 15.75), (110.0, 115.0), (0.4, 0.69), (15.0, 15.0)],
)
def test_wielkosci_niezalezne_od_napiecia_NIE_zmieniaja_sie_z_baza_napiecia(
    v_sieci: float, v_urzadzenia: float
) -> None:
    """Iloczyn cech: {moc, bezwładność, tłumienie} × {zgodne, różne bazy napięcia}.

    Gdyby ktoś „dla spójności" dorzucił człon napięciowy także tutaj, ten test
    zapali — wyprowadzenie wymiarowe mówi, że moc, ``H`` i ``D`` od bazy napięcia
    NIE zależą.
    """
    bazy = BazyMocy(S_SIECI, S_URZ, v_bazowa_sieci_kv=v_sieci, v_bazowa_urzadzenia_kv=v_urzadzenia)
    odniesienie = BazyMocy.zgodne_napieciowo(S_SIECI, S_URZ, v_bazowa_kv=v_sieci)
    assert bazy.moc_na_baze_sieci(0.8) == pytest.approx(odniesienie.moc_na_baze_sieci(0.8))
    assert bazy.bezwladnosc_na_baze_sieci(4.0) == pytest.approx(
        odniesienie.bezwladnosc_na_baze_sieci(4.0)
    )
    assert bazy.tlumienie_na_baze_sieci(2.0) == pytest.approx(
        odniesienie.tlumienie_na_baze_sieci(2.0)
    )


def test_limit_pradu_zalezy_od_bazy_napiecia() -> None:
    """``I_b = S_b/(sqrt(3)*V_b)``, więc prąd MUSI nieść człon ``V_s/V_u``."""
    bazy = BazyMocy(S_SIECI, S_URZ, v_bazowa_sieci_kv=15.0, v_bazowa_urzadzenia_kv=15.75)
    tylko_moc = 1.1 / bazy.stosunek_mocy
    assert bazy.prad_na_baze_sieci(1.1) == pytest.approx(tylko_moc * (15.0 / 15.75))
    assert bazy.prad_na_baze_sieci(1.1) != pytest.approx(tylko_moc)


# ---------------------------------------------------------------------------
# 3. Bazy zgodne ze stroną transformatora
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("strona_kv", "v_urzadzenia_kv", "z_urzadzenia"),
    [(110.0, 110.0, 0.12), (15.0, 15.75, 0.20), (15.0, 6.3, 0.18)],
)
def test_bazy_po_stronie_transformatora(
    strona_kv: float, v_urzadzenia_kv: float, z_urzadzenia: float
) -> None:
    """Baza napięcia szyny jest napięciem STRONY, na której urządzenie stoi.

    Przeliczenie musi używać napięcia tej strony, a nie drugiego uzwojenia —
    pomyłka o przekładnię daje błąd rzędu ``(110/15)^2 = 53,8``.
    """
    bazy = BazyMocy(
        S_SIECI, S_URZ, v_bazowa_sieci_kv=strona_kv, v_bazowa_urzadzenia_kv=v_urzadzenia_kv
    )
    oczekiwane = z_urzadzenia * (S_SIECI / S_URZ) * (v_urzadzenia_kv / strona_kv) ** 2
    assert bazy.impedancja_na_baze_sieci(z_urzadzenia) == pytest.approx(oczekiwane)


def test_pomylka_strony_transformatora_daje_blad_rzedu_kwadratu_przekladni() -> None:
    dobra = BazyMocy(S_SIECI, S_URZ, v_bazowa_sieci_kv=15.0, v_bazowa_urzadzenia_kv=15.0)
    zla = BazyMocy(S_SIECI, S_URZ, v_bazowa_sieci_kv=15.0, v_bazowa_urzadzenia_kv=110.0)
    assert zla.impedancja_na_baze_sieci(0.2) / dobra.impedancja_na_baze_sieci(0.2) == pytest.approx(
        (110.0 / 15.0) ** 2
    )


# ---------------------------------------------------------------------------
# 4. Spójność wymiarowa całego zestawu
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("s_sieci", "s_urz", "v_sieci", "v_urz"),
    [(100.0, 50.0, 15.0, 15.75), (250.0, 2.5, 110.0, 10.5), (10.0, 40.0, 0.4, 0.4)],
)
def test_S_rowna_sie_V_razy_I_po_przeliczeniu(
    s_sieci: float, s_urz: float, v_sieci: float, v_urz: float
) -> None:
    """``S_pu = V_pu * I_pu`` musi zachodzić po obu stronach przeliczenia."""
    bazy = BazyMocy(s_sieci, s_urz, v_bazowa_sieci_kv=v_sieci, v_bazowa_urzadzenia_kv=v_urz)
    v_u, i_u = 1.02, 0.85
    s_u = v_u * i_u
    assert bazy.moc_na_baze_sieci(s_u) == pytest.approx(
        bazy.napiecie_na_baze_sieci(v_u) * bazy.prad_na_baze_sieci(i_u)
    )


@pytest.mark.parametrize(
    ("s_sieci", "s_urz", "v_sieci", "v_urz"),
    [(100.0, 50.0, 15.0, 15.75), (250.0, 2.5, 110.0, 10.5), (10.0, 40.0, 0.4, 0.4)],
)
def test_Z_rowna_sie_V_przez_I_po_przeliczeniu(
    s_sieci: float, s_urz: float, v_sieci: float, v_urz: float
) -> None:
    """``Z_pu = V_pu / I_pu`` — druga niezależna kontrola tego samego zestawu."""
    bazy = BazyMocy(s_sieci, s_urz, v_bazowa_sieci_kv=v_sieci, v_bazowa_urzadzenia_kv=v_urz)
    v_u, i_u = 1.02, 0.85
    assert bazy.impedancja_na_baze_sieci(v_u / i_u) == pytest.approx(
        bazy.napiecie_na_baze_sieci(v_u) / bazy.prad_na_baze_sieci(i_u)
    )


def test_admitancja_jest_odwrotnoscia_impedancji() -> None:
    bazy = BazyMocy(S_SIECI, S_URZ, v_bazowa_sieci_kv=15.0, v_bazowa_urzadzenia_kv=15.75)
    assert bazy.admitancja_na_baze_sieci(1.0 / 0.2) == pytest.approx(
        1.0 / bazy.impedancja_na_baze_sieci(0.2)
    )


def test_przeliczenie_tam_i_z_powrotem_jest_tozsamoscia() -> None:
    """Odwrócenie ról baz musi odtworzyć wartość wyjściową dla KAŻDEJ wielkości."""
    bazy = BazyMocy(S_SIECI, S_URZ, v_bazowa_sieci_kv=15.0, v_bazowa_urzadzenia_kv=15.75)
    odwrotne = BazyMocy(
        s_bazowa_sieci_mva=S_URZ,
        s_bazowa_urzadzenia_mva=S_SIECI,
        v_bazowa_sieci_kv=15.75,
        v_bazowa_urzadzenia_kv=15.0,
    )
    for metoda, wartosc in (
        ("impedancja_na_baze_sieci", 0.2),
        ("admitancja_na_baze_sieci", 5.0),
        ("moc_na_baze_sieci", 0.8),
        ("bezwladnosc_na_baze_sieci", 4.0),
        ("tlumienie_na_baze_sieci", 2.0),
        ("prad_na_baze_sieci", 1.1),
        ("napiecie_na_baze_sieci", 1.02),
    ):
        tam = getattr(bazy, metoda)(wartosc)
        assert getattr(odwrotne, metoda)(tam) == pytest.approx(wartosc), metoda


# ---------------------------------------------------------------------------
# 5. Walidacja wejścia
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "kwargi",
    [
        {"s_bazowa_sieci_mva": 0.0},
        {"s_bazowa_urzadzenia_mva": -1.0},
        {"v_bazowa_sieci_kv": 0.0},
        {"v_bazowa_urzadzenia_kv": -15.0},
    ],
)
def test_niedodatnie_bazy_sa_odrzucane(kwargi: dict[str, float]) -> None:
    pelne = {
        "s_bazowa_sieci_mva": S_SIECI,
        "s_bazowa_urzadzenia_mva": S_URZ,
        "v_bazowa_sieci_kv": 15.0,
        "v_bazowa_urzadzenia_kv": 15.0,
    }
    pelne.update(kwargi)
    with pytest.raises(ValueError):
        BazyMocy(**pelne)


def test_bazy_napiecia_sa_polami_wymaganymi() -> None:
    """Wartość domyślna przywróciłaby ciche założenie o zgodności baz."""
    with pytest.raises(TypeError):
        BazyMocy(S_SIECI, S_URZ)  # type: ignore[call-arg]


# ---------------------------------------------------------------------------
# WPIĘCIE W ŚCIEŻKĘ BUDOWY MODELU — przeliczenie musi być używane, nie tylko możliwe
# ---------------------------------------------------------------------------


def test_maszyna_z_bazy_maszyny_przelicza_wszystkie_parametry_zalezne_od_bazy() -> None:
    """`BazyMocy` jest WOŁANE ze ścieżki budowy modelu, a nie tylko z testów.

    PO CO. Do 2026-09 ``BazyMocy`` nie miało w laboratorium ANI JEDNEGO wywołania
    poza testami, a docstring `MaszynaSynchroniczna4Rzedu` twierdził, że
    przeliczenie „wykonuje ``ZespolSynchroniczny`` przez ``BazyMocy``". Funkcja
    żyjąca wyłącznie w testach jest długiem, a nieprawdziwa deklaracja obok niej
    jest gorsza od samego długu.

    Liczby są wyprowadzone z definicji baz, nie przepisane z implementacji:
      H  = H_u · S_u/S_s                        = 4,0 · 50/100                = 2,0
      Xd = Xd_u · (S_s/S_u) · (V_u/V_s)²        = 1,8 · 2 · (15,75/15)²       = 3,969
      D  = D_u · S_u/S_s                        = 1,5 · 50/100                = 0,75
      Td0' bez zmian (czas nie ma bazy)         = 8,0
    """
    bazy = BazyMocy(
        s_bazowa_sieci_mva=100.0,
        s_bazowa_urzadzenia_mva=50.0,
        v_bazowa_sieci_kv=15.0,
        v_bazowa_urzadzenia_kv=15.75,
    )
    maszyna = MaszynaSynchroniczna4Rzedu.z_bazy_maszyny(
        ref="G1",
        szyna="GEN",
        bazy=bazy,
        h_s=4.0,
        d_tlumienie=1.5,
        ra_pu=0.01,
        xd_pu=1.8,
        xq_pu=1.7,
        xd_prim_pu=0.3,
        xq_prim_pu=0.55,
        td0_prim_s=8.0,
        tq0_prim_s=0.4,
    )
    mnoznik_z = 2.0 * (15.75 / 15.0) ** 2
    assert maszyna.h_s == pytest.approx(2.0)
    assert maszyna.d_tlumienie == pytest.approx(0.75)
    assert maszyna.ra_pu == pytest.approx(0.01 * mnoznik_z)
    assert maszyna.xd_pu == pytest.approx(1.8 * mnoznik_z)
    assert maszyna.xq_pu == pytest.approx(1.7 * mnoznik_z)
    assert maszyna.xd_prim_pu == pytest.approx(0.3 * mnoznik_z)
    assert maszyna.xq_prim_pu == pytest.approx(0.55 * mnoznik_z)
    # Czas NIE ma bazy — przeliczanie stałych czasowych byłoby błędem wymiarowym.
    assert maszyna.td0_prim_s == 8.0
    assert maszyna.tq0_prim_s == 0.4


def test_zgodne_bazy_napiecia_nie_zmieniaja_niczego_poza_mocami() -> None:
    """Przy wspólnej bazie napięcia człon ``(V_u/V_s)²`` znika — i to musi być widać."""
    bazy = BazyMocy.zgodne_napieciowo(100.0, 50.0, v_bazowa_kv=15.0)
    maszyna = MaszynaSynchroniczna4Rzedu.z_bazy_maszyny(
        ref="G1", szyna="GEN", bazy=bazy, h_s=4.0, d_tlumienie=1.5, xd_pu=1.8
    )
    assert maszyna.h_s == pytest.approx(2.0)
    assert maszyna.d_tlumienie == pytest.approx(0.75)
    assert maszyna.xd_pu == pytest.approx(3.6)


def test_niezgodna_baza_napiecia_zmienia_reaktancje_o_zmierzona_wartosc() -> None:
    """Pominięcie członu napięciowego to 10,25 % błędu reaktancji — liczba z audytu."""
    zgodne = BazyMocy.zgodne_napieciowo(100.0, 50.0, v_bazowa_kv=15.0)
    niezgodne = BazyMocy(
        s_bazowa_sieci_mva=100.0,
        s_bazowa_urzadzenia_mva=50.0,
        v_bazowa_sieci_kv=15.0,
        v_bazowa_urzadzenia_kv=15.75,
    )
    a = MaszynaSynchroniczna4Rzedu.z_bazy_maszyny(
        ref="G", szyna="B", bazy=zgodne, h_s=4.0, xd_prim_pu=0.3
    )
    b = MaszynaSynchroniczna4Rzedu.z_bazy_maszyny(
        ref="G", szyna="B", bazy=niezgodne, h_s=4.0, xd_prim_pu=0.3
    )
    assert b.xd_prim_pu / a.xd_prim_pu == pytest.approx(1.1025, abs=1.0e-9)
    # Bezwładność od bazy napięcia NIE zależy — ten sam błąd nie może jej dotknąć.
    assert a.h_s == b.h_s
