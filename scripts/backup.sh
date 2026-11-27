#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_ROOT="$HOME/SMART_GATE_BACKUPS"
STAMP="$(date +%Y%m%d_%H%M%S)"
DEST="$BACKUP_ROOT/full_$STAMP"

cd "$ROOT"

mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"
mkdir "$DEST"

echo "Backup directory: $DEST"

echo "===== DATABASE BACKUP ====="

docker exec smartgate_db sh -c '
MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump \
-u root \
--single-transaction \
--quick \
--no-tablespaces \
--set-gtid-purged=OFF \
--routines \
--triggers \
--events \
--databases smart_gate
' | gzip > "$DEST/database.sql.gz"

gzip -t "$DEST/database.sql.gz"

echo "Database backup: PASS"

echo "===== EVIDENCE BACKUP ====="

docker exec smartgate_server \
tar -C /app/storage/evidence -czf - . \
> "$DEST/evidence.tar.gz"

tar -tzf "$DEST/evidence.tar.gz" >/dev/null

echo "Evidence backup: PASS"

echo "===== SOURCE BACKUP ====="

git ls-files --cached --others --exclude-standard -z \
| tar --null --verbatim-files-from \
-T - -czf "$DEST/source.tar.gz"

tar -tzf "$DEST/source.tar.gz" >/dev/null

git rev-parse HEAD > "$DEST/git-commit.txt"
git status --short > "$DEST/git-status.txt"

echo "Source backup: PASS"

echo "===== DOCKER CONFIGURATION ====="

docker compose \
-f docker-compose.yml \
-f compose.smartgate.override.yaml \
config > "$DEST/compose-resolved.yaml"

docker inspect \
smartgate_db \
smartgate_server \
smartgate_frontend \
smartgate_ai \
smartgate_mqtt \
smartgate_pma \
> "$DEST/containers.json"

echo "Docker configuration: PASS"

echo "===== PRIVATE CONFIGURATION ====="

if [ -d "$HOME/SMART_GATE_SECRETS" ]; then
    sudo tar \
    --exclude='.venv' \
    --exclude='__pycache__' \
    -C "$HOME" \
    -czf - \
    SMART_GATE_SECRETS > "$DEST/secrets.tar.gz"

    tar -tzf "$DEST/secrets.tar.gz" >/dev/null

    echo "Private secrets backup: PASS"
fi

python3 - "$ROOT" "$DEST" <<'PY'
import sys
import tarfile
from pathlib import Path

root = Path(sys.argv[1])
dest = Path(sys.argv[2])

excluded = {
    '.git', 'node_modules', '.venv',
    '__pycache__', 'data', 'dist'
}

count = 0

with tarfile.open(dest / 'private-config.tar.gz', 'w:gz') as archive:
    for path in root.rglob('*'):
        rel = path.relative_to(root)

        if any(p in excluded for p in rel.parts):
            continue

        if not path.is_file() or path.is_symlink():
            continue

        name = path.name

        if (
            name == '.env'
            or name.startswith('.env.')
            or name.startswith('.smartgate_ai')
            or name == 'config.h'
        ):
            archive.add(path, arcname=str(rel))
            count += 1

print(f'Private configuration files backed up: {count}')
PY

echo "===== CHECKSUM GENERATION ====="

(
    cd "$DEST"
    sha256sum -- * > SHA256SUMS
    sha256sum -c SHA256SUMS
)

echo "===== BACKUP SIZE ====="

du -sh "$DEST"
ls -lh "$DEST"

echo "===== BACKUP COMPLETE ====="
echo "$DEST"
