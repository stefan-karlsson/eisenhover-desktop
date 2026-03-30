# Eisenhover Matrix Desktop App

A vibe coded cross-platform desktop Eisenhower matrix built with Electron, React, TypeScript, and SQLite.

## Features

- 4-quadrant matrix: Do, Schedule, Delegate, Delete
- Drag and drop between quadrants with manual ordering
- Quick add, edit, complete, restore, and soft-delete tasks
- Historical view for completed and deleted tasks
- Rename quadrant labels and persist them locally
- Keyboard shortcuts:
  - `Ctrl/Cmd + N` new task
  - `/` focus search
  - `Esc` close modal
- Local SQLite persistence across restarts

## Tech stack

- Electron + React + TypeScript
- `pnpm` package manager
- Node SQLite (`node:sqlite`) as local database

## Development

```bash
pnpm install
# one-time on strict pnpm setups
pnpm approve-builds
pnpm dev
```

## Tests

```bash
pnpm test
```

## Build

```bash
pnpm build
```

## Package installers

```bash
pnpm dist:linux   # AppImage + deb
pnpm dist:win     # nsis installer
pnpm dist:mac     # dmg
```

## Local data location

The SQLite file is created in Electron `userData` as `eisenhover.db`.
Examples:

- Linux: `~/.config/Eisenhover Matrix/eisenhover.db`
- Windows: `%APPDATA%/Eisenhover Matrix/eisenhover.db`
- macOS: `~/Library/Application Support/Eisenhover Matrix/eisenhover.db`

## Method notes

This app implements the standard urgent/important matrix workflow and keeps historical completed/deleted tasks for retrospective review.
