from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "source-stems"
OUT_DIRS = [ROOT / "source-visuals", ROOT / "www" / "source-visuals"]

VISUAL_BOXES = {
    "A14-execution-history": ("A14.png", (60, 163, 965, 315)),
    "A21-final-grade": ("A21.png", (60, 441, 746, 864)),
    "A22-decision-table": ("A22.png", (60, 371, 963, 834)),
    "B22-artery-table": ("B22.png", (60, 89, 954, 486)),
    "B31-project-effort": ("B31.png", (60, 141, 965, 284)),
    "B32-test-priority": ("B32.png", (60, 179, 963, 493)),
    "B38-sort-log": ("B38.png", (60, 127, 965, 589)),
    "C22-driving-table": ("C22.png", (116, 101, 883, 385)),
    "D22-classification-table": ("D22.png", (60, 63, 887, 268)),
    "D23-hotel-transition": ("D23.png", (73, 101, 962, 381)),
    "D32-traceability": ("D32.png", (92, 101, 963, 331)),
}


def main():
    for out_dir in OUT_DIRS:
        out_dir.mkdir(parents=True, exist_ok=True)

    for name, (source_name, box) in VISUAL_BOXES.items():
        source = SOURCE / source_name
        if not source.exists():
            raise FileNotFoundError(source)
        image = Image.open(source)
        crop = image.crop(box)
        for out_dir in OUT_DIRS:
            crop.save(out_dir / f"{name}.png")

    print(f"Rendered {len(VISUAL_BOXES)} source visual images.")


if __name__ == "__main__":
    main()
