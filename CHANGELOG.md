# Changelog - FTTH KMZ to AutoCAD Converter

All notable changes, feature additions, and technical fixes for the **FTTH KMZ-to-CAD Converter** application are documented in this file.

## [2.2.8] - 2026-10-14

### 🔴 Specific HLD NAP Layering (16/8 Lines, LCP/Non-LCP, Dummy), SOURCE NAP Stencil & PLDT Dual Modes
- **Specific HLD NAP Layering (16-Lines, 8-Lines, LCP N01, Non-LCP N02-N04, Existing, Dummy)**:
  - Replaced generic NAP layers with dedicated, specific AutoCAD layers:
    - **Proposed 16-Lines LCP NAP (`N01`)**: `NEW NAP 16-LINES LCP` (AutoCAD Color 1 - Red).
    - **Proposed 16-Lines Non-LCP NAP (`N02` to `N04`+)**: `NEW NAP 16-LINES NON-LCP` (AutoCAD Color 1 - Red).
    - **Proposed 8-Lines LCP NAP (`N01`)**: `NEW NAP 8-LINES LCP` (AutoCAD Color 1 - Red).
    - **Proposed 8-Lines Non-LCP NAP (`N02` to `N04`+)**: `NEW NAP 8-LINES NON-LCP` (AutoCAD Color 1 - Red).
    - **Existing 16-Lines Source NAP**: `EXISTING NAP 16-LINES` (AutoCAD Color 5 - Blue).
    - **Existing 8-Lines Source NAP**: `EXISTING NAP 8-LINES` (AutoCAD Color 5 - Blue).
    - **Proposed Dummy NAP**: `NEW DUMMY NAP` (AutoCAD Color 1 - Red).
    - **Existing Dummy NAP**: `EXISTING DUMMY NAP` (AutoCAD Color 5 - Blue).
  - Both block reference insertions (`INSERT`) and all attribute text lines (`MHTYPE` / `MHNO`) now strictly reside on their dedicated specific NAP layer for seamless layer isolation, freezing, and `SELECTSIMILAR` counting in AutoCAD.
- **`SOURCE NAP` Stencil Tag for Existing NAPs**:
  - Existing NAPs now automatically display **`"SOURCE NAP"`** on Line 2 (`MHNO`), replacing `"NAP AUGMENT"` to accurately denote existing source feed locations in AutoCAD drawings.
  - Proposed NAPs continue to display `"NAP AUGMENT"`.
- **AutoCAD Layer Column in HLD Schedule Table & CSV Export**:
  - Added an **AutoCAD Layer** column to the interactive HLD NAP schedule table and exported CSV reports, allowing designers to inspect the exact resolved layer before downloading.
- **Preserved Independent Text Grips on Each Pole Line (`Lock position = No`)**:
  - All pole attribute definitions (`ATTDEF`) and instances (`ATTRIB`) across Globe and PLDT poles have attribute lock position disabled (`280 = 0`), ensuring each line of pole data text (Pole tag, CC/Clamp, Coordinates) retains its own individual on-screen grip for manual adjustment.
  - To rotate the pole circle and all attribute text together as a rigid whole block, designers can select the pole block, click its center insertion grip, and press Spacebar twice to activate AutoCAD's native `** ROTATE **` mode (without typing `RO`), avoiding AutoCAD dynamic block rotation action limitations that strip unlocked attributes.
- **Straight Horizontal Default Orientation (`0°`) for PLDT Poles**:
  - Updated `NEW_PLDT_SYSMBOL`, `NEW_PROPOSE POLE_SYSMBOL`, and `NEW_ELECTRIC_SYSMBOL` block definitions and `ATTRIB` insertions so all PLDT pole labels default to `0.0°` horizontal orientation stacked cleanly to the right of the pole symbol (`x = 1.9500` / `2.0000`), with a symmetric $45^\circ$ `X` crossbar inside `NEW_ELECTRIC_SYSMBOL`.
- **PLDT `P-7` Pole Clamp Size = `7-9` (`S2` / `S3`)**:
  - Updated `resolvePldtPoleClampSize` so `P-7` (and proposed poles) resolve to the **`7-9`** pole clamp size class (`S2` for Straight runs, `S3` for Curve/Corner poles).
