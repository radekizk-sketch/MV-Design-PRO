"""Most model → wejście solvera NC RfG / PTPiREE (karta S-3 W6-0; dawniej V12K-087).

Buduje ``NcRfgPtpireeModuleInput`` (kontrakt solvera kanonicznego
``network_model/solvers/ncrfg_ptpiree``, B-01 — nietknięty) z kanonicznego
generatora ENM, żeby JEDYNA implementacja zgodności NC RfG liczyła z DANYCH
MODELU: trasa ``GET /api/ncrfg-tests/cases/{case_id}/compliance`` uruchamia TEN
SAM ``NcRfgPtpireeSolver``, który zasila bieg macierzy ``POST /api/ncrfg-tests/run``.
Drugi silnik (``checker.py``: 18 testów T1–T18 z własną numeracją, werdykt
„brak modułu", ``NcRfgComplianceReport``) skasowany kartą S-3 — bramka
wskrzeszenia w ``scripts/legacy_public_path_guard.py``.

ZERO FABRYKACJI. Brak danej w modelu = ``False``/``None`` w wejściu → solver
daje ``no_data`` (test wymagany) albo ``not_required``; nigdy wartość
domyślna. Reużycie zamiast równoległej ścieżki: te same pola, które
konfiguruje kreator OZE (Regulacja) i konfigurator wiązań DER
(``set_der_catalog_bindings``), zasilają zgodność.

INWENTARZ PÓL WEJŚCIA SOLVERA × ŹRÓDŁO W MODELU (KLASA, NIE INSTANCJA — każde
pole ``NcRfgPtpireeModuleInput`` ma tu jawny wiersz; test
``test_most_nazywa_kazde_pole_wejscia_solvera`` pilnuje, że nowe pole kontraktu
solvera nie zostanie pominięte milcząco):

- ``der_ref``            ← ``generator.ref_id``
- ``der_name``           ← ``generator.name``
- ``der_kind``           ← ``generator.gen_type`` (``_DER_KIND_Z_GEN_TYPE``, komplet
                            ``GEN_TYPES_PRZEKSZTALTNIKOWE``)
- ``module_family``      ← ``"PPM"`` — każdy typ przekształtnikowy jest modułem
                            parku mocy; ``SyPGM`` to generator synchroniczny, poza
                            klasą DER tego mostu
- ``operator_id``        ← parametr trasy (wybór projektanta)
- ``p_max_kw``           ← ``|generator.p_mw|`` → kW (moc zmaterializowana, z liczbą
                            jednostek); ``<= 0`` → DER pominięty z powodem ``brak_mocy``
- ``p_min_kw``           ← BRAK W MODELU → ``None``
- ``voltage_kv``         ← napięcie szyny przyłączenia (``enm.buses[bus_ref]``);
                            brak/``<= 0`` → DER pominięty z powodem ``brak_napiecia``
- ``certificate_status`` ← tabliczka (``materialized_params``): ``ptpiree_status ==
                            "POWIAZANY"`` albo niepusta ``ptpiree_certificate_ref``
                            → ``"ptpiree_verified"``; inaczej ``"unknown"``
- ``has_lvrt_curve``     ← ``meta.has_lvrt_curve`` (deklaracja kreatora OZE) LUB
                            ``materialized_params.profiles.lvrt_curve_ref`` (wiązanie)
- ``has_hvrt_curve``     ← ``meta.has_hvrt_curve`` LUB ``profiles.hvrt_curve_ref``
- ``has_pf_droop``       ← ``meta.frequency_droop_percent > 0`` LUB ``profiles.pf_curve_ref``
- ``has_qu_curve``       ← ``meta.qu_slope_pu_per_pu > 0`` LUB ``meta.control_mode``
                            ∈ ``_QU_CONTROL_MODES``
- ``has_dynamic_model``  ← ``materialized_params.dynamic_model_ref`` (wiązanie profilu
                            dynamicznego ``network_model.catalog.der_dynamic``)
- ``has_scada_communication``, ``has_disturbance_recorder`` ← BRAK W MODELU → ``False``
                            (stan komunikacji i rejestratora pola to migawka RUCHOWA
                            ``BayRuntimeState``/``DisturbanceRecorderState``, nie
                            deklaracja projektowa zdolności modułu)
- ``active_power_control_enabled`` ← BRAK W MODELU → ``False``
- ``stop_generation_enabled``      ← BRAK W MODELU → ``False``
- ``reduction_generation_enabled`` ← BRAK W MODELU → ``False``
- ``island_operation_required``    ← BRAK W MODELU → ``False``
- ``island_operation_capable``     ← BRAK W MODELU → ``False``
- ``black_start_required``         ← BRAK W MODELU → ``False``
- ``black_start_capable``          ← BRAK W MODELU → ``False``
- ``power_oscillation_damping_required`` ← BRAK W MODELU → ``False``
- ``power_oscillation_damping_enabled``  ← BRAK W MODELU → ``False``
- ``droop_percent``      ← ``meta.frequency_droop_percent`` (``> 0``)
- ``dead_band_hz``       ← ``meta.lfsm_deadband_hz`` (``>= 0``)
- ``ramp_rate_pct_per_min`` ← BRAK W MODELU → ``None``
- ``cos_phi_min``        ← ``meta.cos_phi`` (``0 < x <= 1``; deklarowany cosφ modułu
                            z kreatora OZE / tabliczki katalogu)
- ``q_range_pct_pn_min`` ← ``meta.q_min_mvar`` w bazie ``|p_mw|``
                            (``pochodne.udzial_mocy_biernej_pu``; ta sama baza
                            całkowita co granice węzła PV w ``enm/assembler.py``)
- ``q_range_pct_pn_max`` ← ``meta.q_max_mvar`` w bazie ``|p_mw|`` (jw.)
- ``reactive_current_gain`` ← BRAK W MODELU → ``None``
- ``p_recovery_time_s``  ← BRAK W MODELU → ``None``
- ``harmonic_thdu_percent`` ← BRAK W MODELU → ``None`` (karta katalogowa niesie
                            widmo prądu ``harmonic_spectrum_percent``, nie THD_U)
"""

