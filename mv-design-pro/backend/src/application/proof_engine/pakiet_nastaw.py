"""Pakiet dowodowy NASTAW zabezpieczeń I>/I>> — brama biegu zbiorczego (karta PACK-NASTAWY).

STATUS: CANONICAL (domknięcie długu PACK-DLUG-NASTAWY, rejestr V12K wiersz
PACK-BEZ-KONSUMENTA).

Ta brama jest SIOSTRZANA względem `application/proof_engine/pakiet_biegu.py`, ale
NIE jest w niej rodzajem — `pakiet_biegu.py` mapuje JEDEN przebieg na JEDEN pakiet,
a nastawy metodą Hoppela z definicji potrzebują TRZECH biegów (kotwica c_max + wariant
c_min + wariant rozpływu, patrz `application/protection_settings/batch_run.py`) oraz
DWÓCH dodatkowych parametrów wyboru inżyniera (który odcinek, która szyna kolejnej
strefy) — więcej niż jeden opcjonalny `punkt`, którym operuje brama sióstr.

WZORZEC IDENTYCZNY: dostępność i budowa czytają JEDNO źródło prawdy (funkcje modułu
`batch_run.py`), więc „dostępny" nie może rozjechać się z „da się pobrać" (reguła
predykatów parami). To zdanie było DEKLARACJĄ BEZ TESTU do karty HARNESS-RESZTA-2
(2026-09-17): dostępność czytała tylko topologię i komplet danych katalogowych,
a budowa wymagała DODATKOWO prądu zwarcia 3F na trzech szynach — na sześciu
sieciach repozytorium dawało to 12 reklamowanych par i 0 działających (pomiar
w docstringu `batch_run.szyna_ma_prad_zwarciowy`). Oba końce czytają teraz ten
sam predykat, a parytet pilnuje `tests/application/test_pakiet_nastaw.py::
test_kazda_reklamowana_para_dostepnosci_daje_nastawy_na_kazdej_sieci_rejestru`
(iloczyn cech: sieć rejestru × reklamowana para odcinek/szyna × obie strony
predykatu).
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from application.analyses.protection.catalog.mapper import wymaganie_z_nastaw
from application.analyses.protection.catalog.pipeline import dopasuj_do_aparatu
from application.proof_engine.packs.protection_settings import (
    ProtectionSettingsProofInput,
    ProtectionSettingsProofPack,
)
from application.proof_engine.proof_pack import ProofPackContext, resolve_mv_design_pro_version
from application.protection_settings.batch_run import (
    C_MAX_MIN_DOPUSZCZALNY,
    BrakDanychNastawError,
    DaneLinii,
    kandydaci_nastepnej_szyny,
    linie_kandydujace,
    oblicz_nastawy,
    szyna_ma_prad_zwarciowy,
)
from application.protection_settings.zacisk_zabezpieczenia import (
    ZACISKI,
    OdmowaZacisku,
    Zacisk,
    ZaciskZabezpieczenia,
    rozstrzygnij_zacisk,
    zaciski_galezi,
)
from enm.canonical_analysis import CanonicalRun

_POWOD_KOTWICA_NIEZAKONCZONA = (
    "Przebieg nie zakończył się wynikiem — pakiet nastaw powstaje wyłącznie z "
    "zakończonego zwarcia trójfazowego. Uruchom obliczenie ponownie."
)
_POWOD_KOTWICA_ZLY_RODZAJ = (
    "Pakiet nastaw wymaga jako kotwicy przebiegu zwarcia trójfazowego (gałąź "
    "maksymalna c_max) — ten przebieg jest innego rodzaju."
)
_POWOD_KOTWICA_NIE_JEST_MAX = (
    "Ten przebieg jest wariantem MINIMALNYM (współczynnik napięciowy c < 1,0) — "
    "pakiet nastaw wymaga kotwicy z gałęzi MAKSYMALNEJ (c_max ≥ 1,0, IEC 60909-0 "
    "Tabela 1). Uruchom zwarcie trójfazowe z wariantem maksymalnym."
)
_POWOD_BRAK_LINII = (
    "Migawka tego przebiegu nie zawiera żadnej linii ani kabla z kompletem danych "
    "katalogowych (przekrój, materiał przewodu, prąd znamionowy) — nastaw nie da "
    "się dobrać bez tych danych."
)
_POWOD_BRAK_PARY_Z_PRADEM = (
    "Żaden odcinek tej migawki nie ma kompletu trzech szyn z policzonym prądem "
    "zwarcia trójfazowego (początek i koniec chronionego odcinka oraz kolejna "
    "szyna strefy selektywności). Nastawy I>/I>> liczą się wyłącznie z prądów "
    "zwarciowych w tych trzech punktach — szyny pomocnicze magistrali nie są "
    "raportowalnymi punktami zwarcia. Wstaw stację na odcinku (jej szyna SN jest "
    "punktem raportowalnym) albo wskaż odcinek między dwiema szynami stacyjnymi."
)


class PakietNastawError(ValueError):
    """Pakietu nastaw nie da się zbudować dla tych parametrów (powód po polsku).

    `kod` — kod z kanonu kodów gotowości, gdy odmowa go niesie (zacisk zabezpieczenia).
    """

    def __init__(self, powod_pl: str, *, kod: str | None = None) -> None:
        super().__init__(powod_pl)
        self.kod = kod


def dostepnosc_pakietu_nastaw(run: CanonicalRun) -> dict[str, Any]:
    """Opis dostępności pakietu dowodowego nastaw dla PODANEGO przebiegu-kotwicy.

    Lista `linie` — kandydaci na chroniony odcinek — pochodzi z TEJ SAMEJ funkcji
    (`linie_kandydujace`), której użyje budowa. Każda linia niesie zacisk zabezpieczenia
    z modelu (`zacisk_z_modelu`), znacznik `wymaga_wskazania_zacisku`, zaciski, które
    budowa przyjmie (`zaciski_dozwolone`), etykiety obu zacisków z nazwami szyn
    (`zaciski`), rekord odmowy bez wskazania (`odmowa_zacisku`) i listy kandydatów
    kolejnej szyny osobno dla każdego zacisku (`nastepne_szyny_wg_zacisku`, lista pusta
    — zacisk niedozwolony albo linia bez rozgałęzienia za końcem).
    """
    if run.status != "FINISHED":
        return _niedostepny(run, _POWOD_KOTWICA_NIEZAKONCZONA)
    if run.analysis_type != "short_circuit_sn":
        return _niedostepny(run, _POWOD_KOTWICA_ZLY_RODZAJ)
    if (run.raw_result or {}).get("short_circuit_type") != "3F":
        return _niedostepny(run, _POWOD_KOTWICA_ZLY_RODZAJ)
    # Predykaty parami (karta W3-C1): `zbuduj_wejscie_nastaw` odmawia kotwicy
    # spoza gałęzi maksymalnej (`c_factor < C_MAX_MIN_DOPUSZCZALNY`) PO stronie
    # budowy — bez tego samego warunku TU, dostępność mówiłaby „tak", a budowa
    # zaraz potem 422 z tym samym powodem, którego dostępność mogła nazwać od razu.
    # Domyślne 1.10 jest TĄ SAMĄ wartością domyślną, której używa
    # `zbuduj_wejscie_nastaw` przy braku `c_factor` w opcjach kotwicy — inaczej
    # dwa niezależne domysły „co, gdy brak danej" mogłyby się rozjechać.
    c_factor = run.options.get("c_factor", 1.10)
    if not isinstance(c_factor, int | float) or c_factor < C_MAX_MIN_DOPUSZCZALNY:
        return _niedostepny(run, _POWOD_KOTWICA_NIE_JEST_MAX)

    linie = linie_kandydujace(run.snapshot)
    if not linie:
        return _niedostepny(run, _POWOD_BRAK_LINII)

    # PREDYKAT PARAMI (karta HARNESS-RESZTA-2, 2026-09-17). Do tej karty ta
    # funkcja filtrowała kandydatów WYŁĄCZNIE topologią i kompletem danych
    # katalogowych, a `zbuduj_wejscie_nastaw` odmawiała potem każdej parze, w
    # której którakolwiek z TRZECH szyn (początek i koniec chronionego odcinka,
    # kolejna szyna) nie była raportowalnym punktem zwarcia kotwicy. Pomiar na
    # HEAD: 12 reklamowanych par na 6 sieciach repozytorium, 0 działających —
    # pełny rozkład w docstringu `batch_run.szyna_ma_prad_zwarciowy`. Teraz oba
    # końce czytają TEN SAM predykat. Od decyzji O-51 także TEN SAM resolver zacisku
    # zabezpieczenia (`_pozycja_dostepnosci`) — orientacja odcinka nie jest konwencją.
    pozycje = [
        pozycja for linia in linie if (pozycja := _pozycja_dostepnosci(run, linia)) is not None
    ]
    if not any(any(p["nastepne_szyny_wg_zacisku"].values()) for p in pozycje):
        return _niedostepny(run, _powod_braku_pary(pozycje))

    return {
        "run_id": str(run.id),
        "dostepny": True,
        "powod_pl": None,
        "linie": pozycje,
    }


def _pozycja_dostepnosci(run: CanonicalRun, linia: DaneLinii) -> dict[str, Any] | None:
    """Pozycja linii w dostępności — TEN SAM resolver zacisku co budowa (predykaty parami).

    Decyzja O-51 (wariant (b)): dozwolone zaciski to dokładnie te, dla których
    `rozstrzygnij_zacisk` — wołany przez budowę — rozstrzyga wskazanie; zacisk z modelu
    i odmowa bez wskazania to wynik tego samego wywołania z `None`. Kandydaci kolejnej
    szyny liczą się ZA KOŃCEM odcinka osobno dla każdego zacisku
    (`nastepne_szyny_wg_zacisku`); zacisk niedozwolony ma listę pustą. `odmowa_zacisku`
    to rekord, który budowa zwróciłaby bez wskazania — interfejs pokazuje go wprost, bez
    własnego tekstu. Linia bez prądu zwarcia 3F na obu zaciskach nie jest kandydatem
    (budowa wymaga Ik3 na początku i końcu odcinka niezależnie od orientacji).
    """
    wynik = run.raw_result
    if not (
        szyna_ma_prad_zwarciowy(wynik, linia.from_bus_ref)
        and szyna_ma_prad_zwarciowy(wynik, linia.to_bus_ref)
    ):
        return None
    zaciski = zaciski_galezi(run.snapshot, linia.ref_id)
    if zaciski is None:
        return None
    bez_wskazania = rozstrzygnij_zacisk(run.snapshot, linia.ref_id, None)
    dozwolone: tuple[Zacisk, ...] = tuple(
        zacisk
        for zacisk in ZACISKI
        if isinstance(
            rozstrzygnij_zacisk(run.snapshot, linia.ref_id, zacisk),
            ZaciskZabezpieczenia,
        )
    )
    odmowa = bez_wskazania if isinstance(bez_wskazania, OdmowaZacisku) else None
    return {
        "line_id": linia.ref_id,
        "nazwa": linia.nazwa,
        "zacisk_z_modelu": (
            bez_wskazania.zacisk if isinstance(bez_wskazania, ZaciskZabezpieczenia) else None
        ),
        "wymaga_wskazania_zacisku": odmowa is not None and bool(dozwolone),
        "zaciski_dozwolone": list(dozwolone),
        "odmowa_zacisku": odmowa.to_dict() if odmowa is not None else None,
        "zaciski": zaciski.to_dict(),
        "nastepne_szyny_wg_zacisku": {
            zacisk: (
                [
                    szyna
                    for szyna in kandydaci_nastepnej_szyny(run.snapshot, linia.ref_id, zacisk)
                    if szyna_ma_prad_zwarciowy(wynik, szyna)
                ]
                if zacisk in dozwolone
                else []
            )
            for zacisk in ZACISKI
        },
    }


def _powod_braku_pary(pozycje: list[dict[str, Any]]) -> str:
    """Powód niedostępności, gdy żadna linia nie daje pary odcinek/szyna.

    Linia bez żadnego dozwolonego zacisku (wyłącznik z przypięciem w pętli z oboma
    zaciskami) nie ma pary z powodu odmowy zacisku, nie z braku prądu zwarciowego — powód
    nazywa wtedy tę odmowę wprost (rekord resolvera), a ogólny powód braku prądu dochodzi
    tylko wtedy, gdy istnieje też linia z dozwolonym zaciskiem i bez pary (albo żadnej
    pozycji).
    """
    odmowy = [p["odmowa_zacisku"]["powod_pl"] for p in pozycje if not p["zaciski_dozwolone"]]
    bez_odmowy = [p for p in pozycje if p["zaciski_dozwolone"]]
    czesci = [*odmowy]
    if bez_odmowy or not pozycje:
        czesci.append(_POWOD_BRAK_PARY_Z_PRADEM)
    return " ".join(czesci)


def _niedostepny(run: CanonicalRun, powod_pl: str) -> dict[str, Any]:
    return {
        "run_id": str(run.id),
        "dostepny": False,
        "powod_pl": powod_pl,
        "linie": [],
    }


def zbuduj_pakiet_nastaw(
    run: CanonicalRun,
    *,
    line_id: str,
    next_bus_id: str,
    c_min: float,
    zacisk_zabezpieczenia: Zacisk | None,
    delta_t_s: float = 0.3,
    k_b: float = 1.2,
    k_bth: float = 1.1,
    uow_factory: Callable[[], Any] | None = None,
) -> tuple[str, bytes]:
    """Zbuduj pakiet dowodowy nastaw: ``(nazwa_pliku, zawartość ZIP)``.

    Cała fizyka (dwa warianty zwarciowe + wariant rozpływu) po stronie serwera —
    wołający podaje wyłącznie tożsamość kotwicy i trzy wybory inżynierskie.
    """
    try:
        nastawy = oblicz_nastawy(
            run,
            line_id=line_id,
            next_bus_id=next_bus_id,
            c_min=c_min,
            zacisk_zabezpieczenia=zacisk_zabezpieczenia,
            delta_t_s=delta_t_s,
            k_b=k_b,
            k_bth=k_bth,
            uow_factory=uow_factory,
        )
    except BrakDanychNastawError as exc:
        raise PakietNastawError(str(exc), kod=exc.kod) from exc

    wejscie = nastawy.wejscie
    wynik_silnika = nastawy.wynik
    ei = wejscie.engine_input

    pack_input = ProtectionSettingsProofInput(
        project_name=wejscie.project_name,
        case_name=wejscie.case_name,
        line_id=ei.line_id,
        line_name=wejscie.line_name,
        run_timestamp=wejscie.run_timestamp,
        solver_version=wejscie.solver_version,
        cross_section_mm2=ei.cross_section_mm2,
        conductor_material=ei.conductor_material,
        length_km=ei.length_km,
        i_nominal_a=ei.i_nominal_a,
        ik3_max_beginning_a=ei.ik3_max_beginning_a,
        ik3_min_beginning_a=ei.ik3_min_beginning_a,
        ik3_max_end_a=ei.ik3_max_end_a,
        ik3_min_end_a=ei.ik3_min_end_a,
        ik2_min_end_a=ei.ik2_min_end_a,
        ik_max_next_bus_a=ei.ik_max_next_bus_a,
        i_load_max_a=ei.i_load_max_a,
        i_delayed_a=wynik_silnika.delayed.i_setting_a,
        t_delayed_s=wynik_silnika.delayed.t_setting_s,
        i_instantaneous_a=wynik_silnika.instantaneous.i_setting_a,
        i_th_dop_a=wynik_silnika.thermal.i_th_dop_a,
        j_thn=wynik_silnika.thermal.j_thn,
        delta_t_s=ei.delta_t_s,
        k_b=ei.k_b,
        k_bth=ei.k_bth,
    )

    context = ProofPackContext(
        project_id=str(run.project_id or ""),
        case_id=str(run.case_id),
        run_id=str(run.id),
        snapshot_id=str(run.snapshot_hash),
        mv_design_pro_version=resolve_mv_design_pro_version(),
    )
    try:
        zawartosc = ProtectionSettingsProofPack.generate_zip(pack_input, context)
    except (KeyError, ValueError) as exc:
        raise PakietNastawError(f"Nie udało się złożyć pakietu dowodowego nastaw: {exc}") from exc
    nazwa = f"pakiet_dowodowy_nastawy__{run.id}__{line_id}.zip"
    return nazwa, zawartosc


def zbuduj_odpowiedz_nastaw_json(
    run: CanonicalRun,
    *,
    line_id: str,
    next_bus_id: str,
    c_min: float,
    zacisk_zabezpieczenia: Zacisk | None,
    delta_t_s: float = 0.3,
    k_b: float = 1.2,
    k_bth: float = 1.1,
    uow_factory: Callable[[], Any] | None = None,
) -> dict[str, Any]:
    """Nastawy I>/I>> w postaci JSON — TA SAMA fizyka co pakiet dowodowy ZIP
    (karta W3-C1, reguła KLASA-NIE-INSTANCJA: jeden rachunek — `oblicz_nastawy`
    — dwa rendery, ZIP i JSON — nigdy druga niezależna ścieżka).

    Zwraca ``wynik`` (`ProtectionSettingsResult.to_dict()`), ``wejscie``
    (proweniencja: kotwica, gałąź maksymalna/minimalna, chroniony odcinek,
    kolejna szyna, parametry inżynierskie) i ``dostepnosc_pakietu`` (zawsze
    ``True`` gdy ta funkcja zwróciła wynik — fizyka pakietu ZIP jest DOKŁADNIE
    tą samą, którą właśnie policzono).
    """
    try:
        nastawy = oblicz_nastawy(
            run,
            line_id=line_id,
            next_bus_id=next_bus_id,
            c_min=c_min,
            zacisk_zabezpieczenia=zacisk_zabezpieczenia,
            delta_t_s=delta_t_s,
            k_b=k_b,
            k_bth=k_bth,
            uow_factory=uow_factory,
        )
    except BrakDanychNastawError as exc:
        raise PakietNastawError(str(exc), kod=exc.kod) from exc

    return {
        "wynik": nastawy.wynik.to_dict(),
        "wejscie": _proweniencja_wejscia(
            run, nastawy=nastawy, line_id=line_id, next_bus_id=next_bus_id, c_min=c_min
        ),
        "dostepnosc_pakietu": True,
    }


def zbuduj_odpowiedz_dopasowania(
    run: CanonicalRun,
    *,
    device_id: str,
    line_id: str,
    next_bus_id: str,
    c_min: float,
    zacisk_zabezpieczenia: Zacisk | None,
    delta_t_s: float = 0.3,
    k_b: float = 1.2,
    k_bth: float = 1.1,
    uow_factory: Callable[[], Any] | None = None,
) -> dict[str, Any]:
    """Dopasowanie nastaw Hoppela do aparatu (karta W3-C1, decyzja §0.4).

    Ta sama fizyka (`oblicz_nastawy`) mapowana na wymaganie aparatu
    (`mapper.wymaganie_z_nastaw`) i dobór (`pipeline.dopasuj_do_aparatu`) —
    JSON zwykły, bez koperty biegu (`AnalysisRunEnvelope` w tym torze zbędny,
    patrz kasacja `protection.device_mapping.v0`).
    """
    try:
        nastawy = oblicz_nastawy(
            run,
            line_id=line_id,
            next_bus_id=next_bus_id,
            c_min=c_min,
            zacisk_zabezpieczenia=zacisk_zabezpieczenia,
            delta_t_s=delta_t_s,
            k_b=k_b,
            k_bth=k_bth,
            uow_factory=uow_factory,
        )
    except BrakDanychNastawError as exc:
        raise PakietNastawError(str(exc), kod=exc.kod) from exc

    wymaganie = wymaganie_z_nastaw(nastawy.wynik)
    dopasowanie = dopasuj_do_aparatu(wymaganie, device_id=device_id)
    return {
        **dopasowanie,
        "proweniencja_nastaw": _proweniencja_wejscia(
            run, nastawy=nastawy, line_id=line_id, next_bus_id=next_bus_id, c_min=c_min
        ),
    }


def _proweniencja_wejscia(
    run: CanonicalRun,
    *,
    nastawy: Any,
    line_id: str,
    next_bus_id: str,
    c_min: float,
) -> dict[str, Any]:
    """Proweniencja WHITE BOX wspólna dla trasy JSON i doboru aparatu: skąd
    dokładnie wzięły się liczby — kotwica, gałąź c_max/c_min, wybory inżyniera.

    Warianty c_min/2F/PF policzone przez `batch_run.zbuduj_wejscie_nastaw` NIE
    są tu identyfikowane osobno (ta funkcja jest FROZEN przez harness złotych
    hashy `tests/golden/parytet_scenariuszy/` — nowe pole na jej wyniku
    zmieniłoby zawartość hashowaną, patrz `KLUCZE_WYKLUCZONE` w harnessie).
    Proweniencja niesie więc to, co dostępne BEZ dotykania tamtego kontraktu:
    tożsamość kotwicy, jej współczynnik c_max, wybory inżyniera i pełne dane
    wejścia silnika (już WHITE BOX — `ei.*` poniżej), z których każda liczba
    wyniku da się odtworzyć ręcznie.
    """
    wejscie = nastawy.wejscie
    ei = wejscie.engine_input
    return {
        "kotwica_run_id": str(run.id),
        "c_max": run.options.get("c_factor"),
        "c_min": c_min,
        "line_id": line_id,
        "next_bus_id": next_bus_id,
        "zacisk_zabezpieczenia": wejscie.zacisk_zabezpieczenia,
        "zrodlo_zacisku": wejscie.zrodlo_zacisku,
        "project_name": wejscie.project_name,
        "case_name": wejscie.case_name,
        "line_name": wejscie.line_name,
        "run_timestamp": wejscie.run_timestamp.isoformat(),
        "solver_version": wejscie.solver_version,
        "engine_input": {
            "cross_section_mm2": ei.cross_section_mm2,
            "conductor_material": ei.conductor_material,
            "length_km": ei.length_km,
            "i_nominal_a": ei.i_nominal_a,
            "ik3_max_beginning_a": ei.ik3_max_beginning_a,
            "ik3_min_beginning_a": ei.ik3_min_beginning_a,
            "ik3_max_end_a": ei.ik3_max_end_a,
            "ik3_min_end_a": ei.ik3_min_end_a,
            "ik2_min_end_a": ei.ik2_min_end_a,
            "ik_max_next_bus_a": ei.ik_max_next_bus_a,
            "i_load_max_a": ei.i_load_max_a,
            "delta_t_s": ei.delta_t_s,
            "k_b": ei.k_b,
            "k_bth": ei.k_bth,
        },
    }
