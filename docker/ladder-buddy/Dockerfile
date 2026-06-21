ARG LADDER_REF=main
ARG VERSION=ladder-buddy

FROM golang:1.26 AS build
ARG LADDER_REF
ARG VERSION

WORKDIR /go/src
RUN git clone --depth=1 --branch "${LADDER_REF}" https://github.com/everywall/ladder.git ladder
WORKDIR /go/src/ladder

COPY docker/ladder-buddy/user-agent-profiles.patch /tmp/user-agent-profiles.patch
RUN git apply /tmp/user-agent-profiles.patch

RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-X ladder/handlers.version=${VERSION}" -o ladder cmd/main.go

FROM gcr.io/distroless/static-debian13:nonroot AS release
WORKDIR /app
COPY --from=build /go/src/ladder/ladder .
ENTRYPOINT ["/app/ladder"]
