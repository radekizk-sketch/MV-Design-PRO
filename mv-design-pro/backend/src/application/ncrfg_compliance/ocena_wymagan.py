"""Ocena zgodności NC RfG per wymaganie — rekordy ``WynikWymagania`` (karta AB-1a Pakiet C).

Wejście: wynik solvera PTPiREE modułu (rekordy ``OcenaKryterium`` testów), wejście modułu
(nastawy zabezpieczeń, status art. 4), profil regulacyjny operatora, dowód certyfikatu
wyprowadzony przez serwer (``DowodCertyfikatu`` — w wyniku modułu) i źródło danych biegu.
Wyjście: dla KAŻDEGO wymagania profilu (wszystkie warstwy, kolejność profilu) jeden rekord W
zbudowany ``werdykt.decyzja.zagreguj_wymaganie`` — status, kompletność dowodu, etykietę i
wyjaśnienie liczy ``werdykt``; ten moduł dobiera składniki, sposób wykazania i podstawy.

SPOSÓB WYKAZANIA (predykat profilu ``WymaganieRegulacyjne.sposob_wykazania`` przez
``stosowalnosc.sposob_wykazania_wymagania`` — ten sam, który czyta solver):

* ``TEST`` → ``DOWOD_LACZONY``: składowe = rekordy K testów z ``wymaganie.testy`` + kryteria
  koordynacji statycznej nastaw (O-32) przypisane do wymagania;
* ``CERTYFIKAT`` → ``CERTYFIKAT``: składowa = kryterium „certyfikat z wykazu obejmuje typ
  modułu" (metoda ``CERTYFIKAT``) + kryteria koordynacji; podstawa reguły sposobu wykazania =
  reguła pokrycia z warstwy WiPWC (``pokrycie_zrodlo``) — przy stanie ``NIEUSTALONE`` dowód jest
  niepełny, więc sam certyfikat daje ``BRAK_DOWODU``, nigdy ``SPELNIA`` (plan AB O-17);
* ``BRAK_METODY`` → ``BRAK_METODY``: kryteria koordynacji (gdy są) jako składowe INFORMACYJNE,
  brak nazywa metodę właściwą (certyfikat albo raport z badania typu) i powód odrzucenia
  tabliczki, gdy serwer odrzucił certyfikat;
* wymaganie niestosowalne → ``NIE_DOTYCZY`` bez składowych.

STOSOWALNOŚĆ — ``stosowalnosc.stosowalnosc_wymagania`` (typ × technologia × moduł istniejący ×
prawo operatora). Prawo operatora nieustalone (``operator_skorzystal_z_prawa is None``):
wymaganie oceniane jako obowiązujące, a podstawa wymagania jest podmieniona na podstawę
wykonania prawa w warstwie OSD (stan ``NIEUSTALONE``) — dowód niepełny, brak nazywa dokument
operatora.

POKRYCIE PROGRAMU BADAŃ (O-30): wymaganie wykazywane składową o zachowaniu dynamicznym →
``CZESCIOWE`` z opisem programu badań profilu (``SPELNIA`` nieosiągalne); wykazywane porównaniem
konfiguracji, certyfikatem albo bez metody → ``NIE_DOTYCZY``.

Warstwa APPLICATION: zero fizyki, zero własnej logiki statusu i tekstu werdyktu.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from catalog.profiles.nc_rfg import (
    KlasyfikacjaModulu,
    NcRfgProfile,
    Technologia,
    WymaganieRegulacyjne,
    load_nc_rfg_profile,
)
from network_model.solvers.ncrfg_ptpiree.contracts import (
    DowodCertyfikatu,
    NcRfgPtpireeModuleInput,
    NcRfgPtpireeModuleResult,
    NcRfgPtpireeRunRequest,
    NcRfgPtpireeRunResult,
    ZrodloDanych,
)
from network_model.solvers.ncrfg_ptpiree.engine import TEST_CATALOG
from network_model.solvers.ncrfg_ptpiree.stosowalnosc import (
    NAZWA_TECHNOLOGII_PL,
    sposob_wykazania_wymagania,
    stosowalnosc_wymagania,
)
from pydantic import BaseModel, ConfigDict
from solver_input.provenance import classify_dynamic_capability
from werdykt import (
    DanaPrzyjeta,
    Kryterium,
    LimitKryterium,
    MetodaDowodu,
    Niepewnosc,
    OcenaKryterium,
    OdnosnikSladu,
    PodstawaWymagania,
    PokrycieProgramu,
    Przedmiot,
    PunktObwiedni,
    StatusDanych,
    StatusDowodu,
    Stosowalnosc,
    Wielkosc,
    WynikKryterium,
    WynikWymagania,
    ZakresWaznosci,
    format_liczba,
    ocen_kryterium,
    zagreguj_wymaganie,
)
from werdykt.proweniencja import ClaimKind, EvidenceTier
from werdykt.wyjasnienie import NAZWA_STANU_ZRODLA_PL

#: Kryteria koordynacji statycznej nastaw (plan AB O-32) przypisane do wymagań profilu.
#: Przypięte testem: każdy identyfikator wymagania istnieje w katalogu wymagań profilu.
KRYTERIA_KOORDYNACJI: Mapping[str, tuple[str, ...]] = {
    "RFG_14_3": ("frt.koordynacja_nastaw_u_min",),
    "RFG_13_1B": ("rocof.koordynacja_nastaw_lom",),
}
_ZDOLNOSC_KOORDYNACJI = "ncrfg_ptpiree.koordynacja_nastaw"
_ZDOLNOSC_CERTYFIKATU = "ncrfg_ptpiree.certyfikat_urzadzenia"
#: Kolejność poziomów dowodowych od najmocniejszego (najsłabszy składnik wyznacza dowód łączony).
_KOLEJNOSC_POZIOMOW: tuple[EvidenceTier, ...] = (
    EvidenceTier.VALIDATED_SIMULATION,
    EvidenceTier.TYPE_TEST_CERTIFICATE,
    EvidenceTier.DECLARATION,
    EvidenceTier.UNVALIDATED_MODEL,
    EvidenceTier.NOT_SIMULATED,
)
_J_U = "p.u. (U_n)"
_WYKLUCZENIE_DYNAMIKI = "zachowanie dynamiczne"
_POWOD_DANEJ_KLIENTA = "wartość z żądania klienta — bez walidacji w modelu"
_NIEPEWNOSC_DEKLARACJI = Niepewnosc(
    nie_dotyczy=True,
    powod_pl="porównanie wartości zadeklarowanych — niepewność numeryczna nie dotyczy",
)
_NIEPEWNOSC_CERTYFIKATU = Niepewnosc(
    nie_dotyczy=True,
    powod_pl="dowód z certyfikatu urządzenia — niepewność numeryczna nie dotyczy",
)

_RODZAJE_TESTOW: dict[str, ClaimKind] = {d.test_id: d.rodzaj_twierdzenia for d in TEST_CATALOG}


class OcenaWymaganModulu(BaseModel):
    """Rekordy ``WynikWymagania`` jednego modułu — kolejność wymagań = kolejność profilu."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    der_ref: str
    der_name: str | None
    klasyfikacja: KlasyfikacjaModulu
    technologia: Technologia
    zrodlo_danych: ZrodloDanych
    wymagania: tuple[WynikWymagania, ...]


