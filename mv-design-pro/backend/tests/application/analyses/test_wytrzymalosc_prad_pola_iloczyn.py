"""Wytrzymałość aparatury: prąd i czas PER POLE — iloczyn cech (karta WYTRZYMALOSC-PRAD-POLA).

DEFEKT, KTÓRY TO ZAMYKA. Końcówka wytrzymałości przyjmowała JEDNĄ liczbę ``ik_ka`` /
``i_peak_ka`` / ``i_thermal_ka`` dla całej stacji: pole na innej sekcji dostawało cudzy prąd,
a czas wyłączenia z charakterystyki odwrotnej liczony był przy tym cudzym prądzie. Do tego
brak czasu własnego wyłącznika dawał czas = sam człon nastawczy, a werdykt cieplny powstawał
na czasie krótszym od rzeczywistego (limit wyższy — werdykt optymistyczny).

ILOCZYN CECH (każda kombinacja jest osobnym przypadkiem):
  {pole blisko (5 kA), pole daleko (1 kA)} × {czas własny: z karty, wartość robocza
  (propozycja rejestru), wartość projektanta} × {IEC NI, IEC VI, IEC EI, DT}
  × {kryterium cieplne, dynamiczne}.

KANON V12K-351 (zasada nr 4): brak czasu własnego w karcie nie daje już BRAK_PODSTAWY —
czas wyłączenia składa się z wartością roboczą 0,060 s, status wynika z liczb, a wartość
robocza stoi w ``dane_przyjete`` (kompletność ``NIEPELNY``). I_dyn = 2,5·I_th jest propozycją
rejestru (NORMA), więc kryterium dynamiczne także niesie daną przyjętą.

Złożenie toru jest produkcyjne (``widok_wytrzymalosci_z_biegu`` — to samo, co woła końcówka
HTTP): wiersze biegu → prądy pól → czasy pól z nastaw → rekordy werdyktu. Oczekiwane czasy
liczone są w teście NIEZALEŻNIE wzorem IEC 60255-151 (stałe A, B wpisane tu, nie wzięte
z modułu), oczekiwane limity — wzorem IEC 60865-1 dla urządzeń.

DANE KATALOGU, KTÓRYCH NIE MA (zgłoszone w meldunku karty): katalog APARAT_SN nie niesie dziś
czasu własnego żadnego wyłącznika, a referencyjny katalog przekaźników nie ma pozycji z
charakterystyką EI i ustaloną jednostką zakresów. Cecha „czas własny jest" i cecha „EI"
dopisują te dane do pozycji w teście — rachunek i ścieżka są produkcyjne.
"""

from __future__ import annotations

import dataclasses
from typing import Any

import pytest
from application.analyses import aparaty_pol as modul_aparatow
from application.analyses.protection import ocena_nadpradowa
from application.analyses.protection.catalog.catalog_store import load_device_capability
from application.analyses.wytrzymalosc_aparatury_pol import widok_wytrzymalosci_z_biegu
from enm.models import (
    Bay,
    Bus,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    Measurement,
    ParameterOverride,
    ProtectionAssignment,
    ProtectionSetting,
    Substation,
    SwitchBranch,
)
from network_model.catalog import get_default_mv_catalog

WYLACZNIK = "sw-cb-abb-vd4-12kv-630a"  # I_th 20 kA / 1 s, I_dyn 50 kA (2,5·I_th)
PRZEKAZNIK = "REF-OC-200"
CZAS_WLASNY_S = 0.05
CZAS_ROBOCZY_S = 0.06
CZAS_PROJEKTANTA_S = 0.07
#: Cecha pochodzenia czasu własnego → (czas [s], pochodzenie w rozstrzygnięciu).
CZASY_WLASNE = {
    "karta": (CZAS_WLASNY_S, "KATALOG"),
    "propozycja": (CZAS_ROBOCZY_S, "PROPOZYCJA"),
    "projektant": (CZAS_PROJEKTANTA_S, "PROJEKTANT"),
}
PROG_A = 500.0
TMS = 0.1
ZWLOKA_DT_S = 0.4

