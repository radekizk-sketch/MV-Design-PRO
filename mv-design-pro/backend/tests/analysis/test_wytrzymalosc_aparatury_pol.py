"""Werdykty wytrzymałości aparatury pól stacji liczone Z MODELU (karta KD-6, poz. 2).

INTENCJA: inżynier, który policzył zwarcie w stacji, ma dostać odpowiedź „czy
aparatura pól to wytrzyma" BEZ uprzedniego ręcznego konfigurowania aparatów —
model wie, jaki aparat stoi w każdym polu (pozycja katalogu APARAT_SN). Zapisana
konfiguracja pozostaje nadrzędna tam, gdzie inżynier jej użył, a każdy wiersz
mówi wprost, skąd wziął aparat (`zrodlo`).

Karta WYTRZYMALOSC-PRAD-POLA: prądy biorą się PER POLE z wiersza zapisanego biegu dla
punktu zabudowy pola (``prady_pol_z_biegu``), a każdy wiersz niesie dwa rekordy werdyktu
wyjaśnialnego (dynamiczny i cieplny) — status zawsze z wynikiem, limitem i przyczyną.
"""

from __future__ import annotations

import dataclasses
from typing import Any

import pytest
from application.analyses.wytrzymalosc_aparatury_pol import (
    READINESS_BRAK_PRADU_POLA,
    READINESS_BRAK_ZDOLNOSCI_WYLACZANIA,
    READINESS_POZYCJA_BEZ_ZNAMION,
    READINESS_STACJA_NIEZNANA,
    RODZAJ_WYLACZANIA_KATALOGU_WYTRZYMALOSCI,
    ZRODLO_KONFIGURACJA,
    ZRODLO_MODEL,
    PradyPola,
    prady_pol_z_biegu,
    zbuduj_widok_wytrzymalosci_aparatury,
)
from enm.models import (
    Bay,
    Bus,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    Substation,
    SwitchBranch,
)
from enm.rola_pola_sn import NAZWA_ROLI_POLA_SN_PL
from network_model.catalog.audit2_catalogs import (
    DEVICE_WITHSTAND_CATALOG,
    ocen_wytrzymalosc_aparatu,
)
from network_model.core.czas_wylaczenia import CzasWylaczeniaTb, czas_tb_roboczy

# Pozycje REALNEGO katalogu APARAT_SN (nie fixture): wyłącznik z Icw 20 kA/1 s
# i bezpiecznik, który wytrzymałości krótkotrwałej nie ma.
WYLACZNIK = "sw-cb-abb-vd4-12kv-630a"
BEZPIECZNIK = "sw-fuse-eti-vv-12kv-63a"
#: Pozycja katalogu WYTRZYMAŁOŚCI (ręczne wskazanie w konfiguracji stacji).
APARAT_KONFIGURACJI = "wstd_breaker_vacuum_15_25"
RUN = "bieg-zwarciowy-testu"


def _enm(*, aparaty: dict[str, str] | None = None) -> EnergyNetworkModel:
    """Stacja z dwoma polami SN na DWÓCH sekcjach (``sn1``, ``sn2``)."""
    przypisania = aparaty if aparaty is not None else {"pole/in": WYLACZNIK, "pole/tr": WYLACZNIK}
    szyna_pola = {"pole/in": "sn1", "pole/tr": "sn2"}
    branches: list[SwitchBranch] = []
    # Aparat pola należy do pola przez `equipment_refs` (jedna prawda składu pola,
    # `enm.sklad_pola.aparaty_pola` — tak zapisują go operacje domenowe).
    aparaty_pol: dict[str, list[str]] = {"pole/in": [], "pole/tr": []}
    for indeks, (pole_ref, catalog_ref) in enumerate(sorted(przypisania.items())):
        aparaty_pol[pole_ref].append(f"aparat/{indeks:02d}")
        branches.append(
            SwitchBranch(
                ref_id=f"aparat/{indeks:02d}",
                name=f"Aparat pola SN {indeks + 1}",
                type="breaker",
                from_bus_ref=szyna_pola[pole_ref],
                to_bus_ref=f"zacisk/{indeks:02d}",
                catalog_ref=catalog_ref,
                catalog_namespace="APARAT_SN",
                meta={"station_ref": "stn", "bay_ref": pole_ref},
            )
        )
    return EnergyNetworkModel(
        header=ENMHeader(name="t", defaults=ENMDefaults(sn_nominal_kv=15.0)),
        buses=[
            Bus(ref_id="sn1", name="Sekcja 1", voltage_kv=15.0),
            Bus(ref_id="sn2", name="Sekcja 2", voltage_kv=15.0),
        ],
        branches=branches,
        substations=[
            Substation(
                ref_id="stn",
                name="Stacja Sady",
                station_type="mv_lv",
                bus_refs=["sn1", "sn2"],
            )
        ],
        # Karta W5-B: pola stacji są rekordami `bays` (jedyny nośnik pól).
        bays=[
            Bay(
                ref_id="pole/in",
                name="P-01",
                bay_role="IN",
                substation_ref="stn",
                bus_ref="sn1",
                equipment_refs=aparaty_pol["pole/in"],
            ),
            Bay(
                ref_id="pole/tr",
                name="P-02",
                bay_role="TR",
                substation_ref="stn",
                bus_ref="sn2",
                equipment_refs=aparaty_pol["pole/tr"],
            ),
        ],
    )


def _prady(ik: float, ip: float, ith: float, punkt: str = "sn1") -> PradyPola:
    return PradyPola(punkt_ref=punkt, punkt_nazwa=punkt, ik_ka=ik, ip_ka=ip, ith_ka=ith)


