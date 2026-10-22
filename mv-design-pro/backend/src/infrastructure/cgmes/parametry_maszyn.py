"""Parametry zwarciowe maszyn wirujących w CGMES — JEDNA tabela dla eksportu i importu.

Karta PODSTAWA-Q (rozstrzygnięcie 3, zasada nr 4): tabliczka maszyny wirującej
(``Generator.materialized_params``) niesie parametry IEC 60909-0 §6.3 (generator synchroniczny:
x″d, cos φ_rG) i §6.7 (maszyna asynchroniczna: liczba par biegunów p, I_LR/I_rM, cos φ_rM, η_rM)
pod kluczami rejestru wartości roboczych (``network_model.catalog.wartosci_robocze``). CGMES 3.0
(IEC 61970-301, profil EQ, dane wymiany zwarciowej wg IEC 60909) ma dla nich atrybuty:

  ``SynchronousMachine.satDirectSubtransX``  [PU, baza znamionowa maszyny] -> ``xd_subtransient_pu``
  ``RotatingMachine.ratedPowerFactor``       [—]                         -> ``cos_phi``
  ``AsynchronousMachine.polePairNumber``     [Integer]                   -> ``pole_pairs``
  ``AsynchronousMachine.iaIrRatio``          [—]                         -> ``i_lr_ratio``
  ``AsynchronousMachine.efficiency``         [PerCent]                   -> ``efficiency`` (ułamek)

Moc znamionowa maszyny asynchronicznej P_rM (``AsynchronousMachine.ratedMechanicalPower``
[W] -> ``pr_mw`` [MW]) jest wielkością GRUPY jak ``ratedS``: eksport pisze moc jednej maszyny
× liczba jednostek, import daje jedną jednostkę o mocy łącznej (``moc_mechaniczna_do_cim`` /
``moc_mechaniczna_z_cim`` — ta sama konwencja co ``sn_mva``/``ratedS``).

Eksport pisze atrybut, gdy tabliczka ma klucz; import czyta atrybut, gdy plik go ma. Wartość
spoza zakresu rejestru NIE jest tu poprawiana — obliczenie odrzuca ją jawnie przy rozstrzyganiu
parametrów (``rozstrzygnij_parametry_maszyny``: propozycja rejestru z powodem „dana tabliczki
odrzucona"). Zero fizyki: wyłącznie przeskalowanie jednostki (procent ↔ ułamek).
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass

from network_model.catalog.wartosci_robocze import (
    PARAMETR_COS_PHI_MASZYNY,
    PARAMETR_KROTNOSC_I_LR,
    PARAMETR_MOC_ZNAMIONOWA_MASZYNY,
    PARAMETR_PARY_BIEGUNOW,
    PARAMETR_SPRAWNOSC,
    PARAMETR_XD,
)

from .units import fmt_float, mw_to_w, procent_na_ulamek, ulamek_na_procent, w_to_mw


@dataclass(frozen=True)
class AtrybutMaszynyCim:
    """Jeden atrybut CIM parametru maszyny: nazwa, klucz tabliczki i para przeliczeń."""

    atrybut: str
    klucz: str
    #: Wartość tabliczki ENM -> tekst atrybutu CIM.
    do_cim: Callable[[float], str]
    #: Tekst atrybutu CIM -> wartość tabliczki ENM (``None`` = tekst nie jest liczbą
    #: tego typu — atrybut pominięty, nie zgadywany).
    z_cim: Callable[[str], float | None]


def _liczba(tekst: str) -> float | None:
    try:
        return float(tekst)
    except ValueError:
        return None


def _calkowita_do_cim(wartosc: float) -> str:
    return str(int(wartosc)) if float(wartosc).is_integer() else fmt_float(wartosc)


def _procent_z_cim(tekst: str) -> float | None:
    liczba = _liczba(tekst)
    return None if liczba is None else procent_na_ulamek(liczba)


def _atrybut(atrybut: str, klucz: str) -> AtrybutMaszynyCim:
    return AtrybutMaszynyCim(atrybut=atrybut, klucz=klucz, do_cim=fmt_float, z_cim=_liczba)


_COS_PHI = _atrybut("RotatingMachine.ratedPowerFactor", PARAMETR_COS_PHI_MASZYNY)

#: Klasa urządzenia CIM -> atrybuty parametrów zwarciowych maszyny (kolejność stała —
#: determinizm zapisu XML).
ATRYBUTY_MASZYNY_CIM: Mapping[str, tuple[AtrybutMaszynyCim, ...]] = {
    "SynchronousMachine": (
        _atrybut("SynchronousMachine.satDirectSubtransX", PARAMETR_XD),
        _COS_PHI,
    ),
    "AsynchronousMachine": (
        AtrybutMaszynyCim(
            atrybut="AsynchronousMachine.polePairNumber",
            klucz=PARAMETR_PARY_BIEGUNOW,
            do_cim=_calkowita_do_cim,
            z_cim=_liczba,
        ),
        _atrybut("AsynchronousMachine.iaIrRatio", PARAMETR_KROTNOSC_I_LR),
        _COS_PHI,
        AtrybutMaszynyCim(
            atrybut="AsynchronousMachine.efficiency",
            klucz=PARAMETR_SPRAWNOSC,
            do_cim=lambda wartosc: fmt_float(ulamek_na_procent(wartosc)),
            z_cim=_procent_z_cim,
        ),
    ),
}


def atrybuty_maszyny_do_cim(
    klasa_cim: str, tabliczka: Mapping[str, object] | None
) -> list[tuple[str, str]]:
    """(atrybut CIM, tekst) dla kluczy tabliczki obecnych jako liczby (eksport)."""
    wynik: list[tuple[str, str]] = []
    for opis in ATRYBUTY_MASZYNY_CIM.get(klasa_cim, ()):
        wartosc = (tabliczka or {}).get(opis.klucz)
        if isinstance(wartosc, int | float) and not isinstance(wartosc, bool):
            wynik.append((opis.atrybut, opis.do_cim(float(wartosc))))
    return wynik


def tabliczka_maszyny_z_cim(
    klasa_cim: str, tekst_atrybutu: Callable[[str], str | None]
) -> dict[str, float]:
    """Klucze tabliczki z atrybutów CIM obecnych w pliku (import toru obcego EQ+TP)."""
    wynik: dict[str, float] = {}
    for opis in ATRYBUTY_MASZYNY_CIM.get(klasa_cim, ()):
        tekst = tekst_atrybutu(opis.atrybut)
        if tekst is None:
            continue
        wartosc = opis.z_cim(tekst)
        if wartosc is not None:
            wynik[opis.klucz] = wartosc
    return wynik


#: Atrybut CIM mocy znamionowej maszyny asynchronicznej P_rM (IEC 60909-0 pkt 6.7).
ATRYBUT_MOCY_MECHANICZNEJ = "AsynchronousMachine.ratedMechanicalPower"


def moc_mechaniczna_do_cim(
    tabliczka: Mapping[str, object] | None, liczba_jednostek: int
) -> str | None:
    """Tekst ``ratedMechanicalPower`` [W] — P_rM jednej maszyny z tabliczki × liczba jednostek;
    ``None`` = tabliczka bez dodatniej liczby ``pr_mw`` (atrybut pominięty)."""
    wartosc = (tabliczka or {}).get(PARAMETR_MOC_ZNAMIONOWA_MASZYNY)
    if isinstance(wartosc, bool) or not isinstance(wartosc, int | float) or wartosc <= 0:
        return None
    return fmt_float(mw_to_w(float(wartosc) * max(1, liczba_jednostek)))


def moc_mechaniczna_z_cim(tekst: str | None) -> dict[str, float]:
    """Klucz tabliczki ``pr_mw`` [MW] z ``ratedMechanicalPower`` (jedna jednostka)."""
    if tekst is None:
        return {}
    liczba = _liczba(tekst)
    return {} if liczba is None else {PARAMETR_MOC_ZNAMIONOWA_MASZYNY: w_to_mw(liczba)}
