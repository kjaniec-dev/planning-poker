# Deployment Check Skill

## Purpose
Review and validate deployment configurations for Docker, Kubernetes, CI/CD pipelines, and production readiness. Ensure the application is properly configured for reliable, scalable, and secure deployments.

## Context
Planning Poker deployment infrastructure:
- **Containerization**: Docker with multi-stage builds
- **Orchestration**: Kubernetes with Helm charts
- **Deployment Modes**: Embedded vs External WebSocket server
- **Scaling**: Optional Redis for horizontal scaling
- **Base Images**: Distroless, Alpine Linux for security

## Tasks to Perform

### 1. Docker Configuration Review

**Dockerfile Analysis:**
- Multi-stage build optimization
- Layer caching efficiency
- Image size optimization
- Security hardening (distroless, non-root user)
- Build argument usage
- HEALTHCHECK directive

**Check file:**
- `/Dockerfile`

**Validation commands:**
```bash
# Build and check image size
docker build -t planning-poker:test .
docker images planning-poker:test

# Security scan
docker scan planning-poker:test
trivy image planning-poker:test

# Analyze layers
docker history planning-poker:test

# Check for vulnerabilities
grype planning-poker:test
```

**Best practices to verify:**
- [ ] Using specific base image versions (not `latest`)
- [ ] Minimal layer count
- [ ] No secrets in image layers
- [ ] Proper .dockerignore file
- [ ] Cache invalidation at right stages
- [ ] Security updates applied

### 2. Docker Compose Review

**Configuration validation:**
- Service dependencies correctly defined
- Environment variables properly set
- Volume mounts secure and minimal
- Network isolation appropriate
- Profile usage (embedded/external/redis)
- Health checks configured

**Check file:**
- `/docker-compose.yml`

**Validation commands:**
```bash
# Validate compose file
docker compose config

# Check embedded mode
docker compose --profile embedded up --build -d
docker compose ps
docker compose logs

# Check external mode
docker compose --profile external up --build -d

# Check with Redis
docker compose --profile redis up -d redis
REDIS_URL=redis://redis:6379 docker compose --profile external up --build
```

**Best practices to verify:**
- [ ] Resource limits defined (memory, CPU)
- [ ] Restart policies configured
- [ ] Logging driver configured
- [ ] Security options (no-new-privileges, read-only)
- [ ] Named volumes for persistence
- [ ] Environment variables from .env file

### 3. Kubernetes Configuration Review

**Helm Chart Analysis:**
- Deployment manifest correctness
- Service configuration (ClusterIP, LoadBalancer)
- ConfigMap and Secret management
- Resource requests and limits
- HPA (Horizontal Pod Autoscaler) configuration
- Ingress/HTTPRoute configuration
- ServiceAccount and RBAC

**Check directory:**
- `/chart/**/*`

**Validation commands:**
```bash
# Lint Helm chart
helm lint ./chart

# Dry run installation
helm install planning-poker ./chart --dry-run --debug

# Validate Kubernetes manifests
helm template planning-poker ./chart | kubectl apply --dry-run=client -f -

# Check for issues
kubeconform <(helm template ./chart)
```

**Best practices to verify:**
- [ ] Resource limits prevent OOMKill
- [ ] Liveness and readiness probes configured
- [ ] Pod disruption budgets for HA
- [ ] Anti-affinity rules for distribution
- [ ] Security context (runAsNonRoot, readOnlyRootFilesystem)
- [ ] Network policies for isolation
- [ ] Secrets not in plain text

### 4. CI/CD Pipeline Review

**Check for CI/CD files:**
```bash
ls -la .github/workflows/
ls -la .gitlab-ci.yml
ls -la .circleci/
ls -la Jenkinsfile
```

**Pipeline stages to validate:**
- [ ] Linting and formatting (Biome)
- [ ] Type checking (TypeScript)
- [ ] Unit tests (Jest, Go test)
- [ ] Integration tests
- [ ] Security scanning
- [ ] Build Docker images
- [ ] Push to registry
- [ ] Deploy to staging
- [ ] Deploy to production

**Best practices:**
- [ ] Pipeline runs on PR
- [ ] Test coverage reporting
- [ ] Automated dependency updates
- [ ] Semantic versioning
- [ ] Rollback capability
- [ ] Deployment approval gates

