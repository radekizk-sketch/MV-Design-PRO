"""Sposób pracy punktu neutralnego a doziemienie 1F — wyrocznie, iloczyn i iniekcje (karta
UX-04/POLE-ZU-SKLADOWA-ZEROWA, warunek odbioru właściciela 2026-10-29).

Cztery sposoby pracy punktu neutralnego NIE przechodzą przez jeden model Z1+Z2+Z0. Wyrocznie
liczą jawnymi wzorami, niezależnie od kodu solvera ``doziemienie_sn``:

* izolowany — I_C = √3·U_n·B_0 (= 3ωC_0U_f), U0 = U_f, U_b = U_c = √3·U_f, k = √3;
* kompensowany — I_res = √(I_w² + (I_C − I_L)²), v = (I_C − I_L)/I_C, I_w i I_L z prądu
  punktów neutralnych I_N = Σ U_f/(Z_N + Z_0/3) (Z_0 — transformator uziemiający);
* rezystor — I_F = √(I_R² + (I_C − I_L)²) z I_R = Re I_N (czysty rezystor bez Z_0:
  I_F = √(I_R² + I_C²), I_R = U_f/R_N); Z.14 (dławik ‖ rezystor) — obie gałęzie łącznie;
  napięcia faz zdrowych z impedancji składowych punktu: V_b = E·[(a² − a)·Z2 + (a² − 1)·Z0]
  /(Z1 + Z2 + Z0), V_c = E·[(a − a²)·Z2 + (a − 1)·Z0]/(Z1 + Z2 + Z0), V0 = −E·Z0/(Z1+Z2+Z0);
* bezpośredni — prąd I″k1 IEC 60909 wiersza (rdzeń), napięcia jak wyżej.

ILOCZYN CECH (model, realna ścieżka biegu ``short_circuit_sn``): tryb {izolowany,
kompensowany, rezystor, bezpośredni} × układ {1 sekcja, 2 sekcje ze sprzęgłem zamkniętym,
2 sekcje ze sprzęgłem otwartym} × odcinki {kabel, linia napowietrzna, mieszane} × zespół
uziemiający w sieci punktu {jest, brak — sekcja 2 przy sprzęgle otwartym} × konsument
{wiersz wyniku, wiersz odpowiedzi (ekran), wyjaśnienie braku wyniku IEC, dane przyjęte,
raport, konfigurator stacji}. INIEKCJE (każda czerwona): model impedancyjny wymuszony dla sieci
izolowanej; I_C pominięty w trybie rezystorowym; I_L odjęty bez I_w; impedancja zerowa
transformatora uziemiającego pominięta.
"""

from __future__ import annotations

import cmath
import math
from dataclasses import replace
from typing import Any

import pytest
from api.analysis_run_exports import _sc_row_bilans_linie
from application.proof_engine.packs.audit2_skladanie import uziemienie_sn_stacji
from enm import doziemienie_sieci as modul_wiersza
from enm import uziemienie_sekcji as modul_sekcji
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel
from network_model.core import uziemienie as rdzen_uziemienia
from network_model.solvers import doziemienie_sn
from network_model.solvers.doziemienie_sn import (
    DaneDoziemienia,
    PunktNeutralnyDoziemienia,
    oblicz_doziemienie,
)

from tests.enm import test_skladowa_zerowa_zu as zu

A = cmath.rect(1.0, 2.0 * math.pi / 3.0)
SQ3 = math.sqrt(3.0)
UN_V = zu.UN_KV * 1e3
U_F = zu.U_F_V
REL = 1e-6

#: B′0 linii napowietrznej SN [S/km] — dana projektanta odcinka (C′0 ≈ 4,5 nF/km).
B0_LINII_S_PER_KM = 2.0 * math.pi * 50.0 * 4.5e-9
LINIA_SN = "line-base-al-st-70"


# ---------------------------------------------------------------------------
# Wyrocznie jawnymi wzorami (bez kodu solvera)
# ---------------------------------------------------------------------------


def wyrocznia_napiec(z1: complex, z2: complex, z0: complex) -> tuple[float, float, float]:
    """(U0, U_b, U_c) zwarcia fazy a z ziemią, metalicznego, E = U_f."""
    suma = z1 + z2 + z0
    v0 = -U_F * z0 / suma
    v_b = U_F * ((A * A - A) * z2 + (A * A - 1.0) * z0) / suma
    v_c = U_F * ((A - A * A) * z2 + (A - 1.0) * z0) / suma
    return abs(v0), abs(v_b), abs(v_c)


