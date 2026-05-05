import type { Plugin } from '../../types'
import { serenaManifest, SERENA_MCP_ENTRY } from './manifest'
import { installSerena, uninstallSerena } from './install'
import { verifySerena } from './verify'

export const serenaPlugin: Plugin = {
  manifest: serenaManifest,
  install: installSerena,
  uninstall: uninstallSerena,
  verify: verifySerena,
  expectedMcpEntry: () => SERENA_MCP_ENTRY,
}