### 5. Production Readiness Checklist

**Observability:**
- [ ] Structured logging configured
- [ ] Log aggregation (e.g., ELK, Loki)
- [ ] Metrics collection (Prometheus)
- [ ] Distributed tracing (Jaeger, Zipkin)
- [ ] Alerting rules defined
- [ ] Dashboards created (Grafana)

**Reliability:**
- [ ] Health check endpoints (`/health`, `/ready`)
- [ ] Graceful shutdown implemented
- [ ] Circuit breakers for external dependencies
- [ ] Retry logic with exponential backoff
- [ ] Request timeouts configured
- [ ] Rate limiting implemented

**Scalability:**
- [ ] Stateless design (or Redis for state)
- [ ] Horizontal scaling tested
- [ ] Load balancing configured
- [ ] Connection pooling optimized
- [ ] Database connection limits
- [ ] Auto-scaling policies

**Security:**
- [ ] TLS/HTTPS enforced in production
- [ ] Secrets in secret management system
- [ ] Network policies restrict traffic
- [ ] Container images scanned
- [ ] Dependency vulnerabilities addressed
- [ ] Security headers configured

**Performance:**
- [ ] CDN configured for static assets
- [ ] Caching strategy implemented
- [ ] Database indexes optimized
- [ ] Connection pooling configured
- [ ] Compression enabled (gzip/brotli)
- [ ] Resource limits prevent noisy neighbors

### 6. Configuration Management

**Environment Variables:**
- [ ] All required env vars documented
- [ ] Sensible defaults provided
- [ ] Validation on startup
- [ ] No secrets in code
- [ ] Different configs for dev/staging/prod

**Check files:**
- `.env.example` or `.env.template`
- `next.config.ts`
- `servers/node/src/index.ts`
- `servers/golang/main.go`

### 7. Backup and Disaster Recovery

**Backup Strategy:**
- [ ] Data backup procedures defined
- [ ] Backup restoration tested
- [ ] RTO/RPO targets defined
- [ ] Disaster recovery plan documented

**High Availability:**
- [ ] Multi-zone deployment
- [ ] Database replication
- [ ] Redis failover (if used)
- [ ] Load balancer health checks

### 8. Monitoring and Alerts

**Metrics to monitor:**
- WebSocket connection count
- Message throughput
- Error rates
- Response times
- CPU/Memory usage
- Disk I/O

**Alerts to configure:**
- High error rate (>1%)
- Response time degradation (>500ms)
- Resource exhaustion (>80% memory)
- Service unavailability
- Certificate expiration

### 9. Documentation Review

**Required documentation:**
- [ ] Deployment guide
- [ ] Architecture diagram
- [ ] Runbook for common issues
- [ ] Incident response procedures
- [ ] Scaling guidelines
- [ ] Monitoring dashboard links

## Validation Commands

```bash
# Docker validation
docker compose config
docker build --target production .

# Kubernetes validation
helm lint ./chart
kubeval <(helm template ./chart)

# Security scanning
trivy config .
checkov -d .

# Performance testing
ab -n 1000 -c 100 http://localhost:3000/

# Load testing
artillery run load-test.yml
```

## Output Format

Provide a deployment readiness report with:

1. **Deployment Configuration Score**
   - Docker: ✓/✗ with score (0-100)
   - Kubernetes: ✓/✗ with score (0-100)
   - CI/CD: ✓/✗ with score (0-100)
   - Overall readiness: Ready / Needs Work / Blocked

2. **Critical Issues**
   - Security vulnerabilities in deployment
   - Missing required configurations
   - Incorrect resource limits
   - Blocking issues for production

3. **Configuration Improvements**
   - Optimization opportunities
   - Best practice violations
   - Suggested enhancements
   - Cost optimization tips

4. **Production Readiness Checklist**
   - Completed items ✓
   - Missing items ✗
   - Partially completed items ⚠
   - Priority ranking

5. **Deployment Recommendations**
   - Immediate actions required
   - Short-term improvements
   - Long-term enhancements
   - Cost vs benefit analysis

## Success Criteria
- All deployment configurations validated
- Production readiness score calculated
- Critical blockers identified
- Actionable recommendations provided
- Security best practices verified
- Scalability considerations addressed
