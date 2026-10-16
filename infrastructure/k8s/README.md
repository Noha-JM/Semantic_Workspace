# Kubernetes deployment

This deployment keeps PostgreSQL, Redis, MinIO, and Neo4j at one replica with
persistent volume claims. The API and frontend start with two replicas.
CPU-based HPAs scale both stateless services, and KEDA scales ingestion workers
from the RQ Redis queue. Metrics Server provides CPU metrics; KEDA provides
queue-depth scaling.

## Build and publish images

Build the backend image and publish it to a registry reachable from the cluster:

```sh
docker build -t REGISTRY/semantic-workspace-backend:TAG backend
docker push REGISTRY/semantic-workspace-backend:TAG
```

The Kubernetes frontend uses same-origin API requests, proxied by nginx to the
backend Service. Build it with an empty API base:

```sh
docker build --build-arg VITE_API_BASE_URL= \
  -t REGISTRY/semantic-workspace-frontend:TAG frontend
docker push REGISTRY/semantic-workspace-frontend:TAG
```

Replace `semantic-workspace-backend:latest` and
`semantic-workspace-frontend:latest` in `app.yaml` and `db-migrate.yaml` with
the published image names. For kind/minikube, load the built images into the
cluster instead of pushing them.

## Configure and deploy

Edit `configmap.yaml` for the public hostname, then create credentials outside
source control. Use strong unique passwords and retain them for upgrades:

```sh
kubectl apply -f infrastructure/k8s/namespace.yaml
kubectl -n srw create secret generic srw-secrets \
  --from-literal=POSTGRES_PASSWORD='change-this' \
  --from-literal=MINIO_ACCESS_KEY='change-this' \
  --from-literal=MINIO_SECRET_KEY='change-this' \
  --from-literal=NEO4J_PASSWORD='change-this' \
  --from-literal=NEO4J_AUTH='neo4j/change-this' \
  --from-literal=OPENALEX_API_KEY='' \
  --from-literal=CORE_API_KEY='' \
  --from-literal=OPENAI_API_KEY=''
kubectl apply -f infrastructure/k8s/configmap.yaml
kubectl apply -f infrastructure/k8s/postgres.yaml \
  -f infrastructure/k8s/redis.yaml \
  -f infrastructure/k8s/minio.yaml \
  -f infrastructure/k8s/neo4j.yaml
kubectl -n srw rollout status statefulset/postgres
kubectl -n srw apply -f infrastructure/k8s/db-migrate.yaml
kubectl -n srw wait --for=condition=complete job/db-migrate --timeout=10m
kubectl apply -f infrastructure/k8s/app.yaml
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/download/v0.9.0/components.yaml
# kind uses a local kubelet certificate; this TLS bypass is for local development only.
kubectl -n kube-system patch deployment metrics-server --type=json \
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
kubectl apply -f infrastructure/k8s/autoscaling.yaml
# Apply ingress.yaml only after an ingress controller has been installed.
kubectl apply --server-side -f https://github.com/kedacore/keda/releases/download/v2.21.0/keda-2.21.0.yaml
kubectl -n keda rollout status deployment/keda-operator --timeout=3m
kubectl apply -f infrastructure/k8s/worker-keda.yaml
```

Set the password suffix in `NEO4J_AUTH` to the same value as
`NEO4J_PASSWORD`.

The namespace manifest must be applied before creating its Secret. Storage
claims use the cluster's default StorageClass. `research.example.com` is a
placeholder: configure DNS and an Ingress controller, then set that hostname in
both `configmap.yaml` (`CORS_ORIGINS`) and `ingress.yaml`. Add TLS through your
cluster's certificate manager or ingress provider before public use.

For a release that changes the database schema, update images, delete the old
completed migration Job, apply `db-migrate.yaml`, wait for completion, then
roll out `app.yaml` with the new image tag.

## Elasticity

The backend HPA scales from 2 to 8 replicas and the frontend HPA from 2 to 6
replicas at 70% average CPU; both require Kubernetes Metrics Server. The kind
TLS bypass above is for local development only. KEDA scales the worker between
1 and 8 replicas when `rq:queue:paper_tasks` grows beyond the configured
target (`listLength: 5`). On AKS, use the worker-pool overlay in
`infrastructure/k8s/overlays/aks` to allow the worker to scale to zero and
schedule only onto its autoscaling node pool. See `infrastructure/azure/README.md`.
Observe the autoscalers with:

```sh
kubectl get hpa -n srw -w
kubectl get scaledobject,hpa -n srw
kubectl get pods -n srw -o wide -w
```

These autoscalers increase pod replicas. They do not create Kubernetes nodes.
The current `kind` cluster has one node, so additional worker/API/frontend pods
are scheduled there and limited by that node's CPU and memory. To add nodes
automatically when pods cannot be scheduled, use a managed cloud Kubernetes
cluster and configure its node pool autoscaler. Stateful services deliberately
do not autoscale horizontally: PostgreSQL, Redis, MinIO, and Neo4j require
their own clustering/replication configuration before multiple replicas can
safely share state. Use managed PostgreSQL or object storage for production
availability and backups.

## Availability and disaster recovery

The AKS overlay keeps two backend and two frontend replicas, spreads them
across nodes when possible, uses zero-unavailable rolling updates, and applies
PodDisruptionBudgets. Backend readiness checks PostgreSQL and Redis; liveness
only checks that the process is responsive. This keeps traffic away from a
backend that cannot serve data and avoids restarting it just because a
dependency is briefly unavailable.

PostgreSQL, Redis, MinIO, and Neo4j are still single replicas. Their PVCs keep
data across pod restarts and node replacement, while their disruption budgets
block voluntary eviction of the only copy. These controls do not make a
single-node stateful service highly available: a node or disk failure can
interrupt it until Kubernetes reattaches the volume. The app's current target
is a 24-hour recovery-point objective (daily backups) and a recovery time of
roughly one hour, depending on cluster and disk recovery.

The scheduled backup job writes a compressed PostgreSQL dump and every MinIO
paper object to Azure Blob Storage daily, keeping seven days. Neo4j is treated
as a derived index and should be rebuilt from PostgreSQL after restoration.
Redis queue contents are transient; retry any papers left pending after
recovery. The backup job is intentionally suspended until you provision an
Azure Storage account and install its secret.

Provision the backup container in the existing resource group. Storage and
transactions are billable; use a globally unique account name and enable the
job only if the remaining Azure for Students credit covers that usage:

```sh
az storage account create \
  --resource-group srw-aks-rg \
  --name YOUR_UNIQUE_LOWERCASE_NAME \
  --location centralindia \
  --sku Standard_LRS \
  --kind StorageV2 \
  --min-tls-version TLS1_2 \
  --https-only true \
  --allow-blob-public-access false
az storage container create \
  --account-name YOUR_UNIQUE_LOWERCASE_NAME \
  --name srw-backups \
  --auth-mode login
```

Create the Kubernetes Secret without printing the connection string, then
build/push the backup image and enable the CronJob:

```sh
BACKUP_CONNECTION_STRING=$(az storage account show-connection-string \
  --resource-group srw-aks-rg --name YOUR_UNIQUE_LOWERCASE_NAME \
  --query connectionString -o tsv)
kubectl -n srw create secret generic srw-backup \
  --from-literal=AZURE_STORAGE_CONNECTION_STRING="$BACKUP_CONNECTION_STRING" \
  --dry-run=client -o yaml | kubectl apply -f -
unset BACKUP_CONNECTION_STRING
docker buildx build --platform linux/amd64 --push \
  -t srwresearch20261015.azurecr.io/semantic-workspace-backup:dr-20261016 \
  -f infrastructure/k8s/backup/Dockerfile infrastructure/k8s/backup
kubectl -n srw patch cronjob workspace-backup --type=merge \
  -p '{"spec":{"suspend":false}}'
```

Check backups and restore by listing snapshots in Blob Storage. To restore,
stop backend and worker writes first, download the chosen `postgres.dump`, and
restore into PostgreSQL with `pg_restore --clean --if-exists`; then restore
MinIO objects from the matching `minio/` prefix. Rebuild the graph by syncing
each paper through `POST /graph/papers/{paper_id}/sync`. Requeue papers left
pending after checking their ingestion status. Keep the previous dump until
the restored database and paper files have been verified.

Review the rendered AKS overlay before applying it:

```sh
kubectl kustomize --load-restrictor LoadRestrictionsNone infrastructure/k8s/overlays/aks
```

After review, apply it using the registry substitutions documented in
`infrastructure/azure/README.md`. Verify with `kubectl get pdb,hpa -n srw` and
`kubectl get pods -n srw -o wide`.
