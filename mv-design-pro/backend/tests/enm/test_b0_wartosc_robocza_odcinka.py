"""Susceptancja zerowa B′0 odcinka — wartość robocza SN jako JEDNA prawda wszystkich konsumentów
pojemności doziemnej (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA, odcinek B0; zasada nr 4).

REGUŁA (``network_model.catalog.wartosci_robocze.wyprowadz_susceptancje_zerowa_sn``, wpięta
w jeden predykat ``enm.skladowa_zerowa_galezi.skladowa_zerowa_galezi``):

* B′0 w modelu ma pierwszeństwo (dana projektanta albo producenta) — bez danej przyjętej;
* kabel SN bez B′0: B′0 = B′1 (żyły ekranowane, pole promieniowe — IEC 60502-2);
* linia SN bez B′0: B′0 = 0,4·B′1 (metoda odbić zwierciadlanych, typowe słupy SN 0,34–0,45);
* nN, WN, napięcie nieznane albo B′1 nieznane/niedodatnie — brak z przyczyną nazwaną, nie zero.

ILOCZYN CECH: pasmo {kabel SN, linia SN, nN, WN, napięcie nieznane} × B′1 {znane, zero, brak}
× B′0 w modelu {jest, brak} × konsument {bocznik Y0 sieci zerowej zwarć (``enm.mapping`` —
wyłącznie B′0 modelu, iloczyn ze sposobem pracy punktu neutralnego), prąd pojemnościowy sieci i jego kompletność (``enm.uziemienie_sekcji``), wejście V12.6
(``solver_input.v126_contracts``) i odmowa solvera przy częściowej sumie, gotowość V12.6
(``application.analyses.v126_gotowosc``), rozpływ niesymetryczny (pojemność pominięta —
bez danych przyjętych B′0), sieć IT nN (``fault_loop.tt_it`` — tylko B′0 modelu)}.

PREDYKATY PARAMI: każdy konsument woła ``skladowa_zerowa_galezi`` (ta sama wartość, ten sam
brak) — test porównuje wartości konsumentów z wyrocznią reguły na TYM SAMYM modelu.
"""

from __future__ import annotations

import math
from typing import Any

import pytest
from enm.models import Bus, Cable, EnergyNetworkModel, ENMHeader, OverheadLine
from enm.skladowa_zerowa_galezi import skladowa_zerowa_galezi
from enm.uziemienie_sekcji import uziemienie_sieci
from network_model.catalog.wartosci_robocze import (
    STOSUNEK_B0_B1_LINII_SN,
    ZALOZENIE_ODCINKA_B0_KABEL_SN,
    ZALOZENIE_ODCINKA_B0_LINIA_SN,
)

from tests.enm.test_skladowa_zerowa_zu import (
    UN_KV,
    _siec,
    _z_magistrala,
)

B1_S_PER_KM = 2.0 * math.pi * 50.0 * 300e-9
B0_MODELU_S_PER_KM = 7.7e-5

#: Pasmo × rodzaj odcinka: (napięcie szyny początku [kV] albo None, kabel?).
PASMA: dict[str, tuple[float | None, bool]] = {
    "kabel_sn": (15.0, True),
    "linia_sn": (20.0, False),
    "kabel_nn": (0.4, True),
    "linia_wn": (110.0, False),
    "nieznane": (None, True),
}


def _odcinek(kabel: bool, b1: float | None, b0: float | None) -> Cable | OverheadLine:
    klasa = Cable if kabel else OverheadLine
    return klasa(
        ref_id="odc",
        name="Odcinek",
        from_bus_ref="a",
        to_bus_ref="b",
        length_km=1.0,
        r_ohm_per_km=0.2,
        x_ohm_per_km=0.1,
        b_siemens_per_km=b1,
        b0_siemens_per_km=b0,
    )


