from __future__ import annotations

import hashlib
import json
from collections.abc import Callable, Mapping, Sequence
from datetime import datetime
from typing import Any
from uuid import UUID

from api.dependencies import get_uow_factory
from api.fault_scenarios import FaultImpedanceRequest
from api.odmowa_http import OdmowaHttpError
from application.proof_engine.packs.sc_asymmetrical import (
    SCAsymmetricalPackInput,
    SCAsymmetricalProofPack,
)
from application.proof_engine.packs.sc_symmetrical import SC3FPackInput, SC3FProofPack
from application.proof_engine.proof_pack import ProofPackContext, resolve_mv_design_pro_version
from enm.assembler import impedancja_zwarcia_z_opcji
from enm.maszyny_robocze import parametry_robocze_maszyn_punktu
from fastapi import APIRouter, Depends, HTTPException, Response, status
from infrastructure.persistence.unit_of_work import UnitOfWork
from network_model.catalog.wartosci_robocze import (
    WIELKOSCI_ZWARCIOWE,
    dane_przyjete_maszyn,
    tolerancja_nn_napiecia,
    zdanie_parametru_maszyny_pl,
)
from network_model.core.czas_wylaczenia import (
    CZAS_TB_ROBOCZY_S,
    POCHODZENIE_TB_PROJEKTANT,
    CzasWylaczeniaTb,
    czas_tb_z_danych,
)
from network_model.core.impedancja_przejscia import KLUCZ_OPCJI_IMPEDANCJI_ZWARCIA
from network_model.core.voltage_factor import (
    NadpisanieC,
    Scenario,
    TolerancjaNapieciaNn,
    dobierz_c,
    nadpisanie_c_z_danych,
)
from network_model.odmowa_danych import OdmowaDanychError
from network_model.pochodne import a_na_ka
from network_model.solvers.short_circuit_core import ShortCircuitType
from pydantic import BaseModel, ConfigDict, Field, ValidationError

router = APIRouter(prefix="/api/proof", tags=["proof-pack"])


class NadpisanieCZadanie(BaseModel):
    """Ręczne nadpisanie c z uzasadnieniem — walidacja w `voltage_factor.NadpisanieC`."""

    model_config = ConfigDict(extra="forbid")

    wartosc: float
    uzasadnienie: str


def _nadpisanie(zadanie: NadpisanieCZadanie | None) -> NadpisanieC | None:
    return nadpisanie_c_z_danych(zadanie.model_dump() if zadanie is not None else None)


#: Opis pola Z_f żądań pakietów i wkładów (karta OD-14) — jedno zdanie dla trzech żądań.
_OPIS_IMPEDANCJI_PRZEJSCIA = (
    "Impedancja przejścia Z_f biegu, którego dotyczy dowód albo wkłady (karta OD-14). "
    "Brak = zwarcie metaliczne IEC 60909; Z_f ≠ 0 = wynik poza zakresem IEC 60909."
)


def _z_f_z_zadania(impedancja: FaultImpedanceRequest | None) -> complex | None:
    """Z_f żądania — TA SAMA reguła danych i normalizacja co opcja biegu (assembler).

    Pakiet i wkłady liczone z inną regułą niż bieg opisywałyby inny prąd niż ten na ekranie
    wyników; niedopuszczalna para wraca odmową nazwaną (422 z `kod` i `dane`).
    """
    if impedancja is None:
        return None
    return impedancja_zwarcia_z_opcji({KLUCZ_OPCJI_IMPEDANCJI_ZWARCIA: impedancja.model_dump()})


