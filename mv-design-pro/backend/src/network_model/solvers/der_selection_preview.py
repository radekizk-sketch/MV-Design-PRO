"""D2 (RECENZJA_DER_SN_DOBORY_2026-07): silniki DOBORU kompletnego toru DER po
stronie SN — transformator blokowy, kabel SN toru, aparat głównego pola SN.

WARSTWA SOLVERÓW POMOCNICZYCH (wzorzec `shunt_compensator_preview`): czyste,
deterministyczne funkcje WHITE BOX. Każdy krok jawny; ślad niesie próg doboru
oraz kandydatów ODRZUCONYCH z powodem (audytowalność). Wynik = PROPOZYCJA systemu;
decyzję podejmuje projektant (kreator pokazuje propozycję + ostrzeżenia przy
odstępstwie). Twarde walidacje D1 (`enm.der_sn_validation`) dalej bronią przed
niemożliwym — tu wyłącznie dobór/propozycja.

KATALOG-FIRST: kandydaci to REALNE wpisy katalogu (TRAFO_SN_NN, kable SN, aparaty
SN). Warstwa API czyta katalog i wiąże tolerancje/współczynniki z D1 (jedno źródło
stałych), a następnie przekazuje kandydatów tutaj — solver pozostaje czysty
(bez I/O, bez sprzężenia z katalogiem/domeną).

ZERO fizyki rozpływu/zwarcia: dobór z danych tabliczkowych (moc, napięcia, prąd
znamionowy, obciążalność) — analogicznie do walidacji doborowej D1. Spadek napięcia
kabla liczy ISTNIEJĄCY przelicznik `compute_cable_voltage_drop` (reużycie, nie nowy
przelicznik). Solvery FROZEN (SC/PF) nietknięte.
"""

from __future__ import annotations

from dataclasses import dataclass

from network_model.solvers.cable_voltage_drop import (
    CableVoltageDropInput,
    compute_cable_voltage_drop,
)

# ---------------------------------------------------------------------------
# Wspólny epsilon porównań doborowych (spójny z D1 der_sn_validation).
# ---------------------------------------------------------------------------
_EPS = 1e-9


def _voltages_match(left_kv: float, right_kv: float, tolerance_kv: float) -> bool:
    """Zgodność napięć znamionowych w granicach tolerancji doborowej (jak D1)."""
    return abs(left_kv - right_kv) <= tolerance_kv


# ===========================================================================
# 1) DOBÓR TRANSFORMATORA BLOKOWEGO (wymaganie 3)
# ===========================================================================

_TR_FORMULA_REF = "S_wym = ΣS · k_j · (1 + rezerwa);  Sn · obciążalność ≥ S_wym"


@dataclass(frozen=True)
class BlockTransformerCandidate:
    """Realny wpis katalogu transformatorów jako kandydat doboru."""

    catalog_ref: str
    name: str
    sn_mva: float
    primary_kv: float
    secondary_kv: float
    uk_percent: float | None = None
    vector_group: str | None = None


@dataclass(frozen=True)
class RejectedCandidate:
    """Kandydat odrzucony w doborze — ref + stabilny kod powodu + komunikat PL."""

    catalog_ref: str
    name: str
    reason_code: str
    reason_pl: str


@dataclass(frozen=True)
class BlockTransformerSelectionInput:
    """Wejście doboru TR blokowego. ΣS podane wprost (moc pozorna z ΣP·/cosφ liczy
    warstwa API przez D1 `converter_apparent_power_mva` — jedno źródło stałych/wzoru)."""

    sum_apparent_power_mva: float
    primary_voltage_kv: float
    secondary_voltage_kv: float
    candidates: tuple[BlockTransformerCandidate, ...]
    simultaneity_factor: float = 1.0
    reserve_pu: float = 0.0
    loadability_pu: float = 1.0
    sn_tolerance_kv: float = 0.01
    nn_tolerance_kv: float = 0.001


@dataclass(frozen=True)
class BlockTransformerProposal:
    """Propozycja TR blokowego (najmniejsza Sn spełniająca próg przy zgodnych napięciach)."""

    catalog_ref: str
    name: str
    sn_mva: float
    primary_kv: float
    secondary_kv: float
    uk_percent: float | None
    vector_group: str | None