def wyrocznia_pradu(tryb: str, i_c: float, punkty: list[tuple[complex, complex | None]]) -> dict:
    """Prąd doziemienia metalicznego trybu ``tryb`` (impedancje podłużne pominięte)."""
    i_n = sum((U_F / (z_n + (z0 / 3.0 if z0 is not None else 0j)) for z_n, z0 in punkty), 0j)
    i_w, i_l = i_n.real, -i_n.imag
    if tryb == "izolowany":
        return {"prad": i_c, "i_w": None, "i_l": None, "v": None}
    prad = math.sqrt(i_w**2 + (i_c - i_l) ** 2)
    return {"prad": prad, "i_w": i_w, "i_l": i_l, "v": (i_c - i_l) / i_c if i_c else None}


# ---------------------------------------------------------------------------
# Solver: cztery tryby z wyroczni (wejście jawne)
# ---------------------------------------------------------------------------

B0_S = 0.0012
I_C_ORACLE = SQ3 * UN_V * B0_S
X_L = U_F / 30.0
R_N = 40.0
Z0_TU = complex(1.5, 6.0)


def _dane(tryb: str, punkty: tuple[PunktNeutralnyDoziemienia, ...] = (), **kw: Any):
    return DaneDoziemienia(tryb=tryb, napiecie_kv=zu.UN_KV, b0_s=B0_S, punkty=punkty, **kw)


def test_izolowany_prad_pojemnosciowy_i_napiecia_z_wyroczni() -> None:
    w = oblicz_doziemienie(_dane("izolowany"))
    assert w.charakter == "pojemnosciowy"
    assert w.prad_a == pytest.approx(I_C_ORACLE, rel=REL)
    assert w.prad_a == pytest.approx(3.0 * 2.0 * math.pi * 50.0 * (B0_S / (2 * math.pi * 50)) * U_F)
    assert (w.i_l_a, w.i_w_a, w.rozstrojenie) == (None, None, None)
    assert w.u0_v == pytest.approx(U_F, rel=REL)
    assert w.u_faza_b_v == pytest.approx(SQ3 * U_F, rel=REL)
    assert w.u_faza_c_v == pytest.approx(SQ3 * U_F, rel=REL)
    assert w.wspolczynnik_k == pytest.approx(SQ3, rel=REL)
    assert "IEC 60909-0:2016 rozdz. 1" in w.podstawa_pl
    assert "IEC 60909-3" in (w.to_dict()["podwojne_doziemienie_pl"] or "")


@pytest.mark.parametrize("udzial", [0.9, 1.0, 1.1])
@pytest.mark.parametrize("z0", [None, Z0_TU], ids=["bez-Z0", "z-Z0TU"])
def test_kompensowany_prad_resztkowy_z_iw_z_wyroczni(udzial: float, z0: complex | None) -> None:
    x_l = U_F / (udzial * I_C_ORACLE)
    punkt = PunktNeutralnyDoziemienia("dławik", complex(0.0, x_l), z0)
    w = oblicz_doziemienie(_dane("kompensowany", (punkt,), dlawik_w_ruchu=True))
    o = wyrocznia_pradu("kompensowany", I_C_ORACLE, [(complex(0.0, x_l), z0)])
    assert w.i_w_a == pytest.approx(o["i_w"], abs=1e-9)
    assert w.i_l_a == pytest.approx(o["i_l"], rel=REL)
    assert w.prad_a == pytest.approx(o["prad"], rel=REL, abs=1e-9)
    assert w.rozstrojenie == pytest.approx(o["v"], rel=REL, abs=1e-12)
    if z0 is None:
        # Bez Z_0 dławik bezstratny: I_w = 0, I_res = |I_C − I_L|.
        assert w.i_w_a == pytest.approx(0.0, abs=1e-9)
        assert w.prad_a == pytest.approx(abs(I_C_ORACLE - U_F / x_l), abs=1e-9)
    else:
        assert w.i_w_a > 0.0
    # Znak rozstrojenia: v > 0 — niedokompensowanie (I_L < I_C).
    assert (w.rozstrojenie > 1e-9) is (w.i_l_a < I_C_ORACLE - 1e-9)
    assert w.wspolczynnik_k == pytest.approx(SQ3, rel=REL)


