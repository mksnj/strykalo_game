param([Parameter(Mandatory=$true)][string]$ProjectRoot,
      [Parameter(Mandatory=$true)][string]$Inventory,
      [Parameter(Mandatory=$true)][string]$Archive)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$rootPath = [IO.Path]::GetFullPath($ProjectRoot)
$files = [IO.File]::ReadAllText($Inventory, [Text.Encoding]::UTF8) | ConvertFrom-Json
$stream = [IO.File]::Open($Archive, [IO.FileMode]::Create, [IO.FileAccess]::ReadWrite)
try {
    $zip = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create, $true, [Text.Encoding]::UTF8)
    try {
        foreach ($name in $files) {
            $sourcePath = [IO.Path]::GetFullPath([IO.Path]::Combine($rootPath, $name))
            if (-not $sourcePath.StartsWith($rootPath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Source path escapes the project' }
            [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $sourcePath, $name, [IO.Compression.CompressionLevel]::Optimal)
        }
    } finally { $zip.Dispose() }
} finally { $stream.Dispose() }
# Independently read every compressed entry, verifying bytes against the source.
$zip = [IO.Compression.ZipFile]::OpenRead($Archive)
try {
    $names = @()
    foreach ($entry in $zip.Entries) {
        $entryStream = $entry.Open()
        $sourceStream = [IO.File]::OpenRead([IO.Path]::Combine($rootPath, $entry.FullName))
        $hasher = [Security.Cryptography.SHA256]::Create()
        try {
            $packedHash = [BitConverter]::ToString($hasher.ComputeHash($entryStream))
            $sourceHash = [BitConverter]::ToString($hasher.ComputeHash($sourceStream))
            if ($packedHash -ne $sourceHash) { throw ('Archive content mismatch: ' + $entry.FullName) }
        } finally { $entryStream.Dispose(); $sourceStream.Dispose(); $hasher.Dispose() }
        $names += $entry.FullName
    }
    ConvertTo-Json -InputObject $names -Compress
} finally { $zip.Dispose() }
