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

from collections.abc import Collection, Mapping, Sequence
from typing import Any, Literal

from network_model.catalog.funkcje_eaz import kody_spoza_slownika
from pydantic import BaseModel, Field, computed_field, model_validator

__all__ = [
    "NAPEDY_RODZAJU_APARATU",
    "OBWODY_WTORNE_WYKONANIA_POLA",
    "OPIS_NAPEDU_PL",
    "POLA_POWIAZAN_APARATU",
    "RODZAJ_APARATU_WEJSCIA",
    "NapedAparatuPola",
    "RodzajNapedu",
    "ObwodyWtornePola",
    "PowiazanieFunkcjiEaz",
    "PrzypisanieObwoduPrzekladnika",
    "SygnalPola",
    "StatusWeryfikacji",
    "WejscieFunkcjiEaz",
    "powiazania_aparatow_pola",
]

StatusWeryfikacji = Literal["ZWERYFIKOWANE_NA_RYSUNKU", "ODCZYT_TEKSTU", "INTERPRETACJA"]

#: Rodzaj napędu łącznika pola — znak napędu, który rysunek wzorca stawia przy łączniku (ENEA
#: Zeszyt 1, Z.10 s.89, Z.11 s.90, Z.11.1 s.91). Jeden słownik dla wzorca
#: (`NapedAparatuPola.naped`) i rekordu aparatu ENM (`BayPrimaryDevice.naped`); napęd jest
#: ATRYBUTEM łącznika, nie osobnym aparatem pola:
#:
#: * ``SILNIKOWY`` — okrąg z literą M na kreskowanym sprzężeniu mechanicznym (EN 60617
#:   02-13-26), przy wyłączniku Q0;
#: * ``ZASOBNIKOWY_RECZNY`` — kwadrat na kreskowanym sprzężeniu mechanicznym (EN 60617 02-13-20,
#:   napęd energią zmagazynowaną) z kreskowanym odcinkiem zakończonym poprzeczką (EN 60617
#:   02-13-01, napęd ręczny — symbol ogólny), przy łączniku trójpołożeniowym Q1.
RodzajNapedu = Literal["SILNIKOWY", "ZASOBNIKOWY_RECZNY"]

#: Napędy dopuszczalne wg rodzaju aparatu (`BayPrimaryDevice.kind`) — jedno źródło dla
#: walidatora wzorca (`NapedAparatuPola`), walidatora rekordu ENM (`BayPrimaryDevice`)
#: i symbolu łącznika na schemacie (frontend `apparatusSequence.SYMBOL_LACZNIKA_Z_NAPEDEM`,
#: parytet przypina test). Rodzaj spoza słownika napędu nie ma.
NAPEDY_RODZAJU_APARATU: dict[str, tuple[RodzajNapedu, ...]] = {
    "CB": ("SILNIKOWY",),
    "THREE_POSITION_SWITCH": ("ZASOBNIKOWY_RECZNY",),
}

#: Opis napędu dla karty pola i raportu (symbol normy w opisie, bez skrótów projektu).
OPIS_NAPEDU_PL: dict[RodzajNapedu, str] = {
    "SILNIKOWY": "napęd silnikowy (M, EN 60617 02-13-26)",
    "ZASOBNIKOWY_RECZNY": (
        "napęd zasobnikowy — energia zmagazynowana (EN 60617 02-13-20), z obsługą ręczną "
        "(EN 60617 02-13-01)"
    ),
}

#: Rodzaj aparatu pola (`BayPrimaryDevice.kind`), z którego mierzy wejście funkcji EAZ — jedno
#: źródło dla walidatora szablonu (`bay_templates._sprawdz_obwody_wtorne`), odczytu pola
#: (`enm.pole_liniowe_gpz._opis_wejscia`) i materializacji powiązań na aparatach
#: (`powiazania_aparatow_pola`).
RODZAJ_APARATU_WEJSCIA: dict[str, str] = {
    "RDZEN_CT": "CT",
    "UZWOJENIE_VT": "VT",
    "PRZEKLADNIK_FERRANTIEGO": "CORE_BALANCE_CT",
    "PRZEKLADNIK_NIEZROWNOWAZENIA": "UNBALANCE_CT",
    "PRZEKLADNIK_MIEDZYFAZOWY": "PHASE_TO_PHASE_VT",
}

_ZW: StatusWeryfikacji = "ZWERYFIKOWANE_NA_RYSUNKU"
_OT: StatusWeryfikacji = "ODCZYT_TEKSTU"
_IN: StatusWeryfikacji = "INTERPRETACJA"


