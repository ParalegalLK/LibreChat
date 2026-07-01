#!/usr/bin/env bash

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIBRECHAT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
APP_DIR="$(cd "${LIBRECHAT_DIR}/.." && pwd)"

OUTPUT_FILE="${1:-${APP_DIR}/user-lists.txt}"

echo "Exporting users to ${OUTPUT_FILE}"

docker compose -f "${LIBRECHAT_DIR}/docker-compose.yml" exec -T mongodb mongosh --quiet --eval '
const d = db.getSiblingDB("LibreChat");
const ex = ["admin@paralegal.lk", "elijah@paralegal.lk"];
d.users.find(
  {
    $and: [
      { email: { $nin: ex } },
      { email: { $not: /@desaram\.com$/i } },
    ],
  },
  { email: 1, name: 1, _id: 0 },
).sort({ email: 1 }).forEach((u) => print((u.email || "") + "\t" + (u.name || "")));
' > "${OUTPUT_FILE}"

echo "Done. Wrote $(wc -l < "${OUTPUT_FILE}") rows to ${OUTPUT_FILE}"