- **Provider-Specific Aerial Span Allowance (`+0.5m` for PLDT, `+2.0m` for Globe)**:
  - Automatically sets the span length allowance to **`+0.5m`** when switching to PLDT (`PLDT Structured` or `PLDT Legacy`) and **`+2.0m`** when switching to Globe across both the Pole Survey Converter and HLD NAP Converter.
- **Dual PLDT Converter Modes (`PLDT Structured` & `PLDT Legacy`)**:
  - **PLDT / Smart (Structured)**: Purpose-built for structured survey KMZ files (e.g. `63306_poles_with_photos(1).kmz`) containing bullet-delimited pole names (`<CLASS> • <TAG> • <MATERIAL> • <SIZE>`) and structured HTML `<table>` metadata inside `<description>` (`Pole Tag #`, `Classification`, `Pole Status`, `Owner`, `Material / Size`, `Proposed Pole`, `Remarks`).
  - **PLDT / Smart (Legacy)**: Preserves the original single-line unstructured KMZ converter behavior for older survey files.
- **PLDT Stencil Attribute Data Mapping (Keeping Original Stencil Geometry)**:
  - **Electric Poles (`NEW_ELECTRIC_SYSMBOL`)**:
    - **Line 1 (`EP`)**: Pure Pole Tag # (e.g. `51430`, `51434`, `54121`, `NPT`, `NLT (1T)`).
    - **Line 2 (`CC`)**: `<Material>(<Size>)` (e.g. `CC(7-9)`, `CC(8-10)`, `W(7-9)`).
    - **Line 3 (`COORDINATES`)**: `lat, lon` (6 decimal places).
  - **PLDT / Smart Poles (`NEW_PLDT_SYSMBOL`)**:
    - **Line 1 (`PLDT`)**: `PLDT-<Pole Tag #>` when numbered (e.g. `PLDT-56425`), or `PLDT-NPT` when untagged (`NPT`).
    - **Line 2 (`CC`)**: `<Material>(<Size>)` (e.g. `CC(7-9)`).
    - **Line 3 (`COORDINATES`)**: `lat, lon` (6 decimal places).
  - **Proposed Poles (`NEW_PROPOSE POLE_SYSMBOL`)**:
    - **Line 1 (`PROPOSED-POLE`)**: `"Proposed Pole"`.
    - **Line 2 (`SIZE`)**: `"7.5m"` (for `P-7` / `P7`) or `"9.14m"` (for `P-9` / `P9`).
    - **Line 3 (`COORDINATES`)**: `lat, lon` (6 decimal places).
    - **Uniform 3-Line Spacing**: Aligned the perpendicular line step between `PROPOSED-POLE`, `SIZE`, and `COORDINATES` to a uniform `2.95`-unit spacing matching the Electric and PLDT pole stencils.
- **PLDT Pole Clamp Label Element & Stencil Legend Box (`pole clamp stencil.dxf`)**:
  - Automatically places the pole clamp `MTEXT` label beside every pole in PLDT mode (`PLDT Structured` & `PLDT Legacy`) based on pole clamp size (`5-7`, `7-9`, `8-10`, `12-14`; `P-7`/`7.5m` -> `7-9`, `P-9`/`9.14m` -> `7-9`) and route deflection angle (`< 15°` Straight vs. `>= 15°` Curve/Corner):
    - **CA CLAMP - STRAIGHT (WITH COMP)** (Green `62: 85` / TrueColor `5814856`):
      - `5-7` -> **`VS2`** on layer `CA pole clamp 5-7`
      - `7-9` -> **`S2`** on layer `CA pole clamp 7-9`
      - `8-10` -> **`B2`** on layer `CA pole clamp 8-10`
      - `12-14` -> **`VB2`** on layer `CA pole clamp 12-14`
    - **GCA CLAMP CURVE CORNER** (Purple `62: 217` / TrueColor `9643919`):
      - `5-7` -> **`VS3`** on layer `GCA pole clamp 5-7`
      - `7-9` -> **`S3`** on layer `GCA pole clamp 7-9`
      - `8-10` -> **`B3`** on layer `GCA pole clamp 8-10`
      - `12-14` -> **`VB3`** on layer `GCA pole clamp 12-14`
  - Includes the complete **POLE CLAMP** stencil legend box (`LOT BOUNDARY`, `NAP BOUNDREY`, `SAG`) in the exported CAD drawing and displays live `CA` / `GCA` clamp count cards and badges in the converter UI.
