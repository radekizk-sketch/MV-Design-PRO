"""Obciążenie gałęzi z prądów OBU zacisków — jedno źródło definicji (decyzje O-46, O-51).

Gałąź z susceptancją poprzeczną (kabel, linia) albo z przekładnią (transformator) ma na
końcach RÓŻNE prądy. Obciążalność dotyczy gałęzi, nie jednej strony, więc o obciążeniu
decyduje zacisk o większym stosunku prądu do prądu znamionowego TEGO zacisku:

    ε = 100 % · max(I_od / I_r,od ; I_do / I_r,do)

- linia i kabel: ten sam prąd znamionowy (obciążalność z modelu) na obu zaciskach;
- transformator: prąd znamionowy zacisku I_r = S_n / (√3 · U_n,strona) z mocy znamionowej
  i napięcia znamionowego strony (`pochodne.prad_znamionowy_a`, IEC 60076-1). Zacisk `od`
  jest stroną GN z definicji gałęzi transformatorowej: przekładnia jest odniesiona do
  strony `from` = GN (`network_model/core/branch.py`), a mapowanie ENM buduje
  `from_node_id` z `hv_bus_ref` (`enm/mapping.py`).

Prąd zacisku `od` pochodzi z rdzenia rozpływu (FROZEN `branch_current_ka`, prąd strony
`from`). Prąd zacisku `do` pochodzi z mocy strony `to` (FROZEN `branch_s_to_mva`) i
napięcia węzła `to`: I = |S| / (√3 · U) (`pochodne.prad_z_mocy_pozornej_ka`). Moduł nie
liczy fizyki sieci — przelicza wielkości wyniku przez listę dozwoloną `pochodne`.

Brak danej (prąd zacisku, prąd znamionowy, moc albo napięcie znamionowe strony) daje
obciążenie `None` z NAZWANYM powodem, nigdy zero ani wartość zastępczą.

Konsumenci — jedyne miejsca liczenia obciążenia gałęzi z wyniku rozpływu:
`enm/canonical_analysis.py::build_branch_results` (tabela gałęzi),
`analysis/energy_validation/builder.py` (kontrole obciążenia linii i transformatorów),
`application/analyses/sanity_bounds.py` (pasma wiarygodności obciążenia),
`analysis/power_flow/analysis.py::_build_violations` (naruszenia prądowe),
`analysis/power_flow_interpretation/builder.py` (ustalenia obciążenia gałęzi).

Prąd ZACISKU (bez obciążenia) czytają z tabeli gałęzi (kolumny `i_a` — zacisk `od`,
`i_do_a` — zacisk `do`) wyłącznie przez zacisk rozstrzygnięty jawnie: pakiet nastaw
(`protection_settings/batch_run.py`, zacisk zabezpieczenia), arkusz obwodów nN
(`application/analyses/nn_circuit_sheet.py`, zacisk od strony rozdzielnicy wzdłuż
trasy) i prąd roboczy urządzeń koordynacji (frontend, miejsce z
`zacisk_zabezpieczenia.miejsce_urzadzenia`).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal

from network_model.core.branch import Branch, LineBranch, TransformerBranch
from network_model.pochodne import ka_na_a, prad_z_mocy_pozornej_ka, prad_znamionowy_a

Zacisk = Literal["od", "do"]

#: Względna tolerancja równości stosunków I/I_r obu zacisków (wynik bezwymiarowy).
#: Transformator modelowany gałęzią szeregową z przekładnią ma na obu zaciskach TEN SAM
#: prąd względny, więc oba stosunki są równe z definicji; obliczone dwiema drogami
#: (prąd strony `od` z rdzenia rozpływu, prąd strony `do` z mocy i napięcia węzła) różnią
#: się o ostatni bit (pomiar na scenie walidacji: 2,45·10⁻¹⁶ względnie), a kierunek tej
#: różnicy zależy od platformy i biblioteki numerycznej. Bez tolerancji reguła „przy
#: równości decyduje zacisk `od`” nie działała i zacisk decydujący zmieniał się między
#: maszynami CI. 10⁻⁹ leży o siedem rzędów nad szumem arytmetyki podwójnej precyzji i
#: o cztery rzędy pod najmniejszą różnicą fizyczną spotykaną w sieciach SN (prąd
#: ładowania kabla: ok. 10⁻⁵ względnie), więc nie zmienia rozstrzygnięć fizycznych.
TOLERANCJA_WZGLEDNA_ROWNOSCI_STOSUNKOW = 1e-9

POWOD_BRAK_GALEZI_PL = "Gałęzi nie ma w modelu biegu — brak danych znamionowych."
POWOD_BRAK_PRADU_ZNAMIONOWEGO_PL = "Brak prądu znamionowego (obciążalności) gałęzi w modelu."
POWOD_BRAK_MOCY_ZNAMIONOWEJ_PL = "Brak mocy znamionowej S_n transformatora w modelu."
POWOD_BRAK_NAPIECIA_GN_PL = "Brak napięcia znamionowego strony GN transformatora w modelu."
POWOD_BRAK_NAPIECIA_DN_PL = "Brak napięcia znamionowego strony DN transformatora w modelu."
POWOD_RODZAJ_BEZ_ZNAMIONOWYCH_PL = "Rodzaj gałęzi nie ma prądu znamionowego w modelu."
POWOD_BRAK_PRADU_OD_PL = "Brak prądu zacisku początkowego w wyniku rozpływu."
POWOD_BRAK_PRADU_DO_PL = (
    "Brak prądu zacisku końcowego w wyniku rozpływu (brak mocy strony końcowej albo "
    "napięcia węzła końcowego)."
)


@dataclass(frozen=True)
class PradyZnamionoweZaciskow:
    """Prąd znamionowy każdego zacisku gałęzi [A] — z modelu, nie z wyniku."""

    od_a: float
    do_a: float


@dataclass(frozen=True)
class ObciazenieGalezi:
    """Obciążenie gałęzi z prądów obu zacisków albo nazwany brak.

    `obciazenie_pct` i `zacisk_decydujacy` są jednocześnie znane albo jednocześnie
    `None`; wtedy `powod_braku_pl` nazywa pierwszą brakującą daną.
    """

    prad_od_a: float | None
    prad_do_a: float | None
    prad_znamionowy_od_a: float | None
    prad_znamionowy_do_a: float | None
    obciazenie_pct: float | None
    zacisk_decydujacy: Zacisk | None
    powod_braku_pl: str | None

    @property
    def prad_decydujacy_a(self) -> float | None:
        """Prąd zacisku, który decyduje o obciążeniu [A] (`None`, gdy nie policzono)."""
        if self.zacisk_decydujacy == "od":
            return self.prad_od_a
        if self.zacisk_decydujacy == "do":
            return self.prad_do_a
        return None

    @property
    def prad_znamionowy_decydujacy_a(self) -> float | None:
        """Prąd znamionowy zacisku decydującego [A] (`None`, gdy nie policzono)."""
        if self.zacisk_decydujacy == "od":
            return self.prad_znamionowy_od_a
        if self.zacisk_decydujacy == "do":
            return self.prad_znamionowy_do_a
        return None


def _dodatnia_skonczona(wartosc: float | None) -> bool:
    return wartosc is not None and math.isfinite(wartosc) and wartosc > 0.0


def prad_zacisku_od_a(prad_od_ka: float | None) -> float | None:
    """Prąd zacisku `od` [A] z prądu strony `from` rdzenia rozpływu [kA]."""
    if prad_od_ka is None or not math.isfinite(prad_od_ka):
        return None
    return ka_na_a(abs(prad_od_ka))


def prad_zacisku_do_a(moc_do_mva: complex | None, napiecie_do_kv: float | None) -> float | None:
    """Prąd zacisku `do` [A] z mocy strony `to` [MVA] i napięcia węzła `to` [kV].

    I = |S| / (√3 · U) przez listę dozwoloną `pochodne`. Brak mocy albo napięcia,
    napięcie niedodatnie albo nieskończone daje `None` (węzeł bez napięcia nie ma
    prądu wyliczalnego z mocy), nigdy zero.
    """
    if moc_do_mva is None or not _dodatnia_skonczona(napiecie_do_kv):
        return None
    modul = abs(moc_do_mva)
    if not math.isfinite(modul):
        return None
    assert napiecie_do_kv is not None  # zawężenie dla mypy — sprawdzone wyżej
    return ka_na_a(prad_z_mocy_pozornej_ka(modul, napiecie_do_kv))


def prady_znamionowe_zaciskow(
    galaz: Branch | None,
) -> PradyZnamionoweZaciskow | str:
    """Prąd znamionowy obu zacisków gałęzi [A] albo nazwany powód braku (tekst PL)."""
    if galaz is None:
        return POWOD_BRAK_GALEZI_PL
    if isinstance(galaz, TransformerBranch):
        if not _dodatnia_skonczona(galaz.rated_power_mva):
            return POWOD_BRAK_MOCY_ZNAMIONOWEJ_PL
        if not _dodatnia_skonczona(galaz.voltage_hv_kv):
            return POWOD_BRAK_NAPIECIA_GN_PL
        if not _dodatnia_skonczona(galaz.voltage_lv_kv):
            return POWOD_BRAK_NAPIECIA_DN_PL
        return PradyZnamionoweZaciskow(
            od_a=prad_znamionowy_a(galaz.rated_power_mva, galaz.voltage_hv_kv),
            do_a=prad_znamionowy_a(galaz.rated_power_mva, galaz.voltage_lv_kv),
        )
    if isinstance(galaz, LineBranch):
        if not _dodatnia_skonczona(galaz.rated_current_a):
            return POWOD_BRAK_PRADU_ZNAMIONOWEGO_PL
        return PradyZnamionoweZaciskow(od_a=galaz.rated_current_a, do_a=galaz.rated_current_a)
    return POWOD_RODZAJ_BEZ_ZNAMIONOWYCH_PL


def obciazenie_galezi(
    galaz: Branch | None,
    *,
    prad_od_a: float | None,
    prad_do_a: float | None,
) -> ObciazenieGalezi:
    """Obciążenie gałęzi [%] z prądów obu zacisków wobec prądów znamionowych zacisków
    wyprowadzonych z MODELU gałęzi (`prady_znamionowe_zaciskow`)."""
    return obciazenie_z_pradow_zaciskow(
        prady_znamionowe_zaciskow(galaz), prad_od_a=prad_od_a, prad_do_a=prad_do_a
    )


def obciazenie_z_pradow_zaciskow(
    znamionowe: PradyZnamionoweZaciskow | str,
    *,
    prad_od_a: float | None,
    prad_do_a: float | None,
) -> ObciazenieGalezi:
    """Obciążenie [%] = 100 · max(I_od / I_r,od ; I_do / I_r,do) — jedyna definicja.

    `znamionowe` to prądy znamionowe zacisków (z modelu albo z jawnego limitu wejścia
    rozpływu) albo nazwany powód ich braku. Decyduje zacisk o większym stosunku I / I_r;
    przy równości w granicach `TOLERANCJA_WZGLEDNA_ROWNOSCI_STOSUNKOW` — zacisk `od`
    (wynik deterministyczny niezależnie od platformy). Brak którejkolwiek danej daje
    `obciazenie_pct = None` z powodem: najpierw brak danych znamionowych, potem brak
    prądu zacisku w wyniku.
    """
    ir_od = znamionowe.od_a if isinstance(znamionowe, PradyZnamionoweZaciskow) else None
    ir_do = znamionowe.do_a if isinstance(znamionowe, PradyZnamionoweZaciskow) else None

    powod: str | None = None
    if isinstance(znamionowe, str):
        powod = znamionowe
    elif not (_dodatnia_skonczona(ir_od) and _dodatnia_skonczona(ir_do)):
        powod = POWOD_BRAK_PRADU_ZNAMIONOWEGO_PL
    elif prad_od_a is None or not math.isfinite(prad_od_a):
        powod = POWOD_BRAK_PRADU_OD_PL
    elif prad_do_a is None or not math.isfinite(prad_do_a):
        powod = POWOD_BRAK_PRADU_DO_PL

    if powod is not None or ir_od is None or ir_do is None:
        return ObciazenieGalezi(
            prad_od_a=prad_od_a,
            prad_do_a=prad_do_a,
            prad_znamionowy_od_a=ir_od,
            prad_znamionowy_do_a=ir_do,
            obciazenie_pct=None,
            zacisk_decydujacy=None,
            powod_braku_pl=powod,
        )
    assert prad_od_a is not None and prad_do_a is not None  # zawężenie dla mypy
    stosunek_od = abs(prad_od_a) / ir_od
    stosunek_do = abs(prad_do_a) / ir_do
    rowne = math.isclose(
        stosunek_do, stosunek_od, rel_tol=TOLERANCJA_WZGLEDNA_ROWNOSCI_STOSUNKOW, abs_tol=0.0
    )
    zacisk: Zacisk = "do" if stosunek_do > stosunek_od and not rowne else "od"
    return ObciazenieGalezi(
        prad_od_a=prad_od_a,
        prad_do_a=prad_do_a,
        prad_znamionowy_od_a=ir_od,
        prad_znamionowy_do_a=ir_do,
        obciazenie_pct=max(stosunek_od, stosunek_do) * 100.0,
        zacisk_decydujacy=zacisk,
        powod_braku_pl=None,
    )


__all__ = [
    "ObciazenieGalezi",
    "PradyZnamionoweZaciskow",
    "Zacisk",
    "obciazenie_galezi",
    "obciazenie_z_pradow_zaciskow",
    "prad_zacisku_do_a",
    "prad_zacisku_od_a",
    "prady_znamionowe_zaciskow",
]
