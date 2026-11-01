param([string]$EncryptedTokenPath = (Join-Path $PSScriptRoot '../.vercel/ebay-deletion-verification-token.dpapi'))

# Same Windows account only. The recovery copy uses DPAPI and is excluded from
# Git and Vercel uploads. Never print the plaintext token.
$ErrorActionPreference = 'Stop'
$privateToken = Get-Content -Raw -LiteralPath $EncryptedTokenPath | ConvertTo-SecureString
$privateTokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($privateToken)
try {
    $privateTokenText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($privateTokenPointer)
    if ($privateTokenText -notmatch '^[A-Za-z0-9_-]{32,80}$') { throw 'The stored eBay verification token is invalid.' }
    Set-Clipboard -Value $privateTokenText
    Write-Output 'The verification token is on your clipboard. Paste it into eBay, then clear your clipboard. Its value was not printed.'
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($privateTokenPointer)
    $privateTokenText = $null
}