- **Live Stencil Attribute Preview Column**: Added a **Stencil Attributes (Line 1 • Line 2)** column in the **Feature & Pole List Preview** table so drafters can inspect the exact resolved stencil texts and pole clamp code before exporting.
- **Provider-Specific OSM Road Label Colors & Full Corridor Coverage**:
  - Restored full OpenStreetMap road corridor generation (including unnamed corridor roads) so that rural or subdivision routes without an official OSM `name` tag still generate road centerlines and boundaries.
  - Set `ROAD_LABELS` (road names) to **Blue (AutoCAD Color 5)** for **PLDT** (`PLDT Structured` and `PLDT Legacy`) and **Yellow (AutoCAD Color 2)** for **Globe**.

---

## [2.2.7] - 2026-09-28

### ⚡ Dedicated AutoCAD Layers for Every Pole Type & Utility (SELECTSIMILAR Pole Counting)
- **Individual Utility & Telco Pole Layers**: Poles are now classified directly onto designated AutoCAD layers reflecting their exact utility or telco owner rather than generic umbrella layers:
  - **Electric Utilities & Coops**: `DLPC` (Davao Light), `MERALCO`, `COTELCO`, `MORE`, `VECO` (Visayan Electric), `DANECO` / `NORDECO`, `DASURECO`, `BENECO`, `SOCOTECO`, `LEYECO`, `ILECO`, `CEPALCO`, etc.
  - **Telco Providers**: `PLDT`, `GLOBE`, `CONVERGE`, `DITO`, `TELOF`, `ETPI`.
  - **Proposed Poles**: `P-POLE` / `P-POLE 9.14m CC` (AutoCAD Color 1 - Red).
- **AutoCAD `SELECTSIMILAR` Pole Counting Parity**:
  - Both block reference insertions (`INSERT`) and all attribute definitions (`ATTRIB`) now share the pole's dedicated layer (`DLPC`, `PLDT`, `GLOBE`, `CONVERGE`, etc.).
  - Drafters can select any pole in AutoCAD, run `SELECTSIMILAR`, and AutoCAD instantly selects all poles of that exact type/utility, displaying the exact pole count in AutoCAD's Properties panel.
- **Dynamic DXF LAYER Table Registration**:
  - `createDxf` and `createHldNapDxf` now dynamically register every detected pole layer in the DXF header symbol table with appropriate AutoCAD colors (Color 1 for proposed, Color 5 for Globe, Color 7 for electric coops, PLDT, Converge, Dito).
- **Live Summary Metric Cards Breakdown**:
  - Added real-time summary metric cards in the Pole Survey Converter tab displaying **Total Poles** and individual cards for every detected pole layer with its color and count.
- **Electric Utility / Power Company Configuration Dropdown**:
  - Added an Electric Utility configuration dropdown in **Pole Standards & CAD Configuration** with 1-click presets (`Auto-detect from KMZ`, `DLPC`, `MERALCO`, `COTELCO`, `MORE`, `VECO`, `DANECO/NORDECO`, `DASURECO`, `BENECO`, `SOCOTECO`, `LEYECO`, `ILECO`, `CEPALCO`, and `Generic`). Changing the preset instantly reclassifies the survey poles and regenerates the DWG/DXF in real time.
- **AutoCAD Layers Panel Parity**:
  - The AutoCAD Layers accordion dynamically renders all active pole layers detected in the drawing with live object counts.

---

## [2.2.6] - 2026-09-26

### 🔷 Existing Dummy NAP Blue Stencil, Robust Folder Classification & Total Existing Classification
- **Resolved Existing NAP Recognition in `OLT/POI` Folders**: Fixed a critical issue where existing NAPs grouped inside `OLT/POI` or root carrier folders (e.g. `CRA_001_L907_N01 (BATCH 2 PROPOSED)` in `MIN5_HLD.v2.kmz`) were previously overridden and misclassified as `OLT_POI`, causing them to be excluded from the NAP schedule, counts, and blue stencil generation.
- **Pattern-First Entity Classification (`isNapEntity` & `isStandardNapIdentifier`)**:
  - Implemented pattern recognition for standard NAPs (`LXXX_N0X`, `N01`, `NAP`, `FAT`, `FDP`) and dummy NAPs (`C0X_D0X`).
  - Placemarks matching NAP naming or bearing batch identifiers (`BATCH 1`, `BATCH 2`, `(BATCH 2 PROPOSED)`) are guaranteed classification as **`EXISTING NAP`**, overriding folder heuristics. True OLTs (`MIN5`) and closures (`PROPOSED 72F CLOSURE`) remain on layer `OLT_POI`.
