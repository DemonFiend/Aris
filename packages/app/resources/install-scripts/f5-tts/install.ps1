# Quick Install script for F5-TTS (Windows).
# Invoked by Aris via install:run-quick-install with -InstallDir and -GpuBackend.
# Stdout lines prefixed `[ARIS-PROGRESS] <pct>|<stage>|<msg>` are parsed by the
# main process and turned into QuickInstallProgress IPC events; everything else
# streams as raw log output to the install modal.

param(
  [Parameter(Mandatory = $true)][string]$InstallDir,
  [ValidateSet('cuda', 'directml', 'rocm', 'cpu')]
  [string]$GpuBackend = 'cpu'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Emit-Progress {
  param([int]$Pct, [string]$Stage, [string]$Msg)
  Write-Host "[ARIS-PROGRESS] $Pct|$Stage|$Msg"
}

function Find-Python {
  foreach ($cmd in @('python', 'python3', 'py')) {
    $resolved = Get-Command $cmd -ErrorAction SilentlyContinue
    if (-not $resolved) { continue }
    $version = & $resolved.Source --version 2>&1
    if ($version -match '(\d+)\.(\d+)') {
      $major = [int]$Matches[1]
      $minor = [int]$Matches[2]
      if (($major -eq 3 -and $minor -ge 10) -or $major -gt 3) {
        return $resolved.Source
      }
    }
  }
  return $null
}

Emit-Progress 5 'checking' 'Verifying Python and git...'
$pythonExe = Find-Python
if (-not $pythonExe) {
  Write-Error 'Python 3.10+ is required. Install from https://www.python.org/downloads/ (check "Add Python to PATH") and re-run.'
  exit 1
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Error 'git is required. Install from https://git-scm.com/download/win and re-run.'
  exit 1
}

if (-not (Test-Path $InstallDir)) {
  New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}
$repoDir = Join-Path $InstallDir 'F5-TTS'

Emit-Progress 12 'cloning' 'Cloning F5-TTS repository...'
if (Test-Path $repoDir) {
  Set-Location $repoDir
  git pull --rebase 2>&1 | Out-Null
} else {
  Set-Location $InstallDir
  git clone --depth 1 https://github.com/SWivid/F5-TTS.git
  Set-Location $repoDir
}

Emit-Progress 22 'venv' 'Creating Python virtual environment...'
& $pythonExe -m venv venv

$venvPython = Join-Path $repoDir 'venv\Scripts\python.exe'
if (-not (Test-Path $venvPython)) {
  Write-Error ('venv creation failed - ' + $venvPython + ' not found')
  exit 1
}

Emit-Progress 30 'deps' 'Upgrading pip...'
& $venvPython -m pip install --upgrade pip

Emit-Progress 40 'deps' ('Installing PyTorch (' + $GpuBackend + ' backend) - this may take 5-10 minutes...')
switch ($GpuBackend) {
  'cuda' {
    & $venvPython -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121
  }
  'directml' {
    & $venvPython -m pip install torch torchaudio
    & $venvPython -m pip install torch-directml
  }
  'rocm' {
    & $venvPython -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/rocm6.0
  }
  default {
    & $venvPython -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
  }
}
if ($LASTEXITCODE -ne 0) { Write-Error 'PyTorch install failed'; exit 1 }

Emit-Progress 65 'deps' 'Installing F5-TTS package...'
& $venvPython -m pip install -e .
if ($LASTEXITCODE -ne 0) { Write-Error 'F5-TTS install failed'; exit 1 }

Emit-Progress 80 'wrapper' 'Installing Aris API wrapper...'
& $venvPython -m pip install fastapi uvicorn numpy

$apiSource = Join-Path $PSScriptRoot 'api_server.py'
$apiDest = Join-Path $repoDir 'api_server.py'
Copy-Item $apiSource $apiDest -Force

$launcherLines = @(
  '@echo off',
  'cd /d "%~dp0"',
  'call venv\Scripts\activate.bat',
  'python -m uvicorn api_server:app --host 127.0.0.1 --port 7860'
)
$launcherPath = Join-Path $repoDir 'start.bat'
[System.IO.File]::WriteAllText($launcherPath, ($launcherLines -join "`r`n"), [System.Text.Encoding]::ASCII)

Emit-Progress 95 'launching' 'Starting F5-TTS server on http://127.0.0.1:7860 ...'
Start-Process -FilePath $launcherPath -WindowStyle Minimized -WorkingDirectory $repoDir

Emit-Progress 100 'done' 'F5-TTS is starting. Aris will detect it within a few seconds.'
exit 0
