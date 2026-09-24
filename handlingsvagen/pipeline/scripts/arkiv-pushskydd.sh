#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ] || [ -z "$1" ] || [ -z "$2" ]; then
  echo "Arkivskyddet kräver start- och huvudgrensrevision." >&2
  exit 1
fi

if ! git diff --quiet "$1" "$2" -- ':(top)handlingsvagen/data/arkiv.json'; then
  echo "Arkivfilen ändrades på huvudgrenen sedan körningen började. Kör om från färsk huvudgren." >&2
  exit 1
fi
