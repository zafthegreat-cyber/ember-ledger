#Requires -Version 7.2
<#
Run from a PowerShell window whose current directory is outside this workspace,
after closing Codex, editors, Explorer windows, and build tools using the folders.
The default only prints a plan. Add -Apply to rename directories and repair Git.
This does not change a remote repository, deployment, saved data, or file contents.
#>
[CmdletBinding()]
param(
  [string]$WorkspacePath = 'C:\Users\Zena\Apps\Embers ledger',
  [switch]$Apply,
  [switch]$KeepLegacyAliases
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$renameMap = [ordered]@{
  'ember-ledger' = 'code3-tcg-repository'
  'ember-hearth-command-pass-clean-final-5ba6627' = 'code3-tcg-app'
  'ember-hearth-command-pass' = 'code3-tcg-command-review'
  'ember-hearth-command-pass-clean-dependency-closure' = 'code3-tcg-dependency-review'
  'ember-hearth-command-pass-clean-final-d4c1cdd' = 'code3-tcg-final-review-d4c1cdd'
  'ember-hearth-home' = 'code3-tcg-home-review'
  'ember-ledger-forge-scout-clean' = 'code3-tcg-forge-scout-review'
  'ember-ledger-inventory-fix-clean' = 'code3-tcg-inventory-review'
}

function Get-FullDirectory([string]$Path) {
  $item = Get-Item -LiteralPath $Path -Force
  if (-not $item.PSIsContainer) { throw 'An expected directory is not a directory.' }
  $resolved = [IO.Path]::GetFullPath($item.FullName).TrimEnd([IO.Path]::DirectorySeparatorChar)
  if ($resolved -eq [IO.Path]::GetPathRoot($resolved).TrimEnd([IO.Path]::DirectorySeparatorChar)) { throw 'A filesystem root cannot be renamed.' }
  $ancestor = $item
  while ($null -ne $ancestor) {
    if ($ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse points are not supported. No folders were renamed.' }
    $ancestor = $ancestor.Parent
  }
  return $resolved
}
function Test-Within([string]$Path, [string]$Root) {
  return $Path.Equals($Root, [StringComparison]::OrdinalIgnoreCase) -or $Path.StartsWith($Root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
}
function Invoke-WorkspaceGit([string]$Repository, [string[]]$GitArguments) {
  $output = @(& git --no-optional-locks -c "safe.directory=$Repository" -c core.quotePath=false -C $Repository @GitArguments 2>&1)
  if ($LASTEXITCODE -ne 0) { throw "Git $($GitArguments[0]) failed in an expected checkout. No Git error contents were printed." }
  return ($output -join "`n")
}
function Get-TextHash([string]$Text) {
  return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($Text)))
}
function Get-CheckoutSnapshot([string]$Repository) {
  $files = @{}
  $paths = @(
    (Invoke-WorkspaceGit $Repository @('diff', '--name-only', '--no-renames', '-z')) -split "`0"
    (Invoke-WorkspaceGit $Repository @('diff', '--cached', '--name-only', '--no-renames', '-z')) -split "`0"
    (Invoke-WorkspaceGit $Repository @('ls-files', '--others', '--exclude-standard', '-z')) -split "`0"
  ) | Where-Object { $_ } | Sort-Object -Unique
  foreach ($relativePath in $paths) {
    $filePath = [IO.Path]::GetFullPath((Join-Path $Repository $relativePath))
    if (-not (Test-Within $filePath $Repository)) { throw 'Git returned a path outside its checkout.' }
    if (Test-Path -LiteralPath $filePath -PathType Leaf) { $files[$relativePath] = (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash }
    else { $files[$relativePath] = 'ABSENT' }
  }
  return @{
    Head = Invoke-WorkspaceGit $Repository @('rev-parse', '--verify', 'HEAD')
    Ref = Invoke-WorkspaceGit $Repository @('rev-parse', '--abbrev-ref', 'HEAD')
    Status = Get-TextHash (Invoke-WorkspaceGit $Repository @('status', '--porcelain=v1', '-z', '--untracked-files=all'))
    Files = $files
  }
}
function Rename-CheckedDirectory([string]$Source, [string]$Destination, [string]$AllowedRoot) {
  $resolvedSource = Get-FullDirectory $Source
  $resolvedDestination = [IO.Path]::GetFullPath($Destination)
  if (-not (Test-Within $resolvedSource $AllowedRoot) -or -not (Test-Within $resolvedDestination $AllowedRoot)) { throw 'A rename escaped its allowed directory.' }
  if ([IO.Path]::GetDirectoryName($resolvedSource) -ne [IO.Path]::GetDirectoryName($resolvedDestination)) { throw 'Only a rename within the same parent is allowed.' }
  if (Test-Path -LiteralPath $resolvedDestination) { throw 'A destination already exists; nothing will be overwritten.' }
  Rename-Item -LiteralPath $resolvedSource -NewName ([IO.Path]::GetFileName($resolvedDestination))
}
function Assert-ExpectedJunction([string]$Path, [string]$Target) {
  $item = Get-Item -LiteralPath $Path -Force
  if (-not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.LinkType -ne 'Junction') { throw 'A compatibility alias is not the expected junction.' }
  $targets = @($item.Target)
  if ($targets.Count -ne 1 -or [IO.Path]::GetFullPath($targets[0]) -ne [IO.Path]::GetFullPath($Target)) { throw 'A compatibility alias points to an unexpected target.' }
}

$oldRoot = Get-FullDirectory $WorkspacePath
if ([IO.Path]::GetFileName($oldRoot) -cne 'Embers ledger') { throw 'The workspace leaf must be exactly Embers ledger.' }
$parentPath = [IO.Path]::GetDirectoryName($oldRoot)
$newRoot = [IO.Path]::Combine($parentPath, 'Code 3 TCG')
if ($oldRoot.IndexOfAny([char[]]'*?[]') -ge 0) { throw 'Wildcard characters in the workspace path are not supported.' }
if (Test-Path -LiteralPath $newRoot) { throw 'The Code 3 TCG destination already exists. No folders were renamed.' }
$oldMain = Join-Path $oldRoot 'ember-ledger'
foreach ($required in @('ember-ledger', 'ember-hearth-command-pass-clean-final-5ba6627')) {
  $null = Get-FullDirectory (Join-Path $oldRoot $required)
}
$children = @(Get-ChildItem -LiteralPath $oldRoot -Directory -Force)
foreach ($child in $children) {
  $null = Get-FullDirectory $child.FullName
  if ($child.Name -match '(?i)ember' -and -not $renameMap.Contains($child.Name)) { throw 'An unrecognized Ember directory needs a reviewed rename mapping.' }
}
$moves = @($renameMap.Keys | Where-Object { Test-Path -LiteralPath (Join-Path $oldRoot $_) } | ForEach-Object {
  if (Test-Path -LiteralPath (Join-Path $oldRoot $renameMap[$_])) { throw 'A child destination already exists. No folders were renamed.' }
  [pscustomobject]@{ Old = $_; New = $renameMap[$_] }
})
$worktreeText = Invoke-WorkspaceGit $oldMain @('worktree', 'list', '--porcelain')
$worktrees = @($worktreeText -split "`n" | Where-Object { $_.StartsWith('worktree ') } | ForEach-Object { Get-FullDirectory $_.Substring(9) })
if ($worktrees.Count -eq 0) { throw 'The primary repository has no registered worktrees.' }
foreach ($worktree in $worktrees) {
  if (-not (Test-Within $worktree $oldRoot)) { throw 'An external worktree needs separate review. No folders were renamed.' }
}
function Convert-WorkspacePath([string]$Path) {
  $relative = [IO.Path]::GetRelativePath($oldRoot, $Path)
  $parts = $relative.Split([char[]]@([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar), 2)
  if ($renameMap.Contains($parts[0])) { $parts[0] = $renameMap[$parts[0]] }
  return [IO.Path]::Combine($newRoot, ($parts -join [IO.Path]::DirectorySeparatorChar))
}
Write-Output "Workspace: $oldRoot -> $newRoot"
$moves | ForEach-Object { Write-Output "$($_.Old) -> $($_.New)" }
Write-Output "Git worktrees to preserve and repair: $($worktrees.Count)"
if ($KeepLegacyAliases) { Write-Output 'Compatibility: create hidden junction aliases for the old workspace and child names after all checks pass.' }
if (-not $Apply) { Write-Output 'PLAN ONLY. No changes made. Close workspace apps, then run from outside the workspace with -Apply.'; return }
$currentPath = [IO.Path]::GetFullPath($PWD.ProviderPath)
if (Test-Within $currentPath $oldRoot) { throw 'Open PowerShell in a directory outside this workspace before using -Apply.' }

$snapshots = @{}
foreach ($worktree in $worktrees) { $snapshots[$worktree] = Get-CheckoutSnapshot $worktree }
$parentRenamed = $false
$completedMoves = [Collections.Generic.List[object]]::new()
$createdAliases = [Collections.Generic.List[object]]::new()
$newMain = Convert-WorkspacePath $oldMain
try {
  Rename-CheckedDirectory $oldRoot $newRoot $parentPath
  $parentRenamed = $true
  foreach ($move in $moves) {
    Rename-CheckedDirectory (Join-Path $newRoot $move.Old) (Join-Path $newRoot $move.New) $newRoot
    $completedMoves.Add($move)
  }
  $newLinked = @($worktrees | Where-Object { $_ -ne $oldMain } | ForEach-Object { Convert-WorkspacePath $_ })
  $null = Invoke-WorkspaceGit $newMain (@('worktree', 'repair') + $newLinked)
  $expectedWorktrees = @($worktrees | ForEach-Object { Convert-WorkspacePath $_ } | Sort-Object)
  $actualWorktrees = @((Invoke-WorkspaceGit $newMain @('worktree', 'list', '--porcelain')) -split "`n" | Where-Object { $_.StartsWith('worktree ') } | ForEach-Object { Get-FullDirectory $_.Substring(9) } | Sort-Object)
  if (($expectedWorktrees -join "`n") -cne ($actualWorktrees -join "`n")) { throw 'Git worktree paths did not match the rename plan.' }
  foreach ($worktree in $worktrees) {
    $before = $snapshots[$worktree]
    $after = Get-CheckoutSnapshot (Convert-WorkspacePath $worktree)
    if ($before.Head -cne $after.Head -or $before.Ref -cne $after.Ref -or $before.Status -cne $after.Status -or $before.Files.Count -ne $after.Files.Count) { throw 'Checkout state changed during the rename.' }
    foreach ($file in $before.Files.Keys) { if ($before.Files[$file] -cne $after.Files[$file]) { throw 'A changed or untracked file did not retain its original bytes.' } }
  }
  if ($KeepLegacyAliases) {
    $aliases = @($moves | ForEach-Object { [pscustomobject]@{ Path = Join-Path $newRoot $_.Old; Target = Join-Path $newRoot $_.New } })
    $aliases += [pscustomobject]@{ Path = $oldRoot; Target = $newRoot }
    foreach ($alias in $aliases) {
      if (Test-Path -LiteralPath $alias.Path) { throw 'A compatibility alias path already exists.' }
      $null = New-Item -ItemType Junction -Path $alias.Path -Target $alias.Target
      $createdAliases.Add($alias)
      Assert-ExpectedJunction $alias.Path $alias.Target
      Set-ItemProperty -LiteralPath $alias.Path -Name Attributes -Value ([IO.FileAttributes]::Hidden)
      Assert-ExpectedJunction $alias.Path $alias.Target
      if (-not ((Get-Item -LiteralPath $alias.Path -Force).Attributes -band [IO.FileAttributes]::Hidden)) { throw 'A compatibility alias could not be hidden.' }
    }
    Write-Output "Hidden compatibility aliases verified: $($createdAliases.Count)"
  }
  Write-Output 'SUCCESS: All folder names, Git worktree connections, HEADs, refs, dirty states, and changed/untracked file hashes verified.'
  Write-Output "Reopen the project at: $newMain"
  Write-Output "Active application: $(Join-Path $newRoot 'code3-tcg-app')"
}
catch {
  $originalFailure = $_.Exception.Message
  $rollbackErrors = [Collections.Generic.List[string]]::new()
  for ($index = $createdAliases.Count - 1; $index -ge 0; $index--) {
    $alias = $createdAliases[$index]
    try {
      Assert-ExpectedJunction $alias.Path $alias.Target
      Remove-Item -LiteralPath $alias.Path -Force
    }
    catch { $rollbackErrors.Add('A compatibility alias needs manual review; no real directory was deleted.') }
  }
  if ($parentRenamed) {
    for ($index = $completedMoves.Count - 1; $index -ge 0; $index--) {
      $move = $completedMoves[$index]
      try { Rename-CheckedDirectory (Join-Path $newRoot $move.New) (Join-Path $newRoot $move.Old) $newRoot }
      catch { $rollbackErrors.Add('A child folder could not be restored; no directory was overwritten or deleted.') }
    }
    try { Rename-CheckedDirectory $newRoot $oldRoot $parentPath }
    catch { $rollbackErrors.Add('The outer folder could not be restored; no directory was overwritten or deleted.') }
    if (Test-Path -LiteralPath $oldMain) {
      try { $null = Invoke-WorkspaceGit $oldMain (@('worktree', 'repair') + @($worktrees | Where-Object { $_ -ne $oldMain })) }
      catch { $rollbackErrors.Add('Original Git links need manual worktree repair.') }
    }
  }
  if ($rollbackErrors.Count) { throw "$originalFailure Rollback needs review: $($rollbackErrors -join ' ')" }
  throw "$originalFailure Directory renames were rolled back, or no rename occurred."
}
