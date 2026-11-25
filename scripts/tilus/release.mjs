// Release pipeline of Tilus Launcher.
//
//   node scripts/tilus/release.mjs build     export the public tree, build and sign the installer
//   node scripts/tilus/release.mjs publish   push the public source and create the GitHub release
//
// Before a release bump "version" in apps/app-frontend/package.json and apps/app/Cargo.toml and
// describe the changes in scripts/tilus/changelog/<version>.md.
//
// Secrets live outside the repository, in ~/.tilus-launcher:
//   updater.key        private key for update signatures (`pnpm tauri signer generate`)
//   github-token.txt   fine-grained token with Contents: read and write on the repository

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const REPO = 'Semers1/tilus-launcher'
const src = path.resolve(import.meta.dirname, '../..')
const out = path.resolve(src, '..', 'TilusLauncher-public')
const secrets = path.join(os.homedir(), '.tilus-launcher')
const targetDir = path.join(src, 'target')

const version = JSON.parse(fs.readFileSync(path.join(src, 'apps/app-frontend/package.json'))).version
const releaseDir = path.join(secrets, 'releases', version)
const installerName = `TilusLauncher_${version}_x64-setup.exe`
const stableInstallerName = 'TilusLauncher-setup.exe'

function run(cmd, args, options = {}) {
	console.log(`> ${cmd} ${args.join(' ')}`)
	return execFileSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...options })
}

function changelog({ required = true } = {}) {
	const file = path.join(src, 'scripts/tilus/changelog', `${version}.md`)
	if (!fs.existsSync(file)) {
		if (required) throw new Error(`Describe the release in ${file}`)
		return ''
	}
	return fs.readFileSync(file, 'utf8').trim()
}

function checkVersions() {
	const cargo = fs.readFileSync(path.join(src, 'apps/app/Cargo.toml'), 'utf8')
	const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1]
	if (cargoVersion !== version) {
		throw new Error(`apps/app/Cargo.toml has ${cargoVersion}, package.json has ${version}`)
	}
}

function build() {
	checkVersions()
	run('node', [path.join(src, 'scripts/tilus/check-no-modrinth.mjs')])

	run('node', [path.join(src, 'scripts/tilus/export-public.mjs'), out])

	const tools = [path.join(src, '.tools/bin'), path.join(os.homedir(), '.cargo/bin')]
	const env = {
		...process.env,
		PATH: [...tools, process.env.PATH].join(path.delimiter),
		COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
		SQLX_OFFLINE: 'true',
		CARGO_TARGET_DIR: targetDir,
		TAURI_SIGNING_PRIVATE_KEY: fs.readFileSync(path.join(secrets, 'updater.key'), 'utf8').trim(),
		TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '',
	}
	run('pnpm', ['install', '--no-frozen-lockfile'], { cwd: out, env })

	// The bundler downloads NSIS with a client that cannot go through the local proxy.
	for (const key of ['HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy']) delete env[key]
	run('pnpm', ['tauri', 'build', '--bundles', 'nsis', '--config', 'tauri.release.conf.json'], {
		cwd: path.join(out, 'apps/app'),
		env,
	})

	const bundled = path.join(targetDir, 'release/bundle/nsis', `Tilus Launcher_${version}_x64-setup.exe`)
	fs.rmSync(releaseDir, { recursive: true, force: true })
	fs.mkdirSync(releaseDir, { recursive: true })
	fs.copyFileSync(bundled, path.join(releaseDir, installerName))
	fs.copyFileSync(bundled + '.sig', path.join(releaseDir, installerName + '.sig'))

	const latest = {
		version,
		notes: changelog({ required: false }),
		pub_date: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
		platforms: {
			'windows-x86_64': {
				signature: fs.readFileSync(bundled + '.sig', 'utf8').trim(),
				url: `https://github.com/${REPO}/releases/download/v${version}/${installerName}`,
			},
		},
	}
	fs.writeFileSync(path.join(releaseDir, 'latest.json'), JSON.stringify(latest, null, '\t') + '\n')
	console.log(`\nRelease ${version} is ready in ${releaseDir}`)
}

