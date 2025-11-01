param([string]$GhToken)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path "$PSScriptRoot/.."
Set-Location $root

if ($GhToken) { $Env:GH_TOKEN = $GhToken }
if (-not $Env:GH_TOKEN) { throw 'GH_TOKEN not set. Use -GhToken or set GH_TOKEN.' }

Write-Host Release: Building and publishing to GitHub Releases
npx electron-builder --win --publish always

# Read package info via Node to avoid JSON parsing quirks
$version = (& node -p "require('./package.json').version")
$owner   = (& node -p "require('./package.json').build.publish.owner")
$repo    = (& node -p "require('./package.json').build.publish.repo")

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$base = "https://api.github.com/repos/$owner/$repo"
$headers = @{ Authorization = "Bearer $Env:GH_TOKEN"; UserAgent = 'TraeAI'; Accept = 'application/vnd.github+json' }

try {
  $releases = Invoke-RestMethod -Uri "$base/releases" -Headers $headers -ErrorAction Stop
  $rel = $releases | Where-Object { $_.tag_name -eq "v$version" }
  if ($null -ne $rel -and $rel.draft -eq $true) {
    Write-Host Release: Publishing draft release v $version
    $patchBody = @{ draft = $false } | ConvertTo-Json
    Invoke-RestMethod -Uri "$base/releases/$($rel.id)" -Headers $headers -Method Patch -Body $patchBody -ContentType 'application/json' -ErrorAction Stop | Out-Null
  }

  $targetId = $null
  if ($rel) { $targetId = $rel.id }
  else {
    $relByTag = Invoke-RestMethod -Uri "$base/releases/tags/v$version" -Headers $headers -ErrorAction SilentlyContinue
    if ($relByTag) { $targetId = $relByTag.id }
  }
  if ($targetId) {
    $release = Invoke-RestMethod -Uri "$base/releases/$targetId" -Headers $headers -ErrorAction Stop
    $release.assets | Select-Object name, browser_download_url | Format-Table -AutoSize
  }
  Write-Host Release: Done. Release v $version is published.
}
catch {
  Write-Warning ('Release: Unable to finalize release state: {0}' -f $_.Exception.Message)
}