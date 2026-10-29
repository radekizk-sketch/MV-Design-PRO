"""Sieć zwarciowa bez admitancji poprzecznych gałęzi — karta BEZ-POJEMNOSCI (zgoda B-01 architekta).

Podstawa: IEC 60909-0:2016 pkt 5.2 f) (w składowej zgodnej i przeciwnej pojemności linii się
pomija) i pkt 5.3.1 (zastępcze źródło napięcia c·U_n/√3 w miejscu zwarcia jedynym napięciem
czynnym sieci) — parafraza, ustalenie właściciela 2026-10-22; tekst
w `network_model.core.ybus.PODSTAWA_POMINIECIA_ADMITANCJI_POPRZECZNYCH`. Składowa zerowa:
pkt 5.2 f) każe uwzględnić pojemności linii w sieciach uziemionych przez małą impedancję przy
współczynniku zwarcia doziemnego > 1,4 (metoda składowych symetrycznych — pkt 5.3.2);
obliczenie uwzględnia dziś pojemność doziemną B0 bezwarunkowo (także w sieci izolowanej, gdzie
jest jedyną drogą prądu doziemnego) — warunek pkt 5.2 f) wdroży karta ZEROWA-POJEMNOSCI.

Przed kartą `short_circuit_core.build_zbus` wstawiał B/2 linii i kabli na każdym końcu do sieci
zgodnej (a przez Z_2 = Z_1 — także przeciwnej), a rozpływ prądu po gałęziach
(`_build_branch_contributions_for_thevenin`) liczył prąd z samej admitancji szeregowej — dwie
reprezentacje tej samej sieci w jednym solverze; suma kontrolna KCL w węźle zwarcia nie
domykała się (bocznik węzła zwarcia pobierał część prądu iniekcji).

Każda komórka idzie REALNĄ ścieżką użytkownika: operacje domenowe ENM (źródło GPZ, kabel
z katalogu, domknięcie pierścienia) → migawka → bieg kanoniczny (`wykonaj_bieg_w_pamieci`) →
wiersz wyniku. Wyrocznia RĘCZNA wg normy (niezależna od macierzy solvera):

* Z_Q = c·U_n²/S″_kQ, X_Q = Z_Q/√(1 + (R/X)²), R_Q = (R/X)·X_Q (IEC 60909-0 p. 6.2);
* Z_L = (r + jx)·ℓ — sama impedancja szeregowa kabla (p. 6.4), bez B;
* pierścień: Z_k(B) = Z_Q + Z_AB ∥ (Z_BC + Z_CA) (prosta redukcja szeregowo-równoległa);
* I″_k3 = c·U_n/(√3·|Z_k|), I″_k2 = c·U_n/|2·Z_k| (Z_2 = Z_1), κ = 1,02 + 0,98·e^{−3R/X},
  i_p = κ·√2·I″_k, I_th = I″_k·√(m + n) z m w postaci zamkniętej (p. 14) i n = 1;
* 1F i 2F+G w sieci uziemionej przez rezystor (zespół uziemiający Z.15 na szynie GPZ): Z_0
  węzła z dwuwęzłowego modelu π składowej zerowej (Y_0 = jB0ℓ/2 na każdym końcu, Z_L0 =
  (r0 + jx0)·ℓ szeregowo) równolegle z bocznikiem Z_0,TU + 3·R_N — B0 ZOSTAJE; w sieci
  izolowanej prąd doziemienia jest poza zakresem IEC 60909-0 (nazwana przyczyna), a B0 daje
  prąd pojemnościowy I_C = √3·U_n·B0·ℓ (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA);
  I″_k1 = √3·c·U_n/|Z_1 + Z_2 + Z_0|, I″_k2E = c·U_n/|Z_1 + Z_2·Z_0/(Z_2 + Z_0)|.

ILOCZYN CECH: susceptancja kabla {B = 0, kabel XLPE 240 mm² C = 500 nF/km (B ≈ 157 µS/km)}
× topologia {promieniowa, pierścień} × miejsce zwarcia {szyna GPZ, koniec kabla} × rodzaj
{3F, 2F, 1F i 2F+G (sieć izolowana, B0 > 0)} × kanał {wielkości główne, ślad White Box, bilans
KCL wkładów gałęziowych Thevenina} × konsument sieci zgodnej {rdzeń 3F/2F/1F/2F+G, udział
maszyn wirujących (μ, q), Thevenin SN w zacisku HV transformatora SN/nN (pętla IEC 60364
i kotwica nN)}; inwentarz miejsc budujących macierz sieci zgodnej przypięty testem AST. Iniekcje: przywrócenie B/2 w sieci zgodnej czerwieni
wyrocznię (B/2 równolegle do indukcyjnej impedancji Thevenina PODNOSI |Z_k|: I″_k na końcu
kabla 20 km niższe o 0,46 % — wynik maksymalny po niebezpiecznej stronie) i bilans KCL; zdjęcie B0 ze składowej
zerowej daje nazwaną przyczynę ``brak_drogi`` zamiast prądu pojemnościowego.
"""

