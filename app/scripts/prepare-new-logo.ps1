Add-Type -AssemblyName System.Drawing
$assets = "C:\Users\cbago\Projects\@Batz\app\assets"
$fullSrc = "$assets\wordmark-full.png"

# ---- 1. Crop just the baseball "@" mark out of the full wordmark, save as
# logo-source.png -- generate-icons.ps1 reads this as its mark source for
# the app icon / adaptive icon / favicon / splash pipeline. ----
$full = [System.Drawing.Bitmap]::new($fullSrc)
$markRect = New-Object System.Drawing.Rectangle 185, 165, (450 - 185), (600 - 165)
$mark = New-Object System.Drawing.Bitmap($markRect.Width, $markRect.Height)
$gm = [System.Drawing.Graphics]::FromImage($mark)
$gm.DrawImage($full, (New-Object System.Drawing.Rectangle 0, 0, $markRect.Width, $markRect.Height), $markRect, [System.Drawing.GraphicsUnit]::Pixel)
$gm.Dispose()
$mark.Save("$assets\logo-source.png", [System.Drawing.Imaging.ImageFormat]::Png)
$mark.Dispose()
Write-Output "Wrote logo-source.png (ball mark crop)"

# ---- 2. Chroma-key + trim the FULL wordmark (mark + "Batz" text) to a
# transparent PNG, for use in the header where the whole "@Batz" wordmark
# fits (unlike the icon, which only has room for the mark). ----
$w = $full.Width
$h = $full.Height
$samples = New-Object System.Collections.Generic.List[System.Drawing.Color]
for ($x = 0; $x -lt $w; $x += 20) {
  $samples.Add($full.GetPixel($x, 3))
  $samples.Add($full.GetPixel($x, $h - 4))
}
for ($y = 0; $y -lt $h; $y += 20) {
  $samples.Add($full.GetPixel(3, $y))
  $samples.Add($full.GetPixel($w - 4, $y))
}
$avgR = [int](($samples | ForEach-Object { $_.R } | Measure-Object -Average).Average)
$avgG = [int](($samples | ForEach-Object { $_.G } | Measure-Object -Average).Average)
$avgB = [int](($samples | ForEach-Object { $_.B } | Measure-Object -Average).Average)

$pf32 = [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
$rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
$data = $full.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, $pf32)
$bytes = New-Object byte[] ($data.Stride * $h)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
$full.UnlockBits($data)

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

$transparent = New-Object System.Drawing.Bitmap($w, $h, $pf32)
$tdata = $transparent.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::WriteOnly, $pf32)
[System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $tdata.Scan0, $bytes.Length)
$transparent.UnlockBits($tdata)

$cw = $maxX - $minX + 1
$ch = $maxY - $minY + 1
$trimmed = New-Object System.Drawing.Bitmap($cw, $ch, $pf32)
$gt = [System.Drawing.Graphics]::FromImage($trimmed)
$gt.DrawImage($transparent, (New-Object System.Drawing.Rectangle 0, 0, $cw, $ch), (New-Object System.Drawing.Rectangle $minX, $minY, $cw, $ch), [System.Drawing.GraphicsUnit]::Pixel)
$gt.Dispose()
$transparent.Dispose()
$trimmed.Save("$assets\wordmark-transparent.png", [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "Wrote wordmark-transparent.png ($cw x $ch)"

$trimmed.Dispose()
$full.Dispose()
