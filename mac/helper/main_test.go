package main

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func TestStatePreservesCredentialsAndPermissions(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state", "service.json")
	first, err := loadOrCreateState(path)
	if err != nil {
		t.Fatal(err)
	}
	second, err := loadOrCreateState(path)
	if err != nil {
		t.Fatal(err)
	}
	if first != second || first.Username == first.Password {
		t.Fatal("credentials were not unique and persistent")
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0600 {
		t.Fatalf("state permissions: %o", info.Mode().Perm())
	}
	if err := os.Chmod(path, 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := readServiceState(path); err == nil {
		t.Fatal("read world-readable credentials")
	}
}

func TestNativeHostRejectsForeignOrigin(t *testing.T) {
	input := framedRequest(t, nativeRequest{Type: "getConnection", ProtocolVersion: protocolVersion})
	var output bytes.Buffer
	if err := nativeHost("chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/", &input, &output); err != nil {
		t.Fatal(err)
	}
	response := decodeResponse(t, &output)
	if response.Error == nil || response.Error.Code != "UNAUTHORIZED_ORIGIN" {
		t.Fatalf("unexpected response: %+v", response)
	}
}

func TestNativeHostReportsMissingService(t *testing.T) {
	t.Setenv("LADDER_BUDDY_HOME", t.TempDir())
	input := framedRequest(t, nativeRequest{Type: "getConnection", ProtocolVersion: protocolVersion})
	var output bytes.Buffer
	if err := nativeHost(extensionOrigin, &input, &output); err != nil {
		t.Fatal(err)
	}
	response := decodeResponse(t, &output)
	if response.Error == nil || response.Error.Code != "SERVICE_UNAVAILABLE" {
		t.Fatalf("unexpected response: %+v", response)
	}
}

func TestGetConnectionRequiresAuthenticatedHealth(t *testing.T) {
	t.Setenv("LADDER_BUDDY_HOME", t.TempDir())
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		username, password, ok := request.BasicAuth()
		if request.URL.Path != healthPath || !ok || username != "test-user" || password != "test-password" {
			writer.WriteHeader(http.StatusUnauthorized)
			return
		}
		_, _ = writer.Write([]byte(healthResponse))
	}))
	defer server.Close()
	address := strings.TrimPrefix(server.URL, "http://")
	_, portText, err := net.SplitHostPort(address)
	if err != nil {
		t.Fatal(err)
	}
	port, err := strconv.Atoi(portText)
	if err != nil {
		t.Fatal(err)
	}
	path, err := serviceStatePath()
	if err != nil {
		t.Fatal(err)
	}
	state := serviceState{ProtocolVersion: protocolVersion, Port: port, Username: "test-user", Password: "test-password"}
	if err := writeServiceState(path, state); err != nil {
		t.Fatal(err)
	}
	response := handleNativeRequest(nativeRequest{Type: "getConnection", ProtocolVersion: protocolVersion})
	if response.Error != nil || response.BaseURL != server.URL || response.Username != state.Username || response.Password != state.Password {
		t.Fatalf("unexpected connection response: %+v", response)
	}
	state.Password = "wrong-password"
	if err := writeServiceState(path, state); err != nil {
		t.Fatal(err)
	}
	response = handleNativeRequest(nativeRequest{Type: "getConnection", ProtocolVersion: protocolVersion})
	if response.Error == nil || response.Error.Code != "SERVICE_UNAVAILABLE" {
		t.Fatalf("unhealthy service was returned: %+v", response)
	}
}

func TestAvailablePortFallsBackWhenOccupied(t *testing.T) {
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	port, err := availablePort(listener.Addr().(*net.TCPAddr).Port)
	if err != nil {
		t.Fatal(err)
	}
	if port == listener.Addr().(*net.TCPAddr).Port || port < 1 {
		t.Fatalf("did not choose a free fallback port: %d", port)
	}
}

