Add-Type -AssemblyName System.Drawing

$iconDirectory = Join-Path $PSScriptRoot '..\miniprogram\assets\icons'
$iconDirectory = [System.IO.Path]::GetFullPath($iconDirectory)
[System.IO.Directory]::CreateDirectory($iconDirectory) | Out-Null

function New-RoundedRectanglePath([float]$x, [float]$y, [float]$width, [float]$height, [float]$radius) {
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $radius * 2
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
  $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-Icon([string]$name, [string]$color, [scriptblock]$draw) {
  $bitmap = [System.Drawing.Bitmap]::new(81, 81, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $bitmap.SetResolution(144, 144)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $pen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml($color), 4.4)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  & $draw $graphics $pen
  $bitmap.Save((Join-Path $iconDirectory "$name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $pen.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

function Draw-Record($graphics, $pen) {
  $body = New-RoundedRectanglePath 13 24 55 42 8
  $graphics.DrawPath($pen, $body)
  $body.Dispose()
  $graphics.DrawLines($pen, [System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new(27, 24),
    [System.Drawing.PointF]::new(33, 17),
    [System.Drawing.PointF]::new(48, 17),
    [System.Drawing.PointF]::new(54, 24)
  ))
  $graphics.DrawEllipse($pen, 31, 34, 20, 20)
  $graphics.DrawEllipse($pen, 58, 31, 1, 1)
}

function Draw-Together($graphics, $pen) {
  $heart = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $heart.StartFigure()
  $heart.AddBezier(40.5, 65, 35, 59, 17, 48, 17, 33)
  $heart.AddBezier(17, 33, 17, 20, 33, 14, 40.5, 27)
  $heart.AddBezier(40.5, 27, 48, 14, 64, 20, 64, 33)
  $heart.AddBezier(64, 33, 64, 48, 46, 59, 40.5, 65)
  $heart.CloseFigure()
  $graphics.DrawPath($pen, $heart)
  $heart.Dispose()
}

function Draw-Calendar($graphics, $pen) {
  $body = New-RoundedRectanglePath 15 18 51 50 7
  $graphics.DrawPath($pen, $body)
  $body.Dispose()
  $graphics.DrawLine($pen, 16, 32, 65, 32)
  $graphics.DrawLine($pen, 28, 14, 28, 23)
  $graphics.DrawLine($pen, 53, 14, 53, 23)
  $graphics.DrawLine($pen, 27, 45, 31, 45)
  $graphics.DrawLine($pen, 40, 45, 44, 45)
  $graphics.DrawLine($pen, 53, 45, 57, 45)
  $graphics.DrawLine($pen, 27, 56, 31, 56)
  $graphics.DrawLine($pen, 40, 56, 44, 56)
}

function Draw-Settings($graphics, $pen) {
  $gear = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $points = [System.Collections.Generic.List[System.Drawing.PointF]]::new()
  for ($index = 0; $index -lt 24; $index++) {
    $angle = (-90 + $index * 15) * [Math]::PI / 180
    $radius = if (($index % 3) -eq 0) { 26 } elseif (($index % 3) -eq 1) { 21 } else { 21 }
    $points.Add([System.Drawing.PointF]::new(
      [float](40.5 + $radius * [Math]::Cos($angle)),
      [float](40.5 + $radius * [Math]::Sin($angle))
    ))
  }
  $gear.AddPolygon($points.ToArray())
  $graphics.DrawPath($pen, $gear)
  $gear.Dispose()
  $graphics.DrawEllipse($pen, 33, 33, 15, 15)
}

$icons = @{
  record = ${function:Draw-Record}
  together = ${function:Draw-Together}
  calendar = ${function:Draw-Calendar}
  settings = ${function:Draw-Settings}
}

foreach ($entry in $icons.GetEnumerator()) {
  New-Icon $entry.Key '#AAA39B' $entry.Value
  New-Icon "$($entry.Key)-active" '#C97968' $entry.Value
  New-Icon "$($entry.Key)-minimal-active" '#817A73' $entry.Value
  New-Icon "$($entry.Key)-space-active" '#F08FB3' $entry.Value
  New-Icon "$($entry.Key)-blue-active" '#8FB5FF' $entry.Value
}
