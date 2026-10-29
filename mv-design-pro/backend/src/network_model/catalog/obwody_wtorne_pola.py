"""Obwody wtórne wzorca pola liniowego GPZ jako DANE (ENEA Operator, Zeszyt 1, Z.10 s.89,
Z.11 s.90, Z.11.1 s.91) — powiązania funkcji EAZ z rdzeniem przekładnika prądowego, uzwojeniem
przekładnika napięciowego, przekładnikiem Ferrantiego i obwodem okrężnym, sygnały do wyłącznika,
obwody okrężne i sygnały nadrzędne rysunku, przypisania rdzeni/uzwojeń poza EAZ.

PO CO (uzupełnienie właściciela 2026-10-29 karty UX-04/POLE-LINIOWE-WZORZEC). Szablon niósł
zestaw kodów funkcji EAZ i tabliczki przekładników, ale relacji z rysunku — która funkcja
mierzy z którego rdzenia albo uzwojenia, który sygnał wysyła do wyłącznika, które sygnały
pole wymienia z rozdzielnią — nie było nigdzie poza obrazem. Bez nich karta pola nie umiała
pokazać, z czego funkcja mierzy, a przyszła karta nastaw (ADR-022) nie miałaby czego związać.

ZAKRES. Moduł opisuje WZORZEC (szablon), nie nastawy ani stan funkcji: ten należy do aktywów EAZ
modelu (ADR-022, `enm.models.ProtectionAssignment`, `BayProtectionControlUnit`) — luka zapisana
w `docs/uiux/UX04_POLE_LINIOWE_WZORZEC.md` (tabela luk). Każdy wpis ma status weryfikacji:

* ``ZWERYFIKOWANE_NA_RYSUNKU`` — linia albo napis widoczny na rysunku standardu;
* ``ODCZYT_TEKSTU`` — z treści standardu albo IRiESD (punkt w podstawie);
* ``INTERPRETACJA`` — wniosek inżynierski, którego rysunek nie rysuje wprost (uzasadnienie
  w ``uwaga``).

Rozwinięć skrótów, których standard nie podaje (Up, Aw, Al, +AwUp, Topologia), moduł nie
odgaduje — ``znaczenie_pl`` zostaje ``None``.

Moduł jest LIŚCIEM (pydantic + słownik `funkcje_eaz`); spójność z aparatami szablonu (rodzaj,
oznaczenie, numer rdzenia/uzwojenia) sprawdza walidator `BayTemplate`.
"""

from __future__ import annotations

from typing import Literal

from network_model.catalog.funkcje_eaz import kody_spoza_slownika
from pydantic import BaseModel, Field, model_validator

__all__ = [
    "OBWODY_WTORNE_WYKONANIA_POLA",
    "ObwodyWtornePola",
    "PowiazanieFunkcjiEaz",
    "PrzypisanieObwoduPrzekladnika",
    "SygnalPola",
    "StatusWeryfikacji",
    "WejscieFunkcjiEaz",
]

StatusWeryfikacji = Literal["ZWERYFIKOWANE_NA_RYSUNKU", "ODCZYT_TEKSTU", "INTERPRETACJA"]

_ZW: StatusWeryfikacji = "ZWERYFIKOWANE_NA_RYSUNKU"
_OT: StatusWeryfikacji = "ODCZYT_TEKSTU"
_IN: StatusWeryfikacji = "INTERPRETACJA"


