$ErrorActionPreference = "Stop"

$Name = "DnDBastionManager"
$Python = if (Test-Path ".\\venv\\Scripts\\python.exe") { ".\\venv\\Scripts\\python.exe" } else { "python" }

Write-Host "Using Python: $Python"
Write-Host "Installing build tools..."
& $Python -m pip install --upgrade pip
& $Python -m pip install pyinstaller pywebview

Write-Host "Cleaning previous build artifacts..."
if (Test-Path "dist/$Name") { Remove-Item "dist/$Name" -Recurse -Force }
if (Test-Path "build") { Remove-Item "build" -Recurse -Force }
if (Test-Path "$Name.spec") { Remove-Item "$Name.spec" -Force }

Write-Host "Building..."
& $Python -m PyInstaller --noconfirm --clean --windowed --name $Name app.py `
  --paths "app" `
  --collect-submodules core_engine `
  --add-data "app/html;app/html" `
  --add-data "data;data" `
  --add-data "custom_packs;custom_packs" `
  --collect-all webview

Write-Host "Syncing editable folders next to the EXE..."
$distRoot = "dist/$Name"
if (Test-Path "$distRoot/custom_packs") { Remove-Item "$distRoot/custom_packs" -Recurse -Force }
if (Test-Path "$distRoot/data") { Remove-Item "$distRoot/data" -Recurse -Force }
Copy-Item "custom_packs" "$distRoot/custom_packs" -Recurse -Force
Copy-Item "data" "$distRoot/data" -Recurse -Force

Write-Host "Build done. Output: dist/$Name"