from __future__ import annotations

import ast
import cmath
import math
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from application.analyses.fault_loop.service import compute_upstream_hv_thevenin
from enm.canonical_analysis import CanonicalRun, wykonaj_bieg_w_pamieci
from enm.kompilator_grafu import (
    _gpz_line_fields,
    dodaj_transformator,
    dodaj_zrodlo_slack,
    kontynuuj_z_pola,
    kontynuuj_z_szyny,
    pusty_enm,
    zamknij_pierscien,
)
from enm.mapping import _ref_to_uuid, map_enm_to_network_graph
from enm.models import EnergyNetworkModel
from network_model.core.czas_wylaczenia import czas_tb_roboczy
from network_model.core.machine import SynchronousMachineSource
from network_model.core.ybus import (
    PODSTAWA_POMINIECIA_ADMITANCJI_POPRZECZNYCH,
    AdmittanceMatrixBuilder,
)
from network_model.solvers.machine_sc_iec60909 import compute_machine_contributions
from network_model.solvers.short_circuit_iec60909 import ShortCircuitIEC60909Solver

UN_KV = 15.0
SK_MVA = 250.0
RX_Q = 0.1
C_MAX = 1.1
KABEL = "cable-base-xlpe-al-3c-240"
#: Dane katalogowe kabla (karta `cable-base-xlpe-al-3c-240`), przepisane do wyroczni.
R_KM, X_KM, C_NF_KM = 0.125, 0.086, 500.0
B_KM_S = 2.0 * math.pi * 50.0 * C_NF_KM * 1e-9
R0_KM, X0_KM = 0.375, 0.258
DLUGOSC_KM = {"AB": 20.0, "BC": 8.0, "CA": 12.0}

SUSCEPTANCJE = ("B=0", "kabel_500nF")
TOPOLOGIE = ("promieniowa", "pierscien")
MIEJSCA = ("GPZ", "B")
RODZAJE = ("SC_3F", "SC_2F", "SC_1F", "SC_2F_G")
DOZIEMNE = ("SC_1F", "SC_2F_G")


# ---------------------------------------------------------------------------
# Sieć (ścieżka użytkownika: operacje domenowe ENM)
# ---------------------------------------------------------------------------


def _siec(susceptancja: str, topologia: str) -> tuple[dict[str, Any], dict[str, str]]:
    enm = pusty_enm(name="Sieć karty BEZ-POJEMNOSCI", sn_nominal_kv=UN_KV)
    enm, gpz = dodaj_zrodlo_slack(
        enm, voltage_kv=UN_KV, sk3_mva=SK_MVA, rx_ratio=RX_Q, line_fields_count=1
    )
    pole = _gpz_line_fields(enm)[0]["ref_id"]
    enm, szyna_b = kontynuuj_z_pola(
        enm,
        field_ref=pole,
        catalog_ref=KABEL,
        dlugosc_m=DLUGOSC_KM["AB"] * 1000.0,
        rodzaj="KABEL",
        name="K-AB",
        bus_name="B",
    )
    if topologia == "pierscien":
        enm, szyna_c = kontynuuj_z_szyny(
            enm,
            from_bus_ref=szyna_b,
            catalog_ref=KABEL,
            dlugosc_m=DLUGOSC_KM["BC"] * 1000.0,
            rodzaj="KABEL",
            name="K-BC",
            bus_name="C",
        )
        enm = zamknij_pierscien(
            enm,
            from_bus_ref=szyna_c,
            to_bus_ref=gpz,
            catalog_ref=KABEL,
            dlugosc_m=DLUGOSC_KM["CA"] * 1000.0,
            name="K-CA",
            rodzaj="KABEL",
        )
    for galaz in enm["branches"]:
        if galaz.get("type") != "cable":
            continue
        # Pojemność doziemna B0 = B1 (kabel z żyłami w ekranach indywidualnych) — dana
        # projektanta wpisana w model; bez niej sieć izolowana nie ma drogi prądu zerowego.
        galaz["b0_siemens_per_km"] = B_KM_S
        if susceptancja == "B=0":
            galaz["b_siemens_per_km"] = 0.0
    migawka = EnergyNetworkModel.model_validate(enm).model_dump(mode="json")
    return migawka, {"GPZ": gpz, "B": szyna_b}


def _bieg(migawka: dict[str, Any], rodzaj: str) -> CanonicalRun:
    run = CanonicalRun(
        id=uuid.UUID(int=7),
        case_id="przypadek-bez-pojemnosci",
        project_id="projekt-bez-pojemnosci",
        analysis_type="short_circuit_sn",
        status="FINISHED",
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
        snapshot_hash="s",
        input_hash="i",
        snapshot=migawka,
        validation={},
        readiness={},
        options={"fault_type": rodzaj, "thermal_time_seconds": 1.0},
    )
    wykonaj_bieg_w_pamieci(run)
    return run


