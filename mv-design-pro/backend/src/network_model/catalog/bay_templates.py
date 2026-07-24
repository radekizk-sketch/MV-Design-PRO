"""
BayTemplate — kanoniczne szablony pól rozdzielczych SN (PR-3 rebuild SLD).

Każdy szablon definiuje:
- kanoniczną sekwencję aparatury (Q-szynowy → CB → Q-liniowy → CT → ES → głowica),
- listę portów technicznych (Port) wymaganych dla pola,
- bay_role mapping na PortKind.

Brief 2 §6/9 + plan rebuild §3 + STATION_INTERNAL_SLD.md.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class BayDeviceTemplate(BaseModel):
    """Szablon aparatu w polu — kanoniczna pozycja i typ."""

    kind: Literal[
        "CB",  # wyłącznik
        "DS_BUS",  # odłącznik szynowy
        "DS_LINE",  # odłącznik liniowy
        "ES",  # uziemnik (boczny)
        "CT",  # przekładnik prądowy (w osi)
        "VT",  # przekładnik napięciowy (boczny)
        "FUSE",
        "SURGE_ARRESTER",  # ogranicznik przepięć
        "CABLE_HEAD",  # głowica kablowa (trójkąt)
        "TRANSFORMER_DEVICE",  # transformator pola
    ]
    designation_q: str  # oznaczenie Q (Q1, Q2, ...)
    position: int  # 0..n od góry do dołu
    placement: Literal["UPSTREAM", "MIDSTREAM", "DOWNSTREAM", "OFF_PATH", "GROUND_BRANCH"]
    optional: bool = False


class BayPortTemplate(BaseModel):
    """Szablon portu pola — wnioskowany z roli."""

    kind: Literal[
        "sn_input",
        "sn_output",
        "sn_branch",
        "sn_transformer",
        "sn_measurement",
        "sn_der_pv",
        "sn_der_bess",
        "sn_der_fw",
        "sn_coupler",
        "sn_reserve",
        "nn_feeder",
        "nn_load",
        "nn_der_pv",
        "nn_der_bess",
        "nn_der_fw",
    ]
    suffix: str  # sufiks dla port_id (np. "in", "out", "trafo")


class BayTemplate(BaseModel):
    """Kanoniczny szablon pola SN (PR-3 rebuild SLD).

    Reużywany przez Builder przy tworzeniu nowego pola w stacji / GPZ.
    """

    template_id: str
    name: str  # PL: "Pole liniowe wejściowe", "Pole transformatorowe", ...
    bay_role: Literal["IN", "OUT", "TR", "COUPLER", "FEEDER", "MEASUREMENT", "OZE"]
    description: str
    devices: list[BayDeviceTemplate] = Field(default_factory=list)
    ports: list[BayPortTemplate] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Kanoniczne 10 szablonów BayTemplate (brief 2 §3 + STATION_INTERNAL_SLD §3)
# ---------------------------------------------------------------------------

BAY_TEMPLATE_LINE_IN = BayTemplate(
    template_id="bay_template_line_in",
    name="Pole liniowe wejściowe",
    bay_role="IN",
    description="Pole liniowe wejściowe SN — kabel/linia od ciągu nadrzędnego.",
    devices=[
        BayDeviceTemplate(kind="DS_BUS", designation_q="Q1", position=0, placement="UPSTREAM"),
        BayDeviceTemplate(kind="CB", designation_q="Q0", position=1, placement="MIDSTREAM"),
        BayDeviceTemplate(kind="CT", designation_q="T1", position=2, placement="MIDSTREAM"),
        BayDeviceTemplate(kind="DS_LINE", designation_q="Q2", position=3, placement="DOWNSTREAM"),
        BayDeviceTemplate(kind="ES", designation_q="Q9", position=4, placement="GROUND_BRANCH"),
        BayDeviceTemplate(
            kind="CABLE_HEAD", designation_q="GK", position=5, placement="DOWNSTREAM"
        ),
    ],
    ports=[BayPortTemplate(kind="sn_input", suffix="in")],
)

BAY_TEMPLATE_LINE_OUT = BayTemplate(
    template_id="bay_template_line_out",
    name="Pole liniowe wyjściowe",
    bay_role="OUT",
    description="Pole liniowe wyjściowe SN — kabel/linia do ciągu podrzędnego.",
    devices=[
        BayDeviceTemplate(kind="DS_BUS", designation_q="Q1", position=0, placement="UPSTREAM"),
        BayDeviceTemplate(kind="CB", designation_q="Q0", position=1, placement="MIDSTREAM"),
        BayDeviceTemplate(kind="CT", designation_q="T1", position=2, placement="MIDSTREAM"),
        BayDeviceTemplate(kind="DS_LINE", designation_q="Q2", position=3, placement="DOWNSTREAM"),
        BayDeviceTemplate(kind="ES", designation_q="Q9", position=4, placement="GROUND_BRANCH"),
        BayDeviceTemplate(
            kind="CABLE_HEAD", designation_q="GK", position=5, placement="DOWNSTREAM"
        ),
    ],
    ports=[BayPortTemplate(kind="sn_output", suffix="out")],
)

# Kanoniczny zestaw funkcji zabezpieczeniowych pola transformatorowego SN/WN
# (ANSI/IEC), wyświetlany na SLD przez Bay.protection_codes — lustro mechanizmu
# OzeField.protection_codes. Zawiera: różnicowe 87T + nadprądowe 51/50 +
# ziemnozwarciowe 51N + mechaniczne transformatora (Buchholz / temperatura /
# ciśnienie), które wyzwalają wyłącznik pola Q0. Stringi, NIE enum — deterministyczne.
TRANSFORMER_BAY_PROTECTION_CODES: list[str] = [
    "87T",
    "51",
    "50",
    "51N",
    "Buchholz",
    "temp",
    "ciśnienie",
]

# Kanoniczny interfejs przyłączeniowy źródła OZE/DER (NC RfG / PTPiREE) — zestaw pola
# źródłowego SN. Kierunkowe nadprądowe (67/67N), napięciowe (27/59), częstotliwościowe
# (81U/81O), ROCOF (df/dt) i ochrona przed pracą wyspową (anti-islanding). PEŁNA ochrona
# maszyny (87G, 40, 32, 64, 46, 21/25) mieszka na source.protection, NIE na polu interfejsu.
# Lustro `_PROTECTION_BY_MACHINE["IBG"]` z reference_networks (jedno źródło kanonu interfejsu).
OZE_INTERFACE_BAY_PROTECTION_CODES: list[str] = [
    "67",
    "67N",
    "27",
    "59",
    "81U",
    "81O",
    "df/dt",
    "anti-islanding",
]

# Kanoniczne wymagane funkcje zabezpieczeniowe (ANSI/IEC 60255) per rola pola SN — wg
# praktyki krajowej (PTPiREE/IRiESD) i norm. Deterministyczne stringi (NIE enum), lustro
# mechanizmu `TRANSFORMER_BAY_PROTECTION_CODES`. Wyprowadzane na `Bay.protection_codes`
# (glify SLD + read-model pola + wejście dla LoM/koordynacji), gdy szablon producenta nie
# dostarcza własnych `protection_requirements` (te mają pierwszeństwo). Pole pomiarowe nie
# wyzwala — puste (uczciwy brak, nie fabrykacja). Zero heurystyk: to WYMAGANIA funkcji, nie
# obliczenia fizyczne (te pozostają w solverach/koordynacji).
BAY_PROTECTION_CODES_BY_ROLE: dict[str, list[str]] = {
    # Pole dopływowe/zasilające (incomer): nadprądowe zwłoczne+bezzwłoczne + ziemnozwarciowe.
    "IN": ["51", "50", "51N"],
    # Pole odpływowe (feeder): + kierunkowe ziemnozwarciowe (sieci skompensowane/izolowane).
    "OUT": ["51", "50", "51N", "67N"],
    # Pole liniowe/odgałęźne — jak odpływowe.
    "FEEDER": ["51", "50", "51N", "67N"],
    # Pole transformatorowe — reużycie istniejącego kanonu (różnicowe + nadprądowe + mech.).
    "TR": list(TRANSFORMER_BAY_PROTECTION_CODES),
    # Pole sprzęgła sekcji: nadprądowe.
    "COUPLER": ["51", "50"],
    # Pole pomiarowe: brak funkcji wyzwalających (tor VT) — uczciwie puste.
    "MEASUREMENT": [],
    # Pole źródłowe OZE/DER: interfejs przyłączeniowy NC RfG.
    "OZE": list(OZE_INTERFACE_BAY_PROTECTION_CODES),
}


def protection_codes_for_bay_role(bay_role: str) -> list[str]:
    """Kanoniczne wymagane funkcje zabezpieczeniowe dla roli pola (pusta gdy brak w kanonie)."""
    return list(BAY_PROTECTION_CODES_BY_ROLE.get(bay_role, []))


BAY_TEMPLATE_TRANSFORMER = BayTemplate(
    template_id="bay_template_transformer",
    name="Pole transformatorowe",
    bay_role="TR",
    description="Pole transformatorowe SN — przyłączenie transformatora SN/nN.",
    devices=[
        BayDeviceTemplate(kind="DS_BUS", designation_q="Q1", position=0, placement="UPSTREAM"),
        BayDeviceTemplate(kind="CB", designation_q="Q0", position=1, placement="MIDSTREAM"),
        BayDeviceTemplate(kind="CT", designation_q="T1", position=2, placement="MIDSTREAM"),
        BayDeviceTemplate(kind="DS_LINE", designation_q="Q2", position=3, placement="DOWNSTREAM"),
        BayDeviceTemplate(kind="ES", designation_q="Q9", position=4, placement="GROUND_BRANCH"),
        BayDeviceTemplate(
            kind="TRANSFORMER_DEVICE", designation_q="TR", position=5, placement="DOWNSTREAM"
        ),
    ],
    ports=[BayPortTemplate(kind="sn_transformer", suffix="trafo")],
)

BAY_TEMPLATE_MEASUREMENT = BayTemplate(
    template_id="bay_template_measurement",
    name="Pole pomiarowe",
    bay_role="MEASUREMENT",
    description="Pole pomiarowe SN — boczny tor pomiarowy z przekładnikami napięciowymi.",
    devices=[
        BayDeviceTemplate(kind="DS_BUS", designation_q="Q1", position=0, placement="UPSTREAM"),
        BayDeviceTemplate(kind="VT", designation_q="T2", position=1, placement="OFF_PATH"),
        BayDeviceTemplate(kind="ES", designation_q="Q9", position=2, placement="GROUND_BRANCH"),
    ],
    ports=[BayPortTemplate(kind="sn_measurement", suffix="meas")],
)

BAY_TEMPLATE_COUPLER = BayTemplate(
    template_id="bay_template_coupler",
    name="Pole sprzęgłowe",
    bay_role="COUPLER",
    description="Sprzęgło sekcyjne — łącznik dwóch sekcji szyny SN.",
    devices=[
        BayDeviceTemplate(kind="DS_BUS", designation_q="Q1", position=0, placement="UPSTREAM"),
        BayDeviceTemplate(kind="CB", designation_q="Q0", position=1, placement="MIDSTREAM"),
        BayDeviceTemplate(kind="DS_BUS", designation_q="Q2", position=2, placement="DOWNSTREAM"),
        BayDeviceTemplate(kind="ES", designation_q="Q9", position=3, placement="GROUND_BRANCH"),
    ],
    ports=[
        BayPortTemplate(kind="sn_coupler", suffix="left"),
        BayPortTemplate(kind="sn_coupler", suffix="right"),
    ],
)

BAY_TEMPLATE_DER_PV = BayTemplate(
    template_id="bay_template_der_pv",
    name="Pole źródłowe PV",
    bay_role="OZE",
    description="Pole źródłowe SN dla farmy PV — przyłączenie inwerterów + transformatora.",
    devices=[
        BayDeviceTemplate(kind="DS_BUS", designation_q="Q1", position=0, placement="UPSTREAM"),
        BayDeviceTemplate(kind="CB", designation_q="Q0", position=1, placement="MIDSTREAM"),
        BayDeviceTemplate(kind="CT", designation_q="T1", position=2, placement="MIDSTREAM"),
        BayDeviceTemplate(kind="VT", designation_q="T2", position=3, placement="OFF_PATH"),
        BayDeviceTemplate(kind="DS_LINE", designation_q="Q2", position=4, placement="DOWNSTREAM"),
        BayDeviceTemplate(kind="ES", designation_q="Q9", position=5, placement="GROUND_BRANCH"),
        BayDeviceTemplate(
            kind="CABLE_HEAD", designation_q="GK", position=6, placement="DOWNSTREAM"
        ),
    ],
    ports=[BayPortTemplate(kind="sn_der_pv", suffix="pv")],
)

BAY_TEMPLATE_DER_BESS = BayTemplate(
    template_id="bay_template_der_bess",
    name="Pole źródłowe BESS",
    bay_role="OZE",
    description="Pole źródłowe SN dla magazynu energii BESS — PCS + transformator.",
    devices=BAY_TEMPLATE_DER_PV.devices.copy(),
    ports=[BayPortTemplate(kind="sn_der_bess", suffix="bess")],
)

BAY_TEMPLATE_DER_FW = BayTemplate(
    template_id="bay_template_der_fw",
    name="Pole źródłowe FW",
    bay_role="OZE",
    description="Pole źródłowe SN dla farmy wiatrowej — kable kolektorowe + transformator główny.",
    devices=BAY_TEMPLATE_DER_PV.devices.copy(),
    ports=[BayPortTemplate(kind="sn_der_fw", suffix="fw")],
)

BAY_TEMPLATE_RESERVE = BayTemplate(
    template_id="bay_template_reserve",
    name="Pole rezerwowe",
    bay_role="FEEDER",
    description="Pole rezerwowe — przygotowane miejsce dla przyszłego przyłączenia.",
    devices=[
        BayDeviceTemplate(kind="DS_BUS", designation_q="Q1", position=0, placement="UPSTREAM"),
        BayDeviceTemplate(kind="ES", designation_q="Q9", position=1, placement="GROUND_BRANCH"),
    ],
    ports=[BayPortTemplate(kind="sn_reserve", suffix="reserve")],
)

BAY_TEMPLATE_AUX = BayTemplate(
    template_id="bay_template_aux",
    name="Pole potrzeb własnych",
    bay_role="FEEDER",
    description="Pole potrzeb własnych stacji — zasilanie urządzeń pomocniczych.",
    devices=[
        BayDeviceTemplate(kind="DS_BUS", designation_q="Q1", position=0, placement="UPSTREAM"),
        BayDeviceTemplate(kind="FUSE", designation_q="F1", position=1, placement="MIDSTREAM"),
        BayDeviceTemplate(kind="ES", designation_q="Q9", position=2, placement="GROUND_BRANCH"),
    ],
    ports=[BayPortTemplate(kind="sn_reserve", suffix="aux")],
)


BAY_TEMPLATE_REGISTRY: dict[str, BayTemplate] = {
    t.template_id: t
    for t in [
        BAY_TEMPLATE_LINE_IN,
        BAY_TEMPLATE_LINE_OUT,
        BAY_TEMPLATE_TRANSFORMER,
        BAY_TEMPLATE_MEASUREMENT,
        BAY_TEMPLATE_COUPLER,
        BAY_TEMPLATE_DER_PV,
        BAY_TEMPLATE_DER_BESS,
        BAY_TEMPLATE_DER_FW,
        BAY_TEMPLATE_RESERVE,
        BAY_TEMPLATE_AUX,
    ]
}


# ---------------------------------------------------------------------------
# W1 (RECENZJA_L2 §1/§12, V12K-145): materializacja aparatów PIERWOTNYCH pola
# (Bay.primary_devices, spec §12.1) z kanonicznego szablonu pola. „Schemat =
# bezpośrednie odwzorowanie konfiguracji kreatora" — szablon wybrany w kreatorze
# JEST daną projektową, więc jego stos aparatów spływa na field_spc i dalej na
# SLD (adapter → scena, tor pierwotny Z DANYCH zamiast jednego fallbacku §12.4).
# ---------------------------------------------------------------------------

# Mapowanie typu aparatu SZABLONU (BayDeviceTemplate.kind) → typu aparatu
# PIERWOTNEGO pola (BayPrimaryDevice.kind, spec §12.1). DS_BUS/DS_LINE to warianty
# POŁOŻENIA jednego typu „odłącznik" (DS) — glif SLD ten sam, rozróżnia je
# `placement` (UPSTREAM vs DOWNSTREAM). Zero fabrykacji: 1:1, jawne, z komentarzem.
_TEMPLATE_DEVICE_KIND_TO_PRIMARY_KIND: dict[str, str] = {
    "CB": "CB",
    "DS_BUS": "DS",
    "DS_LINE": "DS",
    "ES": "ES",
    "CT": "CT",
    "VT": "VT",
    "FUSE": "FUSE",
    "SURGE_ARRESTER": "SURGE_ARRESTER",
    "CABLE_HEAD": "CABLE_HEAD",
    "TRANSFORMER_DEVICE": "TRANSFORMER_DEVICE",
}

# Aparaty łączeniowe toru (sterowalne, ze stanem otwarty/zamknięty).
_SWITCHABLE_PRIMARY_KINDS: frozenset[str] = frozenset({"CB", "LOAD_SWITCH", "DS"})


def _main_apparatus_primary_kind(apparatus_kind: str | None) -> str | None:
    """Wybór GŁÓWNEGO aparatu łączeniowego pola z kreatora (`apparatus_kind`)
    → typ aparatu pierwotnego. Pole wyłącznikowe (CB) vs rozłącznikowe
    (LOAD_SWITCH/DS/FUSE). `None` = brak jawnego wyboru (zostaje typ z szablonu).
    """
    normalized = apparatus_kind.strip().upper() if isinstance(apparatus_kind, str) else ""
    if normalized in {"DISCONNECTOR", "DS", "ODLACZNIK", "ODŁĄCZNIK"}:
        return "DS"
    if normalized in {"LOAD_SWITCH", "LS", "ROZLACZNIK", "ROZŁĄCZNIK"}:
        return "LOAD_SWITCH"
    if normalized in {"FUSE", "FUSE_SWITCH", "ROZLACZNIK_BEZPIECZNIKOWY", "BEZPIECZNIK"}:
        return "FUSE"
    if normalized in {"CB", "BREAKER", "WYLACZNIK", "WYŁĄCZNIK"}:
        return "CB"
    return None


def template_primary_devices(
    template_id: str | None,
    *,
    field_ref: str,
    main_apparatus_kind: str | None = None,
) -> list[dict[str, Any]]:
    """Materializuje listę aparatów pierwotnych pola (Bay.primary_devices, spec
    §12.1) z kanonicznego szablonu `BayTemplate.devices`. Kolejność = pozycja w
    szablonie (od szyny w dół: UPSTREAM → … → głowica). `device_ref`
    DETERMINISTYCZNY (`field_ref` + pozycja) — zero losowości/seedu, ten sam
    wynik dla tego samego pola. Zwraca `[]`, gdy szablon nieznany/brak
    (wsteczna zgodność: pole bez danych → ścieżka konwencji §12.4 na SLD).

    `main_apparatus_kind` (opcjonalny wybór z kreatora): nadpisuje typ GŁÓWNEGO
    aparatu łączeniowego (CB szablonu) — pole wyłącznikowe (CB) vs rozłącznikowe
    (LOAD_SWITCH/DS/FUSE). Pozostałe aparaty (CT/ES/głowica/TR/VT/SA) bez zmian.
    """
    if not template_id:
        return []
    template = BAY_TEMPLATE_REGISTRY.get(template_id)
    if template is None:
        return []
    override = _main_apparatus_primary_kind(main_apparatus_kind)
    devices: list[dict[str, Any]] = []
    for device in template.devices:
        primary_kind = _TEMPLATE_DEVICE_KIND_TO_PRIMARY_KIND.get(device.kind)
        if primary_kind is None:
            continue
        # Nadpisanie GŁÓWNEGO łącznika pola (CB szablonu) wyborem kreatora.
        if primary_kind == "CB" and override is not None:
            primary_kind = override
        entry: dict[str, Any] = {
            "device_ref": f"{field_ref}::dev::{device.position}",
            "symbol_ref": f"symbol:{primary_kind.lower()}",
            "kind": primary_kind,
            "placement": device.placement,
            "is_controllable": primary_kind in _SWITCHABLE_PRIMARY_KINDS,
            "render_variant": "kanoniczny",
            "designation": device.designation_q,
        }
        if primary_kind == "ES":
            # Uziemnik pola (typologia §12.5) — odróżnia go od uziemienia ekranów
            # kabla/konstrukcji/punktu neutralnego. Szablon to uziemnik pola.
            entry["earthing_role"] = "field_earth"
        devices.append(entry)
    return devices


# ---------------------------------------------------------------------------
# W2b-DANE (POLECENIE_DER_SN_TOPOLOGIA_2026-07): materializacja aparatów
# PIERWOTNYCH dedykowanego POLA ŹRÓDŁOWEGO SN dla DER przyłączonego po stronie
# SN — sterowana JAWNĄ konfiguracją pola z kreatora (mvFieldConfiguration), a nie
# stałym szablonem. Każda kontrolka kreatora (switchingDevice / ct / vt /
# earthingSwitch / surgeArrester / cableHead) mapuje 1:1 na obecność aparatu
# pierwotnego — zero fabrykacji (phantom rule): odznaczenie CT realnie usuwa CT.
# Kanoniczna KOLEJNOŚĆ i oznaczenia Q są lustrem `BAY_TEMPLATE_DER_PV` (jedno
# źródło porządku pola źródłowego); protection_relay mapuje na Bay.protection_codes
# (NIE na aparat pierwotny) przez `protection_codes_for_bay_role("OZE")`.
# ---------------------------------------------------------------------------


def mv_source_field_primary_devices(
    field_ref: str,
    *,
    switching_device: str = "CB",
    ct: bool = True,
    vt: bool = False,
    earthing_switch: bool = True,
    surge_arrester: bool = False,
    cable_head: bool = True,
) -> list[dict[str, Any]]:
    """Aparaty pierwotne pola źródłowego SN wg jawnej konfiguracji (kreator DER-SN).

    Struktura stała toru (odłącznik szynowy Q1, główny łącznik Q0, odłącznik
    liniowy Q2) jest zawsze obecna — to szkielet pola, nie przełącznik UI.
    Aparaty opcjonalne (CT/VT/uziemnik/ogranicznik/głowica) pojawiają się WYŁĄCZNIE
    gdy konfiguracja tak stanowi. `switching_device` różnicuje pole wyłącznikowe
    (CB) od rozłącznikowego (LBS→LOAD_SWITCH). `device_ref` deterministyczny
    (`field_ref` + pozycja) — ten sam wynik dla tego samego pola, zero seedu.
    """
    main_kind = (
        "LOAD_SWITCH" if str(switching_device).strip().upper() in {"LBS", "LOAD_SWITCH"} else "CB"
    )

    plan: list[tuple[str, str, str]] = [
        ("DS", "Q1", "UPSTREAM"),  # odłącznik szynowy — szkielet pola
        (main_kind, "Q0", "MIDSTREAM"),  # główny aparat łączeniowy (CB/LBS)
    ]
    if ct:
        plan.append(("CT", "T1", "MIDSTREAM"))
    if vt:
        plan.append(("VT", "T2", "OFF_PATH"))
    plan.append(("DS", "Q2", "DOWNSTREAM"))  # odłącznik liniowy — szkielet pola
    if earthing_switch:
        plan.append(("ES", "Q9", "GROUND_BRANCH"))
    if surge_arrester:
        plan.append(("SURGE_ARRESTER", "Z1", "GROUND_BRANCH"))
    if cable_head:
        plan.append(("CABLE_HEAD", "GK", "DOWNSTREAM"))

    devices: list[dict[str, Any]] = []
    for position, (kind, designation, placement) in enumerate(plan):
        entry: dict[str, Any] = {
            "device_ref": f"{field_ref}::dev::{position}",
            "symbol_ref": f"symbol:{kind.lower()}",
            "kind": kind,
            "placement": placement,
            "is_controllable": kind in _SWITCHABLE_PRIMARY_KINDS,
            "render_variant": "kanoniczny",
            "designation": designation,
        }
        if kind == "ES":
            entry["earthing_role"] = "field_earth"
        elif kind == "SURGE_ARRESTER":
            # Ogranicznik przepięć to odgałęzienie DO ZIEMI (uwaga 6) — niesie
            # `earthing_role` spójnie z mostem producenckim i macierzą W1b.
            entry["earthing_role"] = "surge_ground"
        devices.append(entry)
    return devices


def get_bay_template(template_id: str) -> BayTemplate:
    """Pobiera kanoniczny szablon pola po ID. Raises KeyError if not found."""

    if template_id not in BAY_TEMPLATE_REGISTRY:
        available = ", ".join(sorted(BAY_TEMPLATE_REGISTRY.keys()))
        raise KeyError(f"Unknown bay_template_id: {template_id}. Available: {available}")
    return BAY_TEMPLATE_REGISTRY[template_id]


def list_bay_templates() -> list[BayTemplate]:
    """Lista wszystkich kanonicznych szablonów pola (deterministyczna kolejność)."""

    return sorted(BAY_TEMPLATE_REGISTRY.values(), key=lambda t: t.template_id)


# ---------------------------------------------------------------------------
# W1c (RECENZJA_MACIERZ_WYPOSAZENIA_2026-07 uwagi 10/15/16/17): ENUMERACJA
# KANONICZNA katalogu konfiguracji pól. Macierz wyposażenia jest TESTEM
# REFERENCYJNYM SILNIKA generowanym Z KATALOGU (uwaga 16), nie z ręcznej listy
# przykładów (uwaga 17). Źródłem przypadków jest ta enumeracja: KAŻDY kanoniczny
# szablon (`BAY_TEMPLATE_REGISTRY`) + warianty pola źródłowego SN (W2b,
# `mv_source_field_primary_devices`) staje się przypadkiem macierzy. Most
# producencki (`cell_configurations` → `primary_devices`) dokłada
# `reference_engine.field_configuration_catalog` (warstwa, która może zależeć od
# katalogu producentów) — tu WYŁĄCZNIE kanon, bez zależności od reference_engine.
# ---------------------------------------------------------------------------

# Grupowanie funkcjonalne konfiguracji (uwaga 15): sekcje macierzy dowodowej i
# testu. Wyprowadzone z ROLI pola (`BayTemplate.bay_role`) — dana katalogowa, nie
# domysł. FEEDER (rezerwowe / potrzeb własnych) → „specjalne".
_FUNCTIONAL_GROUP_BY_ROLE: dict[str, str] = {
    "IN": "liniowe",
    "OUT": "liniowe",
    "FEEDER": "specjalne",
    "TR": "transformatorowe",
    "COUPLER": "sprzeglowe",
    "MEASUREMENT": "pomiarowe",
    "OZE": "OZE",
}

# Mapowanie roli pola → rola pola we frontendowym read-modelu (`field_role`,
# `enmToSldAdapter`). Lustro mapowania roli macierzy W1 (LINIA_IN /
# TRANSFORMATOROWE) — potrzebne generatorowi macierzy do ustawienia roli pola
# hosta (render podąża za DANYMI, nie za rolą — uwaga 10, ale rola jest metadaną).
_FIELD_ROLE_BY_BAY_ROLE: dict[str, str] = {
    "IN": "LINIA_IN",
    "OUT": "LINIA_OUT",
    "FEEDER": "FEEDER",
    "TR": "TRANSFORMATOROWE",
    "COUPLER": "SPRZEGLO",
    "MEASUREMENT": "POMIAROWE",
    "OZE": "OZE",
}


def functional_group_for_role(bay_role: str) -> str:
    """Grupa funkcjonalna macierzy (uwaga 15) dla roli pola. Domyślnie „specjalne"."""
    return _FUNCTIONAL_GROUP_BY_ROLE.get(bay_role, "specjalne")


