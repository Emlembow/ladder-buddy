#!/bin/bash
# Install a prebuilt Ladder Buddy release for the current macOS user.
set -euo pipefail

umask 077

repo_url="https://github.com/Emlembow/ladder-buddy"
app_root="${HOME}/Library/Application Support/Ladder Buddy"
host_name="com.emlembow.ladderbuddy"
extension_id="pgfogjceniomjagflcagnnckcpmlanpf"

fail() {
  printf 'Ladder Buddy install failed: %s\n' "$*" >&2
  exit 1
}

json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

xml_escape() {
  printf '%s' "$1" | sed -e 's/\&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/"/\&quot;/g' -e "s/'/\&apos;/g"
}

[[ "$(uname -s)" == "Darwin" ]] || fail "this installer requires macOS"
for required in curl tar shasum mktemp sed awk grep launchctl; do
  command -v "$required" >/dev/null || fail "missing required macOS command: $required"
done

case "$(uname -m)" in
  arm64) arch=arm64 ;;
  x86_64) arch=amd64 ;;
  *) fail "unsupported Mac processor: $(uname -m)" ;;
esac

version="${LADDER_BUDDY_VERSION:-}"
if [[ -z "$version" ]]; then
  latest_url="$(curl -fsSL --retry 3 -o /dev/null -w '%{url_effective}' "$repo_url/releases/latest")"
  version="${latest_url##*/}"
