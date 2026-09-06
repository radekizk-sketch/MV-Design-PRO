"""CalculationReadinessService — pełen serwis gotowości obliczeń (PR-12).

Brief 2 §16. Ocenia gotowość dla 9 typów obliczeń + 2 raportów:
1. Rozpływ mocy
2. Spadki/wzrosty napięcia
3. Zwarcia
4. Asymetria
5. Obciążalność
6. Stabilność
7. FRT/LVRT/HVRT
8. Zgodność przyłączeniowa NC RfG
9. Raport OSD
10. Raport techniczny

Każdy item zwraca: status + brakujące pola + obiekty blokujące + zalecaną akcję.
"""

from __future__ import annotations

from typing import Any, Literal

from enm.mapping import FULL_CONVERTER_SC_GEN_TYPES
from enm.models import EnergyNetworkModel
from enm.topology import derive
from pydantic import BaseModel, Field

CalculationType = Literal[
    "power_flow",
    "voltage_profile",
    "short_circuit",
    "asymmetry",
    "loadability",
    "stability",
    "frt_hvrt",
    "ncrfg_compliance",
    "report_osd",
    "report_technical",
]

ReadinessStatus = Literal[
    "ready",  # gotowe — można uruchomić
    "partial",  # częściowe — niektóre dane brakują
    "blocked",  # zablokowane — kluczowe dane brakują
    "no_module",  # brak modułu obliczeniowego (numerycznego)
    "n_a",  # nie dotyczy
]


CALCULATION_LABEL_PL: dict[CalculationType, str] = {
    "power_flow": "Rozpływ mocy",
    "voltage_profile": "Spadki / wzrosty napięcia",
    "short_circuit": "Zwarcia",
    "asymmetry": "Asymetria",
    "loadability": "Obciążalność",
    "stability": "Stabilność",
    "frt_hvrt": "FRT / LVRT / HVRT",
    "ncrfg_compliance": "Zgodność przyłączeniowa",
    "report_osd": "Raport OSD",
    "report_technical": "Raport techniczny",
}


class ReadinessTypeReport(BaseModel):
    """Raport gotowości dla pojedynczego typu obliczeń."""

    calculation_type: CalculationType
    label_pl: str
    status: ReadinessStatus
    missing_fields_pl: list[str] = Field(default_factory=list)
    blocking_object_refs: list[str] = Field(default_factory=list)
    recommended_action_pl: str | None = None
    no_module_reason_pl: str | None = None


class ReadinessReport(BaseModel):
    """Pełen raport gotowości — 10 typów."""

    items: list[ReadinessTypeReport]

    def get(self, calc_type: CalculationType) -> ReadinessTypeReport | None:
        return next((i for i in self.items if i.calculation_type == calc_type), None)

    def overall_status(self) -> ReadinessStatus:
        """Globalny status gotowości projektu."""
        statuses = [i.status for i in self.items]
        if any(s == "blocked" for s in statuses):
            return "blocked"
        if any(s == "partial" for s in statuses):
            return "partial"
        if all(s in ("ready", "n_a", "no_module") for s in statuses):
            return "ready"
        return "partial"


# ---------------------------------------------------------------------------
# Reguły gotowości per typ obliczenia
# ---------------------------------------------------------------------------


