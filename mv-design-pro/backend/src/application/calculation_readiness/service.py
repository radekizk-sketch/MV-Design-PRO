"""CalculationReadinessService — pełen serwis gotowości obliczeń (PR-12).

Brief 2 §16 + karta W6-1 SS0 p.7. Ocenia gotowość dla 9 typów obliczeń + 2
raportów + 1 typu kontraktowego (dynamika_rms):
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
11. Dynamika czasowa (DAE) — dane modelu + punkt pracy z rozpływu; scenariusz
    czasowy i nastawy numeryczne są daną per bieg (sprawdza je adapter biegu).

Każdy item zwraca: status + brakujące pola + obiekty blokujące + zalecaną akcję.
"""

from __future__ import annotations

from typing import Any, Literal

from domain.canonical_operations import READINESS_CODES
from enm.adapter_dynamiki import KOD_PUNKT_PRACY_BRAK, braki_modelu_dynamiki
from enm.assembler import (
    KOD_NIESYMETRIA_BRAK_DROGI_ZEROWEJ,
    KOD_NIESYMETRIA_ELEMENT,
    KOD_NIESYMETRIA_FAZY_ODBIORU,
    KOD_NIESYMETRIA_NIERADIALNA,
    diagnoza_niesymetrii,
)
from enm.models import GEN_TYPES_PRZEKSZTALTNIKOWE, EnergyNetworkModel
from enm.nazwy_elementow import nazwa_elementu, nazwa_po_identyfikatorze, zbuduj_indeks_nazw
from enm.topology import derive
from enm.zrodlo_zwarcie import TrybDanych, dane_zwarciowe_zrodla
from network_model.catalog.governance import Poziom, wymagalnosc_katalogu
from network_model.core.wklad_zwarciowy_przeksztaltnika import (
    K_SC_ZRODLO_DEKLARACJA,
    wspolczynnik_wkladu_zwarciowego,
)
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
    #: Bieg czasowy DAE (karty W6-1..W6-3B). `ready` mówi „dane MODELU kompletne
    #: i punkt pracy z rozpływu dostępny"; scenariusz czasowy i nastawy numeryczne
    #: są daną PER BIEG (opcje), więc bramka modelowa ich nie widzi.
    "dynamika_rms",
]

ReadinessStatus = Literal[
    "ready",  # gotowe — można uruchomić
    "partial",  # częściowe — niektóre dane brakują
    "blocked",  # zablokowane — kluczowe dane brakują (w tym: brak modułu numerycznego)
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
    "dynamika_rms": "Dynamika czasowa (DAE)",
}


class ReadinessTypeReport(BaseModel):
    """Raport gotowości dla pojedynczego typu obliczeń."""

    calculation_type: CalculationType
    label_pl: str
    status: ReadinessStatus
    missing_fields_pl: list[str] = Field(default_factory=list)
    blocking_object_refs: list[str] = Field(default_factory=list)
    recommended_action_pl: str | None = None