def _wiersz(run: CanonicalRun, szyna_ref: str) -> dict[str, Any]:
    wezel = _ref_to_uuid(szyna_ref)
    return next(r for r in run.raw_result["results"] if r["fault_node_id"] == wezel)


def _zespolona(wartosc: Any) -> complex:
    if isinstance(wartosc, dict):
        return complex(wartosc["re"], wartosc["im"])
    return complex(wartosc)


# ---------------------------------------------------------------------------
# Wyrocznia ręczna wg normy
# ---------------------------------------------------------------------------


def _z_q() -> complex:
    z_q = C_MAX * UN_KV**2 / SK_MVA
    x_q = z_q / math.sqrt(1.0 + RX_Q**2)
    return complex(RX_Q * x_q, x_q)


def _z_kabla(odcinek: str) -> complex:
    return complex(R_KM, X_KM) * DLUGOSC_KM[odcinek]


def _z1_reczne(topologia: str, miejsce: str) -> complex:
    if miejsce == "GPZ":
        return _z_q()
    if topologia == "promieniowa":
        return _z_q() + _z_kabla("AB")
    z_ab, z_obejscie = _z_kabla("AB"), _z_kabla("BC") + _z_kabla("CA")
    return _z_q() + z_ab * z_obejscie / (z_ab + z_obejscie)


def _z0_reczne_promieniowa(miejsce: str) -> complex:
    """Sieć izolowana, jeden kabel: Y_0 = jB0ℓ/2 na każdym końcu, Z_L0 szeregowo."""
    y_konca = 1j * B_KM_S * DLUGOSC_KM["AB"] / 2.0
    z_l0 = complex(R0_KM, X0_KM) * DLUGOSC_KM["AB"]
    # Z_0 widziana z węzła = Y_konca(węzeł) ∥ (Z_L0 + 1/Y_konca(drugi koniec)).
    return 1.0 / (y_konca + 1.0 / (z_l0 + 1.0 / y_konca))


def _m_reczne(kappa: float, tk_s: float = 1.0, f_hz: float = 50.0) -> float:
    ln = math.log(kappa - 1.0)
    return (math.exp(4.0 * f_hz * tk_s * ln) - 1.0) / (2.0 * f_hz * tk_s * ln)


def _wielkosci_reczne(z_k: complex, rodzaj: str) -> dict[str, float]:
    if rodzaj == "SC_3F":
        ikss = C_MAX * UN_KV * 1e3 / (math.sqrt(3.0) * abs(z_k))
        z_petli = z_k
    else:
        z_petli = 2.0 * z_k
        ikss = C_MAX * UN_KV * 1e3 / abs(z_petli)
    kappa = 1.02 + 0.98 * math.exp(-3.0 * z_petli.real / z_petli.imag)
    return {
        "ikss_a": ikss,
        "ip_a": kappa * math.sqrt(2.0) * ikss,
        "ith_a": ikss * math.sqrt(_m_reczne(kappa) + 1.0),
    }


ILOCZYN_SYMETRYCZNY = [
    (s, t, m, r) for s in SUSCEPTANCJE for t in TOPOLOGIE for m in MIEJSCA for r in RODZAJE[:2]
]


@pytest.fixture(scope="module")
def biegi() -> dict[tuple[str, str, str], tuple[CanonicalRun, dict[str, str]]]:
    wynik = {}
    for s in SUSCEPTANCJE:
        for t in TOPOLOGIE:
            migawka, szyny = _siec(s, t)
            for r in RODZAJE:
                if r in DOZIEMNE and t == "pierscien":
                    continue
                wynik[(s, t, r)] = (_bieg(migawka, r), szyny)
    return wynik


@pytest.mark.parametrize(
    ("susceptancja", "topologia", "miejsce", "rodzaj"),
    ILOCZYN_SYMETRYCZNY,
    ids=["-".join(c) for c in ILOCZYN_SYMETRYCZNY],
)
def test_wyrocznia_reczna_sieci_zgodnej_bez_b(
    biegi: dict[tuple[str, str, str], tuple[CanonicalRun, dict[str, str]]],
    susceptancja: str,
    topologia: str,
    miejsce: str,
    rodzaj: str,
) -> None:
    """I″_k, i_p, I_th i Z_k z biegu = rachunek ręczny z SAMĄ impedancją szeregową kabla —
    niezależnie od B kabla (B = 0 i B ≈ 157 µS/km dają TE SAME liczby)."""
    run, szyny = biegi[(susceptancja, topologia, rodzaj)]
    wiersz = _wiersz(run, szyny[miejsce])
    z1 = _z1_reczne(topologia, miejsce)
    assert _zespolona(wiersz["z1_ohm"]) == pytest.approx(z1, rel=1e-12)
    for klucz, oczekiwana in _wielkosci_reczne(z1, rodzaj).items():
        assert wiersz[klucz] == pytest.approx(oczekiwana, rel=1e-12), klucz