async function github(method, url, body, headers = {}) {
	const token = fs.readFileSync(path.join(secrets, 'github-token.txt'), 'utf8').trim()
	const response = await fetch(url.startsWith('http') ? url : `https://api.github.com${url}`, {
		method,
		headers: {
			Accept: 'application/vnd.github+json',
			Authorization: `Bearer ${token}`,
			'X-GitHub-Api-Version': '2022-11-28',
			...(body && !Buffer.isBuffer(body) ? { 'Content-Type': 'application/json' } : {}),
			...headers,
		},
		body: body && !Buffer.isBuffer(body) ? JSON.stringify(body) : body,
	})
	if (response.status === 404 && method === 'GET') return null
	if (!response.ok) throw new Error(`${method} ${url}: ${response.status} ${await response.text()}`)
	return response.status === 204 ? null : response.json()
}

function git(args, options = {}) {
	return execFileSync('git', args, { cwd: out, encoding: 'utf8', ...options }).trim()
}

async function publish() {
	if (!fs.existsSync(path.join(releaseDir, 'latest.json'))) throw new Error('Run "build" first')

	if (!fs.existsSync(path.join(out, '.git'))) {
		git(['init', '-b', 'main'])
		git(['remote', 'add', 'origin', `https://github.com/${REPO}.git`])
	}
	const owner = await (await fetch(`https://api.github.com/users/${REPO.split('/')[0]}`)).json()
	git(['config', 'user.name', owner.login])
	git(['config', 'user.email', `${owner.id}+${owner.login}@users.noreply.github.com`])

	git(['add', '-A'])
	if (git(['status', '--porcelain'])) {
		const message = `Tilus Launcher ${version}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n`
		git(['commit', '-q', '-F', '-'], { input: message })
	}
	const commit = git(['rev-parse', 'HEAD'])

	const tokenFile = path.join(secrets, 'github-token.txt').replace(/\\/g, '/')
	const helper = `!f() { echo username=x-access-token; echo "password=$(cat '${tokenFile}')"; }; f`
	execFileSync(
		'git',
		['-c', 'credential.helper=', '-c', `credential.helper=${helper}`, 'push', 'origin', 'HEAD:main'],
		{ cwd: out, stdio: 'inherit' },
	)

	const tag = `v${version}`
	let release = await github('GET', `/repos/${REPO}/releases/tags/${tag}`)
	const drafts = (await github('GET', `/repos/${REPO}/releases?per_page=100`)) ?? []
	release ??= drafts.find((r) => r.tag_name === tag) ?? null
	const body = [
		changelog(),
		'',
		`**Скачать:** [${stableInstallerName}](https://github.com/${REPO}/releases/latest/download/${stableInstallerName})`,
		'',
		'Если Windows пишет «Система Windows защитила ваш компьютер», нажмите «Подробнее» → «Выполнить в любом случае». Установщик не подписан платным сертификатом; обновления лаунчер ставит сам.',
	].join('\n')
	release ??= await github('POST', `/repos/${REPO}/releases`, {
		tag_name: tag,
		target_commitish: commit,
		name: `Tilus Launcher ${version}`,
		body,
		draft: true,
	})

	const installer = fs.readFileSync(path.join(releaseDir, installerName))
	const assets = [
		[installerName, installer],
		[installerName + '.sig', fs.readFileSync(path.join(releaseDir, installerName + '.sig'))],
		[stableInstallerName, installer],
		['latest.json', fs.readFileSync(path.join(releaseDir, 'latest.json'))],
	]
	for (const [name, data] of assets) {
		const existing = release.assets?.find((asset) => asset.name === name)
		if (existing) await github('DELETE', `/repos/${REPO}/releases/assets/${existing.id}`)
		const uploadUrl = release.upload_url.replace(/\{.*\}$/, `?name=${encodeURIComponent(name)}`)
		await github('POST', uploadUrl, data, { 'Content-Type': 'application/octet-stream' })
		console.log(`uploaded ${name} (${data.length} bytes)`)
	}

	if (release.draft) {
		release = await github('PATCH', `/repos/${REPO}/releases/${release.id}`, {
			draft: false,
			make_latest: 'true',
		})
	}
	console.log(`\nPublished ${release.html_url}`)
}

const command = process.argv[2]
if (command === 'build') build()
else if (command === 'publish') await publish()
else {
	console.log('Usage: node scripts/tilus/release.mjs build|publish')
	process.exit(1)
}
