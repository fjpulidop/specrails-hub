# SpecRails Hub — fish shell-integration shim
# Sourced via `fish -C "source <this-file>"`, which runs after the user's
# config.fish / conf.d, so the user's real fish config is preserved.

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