@pytest.mark.parametrize("miejsce", MIEJSCA)
def test_wyniki_nie_zaleza_od_b_kabla_bit_w_bit(
    biegi: dict[tuple[str, str, str], tuple[CanonicalRun, dict[str, str]]], miejsce: str
) -> None:
    """Sieć zgodna jest TA SAMA dla B = 0 i B > 0 (B0 bez zmian): wielkości główne 3F, 2F, 1F
    i 2F+G równe co do bitu."""
    for topologia in TOPOLOGIE:
        for rodzaj in RODZAJE:
            if rodzaj in DOZIEMNE and topologia == "pierscien":
                continue
            wiersze = [
                _wiersz(*_para(biegi[(s, topologia, rodzaj)], miejsce)) for s in SUSCEPTANCJE
            ]
            for klucz in ("ikss_a", "ip_a", "ith_a", "sk_mva", "zkk_ohm"):
                assert wiersze[0][klucz] == wiersze[1][klucz], (topologia, rodzaj, klucz)


def _para(
    bieg_i_szyny: tuple[CanonicalRun, dict[str, str]], miejsce: str
) -> tuple[CanonicalRun, str]:
    run, szyny = bieg_i_szyny
    return run, szyny[miejsce]


@pytest.mark.parametrize("rodzaj", DOZIEMNE)
@pytest.mark.parametrize("miejsce", MIEJSCA)
@pytest.mark.parametrize("susceptancja", SUSCEPTANCJE)
def test_doziemne_siec_izolowana_poza_zakresem_iec60909_a_b0_daje_prad_pojemnosciowy(
    biegi: dict[tuple[str, str, str], tuple[CanonicalRun, dict[str, str]]],
    susceptancja: str,
    miejsce: str,
    rodzaj: str,
) -> None:
    """Zwarcia z ziemią w sieci IZOLOWANEJ (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA §0 pkt 7):
    jedyną drogą prądu zerowego są pojemności doziemne B0 — prąd doziemienia nie jest prądem
    zwarciowym IEC 60909-0 (norma obejmuje sieci uziemione przez małą impedancję), więc wiersz
    dostaje nazwaną przyczynę ``poza_zakresem_iec60909`` (NIE_DOTYCZY) zamiast liczby, a B0
    zostaje w modelu jako prąd pojemnościowy sieci I_C = √3·U_n·B0·ℓ (jedna prawda
    ``enm.uziemienie_sekcji``; ocenia go analiza projektu uziemienia punktu neutralnego)."""
    from enm.uziemienie_sekcji import uziemienie_sieci

    run, szyny = biegi[(susceptancja, "promieniowa", rodzaj)]
    wiersz = _wiersz(run, szyny[miejsce])
    assert wiersz["ikss_a"] is None
    brak = wiersz["brak_wyniku_zerowego"]
    assert brak["przyczyna"] == "poza_zakresem_iec60909"
    assert brak["status"] == "NIE_DOTYCZY"
    (sekcja,) = uziemienie_sieci(EnergyNetworkModel.model_validate(run.snapshot))
    assert sekcja.wariant() == "izolowany"
    i_c = math.sqrt(3.0) * UN_KV * 1e3 * B_KM_S * DLUGOSC_KM["AB"]
    assert sekcja.prad_pojemnosciowy_a == pytest.approx(i_c, rel=1e-12)


def _siec_z_zespolem(susceptancja: str) -> tuple[dict[str, Any], dict[str, str]]:
    """Ta sama sieć promieniowa z zespołem uziemiającym z rezystorem na szynie GPZ (Z.15) —
    operacja domenowa ``add_zespol_uziemiajacy_sn`` (ścieżka użytkownika)."""
    from enm.domain_operations import execute_domain_operation

    migawka, szyny = _siec(susceptancja, "promieniowa")
    wynik = execute_domain_operation(
        enm_dict=migawka,
        op_name="add_zespol_uziemiajacy_sn",
        payload={
            "bus_ref": szyny["GPZ"],
            "catalog_ref": "TU_ZNYN11_15KV_PW160",
            "rezystor": {"catalog_ref": "REZ_200A_15KV"},
        },
    )
    assert not wynik.get("error"), wynik.get("error")
    return EnergyNetworkModel.model_validate(wynik["snapshot"]).model_dump(mode="json"), szyny


def _z0_reczne_z_zespolem(miejsce: str) -> complex:
    """Bocznik zespołu Z_0,ZU = Z_0,TU + 3·R_N na szynie GPZ (katalog: Z_0,TU = 1,5 + j6 Ω,
    R_N = 43,3 Ω) równolegle z modelem π kabla (Y_0 = jB0ℓ/2 na końcach, Z_L0 szeregowo)."""
    z0_zu = complex(1.5, 6.0) + 3.0 * 43.3
    y_konca = 1j * B_KM_S * DLUGOSC_KM["AB"] / 2.0
    z_l0 = complex(R0_KM, X0_KM) * DLUGOSC_KM["AB"]
    y_gpz = 1.0 / z0_zu + y_konca
    if miejsce == "GPZ":
        return 1.0 / (y_gpz + 1.0 / (z_l0 + 1.0 / y_konca))
    return 1.0 / (y_konca + 1.0 / (z_l0 + 1.0 / y_gpz))


