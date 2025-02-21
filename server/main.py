from typing import Union
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydub import AudioSegment, silence
import whisper
from langdetect import detect
import re
import os
from pathlib import Path
from src import audio_processor
import asyncio

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
from pydantic import BaseModel
from typing import Dict, Optional

# import SSE event helpers
from src.events import router as events_router, send_event

# Create a semaphore that limits concurrency
split_semaphore = asyncio.Semaphore(2)  # e.g. allow up to 2

app.include_router(events_router)

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

# Initialize Whisper model globally
model = whisper.load_model("large-v3-turbo")

def preprocess_text(text):
    text = text.lower()
    text = re.sub(r'[^\w\s]', '', text)
    text = ' '.join(text.split())
    return text

def get_arabic_end_time(audio_path):
    result = model.transcribe(
        audio_path,
        language="ar",
        task="transcribe",
        fp16=False,
        initial_prompt="Contains arabic followed by english translation. For example: أن ناس The people"
    )
    
    arabic_segments = []
    for seg in result["segments"]:
        try:
            if detect(seg["text"].strip()) == 'ar':
                arabic_segments.append(seg)
        except:
            continue
    
    return arabic_segments[-1]["end"] if arabic_segments else 5.0

def split_audio(audio_path, output_dir_arabic, output_dir_english):
    """Generic function to split an audio file into Arabic and English parts"""
    # Get target split time from Whisper
    target_split_time = get_arabic_end_time(audio_path)
    
    # Load the audio
    audio = AudioSegment.from_file(audio_path)
    filename = Path(audio_path).stem
    
    # Detect silences
    silence_threshold = -50
    min_silence_len = 50
    silences = silence.detect_silence(
        audio,
        min_silence_len=min_silence_len,
        silence_thresh=silence_threshold
    )

    # Find best split point
    target_ms = target_split_time * 1000
    best_gap_start = None
    smallest_time_diff = float('inf')

    for start_ms, end_ms in silences:
        time_diff = abs(start_ms - target_ms)
        if time_diff < smallest_time_diff:
            smallest_time_diff = time_diff
            best_gap_start = start_ms + (end_ms - start_ms) * (5/6)

    if best_gap_start is None:
        raise ValueError("No suitable split point found")

    # Split and save
    first_part = audio[:best_gap_start]
    second_part = audio[best_gap_start:]
    
    arabic_path = output_dir_arabic / f"{filename}.wav"
    english_path = output_dir_english / f"{filename}.wav"
    
    first_part.export(str(arabic_path), format="wav")
    second_part.export(str(english_path), format="wav")
    
    # Transcribe English part
    result = model.transcribe(
        str(english_path),
        language="en",
        fp16=False
    )
    
    return {
        "english_transcription": result["text"],
        "split_time": best_gap_start / 1000  # Convert to seconds
    }

@app.post("/split/{item_id}")
async def split_item(item_id: str, background_tasks: BackgroundTasks):
    """
    Schedules a background job to split a specific audio file.
    """
    background_tasks.add_task(_process_split_item, item_id)
    return {"status": "scheduled"}

async def _process_split_item(item_id: str):
    """
    The actual splitting logic, wrapped in concurrency control and SSE push on completion.
    """
    async with split_semaphore:
        try:
            # Construct paths
            combined_path = Path("static/combined")
            arabic_path = Path("static/arabic")
            english_path = Path("static/english")
            
            print(f"Processing item_id: {item_id}")
            print(f"Looking in: {combined_path}")
            
            # Find the audio file
            audio_file = None
            for root, _, files in os.walk(combined_path):
                for file in files:
                    base_name = os.path.splitext(file)[0]
                    if base_name == item_id and file.endswith('.wav'):
                        audio_file = Path(root) / file
                        print(f"Found matching file: {audio_file}")
                        break
            
            if not audio_file:
                print(f"No matching file found for {item_id}")
                await send_event("split_failed", {
                    "item_id": item_id,
                    "error": "Audio file not found"
                })
                return

            print(f"Processing file: {audio_file}")
            # Get subfolder from audio path
            subfolder = audio_file.parent.name
            output_dir_arabic = arabic_path / subfolder
            output_dir_english = english_path / subfolder
            
            print(f"Output directories:")
            print(f"  Arabic: {output_dir_arabic}")
            print(f"  English: {output_dir_english}")

            # Create subfolder directories
            output_dir_arabic.mkdir(parents=True, exist_ok=True)
            output_dir_english.mkdir(parents=True, exist_ok=True)

            # Perform the split, get the result
            print(f"Calling audio_processor.split_audio with:")
            print(f"  input: {str(audio_file)}")
            print(f"  arabic_out: {output_dir_arabic}")
            print(f"  english_out: {output_dir_english}")
            result = audio_processor.split_audio(str(audio_file), output_dir_arabic, output_dir_english)

            # Update or create item in item_store
            stored_item = item_store.get(item_id)
            if stored_item:
                stored_item.english_transcription = result["english_transcription"]
                stored_item.wer = result["wer"]
                stored_item.matches = result["matches"]
                item_store.set(item_id, stored_item)
            else:
                new_item = Item(
                    wer=result["wer"],
                    forced_approved=False,
                    matches=result["matches"],
                    english_transcription=result["english_transcription"]
                )
                item_store.set(item_id, new_item)
                
        except Exception as e:
            # If splitting fails, you can also send an event for failure
            await send_event("split_failed", {
                "item_id": item_id,
                "error": str(e)
            })
            return
        
        # Once the job completes successfully, send an SSE event
        await send_event("split_finished", {"item_id": item_id})

