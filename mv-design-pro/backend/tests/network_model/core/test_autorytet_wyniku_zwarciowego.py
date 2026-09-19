"""Testy `network_model.core.autorytet_wyniku_zwarciowego` (karta S-2 AUTORYTET).

Iloczyn cech: {DEKLARACJA / DOMYSLNE_SYSTEMOWE / DANE_NIEPOPRAWNE /
POZA_DZIEDZINA_WYNIKU / PRAD_ZNAMIONOWY_NIEPOPRAWNY / znacznik nieznany} x
{zdolność zależna / niezależna} x {proweniencja None / bez_sladu /
payload_klienta / z_grafu / ze_znacznikow} — nie tylko scenariusz z karty.
"""

from __future__ import annotations

import pytest
from network_model.core.autorytet_wyniku_zwarciowego import (
    ZNACZNIKI_BEZ_ZASTRZEZEN,
    BlokadaAutorytetu,
    BrakAutorytetuWyniku,
    ProweniencjaWynikuZwarciowego,
    ZrodloWynikuZwarciowego,
    blokady_autorytetu,
    wymagaj_autorytetu,
    wynik_jest_miarodajny,
)
from network_model.core.wklad_zwarciowy_przeksztaltnika import (
    K_SC_ZRODLO_DEKLARACJA,
    K_SC_ZRODLO_DOMYSLNE,
    K_SC_ZRODLO_NIEPOPRAWNE,
    K_SC_ZRODLO_POZA_DZIEDZINA,
    K_SC_ZRODLO_PRAD_NIEPOPRAWNY,
)
from network_model.core.zdolnosci_wkladu_zwarciowego import (
    KOD_BLOKADY_K_SC_DOMYSLNY,
    KOD_BLOKADY_WYNIK_BEZ_SLADU,
    KOD_BLOKADY_WYNIK_Z_PAYLOADU,
    KOD_BLOKADY_ZNACZNIK_NIEZNANY,
    ZdolnoscMiarodajna,
)


class _ZrodloFalownikowe:
    def __init__(self, k_sc: object, in_rated_a: object = 100.0, in_service: bool = True) -> None:
        self.k_sc = k_sc
        self.in_rated_a = in_rated_a
        self.in_service = in_service


class _Graf:
    def __init__(self, zrodla: list[_ZrodloFalownikowe]) -> None:
        self._zrodla = zrodla

    def get_inverter_sources(self) -> list[_ZrodloFalownikowe]:
        return [z for z in self._zrodla if z.in_service]


# ---------------------------------------------------------------------------
# ProweniencjaWynikuZwarciowego — konstruktory wyprowadzające i jawnie niemiarodajne.
# ---------------------------------------------------------------------------


def test_z_grafu_pusta_siec_daje_puste_znaczniki_miarodajne() -> None:
    prow = ProweniencjaWynikuZwarciowego.z_grafu(_Graf([]))
    assert prow.znaczniki_k_sc == ()
    assert prow.zrodlo is ZrodloWynikuZwarciowego.SOLVER_Z_MODELU
    assert wynik_jest_miarodajny(ZdolnoscMiarodajna.SHORT_CIRCUIT_3F, prow) is True


def test_z_grafu_deklaracja_daje_znacznik_deklaracja() -> None:
    prow = ProweniencjaWynikuZwarciowego.z_grafu(_Graf([_ZrodloFalownikowe(k_sc=1.3)]))
    assert prow.znaczniki_k_sc == (K_SC_ZRODLO_DEKLARACJA,)


def test_z_grafu_brak_deklaracji_daje_znacznik_domyslny() -> None:
    prow = ProweniencjaWynikuZwarciowego.z_grafu(_Graf([_ZrodloFalownikowe(k_sc=None)]))
    assert prow.znaczniki_k_sc == (K_SC_ZRODLO_DOMYSLNE,)


def test_z_grafu_zrodlo_wylaczone_pomijane() -> None:
    """Źródło `in_service=False` nie wnosi prądu — jego brak deklaracji nie
    może blokować niczego (`graph.get_inverter_sources()` już filtruje)."""
    prow = ProweniencjaWynikuZwarciowego.z_grafu(
        _Graf([_ZrodloFalownikowe(k_sc=None, in_service=False)])
    )
    assert prow.znaczniki_k_sc == ()


def test_z_grafu_wiele_zrodel_znaczniki_posortowane_i_zdeduplikowane_do_zbioru() -> None:
    prow = ProweniencjaWynikuZwarciowego.z_grafu(
        _Graf(
            [
                _ZrodloFalownikowe(k_sc=1.1),
                _ZrodloFalownikowe(k_sc=None),
                _ZrodloFalownikowe(k_sc=0.0),
            ]
        )
    )
    assert set(prow.znaczniki_k_sc) == {
        K_SC_ZRODLO_DEKLARACJA,
        K_SC_ZRODLO_DOMYSLNE,
        K_SC_ZRODLO_NIEPOPRAWNE,
    }