def _wyrocznia(pasmo: str, b1: float | None, b0: float | None) -> float | None:
    """Wyrocznia ręczna reguły — niezależna od implementacji."""
    if b0 is not None:
        return b0
    napiecie, kabel = PASMA[pasmo]
    if napiecie is None or not (1.0 < napiecie < 60.0) or b1 is None or b1 <= 0.0:
        return None
    return b1 if kabel else 0.4 * b1


@pytest.mark.parametrize("pasmo", sorted(PASMA))
@pytest.mark.parametrize("b1", [B1_S_PER_KM, 0.0, None], ids=["b1", "b1_zero", "b1_brak"])
@pytest.mark.parametrize("b0", [B0_MODELU_S_PER_KM, None], ids=["b0_model", "b0_brak"])
def test_regula_b0_iloczyn_pasmo_b1_b0(pasmo: str, b1: float | None, b0: float | None) -> None:
    napiecie, kabel = PASMA[pasmo]
    wynik = skladowa_zerowa_galezi(_odcinek(kabel, b1, b0), napiecie)
    oczekiwane = _wyrocznia(pasmo, b1, b0)
    if oczekiwane is None:
        assert wynik.b0_s_per_km is None
        assert wynik.robocze_b0 == ()
        # Brak nazwany przyczyną — nigdy cisza ani zero.
        assert wynik.brak_b0_pl
        return
    assert wynik.b0_s_per_km == pytest.approx(oczekiwane, rel=1e-12)
    assert wynik.brak_b0_pl is None
    if b0 is not None:
        # Dana modelu: bez danej przyjętej (to nie wartość robocza).
        assert wynik.robocze_b0 == ()
    else:
        ((pole, etykieta, zalozenie, wartosc),) = wynik.robocze_b0
        assert (pole, etykieta) == ("b0_siemens_per_km", "B′0")
        assert wartosc == wynik.b0_s_per_km
        assert zalozenie == (
            ZALOZENIE_ODCINKA_B0_KABEL_SN if kabel else ZALOZENIE_ODCINKA_B0_LINIA_SN
        )


def test_stosunek_linii_w_zakresie_metody_odbic() -> None:
    """Deklaracja założenia („typowe słupy SN 0,34–0,45") przypięta do stałej reguły."""
    assert 0.34 <= STOSUNEK_B0_B1_LINII_SN <= 0.45


def test_przyczyny_braku_rozroznione_wg_pasma() -> None:
    przyczyny = {
        pasmo: skladowa_zerowa_galezi(_odcinek(kabel, B1_S_PER_KM, None), napiecie).brak_b0_pl
        for pasmo, (napiecie, kabel) in PASMA.items()
        if pasmo in ("kabel_nn", "linia_wn", "nieznane")
    }
    assert "nN" in (przyczyny["kabel_nn"] or "")
    assert "WN" in (przyczyny["linia_wn"] or "")
    assert "nieznane" in (przyczyny["nieznane"] or "")
    assert len(set(przyczyny.values())) == 3


# ---------------------------------------------------------------------------
# Konsumenci na REALNYM modelu (GPZ 110/15 kV + magistrala SN z katalogu)
# ---------------------------------------------------------------------------


def _magistrala_bez_b0(dlugosci_m: tuple[int, ...]) -> dict[str, Any]:
    """GPZ z zespołem rezystorowym i magistralą kablową z katalogu, bez B′0 w odcinkach —
    pojemność doziemna z reguły (B′0 = B′1 z C′ katalogu)."""
    migawka = _z_magistrala(_siec("rezystor"), dlugosci_m)
    for galaz in migawka["branches"]:
        if galaz.get("type") == "cable":
            galaz["b0_siemens_per_km"] = None
    return migawka


def _kable_sn(enm: EnergyNetworkModel) -> list[Cable]:
    napiecia = {b.ref_id: b.voltage_kv for b in enm.buses}
    return [
        g for g in enm.branches if isinstance(g, Cable) and napiecia.get(g.from_bus_ref) == UN_KV
    ]


