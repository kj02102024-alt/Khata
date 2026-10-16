Place two PNG icons here:
  icon-192.png  (192 × 192 px)
  icon-512.png  (512 × 512 px)

Quick way to generate them:
  1. Go to https://realfavicongenerator.net
  2. Upload any image (a "ख" lettermark works great)
  3. Download and copy the 192 and 512 variants here.

Or generate programmatically with ImageMagick:
  convert -size 192x192 xc:#1a237e -fill '#ff9800' \
    -font /usr/share/fonts/truetype/noto/NotoSansDevanagari-Bold.ttf \
    -pointsize 100 -gravity center -annotate 0 'ख' icon-192.png

  convert icon-192.png -resize 512x512 icon-512.png
