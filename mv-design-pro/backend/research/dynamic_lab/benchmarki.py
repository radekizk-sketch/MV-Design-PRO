"""Drabina walidacyjna L0–L4 + mierzone porównanie integratorów.

KOD BADAWCZY — patrz `backend/research/README.md`.

Drabina jest tak zbudowana, żeby WYKRYWAŁA defekty znalezione w audycie —
to jest kryterium doboru przypadków, nie estetyka:

| Poziom | Przypadek | Jaki defekt wykrywa |
|---|---|---|
| L0 | wyrocznia analityczna wahań | błędne równania maszyny (P0-03) |
| L1 | maszyna vs szyna sztywna | brak sprzężenia z siecią (P0-02), zły punkt startowy (P0-04) |
| L2 | dwie maszyny | brak interakcji między elementami (P0-02) |
| L3 | zwarcie z wyłączeniem | zdarzenie jako stała zamiast modelu (P0-06) |
| L4 | sieć SN z DER | niezależność wyniku od urządzenia (P0-07) |

Świadoma granica: nie ma tu poziomu „zgodność z narzędziem zewnętrznym" —
w środowisku sesji nie było dostępnego, niezależnego narzędzia dynamicznego.
Ta luka jest zapisana w pakiecie decyzyjnym, a NIE zasłonięta porównaniem
implementacji z samą sobą.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from dynamic_lab.calkowanie import INTEGRATORY
from dynamic_lab.regulatory import RegulatorNapiecia, RegulatorTurbiny
from dynamic_lab.siec import Galaz, TopologiaSieci
from dynamic_lab.silnik import ModelDynamiczny, SilnikRMS
from dynamic_lab.urzadzenia import (
    FalownikGFL,
    MaszynaSynchroniczna4Rzedu,
    OdbiorStalejMocy,
    ZespolSynchroniczny,
)
from dynamic_lab.zdarzenia import HarmonogramZdarzen, ZdjecieZwarcia, ZwarcieDoziemne


def maszyna_klasyczna(
    ref: str = "G1",
    szyna: str = "GEN",
    *,
    x_pu: float = 0.30,
    h_s: float = 4.0,
    d_tlumienie: float = 0.0,
) -> MaszynaSynchroniczna4Rzedu:
    """Maszyna zredukowana DOKŁADNIE do modelu klasycznego (``Xd=Xd'=Xq=Xq'``, ``Ra=0``).

    Przy tych parametrach człony ``(Xd-Xd')*Id`` i ``(Xq-Xq')*Iq`` znikają, więc
    ``E'q -> Efd = const`` i ``E'd -> 0``: model 4. rzędu redukuje się do
    klasycznego. To czyni go porównywalnym z wyrocznią analityczną — redukcja
    jest własnością równań, nie osobnym kodem „na potrzeby testu".
    """
    return MaszynaSynchroniczna4Rzedu(
        ref=ref,
        szyna=szyna,
        h_s=h_s,
        d_tlumienie=d_tlumienie,
        ra_pu=0.0,
        xd_pu=x_pu,
        xq_pu=x_pu,
        xd_prim_pu=x_pu,
        xq_prim_pu=x_pu,
        td0_prim_s=8.0,
        tq0_prim_s=0.4,
    )


def smib(
    *,
    x_linii_pu: float = 0.15,
    r_linii_pu: float = 0.0,
    h_s: float = 4.0,
    d_tlumienie: float = 0.0,
    klasyczna: bool = True,
    z_regulatorami: bool = False,
) -> tuple[ModelDynamiczny, dict[str, complex]]:
    """L1: pojedyncza maszyna na szynie sztywnej (single machine — infinite bus)."""
    topo = TopologiaSieci(
        szyny=("GEN", "SYS"),
        galezie=[Galaz("GEN", "SYS", r_pu=r_linii_pu, x_pu=x_linii_pu)],
        szyny_sztywne={"SYS": complex(1.0, 0.0)},
    )
    if klasyczna:
        maszyna = maszyna_klasyczna(h_s=h_s, d_tlumienie=d_tlumienie)
    else:
        maszyna = MaszynaSynchroniczna4Rzedu(
            ref="G1", szyna="GEN", h_s=h_s, d_tlumienie=d_tlumienie, ra_pu=0.005
        )
    zespol = ZespolSynchroniczny(
        maszyna=maszyna,
        avr=RegulatorNapiecia() if z_regulatorami else None,
        governor=RegulatorTurbiny() if z_regulatorami else None,
    )
    return ModelDynamiczny(topologia=topo, urzadzenia=[zespol]), {
        "G1": complex(0.5, 0.1)
    }


def dwie_maszyny() -> tuple[ModelDynamiczny, dict[str, complex]]:
    """L2: dwie maszyny + odbiór — sprawdza INTERAKCJĘ między urządzeniami.

    W audytowanym silniku elementy były całkowane niezależnie, więc dwie maszyny
    nie mogły na siebie wpłynąć. Tutaj dzielą tę samą sieć.
    """
    topo = TopologiaSieci(
        szyny=("G1B", "G2B", "ODB", "SYS"),
        galezie=[
            Galaz("G1B", "ODB", 0.01, 0.12),
            Galaz("G2B", "ODB", 0.01, 0.18),
            Galaz("ODB", "SYS", 0.01, 0.10),
        ],
        szyny_sztywne={"SYS": complex(1.0, 0.0)},
    )
    z1 = ZespolSynchroniczny(
        maszyna=MaszynaSynchroniczna4Rzedu(
            ref="G1", szyna="G1B", h_s=4.0, d_tlumienie=2.0
        ),
        avr=RegulatorNapiecia(),
        governor=RegulatorTurbiny(),
    )
    z2 = ZespolSynchroniczny(
        maszyna=MaszynaSynchroniczna4Rzedu(
            ref="G2", szyna="G2B", h_s=6.0, d_tlumienie=3.0
        ),
        avr=RegulatorNapiecia(),
        governor=RegulatorTurbiny(),
    )
    odbior = OdbiorStalejMocy(ref="L1", szyna="ODB", p_pu=-0.9, q_pu=-0.2)
    model = ModelDynamiczny(topologia=topo, urzadzenia=[z1, z2, odbior])
    return model, {
        "G1": complex(0.5, 0.15),
        "G2": complex(0.4, 0.10),
        "L1": complex(-0.9, -0.2),
    }


def siec_sn_z_der(
    *, i_max_pu: float = 1.2, k_frt: float = 2.0
) -> tuple[ModelDynamiczny, dict[str, complex]]:
    """L4: sieć SN zdominowana przez DER — przypadek istotny dla MV-DESIGN-PRO.

    GPZ (szyna sztywna) — magistrala SN — dwa DER przekształtnikowe i odbiór.
    Ten układ wykrywa defekt P0-07: wynik MUSI zależeć od parametrów urządzenia.
    """
    topo = TopologiaSieci(
        szyny=("GPZ", "SN1", "SN2", "DER1", "DER2"),
        galezie=[
            Galaz("GPZ", "SN1", 0.02, 0.08),
            Galaz("SN1", "SN2", 0.04, 0.10),
            Galaz("SN1", "DER1", 0.03, 0.09),
            Galaz("SN2", "DER2", 0.05, 0.12),
        ],
        szyny_sztywne={"GPZ": complex(1.0, 0.0)},
    )
    der1 = FalownikGFL(
        ref="DER1", szyna="DER1", i_max_pu=i_max_pu, k_frt=k_frt, t_p_s=0.05, t_q_s=0.05
    )
    der2 = FalownikGFL(
        ref="DER2", szyna="DER2", i_max_pu=i_max_pu, k_frt=k_frt, t_p_s=0.08, t_q_s=0.08
    )
    odbior = OdbiorStalejMocy(ref="ODB", szyna="SN2", p_pu=-0.5, q_pu=-0.15)
    model = ModelDynamiczny(topologia=topo, urzadzenia=[der1, der2, odbior])
    return model, {
        "DER1": complex(0.6, 0.0),
        "DER2": complex(0.4, 0.0),
        "ODB": complex(-0.5, -0.15),
    }


def harmonogram_zwarcia(
    *,
    szyna: str,
    chwila_s: float = 0.5,
    czas_trwania_s: float = 0.15,
    x_f_pu: float = 0.0,
) -> HarmonogramZdarzen:
    """L3: zwarcie z wyłączeniem — zdarzenie zmieniające MODEL, nie napięcie."""
    return HarmonogramZdarzen(
        [
            ZwarcieDoziemne(czas_s=chwila_s, szyna=szyna, x_f_pu=x_f_pu),
            ZdjecieZwarcia(czas_s=chwila_s + czas_trwania_s, szyna=szyna),
        ]
    )


@dataclass(frozen=True)
class WynikPorownaniaIntegratora:
    """Zmierzone własności jednego integratora na wspólnym zadaniu."""

    nazwa: str
    krok_s: float
    blad_max_vs_odniesienie: float
    ewaluacje_pochodnych: int
    zbiegl: bool
    czestotliwosc_oscylacji_hz: float | None


def porownaj_integratory(
    *,
    kroki_s: tuple[float, ...] = (0.001, 0.005, 0.010, 0.020),
    czas_koncowy_s: float = 5.0,
    krok_odniesienia_s: float = 0.0002,
) -> list[WynikPorownaniaIntegratora]:
    """Porównaj integratory na zadaniu SMIB z impulsem kątowym.

    Odniesieniem jest RK4 z bardzo małym krokiem — to jest porównanie metod
    numerycznych między sobą, NIE walidacja fizyki (tę robi wyrocznia
    analityczna w ``walidacja.WyroczniaWahan``). Rozróżnienie jest istotne:
    zgodność dwóch metod całkowania nie dowodzi, że model jest poprawny.
    """
    from dynamic_lab.walidacja import zmierz_czestotliwosc_oscylacji

    def przebieg(
        nazwa_integratora: str, krok: float
    ) -> tuple[np.ndarray, np.ndarray, int, bool]:
        model, moce = smib(d_tlumienie=1.0)
        silnik = SilnikRMS(model, integrator=nazwa_integratora, krok_s=krok)
        x0 = silnik.inicjalizuj(moce)
        x_start = x0.copy()
        x_start[0] += np.radians(5.0)
        wynik = silnik.symuluj(x_start, czas_koncowy_s=czas_koncowy_s)
        czas = np.array(wynik.czas_s)
        delta = np.array(wynik.sygnal("delta_rad", "G1").wartosci)
        return (
            czas,
            delta,
            wynik.diagnostyka.ewaluacje_pochodnych,
            wynik.diagnostyka.zbiegl,
        )

    t_ref, d_ref, _, _ = przebieg("rk4", krok_odniesienia_s)
    wyniki: list[WynikPorownaniaIntegratora] = []
    for nazwa in sorted(INTEGRATORY):
        for krok in kroki_s:
            try:
                t, d, ewaluacje, zbiegl = przebieg(nazwa, krok)
            except Exception:  # noqa: BLE001 - niepowodzenie JEST wynikiem pomiaru
                wyniki.append(
                    WynikPorownaniaIntegratora(
                        nazwa=nazwa,
                        krok_s=krok,
                        blad_max_vs_odniesienie=float("inf"),
                        ewaluacje_pochodnych=0,
                        zbiegl=False,
                        czestotliwosc_oscylacji_hz=None,
                    )
                )
                continue
            d_interp = np.interp(t, t_ref, d_ref)
            blad = float(np.max(np.abs(d - d_interp))) if d.size else float("inf")
            wyniki.append(
                WynikPorownaniaIntegratora(
                    nazwa=nazwa,
                    krok_s=krok,
                    blad_max_vs_odniesienie=blad,
                    ewaluacje_pochodnych=ewaluacje,
                    zbiegl=zbiegl,
                    czestotliwosc_oscylacji_hz=zmierz_czestotliwosc_oscylacji(t, d),
                )
            )
    return wyniki