def _generator_q_mvar_jawne(gen: Any) -> float | None:  # type: ignore[no-untyped-def]
    """Jawny Q generatora [Mvar] — z pola albo z KONKRETNEGO Q-set-pointu karty.

    Karta FAB-D2 (D3): `generator.q_mvar` bywa `None` (nieznane), ale karta
    katalogowa falownika może nieść Q-set-point WPROST (`qmin_mvar == qmax_mvar`
    w `materialized_params` — tryb stałego Q, nie zakres). To ODCZYT liczby już
    obecnej w danych, NIE wyprowadzenie trygonometryczne z cos φ (Q = P·tan(φ))
    — TA derywacja jest fizyką i należy do warstwy solvera
    (`network_model/solvers/power_flow_inverter.py`), nie do bramki gotowości
    (reguła NOT-A-SOLVER — warstwa aplikacji nie liczy fizyki).

    Karta FAB-H (H2, KLASA NIE INSTANCJA): predykat przeniesiony do
    `solver_input.moc_bierna_wytworcy` — JEDNO źródło prawdy dzielone z
    `enm/mapping.py` i `enm/canonical_analysis.py`. Bez tego bramka mogłaby
    uznać sieć za gotową, podczas gdy mapper wciąż liczyłby zerem (dwa
    niezależne warunki, które "dziś się zgadzają" — dokładnie defekt, który ta
    reguła zakazuje).
    """
    from solver_input.moc_bierna_wytworcy import moc_bierna_wytworcy

    card = getattr(gen, "materialized_params", None)
    return moc_bierna_wytworcy(gen, card).q_mvar


def _check_power_flow(enm: EnergyNetworkModel) -> ReadinessTypeReport:
    missing: list[str] = []
    blockers: list[str] = []

    has_critical_blocker = False
    if not enm.sources:
        missing.append("źródło zasilania (Source)")
        blockers.append("project")
        has_critical_blocker = True
    if not enm.buses:
        missing.append("co najmniej 1 szyna")
        blockers.append("project")
        has_critical_blocker = True
    # CV-4.3 K3b (A3-05): jedna szyna bilansująca na wyspę. Dwa źródła sieciowe w
    # JEDNEJ wyspie (np. dwa GPZ spięte zamkniętym sprzęgłem) => BLOCKER
    # `source.multiple_grid_sources_in_island` — ta sama `TopologyView`
    # (`enm/topology.py::derive`), z której assembler odmawia złożenia wejścia
    # (`enm/assembler.py::OdmowaWejsciaRozplywu`): bramka i wykonawca czytają jeden
    # predykat. Źródła w OSOBNYCH wyspach nie blokują (rozpływ per wyspa).
    if enm.sources and enm.buses:
        for wyspa in derive(enm).wyspy:
            if len(wyspa.zrodla_sieciowe) > 1:
                missing.append(
                    "jedno źródło sieciowe na wyspę — w wyspie szyn "
                    f"{', '.join(wyspa.szyny[:5])}{', …' if len(wyspa.szyny) > 5 else ''} "
                    f"są źródła {', '.join(wyspa.zrodla_sieciowe)} "
                    "(kod 'source.multiple_grid_sources_in_island')"
                )
                blockers.extend(wyspa.zrodla_sieciowe)
                has_critical_blocker = True
    for ld in enm.loads:
        if ld.p_mw is None:
            missing.append(f"P odbioru '{ld.name}'")
            blockers.append(ld.ref_id)
    for branch in enm.branches:
        if branch.type in ("line_overhead", "cable"):
            if (
                getattr(branch, "r_ohm_per_km", None) is None
                or getattr(branch, "x_ohm_per_km", None) is None
            ):
                missing.append(f"impedancja '{branch.name}'")
                blockers.append(branch.ref_id)
    # D3: Q generatora nieznany i niewyprowadzalny z jawnego Q-set-pointu karty
    # katalogowej => BLOCKER `generator.q_missing` — 0 Mvar podstawione za brak
    # byłoby WYNIKIEM (generator bezbiernościowy), nie brakiem danej.
    for gen in enm.generators:
        if _generator_q_mvar_jawne(gen) is None:
            missing.append(f"Q generatora '{gen.ref_id}' (kod 'generator.q_missing')")
            blockers.append(gen.ref_id)
    # D6: falownik PV bez trybu sterowania (control_mode) => BLOCKER
    # `pv.control_mode_missing`. Kod kanonu JUŻ istniał w READINESS_CODES,
    # zarezerwowany w readiness_bridge.py bez emitera ("emiter w walidatorze
    # ENM do wpięcia osobną kartą") — reużywamy GO zamiast tworzyć drugi,
    # równoległy kod o tej samej treści (Reużycie zamiast duplikacji).
    # Ten blok JEST tym emiterem: solver mocy biernej (power_flow_inverter)
    # nie wie, JAK regulować Q bez trybu sterowania; rezerwacja w
    # readiness_bridge.py::KODY_KANONU_ZAREZERWOWANE usunięta w tym samym
    # commicie (kod przestał być bez drogi do projektanta).
    for gen in enm.generators:
        if gen.gen_type == "pv_inverter":
            card = getattr(gen, "materialized_params", None) or {}
            if card.get("control_mode") is None:
                missing.append(
                    f"tryb sterowania falownika '{gen.ref_id}' (kod 'pv.control_mode_missing')"
                )
                blockers.append(gen.ref_id)

    if blockers:
        status: ReadinessStatus = (
            "blocked" if has_critical_blocker or len(blockers) > 2 else "partial"
        )
        return ReadinessTypeReport(
            calculation_type="power_flow",
            label_pl=CALCULATION_LABEL_PL["power_flow"],
            status=status,
            missing_fields_pl=missing,
            blocking_object_refs=blockers,
            recommended_action_pl="Uzupełnij dane elektryczne źródeł, odbiorów i odcinków.",
        )
    return ReadinessTypeReport(
        calculation_type="power_flow",
        label_pl=CALCULATION_LABEL_PL["power_flow"],
        status="ready",
    )


