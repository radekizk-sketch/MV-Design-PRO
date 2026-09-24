"""Sekcje modelu urządzenia typu katalogowego — WIDOK, nie kontener (karta AB-H0 §0.7.4, §0.15).

Płaskie pola typów katalogu zostają na miejscu (zero churnu materializacji i odcisków);
ten moduł przypisuje KAŻDE pole typu urządzenia do jednej sekcji modelu (albo do
``identyfikacja`` — metadane), definiuje składniki sekcji per klasa typu i buduje wejście
JEDNEJ funkcji statusu ``dziedziny.sekcje.status_sekcji``. Status sekcji jest
WYPROWADZANY przy każdym zapytaniu, nigdy przechowywany w rekordzie.

DWA ADAPTERY, JEDNA REGUŁA. ``sekcje_typu`` (typ katalogowy) i
``application.model_urzadzenia.sekcje_elementu.sekcje_elementu`` (element ENM) budują
wejście przez TĘ SAMĄ funkcję ``wejscia_sekcji`` z TYCH SAMYCH definicji składników,
TEJ SAMEJ reguły jakości pól (``solver_input.provenance.resolve_card_field_quality_map``)
i TEJ SAMEJ reguły dowodu certyfikatu (``dowod_certyfikatu_ptpiree``) — różni się
wyłącznie dostęp do danych (``DaneUrzadzenia``). Test parytetu: element
zmaterializowany z typu X bez nadpisań ma identyczne statusy sekcji jak typ X.

KARTY WIDMOWE. Sekcje ``harmonic``/``supraharmonic`` = modele kart widmowych wskazujących
typ (``urzadzenie_ref == id``) + parametry modelu Z_conv(f) z pól karty przekształtnika.
Dowody kart (raport badań, pomiar, certyfikat modelu) wchodzą do wszystkich sekcji
(sekcja bierze dowód wyłącznie, gdy pokrywa jej dziedzinę).

CERTYFIKAT ZGODNOŚCI ≠ CERTYFIKOWANY MODEL. Pozycja wykazu PTPiREE (``ptpiree_status ==
POWIAZANY``) daje dowód ``CERTYFIKAT_ZGODNOSCI`` — sekcja ``certification`` może być
``CERTIFIED``, ale żadna sekcja fizyczna nie rośnie od certyfikatu urządzenia.
"""

from __future__ import annotations

import dataclasses
from collections import Counter
from collections.abc import Mapping
from dataclasses import dataclass, field
from types import MappingProxyType, SimpleNamespace
from typing import Any, Literal

from dziedziny.karta_widmowa import KartaWidmowa
from dziedziny.sekcje import (
    SEKCJE,
    DowodModelu,
    OcenaSekcji,
    PoleSekcji,
    RodzajDanychSkladnika,
    SkladnikSekcji,
    StatusWeryfikacjiRekordu,
    WejscieStatusuSekcji,
    status_sekcji,
)
from dziedziny.widmo import ModelZrodlaWidmowego
from network_model.catalog.der_dynamic import get_profile, list_all_profile_ids
from network_model.catalog.repository import CatalogRepository
from pydantic import BaseModel, ConfigDict
from solver_input.provenance import resolve_card_field_quality_map
from werdykt.kontrakt import PodstawaWymagania
from werdykt.proweniencja import FieldQuality

#: Miejsce pola w widoku sekcji: sekcja modelu albo metadane rekordu.
MiejscePola = Literal[
    "identyfikacja",
    "fundamental",
    "short_circuit",
    "dynamic",
    "harmonic",
    "supraharmonic",
    "certification",
    "measurement",
    "validation",
]

# ---------------------------------------------------------------------------
# Grupy pól (nazwy pól klas typów katalogu)
# ---------------------------------------------------------------------------

_META: tuple[str, ...] = (
    "id",
    "name",
    "manufacturer",
    "verification_status",
    "source_reference",
    "catalog_status",
    "contract_version",
    "verification_note",
)
_PTPIREE: tuple[str, ...] = (
    "ptpiree_status",
    "ptpiree_certificate_ref",
    "ptpiree_document_number",
    "ptpiree_document_acceptance_date",
    "ptpiree_wos_version",
    "ptpiree_wipwc_version",
    "ptpiree_ppm_scope",
    "ptpiree_source_url",
    "ptpiree_publication_date",
    "ptpiree_note",
    "ptpiree_certificate_condition",
)
_REGULACJA: tuple[str, ...] = (
    "control_mode",
    "cosphi",
    "cosphi_p_points",
    "qu_deadband_low_pu",
    "qu_deadband_high_pu",
    "qu_slope_pu_per_pu",
    "qu_q_min_mvar",
    "qu_q_max_mvar",
    "lfsm_droop_pct",
    "lfsm_deadband_hz",
    "f0_hz",
)
_FLAGI_REGULACJI: tuple[str, ...] = ("q_absorbing", "lfsm_allow_increase")
_HIERARCHIA: tuple[str, ...] = ("p_installed_mw", "pn_ac_mw", "p_connection_mw", "p_achievable_mw")
_MODEL_ZWARCIOWY: tuple[str, ...] = ("sc_model", "sc_pq_split", "sc_transient_k", "sc_sustained_k")
_Z_CONV: tuple[str, ...] = (
    "current_loop_bandwidth_hz",
    "voltage_loop_bandwidth_hz",
    "pll_bandwidth_hz",
    "control_delay_ms",
    "filter_l_pu",
    "filter_r_pu",
)
_STATYZMY: tuple[str, ...] = ("droop_p_f_percent", "droop_q_u_percent")
_TERMIKA: tuple[str, ...] = (
    "max_temperature_c",
    "short_circuit_temperature_c",
    "ith_1s_a",
    "jth_1s_a_per_mm2",
)


