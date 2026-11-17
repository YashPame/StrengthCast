# ML pipeline

Run the notebooks in order, from inside this folder (`backend/ML/`).

| Notebook | What it does | Writes |
|---|---|---|
| `01_Data_Loading.ipynb` | Loads and inspects the raw data | (unchanged) |
| `02_EDA.ipynb` | Exploratory analysis | nothing |
| `03_OutlierDetection.ipynb` | IQR / z-score checks; decides to **keep all rows** | nothing |
| `04_DataSplit.ipynb` | Dedupe → one 80/20 test split + 5 CV folds, **stratified by curing age** → engineered features | `data/splits.csv` |
| `05_Model.ipynb` | Default-param baselines (raw vs engineered) → Optuna on top 3 → physics check → constrained baselines → Optuna on top 3 constrained → test set → recommendation → new-mix (grouped) CV → save (refit on all rows) | `models/concrete_strength_model_v3.joblib` |

`features.py` holds the feature engineering (log age, water/binder, ...). The saved pipeline starts with
`ConcreteFeatures`, so the model takes the 8 raw app inputs. Import it as `ML.features` (with
`backend/` on `sys.path`) so the pickled pipeline also loads from the app, which runs inside `backend/`.

## Results (`05_Model`)

Selected: **LightGBM, tuned, physics-constrained** (`models/concrete_strength_model_v3.joblib`, used by the app).

| | CV R² | CV RMSE | Test R² | Test RMSE | Test MAE | Physics check |
|---|---|---|---|---|---|---|
| LightGBM tuned (unconstrained, most accurate) | 0.931 | 4.21 | 0.953 | 3.41 | 2.36 | fails |
| **LightGBM tuned + constrained (selected)** | **0.928** | **4.35** | **0.944** | **3.73** | **2.53** | **passes** |

- On brand-new mix designs (grouped-by-mix CV, all 1005 rows) the selected model scores R² 0.900, RMSE 5.07 MPa.
  The unconstrained LightGBM scores R² 0.903, RMSE 5.02 MPa on the same check (per-fold RMSE spread about ±0.5 MPa).
  The two are tied on new mixes, so the constrained model costs essentially nothing there.
- Engineered features beat raw features for every model; boosting models (LightGBM, XGBoost, HistGB) lead.
- Optuna improved CV RMSE by 0.25–0.59 MPa over the defaults.
- Constraints cost ~0.14 MPa CV RMSE for the boosting models, but wreck Random Forest / Extra Trees / Decision
  Tree (CV R² 0.68–0.76).
- The top test scores are within ~0.3 MPa of each other (201 rows is noisy), so selection uses CV.

## Key decisions
- **Split by curing age.** Rows are split at random (80/20), stratified by age so every age has the same share
  in train and test; the 5 CV folds (also in `04_DataSplit`) are stratified the same way. Rare ages are merged
  into the nearest common one (1→3, 120→100, 360→365). A mix can be in train at one age and in test at another,
  so the test score means "known mix, new age". For completely new designs, `05_Model` section 6.2 runs
  grouped-by-mix CV: R² 0.900, RMSE 5.07 MPa, MAE 3.59 MPa.
- **No outlier removal.** The flagged rows are real high-performance or edge-of-range mixes.
- **Physics monotonic constraints.** Every model column containing age, cement or water is constrained, so
  strength is *guaranteed* to rise with age and cement and fall with water. That is why only
  water/binder, water/cement and total binder are used as ratios: SCM fraction, SP/binder and
  aggregate/binder contain cement but have no safe direction, and with them adding cement lowered strength
  in about 7 of 10 mixes.
- **Workability is not modelled.** The water constraint means less water always predicts more strength, but a
  real mix that is too dry can't be compacted and gets weaker. The data has no slump column. Every mix below
  w/b 0.28 uses superplasticizer, and only 15 of the 378 mixes without SP go below w/b 0.35. The app
  (`model_service.py`, `frontend/src/lib/mix.js`) therefore warns on w/b < 0.35 with no SP, and on w/b outside 0.235–0.90.
- **√strength target.** The model learns √strength and the output is clipped at 0 and squared, so strength
  can't be negative (with a plain target, low-cement mixes only tested at 28 days got about −10 MPa at 3 days).
- **Final model is refit on all rows** after evaluation; the reported metrics come from the held-out test
  set and CV.

## Model used by the app
`backend/model_service.py` loads `MODEL_FILE = "concrete_strength_model_v3.joblib"` from `models/`.
The older bundles (`concrete_strength_model.joblib`, `_v2`) are kept; point `MODEL_FILE` at one to switch back.

`archive/` keeps the earlier notebooks: the old row-split modelling notebook (`04_Modeling`), the first versions
of 03-05, and `05_Model_v2` (which produced the v2 model).
