# Przegląd adwersaryjny planu PROGRAM A/B (dynamika + jakość energii) — Opus 5.5

**Przedmiot:** `docs/plan/PROGRAM_AB_DYNAMIKA_I_JAKOSC_ENERGII_2026-09.md` (545 linii, przeczytany w całości).
**Tryb:** tylko odczyt, bez żadnej edycji repo. Wszystkie odwołania `plik:linia` sprawdziłem na drzewie roboczym tej sesji.
**Ograniczenie uczciwości:** eksperymentów F1–F9 ani E-1…E-3 z audytów NIE uruchamiałem ponownie. Tam, gdzie się na
nie powołuję, opieram się na dokumentach evidence. Każdy zarzut niżej jest sformułowany tak, żeby dało się go
sfalsyfikować grepem albo odczytem wskazanej linii.

Oznaczenia wagi: **[K]** krytyczny (fałszywy werdykt albo niewykonalna ścieżka), **[W]** wysoki (luka zakresu
albo sprzeczność grafu), **[S]** średni (niespójność dokumentu, ryzyko dwóch prawd).

---

## 1. Brakujące zdolności symulacji RMS dla modułów typu A i B (nN + SN)

### 1.1 [K] nN nie ma w rejestrze D- ani jednego wiersza; plan po cichu zakłada SN, symetrię i trzy fazy
- **Co jest źle:** tytuł (l. 1) i mandat (l. 9) mówią „nN + SN”, ale w §5.1 (l. 155–185), w §7 i w §9.1 nie ma
  żadnego wymagania ani kamienia dotyczącego fizyki specyficznej dla nN. Nie ma w nich: modułów jednofazowych,
  asymetrii obciążenia faz, przewodu neutralnego, wysokiego R/X (w nN napięcie zależy głównie od P, a nie od Q),
  funkcji P(U) wymaganej przez PN-EN 50549-1 ani zabezpieczenia nadnapięciowego liczonego ze średniej 10-minutowej.
- **Dowody w repo:**
  - `enm/models.py:500-508`: `Load.phases` istnieje (odbiór jednofazowy A/B/C, międzyfazowy), a komentarz mówi
    wprost, że czyta je WYŁĄCZNIE assembler rozpływu niesymetrycznego.
  - `enm/adapter_dynamiki.py`: grep `phases|faz` nie daje ani jednego trafienia dotyczącego odbioru. **Odbiór
    jednofazowy trafia więc do biegu `dynamika_rms` jako symetryczny odbiór trójfazowy, bez odmowy.** To jest cicha
    fabrykacja modelu, a plan jej nie wymienia.
  - `Generator` (`enm/models.py:567-640`) nie ma pola faz przyłączenia, więc falownika jednofazowego (typowy
    mikroinstalacyjny moduł typu A w nN) nie da się nawet wyrazić w ENM.
- **Brakuje także agregatu wielu modułów typu A:** setki mikroinstalacji za jednym transformatorem SN/nN z częściowym
  odłączaniem przez zabezpieczenie interfejsowe. To wzorzec przemysłowy, tak działa model zastępczy DER_A (WECC).
  Plan nie ma odpowiednika, a ENM ma już `quantity`/`n_parallel`.
- **Poprawka minimalna:**
  - Dodać wiersz **D-36 „nN w biegu RMS”**, w kamieniu AB-2R karta pierwsza:
    1. odmowa nazwana `dynamika.odbior_niesymetryczny_nieobslugiwany`, gdy `Load.phases ∉ {None, ABC}`. Wzorzec
       już istnieje: `KOD_ODBIOR_ZIP`, `adapter_dynamiki.py:161, 308-320`;
    2. jawna deklaracja domeny ważności: bieg RMS = składowa zgodna, sieć symetryczna;
    3. nN za transformatorem SN/nN w tym samym biegu dopuszczone tylko przy symetrii.
  - Dodać wiersz **D-37 „funkcje nN wg PN-EN 50549-1”** (P(U), 59 ze średniej 10-min — ta druga to horyzont
    QSTS, więc W6-6) i zmapować go na AB-3R oraz W6-6.
  - Dodać wiersz **D-38 „agregat modułów typu A”**, kamień AB-5R, razem z B-5.
  - Moduł jednofazowy i asymetria → po W5, z jawną odmową do tego czasu. Dziś kod po cichu symetryzuje.

### 1.2 [K] Wymagania dynamiczne typu A z 2016/631 art. 13 są nieobecne, więc „dynamika typu A = LFSM-O”
- **Czego brakuje w §5.1:**
  - wytrzymałość na zakresy częstotliwości z czasem pracy (art. 13 ust. 1 lit. a);
  - wytrzymałość na ROCOF (art. 13 ust. 1 lit. b) — kryterium „nie odłącza się przy ROCOF ≤ X”, które jest czymś
    innym niż zabezpieczenie LoM 81R;
  - dopuszczalna redukcja P przy spadku częstotliwości (art. 13 ust. 4);
  - interfejs logiczny do zaprzestania P w ≤ 5 s (art. 13 ust. 6);
  - warunki automatycznego przyłączenia: zakres f/U, zwłoka, gradient P (art. 13 ust. 7).
- **Co mamy dziś:** B-9 (ponowne przyłączenie z rampą P, AB-5R) pokrywa tylko fizykę art. 13 ust. 7, bez kryterium.
- **Co z tego wynika:** dla modułu typu A jedyną zdolnością dynamiczną w planie jest D-14. Zdanie kontrolne
  „dynamika = FRT + LFSM-O” dla typu A **pasuje** (patrz §8).
- **Poprawka:** wiersz **D-39 „wymagania dynamiczne typu A”** z pięcioma kryteriami rozdzielonymi, na wzór D-11:
  - kamień AB-3R: redukcja P przy spadku f, wytrzymałość na zakres f i ROCOF;
  - kamień AB-5R: interfejs logiczny i przyłączenie automatyczne.
  - Wartości progów wyłącznie z profilu (AB-1b), fail-closed.

### 1.3 [W] LFSM-U (i odpowiedź magazynu na podczęstotliwość) pominięte
- **Mandat:** wprost wymaga LFSM-U dla BESS.
- **Plan:** D-14 (l. 164) mówi tylko o LFSM-O. D-16 (l. 166) ma „LFSM-O jeśli dotyczy”. AB-3R (l. 301) ma
  „asymetria O/U” wyłącznie jako cechę statyzmu.
- **Solver FROZEN już zna LFSM-U jako T02:** `ncrfg_ptpiree/engine.py:53-57`. Rejestr dowodowy wymienia go w
  `provenance.py:238-245` („LFSM-O/LFSM-U/FSM/odbudowa”).
- **Magazyn:** pracuje w dwóch kierunkach — przy ładowaniu zmniejsza pobór, przy rozładowaniu zwiększa oddawanie.
  To inna fizyka nasycenia niż u PV, bo zależy od SOC i od okna P ujemnego.
- **Poprawka:** D-14 → „LFSM-O i LFSM-U (U dla magazynu i dla modułów, którym profil to nakłada)”. Do tego kryteria
  kierunku dla magazynu w trybie ładowania i rozładowania. Kamień AB-3R dla fizyki statyzmu, AB-4R dla okna SOC.
  E2E-R4 rozszerzyć o skok f w dół.

### 1.4 [W] Moduł synchroniczny typu B (SyPGM: biogaz, kogeneracja SN) wypada z FRT
- **Plan:** D-11 (l. 161) brzmi „FRT dla **PPM-B**”. Nigdzie nie ma FRT modułu synchronicznego typu B.
- **Co RfG wymaga dla SyPGM-B:** osobnej obwiedni (art. 14 ust. 3), odbudowy mocy po zwarciu (art. 17 ust. 3) i
  regulacji napięcia generatora.
- **Plan sam stwierdza, że SyPGM ma wejść do biegu:** §6.5, `model_bridge.py:266-267`. Tyle że wtedy nie ma
  czego ocenić.
- **Wymagana fizyka:** maszyna 6. rzędu z AVR (C1). Tymczasem C1 nie jest domykany przez żaden kamień (patrz §7.6).
- **Poprawka:** D-11 → „FRT dla PPM-B i SyPGM-B, osobne obwiednie z profilu”. SyPGM-B w AB-5R, bo tam jest wyrocznia
  maszyny 6. rzędu i kryterium Φ. „Domyka” AB-5R rozszerzyć o C1.

### 1.5 [W] HVRT nie ma jako zdarzenia i kryterium symulowanego
- **Co jest:** wiersz zamrożenia E2 obejmuje LVRT/HVRT, a profil PSE różni się od innych właśnie punktem HVRT
  (`pse.yaml:64`, cytowane w §6.1).
- **Czego brakuje:** D-10 i D-11 opisują wyłącznie zapad. Nie ma żadnego zdarzenia, które generuje wzrost napięcia:
  odrzutu obciążenia, wyłączenia dużego odbioru na końcu kabla, załączenia baterii kondensatorów, zniknięcia zwarcia
  przy dużym Iq.
- **Poprawka:** D-11 → „FRT (LVRT i HVRT)”. Do D-18/D-19 dopisać zdarzenia nadnapięciowe. Kryterium HVRT w AB-2R
  wobec tej samej jednej obwiedni (OD-33).

