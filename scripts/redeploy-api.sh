#!/usr/bin/env bash
# Print SSM commands to refresh the jock-api container after a new CDK image push.
# Usage:
#   INSTANCE_ID=i-xxx IMAGE_URI=... ./scripts/redeploy-api.sh
set -euo pipefail

INSTANCE_ID="${INSTANCE_ID:?Set INSTANCE_ID}"
IMAGE_URI="${IMAGE_URI:?Set IMAGE_URI (stack output ApiImageUri)}"
REGION="${AWS_REGION:-us-east-1}"
ACCOUNT="$(echo "$IMAGE_URI" | cut -d. -f1)"

echo "Connect:  aws ssm start-session --target $INSTANCE_ID --region $REGION"
echo ""
echo "Then run on the instance:"
cat <<EOF
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT.dkr.ecr.$REGION.amazonaws.com
docker pull $IMAGE_URI
JWT_SECRET=\$(aws secretsmanager get-secret-value --region $REGION --secret-id jock-exchange/jwt-secret --query SecretString --output text)
ADMIN_TOKEN=\$(aws ssm get-parameter --region $REGION --name /jock-exchange/admin-token --query Parameter.Value --output text)
docker rm -f jock-api || true
docker run -d --name jock-api --restart unless-stopped \\
  -p 127.0.0.1:4000:4000 \\
  -v /var/lib/jock-exchange/data:/app/data \\
  -e "JWT_SECRET=\$JWT_SECRET" \\
  -e "ADMIN_TOKEN=\$ADMIN_TOKEN" \\
  -e PORT=4000 -e BOTS_ENABLED=1 \\
  $IMAGE_URI
curl -sf http://127.0.0.1:4000/health && docker ps --filter name=jock-api
EOF