class WejscieFunkcjiEaz(BaseModel):
    """Źródło wielkości pomiarowej albo sygnału wejściowego funkcji EAZ.

    ``RDZEN_CT`` / ``UZWOJENIE_VT`` — aparat szablonu (``aparat`` = oznaczenie, ``numer`` =
    numer rdzenia/uzwojenia jak na rysunku, od 1); ``PRZEKLADNIK_FERRANTIEGO`` — aparat
    szablonu (bez numeru); ``SYGNAL`` — sygnał pola (``sygnal`` = nazwa z `SygnalPola`)."""

    rodzaj: Literal["RDZEN_CT", "UZWOJENIE_VT", "PRZEKLADNIK_FERRANTIEGO", "SYGNAL"]
    aparat: str | None = None
    numer: int | None = Field(default=None, ge=1)
    sygnal: str | None = None
    weryfikacja: StatusWeryfikacji
    uwaga: str | None = None

    @model_validator(mode="after")
    def _ksztalt(self) -> WejscieFunkcjiEaz:
        z_aparatem = self.rodzaj != "SYGNAL"
        if z_aparatem != (self.aparat is not None) or z_aparatem == (self.sygnal is not None):
            raise ValueError(f"Wejście {self.rodzaj}: aparat albo sygnał — dokładnie jedno.")
        if (self.rodzaj in ("RDZEN_CT", "UZWOJENIE_VT")) != (self.numer is not None):
            raise ValueError(f"Wejście {self.rodzaj}: numer wyłącznie dla rdzenia i uzwojenia.")
        if self.weryfikacja == _IN and not self.uwaga:
            raise ValueError("Wejście z interpretacji wymaga uzasadnienia (uwaga).")
        return self


class PowiazanieFunkcjiEaz(BaseModel):
    """Funkcja EAZ wzorca: blok rysunku, wejścia, sygnały wyjściowe i wyłącznik wykonawczy."""

    funkcja: str  # kod słownika `funkcje_eaz`
    blok_rysunku: str  # napis bloku na rysunku (np. „I> t1", „Sterownik pola")
    wejscia: list[WejscieFunkcjiEaz] = Field(min_length=1)
    wyjscia: list[str] = Field(min_length=1)  # nazwy sygnałów wyjściowych `SygnalPola`
    # Oznaczenie wyłącznika, na który działają sygnały do wyłącznika (None — funkcja wysyła
    # wyłącznie sygnały do rozdzielni, np. blokowanie ZS).
    wylacznik: str | None = None
    weryfikacja: StatusWeryfikacji
    uwaga: str | None = None

    @model_validator(mode="after")
    def _uzasadnienie(self) -> PowiazanieFunkcjiEaz:
        if self.weryfikacja == _IN and not self.uwaga:
            raise ValueError(f"Powiązanie {self.funkcja}: interpretacja wymaga uzasadnienia.")
        return self


class SygnalPola(BaseModel):
    """Sygnał rysunku: do wyłącznika (``WYLACZNIK``), obwód okrężny rozdzielni (``OKREZNY``)
    albo sygnał nadrzędny pola (``NADRZEDNY`` — górna krawędź rysunku)."""

    nazwa: str
    kierunek: Literal["WEJSCIE", "WYJSCIE"]
    obwod: Literal["WYLACZNIK", "OKREZNY", "NADRZEDNY"]
    # Sygnał prowadzony na rysunku do bloku „Sterownik pola" (poza funkcjami EAZ).
    sterownik_pola: bool = False
    znaczenie_pl: str | None = None
    weryfikacja: StatusWeryfikacji
    uwaga: str | None = None


class PrzypisanieObwoduPrzekladnika(BaseModel):
    """Rdzeń CT albo uzwojenie VT użyte POZA funkcjami EAZ (pomiar rozliczeniowy, układy
    regulacyjne) albo niepodłączone na rysunku (``odbiornik_pl = None``)."""

    aparat: str
    numer: int = Field(ge=1)
    odbiornik_pl: str | None
    weryfikacja: StatusWeryfikacji


