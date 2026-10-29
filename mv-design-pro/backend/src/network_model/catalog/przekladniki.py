"""Rdzenie przekładnika prądowego i uzwojenia przekładnika napięciowego — JEDNO źródło kontraktu.

PO CO. Pole liniowe GPZ wg ENEA Operator „Stacje elektroenergetyczne 110 kV", Zeszyt 1 opisuje
przekładniki listą rdzeni/uzwojeń, a nie liczbą: Z.10 (s.89) — przekładnik prądowy 200-400/5 A
z jednym rdzeniem 15 VA 5P20; Z.11 (s.90) — przekładnik 200-400/5/5/5 A z trzema rdzeniami
(10 VA 0,2S FS5 rozliczeniowy i do analizatora jakości energii; 10 VA 0,2 FS5; 15 VA 5P20);
Z.11.1 (s.91) — przekładnik napięciowy po stronie linii SN/√3 / 0,1/√3 / 0,1/√3 / 0,1/3
z trzema uzwojeniami (0–10 VA kl. 0,2; 7,5 VA kl. 0,2; 7,5 VA kl. 0,5/3P w otwartym trójkącie).
Dawna liczba `Measurement.ct_cores` nie mówiła, do czego służy rdzeń ani jaką ma klasę — liczbę
rdzeni wyprowadza się teraz z listy (`len(rdzenie)`), nie przechowuje osobno.

Te same modele niesie szablon pola (`bay_templates.BayDeviceTemplate`), aparat pola modelu
(`enm.models.BayPrimaryDevice`), przekładnik modelu (`enm.models.Measurement`) i typ katalogowy
(`types.CTType` / `types.VTType`).

Klasa dokładności jest jedynym źródłem rodzaju rdzenia/uzwojenia (IEC 61869-2 / IEC 61869-3):
klasy z literą ``P`` — zabezpieczeniowe, klasy liczbowe (z dopiskiem ``S`` dla klas rozszerzonego
zakresu 0,2S / 0,5S, IEC 61869-2 § 5.6.201.4) — pomiarowe. Liczba po ``P`` JEST znamionową
graniczną liczbą dokładności (ALF), więc ALF wyprowadza się z klasy; współczynnik bezpieczeństwa
przyrządowego FS jest daną znamionową rdzenia pomiarowego i jest przechowywany.

Moduł jest LIŚCIEM (stdlib + pydantic): czytają go katalog, model sieci i szablony pól.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

__all__ = [
    "NAZWY_PRZEZNACZENIA_PL",
    "PRZEZNACZENIA_POMIAROWE",
    "PRZEZNACZENIA_ZABEZPIECZENIOWE",
    "PrzeznaczenieRdzenia",
    "RdzenPrzekladnikaPradowego",
    "UzwojeniePrzekladnikaNapieciowego",
    "alf_ct_z_klasy",
    "rdzen_ct_z_klasy",
    "rodzaj_vt_z_klasy",
]


def _klasa_pomiarowa(znormalizowana: str) -> bool:
    """Klasa pomiarowa = liczba (0,1 / 0,2 / 0,5 / 1 / 3 / 5), dla CT także z dopiskiem ``S``
    (klasy rozszerzonego zakresu 0,2S / 0,5S, IEC 61869-2 § 5.6.201.4)."""
    liczba = znormalizowana[:-1] if znormalizowana.endswith("S") else znormalizowana
    try:
        float(liczba.replace(",", "."))
    except ValueError:
        return False
    return True


def rdzen_ct_z_klasy(accuracy_class: str | None) -> str | None:
    """Rodzaj rdzenia przekładnika WYPROWADZONY z klasy dokładności (IEC 61869-2).

    Podział jest DEFINICYJNY, nie umowny: klasy z literą ``P`` opisują rdzenie
    ZABEZPIECZENIOWE — błąd zdefiniowany przy wielokrotności prądu znamionowego
    (IEC 61869-2 § 5.6.2) — a klasy liczbowe (0,1 / 0,2 / 0,5 / 1 / 3 / 5, także 0,2S / 0,5S)
    rdzenie POMIAROWE, gdzie błąd definiuje się przy prądzie znamionowym. Dlatego z klasy wolno
    wyprowadzić tę wartość: jest własnością NAZWANEJ rzeczy, nie założeniem o rzeczy.

    ``dual`` NIE JEST tu nigdy zwracane: zapis złożony (np. „5P10/0,5") opisuje DWA rdzenie
    — konstrukcja przekładnika opisana listą rdzeni (`RdzenPrzekladnikaPradowego`), nie jedną
    klasą. Brak klasy albo klasa nierozpoznana daje ``None`` — „nie da się ustalić".
    """
    if not accuracy_class:
        return None
    znormalizowana = accuracy_class.strip().upper()
    if not znormalizowana or "/" in znormalizowana:
        return None
    if "P" in znormalizowana:
        return "protection"
    return "metering" if _klasa_pomiarowa(znormalizowana) else None


def alf_ct_z_klasy(accuracy_class: str | None) -> float | None:
    """Znamionowa graniczna liczba dokładności (ALF) rdzenia ZABEZPIECZENIOWEGO.

    Dla klas ``⟨błąd⟩P⟨ALF⟩`` liczba po literze ``P`` JEST znamionową graniczną liczbą
    dokładności (IEC 61869-2 § 3.4.201): 5P10 ⇒ ALF 10, 10P20 ⇒ ALF 20. Rdzeń pomiarowy ALF
    nie ma (ma współczynnik bezpieczeństwa przyrządowego FS) — dla klas liczbowych ``None``.
    """
    if rdzen_ct_z_klasy(accuracy_class) != "protection":
        return None
    assert accuracy_class is not None  # gwarantowane przez `rdzen_ct_z_klasy`
    _, _, po_p = accuracy_class.strip().upper().partition("P")
    try:
        return float(po_p.replace(",", "."))
    except ValueError:
        return None


def rodzaj_vt_z_klasy(accuracy_class: str | None) -> str | None:
    """Rodzaj uzwojenia VT WYPROWADZONY z klasy dokładności (IEC 61869-3).

    Klasy z literą ``P`` (3P, 6P) — uzwojenia ZABEZPIECZENIOWE (błąd zdefiniowany od 5 % U_n do
    F_v·U_n, IEC 61869-3 § 5.6.202); klasy liczbowe (0,1 / 0,2 / 0,5 / 1,0 / 3,0) — POMIAROWE.
    Zapis złożony (np. „0,5/3P") opisuje uzwojenie o DWÓCH klasach (pomiarowej i
    zabezpieczeniowej) — nie da się go sprowadzić do jednego rodzaju, więc ``None``; uzwojenie
    z taką klasą opisuje `UzwojeniePrzekladnikaNapieciowego` (obie części klasy sprawdzone).
    """
    if not accuracy_class:
        return None
    znormalizowana = accuracy_class.strip().upper()
    if not znormalizowana or "/" in znormalizowana:
        return None
    if "P" in znormalizowana:
        return "protection"
    try:
        float(znormalizowana.replace(",", "."))
    except ValueError:
        return None
    return "metering"


#: Przeznaczenie rdzenia CT / uzwojenia VT (Z.10, Z.11, Z.11.1 — opisy obwodów wtórnych).
PrzeznaczenieRdzenia = Literal[
    "ROZLICZENIE",
    "POMIAR",
    "JAKOSC_ENERGII",
    "REGULACJA",
    "ZABEZPIECZENIA",
    "ROZNICOWE",
]

NAZWY_PRZEZNACZENIA_PL: dict[str, str] = {
    "ROZLICZENIE": "pomiar rozliczeniowy energii",
    "POMIAR": "pomiar techniczny i telemechanika",
    "JAKOSC_ENERGII": "analizator jakości energii elektrycznej",
    "REGULACJA": "regulacja napięcia",
    "ZABEZPIECZENIA": "zabezpieczenia",
    "ROZNICOWE": "zabezpieczenie różnicowe",
}

#: Przeznaczenia wymagające klasy pomiarowej / zabezpieczeniowej (definicja klasy, IEC 61869).
PRZEZNACZENIA_POMIAROWE: frozenset[str] = frozenset({"ROZLICZENIE", "POMIAR", "JAKOSC_ENERGII"})
PRZEZNACZENIA_ZABEZPIECZENIOWE: frozenset[str] = frozenset({"ZABEZPIECZENIA", "ROZNICOWE"})


class RdzenPrzekladnikaPradowego(BaseModel):
    """Rdzeń (uzwojenie wtórne) przekładnika prądowego — tabliczka IEC 61869-2.

    ``przekladnia`` — zapis tabliczki rdzenia (np. „200-400/5"); ``moc_va`` — moc znamionowa;
    ``klasa`` — klasa dokładności (0,2S / 0,2 / 0,5 / 5P20 / 10P10…); ``fs`` — współczynnik
    bezpieczeństwa przyrządowego (WYŁĄCZNIE rdzeń pomiarowy); ALF wyprowadzony z klasy
    (`alf`). Przeznaczenie zgodne z rodzajem klasy: rozliczenie / pomiar / analizator jakości
    energii wymagają klasy pomiarowej, zabezpieczenia i różnicowe — zabezpieczeniowej.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    przekladnia: str = Field(min_length=1)
    moc_va: float = Field(gt=0)
    klasa: str = Field(min_length=1)
    fs: float | None = Field(default=None, gt=0)
    przeznaczenie: tuple[PrzeznaczenieRdzenia, ...] = Field(min_length=1)

    @property
    def rodzaj(self) -> str:
        rodzaj = rdzen_ct_z_klasy(self.klasa)
        assert rodzaj is not None  # gwarantowane walidatorem
        return rodzaj

    @property
    def alf(self) -> float | None:
        return alf_ct_z_klasy(self.klasa)

    @model_validator(mode="after")
    def _spojnosc_klasy(self) -> RdzenPrzekladnikaPradowego:
        rodzaj = rdzen_ct_z_klasy(self.klasa)
        if rodzaj is None:
            raise ValueError(
                f"Klasa dokładności rdzenia „{self.klasa}” nierozpoznana (IEC 61869-2: klasa "
                "pomiarowa 0,1–5 albo 0,2S/0,5S, zabezpieczeniowa ⟨błąd⟩P⟨ALF⟩)."
            )
        if rodzaj == "protection" and self.fs is not None:
            raise ValueError(
                f"Rdzeń zabezpieczeniowy {self.klasa} nie ma współczynnika FS — dokładność "
                "zachowuje do ALF (IEC 61869-2 § 3.4.201)."
            )
        sprzeczne = (
            PRZEZNACZENIA_ZABEZPIECZENIOWE if rodzaj == "metering" else PRZEZNACZENIA_POMIAROWE
        ) & set(self.przeznaczenie)
        if sprzeczne:
            nazwy = ", ".join(NAZWY_PRZEZNACZENIA_PL[p] for p in sorted(sprzeczne))
            raise ValueError(
                f"Rdzeń klasy {self.klasa} nie służy do: {nazwy} — przeznaczenie wymaga klasy "
                f"{'zabezpieczeniowej' if rodzaj == 'metering' else 'pomiarowej'}."
            )
        return self


class UzwojeniePrzekladnikaNapieciowego(BaseModel):
    """Uzwojenie wtórne przekładnika napięciowego — tabliczka IEC 61869-3.

    ``przekladnia`` — zapis tabliczki uzwojenia (np. „15/√3 / 0,1/√3"); ``klasa`` — klasa
    dokładności (0,2 / 0,5 / 3P albo zapis podwójny 0,5/3P); ``otwarty_trojkat`` — uzwojenie
    resztkowe łączone w otwarty trójkąt do pomiaru napięcia zerowego 3U0 (warunek dla
    zabezpieczeń kierunkowych ziemnozwarciowych i U0>).
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    przekladnia: str = Field(min_length=1)
    moc_va: float = Field(gt=0)
    klasa: str = Field(min_length=1)
    przeznaczenie: tuple[PrzeznaczenieRdzenia, ...] = Field(min_length=1)
    otwarty_trojkat: bool = False

    @property
    def rodzaje(self) -> frozenset[str]:
        """Rodzaje klas uzwojenia (zapis podwójny „0,5/3P" → oba)."""
        return frozenset(
            r for r in (rodzaj_vt_z_klasy(c) for c in self.klasa.split("/")) if r is not None
        )

    @model_validator(mode="after")
    def _spojnosc_klasy(self) -> UzwojeniePrzekladnikaNapieciowego:
        czesci = self.klasa.split("/")
        if any(rodzaj_vt_z_klasy(c) is None for c in czesci):
            raise ValueError(
                f"Klasa dokładności uzwojenia „{self.klasa}” nierozpoznana (IEC 61869-3: klasa "
                "pomiarowa 0,1–3,0, zabezpieczeniowa 3P/6P albo zapis podwójny 0,5/3P)."
            )
        rodzaje = self.rodzaje
        if "ROZNICOWE" in self.przeznaczenie:
            raise ValueError(
                "Uzwojenie przekładnika napięciowego nie zasila zabezpieczenia różnicowego."
            )
        if PRZEZNACZENIA_POMIAROWE & set(self.przeznaczenie) and "metering" not in rodzaje:
            raise ValueError(
                f"Uzwojenie klasy {self.klasa} nie ma klasy pomiarowej — nie służy do pomiaru."
            )
        if "ZABEZPIECZENIA" in self.przeznaczenie and "protection" not in rodzaje:
            raise ValueError(
                f"Uzwojenie klasy {self.klasa} nie ma klasy zabezpieczeniowej — nie zasila "
                "zabezpieczeń."
            )
        return self
