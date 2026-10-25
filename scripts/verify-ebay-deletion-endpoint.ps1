param(
    [Parameter(Mandatory=$true)][string]$BaseUrl,
    [switch]$ProtectedCandidate,
    [string]$VercelCliPath = 'C:/Users/dillo/AppData/Local/npm-cache/_npx/3b18615b9ad4807e/node_modules/vercel/dist/index.js'
)
$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$callbackUrl = 'https://code3tcg.app/api/ebay/account-deletion'
$challenge = 'code3-validation-' + [Guid]::NewGuid().ToString('N')
function Invoke-EndpointCheck([string]$Path, [string]$Method = 'GET') {
    if ($ProtectedCandidate) {
        $responseFile = Join-Path $taskRoot ('.vercel/ebay-response-' + [Guid]::NewGuid().ToString('N') + '.json')
        $curlArguments = @($VercelCliPath, 'curl', $Path, '--deployment', $BaseUrl, '--scope', 'team_SrWvifkcXd622u47TnXCZUT0', '--', '--silent', '--show-error', '--output', $responseFile, '--write-out', '%{http_code}|%{content_type}')
        if ($Method -eq 'POST') { $curlArguments += @('--request','POST','--header','Content-Type: application/json','--data','{}') }
        $metadata = & node @curlArguments
        if ($LASTEXITCODE -ne 0) { throw 'The authenticated candidate request failed.' }
        $fields = ([string]$metadata).Trim() -split '\|',2
        return @{ Status=[int]$fields[0]; ContentType=$fields[1]; Body=(Get-Content -Raw -LiteralPath $responseFile) }
    }
    $requestOptions = @{ Uri=($BaseUrl.TrimEnd('/')+$Path); Method=$Method; SkipHttpErrorCheck=$true; MaximumRedirection=0; TimeoutSec=30 }
    if ($Method -eq 'POST') { $requestOptions.Body='{}'; $requestOptions.ContentType='application/json' }
    $result = Invoke-WebRequest @requestOptions
    return @{ Status=[int]$result.StatusCode; ContentType=[string]$result.Headers['Content-Type']; Body=[string]$result.Content }
}
$response = Invoke-EndpointCheck ('/api/ebay/account-deletion?challenge_code='+$challenge)
if ($response.Status -ne 200 -or $response.ContentType -notmatch '^application/json') { throw ('Challenge route failed: HTTP '+$response.Status+', content type '+$response.ContentType) }
$privateToken = Get-Content -Raw -LiteralPath (Join-Path $taskRoot '.vercel/ebay-deletion-verification-token.dpapi') | ConvertTo-SecureString
$privateTokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($privateToken)
try {
    $privateTokenText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($privateTokenPointer)
    $expectedHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($challenge+$privateTokenText+$callbackUrl))).ToLowerInvariant()
    if (($response.Body | ConvertFrom-Json).challengeResponse -cne $expectedHash) { throw 'The deployed challenge does not match the configured verification token and exact callback URL.' }
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($privateTokenPointer)
    $privateTokenText=$null
}
$unsignedPost = Invoke-EndpointCheck '/api/ebay/account-deletion' 'POST'
if ($unsignedPost.Status -ne 412) { throw ('Unsigned notification should be rejected with 412; received '+$unsignedPost.Status) }
$missingChallenge = Invoke-EndpointCheck '/api/ebay/account-deletion'
if ($missingChallenge.Status -ne 400) { throw ('Missing challenge should be rejected with 400; received '+$missingChallenge.Status) }
Write-Output ('PASS '+$BaseUrl+': GET 200 application/json; exact challenge hash matches; unsigned POST 412; missing challenge 400. No secret values printed.')