def _check_voltage_profile(enm: EnergyNetworkModel) -> ReadinessTypeReport:
    """Voltage profile = power_flow z dodatkową walidacją zaczepów transformatorów."""
    pf_check = _check_power_flow(enm)
    if pf_check.status in ("blocked", "partial"):
        return ReadinessTypeReport(
            calculation_type="voltage_profile",
            label_pl=CALCULATION_LABEL_PL["voltage_profile"],
            status=pf_check.status,
            missing_fields_pl=list(pf_check.missing_fields_pl),
            blocking_object_refs=list(pf_check.blocking_object_refs),
            recommended_action_pl="Najpierw uzupełnij dane do rozpływu mocy.",
        )
    return ReadinessTypeReport(
        calculation_type="voltage_profile",
        label_pl=CALCULATION_LABEL_PL["voltage_profile"],
        status="ready",
    )


def _check_short_circuit(enm: EnergyNetworkModel) -> ReadinessTypeReport:
    missing: list[str] = []
    blockers: list[str] = []

    if not enm.sources:
        missing.append('źródło zwarciowe (S_k")')
        blockers.append("project")

    for src in enm.sources:
        if getattr(src, "sk3_mva", None) is None:
            missing.append(f"S_k\" źródła '{src.ref_id}'")
            blockers.append(src.ref_id)

    for tr in enm.transformers:
        if tr.uk_percent is None or tr.uk_percent <= 0:
            missing.append(f"u_k transformatora '{tr.name}'")
            blockers.append(tr.ref_id)

    # Karta FAB-H: udział zwarciowy falownika k_sc (Ik = k_sc*In, IEC 60909-0) dla
    # generatorów pełnoprzekształtnikowych (PV/BESS/wiatrowy) — TA SAMA klasa
    # gen_type co `enm/mapping.py::_add_generator_sc_sources` (importowany zbiór
    # FULL_CONVERTER_SC_GEN_TYPES, nie re-derywowany osobno — reguła KLASA NIE
    # INSTANCJA: dwa niezależne warunki nie mogą się cicho rozjechać). Brak
    # JAKIEGOKOLWIEK katalogu (`catalog_ref is None`, stan REALNY — brama
    # katalogowa go nie wyklucza dla Generator, tylko dla linii/kabli/
    # transformatorów/źródeł) => BLOCKER `inverter.k_sc_missing`: brakuje całej
    # tabliczki znamionowej źródła zwarciowego, nie tylko k_sc. Katalog JEST,
    # ale nie niesie k_sc => WARNING `inverter.k_sc_assumed`: 1,1 przyjęte,
    # IEC-typowe — SC dalej liczy się poprawnie, tylko z założeniem zamiast
    # zmierzonej wartości.
    zalozone_k_sc_refs: list[str] = []
    for gen in enm.generators:
        if gen.gen_type not in FULL_CONVERTER_SC_GEN_TYPES:
            continue
        mp = getattr(gen, "materialized_params", None) or {}
        k_sc = mp.get("k_sc")
        if isinstance(k_sc, int | float) and not isinstance(k_sc, bool) and k_sc > 0:
            continue
        if gen.catalog_ref is None:
            missing.append(f"katalog konwertera '{gen.ref_id}' (kod 'inverter.k_sc_missing')")
            blockers.append(gen.ref_id)
        else:
            zalozone_k_sc_refs.append(gen.ref_id)

    if blockers:
        return ReadinessTypeReport(
            calculation_type="short_circuit",
            label_pl=CALCULATION_LABEL_PL["short_circuit"],
            status="partial" if len(blockers) <= 3 else "blocked",
            missing_fields_pl=missing,
            blocking_object_refs=blockers,
            recommended_action_pl='Uzupełnij dane zwarciowe źródła i transformatorów (u_k, S_k").',
        )
    if zalozone_k_sc_refs:
        return ReadinessTypeReport(
            calculation_type="short_circuit",
            label_pl=CALCULATION_LABEL_PL["short_circuit"],
            status="partial",
            recommended_action_pl=(
                "Zwarcia można policzyć. Założenie: "
                f"{len(zalozone_k_sc_refs)} konwerter(ów) bez k_sc w karcie katalogowej "
                "dostało wartość domyślną IEC 1,1 (kod 'inverter.k_sc_assumed') — "
                "sprawdź, czy karta producenta nie niesie zmierzonej wartości."
            ),
        )
    return ReadinessTypeReport(
        calculation_type="short_circuit",
        label_pl=CALCULATION_LABEL_PL["short_circuit"],
        status="ready",
    )


