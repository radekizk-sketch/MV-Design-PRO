"""Rodzina nadprądowa fazowa (50/51) w rejestrze rodzin — wiersze w tym samym wzorcu co rodziny
ziemnozwarciowe (ekran koordynacji E-28, raport PDF/DOCX).

PO CO. Projektant widzi zabezpieczenie nadprądowe jednym wierszem z własnym zestawem kolumn
(``rodziny_eaz.RODZINA_NADPRADOWA``): progi stopni I> i I>> z nastaw modelu, najmniejszy prąd
przekaźnika w strefie i współczynnik czułości k_c (bieg zwarciowy MINIMALNY), największy prąd
obciążenia i współczynnik odstrojenia k_b (bieg rozpływu), czas przy I″k,min z charakterystyką
stopnia decydującego oraz odstęp czasowy wobec zabezpieczenia nadrzędnego Δt (bieg MAKSYMALNY).

INTERPRETACJA, NIE FIZYKA. Liczby pochodzą ze sprawdzeń koordynacji (``SensitivityCheck``,
``OverloadCheck``, ``SelectivityCheck``) i nastaw z JEDNEJ ścieżki oceny nadprądowej; czas przy
I″k,min — z ``czas_urzadzenia`` (rdzeń IEC 60255, ta sama funkcja co ocena punktu). Sprawdzenia
koordynacji zostają bez werdyktu (P-06); wiersz rodziny niesie rekordy werdyktu wyjaśnialnego
(kontrakt werdyktu §3) z wymaganiem z tabeli źródeł (``k_c.nadpradowe``, ``k_b.nadpradowe``,
``delta_t``) — kryterium, wynik, limit z podstawą i stanem źródła, margines, zakres ważności.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from application.analyses.protection.coordination.models import (
    CoordinationAnalysisResult,
    CoordinationConfig,
)
from application.analyses.protection.ocena_nadpradowa import (
    ETYKIETY_KRZYWYCH_PL,
    NastawyUrzadzenia,
    OdmowaUrzadzenia,
    WynikOceny,
    czas_urzadzenia,
    stopnie_nadpradowe,
    zdania_brakow,
)
from application.analyses.protection.ocena_ziemnozwarciowa import (
    RekordOcenyZiemnozwarciowej,
    pola_sterownikow,
    stan_wiersza,
    uporzadkuj_wiersze_rodzin,
)
from application.analyses.protection.rodziny_eaz import (
    RODZINA_NADPRADOWA,
    WymaganieWspolczynnika,
    sprawdz_wartosci_wiersza,
    wymaganie_nadpradowe,
    zrodlo_wymagania,
)
from enm.models import EnergyNetworkModel
from network_model.catalog.wartosci_robocze import liczba_pl
from solver_input.provenance import classify_dynamic_capability
from werdykt import (
    DanaPrzyjeta,
    Kryterium,
    LimitKryterium,
    Niepewnosc,
    OdnosnikSladu,
    PodstawaWymagania,
    Przedmiot,
    StatusDanych,
    StatusDowodu,
    Stosowalnosc,
    Wielkosc,
    WynikKryterium,
    ZakresWaznosci,
    ocen_kryterium,
)
from werdykt.proweniencja import FieldQuality

ZDOLNOSC = "zabezpieczenia.ocena_nadpradowa"
ZRODLO_KRYTERIOW_PL = "kryteria koordynacji podane w żądaniu biegu koordynacji"

_NIEPEWNOSC = Niepewnosc(
    nie_dotyczy=True,
    powod_pl=(
        "prądy z rozwiązania IEC 60909 i rozpływu mocy, czas z charakterystyki IEC 60255 — "
        "ilorazy i różnice wyników bez dyskretyzacji, niepewność numeryczna nie dotyczy"
    ),
)
_ZAKRES = ZakresWaznosci(
    rodzaj_analizy="SHORT_CIRCUIT",
    opis_pl=(
        "Zwarcia międzyfazowe IEC 60909 w strefie zabezpieczenia (bieg minimalny — czułość, "
        "bieg maksymalny — stopniowanie) i prąd obciążenia z biegu rozpływu mocy"
    ),
    wykluczenia=(
        "zwarcia doziemne (ocenia je ocena zabezpieczeń ziemnozwarciowych)",
        "prąd rozruchu silników i udar załączenia transformatorów (brak w modelu biegu)",
        "błędy przekładników prądowych poza nasyceniem ocenianym w punkcie",
        "czas własny wyłącznika poza założeniami odstępu czasowego Δt",
    ),
)

_WZOR_K_C = r"k_c = \dfrac{I''_{k,\min}}{I_{s}} \ge k_{c,\mathrm{wym}}"
_WZOR_K_B = r"k_b = \dfrac{I_{s}}{I_{\mathrm{obc},\max}} \ge k_{b,\mathrm{wym}}"
_WZOR_DT = r"\Delta t = t_{\mathrm{nad}} - t_{\mathrm{pod}} \ge \Delta t_{\mathrm{wym}}"


def _komorka(
    wartosc: float | None,
    jednostka: str,
    *,
    spelnia: bool | None = None,
    powod_pl: str | None = None,
    tekst: str | None = None,
) -> dict[str, Any]:
    return {
        "wartosc": wartosc,
        "jednostka": jednostka,
        "spelnia": spelnia,
        "powod_pl": powod_pl,
        "tekst": tekst,
    }


def _dowod(dane: tuple[DanaPrzyjeta, ...]) -> StatusDowodu:
    zdolnosc = classify_dynamic_capability(ZDOLNOSC)
    return StatusDowodu(
        metoda="OBLICZENIE",
        poziom=zdolnosc.tier,
        rodzaj_twierdzenia=zdolnosc.claim_kind,
        status_modelu="NIE_DOTYCZY",
        status_danych=(
            StatusDanych(stan="UNVALIDATED_INPUT", dane_przyjete=dane)
            if dane
            else StatusDanych(stan="ZWALIDOWANE")
        ),
        odniesienie="koordynacja zabezpieczeń na biegach zwarciowych i rozpływu",
    )


def _dane_wymagania(w: WymaganieWspolczynnika, nazwa: str) -> tuple[DanaPrzyjeta, ...]:
    if not w.przyjete:
        return ()
    return (
        DanaPrzyjeta(
            nazwa_pl=f"wymagany {w.symbol} zabezpieczenia {nazwa}",
            wartosc=Wielkosc(wartosc=w.wartosc, jednostka="1"),
            powod_pl=w.uzasadnienie_pl,
            jakosc=FieldQuality.ESTIMATED,
        ),
    )


def _rekord(
    *,
    nastawy: NastawyUrzadzenia,
    kryterium: str,
    opis: str,
    wzor_latex: str,
    symbol_latex: str,
    wartosc: float,
    jednostka: str,
    limit: float,
    podstawa: PodstawaWymagania,
    punkt_pl: str | None,
    dane: tuple[DanaPrzyjeta, ...],
    slad_pl: str,
) -> RekordOcenyZiemnozwarciowej:
    ocena = ocen_kryterium(
        kryterium_id=f"zabezpieczenia.nadpradowe.{nastawy.urzadzenie_ref}.{kryterium}",
        przedmiot=Przedmiot(
            element_ref=nastawy.urzadzenie_ref,
            nazwa_pl=nastawy.nazwa_pl,
            opis_pl=f"Zabezpieczenie nadprądowe {nastawy.nazwa_pl} — {opis}",
        ),
        kryterium=Kryterium(opis_pl=opis, warunek_latex=wzor_latex, relacja="NIE_MNIEJ"),
        podstawa=podstawa,
        stosowalnosc=Stosowalnosc(
            dotyczy=True,
            powod_pl="stopnie 51/50 włączone w sterowniku modelu, strefa wyznaczona z topologii",
        ),
        wynik=WynikKryterium(
            wielkosc_pl=opis,
            symbol_latex=symbol_latex,
            wartosc=Wielkosc(wartosc=wartosc, jednostka=jednostka),
            punkt_krytyczny_pl=punkt_pl,
            metoda="OBLICZENIE",
        ),
        limit=LimitKryterium(
            wartosc=Wielkosc(wartosc=limit, jednostka=jednostka), podstawa=podstawa
        ),
        niepewnosc=_NIEPEWNOSC,
        dowod=_dowod(dane),
        zakres_waznosci=_ZAKRES,
        slad=[
            OdnosnikSladu(krok=f"koordynacja:{nastawy.urzadzenie_ref}:{kryterium}", opis_pl=slad_pl)
        ],
    )
    return RekordOcenyZiemnozwarciowej(
        urzadzenie_ref=nastawy.urzadzenie_ref,
        nazwa_urzadzenia_pl=nastawy.nazwa_pl,
        funkcja_ref=None,
        kod="51",
        kryterium=kryterium,
        ocena=ocena,
    )


def _podstawa_dt(delta_t_s: float, config: CoordinationConfig) -> PodstawaWymagania:
    z = zrodlo_wymagania("delta_t")
    return PodstawaWymagania(
        rodzaj="ZALOZENIE_PROJEKTOWE",
        dokument="Założenia koordynacji zabezpieczeń projektu (odstęp czasowy selektywności)",
        wydanie="konfiguracja koordynacji MV-DESIGN-PRO",
        jednostka_redakcyjna=(
            f"Δt = {liczba_pl(config.breaker_time_s)} + {liczba_pl(config.relay_overtravel_s)} "
            f"+ {liczba_pl(config.safety_factor_s)} = {liczba_pl(delta_t_s)} s"
        ),
        status="WSKAZANE",
        uwagi_pl=z.odwolanie_pl,
    )


def _funkcja_ref(stopnie: Mapping[str, str], kod: str) -> str:
    return stopnie.get(kod) or stopnie.get("51") or stopnie.get("50") or kod


def wiersze_nadpradowe(
    *,
    model: EnergyNetworkModel,
    wynik: CoordinationAnalysisResult,
    ocena_max: WynikOceny,
    config: CoordinationConfig,
) -> dict[str, Any]:
    """Pole ``nadpradowe`` wyniku koordynacji: rodzina, wiersze (jeden na urządzenie), rekordy
    werdyktu i odmowy — kształt ``WynikOcenyZiemnozwarciowej`` (ten sam komponent tabeli
    rodziny i ta sama funkcja raportu)."""
    stopnie_modelu = {
        a.ref_id: {s.funkcja: s.funkcja_ref for s in stopnie_nadpradowe(a)}
        for a in model.protection_assignments
    }
    # Identyfikacja wiersza jak w rodzinach ziemnozwarciowych: „Pole” = nazwa pola z modelu,
    # nazwa sterownika w podpowiedzi; urządzenie bez pola — jego własna nazwa.
    pola_modelu = {ref: p.nazwa_wiersza_pl for ref, p in pola_sterownikow(model).items()}
    czulosc = {c.device_id: c for c in wynik.sensitivity_checks}
    przeciazalnosc = {c.device_id: c for c in wynik.overload_checks}
    odstepy: dict[str, list[Any]] = {}
    for c in wynik.selectivity_checks:
        odstepy.setdefault(c.downstream_device_id, []).append(c)
    odmowy_ref = {o.urzadzenie_ref: o for o in ocena_max.odmowy}
    delta_t_wym = config.get_minimum_grading_margin_s()
    w_k_c = wymaganie_nadpradowe(
        "k_c.nadpradowe", config.sensitivity_ratio_required, zrodlo_pl=ZRODLO_KRYTERIOW_PL
    )
    w_k_b = wymaganie_nadpradowe(
        "k_b.nadpradowe", config.overload_ratio_required, zrodlo_pl=ZRODLO_KRYTERIOW_PL
    )
    podstawa_dt = _podstawa_dt(delta_t_wym, config)

    rekordy: list[RekordOcenyZiemnozwarciowej] = []
    odmowy: list[RekordOcenyZiemnozwarciowej] = []
    wiersze: list[dict[str, Any]] = []
    urzadzenia: list[NastawyUrzadzenia | OdmowaUrzadzenia] = sorted(
        [
            *ocena_max.nastawy,
            *(
                o
                for o in ocena_max.odmowy
                if o.urzadzenie_ref not in {n.urzadzenie_ref for n in ocena_max.nastawy}
            ),
        ],
        key=lambda u: u.urzadzenie_ref,
    )
    for u in urzadzenia:
        ref = u.urzadzenie_ref
        stopnie = stopnie_modelu.get(ref, {})
        odmowa = odmowy_ref.get(ref)
        nastawy = u if isinstance(u, NastawyUrzadzenia) else None
        rekordy_u: list[RekordOcenyZiemnozwarciowej] = []
        wartosci: dict[str, dict[str, Any]] = {}
        wzory: list[dict[str, str]] = []
        wymagania: dict[str, dict[str, Any]] = {}
        if odmowa is not None:
            rekord = RekordOcenyZiemnozwarciowej(
                urzadzenie_ref=ref,
                nazwa_urzadzenia_pl=odmowa.nazwa_pl,
                funkcja_ref=_funkcja_ref(stopnie, "51"),
                kod="51",
                kryterium="ODMOWA",
                ocena=odmowa.ocena,
                dodatkowe={
                    "braki": [b.to_dict() for b in odmowa.braki],
                    "braki_pl": list(zdania_brakow(odmowa.braki, z_funkcja=True)),
                },
            )
            odmowy.append(rekord)
            rekordy_u.append(rekord)
        if nastawy is not None and odmowa is None:
            progi = {s.funkcja: s for s in nastawy.stopnie}
            for kod, klucz in (("51", "prog_i1"), ("50", "prog_i2")):
                if kod in progi:
                    wartosci[klucz] = _komorka(progi[kod].prog_pierwotny_a, "A")
            sc = czulosc.get(ref)
            if sc is not None and sc.i_fault_min_a is not None:
                wartosci["ik_min"] = _komorka(sc.i_fault_min_a, "A", powod_pl=sc.nazwa_punktu_pl)
                _, decydujacy = czas_urzadzenia(nastawy.stopnie, sc.i_fault_min_a)
                if decydujacy is not None:
                    wartosci["t"] = _komorka(float(decydujacy["t_s"]), "s")
                    krzywa = str(decydujacy["krzywa"])
                    wartosci["charakterystyka"] = _komorka(
                        None,
                        "",
                        tekst=f"{decydujacy['etykieta_pl']}: {ETYKIETY_KRZYWYCH_PL.get(krzywa, krzywa)}",
                    )
            if sc is not None and sc.ratio is not None and sc.i_pickup_a is not None:
                spelnia = sc.ratio >= w_k_c.wartosc
                wartosci["k_c"] = _komorka(sc.ratio, "1", spelnia=spelnia, powod_pl=sc.notes_pl)
                wymagania["k_c"] = w_k_c.to_dict()
                wzory.append(
                    {
                        "symbol_latex": "k_c",
                        "wzor_latex": (
                            rf"k_c = \dfrac{{{liczba_pl(sc.i_fault_min_a or 0.0)}\,\mathrm{{A}}}}"
                            rf"{{{liczba_pl(sc.i_pickup_a)}\,\mathrm{{A}}}} = {liczba_pl(sc.ratio)}"
                        ),
                    }
                )
                rekordy_u.append(
                    _rekord(
                        nastawy=nastawy,
                        kryterium="WSPOLCZYNNIK_CZULOSCI",
                        opis="współczynnik czułości k_c przy zwarciu minimalnym w strefie",
                        wzor_latex=_WZOR_K_C,
                        symbol_latex="k_c",
                        wartosc=sc.ratio,
                        jednostka="1",
                        limit=w_k_c.wartosc,
                        podstawa=w_k_c.podstawa,
                        punkt_pl=sc.nazwa_punktu_pl,
                        dane=_dane_wymagania(w_k_c, nastawy.nazwa_pl),
                        slad_pl=sc.notes_pl,
                    )
                )
            oc = przeciazalnosc.get(ref)
            if oc is not None:
                wartosci["i_obc"] = _komorka(
                    oc.i_operating_a, "A", powod_pl=None if oc.i_operating_a else oc.notes_pl
                )
            if oc is not None and oc.ratio is not None:
                spelnia = oc.ratio >= w_k_b.wartosc
                wartosci["k_b"] = _komorka(oc.ratio, "1", spelnia=spelnia, powod_pl=oc.notes_pl)
                wymagania["k_b"] = w_k_b.to_dict()
                wzory.append(
                    {
                        "symbol_latex": "k_b",
                        "wzor_latex": (
                            rf"k_b = \dfrac{{{liczba_pl(oc.i_pickup_a or 0.0)}\,\mathrm{{A}}}}"
                            rf"{{{liczba_pl(oc.i_operating_a or 0.0)}\,\mathrm{{A}}}} "
                            rf"= {liczba_pl(oc.ratio)}"
                        ),
                    }
                )
                rekordy_u.append(
                    _rekord(
                        nastawy=nastawy,
                        kryterium="WSPOLCZYNNIK_ODSTROJENIA",
                        opis="współczynnik odstrojenia k_b od największego prądu obciążenia",
                        wzor_latex=_WZOR_K_B,
                        symbol_latex="k_b",
                        wartosc=oc.ratio,
                        jednostka="1",
                        limit=w_k_b.wartosc,
                        podstawa=w_k_b.podstawa,
                        punkt_pl=None,
                        dane=_dane_wymagania(w_k_b, nastawy.nazwa_pl),
                        slad_pl=oc.notes_pl,
                    )
                )
            z_odstepem = [c for c in odstepy.get(ref, []) if c.margin_s is not None]
            if z_odstepem:
                najmniejszy = min(z_odstepem, key=lambda c: (c.margin_s, c.punkt_ref or ""))
                wartosci["delta_t"] = _komorka(
                    najmniejszy.margin_s,
                    "s",
                    spelnia=najmniejszy.margin_s >= delta_t_wym,
                    powod_pl=najmniejszy.notes_pl,
                )
                rekordy_u.append(
                    _rekord(
                        nastawy=nastawy,
                        kryterium="STOPNIOWANIE_CZASOWE",
                        opis="odstęp czasowy Δt wobec zabezpieczenia nadrzędnego",
                        wzor_latex=_WZOR_DT,
                        symbol_latex=r"\Delta t",
                        wartosc=float(najmniejszy.margin_s),
                        jednostka="s",
                        limit=delta_t_wym,
                        podstawa=podstawa_dt,
                        punkt_pl=najmniejszy.nazwa_punktu_pl,
                        dane=(),
                        slad_pl=najmniejszy.notes_pl,
                    )
                )
        rekordy.extend(r for r in rekordy_u if r.kryterium != "ODMOWA")
        sprawdz_wartosci_wiersza("NADPRADOWE", set(wartosci))
        stan, przyczyna, etykieta = stan_wiersza(rekordy_u)
        braki = list(odmowa.braki) if odmowa is not None else []
        nazwa = odmowa.nazwa_pl if odmowa is not None else u.nazwa_pl
        wiersze.append(
            {
                "rodzina": "NADPRADOWE",
                "urzadzenie_ref": ref,
                "funkcja_ref": _funkcja_ref(stopnie, "51"),
                "kod": "51",
                "ansi": "51/50",
                "oznaczenie_pl": "I>, I>>",
                "etykieta_pl": "I> (51), I>> (50)",
                "pole_pl": pola_modelu.get(ref) or nazwa,
                "sterownik_pl": nazwa,
                "grupa": None,
                "stan": stan,
                "etykieta": etykieta,
                "przyczyna_pl": przyczyna,
                "wartosci": wartosci,
                "wymagania": wymagania,
                "wzory": wzory,
                "warunki_67n": None,
                "wykres_wskazowy": None,
                "kryteria": [r.ocena.kryterium_id for r in rekordy_u],
                "braki": [b.to_dict() for b in braki],
                "braki_pl": list(zdania_brakow(braki, z_funkcja=True)) if braki else [],
            }
        )
    return {
        "oceny": [r.to_dict() for r in rekordy],
        "uziemienia": [],
        "odmowy": [r.to_dict() for r in odmowy],
        "rodziny": [RODZINA_NADPRADOWA.to_dict()],
        "wiersze": uporzadkuj_wiersze_rodzin(model, wiersze),
    }
