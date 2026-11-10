"""Formalna gotowość do testu NC RfG — Procedura PTPiREE 3.0 §5.1/§5.2.

Odrębny od solvera / Werdyktu walidator procedury logistyczno-dowodowej,
nie wyników merytorycznych. Rygor 14 dni i ≤1 s dotyczy C/D wg §5.2.
Pozytywna kwalifikacja terminów NIE oznacza, że test zrealizowano zgodnie
z normą lub OSD go zaakceptował. W przypadku C/D użyć rzeczywistych
identyfikatorów programu, korespondencji i protokołów.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, StrictBool, model_validator

from enm.deklaracje_modulu import DataUmowy
from enm.wydarzenia_regulacyjne import WydarzeniaRegulacyjne
from .regulatory_effectivity import wybierz_procedure

PTP_URL = "https://ptpiree.pl/wp-content/uploads/2025/12/Procedura-testowania_wer_3.0.pdf"
Typ = Literal["A", "B", "C", "D"]


class PrzygotowanieBadania(BaseModel):
    """Źródłowo udokumentowane zdarzenia badania, bez samej fizyki wyniku."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    typ_mwe: Typ
    wydarzenia_regulacyjne: WydarzeniaRegulacyjne | None = None
    planned_date: DataUmowy | None = None
    detailed_program_agreed_at: DataUmowy | None = None
    notification_sent_at: DataUmowy | None = None
    operator_date_agreed: StrictBool | None = None
    operator_witness_required: StrictBool | None = None
    operator_witness_possible: StrictBool | None = None
    operator_dispatch_approval: StrictBool | None = None
    test_executed_at: DataUmowy | None = None
    measurements_interval_s: FiniteFloat | None = Field(default=None, gt=0, strict=True)
    actual_net_p_measured: StrictBool | None = None
    actual_gross_p_measured: StrictBool | None = None
    automatic_control_active: StrictBool | None = None
    pmax_pmin_confirmed: StrictBool | None = None
    test_protocol_sha256: str | None = Field(default=None, pattern=r"^[a-fA-F0-9]{64}$")
    test_report_sha256: str | None = Field(default=None, pattern=r"^[a-fA-F0-9]{64}$")
    evidence_source: str | None = Field(default=None, min_length=1)

    @model_validator(mode="after")
    def _source_required(self) -> Self:
        events = [
            self.planned_date, self.detailed_program_agreed_at,
            self.notification_sent_at, self.operator_date_agreed,
            self.operator_witness_required, self.operator_witness_possible,
            self.operator_dispatch_approval, self.test_executed_at,
            self.measurements_interval_s, self.actual_net_p_measured,
            self.actual_gross_p_measured, self.automatic_control_active,
            self.pmax_pmin_confirmed, self.test_protocol_sha256,
            self.test_report_sha256,
        ]
        if any(e is not None for e in events) and not (
            self.evidence_source and self.evidence_source.strip()
        ):
            raise ValueError("Zdarzenia/próby PGM wymagają pochodzenia dowodu.")
        return self


