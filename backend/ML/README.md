# ML pipeline

Run the notebooks in order, from inside this folder (`backend/ML/`).

| Notebook | What it does | Writes |
|---|---|---|
| `01_Data_Loading.ipynb` | Loads and inspects the raw data | (unchanged) |
| `02_EDA.ipynb` | Exploratory analysis | nothing |
| `03_OutlierDetection.ipynb` | IQR / z-score checks; decides to **keep all rows** | nothing |
| `04_DataSplit.ipynb` | One test split + 5 CV folds, **stratified by curing age** | `data/splits.csv` |
| `05_Model.ipynb` | Compare, constrain, tune, select, test, sanity-check, save | `models/concrete_strength_model_v2.joblib`, `models/model_comparison_v2.csv`, `models/final_metrics_v2.json` |

`features.py` holds the feature engineering (log age, water/binder, ...). The saved pipeline starts with
`ConcreteFeatures`, so the model takes the 8 raw app inputs. Import it as `ML.features` (with
`backend/` on `sys.path`) so the pickled pipeline also loads from the app, which runs inside `backend/`.

## Key decisions
- **Split by curing age.** Rows are split at random (80/20, then 5 CV folds), stratified by age so every
  age has the same share everywhere. Rare ages are merged into the nearest common one (1→3, 120→100,
  360→365). A mix can be in train at one age and in test at another, so the test score means
  "known mix, new age". `05_Model` also reports grouped-by-mix CV as context for completely new designs.
- **No outlier removal.** The flagged rows are real high-performance or edge-of-range mixes.
- **Physics monotonic constraints.** Every model column containing age, cement or water is constrained, so
  strength is *guaranteed* to rise with age and cement and fall with water. That is why only
  water/binder, water/cement and total binder are used as ratios: SCM fraction, SP/binder and
  aggregate/binder contain cement but have no safe direction, and with them adding cement lowered strength
  in about 7 of 10 mixes. Costs a few thousandths of R².
- **√strength target.** The model learns √strength and the output is clipped at 0 and squared, so strength
  can't be negative (with a plain target, low-cement mixes only tested at 28 days got about −10 MPa at 3 days).
- **Final model is refit on all rows** after evaluation; the reported metrics come from the held-out test
  set and CV.

## Using the v2 model in the app
The app still loads `models/concrete_strength_model.joblib` (produced by `archive/04_Modeling.ipynb`).
To switch, set `MODEL_FILE = "concrete_strength_model_v2.joblib"` in `backend/model_service.py`.

`archive/` keeps the earlier notebooks: the old row-split modelling notebook and the first versions of 03-05.
