# Gera icons/sidebar-19.png e sidebar-38.png a partir do icon512.png atual.
Add-Type -AssemblyName System.Drawing
$dir = Join-Path $PSScriptRoot 'extension\icons'
$src = [System.Drawing.Image]::FromFile((Join-Path $dir 'icon512.png'))
foreach ($s in 19, 38) {
  $bmp = New-Object System.Drawing.Bitmap $s, $s
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.DrawImage($src, 0, 0, $s, $s)
  $bmp.Save((Join-Path $dir "sidebar-$s.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}
$src.Dispose()
Write-Host "OK: sidebar-19.png e sidebar-38.png gerados em extension\icons"
