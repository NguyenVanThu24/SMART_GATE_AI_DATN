#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/.." && pwd)"

cd "$ROOT"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;36m'
NC='\033[0m'

dc() {
    docker compose \
        -f "$ROOT/docker-compose.yml" \
        -f "$ROOT/compose.smartgate.override.yaml" \
        "$@"
}

banner() {
    echo
    echo -e "${BLUE}==========================================${NC}"
    echo -e "${BLUE}       SMART GATE AI - CONTROL CENTER${NC}"
    echo -e "${BLUE}==========================================${NC}"
    echo
}

check_docker() {
    if ! docker info >/dev/null 2>&1; then
        echo -e "${RED}Docker Engine is not running.${NC}"
        echo "Start Docker Desktop or Docker Engine first."
        exit 1
    fi
}

open_web() {
    echo "Website: http://localhost:5173"

    if command -v explorer.exe >/dev/null 2>&1; then
        explorer.exe "http://localhost:5173" \
            >/dev/null 2>&1 || true
    elif command -v xdg-open >/dev/null 2>&1; then
        xdg-open "http://localhost:5173" \
            >/dev/null 2>&1 || true
    fi
}

check_http() {
    local name="$1"
    local url="$2"

    if curl --max-time 5 -fsS "$url" >/dev/null 2>&1; then
        echo -e "${GREEN}[PASS]${NC} $name"
    else
        echo -e "${RED}[FAIL]${NC} $name"
        return 1
    fi
}

check_ai() {
    docker exec smartgate_server node -e '
    fetch("http://smartgate_ai:5000/health", {
        signal: AbortSignal.timeout(5000)
    })
    .then(async r => {
        if (!r.ok) process.exit(1);
        const data = await r.json();

        console.log("[PASS] AI Engine");
        console.log(
            "Camera:",
            data.camera_connected ? "CONNECTED" : "OFFLINE"
        );
    })
    .catch(() => process.exit(1));
    '
}

show_status() {
    echo "===== CONTAINER STATUS ====="

    for C in smartgate_db smartgate_server \
        smartgate_frontend smartgate_ai \
        smartgate_mqtt smartgate_pma; do

        docker inspect "$C" --format \
        '{{.Name}} | {{.State.Status}} | {{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' \
        2>/dev/null || echo "$C | NOT FOUND"

    done

    echo
    echo "===== SERVICE HEALTH ====="

    check_http "Backend API" \
        "http://localhost:3000/health" || true

    check_http "Frontend Website" \
        "http://localhost:5173" || true

    check_http "phpMyAdmin" \
        "http://localhost:8081" || true

    check_ai || echo -e "${RED}[FAIL] AI Engine${NC}"

    echo
    echo "===== RESOURCE USAGE ====="

    docker stats --no-stream \
        --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}'

    echo
    echo "===== ACCESS URLS ====="
    echo "Website:    http://localhost:5173"
    echo "Backend:    http://localhost:3000"
    echo "phpMyAdmin: http://localhost:8081"
    echo "AI Engine:  Docker internal network"
}

start_system() {
    check_docker

    echo "===== START COMPOSE SERVICES ====="

    dc up -d --no-build --wait --wait-timeout 180 \
        db mqtt server frontend phpmyadmin

    echo "===== START AI ENGINE ====="

    if ! docker inspect smartgate_ai >/dev/null 2>&1; then
        echo -e "${RED}AI container not found.${NC}"
        echo "Restore the preserved AI container first."
        exit 1
    fi

    if [ "$(docker inspect smartgate_ai \
        --format '{{.State.Running}}')" != "true" ]; then

        docker start smartgate_ai
    fi

    echo "===== WAIT FOR AI ENGINE ====="

    READY=0

    for i in $(seq 1 45); do
        if check_ai 2>/dev/null; then
            READY=1
            break
        fi
        sleep 2
    done

    if [ "$READY" -ne 1 ]; then
        echo -e "${RED}AI Engine startup timeout.${NC}"
        exit 1
    fi

    echo "===== VERIFY SERVICES ====="

    check_http "Backend API" \
        "http://localhost:3000/health"

    check_http "Frontend Website" \
        "http://localhost:5173"

    check_http "phpMyAdmin" \
        "http://localhost:8081"

    if [ -n "$(docker port smartgate_ai)" ]; then
        echo -e "${RED}AI port is unexpectedly published.${NC}"
        exit 1
    fi

    echo -e "${GREEN}SMART GATE AI IS READY${NC}"

    open_web
}

stop_system() {
    check_docker

    echo "===== STOP AI ENGINE ====="
    docker stop -t 30 smartgate_ai

    echo "===== STOP COMPOSE SERVICES ====="
    dc stop -t 30 frontend server phpmyadmin mqtt db

    echo -e "${GREEN}System stopped. Data preserved.${NC}"
}

banner

case "${1:-status}" in

    start)
        start_system
        ;;

    stop)
        stop_system
        ;;

    restart)
        stop_system
        start_system
        ;;

    status)
        check_docker
        show_status
        ;;

    logs)
        check_docker
        echo "===== BACKEND LOGS ====="
        docker logs --tail 30 smartgate_server 2>&1

        echo
        echo "===== AI LOGS ====="
        docker logs --tail 30 smartgate_ai 2>&1 \
            | sed -E 's#rtsp://[^[:space:]]+#rtsp://[REDACTED]#g'
        ;;

    backup)
        check_docker
        bash "$ROOT/scripts/backup.sh"
        ;;

    open)
        open_web
        ;;

    *)
        echo "Usage:"
        echo "  smartgate.sh start"
        echo "  smartgate.sh stop"
        echo "  smartgate.sh restart"
        echo "  smartgate.sh status"
        echo "  smartgate.sh logs"
        echo "  smartgate.sh backup"
        echo "  smartgate.sh open"
        exit 1
        ;;
esac