def _mapa(**sekcje: tuple[str, ...]) -> Mapping[str, MiejscePola]:
    wynik: dict[str, MiejscePola] = {}
    for sekcja, pola in sekcje.items():
        for pole in pola:
            if pole in wynik:
                raise ValueError(f"Pole {pole!r} przypisane do dwóch miejsc widoku sekcji.")
            wynik[pole] = sekcja  # type: ignore[assignment]
    return MappingProxyType(wynik)


def _mapa_przeksztaltnika(
    identyfikacja: tuple[str, ...], znamionowe: tuple[str, ...], flagi: tuple[str, ...]
) -> Mapping[str, MiejscePola]:
    return _mapa(
        identyfikacja=(*_META, *identyfikacja, "grid_code", "card_field_status"),
        fundamental=(*znamionowe, *_REGULACJA, *flagi, *_HIERARCHIA, "pq_curve", "flicker_c"),
        short_circuit=("k_sc", *_MODEL_ZWARCIOWY),
        dynamic=("dynamic_profile_id", *_STATYZMY),
        harmonic=_Z_CONV,
        certification=_PTPIREE,
    )


#: KAŻDE pole klasy typu urządzenia → sekcja modelu albo ``identyfikacja`` (metadane).
#: Mapa per klasa (nie płaska): ta sama nazwa pola znaczy co innego w różnych klasach
#: (np. ``model`` — oznaczenie wyrobu w ``ConverterType``, model odbioru w ``LoadType``).
#: Test: zbiór pól dataclass = zbiór kluczy mapy (nowe pole bez przypisania = czerwień).
POLA_SEKCJI: Mapping[str, Mapping[str, MiejscePola]] = MappingProxyType(
    {
        "ConverterType": _mapa_przeksztaltnika(
            ("kind", "model"),
            (
                "un_kv",
                "sn_mva",
                "pmax_mw",
                "qmin_mvar",
                "qmax_mvar",
                "cosphi_min",
                "cosphi_max",
                "e_kwh",
            ),
            _FLAGI_REGULACJI,
        ),
        "PVInverterType": _mapa_przeksztaltnika(
            (), ("un_kv", "s_n_kva", "p_max_kw", "cos_phi_min", "cos_phi_max"), ()
        ),
        "BESSInverterType": _mapa(
            identyfikacja=(*_META, "card_field_status"),
            fundamental=(
                "un_kv",
                "s_n_kva",
                "p_charge_kw",
                "p_discharge_kw",
                "e_kwh",
                *(p for p in _REGULACJA if p != "control_mode"),
                *_HIERARCHIA,
                "pq_curve",
                "flicker_c",
            ),
            short_circuit=("k_sc", *_MODEL_ZWARCIOWY),
            dynamic=("dynamic_profile_id", *_STATYZMY),
            harmonic=_Z_CONV,
            certification=_PTPIREE,
        ),
        "SynchronousGeneratorType": _mapa(
            identyfikacja=_META,
            fundamental=("rated_mva", "rated_kv", "q_min_mvar", "q_max_mvar"),
        ),
        "SourceSystemType": _mapa(
            identyfikacja=(
                *_META,
                "operator_name",
                "series",
                "catalog_number",
                "data_source",
                "supply_role",
            ),
            fundamental=("voltage_rating_kv",),
            short_circuit=(
                "sk3_mva",
                "ik3_ka",
                "rx_ratio",
                "sk3_min_mva",
                "ik3_min_ka",
                "rx_ratio_min",
                "short_circuit_model",
            ),
        ),
        "ShuntCapacitorType": _mapa(
            identyfikacja=_META, fundamental=("rated_mvar", "rated_kv", "loss_kw")
        ),
        "LoadType": _mapa(
            identyfikacja=(*_META, "profile_id"),
            fundamental=(
                "model",
                "p_kw",
                "q_kvar",
                "cos_phi",
                "cos_phi_mode",
                "a_p",
                "b_p",
                "c_p",
                "a_q",
                "b_q",
                "c_q",
                "v0_pu",
                "k_pf",
                "k_qf",
                "f0_hz",
            ),
        ),
        "TransformerType": _mapa(
            identyfikacja=(*_META, "cooling_class"),
            fundamental=(
                "rated_power_mva",
                "voltage_hv_kv",
                "voltage_lv_kv",
                "uk_percent",
                "pk_kw",
                "i0_percent",
                "p0_kw",
                "vector_group",
                "tap_min",
                "tap_max",
                "tap_step_percent",
            ),
        ),
        "CableType": _mapa(
            identyfikacja=(
                *_META,
                "standard",
                "insulation_type",
                "conductor_material",
                "base_type_id",
                "trade_name",
                "number_of_cores",
                "return_conductor_material",
            ),
            fundamental=(
                "r_ohm_per_km",
                "x_ohm_per_km",
                "c_nf_per_km",
                "rated_current_a",
                "voltage_rating_kv",
                "cross_section_mm2",
            ),
            short_circuit=(
                *_TERMIKA,
                "r0_ohm_per_km",
                "x0_ohm_per_km",
                "b0_siemens_per_km",
                "z0_reference_bonding",
                "return_conductor_cross_section_mm2",
                "return_conductor_r_ohm_per_km_20c",
                "return_conductor_jth_1s_a_per_mm2",
                "return_conductor_ith_1s_a",
            ),
        ),
        "LineType": _mapa(
            identyfikacja=(
                *_META,
                "standard",
                "conductor_material",
                "base_type_id",
                "trade_name",
                "thermal_source_reference",
            ),
            fundamental=(
                "r_ohm_per_km",
                "x_ohm_per_km",
                "b_us_per_km",
                "rated_current_a",
                "voltage_rating_kv",
                "cross_section_mm2",
            ),
            short_circuit=(*_TERMIKA, "r0_ohm_per_km", "x0_ohm_per_km", "b0_siemens_per_km"),
        ),
        "LVCableType": _mapa(
            identyfikacja=(
                *_META,
                "standard",
                "insulation_type",
                "conductor_material",
                "number_of_cores",
                "core_functions",
            ),
            fundamental=("u_n_kv", "r_ohm_per_km", "x_ohm_per_km", "i_max_a", "cross_section_mm2"),
            short_circuit=(
                *_TERMIKA,
                "r0_ohm_per_km",
                "x0_ohm_per_km",
                "return_conductor_cross_section_mm2",
                "return_conductor_r_ohm_per_km_20c",
                "return_conductor_x_ohm_per_km",
            ),
        ),
        "BESSBatteryType": _mapa(
            identyfikacja=(*(p for p in _META if p != "manufacturer"), "chemistry"),
            fundamental=("capacity_kwh", "nominal_voltage_dc_v", "c_rate"),
        ),
    }
)