- **Dedicated Existing Dummy NAP Block (`GLOBE NAP DUMMY EXISTING`)**: Added specialized CAD block definition for Existing Dummy NAPs rendered in AutoCAD Color 5 (Blue) on layer `EXISTING NAP`. Follows the clean empty D-stencil outline (top/bottom/left enclosure frame lines and dome ellipse) with strictly **zero ports** and **no internal mounting triangle**.
- **Domain Identification Convention (`C0X_D0X` vs `LXXX_N0X`)**:
  - Automatically identifies Dummy NAPs by the `C0X_D0X` pattern (e.g. `CRA_001_C02_D02`, `MIN4026_C01_D01`, `C01_D01`, `D01`) or folder designations.
  - Automatically identifies Standard NAPs by the `LXXX_N0X` pattern (e.g. `CRA_001_L907_N01`, `MIN167_L911_N04`, `L901_N01`).
- **Comprehensive Existing Status Inclusion**:
  - Existing category in the HLD NAP converter encompasses **both standard existing NAPs and existing dummy NAPs** whenever a batch identifier is detected (e.g. `(BATCH 2 PROPOSED)`).
  - Summary metric card displays the combined Existing count along with a sub-breakdown (e.g. `2 NAPs • 2 Dummy`).
  - Interactive Leaflet map preview displays distinct visual styling and badge labeling (`EXISTING DUMMY (Batch)`) with tooltips.
  - Schedule table badges and CSV export distinguish `EXISTING DUMMY` with `Dummy NAP` splitter ratio (0 ports).
- **DWG/DXF Block Table Registration**: Fully registered `GLOBE NAP DUMMY EXISTING` in the block symbol table and attribute pipelines (`MHTYPE` and `MHNO`) on layer `EXISTING NAP` with Color 5 (Blue).

---

## [2.2.5] - 2026-09-26

### 🔵 Existing NAP Blue Stencil & Batch Identifier Detection
- **Existing NAP Blue Stencil Integration (`GLOBE NAP EXISTING` & `GLOBE NAP 8-LINES EXISTING`)**: Added dedicated Globe Existing NAP stencil block definitions on layer `EXISTING NAP` with AutoCAD Color 5 (Blue). Features 100% geometric parity with Proposed NAPs (outer D-box frame, dome ellipse, internal mounting triangle, horizontal port lines, and attributes `MHTYPE` and `MHNO`), rendered strictly in pure blue.
- **Batch Identifier Classification Rule**: Implemented automated detection for batch identifiers (`BATCH 1`, `BATCH 2`, `(BATCH 2 PROPOSED)`, `B2`, etc.). Any NAP with a batch identifier is strictly classified as **`EXISTING`**, overriding "proposed" folder locations or name annotations.
- **Automated Clean NAP ID Extraction**: When parsing placemark names containing trailing batch annotations (e.g. `MIN167_L911_N04 (BATCH 2 PROPOSED)`), the batch tag is automatically stripped for the CAD `MHTYPE` attribute text (yielding `MIN167_L911_N04`), keeping drawing labels clean while retaining the full name in data properties and tooltips.
- **Dual Stencil Variant Support (16-Lines & 8-Lines Existing)**: Automatically assigns `GLOBE NAP 8-LINES EXISTING` (dual mounting triangles with 8 ports in blue) to 8-port existing NAPs, and `GLOBE NAP EXISTING` (standard 4-line mounting triangle with 16-port configuration in blue) to 16-port existing NAPs.
- **Dedicated Layer Isolation (`EXISTING NAP` - Color 5)**: Created layer `EXISTING NAP` with Color 5 (Blue) for the block reference insertion and attributes (`MHTYPE`, `MHNO`), allowing drafters to isolate, freeze, or color-manage existing NAPs separately from proposed or dummy NAPs.
- **UI & Interactive Map Preview Upgrades**:
  - Added an **Existing (Batch)** count card in the metric summary panel.
  - Updated the interactive Leaflet map preview with pure blue markers (`#2563eb`) and added **Existing NAP (Batch)** to the map legend.
  - Updated the NAP schedule table badge styling for existing NAPs.

