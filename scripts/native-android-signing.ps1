#Requires -Version 7.2
param([switch]$Initialize, [switch]$Build)
$ErrorActionPreference = 'Stop'

# Local Windows signing helper. The password is protected with this user's DPAPI
# key; neither passwords nor private keys are printed or included in build output.
$projectDirectory = Split-Path -Parent $PSScriptRoot
$signingDirectory = Join-Path $projectDirectory 'artifacts/native-signing-private'
$keystorePath = Join-Path $signingDirectory 'code3-upload.p12'
$credentialPath = Join-Path $signingDirectory 'upload-password.dpapi.xml'
$nativeTools = Join-Path $projectDirectory 'artifacts/native-tools'
if (-not $env:JAVA_HOME -and (Test-Path (Join-Path $nativeTools 'jdk'))) {
    $env:JAVA_HOME = (Get-ChildItem (Join-Path $nativeTools 'jdk') -Directory | Select-Object -First 1).FullName
}
if (-not $env:JAVA_HOME) { throw 'Set JAVA_HOME to JDK 21 before signing.' }
$keytoolPath = Join-Path $env:JAVA_HOME 'bin/keytool.exe'
if (-not (Test-Path -LiteralPath $keytoolPath)) { throw 'The configured Java keytool was not found.' }

if ($Initialize) {
    if ((Test-Path -LiteralPath $keystorePath) -or (Test-Path -LiteralPath $credentialPath)) {
        throw 'Signing material already exists. It has been kept; initialization never replaces an upload key.'
    }
    New-Item -ItemType Directory -Force -Path $signingDirectory | Out-Null
    $currentUserSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $systemSid = [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18')
    $directoryAcl = [System.Security.AccessControl.DirectorySecurity]::new()
    $directoryAcl.SetOwner($currentUserSid)
    $directoryAcl.SetAccessRuleProtection($true, $false)
    foreach ($sid in @($currentUserSid, $systemSid)) {
        $rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
            $sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $directoryAcl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $signingDirectory -AclObject $directoryAcl
    $randomPassword = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
    $protectedPassword = ConvertTo-SecureString $randomPassword -AsPlainText -Force
    $credential = [System.Management.Automation.PSCredential]::new('code3-upload', $protectedPassword)
    $credential | Export-Clixml -LiteralPath $credentialPath
    $randomPassword = $null
}
if (-not (Test-Path -LiteralPath $credentialPath)) { throw 'No local signing credential exists. Use -Initialize once, or use your existing owner-managed keystore environment variables with npm run native:android:release.' }
$credential = Import-Clixml -LiteralPath $credentialPath
try {
    $env:CODE3_ANDROID_STORE_PASSWORD = $credential.GetNetworkCredential().Password
    $env:CODE3_ANDROID_KEY_PASSWORD = $env:CODE3_ANDROID_STORE_PASSWORD
    $env:CODE3_ANDROID_KEYSTORE = $keystorePath
    $env:CODE3_ANDROID_KEY_ALIAS = 'code3-upload'
    if ($Initialize) {
        & $keytoolPath -genkeypair -keystore $keystorePath -storetype PKCS12 -storepass:env CODE3_ANDROID_STORE_PASSWORD -keypass:env CODE3_ANDROID_KEY_PASSWORD -alias code3-upload -keyalg RSA -keysize 4096 -validity 10000 -dname 'CN=Code 3 TCG, O=Anchor & Wing LLC, C=US'
        if ($LASTEXITCODE -ne 0) { throw 'Key generation failed. Preserved local files require review before retrying; no existing key was replaced.' }
    }
    if (-not (Test-Path -LiteralPath $keystorePath)) { throw 'The upload keystore is missing. Existing protected credentials have been kept.' }
    & $keytoolPath -list -v -keystore $keystorePath -storepass:env CODE3_ANDROID_STORE_PASSWORD -alias code3-upload
    if ($LASTEXITCODE -ne 0) { throw 'The upload keystore could not be verified.' }
    if ($Build) {
        if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $nativeTools 'sdk' }
        if (-not $env:GRADLE_USER_HOME) { $env:GRADLE_USER_HOME = Join-Path $nativeTools 'gradle' }
        if (-not $env:ANDROID_USER_HOME) { $env:ANDROID_USER_HOME = Join-Path $nativeTools 'android-user' }
        Push-Location $projectDirectory
        try {
            & node scripts/native-release.mjs android
            if ($LASTEXITCODE -ne 0) { throw 'Signed bundle build failed; nothing was uploaded.' }
        } finally { Pop-Location }
    }
    Write-Output 'Local upload key verified. Back up the key and password through the owner password manager before publishing. The DPAPI password file works only with this Windows account; it is not a portable backup.'
} finally {
    $env:CODE3_ANDROID_STORE_PASSWORD = $null
    $env:CODE3_ANDROID_KEY_PASSWORD = $null
    $credential = $null
    $protectedPassword = $null
}