#: Pole → (szyna, Ik″ [kA], ip [kA], Ith [kA]) — wiersze zwarcia 3F zapisanego biegu.
POLA: dict[str, tuple[str, float, float, float]] = {
    "pole/blisko": ("sn1", 5.0, 12.5, 5.1),
    "pole/daleko": ("sn2", 1.0, 2.5, 1.02),
}

#: Stałe charakterystyk IEC 60255-151 (A, B) wpisane niezależnie od modułu.
STALE_IEC = {"IEC_SI": (0.14, 0.02), "IEC_VI": (13.5, 1.0), "IEC_EI": (80.0, 2.0)}
KRZYWE = ("IEC_SI", "IEC_VI", "IEC_EI", "DT")


def _nastawa(krzywa: str) -> ProtectionSetting:
    if krzywa == "DT":
        return ProtectionSetting(
            function_type="overcurrent_51",
            threshold_a=PROG_A,
            threshold_unit="A_PIERWOTNY",
            curve_type="DT",
            time_delay_s=ZWLOKA_DT_S,
        )
    return ProtectionSetting(
        function_type="overcurrent_51",
        threshold_a=PROG_A,
        threshold_unit="A_PIERWOTNY",
        curve_type=krzywa,
        time_multiplier=TMS,
    )


def _model(krzywa: str, *, projektant: bool = False) -> EnergyNetworkModel:
    """Stacja z dwoma polami odpływowymi na dwóch sekcjach, każde z własnym zabezpieczeniem."""
    galezie: list[SwitchBranch] = []
    przekladniki: list[Measurement] = []
    przypisania: list[ProtectionAssignment] = []
    pola: list[Bay] = []
    for nr, (pole, (szyna, *_)) in enumerate(sorted(POLA.items()), start=1):
        galezie.append(
            SwitchBranch(
                ref_id=f"aparat/{nr}",
                name=f"Wyłącznik pola {nr}",
                type="breaker",
                from_bus_ref=szyna,
                to_bus_ref=f"zacisk/{nr}",
                catalog_ref=WYLACZNIK,
                catalog_namespace="APARAT_SN",
                parameter_source="OVERRIDE" if projektant else "CATALOG",
                overrides=(
                    [ParameterOverride(key="break_time_s", value=CZAS_PROJEKTANTA_S)]
                    if projektant
                    else []
                ),
                meta={"station_ref": "stn", "bay_ref": pole},
            )
        )
        przekladniki.append(
            Measurement(
                ref_id=f"ct/{nr}",
                name=f"Przekładnik pola {nr}",
                measurement_type="CT",
                bus_ref=szyna,
                rating={"ratio_primary": 600.0, "ratio_secondary": 5.0, "accuracy_class": "5P20"},
            )
        )
        przypisania.append(
            ProtectionAssignment(
                ref_id=f"prot/{nr}",
                name=f"Zabezpieczenie pola {nr}",
                breaker_ref=f"aparat/{nr}",
                ct_ref=f"ct/{nr}",
                catalog_ref=PRZEKAZNIK,
                device_type="overcurrent",
                settings=[_nastawa(krzywa)],
            )
        )
        pola.append(
            Bay(
                ref_id=pole,
                name=f"P-0{nr}",
                bay_role="OUT",
                substation_ref="stn",
                bus_ref=szyna,
                equipment_refs=[f"aparat/{nr}"],
            )
        )
    return EnergyNetworkModel(
        header=ENMHeader(name="t", defaults=ENMDefaults(sn_nominal_kv=15.0)),
        buses=[
            Bus(ref_id="sn1", name="Sekcja 1", voltage_kv=15.0),
            Bus(ref_id="sn2", name="Sekcja 2", voltage_kv=15.0),
        ],
        branches=galezie,
        measurements=przekladniki,
        protection_assignments=przypisania,
        substations=[
            Substation(
                ref_id="stn",
                name="Stacja Sady",
                station_type="mv_lv",
                bus_refs=["sn1", "sn2"],
            )
        ],
        # Karta W5-B: pola stacji są rekordami `bays` (jedyny nośnik pól; dawny słownik pól
        # w `meta` stacji skasowany).
        bays=pola,
    )


