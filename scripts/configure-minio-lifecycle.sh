#!/bin/bash
# MinIO Lifecycle Policy Configuration Script
# Configures bucket lifecycle policies for storage optimization

set -e

# Configuration from environment or defaults
MINIO_ENDPOINT="${MINIO_ENDPOINT:-localhost:9000}"
MINIO_ACCESS_KEY="${MINIO_ROOT_USER:-admin}"
MINIO_SECRET_KEY="${MINIO_ROOT_PASSWORD:-minio_admin_password}"
BUCKET_NAME="${MINIO_BUCKET_NAME:-homelab-uploads}"
TEMP_RETENTION_DAYS="${MINIO_TEMP_RETENTION_DAYS:-90}"
LOG_RETENTION_DAYS="${MINIO_LOG_RETENTION_DAYS:-30}"
INCOMPLETE_UPLOAD_DAYS="${MINIO_INCOMPLETE_UPLOAD_DAYS:-7}"

echo "========================================"
echo "MinIO Lifecycle Policy Configuration"
echo "========================================"
echo "Endpoint: $MINIO_ENDPOINT"
echo "Bucket: $BUCKET_NAME"
echo "========================================"

# Check if mc (MinIO Client) is installed
if ! command -v mc &> /dev/null; then
    echo "ERROR: MinIO Client (mc) is not installed"
    echo "Install with: wget https://dl.min.io/client/mc/release/linux-amd64/mc && chmod +x mc && sudo mv mc /usr/local/bin/"
    exit 1
fi

# Configure MinIO alias
echo "Configuring MinIO alias..."
mc alias set homelab-minio http://$MINIO_ENDPOINT $MINIO_ACCESS_KEY $MINIO_SECRET_KEY

# Check if bucket exists, create if not
if ! mc ls homelab-minio/$BUCKET_NAME &> /dev/null; then
    echo "Creating bucket: $BUCKET_NAME"
    mc mb homelab-minio/$BUCKET_NAME
else
    echo "Bucket exists: $BUCKET_NAME"
fi

# Create lifecycle policy JSON
POLICY_FILE="/tmp/minio-lifecycle-policy.json"
cat > $POLICY_FILE << EOF
{
  "Rules": [
    {
      "ID": "DeleteTempFiles",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "temp/"
      },
      "Expiration": {
        "Days": $TEMP_RETENTION_DAYS
      }
    },
    {
      "ID": "TransitionLogFiles",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "logs/"
      },
      "Expiration": {
        "Days": $LOG_RETENTION_DAYS
      }
    },
    {
      "ID": "CleanupIncompleteUploads",
      "Status": "Enabled",
      "AbortIncompleteMultipartUpload": {
        "DaysAfterInitiation": $INCOMPLETE_UPLOAD_DAYS
      }
    }
  ]
}
EOF

echo ""
echo "Lifecycle Policy:"
cat $POLICY_FILE
echo ""

# Apply lifecycle policy
echo "Applying lifecycle policy to bucket: $BUCKET_NAME"
mc ilm import homelab-minio/$BUCKET_NAME < $POLICY_FILE

# Verify policy was applied
echo ""
echo "Verifying lifecycle policy..."
mc ilm ls homelab-minio/$BUCKET_NAME

# Cleanup
rm -f $POLICY_FILE

echo ""
echo "========================================"
echo "✓ Lifecycle policies configured successfully"
echo "========================================"
echo ""
echo "Policy Summary:"
echo "  - temp/ files deleted after $TEMP_RETENTION_DAYS days"
echo "  - logs/ files deleted after $LOG_RETENTION_DAYS days"
echo "  - Incomplete uploads deleted after $INCOMPLETE_UPLOAD_DAYS days"
echo ""
echo "To view current policies:"
echo "  mc ilm ls homelab-minio/$BUCKET_NAME"
echo ""
echo "To remove all policies:"
echo "  mc ilm rm homelab-minio/$BUCKET_NAME --all"
echo ""