class ReadinessReport(BaseModel):
    """Pełen raport gotowości — 10 typów."""

    items: list[ReadinessTypeReport]

    def get(self, calc_type: CalculationType) -> ReadinessTypeReport | None:
        return next((i for i in self.items if i.calculation_type == calc_type), None)

    def overall_status(self) -> ReadinessStatus:
        """Globalny status gotowości projektu — FAIL-CLOSED (karta S-4, W6-0).

        `ready` WYŁĄCZNIE, gdy KAŻDY element ma status `ready` albo `n_a` —
        brak modułu numerycznego dla któregokolwiek elementu (mapowany na
        `blocked` na granicy aplikacyjnej, nie jako osobny status gotowości)
        NIGDY nie liczy się jako gotowość. Priorytet: `blocked` > `partial` >
        `ready`; nieznany/niekompletny stan domyślnie `blocked` (fail-closed).
        """
        statuses = [i.status for i in self.items]
        if any(s == "blocked" for s in statuses):
            return "blocked"
        if any(s == "partial" for s in statuses):
            return "partial"
        if all(s in ("ready", "n_a") for s in statuses):
            return "ready"
        return "blocked"


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
        # Teksty dla projektanta nazywają szyny i źródła nazwami z modelu, identyfikatory
        # zostają w `blocking_object_refs` (karta #144).
        nazwy = zbuduj_indeks_nazw(enm)
        for wyspa in derive(enm).wyspy:
            if len(wyspa.zrodla_sieciowe) > 1:
                szyny = ", ".join(
                    nazwa_po_identyfikatorze(szyna, indeks=nazwy) for szyna in wyspa.szyny[:5]
                )
                zrodla = ", ".join(
                    nazwa_po_identyfikatorze(zrodlo, indeks=nazwy)
                    for zrodlo in wyspa.zrodla_sieciowe
                )
                missing.append(
                    "jedno źródło sieciowe na wyspę — w wyspie szyn "
                    f"{szyny}{', …' if len(wyspa.szyny) > 5 else ''} "
                    f"są źródła {zrodla} "
                    "(kod 'source.multiple_grid_sources_in_island')"
                )
                blockers.extend(wyspa.zrodla_sieciowe)
                has_critical_blocker = True
    for ld in enm.loads:
        if ld.p_mw is None:
            missing.append(f"P odbioru '{nazwa_elementu(ld, 'loads')}'")
            blockers.append(ld.ref_id)
    for branch in enm.branches:
        if branch.type in ("line_overhead", "cable"):
            if (
                getattr(branch, "r_ohm_per_km", None) is None
                or getattr(branch, "x_ohm_per_km", None) is None
            ):
                missing.append(f"impedancja '{nazwa_elementu(branch, 'branches')}'")
                blockers.append(branch.ref_id)
    # D3: Q generatora nieznany i niewyprowadzalny z jawnego Q-set-pointu karty
    # katalogowej => BLOCKER `generator.q_missing` — 0 Mvar podstawione za brak
    # byłoby WYNIKIEM (generator bezbiernościowy), nie brakiem danej.
    for gen in enm.generators:
        if _generator_q_mvar_jawne(gen) is None:
            missing.append(
                f"Q generatora '{nazwa_elementu(gen, 'generators')}' (kod 'generator.q_missing')"
            )
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
                    f"tryb sterowania falownika '{nazwa_elementu(gen, 'generators')}' "
                    "(kod 'pv.control_mode_missing')"
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

    # CV-4.3 K7: predykat wspólny z mapperem (`enm/zrodlo_zwarcie.py`) — do tej karty ta
    # bramka wymagała WYŁĄCZNIE `sk3_mva`, więc źródło z jawną impedancją R/X albo z
    # samym I''kQ (oba policzalne) było fałszywie zgłaszane jako brak danych.
    for src in enm.sources:
        if not dane_zwarciowe_zrodla(src).policzalne:
            missing.append(
                'parametry zwarciowe (S_k", I_k" albo R+jX) źródła '
                f"'{nazwa_elementu(src, 'sources')}'"
            )
            blockers.append(src.ref_id)

    for tr in enm.transformers:
        if tr.uk_percent is None or tr.uk_percent <= 0:
            missing.append(f"u_k transformatora '{nazwa_elementu(tr, 'transformers')}'")
            blockers.append(tr.ref_id)

    # Karta S-2 AUTORYTET (dawniej FAB-H/W3-I; dyrektywa właściciela 2026-09-16:
    # „K_sc pozostaje DEFAULT_FORBIDDEN"): udział zwarciowy falownika k_sc
    # (Ik = k_sc*In, IEC 60909-0) dla generatorów pełnoprzekształtnikowych
    # (PV/BESS/wiatrowy) — bramka „czy ten gen_type wymaga katalogu przy
    # zwarciu" czytana z JEDYNEGO źródła prawdy (`catalog.governance.
    # wymagalnosc_katalogu`, oś `walidacja`; tabela sama importuje
    # `FULL_CONVERTER_SC_GEN_TYPES` z `enm/mapping.py` — reguła KLASA NIE
    # INSTANCJA: jeden zbiór, nie cztery niezależne warunki, które mogłyby się
    # cicho rozjechać). KLASYFIKACJA k_sc (deklaracja miarodajna / nie) czytana
    # z JEDNEGO predykatu `wspolczynnik_wkladu_zwarciowego` — TEGO SAMEGO, który
    # `enm/mapping.py::_add_generator_sc_sources` i `InverterSource.k_sc_zrodlo`
    # stosują do TEJ SAMEJ danej; dwa niezależne warunki o tej samej deklaracji
    # (tu: inline `isinstance(...) and k_sc > 0`, tam: klasyfikator) rozjechałyby
    # się przy pierwszej wartości brzegowej (NaN/±Inf — `NaN > 0` jest fałszem,
    # `+Inf > 0` prawdą), więc jeden przedykat gotowości mógłby milcząco różnić
    # się od tego, co faktycznie zablokuje warstwa autorytetu. Poziomy kodów
    # BEZ ZMIAN: brak JAKIEGOKOLWIEK katalogu (`catalog_ref is None`, stan
    # REALNY — brama katalogowa go nie wyklucza dla Generator, tylko dla linii/
    # kabli/transformatorów/źródeł) => BLOCKER `inverter.k_sc_missing`: brakuje
    # całej tabliczki znamionowej źródła zwarciowego, nie tylko k_sc. Katalog
    # JEST, ale deklaracja k_sc nie jest miarodajna (brak ALBO dana niepoprawna:
    # NaN/±Inf/zero/ujemna/tekst/bool) => WARNING `inverter.k_sc_
    # default_forbidden`: 1,1 przyjęte jako wynik ROBOCZY — SC dalej liczy się
    # poprawnie (ta sama liczba), ale wynik nie jest miarodajny dla doboru/
    # nastaw/dowodu (blokuje to warstwa autorytetu, nie ten serwis).
    zalozone_k_sc_refs: list[str] = []
    for gen in enm.generators:
        if wymagalnosc_katalogu("generator", gen_type=gen.gen_type).walidacja is Poziom.NIE:
            continue
        mp = getattr(gen, "materialized_params", None) or {}
        if wspolczynnik_wkladu_zwarciowego(mp.get("k_sc"))[1] == K_SC_ZRODLO_DEKLARACJA:
            continue
        if gen.catalog_ref is None:
            missing.append(
                f"katalog konwertera '{nazwa_elementu(gen, 'generators')}' "
                "(kod 'inverter.k_sc_missing')"
            )
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
    # CV-4.3 K7: źródła policzalne w MAX, ale bez danych scenariusza MIN (S''kQmin/I''kQmin,
    # tryb mocy zwarciowej / prądu) — bieg MIN liczy Z_Q z danych MAX z JAWNYM założeniem
    # (kod 'source.sk_min_missing', ślad `zrodla_sieciowe`, `raw_result.zalozenia`).
    # Impedancja jawna jest fizyczna i wariantu MIN nie ma, więc nie jest brakiem.
    bez_danych_min = [
        nazwa_elementu(src, "sources")
        for src in enm.sources
        if (dane := dane_zwarciowe_zrodla(src)).tryb_max is not None
        and dane.tryb_max is not TrybDanych.IMPEDANCJA_JAWNA
        and dane.tryb_min is None
    ]
    nota_min = (
        (
            f" Scenariusz MIN: {len(bez_danych_min)} źródło(-a) bez S''kQmin/I''kQmin "
            f"({', '.join(bez_danych_min)}) — Z_Q z danych MAX (kod 'source.sk_min_missing', "
            "założenie niekonserwatywne dla czułości zabezpieczeń)."
        )
        if bez_danych_min
        else ""
    )
    if zalozone_k_sc_refs:
        return ReadinessTypeReport(
            calculation_type="short_circuit",
            label_pl=CALCULATION_LABEL_PL["short_circuit"],
            status="partial",
            recommended_action_pl=(
                "Zwarcia można policzyć — WYNIK ROBOCZY. "
                f"{len(zalozone_k_sc_refs)} konwerter(ów) bez miarodajnej deklaracji k_sc w "
                "karcie katalogowej dostało wartość domyślną IEC 1,1 (kod 'inverter."
                "k_sc_default_forbidden') — NIE jest to podstawa doboru aparatury, nastaw "
                "zabezpieczeń ani pakietu dowodowego. Uzupełnij k_sc z karty producenta albo "
                "certyfikatu jednostki wytwórczej." + nota_min
            ),
        )
    return ReadinessTypeReport(
        calculation_type="short_circuit",
        label_pl=CALCULATION_LABEL_PL["short_circuit"],
        status="ready",
        recommended_action_pl=("Zwarcia można policzyć." + nota_min) if nota_min else None,
    )