#: Przestrzenie katalogu z widokiem sekcji → klasa typu i akcesor repozytorium.
PRZESTRZENIE_Z_SEKCJAMI: Mapping[str, tuple[str, str]] = MappingProxyType(
    {
        "CONVERTER": ("ConverterType", "get_converter_type"),
        "ZRODLO_NN_PV": ("PVInverterType", "get_pv_inverter_type"),
        "ZRODLO_NN_BESS": ("BESSInverterType", "get_bess_inverter_type"),
        "GENERATOR_SN": ("SynchronousGeneratorType", "get_synchronous_generator_type"),
        "ZRODLO_SN": ("SourceSystemType", "get_source_system_type"),
        "KOMPENSATOR_SN": ("ShuntCapacitorType", "get_shunt_capacitor_type"),
        "OBCIAZENIE": ("LoadType", "get_load_type"),
        "TRAFO_SN_NN": ("TransformerType", "get_transformer_type"),
        "KABEL_SN": ("CableType", "get_cable_type"),
        "LINIA_SN": ("LineType", "get_line_type"),
        "KABEL_NN": ("LVCableType", "get_lv_cable_type"),
        "BATERIA_BESS": ("BESSBatteryType", "get_bess_battery_type"),
    }
)

#: Przestrzenie BEZ sekcji modelu — z powodem merytorycznym (§0.15).
PRZESTRZENIE_BEZ_SEKCJI: Mapping[str, str] = MappingProxyType(
    {
        "APARAT_SN": (
            "aparatura łączeniowa SN — bez modelu fizycznego w dziedzinach produktu "
            "(łącznik bez impedancji); oceniane są znamiona, nie model"
        ),
        "APARAT_NN": "aparatura łączeniowa nN — jak APARAT_SN",
        "APARAT_NN_MCB": "wyłącznik instalacyjny nN — charakterystyka zadziałania, nie model obwodu",
        "WKLADKA_NN": "wkładka topikowa nN — charakterystyka zadziałania, nie model obwodu",
        "CT": "przekładnik prądowy — tor pomiarowy zabezpieczeń, nie element obwodu mocy",
        "VT": "przekładnik napięciowy — tor pomiarowy zabezpieczeń, nie element obwodu mocy",
        "OGRANICZNIK_SN": (
            "ogranicznik przepięć — domena przebiegów chwilowych (koordynacja izolacji), "
            "poza sześcioma dziedzinami produktu"
        ),
        "ZABEZPIECZENIE": "urządzenie zabezpieczeniowe — logika zadziałania, nie model obwodu",
        "NASTAWY_ZABEZPIECZEN": "szablon nastaw — parametry logiki, nie model obwodu",
        "PTPIREE_CERTYFIKAT_GENERATORA": (
            "rekord dowodu (wykaz certyfikatów), nie urządzenie — zasila sekcję "
            "certification typów przekształtników"
        ),
        "KARTA_WIDMOWA": (
            "rekord danych sekcji harmonic/supraharmonic typu przekształtnika, nie urządzenie"
        ),
    }
)

# ---------------------------------------------------------------------------
# Składniki sekcji per klasa
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class DefinicjaSkladnika:
    """Składnik sekcji: nazwa, wymagany/opcjonalny, pola karty albo modele widmowe."""

    nazwa: str
    wymagany: bool
    pola: tuple[str, ...] = ()
    #: Dla składnika widmowego: dziedzina i rola modeli (źródło albo część wewnętrzna).
    widmo: (
        tuple[Literal["HARMONIC_FREQUENCY_DOMAIN", "SUPRAHARMONIC_FREQUENCY_DOMAIN"], str] | None
    ) = None

    @property
    def rodzaj_danych(self) -> RodzajDanychSkladnika:
        return "MODELE_WIDMOWE" if self.widmo is not None else "POLA"


def _s(nazwa: str, wymagany: bool, *pola: str) -> DefinicjaSkladnika:
    return DefinicjaSkladnika(nazwa=nazwa, wymagany=wymagany, pola=pola)


def _widmowe(
    dziedzina: Literal["HARMONIC_FREQUENCY_DOMAIN", "SUPRAHARMONIC_FREQUENCY_DOMAIN"],
) -> tuple[DefinicjaSkladnika, ...]:
    return (
        DefinicjaSkladnika(nazwa="emisja", wymagany=True, widmo=(dziedzina, "zrodlo")),
        DefinicjaSkladnika(
            nazwa="impedancja_wewnetrzna_z_karty", wymagany=False, widmo=(dziedzina, "wewnetrzna")
        ),
    )