@pytest.mark.parametrize("dlugosci_m", [(2000,), (1500, 3500)], ids=["1-odcinek", "2-odcinki"])
def test_konsumenci_pojemnosci_z_jednej_reguly(dlugosci_m: tuple[int, ...]) -> None:
    from enm.mapping import map_enm_to_network_graph, zbuduj_siec_zerowa
    from network_model.solvers.v126_academic import V126AcademicSolver
    from solver_input.v126_contracts import V126AnalysisType, build_v126_input_from_enm

    enm = EnergyNetworkModel.model_validate(_magistrala_bez_b0(dlugosci_m))
    kable = _kable_sn(enm)
    assert len(kable) == len(dlugosci_m)
    assert all(k.b0_siemens_per_km is None and (k.b_siemens_per_km or 0) > 0 for k in kable)
    # Wyrocznia: kabel SN B′0 = B′1 (C′ katalogu).
    b0_wyrocznia = sum(k.b_siemens_per_km * k.length_km for k in kable)  # type: ignore[operator]

    # Konsument 1: prąd pojemnościowy sieci + dane przyjęte ESTIMATED + kompletność NIEPELNY.
    (siec,) = uziemienie_sieci(enm)
    assert siec.galezie_bez_b0 == ()
    assert siec.b0_s == pytest.approx(b0_wyrocznia, rel=1e-12)
    assert siec.prad_pojemnosciowy_a == pytest.approx(
        math.sqrt(3.0) * UN_KV * 1e3 * b0_wyrocznia, rel=1e-12
    )
    assert siec.kompletnosc == "NIEPELNY"
    (dana,) = siec.dane_przyjete_pojemnosci()
    assert dana.jakosc.value == "ESTIMATED"
    assert dana.wartosc is not None and dana.wartosc.jednostka == "S/km"
    assert ZALOZENIE_ODCINKA_B0_KABEL_SN in dana.powod_pl
    assert siec.to_dict()["dane_przyjete_pojemnosci"][0]["jakosc"] == "ESTIMATED"

    # Bocznik Y0 sieci zerowej zwarć IEC 60909 NIE jest konsumentem wartości roboczej B′0
    # (IEC 60909-0:2016 pkt 5.2 f) i rozdz. 1 — ``enm.mapping``): żadnego kroku bocznika
    # pojemności dla odcinków bez B′0 w modelu. Iloczyn sposobów pracy punktu neutralnego —
    # ``test_bocznik_y0_zwarc_wylacznie_z_b0_modelu``.
    graf = map_enm_to_network_graph(enm)
    slad = {k["key"]: k for k in zbuduj_siec_zerowa(enm, graf).slad}
    assert not any(f"z0_line_shunt[{kabel.ref_id}]" in slad for kabel in kable)

    # Konsument 3: wejście i solver V12.6 — ta sama suma, dane przyjęte B′0 w wyniku.
    wejscie = build_v126_input_from_enm(enm, analysis_type=V126AnalysisType.NEUTRAL_EARTHING_DESIGN)
    assert wejscie.uziemienie_sn is not None
    (siec_v126,) = wejscie.uziemienie_sn.sieci
    nazwy = [d.nazwa_pl for d in siec_v126.dane_przyjete]
    assert any(n.startswith("B′0 wartość robocza") for n in nazwy)
    wynik = V126AcademicSolver().run(V126AnalysisType.NEUTRAL_EARTHING_DESIGN, wejscie)["result"]
    assert wynik["capacitive_earth_fault_current_a"] == pytest.approx(
        siec.prad_pojemnosciowy_a, abs=1e-4
    )
    assert wynik["kompletnosc_dowodu"] == "NIEPELNY"
    assert any(d["nazwa_pl"].startswith("B′0 wartość robocza") for d in wynik["dane_przyjete"])

    # Konsument 4: gotowość V12.6 — warunek pojemności doziemnej spełniony z reguły.
    from application.analyses.v126_gotowosc import ocen_gotowosc_v126

    warunki = {
        w.kod: w
        for w in ocen_gotowosc_v126(enm, V126AnalysisType.NEUTRAL_EARTHING_DESIGN, {}).warunki
    }
    assert warunki["galezie.b0"].spelniony is True
    assert "galezie.bez_b0" not in warunki or warunki["galezie.bez_b0"].spelniony