class ObwodyWtornePola(BaseModel):
    """Obwody wtórne wzorca pola — jedno źródło relacji rysunku dla API szablonów i karty pola."""

    podstawa: str
    naped_wylacznika: Literal["SILNIKOWY"]
    naped_weryfikacja: StatusWeryfikacji
    powiazania: list[PowiazanieFunkcjiEaz]
    sygnaly: list[SygnalPola]
    obwody_przekladnikow: list[PrzypisanieObwoduPrzekladnika] = Field(default_factory=list)

    @model_validator(mode="after")
    def _spojnosc(self) -> ObwodyWtornePola:
        nieznane = kody_spoza_slownika([p.funkcja for p in self.powiazania])
        if nieznane:
            raise ValueError(f"Obwody wtórne: kody funkcji spoza słownika EAZ: {nieznane}.")
        kody = [p.funkcja for p in self.powiazania]
        if len(set(kody)) != len(kody):
            raise ValueError("Obwody wtórne: funkcja EAZ powiązana więcej niż raz.")
        nazwy = [s.nazwa for s in self.sygnaly]
        if len(set(nazwy)) != len(nazwy):
            raise ValueError("Obwody wtórne: powtórzona nazwa sygnału.")
        sygnaly = {s.nazwa: s for s in self.sygnaly}
        uzyte: set[str] = set()
        for p in self.powiazania:
            for wyjscie in p.wyjscia:
                s = sygnaly.get(wyjscie)
                if s is None or s.kierunek != "WYJSCIE":
                    raise ValueError(f"Powiązanie {p.funkcja}: {wyjscie!r} nie jest wyjściem pola.")
                if s.obwod == "WYLACZNIK" and p.wylacznik is None:
                    raise ValueError(
                        f"Powiązanie {p.funkcja}: sygnał do wyłącznika bez wyłącznika."
                    )
                uzyte.add(wyjscie)
            for wejscie in p.wejscia:
                if wejscie.sygnal is None:
                    continue
                s = sygnaly.get(wejscie.sygnal)
                if s is None or s.kierunek != "WEJSCIE":
                    raise ValueError(
                        f"Powiązanie {p.funkcja}: {wejscie.sygnal!r} nie jest wejściem pola."
                    )
                uzyte.add(wejscie.sygnal)
        osierocone = [
            s.nazwa for s in self.sygnaly if s.nazwa not in uzyte and not s.sterownik_pola
        ]
        if osierocone:
            raise ValueError(f"Obwody wtórne: sygnały bez odbiornika na rysunku: {osierocone}.")
        return self


# ---------------------------------------------------------------------------
# Dane rysunków (odczyt 2026-10-29: s.89, s.90, s.91 — obrazy stron standardu).
# ---------------------------------------------------------------------------

_Z1 = "ENEA Operator, Stacje elektroenergetyczne 110 kV, Zeszyt 1"
_UWAGA_WSPOLNE_WEJSCIE_PRADOWE = (
    "rysunek prowadzi obwód rdzenia zabezpieczeniowego wyłącznie do bloku I>/I>>; blok jest "
    "częścią tego samego zabezpieczenia polowego i mierzy te same prądy fazowe"
)
_UWAGA_STEROWNIK = (
    "rysunek prowadzi sygnał do bloku „Sterownik pola”; wykonanie przez obwód sterowania "
    "wyłącznikiem sterownika jest wnioskiem z układu rysunku"
)


def _ct(
    aparat: str, numer: int, weryfikacja: StatusWeryfikacji = _ZW, uwaga: str | None = None
) -> WejscieFunkcjiEaz:
    return WejscieFunkcjiEaz(
        rodzaj="RDZEN_CT", aparat=aparat, numer=numer, weryfikacja=weryfikacja, uwaga=uwaga
    )


def _vt(
    aparat: str, numer: int, weryfikacja: StatusWeryfikacji = _ZW, uwaga: str | None = None
) -> WejscieFunkcjiEaz:
    return WejscieFunkcjiEaz(
        rodzaj="UZWOJENIE_VT", aparat=aparat, numer=numer, weryfikacja=weryfikacja, uwaga=uwaga
    )


def _sygnal(
    nazwa: str, weryfikacja: StatusWeryfikacji = _ZW, uwaga: str | None = None
) -> WejscieFunkcjiEaz:
    return WejscieFunkcjiEaz(rodzaj="SYGNAL", sygnal=nazwa, weryfikacja=weryfikacja, uwaga=uwaga)


_FERRANTI = WejscieFunkcjiEaz(rodzaj="PRZEKLADNIK_FERRANTIEGO", aparat="T2", weryfikacja=_ZW)
_Z_ZZ = WejscieFunkcjiEaz(
    rodzaj="SYGNAL",
    sygnal="Z, Zz",
    weryfikacja=_ZW,
    uwaga="obwód okrężny doprowadzony do bloku zabezpieczenia ziemnozwarciowego",
)