### 1.6 [W] Model „composite” odbioru nie ma kamienia
- **Plan:** D-31 (l. 181) wymienia composite, ale kolumna kamienia brzmi „AB-2 (constant/ZIP/f-sensitive), AB-5
  (silnik)”. Odbiór złożony (ZIP + udział silnika, wzorzec CLOD/WECC) nie jest przypisany nigdzie.
- **Poprawka:** „AB-5R (silnik indukcyjny i odbiór złożony ZIP+silnik z udziałami z danych, bez domyślek)”.

### 1.7 [W] Dziewięć rodzajów zmian topologii: TRANSFORMER_CLOSE i RECLOSE bez granicy domeny
- **Stan:** D-19 (l. 169) w całości trafia do AB-2R.
- **TRANSFORMER_CLOSE:**
  - załączenie od strony beznapięciowej wymaga B-1 (odcinek beznapięciowy);
  - fizycznie niesie prąd magnesujący załączania, którego RMS nie reprezentuje;
  - §8 REJECT #11 odsyła udar do W6-8, a W6-8 nie jest zmapowane w planie (§7.8);
  - brak zdania „prąd załączania transformatora poza domeną RMS → `OUTSIDE_DOMAIN` w wyniku zdarzenia”.
- **RECLOSE:**
  - jako zdarzenie zaplanowane jest w AB-2R;
  - jako działanie SPZ jest w AB-5R;
  - plan nie mówi, że RECLOSE w AB-2R jest wyłącznie harmonogramem i nie dowodzi automatyki.
- **Poprawka:** do D-19 dopisać tabelę 9 rodzajów z kolumnami: kamień fizyki, kamień wyzwalacza warunkowego, granica
  domeny.

### 1.8 [W] Zwarcia doziemne w SN i kierunkowe zabezpieczenia ziemnozwarciowe w SO-1B
- **Kontekst:** najczęstsze zwarcie w sieci SN z punktem neutralnym izolowanym lub kompensowanym to zwarcie
  doziemne.
- **Plan:** SO-1B (D-21, AB-5R) nie mówi, jakiego rodzaju zwarcia dotyczy. Fazor prądu gałęzi (l. 349) pojawia się
  „dla 67/67N”, ale 67N wymaga składowej zerowej, a tej bieg RMS składowej zgodnej nie ma (W6-K po W5).
- **Poprawka:** D-21 → „SO-1B dla zwarć trójfazowych; zwarcia doziemne i 67N po W6-K”. Graf: W6-K → rozszerzenie
  SO-1B, jawnie.

### 1.9 [S] GFM z bezwładnością wirtualną (VSM)
- **Plan:** D-33 wymaga „virtual inertia/VSM gdzie model istnieje”, a AB-3R (l. 301) wymienia tylko tryb `droop`.
- **Repo:** tryb `vsm` istnieje (evidence dynamiki M-23, `przeksztaltnik_gfm.py`), więc „gdzie model istnieje”
  jest spełnione. Mimo to kanał, wyrocznia i kryterium dla `vsm` nie mają kamienia.
- **Poprawka:** AB-3R dopisać „tryb `vsm`: kanał `f_wirnika_hz@`, wyrocznia odpowiedzi bezwładnościowej
  2H·df/dt = ΔP”.

### 1.10 Co jest pokryte (bez zarzutu co do obecności)
Pokryte są:
- łańcuch zwarcie–usunięcie z predykatem izolacji (D-10, AB-2R);
- szybki prąd zakłóceniowy (D-12) i odbudowa P (D-13);
- regulatory P/Q/U (D-15, bez P(U) — patrz §1.1) i BESS (D-16);
- utrata źródła (D-17), skoki (D-18), SO-1A z zastrzeżeniem T-3, SO-1B;
- stan przekaźnika IEC 60255 (D-22) i automatyka (D-23);
- wyspa z predykatem formującym (D-24), rekonekcja (D-25), stabilność kątowa (D-26);
- małe zaburzenia na istniejącym `malosygnalowa.py` (D-27), CCT (D-28);
- trzy częstotliwości (D-29) i ROCOF chwilowy oraz pomiarowy (D-30);
- worst-case (D-34) i porównanie (D-35).

Zarzuty dotyczące kolejności tych pozycji są w §7.

---

## 2. Harmoniczne end-to-end — brakujące ogniwa

