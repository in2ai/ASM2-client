from src.connectors.drive import GoogleDriveSource
from src.connectors.dropbox import DropboxSource

# List of all available sources by name

SOURCES = {
    GoogleDriveSource.name: GoogleDriveSource,
    DropboxSource.name: DropboxSource
}