#: Pole widoku sekcji ``dynamic`` ELEMENTU (nie pole modelu ani typu) — patrz
#: ``SKLADNIKI_SEKCJI["Generator"]``.
POLE_MODELU_DYNAMICZNEGO_ELEMENTU = "model_dynamiczny"
#: Klasa definicji składników elementu ENM generatora przekształtnikowego.
KLASA_ELEMENTU_PRZEKSZTALTNIKOWEGO = "Generator"
#: Przestrzenie katalogu, z których generator przekształtnikowy się materializuje (element
#: ma WŁASNE nazwy pól tabliczki — ``sn_mva``/``pmax_mw`` — niezależnie od przestrzeni).
PRZESTRZENIE_PRZEKSZTALTNIKOWE: frozenset[str] = frozenset(
    ("CONVERTER", "ZRODLO_NN_PV", "ZRODLO_NN_BESS")
)

_SEKCJE_PRZEKSZTALTNIKA_WSPOLNE: dict[str, tuple[DefinicjaSkladnika, ...]] = {
    "short_circuit": (
        _s("udzial_zwarciowy", True, "k_sc"),
        _s("model_zwarciowy", False, *_MODEL_ZWARCIOWY),
    ),
    "dynamic": (
        _s("model_dynamiczny", True, "dynamic_profile_id"),
        _s("statyzmy_gfm", False, *_STATYZMY),
    ),
    "harmonic": (
        *_widmowe("HARMONIC_FREQUENCY_DOMAIN"),
        _s("parametry_z_conv", False, *_Z_CONV),
    ),
    "supraharmonic": _widmowe("SUPRAHARMONIC_FREQUENCY_DOMAIN"),
}
_FUNDAMENTAL_OPCJONALNE: tuple[DefinicjaSkladnika, ...] = (
    _s("hierarchia_mocy", False, *_HIERARCHIA),
    _s("krzywa_pq", False, "pq_curve"),
    _s("migotanie", False, "flicker_c"),
)
#: Regulacja mocy biernej i częstotliwości — pola są ALTERNATYWAMI trybu (cos φ, cos φ(P),
#: Q(U), LFSM); składnik opcjonalny oceniany na polach obecnych. Magazyn BESS nie ma pola
#: trybu (`control_mode`) w projekcji nN.
_REGULACJA_BEZ_TRYBU: tuple[str, ...] = tuple(p for p in _REGULACJA if p != "control_mode")