def _widok(**kwargs: Any) -> dict[str, Any]:
    parametry: dict[str, Any] = {
        "enm": _enm(),
        "station_ref": "stn",
        "prady_pol": {
            "pole/in": _prady(5.0, 12.0, 5.0, "sn1"),
            "pole/tr": _prady(4.0, 10.0, 4.0, "sn2"),
        },
        "run_id": RUN,
    }
    parametry.update(kwargs)
    return zbuduj_widok_wytrzymalosci_aparatury(**parametry)


def _ocena(pole: dict[str, Any], rodzaj: str) -> dict[str, Any]:
    return next(o for o in pole["oceny"] if o["kryterium_id"].endswith(f".{rodzaj}"))


def test_stacja_bez_konfiguracji_daje_werdykty_dla_wszystkich_pol_z_modelu() -> None:
    """SEDNO KARTY: zero ręcznej konfiguracji, a werdykt jest dla KAŻDEGO pola."""
    widok = _widok()

    assert widok["status"] == "OK"
    assert widok["stacja_nazwa"] == "Stacja Sady"
    assert widok["bieg_zwarciowy_ref"] == RUN
    assert [p["pole"] for p in widok["pola"]] == ["P-01", "P-02"]
    assert {p["zrodlo"] for p in widok["pola"]} == {ZRODLO_MODEL}
    assert [p["aparat_catalog_ref"] for p in widok["pola"]] == [WYLACZNIK, WYLACZNIK]
    # Nazwa roli z kanonu słownictwa ról pól (karta #141), nie druga lista słów.
    assert [p["rola_pl"] for p in widok["pola"]] == [
        NAZWA_ROLI_POLA_SN_PL["LINIA_IN"],
        NAZWA_ROLI_POLA_SN_PL["TRANSFORMATOROWE"],
    ]


def test_kazde_pole_dostaje_wlasny_prad_z_biegu() -> None:
    """Pole na sekcji 2 nie dostaje prądu sekcji 1 (dawniej jedna liczba na stację)."""
    pierwsze, drugie = _widok()["pola"]

    assert pierwsze["prady_pola"]["ip_ka"] == 12.0
    assert drugie["prady_pola"]["ip_ka"] == 10.0
    assert _ocena(pierwsze, "dynamiczna")["wynik"]["wartosc"]["wartosc"] == 12.0
    assert _ocena(drugie, "dynamiczna")["wynik"]["wartosc"]["wartosc"] == 10.0
    assert _ocena(drugie, "cieplna")["wynik"]["wartosc"]["wartosc"] == 4.0


def test_werdykt_dynamiczny_powstaje_z_pozycji_katalogu_aparat_sn() -> None:
    """I_dyn = 2,5 · Icw (20 kA) = 50 kA ⇒ prąd udarowy 12 kA mieści się — z wyjaśnieniem.

    Kanon V12K-351: 2,5·I_th to PROPOZYCJA wartości roboczej rejestru (NORMA, IEC 62271-1:2017
    p. 5.7), nie dana karty — stoi w danych przyjętych, a dowód jest niepełny."""
    pole = _widok()["pola"][0]

    assert pole["znamiona"]["i_th_ka"] == 20.0
    assert pole["znamiona"]["i_th_pochodzenie"] == "producent"
    assert pole["znamiona"]["i_dyn_ka"] == 50.0
    assert pole["znamiona"]["i_dyn_pochodzenie"] == "wartosc_robocza"
    assert pole["znamiona"]["wartosci"]["i_dyn_ka"]["pochodzenie"] == "PROPOZYCJA"
    assert pole["werdykt"]["i_dyn_ok"] is True
    ocena = _ocena(pole, "dynamiczna")
    assert ocena["status_maszynowy"] == "SPELNIA"
    assert ocena["kompletnosc_dowodu"] == "NIEPELNY"
    assert ocena["limit"]["wartosc"] == {"wartosc": 50.0, "jednostka": "kA"}
    # Znamię z relacji normowej: podstawa limitu to norma, nie karta producenta.
    assert ocena["limit"]["podstawa"]["rodzaj"] == "NORMA"
    assert ocena["limit"]["podstawa"]["jednostka_redakcyjna"] == "IEC 62271-1:2017 p. 5.7"
    dane = ocena["dowod"]["status_danych"]["dane_przyjete"]
    assert [(d["wartosc"], d["jakosc"]) for d in dane] == [
        ({"wartosc": 50.0, "jednostka": "kA"}, "ESTIMATED")
    ]
    assert "IEC 62271-1:2017 p. 5.7" in dane[0]["powod_pl"]
    assert "Wpływ" in dane[0]["powod_pl"]
    assert ocena["margines"] is not None
    assert ocena["wyjasnienie"]["zdanie_pl"]


def test_bez_czasu_wylaczenia_kryterium_cieplne_ma_brak_podstawy() -> None:
    """Brak czasu to NIE jest werdykt negatywny ani „spełnia" — to brak podstawy.

    Kryterium dynamiczne czasu nie potrzebuje i musi być rozstrzygnięte mimo to
    (inaczej brak jednej danej wygaszałby ocenę, którą da się zrobić).
    """
    pole = _widok()["pola"][0]

    assert pole["czas_wylaczenia"]["t_clearing_s"] is None
    assert pole["werdykt"]["i_th_ok"] is None
    assert pole["werdykt"]["ok"] is False
    assert "NIEUSTALONE" in pole["werdykt"]["message_pl"]
    assert "aparatura.czas_wylaczenia_nieustalony" in pole["kody_gotowosci"]
    cieplna = _ocena(pole, "cieplna")
    assert cieplna["status_maszynowy"] == "BRAK_PODSTAWY"
    assert cieplna["limit"] is None
    assert cieplna["wynik"]["wartosc"] == {"wartosc": 5.0, "jednostka": "kA"}
    assert any("Czas wyłączenia" in b for b in cieplna["wyjasnienie"]["czego_brakuje"])
    assert _ocena(pole, "dynamiczna")["status_maszynowy"] == "SPELNIA"


