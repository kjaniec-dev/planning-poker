# Planning Poker Helm Chart

A Helm chart for deploying Planning Poker - a real-time collaborative estimation tool for agile teams.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.2.0+
- PV provisioner support in the underlying infrastructure (optional, for persistent storage)

## Installing the Chart

### Add the Helm Repository

```bash
# If published to a Helm repository (GitHub Pages)
helm repo add planning-poker https://kjaniec-dev.github.io/planning-poker
helm repo update
```

### Install from Local Chart

```bash
# From the project root
helm install my-planning-poker ./chart

# Or from the chart directory
cd chart
helm install my-planning-poker .
```

### Install with Custom Values

```bash
helm install my-planning-poker ./chart \
  --set image.repository=your-registry/planning-poker \
  --set image.tag=1.0.0 \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=planning-poker.example.com
```

### Install with Values File

```bash
helm install my-planning-poker ./chart -f my-values.yaml
```

## Uninstalling the Chart

```bash
helm uninstall my-planning-poker
```

## Configuration

The following table lists the configurable parameters of the Planning Poker chart and their default values.

### General Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `replicaCount` | Number of replicas | `1` |
| `image.repository` | Image repository | `your-registry/planning-poker` |
| `image.pullPolicy` | Image pull policy | `IfNotPresent` |
| `image.tag` | Image tag | `""` (uses chart appVersion) |
| `imagePullSecrets` | Image pull secrets | `[]` |
| `nameOverride` | Override chart name | `""` |
| `fullnameOverride` | Override full name | `""` |

### Planning Poker Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `planningPoker.mode` | Deployment mode: `embedded` or `external` | `external` |
| `planningPoker.language` | WebSocket server language: `node` or `golang` | `node` |
| `planningPoker.env.realtimeUrl` | WebSocket server URL (for external mode) | `""` |
| `planningPoker.env.redisUrl` | Redis connection URL (optional, for scaling) | `""` |
| `planningPoker.env.allowedOrigins` | CORS allowed origins (comma-separated) | `""` |
| `planningPoker.env.extra` | Additional environment variables | `{}` |

### Service Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `service.type` | Kubernetes service type | `ClusterIP` |
| `service.port` | Service port | `3000` |
| `service.targetPort` | Container target port | `3000` |

### Ingress Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `ingress.enabled` | Enable ingress | `false` |
| `ingress.className` | Ingress class name | `""` |
| `ingress.annotations` | Ingress annotations | `{}` |
| `ingress.hosts` | Ingress hosts configuration | See values.yaml |
| `ingress.tls` | Ingress TLS configuration | `[]` |

### Resource Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `resources.limits.cpu` | CPU limit | `500m` |
| `resources.limits.memory` | Memory limit | `512Mi` |
| `resources.requests.cpu` | CPU request | `250m` |
| `resources.requests.memory` | Memory request | `256Mi` |

### Security Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `podSecurityContext.fsGroup` | Pod fsGroup | `2000` |
| `podSecurityContext.runAsNonRoot` | Run as non-root | `true` |
| `podSecurityContext.runAsUser` | Run as user | `1000` |
| `securityContext.readOnlyRootFilesystem` | Read-only root filesystem | `true` |
| `securityContext.runAsNonRoot` | Run as non-root | `true` |
| `securityContext.runAsUser` | Run as user | `1000` |

### Autoscaling Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `autoscaling.enabled` | Enable horizontal pod autoscaling | `false` |
| `autoscaling.minReplicas` | Minimum number of replicas | `1` |
| `autoscaling.maxReplicas` | Maximum number of replicas | `10` |
| `autoscaling.targetCPUUtilizationPercentage` | Target CPU utilization | `80` |
| `autoscaling.targetMemoryUtilizationPercentage` | Target memory utilization | `80` |

## Deployment Modes

### Embedded Mode

WebSocket server runs inside the Next.js application (single container deployment).