class WejscieFunkcjiEaz(BaseModel):
    """Źródło wielkości pomiarowej albo sygnału wejściowego funkcji EAZ.

    ``RDZEN_CT`` / ``UZWOJENIE_VT`` — aparat szablonu (``aparat`` = oznaczenie, ``numer`` =
    numer rdzenia/uzwojenia jak na rysunku, od 1); ``PRZEKLADNIK_FERRANTIEGO``,
    ``PRZEKLADNIK_NIEZROWNOWAZENIA`` (połączenie międzygwiazdowe baterii, Z.16) i
    ``PRZEKLADNIK_MIEDZYFAZOWY`` (przekładnik napięciowy międzyfazowy baterii, Z.16) — aparat
    szablonu (bez numeru); ``SYGNAL`` — sygnał pola (``sygnal`` = nazwa z `SygnalPola`)."""

    rodzaj: Literal[
        "RDZEN_CT",
        "UZWOJENIE_VT",
        "PRZEKLADNIK_FERRANTIEGO",
        "PRZEKLADNIK_NIEZROWNOWAZENIA",
        "PRZEKLADNIK_MIEDZYFAZOWY",
        "SYGNAL",
    ]
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
    # Sygnały pola, z którymi rysunek łączy ten sygnał WPROST linią, bez bloku pośredniego
    # (Z.7 s.86: wejście „OW2 od zabezpieczeń str. 110 kV” → obwód OW2 wyłącznika; Z.16 s.96:
    # obwód okrężny „Wył. od zab. TR” → obwody OW1, OW2). Oba końce są wtedy użyte.
    polaczony_z: list[str] = Field(default_factory=list)
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


class NapedAparatuPola(BaseModel):
    """Napęd łącznika wzorca pola: oznaczenie i rodzaj aparatu, przy którym rysunek stawia znak
    napędu, oraz rodzaj napędu. Aparat pola dostaje napęd po OZNACZENIU i RODZAJU
    (`powiazania_aparatow_pola`) — łącznik innego rodzaju o tym samym oznaczeniu (wariant
    wykonania łączników, którego rysunek nie przedstawia) napędu nie dostaje."""

    aparat: str  # oznaczenie aparatu na rysunku (np. „Q0", „Q1")
    rodzaj_aparatu: str  # `BayPrimaryDevice.kind`
    naped: RodzajNapedu
    weryfikacja: StatusWeryfikacji
    uwaga: str | None = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def naped_pl(self) -> str:
        """Opis napędu (`OPIS_NAPEDU_PL`) — jedno źródło tekstu karty pola."""
        return OPIS_NAPEDU_PL[self.naped]

    @model_validator(mode="after")
    def _rodzaj_i_uzasadnienie(self) -> NapedAparatuPola:
        if self.naped not in NAPEDY_RODZAJU_APARATU.get(self.rodzaj_aparatu, ()):
            raise ValueError(
                f"Napęd {self.aparat}: napęd {self.naped} nie dotyczy aparatu rodzaju "
                f"{self.rodzaj_aparatu}."
            )
        if self.weryfikacja == _IN and not self.uwaga:
            raise ValueError(f"Napęd {self.aparat}: interpretacja wymaga uzasadnienia.")
        return self