#: Nazwy pól ELEMENTU (``materialized_params``) — wspólne dla wszystkich torów tworzenia
#: źródła przekształtnikowego (``sn_mva``/``pmax_mw`` liczy tabliczka elementu z danych
#: katalogu). Składnik znamionowy typu projekcji ma własne nazwy (kVA, kW), więc klasa
#: typu i element mają OSOBNE definicje tylko tego składnika; reszta jest wspólna.
SKLADNIKI_SEKCJI: Mapping[str, Mapping[str, tuple[DefinicjaSkladnika, ...]]] = MappingProxyType(
    {
        "ConverterType": {
            "fundamental": (
                _s("parametry_znamionowe", True, "un_kv", "sn_mva", "pmax_mw"),
                _s("zdolnosc_bierna", False, "qmin_mvar", "qmax_mvar", "cosphi_min", "cosphi_max"),
                _s("magazyn", False, "e_kwh"),
                _s("regulacja", False, *_REGULACJA, *_FLAGI_REGULACJI),
                *_FUNDAMENTAL_OPCJONALNE,
            ),
            **_SEKCJE_PRZEKSZTALTNIKA_WSPOLNE,
        },
        "PVInverterType": {
            "fundamental": (
                _s("parametry_znamionowe", True, "un_kv", "s_n_kva", "p_max_kw"),
                _s("zdolnosc_bierna", False, "cos_phi_min", "cos_phi_max"),
                _s("regulacja", False, *_REGULACJA),
                *_FUNDAMENTAL_OPCJONALNE,
            ),
            **_SEKCJE_PRZEKSZTALTNIKA_WSPOLNE,
        },
        "BESSInverterType": {
            "fundamental": (
                _s("parametry_znamionowe", True, "un_kv", "p_charge_kw", "p_discharge_kw"),
                _s("magazyn", False, "e_kwh", "s_n_kva"),
                _s("regulacja", False, *_REGULACJA_BEZ_TRYBU),
                *_FUNDAMENTAL_OPCJONALNE,
            ),
            **_SEKCJE_PRZEKSZTALTNIKA_WSPOLNE,
        },
        #: Element ENM — generator przekształtnikowy (dowolny tor i przestrzeń katalogu).
        #: Sekcja ``dynamic`` elementu: pole WIDOKU ``model_dynamiczny`` — obecne, gdy element
        #: ma którekolwiek źródło modelu dynamicznego (blok DAE ``Generator.dynamika``,
        #: wiązanie ``dynamic_model_ref``, profil typu ``dynamic_profile_id``); jakość =
        #: najsłabsza z obecnych źródeł (adapter elementu, ``DaneUrzadzenia.jakosci_zrodel``).
        "Generator": {
            "fundamental": (
                _s("parametry_znamionowe", True, "un_kv", "sn_mva", "pmax_mw"),
                _s("zdolnosc_bierna", False, "qmin_mvar", "qmax_mvar"),
                _s("regulacja", False, *_REGULACJA),
                *_FUNDAMENTAL_OPCJONALNE,
            ),
            **_SEKCJE_PRZEKSZTALTNIKA_WSPOLNE,
            "dynamic": (
                _s("model_dynamiczny", True, POLE_MODELU_DYNAMICZNEGO_ELEMENTU),
                _s("statyzmy_gfm", False, *_STATYZMY),
            ),
        },
        "SynchronousGeneratorType": {
            "fundamental": (
                _s("parametry_znamionowe", True, "rated_mva", "rated_kv"),
                _s("zdolnosc_bierna", False, "q_min_mvar", "q_max_mvar"),
            ),
        },
        "SourceSystemType": {
            "fundamental": (_s("napiecie_znamionowe", True, "voltage_rating_kv"),),
            "short_circuit": (
                _s("moc_zwarciowa_max", True, "sk3_mva", "rx_ratio"),
                _s("moc_zwarciowa_min", False, "sk3_min_mva", "rx_ratio_min", "ik3_min_ka"),
                _s("prad_zwarciowy", False, "ik3_ka", "short_circuit_model"),
            ),
        },
        "ShuntCapacitorType": {
            "fundamental": (
                _s("parametry_znamionowe", True, "rated_mvar", "rated_kv"),
                _s("straty", False, "loss_kw"),
            ),
        },
        "LoadType": {
            "fundamental": (
                _s("moc", True, "p_kw"),
                _s("moc_bierna", False, "q_kvar", "cos_phi", "cos_phi_mode"),
                _s("model_odbioru", False, "model", "a_p", "b_p", "c_p", "a_q", "b_q", "c_q"),
                _s(
                    "zaleznosc_napieciowa_i_czestotliwosciowa",
                    False,
                    "v0_pu",
                    "k_pf",
                    "k_qf",
                    "f0_hz",
                ),
            ),
        },
        "TransformerType": {
            "fundamental": (
                _s(
                    "parametry_znamionowe",
                    True,
                    "rated_power_mva",
                    "voltage_hv_kv",
                    "voltage_lv_kv",
                    "uk_percent",
                    "pk_kw",
                ),
                _s("galaz_poprzeczna", False, "i0_percent", "p0_kw"),
                _s("grupa_polaczen", False, "vector_group"),
                _s("przelacznik_zaczepow", False, "tap_min", "tap_max", "tap_step_percent"),
            ),
            "short_circuit": (
                _s("impedancja_zwarciowa", True, "uk_percent", "pk_kw", "vector_group"),
            ),
            "dynamic": (_s("impedancja_rms", True, "uk_percent", "pk_kw"),),
        },
        "CableType": {
            "fundamental": (
                _s("impedancja", True, "r_ohm_per_km", "x_ohm_per_km", "c_nf_per_km"),
                _s("obciazalnosc", False, "rated_current_a"),
                _s("znamiona_konstrukcyjne", False, "cross_section_mm2", "voltage_rating_kv"),
            ),
            "short_circuit": (
                _s("skladowa_zerowa", True, "r0_ohm_per_km", "x0_ohm_per_km"),
                _s("admitancja_zerowa", False, "b0_siemens_per_km", "z0_reference_bonding"),
                _s("wytrzymalosc_cieplna", False, *_TERMIKA),
                _s(
                    "przewod_powrotny",
                    False,
                    "return_conductor_cross_section_mm2",
                    "return_conductor_r_ohm_per_km_20c",
                    "return_conductor_jth_1s_a_per_mm2",
                    "return_conductor_ith_1s_a",
                ),
            ),
            "dynamic": (_s("impedancja_rms", True, "r_ohm_per_km", "x_ohm_per_km", "c_nf_per_km"),),
        },
        "LineType": {
            "fundamental": (
                _s("impedancja", True, "r_ohm_per_km", "x_ohm_per_km", "b_us_per_km"),
                _s("obciazalnosc", False, "rated_current_a"),
                _s("znamiona_konstrukcyjne", False, "cross_section_mm2", "voltage_rating_kv"),
            ),
            "short_circuit": (
                _s("skladowa_zerowa", True, "r0_ohm_per_km", "x0_ohm_per_km"),
                _s("admitancja_zerowa", False, "b0_siemens_per_km"),
                _s("wytrzymalosc_cieplna", False, *_TERMIKA),
            ),
            "dynamic": (_s("impedancja_rms", True, "r_ohm_per_km", "x_ohm_per_km", "b_us_per_km"),),
        },
        "LVCableType": {
            "fundamental": (
                _s("impedancja", True, "r_ohm_per_km", "x_ohm_per_km"),
                _s("obciazalnosc", False, "i_max_a"),
                _s("znamiona_konstrukcyjne", False, "cross_section_mm2", "u_n_kv"),
            ),
            "short_circuit": (
                _s("skladowa_zerowa", True, "r0_ohm_per_km", "x0_ohm_per_km"),
                _s("wytrzymalosc_cieplna", False, *_TERMIKA),
                _s(
                    "przewod_powrotny",
                    False,
                    "return_conductor_cross_section_mm2",
                    "return_conductor_r_ohm_per_km_20c",
                    "return_conductor_x_ohm_per_km",
                ),
            ),
        },
        "BESSBatteryType": {
            "fundamental": (
                _s("pojemnosc", True, "capacity_kwh", "nominal_voltage_dc_v"),
                _s("obciazalnosc_pradowa", False, "c_rate"),
            ),
        },
    }
)

#: Nazwy pól projekcji/elementu → nazwa pola karty przekształtnika dla reguły jakości
#: (``resolve_card_field_quality_map`` zna nazwy ``ConverterType``). Wyłącznie
#: odwzorowanie NAZW — wartości nie są przeliczane (reguła jakości bada obecność).
_NAZWA_W_KARCIE: Mapping[str, str] = MappingProxyType(
    {
        "s_n_kva": "sn_mva",
        "p_max_kw": "pmax_mw",
        "p_discharge_kw": "pmax_mw",
        "p_charge_kw": "pmax_mw",
        "cos_phi_min": "cosphi_min",
        "cos_phi_max": "cosphi_max",
    }
)
#: Klasy, dla których jakość pól wynika z karty przekształtnika (reguła S-3 + nadpisania
#: ``card_field_status``). Dla pozostałych klas jakość pola niesie wyłącznie status
#: weryfikacji rekordu — pole obecne ma jakość niezadeklarowaną (``None``).
_KLASY_KARTY_PRZEKSZTALTNIKA = frozenset(
    ("ConverterType", "PVInverterType", "BESSInverterType", "Generator")
)


