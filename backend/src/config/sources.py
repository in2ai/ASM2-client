from src.connectors.drive import GoogleDriveSource

# List of all available sources by name

SOURCES = {GoogleDriveSource.name: GoogleDriveSource}

SOURCE_LABELS = {source.name: source.display_name for source in SOURCES.values()}