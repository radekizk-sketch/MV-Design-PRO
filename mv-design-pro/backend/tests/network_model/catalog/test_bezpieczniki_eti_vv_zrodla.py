"""Proweniencja pozycji bezpiecznikowych SN (karta K-E-FUSE-TCC-KATALOG).

DLACZEGO. Do 2026-08-14 wszystkie 7 pozycji ETI VV niosło
``ik_ka = i_cu_ka = 31,5 kA`` przy jednozdaniowym źródle „ETI VV topikowy
katalog" — bez odnośnika, bez numeru katalogowego, bez wymiaru. Pomiar na
publicznym katalogu ETI Polam wykazał, że ŻADNA tabela ETI VV dla 12 kV ani
17,5 kV nie podaje 31,5 kA (katalog daje 50 kA albo 63 kA zależnie od wymiaru
„e"; 31,5 kA występuje wyłącznie dla 10/24 kV e=292 mm i 20/36 kV e=537 mm).
Liczba nie miała pokrycia w źródle, a jednozdaniowe źródło nie pozwalało tego
wykryć — bo nie wskazywało JEDNEGO wiersza, który można sprawdzić.

ZASADA (KLASA, NIE INSTANCJA): pinujemy nie tę jedną wkładkę z karty, tylko
KAŻDĄ pozycję rodzaju FUSE w katalogu — łącznie z tymi, które ktoś dopisze
jutro. Deklaracja „każda pozycja wskazuje sprawdzalny wiersz źródła" bez testu
byłaby fałszywą pewnością.
"""

from __future__ import annotations

from network_model.catalog import get_default_mv_catalog
from network_model.catalog.types import MVApparatusType, SwitchEquipmentType

#: Rodzaj pozycji APARAT_SN odpowiadajacy wkladce topikowej w rozlaczniku.
#: Katalog rzutuje te same dane na DWA kontrakty (APARAT_SN i APARATURA
#: LACZENIOWA) — pin idzie po OBU, bo fabrykacja w jednym rzucie nie jest
#: widoczna w drugim.
RODZAJ_APARAT_SN = "ROZLACZNIK_BEZPIECZNIKOWY"
RODZAJ_APARATURY = "FUSE"


def _bezpieczniki() -> list[SwitchEquipmentType]:
    pozycje = [
        pozycja
        for pozycja in get_default_mv_catalog().list_switch_equipment_types()
        if pozycja.equipment_kind == RODZAJ_APARATURY
    ]
    assert pozycje, "Katalog aparatury musi zawierać pozycje rodzaju FUSE"
    return pozycje


def _bezpieczniki_aparat_sn() -> list[MVApparatusType]:
    pozycje = [
        pozycja
        for pozycja in get_default_mv_catalog().list_mv_apparatus_types()
        if pozycja.device_kind == RODZAJ_APARAT_SN
    ]
    assert pozycje, "Katalog APARAT_SN musi zawierać pozycje bezpiecznikowe"
    return pozycje


def test_kazdy_bezpiecznik_wskazuje_publiczne_zrodlo_http() -> None:
    """Zero fabrykacji: każda pozycja bezpiecznikowa ma odnośnik http(s).

    Pin idzie po OBU rzutach katalogu — pozycja poprawiona tylko w jednym
    kontrakcie zostawiłaby fabrykację widoczną dla drugiego konsumenta.
    """
    for pozycja in _bezpieczniki():
        assert "http://" in pozycja.source_reference or "https://" in pozycja.source_reference, (
            pozycja.id,
            pozycja.source_reference,
        )
    for aparat in _bezpieczniki_aparat_sn():
        assert "http://" in aparat.source_reference or "https://" in aparat.source_reference, (
            aparat.id,
            aparat.source_reference,
        )


def test_kazdy_bezpiecznik_wskazuje_konkretny_wiersz_karty() -> None:
    """Odnośnik do PDF nie wystarcza — źródło musi wskazywać JEDEN wiersz.

    Katalog ETI podaje tę samą wkładkę w kilku wymiarach „e", a zdolność
    wyłączania RÓŻNI SIĘ między wymiarami (50 kA vs 63 kA). Źródło bez numeru
    katalogowego i wymiaru nie da się zweryfikować — i właśnie dlatego
    fabrykacja 31,5 kA przetrwała.
    """
    for pozycja in _bezpieczniki():
        assert "nr kodowy" in pozycja.source_reference, (pozycja.id, pozycja.source_reference)
        assert "e=" in pozycja.source_reference, (pozycja.id, pozycja.source_reference)


def test_bezpiecznik_ma_zdolnosc_wylaczania_z_jednego_zrodla_prawdy() -> None:
    """PARA PREDYKATÓW: ``ik_ka`` i ``i_cu_ka`` to dla wkładki topikowej TA SAMA
    wielkość z karty (znamionowa zdolność wyłączania). Dwie niezależne liczby,
    które „dziś się zgadzają", to defekt czekający na dane brzegowe — więc
    zgodność jest przypięta, a nie zostawiona sumieniu edytującego.
    """
    for pozycja in _bezpieczniki():
        assert pozycja.i_cu_ka is not None, pozycja.id
        assert pozycja.i_cu_ka > 0.0, pozycja.id
        assert pozycja.ik_ka == pozycja.i_cu_ka, (pozycja.id, pozycja.ik_ka, pozycja.i_cu_ka)


def test_zadna_wkladka_nie_niesie_wartosci_bez_pokrycia_w_karcie() -> None:
    """Pin korekty: 31,5 kA było liczbą bez źródła dla 12 kV i 17,5 kV.

    Test nie broni liczby 63 kA „bo tak" — broni ZGODNOŚCI z tabelą wskazaną
    w ``source_reference`` tej samej pozycji. Katalog ETI podaje w stopce każdej
    tabeli jedną zdolność wyłączania, a nasze pozycje cytują ją wprost.
    """
    for pozycja in _bezpieczniki():
        deklarowana_w_zrodle = f"zdolnosc wylaczania {pozycja.i_cu_ka:g} kA"
        assert deklarowana_w_zrodle in pozycja.source_reference, (
            pozycja.id,
            deklarowana_w_zrodle,
            pozycja.source_reference,
        )


def test_oba_rzuty_katalogu_podaja_te_sama_zdolnosc_wylaczania() -> None:
    """PARA PREDYKATÓW MIĘDZY KONTRAKTAMI. Ta sama wkładka jest widoczna jako
    pozycja APARAT_SN (``breaking_capacity_ka``) i jako pozycja aparatury
    łączeniowej (``i_cu_ka``). Rozjazd między rzutami znaczy, że jeden
    konsument liczy na innej liczbie niż drugi — defekt niewidoczny w testach
    patrzących tylko na jeden rzut.
    """
    aparaty = {aparat.id: aparat for aparat in _bezpieczniki_aparat_sn()}
    pozycje = {pozycja.id: pozycja for pozycja in _bezpieczniki()}

    assert set(aparaty) == set(pozycje), (sorted(aparaty), sorted(pozycje))
    for item_id, pozycja in pozycje.items():
        assert aparaty[item_id].breaking_capacity_ka == pozycja.i_cu_ka, (
            item_id,
            aparaty[item_id].breaking_capacity_ka,
            pozycja.i_cu_ka,
        )
