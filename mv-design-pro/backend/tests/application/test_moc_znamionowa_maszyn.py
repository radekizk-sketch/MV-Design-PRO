"""Moc znamionowa maszyny wirującej z danych maszyny, nie z punktu pracy (karta PODSTAWA-Q).

DLACZEGO. IEC 60909-0:2016 liczy udział maszyny asynchronicznej z mocy ZNAMIONOWEJ P_rM:
impedancja Z_M z S_rM = P_rM/(η_r·cos φ_r) (pkt 6.7), krzywa zaniku q i wiersz R_M/X_M
z mocy na parę biegunów m = P_rM/p (pkt 9.1.2, pkt 6.7). Mapowanie ENM brało dotąd P_rM
= |p_mw| — punkt pracy elementu — więc maszyna pracująca z połową mocy dawała połowę udziału,
a maszyna o mocy 1,1 MW na parę biegunów pracująca z 0,9 MW trafiała do złego wiersza R_M/X_M.
Decyzja architekta: P_rM rozstrzyga rejestr wartości roboczych — projektant > tabliczka
``pr_mw`` > P_rM = S_rM·η_r·cos φ_r z mocy pozornej tabliczki ``sn_mva`` > propozycja z punktu
pracy (jawna wartość robocza, ESTIMATED/NIEPELNY). Ta sama klasa dla generatora
synchronicznego: S_rG z tabliczki albo od projektanta, propozycja |P|/cos φ_rG jawnie.

ILOCZYN CECH (wyrocznia zapisana niezależnie od rejestru):
  źródło mocy znamionowej {tabliczka P_rM, tabliczka S_rM (P_rM wyznaczona), projektant P_rM,
     projektant P_rM przy S_rM tabliczki, propozycja z punktu pracy}
  × punkt pracy względem mocy znamionowej {mniejszy, równy, większy}
  × moc na parę biegunów przy progu R_M/X_M {0,9 MW, 1,1 MW}
  × liczba jednostek grupy {1, 2}
  — model maszyny (P_rM, S_rM, m, R_M/X_M), prądy I″k, i_p, I_b (niezależne od punktu pracy
  poza propozycją) i wpisy wartości roboczych (parametr, pochodzenie, wielkości).
Generator synchroniczny: {tabliczka, projektant, propozycja} × punkt pracy × liczba jednostek.
Brama danej tabliczki P_rM (spoza zakresu → wyznaczenie z S_rM albo propozycja z powodem),
maszyna w spoczynku (P = 0) z tabliczką i bez niej.
"""

from __future__ import annotations

from typing import Any

import pytest
from enm.mapping import map_enm_to_network_graph
from enm.models import EnergyNetworkModel
from network_model.catalog.wartosci_robocze import WIELKOSCI_ZWARCIOWE

from tests.application.test_parametry_robocze_maszyn import (
    MNOZNIK_MOCY_PROJEKTANTA,
    _bieg_a,
    _czysty_stan,  # noqa: F401 — fikstura autouse (czysty magazyn biegów i modeli)
    _migawka_a,
    _wiersz,
)

#: Propozycje rejestru η_r i cos φ_r maszyny asynchronicznej (wyrocznia — liczby z rejestru
#: przepisane, nie importowane: zmiana propozycji ma czerwienić test).
ETA_PROPOZYCJA = 0.95
COS_PROPOZYCJA = 0.85
TABLICZKA_BEZ_MOCY = {"pole_pairs": 1, "i_lr_ratio": 6.0, "cos_phi": 0.88, "efficiency": 0.96}
TABLICZKA_BEZ_ETA_COS = {"pole_pairs": 1, "i_lr_ratio": 6.0}

ZRODLA = (
    "tabliczka_pr",
    "tabliczka_sn",
    "projektant_pr",
    "projektant_pr_przy_sn",
    "propozycja",
)
PUNKTY_PRACY = {"mniejszy": 0.5, "rowny": 1.0, "wiekszy": 2.0}
#: Moc na parę biegunów (p = 1, więc też P_rM jednej maszyny) po obu stronach progu 1 MW.
MOCE_PRZY_PROGU = (0.9, 1.1)


