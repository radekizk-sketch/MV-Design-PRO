"""Obie strony KAZDEJ twardej reguly katalogu (karta KATALOG-NIEZMIENNIKI).

DLACZEGO OBIE STRONY. Bramka sprawdzana wylacznie od strony „odrzuca zle dane"
jest nierozroznialna od bramki, ktora odrzuca WSZYSTKO — a wlasnie tak wyglada
regula za mocna, zanim zrani pierwszego uzytkownika. Dlatego kazdy kod twardy ma
tu PARE: rekord jawnie niepoprawny MUSI byc odrzucony z WLASCIWYM kodem, a rekord
nietypowy, lecz legalny, MUSI przejsc.

REKORDY SYNTETYCZNE, NIE KATALOGOWE. Sprawdzamy REGULE, nie dane — pozycja z
zywego katalogu zwiazalaby test z konkretna karta producenta i czerwienilby go
kazdy przyszly import, ktory te karte poprawia.

PARYTET Z REJESTREM. `test_kazdy_kod_twardy_ma_pare_przypadkow` porownuje zbior
kodow pokrytych tutaj ze zbiorem kodow twardych rejestru. Nowa bramka bez pary
testow = czerwony, i to jest jedyny mechanizm, ktory nie pozwala rejestrowi
rosnac szybciej niz pokrycie.
"""

from __future__ import annotations

from collections.abc import Callable

import pytest
from network_model.catalog.audit2_catalogs import (
    DeviceWithstandItem,
    HvFusePasmoTcc,
    PfCurveItem,
)
from network_model.catalog.lv_ampacity_iec60364_5_52 import WpisNormyNN
from network_model.catalog.lv_disconnection_times_iec60364_4_41 import WpisCzasuWylaczenia
from network_model.catalog.niezmienniki_katalogu import (
    KODY_TWARDE,
    REGULY_KATALOGU,
    KlasaNiezmiennika,
    OdmowaKatalogu,
)
from network_model.catalog.types import (
    BESSBatteryType,
    ConverterKind,
    ConverterType,
    LVFuseLinkType,
    _harmonic_spectrum_from_raw,
    _normalize_catalog_status,
    _normalize_verification_status,
    _validate_float_range,
    _validate_katalogowy_k_sc,
    _validate_pq_curve,
)

# ---------------------------------------------------------------------------
# Wytworniki rekordow syntetycznych
# ---------------------------------------------------------------------------


def _konwerter(**nadpisania: object) -> ConverterType:
    """Minimalny, POPRAWNY przeksztaltnik; pojedyncze pole psujemy w przypadku testu."""
    parametry: dict[str, object] = {
        "id": "syntetyczny-konwerter",
        "name": "Przeksztaltnik syntetyczny",
        "kind": ConverterKind.PV,
        "un_kv": 0.4,
        "sn_mva": 1.0,
        "pmax_mw": 1.0,
    }
    parametry.update(nadpisania)
    return ConverterType(**parametry)  # type: ignore[arg-type]


def _bateria(**nadpisania: object) -> BESSBatteryType:
    parametry: dict[str, object] = {
        "id": "syntetyczna-bateria",
        "name": "Pakiet syntetyczny",
        "chemistry": "LFP",
        "capacity_kwh": 500.0,
        "nominal_voltage_dc_v": 800.0,
        "c_rate": 0.5,
    }
    parametry.update(nadpisania)
    return BESSBatteryType(**parametry)  # type: ignore[arg-type]


def _wkladka(**nadpisania: object) -> LVFuseLinkType:
    parametry: dict[str, object] = {
        "id": "syntetyczna-wkladka",
        "name": "Wkladka syntetyczna",
        "in_a": 160.0,
        "fuse_class": "gG",
        "size": "NH1",
        "breaking_capacity_ka": 120.0,
    }
    parametry.update(nadpisania)
    return LVFuseLinkType(**parametry)  # type: ignore[arg-type]


def _aparat_sn(**nadpisania: object) -> DeviceWithstandItem:
    parametry: dict[str, object] = {
        "id": "syntetyczny-aparat-sn",
        "catalog_namespace": "APARAT_SN",
        "catalog_version": "v1",
        "label_pl": "Aparat syntetyczny",
        "device_type": "WYLACZNIK",
        "nominal_voltage_kv": 24.0,
        "nominal_current_a": 630.0,
        "i_th_1s_ka": 16.0,
        "i_th_duration_s": 1.0,
    }
    parametry.update(nadpisania)
    return DeviceWithstandItem(**parametry)  # type: ignore[arg-type]