def test_galaz_reczna_bez_b1_czyni_prad_pojemnosciowy_niewyznaczonym() -> None:
    """Częściowa suma B′0 nie jest wynikiem: jedna gałąź SN bez B′0 i bez B′1 ⇒ I_C = None
    w ``uziemienie_sieci``, odmowa z polem ``b0_siemens_per_km`` w V12.6 (ten sam predykat)."""
    from network_model.solvers.v126_academic import V126AcademicSolver
    from solver_input.v126_contracts import V126AnalysisType, build_v126_input_from_enm

    migawka = _magistrala_bez_b0((1500, 3500))
    kabel = next(
        g for g in migawka["branches"] if g.get("type") == "cable" and g.get("catalog_ref")
    )
    kabel["b_siemens_per_km"] = None
    enm = EnergyNetworkModel.model_validate(migawka)
    (siec,) = uziemienie_sieci(enm)
    assert siec.galezie_bez_b0 == (kabel["ref_id"],)
    assert siec.b0_s > 0.0
    assert siec.prad_pojemnosciowy_a is None
    assert siec.rozstrojenie is None

    wejscie = build_v126_input_from_enm(enm, analysis_type=V126AnalysisType.NEUTRAL_EARTHING_DESIGN)
    wynik = V126AcademicSolver().run(V126AnalysisType.NEUTRAL_EARTHING_DESIGN, wejscie)["result"]
    assert wynik.get("capacitive_earth_fault_current_a") is None
    assert "b0_siemens_per_km" in wynik["missing_fields"]


def test_zbior_z0_roboczych_biegow_bez_b0() -> None:
    """Zbiór gałęzi z wartością roboczą składowej zerowej biegów (zwarcie doziemne i rozpływ
    niesymetryczny — ``galezie_z0_robocze``, jedno źródło ich założeń i wierszy) niesie R′0/X′0,
    a NIGDY B′0: sieć zerowa zwarć czyta wyłącznie B′0 modelu, rozpływ pomija pojemności."""
    from enm.dane_przyjete_galezi import galezie_z0_robocze, zalozenia_z0_galezi

    migawka = _magistrala_bez_b0((2000,))
    for galaz in migawka["branches"]:
        if galaz.get("type") == "cable":
            galaz["r0_ohm_per_km"] = None
            galaz["x0_ohm_per_km"] = None
    enm = EnergyNetworkModel.model_validate(migawka)
    assert any(s.robocze_b0 for s in _skladowe_kabli(enm))
    pola = {p[0] for _, pola in galezie_z0_robocze(enm) for p in pola}
    assert pola and "b0_siemens_per_km" not in pola
    for zalozenie in zalozenia_z0_galezi(enm, None):
        assert all("B′0" not in str(d) for d in zalozenie.get("dane_przyjete") or ())


def _skladowe_kabli(enm: EnergyNetworkModel) -> list[Any]:
    napiecia = {b.ref_id: b.voltage_kv for b in enm.buses}
    return [skladowa_zerowa_galezi(k, napiecia.get(k.from_bus_ref)) for k in _kable_sn(enm)]


@pytest.fixture
def _czysty_stan_biegow():
    from enm.canonical_analysis import reset_canonical_runs
    from enm.store import reset_enm_store

    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _wiersz_1f(migawka: dict[str, Any], klucz: str) -> tuple[dict[str, Any], dict[str, Any]]:
    """Bieg kanoniczny 1F (ścieżka użytkownika: przypadek ze scenariuszem zwarcia na szynie
    sekcji) — (wiersz szyny zwarcia, surowy wynik biegu)."""
    from tests.enm.test_skladowa_zerowa_zu import _bieg, _przypadek, _wiersz

    wynik = _bieg(migawka, _przypadek(migawka), klucz=klucz)
    szyna = migawka["substations"][0]["gpz_sections"][0]["bus_ref"]
    return _wiersz(wynik, szyna), wynik.raw_result


