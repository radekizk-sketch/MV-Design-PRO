"""D1 (RECENZJA_DER_SN_DOBORY_2026-07): twarde walidacje domenowe kompletnego toru
DER przyłączonego po stronie SN — U_AC↔nN TR, strona SN TR↔szyna, moc TR, kaskada
prądowa oraz spójność jawnego „sposobu przyłączenia".

Backend = JEDYNE źródło prawdy walidacji doborowej (kreator dubluje ją na żywo tylko
jako wczesne ostrzeżenie; decyzja zawsze zapada w backendzie). Komunikaty PO POLSKU
z ❌-semantyką kanonu; kody błędów stabilne (wzorzec `converter.sn_requires_block_transformer`).

ZERO fizyki solvera: porównania napięć/mocy oraz prąd znamionowy z tabliczki
(I = S / (√3·U)) to walidacja DOBOROWA (nameplate), nie obliczenia rozpływu/zwarcia —
analogicznie do istniejącego `_same_nominal_voltage` w warstwie domenowej. Rozpływ,
zwarcia i straty liczą wyłącznie dedykowane solvery na zmaterializowanym torze.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from network_model.pochodne import moc_pozorna_z_czynnej_mva, prad_znamionowy_a

# ---------------------------------------------------------------------------
# Tolerancje napięciowe — JEDNA konwencja repo (nie nowa).
# Źródło: frontend/src/ui2/kreatory/stacja/stacjaModel.ts
#   SN_VOLTAGE_TOLERANCE_KV = 0.01, NN_VOLTAGE_TOLERANCE_KV = 0.001
# (dobór transformatora do napięć strony SN/nN stacji). Backend przyjmuje te same
# wartości, aby walidacja doborowa toru DER była spójna z kreatorem stacji.
# ---------------------------------------------------------------------------
SN_VOLTAGE_TOLERANCE_KV = 0.01
NN_VOLTAGE_TOLERANCE_KV = 0.001

# ---------------------------------------------------------------------------
# Domyślne stałe normowe (konserwatywne), gdy katalog/payload ich nie niesie.
#   - Dopuszczalne obciążenie TR (przeciążalność): 1,0 = brak zapasu przeciążeniowego.
#     PN-EN 60076-7 dopuszcza wartości >1,0 przy określonym profilu obciążenia i
#     temperaturze otoczenia — wtedy wymagane JAWNE podanie (block_transformer.loadability_pu).
#   - Współczynnik jednoczesności: 1,0 = wszystkie jednostki pracują szczytowo
#     równocześnie (konserwatywnie dla źródeł OZE tej samej technologii na wspólnym torze).
# Trzymane w JEDNYM module (docstring źródła), nie rozproszone jako literały.
# ---------------------------------------------------------------------------
DEFAULT_TRANSFORMER_LOADABILITY_PU = 1.0
DEFAULT_SIMULTANEITY_FACTOR = 1.0

ConnectionMethod = Literal[
    "der_za_tr_stacji",
    "der_z_tr_blokowym",
    "der_bezposrednio_sn",
    "der_przez_rozdzielnie_producenta",
]

CONNECTION_METHODS: frozenset[str] = frozenset(
    {
        "der_za_tr_stacji",
        "der_z_tr_blokowym",
        "der_bezposrednio_sn",
        "der_przez_rozdzielnie_producenta",
    }
)


@dataclass(frozen=True)
class ValidationError:
    """Błąd walidacji doborowej — kod stabilny + komunikat PO POLSKU."""

    code: str
    message_pl: str


@dataclass(frozen=True)
class CascadeWarning:
    """Ostrzeżenie kaskady prądowej — jawne pominięcie ogniwa bez danych albo przekroczenie."""

    code: str
    message_pl: str


def voltages_match(left_kv: float, right_kv: float, tolerance_kv: float) -> bool:
    """Zgodność napięć znamionowych w granicach tolerancji doborowej."""
    return abs(left_kv - right_kv) <= tolerance_kv


def rated_current_a(sn_mva: float, voltage_kv: float) -> float | None:
    """Prąd znamionowy z tabliczki: I = S / (√3·U). None gdy dane niekompletne."""
    if sn_mva <= 0 or voltage_kv <= 0:
        return None
    return prad_znamionowy_a(sn_mva, voltage_kv)


def validate_connection_method(
    *,
    connection_method: str | None,
    connection_level: str,
    has_block_transformer: bool,
    has_manufacturer_lv_switchgear: bool,
    is_converter: bool,
) -> ValidationError | None:
    """Walidacja spójności jawnego „sposobu przyłączenia" z pozostałymi polami toru.

    Mapowanie (kanon wymaganie 9) na istniejący kontrakt
    (connection_level / has_block_transformer / has_manufacturer_lv_switchgear):
      - der_za_tr_stacji            → nn  (DER za TR SN/nN stacji, bez TR blokowego)
      - der_z_tr_blokowym           → sn + TR blokowy
      - der_bezposrednio_sn         → sn bez TR blokowego (WYŁĄCZNIE generator synchroniczny)
      - der_przez_rozdzielnie_producenta → sn + TR blokowy + rozdzielnia nN producenta

    Sprzeczne kombinacje ⇒ błąd `converter.der_sn.sposob_przylaczenia_niespojny`.
    """
    if connection_method is None:
        return None
    if connection_method not in CONNECTION_METHODS:
        return ValidationError(
            "converter.der_sn.sposob_przylaczenia_nieznany",
            f"❌ Nieznany sposób przyłączenia DER: „{connection_method}”.",
        )

    if connection_method == "der_za_tr_stacji":
        if connection_level != "nn":
            return ValidationError(
                "converter.der_sn.sposob_przylaczenia_niespojny",
                "❌ Sposób przyłączenia „DER za transformatorem stacji” wymaga przyłączenia "
                "po stronie nN (bez transformatora blokowego).",
            )
        return None

    if connection_method == "der_z_tr_blokowym":
        if connection_level != "sn" or not has_block_transformer:
            return ValidationError(
                "converter.der_sn.sposob_przylaczenia_niespojny",
                "❌ Sposób przyłączenia „DER z transformatorem blokowym” wymaga przyłączenia "
                "po stronie SN z transformatorem blokowym.",
            )
        return None

    if connection_method == "der_bezposrednio_sn":
        if is_converter:
            return ValidationError(
                "converter.der_sn.bezposrednio_tylko_generator_synchroniczny",
                "❌ Bezpośrednie przyłączenie do szyny SN jest zarezerwowane dla generatora "
                "synchronicznego. Źródło przekształtnikowe (PV/BESS/FW) wymaga transformatora "
                "blokowego.",
            )
        if connection_level != "sn" or has_block_transformer:
            return ValidationError(
                "converter.der_sn.sposob_przylaczenia_niespojny",
                "❌ Sposób przyłączenia „DER bezpośrednio na SN” wymaga przyłączenia po stronie "
                "SN bez transformatora blokowego.",
            )
        return None

    # der_przez_rozdzielnie_producenta
    if connection_level != "sn" or not has_block_transformer or not has_manufacturer_lv_switchgear:
        return ValidationError(
            "converter.der_sn.sposob_przylaczenia_niespojny",
            "❌ Sposób przyłączenia „DER przez rozdzielnię producenta” wymaga przyłączenia po "
            "stronie SN z transformatorem blokowym i rozdzielnią nN producenta.",
        )
    return None


def validate_inverter_lv_voltage(
    inverter_output_kv: float, block_secondary_kv: float
) -> ValidationError | None:
    """Wymaganie 2: U_AC falownika ↔ strona nN TR blokowego (tolerancja nN)."""
    if not voltages_match(inverter_output_kv, block_secondary_kv, NN_VOLTAGE_TOLERANCE_KV):
        return ValidationError(
            "converter.der_sn.napiecie_falownika_niezgodne",
            f"❌ Niezgodność napięcia falownika ({inverter_output_kv:g} kV) z napięciem strony "
            f"nN transformatora ({block_secondary_kv:g} kV).",
        )
    return None


def validate_sn_voltage(
    block_primary_kv: float, sn_bus_voltage_kv: float
) -> ValidationError | None:
    """Wymaganie 6: strona SN TR blokowego ↔ napięcie szyny SN przyłączenia (tolerancja SN)."""
    if not voltages_match(block_primary_kv, sn_bus_voltage_kv, SN_VOLTAGE_TOLERANCE_KV):
        return ValidationError(
            "converter.der_sn.napiecie_sn_niezgodne",
            f"❌ Transformator nie odpowiada napięciu sieci (TR {block_primary_kv:g} kV, "
            f"sieć {sn_bus_voltage_kv:g} kV).",
        )
    return None


def _normalize_vector_group(value: str | None) -> str | None:
    """Znormalizuj oznaczenie układu połączeń do porównań (bez wielkości liter/spacji)."""
    if value is None:
        return None
    normalized = value.strip().upper()
    return normalized or None


def validate_block_transformer_vector_group(
    *,
    requested_vector_group: str | None,
    catalog_vector_group: str | None,
) -> ValidationError | None:
    """Wymaganie 7: układ połączeń TR blokowego = PARAMETR MODELU spójny z TYPEM katalogu.

    Grupa połączeń jest własnością typu katalogowego (jedno źródło prawdy — zakaz dwóch
    modeli). Gdy projektant wybierze w kreatorze grupę różną od tej, którą niesie wybrany
    typ katalogowy, materializacja NIE może po cichu podmienić grupy na katalogową (to był
    phantom) — odrzucamy jawnie. Brak żądania (``requested`` = None) = użyj grupy z katalogu.
    """
    requested = _normalize_vector_group(requested_vector_group)
    if requested is None:
        return None
    catalog = _normalize_vector_group(catalog_vector_group)
    if catalog is None:
        return None
    if requested != catalog:
        return ValidationError(
            "converter.der_sn.grupa_polaczen_niezgodna_z_katalogiem",
            f"❌ Układ połączeń „{requested_vector_group}” jest niezgodny z typem katalogowym "
            f"transformatora blokowego (grupa katalogowa: „{catalog_vector_group}”). Wybierz typ "
            f"katalogowy o żądanym układzie połączeń albo grupę zgodną z typem.",
        )
    return None


def converter_apparent_power_mva(active_power_mw: float, cos_phi: float | None) -> float:
    """ΣS falowników z ΣP: MW→MVA przez cosφ znamionowy (gdy podany), inaczej P=S (konserwatywnie).

    active_power_mw to zmaterializowana moc czynna źródła (już z uwzględnieniem liczby
    jednostek — n_parallel — bo tak liczy `_resolve_converter_defaults`).
    """
    if cos_phi is not None and 0.0 < cos_phi <= 1.0:
        return moc_pozorna_z_czynnej_mva(active_power_mw, cos_phi)
    return active_power_mw


def validate_transformer_power(
    *,
    sum_apparent_power_mva: float,
    transformer_sn_mva: float,
    loadability_pu: float | None,
    simultaneity_factor: float | None,
) -> ValidationError | None:
    """Wymaganie 5: ΣS falowników ≤ Sn_TR · dopuszczalne_obciążenie (z uwzgl. jednoczesności)."""
    loadability = (
        loadability_pu
        if (loadability_pu and loadability_pu > 0)
        else (DEFAULT_TRANSFORMER_LOADABILITY_PU)
    )
    simultaneity = (
        simultaneity_factor
        if (simultaneity_factor and simultaneity_factor > 0)
        else (DEFAULT_SIMULTANEITY_FACTOR)
    )
    if transformer_sn_mva <= 0:
        return None  # brak danych Sn — walidacja mocy pominięta (katalog nie niesie Sn)
    effective_load_mva = sum_apparent_power_mva * simultaneity
    allowable_mva = transformer_sn_mva * loadability
    if effective_load_mva > allowable_mva + 1e-9:
        return ValidationError(
            "converter.der_sn.moc_transformatora_niewystarczajaca",
            f"❌ Moc transformatora jest niewystarczająca (ΣS={effective_load_mva:g} MVA > "
            f"dopuszczalne {allowable_mva:g} MVA).",
        )
    return None


def build_current_cascade_warnings(
    *,
    transformer_current_a: float | None,
    cable_ampacity_a: float | None,
    field_rated_current_a: float | None,
) -> list[CascadeWarning]:
    """Wymaganie 5b: kaskada prądowa I_TR ≤ Iz kabla SN ≤ In pola.

    Ogniwo bez danych jest POMIJANE Z JAWNYM OSTRZEŻENIEM (nie cichy skip). Przekroczenie
    dowolnego dostępnego ogniwa również generuje ostrzeżenie (nie blokuje operacji —
    dobór aparatury dopina D2/analizy; tu sygnalizujemy niespójność doborową).
    """
    warnings: list[CascadeWarning] = []

    if transformer_current_a is None:
        warnings.append(
            CascadeWarning(
                "converter.der_sn.kaskada_prad_tr_brak",
                "⚠️ Kaskada prądowa: pominięto ogniwo prądu znamionowego TR blokowego "
                "(brak mocy znamionowej lub napięcia).",
            )
        )
    if cable_ampacity_a is None:
        warnings.append(
            CascadeWarning(
                "converter.der_sn.kaskada_prad_kabel_brak",
                "⚠️ Kaskada prądowa: pominięto ogniwo obciążalności kabla SN "
                "(katalog kabla nie niesie obciążalności długotrwałej).",
            )
        )
    if field_rated_current_a is None:
        warnings.append(
            CascadeWarning(
                "converter.der_sn.kaskada_prad_pole_brak",
                "⚠️ Kaskada prądowa: pominięto ogniwo prądu znamionowego pola SN "
                "(katalog aparatu głównego nie niesie prądu znamionowego).",
            )
        )

    if (
        transformer_current_a is not None
        and cable_ampacity_a is not None
        and transformer_current_a > cable_ampacity_a + 1e-9
    ):
        warnings.append(
            CascadeWarning(
                "converter.der_sn.kaskada_prad_kabel_przekroczony",
                f"⚠️ Kaskada prądowa: prąd znamionowy TR blokowego ({transformer_current_a:g} A) "
                f"przekracza obciążalność kabla SN ({cable_ampacity_a:g} A).",
            )
        )
    if (
        cable_ampacity_a is not None
        and field_rated_current_a is not None
        and cable_ampacity_a > field_rated_current_a + 1e-9
    ):
        warnings.append(
            CascadeWarning(
                "converter.der_sn.kaskada_prad_pole_przekroczony",
                f"⚠️ Kaskada prądowa: obciążalność kabla SN ({cable_ampacity_a:g} A) przekracza "
                f"prąd znamionowy pola SN ({field_rated_current_a:g} A).",
            )
        )
    return warnings
