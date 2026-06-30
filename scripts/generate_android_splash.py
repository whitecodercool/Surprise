import os
from PIL import Image

src_path = "/Users/daxon/.gemini/antigravity-ide/brain/8169e76f-4a79-4bc4-8324-f004522109cf/media__1781895879336.png"
res_dir = "/Users/daxon/Desktop/ghost-browser/ghost-Browser/Android/android/app/src/main/res"

print("Opening source logo for splash screen...")
logo = Image.open(src_path)
if logo.mode != 'RGBA':
    logo = logo.convert('RGBA')

# Target splash screen files and their standard dimensions (width, height)
splash_configs = [
    ("drawable/splash.png", (512, 512)),
    ("drawable-port-mdpi/splash.png", (320, 480)),
    ("drawable-port-hdpi/splash.png", (480, 800)),
    ("drawable-port-xhdpi/splash.png", (720, 1280)),
    ("drawable-port-xxhdpi/splash.png", (960, 1600)),
    ("drawable-port-xxxhdpi/splash.png", (1280, 1920)),
    ("drawable-land-mdpi/splash.png", (480, 320)),
    ("drawable-land-hdpi/splash.png", (800, 480)),
    ("drawable-land-xhdpi/splash.png", (1280, 720)),
    ("drawable-land-xxhdpi/splash.png", (1600, 960)),
    ("drawable-land-xxxhdpi/splash.png", (1920, 1280))
]

for rel_path, (width, height) in splash_configs:
    target_path = os.path.join(res_dir, rel_path)
    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    
    # Create black background canvas
    splash_bg = Image.new("RGBA", (width, height), (0, 0, 0, 255))
    
    # Calculate scale of the logo. Logo should occupy about 25% of the shorter screen dimension.
    shorter_dim = min(width, height)
    logo_size = int(shorter_dim * 0.28)
    if logo_size < 64:
        logo_size = 64
        
    # Resize logo with Lanczos interpolation
    resized_logo = logo.resize((logo_size, logo_size), Image.Resampling.LANCZOS)
    
    # Center position
    pos_x = (width - logo_size) // 2
    pos_y = (height - logo_size) // 2
    
    # Paste logo on top of background
    splash_bg.paste(resized_logo, (pos_x, pos_y), mask=resized_logo)
    
    # Save as PNG
    splash_bg.save(target_path, format="PNG")
    print(f"Generated splash screen for {rel_path} ({width}x{height}, logo size: {logo_size}x{logo_size})")

print("All Android native splash screen drawables successfully updated!")
