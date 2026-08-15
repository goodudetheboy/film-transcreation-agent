import uuid
import json
from google.cloud.dialogflowcx_v3beta1.services.sessions import SessionsClient
from google.cloud.dialogflowcx_v3beta1.types import session

# ---- fill these in with your actual project details ----
PROJECT_ID = "silent-scholar-505618-u6"   # your real project ID, not the display name
LOCATION = "us-central1"
AGENT_ID = "f475df77-4a24-4d7e-a6ff-a3f5d039f975"  # from the agent's console URL

# ---- mock input data ----
MOCK_SCRIPT = """
INT. FAMILY KITCHEN - EVENING
RILEY
I'm not eating that broccoli.
MOM
Two more bites, then you're done.
RILEY
This is worse than a trip to the DMV.
"""
MOCK_COUNTRY = "Japan"


def analyze_scene(script_text: str, country: str) -> list:
    """Sends script + country to the playbook and returns the parsed flagged_lines list."""
    session_id = str(uuid.uuid4())  # fresh session every call, avoids the stuck-session issue
    session_path = (
        f"projects/{PROJECT_ID}/locations/{LOCATION}/agents/{AGENT_ID}/sessions/{session_id}"
    )

    client_options = {"api_endpoint": f"{LOCATION}-dialogflow.googleapis.com"}
    client = SessionsClient(client_options=client_options)

    text_input = session.TextInput(text="analyze this scene")
    query_input = session.QueryInput(text=text_input, language_code="en")
    query_params = session.QueryParameters(
        parameters={"script": script_text, "country": country}
    )

    request = session.DetectIntentRequest(
        session=session_path, query_input=query_input, query_params=query_params
    )

    try:
        response = client.detect_intent(request=request)
    except Exception as e:
        print(f"API call failed: {e}")
        return []

    for msg in response.query_result.response_messages:
        if msg.text and msg.text.text:
            raw_output = msg.text.text[0]
            cleaned = strip_json_fences(raw_output)
            try:
                return json.loads(cleaned)
            except json.JSONDecodeError:
                print("Response wasn't valid JSON, raw text below:")
                print(raw_output)
                return []
    return []


def strip_json_fences(text: str) -> str:
    """Removes ```json / ``` markdown fences the model sometimes wraps its output in."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text  # drop the ```json line
        if text.endswith("```"):
            text = text[: -3]
    return text.strip()


if __name__ == "__main__":
    result = analyze_scene(MOCK_SCRIPT, MOCK_COUNTRY)
    print(json.dumps(result, indent=2))