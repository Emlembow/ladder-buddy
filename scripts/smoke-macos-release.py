#!/usr/bin/env python3
"""Exercise the released installer and binaries on a clean macOS runner."""

from __future__ import annotations

import base64
import http.server
import json
import os
import pathlib
import platform
import plistlib
import socket
import struct
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request


ORIGIN = "chrome-extension://pgfogjceniomjagflcagnnckcpmlanpf/"
HOST_NAME = "com.emlembow.ladderbuddy"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def http_request(url: str, *, username: str = "", password: str = "", data: bytes | None = None):
    headers = {}
    if username:
        credentials = base64.b64encode(f"{username}:{password}".encode()).decode()
        headers["Authorization"] = f"Basic {credentials}"
    if data is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(request, timeout=5) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def native_message(helper: pathlib.Path, origin: str, env: dict[str, str], message=None, *, chrome_style=False):
    payload = b""
    if message is not None:
        encoded = json.dumps(message).encode()
        payload = struct.pack("<I", len(encoded)) + encoded
    command = [str(helper), origin] if chrome_style else [str(helper), "native-host", origin]
    result = subprocess.run(
        command,
        input=payload,
        capture_output=True,
        check=True,
        timeout=10,
        env=env,
    )
    require(len(result.stdout) >= 4, "native host returned no frame")
    length = struct.unpack("<I", result.stdout[:4])[0]
    require(len(result.stdout) == length + 4, "native host returned an invalid frame")
    return json.loads(result.stdout[4:])