def test_kompensowany_awsc_zalaczony_skladowa_czynna_z_rezystora_wymuszajacego() -> None:
    r_awsc = U_F / 30.0
    z_n = zu._rownolegle(complex(r_awsc, 0.0), complex(0.0, X_L))
    w = oblicz_doziemienie(
        _dane("kompensowany", (PunktNeutralnyDoziemienia("AWSC", z_n, None),), dlawik_w_ruchu=True)
    )
    assert w.i_w_a == pytest.approx(30.0, rel=REL)
    assert w.prad_a == pytest.approx(math.sqrt(30.0**2 + (I_C_ORACLE - 30.0) ** 2), rel=REL)


@pytest.mark.parametrize("z0", [None, Z0_TU], ids=["bez-Z0", "z-Z0TU"])
def test_rezystor_prad_rezystancyjno_pojemnosciowy_z_wyroczni(z0: complex | None) -> None:
    w = oblicz_doziemienie(_dane("rezystor", (PunktNeutralnyDoziemienia("R", R_N, z0),)))
    o = wyrocznia_pradu("rezystor", I_C_ORACLE, [(complex(R_N, 0.0), z0)])
    assert w.prad_a == pytest.approx(o["prad"], rel=REL)
    if z0 is None:
        i_r = U_F / R_N
        assert w.prad_a == pytest.approx(math.sqrt(i_r**2 + I_C_ORACLE**2), rel=REL)
    else:
        # Z_0,TU w szeregu z R_N obniża I_R i dodaje składową indukcyjną.
        assert w.i_w_a < U_F / R_N
        assert w.i_l_a > 0.0
    assert w.charakter == "rezystancyjno_pojemnosciowy"


def test_z14_dlawik_rownolegle_z_rezystorem_obie_galezie_lacznie() -> None:
    z_n = zu._rownolegle(complex(R_N, 0.0), complex(0.0, X_L))
    w = oblicz_doziemienie(
        _dane("rezystor", (PunktNeutralnyDoziemienia("Z.14", z_n, None),), dlawik_w_ruchu=True)
    )
    i_r, i_l = U_F / R_N, U_F / X_L
    assert w.i_w_a == pytest.approx(i_r, rel=REL)
    assert w.i_l_a == pytest.approx(i_l, rel=REL)
    assert w.prad_a == pytest.approx(math.sqrt(i_r**2 + (I_C_ORACLE - i_l) ** 2), rel=REL)
    assert w.rozstrojenie == pytest.approx((I_C_ORACLE - i_l) / I_C_ORACLE, rel=REL)


Z1 = complex(0.35, 2.1)
Z0_PKT = complex(4.2, 9.8)


@pytest.mark.parametrize("tryb", ["rezystor", "bezposrednie"])
def test_napiecia_faz_zdrowych_z_impedancji_skladowych_punktu(tryb: str) -> None:
    punkty = (PunktNeutralnyDoziemienia("R", R_N, None),) if tryb == "rezystor" else ()
    ik1 = 3.0 * 1.1 * U_F / abs(2 * Z1 + Z0_PKT)
    w = oblicz_doziemienie(_dane(tryb, punkty, z1_ohm=Z1, z2_ohm=Z1, z0_ohm=Z0_PKT, ikss_iec_a=ik1))
    u0, ub, uc = wyrocznia_napiec(Z1, Z1, Z0_PKT)
    assert w.u0_v == pytest.approx(u0, rel=REL)
    assert w.u_faza_b_v == pytest.approx(ub, rel=REL)
    assert w.u_faza_c_v == pytest.approx(uc, rel=REL)
    assert w.wspolczynnik_k == pytest.approx(max(ub, uc) / U_F, rel=REL)
    if tryb == "bezposrednie":
        assert w.prad_a == ik1 and w.charakter == "zwarciowy"
        assert w.i_c_a is None


def test_bezposrednie_bez_impedancji_punktu_to_brak_nazwany() -> None:
    w = oblicz_doziemienie(_dane("bezposrednie"))
    assert w.prad_a is None and w.wspolczynnik_k is None
    assert "IEC 60909" in (w.brak_pl or "")


