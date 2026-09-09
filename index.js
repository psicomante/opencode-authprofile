import { AuthProfileStore } from "./store.js"

/** @type {import("@opencode-ai/plugin/tui").TuiPluginModule} */
export default {
  id: "opencode-authprofile",
  async tui(api, options) {
    const store = new AuthProfileStore(options)
    let busy = false

    function report(error) {
      api.ui.toast({
        title: "Auth profiles",
        variant: "error",
        message: error instanceof Error ? error.message : "Auth profile operation failed.",
        duration: 8000,
      })
    }

    async function run(action) {
      if (busy) return
      busy = true
      try {
        await action()
      } catch (error) {
        report(error)
      } finally {
        busy = false
      }
    }

    async function activate(name, empty = false) {
      // Instance reload would interrupt running responses and token refreshes.
      const status = await api.client.session.status({}, { throwOnError: true })
      if (Object.values(status.data ?? {}).some((item) => item.type !== "idle")) {
        throw new Error("Wait for running responses to finish before switching auth profiles.")
      }
      const result = store.activate(name, { empty })
      api.ui.dialog.clear()
      if (result.changed) {
        try {
          // OpenCode handles this event by rebuilding providers and refreshing the TUI.
          await api.client.instance.dispose({}, { throwOnError: true })
        } catch {
          api.ui.toast({
            title: "Auth profile switched",
            variant: "warning",
            message: `auth.json now uses “${result.name}”. Restart OpenCode to reload credentials.`,
            duration: 10000,
          })
          return
        }
      }
      api.ui.toast({
        title: "Auth profiles",
        variant: "success",
        message: empty
          ? `Switched to empty profile “${result.name}”. Use /connect to sign in.`
          : `Active auth profile: ${result.name}`,
        duration: 6000,
      })
    }

    function promptName(empty) {
      api.ui.dialog.replace(() => api.ui.DialogPrompt({
        title: empty ? "Create and switch to empty profile" : "Save current auth as a new profile",
        placeholder: "Profile name (e.g. personal or work)",
        onConfirm: (name) => run(async () => {
          if (empty) return activate(name, true)
          const saved = store.save(name)
          api.ui.dialog.clear()
          api.ui.toast({ variant: "success", message: `Saved current auth as “${saved}”.` })
        }),
        onCancel: () => api.ui.dialog.clear(),
      }))
    }

    function show() {
      store.initialize()
      const active = store.active()
      api.ui.dialog.replace(() => api.ui.DialogSelect({
        title: `Auth profiles — ${active}`,
        placeholder: "Search profiles or actions",
        options: [
          { title: "Save current as…", value: { action: "save" }, category: "Actions" },
          { title: "New empty profile…", value: { action: "new" }, category: "Actions" },
          ...store.list().map((name) => ({
            title: name,
            value: { action: "switch", name },
            category: "Saved profiles",
            description: name === active ? "Active" : undefined,
          })),
        ],
        onSelect: ({ value }) => {
          if (busy) return
          if (value.action === "save") return promptName(false)
          if (value.action === "new") return promptName(true)
          return run(() => activate(value.name))
        },
      }))
    }

    const unregister = api.keymap.registerLayer({
      commands: [{
        name: "authprofile.switch",
        title: "Switch auth profile",
        desc: "Save, create or switch auth.json profiles",
        category: "Auth profiles",
        namespace: "palette",
        slashName: "switchauthprofile",
        run: () => run(show),
      }],
    })
    api.lifecycle.onDispose(unregister)
    try { store.initialize() } catch (error) { report(error) }
  },
}
