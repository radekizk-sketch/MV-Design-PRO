"""Arkusz obliczeń obwodów nN (karta ARKUSZ-NN, docs/nn/ARKUSZ_OBLICZEN_NN_2026-08.md).

Warstwa APLIKACJI/ANALIZ (interpretacja — NOT-A-SOLVER). Agreguje, PER
ODPŁYW nN jednej rozdzielnicy/stacji, dokładnie te kolumny, które niesie
wzorcowa tabela „Obliczenia kabli AC" (Ib, zabezpieczenie, Ir=In·n, zapas %,
Iz′ z korektą ułożenia, k2, I2, przewód/przekrój/γ, kryteria Ib<=In<=Iz′ i
I2<=1,45·Iz′, długość, ΔU odcinkowy/całkowity) PLUS kolumny „lepiej"
(Ik″max/min, SWZ, I²t, status doboru, provenance) — patrz mapowanie kolumna→
dostawca w tym samym pliku binding.

ZERO NOWEJ FIZYKI — czysta KOMPOZYCJA istniejących dostawców:
  - odpływy/punkty:        `fault_loop.route.bfs_paths_from` +
                            `group_bus_refs_by_feeder` (topologiczne, BFS —
                            działa dla KAŻDEGO układu sieci nN, TN/TT/IT;
                            fizyka pętli TN bramkuje TYLKO kolumny zależne od
                            niej — SWZ/Ik1_min/dobór — nie samo istnienie
                            wiersza odpływu).
  - Ib (bieg rozpływu):    `enm.canonical_analysis.build_branch_results`
                            (metryka `i_a`, ta sama, którą frontend T2-WYNIKI
                            czyta jako `I_A` z overlay — `nnCircuitResults.ts`
                            dokumentuje wzorzec, tu czytamy PROSTO z wyniku
                            biegu, bez pośredniej warstwy overlay HTTP).
  - Ib (tabliczka):         S=√3·U·I na sumie Load.p_mw/q_mvar odbiorów
                            odpływu — arytmetyka JAWNIE nazwana wzorcem
                            (docs/nn/ARKUSZ_OBLICZEN_NN_2026-08.md, wiersz
                            „Prąd oblicz. Ib"), nie nowa fizyka.
  - aparat/nastawy:         `application.proof_engine.
                            lv_circuit_verification_binding.
                            resolve_urzadzenie_ochronne` (REUSE — ten sam
                            resolwer branch→aparat co pakiet dowodowy
                            LV_CIRCUIT_VERIFICATION; rozszerzony kartą
                            ARKUSZ-NN o ir_a/isd_a/tr_s/tsd_s MCCB).
  - Iz′ + rozkład k:        `network_model.solvers.cable_ampacity_derating`
                            (`wspolczynniki_nn` + `obciazalnosc_skorygowana`
                            — JEDYNE miejsce mnożenia Iz×iloczyn).
  - kryteria (i)-(iv):      `application.analyses.nn_device_selection.
                            oceniaj_kandydata` — REUSE bezpośrednie (funkcja
                            już ocenia WSZYSTKIE cztery kryteria dla JEDNEGO
                            kandydata; tu kandydatem jest APARAT
                            ZAINSTALOWANY, nie ranking katalogu). Ik1_min/U0
                            i status „nie dotyczy"/„brak danych" pochodzą z
                            `wybierz_aparat_dla_obwodu_nn` (ta sama funkcja
                            liczy je RAZ, niezależnie od ocenianego
                            kandydata — dokładnie ten wzorzec, co w module
                            źródłowym).
  - k2/I2:                  odczyt z `wartosci` kryterium (ii) zwróconego
                            przez `oceniaj_kandydata` (`_kryterium_i2`) — nie
                            druga implementacja mnożnika; stałe P0.7
                            (`PROG_CIEPLNY_WYZWALA_X_IN`/`FUSE_GG_IF_
                            MULTIPLIER`/`MCCB_I2_MULTIPLIER`) importowane
                            WYŁĄCZNIE do podpisania k2 w wierszu (wartość k2
                            jest tą samą stałą co użyta w kryterium).
  - Ik″max/min:              Ik″max z biegu zwarciowego IEC 60909
                            (`build_short_circuit_results`, `ikss_ka`/
                            `ith_ka` per punkt najgorszy) — OPCJONALNY
                            parametr (`short_circuit_run`); Ik1_min z
                            `wybierz_aparat_dla_obwodu_nn` (pętla TN, REUSE).
  - SWZ:                    kryterium (iv) z `oceniaj_kandydata` (ten sam
                            `ocen_swz` co pakiet SWZ P0.6 — wewnątrz
                            `_kryterium_swz`).
  - I²t:                    `network_model.solvers.conductor_thermal_
                            withstand.check_conductor_thermal_withstand` —
                            Ith z biegu zwarciowego (`ith_ka` w punkcie
                            najgorszym), czas wyłączenia `fault_duration_s`
                            PARAMETREM WEJŚCIOWYM (wymaga analizy koordynacji
                            zabezpieczeń — poza zakresem tej karty, jak w
                            `api/nn_proof.py::LVCircuitVerificationPackRequest`,
                            które TEŻ przyjmuje go jako wejście, nie liczy).
  - ΔU odcinkowy/całkowity: `application.analyses.voltage_profile_view.
                            build_voltage_profile_view` (dekompozycja P0.4),
                            ograniczona do odcinków NALEŻĄCYCH do trasy tego
                            odpływu (dopasowanie `branch_id` grafu ↔
                            `branch.ref_id` trasy przez `enm.mapping.
                            ref_to_graph_id`) — ΔU „cał." to suma ΔU
                            dopasowanych odcinków, NIE cały łańcuch SLACK→
                            punkt (który obejmowałby też stronę SN).
  - γ przewodu:              stała nazwana (Cu 58,0 / Al 35,0 MS/m przy 20°C
                            — IEC 60287-1-1 / PN-EN 60228, konduktywność
                            referencyjna miedzi/aluminium) — wyłącznie
                            PREZENTACYJNA (etykieta materiału w wierszu, nie
                            wejście do żadnego solvera tutaj).

PUSTE KOMÓRKI NIE ISTNIEJĄ: każda wielkość ma wartość (``status="OK"``) ALBO
jawny trzeci/czwarty stan (``"brak danych"``/``"nierozstrzygalne"``/
``"nie dotyczy"``) z ``reason_pl`` — wzorzec identyczny z resztą warstwy nN
(`fault_loop`/`swz`/`nn_device_selection`: pole ``status`` + ``reason_pl``).

DETERMINIZM: wiersze sortowane wg ``feeder_root_branch_ref`` (ta sama
kolejność co `build_feeder_fault_loop_view`); żadnego losowania/zbioru bez
sortowania w odpowiedzi.
"""

