#!/bin/bash
# Execute command in Windows VM and get output reliably
# Usage: ./vm-exec.sh "command" [args...]

VM_NAME="${VM_NAME:-RDPWindows}"
CMD="$1"
shift
ARGS="$*"

if [ -z "$CMD" ]; then
    echo "Usage: $0 <command> [args...]"
    exit 1
fi

# Build JSON args array
if [ -n "$ARGS" ]; then
    JSON_ARGS=$(printf '%s\n' $ARGS | jq -R . | jq -s .)
    EXEC_JSON="{\"execute\":\"guest-exec\",\"arguments\":{\"path\":\"$CMD\",\"arg\":$JSON_ARGS,\"capture-output\":true}}"
else
    EXEC_JSON="{\"execute\":\"guest-exec\",\"arguments\":{\"path\":\"$CMD\",\"capture-output\":true}}"
fi

# Execute command
RESULT=$(virsh qemu-agent-command "$VM_NAME" "$EXEC_JSON" 2>&1)
if [ $? -ne 0 ]; then
    echo "Error executing command: $RESULT"
    exit 1
fi

PID=$(echo "$RESULT" | jq -r '.return.pid')
if [ -z "$PID" ] || [ "$PID" = "null" ]; then
    echo "Failed to get PID: $RESULT"
    exit 1
fi

# Wait for completion
for i in {1..30}; do
    STATUS=$(virsh qemu-agent-command "$VM_NAME" "{\"execute\":\"guest-exec-status\",\"arguments\":{\"pid\":$PID}}" 2>&1)
    EXITED=$(echo "$STATUS" | jq -r '.return.exited')
    if [ "$EXITED" = "true" ]; then
        break
    fi
    sleep 1
done

# Get output
EXITCODE=$(echo "$STATUS" | jq -r '.return.exitcode // "unknown"')
STDOUT=$(echo "$STATUS" | jq -r '.return["out-data"] // ""' | base64 -d 2>/dev/null)
STDERR=$(echo "$STATUS" | jq -r '.return["err-data"] // ""' | base64 -d 2>/dev/null)

echo "Exit code: $EXITCODE"
if [ -n "$STDOUT" ]; then
    echo "--- STDOUT ---"
    echo "$STDOUT"
fi
if [ -n "$STDERR" ]; then
    echo "--- STDERR ---"
    echo "$STDERR"
fi
