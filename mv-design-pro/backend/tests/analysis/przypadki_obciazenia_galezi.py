"""Iloczyn cech klasy P9 — obciążenie gałęzi z prądów OBU zacisków (decyzje O-46, O-51).

Cechy, w których defekt klasy mógłby się schować (reguła KLASA, NIE INSTANCJA):

- rodzaj gałęzi: linia napowietrzna, kabel z susceptancją poprzeczną, transformator
  110/15 kV z przekładnią zespoloną (Dyn11, zaczep poza zerem) — prądy znamionowe zacisków
  transformatora różnią się o przekładnię;
- zacisk decydujący: `od` albo `do` (większy iloraz prąd / prąd znamionowy zacisku);
- położenie wobec progu 100 %: poniżej (95 %), na progu (100 %), powyżej (105 %).

Dlaczego to klasa, a nie przypadek: gałąź z susceptancją albo z przekładnią ma na końcach
RÓŻNE prądy. Zmierzone różnice prądów zacisków w sieciach rejestru (sonda karty AB-1b.1 P9,
`scratchpad/ab1b1a/sonda_i_do_a.txt`): kabel `kab-magistrala` sieci G17 — 5,46 %, kabel
`kab-odplyw` sieci G16 — 1,18 %, linie ≤ 0,2 %. Obciążenie liczone z samego zacisku `from`
zaniżało więc obciążenie kabla o kilka procent tam, gdzie decyduje zacisk `to`.

Wyrocznia jest NIEZALEŻNA od kodu produktu: prąd znamionowy zacisku transformatora
liczony tu wprost ze wzoru I_r = S_n / (√3 · U_n,strona) (IEC 60076-1), a oczekiwane
obciążenie wynika z konstrukcji przypadku (współczynnik × 100 %).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal

from network_model.core.branch import BranchType, LineBranch, TransformerBranch

Rodzaj = Literal["linia", "kabel", "transformator"]
Zacisk = Literal["od", "do"]
Prog = Literal["ponizej", "na", "powyzej"]

RODZAJE: tuple[Rodzaj, ...] = ("linia", "kabel", "transformator")
ZACISKI: tuple[Zacisk, ...] = ("od", "do")
PROGI: tuple[Prog, ...] = ("ponizej", "na", "powyzej")

#: Współczynnik obciążenia zacisku decydującego dla położenia wobec progu 100 %.
WSPOLCZYNNIK: dict[Prog, float] = {"ponizej": 0.95, "na": 1.0, "powyzej": 1.05}
#: Zacisk NIEdecydujący ma iloraz mniejszy o 10 % — rozstrzygnięcie jest jednoznaczne.
UDZIAL_DRUGIEGO_ZACISKU = 0.9

S_N_TRANSFORMATORA_MVA = 25.0
U_GN_KV = 110.0
U_DN_KV = 15.0
#: Obciążalności dobrane tak, że prąd A → kA → A przechodzi bez błędu zaokrąglenia
#: (próg „na" jest wtedy DOKŁADNIE 100 % dla zacisku `od` linii i kabla).
OBCIAZALNOSC_LINII_A = 250.0
OBCIAZALNOSC_KABLA_A = 256.0


def prad_znamionowy_wyrocznia_a(s_n_mva: float, u_n_kv: float) -> float:
    """I_r = S_n / (√3 · U_n) [A] — wprost ze wzoru, bez kodu produktu."""
    return s_n_mva * 1000.0 / (math.sqrt(3.0) * u_n_kv)


def galaz(
    rodzaj: Rodzaj, *, od: str = "F", do: str = "T", ident: str = "G"
) -> LineBranch | TransformerBranch:
    """Gałąź danego rodzaju między węzłami `od` i `do` (dane znamionowe z modelu)."""
    if rodzaj == "transformator":
        return TransformerBranch(
            id=ident,
            name=f"Transformator {ident}",
            branch_type=BranchType.TRANSFORMER,
            from_node_id=od,
            to_node_id=do,
            in_service=True,
            rated_power_mva=S_N_TRANSFORMATORA_MVA,
            voltage_hv_kv=U_GN_KV,
            voltage_lv_kv=U_DN_KV,
            uk_percent=11.0,
            pk_kw=120.0,
            i0_percent=0.35,
            p0_kw=25.0,
            vector_group="Dyn11",
            tap_position=2,
            tap_step_percent=1.5,
        )
    kabel = rodzaj == "kabel"
    return LineBranch(
        id=ident,
        name=f"{'Kabel' if kabel else 'Linia'} {ident}",
        branch_type=BranchType.CABLE if kabel else BranchType.LINE,
        from_node_id=od,
        to_node_id=do,
        in_service=True,
        r_ohm_per_km=0.125 if kabel else 0.3,
        x_ohm_per_km=0.11 if kabel else 0.35,
        b_us_per_km=90.0 if kabel else 3.0,
        length_km=6.0,
        rated_current_a=OBCIAZALNOSC_KABLA_A if kabel else OBCIAZALNOSC_LINII_A,
    )


def prady_znamionowe_wyrocznia(rodzaj: Rodzaj) -> tuple[float, float]:
    """(I_r,od, I_r,do) [A] z wyroczni — transformator: strona `od` = GN (definicja gałęzi)."""
    if rodzaj == "transformator":
        return (
            prad_znamionowy_wyrocznia_a(S_N_TRANSFORMATORA_MVA, U_GN_KV),
            prad_znamionowy_wyrocznia_a(S_N_TRANSFORMATORA_MVA, U_DN_KV),
        )
    obciazalnosc = OBCIAZALNOSC_KABLA_A if rodzaj == "kabel" else OBCIAZALNOSC_LINII_A
    return obciazalnosc, obciazalnosc


def napiecie_zacisku_do_kv(rodzaj: Rodzaj) -> float:
    """Napięcie węzła `do` w rozwiązaniu (celowo różne od znamionowego)."""
    return 14.8 if rodzaj == "transformator" else 14.7


@dataclass(frozen=True)
class Przypadek:
    """Jeden punkt iloczynu cech z oczekiwanym wynikiem wyroczni."""

    rodzaj: Rodzaj
    decyduje: Zacisk
    prog: Prog
    prad_od_a: float
    prad_do_a: float
    prad_znamionowy_od_a: float
    prad_znamionowy_do_a: float
    napiecie_do_kv: float
    moc_do_mva: complex
    obciazenie_pct: float

    @property
    def nazwa(self) -> str:
        return f"{self.rodzaj}-decyduje_{self.decyduje}-{self.prog}"

    @property
    def dokladnie_na_progu(self) -> bool:
        """Próg „na" dokładnie 100 % bez błędu zaokrąglenia (zacisk `od` linii i kabla:
        prąd przechodzi A → kA → A bitowo, prąd znamionowy jest daną modelu)."""
        return self.prog == "na" and self.decyduje == "od" and self.rodzaj != "transformator"


def przypadek(rodzaj: Rodzaj, decyduje: Zacisk, prog: Prog) -> Przypadek:
    ir_od, ir_do = prady_znamionowe_wyrocznia(rodzaj)
    k = WSPOLCZYNNIK[prog]
    if decyduje == "od":
        prad_od, prad_do = k * ir_od, k * UDZIAL_DRUGIEGO_ZACISKU * ir_do
    else:
        prad_od, prad_do = k * UDZIAL_DRUGIEGO_ZACISKU * ir_od, k * ir_do
    u_do = napiecie_zacisku_do_kv(rodzaj)
    # |S_do| = √3 · U_do · I_do (strona `to` oddaje moc do węzła — kierunek bez znaczenia
    # dla modułu prądu); kąt dowolny, ustalony dla determinizmu.
    modul_s = math.sqrt(3.0) * u_do * prad_do / 1000.0
    moc_do = complex(-modul_s * math.cos(0.3), -modul_s * math.sin(0.3))
    return Przypadek(
        rodzaj=rodzaj,
        decyduje=decyduje,
        prog=prog,
        prad_od_a=prad_od,
        prad_do_a=prad_do,
        prad_znamionowy_od_a=ir_od,
        prad_znamionowy_do_a=ir_do,
        napiecie_do_kv=u_do,
        moc_do_mva=moc_do,
        obciazenie_pct=k * 100.0,
    )


def wszystkie_przypadki() -> list[Przypadek]:
    return [przypadek(r, z, p) for r in RODZAJE for z in ZACISKI for p in PROGI]
