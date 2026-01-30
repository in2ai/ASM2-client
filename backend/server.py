from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from src.metrics.metrics import *
from src.metrics.connection import *

from src.connectors.vdb_file import *
from src.connectors.source import *
from src.connectors.store import *
from src.connectors.drive import *
from src.connectors.search import *

from src.utils.nlp import *
from src.utils.topic import *

app = FastAPI(title="ASM2")


@app.get("/")
async def root():
    return {"status": "ok"}
