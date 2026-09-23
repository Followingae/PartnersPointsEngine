---
title: Authentication
description: Every request is signed with HMAC-SHA256. There are no bearer tokens and no login call.
---

## Credentials

You are issued two values per register:

| Value | Example | Handling |
|---|---|---|
| Publishable key id | `pk_9dK2mQ7xR4vN8bTz` | Sent in the clear on every request. |
| Signing secret | `sk_Lp3wQ8nH2vX…` | Never transmitted. Store it where your card keys live. |

Each key is scoped to one brand and one register. Everything you call is implicitly scoped the same way.

## The header

```http
Authorization: Loyalty-HMAC publishableKeyId=<id>,ts=<unix-seconds>,nonce=<unique>,sig=<hex>
```

No spaces after the commas. `ts` is Unix time in **seconds**. `nonce` is any value unique to this request; a UUID is fine.

## The string to sign

Five fields joined by a newline (`\n`), in this exact order:

```text
<METHOD>\n<PATH>\n<TS>\n<NONCE>\n<SHA256-HEX-OF-BODY>
```

- **METHOD**: uppercase, `GET` or `POST`.
- **PATH**: the path **including** the `/v1` prefix and **excluding** any query string. For `https://api.partnerspoints.ae/v1/terminal/quotes?x=1`, sign `/v1/terminal/quotes`.
- **TS**, **NONCE**: byte-identical to what you put in the header.
- **Body hash**: lowercase hex SHA-256 of the **exact bytes you send**. For a request with no body, hash the empty string, which is always `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

`sig` is the lowercase hex HMAC-SHA256 of that string, keyed with your signing secret.

> **The body must be hashed byte-for-byte as transmitted.** Serialize your JSON once, hash that string, and send that same string. Re-serializing between hashing and sending, which some HTTP clients do, changes key order or whitespace and the signature will not verify.
>
> **Query strings are not signed.** Do not put anything security-relevant in one.

## Reference implementations

```javascript
const crypto = require('node:crypto');

function sign({ method, path, body, keyId, secret }) {
  const raw = body ? JSON.stringify(body) : '';
  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID();
  const bodyHash = crypto.createHash('sha256').update(raw).digest('hex');

  const canonical = [method.toUpperCase(), path, ts, nonce, bodyHash].join('\n');
  const sig = crypto.createHmac('sha256', secret).update(canonical).digest('hex');

  return {
    headers: {
      'Content-Type': 'application/json',
      Authorization:
        `Loyalty-HMAC publishableKeyId=${keyId},ts=${ts},nonce=${nonce},sig=${sig}`,
    },
    // Send this exact string. Do not re-serialize.
    body: raw,
  };
}
```

```python
import hashlib, hmac, json, time, uuid

def sign(method, path, body, key_id, secret):
    raw = json.dumps(body, separators=(",", ":")) if body is not None else ""
    ts = str(int(time.time()))
    nonce = str(uuid.uuid4())
    body_hash = hashlib.sha256(raw.encode()).hexdigest()

    canonical = "\n".join([method.upper(), path, ts, nonce, body_hash])
    sig = hmac.new(secret.encode(), canonical.encode(), hashlib.sha256).hexdigest()

    return {
        "headers": {
            "Content-Type": "application/json",
            "Authorization":
                f"Loyalty-HMAC publishableKeyId={key_id},ts={ts},nonce={nonce},sig={sig}",
        },
        "body": raw,   # send exactly this
    }
```

```csharp
using System.Security.Cryptography;
using System.Text;

static (string Authorization, string Body) Sign(string method, string path, string? json, string keyId, string secret)
{
    var raw = json ?? "";
    var ts = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
    var nonce = Guid.NewGuid().ToString();
    var bodyHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw))).ToLowerInvariant();

    var canonical = string.Join("\n", method.ToUpperInvariant(), path, ts, nonce, bodyHash);
    using var mac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
    var sig = Convert.ToHexString(mac.ComputeHash(Encoding.UTF8.GetBytes(canonical))).ToLowerInvariant();

    return ($"Loyalty-HMAC publishableKeyId={keyId},ts={ts},nonce={nonce},sig={sig}", raw);
}
```

## Clock skew and replay

Requests are rejected if `ts` is more than **±5 minutes** from server time. Keep the register’s clock synchronised; a drifting clock presents as every request failing with `401`.

Each nonce may be used once within that window. Retrying a failed request requires a **new** `ts` and `nonce`, and because the timestamp is signed, a new signature. Safe retries are handled by idempotency keys, not by resending identical bytes. See [Idempotency and retries](/idempotency).

## Verifying your implementation

`GET /terminal/diagnostics/ping` requires a valid signature and changes nothing. Use it to confirm signing before touching a balance, including with a request that has a body once you get to `POST`.

```json
{ "ok": true, "brandId": "019fc6d1-…", "actor": { "type": "terminal", "id": "019fc6d1-…", "onBehalfOf": null } }
```

It also tells you which brand and terminal your key is scoped to. Check it before a fleet rollout, in case two tills were handed the same key.

## The four common mistakes

A `401` on ping is almost always one of these:

1. Signing the path without the `/v1` prefix.
2. Including the query string in the signed path.
3. Re-serializing the JSON body after hashing it.
4. Sending `ts` in milliseconds instead of seconds.

## Rotation

Exactly one secret is valid per register at a time. Issuing a new key revokes the previous one immediately, so plan a rotation as a brief coordinated switch per register, and tell Partners Points before you need one so it can be scheduled with you.
