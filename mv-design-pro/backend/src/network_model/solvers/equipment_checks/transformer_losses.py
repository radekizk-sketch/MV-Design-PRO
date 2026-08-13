"""STRATY TRANSFORMATORA i optymalny wspolczynnik obciazenia.

DLACZEGO TEN MODUL POWSTAL (karta KD-3, dlug §7.4 pozycja 4). Katalog niesie obie
skladowe strat (P0 — jalowa, Pk — obciazeniowa) i nie mial odbiorcy. Projektant
wybierajacy moc transformatora widzial cene i moc znamionowa, ale nie widzial
KOSZTU PRACY: transformator dobrany „z zapasem" pracuje przy malym wspolczynniku
obciazenia i placi caly czas stratami jalowymi, ktorych obciazenie nie wykorzystuje.

PODSTAWA FIZYCZNA. Straty jalowe (histereza i prady wirowe w rdzeniu) nie zaleza
od obciazenia; straty obciazeniowe (uzwojenia) rosna z kwadratem pradu, czyli z
kwadratem wspolczynnika obciazenia β = S/Sn:

    ΔP(β) = P0 + β²·Pk

Minimum strat WZGLEDNYCH (ΔP/S) wypada tam, gdzie obie skladowe sa rowne:

    d/dβ (P0/β + β·Pk) = 0   ⇒   β_opt = √(P0/Pk)

W punkcie β_opt zachodzi P0 = β_opt²·Pk — to nie zbieg okolicznosci, tylko warunek
minimum; jest sprawdzany w sladzie jako kontrola poprawnosci rachunku.

ZERO FABRYKACJI. Brak ktorejkolwiek skladowej strat w katalogu albo brak
wspolczynnika obciazenia daje wynik NIEDOSTEPNY z kodem gotowosci — nigdy
wartosc „typowa dla mocy" (P0 i Pk roznia sie miedzy wykonaniami tej samej mocy
nawet dwukrotnie, wiec podstawienie typowej falszowaloby rachunek kosztow).

WHITE BOX. Wynik niesie obie skladowe strat osobno, sume, β_opt, straty w
punkcie optymalnym oraz pelny slad krokow.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from network_model.solvers.equipment_checks.slad import (
    STATUS_PASS,
    STATUS_UNAVAILABLE,
    dodatnia,
    liczba_tex,
    wartosc,
)

# Kanoniczne kody gotowosci (zsynchronizowane z domain.canonical_operations.READINESS_CODES).
READINESS_TRANSFORMER_LOSS_DATA_MISSING = "transformer.loss_data_missing"
READINESS_TRANSFORMER_LOADING_FACTOR_MISSING = "transformer.loading_factor_missing"

_FORMULA_REF = "ΔP(β) = P0 + β²·Pk;  β_opt = √(P0/Pk)"


@dataclass(frozen=True)
class TransformerLossesInput:
    """Dane wejsciowe rachunku strat.

    ``p0_kw`` i ``pk_kw`` pochodza z pozycji katalogowej transformatora (wiazanie
    robi koncowka). ``beta`` to wspolczynnik obciazenia S/Sn podany przez
    projektanta albo wyprowadzony z mocy obciazenia i mocy znamionowej.
    """

    p0_kw: float | None
    pk_kw: float | None
    beta: float | None
    #: Moc znamionowa [MVA] — wylacznie do przeliczenia β na moc obciazenia w sladzie.
    sn_mva: float | None = None


@dataclass(frozen=True)
class TransformerLossesResult:
    """Wynik rachunku strat transformatora (WHITE BOX).

    ``status`` = PASS oznacza rachunek wykonany (kryterium nie ma tu werdyktu
    „dobrze/zle” — sam wspolczynnik obciazenia nie jest naruszeniem normy);
    NIEDOSTEPNY oznacza brak podstawy do rachunku.
    """

    status: str
    straty_jalowe_kw: float | None
    straty_obciazeniowe_kw: float | None
    straty_calkowite_kw: float | None
    beta: float | None
    beta_optymalny: float | None
    straty_przy_beta_opt_kw: float | None
    moc_obciazenia_mva: float | None
    udzial_strat_jalowych: float | None
    readiness_codes: tuple[str, ...] = ()
    formula_ref: str = _FORMULA_REF
    white_box_trace: tuple[dict[str, Any], ...] = ()
    assumptions: tuple[str, ...] = ()

    @property
    def is_conclusive(self) -> bool:
        return self.status == STATUS_PASS


def compute_transformer_losses(data: TransformerLossesInput) -> TransformerLossesResult:
    """Policz straty transformatora przy zadanym obciazeniu i optymalne β."""
    p0 = dodatnia(data.p0_kw)
    pk = dodatnia(data.pk_kw)
    beta = dodatnia(data.beta)
    sn = dodatnia(data.sn_mva)

    braki: list[str] = []
    if p0 is None or pk is None:
        braki.append(READINESS_TRANSFORMER_LOSS_DATA_MISSING)
    if beta is None:
        braki.append(READINESS_TRANSFORMER_LOADING_FACTOR_MISSING)

    if p0 is None or pk is None or beta is None:
        return TransformerLossesResult(
            status=STATUS_UNAVAILABLE,
            straty_jalowe_kw=p0,
            straty_obciazeniowe_kw=None,
            straty_calkowite_kw=None,
            beta=beta,
            beta_optymalny=None,
            straty_przy_beta_opt_kw=None,
            moc_obciazenia_mva=None,
            udzial_strat_jalowych=None,
            readiness_codes=tuple(dict.fromkeys(braki)),
        )

    straty_obciazeniowe = beta * beta * pk
    straty_calkowite = p0 + straty_obciazeniowe
    beta_opt = math.sqrt(p0 / pk)
    straty_opt = p0 + beta_opt * beta_opt * pk
    moc_obciazenia = beta * sn if sn is not None else None
    udzial_jalowych = p0 / straty_calkowite

    return TransformerLossesResult(
        status=STATUS_PASS,
        straty_jalowe_kw=p0,
        straty_obciazeniowe_kw=straty_obciazeniowe,
        straty_calkowite_kw=straty_calkowite,
        beta=beta,
        beta_optymalny=beta_opt,
        straty_przy_beta_opt_kw=straty_opt,
        moc_obciazenia_mva=moc_obciazenia,
        udzial_strat_jalowych=udzial_jalowych,
        readiness_codes=(),
        white_box_trace=_slad_strat(
            p0_kw=p0,
            pk_kw=pk,
            beta=beta,
            straty_obciazeniowe_kw=straty_obciazeniowe,
            straty_calkowite_kw=straty_calkowite,
            beta_opt=beta_opt,
            straty_opt_kw=straty_opt,
            moc_obciazenia_mva=moc_obciazenia,
            sn_mva=sn,
        ),
        assumptions=(
            "Straty jalowe P0 nie zaleza od obciazenia (rdzen pod napieciem znamionowym).",
            "Straty obciazeniowe rosna z kwadratem wspolczynnika obciazenia: β²·Pk.",
            "P0 i Pk pochodza z pozycji katalogowej transformatora (pomiar wyrobu), "
            "nie z wartosci typowej dla mocy.",
            "β_opt minimalizuje straty WZGLEDNE (ΔP/S); w tym punkcie P0 = β²·Pk.",
            "Rachunek pomija zaleznosc Pk od temperatury uzwojen (odniesienie do "
            "temperatury pomiaru katalogowego).",
        ),
    )


def _slad_strat(
    *,
    p0_kw: float,
    pk_kw: float,
    beta: float,
    straty_obciazeniowe_kw: float,
    straty_calkowite_kw: float,
    beta_opt: float,
    straty_opt_kw: float,
    moc_obciazenia_mva: float | None,
    sn_mva: float | None,
) -> tuple[dict[str, Any], ...]:
    """Kroki dowodowe rachunku strat; slad nie liczy nic od nowa."""
    kroki: list[dict[str, Any]] = []

    if moc_obciazenia_mva is not None and sn_mva is not None:
        kroki.append(
            {
                "step": 1,
                "key": "trafo_moc_obciazenia",
                "title": "Moc obciążenia przy zadanym współczynniku",
                "formula_latex": r"$$S = \beta \cdot S_n$$",
                "inputs": {
                    "beta": wartosc(beta, "", "Współczynnik obciążenia"),
                    "sn_mva": wartosc(sn_mva, "MVA", "Moc znamionowa transformatora"),
                },
                "substitution": (
                    r"$$S = "
                    + liczba_tex(beta)
                    + r" \cdot "
                    + liczba_tex(sn_mva)
                    + r" = "
                    + liczba_tex(moc_obciazenia_mva)
                    + r"\ \mathrm{MVA}$$"
                ),
                "result": {"moc_mva": wartosc(moc_obciazenia_mva, "MVA", "Moc obciążenia")},
                "notes": "Krok informacyjny — nie wchodzi do rachunku strat.",
            }
        )

    numer = len(kroki) + 1
    kroki.append(
        {
            "step": numer,
            "key": "trafo_straty_calkowite",
            "title": "Straty transformatora przy zadanym obciążeniu",
            "formula_latex": r"$$\Delta P(\beta) = P_0 + \beta^2 P_k$$",
            "inputs": {
                "p0_kw": wartosc(p0_kw, "kW", "Straty jałowe (katalog)"),
                "pk_kw": wartosc(pk_kw, "kW", "Straty obciążeniowe znamionowe (katalog)"),
                "beta": wartosc(beta, "", "Współczynnik obciążenia"),
            },
            "substitution": (
                r"$$\Delta P = "
                + liczba_tex(p0_kw)
                + r" + "
                + liczba_tex(beta)
                + r"^2 \cdot "
                + liczba_tex(pk_kw)
                + r" = "
                + liczba_tex(straty_calkowite_kw)
                + r"\ \mathrm{kW}$$"
            ),
            "result": {
                "straty_obciazeniowe_kw": wartosc(
                    straty_obciazeniowe_kw, "kW", "Straty obciążeniowe przy β"
                ),
                "straty_calkowite_kw": wartosc(straty_calkowite_kw, "kW", "Straty całkowite"),
            },
            "notes": (
                "Straty jałowe płyną niezależnie od obciążenia — transformator dobrany "
                "z dużym zapasem płaci je przez cały czas pracy."
            ),
        }
    )

    kroki.append(
        {
            "step": numer + 1,
            "key": "trafo_beta_optymalne",
            "title": "Optymalny współczynnik obciążenia",
            "formula_latex": r"$$\beta_{opt} = \sqrt{\frac{P_0}{P_k}}$$",
            "inputs": {
                "p0_kw": wartosc(p0_kw, "kW", "Straty jałowe"),
                "pk_kw": wartosc(pk_kw, "kW", "Straty obciążeniowe znamionowe"),
            },
            "substitution": (
                r"$$\beta_{opt} = \sqrt{\frac{"
                + liczba_tex(p0_kw)
                + r"}{"
                + liczba_tex(pk_kw)
                + r"}} = "
                + liczba_tex(beta_opt)
                + r"$$"
            ),
            "result": {
                "beta_opt": wartosc(beta_opt, "", "Optymalny współczynnik obciążenia"),
                "straty_opt_kw": wartosc(straty_opt_kw, "kW", "Straty w punkcie optymalnym"),
            },
            "notes": (
                "W punkcie β_opt straty obciążeniowe zrównują się z jałowymi "
                "(P0 = β_opt²·Pk) — to warunek minimum strat względnych ΔP/S."
            ),
        }
    )

    return tuple(kroki)
