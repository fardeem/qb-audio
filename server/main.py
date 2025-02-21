from typing import Union
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

import json
from pathlib import Path
from pydantic import BaseModel
from typing import Dict, Optional

class Item(BaseModel):
    wer: float
    forced_approved: bool
    matches: bool
    english_transcription: str

class ItemStore:
    def __init__(self, storage_file: str = "items.json"):
        self.storage_file = Path(storage_file)
        self.items: Dict[str, Item] = self._load()

    def _load(self) -> Dict[str, Item]:
        """Load items from disk"""
        if self.storage_file.exists():
            with open(self.storage_file) as f:
                data = json.load(f)
                return {k: Item(**v) for k, v in data.items()}
        return {}

    def _save(self):
        """Save items to disk"""
        with open(self.storage_file, "w") as f:
            json.dump({k: v.dict() for k, v in self.items.items()}, f, indent=2)

    def get(self, item_id: str) -> Optional[Item]:
        """Get an item by ID"""
        return self.items.get(item_id)

    def set(self, item_id: str, item: Item):
        """Set an item by ID"""
        self.items[item_id] = item
        self._save()

    def delete(self, item_id: str) -> bool:
        """Delete an item by ID. Returns True if item existed"""
        if item_id in self.items:
            del self.items[item_id]
            self._save()
            return True
        return False

    def list_all(self) -> Dict[str, Item]:
        """Get all items"""
        return self.items

# Initialize the store
item_store = ItemStore()




# Mount the static directory
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
def read_root():
    return {"Hello": "World"}

@app.get("/ayahs")
def list_items():
    import os
    from pathlib import Path

    # Get all files in combined directory
    combined_path = Path("static/combined")
    results = []
    
    if combined_path.exists():
        for root, _, files in os.walk(combined_path):
            for file in files:
                if file.endswith('.wav'):
                    # Get relative path from static directory
                    rel_path = os.path.relpath(os.path.join(root, file), 'static')
                    item_id = os.path.splitext(file)[0]
                    
                    # Construct paths for arabic and english files
                    arabic_path = Path("static/arabic") / rel_path[9:]  # Remove 'combined/' prefix
                    english_path = Path("static/english") / rel_path[9:]
                    
                    # Get stored item data
                    stored_item = item_store.get(item_id)
                    
                    # Construct full URLs with server address
                    result = {
                        "id": item_id,
                        "combined_url": f"http://localhost:8000/static/{rel_path}",
                        "arabic_url": f"http://localhost:8000/static/{os.path.relpath(arabic_path, 'static')}" if arabic_path.exists() else None,
                        "english_url": f"http://localhost:8000/static/{os.path.relpath(english_path, 'static')}" if english_path.exists() else None,
                        "source_translation": None,  # To be implemented later
                        "english_transcription": stored_item.english_transcription if stored_item else None,
                        "matches": stored_item.matches if stored_item else None,
                        "wer": stored_item.wer if stored_item else None,
                        "forced_approved": stored_item.forced_approved if stored_item else None
                    }

                    results.append(result)
    
    return results
