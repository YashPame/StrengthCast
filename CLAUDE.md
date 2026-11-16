# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**StrengthCast: Machine Learning-Based Concrete Compressive Strength Prediction**, with the tagline "Know the strength before you pour." Use this branding in user-facing text: README, UI header, page title and API title. It's a decision-support tool for preliminary concrete mix design and quality assessment. It predicts compressive strength (MPa) from mix composition and curing age. Planned user-facing features:

- Enter mix parameters and get a predicted strength in MPa
- Compare alternative mix designs side by side
- Sensitivity analysis: how changing one ingredient affects predicted strength

Predictions supplement laboratory compression testing and do not replace it. User-facing output should say so.

## Current state

There is no git repo yet (`.gitignore` is ready: it excludes `frontend/dist`, `node_modules`, caches and venvs, and keeps data and models). `requirements.txt` (pinned, includes lightgbm for the v2 model) and `frontend/package.json` are the only dependency manifests.

Layout (project root): `backend/` (FastAPI code, plus `backend/Data/` and `backend/ML/`), `frontend/`, `docs/images/` (README screenshots + demo GIF). There is no automated test suite (the old `tests/` folder was removed on request).

- `backend/Data/concrete_data.csv`: raw dataset (do not overwrite)
- `backend/Data/concrete_data_cleaned.csv`: output of `01_Data_Loading.ipynb`, with columns renamed to snake_case. Later steps should read this file.
- `backend/ML/models/concrete_strength_model.joblib`: output of `04_Modeling.ipynb`. It's a dict with these keys:
  - `pipeline`: StandardScaler + tuned XGBoost; takes raw, unscaled features
  - `features`: required column order
  - `feature_ranges`: training min/max per feature, for flagging extrapolation
  - `metrics`, `best_params`, `split`
  - `model_comparison.csv` and `final_metrics.json` sit alongside it.
- `backend/ML/`: numbered Jupyter notebooks (`01_Data_Loading.ipynb`, ...) that form the pipeline in order. They use paths relative to `ML/` (`../Data/...`), which still resolve because `ML/` and `Data/` are siblings inside `backend/`.

## Application (project root)

This is the web UI. A FastAPI backend serves both the JSON API and the static frontend from one process.

- `backend/model_service.py` holds all model logic:
  - `backend/` is not a package: the server runs from inside it (`uvicorn app:app`), so `app.py` uses `from model_service import ...`. Scripts that import the backend from elsewhere must put `backend/` on `sys.path`
  - loads the bundle straight from `backend/ML/models/`; `MODEL_FILE` at the top of the file picks which one (no copying after retraining)
  - runs predict, age-curve and sensitivity
  - checks inputs against training ranges and the 2200–2600 kg/m³ density window
  - defines the presets (real 28-day mixes from the dataset)
- `backend/app.py` holds the pydantic `Mix` model (one flat body: 7 ingredients + `age`) and the routes (`/api/meta`, `/api/predict`, `/api/age-curve`, `/api/sensitivity`, `/api/health`). It serves the built `frontend/dist` at `/`.
- `frontend/` is React 18 + Vite (plain JSX). The only libraries are react and react-dom. Charts and the animation are hand-written SVG. The design was ported from the earlier vanilla-JS version in `ApplicationOld/`.
  - `src/App.jsx`: state, the mix & test flow, test log, tabs, and warnings (client warnings while editing; server warnings after a test, until the next edit)
  - `src/lib/stage.js`: the imperative `Stage` class (charge → mix → cast → cure → test). `components/StageView.jsx` wraps it: React renders an empty `<svg id="stage">` and the class owns everything inside it. During the Charge step it flies clones of the panel's ingredient icons into the drum, so `MixPanel` passes the icon elements up through `iconRefs`.
  - `components/`: `MixPanel`, `IngredientIcon` (each icon has a `.mat` group scaled by amount), `TestLog` (cards + comparison table), `Analysis` (age and sensitivity tabs), `charts.jsx` (LineChart/BarChart sized with ResizeObserver), `Tooltip`
  - `src/styles.css` was copied as-is from the old app, and the components rely on its class names (`.stage-card`, `.panel-card`, `.drawer`, `.flyer`, …).
  - FastAPI serves `frontend/dist`, so run `npm run build` after frontend changes, then restart uvicorn if `dist` did not exist when it started. Alternatively use `npm run dev` (port 5173, proxies `/api` to 8000).