def test_zapisana_konfiguracja_ma_pierwszenstwo_i_jest_tak_oznaczona() -> None:
    """Inżynier, który wskazał aparat ręcznie, dostaje SWÓJ aparat, nie modelowy."""
    widok = _widok(
        bay_device_withstand={
            "P-01": {
                "device_id": APARAT_KONFIGURACJI,
                "i_peak_calculated_ka": 1.0,
                "i_thermal_calculated_ka": 1.0,
                "t_clearing_s": 0.5,
            }
        }
    )

    pierwsze, drugie = widok["pola"]
    assert pierwsze["pole"] == "P-01"
    assert pierwsze["zrodlo"] == ZRODLO_KONFIGURACJA
    assert pierwsze["aparat_catalog_ref"] == APARAT_KONFIGURACJI
    assert pierwsze["czas_wylaczenia"]["t_clearing_s"] == 0.5
    # Czas z konfiguracji domyka kryterium cieplne; prąd i tak z biegu dla TEGO pola.
    assert pierwsze["werdykt"]["i_th_ok"] is True
    cieplna = _ocena(pierwsze, "cieplna")
    assert cieplna["status_maszynowy"] == "SPELNIA"
    # 0,5 s < 1 s znamionowej: limit = I_th 25 kA, BEZ przeliczenia w górę (IEC 60865-1).
    assert cieplna["limit"]["wartosc"]["wartosc"] == 25.0
    assert cieplna["limit"]["podstawa"]["rodzaj"] == "KATALOG_PRODUCENTA"
    # Pole nieskonfigurowane nadal jedzie z modelu — konfiguracja nie wygasza reszty.
    assert drugie["zrodlo"] == ZRODLO_MODEL


def test_pozycja_bez_znamion_wytrzymalosci_daje_brak_podstawy_a_nie_negatywny() -> None:
    """Bezpiecznik bez Icw: brak podstawy do oceny, nie „nie wytrzymuje"."""
    widok = _widok(enm=_enm(aparaty={"pole/in": BEZPIECZNIK}))
    pole = widok["pola"][0]

    assert pole["znamiona"]["i_th_ka"] is None
    assert pole["znamiona"]["i_dyn_ka"] is None
    assert pole["werdykt"]["i_dyn_ok"] is None
    assert pole["werdykt"]["i_th_ok"] is None
    assert "NIEUSTALONE" in pole["werdykt"]["message_pl"]
    assert READINESS_POZYCJA_BEZ_ZNAMION in pole["kody_gotowosci"]
    assert {_ocena(pole, r)["status_maszynowy"] for r in ("dynamiczna", "cieplna")} == {
        "BRAK_PODSTAWY"
    }
    # Karta SC-IB-ITH-ZRODLA: bezpiecznik MA zdolność wyłączania (63 kA) — jego kryterium
    # wyłączania jest rozstrzygnięte wobec spodziewanego I″k mimo braku znamion wytrzymałości.
    wylaczanie = _ocena(pole, "wylaczanie")
    assert wylaczanie["status_maszynowy"] == "SPELNIA"
    assert wylaczanie["wynik"]["symbol_latex"] == "I_k''"


def test_przekroczenie_wytrzymalosci_dynamicznej_jest_blokerem() -> None:
    """Prąd udarowy 60 kA > I_dyn 50 kA ⇒ jawny bloker z liczbami i marginesem."""
    pole = _widok(prady_pol={"pole/in": _prady(20.0, 60.0, 5.0)})["pola"][0]

    assert pole["werdykt"]["i_dyn_ok"] is False
    assert pole["werdykt"]["ok"] is False
    assert "BLOKER" in pole["werdykt"]["message_pl"]
    ocena = _ocena(pole, "dynamiczna")
    assert ocena["status_maszynowy"] == "NIE_SPELNIA"
    assert ocena["margines"]["wartosc"]["wartosc"] == pytest.approx(-10.0)


def test_pole_bez_pradu_w_biegu_ma_nazwany_brak_a_nie_cudzy_prad() -> None:
    """Pole, dla którego bieg nie ma wiersza, nie dostaje prądu innego pola."""
    widok = _widok(prady_pol={"pole/in": _prady(5.0, 12.0, 5.0)})
    pierwsze, drugie = widok["pola"]

    assert widok["status"] == "OK"
    assert pierwsze["werdykt"] is not None
    assert drugie["werdykt"] is None
    assert READINESS_BRAK_PRADU_POLA in drugie["kody_gotowosci"]
    assert drugie["prady_pola"]["ip_ka"] is None
    # Kryteria PORÓWNUJĄCE PRĄD pola (dynamiczne, cieplne, wyłączania) nie mają prądu; rekord
    # izolacji (U_m aparatu wobec szyny pola) prądu nie porównuje — rozstrzyga się bez biegu.
    pradowe = [o for o in drugie["oceny"] if not o["kryterium_id"].endswith(".izolacja")]
    assert len(pradowe) == 3
    assert {o["status_maszynowy"] for o in pradowe} == {"NIE_OCENIONO"}
    assert "NIEUSTALONE" in drugie["komunikat_pl"]


