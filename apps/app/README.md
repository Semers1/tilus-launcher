## Tilus Launcher

Desktop shell of Tilus Launcher, a Minecraft launcher for [tilus.ru](https://tilus.ru) based on
Modrinth App. It is built with [Tauri](https://tauri.app/) and [Vue](https://vuejs.org/).

Players can download the latest release from
[GitHub Releases](https://github.com/Semers1/tilus-launcher/releases/latest).

## Development

### Pre-requisites

Before you begin, ensure you have the following installed on your machine:

- [Node.js](https://nodejs.org/en/)
- [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/tools/install)
- [Tauri](https://v2.tauri.app/start/prerequisites/)

### Setup

Follow these steps to set up your development environment:

```bash
cp packages/app-lib/.env.prod packages/app-lib/.env
pnpm install
pnpm app:dev
```

You should now have a development build of the app running with hot-reloading enabled. Any changes you make to the code will automatically refresh the app.