def _sygnaly(z_vt: bool, wyjscia_wylacznika: tuple[str, ...]) -> list[SygnalPola]:
    """Sygnały rysunku: do wyłącznika, nadrzędne (górna krawędź) i obwody okrężne (prawa)."""
    wylacznik = [
        SygnalPola(
            nazwa="Blok. ZW",
            kierunek="WYJSCIE",
            obwod="WYLACZNIK",
            znaczenie_pl="blokada załączenia wyłącznika",
            weryfikacja=_IN,
            uwaga="rozwinięcie „ZW” (załączenie wyłącznika) — skrót ruchowy, standard go nie "
            "rozwija; „Blok.” — napis rysunku",
        ),
        SygnalPola(
            nazwa="ZW",
            kierunek="WYJSCIE",
            obwod="WYLACZNIK",
            sterownik_pola=True,
            znaczenie_pl="polecenie załączenia wyłącznika",
            weryfikacja=_IN,
            uwaga="skrót ruchowy, standard go nie rozwija",
        ),
        *(
            SygnalPola(
                nazwa=nazwa,
                kierunek="WYJSCIE",
                obwod="WYLACZNIK",
                sterownik_pola=True,
                znaczenie_pl=f"obwód wyłączający {nazwa[-1]} wyłącznika",
                weryfikacja=_IN,
                uwaga="skrót ruchowy (obwód wyłączający), standard go nie rozwija",
            )
            for nazwa in wyjscia_wylacznika
        ),
    ]
    nadrzedne = [
        SygnalPola(nazwa="Odstawienie SPZ", kierunek="WEJSCIE", obwod="NADRZEDNY", weryfikacja=_ZW),
        SygnalPola(
            nazwa="Topologia",
            kierunek="WEJSCIE",
            obwod="NADRZEDNY",
            sterownik_pola=True,
            weryfikacja=_ZW,
        ),
        SygnalPola(
            nazwa="Zasilanie",
            kierunek="WEJSCIE",
            obwod="NADRZEDNY",
            sterownik_pola=True,
            znaczenie_pl="napięcie pomocnicze sterownika (biegun dodatni i ujemny)",
            weryfikacja=_ZW,
        ),
        SygnalPola(
            nazwa="SSiN",
            kierunek="WYJSCIE",
            obwod="NADRZEDNY",
            sterownik_pola=True,
            znaczenie_pl="łącze do systemu sterowania i nadzoru stacji",
            weryfikacja=_IN,
            uwaga="rozwinięcie skrótu wg terminologii ENEA, rysunek podaje sam skrót",
        ),
        SygnalPola(
            nazwa="Łącze inżynierskie",
            kierunek="WYJSCIE",
            obwod="NADRZEDNY",
            sterownik_pola=True,
            weryfikacja=_ZW,
        ),
    ]
    okrezne: list[SygnalPola] = []
    if z_vt:
        okrezne.append(
            SygnalPola(
                nazwa="Wył. od zab. TR",
                kierunek="WEJSCIE",
                obwod="OKREZNY",
                znaczenie_pl="wyłączenie od zabezpieczeń transformatora",
                weryfikacja=_ZW,
            )
        )
    okrezne += [
        SygnalPola(
            nazwa="+AwUp", kierunek="WEJSCIE", obwod="OKREZNY", sterownik_pola=True, weryfikacja=_ZW
        ),
        *(
            SygnalPola(
                nazwa=nazwa,
                kierunek="WYJSCIE",
                obwod="OKREZNY",
                sterownik_pola=True,
                weryfikacja=_ZW,
            )
            for nazwa in ("Up", "Aw", "Al")
        ),
        SygnalPola(
            nazwa="SCO1",
            kierunek="WEJSCIE",
            obwod="OKREZNY",
            sterownik_pola=True,
            znaczenie_pl="pobudzenie stopnia 1 samoczynnego częstotliwościowego odciążenia",
            weryfikacja=_IN,
            uwaga="numer stopnia SCO wnioskowany z napisu, standard go nie rozwija",
        ),
        SygnalPola(
            nazwa="SCO2",
            kierunek="WEJSCIE",
            obwod="OKREZNY",
            sterownik_pola=True,
            znaczenie_pl="pobudzenie stopnia 2 samoczynnego częstotliwościowego odciążenia",
            weryfikacja=_IN,
            uwaga="numer stopnia SCO wnioskowany z napisu, standard go nie rozwija",
        ),
        SygnalPola(
            nazwa="SCO/SPZ",
            kierunek="WEJSCIE",
            obwod="OKREZNY",
            sterownik_pola=True,
            znaczenie_pl="samoczynne ponowne załączenie po odciążeniu częstotliwościowym",
            weryfikacja=_ZW,
        ),
        SygnalPola(
            nazwa="UL1, UL2, UL3, N",
            kierunek="WEJSCIE",
            obwod="OKREZNY",
            sterownik_pola=True,
            znaczenie_pl="napięcia fazowe szyn sekcji",
            weryfikacja=_IN,
            uwaga="obwód okrężny napięć z przekładnika szyn (pole pomiaru napięcia, Z.17); "
            "rysunek pola podaje same oznaczenia faz",
        ),
        SygnalPola(
            nazwa="Pobudzenie LRW",
            kierunek="WYJSCIE",
            obwod="OKREZNY",
            znaczenie_pl="pobudzenie lokalnej rezerwy wyłącznikowej rozdzielni",
            weryfikacja=_ZW,
        ),
        SygnalPola(
            nazwa="Blokowanie ZS",
            kierunek="WYJSCIE",
            obwod="OKREZNY",
            znaczenie_pl="sygnał blokowania logicznego zabezpieczenia szyn",
            weryfikacja=_ZW,
        ),
        SygnalPola(
            nazwa="Z, Zz",
            kierunek="WEJSCIE",
            obwod="OKREZNY",
            znaczenie_pl="napięcie zerowe sieci z obwodu okrężnego (wejście U0 zabezpieczenia "
            "ziemnozwarciowego)",
            weryfikacja=_IN,
            uwaga="rysunek doprowadza obwód do bloku zabezpieczenia ziemnozwarciowego obok "
            "przekładnika Ferrantiego (Io); napięcie zerowe — wniosek z kierunkowości bloku",
        ),
    ]
    return wylacznik + nadrzedne + okrezne


