Add-Type -AssemblyName System.Drawing
$assets = "C:\Users\cbago\Projects\@Batz\app\assets"
$src = "$assets\thumb_transparent.png"
$pf32 = [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
$canvasSize = 1024

$srcImg = [System.Drawing.Bitmap]::new($src)
$w = $srcImg.Width
$h = $srcImg.Height

# ---- Trim to actual (non-transparent) content bounds ----
$rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
$data = $srcImg.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, $pf32)
$bytes = New-Object byte[] ($data.Stride * $h)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
$srcImg.UnlockBits($data)

$minX = $w; $minY = $h; $maxX = 0; $maxY = 0
for ($y = 0; $y -lt $h; $y++) {
  $row = $y * $data.Stride
  for ($x = 0; $x -lt $w; $x++) {
    $i = $row + $x * 4
    if ($bytes[$i + 3] -gt 10) {
      if ($x -lt $minX) { $minX = $x }
      if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }
      if ($y -gt $maxY) { $maxY = $y }
    }
  }
}
Write-Output "Content bounds: x=$minX..$maxX y=$minY..$maxY"

$cw = $maxX - $minX + 1
$ch = $maxY - $minY + 1
$trimmed = New-Object System.Drawing.Bitmap($cw, $ch, $pf32)
$gt = [System.Drawing.Graphics]::FromImage($trimmed)
$gt.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gt.DrawImage($srcImg, (New-Object System.Drawing.Rectangle 0, 0, $cw, $ch), (New-Object System.Drawing.Rectangle $minX, $minY, $cw, $ch), [System.Drawing.GraphicsUnit]::Pixel)
$gt.Dispose()
$srcImg.Dispose()

$tw = $trimmed.Width
$th = $trimmed.Height

# ---- icon.png: white background, trimmed mark padded/centered ----
$scale = [Math]::Min($canvasSize / $tw, $canvasSize / $th) * 0.8
$dw = [int]($tw * $scale); $dh = [int]($th * $scale)
$dx = [int](($canvasSize - $dw) / 2); $dy = [int](($canvasSize - $dh) / 2)
$icon = New-Object System.Drawing.Bitmap($canvasSize, $canvasSize)
$gi = [System.Drawing.Graphics]::FromImage($icon)
$gi.Clear([System.Drawing.Color]::White)
$gi.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gi.DrawImage($trimmed, $dx, $dy, $dw, $dh)
$gi.Dispose()
$icon.Save("$assets\icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "Wrote icon.png"

# ---- Android adaptive icon foreground: trimmed mark centered on transparent canvas, fit within safe zone ----
$safeZone = 0.48
$fscale = [Math]::Min(($canvasSize * $safeZone) / $tw, ($canvasSize * $safeZone) / $th)
$fdw = [int]($tw * $fscale); $fdh = [int]($th * $fscale)
$fdx = [int](($canvasSize - $fdw) / 2); $fdy = [int](($canvasSize - $fdh) / 2)
$fg = New-Object System.Drawing.Bitmap($canvasSize, $canvasSize, $pf32)
$gfg = [System.Drawing.Graphics]::FromImage($fg)
$gfg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gfg.DrawImage($trimmed, $fdx, $fdy, $fdw, $fdh)
$gfg.Dispose()
$fg.Save("$assets\android-icon-foreground.png", [System.Drawing.Imaging.ImageFormat]::Png)
$fg.Dispose()
Write-Output "Wrote android-icon-foreground.png (mark at ${fdw}x${fdh}, safe zone ${safeZone})"

# ---- Android adaptive icon background: solid white ----
$bg = New-Object System.Drawing.Bitmap($canvasSize, $canvasSize)
$gbg = [System.Drawing.Graphics]::FromImage($bg)
$gbg.Clear([System.Drawing.Color]::White)
$gbg.Dispose()
$bg.Save("$assets\android-icon-background.png", [System.Drawing.Imaging.ImageFormat]::Png)
$bg.Dispose()
Write-Output "Wrote android-icon-background.png"

# ---- favicon.png ----
$favSize = 196
$fav = New-Object System.Drawing.Bitmap($favSize, $favSize)
$gfav = [System.Drawing.Graphics]::FromImage($fav)
$gfav.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gfav.DrawImage($icon, 0, 0, $favSize, $favSize)
$gfav.Dispose()
$fav.Save("$assets\favicon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$fav.Dispose()
Write-Output "Wrote favicon.png"

$trimmed.Dispose()
Write-Output "DONE"