def test_z_grafu_iloczyn_poza_dziedzina_daje_wlasciwy_znacznik() -> None:
    prow = ProweniencjaWynikuZwarciowego.z_grafu(_Graf([_ZrodloFalownikowe(k_sc=1e308)]))
    assert prow.znaczniki_k_sc == (K_SC_ZRODLO_POZA_DZIEDZINA,)


def test_z_grafu_prad_znamionowy_niepoprawny_daje_wlasciwy_znacznik() -> None:
    prow = ProweniencjaWynikuZwarciowego.z_grafu(
        _Graf([_ZrodloFalownikowe(k_sc=1.2, in_rated_a=0.0)])
    )
    assert prow.znaczniki_k_sc == (K_SC_ZRODLO_PRAD_NIEPOPRAWNY,)


def test_ze_znacznikow_sortuje_i_zachowuje() -> None:
    prow = ProweniencjaWynikuZwarciowego.ze_znacznikow(["b", "a", "a"])
    assert prow.znaczniki_k_sc == ("a", "a", "b")
    assert prow.zrodlo is ZrodloWynikuZwarciowego.SOLVER_Z_MODELU


def test_payload_klienta_i_bez_sladu_sa_jawnie_niemiarodajne() -> None:
    payload = ProweniencjaWynikuZwarciowego.payload_klienta()
    brak = ProweniencjaWynikuZwarciowego.bez_sladu()
    assert payload.zrodlo is ZrodloWynikuZwarciowego.PAYLOAD_KLIENTA
    assert brak.zrodlo is ZrodloWynikuZwarciowego.BRAK_SLADU
    for zdolnosc in (
        ZdolnoscMiarodajna.SHORT_CIRCUIT_3F,
        ZdolnoscMiarodajna.PROTECTION_COORDINATION,
        ZdolnoscMiarodajna.BREAKING_CAPACITY_SELECTION,
    ):
        assert wynik_jest_miarodajny(zdolnosc, payload) is False
        assert wynik_jest_miarodajny(zdolnosc, brak) is False


# ---------------------------------------------------------------------------
# blokady_autorytetu / wymagaj_autorytetu — granica jest wąska i fail-closed.
# ---------------------------------------------------------------------------


def test_zdolnosc_niezalezna_nigdy_nie_blokuje_niezaleznie_od_proweniencji() -> None:
    for proweniencja in (
        None,
        ProweniencjaWynikuZwarciowego.bez_sladu(),
        ProweniencjaWynikuZwarciowego.payload_klienta(),
        ProweniencjaWynikuZwarciowego.ze_znacznikow((K_SC_ZRODLO_NIEPOPRAWNE,)),
    ):
        assert blokady_autorytetu(ZdolnoscMiarodajna.LOAD_FLOW, proweniencja) == ()
        assert blokady_autorytetu(ZdolnoscMiarodajna.TOPOLOGY, proweniencja) == ()


def test_proweniencja_none_traktowana_jak_bez_sladu_fail_closed() -> None:
    blokady_none = blokady_autorytetu(ZdolnoscMiarodajna.SHORT_CIRCUIT_3F, None)
    blokady_jawne = blokady_autorytetu(
        ZdolnoscMiarodajna.SHORT_CIRCUIT_3F, ProweniencjaWynikuZwarciowego.bez_sladu()
    )
    assert (
        [b.kod for b in blokady_none]
        == [b.kod for b in blokady_jawne]
        == [KOD_BLOKADY_WYNIK_BEZ_SLADU]
    )


def test_payload_klienta_daje_wlasciwy_kod_rozny_od_bez_sladu() -> None:
    blokady = blokady_autorytetu(
        ZdolnoscMiarodajna.SHORT_CIRCUIT_3F, ProweniencjaWynikuZwarciowego.payload_klienta()
    )
    assert [b.kod for b in blokady] == [KOD_BLOKADY_WYNIK_Z_PAYLOADU]


def test_deklaracja_dla_wszystkich_zrodel_przechodzi_bez_blokad() -> None:
    prow = ProweniencjaWynikuZwarciowego.ze_znacznikow((K_SC_ZRODLO_DEKLARACJA,))
    assert blokady_autorytetu(ZdolnoscMiarodajna.PROTECTION_COORDINATION, prow) == ()
    wymagaj_autorytetu((ZdolnoscMiarodajna.PROTECTION_COORDINATION,), prow)  # nie rzuca


def test_pusta_lista_znacznikow_przechodzi_bez_blokad() -> None:
    """Sieć bez czynnych falowników — proweniencja SOLVER_Z_MODELU z pustymi
    znacznikami jest miarodajna z definicji (brak wkładu falownikowego w
    równaniach, nie brak danych)."""
    prow = ProweniencjaWynikuZwarciowego.ze_znacznikow(())
    assert blokady_autorytetu(ZdolnoscMiarodajna.SC_WITHSTAND_EVIDENCE, prow) == ()