@dataclass(frozen=True)
class BlockTransformerSelectionResult:
    """Wynik doboru TR blokowego — WHITE BOX: próg + kandydaci odrzuceni z powodem.

    ``available_vector_groups`` to POSORTOWANE, unikalne układy połączeń realnych typów
    katalogu pasujących napięciowo do toru (niezależnie od progu mocy). Kreator używa ich
    jako listy wyboru grupy (D3 wymaganie 7) — źródłem jest katalog, nie hardcode UI.
    """

    proposal: BlockTransformerProposal | None
    required_apparent_power_mva: float
    effective_load_mva: float
    rejected: tuple[RejectedCandidate, ...]
    error_code: str | None
    error_pl: str | None
    available_vector_groups: tuple[str, ...] = ()
    formula_ref: str = _TR_FORMULA_REF


def propose_block_transformer(
    data: BlockTransformerSelectionInput,
) -> BlockTransformerSelectionResult:
    """Dobierz najmniejszy TR blokowy z katalogu: Sn·obciążalność ≥ ΣS·k_j·(1+rezerwa),
    napięcia strony SN/nN zgodne z torem (tolerancje doborowe D1).

    WHITE BOX: zwraca próg mocy, obciążenie efektywne oraz listę kandydatów odrzuconych
    z jawnym powodem (napięcie SN/nN niezgodne albo moc niewystarczająca).
    """
    if data.sum_apparent_power_mva <= 0.0:
        raise ValueError("ΣS falowników musi być dodatnie.")
    if data.primary_voltage_kv <= 0.0 or data.secondary_voltage_kv <= 0.0:
        raise ValueError("Napięcia strony SN/nN muszą być dodatnie.")

    simultaneity = data.simultaneity_factor if data.simultaneity_factor > 0 else 1.0
    loadability = data.loadability_pu if data.loadability_pu > 0 else 1.0
    reserve = data.reserve_pu if data.reserve_pu >= 0 else 0.0

    effective_load_mva = data.sum_apparent_power_mva * simultaneity
    required_mva = effective_load_mva * (1.0 + reserve)

    rejected: list[RejectedCandidate] = []
    eligible: list[BlockTransformerCandidate] = []
    # Układy połączeń dostępne dla KLASY NAPIĘCIA toru (kandydaci zgodni napięciowo,
    # niezależnie od progu mocy) — realna lista wyboru grupy dla kreatora (D3 wym. 7).
    voltage_class_vector_groups: set[str] = set()

    for candidate in data.candidates:
        if (
            _voltages_match(candidate.primary_kv, data.primary_voltage_kv, data.sn_tolerance_kv)
            and _voltages_match(
                candidate.secondary_kv, data.secondary_voltage_kv, data.nn_tolerance_kv
            )
            and candidate.vector_group
        ):
            voltage_class_vector_groups.add(candidate.vector_group)
        if not _voltages_match(candidate.primary_kv, data.primary_voltage_kv, data.sn_tolerance_kv):
            rejected.append(
                RejectedCandidate(
                    candidate.catalog_ref,
                    candidate.name,
                    "napiecie_sn_niezgodne",
                    f"Napięcie strony SN ({candidate.primary_kv:g} kV) niezgodne z torem "
                    f"({data.primary_voltage_kv:g} kV).",
                )
            )
            continue
        if not _voltages_match(
            candidate.secondary_kv, data.secondary_voltage_kv, data.nn_tolerance_kv
        ):
            rejected.append(
                RejectedCandidate(
                    candidate.catalog_ref,
                    candidate.name,
                    "napiecie_nn_niezgodne",
                    f"Napięcie strony nN ({candidate.secondary_kv:g} kV) niezgodne z wyjściem "
                    f"falownika ({data.secondary_voltage_kv:g} kV).",
                )
            )
            continue
        if candidate.sn_mva * loadability + _EPS < required_mva:
            rejected.append(
                RejectedCandidate(
                    candidate.catalog_ref,
                    candidate.name,
                    "moc_niewystarczajaca",
                    f"Moc znamionowa {candidate.sn_mva:g} MVA (obciążalność {loadability:g}) "
                    f"poniżej progu doboru {required_mva:g} MVA.",
                )
            )
            continue
        eligible.append(candidate)

    available_vector_groups = tuple(sorted(voltage_class_vector_groups))

    if not eligible:
        return BlockTransformerSelectionResult(
            proposal=None,
            required_apparent_power_mva=required_mva,
            effective_load_mva=effective_load_mva,
            rejected=tuple(rejected),
            error_code="converter.der_sn.dobor_tr_brak_kandydata",
            error_pl=(
                f"❌ Brak transformatora blokowego w katalogu dla progu {required_mva:g} MVA "
                f"przy napięciach {data.primary_voltage_kv:g}/{data.secondary_voltage_kv:g} kV."
            ),
            available_vector_groups=available_vector_groups,
        )

    # Najmniejsza wystarczająca Sn; remis rozstrzyga ref katalogu (determinizm).
    best = min(eligible, key=lambda c: (c.sn_mva, c.catalog_ref))
    return BlockTransformerSelectionResult(
        proposal=BlockTransformerProposal(
            catalog_ref=best.catalog_ref,
            name=best.name,
            sn_mva=best.sn_mva,
            primary_kv=best.primary_kv,
            secondary_kv=best.secondary_kv,
            uk_percent=best.uk_percent,
            vector_group=best.vector_group,
        ),
        required_apparent_power_mva=required_mva,
        effective_load_mva=effective_load_mva,
        rejected=tuple(rejected),
        error_code=None,
        error_pl=None,
        available_vector_groups=available_vector_groups,
    )