def _wiersze_biegu() -> list[dict[str, Any]]:
    wiersze = [
        {
            "target_id": szyna,
            "element_id": szyna,
            "target_name": f"Szyna {szyna}",
            "fault_type": "3F",
            "ikss_ka": ik,
            "ip_ka": ip,
            "ith_ka": ith,
        }
        for szyna, ik, ip, ith in POLA.values()
    ]
    # Wiersz zwarcia 1F z większym prądem — NIE wchodzi do oceny wytrzymałości.
    wiersze.append({**wiersze[0], "fault_type": "1F", "ikss_ka": 50.0, "ip_ka": 99.0})
    return wiersze


class _KatalogZCzasemWlasnym:
    def __init__(self) -> None:
        self._katalog = get_default_mv_catalog()

    def get_mv_apparatus_type(self, catalog_ref: str) -> Any:
        pozycja = self._katalog.get_mv_apparatus_type(catalog_ref)
        if pozycja is None or catalog_ref != WYLACZNIK:
            return pozycja
        return dataclasses.replace(pozycja, break_time_s=CZAS_WLASNY_S)


@pytest.fixture(autouse=True)
def przekaznik_z_krzywa_ei(monkeypatch: pytest.MonkeyPatch) -> None:
    """Referencyjny profil przekaźnika z dopisaną charakterystyką EI (patrz nagłówek)."""
    bazowy = load_device_capability(PRZEKAZNIK)
    assert bazowy is not None

    def _zdolnosc(device_id: str) -> Any:
        zdolnosc = load_device_capability(device_id)
        if device_id != PRZEKAZNIK or zdolnosc is None:
            return zdolnosc
        return dataclasses.replace(
            zdolnosc, curves_supported=(*zdolnosc.curves_supported, "IEC_EI")
        )

    monkeypatch.setattr(ocena_nadpradowa, "load_device_capability", _zdolnosc)


def _czlon_oczekiwany(krzywa: str, prad_a: float) -> float:
    if krzywa == "DT":
        return ZWLOKA_DT_S
    a, b = STALE_IEC[krzywa]
    return TMS * a / ((prad_a / PROG_A) ** b - 1.0)


def _ocena(pole: dict[str, Any], rodzaj: str) -> dict[str, Any]:
    return next(o for o in pole["oceny"] if o["kryterium_id"].endswith(f".{rodzaj}"))