class Fixture(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/article":
            body = b'<html><body><main>ladder-buddy-smoke-article<img src="/image.png"></main></body></html>'
            content_type = "text/html; charset=utf-8"
        elif self.path == "/image.png":
            body = b"smoke-image-bytes"
            content_type = "image/png"
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass


def wait_ready(helper: pathlib.Path, env: dict[str, str], process: subprocess.Popen):
    deadline = time.monotonic() + 40
    while time.monotonic() < deadline:
        require(process.poll() is None, "helper exited before Ladder became ready")
        result = subprocess.run([str(helper), "status"], capture_output=True, env=env, timeout=3)
        if result.returncode == 0:
            status = json.loads(result.stdout)
            if status.get("ready") is True:
                return status
        time.sleep(0.2)
    raise RuntimeError("helper did not become ready within 40 seconds")


def main() -> None:
    require(platform.system() == "Darwin", "macOS runner required")
    require(len(sys.argv) == 3, "usage: smoke-macos-release.py RELEASE_DIR VERSION")
    release_dir = pathlib.Path(sys.argv[1]).resolve()
    version = sys.argv[2]
    arch = {"arm64": "arm64", "x86_64": "amd64"}.get(platform.machine())
    require(arch is not None, f"unsupported runner processor: {platform.machine()}")
    archive = release_dir / f"ladder-buddy-macos-{arch}-{version}.tar.gz"
    require(archive.is_file(), f"missing release archive: {archive.name}")

    with tempfile.TemporaryDirectory(prefix="ladder-buddy-smoke-") as directory:
        root = pathlib.Path(directory)
        home = root / "home"
        home.mkdir()
        install_env = os.environ.copy()
        install_env.update({
            "HOME": str(home),
            "LADDER_BUDDY_VERSION": version,
            "LADDER_BUDDY_RELEASE_BASE_URL": release_dir.as_uri(),
            "LADDER_BUDDY_SKIP_LAUNCH": "1",
            "LADDER_BUDDY_SKIP_OPEN": "1",
        })
        subprocess.run(
            ["bash", str(release_dir / "install-macos.sh")],
            check=True,
            timeout=60,
            env=install_env,
        )

        app_root = home / "Library/Application Support/Ladder Buddy"
        helper = app_root / "current/bin/ladder-buddy-helper"
        ladder = app_root / "current/bin/ladder"
        require(helper.is_file() and ladder.is_file(), "installer omitted a packaged binary")
        manifest = json.loads((home / f"Library/Application Support/Google/Chrome/NativeMessagingHosts/{HOST_NAME}.json").read_text())
        require(manifest["path"] == str(helper), "native host points to the wrong helper")
        require(manifest["allowed_origins"] == [ORIGIN], "native host origin list changed")
        with (home / f"Library/LaunchAgents/{HOST_NAME}.plist").open("rb") as agent_file:
            agent = plistlib.load(agent_file)
        require(agent["ProgramArguments"] == [str(helper), "serve"], "login agent command changed")

        fixture = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Fixture)
        fixture_thread = threading.Thread(target=fixture.serve_forever, daemon=True)
        fixture_thread.start()
        occupied = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            occupied.bind(("127.0.0.1", 8080))
            occupied.listen()
        except OSError:
            occupied.close()
            occupied = None

        env = install_env.copy()
        env.update({
            "LADDER_BUDDY_HOME": str(app_root),
            "LADDER_BUDDY_PORT": "8080",
            "LADDER_BUDDY_RULESET": str(app_root / "current/source/ladder/ruleset.yaml"),
        })
        log_path = root / "helper.log"
        process = None
        try:
            with log_path.open("wb") as log:
                process = subprocess.Popen([str(helper), "serve"], env=env, stdout=log, stderr=subprocess.STDOUT)
                status = wait_ready(helper, env, process)
                base_url = status["baseUrl"]
                require(status["version"] == version, "helper binary version changed")
                require(base_url.startswith("http://127.0.0.1:"), "helper returned a nonlocal URL")
                port = int(base_url.rsplit(":", 1)[1])
                require(port != 8080, "busy port 8080 was not avoided")

                state_path = app_root / "state/service.json"
                require(state_path.stat().st_mode & 0o077 == 0, "credentials file is readable by others")
                connection = native_message(helper, ORIGIN, env, {"type": "getConnection", "protocolVersion": 1}, chrome_style=True)
                require(connection["protocolVersion"] == 1, "native protocol version changed")
                require(connection["baseUrl"] == base_url, "native host returned another URL")
                require(connection["version"] == version, "native host version changed")
                username, password = connection["username"], connection["password"]
                require(bool(username and password), "native host omitted credentials")
                explicit = native_message(helper, ORIGIN, env, {"type": "getConnection", "protocolVersion": 1})
                require(explicit == connection, "explicit native-host mode differs from Chrome invocation")
                denied = native_message(helper, "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/", env, chrome_style=True)
                require(denied.get("error", {}).get("code") == "UNAUTHORIZED_ORIGIN", "unrelated extension was accepted")
                require("username" not in denied and "password" not in denied, "unrelated extension received credentials")

                health = base_url + "/__ladder_buddy_health"
                require(http_request(health)[0] == 401, "unauthenticated request was accepted")
                require(http_request(health, username="wrong", password="wrong")[0] == 401, "wrong credentials were accepted")
                code, body = http_request(health, username=username, password=password)
                require(code == 200 and body == b"ladder-buddy-ok", "authenticated health request failed")

                listeners = subprocess.run(
                    ["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN"],
                    capture_output=True,
                    text=True,
                    check=True,
                    timeout=5,
                ).stdout
                listener_lines = listeners.splitlines()[1:]
                require(listener_lines and all(f"127.0.0.1:{port}" in line for line in listener_lines),
                        f"Ladder is not bound only to loopback: {listeners}")

                upstream = f"http://127.0.0.1:{fixture.server_port}"
                code, body = http_request(base_url + "/" + upstream + "/article", username=username, password=password)
                require(code == 200 and b"ladder-buddy-smoke-article" in body, "proxy did not return the fixture page")
                require((f'/http://127.0.0.1:{fixture.server_port}/image.png').encode() in body,
                        "HTTP image URL was not rewritten through Ladder")
                code, body = http_request(base_url + "/" + upstream + "/image.png", username=username, password=password)
                require(code == 200 and body == b"smoke-image-bytes", "proxied image failed")
                api_body = json.dumps({"url": upstream + "/article", "userAgentProfile": "browser-chrome"}).encode()
                code, body = http_request(base_url + "/api", username=username, password=password, data=api_body)
                api = json.loads(body)
                require(code == 200 and api["response"]["status"] == 200 and "ladder-buddy-smoke-article" in api["body"],
                        "Reader API fetch failed")

                # Rerunning the one-command installer must preserve the local identity.
                state_before = state_path.read_bytes()
                process.terminate()
                process.wait(timeout=5)
                subprocess.run(
                    ["bash", str(release_dir / "install-macos.sh")],
                    check=True,
                    timeout=60,
                    env=install_env,
                )
                require(state_path.read_bytes() == state_before, "reinstall changed local credentials")
                extension = app_root / "extension"
                require((extension / "manifest.json").is_file() and (extension / "popup.html").is_file(),
                        "reinstall left an incomplete extension")
                process = subprocess.Popen([str(helper), "serve"], env=env, stdout=log, stderr=subprocess.STDOUT)
                restarted = wait_ready(helper, env, process)
                require(restarted["ready"] is True, "service did not restart after reinstall")
                restored = native_message(helper, ORIGIN, env, {"type": "getConnection", "protocolVersion": 1}, chrome_style=True)
                require((restored["username"], restored["password"]) == (username, password),
                        "service did not preserve credentials after reinstall")
            print(f"macOS {arch} release smoke passed: install/reinstall, fallback port, loopback, auth, native host, proxy, Reader API")
        except Exception:
            if log_path.exists():
                print("Helper/Ladder log tail:\n" + log_path.read_text(errors="replace")[-4000:], file=sys.stderr)
            raise
        finally:
            if process is not None and process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
            if occupied is not None:
                occupied.close()
            fixture.shutdown()
            fixture.server_close()


if __name__ == "__main__":
    main()