def test_nieznana_stacja_nie_udaje_pustej_stacji() -> None:
    widok = _widok(station_ref="nieistnieje")

    assert widok["status"] == "brak danych"
    assert widok["kody_gotowosci"] == [READINESS_STACJA_NIEZNANA]


def test_wpis_konfiguracji_bez_odpowiednika_w_modelu_nie_znika() -> None:
    """Świadomy zapis inżyniera zostaje widoczny, nawet gdy nie pasuje do pola — ale bez
    punktu zabudowy nie ma prądu, więc nie dostaje werdyktu z cudzego prądu."""
    widok = _widok(
        bay_device_withstand={
            "P-99": {
                "device_id": APARAT_KONFIGURACJI,
                "i_peak_calculated_ka": 1.0,
                "i_thermal_calculated_ka": 1.0,
                "t_clearing_s": 1.0,
            }
        }
    )

    osierocone = [p for p in widok["pola"] if p["pole"] == "P-99"]
    assert len(osierocone) == 1
    assert osierocone[0]["zrodlo"] == ZRODLO_KONFIGURACJA
    assert osierocone[0]["pole_ref"] is None
    assert osierocone[0]["werdykt"] is None
    assert READINESS_BRAK_PRADU_POLA in osierocone[0]["kody_gotowosci"]
    assert {o["status_maszynowy"] for o in osierocone[0]["oceny"]} == {"NIE_OCENIONO"}


def test_widok_jest_deterministyczny() -> None:
    assert _widok() == _widok()


# ---------------------------------------------------------------------------
# Prądy pól z wierszy biegu
# ---------------------------------------------------------------------------


def _wiersz(punkt: str, rodzaj: str, ik: float, ip: float, ith: float) -> dict[str, Any]:
    return {
        "target_id": punkt,
        "element_id": punkt,
        "target_name": f"Szyna {punkt}",
        "fault_type": rodzaj,
        "ikss_ka": ik,
        "ip_ka": ip,
        "ith_ka": ith,
    }


def test_prady_pol_biora_wiersz_3f_szyny_pola() -> None:
    """Każde pole dostaje wiersz SWOJEJ szyny; wiersz zwarcia 1F tej samej szyny nie wchodzi."""
    prady = prady_pol_z_biegu(
        enm=_enm(),
        station_ref="stn",
        wiersze_biegu=[
            _wiersz("sn1", "1F", 9.0, 99.0, 9.0),
            _wiersz("sn1", "3F", 5.0, 12.5, 5.1),
            _wiersz("sn2", "3F", 1.0, 2.5, 1.02),
        ],
    )

    assert prady["pole/in"] == PradyPola(
        punkt_ref="sn1", punkt_nazwa="Szyna sn1", ik_ka=5.0, ip_ka=12.5, ith_ka=5.1
    )
    assert prady["pole/tr"].ik_ka == 1.0
    assert prady["pole/tr"].punkt_ref == "sn2"


@pytest.mark.parametrize(
    "wiersze",
    [
        [],
        [{**_wiersz("sn2", "3F", 1.0, 2.5, 1.02), "ip_ka": None}],
        [_wiersz("sn2", "1F", 1.0, 2.5, 1.02)],
    ],
    ids=["brak_wiersza", "wiersz_bez_ip", "tylko_zwarcie_1f"],
)
def test_pole_bez_kompletnego_wiersza_3f_dostaje_kod_braku(wiersze: list[dict[str, Any]]) -> None:
    prady = prady_pol_z_biegu(
        enm=_enm(),
        station_ref="stn",
        wiersze_biegu=[_wiersz("sn1", "3F", 5.0, 12.5, 5.1), *wiersze],
    )

    assert prady["pole/in"].ik_ka == 5.0
    assert prady["pole/tr"].ik_ka is None
    assert prady["pole/tr"].kody_gotowosci == (READINESS_BRAK_PRADU_POLA,)
    assert prady["pole/tr"].powod_pl


def test_prady_pol_nieznanej_stacji_sa_puste() -> None:
    assert prady_pol_z_biegu(enm=_enm(), station_ref="nie-ma", wiersze_biegu=[]) == {}


# ---------------------------------------------------------------------------
# Predykaty parami: status rekordu K == rozstrzygnięcie jądra K7-B
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("t_k", [0.3, 1.0, 1.0001, 2.0, 4.0])
@pytest.mark.parametrize("ith", [10.0, 14.0, 19.9, 20.0, 25.0])
def test_status_cieplny_rekordu_jest_rozstrzygnieciem_jadra(t_k: float, ith: float) -> None:
    """Rekord K i jądro ``ocen_wytrzymalosc_aparatu`` nie mogą się rozjechać: SPELNIA ⇔
    i_th_ok jest True. Siatka obejmuje oba reżimy przeliczenia (t_k ≤ t_zn: limit = I_th;
    t_k > t_zn: limit maleje jak √(t_zn/t_k)) i granicę równości."""
    czas = {
        "t_clearing_s": t_k,
        "zrodlo": "nastawy_pola",
        "powod_pl": "test",
        "czlon_nastawczy_s": t_k,
        "czas_wlasny_wylacznika_s": 0.0,
        "zalozenia_pl": [],
        "kody_gotowosci": [],
    }
    widok = _widok(
        prady_pol={"pole/in": _prady(ith, 12.0, ith)},
        czasy_pol={"pole/in": czas},
    )
    pole = widok["pola"][0]
    jadro = ocen_wytrzymalosc_aparatu(
        etykieta_pl="x",
        i_dyn_ka=50.0,
        i_th_ka=20.0,
        i_th_duration_s=1.0,
        i_peak_calculated_ka=12.0,
        i_thermal_calculated_ka=ith,
        t_clearing_s=t_k,
    )
    cieplna = _ocena(pole, "cieplna")

    assert (cieplna["status_maszynowy"] == "SPELNIA") is (jadro["i_th_ok"] is True)
    assert cieplna["status_maszynowy"] in {"SPELNIA", "NIE_SPELNIA"}
    limit_oczekiwany = 20.0 if t_k <= 1.0 else 20.0 * (1.0 / t_k) ** 0.5
    assert cieplna["limit"]["wartosc"]["wartosc"] == pytest.approx(limit_oczekiwany, rel=1e-12)


