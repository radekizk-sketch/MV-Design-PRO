"""Wyłącznik główny nN jest DOBIERANY, a nie przyklejany z domyślnej pozycji.

DYREKTYWA WŁAŚCICIELA §24, wariant „B + A":

  * B — wyłącznika głównego NIE MA tam, gdzie nie ma rozdzielnicy nN (pokryte
    w `tests/enm/test_pole_nn_wiazanie_aparatu.py`);
  * A — tam, gdzie rozdzielnica JEST, wyłącznik główny jest realnym obiektem
    inżynierskim, jego wiązanie katalogowe pozostaje warunkiem gotowości, a
    aparatu NIEDOBRANEGO nie wolno związać, żeby „gotowość zaświeciła".

Ten plik pilnuje strony A na poziomie samego doboru. Testy są ILOCZYNEM CECH
(reguła KLASA-NIE-INSTANCJA §2), a nie przykładem z karty: krzyżujemy moc
transformatora × klasę napięciową szyny × obecność pozycji w katalogu, bo
defekt potrafi schować się dokładnie w kombinacji, nie w pojedynczej wartości.
Najdroższy zmierzony przypadek — transformator WN/SN 110/15 kV — spełniał
kryterium prądowe (385 A) i przed bramką klasy napięciowej dostawał aparat
690 V do szyny 15 kV.
"""

from __future__ import annotations

import math

import pytest
from application.station_templates.apply import dobierz_wylacznik_glowny_nn
from domain.dobor_aparatu_pola import _napiecie_aparatu_nn_kv as _napiecie_lacznikowe_kv
from network_model.catalog import get_default_mv_catalog


def _rodzina_glownych() -> list:
    return [
        a
        for a in get_default_mv_catalog().list_lv_apparatus_types()
        if a.device_kind == "WYLACZNIK_GLOWNY"
    ]


def _aparat(item_id: str):
    return get_default_mv_catalog().get_lv_apparatus_type(item_id)


def _prad_znamionowy_a(s_mva: float, u_kv: float) -> float:
    return s_mva * 1.0e6 / (math.sqrt(3.0) * u_kv * 1.0e3)


# ---------------------------------------------------------------------------
# (a) Warunek konieczny: I_n(aparatu) >= I_n(transformatora) — dla KAŻDEJ mocy
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("transformer_ref", "s_mva"),
    [
        ("tr-sn-nn-15-04-63kva-dyn11", 0.063),
        ("tr-sn-nn-15-04-100kva-dyn11", 0.100),
        ("tr-sn-nn-15-04-160kva-dyn11", 0.160),
        ("tr-sn-nn-15-04-250kva-dyn11", 0.250),
        ("tr-sn-nn-15-04-400kva-dyn11", 0.400),
        ("tr-sn-nn-15-04-630kva-dyn11", 0.630),
        ("tr-sn-nn-15-04-1000kva-dyn11", 1.000),
        ("tr-sn-nn-15-04-1250kva-dyn11", 1.250),
        ("tr-sn-nn-15-04-1600kva-dyn11", 1.600),
        ("tr-sn-nn-15-04-2000kva-dyn11", 2.000),
        ("tr-sn-nn-15-04-2500kva-dyn11", 2.500),
    ],
)
def test_dobrany_aparat_przewodzi_prad_znamionowy_transformatora(
    transformer_ref: str, s_mva: float
) -> None:
    """Cały typoszereg SN/nN 15/0,4 kV musi mieć dobór, i to dobór PRAWDZIWY.

    Sprawdzamy własność fizyczną (aparat uniesie prąd roboczy), a nie to, że
    funkcja „coś zwróciła" — dlatego liczymy I_n niezależnie, z mocy podanej w
    parametrze, a nie z wartości odczytanej przez samą funkcję.
    """
    wybrany, uzasadnienie = dobierz_wylacznik_glowny_nn(
        transformer_ref=transformer_ref, nn_voltage_kv=0.4
    )
    assert wybrany is not None, uzasadnienie
    aparat = _aparat(wybrany)
    assert aparat is not None
    i_n = _prad_znamionowy_a(s_mva, 0.4)
    assert aparat.i_n_a >= i_n, f"{wybrany} ({aparat.i_n_a} A) < I_n = {i_n:.0f} A"