def rodzaj_twierdzenia_wymagania(wymaganie: WymaganieRegulacyjne) -> ClaimKind:
    """Rodzaj twierdzenia wymagania: zachowanie dynamiczne, gdy którykolwiek test wymagania
    wspiera twierdzenie dynamiczne ALBO wymaganie nie ma testu (surowsze odczytanie — wymagania
    bez metody w narzędziu dotyczą zachowania modułu); inaczej konfiguracja zadeklarowana."""
    rodzaje = [_RODZAJE_TESTOW[t] for t in wymaganie.testy]
    if not rodzaje or ClaimKind.DYNAMIC_PERFORMANCE in rodzaje:
        return ClaimKind.DYNAMIC_PERFORMANCE
    return ClaimKind.DECLARED_CONFIGURATION


def _dane_klasyfikacji(modul: NcRfgPtpireeModuleInput) -> list[DanaPrzyjeta]:
    """Dane żądania klienta, z których wyznaczono klasę i stosowalność (te same co w testach)."""
    return [
        DanaPrzyjeta(
            nazwa_pl="moc maksymalna modułu (p_max_kw)",
            wartosc=Wielkosc(wartosc=modul.p_max_kw, jednostka="kW"),
            powod_pl=_POWOD_DANEJ_KLIENTA,
            jakosc=None,
        ),
        DanaPrzyjeta(
            nazwa_pl="napięcie przyłączenia modułu (voltage_kv)",
            wartosc=Wielkosc(wartosc=modul.voltage_kv, jednostka="kV"),
            powod_pl=_POWOD_DANEJ_KLIENTA,
            jakosc=None,
        ),
    ]


def _status_danych(dane: Sequence[DanaPrzyjeta]) -> StatusDanych:
    unikalne = tuple(dict.fromkeys(dane))
    if not unikalne:
        return StatusDanych(stan="ZWALIDOWANE")
    return StatusDanych(stan="UNVALIDATED_INPUT", dane_przyjete=unikalne)


