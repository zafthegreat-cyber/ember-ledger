# Hidden-input helper. Does not print the credential or enable billing.
$ErrorActionPreference = 'Stop'
$taskProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$taskEnvPath = Join-Path $taskProjectRoot 'backend\.env'
$taskSecret = Read-Host 'Paste the selected Anchor & Wing sandbox restricted key (rk_test_)' -AsSecureString
$taskSecretPointer = [IntPtr]::Zero
try {
    $taskSecretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecret)
    $taskPlainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskSecretPointer)
    if ($taskPlainKey -notmatch '^(rk|sk)_test_[A-Za-z0-9]+$') { throw 'A sandbox API key is required. Live keys are not accepted.' }
    $taskExisting = if (Test-Path -LiteralPath $taskEnvPath) { [IO.File]::ReadAllText($taskEnvPath) } else { '' }
    $taskUpdated = [regex]::Replace($taskExisting, '(?m)^[ \t]*(?:export[ \t]+)?STRIPE_SECRET_KEY[ \t]*=.*(?:\r?\n|$)', '')
    $taskUpdated = $taskUpdated.TrimEnd("`r", "`n") + "`r`nSTRIPE_SECRET_KEY=" + $taskPlainKey + "`r`n"
    [IO.File]::WriteAllText($taskEnvPath, $taskUpdated, [Text.UTF8Encoding]::new($false))
    Write-Output 'Sandbox key saved to ignored backend/.env. Billing remains disabled until setup is complete.'
} finally {
    if ($taskSecretPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskSecretPointer) }
    $taskPlainKey = $null
    $taskSecret = $null
    $taskExisting = $null
    $taskUpdated = $null
}
