# Running Planning Poker on Minikube with Podman

This guide explains how to set up minikube using podman as the container runtime and deploy Planning Poker using Helm charts from GitHub Pages.

## Prerequisites

1. **Install Podman**:
   ```bash
   # macOS
   brew install podman

   # Linux (Ubuntu/Debian)
   sudo apt-get install podman

   # Linux (Fedora/RHEL)
   sudo dnf install podman
   ```

2. **Install Minikube**:
   ```bash
   # macOS
   brew install minikube

   # Linux
   curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64
   sudo install minikube-linux-amd64 /usr/local/bin/minikube
   ```

3. **Install Helm**:
   ```bash
   # macOS
   brew install helm

   # Linux
   curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
   ```

## Setup Minikube with Podman

### 1. Initialize Podman Machine (macOS only)

On macOS, podman runs in a VM. Initialize and start it:

```bash
# Initialize podman machine with sufficient resources
podman machine init --cpus 4 --memory 8192 --disk-size 50

# Start the podman machine
podman machine start

# Verify podman is running
podman info
```

### 2. Start Minikube with Podman Driver

```bash
# Start minikube using podman driver
minikube start --driver=podman --container-runtime=cri-o

# Or with custom resources
minikube start \
  --driver=podman \
  --container-runtime=cri-o \
  --cpus=4 \
  --memory=8192 \
  --disk-size=20g
```

**Note**: On first run, minikube will download the necessary images. This may take a few minutes.

### 3. Verify Minikube Setup

```bash
# Check minikube status
minikube status

# Check nodes
kubectl get nodes

# Enable metrics server (optional, for monitoring)
minikube addons enable metrics-server

# Enable ingress (if you need it)
minikube addons enable ingress
```

### Troubleshooting Podman + Minikube

**Issue: "podman not found" or driver issues**
```bash
# Ensure podman is in PATH
which podman

# Set podman as default driver
minikube config set driver podman
```

**Issue: "Permission denied" on Linux**
```bash
# Enable rootless podman
podman system migrate

# Or run with sudo (not recommended)
sudo minikube start --driver=podman --force
```

**Issue: Slow performance on macOS**
```bash
# Increase podman machine resources
podman machine stop
podman machine rm
podman machine init --cpus 6 --memory 12288 --disk-size 60
podman machine start
```

## Deploy Planning Poker from GitHub Pages

### 1. Add the Helm Repository

```bash
# Add the Planning Poker Helm chart repository
helm repo add planning-poker https://kjaniec-dev.github.io/planning-poker/charts

# Update repo to fetch latest charts
helm repo update
```

### 2. Search Available Charts

```bash
# List available versions
helm search repo planning-poker

# Show chart details
helm show chart planning-poker/planning-poker

# Show all values
helm show values planning-poker/planning-poker
```

### 3. Deploy Planning Poker

#### Option A: Embedded Mode (Single Container)

```bash
# Deploy with embedded WebSocket server
helm install my-planning-poker planning-poker/planning-poker \
  --set planningPoker.mode=embedded \
  --set service.type=NodePort
```

#### Option B: External Mode with Node.js WebSocket Server

```bash
# Deploy with external Node.js WebSocket server
helm install my-planning-poker planning-poker/planning-poker \
  --set planningPoker.mode=external \
  --set planningPoker.language=node \
  --set service.type=NodePort
```

#### Option C: External Mode with Go WebSocket Server

```bash
# Deploy with external Go WebSocket server
helm install my-planning-poker planning-poker/planning-poker \
  --set planningPoker.mode=external \
  --set planningPoker.language=golang \
  --set service.type=NodePort
```

#### Option D: Using Custom Values File

Create a `my-values.yaml`:

```yaml
planningPoker:
  mode: external
  language: node
  env:
    realtimeUrl: "http://planning-poker-websocket:3001"

service:
  type: NodePort

ingress:
  enabled: false

resources:
  limits:
    cpu: 1000m
    memory: 1Gi
  requests:
    cpu: 500m
    memory: 512Mi

replicaCount: 2
```

Then deploy:

```bash
helm install my-planning-poker planning-poker/planning-poker \
  -f my-values.yaml
```

### 4. Access the Application

#### Using NodePort Service

```bash
# Get the service URL
minikube service my-planning-poker --url

# Open in browser
minikube service my-planning-poker
```

#### Using Port Forwarding

```bash
# Forward port 3000 to localhost
kubectl port-forward service/my-planning-poker 3000:3000

# Open http://localhost:3000 in your browser
```

#### Using Minikube Tunnel (for LoadBalancer)

```bash
# In a separate terminal, run:
minikube tunnel

# Then deploy with LoadBalancer type:
helm upgrade my-planning-poker planning-poker/planning-poker \
  --set service.type=LoadBalancer \
  --reuse-values
```

