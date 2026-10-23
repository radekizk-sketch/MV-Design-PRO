#!/usr/bin/env python3
"""
Protection FUSE Band Guard — karta N-D5-FUSE (zapadka), przepisana w karcie
BIEG-ZABEZPIECZEN-Z-MODELU na architekturę jednej ścieżki oceny.

ZAPADKA NA KLASE DEFEKTU: bezpiecznik topikowy liczony po cichu jak przekaznik.

TLO POMIAROWE (karta N-D5-FUSE, pomiar na zywej sciezce API):
    Urzadzenie `device_type=FUSE` ze zgloszona norma krzywej „FUSE" dostawalo
    100 punktow krzywej IDENTYCZNYCH CO DO OSTATNIEJ CYFRY z przekaznikiem
    IEC 60255 SI, ale opisanych etykieta `FUSE_SI`. Zrodlem byl CICHY fallback
    `standard_map.get(curve_settings.standard, CurveCurveStandard.IEC)`.

FIZYKA: bezpiecznik topikowy SN nie ma charakterystyki IDMT ani mnoznika
czasowego TMS. Ma PASMO topikowe (krzywa przedlukowa i krzywa wylaczania)
z karty katalogowej producenta wg IEC 60282-1 / PN-EN 60282-1. Pasma nie da
sie wyprowadzic ze wzoru — to dane pomiarowe producenta.

ARCHITEKTURA PO KARCIE BIEG-ZABEZPIECZEN-Z-MODELU: urzadzenia koordynacji pochodza z modelu.
Przekazniki to przypisania zabezpieczen (`protection_assignments`) oceniane JEDNA sciezka
(`ocena_nadpradowa`) wylacznie przy aparacie, ktory przerywa prad zwarciowy na rozkaz
przekaznika (`_APARATY_WYLACZAJACE`); bezpieczniki to galezie `FuseBranch` modelu, ktore
koordynacja niesie jako pozycje BEZ pasma (`bezpieczniki` wejscia). Klasa defektu ma wiec dwie
drogi powrotu: bezpiecznik jako aparat wylaczajacy przekaznika albo pozycja bezpiecznika z
punktami krzywej / czasem wzoru przekaznikowego.

CO SPRAWDZA (trzy niezalezne warstwy, nie sam tekst):
  1. TEKST: w plikach koordynacji i sciezki oceny nie ma cichego zastepnika normy krzywej
     (`.get(<cokolwiek>, CurveCurveStandard.<X>)` albo `.get(<cokolwiek>, "IEC_…"/"DT")`) ani
     etykiety `FUSE_…` sklejanej w kodzie.
  2. STRUKTURA: bezpiecznik NIE jest aparatem wylaczajacym przekaznika
     (`SwitchType.FUSE not in _APARATY_WYLACZAJACE`).
  3. ZACHOWANIE: bezpiecznik przepuszczony przez analizator koordynacji (bez nastaw, z nastawami
     o ksztalcie przekaznikowym, jako jedyna pozycja i obok innych) NIE dostaje ani jednego
     punktu krzywej, progu, mnoznika ani sprawdzenia z liczba; dostaje powod po polsku.

EXIT CODES:
  0 = czysto
  1 = naruszenie
  2 = nie znaleziono pliku/modulu do zbadania
"""

from __future__ import annotations

import re
import sys
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = REPO_ROOT / "backend" / "src"
KOORDYNACJA = BACKEND_SRC / "application/analyses/protection/coordination"
PLIKI = (
    KOORDYNACJA / "analyzer.py",
    KOORDYNACJA / "models.py",
    KOORDYNACJA / "z_biegow.py",
    BACKEND_SRC / "application/analyses/protection/ocena_nadpradowa.py",
)

#: Cichy zastepnik normy albo charakterystyki krzywej. `re.DOTALL` jest ISTOTNY: pierwsza
#: wersja tej zapadki skanowala linia po linii i przepuscila iniekcje, w ktorej `.get(` i
#: `CurveCurveStandard.` staly w dwoch kolejnych liniach po sformatowaniu przez black.
_CICHY_ZASTEPNIK = re.compile(
    r"\.get\([^()]*,\s*(?:CurveCurveStandard\.|[\"'](?:IEC_|IEEE_|DT[\"']))", re.DOTALL
)
#: Etykieta krzywej bezpiecznikowej sklejana w kodzie (dawne `FUSE_SI`) — sugeruje pasmo tam,
#: gdzie pasma nie ma.
_ETYKIETA_FUSE = re.compile(r"[\"']FUSE_")

