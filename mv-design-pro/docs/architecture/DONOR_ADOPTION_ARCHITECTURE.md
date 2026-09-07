# DONOR ADOPTION ARCHITECTURE — MV-DESIGN-PRO

**Data:** 2026-09-07 · **Baza:** `5adc958d` (CV-4.3 K6)
**Podrzędne wobec:** `CANONICAL_TWIN_ARCHITECTURE.md`, `DECISION_FREEZE_REGISTER.md` (DT-1…DT-16).
**Decyzje:** `DONOR_DECISION_MATRIX.md` · **Dowody i pomiary:** `DONOR_AUDIT_CHECKPOINT.md`

---

## 0. Weryfikacja hipotezy architektonicznej z mandatu

Mandat prosił o zweryfikowanie lub odrzucenie diagramu ENM → {SLD, adaptery solverów,
zabezpieczenia} z „Semantic SLD Kernel" pod SLD. **Werdykt: kierunek słuszny, ale diagram
z mandatu wdrożony dosłownie byłby regresem.** Trzy poprawki wyprowadzone z kodu:

1. **Nie budujemy „Semantic SLD Kernel" jako nowej warstwy.** Mandat umieszczał w nim
   `identity · functions · ports · semantic connections`. **To już jest w ENM**
   (`Port`, `PortRef`, `ConnectionNode`, rewizje, dziennik, hasze). Zbudowanie kernela
   z tymi odpowiedzialnościami utworzyłoby **drugi model** — wprost przeciwnie do DT-1
   i prawa 1. Brakuje **wyłącznie** dwóch dolnych pięter: `placements` i `routes`.
2. **Warstwa prezentacji nie może być „pod SLD" wewnątrz ENM.** Musi być **obok**,
   z własną trwałością — dowód w §1.
3. **Adapter solvera nie jest piętrem architektury, tylko kontraktem z proweniencją** (§2).

## 1. Rozstrzygnięcie nośne: dlaczego placement/route NIE MOŻE trafić do ENM

Wyprowadzone z reguł haszowania, nie z preferencji stylistycznych (`DONOR_AUDIT_CHECKPOINT.md` F-16):

- `enm/hash.py::_semantic_payload()` to **biała lista** — nowa kolekcja **nie wejdzie**
  do `semantic_hash`. ✔
- ale `_input_payload()` i `hash_migawki_enm()` robią **pełny zrzut modelu**:
  `_kopia_pod_hash()` przepisuje **WSZYSTKIE** klucze migawki, zdejmując tylko zmienne pola
  nagłówka i `id`. **Każda** nowa kolekcja najwyższego poziomu w `EnergyNetworkModel`
  wchodzi do **hasza migawki**. ✘
- `snapshot_hash` biegu to właśnie ten hasz, a `application/result_freshness.py:292`
  porównuje go z bieżącym, żeby oznaczyć wyniki jako nieaktualne.

**Wniosek — w wersji poprawionej po bramce §17.** Mechanizm jest prawdziwy: nowa kolekcja
najwyższego poziomu **wchodzi** do hasza migawki, więc naiwne „dodajmy addytywnie, pola
opcjonalne nie zaszkodzą" faktycznie unieważniałoby wyniki przy przesunięciu symbolu.
**Ale napisałem wcześniej, że jest to „technicznie błędne" i wniosek „nieunikniony" — i to było
za mocne.** Jedna linia wykluczenia czyni pole hasz-neutralnym, a **repozytorium już to zrobiło**:
`connection_conditions` jest wykluczone przez `_POLA_NAGLOWKA_POZA_HASHEM` (`hash.py:270-278`).
Wariant „w ENM, z wykluczeniem z hasza" jest więc **wykonalny technicznie**.

**Odrzucamy go z innych powodów — i one wystarczają:**
- **DT-1 / prawo 1:** ENM to model **elektryczny**. Współrzędne i wierzchołki tras nie są
  informacją elektryczną; wstawienie ich do modelu kanonicznego miesza dwie odpowiedzialności.
- **Prawo 3.4:** magazyn ma być kasowalny w całości bez dotknięcia modelu. Kolekcja wewnątrz
  `EnergyNetworkModel` nie jest kasowalna niezależnie.
- **DT-14:** backend semantyka, frontend geometria.
- **Krucha ochrona:** hasz-neutralność opartą na liście wykluczeń łatwo zepsuć cichym
  dodaniem pola. Ochrona przez **umiejscowienie poza modelem** jest odporna z konstrukcji,
  a nie z pamięci autora kolejnej zmiany.

To rozstrzygnięcie potwierdza niezależnie PowSyBl (§ niżej): geometria w side-carze, nie w modelu.

To samo rozstrzygnięcie potwierdza niezależnie PowSyBl: `single-line-diagram-core` (20 229 linii)
robi **zero** mutacji modelu sieci, a trwała geometria leży w side-carze kluczowanym
`getEquipmentId()`. Wariant CGMES, który wkłada współrzędne do modelu, **odrzucamy** (F2).

