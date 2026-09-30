"""Baza kontraktów dziedziny częstotliwości: rekord zamrożony, kanoniczny JSON i odcisk.

Każdy typ pakietu ``dziedziny`` jest zamrożony (``frozen=True``) i odrzuca pola spoza
kontraktu (``extra="forbid"``); kolekcje są krotkami, bo lista w zamrożonym modelu
przyjmowałaby ``append`` już PO walidacji (ten sam powód, co w ``werdykt.kontrakt``).

Kanoniczny JSON (klucze posortowane, zapis zwarty, UTF-8 bez ucieczek, ``allow_nan=False``)
i odcisk SHA-256 — ten sam wzorzec co ``werdykt.kontrakt._RekordWerdyktu``: dwa rekordy
o tej samej treści mają ten sam odcisk niezależnie od kolejności budowania. Kolejność
elementów krotek, które nie niosą znaczenia porządku (składowe widma, dowody, zbiory
dziedzin), normalizują walidatory typów — odcisk nie zależy od kolejności wierszy wejścia.

Typy liczbowe wspólne dla pakietu: ``Skonczona`` (liczba skończona), ``Dodatnia`` (skończona,
> 0) i ``Nieujemna`` (skończona, ≥ 0). Żadne pole fizyczne nie ma domyślnej wartości
liczbowej (strażnik ``scripts/dynamika_zero_default_guard.py``, skan ``dziedziny/*.py``).

IMPORTY: stdlib i pydantic.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Mapping
from types import MappingProxyType
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

#: Liczba skończona (NaN i nieskończoność odrzucone przy konstrukcji).
Skonczona = Annotated[float, Field(allow_inf_nan=False)]
#: Liczba skończona ściśle dodatnia.
Dodatnia = Annotated[float, Field(gt=0, allow_inf_nan=False)]
#: Liczba skończona nieujemna.
Nieujemna = Annotated[float, Field(ge=0, allow_inf_nan=False)]


#: Rejestr reguł kontraktów pakietu: identyfikator STAŁY → nazwa PL. Każdy komunikat
#: odmowy walidatora pakietu zaczyna się od ``[identyfikator]`` (``naruszenie``), więc
#: konsument (katalog — kody ``KAT-T``, importer karty — kod odmowy wiersza) rozpoznaje
#: regułę bez porównywania treści komunikatu. Identyfikatora nie wolno zmienić, nazwę —
#: wolno przeredagować.
REGULY_KONTRAKTU: Mapping[str, str] = MappingProxyType(
    {
        "widmo.ksztalt": "kształt modelu widmowego (rodzaj ↔ źródło i część wewnętrzna)",
        "widmo.niepuste": "model widmowy niepusty",
        "widmo.czestotliwosc": (
            "częstotliwość składowej > 0 Hz, w zakresie modelu, bez duplikatów"
        ),
        "widmo.amplituda": "amplituda nieujemna, udział procentowy ≤ 100 % z nazwaną bazą",
        "widmo.faza": "faza: nieznana ≠ zero, interharmoniczna bez fazy, odniesienie fazy",
        "widmo.pomiar": "parametry pomiaru widma (komplet, RBW, warunki ze statusem)",
        "widmo.przelaczanie": "częstotliwość przełączania wyłącznie w dziedzinie supraharmonicznej",
        "widmo.podstawa": "podstawa danych widma: karta producenta albo założenie projektowe",
        "kanon.przedzial": "przedział z jawnym domknięciem i uporządkowanymi granicami",
        "dowod.pokrywa": "rekord dowodu deklaruje niepusty zbiór pokrytych dziedzin bez powtórzeń",
        "sekcje.wejscie": "wejście statusu sekcji spójne z rodzajem sekcji i składnika",
        "karta.modele_unikalne": "identyfikatory modeli karty unikalne",
        "karta.dowody": "dowód karty widmowej jest dowodem widma w dziedzinie częstotliwości",
        "karta.materializacja": "materializacja modeli z kart w elemencie",
        "pasmo.definicja": "definicja pasma widma (zakres, rozdzielczość, pasmo agregacji)",
        "jakosc.wpis": "wpis rejestru wymagań jakości energii",
        "jakosc.parametr_metody": "parametr metody oceny jakości energii",
    }
)
_WZORZEC_REGULY = re.compile(r"\[([a-z_]+\.[a-z_]+)\]")


def naruszenie(regula: str, tekst: str) -> str:
    """Komunikat odmowy z identyfikatorem reguły (``[regula] tekst``)."""
    if regula not in REGULY_KONTRAKTU:
        raise KeyError(f"Reguła {regula!r} spoza rejestru REGULY_KONTRAKTU — błąd programu.")
    return f"[{regula}] {tekst}"


def reguly_w_komunikacie(tekst: str) -> tuple[str, ...]:
    """Identyfikatory reguł z komunikatu (kolejność wystąpienia, bez powtórzeń)."""
    widziane: list[str] = []
    for regula in _WZORZEC_REGULY.findall(tekst):
        if regula in REGULY_KONTRAKTU and regula not in widziane:
            widziane.append(regula)
    return tuple(widziane)


class KontraktDziedziny(BaseModel):
    """Rekord zamrożony z kanonicznym JSON i odciskiem SHA-256."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    def kanoniczny_json(self) -> str:
        """Kanoniczny JSON rekordu: klucze posortowane, zapis zwarty, bez NaN."""
        return json.dumps(
            self.model_dump(mode="json"),
            sort_keys=True,
            ensure_ascii=False,
            separators=(",", ":"),
            allow_nan=False,
        )

    def odcisk(self) -> str:
        """SHA-256 kanonicznego JSON rekordu."""
        return hashlib.sha256(self.kanoniczny_json().encode("utf-8")).hexdigest()


