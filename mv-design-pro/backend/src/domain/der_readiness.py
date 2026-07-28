"""Gotowosc analityczna WYTWORCY (DER) — regula kanoniczna po stronie backendu.

DLACZEGO TEN MODUL POWSTAL (karta F-K8 faza 2, krok 3). Ocena gotowosci wytworcy —
„czy TEN wytworca ma dane potrzebne do danej analizy" — zyla wylacznie w przegladarce
(`frontend/src/ui/network-build/station-der/readiness.ts`, 726 linii). Skutki byly
dokladnie takie, jakich kanon zabrania:

  * regula inzynierska (IEC 61869-2 dla klasy przekladnika, IEC 60255-13 dla 87T,
    IEC 60909-3 dla skladowej zerowej) mieszkala w warstwie prezentacji,
  * kazdy inny konsument tej wiedzy — raport, eksport, API — musialby ja powielic,
    a powielona regula rozjezdza sie z oryginalem (precedens V12K-243: trzy oceny
    tego samego wytworcy na jednym ekranie).

DWA POZIOMY OCENY, ZLOZENIE ZACHOWANE (rozstrzygniecie fazy 1, wiazace). Ten modul
liczy poziom PER-WYTWORCA. Poziom MODELU (`analysis-eligibility`: czy analize da sie
w ogole policzyc na calej sieci) zostaje tam, gdzie byl. Zadna z tych ocen nie
zastepuje drugiej i zlozenie bierze GORSZA z dwoch, poprzedzajac powod przedrostkiem
„Model:". Splaszczenie do jednego poziomu jest zabronione.

ZERO FIZYKI. Modul nie liczy zadnej wielkosci elektrycznej — sprawdza KOMPLETNOSC
DANYCH wejsciowych analizy i nazywa braki. Wartosci liczbowe pochodza wylacznie
z solwerow.

BRAK DANEJ NIE STAJE SIE ZEREM. Nierozstrzygnieta klasa przekladnika NIE spelnia
warunku klasy zabezpieczeniowej, ale jest odrozniona od klasy pomiarowej wlasnym
kodem (`der.ct_class.unresolved` vs `der.ct_class.invalid`) — pierwsze to brak danej,
drugie to werdykt.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

StatusOsi = Literal["ready", "partial", "blocked", "not_applicable", "no_module"]
StronaPrzylaczenia = Literal[
    "SN", "nN", "dedicated_transformer", "at_zksn", "at_branch_pole", "at_cable_joint"
]
RodzajDer = Literal["PV", "BESS", "FW"]

# Kolejnosc osi jest CZESCIA KONTRAKTU (determinizm odpowiedzi API i porownan).
OSIE_GOTOWOSCI: tuple[str, ...] = (
    "sc_3f",
    "sc_1f",
    "sc_2f",
    "sc_2fg",
    "vdrop",
    "q_u",
    "equipment",
    "protection",
    "protection_selectivity",
    "frt",
    "hvrt",
    "nc_rfg",
    "report_osd",
    "report_technical",
)

ETYKIETY_OSI_PL: dict[str, str] = {
    "sc_3f": "Zwarcie 3-fazowe (SC3F)",
    "sc_1f": "Zwarcie 1-fazowe doziemne (SC1F)",
    "sc_2f": "Zwarcie 2-fazowe (SC2F)",
    "sc_2fg": "Zwarcie 2-fazowe z ziemią (SC2FG)",
    "vdrop": "Spadek napięcia (VDROP)",
    "q_u": "Regulacja Q(U)",
    "equipment": "Dowód aparatury",
    "protection": "Zabezpieczenia",
    "protection_selectivity": "Selektywność zabezpieczeń",
    "frt": "FRT / LVRT",
    "hvrt": "HVRT",
    "nc_rfg": "Zgodność przyłączeniowa (NC RfG)",
    "report_osd": "Raport OSD",
    "report_technical": "Raport techniczny",
}

# Prog mocy transformatora dedykowanego, powyzej ktorego wymagane jest zabezpieczenie
# roznicowe 87T (IEC 60255-13) — a wiec przekladnik DWURDZENIOWY.
PROG_87T_KW = 1600.0

_EKRAN_DLA_RODZAJU: dict[str, str] = {"PV": "E-21", "BESS": "E-22", "FW": "E-23"}

_STRONY_WYMAGAJACE_ANTI_ISLANDING: frozenset[str] = frozenset(
    {"nN", "at_zksn", "at_branch_pole", "at_cable_joint"}
)


def klasa_ct_jest_zabezpieczeniowa(klasa: str) -> bool:
    """Klasa 5P/10P wg IEC 61869-2 §5.6.2 (blad okreslony przy wielokrotnosci prądu)."""
    return klasa.startswith("5P") or klasa.startswith("10P")


@dataclass(frozen=True)
class WejscieGotowosciDer:
    """Znormalizowane FAKTY o wytworcy — wejscie reguly.

    Swiadomie NIE jest to model ENM: regula ma jedno, jawne wejscie, zeby dalo sie ja
    wywolac zarowno dla wytworcy zapisanego w modelu, jak i dla rekordu w trakcie
    konfiguracji. Mapowanie z generatora ENM robi `wejscie_z_generatora`.
    """

    der_id: str
    der_kind: RodzajDer
    connection_side: StronaPrzylaczenia
    pcc_ref: str | None = None
    nominal_power_kw: float | None = None
    device_catalog_ref: str | None = None
    # V12K-244: JEDNA nazwa transformatora dedykowanego — ta, ktora zapisuja sciezki
    # produkcyjne. Rownolegle pole `transformer_catalog_ref` bylo widmem: kontrakt je
    # deklarowal, nikt nie zapisywal, a regula gotowosci wlasnie je czytala.
    block_transformer_catalog_ref: str | None = None
    protection_catalog_ref: str | None = None
    ct_catalog_ref: str | None = None
    vt_catalog_ref: str | None = None
    fault_current_data_ref: str | None = None
    dynamic_model_ref: str | None = None
    # Dane WYPROWADZONE z katalogu (IEC 61869-2) — `None` znaczy „nie ustalono",
    # co jest innym faktem niz „klasa nie jest zabezpieczeniowa".
    ct_accuracy_class: str | None = None
    ct_application: Literal["protection", "metering", "dual"] | None = None
    nc_rfg_profile_ref: str | None = None
    lvrt_curve_ref: str | None = None
    hvrt_curve_ref: str | None = None
    other_ders_in_station: int = 0


@dataclass(frozen=True)
class BlokadaOsi:
    """Nazwany powod, dla ktorego os nie jest gotowa — wraz z miejscem naprawy."""

    code: str
    message_pl: str
    object_ref: str
    target_screen: str
    target_tab: str

    def to_dict(self) -> dict[str, str]:
        return {
            "code": self.code,
            "message_pl": self.message_pl,
            "object_ref": self.object_ref,
            "target_screen": self.target_screen,
            "target_tab": self.target_tab,
        }


@dataclass(frozen=True)
class OsGotowosci:
    axis: str
    label_pl: str
    status: StatusOsi
    blockers: list[BlokadaOsi] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "axis": self.axis,
            "label_pl": self.label_pl,
            "status": self.status,
            "blockers": [b.to_dict() for b in self.blockers],
        }


def macierz_gotowosci_der(we: WejscieGotowosciDer) -> dict[str, StatusOsi]:
    """Status kazdej osi analitycznej dla JEDNEGO wytworcy.

    Odpowiada na pytanie „czy ten wytworca ma dane potrzebne do tej analizy" — NIE na
    pytanie, czy analiza da sie policzyc na calej sieci (to bramka modelu).
    """

    ma_urzadzenie = we.device_catalog_ref is not None
    ma_pcc = we.pcc_ref is not None
    ma_moc = we.nominal_power_kw is not None
    ma_nc_rfg = we.nc_rfg_profile_ref is not None
    ma_lvrt = we.lvrt_curve_ref is not None
    ma_hvrt = we.hvrt_curve_ref is not None
    ma_zabezpieczenie = we.protection_catalog_ref is not None
    ma_ct_vt = we.ct_catalog_ref is not None and we.vt_catalog_ref is not None
    ma_dane_zwarciowe = we.fault_current_data_ref is not None
    ma_model_dynamiczny = we.dynamic_model_ref is not None
    trafo_dedykowany = we.connection_side == "dedicated_transformer"
    ma_trafo_dedykowany = we.block_transformer_catalog_ref is not None

    # Nierozstrzygnieta klasa NIE spelnia warunku („nie wiem" nie jest „spelnione"),
    # ale powod jest NAZWANY osobnym kodem w `_blokady_osi`.
    ct_klasa_ok = we.ct_accuracy_class is not None and klasa_ct_jest_zabezpieczeniowa(
        we.ct_accuracy_class
    )
    wymaga_87t = trafo_dedykowany and (we.nominal_power_kw or 0.0) >= PROG_87T_KW
    ct_dwurdzeniowy = we.ct_application == "dual"

    sc_3f: StatusOsi = "ready" if (ma_urzadzenie and ma_pcc) else "blocked"
    # Zwarcia Z UDZIALEM ZIEMI wymagaja skladowej zerowej (IEC 60909-3). Zwarcie
    # dwufazowe BEZ ziemi rozklada sie na Z₁ i Z₂, wiec danych Z₀ nie potrzebuje.
    if not ma_urzadzenie or not ma_pcc:
        sc_niesymetryczne: StatusOsi = "blocked"
    elif not ma_dane_zwarciowe:
        sc_niesymetryczne = "partial"
    else:
        sc_niesymetryczne = "ready"
    sc_2f: StatusOsi = sc_3f

    if ma_urzadzenie and ma_pcc and ma_moc:
        vdrop: StatusOsi = "ready"
    elif ma_urzadzenie or ma_pcc:
        vdrop = "partial"
    else:
        vdrop = "blocked"

    q_u: StatusOsi = "ready" if ma_nc_rfg else "blocked"

    if not ma_urzadzenie:
        equipment: StatusOsi = "blocked"
    elif trafo_dedykowany and not ma_trafo_dedykowany:
        equipment = "partial"
    else:
        equipment = "ready"

    if not ma_zabezpieczenie and not ma_ct_vt:
        protection: StatusOsi = "blocked"
    elif not ma_zabezpieczenie or not ma_ct_vt:
        protection = "partial"
    elif not ct_klasa_ok:
        protection = "partial"
    elif wymaga_87t and not ct_dwurdzeniowy:
        protection = "partial"
    else:
        protection = "ready"

    if not ma_zabezpieczenie:
        selektywnosc: StatusOsi = "blocked"
    elif we.other_ders_in_station == 0:
        selektywnosc = "partial"  # jeden wytworca — selektywnosc wewnetrzna
    else:
        selektywnosc = "ready"

    if not ma_nc_rfg or not ma_lvrt:
        frt: StatusOsi = "blocked"
    elif not ma_model_dynamiczny:
        frt = "partial"
    else:
        frt = "ready"

    if not ma_nc_rfg or not ma_hvrt:
        hvrt: StatusOsi = "blocked"
    elif not ma_model_dynamiczny:
        hvrt = "partial"
    else:
        hvrt = "ready"

    nc_rfg: StatusOsi = "ready" if (ma_nc_rfg and ma_lvrt and ma_hvrt) else "blocked"

    komplet_wejsc = (
        sc_3f == "ready" and vdrop != "blocked" and nc_rfg == "ready" and equipment == "ready"
    )
    if komplet_wejsc:
        raport: StatusOsi = "ready"
    elif sc_3f == "ready" or nc_rfg == "ready":
        raport = "partial"
    else:
        raport = "blocked"

    return {
        "sc_3f": sc_3f,
        "sc_1f": sc_niesymetryczne,
        "sc_2f": sc_2f,
        "sc_2fg": sc_niesymetryczne,
        "vdrop": vdrop,
        "q_u": q_u,
        "equipment": equipment,
        "protection": protection,
        "protection_selectivity": selektywnosc,
        "frt": frt,
        "hvrt": hvrt,
        "nc_rfg": nc_rfg,
        "report_osd": raport,
        "report_technical": raport,
    }


def osie_gotowosci_der(we: WejscieGotowosciDer) -> list[OsGotowosci]:
    """Osie ze statusem I NAZWANYMI powodami — os niegotowa bez powodu to slepy zaulek."""

    macierz = macierz_gotowosci_der(we)
    return [
        OsGotowosci(
            axis=os,
            label_pl=ETYKIETY_OSI_PL[os],
            status=macierz[os],
            blockers=_blokady_osi(os, we, macierz[os]),
        )
        for os in OSIE_GOTOWOSCI
    ]


def _blokady_osi(os: str, we: WejscieGotowosciDer, status: StatusOsi) -> list[BlokadaOsi]:
    if status in ("ready", "not_applicable", "no_module"):
        return []

    ekran = _EKRAN_DLA_RODZAJU[we.der_kind]
    blokady: list[BlokadaOsi] = []

    def dodaj(code: str, message_pl: str, tab: str, screen: str | None = None) -> None:
        blokady.append(
            BlokadaOsi(
                code=code,
                message_pl=message_pl,
                object_ref=we.der_id,
                target_screen=screen or ekran,
                target_tab=tab,
            )
        )

    if os in ("sc_3f", "sc_1f", "sc_2f", "sc_2fg"):
        if we.device_catalog_ref is None:
            dodaj(
                "der.device_catalog.missing",
                "Brak katalogu urządzenia (falownik / PCS / turbina).",
                "inverters",
            )
        if we.pcc_ref is None:
            dodaj("der.pcc.missing", "Brak punktu przyłączenia.", "topology")
        if os in ("sc_1f", "sc_2fg") and we.fault_current_data_ref is None:
            dodaj(
                "der.fault_current_data.missing",
                "Brak modelu zwarciowego urządzenia (R₀/X₀/Z₀·Z₁⁻¹) — bez składowej "
                "zerowej zwarcia niesymetrycznego nie da się policzyć.",
                "ncrfg",
            )
    elif os == "vdrop":
        if we.nominal_power_kw is None:
            dodaj(
                "der.power.missing",
                "Brak mocy znamionowej (z katalogu urządzenia).",
                "inverters",
            )
    elif os == "q_u":
        if we.nc_rfg_profile_ref is None:
            dodaj("der.nc_rfg.missing", "Brak profilu NC RfG operatora.", "ncrfg")
    elif os == "equipment":
        if we.device_catalog_ref is None:
            dodaj("der.device_catalog.missing", "Brak katalogu urządzenia.", "inverters")
        if (
            we.connection_side == "dedicated_transformer"
            and we.block_transformer_catalog_ref is None
        ):
            dodaj(
                "der.dedicated_trafo.missing",
                "Brak transformatora dedykowanego (z katalogu).",
                "topology",
            )
    elif os in ("protection", "protection_selectivity"):
        if we.protection_catalog_ref is None:
            dodaj("der.protection.missing", "Brak zabezpieczenia z katalogu.", "topology")
        if we.ct_catalog_ref is None or we.vt_catalog_ref is None:
            dodaj("der.ct_vt.missing", "Brak przekładników CT/VT z katalogu.", "topology")
        if we.ct_catalog_ref is not None:
            if we.ct_accuracy_class is None:
                dodaj(
                    "der.ct_class.unresolved",
                    "Nie ustalono klasy dokładności przypisanego przekładnika prądowego, "
                    "więc warunku klasy zabezpieczeniowej 5P/10P (IEC 61869-2) nie da się "
                    "sprawdzić. Uzupełnij dane katalogowe przekładnika w modelu.",
                    "topology",
                )
            elif not klasa_ct_jest_zabezpieczeniowa(we.ct_accuracy_class):
                dodaj(
                    "der.ct_class.invalid",
                    f'Klasa CT "{we.ct_accuracy_class}" jest pomiarowa, nie zabezpieczeniowa. '
                    "Wymagana klasa 5P/10P (IEC 61869-2). Wybierz przekładnik typu protection.",
                    "topology",
                )
        if (
            we.connection_side == "dedicated_transformer"
            and (we.nominal_power_kw or 0.0) >= PROG_87T_KW
            and we.ct_catalog_ref is not None
            and we.ct_application is not None
            and we.ct_application != "dual"
        ):
            dodaj(
                "der.ct_87t_dual_core.required",
                "Transformator dedykowany ≥ 1,6 MVA wymaga zabezpieczenia różnicowego 87T "
                "(IEC 60255-13). Wybierz przekładnik dwurdzeniowy (5P + 0,5 łączony).",
                "topology",
            )
        if (
            we.connection_side in _STRONY_WYMAGAJACE_ANTI_ISLANDING
            and we.der_kind in ("PV", "FW")
            and we.protection_catalog_ref is None
        ):
            dodaj(
                "der.anti_islanding.required",
                f"DER {we.der_kind} po stronie {we.connection_side} wymaga zabezpieczeń "
                "anti-islanding (27/59/81U/81O — IEEE 1547 / NC RfG Art. 14). "
                "Brak zabezpieczeń uniemożliwia ochronę przed pracą wyspową.",
                "topology",
            )
    elif os == "frt":
        if we.nc_rfg_profile_ref is None:
            dodaj("der.nc_rfg.missing", "Brak profilu NC RfG (LVRT wymaga operatora).", "ncrfg")
        if we.lvrt_curve_ref is None:
            dodaj("der.lvrt.missing", "Brak krzywej LVRT z katalogu.", "frt-hvrt")
    elif os == "hvrt":
        if we.hvrt_curve_ref is None:
            dodaj("der.hvrt.missing", "Brak krzywej HVRT z katalogu.", "frt-hvrt")
    elif os == "nc_rfg":
        if we.nc_rfg_profile_ref is None:
            dodaj("der.nc_rfg.missing", "Brak profilu NC RfG operatora.", "ncrfg")
    elif os in ("report_osd", "report_technical"):
        dodaj(
            "der.report.upstream_missing",
            "Raport wymaga kompletu wyników wcześniejszych obliczeń "
            "(SC/VDROP/NC RfG/EQUIPMENT).",
            "list",
            screen="E-04",
        )

    return blokady


def podsumuj_gotowosc(macierz: dict[str, StatusOsi]) -> dict[str, int]:
    """Liczby osi wg statusu — do plakietek i agregacji."""

    statusy = list(macierz.values())
    return {
        "ready": statusy.count("ready"),
        "partial": statusy.count("partial"),
        "blocked": statusy.count("blocked"),
        "total": len(statusy),
    }


# ---------------------------------------------------------------------------
# Mapowanie z generatora ENM
# ---------------------------------------------------------------------------


def _slownik(wartosc: Any) -> dict[str, Any]:
    return wartosc if isinstance(wartosc, dict) else {}


def _tekst(zrodla: tuple[dict[str, Any], ...], klucze: tuple[str, ...]) -> str | None:
    """Pierwsza NIEPUSTA wartosc tekstowa. Pusty lancuch to brak, nie wartosc."""
    for zrodlo in zrodla:
        for klucz in klucze:
            wartosc = zrodlo.get(klucz)
            if isinstance(wartosc, str) and wartosc.strip():
                return wartosc
    return None


_STRONA_Z_WARIANTU: dict[str, StronaPrzylaczenia] = {
    "DEDICATED_MV_CONNECTION": "dedicated_transformer",
    "block_transformer": "dedicated_transformer",
    "SOURCE_CONNECTION_STATION": "SN",
}

_RODZAJ_Z_TYPU: dict[str, RodzajDer] = {
    "pv_inverter": "PV",
    "bess": "BESS",
    "wind_inverter": "FW",
    "fw_pmsg": "FW",
    "fw_dfig": "FW",
    "fw_scig": "FW",
}


def wejscie_z_generatora(
    generator: dict[str, Any],
    *,
    other_ders_in_station: int = 0,
    ct_accuracy_class: str | None = None,
    ct_application: Literal["protection", "metering", "dual"] | None = None,
) -> WejscieGotowosciDer:
    """Znormalizuj generator ENM do wejscia reguly.

    Klucze sa te same, ktorych szuka odczyt po stronie UI (`buildDerFromGenerator`) —
    dwie sciezki czytajace ten sam model musza widziec te same fakty, inaczej ocena
    zalezy od tego, KTO pyta (precedens V12K-243).

    Klasa i zastosowanie przekladnika przychodza Z ZEWNATRZ, bo wyprowadza je KATALOG
    (`CTType.to_dict`, IEC 61869-2, V12K-239) — regula nie ma wlasnego katalogu i nie
    zgaduje klasy z identyfikatora.
    """

    zmaterializowane = _slownik(generator.get("materialized_params"))
    meta = _slownik(generator.get("meta"))
    zrodla = (zmaterializowane, meta)
    profile = {**_slownik(meta.get("profiles")), **_slownik(zmaterializowane.get("profiles"))}

    wariant = generator.get("connection_variant")
    strona = _STRONA_Z_WARIANTU.get(wariant, "nN") if isinstance(wariant, str) else "nN"

    typ = generator.get("gen_type")
    rodzaj = _RODZAJ_Z_TYPU.get(typ, "PV") if isinstance(typ, str) else "PV"

    p_mw = generator.get("p_mw")
    moc_kw = round(p_mw * 1000.0, 6) if isinstance(p_mw, int | float) else None

    return WejscieGotowosciDer(
        der_id=str(generator.get("ref_id") or generator.get("id") or ""),
        der_kind=rodzaj,
        connection_side=strona,
        pcc_ref=_tekst(zrodla, ("pcc_ref", "pcc")) or (generator.get("bus_ref") or None),
        nominal_power_kw=moc_kw,
        device_catalog_ref=(
            generator.get("catalog_ref") or _tekst(zrodla, ("device_catalog_ref",))
        ),
        block_transformer_catalog_ref=_tekst(zrodla, ("block_transformer_catalog_ref",)),
        protection_catalog_ref=_tekst(zrodla, ("protection_catalog_ref",)),
        ct_catalog_ref=_tekst(zrodla, ("ct_catalog_ref",)),
        vt_catalog_ref=_tekst(zrodla, ("vt_catalog_ref",)),
        fault_current_data_ref=_tekst(zrodla, ("fault_current_data_ref",)),
        dynamic_model_ref=_tekst(zrodla, ("dynamic_model_ref",)),
        ct_accuracy_class=ct_accuracy_class,
        ct_application=ct_application,
        nc_rfg_profile_ref=_tekst((profile,), ("nc_rfg_profile_ref", "nc_rfg", "ncrfg")),
        lvrt_curve_ref=_tekst((profile,), ("lvrt_curve_ref", "lvrt")),
        hvrt_curve_ref=_tekst((profile,), ("hvrt_curve_ref", "hvrt")),
        other_ders_in_station=other_ders_in_station,
    )
