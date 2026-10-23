"""Pakiet dowodowy PARAMETRÓW LINII 110 kV z geometrii słupa (karta LINIA-110).

Dokumentuje, skąd wzięły się R′, X′, B′ i Z′0 linii napowietrznej 110 kV, z którymi liczył
przebieg: dane przewodu z katalogu (PN-EN 50182), GMR z budowy albo z tablicy, wiązka, GMD,
macierz impedancji pierwotnych z poprawką ziemi Carsona, redukcja Krona przewodów
odgromowych, transpozycja do składowych symetrycznych i susceptancje z metody odbić.

NOT-A-SOLVER. Pakiet NIE liczy: każdy krok dowodu jest krokiem śladu White Box solvera
``network_model.solvers.parametry_linii_napowietrznej`` (``KrokSladu``) — wzór, wejścia,
podstawienie i wynik przepisane 1:1. Równanie kroku pochodzi z rejestru
(``registries/ohl_equations.py``) i jest wybierane po kodzie kroku ORAZ identycznym wzorze;
rozjazd rejestru z solverem kończy się odmową, nie cichym dowodem innego wzoru.

ZASADA NR 4. Wynik oparty na wartościach roboczych (geometria słupa, przewód odgromowy,
rezystywność gruntu) niesie w podsumowaniu kompletność dowodu ``NIEPELNY`` i każdą daną
przyjętą z powodem i jakością ``ESTIMATED`` — dowód na założeniach nie udaje dowodu
z danych projektu.

DETERMINIZM. Tożsamość dokumentu = tożsamość pakietu + rozróżnik linii
(``parametry_linii__<ref>``); znacznik czasu z przebiegu.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from application.proof_engine.proof_pack import (
    ProofPackBuilder,
    ProofPackContext,
    deterministic_artifact_id,
    dokument_deterministyczny,
)
from application.proof_engine.registries.ohl_equations import rownanie_kroku
from application.proof_engine.types import (
    ProofDocument,
    ProofHeader,
    ProofStep,
    ProofSummary,
    ProofType,
    ProofValue,
    UnitCheckResult,
)
from network_model.pochodne import simens_na_mikrosimens
from network_model.solvers.parametry_linii_napowietrznej import (
    KrokSladu,
    ParametryLiniiNapowietrznej,
)

#: Przedrostek rozróżnika dokumentu linii w pakiecie zbiorczym przebiegu.
PRZEDROSTEK_ROZROZNIKA = "parametry_linii__"


def rozroznik_linii(branch_ref: str) -> str:
    """Rozróżnik dokumentu linii — nazwa wpisu w pakiecie zbiorczym i ziarno tożsamości."""
    return f"{PRZEDROSTEK_ROZROZNIKA}{branch_ref}"


@dataclass(frozen=True)
class ParametryLiniiDowodInput:
    """Wejście pakietu: wynik solvera dla jednej linii modelu przebiegu + nagłówek."""

    project_name: str
    case_name: str
    run_timestamp: datetime
    branch_ref: str
    nazwa_linii: str
    wynik: ParametryLiniiNapowietrznej
    #: Czy R′/X′/B′/Z′0 zapisane w linii przebiegu pochodzą z TEGO wyliczenia (odcisk wejścia
    #: równy proweniencji). ``False`` = dowód opisuje parametry inne niż te, z którymi liczył
    #: przebieg — dokument mówi to wprost w ostrzeżeniu.
    zgodny_z_modelem: bool


class ParametryLinii110kVProof:
    """Generator dowodu parametrów linii 110 kV ze śladu solvera."""

    PACK_ID = "OHL_PARAMS"
    TITLE_PL = "Parametry linii napowietrznej 110 kV z geometrii słupa"

    @classmethod
    def _krok(cls, numer: int, krok: KrokSladu) -> ProofStep:
        rownanie = rownanie_kroku(krok.kod, krok.wzor_latex)
        symbol_wyniku = rownanie.symbols[0]
        symbole_wejsc = rownanie.symbols[1:]
        # Kontrola jednostek: wynik i każde wejście kroku solvera mają symbol i jednostkę
        # równania z rejestru (ten sam opis wielkości w dowodzie i w śladzie).
        zgodne_wejscia = len(symbole_wejsc) == len(krok.wejscia) and all(
            s.symbol == w.symbol and s.unit == w.jednostka
            for s, w in zip(symbole_wejsc, krok.wejscia, strict=False)
        )
        zgodny_wynik = (
            symbol_wyniku.symbol == krok.wynik.symbol and symbol_wyniku.unit == krok.wynik.jednostka
        )
        wejscia = tuple(
            ProofValue.create(w.symbol, w.wartosc, w.jednostka, s.mapping_key, precision=6)
            for s, w in zip(symbole_wejsc, krok.wejscia, strict=False)
        )
        return ProofStep(
            step_id=ProofStep.generate_step_id(cls.PACK_ID, numer),
            step_number=numer,
            title_pl=krok.opis_pl,
            equation=rownanie,
            input_values=wejscia,
            substitution_latex=f"{krok.podstawienie_latex} \\;\\Rightarrow\\; {krok.wynik_latex}",
            result=ProofValue.create(
                krok.wynik.symbol,
                krok.wynik.wartosc,
                krok.wynik.jednostka,
                symbol_wyniku.mapping_key,
                precision=6,
            ),
            unit_check=UnitCheckResult(
                passed=zgodne_wejscia and zgodny_wynik,
                expected_unit=symbol_wyniku.unit,
                computed_unit=krok.wynik.jednostka,
                input_units={w.symbol: w.jednostka for w in krok.wejscia},
                derivation=rownanie.unit_derivation,
            ),
            source_keys={"kod_kroku": krok.kod, "podstawa": krok.podstawa_pl},
        )

    @classmethod
    def generate(cls, data: ParametryLiniiDowodInput, artifact_id: UUID) -> ProofDocument:
        wynik = data.wynik
        kroki = [cls._krok(numer, krok) for numer, krok in enumerate(wynik.slad, start=1)]
        ostrzezenia: list[str] = []
        if not data.zgodny_z_modelem:
            ostrzezenia.append(
                "Parametry zapisane w linii tego przebiegu nie pochodzą z wyliczenia opisanego "
                "w tym dowodzie (dane przewodu, geometrii albo częstotliwości zmieniły się od "
                "zapisu) — przelicz model, aby wynik i dowód opisywały te same parametry."
            )
        if wynik.kompletnosc_dowodu == "NIEPELNY":
            ostrzezenia.append(
                "Kompletność dowodu: NIEPEŁNY — parametry policzone z wartościami roboczymi "
                "(jakość ESTIMATED), nie z danych projektu; podaj dane w parametrach linii "
                "i przelicz."
            )
        for dana in wynik.dane_przyjete:
            wartosc = (
                f" = {dana.wartosc.wartosc:g} {dana.wartosc.jednostka}"
                if dana.wartosc is not None
                else ""
            )
            jakosc = dana.jakosc.value if dana.jakosc is not None else "brak oceny jakości"
            ostrzezenia.append(
                f"Dana przyjęta ({jakosc}): {dana.nazwa_pl}{wartosc} — {dana.powod_pl}"
            )
        wyniki = {
            "r1_ohm_per_km": ProofValue.create(
                "R'_1", wynik.r1_ohm_per_km, "Ω/km", "r1_ohm_per_km", precision=6
            ),
            "x1_ohm_per_km": ProofValue.create(
                "X'_1", wynik.x1_ohm_per_km, "Ω/km", "x1_ohm_per_km", precision=6
            ),
            "b1_us_per_km": ProofValue.create(
                "B'_1",
                simens_na_mikrosimens(wynik.b1_s_per_km),
                "μS/km",
                "b1_s_per_km",
                precision=6,
            ),
            "r0_ohm_per_km": ProofValue.create(
                "R'_0", wynik.r0_ohm_per_km, "Ω/km", "r0_ohm_per_km", precision=6
            ),
            "x0_ohm_per_km": ProofValue.create(
                "X'_0", wynik.x0_ohm_per_km, "Ω/km", "x0_ohm_per_km", precision=6
            ),
            "b0_us_per_km": ProofValue.create(
                "B'_0",
                simens_na_mikrosimens(wynik.b0_s_per_km),
                "μS/km",
                "b0_s_per_km",
                precision=6,
            ),
            "r1_temperatura_ohm_per_km": ProofValue.create(
                r"R'_{\theta}",
                wynik.r1_temperatura_ohm_per_km,
                "Ω/km",
                "r1_temperatura_ohm_per_km",
                precision=6,
            ),
        }
        return ProofDocument.create(
            artifact_id=artifact_id,
            proof_type=ProofType.OVERHEAD_LINE_PARAMETERS,
            title_pl=f"{cls.TITLE_PL} — {data.nazwa_linii}",
            header=ProofHeader(
                project_name=data.project_name,
                case_name=data.case_name,
                run_timestamp=data.run_timestamp,
                solver_version=f"{wynik.metoda} {wynik.wersja_metody}",
                element_kind="LINE",
            ),
            steps=kroki,
            summary=ProofSummary(
                key_results=wyniki,
                unit_check_passed=all(k.unit_check.passed for k in kroki),
                total_steps=len(kroki),
                warnings=tuple(ostrzezenia),
                overall_status="COMPUTED",
            ),
        )

    @classmethod
    def generate_zip(cls, data: ParametryLiniiDowodInput, context: ProofPackContext) -> bytes:
        """Pakiet ZIP dowodu jednej linii — tożsamość z pakietu i rozróżnika linii."""
        rozroznik = rozroznik_linii(data.branch_ref)
        proof = cls.generate(data, deterministic_artifact_id(context, rozroznik))
        return ProofPackBuilder(context).build(
            dokument_deterministyczny(proof, context, data.run_timestamp, rozroznik)
        )