@pytest.mark.parametrize("rodzaj", DOZIEMNE)
@pytest.mark.parametrize("miejsce", MIEJSCA)
@pytest.mark.parametrize("susceptancja", SUSCEPTANCJE)
def test_doziemne_siec_z_zespolem_rezystorowym_b0_zostaje_w_skladowej_zerowej(
    susceptancja: str, miejsce: str, rodzaj: str
) -> None:
    """Sieć uziemiona przez rezystor (Z.15): Z_1 = Z_2 bez B (pkt 5.2 f)), Z_0 z bocznikiem
    zespołu i pojemnością doziemną B0 (B0 wchodzi dziś bezwarunkowo — warunek pkt 5.2 f)
    wdroży karta ZEROWA-POJEMNOSCI) — prąd z rachunku ręcznego."""
    migawka, szyny = _siec_z_zespolem(susceptancja)
    wiersz = _wiersz(_bieg(migawka, rodzaj), szyny[miejsce])
    z1 = _z1_reczne("promieniowa", miejsce)
    z0 = _z0_reczne_z_zespolem(miejsce)
    assert _zespolona(wiersz["z1_ohm"]) == pytest.approx(z1, rel=1e-12)
    assert _zespolona(wiersz["z2_ohm"]) == pytest.approx(z1, rel=1e-12)
    assert _zespolona(wiersz["z0_ohm"]) == pytest.approx(z0, rel=1e-9)
    if rodzaj == "SC_2F_G":
        ik2e = C_MAX * UN_KV * 1e3 / abs(z1 + z1 * z0 / (z1 + z0))
        assert wiersz["ikss_a"] == pytest.approx(ik2e, rel=1e-9)
        return
    ik1 = math.sqrt(3.0) * C_MAX * UN_KV * 1e3 / abs(2.0 * z1 + z0)
    assert wiersz["ikss_a"] == pytest.approx(ik1, rel=1e-9)
    # Rząd wielkości: prąd rezystora ok. 200 A (I_R = U_f/R_N) + składowa pojemnościowa.
    assert 150.0 < wiersz["ikss_a"] < 300.0


@pytest.mark.parametrize("topologia", TOPOLOGIE)
@pytest.mark.parametrize("susceptancja", SUSCEPTANCJE)
def test_slad_white_box_nazywa_pominiete_admitancje_z_podstawa(
    biegi: dict[tuple[str, str, str], tuple[CanonicalRun, dict[str, str]]],
    susceptancja: str,
    topologia: str,
) -> None:
    run, szyny = biegi[(susceptancja, topologia, "SC_3F")]
    kroki = [
        k
        for k in _wiersz(run, szyny["B"])["white_box_trace"]
        if k["key"] == "admitancje_poprzeczne_pominiete"
    ]
    if susceptancja == "B=0":
        assert kroki == [], "nic nie pominięto — brak kroku (ślad bit w bit jak przed kartą)"
        return
    (krok,) = kroki
    nazwy = {"promieniowa": ["K-AB"], "pierscien": ["K-AB", "K-BC", "K-CA"]}[topologia]
    assert sorted(g["nazwa"] for g in krok["inputs"]["galezie"]) == nazwy
    suma = sum(DLUGOSC_KM[n[2:]] for n in nazwy) * B_KM_S
    assert krok["result"]["pominieta_susceptancja_suma_s"] == pytest.approx(suma, rel=1e-12)
    assert krok["notes"] == PODSTAWA_POMINIECIA_ADMITANCJI_POPRZECZNYCH
    # Jednostka redakcyjna podstawy: pkt 5.2 f) (ustalenie właściciela 2026-10-22, parafraza);
    # składowa zerowa — warunek pkt 5.2 f), metoda składowych pkt 5.3.2; uczciwy stan B0.
    assert "IEC 60909-0:2016 pkt 5.2 f)" in krok["notes"]
    assert "współczynnik zwarcia doziemnego jest większy niż 1,4" in krok["notes"]
    assert "bez sprawdzania tego warunku" in krok["notes"]
    assert "ustalenie właściciela 2026-10-22" in krok["notes"]
    assert "5.2 e)" not in krok["notes"]
    assert "do potwierdzenia" not in krok["notes"]


# ---------------------------------------------------------------------------
# Jedna reprezentacja sieci w solverze: bilans KCL wkładów gałęziowych Thevenina
# ---------------------------------------------------------------------------


def _bilans_kcl(susceptancja: str, topologia: str, miejsce: str) -> tuple[float, list[Any]]:
    migawka, szyny = _siec(susceptancja, topologia)
    graf = map_enm_to_network_graph(EnergyNetworkModel.model_validate(migawka))
    wynik = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graf,
        _ref_to_uuid(szyny[miejsce]),
        C_MAX,
        1.0,
        czas_tb=czas_tb_roboczy(),
        include_branch_contributions=True,
    )
    (krok,) = (k for k in wynik.branch_flow_trace if k["key"] == "thevenin_flow_balance")
    return krok["result"]["fraction_sum"], wynik.branch_contributions


