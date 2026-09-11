$ErrorActionPreference = 'Stop'
param(
  [string]$PemPath = 'C:\Users\Code_pro\Downloads\codereview-1.2025-10-01.private-key.pem',
  [string]$EnvPath = '.env'
)
if (!(Test-Path -LiteralPath $PemPath)) {
  throw "PEM not found at $PemPath"
}
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((Get-Content -Raw -LiteralPath $PemPath)))
$content = ""
if (Test-Path -LiteralPath $EnvPath) {
  $content = Get-Content -Raw -LiteralPath $EnvPath
  if ($content -match '(?m)^GH_APP_PRIVATE_KEY=') {
    $content = [regex]::Replace($content, '(?m)^GH_APP_PRIVATE_KEY=.*$', "GH_APP_PRIVATE_KEY=$b64")
  } else {
    if ($content.Length -gt 0 -and -not $content.EndsWith("`n")) { $content += "`n" }
    $content += "GH_APP_PRIVATE_KEY=$b64"
  }
} else {
  $content = "GH_APP_PRIVATE_KEY=$b64"
}
Set-Content -LiteralPath $EnvPath -Value $content -Encoding UTF8
Write-Host "Updated GH_APP_PRIVATE_KEY"
