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

from typing import Any

import pytest
from application.analyses.wytrzymalosc_aparatury_pol import (
    READINESS_BRAK_PRADU_POLA,
    READINESS_POZYCJA_BEZ_ZNAMION,
    READINESS_STACJA_NIEZNANA,
    ZRODLO_KONFIGURACJA,
    ZRODLO_MODEL,
    PradyPola,
    prady_pol_z_biegu,
    zbuduj_widok_wytrzymalosci_aparatury,
)
from enm.models import (
    Bus,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    Substation,
    SwitchBranch,
)
from enm.rola_pola_sn import NAZWA_ROLI_POLA_SN_PL
from network_model.catalog.audit2_catalogs import ocen_wytrzymalosc_aparatu

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
    for indeks, (pole_ref, catalog_ref) in enumerate(sorted(przypisania.items())):
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
                meta={
                    "field_specs": [
                        {
                            "field_ref": "pole/in",
                            "name": "P-01",
                            "bay_role": "IN",
                            "bus_ref": "sn1",
                        },
                        {
                            "field_ref": "pole/tr",
                            "name": "P-02",
                            "bay_role": "TR",
                            "bus_ref": "sn2",
                        },
                    ]
                },
            )
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
    """I_dyn = 2,5 · Icw (20 kA) = 50 kA ⇒ prąd udarowy 12 kA mieści się — z wyjaśnieniem."""
    pole = _widok()["pola"][0]

    assert pole["znamiona"]["i_th_ka"] == 20.0
    assert pole["znamiona"]["i_th_pochodzenie"] == "producent"
    assert pole["znamiona"]["i_dyn_ka"] == 50.0
    assert pole["znamiona"]["i_dyn_pochodzenie"] == "derived_iec62271"
    assert pole["werdykt"]["i_dyn_ok"] is True
    ocena = _ocena(pole, "dynamiczna")
    assert ocena["status_maszynowy"] == "SPELNIA"
    assert ocena["limit"]["wartosc"] == {"wartosc": 50.0, "jednostka": "kA"}
    # Znamię wyprowadzone z I_th: podstawa limitu to relacja normowa, nie karta producenta.
    assert ocena["limit"]["podstawa"]["rodzaj"] == "NORMA"
    assert "2,5" in ocena["limit"]["podstawa"]["jednostka_redakcyjna"]
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
    assert {o["status_maszynowy"] for o in pole["oceny"]} == {"BRAK_PODSTAWY"}


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
    assert {o["status_maszynowy"] for o in drugie["oceny"]} == {"NIE_OCENIONO"}
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