@pytest.mark.parametrize("tryb", ["izolowany", "kompensowany", "rezystor"])
def test_brak_b0_to_brak_nazwany_bez_liczby(tryb: str) -> None:
    punkty = () if tryb == "izolowany" else (PunktNeutralnyDoziemienia("P", R_N, None),)
    w = oblicz_doziemienie(replace(_dane(tryb, punkty), b0_s=None, brak_b0_pl="odcinek bez B′0"))
    assert w.prad_a is None and w.i_c_a is None
    assert "odcinek bez B′0" in (w.brak_pl or "")


@pytest.mark.parametrize("tryb", ["izolowany", "kompensowany", "rezystor"])
def test_impedancja_przejscia_z_wyroczni(tryb: str) -> None:
    """I_F = |U_f·Y/(1 + Z_f·Y)|, U0 = U_f/|1 + Z_f·Y| (Y = I_metal/U_f)."""
    z_f = complex(50.0, 0.0)
    punkty: tuple[PunktNeutralnyDoziemienia, ...] = ()
    if tryb == "kompensowany":
        punkty = (PunktNeutralnyDoziemienia("dławik", complex(0.0, X_L), Z0_TU),)
    elif tryb == "rezystor":
        punkty = (PunktNeutralnyDoziemienia("R", R_N, Z0_TU),)
    w = oblicz_doziemienie(_dane(tryb, punkty, z_f_ohm=z_f, dlawik_w_ruchu=tryb == "kompensowany"))
    i_n = sum((U_F / (p.z_n_ohm + p.z0_tu_ohm / 3.0) for p in punkty), 0j)
    y = (i_n + 1j * I_C_ORACLE) / U_F
    assert w.prad_a == pytest.approx(abs(U_F * y / (1.0 + z_f * y)), rel=REL)
    assert w.u0_v == pytest.approx(U_F / abs(1.0 + z_f * y), rel=REL)
    assert w.u_faza_b_v == pytest.approx(U_F * abs(A * A - 1.0 / (1.0 + z_f * y)), rel=REL)


def test_droga_szeregowa_ynyn_to_zastrzezenie_jawne() -> None:
    w = oblicz_doziemienie(
        _dane(
            "kompensowany",
            (PunktNeutralnyDoziemienia("TR", complex(0.0, X_L), Z0_TU),),
            dlawik_w_ruchu=True,
            droga_szeregowa=True,
        )
    )
    assert any("YNyn" in z for z in w.zastrzezenia_pl)


def test_determinizm_solvera() -> None:
    dane = _dane("rezystor", (PunktNeutralnyDoziemienia("R", R_N, Z0_TU),))
    assert oblicz_doziemienie(dane).to_dict() == oblicz_doziemienie(dane).to_dict()


# ---------------------------------------------------------------------------
# Model: iloczyn tryb × układ × odcinki × ZU × konsument (realny bieg)
# ---------------------------------------------------------------------------

ODCINKI: dict[str, tuple[tuple[str, int], ...]] = {
    "kabel": (("KABEL", 2000),),
    "linia": (("LINIA_NAPOWIETRZNA", 6000),),
    "mieszane": (("KABEL", 1500), ("LINIA_NAPOWIETRZNA", 4000)),
}
UKLADY = ("1-sekcja", "2-sekcje-zamkniete", "2-sekcje-otwarte")
WARIANT_TRYBU = {
    "izolowany": "izolowany",
    "kompensowany": "dlawik",
    "rezystor": "rezystor",
    "bezposrednie": "bezposrednie",
}


def _z_odcinkami(migawka: dict[str, Any], odcinki: tuple[tuple[str, int], ...]) -> dict[str, Any]:
    for rodzaj, dlugosc in odcinki:
        kabel = rodzaj == "KABEL"
        odcinek = {
            "rodzaj": rodzaj,
            "dlugosc_m": dlugosc,
            "catalog_ref": zu.KABEL_SN if kabel else LINIA_SN,
            "zero_sequence": {
                "b0_siemens_per_km": zu.B0_KABLA_S_PER_KM if kabel else B0_LINII_S_PER_KM
            },
        }
        wynik = execute_domain_operation(
            enm_dict=migawka, op_name="continue_trunk_segment_sn", payload={"segment": odcinek}
        )
        assert not wynik.get("error"), wynik.get("error")
        migawka = wynik["snapshot"]
    return migawka