---

## [2.2.4] - 2026-09-19

### ⚡ 8-Lines Stencil Integration & Symmetrical Centering for 16-Lines Stencil
- **8-Lines Stencil Integration (`GLOBE NAP 8-LINES` / `SINGLE NAP 2`)**: Extracted and integrated the official Globe 8-lines dual-bracket NAP stencil from `C:\Users\My Pc\Downloads\8 LINES Stencil.dwg`. Features the standard outer D-enclosure, dual internal mounting bracket triangles (top and bottom), and 8 evenly distributed horizontal port lines (4 per bracket). Fully selectable as an option under **Stencil Block Style** in the HLD NAP Converter.
- **Automatic 8-Lines Stencil Assignment**: NAPs designated as 8 lines (e.g. `1:8` splitter ratio, 8 ports, or named with `_8 LINES` like `MIN4026_L914_N01_8 LINES`) are now automatically inserted with the 8-lines stencil (`GLOBE NAP 8-LINES`) even when running in standard Telco Block mode, while 16-lines / `1:16` NAPs automatically use `GLOBE NAP PROPOSED`.
- **Centered 4 Port Lines in 16-Lines / Standard NAP Stencil**: Re-aligned and centered the 4 horizontal port lines inside the mounting triangle of `GLOBE NAP PROPOSED` so they are positioned symmetrically around $Y = 0.0$ ($Y = \pm 0.8718, \pm 0.2906$) with uniform spacing ($\Delta Y = 0.5812$) and balanced margins ($0.4010$) relative to the triangle edges.
- **Telco Attribute & Layer Parity**: Both 8-lines and 16-lines stencils feature complete attribute support with `MHTYPE` (NAP ID) and `MHNO` (`NAP AUGMENT` / splitter ratio) on layer `p-mh` (Color 1 - Red).
- **Dual Block Table Registration**: Automatically registers both `GLOBE NAP 8-LINES` and the template alias `SINGLE NAP 2` in the DWG/DXF block symbol table to ensure 100% interoperability with external drafter templates.

---

## [2.2.3] - 2026-09-17

### 📋 AutoCAD Block Collision Prevention for Dummy NAP Copy/Paste (`GLOBE NAP DUMMY`)
- **Resolved Stencil Loss on Copy/Paste**: Standardized the Dummy NAP block name to `GLOBE NAP DUMMY`. Previously, when drafters copied and pasted Dummy NAPs into existing AutoCAD drawings based on Globe's template (`NAP STENCILS.dxf`), AutoCAD discarded the empty stencil enclosure because the template drawing already had a headless block named `Dummy NAP` (defined with only text attributes and no graphics).
- **Unique Block Standard (`GLOBE NAP DUMMY`)**: By establishing the unique block definition `GLOBE NAP DUMMY`, AutoCAD imports the complete empty D-shaped enclosure (top line, bottom line, left line, and right dome ellipse) without collision, fully preserving the empty stencil when copied/pasted into any drafter's template or working drawing.
- **Dual Block Definition Export**: Both `GLOBE NAP DUMMY` and `Dummy NAP` block definitions are generated in the DWG/DXF block symbol table, ensuring total backward and forward compatibility across drafting tools and scripts.
- **Port-Free Empty Enclosure & Layer Isolation**: Maintained the clean port-free D-stencil outline on layer `DUMMY NAP` (Color 1 - Red), separate from Proposed NAP (`NEW NAP`), with `MHTYPE` (NAP ID) and `MHNO` (`"NAP AUGMENT"`) intact.

---

## [2.2.2] - 2026-09-16