def _check_asymmetry(enm: EnergyNetworkModel) -> ReadinessTypeReport:
    missing: list[str] = []
    blockers: list[str] = []

    for branch in enm.branches:
        if branch.type in ("line_overhead", "cable"):
            r0 = getattr(branch, "r0_ohm_per_km", None)
            x0 = getattr(branch, "x0_ohm_per_km", None)
            if r0 is None or x0 is None:
                missing.append(f"impedancja składowej zerowej '{branch.name}'")
                blockers.append(branch.ref_id)

    for tr in enm.transformers:
        if tr.vector_group is None:
            missing.append(f"grupa połączeń transformatora '{tr.name}'")
            blockers.append(tr.ref_id)

    if blockers:
        return ReadinessTypeReport(
            calculation_type="asymmetry",
            label_pl=CALCULATION_LABEL_PL["asymmetry"],
            status="partial" if len(blockers) <= 5 else "blocked",
            missing_fields_pl=missing[:5],
            blocking_object_refs=blockers[:10],
            recommended_action_pl="Uzupełnij r0/x0 odcinków i grupy połączeń transformatorów.",
        )
    return ReadinessTypeReport(
        calculation_type="asymmetry",
        label_pl=CALCULATION_LABEL_PL["asymmetry"],
        status="ready",
    )


