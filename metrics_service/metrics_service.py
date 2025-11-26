from fastapi import FastAPI, HTTPException, Request

from src.metrics import mean_metric, top_k_search_terms, mean_session_length

app = FastAPI()

@app.get("/mean_metric")
def get_metric(request: Request):
    metric = request.query_params.get("metric")
    user_id = request.query_params.get("user_id")
    user_role = request.query_params.get("user_role")
    days = request.query_params.get("days")

    if metric is None:
        raise HTTPException(status_code=400, detail="you must include the metric param")

    if days is not None:
        try:
            days = int(days)

        except ValueError:
            raise HTTPException(status_code=400, detail="days must be an integer")

    result = mean_metric(metric, user_id=user_id, user_role=user_role, days=days)

    return {"result": result}


@app.get("/top_search_terms")
def read_top_words(request: Request):
    user_id = request.query_params.get("user_id")
    user_role = request.query_params.get("user_role")
    days = request.query_params.get("days")
    k = request.query_params.get("k")

    if user_id is not None and user_role is not None:
        raise HTTPException(status_code=400, detail="Provide either user_id or user_role, not both")

    if days is not None:
        try:
            days = int(days)

        except ValueError:
            raise HTTPException(status_code=400, detail="days must be an integer")

    if k is not None:
        try:
            k = int(k)

        except ValueError:
            raise HTTPException(status_code=400, detail="k must be an integer")

    result = top_k_search_terms(k=k, days=days, user_id=user_id, user_role=user_role)
    return {"result": result}


@app.get("/mean_session_length")
def read_mean_session_length(request: Request):
    days = request.query_params.get("days")
    user_role = request.query_params.get("user_role")
    user_id = request.query_params.get("user_id")

    if days is not None:
        try:
            days = int(days)
        except ValueError:
            raise HTTPException(status_code=400, detail="days must be an integer")

    try:
        result = mean_session_length(10, days=days, user_role=user_role, user_id=user_id)

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"result": result}