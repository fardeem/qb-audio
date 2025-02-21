from pathlib import Path
import whisper
from pydub import AudioSegment, silence
from langdetect import detect
import re
import json
import jiwer
from num2words import num2words

# Initialize Whisper model globally
model = whisper.load_model("large-v3-turbo")

def preprocess_text(text):
    """Preprocess text for comparison, including number-to-word conversion"""
    text = text.lower()
    
    # Remove common punctuation that might appear between numbers and words
    text = text.replace(".", " ").replace(":", " ")
    
    # Convert numbers to words (e.g., "1" -> "one")
    words = text.split()
    processed_words = []
    for word in words:
        if word.isdigit():
            try:
                word = num2words(int(word))
            except:
                pass
        processed_words.append(word)
    text = ' '.join(processed_words)
    
    # Remove remaining punctuation and extra whitespace
    text = re.sub(r'[^\w\s]', '', text)
    text = ' '.join(text.split())
    return text

# Load Quran data into memory once
with open('./qb.json', 'r', encoding='utf-8') as f:
    qb_data1 = json.load(f)

def get_source_translation(filename):
    """Get the reference translation from qb.json"""
    try:
        # Handle different filename formats
        if "_" not in filename:
            # Single number format (e.g. "114")
            return qb_data1[str(int(filename))]['title']
        else:
            # Surah_ayah format (e.g. "114_1") 
            surah, ayah = filename.split('_')
            surah = str(int(surah))  # Remove leading zeros
            ayah = str(int(ayah))    # Remove leading zeros
            return qb_data1[surah][ayah]
    except Exception as e:
        print(f"Error getting source translation for {filename}: {e}")
        return ""

def matches_translation(english_text: str, source_translation: str) -> bool:
    """Check if the transcribed text matches the reference translation"""
    english_clean = preprocess_text(english_text)
    reference_clean = preprocess_text(source_translation)
    return english_clean == reference_clean

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
    
    # Get source translation
    source_translation = get_source_translation(filename)
    if source_translation is None:
        raise ValueError(f"Could not find source translation for {filename}")
    
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
    
    english_text = result["text"]
    
    # Calculate WER and check if translations match
    clean_reference = preprocess_text(source_translation)
    clean_hypothesis = preprocess_text(english_text)
    wer = jiwer.wer(clean_reference, clean_hypothesis)
    matches = matches_translation(english_text, source_translation)
    
    return {
        "english_transcription": english_text,
        "split_time": best_gap_start / 1000,  # Convert to seconds
        "wer": wer,
        "matches": matches,
        "source_translation": source_translation
    }

def split_audio_custom(audio_path, output_dir_arabic, output_dir_english, custom_split_time_ms):
    """
    Split an audio file into two parts at the given millisecond timestamp.
    Then transcribe the English part, compute WER, compare with source translation, etc.
    """
    print(f"Splitting audio at {custom_split_time_ms}ms")
    audio = AudioSegment.from_file(audio_path)
    filename = Path(audio_path).stem

    # Get source translation
    source_translation = get_source_translation(filename)
    if source_translation is None:
        raise ValueError(f"Could not find source translation for {filename}")

    # Split at custom_split_time_ms
    first_part = audio[:custom_split_time_ms]
    second_part = audio[custom_split_time_ms:]

    # Export resulting files
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
    english_text = result["text"]

    # Calculate WER and check if translations match
    clean_reference = preprocess_text(source_translation)
    clean_hypothesis = preprocess_text(english_text)
    wer = jiwer.wer(clean_reference, clean_hypothesis)
    matches = matches_translation(english_text, source_translation)

    return {
        "english_transcription": english_text,
        "split_time": custom_split_time_ms / 1000.0,  # Convert to seconds
        "wer": wer,
        "matches": matches,
        "source_translation": source_translation
    } 