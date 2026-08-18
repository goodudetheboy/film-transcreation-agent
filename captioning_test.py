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


class GestureLog(pydantic.BaseModel):
    timecode: str
    gesture: str
    character: str
    narrative_load: str  # load_bearing / supporting / incidental


class GestureDetectionResult(pydantic.BaseModel):
    gestures: list[GestureLog] = pydantic.Field(default_factory=list)


GESTURE_PROMPT = """
Watch this video and log every distinct hand gesture, head movement, or
body-language cue performed by a character (thumbs up, OK sign, head nod,
head shake, pointing, etc.).
For each one, note:
- timecode
- gesture description
- which character performs it
- how load-bearing it is to the scene (does dialogue or a joke depend on it,
  or is it incidental)
- background_note: at that same moment, is there anything standout in the
  background — a notable object, prop, sign, or detail worth flagging? Keep
  this brief and only fill it in if something genuinely stands out; leave it
  empty otherwise. This is a secondary note, not the main focus — gestures
  remain the primary thing to log.
Do not interpret cultural meaning yet — just log what physically happens.
"""


def upload_to_gcs(local_path: str, bucket_name: str) -> str:
    """Uploads a local file to GCS and returns its gs:// URI."""
    client = storage.Client(project=PROJECT_ID)
    bucket = client.bucket(bucket_name)
    blob_name = os.path.basename(local_path)
    blob = bucket.blob(blob_name)
    blob.upload_from_filename(local_path)
    return f"gs://{bucket_name}/{blob_name}"


def detect_gestures(video_uri: str) -> GestureDetectionResult:
    client = genai.Client(vertexai=True, project=PROJECT_ID, location=LOCATION)

    contents = [
        types.Part.from_text(text="Log the gestures in this video."),
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
        ),
    )

    if isinstance(response.parsed, GestureDetectionResult):
        return response.parsed
    print("Parsing failed, raw response below:")
    print(response.text)
    return GestureDetectionResult()


if __name__ == "__main__":
    print("Uploading video to GCS...")
    gcs_uri = upload_to_gcs(LOCAL_VIDEO_PATH, BUCKET_NAME)
    print(f"Uploaded to {gcs_uri}\n")

    result = detect_gestures(gcs_uri)
    print(f"Found {len(result.gestures)} gestures:\n")
    for g in result.gestures:
        print(f"[{g.timecode}] {g.character}: {g.gesture} ({g.narrative_load})")