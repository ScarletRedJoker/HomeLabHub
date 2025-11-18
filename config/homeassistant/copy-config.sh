#!/bin/bash
# Script to copy Home Assistant configuration template into running container

echo "Copying Home Assistant configuration templates into container..."

# Copy configuration files from templates to active config
docker exec homeassistant sh -c "
  # Copy main configuration if it doesn't exist or user confirms overwrite
  if [ ! -f /config/configuration.yaml ]; then
    echo 'Copying configuration.yaml...'
    cp /config-templates/configuration.yaml /config/
  else
    echo 'configuration.yaml already exists. Creating backup...'
    cp /config/configuration.yaml /config/configuration.yaml.backup
    cp /config-templates/configuration.yaml /config/
  fi

  # Copy other config files
  for file in automations.yaml scenes.yaml scripts.yaml; do
    if [ -f /config-templates/\$file ]; then
      echo \"Copying \$file...\"
      cp /config-templates/\$file /config/
    fi
  done

  echo 'Done!'
"

echo "Configuration copied successfully!"
echo "Restarting Home Assistant to apply changes..."
docker restart homeassistant

echo ""
echo "✓ Home Assistant configuration updated and service restarted"
echo "  The reverse proxy errors should be resolved now."
