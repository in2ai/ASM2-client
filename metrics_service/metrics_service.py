from fastapi import FastAPI, HTTPException, Request

from src.metrics import mean_metric, top_k_search_terms, mean_session_length

app = FastAPI()

@app.get("/mean_metric")
def get_metric(request: Request):
    metric = request.query_params.get("metric")
    user_id = request.query_params.get("user_id")
    user_role = request.query_params.get("user_role")
    start_date = request.query_params.get("start_date")
    end_date = request.query_params.get("end_date")

    if metric is None:
        raise HTTPException(status_code=400, detail="you must include the metric param")

    result = mean_metric(metric, user_id=user_id, user_role=user_role, start_date=start_date, end_date=end_date)

    return {"result": result}


@app.get("/top_search_terms")
def read_top_words(request: Request):
    user_id = request.query_params.get("user_id")
    user_role = request.query_params.get("user_role")
    start_date = request.query_params.get("start_date")
    end_date = request.query_params.get("end_date")
    k = request.query_params.get("k")

    if user_id is not None and user_role is not None:
        raise HTTPException(status_code=400, detail="Provide either user_id or user_role, not both")

    if k is not None:
        try:
            k = int(k)
        except ValueError:
            raise HTTPException(status_code=400, detail="k must be an integer")
    else:
        k = 10

    result = top_k_search_terms(k=k, start_date=start_date, end_date=end_date, user_id=user_id, user_role=user_role)
    return {"result": result}


@app.get("/mean_session_length")
def read_mean_session_length(request: Request):
    start_date = request.query_params.get("start_date")
    end_date = request.query_params.get("end_date")
    user_role = request.query_params.get("user_role")
    user_id = request.query_params.get("user_id")

    try:
        # using default session_gap_minutes=10 as before
        result = mean_session_length(10, start_date=start_date, end_date=end_date, user_role=user_role, user_id=user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"result": result}