def _migawka(
    zrodlo: str, moc: float, punkt: str, jednostki: int, *, maszyna: str = "asynchroniczna"
) -> tuple[dict[str, Any], str]:
    """Maszyna SN 33 kV: moc znamionowa jednej maszyny ``moc`` [MW], punkt pracy elementu
    = ``moc`` × krotność punktu × liczba jednostek."""
    p_mw = moc * PUNKTY_PRACY[punkt] * jednostki
    migawka, wezel, _ = _migawka_a(maszyna, "propozycja", p_mw=p_mw, jednostki=jednostki)
    gen = migawka["generators"][0]
    tabliczka = gen["materialized_params"]
    sn_mva = moc / (ETA_PROPOZYCJA * COS_PROPOZYCJA)
    if zrodlo == "tabliczka_pr":
        tabliczka.update({"pr_mw": moc, **TABLICZKA_BEZ_MOCY})
    elif zrodlo == "tabliczka_sn":
        tabliczka.update({"sn_mva": sn_mva, **TABLICZKA_BEZ_ETA_COS})
    elif zrodlo == "projektant_pr":
        tabliczka.update(TABLICZKA_BEZ_MOCY)
        gen["overrides"] = [{"key": "pr_mw", "value": moc, "reason": None}]
        gen["parameter_source"] = "OVERRIDE"
    elif zrodlo == "projektant_pr_przy_sn":
        tabliczka.update({"sn_mva": sn_mva, **TABLICZKA_BEZ_ETA_COS})
        gen["overrides"] = [{"key": "pr_mw", "value": moc, "reason": None}]
        gen["parameter_source"] = "OVERRIDE"
    else:
        assert zrodlo == "propozycja"
        tabliczka.update(TABLICZKA_BEZ_MOCY)
    EnergyNetworkModel.model_validate(migawka)
    return migawka, wezel


def _maszyna_grafu(migawka: dict[str, Any]) -> Any:
    graf = map_enm_to_network_graph(EnergyNetworkModel.model_validate(migawka))
    (maszyna,) = graf.asynchronous_machine_sources.values()
    return maszyna


def _wyrocznia_wpisow(zrodlo: str, moc: float) -> set[tuple[str, str, tuple[str, ...]]]:
    """(parametr, pochodzenie, wielkości) wpisów wartości roboczych maszyny SN 33 kV, p = 1.

    P_rM z S_rM tabliczki: η_r i cos φ_r wpływają wyłącznie na m = S_rM·η·cos φ (I_b) —
    chyba że w zakresie bramy parametru (0,5–1) m przechodzi przez próg 1 MW wiersza R_M/X_M:
    m(x) = moc·x/x_propozycji, więc próg leży w zakresie, gdy moc·0,5/x_p < 1 ≤ moc·1/x_p.
    Dla moc 0,9 MW: η (0,95) — 0,47…0,947 MW, stały wiersz (tylko I_b); cos φ (0,85) —
    0,53…1,059 MW, wiersz się zmienia (wszystkie prądy). Dla 1,1 MW — oba zmieniają wiersz."""
    wszystkie = tuple(WIELKOSCI_ZWARCIOWE)

    def wg_progu(propozycja: float) -> tuple[str, ...]:
        return wszystkie if moc * 0.5 / propozycja < 1.0 <= moc / propozycja else ("ib",)

    if zrodlo == "tabliczka_pr":
        return set()
    if zrodlo == "tabliczka_sn":
        return {
            ("efficiency", "PROPOZYCJA", wg_progu(ETA_PROPOZYCJA)),
            ("cos_phi", "PROPOZYCJA", wg_progu(COS_PROPOZYCJA)),
        }
    if zrodlo == "projektant_pr":
        return {("pr_mw", "PROJEKTANT", wszystkie)}
    if zrodlo == "projektant_pr_przy_sn":
        # Z_M z S_rM tabliczki: P_rM projektanta zmienia tylko m — ale brama P_rM
        # (0,001–100 MW) przekracza próg R_M/X_M, więc wszystkie prądy. η, cos φ bez wpływu.
        return {("pr_mw", "PROJEKTANT", wszystkie)}
    assert zrodlo == "propozycja"
    return {("pr_mw", "PROPOZYCJA", wszystkie)}


def test_wyrocznia_obejmuje_obie_strony_progu() -> None:
    """Iloczyn ma sens tylko, gdy wyrocznia daje i „tylko I_b”, i „wszystkie prądy”."""
    wielkosci = {w for moc in MOCE_PRZY_PROGU for _, _, w in _wyrocznia_wpisow("tabliczka_sn", moc)}
    assert wielkosci == {("ib",), tuple(WIELKOSCI_ZWARCIOWE)}