@pytest.mark.parametrize("miejsce", ["B"])
@pytest.mark.parametrize("topologia", ["promieniowa"])
@pytest.mark.parametrize("susceptancja", SUSCEPTANCJE)
def test_bilans_kcl_wezla_zwarcia_domyka_sie_dokladnie(
    susceptancja: str, topologia: str, miejsce: str
) -> None:
    """Promieniowo do węzła zwarcia wchodzi jedna gałąź: jej współczynnik podziału = 1
    dokładnie (prąd gałęzi = I″_k Thevenina). Przed kartą bocznik B/2 węzła zwarcia pobierał
    część prądu iniekcji i suma była < 1."""
    suma, wklady = _bilans_kcl(susceptancja, topologia, miejsce)
    assert suma == pytest.approx(1.0, abs=1e-12)
    assert len(wklady) == 1


def test_bilans_kcl_pierscienia_zespolony_domyka_sie() -> None:
    """Pierścień z B > 0, zwarcie na B: zespolona suma prądów gałęzi wchodzących do węzła
    zwarcia = 1 (iniekcja jednostkowa) — sieć bez boczników nie ma innej drogi prądu."""
    migawka, szyny = _siec("kabel_500nF", "pierscien")
    graf = map_enm_to_network_graph(EnergyNetworkModel.model_validate(migawka))
    budowniczy = AdmittanceMatrixBuilder(graf)
    y = budowniczy.build(siec_zwarciowa=True)
    z = np.linalg.inv(y)
    k = budowniczy.node_id_to_index[_ref_to_uuid(szyny["B"])]
    v = z @ np.eye(z.shape[0])[:, k] * -1.0
    suma = 0j
    for galaz in graf.branches.values():
        wynik = ShortCircuitIEC60909Solver._series_admittance_pu(budowniczy, galaz)
        assert wynik is not None
        y_s, a = wynik
        i_f = budowniczy.node_id_to_index[galaz.from_node_id]
        i_t = budowniczy.node_id_to_index[galaz.to_node_id]
        prad_od = (v[i_f] / (a * a) - v[i_t] / a) * y_s
        if i_t == k:
            suma += prad_od
        elif i_f == k:
            suma -= prad_od
    assert abs(suma - 1.0) < 1e-12


# ---------------------------------------------------------------------------
# Iniekcje: stan sprzed karty czerwieni wyrocznię i bilans
# ---------------------------------------------------------------------------


@pytest.fixture
def b_polowa_w_sieci_zgodnej(monkeypatch: pytest.MonkeyPatch) -> None:
    """Iniekcja stanu sprzed karty: tryb zwarciowy przywraca B/2 na końcach gałęzi."""
    oryginal = AdmittanceMatrixBuilder.build

    def build(self: AdmittanceMatrixBuilder, *, siec_zwarciowa: bool) -> Any:
        y = oryginal(self, siec_zwarciowa=siec_zwarciowa)
        if siec_zwarciowa:
            for galaz, y_konca_pu in self.admitancje_poprzeczne_pominiete():
                for wezel in (galaz.from_node_id, galaz.to_node_id):
                    i = self.node_id_to_index[wezel]
                    y[i, i] += y_konca_pu
        return y

    monkeypatch.setattr(AdmittanceMatrixBuilder, "build", build)


def test_iniekcja_b_polowa_czerwieni_wyrocznie(b_polowa_w_sieci_zgodnej: None) -> None:
    migawka, szyny = _siec("kabel_500nF", "promieniowa")
    wiersz = _wiersz(_bieg(migawka, "SC_3F"), szyny["B"])
    oczekiwany = _wielkosci_reczne(_z1_reczne("promieniowa", "B"), "SC_3F")["ikss_a"]
    odchylka = wiersz["ikss_a"] / oczekiwany - 1.0
    # Pomiar: Δ = −4,59e−3 (B/2 równolegle do indukcyjnej Z_th podnosi |Z_k|).
    assert odchylka < -4e-3, f"iniekcja B/2 musi zaniżyć I″_k (Δ = {odchylka:.3e})"


def test_iniekcja_b_polowa_czerwieni_bilans_kcl(b_polowa_w_sieci_zgodnej: None) -> None:
    suma, _ = _bilans_kcl("kabel_500nF", "promieniowa", "B")
    assert abs(suma - 1.0) > 1e-3