from __future__ import annotations

from typing import Any, Literal

from enm.models import GEN_TYPES_PRZEKSZTALTNIKOWE, EnergyNetworkModel, Generator
from network_model.pochodne import mw_na_kw, udzial_mocy_biernej_pu
from network_model.solvers.ncrfg_ptpiree import NcRfgPtpireeModuleInput
from pydantic import BaseModel

PowodPominieciaDer = Literal["brak_mocy", "brak_napiecia"]

#: Jedno zrodlo prawdy predykatu DER: enm/models.py (obok Literalu gen_type).
_INVERTER_GEN_TYPES = GEN_TYPES_PRZEKSZTALTNIKOWE

#: gen_type ENM → rodzaj modułu solvera. KOMPLET ``GEN_TYPES_PRZEKSZTALTNIKOWE``
#: (przypięte testem) — brak wiersza dla nowego typu byłby cichym pominięciem DER.
_DER_KIND_Z_GEN_TYPE: dict[str, Literal["PV", "BESS", "FW", "OTHER"]] = {
    "pv_inverter": "PV",
    "bess": "BESS",
    "wind_inverter": "FW",
    "fw_pmsg": "FW",
    "fw_dfig": "FW",
    "fw_scig": "FW",
}
_QU_CONTROL_MODES = {"Q_OD_U", "Q_U", "VOLT_VAR"}

_POWOD_POMINIECIA_PL: dict[PowodPominieciaDer, str] = {
    "brak_mocy": "Moc czynna modułu w modelu nie jest dodatnia — solver nie ma czego klasyfikować.",
    "brak_napiecia": (
        "Szyna przyłączenia modułu nie istnieje w modelu albo nie ma napięcia znamionowego."
    ),
}


