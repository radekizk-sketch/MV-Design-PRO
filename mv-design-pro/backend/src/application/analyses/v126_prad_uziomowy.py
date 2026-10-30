"""Prąd zwarcia doziemnego stacji z modelu dla bezpieczeństwa uziomu V12.6 (EN 50522 tab. 1).

Karta UX-04/POLE-ZU-SKLADOWA-ZEROWA (commit 5): prąd, który odprowadza uziom stacji, nie jest
już liczbą wpisywaną w formularzu — przychodzi z modelu sieci, wg sposobu pracy punktu
neutralnego sieci, w której leży stacja:

- strona SN — każda galwanicznie połączona sieć SN szyn stacji (``enm.uziemienie_sekcji``):
  prąd solvera doziemienia sieci (I_C sieci izolowanej, I_res skompensowanej, I_F
  rezystorowej), prąd dławików I_L, informacja, czy dławik gaszący sieci stoi w tej stacji,
  i I″k1 rdzenia IEC 60909 (scenariusz MAX) — w stanie AWSC w spoczynku i, gdy sieć ma
  automatykę wymuszania składowej czynnej, także w stanie załączonym;
- strona WN — szyny WN tej samej stacji z wynikiem zwarcia jednofazowego IEC 60909 (sieć
  uziemiona przez małą impedancję); szyna WN bez drogi prądu zerowego nie daje przypadku
  (przyczyna nazwana).

Szyny nN stacji nie tworzą przypadku: EN 50522 dotyczy instalacji o napięciu powyżej 1 kV,
a uziom stacji SN/nN wymiaruje zwarcie po stronie SN.

Moduł nie liczy fizyki: składa przypadki z wyników solverów (``enm.canonical_analysis.
zwarcia_doziemne_szyn`` — ta sama droga co bieg zwarciowy). Wybór wielkości miarodajnej
EN 50522 tab. 1 i przypadku rozstrzygającego robi solver V12.6 (``_earthing``); ta sama
funkcja ``wielkosc_pradu_uziomowego`` rozstrzyga gotowość analizy (predykaty parami).

JEDNA funkcja (``doloz_prad_uziomowy``) dokłada przypadki do wejścia solvera dla uruchomienia
(``api.v126_academic.run_v126_analysis``) i dla gotowości (``v126_gotowosc.ocen_gotowosc_v126``).
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from enm.canonical_analysis import ZwarcieDoziemneSzyny, zwarcia_doziemne_szyn
from enm.models import EnergyNetworkModel
from enm.nazwy_elementow import nazwa_elementu
from enm.tor_pola import ZNACZNIK_SZYNY_POMOCNICZEJ
from enm.uziemienie_sekcji import UziemienieSekcji, uziemienie_sieci
from network_model.core.uziemienie import StanAwsc
from network_model.odmowa_danych import OdmowaDanychError
from network_model.pochodne.pasma_napieciowe import pasmo_napieciowe
from network_model.pochodne.punkt_neutralny import napiecie_fazowe_punktu_neutralnego_v
from network_model.solvers.doziemienie_sn import (
    PunktNeutralnyDoziemienia,
    prad_punktow_neutralnych_a,
)
from solver_input.v126_contracts import (
    V126AcademicInput,
    V126AnalysisType,
    V126PradUziomowyInput,
    V126PrzypadekPraduUziomowegoInput,
)
from werdykt import format_liczba
from werdykt.kontrakt import DanaPrzyjeta

_STAN_PL: dict[StanAwsc, str] = {"spoczynek": "AWSC w spoczynku", "zalaczony": "AWSC załączona"}


def _stacja_szyny(enm: EnergyNetworkModel, bus_ref: str) -> tuple[str, tuple[str, ...]]:
    """Nazwa stacji i szyny jej terenu: szyny stacji i zaciski torów jej pól (zespół
    uziemiający, transformator — urządzenia pól stoją na uziomie stacji). Szyna poza stacją —
    ona sama (nazwa szyny)."""
    stacje = sorted((s for s in enm.substations if bus_ref in s.bus_refs), key=lambda s: s.ref_id)
    if stacje:
        stacja = stacje[0]
        zaciski = {
            b.terminal_bus_ref
            for b in enm.bays
            if b.substation_ref == stacja.ref_id and b.terminal_bus_ref
        }
        # Kolejność: szyny stacji, potem zaciski pól — przy równym I″k1 przypadek nazywa szynę
        # stacji, nie zacisk urządzenia pola (``_najwiekszy_ikss`` bierze pierwszą z równych).
        szyny_wlasne = sorted({*stacja.bus_refs, bus_ref})
        return nazwa_elementu(stacja, "substations"), (
            *szyny_wlasne,
            *sorted(zaciski - set(szyny_wlasne)),
        )
    szyna = next(b for b in enm.buses if b.ref_id == bus_ref)
    return nazwa_elementu(szyna, "buses"), (bus_ref,)


def _dane(zapis: Any) -> list[DanaPrzyjeta]:
    wynik: list[DanaPrzyjeta] = []
    for dana in zapis or ():
        rekord = dana if isinstance(dana, DanaPrzyjeta) else DanaPrzyjeta.model_validate(dict(dana))
        if rekord not in wynik:
            wynik.append(rekord)
    return wynik


def _najwiekszy_ikss(
    zwarcia: Mapping[str, ZwarcieDoziemneSzyny], szyny: tuple[str, ...]
) -> ZwarcieDoziemneSzyny | None:
    """Szyna o największym I″k1; remis (do 1 µA — szyna i zacisk pola połączone łącznikiem
    bez impedancji) rozstrzyga kolejność ``szyny`` (szyna stacji przed zaciskiem pola);
    ``None`` bez wyniku."""
    z_wynikiem: list[tuple[float, ZwarcieDoziemneSzyny]] = []
    for szyna in szyny:
        ikss_a = zwarcia[szyna].ikss_a
        if ikss_a is not None:
            z_wynikiem.append((round(ikss_a, 6), zwarcia[szyna]))
    if not z_wynikiem:
        return None
    # ``max`` zwraca pierwszy z równych kluczy — kolejność wejścia jest deterministyczna.
    return max(z_wynikiem, key=lambda para: para[0])[1]


def _prad_dlawikow_stacji_a(
    sekcja: UziemienieSekcji, stan: StanAwsc, szyny_stacji: tuple[str, ...]
) -> float | None:
    """I_L dławików gaszących sieci przyłączonych w TEJ stacji [A] (EN 50522 tab. 1: instalacja
    z dławikiem odprowadza przez uziom także jego prąd) — prąd punktów neutralnych solvera
    doziemienia (I_N = Σ U_f/(Z_N + Z_0/3), I_L = −Im I_N) policzony tylko dla punktów tej
    stacji; ``None`` — w stacji nie ma dławika sieci w ruchu."""
    punkty: list[PunktNeutralnyDoziemienia] = []
    for punkt in sekcja.punkty_w_ruchu:
        ma_dlawik = any(g.rodzaj == "dlawik" for g in punkt.galezie_w_ruchu(stan)) or (
            punkt.rodzaj == "uzwojenie_transformatora" and punkt.typ_uzwojenia == "petersen_coil"
        )
        impedancje = punkt.impedancje_doziemienia(stan)
        if punkt.bus_ref in szyny_stacji and ma_dlawik and impedancje is not None:
            punkty.append(
                PunktNeutralnyDoziemienia(
                    nazwa_pl=punkt.nazwa_pl, z_n_ohm=impedancje[0], z0_tu_ohm=impedancje[1]
                )
            )
    if not punkty:
        return None
    u_f_v = napiecie_fazowe_punktu_neutralnego_v(sekcja.napiecie_kv)
    return -prad_punktow_neutralnych_a(u_f_v, tuple(punkty)).imag


def _przypadek_sn(
    sekcja: UziemienieSekcji,
    stan: StanAwsc,
    szyny: tuple[str, ...],
    szyny_stacji: tuple[str, ...],
    zwarcia: Mapping[str, ZwarcieDoziemneSzyny],
    wiele_stanow: bool,
) -> V126PrzypadekPraduUziomowegoInput:
    doziemienie = next(
        (zwarcia[s].doziemienie for s in szyny if zwarcia[s].doziemienie is not None), None
    )
    najwiekszy = _najwiekszy_ikss(zwarcia, szyny)
    reprezentant = najwiekszy.bus_ref if najwiekszy is not None else szyny[0]
    brak_ikss = (
        None
        if najwiekszy is not None
        else next((zwarcia[s].brak_pl for s in szyny if zwarcia[s].brak_pl), None)
        or "Zwarcie jednofazowe IEC 60909 szyn stacji nie dało wyniku."
    )
    i_l_stacji = _prad_dlawikow_stacji_a(sekcja, stan, szyny_stacji)
    nazwa = f"sieć SN {format_liczba(sekcja.napiecie_kv)} kV — {zwarcia[reprezentant].nazwa_pl}"
    if wiele_stanow:
        nazwa += f" ({_STAN_PL[stan]})"
    return V126PrzypadekPraduUziomowegoInput(
        strona="SN",
        nazwa_pl=nazwa,
        bus_ref=reprezentant,
        tryb=sekcja.tryb_doziemienia(stan),
        stan_awsc=stan,
        prad_doziemienia_a=None if doziemienie is None else doziemienie.get("prad_a"),
        i_l_a=i_l_stacji,
        ikss_a=None if najwiekszy is None else najwiekszy.ikss_a,
        dlawik_w_stacji=i_l_stacji is not None,
        brak_doziemienia_pl=(
            "Doziemienie sieci nie zostało policzone — węzły stacji bez danych składowej "
            "zerowej albo bez impedancji do odniesienia."
            if doziemienie is None
            else doziemienie.get("brak_pl")
        ),
        brak_ikss_pl=brak_ikss,
        dane_przyjete_doziemienia=_dane(
            None if doziemienie is None else doziemienie.get("dane_przyjete")
        ),
        dane_przyjete_ikss=_dane(None if najwiekszy is None else najwiekszy.dane_przyjete),
    )


def prad_uziomowy_z_modelu(enm: EnergyNetworkModel, bus_ref: str) -> V126PradUziomowyInput:
    """Przypadki zwarcia doziemnego stacji szyny ``bus_ref`` (strona SN i WN) z modelu."""
    if not any(b.ref_id == bus_ref for b in enm.buses):
        return V126PradUziomowyInput(
            bus_ref=bus_ref,
            nazwa_stacji_pl="stacja spoza modelu",
            brak_pl="Wskazana szyna stacji nie należy do modelu sieci.",
        )
    pomocnicze = {b.ref_id for b in enm.buses if ZNACZNIK_SZYNY_POMOCNICZEJ in (b.tags or [])}
    if bus_ref in pomocnicze:
        szyna = next(b for b in enm.buses if b.ref_id == bus_ref)
        return V126PradUziomowyInput(
            bus_ref=bus_ref,
            nazwa_stacji_pl=nazwa_elementu(szyna, "buses"),
            brak_pl=(
                f"„{nazwa_elementu(szyna, 'buses')}” jest węzłem pomocniczym (zacisk pola albo "
                "punkt podziału magistrali), nie szyną rozdzielni — uziom stacji wymiaruje się "
                "dla szyny stacji; wskaż szynę stacji."
            ),
        )
    nazwa_stacji, szyny_stacji = _stacja_szyny(enm, bus_ref)
    # Punkty zwarcia przypadków: szyny stacji bez węzłów pomocniczych — ta sama reguła co
    # punkty zwarcia biegu IEC 60909 (``enm.assembler``: szyna ``helper_bus`` nie jest celem
    # zwarcia). Zaciski pól zostają w ``szyny_stacji`` — wyznaczają, czy dławik stoi w stacji.
    szyny_zwarcia = tuple(s for s in szyny_stacji if s not in pomocnicze)
    napiecia = {b.ref_id: b.voltage_kv for b in enm.buses}
    szyny_wn = tuple(s for s in szyny_zwarcia if pasmo_napieciowe(napiecia.get(s)) == "WN")
    # Sieci SN stacji: każda galwanicznie połączona sieć SN (jedna prawda o sieciach SN —
    # ``uziemienie_sieci``), do której należy choć jedna szyna stacji, w kolejności modelu.
    sieci_sn = [
        (sekcja, tuple(s for s in szyny_zwarcia if s in sekcja.szyny))
        for sekcja in uziemienie_sieci(enm)
        if any(s in sekcja.szyny for s in szyny_zwarcia)
    ]
    if not sieci_sn and not szyny_wn:
        return V126PradUziomowyInput(
            bus_ref=bus_ref,
            nazwa_stacji_pl=nazwa_stacji,
            brak_pl=(
                f"Stacja „{nazwa_stacji}” nie ma szyny SN ani WN — EN 50522 dotyczy instalacji "
                "o napięciu powyżej 1 kV; prądu zwarcia doziemnego stacji nie wyznaczono."
            ),
        )
    przypadki: list[V126PrzypadekPraduUziomowegoInput] = []
    try:
        zwarcia = zwarcia_doziemne_szyn(enm, szyny_zwarcia, stan_awsc="spoczynek")
        zwarcia_awsc = (
            zwarcia_doziemne_szyn(
                enm,
                tuple(s for sekcja, szyny in sieci_sn if sekcja.ma_awsc for s in szyny),
                stan_awsc="zalaczony",
            )
            if any(sekcja.ma_awsc for sekcja, _ in sieci_sn)
            else {}
        )
    except OdmowaDanychError as exc:
        return V126PradUziomowyInput(
            bus_ref=bus_ref,
            nazwa_stacji_pl=nazwa_stacji,
            brak_pl=f"Zwarcia doziemnego stacji nie policzono: {exc}",
        )
    for sekcja, szyny in sieci_sn:
        przypadki.append(
            _przypadek_sn(sekcja, "spoczynek", szyny, szyny_stacji, zwarcia, sekcja.ma_awsc)
        )
        if sekcja.ma_awsc:
            przypadki.append(
                _przypadek_sn(sekcja, "zalaczony", szyny, szyny_stacji, zwarcia_awsc, True)
            )
    if szyny_wn:
        najwiekszy = _najwiekszy_ikss(zwarcia, szyny_wn)
        reprezentant = najwiekszy.bus_ref if najwiekszy is not None else szyny_wn[0]
        przypadki.append(
            V126PrzypadekPraduUziomowegoInput(
                strona="WN",
                nazwa_pl=(
                    f"sieć WN {format_liczba(napiecia[reprezentant])} kV — {zwarcia[reprezentant].nazwa_pl}"
                ),
                bus_ref=reprezentant,
                ikss_a=None if najwiekszy is None else najwiekszy.ikss_a,
                brak_ikss_pl=(
                    None
                    if najwiekszy is not None
                    else next((zwarcia[s].brak_pl for s in szyny_wn if zwarcia[s].brak_pl), None)
                    or "Zwarcie jednofazowe IEC 60909 szyn WN stacji nie dało wyniku."
                ),
                dane_przyjete_ikss=_dane(None if najwiekszy is None else najwiekszy.dane_przyjete),
            )
        )
    return V126PradUziomowyInput(bus_ref=bus_ref, nazwa_stacji_pl=nazwa_stacji, przypadki=przypadki)


def szyna_uziomu(parametry: Mapping[str, Any]) -> str | None:
    """Szyna stacji wskazana w danych uziomu projektanta (``earthing.bus_ref``) albo ``None``."""
    uziom = parametry.get("earthing")
    ref = uziom.get("bus_ref") if isinstance(uziom, Mapping) else None
    return ref if isinstance(ref, str) and ref else None


def doloz_prad_uziomowy(
    model: V126AcademicInput,
    enm: EnergyNetworkModel,
    rodzaj: V126AnalysisType,
    parametry: Mapping[str, Any],
) -> V126AcademicInput:
    """Wejście solvera z przypadkami prądu uziomowego z modelu — JEDNA funkcja uruchomienia
    i gotowości. Rodzaj inny niż bezpieczeństwo uziomu albo brak wskazanej szyny stacji —
    wejście bez zmian (warunek gotowości nazywa brak szyny)."""
    if rodzaj != V126AnalysisType.EARTHING_SAFETY:
        return model
    bus_ref = szyna_uziomu(parametry)
    if bus_ref is None:
        return model
    return model.model_copy(update={"prad_uziomowy": prad_uziomowy_z_modelu(enm, bus_ref)})
