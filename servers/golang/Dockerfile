FROM golang:1.25-alpine AS builder

RUN apk add --no-cache git gcc musl-dev

WORKDIR /app

COPY go.mod go.sum ./

RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build \
    -a \
    -installsuffix cgo \
    -ldflags="-w -s" \
    -o server .


FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=builder /app/server /app/server

USER nonroot:nonroot

WORKDIR /app

EXPOSE 3001

ENTRYPOINT ["/app/server"]