from __future__ import annotations

import math
from typing import Any

from application.analyses.fault_loop.route import (
    LvBusPath,
    RouteExtractionError,
    bfs_paths_from,
    group_bus_refs_by_feeder,
    path_to_bus,
)

# Import ŚWIADOMY prywatnych helperów `fault_loop.service` — DOKŁADNIE ten
# sam wzorzec i to samo uzasadnienie co w `application.analyses.swz.service`,
# `application.analyses.nn_device_selection` i `application.proof_engine.
# lv_circuit_verification_binding` (zob. docstringi tamtych modułów): stacja/
# transformator/układ sieci nN są wyławiane IDENTYCZNIE niezależnie od tego,
# KTO o nie pyta — czwarte miejsce reużycia tej samej ekstrakcji, nie nowa.
from application.analyses.fault_loop.service import (
    _NON_TN_SYSTEMS,
    _find_station,
    _station_transformer,
    _system_for_station,
    build_feeder_fault_loop_view,
)
from application.analyses.nn_device_selection import (
    KIND_FUSE_SWITCH,
    KIND_MCB,
    KIND_MCCB,
    KandydatAparatuNn,
    oceniaj_kandydata,
    wybierz_aparat_dla_obwodu_nn,
)
from application.analyses.voltage_profile_view import build_voltage_profile_view
from application.proof_engine.lv_circuit_verification_binding import (
    resolve_urzadzenie_ochronne,
)
from application.proof_engine.packs.lv_circuit_verification import UrzadzenieOchronneNn
from enm.canonical_analysis import (
    CanonicalRun,
    build_branch_results,
    build_short_circuit_results,
)
from enm.hash import compute_enm_hash
from enm.mapping import ref_to_graph_id
from enm.models import Cable, EnergyNetworkModel, Substation, Transformer
from network_model.catalog.lv_mcb_bands_iec60898 import PROG_CIEPLNY_WYZWALA_X_IN
from network_model.solvers.cable_ampacity_derating import (
    obciazalnosc_skorygowana,
    wspolczynniki_nn,
)
from network_model.solvers.conductor_thermal_withstand import (
    ConductorThermalInput,
    check_conductor_thermal_withstand,
)
from network_model.solvers.protection_lv_curves import FUSE_GG_IF_MULTIPLIER, MCCB_I2_MULTIPLIER

# Rodzaje gałęzi rozpoznawane jako „aparat" u początku odpływu — DOKŁADNIE ten
# sam zestaw co `EkranSwzNn.tsx::TYPY_APARATU` (frontend nN STUDIO), żeby
# arkusz i zakładka SWZ zgadzały się co do tego, KIEDY odpływ ma zamodelowany
# aparat u początku (jedno źródło reguły, powielone celowo po obu stronach
# granicy warstw — backend/frontend nie dzielą modułu Python).
_TYPY_APARATU = frozenset({"switch", "breaker", "disconnector", "fuse"})

# γ [MS/m przy 20°C] — konduktywność referencyjna wg IEC 60287-1-1 / PN-EN
# 60228 (miedź: 58,0 MS/m; aluminium: 35,0 MS/m — wartości katalogowe
# powszechnie przyjęte w obliczeniach kabli AC, dokładnie wzorzec karty
# ARKUSZ-NN §mapowanie „Cu 58, Al 35 MS/m"). WYŁĄCZNIE prezentacyjne — etykieta
# materiału w wierszu, nie wejście fizyki solvera.
_GAMMA_MS_PER_M: dict[str, float] = {"CU": 58.0, "AL": 35.0}


# =============================================================================
# STANY (wartość ALBO jawny trzeci/czwarty stan — zero pustych komórek)
# =============================================================================


def _wartosc(wartosc: Any, zrodlo_pl: str) -> dict[str, Any]:
    return {"status": "OK", "wartosc": wartosc, "zrodlo_pl": zrodlo_pl, "reason_pl": None}


def _brak(reason_pl: str) -> dict[str, Any]:
    return {"status": "brak danych", "wartosc": None, "zrodlo_pl": None, "reason_pl": reason_pl}


def _nie_dotyczy(reason_pl: str) -> dict[str, Any]:
    return {"status": "nie dotyczy", "wartosc": None, "zrodlo_pl": None, "reason_pl": reason_pl}


def _nierozstrzygalne(reason_pl: str) -> dict[str, Any]:
    return {
        "status": "nierozstrzygalne",
        "wartosc": None,
        "zrodlo_pl": None,
        "reason_pl": reason_pl,
    }


# =============================================================================
# Aparat zainstalowany → KandydatAparatuNn (reshaping czyste, zero fizyki) —
# umożliwia REUSE `nn_device_selection.oceniaj_kandydata` dla aparatu
# ZAINSTALOWANEGO (zamiast rankingu katalogu).
# =============================================================================


def _kandydat_z_urzadzenia(u: UrzadzenieOchronneNn) -> KandydatAparatuNn:
    zdolnosc = u.conditional_sc_current_ka if u.kind == KIND_FUSE_SWITCH else u.wlasna_zdolnosc_ka
    return KandydatAparatuNn(
        id=u.id,
        nazwa=u.nazwa,
        kind=u.kind,
        in_a=u.in_a,
        zdolnosc_wylaczania_ka=zdolnosc,
        klasa_mcb=u.klasa_mcb,
        fuse_breaking_capacity_ka=u.fuse_breaking_capacity_ka,
        ir_a=u.ir_a,
        isd_a=u.isd_a,
        ii_a=u.ii_a,
        tr_s=u.tr_s,
        tsd_s=u.tsd_s,
    )


