# FTTH KMZ-to-CAD Converter & LLD Automator

A specialized GIS-to-CAD conversion suite for Outside Plant (OSP) Fiber-to-the-Home (FTTH) engineering. It automatically converts surveyed poles, Network Access Points (NAPs), and aerial cable spans from Google Earth KMZ/KML files into standardized AutoCAD DXF/DWG formats.

---

## Key Features

### 1. Pole Survey Converter
* **Automated Pole Positioning & Collision Avoidance**: Automatically clears poles from road carriageways and aligns pole data stencils outside road boundary curbs.
* **Standard Telco Stencils**: Generates native AutoCAD block inserts with standard attribute tags (`PTPOLE`, `EPOLE`, `P-POLE`, etc.) for Globe Telecom, PLDT, and regional power utilities (DLPC, Meralco, Cotelco, etc.).
* **Aerial FOC Cable Routing (`P-AERIAL_FOC`)**: Auto-routes aerial cables along the road corridor with configurable road inset offsets (3m–5m) and places vertices facing each surveyed pole.
* **Span Measurement Layer (`SPAN`)**: Measures surveyed span lengths formatted to 1 decimal place with configurable allowance (+2.0m).
* **Automated Grid Paging Boxes**: Generates standardized CAD keymap grid paging frames with sheet sequence numbers (`#`).
* **Element Toggles**: Easily toggle on/off individual CAD layers (FOC Cable, Grid Paging Box, Pole Stencils, Spans, Road Boundaries, Demand Polygons).

### 2. HLD NAP Converter
* **Dual-Line NAP Stencils**: Produces standard telco attribute blocks:
  * **Line 1 (`MHTYPE`)**: Clean NAP identifier (e.g., `DVO_067_L907_N01`).
  * **Line 2 (`MHNO`)**: `NAP AUGMENT` (for proposed) or `SOURCE EXISTING NAP` (for existing).
* **Multi-File / LLD Support**: Drag and drop both HLD KMZ and Pole Survey KMZ together to generate pole-by-pole LLD cable paths.
* **Automatic Feeder / Distribution Cable Linking**: Connects OLT, FOC closures, dummy NAPs, and distribution loops.

---

## Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) (version 18 or higher)
* [Git](https://git-scm.com/)

### Installation & Local Development
```bash
# Clone the repository
git clone https://github.com/<your-username>/<your-repo-name>.git
cd <your-repo-name>

# Install dependencies
npm install

# Start local development server
npm run dev
```
Open your browser at `http://localhost:5173`.

### Production Build
```bash
# Compile TypeScript and bundle with Vite
npm run build
```

### Packaging Windows Standalone Executable (.exe)
```powershell
# Compiles a single-file portable Windows executable
npm run package
```
The output executable will be created at `FTTH-KMZ-to-CAD.exe` and `release/FTTH-KMZ-to-CAD.exe`.

---

## Deployment to GitHub Pages

This project includes an automated GitHub Actions workflow (`.github/workflows/deploy.yml`).
1. Push this repository to GitHub.
2. In your repository on GitHub, navigate to **Settings** > **Pages**.
3. Under **Build and deployment** > **Source**, select **GitHub Actions**.
4. Every push to `main` or `master` will automatically build and publish the live web app.
