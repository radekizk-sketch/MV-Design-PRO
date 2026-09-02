"""SCENARIUSZE SLD nN (mandat „profesjonalizacja SLD nN" §47) — JEDNO ŹRÓDŁO
PRAWDY fixtur projekcji nN dla backendu I frontendu.

Każdy scenariusz jest modelem ENM zbudowanym tu, w Pythonie. Backend liczy z
niego projekcję `LvDomainProjectionV1` (kontrakt 3.0.0), a skrypt
`backend/scripts/eksport_fixtur_projekcji_nn.py` zapisuje ją jako JSON do
`frontend/src/ui/sld/v3/lv-domain/fixtures/generated/`. Frontend NIE pisze
własnych fixtur z ręcznie wpisaną energizacją — ręcznie wpisane `energized`/
`supply_refs` rozjeżdżały się z backendem (zmierzone: fixtura wysp niosła
`supply_refs: [pv]` dla szyny, dla której backend zwracał `[]`). Test
`test_scenariusze_nn.py` pilnuje, że JSON w repo jest bajt w bajt tym, co
backend zwraca dziś.

Zasada GLOBALNOŚCI (§31): scenariusze różnią się WYŁĄCZNIE danymi modelu —
liczbą transformatorów, sekcji, sprzęgieł, odpływów, źródeł, stanów
łączników. Żaden scenariusz nie ma nazwy sprawdzanej w kodzie produkcyjnym.

Lista (numeracja = numer kadru w `docs/audit/visual/nn/`):
 01 jeden transformator, incomer, trzy odpływy, podrozdzielnica, PV w polu
 02 dwa transformatory, sprzęgło OTWARTE
 03 dwa transformatory, sprzęgło ZAMKNIĘTE (wielostronne zasilanie)
 04 wspólne zasilanie SN + wiązanie do obcej stacji (granica domeny)
 05 niezależne systemy SN (dwa GPZ), sprzęgło otwarte — dwie wyspy
 06 niezależne systemy SN spięte sprzęgłem — KONFLIKT
 07 wyspa DER: PV podążające (grid-following) — NIEZASILONA
 08 wyspa DER: magazyn tworzący napięcie (grid-forming) — zasilona z wyspy
 09 wyspa DER: zdolność niezadeklarowana — stan NIEZNANY
 10 sekcja B niezasilona (wyłącznik główny TB otwarty)
 11 energizacja dwustronna aparatu otwartego (wyspa DER za wyłącznikiem)
 12 pełny tor DER: PV/magazyn/generator z aparatami, pomiarem i zabezpieczeniem
 13 odbiory przez pola (cztery rodzaje aparatów) + odbiór bez pola (audyt)
 14 podrozdzielnice zagnieżdżone (trzy poziomy)
 15 wiele odpływów (dwanaście) z długimi nazwami
 16 wynik NIEAKTUALNY (przebieg rozpływu, potem zmiana modelu)
 17 wyniki zwarciowe IEC 60909 (przebieg zwarciowy, świeży)
 18 SWZ: odpływy spełniające i niespełniające (długi kabel)
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Literal

from enm.models import (
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    FuseBranch,
    Generator,
    Load,
    Measurement,
    MeasurementRating,
    NnSection,
    ProtectionAssignment,
    ProtectionSetting,
    Source,
    Substation,
    SwitchBranch,
    Transformer,
)

Przebieg = Literal["PF", "short_circuit_sn"]


class BudowniczyStacji:
    """Budowniczy modelu ENM jednej stacji SN/nN — wspólna gramatyka
    scenariuszy (wszystkie gałęzie nN z wiązaniem katalogowym, E061)."""

    def __init__(self, ref: str, name: str, *, earthing: str = "TN-C-S") -> None:
        self.ref = ref
        self.name = name
        self.earthing = earthing
        self.buses: list[Bus] = []
        self.branches: list[Any] = []
        self.transformers: list[Transformer] = []
        self.sources: list[Source] = []
        self.loads: list[Load] = []
        self.generators: list[Generator] = []
        self.measurements: list[Measurement] = []
        self.protection: list[ProtectionAssignment] = []
        self.substations: list[Substation] = []
        self.root_bus_refs: list[str] = []
        self.root_tr_refs: list[str] = []
        self.nn_sections: list[NnSection] = []

    # --- SN -------------------------------------------------------------
    def szyna_sn(self, ref: str, name: str, kv: float = 15.0) -> str:
        self.buses.append(Bus(ref_id=ref, name=name, voltage_kv=kv))
        return ref

    def zrodlo_sn(
        self, ref: str, name: str, bus: str, *, r_ohm: float = 0.1, x_ohm: float = 0.5
    ) -> str:
        self.sources.append(
            Source(
                ref_id=ref,
                name=name,
                bus_ref=bus,
                model="thevenin",
                r_ohm=r_ohm,
                x_ohm=x_ohm,
                catalog_ref="src-gpz-15kv",
            )
        )
        return ref

    # --- nN --------------------------------------------------------------
    def szyna(self, ref: str, name: str, *, korzen: bool = False, kv: float = 0.4) -> str:
        self.buses.append(Bus(ref_id=ref, name=name, voltage_kv=kv))
        if korzen:
            self.root_bus_refs.append(ref)
        return ref

    def transformator(
        self,
        ref: str,
        name: str,
        hv: str,
        lv: str,
        *,
        sn_mva: float = 0.63,
        group: str = "Dyn5",
        uk: float = 4.0,
    ) -> str:
        self.transformers.append(
            Transformer(
                ref_id=ref,
                name=name,
                hv_bus_ref=hv,
                lv_bus_ref=lv,
                sn_mva=sn_mva,
                uhv_kv=15.0,
                ulv_kv=0.4,
                uk_percent=uk,
                pk_kw=round(sn_mva * 10.3, 2),
                vector_group=group,
                catalog_ref=f"tr-15-04-{int(round(sn_mva * 1000))}kva-{group.lower()}",
            )
        )
        self.root_tr_refs.append(ref)
        return ref

    def wylacznik(
        self,
        ref: str,
        name: str,
        a: str,
        b: str,
        *,
        status: str = "closed",
        in_a: float = 63.0,
        curve: str = "C",
    ) -> str:
        self.branches.append(
            SwitchBranch(
                ref_id=ref,
                name=name,
                type="breaker",
                from_bus_ref=a,
                to_bus_ref=b,
                status=status,  # type: ignore[arg-type]
                catalog_ref=f"aparat-nn-mcb-{curve.lower()}{int(in_a)}",
                catalog_namespace="APARAT_NN_MCB",
                materialized_params={"in_a": in_a, "curve_class": curve},
            )
        )
        return ref

    def rozlacznik(self, ref: str, name: str, a: str, b: str, *, status: str = "closed") -> str:
        self.branches.append(
            SwitchBranch(
                ref_id=ref,
                name=name,
                type="switch",
                from_bus_ref=a,
                to_bus_ref=b,
                status=status,  # type: ignore[arg-type]
                catalog_ref="aparat-nn-rozlacznik-160a",
                catalog_namespace="APARAT_NN",
            )
        )
        return ref

    def odlacznik(self, ref: str, name: str, a: str, b: str, *, status: str = "closed") -> str:
        self.branches.append(
            SwitchBranch(
                ref_id=ref,
                name=name,
                type="disconnector",
                from_bus_ref=a,
                to_bus_ref=b,
                status=status,  # type: ignore[arg-type]
                catalog_ref="aparat-nn-odlacznik-250a",
                catalog_namespace="APARAT_NN",
            )
        )
        return ref

    def bezpiecznik(self, ref: str, name: str, a: str, b: str, *, in_a: float = 63.0) -> str:
        self.branches.append(
            FuseBranch(
                ref_id=ref,
                name=name,
                from_bus_ref=a,
                to_bus_ref=b,
                rated_current_a=in_a,
                rated_voltage_kv=0.4,
                catalog_ref=f"wkladka-nn-gg-{int(in_a)}",
                catalog_namespace="WKLADKA_NN",
                materialized_params={"in_a": in_a, "curve_class": "gG"},
            )
        )
        return ref

    def sprzeglo(self, ref: str, name: str, a: str, b: str, *, status: str = "open") -> str:
        self.branches.append(
            SwitchBranch(
                ref_id=ref,
                name=name,
                type="bus_coupler",
                from_bus_ref=a,
                to_bus_ref=b,
                status=status,  # type: ignore[arg-type]
                catalog_ref="aparat-nn-sprzeglo-630a",
                catalog_namespace="APARAT_NN",
            )
        )
        return ref

    def kabel(
        self, ref: str, name: str, a: str, b: str, *, length_km: float = 0.05, przekroj: int = 120
    ) -> str:
        r = {16: 1.91, 25: 1.2, 35: 0.868, 50: 0.641, 70: 0.443, 95: 0.32, 120: 0.253, 150: 0.206}[
            przekroj
        ]
        self.branches.append(
            Cable(
                ref_id=ref,
                name=name,
                from_bus_ref=a,
                to_bus_ref=b,
                length_km=length_km,
                r_ohm_per_km=r,
                x_ohm_per_km=0.08,
                return_conductor_r_ohm_per_km_20c=r,
                return_conductor_x_ohm_per_km=0.08,
                short_circuit_temperature_c=160.0,
                catalog_ref=f"kabel-nn-yaky-4x{przekroj}",
                catalog_namespace="KABEL_NN",
            )
        )
        return ref

    def odbior(
        self, ref: str, name: str, bus: str, p_mw: float, q_mvar: float | None = None
    ) -> str:
        self.loads.append(
            Load(
                ref_id=ref,
                name=name,
                bus_ref=bus,
                p_mw=p_mw,
                q_mvar=q_mvar if q_mvar is not None else round(p_mw * 0.2, 6),
            )
        )
        return ref

    def der(
        self,
        ref: str,
        name: str,
        bus: str,
        p_mw: float,
        *,
        gen_type: str = "pv_inverter",
        zdolnosc: str | None = None,
    ) -> str:
        meta = {"island_capability": zdolnosc} if zdolnosc else {}
        self.generators.append(
            Generator(
                ref_id=ref,
                name=name,
                bus_ref=bus,
                p_mw=p_mw,
                q_mvar=0.0,
                gen_type=gen_type,  # type: ignore[arg-type]
                connection_variant="nn_side",
                station_ref=self.ref,
                meta=meta,
            )
        )
        return ref

    def podrozdzielnica(self, ref: str, name: str, bus_refs: list[str]) -> str:
        self.substations.append(
            Substation(
                ref_id=ref,
                name=name,
                station_type="rozdzielnica_nn",
                bus_refs=bus_refs,
                transformer_refs=[],
            )
        )
        return ref

    def obca_stacja(self, ref: str, name: str, bus_ref: str, tr_ref: str, hv_bus: str) -> str:
        self.buses.append(Bus(ref_id=bus_ref, name=f"RGnN {name}", voltage_kv=0.4))
        self.transformers.append(
            Transformer(
                ref_id=tr_ref,
                name=f"TR {name}",
                hv_bus_ref=hv_bus,
                lv_bus_ref=bus_ref,
                sn_mva=0.4,
                uhv_kv=15.0,
                ulv_kv=0.4,
                uk_percent=4.0,
                pk_kw=4.5,
                vector_group="Dyn5",
                catalog_ref="tr-15-04-400kva-dyn5",
            )
        )
        self.substations.append(
            Substation(
                ref_id=ref,
                name=name,
                station_type="mv_lv",
                bus_refs=[bus_ref],
                transformer_refs=[tr_ref],
                meta={"nn_earthing_system": self.earthing},
            )
        )
        return ref

    def pomiar_ct(self, ref: str, name: str, bus: str, *, primary: float = 1000.0) -> str:
        self.measurements.append(
            Measurement(
                ref_id=ref,
                name=name,
                measurement_type="CT",
                bus_ref=bus,
                rating=MeasurementRating(ratio_primary=primary, ratio_secondary=5.0),
                purpose="protection",
                catalog_ref="ct-nn-1000-5",
            )
        )
        return ref

    def zabezpieczenie(
        self,
        ref: str,
        name: str,
        breaker_ref: str,
        *,
        ct_ref: str | None = None,
        funkcje: tuple[str, ...] = ("overcurrent_50", "overcurrent_51"),
    ) -> str:
        self.protection.append(
            ProtectionAssignment(
                ref_id=ref,
                name=name,
                breaker_ref=breaker_ref,
                ct_ref=ct_ref,
                device_type="overcurrent",
                settings=[
                    ProtectionSetting(function_type=f, threshold_a=400.0, time_delay_s=0.2)  # type: ignore[arg-type]
                    for f in funkcje
                ],
                catalog_ref="przekaznik-nn-50-51",
            )
        )
        return ref

    def sekcje(self, *wpisy: tuple[str, str, str | None]) -> None:
        for order, (section_id, bus_ref, coupler_ref) in enumerate(wpisy, start=1):
            self.nn_sections.append(
                NnSection(
                    section_id=section_id, order=order, bus_ref=bus_ref, coupler_ref=coupler_ref
                )
            )

    def zbuduj(self) -> EnergyNetworkModel:
        root = Substation(
            ref_id=self.ref,
            name=self.name,
            station_type="mv_lv",
            bus_refs=list(self.root_bus_refs),
            transformer_refs=list(self.root_tr_refs),
            nn_sections=list(self.nn_sections),
            meta={"nn_earthing_system": self.earthing},
        )
        return EnergyNetworkModel(
            header=ENMHeader(
                name=f"scenariusz-{self.ref}", defaults=ENMDefaults(sn_nominal_kv=15.0)
            ),
            buses=self.buses,
            branches=self.branches,
            transformers=self.transformers,
            sources=self.sources,
            loads=self.loads,
            generators=self.generators,
            measurements=self.measurements,
            protection_assignments=self.protection,
            substations=[root, *self.substations],
        )


# ---------------------------------------------------------------------------
# Wzorce pól (reużywane przez scenariusze).
# ---------------------------------------------------------------------------


def transformator_z_wylacznikiem(
    b: BudowniczyStacji,
    tr: str,
    name: str,
    sn_bus: str,
    board: str,
    *,
    sn_mva: float = 0.63,
    group: str = "Dyn5",
    qf_status: str = "closed",
    ct: bool = False,
    relay: bool = False,
) -> None:
    zacisk = b.szyna(f"{tr}_zacisk", f"{name} zacisk nN")
    b.transformator(tr, name, sn_bus, zacisk, sn_mva=sn_mva, group=group)
    qf = b.wylacznik(
        f"QF-{tr}",
        f"QF-{name}",
        zacisk,
        board,
        status=qf_status,
        in_a=round(sn_mva * 1000 * 1.44 / 0.4 / 100) * 100 or 1000,
    )
    if ct:
        b.pomiar_ct(
            f"CT-{tr}",
            f"CT-{name}",
            zacisk,
            primary=round(sn_mva * 1000 * 1.44 / 0.4 / 100) * 100 or 1000,
        )
    if relay:
        b.zabezpieczenie(
            f"REL-{tr}", f"Zabezpieczenie {name}", qf, ct_ref=f"CT-{tr}" if ct else None
        )


def odplyw_do_odbioru(
    b: BudowniczyStacji,
    board: str,
    tag: str,
    *,
    aparat: str = "wylacznik",
    nazwa_aparatu: str | None = None,
    nazwa_odbioru: str,
    p_mw: float,
    length_km: float = 0.05,
    przekroj: int = 35,
    in_a: float = 63.0,
    status: str = "closed",
) -> str:
    zacisk = b.szyna(f"{tag}_zacisk", f"{tag} zacisk wyjściowy")
    koniec = b.szyna(f"{tag}_koniec", f"Zacisk {nazwa_odbioru}")
    nazwa = nazwa_aparatu or tag
    if aparat == "wylacznik":
        b.wylacznik(tag, nazwa, board, zacisk, in_a=in_a, status=status)
    elif aparat == "rozlacznik":
        b.rozlacznik(tag, nazwa, board, zacisk, status=status)
    elif aparat == "odlacznik":
        b.odlacznik(tag, nazwa, board, zacisk, status=status)
    else:
        b.bezpiecznik(tag, nazwa, board, zacisk, in_a=in_a)
    b.kabel(f"{tag}_kabel", f"Kabel {tag}", zacisk, koniec, length_km=length_km, przekroj=przekroj)
    b.odbior(f"{tag}_odbior", nazwa_odbioru, koniec, p_mw)
    return tag


def odplyw_do_der(
    b: BudowniczyStacji,
    board: str,
    tag: str,
    *,
    nazwa_zrodla: str,
    p_mw: float,
    gen_type: str = "pv_inverter",
    zdolnosc: str | None = "GRID_FOLLOWING",
    aparat: str = "wylacznik",
    length_km: float = 0.04,
    ct: bool = False,
    relay_lom: bool = False,
) -> str:
    zacisk = b.szyna(f"{tag}_zacisk", f"{tag} zacisk wyjściowy")
    pcc = b.szyna(f"{tag}_pcc", f"{nazwa_zrodla} · punkt przyłączenia")
    if aparat == "wylacznik":
        b.wylacznik(tag, tag, board, zacisk, in_a=100.0)
    else:
        b.bezpiecznik(tag, tag, board, zacisk, in_a=100.0)
    b.kabel(f"{tag}_kabel", f"Kabel {tag}", zacisk, pcc, length_km=length_km, przekroj=50)
    b.der(f"{tag}_zrodlo", nazwa_zrodla, pcc, p_mw, gen_type=gen_type, zdolnosc=zdolnosc)
    if ct:
        b.pomiar_ct(f"CT-{tag}", f"CT {nazwa_zrodla}", pcc, primary=200.0)
    if relay_lom:
        b.zabezpieczenie(
            f"REL-{tag}",
            f"Zabezpieczenie od pracy wyspowej {nazwa_zrodla}",
            tag,
            ct_ref=f"CT-{tag}" if ct else None,
            funkcje=("rocof_81R", "vector_shift_78", "underfrequency_81U"),
        )
    return tag


def odplyw_do_podrozdzielnicy(
    b: BudowniczyStacji,
    board: str,
    tag: str,
    *,
    sub_ref: str,
    sub_bus: str,
    sub_name: str,
    aparat: str = "wylacznik",
    status: str = "closed",
    length_km: float = 0.08,
    in_a: float = 125.0,
) -> str:
    zacisk = b.szyna(f"{tag}_zacisk", f"{tag} zacisk wyjściowy")
    b.szyna(sub_bus, sub_name)
    if aparat == "wylacznik":
        b.wylacznik(tag, tag, board, zacisk, in_a=in_a, status=status)
    elif aparat == "odlacznik":
        b.odlacznik(tag, tag, board, zacisk, status=status)
    else:
        b.rozlacznik(tag, tag, board, zacisk, status=status)
    b.kabel(f"{tag}_kabel", f"Kabel {tag}", zacisk, sub_bus, length_km=length_km, przekroj=70)
    b.podrozdzielnica(sub_ref, sub_name, [sub_bus])
    return sub_bus


# ---------------------------------------------------------------------------
# Scenariusze.
# ---------------------------------------------------------------------------


def _stacja_jednotransformatorowa(*, ref: str = "stC", name: str = "Stacja C") -> BudowniczyStacji:
    b = BudowniczyStacji(ref, name)
    sn = b.szyna_sn("sn", "Szyna SN 15 kV")
    b.zrodlo_sn("src", "GPZ", sn)
    board = b.szyna("RGnN-1", "RGnN-1", korzen=True)
    transformator_z_wylacznikiem(b, "T1", "T1", sn, board, sn_mva=0.63, ct=True, relay=True)
    odplyw_do_odbioru(
        b, board, "QF-01", nazwa_odbioru="Odbiór 1", p_mw=0.012, przekroj=25, in_a=25.0
    )
    rgn2 = odplyw_do_podrozdzielnicy(
        b, board, "QF-02", sub_ref="RGN-2", sub_bus="RGN-2_szyna", sub_name="RGN-2"
    )
    odplyw_do_odbioru(
        b,
        rgn2,
        "FU-21",
        aparat="bezpiecznik",
        nazwa_odbioru="Odbiór RGN-2",
        p_mw=0.006,
        przekroj=16,
        in_a=20.0,
    )
    odplyw_do_der(b, board, "QF-03", nazwa_zrodla="PV1", p_mw=0.08)
    return b


def scenariusz_01_single_tr() -> EnergyNetworkModel:
    return _stacja_jednotransformatorowa().zbuduj()


def _stacja_dwutransformatorowa(
    *,
    sprzeglo: str = "open",
    niezalezny_system_tb: bool = False,
    qf_tb_status: str = "closed",
) -> BudowniczyStacji:
    b = BudowniczyStacji("stAB", "Stacja AB")
    sn = b.szyna_sn("sn", "Szyna SN 15 kV")
    b.zrodlo_sn("src", "GPZ Północ", sn)
    sn_tb = sn
    if niezalezny_system_tb:
        sn_tb = b.szyna_sn("sn2", "Szyna SN 15 kV (drugi GPZ)")
        b.zrodlo_sn("src2", "GPZ Południe", sn_tb, r_ohm=0.12, x_ohm=0.6)
    a = b.szyna("RGnN-A", "RGnN-A", korzen=True)
    bb = b.szyna("RGnN-B", "RGnN-B", korzen=True)
    transformator_z_wylacznikiem(b, "TA", "TA", sn, a, sn_mva=0.4)
    transformator_z_wylacznikiem(b, "TB", "TB", sn_tb, bb, sn_mva=0.4, qf_status=qf_tb_status)
    qbc = b.sprzeglo("QBC", "QBC", a, bb, status=sprzeglo)
    b.sekcje(("A", a, qbc), ("B", bb, qbc))
    odplyw_do_odbioru(b, a, "QF-A1", nazwa_odbioru="Odbiór A1", p_mw=0.02)
    odplyw_do_odbioru(b, a, "QF-A2", nazwa_odbioru="Odbiór A2", p_mw=0.015, aparat="rozlacznik")
    odplyw_do_der(b, a, "QF-A3", nazwa_zrodla="PV-A", p_mw=0.05)
    odplyw_do_odbioru(b, bb, "QF-B1", nazwa_odbioru="Odbiór B1", p_mw=0.03, in_a=80.0)
    odplyw_do_odbioru(
        b, bb, "FU-B2", aparat="bezpiecznik", nazwa_odbioru="Odbiór B2", p_mw=0.01, in_a=32.0
    )
    return b


def scenariusz_02_two_tr_qbc_open() -> EnergyNetworkModel:
    return _stacja_dwutransformatorowa(sprzeglo="open").zbuduj()


def scenariusz_03_two_tr_qbc_closed() -> EnergyNetworkModel:
    return _stacja_dwutransformatorowa(sprzeglo="closed").zbuduj()


def scenariusz_04_shared_upstream_boundary() -> EnergyNetworkModel:
    b = _stacja_dwutransformatorowa(sprzeglo="open")
    b.obca_stacja("stObca", "Stacja OBCA", "RGnN-obca", "TR-obca", "sn")
    b.odlacznik("QS-B9", "QS-B9 (wiązanie awaryjne)", "RGnN-B", "RGnN-obca", status="open")
    return b.zbuduj()


def scenariusz_05_independent_upstream() -> EnergyNetworkModel:
    return _stacja_dwutransformatorowa(sprzeglo="open", niezalezny_system_tb=True).zbuduj()


def scenariusz_06_conflict_parallel_sources() -> EnergyNetworkModel:
    return _stacja_dwutransformatorowa(sprzeglo="closed", niezalezny_system_tb=True).zbuduj()


def _stacja_z_wyspa(
    zdolnosc: str | None,
    *,
    gen_type: str = "pv_inverter",
    p_der: float = 0.03,
    p_odbior: float = 0.008,
) -> EnergyNetworkModel:
    b = _stacja_jednotransformatorowa(ref="stW", name="Stacja WYSPA")
    rgn_d = odplyw_do_podrozdzielnicy(
        b,
        "RGnN-1",
        "QS-D",
        sub_ref="RGN-D",
        sub_bus="RGN-D_szyna",
        sub_name="Podrozdzielnica D",
        aparat="odlacznik",
        status="open",
    )
    nazwa = "PV-D" if gen_type == "pv_inverter" else "Magazyn D"
    odplyw_do_der(
        b,
        rgn_d,
        "QF-D1",
        nazwa_zrodla=nazwa,
        p_mw=p_der,
        gen_type=gen_type,
        zdolnosc=zdolnosc,
        aparat="bezpiecznik",
    )
    odplyw_do_odbioru(
        b,
        rgn_d,
        "FU-D2",
        aparat="bezpiecznik",
        nazwa_odbioru="Odbiór D",
        p_mw=p_odbior,
        przekroj=16,
        in_a=20.0,
    )
    return b.zbuduj()


def scenariusz_07_island_grid_following() -> EnergyNetworkModel:
    return _stacja_z_wyspa("GRID_FOLLOWING")


def scenariusz_08_island_grid_forming() -> EnergyNetworkModel:
    return _stacja_z_wyspa("GRID_FORMING", gen_type="bess", p_der=0.05, p_odbior=0.03)


def scenariusz_09_island_unknown() -> EnergyNetworkModel:
    return _stacja_z_wyspa(None)


def scenariusz_10_deenergized_section() -> EnergyNetworkModel:
    return _stacja_dwutransformatorowa(sprzeglo="open", qf_tb_status="open").zbuduj()


def scenariusz_11_double_sided_open() -> EnergyNetworkModel:
    b = _stacja_dwutransformatorowa(sprzeglo="open")
    rgn_c = odplyw_do_podrozdzielnicy(
        b,
        "RGnN-B",
        "QF-B3",
        sub_ref="RGN-C",
        sub_bus="RGN-C_szyna",
        sub_name="Podrozdzielnica C",
        status="open",
    )
    odplyw_do_der(
        b,
        rgn_c,
        "QF-C1",
        nazwa_zrodla="Magazyn C",
        p_mw=0.06,
        gen_type="bess",
        zdolnosc="GRID_FORMING",
    )
    odplyw_do_odbioru(b, rgn_c, "QF-C2", nazwa_odbioru="Odbiór C", p_mw=0.02)
    return b.zbuduj()


def scenariusz_12_der_full_path() -> EnergyNetworkModel:
    b = BudowniczyStacji("stDER", "Stacja OZE")
    sn = b.szyna_sn("sn", "Szyna SN 15 kV")
    b.zrodlo_sn("src", "GPZ", sn)
    board = b.szyna("RGnN-1", "RGnN-1", korzen=True)
    transformator_z_wylacznikiem(b, "T1", "T1", sn, board, sn_mva=0.63, ct=True, relay=True)
    odplyw_do_odbioru(b, board, "QF-01", nazwa_odbioru="Odbiór 1", p_mw=0.04)
    odplyw_do_der(b, board, "QF-PV1", nazwa_zrodla="PV1", p_mw=0.1, ct=True, relay_lom=True)
    odplyw_do_der(
        b,
        board,
        "FU-BES",
        nazwa_zrodla="Magazyn energii",
        p_mw=0.05,
        gen_type="bess",
        zdolnosc="DUAL_MODE",
        aparat="bezpiecznik",
    )
    odplyw_do_der(
        b,
        board,
        "QF-G1",
        nazwa_zrodla="Agregat G1",
        p_mw=0.08,
        gen_type="synchronous",
        zdolnosc=None,
        ct=True,
        relay_lom=True,
    )
    return b.zbuduj()


def scenariusz_13_loads_via_fields() -> EnergyNetworkModel:
    b = BudowniczyStacji("stODB", "Stacja odbiorcza")
    sn = b.szyna_sn("sn", "Szyna SN 15 kV")
    b.zrodlo_sn("src", "GPZ", sn)
    board = b.szyna("RGnN-1", "RGnN-1", korzen=True)
    transformator_z_wylacznikiem(b, "T1", "T1", sn, board, sn_mva=0.4)
    odplyw_do_odbioru(
        b, board, "QF-01", nazwa_odbioru="Hala produkcyjna", p_mw=0.06, in_a=125.0, przekroj=70
    )
    odplyw_do_odbioru(
        b, board, "QS-02", aparat="rozlacznik", nazwa_odbioru="Oświetlenie", p_mw=0.008, przekroj=16
    )
    odplyw_do_odbioru(
        b,
        board,
        "QS-03",
        aparat="odlacznik",
        nazwa_odbioru="Rezerwa serwisowa",
        p_mw=0.004,
        przekroj=16,
    )
    odplyw_do_odbioru(
        b,
        board,
        "FU-04",
        aparat="bezpiecznik",
        nazwa_odbioru="Pompownia",
        p_mw=0.015,
        in_a=40.0,
        przekroj=25,
    )
    b.odbior("odbior_bez_pola", "Odbiór bez pola (audyt)", board, 0.003)
    return b.zbuduj()


def scenariusz_14_sub_boards() -> EnergyNetworkModel:
    b = BudowniczyStacji("stSUB", "Stacja z podrozdzielnicami")
    sn = b.szyna_sn("sn", "Szyna SN 15 kV")
    b.zrodlo_sn("src", "GPZ", sn)
    board = b.szyna("RGnN-1", "RGnN-1", korzen=True)
    transformator_z_wylacznikiem(b, "T1", "T1", sn, board, sn_mva=0.63)
    odplyw_do_odbioru(b, board, "QF-01", nazwa_odbioru="Odbiór główny", p_mw=0.03)
    rgn2 = odplyw_do_podrozdzielnicy(
        b, board, "QF-02", sub_ref="RGN-2", sub_bus="RGN-2_szyna", sub_name="RGN-2 (budynek B)"
    )
    odplyw_do_odbioru(
        b,
        rgn2,
        "FU-21",
        aparat="bezpiecznik",
        nazwa_odbioru="Odbiór RGN-2",
        p_mw=0.01,
        in_a=32.0,
        przekroj=25,
    )
    rgn3 = odplyw_do_podrozdzielnicy(
        b,
        rgn2,
        "FU-22",
        sub_ref="RGN-3",
        sub_bus="RGN-3_szyna",
        sub_name="RGN-3 (piętro 2)",
        aparat="rozlacznik",
        in_a=63.0,
        length_km=0.03,
    )
    odplyw_do_odbioru(
        b, rgn3, "QF-31", nazwa_odbioru="Odbiór RGN-3", p_mw=0.005, in_a=16.0, przekroj=16
    )
    odplyw_do_odbioru(
        b, rgn3, "QF-32", nazwa_odbioru="Klimatyzacja", p_mw=0.004, in_a=16.0, przekroj=16
    )
    return b.zbuduj()


def scenariusz_15_many_feeders() -> EnergyNetworkModel:
    b = BudowniczyStacji("stWIELE", "Stacja z wieloma odpływami")
    sn = b.szyna_sn("sn", "Szyna SN 15 kV")
    b.zrodlo_sn("src", "GPZ", sn)
    board = b.szyna(
        "RGnN-1", "Rozdzielnica główna nN 0,4 kV budynku administracyjnego", korzen=True
    )
    transformator_z_wylacznikiem(b, "T1", "T1", sn, board, sn_mva=1.0)
    nazwy = [
        "Oświetlenie zewnętrzne parkingu północnego",
        "Wentylacja mechaniczna hali",
        "Kotłownia gazowa",
        "Serwerownia (zasilanie gwarantowane)",
        "Winda osobowa nr 1",
        "Winda towarowa",
        "Kuchnia stołówki pracowniczej",
        "Warsztat mechaniczny",
        "Stacja ładowania pojazdów elektrycznych",
        "Pompownia przeciwpożarowa",
        "Oświetlenie wewnętrzne biur",
        "Gniazda ogólne piętro 1–3",
    ]
    for i, nazwa in enumerate(nazwy, start=1):
        odplyw_do_odbioru(
            b,
            board,
            f"QF-{i:02d}",
            nazwa_odbioru=nazwa,
            p_mw=round(0.004 + 0.003 * (i % 4), 4),
            in_a=float(16 + 16 * (i % 3)),
            przekroj=[16, 25, 35][i % 3],
        )
    return b.zbuduj()


def scenariusz_16_stale_result() -> EnergyNetworkModel:
    return _stacja_jednotransformatorowa(ref="stC", name="Stacja C").zbuduj()


def po_przebiegu_16(enm: EnergyNetworkModel) -> None:
    """Zmiana modelu PO przebiegu — wynik staje się NIEAKTUALNY."""
    enm.loads.append(
        Load(
            ref_id="odbior_nowy",
            name="Nowy odbiór",
            bus_ref="QF-01_koniec",
            p_mw=0.01,
            q_mvar=0.002,
        )
    )


def scenariusz_17_sc_results() -> EnergyNetworkModel:
    return _stacja_jednotransformatorowa(ref="stC", name="Stacja C").zbuduj()


def scenariusz_18_swz_overlay() -> EnergyNetworkModel:
    b = BudowniczyStacji("stSWZ", "Stacja SWZ")
    sn = b.szyna_sn("sn", "Szyna SN 15 kV")
    b.zrodlo_sn("src", "GPZ", sn)
    board = b.szyna("RGnN-1", "RGnN-1", korzen=True)
    transformator_z_wylacznikiem(b, "T1", "T1", sn, board, sn_mva=0.4)
    odplyw_do_odbioru(
        b,
        board,
        "QF-01",
        nazwa_odbioru="Odbiór bliski",
        p_mw=0.02,
        length_km=0.03,
        przekroj=35,
        in_a=40.0,
    )
    odplyw_do_odbioru(
        b,
        board,
        "QF-02",
        nazwa_odbioru="Odbiór daleki",
        p_mw=0.01,
        length_km=0.6,
        przekroj=16,
        in_a=63.0,
    )
    odplyw_do_odbioru(
        b,
        board,
        "FU-03",
        aparat="bezpiecznik",
        nazwa_odbioru="Odbiór średni",
        p_mw=0.012,
        length_km=0.2,
        przekroj=25,
        in_a=40.0,
    )
    return b.zbuduj()


@dataclass(frozen=True)
class ScenariuszNn:
    slug: str
    tytul_pl: str
    opis_pl: str
    station_ref: str
    budowniczy: Callable[[], EnergyNetworkModel]
    przebieg: Przebieg | None = None
    po_przebiegu: Callable[[EnergyNetworkModel], None] | None = None
    opcje_przebiegu: dict[str, Any] = field(default_factory=dict)


SCENARIUSZE: tuple[ScenariuszNn, ...] = (
    ScenariuszNn(
        "01_single_tr",
        "Jeden transformator",
        "T1 630 kVA, wyłącznik główny, trzy odpływy (odbiór, podrozdzielnica, PV w polu), pomiar CT i zabezpieczenie.",
        "stC",
        scenariusz_01_single_tr,
    ),
    ScenariuszNn(
        "02_two_tr_qbc_open",
        "Dwa transformatory, sprzęgło otwarte",
        "TA/TB 400 kVA, sekcje A/B, QBC otwarte — każda sekcja z własnego transformatora.",
        "stAB",
        scenariusz_02_two_tr_qbc_open,
    ),
    ScenariuszNn(
        "03_two_tr_qbc_closed",
        "Dwa transformatory, sprzęgło zamknięte",
        "Jak 02, QBC zamknięte — zasilanie wielostronne (MULTISOURCE).",
        "stAB",
        scenariusz_03_two_tr_qbc_closed,
    ),
    ScenariuszNn(
        "04_shared_upstream_boundary",
        "Wspólne zasilanie SN i granica domeny",
        "Jak 02 + wiązanie awaryjne (otwarte) do obcej stacji z własnym transformatorem.",
        "stAB",
        scenariusz_04_shared_upstream_boundary,
    ),
    ScenariuszNn(
        "05_independent_upstream",
        "Niezależne systemy SN",
        "TA z GPZ Północ, TB z GPZ Południe, QBC otwarte — dwie wyspy, dwie kotwice.",
        "stAB",
        scenariusz_05_independent_upstream,
    ),
    ScenariuszNn(
        "06_conflict_parallel_sources",
        "Konflikt: niezależne systemy spięte sprzęgłem",
        "Jak 05, QBC zamknięte — praca równoległa niezsynchronizowanych źródeł (CONFLICT).",
        "stAB",
        scenariusz_06_conflict_parallel_sources,
    ),
    ScenariuszNn(
        "07_island_grid_following",
        "Wyspa DER: źródło podążające",
        "Podrozdzielnica D za otwartym odłącznikiem z PV grid-following — NIEZASILONA.",
        "stW",
        scenariusz_07_island_grid_following,
    ),
    ScenariuszNn(
        "08_island_grid_forming",
        "Wyspa DER: źródło tworzące napięcie",
        "Podrozdzielnica D z magazynem grid-forming — zasilona z wyspy, bez odniesienia N/PE.",
        "stW",
        scenariusz_08_island_grid_forming,
    ),
    ScenariuszNn(
        "09_island_unknown",
        "Wyspa DER: zdolność nieznana",
        "Podrozdzielnica D z PV bez deklaracji — stan NIEZNANY.",
        "stW",
        scenariusz_09_island_unknown,
    ),
    ScenariuszNn(
        "10_deenergized_section",
        "Sekcja niezasilona",
        "QF-TB otwarty, QBC otwarte — sekcja B i jej odpływy niezasilone (wg topologii).",
        "stAB",
        scenariusz_10_deenergized_section,
    ),
    ScenariuszNn(
        "11_double_sided_open",
        "Energizacja dwustronna aparatu otwartego",
        "QF-B3 otwarty; za nim podrozdzielnica C z magazynem grid-forming — oba zaciski pod napięciem z różnych wysp.",
        "stAB",
        scenariusz_11_double_sided_open,
    ),
    ScenariuszNn(
        "12_der_full_path",
        "Pełny tor źródeł rozproszonych",
        "PV, magazyn (tryb podwójny) i agregat synchroniczny — każde z aparatem, kablem, punktem przyłączenia, CT i zabezpieczeniem LoM.",
        "stDER",
        scenariusz_12_der_full_path,
    ),
    ScenariuszNn(
        "13_loads_via_fields",
        "Odbiory przez pola",
        "Cztery rodzaje aparatów odpływowych + jeden odbiór bez pola (komunikat audytu).",
        "stODB",
        scenariusz_13_loads_via_fields,
    ),
    ScenariuszNn(
        "14_sub_boards",
        "Podrozdzielnice zagnieżdżone",
        "RGnN-1 → RGN-2 → RGN-3, trzy poziomy magistral.",
        "stSUB",
        scenariusz_14_sub_boards,
    ),
    ScenariuszNn(
        "15_many_feeders",
        "Wiele odpływów",
        "Dwanaście odpływów z długimi nazwami odbiorów.",
        "stWIELE",
        scenariusz_15_many_feeders,
    ),
    ScenariuszNn(
        "16_stale_result",
        "Wynik nieaktualny",
        "Przebieg rozpływu, potem zmiana modelu — wynik OUTDATED, komunikat NN-AUD-13.",
        "stC",
        scenariusz_16_stale_result,
        przebieg="PF",
        po_przebiegu=po_przebiegu_16,
    ),
    ScenariuszNn(
        "17_sc_results",
        "Wyniki zwarciowe",
        "Przebieg zwarciowy IEC 60909 — Ik″ na szynach nN, świeży wynik.",
        "stC",
        scenariusz_17_sc_results,
        przebieg="short_circuit_sn",
    ),
    ScenariuszNn(
        "18_swz_overlay",
        "SWZ: odpływy spełniające i niespełniające",
        "Trzy odpływy o różnej długości kabla — werdykty SWZ mieszane.",
        "stSWZ",
        scenariusz_18_swz_overlay,
    ),
)

SCENARIUSZ_PO_SLUGU: dict[str, ScenariuszNn] = {s.slug: s for s in SCENARIUSZE}
