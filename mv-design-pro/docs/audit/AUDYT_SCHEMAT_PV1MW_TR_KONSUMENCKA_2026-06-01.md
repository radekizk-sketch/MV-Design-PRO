# AUDYT SCHEMATU — Stacja TR SN/nN z farmą PV 1 MW (schemat wykonawczy właściciela)

**source_ref:** realny schemat wykonawczy stacji transformatorowej SN/nN z farmą PV 1 MW
(dostarczony 2026-06-01). Ten szablon (G4-PVTR) jest WIERNĄ PROJEKCJĄ tego schematu — audyt
element-po-elemencie → projekcja. Niezmienniki T1-T4 obowiązują.

## Audyt zespołu — inwentarz element-po-elemencie (z rysunku)

### Przyłącze SN
- Kabel SN **3×XRUHAKXS 1×70/25 mm²**, L≈484/524 m · głowice **ITK 224** · ograniczniki **ASM 18N** 15 kV, R≤5Ω.

### POLE NR 1 — VCB (zabezpieczeniowo-pomiarowe)
- **Q0** wyłącznik próżniowy □ (TGI 24, napęd silnikowy M) · **Q1** rozłącznik ◇ · **Q2** odłącznik ◯ + uziemnik
- Terminal **e²TANGO-800** (zabezpieczenia+sterowanie) · **MSG-701(PV)** sygnalizacja · ogranicznik **POLIM-D 18-06** · **VDIS** wskaźnik napięcia
- **T1.3** = CT (CTM 20) · **TU1.3** = VT (VTB 20) · FP1 2×SLS 2/63A

### POLE NR 2 — SŁ2+U (łącznikowo-napięciowe)
- **Q2** GTR 5 rozłącznik ◇ + uziemnik · głowica **ITK 224** · VT.

### Przekładniki (precyzja — przypięte)
- **CT CTM 20: 40/5/5/5 A/A** — 3 rdzenie: I 5VA kl.0,2s(FS5) pomiar · II 5VA 0,2s analizator · III 5VA 5P10 zab.;
  **Ith=16 kA, Idyn=40 kA**; rdzenie pomiarowe wzorcowane.
- **VT VTB 20: 15/√3 : 0,1/√3 ×3 : 0,1/3** — 4 uzwojenia: 2× pomiar kl.0,2 + 2× zab. 3P (otwarty trójkąt ziemnozwarciowy).

### Transformator podwyższający
- **1000 kVA, 15,75/0,8 kV** (max 1000 kVA), Dyn · POLIM-D18N · Zab. term. · ZK · rozdz. uziemiające.
- **nN = 800 V** (NIE 400 — falowniki PV wydają ~800 V AC).

### Strona nN 800 V
- **Q1** wyłącznik powietrzny **3WA1108, 800 A, 1000 V** (napęd M) · **TI1-TI3 1000/5 A** ·
  kable **3×(2×NSGAFOU 1×240 mm²)** · **Układ sieci IT**.

### Generacja PV
- Moduły **JA SOLAR JAM72D40-595/MB, 595 Wp, 2×560 szt** · DC → falowniki AC/DC (3 czynne + rezerwy) ·
  szyna **3×P40×10** · bezpieczniki **BTVC 315A/630V** (poz. 1-7, część rezerwa).

### Potrzeby własne — RPW-PV
- Transformator pomocniczy **TS 5 kVA 800V/230V** · odpływy **F1-F10** (B6A/B10A/B16A): SCADA, oświetlenie zewn.,
  wentylacja stacji, sterowanie SN, tablica pomiarowa, grzejnik 1500 W, analizator A30, rezerwy.

### Pomiar / jakość / telemechanika
- Tablica pośredniego pomiaru · analizator **PQI-DA / A30** · **WAGO 847-566** · **IM-04PV / HVC-15** (monitoring falowników) ·
  **SCADA** + antena kierunkowa na elewacji.

## Mapowanie na ENM (buduj z modelu — wszystko pokryte)

| Element schematu | Model ENM (source_ref) |
|---|---|
| CT wielordzeniowy CTM 20 (Ith/Idyn, rdzenie) | `MeasurementRating(number_of_cores, accuracy_class, ith_ka, idyn_ka)` (models.py:34,183) |
| VT wielordzeniowy VTB 20 | `Measurement(measurement_type='VT', purpose)` + `MeasurementRating` |
| nN 800 V | `Substation.nn_voltage_levels: list[float]` (obsługuje 0.8) |
| trafo podwyższający 0,8/15,75 | `Generator.blocking_transformer_ref` + `TransformerBranch` |
| falownik PV (IBG, wkład ograniczony) | `Generator.gen_type='pv_inverter'` + `InverterSource(in_rated_a,k_sc)` |
| potrzeby własne RPW-PV | `Bay.specialization='POTRZEBY_WLASNE'` |
| dwa pola SN (VCB + SŁ2+U) | `Bay.bay_role` ×2 (LINIA_OUT przyłączeniowe + łącznikowe) |
| granica/miejsce przyłączenia | `Generator.connection_variant` (oś 6) |

## Czego NIE wolno zmyślić (przypięte)
nN=800 V · przekładniki wielordzeniowe z rozdziałem pomiar/analizator/zabezpieczenie · POTRZEBY WŁASNE ·
dwa pola SN · wkład IBG ograniczony · withstand Ith=16kA/Idyn=40kA · układ IT. Wartości z solvera/karty;
brak → „dane niekompletne".

## Korekta poprzedniego G4 (zgadywanego) → G4 z dokumentu
Poprzedni G4 miał nN=400 V i jedno pole SN. Schemat wymusza: **nN=800 V**, **dwa pola SN (VCB+SŁ2+U)**,
**CTM20/VTB20 wielordzeniowe**, **RPW-PV**, **Ith/Idyn withstand**, **układ IT**. Przebudowa wg audytu.
