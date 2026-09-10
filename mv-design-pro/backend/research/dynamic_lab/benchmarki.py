"""Przypadki odniesienia (oś C taksonomii) + mierzone porównanie integratorów.

KOD BADAWCZY — patrz `backend/research/README.md`.
Taksonomia i jej identyfikatory: `dynamic_lab.drabina`.

UWAGA NAZEWNICZA (naprawa kolizji). Wcześniejsza wersja tego modułu nazywała
przypadki „L0…L4", a `wzorzec_zewnetrzny.py` nazywał „poziomem 4" coś zupełnie
innego — porównanie z ANDES. Ten sam identyfikator znaczył dwie różne rzeczy.
Obowiązuje teraz JEDNA taksonomia o dwóch ortogonalnych osiach: **C** (złożoność
przypadku) i **W** (poziom wyroczni). Ten moduł dostarcza oś **C**; oś **W**
zależy od tego, jak dany przypadek jest sprawdzany.

Przypadki dobrane tak, żeby WYKRYWAŁY defekty znalezione w audycie — to jest
kryterium doboru, nie estetyka:

| Oś C | Przypadek | Jaki defekt wykrywa |
|---|---|---|
| C1 | maszyna vs szyna sztywna (`smib`) | brak sprzężenia z siecią (P0-02), zły punkt startowy (P0-04) |
| C2 | dwie maszyny (`dwie_maszyny`) | brak interakcji między elementami (P0-02) |
| C3 | zwarcie z wyłączeniem (`harmonogram_zwarcia`, `czas_krytyczny_zwarcia`) | zdarzenie jako stała zamiast modelu (P0-06) |
| C4 | sieć SN z DER (`siec_sn_z_der`) | niezależność wyniku od urządzenia (P0-07) |

(C0 — pojedyncze równania i konwencje — nie potrzebuje budowniczego przypadku.)
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
from dynamic_lab.zdarzenia import HarmonogramZdarzen, ZdjecieZwarcia, ZwarcieTrojfazowe


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
    return ModelDynamiczny(topologia=topo, urzadzenia=[zespol]), {"G1": complex(0.5, 0.1)}


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
        maszyna=MaszynaSynchroniczna4Rzedu(ref="G1", szyna="G1B", h_s=4.0, d_tlumienie=2.0),
        avr=RegulatorNapiecia(),
        governor=RegulatorTurbiny(),
    )
    z2 = ZespolSynchroniczny(
        maszyna=MaszynaSynchroniczna4Rzedu(ref="G2", szyna="G2B", h_s=6.0, d_tlumienie=3.0),
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
            ZwarcieTrojfazowe(czas_s=chwila_s, szyna=szyna, x_f_pu=x_f_pu),
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

    def przebieg(nazwa_integratora: str, krok: float) -> tuple[np.ndarray, np.ndarray, int, bool]:
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


def czas_krytyczny_zwarcia(
    *,
    h_s: float = 4.0,
    x_linii_pu: float = 0.15,
    szyna_zwarcia: str = "GEN",
    krok_s: float = 0.002,
    czas_koncowy_s: float = 4.0,
    dolna_granica_s: float = 0.005,
    gorna_granica_s: float = 1.000,
    dokladnosc_s: float = 0.005,
) -> float:
    """Czas krytyczny wyłączenia zwarcia (CCT) — bisekcja po czasie trwania zwarcia.

    Defekt P0-06 audytu: produkcyjny silnik zwracał dla zwarcia trójfazowego
    stałą ``return 0.05``, identyczną dla każdego elementu, niezależnie od
    miejsca zwarcia i impedancji; pole ``target_ref`` nie było odczytywane.
    Tutaj CCT jest WYNIKIEM całkowania — zwarcie zmienia Ybus, a utrata
    synchronizmu jest rozpoznawana po wybiegu kąta wirnika.

    Kryterium utraty synchronizmu: ``max|delta(t) − delta(0)| >= pi``. To jest
    kryterium PIERWSZEGO wybiegu, więc nie wykrywa niestabilności oscylacyjnej
    narastającej powoli — dla maszyny bez tłumienia i bez regulatorów, jaką
    liczy ta funkcja, jest właściwe, ale poza tym zakresem NIE jest.

    Bisekcja zakłada MONOTONICZNOŚĆ (dłuższe zwarcie nie może pomóc). Założenie
    jest pinowane osobnym testem ``test_dluzsze_zwarcie_nie_poprawia_wyniku``;
    bez niego bisekcja mogłaby trafić w dowolny punkt przedziału.

    Returns:
        Największy czas trwania zwarcia [s], przy którym maszyna zachowuje
        synchronizm, z dokładnością ``dokladnosc_s``.
    """
    import math

    def przetrwal(czas_trwania_s: float) -> bool:
        model, moce = smib(h_s=h_s, x_linii_pu=x_linii_pu, d_tlumienie=0.0)
        silnik = SilnikRMS(model, integrator="rk4", krok_s=krok_s)
        x0 = silnik.inicjalizuj(moce)
        wynik = silnik.symuluj(
            x0,
            czas_koncowy_s=czas_koncowy_s,
            harmonogram=harmonogram_zwarcia(
                szyna=szyna_zwarcia, chwila_s=0.2, czas_trwania_s=czas_trwania_s
            ),
        )
        delta = np.array(wynik.sygnal("delta_rad", "G1").wartosci)
        return bool(np.max(np.abs(delta - delta[0])) < math.pi)

    if not przetrwal(dolna_granica_s):
        raise ValueError(
            f"Maszyna traci synchronizm już przy {dolna_granica_s * 1000:.0f} ms — "
            "CCT jest poza badanym przedziałem od dołu."
        )
    if przetrwal(gorna_granica_s):
        raise ValueError(
            f"Maszyna przetrwała {gorna_granica_s * 1000:.0f} ms — CCT jest poza "
            "badanym przedziałem od góry (albo zwarcie nie działa)."
        )
    dol, gora = dolna_granica_s, gorna_granica_s
    while gora - dol > dokladnosc_s:
        srodek = 0.5 * (dol + gora)
        if przetrwal(srodek):
            dol = srodek
        else:
            gora = srodek
    return dol