class SCAsymmetricalPackRequest(BaseModel):
    project_id: str
    case_id: str
    run_id: str
    snapshot_id: str
    project_name: str
    case_name: str
    fault_node_id: str
    run_timestamp: datetime
    solver_version: str
    model_config = ConfigDict(extra="forbid")

    u_n_kv: float
    #: Karta WSPOLCZYNNIK-C-JEDEN-NOSNIK (O-59): c nie przychodzi liczbą — dobiera go
    #: `voltage_factor.dobierz_c` dla U_n i scenariusza albo z nadpisania z uzasadnieniem.
    scenariusz: Scenario
    nadpisanie_c: NadpisanieCZadanie | None = None
    #: Tolerancja sieci nN węzła zwarcia (wiersz nN tabeli 1), gdy U_n w paśmie nN. Karta
    #: TOLERANCJA-NN-WARTOSC-ROBOCZA: brak = wartość robocza rejestru, nazwana w podstawie c
    #: dowodu (`wartosci_robocze.tolerancja_nn_napiecia`).
    lv_voltage_tolerance: TolerancjaNapieciaNn | None = None
    u_prefault_kv: float
    z1_re_ohm: float
    z1_im_ohm: float
    z2_re_ohm: float
    z2_im_ohm: float
    z0_re_ohm: float
    z0_im_ohm: float
    a_re: float
    a_im: float
    #: Czas trwania zwarcia t_k [s]; m, n i I_th każdego typu zwarcia liczy rdzeń z t_k i κ
    #: tego typu (karta SC-IB-ITH-ZRODLA) — dawne pola m_factor/n_factor (liczby fizyczne
    #: od klienta, jedne dla trzech różnych pętli) skasowane.
    tk_s: float = 1.0
    fault_impedance: FaultImpedanceRequest | None = Field(
        default=None, description=_OPIS_IMPEDANCJI_PRZEJSCIA
    )


@router.get("/{project_id}/{case_id}/{run_id}/pack")
def download_proof_pack(
    project_id: UUID,
    case_id: UUID,
    run_id: UUID,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> Response:
    _ = project_id, case_id, run_id, uow_factory
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail=(
            "Legacy proof-pack GET oparty o AnalysisRun/OperatingCase został wycofany z toru "
            "produkcyjnego V12.xx. Użyj kanonicznych eksportów i proof dla StudyCase."
        ),
    )


def _extract_snapshot_id(payload: dict) -> str:
    snapshot_id = payload.get("snapshot_id")
    if snapshot_id:
        return str(snapshot_id)
    active_snapshot = payload.get("active_snapshot_id")
    if active_snapshot:
        return str(active_snapshot)
    return "unknown"


@router.post("/sc-asymmetrical/pack")
def download_sc_asymmetrical_pack(payload: SCAsymmetricalPackRequest) -> Response:
    context = ProofPackContext(
        project_id=payload.project_id,
        case_id=payload.case_id,
        run_id=payload.run_id,
        snapshot_id=payload.snapshot_id,
        mv_design_pro_version=resolve_mv_design_pro_version(),
    )
    tolerancja_nn = tolerancja_nn_napiecia(payload.u_n_kv, payload.lv_voltage_tolerance)
    dobor_c = dobierz_c(
        payload.u_n_kv,
        payload.scenariusz,
        _nadpisanie(payload.nadpisanie_c),
        tolerancja_nn=tolerancja_nn.wartosc if tolerancja_nn is not None else None,
        tolerancja_nn_robocza=tolerancja_nn is not None and tolerancja_nn.robocza,
    )
    pack_input = SCAsymmetricalPackInput(
        project_name=payload.project_name,
        case_name=payload.case_name,
        fault_node_id=payload.fault_node_id,
        run_timestamp=payload.run_timestamp,
        solver_version=payload.solver_version,
        u_n_kv=payload.u_n_kv,
        c_factor=dobor_c.wartosc,
        c_zrodlo=dobor_c.zrodlo,
        u_prefault_kv=payload.u_prefault_kv,
        z1_ohm=complex(payload.z1_re_ohm, payload.z1_im_ohm),
        z2_ohm=complex(payload.z2_re_ohm, payload.z2_im_ohm),
        z0_ohm=complex(payload.z0_re_ohm, payload.z0_im_ohm),
        a_operator=complex(payload.a_re, payload.a_im),
        tk_s=payload.tk_s,
        z_f_ohm=_z_f_z_zadania(payload.fault_impedance),
    )
    packs = SCAsymmetricalProofPack.generate_zip(pack_input, context)
    content = SCAsymmetricalProofPack.zbuduj_zip_zbiorczy(packs)
    headers = {
        "Content-Disposition": (
            f'attachment; filename="pakiet_dowodowy_sc_asymetryczne__{payload.run_id}.zip"'
        )
    }
    return Response(content=content, media_type="application/zip", headers=headers)


