# Berechnungen und Quellen

Dieses Dokument wird aus dem Formelkatalog des Rechners erzeugt (`calc/src/formulas.js`, Werkzeug `calc/tools/docs.mjs`).
Dieselben Einträge zeigt der Rechner in der Ansicht **Formeln**; die aufklappbaren Hinweise in den Ansichten verweisen darauf.

**Koordinaten:** x vom Bug nach hinten, y zur rechten Flügelspitze, z nach oben; Ursprung an der Bugspitze auf der Rumpfachse.
Flugdynamik in Körperachsen nach Etkin (x vorn, z unten). Einheiten SI, Winkel im Bogenmaß, soweit nicht anders angegeben.

**Prüffälle** (`calc/tests/check.cjs`, laufen vor jedem Deploy): AtlantikSolar (Masse, Leistung, Excess Time), Goland-Flügel (Flattern, Divergenz),
typischer Profilschnitt nach Hodges & Pierce (ohne und mit Ruder), Navion (Eigenwerte), APC 10×7E (Schub, Wirkungsgrad), freies Flugzeug gegen die Flugdynamik.

## Inhalt

- [Atmosphäre](#atmosphaere) (3)
- [Profile und Tragflügel](#profile-und-tragfluegel) (6)
- [Widerstand und Flugleistung](#widerstand-und-flugleistung) (8)
- [Anordnung, Massen und Schwerpunkt](#anordnung-massen-und-schwerpunkt) (6)
- [Flügelstruktur und Lasten](#fluegelstruktur-und-lasten) (8)
- [Leitwerk, Träger, Start und Landung](#leitwerk-traeger-start-und-landung) (9)
- [Verkabelung](#verkabelung) (3)
- [Antrieb und Propellerstrahl](#antrieb-und-propellerstrahl) (8)
- [Stabilität und Flugdynamik](#stabilitaet-und-flugdynamik) (5)
- [Ruder](#ruder) (7)
- [Aeroelastik und Schwingungen](#aeroelastik-und-schwingungen) (13)
- [Solarenergie und Wetter](#solarenergie-und-wetter) (8)
- [Akku und Energiehaushalt](#akku-und-energiehaushalt) (7)
- [Einsatz, Sensorik und Turbulenz](#einsatz-sensorik-und-turbulenz) (9)
- [Betriebsrisiko (SORA)](#betriebsrisiko-sora) (2)
- [Anforderungen und Entwurfsvorschläge](#anforderungen-und-entwurfsvorschlaege) (4)
- [Literatur](#literatur) (79)

## Atmosphäre

### Luftdruck über der Höhe

```
p = 101 325 Pa · (1 − 2,25577·10⁻⁵·h)^5,25588
```

h Höhe über NN in m (Troposphäre)

**Stellgrößen:** Geländehöhe über NN (`alt`), Flughöhe über Grund (`hAGL`)

**Quelle:** [39] ISO 2533:1975

**Im Code:** `core.js · pressure`

### Luftdichte

```
ρ = p / (R_L·T),  R_L = 287,05 J/(kg·K)
```

T Lufttemperatur in Flughöhe: Tagesmittel am Boden minus 6,5 K/km

**Stellgrößen:** Geländehöhe über NN (`alt`), Flughöhe über Grund (`hAGL`), Lufttemperatur Maximum (Boden) (`tMax`), Lufttemperatur Minimum (Boden) (`tMin`)

**Quelle:** [39] ISO 2533:1975

**Im Code:** `core.js · rhoAt, buildCase`

### Zähigkeit der Luft (Sutherland)

```
μ = 1,458·10⁻⁶ · T^1,5 / (T + 110,4 K),  ν = μ/ρ
```

**Stellgrößen:** Lufttemperatur Maximum (Boden) (`tMax`), Lufttemperatur Minimum (Boden) (`tMin`)

**Quelle:** [73] Sutherland, W; [39] ISO 2533:1975

**Im Code:** `core.js · muAir, nuAt`

## Profile und Tragflügel

### Profilpolaren

```
c_d(c_l, Re) aus XFoil-Polaren (Re-Raster), linear zwischen Re-Stufen; außerhalb des anliegenden Bereichs quadratischer Anstieg (Abrissstrafe)
```

Umschlag frei (N_krit 9) oder fest an der Zellkante

**Stellgrößen:** Profil (`airfoil`), Grenzschicht Flügel (`transition`), Reisegeschwindigkeit (wahre Fahrt) (`v`)

**Quelle:** [17] Drela, M

**Im Code:** `core.js · profileCd, rowCd`

### Tragflügel als Wirbelgitter (Weissinger)

```
je Streifen ein Hufeisenwirbel auf der t/4-Linie, Aufpunkt bei t/4 + (t/2)·a₀/(2π);
Σ A_ij·Γ_j = V·(α + ε_i) (Randbedingung keine Durchströmung); C_L = 2Σ Γ_j·Δy_j/(V·S)
```

a₀ Profilauftriebsanstieg, ε Schränkung, Spiegelung an der Symmetrieebene

**Stellgrößen:** Spannweite (`span`), Flügelfläche (`area`), Grundriss (`planform`), Zuspitzung (Spitze/Wurzel) (`taper`), Anteil Rechteck-Mittelteil (`centerFrac`), Schränkung an der Spitze (`washout`), Pfeilung der t/4-Linie (`sweep`)

**Quelle:** [76] Weissinger, J; [43] Katz, J., Plotkin, A, Kap. 12

**Im Code:** `vlm.js · vlmWing`

### Induzierter Widerstand (Trefftz-Ebene)

```
C_Di = Σ Γ_j·w_j·Δy_j / (½·V²·S),  w aus der Wirbelschleppe in der Trefftz-Ebene;  e = C_L²/(π·Λ·C_Di)
```

**Stellgrößen:** Spannweite (`span`), Flügelfläche (`area`), Grundriss (`planform`), Zuspitzung (Spitze/Wurzel) (`taper`), Schränkung an der Spitze (`washout`)

**Quelle:** [43] Katz, J., Plotkin, A, Kap. 8.4

**Im Code:** `vlm.js · vlmWing`

### Profilbeiwert bei Pfeilung

```
c_l,Profil = c_l / cos²Λ (einfache Pfeilungstheorie)
```

**Stellgrößen:** Pfeilung der t/4-Linie (`sweep`)

**Quelle:** [64] Raymer, D, Kap. 12

**Im Code:** `core.js · aeroCore`

### Größter Flügelauftrieb (kritische Station)

```
C_L,max = min_i [C_L,b + C_L,α·(0,97·c_l,max,i·cos²Λ − f_b,i)/f_a,i]
```

die erste Station, die c_l,max erreicht, begrenzt den Flügel

**Stellgrößen:** Profil (`airfoil`), Grundriss (`planform`), Schränkung an der Spitze (`washout`), Zuspitzung (Spitze/Wurzel) (`taper`)

**Quelle:** [64] Raymer, D, Kap. 12.4; [5] Anderson, J, Kap. 5

**Im Code:** `core.js · wingClmax`

### Auftriebsanstieg kleiner Flächen (Helmbold)

```
a = π·Λ / (1 + √(1 + (π·Λ/a₀)²))
```

Leitwerke; Seitenleitwerk mit wirksamer Streckung k·Λ_S (Endscheibe Rumpf bzw. Höhenleitwerk: k = 1,4 … 1,75)

**Stellgrößen:** Streckung Höhenleitwerk (`arH`), Streckung Seitenleitwerk (`arV`), Leitwerksform (`tailType`), Rumpfform (`fusType`)

**Quelle:** [33] Hoak, D, 4.1.3.2; [5] Anderson, J, Kap. 5.3

**Im Code:** `dyn.js · helmbold; layout.js · neutralPoint`

## Widerstand und Flugleistung

### Widerstandsaufbau

```
D = q·S·c_D,Profil + q·S·C_Di + D_Leitwerk + D_Rumpf + D_Träger + D_Anbauten + D_Kufe,  dann × (1 + Reserve)
```

q = ½ρV²; Anbauten mit Interferenzzuschlag k_I

**Stellgrößen:** Interferenz und Spalte (`kInt`), Widerstandsreserve gesamt (`kDrag`), Reisegeschwindigkeit (wahre Fahrt) (`v`)

**Quelle:** [64] Raymer, D, Kap. 12.5; [35] Hoerner, S

**Im Code:** `core.js · aeroCore`

### Reibung schlanker Körper

```
c_f,turb = 0,074·Re^−0,2;  teilweise laminar: c_f = 0,074·Re^−0,2 − 1742/Re (Re > 5·10⁵), sonst 1,328/√Re
```

**Stellgrößen:** Grenzschicht Rumpf (`fusFlow`)

**Quelle:** [69] Schlichting, H., Gersten, K, Kap. 21

**Im Code:** `core.js · cfFlat`

### Rumpf als Rotationskörper

```
C_D·A = c_f·(1 + 60/f³ + f/400)·S_benetzt,  f = L/D
```

**Stellgrößen:** Rumpfform (`fusType`), Rumpfgondel Länge (`fusL`), Rumpfgondel Durchmesser (`fusD`), Rumpfröhre am Leitwerk Durchmesser (`coneD`), Grenzschicht Rumpf (`fusFlow`)

**Quelle:** [64] Raymer, D, Gl. 12.31

**Im Code:** `core.js · aeroCore`

### Leitwerkswiderstand

```
D_H = q·q_H/q·η_H·S_H·(c_d(c_l,H) + c_l,H²/(π·Λ_H·0,85)),  D_S = q·q_S/q·S_S·c_d(0)
```

q_H/q, q_S/q Staudruckverhältnis im Propellerstrahl

**Stellgrößen:** Leitwerksprofil (`tailAirfoil`), Staudruckverhältnis am Leitwerk (`etaTail`), Streckung Höhenleitwerk (`arH`)

**Quelle:** [64] Raymer, D, Kap. 12; [50] McCormick, B, Kap. 6

**Im Code:** `core.js · aeroCore`

### Höhenleitwerkslast im Trimm

```
L_H = [n·W·(x_S − x_N,F) + q·S·c·c_m,ac + ΔM_Antrieb] / (x_N,H − x_N,F)
```

x_S Schwerpunkt, x_N,F und x_N,H Neutralpunkte von Flügel und Leitwerk; ΔM aus Schublinie und Propeller-Normalkraft

**Stellgrößen:** Ziel-Stabilitätsmaß (`smTarget`), Motoranordnung (`motorPos`), Flügelvorderkante an der Wurzel (`xWingLE`), Leitwerkshebelarm (`tailArm`)

**Quelle:** [26] Etkin, B., Reid, L, Kap. 2; [57] Nelson, R, Kap. 2

**Im Code:** `layout.js · tailLoad`

### Elektrische Antriebsleistung

```
P_el = T·V/η_ges + I²·R_Leitung,  T = D (Kurvenflug: n = 1/cos φ)
```

**Stellgrößen:** Reisegeschwindigkeit (wahre Fahrt) (`v`), Querneigung im Kurvenflug (`bank`), Anteil Kurvenflug (`turnFrac`), Antriebsmodell (`propModel`), Gesamtwirkungsgrad (`etaTotal`)

**Quelle:** [59] Noth, A, Kap. 3; [48] Leutenegger, S., Jabas, M., Siegwart, R

**Im Code:** `core.js · flightPower`

### Mindestgeschwindigkeit

```
V_s = √(2·n·m·g / (ρ·S·C_L,max(V_s)))  (iteriert, da c_l,max von Re abhängt)
```

**Stellgrößen:** Spannweite (`span`), Flügelfläche (`area`), Profil (`airfoil`), Akkumasse (`mBatt`)

**Quelle:** [4] Anderson, J, Kap. 5

**Im Code:** `core.js · stallSpeed`

### Steigen und Gleiten

```
w_Steig = (T_max − D)·V/W,  w_Sink = D·V/W (Motor aus)
```

**Stellgrößen:** Motor-Drehzahlkonstante Kv (`motKv`), Propellerdurchmesser (`propD`), Steigung (`propPitch`), Zellen in Reihe (`nCells`)

**Quelle:** [4] Anderson, J, Kap. 5

**Im Code:** `prop.js · climbGlide`

## Anordnung, Massen und Schwerpunkt

### Abflugmasse (Fixpunkt)

```
m = m_Akku + m_Solar + m_Antrieb + m_Komponenten + m_Struktur(m) + m_Ballast + m_Kabel
```

Strukturmasse hängt über die Lasten von m ab: Iteration bis |Δm| < 1 mg

**Stellgrößen:** Akkumasse (`mBatt`), Zellfläche Flügel (`solarArea`), Masse Antrieb (Motor, Regler, Propeller) (`mAntrieb`), Strukturmasse (`structMode`)

**Quelle:** [59] Noth, A, Kap. 3; [48] Leutenegger, S., Jabas, M., Siegwart, R

**Im Code:** `core.js · buildCase`

### Schwerpunkt und Trägheitstensor

```
x_S = Σm_i·x_i/Σm_i,  z_S entsprechend;
I_yy = Σ(m_i(x_i² + z_i²)) − m(x_S² + z_S²) + ΣI_yy,0,i,  I_xz = Σm_i·x_i·z_i − m·x_S·z_S (Steiner)
```

**Stellgrößen:** Akku-Schwerpunkt (`xBatt`), Akku Höhe über Rumpfachse (`zBatt`), Flügelvorderkante an der Wurzel (`xWingLE`)

**Quelle:** [26] Etkin, B., Reid, L, Kap. 4.3

**Im Code:** `layout.js · massItems`

### Neutralpunkt

```
x_N = (a_F·x_N,F + V_H·a_H·(1 − dε/dα)·η_H·k_el·x_N,H + C_Nα,P·x_P)/C_Lα − C_mα,Rumpf·c/C_Lα
```

a_F aus dem Wirbelgitter, V_H = S_H/S, k_el elastische Leitwerkswirksamkeit, C_Nα,P Propeller-Normalkraft

**Stellgrößen:** Leitwerkshebelarm (`tailArm`), Höhenleitwerksvolumen (`vH`), Streckung Höhenleitwerk (`arH`), Leitwerksfuß über Flügelebene (`zTail`), Staudruckverhältnis am Leitwerk (`etaTail`), Motoranordnung (`motorPos`), Rumpfform (`fusType`)

**Quelle:** [26] Etkin, B., Reid, L, Kap. 2.3; [64] Raymer, D, Kap. 16.3; [66] Ribner, H

**Im Code:** `layout.js · neutralPoint`

### Abwind am Höhenleitwerk

```
dε/dα = 4,44·[K_Λ·K_λ·K_H·√cos Λ_¼]^1,19,  K_Λ = 1/Λ − 1/(1 + Λ^1,7), K_λ = (10 − 3λ)/7, K_H = (1 − |h_H/b|)/∛(2l_H/b)
```

**Stellgrößen:** Spannweite (`span`), Flügelfläche (`area`), Zuspitzung (Spitze/Wurzel) (`taper`), Leitwerksfuß über Flügelebene (`zTail`), Leitwerkshebelarm (`tailArm`), Leitwerksform (`tailType`)

**Quelle:** [33] Hoak, D, 4.4.1

**Im Code:** `layout.js · neutralPoint`

### Rumpf-Nickmoment (Munk-Moment)

```
C_mα,Rumpf = K_f·W_f²·L_f / (c·S)  je Grad, K_f über der Lage der Flügelwurzel-t/4 in % der Rumpflänge
```

**Stellgrößen:** Rumpfform (`fusType`), Rumpfgondel Länge (`fusL`), Rumpfgondel Durchmesser (`fusD`), Flügelvorderkante an der Wurzel (`xWingLE`)

**Quelle:** [64] Raymer, D, Abb. 16.14, Gl. 16.25

**Im Code:** `layout.js · kFus, neutralPoint`

### Trimmung auf das Stabilitätsmaß

```
Ziel x_S = x_N − σ·c;  Akku: x_A = (x_Ziel·m − Σ_übrige m_i·x_i)/m_A;  Ballast: m_B = m·Δx/(x_Ziel − x_B)
```

**Stellgrößen:** Schwerpunkt einstellen über (`trimMode`), Ziel-Stabilitätsmaß (`smTarget`), Akku-Schwerpunkt (`xBatt`), Flügelvorderkante an der Wurzel (`xWingLE`)

**Quelle:** [64] Raymer, D, Kap. 16.3

**Im Code:** `layout.js · balance`

## Flügelstruktur und Lasten

### Böenlastvielfaches

```
Δn = ρ₀·U_de·V_B·a·K_g/(2·W/S),  K_g = 0,88μ/(5,3 + μ),  μ = 2(W/S)/(ρ₀·c·a·g),  a = 2πΛ/(Λ + 2(Λ + 4)/(Λ + 2));
n_lim = max(n_Manöver, 1 + min(Δn, n_Abriss − 1))
```

U_de Böengeschwindigkeit, V_B Böen-Auslegungsgeschwindigkeit; die Böe kann nicht mehr Auftrieb erzeugen, als der Flügel bis zum Abriss hergibt

**Stellgrößen:** Böengeschwindigkeit (`gustU`), Böen-Auslegungsgeschwindigkeit (`vGust`), Manöver-Lastvielfaches (`nLimit`)

**Quelle:** [62] Pratt, K; [22] EASA (2012), 23.341

**Im Code:** `core.js · gustLoad`

### Spannweitige Lastverteilung (Schrenk)

```
L′(y) = n_u·m·g/b · ½·(c(y)/c_m + 4/π·√(1 − η²)) − n_u·g·m′_Entlastung(y)
```

Entlastung durch Solarzellen, Akku im Flügel, Leitungen; n_u = j·n_lim, j = Sicherheitsfaktor

**Stellgrößen:** Sicherheitsfaktor (`safety`), Manöver-Lastvielfaches (`nLimit`), Akku im Flügel verteilt (entlastet den Holm) (`battInWing`)

**Quelle:** [70] Schrenk, O; [22] EASA (2012), 23.303

**Im Code:** `core.js · structureMass`

### Holmgurte auf Biegung

```
A_Gurt = 2M/(σ_zul·h) (zwei Gurte) bzw. 4M/(σ_zul·h) (Rohrholm),  σ_zul = σ_Druck·k_Abminderung
```

**Stellgrößen:** Holmgurte (`matCap`), Abminderung der Festigkeit (`matKnock`), Holmhöhe / Profildicke (`sparH`), Mindest-Gurtquerschnitt (`capMin`), Holmbauweise (`sparType`)

**Quelle:** [53] Megson, T, Kap. 16; [68] SAE International (2012)

**Im Code:** `core.js · structureMass`

### Durchbiegung bei 1 g

```
w_Spitze = ∫∫ M(y)/(E·I) dy dy,  I = A·h²/4 (Gurte) bzw. A·h²/8 (Rohr); Gurte vergrößert, bis w_Spitze ≤ zulässig
```

**Stellgrößen:** Max. Durchbiegung der Spitze bei 1 g (`deflMax`), Holmgurte (`matCap`)

**Quelle:** [53] Megson, T, Kap. 16

**Im Code:** `core.js · structureMass`

### Holmsteg auf Querkraft

```
t·ρ ≥ Q/(h·τ_zul/ρ), mindestens Flächengewicht w_Steg
```

**Stellgrößen:** Holmsteg (`matWeb`), Holmsteg Flächengewicht (`wWeb`)

**Quelle:** [53] Megson, T, Kap. 17

**Im Code:** `core.js · structureMass`

### Torsionssteifigkeit der Nase (Bredt)

```
GJ = 4·A_e² / (∮ ds/(G·t))
```

A_e eingeschlossene Fläche der Torsionsnase aus der Profilkontur

**Stellgrößen:** Nasenbeplankung (Torsionsnase) (`matSkin`), Nasenbeplankung (`wLE`), Holmlage (`xSpar`)

**Quelle:** [53] Megson, T, Kap. 18

**Im Code:** `aeroel.js · wingSections`

### Steckungen

```
A_Zunge = 2M/(σ·h),  m = A·24h·ρ·1,3 + m_Beschlag
```

**Stellgrößen:** Flügelteilung (`splits`), Lage der Außenteilung (`splitEta`), Beschläge je Steckung (`mJoint`)

**Quelle:** [53] Megson, T, Kap. 16

**Im Code:** `core.js · structureMass`

### Werkstoffkennwerte

```
Gurte: E, G, ρ, σ_Druck; Schalen: G/ρ und E/ρ je Flächengewicht; Rohre: E längs, E quer, G, σ, τ
```

typische Werte für Epoxid-Faserverbunde (Handlaminat bis Prepreg), Holz, Aluminium

**Stellgrößen:** Holmgurte (`matCap`), Holmsteg (`matWeb`), Nasenbeplankung (Torsionsnase) (`matSkin`), Leitwerksträger (`matBoom`), Abminderung der Festigkeit (`matKnock`)

**Quelle:** [68] SAE International (2012)

**Im Code:** `aeroel.js · MAT`

## Leitwerk, Träger, Start und Landung

### Leitwerksgröße

```
S_H = V_H·S·c/l_H,  S_S = V_S·S·b/l_S
```

**Stellgrößen:** Höhenleitwerksvolumen (`vH`), Seitenleitwerksvolumen (`vV`), Leitwerkshebelarm (`tailArm`), Streckung Höhenleitwerk (`arH`), Streckung Seitenleitwerk (`arV`)

**Quelle:** [64] Raymer, D, Kap. 6.4

**Im Code:** `layout.js · tailGeom`

### Leitwerkslasten

```
L_H = max(q_A·S_H·0,9;  ½ρ₀·U·V_B·a_H·S_H·K_g·(1 − dε/dα)),  L_S entsprechend mit K_g,S; einseitig 100/0 %
```

**Stellgrößen:** Böengeschwindigkeit (`gustU`), Böen-Auslegungsgeschwindigkeit (`vGust`), Manöver-Lastvielfaches (`nLimit`), Sicherheitsfaktor (`safety`)

**Quelle:** [22] EASA (2012), 23.421, 23.423, 23.425, 23.427, 23.441, 23.443

**Im Code:** `tail.js · tailStructure`

### Dünnwandiges Rohr

```
σ = M/(π·r²·t),  τ = T/(2π·r²·t),  (σ/σ_zul)² + (τ/τ_zul)² ≤ 1
```

**Stellgrößen:** Leitwerksträger Durchmesser (`boomD`), Leitwerksträger (`boomLin`), Leitwerksträger (`matBoom`)

**Quelle:** [53] Megson, T, Kap. 16, 18

**Im Code:** `tail.js · tubeWall`

### Beulen unter Biegung

```
σ_kr = 0,605·γ·√(E_x·E_θ)·t/r,  γ = 1 − 0,731·(1 − e^−φ),  φ = √(r/t)/16
```

**Stellgrößen:** Leitwerksträger Durchmesser (`boomD`), Leitwerksträger (`boomLin`), Leitwerksträger (`matBoom`), Rumpfröhre Mindest-Flächengewicht (`wCone`)

**Quelle:** [56] NASA SP-8007 (1968)

**Im Code:** `tail.js · tubeWall`

### Elastische Leitwerkswirksamkeit

```
k_el = 1/(1 + q·S_H·a_H·l²/(2EI)) (Träger) bzw. 1/(1 + q·S_H·a_H·∫(x_L − x)/EI dx) (Rumpfröhre)
```

**Stellgrößen:** Leitwerksträger Durchmesser (`boomD`), Leitwerksträger (`boomLin`), Leitwerksträger (`matBoom`), Leitwerkshebelarm (`tailArm`)

**Quelle:** [77] Wright, J, Kap. 8

**Im Code:** `tail.js · tailStructure; layout.js · neutralPoint`

### Seitenleitwerk mit Motor bzw. T-Leitwerk

```
Holm für die Spitzenmomente; bei Motor zusätzlich f₁ = √(3EI/((m_Spitze + 0,24·m_SL)·b_S³))/(2π) ≥ 1,2·n_max
```

**Stellgrößen:** Motoranordnung (`motorPos`), Leitwerksform (`tailType`), Holmgurte (`matCap`)

**Quelle:** [53] Megson, T, Kap. 16; [34] Hodges, D, Kap. 3

**Im Code:** `tail.js · tailStructure`

### Landestoß ohne Fahrwerk

```
E = m·(v²/2 + (1 − L/W)·g·δ),  N = E/(η·δ·W),  n_S = N + L/W,  L/W = 2/3
```

η = 0,5 Blattfeder (Kufe), 0,7 Schaum (Rumpfboden)

**Stellgrößen:** Landung (`landGear`), Sinkgeschwindigkeit beim Aufsetzen (`vSink`), Federweg der Kufe (`skidStroke`), Eindrückweg Rumpfboden (`bellyStroke`)

**Quelle:** [13] Currey, N, Kap. 5; [22] EASA (2012), 23.473

**Im Code:** `ground.js · landingGear`

### Kufe als Blattfeder gleicher Festigkeit

```
Arbeitsvermögen je Volumen u = σ_zul²/(2E)·⅓,  m_Feder = W_Stoß·ρ/u = 6·E·W_Stoß·ρ/σ_zul²,  σ_zul = 650 MPa·k/j (GFK-UD, E = 40 GPa)
```

W_Stoß aufzunehmende Arbeit aus dem Landestoß, k Abminderung, j Sicherheitsfaktor

**Stellgrößen:** Landung (`landGear`), Federweg der Kufe (`skidStroke`), Sinkgeschwindigkeit beim Aufsetzen (`vSink`), Abminderung der Festigkeit (`matKnock`), Sicherheitsfaktor (`safety`)

**Quelle:** [13] Currey, N, Kap. 5; [53] Megson, T, Kap. 16; [68] SAE International (2012)

**Im Code:** `ground.js · landingGear`

### Hand- und Katapultstart

```
m·dV/dt = T − D − W·sin γ,  m·V·dγ/dt = L − W·cos γ,  C_L ≤ 0,9·C_L,max;  Katapult: n_x = V₀²/(2·s·g)
```

**Stellgrößen:** Start (`launch`), Abwurfgeschwindigkeit Handstart (`vHand`), Schienenlänge Katapult (`launchRail`), Neigung der Startschiene (`launchAngle`), Startgeschwindigkeit / Mindestfahrt (`vLaunchK`)

**Quelle:** [4] Anderson, J, Kap. 6

**Im Code:** `ground.js · launchSim, launchCheck`

## Verkabelung

### Leitungsquerschnitt

```
A ≥ max(2·L·I·ρ_Cu/(ΔU_zul), I/j_max),  ρ_Cu = 1/58 Ω·mm²/m,  j_max = 10 A/mm², aufgerundet auf AWG
```

ΔU_zul: Motorleitung 7 % bei Höchststrom, Solarleitungen nach Eingabe

**Stellgrößen:** Spannungsfall Solarleitungen (`wireDropSol`), Maximalstrom (`motImax`), Zellen in Reihe (`nCells`), Zellspannung (Mittel) (`cellV`), Motoranordnung (`motorPos`)

**Quelle:** [28] FAA AC 43.13-1B (1998), Tab. 11-6; [38] IEC 60028 (1925)

**Im Code:** `harness.js · sizePair`

### Leitungsmasse

```
m′ = (8,89·A + 1,4·√A + 0,3) g/m  (A in mm²; Kupfer plus Dünnwand-Isolierung)
```

**Stellgrößen:** Zuschlag Kabelbaum (`wireExtra`), Verkabelung (`wireModel`)

**Quelle:** [67] SAE AS22759/32; [38] IEC 60028 (1925)

**Im Code:** `harness.js · wireLinA`

### Leitungsverlust

```
P_V = I²·R_Leitung,  I = P_el/U_Akku
```

**Stellgrößen:** Zellen in Reihe (`nCells`), Zellspannung (Mittel) (`cellV`)

**Quelle:** [28] FAA AC 43.13-1B (1998)

**Im Code:** `harness.js · wireLoss`

## Antrieb und Propellerstrahl

### Strahltheorie (Impulssatz)

```
v_i = (−V + √(V² + 2T/(ρA)))/2,  η_i = V/(V + v_i)
```

**Stellgrößen:** Propellerdurchmesser (`propD`), Antriebsmodell (`propModel`)

**Quelle:** [30] Glauert, H, Kap. 15; [50] McCormick, B, Kap. 6

**Im Code:** `core.js · propulsion`

### Blattelement-Impuls-Theorie

```
dT = ½ρW²·B·c·(c_l cos φ − c_d sin φ)·dr,  dQ = ½ρW²·B·c·(c_l sin φ + c_d cos φ)·r·dr,
Induktion aus dem Impulssatz mit Prandtl-Spitzen- und Nabenverlust F = (2/π)·arccos(e^−f)
```

**Stellgrößen:** Propellerdurchmesser (`propD`), Steigung (`propPitch`), Blatttiefe relativ zu APC (`propChord`), Blattzahl (`propBlades`), Blattprofil (`propFoil`), Propeller (`propGeom`)

**Quelle:** [18] Drela, M; [30] Glauert, H, Kap. 16; [51] McCrink, M

**Im Code:** `prop.js · bemtElem, bemt`

### Motor erster Ordnung

```
U = Ω/K_v + I·R,  Q = (I − I₀)/K_v,  η_M = Q·Ω/(U·I)
```

**Stellgrößen:** Motor-Drehzahlkonstante Kv (`motKv`), Wicklungswiderstand (`motR`), Leerlaufstrom (`motI0`), Maximalstrom (`motImax`), Getriebeuntersetzung (`gearRatio`)

**Quelle:** [19] Drela, M

**Im Code:** `prop.js · motorAt`

### Propellergeometrie

```
Entwurf: β(r) = arctan(H/(2πr)) (gleiche Steigung H), c(r) = k·c_APC(r/R)·R;  Vorlage APC 10×7E mit gemessener Geometrie
```

**Stellgrößen:** Propeller (`propGeom`), Propellerdurchmesser (`propD`), Steigung (`propPitch`), Blatttiefe relativ zu APC (`propChord`)

**Quelle:** [2] Alvarez, E; [51] McCrink, M

**Im Code:** `prop.js · propGeometry`

### Propellerstrahl

```
v(ξ) = v_i·(1 + ξ/√(ξ² + R²)),  R_s = R·√((V + v_i)/(V + v(ξ))),  q_s/q = ((V + v)/V)²
```

Strahlachse hinter dem Flügel um ε = (dε/dα)·C_L/a_F abgelenkt

**Stellgrößen:** Propellerdurchmesser (`propD`), Motoranordnung (`motorPos`), Leitwerksfuß über Flügelebene (`zTail`)

**Quelle:** [50] McCormick, B, Kap. 6; [30] Glauert, H, Kap. 15

**Im Code:** `power.js · slipGeom`

### Drall im Strahl

```
r·v_t = K = Q/(ρ·(V + v_i)·π·R²) (Potentialwirbel, Kern 0,2·R_s)
```

**Stellgrößen:** Propellerdurchmesser (`propD`), Motoranordnung (`motorPos`)

**Quelle:** [50] McCormick, B, Kap. 6

**Im Code:** `power.js · slipGeom`

### Propeller-Normalkraft

```
N = ½·V·α_P·∫∂F_t/∂U_t dr (Blattelement-Ableitung),  α_P = α·(1 + 0,1) vor bzw. α·(1 − dε/dα) hinter dem Flügel
```

**Stellgrößen:** Propellerdurchmesser (`propD`), Blattzahl (`propBlades`), Motoranordnung (`motorPos`)

**Quelle:** [66] Ribner, H

**Im Code:** `prop.js · propNormalDeriv; power.js · powerEffects`

### Schubmoment

```
M_T = T·(z_S − z_P) + N·(x_S − x_P)  (Nase hoch positiv)
```

**Stellgrößen:** Motoranordnung (`motorPos`), Akku Höhe über Rumpfachse (`zBatt`), Leitwerksfuß über Flügelebene (`zTail`)

**Quelle:** [26] Etkin, B., Reid, L, Kap. 3.4; [57] Nelson, R, Kap. 2

**Im Code:** `power.js · thrustMoment`

## Stabilität und Flugdynamik

### Längsbewegung

```
ẋ = A_lon·x,  x = [u, w, q, θ];  X_u = −3D/V, Z_u = −2mg/V, Z_w = −q S/V·(C_Lα + C_D), M_w = qSc/V·C_mα, M_q = qSc²/(2V)·C_mq, M_ẇ = qSc²/(2V²)·C_mα̇
```

**Stellgrößen:** Ziel-Stabilitätsmaß (`smTarget`), Höhenleitwerksvolumen (`vH`), Leitwerkshebelarm (`tailArm`), Reisegeschwindigkeit (wahre Fahrt) (`v`)

**Quelle:** [26] Etkin, B., Reid, L, Kap. 4, 5; [57] Nelson, R, Kap. 4

**Im Code:** `dyn.js · lonMatrix`

### Seitenbewegung mit Deviationsmoment

```
ẋ = A_lat·x,  x = [v, p, r, φ];  [I_x −I_xz; −I_xz I_z]·[ṗ; ṙ] = [L; N]
```

**Stellgrößen:** V-Form der Außenflügel (`dihedral`), Seitenleitwerksvolumen (`vV`), Streckung Seitenleitwerk (`arV`), Pfeilung der t/4-Linie (`sweep`)

**Quelle:** [26] Etkin, B., Reid, L, Kap. 4.9; [57] Nelson, R, Kap. 5

**Im Code:** `dyn.js · latMatrix`

### Seitenstabilität

```
C_nβ = a_S·η_S·S_S/S·l_S/b + C_nβ,Rumpf + C_nβ,P;  C_lβ = C_lβ,V-Form + C_lβ,Pfeil + ΔC_lβ,Hochdecker − a_S·S_S/S·z_S/b;
ΔC_lβ,Hochdecker = 1,2·√Λ·(z_F/b)·(2D/b);  C_nβ,Rumpf = −1,3·Vol/(S·b)
```

**Stellgrößen:** Seitenleitwerksvolumen (`vV`), Streckung Seitenleitwerk (`arV`), V-Form der Außenflügel (`dihedral`), Pfeilung der t/4-Linie (`sweep`), Rumpfform (`fusType`)

**Quelle:** [26] Etkin, B., Reid, L, Kap. 5; [33] Hoak, D, 5.2.2.1; [64] Raymer, D, Gl. 16.48; [57] Nelson, R, Kap. 3

**Im Code:** `dyn.js · derivatives`

### Biegung als zusätzliche V-Form

```
Γ_el ≈ 1,2·w_Spitze/(b/2)
```

**Stellgrößen:** Max. Durchbiegung der Spitze bei 1 g (`deflMax`), Holmgurte (`matCap`), Holmhöhe / Profildicke (`sparH`)

**Quelle:** [58] Noll, T

**Im Code:** `dyn.js · derivatives`

### Flugeigenschaften (Level 1)

```
Anstellwinkelschwingung ζ 0,3–2; Phygoide ζ ≥ 0,04; Taumelschwingung ζ ≥ 0,08, ζω ≥ 0,15, ω ≥ 0,4; Rollen τ ≤ 1,4 s; Spirale T₂ ≥ 20 s
```

**Stellgrößen:** Ziel-Stabilitätsmaß (`smTarget`), V-Form der Außenflügel (`dihedral`), Seitenleitwerksvolumen (`vV`)

**Quelle:** [54] MIL-F-8785C (1980), 3.2, 3.3 (Klasse I, Kat. B)

**Im Code:** `dyn.js · flightDynamics`

## Ruder

### Ruderwirksamkeit

```
τ = 1 − (θ_h − sin θ_h)/π,  θ_h = arccos(2E − 1),  η_δ = 0,85 bis 12°, linear auf 0,55 bei 30°
```

E Rudertiefe/Profiltiefe

**Stellgrößen:** Querruder Tiefe (`ailCf`), Höhenruder Tiefe (`elevCf`), Seitenruder Tiefe (`rudCf`), Querruder Vollausschlag (`ailMax`), Höhenruder Vollausschlag (`elevMax`), Seitenruder Vollausschlag (`rudMax`)

**Quelle:** [30] Glauert, H, Kap. 7; [33] Hoak, D, 6.1.1.1; [61] Olson, E

**Im Code:** `controls.js · flapTau, flapEta`

### Gelenkmomente

```
C_h = C_hα·α + C_hδ·δ aus der Profiltheorie dünner Profile (Fourier-Integration), Servo: 1,5·max(H(V_A, voll), H(V_max, ⅓));
Pendelhöhenruder: H = q·S_H·c_H·max(|0,25 − x_D|, 0,02)·c_A,max (Auftrieb am Neutralpunkt c/4, Hebel zur Drehachse x_D)
```

Der Mindesthebel von 2 % der Tiefe deckt die unsichere Lage des Neutralpunkts der Fläche ab.

**Stellgrößen:** Querruder Tiefe (`ailCf`), Höhenruder Tiefe (`elevCf`), Drehachse Pendelruder (`elevPivot`), Seitenruder Tiefe (`rudCf`), Höchstgeschwindigkeit (SORA) (`vmax`)

**Quelle:** [31] Glauert, H; [74] Theodorsen, T; [5] Anderson, J, Kap. 4

**Im Code:** `controls.js · hingeCoef, controlSurfaces`

### Rollleistung

```
I_x·ṗ = q S b·(C_lδa·δ_a + C_lp·p·b/(2V)),  Forderung 60° in 1,7 s (Kat. B), 30° in 1,3 s (Kat. C)
```

**Stellgrößen:** Querruder von (`ailEta0`), Querruder bis (`ailEta1`), Querruder Tiefe (`ailCf`), Querruder Vollausschlag (`ailMax`)

**Quelle:** [26] Etkin, B., Reid, L, Kap. 7; [54] MIL-F-8785C (1980), 3.3.4

**Im Code:** `controls.js · controlSurfaces`

### Negatives Wendemoment

```
C_n,δa = −2Σ(Γ₀·Δw + ΔΓ·w₀)·y·Δy/(S·b·V)  (Trefftz-Ebene, antimetrische Lösung)
```

**Stellgrößen:** Querruder von (`ailEta0`), Querruder bis (`ailEta1`), Querruder Tiefe (`ailCf`)

**Quelle:** [43] Katz, J., Plotkin, A, Kap. 8.4

**Im Code:** `controls.js · aileronVLM`

### Querruder am elastischen Flügel

```
stationäres Rollen am Biege-Torsions-Balken: Wirksamkeit = C_l,elastisch/C_l,starr; Umkehr, wo sie null wird
```

**Stellgrößen:** Querruder von (`ailEta0`), Querruder bis (`ailEta1`), Nasenbeplankung (Torsionsnase) (`matSkin`), Nasenbeplankung (`wLE`), Höchstgeschwindigkeit (SORA) (`vmax`)

**Quelle:** [77] Wright, J, Kap. 8

**Im Code:** `controls.js · aileronElastic, aileronReversal`

### Höhenruder

```
δ_e aus C_m = 0 (mit Schubmoment, Strahl, nachgiebigem Träger);  dδ/dn = −C_W·(−σ + ρScC_mq/(4m))/C_mδ
```

**Stellgrößen:** Höhenruder Tiefe (`elevCf`), Höhenruder Vollausschlag (`elevMax`), Schwerpunkttoleranz (`cgTol`), Lastvielfaches für die Ruderauslegung (`nCtrl`), Höhenleitwerksvolumen (`vH`)

**Quelle:** [26] Etkin, B., Reid, L, Kap. 2.4, 3.1; [57] Nelson, R, Kap. 2

**Im Code:** `controls.js · elevatorFor, controlSurfaces`

### Seitenruder

```
stationärer Schiebeflug: C_Y = 0, C_l = 0, C_n = 0 nach β, δ_a, δ_r, φ;  Seitenwind ≥ 0,2·V_s
```

**Stellgrößen:** Seitenruder Tiefe (`rudCf`), Seitenruder Vollausschlag (`rudMax`), Seitenwind bei der Landung (`vCross`), Seitenleitwerksvolumen (`vV`)

**Quelle:** [57] Nelson, R, Kap. 2.8; [22] EASA (2012), 23.233

**Im Code:** `controls.js · controlSurfaces`

## Aeroelastik und Schwingungen

### Flügel als Biege-Torsions-Balken

```
K·u + M·ü = F;  Hermite-Elemente für die Biegung, lineare für die Torsion, Massenkopplung über den Abstand Profilschwerpunkt–elastische Achse
```

**Stellgrößen:** Holmgurte (`matCap`), Nasenbeplankung (Torsionsnase) (`matSkin`), Nasenbeplankung (`wLE`), Holmlage (`xSpar`), Holmhöhe / Profildicke (`sparH`)

**Quelle:** [63] Przemieniecki, J; [34] Hodges, D, Kap. 3, 4

**Im Code:** `aeroel.js · beamModel, beamModes`

### Divergenz

```
(K − q·K_a)·u = 0 → q_D = 1/λ_max(K⁻¹K_a),  α = θ − w′·tan Λ
```

**Stellgrößen:** Pfeilung der t/4-Linie (`sweep`), Nasenbeplankung (Torsionsnase) (`matSkin`), Holmlage (`xSpar`)

**Quelle:** [15] Diederich, F; [75] Weisshaar, T; [34] Hodges, D, Kap. 4

**Im Code:** `aeroel.js · divergence`

### Flattern (Theodorsen-Streifen, p-Verfahren)

```
L = πρb²(ḧ + Uα̇ − baα̈) + 2πρUb·C(k)·[ḣ + Uα + b(½ − a)α̇],  C(k) über Wagner-Funktion φ(s) = 1 − 0,165e^−0,0455s − 0,335e^−0,3s
```

L nach oben, h nach unten, α Nase hoch; b halbe Profiltiefe, a Lage der Drehachse in b hinter der Profilmitte. Gepfeilt: Normalschnitt mit U = V·cos Λ und α = θ − w′·tan Λ (modifizierte Streifentheorie).

**Stellgrößen:** Höchstgeschwindigkeit (SORA) (`vmax`), Nasenbeplankung (Torsionsnase) (`matSkin`), Holmlage (`xSpar`), Nasenbeplankung (`wLE`)

**Quelle:** [74] Theodorsen, T; [42] Jones, R; [34] Hodges, D, Kap. 5; [9] Barmby, J; [78] Yates, E

**Im Code:** `aeroel.js · flutterMatrix, flutterSearch`

### Prüffall Goland-Flügel

```
V_F = 137,2 m/s, V_D = 252,8 m/s (Literatur); Rechner 137,4 bzw. 252,4 m/s
```

**Quelle:** [32] Goland, M; [77] Wright, J, Kap. 10

**Im Code:** `aeroel.js · golandCheck`

### Nachweisgeschwindigkeit und Dämpfung

```
flatterfrei von V_S bis 1,2·V_D mit Strukturdämpfung g = 0,03 (ζ = g/2);  Fehlerfälle bis V_D;  statische Divergenz (reeller positiver Eigenwert) zählt wie Flattern
```

V_S Abrissgeschwindigkeit bei 1 g. Darunter fliegt das Flugzeug nicht stationär, und die Theorie mit anliegender Strömung gilt nicht; Instabilitäten freier Ruder bei sehr kleiner Fahrt zählen deshalb nicht.

**Stellgrößen:** Höchstgeschwindigkeit (SORA) (`vmax`)

**Quelle:** [27] FAA AC 23.629-1B (2004); [7] ASTM F3093/F3093M-21, 4.3; [1] 14 CFR § 25.629 (CS-25.629), (b)(2)

**Im Code:** `vib.js · VIB_G, vibAnalysis`

### Freies Flugzeug

```
Halbflügel mit Rumpf als Starrkörper an der Wurzel, Wurzel über Zwangsbedingungen an den Flugzeugachsen:
symmetrisch Hub w₀ und Nicken Θ mit w′ = −sin Λ·Θ, θ = cos Λ·Θ (Rumpf m_R/2, I_yy,R/2); antimetrisch Rollen φ mit w′ = cos Λ·φ, θ = sin Λ·φ (I_xx,R/2)
```

w′ Neigung entlang der gepfeilten Achse, θ Verdrehung um sie

**Stellgrößen:** Gemessen: 1. symmetrische Flügelbiegung (`gvtB1`), Gemessen: 1. Flügeltorsion (`gvtT1`), Pfeilung der t/4-Linie (`sweep`)

**Quelle:** [34] Hodges, D, Kap. 3; [77] Wright, J, Kap. 3, Anhang C

**Im Code:** `vib.js · freeModes, fuselageRigid`

### Freies Flugzeug: Body-Freedom-Flattern

```
α_H = (1 − dε/dα)(Θ − ẇ₀/V) + (1 + dε/dα)·l_H·Θ̇/V − dε/dα·l_H·ẅ₀/V²;  Rumpfmoment und Propeller-Normalkraft mit α = Θ − ẇ₀/V;
Flügelstreifen mit a_n = a_F/cos Λ (Gesamtanstieg a_n·cos Λ = a_F)
```

Gegenprobe: quasistationäre Starrkörper-Anstellwinkelschwingung gegen die Flugdynamik, Abweichung höchstens 3 % (ungepfeilt) bzw. 5 % (10° Pfeilung); die Prüfung läuft vor jedem Deploy.

**Stellgrößen:** Leitwerkshebelarm (`tailArm`), Höhenleitwerksvolumen (`vH`), Ziel-Stabilitätsmaß (`smTarget`), Pfeilung der t/4-Linie (`sweep`)

**Quelle:** [26] Etkin, B., Reid, L, Kap. 5.4, 5.5; [78] Yates, E; [77] Wright, J, Kap. 13

**Im Code:** `vib.js · bodyFreedom`

### Ruderflattern

```
Ruder als Freiheitsgrad mit T-Funktionen; Kopplung M_rβ = ∫(−S_β·W_r + (I_β + (c − a)b·S_β)·T_r) ds;  Servo als Drehfeder ω_β = √(k/I_β), untersucht 0,5–1,5 × Nennwert (Steifigkeit 0,25- bis 2,25-fach) und frei (k = 0, ohne Dämpfung: Spiel, Servoausfall)
```

**Stellgrößen:** Steifigkeit Servo und Gestänge (`kServo`), Flächengewicht der Ruder (`wCtrl`), Ruderschwerpunkt hinter der Drehachse (`ctrlXcg`), Massenausgleich eingebaut (`ctrlBal`), Gemessen: Querruder-Drehfrequenz (`gvtAil`), Gemessen: Höhenruder-Drehfrequenz (`gvtElev`), Gemessen: Seitenruder-Drehfrequenz (`gvtRud`)

**Quelle:** [74] Theodorsen, T; [27] FAA AC 23.629-1B (2004); [34] Hodges, D, Kap. 5

**Im Code:** `vib.js · ctrlCase; aeroel.js · tFun`

### Massenausgleich

```
m_A = β·m_R·x_R/d (d = ¼ Rudertiefe vor der Achse),  S_β = m_R·x_R − m_A·d;  Halter: 24 g senkrecht, 12 g längs der Achse, f_Halter ≥ 1,5·f_max
```

**Stellgrößen:** Massenausgleich eingebaut (`ctrlBal`), Flächengewicht der Ruder (`wCtrl`), Ruderschwerpunkt hinter der Drehachse (`ctrlXcg`)

**Quelle:** [27] FAA AC 23.629-1B (2004), Anhang 1; [11] CAA/FAA (1955)

**Im Code:** `vib.js · ctrlProps, balancePoints`

### Leitwerk auf dem Träger

```
Träger als Feder an der Leitwerkswurzel: K = EI/L³·[[12, 6L], [6L, 4L²]] (Hub, Drehung), GJ/L (Rollen), verschoben auf die elastische Achse;
Doppelträger: Höhenleitwerk an seinen Enden auf den Trägern, Mitte symmetrisch frei; Pendelhöhenruder dreht um die Achse bei x_D, Trägerdrehung als eigener Freiheitsgrad, Servo als Drehfeder dazwischen
```

Seitenruder höchstens 0,9 der Tiefe; ein Pendelhöhenruder am Doppelträger wird ohne Servofeder (Fläche fest) gerechnet und als Hinweis gemeldet.

**Stellgrößen:** Leitwerksträger Durchmesser (`boomD`), Leitwerksträger (`boomLin`), Leitwerksträger (`matBoom`), Gemessen: Seitenleitwerk quer (`gvtFin`), Gemessen: Höhenleitwerk auf und ab (`gvtHT`), Motoranordnung (`motorPos`), Leitwerksform (`tailType`), Rumpfform (`fusType`), Höhenruder Tiefe (`elevCf`), Drehachse Pendelruder (`elevPivot`)

**Quelle:** [63] Przemieniecki, J; [77] Wright, J, Kap. 3

**Im Code:** `vib.js · boomSprings, finModel, htModel`

### Eichung aus dem Standschwingversuch

```
k = (f_gemessen/f_Modell)², angewandt auf EI bzw. GJ (Flügel) oder die Trägerfedern
```

**Stellgrößen:** Gemessen: 1. symmetrische Flügelbiegung (`gvtB1`), Gemessen: 1. Flügeltorsion (`gvtT1`), Gemessen: Seitenleitwerk quer (`gvtFin`), Gemessen: Höhenleitwerk auf und ab (`gvtHT`)

**Quelle:** [77] Wright, J, Kap. 25

**Im Code:** `vib.js · calibrate, vibAnalysis`

### Torsionsnachgiebigkeit (Report 45)

```
F = ∫ θ·c² ds ≤ 200/V_D² (V_D in mph, F in rad·ft²/lb) → SI: 0,8347/V_D² rad·m²/N
```

nur Orientierung: gilt für V_D < 260 kn ohne T-Leitwerk und ohne große Außenmassen

**Stellgrößen:** Nasenbeplankung (Torsionsnase) (`matSkin`), Nasenbeplankung (`wLE`), Höchstgeschwindigkeit (SORA) (`vmax`)

**Quelle:** [11] CAA/FAA (1955); [7] ASTM F3093/F3093M-21, 4.4

**Im Code:** `vib.js · wingTorsionFactor`

### Resonanz mit dem Propeller

```
Anregung mit 1 × und B × Drehzahl; kritisch, wenn f_Eigen/k innerhalb ±12 % der Reisedrehzahl liegt
```

**Stellgrößen:** Blattzahl (`propBlades`), Motor-Drehzahlkonstante Kv (`motKv`), Zellen in Reihe (`nCells`)

**Quelle:** [77] Wright, J, Kap. 1

**Im Code:** `aeroel.js · resonance`

## Solarenergie und Wetter

### Sonnenstand

```
sin h = sin φ·sin δ + cos φ·cos δ·cos ω,  δ = 23,45°·sin(360°·(284 + n)/365) (Cooper);
Zeitgleichung E = 9,87·sin 2B − 7,53·cos B − 1,5·sin B (min), B = 360°·(n − 81)/364
```

**Stellgrößen:** Breite (`lat`), Länge (`lon`), Auslegungstag (`date`), Zeitzone (`tz`)

**Quelle:** [21] Duffie, J, Kap. 1.5, 1.6

**Im Code:** `sim.js · sunDay, sinElev`

### Klarhimmel

```
DNI = A·e^(−B·m·τ_h),  m = 35/√(1224·sin²h + 1),  τ_h = (1 − h_NN/44 308 m)^5,257,  DHI = C·DNI
```

A, B, C monatsweise nach ASHRAE; GHI = DNI·(sin h + C)

**Stellgrößen:** Geländehöhe über NN (`alt`), Einstrahlung relativ zu klarem Himmel (`sky`)

**Quelle:** [6] ASHRAE (1985); [47] Kreith, F., Kreider, J; [48] Leutenegger, S., Jabas, M., Siegwart, R

**Im Code:** `sim.js · clearSky, sunDay`

### Einstrahlung auf den gewölbten Flügel

```
G_Zellen = DNI·F_b(h) + DHI·F_d + GHI·ρ_Boden·F_g;  F_b über Kurs, Lage und Wölbung gemittelt, Einfallswinkel-Faktor IAM = 1 − b₀·(1/cos θ − 1), b₀ = 0,05
```

**Stellgrößen:** Einstrahlungsmodell (`solarGeom`), Zellen ab Flügeltiefe (`cellX0`), Zellen bis Flügeltiefe (`cellX1`), V-Form der Außenflügel (`dihedral`), Bodenreflexion (Albedo) (`albedo`)

**Quelle:** [21] Duffie, J, Kap. 5; [59] Noth, A, Kap. 4

**Im Code:** `sim.js · cellPanels, geomFactors`

### Belegung mit ganzen Zellen

```
je Spalte der Breite w: n = ⌊(L·k_B + g)/(l + g)⌋,  L = min x_Ende − max x_Anfang über die Spaltenbreite;
A_Zellen = Σ n·A_Zelle,  A_Modul = Σ n·(w + g)(l + g);
pseudoquadratisch (Seite s, Ingot-Radius R, h = s/2, x₀ = √(R² − h²)): A = 4·(h·x₀ + F(h) − F(x₀)),  F(x) = ½·(x·√(R² − x²) + R²·arcsin(x/R))
```

k_B Bogenlänge der Profiloberseite je Tiefe zwischen Zellbeginn und Zellende, g Fuge, l Zelllänge in Flugrichtung. Spalten von der Wurzel nach außen, je Spalte die Ausrichtung mit der größten Zellfläche je Spannweite. Freiräume an Wurzel, Spitze und Außenteilung; ohne Freigabe enden die Zellen vor den Ruderachsen. Halbe und Viertelzellen haben anteilig die Fläche der ganzen Zelle. Probe: C60 mit 125 mm und 160 mm Durchmesser ergibt 153,3 cm².

**Stellgrößen:** Zellbelegung (`solarMode`), Zellformat (`cellType`), Ausrichtung der Zellen (`cellOrient`), Zellabstand (`cellGap`), Zellen ab Flügeltiefe (`cellX0`), Zellen bis Flügeltiefe (`cellX1`), Freiraum an der Wurzel (`cellRootGap`), Freiraum an der Spitze (`cellTipGap`), Freiraum an der Außenteilung (`cellJointGap`), Zellen auch auf Quer- und Höhenruder (`cellsOnCtrl`), Zellen auf dem Flügel (gesamt) (`nCellsWing`), Querruder Tiefe (`ailCf`), Höhenruder Tiefe (`elevCf`)

**Quelle:** [72] SunPower Corporation (2010); [8] AZUR SPACE Solar Power (2025); [23] Eigene Herleitung im Rechner aus Geometrie bzw

**Im Code:** `solar.js · solarLayout, packColumns`

### Solarleistung

```
P = G·A·η_Zelle·η_MPPT·(1 − Laminat)(1 − Leitung)(1 − Schmutz)·(1 − c_T·(T_Zelle − 25 °C)),  T_Zelle = T_Luft + k·G
```

**Stellgrößen:** Zellbelegung (`solarMode`), Zellformat (`cellType`), Zellfläche Flügel (`solarArea`), Zellwirkungsgrad (`cellEff`), MPPT-Wirkungsgrad (`mpptEff`), Verlust Laminat/Folie (`laminateLoss`), Verlust Leitungen, Fehlanpassung (`wiringLoss`), Verschmutzung (`soiling`), Temperaturkoeffizient (`tempCoef`), Zellerwärmung (`cellHeat`)

**Quelle:** [21] Duffie, J, Kap. 23; [60] Oettershagen, P

**Im Code:** `sim.js · solarPowerAt, daySeries`

### Diffusanteil aus dem Klarheitsindex

```
k_d = 1 − 0,09k_t (k_t ≤ 0,22); 0,9511 − 0,1604k_t + 4,388k_t² − 16,638k_t³ + 12,336k_t⁴ (≤ 0,8); 0,165
```

**Stellgrößen:** Wetterdaten für die Jahresstatistik (`weather`)

**Quelle:** [24] Erbs, D

**Im Code:** `sim.js · erbs`

### Wettergenerator

```
Tagesklarheit k_t aus der Verteilung nach Bendt (Monatsmittel), Tagesgang aus dem Klarhimmel
```

**Stellgrößen:** Wetterdaten für die Jahresstatistik (`weather`), Simulierte Jahre (Generator) (`genYears`), Startwert Zufall (`genSeed`)

**Quelle:** [10] Bendt, P., Collares-Pereira, M., Rabl, A; [37] Huld, T., Müller, R., Gambardella, A

**Im Code:** `sim.js · bendt, genWeather`

### Wetterdaten

```
typisches meteorologisches Jahr (GHI, DHI, Temperatur, Wind) aus PVGIS
```

**Stellgrößen:** Wetterdaten für die Jahresstatistik (`weather`)

**Quelle:** [37] Huld, T., Müller, R., Gambardella, A

**Im Code:** `sim.js · envWeather`

## Akku und Energiehaushalt

### Nutzbare Akkuenergie

```
E = m_A·e_spez·SoH·k_T,  k_T = 1 − c_T·max(0, 20 °C − T_Akku)
```

**Stellgrößen:** Akkumasse (`mBatt`), Energiedichte (Pack) (`battSpec`), Alterung (Restkapazität) (`battHealth`), Kapazitätsverlust unter 20 °C (`battTempCoef`), Akku wärmer als Umgebung (`battHeat`)

**Quelle:** [59] Noth, A, Kap. 3; [60] Oettershagen, P

**Im Code:** `core.js · buildCase`

### Energiebilanz

```
Überschuss: E += min(P_Lade,max, (P_S − P_V)·η_L)·Δt;  Fehlbetrag: E −= (P_V − P_S)/η_E·Δt;  Ladebegrenzung über 90 % exponentiell auf 4,6 %
```

**Stellgrößen:** Ladewirkungsgrad (`etaCharge`), Entladewirkungsgrad (`etaDischarge`), Max. Laderate (`chargeC`), Nicht unter 0 °C laden (`noColdCharge`)

**Quelle:** [60] Oettershagen, P; [48] Leutenegger, S., Jabas, M., Siegwart, R

**Im Code:** `sim.js · stepE, chargeLimit`

### Excess Time und Charge Margin

```
Start im Leistungsgleichgewicht mit leerem Akku; t_exc = E(zweites Gleichgewicht)·η_E/P_V;  Charge Margin = Zeit mit vollem Akku
```

**Stellgrößen:** Akkumasse (`mBatt`), Zellfläche Flügel (`solarArea`), Auslegungstag (`date`), Breite (`lat`)

**Quelle:** [60] Oettershagen, P; [48] Leutenegger, S., Jabas, M., Siegwart, R

**Im Code:** `sim.js · periodic`

### Ruhespannung über dem Ladezustand

```
U₀,Zelle(z) aus der Kennlinie (10-%-Stützstellen, linear); Li-Ionen 3,31 … 4,18 V; LiFePO₄ bei Nennspannung ≤ 3,4 V
```

**Stellgrößen:** Zellspannung (Mittel) (`cellV`), Zellen in Reihe (`nCells`)

**Quelle:** [3] Analog Devices (Maxim Integrated); [20] Drypower IFR18650 E1600, Ruhespannungskennlinie (übernommen in Zephyr RTOS, dt-bindings/battery).

**Im Code:** `batt.js · cellOCV`

### Innenwiderstand über dem Ladezustand

```
R(z) = (R·Q)·n_s/Q_Pack·g(z),  g = (R_s + R_TS + R_TL)(z)/(…)(0,5) mit R_s = 0,1562e^(−24,37z) + 0,07446, R_TS = 0,3208e^(−29,14z) + 0,04669, R_TL = 6,603e^(−155,2z) + 0,04984
```

**Stellgrößen:** Spezifischer Innenwiderstand (`battRAh`), Zellen in Reihe (`nCells`), Zellspannung (Mittel) (`cellV`), Akkumasse (`mBatt`), Energiedichte (Pack) (`battSpec`)

**Quelle:** [12] Chen, M., Rincón-Mora, G

**Im Code:** `batt.js · rShape, battPack`

### Klemmenspannung unter Last

```
U = (U₀ + √(U₀² − 4R·P))/2,  I = P/U,  P_max = U₀²/(4R);  Abschaltung Li-Ionen 3,0 V, LiFePO₄ 2,5 V je Zelle
```

P Leistung an den Klemmen: Antrieb, Bordsysteme und Nutzlast; die Verluste I²R stecken in der Formel. Im Tagesverlauf P aus der Änderung des Ladezustands (Entladen −dE/dt·η_E, Laden −dE/dt).

**Stellgrößen:** Spezifischer Innenwiderstand (`battRAh`), Reserve bei Landung (`reserve`), Zellen in Reihe (`nCells`)

**Quelle:** [12] Chen, M., Rincón-Mora, G

**Im Code:** `batt.js · battAt, climbAtSoc`

### Energie in der Höhe

```
Überschuss, den der Akku nicht aufnimmt: dh/dt = P_Rest·η_Antrieb/(m·g) bis h_max;  Fehlbetrag: Gleiten ersetzt die Antriebsleistung, höchstens P_Antrieb(h), den Rest (Bordsysteme, Nutzlast) liefert der Akku;
P_Antrieb(h) ∝ e^(h/(2H)), H = R_L·T/g
```

**Stellgrößen:** Energie in der Höhe speichern bis (`hStore`), Flughöhe über Grund (`hAGL`)

**Quelle:** [29] Gao, X.-Z., Hou, Z.-X., Guo, Z., Liu, J.-X., Chen, X.-Q; [44] Klesh, A

**Im Code:** `sim.js · stepEH`

## Einsatz, Sensorik und Turbulenz

### Bildstreifen und Bodenauflösung

```
Streifen = 2h·tan(HFOV/2),  GSD = Streifen/N_x
```

**Stellgrößen:** Flughöhe über Grund (`hAGL`), Wärmebild Bildwinkel horizontal (`irHFOV`), Wärmebild Pixel horizontal (`irRes`), RGB Bildwinkel horizontal (`rgbHFOV`), RGB Pixel horizontal (`rgbRes`)

**Quelle:** [46] Kraus, K

**Im Code:** `ext.js · footprint`

### Flächenleistung

```
A/t = Streifen·(1 − Überlappung)·V·k_Bahn·k_Wind,  k_Bahn = L/(L + π·max(R_Kurve, Streifen/2)),
k_Wind = ½(1 − r²) + ½√(1 − r²), r = w/V, über die Windverteilung gemittelt
```

Mäander: Hin- und Rückflug längs zum Wind, Vorhaltewinkel quer; Wende als Halbkreis

**Stellgrößen:** Seitliche Überlappung (`overlap`), Länge der Suchbahnen (`legKm`), Querneigung im Kurvenflug (`bank`), Reisegeschwindigkeit (wahre Fahrt) (`v`)

**Quelle:** [23] Eigene Herleitung im Rechner aus Geometrie bzw; [49] Manwell, J, Kap. 2

**Im Code:** `ext.js · missionPerf`

### Wind in Flughöhe

```
u(h) = u₁₀·(h/10 m)^α (Hellmann),  Weibull-Verteilung mit c = ū/Γ(1 + 1/k)
```

**Stellgrößen:** Mittlerer Wind in 10 m (`wind10`), Hellmann-Exponent (`hellmann`), Weibull-Formfaktor (`weibullK`), Flughöhe über Grund (`hAGL`)

**Quelle:** [49] Manwell, J, Kap. 2

**Im Code:** `ext.js · windAtAlt, windStats`

### Brand-Erkennung (Mischpixel)

```
f_min = (L(T_B + ΔT) − L(T_B))/(L(T_F) − L(T_B)),  A_min = f_min·GSD²;  L Bandstrahldichte 8–14 µm nach Planck
```

**Stellgrößen:** Brandtemperatur (`fireT`), Hintergrund (`bgT`), Erkennungsschwelle über Hintergrund (`clutterDT`), Wärmebild NETD (`irNETD`), Wärmebild Bildwinkel horizontal (`irHFOV`), Wärmebild Pixel horizontal (`irRes`), Flughöhe über Grund (`hAGL`)

**Quelle:** [16] Dozier, J

**Im Code:** `ext.js · fireDetection`

### Funkhorizont

```
d = 4,12·(√h₁ + √h₂) km (h in m, Erdradius-Faktor 4/3)
```

**Stellgrößen:** Flughöhe über Grund (`hAGL`)

**Quelle:** [40] ITU-R P.834-9 (2017)

**Im Code:** `ext.js · missionPerf`

### Dryden-Turbulenz (niedrige Höhe)

```
L_w = h, L_u = L_v = h/(0,177 + 0,000823h)^1,2 (h in ft);  σ_w = 0,1·W₂₀, σ_u = σ_v = σ_w/(0,177 + 0,000823h)^0,4
```

W₂₀: leicht 15 kn, mittel 30 kn, stark 45 kn

**Stellgrößen:** Turbulenz (MIL-F-8785C) (`turbLevel`), Flughöhe über Grund (`hAGL`), Mittlerer Wind in 10 m (`wind10`)

**Quelle:** [54] MIL-F-8785C (1980), 3.7; [55] MIL-HDBK-1797 (1997)

**Im Code:** `turb.js · drydenParams`

### Formfilter der Böen

```
H_u = σ_u√(2L_u/(πV))/(1 + L_u s/V);  H_w = σ_w√(L_w/(πV))(1 + √3 L_w s/V)/(1 + L_w s/V)²;
H_p = σ_w√(0,8/V)(π/4b)^(1/6)/(L_w^(1/3)(1 + 4bs/(πV)));  q_g = −(s/V)/(1 + 4bs/(πV))·w_g, r_g = (s/V)/(1 + 3bs/(πV))·v_g
```

**Stellgrößen:** Turbulenz (MIL-F-8785C) (`turbLevel`), Reisegeschwindigkeit (wahre Fahrt) (`v`), Spannweite (`span`)

**Quelle:** [54] MIL-F-8785C (1980), 3.7; [55] MIL-HDBK-1797 (1997)

**Im Code:** `turb.js · turbResponse`

### Antwort an der Kamera

```
Y(jω) = C(jωI − A)⁻¹B·g(jω),  g = [u_g, w_g, q_g, ẇ_g], ẇ_g = jω·w_g;  σ_y² = ∫_{ω_AP}^∞ Σ|Y_k|² dω;  a_Kamera = a_S + ω̇ × r
```

Die Luftkräfte hängen von w − w_g, ẇ − ẇ_g (Abwindverzug) und q − q_g ab. Mit q_g ≈ −ẇ_g/V sieht das Leitwerk die eingefrorene Böe (1 − dε/dα)·w_g(t − l_H/V)/V.

**Stellgrößen:** Bandbreite des Autopiloten (`apBand`), Turbulenz (MIL-F-8785C) (`turbLevel`)

**Quelle:** [25] Etkin, B, Kap. 13; [77] Wright, J, Kap. 14; [57] Nelson, R, Kap. 6; [55] MIL-HDBK-1797 (1997)

**Im Code:** `turb.js · turbResponse`

### Bewegungsunschärfe

```
Δ = ω·t/IFOV,  IFOV = HFOV/N_x;  Vorwärtsflug Δ = V·t/GSD;  Wärmebild: t = thermische Zeitkonstante
```

**Stellgrößen:** Wärmebild Zeitkonstante (`irTau`), RGB Belichtungszeit (`rgbExp`), Wärmebild Bildwinkel horizontal (`irHFOV`), Wärmebild Pixel horizontal (`irRes`), Flughöhe über Grund (`hAGL`), Reisegeschwindigkeit (wahre Fahrt) (`v`)

**Quelle:** [36] Holst, G; [46] Kraus, K

**Im Code:** `turb.js · imageStability`

## Betriebsrisiko (SORA)

### Bodenrisiko (GRC)

```
iGRC aus Bevölkerungsdichte und Spannweite/Geschwindigkeit (Tab. 2); fGRC = iGRC + M1(A) + M1(B) + M1(C) + M2
```

**Stellgrößen:** Bevölkerungsdichte im Betriebsgebiet (`density`), Spannweite (`span`), Höchstgeschwindigkeit (SORA) (`vmax`), M1(A) Abschirmung (`m1a`), M1(B) Betriebliche Beschränkungen (`m1b`), M1(C) Bodenbeobachtung (`m1c`), M2 Fallschirm (`m2`)

**Quelle:** [41] JARUS (2024), Main Body Tab. 2, 5

**Im Code:** `ext.js · sora`

### Luftrisiko und SAIL

```
ARC aus der Begegnungsklasse (AEC), strategische Minderung; SAIL aus fGRC und Rest-ARC (Tab. 7)
```

**Stellgrößen:** Luftraum (Begegnungsklasse AEC) (`aec`), Strategische Luftrisiko-Minderung (`arcStrat`)

**Quelle:** [41] JARUS (2024), Main Body Tab. 7, Annex C

**Im Code:** `ext.js · sora`

## Anforderungen und Entwurfsvorschläge

### Stand einer Anforderung

```
zwei Grenzen: m = min(x − x_min, x_max − x)/(x_max − x_min);  eine Grenze: m = (x − x_min)/|x_min| bzw. (x_max − x)/|x_max|;
verletzt bei m < 0, knapp bei 0 ≤ m < m_knapp, sonst erfüllt
```

m_knapp ist die Knapp-Schwelle (Standard 5 %). Ganzzahlige Größen (SAIL, Bodenrisikoklasse, Zellzahl) sind knapp, wenn sie genau auf der Grenze liegen. Aufwendige Größen (Flattern aller Fälle) rechnet die Seite nach jeder Änderung im Hintergrund nach.

**Quelle:** [23] Eigene Herleitung im Rechner aus Geometrie bzw

**Im Code:** `ui-req.js · rangeState`

### Bedingungen und Vergleich zweier Entwürfe

```
V = Σ_k [max(0, x_min,k − x_k)/|x_min,k| + max(0, x_k − x_max,k)/|x_max,k|] + Σ_j V_j;  zulässig heißt V = 0;
a schlägt b: beide zulässig und f(a) ≤ f(b), oder nur a zulässig, oder beide unzulässig und V(a) ≤ V(b)
```

f ist das Ziel als Größe, die kleiner werden soll (bei „möglichst groß“ mit umgekehrtem Vorzeichen). V_j sind die Grundbedingungen als bezogene Abstände: Abflugmasse höchstens die zulässige, Reise mindestens 1,25 × Mindestfahrt, Stabilitätsmaß mindestens 3 % MAC, gewünschte Zellen passen, Einsatz am Auslegungstag gelingt, Flügel flatterfrei bis 1,2 × V_D; wahlweise die geforderte Excess Time. Mit „Abstand halten“ werden die Grenzen um die Knapp-Schwelle verschärft.

**Stellgrößen:** Zulässige Abflugmasse (`mtomLimit`), Geforderte Excess Time (`tExcReq`)

**Quelle:** [14] Deb, K

**Im Code:** `kenn.js · DESIGN_CHECKS; opt.js · optEvalVals, optBetter`

### Suche: Differential Evolution (JADE)

```
v = x_i + F·(x_pbest − x_i) + F·(x_r1 − x_r2);  u_j = v_j für Zufall < CR oder j = j_rand, sonst x_i,j;
F ~ Cauchy(μ_F; 0,1), CR ~ N(μ_CR; 0,1);  μ_CR ← 0,9·μ_CR + 0,1·mittel(S_CR),  μ_F ← 0,9·μ_F + 0,1·ΣS_F²/ΣS_F
```

Alle freien Größen auf [0, 1] skaliert; ganzzahlige und Auswahlgrößen werden beim Entschlüsseln gerundet (Raster der Eingabe). x_pbest aus dem besten Fünftel, S_F und S_CR sind die Werte erfolgreicher Kinder. Anfangsbevölkerung: der jetzige Entwurf, 30 % Nachbarn davon, der Rest als lateinischer Hyperwürfel. Mehrere Läufe mit eigenem Startwert rechnen parallel.

**Quelle:** [71] Storn, R., Price, K; [79] Zhang, J., Sanderson, A; [52] McKay, M

**Im Code:** `opt.js · optIsland`

### Feinschliff und Aufräumen

```
(1+1)-ES: x′ = x + s·σ ∘ N(0, I);  Erfolg: s ← s·e^(1/3), sonst s ← s·e^(−1/12)  (Gleichgewicht bei jedem fünften Erfolg);
Koordinatensuche: x_j ± h, h halbieren bis unter das Raster;
Aufräumen: Größe j zurück auf den alten Wert, solange zulässig und Σ Einbuße ≤ max(0,2 % · |f|, 1 % · Gewinn)
```

σ je Größe aus der Streuung des besten Fünftels der Bevölkerung. Rechnung in Stufen: ein Kind, das schon nach dem Rechenfall gegen sein Elternteil verliert, wird nicht weiter gerechnet (Tagesbilanz und Flattern entfallen). Werte am Rand des Suchbereichs werden markiert.

**Quelle:** [65] Rechenberg, I; [45] Kolda, T; [23] Eigene Herleitung im Rechner aus Geometrie bzw

**Im Code:** `opt.js · optIsland, optPolish`

## Literatur

1. 14 CFR § 25.629 (CS-25.629). Aeroelastic stability requirements.
2. Alvarez, E. J., Ning, A. (2020). High-fidelity modeling of multirotor aerodynamic interactions for aircraft design. AIAA Journal 58(10), 4385–4400 (FLOWUnsteady, Propellergeometrien).
3. Analog Devices (Maxim Integrated). Application Note 4189, Tab. 1: Ruhespannung einer typischen Li-Ionen-Zelle über dem Ladezustand (übernommen in Zephyr RTOS, dt-bindings/battery).
4. Anderson, J. D. (1999). Aircraft Performance and Design. McGraw-Hill.
5. Anderson, J. D. (2017). Fundamentals of Aerodynamics, 6. Aufl. McGraw-Hill.
6. ASHRAE (1985). Handbook of Fundamentals, Kap. 27: Klarhimmelmodell (Koeffizienten A, B, C nach Threlkeld & Jordan 1958).
7. ASTM F3093/F3093M-21. Standard Specification for Aeroelasticity Requirements.
8. AZUR SPACE Solar Power (2025). TJ Solar Cell 3G30C-Advanced (4 × 8 cm). Datenblatt DB 00010891-01 (80 × 40 mm, 30,18 cm², 29,5 % AM0, U_MPP 2,41 V).
9. Barmby, J. G., Cunningham, H. J., Garrick, I. E. (1951). Study of effects of sweep on the flutter of cantilever wings. NACA Report 1014.
10. Bendt, P., Collares-Pereira, M., Rabl, A. (1981). The frequency distribution of daily insolation values. Solar Energy 27(1), 1–5.
11. CAA/FAA (1955). Airframe and Equipment Engineering Report No. 45: Simplified Flutter Prevention Criteria for Personal Type Aircraft.
12. Chen, M., Rincón-Mora, G. A. (2006). An accurate electrical battery model capable of predicting runtime and I–V performance. IEEE Transactions on Energy Conversion 21(2), 504–511.
13. Currey, N. S. (1988). Aircraft Landing Gear Design: Principles and Practices. AIAA Education Series.
14. Deb, K. (2000). An efficient constraint handling method for genetic algorithms. Computer Methods in Applied Mechanics and Engineering 186(2–4), 311–338.
15. Diederich, F. W., Budiansky, B. (1948). Divergence of swept wings. NACA TN 1680.
16. Dozier, J. (1981). A method for satellite identification of surface temperature fields of subpixel resolution. Remote Sensing of Environment 11, 221–229.
17. Drela, M. (1989). XFOIL: An analysis and design system for low Reynolds number airfoils. In: Mueller, T. J. (Hrsg.), Low Reynolds Number Aerodynamics, Lecture Notes in Engineering 54, Springer, 1–12.
18. Drela, M. (2006). QPROP Formulation. Massachusetts Institute of Technology, Aeronautics and Astronautics.
19. Drela, M. (2007). First-Order DC Electric Motor Model. Massachusetts Institute of Technology.
20. Drypower IFR18650 E1600, Ruhespannungskennlinie (übernommen in Zephyr RTOS, dt-bindings/battery).
21. Duffie, J. A., Beckman, W. A. (2013). Solar Engineering of Thermal Processes, 4. Aufl. Wiley.
22. EASA (2012). CS-23 Amendment 3, Certification Specifications for Normal, Utility, Aerobatic and Commuter Category Aeroplanes (Lastvorschriften CS-23.301 bis 23.561).
23. Eigene Herleitung im Rechner aus Geometrie bzw. Bilanzgleichung (keine externe Quelle); Annahmen stehen beim Eintrag.
24. Erbs, D. G., Klein, S. A., Duffie, J. A. (1982). Estimation of the diffuse radiation fraction for hourly, daily and monthly-average global radiation. Solar Energy 28(4), 293–302.
25. Etkin, B. (1972). Dynamics of Atmospheric Flight. Wiley; Nachdruck Dover 2005 (Kap. 13: Flight in a Turbulent Atmosphere).
26. Etkin, B., Reid, L. D. (1996). Dynamics of Flight: Stability and Control, 3. Aufl. Wiley.
27. FAA AC 23.629-1B (2004). Means of Compliance with Title 14 CFR, Part 23, § 23.629, Flutter.
28. FAA AC 43.13-1B (1998). Acceptable Methods, Techniques, and Practices – Aircraft Inspection and Repair, Kap. 11 (Elektrische Leitungen).
29. Gao, X.-Z., Hou, Z.-X., Guo, Z., Liu, J.-X., Chen, X.-Q. (2013). Energy management strategy for solar-powered high-altitude long-endurance aircraft. Energy Conversion and Management 70, 20–30.
30. Glauert, H. (1926). The Elements of Aerofoil and Airscrew Theory. Cambridge University Press.
31. Glauert, H. (1927). Theoretical relationships for an aerofoil with hinged flap. ARC R&M 1095.
32. Goland, M. (1945). The flutter of a uniform cantilever wing. Journal of Applied Mechanics 12(4), A197–A208.
33. Hoak, D. E., Finck, R. D. u. a. (1978). USAF Stability and Control DATCOM. Air Force Flight Dynamics Laboratory, Wright-Patterson AFB.
34. Hodges, D. H., Pierce, G. A. (2011). Introduction to Structural Dynamics and Aeroelasticity, 2. Aufl. Cambridge University Press.
35. Hoerner, S. F. (1965). Fluid-Dynamic Drag. Hoerner Fluid Dynamics, Bricktown NJ.
36. Holst, G. C. (2008). Electro-Optical Imaging System Performance, 5. Aufl. JCD Publishing / SPIE Press.
37. Huld, T., Müller, R., Gambardella, A. (2012). A new solar radiation database for estimating PV performance in Europe and Africa. Solar Energy 86(6), 1803–1815 (PVGIS).
38. IEC 60028 (1925). International standard of resistance for copper.
39. ISO 2533:1975. Standard Atmosphere. International Organization for Standardization, Genf.
40. ITU-R P.834-9 (2017). Effects of tropospheric refraction on radiowave propagation (Erdradius-Faktor k = 4/3).
41. JARUS (2024). JARUS guidelines on Specific Operations Risk Assessment (SORA), Edition 2.5, Main Body und Annexe.
42. Jones, R. T. (1940). The unsteady lift of a wing of finite aspect ratio. NACA Report 681.
43. Katz, J., Plotkin, A. (2001). Low-Speed Aerodynamics, 2. Aufl. Cambridge University Press.
44. Klesh, A. T., Kabamba, P. T. (2009). Solar-powered aircraft: Energy-optimal path planning and perpetual endurance. Journal of Guidance, Control, and Dynamics 32(4), 1320–1329.
45. Kolda, T. G., Lewis, R. M., Torczon, V. (2003). Optimization by Direct Search: New Perspectives on Some Classical and Modern Methods. SIAM Review 45(3), 385–482.
46. Kraus, K. (2007). Photogrammetry: Geometry from Images and Laser Scans, 2. Aufl. de Gruyter.
47. Kreith, F., Kreider, J. F. (1978). Principles of Solar Engineering. Hemisphere/McGraw-Hill (Luftmasse m = 35/√(1224·sin²h + 1)).
48. Leutenegger, S., Jabas, M., Siegwart, R. (2011). Solar airplane conceptual design and performance estimation. Journal of Intelligent & Robotic Systems 61, 545–561.
49. Manwell, J. F., McGowan, J. G., Rogers, A. L. (2009). Wind Energy Explained, 2. Aufl. Wiley (Potenzgesetz, Weibull-Verteilung).
50. McCormick, B. W. (1995). Aerodynamics, Aeronautics, and Flight Mechanics, 2. Aufl. Wiley.
51. McCrink, M. H., Gregory, J. W. (2017). Blade element momentum modeling of low-Reynolds electric propulsion systems. Journal of Aircraft 54(1), 163–176.
52. McKay, M. D., Beckman, R. J., Conover, W. J. (1979). A Comparison of Three Methods for Selecting Values of Input Variables in the Analysis of Output from a Computer Code. Technometrics 21(2), 239–245.
53. Megson, T. H. G. (2017). Aircraft Structures for Engineering Students, 6. Aufl. Butterworth-Heinemann.
54. MIL-F-8785C (1980). Military Specification: Flying Qualities of Piloted Airplanes. U.S. Department of Defense.
55. MIL-HDBK-1797 (1997). Flying Qualities of Piloted Aircraft. U.S. Department of Defense.
56. NASA SP-8007 (1968). Buckling of Thin-Walled Circular Cylinders. NASA Space Vehicle Design Criteria (Structures).
57. Nelson, R. C. (1998). Flight Stability and Automatic Control, 2. Aufl. McGraw-Hill.
58. Noll, T. E. u. a. (2004). Investigation of the Helios Prototype Aircraft Mishap, Vol. I. NASA.
59. Noth, A. (2008). Design of Solar Powered Airplanes for Continuous Flight. Dissertation ETH Zürich Nr. 18010.
60. Oettershagen, P. u. a. (2017). Design of small hand-launched solar-powered UAVs: From concept study to a multi-day world endurance record flight. Journal of Field Robotics 34(7), 1352–1377.
61. Olson, E. D. (2015). Semi-empirical prediction of aircraft low-speed aerodynamic characteristics. NASA/TM-2015-218489.
62. Pratt, K. G., Walker, W. G. (1954). A revised gust-load formula and a re-evaluation of V-G data taken on civil transport airplanes from 1933 to 1950. NACA Report 1206.
63. Przemieniecki, J. S. (1968). Theory of Matrix Structural Analysis. McGraw-Hill.
64. Raymer, D. P. (2018). Aircraft Design: A Conceptual Approach, 6. Aufl. AIAA Education Series.
65. Rechenberg, I. (1973). Evolutionsstrategie: Optimierung technischer Systeme nach Prinzipien der biologischen Evolution. Frommann-Holzboog, Stuttgart.
66. Ribner, H. S. (1945). Formulas for propellers in yaw and charts of the side-force derivative. NACA Report 819.
67. SAE AS22759/32. Wire, Electrical, Fluoropolymer-Insulated, Crosslinked Modified ETFE, Thin Wall, Silver-Coated Copper.
68. SAE International (2012). CMH-17 Composite Materials Handbook, Vol. 2: Polymer Matrix Composites, Materials Properties.
69. Schlichting, H., Gersten, K. (2017). Boundary-Layer Theory, 9. Aufl. Springer.
70. Schrenk, O. (1940). A simple approximation method for obtaining the spanwise lift distribution. NACA TM 948.
71. Storn, R., Price, K. (1997). Differential Evolution – A Simple and Efficient Heuristic for Global Optimization over Continuous Spaces. Journal of Global Optimization 11(4), 341–359.
72. SunPower Corporation (2010). C60 Solar Cell, Mono Crystalline Silicon. Datenblatt 001-66352 Rev A4 (125 × 125 mm, Durchmesser 160 mm, 21,8–22,5 %, U_MPP 0,574–0,582 V).
73. Sutherland, W. (1893). The viscosity of gases and molecular force. Philosophical Magazine 36(223), 507–531.
74. Theodorsen, T. (1935). General theory of aerodynamic instability and the mechanism of flutter. NACA Report 496.
75. Weisshaar, T. A. (1980). Divergence of forward swept composite wings. Journal of Aircraft 17(6), 442–448.
76. Weissinger, J. (1947). The lift distribution of swept-back wings. NACA TM 1120 (Übersetzung von Forschungsbericht 1553, 1942).
77. Wright, J. R., Cooper, J. E. (2015). Introduction to Aircraft Aeroelasticity and Loads, 2. Aufl. Wiley.
78. Yates, E. C. (1966). Modified-strip-analysis method for predicting wing flutter at subsonic to hypersonic speeds. Journal of Aircraft 3(1), 25–29.
79. Zhang, J., Sanderson, A. C. (2009). JADE: Adaptive Differential Evolution With Optional External Archive. IEEE Transactions on Evolutionary Computation 13(5), 945–958.