class ObwodyWtornePola(BaseModel):
    """Obwody wtórne wzorca pola — jedno źródło relacji rysunku dla API szablonów i karty pola."""

    podstawa: str
    # Napędy łączników rysunku (wyłącznik Q0, łącznik trójpołożeniowy Q1) — atrybuty aparatów.
    napedy: list[NapedAparatuPola] = Field(default_factory=list)
    powiazania: list[PowiazanieFunkcjiEaz]
    sygnaly: list[SygnalPola]
    obwody_przekladnikow: list[PrzypisanieObwoduPrzekladnika] = Field(default_factory=list)

    @model_validator(mode="after")
    def _spojnosc(self) -> ObwodyWtornePola:
        nieznane = kody_spoza_slownika([p.funkcja for p in self.powiazania])
        if nieznane:
            raise ValueError(f"Obwody wtórne: kody funkcji spoza słownika EAZ: {nieznane}.")
        z_napedem = [n.aparat for n in self.napedy]
        if len(set(z_napedem)) != len(z_napedem):
            raise ValueError("Obwody wtórne: aparat z więcej niż jednym napędem.")
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
        for s in self.sygnaly:
            for cel in s.polaczony_z:
                if cel not in sygnaly or cel == s.nazwa:
                    raise ValueError(
                        f"Sygnał {s.nazwa!r}: połączenie z {cel!r}, którego pole nie ma."
                    )
                uzyte.update((s.nazwa, cel))
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
#: Kryterium prądowe Io bloku ziemnozwarciowego (51N). Linia Io z zacisku 2 przekładnika
#: Ferrantiego 1/100 do bloku „Zab. ziemnozwarciowe" jest na rysunku; wydzielenie jej jako
#: funkcji bez kierunku jest wnioskiem z decyzji właściciela 2026-10-29 — kierunek (67N) wymaga
#: źródła 3U₀ spoza pola, a prąd zerowy pole mierzy samo.
_UWAGA_KRYTERIUM_PRADOWE_IO = (
    "linia Io z zacisku 2 przekładnika Ferrantiego 1/100 do bloku „Zab. ziemnozwarciowe” jest "
    "na rysunku; kryterium prądowe bez kierunku jako osobna funkcja (51N) to wniosek z decyzji "
    "właściciela 2026-10-29 — kierunek (67N) wymaga napięcia zerowego 3U₀ z obwodu okrężnego "
    "„Z, Zz” (pole pomiaru napięcia, Z.17), a prąd zerowy pole mierzy samo"
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
            weryfikacja=_ZW,
            uwaga="obwód okrężny napięć szyn: Z.17 (s.97) wyprowadza na obwód „UL1,UL2,UL3,N” "
            "uzwojenie II (0,1/√3, 15 VA, kl. 0,5/3P) przekładnika pola pomiaru napięcia sekcji",
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
            weryfikacja=_ZW,
            uwaga="rysunek pola doprowadza obwód do bloku zabezpieczenia ziemnozwarciowego obok "
            "przekładnika Ferrantiego (Io); Z.17 (s.97) wyprowadza na obwód „Z,Zz” uzwojenie III "
            "(0,1/3, 15 VA, kl. 3P) w otwartym trójkącie przekładnika pola pomiaru napięcia "
            "sekcji — źródło napięcia zerowego 3U₀ (powiązanie wskazuje się w wyposażeniu pola: "
            "„Źródło napięcia zerowego 3U₀”)",
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
            funkcja="51N",
            blok_rysunku="Zab. ziemnozwarciowe t1, t2 (kryterium prądowe Io)",
            wejscia=[_FERRANTI],
            wyjscia=list(wyjscia_wylacznika),
            wylacznik="Q0",
            weryfikacja=_IN,
            uwaga=_UWAGA_KRYTERIUM_PRADOWE_IO,
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
        # Jedna funkcja SCO pola: stopnie SCO1, SCO2 wyłączają, obwód „SCO/SPZ" załącza po SCO
        # — trzy obwody okrężne do jednego sterownika pola (rysunek nie ma osobnego bloku
        # „SPZ po SCO"; `funkcje_eaz` — wpis SCO).
        PowiazanieFunkcjiEaz(
            funkcja="SCO",
            blok_rysunku="Sterownik pola",
            wejscia=[_sygnal("SCO1"), _sygnal("SCO2"), _sygnal("SCO/SPZ")],
            wyjscia=[*wyjscia_wylacznika, "ZW"],
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


#: Napędy łączników rysunku — te same na Z.10 (s.89), Z.11 (s.90) i Z.11.1 (s.91), odczyt
#: obrazów stron w 400 dpi 2026-10-30. Odłącznik z uziemieniem Q5 odgałęzienia przekładnika
#: napięciowego (Z.11, Z.11.1) znaku napędu na rysunku nie ma — napędu nie dostaje.
_NAPEDY_LACZNIKOW = [
    NapedAparatuPola(
        aparat="Q0",
        rodzaj_aparatu="CB",
        naped="SILNIKOWY",
        weryfikacja=_ZW,
        uwaga="okrąg z literą M na kreskowanym sprzężeniu mechanicznym przy wyłączniku",
    ),
    NapedAparatuPola(
        aparat="Q1",
        rodzaj_aparatu="THREE_POSITION_SWITCH",
        naped="ZASOBNIKOWY_RECZNY",
        weryfikacja=_ZW,
        uwaga=(
            "przy łączniku trójpołożeniowym kwadrat na kreskowanym sprzężeniu mechanicznym "
            "z nożem (kształt EN 60617 02-13-20 — napęd energią zmagazynowaną), od kwadratu "
            "w dół kreskowany odcinek zakończony poprzeczką (kształt EN 60617 02-13-01 — napęd "
            "ręczny, symbol ogólny); rodzaj napędu odczytany z kształtu znaku wg EN 60617, "
            "rysunek go nie opisuje słownie"
        ),
    ),
]


def _obwody_wykonania(wykonanie_pola: str) -> ObwodyWtornePola:
    if wykonanie_pola == "Z10":
        wyjscia = ["OW1", "OW2"]
        return ObwodyWtornePola(
            podstawa=f"{_Z1}, Z.10 s.89",
            napedy=_NAPEDY_LACZNIKOW,
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
        napedy=_NAPEDY_LACZNIKOW,
        powiazania=_powiazania_wspolne(rdzen, wyjscia, z_vt=True) + _powiazania_napieciowe(rdzen),
        sygnaly=_sygnaly(True, tuple(wyjscia)),
        obwody_przekladnikow=przypisania,
    )


#: Obwody wtórne wzorca wg wykonania pola liniowego GPZ (Z.10, Z.11.1, Z.11).
OBWODY_WTORNE_WYKONANIA_POLA: dict[str, ObwodyWtornePola] = {
    wykonanie: _obwody_wykonania(wykonanie) for wykonanie in ("Z10", "Z11_1", "Z11")
}


# ---------------------------------------------------------------------------
# Karta POLA-GPZ-SZABLONY: obwody wtórne pól GPZ spoza pola liniowego — ZWERYFIKOWANE ZE
# ŹRÓDŁEM: obraz strony PDF Zeszytu 1 (wersja 02.2023 – 2, SHA-256 467547d5…a862368b49b27c6ce
# 92f164ba488) w 200 dpi, wycinki 2026-11-05: Z.7 s.86, Z.12 s.92, Z.16 s.96. Status
# ``ZWERYFIKOWANE_NA_RYSUNKU`` — linia, strzałka albo napis widoczny na rysunku (kierunek sygnału
# = grot strzałki); ``INTERPRETACJA`` — tylko tam, gdzie rysunek relacji nie rysuje (uzasadnienie
# w ``uwaga``). Konwencja rysunku przyjęta jak na Z.10 (s.89): ukośny odcinek pionu bloku do
# linii OW/ZW = połączenie z tą linią; ukośne odgałęzienie linii przekładnika = rozgałęzienie
# tego samego obwodu; linia bez ukośnika przecina inną bez połączenia. Raport porównania:
# `docs/standards/ENEA_Z1_110KV_SOURCE_VERIFICATION.md`.
# ---------------------------------------------------------------------------

_UWAGA_NAPEDU_Q_TROJPOLOZENIOWEGO = (
    "przy łączniku trójpołożeniowym kwadrat na kreskowanym sprzężeniu mechanicznym z nożem "
    "(kształt EN 60617 02-13-20 — napęd energią zmagazynowaną), od kwadratu kreskowany odcinek "
    "zakończony poprzeczką (kształt EN 60617 02-13-01 — napęd ręczny) — ten sam znak co na Z.10 "
    "(s.89); rodzaj napędu odczytany z kształtu znaku wg EN 60617, rysunek go nie opisuje słownie"
)
#: Rdzeń zabezpieczeniowy wspólny dla bloków sterownika pola, do których rysunek nie prowadzi
#: osobnej linii prądowej (ZS, LRW) — ta sama konwencja co pole liniowe (Z.10).
_UWAGA_RDZEN_WSPOLNY = _UWAGA_WSPOLNE_WEJSCIE_PRADOWE


def _napedy_pola_gpz(
    rysunek: str, lacznik_trojpolozeniowy: tuple[str, ...]
) -> list[NapedAparatuPola]:
    return [
        NapedAparatuPola(
            aparat="Q0",
            rodzaj_aparatu="CB",
            naped="SILNIKOWY",
            weryfikacja=_ZW,
            uwaga=f"{rysunek}: okrąg z literą M sprzężony z nożem wyłącznika",
        ),
        *(
            NapedAparatuPola(
                aparat=oznaczenie,
                rodzaj_aparatu="THREE_POSITION_SWITCH",
                naped="ZASOBNIKOWY_RECZNY",
                weryfikacja=_ZW,
                uwaga=f"{rysunek}: {_UWAGA_NAPEDU_Q_TROJPOLOZENIOWEGO}",
            )
            for oznaczenie in lacznik_trojpolozeniowy
        ),
    ]


def _s(
    nazwa: str,
    kierunek: Literal["WEJSCIE", "WYJSCIE"],
    obwod: Literal["WYLACZNIK", "OKREZNY", "NADRZEDNY"],
    *,
    sterownik: bool = False,
    znaczenie: str | None = None,
    polaczony_z: tuple[str, ...] = (),
    weryfikacja: StatusWeryfikacji = _ZW,
    uwaga: str | None = None,
) -> SygnalPola:
    return SygnalPola(
        nazwa=nazwa,
        kierunek=kierunek,
        obwod=obwod,
        sterownik_pola=sterownik,
        znaczenie_pl=znaczenie,
        polaczony_z=list(polaczony_z),
        weryfikacja=weryfikacja,
        uwaga=uwaga,
    )


def _sygnaly_wspolne_gpz(wyjscia_wylacznika: tuple[str, ...]) -> list[SygnalPola]:
    """Sygnały wspólne rysunków Z.7, Z.12, Z.16 (Z.13–Z.15 — tak samo): obwody wyłącznika,
    zasilanie i łącza sterownika (górna krawędź), obwody okrężne „+AwUp, Up, Aw, Al"."""
    return [
        *(
            _s(
                nazwa,
                "WYJSCIE",
                "WYLACZNIK",
                sterownik=True,
                znaczenie=f"obwód wyłączający {nazwa[-1]} wyłącznika",
            )
            for nazwa in wyjscia_wylacznika
        ),
        _s(
            "ZW",
            "WYJSCIE",
            "WYLACZNIK",
            sterownik=True,
            znaczenie="polecenie załączenia wyłącznika",
        ),
        _s("Topologia", "WEJSCIE", "NADRZEDNY", sterownik=True),
        _s(
            "Zasilanie",
            "WEJSCIE",
            "NADRZEDNY",
            sterownik=True,
            znaczenie="napięcie pomocnicze sterownika (biegun dodatni i ujemny)",
        ),
        _s(
            "SSiN",
            "WYJSCIE",
            "NADRZEDNY",
            sterownik=True,
            znaczenie="łącze do systemu sterowania i nadzoru stacji",
            weryfikacja=_IN,
            uwaga="rozwinięcie skrótu wg terminologii ENEA, rysunek podaje sam skrót",
        ),
        _s("Łącze inżynierskie", "WYJSCIE", "NADRZEDNY", sterownik=True),
        _s("+AwUp", "WEJSCIE", "OKREZNY", sterownik=True),
        *(_s(nazwa, "WYJSCIE", "OKREZNY", sterownik=True) for nazwa in ("Up", "Aw", "Al")),
    ]


_UL_SEKCJI = "UL1, UL2, UL3, N"
_Z_ZZ_SEKCJI = "Z, Zz"


def _ul_sekcji(nazwa: str = _UL_SEKCJI, *, sterownik: bool = True) -> SygnalPola:
    return _s(
        nazwa,
        "WEJSCIE",
        "OKREZNY",
        sterownik=sterownik,
        znaczenie="napięcia fazowe szyn sekcji",
        uwaga="Z.17 (s.97) wyprowadza na ten obwód uzwojenie II przekładnika pola pomiaru "
        "napięcia sekcji",
    )


def _z_zz_sekcji() -> SygnalPola:
    return _s(
        _Z_ZZ_SEKCJI,
        "WEJSCIE",
        "OKREZNY",
        znaczenie="napięcie zerowe sieci z obwodu okrężnego (wejście U0 zabezpieczenia "
        "ziemnozwarciowego)",
        uwaga="Z.17 (s.97) wyprowadza na obwód „Z,Zz” uzwojenie III (otwarty trójkąt) "
        "przekładnika pola pomiaru napięcia sekcji",
    )


def _ziemnozwarciowe(
    rysunek: str, rdzen: int, wyjscia: tuple[str, ...]
) -> list[PowiazanieFunkcjiEaz]:
    """Blok „Zab. ziemnozw." ze znakiem kierunku (↦), linia rdzenia ``rdzen`` i obwodu „Z, Zz"
    — kierunkowe 67N widoczne na rysunku; kryterium prądowe 51N wydzielone jak na Z.10."""
    return [
        _zabezpieczenie(
            "51N",
            "Zab. ziemnozw. t1, t2 (kryterium prądowe Io)",
            [_ct("T1", rdzen)],
            wyjscia=wyjscia,
            weryfikacja=_IN,
            uwaga=f"{rysunek}: linia rdzenia {rdzen} do bloku „Zab. ziemnozw.” jest na rysunku; "
            "kryterium prądowe bez kierunku jako osobna funkcja (51N) — ta sama konwencja co "
            "pole liniowe Z.10 (decyzja właściciela 2026-10-29)",
        ),
        _zabezpieczenie(
            "67N",
            "Zab. ziemnozw. (kierunkowe) t1, t2",
            [_ct("T1", rdzen), _sygnal(_Z_ZZ_SEKCJI)],
            wyjscia=wyjscia,
            weryfikacja=_ZW,
        ),
    ]


def _zabezpieczenie(
    funkcja: str,
    blok: str,
    wejscia: list[WejscieFunkcjiEaz],
    *,
    wyjscia: tuple[str, ...] = ("OW1", "OW2"),
    wylacznik: str | None = "Q0",
    weryfikacja: StatusWeryfikacji = _ZW,
    uwaga: str | None = None,
) -> PowiazanieFunkcjiEaz:
    return PowiazanieFunkcjiEaz(
        funkcja=funkcja,
        blok_rysunku=blok,
        wejscia=wejscia,
        wyjscia=list(wyjscia),
        wylacznik=wylacznik,
        weryfikacja=weryfikacja,
        uwaga=uwaga,
    )


#: Z.7 s.86 — pole transformatora 110 kV/SN, strona SN. Blok sterownika: t1/I>, t2/I>>,
#: kolumna bez napisu (pion do OW1), ZS (t, Izs>>), LRW, „Sterownik pola”; poza sterownikiem
#: bloki „Zabezpieczenie różnicowe transformatora”, „Pomiary lokalne str. SN”, „ARN”, „Układ
#: pomiarowy bilansowo-kontrolny / Analizator jakości energii”. Piony t1, t2, ZS, LRW
#: i kolumny bez napisu łączą się (ukośnikiem) wyłącznie z OW1; OW2 zasila wprost wejście „OW2
#: od zabezpieczeń str. 110 kV”; ZW i OW1 — także sterownik pola.
_OBWODY_Z7 = ObwodyWtornePola(
    podstawa=f"{_Z1}, Z.7 s.86",
    napedy=_napedy_pola_gpz("Z.7 s.86", ("Q1",)),
    powiazania=[
        _zabezpieczenie("51", "I> t1", [_ct("T1", 4)], wyjscia=("OW1",)),
        _zabezpieczenie("50", "I>> t2", [_ct("T1", 4)], wyjscia=("OW1",)),
        _zabezpieczenie(
            "ZS",
            "ZS t Izs>>",
            [
                _ct("T1", 4, _IN, _UWAGA_RDZEN_WSPOLNY),
                _sygnal("Blokowanie ZS"),
                _sygnal("OW od ZS do łącznika szyn"),
            ],
            wyjscia=("OW1", "WZS", "Zadziałanie Izs>> od łącznika szyn"),
            uwaga=None,
        ),
        _zabezpieczenie("50BF", "LRW", [_sygnal("Pobudzenie LRW")], wyjscia=("OW1",)),
        _zabezpieczenie(
            "87T",
            "Zabezpieczenie różnicowe transformatora",
            [_ct("T1", 3)],
            wyjscia=("OW2",),
            weryfikacja=_IN,
            uwaga="rysunek prowadzi rdzeń III do bloku i nie rysuje jego wyjścia; wyłączenie Q0 "
            "obwodem OW2 przez wejście „OW2 od zabezpieczeń str. 110 kV” (blok zabezpieczenia "
            "różnicowego obejmuje obie strony transformatora, Z.6 s.85)",
        ),
        _zabezpieczenie(
            "90",
            "ARN",
            [
                _ct(
                    "T1",
                    2,
                    uwaga="rdzeń II (6 żył) do bloku „Pomiary lokalne str. SN”, z niego linia "
                    "do bloku ARN",
                ),
                _vt(
                    "T3",
                    3,
                    uwaga="uzwojenie III do bloku ARN; ukośne odgałęzienie tej samej linii "
                    "(4 żyły) do bloku „Sterownik pola”",
                ),
            ],
            wyjscia=("Regulacja zaczepów",),
            wylacznik=None,
            weryfikacja=_IN,
            uwaga="bloki i wejścia na rysunku; wyjścia bloku ARN (polecenia przełącznika zaczepów "
            "transformatora) rysunek nie rysuje",
        ),
    ],
    sygnaly=[
        *_sygnaly_wspolne_gpz(("OW1", "OW2")),
        _s(
            "Zadziałanie Izs>> od łącznika szyn",
            "WYJSCIE",
            "NADRZEDNY",
            uwaga="napis i grot strzałki jak na rysunku (grot od bloku ZS w górę); §26.9.9 — "
            "równoczesne pobudzenie IZS>> w polu TR i I> w polu łącznika szyn wyłącza łącznik "
            "szyn i blokuje SZR SN",
        ),
        _s(
            "OW od ZS do łącznika szyn",
            "WEJSCIE",
            "NADRZEDNY",
            uwaga="napis i grot strzałki jak na rysunku (grot w dół, do bloku ZS)",
        ),
        _s("Blokowanie SZR", "WYJSCIE", "NADRZEDNY", sterownik=True),
        _s("OW od SZR", "WEJSCIE", "NADRZEDNY", sterownik=True),
        _s("ZW od SZR", "WEJSCIE", "NADRZEDNY", sterownik=True),
        _s(
            "OW2 od zabezpieczeń str. 110 kV",
            "WEJSCIE",
            "NADRZEDNY",
            polaczony_z=("OW2",),
            uwaga="linia z górnej krawędzi wprost do obwodu OW2 wyłącznika, bez sterownika",
        ),
        _s("OW od zabezpieczeń str. 110 kV", "WEJSCIE", "NADRZEDNY", sterownik=True),
        _s("ZW sterownikiem str. 110 kV", "WEJSCIE", "NADRZEDNY", sterownik=True),
        _s("OW sterownikiem str. 110 kV", "WEJSCIE", "NADRZEDNY", sterownik=True),
        _s("Wyłączenie pól SN z generacją", "WYJSCIE", "NADRZEDNY", sterownik=True),
        _s(
            "Regulacja zaczepów",
            "WYJSCIE",
            "NADRZEDNY",
            znaczenie="polecenia regulatora napięcia do napędu przełącznika zaczepów",
            weryfikacja=_IN,
            uwaga="rysunek nie rysuje wyjścia bloku ARN; sygnał wprowadzony, bo regulator "
            "napięcia transformatora działa na przełącznik zaczepów",
        ),
        _s(
            "Pobudzenie LRW",
            "WEJSCIE",
            "OKREZNY",
            znaczenie="pobudzenie lokalnej rezerwy wyłącznikowej z pól rozdzielni",
        ),
        _s("WZS", "WYJSCIE", "OKREZNY", znaczenie="wyłączenie od zabezpieczenia szyn"),
        _s(
            "Blokowanie ZS",
            "WEJSCIE",
            "OKREZNY",
            znaczenie="blokowanie zabezpieczenia szyn od pobudzenia I> pól odpływowych (§26.9.9)",
        ),
    ],
    obwody_przekladnikow=[
        PrzypisanieObwoduPrzekladnika(
            aparat="T1",
            numer=1,
            odbiornik_pl="układ pomiarowy bilansowo-kontrolny",
            weryfikacja=_ZW,
        ),
        PrzypisanieObwoduPrzekladnika(
            aparat="T3",
            numer=1,
            odbiornik_pl="układ pomiarowy bilansowo-kontrolny, analizator jakości energii",
            weryfikacja=_ZW,
        ),
        PrzypisanieObwoduPrzekladnika(
            aparat="T3", numer=2, odbiornik_pl="pomiary lokalne strony SN", weryfikacja=_ZW
        ),
    ],
)

#: Z.12 s.92 — pole łącznika szyn SN. Rdzeń I → t1/I>, t2/I>>; rdzeń II → blok „Zab. ziemnozw.”
#: (t1, t2, znak kierunku) z obwodem „Z,Zz”; piony t1, t2 (I), bloku ziemnozwarciowego i LRW
#: łączą się z linią „OW1, OW2”, sterownik pola — z „OW1, OW2” i ZW.
_OBWODY_Z12 = ObwodyWtornePola(
    podstawa=f"{_Z1}, Z.12 s.92",
    napedy=_napedy_pola_gpz("Z.12 s.92", ("Q1", "Q2")),
    powiazania=[
        _zabezpieczenie("51", "I> t1", [_ct("T1", 1)]),
        _zabezpieczenie("50", "I>> t2", [_ct("T1", 1)]),
        *_ziemnozwarciowe("Z.12 s.92", 2, ("OW1", "OW2")),
        _zabezpieczenie(
            "ZS",
            "ZS",
            [_ct("T1", 1, _IN, _UWAGA_RDZEN_WSPOLNY)],
            wyjscia=("Blokowanie ZS",),
            wylacznik=None,
        ),
        _zabezpieczenie(
            "50BF",
            "LRW",
            [_ct("T1", 1, _IN, _UWAGA_RDZEN_WSPOLNY)],
            wyjscia=("OW1", "OW2", "Pobudzenie LRW"),
        ),
    ],
    sygnaly=[
        *_sygnaly_wspolne_gpz(("OW1", "OW2")),
        _ul_sekcji(),
        _z_zz_sekcji(),
        _s(
            "Pobudzenie LRW",
            "WYJSCIE",
            "OKREZNY",
            znaczenie="pobudzenie lokalnej rezerwy wyłącznikowej rozdzielni",
        ),
        _s(
            "Blokowanie ZS",
            "WYJSCIE",
            "OKREZNY",
            znaczenie="sygnał blokowania logicznego zabezpieczenia szyn",
        ),
    ],
)

#: Z.16 s.96 — pole baterii kondensatorów równoległych SN. Rdzeń I (8 żył) → układ pomiarowy
#: bilansowo-kontrolny; rdzeń II → t1/I>, t2/I>>; rdzeń III → „Zab. ziemnozw.” (znak kierunku)
#: z „Z,Zz”; przekładnik niezrównoważenia (punkty gwiazd) → Ir>; obwód „UL1,UL2,UL3,N, Pom.en.”
#: → U> i układ pomiarowy. Przekładniki międzyfazowe L1-L2, L2-L3 (SN/0,1 kl. 3P) nie mają linii
#: do sterownika — rozładowanie baterii (§17). Piony I>, I>>, t1, t2, Ir> (szara), ZS (szara),
#: LRW (szara), kolumny bez napisu i sterownika łączą się z „OW1, OW2”; bloku U> — nie.
_OBWODY_Z16 = ObwodyWtornePola(
    podstawa=f"{_Z1}, Z.16 s.96",
    napedy=_napedy_pola_gpz("Z.16 s.96", ("Q1",)),
    powiazania=[
        _zabezpieczenie("51", "I> t1", [_ct("T1", 2)]),
        _zabezpieczenie("50", "I>> t2", [_ct("T1", 2)]),
        *_ziemnozwarciowe("Z.16 s.96", 3, ("OW1", "OW2")),
        _zabezpieczenie(
            "60N",
            "Ir>",
            [
                WejscieFunkcjiEaz(
                    rodzaj="PRZEKLADNIK_NIEZROWNOWAZENIA", aparat="T6", weryfikacja=_ZW
                )
            ],
        ),
        _zabezpieczenie(
            "59",
            "U>",
            [_sygnal("UL1, UL2, UL3, N, Pom. en.")],
            weryfikacja=_IN,
            uwaga="wejście U> z obwodu okrężnego „UL1,UL2,UL3,N, Pom.en.” jest na rysunku; pion "
            "bloku U> do linii „OW1, OW2” na rysunku nie dochodzi — wyłączenie baterii przez "
            "zabezpieczenie nadnapięciowe U>T to treść §26.9.7",
        ),
        _zabezpieczenie(
            "ZS",
            "ZS",
            [_ct("T1", 2, _IN, _UWAGA_RDZEN_WSPOLNY)],
            wyjscia=("OW1", "OW2", "Blokowanie ZS"),
        ),
        _zabezpieczenie(
            "50BF",
            "LRW",
            [_ct("T1", 2, _IN, _UWAGA_RDZEN_WSPOLNY)],
            wyjscia=("OW1", "OW2", "Pobudzenie LRW"),
        ),
    ],
    sygnaly=[
        *_sygnaly_wspolne_gpz(("OW1", "OW2")),
        _s("Sterowanie zegarem", "WEJSCIE", "NADRZEDNY", sterownik=True),
        _s(
            "Wył. od zab. TR",
            "WEJSCIE",
            "OKREZNY",
            znaczenie="wyłączenie od zabezpieczeń transformatora",
            polaczony_z=("OW1", "OW2"),
            uwaga="linia obwodu okrężnego wprost do linii „OW1, OW2” (szara), bez sterownika",
        ),
        _ul_sekcji("UL1, UL2, UL3, N, Pom. en.", sterownik=False),
        _z_zz_sekcji(),
        _s(
            "Pobudzenie LRW",
            "WYJSCIE",
            "OKREZNY",
            znaczenie="pobudzenie lokalnej rezerwy wyłącznikowej rozdzielni",
        ),
        _s(
            "Blokowanie ZS",
            "WYJSCIE",
            "OKREZNY",
            znaczenie="sygnał blokowania logicznego zabezpieczenia szyn",
        ),
    ],
    obwody_przekladnikow=[
        PrzypisanieObwoduPrzekladnika(
            aparat="T1",
            numer=1,
            odbiornik_pl="układ pomiarowy bilansowo-kontrolny (z napięciem obwodu „UL1,UL2,UL3,N, "
            "Pom.en.”)",
            weryfikacja=_ZW,
        ),
    ],
)

#: Obwody wtórne wzorców pól GPZ spoza pola liniowego (klucz = rysunek Zeszytu 1).
OBWODY_WTORNE_POL_GPZ: dict[str, ObwodyWtornePola] = {
    "Z7": _OBWODY_Z7,
    "Z12": _OBWODY_Z12,
    "Z16": _OBWODY_Z16,
}

#: Pola rekordu aparatu pola wyprowadzane z obwodów wtórnych wzorca (`powiazania_aparatow_pola`).
POLA_POWIAZAN_APARATU = ("naped", "funkcje_eaz_zasilane", "funkcje_eaz_wylaczajace")


def powiazania_aparatow_pola(
    aparaty: Sequence[Mapping[str, Any]],
    obwody: ObwodyWtornePola | None,
    funkcje_pola: Collection[str],
) -> list[dict[str, Any]]:
    """Powiązania obwodów wtórnych wzorca przeniesione na rekordy aparatów pola (nowe słowniki).

    Reguła ta sama co odczyt pola (`enm.pole_liniowe_gpz._obwody_funkcji`): wejście funkcji
    wskazuje aparat pola po OZNACZENIU i RODZAJU (`RODZAJ_APARATU_WEJSCIA`), wyłącznik
    wykonawczy — wyłącznik (`CB`) o oznaczeniu `PowiazanieFunkcjiEaz.wylacznik`. Wynik:

    * ``funkcje_eaz_zasilane`` — przekładnik (CT, VT, Ferrantiego): kody funkcji, które z niego
      mierzą (kolejność powiązań wzorca, bez powtórzeń);
    * ``funkcje_eaz_wylaczajace`` — wyłącznik: kody funkcji, które na niego działają;
    * ``naped`` — łącznik, przy którym rysunek stawia znak napędu (`ObwodyWtornePola.napedy`),
      po oznaczeniu i rodzaju aparatu — niezależnie od zestawu funkcji pola (napęd jest
      atrybutem łącznika, nie powiązaniem funkcji).

    Funkcje przenoszone są WYŁĄCZNIE dla powiązań funkcji, które pole ma (`funkcje_pola` =
    `Bay.protection_codes`): zestaw pola liniowego jest korygowany klasą pola (IRiESD
    II.4.5.4.2 — bez SCO w polu z generacją, bez SPZ w polu dedykowanym wytwórcy,
    `bay_templates.funkcje_eaz_pola_liniowego`), a funkcja, której pole nie ma, nie mierzy
    z przekładnika i nie działa na wyłącznik. Jedno źródło zestawu funkcji dla przekaźnika
    pola na rysunku i powiązań aparatów (predykat parami).

    Aparat, którego wzorzec nie wiąże (inne oznaczenie, inny rodzaj, pole bez obwodów
    wzorca), tych pól nie dostaje — dawne wartości są zdejmowane, więc ponowne wyposażenie
    pola nie zostawia powiązań aparatu, którego wzorzec już nie wiąże."""
    wynik = [{k: v for k, v in a.items() if k not in POLA_POWIAZAN_APARATU} for a in aparaty]
    if obwody is None:
        return wynik
    po_oznaczeniu: dict[str, list[dict[str, Any]]] = {}
    for aparat in wynik:
        oznaczenie = aparat.get("designation")
        if isinstance(oznaczenie, str) and oznaczenie:
            po_oznaczeniu.setdefault(oznaczenie, []).append(aparat)

    def _dopisz(aparat: dict[str, Any], klucz: str, kod: str) -> None:
        lista = aparat.setdefault(klucz, [])
        if kod not in lista:
            lista.append(kod)

    for naped in obwody.napedy:
        for aparat in po_oznaczeniu.get(naped.aparat, []):
            if aparat.get("kind") == naped.rodzaj_aparatu:
                aparat["naped"] = naped.naped
    obecne = set(funkcje_pola)
    for p in obwody.powiazania:
        if p.funkcja not in obecne:
            continue
        if p.wylacznik is not None:
            for aparat in po_oznaczeniu.get(p.wylacznik, []):
                if aparat.get("kind") == "CB":
                    _dopisz(aparat, "funkcje_eaz_wylaczajace", p.funkcja)
        for w in p.wejscia:
            if w.aparat is None:
                continue
            for aparat in po_oznaczeniu.get(w.aparat, []):
                if aparat.get("kind") == RODZAJ_APARATU_WEJSCIA[w.rodzaj]:
                    _dopisz(aparat, "funkcje_eaz_zasilane", p.funkcja)
    return wynik