- The prediction is fetched **before** the animation starts; the animation only reveals it. Failure load in kN = MPa × 22.5 (150 mm cube).
- Slider limits, presets and ages all come from `/api/meta`. Don't hard-code them in JS.
- Age 1 day is left out of the UI and curves on purpose (only 2 training rows; the model treats it as 3 days).

## Environment & commands

A shared virtualenv lives outside the project at `../python-env` (Python 3.10; pandas, jupyter, scikit-learn stack available).

```bash
source ../python-env/Scripts/activate          # Git Bash
..\python-env\Scripts\Activate.ps1             # PowerShell
# Run a notebook headlessly (from backend/ML/), using the venv's kernel:
../../../python-env/Scripts/python.exe -c "import nbformat; from nbclient import NotebookClient; f='02_EDA.ipynb'; nb=nbformat.read(f, as_version=4); NotebookClient(nb, timeout=600, kernel_name='python3', resources={'metadata': {'path': '.'}}).execute(); nbformat.write(nb, f)"
```

Application (run from the project root):

```bash
(cd frontend && npm install && npm run build)                            # build UI into frontend/dist
(cd backend && ../../python-env/Scripts/python.exe -m uvicorn app:app --reload)   # http://127.0.0.1:8000
```

The venv does not have `nbconvert`. The `jupyter nbconvert` on PATH comes from the system Python (`C:\python310`), whose kernel lacks matplotlib and seaborn. Don't use it.

## Dataset: `backend/Data/concrete_data.csv`

1030 rows × 9 columns, with no missing values and **25 exact duplicate rows** (deduplicate before splitting so the same row can't land in both train and test). It matches the UCI Concrete Compressive Strength dataset, so the standard units apply: ingredients are in kg per m³ of mix, age is in days and strength is in MPa.

| Column | Range |
|---|---|
| `cement` | 102 – 540 |
| `blast_furnace_slag` | 0 – 359.4 |
| `fly_ash` | 0 – 200.1 |
| `water` | 121.75 – 247 |
| `superplasticizer` | 0 – 32.2 |
| `coarse_aggregate` | 801 – 1145 |
| `fine_aggregate` | 594 – 992.6 |
| `age` | 1 – 365 (14 distinct values: 1, 3, 7, 14, 28, 56, 90, 91, 100, 120, 180, 270, 360, 365) |
| `compressive_strength` | 2.33 – 82.60 (**target**) |

Modeling notes:
- Many rows share the same mix and differ only in `age`. A random row split leaks mix information into the test set, so consider a grouped split by mix (all ingredient columns) when estimating generalization to *new* mix designs.
- Strength depends strongly and non-linearly on `age` (fast early gain, then a plateau). Use features such as `log(age)` and the water-to-binder ratio (`water / (cement + slag + fly_ash)`).
- EDA findings (`02_EDA.ipynb`): water/binder ratio is the strongest single feature (r ≈ −0.62 overall, −0.77 at 28 days), stronger than w/c or raw cement. The raw ingredients have VIF 5–7.5. `total_binder` is an exact linear combination of cement + slag + fly ash, so a linear model must not include all four. Replacing `cement` and `water` with one ratio brings every VIF under 3.
- Valid inputs for prediction, comparison and sensitivity analysis are bounded by the ranges above. Flag inputs outside them as extrapolation instead of predicting silently.