#: Warianty pozycji bezpiecznika, ktore moze niesc wejscie koordynacji (iloczyn cech).
WARIANTY_BEZPIECZNIKA: tuple[dict[str, Any], ...] = (
    {"id": "F1", "name": "Bezpiecznik bez nastaw", "device_type": "FUSE", "nastawy": None},
    {
        "id": "F2",
        "name": "Bezpiecznik z nastawami przekaznikowymi",
        "device_type": "FUSE",
        "nastawy": [
            {
                "function_type": "overcurrent_51",
                "threshold_a": 63.0,
                "threshold_unit": "A_PIERWOTNY",
                "curve_type": "IEC_SI",
                "time_multiplier": 0.1,
            }
        ],
    },
    {"id": "F3", "name": "Bezpiecznik ze strefa", "device_type": "FUSE", "strefa": ["B1"]},
)


def _bez_komentarzy(tekst: str) -> str:
    """Linie kodu bez komentarzy (komentarz opisujacy defekt nie jest defektem)."""
    return "\n".join(linia.split("#", 1)[0] for linia in tekst.splitlines())


def sprawdz_tekst(zrodla: Mapping[str, str]) -> list[str]:
    """Warstwa 1 — `zrodla`: nazwa pliku → tresc."""
    naruszenia: list[str] = []
    for nazwa, zrodlo in sorted(zrodla.items()):
        kod = _bez_komentarzy(zrodlo)
        for wzorzec, opis in (
            (_CICHY_ZASTEPNIK, "cichy zastepnik normy/charakterystyki krzywej"),
            (_ETYKIETA_FUSE, "etykieta FUSE_… sklejana w kodzie"),
        ):
            for trafienie in wzorzec.finditer(kod):
                numer = kod.count("\n", 0, trafienie.start()) + 1
                fragment = " ".join(trafienie.group(0).split())
                naruszenia.append(
                    f"{nazwa}:{numer}: {opis} — bezpiecznik dostalby wzor albo etykiete "
                    f"przekaznikowa: {fragment}"
                )
    return naruszenia


def sprawdz_strukture(aparaty_wylaczajace: Any, typ_bezpiecznika: Any) -> list[str]:
    """Warstwa 2 — bezpiecznik nie jest aparatem, przez ktory dziala przekaznik."""
    if typ_bezpiecznika in aparaty_wylaczajace:
        return [
            "STRUKTURA: `_APARATY_WYLACZAJACE` sciezki oceny zawiera SwitchType.FUSE — "
            "przekaznik przy bezpieczniku dostalby czas wzoru IEC 60255"
        ]
    return []


def _analizator_domyslny() -> Callable[[Any], dict[str, Any]]:
    from application.analyses.protection.coordination.analyzer import (
        OvercurrentCoordinationAnalyzer,
    )
    from application.analyses.protection.coordination.models import CoordinationConfig

    def analizuj(wejscie: Any) -> dict[str, Any]:
        wynik = OvercurrentCoordinationAnalyzer(config=CoordinationConfig()).analyze(wejscie)
        return wynik.to_dict()

    return analizuj