def _b0_odcinkow_s(odcinki: tuple[tuple[str, int], ...]) -> float:
    return sum(
        (zu.B0_KABLA_S_PER_KM if rodzaj == "KABEL" else B0_LINII_S_PER_KM) * dlugosc / 1000.0
        for rodzaj, dlugosc in odcinki
    )


def _bieg_szyny(migawka: dict[str, Any], szyna: str, otwarte: tuple[str, ...], klucz: str):
    zu.reset_canonical_runs()
    zu.reset_enm_store()
    return zu._bieg(migawka, zu._przypadek(migawka, otwarte=otwarte, szyna=szyna), klucz=klucz)


def _oczekiwane(tryb: str, i_c: float, liczba_zu: int, wiersz: dict[str, Any]) -> dict[str, Any]:
    """Wyrocznia doziemienia punktu: tryb sieci punktu i liczby z wzorów jawnych."""
    if liczba_zu == 0:
        return {"tryb": "izolowany", **wyrocznia_pradu("izolowany", i_c, [])}
    if tryb == "bezposrednie":
        return {"tryb": tryb, "prad": wiersz["ikss_a"], "i_w": None, "i_l": None, "v": None}
    z_n = zu.Z_N_WARIANTU[WARIANT_TRYBU[tryb]]
    assert z_n is not None
    o = wyrocznia_pradu(tryb, i_c, [(z_n, zu.Z0_TU)] * liczba_zu)
    if tryb == "rezystor":
        o["v"] = None
    return {"tryb": tryb, **o}


def _sprawdz_napiecia(tryb_sieci: str, d: dict[str, Any], wiersz: dict[str, Any]) -> None:
    if tryb_sieci in ("izolowany", "kompensowany"):
        assert d["u0_v"] == pytest.approx(U_F, rel=REL)
        assert d["u_faza_b_v"] == pytest.approx(SQ3 * U_F, rel=REL)
        assert d["u_faza_c_v"] == pytest.approx(SQ3 * U_F, rel=REL)
        assert d["wspolczynnik_k"] == pytest.approx(SQ3, rel=REL)
        return
    u0, ub, uc = wyrocznia_napiec(
        zu._zespolona(wiersz["z1_ohm"]),
        zu._zespolona(wiersz["z2_ohm"]),
        zu._zespolona(wiersz["z0_ohm"]),
    )
    assert d["u0_v"] == pytest.approx(u0, rel=1e-4)
    assert d["u_faza_b_v"] == pytest.approx(ub, rel=1e-4)
    assert d["u_faza_c_v"] == pytest.approx(uc, rel=1e-4)
    # Sieć z rezystorem jest nieskutecznie uziemiona (k > 1,4); wprost — k < √3.
    if tryb_sieci == "rezystor":
        assert d["wspolczynnik_k"] > 1.4


def _sprawdz_konsumentow(run: Any, szyna: str, d: dict[str, Any], tryb_sieci: str) -> None:
    odpowiedz = zu._wiersz_odpowiedzi(run, szyna)
    assert odpowiedz["doziemienie_sieci"] == d
    if tryb_sieci in ("izolowany", "kompensowany"):
        assert odpowiedz["brak_wyniku_zerowego"]["przyczyna"] == "poza_zakresem_iec60909"
    else:
        assert odpowiedz.get("brak_wyniku_zerowego") is None
    assert d["kompletnosc_dowodu"] == (
        "NIEPELNY" if d["dane_przyjete"] or d["brak_pl"] else "PELNY"
    )
    linie = _sc_row_bilans_linie(odpowiedz)
    naglowek = next(linia for linia in linie if linia.startswith("Doziemienie sieci ("))
    assert d["tryb_pl"] in naglowek and d["charakter_pl"] in naglowek
    assert any(linia.startswith("Podstawa doziemienia: ") for linia in linie)
    if d["dane_przyjete"]:
        dane = next(linia for linia in linie if linia.startswith("Dane przyjęte doziemienia"))
        assert all(x["nazwa_pl"] in dane for x in d["dane_przyjete"])


def _uklad(uklad: str) -> tuple[int, bool]:
    return (1, False) if uklad == "1-sekcja" else (2, uklad.endswith("otwarte"))