class NcRfgDerPominiety(BaseModel):
    """DER modelu, którego solver NIE może objąć biegiem — jawny powód, nie cisza.

    Ten sam słownik powodów, co blokada modułu w macierzy frontendu
    (``ui2/oze/macierz/macierzModel.ts::PowodBlokady``): brak mocy albo brak
    napięcia przyłączenia. Solver wymaga ``p_max_kw > 0`` i ``voltage_kv > 0``
    (kontrakt B-01) — zamiast fabrykować liczbę, DER trafia tutaj.
    """

    der_ref: str
    der_name: str | None
    powod: PowodPominieciaDer
    powod_pl: str


class WejsciaZgodnosciZModelu(BaseModel):
    """Wynik mostu dla całego modelu: moduły do biegu + DER pominięte z powodem."""

    modules: list[NcRfgPtpireeModuleInput]
    pominiete: list[NcRfgDerPominiety]


def _slownik(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _bool_flag(meta: dict[str, Any], key: str) -> bool:
    value = meta.get(key)
    return value if isinstance(value, bool) else False


def _liczba(value: Any) -> float | None:
    """Liczba z meta/tabliczki; ``bool`` NIE jest liczbą (``True`` ≠ ``1.0`` mocy)."""
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def _dodatnia(value: Any) -> float | None:
    liczba = _liczba(value)
    return liczba if liczba is not None and liczba > 0 else None


def _nieujemna(value: Any) -> float | None:
    liczba = _liczba(value)
    return liczba if liczba is not None and liczba >= 0 else None


def _niepusty_tekst(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def certificate_status_z_tabliczki(
    tabliczka: dict[str, Any],
) -> Literal["ptpiree_verified", "unknown"]:
    """Status certyfikatu PTPiREE z tabliczki urządzenia (``annotate_with_ptpiree_status``).

    ``POWIAZANY`` albo niepusta referencja pozycji wykazu → ``ptpiree_verified``;
    każdy inny stan (``NIEPOWIAZANY``, brak tabliczki) → ``unknown`` — solver
    (``_is_required``) traktuje ``unknown`` jak brak certyfikatu (T12/T13 wymagane
    dla A/B), co jest stanem pesymistycznym, nie fabrykacją. ``expired``/``none``
    kontraktu solvera nie mają dziś dostawcy w tabliczce (nie ma pola daty
    wygaśnięcia ani jawnego „brak certyfikatu"), więc nie są tu wyprowadzane.
    """
    if tabliczka.get("ptpiree_status") == "POWIAZANY" or _niepusty_tekst(
        tabliczka.get("ptpiree_certificate_ref")
    ):
        return "ptpiree_verified"
    return "unknown"


def build_ncrfg_module_input_from_generator(
    generator: Generator, *, voltage_kv: float, operator_id: str
) -> NcRfgPtpireeModuleInput:
    """Wejście solvera dla JEDNEGO generatora przekształtnikowego (patrz inwentarz w nagłówku).

    Wołający gwarantuje ``voltage_kv > 0`` i ``|p_mw| > 0`` (inaczej DER jest
    pominięty w ``build_ncrfg_module_inputs_from_enm`` — kontrakt solvera
    odrzuca zero/ujemne, a fabrykować nie wolno).
    """
    meta = _slownik(generator.meta)
    tabliczka = _slownik(generator.materialized_params)
    profile = _slownik(tabliczka.get("profiles"))
    p_max_mw = abs(generator.p_mw)

    droop_percent = _dodatnia(meta.get("frequency_droop_percent"))
    has_pf_droop = droop_percent is not None or _niepusty_tekst(profile.get("pf_curve_ref"))

    qu_slope = _dodatnia(meta.get("qu_slope_pu_per_pu"))
    control_mode = str(meta.get("control_mode") or "").upper()
    has_qu_curve = qu_slope is not None or control_mode in _QU_CONTROL_MODES

    cos_phi = _liczba(meta.get("cos_phi"))
    cos_phi_min = cos_phi if cos_phi is not None and 0 < cos_phi <= 1 else None

    q_min_mvar = _liczba(meta.get("q_min_mvar"))
    q_max_mvar = _liczba(meta.get("q_max_mvar"))

    return NcRfgPtpireeModuleInput(
        der_ref=generator.ref_id,
        der_name=generator.name,
        der_kind=_DER_KIND_Z_GEN_TYPE.get(generator.gen_type or "", "OTHER"),
        module_family="PPM",
        operator_id=operator_id,
        p_max_kw=mw_na_kw(p_max_mw),
        p_min_kw=None,
        voltage_kv=voltage_kv,
        certificate_status=certificate_status_z_tabliczki(tabliczka),
        has_lvrt_curve=_bool_flag(meta, "has_lvrt_curve")
        or _niepusty_tekst(profile.get("lvrt_curve_ref")),
        has_hvrt_curve=_bool_flag(meta, "has_hvrt_curve")
        or _niepusty_tekst(profile.get("hvrt_curve_ref")),
        has_pf_droop=has_pf_droop,
        has_qu_curve=has_qu_curve,
        has_dynamic_model=_niepusty_tekst(tabliczka.get("dynamic_model_ref")),
        has_scada_communication=False,
        has_disturbance_recorder=False,
        active_power_control_enabled=False,
        stop_generation_enabled=False,
        reduction_generation_enabled=False,
        island_operation_required=False,
        island_operation_capable=False,
        black_start_required=False,
        black_start_capable=False,
        power_oscillation_damping_required=False,
        power_oscillation_damping_enabled=False,
        droop_percent=droop_percent,
        dead_band_hz=_nieujemna(meta.get("lfsm_deadband_hz")),
        ramp_rate_pct_per_min=None,
        cos_phi_min=cos_phi_min,
        q_range_pct_pn_min=(
            udzial_mocy_biernej_pu(q_min_mvar, p_max_mw) if q_min_mvar is not None else None
        ),
        q_range_pct_pn_max=(
            udzial_mocy_biernej_pu(q_max_mvar, p_max_mw) if q_max_mvar is not None else None
        ),
        reactive_current_gain=None,
        p_recovery_time_s=None,
        harmonic_thdu_percent=None,
    )


def build_ncrfg_module_inputs_from_enm(
    enm: EnergyNetworkModel, *, operator_id: str
) -> WejsciaZgodnosciZModelu:
    """Wszystkie źródła przekształtnikowe (DER) modelu jako wejścia solvera NC RfG.

    Kolejność deterministyczna (kolejność generatorów w modelu). DER bez
    dodatniej mocy albo bez szyny z napięciem NIE jest fabrykowany — trafia do
    ``pominiete`` z nazwanym powodem (ten sam słownik co blokada modułu w
    macierzy frontendu), żeby odpowiedź trasy mówiła wprost, czego solver nie
    objął i dlaczego.
    """
    bus_voltage = {bus.ref_id: bus.voltage_kv for bus in enm.buses}
    modules: list[NcRfgPtpireeModuleInput] = []
    pominiete: list[NcRfgDerPominiety] = []
    for generator in enm.generators:
        if generator.gen_type not in _INVERTER_GEN_TYPES:
            continue
        voltage_kv = bus_voltage.get(generator.bus_ref)
        powod: PowodPominieciaDer
        if abs(generator.p_mw) <= 0:
            powod = "brak_mocy"
        elif voltage_kv is None or voltage_kv <= 0:
            powod = "brak_napiecia"
        else:
            modules.append(
                build_ncrfg_module_input_from_generator(
                    generator, voltage_kv=voltage_kv, operator_id=operator_id
                )
            )
            continue
        pominiete.append(
            NcRfgDerPominiety(
                der_ref=generator.ref_id,
                der_name=generator.name,
                powod=powod,
                powod_pl=_POWOD_POMINIECIA_PL[powod],
            )
        )
    return WejsciaZgodnosciZModelu(modules=modules, pominiete=pominiete)