def test_iniekcja_bez_b0_w_skladowej_zerowej_odmawia_zamiast_liczyc() -> None:
    """Zdjęcie B0 z sieci izolowanej: brak JAKIEJKOLWIEK drogi prądu zerowego — nazwana
    przyczyna ``brak_drogi`` w każdym węźle, nie cichy wynik (kotwica numeryczna bloku
    osobliwego nie udaje uziemienia — karta UX-04/POLE-ZU-SKLADOWA-ZEROWA §0 pkt 7)."""
    migawka, szyny = _siec("kabel_500nF", "promieniowa")
    for galaz in migawka["branches"]:
        galaz["b0_siemens_per_km"] = None
    run = _bieg(migawka, "SC_1F")
    for miejsce in MIEJSCA:
        wiersz = _wiersz(run, szyny[miejsce])
        assert wiersz["ikss_a"] is None
        assert wiersz["brak_wyniku_zerowego"]["przyczyna"] == "brak_drogi"


def test_rozplyw_zachowuje_admitancje_poprzeczna() -> None:
    """Rozpływ (`build_ybus_pu`) ma B/2 kabla — pojemność to fizyka stanu ustalonego; zmiana
    dotyczy wyłącznie sieci zwarciowej. Różnica przekątnych węzła B = B·ℓ/2 w pu."""
    from network_model.core.ybus import S_BASE_MVA
    from network_model.solvers.power_flow_newton_internal import build_ybus_pu

    migawka, szyny = _siec("kabel_500nF", "promieniowa")
    graf = map_enm_to_network_graph(EnergyNetworkModel.model_validate(migawka))
    wezly = sorted(graf.nodes)
    slack = _ref_to_uuid(szyny["GPZ"])
    y_rozplywu, indeks, *_ = build_ybus_pu(graf, wezly, S_BASE_MVA, slack, [], {})
    budowniczy = AdmittanceMatrixBuilder(graf)
    y_zwarcia = budowniczy.build(siec_zwarciowa=True)
    b = _ref_to_uuid(szyny["B"])
    i_zwarcia = budowniczy.node_id_to_index[b]
    roznica = y_rozplywu[indeks[b], indeks[b]] - y_zwarcia[i_zwarcia, i_zwarcia]
    oczekiwana = 1j * B_KM_S * DLUGOSC_KM["AB"] / 2.0 * (UN_KV**2 / S_BASE_MVA)
    assert roznica == pytest.approx(oczekiwana, rel=1e-9)
    assert cmath.isclose(roznica.real, 0.0, abs_tol=1e-12)


# ---------------------------------------------------------------------------
# Konsumenci sieci zgodnej poza rdzeniem wiersza zwarcia (klasa, nie instancja)
# ---------------------------------------------------------------------------


def _siec_ze_stacja(susceptancja: str) -> tuple[EnergyNetworkModel, str]:
    """Sieć promieniowa karty + stacja SN/nN na szynie B (operacja domenowa transformatora)."""
    migawka, szyny = _siec(susceptancja, "promieniowa")
    enm, _ = dodaj_transformator(
        migawka,
        hv_bus_ref=szyny["B"],
        catalog_ref="tr-sn-nn-15-04-630kva-dyn11",
        lv_voltage_kv=0.4,
        lv_voltage_tolerance="PLUS_6",
    )
    return EnergyNetworkModel.model_validate(enm), szyny["B"]


@pytest.mark.parametrize("susceptancja", SUSCEPTANCJE)
def test_thevenin_sn_w_zacisku_hv_transformatora_bez_b(susceptancja: str) -> None:
    """Pętla zwarcia IEC 60364 i kotwica SN domeny nN (`compute_upstream_hv_thevenin` →
    `build_zbus`): Z_th SN w zacisku HV transformatora = Z_Q + Z_kabla (sama impedancja
    szeregowa), niezależnie od B kabla."""
    enm, szyna_b = _siec_ze_stacja(susceptancja)
    (trafo,) = enm.transformers
    wynik, braki = compute_upstream_hv_thevenin(enm, trafo)
    assert braki == [] and wynik is not None
    assert wynik.hv_bus_ref == _ref_to_uuid(szyna_b)
    assert wynik.z_hv_ohm == pytest.approx(_z1_reczne("promieniowa", "B"), rel=1e-12)


def test_thevenin_sn_bit_w_bit_niezalezny_od_b() -> None:
    wyniki = [compute_upstream_hv_thevenin(*_enm_i_trafo(s))[0] for s in SUSCEPTANCJE]
    assert wyniki[0] is not None and wyniki[1] is not None
    assert wyniki[0].z_hv_ohm == wyniki[1].z_hv_ohm


def _enm_i_trafo(susceptancja: str) -> tuple[EnergyNetworkModel, Any]:
    enm, _ = _siec_ze_stacja(susceptancja)
    return enm, enm.transformers[0]


