import sys
import os
from PIL import Image, ImageDraw

def add_corners(im, rad):
    circle = Image.new('L', (rad * 2, rad * 2), 0)
    draw = ImageDraw.Draw(circle)
    draw.ellipse((0, 0, rad * 2 - 1, rad * 2 - 1), fill=255)
    alpha = Image.new('L', im.size, 255)
    w, h = im.size
    alpha.paste(circle.crop((0, 0, rad, rad)), (0, 0))
    alpha.paste(circle.crop((0, rad, rad, rad * 2)), (0, h - rad))
    alpha.paste(circle.crop((rad, 0, rad * 2, rad)), (w - rad, 0))
    alpha.paste(circle.crop((rad, rad, rad * 2, rad * 2)), (w - rad, h - rad))
    im.putalpha(alpha)
    return im

os.makedirs('build', exist_ok=True)
source_img = "/Users/giacomomeschini/.gemini/antigravity/brain/74db8f86-48f5-4f69-9a82-462ee5fbf1ba/mockup_app_colors_root_1_1777985839954.png"
im = Image.open(source_img).convert("RGBA")
# Resize to 512x512 for standard icon size
im = im.resize((512, 512), Image.Resampling.LANCZOS)
# Add rounded corners (standard macOS squircle radius is roughly 115 for 512x512)
im = add_corners(im, 115)
im.save("build/icon.png")
print("Icon prepared at build/icon.png")
