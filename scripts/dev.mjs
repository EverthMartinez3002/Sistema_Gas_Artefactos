import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const backendDir = join(root, 'backend')
const frontendDir = join(root, 'frontend')
const viteCli = join(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js')
const children = []
let stopping = false

function stop(exitCode = 0) {
  if (stopping) return
  stopping = true
  process.exitCode = exitCode
  for (const child of children) if (!child.killed) child.kill()
}

function launch(label, args, cwd) {
  const child = spawn(process.execPath, args, { cwd, stdio: 'inherit' })
  children.push(child)
  child.on('error', (error) => {
    console.error(`${label}: ${error.message}`)
    stop(1)
  })
  child.on('exit', (code) => {
    if (!stopping) {
      console.error(`${label} terminó con código ${code ?? 'desconocido'}.`)
      stop(code || 1)
    }
  })
}

process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))

launch('Backend', ['src/server.js'], backendDir)
launch('Frontend', [viteCli, '--host', '127.0.0.1', '--strictPort'], frontendDir)
