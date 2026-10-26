import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const skill = fs.readFileSync(path.join(root, 'SKILL.md'), 'utf8')
const errors = []

if (!skill.startsWith('---\n')) errors.push('SKILL.md is missing frontmatter')
const front = skill.split('---')[1] || ''
if (!/^name: verify-club-platform$/m.test(front)) errors.push('frontmatter name must be verify-club-platform')
if (!/^description:/m.test(front)) errors.push('frontmatter description is missing')

for (const heading of ['## Launch', '## Doctor', '## Drive', '## Evidence', '## Cleanup', '## Helpers']) {
  if (!skill.includes(heading)) errors.push(`missing ${heading}`)
}

const features = [
  'login-auth.md',
  'duty-sign-in.md',
  'dashboard.md',
  'roster-leave.md',
  'admin-geofence.md',
]
for (const file of features) {
  const body = fs.readFileSync(path.join(root, 'features', file), 'utf8')
  for (const heading of [
    '## Sub-features',
    '## How to get to it (user POV)',
    '## Driving it with Playwright',
    '## Gotchas',
  ]) {
    if (!body.includes(heading)) errors.push(`${file} missing ${heading}`)
  }
}

for (const file of ['launch.sh', 'doctor.sh', 'cleanup.sh', 'query-db.sh', 'drive-duty-sign-in.mjs']) {
  const filePath = path.join(root, 'scripts', file)
  if (!fs.existsSync(filePath)) errors.push(`missing scripts/${file}`)
  else if ((fs.statSync(filePath).mode & 0o111) === 0) errors.push(`scripts/${file} is not executable`)
}

for (const file of ['freeze-duty-clock.cjs', 'duty-clock.txt']) {
  if (!fs.existsSync(path.join(root, 'scripts', file))) errors.push(`missing scripts/${file}`)
}

if (!fs.existsSync(path.join(root, 'features/README.md'))) errors.push('missing features/README.md')

if (errors.length) {
  process.stderr.write(errors.join('\n') + '\n')
  process.exit(1)
}
process.stdout.write('skill structure ok\n')
