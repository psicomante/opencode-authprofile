import {
  closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync,
  readdirSync, renameSync, rmSync, writeFileSync,
} from "node:fs"
import { randomUUID } from "node:crypto"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

const dataHome = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share")

export function profileName(value) {
  const name = value.trim()
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._ -]{0,63}$/.test(name)) {
    throw new Error("Use 1–64 letters, numbers, spaces, dots, underscores or hyphens; start with a letter or number.")
  }
  return name
}

function regularFile(file) {
  try {
    if (!lstatSync(file).isFile()) throw new Error(`Expected a regular file: ${file}`)
    return true
  } catch (error) {
    if (error.code === "ENOENT") return false
    throw error
  }
}

function readAuth(file, allowMissing = false) {
  if (!regularFile(file)) {
    if (allowMissing) return "{}\n"
    throw new Error(`Missing auth.json: ${file}`)
  }
  const text = readFileSync(file, "utf8")
  let value
  try {
    value = JSON.parse(text)
  } catch {
    // JSON parser errors can include credentials from the source text.
    throw new Error(`Invalid JSON in ${file}`)
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected a JSON object in ${file}`)
  }
  return text
}

function writePrivate(file, text) {
  regularFile(file)
  const temporary = join(dirname(file), `.authprofile-${randomUUID()}.tmp`)
  try {
    writeFileSync(temporary, text, { mode: 0o600, flag: "wx" })
    renameSync(temporary, file)
  } finally {
    rmSync(temporary, { force: true })
  }
}

export class AuthProfileStore {
  constructor({ authFile = join(dataHome, "opencode", "auth.json"), profilesDir = join(dataHome, "opencode-authprofile") } = {}) {
    this.authFile = authFile
    this.profilesDir = profilesDir
    this.stateFile = join(profilesDir, "state.json")
  }

  profileFile(name) {
    const directory = join(this.profilesDir, profileName(name))
    if (!lstatSync(directory).isDirectory()) throw new Error(`Expected a profile directory: ${directory}`)
    return join(directory, "auth.json")
  }

  // The lock and active name are shared by every OpenCode window.
  locked(action) {
    mkdirSync(this.profilesDir, { recursive: true, mode: 0o700 })
    const lock = join(this.profilesDir, ".lock")
    let fd
    try {
      fd = openSync(lock, "wx", 0o600)
    } catch (error) {
      if (error.code !== "EEXIST") throw error
      let pid
      try { pid = Number(readFileSync(lock, "utf8")) } catch {}
      if (Number.isSafeInteger(pid) && pid > 0) {
        try {
          process.kill(pid, 0)
        } catch (error) {
          if (error.code === "ESRCH") {
            rmSync(lock)
            return this.locked(action)
          }
        }
      }
      throw new Error("Another auth profile operation is in progress. Try again shortly.")
    }
    try {
      writeFileSync(fd, String(process.pid))
      return action()
    } finally {
      closeSync(fd)
      rmSync(lock, { force: true })
    }
  }

  active() {
    let state
    try { state = JSON.parse(readFileSync(this.stateFile, "utf8")) } catch {
      throw new Error("Cannot read auth profile state.json. Restore it before switching profiles.")
    }
    return profileName(state.active)
  }

  setActive(name) {
    writePrivate(this.stateFile, JSON.stringify({ active: name }, null, 2) + "\n")
  }

  create(name, text) {
    const directory = join(this.profilesDir, profileName(name))
    try {
      mkdirSync(directory, { mode: 0o700 })
    } catch (error) {
      if (error.code === "EEXIST") throw new Error(`Profile “${name}” already exists. Choose another name.`)
      throw error
    }
    try {
      writePrivate(join(directory, "auth.json"), text)
    } catch (error) {
      rmSync(directory, { recursive: true, force: true })
      throw error
    }
  }

  initialize() {
    return this.locked(() => {
      if (existsSync(this.stateFile)) {
        const active = this.active()
        this.profileFile(active)
        return active
      }
      const text = readAuth(this.authFile, true)
      let name = "default"
      for (let i = 2; existsSync(join(this.profilesDir, name)); i++) name = `default-${i}`
      this.create(name, text)
      this.setActive(name)
      return name
    })
  }

  list() {
    return readdirSync(this.profilesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^[a-zA-Z0-9][a-zA-Z0-9._ -]{0,63}$/.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b))
  }

  save(rawName) {
    const name = profileName(rawName)
    return this.locked(() => {
      const text = readAuth(this.authFile, true)
      const previous = this.active()
      this.create(name, text)
      // Retain any refreshed tokens in the previously active profile too.
      writePrivate(this.profileFile(previous), text)
      this.setActive(name)
      return name
    })
  }

  activate(rawName, { empty = false } = {}) {
    const name = profileName(rawName)
    return this.locked(() => {
      const previous = this.active()
      const current = readAuth(this.authFile, true)
      if (name === previous && !empty) {
        writePrivate(this.profileFile(previous), current)
        return { name, changed: false }
      }
      // Validate the destination before touching the current credentials.
      const next = empty ? "{}\n" : readAuth(this.profileFile(name))
      if (empty) this.create(name, next)
      writePrivate(this.profileFile(previous), current)
      mkdirSync(dirname(this.authFile), { recursive: true, mode: 0o700 })
      const existed = regularFile(this.authFile)
      writePrivate(this.authFile, next)
      try {
        this.setActive(name)
      } catch (error) {
        if (existed) writePrivate(this.authFile, current)
        else rmSync(this.authFile, { force: true })
        throw error
      }
      return { name, changed: true }
    })
  }
}