def config_ref_for_template(template_id: str) -> str:
    """Stabilny identyfikator konfiguracji KANONICZNEJ (uwaga 10) — deterministyczny,
    wyprowadzony z ref szablonu. Prefiks `kanoniczny:` odróżnia od mostu
    producenckiego (`producent:<pack>:<cell>`). NIE zależy od stanu aparatu —
    wariant stanu (zamknięty/otwarty) dokłada konsument (`<config_ref>::<stan>`).
    """
    return f"kanoniczny:{template_id}"


def config_ref_for_mv_source(switching_device: str) -> str:
    """Stabilny identyfikator konfiguracji pola źródłowego SN (W2b) — kanoniczny."""
    main = "lbs" if str(switching_device).strip().upper() in {"LBS", "LOAD_SWITCH"} else "cb"
    return f"kanoniczny:mv_source_{main}"


def _canonical_config_entry(template: BayTemplate) -> dict[str, Any]:
    """Jeden przypadek macierzy z kanonicznego szablonu pola (uwaga 16)."""
    config_ref = config_ref_for_template(template.template_id)
    primary_devices = template_primary_devices(template.template_id, field_ref=config_ref)
    return {
        "config_ref": config_ref,
        "source": "kanoniczny",
        "group": functional_group_for_role(template.bay_role),
        "bay_role": template.bay_role,
        "field_role": _FIELD_ROLE_BY_BAY_ROLE.get(template.bay_role, template.bay_role),
        "template_id": template.template_id,
        "name": template.name,
        "primary_devices": primary_devices,
        "protection_codes": protection_codes_for_bay_role(template.bay_role),
    }


