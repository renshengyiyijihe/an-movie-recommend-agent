#!/usr/bin/env python3
"""Which compose services need an image rebuild because `build:` / `image:` changed.

The deploy host is CPython 3.6. Do not use 3.7+ subprocess kwargs
(`capture_output`, `text=`); CI Ubuntu will not catch that.
"""
import subprocess
import sys

BUILT = (
    "packages",
    "auth-service",
    "movie-service",
    "message-service",
    "frontend",
)
IMAGE_KEYS = frozenset({"build", "image"})


def git_show(sha, path):
    proc = subprocess.run(
        ["git", "show", "%s:%s" % (sha, path)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        universal_newlines=True,
    )
    if proc.returncode != 0:
        return ""
    return proc.stdout


def parse_service_bodies(text):
    services = {}
    in_services = False
    name = None
    body = []

    def flush():
        nonlocal name, body
        if name is not None:
            services[name] = body
        name = None
        body = []

    for raw in text.splitlines():
        if not in_services:
            if raw.startswith("services:"):
                in_services = True
            continue
        if raw.strip() and not raw.startswith((" ", "\t", "#")):
            break
        indent = len(raw) - len(raw.lstrip(" "))
        stripped = raw.strip()
        if (
            indent == 2
            and stripped
            and not stripped.startswith("#")
            and stripped.endswith(":")
            and " " not in stripped[:-1]
        ):
            flush()
            name = stripped[:-1]
            continue
        if name is not None:
            body.append(raw)
    flush()
    return services


def fingerprint(body_lines):
    captured = []
    capturing = False
    key_indent = None
    for raw in body_lines:
        stripped = raw.strip()
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(raw) - len(raw.lstrip(" "))
        if capturing:
            if key_indent is not None and indent > key_indent:
                captured.append(stripped)
                continue
            capturing = False
            key_indent = None
        if indent == 4 and ":" in stripped:
            key = stripped.split(":", 1)[0]
            if key in IMAGE_KEYS:
                capturing = True
                key_indent = indent
                captured.append(stripped)
    return "\n".join(captured)


def changed_services(old_text, new_text):
    old = parse_service_bodies(old_text)
    new = parse_service_bodies(new_text)
    return [
        svc
        for svc in BUILT
        if fingerprint(old.get(svc, [])) != fingerprint(new.get(svc, []))
    ]


def changed_between_commits(last_sha, current_sha):
    return changed_services(
        git_show(last_sha, "docker-compose.yml"),
        git_show(current_sha, "docker-compose.yml"),
    )


_MINIMAL = """services:
  packages:
    image: an-movie-packages
    build:
      context: .
      dockerfile: packages/Dockerfile
  auth-service:
    build:
      context: .
      dockerfile: backend/auth-service/Dockerfile
      args:
        PACKAGES_IMAGE: an-movie-packages
    environment:
      PORT: 3002
  movie-service:
    build:
      context: .
      dockerfile: backend/movie-service/Dockerfile
      args:
        PACKAGES_IMAGE: an-movie-packages
  message-service:
    build:
      context: .
      dockerfile: backend/message-service/Dockerfile
      args:
        PACKAGES_IMAGE: an-movie-packages
  frontend:
    build:
      context: .
      dockerfile: client/Dockerfile
      args:
        VITE_API_BASE_URL: /
        PACKAGES_IMAGE: an-movie-packages
  grafana:
    image: grafana/grafana:13.2.0
    environment:
      GF_USERS_ALLOW_SIGN_UP: "false"
"""


def _self_test():
    failures = []

    def check(name, old, new, expected):
        got = changed_services(old, new)
        if got != expected:
            failures.append("%s: expected %s got %s" % (name, expected, got))

    grafana = _MINIMAL.replace(
        'GF_USERS_ALLOW_SIGN_UP: "false"',
        'GF_USERS_ALLOW_SIGN_UP: "false"\n      GF_SECURITY_ADMIN_USER: admin\n      GF_SECURITY_ADMIN_PASSWORD: x',
    )
    check("grafana env only", _MINIMAL, grafana, [])

    auth_env = _MINIMAL.replace(
        "      PORT: 3002",
        "      PORT: 3002\n      JWT_EXPIRES_IN: 7d",
    )
    check("auth env only", _MINIMAL, auth_env, [])

    vite = _MINIMAL.replace("VITE_API_BASE_URL: /", "VITE_API_BASE_URL: /api")
    check("frontend build args", _MINIMAL, vite, ["frontend"])

    packages_df = _MINIMAL.replace(
        "dockerfile: packages/Dockerfile",
        "dockerfile: packages/Dockerfile.alt",
    )
    check("packages dockerfile", _MINIMAL, packages_df, ["packages"])

    auth_df = _MINIMAL.replace(
        "dockerfile: backend/auth-service/Dockerfile",
        "dockerfile: backend/auth-service/Dockerfile.alt",
    )
    check("auth dockerfile", _MINIMAL, auth_df, ["auth-service"])

    if failures:
        sys.stderr.write("compose-image-targets self-test failed:\n")
        sys.stderr.write("\n".join(failures) + "\n")
        sys.exit(1)
    sys.stderr.write("compose-image-targets self-test ok\n")


def main():
    if len(sys.argv) == 2 and sys.argv[1] == "--self-test":
        _self_test()
        return
    if len(sys.argv) != 3:
        sys.stderr.write("usage: compose-image-targets.py LAST_SHA CURRENT_SHA\n")
        sys.exit(2)
    sys.stdout.write(" ".join(changed_between_commits(sys.argv[1], sys.argv[2])))


if __name__ == "__main__":
    main()