# ---------------------------------------------------------------------------
# Karta SC-IB-ITH-ZRODLA — kryterium zdolności wyłączania (trzeci rekord K)
#
# Iloczyn cech: {rodzaj aparatu: wyłącznik SN, reklozer, bezpiecznik, rozłącznik, odłącznik,
# uziemnik, wyłącznik z konfiguracji, rozłącznik i tor szynowy z konfiguracji} × {pasmo
# punktu: SN, nN, brak napięcia} × {prąd: I_b = I″k (sieć odległa), I_b < I″k (maszyny,
# t_b podane), I_b brak (maszyny bez t_b)} × {I_cu ≥ wartość, I_cu < wartość}. Wiersze
# „I_b < I_cu < I″k" rozróżniają wielkości: porównanie złej wielkości odwraca status.
# ---------------------------------------------------------------------------

REKLOZER = "sw-rec-abb-rec615-17kv-630a"  # I_cu 12,5 kA
ROZLACZNIK = "sw-ls-abb-nal-12kv-400a"
ODLACZNIK = "sw-ds-abb-ojs-12kv-630a"
UZIEMNIK = "sw-es-generic-12kv"
KONF_ROZLACZNIK = "wstd_switch_load_15_25"
KONF_SZYNA = "wstd_busbar_15_2000_50"


def _prady_wyl(
    *,
    ik: float,
    ib: float | None,
    tb: float | None,
    un: float | None,
    i_dc: float | None = None,
    tb_zrodlo: dict[str, Any] | None = None,
) -> PradyPola:
    return PradyPola(
        punkt_ref="sn1",
        punkt_nazwa="sn1",
        ik_ka=ik,
        ip_ka=2.5 * ik,
        ith_ka=ik,
        ib_ka=ib,
        i_dc_ka=i_dc,
        tb_s=tb,
        un_kv=un,
        tb_zrodlo=tb_zrodlo,
    )


def _zrodlo_tb(czas: CzasWylaczeniaTb, *, maszyny: bool) -> dict[str, Any]:
    """Pole ``tb_zrodlo`` wiersza wyniku — ten sam kształt co rdzeń (``to_dict`` + flaga)."""
    return {**czas.to_dict(), "ib_z_udzialem_maszyn": maszyny}


#: t_b z pola, w którym czas własny wyłącznika jest wartością roboczą (rejestr).
_TB_Z_POLA_ROBOCZY = CzasWylaczeniaTb(
    wartosc_s=0.36,
    pochodzenie="Z_POL",
    robocza=True,
    opis_pl="t_b = 0,36 s — najkrótszy czas wyłączenia pól lokalnych punktu zwarcia (pole P-1).",
    pole_ref="pole/1",
    pole_nazwa="P-1",
    zabezpieczenie_ref="zab/1",
    czlon_nastawczy_s=0.3,
    czas_wlasny_s=0.06,
    czas_wlasny_pochodzenie="PROPOZYCJA",
    prad_zwarciowy_a=22000.0,
)
#: t_b z pola z czasem własnym z karty katalogowej — nie wartość robocza.
_TB_Z_POLA_KARTA = dataclasses.replace(
    _TB_Z_POLA_ROBOCZY, robocza=False, czas_wlasny_pochodzenie="KATALOG"
)


def _pole_wyl(catalog_ref: str, prady: PradyPola, **kwargs: Any) -> dict[str, Any]:
    widok = _widok(
        enm=_enm(aparaty={"pole/in": catalog_ref}), prady_pol={"pole/in": prady}, **kwargs
    )
    return next(p for p in widok["pola"] if p["pole_ref"] == "pole/in")