@pytest.mark.parametrize("jednostki", [1, 2])
@pytest.mark.parametrize("moc", MOCE_PRZY_PROGU)
@pytest.mark.parametrize("punkt", sorted(PUNKTY_PRACY))
@pytest.mark.parametrize("zrodlo", ZRODLA)
def test_model_maszyny_z_mocy_znamionowej(
    zrodlo: str, punkt: str, moc: float, jednostki: int
) -> None:
    migawka, _ = _migawka(zrodlo, moc, punkt, jednostki)
    maszyna = _maszyna_grafu(migawka)
    p_jednostki = moc * PUNKTY_PRACY[punkt] if zrodlo == "propozycja" else moc
    assert maszyna.moc_jednostki_mw == pytest.approx(p_jednostki, rel=1e-12)
    assert maszyna.pr_mw == pytest.approx(p_jednostki * jednostki, rel=1e-12)
    assert maszyna.liczba_jednostek == jednostki
    assert maszyna.p_per_pole_mw == pytest.approx(p_jednostki, rel=1e-12)  # p = 1
    assert maszyna.r_over_x_ratio == (0.10 if p_jednostki >= 1.0 else 0.15)
    if zrodlo in ("tabliczka_sn", "projektant_pr_przy_sn"):
        # S_rM wprost z tabliczki (× liczba jednostek) — niezależnie od P_rM, η, cos φ.
        assert maszyna.sr_mva_tabliczki is not None
        assert maszyna.sr_mva == pytest.approx(
            moc / (ETA_PROPOZYCJA * COS_PROPOZYCJA) * jednostki, rel=1e-12
        )
    else:
        assert maszyna.sr_mva_tabliczki is None
        eta, cos = TABLICZKA_BEZ_MOCY["efficiency"], TABLICZKA_BEZ_MOCY["cos_phi"]
        assert maszyna.sr_mva == pytest.approx(p_jednostki * jednostki / (eta * cos), rel=1e-12)


@pytest.mark.parametrize("jednostki", [1, 2])
@pytest.mark.parametrize("moc", MOCE_PRZY_PROGU)
@pytest.mark.parametrize("zrodlo", ZRODLA)
def test_prady_niezalezne_od_punktu_pracy_poza_propozycja(
    zrodlo: str, moc: float, jednostki: int
) -> None:
    """Prądy zwarciowe punktu maszyny nie zależą od jej punktu pracy, gdy moc znamionowa jest
    daną maszyny (tabliczka, wyznaczenie z S_rM, projektant) — bit w bit; przy propozycji
    rosną z punktem pracy. Wpisy wartości roboczych wg wyroczni w każdym punkcie pracy."""
    wiersze = {}
    for punkt in PUNKTY_PRACY:
        migawka, wezel = _migawka(zrodlo, moc, punkt, jednostki)
        wiersz = _wiersz(_bieg_a(migawka), wezel)
        wiersze[punkt] = wiersz
        wpisy = wiersz.get("parametry_robocze_maszyn", [])
        assert {
            (w["parametr"], w["pochodzenie"], tuple(w["wielkosci"])) for w in wpisy
        } == _wyrocznia_wpisow(zrodlo, moc), punkt
    for klucz in ("ikss_a", "ip_a", "ib_a", "ith_a"):
        wartosci = [wiersze[punkt][klucz] for punkt in ("mniejszy", "rowny", "wiekszy")]
        if zrodlo == "propozycja":
            # Większa P_rM → większy udział maszyny w I″k i I_b; I_th zależy też od
            # współczynnika n (stosunek I″k/I_k), więc dla niej — tylko „różne”.
            assert len(set(wartosci)) == 3, klucz
            if klucz in ("ikss_a", "ib_a"):
                assert wartosci[0] < wartosci[1] < wartosci[2], klucz
        else:
            assert wartosci[0] == wartosci[1] == wartosci[2], klucz


@pytest.mark.parametrize("zrodlo", ["tabliczka_pr", "tabliczka_sn", "projektant_pr"])
def test_punkt_pracy_rowny_znamionowej_daje_liczby_propozycji(zrodlo: str) -> None:
    """Sonda: maszyna w punkcie znamionowym — moc z danych maszyny i propozycja z punktu pracy
    dają ten sam I″k (ta sama P_rM; przy S_rM tabliczki — ta sama S_rM z dokładnością
    zaokrąglenia S_rM·η·cos φ)."""
    migawka_dana, wezel = _migawka(zrodlo, 1.1, "rowny", 1)
    migawka_prop, _ = _migawka("propozycja", 1.1, "rowny", 1)
    if zrodlo == "tabliczka_sn":
        # η, cos φ z propozycji w obu wariantach — inaczej S_rM różni się z definicji.
        for klucz in ("efficiency", "cos_phi"):
            del migawka_prop["generators"][0]["materialized_params"][klucz]
    w_dana = _wiersz(_bieg_a(migawka_dana), wezel)
    w_prop = _wiersz(_bieg_a(migawka_prop), wezel)
    for klucz in ("ikss_a", "ip_a", "ib_a"):
        assert w_dana[klucz] == pytest.approx(w_prop[klucz], rel=1e-12), klucz


