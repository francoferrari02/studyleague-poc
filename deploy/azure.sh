#!/usr/bin/env bash
# Deploy de la PoC en una VM de Azure (una sola máquina con Docker Compose + Caddy).
#
#   ./deploy/azure.sh up        Crea la VM si no existe (o la prende si estaba apagada),
#                               copia el proyecto y levanta todo. También sirve para actualizar.
#   ./deploy/azure.sh down      Apaga y desasigna la VM: deja de cobrarse el cómputo.
#   ./deploy/azure.sh estado    Muestra si está prendida y la URL.
#   ./deploy/azure.sh ssh [cmd] Abre una sesión en la VM, o corre cmd dentro del proyecto.
#                               Ej.: ./deploy/azure.sh ssh bash scripts/demo-reset.sh
#   ./deploy/azure.sh destruir  Borra TODO el grupo de recursos (VM, disco, IP). No se puede deshacer.
#
# Requiere: Azure CLI con sesión iniciada (az login), ssh y rsync.
# La primera vez pide la clave del basic auth para la cátedra (usuario: catedra).
set -euo pipefail

RG=${RG:-studyleague-tpif}
# Azure for Students solo permite algunas regiones (az policy assignment list las muestra).
# Chile Central es la permitida más cercana a Buenos Aires.
LOCATION=${LOCATION:-chilecentral}
VM=${VM:-studyleague-vm}
SIZE=${SIZE:-Standard_B2als_v2} # 2 vCPU, 4 GB (en Chile Central no se ofrece la B2s)
USUARIO=azureuser
DIR_REMOTO=studyleague
cd "$(dirname "$0")/.."

existe_vm() { az vm show -g "$RG" -n "$VM" -o none 2>/dev/null; }
estado_vm() { az vm show -d -g "$RG" -n "$VM" --query powerState -o tsv; }
host_vm() { az vm show -d -g "$RG" -n "$VM" --query fqdns -o tsv; }

crear_vm() {
  # El nombre DNS tiene que ser único en la región: se le agrega un sufijo de la suscripción.
  local dns=${DNS:-studyleague-$(az account show --query id -o tsv | cut -c1-6)}
  echo "Creando $VM ($SIZE) en $LOCATION..."
  # El grupo es solo un contenedor: si ya existe (en otra región) se reutiliza.
  az group show -n "$RG" -o none 2>/dev/null || az group create -n "$RG" -l "$LOCATION" -o none
  az vm create -g "$RG" -n "$VM" -l "$LOCATION" --image Ubuntu2404 --size "$SIZE" \
    --admin-username "$USUARIO" --generate-ssh-keys \
    --storage-sku StandardSSD_LRS \
    --public-ip-sku Standard --public-ip-address-dns-name "$dns" \
    --custom-data deploy/cloud-init.yaml -o none
  az vm open-port -g "$RG" -n "$VM" --port 80 --priority 900 -o none
  az vm open-port -g "$RG" -n "$VM" --port 443 --priority 901 -o none
  # Sin apagado automático: en Chile Central Azure no ofrece el recurso de auto-shutdown.
  # La VM prendida cuesta ~USD 1 por día: apagarla con `down` al terminar.
}

cmd_up() {
  if ! existe_vm; then
    crear_vm
  elif [ "$(estado_vm)" != "VM running" ]; then
    echo "Prendiendo $VM..."
    az vm start -g "$RG" -n "$VM" -o none
  fi

  local host; host=$(host_vm)
  until ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "$USUARIO@$host" docker info >/dev/null 2>&1; do
    echo "Esperando a que la VM tenga Docker listo (la primera vez tarda unos minutos)..."; sleep 15
  done

  # Copia el clon local tal cual (incluye cambios sin commitear). docs-local es interno y no se sube.
  # El .env de la VM se excluye: rsync --delete no lo toca.
  rsync -az --delete \
    --exclude node_modules --exclude dist --exclude .git --exclude .env --exclude .env.bak \
    --exclude docs-local --exclude .verificacion --exclude .tmp-mockups --exclude .npm-cache \
    ./ "$USUARIO@$host:$DIR_REMOTO/"

  # El .env de la VM se genera una sola vez, con secretos propios que no salen de la VM.
  if ! ssh "$USUARIO@$host" "test -f $DIR_REMOTO/.env"; then
    local clave="${BASIC_AUTH_PASS:-}"
    if [ -z "$clave" ]; then
      read -rsp "Clave del basic auth para la cátedra (usuario 'catedra'): " clave; echo
    fi
    [ -n "$clave" ] || { echo "La clave no puede estar vacía"; exit 1; }
    # La clave viaja por stdin, no queda en el historial local.
    printf '%s\n' "$clave" | ssh "$USUARIO@$host" "cd $DIR_REMOTO && read -r CLAVE && \
      HASH=\$(docker run --rm caddy:2.11.7 caddy hash-password --plaintext \"\$CLAVE\") && \
      umask 077 && cat > .env <<ENV
POSTGRES_PASSWORD=\$(openssl rand -hex 16)
JWT_SECRET=\$(openssl rand -hex 32)
DOMINIO=$host
BASIC_AUTH_USER=catedra
BASIC_AUTH_HASH='\$HASH'
COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml
ENV
"
    echo ".env creado en la VM."
  fi

  # Caddy se reinicia para tomar un Caddyfile nuevo (rsync reemplaza el archivo montado).
  # Las herramientas (perfil tools) no se reconstruyen con `up --build`: se construyen aparte.
  echo "Construyendo y levantando (la primera vez tarda ~10 minutos)..."
  ssh "$USUARIO@$host" "cd $DIR_REMOTO && docker compose up -d --build --remove-orphans && docker compose --profile tools build seed-ranking simulador >/dev/null && docker compose restart caddy >/dev/null && docker compose ps"
  echo
  echo "Listo: https://$host  (Swagger: /api/docs · Kafka UI: /kafka-ui)"
  echo "Para no gastar crédito: ./deploy/azure.sh down"
}

cmd_down() {
  existe_vm || { echo "No existe la VM $VM en $RG"; exit 0; }
  echo "Apagando y desasignando $VM (deja de cobrarse el cómputo; disco e IP siguen, centavos por día)..."
  az vm deallocate -g "$RG" -n "$VM" -o none
  echo "Apagada. Para volver: ./deploy/azure.sh up"
}

cmd_estado() {
  existe_vm || { echo "No existe la VM $VM en $RG"; exit 0; }
  echo "$(estado_vm) · https://$(host_vm)"
}

cmd_ssh() {
  local host; host=$(host_vm)
  if [ $# -eq 0 ]; then ssh "$USUARIO@$host"; else ssh "$USUARIO@$host" "cd $DIR_REMOTO && $*"; fi
}

cmd_destruir() {
  read -rp "Esto borra la VM, el disco y la IP de '$RG' sin vuelta atrás. Escribí el nombre del grupo para confirmar: " ok
  [ "$ok" = "$RG" ] || { echo "Cancelado."; exit 1; }
  az group delete -n "$RG" --yes --no-wait
  echo "Borrado en curso."
}

case "${1:-}" in
  up) cmd_up ;;
  down) cmd_down ;;
  estado) cmd_estado ;;
  ssh) shift; cmd_ssh "$@" ;;
  destruir) cmd_destruir ;;
  *) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
