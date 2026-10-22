"""Zespół uziemiający SN → punkt neutralny modelu — JEDNO odwzorowanie (karta
KATALOG-APARATURA-WN, pkt 5).

PO CO. Pole zespołu uziemiającego (ENEA Operator, Zeszyt 1 §16, rys. Z.13–Z.15) to
transformator uziemiający ZNyn11 i element punktu neutralnego: dławik, dławik ‖ rezystor albo
rezystor. Model sieci ma na to JEDEN nośnik — ``GroundingConfig`` (``enm/models.py``) na
``Source.neutral_grounding`` (równoważnik na szynach SN) albo na punkcie neutralnym uzwojenia
transformatora — oraz liczby składowej zerowej źródła (``Source.r0_ohm``/``x0_ohm``), które
czyta solver zwarć 1F. Ten moduł nie tworzy drugiego nośnika: z pozycji katalogu
``MvNeutralGroundingItem`` (``network_model/catalog/audit2_catalogs.py``) wyprowadza dokładnie
te dwa ładunki, które przyjmuje istniejąca operacja ``add_grid_source_sn`` (``grounding`` i
``zero_sequence``), wraz z danymi przyjętymi.

ZASADA NR 4. Metoda uziemienia jest decyzją projektanta. Brak decyzji (``pozycja_ref`` =
``None``) nie blokuje zwarcia 1F: odwzorowanie PROPONUJE wariant wg ENEA §16 — sieć o
charakterze kablowym: rezystor; kablowo-napowietrzna albo nieokreślona: dławik z nastawą
400 A — jako daną przyjętą ``ESTIMATED``. Impedancja zerowa transformatora uziemiającego (Z_T0)
nie ma źródła w repozytorium — wchodzi zawsze jako wartość robocza rejestru
``wartosci_robocze`` (``ESTIMATED``). Pozycja zastana bez wartości dominującej (dławik bez
X_N) dostaje nastawę roboczą 400 A z §16 jako daną przyjętą — nigdy cichego zera.

Fizyka: wyłącznie przez ``network_model.pochodne`` (Z_N = U_f / I, Z_N równoległe,
Z_0 = Z_T0 + 3·Z_N); moduł nie zawiera wzorów.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, cast

from network_model.catalog.audit2_catalogs import (
    NASTAWA_DLAWIKA_POZYCJI_A,
    ZRODLO_ENEA_ZESZYT_1_S16,
    MvNeutralGroundingItem,
    WariantZespoluUziemiajacego,
    get_mv_neutral_grounding,
    zespol_uziemiajacy,
)
from network_model.catalog.wartosci_robocze import (
    dana_przyjeta_z_propozycji,
    liczba_pl,
    propozycje_impedancji_zerowej_transformatora_uziemiajacego,
)
from network_model.core.uziemienie import ETYKIETA_PL_PUNKTU_NEUTRALNEGO
from network_model.odmowa_danych import OdmowaNazwana
from network_model.pochodne import (
    impedancja_punktu_neutralnego_ohm,
    impedancja_z_napiecia_i_pradu_ohm,
    impedancja_zerowa_zespolu_uziemiajacego_ohm,
    kv_na_v,
)
from network_model.pochodne.pasma_napieciowe import pasmo_napieciowe
from werdykt.kontrakt import DanaPrzyjeta, Wielkosc
from werdykt.proweniencja import FieldQuality

from .models import GroundingConfig
from .uziemienie import blad_konfiguracji_uziemienia, uziemienie_grounded

CharakterSieci = Literal["KABLOWA", "KABLOWO_NAPOWIETRZNA"]
CHARAKTERY_SIECI: tuple[CharakterSieci, ...] = ("KABLOWA", "KABLOWO_NAPOWIETRZNA")

KOD_POZYCJA_NIEZNANA = "zespol_uziemiajacy.pozycja_nieznana"
KOD_NAPIECIE_NIEZGODNE = "zespol_uziemiajacy.napiecie_niezgodne"
KOD_NAPIECIE_SPOZA_SN = "zespol_uziemiajacy.napiecie_spoza_sn"
KOD_CHARAKTER_NIEZNANY = "zespol_uziemiajacy.charakter_sieci_nieznany"


class OdmowaOdwzorowaniaZU(OdmowaNazwana):
    """Odmowa odwzorowania: kod maszynowy w polu, zdanie dla projektanta (API: 422)."""

    def __init__(self, kod: str, komunikat_pl: str) -> None:
        super().__init__(komunikat_pl, kod=kod)


@dataclass(frozen=True)
class OdwzorowanieZespoluUziemiajacego:
    """Wynik odwzorowania: nośnik punktu neutralnego + liczby Z0 + dane przyjęte."""

    pozycja_ref: str
    propozycja: bool
    napiecie_sieci_kv: float
    neutral_grounding: GroundingConfig
    r0_ohm: float | None
    x0_ohm: float | None
    dane_przyjete: tuple[DanaPrzyjeta, ...]
    wyjasnienie_pl: str

    def to_dict(self) -> dict[str, Any]:
        grounding: dict[str, Any] = {"type": self.neutral_grounding.type}
        if self.neutral_grounding.r_ohm is not None:
            grounding["r_ohm"] = self.neutral_grounding.r_ohm
        if self.neutral_grounding.x_ohm is not None:
            grounding["x_ohm"] = self.neutral_grounding.x_ohm
        zero_sequence: dict[str, Any] | None = None
        if self.r0_ohm is not None and self.x0_ohm is not None:
            zero_sequence = {"enabled": True, "r0_ohm": self.r0_ohm, "x0_ohm": self.x0_ohm}
        return {
            "pozycja_ref": self.pozycja_ref,
            "propozycja": self.propozycja,
            "napiecie_sieci_kv": self.napiecie_sieci_kv,
            "grounding": grounding,
            "zero_sequence": zero_sequence,
            "dane_przyjete": [d.model_dump(mode="json") for d in self.dane_przyjete],
            "wyjasnienie_pl": self.wyjasnienie_pl,
            "podstawa_pl": ZRODLO_ENEA_ZESZYT_1_S16,
        }


def wariant_proponowany(charakter_sieci: CharakterSieci | None) -> WariantZespoluUziemiajacego:
    """Wariant wg ENEA §16: sieć kablowa → rezystor; pozostałe → dławik."""
    return "REZYSTOR" if charakter_sieci == "KABLOWA" else "DLAWIK"


def _dana_propozycji_wariantu(
    pozycja: MvNeutralGroundingItem, charakter_sieci: CharakterSieci | None
) -> DanaPrzyjeta:
    prad = (
        pozycja.prad_rezystora_a
        if pozycja.wariant_zespolu == "REZYSTOR"
        else pozycja.prad_dlawika_a
    )
    assert prad is not None
    if charakter_sieci == "KABLOWA":
        charakter_pl = "sieć o charakterze kablowym → rezystor"
    elif charakter_sieci is None:
        charakter_pl = "charakter sieci nieokreślony → dławik (wariant sieci kablowo-napowietrznej)"
    else:
        charakter_pl = "sieć kablowo-napowietrzna → dławik"
    return DanaPrzyjeta(
        nazwa_pl="sposób uziemienia punktu neutralnego sieci SN (zespół uziemiający)",
        wartosc=Wielkosc(wartosc=prad, jednostka="A"),
        powod_pl=(
            "wartość robocza (norma operatora): projektant nie wybrał zespołu uziemiającego — "
            f"przyjęto „{pozycja.label_pl}” wg {ZRODLO_ENEA_ZESZYT_1_S16} ({charakter_pl}). "
            "Wpływ: prąd zwarcia 1F sieci SN wynika z założonego elementu punktu neutralnego; "
            "metodę i nastawę ustala analiza z §16."
        ),
        jakosc=FieldQuality.ESTIMATED,
    )


def _dana_nastawy_dlawika(napiecie_sieci_kv: float) -> tuple[float, DanaPrzyjeta]:
    x_n = impedancja_z_napiecia_i_pradu_ohm(kv_na_v(napiecie_sieci_kv), NASTAWA_DLAWIKA_POZYCJI_A)
    return x_n, DanaPrzyjeta(
        nazwa_pl="nastawa dławika punktu neutralnego",
        wartosc=Wielkosc(wartosc=NASTAWA_DLAWIKA_POZYCJI_A, jednostka="A"),
        powod_pl=(
            "wartość robocza (norma operatora): pozycja nie podaje reaktancji dławika — przyjęto "
            f"nastawę {liczba_pl(NASTAWA_DLAWIKA_POZYCJI_A)} A (górna granica zakresu 40–400 A, "
            f"{ZRODLO_ENEA_ZESZYT_1_S16}), X_N = {liczba_pl(round(x_n, 3))} Ω. Wpływ: "
            "rzeczywistą nastawę ustala regulator względem prądu pojemnościowego sieci."
        ),
        jakosc=FieldQuality.ESTIMATED,
    )


def odwzoruj_zespol_uziemiajacy(
    pozycja_ref: str | None,
    *,
    napiecie_sieci_kv: float,
    charakter_sieci: str | None = None,
) -> OdwzorowanieZespoluUziemiajacego:
    """Pozycja zespołu uziemiającego (albo jej brak) → ``GroundingConfig`` + R0/X0 + dane
    przyjęte. Odmowa (``OdmowaOdwzorowaniaZU``) wyłącznie dla braków MODELU: nieznana
    pozycja, napięcie spoza pasma SN, pozycja wyprowadzona dla innego napięcia sieci."""
    if pasmo_napieciowe(napiecie_sieci_kv) != "SN":
        raise OdmowaOdwzorowaniaZU(
            KOD_NAPIECIE_SPOZA_SN,
            f"Zespół uziemiający dotyczy sieci SN — napięcie {liczba_pl(napiecie_sieci_kv)} kV "
            "leży poza pasmem SN.",
        )
    if charakter_sieci is not None and charakter_sieci not in CHARAKTERY_SIECI:
        raise OdmowaOdwzorowaniaZU(
            KOD_CHARAKTER_NIEZNANY,
            "Charakter sieci: dozwolone „sieć kablowa” albo „sieć kablowo-napowietrzna”.",
        )
    charakter = cast(CharakterSieci | None, charakter_sieci)
    dane: list[DanaPrzyjeta] = []
    if pozycja_ref is None:
        pozycja = zespol_uziemiajacy(napiecie_sieci_kv, wariant_proponowany(charakter))
        dane.append(_dana_propozycji_wariantu(pozycja, charakter))
        propozycja = True
    else:
        znaleziona = get_mv_neutral_grounding(pozycja_ref)
        if znaleziona is None:
            raise OdmowaOdwzorowaniaZU(
                KOD_POZYCJA_NIEZNANA,
                "Katalog nie zna wskazanego sposobu uziemienia punktu neutralnego.",
            )
        pozycja = znaleziona
        propozycja = False
        if pozycja.napiecie_sieci_kv is not None and pozycja.napiecie_sieci_kv != napiecie_sieci_kv:
            raise OdmowaOdwzorowaniaZU(
                KOD_NAPIECIE_NIEZGODNE,
                f"Zespół „{pozycja.label_pl}” jest wyprowadzony dla sieci "
                f"{liczba_pl(pozycja.napiecie_sieci_kv)} kV, a sieć ma "
                f"{liczba_pl(napiecie_sieci_kv)} kV — wybierz zespół dla napięcia sieci.",
            )

    r_n, x_n = pozycja.r_ohm, pozycja.x_ohm
    if pozycja.grounding_type == "petersen_coil" and (x_n is None or x_n <= 0):
        x_n, dana = _dana_nastawy_dlawika(napiecie_sieci_kv)
        dane.append(dana)
    # Ten sam predykat spójności, który czyta walidator (E-W5-01) i operacja GPZ: pozycja
    # rezystora bez R_N jest błędem katalogu, nie danych projektanta.
    blad = blad_konfiguracji_uziemienia(pozycja.grounding_type, r_n, x_n)
    if blad is not None:  # pragma: no cover - niezmiennik katalogu (test pozycji)
        raise AssertionError(f"pozycja {pozycja.id}: {blad}")
    grounding = GroundingConfig(type=pozycja.grounding_type, r_ohm=r_n, x_ohm=x_n)

    r0: float | None = None
    x0: float | None = None
    if uziemienie_grounded(pozycja.grounding_type):
        prop_r0, prop_x0 = propozycje_impedancji_zerowej_transformatora_uziemiajacego()
        dane.extend((dana_przyjeta_z_propozycji(prop_r0), dana_przyjeta_z_propozycji(prop_x0)))
        z0 = impedancja_zerowa_zespolu_uziemiajacego_ohm(
            complex(prop_r0.wartosc, prop_x0.wartosc), impedancja_punktu_neutralnego_ohm(r_n, x_n)
        )
        r0, x0 = z0.real, z0.imag
        wyjasnienie = (
            f"Punkt neutralny sieci {liczba_pl(napiecie_sieci_kv)} kV: "
            f"{ETYKIETA_PL_PUNKTU_NEUTRALNEGO[pozycja.grounding_type]} — „{pozycja.label_pl}”. "
            f"Impedancja zerowa zespołu widziana z szyn SN Z_0 = Z_T0 + 3·Z_N = "
            f"{liczba_pl(round(r0, 4))} + j{liczba_pl(round(x0, 4))} Ω "
            "(nośnik: Source.r0_ohm/x0_ohm równoważnika na szynach SN)."
        )
    else:
        wyjasnienie = (
            f"Punkt neutralny sieci {liczba_pl(napiecie_sieci_kv)} kV: "
            f"{ETYKIETA_PL_PUNKTU_NEUTRALNEGO[pozycja.grounding_type]} — „{pozycja.label_pl}”; "
            "brak bocznika składowej zerowej (bez R0/X0)."
        )
    return OdwzorowanieZespoluUziemiajacego(
        pozycja_ref=pozycja.id,
        propozycja=propozycja,
        napiecie_sieci_kv=napiecie_sieci_kv,
        neutral_grounding=grounding,
        r0_ohm=r0,
        x0_ohm=x0,
        dane_przyjete=tuple(dane),
        wyjasnienie_pl=wyjasnienie,
    )
