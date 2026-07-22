Add-Type -AssemblyName System.Drawing

$src = "C:\Users\cbago\Projects\@Batz\app\assets\logo-source.png"
$assets = "C:\Users\cbago\Projects\@Batz\app\assets"

$srcImg = [System.Drawing.Bitmap]::new($src)
$w = $srcImg.Width
$h = $srcImg.Height

# Sample the background color from a ring of border pixels (avoids the
# logo content in the center).
$samples = New-Object System.Collections.Generic.List[System.Drawing.Color]
for ($x = 0; $x -lt $w; $x += 20) {
  $samples.Add($srcImg.GetPixel($x, 3))
  $samples.Add($srcImg.GetPixel($x, $h - 4))
}
for ($y = 0; $y -lt $h; $y += 20) {
  $samples.Add($srcImg.GetPixel(3, $y))
  $samples.Add($srcImg.GetPixel($w - 4, $y))
}
$avgR = [int](($samples | ForEach-Object { $_.R } | Measure-Object -Average).Average)
$avgG = [int](($samples | ForEach-Object { $_.G } | Measure-Object -Average).Average)
$avgB = [int](($samples | ForEach-Object { $_.B } | Measure-Object -Average).Average)
$bgHex = "#{0:X2}{1:X2}{2:X2}" -f $avgR, $avgG, $avgB
Write-Output "Background color: $bgHex (R=$avgR G=$avgG B=$avgB)"

function New-Canvas([int]$size, [System.Drawing.Color]$fill) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear($fill)
  return @{ bmp = $bmp; g = $g }
}

# ---- 1. icon.png: 1024x1024, source padded/centered on the bg color ----
$iconSize = 1024
$canvas = New-Canvas $iconSize ([System.Drawing.Color]::FromArgb($avgR, $avgG, $avgB))
$g = $canvas.g
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$scale = [Math]::Min($iconSize / $w, $iconSize / $h) * 0.8
$dw = [int]($w * $scale)
$dh = [int]($h * $scale)
$dx = [int](($iconSize - $dw) / 2)
$dy = [int](($iconSize - $dh) / 2)
$g.DrawImage($srcImg, $dx, $dy, $dw, $dh)
$g.Dispose()
$canvas.bmp.Save("$assets\icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$canvas.bmp.Dispose()
Write-Output "Wrote icon.png"

# ---- 2. Chroma-key the source into a transparent-background version, then trim to content bounds ----
$srcFmt = $srcImg.PixelFormat
$rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
$data = $srcImg.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$bytes = New-Object byte[] ($data.Stride * $h)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
$srcImg.UnlockBits($data)

$threshold = 60
$minX = $w; $minY = $h; $maxX = 0; $maxY = 0
for ($y = 0; $y -lt $h; $y++) {
  $row = $y * $data.Stride
  for ($x = 0; $x -lt $w; $x++) {
    $i = $row + $x * 4
    $b = $bytes[$i]; $gg = $bytes[$i + 1]; $r = $bytes[$i + 2]
    $dist = [Math]::Sqrt([Math]::Pow($r - $avgR, 2) + [Math]::Pow($gg - $avgG, 2) + [Math]::Pow($b - $avgB, 2))
    if ($dist -lt $threshold) {
      $bytes[$i + 3] = 0
    } else {
      if ($x -lt $minX) { $minX = $x }
      if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }
      if ($y -gt $maxY) { $maxY = $y }
    }
  }
}
Write-Output "Content bounds: x=$minX..$maxX y=$minY..$maxY"

