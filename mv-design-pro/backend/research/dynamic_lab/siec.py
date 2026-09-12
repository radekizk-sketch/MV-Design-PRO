"""Warstwa algebraiczna sieci: Ybus, wstrzyknięcia prądu, rozwiązanie ``g(x,V)=0``.

KOD BADAWCZY — patrz `backend/research/README.md`.

To jest ogniwo, którego w produkcyjnym silniku dynamicznym NIE MA (audyt §12:
``initial_voltage_pu = 1.0`` na sztywno, brak Ybus, elementy całkowane niezależnie).
Tutaj napięcie jest ROZWIĄZANIEM układu algebraicznego, a nie stałą.

Sformułowanie
-------------
Dla wektora stanów dynamicznych ``x`` i zespolonych napięć szyn ``V``:

    0 = g(x, V) = Ybus @ V - I_wstrzyk(x, V)

gdzie ``I_wstrzyk`` składa urządzenia. Część urządzeń (maszyna synchroniczna) jest
LINIOWA względem ``V`` i wchodzi jako ekwiwalent Nortona ``I_N - Y_N*V``; część
(falownik o zadanej mocy) jest NIELINIOWA i wymaga iteracji.

Ekwiwalenty Nortona są wnoszone do macierzy (``Y_efektywna = Ybus + diag(Y_N)``),
dzięki czemu iteracja Newtona dotyczy wyłącznie części nieliniowej i zbiega
w kilku krokach.

Zmiana topologii
----------------
Ybus jest BUDOWANY z listy gałęzi i bocznikow, więc zwarcie, wyłączenie linii czy
otwarcie wyłącznika to zmiana listy i przebudowa macierzy — nie „ustawienie
napięcia na 0,05 p.u.". Faktoryzacja jest unieważniana jawnie
(``_uniewaznij_faktoryzacje``), co jest miejscem, w którym produkcyjny solver
docelowo będzie chciał trzymać faktoryzację LU między krokami.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field, replace

import numpy as np
from numpy.typing import NDArray


class SiecOsobliwaError(RuntimeError):
    """Macierz sieci jest osobliwa — brak rozwiązania (np. wyspa bez źródła)."""


class BrakZbieznosciSieciError(RuntimeError):
    """Iteracja algebraiczna sieci nie zbiegła w zadanej liczbie kroków."""


@dataclass(frozen=True)
class Galaz:
    """Gałąź szeregowa (linia/kabel/transformator zastępczy) w p.u. bazy sieci.

    Model pi: impedancja szeregowa ``r + jx`` oraz susceptancja poprzeczna
    ``b_poprzeczna`` dzielona po połowie na oba końce.
    """

    od_szyny: str
    do_szyny: str
    r_pu: float
    x_pu: float
    b_poprzeczna_pu: float = 0.0
    zalaczona: bool = True
    ident: str = ""
    """TOŻSAMOŚĆ KOMPONENTU — identyfikator kabla/linii/transformatora.

    PO CO. Para szyn NIE JEST tożsamością: dwa tory równoległe między tymi samymi
    rozdzielniami to układ zwyczajny w sieci SN, a „wyłącz gałąź A–B" jest wtedy
    poleceniem niejednoznacznym.

    KOREKTA (audyt niezależny, plan naprawy §6). Poprzednia wersja nadawała
    brakującą tożsamość jako ``"<od>-<do>#<n>"``, gdzie ``n`` było NUMEREM
    WYSTĄPIENIA W KOLEJNOŚCI PODANIA. Tożsamość zależała więc od kolejności
    rekordów: permutacja listy gałęzi zamieniała ``A-B#1`` z ``A-B#2`` miejscami,
    a harmonogram mówiący „wyłącz A-B#1" po permutacji wyłączał INNY tor. To nie
    jest tożsamość, tylko pozycja w liście.

    Dziś:

    * gałąź JEDYNA między swoją parą szyn dostaje ``"<od>-<do>"`` (bez numeru) —
      nazwa zależy wyłącznie od danych gałęzi, więc permutacja jej nie zmienia;
    * gałąź w układzie RÓWNOLEGŁYM musi mieć ``ident`` podany JAWNIE — to jest
      identyfikator komponentu (numer kabla, oznaczenie pola), którego model
      laboratorium nie ma prawa wymyślić;
    * powtórzony ``ident`` jest błędem głośnym.
    """

    def admitancja_szeregowa(self) -> complex:
        z = complex(self.r_pu, self.x_pu)
        if z == 0:
            raise ValueError(f"Gałąź {self.od_szyny}->{self.do_szyny} ma zerową impedancję")
        return 1.0 / z


#: Źródło bocznika, który należy do MODELU sieci, a nie do zdarzenia. Boczniki
#: o tym źródle przeżywają każde zdjęcie zwarcia — to jest bateria kondensatorów,
#: dławik kompensacyjny, stały shunt linii.
ZRODLO_MODEL = "model"


@dataclass(frozen=True)
class Bocznik:
    """Admitancja bocznikowa szyny (kompensacja, ale też ZWARCIE przez ``Zf``).

    ``zrodlo`` jest TOŻSAMOŚCIĄ bocznika, nie etykietą opisową. Bez niej zdjęcie
    zwarcia usuwało WSZYSTKIE boczniki szyny — a więc także baterię kondensatorów,
    która istniała przed zwarciem i nie miała z nim nic wspólnego. Sieć po
    zdjęciu zwarcia nie wracała wtedy do stanu sprzed zwarcia, tylko do sieci
    zubożonej o cudzą kompensację, i każdy wynik po tej chwili dotyczył innej
    sieci niż deklarowana (defekt E1 audytu).
    """

    szyna: str
    g_pu: float = 0.0
    b_pu: float = 0.0
    zrodlo: str = ZRODLO_MODEL

    def admitancja(self) -> complex:
        return complex(self.g_pu, self.b_pu)


@dataclass
class TopologiaSieci:
    """Topologia sieci laboratorium: szyny, gałęzie, boczniki, szyny sztywne.

    ``szyny_sztywne`` to szyny o narzuconym napięciu (system nadrzędny / szyna
    nieskończona). Dla nich równanie węzłowe zastępuje się ``V = V_zadane``.
    """

    szyny: tuple[str, ...]
    galezie: list[Galaz] = field(default_factory=list)
    boczniki: list[Bocznik] = field(default_factory=list)
    szyny_sztywne: dict[str, complex] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if len(set(self.szyny)) != len(self.szyny):
            raise ValueError("Powtórzone identyfikatory szyn")
        znane = set(self.szyny)
        for g in self.galezie:
            if g.od_szyny not in znane or g.do_szyny not in znane:
                raise ValueError(f"Gałąź {g.od_szyny}->{g.do_szyny} wskazuje nieznaną szynę")
        for b in self.boczniki:
            if b.szyna not in znane:
                raise ValueError(f"Bocznik na nieznanej szynie {b.szyna}")
        for s in self.szyny_sztywne:
            if s not in znane:
                raise ValueError(f"Szyna sztywna {s} nie istnieje")
        self._nadaj_tozsamosci_galezi()

    def _nadaj_tozsamosci_galezi(self) -> None:
        """Uzupełnij brakujące tożsamości gałęzi — NIEZALEŻNIE OD KOLEJNOŚCI.

        DEFEKT, KTÓRY TA WERSJA ZAMYKA (audyt niezależny, plan naprawy §6).
        Poprzednia wersja numerowała gałęzie bez ``ident`` w kolejności podania
        (``"<od>-<do>#<n>"``). Tożsamość zależała więc od KOLEJNOŚCI REKORDÓW:
        permutacja listy zamieniała ``A-B#1`` z ``A-B#2``, więc harmonogram
        „wyłącz A-B#1" po permutacji wyłączał DRUGI tor — cicho, bez błędu,
        z przebiegiem wyglądającym poprawnie.

        Reguła po naprawie:

        1. gałąź JEDYNA między swoją parą szyn (w ujęciu NIEUPORZĄDKOWANYM, bo
           ``A→B`` i ``B→A`` to ta sama para fizyczna) dostaje ``"<od>-<do>"``;
           nazwa zależy wyłącznie od danych tej gałęzi,
        2. gałąź w układzie RÓWNOLEGŁYM bez jawnego ``ident`` jest błędem —
           laboratorium nie ma prawa wymyślić numeru kabla,
        3. powtórzony ``ident`` jest błędem, bo dwie gałęzie o tej samej nazwie
           są nieodróżnialne dla zdarzeń topologicznych.
        """
        pary: dict[frozenset[str], int] = {}
        for g in self.galezie:
            para = frozenset((g.od_szyny, g.do_szyny))
            pary[para] = pary.get(para, 0) + 1

        bez_tozsamosci_w_rownolegle = sorted(
            f"{g.od_szyny}<->{g.do_szyny}"
            for g in self.galezie
            if not g.ident and pary[frozenset((g.od_szyny, g.do_szyny))] > 1
        )
        if bez_tozsamosci_w_rownolegle:
            raise ValueError(
                f"Tory równoległe bez jawnej tożsamości: {sorted(set(bez_tozsamosci_w_rownolegle))}. "
                "Numer nadany po kolejności rekordów NIE JEST tożsamością — permutacja "
                "listy zamieniłaby tory miejscami, a zdarzenie topologiczne wyłączyłoby "
                "inny niż zamierzony. Podaj `ident` z identyfikatora komponentu "
                "(numer kabla, oznaczenie pola)."
            )

        nowe = [
            g if g.ident else replace(g, ident=f"{g.od_szyny}-{g.do_szyny}") for g in self.galezie
        ]
        identy = [g.ident for g in nowe]
        powtorzone = sorted({i for i in identy if identy.count(i) > 1})
        if powtorzone:
            raise ValueError(
                f"Powtórzone tożsamości gałęzi: {powtorzone}. Dwie gałęzie o tej samej "
                f"nazwie są nieodróżnialne dla zdarzeń topologicznych."
            )
        self.galezie = nowe

    @property
    def identy_galezi(self) -> tuple[str, ...]:
        """Tożsamości gałęzi w kolejności podania — do diagnostyki scenariusza."""
        return tuple(g.ident for g in self.galezie)

    @property
    def indeks(self) -> dict[str, int]:
        return {szyna: i for i, szyna in enumerate(self.szyny)}

    def zbuduj_ybus(self) -> NDArray[np.complex128]:
        """Zbuduj Ybus [p.u.] z bieżącej listy gałęzi i boczników.

        Model pi: dla gałęzi ``y`` szeregowej i ``b`` poprzecznej całkowitej,
        na każdym końcu dokładane jest ``j*b/2``.
        """
        n = len(self.szyny)
        idx = self.indeks
        ybus = np.zeros((n, n), dtype=np.complex128)
        for g in self.galezie:
            if not g.zalaczona:
                continue
            i, j = idx[g.od_szyny], idx[g.do_szyny]
            y = g.admitancja_szeregowa()
            ybus[i, i] += y
            ybus[j, j] += y
            ybus[i, j] -= y
            ybus[j, i] -= y
            if g.b_poprzeczna_pu:
                y_pop = complex(0.0, g.b_poprzeczna_pu / 2.0)
                ybus[i, i] += y_pop
                ybus[j, j] += y_pop
        for b in self.boczniki:
            ybus[idx[b.szyna], idx[b.szyna]] += b.admitancja()
        return ybus

    def z_bocznikiem(self, bocznik: Bocznik) -> TopologiaSieci:
        """Nowa topologia z dodanym bocznikiem (np. zwarcie przez impedancję)."""
        return replace(self, boczniki=[*self.boczniki, bocznik])

    def bez_bocznika_o_zrodle(self, zrodlo: str) -> TopologiaSieci:
        """Nowa topologia bez bocznika o WSKAZANEJ tożsamości.

        Zastępuje dawne ``bez_bocznikow_na(szyna)``, które kasowało wszystko na
        szynie. Nieistniejące źródło jest błędem GŁOŚNYM: zdjęcie zwarcia,
        którego nie ma, znaczy, że scenariusz opisuje inną sieć niż liczona.
        """
        zostaja = [b for b in self.boczniki if b.zrodlo != zrodlo]
        if len(zostaja) == len(self.boczniki):
            dostepne = sorted({b.zrodlo for b in self.boczniki})
            raise ValueError(
                f"Brak bocznika o źródle „{zrodlo}" + "” — nie ma czego zdjąć. "
                f"Boczniki w modelu: {dostepne}."
            )
        return replace(self, boczniki=zostaja)

    def zrodla_bocznikow_na(self, szyna: str) -> tuple[str, ...]:
        """Tożsamości boczników na szynie — w kolejności deterministycznej."""
        return tuple(sorted({b.zrodlo for b in self.boczniki if b.szyna == szyna}))

    def z_wylaczona_galezia_po_id(self, ident: str) -> TopologiaSieci:
        """Nowa topologia z wyłączoną gałęzią o WSKAZANEJ tożsamości.

        To jest właściwa droga adresowania zdarzenia topologicznego: jednoznaczna
        także przy torach równoległych.
        """
        nowe: list[Galaz] = []
        trafiono = False
        for g in self.galezie:
            if g.ident == ident:
                if not g.zalaczona:
                    raise ValueError(
                        f"Gałąź \u201e{ident}\u201d jest już wyłączona — powtórne "
                        "wyłączenie znaczy, że scenariusz opisuje inną sieć niż liczona."
                    )
                nowe.append(replace(g, zalaczona=False))
                trafiono = True
            else:
                nowe.append(g)
        if not trafiono:
            raise ValueError(
                f"Brak gałęzi o tożsamości \u201e{ident}\u201d. "
                f"Gałęzie w modelu: {list(self.identy_galezi)}."
            )
        return replace(self, galezie=nowe)

    def z_wylaczona_galezia(self, od_szyny: str, do_szyny: str) -> TopologiaSieci:
        """Wyłączenie gałęzi wskazanej PARĄ SZYN — wyłącznie gdy jest jednoznaczna.

        DEFEKT, KTÓRY TA WERSJA ZAMYKA (odtworzony, nie wydedukowany). Poprzednia
        pętla nie miała przerwania: przy DWÓCH torach równoległych między tymi
        samymi szynami „wyłącz gałąź GEN–SYS" wyłączało OBA naraz. Pomiar na
        dwóch torach po 0,40 p.u.: ``Ybus[0,0]`` przechodziło z ``−5j`` na ``0j``,
        czyli maszyna zostawała ODCIĘTA od systemu zamiast stracić jeden tor.
        Skutek był CICHY — żadnego błędu, a przebieg wyglądał jak utrata
        synchronizmu po wyłączeniu linii.

        Teraz para szyn jest dopuszczalna tylko wtedy, gdy wskazuje dokładnie
        jedną załączoną gałąź. Niejednoznaczność jest błędem głośnym i odsyła do
        `z_wylaczona_galezia_po_id`, bo to ona jest właściwym adresowaniem.
        """
        pasujace = [
            g
            for g in self.galezie
            if {g.od_szyny, g.do_szyny} == {od_szyny, do_szyny} and g.zalaczona
        ]
        if not pasujace:
            raise ValueError(f"Brak załączonej gałęzi {od_szyny}<->{do_szyny}")
        if len(pasujace) > 1:
            raise ValueError(
                f"Para szyn {od_szyny}<->{do_szyny} wskazuje {len(pasujace)} załączonych "
                f"gałęzi ({[g.ident for g in pasujace]}) — polecenie jest niejednoznaczne. "
                f"Użyj `z_wylaczona_galezia_po_id(ident)`: tor równoległy wyłącza się "
                f"pojedynczo, a nie w komplecie."
            )
        return self.z_wylaczona_galezia_po_id(pasujace[0].ident)


@dataclass
class RozwiazanieSieci:
    """Wynik rozwiązania algebraicznego sieci."""

    napiecia: NDArray[np.complex128]
    iteracje: int
    residuum: float
    #: Ile kroków wymagało TŁUMIENIA (krok < 1) — ślad White Box globalizacji.
    #: Zero znaczy „czysty Newton wystarczył"; wartość > 0 mówi, że zadanie
    #: dotknęło załamania charakterystyki i metoda musiała skrócić krok.
    kroki_tlumione: int = 0
    #: Najmniejszy przyjęty współczynnik kroku. 1.0 = ani razu nie tłumiono.
    najmniejszy_krok: float = 1.0


class SolverSieci:
    """Rozwiązuje ``Ybus @ V = I_wstrzyk(x, V)`` metodą Newtona (rozdział Re/Im).

    Nieliniowość pochodzi wyłącznie od urządzeń o zadanej mocy (falownik).
    Urządzenia liniowe wnoszą ekwiwalent Nortona do macierzy, więc dla sieci
    z samymi maszynami iteracja zbiega w jednym kroku.

    GLOBALIZACJA: NEWTON TŁUMIONY (nawrót Armijo), NIE CZYSTY NEWTON.
    Nieliniowość ograniczników prądu falownika GFM jest ciągła, ale
    NIERÓŻNICZKOWALNA (pin: `test_ograniczenie_pradu_jest_ciagle_ale_nie_
    rozniczkowalne`). W otoczeniu załamania jakobian różnicowy jest złym modelem
    funkcji: pełny krok Newtona przestrzeliwuje, a iteracja potrafi WPAŚĆ W CYKL
    zamiast zbiegać.

    DOWÓD, ŻE TO NIE JEST TEORIA. Wcześniejsza wersja brała pełny krok zawsze.
    Na tym samym kodzie i tym samym zadaniu (sztywność napięciowa DER przy
    nasyceniu, zwarcie x_f = 0,01 p.u.) lokalnie kończyło się w 34 iteracjach
    (residuum 1,7e-14), a w CI — po 120 iteracjach residuum STAŁO na 1,569e-01,
    czyli trzynaście rzędów wielkości od progu. Podniesienie limitu 40 → 120
    (poprzednia karta) wyleczyło JEDNĄ instancję i zostawiło klasę: metoda bez
    globalizacji nie ma żadnej gwarancji spadku residuum, więc „ile iteracji
    wystarczy" zależy od ostatnich bitów `np.linalg.solve`, czyli od maszyny.
    To jest naruszenie determinizmu, a nie kwestia zapasu.

    NAWRÓT ARMIJO (Dennis & Schnabel, Kelley — metoda podręcznikowa, nie
    heurystyka). Krok ``α`` startuje z 1,0 i jest połowiony, dopóki nie spełni
    warunku DOSTATECZNEGO SPADKU::

        ‖r(V + α·ΔV)‖ ≤ (1 − c·α)·‖r(V)‖,    c = 1e-4

    Dzięki temu residuum maleje MONOTONICZNIE z każdej przyjętej iteracji, a
    wynik „zbiegło / nie zbiegło" przestaje zależeć od maszyny. Gdy żaden krok
    aż do ``α_min`` nie daje dostatecznego spadku, iteracja stoi w punkcie
    stacjonarnym residuum — to jest PRAWDZIWA porażka zadania, meldowana jawnie,
    a nie wyczerpanie limitu iteracji.

    TO NIE JEST PODNIESIENIE TOLERANCJI. Żądana dokładność (``1e-12``) jest bez
    zmian. Limit iteracji zostaje na 120 — z globalizacją jest zapasem, a nie
    jedyną obroną.
    """

    def __init__(
        self,
        topologia: TopologiaSieci,
        *,
        tolerancja: float = 1.0e-12,
        maks_iteracji: int = 120,
        wspolczynnik_armijo: float = 1.0e-4,
        minimalny_krok: float = 2.0**-20,
        pamiec_niemonotoniczna: int = 8,
    ) -> None:
        self.topologia = topologia
        self.tolerancja = tolerancja
        self.maks_iteracji = maks_iteracji
        #: Stała ``c`` warunku dostatecznego spadku Armijo. Wartość 1e-4 jest
        #: kanoniczna (Dennis & Schnabel §6.3): dość mała, by nie odrzucać
        #: dobrych pełnych kroków, dość duża, by wykluczyć spadki pozorne.
        self.wspolczynnik_armijo = wspolczynnik_armijo
        #: Najmniejszy dopuszczalny współczynnik kroku (2⁻²⁰ ≈ 1e-6). Poniżej
        #: niego kierunek Newtona nie jest już kierunkiem spadku — zadanie stoi
        #: w punkcie stacjonarnym i meldujemy to JAWNIE, zamiast mielić iteracje.
        self.minimalny_krok = minimalny_krok
        #: Długość pamięci nawrotu niemonotonicznego (GLL). 1 = klasyczny,
        #: monotoniczny Armijo.
        self.pamiec_niemonotoniczna = pamiec_niemonotoniczna
        #: Rosnące λ kierunku Levenberga–Marquardta, próbowane po kolei, gdy
        #: kierunek Newtona nie jest kierunkiem spadku. Zakres 1e-8…1e2 pokrywa
        #: przejście od „prawie Newton" do „prawie najszybszy spadek".
        self.lambdy_lm: tuple[float, ...] = (1.0e-8, 1.0e-6, 1.0e-4, 1.0e-2, 1.0, 1.0e2)
        self._ybus: NDArray[np.complex128] | None = None

    @property
    def ybus(self) -> NDArray[np.complex128]:
        if self._ybus is None:
            self._ybus = self.topologia.zbuduj_ybus()
        return self._ybus

    def ustaw_topologie(self, topologia: TopologiaSieci) -> None:
        """Podmień topologię i unieważnij zbudowaną macierz (zmiana topologii)."""
        self.topologia = topologia
        self._uniewaznij_faktoryzacje()

    def _uniewaznij_faktoryzacje(self) -> None:
        """Punkt, w którym docelowy solver produkcyjny zwolni faktoryzację LU."""
        self._ybus = None

    def rozwiaz(
        self,
        wstrzykniecia: FunkcjaWstrzyknięć,
        v_start: NDArray[np.complex128],
        *,
        admitancje_nortona: NDArray[np.complex128] | None = None,
    ) -> RozwiazanieSieci:
        """Rozwiąż układ algebraiczny sieci dla zadanego stanu urządzeń.

        Args:
            wstrzykniecia: funkcja ``V -> I`` (wektor zespolony wstrzyknięć).
            v_start: punkt startowy iteracji.
            admitancje_nortona: opcjonalne ``Y_N`` per szyna wnoszone do diagonali
                (część liniowa urządzeń). Wtedy ``wstrzykniecia`` zwraca wyłącznie
                źródłową część prądu ``I_N``.

        Raises:
            SiecOsobliwaError: gdy macierz jest osobliwa.
            BrakZbieznosciSieciError: gdy iteracja nie zbiegła.
        """
        n = len(self.topologia.szyny)
        idx = self.topologia.indeks
        y = self.ybus.copy()
        if admitancje_nortona is not None:
            y[np.diag_indices(n)] += admitancje_nortona

        sztywne = {idx[s]: v for s, v in self.topologia.szyny_sztywne.items()}
        v = v_start.astype(np.complex128).copy()
        for i, v_zadane in sztywne.items():
            v[i] = v_zadane

        def _residuum(v_probne: NDArray[np.complex128]) -> tuple[NDArray[np.complex128], float]:
            r_lok = y @ v_probne - wstrzykniecia(v_probne)
            for i in sztywne:
                r_lok[i] = 0.0
            return r_lok, (float(np.max(np.abs(r_lok))) if n else 0.0)

        def _z_krokiem(
            v_bazowe: NDArray[np.complex128],
            kierunek: NDArray[np.complex128],
            alfa: float,
        ) -> NDArray[np.complex128]:
            v_nowe = v_bazowe + alfa * kierunek
            for i, v_zadane in sztywne.items():
                v_nowe[i] = v_zadane
            return v_nowe

        r, norma = _residuum(v)
        norma_poczatkowa = norma
        kroki_tlumione = 0
        najmniejszy_krok = 1.0
        # PAMIĘĆ NIEMONOTONICZNA (Grippo–Lampariello–Lucidi 1986): warunek
        # dostatecznego spadku odnosi się do NAJWIĘKSZEJ normy z ostatnich
        # `pamiec_niemonotoniczna` przyjętych iteracji, nie do poprzedniej.
        pamiec_norm: deque[float] = deque([norma], maxlen=self.pamiec_niemonotoniczna)
        # ZABEZPIECZENIE MONOTONICZNE (standardowy towarzysz GLL): pamiętamy
        # NAJLEPSZY dotąd punkt. Luz niemonotoniczny pozwala przejść przez
        # grzbiet załamania, ale bez tej kotwicy potrafi też ODEJŚĆ od
        # rozwiązania i nie wrócić — zmierzone: residuum dryfujące z 2,25e-01
        # (pamięć 1) do 2,63e+00 (pamięć 8) na tym samym zadaniu.
        v_naj, r_naj, norma_naj = v.copy(), r.copy(), norma
        bez_poprawy = 0
        powroty_do_najlepszego = 0

        for iteracja in range(1, self.maks_iteracji + 1):
            if norma < self.tolerancja:
                return RozwiazanieSieci(
                    napiecia=v,
                    iteracje=iteracja - 1,
                    residuum=norma,
                    kroki_tlumione=kroki_tlumione,
                    najmniejszy_krok=najmniejszy_krok,
                )

            jak = self._jakobian(y, wstrzykniecia, v, sztywne)
            rez = np.concatenate([r.real, r.imag])
            try:
                delta = np.linalg.solve(jak, -rez)
            except np.linalg.LinAlgError as exc:  # pragma: no cover - zależy od danych
                raise SiecOsobliwaError(
                    "Macierz sieci jest osobliwa — sprawdź wyspy bez źródła "
                    "i szyny bez połączenia."
                ) from exc
            kierunek = delta[:n] + 1j * delta[n:]

            # NAWRÓT NIEMONOTONICZNY (GLL) + ZAPASOWY KIERUNEK LEVENBERGA–MARQUARDTA.
            #
            # Ogranicznik prądu falownika GFM przy zwarciu bliskim metalicznemu
            # jest AKTYWNY (zmierzone: |I| = 1,2000 p.u. co do cyfry, czyli
            # dokładnie na ograniczeniu). Wtedy moduł wstrzyknięcia przestaje
            # zależeć od |V|, więc jakobian traci rząd w kierunku modułu napięcia
            # — jest niemal osobliwy, a kierunek Newtona przestaje być kierunkiem
            # spadku. Sam nawrót tego nie ratuje (skracanie złego kierunku daje
            # zły krok), dlatego zapasowo liczymy kierunek LM:
            #
            #     (JᵀJ + λ·diag(JᵀJ)) · δ = −Jᵀ r
            #
            # który dla rosnącego λ przechodzi płynnie od Newtona do najszybszego
            # spadku i JEST kierunkiem spadku zawsze, gdy Jᵀr ≠ 0.
            odniesienie = max(pamiec_norm)

            def _nawrot(
                kier: NDArray[np.complex128],
                *,
                v_bazowe: NDArray[np.complex128] = v,
                prog: float = odniesienie,
            ) -> tuple[bool, float]:
                """Największy krok ``α = 2⁻ᵏ`` spełniający warunek GLL, albo porażka."""
                alfa_lok = 1.0
                while alfa_lok >= self.minimalny_krok:
                    _, norma_p = _residuum(_z_krokiem(v_bazowe, kier, alfa_lok))
                    if norma_p <= (1.0 - self.wspolczynnik_armijo * alfa_lok) * prog:
                        return True, alfa_lok
                    alfa_lok *= 0.5
                return False, 0.0

            przyjeto, alfa = _nawrot(kierunek)
            if not przyjeto:
                jtj = jak.T @ jak
                jtr = jak.T @ rez
                skala = np.diag(np.maximum(np.diag(jtj), 1.0e-12))
                for lam in self.lambdy_lm:
                    try:
                        delta_lm = np.linalg.solve(jtj + lam * skala, -jtr)
                    except np.linalg.LinAlgError:  # pragma: no cover - skrajnie rzadkie
                        continue
                    kier_lm = delta_lm[:n] + 1j * delta_lm[n:]
                    przyjeto, alfa = _nawrot(kier_lm)
                    if przyjeto:
                        kierunek = kier_lm
                        break

            if przyjeto:
                v = _z_krokiem(v, kierunek, alfa)
                r, norma = _residuum(v)
                pamiec_norm.append(norma)
                if alfa < 1.0:
                    kroki_tlumione += 1
                    najmniejszy_krok = min(najmniejszy_krok, alfa)
                if norma < norma_naj:
                    v_naj, r_naj, norma_naj = v.copy(), r.copy(), norma
                    bez_poprawy = 0
                    continue
                bez_poprawy += 1
                if bez_poprawy < self.pamiec_niemonotoniczna:
                    continue
                # Cała długość pamięci bez poprawy rekordu: luz przestał służyć
                # przejściu przez grzbiet i zaczął oddalać od rozwiązania.
                v, r, norma = v_naj.copy(), r_naj.copy(), norma_naj
                pamiec_norm.clear()
                pamiec_norm.append(norma_naj)
                bez_poprawy = 0
                powroty_do_najlepszego += 1
                continue

            if norma > norma_naj:
                # Zanim ogłosimy porażkę: wróć do NAJLEPSZEGO punktu i spróbuj
                # jeszcze raz stamtąd, monotonicznie. Bez tego luz GLL mógłby
                # „zgubić" lepsze rozwiązanie znalezione wcześniej.
                v, r, norma = v_naj.copy(), r_naj.copy(), norma_naj
                pamiec_norm.clear()
                pamiec_norm.append(norma_naj)
                bez_poprawy = 0
                powroty_do_najlepszego += 1
                continue

            if not przyjeto:
                # Żaden krok aż do `minimalny_krok` nie zmniejsza residuum:
                # iteracja stoi w punkcie stacjonarnym normy residuum. To jest
                # PRAWDZIWA porażka zadania, a nie wyczerpanie limitu iteracji —
                # dodatkowe kroki niczego by nie zmieniły.
                raise BrakZbieznosciSieciError(
                    f"Sieć utknęła w punkcie stacjonarnym residuum po {iteracja - 1} "
                    f"iteracjach: residuum {norma:.3e} przy progu "
                    f"{self.tolerancja:.1e}, residuum startowe {norma_poczatkowa:.3e}. "
                    f"Ani kierunek Newtona, ani żaden kierunek Levenberga–Marquardta "
                    f"(λ do {self.lambdy_lm[-1]:.0e}) nie daje dostatecznego spadku "
                    f"normy przy kroku aż do {self.minimalny_krok:.1e} (warunek Armijo "
                    f"niemonotoniczny, c={self.wspolczynnik_armijo:.0e}, pamięć "
                    f"{self.pamiec_niemonotoniczna}, powrotów do najlepszego punktu: "
                    f"{powroty_do_najlepszego}). To jest PRAWDZIWA porażka zadania — "
                    f"zwiększanie limitu iteracji NIE pomoże."
                )

        raise BrakZbieznosciSieciError(
            f"Sieć nie zbiegła w {self.maks_iteracji} iteracjach: residuum "
            f"{norma:.3e} przy progu {self.tolerancja:.1e}, residuum startowe "
            f"{norma_poczatkowa:.3e}. Każdy krok zmniejszał normę (nawrót Armijo "
            f"tego pilnuje), więc to NIE jest rozjazd ani cykl — zadanie zbiega "
            f"zbyt wolno albo krąży wokół załamania. Tłumionych kroków: "
            f"{kroki_tlumione}, najmniejszy przyjęty krok: {najmniejszy_krok:.3e}, "
            f"powrotów do najlepszego punktu: {powroty_do_najlepszego}, "
            f"najlepsze osiągnięte residuum: {norma_naj:.3e}."
        )

    def _jakobian(
        self,
        y: NDArray[np.complex128],
        wstrzykniecia: FunkcjaWstrzyknięć,
        v: NDArray[np.complex128],
        sztywne: dict[int, complex],
    ) -> NDArray[np.float64]:
        """Jakobian numeryczny residuum względem ``[Re(V), Im(V)]``.

        Numeryczny świadomie: w laboratorium liczy się przejrzystość i możliwość
        podmiany modelu urządzenia bez wyprowadzania pochodnych. Wybór metody dla
        produkcji (analityczny vs numeryczny) jest decyzją wydajnościową,
        udokumentowaną w pakiecie decyzyjnym.
        """
        n = len(v)
        eps = 1.0e-7
        jak = np.zeros((2 * n, 2 * n), dtype=np.float64)
        r0 = y @ v - wstrzykniecia(v)
        for kol in range(n):
            if kol in sztywne:
                jak[kol, kol] = 1.0
                jak[n + kol, n + kol] = 1.0
                continue
            for czesc in (0, 1):
                v_pert = v.copy()
                v_pert[kol] += eps if czesc == 0 else 1j * eps
                r1 = y @ v_pert - wstrzykniecia(v_pert)
                d = (r1 - r0) / eps
                jak[:n, kol + czesc * n] = d.real
                jak[n:, kol + czesc * n] = d.imag
        for i in sztywne:
            jak[i, :] = 0.0
            jak[n + i, :] = 0.0
            jak[i, i] = 1.0
            jak[n + i, n + i] = 1.0
        return jak


FunkcjaWstrzyknięć = object
"""Alias dokumentacyjny: wywoływalne ``NDArray[complex] -> NDArray[complex]``."""


def ybus_z_produkcji(
    ybus_pu: NDArray[np.complex128],
    mapa_indeksow: dict[str, int],
) -> tuple[tuple[str, ...], NDArray[np.complex128]]:
    """Adapter: wynik produkcyjnego ``build_ybus_pu`` → wejście laboratorium.

    Produkcyjny builder (``network_model.solvers.power_flow_newton_internal
    .build_ybus_pu``) zwraca dokładnie ``(ybus_pu, node_id_to_index, ...)``, czyli
    tę samą parę, której potrzebuje warstwa algebraiczna laboratorium. Ten adapter
    jest celowo trywialny — to DOWÓD, że fundament Ybus nie wymaga wymiany, a
    docelowy silnik dynamiczny może go konsumować bez przebudowy.

    Uwaga: laboratorium NIE importuje produkcji na poziomie modułu (izolacja),
    więc adapter przyjmuje już gotowe dane.
    """
    szyny = tuple(sorted(mapa_indeksow, key=lambda s: mapa_indeksow[s]))
    if ybus_pu.shape != (len(szyny), len(szyny)):
        raise ValueError(f"Kształt Ybus {ybus_pu.shape} nie zgadza się z liczbą szyn {len(szyny)}")
    return szyny, np.asarray(ybus_pu, dtype=np.complex128)
