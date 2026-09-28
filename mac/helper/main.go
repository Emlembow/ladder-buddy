package main

import (
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
)

const (
	protocolVersion = 1
	extensionOrigin = "chrome-extension://pgfogjceniomjagflcagnnckcpmlanpf/"
	maxMessageSize  = 1024 * 1024
)

// The release build sets this through -ldflags "-X main.version=...".
var version = "dev"

type nativeRequest struct {
	Type            string `json:"type"`
	ProtocolVersion int    `json:"protocolVersion"`
}

type nativeError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type nativeResponse struct {
	ProtocolVersion int          `json:"protocolVersion"`
	BaseURL         string       `json:"baseUrl,omitempty"`
	Username        string       `json:"username,omitempty"`
	Password        string       `json:"password,omitempty"`
	Version         string       `json:"version,omitempty"`
	Error           *nativeError `json:"error,omitempty"`
}

func main() {
	args := os.Args[1:]
	var err error
	switch {
	case len(args) == 1 && args[0] == "serve":
		err = serve()
	case len(args) == 1 && args[0] == "status":
		err = status(os.Stdout)
	case len(args) == 2 && args[0] == "native-host":
		err = nativeHost(args[1], os.Stdin, os.Stdout)
	case len(args) == 1 && strings.HasPrefix(args[0], "chrome-extension://"):
		// Chrome supplies the caller's origin as argv[1]. The native host
		// manifest therefore points directly at this executable.
		err = nativeHost(args[0], os.Stdin, os.Stdout)
	default:
		err = fmt.Errorf("usage: ladder-buddy-helper serve|status|native-host <chrome-extension-origin>")
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func nativeHost(origin string, input io.Reader, output io.Writer) error {
	if normalizeOrigin(origin) != extensionOrigin {
		return writeNativeMessage(output, nativeResponse{
			ProtocolVersion: protocolVersion,
			Error:           &nativeError{Code: "UNAUTHORIZED_ORIGIN", Message: "This Chrome extension is not allowed to use Ladder Buddy."},
		})
	}
	for {
		payload, err := readNativeMessage(input)
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return err
		}
		var request nativeRequest
		if err := json.Unmarshal(payload, &request); err != nil {
			if err := writeNativeMessage(output, nativeResponse{
				ProtocolVersion: protocolVersion,
				Error:           &nativeError{Code: "INVALID_REQUEST", Message: "The extension sent an invalid request."},
			}); err != nil {
				return err
			}
			continue
		}
		response := handleNativeRequest(request)
		if err := writeNativeMessage(output, response); err != nil {
			return err
		}
	}
}

func normalizeOrigin(origin string) string {
	return strings.TrimRight(origin, "/") + "/"
}

func handleNativeRequest(request nativeRequest) nativeResponse {
	response := nativeResponse{ProtocolVersion: protocolVersion}
	if request.ProtocolVersion != protocolVersion {
		response.Error = &nativeError{Code: "INCOMPATIBLE_PROTOCOL", Message: "Update Ladder Buddy to a matching version."}
		return response
	}
	if request.Type != "getConnection" {
		response.Error = &nativeError{Code: "UNKNOWN_REQUEST", Message: "The extension requested an unknown operation."}
		return response
	}
	statePath, err := serviceStatePath()
	if err != nil {
		response.Error = &nativeError{Code: "SERVICE_UNAVAILABLE", Message: "The Ladder Buddy service location is unavailable."}
		return response
	}
	state, err := readServiceState(statePath)
	if err != nil {
		response.Error = &nativeError{Code: "SERVICE_UNAVAILABLE", Message: "The Ladder Buddy service is not installed or has not started."}
		return response
	}
	if state.Port == 0 || !healthy(state) {
		response.Error = &nativeError{Code: "SERVICE_UNAVAILABLE", Message: "The Ladder Buddy service is not running. Run the installer again, then retry."}
		return response
	}
	response.BaseURL = state.baseURL()
	response.Username = state.Username
	response.Password = state.Password
	response.Version = version
	return response
}

func readNativeMessage(input io.Reader) ([]byte, error) {
	var length uint32
	if err := binary.Read(input, binary.LittleEndian, &length); err != nil {
		return nil, err
	}
	if length == 0 || length > maxMessageSize {
		return nil, fmt.Errorf("invalid native message length: %d", length)
	}
	message := make([]byte, length)
	_, err := io.ReadFull(input, message)
	return message, err
}

func writeNativeMessage(output io.Writer, response nativeResponse) error {
	message, err := json.Marshal(response)
	if err != nil {
		return err
	}
	if len(message) > maxMessageSize {
		return fmt.Errorf("native response is too large")
	}
	if err := binary.Write(output, binary.LittleEndian, uint32(len(message))); err != nil {
		return err
	}
	_, err = output.Write(message)
	return err
}