@pytest.mark.parametrize(
    ("tabliczka", "oczekiwane_pochodzenie"),
    [
        ({"pr_mw": 0.0}, "PROPOZYCJA"),
        ({"pr_mw": 500.0}, "PROPOZYCJA"),
        ({"pr_mw": -1.0, "sn_mva": 1.2}, "KATALOG"),
        ({"pr_mw": True}, "PROPOZYCJA"),
    ],
)
def test_brama_danej_tabliczki_mocy_znamionowej(
    tabliczka: dict[str, Any], oczekiwane_pochodzenie: str
) -> None:
    """Dana tabliczki P_rM spoza bramy nie jest daną: obliczenie wyznacza P_rM z S_rM tabliczki
    albo przyjmuje propozycję — powód odrzucenia jest w opisie źródła wartości roboczej."""
    migawka, wezel, _ = _migawka_a("asynchroniczna", "propozycja", p_mw=0.9)
    migawka["generators"][0]["materialized_params"].update(tabliczka)
    wiersz = _wiersz(_bieg_a(migawka), wezel)
    wpisy = {w["parametr"]: w for w in wiersz.get("parametry_robocze_maszyn", [])}
    maszyna = _maszyna_grafu(migawka)
    if oczekiwane_pochodzenie == "PROPOZYCJA":
        assert wpisy["pr_mw"]["pochodzenie"] == "PROPOZYCJA"
        assert "dana tabliczki odrzucona" in wpisy["pr_mw"]["opis_zrodla_pl"]
        assert maszyna.pr_mw == pytest.approx(0.9)
    else:
        assert "pr_mw" not in wpisy  # P_rM wyznaczona z danej tabliczki S_rM
        assert maszyna.pr_mw == pytest.approx(1.2 * ETA_PROPOZYCJA * COS_PROPOZYCJA)


@pytest.mark.parametrize("maszyna", ["asynchroniczna", "synchroniczna"])
@pytest.mark.parametrize("z_tabliczka", [True, False])
def test_maszyna_w_spoczynku(maszyna: str, z_tabliczka: bool) -> None:
    """Maszyna o zerowym punkcie pracy wnosi udział z mocy znamionowej tabliczki (silnik
    zasila zwarcie niezależnie od obciążenia); bez tabliczki moc znamionowa jest nieustalona
    i maszyna nie wchodzi do grafu zwarciowego (bez fabrykowania mocy)."""
    migawka, _, _ = _migawka_a(maszyna, "propozycja", p_mw=0.0)
    if z_tabliczka:
        klucz = "pr_mw" if maszyna == "asynchroniczna" else "sn_mva"
        migawka["generators"][0]["materialized_params"][klucz] = 1.5
    graf = map_enm_to_network_graph(EnergyNetworkModel.model_validate(migawka))
    zrodla = (
        graf.asynchronous_machine_sources
        if maszyna == "asynchroniczna"
        else graf.synchronous_machine_sources
    )
    assert (len(zrodla) == 1) is z_tabliczka


@pytest.mark.parametrize("jednostki", [1, 2])
@pytest.mark.parametrize("punkt", sorted(PUNKTY_PRACY))
@pytest.mark.parametrize("zrodlo", ["tabliczka", "projektant", "propozycja"])
def test_generator_synchroniczny_moc_pozorna_znamionowa(
    zrodlo: str, punkt: str, jednostki: int
) -> None:
    """S_rG generatora synchronicznego: tabliczka i projektant — niezależne od punktu pracy;
    propozycja = |P|/(n·cos φ_rG) jednej maszyny, jawnie jako wartość robocza wszystkich
    prądów (Z″_GK ∝ 1/S_rG)."""
    moc_s = 2.5
    p_mw = 2.0 * PUNKTY_PRACY[punkt] * jednostki
    migawka, wezel, _ = _migawka_a(
        "synchroniczna", zrodlo, p_mw=p_mw, jednostki=jednostki, moc=moc_s
    )
    graf = map_enm_to_network_graph(EnergyNetworkModel.model_validate(migawka))
    (maszyna,) = graf.synchronous_machine_sources.values()
    if zrodlo == "tabliczka":
        assert maszyna.sr_mva == pytest.approx(moc_s * jednostki)
    elif zrodlo == "projektant":
        assert maszyna.sr_mva == pytest.approx(moc_s * MNOZNIK_MOCY_PROJEKTANTA * jednostki)
    else:
        assert maszyna.sr_mva == pytest.approx(p_mw / 0.8)  # propozycja cos φ_rG 0,8
    wpisy = {
        w["parametr"]: w
        for w in _wiersz(_bieg_a(migawka), wezel).get("parametry_robocze_maszyn", [])
    }
    if zrodlo == "propozycja":
        assert wpisy["sn_mva"]["pochodzenie"] == "PROPOZYCJA"
        assert wpisy["sn_mva"]["wartosc"] == pytest.approx(p_mw / jednostki / 0.8)
        assert wpisy["sn_mva"]["wielkosci"] == list(WIELKOSCI_ZWARCIOWE)
        assert "punktu pracy" in wpisy["sn_mva"]["opis_zrodla_pl"]
    else:
        assert wpisy.get("sn_mva", {}).get("pochodzenie") in (None, "PROJEKTANT")
