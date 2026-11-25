// Builds the public source tree of Tilus Launcher: everything the launcher needs to be built,
// without Modrinth's website, backend and docs, and without Modrinth branding (see COPYING.md).
//
// Usage: node scripts/tilus/export-public.mjs [outDir]
// Default outDir is ../TilusLauncher-public next to this repository.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const src = path.resolve(import.meta.dirname, '../..')
const out = path.resolve(process.argv[2] ?? path.join(src, '..', 'TilusLauncher-public'))

const REMOVED_CRATES = [
	'apps/labrinth',
	'apps/daedalus_client',
	'apps/app-playground',
	'packages/component-derive',
	'packages/modrinth-util',
	'packages/modrinth-log',
	'packages/muralpay',
	'packages/neverbounce',
	'packages/sqlx-tracing',
	'packages/xredis',
	'packages/modrinth-maxmind',
]

const EXCLUDED = [
	...REMOVED_CRATES.map((dir) => dir + '/'),
	'apps/frontend/',
	'apps/docs/',
	'packages/moderation/',
	'packages/blog/articles/',
	'packages/blog/compiled/',
	'packages/blog/public/',
	'.github/',
	'.idea/',
	'standards/',
	'scripts/tilus/public/',
	'scripts/clone-labrinth-projects.mjs',
	'scripts/import-projects.py',
	'scripts/seed-db.sh',
	'scripts/reset-db.sh',
	'apps/app-frontend/src/assets/instance-icons/wrench-rinth.png',
	'patches/@vue-email__markdown@0.0.7.patch',
	'patches/@vue-email__tailwind@0.2.0.patch',
	'AGENTS.md',
	'crowdin.yml',
	'docker-compose.yml',
]

const isExcluded = (file) =>
	EXCLUDED.some((rule) => (rule.endsWith('/') ? file.startsWith(rule) : file === rule))

function trimCargoToml(text) {
	const removed = new Set(REMOVED_CRATES)
	return text
		.split('\n')
		.filter((line) => {
			const member = line.match(/^\s*"([^"]+)",?\s*$/)
			if (member && removed.has(member[1])) return false
			const pathDep = line.match(/^[\w-]+\s*=\s*\{\s*path\s*=\s*"([^"]+)"/)
			return !(pathDep && removed.has(pathDep[1]))
		})
		.join('\n')
}

function trimRootPackageJson(text) {
	const pkg = JSON.parse(text)
	for (const script of ['web:dev', 'web:build', 'docs:dev', 'pages:build', 'prepr:frontend:web']) {
		delete pkg.scripts[script]
	}
	pkg.scripts['prepr:frontend'] = 'turbo run prepr --filter=@modrinth/app-frontend'
	pkg.scripts['prepr:frontend:lib'] = pkg.scripts['prepr:frontend:lib'].replace(
		' --filter=@modrinth/moderation',
		'',
	)
	pkg.scripts['lint:ancillary'] = 'prettier --check *.*'
	pkg.scripts['fix:ancillary'] = 'prettier --write *.*'
	return JSON.stringify(pkg, null, '\t') + '\n'
}

// Website-only (Modrinth emails) patches would fail `pnpm install` as unused.
function trimPnpmWorkspace(text) {
	return text
		.replace(/^ {2}'@vue-email\/[^']+': 'patches\/[^']+'\r?\n/gm, '')
		.replace(/^packageExtensions:\r?\n {2}'@vue-email\/markdown@[^']+':\r?\n(?: {4,}.*\r?\n)+/m, '')
}

const OVERRIDES = {
	'Cargo.toml': (read) => trimCargoToml(read('Cargo.toml')),
	'pnpm-workspace.yaml': (read) => trimPnpmWorkspace(read('pnpm-workspace.yaml')),
	'package.json': (read) => trimRootPackageJson(read('package.json')),
	'README.md': (read) => read('scripts/tilus/public/README.md'),
	LICENSE: (read) => read('apps/app/LICENSE'),
}

function sameContent(a, b) {
	if (!fs.existsSync(b)) return false
	const sa = fs.statSync(a)
	const sb = fs.statSync(b)
	return sa.size === sb.size && fs.readFileSync(a).equals(fs.readFileSync(b))
}

function writeIfChanged(file, content) {
	if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return false
	fs.mkdirSync(path.dirname(file), { recursive: true })
	fs.writeFileSync(file, content)
	return true
}

const listed = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
	cwd: src,
	encoding: 'utf8',
	maxBuffer: 256 * 1024 * 1024,
})
	.split('\0')
	.filter(Boolean)

const files = [...new Set(listed)].filter((file) => {
	if (isExcluded(file) || file in OVERRIDES) return false
	const full = path.join(src, file)
	return fs.existsSync(full) && fs.lstatSync(full).isFile()
})

fs.mkdirSync(out, { recursive: true })

let copied = 0
for (const file of files) {
	const from = path.join(src, file)
	const to = path.join(out, file)
	if (sameContent(from, to)) continue
	fs.mkdirSync(path.dirname(to), { recursive: true })
	fs.copyFileSync(from, to)
	copied++
}

const read = (file) => fs.readFileSync(path.join(src, file), 'utf8')
for (const [file, make] of Object.entries(OVERRIDES)) {
	if (writeIfChanged(path.join(out, file), make(read))) copied++
}

// Build prerequisite, ignored by git: the app reads its service URLs from packages/app-lib/.env.
fs.copyFileSync(
	path.join(out, 'packages/app-lib/.env.prod'),
	path.join(out, 'packages/app-lib/.env'),
)

let removed = 0
if (fs.existsSync(path.join(out, '.git'))) {
	const expected = new Set([...files, ...Object.keys(OVERRIDES)])
	const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: out, encoding: 'utf8' })
		.split('\0')
		.filter(Boolean)
	for (const file of tracked) {
		if (expected.has(file)) continue
		fs.rmSync(path.join(out, file), { force: true })
		removed++
	}
}

console.log(`Exported ${files.length + Object.keys(OVERRIDES).length} files to ${out}`)
console.log(`  updated: ${copied}, removed: ${removed}`)
