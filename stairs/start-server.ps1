[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$Port = 5173
)

$ErrorActionPreference = 'Stop'

$node = Get-Command node -CommandType Application -ErrorAction SilentlyContinue
if (-not $node) {
    throw 'Node.js is required to start the stairs server. Install Node.js and ensure node is available on PATH.'
}

& $node.Source (Join-Path $PSScriptRoot 'serve.mjs') $Port
exit $LASTEXITCODE
