"""Builder analizy siły sieci (SCR/WSCR) — warstwa interpretacji (Z15).

Czysta interpretacja gotowych wyników: NIE liczy fizyki (moc zwarciowa pochodzi
z solvera IEC 60909), wylicza wskaźniki siły sieci i wydaje werdykt normowy z
pełnym wywodem White Box (A→B→C→D).
"""

from __future__ import annotations

from collections.abc import Iterable

from analysis.grid_strength.models import (
    DEFAULT_VERY_WEAK_THRESHOLD,
    DEFAULT_WEAK_THRESHOLD,
    VERDICT_VERY_WEAK,
    VERDICT_WEAK,
    BusStrengthEntry,
    BusStrengthInput,
    GridStrengthContext,
    GridStrengthSummary,
    GridStrengthView,
    WhiteBoxStep,
    compute_grid_strength_id,
)
from analysis.grid_strength.oceny import klasa_sily, ocena_sily
from enm.nazwy_elementow import opis_bez_nazwy
from werdykt import OcenaKryterium


def _round(value: float, digits: int = 4) -> float:
    return round(float(value), digits)


#: Opis brakującej wielkości (pole ``missing_data`` → zdanie rekordu).
_BRAKI_PL = {
    "s_sc_mva": "moc zwarciowa S_sc'' węzła z biegu zwarciowego IEC 60909 (brak albo niedodatnia)",
    "s_installed_mva": "moc zainstalowana S_n źródeł falownikowych węzła (brak albo niedodatnia)",
}


