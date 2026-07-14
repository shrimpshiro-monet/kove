from .models import ContentAnalysis


class ContentAnalyzer:
    def analyze(self, video_path: str) -> ContentAnalysis:
        return ContentAnalysis(
            faces=[],
            objects=[],
            depth=[],
            motion=[],
            scenes=[],
            brightness=[0.5],
            composition={},
            color_palette=[],
            semantic="Hardcoded stub analysis",
        )