def _check_loadability(enm: EnergyNetworkModel) -> ReadinessTypeReport:
    """Obciążalność cieplna i dynamiczna aparatów."""
    missing: list[str] = []
    blockers: list[str] = []

    for branch in enm.branches:
        if branch.type in ("line_overhead", "cable"):
            rating = getattr(branch, "rating", None)
            if rating is None or getattr(rating, "in_a", None) is None:
                missing.append(f"prąd znamionowy '{branch.name}'")
                blockers.append(branch.ref_id)

    if blockers and len(blockers) > len(enm.branches) // 2:
        return ReadinessTypeReport(
            calculation_type="loadability",
            label_pl=CALCULATION_LABEL_PL["loadability"],
            status="blocked",
            missing_fields_pl=missing[:5],
            blocking_object_refs=blockers[:10],
            recommended_action_pl="Uzupełnij parametry znamionowe (I_n, I_th) odcinków z katalogu.",
        )
    if blockers:
        return ReadinessTypeReport(
            calculation_type="loadability",
            label_pl=CALCULATION_LABEL_PL["loadability"],
            status="partial",
            missing_fields_pl=missing[:5],
            blocking_object_refs=blockers[:10],
            recommended_action_pl="Uzupełnij parametry znamionowe pozostałych odcinków.",
        )
    return ReadinessTypeReport(
        calculation_type="loadability",
        label_pl=CALCULATION_LABEL_PL["loadability"],
        status="ready",
    )


_DER_GEN_TYPES = (
    "pv_inverter",
    "bess",
    "wind_inverter",
    "fw_pmsg",
    "fw_dfig",
    "fw_scig",
)


#: Źródła rozwiązania `DerDynamicResolution` uznawane za "domyślne katalogu"
#: (nie jawny wybór projektanta/karty) — D8: taki wynik jest dozwolony
#: wyłącznie z WARNING `der.dynamic_profile_default` (proweniencja widoczna).
_ZRODLA_DOMYSLNE_KATALOGU = frozenset({"default_per_kind", "default_per_converter_type"})


def _resolve_der_dynamic_for_generator(gen):  # type: ignore[no-untyped-def]
    """Rozwiąż profil dynamiczny pojedynczego DER w ENM — albo zgłoś, że rodzaj jest nieznany.

    Mapping `gen_type` → resolver args:
        pv_inverter → PV grid_following
        bess        → BESS grid_following
        fw_scig     → FW SCIG (type 1)
        fw_dfig     → FW DFIG (type 3)
        fw_pmsg     → FW full_converter (type 4)
        wind_inverter → FW full_converter (type 4) — generic

    Karta FAB-D2 (D8): rodzaj DER spoza tego mapowania zwraca `None` — NIE
    "bezpieczny fallback" do PV. Podstawienie profilu PV dla nieznanego rodzaju
    (np. syncmasz albo przyszły rodzaj DER jeszcze niezmapowany) fałszowałoby
    model dynamiczny cichym zmyśleniem technologii źródła. Wywołujący
    (`_check_stability`/`_check_frt_hvrt`) zgłasza to jako BLOCKER
    `der.dynamic_profile_missing`.

    Zwrócony `DerDynamicResolution.source` niesie proweniencję: gdy jest w
    `_ZRODLA_DOMYSLNE_KATALOGU`, profil pochodzi z DOMYŚLNEJ wartości katalogu
    (nie jawnego wyboru) i wywołujący zgłasza to jako WARNING/założenie
    `der.dynamic_profile_default` — to jedyny dozwolony przypadek, w którym
    "domyślny profil" nie jest cichym podstawieniem: proweniencja go ujawnia.
    """
    from network_model.catalog.der_dynamic import resolve_der_dynamic_profile

    gen_type = getattr(gen, "gen_type", None)
    explicit = getattr(gen, "dynamic_profile_id", None)

    if gen_type == "pv_inverter":
        return resolve_der_dynamic_profile(der_kind="PV", explicit_profile_id=explicit)
    if gen_type == "bess":
        return resolve_der_dynamic_profile(der_kind="BESS", explicit_profile_id=explicit)
    if gen_type == "fw_scig":
        return resolve_der_dynamic_profile(
            der_kind="FW", explicit_profile_id=explicit, converter_type="SCIG"
        )
    if gen_type == "fw_dfig":
        return resolve_der_dynamic_profile(
            der_kind="FW", explicit_profile_id=explicit, converter_type="DFIG"
        )
    if gen_type in ("fw_pmsg", "wind_inverter"):
        return resolve_der_dynamic_profile(
            der_kind="FW",
            explicit_profile_id=explicit,
            converter_type="full_converter",
        )
    return None