class _OcenaModulu:
    """Kontekst oceny wymagań jednego modułu (profil, klasyfikacja, dane, testy)."""

    def __init__(
        self,
        modul: NcRfgPtpireeModuleInput,
        wynik: NcRfgPtpireeModuleResult,
        *,
        input_hash: str,
        certyfikat_odrzucony_pl: str | None,
    ) -> None:
        if modul.der_ref != wynik.der_ref:
            raise ValueError(
                f"Wejście modułu {modul.der_ref} nie odpowiada wynikowi modułu {wynik.der_ref}."
            )
        self.modul = modul
        self.wynik = wynik
        self.profile: NcRfgProfile = load_nc_rfg_profile(modul.operator_id)
        self.klasyfikacja = wynik.klasyfikacja
        self.technologia = wynik.technologia
        self.certyfikat: DowodCertyfikatu | None = wynik.dowod_certyfikatu
        self.certyfikat_odrzucony_pl = certyfikat_odrzucony_pl
        self.klient = wynik.zrodlo_danych == "ZADANIE_KLIENTA"
        self.input_hash = input_hash
        self.testy: dict[str, OcenaKryterium] = {t.test_id: t.ocena for t in wynik.tests}
        self.przedmiot: Przedmiot = wynik.tests[0].ocena.przedmiot

    # ------------------------------------------------------------------
    # Składowe spoza testów: certyfikat i koordynacja nastaw (O-32)
    # ------------------------------------------------------------------

    def _status_danych_skladowej(self, dane: Sequence[DanaPrzyjeta]) -> StatusDanych:
        wszystkie = [*(_dane_klasyfikacji(self.modul) if self.klient else []), *dane]
        return _status_danych(wszystkie)

    def _dana(self, nazwa: str, wartosc: Wielkosc) -> list[DanaPrzyjeta]:
        if not self.klient:
            return []
        return [
            DanaPrzyjeta(
                nazwa_pl=nazwa, wartosc=wartosc, powod_pl=_POWOD_DANEJ_KLIENTA, jakosc=None
            )
        ]

    def _zakres(self, opis: str, wykluczenia: tuple[str, ...]) -> ZakresWaznosci:
        return ZakresWaznosci(
            opis_pl=opis,
            technologia=NAZWA_TECHNOLOGII_PL[self.technologia],
            wykluczenia=wykluczenia,
        )

    def _skladowa_certyfikatu(
        self, wymaganie: WymaganieRegulacyjne, stosowalnosc: Stosowalnosc
    ) -> OcenaKryterium:
        dowod = self.certyfikat
        if dowod is None:
            raise ValueError("Składowa certyfikatu bez dowodu certyfikatu.")
        dane: list[DanaPrzyjeta] = []
        if dowod.warunek_waznosci is not None:
            dane.append(
                DanaPrzyjeta(
                    nazwa_pl=f"spełnienie warunku ważności certyfikatu: {dowod.warunek_waznosci}",
                    wartosc=None,
                    powod_pl=(
                        "warunek ważności z rekordu wykazu PTPiREE — jego spełnienie w instalacji "
                        "nie jest potwierdzone w modelu"
                    ),
                    jakosc=None,
                )
            )
        return ocen_kryterium(
            kryterium_id="certyfikat.pokrycie_wymagania",
            przedmiot=self.przedmiot,
            kryterium=Kryterium(
                opis_pl=(
                    "Certyfikat urządzenia z wykazu PTPiREE obejmuje typ modułu (reguła pokrycia "
                    "wymagania certyfikatem — warstwa WiPWC)"
                ),
                warunek_latex=r"\text{typ modułu} \in \text{zakres typów rekordu wykazu}",
                relacja="LOGICZNE",
            ),
            podstawa=wymaganie.zrodlo,
            stosowalnosc=stosowalnosc,
            wynik=WynikKryterium(
                wielkosc_pl="certyfikat urządzenia z wykazu PTPiREE",
                symbol_latex="",
                wartosc=Wielkosc(
                    wartosc=float(dowod.pokrywa(self.klasyfikacja.modul)), jednostka="1"
                ),
                punkt_krytyczny_pl=(
                    f"rekord wykazu {dowod.rekord_id}: {dowod.producent} {dowod.model}, "
                    f"dokument {dowod.numer_dokumentu}, zakres typów "
                    f"{', '.join(dowod.zakres_typow) or 'pusty'}, WiPWC {dowod.wersja_wipwc}"
                ),
                metoda="CERTYFIKAT",
            ),
            limit=None,
            niepewnosc=_NIEPEWNOSC_CERTYFIKATU,
            dowod=StatusDowodu(
                metoda="CERTYFIKAT",
                poziom=classify_dynamic_capability(_ZDOLNOSC_CERTYFIKATU).tier,
                rodzaj_twierdzenia=rodzaj_twierdzenia_wymagania(wymaganie),
                status_modelu="NIE_DOTYCZY",
                status_danych=_status_danych(dane),
                odniesienie=f"dokument {dowod.numer_dokumentu} (rekord wykazu {dowod.rekord_id})",
            ),
            zakres_waznosci=self._zakres(
                "certyfikat urządzenia z wykazu PTPiREE — zakres typów modułów rekordu wykazu",
                (),
            ),
            slad=[
                OdnosnikSladu(
                    krok=f"wykaz-ptpiree:{dowod.rekord_id}",
                    opis_pl=(
                        "rekord wykazu certyfikowanych urządzeń PTPiREE dopasowany po stronie "
                        "serwera do tabliczki urządzenia"
                    ),
                )
            ],
        )

    def _koordynacja_u_min(
        self, wymaganie: WymaganieRegulacyjne, stosowalnosc: Stosowalnosc
    ) -> OcenaKryterium:
        """``frt.koordynacja_nastaw_u_min``: punkt (czas, napięcie) nastawy U< modułu nie może
        leżeć powyżej obwiedni LVRT profilu — inaczej zabezpieczenie zadziała przy napięciu, przy
        którym moduł ma obowiązek pozostać w pracy (limit działa jak obwiednia górna nastawy)."""
        poziomy = self.profile.voltage_levels
        punkty = poziomy.lvrt
        koniec = punkty[-1].time_s
        nastawy = self.modul.nastawy_zabezpieczen_modulu
        wynik: WynikKryterium | None = None
        braki: list[str] = []
        dane: list[DanaPrzyjeta] = []
        if nastawy is None or nastawy.u_min_pu is None or nastawy.u_min_czas_s is None:
            braki.append(
                "nastawa zabezpieczenia podnapięciowego U< i jej czas zadziałania w modelu (pole "
                "nastawy_zabezpieczen: u_min_pu, u_min_czas_s)"
            )
        else:
            chwila = min(nastawy.u_min_czas_s, koniec)
            punkt = (
                f"nastawa U< = {format_liczba(nastawy.u_min_pu)} {_J_U} z czasem "
                f"{format_liczba(nastawy.u_min_czas_s)} s (źródło nastaw: {nastawy.zrodlo_pl})"
            )
            if nastawy.u_min_czas_s > koniec:
                punkt += (
                    f"; czas nastawy poza przedziałem obwiedni — oceniono w chwili końca obwiedni "
                    f"t = {format_liczba(koniec)} s"
                )
            wynik = WynikKryterium(
                wielkosc_pl="nastawa zabezpieczenia podnapięciowego U< modułu",
                symbol_latex=r"U_{<}",
                wartosc=Wielkosc(wartosc=nastawy.u_min_pu, jednostka=_J_U),
                punkt_krytyczny_pl=punkt,
                chwila_s=chwila,
                metoda="DEKLARACJA",
            )
            dane = [
                *self._dana(
                    "nastawa U< modułu (u_min_pu)",
                    Wielkosc(wartosc=nastawy.u_min_pu, jednostka=_J_U),
                ),
                *self._dana(
                    "czas nastawy U< modułu (u_min_czas_s)",
                    Wielkosc(wartosc=nastawy.u_min_czas_s, jednostka="s"),
                ),
            ]
        return ocen_kryterium(
            kryterium_id="frt.koordynacja_nastaw_u_min",
            przedmiot=self.przedmiot,
            kryterium=Kryterium(
                opis_pl=(
                    "Koordynacja nastawy zabezpieczenia podnapięciowego U< modułu z obwiednią "
                    "LVRT: punkt nastawy (czas, napięcie) nie powyżej obwiedni"
                ),
                warunek_latex=r"U_{<} \le U_{\mathrm{LVRT}}\left(t_{<}\right)",
                relacja="OBWIEDNIA_GORNA",
            ),
            podstawa=wymaganie.zrodlo,
            stosowalnosc=stosowalnosc,
            wynik=wynik,
            limit=LimitKryterium(
                obwiednia=tuple(PunktObwiedni(t_s=p.time_s, wartosc=p.voltage_pu) for p in punkty),
                jednostka_obwiedni=_J_U,
                podstawa=poziomy.lvrt_zrodlo,
                zakres_stosowalnosci_pl=f"obwiednia LVRT modułów typu {', '.join(poziomy.lvrt_typy)}",
                wersja_profilu=self.profile.wersja_profilu,
            ),
            niepewnosc=_NIEPEWNOSC_DEKLARACJI,
            dowod=StatusDowodu(
                metoda="DEKLARACJA",
                poziom=classify_dynamic_capability(_ZDOLNOSC_KOORDYNACJI).tier,
                rodzaj_twierdzenia=ClaimKind.DECLARED_CONFIGURATION,
                status_modelu="NIE_DOTYCZY",
                status_danych=self._status_danych_skladowej(dane),
                odniesienie=f"bieg {self.input_hash}",
            ),
            zakres_waznosci=self._zakres(
                "porównanie nastaw zabezpieczeń modułu zapisanych w modelu z obwiednią profilu "
                "(zabezpieczenie o charakterystyce czasowo niezależnej) — nie wykazuje zachowania "
                "dynamicznego",
                (_WYKLUCZENIE_DYNAMIKI,),
            ),
            slad=[
                OdnosnikSladu(
                    krok="koordynacja:frt.koordynacja_nastaw_u_min",
                    opis_pl="nastawa U< modułu z modelu wobec obwiedni LVRT profilu",
                )
            ],
            braki_dodatkowe=braki,
        )

    def _koordynacja_rocof(
        self, wymaganie: WymaganieRegulacyjne, stosowalnosc: Stosowalnosc
    ) -> OcenaKryterium:
        """``rocof.koordynacja_nastaw_lom``: nastawa RoCoF (LoM) modułu nie niższa niż
        wymagana wytrzymałość RoCoF — profil nie niesie tej wartości, więc limit nie istnieje
        (brak podstawy nazwany: wartość krajowa i Bank Nastaw operatora)."""
        bank = self.profile.bank_nastaw
        nastawy = self.modul.nastawy_zabezpieczen_modulu
        wynik: WynikKryterium | None = None
        dane: list[DanaPrzyjeta] = []
        braki: list[str] = []
        if nastawy is None or nastawy.rocof_hz_s is None:
            braki.append(
                "nastawa zabezpieczenia RoCoF (LoM) modułu w modelu (pole nastawy_zabezpieczen: "
                "rocof_hz_s)"
            )
        else:
            wartosc = Wielkosc(wartosc=nastawy.rocof_hz_s, jednostka="Hz/s")
            wynik = WynikKryterium(
                wielkosc_pl="nastawa zabezpieczenia RoCoF (LoM) modułu",
                symbol_latex=r"\left(\frac{df}{dt}\right)_{\mathrm{nast}}",
                wartosc=wartosc,
                punkt_krytyczny_pl=f"źródło nastaw: {nastawy.zrodlo_pl}",
                metoda="DEKLARACJA",
            )
            dane = self._dana("nastawa RoCoF modułu (rocof_hz_s)", wartosc)
        braki.append(
            f"wytrzymałość RoCoF modułu ({wymaganie.zrodlo.jednostka_redakcyjna} "
            "rozporządzenia 2016/631) — wartość krajowa WOS albo IRiESD: profil nie niesie tej "
            f"wartości (Bank Nastaw operatora {self.profile.operator_name_pl}: stan źródła "
            f"„{NAZWA_STANU_ZRODLA_PL[bank.status]}”"
            + (f" — {bank.uwagi_pl}" if bank.uwagi_pl else "")
            + ")"
        )
        return ocen_kryterium(
            kryterium_id="rocof.koordynacja_nastaw_lom",
            przedmiot=self.przedmiot,
            kryterium=Kryterium(
                opis_pl=(
                    "Koordynacja nastawy zabezpieczenia RoCoF (LoM) modułu z wymaganą "
                    "wytrzymałością RoCoF: nastawa nie niższa niż wytrzymałość"
                ),
                warunek_latex=(
                    r"\left(\frac{df}{dt}\right)_{\mathrm{nast}} \ge "
                    r"\left(\frac{df}{dt}\right)_{\mathrm{wytrz}}"
                ),
                relacja="NIE_MNIEJ",
            ),
            podstawa=wymaganie.zrodlo,
            stosowalnosc=stosowalnosc,
            wynik=wynik,
            limit=None,
            niepewnosc=_NIEPEWNOSC_DEKLARACJI,
            dowod=StatusDowodu(
                metoda="DEKLARACJA",
                poziom=classify_dynamic_capability(_ZDOLNOSC_KOORDYNACJI).tier,
                rodzaj_twierdzenia=ClaimKind.DECLARED_CONFIGURATION,
                status_modelu="NIE_DOTYCZY",
                status_danych=self._status_danych_skladowej(dane),
                odniesienie=f"bieg {self.input_hash}",
            ),
            zakres_waznosci=self._zakres(
                "porównanie nastawy zabezpieczenia modułu z wymaganą wytrzymałością RoCoF — nie "
                "wykazuje zachowania dynamicznego",
                (_WYKLUCZENIE_DYNAMIKI,),
            ),
            slad=[
                OdnosnikSladu(
                    krok="koordynacja:rocof.koordynacja_nastaw_lom",
                    opis_pl="nastawa RoCoF modułu z modelu wobec wytrzymałości RoCoF profilu",
                )
            ],
            braki_dodatkowe=braki,
        )

    def _koordynacja(
        self, wymaganie: WymaganieRegulacyjne, stosowalnosc: Stosowalnosc
    ) -> list[OcenaKryterium]:
        budowniczowie = {
            "frt.koordynacja_nastaw_u_min": self._koordynacja_u_min,
            "rocof.koordynacja_nastaw_lom": self._koordynacja_rocof,
        }
        return [
            budowniczowie[kryterium_id](wymaganie, stosowalnosc)
            for kryterium_id in KRYTERIA_KOORDYNACJI.get(wymaganie.id, ())
        ]

    # ------------------------------------------------------------------
    # Rekord W
    # ------------------------------------------------------------------

    def _podstawa_wymagania(
        self, wymaganie: WymaganieRegulacyjne, stosowalnosc: Stosowalnosc
    ) -> tuple[PodstawaWymagania, list[str]]:
        """Podstawa wymagania; przy prawie operatora nieustalonym — podstawa wykonania prawa
        (warstwa OSD, stan ``NIEUSTALONE``) z nazwanym dokumentem operatora."""
        zrodlo_prawa = wymaganie.wykonanie_prawa_zrodlo
        if not (
            stosowalnosc.dotyczy
            and wymaganie.prawo_operatora
            and wymaganie.operator_skorzystal_z_prawa is None
            and zrodlo_prawa is not None
        ):
            return wymaganie.zrodlo, []
        jednostka = wymaganie.zrodlo.jednostka_redakcyjna or wymaganie.id
        dane = zrodlo_prawa.model_dump()
        dane["uwagi_pl"] = "; ".join(
            u
            for u in (
                zrodlo_prawa.uwagi_pl,
                f"prawo operatora do określenia wymagania ({jednostka} rozporządzenia "
                "2016/631) — wykonanie nieustalone",
            )
            if u
        )
        return PodstawaWymagania.model_validate(dane), [
            f"IRiESD albo warunki przyłączenia operatora {self.profile.operator_name_pl}: "
            f"rozstrzygnięcie, czy operator określił wymaganie {jednostka}"
        ]

    def _dowod_wymagania(
        self,
        wymaganie: WymaganieRegulacyjne,
        metoda: MetodaDowodu,
        skladowe: Sequence[OcenaKryterium],
    ) -> StatusDowodu:
        stosowalne = [o for o in skladowe if o.status_maszynowy != "NIE_DOTYCZY"]
        dane = [
            *(_dane_klasyfikacji(self.modul) if self.klient else []),
            *(d for o in stosowalne for d in o.dowod.status_danych.dane_przyjete),
        ]
        if metoda == "DOWOD_LACZONY":
            poziomy = [o.dowod.poziom for o in stosowalne] or [EvidenceTier.NOT_SIMULATED]
            poziom = max(poziomy, key=_KOLEJNOSC_POZIOMOW.index)
            dynamiczne = any(
                o.dowod.rodzaj_twierdzenia == ClaimKind.DYNAMIC_PERFORMANCE for o in stosowalne
            )
            rodzaj = (
                ClaimKind.DYNAMIC_PERFORMANCE
                if dynamiczne or not stosowalne
                else ClaimKind.DECLARED_CONFIGURATION
            )
            odniesienie = f"bieg {self.input_hash}"
        elif metoda == "CERTYFIKAT":
            assert self.certyfikat is not None
            poziom = classify_dynamic_capability(_ZDOLNOSC_CERTYFIKATU).tier
            rodzaj = rodzaj_twierdzenia_wymagania(wymaganie)
            odniesienie = (
                f"dokument {self.certyfikat.numer_dokumentu} (rekord wykazu "
                f"{self.certyfikat.rekord_id})"
            )
        else:
            poziom = EvidenceTier.NOT_SIMULATED
            rodzaj = rodzaj_twierdzenia_wymagania(wymaganie)
            odniesienie = f"bieg {self.input_hash}"
        return StatusDowodu(
            metoda=metoda,
            poziom=poziom,
            rodzaj_twierdzenia=rodzaj,
            status_modelu="NIE_DOTYCZY",
            status_danych=_status_danych(dane),
            odniesienie=odniesienie,
        )

    def _pokrycie(
        self, metoda: MetodaDowodu, skladowe: Sequence[OcenaKryterium], dotyczy: bool
    ) -> tuple[PokrycieProgramu, str]:
        if not dotyczy:
            return "NIE_DOTYCZY", "wymaganie nie dotyczy modułu — program badań nie ma zastosowania"
        if metoda == "CERTYFIKAT":
            return (
                "NIE_DOTYCZY",
                "wymaganie wykazywane certyfikatem urządzenia — program badań nie ma zastosowania",
            )
        if metoda == "BRAK_METODY":
            return (
                "NIE_DOTYCZY",
                "brak metody wykazania w narzędziu — program badań nie ma zastosowania",
            )
        dynamiczne = any(
            o.dowod.rodzaj_twierdzenia == ClaimKind.DYNAMIC_PERFORMANCE
            and o.status_maszynowy != "NIE_DOTYCZY"
            for o in skladowe
        )
        if not dynamiczne:
            return (
                "NIE_DOTYCZY",
                "wymaganie wykazywane porównaniem konfiguracji — program badań nie ma "
                "zastosowania",
            )
        program = self.profile.program_badan
        opis = (
            f"program badań profilu: stan źródła „{NAZWA_STANU_ZRODLA_PL[program.status]}”, "
            f"scenariuszy {len(program.scenariusze)}, pokrytych biegami: 0"
        )
        if program.uwagi_pl:
            opis += f" ({program.uwagi_pl})"
        return "CZESCIOWE", opis

    def wynik_wymagania(self, wymaganie: WymaganieRegulacyjne) -> WynikWymagania:
        stosowalnosc = stosowalnosc_wymagania(
            wymaganie,
            klasyfikacja=self.klasyfikacja,
            technologia=self.technologia,
            modul_istniejacy=self.modul.modul_istniejacy,
            operator_name_pl=self.profile.operator_name_pl,
        )
        podstawa, braki = self._podstawa_wymagania(wymaganie, stosowalnosc)
        sposob = sposob_wykazania_wymagania(
            wymaganie,
            stosowalnosc,
            klasyfikacja=self.klasyfikacja,
            technologia=self.technologia,
            certyfikat=self.certyfikat,
        )
        skladowe: list[OcenaKryterium] = []
        podstawa_sposobu: PodstawaWymagania | None = None
        metoda: MetodaDowodu
        if sposob == "NIE_DOTYCZY":
            metoda = "DOWOD_LACZONY" if wymaganie.testy else "BRAK_METODY"
        elif sposob == "TEST":
            metoda = "DOWOD_LACZONY"
            skladowe = [self.testy[t] for t in wymaganie.testy]
            skladowe.extend(self._koordynacja(wymaganie, stosowalnosc))
        elif sposob == "CERTYFIKAT":
            metoda = "CERTYFIKAT"
            skladowe = [self._skladowa_certyfikatu(wymaganie, stosowalnosc)]
            skladowe.extend(self._koordynacja(wymaganie, stosowalnosc))
            podstawa_sposobu = wymaganie.pokrycie_zrodlo
        else:
            metoda = "BRAK_METODY"
            skladowe = self._koordynacja(wymaganie, stosowalnosc)
            braki.append(
                "certyfikat urządzenia z wykazu PTPiREE obejmujący typ "
                f"{self.klasyfikacja.modul} albo raport z badania typu"
            )
            if self.certyfikat_odrzucony_pl is not None:
                braki.append(f"certyfikat z tabliczki urządzenia: {self.certyfikat_odrzucony_pl}")
            elif self.certyfikat is not None:
                braki.append(
                    f"certyfikat z wykazu (rekord {self.certyfikat.rekord_id}) obejmuje typy "
                    f"{', '.join(self.certyfikat.zakres_typow) or 'żadne'} — nie obejmuje typu "
                    f"{self.klasyfikacja.modul} albo reguła WiPWC nie przewiduje pokrycia tego "
                    "wymagania certyfikatem"
                )
        pokrycie, pokrycie_pl = self._pokrycie(metoda, skladowe, stosowalnosc.dotyczy)
        wykluczenia = tuple(
            dict.fromkeys(
                w
                for o in skladowe
                if o.status_maszynowy != "NIE_DOTYCZY"
                for w in o.zakres_waznosci.wykluczenia
            )
        )
        return zagreguj_wymaganie(
            wymaganie_id=wymaganie.id,
            nazwa_pl=wymaganie.nazwa_pl,
            podstawa=podstawa,
            stosowalnosc=stosowalnosc,
            sposob_wykazania=metoda,
            podstawa_sposobu_wykazania=podstawa_sposobu,
            oceny_skladowe=skladowe,
            pokrycie_programu=pokrycie,
            pokrycie_programu_pl=pokrycie_pl,
            dowod=self._dowod_wymagania(wymaganie, metoda, skladowe),
            zakres_waznosci=self._zakres(
                "wymaganie wykazywane rekordami składowymi (porównanie danych zadeklarowanych, "
                "certyfikat urządzenia) — nie wykazuje zachowania dynamicznego bez biegu dynamiki",
                wykluczenia,
            ),
            slad=list(dict.fromkeys(s for o in skladowe for s in o.slad)),
            braki_dodatkowe=braki,
        )