fi
[[ "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.-]+)?$ ]] || fail "could not determine a release version (got: $version)"

release_base="${LADDER_BUDDY_RELEASE_BASE_URL:-${repo_url}/releases/download/${version}}"
archive="ladder-buddy-macos-${arch}-${version}.tar.gz"
download_dir="$(mktemp -d "${TMPDIR:-/tmp}/ladder-buddy-download.XXXXXXXX")"
staging_dir=""
new_extension=""
new_link=""
previous_release=""
previous_extension=""
previous_current=""
release_dir=""
extension_dir=""
release_swapped=0
extension_swapped=0
link_swapped=0
agent_stopped=0
agent_started=0
service=""
agent_plist=""
native_manifest=""
native_manifest_created=0
agent_plist_created=0
previous_native_manifest=""
previous_agent_plist=""
native_manifest_tmp=""
agent_plist_tmp=""
cleanup() {
  result=$?
  trap - EXIT
  set +e
  if [[ "$result" != 0 ]]; then
    if [[ "$agent_started" == 1 ]]; then
      launchctl bootout "$service" >/dev/null 2>&1
    fi
    if [[ "$link_swapped" == 1 ]]; then
      if [[ -n "$previous_current" ]]; then
        restore_link="${app_root}/.restore-current.$$"
        ln -s "$previous_current" "$restore_link"
        mv -f -h "$restore_link" "${app_root}/current"
      else
        rm -f "${app_root}/current"
      fi
    fi
    if [[ "$extension_swapped" == 1 ]]; then
      rm -rf "$extension_dir"
    fi
    if [[ -n "$previous_extension" ]]; then
      mv "$previous_extension" "$extension_dir"
      previous_extension=""
    fi
    if [[ "$release_swapped" == 1 ]]; then
      rm -rf "$release_dir"
    fi
    if [[ -n "$previous_release" ]]; then
      mv "$previous_release" "$release_dir"
      previous_release=""
    fi
    if [[ -n "$previous_native_manifest" ]]; then
      mv -f "$previous_native_manifest" "$native_manifest"
      previous_native_manifest=""
    elif [[ "$native_manifest_created" == 1 ]]; then
      rm -f "$native_manifest"
    fi
    if [[ -n "$previous_agent_plist" ]]; then
      mv -f "$previous_agent_plist" "$agent_plist"
      previous_agent_plist=""
    elif [[ "$agent_plist_created" == 1 ]]; then
      rm -f "$agent_plist"
    fi
    if [[ "$agent_stopped" == 1 && -n "$previous_current" ]]; then
      launchctl bootstrap "gui/$(id -u)" "$agent_plist" >/dev/null 2>&1
    fi
  fi
  [[ -z "$download_dir" ]] || rm -rf "$download_dir"
  [[ -z "$staging_dir" ]] || rm -rf "$staging_dir"
  [[ -z "$new_extension" ]] || rm -rf "$new_extension"
  [[ -z "$new_link" ]] || rm -f "$new_link"
  [[ -z "$native_manifest_tmp" ]] || rm -f "$native_manifest_tmp"
  [[ -z "$agent_plist_tmp" ]] || rm -f "$agent_plist_tmp"
  [[ -z "$previous_native_manifest" ]] || rm -f "$previous_native_manifest"
  [[ -z "$previous_agent_plist" ]] || rm -f "$previous_agent_plist"
  exit "$result"
}
trap cleanup EXIT

printf 'Downloading Ladder Buddy %s for %s...\n' "$version" "$arch"
curl -fsSL --retry 3 "${release_base}/${archive}" -o "${download_dir}/${archive}"
curl -fsSL --retry 3 "${release_base}/SHA256SUMS" -o "${download_dir}/SHA256SUMS"
checksum="$(awk -v file="$archive" '$2 == file { print $1 }' "${download_dir}/SHA256SUMS")"
[[ "$checksum" =~ ^[[:xdigit:]]{64}$ ]] || fail "release checksum is missing or malformed"
actual_checksum="$(shasum -a 256 "${download_dir}/${archive}" | awk '{ print $1 }')"
[[ "$actual_checksum" == "$checksum" ]] || fail "archive checksum did not match the release"

mkdir -p "${app_root}/releases" "${app_root}/state" "${app_root}/logs"
chmod 700 "$app_root" "${app_root}/state" "${app_root}/logs"
staging_dir="$(mktemp -d "${app_root}/.release.XXXXXXXX")"
tar -xzf "${download_dir}/${archive}" -C "$staging_dir"
[[ -x "${staging_dir}/bin/ladder" ]] || fail "release archive has no Ladder binary"
[[ -x "${staging_dir}/bin/ladder-buddy-helper" ]] || fail "release archive has no helper binary"
[[ -f "${staging_dir}/extension/manifest.json" ]] || fail "release archive has no Chrome extension"
[[ -f "${staging_dir}/licenses/LADDER-GPL-3.0.txt" ]] || fail "release archive has no Ladder license"
[[ -d "${staging_dir}/source/ladder" ]] || fail "release archive has no patched Ladder source"

release_dir="${app_root}/releases/${version}-${arch}"
if [[ -e "$release_dir" ]]; then
  previous_release="$(mktemp -d "${app_root}/.previous-release.XXXXXXXX")"
  rmdir "$previous_release"
  mv "$release_dir" "$previous_release"
fi
mv "$staging_dir" "$release_dir"
staging_dir=""
release_swapped=1

# Chrome retains the unpacked extension's path, so keep a real folder at this location.
new_extension="$(mktemp -d "${app_root}/.extension.XXXXXXXX")"
cp -R "${release_dir}/extension/." "$new_extension/"
extension_dir="${app_root}/extension"
if [[ -e "$extension_dir" ]]; then
  previous_extension="$(mktemp -d "${app_root}/.previous-extension.XXXXXXXX")"
  rmdir "$previous_extension"
  mv "$extension_dir" "$previous_extension"
fi
mv "$new_extension" "$extension_dir"
new_extension=""
extension_swapped=1

if [[ -L "${app_root}/current" ]]; then
  previous_current="$(readlink "${app_root}/current")"
fi
new_link="${app_root}/.current.$$"
ln -s "releases/${version}-${arch}" "$new_link"
mv -f -h "$new_link" "${app_root}/current"
new_link=""
link_swapped=1

native_host_dir="${HOME}/Library/Application Support/Google/Chrome/NativeMessagingHosts"
mkdir -p "$native_host_dir"
native_manifest="${native_host_dir}/${host_name}.json"
if [[ -e "$native_manifest" ]]; then
  previous_native_manifest="$(mktemp "${native_host_dir}/.previous-ladder-buddy-host.XXXXXXXX")"
  cp -p "$native_manifest" "$previous_native_manifest"
else
  native_manifest_created=1
fi
native_manifest_tmp="$(mktemp "${native_host_dir}/.ladder-buddy-host.XXXXXXXX")"
helper_path="${app_root}/current/bin/ladder-buddy-helper"
cat > "$native_manifest_tmp" <<EOF
{
  "name": "${host_name}",
  "description": "Ladder Buddy local connection helper",
  "path": "$(json_escape "$helper_path")",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://${extension_id}/"]
}
EOF
chmod 600 "$native_manifest_tmp"
mv -f "$native_manifest_tmp" "$native_manifest"

agent_dir="${HOME}/Library/LaunchAgents"
mkdir -p "$agent_dir"
agent_plist="${agent_dir}/${host_name}.plist"
if [[ -e "$agent_plist" ]]; then
  previous_agent_plist="$(mktemp "${agent_dir}/.previous-ladder-buddy-agent.XXXXXXXX")"
  cp -p "$agent_plist" "$previous_agent_plist"
else
  agent_plist_created=1
fi
agent_plist_tmp="$(mktemp "${agent_dir}/.ladder-buddy-agent.XXXXXXXX")"
cat > "$agent_plist_tmp" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${host_name}</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(xml_escape "$helper_path")</string>
    <string>serve</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$(xml_escape "${app_root}/logs/helper.log")</string>
  <key>StandardErrorPath</key><string>$(xml_escape "${app_root}/logs/helper-error.log")</string>
</dict>
</plist>
EOF
chmod 600 "$agent_plist_tmp"
mv -f "$agent_plist_tmp" "$agent_plist"

if [[ "${LADDER_BUDDY_SKIP_LAUNCH:-0}" != "1" ]]; then
  service="gui/$(id -u)/${host_name}"
  if launchctl print "$service" >/dev/null 2>&1; then
    launchctl bootout "$service" || fail "could not stop the previous login agent"
    agent_stopped=1
  fi
  launchctl bootstrap "gui/$(id -u)" "$agent_plist" || fail "could not start the login agent; try again in a signed-in Mac desktop session"
  agent_started=1
  launchctl print "$service" >/dev/null || fail "login agent did not start"
  ready=0
  for ((attempt = 0; attempt < 70; attempt++)); do
    if "$helper_path" status 2>/dev/null | grep -q '"ready":true'; then
      ready=1
      break
    fi
    sleep 1
  done
  [[ "$ready" == 1 ]] || fail "the local proxy did not become ready; check ${app_root}/logs/helper-error.log"
fi

[[ -z "$previous_release" ]] || rm -rf "$previous_release"
[[ -z "$previous_extension" ]] || rm -rf "$previous_extension"

printf '\nInstalled Ladder Buddy %s.\n' "$version"
printf 'Chrome extension folder: %s\n' "$extension_dir"
if [[ -z "$previous_extension" ]]; then
  printf 'In Chrome: open chrome://extensions, turn on Developer mode, then choose Load unpacked and select that folder.\n'
else
  printf 'In Chrome: open chrome://extensions and click Reload on the Ladder Buddy extension.\n'
fi
printf 'Rerun this command later to update or repair the installation.\n'
if [[ "${LADDER_BUDDY_SKIP_OPEN:-0}" != "1" ]]; then
  open -R "$extension_dir" >/dev/null 2>&1 || true
  open -a "Google Chrome" "chrome://extensions/" >/dev/null 2>&1 || true
fi
