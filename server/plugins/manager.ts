import { PluginManager, type PrerequisiteCheck } from '../plugin-manager'
import { BUNDLED_PLUGINS } from './index'
import { getSetupPrerequisitesStatus } from '../setup-prerequisites'

const livePrerequisiteCheck: PrerequisiteCheck = async (req) => {
  const status = getSetupPrerequisitesStatus({ includeUv: true })
  const match = status.prerequisites.find((p) => p.command === req.name || p.key === (req.name as never))
  if (!match) {
    return { installed: false, executable: false, meetsMinimum: false }
  }
  return {
    installed: match.installed,
    executable: match.executable,
    version: match.version,
    meetsMinimum: match.meetsMinimum,
  }
}

let _instance: PluginManager | null = null

/** Lazily-built process-wide PluginManager (driven by BUNDLED_PLUGINS). */
export function getPluginManager(): PluginManager {
  if (!_instance) {
    _instance = new PluginManager(BUNDLED_PLUGINS, { checkPrerequisite: livePrerequisiteCheck })
  }
  return _instance
}

/** Test helper: replace the singleton. */
export function setPluginManagerForTesting(mgr: PluginManager | null): void {
  _instance = mgr
}