class SC3FPackRequest(BaseModel):
    project_id: str
    case_id: str
    run_id: str
    snapshot_id: str
    project_name: str
    case_name: str
    fault_node_id: str
    run_timestamp: datetime
    solver_version: str
    # Kanoniczny snapshot ENM — fizyka (I″k + rozbicie maszynowe μ/q/i_b) liczona
    # po stronie serwera, ZERO fizyki w UI (G-SCM F2, V12K-054).
    snapshot: dict[str, Any]
    model_config = ConfigDict(extra="forbid")

    scenariusz: Scenario
    nadpisanie_c: NadpisanieCZadanie | None = None
    tk_s: float = Field(1.0, description="Czas trwania zwarcia t_k [s]")
    #: Karta SC-IB-ITH-ZRODLA: czas wyłączenia t_b [s] scenariusza biegu; brak = t_b punktu
    #: rozstrzyga warstwa wiązania tą samą funkcją co bieg (karta TB-WARTOSC-ROBOCZA:
    #: najkrótszy czas wyłączenia pól lokalnych, inaczej wartość robocza 0,1 s).
    tb_s: float | None = Field(
        default=None,
        description=(
            "Czas wyłączenia t_b [s] scenariusza (najkrótszy czas zabezpieczenia + "
            "wyłącznika); brak = t_b punktu z pól lokalnych albo wartość robocza "
            f"{f'{CZAS_TB_ROBOCZY_S:g}'.replace('.', ',')} s"
        ),
    )
    fault_impedance: FaultImpedanceRequest | None = Field(
        default=None, description=_OPIS_IMPEDANCJI_PRZEJSCIA
    )


class SCContributionsRequest(BaseModel):
    """Zadanie wkladow zwarciowych per punkt (R3-B / K3-G3, FLOW EKSPERT+).

    Kanoniczny snapshot ENM + punkt zwarcia — fizyka (rozbicie maszynowe
    mu/q/i_b, IEC 60909-0:2016 rozdz. 9) liczona po stronie serwera przez ten sam
    solver co pakiet dowodowy SC3F (`compute_machine_contributions`).
    ZERO fizyki w UI; odpowiedz JSON zawiera slad WHITE BOX solvera.
    """

    model_config = ConfigDict(extra="forbid")

    snapshot: dict[str, Any]
    fault_node_id: str
    #: Scenariusz OGLĄDANEGO biegu (karta WSPOLCZYNNIK-C-JEDEN-NOSNIK) — c z tabeli 1
    #: IEC 60909-0 dla pasma węzła zwarcia; dawne `c_factor: 1.10` dawało c SN w węźle nN.
    scenariusz: Scenario
    nadpisanie_c: NadpisanieCZadanie | None = None
    #: Karta SC-IB-ITH-ZRODLA: t_min = t_b scenariusza biegu [s]; brak = t_b punktu
    #: rozstrzygnięty tą samą funkcją co wiersz biegu (karta TB-WARTOSC-ROBOCZA: pola
    #: lokalne, inaczej wartość robocza 0,1 s) — pochodzenie w odpowiedzi (`t_min_zrodlo`).
    t_min_s: float | None = None
    fault_impedance: FaultImpedanceRequest | None = Field(
        default=None, description=_OPIS_IMPEDANCJI_PRZEJSCIA
    )


# Odwolania normowe sekcji wywodu (ZWARCIA-PRO F3 pkt 8).
_NORMA_IEC_60909 = "IEC 60909-0:2016"
_NORMA_IEC_60909_66 = "IEC 60909-0:2016 §6.6"


def _ka_pl(prad_a: float) -> str:
    """Prąd w kA w zdaniu dla projektanta — 3 miejsca, przecinek dziesiętny (karta #145)."""
    return f"{a_na_ka(prad_a):.3f}".replace(".", ",")


def _liczba_pl(wartosc: float, miejsca: int) -> str:
    """Liczba w zdaniu dla projektanta — stała liczba miejsc, przecinek dziesiętny."""
    return f"{wartosc:.{miejsca}f}".replace(".", ",")


