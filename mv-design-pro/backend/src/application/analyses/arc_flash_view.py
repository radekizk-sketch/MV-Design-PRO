"""Widok analizy Arc Flash (IEEE 1584-2018) dla gotowego przebiegu zwarciowego.

Warstwa APPLICATION (mapowanie, ZERO fizyki). Odwzorowuje wejścia solvera zwarciowego
na ``ArcFlashInput`` i deleguje obliczenie energii incydentu / granicy łuku / kategorii
PPE do buildera analizy (``analysis.arc_flash``). Domyka wyspę wykrytą w audycie
V12K-059 poz. A: model IEEE 1584-2018 istniał bez punktu wejścia (dispatch/API/UI/raport).

Wejścia z przebiegu (per węzeł):
- ``i_bf_ka`` ← ``ShortCircuitResult`` wiersz ``ikss_ka`` (Ik'' bolted) [kA],
- ``voltage_kv`` ← napięcie znamionowe węzła z zapisanego grafu [kV].

Wejścia projektowe (z żądania — realne decyzje projektanta, NIE domyślne zmyślone):
- ``working_distance_mm``, ``conductor_gap_mm`` (odstęp elektrod, odległość robocza),
- ``arc_time_s`` — czas wyłączenia zwarcia (z koordynacji zabezpieczeń), to samo źródło,
  którego używa obliczenie U_touch / uziemienia,
- ``electrode_config`` (VCB/VCBB/HCB/VOA/HOA), ``enclosure_type`` (Typical/Shallow).

Brak wejścia obowiązkowego ⇒ builder zwraca „dane niekompletne" per punkt (bez zmyślania).

Węzeł szyn sekcji GPZ z danymi rozdzielnicy (``GPZSection.rozdzielnica``, karta
GPZ-DANE-ANALIZ) bierze geometrię łuku z TEJ rozdzielnicy: konfiguracja elektrod, odstęp szyn,
odległość robocza i wymiary obudowy z danych rozdzielnicy mają pierwszeństwo przed parametrami
żądania (wspólnymi dla wszystkich węzłów), a brak obu uzupełnia wartość robocza klasy
rozdzielnicy IEEE 1584-2018 (``wartosci_robocze.propozycja_geometrii_luku``) — z danymi
przyjętymi (``ESTIMATED``) i pochodzeniem każdego parametru w ``parametry_rozdzielnicy``.
Węzeł bez danych rozdzielnicy liczy się jak przed kartą.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from analysis.arc_flash import (
    ArcFlashBuilder,
    ArcFlashContext,
    ArcFlashInput,
    ElectrodeConfig,
    EnclosureType,
)
from application.analyses.opis_przebiegu import rodzaj_przebiegu_pl, stan_przebiegu_pl
from application.analyses.szyny_sekcji_gpz import SekcjaGpz, sekcje_gpz_stacji
from application.autorytet_biegu_zwarciowego import wymagaj_zakresu_biegu
from enm.canonical_analysis import CanonicalRun, build_short_circuit_results
from enm.dane_przyjete_galezi import dane_przyjete_galezi_wiersza
from enm.mapping import ref_to_graph_id
from enm.models import EnergyNetworkModel
from enm.rozdzielnica_gpz import OPIS_POLA_ROZDZIELNICY
from enm.tor_pola import szyna_raportowa
from network_model.catalog.wartosci_robocze import (
    PARAMETRY_GEOMETRII_LUKU,
    POWOD_BRAKU_GEOMETRII_LUKU_PL,
    dana_przyjeta_tolerancji_nn,
    dane_przyjete_maszyn,
    propozycja_geometrii_luku,
)
from network_model.core.zdolnosci_wkladu_zwarciowego import ZdolnoscMiarodajna
from network_model.nazwy import nazwa_nadana
from network_model.odmowa_danych import OdmowaDanychError
from werdykt import DanaPrzyjeta, FieldQuality, Wielkosc


def _voltage_by_target(run: CanonicalRun) -> dict[str, float | None]:
    graph_nodes = ((run.raw_result or {}).get("graph") or {}).get("nodes", {})
    out: dict[str, float | None] = {}
    for node_id, node in graph_nodes.items():
        if not isinstance(node, dict):
            continue
        kv = node.get("voltage_level")
        out[str(node_id)] = float(kv) if kv is not None else None
    return out


def _context(run: CanonicalRun) -> ArcFlashContext:
    header = (run.snapshot or {}).get("header") or {}
    return ArcFlashContext(
        project_name=nazwa_nadana(header.get("name")),
        case_name=None,
        case_id=str(run.case_id) if run.case_id else None,
        run_timestamp=run.created_at,
        snapshot_hash=run.snapshot_hash,
        run_id=str(run.id),
    )


#: Pochodzenie parametru łuku węzła szyn sekcji GPZ (pierwszeństwo w tej kolejności):
#: dokument rozdzielnicy > wartość projektanta w danych rozdzielnicy > parametr biegu
#: (żądanie, wspólny dla węzłów) > wartość robocza IEEE 1584-2018 (rejestr wartości roboczych).
ZRODLO_LUKU_DOKUMENT = "dokument_rozdzielnicy"
ZRODLO_LUKU_PROJEKTANT = "projektant"
ZRODLO_LUKU_PARAMETR_BIEGU = "parametr_biegu"
ZRODLO_LUKU_WARTOSC_ROBOCZA = "wartosc_robocza"

_POWOD_LUKU_PROJEKTANTA = (
    "wartość nadana przez projektanta w danych rozdzielnicy sekcji bez dokumentu źródłowego — "
    "energia incydentu jest wynikiem obliczeniowym na danej przyjętej"
)


@dataclass(frozen=True)
class ParametryLukuSekcji:
    """Geometria łuku węzła szyn sekcji GPZ: wartość i pochodzenie każdego parametru (ślad)."""

    sekcja: SekcjaGpz
    electrode_config: ElectrodeConfig
    zrodlo_konfiguracji: str
    parametry: tuple[tuple[str, float | None, str | None], ...]
    dane_przyjete: tuple[DanaPrzyjeta, ...]
    #: Powód braku parametru bez wartości (ani rozdzielnica, ani żądanie, ani norma).
    powod_braku_pl: str | None = None

    def wartosc(self, klucz: str) -> float | None:
        return next(w for k, w, _ in self.parametry if k == klucz)

    def to_dict(self) -> dict[str, Any]:
        return {
            "section_id": self.sekcja.section_id,
            "sekcja": self.sekcja.nazwa_pl,
            "konfiguracja_elektrod": {
                "wartosc": self.electrode_config.value,
                "zrodlo": self.zrodlo_konfiguracji,
            },
            "parametry": {
                klucz: {"wartosc": wartosc, "zrodlo": zrodlo}
                for klucz, wartosc, zrodlo in self.parametry
            },
            "powod_braku_pl": self.powod_braku_pl,
        }


def _sekcje_wezlow(run: CanonicalRun) -> dict[str, SekcjaGpz]:
    """Węzeł wyniku (identyfikator szyny albo węzła grafu) → sekcja GPZ, której jest szyną."""
    migawka = run.snapshot or {}
    if not migawka.get("substations"):
        return {}
    enm = EnergyNetworkModel.model_validate(migawka)
    wynik: dict[str, SekcjaGpz] = {}
    for stacja in enm.substations:
        for sekcja in sekcje_gpz_stacji(enm, stacja):
            punkt = szyna_raportowa(migawka, sekcja.bus_ref)
            wynik.setdefault(punkt, sekcja)
            wynik.setdefault(ref_to_graph_id(punkt), sekcja)
    return wynik


def _parametry_luku_sekcji(
    sekcja: SekcjaGpz,
    napiecie_kv: float | None,
    *,
    conductor_gap_mm: float | None,
    working_distance_mm: float | None,
    electrode_config: ElectrodeConfig,
) -> ParametryLukuSekcji:
    """Geometria łuku z rozdzielnicy sekcji — JEDNO rozstrzygnięcie pierwszeństwa
    (``ZRODLO_LUKU_*``). Wartość projektanta bez dokumentu i wartość robocza normy są danymi
    przyjętymi (``ESTIMATED``) — wynik nie udaje danych producenta (zasada nr 4)."""
    roz = sekcja.rozdzielnica
    assert roz is not None
    z_dokumentem = bool(roz.dokument_zrodlowy)
    z_zadania = {
        "odstep_elektrod_mm": conductor_gap_mm,
        "odleglosc_robocza_mm": working_distance_mm,
    }
    propozycja = propozycja_geometrii_luku(napiecie_kv)
    parametry: list[tuple[str, float | None, str | None]] = []
    dane: list[DanaPrzyjeta] = []
    for klucz in PARAMETRY_GEOMETRII_LUKU:
        opis = OPIS_POLA_ROZDZIELNICY[klucz]
        nazwa = f"{opis.nazwa_pl} (sekcja {sekcja.nazwa_pl})"
        z_modelu = getattr(roz, klucz)
        if z_modelu is not None:
            parametry.append(
                (klucz, z_modelu, ZRODLO_LUKU_DOKUMENT if z_dokumentem else ZRODLO_LUKU_PROJEKTANT)
            )
            if not z_dokumentem:
                dane.append(
                    DanaPrzyjeta(
                        nazwa_pl=nazwa,
                        wartosc=Wielkosc(wartosc=z_modelu, jednostka=opis.jednostka),
                        powod_pl=_POWOD_LUKU_PROJEKTANTA,
                        jakosc=FieldQuality.ESTIMATED,
                    )
                )
            continue
        zadanie = z_zadania.get(klucz)
        if zadanie is not None:
            parametry.append((klucz, zadanie, ZRODLO_LUKU_PARAMETR_BIEGU))
            continue
        if propozycja is not None:
            wartosc = propozycja.wartosci[klucz]
            parametry.append((klucz, wartosc, ZRODLO_LUKU_WARTOSC_ROBOCZA))
            dane.append(
                DanaPrzyjeta(
                    nazwa_pl=nazwa,
                    wartosc=Wielkosc(wartosc=wartosc, jednostka=opis.jednostka),
                    powod_pl=propozycja.opis_zrodla_pl(klucz),
                    jakosc=FieldQuality.ESTIMATED,
                )
            )
            continue
        parametry.append((klucz, None, None))
    braki = [klucz for klucz, wartosc, _ in parametry if wartosc is None]
    if roz.konfiguracja_elektrod is not None:
        konfiguracja = ElectrodeConfig(roz.konfiguracja_elektrod)
        zrodlo_konfiguracji = ZRODLO_LUKU_DOKUMENT if z_dokumentem else ZRODLO_LUKU_PROJEKTANT
    else:
        konfiguracja = electrode_config
        zrodlo_konfiguracji = ZRODLO_LUKU_PARAMETR_BIEGU
    return ParametryLukuSekcji(
        sekcja=sekcja,
        electrode_config=konfiguracja,
        zrodlo_konfiguracji=zrodlo_konfiguracji,
        parametry=tuple(parametry),
        dane_przyjete=tuple(dane),
        powod_braku_pl=(
            (
                (
                    POWOD_BRAKU_GEOMETRII_LUKU_PL
                    if napiecie_kv is not None
                    else "napięcie węzła nie jest znane z biegu — klasy rozdzielnicy IEEE "
                    "1584-2018 (i jej typowej geometrii) nie da się ustalić"
                )
                + " (brak: "
                + ", ".join(OPIS_POLA_ROZDZIELNICY[k].nazwa_pl for k in braki)
                + ")"
            )
            if braki
            else None
        ),
    )


def build_arc_flash_view(
    run: CanonicalRun,
    *,
    working_distance_mm: float | None,
    conductor_gap_mm: float | None,
    arc_time_s: float | None,
    electrode_config: str = "VCB",
    enclosure_type: str = "Typical",
) -> dict[str, Any]:
    """Zbuduj widok Arc Flash per węzeł dla przebiegu zwarciowego.

    Raises:
        ValueError: gdy przebieg nie jest zwarciowy (``short_circuit_sn``) lub nie
            został zakończony, albo gdy podano nieznaną konfigurację elektrod/obudowy —
            komunikat w języku polskim.
    """
    if run.analysis_type != "short_circuit_sn":
        raise OdmowaDanychError(
            "Analiza Arc Flash wymaga przebiegu zwarciowego; "
            f"wskazany przebieg: {rodzaj_przebiegu_pl(run.analysis_type)}."
        )
    if run.status != "FINISHED":
        raise OdmowaDanychError(
            f"Przebieg nie jest zakończony (stan: {stan_przebiegu_pl(run.status)}); "
            "wynik zwarciowy nie jest dostępny."
        )
    # Karta OD-14: wynik zwarcia przez impedancję przejścia Z_f poza zakresem tej
    # zdolności — odmowa SI-117 (jedno źródło: `blokady_zakresu_biegu`).
    wymagaj_zakresu_biegu(run, ZdolnoscMiarodajna.ARC_FLASH)
    try:
        cfg = ElectrodeConfig(electrode_config)
    except ValueError as exc:
        raise OdmowaDanychError(
            f"Nieznana konfiguracja elektrod: {electrode_config!r} "
            "(dozwolone: VCB, VCBB, HCB, VOA, HOA)."
        ) from exc
    try:
        enc = EnclosureType(enclosure_type)
    except ValueError as exc:
        raise OdmowaDanychError(
            f"Nieznany typ obudowy: {enclosure_type!r} (dozwolone: Typical, Shallow)."
        ) from exc

    voltage_by_target = _voltage_by_target(run)
    inputs: list[ArcFlashInput] = []
    # Nazwa szyny z tabeli wyników zwarć (nazwa z modelu albo opis rodzaju) — wiersz
    # widoku i raportu nazywa szynę nią, nie identyfikatorem węzła (karta #144).
    nazwy_szyn: dict[str, str] = {}
    # Karta TOLERANCJA-NN-WARTOSC-ROBOCZA: punkty w sieci nN liczonej z wartością roboczą
    # tolerancji (znacznik wiersza biegu) — I_bf stoi na danej przyjętej. Karta LINIA-110:
    # tak samo punkty, do których prądu wchodzi linia 110 kV z wartością roboczą geometrii.
    robocze: set[str] = set()
    dane_linii: dict[str, tuple[DanaPrzyjeta, ...]] = {}
    # Karta PODSTAWA-Q (rozstrzygnięcie 3): wartości robocze parametrów maszyn wirujących wyspy
    # punktu z TEGO SAMEGO wiersza — I_bf = I″k punktu stoi na nich, gdy wpływają na I″k.
    robocze_maszyn: dict[str, list[dict[str, Any]]] = {}
    # Karta GPZ-DANE-ANALIZ: węzły szyn sekcji GPZ z danymi rozdzielnicy biorą geometrię łuku
    # z TEJ rozdzielnicy (``_parametry_luku_sekcji``) — parametry żądania są wspólne dla
    # wszystkich węzłów, rozdzielnica sekcji jest danymi konkretnego urządzenia.
    sekcje_wezlow = _sekcje_wezlow(run)
    parametry_sekcji: dict[str, ParametryLukuSekcji] = {}
    for row in build_short_circuit_results(run).get("rows", []):
        target_id = row.get("target_id")
        if not target_id:
            continue
        nazwy_szyn[str(target_id)] = str(row.get("target_name"))
        if row.get("tolerancja_nn_robocza"):
            robocze.add(str(target_id))
        dane_linii[str(target_id)] = dane_przyjete_galezi_wiersza(row)
        robocze_maszyn[str(target_id)] = list(row.get("parametry_robocze_maszyn") or ())
        napiecie_kv = voltage_by_target.get(str(target_id))
        sekcja = sekcje_wezlow.get(str(target_id))
        if sekcja is not None and sekcja.rozdzielnica is not None:
            luk = _parametry_luku_sekcji(
                sekcja,
                napiecie_kv,
                conductor_gap_mm=conductor_gap_mm,
                working_distance_mm=working_distance_mm,
                electrode_config=cfg,
            )
            parametry_sekcji[str(target_id)] = luk
            inputs.append(
                ArcFlashInput(
                    bus_ref=str(target_id),
                    i_bf_ka=row.get("ikss_ka"),
                    voltage_kv=napiecie_kv,
                    arc_time_s=arc_time_s,
                    electrode_config=luk.electrode_config,
                    conductor_gap_mm=luk.wartosc("odstep_elektrod_mm"),
                    working_distance_mm=luk.wartosc("odleglosc_robocza_mm"),
                    enclosure_type=enc,
                    enclosure_width_mm=luk.wartosc("szerokosc_obudowy_mm"),
                    enclosure_height_mm=luk.wartosc("wysokosc_obudowy_mm"),
                    enclosure_depth_mm=luk.wartosc("glebokosc_obudowy_mm"),
                )
            )
            continue
        inputs.append(
            ArcFlashInput(
                bus_ref=str(target_id),
                i_bf_ka=row.get("ikss_ka"),
                voltage_kv=napiecie_kv,
                arc_time_s=arc_time_s,
                electrode_config=cfg,
                conductor_gap_mm=conductor_gap_mm,
                working_distance_mm=working_distance_mm,
                enclosure_type=enc,
            )
        )

    view = ArcFlashBuilder().build(inputs, context=_context(run)).to_dict()
    for wynik in view.get("results") or []:
        wynik["bus_name"] = nazwy_szyn[str(wynik["bus_ref"])]
        luk_wezla = parametry_sekcji.get(str(wynik["bus_ref"]))
        if luk_wezla is not None:
            wynik["parametry_rozdzielnicy"] = luk_wezla.to_dict()
        dane = (
            (
                (dana_przyjeta_tolerancji_nn(miejsce_pl=f"punkt zwarcia: {wynik['bus_name']}"),)
                if str(wynik["bus_ref"]) in robocze
                else ()
            )
            + dane_linii.get(str(wynik["bus_ref"]), ())
            + dane_przyjete_maszyn(robocze_maszyn.get(str(wynik["bus_ref"])), wielkosc="ikss")
            + (luk_wezla.dane_przyjete if luk_wezla is not None else ())
        )
        if dane:
            wynik["status_danych"] = "UNVALIDATED_INPUT"
            wynik["dane_przyjete"] = [dana.model_dump(mode="json") for dana in dane]
    return view
