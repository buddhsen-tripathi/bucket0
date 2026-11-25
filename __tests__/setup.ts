// Set encryption key for crypto tests (32 hex chars = 128-bit AES key)
process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";

// Set credential encryption key for S3 API tests (64 hex chars = 256-bit AES key)
process.env.CREDENTIAL_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