def _krok_reguly_malych_silnikow(result: Any) -> dict[str, Any]:
    """PELNY krok reguly malych silnikow (ZWARCIA-PRO F3 pkt 9, par. 6.6).

    Tresc reguly + wymaganie normy (suma I''k,M <= 0.05*I''k) + wartosc graniczna
    + wartosc obliczona + werdykt SPELNIONA/NIESPELNIONA + wplyw na wynik (Ib).
    Czysty formatter: liczby z white_box solvera (`ikss_async_machines_a`,
    `small_motor_limit_a`, `ikss_total_a`); jedyna operacja = skala A -> kA.
    """
    werdykt = "spełniona" if result.motors_negligible else "niespełniona"
    wplyw = (
        "silniki pomijalne w prądzie wyłączeniowym Ib"
        if result.motors_negligible
        else "silniki niepomijalne w prądzie wyłączeniowym Ib"
    )
    ikss_total_a = result.white_box.get("ikss_total_a")
    async_a = result.white_box.get("ikss_async_machines_a")
    limit_a = result.white_box.get("small_motor_limit_a")
    if ikss_total_a is None or async_a is None or limit_a is None:
        # Wynik bez maszyn (white_box bez liczb) — uczciwy krok bez podstawien.
        return {
            "tekst": (
                "Reguła małych silników (p. 6.6): silniki są pomijalne, gdy suma I″k,M ≤ "
                f"0,05·I″k — reguła {werdykt} ({wplyw})."
            ),
            "latex": None,
        }
    rel_tekst = "≤" if result.motors_negligible else ">"
    rel_latex = r"\le" if result.motors_negligible else ">"
    return {
        "tekst": (
            "Reguła małych silników (p. 6.6): wymaganie suma I″k,M ≤ 0,05·I″k; "
            f"wartość graniczna 0,05·I″k = {_ka_pl(limit_a)} kA; "
            f"wartość obliczona suma I″k,M = {_ka_pl(async_a)} kA "
            f"({_ka_pl(async_a)} {rel_tekst} {_ka_pl(limit_a)}) — reguła {werdykt} ({wplyw})."
        ),
        "latex": (
            rf"\sum_m I''_{{k,M}} = {a_na_ka(async_a):.3f}\;\mathrm{{kA}} \;{rel_latex}\; "
            rf"0.05 \cdot I''_k = 0.05 \cdot {a_na_ka(ikss_total_a):.3f}\;\mathrm{{kA}} "
            rf"= {a_na_ka(limit_a):.3f}\;\mathrm{{kA}} "
            rf"\;\Rightarrow\; \text{{reguła {werdykt}}}"
        ),
    }


