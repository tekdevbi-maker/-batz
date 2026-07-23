# Android 12+'s native SplashScreen API renders the branding image inside a
# fixed square icon container -- it does NOT scale-to-fit an arbitrary wide
# image, it crops to that square regardless of the plugin's `imageWidth`
# (confirmed empirically: imageWidth 240 and 130 produced the identical crop
# on-device). The fix is to pre-compose the full wordmark onto a square
# transparent canvas, padded so the whole thing already fits inside a square
# before Android ever gets to crop it.
Add-Type -AssemblyName System.Drawing

$src = Join-Path $PSScriptRoot "..\assets\wordmark-transparent.png"
$out = Join-Path $PSScriptRoot "..\assets\splash-icon.png"

$srcImg = [System.Drawing.Image]::FromFile($src)
$canvasSize = 1200
# Leave real padding -- the square container itself gets further scaled/
# inset by the OS, so don't make the logo fill edge-to-edge.
$maxContentSize = [int]($canvasSize * 0.62)

$scale = [Math]::Min($maxContentSize / $srcImg.Width, $maxContentSize / $srcImg.Height)
$drawWidth = [int]($srcImg.Width * $scale)
$drawHeight = [int]($srcImg.Height * $scale)
$offsetX = [int](($canvasSize - $drawWidth) / 2)
$offsetY = [int](($canvasSize - $drawHeight) / 2)

$canvas = New-Object System.Drawing.Bitmap($canvasSize, $canvasSize)
$g = [System.Drawing.Graphics]::FromImage($canvas)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)
$g.DrawImage($srcImg, $offsetX, $offsetY, $drawWidth, $drawHeight)
$g.Dispose()

$canvas.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$canvas.Dispose()
$srcImg.Dispose()

Write-Host "Wrote $out ($canvasSize x $canvasSize, logo $drawWidth x $drawHeight)"
