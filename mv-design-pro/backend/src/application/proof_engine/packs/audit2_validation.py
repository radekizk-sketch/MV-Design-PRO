"""
Audit2 Validation Proof Pack — pakiet dowodowy dla rozszerzen audytu 2.

5 typow dowodow (Phase 4):
  - AUDIT2_BESS_OPERATION_MODES (eng.10): zgodnosc trybow ze zdolnosciami PCS
  - AUDIT2_TAP_CHANGER_PLAN (eng.13): plan przelaczania zaczepow OLTC/DETC
  - AUDIT2_HOSTING_CAPACITY_EXPORT (eng.15): bilans P_export vs P_import
  - AUDIT2_DEVICE_WITHSTAND (eng.18): walidacja I_dyn / I_th aparatury
  - AUDIT2_VT_GROUNDING_VALIDATION (eng.20): VT U_th vs typ uziemienia

KONTRAKT WEJSCIA Z JEDNEGO ZRODLA (karta PROOFPACK-KONTRAKT). Kazdy generator przyjmuje
TYPOWANA specyfikacje (pydantic, `extra="forbid"`, zamrozona) — ta sama klasa jest
kontraktem wejscia i sygnatura. Dawniej koncowka HTTP przyjmowala nietypowane slowniki
i rozpakowywala je `**spec` do generatorow: karta #144 dodala wymagane nazwy
(`der_nazwa`, `transformer_nazwa`), zmiana sygnatury byla niewidoczna dla kontraktu,
a kazde zadanie konczylo sie HTTP 500. Specyfikacja bez nazwy albo z polem spoza
kontraktu jest odrzucana PRZY BUDOWIE (`ValidationError`), zanim cokolwiek policzy.

INVARIANTS:
- Identical input -> identical output (deterministic) — takze identyfikator dowodu:
  `proof_id` jest wyprowadzony z rodzaju dowodu i specyfikacji (UUID v5), nie losowany.
- LaTeX-only math.
- Walidacje zwracaja zarowno status (pass/fail) jak i message_pl + dane uzasadnienia.
- Teksty dla czlowieka nazywaja elementy nazwa z modelu, nigdy identyfikatorem
  (identyfikatory zostaja w `details`).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Annotated, Any, Literal
from uuid import UUID, uuid5

from network_model.catalog.audit2_catalogs import (
    ETYKIETY_KLAS_TRANSFORMATORA,
    KlasaTransformatoraPrzelacznika,
    get_bess_operation_mode,
    get_tap_changer,
    is_vt_voltage_factor_valid_for_grounding,
    validate_device_withstand,
    validate_hosting_capacity_export,
)
from network_model.core.uziemienie import ETYKIETA_PL_PUNKTU_NEUTRALNEGO, TypPunktuNeutralnego
from network_model.nazwy import nazwa_nadana
from pydantic import AfterValidator, BaseModel, ConfigDict, Field

#: Chwila generacji, gdy wolajacy jej nie poda — przypieta, bo pakiet jest deterministyczny.
CHWILA_GENERACJI_DOMYSLNA = "1970-01-01T00:00:00Z"

#: Rodzaje dowodow audytu 2 w kolejnosci prezentacji — JEDNA lista dla generatorow,
#: skladania pakietu stacji i jawnych brakow danych.
RodzajDowoduAudytu2 = Literal[
    "AUDIT2_BESS_OPERATION_MODES",
    "AUDIT2_TAP_CHANGER_PLAN",
    "AUDIT2_HOSTING_CAPACITY_EXPORT",
    "AUDIT2_DEVICE_WITHSTAND",
    "AUDIT2_VT_GROUNDING_VALIDATION",
]

#: Polska nazwa rodzaju dowodu — ekran i raport pokazuja ja zamiast kodu rodzaju.
ETYKIETY_RODZAJOW_DOWODU: dict[str, str] = {
    "AUDIT2_BESS_OPERATION_MODES": "Tryby pracy magazynu energii",
    "AUDIT2_TAP_CHANGER_PLAN": "Plan regulacji zaczepów transformatora",
    "AUDIT2_HOSTING_CAPACITY_EXPORT": "Zdolność przyłączeniowa — eksport wobec importu",
    "AUDIT2_DEVICE_WITHSTAND": "Wytrzymałość zwarciowa aparatury",
    "AUDIT2_VT_GROUNDING_VALIDATION": "Przekładniki napięciowe wobec uziemienia sieci",
}

#: Przestrzen nazw identyfikatorow dowodow audytu 2 (UUID v5).
_PRZESTRZEN_DOWODOW = UUID("6f1d9a52-3c1e-5b7a-9e0f-2a4c8d6b1e37")


def _nazwa_elementu(wartosc: str) -> str:
    """Nazwa elementu z modelu — jedyny predykat nazwy (`network_model.nazwy`)."""
    nazwa = nazwa_nadana(wartosc)
    if nazwa is None:
        raise ValueError("Dowód nazywa element nazwą z modelu — nazwa elementu nie może być pusta.")
    return nazwa


#: Nazwa elementu z modelu (niepusta po obcieciu spacji).
NazwaElementu = Annotated[str, AfterValidator(_nazwa_elementu)]
#: Identyfikator elementu albo pozycji katalogu (niepusty; zostaje w `details`).
Identyfikator = Annotated[str, Field(min_length=1)]
#: Wielkosc fizyczna nieujemna i skonczona.
WartoscNieujemna = Annotated[float, Field(ge=0)]


class _SpecyfikacjaDowodu(BaseModel):
    """Wspolna konfiguracja specyfikacji: zamrozona, bez pol spoza kontraktu, bez NaN/inf."""

    model_config = ConfigDict(extra="forbid", frozen=True, allow_inf_nan=False)


class SpecDowoduTrybowBess(_SpecyfikacjaDowodu):
    """Magazyn energii i wybrane tryby jego pracy.

    Zdolnosci przeksztaltnika (`pcs_four_quadrant`, `pcs_grid_forming`) pochodza z karty
    katalogowej typu przeksztaltnika zrodla w modelu; `None` = karta nie niesie danej
    („nieustalone") — tryb, ktory jej wymaga, nie dostaje zgodnosci na domysl.
    """

    der_id: Identyfikator
    der_nazwa: NazwaElementu
    pcs_four_quadrant: bool | None
    pcs_grid_forming: bool | None
    selected_mode_refs: tuple[Identyfikator, ...] = Field(min_length=1)


class SpecDowoduPlanuZaczepow(_SpecyfikacjaDowodu):
    """Transformator z modelu i przelacznik zaczepow przypisany mu w konfiguracji stacji."""

    transformer_id: Identyfikator
    transformer_nazwa: NazwaElementu
    transformer_type: KlasaTransformatoraPrzelacznika
    tap_changer_ref: Identyfikator
    requires_avr: bool


class SpecDowoduEksportuStacji(_SpecyfikacjaDowodu):
    """Bilans mocy stacji: suma mocy znamionowych zrodel i suma mocy odbiorow [kW]."""

    station_id: Identyfikator
    p_export_kw: WartoscNieujemna
    p_import_kw: WartoscNieujemna


class SpecDowoduWytrzymalosciAparatu(_SpecyfikacjaDowodu):
    """Aparat pola (pozycja katalogu wytrzymalosci) i prady zwarciowe w miejscu pola."""

    bay_designation: NazwaElementu
    device_id: Identyfikator
    i_peak_calculated_ka: WartoscNieujemna
    i_thermal_calculated_ka: WartoscNieujemna
    t_clearing_s: Annotated[float, Field(gt=0)]


class SpecDowoduUziemieniaPrzekladnika(_SpecyfikacjaDowodu):
    """Przekladnik napieciowy pola wobec sposobu uziemienia punktu neutralnego sieci SN.

    `vt_voltage_factor is None` znaczy „nie da sie ustalic" (typ spoza katalogu albo karta
    bez tej danej) i daje dowod NIEZALICZONY z nazwanym powodem.
    """

    bay_designation: NazwaElementu
    vt_voltage_factor: Annotated[float, Field(gt=0)] | None
    grounding_type: TypPunktuNeutralnego


def _identyfikator_dowodu(proof_type: str, spec: _SpecyfikacjaDowodu) -> UUID:
    """Identyfikator dowodu wyprowadzony z rodzaju i specyfikacji — te same dane, ten sam id."""
    return uuid5(_PRZESTRZEN_DOWODOW, f"{proof_type}|{spec.model_dump_json()}")


@dataclass(frozen=True)
class Audit2ProofResult:
    """Wynik dowodu audytu 2 (jednorodny format dla wszystkich 5 typow)."""

    proof_id: UUID
    proof_type: str
    pass_status: bool
    summary_pl: str
    details: dict[str, Any]
    formulas_latex: list[str]
    generated_at: str  # ISO 8601 deterministyczne — caller dostarcza.

    def to_dict(self) -> dict[str, Any]:
        return {
            "proof_id": str(self.proof_id),
            "proof_type": self.proof_type,
            "rodzaj_pl": ETYKIETY_RODZAJOW_DOWODU[self.proof_type],
            "pass_status": self.pass_status,
            "summary_pl": self.summary_pl,
            "details": self.details,
            "formulas_latex": self.formulas_latex,
            "generated_at": self.generated_at,
        }


# =============================================================================
# 1. BESS Operation Modes proof (eng.10)
# =============================================================================


def _opis_zdolnosci(zdolnosc: bool | None) -> str:
    return "nieustalona" if zdolnosc is None else ("tak" if zdolnosc else "nie")


def generate_bess_modes_proof(
    spec: SpecDowoduTrybowBess,
    *,
    generated_at_iso: str = CHWILA_GENERACJI_DOMYSLNA,
) -> Audit2ProofResult:
    """
    Dowod zgodnosci trybow BESS ze zdolnosciami przeksztaltnika (PCS).

    Naprawa eng.10: tryb wymagajacy pracy czterokwadrantowej albo tworzenia napiecia
    (grid-forming) jest zgodny wylacznie wtedy, gdy karta przeksztaltnika TE zdolnosc
    potwierdza. Zdolnosc nieustalona (`None`) nie jest potwierdzeniem — tryb, ktory jej
    wymaga, daje pozycje kontroli z nazwanym powodem.

    ``der_nazwa`` — nazwa zrodla z modelu do tekstow dowodu; ``der_id`` zostaje
    wylacznie w ``details`` (karta #144: tekst nigdy z identyfikatora).
    """
    proof_type = "AUDIT2_BESS_OPERATION_MODES"
    der_nazwa = spec.der_nazwa
    issues: list[str] = []
    selected_modes: list[dict[str, Any]] = []
    unknown_mode_refs: list[str] = []

    for ref in sorted(set(spec.selected_mode_refs)):
        mode = get_bess_operation_mode(ref)
        if mode is None:
            unknown_mode_refs.append(ref)
            issues.append(
                f"Trybu pracy wskazanego dla magazynu {der_nazwa} nie ma w katalogu trybów BESS."
            )
            continue
        # PCS capability check — potwierdzenie wymaga danej z karty przeksztaltnika.
        if mode.requires_four_quadrant and spec.pcs_four_quadrant is not True:
            powod = (
                "nie obsługuje"
                if spec.pcs_four_quadrant is False
                else "karta przekształtnika nie podaje granic mocy biernej — zdolności "
                "nie da się potwierdzić"
            )
            issues.append(
                f"Tryb '{mode.label_pl}' wymaga PCS 4-quadrant (PCS DER {der_nazwa}: {powod})."
            )
        if mode.requires_grid_forming and spec.pcs_grid_forming is not True:
            powod = (
                "nie obsługuje"
                if spec.pcs_grid_forming is False
                else "karta przekształtnika nie podaje trybu sterowania — zdolności "
                "nie da się potwierdzić"
            )
            issues.append(
                f"Tryb '{mode.label_pl}' wymaga PCS grid-forming (PCS DER {der_nazwa}: {powod})."
            )
        selected_modes.append(mode.to_dict())

    # LISTY TRYBOW WYMAGANYCH PRZEZ NC RfG NIE MA (karta K-Q, 2026-08-14).
    # Do tej karty dowod dokladal tu niezgodnosc „brakuje wymaganego trybu dla
    # modulu NC RfG X" na podstawie katalogowego pola `required_for_nc_rfg_modules`.
    # Rozporzadzenie 2016/631 sprawdzone na tekscie zrodlowym: nie nakazuje
    # modulom wytworczym swiadczenia FCR-N / FCR-D / aFRR / mFRR — to produkty
    # rynku bilansujacego, a nie warunek przylaczenia. Dowod oglaszal wiec
    # niezgodnosc z norma, ktorej nie ma; pole i selektor usuniete u zrodla.
    # Dowod sprawdza teraz WYLACZNIE to, co da sie sprawdzic: czy przeksztaltnik
    # ma zdolnosci, ktorych wymaga sama definicja wybranej uslugi. Dlatego
    # specyfikacja nie niesie juz typu modulu NC RfG (karta PROOFPACK-KONTRAKT):
    # dana, ktorej dowod nie sprawdza, nie trafia do jego szczegolow.

    pass_status = len(issues) == 0
    summary = (
        f"OK: DER {der_nazwa} ma {len(selected_modes)} trybów zgodnych ze zdolnościami PCS."
        if pass_status
        else f"BLOKER: DER {der_nazwa} — {len(issues)} problemów z trybami BESS."
    )

    return Audit2ProofResult(
        proof_id=_identyfikator_dowodu(proof_type, spec),
        proof_type=proof_type,
        pass_status=pass_status,
        summary_pl=summary,
        details={
            "der_id": spec.der_id,
            "pcs_four_quadrant": spec.pcs_four_quadrant,
            "pcs_grid_forming": spec.pcs_grid_forming,
            "zdolnosc_4q_pl": _opis_zdolnosci(spec.pcs_four_quadrant),
            "zdolnosc_gfm_pl": _opis_zdolnosci(spec.pcs_grid_forming),
            "selected_modes": selected_modes,
            "unknown_mode_refs": unknown_mode_refs,
            "issues": issues,
        },
        formulas_latex=[
            r"$$\text{Mode}_{\text{compatible}} \iff (\text{4Q required} \implies \text{PCS}_{\text{4Q}}) "
            r"\land (\text{GFM required} \implies \text{PCS}_{\text{GFM}})$$",
        ],
        generated_at=generated_at_iso,
    )


# =============================================================================
# 2. Tap Changer Plan proof (eng.13)
# =============================================================================


def generate_tap_changer_plan_proof(
    spec: SpecDowoduPlanuZaczepow,
    *,
    generated_at_iso: str = CHWILA_GENERACJI_DOMYSLNA,
) -> Audit2ProofResult:
    """
    Dowod planu przelaczania zaczepow.

    Naprawa eng.13:
      - Sprawdza ze tap-changer pasuje do klasy transformatora (klasa z napiec modelu,
        `klasa_transformatora_przelacznika`).
      - Sprawdza ze regulacja automatyczna (AVR) jest dostepna, gdy model jej wymaga.

    ``transformer_nazwa`` — nazwa transformatora z modelu do tekstow dowodu;
    ``transformer_id`` zostaje wylacznie w ``details`` (karta #144).
    """
    proof_type = "AUDIT2_TAP_CHANGER_PLAN"
    transformer_nazwa = spec.transformer_nazwa
    tc = get_tap_changer(spec.tap_changer_ref)
    issues: list[str] = []

    if tc is None:
        issues.append(
            f"Przełącznika zaczepów wskazanego dla transformatora {transformer_nazwa} "
            "nie ma w katalogu przełączników."
        )
    else:
        if spec.transformer_type not in tc.applicable_to:
            przeznaczenie = ", ".join(
                ETYKIETY_KLAS_TRANSFORMATORA.get(klasa, klasa) for klasa in tc.applicable_to
            )
            issues.append(
                f"Tap-changer '{tc.label_pl}' nie jest przeznaczony dla transformatora "
                f"{transformer_nazwa} klasy "
                f"{ETYKIETY_KLAS_TRANSFORMATORA[spec.transformer_type]} "
                f"(przeznaczenie: {przeznaczenie})."
            )
        if spec.requires_avr and not tc.supports_avr:
            issues.append(
                f"Wymagany AVR (Automatic Voltage Regulation), tap-changer '{tc.label_pl}' "
                "nie obsługuje (typ DETC off-load)."
            )

    pass_status = len(issues) == 0
    summary = (
        f"OK: Tap-changer dla transformatora {transformer_nazwa} jest zgodny z wymaganiami."
        if pass_status
        else f"BLOKER: {len(issues)} problemów z planem zaczepów dla {transformer_nazwa}."
    )

    return Audit2ProofResult(
        proof_id=_identyfikator_dowodu(proof_type, spec),
        proof_type=proof_type,
        pass_status=pass_status,
        summary_pl=summary,
        details={
            "transformer_id": spec.transformer_id,
            "transformer_type": spec.transformer_type,
            "klasa_transformatora_pl": ETYKIETY_KLAS_TRANSFORMATORA[spec.transformer_type],
            "tap_changer_ref": spec.tap_changer_ref,
            "tap_changer": tc.to_dict() if tc else None,
            "requires_avr": spec.requires_avr,
            "issues": issues,
        },
        formulas_latex=[
            r"$$\Delta U_{\text{regulation}} = \pm \text{step}\% \times N_{\text{taps}}$$",
            r"$$U_{\text{output}} = U_{\text{nominal}} \cdot (1 + \frac{n - n_{\text{neutral}}}{N_{\text{taps}}} \cdot \text{range}\%)$$",
        ],
        generated_at=generated_at_iso,
    )


# =============================================================================
# 3. Hosting Capacity Export proof (eng.15)
# =============================================================================


def generate_hosting_capacity_export_proof(
    spec: SpecDowoduEksportuStacji,
    *,
    generated_at_iso: str = CHWILA_GENERACJI_DOMYSLNA,
) -> Audit2ProofResult:
    """Dowod bilansu eksportu vs importu (NC RfG Art. 17)."""
    proof_type = "AUDIT2_HOSTING_CAPACITY_EXPORT"
    result = validate_hosting_capacity_export(
        station_id=spec.station_id, p_export_kw=spec.p_export_kw, p_import_kw=spec.p_import_kw
    )
    pass_status = result["status"] in ("no_export", "normal_export")
    return Audit2ProofResult(
        proof_id=_identyfikator_dowodu(proof_type, spec),
        proof_type=proof_type,
        pass_status=pass_status,
        summary_pl=result["message_pl"],
        details=result,
        formulas_latex=[
            r"$$P_{\text{net export}} = \sum P_{\text{DER}} - \sum P_{\text{load}}$$",
            r"$$\text{ratio} = \frac{P_{\text{export}}}{P_{\text{import}}}$$",
        ],
        generated_at=generated_at_iso,
    )


# =============================================================================
# 4. Device Withstand proof (eng.18)
# =============================================================================


def generate_device_withstand_proof(
    spec: SpecDowoduWytrzymalosciAparatu,
    *,
    generated_at_iso: str = CHWILA_GENERACJI_DOMYSLNA,
) -> Audit2ProofResult:
    """Dowod wytrzymalosci aparatury I_dyn / I_th (IEC 60909) w polu `bay_designation`."""
    proof_type = "AUDIT2_DEVICE_WITHSTAND"
    result = validate_device_withstand(
        device_id=spec.device_id,
        i_peak_calculated_ka=spec.i_peak_calculated_ka,
        i_thermal_calculated_ka=spec.i_thermal_calculated_ka,
        t_clearing_s=spec.t_clearing_s,
    )
    return Audit2ProofResult(
        proof_id=_identyfikator_dowodu(proof_type, spec),
        proof_type=proof_type,
        pass_status=bool(result["ok"]),
        summary_pl=f"Pole {spec.bay_designation}: {result['message_pl']}",
        details={"bay_designation": spec.bay_designation, "device_id": spec.device_id, **result},
        formulas_latex=[
            r"$$I_{\text{dyn}} \geq \kappa \sqrt{2} \cdot I_k''$$",
            r"$$I_{\text{th eff}}(t) = I_{\text{th rated}} \cdot \sqrt{\frac{t_{\text{rated}}}{t_{\text{clearing}}}}$$",
            r"$$I_{\text{th eff}}(t) \geq I_k''$$",
        ],
        generated_at=generated_at_iso,
    )


# =============================================================================
# 5. VT Grounding Validation proof (eng.20)
# =============================================================================


def generate_vt_grounding_validation_proof(
    spec: SpecDowoduUziemieniaPrzekladnika,
    *,
    generated_at_iso: str = CHWILA_GENERACJI_DOMYSLNA,
) -> Audit2ProofResult:
    """Dowod zgodnosci VT U_th z typem uziemienia neutralnego (IEC 61869-3).

    `vt_voltage_factor is None` znaczy „nie da sie ustalic" i daje dowod NIEZALICZONY
    z nazwanym powodem. Wczesniej wolajacy podstawial w tym miejscu 1,9 jako wartosc
    domyslna (V12K-258): typ spoza katalogu dostawal wspolczynnik z powietrza, a pakiet
    dowodowy oglaszal na tej podstawie zgodnosc. Typ uziemienia spoza slownika nie
    dociera tu wcale — odrzuca go kontrakt specyfikacji (`TypPunktuNeutralnego`).
    """
    proof_type = "AUDIT2_VT_GROUNDING_VALIDATION"
    bay_designation = spec.bay_designation
    vt_voltage_factor = spec.vt_voltage_factor
    grounding_type = spec.grounding_type
    proof_id = _identyfikator_dowodu(proof_type, spec)
    if vt_voltage_factor is None:
        return Audit2ProofResult(
            proof_id=proof_id,
            proof_type=proof_type,
            pass_status=False,
            summary_pl=(
                f"Pole {bay_designation}: współczynnik napięciowy przekładnika jest nieznany "
                "(typ spoza katalogu albo karta bez tej danej) — zgodności ze sposobem "
                "uziemienia nie da się wykazać."
            ),
            details={
                "bay_designation": bay_designation,
                "vt_voltage_factor": None,
                "grounding_type": grounding_type,
                "ok": False,
                "message_pl": "brak współczynnika napięciowego",
            },
            formulas_latex=[],
            generated_at=generated_at_iso,
        )
    ok, message = is_vt_voltage_factor_valid_for_grounding(vt_voltage_factor, grounding_type)
    return Audit2ProofResult(
        proof_id=proof_id,
        proof_type=proof_type,
        pass_status=ok,
        summary_pl=f"Pole {bay_designation}: "
        + (
            message
            or f"OK: VT U_th={vt_voltage_factor} pasuje do sieci o punkcie neutralnym "
            f"{ETYKIETA_PL_PUNKTU_NEUTRALNEGO[grounding_type]}."
        ),
        details={
            "bay_designation": bay_designation,
            "vt_voltage_factor": vt_voltage_factor,
            "grounding_type": grounding_type,
            "ok": ok,
            "message_pl": message,
        },
        formulas_latex=[
            r"$$U_{\text{th VT}} \geq U_{\text{required}}(\text{grounding})$$",
            r"$$U_{\text{required}} = \begin{cases} 1.9 & \text{izolowana / kompensowana / "
            r"przez rezystor (faza--ziemia)} \\ 1.5 & \text{bezpo\'srednio uziemiona "
            r"(faza--ziemia, 30 s)} \\ 1.2 & \text{uzwojenie mi\k{e}dzyfazowe (ci\k{a}g\l{}e)} "
            r"\end{cases}$$",
        ],
        generated_at=generated_at_iso,
    )


# =============================================================================
# Aggregator: kompletny zestaw dowodow audytu 2 dla stacji
# =============================================================================


@dataclass(frozen=True)
class BrakDanychDowodu:
    """Rodzaj dowodu (albo jego pozycja), ktorego nie da sie wygenerowac, z przyczyna.

    Brak danych NIE jest zgodnoscia: pozycja nie wchodzi do dowodow, ale pakiet mowi
    wprost, czego w nim nie ma i dlaczego (karta PROOFPACK-KONTRAKT).
    """

    proof_type: RodzajDowoduAudytu2
    przyczyna_pl: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "proof_type": self.proof_type,
            "rodzaj_pl": ETYKIETY_RODZAJOW_DOWODU[self.proof_type],
            "przyczyna_pl": self.przyczyna_pl,
        }


@dataclass(frozen=True)
class StationAudit2ProofPack:
    """Pakiet dowodowy audytu 2 dla stacji."""

    station_id: str
    station_nazwa: str
    proofs: list[Audit2ProofResult] = field(default_factory=list)
    braki_danych: list[BrakDanychDowodu] = field(default_factory=list)
    generated_at_iso: str = CHWILA_GENERACJI_DOMYSLNA

    @property
    def all_pass(self) -> bool:
        return all(p.pass_status for p in self.proofs)

    @property
    def fail_count(self) -> int:
        return sum(1 for p in self.proofs if not p.pass_status)

    def to_dict(self) -> dict[str, Any]:
        return {
            "station_id": self.station_id,
            "station_nazwa": self.station_nazwa,
            "all_pass": self.all_pass,
            "fail_count": self.fail_count,
            "proof_count": len(self.proofs),
            "proofs": [p.to_dict() for p in self.proofs],
            "braki_danych": [b.to_dict() for b in self.braki_danych],
            "generated_at": self.generated_at_iso,
        }


def generate_station_audit2_proof_pack(
    *,
    station_id: str,
    station_nazwa: str,
    proofs: list[Audit2ProofResult],
    braki_danych: list[BrakDanychDowodu] | None = None,
    generated_at_iso: str = CHWILA_GENERACJI_DOMYSLNA,
) -> StationAudit2ProofPack:
    """Skomponowane dowody dla stacji (deterministyczne, posortowane po proof_type)."""
    sorted_proofs = sorted(proofs, key=lambda p: (p.proof_type, str(p.proof_id)))
    sorted_braki = sorted(braki_danych or [], key=lambda b: (b.proof_type, b.przyczyna_pl))
    return StationAudit2ProofPack(
        station_id=station_id,
        station_nazwa=station_nazwa,
        proofs=sorted_proofs,
        braki_danych=sorted_braki,
        generated_at_iso=generated_at_iso,
    )