def _powiazania_wspolne(
    rdzen: int, wyjscia_wylacznika: list[str], z_vt: bool
) -> list[PowiazanieFunkcjiEaz]:
    """Funkcje obecne we wszystkich trzech rysunkach (I>, I>>, ziemnozwarciowe, ZS, LRW, SPZ,
    SCO) — różnią się rdzeniem prądowym (Z.11: rdzeń III) i obwodami wyłączającymi."""
    wspolne = _UWAGA_WSPOLNE_WEJSCIE_PRADOWE
    return [
        PowiazanieFunkcjiEaz(
            funkcja="51",
            blok_rysunku="I> t1",
            wejscia=[_ct("T1", rdzen)],
            wyjscia=list(wyjscia_wylacznika),
            wylacznik="Q0",
            weryfikacja=_ZW,
        ),
        PowiazanieFunkcjiEaz(
            funkcja="50",
            blok_rysunku="I>> t2",
            wejscia=[_ct("T1", rdzen)],
            wyjscia=list(wyjscia_wylacznika),
            wylacznik="Q0",
            weryfikacja=_ZW,
        ),
        PowiazanieFunkcjiEaz(
            funkcja="67N",
            blok_rysunku="Zab. ziemnozwarciowe (kierunkowe) t1, t2",
            wejscia=[_FERRANTI, _Z_ZZ],
            # Z.10: „Blok. ZW” wychodzi z nieopisanej komórki bloku zabezpieczenia
            # ziemnozwarciowego (Z.11/Z.11.1 — z bloku U>/U<, funkcja NZ).
            wyjscia=[*wyjscia_wylacznika, *(() if z_vt else ("Blok. ZW",))],
            wylacznik="Q0",
            weryfikacja=_ZW if z_vt else _IN,
            uwaga=(
                None
                if z_vt
                else "wyjścia OW1, OW2 z komórek t1, t2 — linie widoczne na rysunku; „Blok. ZW” "
                "wychodzi z nieopisanej komórki bloku zabezpieczenia ziemnozwarciowego — "
                "przypisanie tej funkcji jest interpretacją"
            ),
        ),
        PowiazanieFunkcjiEaz(
            funkcja="ZS",
            blok_rysunku="ZS (kierunkowe I>)" if z_vt else "ZS",
            wejscia=[_ct("T1", rdzen, _IN, wspolne)],
            wyjscia=["Blokowanie ZS"],
            weryfikacja=_ZW,
        ),
        PowiazanieFunkcjiEaz(
            funkcja="50BF",
            blok_rysunku="LRW",
            wejscia=[_ct("T1", rdzen, _IN, wspolne)],
            wyjscia=[*wyjscia_wylacznika, "Pobudzenie LRW"],
            wylacznik="Q0",
            weryfikacja=_ZW,
        ),
        PowiazanieFunkcjiEaz(
            funkcja="79",
            blok_rysunku="SPZ tSPZ",
            wejscia=[_sygnal("Odstawienie SPZ")],
            wyjscia=["ZW"],
            wylacznik="Q0",
            weryfikacja=_ZW,
        ),
        PowiazanieFunkcjiEaz(
            funkcja="SCO",
            blok_rysunku="Sterownik pola",
            wejscia=[_sygnal("SCO1"), _sygnal("SCO2")],
            wyjscia=list(wyjscia_wylacznika),
            wylacznik="Q0",
            weryfikacja=_IN,
            uwaga=_UWAGA_STEROWNIK,
        ),
        PowiazanieFunkcjiEaz(
            funkcja="SPZ/SCO",
            blok_rysunku="Sterownik pola",
            wejscia=[_sygnal("SCO/SPZ")],
            wyjscia=["ZW"],
            wylacznik="Q0",
            weryfikacja=_IN,
            uwaga=_UWAGA_STEROWNIK,
        ),
    ]


