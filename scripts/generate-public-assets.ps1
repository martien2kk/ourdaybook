$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$assetRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../miniprogram/assets'))
[IO.Directory]::CreateDirectory((Join-Path $assetRoot 'images')) | Out-Null
# Original procedural artwork: flat colours, circles and lines; no source images or metadata.
$names = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'public-image-names.json') -Raw | ConvertFrom-Json
foreach ($name in $names) {
  $background = '#f7f4ee'; $accent = '#d8c5b3'
  if ($name -match 'space') { $background = '#111214'; $accent = '#514051' }
  elseif ($name -match 'blue') { $background = '#06163a'; $accent = '#254672' }
  elseif ($name -match 'warm') { $background = '#e7cfb2'; $accent = '#d3ad96' }
  $size = if ($name -match 'avatar|icon') { 144 } else { 960 }
  $height = if ($size -eq 144) { 144 } else { 1920 }
  $bitmap = [Drawing.Bitmap]::new($size, $height)
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([Drawing.ColorTranslator]::FromHtml($background))
  $brush = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml($accent))
  $graphics.FillEllipse($brush, [float]($size * .66), [float]($height * .76), [float]($size * .5), [float]($size * .5))
  $graphics.FillEllipse($brush, [float](-$size * .18), [float]($height * .86), [float]($size * .6), [float]($size * .6))
  if ($size -eq 144) {
    $pen = [Drawing.Pen]::new([Drawing.ColorTranslator]::FromHtml('#9a725a'), 5)
    $graphics.DrawRectangle($pen, 35, 38, 74, 68)
    $graphics.DrawLine($pen, 72, 38, 72, 106)
    $pen.Dispose()
  }
  $format = if ($name.EndsWith('.png')) { [Drawing.Imaging.ImageFormat]::Png } else { [Drawing.Imaging.ImageFormat]::Jpeg }
  $bitmap.Save((Join-Path $assetRoot "images/$name"), $format)
  $brush.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
foreach ($name in @('city-a.svg', 'city-b.svg')) {
  [IO.File]::WriteAllText((Join-Path $assetRoot "images/$name"), '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480"><rect width="640" height="480" fill="#f7f4ee"/><circle cx="490" cy="110" r="48" fill="#d8c5b3"/><path d="M60 400V220H180V400M230 400V150H370V400M420 400V260H570V400" fill="none" stroke="#9a725a" stroke-width="12"/></svg>')
}
& (Join-Path $PSScriptRoot 'generate-tab-icons.ps1')
Write-Output 'Generated public backgrounds, illustrations, app icons and navigation icons.'
