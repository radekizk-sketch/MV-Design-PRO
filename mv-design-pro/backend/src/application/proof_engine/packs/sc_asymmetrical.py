"""
SC Asymmetrical Proof Pack — Pakiet dowodowy dla zwarć asymetrycznych

STATUS: CANONICAL & BINDING
Reference: P11_1c_SC_ASYMMETRICAL.md, PROOF_SCHEMAS.md, §4.1 EXECPLAN

Generuje pakiet dowodowy zawierający dowody dla WSZYSTKICH typów
zwarć asymetrycznych IEC 60909:
- 1F-Z (jednofazowe doziemne)
- 2F   (dwufazowe)
- 2F-Z (dwufazowe doziemne)

Każdy dowód zawiera OBOWIĄZKOWE wyniki:
- I''k (początkowy prąd zwarciowy)
- ip   (prąd udarowy)
- I_th (prąd cieplny równoważny)
- I_dyn (prąd dynamiczny)

INVARIANTS:
- Fizyka WYŁĄCZNIE w warstwie solverów (V12K-118): wielkości zwarciowe liczy
  ``compute_sc1_asymmetrical_quantities`` (network_model/solvers), a generator
  dowodu dostaje gotowy wynik i wyłącznie formatuje kroki (NOT-A-SOLVER)
- Deterministic (same input → identical output)
- Anti-double-counting c (c appears ONLY in EQ_SC1_008)
- LaTeX-only math (all formulas in block LaTeX)
- Karta PRZERWA-ZEROWA: punkt z nazwaną przyczyną braku wyniku zerowego (brak drogi prądu
  zerowego, sieć izolowana albo skompensowana, brak danych Z0 — ``enm.mapping.
  zbuduj_siec_zerowa``) dostaje dowód 2F i ODMOWĘ NAZWANĄ 1F-Z i 2F-Z (``odmowy_doziemne``:
  status, kod, wyjaśnienie) — nigdy dowodu z Z0 kotwicy numerycznej (Z0 ≈ 0 udawało
  uziemienie bezpośrednie: szyna SN za Dyn11 bez uziemienia dawała I″k1 = 4062,43 A).
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from application.proof_engine.proof_generator import ProofGenerator, SC1Input
from application.proof_engine.proof_pack import (
    ProofPackBuilder,
    ProofPackContext,
    deterministic_artifact_id,
    dokument_deterministyczny,
    zbuduj_zip_zbiorczy,
)
from application.proof_engine.types import ProofDocument
from network_model.core.voltage_factor import NadpisanieC, Scenario
from network_model.pochodne import v_na_kv
from network_model.solvers.short_circuit_asymmetrical_quantities import (
    compute_sc1_asymmetrical_quantities,
)


@dataclass
class SCAsymmetricalPackInput:
    """
    Dane wejściowe dla pakietu dowodowego SC Asymmetrical.

    Zawiera wspólne parametry sieci (impedancje składowe) oraz
    konfigurację dla generowania dowodów 1F-Z, 2F, 2F-Z.
    """

    project_name: str
    case_name: str
    fault_node_id: str
    run_timestamp: datetime
    solver_version: str

    # Dane znamionowe
    u_n_kv: float
    c_factor: float
    u_prefault_kv: float
    #: Podstawa c (karta WSPOLCZYNNIK-C-JEDEN-NOSNIK): `voltage_factor.DoborC.zrodlo` —
    #: tabela 1 IEC 60909-0 dla pasma węzła i scenariusza albo nadpisanie z uzasadnieniem.
    c_zrodlo: str

    # Impedancje składowe: Z1, Z2 — wszystkie typy; Z0 — wyłącznie zwarcia doziemne. ``None``
    # = punkt bez wyniku zerowego (``brak_wyniku_zerowego`` niesie przyczynę — para pól
    # z jednego źródła: ``short_circuit_binding.zwarcie_niesymetryczne_ze_snapshotu``).
    z1_ohm: complex
    z2_ohm: complex
    z0_ohm: complex | None

    # Operator Fortescue (domyślnie a = e^{j120°})
    a_operator: complex

    #: Czas trwania zwarcia t_k [s] — dana biegu (scenariusz), nie stała pakietu. Z niego
    #: i z κ KAŻDEGO typu zwarcia rdzeń liczy m, n i I_th (karta SC-IB-ITH-ZRODLA); dawne
    #: pola m_factor/n_factor (m, n wyniku 1F-Z podawane także 2F i 2F-Z) skasowane.
    tk_s: float

    #: Karta OD-14: impedancja przejścia Z_f [Ω] biegu, którego pakiet powstaje; None =
    #: zwarcie metaliczne IEC 60909 (dowody bit w bit jak przed kartą).
    z_f_ohm: complex | None = None

    #: Karta PRZERWA-ZEROWA: przyczyna braku wyniku zerowego punktu
    #: (``BrakWynikuZerowego.to_dict``: przyczyna, kod, status, wyjaśnienie, elementy) —
    #: obecna wtedy i tylko wtedy, gdy ``z0_ohm`` jest ``None``.
    brak_wyniku_zerowego: Mapping[str, Any] | None = None

    def __post_init__(self) -> None:
        if (self.z0_ohm is None) != (self.brak_wyniku_zerowego is not None):
            raise ValueError(
                "Pakiet zwarć niesymetrycznych: brak Z0 wymaga nazwanej przyczyny braku "
                "wyniku zerowego, a przyczyna wyklucza Z0 (jedno źródło pary pól)."
            )


@dataclass(frozen=True)
class SCAsymmetricalPackResult:
    """
    Wynik pakietu dowodowego SC Asymmetrical.

    Zawiera:
    - proof_1fz: Dowód zwarcia 1F-Z
    - proof_2f:  Dowód zwarcia 2F
    - proof_2fz: Dowód zwarcia 2F-Z
    - all_passed: Czy wszystkie unit checks przeszły
    """

    proof_1fz: ProofDocument | None
    proof_2f: ProofDocument
    proof_2fz: ProofDocument | None
    all_passed: bool
    #: Karta PRZERWA-ZEROWA: odmowa nazwana zwarć doziemnych punktu bez wyniku zerowego
    #: (``SCAsymmetricalProofPack.odmowy_doziemne``) — wtedy ``proof_1fz``/``proof_2fz`` są
    #: ``None``. Puste = punkt z drogą prądu zerowego, trzy dowody.
    odmowy_doziemne: Mapping[str, Mapping[str, Any]] | None = None

    def to_dict(self) -> dict[str, Any]:
        wynik: dict[str, Any] = {
            "proof_1fz": self.proof_1fz.to_dict() if self.proof_1fz is not None else None,
            "proof_2f": self.proof_2f.to_dict(),
            "proof_2fz": self.proof_2fz.to_dict() if self.proof_2fz is not None else None,
            "all_passed": self.all_passed,
        }
        if self.odmowy_doziemne:
            wynik["odmowy_doziemne"] = {k: dict(v) for k, v in self.odmowy_doziemne.items()}
        return wynik


class SCAsymmetricalProofPack:
    """
    Generator pakietu dowodowego SC Asymmetrical.

    Generuje dowody dla WSZYSTKICH trzech typów zwarć asymetrycznych
    z jednego zestawu danych wejściowych.
    """

    FAULT_TYPES = ("ONE_PHASE_TO_GROUND", "TWO_PHASE", "TWO_PHASE_TO_GROUND")
    #: Typy zwarć z ziemią — wymagają Z0 (karta PRZERWA-ZEROWA).
    FAULT_TYPES_DOZIEMNE = ("ONE_PHASE_TO_GROUND", "TWO_PHASE_TO_GROUND")
    #: Nazwa wpisu pakietu zbiorczego per typ zwarcia (te same klucze co ``generate_zip``).
    NAZWY_WPISOW = {
        "ONE_PHASE_TO_GROUND": "SC1FZ",
        "TWO_PHASE": "SC2F",
        "TWO_PHASE_TO_GROUND": "SC2FZ",
    }
    #: Rodzaj zwarcia po polsku — zdanie odmowy nazwanej.
    _RODZAJ_PL = {
        "ONE_PHASE_TO_GROUND": "Zwarcie jednofazowe z ziemią (1F-Z)",
        "TWO_PHASE_TO_GROUND": "Zwarcie dwufazowe z ziemią (2F-Z)",
    }

    @classmethod
    def odmowy_doziemne(cls, data: SCAsymmetricalPackInput) -> dict[str, dict[str, Any]] | None:
        """Odmowa nazwana dowodów 1F-Z i 2F-Z punktu bez wyniku zerowego (``None`` — punkt
        z drogą prądu zerowego). Rekord wg kontraktu werdyktu wyjaśnialnego: rodzaj zwarcia,
        status maszynowy ZWIĄZANY z wyjaśnieniem (zdanie, przyczyna, czego brakuje), kod
        ``fault.zero_sequence_*`` i elementy modelu. Klucz = nazwa wpisu pakietu zbiorczego."""
        if data.brak_wyniku_zerowego is None:
            return None
        brak = dict(data.brak_wyniku_zerowego)
        return {
            cls.NAZWY_WPISOW[typ]: {
                "rodzaj_zwarcia": typ,
                "rodzaj_zwarcia_pl": cls._RODZAJ_PL[typ],
                "dowod": None,
                **brak,
            }
            for typ in cls.FAULT_TYPES_DOZIEMNE
        }

    @classmethod
    def generate(
        cls,
        data: SCAsymmetricalPackInput,
        artifact_id: UUID | None = None,
    ) -> SCAsymmetricalPackResult:
        """
        Generuje kompletny pakiet dowodowy SC Asymmetrical.

        Args:
            data: Dane wejściowe
            artifact_id: Opcjonalny wspólny artifact_id

        Returns:
            SCAsymmetricalPackResult z trzema dowodami
        """
        if artifact_id is None:
            artifact_id = uuid4()

        proofs: dict[str, ProofDocument] = {}
        for fault_type in cls.FAULT_TYPES:
            if data.z0_ohm is None and fault_type in cls.FAULT_TYPES_DOZIEMNE:
                # Punkt bez wyniku zerowego: dowód doziemny zastępuje odmowa nazwana
                # (``odmowy_doziemne``), nie liczba z Z0 kotwicy numerycznej.
                continue
            # Fizyka w warstwie solverów (NOT-A-SOLVER): komplet wielkości
            # zwarciowych liczy solver, generator dowodu tylko formatuje.
            quantities = compute_sc1_asymmetrical_quantities(
                fault_type=fault_type,
                u_n_kv=data.u_n_kv,
                c_factor=data.c_factor,
                u_prefault_kv=data.u_prefault_kv,
                z1_ohm=data.z1_ohm,
                z2_ohm=data.z2_ohm,
                z0_ohm=data.z0_ohm,
                a_operator=data.a_operator,
                tk_s=data.tk_s,
                z_f_ohm=data.z_f_ohm,
            )
            sc1_input = SC1Input(
                project_name=data.project_name,
                case_name=f"{data.case_name} — {fault_type}",
                fault_node_id=data.fault_node_id,
                fault_type=fault_type,
                run_timestamp=data.run_timestamp,
                solver_version=data.solver_version,
                u_n_kv=data.u_n_kv,
                c_factor=data.c_factor,
                c_zrodlo=data.c_zrodlo,
                u_prefault_kv=data.u_prefault_kv,
                z1_ohm=data.z1_ohm,
                z2_ohm=data.z2_ohm,
                z0_ohm=data.z0_ohm,
                a_operator=data.a_operator,
                quantities=quantities,
                # Z_f po regule solvera (Z_f = 0 → zwarcie metaliczne) — dowód opisuje TĘ
                # impedancję, z którą liczono wielkości, nie surowe wejście pakietu.
                z_f_ohm=quantities.z_f_ohm,
            )
            proofs[fault_type] = ProofGenerator.generate_sc1_proof(sc1_input, artifact_id)

        all_passed = all(p.summary.unit_check_passed for p in proofs.values())

        return SCAsymmetricalPackResult(
            proof_1fz=proofs.get("ONE_PHASE_TO_GROUND"),
            proof_2f=proofs["TWO_PHASE"],
            proof_2fz=proofs.get("TWO_PHASE_TO_GROUND"),
            all_passed=all_passed,
            odmowy_doziemne=cls.odmowy_doziemne(data),
        )

    @classmethod
    def generate_zip(
        cls,
        data: SCAsymmetricalPackInput,
        context: ProofPackContext,
    ) -> dict[str, bytes]:
        """
        Generuje ZIP-y z dowodami dla każdego typu zwarcia.

        Identyfikator artefaktu wyprowadzany z tożsamości pakietu — inaczej dwa
        pobrania tego samego przebiegu różniłyby się bajtami, wbrew deklaracji
        determinizmu w ``manifest.json``.

        Returns:
            dict mapping fault_type → ZIP bytes. Punkt bez wyniku zerowego (karta
            PRZERWA-ZEROWA) — wyłącznie ``SC2F``; odmowy 1F-Z i 2F-Z niesie
            ``odmowy_doziemne`` (wpisy JSON pakietu zbiorczego, ``zbuduj_zip_zbiorczy``).
        """
        result = cls.generate(data, deterministic_artifact_id(context))
        builder = ProofPackBuilder(context)

        def _zbuduj(dokument: ProofDocument) -> bytes:
            return builder.build(dokument_deterministyczny(dokument, context, data.run_timestamp))

        dowody = {
            "SC1FZ": result.proof_1fz,
            "SC2F": result.proof_2f,
            "SC2FZ": result.proof_2fz,
        }
        return {nazwa: _zbuduj(dowod) for nazwa, dowod in dowody.items() if dowod is not None}

    @classmethod
    def wejscie_ze_snapshotu(
        cls,
        *,
        snapshot: dict[str, Any],
        fault_node_id: str,
        project_name: str,
        case_name: str,
        run_timestamp: datetime,
        solver_version: str,
        scenariusz: Scenario,
        nadpisanie_c: NadpisanieC | None,
        tk_s: float,
        rozszerzenia_audit2: dict[str, Any] | None = None,
        z_f_ohm: complex | None = None,
    ) -> SCAsymmetricalPackInput:
        """Zbuduj wejście pakietu z KANONICZNEGO SNAPSHOTU ENM (ZERO fizyki u klienta).

        DEFEKT, KTÓRY TO ZAMYKA (karta PACK-DOWODY). Dotąd jedyną drogą do tego
        pakietu był kontrakt wymagający od WYWOŁUJĄCEGO impedancji składowych
        Z1/Z2/Z0, napięcia ``U_f`` i operatora Fortescue ``a`` — czyli wielkości
        fizycznych. Interfejs, który ich nie liczy (i liczyć nie wolno mu), nie mógł
        po ten pakiet sięgnąć; końcówka stała bez konsumenta.

        Droga jest ta sama co w pakiecie SC3F (``sc_symmetrical.py``): snapshot →
        wynik → wejście dowodu. Impedancje składowe pochodzą z FROZEN wyniku
        solvera zwarcia jednofazowego (jedyny wariant liczący sieć zerową ``Z0``,
        potrzebną dla 1F-Z i 2F-Z), ``U_f`` i ``a`` — ze stałych warstwy solverów.

        FIZYKA NIE DZIEJE SIĘ TUTAJ (poprawione 2026-08-07). Mapowanie snapshotu,
        macierz zerowa i wejście w solver stoją w warstwie wiązania
        (``application/solvers/short_circuit_binding.py``) — patrz komentarz przy
        ``zwarcie_niesymetryczne_ze_snapshotu``. Pakiet dostaje gotowy FROZEN wynik i
        tylko go opisuje, zgodnie z rolą Proof Engine (interpretacja, nie produkcja
        liczb). Wcześniejsza wersja liczyła to sama i zapalała
        ``no_direct_fault_params_guard``.

        ``z_f_ohm`` (karta OD-14) — impedancja przejścia biegu: impedancje składowe Z1/Z2/Z0
        sieci od niej nie zależą (wynik 1F liczony metalicznie daje te same Z1/Z2/Z0), więc
        Z_f idzie wprost do wielkości dowodu (``compute_sc1_asymmetrical_quantities``).
        """
        from application.solvers.short_circuit_binding import (
            zwarcie_niesymetryczne_ze_snapshotu,
        )
        from network_model.solvers.short_circuit_asymmetrical_quantities import (
            OPERATOR_FORTESCUE_A,
            napiecie_fazowe_przedzwarciowe_kv,
        )

        zwarcie = zwarcie_niesymetryczne_ze_snapshotu(
            snapshot=snapshot,
            fault_node_id=fault_node_id,
            scenariusz=scenariusz,
            nadpisanie_c=nadpisanie_c,
            tk_s=tk_s,
            # Pakiet bierze z wyniku wyłącznie impedancje składowe Z1/Z2/Z0 sieci; prąd
            # wyłączeniowy zwarć niesymetrycznych to I_b = I″k (IEC 60909-0 rozdz. 9), więc
            # t_b nie wpływa na żadną wielkość tego pakietu.
            tb_s=None,
            rozszerzenia_audit2=rozszerzenia_audit2,
        )
        result = zwarcie.wynik
        brak = zwarcie.brak_wyniku_zerowego
        if (
            result.z1_ohm is None
            or result.z2_ohm is None
            or (brak is None and result.z0_ohm is None)
        ):
            raise ValueError(
                "Wynik zwarcia nie niesie impedancji składowych zgodnej, przeciwnej i zerowej — "
                "pakietu zwarć niesymetrycznych nie da się złożyć dla tego punktu"
            )
        u_n_kv = v_na_kv(result.un_v)
        return SCAsymmetricalPackInput(
            project_name=project_name,
            case_name=case_name,
            fault_node_id=result.fault_node_id,
            run_timestamp=run_timestamp,
            solver_version=solver_version,
            u_n_kv=u_n_kv,
            c_factor=result.c_factor,
            c_zrodlo=zwarcie.dobor_c.zrodlo,
            u_prefault_kv=napiecie_fazowe_przedzwarciowe_kv(
                u_n_kv=u_n_kv, c_factor=result.c_factor
            ),
            z1_ohm=result.z1_ohm,
            z2_ohm=result.z2_ohm,
            # Punkt bez wyniku zerowego: wynik 2F nie ma Z0 — dowody doziemne zastępuje odmowa
            # nazwana z przyczyną (para pól z jednego źródła).
            z0_ohm=result.z0_ohm if brak is None else None,
            a_operator=OPERATOR_FORTESCUE_A,
            tk_s=result.tk_s,
            z_f_ohm=z_f_ohm,
            brak_wyniku_zerowego=brak.to_dict() if brak is not None else None,
        )

    @classmethod
    def zbuduj_zip_zbiorczy(
        cls,
        packs: dict[str, bytes],
        odmowy: Mapping[str, Mapping[str, Any]] | None = None,
    ) -> bytes:
        """Jeden ZIP zbiorczy z trzech pakietów (1F-Z / 2F / 2F-Z), deterministyczny.

        Samo pakowanie stoi w warstwie pakietu (``proof_pack.zbuduj_zip_zbiorczy``)
        — REUŻYCIE, nie druga droga: ten sam bundler składa pakiet zbiorczy
        rozpływu (rozpływ / straty / spadek napięcia). Ta metoda zostaje jako
        nazwa czytelna w miejscu użycia (router zwarciowy, brama przebiegu).
        """
        return zbuduj_zip_zbiorczy(packs, odmowy=odmowy)

    @classmethod
    def validate_completeness(cls, result: SCAsymmetricalPackResult) -> list[str]:
        """
        Weryfikuje kompletność pakietu dowodowego.

        MANDATORY results per §4.1:
        - ikss_ka (I''k)
        - ip_ka (ip)
        - ith_ka (I_th)
        - idyn_ka (I_dyn)

        Returns:
            Lista brakujących kluczy (pusta = PASS)
        """
        required_keys = {"ikss_ka", "ip_ka", "ith_ka", "idyn_ka"}
        missing: list[str] = []

        odmowy = result.odmowy_doziemne or {}
        for label, wpis, proof in [
            ("1F-Z", "SC1FZ", result.proof_1fz),
            ("2F", "SC2F", result.proof_2f),
            ("2F-Z", "SC2FZ", result.proof_2fz),
        ]:
            if proof is None:
                # Karta PRZERWA-ZEROWA: dowód doziemny punktu bez wyniku zerowego jest
                # kompletny jako odmowa nazwana — brak obu to luka pakietu.
                if wpis not in odmowy:
                    missing.append(f"{label}: dowód albo odmowa nazwana")
                continue
            for key in required_keys:
                if key not in proof.summary.key_results:
                    missing.append(f"{label}: {key}")

        return missing
