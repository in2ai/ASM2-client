# LangGraph Backend

## Checkpointing (Local Development)

By default, the graph uses **in-memory** checkpointing for development/tests.
PostgreSQL checkpointing is **optional** and can be added later if you need
durable conversation state.

If you choose PostgreSQL checkpointing, use the steps below.

### Start Container

```bash
docker run -d --name postgres -e POSTGRES_USER=langgraph -e POSTGRES_PASSWORD=langgraph -e POSTGRES_DB=langgraph -p 5432:5432 postgres:16
```

### Connection String

```
postgresql://langgraph:langgraph@localhost:5432/langgraph
```

### Tables (created automatically on first run)

| Table | Purpose |
|-------|---------|
| `checkpoints` | Graph state snapshots |
| `checkpoint_blobs` | Serialized channel data (messages as binary) |
| `checkpoint_writes` | Intermediate writes during node execution |
| `checkpoint_migrations` | Schema versioning |

### Common Commands

```bash
docker stop postgres   # Stop
docker start postgres  # Start again
docker rm -f postgres  # Remove completely
```