def _nastawa_n_i_ir(u: UrzadzenieOchronneNn) -> tuple[float | None, float | None]:
    """Nastawa krotności n i Ir=In·n (kolumna wzorca) wg rodzaju aparatu.

    MCB/wkładka gG: n=1 (brak regulacji), Ir=In (§mapowanie karty).
    MCCB: n = Ir_rozwiązane/In (wyzwalacz elektroniczny), Ir = ir_a — ``None``
    gdy katalog nie niesie ir_range (nierozstrzygalne, zero fabrykacji).
    """
    if u.kind == KIND_MCCB:
        if u.ir_a is None:
            return None, None
        return (u.ir_a / u.in_a if u.in_a else None), u.ir_a
    return 1.0, u.in_a


def _k2_dla_rodzaju(kind: str) -> float | None:
    return {
        KIND_MCB: PROG_CIEPLNY_WYZWALA_X_IN,
        KIND_FUSE_SWITCH: FUSE_GG_IF_MULTIPLIER,
        KIND_MCCB: MCCB_I2_MULTIPLIER,
    }.get(kind)


# =============================================================================
# Iz′ per kabel (REUSE cable_ampacity_derating) — brak deklaracji ułożenia =
# warunki katalogowe (iloczyn=1,0), TA SAMA konwencja co domain op
# `set_nn_cable_laying_conditions`/kod W060 (readiness_bridge.py).
# =============================================================================


def _iz_prime_dla_kabla(cable: Cable) -> dict[str, Any]:
    params = cable.materialized_params if isinstance(cable.materialized_params, dict) else None
    iz_katalogowe = params.get("i_max_a") if params else None
    if iz_katalogowe is None:
        return {
            "branch_ref": cable.ref_id,
            "iz_katalogowe_a": None,
            "iz_prime_a": None,
            "rozklad": None,
            "status": "brak danych",
            "reason_pl": (
                f"Kabel '{cable.ref_id}' bez zmaterializowanej obciążalności katalogowej "
                "(materialized_params.i_max_a) — brak wiązania z katalogiem KABEL_NN."
            ),
        }
    iz_katalogowe = float(iz_katalogowe)
    warunki = (cable.meta or {}).get("cable_laying_conditions") if cable.meta else None
    if not warunki:
        return {
            "branch_ref": cable.ref_id,
            "iz_katalogowe_a": iz_katalogowe,
            "iz_prime_a": iz_katalogowe,
            "rozklad": {
                "f_temperatura": 1.0,
                "f_rezystywnosc_gruntu": 1.0,
                "f_grupowanie": 1.0,
                "iloczyn": 1.0,
            },
            "status": "OK",
            "reason_pl": (
                "Warunki katalogowe (brak zadeklarowanych warunków ułożenia — kod W060); "
                "w rzeczywistej trasie obciążalność może być mniejsza."
            ),
        }
    try:
        wspolczynniki = wspolczynniki_nn(
            srodowisko=warunki["environment"],
            izolacja=warunki["insulation"],
            temperatura_c=float(warunki["ambient_temperature_c"]),
            liczba_obwodow=int(warunki["circuit_count"]),
            rezystywnosc_gruntu_km_w=(
                float(warunki["soil_thermal_resistivity_km_w"])
                if warunki.get("soil_thermal_resistivity_km_w") is not None
                else None
            ),
        )
    except (KeyError, ValueError) as exc:
        return {
            "branch_ref": cable.ref_id,
            "iz_katalogowe_a": iz_katalogowe,
            "iz_prime_a": None,
            "rozklad": None,
            "status": "nierozstrzygalne",
            "reason_pl": f"Warunki ułożenia kabla '{cable.ref_id}' niekompletne/niepoprawne: {exc}",
        }
    iz_prime = obciazalnosc_skorygowana(iz_katalogowe, wspolczynniki)
    return {
        "branch_ref": cable.ref_id,
        "iz_katalogowe_a": iz_katalogowe,
        "iz_prime_a": iz_prime,
        "rozklad": {
            "f_temperatura": wspolczynniki.f_temperatura,
            "f_rezystywnosc_gruntu": wspolczynniki.f_rezystywnosc_gruntu,
            "f_grupowanie": wspolczynniki.f_grupowanie,
            "iloczyn": wspolczynniki.iloczyn,
        },
        "status": "OK",
        "reason_pl": wspolczynniki.zalozenie_pl(),
    }


# =============================================================================
# Obciążenie (Load) — tabliczka odpływu; agregacja P/Q sumaryczna odbiorów
# osiągalnych na trasie odpływu (arytmetyka prezentacyjna: suma nameplate,
# zero fizyki rozpływu).
# =============================================================================


def _obciazenie_odplywu(enm: EnergyNetworkModel, bus_refs: set[str]) -> dict[str, Any]:
    odbiory = [ld for ld in enm.loads if ld.bus_ref in bus_refs]
    p_mw = sum(ld.p_mw for ld in odbiory)
    q_mvar = sum(ld.q_mvar for ld in odbiory)
    s_mva = math.hypot(p_mw, q_mvar)
    cos_phi = (abs(p_mw) / s_mva) if s_mva > 0.0 else None
    return {
        "p_mw": p_mw,
        "q_mvar": q_mvar,
        "s_mva": s_mva,
        "cos_phi": cos_phi,
        # Sieć nN modelowana jako trójfazowa symetryczna (Bus.voltage_kv =
        # napięcie międzyfazowe znamionowe, P/Q sumaryczne 3-fazowe) — TA SAMA
        # konwencja S=√3·U·I stosowana wprost w formule Ib „z tabliczki"
        # poniżej; nie jest to dana per-odbiór (model nie niesie liczby faz
        # pojedynczego odbioru), tylko własność architektury sieci nN.
        "fazy": 3,
        "liczba_odbiorow": len(odbiory),
    }