@pytest.mark.parametrize("odcinki", sorted(ODCINKI))
@pytest.mark.parametrize("uklad", UKLADY)
@pytest.mark.parametrize("tryb", sorted(WARIANT_TRYBU))
def test_iloczyn_tryb_uklad_odcinki_zu_konsumenci(tryb: str, uklad: str, odcinki: str) -> None:
    sekcje, otwarte = _uklad(uklad)
    wariant = WARIANT_TRYBU[tryb]
    migawka = _z_odcinkami(zu._siec(wariant, sekcje=sekcje, zu="jedna"), ODCINKI[odcinki])
    szyny = zu._szyny(migawka)
    lacznik = (zu._sprzeglo(migawka),) if otwarte else ()
    b0 = _b0_odcinkow_s(ODCINKI[odcinki])
    stacja = EnergyNetworkModel.model_validate(migawka).substations[0].ref_id
    sekcje_stacji = uziemienie_sn_stacji(EnergyNetworkModel.model_validate(migawka), stacja, [])[
        "sekcje"
    ]
    for indeks, szyna in enumerate(szyny):
        # Odcinki magistrali odchodzą z sekcji 1; zespół uziemiający — w sekcji 1.
        w_sieci_s1 = indeks == 0 or not otwarte
        i_c = SQ3 * UN_V * b0 if w_sieci_s1 else 0.0
        liczba_zu = 0 if wariant == "izolowany" or not w_sieci_s1 else 1
        run = _bieg_szyny(migawka, szyna, lacznik, klucz=f"t-{tryb}-{uklad}-{odcinki}-{indeks}")
        wiersz = zu._wiersz(run, szyna)
        d = wiersz["doziemienie_sieci"]
        o = _oczekiwane(tryb, i_c, liczba_zu, wiersz)
        assert d["tryb"] == o["tryb"], (szyna, d["tryb"])
        if o["tryb"] != "bezposrednie":
            assert d["i_c_a"] == pytest.approx(i_c, abs=1e-4)
        assert d["prad_a"] == pytest.approx(o["prad"], rel=1e-5, abs=1e-4)
        for klucz, klucz_o in (("i_w_a", "i_w"), ("i_l_a", "i_l")):
            if o[klucz_o] is None:
                assert d[klucz] is None
            else:
                assert d[klucz] == pytest.approx(o[klucz_o], rel=1e-5, abs=1e-4)
        if o["v"] is None:
            assert d["rozstrojenie"] is None
        else:
            assert d["rozstrojenie"] == pytest.approx(o["v"], rel=1e-5)
        if i_c == 0.0 and d["tryb"] != "bezposrednie":
            assert doziemienie_sn.ZASTRZEZENIE_ZEROWEJ_POJEMNOSCI_PL in d["zastrzezenia_pl"]
        _sprawdz_napiecia(d["tryb"], d, wiersz)
        _sprawdz_konsumentow(run, szyna, d, d["tryb"])
    # Konfigurator stacji: stan normalny modelu (sprzęgło zamknięte — jedna sieć galwaniczna
    # obu sekcji); doziemienie sieci stacji = doziemienie wiersza szyny 1 przy zamkniętym
    # sprzęgle (ta sama prawda, dwa konsumenty), dla każdego trybu poza bezpośrednim (tam prąd
    # zależy od impedancji punktu zwarcia — wiersz IEC 60909, nie sieć).
    (sekcja_stacji,) = sekcje_stacji
    assert set(szyny) <= set(sekcja_stacji["szyny"])
    assert sekcja_stacji["tryb_doziemienia"] == ("izolowany" if wariant == "izolowany" else tryb)
    if not otwarte:
        d_s1 = zu._wiersz(
            _bieg_szyny(migawka, szyny[0], (), klucz=f"s-{tryb}-{uklad}-{odcinki}"), szyny[0]
        )["doziemienie_sieci"]
        d_stacji = sekcja_stacji["doziemienie"]
        assert d_stacji["tryb"] == d_s1["tryb"]
        if tryb != "bezposrednie":
            for klucz in ("prad_a", "i_c_a", "i_l_a", "i_w_a", "rozstrojenie"):
                assert d_stacji[klucz] == d_s1[klucz], klucz
        if tryb == "rezystor":
            # Stacja nie ma punktu zwarcia: napięcia z admitancji sieci (impedancje podłużne
            # pominięte, zastrzeżenie jawne), wiersz — z impedancji składowych punktu.
            assert d_stacji["u0_v"] == pytest.approx(U_F, rel=REL)
            assert doziemienie_sn.ZASTRZEZENIE_PODLUZNYCH_PL in d_stacji["zastrzezenia_pl"]
            assert doziemienie_sn.ZASTRZEZENIE_PODLUZNYCH_PL not in d_s1["zastrzezenia_pl"]
        elif tryb != "bezposrednie":
            assert d_stacji["u0_v"] == d_s1["u0_v"]


