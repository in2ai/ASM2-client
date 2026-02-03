# LangGraph Backend

## PostgreSQL Setup (Local Development)

LangGraph requires PostgreSQL for checkpointing (storing conversation state).

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
