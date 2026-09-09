import { afterEach, test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import plugin from "./index.js"

const directories = []
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })))

async function fixture({ working = false, reloadFails = false } = {}) {
  const directory = mkdtempSync(join(process.env.AUTH_PROFILE_TEST_TMPDIR || tmpdir(), "authprofile-ui-"))
  directories.push(directory)
  const authFile = join(directory, "auth.json")
  const original = '{"example":{"type":"api","key":"test-original"}}'
  writeFileSync(authFile, original)
  const view = { command: undefined, dialog: undefined, toasts: [], reloads: 0, disposed: false }
  const api = {
    keymap: {
      registerLayer({ commands }) {
        view.command = commands[0]
        return () => { view.disposed = true }
      },
    },
    lifecycle: { onDispose(fn) { view.dispose = fn } },
    ui: {
      DialogSelect: (props) => ({ type: "select", ...props }),
      DialogPrompt: (props) => ({ type: "prompt", ...props }),
      dialog: {
        replace(render) { view.dialog = render() },
        clear() { view.dialog = undefined },
      },
      toast(value) { view.toasts.push(value) },
    },
    client: {
      session: { async status() { return { data: { test: { type: working ? "busy" : "idle" } } } } },
      instance: {
        async dispose() {
          view.reloads++
          if (reloadFails) throw new Error("test reload failure")
          view.authAtReload = readFileSync(authFile, "utf8")
          return { data: true }
        },
      },
    },
  }
  await plugin.tui(api, { authFile, profilesDir: join(directory, "profiles") })
  return { view, authFile, original }
}

test("slash command opens native menu, saves, creates empty auth, and reloads after switching", async () => {
  const { view, authFile, original } = await fixture()
  assert.equal(view.command.slashName, "switchauthprofile")
  assert.equal(view.command.namespace, "palette")
  await view.command.run()
  assert.equal(view.dialog.type, "select")
  await view.dialog.onSelect({ value: { action: "save" } })
  assert.equal(view.dialog.type, "prompt")
  await view.dialog.onConfirm("personal")
  assert.equal(view.reloads, 0)
  await view.command.run()
  assert.match(view.dialog.title, /personal/)
  await view.dialog.onSelect({ value: { action: "new" } })
  await view.dialog.onConfirm("work")
  assert.equal(view.reloads, 1)
  assert.deepEqual(JSON.parse(view.authAtReload), {})
  assert.match(view.toasts.at(-1).message, /\/connect/)
  await view.command.run()
  await view.dialog.onSelect({ value: { action: "switch", name: "personal" } })
  assert.equal(readFileSync(authFile, "utf8"), original)
  assert.equal(view.reloads, 2)
  view.dispose()
  assert.equal(view.disposed, true)
})

test("cancelling name input makes no credential changes", async () => {
  const { view, authFile, original } = await fixture()
  await view.command.run()
  await view.dialog.onSelect({ value: { action: "new" } })
  view.dialog.onCancel()
  assert.equal(readFileSync(authFile, "utf8"), original)
  assert.equal(view.reloads, 0)
})

test("busy responses prevent credential replacement and instance reload", async () => {
  const { view, authFile, original } = await fixture({ working: true })
  await view.command.run()
  await view.dialog.onSelect({ value: { action: "new" } })
  await view.dialog.onConfirm("work")
  assert.equal(readFileSync(authFile, "utf8"), original)
  assert.equal(view.reloads, 0)
  assert.match(view.toasts.at(-1).message, /running responses/)
})

test("reload failure reports the successful file switch and the required restart", async () => {
  const { view, authFile } = await fixture({ reloadFails: true })
  await view.command.run()
  await view.dialog.onSelect({ value: { action: "new" } })
  await view.dialog.onConfirm("work")
  assert.deepEqual(JSON.parse(readFileSync(authFile, "utf8")), {})
  assert.equal(view.toasts.at(-1).variant, "warning")
  assert.match(view.toasts.at(-1).message, /Restart OpenCode/)
})
