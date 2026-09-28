package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const healthPath = "/__ladder_buddy_health"
const healthResponse = "ladder-buddy-ok"
const defaultRulesetURL = "https://raw.githubusercontent.com/everywall/ladder-rules/main/ruleset.yaml"
const defaultUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"

type serviceState struct {
	ProtocolVersion int    `json:"protocolVersion"`
	Port            int    `json:"port"`
	Username        string `json:"username"`
	Password        string `json:"password"`
}

func (state serviceState) baseURL() string {
	return "http://127.0.0.1:" + strconv.Itoa(state.Port)
}

func serviceStatePath() (string, error) {
	home := os.Getenv("LADDER_BUDDY_HOME")
	if home == "" {
		userHome, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		home = filepath.Join(userHome, "Library", "Application Support", "Ladder Buddy")
	}
	return filepath.Join(home, "state", "service.json"), nil
}

func readServiceState(path string) (serviceState, error) {
	var state serviceState
	info, err := os.Lstat(path)
	if err != nil {
		return state, err
	}
	if !info.Mode().IsRegular() || info.Mode().Perm()&0077 != 0 {
		return state, fmt.Errorf("insecure service state permissions")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return state, err
	}
	if err := json.Unmarshal(data, &state); err != nil {
		return state, err
	}
	if state.ProtocolVersion != protocolVersion || state.Port < 0 || state.Port > 65535 ||
		state.Username == "" || state.Password == "" ||
		strings.Contains(state.Username, ":") || strings.Contains(state.Password, ":") {
		return state, fmt.Errorf("invalid or incompatible service state")
	}
	return state, nil
}

func newCredential() (string, error) {
	bytes := make([]byte, 24)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(bytes), nil
}

func loadOrCreateState(path string) (serviceState, error) {
	state, err := readServiceState(path)
	if err == nil {
		return state, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return state, err
	}
	username, err := newCredential()
	if err != nil {
		return state, err
	}
	password, err := newCredential()
	if err != nil {
		return state, err
	}
	state = serviceState{ProtocolVersion: protocolVersion, Username: username, Password: password}
	return state, writeServiceState(path, state)
}

