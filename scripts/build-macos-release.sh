#!/bin/bash
# Build release payloads from the pinned upstream Ladder commit.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
version="${1:-}"
[[ "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.-]+)?$ ]] || {
  printf 'Usage: %s vMAJOR.MINOR.PATCH\n' "$0" >&2
  exit 2
}

ladder_ref="76143f7473a86e750787cf6f44756964363f9bbc"
release_dir="${LADDER_BUDDY_RELEASE_OUTPUT:-${repo_root}/release}"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/ladder-buddy-build.XXXXXXXX")"
trap 'rm -rf "$work_dir"' EXIT

for required in git go tar shasum; do
  command -v "$required" >/dev/null || { printf 'Missing build tool: %s\n' "$required" >&2; exit 1; }
done

mkdir -p "$release_dir"

# Fetch by immutable SHA and verify the exact checkout before applying our patch.
upstream_dir="${work_dir}/ladder"
mkdir "$upstream_dir"
git -C "$upstream_dir" init -q
git -C "$upstream_dir" remote add origin https://github.com/everywall/ladder.git
git -C "$upstream_dir" fetch -q --depth=1 origin "$ladder_ref"
git -C "$upstream_dir" checkout -q --detach FETCH_HEAD
[[ "$(git -C "$upstream_dir" rev-parse HEAD)" == "$ladder_ref" ]] || {
  printf 'Upstream commit verification failed\n' >&2
  exit 1
}
git -C "$upstream_dir" apply --check "${repo_root}/docker/ladder-buddy/user-agent-profiles.patch"
git -C "$upstream_dir" apply "${repo_root}/docker/ladder-buddy/user-agent-profiles.patch"
(
  cd "$upstream_dir"
  go test ./...
)

extension_build="${repo_root}/dist"
[[ -f "${extension_build}/manifest.json" ]] || {
  printf 'Build the Chrome extension first: pnpm install && pnpm build\n' >&2
  exit 1
}

# The archive carries the exact patched Ladder source and both project licenses.
for arch in arm64 amd64; do
  payload="${work_dir}/payload-${arch}"
  mkdir -p "${payload}/bin" "${payload}/extension" "${payload}/source" "${payload}/licenses"
  cp -R "${extension_build}/." "${payload}/extension/"
  cp -R "$upstream_dir" "${payload}/source/ladder"
  rm -rf "${payload}/source/ladder/.git"
  cp -R "${repo_root}/mac/helper" "${payload}/source/mac-helper"
  cp "${repo_root}/docker/ladder-buddy/user-agent-profiles.patch" "${payload}/source/user-agent-profiles.patch"
  cp "${repo_root}/scripts/build-macos-release.sh" "${payload}/source/build-macos-release.sh"
  cp "${repo_root}/LICENSE" "${payload}/licenses/LADDER-BUDDY-MIT.txt"
  cp "${upstream_dir}/LICENSE" "${payload}/licenses/LADDER-GPL-3.0.txt"
  cat > "${payload}/licenses/SOURCE_INFO.txt" <<EOF
Ladder Buddy release: ${version}
Ladder upstream: https://github.com/everywall/ladder
Pinned Ladder commit: ${ladder_ref}
The included source/ladder directory has source/user-agent-profiles.patch applied.
Build Ladder with Go 1.26 or newer: cd source/ladder && CGO_ENABLED=0 GOOS=darwin GOARCH=${arch} go build -o ladder ./cmd/main.go
Build the helper: cd source/mac-helper && CGO_ENABLED=0 GOOS=darwin GOARCH=${arch} go build -o ladder-buddy-helper .
The complete release recipe is source/build-macos-release.sh in the Ladder Buddy repository.
Ladder is licensed under GPL-3.0; see LADDER-GPL-3.0.txt.
Ladder Buddy is licensed under MIT; see LADDER-BUDDY-MIT.txt.
EOF

  (
    cd "$upstream_dir"
    CGO_ENABLED=0 GOOS=darwin GOARCH="$arch" go build -trimpath \
      -ldflags="-s -w -X ladder/handlers.version=${version}" \
      -o "${payload}/bin/ladder" ./cmd/main.go
  )
  (
    cd "${repo_root}/mac/helper"
    CGO_ENABLED=0 GOOS=darwin GOARCH="$arch" go build -trimpath \
      -ldflags="-s -w -X main.version=${version}" \
      -o "${payload}/bin/ladder-buddy-helper" .
  )
  chmod 755 "${payload}/bin/ladder" "${payload}/bin/ladder-buddy-helper"
  archive="ladder-buddy-macos-${arch}-${version}.tar.gz"
  tar -C "$payload" -czf "${release_dir}/${archive}" .
  printf 'Built %s\n' "$archive"
done

cp "${repo_root}/scripts/install-macos.sh" "${release_dir}/install-macos.sh"
(
  cd "$release_dir"
  shasum -a 256 "ladder-buddy-macos-arm64-${version}.tar.gz" \
    "ladder-buddy-macos-amd64-${version}.tar.gz" install-macos.sh > SHA256SUMS
)