def _udzial_maszyny(susceptancja: str) -> tuple[dict[str, Any], complex]:
    """Generator synchroniczny na szynie B, zwarcie 3F na szynie GPZ — prąd maszyny płynie
    kablem K-AB do miejsca zwarcia (IEC 60909-0 p. 6.6, μ, q)."""
    migawka, szyny = _siec(susceptancja, "promieniowa")
    graf = map_enm_to_network_graph(EnergyNetworkModel.model_validate(migawka))
    generator = SynchronousMachineSource(
        id="G",
        name="Generator",
        node_id=_ref_to_uuid(szyny["B"]),
        sr_mva=5.0,
        ur_kv=UN_KV,
        xd_subtransient_pu=0.15,
        cos_phi_r=0.8,
    )
    graf.add_synchronous_machine_source(generator)
    wynik = compute_machine_contributions(
        graf, _ref_to_uuid(szyny["GPZ"]), c_factor=C_MAX, t_min_s=0.1
    )
    return wynik.to_dict(), generator.z_internal_ohm


@pytest.mark.parametrize("susceptancja", SUSCEPTANCJE)
def test_udzial_maszyny_wirujacej_przez_kabel_bez_b(susceptancja: str) -> None:
    """Udział maszyn (`compute_machine_contributions` → `build_zbus`): w metodzie
    zastępczego źródła prąd maszyny do zwarcia na GPZ = c·U_n/(√3·|Z″_GK + Z_kabla|) — tor
    maszyny to sama impedancja szeregowa kabla. Bocznik B/2 na szynie B (stan sprzed karty)
    odbierałby część tego prądu."""
    udzial, z_maszyny = _udzial_maszyny(susceptancja)
    (wklad,) = udzial["contributions"]
    oczekiwany = C_MAX * UN_KV * 1e3 / (math.sqrt(3.0) * abs(z_maszyny + _z_kabla("AB")))
    assert wklad["ikss_partial_a"] == pytest.approx(oczekiwany, rel=1e-12)


def test_udzial_maszyny_bit_w_bit_niezalezny_od_b() -> None:
    bez_b, z_b = (_udzial_maszyny(s)[0] for s in SUSCEPTANCJE)
    assert bez_b == z_b


# ---------------------------------------------------------------------------
# Inwentarz miejsc budujących sieć zgodną (deklaracja z testem)
# ---------------------------------------------------------------------------

_SRC = Path(__file__).resolve().parents[3] / "src"

#: Moduły `src/`, które KONSTRUUJĄ budowniczego macierzy zwarciowej, i powód.
_KONSTRUKTORZY_BUDOWNICZEGO = {
    "network_model/solvers/short_circuit_core.py": "build_zbus — jedyna sieć zgodna zwarć",
    "network_model/solvers/short_circuit_iec60909.py": "krok śladu pominiętych admitancji",
    "enm/mapping.py": "sieć składowej zerowej — wyłącznie indeks węzłów i Z_base",
}
#: Moduły `src/`, które czytają sieć zgodną przez `build_zbus`.
_WOLAJACY_BUILD_ZBUS = {
    "network_model/solvers/short_circuit_core.py",
    "network_model/solvers/short_circuit_iec60909.py",
    "network_model/solvers/machine_sc_iec60909.py",
    "application/analyses/fault_loop/service.py",
    "application/analyses/lv_domain/upstream_equivalent.py",
}


def _wywolania(nazwa: str) -> set[str]:
    wynik: set[str] = set()
    for plik in sorted(_SRC.rglob("*.py")):
        drzewo = ast.parse(plik.read_text(encoding="utf-8"))
        for wezel in ast.walk(drzewo):
            if not isinstance(wezel, ast.Call):
                continue
            funkcja = wezel.func
            nazwa_wywolania = (
                funkcja.id
                if isinstance(funkcja, ast.Name)
                else funkcja.attr if isinstance(funkcja, ast.Attribute) else None
            )
            if nazwa_wywolania == nazwa:
                wynik.add(plik.relative_to(_SRC).as_posix())
    return wynik


def test_inwentarz_budowniczych_sieci_zgodnej_zwarc_jest_zamkniety() -> None:
    """Każde miejsce budujące macierz sieci zgodnej zwarć przechodzi przez `build_zbus`
    (bez B/2) albo jest jawnie opisane wyżej. Nowe miejsce = świadoma decyzja (dopisz tu
    z powodem), nie cicha druga reprezentacja sieci."""
    assert _wywolania("AdmittanceMatrixBuilder") == set(_KONSTRUKTORZY_BUDOWNICZEGO)
    assert _wywolania("build_zbus") == _WOLAJACY_BUILD_ZBUS


def test_zaden_modul_src_nie_buduje_sieci_zwarciowej_z_modelem_pi() -> None:
    """`build(siec_zwarciowa=False)` (model π z B/2) jest wyłącznie narzędziem testu parytetu
    z rozpływem — w `src/` nie występuje."""
    naruszenia = []
    for plik in sorted(_SRC.rglob("*.py")):
        for wezel in ast.walk(ast.parse(plik.read_text(encoding="utf-8"))):
            if isinstance(wezel, ast.Call):
                for kw in wezel.keywords:
                    if kw.arg == "siec_zwarciowa" and not (
                        isinstance(kw.value, ast.Constant) and kw.value.value is True
                    ):
                        naruszenia.append(plik.relative_to(_SRC).as_posix())
    assert naruszenia == []