def _wywod_sekcje_wkladow(
    result: Any,
    zrodlo_tb: CzasWylaczeniaTb | None,
    parametry_robocze_maszyn: Sequence[Mapping[str, Any]] = (),
) -> list[dict[str, Any]]:
    """Wywod sekcyjny wkladow (ZWARCIA-PRO F3 pkt 8) — ADDYTYWNIE obok `wywod`.

    Ta sama tresc co plaska lista `_wywod_wkladow`, pogrupowana w sekcje
    {tytul, kroki, norma}: „Dane wejściowe i model" (naglowek), per maszyna
    „Wkład: {nazwa}" (kroki solvera), „Suma wkładów i reguły" (suma + regula 5%).
    Czysty formatter: ZERO arytmetyki poza skala A -> kA (prezentacja).

    ``zrodlo_tb`` — t_min = t_b punktu NIEPOCHODZĄCY ze scenariusza projektanta (pola
    lokalne albo wartość robocza; karta TB-WARTOSC-ROBOCZA): nagłówek niesie wtedy zdanie
    źródła z nośnika (ten sam warunek co pole odpowiedzi ``t_min_zrodlo``). ``None`` = t_b
    scenariusza — nagłówek bez zdania źródła.

    ``parametry_robocze_maszyn`` — karta PODSTAWA-Q (rozstrz. 3): wartości robocze parametrów
    maszyn wyspy punktu (ten sam dobór co pole wiersza biegu); nagłówek niesie zdanie na wpis
    (ten sam warunek co pole odpowiedzi ``parametry_robocze_maszyn``).
    """
    naglowek: list[dict[str, Any]] = [
        {
            "tekst": (
                "Model: IEC 60909-0:2016 p. 6.6 — prądy częściowe maszyn wirujących i ich "
                "zanik (współczynniki μ i q)."
            ),
            "latex": None,
        },
    ]
    ikss_total_a = result.white_box.get("ikss_total_a")
    if ikss_total_a is not None:
        naglowek.append(
            {
                "tekst": (
                    f"Punkt zwarcia: całkowity prąd I″k (z macierzy impedancji węzłowych) = "
                    f"{_ka_pl(ikss_total_a)} kA, c = {_liczba_pl(result.c_factor, 2)}, "
                    f"t_min = {_liczba_pl(result.t_min_s, 2)} s."
                ),
                "latex": None,
            }
        )
    if zrodlo_tb is not None:
        naglowek.append(
            {"tekst": f"Czas t_min (= t_b punktu zwarcia): {zrodlo_tb.opis_pl}", "latex": None}
        )
    for wpis in parametry_robocze_maszyn:
        naglowek.append(
            {"tekst": f"Wartość robocza: {zdanie_parametru_maszyny_pl(wpis)}", "latex": None}
        )
    z_f = result.white_box.get("z_f_ohm")
    if z_f is not None:
        naglowek.append(
            {
                "tekst": (
                    "Zwarcie przez impedancję przejścia Z_f = "
                    f"{_liczba_pl(z_f['re'], 3)} + j{_liczba_pl(z_f['im'], 3)} Ω: w mianowniku "
                    "prądów częściowych stoi pętla Z_kk + Z_f. Wynik poza zakresem IEC 60909-0 "
                    "(norma definiuje zwarcie metaliczne)."
                ),
                "latex": r"I''_{k,m} = \frac{c\,|Z_{mk}|}{|Z_{kk} + Z_f|\,|Z_m|}\,I_{\mathrm{base}}",
            }
        )
    sekcje: list[dict[str, Any]] = [
        {"tytul": "Dane wejściowe i model", "kroki": naglowek, "norma": _NORMA_IEC_60909},
    ]
    # Pelny wywod dyplomowy per maszyna — kroki budowane W SOLVERZE (WHITE BOX,
    # zasada 2026-07-22: wzor ogolny -> podstawienie liczbowe -> wynik).
    for c in result.contributions:
        sekcje.append(
            {
                "tytul": f"Wkład: {c.source_name}",
                "kroki": [dict(krok) for krok in c.wywod],
                "norma": _NORMA_IEC_60909_66,
            }
        )
    sekcje.append(
        {
            "tytul": "Suma wkładów i reguły",
            "kroki": [
                {
                    "tekst": (
                        f"Suma wkładów maszyn: I″k,M = {_ka_pl(result.ikss_machines_a)} kA, "
                        + (
                            f"Ib,M = {_ka_pl(result.ib_machines_a)} kA."
                            if result.ib_machines_a is not None
                            else "Ib,M nieobliczone — brak czasu wyłączenia t_b."
                        )
                    ),
                    "latex": r"I''_{k,M} = \sum_m I''_{k,m}, \qquad I_{b,M} = \sum_m I_{b,m}",
                },
                _krok_reguly_malych_silnikow(result),
            ],
            "norma": _NORMA_IEC_60909_66,
        }
    )
    return sekcje