@pytest.mark.parametrize(
    ("znacznik", "kod_oczekiwany"),
    [
        (K_SC_ZRODLO_DOMYSLNE, KOD_BLOKADY_K_SC_DOMYSLNY),
        (K_SC_ZRODLO_NIEPOPRAWNE, "SI-111"),
        (K_SC_ZRODLO_POZA_DZIEDZINA, "SI-114"),
        (K_SC_ZRODLO_PRAD_NIEPOPRAWNY, "SI-115"),
    ],
)
def test_kazdy_znacznik_niemiarodajny_daje_wlasny_kod_blokady(
    znacznik: str, kod_oczekiwany: str
) -> None:
    prow = ProweniencjaWynikuZwarciowego.ze_znacznikow((znacznik,))
    blokady = blokady_autorytetu(ZdolnoscMiarodajna.REGULATORY_EVIDENCE, prow)
    assert len(blokady) == 1
    assert blokady[0].kod == kod_oczekiwany
    assert blokady[0].zdolnosc == ZdolnoscMiarodajna.REGULATORY_EVIDENCE


def test_znacznik_nieznany_blokuje_fail_closed_nie_jest_pomijany() -> None:
    """Regresja P1-DELTA (opisana w docstringu modułu): znacznik spoza
    zamkniętej listy MUSI blokować, nie zostać po cichu pominięty."""
    prow = ProweniencjaWynikuZwarciowego.ze_znacznikow(("COS_NOWEGO_SPOZA_LISTY",))
    blokady = blokady_autorytetu(ZdolnoscMiarodajna.SHORT_CIRCUIT_3F, prow)
    assert len(blokady) == 1
    assert blokady[0].kod == KOD_BLOKADY_ZNACZNIK_NIEZNANY


def test_wiele_zrodel_daje_wiele_blokad_posortowanych() -> None:
    prow = ProweniencjaWynikuZwarciowego.ze_znacznikow(
        (K_SC_ZRODLO_NIEPOPRAWNE, K_SC_ZRODLO_DOMYSLNE)
    )
    blokady = blokady_autorytetu(ZdolnoscMiarodajna.PROTECTION, prow)
    assert len(blokady) == 2
    kody = {b.kod for b in blokady}
    assert kody == {"SI-111", KOD_BLOKADY_K_SC_DOMYSLNY}


def test_wymagaj_autorytetu_raises_brak_autorytetu_wyniku_z_kompletem_blokad() -> None:
    prow = ProweniencjaWynikuZwarciowego.ze_znacznikow((K_SC_ZRODLO_DOMYSLNE,))
    with pytest.raises(BrakAutorytetuWyniku) as exc:
        wymagaj_autorytetu(
            (
                ZdolnoscMiarodajna.BREAKING_CAPACITY_SELECTION,
                ZdolnoscMiarodajna.SC_WITHSTAND_EVIDENCE,
            ),
            prow,
        )
    assert len(exc.value.blokady) == 2
    zdolnosci_w_bledzie = {b.zdolnosc for b in exc.value.blokady}
    assert zdolnosci_w_bledzie == {
        ZdolnoscMiarodajna.BREAKING_CAPACITY_SELECTION,
        ZdolnoscMiarodajna.SC_WITHSTAND_EVIDENCE,
    }


def test_wymagaj_autorytetu_zbior_pusty_zdolnosci_nigdy_nie_rzuca() -> None:
    wymagaj_autorytetu((), ProweniencjaWynikuZwarciowego.bez_sladu())


def test_blokada_to_dict_niesie_kod_zdolnosc_i_komunikat() -> None:
    blokada = BlokadaAutorytetu(
        kod="SI-999", zdolnosc=ZdolnoscMiarodajna.PROTECTION, komunikat_pl="tekst PL"
    )
    d = blokada.to_dict()
    assert d == {"kod": "SI-999", "zdolnosc": "PROTECTION", "komunikat_pl": "tekst PL"}


def test_znaczniki_bez_zastrzezen_zawiera_wylacznie_deklaracje() -> None:
    """Deklaracja i rejestr komunikatów muszą być ROZŁĄCZNE i wyczerpujące
    (docstring modułu) — przypięte testem, nie tylko obietnicą w komentarzu."""
    assert ZNACZNIKI_BEZ_ZASTRZEZEN == frozenset({K_SC_ZRODLO_DEKLARACJA})
    from network_model.core.autorytet_wyniku_zwarciowego import _KOMUNIKAT_ZNACZNIKA

    assert not (ZNACZNIKI_BEZ_ZASTRZEZEN & set(_KOMUNIKAT_ZNACZNIKA))
    wszystkie_znane = {
        K_SC_ZRODLO_DEKLARACJA,
        K_SC_ZRODLO_DOMYSLNE,
        K_SC_ZRODLO_NIEPOPRAWNE,
        K_SC_ZRODLO_POZA_DZIEDZINA,
        K_SC_ZRODLO_PRAD_NIEPOPRAWNY,
    }
    assert ZNACZNIKI_BEZ_ZASTRZEZEN | set(_KOMUNIKAT_ZNACZNIKA) == wszystkie_znane
