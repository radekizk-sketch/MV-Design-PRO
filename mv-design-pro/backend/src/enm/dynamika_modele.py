"""Parametry dynamiczne zrodel ENM — kontrakt czasu (karta W6-1 SS0 p. 1-2).

Modul-lisc importowany przez ``enm/models.py`` (``Generator.dynamika``). Zero
fizyki tutaj: wylacznie ksztalt danych wejsciowych DAE, ktore w W6-2 skonsumuje
solver ``network_model/solvers/dynamika/`` (jeszcze nie istnieje w tej karcie —
zakaz calkowania, B-01).

``ParametryDynamiczne`` jest unia dyskryminowana po polu ``rodzina``:

* ``MaszynaSynchroniczna`` (model 6. rzedu: Xd/X'd/X''d, Xq/X'q/X''q, AVR/GOV/PSS)
* ``PrzeksztaltnikGFL`` (grid-following: PLL, ogranicznik pradu z priorytetem
  SKLADOWEJ z katalogu — A-9, NIGDY wybor w kodzie)
* ``PrzeksztaltnikGFM`` (grid-forming: droop/VSM, impedancja wirtualna)
* ``Magazyn`` (energia + PrzeksztaltnikGFL/GFM — jedna baza mocy przeksztaltnika)
* ``TurbinaWiatrowa`` (IEC 61400-27-1 typ 1-4: dwumasowosc, crowbar typ 3,
  przeksztaltnik typ 3/4)

Kazde pole liczbowe ma zakres fizyczny (``ge``/``le``) i **zero** ``default=``
liczbowego — brak danej wejsciowej jest brakiem pola wymaganego (Pydantic
zglasza ``ValidationError``), nigdy cicha domyslka (zero fabrykacji, ZASADA
NR 1). Pilnuje tego ``scripts/dynamika_zero_default_guard.py`` (AST po klasie).

``ProweniencjaParametrow`` (SS0 p. 2) jest WYMAGANA na kazdym bloku rodziny:
``profil_typowy_normy`` jest zrodlem legalnym (IEEE 1547-2018, IEC 61400-27-1,
EN 50549), ale wybranym JAWNIE przez projektanta — stopien dowodowy wyniku z
takiego profilu jest ``DECLARATION`` na osi proweniencji WEJSCIA
(``solver_input/provenance.py``), nigdy ``VALIDATED_SIMULATION`` z automatu.

Walidacje krzyzowe (KLASA NIE INSTANCJA — CLAUDE.md: karta wprost wymaga
``xd_bis <= xd_prim <= xd``; ten sam mechanizm porzadkowania stalych/reaktancji
przechodnich-podprzechodnich stosujemy SYMETRYCZNIE do osi q i do stalych
czasowych T''d0<=T'd0/T''q0<=T'q0 — pomijajac je zostawilibysmy ten sam defekt
na sasiednim polu tej samej klasy):
  * ``xd_bis_pu <= xd_prim_pu <= xd_pu`` (SS0 p.1, wprost)
  * ``xq_bis_pu <= xq_prim_pu <= xq_pu`` (symetria klasy — oz q)
  * ``td0_bis_s <= td0_prim_s`` / ``tq0_bis_s <= tq0_prim_s`` (podprzejsciowa
    stala czasowa fizycznie krotsza niz przejsciowa)
  * ``soc_min < soc_max`` i ``soc_min <= soc_poczatkowy <= soc_max`` (Magazyn)
  * ``p_ladowania_max_kw <= s_n_mva*1000`` i ``p_rozladowania_max_kw <=
    s_n_mva*1000`` (Magazyn, baza mocy z ``przeksztaltnik.s_n_mva`` — SS0 p.1
    wprost dla rozladowania, symetria klasy dla ladowania)
  * ``pitch_min_deg < pitch_max_deg`` (TurbinaWiatrowa)
  * crowbar/przeksztaltnik dopuszczalne WYLACZNIE dla rodziny wiatru, do ktorej
    fizycznie naleza (crowbar: tylko typ_3; przeksztaltnik: WYMAGANY dla
    typ_3/typ_4, ZABRONIONY dla typ_1/typ_2 — maszyny indukcyjne bezposrednio
    na sieci nie maja przeksztaltnika mocy pelnej/czesciowego w tym modelu)
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field, model_validator

# ---------------------------------------------------------------------------
# Proweniencja bloku (SS0 p. 2)
# ---------------------------------------------------------------------------

#: Zrodlo parametrow dynamicznych — WYMAGANE na kazdym bloku rodziny.
ZrodloProweniencjiDynamiki = Literal[
    "karta_producenta",
    "certyfikat_jednostki",
    "profil_typowy_normy",
    "deklaracja_uzytkownika",
]


class ProweniencjaParametrow(BaseModel):
    """Pochodzenie bloku parametrow dynamicznych (SS0 p. 2) — WYMAGANA.

    ``profil_typowy_normy`` jest zrodlem legalnym (IEEE 1547-2018,
    IEC 61400-27-1, EN 50549), ale stopien dowodowy wyniku policzonego z takiego
    profilu jest ``DECLARATION`` (rejestr A-2), nigdy ``VALIDATED_SIMULATION``.
    """

    zrodlo: ZrodloProweniencjiDynamiki
    odniesienie: str = Field(min_length=1, description="Numer dokumentu/normy/karty.")
    data: str | None = None


# ---------------------------------------------------------------------------
# Maszyna synchroniczna — regulatory
# ---------------------------------------------------------------------------


class RegulatorNapiecia(BaseModel):
    """AVR (SEXS / IEEE ST1A / IEEE AC1A) — IEEE 421.5."""

    typ: Literal["SEXS", "IEEE_ST1A", "IEEE_AC1A"]
    ka: float = Field(gt=0.0, le=1000.0, description="Wzmocnienie regulatora AVR.")
    ta_s: float = Field(gt=0.0, le=5.0, description="Stala czasowa AVR (s).")
    tb_s: float = Field(ge=0.0, le=20.0, description="Stala czasowa opoznienia (s).")
    tc_s: float = Field(ge=0.0, le=20.0, description="Stala czasowa wyprzedzenia (s).")
    efd_min_pu: float = Field(le=0.0, ge=-10.0, description="Dolny limit napiecia wzbudzenia (pu).")
    efd_max_pu: float = Field(gt=0.0, le=10.0, description="Gorny limit napiecia wzbudzenia (pu).")

    @model_validator(mode="after")
    def _limity_spojne(self) -> RegulatorNapiecia:
        if self.efd_min_pu >= self.efd_max_pu:
            raise ValueError(
                f"RegulatorNapiecia: efd_min_pu ({self.efd_min_pu}) musi byc mniejsze "
                f"niz efd_max_pu ({self.efd_max_pu})."
            )
        return self


class RegulatorObrotow(BaseModel):
    """Turbina/regulator obrotow (TGOV1 / HYGOV)."""

    typ: Literal["TGOV1", "HYGOV"]
    r_pu: float = Field(gt=0.0, le=0.15, description="Statyzm regulatora obrotow (pu).")
    t1_s: float = Field(ge=0.0, le=20.0, description="Stala czasowa 1 (s).")
    t2_s: float = Field(ge=0.0, le=20.0, description="Stala czasowa 2 (s).")
    t3_s: float = Field(ge=0.0, le=20.0, description="Stala czasowa 3 (s).")
    p_max_pu: float = Field(gt=0.0, le=1.5, description="Gorny limit mocy turbiny (pu).")
    p_min_pu: float = Field(ge=0.0, le=1.0, description="Dolny limit mocy turbiny (pu).")

    @model_validator(mode="after")
    def _limity_spojne(self) -> RegulatorObrotow:
        if self.p_min_pu >= self.p_max_pu:
            raise ValueError(
                f"RegulatorObrotow: p_min_pu ({self.p_min_pu}) musi byc mniejsze "
                f"niz p_max_pu ({self.p_max_pu})."
            )
        return self


class StabilizatorSystemowy(BaseModel):
    """PSS1A — stabilizator systemowy tlumienia oscylacji."""

    typ: Literal["PSS1A"]
    ks: float = Field(ge=0.0, le=100.0, description="Wzmocnienie PSS.")
    tw_s: float = Field(gt=0.0, le=30.0, description="Stala czasowa wash-out (s).")
    t1_s: float = Field(ge=0.0, le=5.0, description="Stala czasowa wyprzedzenia 1 (s).")
    t2_s: float = Field(ge=0.0, le=5.0, description="Stala czasowa opoznienia 1 (s).")
    t3_s: float = Field(ge=0.0, le=5.0, description="Stala czasowa wyprzedzenia 2 (s).")
    t4_s: float = Field(ge=0.0, le=5.0, description="Stala czasowa opoznienia 2 (s).")
    limit_min_pu: float = Field(le=0.0, ge=-0.5, description="Dolny limit wyjscia PSS (pu).")
    limit_max_pu: float = Field(gt=0.0, le=0.5, description="Gorny limit wyjscia PSS (pu).")

    @model_validator(mode="after")
    def _limity_spojne(self) -> StabilizatorSystemowy:
        if self.limit_min_pu >= self.limit_max_pu:
            raise ValueError(
                f"StabilizatorSystemowy: limit_min_pu ({self.limit_min_pu}) musi byc "
                f"mniejsze niz limit_max_pu ({self.limit_max_pu})."
            )
        return self


class MaszynaSynchroniczna(BaseModel):
    """Model maszyny synchronicznej 6. rzedu (Xd/X'd/X''d, Xq/X'q/X''q) — SS0 p.1.4."""

    rodzina: Literal["synchroniczna"] = "synchroniczna"
    proweniencja: ProweniencjaParametrow

    s_n_mva: float = Field(gt=0.0, le=2000.0, description="Moc znamionowa maszyny (MVA).")
    h_s: float = Field(gt=0.0, le=15.0, description="Stala inercji H (s).")
    d_pu: float = Field(ge=0.0, le=20.0, description="Wspolczynnik tlumienia D (pu).")
    xd_pu: float = Field(gt=0.0, le=2.5, description="Reaktancja synchroniczna wzdluzna Xd (pu).")
    xq_pu: float = Field(gt=0.0, le=2.5, description="Reaktancja synchroniczna poprzeczna Xq (pu).")
    xd_prim_pu: float = Field(gt=0.0, le=0.6, description="Reaktancja przejsciowa X'd (pu).")
    xq_prim_pu: float = Field(gt=0.0, le=0.8, description="Reaktancja przejsciowa X'q (pu).")
    xd_bis_pu: float = Field(gt=0.0, le=0.35, description="Reaktancja podprzejsciowa X''d (pu).")
    xq_bis_pu: float = Field(gt=0.0, le=0.4, description="Reaktancja podprzejsciowa X''q (pu).")
    td0_prim_s: float = Field(gt=0.0, le=15.0, description="Stala czasowa T'd0 (s).")
    tq0_prim_s: float = Field(gt=0.0, le=2.0, description="Stala czasowa T'q0 (s).")
    td0_bis_s: float = Field(gt=0.0, le=0.2, description="Stala czasowa T''d0 (s).")
    tq0_bis_s: float = Field(gt=0.0, le=0.3, description="Stala czasowa T''q0 (s).")
    xl_pu: float = Field(gt=0.0, le=0.35, description="Reaktancja rozproszenia stojana Xl (pu).")
    nasycenie_s10: float = Field(ge=0.0, le=1.5, description="Funkcja nasycenia Se(1.0).")
    nasycenie_s12: float = Field(ge=0.0, le=2.5, description="Funkcja nasycenia Se(1.2).")
    ra_pu: float = Field(ge=0.0, le=0.05, description="Rezystancja uzwojenia stojana Ra (pu).")

    wzbudzenie: RegulatorNapiecia | None = None
    turbina: RegulatorObrotow | None = None
    stabilizator: StabilizatorSystemowy | None = None

    @model_validator(mode="after")
    def _porzadek_reaktancji_i_stalych(self) -> MaszynaSynchroniczna:
        if not (self.xd_bis_pu <= self.xd_prim_pu <= self.xd_pu):
            raise ValueError(
                "MaszynaSynchroniczna: wymagany porzadek xd_bis_pu <= xd_prim_pu <= xd_pu "
                f"(otrzymano {self.xd_bis_pu} / {self.xd_prim_pu} / {self.xd_pu})."
            )
        if not (self.xq_bis_pu <= self.xq_prim_pu <= self.xq_pu):
            raise ValueError(
                "MaszynaSynchroniczna: wymagany porzadek xq_bis_pu <= xq_prim_pu <= xq_pu "
                f"(otrzymano {self.xq_bis_pu} / {self.xq_prim_pu} / {self.xq_pu})."
            )
        if self.td0_bis_s > self.td0_prim_s:
            raise ValueError(
                "MaszynaSynchroniczna: td0_bis_s musi byc <= td0_prim_s "
                f"(otrzymano {self.td0_bis_s} > {self.td0_prim_s})."
            )
        if self.tq0_bis_s > self.tq0_prim_s:
            raise ValueError(
                "MaszynaSynchroniczna: tq0_bis_s musi byc <= tq0_prim_s "
                f"(otrzymano {self.tq0_bis_s} > {self.tq0_prim_s})."
            )
        return self


# ---------------------------------------------------------------------------
# Przeksztaltniki (GFL / GFM)
# ---------------------------------------------------------------------------

#: Priorytet skladowej ogranicznika pradu — WYMAGANY, bez domyslki (A-9): postac
#: modelu jest parametrem katalogowym zmierzonym/zadeklarowanym, nigdy wyborem
#: zaszytym w kodzie solvera.
PriorytetOgranicznika = Literal["bierna", "czynna"]


class PrzeksztaltnikGFL(BaseModel):
    """Przeksztaltnik grid-following: PLL, regulator pradu, ogranicznik FRT."""

    rodzina: Literal["przeksztaltnikowa_gfl"] = "przeksztaltnikowa_gfl"
    proweniencja: ProweniencjaParametrow

    #: Baza mocy przeksztaltnika (MVA) — jedna baza dla i_max_pu i dla lancucha
    #: baz Magazynu (SS0 p.1 Magazyn: "jedna baza mocy s_n_mva przekształtnika").
    s_n_mva: float = Field(gt=0.0, le=500.0, description="Moc znamionowa przeksztaltnika (MVA).")
    i_max_pu: float = Field(ge=1.0, le=3.0, description="Maksymalny prad przeksztaltnika (pu).")
    priorytet_ogranicznika: PriorytetOgranicznika

    pll_kp: float = Field(gt=0.0, le=500.0, description="Wzmocnienie proporcjonalne PLL.")
    pll_ki: float = Field(gt=0.0, le=50000.0, description="Wzmocnienie calkujace PLL.")
    reg_pradu_kp: float = Field(gt=0.0, le=100.0, description="Wzmocnienie proporcjonalne regulatora pradu.")
    reg_pradu_ki: float = Field(gt=0.0, le=100000.0, description="Wzmocnienie calkujace regulatora pradu.")
    k_frt: float = Field(ge=0.0, le=10.0, description="Wzmocnienie pradu biernego przy zapadzie (FRT).")
    prog_frt_pu: float = Field(ge=0.0, le=1.0, description="Prog napieciowy zadzialania FRT (pu).")
    tp_s: float = Field(gt=0.0, le=2.0, description="Stala czasowa filtru mocy czynnej (s).")
    tiq_s: float = Field(gt=0.0, le=2.0, description="Stala czasowa regulatora Iq (s).")
    p_odbudowa_pu_na_s: float = Field(gt=0.0, le=20.0, description="Tempo odbudowy mocy czynnej (pu/s).")
    p_odbudowa_opoznienie_s: float = Field(ge=0.0, le=5.0, description="Opoznienie startu odbudowy P (s).")
    droop_p_f_pu: float = Field(ge=0.0, le=0.2, description="Droop P/f (pu).")
    martwa_strefa_f_hz: float = Field(ge=0.0, le=1.0, description="Martwa strefa czestotliwosci (Hz).")
    droop_q_u_pu: float = Field(ge=0.0, le=0.2, description="Droop Q/U (pu).")
    martwa_strefa_u_pu: float = Field(ge=0.0, le=0.2, description="Martwa strefa napiecia (pu).")
    u_min_ciagle_pu: float = Field(ge=0.0, le=1.0, description="Dolna granica pracy ciaglej (pu).")
    u_max_ciagle_pu: float = Field(ge=1.0, le=1.5, description="Gorna granica pracy ciaglej (pu).")

    @model_validator(mode="after")
    def _granice_napiecia_spojne(self) -> PrzeksztaltnikGFL:
        if self.u_min_ciagle_pu >= self.u_max_ciagle_pu:
            raise ValueError(
                "PrzeksztaltnikGFL: u_min_ciagle_pu musi byc mniejsze niz u_max_ciagle_pu "
                f"(otrzymano {self.u_min_ciagle_pu} >= {self.u_max_ciagle_pu})."
            )
        return self


#: Strategia ograniczenia GFM — WYMAGANA, bez domyslki (shadow review SS12:
#: postac zmierzona, nie wybrana w kodzie).
StrategiaOgraniczeniaGfm = Literal["impedancja_wirtualna", "nasycenie_zadania"]


class PrzeksztaltnikGFM(BaseModel):
    """Przeksztaltnik grid-forming: droop/VSM, impedancja wirtualna."""

    rodzina: Literal["przeksztaltnikowa_gfm"] = "przeksztaltnikowa_gfm"
    proweniencja: ProweniencjaParametrow

    s_n_mva: float = Field(gt=0.0, le=500.0, description="Moc znamionowa przeksztaltnika (MVA).")
    tryb: Literal["droop", "vsm"]
    mp_pu: float = Field(gt=0.0, le=0.2, description="Droop mocy czynnej P/f (pu).")
    mq_pu: float = Field(gt=0.0, le=0.2, description="Droop mocy biernej Q/U (pu).")
    h_wirtualne_s: float = Field(ge=0.0, le=20.0, description="Wirtualna stala inercji (s).")
    d_wirtualne_pu: float = Field(ge=0.0, le=100.0, description="Wirtualne tlumienie (pu).")
    r_wirtualne_pu: float = Field(ge=0.0, le=1.0, description="Wirtualna rezystancja wyjsciowa (pu).")
    x_wirtualne_pu: float = Field(ge=0.0, le=1.0, description="Wirtualna reaktancja wyjsciowa (pu).")
    i_max_pu: float = Field(ge=1.0, le=3.0, description="Maksymalny prad przeksztaltnika (pu).")
    strategia_ograniczenia: StrategiaOgraniczeniaGfm
    tp_s: float = Field(gt=0.0, le=2.0, description="Stala czasowa filtru mocy czynnej (s).")
    tiq_s: float = Field(gt=0.0, le=2.0, description="Stala czasowa regulatora Iq (s).")


# ---------------------------------------------------------------------------
# Magazyn energii
# ---------------------------------------------------------------------------


class RegulacjaCzestotliwosciMagazynu(BaseModel):
    """Regulacja czestotliwosciowa magazynu (droop + rezerwa mocy)."""

    droop_pu: float = Field(gt=0.0, le=0.2, description="Droop P/f magazynu (pu).")
    martwa_strefa_hz: float = Field(ge=0.0, le=1.0, description="Martwa strefa czestotliwosci (Hz).")
    p_rezerwa_pu: float = Field(ge=0.0, le=1.0, description="Rezerwa mocy na regulacje f (pu).")


class Magazyn(BaseModel):
    """Magazyn energii (BESS) = energia + przeksztaltnik (SS0 p.1)."""

    rodzina: Literal["magazyn"] = "magazyn"
    proweniencja: ProweniencjaParametrow

    e_n_kwh: float = Field(gt=0.0, le=2_000_000.0, description="Pojemnosc znamionowa (kWh).")
    p_ladowania_max_kw: float = Field(gt=0.0, le=500_000.0, description="Maks. moc ladowania (kW).")
    p_rozladowania_max_kw: float = Field(gt=0.0, le=500_000.0, description="Maks. moc rozladowania (kW).")
    sprawnosc_ladowania: float = Field(gt=0.0, le=1.0, description="Sprawnosc ladowania (pu).")
    sprawnosc_rozladowania: float = Field(gt=0.0, le=1.0, description="Sprawnosc rozladowania (pu).")
    soc_min: float = Field(ge=0.0, le=1.0, description="Dolna granica SOC (pu).")
    soc_max: float = Field(ge=0.0, le=1.0, description="Gorna granica SOC (pu).")
    soc_poczatkowy: float = Field(ge=0.0, le=1.0, description="Poczatkowy SOC (pu).")
    regulacja_f: RegulacjaCzestotliwosciMagazynu | None = None
    przeksztaltnik: PrzeksztaltnikGFL | PrzeksztaltnikGFM = Field(
        discriminator="rodzina", description="Przeksztaltnik magazynu (GFL albo GFM)."
    )

    @model_validator(mode="after")
    def _soc_i_moc_spojne(self) -> Magazyn:
        if self.soc_min >= self.soc_max:
            raise ValueError(
                f"Magazyn: soc_min ({self.soc_min}) musi byc mniejsze niz soc_max ({self.soc_max})."
            )
        if not (self.soc_min <= self.soc_poczatkowy <= self.soc_max):
            raise ValueError(
                f"Magazyn: soc_poczatkowy ({self.soc_poczatkowy}) musi lezec w przedziale "
                f"[soc_min={self.soc_min}, soc_max={self.soc_max}]."
            )
        baza_kw = self.przeksztaltnik.s_n_mva * 1000.0
        if self.p_rozladowania_max_kw > baza_kw:
            raise ValueError(
                f"Magazyn: p_rozladowania_max_kw ({self.p_rozladowania_max_kw}) przekracza "
                f"baze mocy przeksztaltnika s_n_mva*1000 ({baza_kw})."
            )
        if self.p_ladowania_max_kw > baza_kw:
            raise ValueError(
                f"Magazyn: p_ladowania_max_kw ({self.p_ladowania_max_kw}) przekracza "
                f"baze mocy przeksztaltnika s_n_mva*1000 ({baza_kw})."
            )
        return self


# ---------------------------------------------------------------------------
# Turbina wiatrowa (IEC 61400-27-1 typ 1-4)
# ---------------------------------------------------------------------------


class Crowbar(BaseModel):
    """Ochrona crowbar wirnika DFIG (typ 3)."""

    prog_pradu_pu: float = Field(gt=1.0, le=5.0, description="Prog pradu wirnika zalaczajacy crowbar (pu).")
    czas_zwloki_s: float = Field(ge=0.0, le=1.0, description="Zwloka zalaczenia crowbar (s).")
    czas_trwania_s: float = Field(gt=0.0, le=5.0, description="Czas trwania zalaczenia crowbar (s).")


TypIecTurbiny = Literal["wiatr_typ_1", "wiatr_typ_2", "wiatr_typ_3", "wiatr_typ_4"]


class TurbinaWiatrowa(BaseModel):
    """Turbina wiatrowa IEC 61400-27-1 (typ 1: SCIG, typ 2: WRIG, typ 3: DFIG,
    typ 4: pelny przeksztaltnik)."""

    rodzina: TypIecTurbiny
    proweniencja: ProweniencjaParametrow

    h_calkowite_s: float = Field(gt=0.0, le=15.0, description="Calkowita stala inercji ukladu (s).")
    sztywnosc_walu_pu: float = Field(gt=0.0, le=500.0, description="Sztywnosc walu (pu).")
    tlumienie_walu_pu: float = Field(ge=0.0, le=10.0, description="Tlumienie walu (pu).")
    poslizg_ustalony_pu: float = Field(ge=-0.1, le=0.1, description="Poslizg ustalony (pu).")
    crowbar: Crowbar | None = None
    pitch_tempo_deg_s: float = Field(gt=0.0, le=30.0, description="Tempo zmiany kata pitch (deg/s).")
    pitch_min_deg: float = Field(ge=-10.0, le=10.0, description="Minimalny kat pitch (deg).")
    pitch_max_deg: float = Field(gt=0.0, le=90.0, description="Maksymalny kat pitch (deg).")
    przeksztaltnik: PrzeksztaltnikGFL | None = None

    @model_validator(mode="after")
    def _spojnosc_typu(self) -> TurbinaWiatrowa:
        if self.pitch_min_deg >= self.pitch_max_deg:
            raise ValueError(
                f"TurbinaWiatrowa: pitch_min_deg ({self.pitch_min_deg}) musi byc mniejszy "
                f"niz pitch_max_deg ({self.pitch_max_deg})."
            )
        if self.rodzina == "wiatr_typ_3":
            pass  # crowbar opcjonalny (nie kazda instalacja DFIG go ma)
        elif self.crowbar is not None:
            raise ValueError(
                f"TurbinaWiatrowa: crowbar dotyczy wylacznie typ_3 (otrzymano {self.rodzina})."
            )
        if self.rodzina in ("wiatr_typ_3", "wiatr_typ_4"):
            if self.przeksztaltnik is None:
                raise ValueError(
                    f"TurbinaWiatrowa: {self.rodzina} wymaga bloku przeksztaltnik "
                    "(typ 3/4 ma przeksztaltnik czesciowej/pelnej mocy)."
                )
        elif self.przeksztaltnik is not None:
            raise ValueError(
                f"TurbinaWiatrowa: przeksztaltnik dotyczy wylacznie typ_3/typ_4 "
                f"(otrzymano {self.rodzina})."
            )
        return self


# ---------------------------------------------------------------------------
# Unia dyskryminowana
# ---------------------------------------------------------------------------

ParametryDynamiczne = Annotated[
    MaszynaSynchroniczna | PrzeksztaltnikGFL | PrzeksztaltnikGFM | Magazyn | TurbinaWiatrowa,
    Field(discriminator="rodzina"),
]

#: Wartosci dyskryminatora `rodzina` — jedno zrodlo prawdy dla walidacji poza
#: modelem (np. katalogu `der_dynamic`, mapowania readiness).
RODZINY_PARAMETROW_DYNAMICZNYCH: tuple[str, ...] = (
    "synchroniczna",
    "przeksztaltnikowa_gfl",
    "przeksztaltnikowa_gfm",
    "magazyn",
    "wiatr_typ_1",
    "wiatr_typ_2",
    "wiatr_typ_3",
    "wiatr_typ_4",
)

__all__ = [
    "RODZINY_PARAMETROW_DYNAMICZNYCH",
    "Crowbar",
    "Magazyn",
    "MaszynaSynchroniczna",
    "ParametryDynamiczne",
    "PriorytetOgranicznika",
    "PrzeksztaltnikGFL",
    "PrzeksztaltnikGFM",
    "ProweniencjaParametrow",
    "RegulacjaCzestotliwosciMagazynu",
    "RegulatorNapiecia",
    "RegulatorObrotow",
    "StabilizatorSystemowy",
    "StrategiaOgraniczeniaGfm",
    "TurbinaWiatrowa",
    "TypIecTurbiny",
    "ZrodloProweniencjiDynamiki",
]
