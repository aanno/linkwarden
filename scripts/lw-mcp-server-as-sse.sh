pnpm dlx supergateway \
    --stdio "/home/tpasch/dev/go/bin/linkwarden-mcp-server stdio --read-only" \
    --port 3034 --baseUrl http://localhost:3034 \
    --ssePath /sse --messagePath /message