# ---------------------------------------------------------------------------
# Iniekcje — każda czerwona na wyroczni modelu
# ---------------------------------------------------------------------------


def _doziemienie_szyny(wariant: str, stan_awsc: str = "spoczynek") -> tuple[dict, dict]:
    migawka = _z_odcinkami(zu._siec(wariant), ODCINKI["kabel"])
    szyna = zu._szyny(migawka)[0]
    zu.reset_canonical_runs()
    zu.reset_enm_store()
    run = zu._bieg(migawka, zu._przypadek(migawka, stan_awsc=stan_awsc), klucz=f"i-{wariant}")
    wiersz = zu._wiersz(run, szyna)
    return wiersz["doziemienie_sieci"], wiersz


I_C_KABLA = SQ3 * UN_V * _b0_odcinkow_s(ODCINKI["kabel"])


def _wyrocznia_izolowana_zgodna(d: dict) -> bool:
    return d["tryb"] == "izolowany" and d["prad_a"] == pytest.approx(I_C_KABLA, abs=1e-4)


def _wyrocznia_rezystora_zgodna(d: dict) -> bool:
    o = wyrocznia_pradu("rezystor", I_C_KABLA, [(complex(zu.R_N, 0.0), zu.Z0_TU)])
    return d["prad_a"] == pytest.approx(o["prad"], rel=1e-6)


def _wyrocznia_awsc_zgodna(d: dict) -> bool:
    z_n = zu.Z_N_WARIANTU["dlawik_awsc_zalaczony"]
    o = wyrocznia_pradu("kompensowany", I_C_KABLA, [(z_n, zu.Z0_TU)])
    return d["prad_a"] == pytest.approx(o["prad"], rel=1e-6) and d["i_w_a"] > 20.0


def test_bez_iniekcji_wyrocznie_zgodne() -> None:
    assert _wyrocznia_izolowana_zgodna(_doziemienie_szyny("izolowany")[0])
    assert _wyrocznia_rezystora_zgodna(_doziemienie_szyny("rezystor")[0])
    assert _wyrocznia_awsc_zgodna(_doziemienie_szyny("dlawik_awsc", "zalaczony")[0])


def test_iniekcja_model_impedancyjny_dla_sieci_izolowanej(monkeypatch: pytest.MonkeyPatch) -> None:
    """Sieć izolowana przepuszczona przez model Z1+Z2+Z0 (tryb „bezpośredni”) — czerwień."""
    monkeypatch.setitem(rdzen_uziemienia.TRYB_DOZIEMIENIA_TYPU, "isolated", "bezposrednie")
    d, _ = _doziemienie_szyny("izolowany")
    assert not _wyrocznia_izolowana_zgodna(d)


