"""Rekordy werdyktu wyjaśnialnego analiz specjalistycznych V12.6 (karta
UX-04/POLE-ZU-SKLADOWA-ZEROWA, odcinek 3).

DLACZEGO TU. Rdzeń V12.6 (`network_model/solvers/v126_academic.py`) wystawiał werdykty jako
słowa statusu bez wyjaśnienia (`verification_status`, `safety_status`, `tuning_status`,
`relay_support_status`, `trv_status`, statusy rozruchu i walidacji „pass/fail"), z progami
zaszytymi w kodzie i bez podstawy. Kontrakt werdyktu wyjaśnialnego
(`docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md`) wymaga przy każdym kryterium: co oceniono,
wynik z jednostką, limit z podstawą i stanem źródła, margines, przyczynę, dowód i zakres
ważności. Solver liczy wyłącznie wielkości; ten moduł składa z nich rekordy
`werdykt.OcenaKryterium` / `werdykt.WynikWymagania` na JEDYNEJ granicy „wynik solvera →
wynik powierzchni" (`application.v126_artifacts.wynik_v126_dla_powierzchni`).

PODSTAWA KRYTERIÓW. Żadne kryterium V12.6 nie ma w programie normy z wydaniem i jednostką
redakcyjną. Progi i reguły są więc ZAŁOŻENIAMI INŻYNIERSKIMI programu (zasada nr 4): rejestr
`REJESTR_ZALOZEN` niżej (paragrafy Z-1…Z-12, opis w `docs/uiux/UX04_POLE_ZU_SKLADOWA_ZEROWA.md`
§7, parytet pilnowany testem) jest podstawą o stanie `WSKAZANE`, a każde kryterium z rejestru
stoi na danej przyjętej `ESTIMATED` — kompletność dowodu `NIEPELNY`. Praktyka, z której
założenie pochodzi (IEC 60099-5, IEC 60071-2, IEEE 80, IEEE C57.32, ENEA Zeszyt 1), jest
nazwana w uwagach podstawy, ale nie udaje normy. Napięcie powrotne nie ma obwiedni
wytrzymałości (parametry u_c, t_3 tabel IEC 62271-100 nie są danymi programu) — rekord
`BRAK_PODSTAWY`.

ZERO fizyki: moduł porównuje wielkości już policzone przez solver (wynik z limitem, zbiór
funkcji przekaźnika ze zbiorem wymaganym) i nazywa przedmiot nazwą z modelu.
Determinizm: kolejność rekordów = kolejność wierszy wyniku solvera.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from enm.nazwy_elementow import SPOZA_MODELU, nazwa_po_identyfikatorze
from network_model.nazwy import nazwa_nadana
from solver_input.provenance import classify_dynamic_capability
from werdykt import (
    DanaPrzyjeta,
    FieldQuality,
    Kryterium,
    LimitKryterium,
    MetodaDowodu,
    Niepewnosc,
    OcenaKryterium,
    OdnosnikSladu,
    PodstawaWymagania,
    Przedmiot,
    Relacja,
    StatusDanych,
    StatusDowodu,
    Stosowalnosc,
    Wielkosc,
    WynikKryterium,
    WynikWymagania,
    ZakresWaznosci,
    format_wielkosc,
    ocen_kryterium,
    zagreguj_wymaganie,
)

JsonDict = dict[str, Any]
Rekord = OcenaKryterium | WynikWymagania

DOKUMENT_ZALOZEN = "Rejestr założeń inżynierskich kryteriów analiz specjalistycznych MV-DESIGN-PRO"
WYDANIE_ZALOZEN = "2026-10-29"


@dataclass(frozen=True)
class ZalozenieKryterium:
    """Jedno założenie inżynierskie kryterium (paragraf rejestru Z-n).

    ``wartosc``/``jednostka`` — próg liczbowy, gdy kryterium go ma (inaczej limit jest
    wielkością wyznaczoną w biegu albo daną projektanta, a założeniem jest sama reguła).
    """

    paragraf: str
    nazwa_pl: str
    tresc_pl: str
    praktyka_pl: str
    wartosc: float | None = None
    jednostka: str | None = None

    @property
    def podstawa(self) -> PodstawaWymagania:
        return PodstawaWymagania(
            rodzaj="ZALOZENIE_PROJEKTOWE",
            dokument=DOKUMENT_ZALOZEN,
            wydanie=WYDANIE_ZALOZEN,
            jednostka_redakcyjna=f"§ {self.paragraf}",
            status="WSKAZANE",
            uwagi_pl=self.praktyka_pl,
        )

    @property
    def dana_przyjeta(self) -> DanaPrzyjeta:
        return DanaPrzyjeta(
            nazwa_pl=f"Kryterium {self.nazwa_pl} ({self.paragraf} rejestru założeń)",
            wartosc=(
                None
                if self.wartosc is None or self.jednostka is None
                else Wielkosc(wartosc=self.wartosc, jednostka=self.jednostka)
            ),
            powod_pl=(
                f"Założenie inżynierskie programu, nie wartość normowa: {self.tresc_pl} "
                f"{self.praktyka_pl}"
            ),
            jakosc=FieldQuality.ESTIMATED,
        )

    def granica(self) -> Wielkosc:
        """Próg liczbowy założenia. Wołane wyłącznie dla założeń z progiem (rejestr §7 jest
        stały) — założenie bez progu w tym miejscu to błąd programu, nie odmowa danych."""
        assert (
            self.wartosc is not None and self.jednostka is not None
        ), f"Założenie {self.paragraf} nie ma progu liczbowego."
        return Wielkosc(wartosc=self.wartosc, jednostka=self.jednostka)


_BEZ_WYDANIA = "wydanie i jednostka redakcyjna niepotwierdzone w programie"

Z_NAPIECIE_PRACY = ZalozenieKryterium(
    "Z-1",
    "napięcia trwałej pracy ogranicznika",
    "U_c ogranicznika nie mniejsze od wymaganego: przy doziemieniu długotrwałym (sieć "
    "izolowana i kompensowana) U_c,wym = U_TOV, przy doziemieniu wyłączanym U_c,wym = U_m/√3.",
    f"Reguła doboru ograniczników ZnO z praktyki IEC 60099-5 ({_BEZ_WYDANIA}).",
)
Z_PRZEPIECIE_DORYWCZE = ZalozenieKryterium(
    "Z-2",
    "wytrzymałości ogranicznika na przepięcie dorywcze",
    "Przy doziemieniu wyłączanym samoczynnie wytrzymałość ogranicznika na przepięcie dorywcze "
    "10 s nie mniejsza od U_TOV; zakłada się wyłączenie doziemienia w czasie nie dłuższym "
    "niż 10 s (dłuższy czas wymaga krzywej TOV(t) producenta).",
    f"Reguła z praktyki IEC 60099-5 ({_BEZ_WYDANIA}).",
    10.0,
    "s",
)
Z_MARGINES_IZOLACJI = ZalozenieKryterium(
    "Z-3",
    "marginesu ochrony izolacji",
    "Margines ochrony M_BIL = (BIL − U_res)/U_res·100 % nie mniejszy niż 20 %.",
    "Zapas ochrony z praktyki koordynacji izolacji (IEC 60071-2 — wartość liczbowa marginesu "
    f"nie jest potwierdzona w programie; {_BEZ_WYDANIA}).",
    20.0,
    "%",
)
Z_NAPIECIE_DOTYKOWE = ZalozenieKryterium(
    "Z-4",
    "napięcia dotykowego rażeniowego",
    "Napięcie dotykowe rażeniowe uziomu nie większe od dopuszczalnego "
    "U_dot,dop = (1000 + 1,5·C_s·ρ_s)·0,157/√t_f (ciało 70 kg).",
    f"Wzór dopuszczalnego napięcia z praktyki IEEE 80, metoda Sveraka ({_BEZ_WYDANIA}).",
)
Z_NAPIECIE_KROKOWE = ZalozenieKryterium(
    "Z-5",
    "napięcia krokowego",
    "Napięcie krokowe uziomu nie większe od dopuszczalnego "
    "U_kr,dop = (1000 + 6·C_s·ρ_s)·0,157/√t_f (ciało 70 kg).",
    f"Wzór dopuszczalnego napięcia z praktyki IEEE 80, metoda Sveraka ({_BEZ_WYDANIA}).",
)
Z_PRAD_RESZTKOWY = ZalozenieKryterium(
    "Z-6",
    "prądu resztkowego sieci kompensowanej",
    "Prąd resztkowy dławika modelu nie większy niż 10 % prądu pojemnościowego doziemienia "
    "sieci.",
    "Kryterium metody z praktyki kompensacji rezonansowej (ENEA Zeszyt 1 §16) — bez wartości "
    "normowej.",
    10.0,
    "%",
)
Z_ENERGIA_REZYSTORA = ZalozenieKryterium(
    "Z-7",
    "obciążalności cieplnej rezystora punktu neutralnego",
    "Energia wydzielona w rezystorze w czasie wyłączenia doziemienia E_k = I_th²·R·t_wył nie "
    "większa od energii znamionowej E_n = I_n²·R·t_n (kryterium adiabatyczne).",
    f"Znamionowanie czasowe rezystorów uziemiających z praktyki IEEE C57.32 ({_BEZ_WYDANIA}).",
)
Z_METODA_DETEKCJI = ZalozenieKryterium(
    "Z-8",
    "dostępności metody detekcji doziemień",
    "Metoda zalecana wg sposobu pracy punktu neutralnego (sieć izolowana — watometryczna, "
    "kompensowana z dławikiem dostrojonym — watometryczna, rozstrojonym — admitancyjna, przez "
    "rezystor — 51N z 67N, uziemiona bezpośrednio — 51N z 50N), a przekaźnik ma każdą funkcję "
    "metody zalecanej.",
    "Tabela decyzyjna z praktyki zabezpieczeń ziemnozwarciowych sieci SN — bez wartości "
    "normowej.",
)
Z_ZAPAD_ROZRUCHU = ZalozenieKryterium(
    "Z-9",
    "zapadu napięcia przy rozruchu",
    "Zapad napięcia na szynie przy prądzie rozruchowym silnika nie większy niż 15 %.",
    "Granica z praktyki projektowania rozruchu silników SN — bez wartości normowej; zapad "
    "dopuszczalny zależy od odbiorów szyny i warunków operatora.",
    15.0,
    "%",
)
Z_CZAS_ROZRUCHU = ZalozenieKryterium(
    "Z-10",
    "czasu rozruchu",
    "Czas rozruchu nie dłuższy od dopuszczalnego czasu utyku silnika (czas podany przy prądzie "
    "zablokowanego wirnika).",
    "Reguła cieplna rozruchu bezpośredniego — porównanie czasów z karty silnika.",
)
Z_MOMENT_ROZRUCHOWY = ZalozenieKryterium(
    "Z-11",
    "momentu rozruchowego",
    "Moment rozruchowy silnika (wzór Klossa przy poślizgu s = 1, napięcie znamionowe) nie "
    "mniejszy od momentu obciążenia przy rozruchu.",
    "Warunek ruszenia napędu — bez wartości normowej.",
)
Z_TOLERANCJA_ODNIESIENIA = ZalozenieKryterium(
    "Z-12",
    "zgodności z wartością odniesienia",
    "Odchyłka wyniku od wartości odniesienia nie większa od tolerancji podanej z tą wartością.",
    "Tolerancja jest daną odniesienia biegu (sieć odniesienia), nie wartością normową.",
)

#: Rejestr założeń inżynierskich — JEDNO źródło progów i reguł kryteriów V12.6 (katalog analiz,
#: rekordy oceny, dokument §7). Kolejność = kolejność paragrafów.
REJESTR_ZALOZEN: tuple[ZalozenieKryterium, ...] = (
    Z_NAPIECIE_PRACY,
    Z_PRZEPIECIE_DORYWCZE,
    Z_MARGINES_IZOLACJI,
    Z_NAPIECIE_DOTYKOWE,
    Z_NAPIECIE_KROKOWE,
    Z_PRAD_RESZTKOWY,
    Z_ENERGIA_REZYSTORA,
    Z_METODA_DETEKCJI,
    Z_ZAPAD_ROZRUCHU,
    Z_CZAS_ROZRUCHU,
    Z_MOMENT_ROZRUCHOWY,
    Z_TOLERANCJA_ODNIESIENIA,
)

#: Podstawa wymagania zbiorczego (rekord W) — cały rejestr.
PODSTAWA_REJESTRU = PodstawaWymagania(
    rodzaj="ZALOZENIE_PROJEKTOWE",
    dokument=DOKUMENT_ZALOZEN,
    wydanie=WYDANIE_ZALOZEN,
    jednostka_redakcyjna="§ Z-1 … Z-12",
    status="WSKAZANE",
    uwagi_pl="Założenia inżynierskie programu — żadne nie jest wartością normową.",
)

#: Obwiednia wytrzymałości wyłącznika na napięcie powrotne — norma wskazana z nazwy, tablice
#: parametrów nie są danymi programu (stan NIEUSTALONE, rekord BRAK_PODSTAWY).
PODSTAWA_OBWIEDNI_TRV = PodstawaWymagania(
    rodzaj="NORMA",
    dokument="IEC 62271-100",
    status="NIEUSTALONE",
    uwagi_pl=(
        "obwiednia wytrzymałości wyłącznika (parametry u_c, t_3 dla napięcia znamionowego "
        "i współczynnika pierwszego bieguna) nie jest daną programu"
    ),
)
BRAK_OBWIEDNI_TRV_PL = (
    "Tabele parametrów obwiedni wytrzymałości wyłącznika na napięcie powrotne (u_c, t_3) "
    "IEC 62271-100 dla napięcia znamionowego wyłącznika — do wprowadzenia do programu z "
    "podstawą (wydanie, tablica)."
)

_NIEPEWNOSC = Niepewnosc(
    nie_dotyczy=True,
    powod_pl=(
        "porównanie wielkości z obliczenia analitycznego wzorem zamkniętym — niepewność danych "
        "wejściowych nie jest propagowana do tej oceny"
    ),
)
_DOTYCZY = "wielkość wyznaczona w biegu analizy dla tego obiektu"

ID_IZOLACJA = "v126.koordynacja_izolacji"
ID_UZIOM = "v126.bezpieczenstwo_uziomu"
ID_UZIEMIENIE = "v126.projekt_uziemienia_punktu_neutralnego"
ID_DETEKCJA = "v126.detekcja_doziemien"
ID_TRV = "v126.napiecie_powrotne"
ID_ROZRUCH = "v126.rozruch_silnikow"
ID_BENCHMARK = "v126.walidacja_benchmarkowa"


@dataclass(frozen=True)
class _Bieg:
    """Tożsamość biegu wspólna dla rekordów jednego wyniku."""

    wersja_silnika: str | None
    odcisk: str | None
    nazwy: Mapping[str, str]

    @property
    def odniesienie(self) -> str:
        return (
            "bieg analizy specjalistycznej"
            if self.odcisk is None
            else f"bieg analizy specjalistycznej (odcisk {self.odcisk[:16]})"
        )

    def nazwa(self, ref: Any) -> str:
        return nazwa_po_identyfikatorze(ref, indeks=self.nazwy, spoza_modelu=SPOZA_MODELU)

    def slad(self, krok: str, opis_pl: str) -> tuple[OdnosnikSladu, ...]:
        return (OdnosnikSladu(wersja_silnika=self.wersja_silnika, krok=krok, opis_pl=opis_pl),)


#: Wielkość opisu odnośnika śladu bez liczby — nazwany brak, nie zapis pustej wartości.
NIE_WYZNACZONO = "nie wyznaczono"


def _wielkosc_sladu(wartosc: float | None, jednostka: str) -> str:
    """Wielkość w opisie odnośnika śladu dla projektanta: zapis polski karty werdyktu
    (`werdykt.wyjasnienie.format_wielkosc`), brak liczby nazwany — nigdy surowy zapis
    Pythona („None %”, „15.0 %”)."""
    if wartosc is None:
        return NIE_WYZNACZONO
    return format_wielkosc(Wielkosc(wartosc=wartosc, jednostka=jednostka))


def _dane(surowe: Any) -> tuple[DanaPrzyjeta, ...]:
    """Dane przyjęte wiersza solvera (słowniki) jako rekordy kontraktu, bez powtórzeń."""
    wynik: list[DanaPrzyjeta] = []
    for dana in surowe or []:
        if isinstance(dana, Mapping):
            rekord = DanaPrzyjeta.model_validate(dict(dana))
            if rekord not in wynik:
                wynik.append(rekord)
    return tuple(wynik)


def _dowod(
    zdolnosc_id: str,
    bieg: _Bieg,
    dane: Sequence[DanaPrzyjeta],
    *,
    metoda: MetodaDowodu = "OBLICZENIE",
) -> StatusDowodu:
    zdolnosc = classify_dynamic_capability(zdolnosc_id)
    unikalne = tuple(dict.fromkeys(dane))
    return StatusDowodu(
        metoda=metoda,
        poziom=zdolnosc.tier,
        rodzaj_twierdzenia=zdolnosc.claim_kind,
        status_modelu="NIE_DOTYCZY",
        status_danych=(
            StatusDanych(stan="UNVALIDATED_INPUT", dane_przyjete=unikalne)
            if unikalne
            else StatusDanych(stan="ZWALIDOWANE")
        ),
        odniesienie=bieg.odniesienie,
    )


def _liczba(wartosc: Any) -> float | None:
    if isinstance(wartosc, bool) or not isinstance(wartosc, int | float):
        return None
    return float(wartosc)


@dataclass(frozen=True)
class _Porownanie:
    """Jedno kryterium liczbowe: wynik z wiersza solvera wobec limitu z założenia."""

    kryterium_id: str
    zalozenie: ZalozenieKryterium
    opis_pl: str
    warunek_latex: str
    relacja: Relacja
    wielkosc_pl: str
    symbol_latex: str
    jednostka: str
    wynik: float | None
    limit: float | None
    limit_pl: str | None = None
    braki: tuple[str, ...] = ()
    dotyczy: bool = True
    powod_stosowalnosci_pl: str = _DOTYCZY
    #: Źródło wielkości wyniku: obliczenie biegu albo wartość zadeklarowana w danych biegu
    #: (benchmark porównuje dwie liczby podane przez projektanta — nic nie liczy).
    metoda_wyniku: MetodaDowodu = "OBLICZENIE"


def _ocena(
    p: _Porownanie,
    *,
    przedmiot: Przedmiot,
    zdolnosc_id: str,
    bieg: _Bieg,
    dane: Sequence[DanaPrzyjeta],
    zakres: ZakresWaznosci,
    krok: str,
) -> OcenaKryterium:
    wynik = (
        None
        if p.wynik is None
        else WynikKryterium(
            wielkosc_pl=p.wielkosc_pl,
            symbol_latex=p.symbol_latex,
            wartosc=Wielkosc(wartosc=p.wynik, jednostka=p.jednostka),
            punkt_krytyczny_pl=przedmiot.nazwa_pl,
            metoda=p.metoda_wyniku,
        )
    )
    limit = (
        None
        if p.limit is None
        else LimitKryterium(
            wartosc=Wielkosc(wartosc=p.limit, jednostka=p.jednostka),
            podstawa=p.zalozenie.podstawa,
            zakres_stosowalnosci_pl=p.limit_pl,
        )
    )
    braki = list(p.braki)
    if p.wynik is not None and p.limit is None and not braki:
        braki.append(f"limit kryterium {p.zalozenie.nazwa_pl} nie został wyznaczony w biegu")
    # Kryterium NIE_DOTYCZY niczego nie porównuje — nie stoi na żadnej danej przyjętej.
    dane_oceny = () if not p.dotyczy else (*dane, p.zalozenie.dana_przyjeta)
    return ocen_kryterium(
        kryterium_id=p.kryterium_id,
        przedmiot=przedmiot,
        kryterium=Kryterium(opis_pl=p.opis_pl, warunek_latex=p.warunek_latex, relacja=p.relacja),
        podstawa=p.zalozenie.podstawa,
        stosowalnosc=Stosowalnosc(dotyczy=p.dotyczy, powod_pl=p.powod_stosowalnosci_pl),
        wynik=wynik,
        limit=limit,
        niepewnosc=_NIEPEWNOSC,
        dowod=_dowod(zdolnosc_id, bieg, dane_oceny, metoda=p.metoda_wyniku),
        zakres_waznosci=zakres,
        slad=bieg.slad(
            krok,
            f"{p.wielkosc_pl}: wynik {_wielkosc_sladu(p.wynik, p.jednostka)}, limit "
            f"{_wielkosc_sladu(p.limit, p.jednostka)} ({p.zalozenie.paragraf})",
        ),
        braki_dodatkowe=braki,
    )


def _wymaganie(
    *,
    wymaganie_id: str,
    nazwa_pl: str,
    oceny: Sequence[OcenaKryterium],
    zdolnosc_id: str,
    bieg: _Bieg,
    zakres: ZakresWaznosci,
) -> WynikWymagania:
    dane = [
        d
        for o in oceny
        if o.status_maszynowy != "NIE_DOTYCZY"
        for d in o.dowod.status_danych.dane_przyjete
    ]
    return zagreguj_wymaganie(
        wymaganie_id=wymaganie_id,
        nazwa_pl=nazwa_pl,
        podstawa=PODSTAWA_REJESTRU,
        stosowalnosc=Stosowalnosc(dotyczy=True, powod_pl=_DOTYCZY),
        sposob_wykazania="OBLICZENIE",
        oceny_skladowe=oceny,
        pokrycie_programu="NIE_DOTYCZY",
        pokrycie_programu_pl=(
            "wymaganie wykazywane obliczeniem jednego biegu analizy — program badań nie dotyczy"
        ),
        dowod=_dowod(zdolnosc_id, bieg, dane),
        zakres_waznosci=zakres,
        slad=[odnosnik for o in oceny for odnosnik in o.slad],
    )


def _brak_obiektow(
    *,
    kryterium_id: str,
    przedmiot_pl: str,
    opis_pl: str,
    zalozenie: ZalozenieKryterium,
    zdolnosc_id: str,
    bieg: _Bieg,
    zakres: ZakresWaznosci,
    brak_pl: str,
) -> OcenaKryterium:
    """Rekord NIE_OCENIONO, gdy bieg nie ma obiektu oceny (brak danych ≠ spełnia)."""
    return _ocena(
        _Porownanie(
            kryterium_id=kryterium_id,
            zalozenie=zalozenie,
            opis_pl=opis_pl,
            warunek_latex="",
            relacja="LOGICZNE",
            wielkosc_pl=opis_pl,
            symbol_latex="",
            jednostka="1",
            wynik=None,
            limit=None,
            braki=(brak_pl,),
        ),
        przedmiot=Przedmiot(element_ref=None, nazwa_pl=przedmiot_pl, opis_pl=opis_pl),
        zdolnosc_id=zdolnosc_id,
        bieg=bieg,
        dane=(),
        zakres=zakres,
        krok="brak_obiektow",
    )


def _komunikat(ladunek: Mapping[str, Any], domyslny: str) -> str:
    tekst = ladunek.get("message_pl")
    return str(tekst) if isinstance(tekst, str) and tekst.strip() else domyslny


# ---------------------------------------------------------------------------
# Koordynacja izolacji — wymaganie per miejsce zainstalowania (3 kryteria)
# ---------------------------------------------------------------------------

_ZAKRES_IZOLACJI = ZakresWaznosci(
    rodzaj_analizy="SHORT_CIRCUIT",
    opis_pl=(
        "Ogranicznik przepięć jednego miejsca zainstalowania; przepięcie dorywcze przy "
        "doziemieniu z współczynnika zwarcia doziemnego sieci; poziom izolacji z typoszeregu "
        "IEC 60071-1 dla napięcia najwyższego U_m."
    ),
    wykluczenia=(
        "przepięcia łączeniowe i odległość ochronna ogranicznika od aparatu",
        "starzenie i zabrudzenie izolacji",
    ),
)


def oceny_izolacji(ladunek: Mapping[str, Any], bieg: _Bieg) -> list[Rekord]:
    wiersze = [w for w in ladunek.get("arresters") or [] if isinstance(w, Mapping)]
    if not wiersze:
        return [
            _brak_obiektow(
                kryterium_id="v126.izolacja.brak_ogranicznikow",
                przedmiot_pl="Ograniczniki przepięć modelu",
                opis_pl="Koordynacja izolacji ograniczników przepięć",
                zalozenie=Z_MARGINES_IZOLACJI,
                zdolnosc_id=ID_IZOLACJA,
                bieg=bieg,
                zakres=_ZAKRES_IZOLACJI,
                brak_pl="Model nie ma ograniczników przepięć — koordynacji izolacji nie oceniono.",
            )
        ]
    rekordy: list[Rekord] = []
    for w in wiersze:
        ref = str(w.get("location_bus_ref"))
        przedmiot = Przedmiot(
            element_ref=ref,
            nazwa_pl=bieg.nazwa(ref),
            opis_pl="Miejsce zainstalowania ogranicznika przepięć",
        )
        dane = _dane(w.get("dane_przyjete"))
        dlugotrwale = w.get("tov_duration") == "dlugotrwale"
        porownania = (
            _Porownanie(
                kryterium_id=f"v126.izolacja.napiecie_pracy.{ref}",
                zalozenie=Z_NAPIECIE_PRACY,
                opis_pl="Napięcie trwałej pracy ogranicznika nie mniejsze od wymaganego",
                warunek_latex=r"U_c \geq U_{c,\mathrm{wym}}",
                relacja="NIE_MNIEJ",
                wielkosc_pl="napięcie trwałej pracy ogranicznika",
                symbol_latex=r"U_c",
                jednostka="kV",
                wynik=_liczba(w.get("mcov_kv")),
                limit=_liczba(w.get("mcov_required_kv")),
                limit_pl=(
                    "U_c,wym = U_TOV (doziemienie długotrwałe)"
                    if dlugotrwale
                    else "U_c,wym = U_m/√3 (doziemienie wyłączane)"
                ),
            ),
            _Porownanie(
                kryterium_id=f"v126.izolacja.przepiecie_dorywcze.{ref}",
                zalozenie=Z_PRZEPIECIE_DORYWCZE,
                opis_pl=(
                    "Wytrzymałość ogranicznika na przepięcie dorywcze 10 s nie mniejsza od "
                    "przepięcia dorywczego przy doziemieniu"
                ),
                warunek_latex=r"\mathrm{TOV}_{10\,\mathrm{s}} \geq U_{\mathrm{TOV}}",
                relacja="NIE_MNIEJ",
                wielkosc_pl="wytrzymałość ogranicznika na przepięcie dorywcze 10 s",
                symbol_latex=r"\mathrm{TOV}_{10\,\mathrm{s}}",
                jednostka="kV",
                wynik=_liczba(w.get("tov_10s_kv")),
                limit=_liczba(w.get("predicted_tov_kv")),
                limit_pl="U_TOV = k·U_m/√3",
                dotyczy=not dlugotrwale,
                powod_stosowalnosci_pl=(
                    "sieć izolowana albo kompensowana pracuje z doziemieniem długotrwale — "
                    "rozstrzyga napięcie trwałej pracy (Z-1), nie wytrzymałość 10 s"
                    if dlugotrwale
                    else "doziemienie wyłączane samoczynnie — przepięcie dorywcze trwa do "
                    "wyłączenia"
                ),
            ),
            _Porownanie(
                kryterium_id=f"v126.izolacja.margines_bil.{ref}",
                zalozenie=Z_MARGINES_IZOLACJI,
                opis_pl="Margines ochrony izolacji nie mniejszy od wymaganego",
                warunek_latex=(
                    r"M_{\mathrm{BIL}} = \dfrac{\mathrm{BIL} - U_{\mathrm{res}}}"
                    r"{U_{\mathrm{res}}}\cdot 100\% \geq 20\%"
                ),
                relacja="NIE_MNIEJ",
                wielkosc_pl="margines ochrony izolacji",
                symbol_latex=r"M_{\mathrm{BIL}}",
                jednostka="%",
                wynik=_liczba(w.get("bil_margin_percent")),
                limit=Z_MARGINES_IZOLACJI.wartosc,
                braki=(
                    (_komunikat(w, "poziom izolacji nieustalony"),)
                    if w.get("bil_margin_percent") is None
                    else ()
                ),
            ),
        )
        oceny = [
            _ocena(
                p,
                przedmiot=przedmiot,
                zdolnosc_id=ID_IZOLACJA,
                bieg=bieg,
                dane=dane,
                zakres=_ZAKRES_IZOLACJI,
                krok="iec60071_arrester_margin",
            )
            for p in porownania
        ]
        rekordy.append(
            _wymaganie(
                wymaganie_id=f"v126.izolacja.{ref}",
                nazwa_pl=f"Koordynacja izolacji ogranicznika — {przedmiot.nazwa_pl}",
                oceny=oceny,
                zdolnosc_id=ID_IZOLACJA,
                bieg=bieg,
                zakres=_ZAKRES_IZOLACJI,
            )
        )
    return rekordy


# ---------------------------------------------------------------------------
# Bezpieczeństwo uziomu — wymaganie stacji (napięcie dotykowe i krokowe)
# ---------------------------------------------------------------------------

_ZAKRES_UZIOMU = ZakresWaznosci(
    rodzaj_analizy="SHORT_CIRCUIT",
    opis_pl=(
        "Uziom kratowy jednej stacji z danych projektanta; napięcia rażenia wzorami "
        "przybliżonymi metody Sveraka przy prądzie zwarcia doziemnego odprowadzanym przez "
        "uziom w czasie wyłączenia; ciało człowieka 70 kg."
    ),
    wykluczenia=(
        "rozkład potencjału w gruncie dwuwarstwowym (rachunek używa warstwy górnej)",
        "potencjały przeniesione, korozja i połączenia wyrównawcze",
    ),
)


def oceny_uziomu(ladunek: Mapping[str, Any], bieg: _Bieg) -> list[Rekord]:
    ref = ladunek.get("gpz_ref")
    # Stacja nazwana nazwą z modelu; identyfikator spoza migawki daje jawny brak
    # (`SPOZA_MODELU`), nigdy siebie samego w zdaniu dla człowieka.
    ma_ref = isinstance(ref, str) and bool(ref)
    przedmiot = Przedmiot(
        element_ref=ref if ma_ref else None,
        nazwa_pl=bieg.nazwa(ref) if ma_ref else "stacja (uziom projektanta)",
        opis_pl="Uziom kratowy stacji",
    )
    brak = (
        (_komunikat(ladunek, "brak danych uziomu stacji"),)
        if "u_touch_calculated_v" not in ladunek
        else ()
    )
    porownania = (
        _Porownanie(
            kryterium_id="v126.uziom.napiecie_dotykowe",
            zalozenie=Z_NAPIECIE_DOTYKOWE,
            opis_pl="Napięcie dotykowe rażeniowe nie większe od dopuszczalnego",
            warunek_latex=r"U_{\mathrm{dot}} \leq U_{\mathrm{dot,dop}}",
            relacja="NIE_WIECEJ",
            wielkosc_pl="napięcie dotykowe rażeniowe",
            symbol_latex=r"U_{\mathrm{dot}}",
            jednostka="V",
            wynik=_liczba(ladunek.get("u_touch_calculated_v")),
            limit=_liczba(ladunek.get("u_touch_allowable_v")),
            limit_pl="U_dot,dop = (1000 + 1,5·C_s·ρ_s)·0,157/√t_f",
            braki=brak,
        ),
        _Porownanie(
            kryterium_id="v126.uziom.napiecie_krokowe",
            zalozenie=Z_NAPIECIE_KROKOWE,
            opis_pl="Napięcie krokowe nie większe od dopuszczalnego",
            warunek_latex=r"U_{\mathrm{kr}} \leq U_{\mathrm{kr,dop}}",
            relacja="NIE_WIECEJ",
            wielkosc_pl="napięcie krokowe",
            symbol_latex=r"U_{\mathrm{kr}}",
            jednostka="V",
            wynik=_liczba(ladunek.get("u_step_calculated_v")),
            limit=_liczba(ladunek.get("u_step_allowable_v")),
            limit_pl="U_kr,dop = (1000 + 6·C_s·ρ_s)·0,157/√t_f",
            braki=brak,
        ),
    )
    oceny = [
        _ocena(
            p,
            przedmiot=przedmiot,
            zdolnosc_id=ID_UZIOM,
            bieg=bieg,
            dane=(),
            zakres=_ZAKRES_UZIOMU,
            krok="ieee80_sverak",
        )
        for p in porownania
    ]
    return [
        _wymaganie(
            wymaganie_id="v126.uziom",
            nazwa_pl=f"Napięcia rażenia uziomu — {przedmiot.nazwa_pl}",
            oceny=oceny,
            zdolnosc_id=ID_UZIOM,
            bieg=bieg,
            zakres=_ZAKRES_UZIOMU,
        )
    ]


# ---------------------------------------------------------------------------
# Dobór uziemienia punktu neutralnego — prąd resztkowy / energia rezystora
# ---------------------------------------------------------------------------

_ZAKRES_UZIEMIENIA = ZakresWaznosci(
    rodzaj_analizy="SHORT_CIRCUIT",
    opis_pl=(
        "Galwanicznie połączona sieć SN z zespołem uziemiającym modelu; prąd pojemnościowy "
        "z susceptancji zerowej linii, kabli i baterii tej sieci; prąd doziemienia z impedancji "
        "punktów neutralnych w ruchu."
    ),
    wykluczenia=(
        "straty czynne dławika i upływność izolacji sieci (rzeczywisty prąd resztkowy jest nie "
        "mniejszy)",
        "impedancje zgodna i przeciwna sieci w prądzie rezystora (strona bezpieczna)",
    ),
)


def _sieci_uziemienia(ladunek: Mapping[str, Any]) -> list[Mapping[str, Any]]:
    sieci = ladunek.get("sieci")
    if isinstance(sieci, list):
        return [s for s in sieci if isinstance(s, Mapping)]
    return [ladunek]


def _przedmiot_sieci(siec: Mapping[str, Any], bieg: _Bieg) -> Przedmiot:
    ref = siec.get("szyna_ref")
    return Przedmiot(
        element_ref=str(ref) if isinstance(ref, str) else None,
        nazwa_pl=nazwa_nadana(siec.get("nazwa_pl"))
        or (bieg.nazwa(ref) if isinstance(ref, str) else "sieć SN modelu"),
        opis_pl="Sieć SN połączona galwanicznie (punkt neutralny zespołu uziemiającego)",
    )


def oceny_uziemienia(ladunek: Mapping[str, Any], bieg: _Bieg) -> list[Rekord]:
    rekordy: list[Rekord] = []
    if "neutral_earthing_type" not in ladunek:
        return [
            _brak_obiektow(
                kryterium_id="v126.uziemienie.brak_modelu",
                przedmiot_pl="Sieć SN modelu",
                opis_pl="Dobór uziemienia punktu neutralnego sieci SN",
                zalozenie=Z_PRAD_RESZTKOWY,
                zdolnosc_id=ID_UZIEMIENIE,
                bieg=bieg,
                zakres=_ZAKRES_UZIEMIENIA,
                brak_pl=_komunikat(ladunek, "brak sposobu uziemienia sieci SN w modelu"),
            )
        ]
    for siec in _sieci_uziemienia(ladunek):
        przedmiot = _przedmiot_sieci(siec, bieg)
        klucz = przedmiot.element_ref or "siec"
        dane = _dane(siec.get("dane_przyjete"))
        if siec.get("design_mode") == "resistor_grounded":
            termiczne = siec.get("thermal_check")
            termiczne = termiczne if isinstance(termiczne, Mapping) else {}
            rezystory = [r for r in termiczne.get("resistors") or [] if isinstance(r, Mapping)]
            brak_sieci = _komunikat(
                termiczne,
                _komunikat(siec, "sprawdzenia cieplnego rezystora nie wykonano"),
            )
            if not rezystory:
                rekordy.append(
                    _ocena(
                        _porownanie_rezystora(
                            f"v126.uziemienie.energia.{klucz}", None, None, brak_sieci
                        ),
                        przedmiot=przedmiot,
                        zdolnosc_id=ID_UZIEMIENIE,
                        bieg=bieg,
                        dane=dane,
                        zakres=_ZAKRES_UZIEMIENIA,
                        krok="ner_thermal_withstand",
                    )
                )
                continue
            for rez in rezystory:
                ref = str(rez.get("ref"))
                wynik = _liczba(rez.get("energy_dissipated_j"))
                brak = (
                    "brak czasu wyłączenia zwarcia doziemnego — energii wydzielonej w rezystorze "
                    "nie wyznaczono (czas dopuszczalny podany w wyniku)"
                    if wynik is None
                    else None
                )
                rekordy.append(
                    _ocena(
                        _porownanie_rezystora(
                            f"v126.uziemienie.energia.{ref}",
                            wynik,
                            _liczba(rez.get("energy_rating_j")),
                            brak,
                        ),
                        przedmiot=Przedmiot(
                            element_ref=ref,
                            nazwa_pl=nazwa_nadana(rez.get("nazwa_pl")) or bieg.nazwa(ref),
                            opis_pl=f"Rezystor punktu neutralnego sieci „{przedmiot.nazwa_pl}”",
                        ),
                        zdolnosc_id=ID_UZIEMIENIE,
                        bieg=bieg,
                        dane=dane,
                        zakres=_ZAKRES_UZIEMIENIA,
                        krok="ner_thermal_withstand",
                    )
                )
            continue
        wynik = _liczba(siec.get("residual_share_percent"))
        rekordy.append(
            _ocena(
                _Porownanie(
                    kryterium_id=f"v126.uziemienie.prad_resztkowy.{klucz}",
                    zalozenie=Z_PRAD_RESZTKOWY,
                    opis_pl=(
                        "Prąd resztkowy dławika modelu nie większy od dopuszczalnego udziału "
                        "prądu pojemnościowego sieci"
                    ),
                    warunek_latex=r"I_{\mathrm{res}}/I_C \leq 10\%",
                    relacja="NIE_WIECEJ",
                    wielkosc_pl="udział prądu resztkowego w prądzie pojemnościowym sieci",
                    symbol_latex=r"I_{\mathrm{res}}/I_C",
                    jednostka="%",
                    wynik=wynik,
                    limit=Z_PRAD_RESZTKOWY.wartosc,
                    braki=(
                        (_komunikat(siec, "prądu resztkowego dławika modelu nie wyznaczono"),)
                        if wynik is None
                        else ()
                    ),
                ),
                przedmiot=przedmiot,
                zdolnosc_id=ID_UZIEMIENIE,
                bieg=bieg,
                dane=dane,
                zakres=_ZAKRES_UZIEMIENIA,
                krok="petersen_residual_current",
            )
        )
    return rekordy


def _porownanie_rezystora(
    kryterium_id: str, wynik: float | None, limit: float | None, brak: str | None
) -> _Porownanie:
    return _Porownanie(
        kryterium_id=kryterium_id,
        zalozenie=Z_ENERGIA_REZYSTORA,
        opis_pl=(
            "Energia wydzielona w rezystorze w czasie wyłączenia doziemienia nie większa od "
            "energii znamionowej rezystora"
        ),
        warunek_latex=r"E_k \leq E_n",
        relacja="NIE_WIECEJ",
        wielkosc_pl="energia wydzielona w rezystorze",
        symbol_latex=r"E_k",
        jednostka="J",
        wynik=wynik,
        limit=limit,
        limit_pl="E_n = I_n²·R·t_n (prąd i czas znamionowy rezystora z modelu)",
        braki=() if brak is None else (brak,),
    )


# ---------------------------------------------------------------------------
# Detekcja doziemień — kryterium logiczne (deklaracja wyposażenia przekaźnika)
# ---------------------------------------------------------------------------

_ZAKRES_DETEKCJI = ZakresWaznosci(
    rodzaj_analizy="SHORT_CIRCUIT",
    opis_pl=(
        "Sieć SN jako całość: metoda detekcji zalecana dla sposobu pracy punktu neutralnego "
        "z modelu wobec funkcji przekaźnika wskazanych przez projektanta."
    ),
    wykluczenia=("nastawy rozruchowe funkcji ziemnozwarciowych", "selektywność czasowa"),
)


def oceny_detekcji(ladunek: Mapping[str, Any], bieg: _Bieg) -> list[Rekord]:
    przedmiot = Przedmiot(
        element_ref=None,
        nazwa_pl="Zabezpieczenie ziemnozwarciowe sieci SN",
        opis_pl="Funkcje detekcji doziemień przekaźnika pól sieci SN",
    )
    wymagane = [str(f) for f in ladunek.get("required_functions") or []]
    dostepne = {str(f) for f in ladunek.get("relay_methods") or []}
    podane = bool(ladunek.get("relay_methods_podane"))
    braki: list[str] = []
    wynik: WynikKryterium | None = None
    if not wymagane:
        braki.append(_komunikat(ladunek, "metody detekcji nie wyznaczono"))
    elif not podane:
        braki.append(
            "wyposażenie przekaźnika nie zostało wskazane — dostępności funkcji metody "
            "zalecanej nie sprawdzono"
        )
    else:
        brakujace = [f for f in wymagane if f not in dostepne]
        wynik = WynikKryterium(
            wielkosc_pl=(
                "przekaźnik ma każdą funkcję metody zalecanej ("
                + ", ".join(wymagane)
                + ")"
                + ("" if not brakujace else f"; brak: {', '.join(brakujace)}")
            ),
            symbol_latex=r"\text{funkcje} \subseteq \text{przekaźnik}",
            wartosc=Wielkosc(wartosc=0.0 if brakujace else 1.0, jednostka="1"),
            punkt_krytyczny_pl=przedmiot.nazwa_pl,
            metoda="DEKLARACJA",
        )
    # Kryterium stosowalne stoi na danej przyjętej swojego założenia także bez wyniku — ta sama
    # reguła co `_ocena` (tabela decyzyjna Z-8 wyznacza funkcje wymagane w każdym biegu).
    dane = (Z_METODA_DETEKCJI.dana_przyjeta,)
    return [
        ocen_kryterium(
            kryterium_id="v126.detekcja.funkcje_przekaznika",
            przedmiot=przedmiot,
            kryterium=Kryterium(
                opis_pl=(
                    "Przekaźnik ma każdą funkcję metody detekcji zalecanej dla sposobu pracy "
                    "punktu neutralnego sieci"
                ),
                warunek_latex=r"F_{\mathrm{wym}} \subseteq F_{\mathrm{przekaźnika}}",
                relacja="LOGICZNE",
            ),
            podstawa=Z_METODA_DETEKCJI.podstawa,
            stosowalnosc=Stosowalnosc(
                dotyczy=True, powod_pl="sieć SN z zespołem uziemiającym w modelu"
            ),
            wynik=wynik,
            limit=None,
            niepewnosc=Niepewnosc(
                nie_dotyczy=True, powod_pl="kryterium logiczne — porównanie zbiorów funkcji"
            ),
            dowod=_dowod(ID_DETEKCJA, bieg, dane, metoda="DEKLARACJA"),
            zakres_waznosci=_ZAKRES_DETEKCJI,
            slad=bieg.slad(
                "earth_fault_method_selection",
                f"funkcje wymagane: {', '.join(wymagane) or 'brak'}; funkcje przekaźnika: "
                f"{', '.join(sorted(dostepne)) or 'nie wskazano'}",
            ),
            braki_dodatkowe=braki,
        )
    ]


# ---------------------------------------------------------------------------
# Napięcie powrotne — brak obwiedni z podstawą (BRAK_PODSTAWY)
# ---------------------------------------------------------------------------

_ZAKRES_TRV = ZakresWaznosci(
    rodzaj_analizy="SHORT_CIRCUIT",
    opis_pl=(
        "Przebieg napięcia powrotnego 2–100 µs po przerwaniu prądu zwarciowego z parametrów "
        "obwodu podanych przez projektanta (częstotliwość własna, stała czasowa)."
    ),
    wykluczenia=("obwiednia wytrzymałości wyłącznika z tablic normy",),
)


def oceny_trv(ladunek: Mapping[str, Any], bieg: _Bieg) -> list[Rekord]:
    szczyt = _liczba(ladunek.get("trv_peak_kv"))
    braki = [BRAK_OBWIEDNI_TRV_PL]
    if szczyt is None:
        braki.insert(0, _komunikat(ladunek, "przebiegu napięcia powrotnego nie wyznaczono"))
    przedmiot = Przedmiot(
        element_ref=None,
        nazwa_pl="Wyłącznik sieci SN",
        opis_pl="Wyłącznik o napięciu znamionowym U_r przerywający prąd zwarciowy",
    )
    return [
        ocen_kryterium(
            kryterium_id="v126.trv.obwiednia",
            przedmiot=przedmiot,
            kryterium=Kryterium(
                opis_pl=(
                    "Napięcie powrotne po przerwaniu prądu zwarciowego mieści się pod obwiednią "
                    "wytrzymałości wyłącznika"
                ),
                warunek_latex=r"u_{\mathrm{TRV}}(t) \leq u_{\mathrm{obw}}(t)",
                relacja="NIE_WIECEJ",
            ),
            podstawa=PODSTAWA_OBWIEDNI_TRV,
            stosowalnosc=Stosowalnosc(
                dotyczy=True, powod_pl="wyłącznik przerywa prąd zwarciowy w sieci SN"
            ),
            wynik=(
                None
                if szczyt is None
                else WynikKryterium(
                    wielkosc_pl="największa wartość napięcia powrotnego",
                    symbol_latex=r"\max u_{\mathrm{TRV}}",
                    wartosc=Wielkosc(wartosc=szczyt, jednostka="kV"),
                    punkt_krytyczny_pl=przedmiot.nazwa_pl,
                    metoda="OBLICZENIE",
                )
            ),
            limit=None,
            niepewnosc=_NIEPEWNOSC,
            dowod=_dowod(ID_TRV, bieg, ()),
            zakres_waznosci=_ZAKRES_TRV,
            slad=bieg.slad(
                "trv_inrush_ferro", f"szczyt napięcia powrotnego: {_wielkosc_sladu(szczyt, 'kV')}"
            ),
            braki_dodatkowe=braki,
        )
    ]


# ---------------------------------------------------------------------------
# Rozruch silników — wymaganie per silnik (3 kryteria)
# ---------------------------------------------------------------------------

_ZAKRES_ROZRUCHU = ZakresWaznosci(
    rodzaj_analizy="POWER_FLOW",
    opis_pl=(
        "Rozruch bezpośredni jednego silnika podanego przez projektanta, każdy osobno; zapad "
        "z impedancji zastępczej sieci w węźle silnika; moment rozruchowy przy napięciu "
        "znamionowym."
    ),
    wykluczenia=(
        "obniżenie momentu przez zapad napięcia w czasie rozruchu",
        "rozruch kilku silników jednocześnie i przebieg czasowy rozruchu",
    ),
)


def oceny_rozruchu(ladunek: Mapping[str, Any], bieg: _Bieg) -> list[Rekord]:
    wiersze = [w for w in ladunek.get("motors") or [] if isinstance(w, Mapping)]
    if not wiersze:
        return [
            _brak_obiektow(
                kryterium_id="v126.rozruch.brak_silnikow",
                przedmiot_pl="Silniki projektanta",
                opis_pl="Rozruch bezpośredni silników",
                zalozenie=Z_ZAPAD_ROZRUCHU,
                zdolnosc_id=ID_ROZRUCH,
                bieg=bieg,
                zakres=_ZAKRES_ROZRUCHU,
                brak_pl="Nie podano silników — rozruchu nie oceniono.",
            )
        ]
    rekordy: list[Rekord] = []
    for w in wiersze:
        ref = str(w.get("motor_ref"))
        szyna = bieg.nazwa(w.get("bus_ref"))
        przedmiot = Przedmiot(
            element_ref=None,
            nazwa_pl=f"silnik {ref} (szyna {szyna})",
            opis_pl="Silnik podany przez projektanta — rozruch bezpośredni",
        )
        dane = _dane(w.get("dane_przyjete"))
        zapad = _liczba(w.get("voltage_dip_percent"))
        porownania = (
            _Porownanie(
                kryterium_id=f"v126.rozruch.zapad.{ref}",
                zalozenie=Z_ZAPAD_ROZRUCHU,
                opis_pl="Zapad napięcia na szynie przy rozruchu nie większy od dopuszczalnego",
                warunek_latex=r"\Delta U \leq 15\%",
                relacja="NIE_WIECEJ",
                wielkosc_pl="zapad napięcia na szynie przy prądzie rozruchowym",
                symbol_latex=r"\Delta U",
                jednostka="%",
                wynik=zapad,
                limit=Z_ZAPAD_ROZRUCHU.wartosc,
                braki=(
                    (_komunikat(w, "impedancji zastępczej sieci nie wyznaczono"),)
                    if zapad is None
                    else ()
                ),
            ),
            _Porownanie(
                kryterium_id=f"v126.rozruch.czas.{ref}",
                zalozenie=Z_CZAS_ROZRUCHU,
                opis_pl="Czas rozruchu nie dłuższy od dopuszczalnego czasu utyku",
                warunek_latex=r"t_r \leq t_{\mathrm{utyku}}",
                relacja="NIE_WIECEJ",
                wielkosc_pl="czas rozruchu",
                symbol_latex=r"t_r",
                jednostka="s",
                wynik=_liczba(w.get("start_time_s")),
                limit=_liczba(w.get("allowable_locked_rotor_time_s")),
                limit_pl="dopuszczalny czas utyku z karty silnika",
            ),
            _Porownanie(
                kryterium_id=f"v126.rozruch.moment.{ref}",
                zalozenie=Z_MOMENT_ROZRUCHOWY,
                opis_pl="Moment rozruchowy nie mniejszy od momentu obciążenia przy rozruchu",
                warunek_latex=r"M_r \geq M_{\mathrm{obc}}",
                relacja="NIE_MNIEJ",
                wielkosc_pl="moment rozruchowy silnika",
                symbol_latex=r"M_r",
                jednostka="p.u. (M_n)",
                wynik=_liczba(w.get("torque_start_pu")),
                limit=_liczba(w.get("load_start_torque_pu")),
                limit_pl="moment obciążenia przy rozruchu z danych napędu",
            ),
        )
        oceny = [
            _ocena(
                p,
                przedmiot=przedmiot,
                zdolnosc_id=ID_ROZRUCH,
                bieg=bieg,
                # Dane przyjęte silnika (cos φ_n, η_n, podział impedancji źródła) wchodzą do
                # prądu i zapadu — czas i moment ich nie używają.
                dane=dane if p.zalozenie is Z_ZAPAD_ROZRUCHU else (),
                zakres=_ZAKRES_ROZRUCHU,
                krok="motor_starting",
            )
            for p in porownania
        ]
        rekordy.append(
            _wymaganie(
                wymaganie_id=f"v126.rozruch.{ref}",
                nazwa_pl=f"Rozruch silnika {ref}",
                oceny=oceny,
                zdolnosc_id=ID_ROZRUCH,
                bieg=bieg,
                zakres=_ZAKRES_ROZRUCHU,
            )
        )
    return rekordy


# ---------------------------------------------------------------------------
# Walidacja na sieciach odniesienia — kryterium per pozycja
# ---------------------------------------------------------------------------

_ZAKRES_BENCHMARKU = ZakresWaznosci(
    opis_pl="Porównanie wyniku solvera z wartością odniesienia sieci odniesienia.",
)


def oceny_benchmarku(ladunek: Mapping[str, Any], bieg: _Bieg) -> list[Rekord]:
    wiersze = [w for w in ladunek.get("validation_report") or [] if isinstance(w, Mapping)]
    if not wiersze:
        return [
            _brak_obiektow(
                kryterium_id="v126.benchmark.brak_odniesien",
                przedmiot_pl="Sieci odniesienia",
                opis_pl="Zgodność wyniku z wartościami odniesienia",
                zalozenie=Z_TOLERANCJA_ODNIESIENIA,
                zdolnosc_id=ID_BENCHMARK,
                bieg=bieg,
                zakres=_ZAKRES_BENCHMARKU,
                brak_pl=_komunikat(ladunek, "brak wartości odniesienia"),
            )
        ]
    rekordy: list[Rekord] = []
    for indeks, w in enumerate(wiersze, start=1):
        siec = str(w.get("network"))
        test = str(w.get("test"))
        rekordy.append(
            _ocena(
                _Porownanie(
                    kryterium_id=f"v126.benchmark.{indeks}",
                    zalozenie=Z_TOLERANCJA_ODNIESIENIA,
                    opis_pl="Odchyłka wyniku od wartości odniesienia nie większa od tolerancji",
                    warunek_latex=r"\delta \leq \delta_{\mathrm{tol}}",
                    relacja="NIE_WIECEJ",
                    wielkosc_pl="odchyłka względna wyniku od wartości odniesienia",
                    symbol_latex=r"\delta",
                    jednostka="%",
                    wynik=_liczba(w.get("delta_percent")),
                    limit=_liczba(w.get("tolerance_percent")),
                    limit_pl="tolerancja podana z wartością odniesienia",
                    metoda_wyniku="DEKLARACJA",
                ),
                przedmiot=Przedmiot(
                    element_ref=None,
                    nazwa_pl=f"{siec} — {test}",
                    opis_pl="Pozycja walidacji na sieci odniesienia",
                ),
                zdolnosc_id=ID_BENCHMARK,
                bieg=bieg,
                dane=(),
                zakres=_ZAKRES_BENCHMARKU,
                krok="benchmark_regression",
            )
        )
    return rekordy


# ---------------------------------------------------------------------------
# Granica wyniku
# ---------------------------------------------------------------------------

_BUDOWNICZOWIE = {
    "insulation_coordination": oceny_izolacji,
    "earthing_safety": oceny_uziomu,
    "neutral_earthing_design": oceny_uziemienia,
    "earth_fault_detection": oceny_detekcji,
    "transient_trv": oceny_trv,
    "motor_starting": oceny_rozruchu,
    "benchmark_validation": oceny_benchmarku,
}

#: Rodzaje V12.6, których wynik niesie rekordy oceny kryteriów (klucz ``oceny``).
RODZAJE_Z_OCENAMI: frozenset[str] = frozenset(_BUDOWNICZOWIE)


def oceny_wyniku_v126(
    analysis_type: str,
    ladunek: Mapping[str, Any],
    *,
    wersja_silnika: str | None,
    odcisk: str | None,
    nazwy: Mapping[str, str],
) -> list[JsonDict] | None:
    """Rekordy oceny kryteriów wyniku V12.6 (JSON) albo ``None`` dla rodzaju bez kryteriów."""
    budowniczy = _BUDOWNICZOWIE.get(analysis_type)
    if budowniczy is None:
        return None
    bieg = _Bieg(wersja_silnika=wersja_silnika, odcisk=odcisk, nazwy=nazwy)
    return [rekord.model_dump(mode="json") for rekord in budowniczy(ladunek, bieg)]


#: Statusy rekordu, przy których kryterium nie jest rozstrzygnięte (kontrakt werdyktu §2).
_STATUSY_NIEROZSTRZYGNIETE: frozenset[str] = frozenset(
    ("NIE_OCENIONO", "BRAK_PODSTAWY", "BRAK_DOWODU", "NIEJEDNOZNACZNY")
)


def _ma_dane_przyjete(wezel: Any) -> bool:
    if isinstance(wezel, Mapping):
        return any(
            (klucz == "dane_przyjete" and bool(wartosc)) or _ma_dane_przyjete(wartosc)
            for klucz, wartosc in wezel.items()
        )
    if isinstance(wezel, list):
        return any(_ma_dane_przyjete(element) for element in wezel)
    return False


def kompletnosc_wyniku(ladunek: Mapping[str, Any], oceny: Sequence[JsonDict] | None) -> str | None:
    """Kompletność dowodu wyniku: z rekordów oceny — ``NIEPELNY``, gdy którykolwiek rekord ma
    dowód niepełny ALBO kryterium nie zostało rozstrzygnięte (nieocenione, bez podstawy, bez
    dowodu: dowód wyniku nie obejmuje tego kryterium, choć metadane dowodu rekordu są pełne);
    dla rodzaju bez kryteriów — ``NIEPELNY``, gdy wynik stoi na danej przyjętej; ``None``, gdy
    nie ma czego oceniać."""
    if oceny:
        stany = {str(o.get("kompletnosc_dowodu")) for o in oceny}
        if "NIEPELNY" in stany or any(
            o.get("status_maszynowy") in _STATUSY_NIEROZSTRZYGNIETE for o in oceny
        ):
            return "NIEPELNY"
        return "PELNY" if "PELNY" in stany else None
    return "NIEPELNY" if _ma_dane_przyjete(ladunek) else None