def _ib_z_tabliczki(p_mw: float, q_mvar: float, u_ll_kv: float) -> float:
    """Ib = S/(√3·U_LL) — arytmetyka JAWNIE nazwana wzorcem karty ARKUSZ-NN
    (§mapowanie, wiersz „Prąd oblicz. Ib"), nie nowa fizyka solvera."""
    s_mva = math.hypot(p_mw, q_mvar)
    if u_ll_kv <= 0:
        return 0.0
    return s_mva * 1000.0 / (math.sqrt(3.0) * u_ll_kv)


# =============================================================================
# Ib z biegu rozpływu — metryka `i_a` gałęzi (REUSE build_branch_results,
# ten sam wynik, który T2-WYNIKI/nnCircuitResults czyta jako `I_A` z overlay).
# =============================================================================


def _ib_z_rozplywu(run: CanonicalRun, branch_ref: str) -> float | None:
    for row in build_branch_results(run).get("rows", []):
        if (row.get("element_id") or row.get("branch_id")) == branch_ref:
            i_a = row.get("i_a")
            return float(i_a) if i_a is not None else None
    return None


def _ik_z_biegu_zwarciowego(run: CanonicalRun, bus_ref: str) -> tuple[float | None, float | None]:
    """(ikss_ka, ith_ka) w punkcie ``bus_ref`` z biegu IEC 60909 (REUSE
    build_short_circuit_results). ``(None, None)`` gdy punkt nie występuje
    w wyniku tego biegu (uczciwy brak, nie 0)."""
    for row in build_short_circuit_results(run).get("rows", []):
        if row.get("element_id") == bus_ref:
            return row.get("ikss_ka"), row.get("ith_ka")
    return None, None


# =============================================================================
# ΔU odcinkowy/całkowity — REUSE dekompozycji P0.4, ograniczone do odcinków
# NALEŻĄCYCH do trasy TEGO odpływu (dopasowanie po branch_id grafu).
# =============================================================================


def _delta_u_dla_trasy(
    run: CanonicalRun, route_branches: tuple[Any, ...], worst_bus_ref: str
) -> dict[str, Any]:
    try:
        widok = build_voltage_profile_view(run, node_ref=ref_to_graph_id(worst_bus_ref))
    except ValueError as exc:
        return _brak(str(exc))
    segmenty_pelne = (widok.get("segmenty") or {}).get("segments") or []
    if not segmenty_pelne:
        return _brak(
            "Bieg rozpływu nie niesie dekompozycji ΔU dla tego punktu (trasa nieosiągalna "
            "w aktywnej topologii biegu)."
        )
    graf_id_do_ref = {ref_to_graph_id(b.ref_id): b.ref_id for b in route_branches}
    odcinki: list[dict[str, Any]] = []
    delta_u_calk_kv = 0.0
    delta_u_calk_procent = 0.0
    for seg in segmenty_pelne:
        branch_ref = graf_id_do_ref.get(seg.get("branch_id"))
        if branch_ref is None:
            continue
        odcinki.append(
            {
                "branch_ref": branch_ref,
                "delta_u_kv": seg.get("delta_u_kv"),
                "delta_u_percent": seg.get("delta_u_percent"),
            }
        )
        delta_u_calk_kv += float(seg.get("delta_u_kv") or 0.0)
        delta_u_calk_procent += float(seg.get("delta_u_percent") or 0.0)
    if not odcinki:
        return _brak(
            "Żaden odcinek trasy tego odpływu nie występuje w dekompozycji ΔU biegu rozpływu "
            "(bieg policzony dla innej topologii/przypadku)."
        )
    return _wartosc(
        {
            "odcinkowe": odcinki,
            "calkowity_kv": delta_u_calk_kv,
            "calkowity_procent": delta_u_calk_procent,
        },
        f"dekompozycja ΔU — bieg rozpływu mocy ({run.id})",
    )


# =============================================================================
# I²t <= k²S² (wytrzymałość cieplna) — REUSE check_conductor_thermal_withstand.
# =============================================================================


def _i2t_dla_kabla(
    cable: Cable, *, ith_ka: float | None, fault_duration_s: float | None
) -> dict[str, Any]:
    if ith_ka is None:
        return _brak(
            "Brak Ith (prąd zwarciowy ekwiwalentny cieplnie) — wymaga biegu zwarciowego "
            "IEC 60909 (parametr żądania short_circuit_run_id)."
        )
    if fault_duration_s is None:
        return _brak(
            "Brak czasu wyłączenia zwarcia (fault_duration_s) — wymaga analizy koordynacji "
            "zabezpieczeń (poza zakresem tej karty); podaj jako parametr żądania."
        )
    wynik = check_conductor_thermal_withstand(
        ConductorThermalInput(
            ith_a=ith_ka * 1000.0,
            fault_duration_s=fault_duration_s,
            ith_1s_a=cable.ith_1s_a,
            jth_1s_a_per_mm2=cable.jth_1s_a_per_mm2,
            cross_section_mm2=cable.cross_section_mm2,
            conductor_material=cable.conductor_material,
            insulation=cable.insulation,
            temp_operating_c=cable.operating_temperature_c,
            temp_short_circuit_c=cable.short_circuit_temperature_c,
        )
    )
    if wynik.status == "UNAVAILABLE":
        return _nierozstrzygalne(
            wynik.decision_reason_pl
            or ("Dane cieplne przewodu niekompletne: " + ", ".join(wynik.readiness_codes))
        )
    return _wartosc(
        {
            "wytrzymuje": wynik.status == "PASS",
            "i2t_a2s": wynik.i2t_a2s,
            "i2t_dopuszczalne_a2s": wynik.i2t_admissible_a2s,
            "margines_procent": wynik.margin_percent,
            "prad_dopuszczalny_a": wynik.admissible_current_a,
        },
        "IEC 60949 / IEC 60364-4-43 §434 (I²t<=k²S², check_conductor_thermal_withstand)",
    )


# =============================================================================
# Wiersz JEDNEGO odpływu
# =============================================================================


def _znajdz_galaz(enm: EnergyNetworkModel, ref: str) -> Any | None:
    return next((b for b in enm.branches if b.ref_id == ref), None)


