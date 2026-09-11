"""Inicjalizacja NIE ZMIENIA definicji modelu — i nastawa nie ginie po drodze.

PO CO TEN PLIK (§5 audytu rundy 3). ``inicjalizuj`` wylicza z rozpływu nastawy
punktu pracy (``V_ref`` wzbudnicy, ``P_ref`` turbiny, ``P_ref``/``Q_ref``/``E_ref``
falowników, ``P_zadane`` elektrowni) i WPISYWAŁA je do modelu. Skutek zmierzony
przed naprawą: 5 z 6 klas urządzeń zmieniało swój odcisk parametrów po samej
inicjalizacji — czyli „ten sam model" przed i po starcie był dwoma różnymi
modelami dla każdego mechanizmu opartego na tożsamości (porównanie biegów,
rejestr dowodów, wykrycie podmiany wejścia).

DLACZEGO TO NIE JEST DROBIAZG. Tożsamość modelu ma odpowiadać na pytanie „czy to
ten sam model policzył oba biegi". Jeżeli sama czynność uruchomienia ją zmienia,
odpowiedź brzmi „nie" nawet wtedy, gdy nic się nie zmieniło — a wtedy mechanizm
przestaje cokolwiek chronić, bo każde porównanie i tak wychodzi na „inny".

DRUGA POŁOWA KONTRAKTU, BEZ KTÓREJ NAPRAWA BYŁABY REGRESJĄ. Nastawa nie może
po prostu zniknąć z tożsamości: ZMIENIA wynik. Wypada z tożsamości MODELU i
wchodzi do tożsamości BIEGU, obie konsekwencje z JEDNEJ deklaracji przy polu
(`RolaPola.NASTAWA_PUNKTU_PRACY`). Ten plik sprawdza obie strony naraz — bo
spełnienie tylko jednej zamieniłoby defekt §5 na dziurę w §2.
"""

from __future__ import annotations

import dataclasses

import numpy as np
import pytest
from dynamic_lab.regulatory import RegulatorNapiecia, RegulatorTurbiny
from dynamic_lab.siec import Galaz, TopologiaSieci
from dynamic_lab.silnik import ModelDynamiczny, SilnikRMS
from dynamic_lab.tozsamosc import RolaPola, nastawy_punktu_pracy
from dynamic_lab.tozsamosc import odcisk as odcisk_kanoniczny
from dynamic_lab.urzadzenia import (
    FalownikGFL,
    FalownikGFM,
    MaszynaSynchroniczna4Rzedu,
    OdbiorStalejMocy,
    ZespolSynchroniczny,
)
from dynamic_lab.urzadzenia_oze import (
    JednostkaSterowanaPQ,
    MagazynEnergiiBESS,
    MaszynaDwustronnieZasilana3Rzedu,
    RegulatorElektrowniPPC,
)

S_BAZOWA_MVA = 100.0


def _topologia() -> TopologiaSieci:
    return TopologiaSieci(
        szyny=("A", "SYS"),
        galezie=[Galaz("A", "SYS", 0.02, 0.10)],
        szyny_sztywne={"SYS": complex(1.0, 0.0)},
    )


def _zespol() -> ZespolSynchroniczny:
    return ZespolSynchroniczny(
        maszyna=MaszynaSynchroniczna4Rzedu(ref="U", szyna="A", h_s=4.0),
        avr=RegulatorNapiecia(),
        governor=RegulatorTurbiny(),
    )


#: Iloczyn cech §5: KAŻDA klasa urządzenia, która w ogóle coś wylicza z punktu
#: pracy. Lista jest ZAMKNIĘTA — nowe urządzenie z `inicjalizuj` musi tu trafić.
URZADZENIA = (
    ("ZespolSynchroniczny", _zespol, complex(0.5, 0.1)),
    ("FalownikGFL", lambda: FalownikGFL(ref="U", szyna="A"), complex(0.5, 0.1)),
    (
        "FalownikGFM",
        lambda: FalownikGFM(ref="U", szyna="A", h_wirtualna_s=4.0),
        complex(0.5, 0.1),
    ),
    (
        "MagazynEnergiiBESS",
        lambda: MagazynEnergiiBESS(
            ref="U", szyna="A", e_pojemnosc_mwh=10.0, s_bazowa_mva=S_BAZOWA_MVA
        ),
        complex(0.4, 0.1),
    ),
    (
        "RegulatorElektrowniPPC",
        lambda: RegulatorElektrowniPPC(
            ref="U", szyna="A", jednostki=[JednostkaSterowanaPQ(ref="PV", s_zn_pu=1.0)]
        ),
        complex(0.5, 0.1),
    ),
    (
        "MaszynaDwustronnieZasilana3Rzedu",
        lambda: MaszynaDwustronnieZasilana3Rzedu(ref="U", szyna="A", h_s=3.0),
        complex(0.5, 0.1),
    ),
    (
        "OdbiorStalejMocy",
        lambda: OdbiorStalejMocy(ref="U", szyna="A", p_pu=-0.4, q_pu=-0.1),
        complex(-0.4, -0.1),
    ),
)