class Przedzial(KontraktDziedziny):
    """Przedział liczbowy z JAWNYM domknięciem obu końców (dana z dokumentu).

    Brak domyślnego domknięcia jest celowy: dwa sąsiednie biny mocy z raportu badań
    (np. ``[0,2; 0,5)`` i ``[0,5; 1,0]``) rozstrzygają punkt graniczny wyłącznie przez
    domknięcie zapisane w dokumencie — domysł „zamknięty z obu stron" dałby dwa modele
    pokrywające ten sam punkt, a „otwarty" — punkt bez modelu. Granica ``None`` oznacza
    przedział nieograniczony z tej strony (domknięcie tej strony musi być wtedy ``None``).
    """

    dolna: Skonczona | None
    gorna: Skonczona | None
    domkniecie_dolne: bool | None
    domkniecie_gorne: bool | None

    @model_validator(mode="after")
    def _spojnosc(self) -> Self:
        if (self.dolna is None) != (self.domkniecie_dolne is None):
            raise ValueError(
                naruszenie(
                    "kanon.przedzial",
                    "Granica dolna i jej domknięcie występują razem albo wcale (granica None = "
                    "przedział nieograniczony z dołu, bez domknięcia).",
                )
            )
        if (self.gorna is None) != (self.domkniecie_gorne is None):
            raise ValueError(
                naruszenie(
                    "kanon.przedzial",
                    "Granica górna i jej domknięcie występują razem albo wcale (granica None = "
                    "przedział nieograniczony z góry, bez domknięcia).",
                )
            )
        if self.dolna is None and self.gorna is None:
            raise ValueError(
                naruszenie(
                    "kanon.przedzial",
                    "Przedział bez żadnej granicy nie ogranicza niczego — pomiń go.",
                )
            )
        if self.dolna is not None and self.gorna is not None:
            if self.dolna > self.gorna:
                raise ValueError(
                    naruszenie(
                        "kanon.przedzial",
                        f"Granica dolna {self.dolna} większa od górnej {self.gorna}.",
                    )
                )
            if self.dolna == self.gorna and not (self.domkniecie_dolne and self.domkniecie_gorne):
                raise ValueError(
                    naruszenie(
                        "kanon.przedzial",
                        f"Przedział zdegenerowany [{self.dolna}] musi być domknięty z obu stron — "
                        "inaczej jest pusty.",
                    )
                )
        return self

    def zawiera(self, wartosc: float) -> bool:
        """Czy wartość należy do przedziału (porównania z domknięciem z dokumentu)."""
        if self.dolna is not None:
            if self.domkniecie_dolne and wartosc < self.dolna:
                return False
            if not self.domkniecie_dolne and wartosc <= self.dolna:
                return False
        if self.gorna is not None:
            if self.domkniecie_gorne and wartosc > self.gorna:
                return False
            if not self.domkniecie_gorne and wartosc >= self.gorna:
                return False
        return True

    def zapis_pl(self) -> str:
        """Zapis matematyczny przedziału, np. ``[0.2; 0.5)``."""
        lewy = "(-∞" if self.dolna is None else ("[" if self.domkniecie_dolne else "(")
        lewy = lewy if self.dolna is None else f"{lewy}{self.dolna}"
        prawy = "+∞)" if self.gorna is None else ("]" if self.domkniecie_gorne else ")")
        prawy = prawy if self.gorna is None else f"{self.gorna}{prawy}"
        return f"{lewy}; {prawy}"


__all__ = [
    "REGULY_KONTRAKTU",
    "Dodatnia",
    "KontraktDziedziny",
    "Nieujemna",
    "Przedzial",
    "Skonczona",
    "naruszenie",
    "reguly_w_komunikacie",
]
