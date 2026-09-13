# Local toolchain

These binaries are gitignored (100MB+) and invoked by relative path —
`./tools/foundry/forge`, `./tools/cre/cre`. Nothing is added to PATH or
installed system-wide, so no admin rights are needed and nothing outside this
folder is touched. Don't run `foundryup`; the version is pinned deliberately.

## Foundry v1.8.1 (forge / cast / anvil / chisel)

macOS (Apple Silicon):
```bash
mkdir -p tools/foundry
BASE="https://github.com/foundry-rs/foundry/releases/download/v1.8.1"
curl -sL -o /tmp/foundry.tar.gz "$BASE/foundry_v1.8.1_darwin_arm64.tar.gz"
curl -sL -o /tmp/foundry.sha256 "$BASE/foundry_v1.8.1_darwin_arm64.sha256"
shasum -a 256 -c /tmp/foundry.sha256 < /dev/null || echo "checksum mismatch — stop"
tar -xzf /tmp/foundry.tar.gz -C tools/foundry/
./tools/foundry/forge --version   # expect 1.8.1
```

Swap the asset name for your platform: `darwin_amd64` (Intel Mac),
`linux_arm64`/`linux_amd64`, or `win32_amd64.zip` (Windows — unzip instead of
tar, and the binaries carry a `.exe` suffix).

## Chainlink CRE CLI

```bash
mkdir -p tools/cre
# Pick the asset matching your platform from:
#   https://github.com/smartcontractkit/cre-cli/releases/latest
curl -sL -o /tmp/cre.tar.gz "<darwin_arm64 asset URL>"
tar -xzf /tmp/cre.tar.gz -C tools/cre/
./tools/cre/cre --version
```