### 🎨 Dedicated Layer Isolation for Dummy NAPs (`DUMMY NAP` Layer)
- **Separate CAD Layer for Dummy NAPs**: Proposed NAPs are maintained on layer `NEW NAP` (Color 1 - Red), while Dummy NAPs now reside on their own dedicated layer `DUMMY NAP` (Color 1 - Red) for both the block enclosure and text attributes. Drafters can toggle, freeze, or isolate Dummy NAPs independently from Proposed NAPs in AutoCAD.
- **Port-Free Dummy NAP Enclosure Stencil**: Updated the official Globe Dummy NAP stencil block (`Dummy NAP`) to remove all 4 internal horizontal port lines and the internal mounting triangle, rendering a clean outer D-enclosure outline (top, left, bottom frame lines and dome ellipse) strictly matching drafting requirements.
- **Strict KMZ Folder Classification**:
  - Proposed NAPs must strictly reside inside the `PROPOSED NAP` folder in the KMZ (`isProposedNapFolder`).
  - Dummy NAPs must strictly reside inside the `DUMMY NAP` folder in the KMZ (`isDummyNapFolder`).
  - Non-NAP entities (e.g. node site OLT/POI or closures in root/carrier folders) are separated and not misclassified as NAPs.
- **Preserved `NAP AUGMENT` Line 2 Tag**: Line 1 (`MHTYPE`) displays the full Dummy NAP ID (e.g. `MIN4026_C01_D01`) and Line 2 (`MHNO`) displays `"NAP AUGMENT"` on layer `DUMMY NAP` (Color 1 - Red).
- **AutoCAD DWG Full Compatibility**: Clean conversion via `accoreconsole.exe` with zero errors and proper block symbol table indexing.

---

## [2.2.1] - 2026-09-16

### 🏷️ Globe Dummy NAP Full Stencil & ID Formatting Standard
- **Automated Identifier Hierarchy**: Automatically expands short Dummy NAP placemark names (`D1`, `D2`, `DUMMY-1`) into full Globe standard project identifiers (e.g. `MIN4026_C01_D01`), accurately referencing the project prefix and feeder/cable code (`C01`) as specified in the official Globe template (`NAP STENCILS.dxf`).
- **Complete Globe NAP Enclosure Graphic Stencil**: Renders the complete official Globe NAP graphic stencil (outer enclosure box, dome ellipse, mounting bracket triangle, and 4 horizontal port lines) on layer `NEW NAP` (Color 1 - Red) for Dummy NAPs, matching Proposed NAPs instead of rendering only isolated floating text.
- **Synchronized Attribute Tags**: Formats Line 1 (`MHTYPE`) to the full Dummy NAP identifier (e.g. `MIN4026_C01_D01`) and Line 2 (`MHNO`) to `"NAP AUGMENT"` on layer `p-mh` (Color 1 - Red, text style `BOLD`, height 1.65).
- **Interactive Map Tooltip Parity**: Leaflet map preview tooltips and metadata popups now display the complete formatted Dummy NAP ID and port specifications.

---

## [2.2.0] - 2026-09-16

### 🛣️ Smart Pole & Aerial Cable Corridor Road Generation
- **Spatial Corridor Filtering**: OSM road extraction now specifically focuses on the roads where surveyed poles and aerial cable lines are located, using geometric perpendicular and segment-to-segment distance calculations in metric UTM projection.
- **Background & Parallel Road Elimination**: Automatically filters out and discards extraneous neighborhood streets, parallel avenues, and distant cross-roads (outside 35m corridor buffer) that are not part of the FTTH design route.
- **Route Extent Clipping & Clean Continuity**: Automatically trims and clips long highways or extended roads to the surveyed project route extent, producing smooth continuous centerlines and dual-curb road boundaries.
- **Synchronized DXF Geofencing**: Updated `createPoleGeofence` and `segmentInsideGeofence` so that generated CAD road entities (`ROAD_CENTERLINES` and `ROAD_BOUNDARIES`) strictly reflect the pole and aerial cable corridor.
- **Clear User Messaging**: The road fetch status notification now clearly reports how many design route roads were added and confirms that unrelated background roads were eliminated.

---

## [2.1.0] - 2026-09-08

