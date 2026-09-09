import { afterEach, test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AuthProfileStore } from "./store.js"

const directories = []
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })))

function fixture(initial = '{"example":{"type":"api","key":"test-original"}}\n') {
  const directory = mkdtempSync(join(process.env.AUTH_PROFILE_TEST_TMPDIR || tmpdir(), "authprofile-"))
  directories.push(directory)
  const authFile = join(directory, "auth.json")
  if (initial !== null) writeFileSync(authFile, initial)
  const store = new AuthProfileStore({ authFile, profilesDir: join(directory, "profiles") })
  return { store, authFile, directory, initial }
}

test("initialization snapshots default once, preserving the live file and later logins", () => {
  const { store, authFile, initial } = fixture()
  assert.equal(store.initialize(), "default")
  assert.equal(readFileSync(store.profileFile("default"), "utf8"), initial)
  assert.equal(readFileSync(authFile, "utf8"), initial)
  const updated = '{"example":{"type":"api","key":"test-new-login"}}'
  writeFileSync(authFile, updated)
  assert.equal(store.initialize(), "default")
  assert.equal(readFileSync(authFile, "utf8"), updated)
  assert.equal(readFileSync(store.profileFile("default"), "utf8"), initial)
})

test("save, empty profile, login, and round-trip switching retain refreshed credentials", () => {
  const { store, authFile, initial } = fixture()
  store.initialize()
  assert.equal(store.save("Personal account"), "Personal account")
  assert.equal(store.active(), "Personal account")
  store.activate("work", { empty: true })
  assert.deepEqual(JSON.parse(readFileSync(authFile, "utf8")), {})
  const refreshed = '{"example":{"type":"oauth","access":"test-access","refresh":"test-refresh","expires":1234}}'
  writeFileSync(authFile, refreshed)
  store.activate("Personal account")
  assert.equal(readFileSync(authFile, "utf8"), initial)
  assert.equal(readFileSync(store.profileFile("work"), "utf8"), refreshed)
  store.activate("work")
  assert.equal(readFileSync(authFile, "utf8"), refreshed)
  assert.equal(store.active(), "work")
  assert.equal(new AuthProfileStore({ authFile, profilesDir: store.profilesDir }).initialize(), "work")
})

test("selecting the active profile keeps live token updates rather than restoring a stale snapshot", () => {
  const { store, authFile } = fixture()
  store.initialize()
  writeFileSync(authFile, '{"example":{"type":"api","key":"test-refreshed"}}')
  assert.deepEqual(store.activate("default"), { name: "default", changed: false })
  assert.equal(readFileSync(authFile, "utf8"), readFileSync(store.profileFile("default"), "utf8"))
})

test("missing auth starts empty and saved directories are discovered each time", () => {
  const { store, authFile } = fixture(null)
  store.initialize()
  assert.equal(existsSync(authFile), false)
  mkdirSync(join(store.profilesDir, "imported"))
  writeFileSync(join(store.profilesDir, "imported", "auth.json"), '{"example":{"type":"api","key":"test-imported"}}')
  assert.deepEqual(store.list(), ["default", "imported"])
  store.activate("imported")
  assert.equal(JSON.parse(readFileSync(authFile)).example.key, "test-imported")
})

test("duplicate names and path traversal cannot overwrite credentials", () => {
  const { store, authFile, initial } = fixture()
  store.initialize()
  for (const name of ["", "../escape", "/absolute", ".hidden", "nested/name", "back\\slash", "bad\nname"]) {
    assert.throws(() => store.save(name))
    assert.throws(() => store.activate(name, { empty: true }))
  }
  assert.throws(() => store.save("default"), /already exists/)
  assert.throws(() => store.activate("default", { empty: true }), /already exists/)
  assert.equal(readFileSync(authFile, "utf8"), initial)
  assert.equal(readFileSync(store.profileFile("default"), "utf8"), initial)
})

test("invalid destination JSON, missing files and symlinks leave the current auth intact", () => {
  const { store, authFile, directory, initial } = fixture()
  store.initialize()
  mkdirSync(join(store.profilesDir, "bad"))
  const bad = join(store.profilesDir, "bad", "auth.json")
  writeFileSync(bad, '{"secret":"test-do-not-display"')
  assert.throws(() => store.activate("bad"), (error) => !error.message.includes("test-do-not-display"))
  writeFileSync(bad, "[]")
  assert.throws(() => store.activate("bad"), /JSON object/)
  rmSync(bad)
  assert.throws(() => store.activate("bad"), /Missing auth/)
  const outside = join(directory, "outside.json")
  writeFileSync(outside, "{}")
  symlinkSync(outside, bad)
  assert.throws(() => store.activate("bad"), /regular file/)
  symlinkSync(directory, join(store.profilesDir, "linked"))
  assert.equal(store.list().includes("linked"), false)
  assert.throws(() => store.activate("linked"), /profile directory/)
  assert.equal(readFileSync(authFile, "utf8"), initial)
  assert.equal(store.active(), "default")
})

test("failure to persist active metadata rolls the live credentials back", () => {
  const { store, authFile, initial } = fixture()
  store.initialize()
  store.setActive = () => { throw new Error("test disk failure") }
  assert.throws(() => store.activate("new", { empty: true }), /test disk failure/)
  assert.equal(readFileSync(authFile, "utf8"), initial)
  assert.equal(store.active(), "default")
})

test("new credential files and profile directories are private", () => {
  const { store, authFile } = fixture()
  store.initialize()
  store.activate("empty", { empty: true })
  for (const file of [authFile, store.profileFile("default"), store.profileFile("empty"), store.stateFile]) {
    assert.equal(statSync(file).mode & 0o777, 0o600)
  }
  for (const dir of [store.profilesDir, join(store.profilesDir, "empty")]) {
    assert.equal(statSync(dir).mode & 0o777, 0o700)
  }
})

test("concurrent operations are rejected and locks are released after errors", () => {
  const { store } = fixture()
  store.initialize()
  store.locked(() => assert.throws(() => store.activate("new", { empty: true }), /in progress/))
  assert.throws(() => store.activate("missing"))
  assert.equal(existsSync(join(store.profilesDir, ".lock")), false)
  store.activate("new", { empty: true })
  assert.equal(store.active(), "new")
})

test("initialization does not overwrite a pre-existing default profile", () => {
  const { store, initial } = fixture()
  mkdirSync(join(store.profilesDir, "default"), { recursive: true })
  writeFileSync(join(store.profilesDir, "default", "auth.json"), "{}")
  assert.equal(store.initialize(), "default-2")
  assert.equal(readFileSync(store.profileFile("default"), "utf8"), "{}")
  assert.equal(readFileSync(store.profileFile("default-2"), "utf8"), initial)
})