def _rozstrzygnij_profile_der(
    der_generators: list[Any],
) -> tuple[dict[str, Any], list[str], list[str]]:
    """Rozwiąż profile dynamiczne DLA WSZYSTKICH DER — jeden przebieg, jedna reguła.

    Karta FAB-D2 (D8), użyte przez `_check_stability` i `_check_frt_hvrt`
    (KLASA, NIE INSTANCJA: ta sama reguła w obu miejscach, nie dwie kopie).

    Zwraca (rozwiazane, nieznane_refs, domyslne_refs):
        rozwiazane      — ref -> DerDynamicResolution, dla DER z profilem.
        nieznane_refs   — ref dla DER, których rodzaj nie ma mapowania w ogóle
                           (BLOCKER `der.dynamic_profile_missing` — brak profilu,
                           nie fallback do PV).
        domyslne_refs   — ref dla DER rozwiązanych, ale z DOMYŚLNEJ wartości
                           katalogu, nie jawnego wyboru (WARNING/założenie
                           `der.dynamic_profile_default`).
    """
    rozwiazane: dict[str, Any] = {}
    nieznane_refs: list[str] = []
    domyslne_refs: list[str] = []
    for gen in der_generators:
        ref = getattr(gen, "ref_id", getattr(gen, "id", "?"))
        result = _resolve_der_dynamic_for_generator(gen)
        if result is None:
            nieznane_refs.append(ref)
            continue
        rozwiazane[ref] = result
        if result.source in _ZRODLA_DOMYSLNE_KATALOGU:
            domyslne_refs.append(ref)
    return rozwiazane, nieznane_refs, domyslne_refs


def _check_stability(enm: EnergyNetworkModel) -> ReadinessTypeReport:
    """Stabilność RMS — PR-15-impl + DER dynamic resolver (każdy DER ma model)."""
    der_generators = [g for g in enm.generators if g.gen_type in _DER_GEN_TYPES]
    if not der_generators:
        return ReadinessTypeReport(
            calculation_type="stability",
            label_pl=CALCULATION_LABEL_PL["stability"],
            status="n_a",
            recommended_action_pl=(
                "Brak źródeł dynamicznych (PV/BESS/FW). Stabilność RMS nie dotyczy projektu."
            ),
        )
    resolved, nieznane_refs, domyslne_refs = _rozstrzygnij_profile_der(der_generators)
    if nieznane_refs:
        return ReadinessTypeReport(
            calculation_type="stability",
            label_pl=CALCULATION_LABEL_PL["stability"],
            status="blocked",
            missing_fields_pl=[
                f"profil dynamiczny DER '{ref}' (kod 'der.dynamic_profile_missing')"
                for ref in nieznane_refs
            ],
            blocking_object_refs=nieznane_refs,
            recommended_action_pl=(
                "Rodzaj DER nieznany dla stabilności RMS — przypisz obsługiwany rodzaj "
                "(PV/BESS/turbina wiatrowa) albo profil dynamiczny wprost."
            ),
        )
    status: ReadinessStatus = "partial" if domyslne_refs else "ready"
    zalozenie = (
        f" Założenie: {len(domyslne_refs)} DER dostało profil DOMYŚLNY katalogu "
        "(kod 'der.dynamic_profile_default'), nie jawnie wskazany — sprawdź, czy pasuje."
        if domyslne_refs
        else ""
    )
    return ReadinessTypeReport(
        calculation_type="stability",
        label_pl=CALCULATION_LABEL_PL["stability"],
        status=status,
        recommended_action_pl=(
            f"Solver stabilności RMS dostępny (PR-15-impl). "
            f"{len(der_generators)} DER z modelami dynamicznymi rozwiązanymi: "
            + ", ".join(f"{ref}={res.profile_id}" for ref, res in sorted(resolved.items())[:3])
            + ("..." if len(resolved) > 3 else "")
            + ". Można uruchomić obliczenia."
            + zalozenie
        ),
    )