| Ogniwo | Stan w planie | Brakujące ogniwo (zarzut) |
|---|---|---|
| Elementy ENM | AB-2H (l. 300): dławik, dławik odstrajający, filtr, tło | **[W]** Wiersz AB-2H pomija trzy modele, które §9.6 (l. 419-424) sam nazywa GAP. (1) odbiór w dziedzinie f (ADAPT #38, R‖L / CIGRE C-type) — bez niego Y(f) nie ma tłumienia odbiorów i piki rezonansowe są zawyżone; (2) impedancja sieci nadrzędnej Z_Q(f) z `Source` (S_k'', `rx_ratio`) — plan odrzuca 0,15/0,99 (#12), ale nie mówi, co je zastępuje; (3) maszyny synchroniczne X''(f) — w §9.6 GAP bez kamienia. Nowy element ENM wymaga też reguł `NetworkValidator`, symbolu SLD, kreatora, typu katalogowego i obsługi w archiwum projektu ZIP (CLAUDE.md „Adding a New Element Type”). Plan wymienia tylko „nakładkę SLD po `element_ref`”. |
| Sekcje katalogu ze statusem | AB-1a (statusy), AB-2H (sekcje) | **[W]** W katalogu jest 0 widm (l. 120). Żadna decyzja właściciela nie dotyczy **danych producentów**: widm, R(f) kabli, pojemności TR. OD-39 dotyczy tylko pomiarów do AB-7. W efekcie każdy realny projekt dostaje `MODEL_MISSING`, a E2E-H1…H6 biegną wyłącznie na danych syntetycznych. Plan tego nie mówi. |
| Wejście assemblera | `zloz_wejscie_harmoniczne` | bez zarzutu co do kierunku |
| Solver Y(f) | AB-2H | **[W]** Rozdział na sekwencje h≡1/2/0 mod 3 jest poprawny tylko dla źródeł symetrycznych. Harmoniczne potrójne (3., 9.) z falowników jednofazowych w nN czteroprzewodowej płyną w przewodzie neutralnym i są zatrzymywane przez Dyn. Wtedy sekwencyjna Y(f) daje błędny wynik po stronie nN. Plan wiąże W5 wyłącznie z S-59 (supraharmoniczne), nie z H. Brakuje zdania: „H w nN ze źródłami jednofazowymi = `OUTSIDE_DOMAIN` do W5”. |
| Kontrakt wyniku | `resultset_harmonic_v1`, `resultset_frequency_scan_v1` z `physics_domain` | **[S]** Pole `physics_domain` w ładunku to druga prawda obok zasady „`PhysicsDomain` wyprowadzany z `analysis_type`” (§6.10, AB-1a). Szerzej w §5. |
| Rejestr biegów | AB-1d_min | **[W]** Brak zasady świeżości: bieg H zależy od `run_id` PF (albo migawki RMS), a plan nie mówi, że unieważnienie PF unieważnia bieg H i że odcisk wejścia H zawiera odcisk PF. |
| Ekran UI | `ui2/wyniki/harmoniczne`, `skan`, sekcja w `jakosc` | bez zarzutu co do obecności |
| Nakładka SLD | AB-2H „po `element_ref`” | bez zarzutu co do obecności. Symbol nowych elementów — patrz wiersz ENM. |
| Łańcuch zgodności | AB-1c | **[W]** (1) T20 w AB-1c ma „czytać `WynikInzynierski` z AB-2H” (§6.2, l. 274). To odtwarza błąd kategorii, który plan sam nazywa: THD_U sieci nie jest emisją modułu (szczegóły w §6.3). (2) Nie ma kamienia dla **przydziału emisji** instalacji wg IEC TR 61000-3-6/-3-14 (poziomy planowania, S_t, α). Bez tego, nawet po OD-38, nie da się utworzyć werdyktu emisyjnego dla instalacji — §12.3 wymienia tę klasę dokumentów, ale żaden kamień jej nie liczy. |
| Wyrocznia | W-A1…W-A5, W-M1, W-M2 | bez zarzutu |
| Mutacje | H-M1…H-M9 „w manifeście” | **[S]** Harness mutacji mutuje zamkniętą listę plików rdzenia dynamiki (`tests/walidacja_fizyczna/mutacje.py:57`, „Zamkniety zestaw mutacji rdzenia dynamiki”), a job CI nazywa się `mutacje-dynamiki` (`.github/workflows/python-tests.yml:345`). Plan nie mówi, że lista mutowanych plików rozszerza się o `solvers/harmoniczne/**` ani który job ją uruchamia. |
| CI | ogólnie „manifest `walidacja_fizyczna`” | **[S]** Jak wyżej. Dodatkowo guard AST wyroczni W-M1 nie jest wymieniony w żadnym workflow. |
| Pakiet dowodowy / raport / eksport | brak | **[W]** Proof Engine (pakiet dowodowy), PDF/DOCX i eksport projektu nie pojawiają się dla H. Stary ekran ma kartę raportową, nowy tor nie ma. Ślad White Box W-75/W-76 bez konsumenta dowodowego to klasa BEZ-KONSUMENTA wg R-05. |
| Wycofanie starej powierzchni | AB-1d_min: `POWER_QUALITY_HARMONICS` | **[K]** Endpoint `api/v126_academic.py:418-423` (`"harmonic-limits"`: 8/5/5 %, indywidualne) jest żywy i wołany przez front (`ui2/wyniki/akademickie/__tests__/EkranAnalizAkademickich.test.tsx:638`). Plan klasyfikuje #17 jako REJECT, ale żaden kamień nie usuwa endpointu ani jego konsumenta. `HelpPanel.tsx:48` (61000-2-4 dla sieci publicznej, §12.3) też nie ma kamienia usunięcia. |

---

## 3. Supraharmoniczne end-to-end — brakujące ogniwa i zastrzeżenia S-67

| Ogniwo | Zarzut |
|---|---|
| `SupraharmonicBand` (AB-1d_min) | **[W]** Kontrakt bez konsumenta od AB-1d_min do AB-4H to klasa BEZ-KONSUMENTA (R-05, l. 69). Rodzaj biegu `supraharmoniczne` zarejestrowany w AB-1d_min ma odmawiać „do czasu **AB-2H**” (l. 297), a fizyka powstaje w **AB-4H**. Jeśli po AB-2H ogólny solver Y(f) zacznie obsługiwać ten rodzaj, powstanie wynik 2–150 kHz na modelach 50 Hz. Odmowa musi trwać do AB-4H. |
| Modele emisji E(f,P,Q,U,SOC,mode) (AB-4H) | **[K]** Model „prądowe źródło widma” jest w paśmie supraharmonicznym fizycznie niewystarczający. Emisja przekształtnika w kHz zależy od jego impedancji wyjściowej (filtr LCL) i od impedancji otoczenia. Dominuje zjawisko „emisji wtórnej”: kondensatory filtrów EMI sąsiednich urządzeń nN pochłaniają i rozprowadzają prąd. Plan w AB-4H nie wymaga Norton E(f) ‖ Z_conv(f) jako minimum ani modelu impedancji odbiorów w kHz. Bez tego E2E-SH3 („sieć słaba/silna”) nie pokaże mechanizmu, który ma badać. |
| Katalog | **[W]** Żadna decyzja właściciela nie dotyczy danych w.cz. producentów: E(f), Z_conv(f), pojemności uzwojeń TR. Patrz też §2. |
| Propagacja do 150 kHz z domeną ważności | **[W]** AB-2H daje `LINIA_DLUGA` i `domena_waznosci_hz`. Brak zdania, kto dostarcza modele TR w kHz: pojemności międzyuzwojeniowe, transfer SN↔nN. W-73 (l. 241) każe podać wartość „na szynie SN” emisji PCS. Transfer supraharmonicznych przez transformator SN/nN jest silnie tłumiony i zależy wyłącznie od pojemności, których katalog nie ma. Bez modelu wynik na szynie SN musi być `OUTSIDE_DOMAIN`, a przykład W-73 sugeruje, że będzie liczbą. |
| Transfer H_i←j (AB-4H) | bez zarzutu co do obecności |
| Sprzężenie faz po W5 (AB-5H) | bez zarzutu co do krawędzi W5 → AB-5H. Brak jednak zdania, że **przed** W5 nN ze źródłami jednofazowymi jest `OUTSIDE_DOMAIN` (jak w §2). |
| Import pomiaru z metadanymi (AB-7) | **[S]** S-61 ma RBW i okno, ale nie ma **rodzaju detektora**. CISPR 16 używa quasi-szczytu i wartości średniej, IEC 61000-4-7 zał. B używa pasm 200 Hz RMS. Bez tej informacji metryka S-63 porównuje wielkości nieporównywalne. |
| Metryki walidacji (AB-7) | bez zarzutu co do listy |
| Wyniki | **[W]** Nie ma kontraktu `resultset_supraharmonic_v1`. AB-2H definiuje tylko kontrakt harmoniczny i skanu. Metryki pasmowe (energia pasma, pik) nie są U_h. |
| UI | **[W]** AB-4H (l. 304) nie wymienia ekranu. W-85 mówi „każdy kamień”, ale wiersz AB-4H nie ma ścieżki `ui2/wyniki/...` ani e2e Playwright. |

**S-67 — zastrzeżenia, których brakuje (plan l. 227 ma tylko „brak EMT ≠ brak analizy”):**
1. **Liniowość i niezmienność w czasie.** Pomija się sprzężenie częstotliwościowe (wstęgi boczne f_sw ± k·f_1,
   modulacja, harmoniczne przenoszone przez przekształtnik — w modelach LTP). Trzeba to zadeklarować w każdym
   wyniku jako założenie domeny.
2. **Faza.** Emisja w paśmie 2–150 kHz jest zwykle szerokopasmowa albo z rozpraszaniem widma (losowe PWM), a pomiar
   daje moduł w paśmie bez fazy. Suma fazorowa (S-57, `MetodaAgregacji.FAZOROWA`) jest wtedy niedozwolona. Właściwa
   jest suma mocy w paśmie (niekoherentna). Plan nie zakazuje sumy fazorowej dla danych bez fazy w paśmie
   supraharmonicznym.
3. **Częstotliwość łączeń zależna od punktu pracy.** Zmienia się między innymi w ograniczeniu prądu. Migawka RMS
   (S-65) jej nie zna, więc wybór widma musi mieć „tryb modulacji” jako osobną współrzędną albo `OUTSIDE_DOMAIN`.
4. **Porównanie z limitem lub pomiarem** wymaga tej samej definicji grupowania i detektora (patrz wiersz AB-7).

**Poprawka:** do S-67 dopisać cztery zastrzeżenia jako obowiązkowe pola `domain_of_validity` wyniku supraharmonicznego
oraz mutację „suma fazorowa zamiast mocowej dla widma bez fazy” (W-82).

---

## 4. Multi-physics — wykonalność na grafie §7

### 4.1 [W] Brak krawędzi AB-3H → AB-4H (odwrócona zależność)
- **Co jest:** S-56 i S-65 są przypisane do „AB-3H / AB-4H” (l. 216, 225), a E2E-MP2 (AB-4H, l. 480) wymaga
  „snapshotów S-65”. Graf (l. 311-313) ma jednak tylko `AB-2H → AB-4H` i `AB-4R → AB-4H`.
- **Skutek:** AB-4H może się zakończyć przed AB-3H, bez funkcji migawki. AB-5H (E2E-MP3) też nie ma ścieżki do
  AB-3H.
- **Poprawka:** dopisać `AB-3H → AB-4H`. Wtedy AB-5H ma AB-3H przechodnio.

### 4.2 [W] AB-3H obiecuje SOC_k i tryb_k, które dostarcza dopiero AB-4R
- **Co jest:** §9.4 (l. 398) wymaga, żeby migawka zawierała `SOC_k, tryb_k`. Jawny stan trybu
  „charge/discharge/idle” dostarcza AB-4R (l. 303). AB-3H zależy od AB-2H i AB-3R, a nie od AB-4R.
- **Poprawka (jedna z dwóch):**
  - (a) AB-3H zależy od AB-4R;
  - (b) kontrakt migawki w AB-3H nie zawiera SOC i trybu magazynu, a AB-4H go rozszerza addytywnie.
- Rekomenduję (b), bo nie blokuje toru H na torze R.

### 4.3 [W] Kanał ogranicznika jest w AB-2R, kanału „trybu FRT” brak, a stan quasi-ustalony nie ma operacyjnej definicji
- **Kanał ogranicznika:** jest jawnie w AB-2R (l. 299: „kanały aktywności ogranicznika tempa, ogranicznika prądu i
  okna mocy”) — ta część jest spójna.
- **„Kanał trybu FRT”** z §9.4 (l. 399) **nie ma w wierszu AB-2R**. Dodatkowo rdzeń celowo NIE ma dyskretnego trybu
  FRT. Aktywacja wsparcia jest funkcją ciągłą (`przeksztaltnik_gfl.py:210-238`: „Funkcja jest CIAGLA … wejscie w tryb
  wsparcia i wyjscie z niego nie daja skoku”). „Tryb” musi więc być zdefiniowany jako predykat pochodny
  (np. `|U| < prog_frt_pu`), a nie jako stan.
- **„|dx/dt| < ε” (l. 398)** nie ma:
  - listy stanów, które wchodzą do normy;
  - skalowania (pu, Hz, SOC mają różne jednostki);
  - wartości ε ani jej źródła;
  - minimalnej długości okna;
  - zachowania, gdy żaden punkt nie spełnia warunku.
- **Sprzeczność z samym audytem:** audyt harmonicznych (evidence l. 173) proponuje t* „w szczycie wsparcia Q”,
  czyli w trakcie zakłócenia. Tam stan NIE jest quasi-ustalony.
- **Poprawka:** AB-3H: „reguła t*:
  - norma ważona ‖D⁻¹ dx/dt‖∞ < ε po stanach różniczkowych urządzeń i sieci, gdzie D = skale stanów z kontraktu;
  - ε i okno T_min są parametrami biegu, bez domyślnych;
  - brak okna spełniającego warunek → migawka `OUTSIDE_DOMAIN` z podaniem max ‖·‖;
  - »tryb FRT« = predykat pochodny z progu urządzenia”.

### 4.4 [W] E2E-MP1 jest sprzeczny z regułą quasi-statyczności
- **Co jest:** E2E-MP1 (l. 479): „stan podczas FRT → snapshot harmoniczny”. Podczas zapadu (typowo 150–500 ms) nie
  ma stanu quasi-ustalonego w skali okna analizy harmonicznej (IEC 61000-4-7: 10 okresów = 200 ms).
- **Poprawka (jedna z dwóch):**
  - E2E-MP1 → „stan po odbudowie”;
  - jawny wynik `OUTSIDE_DOMAIN` dla migawki w trakcie zapadu, z kryterium z §4.3 jako wyrocznią negatywną.

### 4.5 [S] Topologia w chwili t* ze zdarzeń warunkowych
- **Co jest:** funkcja „ENM + zdarzenia do t* → migawka” (AB-3H) powstaje przed klasą zdarzeń warunkowych (AB-4R) i
  przed zabezpieczeniami (AB-5R). E2E-MP3 (AB-5H) „zmiana topologii → RMS”. Jeśli zmiana wynika z zadziałania
  zabezpieczenia, AB-5H potrzebuje AB-5R, a takiej krawędzi nie ma.
- **Poprawka:** E2E-MP3 zawęzić do zmiany zaplanowanej albo dopisać `AB-5R → AB-5H` dla wariantu z zabezpieczeniem.
  Migawka musi odtwarzać `ZdarzenieWykonane` (także warunkowe), a nie harmonogram scenariusza.

### 4.6 [S] Dwa źródła U_1 dla biegu H
- **Co jest:** raz z `run_id` PF (AB-2H), raz z migawki RMS (AB-3H). Kontrakt wejścia H musi mieć
  `zrodlo_punktu_pracy: PF{run_id} | RMS{run_id, t*}` jako jedną unię, a nie dwa opcjonalne pola.
- **Poprawka:** tak zapisać w AB-2H, żeby AB-3H nie dokładał drugiego pola.

---

## 5. Dwa źródła prawdy — pozostałości po edycjach orkiestratora

| # | Waga | Pozostałość | Gdzie | Poprawka |
|---|---|---|---|---|
| 5.1 | [W] | **`POWER_QUALITY_HARMONICS` — trzy różne rozstrzygnięcia.** (a) §6.10 (l. 282): przeklasyfikować `reportable=False`, tier `UNVALIDATED_MODEL`, `superseded_by="harmoniczne"`. (b) AB-1d_min (l. 297): „`implemented` → nazwana odmowa”. (c) evidence §9: wycofanie „po AB-2H wzorcem W3-E (410 + zamiennik)”. `SolverCapability` (`solver_capability_registry.py:35-52`) **nie ma pól `tier` ani `superseded_by`**, a `implementation_status` jest `Literal["implemented"]`. Wariant (a) dopisuje więc do drugiego rejestru oś z `provenance.py`, a to jest druga prawda. Numery linii też się rozjeżdżają (218-230 w §6.10, 219-231 w AB-1d_min; stan faktyczny: 219-231). | §6.10 vs §7 AB-1d_min | Jeden mechanizm: istniejące `availability="withdrawn"` (precedens W3-E, `solver_capability_registry.py:38-44`) z odpowiedzią 410 i wskazaniem następcy. Usunąć z §6.10 „tier” i „superseded_by”. Numer linii 219-231. |
| 5.2 | [W] | **Dwa rejestry zdolności i niewskazany „jeden rejestr”.** AB-1a wyprowadza `PhysicsDomain` „przez jeden rejestr zdolności”. W repo są dwa. (1) `application/solvers/solver_capability_registry.py`: **każdy** wpis `reportable=True`, w tym `DYNAMIC_STABILITY` (l. 206-215) i `SSCI_IMPEDANCE` (l. 232-241); **`dynamika_rms` w nim nie ma**. (2) `solver_input/provenance.py::_DYNAMIC_CAPABILITY_EVIDENCE`, gdzie `dynamic_stability.fault_clear` = `UNVALIDATED_MODEL`. Te dwa rejestry już dziś sobie przeczą. | §6.10, AB-1a | Nazwać JEDEN rejestr (rekomendacja: `solver_capability_registry` jako rejestr rodzajów/domen, `provenance` jako jedyne źródło stopnia dowodowego). `reportable` wyprowadzać z `provenance`, zakazać zapisu. Dopisać `dynamika_rms`. Test parowy: `reportable ⇔ regulatory_evidence_eligible`. |
| 5.3 | [W] | **Listy rodzajów biegów.** §6.10: „Trzy listy typów biegów → wskazać jedną”. AB-1d_min każe natomiast dopisać nowe rodzaje w pięciu miejscach: `ExecutionAnalysisType`, `v125_contracts` (sam ma trzy słowniki: `api/v125_contracts.py:330, 344, 352`), `canonical_analysis`, gotowość, `solver_capability_registry`. Kamień powiela więc duplikację, którą §6.10 każe usunąć. | §6.10 vs AB-1d_min | AB-1d_min: najpierw jedna lista (źródło), pozostałe wyprowadzane, z testem parytetu. Dopiero potem dopisać trzy rodzaje w jednym miejscu. |
| 5.4 | [S] | **`bodziec_zgodnosci` vs `BadanieZgodnosci`.** AB-3R (l. 301): „fizyczna realizacja `bodziec_zgodnosci` (§6.9, B-4)”. §6.9 definiuje kontrakt `BadanieZgodnosci{…, bodziec: …}` i zakazuje rodzaju zdarzenia. Nazwa `bodziec_zgodnosci` wygląda na rodzaj zdarzenia z wersji sprzed korekty. | AB-3R | → „fizyczna realizacja pola `BadanieZgodnosci.bodziec` (§6.9)”. |
| 5.5 | — | `Generator.modul_wytworczy` vs `rodzaj_modulu_nc_rfg`: **w planie czysto.** `modul_wytworczy` występuje tylko w evidence regulacyjnym jako odrzucony (`OPUS_AUDYT_WARSTWY_REGULACYJNEJ…:374`). | — | bez zmian |
| 5.6 | [S] | **`PhysicsDomain` jako pole wyniku.** §6.10 i AB-1a: wyprowadzany z `analysis_type`, „nie pole kontraktu FROZEN; addytywnie w kopercie API”. AB-2H: `wynik.py` → `resultset_harmonic_v1` „z `physics_domain`” w ładunku. Nowy kontrakt nie jest FROZEN, ale to druga, zapisana kopia faktu wyprowadzalnego. | AB-2H vs AB-1a | Albo pole w ładunku z testem parowym „pole = wyprowadzenie z rejestru”, albo wyłącznie koperta. Jedna reguła dla wszystkich nowych kontraktów. |
| 5.7 | [W] | **Stosowalność testu (Applicability) — trzy źródła.** (1) FROZEN `default_for_modules` i `_is_required` (`ncrfg_ptpiree/engine.py:44-168, 315-345`). (2) YAML `module_types` (1/50 MW). (3) Planowany resolver WOS `wymagania[].module_types` i `rodzaj_modulu` (§6.1). AB-1c ma „Applicability” w łańcuchu, ale plan nie mówi, że **zastępuje** `required` z FROZEN. Wynik FROZEN dalej liczy `overall_status` z własnego `required`. | §6.1, AB-1c | AB-1c: „Applicability wyłącznie z resolvera WOS; `required`/`overall_status` z FROZEN nie są czytane przez żadnego konsumenta poza adapterem” + guard importu. |
| 5.8 | [S] | **Zbiór metod akceptowanych — dwa miejsca.** §6.2: `AcceptedEvidenceMethod` **per test** w resolverze PTPiREE. §6.6: zbiór **per wymaganie** z profilu (WOS/WiPWC). | §6.2 vs §6.6 | Jedno miejsce: per wymaganie w profilu. Resolver PTPiREE tylko mapuje wymaganie na test. |
| 5.9 | [S] | **Usunięcie kontrolki „THD napięcia” modułu** jest rezultatem dwóch kamieni: AB-1d_min (l. 297) i AB-1c (l. 298). §8 REJECT mówi „#24 usuwane w AB-1d_min”. | AB-1c | Usunąć z AB-1c. |
| 5.10 | [W] | **Obwiednia FRT — trzy źródła.** (1) FROZEN `frt_hvrt`. (2) YAML profilu (`pse.yaml:64`). (3) Kryterium E2 w AB-2R „wobec JEDNEJ obwiedni (po OD-33)”. Plan nie mówi, **który plik** jest jedynym źródłem po OD-33 ani czy E2 to kryterium inżynierskie w rdzeniu („metryki liczone w rdzeniu”), czy kryterium regulacyjne w łańcuchu AB-1c. | AB-2R, §6.1, OD-33 | AB-2R: E2 w rdzeniu to **metryka** (U(t) wobec obwiedni podanej na wejściu). Obwiednia pochodzi wyłącznie z profilu przez AB-1b. Werdykt tylko w AB-1c. |
| 5.11 | [W] | **Krzywe IEC 60255 — ryzyko dwóch implementacji tej samej fizyki.** AB-5R buduje akumulator `∫dt/t(I)`. `t(I)` istnieje w FROZEN `protection_iec60255.py:499` `compute_curve_trip_time`. Plan nie mówi, że akumulator woła tę funkcję. | AB-5R | Dopisać: „t(I) wyłącznie z `compute_curve_trip_time` (import, zero kopii) + test parytetu dla I = const: akumulator = czas FROZEN”. |
| 5.12 | [W] | **Dwa tory stabilności.** `DYNAMIC_STABILITY` (tor progowy, `reportable=True`, zasila `ui2/wyniki/stabilnosc`) obok `dynamika_rms`. Plan nazywa go „fasadą” (l. 115), ale żaden kamień go nie wycofuje. W6-5 w syntezie (`SYNTEZA…:504`) obejmuje kasację `stability_rms`/`frt_hvrt` po OD-20, a W6-5 nie ma w planie wiersza (§7.8). | §2, §7 | Wiersz W6-5 w §7 z wycofaniem toru progowego z powierzchni (`availability="withdrawn"`) w AB-2R, razem z minimalnym konsumentem `ResultSetDynamicV1`. |
| 5.13 | [S] | **Status modelu — za dużo osi o nakładającym się znaczeniu.** Są: W-68 `{VALIDATED, UNVALIDATED, MEASURED, CERTIFIED, UNKNOWN, OUTSIDE_DOMAIN}`, `EvidenceTier`, `ClaimKind`, `ProweniencjaParametrow`, profil `validation_status: UNVERIFIED_SOURCE`, H-48 `validation_status`, kody W-99 (`OUTSIDE_DOMAIN` drugi raz), W-71 `model_status`/`input_status`. `OUTSIDE_DOMAIN` jest stanem **zapytania** (f, U poza zakresem), a nie cechą sekcji katalogu. `VALIDATED` sekcji nie mapuje się jednoznacznie na `rownania_zwalidowane` ani na `parametry_urzadzenia_zwalidowane`. | W-68, §6.8 | Usunąć `OUTSIDE_DOMAIN` z W-68 (zostaje kodem W-99 wyniku). Zdefiniować tabelę mapowania W-68 → dwie osie §6.8 (jedna tabela, test wyczerpujący). |
| 5.14 | [S] | **Synteza nie została skorygowana.** `SYNTEZA…:221-223` klasyfikuje T20 jako „konfiguracja zadeklarowana … W6-7 daje wynik obliczony z widma”. `SYNTEZA…:506` ma W6-7 „EN 50160 raport”. Obie tezy są sprzeczne z §6.2 i §9.5/§12.3 planu (EN 50160 nie jest porównywalna z jednym punktem pracy; THD_U sieci ≠ emisja modułu). §12.1 tych linii nie koryguje. | §12.1 | Dopisać dwie supersesje w §12.1. |

---

## 6. Fałszywe werdykty, które plan nadal dopuszcza

### 6.1 [K] Moduł typu A (PPM) dostaje „Projekt zgodny z wymaganiami NC RfG” bez oceny LFSM-O
- **Łańcuch w kodzie:**
  1. `engine.py:44-51`: T01 LFSM-O ma `default_for_modules=["C","D"]`.
  2. `engine.py:326-331`: dla typu A/B T01 jest wymagany wyłącznie przy `module_family == "SyPGM"`.
  3. Most wpisuje dziś `"PPM"` na sztywno (`model_bridge.py:211`, plan §0.2).
  4. Dla typu A jedynym testem wymaganym jest T12, i to tylko bez certyfikatu (`engine.py:332-337`).
  5. T12 jest w rejestrze `DECLARED_CONFIGURATION` z `DECLARATION` (`provenance.py:284-297`), więc
     `regulatory_evidence_eligible = True` (`provenance.py:199-201`).
  6. `certyfikat_zgodnosci.py:230-233, 310-325` liczy `modulow_zgodnych` z `overall_status == "zgodny"` i wystawia
     „Projekt zgodny z wymaganiami NC RfG”.
- **Wynik:** moduł typu A z samą deklaracją zaprzestania generacji dostaje „zgodny”, choć LFSM-O jest dla typu A
  obowiązkowe (art. 13 ust. 2). Nikt go nie liczy ani nie wymaga.
- **Wariant z certyfikatem:** zero testów wymaganych daje „zgodny” (pusta koniunkcja, `engine.py:246-251`).
  `zbierz_braki` przepuszcza moduł, jeśli ma zweryfikowany certyfikat. Status certyfikatu pochodzi z
  `certificate_status_z_tabliczki` BEZ reguły WiPWC, a daty „acceptance_date” są w przyszłości w 6697/6887 rekordach
  (§6.3).
- **Co plan naprawia:** tylko T10 i pustą koniunkcję (§6.6, AB-1a). Nie wymienia asymetrii T01 PPM/SyPGM ani tego, że
  `certyfikat_zgodnosci` i `wniosek_osd` (`wniosek_osd.py:168, 255`) czytają `overall_status` FROZEN.
- **Poprawka:** AB-1b (nie AB-1c, bo to dzisiejsza ścieżka użytkownika):
  - certyfikat i wniosek blokowane (`REQUIREMENT_UNVERIFIED`), gdy profil ma `validation_status = UNVERIFIED_SOURCE`
    albo `module_types` nie zostały potwierdzone (OD-41);
  - AB-1c: Applicability z resolvera, a nie z `_is_required` FROZEN (§5.7);
  - pin testowy: „PPM typu A bez oceny LFSM-O ≠ zgodny”.

### 6.2 [K] Deklaracja jako dowód zachowania (T05, T12, T13)
- **Co jest:** w `provenance.py:284-297` jako „fakty konfiguracyjne” (`DECLARED_CONFIGURATION`, eligible) figurują
  T05 „regulacja P” i T12/T13 „zaprzestanie/zmniejszenie generacji”. Zaprzestanie P w ≤ 5 s i redukcja do nastawy
  z gradientem są twierdzeniami o **zachowaniu w czasie**.
- **Plan §6.6:** metoda dostarczona ∈ metody akceptowane przez profil. To jest poprawne, ale działa dopiero w AB-1c i
  tylko dla profilu zweryfikowanego. Do tego czasu rejestr sam przesądza, że deklaracja wystarcza.
- **Poprawka:** AB-1a: `ClaimKind` T05/T12/T13 → `DYNAMIC_PERFORMANCE` do czasu, aż profil (OD-21) jawnie zaakceptuje
  `DECLARATION`/`CERTIFICATE` dla tego wymagania. Test parowy ClaimKind ↔ profil.

### 6.3 [K] T20 w AB-1c ponownie wprowadza THD_U sieci jako dowód modułu
- **Co jest:** §6.2 (l. 274) mówi, że THD_U to własność napięcia sieci, a nie emisja urządzenia, „więc T20 w AB-1c
  czyta `WynikInzynierski` z AB-2H albo zostaje `REQUIREMENT_UNVERIFIED`”. Pierwsza gałąź tej alternatywy przeczy
  przesłance. THD_U w miejscu przyłączenia zależy od tła i od innych instalacji. Wynik sieciowy użyty jako „zgodność
  modułu” to dokładnie przeniesienie kompatybilność→emisja zakazane w W-70 i §12.3.
- **Poprawka:** „T20 = `REQUIREMENT_UNVERIFIED` do OD-38. Po OD-38 wymaganie emisyjne instalacji ocenia się
  **wkładem instalacji** (U_plant z H-50/H-51, przydział wg dokumentu z OD-38), nigdy U_combined”.

### 6.4 [K] SSCI i tor progowy stabilności pozostają `reportable=True` z werdyktem
- **SSCI:** `solver_capability_registry.py:232-241` ma `reportable=True`. Plan §8 klasyfikuje #10, #21, #22 (werdykt
  Nyquista SSCI) i #49 (ekran) jako KEEP_RESEARCH_ONLY. Werdykt używa zaszytego 30° zapasu fazy (§9.5) i Z_grid
  z odrzuconego `_source_impedance` 0,15/0,99 (#12). Ekran `ui2/wyniki/ssci` istnieje. Żaden kamień nie zdejmuje
  `reportable` ani werdyktu przed AB-5H.
- **Tor progowy:** to samo dotyczy `DYNAMIC_STABILITY` (§5.12).
- **Poprawka:** AB-1d_min: SSCI → `reportable=False` z etykietą badawczą, bez tokenu werdyktu, w tym samym kroku co
  wycofanie `POWER_QUALITY_HARMONICS`. `DYNAMIC_STABILITY` → wycofanie w AB-2R.

### 6.5 [K] „CERTIFIED” parametry otwierają `VALIDATED_SIMULATION`
- **Co jest:** §6.8: `VALIDATED_SIMULATION` jest niemożliwy, gdy `parametry_urzadzenia_zwalidowane ∉ {MEASURED,
  CERTIFIED}`. Zatem CERTIFIED wystarcza. Tymczasem certyfikat z rejestru WiPWC (6887 rekordów) potwierdza badanie
  typu urządzenia. Nie waliduje parametrów modelu RMS (Tiq, k_frt, PLL, ograniczniki), bo walidacja modelu
  symulacyjnego wobec pomiaru to osobna procedura. Po AB-1b dowolny moduł z certyfikatem i dowolnymi parametrami
  katalogowymi dostałby stopień dowodowy symulacji zwalidowanej.
- **Poprawka:** rozdzielić `CERTIFIED_TYPE_TEST` (sekcja `certification`) od `MODEL_VALIDATED_AGAINST_MEASUREMENT`
  (sekcja `dynamic`/`validation`). `VALIDATED_SIMULATION` tylko przy drugim oraz przy `rownania_zwalidowane`
  z wyroczni H4 dla rodziny.

### 6.6 [W] Bezpiecznik A-6 i W6-5 — brak warunku zdjęcia
- **Co jest:** graf: `OD-20 → W6-5 (po AB-1c)`. Nic nie wiąże zdjęcia A-6 (T14/T15 `NOT_SIMULATED`) z:
  - (a) E2E-R1 z wyrocznią GFL (AB-2R);
  - (b) jedną obwiednią (OD-33);
  - (c) `stay_connected` z zabezpieczeniami własnymi modułu (B-5, AB-5R);
  - (d) walidacją parametrów modułu (§6.5).
- **Ryzyko:** po OD-20 i AB-1c A-6 zdjęte przed AB-5R. T14 byłby „pass” z trajektorii, w której decyzja urządzenia
  o odłączeniu jest `NOT_SIMULATED`.
- **Poprawka:** wiersz W6-5 w §7: „Zależy od: AB-1c, AB-2R (T14/T15/T16/T17), AB-3R (T01–T02), AB-5R (pełne
  `stay_connected`), OD-20, OD-21, OD-33; A-6 zdejmowany per test, nie globalnie”.

### 6.7 [W] E2E-R1 zapowiada 6 kryteriów, AB-2R dostarcza 5
- **Co jest:** §10 (l. 454): E2E-R1 „z 6 kryteriami D-11”. AB-2R (l. 299): „5 kryteriów trajektoriowych;
  `stay_connected` … z jawnym `NOT_SIMULATED` … pełna wersja … w AB-5”. Dowód wyjścia AB-2R obiecuje więcej niż
  kamień dostarcza.
- **Poprawka:** E2E-R1 → „5 kryteriów + `stay_connected = NOT_SIMULATED`”. Dodać E2E-R1b w AB-5R z pełnym szóstym.

### 6.8 [W] Wyrocznia GFM porównywana z wynikiem własnego kodu
- **Co jest:** AB-3R (l. 301): „rozwiązanie zamknięte; E-2 dało 50,5 Hz do porównania”. E-2 to bieg tego samego
  rdzenia. Porównanie z nim jest testem regresyjnym, a nie wyrocznią.
- **Poprawka:** usunąć „E-2 … do porównania”. Wyrocznia = wyłącznie zapis zamknięty z parametrów wejścia, liczony
  w teście bez importu z `dynamika/urzadzenia`, z guardem AST wzorem W-M1.

### 6.9 [S] Bramki zgodne z założenia
- **Co jest:** „gradient odbudowy ≤ nastawa” (AB-2R) i „|I| ≤ I_max” sprawdzają ogranicznik, który wymusza tę
  nierówność konstrukcyjnie. Bez mutacji, która ogranicznik wyłącza, obie bramki przechodzą zawsze.
- **Plan:** mutacje „limiter” są wymienione (W-80), ale nie są przypięte do tych bramek.
- **Poprawka:** każda bramka nierówności ogranicznikowej ma w manifeście przypiętą mutację, która ją łamie.

### 6.10 [S] Kryteria regulacyjne zaszyte w rdzeniu dynamiki
- **Co jest:** AB-3R „próg 50,2 Hz”, „opóźnienie wg NC RfG art. 13 ust. 2”. Metryki mogą być w rdzeniu, ale wartości
  wymagań nie (W-70). Nastawa urządzenia jest daną modelu (OD-34), a wymaganie jest daną profilu (AB-1b).
- **Poprawka:** AB-3R: „próg i zwłoka to nastawy urządzenia z modelu; wymagania do porównania wyłącznie z profilu
  przez AB-1c”.

---

## 7. Graf zależności — weryfikacja krawędź po krawędzi

**Krawędzie z §7 (l. 311-314) i ich weryfikacja:**

| Krawędź | Zgodna z wierszami? | Uwagi |
|---|---|---|
| AB-1a → AB-1b | tak | — |
| AB-1a → AB-1d_min | tak | — |
| AB-1a → AB-2R | **niepełna** | AB-2R potrzebuje też AB-1b (obwiednia E2 z profilu, §5.10) oraz OD-33 (wiersz AB-2R sam pisze „po OD-33”). Obu krawędzi brak. |
| AB-1b → AB-1c | tak | — |
| AB-1d_min → AB-1c | tak | — |
| AB-1d_min → AB-2H | tak | — |
| AB-2R → AB-3R | tak | — |
| AB-3R → AB-4R | tak | — |
| AB-4R → AB-5R | tak | — |
| AB-5R → AB-6 | tak | — |
| AB-2H → AB-3H | tak | — |
| AB-2H → AB-4H | tak | — |
| AB-2H → AB-5H | tak | — |
| AB-3R → AB-3H | tak | kanał ogranicznika z AB-2R przechodnio (§4.3) |
| AB-4R → AB-4H | tak | — |
| AB-4H → AB-5H | tak | — |
| {AB-5R, AB-5H} → AB-6 | tak | — |
| AB-6 → AB-7 | **nadmiarowa, sprzeczna z zamrożeniem** | patrz §7.4 |
| W4 → AB-5R | tak | — |
| W5 → AB-5H (S-59) | tak | — |
| W5 → W6-K | tak | — |
| OD-20 → W6-5 (po AB-1c) | **niepełna** | patrz §6.6 |
| OD-21/OD-38 → AB-1b (wartości) | tak | — |

**Znalezione naruszenia:**

### 7.1 [W] Zdarzenia warunkowe są potrzebne już w AB-2R i AB-3R, nie dopiero w AB-4R
- **Co jest dobrze:** kolejność w AB-4R jest jawna (karta pierwsza) — pytanie mandatu jest spełnione.
- **Co jest nowym naruszeniem:**
  - AB-2R dopisuje do kontraktu GFL `t_aktywacji_iq_s` i `t_podtrzymania_iq_s` (l. 299, D-12);
  - AB-3R wymaga opóźnienia LFSM-O (l. 301).
  - Opóźnienie aktywacji i czas podtrzymania to **timery wyzwalane przekroczeniem progu**. Rdzeń celowo omija
    przełączanie dyskretne (`przeksztaltnik_gfl.py:210-222`: skok sygnału „w zapadzie / poza zapadem” gubił
    rozwiązanie kroku niejawnego).
  - Timer bez klasy zdarzeń warunkowych musi być albo wykryciem „na końcu kroku” (dokładnie mutantem, który AB-4R
    zakazuje, l. 358), albo przybliżeniem ciągłym (inercją), które nie jest opóźnieniem.
- **Poprawka (do wyboru):**
  - (a) klasa zdarzeń warunkowych → AB-2R karta pierwsza (przesunąć z AB-4R);
  - (b) w AB-2R/AB-3R jawnie zapisać, że opóźnienia są modelowane członem ciągłym, z nazwaną różnicą wobec
    opóźnienia transportowego i z odmową kryterium „czas aktywacji” do AB-4R.
- Rekomenduję (a): E2E-R1 bez prawdziwego opóźnienia aktywacji Iq nie spełnia D-12.

### 7.2 [W] AB-5R nie ma krawędzi do AB-1b
- **Co jest:** `nastawy_wymagane[]`, 27/59 w `ProtectionSetting.function_type` (§6.4) i `ochrona_lom` z profilu
  powstają w AB-1b. AB-5R konsumuje je (zabezpieczenia własne, LoM, Bank Nastaw „jako wymaganie”).
- **Poprawka:** dopisać `AB-1b → AB-5R`.

### 7.3 [W] Brak krawędzi AB-3H → AB-4H
Patrz §4.1.

### 7.4 [W] AB-7 po AB-6 jest nadmiarowe i sprzeczne z zamrożeniem
- **Co jest:**
  - `FINAL_DYNAMICS_CAPABILITY_FREEZE.md:270`: W6-F „idzie **równolegle od początku**: dopóki trwa, każda nowa
    wielkość powiększa powierzchnię `UNVALIDATED_MODEL`”.
  - Plan wiąże H4 per rodzina z AB-2R…AB-5R (§9.1, l. 360), ale „Domyka H4” przypisuje wyłącznie AB-7 (l. 308).
  - Import i metryki pomiarowe (S-60…S-63) nie potrzebują AB-6.
- **Skutek:** do końca AB-6 nie ma drogi do `MEASURED`, więc żadna ścieżka nie dostaje `VALIDATED_SIMULATION`, więc
  każdy łańcuch AB-1c kończy się `REQUIREMENT_UNVERIFIED` przez sześć kamieni. Zdanie „dodamy walidację później”
  pasuje.
- **Poprawka:**
  - AB-7 rozbić na AB-7a „importer + metadane + metryki” (zależy od AB-2R i AB-2H, równolegle od AB-3) i AB-7b
    „benchmarki pomiarowe + STFT” (po AB-6);
  - H4 w kolumnie „Domyka” AB-2R/AB-3R/AB-4R/AB-5R per rodzina.

### 7.5 [W] Wyjście AB-1c jest niewykonalne w chwili zamknięcia AB-1c
- **Co jest:** dowód wyjścia AB-1c (l. 298): „test z RMS (`BadanieZgodnosci`) i z harmonicznych przechodzi tym samym
  łańcuchem”. W chwili AB-1c:
  - `BadanieZgodnosci` ma tylko odmowę `bodziec.rdzen_nieobslugiwany` (rdzeń w AB-3R);
  - bieg harmoniczny ma tylko odmowę `domena.solver_nieobecny` (solver w AB-2H).
- **Skutek:** łańcuch da się wykazać wyłącznie na odmowach. To jest tautologia wyjścia.
- **Poprawka:** wyjście AB-1c → „łańcuch na istniejącym wyniku `dynamika_rms` (SO-1A) i na odmowach nazwanych; bramka
  ponownego przejścia łańcucha jako warunek wyjścia AB-2H i AB-3R”.

### 7.6 [W] Wiersze zamrożenia bez kamienia
- **Reguła:** R-01 (l. 65) wymaga, żeby kamień wskazywał wiersze. Odwrotna kontrola (każdy otwarty wiersz ma kamień)
  nie przechodzi.
- **Wiersze bez kamienia w kolumnie „Domyka”:**
  - **A3** — D-09 mówi „AB-2”, kolumna AB-2R go nie ma;
  - **B4** — fazor prądu w AB-2R, kolumna go nie ma;
  - **C1** — maszyna 6. rzędu z AVR/GOV/PSS, wyrocznia w AB-5R, kolumna jej nie ma;
  - **C3** — GFM w AB-3R, kolumna go nie ma;
  - **E8** — wiatr: „Niezależne” wymienia A2, C5, D2, ale nie E8;
  - **H2** — częściowo;
  - **H4** — patrz §7.4.
- **Poprawka:** uzupełnić kolumny i dodać test dokumentu (guard): każdy wiersz zamrożenia o stanie ≠ wykonane
  występuje w dokładnie jednej kolumnie „Domyka”.

### 7.7 [W] W6-5, W6-6, W6-7 (poza H) i W6-8 bez kamienia wbrew R-04
- **Co deklaruje R-04 (l. 68):** W6-6 i W6-7 „są mapowane na kamienie w §7”.
- **Stan faktyczny:**
  - W6-6 (QSTS + dyspozycja BESS, `SYNTEZA…:505`) nie ma wiersza w §7. Horyzont 10-minutowy nN (§1.1) i SOC w skali
    godzin od niego zależą.
  - W6-7 poza harmonicznymi — flicker do solvera, VUF, EN 50160, profil napięcia (`SYNTEZA…:506`) — nie ma kamienia.
  - W6-5 (`SYNTEZA…:504`) występuje tylko jako krawędź.
  - W6-8 (`SYNTEZA…:507`) pojawia się tylko w §8 REJECT #11.
- **Poprawka:** cztery wiersze w §7 z „Zależy od” i „Dowód wyjścia”. Dla W6-7 poza H: kamień AB-2H (flicker, VUF na
  tej samej kopercie wyniku jakości) albo osobny wiersz z krawędzią od AB-1b.

### 7.8 [S] Sekwencja bazowa a graf
- **Co jest:** sekwencja (l. 289) AB-1a → AB-1b → AB-1d_min → AB-1c sugeruje AB-1b przed AB-1d_min. Graf pozwala na
  równoległość (brak krawędzi AB-1b → AB-1d_min).
- **Ocena:** to nie jest sprzeczność, ale warto to napisać wprost.
- **Poprawka:** dopisać do sekwencji „AB-1b ∥ AB-1d_min”.

### 7.9 Sprawdzenie korekt z przeglądu dynamiki
- AB-4R z klasą zdarzeń warunkowych w karcie pierwszej jest spójny z AB-5R („Przekaźniki na klasie zdarzeń
  warunkowych z AB-4”) i z §9.1 (l. 358-359).
- Programowalne źródło U(t)/f(t) jako karta pierwsza AB-3R przed LFSM-O jest spójne.
- **Obie poprawione wcześniej zależności są kompletne.** Nowe naruszenia to §7.1 (timery w AB-2R/AB-3R), §7.2,
  §7.3, §7.5.

---

## 8. Zdania kontrolne §11 zastosowane do planu w obecnej postaci

| Zdanie | Czy plan da się nim uczciwie streścić? | Uzasadnienie |
|---|---|---|
| „dodamy harmoniczne później” | **Nie** co do solvera: AB-2H startuje zaraz po AB-1d_min, równolegle z AB-2R. **Częściowo tak** co do dowodu i zgodności: walidacja pomiarowa dopiero w AB-7 po AB-6 (§7.4), limity zależne od OD-38, danych widm producentów nie zamawia żadna decyzja właściciela (§2). | Po poprawkach §7.4 i §2 zdanie przestaje pasować. |
| „harmoniczne = THD” | **Nie** co do obliczeń (U_h, I_h, fazy, Z_th(f), transfer, wkłady, tło). **Tak** co do jedynego punktu styku z zgodnością: T20 w AB-1c ma czytać THD_U (§6.3). Przydział emisji wg 61000-3-6 nie ma kamienia. | Poprawka §6.3 i kamień przydziału emisji. |
| „dynamika = FRT + LFSM-O” | Dla typu B i SN: **nie** (rejestr D-09…D-35). Dla **typu A** i dla **nN**: **tak** — jedyną zdolnością typu A w §5.1 jest D-14. Wymagań art. 13 (zakresy f, wytrzymałość ROCOF, redukcja P przy spadku f, interfejs logiczny, przyłączenie automatyczne), P(U) i agregatu mikroinstalacji brak (§1.1, §1.2). | Plan narusza §11 w połowie swojego tytułu („typ A … nN”). |
| „supraharmoniczne = FFT” | **Nie** (brak FFT, jest emisja zależna od punktu pracy, propagacja i transfer). Grozi jednak redukcja równoważna: „supraharmoniczne = źródło prądowe × Z(f) z sumą fazorową” (§3: brak Norton + Z_conv, brak emisji wtórnej, suma fazorowa na danych bez fazy). | Poprawka S-67 i AB-4H. |

---

## 9. Dziesięć poprawek w kolejności ważności (konkretne edycje)

1. **§6.6 i §7 AB-1b (fałszywe „zgodny” dziś)**
   - Było: „Zamyka trzy dzisiejsze błędy: T10 tautologia …, T20 …, moduł z zerem wymaganych testów”.
   - Jest: „… oraz (4) PPM typu A/B bez oceny T01 LFSM-O (`engine.py:326-331` wymaga T01 tylko dla SyPGM);
     (5) `certyfikat_zgodnosci`/`wniosek_osd` blokowane (`REQUIREMENT_UNVERIFIED`), gdy profil ma
     `UNVERIFIED_SOURCE` albo `module_types` niepotwierdzone (OD-41) — w AB-1b, bo to dzisiejsza ścieżka
     użytkownika; (6) T05/T12/T13 → `ClaimKind.DYNAMIC_PERFORMANCE` do czasu akceptacji deklaracji przez profil”.
2. **§5.1 nowe wiersze D-36…D-39 (nN i typ A)**
   - D-36: odmowa nazwana dla `Load.phases ∉ {None, ABC}` w `adapter_dynamiki.py` + deklaracja domeny symetrycznej
     (AB-2R karta 1).
   - D-37: P(U) i 59 ze średniej 10-min wg PN-EN 50549-1 (AB-3R / W6-6).
   - D-38: agregat modułów typu A z częściowym odłączaniem (AB-5R).
   - D-39: art. 13 ust. 1a/1b/4/6/7 jako pięć kryteriów rozdzielonych (AB-3R/AB-5R).
   - W5 → moduły jednofazowe (krawędź w grafie).
3. **§7 AB-1c i §6.2 (T20)**
   - Było: „T20 w AB-1c czyta `WynikInzynierski` z AB-2H albo zostaje `REQUIREMENT_UNVERIFIED`”.
   - Jest: „T20 = `REQUIREMENT_UNVERIFIED` do OD-38; po OD-38 ocenia się wkład instalacji U_plant (H-50/H-51) wobec
     przydziału emisji z dokumentu OD-38, nigdy U_combined; kamień przydziału emisji (61000-3-6/-3-14) w AB-5H”.
4. **§6.8 (CERTIFIED ≠ zwalidowany model)**
   - Było: „`VALIDATED_SIMULATION` niemożliwy, gdy `parametry_urzadzenia_zwalidowane ∉ {MEASURED, CERTIFIED}`”.
   - Jest: „… `∉ {MODEL_ZWALIDOWANY_POMIAREM}`; `CERTIFIED` (badanie typu) otwiera wyłącznie `CERTIFICATE` jako metodę
     dowodu, nie stopień symulacji”.
5. **§7 AB-2R / AB-4R (zdarzenia warunkowe)**
   - Było: AB-4R „Karta pierwsza — KLASA ZDARZEŃ WARUNKOWYCH”.
   - Jest: klasa zdarzeń warunkowych przeniesiona do AB-2R karta pierwsza (timery `t_aktywacji_iq_s`,
     `t_podtrzymania_iq_s`, zwłoka LFSM-O). AB-4R: „pierwszy konsument magazynowy (okno SOC / BMS)”.
6. **§7 graf zależności**
   - Dopisać: `AB-3H → AB-4H`, `AB-1b → {AB-2R, AB-5R}`, `OD-33 → AB-2R`, `W5 → D-36 (jednofazowe)`.
   - Zastąpić `AB-6 → AB-7` przez `{AB-2R, AB-2H} → AB-7a`, `AB-6 → AB-7b`.
   - W6-5: „`{AB-1c, AB-2R, AB-3R, AB-5R, OD-20, OD-21, OD-33} → W6-5`; A-6 zdejmowany per test”.
7. **§6.10 + AB-1d_min (jeden mechanizm wycofania, jeden rejestr)**
   - Było: „`reportable=False`, tier `UNVALIDATED_MODEL`, `superseded_by`” / „`implemented` → nazwana odmowa”.
   - Jest: „`availability="withdrawn"` wzorem W3-E dla `POWER_QUALITY_HARMONICS` **i** `SSCI_IMPEDANCE` (werdykt
     Nyquista usunięty z powierzchni); `DYNAMIC_STABILITY` wycofany w AB-2R; `reportable` wyprowadzany z
     `provenance.py` (jedyne źródło stopnia), `dynamika_rms` dopisany do `solver_capability_registry`; test parowy.
     Najpierw jedna lista rodzajów biegów, potem trzy nowe rodzaje w niej; rodzaje bez solvera niewidoczne w UI
     (ZASADA NR 1: brak zaślepek), `supraharmoniczne` odmawia do AB-4H, nie AB-2H”.
8. **§7 AB-2H (brakujące ogniwa H)**
   - Dopisać do zakresu:
     - odbiór w dziedzinie f (#38);
     - Z_Q(f) z `Source` (S_k'', `rx_ratio`, bez domyślnych);
     - maszyny X''(f);
     - `NetworkValidator` + symbol SLD + kreator + archiwum ZIP dla dławika i filtra;
     - świeżość biegu H względem PF;
     - usunięcie endpointu `harmonic-limits` (`api/v126_academic.py:418-423`) i jego konsumenta;
     - pakiet dowodowy i eksport H;
     - lista mutowanych plików harnessu o `solvers/harmoniczne/**` z nazwanym jobem CI;
     - „H w nN ze źródłami jednofazowymi = `OUTSIDE_DOMAIN` do W5”.
   - Nowa decyzja **OD-42**: dane producentów (widma, Z_conv(f), R(f) kabli, pojemności TR).
9. **§5.3 S-67 i §7 AB-4H**
   - Dopisać cztery zastrzeżenia (liniowość/LTP, brak fazy → suma mocowa, f_sw zależna od punktu pracy,
     detektor/grupowanie).
   - Minimum modelu emisji: Norton E(f) ‖ Z_conv(f) i impedancja odbiorów w kHz (emisja wtórna).
   - Kontrakt `resultset_supraharmonic_v1`, ekran w `ui2/wyniki/…` z e2e.
   - Wynik na szynie SN bez modelu TR w kHz = `OUTSIDE_DOMAIN`, W-73 skorygować.
   - Mutacja „suma fazorowa dla widma bez fazy”.
10. **§9.4 / AB-3H i §10 (multi-physics oraz dowody wyjścia)**
    - Reguła t* operacyjna (§4.3).
    - „tryb FRT” = predykat pochodny.
    - E2E-MP1 → „po odbudowie” albo wynik `OUTSIDE_DOMAIN` w zapadzie.
    - Migawka bez SOC/trybu do AB-4H.
    - Jedna unia `zrodlo_punktu_pracy`.
    - E2E-R1 → „5 kryteriów + `stay_connected = NOT_SIMULATED`”, E2E-R1b w AB-5R.
    - Wyrocznia GFM bez „E-2 do porównania”.
    - Wyjście AB-1c na `dynamika_rms` SO-1A i odmowach z bramką ponownego przejścia.
    - Uzupełnić kolumnę „Domyka”: A3, B4, C1, C3, E8, H4 per rodzina.
    - Wiersze W6-6, W6-7 (flicker, VUF), W6-8.
    - §12.1: supersesje `SYNTEZA…:221-223` i `:506`.
    - Drobne: `bodziec_zgodnosci` → `BadanieZgodnosci.bodziec`; usunąć duplikat kontrolki THD z AB-1c; LFSM-U (§1.3),
      SyPGM-B FRT (§1.4), HVRT (§1.5), odbiór złożony (§1.6), tabela 9 rodzajów topologii (§1.7), SO-1B tylko 3F do
      W6-K (§1.8), GFM `vsm` (§1.9).

---

## 10. Czego NIE udało się sfalsyfikować (co przetrwało)

1. **§0.1–§0.2 (odzyskanie stanu):** uczciwy opis zakresu metody po korekcie (419 gałęzi + 475 PR, pełna historia).
   Zdanie o tym, czego metoda nie wyklucza, jest poprawne.
2. **R-03 (jeden ENM)** i zakaz osobnego SLD harmonicznego. Nie znalazłem w planie żadnego miejsca, które tworzy
   drugi model sieci. Assembler `zloz_wejscie_harmoniczne` z tą samą topologią jest właściwym wzorcem.
3. **R-07 (rdzenie FROZEN nietknięte):** żaden kamień nie wymaga edycji FROZEN. Wszystkie korekty werdyktów NC RfG
   działają w warstwie aplikacji lub adaptera (zastrzeżenie: §5.7 wymaga, żeby adapter był jedynym czytelnikiem).
4. **§6.9 (`BadanieZgodnosci` jako osobny kontrakt obok `ScenariuszDynamiczny`, nie rodzaj zdarzenia):** argument
   o rozłączności typem jest trafny, a hash scenariuszy się nie zmienia. Nie znalazłem kontrprzykładu (poza nazwą
   w AB-3R, §5.4).
5. **§6.5 (`rodzaj_modulu_nc_rfg` jako funkcja z `gen_type`, bez pola zapisywanego)** oraz BESS = poza zakresem
   2016/631 → `REQUIREMENT_UNVERIFIED`. Poprawne i spójne z regułą predykatów parami.
6. **§6.1 zasada fail-closed profilu** („liczby w YAML nie zmieniają się do OD-21”, zakaz liczb z pamięci modelu) oraz
   §9.5/§12.3 klasyfikacja dokumentów jakości energii z zakazami przeniesień. Nie znalazłem błędu merytorycznego
   w tabeli klas.
7. **Architektura rdzenia harmonicznego AB-2H:**
   - pu z przekładnią zespoloną;
   - rozdział sekwencji dla układu symetrycznego;
   - LU bez `pinv` z odmową sieci pływającej;
   - `OUTSIDE_DOMAIN` zamiast ekstrapolacji;
   - oś f ∈ ℝ⁺ w Hz z rzędem jako atrybutem pochodnym;
   - wyrocznie W-A1…W-A5 i niezależny solver W-M1 z guardem importu;
   - niezmienniki (wzajemność, pasywność, Foster, Tellegen).
   Zarzuty dotyczą wyłącznie brakujących modeli elementów i domeny nN (§2), nie tej konstrukcji.
8. **§8 klasyfikacja REWRITE toru `v126_academic._power_quality`.** Nie powtarzałem F1–F9, ale mechanizm F1 (brak
   przekładni, stosunek (15/0,4)² = 1406) i F1b (brak U² w R_T) jest arytmetycznie spójny z opisanym kodem.
9. **Kolejność korekt z przeglądu dynamiki:**
   - AB-4R: klasa zdarzeń warunkowych przed konsumentami AB-5R;
   - AB-3R: źródło programowalne przed LFSM-O;
   - AB-2R: ZIP i konwersja stałej mocy przed E2E-R1, ekwiwalent sieci przed E2E-R7, predykat formującego przed
     wyspą z GFL.
   Wszystkie są jawne i spójne między §7 a §9.1. Jedyne nowe naruszenie tej klasy to timery w AB-2R/AB-3R (§7.1).
10. **§2 korekty stanu W6-A i W6-F (T-1…T-3):** brak ROCOF, prąd gałęzi tylko jako moduł, H4 otwarte, SO-1A jako
    dowód harmonogramu, a nie łańcucha likwidacji. Zgodne z kodem cytowanym w evidence dynamiki. Nie znalazłem
    zawyżenia w tych wierszach.
11. **D-27 na istniejącym `malosygnalowa.py` z warunkiem ważności** (ograniczniki nieaktywne) — poprawne i bez
    duplikacji.
