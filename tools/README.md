# Local toolchain (not committed — 100MB+ binaries)

These binaries are gitignored. Re-fetch them the same way on any machine:

## Foundry (forge / cast / anvil / chisel)
```bash
mkdir -p tools/foundry
curl -sL -o tools/foundry/foundry.zip "https://github.com/foundry-rs/foundry/releases/download/v1.8.1/foundry_v1.8.1_win32_amd64.zip"
unzip -o tools/foundry/foundry.zip -d tools/foundry/
rm tools/foundry/foundry.zip
```

## Chainlink CRE CLI
```bash
mkdir -p tools/cre
curl -sL -o tools/cre/cre.zip "https://github.com/smartcontractkit/cre-cli/releases/latest/download/cre_windows_amd64.zip"
unzip -o tools/cre/cre.zip -d tools/cre/
mv tools/cre/cre_*_windows_amd64.exe tools/cre/cre.exe
rm tools/cre/cre.zip
```

Both are used by full relative path (`./tools/foundry/forge.exe`, `./tools/cre/cre.exe`) — nothing is added to PATH or installed system-wide, so this works without admin rights and never touches anything outside the project folder.

macOS/Linux teammates: grab the `darwin`/`linux` asset instead of `win32`/`windows` from the same release pages, and skip the `.exe` renaming.