def sprawdz_zachowanie(analizuj: Callable[[Any], dict[str, Any]] | None = None) -> list[str]:
    """Warstwa 3 — bezpiecznik przez analizator: bez punktow, progu, mnoznika i liczb."""
    from application.analyses.protection.coordination.analyzer import (
        KOD_BRAK_PASMA_BEZPIECZNIKA,
    )
    from application.analyses.protection.coordination.models import (
        CoordinationConfig,
        CoordinationInput,
    )
    from application.analyses.protection.ocena_nadpradowa import WynikOceny

    analizuj = analizuj or _analizator_domyslny()
    pusta = WynikOceny(oceny=(), odmowy=(), pominiete=(), nastawy=())
    naruszenia: list[str] = []
    # Iloczyn: kazdy wariant osobno oraz wszystkie razem (pozycja obok innych bezpiecznikow).
    zestawy = [(w,) for w in WARIANTY_BEZPIECZNIKA] + [WARIANTY_BEZPIECZNIKA]
    for zestaw in zestawy:
        wejscie = CoordinationInput(
            ocena_max=pusta,
            ocena_min=pusta,
            pary=(),
            odmowy_par=(),
            prady_robocze={},
            prady_punktow_max={},
            prady_punktow_min={},
            rodzaj_zwarcia_max="3F",
            rodzaj_zwarcia_min="3F",
            bezpieczniki=tuple(zestaw),
            config=CoordinationConfig(),
            project_id="guard",
            sc_run_id="guard-max",
            sc_run_id_min="guard-min",
        )
        try:
            wynik = analizuj(wejscie)
        except Exception as blad:  # noqa: BLE001 — kazdy wyjatek to naruszenie
            # Uczciwy brak pasma jest wynikiem, a nie bledem analizy.
            naruszenia.append(
                f"ZACHOWANIE: analiza bezpiecznikow {[b['id'] for b in zestaw]} zakonczyla "
                f"sie wyjatkiem {type(blad).__name__}: {blad}"
            )
            continue
        krzywe = {str(k["device_id"]): k for k in wynik.get("tcc_curves", [])}
        for bezpiecznik in zestaw:
            ident = str(bezpiecznik["id"])
            krzywa = krzywe.get(ident)
            if krzywa is None:
                naruszenia.append(
                    f"ZACHOWANIE: bezpiecznik {ident} zniknal z wyniku — brak pasma musi byc "
                    "nazwany pozycja z powodem, nie przemilczany"
                )
                continue
            if krzywa.get("points"):
                naruszenia.append(
                    f"ZACHOWANIE: bezpiecznik {ident} dostal {len(krzywa['points'])} punktow "
                    "krzywej — fabrykacja fizyki przekaznika dla bezpiecznika topikowego"
                )
            for pole in ("pickup_current_a", "time_multiplier"):
                if krzywa.get(pole) is not None:
                    naruszenia.append(
                        f"ZACHOWANIE: bezpiecznik {ident} dostal {pole}={krzywa[pole]} — "
                        "bezpiecznik nie ma progu ani mnoznika czasowego"
                    )
            if krzywa.get("podstawa_kod") != KOD_BRAK_PASMA_BEZPIECZNIKA:
                naruszenia.append(
                    f"ZACHOWANIE: bezpiecznik {ident} ma podstawe "
                    f"{krzywa.get('podstawa_kod')!r} zamiast {KOD_BRAK_PASMA_BEZPIECZNIKA}"
                )
            if str(krzywa.get("curve_type", "")).startswith("FUSE_"):
                naruszenia.append(
                    f"ZACHOWANIE: bezpiecznik {ident} ma etykiete {krzywa['curve_type']!r} "
                    "sugerujaca pasmo tam, gdzie pasma nie ma"
                )
            if not krzywa.get("powod_pl"):
                naruszenia.append(
                    f"ZACHOWANIE: bezpiecznik {ident} bez powodu po polsku — cichy brak jest "
                    "tak samo zly jak cicha fabrykacja"
                )
            for klucz in ("sensitivity_checks", "selectivity_checks", "overload_checks"):
                for sprawdzenie in wynik.get(klucz, []):
                    if ident in (
                        sprawdzenie.get("device_id"),
                        sprawdzenie.get("upstream_device_id"),
                        sprawdzenie.get("downstream_device_id"),
                    ):
                        naruszenia.append(
                            f"ZACHOWANIE: bezpiecznik {ident} wystepuje w {klucz} — "
                            "liczba bez pasma topikowego jest fabrykacja"
                        )
    return naruszenia


def main() -> int:
    brakujace = [p for p in PLIKI if not p.exists()]
    if brakujace:
        for plik in brakujace:
            print(f"BLAD: nie znaleziono {plik}", file=sys.stderr)
        return 2
    sys.path.insert(0, str(BACKEND_SRC))
    from application.analyses.protection.ocena_nadpradowa import _APARATY_WYLACZAJACE
    from network_model.core.switch import SwitchType

    naruszenia = sprawdz_tekst(
        {str(p.relative_to(REPO_ROOT)): p.read_text(encoding="utf-8") for p in PLIKI}
    )
    naruszenia += sprawdz_strukture(_APARATY_WYLACZAJACE, SwitchType.FUSE)
    naruszenia += sprawdz_zachowanie()

    if naruszenia:
        print("PROTECTION FUSE BAND GUARD — NARUSZENIA:", file=sys.stderr)
        for naruszenie in naruszenia:
            print(f"  - {naruszenie}", file=sys.stderr)
        print(
            "\nBezpiecznik topikowy nie ma charakterystyki IDMT (IEC 60255). "
            "Jego pasmo (IEC 60282-1) pochodzi z karty katalogowej producenta.",
            file=sys.stderr,
        )
        return 1

    print("PROTECTION FUSE BAND GUARD: czysto (tekst + struktura + zachowanie)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
