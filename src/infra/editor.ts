import { spawn } from 'child_process'

export async function openEditor(filePath: string): Promise<boolean> {
  const editor = process.env.EDITOR || process.env.VISUAL || 'vim'

  return new Promise((resolve, reject) => {
    const proc = spawn(editor, [filePath], {
      stdio: 'inherit'
    })

    proc.on('close', (code) => {
      code === 0 ? resolve(true) : reject(false)
    })

    proc.on('error', (err) => {
      reject(err)
    })
  })
}
