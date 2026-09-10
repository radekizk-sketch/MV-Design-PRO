from __future__ import annotations

from application.analyses.protection.catalog.models import (
    DeviceCapability,
    DeviceMappingResult,
    ProtectionRequirementV0,
)
from application.analyses.protection.catalog.validator import validate_requirement
from application.protection_settings.engine import ProtectionSettingsResult


def wymaganie_z_nastaw(wynik: ProtectionSettingsResult) -> ProtectionRequirementV0:
    """Wymaganie doboru aparatu z wyniku silnika nastaw Hoppela (karta W3-C1).

    Hoppel wyznacza WYŁĄCZNIE stopnie FAZOWE metodą czasu OKREŚLONEGO (definite
    time) — I> ma jedną nastawę prądową (`delayed.i_setting_a`) i jedną czasową
    (`delayed.t_setting_s`), bez krzywej odwrotnoczasowej, więc `curve = "DT"` i
    `tms_51 = None` (mnożnik czasowy nie ma znaczenia bez krzywej odwrotnoczasowej
    — to DRUGA wielkość czasowa niż `t_51_s`, nie ten sam mnożnik z brakującą
    wartością). I>> jest wartością progową bez własnej nastawy czasowej odrębnej
    od CURVE/DT tego stopnia. Ziemnozwarciowe 51N/50N Hoppel NIE wyznacza —
    `None` jest tu semantyką „niewyznaczalne" (ta sama, którą V12K-189 ustalił
    dla braku danych), nie fabrykowanym brakiem wymagania.
    """
    return ProtectionRequirementV0(
        curve="DT",
        i_pickup_51_a=wynik.delayed.i_setting_a,
        tms_51=None,
        t_51_s=wynik.delayed.t_setting_s,
        i_inst_50_a=wynik.instantaneous.i_setting_a,
        i_pickup_51n_a=None,
        tms_51n=None,
        i_inst_50n_a=None,
    )


def map_requirement_to_device(
    req: ProtectionRequirementV0, cap: DeviceCapability
) -> DeviceMappingResult:
    compatible, violations = validate_requirement(req, cap)
    if not compatible:
        return DeviceMappingResult(
            compatible=False,
            violations=violations,
            mapped_settings={},
            assumptions=("MAPPING_SKIPPED_INCOMPATIBLE",),
        )

    # V12K-189: nastawa niewyznaczalna z danych (None) NIE trafia do mapowania —
    # do przekaźnika nie wolno wpisać wartości, której projekt nie wyliczył.
    # Brak pozycji w `mapped_settings` jest jawny: konsument widzi, czego nie ma.
    # Karta W3-C1: `T51` (czas określony [s]) dołącza do słownika logicznego obok
    # `TMS51` (mnożnik czasowy) — wymaganie niesie dokładnie JEDNĄ z tych dwóch
    # wielkości czasowych (druga jest `None` z definicji krzywej), więc obie mogą
    # bezpiecznie przejść przez ten sam filtr „wartość nie jest None".
    candidate_settings: dict[str, float | str | None] = {
        "I51": req.i_pickup_51_a,
        "TMS51": req.tms_51,
        "T51": req.t_51_s,
        "I50": req.i_inst_50_a,
        "I51N": req.i_pickup_51n_a,
        "TMS51N": req.tms_51n,
        "I50N": req.i_inst_50n_a,
        "CURVE": req.curve,
    }
    mapped_settings = {key: value for key, value in candidate_settings.items() if value is not None}
    assumptions = ["LOGICAL_MAPPING_ONLY", "NO_VENDOR_PARAM_IDS"]
    # Karta W3-C1: TMS51/T51 sa WZAJEMNIE WYKLUCZAJACE (druga wielkosc czasowa
    # stopnia 51 zalezy od `curve` — definite time niesie T51, odwrotnoczasowa
    # niesie TMS51). Kompletnosc porownuje sie do zbioru kluczy WLASCIWEGO dla
    # TEJ krzywej — inaczej kazde poprawne wymaganie DT zglaszaloby fantomowy
    # brak danych (TMS51 = None dla DT nie jest brakiem, jest inna krzywa).
    czas_51_klucz = "T51" if req.curve == "DT" else "TMS51"
    oczekiwane_klucze = {key for key in candidate_settings if key not in ("TMS51", "T51")} | {
        czas_51_klucz
    }
    if oczekiwane_klucze - mapped_settings.keys():
        assumptions.append("SETTINGS_INCOMPLETE_MISSING_INPUT_DATA")
    if cap.meta.get("unverified"):
        assumptions.append("UNVERIFIED_MODEL")
    return DeviceMappingResult(
        compatible=True,
        violations=(),
        mapped_settings=mapped_settings,
        assumptions=tuple(assumptions),
    )
