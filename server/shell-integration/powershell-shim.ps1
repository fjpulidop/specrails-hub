# SpecRails Hub — PowerShell shell-integration shim
# Loaded via -NoLogo -NoExit -File <shim.ps1>. Dot-sources the user's real
# $PROFILE if it exists, then wraps the prompt function with OSC 133 marks.

$env:SPECRAILS_SHELL_INTEGRATION_LOADED = '1'

# Dot-source the user's real profile so their environment, aliases, modules load.
$__srUserProfile = $PROFILE.CurrentUserAllHosts
if (Test-Path -LiteralPath $__srUserProfile) {
    . $__srUserProfile
}

# Capture the user's existing prompt function so we can chain to it.
$__srOriginalPrompt = $function:prompt

function global:__sr-OscEmit([string]$seq) {
    [Console]::Write($seq)
}

# Override prompt with our wrapper.
function global:prompt {
    $exit = if ($global:LASTEXITCODE) { [int]$global:LASTEXITCODE } else { 0 }

    # post-exec for the *previous* command, then cwd, then prompt-start.
    __sr-OscEmit ("`e]133;D;{0}`a" -f $exit)
    __sr-OscEmit ("`e]1337;CurrentDir={0}`a" -f (Get-Location).Path)
    __sr-OscEmit "`e]133;A`a"

    if ($__srOriginalPrompt) {
        & $__srOriginalPrompt
    } else {
        "PS $((Get-Location).Path)> "
    }

    __sr-OscEmit "`e]133;B`a"
}

# Trace pre-exec via PSReadLine if available.
if (Get-Module -Name PSReadLine -ListAvailable) {
    try {
        Set-PSReadLineKeyHandler -Key Enter -ScriptBlock {
            [Microsoft.PowerShell.PSConsoleReadLine]::AcceptLine()
            __sr-OscEmit "`e]133;C`a"
        }
    } catch {
        # PSReadLine version may not support custom handlers; ignore.
    }
}
