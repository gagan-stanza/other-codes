param(
    [string]$Message = "update"
)

Set-Location "C:\Users\Gagan Rajput\Documents\codes_scripts\other-codes"

git add .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

git commit -m $Message
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

git pull --rebase
if ($LASTEXITCODE -ne 0) {
    Write-Host "Rebase hit a conflict (likely data.json). Resolve it, run 'git rebase --continue', then 'git push'." -ForegroundColor Yellow
    exit $LASTEXITCODE
}

git push