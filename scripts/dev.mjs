import { spawn } from "node:child_process"

function run(name, args) {
  const child = spawn("npm", args, { stdio: "inherit", shell: true })
  child.on("exit", (code) => {
    if (code && code !== 0) process.exit(code)
  })
  return child
}

const api = run("api", ["run", "dev", "-w", "server"])
const app = run("app", ["run", "dev", "-w", "app"])

function shutdown() {
  api.kill()
  app.kill()
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
