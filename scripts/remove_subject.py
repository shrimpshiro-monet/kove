import cv2
import mediapipe as mp
import numpy as np
import subprocess
import os, sys

def remove_subject(input_video: str, output_video: str):
    cap = cv2.VideoCapture(input_video)
    fps = cap.get(cv2.CAP_PROP_FPS)
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    print(f"Video: {w}x{h} @{fps:.2f}fps, {total} frames")

    mp_selfie = mp.solutions.selfie_segmentation
    selfie_seg = mp_selfie.SelfieSegmentation(model_selection=0)

    ffmpeg_cmd = [
        "ffmpeg", "-y",
        "-f", "rawvideo", "-pix_fmt", "bgr24",
        "-s", f"{w}x{h}", "-r", str(fps),
        "-i", "-",
        "-i", input_video,
        "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "copy",
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-shortest",
        output_video,
    ]
    proc = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE)

    frame_idx = 0
    try:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = selfie_seg.process(rgb)

            if result.segmentation_mask is not None:
                mask = result.segmentation_mask
                _, binary_mask = cv2.threshold(mask, 0.5, 255, cv2.THRESH_BINARY)
                binary_mask = binary_mask.astype(np.uint8)
                kernel = np.ones((5, 5), np.uint8)
                dilated = cv2.dilate(binary_mask, kernel, iterations=2)
                inpainted = cv2.inpaint(frame, dilated, 3, cv2.INPAINT_TELEA)
            else:
                inpainted = frame

            proc.stdin.write(inpainted.tobytes())
            frame_idx += 1
            if frame_idx % 30 == 0:
                print(f"  Processed {frame_idx}/{total} ({frame_idx/total*100:.0f}%)", end="\r")
    finally:
        cap.release()
        proc.stdin.close()
        proc.wait()
        selfie_seg.close()

    print(f"\n  Done: {output_video} ({frame_idx} frames)")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python remove_subject.py <input.mp4> <output.mp4>")
        sys.exit(1)
    remove_subject(sys.argv[1], sys.argv[2])