# Mount the static directory
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def read_root():
    return {"Hello": "World"}

@app.get("/ayahs")
def list_items():
    # Get all files in combined directory
    print("Listing items")
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
                    
                    # Get source translation
                    source_translation = audio_processor.get_source_translation(item_id)
                    
                    # Construct full URLs with server address
                    result = {
                        "id": item_id,
                        "combined_url": f"http://localhost:8000/static/{rel_path}",
                        "arabic_url": f"http://localhost:8000/static/{os.path.relpath(arabic_path, 'static')}" if arabic_path.exists() else None,
                        "english_url": f"http://localhost:8000/static/{os.path.relpath(english_path, 'static')}" if english_path.exists() else None,
                        "source_translation": source_translation,
                        "english_transcription": stored_item.english_transcription if stored_item else None,
                        "matches": (stored_item.matches or stored_item.wer < 0.15 or stored_item.forced_approved) if stored_item else None,
                        "wer": stored_item.wer if stored_item else None,
                        "forced_approved": stored_item.forced_approved if stored_item else None
                    }

                    results.append(result)
    
    return results

@app.post("/approve/{item_id}")
def force_approve(item_id: str):
    # Get stored item data
    stored_item = item_store.get(item_id)
    
    if not stored_item:
        # Create new item if it doesn't exist
        stored_item = Item(
            wer=0.0,  # Default values
            forced_approved=True,
            matches=False,
            english_transcription=""
        )
        item_store.set(item_id, stored_item)  # Use set() instead of dict assignment
    else:
        # Update existing item
        stored_item.forced_approved = True
        item_store.set(item_id, stored_item)
    
    return {"status": "success"}

class CustomSplitRequest(BaseModel):
    split_time_ms: float

@app.post("/split_custom/{item_id}")
def split_item_custom(item_id: str, request: CustomSplitRequest):
    """Split a specific audio file at the given millisecond timestamp."""
    combined_path = Path("static/combined")
    arabic_path = Path("static/arabic")
    english_path = Path("static/english")

    # Ensure output directories exist
    arabic_path.mkdir(parents=True, exist_ok=True)
    english_path.mkdir(parents=True, exist_ok=True)

    # Find the audio file
    audio_file = None
    for root, _, files in os.walk(combined_path):
        for file in files:
            # Match exact ID before the extension
            base_name = os.path.splitext(file)[0]
            if base_name == item_id and file.endswith('.wav'):
                audio_file = Path(root) / file
                break

    print(f"Audio file: {audio_file}")

    if not audio_file:
        raise HTTPException(status_code=404, detail="Audio file not found")

    print(f"Audio file exists: {audio_file.exists()}")

    try:
        # Split using custom timestamp
        subfolder = audio_file.parent.name
        output_dir_arabic = arabic_path / subfolder
        output_dir_english = english_path / subfolder
        output_dir_arabic.mkdir(parents=True, exist_ok=True)
        output_dir_english.mkdir(parents=True, exist_ok=True)
        
        result = audio_processor.split_audio_custom(
            str(audio_file), 
            output_dir_arabic, 
            output_dir_english, 
            request.split_time_ms
        )
        
        # Update or insert into item store
        stored_item = item_store.get(item_id)
        if stored_item:
            stored_item.english_transcription = result["english_transcription"]
            stored_item.wer = result["wer"]
            stored_item.matches = result["matches"]
            item_store.set(item_id, stored_item)
        else:
            new_item = Item(
                wer=result["wer"],
                forced_approved=False,
                matches=result["matches"],
                english_transcription=result["english_transcription"]
            )
            item_store.set(item_id, new_item)
        
        return {
            "status": "success",
            "split_time": result["split_time"],
            "english_transcription": result["english_transcription"],
            "wer": result["wer"],
            "matches": result["matches"],
            "source_translation": result["source_translation"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


