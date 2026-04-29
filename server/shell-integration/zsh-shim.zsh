# SpecRails Hub — zsh shell-integration shim
# Loaded via ZDOTDIR override when the user spawns a terminal in the hub.
# Sources the user's real ~/.zshrc, then layers OSC 133 / OSC 1337 hooks on top.

# Sentinel so the server can detect bootstrap success.
export SPECRAILS_SHELL_INTEGRATION_LOADED=1

# Source the user's real .zshrc if it exists. Run before our hooks so we don't
# stomp on a user's existing precmd/preexec arrays.
if [[ -r "$HOME/.zshrc" ]]; then
  source "$HOME/.zshrc"
fi

# Helper: print OSC 133 sequences. \a is the BEL (ST) terminator.
__sr_osc_prompt_start() { print -n -- $'\e]133;A\a' }
__sr_osc_prompt_end()   { print -n -- $'\e]133;B\a' }
__sr_osc_pre_exec()     { print -n -- $'\e]133;C\a' }
__sr_osc_post_exec()    { print -n -- $'\e]133;D;'"${1:-0}"$'\a' }
__sr_osc_cwd()          { print -n -- $'\e]1337;CurrentDir='"$PWD"$'\a' }

# Track exit code of the last command for OSC 133;D.
__sr_last_exit=0

# precmd: runs before every prompt. Emits prompt-start and CWD.
__sr_precmd() {
  __sr_last_exit=$?
  __sr_osc_post_exec "$__sr_last_exit"
  __sr_osc_cwd
  __sr_osc_prompt_start
}

# preexec: runs just before a command executes. Emits pre-exec and prompt-end.
__sr_preexec() {
  __sr_osc_prompt_end
  __sr_osc_pre_exec
}

# Append (do not overwrite) so user-defined hooks are preserved.
typeset -ga precmd_functions preexec_functions
precmd_functions+=("__sr_precmd")
preexec_functions+=("__sr_preexec")