def ocen_wymagania_modulu(
    modul: NcRfgPtpireeModuleInput,
    wynik: NcRfgPtpireeModuleResult,
    *,
    input_hash: str,
    certyfikat_odrzucony_pl: str | None = None,
) -> OcenaWymaganModulu:
    """Rekord ``WynikWymagania`` dla KAŻDEGO wymagania profilu operatora modułu."""
    ocena = _OcenaModulu(
        modul, wynik, input_hash=input_hash, certyfikat_odrzucony_pl=certyfikat_odrzucony_pl
    )
    return OcenaWymaganModulu(
        der_ref=wynik.der_ref,
        der_name=wynik.der_name,
        klasyfikacja=wynik.klasyfikacja,
        technologia=wynik.technologia,
        zrodlo_danych=wynik.zrodlo_danych,
        wymagania=tuple(ocena.wynik_wymagania(w) for w in ocena.profile.wymagania),
    )


def ocen_wymagania_biegu(
    request: NcRfgPtpireeRunRequest,
    result: NcRfgPtpireeRunResult,
    *,
    certyfikaty_odrzucone: Mapping[str, str] | None = None,
) -> list[OcenaWymaganModulu]:
    """Ocena wymagań wszystkich modułów biegu (kolejność modułów żądania)."""
    odrzucone = certyfikaty_odrzucone or {}
    if [m.der_ref for m in request.modules] != [m.der_ref for m in result.modules]:
        raise ValueError("Moduły wyniku solvera nie odpowiadają modułom żądania.")
    return [
        ocen_wymagania_modulu(
            modul,
            wynik,
            input_hash=result.input_hash,
            certyfikat_odrzucony_pl=odrzucone.get(modul.der_ref),
        )
        for modul, wynik in zip(request.modules, result.modules, strict=True)
    ]