### 🌐 High-Level Design (HLD) NAP & Stencil Converter
- **Dedicated HLD Converter Mode**: Added a secondary dedicated module for processing High-Level Design (HLD) KMZ/KML files alongside the existing Pole Survey Converter.
- **Automated KML Placemark Parsing**: Extracts and classifies Proposed NAPs (`MIN4026_L901_N01`, etc.), Dummy NAPs (`D1`), Splitter specifications, and Feeder/Distribution routes directly from Google Earth folders (`PROPOSED NAP`, `DUMMY NAP`, etc.).
- **Official Globe Telecom NAP Stencil Integration**:
  - Fully integrated geometry and attribute specifications from the official Globe stencil (`NAP STENCILS.dxf`):
    - **Enclosure & Frame**: 3 outer frame lines on layer `NEW NAP` (Color 1 - Red, Linetype `Continuous`).
    - **Dome Ellipse**: Major axis radius $3.7034$, axis ratio $0.6903$, parameter sweep $4.8964 \to 7.6700$ on layer `NEW NAP`.
    - **Mounting Bracket**: 4-vertex internal mounting triangle on layer `NEW NAP`.
    - **Output Ports**: 4 horizontal port lines on layer `NEW NAP`.
    - **Line 1 Tag (`MHTYPE`)**: Displays NAP Identifier (e.g. `MIN4026_L901_N01`) on layer `p-mh` (Color 1 - Red, Text Style `BOLD`, Height $1.65$, Justification `Center-Middle`).
    - **Line 2 Tag (`MHNO`)**: Locked to **`"NAP AUGMENT"`** across all proposed NAPs strictly matching official Globe engineering standards.
    - **Dummy NAP Block**: Configured as `Dummy NAP` with Line 1 = `"NAP AUGMENT"` and Line 2 = Dummy Identifier (e.g. `D1`).
- **Streamlined Telco Provider Switcher**:
  - 🔵 **Globe Telecom (Official Stencil)** — Active default provider.
  - 🔴 **PLDT / Smart Standard** — Optional provider standard for PLDT HLDs.
  - Removed separate Converge option to eliminate telco standard ambiguity.

---

### 📏 Aerial Route Cable Span Measurements (Pole Survey Converter)
- **Strict Route-Based Measurement**: Span distances between poles are now calculated strictly from the surveyed aerial cable route geometry (no synthetic/interpolated spans).
- **$+2\text{m}$ Length Allowance**: Automatically adds a $+2\text{m}$ engineering allowance per span for sag, slack, and pole attachment drop.
- **1-Decimal Precision**: Formatted all span length dimension text annotations to exactly 1 decimal place (e.g. `42.5m`).
- **Visibility Fix**: Resolved span text rendering and layer assignment on layer `SPAN`.
- **Zero Regression**: 100% preservation and isolation of the Pole & Road Survey converter functionality, styles, and templates.

---

### 🛠️ AutoCAD Core Console (`accoreconsole.exe`) DXF Compatibility Fixes
- **Fixed DXF Subclass Separator Hierarchy**:
  - Removed duplicate `100 AcDbText` subclass markers immediately preceding `100 AcDbAttributeDefinition` and `100 AcDbAttribute`.
  - Resolved AutoCAD error: `Class separator for class AcDbAttributeDefinition expected. Invalid or incomplete DXF input -- drawing discarded`.
- **Synchronized `BLOCK_RECORD` Symbol Tables (1-to-1 Parity)**:
  - Enforced strict 1-to-1 parity between the `TABLE: BLOCK_RECORD` symbol table and the `BLOCKS` section.
  - Registered `GLOBE NAP PROPOSED` in `BLOCK_RECORD` and purged obsolete uninstantiated block records.
  - Resolved AutoCAD errors: `Invalid Block Name` and `Block was not defined`.
- **Registered Text Styles**:
  - Added `BOLD` (`swisscbo.ttf` / `Swis721 BdCnOul BT`) and `SIMPLEX` (`simplex.shx`) entries in `TABLE: STYLE`.
- **End-to-End Automated Verification**:
  - Successfully verified automated conversion of `MIN4026_HLD.kmz` to native AutoCAD 2018/2027 `.dwg` using AutoCAD `accoreconsole.exe`.

---

### 📦 Standalone Binary & Packaging
- **Updated Single Executable**: Compiled and distributed as a self-contained portable Windows application at [`FTTH-KMZ-to-CAD.exe`](file:///c:/Users/My%20Pc/OneDrive/Documents/FTTH/FTTH-KMZ-to-CAD.exe) (33.35 MB).
- **Embedded Assets**: Automatically bundles all stencil and template files (`NAP STENCILS.dxf`, `Stencil Template.dwg`, `PLDT Stencil template.dxf`) into the application payload.