# ---------------------------------------------------------------------------
# Dane urządzenia (wspólne dla typu i elementu) i JEDNA budowa wejścia
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class DaneUrzadzenia:
    """Dane urządzenia potrzebne widokowi sekcji — z typu katalogu albo z elementu ENM."""

    klasa: str
    pola: Mapping[str, Any]
    status_weryfikacji_rekordu: StatusWeryfikacjiRekordu
    modele_widmowe: tuple[ModelZrodlaWidmowego, ...]
    dowody: tuple[DowodModelu, ...]
    #: Jakość pól, których jakość wynika z PROWENIENCJI ŹRÓDŁA (profil dynamiczny, blok
    #: DAE), a nie z reguły karty przekształtnika — ustawia ją adapter. Pole spoza tej mapy
    #: dostaje jakość z ``jakosc_pol``.
    jakosci_zrodel: Mapping[str, FieldQuality | None] = field(
        default_factory=lambda: MappingProxyType({})
    )


def jakosc_pol(klasa: str, pola: Mapping[str, Any]) -> dict[str, FieldQuality]:
    """Jakość pól urządzenia — JEDNA reguła (``resolve_card_field_quality_map``) dla typu
    i elementu; dla klas bez karty przekształtnika — pusta mapa (jakość niezadeklarowana)."""
    if klasa not in _KLASY_KARTY_PRZEKSZTALTNIKA:
        return {}
    widok: dict[str, Any] = {nazwa: None for nazwa in _POLA_WIDOKU_KARTY}
    for nazwa, wartosc in pola.items():
        widok[_NAZWA_W_KARCIE.get(nazwa, nazwa)] = (
            wartosc if wartosc is not None else widok.get(_NAZWA_W_KARCIE.get(nazwa, nazwa))
        )
    mapa = resolve_card_field_quality_map(SimpleNamespace(**widok))
    return {nazwa: status.quality for nazwa, status in mapa.items()}


#: Pola karty przekształtnika, o które pyta reguła jakości (komplet nazw ``ConverterType``
#: z grup karty) — widok ma je wszystkie, żeby reguła nie trafiła w brak atrybutu.
_POLA_WIDOKU_KARTY: tuple[str, ...] = tuple(POLA_SEKCJI["ConverterType"])


#: Źródło parametrów dynamicznych (``enm.dynamika_modele.ZrodloProweniencjiDynamiki``) →
#: jakość danej. Profil typowy normy i deklaracja użytkownika to dane bez karty urządzenia
#: (``ESTIMATED``); karta producenta i certyfikat jednostki — dane z dokumentu urządzenia
#: (``DATASHEET``; certyfikat jednostki NIE certyfikuje modelu — §0.3.4). Mapa ZAMKNIĘTA:
#: nowe źródło bez wpisu = ``KeyError`` (test parytetu z literałem).
JAKOSC_ZRODLA_DYNAMIKI: Mapping[str, FieldQuality] = MappingProxyType(
    {
        "karta_producenta": FieldQuality.DATASHEET,
        "certyfikat_jednostki": FieldQuality.DATASHEET,
        "profil_typowy_normy": FieldQuality.ESTIMATED,
        "deklaracja_uzytkownika": FieldQuality.ESTIMATED,
    }
)
#: Porządek jakości (najsłabsza pierwsza) — ``None`` = jakość niezadeklarowana.
_PORZADEK_JAKOSCI: tuple[FieldQuality | None, ...] = (
    None,
    FieldQuality.SYSTEM_DEFAULT,
    FieldQuality.ESTIMATED,
    FieldQuality.DATASHEET,
)


def najslabsza_jakosc(jakosci: tuple[FieldQuality | None, ...]) -> FieldQuality | None:
    """Najsłabsza z jakości (``None`` najsłabsze); pusta krotka → ``None``."""
    if not jakosci:
        return None
    return min(jakosci, key=_PORZADEK_JAKOSCI.index)


def jakosc_profilu_dynamicznego(profil_id: Any) -> FieldQuality | None:
    """Jakość wskazania profilu dynamicznego z proweniencji profilu ``der_dynamic``;
    profil nieznany katalogowi profili → ``None`` (jakość niezadeklarowana)."""
    if not isinstance(profil_id, str) or profil_id not in list_all_profile_ids():
        return None
    return JAKOSC_ZRODLA_DYNAMIKI[get_profile(profil_id).proweniencja.zrodlo]


def dowod_certyfikatu_ptpiree(pola: Mapping[str, Any]) -> DowodModelu | None:
    """Dowód CERTYFIKATU ZGODNOŚCI z pozycji wykazu PTPiREE (``POWIAZANY``) albo ``None``.

    Podstawa: wykaz urządzeń PTPiREE (rodzaj ``WIPWC``), wydanie = data publikacji
    wykazu, jednostka redakcyjna = pozycja wykazu wskazana numerem dokumentu certyfikatu.
    Pokrycie: wymagania NC RfG sformułowane w stanie ustalonym (zdolność P/Q, zakresy
    napięcia i częstotliwości) i w dynamice (FRT, odpowiedź częstotliwościowa) — dowód
    ZGODNOŚCI tych wymagań, nie certyfikat modelu symulacyjnego.
    """
    if pola.get("ptpiree_status") != "POWIAZANY" or not pola.get("ptpiree_certificate_ref"):
        return None
    numer = pola.get("ptpiree_document_number")
    wydanie = pola.get("ptpiree_publication_date") or pola.get("ptpiree_wipwc_version")
    ustalona = bool(numer and wydanie)
    podstawa = PodstawaWymagania(
        rodzaj="WIPWC",
        dokument=(
            "Wykaz urządzeń PTPiREE"
            + (f" ({pola['ptpiree_source_url']})" if pola.get("ptpiree_source_url") else "")
        ),
        wydanie=str(wydanie) if ustalona else None,
        jednostka_redakcyjna=f"pozycja wykazu — certyfikat {numer}" if ustalona else None,
        status="WSKAZANE" if ustalona else "NIEUSTALONE",
    )
    return DowodModelu(
        rodzaj="CERTYFIKAT_ZGODNOSCI",
        pokrywa=("POWER_FLOW", "RMS_DYNAMICS"),
        podstawa=podstawa,
        odniesienie_pl=f"certyfikat {numer or pola['ptpiree_certificate_ref']}",
    )