#: Odmowy STRUKTURALNE rozpływu niesymetrycznego (topologia/kontrakt solvera) —
#: status `blocked`; pozostałe (brak Z0 gałęzi, brak grupy połączeń) to BRAK DANYCH,
#: `partial` do 5 elementów jak przed W5-D (bieg i tak odmawia nazwanym kodem).
_ODMOWY_STRUKTURALNE_NIESYMETRII: frozenset[str] = frozenset(
    {
        KOD_NIESYMETRIA_NIERADIALNA,
        KOD_NIESYMETRIA_FAZY_ODBIORU,
        KOD_NIESYMETRIA_ELEMENT,
        KOD_NIESYMETRIA_BRAK_DROGI_ZEROWEJ,
    }
)


def _check_asymmetry(enm: EnergyNetworkModel) -> ReadinessTypeReport:
    """Gotowość „Asymetria" = rozpływ niesymetryczny (W5-D): TA SAMA diagnoza, którą
    assembler `enm/assembler.py::diagnoza_niesymetrii` stosuje w biegu — jeden predykat,
    jeden kod (predykaty parami). Do W5-D bramka liczyła własną kopię warunków
    (r0/x0, vector_group) i nie znała granic solvera (radialność, fazy odbiorów,
    elementy bez reprezentacji)."""
    diagnoza = diagnoza_niesymetrii(enm)
    if not diagnoza.odmowy:
        return ReadinessTypeReport(
            calculation_type="asymmetry",
            label_pl=CALCULATION_LABEL_PL["asymmetry"],
            status="ready",
        )
    missing: list[str] = []
    blockers: list[str] = []
    strukturalna = False
    for odmowa in diagnoza.odmowy:
        missing.append(f"{READINESS_CODES[odmowa.kod].message_pl} (kod '{odmowa.kod}')")
        blockers.extend(odmowa.elementy)
        strukturalna = strukturalna or odmowa.kod in _ODMOWY_STRUKTURALNE_NIESYMETRII
    return ReadinessTypeReport(
        calculation_type="asymmetry",
        label_pl=CALCULATION_LABEL_PL["asymmetry"],
        status="blocked" if strukturalna or len(blockers) > 5 else "partial",
        missing_fields_pl=missing[:5],
        blocking_object_refs=blockers[:10],
        recommended_action_pl=(
            "Doprowadź sieć do postaci promieniowej, uzupełnij R0/X0 odcinków i grupy "
            "połączeń transformatorów, wskaż fazy odbiorów faza–N."
        ),
    )


