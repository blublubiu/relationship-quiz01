param(
  [string]$SupabaseCli = '',
  [ValidatePattern('^[a-z0-9]{20}$')][string]$ProjectRef = 'rozjamxieiyqzbhobrzt'
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $SupabaseCli) {
  $command = Get-Command supabase -ErrorAction SilentlyContinue
  if ($command) { $SupabaseCli = $command.Source }
  else { $SupabaseCli = Join-Path (Split-Path -Parent $projectRoot) 'supabase\supabase.exe' }
}
if (-not (Test-Path -LiteralPath $SupabaseCli -PathType Leaf)) {
  throw 'Supabase CLI not found. Supply its official installed executable with -SupabaseCli.'
}
Push-Location $projectRoot
try {
  # Deploy this checkout directly, including every imported content module.
  # Do not use the parent checkout HEAD or the older staging script.
  & $SupabaseCli functions deploy quiz-api --project-ref $ProjectRef --no-verify-jwt
  if ($LASTEXITCODE -ne 0) { throw 'Backend deployment failed. Frontend publication must wait.' }
  Write-Host "Deployed quiz-api from $projectRoot to $ProjectRef."
} finally { Pop-Location }
