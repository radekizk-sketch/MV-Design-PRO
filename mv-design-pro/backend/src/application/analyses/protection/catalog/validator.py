from __future__ import annotations

from application.analyses.protection.catalog.models import (
    DeviceCapability,
    ProtectionRequirementV0,
)
from application.analyses.protection.catalog.zakresy import (
    w_zakresie,
    wartosc_pierwotna_w_jednostce_zakresu,
    zakres_pradowy,
)

#: Naruszenia zakresów prądowych niesprawdzalnych (karta BIEG-ZABEZPIECZEN-Z-MODELU, PZ-09):
#: zakres pozycji bez ustalonej jednostki i wymaganie bez przekładni przekładnika. Aparatu nie
#: da się wtedy potwierdzić — to nazwany brak, nie „zgodność" (dawniej prąd PIERWOTNY
#: wymagania porównywano wprost z zakresem strony wtórnej).
ZAKRES_PRADOWY_NIEUSTALONY = "ZAKRES_PRADOWY_NIEUSTALONY"
ZAKRES_PRADOWY_BEZ_PRZEKLADNI = "ZAKRES_PRADOWY_BEZ_PRZEKLADNI"


def validate_requirement(
    req: ProtectionRequirementV0,
    cap: DeviceCapability,
    *,
    przekladnia_a: tuple[float, float] | None,
) -> tuple[bool, tuple[str, ...]]:
    """Zgodność wymagania (prądy PIERWOTNE) z pozycją katalogu; ``przekladnia_a`` —
    (I1n, I2n) przekładnika zabezpieczenia albo ``None`` (brak przekładnika w modelu)."""
    violations: list[str] = []

    def prad_poza_zakresem(kod: str, prad_pierwotny_a: float | None) -> bool | None:
        """``None`` — porównanie niewykonalne (brak jednostki albo przekładni)."""
        if prad_pierwotny_a is None:
            return False
        if cap.jednostka_zakresow_pradowych is None:
            if ZAKRES_PRADOWY_NIEUSTALONY not in violations:
                violations.append(ZAKRES_PRADOWY_NIEUSTALONY)
            return None
        if przekladnia_a is None:
            if ZAKRES_PRADOWY_BEZ_PRZEKLADNI not in violations:
                violations.append(ZAKRES_PRADOWY_BEZ_PRZEKLADNI)
            return None
        wartosc, _jednostka = wartosc_pierwotna_w_jednostce_zakresu(
            cap, prad_pierwotny_a, przekladnia_a
        )
        minimum, maksimum = zakres_pradowy(cap, kod)
        return not w_zakresie(wartosc, minimum, maksimum)

    if req.curve not in cap.curves_supported:
        violations.append("UNSUPPORTED_CURVE")

    required_functions = _required_functions(req)
    for function_code in ("50", "51", "50N", "51N"):
        if function_code in required_functions and function_code not in cap.functions_supported:
            violations.append(f"UNSUPPORTED_FUNCTION_{function_code}")

    if _should_check_range("51", required_functions, cap) and prad_poza_zakresem(
        "51", req.i_pickup_51_a
    ):
        violations.append("I51_OUT_OF_RANGE")
    # Karta W3-C1: mnoznik czasowy (TMS) i czas okreslony (DT) sa DWIE ROZNE
    # wielkosci czasowe stopnia 51 — wymaganie niesie dokladnie JEDNA z nich
    # (druga jest `None` z definicji krzywej, nie brakiem danych), wiec kazda
    # sprawdza sie WYLACZNIE gdy wymaganie ja niesie.
    if (
        _should_check_range("51", required_functions, cap)
        and req.tms_51 is not None
        and not _in_range(req.tms_51, cap.tms_51_min, cap.tms_51_max)
    ):
        violations.append("TMS51_OUT_OF_RANGE")
    if (
        _should_check_range("51", required_functions, cap)
        and req.t_51_s is not None
        and not _in_range(req.t_51_s, cap.t_51_s_min, cap.t_51_s_max)
    ):
        violations.append("T51S_OUT_OF_RANGE")
    if _should_check_range("50", required_functions, cap) and prad_poza_zakresem(
        "50", req.i_inst_50_a
    ):
        violations.append("I50_OUT_OF_RANGE")
    if _should_check_range("51N", required_functions, cap) and prad_poza_zakresem(
        "51N", req.i_pickup_51n_a
    ):
        violations.append("I51N_OUT_OF_RANGE")
    if _should_check_range("51N", required_functions, cap) and not _in_range(
        req.tms_51n, cap.tms_51n_min, cap.tms_51n_max
    ):
        violations.append("TMS51N_OUT_OF_RANGE")
    if _should_check_range("50N", required_functions, cap) and prad_poza_zakresem(
        "50N", req.i_inst_50n_a
    ):
        violations.append("I50N_OUT_OF_RANGE")

    return (len(violations) == 0, tuple(violations))


def _required_functions(req: ProtectionRequirementV0) -> set[str]:
    """Funkcje, których wymaga zestaw nastaw.

    V12K-189: nastawa ``None`` (niewyznaczalna z danych) NIE stawia wymagania
    wobec aparatu — nie ma czym go sprawdzić. Doboru nie wolno wtedy oprzeć na
    wartości zastępczej; brak nastawy jest widoczny w kodach gotowości.
    """
    required: set[str] = set()
    if _is_set(req.i_inst_50_a):
        required.add("50")
    # Karta W3-C1: `tms_51 > 0` zakladalo, ze mnoznik czasowy jest ZAWSZE liczba —
    # dla wymagania definite-time (Hoppel, `curve = "DT"`) jest `None` (nie ma
    # mnoznika bez krzywej odwrotnoczasowej), wiec goly `>` wywalalby TypeError.
    # `_is_set` jest already None-bezpieczne.
    if _is_set(req.i_pickup_51_a) or _is_set(req.tms_51) or _is_set(req.t_51_s):
        required.add("51")
    if _is_set(req.i_inst_50n_a):
        required.add("50N")
    if _is_set(req.i_pickup_51n_a) or _is_set(req.tms_51n):
        required.add("51N")
    return required


def _is_set(value: float | None) -> bool:
    return value is not None and value > 0


def _in_range(value: float | None, minimum: float | None, maximum: float | None) -> bool:
    # Nastawa niewyznaczalna nie może naruszyć zakresu aparatu (V12K-189).
    # Karta W3-C1: aparat, ktory NIE deklaruje zakresu (np. `t_51_s_min/max`
    # aparatu bez danych producenta o czasie okreslonym), tez nie moze zglosic
    # naruszenia — brak granicy nie jest granica zerowa (ten sam princyp co
    # brak wartosci, zastosowany do drugiego operandu porownania).
    if value is None or minimum is None or maximum is None:
        return True
    return minimum <= value <= maximum


def _should_check_range(
    function_code: str, required_functions: set[str], cap: DeviceCapability
) -> bool:
    return function_code in required_functions and function_code in cap.functions_supported