def audyt_przygotowania(przygotowanie: PrzygotowanieBadania) -> dict:
    """Wymogi proceduralne 3.0, źródłowy plan (bez uznawania dat z żądania za fakty)."""
    p = przygotowanie
    result = wybierz_procedure(p.typ_mwe, p.wydarzenia_regulacyjne)
    hard: list[dict[str, str]] = []
    risks: list[dict[str, str]] = []

    def blocking(code: str, description: str) -> None:
        hard.append({"kod": code, "opis_pl": description})

    def conditional(code: str, description: str) -> None:
        risks.append({"kod": code, "opis_pl": description})

    if result.status != "USTALONO" or result.wydanie != "3.0":
        blocking(
            "NIEPOTWIERDZONA_PROCEDURA_3_0",
            "Nie można użyć zasad PTPiREE 3.0, nie ustalono prawidłowej "
            "daty właściwego oświadczenia.",
        )
    if p.planned_date is None:
        blocking("BRAK_TERMINU_BADANIA", "Nie podano planowanego terminu próby.")
    if p.typ_mwe in ("C", "D"):
        if p.detailed_program_agreed_at is None:
            blocking("BRAK_UZGODNIENIA_PROGRAMU", "Brak zatwierdzonego programu szczegółowego.")
        if p.notification_sent_at is None:
            blocking("BRAK_ZGLOSZENIA_TESTU", "Nie przedstawiono potwierdzenia zawiadomienia OSD.")
        if p.planned_date and p.notification_sent_at:
            if p.notification_sent_at > p.planned_date - timedelta(days=14):
                blocking("MNIEJ_NIZ_14_DNI", "Zgłoszenie terminu C/D musi wyprzedzać próbę o co najmniej 14 dni.")
        if p.detailed_program_agreed_at and p.notification_sent_at:
            if p.detailed_program_agreed_at > p.notification_sent_at:
                blocking(
                    "PROGRAM_UZGODNIONY_PO_ZAWIADOMIENIU",
                    "Program szczegółowy trzeba uzgodnić przed zawiadomieniem o próbie.",
                )
        if p.operator_date_agreed is not True:
            blocking("OSD_NIE_UZGODNIL_TERMINU", "Brak dowodu uzgodnienia terminu z OSD.")
        if p.operator_dispatch_approval is not True:
            blocking("BRAK_ZGODY_SLUZB_RUCHOWYCH", "Brak zgody służb ruchowych na test.")
        if p.operator_witness_required is None:
            conditional("ROZSTRZYGNAC_UDZIAL_OSD", "Brak stanowiska OSD w sprawie uczestnictwa.")
        if p.operator_witness_required is True and p.operator_witness_possible is not True:
            blocking(
                "BRAK_UDZIALU_WYMAGANEGO_OSD",
                "Test wymaga zapewnienia możliwości udziału przedstawiciela OSD.",
            )
        if p.test_executed_at:
            if p.measurements_interval_s is None:
                blocking("BRAK_ROZDZIELCZOSCI_SYGNALOW", "Brak rozdzielczości zarejestrowanych sygnałów.")
            elif p.measurements_interval_s > 1:
                blocking(
                    "ROZDZIELCZOSC_PONAD_1_S",
                    "W §5.2 rozdzielczość sygnałów nie gorsza niż 1 s, "
                    "chyba że OSD określił inaczej w zaakceptowanym programie.",
                )
            if p.actual_net_p_measured is not True:
                blocking("BRAK_P_NETTO_PCC", "Brak potwierdzonego pomiaru P netto w PCC.")
            if p.actual_gross_p_measured is not True:
                blocking("BRAK_P_BRUTTO_GENERATOR", "Brak pomiaru P brutto na zaciskach generatora.")
    elif p.test_executed_at:
        # §5.1 A/B nie narzuca uniwersalnego minimum 14 dni.
        conditional(
            "KRYTERIA_A_B_Z_PROGRAMU_RAMOWEGO",
            "Dla A/B potrzebne właściwe warunki ramowe i ewentualna obecność OSD; "
            "nie przenosić automatycznie 14-dniowej zasady C/D.",
        )

    if p.test_executed_at and p.planned_date and p.test_executed_at != p.planned_date:
        blocking("BADANIE_POZA_TERMINEM", "Test wykonany poza zadeklarowanym, uzgodnionym terminem.")
    if p.test_executed_at and p.automatic_control_active is False:
        blocking(
            "REGULATORY_W_TRYBIE_RECZNYM",
            "Istotne układy automatycznej regulacji nie mogą zostać odstawione podczas próby.",
        )
    if p.test_executed_at and p.pmax_pmin_confirmed is False:
        blocking(
            "ZMIANA_PMAX_PMIN_POWTORZYC_TESTY",
            "Niepotwierdzone Pmax/Pmin oznacza konieczność powtórzenia wszystkich testów "
            "z aktualną deklaracją, zgodnie z §5 PTPiREE 3.0.",
        )
    if p.test_executed_at and p.test_protocol_sha256 is None:
        blocking("BRAK_PROTOKOLU", "Brak oryginalnego protokołu z testu z odciskiem.")
    if p.test_executed_at and p.test_report_sha256 is None:
        blocking("BRAK_SPRAWOZDANIA", "Brak sprawozdania szczegółowego i odcisku.")
    if p.test_executed_at is None:
        conditional("TEST_NIEWYKONANY", "Brak potwierdzonego wykonania testu.")
    return {
        "typ_mwe":p.typ_mwe,
        "procedura_wybrana":result.wydanie,
        "data_planowana":p.planned_date.isoformat() if p.planned_date else None,
        "udokumentowane_zrodlo":p.evidence_source,
        "podstawa":"PTPiREE Procedura 3.0 §5.1, §5.2, s. 7–12",
        "podstawa_url":PTP_URL,
        "blokery":hard,
        "do_rozstrzygniecia":risks,
        "klasyfikacja": (
            "WEWNETRZNA_LUB_NIEPOTWIERDZONA" if hard
            else "KRYTERIA_FORMALNE_DEKLAROWANE_WYMAGAJA_WERYFIKACJI_OSD"
        ),
        "formalny_wynik_testu":"NIE_OCENIONO",
        "decyzja_osd":"BRAK_POTWIERDZENIA",
        "uwaga": (
            "Zgoda operatora, obecność świadków i dokumenty to dane opisane przez "
            "użytkownika; poprawności podpisów i autentyczności nie potwierdzono. "
            "Uzyskanie wyniku pozytywnego wymaga wykonanych prób, pełnej analizy "
            "sygnałów i odbioru przez właściwego OSD."
        )
    }
