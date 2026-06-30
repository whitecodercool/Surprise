import os
from PIL import Image, ImageDraw

src_path = "/Users/daxon/.gemini/antigravity-ide/brain/8169e76f-4a79-4bc4-8324-f004522109cf/media__1781895879336.png"
res_dir = "/Users/daxon/Desktop/ghost-browser/ghost-Browser/Android/android/app/src/main/res"

print("Opening generated eye image...")
img = Image.open(src_path)
if img.mode != 'RGBA':
    img = img.convert('RGBA')

# Create a transparent version of the image using max(R, G, B) as alpha channel
print("Creating transparent version of the eye logo...")
datas = img.getdata()
new_data = []
for item in datas:
    r, g, b, a = item
    # Map black background to transparent, preserve the red eye and its glow
    v = max(r, g, b)
    new_a = int(v * (a / 255.0))
    new_data.append((r, g, b, new_a))

img_transparent = Image.new('RGBA', img.size)
img_transparent.putdata(new_data)

# Android mipmap densities and dimensions
mipmap_configs = [
    ("mipmap-mdpi", 48),
    ("mipmap-hdpi", 72),
    ("mipmap-xhdpi", 96),
    ("mipmap-xxhdpi", 144),
    ("mipmap-xxxhdpi", 192)
]

for folder, size in mipmap_configs:
    target_folder = os.path.join(res_dir, folder)
    os.makedirs(target_folder, exist_ok=True)
    
    # Scale factor for the logo inside the icon canvas to prevent cropping/cutting (safe zone is 66%)
    logo_size = int(size * 0.65)
    
    # 1. Generate ic_launcher_foreground.png (Transparent background, centered logo)
    foreground_canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    resized_logo_trans = img_transparent.resize((logo_size, logo_size), Image.Resampling.LANCZOS)
    pos = (size - logo_size) // 2
    foreground_canvas.paste(resized_logo_trans, (pos, pos), mask=resized_logo_trans)
    foreground_canvas.save(os.path.join(target_folder, "ic_launcher_foreground.png"), format="PNG")
    
    # 2. Generate ic_launcher.png (Solid black background, centered logo)
    launcher_canvas = Image.new('RGBA', (size, size), (0, 0, 0, 255))
    resized_logo_opaque = img.resize((logo_size, logo_size), Image.Resampling.LANCZOS)
    launcher_canvas.paste(resized_logo_opaque, (pos, pos))
    launcher_canvas.save(os.path.join(target_folder, "ic_launcher.png"), format="PNG")
    
    # 3. Generate ic_launcher_round.png (Circular cropped standard icon)
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size, size), fill=255)
    
    round_img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    round_img.paste(launcher_canvas, (0, 0), mask=mask)
    round_img.save(os.path.join(target_folder, "ic_launcher_round.png"), format="PNG")
    
    print(f"Generated icons for {folder} ({size}x{size})")

print("All Android launcher icons successfully updated!")
