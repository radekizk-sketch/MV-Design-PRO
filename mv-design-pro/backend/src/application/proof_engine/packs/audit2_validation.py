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
- Kazdy dowod niesie rekord W werdyktu wyjasnialnego (`wymaganie`) z rekordami K kryteriow
  (`network_model/catalog/audit2_oceny.py`); `summary_pl` to zdanie tego rekordu, a status
  zyje wylacznie w rekordzie (karta WERDYKT-MIGRACJA-190 — dawne `pass_status` i
  podsumowania „OK: …" / „BLOKER: …" usuniete).
- Teksty dla czlowieka nazywaja elementy nazwa z modelu, nigdy identyfikatorem
  (identyfikatory zostaja w `details`).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Annotated, Any, Literal
from uuid import UUID, uuid5

from network_model.catalog.audit2_catalogs import (
    ETYKIETY_KLAS_TRANSFORMATORA,
    KlasaTransformatoraPrzelacznika,
    get_bess_operation_mode,
    get_tap_changer,
)
from network_model.catalog.audit2_oceny import (
    ocen_aparat_katalogu_wytrzymalosci,
    ocena_eksportu_stacji,
    ocena_trybu_spoza_katalogu,
    ocena_wspolczynnika_napieciowego_vt,
    ocena_zdolnosci_trybu_bess,
    oceny_przelacznika_zaczepow,
    wymaganie_eksportu_stacji,
    wymaganie_planu_zaczepow,
    wymaganie_trybow_bess,
    wymaganie_wspolczynnika_vt,
)
from network_model.core.uziemienie import ETYKIETA_PL_PUNKTU_NEUTRALNEGO, TypPunktuNeutralnego
from network_model.nazwy import nazwa_nadana
from network_model.odmowa_danych import OdmowaDanychError
from pydantic import AfterValidator, BaseModel, ConfigDict, Field
from werdykt import OcenaKryterium, Przedmiot, StatusWerdyktu, WynikWymagania

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
    station_nazwa: NazwaElementu
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
    bez tej danej) i daje rekord ``NIE_OCENIONO`` z nazwanym brakiem.
    """

    bay_designation: NazwaElementu
    vt_voltage_factor: Annotated[float, Field(gt=0)] | None
    grounding_type: TypPunktuNeutralnego


def _identyfikator_dowodu(proof_type: str, spec: _SpecyfikacjaDowodu) -> UUID:
    """Identyfikator dowodu wyprowadzony z rodzaju i specyfikacji — te same dane, ten sam id."""
    return uuid5(_PRZESTRZEN_DOWODOW, f"{proof_type}|{spec.model_dump_json()}")


@dataclass(frozen=True)
class Audit2ProofResult:
    """Wynik dowodu audytu 2 (jednorodny format dla wszystkich 5 typow).

    ``wymaganie`` — rekord W werdyktu wyjasnialnego z rekordami K kryteriow; jedyny nosnik
    statusu dowodu. ``summary_pl`` — zdanie rekordu (z oznaczeniem pola, gdy dowod dotyczy
    pola stacji).
    """

    proof_id: UUID
    proof_type: str
    wymaganie: WynikWymagania
    summary_pl: str
    details: dict[str, Any]
    formulas_latex: list[str]
    generated_at: str  # ISO 8601 deterministyczne — caller dostarcza.

    def to_dict(self) -> dict[str, Any]:
        return {
            "proof_id": str(self.proof_id),
            "proof_type": self.proof_type,
            "rodzaj_pl": ETYKIETY_RODZAJOW_DOWODU[self.proof_type],
            "wymaganie": self.wymaganie.model_dump(mode="json"),
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
    przedmiot = Przedmiot(
        element_ref=spec.der_id,
        nazwa_pl=der_nazwa,
        opis_pl="magazyn energii — wybrane tryby pracy wobec zdolności przekształtnika",
    )
    oceny: list[OcenaKryterium] = []
    selected_modes: list[dict[str, Any]] = []
    unknown_mode_refs: list[str] = []

    for ref in sorted(set(spec.selected_mode_refs)):
        mode = get_bess_operation_mode(ref)
        if mode is None:
            unknown_mode_refs.append(ref)
            oceny.append(
                ocena_trybu_spoza_katalogu(tryb_ref=ref, der_nazwa=der_nazwa, przedmiot=przedmiot)
            )
            continue
        # Zdolnosc przeksztaltnika — potwierdzenie wymaga danej z karty przeksztaltnika
        # (`None` = karta jej nie podaje: rekord NIE_OCENIONO, nie zgodnosc).
        oceny.append(
            ocena_zdolnosci_trybu_bess(
                tryb_id=mode.id,
                tryb_pl=mode.label_pl,
                zdolnosc_id="praca_czterokwadrantowa",
                wymagana_zdolnosc_pl="praca w czterech ćwiartkach P–Q",
                wymagana=mode.requires_four_quadrant,
                zdolnosc_pcs=spec.pcs_four_quadrant,
                der_nazwa=der_nazwa,
                przedmiot=przedmiot,
            )
        )
        oceny.append(
            ocena_zdolnosci_trybu_bess(
                tryb_id=mode.id,
                tryb_pl=mode.label_pl,
                zdolnosc_id="tworzenie_napiecia",
                wymagana_zdolnosc_pl="tworzenie napięcia (grid-forming)",
                wymagana=mode.requires_grid_forming,
                zdolnosc_pcs=spec.pcs_grid_forming,
                der_nazwa=der_nazwa,
                przedmiot=przedmiot,
            )
        )
        selected_modes.append(mode.to_dict())

    # LISTY TRYBOW WYMAGANYCH PRZEZ NC RfG NIE MA (karta K-Q, 2026-08-14).
    # Do tej karty dowod dokladal tu niezgodnosc „brakuje wymaganego trybu dla
    # modulu NC RfG X" na podstawie katalogowego pola `required_for_nc_rfg_modules`.
    # Rozporzadzenie 2016/631 sprawdzone na tekscie zrodlowym: nie nakazuje
    # modulom wytworczym swiadczenia FCR-N / FCR-D / aFRR / mFRR — to produkty
    # rynku bilansujacego, a nie warunek przylaczenia. Dowod sprawdza WYLACZNIE to,
    # co da sie sprawdzic: czy przeksztaltnik ma zdolnosci, ktorych wymaga sama
    # definicja wybranej uslugi (karta PROOFPACK-KONTRAKT: specyfikacja nie niesie typu
    # modulu NC RfG, bo dana, ktorej dowod nie sprawdza, nie trafia do jego szczegolow).
    wymaganie = wymaganie_trybow_bess(der_nazwa=der_nazwa, przedmiot=przedmiot, oceny=oceny)
    return Audit2ProofResult(
        proof_id=_identyfikator_dowodu(proof_type, spec),
        proof_type=proof_type,
        wymaganie=wymaganie,
        summary_pl=wymaganie.wyjasnienie.zdanie_pl,
        details={
            "der_id": spec.der_id,
            "pcs_four_quadrant": spec.pcs_four_quadrant,
            "pcs_grid_forming": spec.pcs_grid_forming,
            "zdolnosc_4q_pl": _opis_zdolnosci(spec.pcs_four_quadrant),
            "zdolnosc_gfm_pl": _opis_zdolnosci(spec.pcs_grid_forming),
            "selected_modes": selected_modes,
            "unknown_mode_refs": unknown_mode_refs,
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
    przedmiot = Przedmiot(
        element_ref=spec.transformer_id,
        nazwa_pl=transformer_nazwa,
        opis_pl="transformator — przełącznik zaczepów przypisany w konfiguracji stacji",
    )
    klasa, avr = oceny_przelacznika_zaczepow(
        transformer_nazwa=transformer_nazwa,
        przedmiot=przedmiot,
        przelacznik_pl=None if tc is None else tc.label_pl,
        klasa_pl=ETYKIETY_KLAS_TRANSFORMATORA[spec.transformer_type],
        przeznaczenie_pl=(
            None
            if tc is None
            else ", ".join(ETYKIETY_KLAS_TRANSFORMATORA.get(k, k) for k in tc.applicable_to)
        ),
        pasuje_do_klasy=None if tc is None else spec.transformer_type in tc.applicable_to,
        wymaga_avr=spec.requires_avr,
        obsluguje_avr=None if tc is None else tc.supports_avr,
    )
    wymaganie = wymaganie_planu_zaczepow(
        transformer_nazwa=transformer_nazwa, przedmiot=przedmiot, oceny=(klasa, avr)
    )

    return Audit2ProofResult(
        proof_id=_identyfikator_dowodu(proof_type, spec),
        proof_type=proof_type,
        wymaganie=wymaganie,
        summary_pl=wymaganie.wyjasnienie.zdanie_pl,
        details={
            "transformer_id": spec.transformer_id,
            "transformer_type": spec.transformer_type,
            "klasa_transformatora_pl": ETYKIETY_KLAS_TRANSFORMATORA[spec.transformer_type],
            "tap_changer_ref": spec.tap_changer_ref,
            "tap_changer": tc.to_dict() if tc else None,
            "requires_avr": spec.requires_avr,
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
    """Dowod bilansu eksportu stacji wobec granicy zdolnosci przylaczeniowej.

    Granica eksportu wynika z warunkow przylaczenia OSD, ktorych model nie niesie: eksport
    netto daje rekord ``BRAK_PODSTAWY`` z wynikiem informacyjnym, brak eksportu —
    ``NIE_DOTYCZY``. Dawne progi stosunku eksportu do importu (0,8 / 1,5 / 3,0) i zalecenia
    „WYMAGANE: studium NC RfG…" nie mialy podstawy (ani normy, ani dokumentu OSD) — usuniete
    (karta WERDYKT-MIGRACJA-190).
    """
    proof_type = "AUDIT2_HOSTING_CAPACITY_EXPORT"
    ocena = ocena_eksportu_stacji(
        stacja_nazwa=spec.station_nazwa,
        przedmiot=Przedmiot(
            element_ref=spec.station_id,
            nazwa_pl=spec.station_nazwa,
            opis_pl="stacja — bilans mocy źródeł i odbiorów wobec sieci OSD",
        ),
        p_export_kw=spec.p_export_kw,
        p_import_kw=spec.p_import_kw,
    )
    wymaganie = wymaganie_eksportu_stacji(stacja_nazwa=spec.station_nazwa, ocena=ocena)
    return Audit2ProofResult(
        proof_id=_identyfikator_dowodu(proof_type, spec),
        proof_type=proof_type,
        wymaganie=wymaganie,
        summary_pl=wymaganie.wyjasnienie.zdanie_pl,
        details={
            "station_id": spec.station_id,
            "p_export_kw": spec.p_export_kw,
            "p_import_kw": spec.p_import_kw,
            "p_net_export_kw": spec.p_export_kw - spec.p_import_kw,
        },
        formulas_latex=[
            r"$$P_{exp} = \sum P_{DER} - \sum P_{odb} \le P_{przyl}$$",
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
    ocena = ocen_aparat_katalogu_wytrzymalosci(
        device_id=spec.device_id,
        i_peak_calculated_ka=spec.i_peak_calculated_ka,
        i_thermal_calculated_ka=spec.i_thermal_calculated_ka,
        t_clearing_s=spec.t_clearing_s,
        przedmiot_nazwa_pl=f"aparat pola {spec.bay_designation}",
    )
    if ocena is None:
        # Skladanie pakietu odsiewa pozycje spoza katalogu jako jawny brak danych — tu nie
        # trafiaja; wywolanie z taka pozycja to odmowa danych (422), nie ocena.
        raise OdmowaDanychError(
            "Dowód wytrzymałości wymaga pozycji katalogu wytrzymałości aparatury — "
            "wskazanej pozycji nie ma w katalogu."
        )
    return Audit2ProofResult(
        proof_id=_identyfikator_dowodu(proof_type, spec),
        proof_type=proof_type,
        wymaganie=ocena.wymaganie,
        summary_pl=ocena.wymaganie.wyjasnienie.zdanie_pl,
        details={
            "bay_designation": spec.bay_designation,
            "device_id": spec.device_id,
            "i_th_effective_ka": ocena.i_th_effective_ka,
            "utilization_dyn_percent": ocena.utilization_dyn_percent,
            "utilization_th_percent": ocena.utilization_th_percent,
        },
        formulas_latex=[
            r"$$I_{\text{dyn}} \geq \kappa \sqrt{2} \cdot I_k''$$",
            # IEC 60865-1: przeliczenie prądu krótkotrwałego na czas wyłączenia tylko w dół;
            # porównanie z prądem cieplnym zastępczym I_th biegu (nie z I_k″) — dokładnie
            # to, co porównuje rekord cieplny (`audit2_oceny.limit_cieplny_aparatu_ka`).
            r"$$I_{\text{th eff}}(t) = I_{\text{th rated}} \cdot \sqrt{\min\left(1,\ "
            r"\frac{t_{\text{rated}}}{t_{\text{clearing}}}\right)}$$",
            r"$$I_{\text{th eff}}(t) \geq I_{\text{th}}$$",
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
    ocena = ocena_wspolczynnika_napieciowego_vt(
        voltage_factor=spec.vt_voltage_factor,
        grounding_type=spec.grounding_type,
        przedmiot=Przedmiot(
            element_ref=None,
            nazwa_pl=f"przekładnik napięciowy pola {bay_designation}",
            opis_pl=(
                "przekładnik napięciowy pola wobec sieci o punkcie neutralnym "
                f"{ETYKIETA_PL_PUNKTU_NEUTRALNEGO[spec.grounding_type]}"
            ),
        ),
    )
    wymaganie = wymaganie_wspolczynnika_vt(pole_pl=bay_designation, ocena=ocena)
    return Audit2ProofResult(
        proof_id=_identyfikator_dowodu(proof_type, spec),
        proof_type=proof_type,
        wymaganie=wymaganie,
        summary_pl=wymaganie.wyjasnienie.zdanie_pl,
        details={
            "bay_designation": bay_designation,
            "vt_voltage_factor": spec.vt_voltage_factor,
            "grounding_type": spec.grounding_type,
        },
        # Wzór bez danej nie jest dowodem — przy nieznanym współczynniku nie udajemy rachunku.
        formulas_latex=(
            []
            if spec.vt_voltage_factor is None
            else [
                r"$$U_{\text{th VT}} \geq U_{\text{required}}(\text{grounding})$$",
                r"$$U_{\text{required}} = \begin{cases} 1{,}9 & \text{izolowana / kompensowana / "
                r"przez rezystor (faza--ziemia)} \\ 1{,}5 & \text{bezpo\'srednio uziemiona "
                r"(faza--ziemia, 30 s)} \\ 1{,}2 & \text{uzwojenie mi\k{e}dzyfazowe (ci\k{a}g\l{}e)} "
                r"\end{cases}$$",
            ]
        ),
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
    def liczby_statusow(self) -> dict[StatusWerdyktu, int]:
        """Liczba dowodow wedlug statusu ich rekordu W (klucze posortowane) — zestawienie,
        nie werdykt pakietu: agregat nie zastepuje rekordow skladowych."""
        liczby: dict[StatusWerdyktu, int] = {}
        for dowod in self.proofs:
            status = dowod.wymaganie.status_maszynowy
            liczby[status] = liczby.get(status, 0) + 1
        return dict(sorted(liczby.items()))

    def to_dict(self) -> dict[str, Any]:
        return {
            "station_id": self.station_id,
            "station_nazwa": self.station_nazwa,
            "liczby_statusow": self.liczby_statusow,
            "proof_count": len(self.proofs),
            "proofs": [p.to_dict() for p in self.proofs],
            "braki_danych": [b.to_dict() for b in self.braki_danych],
            "generated_at": self.generated_at_iso,
        }


def liczby_statusow_projektu(
    pakiety: Sequence[StationAudit2ProofPack],
) -> dict[StatusWerdyktu, int]:
    """Suma zestawień statusów pakietów stacji (klucze posortowane) — zestawienie projektu,
    nie werdykt: dawne `all_pass` uznawało projekt bez dowodów za zgodny (karta
    WERDYKT-MIGRACJA-190). Jedno źródło dla końcówki `_validate-all` i fixtur frontu."""
    liczby: dict[StatusWerdyktu, int] = {}
    for pakiet in pakiety:
        for status, liczba in pakiet.liczby_statusow.items():
            liczby[status] = liczby.get(status, 0) + liczba
    return dict(sorted(liczby.items()))


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
