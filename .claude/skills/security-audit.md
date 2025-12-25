# Security Audit Skill

## Purpose
Perform comprehensive security audits for the Planning Poker application, covering WebSocket protocol security, container hardening, dependency vulnerabilities, and authentication/authorization.

## Context
This is a real-time Planning Poker application with:
- WebSocket-based communication (Node.js and Golang implementations)
- Docker containerized deployment
- Kubernetes orchestration
- Next.js frontend with React 19
- Redis for optional horizontal scaling

## Tasks to Perform

### 1. WebSocket Security Audit
- **Origin Validation**: Check that WebSocket connections validate origin headers
- **Message Validation**: Ensure all incoming messages are properly validated and sanitized
- **Rate Limiting**: Verify protection against WebSocket flooding/DoS attacks
- **Authentication**: Check if room access is properly controlled
- **Protocol Security**: Review the WebSocket protocol for injection vulnerabilities

**Check these files:**
- `/servers/node/src/index.ts` - Node.js WebSocket server
- `/servers/golang/main.go` - Golang WebSocket server
- `/src/lib/realtime/wsClient.ts` - Client-side WebSocket implementation

### 2. Container Security Review
- **Base Images**: Verify use of distroless or minimal base images
- **Security Capabilities**: Check that containers drop unnecessary Linux capabilities
- **Read-only Filesystem**: Ensure containers use read-only filesystems where possible
- **Non-root User**: Verify containers don't run as root
- **Security Headers**: Check CSP, HSTS, X-Frame-Options headers

**Check these files:**
- `/Dockerfile` - Multi-stage Docker builds
- `/docker-compose.yml` - Container configurations
- `/next.config.ts` - Security headers configuration
- `/chart/**/*` - Kubernetes security policies

### 3. Dependency Vulnerability Scan
- Run `npm audit` for Node.js dependencies
- Check for outdated packages with known CVEs
- Review `go.mod` for Golang dependency vulnerabilities
- Suggest automated dependency update workflows

**Commands to run:**
```bash
npm audit
npm audit --audit-level=moderate
cd servers/node && npm audit
cd servers/golang && go list -json -m all | nancy sleuth
```

### 4. Code Security Analysis
- **Input Validation**: Check all user inputs are validated
- **XSS Prevention**: Verify React escaping and sanitization
- **Injection Attacks**: Check for command injection, SQL injection (if DB is added)
- **Secrets Management**: Ensure no hardcoded secrets or API keys
- **Error Messages**: Verify no sensitive information leaks in errors

**Check these files:**
- All TypeScript files in `/src/**/*.tsx` and `/src/**/*.ts`
- Server implementations in `/servers/**/*`
- Environment variable usage

### 5. HTTPS/WSS Configuration
- Verify production uses HTTPS/WSS instead of HTTP/WS
- Check certificate validation
- Review TLS configuration

### 6. Session Management
- Review how participants are tracked (currently no auth, but check session handling)
- Verify room isolation (users can't access other rooms' data)
- Check for session fixation vulnerabilities

## Output Format

Provide a security report with:

1. **Executive Summary**: High-level findings and risk rating
2. **Detailed Findings**: Each vulnerability with:
   - Severity (Critical/High/Medium/Low)
   - Description
   - Affected files/components
   - Proof of concept (if applicable)
   - Remediation steps
3. **Compliance Check**: Security best practices compliance
4. **Recommendations**: Prioritized action items

## Success Criteria
- All critical and high-severity vulnerabilities identified
- Actionable remediation steps provided
- Security improvements suggested for defense-in-depth
- Report is clear and suitable for both developers and stakeholders
