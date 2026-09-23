"""Dwie osie statusu modelu urządzenia dynamicznego (karta AB-1a D3, plan A/B §6.8).

PO CO. `EvidenceTier` (`solver_input/provenance.py`) odpowiada na pytanie o WYNIK
obliczenia („czy wolno go przedstawić jako dowód"), ale nie mówi, DLACZEGO wynik
symulacji mógłby kiedyś awansować. Awans do `VALIDATED_SIMULATION` wymaga dwóch
rozłącznych faktów o MODELU urządzenia, których dziś nie nosi żaden kontrakt:

* ``StatusRownan`` — czy RÓWNANIA klasy urządzenia (rodziny dynamicznej) zostały
  porównane z niezależną wyrocznią (analityczną albo zewnętrzną) — cecha rodziny,
  wspólna dla wszystkich egzemplarzy;
* ``StatusParametrow`` — czy PARAMETRY konkretnego egzemplarza/typu zostały
  potwierdzone pomiarem (walidacja modelu RMS wobec zarejestrowanego przebiegu),
  czy pochodzą z karty katalogowej, czy są oszacowaniem — cecha danych.

Trzecia oś („dowód zaakceptowany przez profil") NIE jest cechą modelu — zależy od
wymagania i profilu operatora, więc należy do łańcucha zgodności (kamień AB-1c),
nie tutaj. ``OUTSIDE_DOMAIN`` nie jest wartością żadnej osi — to stan ZAPYTANIA
(częstotliwość albo napięcie poza zakresem ważności), czyli kod wyniku (W-99).

CERTYFIKAT BADANIA TYPU NIE JEST WALIDACJĄ PARAMETRÓW MODELU RMS (przegląd
adwersarialny 2026-09-23 §6.5). Rejestr certyfikatów PTPiREE potwierdza badanie
typu urządzenia, a nie stałe regulatorów, PLL czy ograniczników modelu
symulacyjnego. Dlatego ``StatusParametrow`` nie ma wartości „certyfikowane":
certyfikat otwiera wyłącznie metodę dowodu „certyfikat" (kamień AB-1b), nigdy
stopień symulacji zwalidowanej.

Nazwy osi są celowo różne od `EvidenceTier` (wzorzec A-8: jedna nazwa = jedna oś).
Moduł jest liściem: importuje wyłącznie `solver_input.provenance` (etykiety
`FieldQuality`, `EvidenceTier`) — bez warstwy ENM i bez solverów.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Protocol

from solver_input.provenance import (
    EvidenceTier,
    FieldQuality,
    classify_dynamic_capability,
    registered_dynamic_capabilities,
)


class StatusRownan(StrEnum):
    """Status RÓWNAŃ rodziny urządzeń dynamicznych wobec niezależnej wyroczni.

    - ``VALIDATED`` — równania rodziny porównano z wyrocznią niezależną (własna
      algebra albo narzędzie zewnętrzne, bez importu rdzenia) i zgodność jest
      przypięta testem nieregresji;
    - ``UNVALIDATED`` — rodzina ma model w rdzeniu, ale bez niezależnej wyroczni
      (testy spójności tego samego jakobianu nie są walidacją);
    - ``UNKNOWN`` — rodzina nieznana rejestrowi (fail-closed: nowa albo
      przemianowana rodzina nie dziedziczy statusu po nazwie podobnej).
    """

    VALIDATED = "VALIDATED"
    UNVALIDATED = "UNVALIDATED"
    UNKNOWN = "UNKNOWN"

    @property
    def label_pl(self) -> str:
        return _STATUS_ROWNAN_LABEL_PL[self]


_STATUS_ROWNAN_LABEL_PL: dict[StatusRownan, str] = {
    StatusRownan.VALIDATED: "rownania_zwalidowane",
    StatusRownan.UNVALIDATED: "rownania_niezwalidowane",
    StatusRownan.UNKNOWN: "status_rownan_nieznany",
}


class StatusParametrow(StrEnum):
    """Status PARAMETRÓW egzemplarza/typu urządzenia wobec pomiaru.

    - ``MODEL_ZWALIDOWANY_POMIAREM`` — przebieg modelu z tymi parametrami
      porównano z zarejestrowanym przebiegiem urządzenia (jedyny status, który
      razem z ``StatusRownan.VALIDATED`` otwiera awans do symulacji zwalidowanej);
    - ``KARTA_KATALOGOWA`` — parametry z karty producenta (ta sama jakość, co
      `FieldQuality.DATASHEET` — etykieta współdzielona przez import);
    - ``OSZACOWANE`` — oszacowanie inżynierskie albo profil typowy normy (ta sama
      jakość, co `FieldQuality.ESTIMATED`);
    - ``UNKNOWN`` — brak zapisanego statusu (odczyt pola nieobecnego).

    Brak wartości „certyfikowane" jest ZAMIERZONY (patrz nagłówek modułu).
    """

    MODEL_ZWALIDOWANY_POMIAREM = "MODEL_ZWALIDOWANY_POMIAREM"
    KARTA_KATALOGOWA = "KARTA_KATALOGOWA"
    OSZACOWANE = "OSZACOWANE"
    UNKNOWN = "UNKNOWN"

    @property
    def label_pl(self) -> str:
        return _STATUS_PARAMETROW_LABEL_PL[self]


#: Etykiety `KARTA_KATALOGOWA`/`OSZACOWANE` są etykietami `FieldQuality`
#: (import, nie kopia) — ta sama jakość danej nie może mieć dwóch nazw.
_STATUS_PARAMETROW_LABEL_PL: dict[StatusParametrow, str] = {
    StatusParametrow.MODEL_ZWALIDOWANY_POMIAREM: "model_zwalidowany_pomiarem",
    StatusParametrow.KARTA_KATALOGOWA: FieldQuality.DATASHEET.label_pl,
    StatusParametrow.OSZACOWANE: FieldQuality.ESTIMATED.label_pl,
    StatusParametrow.UNKNOWN: "status_parametrow_nieznany",
}

#: Odsyłacz do macierzy wyroczni dynamiki (stan na HEAD 2026-09-23): która rodzina
#: ma niezależną wyrocznię, a która tylko testy spójności.
_ODSYLACZ_WYROCZNI = "docs/evidence/OPUS_PRZEGLAD_LUK_DYNAMIKI_2026-09-23.md §3"


@dataclass(frozen=True)
class WpisStatusuRownan:
    """Wpis rejestru statusu równań: status + uzasadnienie + odsyłacz audytowy."""

    status: StatusRownan
    uzasadnienie_pl: str
    audit_ref: str

    def to_dict(self) -> dict[str, str]:
        return {
            "status_rownan": self.status.value,
            "status_rownan_pl": self.status.label_pl,
            "uzasadnienie_pl": self.uzasadnienie_pl,
            "audit_ref": self.audit_ref,
        }


def _niezwalidowana(opis_pl: str) -> WpisStatusuRownan:
    return WpisStatusuRownan(
        StatusRownan.UNVALIDATED,
        f"{opis_pl} Brak niezależnej wyroczni — testy spójności tego samego jakobianu "
        "nie są walidacją równań.",
        _ODSYLACZ_WYROCZNI,
    )


#: Rejestr statusu równań per rodzina. Klucze = rodziny kontraktu ENM
#: (`enm/dynamika_modele.py::RODZINY_PARAMETROW_DYNAMICZNYCH`, test wyczerpujący) +
#: maszyna klasyczna 2. rzędu rdzenia (`maszyna_klasyczna` — model SMIB rdzenia,
#: jedyna rodzina z niezależną wyrocznią: własna algebra i `solve_ivp`, ANDES
#: `GENCLS`, równe pola; zakres ważności: maszyna 2. rzędu BEZ regulatorów).
#: Rodzina ENM `synchroniczna` to model 6. rzędu z AVR/GOV/PSS — wyrocznia 2. rzędu
#: jej NIE obejmuje, więc jest `UNVALIDATED` (awans z nazwy „synchroniczna" byłby
#: dokładnie zawyżeniem, którego zakazuje nagłówek `EvidenceTier`).
_STATUS_ROWNAN_RODZIN: dict[str, WpisStatusuRownan] = {
    "maszyna_klasyczna": WpisStatusuRownan(
        StatusRownan.VALIDATED,
        "Maszyna klasyczna 2. rzędu (E' za X'd) bez regulatorów: równania porównane z "
        "niezależną wyrocznią (własna algebra 2×2 i całkowanie, ANDES GENCLS, kryterium "
        "równych pól) — bramki runda 10.",
        "docs/evidence/RUNDA10_DOMKNIECIE_DOWODU_WYKONYWALNEGO_2026-09-20.md (R10 §AA); "
        + _ODSYLACZ_WYROCZNI,
    ),
    "synchroniczna": _niezwalidowana(
        "Maszyna synchroniczna 6. rzędu z AVR (SEXS, IEEE ST1A, IEEE AC1A), regulatorem "
        "obrotów (TGOV1, HYGOV) i PSS1A."
    ),
    "przeksztaltnikowa_gfl": _niezwalidowana(
        "Przekształtnik nadążny (PLL, ogranicznik prądu, FRT, odbudowa mocy)."
    ),
    "przeksztaltnikowa_gfm": _niezwalidowana(
        "Przekształtnik tworzący sieć (statyzm albo maszyna wirtualna, impedancja wirtualna)."
    ),
    "magazyn": _niezwalidowana(
        "Magazyn energii (SOC, sprawności, przekształtnik) — niezmiennik bilansu energii "
        "nie jest wyrocznią trajektorii P(t), Q(t)."
    ),
    "wiatr_typ_1": _niezwalidowana(
        "Turbina wiatrowa typu 1 — rdzeń kończy się nazwaną odmową (brak modelu elektrycznego)."
    ),
    "wiatr_typ_2": _niezwalidowana(
        "Turbina wiatrowa typu 2 — rdzeń kończy się nazwaną odmową (brak modelu elektrycznego)."
    ),
    "wiatr_typ_3": _niezwalidowana("Turbina wiatrowa typu 3 (DFIG, crowbar, pitch)."),
    "wiatr_typ_4": _niezwalidowana("Turbina wiatrowa typu 4 (pełny przekształtnik, pitch)."),
}


def wpis_statusu_rownan(rodzina: str) -> WpisStatusuRownan:
    """Wpis rejestru dla rodziny; rodzina nieznana → `UNKNOWN` (fail-closed)."""
    znany = _STATUS_ROWNAN_RODZIN.get(rodzina)
    if znany is not None:
        return znany
    return WpisStatusuRownan(
        StatusRownan.UNKNOWN,
        f"Rodzina {rodzina!r} nie jest sklasyfikowana w rejestrze statusu równań — "
        "status nieznany (fail-closed), nie dziedziczony po nazwie podobnej.",
        _ODSYLACZ_WYROCZNI,
    )


def status_rownan_rodziny(rodzina: str) -> StatusRownan:
    """Status równań rodziny urządzeń (fail-closed `UNKNOWN` dla rodziny nieznanej)."""
    return wpis_statusu_rownan(rodzina).status


def rodziny_w_rejestrze() -> tuple[str, ...]:
    """Rodziny z rejestru statusu równań, posortowane deterministycznie."""
    return tuple(sorted(_STATUS_ROWNAN_RODZIN))


class _ZeStatusemWalidacji(Protocol):
    @property
    def status_walidacji(self) -> StatusParametrow | None: ...


def status_parametrow(prow: _ZeStatusemWalidacji | None) -> StatusParametrow:
    """Odczyt osi parametrów z `ProweniencjaParametrow` — brak pola/bloku → `UNKNOWN`.

    Odczyt NIE wyprowadza statusu z pola `zrodlo` (np. „karta_producenta"): źródło
    mówi, SKĄD pochodzą liczby, a status — czy ktoś je POTWIERDZIŁ. Zgadywanie
    jednego z drugiego byłoby domysłem (zakaz `domain_no_guessing`).
    """
    if prow is None or prow.status_walidacji is None:
        return StatusParametrow.UNKNOWN
    return prow.status_walidacji


def czy_awans_dopuszczalny(
    tier_docelowy: EvidenceTier,
    status_rownan: StatusRownan,
    status_param: StatusParametrow,
) -> bool:
    """Predykat parami (JEDNO źródło prawdy dla awansu stopnia dowodowego).

    ``VALIDATED_SIMULATION`` wyłącznie przy ``StatusRownan.VALIDATED`` I
    ``StatusParametrow.MODEL_ZWALIDOWANY_POMIAREM``. Pozostałe stopnie nie są
    awansem ponad model (deklaracja, model niezwalidowany, brak symulacji) —
    dopuszczalne przy każdym statusie modelu.
    """
    if tier_docelowy is not EvidenceTier.VALIDATED_SIMULATION:
        return True
    return (
        status_rownan is StatusRownan.VALIDATED
        and status_param is StatusParametrow.MODEL_ZWALIDOWANY_POMIAREM
    )


def zdolnosci_z_awansem_bez_podstawy() -> tuple[str, ...]:
    """Zdolności rejestru dowodowego z `VALIDATED_SIMULATION` bez podstawy w modelu.

    Rejestr `provenance._DYNAMIC_CAPABILITY_EVIDENCE` nie deklaruje statusu modelu zdolności,
    więc KAŻDY wpis `VALIDATED_SIMULATION` jest dziś awansem bez wykazanej podstawy
    (predykat `czy_awans_dopuszczalny` przy statusach `UNKNOWN` daje `False`).
    Musi zwracać krotkę pustą — test pinuje to w obie strony.
    """
    return tuple(
        sorted(
            capability_id
            for capability_id in registered_dynamic_capabilities()
            if not czy_awans_dopuszczalny(
                classify_dynamic_capability(capability_id).tier,
                StatusRownan.UNKNOWN,
                StatusParametrow.UNKNOWN,
            )
        )
    )


def status_modelu_rodzin_do_dict() -> dict[str, object]:
    """Kontrakt odczytu rejestru dla API (odznaki w inspektorze urządzenia)."""
    return {
        "rodziny": {
            rodzina: _STATUS_ROWNAN_RODZIN[rodzina].to_dict() for rodzina in rodziny_w_rejestrze()
        },
        "statusy_parametrow": [
            {"kod": status.value, "etykieta": status.label_pl} for status in StatusParametrow
        ],
    }


__all__ = [
    "StatusParametrow",
    "StatusRownan",
    "WpisStatusuRownan",
    "czy_awans_dopuszczalny",
    "rodziny_w_rejestrze",
    "status_modelu_rodzin_do_dict",
    "status_parametrow",
    "status_rownan_rodziny",
    "wpis_statusu_rownan",
    "zdolnosci_z_awansem_bez_podstawy",
]