### 5. Manage the Deployment

```bash
# List installed releases
helm list

# Get deployment status
kubectl get pods
kubectl get services
kubectl get deployments

# View logs
kubectl logs -l app.kubernetes.io/name=planning-poker -f

# Upgrade the release
helm upgrade my-planning-poker planning-poker/planning-poker \
  --set replicaCount=3 \
  --reuse-values

# Rollback to previous version
helm rollback my-planning-poker

# Uninstall
helm uninstall my-planning-poker
```

## Deploy from Local Chart (Development)

If you want to test local changes before pushing to GitHub Pages:

```bash
# From the project root directory
cd /Users/kjaniec-dev/dev/projects/planning-poker

# Install from local chart
helm install my-planning-poker ./chart \
  --set planningPoker.mode=embedded \
  --set service.type=NodePort

# Or upgrade existing installation
helm upgrade my-planning-poker ./chart \
  --reuse-values

# Dry-run to see what would be deployed
helm install my-planning-poker ./chart \
  --dry-run \
  --debug
```

## Using Custom Docker Images with Minikube

### Option 1: Use Minikube's Docker Daemon

```bash
# Point your shell to minikube's docker daemon
eval $(minikube docker-env)

# Build your image
docker build -t planning-poker:local .

# Deploy using local image
helm install my-planning-poker ./chart \
  --set image.repository=planning-poker \
  --set image.tag=local \
  --set image.pullPolicy=Never
```

### Option 2: Use Podman to Load Images

```bash
# Build with podman
podman build -t planning-poker:local .

# Save image to tar
podman save planning-poker:local -o planning-poker.tar

# Load into minikube
minikube image load planning-poker.tar

# Deploy
helm install my-planning-poker ./chart \
  --set image.repository=planning-poker \
  --set image.tag=local \
  --set image.pullPolicy=Never
```

## Monitoring and Debugging

### View Application Logs

```bash
# All pods
kubectl logs -l app.kubernetes.io/name=planning-poker -f

# Specific pod
kubectl logs <pod-name> -f

# Previous container logs (if pod crashed)
kubectl logs <pod-name> --previous
```

### Describe Resources

```bash
# Describe pod (useful for troubleshooting)
kubectl describe pod <pod-name>

# Describe service
kubectl describe service my-planning-poker

# Get events
kubectl get events --sort-by=.metadata.creationTimestamp
```

### Interactive Debugging

```bash
# Execute shell in running pod
kubectl exec -it <pod-name> -- /bin/sh

# Port forward for debugging
kubectl port-forward <pod-name> 3000:3000
```

### Enable Dashboard

```bash
# Enable minikube dashboard
minikube addons enable dashboard

# Open dashboard
minikube dashboard
```

## Cleanup

```bash
# Uninstall helm release
helm uninstall my-planning-poker

# Stop minikube
minikube stop

# Delete minikube cluster
minikube delete

# Stop podman machine (macOS)
podman machine stop
```

## Advanced: Scaling with Redis

To enable horizontal scaling with Redis:

### 1. Deploy Redis

```bash
# Add Bitnami repo
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update

# Install Redis
helm install redis bitnami/redis \
  --set auth.enabled=false \
  --set master.service.type=ClusterIP
```

### 2. Deploy Planning Poker with Redis

```bash
helm install my-planning-poker planning-poker/planning-poker \
  --set planningPoker.mode=external \
  --set planningPoker.env.redisUrl="redis://redis-master:6379" \
  --set replicaCount=3 \
  --set service.type=LoadBalancer
```

### 3. Verify Scaling

```bash
# Check pods
kubectl get pods -l app.kubernetes.io/name=planning-poker

# Scale up
kubectl scale deployment my-planning-poker --replicas=5

# Watch pods
kubectl get pods -w
```

## Useful Aliases

Add these to your `~/.bashrc` or `~/.zshrc`:

```bash
# Minikube aliases
alias mk='minikube'
alias mks='minikube status'
alias mkstart='minikube start --driver=podman'
alias mkstop='minikube stop'

# Kubectl aliases
alias k='kubectl'
alias kgp='kubectl get pods'
alias kgs='kubectl get services'
alias kgd='kubectl get deployments'
alias klogs='kubectl logs -f'

# Helm aliases
alias h='helm'
alias hls='helm list'
alias hup='helm upgrade'
alias hrb='helm rollback'
```

## References

- [Minikube Documentation](https://minikube.sigs.k8s.io/docs/)
- [Podman Documentation](https://podman.io/docs)
- [Helm Documentation](https://helm.sh/docs/)
- [Planning Poker GitHub](https://github.com/kjaniec-dev/planning-poker)