func TestControlledEnvironmentForcesLocalAuthenticatedService(t *testing.T) {
	t.Setenv("PORT", "9999")
	t.Setenv("USERPASS", "unsafe:shared")
	t.Setenv("BASE_PATH", "/unexpected")
	t.Setenv("RULESET", "")
	t.Setenv("LADDER_BUDDY_RULESET", "")
	t.Setenv("USER_AGENT", "")
	t.Setenv("LADDER_BUDDY_USER_AGENT", "")
	state := serviceState{Port: 38733, Username: "user", Password: "secret"}
	values := map[string]string{}
	for _, pair := range controlledEnvironment(state) {
		key, value, ok := strings.Cut(pair, "=")
		if ok {
			values[key] = value
		}
	}
	for key, want := range map[string]string{
		"PORT": "38733", "USERPASS": "user:secret", "BASE_PATH": "",
		"RULESET":               defaultRulesetURL,
		"USER_AGENT":            defaultUserAgent,
		"LADDER_BUDDY_BIND_ALL": "false", "ALLOW_REQUEST_USER_AGENT": "true",
		"ALLOW_CUSTOM_USER_AGENT": "true", "PREFORK": "false",
	} {
		if values[key] != want {
			t.Errorf("%s = %q, want %q", key, values[key], want)
		}
	}
}

func TestRulesetOverride(t *testing.T) {
	t.Setenv("RULESET", "/tmp/ladder-rules.yaml")
	t.Setenv("LADDER_BUDDY_RULESET", "")
	env := controlledEnvironment(serviceState{Port: 38733, Username: "user", Password: "secret"})
	if got := valueForEnv(env, "RULESET"); got != "/tmp/ladder-rules.yaml" {
		t.Fatalf("RULESET override = %q", got)
	}
	t.Setenv("LADDER_BUDDY_RULESET", "https://example.test/ruleset.yaml")
	env = controlledEnvironment(serviceState{Port: 38733, Username: "user", Password: "secret"})
	if got := valueForEnv(env, "RULESET"); got != "https://example.test/ruleset.yaml" {
		t.Fatalf("LADDER_BUDDY_RULESET override = %q", got)
	}
}

func TestServerUserAgentOverride(t *testing.T) {
	t.Setenv("USER_AGENT", "manual-server-agent")
	t.Setenv("LADDER_BUDDY_USER_AGENT", "")
	env := controlledEnvironment(serviceState{Port: 38733, Username: "user", Password: "secret"})
	if got := valueForEnv(env, "USER_AGENT"); got != "manual-server-agent" {
		t.Fatalf("USER_AGENT override = %q", got)
	}
	t.Setenv("LADDER_BUDDY_USER_AGENT", "helper-specific-agent")
	env = controlledEnvironment(serviceState{Port: 38733, Username: "user", Password: "secret"})
	if got := valueForEnv(env, "USER_AGENT"); got != "helper-specific-agent" {
		t.Fatalf("LADDER_BUDDY_USER_AGENT override = %q", got)
	}
}

func valueForEnv(values []string, wanted string) string {
	for _, pair := range values {
		key, value, ok := strings.Cut(pair, "=")
		if ok && key == wanted {
			return value
		}
	}
	return ""
}

func TestProtocolMismatch(t *testing.T) {
	response := handleNativeRequest(nativeRequest{Type: "getConnection", ProtocolVersion: 999})
	if response.Error == nil || response.Error.Code != "INCOMPATIBLE_PROTOCOL" {
		t.Fatalf("unexpected response: %+v", response)
	}
}

func framedRequest(t *testing.T, request nativeRequest) bytes.Buffer {
	t.Helper()
	message, err := json.Marshal(request)
	if err != nil {
		t.Fatal(err)
	}
	var input bytes.Buffer
	if err := binary.Write(&input, binary.LittleEndian, uint32(len(message))); err != nil {
		t.Fatal(err)
	}
	_, _ = input.Write(message)
	return input
}

func decodeResponse(t *testing.T, input *bytes.Buffer) nativeResponse {
	t.Helper()
	message, err := readNativeMessage(input)
	if err != nil {
		t.Fatal(err)
	}
	var response nativeResponse
	if err := json.Unmarshal(message, &response); err != nil {
		t.Fatal(err)
	}
	return response
}
