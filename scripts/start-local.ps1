param([switch]$Stop)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$stateDir = Join-Path $repo '.local'
$pidFile = Join-Path $stateDir 'processes.json'
if ($Stop) {
    if (Test-Path -LiteralPath $pidFile) {
        foreach ($entry in (Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json)) {
            $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($entry.id)" -ErrorAction SilentlyContinue
            if ($process -and $process.Name -eq 'node.exe' -and $process.CommandLine.Contains($repo)) {
                Stop-Process -Id $entry.id
            }
        }
        Remove-Item -LiteralPath $pidFile
    }
    Write-Output 'Local app and simulator stopped. Database and measurement files are preserved.'
    exit
}
if (Test-Path -LiteralPath $pidFile) {
    throw 'A local session is recorded. Run scripts/start-local.ps1 -Stop before starting another.'
}
if (-not (Test-Path (Join-Path $repo 'server/.env'))) { throw 'Create server/.env using server/.env.example first.' }
$nodePath = (Get-Command node).Source
$env:Path = "$(Split-Path $nodePath);$env:SystemRoot\System32;$env:SystemRoot;C:\Program Files\Git\cmd;C:\Program Files\Docker\Docker\resources\bin"
foreach ($port in @(3001,5173,4841)) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { throw "Port $port is already in use." }
}
Push-Location $repo
try {
    docker compose -f compose.local.yml up -d --wait db
    if ($LASTEXITCODE) { throw 'Local database could not start.' }
    npm run build:server
    if ($LASTEXITCODE) { throw 'Server build failed.' }
    npm run db:migrate -w server
    if ($LASTEXITCODE) { throw 'Database migration failed.' }
    npm run db:seed -w server
    if ($LASTEXITCODE) { throw 'Database seed failed.' }
    New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
    $processes = @()
    try {
        foreach ($name in @('simulator','server','client')) {
            $entry = switch ($name) {
                'simulator' { Join-Path $repo 'server/dist/simulation/opcuaSimulationServer.js' }
                'server' { Join-Path $repo 'server/dist/app.js' }
                'client' { Join-Path $repo 'node_modules/vite/bin/vite.js' }
            }
            $arguments = if ($name -eq 'client') { "`"$entry`" --host 127.0.0.1 --port 5173 --strictPort" } else { "`"$entry`"" }
            $directory = if ($name -eq 'client') { Join-Path $repo 'client' } else { Join-Path $repo 'server' }
            $process = Start-Process -FilePath $nodePath -ArgumentList $arguments -WorkingDirectory $directory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $stateDir "$name.log") -RedirectStandardError (Join-Path $stateDir "$name-error.log")
            $processes += @{ name=$name; id=$process.Id }
            $processes | ConvertTo-Json | Set-Content -LiteralPath $pidFile
        }
        Write-Output 'Dashboard: http://localhost:5173 | API: http://localhost:3001 | Simulator: port 4841'
        Write-Output 'Login: admin / SEED_ADMIN_PASSWORD from server/.env. Logs: .local/'
    } catch {
        & $PSCommandPath -Stop
        throw
    }
} finally { Pop-Location }
