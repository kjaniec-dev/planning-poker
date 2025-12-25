Perform a comprehensive security scan of the application:

1. Run `npm audit` to check for dependency vulnerabilities
2. Scan Docker images for security vulnerabilities (if Docker is available)
3. Check for hardcoded secrets or sensitive data in code
4. Review WebSocket security (origin validation, input validation)
5. Check security headers configuration in next.config.ts
6. Review container security settings in Dockerfile and docker-compose.yml

Provide a security report with severity levels and remediation recommendations.