def _mv_source_config_entry(
    *, switching_device: str, ct: bool, vt: bool, surge_arrester: bool
) -> dict[str, Any]:
    """Przypadek macierzy z pola źródłowego SN (W2b) — jawna konfiguracja DER-SN."""
    config_ref = config_ref_for_mv_source(switching_device)
    name = (
        "Pole źródłowe SN (wyłącznikowe)"
        if config_ref.endswith("cb")
        else "Pole źródłowe SN (rozłącznikowe)"
    )
    primary_devices = mv_source_field_primary_devices(
        config_ref,
        switching_device=switching_device,
        ct=ct,
        vt=vt,
        earthing_switch=True,
        surge_arrester=surge_arrester,
        cable_head=True,
    )
    return {
        "config_ref": config_ref,
        "source": "kanoniczny",
        "group": "OZE",
        "bay_role": "OZE",
        "field_role": "OZE",
        "template_id": None,
        "name": name,
        "primary_devices": primary_devices,
        "protection_codes": protection_codes_for_bay_role("OZE"),
    }


def enumerate_canonical_configurations() -> list[dict[str, Any]]:
    """Enumeracja KANONICZNA katalogu konfiguracji pól (uwaga 16/17): każdy szablon
    `BAY_TEMPLATE_REGISTRY` + dwa warianty pola źródłowego SN (W2b). Deterministyczna
    kolejność (config_ref) — ten sam wynik przy każdym wywołaniu. Zwraca listę
    słowników (JSON-serializowalnych) z `config_ref` (uwaga 10), grupą funkcjonalną
    (uwaga 15), rolą pola i zmaterializowanymi `primary_devices` (tor pierwotny).
    """
    entries: list[dict[str, Any]] = [_canonical_config_entry(t) for t in list_bay_templates()]
    entries.append(
        _mv_source_config_entry(switching_device="CB", ct=True, vt=False, surge_arrester=True)
    )
    entries.append(
        _mv_source_config_entry(switching_device="LBS", ct=True, vt=True, surge_arrester=True)
    )
    return sorted(entries, key=lambda e: str(e["config_ref"]))


# Typy pól z uwagi 9 (RECENZJA_MACIERZ_WYPOSAZENIA), które NIE mają szablonu w
# katalogu — jawny rejestr braków (zero fabrykacji: nie wymyślamy szablonu,
# którego katalog nie niesie). Bateria kondensatorów i generator synchroniczny
# (odróżniony od źródła OZE inwerterowego) czekają na decyzję danych/domeny.
FIELD_TYPES_WITHOUT_TEMPLATE: list[str] = [
    "bateria_kondensatorow",
    "generator_synchroniczny",
]
