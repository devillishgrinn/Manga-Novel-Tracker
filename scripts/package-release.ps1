$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content (Join-Path $projectRoot "package.json") -Raw | ConvertFrom-Json
$releaseRoot = Join-Path $projectRoot "release"
$stagingRoot = Join-Path $releaseRoot "Manga-Novel-Tracker-$($package.version)"
$zipPath = Join-Path $releaseRoot "Manga-Novel-Tracker-$($package.version).zip"

if (Test-Path $stagingRoot) { Remove-Item -LiteralPath $stagingRoot -Recurse -Force }
if (Test-Path $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
New-Item -ItemType Directory -Path $stagingRoot -Force | Out-Null

Copy-Item (Join-Path $projectRoot "manifest.json") $stagingRoot
Copy-Item (Join-Path $projectRoot "popup.html") $stagingRoot
Copy-Item (Join-Path $projectRoot "dashboard.html") $stagingRoot
Copy-Item (Join-Path $projectRoot "settings.html") $stagingRoot
Copy-Item (Join-Path $projectRoot "dist") $stagingRoot -Recurse
Copy-Item (Join-Path $projectRoot "assets") $stagingRoot -Recurse

Compress-Archive -Path (Join-Path $stagingRoot "*") -DestinationPath $zipPath -Force
$hash = (Get-FileHash $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -Path "$zipPath.sha256" -Value "$hash  $(Split-Path $zipPath -Leaf)"
Write-Output "Created $zipPath"
