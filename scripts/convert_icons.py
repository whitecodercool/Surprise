import os
from PIL import Image

src_path = "/Users/daxon/.gemini/antigravity-ide/brain/7e540188-2782-4ea3-a2d6-00290a621219/ghost_simple_eye_icon_1781736628510.png"
build_dir = "/Users/daxon/Desktop/ghost-browser/ghost-Browser/build"
resources_dir = "/Users/daxon/Desktop/ghost-browser/ghost-Browser/resources"

# Ensure directories exist
os.makedirs(build_dir, exist_ok=True)
os.makedirs(resources_dir, exist_ok=True)

print("Opening generated image...")
img = Image.open(src_path)

if img.mode != 'RGBA':
    img = img.convert('RGBA')

# Convert white corners to transparency
datas = img.getdata()
newData = []
for item in datas:
    # If the pixel is close to white (R, G, B > 240), make it transparent
    if item[0] > 240 and item[1] > 240 and item[2] > 240:
        newData.append((0, 0, 0, 0))
    else:
        newData.append(item)

img.putdata(newData)

# 1. Save cleaned PNGs
img.save(os.path.join(build_dir, "icon.png"), format="PNG")
img.save(os.path.join(resources_dir, "icon.png"), format="PNG")
print("Saved transparent PNG icons successfully.")

# 2. Save as build/icon.ico (Windows)
ico_sizes = [16, 32, 48, 64, 128, 256]
img.save(os.path.join(build_dir, "icon.ico"), format="ICO", sizes=[(s, s) for s in ico_sizes])
print("Saved ICO icon successfully.")

# 3. Save as build/icon.icns (macOS)
try:
    img.save(os.path.join(build_dir, "icon.icns"), format="ICNS")
    print("Saved ICNS icon using Pillow successfully.")
except Exception as e:
    print("Pillow direct ICNS save failed:", e)
    print("Falling back to native macOS iconutil...")
    iconset_dir = os.path.join(build_dir, "icon.iconset")
    os.makedirs(iconset_dir, exist_ok=True)
    
    sizes = [
        (16, "16x16"),
        (32, "16x16@2x"),
        (32, "32x32"),
        (64, "32x32@2x"),
        (128, "128x128"),
        (256, "128x128@2x"),
        (256, "256x256"),
        (512, "256x256@2x"),
        (512, "512x512"),
        (1024, "512x512@2x")
    ]
    for s, name in sizes:
        resized = img.resize((s, s), Image.Resampling.LANCZOS)
        resized.save(os.path.join(iconset_dir, f"icon_{name}.png"), format="PNG")
    
    import subprocess
    subprocess.run(["iconutil", "-c", "icns", iconset_dir])
    
    import shutil
    shutil.rmtree(iconset_dir)
    print("Saved ICNS icon using macOS iconutil successfully.")