def _krzywa_pf(**nadpisania: object) -> PfCurveItem:
    parametry: dict[str, object] = {
        "id": "syntetyczna-krzywa-pf",
        "catalog_namespace": "KRZYWA_PF",
        "catalog_version": "v1",
        "label_pl": "Krzywa syntetyczna",
        "f_ref_hz": 50.0,
        "droop_percent": 5.0,
        "f_min_hz": 47.5,
        "f_max_hz": 51.5,
        "deadband_hz": 0.2,
    }
    parametry.update(nadpisania)
    return PfCurveItem(**parametry)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Tabela przypadkow: kod -> (rekord NIEPOPRAWNY, rekord NIETYPOWY ale LEGALNY)
# ---------------------------------------------------------------------------

PRZYPADKI: dict[str, tuple[Callable[[], object], Callable[[], object]]] = {
    # --- metadane katalogu -------------------------------------------------
    "KAT-T-001": (
        lambda: _normalize_verification_status("ZWERYFIKOWANY_CZESCIOWO"),
        # Nietypowe, lecz legalne: brak pola (domyslka) i wartosc pisana malymi literami.
        lambda: (
            _normalize_verification_status(None),
            _normalize_verification_status("  referencyjny  "),
        ),
    ),
    "KAT-T-002": (
        lambda: _normalize_catalog_status("PRODUKCYJNY"),
        lambda: (_normalize_catalog_status(""), _normalize_catalog_status("testowy")),
    ),
    # --- przeksztaltniki ---------------------------------------------------
    "KAT-T-003": (
        lambda: _validate_katalogowy_k_sc(float("nan"), kontekst="test"),
        # Nietypowe, lecz legalne: brak danej (None) i udzial ponizej jednosci
        # (przeksztaltnik ograniczajacy prad zwarciowy ponizej znamionowego).
        lambda: (
            _validate_katalogowy_k_sc(None, kontekst="test"),
            _validate_katalogowy_k_sc(0.25, kontekst="test"),
        ),
    ),
    "KAT-T-004": (
        lambda: _validate_pq_curve(()),
        # Krzywa jednopunktowa jest nietypowa, ale poprawna.
        lambda: _validate_pq_curve(((0.0, -0.3, 0.3),)),
    ),
    "KAT-T-005": (
        lambda: _validate_pq_curve(((0.0, -0.3),)),  # type: ignore[arg-type]
        lambda: _validate_pq_curve(((0.0, -0.3, 0.3), (1.0, -0.5, 0.5))),
    ),
    "KAT-T-006": (
        lambda: _validate_pq_curve(((-0.1, -0.3, 0.3),)),
        # P = 0 na pierwszym punkcie jest legalne (praca biegiem jalowym z Q).
        lambda: _validate_pq_curve(((0.0, -0.3, 0.3),)),
    ),
    "KAT-T-007": (
        lambda: _validate_pq_curve(((1.0, 0.5, -0.5),)),
        # q_min == q_max (brak zdolnosci regulacyjnej w tym punkcie) jest legalne.
        lambda: _validate_pq_curve(((1.0, 0.0, 0.0),)),
    ),
    "KAT-T-008": (
        lambda: _validate_pq_curve(((1.0, -0.3, 0.3), (0.5, -0.3, 0.3))),
        lambda: _validate_pq_curve(((0.0, -0.3, 0.3), (0.001, -0.3, 0.3))),
    ),
    "KAT-T-009": (
        lambda: _harmonic_spectrum_from_raw([(5, 3.0)]),
        lambda: (_harmonic_spectrum_from_raw(None), _harmonic_spectrum_from_raw({"5": 3.0})),
    ),
    "KAT-T-010": (
        lambda: _validate_float_range("ir_range", (1.0, 0.4)),
        # min == max (aparat o jednej nastawie) jest legalne.
        lambda: (_validate_float_range("ir_range", None), _validate_float_range("ii_range", (2.0, 2.0))),
    ),
    "KAT-T-011": (
        lambda: _konwerter(flicker_c=0.0),
        # Wspolczynnik migotania ponizej jednosci i powyzej dziesieciu — oba legalne.
        lambda: (_konwerter(flicker_c=0.1), _konwerter(flicker_c=25.0)),
    ),
    "KAT-T-012": (
        lambda: _konwerter(droop_p_f_percent=0.0),
        lambda: (_konwerter(droop_p_f_percent=0.5), _konwerter(droop_p_f_percent=40.0)),
    ),
    "KAT-T-013": (
        lambda: _konwerter(droop_q_u_percent=-2.0),
        lambda: (_konwerter(droop_q_u_percent=0.5), _konwerter(droop_q_u_percent=40.0)),
    ),
    "KAT-T-014": (
        lambda: _konwerter(harmonic_spectrum_percent={}),
        lambda: _konwerter(harmonic_spectrum_percent={5: 0.0}),
    ),
    "KAT-T-015": (
        lambda: _konwerter(harmonic_spectrum_percent={1: 1.0}),
        # Skraje zakresu (2 i 50) MUSZA przejsc — inaczej granica jest o jeden za waska.
        lambda: _konwerter(harmonic_spectrum_percent={2: 1.0, 50: 0.1}),
    ),
    "KAT-T-016": (
        lambda: _konwerter(harmonic_spectrum_percent={5: 100.1}),
        # Skraje 0 % i 100 % sa legalne.
        lambda: _konwerter(harmonic_spectrum_percent={5: 0.0, 7: 100.0}),
    ),
    "KAT-T-017": (
        lambda: _konwerter(p_installed_mw=1.0, pn_ac_mw=2.0).validate_power_hierarchy(),
        # Karta wypelniona CZESCIOWO (luka w srodku hierarchii) nie moze odpasc.
        lambda: (
            _konwerter(p_installed_mw=2.0, p_achievable_mw=2.0).validate_power_hierarchy(),
            _konwerter().validate_power_hierarchy(),
        ),
    ),
    # --- bateria BESS ------------------------------------------------------
    "KAT-T-018": (
        lambda: _bateria(capacity_kwh=0.0),
        lambda: _bateria(capacity_kwh=0.001),
    ),
    "KAT-T-019": (
        lambda: _bateria(nominal_voltage_dc_v=-800.0),
        lambda: _bateria(nominal_voltage_dc_v=1500.0),
    ),
    "KAT-T-020": (
        lambda: _bateria(c_rate=0.0),
        # C-rate 4 C (ogniwo mocy) jest nietypowy dla magazynu sieciowego, ale legalny.
        lambda: (_bateria(c_rate=0.05), _bateria(c_rate=4.0)),
    ),
    "KAT-T-021": (
        lambda: BESSBatteryType.from_dict(
            {
                "id": "x",
                "name": "x",
                "chemistry": "NaS",
                "capacity_kwh": 1.0,
                "nominal_voltage_dc_v": 1.0,
                "c_rate": 1.0,
            }
        ),
        lambda: BESSBatteryType.from_dict(
            {
                "id": "x",
                "name": "x",
                "chemistry": "lto",
                "capacity_kwh": 1.0,
                "nominal_voltage_dc_v": 1.0,
                "c_rate": 1.0,
            }
        ),
    ),
    # --- wkladka topikowa nN ----------------------------------------------
    "KAT-T-022": (
        lambda: _wkladka(breaking_capacity_ka=None),
        lambda: (_wkladka(breaking_capacity_ka=0.1), _wkladka(breaking_capacity_ka=120.0)),
    ),
    # --- audit2: pasmo TCC -------------------------------------------------
    "KAT-T-023": (
        lambda: HvFusePasmoTcc(zrodlo_url="katalog-producenta.pdf", punkty=((100.0, 1.0),)),
        lambda: HvFusePasmoTcc(zrodlo_url="http://przyklad.test/tabela", punkty=((100.0, 1.0),)),
    ),
    "KAT-T-024": (
        lambda: HvFusePasmoTcc(zrodlo_url="https://przyklad.test/tabela", punkty=()),
        # Pasmo jednopunktowe jest nietypowe, ale jest pasmem.
        lambda: HvFusePasmoTcc(zrodlo_url="https://przyklad.test/tabela", punkty=((100.0, 1.0),)),
    ),
    # --- audit2: znamiona zwarciowe aparatu SN ----------------------------
    "KAT-T-025": (
        lambda: _aparat_sn(i_th_1s_ka=17.0),
        # Skraje szeregu (6,3 kA i 63 kA) MUSZA przejsc.
        lambda: (_aparat_sn(i_th_1s_ka=6.3), _aparat_sn(i_th_1s_ka=63.0)),
    ),
    "KAT-T-026": (
        lambda: _aparat_sn(i_th_duration_s=1.5),
        lambda: (_aparat_sn(i_th_duration_s=0.5), _aparat_sn(i_th_duration_s=3.0)),
    ),
    # --- audit2: profil LFSM ----------------------------------------------
    "KAT-T-027": (
        lambda: _krzywa_pf(droop_percent=15.0),
        lambda: (_krzywa_pf(droop_percent=2.0), _krzywa_pf(droop_percent=12.0)),
    ),
    "KAT-T-028": (
        lambda: _krzywa_pf(deadband_hz=0.6),
        lambda: (_krzywa_pf(deadband_hz=0.2), _krzywa_pf(deadband_hz=0.5)),
    ),
    "KAT-T-029": (
        lambda: _krzywa_pf(f_min_hz=49.0, f_max_hz=51.0),
        lambda: _krzywa_pf(f_min_hz=47.5, f_max_hz=51.5),
    ),
    # --- tablice nN --------------------------------------------------------
    "KAT-T-030": (
        lambda: WpisCzasuWylaczenia(czas_s=6.0, podstawa="IEC 60364-4-41 tab. 41.1"),
        # Skraje: czas bliski zeru i dokladnie 5 s (obwod rozdzielczy).
        lambda: (
            WpisCzasuWylaczenia(czas_s=0.1, podstawa="IEC 60364-4-41 tab. 41.1"),
            WpisCzasuWylaczenia(czas_s=5.0, podstawa="IEC 60364-4-41 tab. 41.1"),
        ),
    ),
    "KAT-T-031": (
        lambda: WpisCzasuWylaczenia(czas_s=0.4, podstawa="   "),
        lambda: WpisCzasuWylaczenia(czas_s=0.4, podstawa="IEC 60364-4-41 tab. 41.1"),
    ),
    "KAT-T-032": (
        lambda: WpisNormyNN(wartosc=1.31, podstawa="IEC 60364-5-52 tab. B.52.14"),
        # Skraj 1,3 (wspolczynnik temperatury gruntu) MUSI przejsc.
        lambda: (
            WpisNormyNN(wartosc=1.3, podstawa="IEC 60364-5-52 tab. B.52.14"),
            WpisNormyNN(wartosc=0.41, podstawa="IEC 60364-5-52 tab. B.52.17"),
        ),
    ),
    "KAT-T-033": (
        lambda: WpisNormyNN(wartosc=0.8, podstawa=""),
        lambda: WpisNormyNN(wartosc=0.8, podstawa="IEC 60364-5-52 tab. B.52.14"),
    ),
}


