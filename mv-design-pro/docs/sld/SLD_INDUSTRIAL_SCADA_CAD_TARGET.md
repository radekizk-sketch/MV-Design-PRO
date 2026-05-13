# SLD_INDUSTRIAL_SCADA_CAD_TARGET — Docelowy obraz SLD klasy przemysłowej

**Status:** AKTUALNY (binding target)
**Wersja:** 1.0
**Data:** 2026-05-13
**Powiązane:**
- `docs/sld/SLD_INDUSTRIAL_SPEC_v1.md` — pełna specyfikacja techniczna (komplementarna)
- `docs/sld/SLD_VISUAL_ACCEPTANCE_CRITERIA.md` — konkretne kryteria akceptacji
- `docs/sld/SLD_IMPLEMENTATION_ROADMAP.md` — plan reworku
- `docs/plan/PLAN_SLD_REWORK.md` — fazowany plan (F1–F5)

---

## 1. Definicja target state

**Celem jest system klasy przemysłowej SCADA/CAD, nie atrapa z klocków.**

Punktem odniesienia są:
- **ETAP** (Operation Technology Inc.) — operator-grade SLD
- **DIgSILENT PowerFactory** — engineering-grade SLD
- **ABB MicroSCADA** — dispatcher SCADA
- **Siemens SICAM PAS** — substation automation HMI
- **AutoCAD Electrical** — CAD-grade geometry

Nie kopiujemy artefaktów. Czerpiemy wzorce: gęstość informacji, hierarchię wizualną, port-based routing, LOD policy, deterministyczny render, eksport CAD.

---

## 2. Sześć filarów industrial-grade

| # | Filar | Wymóg |
|---|-------|-------|
| 1 | **Symbolika IEC 60617** | ≥ 90% parity, ANSI/IEEE 315 jako alternatywa |
| 2 | **Port-based routing CAD-grade** | 100% edges port-based, orthogonal A* z obstacle avoidance, grid snap 5 mm |
| 3 | **LOD + warstwy** | 5 poziomów LOD (overview / planview / standard / technical / full), 13 warstw toggle |
| 4 | **Dark SCADA + light technical** | 2 motywy: ekranowy + eksport (V12K-007) |
| 5 | **Eksport CAD** | SVG vector-clean + PDF vector + DXF (roadmap) |
| 6 | **Visual regression w CI** | 60 snapshotów (15 fixtures × 4 LOD), pixel diff threshold 0.5% |

Szczegóły implementacyjne — patrz `SLD_INDUSTRIAL_SPEC_v1.md`.

---

## 3. GPZ jako pełna rozdzielnia WN/SN i SN

### 3.1 Target

GPZ MUSI być renderowany jako **PEŁNA rozdzielnia** z:

