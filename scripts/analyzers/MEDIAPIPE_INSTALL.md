# MediaPipe Installation (Apple Silicon Macs)

MediaPipe provides accurate face detection for shot type classification.
Without it, the system falls back to YCbCr skin detection (biased, less accurate).

## Install

```bash
pip install mediapipe opencv-python
```

## M-series Mac Notes

If `pip install mediapipe` fails, try:

```bash
# Option 1: Use the official wheel
pip install mediapipe-silicon

# Option 2: Use conda
conda install -c conda-forge mediapipe

# Option 3: Build from source
git clone https://github.com/google/mediapipe.git
cd mediapipe
python setup.py install
```

## Verify

```bash
python -c "import mediapipe; print(mediapipe.__version__)"
```

## Fallback Behavior

If MediaPipe is not installed:
- Shot type classification uses YCbCr skin detection
- This is biased against darker skin tones
- May trigger false positives on wood, sand, beige walls
- Console shows: "mediapipe not installed — using YCbCr skin detection (biased)"