class GridStrengthBuilder:
    """Wylicza SCR per węzeł + WSCR systemowy z wywodem White Box."""

    def __init__(
        self,
        weak_threshold: float = DEFAULT_WEAK_THRESHOLD,
        very_weak_threshold: float = DEFAULT_VERY_WEAK_THRESHOLD,
    ) -> None:
        if very_weak_threshold > weak_threshold:
            raise ValueError("very_weak_threshold nie może być większy niż weak_threshold")
        self.weak_threshold = float(weak_threshold)
        self.very_weak_threshold = float(very_weak_threshold)

    def build(
        self,
        inputs: Iterable[BusStrengthInput],
        context: GridStrengthContext | None = None,
    ) -> GridStrengthView:
        # Determinizm: sortuj po bus_ref.
        ordered = sorted(inputs, key=lambda i: i.bus_ref)
        entries = tuple(self._build_entry(item) for item in ordered)

        weak_count = sum(1 for e in entries if e.is_weak and e.scr is not None)
        not_computed = sum(1 for e in entries if e.scr is None)
        wscr, wscr_verdict, wscr_why, wscr_wb, wscr_ocena = self._build_wscr(ordered)

        summary = GridStrengthSummary(
            total_buses=len(entries),
            weak_bus_count=weak_count,
            not_computed_count=not_computed,
            wscr=wscr,
            wscr_verdict=wscr_verdict,
            wscr_why_pl=wscr_why,
            wscr_white_box=wscr_wb,
            wscr_ocena=wscr_ocena,
            wscr_wyjasnienie=wscr_ocena.wyjasnienie,
        )
        analysis_id = compute_grid_strength_id(
            context, self.weak_threshold, self.very_weak_threshold, entries
        )
        return GridStrengthView(
            analysis_id=analysis_id,
            context=context,
            weak_threshold=self.weak_threshold,
            very_weak_threshold=self.very_weak_threshold,
            entries=entries,
            summary=summary,
        )

    # ------------------------------------------------------------------

    def _build_entry(self, item: BusStrengthInput) -> BusStrengthEntry:
        missing: list[str] = []
        if item.s_sc_mva is None or item.s_sc_mva <= 0.0:
            missing.append("s_sc_mva")
        if item.s_installed_mva is None or item.s_installed_mva <= 0.0:
            missing.append("s_installed_mva")
        nazwa_pl = item.nazwa_pl or opis_bez_nazwy("buses")

        if item.s_sc_mva is None or item.s_installed_mva is None or missing:
            ocena = ocena_sily(
                wskaznik="SCR",
                nazwa_pl=nazwa_pl,
                element_ref=item.bus_ref,
                wartosc=None,
                prog_slaby=self.weak_threshold,
                braki=tuple(_BRAKI_PL[kod] for kod in missing),
                dane_przyjete=item.dane_przyjete,
            )
            verdict, is_weak = klasa_sily(
                ocena, wartosc=None, prog_bardzo_slaby=self.very_weak_threshold
            )
            why = (
                "Dane niekompletne — brak: "
                + "; ".join(_BRAKI_PL[kod] for kod in missing)
                + ". SCR wymaga dodatniej mocy zwarciowej S_sc'' (z solvera "
                "IEC 60909 w węźle) oraz mocy zainstalowanej źródeł S_n."
            )
            return BusStrengthEntry(
                bus_ref=item.bus_ref,
                nominal_kv=item.nominal_kv,
                s_sc_mva=item.s_sc_mva,
                s_installed_mva=item.s_installed_mva,
                scr=None,
                verdict=verdict,
                is_weak=is_weak,
                why_pl=why,
                missing_data=tuple(missing),
                white_box=(),
                ocena=ocena,
                wyjasnienie=ocena.wyjasnienie,
                modules=item.modules,
            )

        s_sc = float(item.s_sc_mva)
        s_n = float(item.s_installed_mva)
        scr = _round(s_sc / s_n)
        ocena = ocena_sily(
            wskaznik="SCR",
            nazwa_pl=nazwa_pl,
            element_ref=item.bus_ref,
            wartosc=scr,
            prog_slaby=self.weak_threshold,
            dane_przyjete=item.dane_przyjete,
        )
        verdict, is_weak = klasa_sily(
            ocena, wartosc=scr, prog_bardzo_slaby=self.very_weak_threshold
        )

        if verdict == VERDICT_VERY_WEAK:
            why = (
                f"SCR = {scr} < {self.very_weak_threshold} — sieć bardzo słaba w węźle. "
                "Wysokie ryzyko niestabilności regulatorowej źródeł falownikowych; "
                "rozważ tryb grid-forming (GFM/VSM) lub wzmocnienie sieci."
            )
        elif verdict == VERDICT_WEAK:
            why = (
                f"SCR = {scr} (przedział [{self.very_weak_threshold}; "
                f"{self.weak_threshold})) — sieć słaba w węźle. Wymagana ostrożność: "
                "weryfikacja stabilności impedancyjnej i interakcji regulatorów."
            )
        else:
            why = (
                f"SCR = {scr} ≥ {self.weak_threshold} — sieć mocna w węźle; "
                "klasyczne założenia pracy źródła falownikowego pozostają ważne."
            )

        cmp_latex = r"\lt" if is_weak else r"\geq"
        white_box = (
            WhiteBoxStep(
                symbol="SCR",
                formula_latex=r"\mathrm{SCR} = \dfrac{S_{sc}''}{S_n}",
                substitution_pl=f"SCR = {_round(s_sc)} MVA / {_round(s_n)} MVA",
                result_pl=f"SCR = {scr} (–)",
            ),
            WhiteBoxStep(
                symbol="werdykt",
                formula_latex=rf"\mathrm{{SCR}} \; {cmp_latex} \; {self.weak_threshold}",
                substitution_pl=(
                    f"próg słaby = {self.weak_threshold}; "
                    f"próg bardzo słaby = {self.very_weak_threshold}"
                ),
                result_pl=f"sieć {verdict}",
            ),
        )
        return BusStrengthEntry(
            bus_ref=item.bus_ref,
            nominal_kv=item.nominal_kv,
            s_sc_mva=_round(s_sc),
            s_installed_mva=_round(s_n),
            scr=scr,
            verdict=verdict,
            is_weak=is_weak,
            why_pl=why,
            missing_data=(),
            white_box=white_box,
            ocena=ocena,
            wyjasnienie=ocena.wyjasnienie,
            modules=item.modules,
        )

    def _build_wscr(
        self, ordered: list[BusStrengthInput]
    ) -> tuple[float | None, str, str, tuple[WhiteBoxStep, ...], OcenaKryterium]:
        """WSCR (ERCOT) dla zbioru źródeł z kompletem danych."""
        valid = [
            (float(item.s_sc_mva), float(item.s_installed_mva), item.dane_przyjete)
            for item in ordered
            if item.s_sc_mva is not None
            and item.s_sc_mva > 0.0
            and item.s_installed_mva is not None
            and item.s_installed_mva > 0.0
        ]
        dane = tuple(dana for _, _, dane_wezla in valid for dana in dane_wezla)
        if not valid:
            ocena = ocena_sily(
                wskaznik="WSCR",
                nazwa_pl="Źródła falownikowe sieci",
                element_ref=None,
                wartosc=None,
                prog_slaby=self.weak_threshold,
                braki=(
                    "węzeł przyłączenia z kompletem danych (dodatnie S_sc'' i S_n) — brak "
                    "takiego węzła",
                ),
            )
            verdict, _ = klasa_sily(ocena, wartosc=None, prog_bardzo_slaby=self.very_weak_threshold)
            return (
                None,
                verdict,
                "WSCR niepoliczony — brak węzłów z kompletem danych (S_sc'' i S_n).",
                (),
                ocena,
            )

        numerator = sum(s_sc * s_n for s_sc, s_n, _ in valid)
        sum_sn = sum(s_n for _, s_n, _ in valid)
        wscr = _round(numerator / (sum_sn**2))
        ocena = ocena_sily(
            wskaznik="WSCR",
            nazwa_pl="Źródła falownikowe sieci",
            element_ref=None,
            wartosc=wscr,
            prog_slaby=self.weak_threshold,
            dane_przyjete=dane,
        )
        verdict, _ = klasa_sily(ocena, wartosc=wscr, prog_bardzo_slaby=self.very_weak_threshold)
        why = (
            f"WSCR = {wscr} dla {len(valid)} źródeł — sieć {verdict}. "
            "WSCR ujmuje wzajemne oddziaływanie źródeł falownikowych w pobliżu "
            "(metodyka ERCOT)."
        )
        white_box = (
            WhiteBoxStep(
                symbol="WSCR",
                formula_latex=(
                    r"\mathrm{WSCR} = \dfrac{\sum_i S_{sc,i}'' \cdot S_{n,i}}"
                    r"{\left(\sum_i S_{n,i}\right)^2}"
                ),
                substitution_pl=(
                    f"licznik Σ(S_sc·S_n) = {_round(numerator)} MVA²; "
                    f"(Σ S_n)² = {_round(sum_sn**2)} MVA²"
                ),
                result_pl=f"WSCR = {wscr} (–), n = {len(valid)}",
            ),
        )
        return wscr, verdict, why, white_box, ocena
