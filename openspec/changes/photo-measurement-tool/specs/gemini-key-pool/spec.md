## ADDED Requirements

### Requirement: Multi-source key loading
The system SHALL load API keys from environment variable GEMINI_API_KEYS (comma-separated) and from the SQLite settings table (key="gemini_api_keys"). Keys SHALL be deduplicated and merged.

#### Scenario: Load keys from ENV and DB
- **WHEN** ENV has "keyA,keyB" and DB has "keyB,keyC"
- **THEN** the pool contains [keyA, keyB, keyC] (deduplicated)

### Requirement: Round-robin rotation
The system SHALL rotate through available API keys using round-robin. Each call to getGeminiApiKey() SHALL return the next key in sequence.

#### Scenario: Sequential key rotation
- **WHEN** pool has [keyA, keyB, keyC] and getGeminiApiKey() is called 4 times
- **THEN** keys returned are keyA, keyB, keyC, keyA (wraps around)

### Requirement: 429 failover
The system SHALL provide getGeminiApiKeyExcluding(failedKey) that returns a different key from the pool, excluding the specified failed key.

#### Scenario: Failover on rate limit
- **WHEN** a request with keyA returns HTTP 429 and getGeminiApiKeyExcluding(keyA) is called
- **THEN** a different key (keyB or keyC) is returned

### Requirement: Usage tracking
The system SHALL track each API call in the api_key_usage SQLite table with: key suffix (last 4 chars), model, call_type, prompt_tokens, completion_tokens, total_tokens, and timestamp.

#### Scenario: Track API usage
- **WHEN** a Gemini API call completes with 100 prompt tokens and 50 completion tokens
- **THEN** a row is inserted into api_key_usage with those token counts and the key's last 4 characters

### Requirement: Key management CRUD
The system SHALL provide addApiKey(key), removeApiKey(suffix), and getKeyList() functions. getKeyList() SHALL return keys with aggregated usage stats.

#### Scenario: Add and list keys
- **WHEN** addApiKey("AIzaSy...abc") is called, then getKeyList() is called
- **THEN** the new key appears in the list with usage stats (calls today, total tokens)

### Requirement: Cache with TTL
The system SHALL cache loaded keys for 60 seconds. invalidateKeyCache() SHALL force a fresh load on next access.

#### Scenario: Cache invalidation
- **WHEN** a new key is added via addApiKey() and invalidateKeyCache() is called
- **THEN** the next getGeminiApiKey() call includes the newly added key
