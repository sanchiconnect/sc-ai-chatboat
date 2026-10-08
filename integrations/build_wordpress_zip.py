"""Builds integrations/dist/sanchijawab-chat.zip, ready for WordPress > Plugins > Add New > Upload.
Uses forward slashes inside the zip (what WordPress expects; Windows' own zip tools use backslashes).

    python integrations/build_wordpress_zip.py
"""
import zipfile
from pathlib import Path

root = Path(__file__).parent
src = root / "wordpress" / "sanchijawab-chat"
out = root / "dist" / "sanchijawab-chat.zip"
out.parent.mkdir(exist_ok=True)

with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for f in sorted(src.rglob("*")):
        if f.is_file():
            z.write(f, f"sanchijawab-chat/{f.relative_to(src).as_posix()}")
print(f"built {out} ({out.stat().st_size} bytes)")
with zipfile.ZipFile(out) as z:
    for name in z.namelist():
        print("  ", name)