#: Sposób pracy punktu neutralnego sieci SN → czy wiersz 1F jest zwarciem IEC 60909.
TRYBY_WIERSZA_1F: dict[str, bool] = {
    "bezposrednie": True,
    "rezystor": True,
    "uzwojenie_tr": True,
    "izolowany": False,
    "dlawik": False,
}


@pytest.mark.usefixtures("_czysty_stan_biegow")
@pytest.mark.parametrize("wariant", sorted(TRYBY_WIERSZA_1F))
@pytest.mark.parametrize("b0_modelu", [True, False], ids=["b0_model", "b0_brak"])
def test_bocznik_y0_zwarc_wylacznie_z_b0_modelu(wariant: str, b0_modelu: bool) -> None:
    """ILOCZYN: sposób pracy punktu neutralnego {bezpośrednio, rezystor zespołu, rezystor
    uzwojenia TR, izolowany, dławik} × B′0 {w modelu, brak} × konsument {ślad Y0 sieci
    zerowej, liczby wiersza 1F, dane przyjęte wiersza, założenia biegu, doziemienie sieci}.

    Wartość robocza B′0 NIE wchodzi do sieci zerowej zwarć IEC 60909 (IEC 60909-0:2016
    pkt 5.2 f): pojemności linii w składowej zerowej sieci uziemionej przez małą impedancję
    tylko przy współczynniku zwarcia doziemnego > 1,4; rozdz. 1: sieć izolowana
    i skompensowana poza zakresem). Wyrocznia niezmienności: podwojenie B′1 odcinków bez B′0
    nie zmienia ani jednej liczby wiersza 1F (B′1 nie wchodzi do sieci zgodnej zwarć, karta
    BEZ-POJEMNOSCI), a zmienia prąd pojemnościowy sieci (``doziemienie_sieci``) — jedynego
    konsumenta wartości roboczej w biegu zwarciowym."""
    from tests.enm.test_skladowa_zerowa_zu import B0_KABLA_S_PER_KM, _siec, _z_magistrala

    def _model(skala_b1: float) -> dict[str, Any]:
        migawka = _z_magistrala(_siec(wariant), (1500, 3500))
        for galaz in migawka["branches"]:
            if galaz.get("type") == "cable":
                galaz["b0_siemens_per_km"] = B0_KABLA_S_PER_KM if b0_modelu else None
                galaz["b_siemens_per_km"] = galaz["b_siemens_per_km"] * skala_b1
        return migawka

    migawka = _model(1.0)
    enm = EnergyNetworkModel.model_validate(migawka)
    from enm.mapping import map_enm_to_network_graph, zbuduj_siec_zerowa

    slad = {k["key"] for k in zbuduj_siec_zerowa(enm, map_enm_to_network_graph(enm)).slad}
    kable = _kable_sn(enm)
    assert len(kable) == 2
    assert {f"z0_line_shunt[{k.ref_id}]" in slad for k in kable} == {b0_modelu}

    wiersz, surowy = _wiersz_1f(migawka, f"b0-{wariant}-{b0_modelu}-1")
    assert all("B′0" not in d["nazwa_pl"] for d in wiersz.get("dane_przyjete_galezi") or ())
    assert "B′0" not in str(surowy.get("zalozenia") or "")
    doziemienie = wiersz["doziemienie_sieci"]
    nazwy_przyjete = [d["nazwa_pl"] for d in doziemienie.get("dane_przyjete") or ()]
    assert any(n.startswith("B′0 wartość robocza") for n in nazwy_przyjete) is (not b0_modelu)
    if TRYBY_WIERSZA_1F[wariant]:
        assert wiersz.get("brak_wyniku_zerowego") is None and wiersz["ikss_a"] is not None
    else:
        assert wiersz["ikss_a"] is None
        assert wiersz["brak_wyniku_zerowego"]["przyczyna"] == "poza_zakresem_iec60909"

    if b0_modelu:
        return
    wiersz_2, _ = _wiersz_1f(_model(2.0), f"b0-{wariant}-{b0_modelu}-2")
    for pole in ("ikss_a", "ip_a", "ith_a", "z0_ohm", "z1_ohm", "zkk_ohm"):
        assert wiersz_2.get(pole) == wiersz.get(pole), pole
    i_c, i_c_2 = doziemienie.get("i_c_a"), wiersz_2["doziemienie_sieci"].get("i_c_a")
    if i_c is not None:
        assert i_c_2 == pytest.approx(2.0 * i_c, rel=1e-9)