def _kable_na_trasie(path: LvBusPath) -> tuple[Cable, ...]:
    return tuple(b for b in path.branches if isinstance(b, Cable))


def _dlugosc_calkowita_m(kable: tuple[Cable, ...]) -> float:
    return sum(c.length_km for c in kable) * 1000.0


def _przewod_z_kabla(cable: Cable) -> dict[str, Any]:
    material: str = (cable.conductor_material or "").upper()
    return {
        "branch_ref": cable.ref_id,
        "nazwa": cable.name,
        "catalog_ref": cable.catalog_ref,
        "material": cable.conductor_material,
        "przekroj_mm2": cable.cross_section_mm2,
        "gamma_ms_m": _GAMMA_MS_PER_M.get(material) if material else None,
    }


def _build_row(
    *,
    enm: EnergyNetworkModel,
    station: Substation,
    trafo: Transformer,
    system: str,
    root_branch_ref: str,
    bus_refs_odplywu: list[str],
    hop_counts: dict[str, int],
    nr: int,
    worst_point_impedancyjny: str | None,
    load_flow_run: CanonicalRun | None,
    short_circuit_run: CanonicalRun | None,
    fault_duration_s: float | None,
    provenance: dict[str, Any],
) -> dict[str, Any]:
    root_branch = _znajdz_galaz(enm, root_branch_ref)
    ma_aparat = root_branch is not None and getattr(root_branch, "type", None) in _TYPY_APARATU

    # Punkt „najgorszy" tego odpływu: impedancyjny (pętla TN), gdy dostępny;
    # w przeciwnym razie topologiczny (najdalszy hop) — TN-niezależne, patrz
    # docstring modułu (żadna z tych dwóch reguł nie liczy fizyki tutaj —
    # obie WYBIERAJĄ spośród punktów już zaklasyfikowanych gdzie indziej).
    if worst_point_impedancyjny is not None:
        worst_bus_ref = worst_point_impedancyjny
    else:
        worst_bus_ref = max(bus_refs_odplywu, key=lambda b: hop_counts.get(b, 0))

    route_error: str | None
    try:
        path = path_to_bus(enm, trafo.lv_bus_ref, worst_bus_ref)
    except RouteExtractionError as exc:
        path = None
        route_error = str(exc)
    else:
        route_error = None

    kable = _kable_na_trasie(path) if path is not None else ()
    dlugosc_m = _dlugosc_calkowita_m(kable) if kable else None

    # --- Obciążenie (Load) / Ib ---------------------------------------
    obciazenie = _obciazenie_odplywu(enm, set(bus_refs_odplywu))
    zrodlo_ib = "tabliczka"
    zrodlo_ib_pl = "tabliczka (Σ odbiorów odpływu, S=√3·U·I)"
    ib_a: float | None = None
    if load_flow_run is not None:
        ib_a = _ib_z_rozplywu(load_flow_run, root_branch_ref)
        if ib_a is None and kable:
            # Aparat (switch/fuse) jest gałęzią BEZIMPEDANCYJNĄ dla solvera
            # rozpływu — `enm.mapping.map_enm_to_network_graph` go nie
            # emituje jako osobną gałąź `PowerFlowResultV1.branch_results`
            # (ten sam wzorzec „near-zero" co `fault_loop.route.
            # route_segments`, zob. docstring modułu tam). Prąd przez aparat
            # RÓWNA SIĘ prądowi pierwszego kabla trasy za nim (zachowanie
            # prądu na gałęzi bezimpedancyjnej — tożsamość, nie nowa fizyka).
            ib_a = _ib_z_rozplywu(load_flow_run, kable[0].ref_id)
        if ib_a is not None:
            zrodlo_ib = "rozpływ"
            zrodlo_ib_pl = f"bieg rozpływu mocy ({load_flow_run.id})"
    if ib_a is None:
        zrodlo_ib = "tabliczka"
        ib_a = _ib_z_tabliczki(obciazenie["p_mw"], obciazenie["q_mvar"], trafo.ulv_kv)
    ib_sekcja = _wartosc(ib_a, zrodlo_ib_pl)

    # --- Iz′ (min po kablach trasy — najsłabsze ogniwo) -----------------
    if kable:
        rozklady_iz = [_iz_prime_dla_kabla(c) for c in kable]
        rozstrzygalne = [r for r in rozklady_iz if r["status"] == "OK"]
        if rozstrzygalne:
            najgorszy = min(rozstrzygalne, key=lambda r: r["iz_prime_a"])
            iz_sekcja = _wartosc(
                {
                    "iz_prime_a": najgorszy["iz_prime_a"],
                    "iz_katalogowe_a": najgorszy["iz_katalogowe_a"],
                    "rozklad": najgorszy["rozklad"],
                    "branch_ref_decydujacy": najgorszy["branch_ref"],
                    "segmenty": rozklady_iz,
                },
                najgorszy["reason_pl"],
            )
            iz_prime_a: float | None = najgorszy["iz_prime_a"]
            kabel_decydujacy = next(c for c in kable if c.ref_id == najgorszy["branch_ref"])
        else:
            iz_sekcja = _brak(
                "; ".join(r["reason_pl"] for r in rozklady_iz if r.get("reason_pl"))
                or "Brak obciążalności katalogowej dla żadnego kabla trasy."
            )
            iz_prime_a = None
            kabel_decydujacy = kable[0]
        przewod_sekcja = _wartosc(
            _przewod_z_kabla(kabel_decydujacy),
            f"katalog kabla '{kabel_decydujacy.catalog_ref or kabel_decydujacy.ref_id}'",
        )
    else:
        iz_sekcja = _brak(
            route_error or "Brak odcinków kablowych na trasie do najgorszego punktu tego odpływu."
        )
        iz_prime_a = None
        przewod_sekcja = _brak(route_error or "Brak odcinków kablowych na trasie tego odpływu.")

    dlugosc_sekcja = (
        _wartosc(dlugosc_m, "suma długości odcinków kablowych trasy (model)")
        if dlugosc_m is not None
        else _brak(route_error or "Trasa do najgorszego punktu nie jest rozwiązywalna.")
    )

    # --- Dobór aparatu (Ik1_min/U0/status z wybierz_aparat_dla_obwodu_nn) --
    dobor_wejscie = None
    if system in _NON_TN_SYSTEMS:
        dobor_status = "nie dotyczy"
        dobor_reason = (
            f"Układ {system}: SWZ/pętla TN (IEC 60364-4-41) nie dotyczy — inny mechanizm "
            "ochrony przeciwporażeniowej."
        )
    elif iz_prime_a is None:
        dobor_status = "brak danych"
        dobor_reason = "Iz′ niedostępne — dobór/kryteria wymagają obciążalności skorygowanej."
    else:
        wynik_dobor = wybierz_aparat_dla_obwodu_nn(
            enm=enm,
            station_ref=station.ref_id,
            bus_ref=worst_bus_ref,
            ib_a=ib_a,
            iz_prime_a=iz_prime_a,
            ik_max_ka=None,  # dostarczone osobno niżej z biegu SC, gdy dostępny
        )
        dobor_status = wynik_dobor["status"]
        dobor_reason = wynik_dobor.get("reason_pl")
        if dobor_status == "OK":
            dobor_wejscie = wynik_dobor["dobor"]

    # --- Ik″max/min ------------------------------------------------------
    ikss_ka: float | None = None
    ith_ka: float | None = None
    zrodlo_ik_max_pl = ""
    if short_circuit_run is not None:
        ikss_ka, ith_ka = _ik_z_biegu_zwarciowego(short_circuit_run, worst_bus_ref)
        zrodlo_ik_max_pl = f"bieg zwarciowy IEC 60909 ({short_circuit_run.id})"
    ik_max_sekcja = (
        _wartosc(ikss_ka, zrodlo_ik_max_pl)
        if ikss_ka is not None
        else _brak("Brak biegu zwarciowego IEC 60909 (parametr short_circuit_run_id) dla punktu.")
    )
    ik_min_sekcja = (
        _wartosc(
            dobor_wejscie["ik1_min_a"], "pętla zwarcia IEC 60364-4-41 (Ik1_min, scenariusz MIN)"
        )
        if dobor_wejscie is not None
        else (
            _nie_dotyczy(dobor_reason)
            if dobor_status == "nie dotyczy"
            else _brak(dobor_reason or "Ik1_min niedostępne.")
        )
    )

    # --- Aparat / nastawy / kryteria (i)-(iv) — REUSE oceniaj_kandydata ---
    if not ma_aparat:
        aparat_sekcja = _brak(
            "Brak zamodelowanego aparatu zabezpieczającego u początku odpływu — pierwsza "
            "gałąź trasy nie jest wyłącznikiem/rozłącznikiem/bezpiecznikiem."
        )
        zapas_sekcja = _brak("Wymaga rozpoznanego aparatu zabezpieczającego.")
        k2_i2_sekcja = _brak("Wymaga rozpoznanego aparatu zabezpieczającego.")
        kryterium_i_sekcja = _brak("Wymaga rozpoznanego aparatu zabezpieczającego.")
        kryterium_ii_sekcja = _brak("Wymaga rozpoznanego aparatu zabezpieczającego.")
        swz_sekcja = _brak("Wymaga rozpoznanego aparatu zabezpieczającego.")
        status_doboru_sekcja = _brak("Wymaga rozpoznanego aparatu zabezpieczającego.")
    else:
        urzadzenie, reason = resolve_urzadzenie_ochronne(root_branch)
        if urzadzenie is None:
            aparat_sekcja = _brak(reason or "Aparat bez wiązania katalogowego.")
            zapas_sekcja = _brak("Wymaga rozwiązanego aparatu.")
            k2_i2_sekcja = _brak("Wymaga rozwiązanego aparatu.")
            kryterium_i_sekcja = _brak("Wymaga rozwiązanego aparatu.")
            kryterium_ii_sekcja = _brak("Wymaga rozwiązanego aparatu.")
            swz_sekcja = _brak("Wymaga rozwiązanego aparatu.")
            status_doboru_sekcja = _brak(reason or "Aparat bez wiązania katalogowego.")
        else:
            n_krotnosc, ir_a = _nastawa_n_i_ir(urzadzenie)
            aparat_sekcja = _wartosc(
                {
                    "kind": urzadzenie.kind,
                    "nazwa": urzadzenie.nazwa,
                    "in_a": urzadzenie.in_a,
                    "klasa_mcb": urzadzenie.klasa_mcb,
                    "nastawa_n": n_krotnosc,
                    "ir_a": ir_a,
                },
                f"materialized_params gałęzi '{root_branch_ref}' (Catalog Binding)",
            )
            zapas_sekcja = (
                _wartosc((ir_a - ib_a) / ir_a * 100.0, "(Ir−Ib)/Ir")
                if ir_a is not None and ir_a != 0
                else _nierozstrzygalne("Ir nierozwiązane (MCCB bez ir_range materializacji).")
            )

            kandydat_blad: str | None = None
            try:
                kandydat = _kandydat_z_urzadzenia(urzadzenie)
            except ValueError as exc:
                kandydat = None
                kandydat_blad = f"Dane katalogowe aparatu niespójne: {exc}"

            if kandydat_blad is not None:
                zle = _nierozstrzygalne(kandydat_blad)
                k2_i2_sekcja = zle
                kryterium_i_sekcja = zle
                kryterium_ii_sekcja = zle
                swz_sekcja = zle
                status_doboru_sekcja = zle
            elif dobor_wejscie is None:
                brak_wej = (
                    _brak(dobor_reason or "Ik1_min/U0 niedostępne dla tego obwodu.")
                    if dobor_status == "brak danych"
                    else _nie_dotyczy(dobor_reason or "")
                )
                k2_i2_sekcja = brak_wej
                kryterium_i_sekcja = brak_wej
                kryterium_ii_sekcja = brak_wej
                swz_sekcja = brak_wej
                status_doboru_sekcja = brak_wej
            else:
                ocena = oceniaj_kandydata(
                    kandydat=kandydat,
                    ib_a=ib_a,
                    iz_prime_a=iz_prime_a,  # type: ignore[arg-type]  # dobor_wejscie != None => iz_prime_a rozwiązane
                    ik_max_ka=ikss_ka,
                    ik1_min_a=dobor_wejscie["ik1_min_a"],
                    u0_v=dobor_wejscie["u0_v"],
                )
                kr_i = next(k for k in ocena.kryteria if k.nazwa == "Ib<=In<=Iz′")
                kr_ii = next(k for k in ocena.kryteria if k.nazwa == "I2<=1,45·Iz′")
                kr_swz = next(k for k in ocena.kryteria if k.nazwa == "SWZ przy Ik_min")
                kryterium_i_sekcja = _wartosc(
                    {"status": kr_i.status.value, "wartosci": kr_i.wartosci}, kr_i.uzasadnienie_pl
                )
                kryterium_ii_sekcja = (
                    _wartosc(
                        {"status": kr_ii.status.value, "wartosci": kr_ii.wartosci},
                        kr_ii.uzasadnienie_pl,
                    )
                    if kr_ii.status.value != "nierozstrzygalne"
                    else _nierozstrzygalne(kr_ii.uzasadnienie_pl)
                )
                k2 = _k2_dla_rodzaju(urzadzenie.kind)
                i2_a = kr_ii.wartosci.get("i2_a")
                k2_i2_sekcja = (
                    _wartosc(
                        {"k2": k2, "i2_a": i2_a},
                        kr_ii.wartosci.get("zrodlo") or "IEC 60898-1/60269-1/60947-2",
                    )
                    if i2_a is not None
                    else _nierozstrzygalne(kr_ii.uzasadnienie_pl)
                )
                swz_sekcja = (
                    _wartosc(
                        {"status": kr_swz.status.value, "wartosci": kr_swz.wartosci},
                        kr_swz.uzasadnienie_pl,
                    )
                    if kr_swz.status.value != "nierozstrzygalne"
                    else _nierozstrzygalne(kr_swz.uzasadnienie_pl)
                )
                status_doboru_sekcja = _wartosc(
                    {
                        "kwalifikuje_sie": ocena.kwalifikuje_sie,
                        "kryteria": [k.to_dict() for k in ocena.kryteria],
                    },
                    "ocena aparatu zainstalowanego wobec czterech kryteriów doboru (P0.7)",
                )

    # --- I²t --------------------------------------------------------------
    i2t_sekcja = (
        _i2t_dla_kabla(kabel_decydujacy, ith_ka=ith_ka, fault_duration_s=fault_duration_s)
        if kable
        else _brak(route_error or "Brak kabla decydującego na trasie.")
    )

    # --- ΔU -----------------------------------------------------------
    if load_flow_run is None:
        delta_u_sekcja = _brak(
            "Brak biegu rozpływu mocy (parametr load_flow_run_id) — uruchom rozpływ, żeby "
            "zobaczyć ΔU."
        )
    elif path is None:
        delta_u_sekcja = _brak(route_error or "Trasa nierozwiązywalna.")
    else:
        delta_u_sekcja = _delta_u_dla_trasy(load_flow_run, path.branches, worst_bus_ref)

    wyszczegolnienie = (
        root_branch.name if root_branch is not None and root_branch.name else root_branch_ref
    )

    return {
        "nr": nr,
        "wyszczegolnienie": wyszczegolnienie,
        "feeder_root_branch_ref": root_branch_ref,
        "worst_point_bus_ref": worst_bus_ref,
        "worst_point_zrodlo": (
            "pętla zwarcia (impedancja)"
            if worst_point_impedancyjny
            else "topologiczny (najdalszy hop)"
        ),
        "obciazenie": obciazenie,
        "ib": ib_sekcja,
        "zrodlo_ib": zrodlo_ib,
        "aparat": aparat_sekcja,
        "zapas_zabezpieczenia_procent": zapas_sekcja,
        "iz": iz_sekcja,
        "k2_i2": k2_i2_sekcja,
        "przewod": przewod_sekcja,
        "kryterium_i_ib_in_iz": kryterium_i_sekcja,
        "kryterium_ii_i2_iz": kryterium_ii_sekcja,
        "dlugosc_m": dlugosc_sekcja,
        "delta_u": delta_u_sekcja,
        "ik_max": ik_max_sekcja,
        "ik_min": ik_min_sekcja,
        "swz": swz_sekcja,
        "i2t": i2t_sekcja,
        "status_doboru": status_doboru_sekcja,
        # Karta ARKUSZ-NN §mapowanie „LEPIEJ": PROVENANCE per wiersz (nie tylko
        # raz na cały arkusz) — run_id-y biegów + rewizja modelu + świeżość,
        # żeby KAŻDY wiersz był samodzielnie identyfikowalny (wzorzec
        # `build_nn_circuit_report_section`: jeden wpis provenance na sekcję,
        # nie jeden na cały dokument — patrz docstring tamtej funkcji).
        "provenance": provenance,
    }