def test_iniekcja_pominiety_prad_pojemnosciowy_w_trybie_rezystorowym(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    oryginal = doziemienie_sn.oblicz_doziemienie

    def bez_ic(dane: DaneDoziemienia):
        return oryginal(replace(dane, b0_s=0.0) if dane.tryb == "rezystor" else dane)

    monkeypatch.setattr(modul_wiersza, "oblicz_doziemienie", bez_ic)
    monkeypatch.setattr(modul_sekcji, "oblicz_doziemienie", bez_ic)
    d, _ = _doziemienie_szyny("rezystor")
    assert not _wyrocznia_rezystora_zgodna(d)


def test_iniekcja_i_l_odjety_bez_skladowej_czynnej(monkeypatch: pytest.MonkeyPatch) -> None:
    oryginal = doziemienie_sn.prad_punktow_neutralnych_a
    monkeypatch.setattr(
        doziemienie_sn,
        "prad_punktow_neutralnych_a",
        lambda u_f, punkty: complex(0.0, oryginal(u_f, punkty).imag),
    )
    d, _ = _doziemienie_szyny("dlawik_awsc", "zalaczony")
    assert not _wyrocznia_awsc_zgodna(d)


def test_iniekcja_pominieta_impedancja_zerowa_transformatora_uziemiajacego(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    oryginal = doziemienie_sn.prad_punktow_neutralnych_a
    monkeypatch.setattr(
        doziemienie_sn,
        "prad_punktow_neutralnych_a",
        lambda u_f, punkty: oryginal(u_f, tuple(replace(p, z0_tu_ohm=None) for p in punkty)),
    )
    d, _ = _doziemienie_szyny("rezystor")
    assert not _wyrocznia_rezystora_zgodna(d)


@pytest.mark.parametrize("wariant", ["izolowany", "dlawik", "rezystor"])
def test_impedancja_przejscia_biegu_trafia_do_doziemienia(wariant: str) -> None:
    """Z_f opcji biegu zwarciowego (``fault_impedance``) — doziemienie sieci z wyroczni
    I_F = |U_f·Y/(1 + Z_f·Y)|, U0 = U_f/|1 + Z_f·Y|, Y = (I_N + j·I_C)/U_f."""
    migawka = _z_odcinkami(zu._siec(wariant), ODCINKI["kabel"])
    szyna = zu._szyny(migawka)[0]
    z_f = 25.0
    klucz = f"zf-{wariant}"
    zu.reset_canonical_runs()
    zu.reset_enm_store()
    zu.set_enm(klucz, EnergyNetworkModel.model_validate(migawka))
    przypadek = zu._przypadek(migawka)
    zu._PRZYPADKI[klucz] = (migawka, przypadek)
    run = zu.create_run(
        case_id=klucz,
        klucz_twin=klucz,
        analysis_type="short_circuit_sn",
        options={"fault_type": "SC_1F", "fault_impedance": {"r_f_ohm": z_f, "x_f_ohm": 0.0}},
        scenariusz=przypadek,
    )
    wynik = zu.execute_run(run.id)
    assert wynik.status == "FINISHED", wynik.error_message
    d = zu._wiersz(wynik, szyna)["doziemienie_sieci"]
    z_n = zu.Z_N_WARIANTU[wariant]
    i_n = U_F / (z_n + zu.Z0_TU / 3.0) if z_n is not None else 0j
    y = (i_n + 1j * I_C_KABLA) / U_F
    assert d["z_f_ohm"] == {"re": z_f, "im": 0.0}
    assert d["prad_a"] == pytest.approx(abs(U_F * y / (1.0 + z_f * y)), rel=1e-5)
    if wariant != "rezystor":
        # Rezystor: napięcia z impedancji składowych punktu (wiersz IEC 60909) — nie z Y.
        assert d["u0_v"] == pytest.approx(U_F / abs(1.0 + z_f * y), rel=1e-5)
    # Z_f obniża prąd doziemienia względem metalicznego.
    assert d["prad_a"] < abs(U_F * y)


@pytest.mark.parametrize(
    ("nazwa", "w_raporcie"),
    [
        ("B′0 wartość robocza (Kabel 1)", "B′0 wartość robocza (Kabel 1)"),
        ("  B′0 wartość robocza (Kabel 2)  ", "B′0 wartość robocza (Kabel 2)"),
        ("", None),
        ("   ", None),
        (None, None),
    ],
    ids=["zwykla", "spacje_wokol", "pusta", "same_spacje", "brak"],
)
def test_raport_danych_przyjetych_doziemienia_jedna_regula_nazwy(
    nazwa: str | None, w_raporcie: str | None
) -> None:
    """Linia „Dane przyjęte doziemienia” raportu bierze nazwę danej przyjętej przez jedyny
    predykat nazwy (``network_model.nazwy.jest_nazwa``): pusta i same spacje — pominięte,
    spacje wokół — obcięte (karta NAZWY-JEDNO-ZRODLO)."""
    from api.analysis_run_exports import _linie_doziemienia

    dana = {} if nazwa is None else {"nazwa_pl": nazwa}
    linie = _linie_doziemienia({"tryb_pl": "izolowany", "dane_przyjete": [dana]})
    dane = [linia for linia in linie if linia.startswith("Dane przyjęte doziemienia")]
    if w_raporcie is None:
        assert dane == []
    else:
        assert dane == [f"Dane przyjęte doziemienia (wartości robocze): {w_raporcie}"]