def _powiazania_napieciowe(rdzen: int) -> list[PowiazanieFunkcjiEaz]:
    """Funkcje odgałęzienia przekładnika napięciowego od strony linii (Z.11 s.90, Z.11.1 s.91):
    uzwojenie III przekładnika T3 zasila bloki U>/U< i f</f>/df/dt."""
    return [
        PowiazanieFunkcjiEaz(
            funkcja="67",
            blok_rysunku="ZS (kierunkowe I>)",
            wejscia=[
                _ct("T1", rdzen, _IN, _UWAGA_WSPOLNE_WEJSCIE_PRADOWE),
                _vt(
                    "T3",
                    3,
                    _IN,
                    "kierunek wymaga napięcia; rysunek prowadzi uzwojenie III do bloków U i f "
                    "tego samego zabezpieczenia, nie do bloku ZS",
                ),
            ],
            wyjscia=["Blokowanie ZS"],
            weryfikacja=_ZW,
        ),
        *(
            PowiazanieFunkcjiEaz(
                funkcja=kod,
                blok_rysunku="U> U<",
                wejscia=[_vt("T3", 3)],
                wyjscia=["Blok. ZW"],
                wylacznik="Q0",
                weryfikacja=_ZW,
            )
            for kod in ("27", "59")
        ),
        *(
            PowiazanieFunkcjiEaz(
                funkcja=kod,
                blok_rysunku="f< f> df/dt",
                wejscia=[_vt("T3", 3)],
                wyjscia=["OW1"],
                wylacznik="Q0",
                weryfikacja=_ZW,
            )
            for kod in ("81U", "81O", "81R")
        ),
        PowiazanieFunkcjiEaz(
            funkcja="NZ",
            blok_rysunku="U> U<",
            wejscia=[_vt("T3", 3)],
            wyjscia=["Blok. ZW"],
            wylacznik="Q0",
            weryfikacja=_IN,
            uwaga=f"{_Z1} §26.9.3 i §26.10.3 nazywają blokadę załączenia od napięcia zwrotnego; "
            "rysunek realizuje ją blokiem U>/U< z wyjściem „Blok. ZW” (napięcie po stronie linii "
            "przy otwartym wyłączniku blokuje załączenie)",
        ),
        PowiazanieFunkcjiEaz(
            funkcja="SPZE",
            blok_rysunku="SPZE tE",
            wejscia=[_sygnal("Wył. od zab. TR")],
            wyjscia=["ZW"],
            wylacznik="Q0",
            weryfikacja=_IN,
            uwaga="rysunek doprowadza „Wył. od zab. TR” do bloku SPZE tE; ponowne załączenie po "
            "czasie tE — wniosek z nazwy bloku (rozwinięcia skrótu SPZE standard nie podaje)",
        ),
        PowiazanieFunkcjiEaz(
            funkcja="OWG",
            blok_rysunku="SPZE tE",
            wejscia=[_sygnal("Wył. od zab. TR")],
            wyjscia=["OW1"],
            wylacznik="Q0",
            weryfikacja=_IN,
            uwaga=f"{_Z1} §26.10.4 — wyłączenie pól z generacją od zabezpieczeń transformatora; "
            "rysunek prowadzi to wejście do bloku SPZE, a wyjście bloku do obwodu OW1",
        ),
    ]


