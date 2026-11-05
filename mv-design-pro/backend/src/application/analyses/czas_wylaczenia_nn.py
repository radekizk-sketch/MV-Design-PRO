"""Czas wyłączenia zwarcia obwodu nN — jeden dostawca dla arkusza obwodów i dowodu obwodu nN.

Karta EDYTOR-DELT-SCENARIUSZA-ZABEZPIECZEN (pakiet 6a). Wytrzymałość cieplna przewodu
(I²t ≤ k²S², ``conductor_thermal_withstand``) potrzebuje czasu, w którym aparat obwodu wyłączy
zwarcie. Dawniej był parametrem żądania (``fault_duration_s``) bez kontrolki i bez źródła.

PIERWSZEŃSTWO (jedno miejsce rozstrzygnięcia, wołający nie wyliczają go po swojemu):
  1. wartość projektanta na aparacie — ``czas_wylaczenia_zwarcia_s`` gałęzi łącznika albo
     bezpiecznika (dana projektu, kompletność dowodu PEŁNY);
  2. charakterystyka czasowo-prądowa aparatu z katalogu przy prądzie zwarciowym obwodu — solver
     ``network_model.solvers.protection_lv_curves`` (WHITE BOX, ślad w wyniku):
       * wyłącznik MCB (IEC 60898-1): wyzwolenie magnetyczne GWARANTOWANE od górnej granicy
         pasma klasy B/C/D → czas ≤ 0,1 s (przyjęto górną granicę);
       * wyłącznik MCCB z wyzwalaczem elektronicznym (IEC 60947-2): stopień nastaw Ir/Isd/Ii,
         do którego należy prąd → tr / tsd / 0,1 s;
       * wkładka gG (IEC 60269-1): katalog niesie wyłącznie bramki umowne Inf/If przy czasie
         umownym 1–4 h, a rejestr bramek krótkoczasowych jest pusty (``FUSE_GG_BRAMKA_T_
         WYMAGANY_MULTIPLIER``) — charakterystyka nie wyznacza czasu zwarciowego;
     prąd w paśmie, w którym norma nie gwarantuje zadziałania, nie daje czasu (zakaz interpolacji);
  3. wartość robocza ``ESTIMATED`` — najdłuższy czas dopuszczony przez PN-HD 60364-4-41
     (``wartosci_robocze.czas_wylaczenia_roboczy_nn``), dana przyjęta, kompletność NIEPEŁNY.

Moduł nie liczy fizyki — wybiera źródło i woła solver krzywych.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from application.analyses.nn_device_selection import KIND_FUSE_SWITCH, KIND_MCB, KIND_MCCB
from application.proof_engine.packs.lv_circuit_verification import UrzadzenieOchronneNn
from enm.models import FuseBranch, SwitchBranch
from network_model.catalog.wartosci_robocze import (
    czas_wylaczenia_roboczy_nn,
    dana_przyjeta_czasu_wylaczenia_nn,
    rozstrzygnij_rodzaj_obwodu_nn,
)
from network_model.odmowa_danych import OdmowaDanychError
from network_model.solvers.protection_lv_curves import (
    FUSE_GG_BRAMKA_T_WYMAGANY_STATUS_PL,
    GwarancjaNormy,
    compute_fuse_gg_gate,
    compute_mcb_magnetic_point,
    compute_mccb_point,
)
from werdykt import DanaPrzyjeta

ZrodloCzasu = Literal["projektant", "charakterystyka_aparatu", "wartosc_robocza"]


@dataclass(frozen=True)
class CzasWylaczeniaNn:
    """Czas wyłączenia zwarcia obwodu nN z pochodzeniem i wyjaśnieniem."""

    czas_s: float
    zrodlo: ZrodloCzasu
    wyjasnienie_pl: str
    dane_przyjete: tuple[DanaPrzyjeta, ...] = ()
    slad_charakterystyki: dict[str, Any] | None = field(default=None)

    @property
    def kompletnosc_dowodu(self) -> Literal["PELNY", "NIEPELNY"]:
        return "NIEPELNY" if self.dane_przyjete else "PELNY"

    def to_dict(self) -> dict[str, Any]:
        return {
            "czas_s": self.czas_s,
            "zrodlo": self.zrodlo,
            "wyjasnienie_pl": self.wyjasnienie_pl,
            "kompletnosc_dowodu": self.kompletnosc_dowodu,
            "dane_przyjete": [d.model_dump(mode="json") for d in self.dane_przyjete],
            "slad_charakterystyki": self.slad_charakterystyki,
        }


def _czas_z_charakterystyki(
    urzadzenie: UrzadzenieOchronneNn, ik_a: float
) -> tuple[float | None, str, dict[str, Any] | None]:
    """(czas [s] albo ``None``, zdanie, ślad solvera) z charakterystyki aparatu przy ``ik_a``."""
    try:
        if urzadzenie.kind == KIND_MCB:
            if urzadzenie.klasa_mcb is None:
                return None, "wyłącznik MCB bez klasy wyzwalania w katalogu", None
            mcb = compute_mcb_magnetic_point(
                i_query_a=ik_a, in_a=urzadzenie.in_a, curve_class=urzadzenie.klasa_mcb
            )
            if mcb.gwarancja == GwarancjaNormy.WYZWOLENIE_GWARANTOWANE and mcb.t_umowny_s:
                return (
                    mcb.t_umowny_s,
                    f"charakterystyka MCB klasy {urzadzenie.klasa_mcb} (IEC 60898-1): "
                    f"{mcb.podstawa_pl} Przyjęto górną granicę {mcb.t_umowny_s:g} s.",
                    mcb.white_box_trace,
                )
            return None, mcb.podstawa_pl, mcb.white_box_trace
        if urzadzenie.kind == KIND_MCCB:
            mccb = compute_mccb_point(
                i_query_a=ik_a,
                ir_a=urzadzenie.ir_a,
                isd_a=urzadzenie.isd_a,
                ii_a=urzadzenie.ii_a,
                tr_s=urzadzenie.tr_s,
                tsd_s=urzadzenie.tsd_s,
            )
            if mccb.t_wyzwolenia_s is not None:
                return (
                    mccb.t_wyzwolenia_s,
                    f"charakterystyka wyzwalacza MCCB (IEC 60947-2): {mccb.podstawa_pl}"
                    + (f" {mccb.zalozenie_pl}" if mccb.zalozenie_pl else ""),
                    mccb.white_box_trace,
                )
            return None, mccb.podstawa_pl, mccb.white_box_trace
        if urzadzenie.kind == KIND_FUSE_SWITCH:
            gg = compute_fuse_gg_gate(i_query_a=ik_a, in_a=urzadzenie.in_a)
            return (
                None,
                f"{gg.podstawa_pl} Bramki umowne nie wyznaczają czasu zwarciowego: "
                f"{FUSE_GG_BRAMKA_T_WYMAGANY_STATUS_PL}",
                gg.white_box_trace,
            )
    except OdmowaDanychError as exc:
        return None, f"charakterystyka aparatu nieocenialna: {exc}", None
    return None, f"aparat rodzaju {urzadzenie.kind} bez charakterystyki czasowo-prądowej", None


def czas_wylaczenia_obwodu_nn(
    *,
    aparat: SwitchBranch | FuseBranch | None,
    urzadzenie: UrzadzenieOchronneNn | None,
    ik_a: float | None,
    uklad: str | None,
    u0_v: float | None,
    miejsce_pl: str,
) -> CzasWylaczeniaNn:
    """Czas wyłączenia zwarcia obwodu nN wg pierwszeństwa z docstringu modułu.

    ``aparat`` — gałąź aparatu obwodu (nośnik wartości projektanta), ``urzadzenie`` — aparat
    rozwiązany z katalogu (charakterystyka), ``ik_a`` — prąd zwarciowy obwodu z biegu IEC 60909
    (``None`` — bez biegu charakterystyka nie jest pytana), ``uklad``/``u0_v`` — dla wartości
    roboczej normy, ``miejsce_pl`` — nazwa obwodu w danej przyjętej.
    """
    if aparat is not None and aparat.czas_wylaczenia_zwarcia_s is not None:
        return CzasWylaczeniaNn(
            czas_s=aparat.czas_wylaczenia_zwarcia_s,
            zrodlo="projektant",
            wyjasnienie_pl=(
                f"Czas wyłączenia zwarcia {aparat.czas_wylaczenia_zwarcia_s:g} s — wartość "
                f"projektanta na aparacie obwodu ({miejsce_pl})."
            ),
        )
    powod_bez_krzywej: str
    slad: dict[str, Any] | None = None
    if urzadzenie is None:
        powod_bez_krzywej = "aparat obwodu bez rozwiązanego typu katalogowego"
    elif ik_a is None:
        powod_bez_krzywej = (
            "brak prądu zwarciowego obwodu z biegu IEC 60909 — charakterystyka aparatu nie jest "
            "pytana"
        )
    else:
        czas, zdanie, slad = _czas_z_charakterystyki(urzadzenie, ik_a)
        if czas is not None:
            return CzasWylaczeniaNn(
                czas_s=czas,
                zrodlo="charakterystyka_aparatu",
                wyjasnienie_pl=(
                    f"Czas wyłączenia zwarcia {czas:g} s przy I″k {ik_a:.0f} A — {zdanie}"
                ),
                slad_charakterystyki=slad,
            )
        powod_bez_krzywej = zdanie
    # Rodzaj obwodu z JEDNEGO rozstrzygnięcia (pakiet 9) — ta sama klasyfikacja co werdykt SWZ.
    rodzaj = rozstrzygnij_rodzaj_obwodu_nn(
        rodzaj_projektanta=aparat.rodzaj_obwodu_nn if aparat is not None else None,
        in_a=urzadzenie.in_a if urzadzenie is not None else None,
    )
    roboczy = czas_wylaczenia_roboczy_nn(uklad=uklad, rodzaj=rodzaj, u0_v=u0_v)
    return CzasWylaczeniaNn(
        czas_s=roboczy.czas_s,
        zrodlo="wartosc_robocza",
        wyjasnienie_pl=f"{roboczy.uzasadnienie_pl} Charakterystyka nie dała czasu: {powod_bez_krzywej}.",
        dane_przyjete=(dana_przyjeta_czasu_wylaczenia_nn(miejsce_pl=miejsce_pl, czas=roboczy),),
        slad_charakterystyki=slad,
    )
