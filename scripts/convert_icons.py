import os
from PIL import Image

src_path = "/Users/daxon/.gemini/antigravity-ide/brain/8169e76f-4a79-4bc4-8324-f004522109cf/media__1781895879336.png"
build_dir = "/Users/daxon/Desktop/ghost-browser/ghost-Browser/build"
resources_dir = "/Users/daxon/Desktop/ghost-browser/ghost-Browser/resources"

# Ensure directories exist
os.makedirs(build_dir, exist_ok=True)
os.makedirs(resources_dir, exist_ok=True)

print("Opening generated image...")
img = Image.open(src_path)

if img.mode != 'RGBA':
    img = img.convert('RGBA')

# Convert black background to transparency
print("Converting black background to transparent for desktop icon...")
datas = img.getdata()
newData = []
for item in datas:
    r, g, b, a = item
    v = max(r, g, b)
    new_a = int(v * (a / 255.0))
    newData.append((r, g, b, new_a))

img_transparent = Image.new('RGBA', img.size)
img_transparent.putdata(newData)

# Helper function to resize with padding (so logo fits inside the icon canvas without clipping)
def resize_with_padding(image, size_tuple):
    w, h = size_tuple
    padded_img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    
    # 85% scale factor to leave some breathing room on desktop
    logo_w = int(w * 0.85)
    logo_h = int(h * 0.85)
    
    resized_logo = image.resize((logo_w, logo_h), Image.Resampling.LANCZOS)
    pos_x = (w - logo_w) // 2
    pos_y = (h - logo_h) // 2
    padded_img.paste(resized_logo, (pos_x, pos_y), mask=resized_logo)
    return padded_img

# 1. Save cleaned PNGs (standard size is typically 512x512)
img_png_build = resize_with_padding(img_transparent, (512, 512))
img_png_build.save(os.path.join(build_dir, "icon.png"), format="PNG")
img_png_build.save(os.path.join(resources_dir, "icon.png"), format="PNG")
print("Saved transparent PNG icons successfully.")

# 2. Save as build/icon.ico (Windows)
ico_sizes = [16, 32, 48, 64, 128, 256]
ico_images = [resize_with_padding(img_transparent, (s, s)) for s in ico_sizes]
ico_images[0].save(
    os.path.join(build_dir, "icon.ico"), 
    format="ICO", 
    append_images=ico_images[1:], 
    sizes=[(s, s) for s in ico_sizes]
)
print("Saved ICO icon successfully.")

# 3. Save as build/icon.icns (macOS)
try:
    # Use standard iconutil method for best macOS rendering
    print("Generating ICNS icon using macOS iconutil...")
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
        resized = resize_with_padding(img_transparent, (s, s))
        resized.save(os.path.join(iconset_dir, f"icon_{name}.png"), format="PNG")
    
    import subprocess
    subprocess.run(["iconutil", "-c", "icns", iconset_dir])
    
    import shutil
    shutil.rmtree(iconset_dir)
    print("Saved ICNS icon using macOS iconutil successfully.")
except Exception as e:
    print("macOS iconutil failed:", e)
    print("Falling back to Pillow ICNS save...")
    img_icns = resize_with_padding(img_transparent, (512, 512))
    img_icns.save(os.path.join(build_dir, "icon.icns"), format="ICNS")
