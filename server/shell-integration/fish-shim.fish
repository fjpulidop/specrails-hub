# SpecRails Hub — fish shell-integration shim
# Loaded via XDG_CONFIG_HOME pointing at our shim dir; fish picks up
# conf.d/specrails-shim.fish after the user's own config.fish has run.

set -gx SPECRAILS_SHELL_INTEGRATION_LOADED 1

function __sr_osc_prompt_start
    printf '\e]133;A\a'
end

function __sr_osc_prompt_end
    printf '\e]133;B\a'
end

function __sr_osc_pre_exec
    printf '\e]133;C\a'
end

function __sr_osc_post_exec
    printf '\e]133;D;%d\a' $argv[1]
end

function __sr_osc_cwd
    printf '\e]1337;CurrentDir=%s\a' (pwd)
end

function __sr_preexec --on-event fish_preexec
    __sr_osc_prompt_end
    __sr_osc_pre_exec
end

function __sr_postexec --on-event fish_postexec
    __sr_osc_post_exec $status
    __sr_osc_cwd
    __sr_osc_prompt_start
end