def _check_frt_hvrt(enm: EnergyNetworkModel) -> ReadinessTypeReport:
    """FRT/HVRT — PR-16-impl + per-DER dynamic resolver."""
    der_generators = [g for g in enm.generators if g.gen_type in _DER_GEN_TYPES]
    if not der_generators:
        return ReadinessTypeReport(
            calculation_type="frt_hvrt",
            label_pl=CALCULATION_LABEL_PL["frt_hvrt"],
            status="n_a",
            recommended_action_pl="Brak DER w projekcie. FRT/HVRT nie dotyczy.",
        )
    resolved, nieznane_refs, domyslne_refs = _rozstrzygnij_profile_der(der_generators)
    if nieznane_refs:
        return ReadinessTypeReport(
            calculation_type="frt_hvrt",
            label_pl=CALCULATION_LABEL_PL["frt_hvrt"],
            status="blocked",
            missing_fields_pl=[
                f"profil FRT/HVRT DER '{ref}' (kod 'der.dynamic_profile_missing')"
                for ref in nieznane_refs
            ],
            blocking_object_refs=nieznane_refs,
            recommended_action_pl=(
                "Rodzaj DER nieznany dla FRT/HVRT — przypisz obsługiwany rodzaj "
                "(PV/BESS/turbina wiatrowa) albo profil dynamiczny wprost."
            ),
        )
    status: ReadinessStatus = "partial" if domyslne_refs else "ready"
    zalozenie = (
        f" Założenie: {len(domyslne_refs)} DER dostało profil DOMYŚLNY katalogu "
        "(kod 'der.dynamic_profile_default')."
        if domyslne_refs
        else ""
    )
    return ReadinessTypeReport(
        calculation_type="frt_hvrt",
        label_pl=CALCULATION_LABEL_PL["frt_hvrt"],
        status=status,
        recommended_action_pl=(
            f"Solver FRT/HVRT RMS dostępny (PR-16-impl). "
            f"{len(resolved)}/{len(der_generators)} DER z profilami FRT/HVRT "
            "rozwiązanymi (catalog → operator profile → IEEE/IEC default). "
            "Można uruchomić testbench." + zalozenie
        ),
    )


def _check_ncrfg_compliance(enm: EnergyNetworkModel) -> ReadinessTypeReport:
    """Zgodność NC RfG — testbench dostępny (PR-16-impl)."""
    has_der = any(
        g.gen_type in ("pv_inverter", "bess", "wind_inverter", "fw_pmsg", "fw_dfig", "fw_scig")
        for g in enm.generators
    )
    if not has_der:
        return ReadinessTypeReport(
            calculation_type="ncrfg_compliance",
            label_pl=CALCULATION_LABEL_PL["ncrfg_compliance"],
            status="n_a",
            recommended_action_pl="Brak DER w projekcie. Zgodność przyłączeniowa nie dotyczy.",
        )
    return ReadinessTypeReport(
        calculation_type="ncrfg_compliance",
        label_pl=CALCULATION_LABEL_PL["ncrfg_compliance"],
        status="ready",
        recommended_action_pl=(
            "Compliance testbench NC RfG dostępny (PR-16-impl). "
            "5 profili operatorów (PSE/Energa/Tauron/Enea/PGE) × 18 testów × klasyfikacja A/B/C/D. "
            "Static T3-T15 + dynamic T1/T2 podpięte przez FRT solver."
        ),
    )