# ===========================================================================
# 2) DOBÓR KABLA SN TORU (wymaganie 10)
# ===========================================================================

_CABLE_FORMULA_REF = "I_z ≥ I_TR · (1 + rezerwa);  ΔU% ≤ ΔU_dop  (ΔU z compute_cable_voltage_drop)"


@dataclass(frozen=True)
class CableCandidate:
    """Realny wpis katalogu kabli SN jako kandydat doboru."""

    catalog_ref: str
    name: str
    cross_section_mm2: float
    rated_current_a: float
    r_ohm_per_km: float
    x_ohm_per_km: float
    voltage_rating_kv: float | None = None


@dataclass(frozen=True)
class CableSelectionInput:
    """Wejście doboru kabla SN toru DER."""

    transformer_current_a: float
    length_km: float
    line_voltage_v: float
    cos_phi: float
    candidates: tuple[CableCandidate, ...]
    reserve_pu: float = 0.0
    max_delta_u_pct: float = 2.0
    # V12K-190: tor DER ODDAJE moc czynną, więc napięcie w punkcie przyłączenia
    # ROŚNIE — i to wzrost, nie spadek, jest tu ograniczeniem przyłączeniowym.
    # Kryterium sprawdza więc MODUŁ zmiany napięcia (|ΔU%| ≤ dopuszczalne), a nie
    # samą wartość ze znakiem: dobór ma odrzucić kabel zarówno przy zbyt dużym
    # spadku, jak i przy zbyt dużym wzroście. Domyślnie „generation", bo to jest
    # przelicznik toru DER; „load" zostawia zachowanie odbiorowe.
    flow_direction: str = "generation"
    reactive_character: str = "inductive"


@dataclass(frozen=True)
class CableProposal:
    """Propozycja kabla SN (najmniejszy przekrój spełniający obciążalność i ΔU)."""

    catalog_ref: str
    name: str
    cross_section_mm2: float
    rated_current_a: float
    delta_u_v: float
    delta_u_pct: float


@dataclass(frozen=True)
class CableSelectionResult:
    """Wynik doboru kabla SN — WHITE BOX: próg prądu + kandydaci odrzuceni z powodem."""

    proposal: CableProposal | None
    required_ampacity_a: float
    max_delta_u_pct: float
    rejected: tuple[RejectedCandidate, ...]
    error_code: str | None
    error_pl: str | None
    formula_ref: str = _CABLE_FORMULA_REF


