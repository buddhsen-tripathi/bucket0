---
name: s3-api
description: Access Bucket0 storage with any S3-compatible client using AWS Signature Version 4 against https://s3.bucket0.com.
---

# Bucket0 S3-Compatible API

Use AWS CLI, SDKs, rclone, Cyberduck, or WinSCP against Bucket0's S3 gateway.

## Setup

1. Sign in at https://bucket0.com/dashboard
2. Open **S3 API** and create access keys
3. Configure endpoint `https://s3.bucket0.com`
4. Sign requests with AWS Signature Version 4

## Example (AWS CLI)

```bash
aws s3 ls s3://your-bucket/ \
  --endpoint-url https://s3.bucket0.com
```

## References

- Docs: https://bucket0.com/docs
- OpenAPI: https://bucket0.com/openapi/s3-api.json
- Auth: https://bucket0.com/auth.md