def test_kazdy_kod_twardy_ma_pare_przypadkow() -> None:
    """Parytet zbiorow: rejestr nie moze urosnac szybciej niz pokrycie testami."""
    assert set(PRZYPADKI) == set(KODY_TWARDE), {
        "bez_testow": sorted(set(KODY_TWARDE) - set(PRZYPADKI)),
        "testy_bez_reguly": sorted(set(PRZYPADKI) - set(KODY_TWARDE)),
    }


@pytest.mark.parametrize("kod", sorted(PRZYPADKI))
def test_rekord_niepoprawny_jest_odrzucony_z_wlasciwym_kodem(kod: str) -> None:
    niepoprawny, _ = PRZYPADKI[kod]
    with pytest.raises(OdmowaKatalogu) as wyjatek:
        niepoprawny()
    assert wyjatek.value.kod == kod, (
        f"odmowa przyszla z kodu {wyjatek.value.kod}, oczekiwano {kod}: {wyjatek.value}"
    )
    assert kod in str(wyjatek.value)


@pytest.mark.parametrize("kod", sorted(PRZYPADKI))
def test_rekord_nietypowy_lecz_legalny_przechodzi(kod: str) -> None:
    """Druga strona bramki — bez niej regula za mocna wygladalaby na poprawna."""
    _, legalny = PRZYPADKI[kod]
    legalny()


def test_odmowa_jest_wciaz_bledem_wartosci() -> None:
    """Konsumenci (importery, `from_dict`) lapia `ValueError` — kontrakt bez zmian."""
    niepoprawny, _ = PRZYPADKI["KAT-T-018"]
    with pytest.raises(ValueError):
        niepoprawny()


@pytest.mark.parametrize("kod", sorted(KODY_TWARDE))
def test_kazda_twarda_regula_ma_klase_i_podstawe(kod: str) -> None:
    regula = REGULY_KATALOGU[kod]
    assert regula.klasa is not KlasaNiezmiennika.WIARYGODNOSC
    assert regula.podstawa.strip()
    assert regula.uzasadnienie.strip()
