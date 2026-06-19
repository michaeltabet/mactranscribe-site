#!/bin/bash
# Regenerate k8s/site.yaml (embeds index.html into the ConfigMap), then commit+push.
# Argo auto-syncs the change to mactranscribe.michaeltabet.com. Run after editing index.html.
set -euo pipefail
cd "$(dirname "$0")"
{
cat <<'YAML'
# MacTranscribe public landing site — isolated namespace, static nginx, own ingress + LE cert.
apiVersion: v1
kind: Namespace
metadata:
  name: mactranscribe-site
  labels:
    pod-security.kubernetes.io/enforce: baseline
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: site-html
  namespace: mactranscribe-site
data:
  index.html: |
YAML
sed 's/^/    /' index.html
cat <<'YAML'
---
apiVersion: apps/v1
kind: Deployment
metadata: { name: site, namespace: mactranscribe-site }
spec:
  replicas: 1
  selector: { matchLabels: { app: site } }
  template:
    metadata: { labels: { app: site } }
    spec:
      containers:
        - name: nginx
          image: nginx:1.27-alpine
          ports: [{ containerPort: 80 }]
          volumeMounts:
            - { name: html, mountPath: /usr/share/nginx/html, readOnly: true }
      volumes:
        - name: html
          configMap: { name: site-html }
---
apiVersion: v1
kind: Service
metadata: { name: site, namespace: mactranscribe-site }
spec:
  selector: { app: site }
  ports: [{ port: 80, targetPort: 80 }]
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: site
  namespace: mactranscribe-site
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  tls:
    - hosts: [mactranscribe.michaeltabet.com]
      secretName: mactranscribe-site-tls
  rules:
    - host: mactranscribe.michaeltabet.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend: { service: { name: site, port: { number: 80 } } }
YAML
} > k8s/site.yaml
echo "regenerated k8s/site.yaml from index.html"
git add -A && git commit -m "site: update" && git push origin main && echo "pushed — Argo will auto-sync"
