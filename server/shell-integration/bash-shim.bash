# SpecRails Hub — bash shell-integration shim
# Loaded via --rcfile when the user spawns a terminal in the hub.
# Sources the user's real ~/.bashrc, then layers OSC 133 / OSC 1337 hooks on top.

export SPECRAILS_SHELL_INTEGRATION_LOADED=1

if [[ -r "$HOME/.bashrc" ]]; then
  # shellcheck disable=SC1091
  source "$HOME/.bashrc"
fi

# OSC helpers (\a = BEL terminator)
__sr_osc_prompt_start() { printf '\e]133;A\a'; }
__sr_osc_prompt_end()   { printf '\e]133;B\a'; }
__sr_osc_pre_exec()     { printf '\e]133;C\a'; }
__sr_osc_post_exec()    { printf '\e]133;D;%d\a' "${1:-0}"; }
__sr_osc_cwd()          { printf '\e]1337;CurrentDir=%s\a' "$PWD"; }

# DEBUG trap fires before each simple command.
# Skip when inside the prompt itself (BASH_COMMAND == PROMPT_COMMAND) to avoid
# treating the prompt as a user command.
__sr_in_prompt=0
__sr_debug_trap() {
  if [[ "$__sr_in_prompt" == "1" ]]; then return; fi
  __sr_osc_prompt_end
  __sr_osc_pre_exec
}
trap '__sr_debug_trap' DEBUG

# PROMPT_COMMAND wraps the user's existing PROMPT_COMMAND.
__sr_prompt_command() {
  local exit=$?
  __sr_in_prompt=1
  __sr_osc_post_exec "$exit"
  __sr_osc_cwd
  __sr_osc_prompt_start
  __sr_in_prompt=0
}

if [[ -n "$PROMPT_COMMAND" ]]; then
  PROMPT_COMMAND="__sr_prompt_command; $PROMPT_COMMAND"
else
  PROMPT_COMMAND="__sr_prompt_command"
fi
export PROMPT_COMMAND