- **Strona 110 kV (WN):** linia (lub linie) zasilające + odłączniki + uziemniki + zwory (jeśli relevantne) + TR
- **Transformator 110/15 kV (TR1, opcjonalnie TR2):** z grupą przekładni (Yyn0 / Dyn5 / Dyn11 / Yd11), tap changer marker, oznaczenie nominału (np. „TR1 25 MVA 110/15 kV Dyn11")
- **Strona SN (15 kV):** szyna SN z TOPOLOGIĄ (single / double / ring) — to MUSI być widoczne
- **Sekcje SN:** jawnie pokazane jako separated busbar sections + sprzęgło (coupler) między sekcjami
- **Pola SN:**
  - Liniowe (z CB, DS, ES, CT, VT, surge arrester) — POZIOM gęstości pól ≈ 3.5 pól/cm²
  - Transformatorowe (dla TR1, TR2)
  - Pomiarowe (CT/VT cubicle)
  - Sprzęgłowe (między sekcjami)
  - DER (PV/BESS/FW jako dedykowane pole)
- **Tor mocy** — wizualnie czytelny: 110 kV → TR → busbar → pola → odejścia trunk SN
- **Annotation:** tag IEC pola (Q01, Q02, …), nominał napięcia, kierunek mocy

### 3.2 Czego NIE wolno

- ❌ GPZ jako prostokąt z napisem („GPZ 110/15 kV") — to atrapa
- ❌ Brak rozróżnienia sekcji szyn (single vs double vs ring) — operator nie widzi topologii
- ❌ Brak TR jako osobny symbol — to atrapa
- ❌ Pola wszystkie wyglądające tak samo — brak rozróżnienia liniowe / TR / pomiarowe / sprzęgłowe

### 3.3 Vendor templates (kandydaci — wymaga weryfikacji źródłowej)

Pola SN powinny renderować się zgodnie z vendor templates. Producenci preferowani (kolejność umowna):
- **ABB** — kandydat: rodzina szaf SN z wyłącznikiem wyciągalnym
- **Siemens** — kandydat: rodzina SN z wyłącznikami próżniowymi w środowisku SF6
- **ZPUE Włoszczowa** — kandydat: polski producent szaf SN
- **Elektrometal** — kandydat: polski producent szaf SN

**Status:** WSZYSTKIE konkretne nazwy serii (np. UniGear ZS1, 8DJH, NXAIR, Rotoblok, ETP, ROSCO) są **CANDIDATE / REQUIRES_SOURCE**. Wymagają weryfikacji wg aktualnych vendor datasheets producenta przed wprowadzeniem do katalogu jako BINDING. Nie fabrykować geometrii ani nazewnictwa. Plan w `IMPLEMENTATION_GAP_ANALYSIS § 4.1`.

---

## 4. Stacje SN/nN jako mini-RMU/RM6 lub pełne sub-SLD

### 4.1 Stacja przelotowa SN/nN (typ I)

- Renderowana jako **mini-RMU** (rodzina ABB / Siemens — konkretne serie wymagają weryfikacji vendor datasheets): 3 pola liniowe + 1 pole TR
- Przy zoom > 1×: **expand inline** do pełnego sub-SLD z polami SN + TR + szyną NN + odbiorami
- Pole NN może być multi-voltage (110 V, 230 V, 400 V) wg potrzeby

### 4.2 Stacja konsumentowa (typ II)

- Renderowana jako mini-RMU z 2 polami liniowymi + 1 pole TR + odbiory NN
- Zoom expand: pełny sub-SLD

### 4.3 Stacja PV / BESS / FW

- Renderowana z dedykowanym symbolem DER (PV / BESS / FW) + falownik(i) + transformator (jeśli sieci SN) + PCC marker
- PCC (punkt przyłączenia) **wizualnie powiązany z polem stacji nadrzędnej** (linia, opcjonalnie wskaźnik strzałką)

### 4.4 Stacja sekcyjna / odgałęźna

- Z trzema polami (linia 1, linia 2, odbiory)
- Sekcja: dodatkowo z couplerem

### 4.5 Co MUSI być widoczne

- Typ stacji (przelotowa / konsumentowa / DER / odgałęźna)
- Numerologia (TR1, BAY01, ...)
- Moc TR (np. „630 kVA Dyn11")
- Status łączników (otwarty/zamknięty/uziemiony)
- Przy zoom > 1×: pełny sub-SLD wnętrza

### 4.6 Czego NIE wolno

- ❌ Stacja jako pusty prostokąt z napisem — atrapa
- ❌ Brak inline expansion przy zoom — operator musi otwierać osobne okno
- ❌ Brak rozróżnienia stacji przelotowa vs DER — atrapa

---

## 5. Aparaty kanoniczne i klikalne

### 5.1 Wymagania

- Każdy aparat ma symbol IEC 60617 (lub ANSI 315 fallback)
- Każdy aparat ma **port(y) elektryczne** zdefiniowane w `ports.json`
- Każdy aparat jest klikalny — klik otwiera Element Inspector z parametrami
- Status aparatu (closed/open/fault) jest wizualnie wyraźny (kolor + ewentualnie animacja pulsowania dla fault)
- Aparat ma znaczenie elektryczne — to NIE jest tylko grafika

### 5.2 Lista aparatów (min. 50)

Patrz `SLD_INDUSTRIAL_SPEC_v1.md` § 3.2 — szczegółowa lista 50+ symboli IEC 60617.

### 5.3 Czego NIE wolno

- ❌ Mieszanie symboli IEC i ANSI bez explicit toggle
- ❌ Symbol bez portu (routing łączy się ze środkiem)
- ❌ Brak rozróżnienia: aparat liniowy (CB w polu liniowym) vs zabezpieczeniowy (CB w polu transformatorowym z relayem)

---

## 6. Głowice, porty, odcinki, magistrale, odgałęzienia

### 6.1 Głowice (cable heads)

- Renderowane jako symbol `cable_head_triangle.svg` (istnieje)
- Automatycznie na końcach kabli SN
- W vendor template wiązane z mufą / głowicą kablową producenta (typowo: 3M, Raychem, Tyco)

### 6.2 Porty

- Każdy symbol ma `ports.json` entry z minimum 1 portem
- Każdy port ma: `id`, `(x, y)`, `kind` (BUS / LINE_IN / LINE_OUT / EARTH / TAP), `voltage_kv_compat`
- Routing **100% port-based** (V12.xx wymóg)

### 6.3 Odcinki

- Linia napowietrzna: `line_overhead.svg` (ciągła)
- Linia kablowa: `line_cable.svg` (przerywana 8,4)
- Odcinek ma: typ (overhead / cable), długość, R/X, typ vendor z katalogu
- Annotation: nominał, długość w jednostkach SI

### 6.4 Magistrale (trunk)

- Trunk SN: wizualnie WYRÓŻNIONY (grubsza linia, podkreślenie kierunku mocy)
- Magistrala odgałęźna: cieńsza linia
- Każda magistrala ma `trunk_id` w `logical_views.trunks`

### 6.5 Odgałęzienia (branch)

- Z magistrali głównej: branch_point (kropka electrical) + linia odgałęźna + stacja na końcu
- Słup rozgałęźny: dedykowany symbol `pole.svg` z portami
- ZK SN (złącze kablowe): dedykowany symbol `zksn.svg` z 2+ portami
- NOP (Normalnie Otwarty Punkt): dedykowany symbol `nop.svg`

---

## 7. PV / BESS / FW z PCC

### 7.1 PCC (Point of Common Coupling)

- PCC to **punkt przyłączenia DER** do sieci OSD (zwykle szyna SN GPZ lub szyna stacji odbiorowej)
- Wizualnie: **wyróżniony marker** (kropka z annotation „PCC") + linia łącząca DER z polem stacji nadrzędnej
- Zgodnie z NC RfG: profil operatora (FRT, Q-U, cos φ(P)) wiązany z DER

### 7.2 PV

- Symbol `pv.svg` + falownik (`pv_inverter_nc_rfg.svg` — z parametrami FRT/Q-U na annotation)
- TR opcjonalny (jeśli przyłączenie do SN; bez TR jeśli do nN)
- PCC marker

### 7.3 BESS

- Symbol `bess.svg` + falownik PCS + (opcjonalnie) transformator
- Annotation: pojemność (np. „500 kWh / 250 kW"), profil cyklu

### 7.4 FW (Farma Wiatrowa)

- Symbol `fw.svg` per turbina (12 turbin w katalogu wg PLANS)
- 2 typy: synchroniczne (full converter), DFIG
- Kolekcja turbin łączona w jeden node SLD jeśli skala wymaga
- PCC marker

---

## 8. Wyniki obliczeń, zabezpieczenia, proof/report

### 8.1 Wyniki na SLD

- **Power Flow:** strzałki kierunku P+jQ (gradient barw zielony→czerwony), |V| pu i φ przy każdym busie
- **Short Circuit:** I''k3, Ip, Ith [kA] przy każdym busie, kolor severity wg ratingu
- **Voltage Profile:** chart osobny + overlay na SLD (kolor busa wg poziomu V)
- **Protection:** strefy zadziałania (przezroczyste tło), czas t51 [s] przy CB, margins selektywności

### 8.2 Zabezpieczenia

- Protection settings widoczne w Element Inspector per relay
- Coordination diagram (TCC krzywe) jako osobny panel
- Margins selektywności — numeric tylko, brak werdyktów

### 8.3 Proof / Report

- Proof Inspector w UI: Formula → Data → Substitution → Result → Unit verification
- Eksport: JSON + LaTeX + PDF + **DOCX (P0 todo)**
- 8 pakietów: SC3F, VDROP, Equipment, PF, Losses, Protection, Earthing, LF Voltage

---

## 9. Co JEDNOZNACZNIE definiuje „klasa przemysłowa" (binding rule)

System SLD jest klasy przemysłowej gdy spełnia WSZYSTKIE z poniższych jednocześnie:

1. ✅ Tor mocy jest czytelny (głównego TR + busbar + trunk wizualnie podkreślone)
2. ✅ Stacje wyglądają jak rozdzielnia (nie klocek z napisem)
3. ✅ GPZ ma TR + sekcje + pola jasno rozróżnione
4. ✅ Pola SN renderowane z vendor templates (lub generic zgodny z IEC 60617)
5. ✅ Symbole aparatów jednoznaczne, klikalne, mają znaczenie elektryczne
6. ✅ Etykiety nie nachodzą na siebie (collision avoidance)
7. ✅ Odcinki wychodzą z głowic/portów (port-based routing)
8. ✅ LOD wzmacnia, nie ukrywa znaczenia elektrycznego
9. ✅ Kliknięcia i menu kontekstowe są pełne (brak dead clicków)
10. ✅ Eksport SVG + PDF działa
11. ✅ Visual regression w CI guard'uje wygląd
12. ✅ 2 motywy: dark_scada (ekran), light_technical (eksport)

Jeśli choć JEDEN punkt nie jest spełniony — system jest atrapą. Plan adresacji: `SLD_IMPLEMENTATION_ROADMAP.md`.

---

**KONIEC TARGET SLD INDUSTRIAL SCADA/CAD**