@pytest.mark.parametrize(("nazwa", "buduj", "moc"), URZADZENIA, ids=[u[0] for u in URZADZENIA])
def test_inicjalizacja_nie_zmienia_odcisku_modelu(nazwa: str, buduj, moc: complex) -> None:
    """``odcisk(model)`` przed ``inicjalizuj`` == po ``inicjalizuj``, dla KAŻDEJ klasy."""
    urzadzenie = buduj()
    silnik = SilnikRMS(ModelDynamiczny(topologia=_topologia(), urzadzenia=[urzadzenie]))
    przed = odcisk_kanoniczny(urzadzenie)
    silnik.inicjalizuj({"U": moc})
    assert odcisk_kanoniczny(urzadzenie) == przed, (
        f"{nazwa}: inicjalizacja zmieniła tożsamość MODELU — nastawa punktu pracy "
        "wpisana do definicji urządzenia."
    )


#: Urządzenia, dla których „inny punkt pracy przy tym samym modelu" w ogóle
#: istnieje. `OdbiorStalejMocy` jest wyłączony MERYTORYCZNIE, nie dla wygody:
#: jego dyspozycja to ``p_pu``/``q_pu``, czyli PARAMETRY modelu — odbiór nie ma
#: nastawy odrębnej od definicji, więc zmiana dyspozycji JEST zmianą modelu.
#: (Próba zadania mu innej mocy niż własna jest zresztą odrzucana przez kontrolę
#: spójności punktu pracy: zmierzone ``|S_rzecz - S_rozpływ| = 1,237e-01`` p.u.)
Z_PUNKTEM_PRACY = tuple(u for u in URZADZENIA if u[0] != "OdbiorStalejMocy")


@pytest.mark.parametrize(
    ("nazwa", "buduj", "moc"), Z_PUNKTEM_PRACY, ids=[u[0] for u in Z_PUNKTEM_PRACY]
)
def test_dwie_rozne_dyspozycje_daja_ten_sam_model_ale_rozny_bieg(
    nazwa: str, buduj, moc: complex
) -> None:
    """Ten sam model, inny punkt pracy: odcisk MODELU równy, odcisk BIEGU różny."""

    def bieg(skala: float):
        urzadzenie = buduj()
        silnik = SilnikRMS(
            ModelDynamiczny(topologia=_topologia(), urzadzenia=[urzadzenie]),
            integrator="rk4",
            krok_s=0.005,
        )
        x0 = silnik.inicjalizuj({"U": moc * skala})
        return urzadzenie, silnik.symuluj(x0, czas_koncowy_s=0.2)

    u_a, a = bieg(1.0)
    u_b, b = bieg(0.7)
    assert odcisk_kanoniczny(u_a) == odcisk_kanoniczny(u_b), f"{nazwa}: model się rozjechał"
    assert a.odcisk_scenariusza != b.odcisk_scenariusza, (
        f"{nazwa}: dwa różne punkty pracy dały TEN SAM odcisk biegu — nastawa "
        "wypadła z modelu i nie weszła do biegu."
    )