def propose_mv_cable(data: CableSelectionInput) -> CableSelectionResult:
    """Dobierz najmniejszy przekrój kabla SN: I_z ≥ I_TR·(1+rezerwa) ORAZ ΔU% ≤ ΔU_dop.

    ΔU odcinka liczy ISTNIEJĄCY `compute_cable_voltage_drop` (reużycie przelicznika
    backendu). WHITE BOX: próg obciążalności, dopuszczalny ΔU, kandydaci odrzuceni
    (za mały przekrój / przekroczony ΔU). Brak kandydata ⇒ kod ❌ jak w kanonie.
    """
    if data.transformer_current_a <= 0.0:
        raise ValueError("Prąd znamionowy TR blokowego musi być dodatni.")
    if data.length_km <= 0.0:
        raise ValueError("Długość kabla musi być dodatnia.")
    if data.line_voltage_v <= 0.0:
        raise ValueError("Napięcie linii musi być dodatnie.")
    if not 0.0 < data.cos_phi <= 1.0:
        raise ValueError("Współczynnik mocy cosφ musi leżeć w zakresie (0, 1].")

    reserve = data.reserve_pu if data.reserve_pu >= 0 else 0.0
    required_ampacity = data.transformer_current_a * (1.0 + reserve)

    rejected: list[RejectedCandidate] = []
    eligible: list[tuple[CableCandidate, float, float]] = []

    for candidate in data.candidates:
        drop = compute_cable_voltage_drop(
            CableVoltageDropInput(
                current_a=data.transformer_current_a,
                length_km=data.length_km,
                r_ohm_per_km=candidate.r_ohm_per_km,
                x_ohm_per_km=candidate.x_ohm_per_km,
                cos_phi=data.cos_phi,
                line_voltage_v=data.line_voltage_v,
                flow_direction=data.flow_direction,
                reactive_character=data.reactive_character,
            )
        )
        if candidate.rated_current_a + _EPS < required_ampacity:
            rejected.append(
                RejectedCandidate(
                    candidate.catalog_ref,
                    candidate.name,
                    "przekroj_niewystarczajacy",
                    f"Obciążalność {candidate.rated_current_a:g} A poniżej progu "
                    f"{required_ampacity:g} A.",
                )
            )
            continue
        # |ΔU%| — kryterium obejmuje ZARÓWNO spadek, JAK I wzrost napięcia
        # (V12K-190). Dla toru DER wiążący jest zwykle wzrost.
        delta_u_pct_abs = abs(drop.delta_u_pct)
        if delta_u_pct_abs > data.max_delta_u_pct + _EPS:
            rejected.append(
                RejectedCandidate(
                    candidate.catalog_ref,
                    candidate.name,
                    "spadek_napiecia_przekroczony",
                    f"{'Wzrost' if drop.is_voltage_rise else 'Spadek'} napięcia "
                    f"{delta_u_pct_abs:g}% przekracza dopuszczalny "
                    f"{data.max_delta_u_pct:g}%.",
                )
            )
            continue
        eligible.append((candidate, drop.delta_u_v, drop.delta_u_pct))

    if not eligible:
        # Rozróżnij dominujący powód braku kandydata dla właściwego komunikatu ❌ kanonu.
        only_ampacity = all(r.reason_code == "przekroj_niewystarczajacy" for r in rejected)
        if rejected and only_ampacity:
            error_code = "converter.der_sn.dobor_kabel_przekroj_niewystarczajacy"
            error_pl = (
                f"❌ Przekrój niewystarczający — żaden kabel z katalogu nie osiąga obciążalności "
                f"{required_ampacity:g} A."
            )
        elif rejected:
            error_code = "converter.der_sn.dobor_kabel_spadek_przekroczony"
            error_pl = (
                f"❌ Przekroczony dopuszczalny ΔU — żaden kabel z katalogu nie mieści się w "
                f"{data.max_delta_u_pct:g}% dla tego odcinka."
            )
        else:
            error_code = "converter.der_sn.dobor_kabel_brak_kandydata"
            error_pl = "❌ Brak kabla SN w katalogu do doboru toru."
        return CableSelectionResult(
            proposal=None,
            required_ampacity_a=required_ampacity,
            max_delta_u_pct=data.max_delta_u_pct,
            rejected=tuple(rejected),
            error_code=error_code,
            error_pl=error_pl,
        )

    # Najmniejszy przekrój spełniający oba warunki; remis rozstrzyga ref (determinizm).
    best, best_delta_u_v, best_delta_u_pct = min(
        eligible, key=lambda item: (item[0].cross_section_mm2, item[0].catalog_ref)
    )
    return CableSelectionResult(
        proposal=CableProposal(
            catalog_ref=best.catalog_ref,
            name=best.name,
            cross_section_mm2=best.cross_section_mm2,
            rated_current_a=best.rated_current_a,
            delta_u_v=best_delta_u_v,
            delta_u_pct=best_delta_u_pct,
        ),
        required_ampacity_a=required_ampacity,
        max_delta_u_pct=data.max_delta_u_pct,
        rejected=tuple(rejected),
        error_code=None,
        error_pl=None,
    )


# ===========================================================================
# 3) DOBÓR APARATU GŁÓWNEGO POLA SN (wymaganie 11)
# ===========================================================================

_FIELD_FORMULA_REF = "In ≥ I_TR · (1 + rezerwa);  Un_aparatu ≥ napięcie sieci"


@dataclass(frozen=True)
class FieldApparatusCandidate:
    """Realny wpis katalogu aparatury SN jako kandydat doboru aparatu pola."""

    catalog_ref: str
    name: str
    equipment_kind: str
    un_kv: float
    in_a: float
    ik_ka: float | None = None


@dataclass(frozen=True)
class FieldApparatusSelectionInput:
    """Wejście doboru aparatu głównego pola SN."""

    transformer_current_a: float
    system_voltage_kv: float
    candidates: tuple[FieldApparatusCandidate, ...]
    reserve_pu: float = 0.0
    allowed_kinds: tuple[str, ...] = ("CIRCUIT_BREAKER", "LOAD_SWITCH")