def _build_provenance(
    *,
    enm: EnergyNetworkModel,
    load_flow_run: CanonicalRun | None,
    short_circuit_run: CanonicalRun | None,
    fault_duration_s: float | None,
) -> dict[str, Any]:
    """PROVENANCE (run_id-y + rewizja modelu + świeżość) — JEDNO miejsce
    składania, dzielone przez ``build_nn_circuit_sheet`` (per stacja) i
    ``build_nn_circuit_sheet_row_for_breaker`` (per obwód, REUSE dla sekcji
    arkusza raportu) — zero dwóch nieznacznie różnych konstrukcji tego
    samego słownika (KLASA NIE INSTANCJA)."""
    enm_hash = compute_enm_hash(enm)
    return {
        "load_flow_run_id": str(load_flow_run.id) if load_flow_run else None,
        "short_circuit_run_id": str(short_circuit_run.id) if short_circuit_run else None,
        "fault_duration_s": fault_duration_s,
        "rewizja_modelu": enm_hash,
        "swiezosc": {
            "load_flow_aktualny": (
                load_flow_run.snapshot_hash == enm_hash if load_flow_run else None
            ),
            "short_circuit_aktualny": (
                short_circuit_run.snapshot_hash == enm_hash if short_circuit_run else None
            ),
        },
    }


