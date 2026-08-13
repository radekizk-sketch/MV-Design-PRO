#!/usr/bin/env python3
"""
Protection FUSE Band Guard — karta N-D5-FUSE (zapadka)

ZAPADKA NA KLASE DEFEKTU: bezpiecznik topikowy liczony po cichu jak przekaznik.

TLO POMIAROWE (karta N-D5-FUSE, pomiar na zywej sciezce API):
    Urzadzenie `device_type=FUSE` ze zgloszona norma krzywej „FUSE" dostawalo
    100 punktow krzywej IDENTYCZNYCH CO DO OSTATNIEJ CYFRY z przekaznikiem
    IEC 60255 SI, ale opisanych etykieta `FUSE_SI`. Zrodlem byl CICHY fallback
    `standard_map.get(curve_settings.standard, CurveCurveStandard.IEC)`
    powtorzony w DWOCH miejscach analizatora koordynacji naraz.

FIZYKA: bezpiecznik topikowy SN nie ma charakterystyki IDMT ani mnoznika
czasowego TMS. Ma PASMO topikowe (krzywa przedlukowa i krzywa wylaczania)
z karty katalogowej producenta wg IEC 60282-1 / PN-EN 60282-1. Pasma nie da
sie wyprowadzic ze wzoru — to dane pomiarowe producenta.

CO SPRAWDZA (trzy niezalezne warstwy, nie sam tekst):
  1. TEKST: w analizatorze koordynacji nie ma cichego zastepnika normy krzywej
     (`.get(<cokolwiek>, CurveCurveStandard.<X>)`).
  2. STRUKTURA: obie sciezki — czasu zadzialania i generowania krzywej TCC —
     wolaja `rozstrzygnij_podstawe_krzywej` (jedno zrodlo prawdy).
  3. ZACHOWANIE: bezpiecznik przepuszczony przez analizator NIE dostaje ani
     jednego punktu krzywej i NIE dostaje wyznaczonego czasu zadzialania.
     Warstwa 3 jest najwazniejsza — lapie regresje nawet gdy ktos przepisze
     kod tak, ze warstwy 1 i 2 przestana pasowac.

EXIT CODES:
  0 = czysto
  1 = naruszenie
  2 = nie znaleziono pliku/modulu do zbadania
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = REPO_ROOT / "backend" / "src"
ANALYZER = BACKEND_SRC / "application/analyses/protection/coordination/analyzer.py"

#: Cichy zastepnik normy krzywej — dokladnie ten wzorzec byl defektem.
#: `re.DOTALL` jest ISTOTNY: pierwsza wersja tej zapadki skanowala linia po
#: linii i przepuscila iniekcje, w ktorej `.get(` i `CurveCurveStandard.` staly
#: w dwoch kolejnych liniach po sformatowaniu przez black (pomiar: iniekcja 1
#: karty N-D5-FUSE wyszla zielona, choc defekt byl w kodzie).
_CICHY_ZASTEPNIK = re.compile(r"\.get\([^()]*,\s*CurveCurveStandard\.", re.DOTALL)

#: Obie sciezki MUSZA wolac wspolne rozstrzygniecie.
_ROZSTRZYGNIECIE = "rozstrzygnij_podstawe_krzywej"
_SCIEZKI = ("_calculate_device_trip_time", "_generate_tcc_curves")


def _bez_komentarzy(tekst: str) -> str:
    """Linie kodu bez komentarzy (komentarz opisujacy defekt nie jest defektem)."""
    linie = []
    for linia in tekst.splitlines():
        bez = linia.split("#", 1)[0]
        linie.append(bez)
    return "\n".join(linie)


def _cialo_metody(zrodlo: str, nazwa: str) -> str:
    """Cialo metody `nazwa` — od jej `def` do nastepnego `def` na tym samym poziomie."""
    dopasowanie = re.search(rf"\n(\s*)def {re.escape(nazwa)}\(", zrodlo)
    if dopasowanie is None:
        return ""
    wciecie = dopasowanie.group(1)
    poczatek = dopasowanie.end()
    reszta = zrodlo[poczatek:]
    koniec = re.search(rf"\n{wciecie}def ", reszta)
    return reszta[: koniec.start()] if koniec else reszta


def _sprawdz_tekst(naruszenia: list[str]) -> str:
    zrodlo = ANALYZER.read_text(encoding="utf-8")
    kod = _bez_komentarzy(zrodlo)

    # Skan CALEGO zrodla (nie linia po linii) — wywolanie `.get(...)` bywa
    # rozlamane przez formatowanie na kilka linii.
    for trafienie in _CICHY_ZASTEPNIK.finditer(kod):
        numer = kod.count("\n", 0, trafienie.start()) + 1
        fragment = " ".join(trafienie.group(0).split())
        naruszenia.append(
            f"{ANALYZER.relative_to(REPO_ROOT)}:{numer}: cichy zastepnik normy krzywej "
            f"— bezpiecznik dostalby wzor przekaznikowy: {fragment}"
        )

    for sciezka in _SCIEZKI:
        cialo = _cialo_metody(kod, sciezka)
        if not cialo:
            naruszenia.append(
                f"{ANALYZER.relative_to(REPO_ROOT)}: nie znaleziono metody {sciezka}() "
                "— zapadka stracila kontakt z kodem, popraw guard razem z kodem"
            )
        elif _ROZSTRZYGNIECIE not in cialo:
            naruszenia.append(
                f"{ANALYZER.relative_to(REPO_ROOT)}: {sciezka}() nie wola "
                f"{_ROZSTRZYGNIECIE}() — warunek wejscia i wyjscia przestal pochodzic "
                "z jednego zrodla prawdy"
            )
    return zrodlo


def _sprawdz_zachowanie(naruszenia: list[str]) -> None:
    """Przepusc bezpiecznik przez analizator i sprawdz, ze nie dostal krzywej."""
    sys.path.insert(0, str(BACKEND_SRC))
    from uuid import UUID

    from application.analyses.protection.coordination import (
        CoordinationInput,
        OvercurrentCoordinationAnalyzer,
    )
    from application.analyses.protection.coordination.models import (
        FaultCurrentData,
        OperatingCurrentData,
    )
    from domain.protection_device import (
        CurveStandard,
        OvercurrentProtectionSettings,
        OvercurrentStageSettings,
        ProtectionCurveSettings,
        ProtectionDevice,
        ProtectionDeviceType,
    )

    def _bezpiecznik(idx: int, standard: CurveStandard | None) -> ProtectionDevice:
        krzywa = (
            None
            if standard is None
            else ProtectionCurveSettings(
                standard=standard,
                variant="SI",
                pickup_current_a=63.0,
                time_multiplier=0.1,
            )
        )
        return ProtectionDevice(
            id=UUID(int=idx),
            name=f"Bezpiecznik-{standard or 'bez-krzywej'}",
            device_type=ProtectionDeviceType.FUSE,
            location_element_id="L1",
            settings=OvercurrentProtectionSettings(
                stage_51=OvercurrentStageSettings(
                    enabled=True, pickup_current_a=63.0, curve_settings=krzywa
                )
            ),
        )

    # ILOCZYN CECH: bezpiecznik zglaszany na trzy sposoby, ktore uzytkownik moze
    # wpisac — z norma „FUSE", z norma przekaznikowa IEC (bo ktos wybral z listy)
    # i zupelnie bez nastaw krzywej. KAZDY musi skonczyc bez punktow.
    warianty = [
        _bezpiecznik(1, CurveStandard.FUSE),
        _bezpiecznik(2, CurveStandard.IEC),
        _bezpiecznik(3, None),
    ]

    analizator = OvercurrentCoordinationAnalyzer()
    for urzadzenie in warianty:
        try:
            wynik = analizator.analyze(
                CoordinationInput(
                    devices=(urzadzenie,),
                    fault_currents=(
                        FaultCurrentData(location_id="L1", ik_max_3f_a=5000.0, ik_min_3f_a=1200.0),
                    ),
                    operating_currents=(
                        OperatingCurrentData(location_id="L1", i_operating_a=40.0),
                    ),
                )
            )
        except Exception as blad:  # noqa: BLE001 — kazdy wyjatek to naruszenie
            # Analiza bezpiecznika NIE MOZE sie wywrocic: uczciwy brak podstawy
            # jest wynikiem, a nie bledem. Wyjatek zwykle znaczy, ze norma i
            # nastawy krzywej rozjechaly sie na dwa niezalezne warunki.
            naruszenia.append(
                f"ZACHOWANIE: analiza bezpiecznika „{urzadzenie.name}” zakonczyla sie "
                f"wyjatkiem {type(blad).__name__}: {blad}"
            )
            continue
        for krzywa in wynik.tcc_curves:
            if krzywa.points:
                naruszenia.append(
                    f"ZACHOWANIE: bezpiecznik „{urzadzenie.name}” dostal "
                    f"{len(krzywa.points)} punktow krzywej ({krzywa.curve_type}) — "
                    "to fabrykacja fizyki przekaznika dla bezpiecznika topikowego"
                )
            if krzywa.podstawa_kod == "KRZYWA_PRZEKAZNIKOWA":
                naruszenia.append(
                    f"ZACHOWANIE: bezpiecznik „{urzadzenie.name}” zostal oznaczony "
                    "jako krzywa przekaznikowa (podstawa_kod=KRZYWA_PRZEKAZNIKOWA)"
                )
            if krzywa.curve_type.startswith("FUSE_"):
                naruszenia.append(
                    f"ZACHOWANIE: pozycja bezpiecznika ma etykiete „{krzywa.curve_type}” "
                    "sugerujaca krzywa bezpiecznikowa tam, gdzie krzywej nie ma"
                )

        try:
            czas, powod = analizator._calculate_device_trip_time(urzadzenie, 5000.0)
        except Exception as blad:  # noqa: BLE001 — kazdy wyjatek to naruszenie
            naruszenia.append(
                f"ZACHOWANIE: wyznaczanie czasu dla bezpiecznika „{urzadzenie.name}” "
                f"zakonczylo sie wyjatkiem {type(blad).__name__}: {blad}"
            )
            continue
        if czas != float("inf"):
            naruszenia.append(
                f"ZACHOWANIE: bezpiecznik „{urzadzenie.name}” dostal wyznaczony czas "
                f"zadzialania {czas} s — bez pasma topikowego czasu nie ma skad wziac"
            )
        if not powod:
            naruszenia.append(
                f"ZACHOWANIE: bezpiecznik „{urzadzenie.name}” nie dostal powodu po polsku "
                "— cichy brak jest tak samo zly jak cicha fabrykacja"
            )


def main() -> int:
    if not ANALYZER.exists():
        print(f"BLAD: nie znaleziono {ANALYZER}", file=sys.stderr)
        return 2

    naruszenia: list[str] = []
    _sprawdz_tekst(naruszenia)
    _sprawdz_zachowanie(naruszenia)

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