@pytest.mark.parametrize(
    ("transformer_ref", "oczekiwany"),
    [
        ("tr-sn-nn-15-04-63kva-dyn11", "cb_nn_400a"),
        ("tr-sn-nn-15-04-630kva-dyn11", "cb_nn_1000a"),
        ("tr-sn-nn-15-04-1000kva-dyn11", "cb_nn_1600a"),
        ("tr-sn-nn-15-04-1600kva-dyn11", "cb_nn_2500a"),
        ("tr-sn-nn-15-04-2000kva-dyn11", "cb_nn_3200a"),
        ("tr-sn-nn-15-04-2500kva-dyn11", "cb_nn_4000a"),
    ],
)
def test_dobierany_jest_najmniejszy_wystarczajacy_a_nie_najwiekszy_dostepny(
    transformer_ref: str, oczekiwany: str
) -> None:
    """Przewymiarowanie wyłącznika głównego to defekt, nie „zapas".

    Nadmiarowy I_n podnosi nastawy członu zwłocznego i psuje selektywność wobec
    odpływów oraz zabezpieczenia zwarciowego transformatora, więc „największy,
    jaki jest" NIE jest doborem. Ten test przypina konkretne pary, żeby zmiana
    kryterium na „pierwszy pasujący w kolejności katalogu" zaświeciła.
    """
    wybrany, uzasadnienie = dobierz_wylacznik_glowny_nn(
        transformer_ref=transformer_ref, nn_voltage_kv=0.4
    )
    assert wybrany == oczekiwany, uzasadnienie


def test_zaden_mniejszy_aparat_nie_bylby_wystarczajacy() -> None:
    """Minimalność doboru sprawdzona wprost: sąsiad z dołu MUSI być za mały.

    Bez tego testu kryterium „najmniejszy wystarczający" ma tylko przypięte
    przykłady; tutaj sprawdzamy je jako WŁASNOŚĆ całej rodziny.
    """
    rodzina = sorted(_rodzina_glownych(), key=lambda a: a.i_n_a)
    for transformer_ref, s_mva in (
        ("tr-sn-nn-15-04-630kva-dyn11", 0.630),
        ("tr-sn-nn-15-04-1600kva-dyn11", 1.600),
        ("tr-sn-nn-15-04-2500kva-dyn11", 2.500),
    ):
        wybrany, _ = dobierz_wylacznik_glowny_nn(transformer_ref=transformer_ref, nn_voltage_kv=0.4)
        i_n = _prad_znamionowy_a(s_mva, 0.4)
        mniejsze = [a for a in rodzina if a.i_n_a < _aparat(wybrany).i_n_a]
        assert all(
            a.i_n_a < i_n for a in mniejsze
        ), f"dla {transformer_ref} istnieje mniejsza pozycja spełniająca I_n ≥ {i_n:.0f} A"


# ---------------------------------------------------------------------------
# (b) Bramka klasy napięciowej — cecha KRZYŻOWANA z prądem, nie osobna
# ---------------------------------------------------------------------------


def test_transformator_wn_sn_nie_dostaje_aparatu_nn_mimo_pasujacego_pradu() -> None:
    """DEFEKT ZMIERZONY: 110/15 kV, I_n = 385 A, kryterium prądowe SPEŁNIONE.

    Przed bramką klasy napięciowej funkcja zwracała `cb_nn_400a` — aparat o
    U_e = 0,69 kV na szynę 15 kV. Kryterium prądowe jest tu spełnione i właśnie
    dlatego test musi krzyżować cechy: sprawdzanie samego prądu przepuszcza ten
    przypadek, a sprawdzanie samego napięcia nie pokazuje, dlaczego było groźne.
    """
    i_n = _prad_znamionowy_a(10.0, 15.0)
    najmniejszy = min(_rodzina_glownych(), key=lambda a: a.i_n_a)
    assert (
        najmniejszy.i_n_a >= i_n
    ), "przesłanka testu: prąd MUSI się mieścić, inaczej test przechodzi z innego powodu"

    wybrany, uzasadnienie = dobierz_wylacznik_glowny_nn(
        transformer_ref="tr-wn-sn-110-15-10mva-yd11", nn_voltage_kv=15.0
    )
    assert wybrany is None
    assert "rodziny SN" in uzasadnienie, uzasadnienie
    assert "fabrykacją" in uzasadnienie, uzasadnienie