## 2. Architektura docelowa

```
                         ENM  —  JEDYNA KANONICZNA PRAWDA ELEKTRYCZNA
                    (Port · PortRef · ConnectionNode · Bay · rewizje · hasze)
                                          │
        ┌─────────────────────────────────┼─────────────────────────────────┐
        │                                 │                                 │
   SLD PROJECTION                   ADAPTERY SOLVERÓW                  ZABEZPIECZENIA
        │                                 │                                 │
  buildScene(ENM) ──► scena wyliczona     assembler ──► solver natywny       ENM ProtectionAssignment
        │                                 │            (FROZEN, White Box)   │
        ▼                                 │                                 ▼
  ┌─────────────────────────┐             ├──► wyrocznia pandapower      topologia ──► pary
  │ SLD PRESENTATION STORE  │             │    (BSD-3, tylko dowód)      (L5: dziś po indeksie)
  │  OSOBNY AGREGAT         │             │                                 │
  │  klucz: ref_id ENM      │             ▼                                 ▼
  │  Placement{x,y,rot,ark} │        wynik kanoniczny + PROWENIENCJA    przypadki zwarciowe
  │  Route{waypoints[]}     │        (solver_version, mapping_version,       │
  │  ── NIE w snapshot_hash │         enm_revision, enm_hash)                ▼
  └─────────────────────────┘             │                            CTI ──► weryfikacja
        │                                 ▼                                  selektywności
        ▼                          bramka świeżości (JEST: result_freshness)
   nakładka scenowa                       │
   (bez fizyki)                           ▼
                                    publikacja wyniku
```

### 2.1 SLD Presentation Store — kontrakt

| Właściwość | Rozstrzygnięcie | Źródło |
|---|---|---|
| Umiejscowienie | **Poza** `EnergyNetworkModel`, osobny agregat trwały | F-16 |
| Klucz | `ref_id` elementu ENM / identyfikator portu — **nigdy** identyfikator sceny/SVG | F1 (PowSyBl: `getEquipmentId()`, nie `getSvgId()`) |
| Zawartość | `Placement{element_ref, x, y, rotation, arkusz}` · `Route{connection_ref, waypoints[]}` | A1/B1 |
| Zapisywane wierzchołki | **tylko wewnętrzne**; oba końce liczone od nowa przy każdym renderze | F1 |
| Zerwana referencja | **odrzucana przy odczycie**, scena spada do układu wyliczonego — cicho, bez błędu | F1 |
| Wpływ na hasz | **ZERO** — nie wchodzi do `snapshot_hash`; przesunięcie symbolu **nie unieważnia wyników** | F-16 |
| Kasowalność | Cały magazyn można skasować; model nietknięty, scena wraca do `buildScene` | prawo 3.4 |

**Dlaczego to nie jest drugie źródło prawdy (DT-1):** agregat **nie przechowuje żadnej
informacji elektrycznej** — wyłącznie współrzędne i wierzchołki. Nie da się z niego odtworzyć
topologii i nic go o nią nie pyta. Kierunek zależności jest jednostronny:
Store → wskazuje ENM; ENM → nie wie o Store.

**Ryzyko, które trzeba pilnować (uczciwie nazwane):** dziś prawo 3.4 zachodzi **trywialnie**,
bo scena jest w całości pochodna. Trwałe rozmieszczenie jest zmianą **najbardziej podatną**
na erozję tego prawa. Dlatego karta P0 zaczyna się od **testu prawa**, nie od funkcji (A4):
„pełny relayout + skasowanie magazynu nie zmienia topologii ENM ani `snapshot_hash`".

### 2.2 Kontrakt adaptera solvera (podniesiony po lekcji K6)

Adapter **nie** przechowuje prawdy domenowej, **nie** rozszerza ENM ukrytymi wartościami,
**nie** wprowadza cichych domyślnych. Musi publikować: wersję solvera, wersję mappera,
rewizję i hasz ENM, znaczniki czasu. Wynik po zmianie modelu **nie może** być prezentowany
jako FRESH (to MV **już** egzekwuje — `result_freshness.py`).

**Wymóg nowy, wynikający wprost z K6 — DWIE asercje, nie jedna:**

| Asercja | Co dowodzi | Stan dziś |
|---|---|---|
| **Mapowania** | wielkość podana solverowi zewnętrznemu wyprowadzona z **zadeklarowanego pola ENM**, nie z pośredniego wyniku MV | **istnieje tylko test z K6** |
| **Numeryczna** | zgodność liczb w granicach tolerancji | istnieje |

Sam parytet numeryczny **przeszedł** przy błędnym `Z_Q`, bo obie strony liczyły tę samą złą
sieć. Parytet dowodzi zgodności **na jednej zmapowanej sieci** — nie dowodzi mapowania.

### 2.3 Czego architektura NIE zmienia

