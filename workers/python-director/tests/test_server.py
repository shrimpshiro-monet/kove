from unittest.mock import patch, MagicMock

from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# RED: These tests MUST fail before server.py exists
# ---------------------------------------------------------------------------

from src.server import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "version" in data


def test_generate_edl_endpoint():
    mock_edl = {
        "version": "5.1",
        "id": "edl_tiktok_edit_tiktok_abc123",
        "style": {"tokens": {"aggression": 0.8}},
        "creative": {"storyArc": [], "intentChains": {}},
    }

    with patch("src.server.Director") as MockDirector:
        mock_instance = MagicMock()
        mock_instance.direct.return_value = mock_edl
        MockDirector.return_value = mock_instance

        response = client.post("/api/generate", json={
            "prompt": "Make a hype TikTok edit",
            "video_path": "/tmp/test.mp4",
            "audio_path": "/tmp/test.mp3",
        })

    assert response.status_code == 200
    data = response.json()
    assert data["version"] == "5.1"
    assert "style" in data
    assert "creative" in data


def test_generate_edl_with_reference():
    mock_edl = {
        "version": "5.1",
        "id": "edl_tiktok_edit_tiktok_abc123",
        "style": {"tokens": {"aggression": 0.8}},
        "creative": {"storyArc": [], "intentChains": {}},
    }

    with patch("src.server.Director") as MockDirector:
        mock_instance = MagicMock()
        mock_instance.direct.return_value = mock_edl
        MockDirector.return_value = mock_instance

        response = client.post("/api/generate", json={
            "prompt": "Match this style",
            "video_path": "/tmp/test.mp4",
            "audio_path": "/tmp/test.mp3",
            "reference_path": "/tmp/ref.mp4",
        })

    assert response.status_code == 200
    data = response.json()
    assert data["version"] == "5.1"


def test_generate_missing_prompt():
    response = client.post("/api/generate", json={
        "video_path": "/tmp/test.mp4",
        "audio_path": "/tmp/test.mp3",
    })
    assert response.status_code == 422


def test_generate_missing_video():
    response = client.post("/api/generate", json={
        "prompt": "Make an edit",
        "audio_path": "/tmp/test.mp3",
    })
    assert response.status_code == 422


def test_generate_director_error():
    with patch("src.server.Director") as MockDirector:
        mock_instance = MagicMock()
        mock_instance.direct.side_effect = RuntimeError("Gemini API unavailable")
        MockDirector.return_value = mock_instance

        response = client.post("/api/generate", json={
            "prompt": "Make an edit",
            "video_path": "/tmp/test.mp4",
            "audio_path": "/tmp/test.mp3",
        })

    assert response.status_code == 500
    assert "detail" in response.json()


def test_upload_endpoint():
    response = client.post(
        "/api/upload",
        files={"file": ("test.mp4", b"fake video data", "video/mp4")},
    )
    assert response.status_code == 200
    data = response.json()
    assert "path" in data
    assert "filename" in data
    assert data["filename"] == "test.mp4"
    assert data["path"].endswith(".mp4")


def test_upload_preserves_extension():
    response = client.post(
        "/api/upload",
        files={"file": ("clip.mov", b"fake video data", "video/quicktime")},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["path"].endswith(".mov")


def test_upload_missing_file():
    response = client.post("/api/upload")
    assert response.status_code == 422


def test_generate_with_invalid_input():
    response = client.post("/api/generate", json={
        "prompt": "",
        "video_path": "/nonexistent.mp4",
        "audio_path": "/nonexistent.mp3",
    })
    assert response.status_code == 422


def test_generate_video_path_too_short():
    response = client.post("/api/generate", json={
        "prompt": "Make an edit",
        "video_path": "",
        "audio_path": "/tmp/test.mp3",
    })
    assert response.status_code == 422


def test_generate_audio_path_too_short():
    response = client.post("/api/generate", json={
        "prompt": "Make an edit",
        "video_path": "/tmp/test.mp4",
        "audio_path": "",
    })
    assert response.status_code == 422


def test_progress_endpoint_not_found():
    response = client.get("/api/progress/test-job-id")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "not_found"
