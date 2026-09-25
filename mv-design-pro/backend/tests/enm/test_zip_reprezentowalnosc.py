"""Rozpływ: reprezentowalność odbiorów ZIP szyny i odniesienie f0 = częstotliwość studium (O-49).

Rozpływ niesie JEDEN wielomian ZIP na szynę (`power_flow_zip.aggregate_zip`). Sonda S2 karty
modeli odbiorów zmierzyła trzy przypadki, w których wielomian zastępczy NIE jest sumą
odbiorów, a wynik był cichy albo surowy: (1) różne k przy częstotliwości studium innej niż
odniesienia, (2) różne v0 — wynik zależny od kolejności odbiorów, (3a) moc bierna przeciwnych
znaków — udziały poza [0, 1] (surowy `ValueError` po angielsku), (3b) suma Q0 = 0 przy różnych
wielomianach — agregat cicho zero. Każdy z nich jest teraz odmową NAZWANĄ, ten sam predykat
w bramce gotowości i w assemblerze (predykaty parami).
"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from application.calculation_readiness.service import CalculationReadinessService
from enm.assembler import OdmowaWejsciaRozplywu, zloz_wejscie_rozplywu
from enm.load_zip_model import (
    KOD_ZIP_AGREGAT_NIEREPREZENTOWALNY,
    odmowy_agregatu_zip,
    reprezentowalnosc_zip_szyny,
)
from enm.models import EnergyNetworkModel
from network_model.solvers.power_flow_zip import ZipCoeffs, zip_coeffs_from_materialized_params

from tests.golden.enm_builders.dynamika_rms import build_dynamika_rms_enm


def _zip(a: float, b: float, c: float, *, v0: float = 1.0, k: float = 0.0, f0: float = 50.0):
    return ZipCoeffs(a, b, c, a, b, c, v0_pu=v0, k_pf=k, k_qf=k, f0_hz=f0)


def _zip_q(a_q: float, c_q: float) -> ZipCoeffs:
    return ZipCoeffs(0.0, 0.0, 1.0, a_q, 0.0, c_q, v0_pu=1.0, k_pf=0.0, k_qf=0.0, f0_hz=50.0)


NIEREPREZENTOWALNE: dict[str, tuple[list, float]] = {
    # (1) Z z k = 2 i P z k = 0 przy f_studium = 49 Hz (f0 = 50 Hz): -3,8e-3 przy V = 0,9.
    "rozne_k_przy_f_innej_niz_f0": (
        [(1.0, 0.0, _zip(1.0, 0.0, 0.0, k=2.0)), (1.0, 0.0, _zip(0.0, 0.0, 1.0))],
        49.0,
    ),
    # (2) rozne v0 — agregat zalezny od kolejnosci odbiorow.
    "rozne_v0": (
        [(1.0, 0.0, _zip(1.0, 0.0, 0.0, v0=1.0)), (1.0, 0.0, _zip(1.0, 0.0, 0.0, v0=1.05))],
        50.0,
    ),
    "rozne_v0_odwrotna_kolejnosc": (
        [(1.0, 0.0, _zip(1.0, 0.0, 0.0, v0=1.05)), (1.0, 0.0, _zip(1.0, 0.0, 0.0, v0=1.0))],
        50.0,
    ),
    # (3a) Q przeciwnych znakow — agregat dokladny, ale udzialy poza [0, 1].
    "udzialy_poza_przedzialem": ([(0.0, 1.0, _zip_q(1.0, 0.0)), (0.0, -0.5, None)], 50.0),
    # (3b) suma Q0 = 0 przy roznych wielomianach — agregat cicho zero.
    "suma_q_zerowa": ([(0.0, 1.0, _zip_q(1.0, 0.0)), (0.0, -1.0, None)], 50.0),
}

REPREZENTOWALNE: dict[str, tuple[list, float]] = {
    "jeden_odbior": ([(2.0, 0.5, _zip(0.5, 0.25, 0.25, k=1.5))], 49.0),
    "rozne_wielomiany_f_rowna_f0": (
        [(1.0, 0.3, _zip(1.0, 0.0, 0.0)), (2.0, 0.2, _zip(0.0, 0.5, 0.5)), (0.5, 0.1, None)],
        50.0,
    ),
    "rowne_k_przy_f_innej_niz_f0": (
        [(1.0, 0.2, _zip(1.0, 0.0, 0.0, k=2.0)), (3.0, 0.4, _zip(0.0, 0.0, 1.0, k=2.0))],
        49.0,
    ),
    "same_stale_moce": ([(1.0, 0.2, None), (3.0, -0.4, None)], 50.0),
}


@pytest.mark.parametrize("nazwa", sorted(NIEREPREZENTOWALNE))
def test_przypadki_sondy_s2_sa_niereprezentowalne(nazwa: str) -> None:
    odbiory, f = NIEREPREZENTOWALNE[nazwa]
    werdykt = reprezentowalnosc_zip_szyny(odbiory, f)
    assert werdykt is not None
    powod, rozbieznosc_p, rozbieznosc_q = werdykt
    assert powod
    assert rozbieznosc_p >= 0.0 and rozbieznosc_q >= 0.0


def test_rozbieznosc_przypadku_rozne_k_wobec_pomiaru_sondy() -> None:
    """(1): suma odbiorow przy V = 0,9 pu i 49 Hz = 1,7776, agregat = 1,7738 (S2)."""
    odbiory, f = NIEREPREZENTOWALNE["rozne_k_przy_f_innej_niz_f0"]
    werdykt = reprezentowalnosc_zip_szyny(odbiory, f)
    assert werdykt is not None
    # Rozbieznosc na siatce 0-1,2 pu jest nie mniejsza niz w punkcie V = 0,9 pu.
    assert werdykt[1] >= abs(1.7776 - 1.7738) - 1e-9


@pytest.mark.parametrize("nazwa", sorted(REPREZENTOWALNE))
def test_przypadki_reprezentowalne_przechodza(nazwa: str) -> None:
    odbiory, f = REPREZENTOWALNE[nazwa]
    assert reprezentowalnosc_zip_szyny(odbiory, f) is None


# ---------------------------------------------------------------------------
# Tor produktu: migawka -> bramka gotowosci / assembler rozpływu (ten sam predykat)
# ---------------------------------------------------------------------------


def _migawka() -> dict[str, Any]:
    return EnergyNetworkModel.model_validate(build_dynamika_rms_enm()).model_dump(mode="json")


def _z_dwoma_odbiorami(pierwszy: dict | None, drugi: dict | None, q_drugi: float) -> dict:
    snapshot = copy.deepcopy(_migawka())
    odbior = snapshot["loads"][0]  # odb-odplyw na b-odplyw (szyna PQ)
    odbior["materialized_params"] = pierwszy
    drugi_wpis = copy.deepcopy(odbior)
    drugi_wpis["id"] = "6a1d0000-0000-4000-8000-0000000000ee"
    drugi_wpis["ref_id"] = "odb-odplyw-2"
    drugi_wpis["q_mvar"] = q_drugi
    drugi_wpis["materialized_params"] = drugi
    snapshot["loads"].append(drugi_wpis)
    return snapshot


PRZYPADKI_MIGAWKI: dict[str, tuple[dict | None, dict | None, float, bool]] = {
    "rozne_v0": ({"a_p": 1.0, "c_p": 0.0}, {"a_p": 1.0, "c_p": 0.0, "v0_pu": 1.05}, 0.8, False),
    "suma_q_zerowa": (
        {"a_q": 1.0, "c_q": 0.0, "a_p": 0.0, "c_p": 1.0},
        {"a_p": 0.0, "c_p": 1.0},
        -0.8,
        False,
    ),
    "rowne_wielomiany": ({"a_p": 1.0, "c_p": 0.0}, {"a_p": 1.0, "c_p": 0.0}, 0.2, True),
    "jeden_zip_jeden_staly": ({"a_p": 0.5, "c_p": 0.5}, None, 0.2, True),
}


@pytest.mark.parametrize("nazwa", sorted(PRZYPADKI_MIGAWKI))
def test_bramka_gotowosci_i_assembler_czytaja_ten_sam_predykat(nazwa: str) -> None:
    pierwszy, drugi, q_drugi, reprezentowalny = PRZYPADKI_MIGAWKI[nazwa]
    snapshot = _z_dwoma_odbiorami(pierwszy, drugi, q_drugi)
    enm = EnergyNetworkModel.model_validate(snapshot)
    odmowy = odmowy_agregatu_zip(enm)
    raport = CalculationReadinessService().evaluate_single(enm, "power_flow")
    w_gotowosci = KOD_ZIP_AGREGAT_NIEREPREZENTOWALNY in " ".join(raport.missing_fields_pl)
    try:
        zloz_wejscie_rozplywu(snapshot, {})
        odmowa_assemblera = None
    except OdmowaWejsciaRozplywu as blad:
        odmowa_assemblera = blad
    if reprezentowalny:
        assert odmowy == ()
        assert not w_gotowosci
        assert odmowa_assemblera is None
    else:
        (odmowa,) = odmowy
        assert odmowa.szyna == "b-odplyw"
        assert set(odmowa.odbiory) == {"odb-odplyw", "odb-odplyw-2"}
        assert w_gotowosci and raport.status == "blocked"
        assert odmowa_assemblera is not None
        assert odmowa_assemblera.kod == KOD_ZIP_AGREGAT_NIEREPREZENTOWALNY
        assert set(odmowa_assemblera.elementy) == {"odb-odplyw", "odb-odplyw-2"}
        # Komunikat po polsku, z nazwą szyny z modelu (nie identyfikatorem) i rozbieżnością.
        assert "Odbiory ZIP szyny" in str(odmowa_assemblera)


def test_szyna_regulacji_napiecia_z_odbiorem_zip_jest_odmowa() -> None:
    """Węzeł PV nie niesie wielomianu w grafie rozpływu — odbiór ZIP liczyłby się stałą mocą."""
    snapshot = copy.deepcopy(_migawka())
    (odbior,) = (o for o in snapshot["loads"] if o["ref_id"] == "odb-potrzeby")
    odbior["materialized_params"] = {"a_p": 1.0, "c_p": 0.0}
    (generator,) = (g for g in snapshot["generators"] if g["bus_ref"] == odbior["bus_ref"])
    generator["meta"] = {"control_mode": "REGULACJA_NAPIECIA", "u_set_pu": 1.02}
    (odmowa,) = odmowy_agregatu_zip(EnergyNetworkModel.model_validate(snapshot))
    assert odmowa.odbiory == ("odb-potrzeby",)
    assert "węzeł PV" in odmowa.powod_pl
    # Ta sama szyna BEZ regulacji napięcia: jeden odbiór ZIP — reprezentowalny.
    generator["meta"] = {}
    assert odmowy_agregatu_zip(EnergyNetworkModel.model_validate(snapshot)) == ()


def test_szyna_zrodla_sieciowego_pominieta_z_powodem() -> None:
    """Szyna bilansująca: moc nie jest zadana w równaniach rozpływu — wielomian odbiorów tej
    szyny nie wchodzi do rozwiązania, więc jej agregat nie jest sprawdzany (docstring)."""
    snapshot = _z_dwoma_odbiorami(
        {"a_p": 1.0, "c_p": 0.0}, {"a_p": 1.0, "c_p": 0.0, "v0_pu": 1.05}, 0.8
    )
    szyna_zrodla = snapshot["sources"][0]["bus_ref"]
    for odbior in snapshot["loads"]:
        if odbior["ref_id"].startswith("odb-odplyw"):
            odbior["bus_ref"] = szyna_zrodla
    assert odmowy_agregatu_zip(EnergyNetworkModel.model_validate(snapshot)) == ()


# ---------------------------------------------------------------------------
# f0 nieobecne = częstotliwość studium (O-49 pkt 6)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("f_studium", [50.0, 60.0])
def test_odniesienie_czestotliwosciowe_bez_f0_to_czestotliwosc_studium(f_studium: float) -> None:
    wspolczynniki = zip_coeffs_from_materialized_params({"k_pf": 1.0, "k_qf": 2.0}, f_studium)
    assert wspolczynniki is not None
    assert wspolczynniki.f0_hz == f_studium
    jawne = zip_coeffs_from_materialized_params({"k_pf": 1.0, "f0_hz": 50.0}, f_studium)
    assert jawne is not None and jawne.f0_hz == 50.0


def test_rozplyw_studium_60_hz_odbioru_czulego_bez_f0_rowny_odbiorowi_bez_czulosci() -> None:
    """Studium 60 Hz, `k_pf = 1` bez `f0`: czynnik = 1 DOKŁADNIE, więc rozpływ jest bitowo
    równy odbiorowi bez czułości (dawniej `F = 1 + 0,2 k` z literału 50 Hz)."""
    wyniki = []
    for parametry in ({"k_pf": 1.0, "k_qf": 1.0}, None):
        snapshot = copy.deepcopy(_migawka())
        snapshot["header"]["defaults"]["frequency_hz"] = 60.0
        snapshot["loads"][0]["materialized_params"] = parametry
        wejscie = zloz_wejscie_rozplywu(snapshot, {})
        from network_model.solvers.power_flow_newton import PowerFlowNewtonSolver

        rozwiazanie = PowerFlowNewtonSolver().solve(wejscie.pf_input)
        wyniki.append(dict(sorted(rozwiazanie.node_u_mag.items())))
    assert wyniki[0] == wyniki[1]