$pf32 = [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
$transparent = New-Object System.Drawing.Bitmap($w, $h, $pf32)
$tdata = $transparent.LockBits((New-Object System.Drawing.Rectangle 0, 0, $w, $h), [System.Drawing.Imaging.ImageLockMode]::WriteOnly, $pf32)
[System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $tdata.Scan0, $bytes.Length)
$transparent.UnlockBits($tdata)
$transparent.Save("$assets\logo-transparent-full.png", [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "Wrote logo-transparent-full.png (diagnostic, full canvas)"

$cw = $maxX - $minX + 1
$ch = $maxY - $minY + 1
$trimmed = New-Object System.Drawing.Bitmap($cw, $ch, $pf32)
$gt = [System.Drawing.Graphics]::FromImage($trimmed)
$gt.DrawImage($transparent, (New-Object System.Drawing.Rectangle 0, 0, $cw, $ch), (New-Object System.Drawing.Rectangle $minX, $minY, $cw, $ch), [System.Drawing.GraphicsUnit]::Pixel)
$gt.Dispose()
$transparent.Dispose()
$trimmed.Save("$assets\logo-mark-trimmed.png", [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "Wrote logo-mark-trimmed.png ($cw x $ch)"

$srcImg.Dispose()
Write-Output "DONE_STEP_1"
Add-Type -AssemblyName System.Drawing
$assets = "C:\Users\cbago\Projects\@Batz\app\assets"
$pf32 = [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
$bgColor = [System.Drawing.Color]::FromArgb(21, 52, 116)  # #153474, sampled earlier

$trimmed = [System.Drawing.Bitmap]::new("$assets\logo-mark-trimmed.png")
$tw = $trimmed.Width
$th = $trimmed.Height

# ---- Android adaptive icon foreground: center the trimmed mark on a
# 1024x1024 transparent canvas, scaled to fit within the ~66% "safe zone"
# every launcher mask guarantees stays visible regardless of shape. ----
$canvasSize = 1024
$safeZone = 0.48
$scale = [Math]::Min(($canvasSize * $safeZone) / $tw, ($canvasSize * $safeZone) / $th)
$dw = [int]($tw * $scale)
$dh = [int]($th * $scale)
$dx = [int](($canvasSize - $dw) / 2)
$dy = [int](($canvasSize - $dh) / 2)

$fg = New-Object System.Drawing.Bitmap($canvasSize, $canvasSize, $pf32)
$gfg = [System.Drawing.Graphics]::FromImage($fg)
$gfg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gfg.DrawImage($trimmed, $dx, $dy, $dw, $dh)
$gfg.Dispose()
$fg.Save("$assets\android-icon-foreground.png", [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "Wrote android-icon-foreground.png (mark at ${dw}x${dh}, safe zone ${safeZone})"

# ---- Monochrome (Android 13+ themed icon): same silhouette, all-white ----
$fgData = $fg.LockBits((New-Object System.Drawing.Rectangle 0, 0, $canvasSize, $canvasSize), [System.Drawing.Imaging.ImageLockMode]::ReadOnly, $pf32)
$fgBytes = New-Object byte[] ($fgData.Stride * $canvasSize)
[System.Runtime.InteropServices.Marshal]::Copy($fgData.Scan0, $fgBytes, 0, $fgBytes.Length)
$fg.UnlockBits($fgData)
for ($i = 0; $i -lt $fgBytes.Length; $i += 4) {
  if ($fgBytes[$i + 3] -gt 0) {
    $fgBytes[$i] = 255; $fgBytes[$i + 1] = 255; $fgBytes[$i + 2] = 255
  }
}
$mono = New-Object System.Drawing.Bitmap($canvasSize, $canvasSize, $pf32)
$monoData = $mono.LockBits((New-Object System.Drawing.Rectangle 0, 0, $canvasSize, $canvasSize), [System.Drawing.Imaging.ImageLockMode]::WriteOnly, $pf32)
[System.Runtime.InteropServices.Marshal]::Copy($fgBytes, 0, $monoData.Scan0, $fgBytes.Length)
$mono.UnlockBits($monoData)
$mono.Save("$assets\android-icon-monochrome.png", [System.Drawing.Imaging.ImageFormat]::Png)
$mono.Dispose()
Write-Output "Wrote android-icon-monochrome.png"

# ---- Android adaptive icon background: solid fill matching the logo's own background ----
$bg = New-Object System.Drawing.Bitmap($canvasSize, $canvasSize)
$gbg = [System.Drawing.Graphics]::FromImage($bg)
$gbg.Clear($bgColor)
$gbg.Dispose()
$bg.Save("$assets\android-icon-background.png", [System.Drawing.Imaging.ImageFormat]::Png)
$bg.Dispose()
Write-Output "Wrote android-icon-background.png"

# ---- favicon.png: small resize of the padded square icon ----
$iconImg = [System.Drawing.Bitmap]::new("$assets\icon.png")
$favSize = 196
$fav = New-Object System.Drawing.Bitmap($favSize, $favSize)
$gfav = [System.Drawing.Graphics]::FromImage($fav)
$gfav.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gfav.DrawImage($iconImg, 0, 0, $favSize, $favSize)
$gfav.Dispose()
$fav.Save("$assets\favicon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$fav.Dispose()
$iconImg.Dispose()
Write-Output "Wrote favicon.png"

# ---- splash-icon.png: transparent mark centered on a 1024x1024 transparent canvas (not currently wired into app.json, updated for consistency in case it's ever referenced) ----
$splash = New-Object System.Drawing.Bitmap($canvasSize, $canvasSize, $pf32)
$gsplash = [System.Drawing.Graphics]::FromImage($splash)
$gsplash.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$splashScale = [Math]::Min(($canvasSize * 0.5) / $tw, ($canvasSize * 0.5) / $th)
$sdw = [int]($tw * $splashScale); $sdh = [int]($th * $splashScale)
$sdx = [int](($canvasSize - $sdw) / 2); $sdy = [int](($canvasSize - $sdh) / 2)
$gsplash.DrawImage($trimmed, $sdx, $sdy, $sdw, $sdh)
$gsplash.Dispose()
$splash.Save("$assets\splash-icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$splash.Dispose()
Write-Output "Wrote splash-icon.png"

$trimmed.Dispose()
$fg.Dispose()
Write-Output "DONE_STEP_2"
