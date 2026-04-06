export interface PluginManifest {
  name: string
  version: string
  skills?: string[]
  handlers?: string[]
}

export interface LoadedPlugin {
  name: string
  version: string
  dir: string
  skills?: string[]
}