def _modele_skladnika(
    definicja: DefinicjaSkladnika, modele: tuple[ModelZrodlaWidmowego, ...]
) -> tuple[ModelZrodlaWidmowego, ...]:
    assert definicja.widmo is not None
    dziedzina, rola = definicja.widmo
    if rola == "zrodlo":
        return tuple(m for m in modele if m.dziedzina == dziedzina and m.skladowe)
    return tuple(m for m in modele if m.dziedzina == dziedzina and not m.skladowe)


def wejscia_sekcji(dane: DaneUrzadzenia) -> tuple[WejscieStatusuSekcji, ...]:
    """JEDNA budowa wejść ośmiu sekcji z danych urządzenia (typ albo element)."""
    jakosci = jakosc_pol(dane.klasa, dane.pola)
    definicje = SKLADNIKI_SEKCJI.get(dane.klasa, {})
    wejscia: list[WejscieStatusuSekcji] = []
    for sekcja in SEKCJE:
        skladniki: list[SkladnikSekcji] = []
        for definicja in definicje.get(sekcja, ()):
            if definicja.widmo is not None:
                skladniki.append(
                    SkladnikSekcji(
                        nazwa=definicja.nazwa,
                        wymagany=definicja.wymagany,
                        rodzaj_danych="MODELE_WIDMOWE",
                        modele=_modele_skladnika(definicja, dane.modele_widmowe),
                    )
                )
                continue
            pola: list[PoleSekcji] = []
            for nazwa in definicja.pola:
                wartosc = dane.pola.get(nazwa)
                obecne = wartosc is not None
                if not obecne:
                    jakosc = None
                elif nazwa in dane.jakosci_zrodel:
                    jakosc = dane.jakosci_zrodel[nazwa]
                else:
                    jakosc = jakosci.get(_NAZWA_W_KARCIE.get(nazwa, nazwa))
                pola.append(PoleSekcji(nazwa=nazwa, obecne=obecne, jakosc=jakosc))
            skladniki.append(
                SkladnikSekcji(
                    nazwa=definicja.nazwa,
                    wymagany=definicja.wymagany,
                    rodzaj_danych="POLA",
                    pola=tuple(pola),
                )
            )
        wejscia.append(
            WejscieStatusuSekcji(
                sekcja=sekcja,
                skladniki=tuple(skladniki) if sekcja not in _SEKCJE_DOWODOWE else (),
                dowody=dane.dowody,
                status_weryfikacji_rekordu=dane.status_weryfikacji_rekordu,
            )
        )
    return tuple(wejscia)


_SEKCJE_DOWODOWE = frozenset(("certification", "measurement", "validation"))


def oceny_sekcji(dane: DaneUrzadzenia) -> tuple[OcenaSekcji, ...]:
    """Osiem ocen sekcji urządzenia (kolejność ``dziedziny.sekcje.SEKCJE``)."""
    return tuple(status_sekcji(wejscie) for wejscie in wejscia_sekcji(dane))


def dowody_kart(karty: tuple[KartaWidmowa, ...]) -> tuple[DowodModelu, ...]:
    """Dowody wszystkich kart (posortowane deterministycznie)."""
    return tuple(
        sorted(
            (dowod for karta in karty for dowod in karta.dowody),
            key=lambda d: (d.rodzaj, d.odniesienie_pl),
        )
    )


# ---------------------------------------------------------------------------
# Adapter typu katalogowego
# ---------------------------------------------------------------------------


def _pola_typu(typ: Any) -> dict[str, Any]:
    if dataclasses.is_dataclass(typ) and not isinstance(typ, type):
        return {pole.name: getattr(typ, pole.name) for pole in dataclasses.fields(typ)}
    raise TypeError(f"Typ katalogu {type(typ).__name__} nie jest rekordem dataclass.")


def dane_typu(repozytorium: CatalogRepository, przestrzen: str, typ_id: str) -> DaneUrzadzenia:
    """Dane urządzenia typu katalogowego (``KeyError`` — przestrzeń bez sekcji albo brak typu)."""
    if przestrzen not in PRZESTRZENIE_Z_SEKCJAMI:
        powod = PRZESTRZENIE_BEZ_SEKCJI.get(przestrzen, "przestrzeń nieznana")
        raise KeyError(f"Przestrzeń {przestrzen!r} nie ma widoku sekcji modelu: {powod}.")
    klasa, akcesor = PRZESTRZENIE_Z_SEKCJAMI[przestrzen]
    typ = getattr(repozytorium, akcesor)(typ_id)
    if typ is None:
        raise KeyError(f"Typ {typ_id!r} nie istnieje w przestrzeni {przestrzen}.")
    pola = _pola_typu(typ)
    karty = tuple(repozytorium.list_karty_widmowe(urzadzenie_ref=str(typ_id)))
    dowod_ptpiree = dowod_certyfikatu_ptpiree(pola)
    return DaneUrzadzenia(
        klasa=klasa,
        pola=MappingProxyType(pola),
        status_weryfikacji_rekordu=pola["verification_status"],
        modele_widmowe=tuple(model for karta in karty for model in karta.modele),
        dowody=(*dowody_kart(karty), *((dowod_ptpiree,) if dowod_ptpiree else ())),
        jakosci_zrodel=MappingProxyType(
            {"dynamic_profile_id": jakosc_profilu_dynamicznego(pola.get("dynamic_profile_id"))}
            if "dynamic_profile_id" in pola
            else {}
        ),
    )