@pytest.mark.parametrize(
    ("aparat", "prady", "status", "symbol", "wartosc"),
    [
        # Wyłącznik SN (I_cu 20 kA) — wielkością jest I_b.
        (WYLACZNIK, _prady_wyl(ik=18.0, ib=18.0, tb=0.1, un=15.0), "SPELNIA", "I_b", 18.0),
        (WYLACZNIK, _prady_wyl(ik=22.0, ib=19.5, tb=0.1, un=15.0), "SPELNIA", "I_b", 19.5),
        (WYLACZNIK, _prady_wyl(ik=25.0, ib=21.0, tb=0.25, un=15.0), "NIE_SPELNIA", "I_b", 21.0),
        # Wiersz bez I_b (zapis sprzed kart I_b / t_b) — nazwany brak, nigdy podmiana na I″k.
        (WYLACZNIK, _prady_wyl(ik=22.0, ib=None, tb=None, un=15.0), "NIE_OCENIONO", None, None),
        # Ten sam wyłącznik na punkcie nN — wielkością jest spodziewany I″k (434.5.1).
        (WYLACZNIK, _prady_wyl(ik=19.5, ib=15.0, tb=0.1, un=0.4), "SPELNIA", "I_k''", 19.5),
        (WYLACZNIK, _prady_wyl(ik=22.0, ib=19.5, tb=0.1, un=0.4), "NIE_SPELNIA", "I_k''", 22.0),
        (WYLACZNIK, _prady_wyl(ik=22.0, ib=None, tb=None, un=0.4), "NIE_SPELNIA", "I_k''", 22.0),
        # Bez napięcia punktu wyboru nie da się ugruntować.
        (WYLACZNIK, _prady_wyl(ik=5.0, ib=5.0, tb=0.1, un=None), "NIE_OCENIONO", None, None),
        # Reklozer SN (I_cu 12,5 kA) — jak wyłącznik.
        (REKLOZER, _prady_wyl(ik=13.0, ib=12.0, tb=0.1, un=15.0), "SPELNIA", "I_b", 12.0),
        # Bezpiecznik (I_cu 63 kA) — prąd spodziewany I″k niezależnie od pasma i od t_b.
        (BEZPIECZNIK, _prady_wyl(ik=64.0, ib=60.0, tb=0.1, un=15.0), "NIE_SPELNIA", "I_k''", 64.0),
        (BEZPIECZNIK, _prady_wyl(ik=50.0, ib=None, tb=None, un=15.0), "SPELNIA", "I_k''", 50.0),
        (BEZPIECZNIK, _prady_wyl(ik=50.0, ib=50.0, tb=0.1, un=None), "SPELNIA", "I_k''", 50.0),
    ],
    ids=[
        "wylacznik_sn_ib_rowne_ik",
        "wylacznik_sn_ib_ponizej_icu_ik_powyzej",
        "wylacznik_sn_ib_powyzej_icu",
        "wylacznik_sn_wiersz_bez_ib",
        "wylacznik_nn_ik_ponizej_icu",
        "wylacznik_nn_ik_powyzej_icu_ib_ponizej",
        "wylacznik_nn_bez_tb",
        "wylacznik_bez_napiecia_punktu",
        "reklozer_sn_ib",
        "bezpiecznik_sn_ik_powyzej_ib_ponizej",
        "bezpiecznik_sn_bez_tb",
        "bezpiecznik_bez_napiecia_punktu",
    ],
)
def test_kryterium_wylaczania_porownuje_wielkosc_z_jedynego_predykatu(
    aparat: str,
    prady: PradyPola,
    status: str,
    symbol: str | None,
    wartosc: float | None,
) -> None:
    ocena = _ocena(_pole_wyl(aparat, prady), "wylaczanie")

    assert ocena["status_maszynowy"] == status
    assert ocena["stosowalnosc"]["dotyczy"] is True
    if symbol is None:
        assert ocena["wynik"] is None
        assert ocena["wyjasnienie"]["czego_brakuje"]
    else:
        assert ocena["wynik"]["symbol_latex"] == symbol
        assert ocena["wynik"]["wartosc"] == {"wartosc": wartosc, "jednostka": "kA"}
        # Rekord nazywa porównaną wielkość i normę — ekran pokazuje, CO porównano.
        assert symbol.replace("''", "″") in ocena["wynik"]["wielkosc_pl"].replace("I″k", "I_k″")
        assert ocena["kryterium"]["warunek_latex"] == rf"{symbol} \le I_{{cu}}"
        assert ocena["limit"]["wartosc"]["jednostka"] == "kA"
    if status in {"SPELNIA", "NIE_SPELNIA"}:
        assert ocena["margines"] is not None


def test_wylacznik_sn_wiersz_bez_ib_ma_nazwany_brak_a_nie_ik() -> None:
    """Wiersz bez I_b (zapis sprzed kart I_b / t_b) to nazwany brak z akcją „przelicz bieg”,
    nigdy cicha podmiana na I″k; kod brakowy t_b nie istnieje (karta TB-WARTOSC-ROBOCZA)."""
    pole = _pole_wyl(WYLACZNIK, _prady_wyl(ik=22.0, ib=None, tb=None, un=15.0))
    ocena = _ocena(pole, "wylaczanie")

    assert not any("czas_tb" in k for k in pole["kody_gotowosci"])
    assert any("przelicz bieg zwarciowy" in b for b in ocena["wyjasnienie"]["czego_brakuje"])
    assert ocena["limit"]["wartosc"]["wartosc"] == 20.0


