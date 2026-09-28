ARG LADDER_REF=76143f7473a86e750787cf6f44756964363f9bbc
ARG VERSION=ladder-buddy

FROM golang:1.26 AS build
ARG LADDER_REF
ARG VERSION

WORKDIR /go/src/ladder
RUN git init && \
    git remote add origin https://github.com/everywall/ladder.git && \
    git fetch --depth=1 origin "${LADDER_REF}" && \
    git checkout --detach FETCH_HEAD && \
    test "$(git rev-parse HEAD)" = "${LADDER_REF}"

COPY docker/ladder-buddy/user-agent-profiles.patch /tmp/user-agent-profiles.patch
RUN git apply /tmp/user-agent-profiles.patch

RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-X ladder/handlers.version=${VERSION}" -o ladder cmd/main.go

FROM gcr.io/distroless/static-debian13:nonroot AS release
WORKDIR /app
COPY --from=build /go/src/ladder/ladder .
ENV LADDER_BUDDY_BIND_ALL=true
ENTRYPOINT ["/app/ladder"]