def typ_katalogowy(repozytorium: CatalogRepository, przestrzen: str, typ_id: str) -> Any | None:
    """Rekord typu przestrzeni z widokiem sekcji (``None`` — brak typu w katalogu)."""
    if przestrzen not in PRZESTRZENIE_Z_SEKCJAMI:
        return None
    _, akcesor = PRZESTRZENIE_Z_SEKCJAMI[przestrzen]
    return getattr(repozytorium, akcesor)(typ_id)


def sekcje_typu(
    repozytorium: CatalogRepository, przestrzen: str, typ_id: str
) -> tuple[OcenaSekcji, ...]:
    """Osiem sekcji modelu typu katalogowego ze statusem, powodem i składnikami."""
    return oceny_sekcji(dane_typu(repozytorium, przestrzen, typ_id))


# ---------------------------------------------------------------------------
# Rejestr pokrycia typów przekształtników kartami widmowymi (karta AB-H0 §0.9)
# ---------------------------------------------------------------------------


class PozycjaRejestruKart(BaseModel):
    """Typ przekształtnika: karty widmowe, które go wskazują, i dwie sekcje częstotliwości."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    typ_id: str
    nazwa: str
    producent: str | None
    rodzaj: str
    status_weryfikacji_rekordu: StatusWeryfikacjiRekordu
    karty: tuple[str, ...]
    harmonic: OcenaSekcji
    supraharmonic: OcenaSekcji


class RejestrKartWidmowych(BaseModel):
    """Pomiar pokrycia typów przekształtników (``CONVERTER``) kartami widmowymi katalogu —
    JEDNO źródło dla końcówki ``GET /api/catalog/karty-widmowe/rejestr`` i miernika
    ``backend/scripts/inwentarz_katalogow.py`` (tabela SPEC_KATALOGI)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    liczba_typow: int
    typy_z_karta: int
    liczba_kart: int
    #: Karty wg statusu weryfikacji — pary (status, liczba), posortowane po statusie.
    karty_wg_statusu: tuple[tuple[str, int], ...]
    #: Karty wskazujące typ, którego nie ma w przestrzeni ``CONVERTER`` (nazwane, nie
    #: pomijane po cichu).
    karty_bez_typu: tuple[str, ...]
    pozycje: tuple[PozycjaRejestruKart, ...]


def rejestr_kart_widmowych(repozytorium: CatalogRepository) -> RejestrKartWidmowych:
    """Rejestr: każdy typ przekształtnika z listą kart i statusem sekcji ``harmonic``/
    ``supraharmonic`` (status wyprowadzany TĄ SAMĄ funkcją co widok sekcji typu)."""
    karty = repozytorium.list_karty_widmowe()
    wg_typu: dict[str, list[str]] = {}
    for karta in karty:
        wg_typu.setdefault(karta.urzadzenie_ref, []).append(karta.id)
    pozycje: list[PozycjaRejestruKart] = []
    for typ_id, typ in sorted(repozytorium.converter_types.items()):
        oceny = {o.sekcja: o for o in sekcje_typu(repozytorium, "CONVERTER", typ_id)}
        pozycje.append(
            PozycjaRejestruKart(
                typ_id=typ_id,
                nazwa=typ.name,
                producent=typ.manufacturer,
                rodzaj=typ.kind.value,
                status_weryfikacji_rekordu=typ.verification_status,
                karty=tuple(sorted(wg_typu.get(typ_id, ()))),
                harmonic=oceny["harmonic"],
                supraharmonic=oceny["supraharmonic"],
            )
        )
    statusy = Counter(karta.verification_status for karta in karty)
    return RejestrKartWidmowych(
        liczba_typow=len(pozycje),
        typy_z_karta=sum(1 for pozycja in pozycje if pozycja.karty),
        liczba_kart=len(karty),
        karty_wg_statusu=tuple(sorted(statusy.items())),
        karty_bez_typu=tuple(
            sorted(k.id for k in karty if k.urzadzenie_ref not in repozytorium.converter_types)
        ),
        pozycje=tuple(pozycje),
    )


__all__ = [
    "JAKOSC_ZRODLA_DYNAMIKI",
    "KLASA_ELEMENTU_PRZEKSZTALTNIKOWEGO",
    "POLE_MODELU_DYNAMICZNEGO_ELEMENTU",
    "PRZESTRZENIE_BEZ_SEKCJI",
    "PRZESTRZENIE_PRZEKSZTALTNIKOWE",
    "PRZESTRZENIE_Z_SEKCJAMI",
    "POLA_SEKCJI",
    "SKLADNIKI_SEKCJI",
    "DaneUrzadzenia",
    "PozycjaRejestruKart",
    "RejestrKartWidmowych",
    "DefinicjaSkladnika",
    "MiejscePola",
    "dane_typu",
    "dowod_certyfikatu_ptpiree",
    "dowody_kart",
    "jakosc_pol",
    "jakosc_profilu_dynamicznego",
    "najslabsza_jakosc",
    "oceny_sekcji",
    "rejestr_kart_widmowych",
    "sekcje_typu",
    "typ_katalogowy",
    "wejscia_sekcji",
]
