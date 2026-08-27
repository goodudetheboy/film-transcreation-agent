"""
Test: does the captioning technique work for gesture/body-language detection
on a real video clip.

Setup:
    pip install google-genai google-cloud-storage pydantic
    gcloud auth application-default login
    gcloud config set project silent-scholar-505618-u6
"""

from google import genai
from google.genai import types
from google.cloud import storage
import pydantic
import os

PROJECT_ID = "silent-scholar-505618-u6"
LOCATION = "us-central1"
MODEL_ID = "gemini-2.5-flash"

# Local path to your downloaded video file (not a webpage link — download
# the actual mp4 first, e.g. with yt-dlp, then point this at it).
LOCAL_VIDEO_PATH = os.path.expanduser("~/Downloads/test2.mp4")

# Your GCS bucket name (create one first: gsutil mb gs://your-bucket-name,
# or via Console > Cloud Storage > Create bucket).
BUCKET_NAME = "silent-scholar-505618-u6-clips"


class DialogueLine(pydantic.BaseModel):
    timecode: str
    character: str
    text: str


class GestureLog(pydantic.BaseModel):
    timecode: str
    character: str
    gesture: str  # empty string if no notable gesture at this timecode
    expression: str  # empty string if no notable facial expression
    narrative_load: str  # load_bearing / supporting / incidental
    background_note: str  # empty string unless something genuinely stands out


class GestureDetectionResult(pydantic.BaseModel):
    dialogue: list[DialogueLine] = pydantic.Field(default_factory=list)
    gestures: list[GestureLog] = pydantic.Field(default_factory=list)


GESTURE_PROMPT = """
Watch this video and produce two timecode-anchored logs.

We are tracking a lot of signals at once (dialogue, gestures, expressions,
background), so be selective: only log something when it's actually there.
Do not pad entries with empty commentary — an empty/omitted field is the
correct output when that signal isn't present at that moment.

1. dialogue: every spoken line, verbatim, in order.
   - timecode
   - which character is speaking
   - the line of dialogue (text)

2. gestures: notable hand gestures, head movements, or body-language cues
   performed by a character (thumbs up, OK sign, head nod, head shake,
   pointing, etc.), anchored to the same timecode scheme as dialogue so the
   two logs can be cross-referenced.
   Only add a new entry when something changes in a noticeable way from the
   moment before — a held pose, a continuing gesture, or someone just
   talking with no distinct physical cue does NOT need its own entry. Do
   not log continuously or repeat the same state; skip a scene entirely if
   nothing about it is worth flagging.
   For each entry, note:
   - timecode
   - which character performs it
   - gesture: description of the physical gesture/body-language cue. Leave
     empty if nothing notable is happening physically at that moment (e.g.
     a character is just talking with no distinct gesture).
   - expression: the character's facial expression, only if it's notable
     (surprise, a smirk, gritted teeth). Leave empty for a neutral or
     unremarkable expression.
   - narrative_load: how load-bearing this gesture/expression is to the
     scene (does dialogue or a joke depend on it, or is it incidental).
   - background_note: is there anything standout in the background at that
     same moment — a notable object, prop, sign, or detail worth flagging?
     Keep this brief and only fill it in if something genuinely stands out
     (e.g. leave it empty when the scene is a plain shot of someone
     talking). This is a secondary note, not the main focus.

Do not interpret cultural meaning yet — just log what physically happens
and what is said.
"""


def upload_to_gcs(local_path: str, bucket_name: str) -> str:
    """Uploads a local file to GCS and returns its gs:// URI.

    Skips the upload if a blob of the same name and size already exists —
    re-running this script during iteration shouldn't re-upload the same
    video every time.
    """
    client = storage.Client(project=PROJECT_ID)
    bucket = client.bucket(bucket_name)
    blob_name = os.path.basename(local_path)
    blob = bucket.blob(blob_name)

    if blob.exists():
        blob.reload()
    if blob.exists() and blob.size == os.path.getsize(local_path):
        print(f"{blob_name} already uploaded, skipping upload.")
    else:
        blob.upload_from_filename(local_path)

    return f"gs://{bucket_name}/{blob_name}"


def detect_gestures(video_uri: str) -> GestureDetectionResult:
    client = genai.Client(vertexai=True, project=PROJECT_ID, location=LOCATION)

    contents = [
        types.Part.from_text(text="Transcribe the dialogue and log the gestures in this video."),
        types.Part.from_uri(file_uri=video_uri, mime_type="video/mp4"),
    ]

    response = client.models.generate_content(
        model=MODEL_ID,
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=GESTURE_PROMPT,
            temperature=0.2,
            response_mime_type="application/json",
            response_schema=GestureDetectionResult,
            media_resolution=types.MediaResolution.MEDIA_RESOLUTION_LOW,
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        ),
    )

    print("=== DEBUG: raw response.text ===")
    print(response.text)
    print("=== DEBUG: finish_reason ===")
    print(response.candidates[0].finish_reason if response.candidates else None)
    print("=== DEBUG: usage_metadata ===")
    print(response.usage_metadata)
    print("=== END DEBUG ===\n")

    if isinstance(response.parsed, GestureDetectionResult):
        return response.parsed
    print("Parsing failed.")
    return GestureDetectionResult()


if __name__ == "__main__":
    print("Uploading video to GCS...")
    gcs_uri = upload_to_gcs(LOCAL_VIDEO_PATH, BUCKET_NAME)
    print(f"Uploaded to {gcs_uri}\n")

    result = detect_gestures(gcs_uri)

    print(f"Found {len(result.dialogue)} dialogue lines:\n")
    for d in result.dialogue:
        print(f"[{d.timecode}] {d.character}: {d.text}")

    print(f"\nFound {len(result.gestures)} gesture/expression entries:\n")
    for g in result.gestures:
        parts = [p for p in (g.gesture, g.expression) if p]
        print(f"[{g.timecode}] {g.character}: {', '.join(parts) or '(none)'} ({g.narrative_load})")
        if g.background_note:
            print(f"    background: {g.background_note}")