@dataclass(frozen=True)
class FieldApparatusProposal:
    """Propozycja aparatu głównego pola SN (najmniejszy In spełniający próg)."""

    catalog_ref: str
    name: str
    equipment_kind: str
    un_kv: float
    in_a: float
    ik_ka: float | None


@dataclass(frozen=True)
class FieldApparatusSelectionResult:
    """Wynik doboru aparatu pola — WHITE BOX: próg prądu + kandydaci odrzuceni z powodem."""

    proposal: FieldApparatusProposal | None
    required_current_a: float
    rejected: tuple[RejectedCandidate, ...]
    error_code: str | None
    error_pl: str | None
    formula_ref: str = _FIELD_FORMULA_REF


def propose_mv_field_apparatus(
    data: FieldApparatusSelectionInput,
) -> FieldApparatusSelectionResult:
    """Dobierz aparat główny pola SN: In ≥ I_TR·(1+rezerwa), Un aparatu ≥ napięcie sieci,
    rodzaj z dozwolonych (domyślnie wyłącznik/rozłącznik).

    WHITE BOX: próg prądu + kandydaci odrzuceni (prąd niewystarczający / napięcie za niskie /
    rodzaj niewłaściwy). Twarda blokada „za słabego" aparatu należy do kaskady D1 — tu
    proponujemy LEPSZY aparat.
    """
    if data.transformer_current_a <= 0.0:
        raise ValueError("Prąd znamionowy TR blokowego musi być dodatni.")
    if data.system_voltage_kv <= 0.0:
        raise ValueError("Napięcie sieci musi być dodatnie.")

    reserve = data.reserve_pu if data.reserve_pu >= 0 else 0.0
    required_current = data.transformer_current_a * (1.0 + reserve)
    allowed = frozenset(data.allowed_kinds)

    rejected: list[RejectedCandidate] = []
    eligible: list[FieldApparatusCandidate] = []

    for candidate in data.candidates:
        if candidate.equipment_kind not in allowed:
            rejected.append(
                RejectedCandidate(
                    candidate.catalog_ref,
                    candidate.name,
                    "rodzaj_niewlasciwy",
                    f"Rodzaj aparatu „{candidate.equipment_kind}” nie nadaje się na aparat główny pola.",
                )
            )
            continue
        if candidate.un_kv + _EPS < data.system_voltage_kv:
            rejected.append(
                RejectedCandidate(
                    candidate.catalog_ref,
                    candidate.name,
                    "napiecie_aparatu_za_niskie",
                    f"Napięcie znamionowe aparatu {candidate.un_kv:g} kV poniżej napięcia sieci "
                    f"{data.system_voltage_kv:g} kV.",
                )
            )
            continue
        if candidate.in_a + _EPS < required_current:
            rejected.append(
                RejectedCandidate(
                    candidate.catalog_ref,
                    candidate.name,
                    "prad_niewystarczajacy",
                    f"Prąd znamionowy {candidate.in_a:g} A poniżej progu {required_current:g} A.",
                )
            )
            continue
        eligible.append(candidate)

    if not eligible:
        return FieldApparatusSelectionResult(
            proposal=None,
            required_current_a=required_current,
            rejected=tuple(rejected),
            error_code="converter.der_sn.dobor_pole_brak_kandydata",
            error_pl=(
                f"❌ Brak aparatu pola SN w katalogu dla progu {required_current:g} A przy "
                f"napięciu sieci {data.system_voltage_kv:g} kV."
            ),
        )

    # Najmniejszy In spełniający próg; remis rozstrzyga ref katalogu (determinizm).
    best = min(eligible, key=lambda c: (c.in_a, c.catalog_ref))
    return FieldApparatusSelectionResult(
        proposal=FieldApparatusProposal(
            catalog_ref=best.catalog_ref,
            name=best.name,
            equipment_kind=best.equipment_kind,
            un_kv=best.un_kv,
            in_a=best.in_a,
            ik_ka=best.ik_ka,
        ),
        required_current_a=required_current,
        rejected=tuple(rejected),
        error_code=None,
        error_pl=None,
    )


# Zestaw wzorów doboru reużywany przez ślad WHITE BOX warstwy API.
FORMULA_REFS: dict[str, str] = {
    "transformer": _TR_FORMULA_REF,
    "cable": _CABLE_FORMULA_REF,
    "field": _FIELD_FORMULA_REF,
}
