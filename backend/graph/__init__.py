import sys
from pathlib import Path

# Bare imports inside this package (e.g. `from model import ...`)
# need the graph directory on sys.path.
_graph_dir = str(Path(__file__).resolve().parent)
if _graph_dir not in sys.path:
    sys.path.insert(0, _graph_dir)