def _wywod_wkladow(result: Any, sekcje: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Wywod prezentacyjny wkladow — kroki {tekst, latex} (zasada KaTeX).

    Plaska lista (kompatybilnosc: naglowek + separatory „— maszyna —" + kroki
    per maszyna + suma + regula) budowana 1:1 z sekcji `_wywod_sekcje_wkladow`
    — wspolne zrodlo gwarantuje identyczna tresc obu pol odpowiedzi.
    """
    kroki: list[dict[str, Any]] = list(sekcje[0]["kroki"])
    for c, sekcja in zip(result.contributions, sekcje[1:-1], strict=True):
        # Karta #145: separator nazywa maszynę; kod typu maszyny nie jest tekstem dla
        # projektanta (rodzaj maszyny niesie szczegół wkładu, nazwany po polsku na ekranie).
        kroki.append({"tekst": f"— {c.source_name} —", "latex": None})
        kroki.extend(sekcja["kroki"])
    kroki.extend(sekcje[-1]["kroki"])
    return kroki


def _walidacja_iec(result: Any, input_hash: str) -> list[dict[str, str]]:
    """Panel walidacji metody IEC 60909 (ZWARCIA-PRO F3 pkt 10) — checklista.

    Pozycje budowane WYLACZNIE z realnych wlasnosci biegu (zero fabrykacji):
    stale metody (norma, Z-bus) = INFO; realne sprawdzenia (maszyny, regula 5%,
    input_hash) = PASS/FAIL wprost z wyniku solvera. Kolejnosc stala (determinizm).
    """
    wb = result.white_box
    n_async = int(wb.get("n_asynchronous", 0))
    async_a = wb.get("ikss_async_machines_a")
    limit_a = wb.get("small_motor_limit_a")
    if result.motors_negligible:
        regula_status = "PASS"
        regula_wartosc = "spełniona — silniki pomijalne w prądzie wyłączeniowym Ib"
    else:
        regula_status = "FAIL"
        regula_wartosc = (
            "niespełniona — silniki niepomijalne, ich wkłady uwzględnione w prądzie "
            "wyłączeniowym Ib"
        )
    if async_a is not None and limit_a is not None:
        regula_wartosc += f" (suma I″k,M = {_ka_pl(async_a)} kA, próg = {_ka_pl(limit_a)} kA)"
    z_f = wb.get("z_f_ohm")
    zakres: list[dict[str, str]] = (
        []
        if z_f is None
        else [
            {
                # Karta OD-14 §3: Z_f ≠ 0 wyprowadza wynik poza zakres normy — pozycja mówi
                # to wprost, z wartością Z_f; nie jest oceną zgodności, tylko zakresem metody.
                "pozycja_pl": "Zakres ważności normy",
                "wartosc_pl": (
                    "zwarcie przez impedancję przejścia Z_f = "
                    f"{_liczba_pl(z_f['re'], 3)} + j{_liczba_pl(z_f['im'], 3)} Ω — poza "
                    "zakresem IEC 60909-0 (norma definiuje zwarcie metaliczne); wynik nie jest "
                    "podstawą doboru aparatury ani wytrzymałości zwarciowej"
                ),
                "status": "INFO",
            }
        ]
    )
    return [
        {
            "pozycja_pl": "Norma bazowa metody",
            "wartosc_pl": "IEC 60909-0:2016",
            "status": "INFO",
        },
        {
            "pozycja_pl": "Współczynnik napięciowy c",
            "wartosc_pl": f"c = {_liczba_pl(result.c_factor, 2)} (z tego przebiegu)",
            "status": "INFO",
        },
        {
            "pozycja_pl": "Metoda obliczenia wkładów",
            "wartosc_pl": "superpozycja Z-bus (prądy częściowe maszyn)",
            "status": "INFO",
        },
        {
            "pozycja_pl": "Maszyny asynchroniczne",
            "wartosc_pl": (
                f"uwzględnione: {n_async} szt." if n_async > 0 else "nieobecne w modelu"
            ),
            "status": "PASS" if n_async > 0 else "INFO",
        },
        {
            "pozycja_pl": "Reguła małych silników (5%)",
            "wartosc_pl": regula_wartosc,
            "status": regula_status,
        },
        {
            # Karta #145: odcisk danych wejściowych jest metadaną — pozycja mówi, że
            # obliczenie jest powtarzalne; sam odcisk zostaje w odpowiedzi (`input_hash`).
            "pozycja_pl": "Powtarzalność obliczenia",
            "wartosc_pl": "dane wejściowe mają odcisk — to samo wejście daje ten sam wynik",
            "status": "PASS" if input_hash else "FAIL",
        },
        *zakres,
    ]


def _input_hash_wkladow(payload: SCContributionsRequest) -> str:
    """Deterministyczny SHA-256 kanonicznego wejscia wkladow (kontrakt determinizmu)."""
    encoded = json.dumps(
        {
            "snapshot": payload.snapshot,
            "fault_node_id": payload.fault_node_id,
            "scenariusz": payload.scenariusz,
            "nadpisanie_c": (
                payload.nadpisanie_c.model_dump() if payload.nadpisanie_c is not None else None
            ),
            "t_min_s": payload.t_min_s,
            # Karta OD-14: Z_f w odcisku WYŁĄCZNIE gdy podana — odcisk żądania bez Z_f
            # identyczny jak przed kartą.
            **(
                {"fault_impedance": payload.fault_impedance.model_dump()}
                if payload.fault_impedance is not None
                else {}
            ),
        },
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


@router.post("/sc3f/contributions")
def sc3f_contributions(payload: SCContributionsRequest) -> dict[str, Any]:
    """Wklady zwarciowe zrodel (maszyny/DER) w punkcie zwarcia — JSON.

    Dostawca danych sekcji „Wklady" ekranu zwarc (dotad pass-through bez
    dostawcy). Deterministyczny: siec bez maszyn → pusta lista wkladow.
    """
    from application.solvers.short_circuit_binding import graf_i_dobor_c_punktu
    from enm.models import EnergyNetworkModel
    from enm.zdania_odmow_rdzenia import nazwy_w_odmowach_rdzenia
    from network_model.solvers.machine_sc_iec60909 import compute_machine_contributions

    z_f_ohm = _z_f_z_zadania(payload.fault_impedance)
    # Migawka pochodzi z żądania: niezgodność z kontraktem ENM to odmowa danych projektanta,
    # walidowana osobno, żeby `ValidationError` z głębi obliczeń (model budowany przez
    # program) nie był przebierany za błąd danych (karta ODMOWA-DANYCH-422).
    try:
        EnergyNetworkModel.model_validate(payload.snapshot)
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Nie udało się wyznaczyć wkładów zwarciowych: {exc}",
        ) from exc
    try:
        # Graf solvera i c punktu z assemblera biegu (tożsamość punktu: ref ENM szyny
        # albo id węzła grafu — rozstrzyga warstwa wiązania).
        # t_min = t_b punktu: scenariusz (reguła danych `czas_tb_z_danych`, odmowa → 422),
        # inaczej pola lokalne albo wartość robocza — `czas_tb_punktu` jak w wierszu biegu.
        punkt = graf_i_dobor_c_punktu(
            snapshot=payload.snapshot,
            fault_ref=payload.fault_node_id,
            scenariusz=payload.scenariusz,
            nadpisanie_c=_nadpisanie(payload.nadpisanie_c),
            tb_s=czas_tb_z_danych(payload.t_min_s),
            z_f_ohm=z_f_ohm,
        )
        # Partia integracji 10: odmowa strukturalna rdzenia wychodzi ze zdaniem z nazwami
        # elementów grafu (identyfikator węzła zostaje w rekordach odmowy).
        with nazwy_w_odmowach_rdzenia(punkt.graf):
            result = compute_machine_contributions(
                punkt.graf,
                punkt.fault_node_id,
                c_factor=punkt.dobor_c.wartosc,
                t_min_s=punkt.czas_tb.wartosc_s,
                z_f_ohm=z_f_ohm,
            )
    # Karta ODMOWA-DANYCH-422: 422 wyłącznie dla nazwanej odmowy danych (brak węzła
    # zwarcia w indeksie Z-bus, element bez szyny, osobliwa sieć); każdy inny `ValueError`
    # i dawny `KeyError` (karta #151) to błąd programu — 500 i pełny ślad.
    except OdmowaDanychError as exc:
        raise OdmowaHttpError(
            exc,
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            prefiks="Nie udało się wyznaczyć wkładów zwarciowych",
        ) from exc
    # Addytywnie: wywod prezentacyjny {tekst, latex} (zasada KaTeX) obok
    # surowego sladu WHITE BOX solvera — bez zmiany istniejacych pol.
    # ZWARCIA-PRO F3 (pkt 8-10): wywod_sekcje (ta sama tresc pogrupowana),
    # walidacja_iec (checklista metody) i input_hash — rowniez addytywnie.
    # Karta TB-WARTOSC-ROBOCZA: JEDEN predykat pochodzenia t_min dla zdania wywodu
    # i pola odpowiedzi `t_min_zrodlo` (predykaty parami).
    zrodlo_tb = punkt.czas_tb if punkt.czas_tb.pochodzenie != POCHODZENIE_TB_PROJEKTANT else None
    # Karta PODSTAWA-Q (rozstrz. 3): wartości robocze maszyn wyspy punktu — JEDEN dobór dla
    # zdania wywodu i pola odpowiedzi (predykaty parami; ta sama funkcja co wiersz biegu).
    robocze_maszyn = parametry_robocze_maszyn_punktu(
        punkt.graf, punkt.fault_node_id, ShortCircuitType.THREE_PHASE
    )
    sekcje = _wywod_sekcje_wkladow(result, zrodlo_tb, robocze_maszyn)
    input_hash = _input_hash_wkladow(payload)
    return {
        **result.to_dict(),
        "wywod": _wywod_wkladow(result, sekcje),
        "wywod_sekcje": sekcje,
        "walidacja_iec": _walidacja_iec(result, input_hash),
        "input_hash": input_hash,
        # Karta WSPOLCZYNNIK-C-JEDEN-NOSNIK: c punktu i jego podstawa (White Box).
        "c_factor": punkt.dobor_c.wartosc,
        "c_zrodlo": punkt.dobor_c.zrodlo,
        # Karta TB-WARTOSC-ROBOCZA (addytywnie): pochodzenie t_min = t_b punktu, gdy nie
        # pochodzi z żądania (scenariusza) — pola lokalne albo wartość robocza.
        **({"t_min_zrodlo": zrodlo_tb.to_dict()} if zrodlo_tb is not None else {}),
        # Karta PODSTAWA-Q (addytywnie): wpisy i dane przyjęte wkładów, gdy maszyna wyspy punktu
        # liczona jest z wartością roboczą parametru (Z_M i krzywe zaniku na danej przyjętej).
        **(
            {
                "parametry_robocze_maszyn": robocze_maszyn,
                "status_danych": "UNVALIDATED_INPUT",
                "dane_przyjete": [
                    d.model_dump(mode="json")
                    for d in dane_przyjete_maszyn(robocze_maszyn, wielkosc=WIELKOSCI_ZWARCIOWE)
                ],
            }
            if robocze_maszyn
            else {}
        ),
    }


@router.post("/sc3f/pack")
def download_sc3f_pack(payload: SC3FPackRequest) -> Response:
    """Pakiet dowodowy zwarcia trójfazowego (IEC 60909) z rozbiciem maszynowym.

    Domyka lukę: 3F nie miało pakietu dowodowego. Rozbicie per-maszyna (μ/q/i_b)
    dołączane, gdy sieć zawiera maszyny wirujące / DER (G-SCM F1/F2).
    """
    context = ProofPackContext(
        project_id=payload.project_id,
        case_id=payload.case_id,
        run_id=payload.run_id,
        snapshot_id=payload.snapshot_id,
        mv_design_pro_version=resolve_mv_design_pro_version(),
    )
    pack_input = SC3FPackInput(
        project_name=payload.project_name,
        case_name=payload.case_name,
        snapshot=payload.snapshot,
        fault_node_id=payload.fault_node_id,
        run_timestamp=payload.run_timestamp,
        solver_version=payload.solver_version,
        scenariusz=payload.scenariusz,
        nadpisanie_c=_nadpisanie(payload.nadpisanie_c),
        tk_s=payload.tk_s,
        # Ta sama reguła danych t_b co opcja biegu (odmowa nazwana → 422 z `kod`).
        tb_s=czas_tb_z_danych(payload.tb_s),
        z_f_ohm=_z_f_z_zadania(payload.fault_impedance),
    )
    from enm.models import EnergyNetworkModel

    try:
        EnergyNetworkModel.model_validate(payload.snapshot)
    except ValidationError as exc:  # migawka z żądania — jak wyżej
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Nie udało się zbudować pakietu dowodowego SC3F: {exc}",
        ) from exc
    try:
        content = SC3FProofPack.generate_zip(pack_input, context)
    except OdmowaDanychError as exc:  # jak wyżej: inny wyjątek = błąd programu
        raise OdmowaHttpError(
            exc,
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            prefiks="Nie udało się zbudować pakietu dowodowego SC3F",
        ) from exc
    headers = {
        "Content-Disposition": (
            f'attachment; filename="pakiet_dowodowy_sc3f__{payload.run_id}.zip"'
        )
    }
    return Response(content=content, media_type="application/zip", headers=headers)
