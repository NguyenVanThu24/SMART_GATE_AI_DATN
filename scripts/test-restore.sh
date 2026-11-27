#!/usr/bin/env bash
set -euo pipefail
umask 077

BACKUP="${1:?Usage: test-restore.sh BACKUP_DIRECTORY}"

test -d "$BACKUP"
test -f "$BACKUP/SHA256SUMS"

BACKUP="$(realpath "$BACKUP")"

echo "Backup: $BACKUP"

echo "===== VERIFY CHECKSUMS ====="

(
    cd "$BACKUP"
    sha256sum -c SHA256SUMS
)

echo "===== CREATE ISOLATED MYSQL ====="

TEST="smartgate_restore_test_$(date +%s)_$$"
VOL="${TEST}_data"
WORK=$(mktemp -d)
IMAGE=$(docker inspect smartgate_db --format '{{.Image}}')

cleanup() {
    docker rm -f "$TEST" >/dev/null 2>&1 || true
    docker volume rm "$VOL" >/dev/null 2>&1 || true
    rm -rf -- "$WORK"
}

trap cleanup EXIT

PASSWORD=$(python3 -c 'import secrets; print(secrets.token_hex(24))')

printf 'MYSQL_ROOT_PASSWORD=%s\n' "$PASSWORD" \
> "$WORK/mysql.env"

docker volume create "$VOL" >/dev/null

docker run -d \
--name "$TEST" \
--network none \
--restart=no \
--env-file "$WORK/mysql.env" \
-v "$VOL:/var/lib/mysql" \
"$IMAGE" >/dev/null

echo "Temporary MySQL: CREATED"

restore_mysql() {
    docker exec -i "$TEST" sh -c '
    MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql \
    --default-character-set=utf8mb4 -u root "$@"
    ' sh "$@"
}

echo "===== WAIT FOR MYSQL ====="

READY=0

for i in $(seq 1 90); do
    if docker logs "$TEST" 2>&1 \
        | grep 'MySQL init process done' >/dev/null \
        && restore_mysql -Nse 'SELECT 1' >/dev/null 2>&1; then

        READY=1
        break
    fi

    sleep 2
done

if [ "$READY" -ne 1 ]; then
    echo "FAIL: Temporary MySQL startup timeout"
    exit 1
fi

echo "Temporary MySQL: READY"

echo "===== RESTORE DATABASE ====="

gzip -dc "$BACKUP/database.sql.gz" \
| restore_mysql

echo "Database restore: PASS"

echo "===== RESTORED TABLES ====="

restore_mysql smart_gate -e 'SHOW TABLES;'

echo "===== RECORD COUNTS ====="

restore_mysql smart_gate -e '
SELECT "accounts" AS table_name, COUNT(*) AS records FROM accounts
UNION ALL
SELECT "employees", COUNT(*) FROM employees
UNION ALL
SELECT "departments", COUNT(*) FROM departments
UNION ALL
SELECT "vehicles", COUNT(*) FROM vehicles
UNION ALL
SELECT "visitors", COUNT(*) FROM visitors
UNION ALL
SELECT "gates", COUNT(*) FROM gates
UNION ALL
SELECT "access_logs", COUNT(*) FROM access_logs
UNION ALL
SELECT "barrier_events", COUNT(*) FROM barrier_events;
'

echo "===== DATABASE INTEGRITY ====="

CHECK_RESULT=$(restore_mysql -BN smart_gate -e '
CHECK TABLE
    accounts,
    employees,
    departments,
    vehicles,
    visitors,
    gates,
    access_logs,
    barrier_events;
')

echo "$CHECK_RESULT"

python3 - "$CHECK_RESULT" <<'CHECKPY'
import sys

rows = sys.argv[1].splitlines()

ok = 0
bad = 0

for row in rows:
    fields = row.split()

    if len(fields) >= 4:
        if fields[2] == "status" and fields[3] == "OK":
            ok += 1
        elif fields[2] in ("error", "warning"):
            bad += 1

print(f"Valid tables: {ok}/8")
print(f"Errors or warnings: {bad}")

if ok != 8 or bad:
    sys.exit(1)
CHECKPY

echo "Database integrity: PASS (8/8 tables)"

echo "===== VERIFY UNIQUE EVENT INDEX ====="

restore_mysql smart_gate -e '
SHOW INDEX FROM access_logs
WHERE Key_name = "uq_access_logs_event_id";
'

echo "===== VERIFY EVIDENCE RESTORE ====="

mkdir -p "$WORK/evidence"

tar -xzf "$BACKUP/evidence.tar.gz" \
-C "$WORK/evidence"

restore_mysql -BN smart_gate -e '
SELECT image_path FROM access_logs
WHERE image_path IS NOT NULL AND image_path <> ""
UNION ALL
SELECT plate_image_path FROM access_logs
WHERE plate_image_path IS NOT NULL AND plate_image_path <> "";
' > "$WORK/evidence-paths.txt"

python3 - "$WORK" <<'PY'
import sys
from pathlib import Path

work = Path(sys.argv[1])
root = work / 'evidence'

files = [p for p in root.rglob('*') if p.is_file()]
relative = {p.relative_to(root).as_posix(): p for p in files}

paths = set(
    (work / 'evidence-paths.txt').read_text().splitlines()
)

matched = 0
missing = 0
invalid = 0

for raw in sorted(paths):
    path = raw.replace('\\', '/').lstrip('/')

    for prefix in (
        'app/storage/evidence/',
        'storage/evidence/',
        'evidence/'
    ):
        if path.startswith(prefix):
            path = path[len(prefix):]
            break

    file = relative.get(path)

    if file is None:
        missing += 1
        continue

    data = file.read_bytes()

    if not (
        len(data) >= 4
        and data.startswith(b'\xff\xd8')
        and data.endswith(b'\xff\xd9')
    ):
        invalid += 1
        continue

    matched += 1

print('Restored files:', len(files))
print('Database image references:', len(paths))
print('Matched JPEG files:', matched)
print('Missing or unmatched paths:', missing)
print('Invalid JPEG markers:', invalid)

if missing or invalid:
    print('Evidence verification: NEEDS REVIEW')
    sys.exit(1)

print('Evidence verification: PASS')
PY

echo "===== VERIFY OTHER ARCHIVES ====="

for FILE in source.tar.gz secrets.tar.gz private-config.tar.gz; do
    tar -tzf "$BACKUP/$FILE" >/dev/null
    echo "$FILE: PASS"
done

echo "===== REMOVE TEMPORARY RESOURCES ====="

cleanup
trap - EXIT

echo "Temporary restore resources removed"

echo "===== VERIFY PRODUCTION SYSTEM ====="

curl --max-time 5 -fsS \
http://localhost:3000/health

echo

curl --max-time 5 -fsS -o /dev/null \
-w 'Frontend HTTP: %{http_code}\n' \
http://localhost:5173

docker ps --format \
'table {{.Names}}\t{{.Status}}'

echo "===== RESTORE TEST COMPLETE ====="
