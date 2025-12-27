Help set up the development environment:

1. Verify Node.js version (should be v24+ based on .nvmrc)
2. Verify Go version (should be 1.24+ based on servers/golang/go.mod)
3. Check if Docker and Docker Compose are installed
4. Install all npm dependencies
5. Explain the different development modes:
   - Embedded mode: `npm run dev` (WebSocket in Next.js)
   - External Node mode: `npm run dev:external` (separate Node WebSocket server)
   - External Go mode: `npm run dev:external:go` (separate Golang WebSocket server)
6. Provide next steps for getting started

Guide the developer through the initial setup process.