func writeServiceState(path string, state serviceState) error {
	directory := filepath.Dir(path)
	if err := os.MkdirAll(directory, 0700); err != nil {
		return err
	}
	info, err := os.Lstat(directory)
	if err != nil {
		return err
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("service state directory is not a real directory")
	}
	if err := os.Chmod(directory, 0700); err != nil {
		return err
	}
	file, err := os.CreateTemp(directory, ".service-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	if err := file.Chmod(0600); err != nil {
		file.Close()
		return err
	}
	encoder := json.NewEncoder(file)
	if err := encoder.Encode(state); err != nil {
		file.Close()
		return err
	}
	if err := file.Sync(); err != nil {
		file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	return os.Rename(file.Name(), path)
}

func lockService(directory string) (*os.File, error) {
	if err := os.MkdirAll(directory, 0700); err != nil {
		return nil, err
	}
	file, err := os.OpenFile(filepath.Join(directory, "serve.lock"), os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, err
	}
	if err := syscall.Flock(int(file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		file.Close()
		return nil, fmt.Errorf("Ladder Buddy is already running: %w", err)
	}
	return file, nil
}

func ladderBinary() (string, error) {
	if path := os.Getenv("LADDER_BUDDY_LADDER_PATH"); path != "" {
		return path, nil
	}
	self, err := os.Executable()
	if err != nil {
		return "", err
	}
	return filepath.Join(filepath.Dir(self), "ladder"), nil
}

func preferredPort() (int, error) {
	value := os.Getenv("LADDER_BUDDY_PORT")
	if value == "" {
		return 8080, nil
	}
	port, err := strconv.Atoi(value)
	if err != nil || port < 1 || port > 65535 {
		return 0, fmt.Errorf("LADDER_BUDDY_PORT must be between 1 and 65535")
	}
	return port, nil
}

func availablePort(preferred int) (int, error) {
	port := preferred
	if port != 0 {
		listener, err := net.Listen("tcp4", net.JoinHostPort("127.0.0.1", strconv.Itoa(port)))
		if err == nil {
			listener.Close()
			return port, nil
		}
	}
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer listener.Close()
	return listener.Addr().(*net.TCPAddr).Port, nil
}

func controlledEnvironment(state serviceState) []string {
	ruleset := os.Getenv("LADDER_BUDDY_RULESET")
	if ruleset == "" {
		ruleset = os.Getenv("RULESET")
	}
	if ruleset == "" {
		ruleset = defaultRulesetURL
	}
	userAgent := os.Getenv("LADDER_BUDDY_USER_AGENT")
	if userAgent == "" {
		userAgent = os.Getenv("USER_AGENT")
	}
	if userAgent == "" {
		userAgent = defaultUserAgent
	}
	overrides := map[string]string{
		"BASE_PATH":                "",
		"PORT":                     strconv.Itoa(state.Port),
		"RULESET":                  ruleset,
		"USER_AGENT":               userAgent,
		"USERPASS":                 state.Username + ":" + state.Password,
		"ALLOW_REQUEST_USER_AGENT": "true",
		"ALLOW_CUSTOM_USER_AGENT":  "true",
		"LADDER_BUDDY_BIND_ALL":    "false",
		"PREFORK":                  "false",
		"NOLOGS":                   "true",
	}
	var env []string
	for _, value := range os.Environ() {
		key, _, ok := strings.Cut(value, "=")
		if !ok {
			continue
		}
		if _, replaced := overrides[key]; !replaced {
			env = append(env, value)
		}
	}
	for key, value := range overrides {
		env = append(env, key+"="+value)
	}
	return env
}

func healthy(state serviceState) bool {
	if state.Port < 1 || state.Port > 65535 {
		return false
	}
	client := &http.Client{
		Timeout:   750 * time.Millisecond,
		Transport: &http.Transport{Proxy: nil, DisableKeepAlives: true},
	}
	request, err := http.NewRequest(http.MethodGet, state.baseURL()+healthPath, nil)
	if err != nil {
		return false
	}
	request.SetBasicAuth(state.Username, state.Password)
	response, err := client.Do(request)
	if err != nil {
		return false
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return false
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, 128))
	return err == nil && string(body) == healthResponse
}

func serve() error {
	statePath, err := serviceStatePath()
	if err != nil {
		return err
	}
	lock, err := lockService(filepath.Dir(statePath))
	if err != nil {
		return err
	}
	defer lock.Close()
	state, err := loadOrCreateState(statePath)
	if err != nil {
		return err
	}
	ladderPath, err := ladderBinary()
	if err != nil {
		return err
	}
	if _, err := os.Stat(ladderPath); err != nil {
		return fmt.Errorf("Ladder binary is missing at %s: %w", ladderPath, err)
	}
	basePort, err := preferredPort()
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()
	for attempt := 0; attempt < 4; attempt++ {
		wanted := 0
		if attempt == 0 {
			wanted = basePort
		}
		port, err := availablePort(wanted)
		if err != nil {
			return err
		}
		state.Port = port
		cmd := exec.Command(ladderPath)
		cmd.Env = controlledEnvironment(state)
		cmd.Stdout = os.Stderr
		cmd.Stderr = os.Stderr
		if err := cmd.Start(); err != nil {
			return fmt.Errorf("start Ladder: %w", err)
		}
		exited := make(chan error, 1)
		go func() { exited <- cmd.Wait() }()
		ticker := time.NewTicker(100 * time.Millisecond)
		timeout := time.NewTimer(15 * time.Second)
		ready := false
		var childErr error
	startup:
		for !ready {
			select {
			case <-ctx.Done():
				stopProcess(cmd, exited)
				ticker.Stop()
				timeout.Stop()
				return nil
			case childErr = <-exited:
				break startup
			case <-timeout.C:
				stopProcess(cmd, exited)
				childErr = fmt.Errorf("Ladder did not become ready within 15 seconds")
				break startup
			case <-ticker.C:
				ready = healthy(state)
			}
		}
		ticker.Stop()
		timeout.Stop()
		if !ready {
			if attempt == 3 {
				if childErr == nil {
					childErr = fmt.Errorf("Ladder stopped before becoming ready")
				}
				return fmt.Errorf("Ladder failed to start: %w", childErr)
			}
			continue
		}
		if err := writeServiceState(statePath, state); err != nil {
			stopProcess(cmd, exited)
			return err
		}
		select {
		case <-ctx.Done():
			stopProcess(cmd, exited)
			return nil
		case err := <-exited:
			if err == nil {
				return fmt.Errorf("Ladder stopped unexpectedly")
			}
			return fmt.Errorf("Ladder stopped: %w", err)
		}
	}
	return fmt.Errorf("Ladder failed to start")
}

func stopProcess(cmd *exec.Cmd, exited <-chan error) {
	_ = cmd.Process.Signal(syscall.SIGTERM)
	select {
	case <-exited:
	case <-time.After(3 * time.Second):
		_ = cmd.Process.Kill()
		<-exited
	}
}

func status(output io.Writer) error {
	path, err := serviceStatePath()
	if err != nil {
		return err
	}
	state, err := readServiceState(path)
	if err != nil {
		return err
	}
	result := struct {
		Ready   bool   `json:"ready"`
		BaseURL string `json:"baseUrl"`
		Version string `json:"version"`
	}{Ready: healthy(state), BaseURL: state.baseURL(), Version: version}
	return json.NewEncoder(output).Encode(result)
}