def test_siec_it_nn_czyta_wylacznie_b0_modelu() -> None:
    """Sieć IT nN: reguła odmawia pasma nN (pojemność kabla nN zależy od budowy), więc
    ``fault_loop.tt_it`` czytający wyłącznie B′0 modelu daje TEN SAM predykat co reguła."""
    for b1 in (B1_S_PER_KM, None):
        wynik = skladowa_zerowa_galezi(_odcinek(True, b1, None), 0.4)
        assert wynik.b0_s_per_km is None
    wynik_modelu = skladowa_zerowa_galezi(_odcinek(True, B1_S_PER_KM, B0_MODELU_S_PER_KM), 0.4)
    assert wynik_modelu.b0_s_per_km == B0_MODELU_S_PER_KM


def test_determinizm_danych_przyjetych_pojemnosci() -> None:
    a = uziemienie_sieci(EnergyNetworkModel.model_validate(_magistrala_bez_b0((1500, 3500))))
    b = uziemienie_sieci(EnergyNetworkModel.model_validate(_magistrala_bez_b0((1500, 3500))))
    assert [s.to_dict() for s in a] == [s.to_dict() for s in b]


def test_model_minimalny_kabel_sn_i_linia_sn_razem() -> None:
    """Sieć SN z kablem i linią bez B′0: dwie dane przyjęte (po jednej na założenie)."""
    enm = EnergyNetworkModel(
        header=ENMHeader(name="B0"),
        buses=[
            Bus(ref_id="s1", name="S1", voltage_kv=15.0),
            Bus(ref_id="s2", name="S2", voltage_kv=15.0),
            Bus(ref_id="s3", name="S3", voltage_kv=15.0),
        ],
        branches=[
            Cable(
                ref_id="k1",
                name="Kabel",
                from_bus_ref="s1",
                to_bus_ref="s2",
                length_km=2.0,
                r_ohm_per_km=0.2,
                x_ohm_per_km=0.1,
                b_siemens_per_km=B1_S_PER_KM,
            ),
            OverheadLine(
                ref_id="l1",
                name="Linia",
                from_bus_ref="s2",
                to_bus_ref="s3",
                length_km=5.0,
                r_ohm_per_km=0.3,
                x_ohm_per_km=0.35,
                b_siemens_per_km=B1_S_PER_KM / 30.0,
            ),
        ],
    )
    from enm.uziemienie_sekcji import galezie_sieci_sn

    galezie = galezie_sieci_sn(enm, frozenset({"s1", "s2", "s3"}))
    assert {g.ref_id for g in galezie} == {"k1", "l1"}
    napiecia = {b.ref_id: b.voltage_kv for b in enm.buses}
    b0 = sum(
        (skladowa_zerowa_galezi(g, napiecia[g.from_bus_ref]).b0_s_per_km or 0.0) * g.length_km
        for g in galezie
    )
    assert b0 == pytest.approx(B1_S_PER_KM * 2.0 + 0.4 * B1_S_PER_KM / 30.0 * 5.0, rel=1e-12)
