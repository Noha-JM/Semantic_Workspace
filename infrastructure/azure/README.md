# Azure AKS deployment plan

This AKS layout targets a short-lived Azure for Students development cluster in
Central India. It uses the Free AKS control-plane tier, one `Standard_D2s_v3`
system node, and a dedicated `Standard_D2_v3` worker pool that scales
automatically from zero to two nodes. The worker Deployment is placed only on
that worker pool; KEDA scales it from zero to four pods based on the Redis RQ
queue. Backend,
frontend, PostgreSQL, Redis, MinIO, and Neo4j run on the system pool.

## Credit and quota constraints

The subscription currently has quota for one 2-vCPU system node and up to two
2-vCPU worker nodes in Central India. The worker node pool is capped at two
nodes, and the worker Deployment is capped at four pods.

Microsoft's Retail Prices API currently lists the `Standard_D2s_v3` VM at
USD 0.105/hour in Central India, about USD 76.65 for 730 hours. This is the
system node alone; persistent disks, the public load balancer, and Azure
Container Registry add charges. An active worker node uses additional compute
at its own hourly rate. Azure for Students includes USD 100 in credit for the
12-month offer period; the subscription is disabled when that credit is
exhausted. This cluster is suitable for short development sessions, not
continuous year-round hosting. Stop the AKS cluster when you are not using it,
or delete the resource group after a demo. Stopping avoids compute charges but
retained disks and other resources may still incur charges.

## Images and credentials

AKS cannot use images that only exist in the local Docker daemon. Push the
backend and frontend images to a registry the cluster can pull from, and mirror
the MinIO image used by this project. Do not put credentials in this directory
or in a committed manifest. Create a new `srw-secrets` Secret in the AKS
namespace and supply the Azure registry pull permission through the AKS managed
identity.

The AKS database starts empty. It does not copy papers or vectors from the local
kind or Docker Compose databases.

## Create the cluster

The following commands create billable resources. Replace
`YOUR_UNIQUE_ACR_NAME` with an available lowercase registry name:

```sh
az group create --name srw-aks-rg --location centralindia
az acr create \
  --resource-group srw-aks-rg \
  --name YOUR_UNIQUE_ACR_NAME \
  --sku Basic
az aks create \
  --resource-group srw-aks-rg \
  --name srw-aks-central \
  --location centralindia \
  --tier free \
  --kubernetes-version 1.36.4 \
  --node-count 1 \
  --node-vm-size Standard_D2s_v3 \
  --nodepool-name system \
  --enable-managed-identity \
  --attach-acr YOUR_UNIQUE_ACR_NAME \
  --generate-ssh-keys
az aks get-credentials --resource-group srw-aks-rg --name srw-aks-central
```

Build the app images in ACR so they target the AKS nodes' AMD64 architecture.
The old `minio/minio` image was removed from its public registries, so mirror
the last available Bitnami legacy build under a pinned tag. That image is no
longer maintained; it is suitable here only for this short-lived student demo.
For a longer-lived deployment, switch to a maintained S3-compatible service.

```sh
az acr build --registry YOUR_UNIQUE_ACR_NAME \
  --image semantic-workspace-backend:latest backend
az acr build --registry YOUR_UNIQUE_ACR_NAME \
  --image semantic-workspace-frontend:latest \
  --build-arg VITE_API_BASE_URL= frontend
az acr import --name YOUR_UNIQUE_ACR_NAME \
  --source docker.io/bitnamilegacy/minio:2025.7.23-debian-12-r5 \
  --image minio:2025.7.23-debian-12-r5
ACR_LOGIN_SERVER=$(az acr show --name YOUR_UNIQUE_ACR_NAME --query loginServer --output tsv)
```

Create the `srw` namespace and a fresh `srw-secrets` Secret before applying the
workload manifests. Use new passwords and do not commit the Secret. Install
KEDA and add the worker node pool below. The AKS overlay excludes the database
migration Job so it can be applied after PostgreSQL is ready.

## Worker node-pool settings

Create the system pool with one `Standard_D2s_v3` node. Add the user worker pool
with the following settings:

```sh
az aks nodepool add \
  --resource-group srw-aks-rg \
  --cluster-name srw-aks-central \
  --name worker \
  --mode User \
  --node-count 0 \
  --node-vm-size Standard_D2_v3 \
  --enable-cluster-autoscaler \
  --min-count 0 \
  --max-count 2 \
  --labels workload=worker \
  --node-taints workload=worker:NoSchedule
```

The AKS overlay applies the matching worker node selector and toleration, lets
KEDA create roughly one worker pod per queued paper (up to four), and exposes
the frontend through an Azure Load Balancer. Worker pods get a 1900-second
termination grace period so RQ can finish an active job before scale-down.
Substitute the registry paths in the rendered overlay before applying it:

```sh
ACR_LOGIN_SERVER=$(az acr show --name YOUR_UNIQUE_ACR_NAME --query loginServer --output tsv)
kubectl kustomize --load-restrictor LoadRestrictionsNone infrastructure/k8s/overlays/aks \
  | sed "s|semantic-workspace-backend:latest|$ACR_LOGIN_SERVER/semantic-workspace-backend:latest|g" \
  | sed "s|semantic-workspace-frontend:latest|$ACR_LOGIN_SERVER/semantic-workspace-frontend:latest|g" \
  | sed "s|minio/minio:latest|$ACR_LOGIN_SERVER/minio:2025.7.23-debian-12-r5|g" \
  | kubectl apply -f -
```

After the overlay creates PostgreSQL, wait for it, run the migration Job, then
apply the overlay again:

```sh
kubectl -n srw rollout status statefulset/postgres --timeout=10m
sed "s|semantic-workspace-backend:latest|$ACR_LOGIN_SERVER/semantic-workspace-backend:latest|g" \
  infrastructure/k8s/db-migrate.yaml | kubectl apply -f -
kubectl -n srw wait --for=condition=complete job/db-migrate --timeout=10m
```

## Node autoscaling behavior

When the queue is empty, KEDA can scale the worker Deployment to zero and the
AKS cluster autoscaler can remove idle worker nodes. When queued work appears,
KEDA requests up to four worker pods. Pending worker pods cause AKS to provision
up to two `Standard_D2_v3` worker nodes. RQ workers process one paper job each;
the longer termination grace period lets active work finish as workers scale
down. After the queue drains and cooldown elapses, worker pods and nodes can
scale back down. AKS documents this pending-pod node-pool autoscaling
behavior in its [cluster autoscaler guide](https://learn.microsoft.com/en-us/azure/aks/cluster-autoscaler).
