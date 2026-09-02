#!/usr/bin/env python3
"""End-to-end proof of the hosted MCP OAuth loop (the mcp-kit release gate).

Walks: discovery 401 -> RFC 9728 + 8414 documents -> dynamic registration ->
consent approval (as the browser-suite member, whose session is minted from
the darabiha-session-secret Keychain item exactly like the Playwright suite)
-> PKCE token exchange -> MCP initialize -> tools/list -> a real read.

Usage: python3 scripts/test-oauth-mcp-loop.py [origin]   (default production)
Cleanup: registered clients and tokens are rows in oauth_clients /
agent_tokens named "loop-test"; they are inert and expire, but can be
deleted by client_name if tidiness matters.
"""
import base64, hashlib, json, os, secrets, subprocess, sys, time, hmac
import urllib.request, urllib.parse, urllib.error

ORIGIN = sys.argv[1] if len(sys.argv) > 1 else "https://darabiha.com"
REDIRECT = "http://localhost:43117/callback"

def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")

def header(headers, name):
    return next((value for key, value in headers.items() if key.lower() == name.lower()), "")

UA = "darabiha-mcp-loop-test/1.0 (+https://darabiha.com)"

def fetch(url, method="GET", data=None, headers=None, allow_redirect=True):
    req = urllib.request.Request(url, data=data, method=method, headers={"user-agent": UA, **(headers or {})})
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor() if allow_redirect else NoRedirect())
    try:
        with opener.open(req, timeout=30) as response:
            return response.status, dict(response.headers), response.read()
    except urllib.error.HTTPError as error:
        return error.code, dict(error.headers), error.read()

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def session_cookie() -> str:
    # LOOP_SESSION_SECRET/LOOP_MEMBER_EMAIL point at a local dev Worker
    # (.dev.vars); without them the production browser-suite member is used.
    secret = os.environ.get("LOOP_SESSION_SECRET") or subprocess.run(
        ["security", "find-generic-password", "-s", "darabiha-session-secret", "-w"],
        capture_output=True, text=True, check=True).stdout.strip()
    email = os.environ.get("LOOP_MEMBER_EMAIL", "browser-suite@darabiha.com")
    payload = b64url(json.dumps({"subject": "loop-test", "email": email,
                                 "displayName": "Loop test", "exp": int(time.time()) + 3600}).encode())
    signature = b64url(hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest())
    return f"darabiha_session={payload}.{signature}"

def step(name, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {name}{'  ' + detail if detail else ''}")
    if not ok:
        sys.exit(1)

# 1. tokenless MCP call: 401 with resource_metadata pointer
status, headers, _ = fetch(f"{ORIGIN}/api/mcp", method="POST", data=b"{}", headers={"content-type": "application/json"})
step("tokenless 401", status == 401 and "oauth-protected-resource" in header(headers, "www-authenticate"))

# 2. discovery documents (both RFC 9728 forms + RFC 8414 + mcp.json)
for path in ("/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/api/mcp",
             "/.well-known/oauth-authorization-server", "/.well-known/mcp.json"):
    status, headers, body = fetch(ORIGIN + path)
    document = json.loads(body)
    step(f"discovery {path}", status == 200 and header(headers, "access-control-allow-origin") == "*")
meta = json.loads(fetch(f"{ORIGIN}/.well-known/oauth-authorization-server")[2])

# 3. dynamic client registration
status, _, body = fetch(meta["registration_endpoint"], method="POST",
                        data=json.dumps({"client_name": "loop-test", "redirect_uris": [REDIRECT]}).encode(),
                        headers={"content-type": "application/json"})
registration = json.loads(body)
step("dynamic registration", status == 201 and bool(registration.get("client_id")))
client_id = registration["client_id"]

# 4. consent approval as a signed-in member (form POST, no browser)
verifier = b64url(secrets.token_bytes(48))[:64]
challenge = b64url(hashlib.sha256(verifier.encode()).digest())
form = urllib.parse.urlencode({"client_id": client_id, "redirect_uri": REDIRECT,
                               "code_challenge": challenge, "scope": "read", "state": "loop-state",
                               "decision": "approve"}).encode()
request = urllib.request.Request(f"{ORIGIN}/oauth/authorize/approve", data=form, method="POST",
                                 headers={"content-type": "application/x-www-form-urlencoded",
                                          "origin": ORIGIN, "cookie": session_cookie(), "user-agent": UA})
opener = urllib.request.build_opener(NoRedirect())
try:
    response = opener.open(request, timeout=30)
    status, location = response.status, response.headers.get("Location", "")
except urllib.error.HTTPError as error:
    status, location = error.code, error.headers.get("Location", "")
query = urllib.parse.parse_qs(urllib.parse.urlparse(location).query)
step("consent approval", status == 302 and "code" in query and query.get("state") == ["loop-state"],
     f"status={status}" if status != 302 else "")
code = query["code"][0]

# 5. PKCE token exchange
status, _, body = fetch(meta["token_endpoint"], method="POST",
                        data=urllib.parse.urlencode({"grant_type": "authorization_code", "code": code,
                                                     "client_id": client_id, "redirect_uri": REDIRECT,
                                                     "code_verifier": verifier}).encode(),
                        headers={"content-type": "application/x-www-form-urlencoded"})
token = json.loads(body)
step("token exchange", status == 200 and token.get("token_type") == "Bearer")
auth = {"authorization": f"Bearer {token['access_token']}", "content-type": "application/json"}

# 5b. a replayed code must be rejected
status, _, _ = fetch(meta["token_endpoint"], method="POST",
                     data=urllib.parse.urlencode({"grant_type": "authorization_code", "code": code,
                                                  "client_id": client_id, "redirect_uri": REDIRECT,
                                                  "code_verifier": verifier}).encode(),
                     headers={"content-type": "application/x-www-form-urlencoded"})
step("code replay rejected", status == 400)

def rpc(method, params=None, id=1):
    message = {"jsonrpc": "2.0", "id": id, "method": method}
    if params is not None:
        message["params"] = params
    status, _, body = fetch(f"{ORIGIN}/api/mcp", method="POST", data=json.dumps(message).encode(), headers=auth)
    return status, json.loads(body)

# 6. MCP initialize + tools/list + a real read
status, initialized = rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "loop-test", "version": "0"}})
step("mcp initialize", status == 200 and "serverInfo" in initialized.get("result", {}))
status, tools = rpc("tools/list")
names = sorted(tool["name"] for tool in tools["result"]["tools"])
step("tool registry", names == ["find_person", "list_stories", "person_record", "relationship_path", "story", "tree_summary"], str(names))
status, summary = rpc("tools/call", {"name": "tree_summary", "arguments": {}})
text = summary["result"]["content"][0]["text"]
step("tree_summary read", status == 200 and "people" in text, text.splitlines()[0][:90])
status, found = rpc("tools/call", {"name": "find_person", "arguments": {"query": "zzz-no-such-person"}})
step("graceful empty find", status == 200 and "No person matching" in found["result"]["content"][0]["text"])

print("\nAll steps passed.")