@pytest.mark.parametrize(
    ("czas", "maszyny", "przyjeta"),
    [
        (czas_tb_roboczy(), True, True),
        (czas_tb_roboczy(), False, False),
        (_TB_Z_POLA_ROBOCZY, True, True),
        (_TB_Z_POLA_ROBOCZY, False, False),
        (_TB_Z_POLA_KARTA, True, False),
        (None, True, False),  # t_b projektanta — wiersz bez `tb_zrodlo`
    ],
    ids=[
        "roboczy_z_maszynami",
        "roboczy_bez_maszyn",
        "z_pola_czas_wlasny_roboczy_z_maszynami",
        "z_pola_czas_wlasny_roboczy_bez_maszyn",
        "z_pola_czas_wlasny_z_karty",
        "projektanta",
    ],
)
def test_ib_przy_tb_roboczym_to_dana_przyjeta_estimated(
    czas: CzasWylaczeniaTb | None, maszyny: bool, przyjeta: bool
) -> None:
    """Iloczyn {pochodzenie t_b} × {I_b z udziałem maszyn}: I_b zależne od t_b roboczego stoi
    na danej przyjętej ESTIMATED (``UNVALIDATED_INPUT``, NIEPELNY — na poziomie W SPEŁNIA
    staje się BRAK_DOWODU), z treścią źródła t_b. I_b bez maszyn (= I″k) nie zależy od t_b,
    więc liczy się jak dana projektowa. Nigdy ``DATASHEET``."""
    tb = 0.1 if czas is None else czas.wartosc_s
    zrodlo = None if czas is None else _zrodlo_tb(czas, maszyny=maszyny)
    pole = _pole_wyl(WYLACZNIK, _prady_wyl(ik=22.0, ib=19.5, tb=tb, un=15.0, tb_zrodlo=zrodlo))
    ocena = _ocena(pole, "wylaczanie")

    assert ocena["status_maszynowy"] == "SPELNIA"
    assert ocena["wynik"]["wartosc"]["wartosc"] == 19.5
    dane = ocena["dowod"]["status_danych"]["dane_przyjete"]
    if przyjeta:
        assert ocena["kompletnosc_dowodu"] == "NIEPELNY"
        assert ocena["dowod"]["status_danych"]["stan"] == "UNVALIDATED_INPUT"
        assert [(d["wartosc"], d["jakosc"]) for d in dane] == [
            ({"wartosc": tb, "jednostka": "s"}, "ESTIMATED")
        ]
        assert dane[0]["powod_pl"] == czas.opis_pl
        assert pole["prady_pola"]["tb_zrodlo"]["pochodzenie"] == czas.pochodzenie
    else:
        assert not any(d["wartosc"]["jednostka"] == "s" for d in dane)
    assert all(d["jakosc"] != "DATASHEET" for d in dane)


@pytest.mark.parametrize("aparat", [WYLACZNIK, ROZLACZNIK])
@pytest.mark.parametrize("tolerancja_robocza", [False, True], ids=["tol_dekl", "tol_robocza"])
@pytest.mark.parametrize("tb_roboczy", [False, True], ids=["tb_projektanta", "tb_roboczy"])
def test_wylaczanie_suma_danych_przyjetych_tb_i_tolerancji_nn(
    tb_roboczy: bool, tolerancja_robocza: bool, aparat: str
) -> None:
    """Iloczyn {t_b roboczy / projektanta} × {tolerancja sieci nN robocza / zadeklarowana} ×
    {aparat przerywający / NIE_DOTYCZY} (scalenie kart TB-WARTOSC-ROBOCZA i
    TOLERANCJA-NN-WARTOSC-ROBOCZA). Rekord, który stoi na obu założeniach, niesie OBA w
    ``dane_przyjete`` — suma w stałej kolejności: najpierw t_b, potem tolerancja nN. Flagi
    pochodzą z jednego wiersza biegu (``tb_zrodlo`` i ``tolerancja_nn_robocza``); rekord
    NIE_DOTYCZY niczego nie porównuje, więc nie stoi na żadnej danej przyjętej."""
    zrodlo = _zrodlo_tb(czas_tb_roboczy(), maszyny=True) if tb_roboczy else None
    prady = dataclasses.replace(
        _prady_wyl(ik=22.0, ib=19.5, tb=0.1, un=15.0, tb_zrodlo=zrodlo),
        tolerancja_nn_robocza=tolerancja_robocza,
    )
    ocena = _ocena(_pole_wyl(aparat, prady), "wylaczanie")
    dane = ocena["dowod"]["status_danych"]["dane_przyjete"]
    oczekiwane: list[str] = []
    if aparat == WYLACZNIK:
        oczekiwane += ["s"] if tb_roboczy else []
        oczekiwane += ["%"] if tolerancja_robocza else []
    assert [d["wartosc"]["jednostka"] for d in dane] == oczekiwane
    if oczekiwane:
        assert ocena["dowod"]["status_danych"]["stan"] == "UNVALIDATED_INPUT"
        assert ocena["kompletnosc_dowodu"] == "NIEPELNY"
    if "%" in oczekiwane:
        assert dane[-1]["nazwa_pl"].startswith("tolerancja napięcia sieci nN (")
    assert all(d["jakosc"] == "ESTIMATED" for d in dane)


@pytest.mark.parametrize(
    "prady",
    [
        _prady_wyl(ik=18.0, ib=18.0, tb=0.1, un=15.0),
        _prady_wyl(ik=22.0, ib=None, tb=None, un=15.0),
        _prady_wyl(ik=22.0, ib=19.5, tb=0.1, un=0.4),
    ],
    ids=["sn_z_tb", "sn_wiersz_bez_ib", "nn"],
)
@pytest.mark.parametrize("aparat", [ROZLACZNIK, ODLACZNIK, UZIEMNIK])
def test_aparat_bez_zdolnosci_wylaczania_ma_nie_dotyczy(aparat: str, prady: PradyPola) -> None:
    """Rozłącznik, odłącznik i uziemnik nie przerywają prądu zwarciowego z definicji normy."""
    pole = _pole_wyl(aparat, prady)
    ocena = _ocena(pole, "wylaczanie")

    assert ocena["status_maszynowy"] == "NIE_DOTYCZY"
    assert ocena["stosowalnosc"]["dotyczy"] is False
    assert ocena["stosowalnosc"]["powod_pl"]
    assert pole["znamiona"]["i_cu_nie_dotyczy"] is True
    assert READINESS_BRAK_ZDOLNOSCI_WYLACZANIA not in pole["kody_gotowosci"]
    assert not any("czas_tb" in k for k in pole["kody_gotowosci"])