def _check_report_osd(enm: EnergyNetworkModel) -> ReadinessTypeReport:
    """Raport OSD wymaga kompletności podstawowej."""
    pf = _check_power_flow(enm)
    sc = _check_short_circuit(enm)

    if pf.status == "blocked" or sc.status == "blocked":
        return ReadinessTypeReport(
            calculation_type="report_osd",
            label_pl=CALCULATION_LABEL_PL["report_osd"],
            status="blocked",
            missing_fields_pl=list(pf.missing_fields_pl) + list(sc.missing_fields_pl),
            blocking_object_refs=list(set(pf.blocking_object_refs + sc.blocking_object_refs)),
            recommended_action_pl="Najpierw uzupełnij dane do rozpływu mocy i obliczeń zwarciowych.",
        )
    if pf.status == "partial" or sc.status == "partial":
        return ReadinessTypeReport(
            calculation_type="report_osd",
            label_pl=CALCULATION_LABEL_PL["report_osd"],
            status="partial",
            missing_fields_pl=list(pf.missing_fields_pl) + list(sc.missing_fields_pl),
            recommended_action_pl="Wynik częściowy — uzupełnij brakujące dane przed wygenerowaniem raportu.",
        )
    return ReadinessTypeReport(
        calculation_type="report_osd",
        label_pl=CALCULATION_LABEL_PL["report_osd"],
        status="ready",
    )


def _check_report_technical(enm: EnergyNetworkModel) -> ReadinessTypeReport:
    """Raport techniczny wymaga kompletności wszystkich 9 typów obliczeń."""
    checks = [
        _check_power_flow(enm),
        _check_voltage_profile(enm),
        _check_short_circuit(enm),
        _check_asymmetry(enm),
        _check_loadability(enm),
    ]
    has_blocked = any(c.status == "blocked" for c in checks)
    has_partial = any(c.status == "partial" for c in checks)

    if has_blocked:
        return ReadinessTypeReport(
            calculation_type="report_technical",
            label_pl=CALCULATION_LABEL_PL["report_technical"],
            status="blocked",
            recommended_action_pl="Uzupełnij dane do wszystkich obliczeń przed raportem technicznym.",
        )
    if has_partial:
        return ReadinessTypeReport(
            calculation_type="report_technical",
            label_pl=CALCULATION_LABEL_PL["report_technical"],
            status="partial",
            recommended_action_pl="Wynik częściowy — niektóre obliczenia mają braki danych.",
        )
    return ReadinessTypeReport(
        calculation_type="report_technical",
        label_pl=CALCULATION_LABEL_PL["report_technical"],
        status="ready",
    )


# ---------------------------------------------------------------------------
# Główny serwis
# ---------------------------------------------------------------------------


class CalculationReadinessService:
    """Pełen serwis gotowości obliczeń (PR-12, brief 2 §16)."""

    def evaluate(self, enm: EnergyNetworkModel) -> ReadinessReport:
        """Ocena gotowości dla wszystkich 10 typów."""
        return ReadinessReport(
            items=[
                _check_power_flow(enm),
                _check_voltage_profile(enm),
                _check_short_circuit(enm),
                _check_asymmetry(enm),
                _check_loadability(enm),
                _check_stability(enm),
                _check_frt_hvrt(enm),
                _check_ncrfg_compliance(enm),
                _check_report_osd(enm),
                _check_report_technical(enm),
            ],
        )

    def evaluate_single(
        self, enm: EnergyNetworkModel, calc_type: CalculationType
    ) -> ReadinessTypeReport:
        """Ocena pojedynczego typu obliczeń."""
        check_map = {
            "power_flow": _check_power_flow,
            "voltage_profile": _check_voltage_profile,
            "short_circuit": _check_short_circuit,
            "asymmetry": _check_asymmetry,
            "loadability": _check_loadability,
            "stability": _check_stability,
            "frt_hvrt": _check_frt_hvrt,
            "ncrfg_compliance": _check_ncrfg_compliance,
            "report_osd": _check_report_osd,
            "report_technical": _check_report_technical,
        }
        return check_map[calc_type](enm)
