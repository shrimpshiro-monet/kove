from src.models import ContentAnalysis, FaceDetection


def test_face_detection_creation():
    face = FaceDetection(
        frame=0,
        bbox=[400, 200, 680, 900],
        confidence=0.98,
    )
    assert face.frame == 0
    assert face.bbox == [400, 200, 680, 900]
    assert face.confidence == 0.98


def test_face_detection_with_landmarks():
    face = FaceDetection(
        frame=0,
        bbox=[400, 200, 680, 900],
        landmarks={
            "left_eye": [480, 350],
            "right_eye": [560, 350],
            "nose": [520, 420],
        },
        confidence=0.95,
    )
    assert face.landmarks is not None
    assert "left_eye" in face.landmarks


def test_content_analysis_creation():
    analysis = ContentAnalysis(
        faces=[FaceDetection(frame=0, bbox=[400, 200, 680, 900], confidence=0.98)],
        objects=[],
        depth=[],
        motion=[],
        scenes=[],
        brightness=[0.5],
        composition={},
        color_palette=[],
        semantic="test",
    )
    assert len(analysis.faces) == 1
    assert analysis.faces[0].confidence == 0.98
    assert analysis.semantic == "test"


def test_content_analysis_empty():
    analysis = ContentAnalysis(
        faces=[],
        objects=[],
        depth=[],
        motion=[],
        scenes=[],
        brightness=[],
        composition={},
        color_palette=[],
        semantic="no content",
    )
    assert len(analysis.faces) == 0
    assert analysis.semantic == "no content"