@pytest.mark.parametrize(
    ("device_id", "status", "kod_braku"),
    [
        (APARAT_KONFIGURACJI, "BRAK_PODSTAWY", True),
        (KONF_ROZLACZNIK, "NIE_DOTYCZY", False),
        (KONF_SZYNA, "NIE_DOTYCZY", False),
    ],
    ids=["wylacznik_konfiguracji", "rozlacznik_konfiguracji", "tor_szynowy_konfiguracji"],
)
def test_aparat_z_konfiguracji_bez_zdolnosci_w_katalogu_wytrzymalosci(
    device_id: str, status: str, kod_braku: bool
) -> None:
    """Katalog wytrzymałości nie niesie I_cu: wyłącznik → brak podstawy z kodem, nie
    „spełnia"; rozłącznik i tor szynowy → nie dotyczy."""
    widok = _widok(
        prady_pol={"pole/in": _prady_wyl(ik=18.0, ib=18.0, tb=0.1, un=15.0)},
        bay_device_withstand={"P-01": {"device_id": device_id, "t_clearing_s": 0.5}},
    )
    pole = next(p for p in widok["pola"] if p["pole"] == "P-01")
    ocena = _ocena(pole, "wylaczanie")

    assert ocena["status_maszynowy"] == status
    assert (READINESS_BRAK_ZDOLNOSCI_WYLACZANIA in pole["kody_gotowosci"]) is kod_braku
    if kod_braku:
        assert ocena["limit"] is None
        assert ocena["wynik"]["wartosc"]["wartosc"] == 18.0


def test_kazda_pozycja_katalogu_wytrzymalosci_ma_rodzaj_wylaczania() -> None:
    """Lista rodzajów katalogu wytrzymałości jest ZAMKNIĘTA — nowa pozycja bez wpisu dałaby
    brak podstawy zamiast rozstrzygnięcia „nie dotyczy" / „wyłącza"."""
    rodzaje = {pozycja.device_type for pozycja in DEVICE_WITHSTAND_CATALOG}
    assert rodzaje == set(RODZAJ_WYLACZANIA_KATALOGU_WYTRZYMALOSCI)


def test_slad_wylaczania_niesie_tb_i_skladowa_nieokresowa_informacyjnie() -> None:
    pole = _pole_wyl(WYLACZNIK, _prady_wyl(ik=18.0, ib=17.0, tb=0.1, un=15.0, i_dc=3.25))
    opis = _ocena(pole, "wylaczanie")["slad"][0]["opis_pl"]

    assert "t_b = 0.1 s" in opis
    assert "i_DC(t_b) = 3.25 kA" in opis
    assert "informacyjnie" in opis


def test_prady_pol_niosa_wielkosci_wylaczania_z_wiersza_biegu() -> None:
    wiersz = {
        **_wiersz("sn1", "3F", 5.0, 12.5, 5.1),
        "ib_ka": 4.8,
        "i_dc_ka": 1.2,
        "tb_s": 0.1,
        "un_kv": 15.0,
    }
    prady = prady_pol_z_biegu(enm=_enm(), station_ref="stn", wiersze_biegu=[wiersz])

    assert (prady["pole/in"].ib_ka, prady["pole/in"].i_dc_ka) == (4.8, 1.2)
    assert (prady["pole/in"].tb_s, prady["pole/in"].un_kv) == (0.1, 15.0)
    assert prady["pole/in"].to_dict()["ib_ka"] == 4.8


@pytest.mark.parametrize(
    ("target_name", "nazwa", "opis"),
    [
        ("Szyna sn1", "Szyna sn1", "szyna „Szyna sn1”"),
        ("  Szyna sn1  ", "Szyna sn1", "szyna „Szyna sn1”"),
        ("", None, "szyna bez nazwy"),
        ("   ", None, "szyna bez nazwy"),
        (None, None, "szyna bez nazwy"),
    ],
    ids=["nazwa", "nazwa_ze_spacjami", "pusta", "same_spacje", "brak_pola"],
)
def test_nazwa_punktu_z_jednego_predykatu_nazwy(
    target_name: str | None, nazwa: str | None, opis: str
) -> None:
    """Karta NAZWY-JEDNO-ZRODLO na tym module: nazwa punktu zabudowy pola pochodzi
    z `network_model.nazwy` — iloczyn {nazwa, ze spacjami, pusta, same spacje, brak pola}
    × {pole wiersza `punkt_nazwa`, zakres ważności, punkt krytyczny trzech ocen}.
    Identyfikator szyny („sn1”) nigdy nie zastępuje nazwy w zdaniu."""
    wiersz = {**_wiersz("sn1", "3F", 5.0, 12.5, 5.1), "target_name": target_name, "un_kv": 15.0}
    if target_name is None:
        del wiersz["target_name"]
    prady = prady_pol_z_biegu(enm=_enm(), station_ref="stn", wiersze_biegu=[wiersz])
    assert prady["pole/in"].punkt_nazwa == nazwa

    widok = _widok(prady_pol={"pole/in": prady["pole/in"]})
    pole = next(p for p in widok["pola"] if p["prady_pola"]["punkt_ref"] == "sn1")
    for rodzaj in ("dynamiczna", "cieplna", "wylaczanie"):
        ocena = _ocena(pole, rodzaj)
        assert opis in ocena["zakres_waznosci"]["opis_pl"]
        if ocena["wynik"] is not None:
            assert ocena["wynik"]["punkt_krytyczny_pl"].endswith(opis)
        assert "(sn1)" not in ocena["zakres_waznosci"]["opis_pl"]
        # Ślad kroku nazywa punkt tą samą regułą (strażnik `nazwa_bez_identyfikatora`).
        assert any(opis in krok["opis_pl"] for krok in ocena["slad"])
        assert not any("punkt sn1" in krok["opis_pl"] for krok in ocena["slad"])