def test_kazda_pozycja_rodziny_pokrywa_szyne_0_69_kv() -> None:
    """Blok generatorowy 0,69 kV korzysta z tej samej rodziny — i ma prawo.

    Druga strona bramki napięciowej: nie wolno jej zacieśnić tak, żeby odcięła
    poprawne zastosowanie przy U_e = U_szyny (warunek jest „≥", nie „>").
    """
    for aparat in _rodzina_glownych():
        assert _napiecie_lacznikowe_kv(aparat) >= 0.69, aparat.id
    wybrany, uzasadnienie = dobierz_wylacznik_glowny_nn(
        transformer_ref="tr-sn-nn-15-04-1000kva-dyn11", nn_voltage_kv=0.69
    )
    assert wybrany is not None, uzasadnienie


def test_napiecie_lacznikowe_czyta_u_e_a_nie_poziom_sieci() -> None:
    """`u_m_kv` (U_e z karty) decyduje; `u_n_kv` to tylko odczyt zastępczy.

    Deklaracja z docstringu funkcji dostaje tu PRZYPIĘTY test (§4 reguły
    KLASA-NIE-INSTANCJA: obietnica bez testu jest groźniejsza niż defekt).
    """
    aparat = _aparat("cb_nn_1000a")
    assert aparat.u_n_kv == pytest.approx(0.4)
    assert aparat.u_m_kv == pytest.approx(0.69)
    assert _napiecie_lacznikowe_kv(aparat) == pytest.approx(
        0.69
    ), "gdyby funkcja czytała u_n_kv, blok 0,69 kV zostałby bez doboru"


# ---------------------------------------------------------------------------
# (c) Brak dopasowania NIE jest cichy i NIE jest podmieniany
# ---------------------------------------------------------------------------


def test_prad_ponad_rodzine_konczy_sie_brakiem_doboru_a_nie_podmianka() -> None:
    """Powyżej największej pozycji dobór ZWRACA BRAK — nie ostatnią pozycję.

    Sprawdzamy przez szynę o obniżonym napięciu, żeby wymusić prąd większy od
    4000 A bez dopisywania fikcyjnego transformatora do katalogu.
    """
    i_n = _prad_znamionowy_a(2.5, 0.23)
    najwiekszy = max(a.i_n_a for a in _rodzina_glownych())
    assert i_n > najwiekszy, "przesłanka: prąd MUSI przekraczać rodzinę"

    wybrany, uzasadnienie = dobierz_wylacznik_glowny_nn(
        transformer_ref="tr-sn-nn-15-04-2500kva-dyn11", nn_voltage_kv=0.23
    )
    assert wybrany is None
    assert f"{i_n:.0f} A" in uzasadnienie, uzasadnienie
    assert "fabrykacją" in uzasadnienie, uzasadnienie


@pytest.mark.parametrize(
    ("transformer_ref", "nn_voltage_kv"),
    [
        (None, 0.4),
        ("", 0.4),
        ("   ", 0.4),
        ("pozycja-ktorej-nie-ma-w-katalogu", 0.4),
        ("tr-sn-nn-15-04-630kva-dyn11", 0.0),
        ("tr-sn-nn-15-04-630kva-dyn11", -0.4),
    ],
)
def test_brak_danych_wejsciowych_nie_zamienia_sie_w_dobor(
    transformer_ref: str | None, nn_voltage_kv: float
) -> None:
    """Brak danych zostaje brakiem (§20 zero fabrykacji), nie staje się liczbą.

    Każde z tych wejść uniemożliwia policzenie I_n. Funkcja ma wtedy odmówić
    doboru — a nie sięgnąć po „typową" pozycję, bo to byłby aparat wpisany do
    projektu bez żadnej podstawy.
    """
    wybrany, uzasadnienie = dobierz_wylacznik_glowny_nn(
        transformer_ref=transformer_ref, nn_voltage_kv=nn_voltage_kv
    )
    assert wybrany is None
    assert uzasadnienie.strip(), "odmowa doboru MUSI być uzasadniona, nie milcząca"


def test_dobor_jest_deterministyczny() -> None:
    """To samo wejście → ta sama pozycja (reguła determinizmu, rdzeń kanonu).

    Rozstrzyganie remisu po `id` jest częścią kryterium właśnie po to, żeby
    kolejność iteracji katalogu nie mogła zmienić wyniku.
    """
    wyniki = {
        dobierz_wylacznik_glowny_nn(
            transformer_ref="tr-sn-nn-15-04-1000kva-dyn11", nn_voltage_kv=0.4
        )[0]
        for _ in range(8)
    }
    assert wyniki == {"cb_nn_1600a"}