# =============================================================================
# ORKIESTRACJA — cała stacja/rozdzielnica
# =============================================================================


def build_nn_circuit_sheet(
    *,
    enm: EnergyNetworkModel,
    station_ref: str,
    load_flow_run: CanonicalRun | None = None,
    short_circuit_run: CanonicalRun | None = None,
    fault_duration_s: float | None = None,
) -> dict[str, Any]:
    """Arkusz obliczeń obwodów nN — wszystkie odpływy JEDNEJ rozdzielnicy/stacji.

    ``load_flow_run``/``short_circuit_run`` to biegi JUŻ ZWALIDOWANE przez
    wołającego (case_id, status FINISHED, rodzaj analizy — warstwa API,
    wzorzec ``quality_analysis_runs._require_run``); tu przyjmowane jako
    obiekty gotowe, zero walidacji przynależności do case.
    """
    station = _find_station(enm, station_ref)
    if station is None:
        return {
            "status": "brak danych",
            "station_ref": station_ref,
            "wiersze": [],
            "missing_data": ["station"],
            "reason_pl": None,
        }

    trafo = _station_transformer(enm, station)
    if trafo is None:
        return {
            "status": "brak danych",
            "station_ref": station_ref,
            "station_name": station.name,
            "wiersze": [],
            "missing_data": ["transformer"],
            "reason_pl": None,
        }

    system = _system_for_station(station)
    provenance = _build_provenance(
        enm=enm,
        load_flow_run=load_flow_run,
        short_circuit_run=short_circuit_run,
        fault_duration_s=fault_duration_s,
    )

    try:
        paths = bfs_paths_from(enm, trafo.lv_bus_ref)
    except RouteExtractionError as exc:
        return {
            "status": "brak danych",
            "station_ref": station_ref,
            "station_name": station.name,
            "wiersze": [],
            "missing_data": ["route"],
            "reason_pl": str(exc),
        }

    grupy = group_bus_refs_by_feeder(paths)
    if not grupy:
        return {
            "status": "OK",
            "station_ref": station_ref,
            "station_name": station.name,
            "network_system": system,
            "wiersze": [],
            "missing_data": [],
            "reason_pl": None,
            "provenance": provenance,
        }

    hop_counts = {bus_ref: p.hop_count for bus_ref, p in paths.items()}

    worst_impedancyjny: dict[str, str | None] = {}
    if system not in _NON_TN_SYSTEMS:
        widok_petli = build_feeder_fault_loop_view(enm, station_ref)
        if widok_petli.get("status") == "OK":
            for f in widok_petli.get("feeders", []):
                worst_impedancyjny[f["feeder_root_branch_ref"]] = f.get("worst_point_bus_ref")

    wiersze = []
    for nr, root_branch_ref in enumerate(sorted(grupy), start=1):
        wiersze.append(
            _build_row(
                enm=enm,
                station=station,
                trafo=trafo,
                system=system,
                root_branch_ref=root_branch_ref,
                bus_refs_odplywu=grupy[root_branch_ref],
                hop_counts=hop_counts,
                nr=nr,
                worst_point_impedancyjny=worst_impedancyjny.get(root_branch_ref),
                load_flow_run=load_flow_run,
                short_circuit_run=short_circuit_run,
                fault_duration_s=fault_duration_s,
                provenance=provenance,
            )
        )

    return {
        "status": "OK",
        "station_ref": station_ref,
        "station_name": station.name,
        "network_system": system,
        "wiersze": wiersze,
        "missing_data": [],
        "reason_pl": None,
        "provenance": provenance,
    }