class BrakWymaganiaModulu(BaseModel):
    """Rekord W blokujący dokument twierdzący zgodność, przypisany do modułu (``der_ref``,
    ``der_name``) — odbiorca grupuje braki po module bez ponownego łączenia z biegiem."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    der_ref: str
    der_name: str | None
    rekord: WynikWymagania


def braki(ocena_wymagan: Sequence[OcenaWymaganModulu]) -> list[BrakWymaganiaModulu]:
    """Rekordy W blokujące dokument twierdzący zgodność: wymagania STOSOWALNE ze statusem
    innym niż ``SPELNIA`` (``SPELNIA`` na poziomie W zawsze z dowodem pełnym), każdy z modułem,
    którego dotyczy (kolejność modułów, potem wymagań profilu). Moduł poniżej progu
    istotności nie ma wymagań stosowalnych, więc nie jest brakiem."""
    return [
        BrakWymaganiaModulu(der_ref=modul.der_ref, der_name=modul.der_name, rekord=wymaganie)
        for modul in ocena_wymagan
        for wymaganie in modul.wymagania
        if wymaganie.stosowalnosc.dotyczy and wymaganie.status_maszynowy != "SPELNIA"
    ]


def brak_json(brak: BrakWymaganiaModulu) -> dict[str, Any]:
    """Pozycja braku w treści 422 dokumentu: moduł i pełny rekord W."""
    return brak.model_dump(mode="json")


def brak_pl(brak: BrakWymaganiaModulu) -> dict[str, Any]:
    """Pozycja braku po polsku w treści 422 dokumentu: moduł i zdanie rekordu W."""
    return {
        "der_ref": brak.der_ref,
        "der_name": brak.der_name,
        "zdanie_pl": brak.rekord.wyjasnienie.zdanie_pl,
    }


__all__ = [
    "KRYTERIA_KOORDYNACJI",
    "BrakWymaganiaModulu",
    "OcenaWymaganModulu",
    "brak_json",
    "brak_pl",
    "braki",
    "ocen_wymagania_biegu",
    "ocen_wymagania_modulu",
    "rodzaj_twierdzenia_wymagania",
]