```yaml
planningPoker:
  mode: embedded
  env:
    redisUrl: "redis://redis-master:6379"  # Optional for scaling
```

**Pros:**
- Simpler deployment
- Single container
- Lower resource usage

**Cons:**
- Cannot scale WebSocket server independently
- All connections handled by Next.js

### External Mode (Recommended)

WebSocket server runs as a separate deployment (requires deploying the WebSocket server separately).

```yaml
planningPoker:
  mode: external
  language: node  # or golang
  env:
    realtimeUrl: "http://planning-poker-websocket:3001"
    redisUrl: "redis://redis-master:6379"  # Optional for scaling
```

**Pros:**
- Can scale frontend and WebSocket server independently
- Better resource allocation
- Choose between Node.js or Go implementation

**Cons:**
- Requires separate deployment for WebSocket server
- More complex setup

## Example Configurations

### Basic Installation

```yaml
# values-basic.yaml
image:
  repository: your-registry/planning-poker
  tag: "1.0.0"

planningPoker:
  mode: embedded

service:
  type: ClusterIP
```

```bash
helm install planning-poker ./chart -f values-basic.yaml
```

### Production with Ingress and TLS

```yaml
# values-production.yaml
replicaCount: 2

image:
  repository: your-registry/planning-poker
  tag: "1.0.0"

planningPoker:
  mode: external
  language: node
  env:
    realtimeUrl: "https://planning-poker-ws.example.com"
    redisUrl: "redis://redis-master:6379"
    allowedOrigins: "https://planning-poker.example.com"

ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/websocket-services: planning-poker
  hosts:
    - host: planning-poker.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: planning-poker-tls
      hosts:
        - planning-poker.example.com

resources:
  limits:
    cpu: 1000m
    memory: 1Gi
  requests:
    cpu: 500m
    memory: 512Mi

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
```

```bash
helm install planning-poker ./chart -f values-production.yaml
```

### External Mode with Redis for Horizontal Scaling

```yaml
# values-scaled.yaml
replicaCount: 3

image:
  repository: your-registry/planning-poker
  tag: "1.0.0"

planningPoker:
  mode: external
  language: golang  # Go for better performance
  env:
    realtimeUrl: "http://planning-poker-websocket:3001"
    redisUrl: "redis://redis-master:6379"

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 20
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80
```

**Note:** You'll also need to deploy:
1. Redis for state synchronization
2. WebSocket server deployment (separate Helm chart or deployment)

## Upgrading the Chart

```bash
helm upgrade my-planning-poker ./chart -f my-values.yaml
```

## Testing the Deployment

```bash
# Run Helm tests
helm test my-planning-poker

# Check pod status
kubectl get pods -l app.kubernetes.io/name=planning-poker

# Check logs
kubectl logs -l app.kubernetes.io/name=planning-poker

# Port forward to test locally
kubectl port-forward svc/my-planning-poker 3000:3000
# Then open http://localhost:3000
```

## Troubleshooting

### Pods not starting

```bash
# Check pod events
kubectl describe pod -l app.kubernetes.io/name=planning-poker

# Check logs
kubectl logs -l app.kubernetes.io/name=planning-poker
```

### Connection issues with external WebSocket server

1. Verify WebSocket server is running:
   ```bash
   kubectl get pods -l app=planning-poker-websocket
   ```

2. Check service connectivity:
   ```bash
   kubectl get svc planning-poker-websocket
   ```

3. Verify `realtimeUrl` in values matches the service name

### Redis connection issues

1. Verify Redis is accessible:
   ```bash
   kubectl get svc redis-master
   ```

2. Test connection from pod:
   ```bash
   kubectl exec -it <pod-name> -- sh
   # Inside pod
   nc -zv redis-master 6379
   ```

## Additional Resources

- [Planning Poker Documentation](https://github.com/kjaniec-dev/planning-poker)
- [Helm Documentation](https://helm.sh/docs/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)

## License

This chart is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.