def build_nn_circuit_sheet_row_for_breaker(
    *,
    enm: EnergyNetworkModel,
    station_ref: str,
    bus_ref: str,
    breaker_ref: str,
    load_flow_run: CanonicalRun | None = None,
    short_circuit_run: CanonicalRun | None = None,
    fault_duration_s: float | None = None,
) -> dict[str, Any]:
    """Jeden wiersz arkusza dla OBWODU WSKAZANEGO WPROST (``bus_ref`` +
    ``breaker_ref``), nie wykrytego automatycznie BFS-em jak w
    ``build_nn_circuit_sheet``. REUSE point dla ``api.analysis_run_exports.
    build_nn_circuit_report_section`` (karta ARKUSZ-NN §0 pkt 4 — sekcja
    arkusza w raporcie, addytywnie): TEN SAM budowniczy wiersza (``_build_row``),
    tylko wywołany dla punktu/aparatu wskazanych przez wołającego zamiast
    „najgorszego punktu odpływu wykrytego topologicznie" — zero drugiej
    implementacji wiersza (KLASA NIE INSTANCJA).
    """
    station = _find_station(enm, station_ref)
    if station is None:
        return {"status": "brak danych", "missing_data": ["station"], "reason_pl": None}
    trafo = _station_transformer(enm, station)
    if trafo is None:
        return {"status": "brak danych", "missing_data": ["transformer"], "reason_pl": None}
    system = _system_for_station(station)
    try:
        hop_count = len(path_to_bus(enm, trafo.lv_bus_ref, bus_ref).branches)
    except RouteExtractionError as exc:
        return {"status": "brak danych", "missing_data": ["route"], "reason_pl": str(exc)}

    wiersz = _build_row(
        enm=enm,
        station=station,
        trafo=trafo,
        system=system,
        root_branch_ref=breaker_ref,
        bus_refs_odplywu=[bus_ref],
        hop_counts={bus_ref: hop_count},
        nr=1,
        worst_point_impedancyjny=bus_ref,
        load_flow_run=load_flow_run,
        short_circuit_run=short_circuit_run,
        fault_duration_s=fault_duration_s,
        provenance=_build_provenance(
            enm=enm,
            load_flow_run=load_flow_run,
            short_circuit_run=short_circuit_run,
            fault_duration_s=fault_duration_s,
        ),
    )
    return {"status": "OK", **wiersz}
