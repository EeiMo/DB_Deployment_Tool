Param(
    [switch]$Clean
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path "$PSScriptRoot/.."
Set-Location $root

Write-Host "[build] Working directory: $root"

if ($Clean) {
  Write-Host "[build] Cleaning dist/"
  if (Test-Path "$root/dist") { Remove-Item "$root/dist" -Recurse -Force }
}

Write-Host "[build] Installing dependencies"
npm install

Write-Host "[build] Packing Windows installer (no publish)"
npx electron-builder --win --publish never

Write-Host "[build] Done. Artifacts in dist/"