def _obwody_wykonania(wykonanie_pola: str) -> ObwodyWtornePola:
    if wykonanie_pola == "Z10":
        wyjscia = ["OW1", "OW2"]
        return ObwodyWtornePola(
            podstawa=f"{_Z1}, Z.10 s.89",
            naped_wylacznika="SILNIKOWY",
            naped_weryfikacja=_ZW,
            powiazania=_powiazania_wspolne(1, wyjscia, z_vt=False),
            sygnaly=_sygnaly(False, tuple(wyjscia)),
        )
    rdzen = 3 if wykonanie_pola == "Z11" else 1
    wyjscia = ["OW1"]
    if wykonanie_pola == "Z11":
        przypisania = [
            PrzypisanieObwoduPrzekladnika(
                aparat="T1",
                numer=1,
                odbiornik_pl="układ pomiarowo-rozliczeniowy podstawowy, analizator jakości energii",
                weryfikacja=_ZW,
            ),
            PrzypisanieObwoduPrzekladnika(
                aparat="T1", numer=2, odbiornik_pl="układy regulacyjne", weryfikacja=_ZW
            ),
            PrzypisanieObwoduPrzekladnika(
                aparat="T3",
                numer=1,
                odbiornik_pl="układ pomiarowo-rozliczeniowy podstawowy, analizator jakości energii",
                weryfikacja=_ZW,
            ),
            PrzypisanieObwoduPrzekladnika(
                aparat="T3", numer=2, odbiornik_pl="układy regulacyjne", weryfikacja=_ZW
            ),
        ]
    else:
        przypisania = [
            PrzypisanieObwoduPrzekladnika(aparat="T3", numer=n, odbiornik_pl=None, weryfikacja=_ZW)
            for n in (1, 2)
        ]
    strona = "Z.11 s.90" if wykonanie_pola == "Z11" else "Z.11.1 s.91"
    return ObwodyWtornePola(
        podstawa=f"{_Z1}, {strona}",
        naped_wylacznika="SILNIKOWY",
        naped_weryfikacja=_ZW,
        powiazania=_powiazania_wspolne(rdzen, wyjscia, z_vt=True) + _powiazania_napieciowe(rdzen),
        sygnaly=_sygnaly(True, tuple(wyjscia)),
        obwody_przekladnikow=przypisania,
    )


#: Obwody wtórne wzorca wg wykonania pola liniowego GPZ (Z.10, Z.11.1, Z.11).
OBWODY_WTORNE_WYKONANIA_POLA: dict[str, ObwodyWtornePola] = {
    wykonanie: _obwody_wykonania(wykonanie) for wykonanie in ("Z10", "Z11_1", "Z11")
}