def _check_loadability(enm: EnergyNetworkModel) -> ReadinessTypeReport:
    """Obciążalność cieplna i dynamiczna aparatów."""
    missing: list[str] = []
    blockers: list[str] = []

    for branch in enm.branches:
        if branch.type in ("line_overhead", "cable"):
            rating = getattr(branch, "rating", None)
            if rating is None or getattr(rating, "in_a", None) is None:
                missing.append(f"prąd znamionowy '{nazwa_elementu(branch, 'branches')}'")
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


#: Rodzaje DER = kanoniczny zbiór `GEN_TYPES_PRZEKSZTALTNIKOWE` (karta AB-H0 Pakiet D:
#: lokalna kopia skasowana; parytet w `tests/enm/test_gen_types_przeksztaltnikowe.py`).
_DER_GEN_TYPES = GEN_TYPES_PRZEKSZTALTNIKOWE


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
    fałszowałoby model dynamiczny cichym zmyśleniem technologii źródła.

    Karta W6-1 (SS0 p.3, kasacja "ZAWSZE zwraca profil"): resolver zwraca profil
    WYŁĄCZNIE po jawnym wskazaniu. Jawny wybór projektanta dociera dwoma
    drogami — obie czytane tu, jedna reguła: (1) `Generator.dynamic_profile_id`
    (przyszłe pole ENM wprost — dziś nie istnieje, `getattr` daje `None`
    uczciwie), (2) `materialized_params["dynamic_model_ref"]` — wiązanie
    `DerWiazaniaEditor`/FAB-K R2 (`domain_operations_v2.py::validate_der_bindings`,
    `application/ncrfg_compliance/model_bridge.py::has_dynamic_model`), JEDYNY
    kanał, który dziś faktycznie zapisuje wybór profilu DER. Brak obu →
    `DerDynamicResolution(profile=None, source="brak")` — dawny WARNING
    `der.dynamic_profile_default` jest skasowany razem ze źródłem, które go
    produkowało."""
    from network_model.catalog.der_dynamic import resolve_der_dynamic_profile

    gen_type = getattr(gen, "gen_type", None)
    explicit = getattr(gen, "dynamic_profile_id", None)
    z_katalogu = (getattr(gen, "materialized_params", None) or {}).get("dynamic_model_ref")

    if gen_type == "pv_inverter":
        return resolve_der_dynamic_profile(
            der_kind="PV", explicit_profile_id=explicit, catalog_dynamic_profile_id=z_katalogu
        )
    if gen_type == "bess":
        return resolve_der_dynamic_profile(
            der_kind="BESS", explicit_profile_id=explicit, catalog_dynamic_profile_id=z_katalogu
        )
    if gen_type == "fw_scig":
        return resolve_der_dynamic_profile(
            der_kind="FW",
            explicit_profile_id=explicit,
            catalog_dynamic_profile_id=z_katalogu,
            converter_type="SCIG",
        )
    if gen_type == "fw_dfig":
        return resolve_der_dynamic_profile(
            der_kind="FW",
            explicit_profile_id=explicit,
            catalog_dynamic_profile_id=z_katalogu,
            converter_type="DFIG",
        )
    if gen_type in ("fw_pmsg", "wind_inverter"):
        return resolve_der_dynamic_profile(
            der_kind="FW",
            explicit_profile_id=explicit,
            catalog_dynamic_profile_id=z_katalogu,
            converter_type="full_converter",
        )
    return None


def _rozstrzygnij_profile_der(
    der_generators: list[Any],
) -> tuple[dict[str, Any], list[str]]:
    """Rozwiąż profile dynamiczne DLA WSZYSTKICH DER — jeden przebieg, jedna reguła.

    Karta FAB-D2 (D8) + W6-1, użyte przez `_check_stability` i `_check_frt_hvrt`
    (KLASA, NIE INSTANCJA: ta sama reguła w obu miejscach, nie dwie kopie).

    Zwraca (rozwiazane, brakujace_refs):
        rozwiazane      — ref -> DerDynamicResolution, dla DER z profilem
                           JAWNIE wskazanym.
        brakujace_refs  — ref dla DER, których rodzaj nie ma mapowania w ogóle
                           ALBO resolver zwrócił `source="brak"` (brak jawnego
                           wskazania) — oba są tym samym BLOCKER
                           `der.dynamic_profile_missing` (kasacja rozróżnienia
                           "nieznany rodzaj" vs "domyślny profil": drugi stan
                           już nie istnieje).
    """
    rozwiazane: dict[str, Any] = {}
    brakujace_refs: list[str] = []
    for gen in der_generators:
        ref = getattr(gen, "ref_id", getattr(gen, "id", "?"))
        result = _resolve_der_dynamic_for_generator(gen)
        if result is None or result.profile is None:
            brakujace_refs.append(ref)
            continue
        rozwiazane[ref] = result
    return rozwiazane, brakujace_refs


def _synchroniczny_ma_dynamike(gen: Any) -> bool:
    """Czy generator synchroniczny ma kompletny blok `dynamika` (P0-10, W6-1).

    Rozstrzyga WYŁĄCZNIE `Generator.dynamika` (kontrakt kanoniczny
    `enm.dynamika_modele.MaszynaSynchroniczna`) — maszyny synchroniczne NIE
    przechodzą przez resolver DER (nie są przekształtnikowe)."""
    dynamika = getattr(gen, "dynamika", None)
    return dynamika is not None and getattr(dynamika, "rodzina", None) == "synchroniczna"


def _check_stability(enm: EnergyNetworkModel) -> ReadinessTypeReport:
    """Stabilność RMS — PR-15-impl + DER dynamic resolver + maszyny synchroniczne.

    P0-10 (karta W6-1): maszyny synchroniczne SĄ źródłem dynamicznym dla
    stabilności (przypadek klasyczny transient stability) — dawny filtr
    `_DER_GEN_TYPES` je pomijał, więc projekt WYŁĄCZNIE z generatorem
    synchronicznym dostawał fałszywe `n_a` ("stabilność nie dotyczy"), choć
    to najbardziej typowy powód liczenia stabilności w ogóle.
    """
    der_generators = [g for g in enm.generators if g.gen_type in _DER_GEN_TYPES]
    sync_generators = [g for g in enm.generators if g.gen_type == "synchronous"]
    if not der_generators and not sync_generators:
        return ReadinessTypeReport(
            calculation_type="stability",
            label_pl=CALCULATION_LABEL_PL["stability"],
            status="n_a",
            recommended_action_pl=(
                "Brak źródeł dynamicznych (maszyna synchroniczna/PV/BESS/FW). "
                "Stabilność RMS nie dotyczy projektu."
            ),
        )
    resolved, brakujace_der = _rozstrzygnij_profile_der(der_generators)
    brakujace_sync = [
        getattr(g, "ref_id", getattr(g, "id", "?"))
        for g in sync_generators
        if not _synchroniczny_ma_dynamike(g)
    ]
    brakujace = brakujace_der + brakujace_sync
    nazwy = zbuduj_indeks_nazw(enm)
    if brakujace:
        opisy = [
            f"profil dynamiczny DER '{nazwa_po_identyfikatorze(ref, indeks=nazwy)}' "
            "(kod 'der.dynamic_profile_missing')"
            for ref in brakujace_der
        ] + [
            "blok dynamiki maszyny synchronicznej "
            f"'{nazwa_po_identyfikatorze(ref, indeks=nazwy)}' (kod 'der.dynamika_missing')"
            for ref in brakujace_sync
        ]
        return ReadinessTypeReport(
            calculation_type="stability",
            label_pl=CALCULATION_LABEL_PL["stability"],
            status="blocked",
            missing_fields_pl=opisy,
            blocking_object_refs=brakujace,
            recommended_action_pl=(
                "Uzupełnij model dynamiczny źródeł: DER (PV/BESS/turbina wiatrowa) "
                "wymaga jawnie wskazanego profilu (kod 'der.dynamic_profile_missing'); "
                "maszyna synchroniczna wymaga bloku dynamiki z katalogu maszyn "
                "synchronicznych (kod 'der.dynamika_missing')."
            ),
        )
    zrodla_opis = [
        f"{nazwa_po_identyfikatorze(ref, indeks=nazwy)} — profil „{res.profile.profile_name_pl}”"
        for ref, res in sorted(resolved.items())[:3]
    ]
    if sync_generators:
        zrodla_opis.append(f"{len(sync_generators)} maszyna(y) synchroniczna(e) z blokiem dynamiki")
    return ReadinessTypeReport(
        calculation_type="stability",
        label_pl=CALCULATION_LABEL_PL["stability"],
        status="ready",
        recommended_action_pl=(
            f"Solver stabilności RMS dostępny (PR-15-impl). "
            f"{len(der_generators) + len(sync_generators)} źródeł dynamicznych z modelami "
            "rozwiązanymi: "
            + ", ".join(zrodla_opis)
            + ("..." if len(resolved) > 3 else "")
            + ". Można uruchomić obliczenia."
        ),
    )


def _check_frt_hvrt(enm: EnergyNetworkModel) -> ReadinessTypeReport:
    """FRT/HVRT — PR-16-impl + per-DER dynamic resolver (falowniki wyłącznie —
    maszyny synchroniczne nie mają odpowiedzi FRT/HVRT falownikowej)."""
    der_generators = [g for g in enm.generators if g.gen_type in _DER_GEN_TYPES]
    if not der_generators:
        return ReadinessTypeReport(
            calculation_type="frt_hvrt",
            label_pl=CALCULATION_LABEL_PL["frt_hvrt"],
            status="n_a",
            recommended_action_pl="Brak DER w projekcie. FRT/HVRT nie dotyczy.",
        )
    resolved, brakujace_refs = _rozstrzygnij_profile_der(der_generators)
    if brakujace_refs:
        nazwy = zbuduj_indeks_nazw(enm)
        return ReadinessTypeReport(
            calculation_type="frt_hvrt",
            label_pl=CALCULATION_LABEL_PL["frt_hvrt"],
            status="blocked",
            missing_fields_pl=[
                f"profil FRT/HVRT DER '{nazwa_po_identyfikatorze(ref, indeks=nazwy)}' "
                "(kod 'der.dynamic_profile_missing')"
                for ref in brakujace_refs
            ],
            blocking_object_refs=brakujace_refs,
            recommended_action_pl=(
                "Wskaż profil dynamiczny wprost (operator NC RfG albo karta "
                "katalogowa przekształtnika) dla każdego DER — brak jawnego "
                "wskazania blokuje FRT/HVRT (kasacja domyślnego podstawienia)."
            ),
        )
    return ReadinessTypeReport(
        calculation_type="frt_hvrt",
        label_pl=CALCULATION_LABEL_PL["frt_hvrt"],
        status="ready",
        recommended_action_pl=(
            f"Solver FRT/HVRT RMS dostępny (PR-16-impl). "
            f"{len(resolved)}/{len(der_generators)} DER z profilami FRT/HVRT "
            "jawnie wskazanymi. Można uruchomić testbench."
        ),
    )


def _check_dynamika_rms(
    enm: EnergyNetworkModel, *, punkt_pracy_rozplywu: bool | None = None
) -> ReadinessTypeReport:
    """Gotowość biegu `dynamika_rms` — DOKŁADNIE te warunki, którymi odmawia bieg.

    PARYTET Z BIEGIEM (karta W6-3B, reguła predykatów parami). Warunki MODELOWE
    czyta `enm.adapter_dynamiki.braki_modelu_dynamiki` — TA SAMA funkcja, którą
    woła adapter przed złożeniem wejścia, więc „gotowość mówi ready, a bieg
    odmawia" nie ma gdzie powstać. Do karty W6-1 ta bramka sprawdzała WŁASNY,
    węższy warunek (blok `Generator.dynamika` wyłącznie dla DER i maszyn
    synchronicznych), więc wytwórca bez `gen_type` — którego adapter i tak
    odmawia — przechodził jako gotowy; rodzina bez modelu elektrycznego, odbiór
    ZIP i źródło sieciowe dzielące szynę z wytwórcą nie były sprawdzane wcale.

    `punkt_pracy_rozplywu` — czy dla TEJ migawki istnieje zakończony bieg
    rozpływu (punkt pracy). To warunek PER BIEG, nie modelu, więc podaje go
    wołający, który zna rejestr biegów; `None` (wołający nie wie) daje `partial`
    z nazwanym wymaganiem — fail-closed, bo „nie wiadomo" nie jest „gotowe".

    Scenariusz dynamiczny i nastawy numeryczne są daną PER BIEG (opcje biegu) —
    ich kompletność sprawdza adapter nazwaną odmową przy wykonaniu; model ich
    nie niesie, więc bramka modelowa nie ma czego o nich orzec."""
    if not enm.generators:
        return ReadinessTypeReport(
            calculation_type="dynamika_rms",
            label_pl=CALCULATION_LABEL_PL["dynamika_rms"],
            status="n_a",
            recommended_action_pl=(
                "Brak źródeł dynamicznych (maszyna synchroniczna/PV/BESS/FW) w projekcie."
            ),
        )
    braki = braki_modelu_dynamiki(enm)
    if braki:
        return ReadinessTypeReport(
            calculation_type="dynamika_rms",
            label_pl=CALCULATION_LABEL_PL["dynamika_rms"],
            status="blocked",
            missing_fields_pl=[f"{brak.komunikat_pl} (kod '{brak.kod}')" for brak in braki],
            blocking_object_refs=[element for brak in braki for element in brak.elementy],
            recommended_action_pl=(
                "Uzupełnij dane wejściowe biegu czasowego: blok parametrów dynamicznych "
                "(Generator.dynamika) dla każdego wytwórcy, rodzinę parametrów z modelem "
                "elektrycznym, odbiory o stałej mocy i osobną szynę dla źródła sieciowego."
            ),
        )
    pf = _check_power_flow(enm)
    if pf.status != "ready":
        return ReadinessTypeReport(
            calculation_type="dynamika_rms",
            label_pl=CALCULATION_LABEL_PL["dynamika_rms"],
            status="blocked" if pf.status == "blocked" else "partial",
            missing_fields_pl=list(pf.missing_fields_pl),
            blocking_object_refs=list(pf.blocking_object_refs),
            recommended_action_pl=(
                "Punkt pracy (rozpływ mocy) musi być gotowy przed biegiem dynamiki "
                f"czasowej — {pf.recommended_action_pl or 'uzupełnij dane rozpływu.'}"
            ),
        )
    if punkt_pracy_rozplywu is not True:
        nieznany = punkt_pracy_rozplywu is None
        return ReadinessTypeReport(
            calculation_type="dynamika_rms",
            label_pl=CALCULATION_LABEL_PL["dynamika_rms"],
            status="partial",
            missing_fields_pl=[
                "zakończony bieg rozpływu mocy na tej migawce (punkt pracy biegu czasowego, "
                f"kod '{KOD_PUNKT_PRACY_BRAK}')"
            ],
            recommended_action_pl=(
                (
                    "Dane modelu są kompletne. Nie wiadomo, czy dla tej migawki istnieje "
                    "zakończony bieg rozpływu — bieg czasowy startuje z punktu pracy "
                    "rozpływu i bez niego odmówi."
                )
                if nieznany
                else (
                    "Dane modelu są kompletne. Uruchom rozpływ mocy na tej migawce — bieg "
                    "czasowy startuje z jego punktu pracy; start od napięć znamionowych "
                    "byłby wynikiem policzonym z danych, których nikt nie wyznaczył."
                )
            ),
        )
    return ReadinessTypeReport(
        calculation_type="dynamika_rms",
        label_pl=CALCULATION_LABEL_PL["dynamika_rms"],
        status="ready",
        recommended_action_pl=(
            f"{len(enm.generators)} źródeł z blokiem dynamiki, punkt pracy z rozpływu dostępny. "
            "Podaj scenariusz czasowy (horyzont, krok wyjścia, zdarzenia) i nastawy "
            "numeryczne solvera w opcjach biegu."
        ),
    )


def _check_ncrfg_compliance(enm: EnergyNetworkModel) -> ReadinessTypeReport:
    """Zgodność NC RfG — testbench dostępny (PR-16-impl)."""
    has_der = any(g.gen_type in _DER_GEN_TYPES for g in enm.generators)
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

    def evaluate(
        self, enm: EnergyNetworkModel, *, punkt_pracy_rozplywu: bool | None = None
    ) -> ReadinessReport:
        """Ocena gotowości dla wszystkich 11 typów.

        `punkt_pracy_rozplywu` (karta W6-3B) — czy dla TEJ migawki istnieje
        zakończony bieg rozpływu. Warunek PER BIEG, którego model nie niesie,
        więc podaje go wołający znający rejestr biegów; czyta go wyłącznie
        gotowość biegu czasowego (`_check_dynamika_rms`).
        """
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
                _check_dynamika_rms(enm, punkt_pracy_rozplywu=punkt_pracy_rozplywu),
            ],
        )

    def evaluate_single(
        self,
        enm: EnergyNetworkModel,
        calc_type: CalculationType,
        *,
        punkt_pracy_rozplywu: bool | None = None,
    ) -> ReadinessTypeReport:
        """Ocena pojedynczego typu obliczeń."""
        if calc_type == "dynamika_rms":
            return _check_dynamika_rms(enm, punkt_pracy_rozplywu=punkt_pracy_rozplywu)
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