- **ENM pozostaje jedyną prawdą elektryczną.** Żadna adopcja tego nie narusza.
- **Rdzenie solverów pozostają FROZEN** (DT-9, bramka B-01). Żadna karta P0/P1 ich nie dotyka.
- **`ResultSetV1` pozostaje FROZEN** (DT-10); proweniencja adaptera dokłada się **obok**
  wyniku (rekord biegu/koperta), nie zmienia kontraktu wyniku.
- **Skasowane trasy legacy nie wracają** (K5).
- **Jeden assembler, jedna implementacja topologii** (DT-8).
- **Backend semantyka, frontend geometria** (DT-14) — Presentation Store jest po stronie
  danych trwałych, ale **nie** zawiera semantyki; scena pozostaje liczona z ENM.

## 3. Dlaczego odrzucamy „drugi solver" jako kierunek

Power Grid Model bywa kuszący jako niezależna wyrocznia i jako „szybszy rdzeń". Oba argumenty
upadają na pomiarze i na środowisku:

- **Nie da się go zainstalować** przy obecnym stosie: wymaga Pythona ≥3.12 (MV: 3.11.15)
  i numpy ≥2.0 (MV zamyka 1.26.4 — nośne dla haszy golden).
- **Jako wyrocznia różni się z założenia:** `c_max` nN zaszyte 1,10 wobec 1,05 w MV,
  napięcie przedzwarciowe brane ze źródła (±3 %), zwarcia wymagają sieci uziemionej
  (wyklucza sieci kompensowane, typowe dla SN w Polsce). Wyrocznia, która różni się
  systematycznie, nie zwiększa wartości dowodowej — przenosi spór z liczb na konwencje.
- **Argument wydajnościowy jest obalony pomiarem:** cała algebra liniowa zwarć na sieci
  52 stacji to **0,4 s** wobec zmierzonych **170,9 s** (Y-bus **144×144**, `build_zbus` 2,5 ms).
  Wymiana solvera **zamaskowałaby** nieznaną przyczynę zamiast ją usunąć.

**Warunek wznowienia (nazwany, nie „kiedyś"):** MV przechodzi na Python ≥3.12 **i** numpy ≥2.0.
Dopiero wtedy PoC na kanonicznym benchmarku, i wyłącznie dla `two_phase_to_ground` —
jedynego typu zwarcia, którego pandapower nie policzy.

## 4. Runtime — realizacja DT-12, nie nowa architektura

Kierunek „pula procesów teraz, kolejka później" jest **już zamrożony** (DT-12) i **niewdrożony**
(zero `ExecutionBackend`/`ProcessPool`/`concurrent.futures`; Celery = stub 26 linii bez importerów).
Adopcja wzorca TENSA nie jest więc decyzją architektoniczną do podjęcia — jest realizacją
własnej decyzji. **Ale nie jest pilna**, i to jest wniosek z pomiaru:

- Endpoint `execute_run` jest zwykłym `def`, więc FastAPI odkłada go do puli wątków —
  **pętla zdarzeń NIE jest blokowana** (przypięte `tests/api/test_wspolbieznosc_biegow.py`).
  „Serwer zamiera na czas obliczeń" jest **nieprawdą**.
- Odczuwanym problemem jest **171 s bez anulowania i bez postępu** — a to naprawia
  **anulowanie kooperatywne** (G2, P1), nie migracja na procesy.
- Migracja na procesy ma wysoki promień rażenia: ADR-028 zostawia Postgres jako PROPOSED,
  a `enm/store.py` chroni zapis `threading.RLock`, który **między procesami nie działa** —
  worker cicho złamałby niezmienniki magazynu, a wszystkie testy jednoprocesowe zostałyby zielone.

Dlatego: **anulowanie i taksonomia awarii P1; pula procesów P2** z warunkiem wstępnym
(rozstrzygnięcie kontraktu współbieżności magazynu ENM między procesami).

## 5. Zabezpieczenia — norma ponad donora

Audyt oxigrid wykazał, że donor deklarujący „IEC 60909" **zaniża prąd zwarcia 1-fazowego
dokładnie √3×** (6,2489 kA zamiast 10,8234 kA na jego własnej fiksturze), ma **odwrócone**
współczynniki `c`, **zero** współczynników korekcyjnych i zamienione role `m`/`n` w `I_th`.
Przyjęcie tych wzorów „bo README mówi IEC" dałoby błąd **w kierunku niebezpiecznym**
dla doboru aparatury.

Dlatego w obszarze zabezpieczeń obowiązuje bezwyjątkowo:
**norma / kontrakt domenowy > implementacja zewnętrzna**. Donorzy (Sandia, GElectrical)
wnoszą **architekturę, przepływ i przypadki testowe** — nigdy autorytet normatywny.
Wszystkie karty zabezpieczeń są `REWRITE_CLEAN_ROOM` (co jest zbieżne z ich licencją GPL,
ale wynika z inżynierii, nie z licencji).