def test_zmiana_dyspozycji_PO_inicjalizacji_zmienia_odcisk_biegu() -> None:
    """Nastawa czytana jest ze stanu OBOWIĄZUJĄCEGO, nie z pamięci inicjalizacji.

    Scenariusz „limit eksportu zaczyna wiązać" zmienia ``p_zadane_pu`` elektrowni
    PO ``inicjalizuj`` — dokładnie tak, jak dzieje się to naprawdę (dyspozytor
    zmienia zadanie pracującej elektrowni). Gdyby odcisk biegu brał wyłącznie
    dyspozycję zapamiętaną przy starcie, dwa fizycznie różne biegi byłyby
    nierozróżnialne.
    """

    def bieg(p_po_skoku: float):
        ppc = RegulatorElektrowniPPC(
            ref="EL", szyna="A", jednostki=[JednostkaSterowanaPQ(ref="PV", s_zn_pu=1.0)]
        )
        silnik = SilnikRMS(
            ModelDynamiczny(topologia=_topologia(), urzadzenia=[ppc]),
            integrator="rk4",
            krok_s=0.005,
        )
        x0 = silnik.inicjalizuj({"EL": complex(0.5, 0.1)})
        ppc.p_zadane_pu = p_po_skoku
        return ppc, silnik.symuluj(x0, czas_koncowy_s=0.3)

    a_ppc, a = bieg(0.5)
    b_ppc, b = bieg(0.9)
    assert odcisk_kanoniczny(a_ppc) == odcisk_kanoniczny(b_ppc)
    assert a.odcisk_scenariusza != b.odcisk_scenariusza
    # I różnica jest FIZYCZNA, nie tylko w odcisku:
    moc_a = np.array(a.sygnal("p_pu", "EL").wartosci)
    moc_b = np.array(b.sygnal("p_pu", "EL").wartosci)
    assert float(np.max(np.abs(moc_a - moc_b))) > 0.05


def test_parametr_definicji_regulatora_nadal_rozroznia_modele() -> None:
    """Wyłączenie NASTAWY nie może wynieść z tożsamości parametrów DEFINICJI.

    ``k_a`` i ``T_a`` to definicja wzbudnicy; ``V_ref`` to punkt pracy. Gdyby
    naprawa §5 wyłączyła cały regulator, dwa fizycznie różne modele stałyby się
    nierozróżnialne — to byłoby cofnięcie wcześniejszej naprawy tożsamości.
    """
    a = ZespolSynchroniczny(
        maszyna=MaszynaSynchroniczna4Rzedu(ref="U", szyna="A", h_s=4.0),
        avr=RegulatorNapiecia(k_a=200.0),
    )
    b = ZespolSynchroniczny(
        maszyna=MaszynaSynchroniczna4Rzedu(ref="U", szyna="A", h_s=4.0),
        avr=RegulatorNapiecia(k_a=400.0),
    )
    assert odcisk_kanoniczny(a) != odcisk_kanoniczny(b)
    for pole in ("t_a_s", "efd_min", "efd_max"):
        zmieniony = ZespolSynchroniczny(
            maszyna=MaszynaSynchroniczna4Rzedu(ref="U", szyna="A", h_s=4.0),
            avr=dataclasses.replace(
                RegulatorNapiecia(), **{pole: {"t_a_s": 0.2, "efd_min": -1.0, "efd_max": 6.0}[pole]}
            ),
        )
        assert odcisk_kanoniczny(zmieniony) != odcisk_kanoniczny(a), pole


def test_nastawa_zadeklarowana_wchodzi_do_spisu_nastaw() -> None:
    """Deklaracja przy polu MUSI mieć widoczny skutek — inaczej jest obietnicą."""
    zespol = _zespol()
    silnik = SilnikRMS(ModelDynamiczny(topologia=_topologia(), urzadzenia=[zespol]))
    silnik.inicjalizuj({"U": complex(0.5, 0.1)})
    nastawy = nastawy_punktu_pracy(zespol)
    # Nastawa zagnieżdżona (w regulatorze) też — zbieranie jest rekurencyjne.
    assert set(nastawy) == {"_efd_stale", "_pm_stale", "avr.v_ref_pu", "governor.p_ref_pu"}
    assert nastawy["avr.v_ref_pu"] != 1.0, "V_ref powinno wyjść z rozpływu, nie z domyślnej"


def test_kazda_nastawa_ma_podany_powod() -> None:
    """Wyłączenie pola z tożsamości modelu bez powodu jest nieodróżnialne od przeoczenia."""
    for _, buduj, _ in URZADZENIA:
        urzadzenie = buduj()
        for pole in dataclasses.fields(urzadzenie):
            if pole.metadata.get("dynamic_lab.rola") is RolaPola.NASTAWA_PUNKTU_PRACY:
                powod = str(pole.metadata.get("dynamic_lab.powod", ""))
                assert powod.strip(), f"{type(urzadzenie).__name__}.{pole.name}"
                assert "punkt" in powod or "rozpływ" in powod or "zadan" in powod