@pytest.mark.parametrize("rodzaj", ["cieplna", "dynamiczna"])
@pytest.mark.parametrize("krzywa", KRZYWE)
@pytest.mark.parametrize("zrodlo_czasu", sorted(CZASY_WLASNE))
@pytest.mark.parametrize("pole_ref", sorted(POLA))
def test_iloczyn_pole_czas_wlasny_krzywa_kryterium(
    monkeypatch: pytest.MonkeyPatch,
    pole_ref: str,
    zrodlo_czasu: str,
    krzywa: str,
    rodzaj: str,
) -> None:
    if zrodlo_czasu == "karta":
        monkeypatch.setattr(modul_aparatow, "get_default_mv_catalog", _KatalogZCzasemWlasnym)
    widok = widok_wytrzymalosci_z_biegu(
        enm=_model(krzywa, projektant=zrodlo_czasu == "projektant"),
        station_ref="stn",
        wiersze_biegu=_wiersze_biegu(),
        run_id="bieg-iloczynu",
    )
    pole = next(p for p in widok["pola"] if p["pole_ref"] == pole_ref)
    _, ik_ka, ip_ka, ith_ka = POLA[pole_ref]
    czas = pole["czas_wylaczenia"]
    ocena = _ocena(pole, rodzaj)
    czas_wlasny_s, pochodzenie = CZASY_WLASNE[zrodlo_czasu]

    # Prąd TEGO pola — także prąd, przy którym liczono charakterystykę.
    assert pole["prady_pola"]["ik_ka"] == ik_ka
    assert czas["prad_zwarciowy_a"] == pytest.approx(ik_ka * 1000.0)
    czlon = _czlon_oczekiwany(krzywa, ik_ka * 1000.0)
    # Rdzeń IEC 60255 zaokrągla czas do 1 µs — tolerancja pół mikrosekundy.
    assert czas["czlon_nastawczy_s"] == pytest.approx(czlon, abs=5e-7)
    # Brak czasu własnego w karcie nie blokuje: żadnych kodów, czas zawsze złożony.
    assert pole["kody_gotowosci"] == []
    assert czas["czas_wlasny"]["pochodzenie"] == pochodzenie
    dane = ocena["dowod"]["status_danych"]["dane_przyjete"]
    # Wartość robocza nigdy nie udaje danej producenta.
    assert all(d["jakosc"] == "ESTIMATED" for d in dane)

    if rodzaj == "dynamiczna":
        # Kryterium dynamiczne nie zależy od czasu: i_p pola ≤ I_dyn 50 kA (propozycja normowa).
        assert ocena["wynik"]["wartosc"] == {"wartosc": ip_ka, "jednostka": "kA"}
        assert ocena["limit"]["wartosc"] == {"wartosc": 50.0, "jednostka": "kA"}
        assert ocena["limit"]["podstawa"]["rodzaj"] == "NORMA"
        assert ocena["status_maszynowy"] == "SPELNIA"
        assert ocena["kompletnosc_dowodu"] == "NIEPELNY"
        assert [d["wartosc"] for d in dane] == [{"wartosc": 50.0, "jednostka": "kA"}]
        return

    assert ocena["wynik"]["wartosc"] == {"wartosc": ith_ka, "jednostka": "kA"}
    t_k = czlon + czas_wlasny_s
    assert czas["t_clearing_s"] == pytest.approx(t_k, abs=1e-6)
    t_k = czas["t_clearing_s"]
    limit_ka = 20.0 if t_k <= 1.0 else 20.0 * (1.0 / t_k) ** 0.5
    assert ocena["limit"]["wartosc"]["wartosc"] == pytest.approx(limit_ka, rel=1e-9)
    assert ocena["status_maszynowy"] == "SPELNIA"
    assert ocena["margines"] is not None
    # I_th 20 kA i t_k 1 s są danymi karty producenta — podstawa limitu z karty; dana
    # przyjęta to wyłącznie czas własny, gdy jest wartością roboczą.
    assert ocena["limit"]["podstawa"]["rodzaj"] == "KATALOG_PRODUCENTA"
    if zrodlo_czasu == "karta":
        assert dane == []
        assert ocena["dowod"]["status_danych"]["stan"] == "ZWALIDOWANE"
        # Kompletność zależy też od poziomu dowodowego zdolności — dana karty nie dokłada
        # żadnego powodu niepełności.
        assert not any("Dana przyjęta" in p for p in ocena["powody_niepelnosci"])
    else:
        assert [d["wartosc"] for d in dane] == [{"wartosc": czas_wlasny_s, "jednostka": "s"}]
        assert ocena["dowod"]["status_danych"]["stan"] == "UNVALIDATED_INPUT"
        assert ocena["kompletnosc_dowodu"] == "NIEPELNY"
        assert any("Dana przyjęta" in p for p in ocena["powody_niepelnosci"])


def test_sonda_nastawy_ni_na_dwoch_polach_z_roznym_pradem() -> None:
    """Sonda z karty: IEC NI, I_s 500 A, TMS 0,10 — przy 1000 A 1,002903 s, przy 5000 A
    0,297060 s; dwa pola tej samej stacji dostają DWA różne czasy z biegu."""
    widok = widok_wytrzymalosci_z_biegu(
        enm=_model("IEC_SI"),
        station_ref="stn",
        wiersze_biegu=_wiersze_biegu(),
        run_id="bieg-sondy",
    )
    czlony = {p["pole_ref"]: p["czas_wylaczenia"]["czlon_nastawczy_s"] for p in widok["pola"]}

    assert czlony["pole/daleko"] == pytest.approx(1.002903, abs=5e-7)
    assert czlony["pole/blisko"] == pytest.approx(0.297060, abs=5e-7)


def test_zlozenie_toru_jest_deterministyczne() -> None:
    def _bieg() -> dict[str, Any]:
        return widok_wytrzymalosci_z_biegu(
            enm=_model("IEC_VI"),
            station_ref="stn",
            wiersze_biegu=_wiersze_biegu(),
            run_id="bieg-determinizmu",
        )

    assert _bieg() == _bieg()
